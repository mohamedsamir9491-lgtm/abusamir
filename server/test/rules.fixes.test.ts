/** اختبارات تصحيحات «سجل القواعد»: كل اختبار يثبت قاعدة رُبطت بسندها من المكتبة النظامية */
import { describe, it, expect } from 'vitest';
import { classifyAccount } from '../src/engine/classification.js';
import { buildStatements } from '../src/engine/statements.js';
import { validateTrialBalance } from '../src/engine/trialBalance.js';
import { templateFor } from '../src/modules/engagements/letterTemplates.js';
import { signatureStatusNote, SIGNATURE_LABELS } from '../src/modules/reports/builder.js';
import { ASSET_CATEGORIES } from '../src/modules/valuation/nav.js';
import type { AccountMeta, TbEntry } from '../src/engine/types.js';
import { BALANCED_TB } from './engine.trialBalance.test.js';

describe('تصنيف القروض البنكية (IAS 7 / IAS 1.69)', () => {
  it('القرض البنكي التزام وليس نقدًا، والمتداول منه قصير الأجل', () => {
    for (const n of ['قرض بنكي', 'مرابحة بنك الراجحي', 'قروض طويلة الأجل', 'Bank loan']) expect(classifyAccount('', n).fs_line_code).toBe('LONG_TERM_LOANS');
    for (const n of ['تسهيلات بنكية قصيرة الأجل', 'الجزء المتداول من القروض', 'سحب على المكشوف', 'Bank overdraft', 'Short-term loan']) expect(classifyAccount('', n).fs_line_code).toBe('SHORT_TERM_LOANS');
    expect(classifyAccount('', 'قروض طويلة الأجل - الجزء غير المتداول').fs_line_code).toBe('LONG_TERM_LOANS');
    for (const n of ['البنك الأهلي', 'بنك الراجحي - جاري', 'Cash at bank']) expect(classifyAccount('', n).fs_line_code).toBe('CASH');
  });
  it('«مستحق من» ذمة مدينة وليست مصروفًا مستحقًا', () => {
    expect(classifyAccount('', 'مستحق من الموظفين').fs_line_code).toBe('OTHER_RECEIVABLES');
    expect(classifyAccount('', 'رواتب مستحقة').fs_line_code).toBe('ACCRUALS');
  });
});

describe('الدخل الشامل الآخر في حقوق الملكية (IAS 1.106)', () => {
  it('تتوازن الميزانية وتتطابق التدفقات عند وجود خسارة اكتوارية في الدخل الشامل الآخر', () => {
    const tb: TbEntry[] = BALANCED_TB.map((e) => (e.account_code === '2301' ? { ...e, period_credit: '15000', closing_credit: '55000' } : e));
    tb.push({ account_code: '3901', account_name: 'خسائر اكتوارية - دخل شامل آخر', opening_debit: '0', opening_credit: '0', period_debit: '5000', period_credit: '0', closing_debit: '5000', closing_credit: '0', source_row: 99 });
    const accounts = new Map<string, AccountMeta>([['3901', { code: '3901', name_ar: 'خسائر اكتوارية', account_type: 'equity', sub_type: 'oci', normal_balance: 'debit', fs_line_code: 'OCI', is_suspense: false, is_bank: false }]]);
    const s = buildStatements({ current: tb, accounts, periodLabel: '2025' });
    expect(s.sfp.balanced).toBe(true);
    expect(s.sfp.totals.find((t) => t.key === 'total_equity')!.value).toBe('423000.00');
    expect(s.cf.totals.find((t) => t.key === 'cf_difference')!.value).toBe('0.00');
    expect(s.ce.rows[s.ce.rows.length - 1].value).toBe('423000.00');
  });
});

describe('TB-023 يقارن المجمع بالثابتة وغير الملموسة معًا', () => {
  it('لا تظهر ملاحظة خاطئة حين يشمل المجمع إطفاء برامج', () => {
    const tb: TbEntry[] = [
      { account_code: '1501', account_name: 'أجهزة حاسب', opening_debit: '0', opening_credit: '0', period_debit: '0', period_credit: '0', closing_debit: '10000', closing_credit: '0', source_row: 1 },
      { account_code: '1601', account_name: 'برامج محاسبية', opening_debit: '0', opening_credit: '0', period_debit: '0', period_credit: '0', closing_debit: '20000', closing_credit: '0', source_row: 2 },
      { account_code: '1509', account_name: 'مجمع الاستهلاك والإطفاء', opening_debit: '0', opening_credit: '0', period_debit: '0', period_credit: '0', closing_debit: '0', closing_credit: '15000', source_row: 3 },
      { account_code: '3101', account_name: 'رأس المال', opening_debit: '0', opening_credit: '0', period_debit: '0', period_credit: '0', closing_debit: '0', closing_credit: '15000', source_row: 4 },
    ];
    const r = validateTrialBalance(tb);
    expect(r.findings.some((f) => f.rule_code === 'TB-023')).toBe(false);
  });
});

describe('خطابات الارتباط والتقارير', () => {
  it('ارتباط المراجعة يأخذ خطاب ISA 210 لا خطاب التجميع، ويتضمن بنود الفقرة 10', () => {
    const t = templateFor(null, 'assurance_audit');
    expect(t.code).toBe('AUDIT');
    const titles = t.build({ entity: 'شركة', period: '2025', office: 'مكتب' }).sections.map((x) => x.title);
    for (const k of ['هدف المراجعة ونطاقها', 'مسؤوليات المراجع', 'مسؤوليات الإدارة', 'إطار التقرير المالي المنطبق', 'شكل التقرير ومحتواه']) expect(titles).toContain(k);
    expect(templateFor(null, 'compilation').code).toBe('COMPILATION');
  });
  it('نص حالة التقرير يتبع الحالة بعد الاعتماد', () => {
    const n = signatureStatusNote('approved'); expect(n.type === 'note' && n.text).toContain('معتمد للإصدار');
    const d = signatureStatusNote('draft'); expect(d.type === 'note' && d.text).toContain('مسودة');
    expect(SIGNATURE_LABELS.approver).toBe('الاعتماد');
  });
});

describe('نسب الاستهلاك الضريبية (نظام ضريبة الدخل م17/ب)', () => {
  it('تُعرض النسبة الضريبية بجانب المقترحة', () => {
    const by = Object.fromEntries(ASSET_CATEGORIES.map((c) => [c.code, c]));
    expect(by.buildings.tax_rate).toBe(5); expect(by.machinery.tax_rate).toBe(25); expect(by.computers.tax_rate).toBe(25);
    expect(by.furniture.tax_rate).toBe(10); expect(by.land.tax_rate).toBeNull();
  });
});
