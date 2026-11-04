/** مساعد سهم الذكي على مستوى المكتب: أسئلة الأتعاب والتحصيل والمستحقات والمواعيد والعملاء من بيانات البرنامج (محليًا بلا مزوّد خارجي) */
import { practiceDashboard } from '../practice/routes.js';
import { searchKey } from '../../lib/arabic.js';
import type { ChatAnswer } from './chat.js';

const m = (v: number, d = 2) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const N = (s: string) => searchKey(s).replace(/[؟?!.,،:؛]/g, ' ').replace(/\s+/g, ' ').trim();
const has = (q: string, ...w: string[]) => w.some((x) => q.includes(N(x)));
const LC: Record<string, string> = { draft: 'مسودة خطاب', issued: 'خطاب صادر', sent: 'بانتظار توقيع العميل', signed: 'تحت التنفيذ', closed: 'مُقفل', cancelled: 'ملغى' };
export const OFFICE_SUGGEST = ['كم المستحق على العملاء؟', 'كم حصلنا هذا العام؟', 'ما الإيراد المكتسب؟', 'ما مواعيدي القادمة؟', 'ملخص المكتب', 'الخطابات بانتظار التوقيع'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const dAr = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

/** عدّ عربي: 1 مفرد، 2 مثنى، 3–10 جمع، 11+ مفرد منصوب */
const cnt = (n: number, one: string, two: string, few: string, many: string) => n === 0 ? `لا ${few}` : n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
type Dash = Awaited<ReturnType<typeof practiceDashboard>>;
/** يجيب إن كان السؤال عن المكتب أو عن عميل بالاسم؛ وإلا يعيد null ليتولاه محاسب الارتباط */
export async function officeAnswer(question: string, load: (y: number) => Promise<Dash> = practiceDashboard): Promise<ChatAnswer | null> {
  const q = N(question); const year = new Date().getFullYear();
  const d = await load(year); const f = d.finance; const c = d.counts; const n = (k: string) => Number(c?.[k] ?? 0);
  const base = { company: 'المكتب', period: `السنة ${year}`, sources: [`الدورة المالية للمكتب ${year}`], suggestions: OFFICE_SUGGEST };
  // عميل بالاسم
  const engs = d.engagements as { client_name: string; title: string; fee: number; billed: number; collected_net: number; remaining: number; lifecycle: string | null; progress: { done: number; total: number } }[];
  const stop = new Set(['شركه', 'مؤسسه', 'مجموعه', 'مكتب', 'مصنع', 'القابضه', 'التجاريه', 'للتجاره']);
  const hit = engs.filter((e) => N(e.client_name).split(' ').filter((t) => t.length >= 3 && !stop.has(t)).some((t) => q.includes(t)));
  if (hit.length) {
    return { ...base, intent: 'office.client', company: hit[0].client_name, text: hit.map((e) => `${e.client_name}: ${e.title}. الحالة: ${LC[e.lifecycle ?? 'draft'] ?? '—'}، التنفيذ ${e.progress.done} من ${e.progress.total}. الأتعاب ${m(e.fee)}، المفوتر ${m(e.billed)}، المحصّل ${m(e.collected_net)} (بدون الضريبة)، المتبقي ${m(e.remaining)}.`),
      table: { columns: ['العميل', 'الأتعاب', 'المحصّل', 'المتبقي', 'التنفيذ'], rows: hit.map((e) => [e.client_name, m(e.fee), m(e.collected_net), m(e.remaining), `${e.progress.done}/${e.progress.total}`]) } };
  }
  if (has(q, 'مستحق', 'متبقي', 'ذمم', 'مديونيه', 'عليهم', 'متاخر', 'اعمار')) {
    const due = d.deadlines.find((x) => x.title.includes('استحقاق'));
    return { ...base, intent: 'office.receivables', text: [`المستحق على العملاء ${m(f.outstanding)} ريال شامل الضريبة.`, ...f.aging.filter((b) => b.v > 0).map((b) => `${b.label}: ${m(b.v)}`), f.late_clients ? `${cnt(f.late_clients, 'عميل واحد متأخر', 'عميلان متأخران', 'عملاء متأخرين', 'عميلًا متأخرًا')} أكثر من 60 يومًا.` : 'لا يوجد عملاء متأخرون أكثر من 60 يومًا.', ...(due ? [`أقرب استحقاق: ${due.title} على ${due.client} يوم ${dAr(due.date)}.`] : [])],
      table: { columns: ['العمر', 'المبلغ'], rows: f.aging.map((b) => [b.label, m(b.v)]) } };
  }
  if (has(q, 'حصل', 'تحصيل', 'محصل', 'قبض', 'سدد', 'دفعات')) return { ...base, intent: 'office.collected', text: [`المحصّل في ${year}: ${m(f.collected)} ريال بدون الضريبة (${m(f.collected_gross)} شامل الضريبة).`, f.collection_rate != null ? `نسبة التحصيل ${f.collection_rate}% من المفوتر (${m(f.billed)}).` : 'لا مطالبات صادرة هذا العام بعد.'] };
  if (has(q, 'مكتسب', 'لم يطالب', 'غير مفوتر', 'لم نفوتر')) return { ...base, intent: 'office.earned', text: [`المكتسب حسب مرحلة التنفيذ: ${m(f.earned)}.`, `أعمال منفذة لم يُطالب بها: ${m(f.unbilled)}.`, `مفوتر لم يُكتسب بعد: ${m(f.deferred)}.`, 'المبالغ بدون ضريبة القيمة المضافة.'] };
  if (has(q, 'ايراد', 'مفوتر', 'فوتر', 'دخل المكتب', 'مبيعات المكتب', 'مطالبات')) {
    const ms = f.months.filter((x) => x.billed || x.collected);
    return { ...base, intent: 'office.revenue', text: [`إيرادات المكتب ${year}: المفوتر ${m(f.billed)}، المحصّل ${m(f.collected)}، المكتسب حسب التنفيذ ${m(f.earned)}.`, ...(f.target ? [`الهدف السنوي ${m(f.target)}؛ المحقق منه ${Math.round(f.billed / f.target * 100)}%.`] : []), 'كل المبالغ بدون ضريبة القيمة المضافة.'],
      ...(ms.length ? { table: { columns: ['الشهر', 'المفوتر', 'المحصّل'], rows: ms.map((x) => [MONTHS[x.m - 1], m(x.billed), m(x.collected)]) } } : {}) };
  }
  if (has(q, 'موعد', 'مواعيد', 'مهام', 'مهمه', 'اليوم', 'الاسبوع', 'تسليم', 'اجندا')) return { ...base, intent: 'office.deadlines', text: d.deadlines.length ? d.deadlines.map((x) => `${dAr(x.date)}: ${x.title} (${x.client})`) : ['لا مواعيد قريبة.'] };
  if (has(q, 'خطاب', 'توقيع', 'عروض')) return { ...base, intent: 'office.letters', text: [f.awaiting_signature.count ? `${cnt(f.awaiting_signature.count, 'خطاب واحد', 'خطابان', 'خطابات', 'خطابًا')} بانتظار توقيع العميل بقيمة ${m(f.awaiting_signature.value)}.` : 'لا خطابات بانتظار التوقيع.', ...f.pipeline.map((p) => `${p.label}: ${p.n}`)] };
  if (has(q, 'ملاحظ', 'مخاطر', 'تسويات')) return { ...base, intent: 'office.findings', text: [n('high_findings') ? `${cnt(n('high_findings'), 'ملاحظة مرتفعة الأهمية واحدة', 'ملاحظتان مرتفعتا الأهمية', 'ملاحظات مرتفعة الأهمية', 'ملاحظة مرتفعة الأهمية')} مفتوحة في ${cnt(n('high_findings_engs'), 'ارتباط واحد', 'ارتباطين', 'ارتباطات', 'ارتباطًا')}.` : 'لا ملاحظات مرتفعة مفتوحة.', 'للتفاصيل افتح «الملاحظات والتسويات» أو اختر الارتباط واسألني عنه.'] };
  if (has(q, 'طلب', 'ناقص', 'مطلوب من العميل')) return { ...base, intent: 'office.requests', text: [`لدى العملاء ${cnt(n('requests'), 'طلب معلق واحد', 'طلبان معلقان', 'طلبات معلقة', 'طلبًا معلقًا')}، منها ${n('requests_essential')} أساسية.`] };
  if (has(q, 'كم عميل', 'عدد العملاء', 'العملاء', 'الارتباطات', 'ارتباط')) return { ...base, intent: 'office.clients', text: [`${cnt(n('clients'), 'عميل نشط واحد', 'عميلان نشطان', 'عملاء نشطين', 'عميلًا نشطًا')}${n('group_companies') ? ` و${cnt(n('group_companies'), 'شركة واحدة', 'شركتان', 'شركات', 'شركة')} ضمن مجموعات` : ''}، و${cnt(n('active_engagements'), 'ارتباط واحد', 'ارتباطان', 'ارتباطات', 'ارتباطًا')} تحت التنفيذ.`] };
  if (has(q, 'ملخص', 'وضع المكتب', 'نظره عامه', 'تقرير اليوم', 'اخبار', 'كيف الوضع')) return { ...base, intent: 'office.summary', text: [
    `${cnt(n('clients'), 'عميل نشط واحد', 'عميلان نشطان', 'عملاء نشطين', 'عميلًا نشطًا')} و${cnt(n('active_engagements'), 'ارتباط واحد', 'ارتباطان', 'ارتباطات', 'ارتباطًا')} تحت التنفيذ.`, `المفوتر ${m(f.billed)}، المحصّل ${m(f.collected)}، المستحق ${m(f.outstanding)} شامل الضريبة.`,
    `المكتسب ${m(f.earned)}، منه ${m(f.unbilled)} لم يُطالب به.`, `${cnt(n('high_findings'), 'ملاحظة مرتفعة واحدة', 'ملاحظتان مرتفعتان', 'ملاحظات مرتفعة', 'ملاحظة مرتفعة')}، و${cnt(n('requests'), 'طلب عميل معلق واحد', 'طلبان معلقان', 'طلبات معلقة', 'طلبًا معلقًا')}.`, ...(d.deadlines[0] ? [`أقرب موعد: ${d.deadlines[0].title} يوم ${dAr(d.deadlines[0].date)}.`] : [])] };
  return null;
}
