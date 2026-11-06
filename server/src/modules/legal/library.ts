/** المكتبة النظامية: تحميل نصوص الأنظمة من الملف المرفق، والبحث فيها بالمواد مع المرجع */
import { STANDARD_NAMES } from './standards.js';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { pool, one, many } from '../../db/pool.js';
import { searchKey } from '../../lib/arabic.js';
import { logger } from '../../lib/logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CORPUS_FILE = [path.resolve(here, '../../../assets/legal/corpus.json.gz'), path.resolve(here, '../../../../server/assets/legal/corpus.json.gz')].find((p) => fs.existsSync(p)) ?? path.resolve(here, '../../../assets/legal/corpus.json.gz');

interface CorpusSource { code: string; title: string; item: string; cat: string; type: string; status: string; url: string; page_url: string; sha256: string; pages: number; method: string; lang: string }
interface CorpusChunk { s: string; o: number; k: string; r: string; n: number; h: string; t: string; p1: number; p2: number }
interface Corpus { version: string; built_at: string; sources: CorpusSource[]; chunks: CorpusChunk[] }

/** يحمّل المكتبة عند تغيّر إصدارها (يُبقي ما أضافه المكتب يدويًا) */
export async function loadLegalCorpus(file = CORPUS_FILE): Promise<{ loaded: boolean; version?: string }> {
  if (!fs.existsSync(file)) return { loaded: false };
  const corpus = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8')) as Corpus;
  const cur = await one<{ version: string }>('SELECT version FROM legal_meta WHERE id = 1').catch(() => null);
  if (cur?.version === corpus.version) return { loaded: false, version: corpus.version };
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM legal_sources WHERE NOT custom');
    for (const s of corpus.sources) {
      await c.query(`INSERT INTO legal_sources (code, title, item, category, doc_type, status, source_url, page_url, sha256, pages, extraction, lang) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (code) DO NOTHING`,
        [s.code, s.title, s.item, s.cat, s.type, s.status, s.url, s.page_url, s.sha256, s.pages, s.method, s.lang]);
    }
    for (let i = 0; i < corpus.chunks.length; i += 500) {
      const b = corpus.chunks.slice(i, i + 500);
      await c.query(`INSERT INTO legal_chunks (source_code, ord, kind, ref, num, heading, body, page_from, page_to)
        SELECT * FROM unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::int[], $6::text[], $7::text[], $8::int[], $9::int[])`,
        [b.map((x) => x.s), b.map((x) => x.o), b.map((x) => x.k), b.map((x) => x.r), b.map((x) => x.n ?? null), b.map((x) => x.h || null), b.map((x) => x.t), b.map((x) => x.p1), b.map((x) => x.p2)]);
    }
    await c.query(`INSERT INTO legal_meta (id, version, built_at, loaded_at, sources, chunks) VALUES (1, $1, $2, now(), $3, $4)
      ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, built_at = EXCLUDED.built_at, loaded_at = now(), sources = EXCLUDED.sources, chunks = EXCLUDED.chunks`, [corpus.version, corpus.built_at, corpus.sources.length, corpus.chunks.length]);
    await c.query('COMMIT');
    logger.info({ version: corpus.version, sources: corpus.sources.length, chunks: corpus.chunks.length }, 'legal library loaded');
    return { loaded: true, version: corpus.version };
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

// ---------- البحث ----------
const STOP = new Set(['في', 'من', 'علي', 'عن', 'الي', 'ما', 'ماذا', 'هو', 'هي', 'هل', 'كم', 'كيف', 'متي', 'اين', 'لماذا', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'او', 'ام', 'ثم', 'مع', 'كل', 'اي', 'بين', 'عند', 'قد', 'لا', 'لم', 'لن', 'ان', 'انه', 'كان', 'يكون', 'تكون', 'وفق', 'حسب', 'المملكه', 'السعوديه', 'مملكه', 'سعوديه', 'عربيه', 'العربيه', 'وفي', 'وما', 'وهل', 'ايضا', 'ماهي', 'ماهو', 'طريقه', 'كيفيه', 'يعد', 'تعد', 'لاغراض', 'اغراض', 'يجب', 'حال', 'حاله', 'بشان', 'خاص', 'خاصه', 'المتعلقه', 'متعلقه',
  'the', 'of', 'and', 'or', 'to', 'in', 'a', 'an', 'is', 'what', 'for', 'on', 'by', 'with']);
/** نفس تقليص البادئات المستخدم في الفهرس (ar_stem_text) */
export const arStem = (s: string) => searchKey(s).replace(/(^|[^ء-ي0-9a-z])(وبال|وكال|فبال|ولل|فلل|وال|بال|فال|كال|لل|ال|و)([ء-ي0-9a-z]{3,})/g, '$1$3');
// مرادفات وجموع تكسير شائعة في الأنظمة الضريبية (بعد التوحيد وتقليص البادئات)
const SYN: Record<string, string[]> = {
  سعر: ['اسعار', 'نسبه', 'نسب'], نسبه: ['سعر', 'اسعار', 'نسب'], اسعار: ['سعر', 'نسبه'], مده: ['مهله', 'خلال', 'موعد', 'مواعيد'], مهله: ['مده', 'موعد'], موعد: ['مواعيد', 'مهله', 'مده'],
  اقرار: ['اقرارات'], اقرارات: ['اقرار'], تعريف: ['تعريفات', 'يقصد'], غرامه: ['غرامات', 'عقوبه', 'عقوبات', 'مخالفه', 'مخالفات'], عقوبه: ['عقوبات', 'غرامه', 'غرامات'], مخالفه: ['مخالفات', 'غرامه', 'عقوبه'],
  مصروف: ['مصاريف', 'مصروفات', 'نفقات'], مصاريف: ['مصروف', 'مصروفات', 'نفقات'], حسم: ['يحسم', 'حسميات', 'خصم'], حسميات: ['حسم', 'يحسم'], خصم: ['حسم', 'حسميات'], اعفاء: ['اعفاءات', 'معفاه', 'معفي'], معفاه: ['اعفاء', 'معفي'],
  شركه: ['شركات'], شركات: ['شركه'], مكلف: ['مكلفين'], اصل: ['اصول'], اصول: ['اصل'], استهلاك: ['اهلاك'], اهلاك: ['استهلاك'], مخصص: ['مخصصات'], مخصصات: ['مخصص'],
  ربح: ['ارباح'], ارباح: ['ربح'], خساره: ['خسائر'], خسائر: ['خساره'], قرض: ['قروض'], قروض: ['قرض'], فاتوره: ['فواتير', 'فوتره'], فواتير: ['فاتوره', 'فوتره'], فوتره: ['فاتوره', 'فواتير'],
  توريد: ['توريدات'], توريدات: ['توريد'], سلعه: ['سلع'], سلع: ['سلعه'], خدمه: ['خدمات'], خدمات: ['خدمه'], عقار: ['عقارات', 'عقاري', 'عقاريه'], عقاري: ['عقار', 'عقارات'],
  استرداد: ['يسترد', 'استرجاع'], تصدير: ['صادرات'], استيراد: ['واردات'], رسوم: ['رسم'], رسم: ['رسوم'], حصه: ['حصص'], حصص: ['حصه'],
  تاخر: ['تاخير', 'متاخر', 'متاخره'], تاخير: ['تاخر', 'متاخر'], سداد: ['تسديد', 'دفع', 'يسدد'], تسديد: ['سداد', 'دفع'], تقديم: ['يقدم', 'تقدم'], تسجيل: ['يسجل', 'مسجل'],
  زكاه: ['زكوي', 'زكويه'], معيار: ['معايير', 'ifrs', 'ias'], معايير: ['معيار', 'ifrs', 'ias'], زكوي: ['زكاه'], جمرك: ['جمارك', 'جمركي', 'جمركيه'], جمارك: ['جمركي', 'جمركيه'], مقيم: ['مقيمه', 'اقامه'], اقامه: ['مقيم'],
};
export function queryTerms(q: string): string[] {
  q = q.replace(/([\u0621-\u064A]{3,})(?:\u064Bا|ا\u064B)(?![\u0621-\u064A])/g, '$1'); // تنوين الفتح: «مقيمًا» = «مقيم»
  return [...new Set(arStem(q).replace(/[^ء-ي0-9a-z%]+/g, ' ').split(' ').filter((t) => t.length >= 2 && !STOP.has(t)))].slice(0, 12);
}
/** مجموعات الكلمات: كل كلمة من السؤال مع مرادفاتها */
const lamBase = (t: string) => (t.startsWith('ل') && LAM.has(t.slice(1)) ? t.slice(1) : null);
export const termGroups = (terms: string[]) => terms.map((t) => { const b = lamBase(t); return [...new Set([t, ...(SYN[t] ?? []), ...(b ? [b, ...(SYN[b] ?? [])] : [])])]; });
// «لضريبة» و«للزكاة»: لام الجر لا يحذفها الفهرس، فتُحذف من كلمات السؤال المعروفة فقط
const LAM = new Set(['ضريبه', 'ضرايب', 'زكاه', 'دخل', 'نظام', 'مكلف', 'مكلفين', 'شركه', 'شركات', 'هييه', 'غير', 'مقيم', 'معيار']);
// «مقيمًا» و«عقارية»: حذف ألف التنوين والتاء المربوطة في البادئة ليطابق «مقيم» و«عقاري»
const tsTerm = (t: string) => (t.length >= 5 && /[اه]$/.test(t) ? `${t.slice(0, -1)}:*` : t.length >= 4 ? `${t}:*` : t);
const tsGroup = (g: string[]) => g.map((t) => t.replace(/[':&|!()\\]/g, '')).filter(Boolean).map(tsTerm).join(' | ');
/** نوع الضريبة المذكور في السؤال ← نمط يطابق عنوان المصدر أو تصنيفه */
// [نمط السؤال، نمط عنوان المصدر، كلمات النوع التي يُستغنى عنها في الترتيب لأنها في كل مواد النظام]
const DOMAINS: [RegExp, string, string[]][] = [
  [/التصرفات العقاري/, 'التصرفات العقارية', ['ضريبه', 'تصرفات', 'عقاريه']], [/انتقايي/, 'انتقائي', ['ضريبه', 'انتقاييه', 'انتقايي']],
  [/القيمه المضافه|\bvat\b|ضريبه المدخلات|ضريبه المخرجات|دول المجلس/, 'القيمة المضافة', ['ضريبه', 'قيمه', 'مضافه']],
  [/زكا|زكوي/, 'زكا|زكوي', ['زكاه', 'زكوي', 'زكويه', 'وعاء', 'جبايه']], [/جمارك|جمركي|الاستيراد|الفسح/, 'جمارك|جمركي|الجمارك', ['جمارك', 'جمركي', 'جمركيه']],
  [/ضريبه الدخل|استقطاع|الاستقطاع|غير المقيم/, 'ضريبة الدخل|الاستقطاع|الدخل', ['ضريبه', 'ضريبي', 'دخل']],
  [/\bifrs\b|\bias\b|معيار|معايير/, 'IFRS|standard', ['معيار', 'معايير', 'ifrs', 'ias']],
];
const GENERAL = ['نظام', 'لايحه', 'تنفيذيه'];
const domainOf = (q: string) => { const k = searchKey(q); return DOMAINS.find(([re]) => re.test(k)) ?? null; };
export function taxDomain(q: string): string | null { return domainOf(q)?.[1] ?? null; }
/** «المادة 7 من نظام ضريبة الدخل» → رقم المادة */
export function standardRef(q: string): string | null {
  const m = q.match(/\b(IFRS|IAS|IFRIC|SIC)[\s\-]?(\d{1,2})\b/i); if (!m) return null;
  const k = m[1].toUpperCase(); return k === 'SIC' ? `SIC-${m[2]}` : `${k} ${m[2]}`;
}
/** «معيار عقود الإيجار» ← IFRS 16: يُطابَق اسم المعيار العربي كاملًا (بعد التوحيد) في أسئلة المعايير فقط */
const STD_KEYS = Object.entries(STANDARD_NAMES).map(([code, name]) => ({ code, words: queryTerms(name.replace(/[:()،]/g, ' ')) })).filter((x) => x.words.length).sort((a, b) => b.words.length - a.words.length);
export function standardByName(q: string, minWords = 1): string | null {
  const t = new Set(queryTerms(q)); const hit = STD_KEYS.find((x) => x.words.length >= minWords && x.words.every((w) => t.has(w)));
  return hit?.code ?? null;
}
export function articleNumber(q: string): number | null {
  const m = searchKey(q).match(/ماد[ةه]\s*\(?\s*(\d{1,3})\b/);
  return m ? Number(m[1]) : null;
}

export interface LegalHit { id: string; source_code: string; ref: string; heading: string | null; body: string; kind: string; num: number | null; page_from: number; page_to: number; title: string; category: string; doc_type: string; status: string; source_url: string | null; score: number; matched: number }

/** بحث مرتب: عدد الكلمات المطابقة أولًا، ثم كثافتها، مع تفضيل الأنظمة واللوائح السارية */
export async function searchLegal(q: string, opts: { limit?: number; category?: string; status?: string; type?: string; source?: string } = {}): Promise<{ terms: string[]; groups: number; hits: LegalHit[] }> {
  const terms = queryTerms(q); if (!terms.length) return { terms, groups: 0, hits: [] };
  const d = domainOf(q); const dom = d?.[1] ?? null; const drop = new Set([...(d?.[2] ?? []), ...(d ? GENERAL : []), ...(d && dom !== 'IFRS|standard' ? ['معايير', 'معيار'] : [])]); /* «المعايير السعودية» في سؤال زكوي/ضريبي تعني الأنظمة لا معايير المحاسبة */
  const core = terms.filter((t) => !drop.has(t) && !drop.has(lamBase(t) ?? ''));
  const groups = termGroups(core.length ? core : terms); const tq = groups.map((g) => `(${tsGroup(g)})`).join(' | ');
  const artNo = articleNumber(q); const std = standardRef(q) ?? (dom === 'IFRS|standard' || !dom ? standardByName(q, dom ? 1 : 2) : null);
  const params: unknown[] = [tq]; const cond: string[] = [`(c.tsv @@ to_tsquery('simple', $1)${artNo ? ` OR (c.kind = 'article' AND c.num = ${artNo})` : ''}${std ? ` OR c.ref = '${std}' OR c.ref LIKE '${std} |%'` : ''})`];
  if (opts.category) { params.push(`%${opts.category}%`); cond.push(`s.category ILIKE $${params.length}`); }
  if (opts.status) { params.push(opts.status); cond.push(`s.status = $${params.length}`); }
  if (opts.type) { params.push(opts.type); cond.push(`s.doc_type = $${params.length}`); }
  if (opts.source) { params.push(opts.source); cond.push(`s.code = $${params.length}`); }
  const gi = groups.map((g) => { params.push(tsGroup(g)); return params.length; });
  // ندرة الكلمة (IDF): «الوعاء» و«الضريبة» شائعة في كل المواد، أما «المخصصات» فتحدد الموضوع
  const df = await one<Record<string, string>>(`SELECT count(*) AS n, ${gi.map((i, k) => `count(*) FILTER (WHERE tsv @@ to_tsquery('simple', $${k + 1})) AS d${k}`).join(', ')} FROM legal_chunks`, gi.map((i) => params[i - 1]));
  const N = Number(df?.n ?? 1); const idf = gi.map((_, k) => Math.log((N + 1) / (Number(df?.[`d${k}`] ?? 0) + 1)));
  const mx = Math.max(...idf, 0.01); const w = idf.map((v) => Math.max(0.15, v / mx).toFixed(3));
  const matchedExpr = gi.map((i) => `(c.tsv @@ to_tsquery('simple', $${i}))::int`).join(' + ');
  const wMatched = gi.map((i, k) => `(c.tsv @@ to_tsquery('simple', $${i}))::int * ${w[k]}`).join(' + ');
  // عنوان المادة يحدد موضوعها: تطابقه أقوى من تطابق المتن، وعنوان النظام يحدد المصدر المقصود
  const headExpr = gi.map((i, k) => `(to_tsvector('simple', ar_stem_text(coalesce(c.heading, ''))) @@ to_tsquery('simple', $${i}))::int * ${w[k]}`).join(' + ');
  const titleExpr = gi.map((i) => `(to_tsvector('simple', ar_stem_text(s.title || ' ' || s.category)) @@ to_tsquery('simple', $${i}))::int`).join(' + ');
  // نوع الضريبة المذكور في السؤال يحصر الترجيح في مصادره
  let domExpr = '0';
  if (dom) { params.push(dom); domExpr = `CASE WHEN (s.title || ' ' || s.category || ' ' || s.doc_type) ~ $${params.length} THEN 4 WHEN ${dom === 'IFRS|standard' ? 'false' : "s.doc_type = 'standard'"} THEN -10 ELSE -1.5 END`; /* سؤال زكوي/ضريبي لا تجيب عنه معايير المحاسبة */ }
  const limit = Math.min(50, opts.limit ?? 10); params.push(limit * 2);
  const rows = await many<LegalHit>(`SELECT * FROM (SELECT c.id::text, c.source_code, c.ref, c.heading, c.body, c.kind, c.num, c.page_from, c.page_to, s.title, s.category, s.doc_type, s.status, s.source_url,
      (${matchedExpr}) AS matched,
      ((${wMatched}) * 4 + (${headExpr}) * 6 + (${titleExpr}) * 2 + (${domExpr}) + ts_rank_cd(c.tsv, to_tsquery('simple', $1), 1) * 12
        - CASE WHEN length(c.body) > 2500 THEN ln(length(c.body) / 2500.0) * 4 ELSE 0 END
        + CASE WHEN ${artNo ? `c.kind = 'article' AND c.num = ${artNo}` : 'false'} THEN 8 ELSE 0 END
        + CASE WHEN ${std ? `c.ref = '${std}'` : 'false'} THEN 20 WHEN ${std ? `c.ref LIKE '${std} |%'` : 'false'} THEN 14 ELSE 0 END
        + CASE WHEN s.status = 'active' THEN 3 ELSE 0 END
        + CASE s.doc_type WHEN 'law' THEN 1.2 WHEN 'regulation' THEN 1.2 WHEN 'standard' THEN 1 WHEN 'rules' THEN .6 WHEN 'decision' THEN .5 WHEN 'ruling' THEN .5 WHEN 'guide' THEN .4 ELSE 0 END
        + CASE WHEN c.kind = 'article' THEN .8 WHEN c.kind = 'intro' THEN -1.5 ELSE 0 END) AS score
    FROM legal_chunks c JOIN legal_sources s ON s.code = c.source_code
    WHERE ${cond.join(' AND ')}) x ORDER BY score DESC LIMIT $${params.length}`, params);
  // النظام نفسه قد يرد من مصدرين رسميين (الهيئة وهيئة الخبراء): تُعرض المادة مرة واحدة بأعلى ترتيب
  const seen = new Set<string>(); const hits: LegalHit[] = [];
  for (const r of rows) {
    const key = r.kind === 'article' && r.heading ? `${r.doc_type}|${r.ref.replace(/ \(جزء \d+\)$/, '')}|${searchKey(r.heading)}` : r.id;
    if (seen.has(key)) continue; seen.add(key);
    hits.push({ ...r, score: Number(r.score), matched: Number(r.matched) }); if (hits.length >= limit) break;
  }
  return { terms, groups: groups.length, hits };
}

/** مقتطف حول أول ظهور لكلمات البحث */
export function snippet(body: string, terms: string[], size = 420): string {
  const words = body.split(/(\s+)/); const keys = words.map((w) => arStem(w));
  let at = keys.findIndex((k) => terms.some((t) => k.includes(t)));
  if (at < 0) at = 0;
  let start = 0; let len = 0; for (let i = 0; i < at; i++) len += words[i].length;
  start = Math.max(0, len - Math.floor(size / 3));
  const s = body.slice(start, start + size).trim();
  return (start > 0 ? '… ' : '') + s + (start + size < body.length ? ' …' : '');
}

export async function legalStats() {
  const meta = await one<{ version: string; loaded_at: string; sources: number; chunks: number }>('SELECT version, loaded_at, sources, chunks FROM legal_meta WHERE id = 1').catch(() => null);
  const cats = await many<{ category: string; n: string; articles: string; chunks: string }>(`SELECT s.category, count(DISTINCT s.code) AS n, count(c.id) FILTER (WHERE c.kind = 'article') AS articles, count(c.id) AS chunks FROM legal_sources s LEFT JOIN legal_chunks c ON c.source_code = s.code GROUP BY 1 ORDER BY 2 DESC`);
  return { meta, categories: cats.map((c) => ({ category: c.category, sources: Number(c.n), articles: Number(c.articles), chunks: Number(c.chunks) })) };
}
