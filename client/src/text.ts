/** توحيد النص للبحث فقط (يطابق searchKey في الخادم): أ إ آ ٱ ← ا، ى ← ي، ة ← ه، ؤ ← و، ئ ← ي، الأرقام العربية ← 0-9، بلا تشكيل أو تطويل، بلا فرق بين الأحرف الكبيرة والصغيرة */
const D: Record<string, string> = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
export function searchKey(s: unknown): string {
  return String(s ?? '').normalize('NFKC').replace(/[٠-٩۰-۹]/g, (d) => D[d] ?? d).replace(/٫/g, '.').replace(/٬/g, ',')
    .replace(/[ً-ٰٟـ​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
/** هل يحتوي النص على كل كلمات البحث (بأي ترتيب)؟ */
export function matches(text: unknown, query: unknown): boolean { const q = searchKey(query); if (!q) return true; const t = searchKey(text); return q.split(' ').every((w) => t.includes(w)); }
