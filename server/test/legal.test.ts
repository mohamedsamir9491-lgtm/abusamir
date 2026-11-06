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

import { findGuide } from '../src/modules/legal/guides.js';
describe('إجابة «كيف تُحسب الزكاة؟» المنظمة', () => {
  it('تلتقط صيغ السؤال المختلفة ولا تلتقط الأسئلة الخاصة', () => {
    for (const q of ['ماهي طريقة احتساب الزكاة السنوية حسب للمعايير السعودية', 'كيف احسب الوعاء الزكوي', 'طريقة حساب الزكاة', 'كيف تحسب الزكاة للشركة']) expect(findGuide(q)?.key).toBe('zakat_calc');
    for (const q of ['ما نسبة ضريبة القيمة المضافة', 'زكاة مكلفي التقديري كيف تحسب', 'ما سعر ضريبة الدخل']) expect(findGuide(q)).toBeNull();
  });
});

import { foreignCountries, saudiPart, splitQuestions } from '../src/modules/legal/router.js';
describe('طبقات الإجابة: الدول وتفكيك الأسئلة', () => {
  it('تتعرف على الدول الأخرى وتفصل جزء المملكة', () => {
    const q = 'ماهي نسبة ضريبة القيمة المضافة في المملكة العربية السعودية وفي مصر؟';
    expect(foreignCountries(q)).toEqual(['مصر']);
    expect(saudiPart(q)).not.toContain('مصر');
    expect(foreignCountries('ما نسبة الزكاة')).toEqual([]);
    expect(foreignCountries('الاستقطاع على المدفوعات لغير المقيم في الإمارات')).toEqual(['الإمارات']);
  });
  it('تفصل الأسئلة المتعددة في رسالة واحدة', () => {
    expect(splitQuestions('ما نسبة الزكاة؟ وما غرامة تأخير الإقرار؟')).toHaveLength(2);
    expect(splitQuestions('ما نسبة الزكاة')).toEqual(['ما نسبة الزكاة']);
  });
});

describe('الإجابات المنظمة لباقي الضرائب', () => {
  it('كل سؤال «كيف تُحسب» يذهب لإجابته، وأسئلة النسب لا تُلتقط', () => {
    expect(findGuide('كيف تحسب ضريبة الدخل على الشركات')?.key).toBe('income_tax_calc');
    expect(findGuide('كيف أحسب ضريبة القيمة المضافة المستحقة')?.key).toBe('vat_calc');
    expect(findGuide('طريقة احتساب ضريبة الاستقطاع')?.key).toBe('wht_calc');
    expect(findGuide('كيف تحسب ضريبة التصرفات العقارية')?.key).toBe('rett_calc');
    expect(findGuide('كيف تحسب الزكاة')?.key).toBe('zakat_calc');
    expect(findGuide('ما نسبة ضريبة الدخل')).toBeNull();
    expect(findGuide('غرامة تأخير سداد ضريبة القيمة المضافة كيف تحسب')).toBeNull();
  });
});
