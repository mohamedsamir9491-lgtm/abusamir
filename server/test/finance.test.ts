import { describe, it, expect } from 'vitest';
import { searchKey, matches, toLatinDigits } from '../src/lib/arabic.js';
import { letterFee, triggerOf, num } from '../src/modules/finance/service.js';

describe('Arabic/Latin normalization for search', () => {
  it('unifies alef forms, ya/alef maqsura, ta marbuta, hamza carriers, digits, tashkeel and case', () => {
    expect(searchKey('أحمد')).toBe(searchKey('احمد')); expect(searchKey('إبراهيم')).toBe('ابراهيم'); expect(searchKey('آل')).toBe('ال');
    expect(searchKey('مصطفى')).toBe(searchKey('مصطفي')); expect(searchKey('مؤسسة')).toBe('موسسه'); expect(searchKey('مُحَمَّـــد')).toBe('محمد');
    expect(searchKey('١٠٠٩٢١٤٢٤٥')).toBe('1009214245'); expect(toLatinDigits('١٢٫٥٠')).toBe('12.50'); expect(searchKey('ABC Co')).toBe('abc co');
  });
  it('matches every word in any order', () => {
    expect(matches('شركة أسس القابضة', 'اسس شركه')).toBe(true); expect(matches('شركة أسس القابضة', 'جراند')).toBe(false); expect(matches('س.ت 1009214245', '١٠٠٩')).toBe(true);
  });
});

describe('fees from the engagement letter', () => {
  it('reads net fee and VAT for exclusive, inclusive and hidden modes', () => {
    expect(letterFee({ fees_amount: '46,000', options: { vat_mode: 'exclusive', vat_rate: '15' } })).toMatchObject({ net: 46000, vatRate: 15 });
    expect(letterFee({ fees_amount: '٥٧٫٥٠٠', options: { vat_mode: 'exclusive', vat_rate: '15' } }).net).toBe(57.5);
    expect(letterFee({ fees_amount: '57500', options: { vat_mode: 'inclusive', vat_rate: '15' } }).net).toBe(50000);
    expect(letterFee({ fees_amount: '10000', options: { vat_mode: 'hidden', vat_rate: '15' } })).toMatchObject({ net: 10000, vatRate: 0 });
  });
  it('detects when each installment falls due from the schedule wording', () => {
    expect(triggerOf('عند توقيع الخطاب')).toBe('signing'); expect(triggerOf('عند تسليم التقرير النهائي')).toBe('delivery'); expect(triggerOf('في ٢٠٢٦-١٢-٠١')).toBe('date'); expect(triggerOf('حسب الاتفاق')).toBe('manual');
    expect(num('50%')).toBe(50); expect(num('٢٥٪')).toBe(25);
  });
});
