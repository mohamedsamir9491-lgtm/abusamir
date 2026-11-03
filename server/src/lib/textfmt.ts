/** تنسيق المبالغ داخل النصوص المولّدة (عناوين الملاحظات وأوصافها): 391011.00 ← 391,011.00
 *  يقتصر على الأرقام ذات الكسور العشرية حتى لا تتأثر رموز الحسابات (مثل 106021) أو السنوات. */
export function fmtAmounts(text: string | null | undefined): string {
  return String(text ?? '').replace(/(?<![\d,.])(-?)(\d{4,})(\.\d{1,4})(?![\d])/g, (_m, sign: string, int: string, dec: string) => `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${dec}`);
}
