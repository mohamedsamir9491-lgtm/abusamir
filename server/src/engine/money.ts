import { Decimal } from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Num = Decimal.Value;

/** تحويل أي قيمة إلى Decimal بأمان؛ النص الفارغ/null = 0 */
export function D(v: Num | null | undefined): Decimal {
  if (v === null || v === undefined || v === '') return new Decimal(0);
  if (v instanceof Decimal) return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return new Decimal(0);
    return new Decimal(v);
  }
  const s = normalizeNumberString(String(v));
  if (s === '' || s === '-') return new Decimal(0);
  try { return new Decimal(s); } catch { return new Decimal(0); }
}

/** يحاول تحويل نص إلى رقم؛ يعيد null إن لم يكن رقمًا صالحًا */
export function parseNumber(v: unknown): Decimal | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? new Decimal(v) : null;
  if (v instanceof Decimal) return v;
  const s = normalizeNumberString(String(v));
  if (s === '' || s === '-' ) return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return new Decimal(s);
}

const ARABIC_DIGITS: Record<string, string> = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

/** تطبيع النص الرقمي: أرقام عربية، فواصل آلاف، أقواس للسالب، رموز العملات، الفاصلة العشرية العربية */
export function normalizeNumberString(raw: string): string {
  let s = raw.trim();
  if (!s) return '';
  s = s.replace(/[٠-٩۰-۹]/g, (d) => ARABIC_DIGITS[d] ?? d);
  s = s.replace(/[‏‎ \s]/g, '');
  s = s.replace(/٬/g, ',').replace(/٫/g, '.');
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/^-/.test(s)) { negative = !negative; s = s.slice(1); }
  if (/-$/.test(s)) { negative = !negative; s = s.slice(0, -1); }
  if (/^(Dr|Cr|دائن|مدين)/i.test(s)) {
    if (/^(Cr|دائن)/i.test(s)) negative = !negative;
    s = s.replace(/^(Dr|Cr|دائن|مدين)\.?/i, '');
  }
  if (/(Dr|Cr)$/i.test(s)) {
    if (/Cr$/i.test(s)) negative = !negative;
    s = s.replace(/(Dr|Cr)$/i, '');
  }
  s = s.replace(/[A-Za-z؀-ۿ$€£¥₹﷼%]/g, '');
  // إذا كانت الفاصلة تُستخدم كفاصل عشري (1.234,56)
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if (s === '' || s === '.') return '';
  return (negative ? '-' : '') + s;
}

export const ZERO = new Decimal(0);
export const sum = (vals: Iterable<Num | null | undefined>): Decimal => {
  let t = new Decimal(0);
  for (const v of vals) t = t.plus(D(v));
  return t;
};
export const abs = (v: Num) => D(v).abs();
export const round2 = (v: Num) => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export const round4 = (v: Num) => D(v).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
export const isZero = (v: Num, tolerance: Num = '0.005') => D(v).abs().lte(D(tolerance));
export const eq = (a: Num, b: Num, tolerance: Num = '0.005') => D(a).minus(D(b)).abs().lte(D(tolerance));
export const toStr = (v: Num) => round2(v).toFixed(2);
export const toDb = (v: Num) => round4(v).toFixed(4);

/** قسمة آمنة: تعيد null عند قسمة على صفر */
export function safeDiv(a: Num, b: Num): Decimal | null {
  const d = D(b);
  if (d.isZero()) return null;
  return D(a).div(d);
}
export function pct(a: Num, b: Num): Decimal | null {
  const r = safeDiv(a, b);
  return r === null ? null : r.mul(100).toDecimalPlaces(2);
}

/** رصيد صافٍ: موجب = مدين، سالب = دائن */
export const net = (debit: Num, credit: Num) => D(debit).minus(D(credit));
export const splitNet = (n: Num): { debit: Decimal; credit: Decimal } => {
  const v = D(n);
  return v.gte(0) ? { debit: v, credit: ZERO } : { debit: ZERO, credit: v.abs() };
};
export { Decimal };
