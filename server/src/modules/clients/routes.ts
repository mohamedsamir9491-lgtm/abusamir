import { Router } from 'express';
import { z } from 'zod';
import { many, one, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { notFound, badRequest } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';

export const clientsRouter = Router();
clientsRouter.use(authenticate, requirePermission('clients.view'));

const clientSchema = z.object({
  legal_name_ar: z.string().min(2).max(300),
  legal_name_en: z.string().max(300).nullable().optional(),
  entity_type: z.enum(['llc', 'jsc', 'sole', 'partnership', 'branch', 'nonprofit', 'other']).default('llc'),
  cr_number: z.string().max(50).nullable().optional(),
  vat_number: z.string().max(50).nullable().optional(),
  fiscal_year_end_month: z.number().int().min(1).max(12).default(12),
  fiscal_year_end_day: z.number().int().min(1).max(31).default(31),
  accounting_framework: z.enum(['ifrs', 'ifrs_smes', 'other', 'unspecified']).default('unspecified'),
  reporting_currency: z.string().length(3).default('SAR'),
  industry: z.string().max(200).nullable().optional(),
  contact_name: z.string().max(200).nullable().optional(),
  contact_phone: z.string().max(100).nullable().optional(),
  contact_email: z.string().max(200).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  is_demo: z.boolean().default(false),
});

clientsRouter.get('/', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? `%${req.query.q}%` : null;
    const rows = await many(
      `SELECT c.*, (SELECT count(*) FROM engagements e WHERE e.client_id = c.id) AS engagement_count
         FROM clients c WHERE c.deleted_at IS NULL
          AND ($1::text IS NULL OR c.legal_name_ar ILIKE $1 OR c.legal_name_en ILIKE $1 OR c.cr_number ILIKE $1)
        ORDER BY c.is_demo, c.legal_name_ar`, [q]);
    res.json({ clients: rows });
  } catch (e) { next(e); }
});

clientsRouter.post('/', requirePermission('clients.manage'), async (req, res, next) => {
  try {
    const d = parse(clientSchema, req.body);
    const row = await one<{ id: string }>(
      `INSERT INTO clients (legal_name_ar, legal_name_en, entity_type, cr_number, vat_number, fiscal_year_end_month, fiscal_year_end_day,
        accounting_framework, reporting_currency, industry, contact_name, contact_phone, contact_email, address, notes, is_demo, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [d.legal_name_ar, d.legal_name_en ?? null, d.entity_type, d.cr_number ?? null, d.vat_number ?? null, d.fiscal_year_end_month,
        d.fiscal_year_end_day, d.accounting_framework, d.reporting_currency.toUpperCase(), d.industry ?? null, d.contact_name ?? null,
        d.contact_phone ?? null, d.contact_email ?? null, d.address ?? null, d.notes ?? null, d.is_demo, req.user!.id]);
    await audit(req, { action: 'client.created', entityType: 'client', entityId: row!.id, clientId: row!.id, details: { name: d.legal_name_ar } });
    res.status(201).json({ id: row!.id });
  } catch (e) { next(e); }
});

clientsRouter.get('/:id', async (req, res, next) => {
  try {
    const c = await one('SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!c) throw notFound('العميل غير موجود');
    const engagements = await many(
      `SELECT e.*, (SELECT count(*) FROM financial_periods p WHERE p.engagement_id = e.id) AS period_count,
              (SELECT count(*) FROM source_documents d WHERE d.engagement_id = e.id AND d.deleted_at IS NULL) AS document_count,
              (SELECT count(*) FROM generated_reports r WHERE r.engagement_id = e.id) AS report_count
         FROM engagements e WHERE e.client_id = $1 ORDER BY e.created_at DESC`, [req.params.id]);
    const outstanding = await many(
      `SELECT id, finding_ref, title, severity, category FROM findings
        WHERE client_id = $1 AND category = 'documents_required' AND review_status IN ('open','under_review') ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]);
    res.json({ client: c, engagements, outstanding_requests: outstanding });
  } catch (e) { next(e); }
});

clientsRouter.put('/:id', requirePermission('clients.manage'), async (req, res, next) => {
  try {
    const d = parse(clientSchema.partial(), req.body);
    const keys = Object.keys(d) as (keyof typeof d)[];
    if (!keys.length) throw badRequest('لا توجد حقول للتحديث');
    const c = await one('SELECT id FROM clients WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!c) throw notFound('العميل غير موجود');
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await query(`UPDATE clients SET ${sets}, updated_at = now() WHERE id = $1`, [req.params.id, ...keys.map((k) => d[k] ?? null)]);
    await audit(req, { action: 'client.updated', entityType: 'client', entityId: String(req.params.id), clientId: String(req.params.id), details: { fields: keys } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

clientsRouter.delete('/:id', requirePermission('data.delete'), async (req, res, next) => {
  try {
    const hard = req.query.hard === 'true';
    const c = await one<{ id: string; legal_name_ar: string }>(hard ? 'SELECT id, legal_name_ar FROM clients WHERE id = $1' : 'SELECT id, legal_name_ar FROM clients WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!c) throw notFound('العميل غير موجود');
    if (hard) { // تطهير نهائي بكل البيانات
      const { purgeClient } = await import('../system/cleanup.js');
      await audit(req, { action: 'client.purged', entityType: 'client', entityId: c.id, clientId: c.id, details: { name: c.legal_name_ar } });
      await purgeClient(c.id);
      return res.json({ ok: true, purged: true });
    }
    await query('UPDATE clients SET deleted_at = now(), is_active = FALSE WHERE id = $1', [c.id]);
    await audit(req, { action: 'client.archived', entityType: 'client', entityId: c.id, clientId: c.id, details: { name: c.legal_name_ar } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
