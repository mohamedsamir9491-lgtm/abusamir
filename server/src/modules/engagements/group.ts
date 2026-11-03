/**
 * ارتباطات المجموعات: ارتباط واحد لعميل المجموعة (الشركة الأم) يضم شركات المجموعة.
 * كل شركة = سجل عميل مستقل (تابع لعميل المجموعة) + ارتباط مكوّن بنفس فترات المجموعة،
 * فتبقى موازين الشركات منفصلة تمامًا (لا خلط)، وتعمل عليها كل الشاشات منفردة، وتُجمع في التوحيد والتقرير.
 */
import { Router } from 'express';
import { z } from 'zod';
import { many, one, query, type Queryable } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { notFound, badRequest } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';

export const groupRouter = Router({ mergeParams: true });
groupRouter.use(authenticate, requirePermission('clients.view'));

export const ROLE_LABELS: Record<string, string> = { parent: 'الشركة الأم', subsidiary: 'شركة تابعة (تُوحَّد)', at_cost: 'استثمار بالتكلفة / بلا قوائم' };

export interface Component { id: string; client_id: string; client_name: string; client_name_en: string | null; cr_number: string | null; entity_type: string | null; entity_role: 'subsidiary' | 'at_cost'; ownership_pct: string | null; title: string }

export async function loadGroupRoot(engagementId: string, db?: Queryable) {
  const e = await one<{ id: string; client_id: string; title: string; group_engagement_id: string | null; engagement_type: string; framework: string; currency: string; description: string | null }>(
    'SELECT id, client_id, title, group_engagement_id, engagement_type, framework, currency, description FROM engagements WHERE id = $1', [engagementId], db);
  if (!e) throw notFound('الارتباط غير موجود');
  return e;
}
export async function listComponents(groupId: string, db?: Queryable): Promise<Component[]> {
  return many<Component>(`SELECT e.id, e.client_id, c.legal_name_ar AS client_name, c.legal_name_en AS client_name_en, c.cr_number, c.entity_type, e.entity_role, e.ownership_pct::text AS ownership_pct, e.title
    FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.group_engagement_id = $1 ORDER BY e.created_at`, [groupId], db);
}
/** الفترة المقابلة في ارتباط آخر (نفس تاريخي البداية والنهاية) */
export async function matchingPeriod(engagementId: string, start: string, end: string, db?: Queryable) {
  return one<{ id: string; label: string }>('SELECT id, label FROM financial_periods WHERE engagement_id = $1 AND start_date = $2 AND end_date = $3 LIMIT 1', [engagementId, start, end], db);
}
/** كل الشركات (الأم + المكونات) لفترة المجموعة، مع الفترة المقابلة لكل شركة وحالة ميزانها */
export async function groupCompaniesForPeriod(groupId: string, periodId: string, db?: Queryable) {
  const g = await loadGroupRoot(groupId, db);
  const p = await one<{ start_date: string; end_date: string; label: string }>('SELECT start_date::text AS start_date, end_date::text AS end_date, label FROM financial_periods WHERE id = $1 AND engagement_id = $2', [periodId, groupId], db);
  if (!p) throw notFound('فترة المجموعة غير موجودة');
  const parentClient = await one<{ legal_name_ar: string; cr_number: string | null }>('SELECT legal_name_ar, cr_number FROM clients WHERE id = $1', [g.client_id], db);
  const comps = await listComponents(groupId, db);
  const tbCount = async (pid: string | null) => pid ? Number((await one<{ c: string }>('SELECT count(*) AS c FROM trial_balance_entries WHERE period_id = $1', [pid], db))?.c ?? 0) : 0;
  const out = [{ engagement_id: g.id, client_id: g.client_id, name: parentClient?.legal_name_ar ?? g.title, cr_number: parentClient?.cr_number ?? null, role: 'parent' as 'parent' | 'subsidiary' | 'at_cost', ownership_pct: '100', period_id: periodId as string | null, period_label: p.label, tb_rows: await tbCount(periodId) }];
  for (const c of comps) {
    const mp = await matchingPeriod(c.id, p.start_date, p.end_date, db);
    out.push({ engagement_id: c.id, client_id: c.client_id, name: c.client_name, cr_number: c.cr_number, role: c.entity_role, ownership_pct: c.ownership_pct ?? '100', period_id: mp?.id ?? null, period_label: mp?.label ?? '—', tb_rows: await tbCount(mp?.id ?? null) });
  }
  return { group: g, period: p, companies: out };
}

const companySchema = z.object({
  client_id: z.string().uuid().optional(),
  company: z.object({ legal_name_ar: z.string().min(2).max(300), legal_name_en: z.string().max(300).nullable().optional(), entity_type: z.enum(['llc', 'jsc', 'sole', 'partnership', 'branch', 'nonprofit', 'other']).default('llc'), cr_number: z.string().max(50).nullable().optional() }).optional(),
  entity_role: z.enum(['subsidiary', 'at_cost']).default('subsidiary'),
  ownership_pct: z.string().regex(/^\d+(\.\d+)?$/).default('100'),
});

groupRouter.get('/', async (req, res, next) => {
  try {
    const g = await loadGroupRoot(String((req.params as { id: string }).id));
    if (g.group_engagement_id) { res.json({ is_component: true, group_engagement_id: g.group_engagement_id, components: [] }); return; }
    const comps = await listComponents(g.id);
    const withPeriods = await Promise.all(comps.map(async (c) => ({ ...c, periods: await many(`SELECT p.id, p.label, p.start_date::text AS start_date, p.end_date::text AS end_date, p.role,
      (SELECT count(*) FROM trial_balance_entries t WHERE t.period_id = p.id) AS tb_rows,
      (SELECT max(started_at) FROM analysis_runs a WHERE a.period_id = p.id AND a.run_type = 'statements' AND a.status = 'completed') AS statements_at
      FROM financial_periods p WHERE p.engagement_id = $1 ORDER BY p.start_date`, [c.id]) })));
    res.json({ is_component: false, components: withPeriods, role_labels: ROLE_LABELS, setup: (await one<{ group_setup: unknown }>('SELECT group_setup FROM engagements WHERE id = $1', [g.id]))?.group_setup ?? null });
  } catch (e) { next(e); }
});

/** إضافة شركة للمجموعة: شركة جديدة (يُنشأ سجلها تابعًا لعميل المجموعة) أو عميل قائم */
groupRouter.post('/', requirePermission('clients.manage'), async (req, res, next) => {
  try {
    const g = await loadGroupRoot(String((req.params as { id: string }).id));
    if (g.group_engagement_id) throw badRequest('هذا الارتباط شركة ضمن مجموعة؛ أضف الشركات من ارتباط المجموعة');
    const d = parse(companySchema, req.body);
    const own = Number(d.ownership_pct); if (!(own > 0 && own <= 100)) throw badRequest('نسبة الملكية يجب أن تكون أكبر من 0 وحتى 100');
    const parentClient = await one<{ id: string; fiscal_year_end_month: number; fiscal_year_end_day: number; accounting_framework: string; reporting_currency: string }>('SELECT id, fiscal_year_end_month, fiscal_year_end_day, accounting_framework, reporting_currency FROM clients WHERE id = $1', [g.client_id]);
    let clientId = d.client_id ?? null;
    if (!clientId) {
      if (!d.company) throw badRequest('حدد شركة قائمة أو أدخل بيانات الشركة الجديدة');
      const dup = await one<{ id: string }>(`SELECT id FROM clients WHERE deleted_at IS NULL AND parent_client_id = $1 AND legal_name_ar = $2`, [g.client_id, d.company.legal_name_ar.trim()]);
      if (dup) throw badRequest(`الشركة «${d.company.legal_name_ar}» موجودة بالفعل ضمن هذه المجموعة؛ اخترها من القائمة`);
      const c = await one<{ id: string }>(`INSERT INTO clients (legal_name_ar, legal_name_en, entity_type, cr_number, fiscal_year_end_month, fiscal_year_end_day, accounting_framework, reporting_currency, parent_client_id, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [d.company.legal_name_ar.trim(), d.company.legal_name_en ?? null, d.company.entity_type, d.company.cr_number ?? null, parentClient!.fiscal_year_end_month, parentClient!.fiscal_year_end_day, parentClient!.accounting_framework, parentClient!.reporting_currency, g.client_id, req.user!.id]);
      clientId = c!.id;
    } else {
      if (clientId === g.client_id) throw badRequest('لا يجوز إضافة الشركة الأم نفسها كشركة تابعة');
      const c = await one('SELECT id FROM clients WHERE id = $1 AND deleted_at IS NULL', [clientId]); if (!c) throw notFound('العميل غير موجود');
    }
    const exists = await one('SELECT 1 FROM engagements WHERE group_engagement_id = $1 AND client_id = $2', [g.id, clientId]);
    if (exists) throw badRequest('هذه الشركة مضافة بالفعل إلى المجموعة');
    const client = await one<{ legal_name_ar: string }>('SELECT legal_name_ar FROM clients WHERE id = $1', [clientId]);
    const row = await one<{ id: string }>(`INSERT INTO engagements (client_id, title, engagement_type, framework, currency, description, created_by, group_engagement_id, entity_role, ownership_pct)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [clientId, `${g.title} – ${client!.legal_name_ar}`, g.engagement_type, g.framework, g.currency, null, req.user!.id, g.id, d.entity_role, d.ownership_pct]);
    await query(`INSERT INTO financial_periods (client_id, engagement_id, label, start_date, end_date, period_type, role)
      SELECT $1, $2, label, start_date, end_date, period_type, role FROM financial_periods WHERE engagement_id = $3`, [clientId, row!.id, g.id]);
    await audit(req, { action: 'group.company_added', entityType: 'engagement', entityId: row!.id, clientId: g.client_id, details: { group: g.id, company: client!.legal_name_ar, role: d.entity_role, ownership_pct: d.ownership_pct } });
    res.status(201).json({ id: row!.id });
  } catch (e) { next(e); }
});

groupRouter.put('/:cid', requirePermission('clients.manage'), async (req, res, next) => {
  try {
    const gid = String((req.params as { id: string }).id);
    const d = parse(z.object({ entity_role: z.enum(['subsidiary', 'at_cost']).optional(), ownership_pct: z.string().regex(/^\d+(\.\d+)?$/).optional() }), req.body);
    if (d.ownership_pct && !(Number(d.ownership_pct) > 0 && Number(d.ownership_pct) <= 100)) throw badRequest('نسبة الملكية يجب أن تكون أكبر من 0 وحتى 100');
    const r = await one<{ id: string }>(`UPDATE engagements SET entity_role = COALESCE($3, entity_role), ownership_pct = COALESCE($4::numeric, ownership_pct), updated_at = now() WHERE id = $2 AND group_engagement_id = $1 RETURNING id`, [gid, req.params.cid, d.entity_role ?? null, d.ownership_pct ?? null]);
    if (!r) throw notFound('الشركة غير موجودة في هذه المجموعة');
    await audit(req, { action: 'group.company_updated', entityType: 'engagement', entityId: r.id, details: d });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** إزالة شركة من المجموعة: يُحذف ارتباطها المكوّن وبياناته (موازين، استيرادات، ملاحظات)؛ سجل العميل يبقى */
groupRouter.delete('/:cid', requirePermission('data.delete'), async (req, res, next) => {
  try {
    const gid = String((req.params as { id: string }).id);
    const c = await one<{ id: string; client_id: string; title: string }>('SELECT id, client_id, title FROM engagements WHERE id = $1 AND group_engagement_id = $2', [req.params.cid, gid]);
    if (!c) throw notFound('الشركة غير موجودة في هذه المجموعة');
    await query('DELETE FROM engagements WHERE id = $1', [c.id]);
    await audit(req, { action: 'group.company_removed', entityType: 'engagement', entityId: c.id, clientId: c.client_id, details: { title: c.title } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** إعداد التوحيد محفوظ على ارتباط المجموعة (حسابات الاستثمار والجاري لكل شركة) */
groupRouter.put('/setup/save', requirePermission('analysis.run'), async (req, res, next) => {
  try {
    const gid = String((req.params as { id: string }).id);
    const d = parse(z.object({ setup: z.record(z.string(), z.unknown()) }), req.body);
    await query('UPDATE engagements SET group_setup = $2, updated_at = now() WHERE id = $1', [gid, JSON.stringify(d.setup)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- اقتراح إعداد التوحيد من أسماء الحسابات ----------
const STOP = new Set(['شركه', 'شركات', 'تابعه', 'للشركات', 'استثمارات', 'استثمارت', 'استثمار', 'في', 'جاري', 'حساب', 'ذمم', 'مدينه', 'دائنه', 'مستحق', 'مستحقه', 'من', 'الي', 'علي', 'قابضه', 'محدوده', 'مسووليه', 'ذات', 'مساهمه', 'قرض', 'company', 'co', 'ltd', 'llc', 'holding', 'for', 'and']);
export function nameTokens(s: string | null | undefined): string[] {
  const n = String(s ?? '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return n.split(/\s+/).map((t) => t.replace(/^(وال|بال|لل|ال)(?=\p{L}{3,})/u, '')).filter((t) => t.length >= 3 && !STOP.has(t));
}
export const hits = (accName: string, company: string[]) => { const a = nameTokens(accName); return company.filter((t) => a.some((x) => x === t || (t.length >= 4 && (x.startsWith(t) || t.startsWith(x))))).length; };
type Acc = { code: string; name: string; net: number };
async function tbAccounts(periodId: string | null): Promise<Acc[]> {
  if (!periodId) return [];
  const rows = await many<{ account_code: string; account_name: string | null; net: string }>(`SELECT account_code, max(account_name) AS account_name, sum(closing_debit - closing_credit)::text AS net FROM trial_balance_entries WHERE period_id = $1 GROUP BY account_code ORDER BY account_code`, [periodId]);
  return rows.map((r) => ({ code: r.account_code, name: r.account_name ?? '', net: Number(r.net) }));
}
export async function prefillSetup(groupId: string, periodId: string) {
  const { group, companies } = await groupCompaniesForPeriod(groupId, periodId);
  const parentAcc = await tbAccounts(periodId);
  const parentTokens = nameTokens(companies[0]!.name);
  const best = new Map<string, { eng: string; score: number }>(); // كل حساب لدى الأم يُنسب لشركة واحدة فقط (الأعلى تطابقًا)
  for (const c of companies.slice(1)) { const t = nameTokens(c.name); for (const a of parentAcc) { const h = hits(a.name, t); if (h > 0 && (!best.has(a.code) || best.get(a.code)!.score < h)) best.set(a.code, { eng: c.engagement_id, score: h }); } }
  const out = [];
  for (const c of companies.slice(1)) {
    const mine = parentAcc.filter((a) => best.get(a.code)?.eng === c.engagement_id);
    const inv = mine.filter((a) => /استثم/.test(a.name));
    const others = mine.filter((a) => !/استثم/.test(a.name));
    const subAcc = c.role === 'subsidiary' ? await tbAccounts(c.period_id) : [];
    const inSub = subAcc.filter((a) => hits(a.name, parentTokens) > 0 && !/رأس المال|راس المال/.test(a.name));
    out.push({ engagement_id: c.engagement_id, name: c.name, role: c.role, ownership_pct: c.ownership_pct, period_id: c.period_id, period_label: c.period_label, tb_rows: c.tb_rows,
      suggested: {
        investment_codes_in_parent: inv.map((a) => a.code),
        sub_account_codes_in_parent: c.role === 'subsidiary' ? others.map((a) => a.code) : [],
        parent_account_codes_in_sub: inSub.map((a) => a.code),
        receivable_codes_in_parent: c.role === 'at_cost' ? others.filter((a) => a.net >= 0).map((a) => a.code) : [],
        payable_codes_in_parent: c.role === 'at_cost' ? others.filter((a) => a.net < 0).map((a) => a.code) : [],
      },
      accounts: Object.fromEntries([...mine, ...inSub].map((a) => [a.code, { name: a.name, net: a.net }])) });
  }
  const setup = (await one<{ group_setup: unknown }>('SELECT group_setup FROM engagements WHERE id = $1', [group.id]))?.group_setup ?? null;
  return { parent: { ...companies[0], accounts: Object.fromEntries(parentAcc.map((a) => [a.code, { name: a.name, net: a.net }])) }, companies: out, setup };
}
groupRouter.get('/prefill', async (req, res, next) => {
  try { res.json(await prefillSetup(String((req.params as { id: string }).id), String(req.query.period_id ?? ''))); } catch (e) { next(e); }
});
