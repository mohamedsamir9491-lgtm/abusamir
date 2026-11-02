import { describe, it, expect } from 'vitest';
import { validateTrialBalance } from '../src/engine/trialBalance.js';
import { buildStatements } from '../src/engine/statements.js';
import { computeRatios } from '../src/engine/ratios.js';
import { computeVariance } from '../src/engine/variance.js';
import { D, normalizeNumberString, parseNumber, toStr } from '../src/engine/money.js';
import { classifyAccount } from '../src/engine/classification.js';
import type { TbEntry } from '../src/engine/types.js';

/** بيانات اختبار تركيبية (TEST DATA) - ميزان مراجعة متوازن لشركة افتراضية */
export const BALANCED_TB: TbEntry[] = [
  { account_code: '1101', account_name: 'النقد في الصندوق', opening_debit: '20000', opening_credit: '0', period_debit: '150000', period_credit: '140000', closing_debit: '30000', closing_credit: '0', source_row: 2 },
  { account_code: '1102', account_name: 'البنك الأهلي - حساب جاري', opening_debit: '180000', opening_credit: '0', period_debit: '900000', period_credit: '830000', closing_debit: '250000', closing_credit: '0', source_row: 3 },
  { account_code: '1201', account_name: 'ذمم مدينة - عملاء', opening_debit: '120000', opening_credit: '0', period_debit: '1100000', period_credit: '1020000', closing_debit: '200000', closing_credit: '0', source_row: 4 },
  { account_code: '1209', account_name: 'مخصص خسائر ائتمانية متوقعة', opening_debit: '0', opening_credit: '5000', period_debit: '0', period_credit: '3000', closing_debit: '0', closing_credit: '8000', source_row: 5 },
  { account_code: '1301', account_name: 'المخزون', opening_debit: '90000', opening_credit: '0', period_debit: '600000', period_credit: '570000', closing_debit: '120000', closing_credit: '0', source_row: 6 },
  { account_code: '1501', account_name: 'سيارات ومعدات', opening_debit: '300000', opening_credit: '0', period_debit: '50000', period_credit: '0', closing_debit: '350000', closing_credit: '0', source_row: 7 },
  { account_code: '1509', account_name: 'مجمع استهلاك السيارات والمعدات', opening_debit: '0', opening_credit: '60000', period_debit: '0', period_credit: '35000', closing_debit: '0', closing_credit: '95000', source_row: 8 },
  { account_code: '2101', account_name: 'ذمم دائنة - موردون', opening_debit: '0', opening_credit: '110000', period_debit: '560000', period_credit: '600000', closing_debit: '0', closing_credit: '150000', source_row: 9 },
  { account_code: '2102', account_name: 'مصاريف مستحقة', opening_debit: '0', opening_credit: '15000', period_debit: '15000', period_credit: '49000', closing_debit: '0', closing_credit: '49000', source_row: 10 },
  { account_code: '2103', account_name: 'ضريبة القيمة المضافة المستحقة', opening_debit: '0', opening_credit: '12000', period_debit: '160000', period_credit: '168000', closing_debit: '0', closing_credit: '20000', source_row: 11 },
  { account_code: '2201', account_name: 'قرض طويل الأجل - مرابحة', opening_debit: '0', opening_credit: '200000', period_debit: '50000', period_credit: '0', closing_debit: '0', closing_credit: '150000', source_row: 12 },
  { account_code: '2301', account_name: 'مخصص مكافأة نهاية الخدمة', opening_debit: '0', opening_credit: '40000', period_debit: '0', period_credit: '10000', closing_debit: '0', closing_credit: '50000', source_row: 13 },
  { account_code: '3101', account_name: 'رأس المال', opening_debit: '0', opening_credit: '200000', period_debit: '0', period_credit: '0', closing_debit: '0', closing_credit: '200000', source_row: 14 },
  { account_code: '3201', account_name: 'الأرباح المبقاة', opening_debit: '0', opening_credit: '68000', period_debit: '20000', period_credit: '0', closing_debit: '0', closing_credit: '48000', source_row: 15 },
  { account_code: '4101', account_name: 'إيرادات المبيعات', opening_debit: '0', opening_credit: '0', period_debit: '0', period_credit: '1100000', closing_debit: '0', closing_credit: '1100000', source_row: 16 },
  { account_code: '5101', account_name: 'تكلفة المبيعات', opening_debit: '0', opening_credit: '0', period_debit: '570000', period_credit: '0', closing_debit: '570000', closing_credit: '0', source_row: 17 },
  { account_code: '5201', account_name: 'رواتب وأجور', opening_debit: '0', opening_credit: '0', period_debit: '240000', period_credit: '0', closing_debit: '240000', closing_credit: '0', source_row: 18 },
  { account_code: '5202', account_name: 'إيجار المكتب', opening_debit: '0', opening_credit: '0', period_debit: '60000', period_credit: '0', closing_debit: '60000', closing_credit: '0', source_row: 19 },
  { account_code: '5203', account_name: 'مصروف استهلاك', opening_debit: '0', opening_credit: '0', period_debit: '35000', period_credit: '0', closing_debit: '35000', closing_credit: '0', source_row: 20 },
  { account_code: '5204', account_name: 'خسائر ائتمانية متوقعة', opening_debit: '0', opening_credit: '0', period_debit: '3000', period_credit: '0', closing_debit: '3000', closing_credit: '0', source_row: 21 },
  { account_code: '5301', account_name: 'تكاليف تمويل - أرباح مرابحة', opening_debit: '0', opening_credit: '0', period_debit: '12000', period_credit: '0', closing_debit: '12000', closing_credit: '0', source_row: 22 },
];

describe('money helpers', () => {
  it('normalizes arabic digits, thousands separators and parentheses', () => {
    expect(normalizeNumberString('١٢٬٣٤٥٫٦٧')).toBe('12345.67');
    expect(normalizeNumberString('(1,234.50)')).toBe('-1234.50');
    expect(normalizeNumberString('1.234,56')).toBe('1234.56');
    expect(normalizeNumberString('SAR 5,000')).toBe('5000');
    expect(normalizeNumberString('1,000 Cr')).toBe('-1000');
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('12.5')!.toString()).toBe('12.5');
  });
  it('uses decimal arithmetic without floating error', () => {
    expect(toStr(D('0.1').plus('0.2'))).toBe('0.30');
    expect(toStr(D('1000000.005'))).toBe('1000000.01');
  });
});

describe('classification', () => {
  it('classifies common arabic account names', () => {
    expect(classifyAccount('1102', 'البنك الأهلي').fs_line_code).toBe('CASH');
    expect(classifyAccount('1209', 'مخصص خسائر ائتمانية متوقعة').fs_line_code).toBe('AR_ALLOWANCE');
    expect(classifyAccount('1509', 'مجمع استهلاك السيارات').fs_line_code).toBe('ACC_DEP');
    expect(classifyAccount('5203', 'مصروف استهلاك').fs_line_code).toBe('DEPRECIATION_EXP');
    expect(classifyAccount('2301', 'مخصص مكافأة نهاية الخدمة').fs_line_code).toBe('EOSB');
    expect(classifyAccount('4101', 'إيرادات المبيعات').normal_balance).toBe('credit');
    expect(classifyAccount('1999', 'حساب معلق').is_suspense).toBe(true);
    expect(classifyAccount('9999', '').fs_line_code).toBe('UNMAPPED');
  });
});

describe('validateTrialBalance', () => {
  it('reports balanced totals and no math errors for a balanced TB', () => {
    const r = validateTrialBalance(BALANCED_TB);
    expect(r.summary.totals.opening.balanced).toBe(true);
    expect(r.summary.totals.movements.balanced).toBe(true);
    expect(r.summary.totals.closing.balanced).toBe(true);
    expect(r.summary.totals.closing.debit).toBe('1870000.00');
    expect(r.findings.filter((f) => f.category === 'math_error')).toHaveLength(0);
    expect(r.summary.net_income_from_tb).toBe('180000.00');
    expect(r.summary.computed_check.accounts_with_mismatch).toBe(0);
  });
  it('detects unbalanced closing totals and per-account mismatch', () => {
    const tb = BALANCED_TB.map((e) => ({ ...e }));
    tb[0].closing_debit = '31000'; // closing != opening + movements, and totals unbalanced
    const r = validateTrialBalance(tb);
    expect(r.summary.totals.closing.balanced).toBe(false);
    expect(r.summary.totals.closing.difference).toBe('1000.00');
    expect(r.findings.some((f) => f.rule_code === 'TB-003' && f.severity === 'critical')).toBe(true);
    const m = r.findings.find((f) => f.rule_code === 'TB-004');
    expect(m?.account_code).toBe('1101');
    expect(m?.amount).toBe('1000.00');
    expect(m?.source_row_ref).toBe('الصف 2');
  });
  it('detects duplicates, missing names, abnormal balances and suspense accounts', () => {
    const tb: TbEntry[] = [
      ...BALANCED_TB,
      { account_code: '1201', account_name: 'ذمم مدينة', opening_debit: '0', opening_credit: '0', period_debit: '0', period_credit: '0', closing_debit: '0', closing_credit: '0', source_row: 30 },
      { account_code: '1999', account_name: 'حساب معلق', opening_debit: '0', opening_credit: '0', period_debit: '5000', period_credit: '0', closing_debit: '5000', closing_credit: '0', source_row: 31 },
      { account_code: '1777', account_name: '', opening_debit: '0', opening_credit: '0', period_debit: '0', period_credit: '0', closing_debit: '0', closing_credit: '0', source_row: 32 },
      { account_code: '2105', account_name: 'ذمم دائنة - مورد س', opening_debit: '0', opening_credit: '0', period_debit: '9000', period_credit: '0', closing_debit: '9000', closing_credit: '0', source_row: 33 },
    ];
    const r = validateTrialBalance(tb);
    expect(r.findings.some((f) => f.rule_code === 'TB-005' && f.account_code === '1201')).toBe(true);
    expect(r.findings.some((f) => f.rule_code === 'TB-006' && f.account_code === '1777')).toBe(true);
    expect(r.findings.some((f) => f.rule_code === 'TB-011' && f.account_code === '1999')).toBe(true);
    expect(r.findings.some((f) => f.rule_code === 'TB-010' && f.account_code === '2105')).toBe(true);
    expect(r.findings.some((f) => f.rule_code === 'TB-018')).toBe(true);
  });
  it('compares with prior period and flags material changes', () => {
    const prior = BALANCED_TB.map((e) => ({ ...e, closing_debit: e.account_code === '1201' ? '50000' : e.closing_debit }));
    const r = validateTrialBalance(BALANCED_TB, { priorEntries: prior, materiality: '10000' });
    const f = r.findings.find((x) => x.rule_code === 'TB-014' && x.account_code === '1201');
    expect(f).toBeDefined();
    expect(f!.evidence['change']).toBe('150000.00');
    expect(f!.evidence['change_pct']).toBe('300.00');
  });
  it('flags rows without account codes and negative values', () => {
    const tb: TbEntry[] = [...BALANCED_TB, { account_code: '', account_name: 'إجمالي', opening_debit: '0', opening_credit: '0', period_debit: '0', period_credit: '0', closing_debit: '-100', closing_credit: '0', source_row: 40 }];
    const r = validateTrialBalance(tb);
    expect(r.findings.some((f) => f.rule_code === 'TB-007')).toBe(true);
  });
});

describe('buildStatements', () => {
  it('produces a balanced SFP and correct P&L', () => {
    const s = buildStatements({ current: BALANCED_TB, periodLabel: '2025' });
    expect(s.pl.totals.find((t) => t.key === 'net_revenue')!.value).toBe('1100000.00');
    expect(s.pl.totals.find((t) => t.key === 'gross_profit')!.value).toBe('530000.00');
    expect(s.pl.totals.find((t) => t.key === 'net_income')!.value).toBe('180000.00');
    expect(s.sfp.totals.find((t) => t.key === 'total_assets')!.value).toBe('847000.00');
    expect(s.sfp.totals.find((t) => t.key === 'total_liabilities')!.value).toBe('419000.00');
    expect(s.sfp.totals.find((t) => t.key === 'total_equity')!.value).toBe('428000.00');
    expect(s.sfp.balanced).toBe(true);
    expect(s.sfp.lines.find((l) => l.code === 'AR_ALLOWANCE')!.value).toBe('-8000.00');
  });
  it('builds cash flow from opening balances that reconciles to closing cash', () => {
    const s = buildStatements({ current: BALANCED_TB, periodLabel: '2025' });
    expect(s.cf.status).toBe('ok');
    const t = Object.fromEntries(s.cf.totals.map((x) => [x.key, x.value]));
    expect(t.cash_opening).toBe('200000.00');
    expect(t.cash_closing_tb).toBe('280000.00');
    expect(t.cf_difference).toBe('0.00');
    expect(t.operating).toBe('200000.00');
    expect(t.investing).toBe('-50000.00');
    expect(t.financing).toBe('-70000.00');
    expect(s.ce.status).toBe('ok');
    expect(s.ce.rows[0].value).toBe('268000.00');
    expect(s.ce.rows[s.ce.rows.length - 1].value).toBe('428000.00');
  });
  it('marks cash flow as insufficient without opening or prior data', () => {
    const noOpen = BALANCED_TB.map((e) => ({ ...e, opening_debit: '0', opening_credit: '0', period_debit: '0', period_credit: '0' }));
    const s = buildStatements({ current: noOpen, periodLabel: '2025' });
    expect(s.cf.status).toBe('insufficient_data');
    expect(s.ce.status).toBe('insufficient_data');
  });
});

describe('ratios', () => {
  it('computes ratios with formulas and marks insufficient data', () => {
    const s = buildStatements({ current: BALANCED_TB, periodLabel: '2025' });
    const r = computeRatios(s.key_figures, { periodDays: 365 });
    const by = Object.fromEntries(r.map((x) => [x.code, x]));
    expect(by.current_ratio.value).toBe('2.70'); // 592000/219000
    expect(by.working_capital.value).toBe('373000.00');
    expect(by.gross_margin.value).toBe('48.18');
    expect(by.net_margin.value).toBe('16.36');
    expect(by.dso.value).toBe('53'); // avg AR (120000+200000)/2=160000 /1100000*365
    expect(by.debt_to_equity.value).toBe('0.98');
    expect(by.ocf_to_net_income.status).toBe('ok');
    const r2 = computeRatios({ current_assets: '100', current_liabilities: '0', revenue: null });
    expect(Object.fromEntries(r2.map((x) => [x.code, x])).current_ratio.status).toBe('insufficient_data');
    expect(Object.fromEntries(r2.map((x) => [x.code, x])).gross_margin.status).toBe('insufficient_data');
  });
});

describe('variance', () => {
  it('computes change and percentage with materiality flag', () => {
    const v = computeVariance([{ key: 'rev', label_ar: 'الإيرادات', current: '1200', comparative: '1000' }, { key: 'x', label_ar: 'x', current: '100', comparative: '0' }], { materiality: '150', pctThreshold: 10 });
    expect(v.rows[0].change).toBe('200.00');
    expect(v.rows[0].change_pct).toBe('20.00');
    expect(v.rows[0].material).toBe(true);
    expect(v.rows[1].change_pct).toBeNull();
    expect(v.rows[1].material).toBe(false);
  });
});
