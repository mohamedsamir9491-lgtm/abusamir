/** المالية والأتعاب: دورة الخطاب، الدفعات، المطالبات، التحصيلات، المستحقات، الإيراد (المحصّل والمكتسب)
 * الإيراد يُعرض دائمًا دون ضريبة القيمة المضافة؛ المحصّل الصافي = التحصيل × (صافي المطالبة ÷ إجماليها) */
import { many, one, type Queryable } from '../../db/pool.js';
import { toLatinDigits } from '../../lib/arabic.js';

export const r2 = (v: number) => Math.round(v * 100) / 100;
export const num = (s: unknown) => { const t = toLatinDigits(String(s ?? '')).replace(/[^\d.\-]/g, ''); const n = Number(t); return Number.isFinite(n) ? n : 0; };
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export const LIFECYCLE: Record<string, string> = { draft: 'مسودة', issued: 'صادر', sent: 'أُرسل للعميل', signed: 'موقّع وساري', closed: 'مُقفل', cancelled: 'ملغى' };

/** تقدم الارتباط (6 مراحل كما في صفحة الارتباط)؛ المُقفل أو المسلَّم = مكتمل */
export async function engagementProgress(engagementId: string, db?: Queryable): Promise<{ done: number; total: number; ratio: number }> {
  const e = await one<{ delivered_at: string | null; lifecycle: string | null }>(`SELECT e.delivered_at, l.lifecycle FROM engagements e LEFT JOIN engagement_letters l ON l.engagement_id = e.id WHERE e.id = $1`, [engagementId], db);
  const total = 6;
  if (e?.delivered_at || e?.lifecycle === 'closed') return { done: total, total, ratio: 1 };
  const p = await one<{ id: string }>(`SELECT id FROM financial_periods WHERE engagement_id = $1 ORDER BY (role = 'current') DESC, end_date DESC LIMIT 1`, [engagementId], db);
  if (!p) return { done: 0, total, ratio: 0 };
  const s = await one<Record<string, string>>(`SELECT
    (SELECT count(*) FROM trial_balance_entries WHERE period_id = $1) AS tb, (SELECT count(*) FROM analysis_runs WHERE period_id = $1 AND run_type = 'tb_validation' AND status = 'completed') AS v,
    (SELECT count(*) FROM analysis_runs WHERE period_id = $1 AND run_type = 'statements' AND status = 'completed') AS st,
    (SELECT count(*) FROM findings WHERE period_id = $1) AS f, (SELECT count(*) FROM findings WHERE period_id = $1 AND review_status IN ('open','under_review')) AS fo,
    (SELECT count(*) FROM generated_reports WHERE period_id = $1) AS r, (SELECT count(*) FROM generated_reports WHERE period_id = $1 AND status IN ('approved','issued')) AS ra`, [p.id], db);
  const steps = [Number(s!.tb) > 0, Number(s!.v) > 0, Number(s!.st) > 0, Number(s!.f) > 0 && Number(s!.fo) === 0, Number(s!.r) > 0, Number(s!.ra) > 0];
  const done = steps.filter(Boolean).length; return { done, total, ratio: done / total };
}

/** صافي الأتعاب من الخطاب (دون الضريبة) ونسبة الضريبة */
export function letterFee(fields: Record<string, any>): { net: number; vatRate: number; schedule: { stage: string; pct: string; due: string }[] } { // eslint-disable-line @typescript-eslint/no-explicit-any
  const o = fields?.options ?? {}; /* «إخفاء نص الضريبة» خيار عرض فقط ولا يُلغي استحقاقها؛ عدم احتساب الضريبة يكون بجعل النسبة 0 */ const rate = num(o.vat_rate ?? 15); const amt = num(fields?.fees_amount);
  const net = o.vat_mode === 'inclusive' && rate ? r2(amt / (1 + rate / 100)) : amt;
  return { net, vatRate: rate, schedule: (fields?.fees_schedule ?? []) as { stage: string; pct: string; due: string }[] };
}
export const triggerOf = (due: string) => /توقيع/.test(due) ? 'signing' : /تسليم|نهائي/.test(due) ? 'delivery' : /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/.test(toLatinDigits(due)) ? 'date' : 'manual';

export interface ClaimRow { id: string; claim_no: string; client_id: string; engagement_id: string; installment_id: string | null; issue_date: string; due_date: string | null; description: string | null; amount: number; vat_rate: number; vat_amount: number; total: number; external_invoice_no: string | null; status: string; notes: string | null; paid: number; balance: number; state: 'paid' | 'partial' | 'unpaid' | 'overdue' | 'cancelled'; client_name?: string; engagement_title?: string; age_days: number | null }
export async function loadClaims(where: string, params: unknown[], db?: Queryable): Promise<ClaimRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await many<Record<string, any>>(`SELECT c.*, c.issue_date::text AS issue_date, c.due_date::text AS due_date, cl.legal_name_ar AS client_name, e.title AS engagement_title, e.engagement_type,
      COALESCE((SELECT sum(p.amount) FROM fee_payments p WHERE p.claim_id = c.id), 0) AS paid
    FROM fee_claims c JOIN clients cl ON cl.id = c.client_id JOIN engagements e ON e.id = c.engagement_id WHERE ${where} ORDER BY c.issue_date DESC, c.claim_no DESC`, params, db);
  const t = today();
  return rows.map((r) => { const total = Number(r.total); const paid = Number(r.paid); const balance = r2(total - paid);
    const ref = r.due_date ?? r.issue_date; const age = balance > 0.009 ? daysBetween(ref, t) : null;
    const state: ClaimRow['state'] = r.status === 'cancelled' ? 'cancelled' : balance <= 0.009 ? 'paid' : age != null && age > 0 && r.due_date ? (paid > 0 ? 'partial' : 'overdue') : paid > 0 ? 'partial' : 'unpaid';
    return { ...r, amount: Number(r.amount), vat_rate: Number(r.vat_rate), vat_amount: Number(r.vat_amount), total, paid: r2(paid), balance, state, age_days: age } as ClaimRow; });
}

/** ملخص مالي لارتباط واحد (الأم في المجموعة) */
export async function engagementFinance(engagementId: string, db?: Queryable) {
  const letter = await one<{ id: string; letter_no: string | null; letter_date: string; status: string; lifecycle: string; sent_at: string | null; signed_at: string | null; signed_document_id: string | null; valid_until: string | null; closed_at: string | null; fields: Record<string, unknown>; signed_title: string | null }>(
    `SELECT l.id, l.letter_no, l.letter_date::text AS letter_date, l.status, l.lifecycle, l.sent_at::text AS sent_at, l.signed_at::text AS signed_at, l.signed_document_id, l.valid_until::text AS valid_until, l.closed_at::text AS closed_at, l.fields, d.title AS signed_title
       FROM engagement_letters l LEFT JOIN source_documents d ON d.id = l.signed_document_id WHERE l.engagement_id = $1`, [engagementId], db);
  const inst = await many<{ id: string; seq: number; label: string; pct: string | null; amount: string; vat_rate: string; trigger: string; due_date: string | null }>(`SELECT id, seq, label, pct, amount, vat_rate, trigger, due_date::text AS due_date FROM fee_installments WHERE engagement_id = $1 ORDER BY seq`, [engagementId], db);
  const claims = await loadClaims('c.engagement_id = $1', [engagementId], db);
  const payments = await many<Record<string, unknown>>(`SELECT p.*, p.pay_date::text AS pay_date, c.claim_no, c.amount AS claim_amount, c.total AS claim_total FROM fee_payments p JOIN fee_claims c ON c.id = p.claim_id WHERE c.engagement_id = $1 ORDER BY p.pay_date DESC, p.payment_no DESC`, [engagementId], db);
  const lf = letter ? letterFee(letter.fields as Record<string, unknown>) : { net: 0, vatRate: 0, schedule: [] };
  const feeNet = inst.length ? r2(inst.reduce((t, i) => t + Number(i.amount), 0)) : lf.net;
  const live = claims.filter((c) => c.state !== 'cancelled');
  const billed = r2(live.reduce((t, c) => t + c.amount, 0)); const billedGross = r2(live.reduce((t, c) => t + c.total, 0));
  const collectedGross = r2(live.reduce((t, c) => t + c.paid, 0)); const collectedNet = r2(live.reduce((t, c) => t + (c.total ? c.paid * c.amount / c.total : 0), 0));
  const prog = await engagementProgress(engagementId, db); const earned = r2(feeNet * prog.ratio);
  const instRows = inst.map((i) => { const cl = live.filter((c) => c.installment_id === i.id); const amt = Number(i.amount); const vat = r2(amt * Number(i.vat_rate) / 100);
    const paid = r2(cl.reduce((t, c) => t + c.paid, 0)); const billedI = r2(cl.reduce((t, c) => t + c.amount, 0));
    return { ...i, amount: amt, vat_rate: Number(i.vat_rate), vat, total: r2(amt + vat), billed: billedI, paid, claim_nos: cl.map((c) => c.claim_no), state: billedI <= 0 ? 'unbilled' : paid >= r2(amt + vat) - 0.009 ? 'paid' : paid > 0 ? 'partial' : 'billed' }; });
  return { letter: letter ? { ...letter, fields: undefined, fee_net: lf.net, vat_rate: lf.vatRate, schedule: lf.schedule } : null, installments: instRows, claims, payments,
    summary: { fee_net: feeNet, billed, billed_gross: billedGross, collected_gross: collectedGross, collected_net: collectedNet, outstanding: r2(billedGross - collectedGross), earned, unbilled: r2(Math.max(0, earned - billed)), deferred: r2(Math.max(0, billed - earned)), progress: prog, remaining_to_bill: r2(Math.max(0, feeNet - billed)) } };
}

/** نظرة المكتب المالية لسنة (المفوتر والمحصّل بتاريخهما؛ المستحق والأعمار حتى اليوم) */
export async function officeFinance(year: number, db?: Queryable) {
  const y0 = `${year}-01-01`; const y1 = `${year}-12-31`;
  const claims = await loadClaims(`c.status <> 'cancelled'`, [], db);
  const pays = await many<{ pay_date: string; amount: string; claim_amount: string; claim_total: string; client_id: string }>(`SELECT p.pay_date::text AS pay_date, p.amount, c.amount AS claim_amount, c.total AS claim_total, p.client_id FROM fee_payments p JOIN fee_claims c ON c.id = p.claim_id WHERE c.status <> 'cancelled'`, [], db);
  const inYear = (d: string) => d >= y0 && d <= y1;
  const billed = r2(claims.filter((c) => inYear(c.issue_date)).reduce((t, c) => t + c.amount, 0));
  const netOf = (p: { amount: string; claim_amount: string; claim_total: string }) => Number(p.claim_total) ? Number(p.amount) * Number(p.claim_amount) / Number(p.claim_total) : 0;
  const collected = r2(pays.filter((p) => inYear(p.pay_date)).reduce((t, p) => t + netOf(p), 0));
  const collectedGross = r2(pays.filter((p) => inYear(p.pay_date)).reduce((t, p) => t + Number(p.amount), 0));
  const open = claims.filter((c) => c.balance > 0.009);
  const outstanding = r2(open.reduce((t, c) => t + c.balance, 0));
  const B = [{ key: 'not_due', label: 'لم يحن موعدها', v: 0 }, { key: 'd30', label: 'حتى 30 يومًا', v: 0 }, { key: 'd60', label: 'من 31 إلى 60', v: 0 }, { key: 'd90', label: 'من 61 إلى 90', v: 0 }, { key: 'd90p', label: 'أكثر من 90 يومًا', v: 0 }];
  for (const c of open) { const a = c.due_date ? c.age_days ?? 0 : 0; const k = !c.due_date || a <= 0 ? 0 : a <= 30 ? 1 : a <= 60 ? 2 : a <= 90 ? 3 : 4; B[k].v = r2(B[k].v + c.balance); }
  const lateClients = new Set(open.filter((c) => c.due_date && (c.age_days ?? 0) > 60).map((c) => c.client_id)).size;
  const months = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, billed: 0, collected: 0 }));
  for (const c of claims) if (inYear(c.issue_date)) months[Number(c.issue_date.slice(5, 7)) - 1].billed += c.amount;
  for (const p of pays) if (inYear(p.pay_date)) months[Number(p.pay_date.slice(5, 7)) - 1].collected += netOf(p);
  months.forEach((m) => { m.billed = r2(m.billed); m.collected = r2(m.collected); });
  // الارتباطات (الأم فقط) وأتعابها وتقدمها
  const engs = await many<{ id: string; client_id: string; client_name: string; engagement_type: string; status: string; title: string; lifecycle: string | null; fields: Record<string, unknown> | null; due_date: string | null }>(
    `SELECT e.id, e.client_id, c.legal_name_ar AS client_name, e.engagement_type, e.status, e.title, l.lifecycle, l.fields, e.due_date::text AS due_date FROM engagements e JOIN clients c ON c.id = e.client_id LEFT JOIN engagement_letters l ON l.engagement_id = e.id WHERE e.group_engagement_id IS NULL AND c.deleted_at IS NULL`, [], db);
  const instSum = new Map((await many<{ engagement_id: string; s: string }>('SELECT engagement_id, sum(amount) AS s FROM fee_installments GROUP BY 1', [], db)).map((x) => [x.engagement_id, Number(x.s)]));
  let earned = 0; let billedAll = 0; const mix = new Map<string, number>(); const engRows = [];
  for (const e of engs) {
    if (e.lifecycle === 'cancelled') continue;
    const fee = instSum.get(e.id) ?? (e.fields ? letterFee(e.fields).net : 0);
    const prog = await engagementProgress(e.id, db); const ec = claims.filter((c) => c.engagement_id === e.id);
    const b = r2(ec.reduce((t, c) => t + c.amount, 0)); const colNet = r2(ec.reduce((t, c) => t + (c.total ? c.paid * c.amount / c.total : 0), 0));
    if (['signed', 'closed'].includes(e.lifecycle ?? '')) { earned += fee * prog.ratio; billedAll += b; if (fee) mix.set(e.engagement_type, (mix.get(e.engagement_type) ?? 0) + fee); }
    engRows.push({ ...e, fields: undefined, fee, billed: b, collected_net: colNet, remaining: r2(Math.max(0, fee - colNet)), progress: prog });
  }
  const awaiting = engRows.filter((e) => ['issued', 'sent'].includes(e.lifecycle ?? ''));
  const pipeline = [
    { key: 'draft', label: 'مسودات خطابات', n: engRows.filter((e) => !e.lifecycle || e.lifecycle === 'draft').length },
    { key: 'issued', label: 'خطابات صادرة', n: engRows.filter((e) => ['issued', 'sent'].includes(e.lifecycle ?? '')).length },
    { key: 'signed', label: 'موقّعة من العميل', n: engRows.filter((e) => ['signed', 'closed'].includes(e.lifecycle ?? '')).length },
    { key: 'progress', label: 'تحت التنفيذ', n: engRows.filter((e) => e.lifecycle === 'signed' && e.progress.ratio < 1).length },
    { key: 'delivered', label: 'تقارير مسلّمة', n: engRows.filter((e) => e.progress.ratio >= 1).length },
    { key: 'collected', label: 'مُحصّلة بالكامل', n: engRows.filter((e) => e.fee > 0 && e.collected_net >= e.fee - 0.01).length },
  ];
  const office = await one<{ revenue_target: string | null }>('SELECT revenue_target FROM office_settings WHERE id = 1', [], db);
  return { year, billed, collected, collected_gross: collectedGross, collection_rate: billed ? r2(collected / billed * 100) : null, outstanding, aging: B, late_clients: lateClients, months,
    earned: r2(earned), unbilled: r2(Math.max(0, earned - billedAll)), deferred: r2(Math.max(0, billedAll - earned)),
    awaiting_signature: { count: awaiting.length, value: r2(awaiting.reduce((t, e) => t + e.fee, 0)) }, pipeline, mix: [...mix.entries()].map(([k, v]) => ({ type: k, fee: r2(v) })).sort((a, b) => b.fee - a.fee),
    engagements: engRows, target: office?.revenue_target != null ? Number(office.revenue_target) : null };
}

export async function nextNo(prefix: string, table: 'fee_claims' | 'fee_payments', col: string, db?: Queryable) {
  const y = new Date().getFullYear(); const like = `${prefix}-${y}-%`;
  const r = await one<{ n: string }>(`SELECT COALESCE(max(substring(${col} from '\\d+$')::int), 0) AS n FROM ${table} WHERE ${col} LIKE $1`, [like], db);
  return `${prefix}-${y}-${String(Number(r?.n ?? 0) + 1).padStart(4, '0')}`;
}
