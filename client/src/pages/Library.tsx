/** المكتبة النظامية: الأنظمة واللوائح والأدلة والاتفاقيات مع البحث بالمواد والمرجع */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, BookOpen, ExternalLink, ChevronRight, ChevronLeft, X, Library as LibIcon } from 'lucide-react';
import { get } from '../api';
import { Page, Spinner, Empty, useLoad } from '../components/ui';

type Stats = { meta: { version: string; loaded_at: string; sources: number; chunks: number } | null; categories: { category: string; sources: number; articles: number; chunks: number }[] };
type Source = { code: string; title: string; item: string; category: string; doc_type: string; status: string; source_url: string | null; page_url: string | null; pages: number; lang: string; articles: string; chunks: string };
type Hit = { id: string; source_code: string; ref: string; heading: string | null; kind: string; title: string; category: string; doc_type: string; status: string; source_url: string | null; snippet: string; score: number; page_from: number; page_to: number };
type Chunk = { id: string; source_code: string; ord: number; kind: string; ref: string; heading: string | null; body: string; page_from: number; page_to: number; title: string; category: string; status: string; source_url: string | null; doc_type: string };
type Toc = { id: string; ref: string; heading: string | null; kind: string; page_from: number };

export const DOC_TYPE: Record<string, string> = { law: 'نظام', regulation: 'لائحة تنفيذية', rules: 'قواعد وإجراءات', decision: 'قرار / تعميم', guide: 'دليل إرشادي', agreement: 'اتفاقية', standard: 'معيار', other: 'وثيقة' };
const STATUS: Record<string, [string, string]> = { active: ['سارٍ', 'ok'], superseded: ['سابق / ملغى', 'warn'] };
const stem = (w: string) => norm(w).replace(/[^\u0621-\u064A0-9a-z%]/gi, '').replace(/^(وبال|وكال|فبال|ولل|فلل|وال|بال|فال|كال|لل|ال|و)(?=[\u0621-\u064A]{3,})/, '');
const norm = (s: string) => s.replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');

/** يميّز كلمات البحث داخل النص (مطابقة بعد التوحيد مع السماح بالبادئات) */
function Mark({ text, terms }: { text: string; terms: string[] }) {
  const parts = useMemo(() => {
    if (!terms.length) return [text];
    const out: ReactNode[] = []; const words = text.split(/(\s+)/);
    words.forEach((w, i) => { const k = stem(w); out.push(k.length >= 2 && terms.some((t) => (t.length >= 4 ? k.startsWith(t) : k === t)) ? <mark key={i}>{w}</mark> : w); });
    return out;
  }, [text, terms]);
  return <>{parts}</>;
}
const StatusBadge = ({ s }: { s: string }) => <span className={`badge ${STATUS[s]?.[1] ?? 'neutral'}`}>{STATUS[s]?.[0] ?? s}</span>;

export function Library() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? ''; const cat = sp.get('cat') ?? ''; const src = sp.get('src') ?? ''; const art = sp.get('a') ?? ''; const status = sp.get('st') ?? '';
  const set = (patch: Record<string, string | null>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } setSp(n); };
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => { const t = setTimeout(() => { if (text.trim() !== q) set({ q: text.trim() || null, a: null }); }, 450); return () => clearTimeout(t); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useLoad(() => get<Stats>('/legal/stats'), []);
  const total = stats.data?.categories.reduce((a, c) => a + c.sources, 0) ?? 0; const arts = stats.data?.categories.reduce((a, c) => a + c.articles, 0) ?? 0;
  return <Page title="المكتبة النظامية" icon="library" sub={<>الأنظمة واللوائح والأدلة الرسمية للزكاة والضريبة والجمارك من مصادرها، مقسّمة إلى مواد قابلة للبحث مع المرجع ورابط المصدر.{stats.data?.meta && <> آخر تحديث للمكتبة: {stats.data.meta.version.replace(/^(\d{4})(\d\d)(\d\d).*/, '$3/$2/$1')}.</>}</>}>
    <div className="card lib-search">
      <div className="lib-q"><Search size={18} /><input value={text} onChange={(e) => setText(e.target.value)} placeholder="ابحث بسؤال أو كلمات: سعر ضريبة الدخل، مدة تقديم الإقرار، المادة 68 من نظام ضريبة الدخل…" autoFocus />{text && <button className="iconbtn sm" title="مسح" onClick={() => { setText(''); set({ q: null }); }}><X size={15} /></button>}</div>
      <div className="row" style={{ marginTop: 10 }}>
        <select value={cat} onChange={(e) => set({ cat: e.target.value || null, src: null, a: null })} aria-label="التصنيف"><option value="">كل التصنيفات</option>{stats.data?.categories.map((c) => <option key={c.category} value={c.category}>{c.category || 'غير مصنف'} ({c.sources})</option>)}</select>
        <select value={status} onChange={(e) => set({ st: e.target.value || null })} aria-label="الحالة"><option value="">السارية والسابقة</option><option value="active">السارية فقط</option><option value="superseded">السابقة فقط</option></select>
        <span className="muted" style={{ marginInlineStart: 'auto' }}>{total ? `${total} مصدرًا | ${arts} مادة` : ''}</span>
      </div>
    </div>
    {art ? <Reader id={art} q={q} onOpen={(id) => set({ a: id })} onClose={() => set({ a: null })} onSource={(code) => set({ src: code, a: null, q: null })} />
      : q ? <Results q={q} cat={cat} status={status} onOpen={(id) => set({ a: id })} />
      : src ? <SourceView code={src} onOpen={(id) => set({ a: id })} onBack={() => set({ src: null })} />
      : <Browse stats={stats.data} loading={stats.loading} cat={cat} status={status} onCat={(c) => set({ cat: c })} onSource={(code) => set({ src: code })} />}
  </Page>;
}

function Results({ q, cat, status, onOpen }: { q: string; cat: string; status: string; onOpen: (id: string) => void }) {
  const { data, loading } = useLoad(() => get<{ terms: string[]; hits: Hit[] }>(`/legal/search?limit=25&q=${encodeURIComponent(q)}${cat ? `&category=${encodeURIComponent(cat)}` : ''}${status ? `&status=${status}` : ''}`), [q, cat, status]);
  if (loading || !data) return <Spinner />;
  if (!data.hits.length) return <div className="card"><Empty text="لا نتائج مطابقة. جرّب كلمات أخرى أو أزل عامل التصفية." /></div>;
  return <div className="card"><div className="ch"><Search size={16} /><span>النتائج</span><span className="badge neutral">{data.hits.length}</span><span className="end muted" style={{ fontWeight: 400, fontSize: 12.5 }}>مرتبة حسب المطابقة، مع تفضيل الأنظمة واللوائح السارية</span></div>
    <div className="lib-hits">{data.hits.map((h) => <button key={h.id} className="lib-hit" onClick={() => onOpen(h.id)}>
      <div className="lib-hit-h"><b>{h.ref}{h.heading ? ` | ${h.heading}` : ''}</b><StatusBadge s={h.status} /></div>
      <div className="lib-hit-s">{h.title}<span className="muted"> | {DOC_TYPE[h.doc_type] ?? h.doc_type}{h.page_from ? ` | ص ${h.page_from}` : ''}</span></div>
      <p><Mark text={h.snippet} terms={data.terms} /></p>
    </button>)}</div></div>;
}

function Browse({ stats, loading, cat, status, onCat, onSource }: { stats: Stats | null; loading: boolean; cat: string; status: string; onCat: (c: string) => void; onSource: (code: string) => void }) {
  const { data } = useLoad(() => get<{ sources: Source[] }>(`/legal/sources${cat ? `?category=${encodeURIComponent(cat)}` : ''}`), [cat]);
  if (loading || !stats) return <Spinner />;
  if (!stats.categories.length) return <div className="card"><Empty text="المكتبة فارغة. ستُحمَّل تلقائيًا مع تحديث البرنامج." /></div>;
  const list = (data?.sources ?? []).filter((s) => !status || s.status === status);
  return <>
    <div className="lib-cats">{stats.categories.map((c) => <button key={c.category} className={`lib-cat ${cat === c.category ? 'on' : ''}`} onClick={() => onCat(cat === c.category ? '' : c.category)}><BookOpen size={16} /><b>{c.category || 'غير مصنف'}</b><small>{c.sources} مصدر | {c.articles ? `${c.articles} مادة` : `${c.chunks} مقطع`}</small></button>)}</div>
    <div className="card"><div className="ch"><LibIcon size={16} /><span>{cat || 'كل المصادر'}</span><span className="badge neutral">{list.length}</span></div>
      {!data ? <Spinner /> : <table className="t"><thead><tr><th>المصدر</th><th>النوع</th><th>الحالة</th><th className="num">المواد</th><th className="num">الصفحات</th><th></th></tr></thead>
        <tbody>{list.map((s) => <tr key={s.code} className="clickable" onClick={() => onSource(s.code)}><td><b>{s.title}</b>{s.item && s.item !== s.title && <div className="muted" style={{ fontSize: 12 }}>{s.item}</div>}</td><td>{DOC_TYPE[s.doc_type] ?? s.doc_type}</td><td><StatusBadge s={s.status} /></td><td className="num">{Number(s.articles) || '—'}</td><td className="num">{s.pages}</td>
          <td>{s.source_url && <a className="iconbtn sm" href={s.source_url} target="_blank" rel="noreferrer" title="المصدر الرسمي" onClick={(e) => e.stopPropagation()}><ExternalLink size={15} /></a>}</td></tr>)}</tbody></table>}
    </div></>;
}

function SourceView({ code, onOpen, onBack }: { code: string; onOpen: (id: string) => void; onBack: () => void }) {
  const { data, loading } = useLoad(() => get<{ source: Source; toc: Toc[] }>(`/legal/sources/${code}`), [code]);
  const [f, setF] = useState('');
  if (loading || !data) return <Spinner />;
  const s = data.source; const toc = data.toc.filter((t) => !f || norm(`${t.ref} ${t.heading ?? ''}`).includes(norm(f)));
  return <div className="card"><div className="row between" style={{ marginBottom: 12 }}><button className="btn sec sm" onClick={onBack}><ChevronRight size={15} /> المصادر</button>
      {s.source_url && <a className="btn sec sm" href={s.source_url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> المصدر الرسمي (PDF)</a>}</div>
    <h2 style={{ margin: '0 0 6px' }}>{s.title}</h2>
    <div className="row" style={{ marginBottom: 14 }}><StatusBadge s={s.status} /><span className="badge neutral">{DOC_TYPE[s.doc_type] ?? s.doc_type}</span><span className="badge neutral">{s.category}</span><span className="muted">{s.pages} صفحة</span></div>
    <input value={f} onChange={(e) => setF(e.target.value)} placeholder="تصفية الفهرس (رقم المادة أو عنوانها)" style={{ maxWidth: 360, marginBottom: 10 }} />
    <div className="lib-toc">{toc.map((t) => <button key={t.id} onClick={() => onOpen(t.id)}><b>{t.ref}</b>{t.heading && <span>{t.heading}</span>}<small>ص {t.page_from}</small></button>)}</div>
  </div>;
}

function Reader({ id, q, onOpen, onClose, onSource }: { id: string; q: string; onOpen: (id: string) => void; onClose: () => void; onSource: (code: string) => void }) {
  const { data, loading } = useLoad(() => get<{ terms: string[]; chunk: Chunk; prev: Toc | null; next: Toc | null }>(`/legal/chunks/${id}${q ? `?q=${encodeURIComponent(q)}` : ''}`), [id, q]);
  if (loading || !data) return <Spinner />;
  const c = data.chunk; const terms = data.terms;
  return <div className="card lib-reader">
    <div className="row between" style={{ marginBottom: 10 }}><button className="btn sec sm" onClick={onClose}><ChevronRight size={15} /> رجوع</button>
      <div className="row"><button className="btn sec sm" onClick={() => onSource(c.source_code)}><BookOpen size={15} /> فهرس المصدر</button>{c.source_url && <a className="btn sec sm" href={`${c.source_url}#page=${c.page_from}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> المصدر الرسمي ص {c.page_from}</a>}</div></div>
    <div className="muted" style={{ fontSize: 13 }}>{c.title}</div>
    <h2 style={{ margin: '4px 0 8px' }}>{c.ref}{c.heading ? ` | ${c.heading}` : ''}</h2>
    <div className="row" style={{ marginBottom: 14 }}><StatusBadge s={c.status} /><span className="badge neutral">{DOC_TYPE[c.doc_type] ?? c.doc_type}</span><span className="muted">الصفحات {c.page_from}{c.page_to !== c.page_from ? `–${c.page_to}` : ''}</span></div>
    {c.status !== 'active' && <div className="note warn" style={{ marginBottom: 12 }}>هذا النص من إصدار سابق أو ملغى. راجع النسخة السارية قبل الاعتماد عليه.</div>}
    <div className="lib-body"><Mark text={c.body} terms={terms} /></div>
    <div className="row between" style={{ marginTop: 16 }}>
      {data.prev ? <button className="btn sec sm" onClick={() => onOpen(data.prev!.id)}><ChevronRight size={15} /> {data.prev.ref}</button> : <span />}
      {data.next ? <button className="btn sec sm" onClick={() => onOpen(data.next!.id)}>{data.next.ref} <ChevronLeft size={15} /></button> : <span />}
    </div>
    <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>النص مستخرج آليًا من الوثيقة الرسمية (وقد يتضمن أخطاء قراءة ضوئية في الجداول). المرجع المعتمد هو ملف المصدر الرسمي.</p>
  </div>;
}
