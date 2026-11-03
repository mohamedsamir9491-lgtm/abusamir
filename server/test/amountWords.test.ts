import { describe, it, expect } from 'vitest';
import { intToArabicWords, formatFeeAmount, parseAmount } from '../src/lib/amountWords.js';
describe('amount in Arabic words', () => {
  it('converts integers', () => {
    expect(intToArabicWords(6000)).toBe('ستة آلاف');
    expect(intToArabicWords(1000)).toBe('ألف');
    expect(intToArabicWords(2000)).toBe('ألفان');
    expect(intToArabicWords(25000)).toBe('خمسة وعشرون ألفًا');
    expect(intToArabicWords(11000)).toBe('أحد عشر ألفًا');
    expect(intToArabicWords(100000)).toBe('مائة ألف');
    expect(intToArabicWords(150500)).toBe('مائة وخمسون ألفًا وخمسمائة');
    expect(intToArabicWords(1250000)).toBe('مليون ومائتان وخمسون ألفًا');
    expect(intToArabicWords(3000000)).toBe('ثلاثة ملايين');
    expect(intToArabicWords(105)).toBe('مائة وخمسة');
    expect(intToArabicWords(10000)).toBe('عشرة آلاف');
  });
  it('formats the fee with currency', () => {
    expect(formatFeeAmount('6000', 'SAR', true)).toEqual({ text: '6,000 ريال سعودي', words: 'فقط ستة آلاف ريال سعودي لا غير' });
    expect(formatFeeAmount('٦٠٠٠', 'SAR', false).text).toBe('6,000 ريال سعودي');
    expect(formatFeeAmount('1,500.50', 'SAR', true).words).toBe('فقط ألف وخمسمائة ريال سعودي وخمسون هللة لا غير');
    expect(formatFeeAmount('25,000 ريال سعودي', 'SAR', true)).toEqual({ text: '25,000 ريال سعودي', words: 'فقط خمسة وعشرون ألفًا ريال سعودي لا غير' });
    expect(parseAmount('حسب الساعات')).toBeNull();
  });
});
