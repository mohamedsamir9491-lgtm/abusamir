import { describe, it, expect } from 'vitest';
import { accountsCore, localObservations, localAnalysis, type LocalContext } from '../src/modules/ai/local.js';
import { answerQuestion } from '../src/modules/ai/chat.js';
import { findTopics } from '../src/modules/ai/knowledge.js';
import type { TbEntry } from '../src/engine/types.js';

const O = (code: string, name: string, od: string, oc: string, pd: string, pc: string, cd: string, cc: string): TbEntry => ({ account_code: code, account_name: name, opening_debit: od, opening_credit: oc, period_debit: pd, period_credit: pc, closing_debit: cd, closing_credit: cc });
const TB = [
  O('1101', 'بنك ساب', '500', '0', '1200', '400', '1300', '0'),
  O('1201', 'حق استخدام الأصول (IFRS 16)', '0', '0', '1000', '0', '1000', '0'),
  O('2101', 'التزامات عقود الإيجار', '0', '0', '0', '900', '0', '900'),
  O('3100', 'رأس المال', '0', '500', '0', '0', '0', '500'),
  O('4100', 'الإيرادات', '0', '0', '0', '1200', '0', '1200'),
  O('5100', 'مصروف ايجار المكتب', '0', '0', '250', '0', '250', '0'),
  O('5200', 'مصاريف نثرية', '0', '0', '50', '0', '50', '0'),
];
const ctx = (over: Partial<LocalContext> = {}): LocalContext => {
  const core = accountsCore(TB, new Map() as never, 'الفترة من 1/1/2026 إلى 31/12/2026', 365);
  return { engagementId: 'e1', periodId: 'p1', clientId: 'c1', company: 'شركة تجربة', currency: 'SAR', entityType: 'llc',
    period: { label: 'الفترة من 1/1/2026 إلى 31/12/2026', start: '2026-01-01', end: '2026-12-31', phrase: 'للسنة المنتهية في 31 ديسمبر 2026', full: true, days: 365 },
    ...core, prior: null, variance: [], findings: [{ ref: 'F-0001', rule: 'X', severity: 'high', title: 'ملاحظة مرتفعة', description: '', amount: '100', category: 'accounting_issue' }, { ref: 'F-0002', rule: 'Y', severity: 'low', title: 'ملاحظة منخفضة', description: '', amount: null, category: 'accounting_issue' }],
    group: null, official: [], statementsGeneratedAt: null, ...over };
};
const ask = (q: string, c = ctx()) => answerQuestion('e1', 'p1', q, async () => c);

describe('local analysis rules', () => {
  it('flags a right-of-use asset without depreciation and a lease without interest', () => {
    const rules = localObservations(ctx()).map((f) => f.rule_code);
    expect(rules).toContain('LA-003'); expect(rules).toContain('LA-004');
  });
  it('produces a complete analysis with figures taken from the data only', () => {
    const a = localAnalysis(ctx());
    expect(a.executive_summary_ar).toContain('شركة تجربة');
    expect(a.observations.length).toBeGreaterThan(0);
    expect(Object.keys(a.risk_assessment).length).toBeGreaterThan(0);
  });
});

describe('local chat', () => {
  it('answers a statement figure with its source', async () => {
    const r = await ask('كم إجمالي الأصول؟');
    expect(r.text.join(' ')).toContain('2,300.00'); expect(r.sources.length).toBeGreaterThan(0);
  });
  it('answers an account balance with the account row', async () => {
    const r = await ask('ما رصيد بنك ساب؟');
    expect(r.intent).toBe('account'); expect(r.text.join(' ')).toContain('1,300.00'); expect(r.table?.rows[0][0]).toBe('1101');
  });
  it('ranks top expenses', async () => {
    const r = await ask('أكبر 2 مصروفات');
    expect(r.table?.rows.map((x) => x[0])).toEqual(['5100', '5200']);
  });
  it('filters important findings and ignores low ones', async () => {
    const r = await ask('ما الملاحظات الحرجة؟');
    expect(r.table?.rows.map((x) => x[0])).toEqual(['F-0001']);
  });
  it('explains standards from the local knowledge base', async () => {
    const r = await ask('اشرح IFRS 16');
    expect(r.sources).toContain('IFRS 16'); expect(findTopics('عقود الإيجار')[0].id).toBeTruthy();
  });
  it('compares official capital with the books', async () => {
    const r = await ask('كم رأس المال المدفوع حسب السجل؟', ctx({ official: [{ title: 'عقد', fields: { capital: { value: 500 }, paid_capital: { value: 125 } } }] }));
    expect(r.intent).toBe('official'); expect(r.text.join(' ')).toContain('375.00');
  });
  it('declines out-of-scope questions instead of inventing an answer', async () => {
    const r = await ask('ما هو الطقس اليوم');
    expect(r.intent).toBe('unknown'); expect(r.suggestions.length).toBeGreaterThan(0);
  });
});
