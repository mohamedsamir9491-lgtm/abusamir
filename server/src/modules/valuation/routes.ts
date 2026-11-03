/** تعديلات التقييم (صافي الأصول المعدّل) لكل شركة، وسجل المساهمين، والقيمة الموحدة للمساهمين */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { badRequest } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { loadPeriod } from '../../middleware/scope.js';
import { ASSET_CATEGORIES } from './nav.js';
import { companyNav, groupNav, resolveRoot } from './service.js';

export const valuationRouter = Router();
valuationRouter.use(authenticate, requirePermission('clients.view'));
const scopeQ = z.object({ engagement_id: z.string().uuid(), period_id: z.string().uuid() });
const categories = ASSET_CATEGORIES.map((c) => ({ code: c.code, label: c.label, rate: c.rate }));

valuationRouter.get('/company', async (req, res, next) => {
  try {
    const q = parse(scopeQ, req.query); await loadPeriod(q.period_id, q.engagement_id);
    const r = await companyNav(q.engagement_id, q.period_id);
    res.json({ company: r.ctx.company, period: r.ctx.period, currency: r.ctx.currency, nav: r.nav, status: r.status, approved_at: r.approved_at, approved_by: r.approved_by, categories });
  } catch (e) { next(e); }
});

const inputsSchema = z.object({
  assets: z.record(z.string(), z.object({ category: z.string().max(40).optional(), rate: z.number().min(0).max(100).optional(), method: z.enum(['rate', 'owner', 'none']).optional(), owner_value: z.number().nullable().optional(), owner_ref: z.string().max(300).nullable().optional(), note: z.string().max(500).nullable().optional() })).optional(),
  lease: z.object({ term_months: z.number().int().min(1).max(1200).nullable().optional(), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), discount_rate: z.number().min(0).max(100).nullable().optional(), note: z.string().max(500).nullable().optional() }).optional(),
  others: z.array(z.object({ id: z.string().max(40), title: z.string().min(2).max(300), amount: z.number(), note: z.string().max(500).nullable().optional() })).max(50).optional(),
});

valuationRouter.put('/company', requirePermission('findings.edit'), async (req, res, next) => {
  try {
    const d = parse(scopeQ.extend({ inputs: inputsSchema }), req.body); await loadPeriod(d.period_id, d.engagement_id);
    await query(`INSERT INTO valuation_workpapers (engagement_id, period_id, inputs, status, updated_by) VALUES ($1,$2,$3,'draft',$4)
      ON CONFLICT (engagement_id, period_id) DO UPDATE SET inputs = EXCLUDED.inputs, status = 'draft', approved_by = NULL, approved_at = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()`, [d.engagement_id, d.period_id, JSON.stringify(d.inputs), req.user!.id]);
    await audit(req, { action: 'valuation.saved', entityType: 'engagement', entityId: d.engagement_id, details: { period_id: d.period_id } });
    const r = await companyNav(d.engagement_id, d.period_id);
    res.json({ nav: r.nav, status: r.status });
  } catch (e) { next(e); }
});

valuationRouter.post('/company/approve', requirePermission('findings.review'), async (req, res, next) => {
  try {
    const d = parse(scopeQ.extend({ approve: z.boolean().default(true) }), req.body); await loadPeriod(d.period_id, d.engagement_id);
    await query(`INSERT INTO valuation_workpapers (engagement_id, period_id, inputs, status, approved_by, approved_at, updated_by) VALUES ($1,$2,'{}'::jsonb,$3,$4,$5,$4)
      ON CONFLICT (engagement_id, period_id) DO UPDATE SET status = EXCLUDED.status, approved_by = EXCLUDED.approved_by, approved_at = EXCLUDED.approved_at, updated_at = now()`, [d.engagement_id, d.period_id, d.approve ? 'approved' : 'draft', d.approve ? req.user!.id : null, d.approve ? new Date() : null]);
    await audit(req, { action: d.approve ? 'valuation.approved' : 'valuation.reopened', entityType: 'engagement', entityId: d.engagement_id, details: { period_id: d.period_id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** القيمة الموحدة للمساهمين (تُحسب على مستوى الأم لأي شركة من المجموعة) */
valuationRouter.get('/group', async (req, res, next) => {
  try {
    const q = parse(scopeQ, req.query);
    const g = await groupNav(q.engagement_id, q.period_id); const { contexts, ...rest } = g; void contexts;
    res.json(rest);
  } catch (e) { next(e); }
});

valuationRouter.put('/register', requirePermission('findings.edit'), async (req, res, next) => {
  try {
    const d = parse(scopeQ.extend({ basis: z.enum(['assumed_equal', 'register']), contributions_basis: z.enum(['books', 'official']), note: z.string().max(1000).nullable().optional(),
      holders: z.array(z.object({ name: z.string().min(2).max(200), pct: z.number().min(0).max(100), paid: z.number().nullable().optional(), account_code: z.string().max(60).nullable().optional() })).max(200) }), req.body);
    const sum = d.holders.reduce((t, h) => t + h.pct, 0);
    if (d.holders.length && Math.abs(sum - 100) > 0.01) throw badRequest(`مجموع نسب المساهمين ${Math.round(sum * 10000) / 10000}% ويجب أن يساوي 100%`);
    const { rootId } = await resolveRoot(d.engagement_id, d.period_id);
    await query(`INSERT INTO shareholder_registers (engagement_id, basis, contributions_basis, holders, note, updated_by) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (engagement_id) DO UPDATE SET basis = EXCLUDED.basis, contributions_basis = EXCLUDED.contributions_basis, holders = EXCLUDED.holders, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now()`, [rootId, d.basis, d.contributions_basis, JSON.stringify(d.holders), d.note ?? null, req.user!.id]);
    await audit(req, { action: 'shareholders.saved', entityType: 'engagement', entityId: rootId, details: { basis: d.basis, contributions_basis: d.contributions_basis, holders: d.holders.length } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
