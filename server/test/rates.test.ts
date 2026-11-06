import { describe, it, expect } from 'vitest';
import { calculate, effective, type Rate } from '../src/modules/legal/rates.js';

const R = (id: string, extracted: number | null, status = 'match', approved: number | null = null, changed = false): [string, Rate] => {
  const x = { id, grp: '', label: id, unit: '%', extracted, status, evidence: [{ source: 'نظام', ref: 'المادة', heading: '', page: 1, value: extracted ?? 0, method: 'رقم', excerpt: '', primary: true, type: 'law' }], approved_value: approved, approved_by: null, approved_at: null, note: null, changed } as unknown as Rate;
  const e = effective(x); return [id, { ...x, effective: e, usable: e != null }];
};
const rates = new Map([R('wht.mgmt', 20), R('wht.technical', 5, 'single'), R('pen.it.nofile', 1), R('pen.it.nofile.cap', 20000, 'single', 20000), R('pen.it.late30', 5), R('pen.it.late90', 10), R('pen.it.late365', 20), R('pen.it.late365p', 25), R('pen.it.late', 1),
  R('vat.rate', 15), R('pen.vat.latepay', 5), R('zakat.rate', 2.5), R('rett.rate', 5, 'match_note')]);
const line = (r: ReturnType<typeof calculate>, label: string) => r.lines.find((l) => l.label.includes(label))?.value;

describe('النسب النظامية والحاسبات', () => {
  it('لا تُستخدم نسبة من مصدر واحد قبل اعتمادها، وتُستخدم المعتمدة', () => {
    expect(effective({ status: 'single', extracted: 5, approved_value: null, changed: false })).toBeNull();
    expect(effective({ status: 'match', extracted: 5, approved_value: null, changed: false })).toBe(5);
    expect(effective({ status: 'single', extracted: 5, approved_value: 5, changed: false })).toBe(5);
    expect(effective({ status: 'match', extracted: 6, approved_value: 5, changed: true })).toBeNull();
    const r = calculate('wht', { type: 'wht.technical', amount: 1000 }, rates);
    expect(r.ok).toBe(false); expect(r.missing[0].id).toBe('wht.technical');
  });
  it('الاستقطاع: إجمالي وصافٍ', () => {
    const g = calculate('wht', { type: 'wht.mgmt', amount: 100000, basis: 'gross' }, rates);
    expect(line(g, 'الضريبة المستقطعة')).toBe(20000);
    const n = calculate('wht', { type: 'wht.mgmt', amount: 80000, basis: 'net' }, rates);
    expect(line(n, 'المبلغ الخاضع')).toBe(100000); expect(line(n, 'الضريبة المستقطعة')).toBe(20000);
  });
  it('غرامات ضريبة الدخل: الأعلى من الغرامتين وفترات التأخير', () => {
    const r = calculate('it_penalty', { unpaid: 80000, revenue: 3500000, file_days: 45, pay_days: 75 }, rates);
    expect(line(r, 'الفقرة (أ)')).toBe(20000); expect(line(r, 'الفقرة (ب)')).toBe(8000); expect(line(r, 'الأعلى')).toBe(20000);
    expect(line(r, 'تأخير السداد')).toBe(2400); expect(line(r, 'الإجمالي')).toBe(22400);
    const c = calculate('it_penalty', { unpaid: 80000, revenue: 3500000, file_days: 45, pay_days: 75, partial: 'complete' }, rates);
    expect(line(c, 'تأخير السداد')).toBe(1600);
  });
  it('القيمة المضافة والزكاة والتصرفات العقارية', () => {
    expect(line(calculate('vat', { amount: 1150, basis: 'inclusive' }, rates), 'ضريبة القيمة المضافة')).toBe(150);
    expect(line(calculate('vat', { amount: 1000, late_months: 1.2 }, rates), 'غرامة عدم السداد')).toBe(15);
    const z = calculate('zakat', { base: 1000000, year: 'gregorian', days: 365, hijri_days: 354 }, rates);
    expect(line(z, 'نسبة الزكاة')).toBe(2.5777); expect(line(z, 'الزكاة المستحقة')).toBe(25776.84);
    expect(line(calculate('zakat', { base: 1000000, year: 'hijri' }, rates), 'الزكاة المستحقة')).toBe(25000);
    expect(line(calculate('rett', { value: 2000000 }, rates), 'ضريبة التصرفات')).toBe(100000);
  });
});

describe('المشروبات المحلاة: النهج الحجمي المتدرج (المادتان 3 و4 من اللائحة التنفيذية للضريبة الانتقائية)', () => {
  const S = new Map([R('ex.sweet.t1', 0, 'single', 0), R('ex.sweet.t2', 0), R('ex.sweet.t3', 0.79, 'single', 0.79), R('ex.sweet.t4', 1.09, 'single', 1.09)]);
  it('الشريحة حسب السكر لكل 100 مل، والضريبة = معدل الشريحة × اللترات', () => {
    const r = calculate('sweet', { sugar: 11, ml: 330, units: 1 }, S);
    expect(r.ok).toBe(true); expect(line(r, 'الشريحة الرابعة')).toBe(1.09); expect(line(r, 'الضريبة الانتقائية')).toBe(0.36); // مثال دليل رحلة المتعامل: (330 ÷ 1000) × 1.09
    expect(line(calculate('sweet', { sugar: 6, ml: 1000, units: 24 }, S), 'الضريبة الانتقائية')).toBe(18.96);
    expect(line(calculate('sweet', { sugar: 4.9, ml: 500, units: 10 }, S), 'الضريبة الانتقائية')).toBe(0);
    expect(line(calculate('sweet', { no_sugar: true, ml: 330, units: 6 }, S), 'الشريحة الأولى')).toBe(0);
  });
  it('الشريحة غير المعتمدة لا تُستخدم', () => {
    const r = calculate('sweet', { sugar: 9, ml: 330, units: 1 }, new Map([R('ex.sweet.t4', 1.09, 'single')]));
    expect(r.ok).toBe(false); expect(r.missing[0].id).toBe('ex.sweet.t4');
  });
});
