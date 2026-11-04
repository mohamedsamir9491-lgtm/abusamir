/** توحيد النص العربي/اللاتيني للبحث والمطابقة فقط (النص المحفوظ والمعروض لا يتغير):
 * أ إ آ ٱ ← ا | ى ← ي | ة ← ه | ؤ ← و | ئ ← ي | الأرقام العربية والفارسية ← 0-9 | حذف التشكيل والتطويل وعلامات الاتجاه | لا فرق بين الأحرف الكبيرة والصغيرة */
const DIGITS: Record<string, string> = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
export const toLatinDigits = (s: string) => s.replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d] ?? d).replace(/٫/g, '.').replace(/٬/g, ',');
export function searchKey(s: string | null | undefined): string {
  return toLatinDigits(String(s ?? '').normalize('NFKC'))
    .replace(/[ً-ٰٟـ​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
/** هل يطابق النص عبارة البحث (كل الكلمات موجودة بأي ترتيب)؟ */
export function matches(text: string | null | undefined, query: string | null | undefined): boolean {
  const q = searchKey(query); if (!q) return true; const t = searchKey(text);
  return q.split(' ').every((w) => t.includes(w));
}
/** صيغة SQL مكافئة لـ searchKey (للبحث داخل قاعدة البيانات عبر الدالة ar_norm) */
export const SQL_NORM = (col: string) => `ar_norm(${col})`;
