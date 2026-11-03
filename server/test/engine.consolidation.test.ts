import { describe, it, expect } from 'vitest';
import { consolidate } from '../src/engine/consolidation.js';
import { buildStatements } from '../src/engine/statements.js';
import { computeRatios } from '../src/engine/ratios.js';
import { classifyAccount } from '../src/engine/classification.js';
import { validateTrialBalance } from '../src/engine/trialBalance.js';
import type { TbEntry } from '../src/engine/types.js';

const E = (code: string, name: string, dr: string, cr: string): TbEntry => ({ account_code: code, account_name: name, opening_debit: '0', opening_credit: '0', period_debit: '0', period_credit: '0', closing_debit: dr, closing_credit: cr });
// الشركة الأم (بيانات اختبار): استثمار 240 في تابعة رأس مالها 300، والتابعة تسجل 60 مستحقة من الأم
const PARENT: TbEntry[] = [E('1101', 'البنك', '500', '0'), E('1060', 'استثمار في التابعة س', '240', '0'), E('2020', 'جاري الشريك أحمد', '70', '0'), E('3100', 'رأس المال', '0', '800'), E('3200', 'أرباح مرحلة', '20', '0'), E('4100', 'مصروف إداري', '0', '0'), E('5100', 'إيرادات', '0', '30')];
const SUB: TbEntry[] = [E('1101', 'البنك', '250', '0'), E('2050', 'جاري شركة الأم', '60', '0'), E('3100', 'رأس المال', '0', '300'), E('4100', 'مصروف', '40', '0'), E('5100', 'مبيعات', '0', '50')];

describe('debit balances inside liability groups', () => {
  it('classifies a partner current account by its balance side, not by its code group', () => {
    expect(classifyAccount('2020', 'جاري الشريك أحمد', 'debit').fs_line_code).toBe('DUE_FROM_SHAREHOLDERS');
    expect(classifyAccount('2020', 'جاري الشريك أحمد', 'credit').fs_line_code).toBe('DUE_TO_SHAREHOLDERS');
    expect(classifyAccount('2050', 'جاري شركة الأم', 'debit').account_type).toBe('asset');
  });
  it('keeps the accounting equation with partner receivables as assets', () => {
    const s = buildStatements({ current: PARENT, periodLabel: 't' });
    expect(s.sfp.balanced).toBe(true);
    expect(s.key_figures.total_equity).toBe('810.00'); // 800 - 20 + 30
    expect(s.key_figures.total_assets).toBe('810.00'); // 500 + 240 + 70
    expect(validateTrialBalance(PARENT).findings.some((f) => f.rule_code === 'TB-025')).toBe(true);
  });
});

describe('consolidation engine', () => {
  it('eliminates investment and intra-group balances without double counting', () => {
    const r = consolidate({ parent: { key: 'p', label: 'الأم', entries: PARENT, periodLabel: 't' }, subsidiaries: [{ key: 's', label: 'التابعة س', entries: SUB, periodLabel: 't', ownership_pct: '100', investment_codes_in_parent: ['1060'], parent_account_codes_in_sub: ['2050'], sub_account_codes_in_parent: [] }], at_cost: [] });
    expect(r.parent.book_equity).toBe('810.00');
    const s = r.subsidiaries[0];
    expect(s.sub_equity).toBe('310.00'); expect(s.sub_claim_on_parent).toBe('60.00'); expect(s.implied_paid_capital).toBe('240.00'); expect(s.investment_vs_implied_paid_capital).toBe('0.00');
    expect(s.sub_net_assets_external).toBe('250.00'); // 310 - 60
    expect(r.group_equity_before_adjustments).toBe('820.00'); // 810 - 240 + 250
    expect(r.checks.unmatched_intercompany_total).toBe('60.00');
    expect(r.fair_value.status).toBe('not_available');
    expect(r.sensitivity.some((x) => x.key === 'ic_s')).toBe(true);
  });
  it('applies ownership percentage and reports NCI', () => {
    const r = consolidate({ parent: { key: 'p', label: 'الأم', entries: PARENT, periodLabel: 't' }, subsidiaries: [{ key: 's', label: 'س', entries: SUB, periodLabel: 't', ownership_pct: '60', investment_codes_in_parent: ['1060'], parent_account_codes_in_sub: ['2050'], sub_account_codes_in_parent: [] }], at_cost: [] });
    expect(r.subsidiaries[0].parent_share).toBe('150.00'); expect(r.subsidiaries[0].nci).toBe('100.00'); expect(r.group_equity_before_adjustments).toBe('720.00');
  });
  it('refuses to consolidate an unbalanced statement', () => {
    const bad = [...SUB, E('9999', 'خطأ', '5', '0')];
    expect(() => consolidate({ parent: { key: 'p', label: 'الأم', entries: PARENT, periodLabel: 't' }, subsidiaries: [{ key: 's', label: 'س', entries: bad, periodLabel: 't', ownership_pct: '100', investment_codes_in_parent: ['1060'], parent_account_codes_in_sub: ['2050'], sub_account_codes_in_parent: [] }], at_cost: [] })).toThrow();
  });
  it('separates documented adjustments from the book figures', () => {
    const r = consolidate({ parent: { key: 'p', label: 'الأم', entries: PARENT, periodLabel: 't' }, subsidiaries: [], at_cost: [{ key: 'd', label: 'خاملة', investment_codes_in_parent: ['1060'], receivable_codes_in_parent: [] }], adjustments: [{ ref: 'ADJ-1', description: 'شطب', amount: '-10', evidence: 'مستند', affects: 'parent' }] });
    expect(r.group_equity_before_adjustments).toBe('810.00'); expect(r.adjusted_net_assets).toBe('800.00'); expect(r.at_cost[0].investment_cost).toBe('240.00');
  });
});

describe('ratio meaningfulness', () => {
  it('flags ratios with tiny denominators or negative numerators as not meaningful', () => {
    const r = Object.fromEntries(computeRatios({ current_assets: '272617.84', current_liabilities: '1532', operating_profit: '-98443.5', finance_cost: '64.76', net_income: '-98508.26', operating_cash_flow: '-196912.53', total_liabilities: '1532', total_equity: '1108989' }).map((x) => [x.code, x]));
    expect(r.current_ratio.status).toBe('not_meaningful'); expect(r.interest_coverage.status).toBe('not_meaningful'); expect(r.ocf_to_net_income.status).toBe('not_meaningful');
    expect(r.debt_to_equity.status).toBe('ok'); expect(r.debt_to_equity.value).toBe('0.0014');
  });
});

// ---- ورقة عمل التوحيد: قيود متوازنة، بلا حساب موازنة، بنود معلقة ظاهرة، مطابقة الاستثمار برأس المال من الرصيد الافتتاحي والحركة ----
const M = (code: string, name: string, m: { od?: string; oc?: string; pd?: string; pc?: string; cd?: string; cc?: string }): TbEntry => ({ account_code: code, account_name: name, opening_debit: m.od ?? '0', opening_credit: m.oc ?? '0', period_debit: m.pd ?? '0', period_credit: m.pc ?? '0', closing_debit: m.cd ?? '0', closing_credit: m.cc ?? '0' });
// أرقام حقيقية من حالة أسس القابضة / جراند إستيتس (الحسابات ذات الصلة فقط مع نقد موازن)
const OSOS: TbEntry[] = [M('1101', 'بنك', { od: '922147.83', pc: '160634', cd: '761513.83' }), M('106021', 'استثمار في جراند', { od: '77852.17', pd: '160634', cd: '238486.17' }), M('3100', 'رأس المال', { oc: '1000000', cc: '1000000' })];
const GRAND: TbEntry[] = [M('1101', 'بنك', { cd: '237686.81' }), M('202005', 'جاري شركة أسس القابضة', { od: '222147.82', pc: '160000', cd: '62147.82' }), M('3100', 'رأس المال', { oc: '300000', cc: '300000' }), M('3200', 'أرباح وخسائر مرحلة', { od: '126511.5', cd: '126511.5' }), M('5100', 'مبيعات', { cc: '126346.13' })];
const run = (subExtra: Partial<Parameters<typeof consolidate>[0]['subsidiaries'][0]> = {}, parent: TbEntry[] = OSOS, sub: TbEntry[] = GRAND) => consolidate({ parent: { key: 'p', label: 'الأم', entries: parent, periodLabel: 't' }, subsidiaries: [{ key: 'g', label: 'جراند', entries: sub, periodLabel: 't', ownership_pct: '100', investment_codes_in_parent: ['106021'], parent_account_codes_in_sub: ['202005'], sub_account_codes_in_parent: [], ...subExtra }], at_cost: [] });

describe('consolidation worksheet', () => {
  const INC = { control_since: '2025-01-01', control_basis: 'incorporation' as const };
  it('posts balanced elimination entries only and never balances through equity or a suspense line', () => {
    const r = run(INC);
    for (const e of r.worksheet.entries) expect(e.total_debit).toBe(e.total_credit);
    expect(r.worksheet.totals.eliminations_debit).toBe(r.worksheet.totals.eliminations_credit);
    expect(r.worksheet.totals.equation_difference).toBe('0.00');
    expect(r.worksheet.rows.some((x) => /SUSPENSE|PLUG|ACQ_DIFF/.test(x.code))).toBe(false);
    expect(r.worksheet.entries.flatMap((e) => e.lines).some((l) => /SUSPENSE|PLUG|ACQ_DIFF/.test(l.line_code))).toBe(false);
    const eq = r.worksheet.rows.filter((x) => x.section === 'equity').reduce((a, x) => a + Number(x.consolidated), 0);
    expect(eq.toFixed(2)).toBe(r.group_equity_worksheet);
    expect(r.worksheet.rows.find((x) => x.code === 'SHARE_CAPITAL')?.consolidated).toBe('1000000.00'); // رأس مال التابعة استُبعد كاملًا (238,486.17 + 61,513.83)
  });
  it('reconciles investment vs capital from opening balance and movements (633.99 = 634.00 − 0.01)', () => {
    const s = run(INC).worksheet.subsidiaries[0];
    expect(s.capital_matching.implied_paid_capital).toBe('237852.18');
    expect(s.capital_matching.investment_vs_implied_paid_capital).toBe('633.99');
    expect(s.capital_matching.identity_opening).toBe('0.01');   // (رأس المال − المطالبة) − الاستثمار عند الافتتاح
    expect(s.capital_matching.identity_period).toBe('634.00');  // ما دفعته الأم في الفترة − ما أثبتته التابعة
    expect(s.capital_matching.identity_reconciles).toBe(true);
    expect(s.capital_matching.claim_matched_to_unpaid_capital).toBe('61513.83');
    expect(s.capital_matching.claim_classification).toContain('مؤقت');
    expect(s.capital_matching.unmatched_sub_claim).toBe('633.99');
  });
  it('bridges the matching difference (633.99) to the equity contribution (799.36) via post-control results (165.37)', () => {
    const r = run(INC); const b = r.worksheet.subsidiaries[0].bridge;
    expect(b.post_acquisition_results).toBe('-165.37');
    expect(b.contribution_with_difference_pending).toBe('-165.37');
    expect(b.contribution_if_difference_written_off).toBe('-799.36');
    expect(r.subsidiaries[0].contribution_to_group_equity).toBe('-799.36');
  });
  it('leaves unproven differences in their original line, logs them in the register, and withholds completion', () => {
    const r = run(INC);
    expect(r.status).toBe('incomplete');
    const claimRow = r.worksheet.rows.find((x) => x.code === 'RELATED_PARTY_DR')!;
    expect(claimRow.consolidated).toBe('633.99'); expect(claimRow.unreconciled).toBe('633.99'); // بقي أصلًا لدى التابعة، لا في حساب معلق
    expect(r.worksheet.totals.unreconciled_total).toBe('633.99');
    expect(r.worksheet.register.filter((x) => x.equity_effect === 'possible').map((x) => x.amount)).toEqual(['633.99']);
    expect(r.worksheet.register.some((x) => x.equity_effect === 'none' && x.amount === '61513.83')).toBe(true); // التصنيف المؤقت مسجل
    expect(r.group_equity_worksheet).toBe('999834.63');               // 1,000,000 − 165.37
    expect(r.hypothesis_unreconciled_not_assets).toBe('999200.64');   // فرضية فقط
    expect(r.group_equity_before_adjustments).toBe(r.hypothesis_unreconciled_not_assets);
    expect(r.pending_reasons.some((x) => x.includes('سجل الفروق'))).toBe(true);
  });
  it('does not classify the claim as unpaid capital when told its nature is other: both sides stay open with no equity effect', () => {
    const r = run({ ...INC, claim_nature: 'other' });
    const s = r.worksheet.subsidiaries[0];
    expect(s.capital_matching.claim_matched_to_unpaid_capital).toBe('0.00');
    expect(s.capital_matching.capital_not_covered).toBe('61513.83');
    expect(r.worksheet.rows.find((x) => x.code === 'SHARE_CAPITAL')?.consolidated).toBe('1061513.83');
    expect(r.worksheet.rows.find((x) => x.code === 'RELATED_PARTY_DR')?.consolidated).toBe('62147.82');
    expect(r.worksheet.totals.equation_difference).toBe('0.00');
    expect(r.worksheet.register.some((x) => x.line_code === 'SHARE_CAPITAL' && x.amount === '61513.83')).toBe(true);
  });
  it('treats a documented unpaid subscription as supported and keeps a controlled company without data as incomplete scope', () => {
    const ok = consolidate({ parent: { key: 'p', label: 'الأم', entries: PARENT, periodLabel: 't' }, subsidiaries: [{ key: 's', label: 'س', entries: SUB, periodLabel: 't', ownership_pct: '100', investment_codes_in_parent: ['1060'], parent_account_codes_in_sub: ['2050'], sub_account_codes_in_parent: [], control_since: '2024-06-01', control_basis: 'incorporation', claim_nature: 'unpaid_subscription' }], at_cost: [] });
    expect(ok.status).toBe('supported'); expect(ok.worksheet.totals.unreconciled_total).toBe('0.00'); expect(ok.group_equity_worksheet).toBe('820.00'); expect(ok.worksheet.entries[0].support).toBe('documented');
    const prov = consolidate({ parent: { key: 'p', label: 'الأم', entries: PARENT, periodLabel: 't' }, subsidiaries: [{ key: 's', label: 'س', entries: SUB, periodLabel: 't', ownership_pct: '100', investment_codes_in_parent: ['1060'], parent_account_codes_in_sub: ['2050'], sub_account_codes_in_parent: [], control_since: '2024-06-01', control_basis: 'incorporation' }], at_cost: [] });
    expect(prov.status).toBe('incomplete'); expect(prov.worksheet.entries[0].support).toBe('provisional');
    const scope = consolidate({ parent: { key: 'p', label: 'الأم', entries: PARENT, periodLabel: 't' }, subsidiaries: [], at_cost: [{ key: 'd', label: 'خاملة', investment_codes_in_parent: ['1060'], receivable_codes_in_parent: [], control: 'controlled' }] });
    expect(scope.status).toBe('incomplete'); expect(scope.pending_reasons.some((x) => x.includes('نطاق التوحيد'))).toBe(true);
  });
  it('leaves an investment premium un-eliminated and flags it instead of creating a difference account', () => {
    const r = consolidate({ parent: { key: 'p', label: 'الأم', entries: PARENT, periodLabel: 't' }, subsidiaries: [{ key: 's', label: 'س', entries: SUB, periodLabel: 't', ownership_pct: '60', investment_codes_in_parent: ['1060'], parent_account_codes_in_sub: ['2050'], sub_account_codes_in_parent: [], control_since: '2024-06-01', control_basis: 'acquisition' }], at_cost: [] });
    const inv = r.worksheet.rows.find((x) => x.code === 'INVESTMENTS')!;
    expect(inv.consolidated).toBe('60.00'); expect(inv.unreconciled).toBe('60.00'); // 240 − 60% × 300
    expect(r.worksheet.rows.find((x) => x.code === 'NCI')?.consolidated).toBe('124.00'); // 40% × 310
    expect(r.worksheet.totals.equation_difference).toBe('0.00');
    expect(r.group_equity_before_adjustments).toBe('720.00'); // المعادلة المباشرة = ورقة العمل تحت فرضية شطب الفروق بحصة الأم
  });
  it('shows pre- and post-elimination balances per company and line with account references', () => {
    const r = run(INC);
    const inv = r.worksheet.rows.find((x) => x.code === 'INVESTMENTS')!;
    expect(inv.per_company.p).toBe('238486.17'); expect(inv.aggregate).toBe('238486.17'); expect(inv.elimination_credit).toBe('238486.17'); expect(inv.consolidated).toBe('0.00');
    expect(inv.evidence.p[0]).toContain('106021');
    const claim = r.worksheet.rows.find((x) => x.code === 'RELATED_PARTY_DR')!;
    expect(claim.per_company.g).toBe('62147.82'); expect(claim.elimination_credit).toBe('61513.83'); expect(claim.consolidated).toBe('633.99');
  });
});

describe('companies kept at cost (no statements)', () => {
  it('reports receivable and payable to a dormant company separately by balance side', () => {
    const P2 = [...PARENT, E('1070', 'ذمم مدينة شركة خاملة', '100', '0'), E('2070', 'جاري شركة خاملة', '0', '7'), E('2099', 'ذمم دائنة أخرى', '0', '93')];
    const r = consolidate({ parent: { key: 'p', label: 'الأم', entries: P2, periodLabel: 't' }, subsidiaries: [], at_cost: [{ key: 'd', label: 'خاملة', investment_codes_in_parent: ['1060'], receivable_codes_in_parent: ['1070'], payable_codes_in_parent: ['2070'], control: 'unknown' }] });
    expect(r.at_cost[0].receivable_from_company).toBe('100.00'); expect(r.at_cost[0].payable_to_company).toBe('7.00');
    expect(r.worksheet.scope[0].receivable).toBe('100.00'); expect(r.worksheet.scope[0].payable).toBe('7.00');
  });
});

describe('cash flow reconciliation with shareholder current accounts', () => {
  it('reports the collection of a partner receivable in financing so cash reconciles', () => {
    const O = (code: string, name: string, od: string, oc: string, pd: string, pc: string, cd: string, cc: string): TbEntry => ({ account_code: code, account_name: name, opening_debit: od, opening_credit: oc, period_debit: pd, period_credit: pc, closing_debit: cd, closing_credit: cc });
    const tb = [O('1101', 'البنك', '100', '0', '185', '0', '285', '0'), O('2020', 'جاري الشريك أحمد', '200', '0', '0', '185', '15', '0'), O('3100', 'رأس المال', '0', '200', '0', '0', '0', '200'), O('3102', 'رأس المال الإضافي المدفوع', '0', '100', '0', '0', '0', '100')];
    const s = buildStatements({ current: tb, periodLabel: 't' });
    const t = Object.fromEntries(s.cf.totals.map((x) => [x.key, x.value]));
    expect(t.financing).toBe('185.00');
    expect(t.cash_closing_computed).toBe(t.cash_closing_tb);
  });
});

describe('cash flow: IFRS 16 lease recognition is non-cash', () => {
  it('excludes the right-of-use asset matched by the lease liability from investing and financing', () => {
    const O = (code: string, name: string, od: string, oc: string, pd: string, pc: string, cd: string, cc: string): TbEntry => ({ account_code: code, account_name: name, opening_debit: od, opening_credit: oc, period_debit: pd, period_credit: pc, closing_debit: cd, closing_credit: cc });
    const tb = [O('1101', 'البنك', '500', '0', '0', '150', '350', '0'), O('1001', 'حق استخدام الأصول (IFRS 16)', '0', '0', '1000', '0', '1000', '0'),
      O('2036', 'التزام عقد الايجار الحالي', '0', '0', '0', '150', '0', '150'), O('2026', 'التزام عقد الايجار', '0', '0', '0', '700', '0', '700'), O('3100', 'رأس المال', '0', '500', '0', '0', '0', '500')];
    const s = buildStatements({ current: tb, periodLabel: 't' });
    const t = Object.fromEntries(s.cf.totals.map((x) => [x.key, x.value]));
    expect(t.investing).toBe('-150.00');
    expect(t.financing).toBe('0.00');
    expect(t.cash_closing_computed).toBe(t.cash_closing_tb);
  });
});
