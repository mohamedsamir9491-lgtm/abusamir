/** الإجابة النظامية: يقتبس نص المادة من المكتبة مع مرجعها (النظام، المادة، الحالة، الصفحة) ولا يولّد نسبًا أو أحكامًا من عنده */
import { searchKey } from '../../lib/arabic.js';
import type { ChatAnswer } from '../ai/chat.js';
import { searchLegal, snippet, type LegalHit } from './library.js';
import { findTopics } from '../ai/knowledge.js';
import { guideAnswer } from './guides.js';
import { rateAnswer, foreignCountries, saudiPart, splitQuestions, outOfScope } from './router.js';
const SAUDI_RE = /سعوديه|السعوديه|المملكه(?! المتحده)/;

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
type Ans = ChatAnswer & { links: { label: string; href: string }[] };
async function searchAnswer(question: string, weak = false): Promise<Ans | null> {
  const r = await searchLegal(question, { limit: 8 });
  if (!r.hits.length) return null;
  const need = Math.max(1, Math.ceil(r.groups * 0.5));
  const good = r.hits.filter((h) => h.matched >= need);
  if (!good.length) {
    if (!weak) return null;
    // 4) بدل «لم أجد»: أقرب النتائج مع تنبيه صريح بضعف المطابقة
    const near = r.hits.slice(0, 3);
    return { intent: 'legal.near', company: 'المكتبة النظامية', period: '', text: ['لم أجد نصًا يطابق السؤال بدرجة كافية. أقرب ما وجدته في المكتبة (مطابقة ضعيفة، قد لا يكون ما تقصده):', ...near.map((h) => `• ${h.ref}${h.heading ? ` «${h.heading}»` : ''} — ${h.title}`), 'جرّب صياغة أدق (اسم النظام أو رقم المادة)، ولن أذكر نسبة أو حكمًا دون نص.'],
      sources: near.map(cite), links: near.map((h) => ({ label: `${h.ref} | ${h.title.slice(0, 50)}`, href: LINK(h, question) })), suggestions: [] };
  }
  // السارية أولًا ما لم يكن السابق أعلى مطابقة بفارق واضح
  const active = good.filter((h) => h.status === 'active');
  const top = active.length && active[0].score >= good[0].score - 8 ? active[0] : good[0];
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

/** إجابة سؤال واحد: إجابة منظمة ← جدول النسب ← النصوص ← أقرب النتائج */
async function answerOne(q: string): Promise<Ans | null> {
  const g = await guideAnswer(q); if (g) return g;
  const rt = await rateAnswer(q);
  if (rt) return { intent: 'legal.rate', company: 'جدول النسب', period: '', text: [...rt.text, 'القيم من «جدول النسب» المستخرج من النصوص الرسمية؛ النسبة غير المعتمدة لا تستخدمها الحاسبات حتى تعتمدها.'], sources: rt.sources, links: rt.links, suggestions: [] };
  return (await searchAnswer(q)) ?? (await searchAnswer(q, true));
}

/** الإجابة النظامية بطبقاتها: تفكيك السؤال (دول/أسئلة متعددة) ثم إجابة كل جزء، وحدود المكتبة للدول الأخرى */
export async function legalAnswer(question: string): Promise<Ans | null> {
  const countries = foreignCountries(question);
  const base = countries.length ? saudiPart(question) : question;
  const askSaudi = !countries.length || SAUDI_RE.test(searchKey(question)) || base.split(/\s+/).length >= 3 && SAUDI_RE.test(searchKey(question));
  const parts = askSaudi ? splitQuestions(base) : [];
  const answers: Ans[] = [];
  for (const p of parts) { const a = await answerOne(p); if (a) answers.push(a); }
  const scope = []; for (const c of countries) scope.push(await outOfScope(c, question));
  if (!scope.length && answers.length === 1) return answers[0];
  if (!scope.length && !answers.length) return null;
  const text: string[] = []; const sources: string[] = []; const links: { label: string; href: string }[] = [];
  answers.forEach((a, i) => { if (countries.length || answers.length > 1) text.push(countries.length ? 'المملكة العربية السعودية:' : `الجزء ${i + 1} (${parts[i]}):`); text.push(...a.text); sources.push(...a.sources); links.push(...a.links); });
  for (const s of scope) { text.push(s.text); links.push(...s.links); }
  return { intent: 'legal.multi', company: 'المكتبة النظامية', period: '', text, sources: [...new Set(sources)], links, suggestions: answers.flatMap((a) => a.suggestions).slice(0, 3) };
}

/** أسئلة المعايير الدولية: الشرح العربي من قاعدة المعرفة + الملخص الرسمي من المكتبة */
export async function standardAnswer(question: string): Promise<(ChatAnswer & { links: { label: string; href: string }[] }) | null> {
  const topics = findTopics(question); const r = await searchLegal(`معيار ${question}`, { limit: 3, type: 'standard' });
  const hit = r.hits.find((h) => h.matched >= Math.max(1, Math.ceil(r.groups * 0.5)));
  if (!topics.length && !hit) return null;
  const t = topics[0]; const text: string[] = [];
  if (t) text.push(`${t.title} (${t.ref}):`, t.body);
  if (hit) text.push(`الملخص الرسمي من مؤسسة IFRS: ${hit.ref}${hit.heading ? ` | ${hit.heading}` : ''}.`);
  return { intent: 'standard', company: 'المعايير الدولية', period: '', text, sources: [...(t ? [t.ref] : []), ...(hit ? [cite(hit)] : [])],
    links: hit ? [{ label: `${hit.ref} | الملخص الرسمي`, href: LINK(hit, question) }] : [], suggestions: topics.slice(1, 4).map((x) => `اشرح ${x.title}`) };
}

export const LEGAL_NOT_FOUND = (): ChatAnswer => ({ intent: 'legal.none', company: 'المكتبة النظامية', period: '', sources: [], suggestions: ['ما سعر ضريبة الدخل؟', 'الاستقطاع على المدفوعات لغير المقيم', 'غرامة التأخر في السداد'],
  text: ['لم أجد في المكتبة النظامية نصًا يطابق السؤال بدرجة كافية، ولن أجيب بنسبة أو حكم دون مصدر.', 'جرّب صياغة أخرى أو ابحث مباشرة في شاشة «المكتبة النظامية».'] });
