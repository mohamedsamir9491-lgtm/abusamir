/**
 * منطق الفترات المالية (مشترك المعنى مع client/src/periods.ts):
 * السنة المالية تُسمّى بسنة انتهائها، وتُحترم نهاية السنة المالية لكل عميل (شهر/يوم).
 */
export type Iso = string; // YYYY-MM-DD
const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const iso = (y: number, m: number, d: number): Iso => `${y}-${pad(m)}-${pad(Math.min(d, daysIn(y, m)))}`;
const parts = (s: Iso) => s.split('-').map(Number) as [number, number, number];
export function addDays(s: Iso, n: number): Iso { const [y, m, d] = parts(s); const t = new Date(Date.UTC(y, m - 1, d + n)); return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
/** نفس اليوم قبل/بعد n سنة (29 فبراير ← 28 فبراير) */
export function shiftYears(s: Iso, n: number): Iso { const [y, m, d] = parts(s); return iso(y + n, m, d); }
export const fmt = (s: Iso) => { const [y, m, d] = parts(s); return `${d}/${m}/${y}`; };

/** حدود السنة المالية المنتهية في سنة `year` لعميل نهاية سنته (شهر/يوم) */
export function fiscalYear(year: number, endMonth = 12, endDay = 31): { start: Iso; end: Iso } {
  const end = iso(year, endMonth, endDay);
  return { start: addDays(shiftYears(end, -1), 1), end };
}
/** السنة المالية (بسنة انتهائها) التي يقع فيها تاريخ معيّن */
export function fiscalYearOf(date: Iso, endMonth = 12, endDay = 31): number {
  const [y] = parts(date); return date <= iso(y, endMonth, endDay) ? y : y + 1;
}
/** هل الفترة سنة كاملة تمامًا (12 شهرًا تنتهي قبل يوم من ذكرى بدايتها)؟ */
export const isFullYear = (start: Iso, end: Iso) => addDays(shiftYears(start, 1), -1) === end;
export const periodType = (start: Iso, end: Iso) => (isFullYear(start, end) ? 'annual' : 'interim');
export function periodLabel(start: Iso, end: Iso): string {
  return isFullYear(start, end) ? `السنة المالية ${parts(end)[0]}` : `الفترة من ${fmt(start)} إلى ${fmt(end)}`;
}
/** صياغة الفترة في التقارير */
export function periodPhrase(start: Iso, end: Iso): string {
  return isFullYear(start, end) ? `للسنة المالية المنتهية في ${fmt(end)}` : `للفترة من ${fmt(start)} إلى ${fmt(end)}`;
}
export const today = (): Iso => new Date().toISOString().slice(0, 10);
/** السنة المالية الحالية للمكتب: الإعداد اليدوي إن وُجد، وإلا سنة تاريخ اليوم */
export const effectiveFiscalYear = (setting: number | null | undefined) => (setting && setting >= 2000 ? setting : parts(today())[0]);

export interface PeriodInput { label: string; start_date: Iso; end_date: Iso; role: string }
/** أخطاء تمنع الحفظ: نهاية قبل البداية، تداخل الفترات، تكرار الفترة الحالية */
export function periodErrors(periods: PeriodInput[]): string[] {
  const errs: string[] = [];
  for (const p of periods) if (p.end_date < p.start_date) errs.push(`تاريخ نهاية «${p.label}» قبل بدايتها`);
  const s = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  for (let i = 1; i < s.length; i++) if (s[i]!.start_date <= s[i - 1]!.end_date) errs.push(`الفترتان «${s[i - 1]!.label}» و«${s[i]!.label}» متداخلتان`);
  if (periods.filter((p) => p.role === 'current').length > 1) errs.push('لا يجوز أكثر من فترة حالية واحدة في الارتباط');
  const cur = periods.find((p) => p.role === 'current');
  for (const p of periods) if (cur && p.role === 'prior' && p.start_date >= cur.start_date) errs.push(`الفترة السابقة «${p.label}» يجب أن تسبق الفترة الحالية`);
  return errs;
}
/** تنبيهات لا تمنع الحفظ */
export function periodWarnings(periods: PeriodInput[], now: Iso = today()): string[] {
  const w: string[] = [];
  for (const p of periods) {
    if (p.end_date > addDays(shiftYears(p.start_date, 1), -1)) w.push(`«${p.label}» أطول من 12 شهرًا`);
    if (p.end_date > now) w.push(`«${p.label}» تنتهي في المستقبل (${fmt(p.end_date)})؛ مناسب لارتباط جارٍ فقط`);
  }
  return w;
}
