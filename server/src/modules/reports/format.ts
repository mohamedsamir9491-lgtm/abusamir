import { D } from '../../engine/money.js';
import { formatDateAr } from '../../lib/dates.js';

/** تنسيق المبالغ: فواصل آلاف، منزلتان عشريتان، السالب بين قوسين (العرف المحاسبي) */
export function fmtMoney(v: string | number | null | undefined, opts: { decimals?: number; parens?: boolean } = {}): string {
  if (v === null || v === undefined || v === '') return '—';
  const d = D(v);
  const decimals = opts.decimals ?? 2;
  const abs = d.abs().toFixed(decimals);
  const [int, frac] = abs.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const s = frac !== undefined ? `${grouped}.${frac}` : grouped;
  if (d.isNegative() && !d.isZero()) return opts.parens === false ? `-${s}` : `(${s})`;
  return s;
}
export function fmtPct(v: string | number | null | undefined): string { return v == null || v === '' ? '—' : `${fmtMoney(v, { parens: false })}%`; }
export function fmtRatio(v: string | null | undefined, unit: string): string {
  if (v == null) return 'بيانات غير كافية';
  if (unit === 'pct') return fmtPct(v);
  if (unit === 'days') return `${v} يومًا`;
  if (unit === 'amount') return fmtMoney(v);
  if (unit === 'times') return `${v} مرة`;
  return v;
}
export const fmtDate = (iso: string | null | undefined, hijri = true) => formatDateAr(iso, hijri);
export const todayIso = () => new Date().toISOString().slice(0, 10);

export const ENGAGEMENT_TYPE_LABELS: Record<string, string> = { management_analysis: 'تحليل مالي إداري داخلي', agreed_upon_review: 'مراجعة محاسبية وفق إجراءات متفق عليها', bookkeeping: 'دعم محاسبي ومسك دفاتر', tax_analysis: 'تحليل ضريبي وزكوي', assurance_audit: 'ارتباط تأكيد / مراجعة مستقلة' };
export const FRAMEWORK_LABELS: Record<string, string> = { ifrs: 'المعايير الدولية للتقرير المالي (IFRS) المعتمدة في المملكة العربية السعودية', ifrs_smes: 'المعيار الدولي للتقرير المالي للمنشآت الصغيرة والمتوسطة المعتمد في المملكة', other: 'إطار آخر (محدد في ملف العميل)', unspecified: 'لم يُحدد إطار التقرير المالي بعد' };
export const ENTITY_LABELS: Record<string, string> = { llc: 'شركة ذات مسؤولية محدودة', jsc: 'شركة مساهمة', sole: 'مؤسسة فردية', partnership: 'شركة تضامن / توصية', branch: 'فرع شركة أجنبية', nonprofit: 'جهة غير ربحية', other: 'أخرى' };
export const STATUS_LABELS: Record<string, string> = { draft: 'مسودة', reviewed: 'تمت المراجعة', approved: 'معتمد للإصدار', issued: 'صادر' };
export const REVIEW_STATUS_LABELS: Record<string, string> = { open: 'مفتوحة', under_review: 'قيد المراجعة', accepted: 'مقبولة', rejected: 'مرفوضة', resolved: 'مُعالجة' };
export const ADJ_STATUS_LABELS: Record<string, string> = { proposed: 'مقترحة', under_review: 'قيد المراجعة', approved: 'معتمدة', rejected: 'مرفوضة', posted: 'مرحّلة' };
