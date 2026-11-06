/** إجابات «كيف تُحسب؟» المنظمة: خطوات مرتبة، كل خطوة مقتبسة من مادتها في المكتبة النظامية مع رابطها.
 *  لا أرقام من خارج النص؛ والمثال الحسابي يُذكر صراحة أنه مثال. */
import { one } from '../../db/pool.js';
import { searchKey } from '../../lib/arabic.js';
import type { ChatAnswer } from '../ai/chat.js';

interface Step { title: string; text: string; src: string; re: string; ref: string }
interface Guide { key: string; match: (q: string) => boolean; intro: string; steps: Step[]; outro: string[]; suggestions: string[] }

const Z = 'اللائحة التنفيذية لجباية الزكاة (1445';
const N = (s: string) => ` ${searchKey(s).replace(/[؟?!.,،:؛()]/g, ' ').replace(/\s+/g, ' ')} `;

export const GUIDES: Guide[] = [{
  key: 'zakat_calc',
  match: (q) => { const k = N(q); return /زكا|زكوي|الوعاء/.test(k) && /(احتساب|حساب|احسب|نحسب|يحسب|تحسب|طريقه|كيف|معادله|خطوات)/.test(k) && !/تقديري|انشطه التمويل|الصناديق|التامين/.test(k); },
  intro: 'طريقة احتساب الزكاة لمكلف الحسابات وفق اللائحة التنفيذية لجباية الزكاة (1445هـ):',
  steps: [
    { title: 'أولًا: الوعاء الزكوي', text: 'الوعاء = عناصر الإضافة − عناصر الحسم، مع مراعاة الحدين الأدنى والأعلى.', src: Z, re: 'يحسب مكلف الحسابات الوعاء الزكوي بإضافة عناصر الإضافة', ref: 'المادة 21' },
    { title: 'ثانيًا: عناصر الإضافة', text: 'حقوق الملكية وما في حكمها، والالتزامات الواردة في المادة 29 في حدود الأصول المحسومة، والفرق بين صافي الربح المعدل والدفتري.', src: Z, re: 'تشمل عناصر الإضافة إلى الوعاء الزكوي', ref: 'المادة 23' },
    { title: '• المخصصات', text: 'تُضاف معاملة حقوق الملكية برصيد آخر المدة، عدا مخصص مكافأة نهاية الخدمة والإجازات فتعامل التزامات غير متداولة.', src: Z, re: 'تعامل المخصصات وما في حكمها معاملة حقوق الملكية', ref: 'المادة 24' },
    { title: '• الالتزامات المضافة', text: 'الالتزامات غير المتداولة (منها الدفعات المقدمة من العملاء، ومخصص نهاية الخدمة، والتزامات الإيجار)، ولا تُضاف المتداولة إلا في حالات محددة.', src: Z, re: 'يضاف إلى الوعاء الزكوي لمكلف الحسابات من الالتزامات', ref: 'المادة 29' },
    { title: 'ثالثًا: عناصر الحسم', text: 'الاستثمارات في منشآت داخل المملكة وخارجها وفي الصناديق، والأصول الثابتة، والأصول غير الملموسة، والمواد غير المعدة للبيع، والودائع النظامية، والأصل الضريبي المؤجل… وفق المواد المحال إليها.', src: Z, re: 'يحسم مكلف الحسابات من الوعاء الزكوي ما يأتي', ref: 'المادة 26' },
    { title: 'رابعًا: الحد الأدنى للوعاء', text: 'إذا نقص الوعاء عن صافي الربح المعدل يُحدد الوعاء وفق الحالات الواردة في المادة؛ وإن كان الوعاء سالبًا ولا ربح معدل فلا وعاء.', src: Z, re: 'يعد الحد الأدنى للوعاء', ref: 'المادة 27' },
    { title: 'خامسًا: الحد الأعلى للوعاء', text: 'حقوق الملكية وما في حكمها في نهاية العام، مضافًا إليها الفرق بين صافي الربح المعدل والدفتري.', src: Z, re: 'يكون الحد الأعلى|الحد الأعلصى لوعاء الزكاة', ref: 'المادة 28' },
    { title: 'سادسًا: نسبة الزكاة', text: 'الزكاة = الوعاء × 2.5% للسنة الهجرية؛ وإذا اختلف العام الزكوي عن الهجري: 2.5% ÷ عدد أيام السنة الهجرية × عدد أيام السنة المالية.', src: Z, re: 'تكون نسبة الزكاة اثنين ونصف', ref: 'المادة 15' },
  ],
  outro: ['مثال حسابي على المادة 15: إذا كانت السنة المالية 365 يومًا والسنة الهجرية 354 يومًا فالنسبة تساوي 2.5% مضروبة في 365 مقسومة على 354، أي 2.5777% تقريبًا.',
    'لحساب الزكاة على رقم وعاء محدد استخدم حاسبة الزكاة في شاشة النسب والحاسبات (ضمن المرجع النظامي).',
    'لمكلفي التقديري وأنشطة التمويل والصناديق الاستثمارية أحكام خاصة في اللائحة؛ اسأل عنها بالاسم.',
    'النصوص مقتبسة من الوثيقة الرسمية في المكتبة النظامية؛ تحقق من آخر تعديل قبل الاعتماد في إقرار.'],
  suggestions: ['ما عناصر الحسم من الوعاء الزكوي؟', 'الحد الأعلى للوعاء الزكوي', 'زكاة مكلفي التقديري'],
}];

export function findGuide(question: string): Guide | null { return GUIDES.find((g) => g.match(question)) ?? null; }

/** يبني الإجابة: لكل خطوة يجلب المقطع من المكتبة (للمقتطف والرابط)، ولا يعرض خطوة لم يُعثر على نصها */
export async function guideAnswer(question: string): Promise<(ChatAnswer & { links: { label: string; href: string }[] }) | null> {
  const g = findGuide(question); if (!g) return null;
  const text: string[] = [g.intro]; const sources: string[] = []; const links: { label: string; href: string }[] = [];
  for (const s of g.steps) {
    const ch = await one<{ id: string; title: string; ref: string; heading: string | null; body: string }>(
      `SELECT c.id::text, s.title, c.ref, c.heading, c.body FROM legal_chunks c JOIN legal_sources s ON s.code = c.source_code
        WHERE s.title LIKE $1 AND regexp_replace(c.body, '\\s+', ' ', 'g') ~ $2 ORDER BY (c.kind = 'article') DESC, c.page_from NULLS LAST LIMIT 1`, [`${s.src}%`, s.re]);
    if (!ch) continue;
    text.push(`${s.title} (${s.ref}) — ${s.text}`);
    sources.push(`${ch.title} | ${s.ref}`);
    links.push({ label: `${s.ref} | ${s.title.replace(/^[^:]*: |^• /, '').trim()}`, href: `/library?a=${ch.id}` });
  }
  if (links.length < Math.ceil(g.steps.length / 2)) return null;
  text.push(...g.outro);
  return { intent: `guide.${g.key}`, company: 'المكتبة النظامية', period: '', text, sources: [...new Set(sources)], links, suggestions: g.suggestions };
}
