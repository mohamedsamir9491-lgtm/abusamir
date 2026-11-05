import { describe, it, expect } from 'vitest';
import { isLegalQuestion } from '../src/modules/legal/answer.js';
import { queryTerms, termGroups, articleNumber, arStem, snippet } from '../src/modules/legal/library.js';

describe('المكتبة النظامية', () => {
  it('يميّز الأسئلة النظامية عن أسئلة المكتب والبيانات', () => {
    expect(isLegalQuestion('ما سعر ضريبة الدخل على الشركات؟')).toBe(true);
    expect(isLegalQuestion('متى يجب التسجيل في ضريبة القيمة المضافة')).toBe(true);
    expect(isLegalQuestion('ما الحسميات من الوعاء الزكوي؟')).toBe(true);
    expect(isLegalQuestion('المادة 68 من نظام ضريبة الدخل')).toBe(true);
    expect(isLegalQuestion('كم المستحق على العملاء؟')).toBe(false);
    expect(isLegalQuestion('كم إجمالي الأصول؟')).toBe(false);
    expect(isLegalQuestion('ما رصيد ضريبة القيمة المضافة في الميزان؟')).toBe(false);
  });
  it('يوحّد البادئات ويضيف المرادفات', () => {
    expect(arStem('والزكاة بالضريبة')).toBe('زكاه ضريبه');
    const t = queryTerms('ما سعر ضريبة الدخل؟'); expect(t).toEqual(['سعر', 'ضريبه', 'دخل']);
    expect(termGroups(t)[0]).toContain('اسعار');
  });
  it('يلتقط رقم المادة المطلوبة', () => {
    expect(articleNumber('المادة 68 من نظام ضريبة الدخل')).toBe(68);
    expect(articleNumber('المادة (٧)')).toBe(7);
    expect(articleNumber('سعر الضريبة')).toBeNull();
  });
  it('يقتطع مقتطفًا حول كلمة البحث', () => {
    const body = 'مقدمة '.repeat(200) + 'سعر الضريبة على الوعاء عشرون بالمئة ' + 'خاتمة '.repeat(200);
    const s = snippet(body, ['سعر'], 200); expect(s).toContain('سعر الضريبة'); expect(s.startsWith('…')).toBe(true);
  });
});
