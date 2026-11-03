import { Router } from 'express';
import { z } from 'zod';
import { many, one, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { upload } from '../../middleware/upload.js';
import { loadEngagement, loadPeriod } from '../../middleware/scope.js';
import { checkUpload, saveFile, getFile, readFileData, softDeleteFile } from '../files/storage.js';

export const documentsRouter = Router();
documentsRouter.use(authenticate, requirePermission('clients.view'));

const DOC_TYPES = ['trial_balance', 'general_ledger', 'journal_entries', 'chart_of_accounts', 'receivables', 'payables', 'inventory', 'fixed_assets', 'bank_statement', 'financial_statements', 'invoice', 'contract', 'articles_of_association', 'commercial_registration', 'zakat_certificate', 'vat_certificate', 'municipal_license', 'partners_resolution', 'other', 'unknown'] as const;

documentsRouter.post('/upload', requirePermission('documents.upload'), upload.array('files', 5), async (req, res, next) => {
  try {
    const d = parse(z.object({ engagement_id: z.string().uuid(), period_id: z.string().uuid().optional().nullable(), document_type: z.enum(DOC_TYPES).default('unknown'), title: z.string().max(300).optional() }), req.body);
    const e = await loadEngagement(d.engagement_id);
    if (d.period_id) await loadPeriod(d.period_id, e.id);
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) throw badRequest('لم يُرفع أي ملف');
    const out: { id: string; file_id: string; name: string }[] = [];
    for (const f of files) {
      checkUpload('document', f.originalname, f.mimetype);
      const stored = await saveFile({ purpose: 'document', subdir: `uploads/${e.client_id}/${e.id}`, originalName: f.originalname, mime: f.mimetype, data: f.buffer, userId: req.user!.id });
      const doc = await one<{ id: string }>(`INSERT INTO source_documents (client_id, engagement_id, period_id, file_id, document_type, title, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [e.client_id, e.id, d.period_id ?? null, stored.id, d.document_type, d.title ?? f.originalname, req.user!.id]);
      await audit(req, { action: 'document.uploaded', entityType: 'source_document', entityId: doc!.id, clientId: e.client_id, details: { name: f.originalname, size: f.size, sha256: stored.sha256, type: d.document_type } });
      out.push({ id: doc!.id, file_id: stored.id, name: f.originalname });
    }
    res.status(201).json({ documents: out });
  } catch (e) { next(e); }
});

documentsRouter.get('/', async (req, res, next) => {
  try {
    const engagementId = typeof req.query.engagement_id === 'string' ? req.query.engagement_id : null;
    if (!engagementId) throw badRequest('engagement_id مطلوب');
    const rows = await many(`SELECT d.*, f.original_name, f.size_bytes, f.mime_type, f.sha256, u.full_name AS uploaded_by_name, p.label AS period_label
      FROM source_documents d JOIN stored_files f ON f.id = d.file_id LEFT JOIN users u ON u.id = d.uploaded_by LEFT JOIN financial_periods p ON p.id = d.period_id
      WHERE d.engagement_id = $1 AND d.deleted_at IS NULL ORDER BY d.uploaded_at DESC`, [engagementId]);
    res.json({ documents: rows });
  } catch (e) { next(e); }
});

documentsRouter.get('/:id/download', async (req, res, next) => {
  try {
    const d = await one<{ file_id: string; client_id: string }>('SELECT file_id, client_id FROM source_documents WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!d) throw notFound('المستند غير موجود');
    const f = await getFile(d.file_id);
    await audit(req, { action: 'document.downloaded', entityType: 'source_document', entityId: req.params.id as string, clientId: d.client_id });
    res.setHeader('Content-Type', f.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
    res.send(readFileData(f));
  } catch (e) { next(e); }
});

documentsRouter.patch('/:id', requirePermission('documents.upload'), async (req, res, next) => {
  try {
    const d = parse(z.object({ document_type: z.enum(DOC_TYPES).optional(), title: z.string().max(300).optional(), period_id: z.string().uuid().nullable().optional(), notes: z.string().max(5000).nullable().optional() }), req.body);
    const doc = await one<{ id: string; engagement_id: string; client_id: string }>('SELECT id, engagement_id, client_id FROM source_documents WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!doc) throw notFound('المستند غير موجود');
    if (d.period_id) await loadPeriod(d.period_id, doc.engagement_id);
    const keys = Object.keys(d) as (keyof typeof d)[];
    if (!keys.length) throw badRequest('لا توجد حقول');
    await query(`UPDATE source_documents SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [doc.id, ...keys.map((k) => d[k] ?? null)]);
    await audit(req, { action: 'document.updated', entityType: 'source_document', entityId: doc.id, clientId: doc.client_id, details: d });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** نقل مستند إلى شركة أخرى في نفس المجموعة (مثلًا ميزان رُفع على الشركة الخطأ) - قبل اعتماد أي استيراد منه */
documentsRouter.post('/:id/move', requirePermission('documents.upload'), async (req, res, next) => {
  try {
    const d = parse(z.object({ engagement_id: z.string().uuid() }), req.body);
    const doc = await one<{ id: string; engagement_id: string; period_id: string | null; title: string }>('SELECT id, engagement_id, period_id, title FROM source_documents WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!doc) throw notFound('المستند غير موجود');
    if (doc.engagement_id === d.engagement_id) { res.json({ ok: true }); return; }
    const rootOf = async (eid: string) => (await one<{ r: string }>('SELECT COALESCE(group_engagement_id, id) AS r FROM engagements WHERE id = $1', [eid]))?.r;
    const [a, b] = [await rootOf(doc.engagement_id), await rootOf(d.engagement_id)];
    if (!a || !b || a !== b) throw badRequest('النقل مسموح فقط بين شركات المجموعة نفسها (منعًا لخلط بيانات العملاء)');
    const jobs = await one<{ c: string }>(`SELECT count(*) AS c FROM import_jobs WHERE document_id = $1 AND status = 'committed'`, [doc.id]);
    if (Number(jobs?.c ?? 0) > 0) throw badRequest('اعتُمد استيراد من هذا المستند؛ احذف الاستيراد المعتمد أولًا (من شاشة الاستيراد) ثم انقل المستند');
    const target = await one<{ client_id: string }>('SELECT client_id FROM engagements WHERE id = $1', [d.engagement_id]);
    let periodId: string | null = null;
    if (doc.period_id) { const pr = await one<{ start_date: string; end_date: string }>('SELECT start_date::text AS start_date, end_date::text AS end_date FROM financial_periods WHERE id = $1', [doc.period_id]); if (pr) periodId = (await one<{ id: string }>('SELECT id FROM financial_periods WHERE engagement_id = $1 AND start_date = $2 AND end_date = $3', [d.engagement_id, pr.start_date, pr.end_date]))?.id ?? null; }
    await query(`DELETE FROM import_jobs WHERE document_id = $1 AND status <> 'committed'`, [doc.id]);
    await query('UPDATE source_documents SET engagement_id = $2, client_id = $3, period_id = $4 WHERE id = $1', [doc.id, d.engagement_id, target!.client_id, periodId]);
    await audit(req, { action: 'document.moved', entityType: 'source_document', entityId: doc.id, clientId: target!.client_id, details: { from: doc.engagement_id, to: d.engagement_id, title: doc.title } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

documentsRouter.delete('/:id', requirePermission('documents.delete'), async (req, res, next) => {
  try {
    const doc = await one<{ id: string; file_id: string; client_id: string }>('SELECT id, file_id, client_id FROM source_documents WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!doc) throw notFound('المستند غير موجود');
    const used = await one('SELECT 1 FROM import_jobs WHERE document_id = $1 AND status = $2 LIMIT 1', [doc.id, 'committed']);
    if (used) throw badRequest('لا يمكن حذف مستند تم اعتماد بياناته؛ المستندات الأصلية تُحفظ للتتبع');
    await query('UPDATE source_documents SET deleted_at = now() WHERE id = $1', [doc.id]);
    await softDeleteFile(doc.file_id);
    await audit(req, { action: 'document.deleted', entityType: 'source_document', entityId: doc.id, clientId: doc.client_id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
