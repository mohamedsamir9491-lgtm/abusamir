import { Router } from 'express';
import { z } from 'zod';
import { many, one, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { loadEngagement } from '../../middleware/scope.js';

export const findingsRouter = Router();
findingsRouter.use(authenticate, requirePermission('clients.view'));

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
const CATEGORIES = ['math_error', 'data_quality', 'accounting_issue', 'documents_required', 'judgment', 'ai_observation'] as const;
const STATUSES = ['open', 'under_review', 'accepted', 'rejected', 'resolved'] as const;

findingsRouter.get('/', async (req, res, next) => {
  try {
    const engagementId = String(req.query.engagement_id ?? '');
    if (!engagementId) throw badRequest('engagement_id مطلوب');
    const periodId = typeof req.query.period_id === 'string' ? req.query.period_id : null;
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const severity = typeof req.query.severity === 'string' ? req.query.severity : null;
    const category = typeof req.query.category === 'string' ? req.query.category : null;
    const rows = await many(`SELECT f.*, p.label AS period_label, u.full_name AS reviewer_name, d.title AS source_document_title,
        (SELECT count(*) FROM proposed_adjustments a WHERE a.finding_id = f.id) AS adjustment_count,
        (SELECT count(*) FROM review_comments c WHERE c.entity_type = 'finding' AND c.entity_id = f.id) AS comment_count
      FROM findings f LEFT JOIN financial_periods p ON p.id = f.period_id LEFT JOIN users u ON u.id = f.reviewer_id LEFT JOIN source_documents d ON d.id = f.source_document_id
      WHERE f.engagement_id = $1 AND ($2::uuid IS NULL OR f.period_id = $2) AND ($3::text IS NULL OR f.review_status = $3) AND ($4::text IS NULL OR f.severity = $4) AND ($5::text IS NULL OR f.category = $5)
      ORDER BY CASE f.severity WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END DESC, COALESCE(f.amount, 0) DESC, f.created_at`, [engagementId, periodId, status, severity, category]);
    const counts = await one(`SELECT count(*) FILTER (WHERE review_status IN ('open','under_review')) AS open, count(*) FILTER (WHERE review_status = 'accepted') AS accepted,
      count(*) FILTER (WHERE review_status = 'rejected') AS rejected, count(*) FILTER (WHERE review_status = 'resolved') AS resolved, count(*) AS total,
      count(*) FILTER (WHERE severity = 'critical') AS critical, count(*) FILTER (WHERE severity = 'high') AS high FROM findings WHERE engagement_id = $1 AND ($2::uuid IS NULL OR period_id = $2)`, [engagementId, periodId]);
    res.json({ findings: rows, counts });
  } catch (e) { next(e); }
});

const manualSchema = z.object({
  engagement_id: z.string().uuid(), period_id: z.string().uuid().nullable().optional(),
  category: z.enum(CATEGORIES), severity: z.enum(SEVERITIES).default('medium'), title: z.string().min(3).max(300), description: z.string().min(3).max(5000),
  account_code: z.string().max(50).nullable().optional(), account_name: z.string().max(300).nullable().optional(), fs_line_code: z.string().max(50).nullable().optional(),
  amount: z.string().regex(/^-?\d+(\.\d+)?$/).nullable().optional(), source_document_id: z.string().uuid().nullable().optional(), source_row_ref: z.string().max(200).nullable().optional(),
  calculation: z.string().max(2000).nullable().optional(), impact: z.string().max(2000).nullable().optional(), recommendation: z.string().max(2000).nullable().optional(),
});

findingsRouter.post('/', requirePermission('findings.edit'), async (req, res, next) => {
  try {
    const d = parse(manualSchema, req.body);
    const e = await loadEngagement(d.engagement_id);
    const ref = await one<{ n: string }>(`SELECT nextval('findings_ref_seq') AS n`);
    const row = await one<{ id: string; finding_ref: string }>(`INSERT INTO findings (client_id, engagement_id, period_id, finding_ref, category, severity, title, description, account_code, account_name, fs_line_code, amount, currency, source_document_id, source_row_ref, calculation, impact, recommendation, origin, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'manual',$19) RETURNING id, finding_ref`,
      [e.client_id, d.engagement_id, d.period_id ?? null, `F-${String(ref!.n).padStart(4, '0')}`, d.category, d.severity, d.title, d.description, d.account_code ?? null, d.account_name ?? null, d.fs_line_code ?? null, d.amount ?? null, e.currency,
        d.source_document_id ?? null, d.source_row_ref ?? null, d.calculation ?? null, d.impact ?? null, d.recommendation ?? null, req.user!.id]);
    await audit(req, { action: 'finding.created', entityType: 'finding', entityId: row!.id, clientId: e.client_id, details: { ref: row!.finding_ref, title: d.title } });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

findingsRouter.get('/:id', async (req, res, next) => {
  try {
    const f = await one(`SELECT f.*, p.label AS period_label, u.full_name AS reviewer_name FROM findings f LEFT JOIN financial_periods p ON p.id = f.period_id LEFT JOIN users u ON u.id = f.reviewer_id WHERE f.id = $1`, [req.params.id]);
    if (!f) throw notFound('الملاحظة غير موجودة');
    const comments = await many(`SELECT c.*, u.full_name FROM review_comments c JOIN users u ON u.id = c.user_id WHERE c.entity_type = 'finding' AND c.entity_id = $1 ORDER BY c.created_at`, [req.params.id]);
    const adjustments = await many('SELECT * FROM proposed_adjustments WHERE finding_id = $1 ORDER BY created_at', [req.params.id]);
    const history = await many(`SELECT h.*, u.full_name FROM approval_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.entity_type = 'finding' AND h.entity_id = $1 ORDER BY h.created_at`, [req.params.id]);
    res.json({ finding: f, comments, adjustments, history });
  } catch (e) { next(e); }
});

findingsRouter.put('/:id', requirePermission('findings.edit'), async (req, res, next) => {
  try {
    const d = parse(manualSchema.omit({ engagement_id: true, period_id: true }).partial(), req.body);
    const f = await one<{ id: string; client_id: string; review_status: string }>('SELECT id, client_id, review_status FROM findings WHERE id = $1', [req.params.id]);
    if (!f) throw notFound('الملاحظة غير موجودة');
    const keys = Object.keys(d) as (keyof typeof d)[];
    if (!keys.length) throw badRequest('لا توجد حقول');
    await query(`UPDATE findings SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`, [f.id, ...keys.map((k) => d[k] ?? null)]);
    await audit(req, { action: 'finding.updated', entityType: 'finding', entityId: f.id, clientId: f.client_id, details: { fields: keys } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

findingsRouter.post('/:id/status', requirePermission('findings.review'), async (req, res, next) => {
  try {
    const d = parse(z.object({ status: z.enum(STATUSES), note: z.string().max(2000).optional() }), req.body);
    const f = await one<{ id: string; client_id: string; review_status: string }>('SELECT id, client_id, review_status FROM findings WHERE id = $1', [req.params.id]);
    if (!f) throw notFound('الملاحظة غير موجودة');
    await query('UPDATE findings SET review_status = $2, reviewer_id = $3, reviewer_note = COALESCE($4, reviewer_note), updated_at = now() WHERE id = $1', [f.id, d.status, req.user!.id, d.note ?? null]);
    await query(`INSERT INTO approval_history (entity_type, entity_id, from_status, to_status, user_id, note) VALUES ('finding',$1,$2,$3,$4,$5)`, [f.id, f.review_status, d.status, req.user!.id, d.note ?? null]);
    await audit(req, { action: 'finding.status_changed', entityType: 'finding', entityId: f.id, clientId: f.client_id, details: { from: f.review_status, to: d.status } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

findingsRouter.post('/:id/comments', async (req, res, next) => {
  try {
    const d = parse(z.object({ comment: z.string().min(1).max(5000) }), req.body);
    const f = await one<{ id: string; client_id: string }>('SELECT id, client_id FROM findings WHERE id = $1', [req.params.id]);
    if (!f) throw notFound('الملاحظة غير موجودة');
    const row = await one<{ id: string }>(`INSERT INTO review_comments (entity_type, entity_id, user_id, comment) VALUES ('finding',$1,$2,$3) RETURNING id`, [f.id, req.user!.id, d.comment]);
    await audit(req, { action: 'finding.commented', entityType: 'finding', entityId: f.id, clientId: f.client_id });
    res.status(201).json({ id: row!.id });
  } catch (e) { next(e); }
});

findingsRouter.delete('/:id', requirePermission('findings.edit'), async (req, res, next) => {
  try {
    const f = await one<{ id: string; client_id: string; origin: string }>('SELECT id, client_id, origin FROM findings WHERE id = $1', [req.params.id]);
    if (!f) throw notFound('الملاحظة غير موجودة');
    if (f.origin !== 'manual') throw badRequest('لا تُحذف ملاحظات المحرك أو الذكاء الاصطناعي؛ يمكن رفضها مع ذكر السبب للحفاظ على الأثر');
    await query('DELETE FROM findings WHERE id = $1', [f.id]);
    await audit(req, { action: 'finding.deleted', entityType: 'finding', entityId: f.id, clientId: f.client_id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
