/** واجهات المالية والأتعاب */
import { Router } from 'express';
import { z } from 'zod';
import { many, one, query, withTransaction } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { getOfficeSettings } from '../office/routes.js';
import { effectiveFiscalYear } from '../../lib/periods.js';
import { engagementFinance, officeFinance, loadClaims, letterFee, triggerOf, nextNo, r2, num, LIFECYCLE } from './service.js';
import { searchKey } from '../../lib/arabic.js';

export const financeRouter = Router();
financeRouter.use(authenticate, requirePermission('finance.view'));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function rootEngagement(id: string) {
  const e = await one<{ id: string; client_id: string; group_engagement_id: string | null; title: string }>('SELECT id, client_id, group_engagement_id, title FROM engagements WHERE id = $1', [id]);
  if (!e) throw notFound('الارتباط غير موجود');
  if (e.group_engagement_id) return (await one<{ id: string; client_id: string; group_engagement_id: string | null; title: string }>('SELECT id, client_id, group_engagement_id, title FROM engagements WHERE id = $1', [e.group_engagement_id]))!;
  return e;
}

financeRouter.get('/overview', async (req, res, next) => {
  try { const st = await getOfficeSettings() as { current_fiscal_year: number | null }; const year = Number(req.query.year ?? effectiveFiscalYear(st.current_fiscal_year)); res.json(await officeFinance(year)); } catch (e) { next(e); } // السنة الافتراضية من إعدادات المكتب
});

financeRouter.get('/engagement/:id', async (req, res, next) => {
  try { const e = await rootEngagement(String(req.params.id)); res.json({ engagement_id: e.id, ...(await engagementFinance(e.id)), lifecycle_labels: LIFECYCLE }); } catch (e) { next(e); }
});

/** دورة حياة الخطاب: إرسال، توقيع العميل (مع النسخة الموقعة)، إقفال، إلغاء، إعادة فتح */
financeRouter.post('/engagement/:id/lifecycle', requirePermission('finance.manage'), async (req, res, next) => {
  try {
    const d = parse(z.object({ action: z.enum(['issue', 'sent', 'signed', 'close', 'cancel', 'reopen']), date: date.optional(), signed_document_id: z.string().uuid().nullable().optional(), valid_until: date.nullable().optional() }), req.body);
    const e = await rootEngagement(String(req.params.id));
    const l = await one<{ id: string; lifecycle: string; status: string; fields: Record<string, unknown> }>('SELECT id, lifecycle, status, fields FROM engagement_letters WHERE engagement_id = $1', [e.id]);
    if (!l) throw badRequest('لا يوجد خطاب ارتباط لهذا الارتباط؛ أنشئه أولًا');
    const dt = d.date ?? new Date().toISOString().slice(0, 10);
    const allowed: Record<string, string[]> = { issue: ['draft'], sent: ['draft', 'issued'], signed: ['issued', 'sent', 'draft'], close: ['signed'], cancel: ['draft', 'issued', 'sent', 'signed'], reopen: ['closed', 'cancelled'] };
    if (!allowed[d.action].includes(l.lifecycle)) throw badRequest(`لا يمكن هذا الإجراء والخطاب في حالة «${LIFECYCLE[l.lifecycle] ?? l.lifecycle}»`);
    if (d.action === 'signed' && !d.signed_document_id) throw badRequest('ارفع النسخة الموقعة من العميل أولًا');
    await withTransaction(async (db) => {
      if (d.action === 'issue') await query(`UPDATE engagement_letters SET lifecycle = 'issued', status = 'issued', valid_until = COALESCE($2, valid_until), updated_at = now() WHERE id = $1`, [l.id, d.valid_until ?? null], db);
      if (d.action === 'sent') await query(`UPDATE engagement_letters SET lifecycle = 'sent', status = 'issued', sent_at = $2, valid_until = COALESCE($3, valid_until), updated_at = now() WHERE id = $1`, [l.id, dt, d.valid_until ?? null], db);
      if (d.action === 'signed') {
        await query(`UPDATE engagement_letters SET lifecycle = 'signed', status = 'issued', signed_at = $2, signed_document_id = $3, sent_at = COALESCE(sent_at, $2), updated_at = now() WHERE id = $1`, [l.id, dt, d.signed_document_id], db);
        // جدول الأتعاب من الخطاب (إن لم يُنشأ بعد)
        const has = await one<{ n: string }>('SELECT count(*) AS n FROM fee_installments WHERE engagement_id = $1', [e.id], db);
        if (Number(has?.n ?? 0) === 0) await generateInstallments(e.id, l.fields, db);
      }
      if (d.action === 'close') { await query(`UPDATE engagement_letters SET lifecycle = 'closed', closed_at = $2, updated_at = now() WHERE id = $1`, [l.id, dt], db); await query(`UPDATE engagements SET delivered_at = COALESCE(delivered_at, $2), status = 'closed', updated_at = now() WHERE id = $1`, [e.id, dt], db); }
      if (d.action === 'cancel') await query(`UPDATE engagement_letters SET lifecycle = 'cancelled', updated_at = now() WHERE id = $1`, [l.id], db);
      if (d.action === 'reopen') await query(`UPDATE engagement_letters SET lifecycle = CASE WHEN signed_at IS NOT NULL THEN 'signed' WHEN sent_at IS NOT NULL THEN 'sent' ELSE 'issued' END, closed_at = NULL, updated_at = now() WHERE id = $1`, [l.id], db);
    });
    await audit(req, { action: `letter.${d.action}`, entityType: 'engagement', entityId: e.id, clientId: e.client_id, details: { date: dt } });
    res.json(await engagementFinance(e.id));
  } catch (e) { next(e); }
});

async function generateInstallments(engagementId: string, fields: Record<string, unknown>, db: Parameters<typeof query>[2]) {
  const f = letterFee(fields); if (!f.net) return;
  const rows = f.schedule.filter((r) => num(r.pct) > 0);
  const list = rows.length ? rows.map((r) => ({ label: r.stage || r.due || 'دفعة', pct: num(r.pct), trigger: triggerOf(`${r.stage} ${r.due}`) })) : [{ label: 'الأتعاب', pct: 100, trigger: 'signing' }];
  const sumPct = list.reduce((t, r) => t + r.pct, 0); let acc = 0;
  for (let i = 0; i < list.length; i++) {
    const amt = i === list.length - 1 ? r2(f.net - acc) : r2(f.net * list[i].pct / (sumPct || 100)); acc = r2(acc + amt);
    await query('INSERT INTO fee_installments (engagement_id, seq, label, pct, amount, vat_rate, trigger) VALUES ($1,$2,$3,$4,$5,$6,$7)', [engagementId, i + 1, list[i].label, list[i].pct, amt, f.vatRate, list[i].trigger], db);
  }
}

financeRouter.post('/engagement/:id/installments/generate', requirePermission('finance.manage'), async (req, res, next) => {
  try {
    const e = await rootEngagement(String(req.params.id));
    const l = await one<{ fields: Record<string, unknown> }>('SELECT fields FROM engagement_letters WHERE engagement_id = $1', [e.id]);
    if (!l) throw badRequest('لا يوجد خطاب ارتباط');
    if (!letterFee(l.fields).net) throw badRequest('لم يُحدد مبلغ الأتعاب في خطاب الارتباط');
    const billed = await one<{ n: string }>('SELECT count(*) AS n FROM fee_claims c JOIN fee_installments i ON i.id = c.installment_id WHERE i.engagement_id = $1 AND c.status <> $2', [e.id, 'cancelled']);
    if (Number(billed?.n ?? 0) > 0) throw badRequest('صدرت مطالبات على الجدول الحالي؛ عدّل الدفعات يدويًا بدل إعادة الإنشاء');
    await withTransaction(async (db) => { await query('DELETE FROM fee_installments WHERE engagement_id = $1', [e.id], db); await generateInstallments(e.id, l.fields, db); });
    await audit(req, { action: 'fees.schedule_generated', entityType: 'engagement', entityId: e.id, clientId: e.client_id });
    res.json(await engagementFinance(e.id));
  } catch (e) { next(e); }
});

const instSchema = z.object({ label: z.string().min(2).max(200), amount: z.number().min(0), vat_rate: z.number().min(0).max(100), trigger: z.enum(['signing', 'delivery', 'date', 'manual']), due_date: date.nullable().optional(), pct: z.number().min(0).max(100).nullable().optional() });
financeRouter.post('/engagement/:id/installments', requirePermission('finance.manage'), async (req, res, next) => {
  try {
    const d = parse(instSchema, req.body); const e = await rootEngagement(String(req.params.id));
    const seq = Number((await one<{ n: string }>('SELECT COALESCE(max(seq),0) AS n FROM fee_installments WHERE engagement_id = $1', [e.id]))?.n ?? 0) + 1;
    await query('INSERT INTO fee_installments (engagement_id, seq, label, pct, amount, vat_rate, trigger, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [e.id, seq, d.label, d.pct ?? null, d.amount, d.vat_rate, d.trigger, d.due_date ?? null]);
    res.status(201).json(await engagementFinance(e.id));
  } catch (e) { next(e); }
});
financeRouter.put('/installments/:id', requirePermission('finance.manage'), async (req, res, next) => {
  try {
    const d = parse(instSchema, req.body); const i = await one<{ engagement_id: string }>('SELECT engagement_id FROM fee_installments WHERE id = $1', [req.params.id]); if (!i) throw notFound('الدفعة غير موجودة');
    await query('UPDATE fee_installments SET label=$2, pct=$3, amount=$4, vat_rate=$5, trigger=$6, due_date=$7 WHERE id=$1', [req.params.id, d.label, d.pct ?? null, d.amount, d.vat_rate, d.trigger, d.due_date ?? null]);
    res.json(await engagementFinance(i.engagement_id));
  } catch (e) { next(e); }
});
financeRouter.delete('/installments/:id', requirePermission('finance.manage'), async (req, res, next) => {
  try {
    const i = await one<{ engagement_id: string }>('SELECT engagement_id FROM fee_installments WHERE id = $1', [req.params.id]); if (!i) throw notFound('الدفعة غير موجودة');
    const c = await one<{ n: string }>(`SELECT count(*) AS n FROM fee_claims WHERE installment_id = $1 AND status <> 'cancelled'`, [req.params.id]); if (Number(c?.n ?? 0)) throw badRequest('صدرت مطالبة على هذه الدفعة؛ ألغِ المطالبة أولًا');
    await query('DELETE FROM fee_installments WHERE id = $1', [req.params.id]); res.json(await engagementFinance(i.engagement_id));
  } catch (e) { next(e); }
});

/** مطالبة أتعاب (رقم الفاتورة الرسمية من نظام الفوترة يُسجَّل للمطابقة) */
financeRouter.post('/claims', requirePermission('finance.manage'), async (req, res, next) => {
  try {
    const d = parse(z.object({ engagement_id: z.string().uuid(), installment_id: z.string().uuid().nullable().optional(), issue_date: date, due_date: date.nullable().optional(), amount: z.number().positive(), vat_rate: z.number().min(0).max(100), description: z.string().max(500).nullable().optional(), external_invoice_no: z.string().max(100).nullable().optional(), notes: z.string().max(1000).nullable().optional() }), req.body);
    const e = await rootEngagement(d.engagement_id);
    if (d.installment_id) { const i = await one<{ amount: string; vat_rate: string }>('SELECT amount, vat_rate FROM fee_installments WHERE id = $1 AND engagement_id = $2', [d.installment_id, e.id]); if (!i) throw badRequest('الدفعة لا تخص هذا الارتباط');
      const prev = await one<{ s: string }>(`SELECT COALESCE(sum(amount),0) AS s FROM fee_claims WHERE installment_id = $1 AND status <> 'cancelled'`, [d.installment_id]);
      if (Number(prev?.s ?? 0) + d.amount > Number(i.amount) + 0.009) throw badRequest(`المطالبات على هذه الدفعة تتجاوز مبلغها (${Number(i.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })})`); }
    const vat = r2(d.amount * d.vat_rate / 100);
    const row = await withTransaction(async (db) => { const no = await nextNo('CL', 'fee_claims', 'claim_no', db);
      return one<{ id: string; claim_no: string }>(`INSERT INTO fee_claims (claim_no, client_id, engagement_id, installment_id, issue_date, due_date, description, amount, vat_rate, vat_amount, total, external_invoice_no, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, claim_no`,
        [no, e.client_id, e.id, d.installment_id ?? null, d.issue_date, d.due_date ?? null, d.description ?? null, d.amount, d.vat_rate, vat, r2(d.amount + vat), d.external_invoice_no ?? null, d.notes ?? null, req.user!.id], db); });
    await audit(req, { action: 'claim.issued', entityType: 'fee_claim', entityId: row!.id, clientId: e.client_id, details: { claim_no: row!.claim_no, amount: d.amount } });
    res.status(201).json({ claim: row, finance: await engagementFinance(e.id) });
  } catch (e) { next(e); }
});
financeRouter.patch('/claims/:id', requirePermission('finance.manage'), async (req, res, next) => {
  try {
    const d = parse(z.object({ external_invoice_no: z.string().max(100).nullable().optional(), due_date: date.nullable().optional(), notes: z.string().max(1000).nullable().optional(), cancel: z.boolean().optional() }), req.body);
    const c = await one<{ id: string; engagement_id: string; client_id: string }>('SELECT id, engagement_id, client_id FROM fee_claims WHERE id = $1', [req.params.id]); if (!c) throw notFound('المطالبة غير موجودة');
    if (d.cancel) { const p = await one<{ n: string }>('SELECT count(*) AS n FROM fee_payments WHERE claim_id = $1', [c.id]); if (Number(p?.n ?? 0)) throw badRequest('على المطالبة تحصيلات؛ احذف التحصيلات أولًا'); }
    await query(`UPDATE fee_claims SET external_invoice_no = COALESCE($2, external_invoice_no), due_date = CASE WHEN $3::boolean THEN $4::date ELSE due_date END, notes = COALESCE($5, notes), status = CASE WHEN $6 THEN 'cancelled' ELSE status END WHERE id = $1`,
      [c.id, d.external_invoice_no ?? null, d.due_date !== undefined, d.due_date ?? null, d.notes ?? null, !!d.cancel]);
    await audit(req, { action: d.cancel ? 'claim.cancelled' : 'claim.updated', entityType: 'fee_claim', entityId: c.id, clientId: c.client_id, details: d });
    res.json(await engagementFinance(c.engagement_id));
  } catch (e) { next(e); }
});

financeRouter.post('/payments', requirePermission('finance.manage'), async (req, res, next) => {
  try {
    const d = parse(z.object({ claim_id: z.string().uuid(), pay_date: date, amount: z.number().positive(), method: z.enum(['bank', 'cash', 'cheque', 'card', 'other']), reference: z.string().max(200).nullable().optional(), notes: z.string().max(1000).nullable().optional() }), req.body);
    const [c] = await loadClaims('c.id = $1', [d.claim_id]); if (!c) throw notFound('المطالبة غير موجودة');
    if (c.state === 'cancelled') throw badRequest('المطالبة ملغاة');
    if (d.amount > c.balance + 0.009) throw badRequest(`المبلغ يتجاوز المتبقي على المطالبة (${c.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })})`);
    const row = await withTransaction(async (db) => { const no = await nextNo('RC', 'fee_payments', 'payment_no', db);
      return one<{ id: string; payment_no: string }>('INSERT INTO fee_payments (payment_no, client_id, claim_id, pay_date, amount, method, reference, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, payment_no', [no, c.client_id, c.id, d.pay_date, d.amount, d.method, d.reference ?? null, d.notes ?? null, req.user!.id], db); });
    await audit(req, { action: 'payment.recorded', entityType: 'fee_payment', entityId: row!.id, clientId: c.client_id, details: { payment_no: row!.payment_no, claim_no: c.claim_no, amount: d.amount } });
    res.status(201).json({ payment: row, finance: await engagementFinance(c.engagement_id) });
  } catch (e) { next(e); }
});
financeRouter.delete('/payments/:id', requirePermission('finance.manage'), async (req, res, next) => {
  try {
    const p = await one<{ id: string; client_id: string; engagement_id: string; payment_no: string }>('SELECT p.id, p.client_id, c.engagement_id, p.payment_no FROM fee_payments p JOIN fee_claims c ON c.id = p.claim_id WHERE p.id = $1', [req.params.id]); if (!p) throw notFound('التحصيل غير موجود');
    await query('DELETE FROM fee_payments WHERE id = $1', [p.id]);
    await audit(req, { action: 'payment.deleted', entityType: 'fee_payment', entityId: p.id, clientId: p.client_id, details: { payment_no: p.payment_no } });
    res.json(await engagementFinance(p.engagement_id));
  } catch (e) { next(e); }
});

/** قوائم المكتب: المطالبات، التحصيلات، المستحقات حسب العميل */
financeRouter.get('/claims', async (req, res, next) => {
  try {
    const q = searchKey(String(req.query.q ?? '')); const state = String(req.query.state ?? ''); const client = String(req.query.client_id ?? '');
    let rows = await loadClaims(client ? 'c.client_id = $1' : 'TRUE', client ? [client] : []);
    if (q) rows = rows.filter((r) => searchKey(`${r.claim_no} ${r.client_name} ${r.external_invoice_no ?? ''} ${r.description ?? ''}`).includes(q));
    if (state) rows = rows.filter((r) => state === 'open' ? r.balance > 0.009 && r.state !== 'cancelled' : r.state === state);
    const page = Math.max(1, Number(req.query.page ?? 1)); const per = Math.min(200, Math.max(10, Number(req.query.per ?? 25)));
    const tot = { count: rows.length, amount: r2(rows.reduce((t, r) => t + r.amount, 0)), total: r2(rows.reduce((t, r) => t + r.total, 0)), paid: r2(rows.reduce((t, r) => t + r.paid, 0)), balance: r2(rows.reduce((t, r) => t + r.balance, 0)) };
    res.json({ claims: rows.slice((page - 1) * per, page * per), totals: tot, page, per });
  } catch (e) { next(e); }
});
financeRouter.get('/payments', async (req, res, next) => {
  try {
    const q = searchKey(String(req.query.q ?? ''));
    let rows = await many<Record<string, string>>(`SELECT p.*, p.pay_date::text AS pay_date, c.claim_no, c.external_invoice_no, cl.legal_name_ar AS client_name, e.title AS engagement_title FROM fee_payments p JOIN fee_claims c ON c.id = p.claim_id JOIN clients cl ON cl.id = p.client_id JOIN engagements e ON e.id = c.engagement_id ORDER BY p.pay_date DESC, p.payment_no DESC`);
    if (q) rows = rows.filter((r) => searchKey(`${r.payment_no} ${r.claim_no} ${r.client_name} ${r.reference ?? ''}`).includes(q));
    res.json({ payments: rows, total: r2(rows.reduce((t, r) => t + Number(r.amount), 0)) });
  } catch (e) { next(e); }
});
financeRouter.get('/receivables', async (_req, res, next) => {
  try {
    const rows = (await loadClaims(`c.status <> 'cancelled'`, [])).filter((c) => c.balance > 0.009);
    const by = new Map<string, { client_id: string; client_name: string; not_due: number; d30: number; d60: number; d90: number; d90p: number; total: number; claims: number; oldest: number }>();
    for (const c of rows) { const k = c.client_id; const x = by.get(k) ?? { client_id: k, client_name: c.client_name ?? '', not_due: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: 0, claims: 0, oldest: 0 };
      const a = c.due_date ? c.age_days ?? 0 : 0; const b = !c.due_date || a <= 0 ? 'not_due' : a <= 30 ? 'd30' : a <= 60 ? 'd60' : a <= 90 ? 'd90' : 'd90p';
      x[b] = r2(x[b] + c.balance); x.total = r2(x.total + c.balance); x.claims++; x.oldest = Math.max(x.oldest, a); by.set(k, x); }
    const list = [...by.values()].sort((a, b) => b.total - a.total);
    res.json({ clients: list, totals: ['not_due', 'd30', 'd60', 'd90', 'd90p', 'total'].reduce((o, k) => ({ ...o, [k]: r2(list.reduce((t, x) => t + (x as unknown as Record<string, number>)[k], 0)) }), {}) });
  } catch (e) { next(e); }
});
financeRouter.put('/target', requirePermission('finance.manage'), async (req, res, next) => {
  try { const d = parse(z.object({ revenue_target: z.number().min(0).nullable() }), req.body); await query('UPDATE office_settings SET revenue_target = $1 WHERE id = 1', [d.revenue_target]); res.json({ ok: true }); } catch (e) { next(e); }
});
