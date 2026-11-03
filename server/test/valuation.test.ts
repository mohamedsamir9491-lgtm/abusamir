import { describe, it, expect } from 'vitest';
import { computeCompanyNav, computeGroupNav, equalHolders, matchHolderAccount, suggestCategory } from '../src/modules/valuation/nav.js';
import { deriveRequests } from '../src/modules/requests/generate.js';
import type { Acc, LocalContext } from '../src/modules/ai/local.js';

const A = (code: string, name: string, fs: string, opening: number, closing: number, debit = 0, credit = 0): Acc => ({ code, name, fs, label: fs, section: '', statement: ['REVENUE', 'ADMIN_EXP'].includes(fs) ? 'pl' : 'sfp', opening, debit, credit, closing });
const P = { start: '2026-01-01', end: '2026-11-01', days: 305 };
const OSOS = [A('106002', 'أثاث', 'PPE', 60833.31, 60833.31), A('106007', 'مجمع اهتلاك اثاث', 'ACC_DEP', -11829.27, -11829.27), A('106013', 'أجهزة ومعدات', 'PPE', 20580.10, 20580.10), A('106014', 'مجمع اهلاك معدات واجهزة', 'ACC_DEP', -3727.10, -3727.10),
  A('202005', 'جاري الشريك مشاري الرشدان', 'OWNER_CURRENT', 60000, 60000), A('202006', 'جاري الشريك بندر العجمي', 'OWNER_CURRENT', 199528.59, 14528.59), A('300100', 'رأس المال', 'SHARE_CAPITAL', -500000, -500000), A('300102', 'راس المال الإضافي المدفوع', 'ADDITIONAL_CAPITAL', -1000000, -1000000)];

describe('adjusted net assets per company', () => {
  it('suggests categories and pairs accumulated depreciation by name', () => {
    expect(suggestCategory('أثاث و معدات', 'ppe')).toBe('furniture'); expect(suggestCategory('أجهزة ومعدات', 'ppe')).toBe('office_equipment'); expect(suggestCategory('سيارات', 'ppe')).toBe('vehicles');
    const n = computeCompanyNav(OSOS, { total_equity: 1108989, total_assets: 1110521 }, {}, P);
    expect(n.assets.map((a) => [a.code, a.accum_codes[0], a.rate])).toEqual([['106002', '106007', 10], ['106013', '106014', 15]]);
    expect(n.assets[0].additional).toBe(5083.33); expect(n.assets[1].additional).toBe(2579.56);
    expect(n.adjustments.total).toBe(-7662.89); expect(n.adjusted_nav).toBe(1101326.11);
  });
  it('applies an edited rate, an owner valuation and the half-period convention for additions', () => {
    const n = computeCompanyNav(OSOS, { total_equity: 1108989 }, { assets: { '106002': { rate: 20 }, '106013': { method: 'owner', owner_value: 20000 } } }, P);
    expect(n.assets[0].additional).toBe(10166.66); expect(n.assets[1].adjustment).toBe(3147); // 20,000 − 16,853
    const g = computeCompanyNav([A('106002', 'أثاث و معدات', 'PPE', 0, 3255.91, 3255.91)], { total_equity: 299834.63 }, {}, P);
    expect(g.assets[0].additional).toBe(136.03);
  });
  it('depreciates a right-of-use asset only when the lease term is known', () => {
    const accs = [A('100101', 'حق استخدام الأصول', 'ROU_ASSETS', 0, 1265299.74), A('2201', 'التزامات عقود الإيجار', 'LEASE_LIAB_NON_CURRENT', 0, -1115299.74)];
    expect(computeCompanyNav(accs, { total_equity: 0 }, {}, P).lease!.status).toBe('needs_input');
    const l = computeCompanyNav(accs, { total_equity: 0 }, { lease: { term_months: 60, start_date: '2026-01-01' } }, P).lease!;
    expect(l.dep_additional).toBe(211461.05); expect(l.adjustment).toBe(-211461.05);
  });
});

describe('shareholders and group value', () => {
  it('splits equally, matches current accounts by two name parts and absorbs rounding', () => {
    const names = ['عبدالمجيد عبدالله حمد بن نفيسه', 'بندر مانع خرصان العجمي', 'عبدالرحمن عبدالله فهم البيشي'];
    const h = equalHolders(names, OSOS); expect(h.map((x) => x.pct)).toEqual([33.3333, 33.3333, 33.3334]);
    expect(h[1].account_code).toBe('202006'); expect(matchHolderAccount('مشاري', OSOS)).toBeNull();
    const parentNav = computeCompanyNav(OSOS, { total_equity: 1108989 }, {}, P);
    const g = computeGroupNav({ companies: [{ engagement_id: 'p', name: 'الأم', role: 'parent', ownership: 100, nav: parentNav, investment_cost: null, receivable_from: null, status: 'none' }],
      consolidation: { equity: 994334.84, nci: 0, hypothesis: 974732.60, unreconciled: 19602.24, status: 'incomplete' }, parent: { accounts: OSOS, capital: 500000, apic: 1000000, official_capital: 500000, official_paid: 125000 }, register: { basis: 'assumed_equal', contributions_basis: 'books', holders: h, saved: false } });
    expect(g.nav).toBe(986671.95); expect(g.nav_low).toBe(967069.71); expect(g.contributions.amount).toBe(1500000); expect(g.contributions.official).toBe(1125000);
    expect(g.holders.reduce((t, x) => t + x.share, 0)).toBeCloseTo(g.nav, 2);
    expect(g.holders[1].net).toBe(Math.round((g.holders[1].share - 14528.59) * 100) / 100);
    expect(g.unmatched_accounts.map((u) => u.code)).toEqual(['202005']);
  });
});

describe('client requests', () => {
  const ctx = (over: Partial<LocalContext>): LocalContext => ({ engagementId: 'p', periodId: 'pp', clientId: 'c', company: 'الأم', currency: 'SAR', entityType: 'jsc', period: { label: 'x', start: P.start, end: P.end, phrase: '', full: false, days: 305 }, accounts: OSOS, kf: { total_assets: 1110521, net_income: -98508.26 }, st: {} as never, ratios: [] as never, prior: null, variance: [], findings: [], group: null, official: [{ title: 'نظام', type: 'articles_of_association', fields: {} }, { title: 'سجل', type: 'commercial_registration', fields: {} }], statementsGeneratedAt: null, ...over });
  it('asks only for what resolves a figure and skips immaterial items', () => {
    const accounts = [...OSOS, A('300101', 'أرباح وخساير مرحلة', 'RETAINED_EARNINGS', 292502.74, 292502.74), A('101007', 'بنك ساب', 'CASH', 0, 41655), A('101008', 'البنك الأهلي', 'CASH', 0, 0.25)];
    const r = deriveRequests({ companies: [{ engagementId: 'p', periodId: 'pp', name: 'الأم', role: 'parent', ctx: ctx({ accounts, findings: [{ ref: 'F-1', rule: 'DOC-002', severity: 'high', title: 'المدفوع 125,000.00 من 500,000.00 حسب نظام.pdf', description: '', amount: '375000', category: 'x' }, { ref: 'F-2', rule: 'LA-001', severity: 'medium', title: 'لا استهلاك', description: '', amount: '81413.41', category: 'x' }, { ref: 'F-3', rule: 'LA-007', severity: 'low', title: 'تركز', description: '', amount: '44625', category: 'x', account: '400017' }] }), investment: null, receivable: null },
      { engagementId: 'd', periodId: null, name: 'ديزرت', role: 'at_cost', ctx: null, investment: 300000, receivable: 162737.84 }], register: { basis: 'assumed_equal', contributions_basis: 'books', holders: [{ name: 'بندر مانع خرصان العجمي', pct: 100 }], saved: false }, consolidationRegister: [], periodEnd: '1/11/2026' });
    const keys = r.map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining(['contributions', 'losses_resolution', 'asset_register', 'shareholders_register', 'tb', 'bank_statements', 'owner_valuation']));
    expect(keys.some((k) => k.startsWith('expense:'))).toBe(false); // إيجار مكتب بنسبة 4% من الأصول: لا طلب
    expect(r.find((x) => x.key === 'bank_statements')!.title).not.toContain('الأهلي');
    expect(r.find((x) => x.key === 'contributions')!.reason).not.toContain('.pdf');
    expect(r.find((x) => x.key === 'tb')!.priority).toBe('essential');
    expect(r.every((x) => !/خطة|موازنة|12 شهر/.test(x.title))).toBe(true);
  });
});
