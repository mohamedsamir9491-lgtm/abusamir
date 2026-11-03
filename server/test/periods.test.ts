import { describe, it, expect } from 'vitest';
import { fiscalYear, fiscalYearOf, isFullYear, periodLabel, periodPhrase, periodErrors, periodWarnings, shiftYears, effectiveFiscalYear } from '../src/lib/periods.js';
describe('fiscal periods', () => {
  it('builds fiscal years from the client year end', () => {
    expect(fiscalYear(2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(fiscalYear(2026, 6, 30)).toEqual({ start: '2025-07-01', end: '2026-06-30' });
    expect(fiscalYear(2024, 2, 29)).toEqual({ start: '2023-03-01', end: '2024-02-29' });
    expect(fiscalYear(2026, 2, 29)).toEqual({ start: '2025-03-01', end: '2026-02-28' });
    expect(fiscalYearOf('2026-11-03')).toBe(2026);
    expect(fiscalYearOf('2026-11-03', 6, 30)).toBe(2027);
  });
  it('labels and phrases periods', () => {
    expect(isFullYear('2026-01-01', '2026-12-31')).toBe(true);
    expect(isFullYear('2026-01-01', '2026-11-01')).toBe(false);
    expect(periodLabel('2025-07-01', '2026-06-30')).toBe('السنة المالية 2026');
    expect(periodLabel('2026-01-01', '2026-11-01')).toBe('الفترة من 1/1/2026 إلى 1/11/2026');
    expect(periodPhrase('2026-01-01', '2026-12-31')).toBe('للسنة المالية المنتهية في 31/12/2026');
    expect(periodPhrase('2026-01-01', '2026-11-01')).toBe('للفترة من 1/1/2026 إلى 1/11/2026');
    expect(shiftYears('2026-11-01', -1)).toBe('2025-11-01');
    expect(effectiveFiscalYear(2027)).toBe(2027);
    expect(effectiveFiscalYear(null)).toBe(new Date().getUTCFullYear());
  });
  it('validates periods', () => {
    const ok = [{ label: 'أ', start_date: '2025-01-01', end_date: '2025-12-31', role: 'prior' }, { label: 'ب', start_date: '2026-01-01', end_date: '2026-12-31', role: 'current' }];
    expect(periodErrors(ok)).toEqual([]);
    expect(periodErrors([{ ...ok[0]!, end_date: '2026-03-01' }, ok[1]!]).join()).toContain('متداخلتان');
    expect(periodErrors([{ label: 'ج', start_date: '2026-02-01', end_date: '2026-01-01', role: 'current' }]).join()).toContain('قبل بدايتها');
    expect(periodErrors([{ ...ok[0]!, role: 'current' }, ok[1]!]).join()).toContain('أكثر من فترة حالية');
    expect(periodWarnings([{ label: 'د', start_date: '2026-01-01', end_date: '2027-03-31', role: 'current' }], '2026-11-03').length).toBe(2);
  });
});
