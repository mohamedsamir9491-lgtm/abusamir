/** الإجابة النظامية: يقتبس نص المادة من المكتبة مع مرجعها (النظام، المادة، الحالة، الصفحة) ولا يولّد نسبًا أو أحكامًا من عنده */
import { searchKey } from '../../lib/arabic.js';
import type { ChatAnswer } from '../ai/chat.js';
import { searchLegal, snippet, type LegalHit } from './library.js';

const N = (s: string) => searchKey(s).replace(/[؟?!.,،:؛()]/g, ' ').replace(/\s+/g, ' ').trim();
// مفردات تدل على سؤال نظامي (زكاة، ضرائب، جمارك، أنظمة)
const LEGAL = ['زكاه', 'الزكوي', 'ضريبه', 'ضريبي', 'الضرائب', 'القيمه المضافه', 'استقطاع', 'الاستقطاع', 'جمارك', 'جمركي', 'الجمركيه', 'التعريفه', 'انتقائيه', 'التصرفات العقاريه', 'منشاه دائمه', 'المنشاه الدائمه',
  'غير المقيم', 'تسعير المعاملات', 'الفوتره', 'فاتوره ضريبيه', 'الفاتوره الالكترونيه', 'هيئه الزكاه', 'لائحه', 'اللائحه', 'نظام ضريبه', 'نظام الزكاه', 'نظام الجمارك', 'الماده', 'ماده ', 'الاقرار', 'اقرار', 'الربط الزكوي', 'الربط الضريبي', 'الاعتراض',
  'غرامه', 'غرامات', 'عقوبه', 'العقوبات', 'مخالفه ضريبيه', 'حسميات', 'الحسميات', 'معفاه من الضريبه', 'الاعفاء الضريبي', 'خاضع للضريبه', 'خاضعه للضريبه',
  'vat', 'zakat', 'withholding', 'customs', 'excise', 'zatca', 'الوعاء'];
// أسئلة بيانات المكتب أو الارتباط (لا تُعامل نظامية)
const DATA = ['حصلنا', 'المستحق على', 'الاتعاب', 'مطالبه', 'المطالبات', 'خطاب', 'رصيد', 'الميزان', 'في القوائم', 'كم بلغ', 'العميل', 'عملائنا'];

export function isLegalQuestion(question: string): boolean {
  const q = ` ${N(question)} `;
  if (!LEGAL.some((w) => q.includes(w))) return false;
  if (DATA.some((w) => q.includes(w))) return false;
  return true;
}

const LINK = (h: LegalHit, q: string) => `/library?a=${h.id}&q=${encodeURIComponent(q)}`;
const cite = (h: LegalHit) => `${h.title} | ${h.ref}${h.heading ? ` (${h.heading})` : ''}${h.status !== 'active' ? ' [إصدار سابق]' : ''}`;

/** يعيد إجابة مقتبسة من المكتبة، أو null إن لم يوجد نص مطابق كفاية */
export async function legalAnswer(question: string): Promise<(ChatAnswer & { links: { label: string; href: string }[] }) | null> {
  const r = await searchLegal(question, { limit: 8 });
  if (!r.hits.length) return null;
  const need = Math.max(1, Math.ceil(r.terms.length * 0.5));
  const good = r.hits.filter((h) => h.matched >= need);
  if (!good.length) return null;
  // السارية أولًا ما لم يكن السابق أعلى مطابقة بفارق واضح
  const active = good.filter((h) => h.status === 'active');
  const top = active.length && active[0].score >= good[0].score - 4 ? active[0] : good[0];
  const rest = good.filter((h) => h.id !== top.id).slice(0, 3);
  const text = [`حسب ${top.title}، ${top.ref}${top.heading ? ` «${top.heading}»` : ''}${top.page_from ? ` (ص ${top.page_from})` : ''}:`, snippet(top.body, r.terms, 700)];
  if (top.status !== 'active') text.push('تنبيه: هذا النص من إصدار سابق أو ملغى؛ راجع النسخة السارية.');
  if (rest.length) text.push(`مواد ذات صلة: ${rest.map((h) => `${h.ref} من ${h.title}`).join('؛ ')}.`);
  text.push('النص مقتبس من الوثيقة الرسمية في المكتبة النظامية؛ تحقق من آخر تعديل قبل الاعتماد في قرار أو إقرار.');
  return {
    intent: 'legal', company: 'المكتبة النظامية', period: '', text,
    sources: [cite(top), ...rest.map(cite)],
    links: [top, ...rest].map((h) => ({ label: `${h.ref} | ${h.title.slice(0, 50)}`, href: LINK(h, question) })),
    suggestions: [],
  };
}

export const LEGAL_NOT_FOUND = (): ChatAnswer => ({ intent: 'legal.none', company: 'المكتبة النظامية', period: '', sources: [], suggestions: ['ما سعر ضريبة الدخل؟', 'الاستقطاع على المدفوعات لغير المقيم', 'غرامة التأخر في السداد'],
  text: ['لم أجد في المكتبة النظامية نصًا يطابق السؤال بدرجة كافية، ولن أجيب بنسبة أو حكم دون مصدر.', 'جرّب صياغة أخرى أو ابحث مباشرة في شاشة «المكتبة النظامية».'] });
