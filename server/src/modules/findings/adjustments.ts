import { Router } from 'express';
import { z } from 'zod';
import { many, one, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { loadEngagement } from '../../middleware/scope.js';
import { D, sum, toStr, toDb } from '../../engine/money.js';

export const adjustmentsRouter = Router();
adjustmentsRouter.use(authenticate, requirePermission('clients.view'));

const lineSchema = z.object({ account_code: z.string().min(1).max(50), account_name: z.string().max(300).nullable().optional(), debit: z.string().regex(/^\d+(\.\d+)?$/).default('0'), credit: z.string().regex(/^\d+(\.\d+)?$/).default('0'), description: z.string().max(500).nullable().optional() });
const adjSchema = z.object({
  engagement_id: z.string().uuid(), period_id: z.string().uuid().nullable().optional(), finding_id: z.string().uuid().nullable().optional(),
  description: z.string().min(3).max(1000), rationale: z.string().max(5000).nullable().optional(), calculation: z.string().max(2000).nullable().optional(),
  lines: z.array(lineSchema).min(2).max(100), evidence_document_id: z.string().uuid().nullable().optional(), notes: z.string().max(2000).nullable().optional(),
});

function checkLines(lines: z.infer<typeof lineSchema>[]) {
  const dr = sum(lines.map((l) => l.debit)); const cr = sum(lines.map((l) => l.credit));
  if (!dr.minus(cr).abs().lte('0.005')) throw badRequest(`القيد غير متوازن: مدين ${toStr(dr)} / دائن ${toStr(cr)}`);
  if (dr.isZero()) throw badRequest('القيد بلا مبالغ');
  for (const l of lines) if (!D(l.debit).isZero() && !D(l.credit).isZero()) throw badRequest(`السطر ${l.account_code} يحمل مدينًا ودائنًا معًا`);
  return { dr, cr };
}

adjustmentsRouter.get('/', async (req, res, next) => {
  try {
    const engagementId = String(req.query.engagement_id ?? '');
    if (!engagementId) throw badRequest('engagement_id مطلوب');
    const rows = await many(`SELECT a.*, f.finding_ref, f.title AS finding_title, p.label AS period_label, u1.full_name AS created_by_name, u2.full_name AS approved_by_name
      FROM proposed_adjustments a LEFT JOIN findings f ON f.id = a.finding_id LEFT JOIN financial_periods p ON p.id = a.period_id LEFT JOIN users u1 ON u1.id = a.created_by LEFT JOIN users u2 ON u2.id = a.approved_by
      WHERE a.engagement_id = $1 ORDER BY a.created_at DESC`, [engagementId]);
    res.json({ adjustments: rows });
  } catch (e) { next(e); }
});

adjustmentsRouter.post('/', requirePermission('findings.edit'), async (req, res, next) => {
  try {
    const d = parse(adjSchema, req.body);
    const e = await loadEngagement(d.engagement_id);
    const { dr, cr } = checkLines(d.lines);
    if (d.finding_id) { const f = await one<{ engagement_id: string }>('SELECT engagement_id FROM findings WHERE id = $1', [d.finding_id]); if (!f || f.engagement_id !== d.engagement_id) throw badRequest('الملاحظة لا تنتمي للارتباط'); }
    const ref = await one<{ n: string }>(`SELECT nextval('adjustments_ref_seq') AS n`);
    const row = await one<{ id: string; adj_ref: string }>(`INSERT INTO proposed_adjustments (client_id, engagement_id, period_id, finding_id, adj_ref, description, rationale, calculation, lines, total_debit, total_credit, evidence_document_id, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, adj_ref`,
      [e.client_id, d.engagement_id, d.period_id ?? null, d.finding_id ?? null, `AJE-${String(ref!.n).padStart(4, '0')}`, d.description, d.rationale ?? null, d.calculation ?? null, JSON.stringify(d.lines), toDb(dr), toDb(cr), d.evidence_document_id ?? null, d.notes ?? null, req.user!.id]);
    await query(`INSERT INTO approval_history (entity_type, entity_id, from_status, to_status, user_id) VALUES ('adjustment',$1,NULL,'proposed',$2)`, [row!.id, req.user!.id]);
    await audit(req, { action: 'adjustment.proposed', entityType: 'adjustment', entityId: row!.id, clientId: e.client_id, details: { ref: row!.adj_ref, amount: toStr(dr) } });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

adjustmentsRouter.put('/:id', requirePermission('findings.edit'), async (req, res, next) => {
  try {
    const d = parse(adjSchema.omit({ engagement_id: true }).partial(), req.body);
    const a = await one<{ id: string; client_id: string; status: string }>('SELECT id, client_id, status FROM proposed_adjustments WHERE id = $1', [req.params.id]);
    if (!a) throw notFound('التسوية غير موجودة');
    if (['approved', 'posted'].includes(a.status)) throw badRequest('لا يمكن تعديل تسوية معتمدة أو مرحّلة');
    const sets: string[] = []; const vals: unknown[] = [a.id];
    for (const [k, v] of Object.entries(d)) {
      if (k === 'lines') { const { dr, cr } = checkLines(v as z.infer<typeof lineSchema>[]); sets.push(`lines = $${vals.length + 1}`, `total_debit = $${vals.length + 2}`, `total_credit = $${vals.length + 3}`); vals.push(JSON.stringify(v), toDb(dr), toDb(cr)); }
      else { sets.push(`${k} = $${vals.length + 1}`); vals.push(v ?? null); }
    }
    if (!sets.length) throw badRequest('لا توجد حقول');
    await query(`UPDATE proposed_adjustments SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals);
    await audit(req, { action: 'adjustment.updated', entityType: 'adjustment', entityId: a.id, clientId: a.client_id, details: { fields: Object.keys(d) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

const TRANSITIONS: Record<string, string[]> = { proposed: ['under_review', 'rejected'], under_review: ['approved', 'rejected', 'proposed'], approved: ['posted', 'under_review'], rejected: ['proposed'], posted: [] };

adjustmentsRouter.post('/:id/status', async (req, res, next) => {
  try {
    const d = parse(z.object({ status: z.enum(['proposed', 'under_review', 'approved', 'rejected', 'posted']), note: z.string().max(2000).optional() }), req.body);
    const a = await one<{ id: string; client_id: string; status: string }>('SELECT id, client_id, status FROM proposed_adjustments WHERE id = $1', [req.params.id]);
    if (!a) throw notFound('التسوية غير موجودة');
    if (!TRANSITIONS[a.status].includes(d.status)) throw badRequest(`لا يمكن الانتقال من ${a.status} إلى ${d.status}`);
    const perms = req.user!.permissions;
    if (['approved', 'rejected'].includes(d.status) && !perms.includes('adjustments.approve')) throw badRequest('اعتماد/رفض التسويات يتطلب صلاحية المراجع');
    if (d.status === 'posted') throw badRequest('الترحيل غير متاح: النظام لا يتضمن دفتر أستاذ للترحيل؛ تُرحّل التسوية المعتمدة في النظام المحاسبي للعميل ثم يُعاد استيراد الميزان المعدّل.');
    if (!['approved', 'rejected'].includes(d.status) && !perms.includes('findings.edit') && !perms.includes('findings.review')) throw badRequest('ليس لديك صلاحية');
    const extra = d.status === 'approved' ? ', approved_by = $3, approved_at = now()' : d.status === 'under_review' ? ', reviewed_by = $3' : '';
    await query(`UPDATE proposed_adjustments SET status = $2, notes = COALESCE($4, notes), updated_at = now()${extra} WHERE id = $1`, [a.id, d.status, req.user!.id, d.note ?? null]);
    await query(`INSERT INTO approval_history (entity_type, entity_id, from_status, to_status, user_id, note) VALUES ('adjustment',$1,$2,$3,$4,$5)`, [a.id, a.status, d.status, req.user!.id, d.note ?? null]);
    await audit(req, { action: 'adjustment.status_changed', entityType: 'adjustment', entityId: a.id, clientId: a.client_id, details: { from: a.status, to: d.status } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

adjustmentsRouter.delete('/:id', requirePermission('data.delete'), async (req, res, next) => {
  try {
    const a = await one<{ id: string; client_id: string; adj_ref: string; status: string }>('SELECT id, client_id, adj_ref, status FROM proposed_adjustments WHERE id = $1', [req.params.id]);
    if (!a) throw notFound('التسوية غير موجودة');
    await query('DELETE FROM proposed_adjustments WHERE id = $1', [a.id]);
    await audit(req, { action: 'adjustment.deleted', entityType: 'adjustment', entityId: a.id, clientId: a.client_id, details: { adj_ref: a.adj_ref, status: a.status } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

adjustmentsRouter.get('/:id', async (req, res, next) => {
  try {
    const a = await one(`SELECT a.*, f.finding_ref, f.title AS finding_title FROM proposed_adjustments a LEFT JOIN findings f ON f.id = a.finding_id WHERE a.id = $1`, [req.params.id]);
    if (!a) throw notFound('التسوية غير موجودة');
    const history = await many(`SELECT h.*, u.full_name FROM approval_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.entity_type = 'adjustment' AND h.entity_id = $1 ORDER BY h.created_at`, [req.params.id]);
    res.json({ adjustment: a, history });
  } catch (e) { next(e); }
});
