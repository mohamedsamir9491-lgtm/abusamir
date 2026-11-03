/**
 * كتابة المبالغ بالحروف العربية (التفقيط) وتنسيق مبلغ الأتعاب مع العملة.
 * الصيغة المعتمدة في الخطابات والفواتير: «فقط ستة آلاف ريال سعودي لا غير».
 */
export interface CurrencyInfo { code: string; name: string; sub: string; subPer: number }
export const CURRENCIES: CurrencyInfo[] = [
  { code: 'SAR', name: 'ريال سعودي', sub: 'هللة', subPer: 100 },
  { code: 'USD', name: 'دولار أمريكي', sub: 'سنت', subPer: 100 },
  { code: 'EUR', name: 'يورو', sub: 'سنت', subPer: 100 },
  { code: 'AED', name: 'درهم إماراتي', sub: 'فلس', subPer: 100 },
  { code: 'KWD', name: 'دينار كويتي', sub: 'فلس', subPer: 1000 },
  { code: 'BHD', name: 'دينار بحريني', sub: 'فلس', subPer: 1000 },
  { code: 'OMR', name: 'ريال عماني', sub: 'بيسة', subPer: 1000 },
  { code: 'QAR', name: 'ريال قطري', sub: 'درهم', subPer: 100 },
  { code: 'JOD', name: 'دينار أردني', sub: 'فلس', subPer: 1000 },
  { code: 'EGP', name: 'جنيه مصري', sub: 'قرش', subPer: 100 },
];
export const currencyInfo = (code: string | null | undefined): CurrencyInfo => CURRENCIES.find((c) => c.code === String(code ?? '').toUpperCase()) ?? CURRENCIES[0]!;

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
// [مفرد، مثنى، جمع (3-10)، تمييز منصوب (11-99)]
const SCALES: [string, string, string, string][] = [['ألف', 'ألفان', 'آلاف', 'ألفًا'], ['مليون', 'مليونان', 'ملايين', 'مليونًا'], ['مليار', 'ملياران', 'مليارات', 'مليارًا']];

function under1000(n: number): string {
  const h = Math.floor(n / 100); const r = n % 100; const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]!);
  if (r) parts.push(r < 20 ? ONES[r]! : r % 10 ? `${ONES[r % 10]} و${TENS[Math.floor(r / 10)]}` : TENS[Math.floor(r / 10)]!);
  return parts.join(' و');
}
function scaled(n: number, s: [string, string, string, string]): string {
  if (n === 1) return s[0]; if (n === 2) return s[1];
  const r = n % 100;
  if (n < 100 && r >= 3 && r <= 10) return `${under1000(n)} ${s[2]}`;
  if (r >= 11) return `${under1000(n)} ${s[3]}`;
  if (r >= 3 && r <= 10) return `${under1000(n)} ${s[2]}`;
  return `${under1000(n)} ${s[0]}`;
}
/** عدد صحيح موجب حتى 999,999,999,999 بالحروف */
export function intToArabicWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  n = Math.floor(n); if (n === 0) return 'صفر';
  const groups: number[] = []; while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  if (groups.length > 4) return '';
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) { const g = groups[i]!; if (!g) continue; parts.push(i === 0 ? under1000(g) : scaled(g, SCALES[i - 1]!)); }
  return parts.join(' و');
}

/** يحوّل النص المُدخل إلى رقم إن كان مبلغًا رقميًا صِرفًا (يقبل الفواصل والأرقام الهندية)؛ وإلا null */
export function parseAmount(text: string): number | null {
  const t = String(text ?? '').trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[,،٬\s]/g, '').replace('٫', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  return Number(t);
}
export function amountInWords(v: number, cur: CurrencyInfo): string {
  const whole = Math.floor(v); const frac = Math.round((v - whole) * cur.subPer);
  let s = `${intToArabicWords(whole)} ${cur.name}`;
  if (frac) s += ` و${intToArabicWords(frac)} ${cur.sub}`;
  return `فقط ${s} لا غير`;
}
/** تنسيق مبلغ الأتعاب: رقم بفواصل الآلاف + اسم العملة (+ التفقيط اختياريًا). النص الحر (مثل «حسب الساعات») يبقى كما هو. */
export function formatFeeAmount(text: string, currencyCode: string, withWords: boolean): { text: string; words: string } {
  const raw = String(text ?? '').trim(); const cur = currencyInfo(currencyCode);
  const v = parseAmount(raw);
  if (v === null) {
    // نص فيه رقم + اسم عملة (مثل «25,000 ريال سعودي»): يبقى كما كتبه المستخدم ويُضاف التفقيط
    const named = CURRENCIES.find((c) => raw.endsWith(c.name) || raw.toUpperCase().endsWith(c.code));
    const n = named ? parseAmount(raw.slice(0, raw.length - (raw.endsWith(named.name) ? named.name.length : named.code.length))) : null;
    return { text: raw, words: withWords && named && n !== null ? amountInWords(n, named) : '' };
  }
  const dec = Math.round((v - Math.floor(v)) * cur.subPer) ? (cur.subPer === 1000 ? 3 : 2) : 0;
  const num = v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return { text: `${num} ${cur.name}`, words: withWords ? amountInWords(v, cur) : '' };
}
