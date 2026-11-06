/** طبقات الإجابة النظامية للمساعد:
 *  1) توجيه السؤال حسب نوعه: «كيف تُحسب؟» ← إجابة منظمة | سؤال نسبة أو غرامة ← جدول النسب | غير ذلك ← البحث في النصوص
 *  2) تفكيك السؤال المركّب (أكثر من دولة أو أكثر من سؤال)
 *  3) حدود المكتبة: الأنظمة الداخلية لغير المملكة غير موجودة؛ يُقال ذلك صراحة
 *  4) عند ضعف المطابقة: «أقرب ما وجدته» بدل «لم أجد» */
import { many } from '../../db/pool.js';
import { searchKey } from '../../lib/arabic.js';
import { getRates, type Rate } from './rates.js';

const K = (s: string) => ` ${searchKey(s).replace(/[؟?!.,،:؛()«»"]/g, ' ').replace(/\s+/g, ' ').trim()} `;

// ---------- 3) الدول (المكتبة تحوي أنظمة المملكة فقط، واتفاقيات منع الازدواج مع دول أخرى) ----------
const COUNTRIES: [string, RegExp][] = [
  ['مصر', /(^| )(و?ب?ف?ي? ?)?مصر( |$)|المصري/], ['الإمارات', /امارات|الاماراتي/], ['الكويت', /كويت/], ['قطر', /( |^)(و?ب?ف?ي? ?)?قطر( |$)/], ['البحرين', /بحرين/],
  ['عُمان', /سلطنه عمان|( |^)(و?ف?ي? ?)عمان( |$)/], ['الأردن', /اردن/], ['المغرب', /( |^)(و?ف?ي? ?)ال?مغرب( |$)/], ['تونس', /تونس/], ['الجزائر', /جزاير/],
  ['لبنان', /لبنان/], ['العراق', /عراق/], ['سوريا', /سوريا/], ['تركيا', /تركيا/], ['الهند', /( |^)ال?هند( |$)/], ['باكستان', /باكستان/], ['الصين', /( |^)ال?صين( |$)/],
  ['فرنسا', /فرنسا/], ['بريطانيا', /بريطانيا|المملكه المتحده/], ['الولايات المتحدة', /امريكا|الولايات المتحده/], ['ألمانيا', /المانيا/], ['اليابان', /يابان/],
];
const SAUDI = /سعوديه|السعوديه|المملكه(?! المتحده)|بالمملكه/;
export function foreignCountries(q: string): string[] { const k = K(q); return COUNTRIES.filter(([, re]) => re.test(k)).map(([n]) => n); }

/** يحذف ذكر الدول الأخرى من السؤال ليُجاب عن الجزء الخاص بالمملكة */
export function saudiPart(q: string): string {
  let s = ` ${q} `;
  for (const [n] of COUNTRIES) { const base = n.replace(/^ال/, ''); s = s.replace(new RegExp(`[\\s،,]*(و\\s*)?(في|ب)?\\s*(ال)?(${base}|${n})(?=[\\s؟?.,،]|$)`, 'g'), ' '); }
  return s.replace(/\s+/g, ' ').trim();
}

export async function outOfScope(country: string, q: string): Promise<{ text: string; links: { label: string; href: string }[] }> {
  const base = country.replace(/^ال/, '');
  const rows = await many<{ code: string; title: string }>(`SELECT code, title FROM legal_sources WHERE title ~ $1 ORDER BY length(title) LIMIT 6`, [`(^|[^ء-ي]|و|ال)${base}([^ء-ي]|$)`]).catch(() => []);
  const seen = new Set<string>(); const src = rows.filter((r) => !seen.has(r.title) && seen.add(r.title)).slice(0, 3);
  const k = K(q); const what = /قيمه ال?مضافه| vat /.test(k) ? 'نسبة ضريبة القيمة المضافة وأحكامها' : /زكا/.test(k) ? 'أحكام الزكاة' : /دخل/.test(k) ? 'نسب ضريبة الدخل الداخلية' : 'أنظمتها الضريبية الداخلية';
  const text = `${country}: المكتبة النظامية تحتوي أنظمة المملكة العربية السعودية فقط، ولا تحتوي ${what} في ${country}.${src.length ? ` الموجود عنها اتفاقيات ثنائية مع المملكة فقط: ${src.map((x) => `«${x.title}»`).join('، ')}؛ وهي لا تحدد النسب الداخلية في ${country}.` : ''} لن أذكر نسبة دون مصدر.`;
  return { text, links: src.map((s) => ({ label: s.title.slice(0, 60), href: `/library?src=${s.code}` })) };
}

// ---------- 2) تفكيك الأسئلة المتعددة في رسالة واحدة ----------
export function splitQuestions(q: string): string[] {
  const parts = q.split(/[؟?]+\s*|\s+(?:وكذلك|وأيضا|وايضا)\s+/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 2);
  return parts.length ? parts : [q];
}

// ---------- 1) أسئلة النسب والغرامات ← جدول النسب ----------
const ASK_RATE = /(نسب|سعر|كم|معدل|مقدار|غرام)/;
/** [معرف النسبة، شرط السؤال] — الشروط على النص بعد التوحيد */
const RATE_RULES: [string, (k: string) => boolean][] = [
  ['zakat.rate', (k) => /زكا/.test(k) && !/غرام|تقديري|عقاري/.test(k)],
  ['vat.rate', (k) => /قيمه المضافه|قيمه مضافه| vat /.test(k) && !/غرام/.test(k)],
  ['rett.rate', (k) => /تصرفات العقاري|التصرفات العقاريه|تصرف عقاري/.test(k) && !/غرام/.test(k)],
  ['it.gas', (k) => /ضريبه الدخل/.test(k) && /غاز/.test(k) && !/غرام/.test(k)],
  ['it.general', (k) => /ضريبه الدخل/.test(k) && !/غاز|استقطاع|غرام/.test(k)],
  ['wht.mgmt', (k) => /استقطاع/.test(k) && /اداره/.test(k)], ['wht.royalty', (k) => /استقطاع/.test(k) && /اتاو|ريع/.test(k)],
  ['wht.rent', (k) => /استقطاع/.test(k) && /ايجار/.test(k)], ['wht.tickets', (k) => /استقطاع/.test(k) && /تذاكر|طيران|شحن/.test(k)],
  ['wht.telecom', (k) => /استقطاع/.test(k) && /اتصالات/.test(k)], ['wht.technical', (k) => /استقطاع/.test(k) && /فني|استشار/.test(k)],
  ['wht.dividends', (k) => /استقطاع/.test(k) && /ارباح|موزع/.test(k)], ['wht.interest', (k) => /استقطاع/.test(k) && /قروض|فوايد|عوايد/.test(k)],
  ['wht.insurance', (k) => /استقطاع/.test(k) && /تامين/.test(k)],
  ['pen.it.late', (k) => /غرام/.test(k) && /(دخل|استقطاع)/.test(k) && /سداد|تاخير السداد/.test(k)],
  ['pen.it.late30', (k) => /غرام/.test(k) && /دخل/.test(k) && /اقرار/.test(k)], ['pen.it.late90', (k) => /غرام/.test(k) && /دخل/.test(k) && /اقرار/.test(k)],
  ['pen.it.late365', (k) => /غرام/.test(k) && /دخل/.test(k) && /اقرار/.test(k)], ['pen.it.late365p', (k) => /غرام/.test(k) && /دخل/.test(k) && /اقرار/.test(k)],
  ['pen.it.fraud', (k) => /غرام/.test(k) && /دخل/.test(k) && /غش|غير حقيقي/.test(k)],
  ['pen.vat.latepay', (k) => /غرام/.test(k) && /قيمه مضافه|قيمه المضافه/.test(k) && /سداد/.test(k)],
  ['pen.vat.latefile', (k) => /غرام/.test(k) && /قيمه مضافه|قيمه المضافه/.test(k) && /اقرار|تقديم/.test(k)], ['pen.vat.latefile.max', (k) => /غرام/.test(k) && /قيمه مضافه|قيمه المضافه/.test(k) && /اقرار|تقديم/.test(k)],
  ['pen.vat.reg', (k) => /غرام/.test(k) && /قيمه مضافه|قيمه المضافه/.test(k) && /تسجيل/.test(k)], ['pen.vat.error', (k) => /غرام/.test(k) && /قيمه مضافه|قيمه المضافه/.test(k) && /خطا/.test(k)],
  ['ex.tobacco', (k) => /انتقاي/.test(k) && /تبغ|سجاير|دخان/.test(k)], ['ex.energy', (k) => /انتقاي/.test(k) && /طاقه/.test(k)], ['ex.soft', (k) => /انتقاي/.test(k) && /غازي/.test(k)],
  ['ex.ecig', (k) => /انتقاي/.test(k) && /الكترون|تدخين/.test(k)], ['ex.sweet', (k) => /انتقاي/.test(k) && /محلا/.test(k)],
];
// سؤال عام عن مجموعة (مثل «نسب الاستقطاع») ← كل نسبها
const GROUP_RULES: [string, (k: string) => boolean][] = [
  ['الاستقطاع', (k) => /استقطاع/.test(k)], ['الانتقائية', (k) => /انتقاي/.test(k)],
];

const STATUS_TEXT = (r: Rate) => r.approved_value != null && !r.changed ? `معتمدة في المكتب${r.approved_by_name ? ` (${r.approved_by_name})` : ''}`
  : r.status === 'match' || r.status === 'match_note' ? `مطابقة في ${r.evidence.length} مصادر رسمية (لم تُعتمد يدويًا بعد)`
  : r.status === 'single' ? 'من مصدر واحد ولم تُعتمد بعد — تحقق منها قبل الاستخدام' : r.status === 'conflict' ? 'المصادر مختلفة ولم تُعتمد بعد — لا تُستخدم قبل الاعتماد' : 'غير متوفرة';
const fmt = (v: number | null, unit: string) => (v == null ? '—' : `${Number(v.toFixed(4))}${unit === '%' ? '%' : ` ${unit}`}`);

export async function rateAnswer(q: string): Promise<{ text: string[]; sources: string[]; links: { label: string; href: string }[] } | null> {
  const k = K(q); if (!ASK_RATE.test(k)) return null;
  let ids = RATE_RULES.filter(([, f]) => f(k)).map(([id]) => id);
  const all = await getRates();
  if (!ids.length) { const g = GROUP_RULES.find(([, f]) => f(k)); if (g) ids = [...all.values()].filter((r) => r.grp === g[0]).map((r) => r.id); }
  const rates = ids.map((id) => all.get(id)).filter((r): r is Rate => Boolean(r));
  if (!rates.length) return null;
  const text: string[] = []; const sources: string[] = [];
  for (const r of rates) {
    const shown = r.approved_value != null && !r.changed ? r.approved_value : r.extracted;
    const ev = r.evidence.find((e) => e.primary) ?? r.evidence[0];
    text.push(`${r.label}: ${fmt(shown, r.unit)} — ${STATUS_TEXT(r)}${ev ? `. المصدر: ${ev.source}، ${ev.ref}` : ''}.`);
    if (r.status === 'conflict') text.push(`القيم في المصادر: ${r.evidence.map((e) => `${fmt(e.value, r.unit)} (${e.source.slice(0, 40)}، ${e.ref})`).join('؛ ')}.`);
    if (ev) sources.push(`${ev.source} | ${ev.ref}`);
  }
  return { text, sources: [...new Set(sources)], links: [{ label: 'جدول النسب ومصادرها', href: '/rates' }] };
}
