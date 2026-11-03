/** تحميل بيانات صافي الأصول المعدّل من قاعدة البيانات */
import { many, one } from '../../db/pool.js';
import { badRequest } from '../../lib/errors.js';
import { buildLocalContext, type LocalContext } from '../ai/local.js';
import { latestRun } from '../analysis/service.js';
import { groupCompaniesForPeriod, listComponents, matchingPeriod } from '../engagements/group.js';
import { confirmedOfficial } from '../official/routes.js';
import { computeCompanyNav, computeGroupNav, equalHolders, type NavInputs, type Register, type GroupCompanyNav, type CompanyNav } from './nav.js';

export async function loadInputs(engagementId: string, periodId: string) {
  return one<{ inputs: NavInputs; status: string; approved_at: string | null; approved_by_name: string | null; updated_at: string }>(`SELECT w.inputs, w.status, w.approved_at, u.full_name AS approved_by_name, w.updated_at FROM valuation_workpapers w LEFT JOIN users u ON u.id = w.approved_by WHERE w.engagement_id = $1 AND w.period_id = $2`, [engagementId, periodId]);
}

export async function companyNav(engagementId: string, periodId: string, ctx?: LocalContext): Promise<{ ctx: LocalContext; nav: CompanyNav; status: string; approved_at: string | null; approved_by: string | null }> {
  const c = ctx ?? await buildLocalContext(engagementId, periodId);
  const w = await loadInputs(engagementId, periodId);
  const nav = computeCompanyNav(c.accounts, c.kf, w?.inputs ?? {}, { start: c.period.start, end: c.period.end, days: c.period.days });
  return { ctx: c, nav, status: w?.status ?? 'none', approved_at: w?.approved_at ?? null, approved_by: w?.approved_by_name ?? null };
}

/** الشركة الأم (أو المنفردة) وفترتها المقابلة لفترة أي شركة في المجموعة */
export async function resolveRoot(engagementId: string, periodId: string) {
  const e = await one<{ id: string; group_engagement_id: string | null }>('SELECT id, group_engagement_id FROM engagements WHERE id = $1', [engagementId]);
  if (!e) throw badRequest('الارتباط غير موجود');
  if (!e.group_engagement_id) return { rootId: e.id, rootPeriodId: periodId };
  const p = await one<{ start_date: string; end_date: string }>('SELECT start_date::text AS start_date, end_date::text AS end_date FROM financial_periods WHERE id = $1', [periodId]);
  const rp = p ? await matchingPeriod(e.group_engagement_id, p.start_date, p.end_date) : null;
  if (!rp) throw badRequest('لا توجد لدى الشركة الأم فترة بالتواريخ نفسها');
  return { rootId: e.group_engagement_id, rootPeriodId: rp.id };
}

export async function loadRegister(rootId: string, parentCtx: LocalContext | null): Promise<Register> {
  const r = await one<{ basis: Register['basis']; contributions_basis: Register['contributions_basis']; holders: Register['holders']; note: string | null }>('SELECT basis, contributions_basis, holders, note FROM shareholder_registers WHERE engagement_id = $1', [rootId]);
  if (r) return { ...r, saved: true };
  // افتراضي: المؤسسون/الشركاء من البيانات النظامية المعتمدة بالتساوي
  const off = await confirmedOfficial([rootId]);
  const names: string[] = [];
  for (const o of off) for (const p of ((o.fields.partners?.value ?? []) as { name: string; nature: string }[])) if (p.nature !== 'work' && !names.includes(p.name)) names.push(p.name);
  return { basis: 'assumed_equal', contributions_basis: 'books', holders: equalHolders(names, parentCtx?.accounts ?? []), note: null, saved: false };
}

export async function groupNav(engagementId: string, periodId: string) {
  const { rootId, rootPeriodId } = await resolveRoot(engagementId, periodId);
  const comps = await listComponents(rootId);
  const list = comps.length ? (await groupCompaniesForPeriod(rootId, rootPeriodId)).companies
    : [{ engagement_id: rootId, client_id: '', name: '', cr_number: null, role: 'parent' as const, ownership_pct: '100', period_id: rootPeriodId, period_label: '', tb_rows: 1 }];
  const cons = comps.length ? await latestRun(rootPeriodId, 'consolidation') : null;
  const C = (cons?.result ?? null) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  const scope = (C?.worksheet?.scope ?? []) as { key: string; investment_cost: string; receivable: string }[];
  const companies: GroupCompanyNav[] = []; const navs: Record<string, Awaited<ReturnType<typeof companyNav>>> = {};
  for (const c of list) {
    let n: Awaited<ReturnType<typeof companyNav>> | null = null;
    if (c.period_id && c.tb_rows > 0 && c.role !== 'at_cost') { try { n = await companyNav(c.engagement_id, c.period_id); navs[c.engagement_id] = n; } catch { n = null; } }
    const sc = scope.find((s) => s.key === c.engagement_id);
    const name = n?.ctx.company ?? c.name;
    companies.push({ engagement_id: c.engagement_id, name, role: c.role, ownership: Number(c.ownership_pct ?? 100), nav: n?.nav ?? null, investment_cost: sc ? Number(sc.investment_cost) : null, receivable_from: sc ? Number(sc.receivable) : null, status: n?.status ?? 'none' });
  }
  const parentN = navs[rootId]; if (!parentN) throw badRequest('لا يوجد ميزان معتمد للشركة الأم لهذه الفترة');
  const pa = parentN.ctx.accounts; const sumFs = (code: string) => -pa.filter((a) => a.fs === code).reduce((t, a) => t + a.closing, 0);
  const off = await confirmedOfficial([rootId]);
  const ov = (k: string) => { for (const o of off) { const v = (o.fields as unknown as Record<string, { value: unknown }>)[k]?.value; if (v != null && v !== '') return Number(v); } return null; };
  const register = await loadRegister(rootId, parentN.ctx);
  const result = computeGroupNav({ companies, consolidation: C ? { equity: Number(C.group_equity_worksheet ?? 0), nci: Number(C.worksheet?.totals?.nci ?? 0), hypothesis: C.hypothesis_unreconciled_not_assets != null ? Number(C.hypothesis_unreconciled_not_assets) : null, unreconciled: Number(C.worksheet?.totals?.unreconciled_total ?? 0), status: String(C.status ?? '') } : null,
    parent: { accounts: pa, capital: sumFs('SHARE_CAPITAL'), apic: sumFs('ADDITIONAL_CAPITAL'), official_capital: ov('capital'), official_paid: ov('paid_capital') }, register });
  return { root_engagement_id: rootId, root_period_id: rootPeriodId, parent_name: parentN.ctx.company, period: parentN.ctx.period, currency: parentN.ctx.currency, companies: companies.map((c) => ({ ...c, nav: c.nav })), parent_accounts: pa.filter((a) => /جاري|شريك|مساهم/.test(a.name) || ['OWNER_CURRENT', 'DUE_FROM_SHAREHOLDERS', 'DUE_TO_SHAREHOLDERS'].includes(a.fs)).map((a) => ({ code: a.code, name: a.name, closing: a.closing })), consolidation_run_at: (cons?.started_at as string | undefined) ?? null, ...result, contexts: navs };
}
export type GroupNavFull = Awaited<ReturnType<typeof groupNav>>;
void many;
