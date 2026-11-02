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
  it('posts balanced elimination entries only and never balances through group equity', () => {
    const r = run({ control_since: '2025-01-01', control_basis: 'incorporation' });
    for (const e of r.worksheet.entries) expect(e.total_debit).toBe(e.total_credit);
    expect(r.worksheet.totals.eliminations_debit).toBe(r.worksheet.totals.eliminations_credit);
    expect(r.worksheet.totals.equation_difference).toBe('0.00');
    // حقوق المجموعة = مجموع بنود حقوق الملكية بعد القيود، لا رقم مشتق
    const eq = r.worksheet.rows.filter((x) => x.section === 'equity').reduce((a, x) => a + Number(x.consolidated), 0);
    expect(eq.toFixed(2)).toBe(r.group_equity_worksheet);
    expect(r.worksheet.rows.some((x) => x.code === 'SHARE_CAPITAL' && x.consolidated === '1000000.00')).toBe(true); // رأس مال التابعة استُبعد كاملًا
  });
  it('reconciles investment vs capital from opening balance and movements (633.99 = 634.00 − 0.01)', () => {
    const r = run({ control_since: '2025-01-01', control_basis: 'incorporation' });
    const s = r.worksheet.subsidiaries[0];
    expect(s.capital_matching.implied_paid_capital).toBe('237852.18');
    expect(s.capital_matching.investment_vs_implied_paid_capital).toBe('633.99');
    expect(s.capital_matching.identity_opening).toBe('0.01'); // (رأس المال − المطالبة) − الاستثمار عند الافتتاح: الأم سجلت 0.01 أقل
    expect(s.capital_matching.identity_period).toBe('634.00');
    expect(s.capital_matching.identity_reconciles).toBe(true);
    expect(s.capital_matching.claim_matched_to_unpaid_capital).toBe('61513.83');
    expect(s.capital_matching.unmatched_sub_claim).toBe('633.99');
  });
  it('bridges the matching difference (633.99) to the equity contribution (799.36) via post-control results (165.37)', () => {
    const r = run({ control_since: '2025-01-01', control_basis: 'incorporation' });
    const b = r.worksheet.subsidiaries[0].bridge;
    expect(b.post_acquisition_results).toBe('-165.37');
    expect(b.contribution_if_difference_written_off).toBe('-799.36');
    expect(b.contribution_with_difference_pending).toBe('-165.37');
    expect(r.subsidiaries[0].contribution_to_group_equity).toBe('-799.36');
  });
  it('keeps unproven differences as a visible pending line and withholds approval', () => {
    const r = run({ control_since: '2025-01-01', control_basis: 'incorporation' });
    expect(r.status).toBe('pending');
    expect(r.worksheet.rows.find((x) => x.code === 'IC_SUSPENSE')?.consolidated).toBe('633.99');
    expect(r.group_equity_worksheet).toBe('999834.63');              // 1,000,000 − 165.37 (الفرق معلق)
    expect(r.group_equity_if_pending_written_off).toBe('999200.64'); // إن عُدّ الفرق خسارة
    expect(r.group_equity_before_adjustments).toBe(r.group_equity_if_pending_written_off); // المعادلة المباشرة = الحالة المحافِظة؛ غير معتمدة
    expect(r.pending_reasons.length).toBeGreaterThan(0);
  });
  it('is supported only when every balance has a proven counterpart and the control date is documented', () => {
    const r = consolidate({ parent: { key: 'p', label: 'الأم', entries: PARENT, periodLabel: 't' }, subsidiaries: [{ key: 's', label: 'س', entries: SUB, periodLabel: 't', ownership_pct: '100', investment_codes_in_parent: ['1060'], parent_account_codes_in_sub: ['2050'], sub_account_codes_in_parent: [], control_since: '2024-06-01', control_basis: 'incorporation' }], at_cost: [] });
    expect(r.status).toBe('supported'); expect(r.worksheet.totals.pending_items).toBe('0.00'); expect(r.group_equity_worksheet).toBe('820.00');
    const r2 = consolidate({ parent: { key: 'p', label: 'الأم', entries: PARENT, periodLabel: 't' }, subsidiaries: [{ key: 's', label: 'س', entries: SUB, periodLabel: 't', ownership_pct: '100', investment_codes_in_parent: ['1060'], parent_account_codes_in_sub: ['2050'], sub_account_codes_in_parent: [] }], at_cost: [] });
    expect(r2.status).toBe('pending'); expect(r2.pending_reasons.some((x) => x.includes('السيطرة'))).toBe(true);
  });
  it('shows pre- and post-elimination balances per company and line', () => {
    const r = run({ control_since: '2025-01-01', control_basis: 'incorporation' });
    const inv = r.worksheet.rows.find((x) => x.code === 'INVESTMENTS')!;
    expect(inv.per_company.p).toBe('238486.17'); expect(inv.aggregate).toBe('238486.17'); expect(inv.elimination_credit).toBe('238486.17'); expect(inv.consolidated).toBe('0.00');
    const claim = r.worksheet.rows.find((x) => x.code === 'RELATED_PARTY_DR')!;
    expect(claim.per_company.g).toBe('62147.82'); expect(claim.consolidated).toBe('0.00');
  });
});
