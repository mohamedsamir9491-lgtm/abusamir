import { Router } from 'express';
import { z } from 'zod';
import { many, one, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { createImportJob, previewJob, updateMapping, validateJob, commitJob, listRecords, getJob } from './service.js';
import { OFFICIAL_TYPES } from '../official/routes.js';
import { FIELDS, DATA_TYPES, DATA_TYPE_LABELS } from './fields.js';

export const importsRouter = Router();
importsRouter.use(authenticate, requirePermission('clients.view'));

importsRouter.get('/data-types', (_req, res) => {
  res.json({ data_types: DATA_TYPES.map((t) => ({ code: t, label_ar: DATA_TYPE_LABELS[t], fields: FIELDS[t].map((f) => ({ key: f.key, label_ar: f.label_ar, type: f.type, required: !!f.required })) })) });
});

importsRouter.get('/', async (req, res, next) => {
  try {
    const engagementId = typeof req.query.engagement_id === 'string' ? req.query.engagement_id : null;
    if (!engagementId) throw badRequest('engagement_id مطلوب');
    const jobs = await many(`SELECT j.*, f.original_name, p.label AS period_label, u.full_name AS created_by_name FROM import_jobs j
      JOIN source_documents d ON d.id = j.document_id JOIN stored_files f ON f.id = d.file_id LEFT JOIN financial_periods p ON p.id = j.period_id LEFT JOIN users u ON u.id = j.created_by
      WHERE j.engagement_id = $1 ORDER BY j.created_at DESC`, [engagementId]);
    res.json({ jobs });
  } catch (e) { next(e); }
});

importsRouter.post('/', requirePermission('imports.run'), async (req, res, next) => {
  try {
    const d = parse(z.object({ document_id: z.string().uuid(), data_type: z.enum(DATA_TYPES), period_id: z.string().uuid().nullable().optional() }), req.body);
    // المستندات النظامية (عقود التأسيس، السجلات...) لا تُستورد كبيانات محاسبية؛ تُستخرج بياناتها من شاشة «البيانات النظامية»
    const docType = await one<{ document_type: string }>('SELECT document_type FROM source_documents WHERE id = $1', [d.document_id]);
    if (docType && (OFFICIAL_TYPES as readonly string[]).includes(docType.document_type)) throw badRequest('هذا مستند نظامي (عقد/سجل/شهادة) وليس بيانات محاسبية؛ استخرج بياناته من شاشة «البيانات النظامية».');
    const job = await createImportJob({ documentId: d.document_id, dataType: d.data_type, periodId: d.period_id ?? null, userId: req.user!.id });
    await audit(req, { action: 'import.created', entityType: 'import_job', entityId: job.id, clientId: job.client_id, details: { data_type: d.data_type, status: job.status, method: job.extraction_meta?.method } });
    res.status(201).json({ job });
  } catch (e) { next(e); }
});

importsRouter.get('/:id', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 500);
    res.json(await previewJob(req.params.id as string, limit));
  } catch (e) { next(e); }
});

importsRouter.get('/:id/records', async (req, res, next) => {
  try {
    res.json(await listRecords(req.params.id as string, { status: typeof req.query.status === 'string' ? req.query.status : undefined, offset: Number(req.query.offset ?? 0), limit: Number(req.query.limit ?? 100) }));
  } catch (e) { next(e); }
});

importsRouter.put('/:id/mapping', requirePermission('imports.run'), async (req, res, next) => {
  try {
    const d = parse(z.object({ sheet_name: z.string().max(200).optional(), header_row: z.number().int().min(1).max(1000).optional(),
      column_mapping: z.record(z.string(), z.number().int().min(0)).optional(), options: z.record(z.string(), z.unknown()).optional() }), req.body);
    const job = await updateMapping(req.params.id as string, d);
    await audit(req, { action: 'import.mapped', entityType: 'import_job', entityId: job.id, clientId: job.client_id, details: { mapping: job.column_mapping, header_row: job.header_row, sheet: job.sheet_name } });
    res.json({ job });
  } catch (e) { next(e); }
});

importsRouter.post('/:id/validate', requirePermission('imports.run'), async (req, res, next) => {
  try {
    const r = await validateJob(req.params.id as string);
    await audit(req, { action: 'import.validated', entityType: 'import_job', entityId: r.job.id, clientId: r.job.client_id, details: { ok: r.report.ok, warnings: r.report.warnings, errors: r.report.errors, can_commit: r.report.can_commit } });
    res.json(r);
  } catch (e) { next(e); }
});

importsRouter.post('/:id/commit', requirePermission('imports.run'), async (req, res, next) => {
  try {
    const d = parse(z.object({ confirm: z.literal(true) }), req.body);
    void d;
    const r = await commitJob(req.params.id as string, req.user!.id);
    await audit(req, { action: 'import.committed', entityType: 'import_job', entityId: r.job.id, clientId: r.job.client_id, details: { inserted: r.inserted, replaced: r.replaced, data_type: r.job.data_type, period_id: r.job.period_id } });
    res.json(r);
  } catch (e) { next(e); }
});

/** حذف مهمة استيراد بسجلاتها؛ إن كانت معتمدة تُحذف أسطر الميزان التي رُحّلت منها (الفترة تعود بلا ميزان حتى يُعاد الاستيراد) */
importsRouter.delete('/:id', requirePermission('data.delete'), async (req, res, next) => {
  try {
    const j = await one<{ id: string; client_id: string; status: string; data_type: string; period_id: string | null }>('SELECT id, client_id, status, data_type, period_id FROM import_jobs WHERE id = $1', [req.params.id]);
    if (!j) throw notFound('مهمة الاستيراد غير موجودة');
    const tb = j.status === 'committed' ? await query('DELETE FROM trial_balance_entries WHERE import_job_id = $1', [j.id]) : null;
    await query('DELETE FROM import_jobs WHERE id = $1', [j.id]);
    await audit(req, { action: 'import.deleted', entityType: 'import_job', entityId: j.id, clientId: j.client_id, details: { status: j.status, data_type: j.data_type, tb_rows_removed: tb?.rowCount ?? 0 } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

importsRouter.post('/:id/cancel', requirePermission('imports.run'), async (req, res, next) => {
  try {
    const job = await getJob(req.params.id as string);
    if (job.status === 'committed') throw badRequest('لا يمكن إلغاء مهمة معتمدة');
    await query(`UPDATE import_jobs SET status = 'cancelled', updated_at = now() WHERE id = $1`, [job.id]);
    await audit(req, { action: 'import.cancelled', entityType: 'import_job', entityId: job.id, clientId: job.client_id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** إدخال يدوي لميزان المراجعة (بدون ملف): يُنشئ مستندًا افتراضيًا ويُرحّل مباشرة بعد التحقق */
importsRouter.post('/manual/trial-balance', requirePermission('imports.run'), async (req, res, next) => {
  try {
    const d = parse(z.object({ engagement_id: z.string().uuid(), period_id: z.string().uuid(), replace_existing: z.boolean().default(true),
      rows: z.array(z.object({ account_code: z.string().min(1), account_name: z.string().optional().nullable(), opening_debit: z.string().optional(), opening_credit: z.string().optional(),
        period_debit: z.string().optional(), period_credit: z.string().optional(), closing_debit: z.string().optional(), closing_credit: z.string().optional() })).min(1).max(5000) }), req.body);
    const e = await one<{ client_id: string }>('SELECT client_id FROM engagements WHERE id = $1', [d.engagement_id]);
    if (!e) throw badRequest('الارتباط غير موجود');
    const p = await one<{ engagement_id: string }>('SELECT engagement_id FROM financial_periods WHERE id = $1', [d.period_id]);
    if (!p || p.engagement_id !== d.engagement_id) throw badRequest('الفترة لا تنتمي للارتباط');
    // نبني ملف CSV من الصفوف ونمرره عبر نفس مسار الاستيراد لضمان التتبع
    const header = ['account_code', 'account_name', 'opening_debit', 'opening_credit', 'period_debit', 'period_credit', 'closing_debit', 'closing_credit'];
    const csv = [header.join(','), ...d.rows.map((r) => header.map((h) => `"${String((r as Record<string, unknown>)[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const { saveFile } = await import('../files/storage.js');
    const stored = await saveFile({ purpose: 'document', subdir: `uploads/${e.client_id}/${d.engagement_id}`, originalName: `manual-trial-balance-${Date.now()}.csv`, mime: 'text/csv', data: Buffer.from('﻿' + csv, 'utf8'), userId: req.user!.id });
    const doc = await one<{ id: string }>(`INSERT INTO source_documents (client_id, engagement_id, period_id, file_id, document_type, title, uploaded_by, notes) VALUES ($1,$2,$3,$4,'trial_balance','إدخال يدوي - ميزان مراجعة',$5,'أُدخل يدويًا عبر الواجهة') RETURNING id`,
      [e.client_id, d.engagement_id, d.period_id, stored.id, req.user!.id]);
    const job = await createImportJob({ documentId: doc!.id, dataType: 'trial_balance', periodId: d.period_id, userId: req.user!.id });
    const mapping: Record<string, number> = {}; header.forEach((h, i) => { mapping[h] = i; });
    await updateMapping(job.id, { header_row: 1, column_mapping: mapping, options: { replace_existing: d.replace_existing } });
    const v = await validateJob(job.id);
    await audit(req, { action: 'import.manual_entry', entityType: 'import_job', entityId: job.id, clientId: e.client_id, details: { rows: d.rows.length } });
    res.status(201).json({ job: v.job, report: v.report });
  } catch (e) { next(e); }
});
