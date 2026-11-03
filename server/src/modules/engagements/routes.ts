import { Router } from 'express';
import { z } from 'zod';
import { many, one, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { notFound, badRequest } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { loadEngagement } from '../../middleware/scope.js';

export const engagementsRouter = Router();
engagementsRouter.use(authenticate, requirePermission('clients.view'));

const ENGAGEMENT_TYPES = ['management_analysis', 'valuation', 'group_valuation', 'agreed_upon_review', 'bookkeeping', 'tax_analysis', 'compilation', 'assurance_audit'] as const;
const STATUSES = ['planning', 'data_collection', 'analysis', 'review', 'reporting', 'closed'] as const;

const engagementSchema = z.object({
  client_id: z.string().uuid(),
  title: z.string().min(2).max(300),
  engagement_type: z.enum(ENGAGEMENT_TYPES).default('management_analysis'),
  framework: z.enum(['ifrs', 'ifrs_smes', 'other', 'unspecified']).default('unspecified'),
  currency: z.string().length(3).default('SAR'),
  description: z.string().max(5000).nullable().optional(),
  periods: z.array(z.object({
    label: z.string().min(1).max(100),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    period_type: z.enum(['annual', 'quarter', 'month', 'custom']).default('annual'),
    role: z.enum(['current', 'prior', 'budget', 'comparative']).default('current'),
  })).default([]),
});

engagementsRouter.get('/', async (req, res, next) => {
  try {
    const clientId = typeof req.query.client_id === 'string' ? req.query.client_id : null;
    const rows = await many(
      `SELECT e.*, c.legal_name_ar AS client_name, c.is_demo,
              (SELECT count(*) FROM financial_periods p WHERE p.engagement_id = e.id) AS period_count,
              (SELECT count(*) FROM findings f WHERE f.engagement_id = e.id AND f.review_status IN ('open','under_review')) AS open_findings
         FROM engagements e JOIN clients c ON c.id = e.client_id
        WHERE c.deleted_at IS NULL AND ($1::uuid IS NULL OR e.client_id = $1)
        ORDER BY e.updated_at DESC`, [clientId]);
    res.json({ engagements: rows });
  } catch (e) { next(e); }
});

engagementsRouter.post('/', requirePermission('clients.manage'), async (req, res, next) => {
  try {
    const d = parse(engagementSchema, req.body);
    const client = await one<{ id: string; reporting_currency: string }>('SELECT id, reporting_currency FROM clients WHERE id = $1 AND deleted_at IS NULL', [d.client_id]);
    if (!client) throw notFound('العميل غير موجود');
    const row = await one<{ id: string }>(
      `INSERT INTO engagements (client_id, title, engagement_type, framework, currency, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [d.client_id, d.title, d.engagement_type, d.framework, d.currency.toUpperCase(), d.description ?? null, req.user!.id]);
    for (const p of d.periods) {
      if (p.end_date < p.start_date) throw badRequest(`تاريخ نهاية الفترة "${p.label}" قبل بدايتها`);
      await query(`INSERT INTO financial_periods (client_id, engagement_id, label, start_date, end_date, period_type, role) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [d.client_id, row!.id, p.label, p.start_date, p.end_date, p.period_type, p.role]);
    }
    await audit(req, { action: 'engagement.created', entityType: 'engagement', entityId: row!.id, clientId: d.client_id, details: { title: d.title } });
    res.status(201).json({ id: row!.id });
  } catch (e) { next(e); }
});

engagementsRouter.get('/:id', async (req, res, next) => {
  try {
    const e = await one(`SELECT e.*, c.legal_name_ar AS client_name, c.legal_name_en AS client_name_en, c.is_demo, c.cr_number, c.vat_number,
      c.accounting_framework AS client_framework FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.id = $1`, [req.params.id]);
    if (!e) throw notFound('الارتباط غير موجود');
    const periods = await many('SELECT * FROM financial_periods WHERE engagement_id = $1 ORDER BY start_date', [req.params.id]);
    const documents = await many(`SELECT d.*, f.original_name, f.size_bytes, f.mime_type, u.full_name AS uploaded_by_name
      FROM source_documents d JOIN stored_files f ON f.id = d.file_id LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.engagement_id = $1 AND d.deleted_at IS NULL ORDER BY d.uploaded_at DESC`, [req.params.id]);
    const imports = await many(`SELECT id, document_id, period_id, data_type, status, row_count, committed_at, created_at FROM import_jobs WHERE engagement_id = $1 ORDER BY created_at DESC`, [req.params.id]);
    const stats = await one(`SELECT
      (SELECT count(*) FROM trial_balance_entries t WHERE t.engagement_id = $1) AS tb_rows,
      (SELECT count(*) FROM findings f WHERE f.engagement_id = $1) AS findings_total,
      (SELECT count(*) FROM findings f WHERE f.engagement_id = $1 AND f.review_status IN ('open','under_review')) AS findings_open,
      (SELECT count(*) FROM proposed_adjustments a WHERE a.engagement_id = $1) AS adjustments,
      (SELECT count(*) FROM generated_reports r WHERE r.engagement_id = $1) AS reports,
      (SELECT max(started_at) FROM analysis_runs a WHERE a.engagement_id = $1 AND a.run_type = 'tb_validation' AND a.status = 'completed') AS last_validation_at`, [req.params.id]);
    res.json({ engagement: e, periods, documents, imports, stats });
  } catch (e) { next(e); }
});

engagementsRouter.put('/:id', requirePermission('clients.manage'), async (req, res, next) => {
  try {
    const d = parse(z.object({
      title: z.string().min(2).max(300).optional(),
      engagement_type: z.enum(ENGAGEMENT_TYPES).optional(),
      status: z.enum(STATUSES).optional(),
      framework: z.enum(['ifrs', 'ifrs_smes', 'other', 'unspecified']).optional(),
      currency: z.string().length(3).optional(),
      description: z.string().max(5000).nullable().optional(),
    }), req.body);
    const e = await loadEngagement(req.params.id as string);
    const keys = Object.keys(d) as (keyof typeof d)[];
    if (!keys.length) throw badRequest('لا توجد حقول للتحديث');
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await query(`UPDATE engagements SET ${sets}, updated_at = now() WHERE id = $1`, [e.id, ...keys.map((k) => d[k] ?? null)]);
    await audit(req, { action: 'engagement.updated', entityType: 'engagement', entityId: e.id, clientId: e.client_id, details: d });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

const periodSchema = z.object({
  label: z.string().min(1).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_type: z.enum(['annual', 'quarter', 'month', 'custom']).default('annual'),
  role: z.enum(['current', 'prior', 'budget', 'comparative']).default('current'),
});
engagementsRouter.post('/:id/periods', requirePermission('clients.manage'), async (req, res, next) => {
  try {
    const d = parse(periodSchema, req.body);
    const e = await loadEngagement(req.params.id as string);
    if (d.end_date < d.start_date) throw badRequest('تاريخ النهاية قبل البداية');
    const row = await one<{ id: string }>(
      `INSERT INTO financial_periods (client_id, engagement_id, label, start_date, end_date, period_type, role) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [e.client_id, e.id, d.label, d.start_date, d.end_date, d.period_type, d.role]);
    await audit(req, { action: 'period.created', entityType: 'financial_period', entityId: row!.id, clientId: e.client_id, details: d });
    res.status(201).json({ id: row!.id });
  } catch (e) { next(e); }
});

/** حذف ارتباط بكل بياناته (فترات، مستندات، استيرادات، موازين، ملاحظات، تقارير، خطاب) - لمالك النظام */
engagementsRouter.delete('/:id', requirePermission('data.delete'), async (req, res, next) => {
  try {
    const e = await one<{ id: string; client_id: string; title: string }>('SELECT id, client_id, title FROM engagements WHERE id = $1', [req.params.id]);
    if (!e) throw notFound('الارتباط غير موجود');
    const counts = await one<Record<string, string>>(`SELECT (SELECT count(*) FROM generated_reports WHERE engagement_id = $1) AS reports, (SELECT count(*) FROM import_jobs WHERE engagement_id = $1) AS imports, (SELECT count(*) FROM findings WHERE engagement_id = $1) AS findings`, [e.id]);
    await query('DELETE FROM engagements WHERE id = $1', [e.id]);
    await audit(req, { action: 'engagement.deleted', entityType: 'engagement', entityId: e.id, clientId: e.client_id, details: { title: e.title, ...counts } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

engagementsRouter.delete('/:id/periods/:pid', requirePermission('clients.manage'), async (req, res, next) => {
  try {
    const e = await loadEngagement(req.params.id as string);
    const used = await one('SELECT 1 FROM trial_balance_entries WHERE period_id = $1 LIMIT 1', [req.params.pid]);
    if (used) throw badRequest('لا يمكن حذف فترة تحتوي على بيانات مستوردة');
    await query('DELETE FROM financial_periods WHERE id = $1 AND engagement_id = $2', [req.params.pid, e.id]);
    await audit(req, { action: 'period.deleted', entityType: 'financial_period', entityId: req.params.pid as string, clientId: e.client_id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
