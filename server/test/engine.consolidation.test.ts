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
