import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { get, post, put, del } from '../api';
import { Page, useLoad, Spinner, Empty, Money, useAction, Sev, Tabs, Modal, Field, Badge, DangerButton } from '../components/ui';
import { useScope } from '../components/Scope';
import { CATEGORY, REVIEW_STATUS, ADJ_STATUS, fmtDate, SEVERITY } from '../format';
import { useAuth } from '../auth';

type Row = Record<string, string | number | null | Record<string, unknown>>;

/** أسماء بنود القوائم بالعربية (تُحمّل مرة واحدة) */
let fsCache: Record<string, string> | null = null;
function useFsLabels() {
  const [m, setM] = useState<Record<string, string>>(fsCache ?? {});
  useEffect(() => { if (fsCache) return; get<{ lines: { code: string; label_ar: string }[] }>('/accounts/fs-lines').then((r) => { fsCache = Object.fromEntries(r.lines.map((l) => [l.code, l.label_ar])); setM(fsCache); }).catch(() => undefined); }, []);
  return m;
}
/** تنسيق المبالغ داخل نصوص الملاحظات القديمة (391011.00 ← 391,011.00) */
const fmtNums = (v: unknown) => String(v ?? '').replace(/(?<![\d,.])(-?)(\d{4,})(\.\d{1,4})(?!\d)/g, (_m, sg: string, i: string, d: string) => `${sg}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${d}`);

function FindingDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const fsLabel = useFsLabels();
  const { can } = useAuth(); const { run } = useAction(); const [note, setNote] = useState(''); const [comment, setComment] = useState('');
  const { data, reload } = useLoad(() => get<{ finding: Row; comments: Row[]; adjustments: Row[]; history: Row[] }>(`/findings/${id}`), [id]);
  if (!data) return <div className="drawer"><Spinner /></div>;
  const f = data.finding; const ev = (f.evidence as Record<string, unknown>) ?? {};
  const setStatus = async (status: string) => { await run(() => post(`/findings/${id}/status`, { status, note: note || undefined }), 'تم تحديث الحالة'); reload(); onChanged(); };
  return <div className="drawer"><div className="row between"><h2 style={{ margin: 0 }}>{String(f.finding_ref)}</h2><button className="btn sec sm" onClick={onClose}>إغلاق</button></div>
    <div className="row" style={{ margin: '8px 0' }}><Sev s={String(f.severity)} /><Badge k={String(f.category)} map={CATEGORY} /><Badge k={String(f.review_status)} map={REVIEW_STATUS} tone={f.review_status === 'accepted' ? 'ok' : f.review_status === 'rejected' ? 'danger' : 'neutral'} /><span className="muted">{String(f.origin)} {f.rule_code ? `| ${f.rule_code}` : ''}</span></div>
    <h3>{fmtNums(f.title)}</h3><p>{fmtNums(f.description)}</p>
    <BasisBox basis={f.basis as Basis | null} />
    <dl className="kv">{f.account_code && <><dt>الحساب</dt><dd className="mono">{String(f.account_code)} {String(f.account_name ?? '')}</dd></>}{f.fs_line_code && <><dt>بند القوائم</dt><dd>{fsLabel[String(f.fs_line_code)] ?? String(f.fs_line_code)}</dd></>}{f.amount && <><dt>المبلغ</dt><dd><Money v={String(f.amount)} /> {String(f.currency ?? '')}</dd></>}{f.source_row_ref && <><dt>المصدر</dt><dd>{String(f.source_document_title ?? '')} / {String(f.source_row_ref)}</dd></>}{f.calculation && <><dt>الاحتساب</dt><dd className="mono" style={{ direction: 'rtl' }}>{String(f.calculation)}</dd></>}{f.impact && <><dt>الأثر</dt><dd>{String(f.impact)}</dd></>}{f.recommendation && <><dt>الإجراء الموصى به</dt><dd>{String(f.recommendation)}</dd></>}{f.period_label && <><dt>الفترة</dt><dd>{String(f.period_label)}</dd></>}{f.reviewer_name && <><dt>المراجع</dt><dd>{String(f.reviewer_name)} — {String(f.reviewer_note ?? '')}</dd></>}</dl>
    <details style={{ marginTop: 8 }}><summary className="muted">الأدلة التفصيلية (JSON)</summary><pre className="mono" style={{ direction: 'ltr', fontSize: 11, background: '#f6f8fb', padding: 8, overflow: 'auto' }}>{JSON.stringify(ev, null, 2)}</pre></details>
    {can('findings.review') && <div className="card tight" style={{ marginTop: 10 }}><Field label="ملاحظة المراجع"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field><div className="row">{['under_review', 'accepted', 'rejected', 'resolved', 'open'].map((s) => <button key={s} className={`btn sm ${s === 'accepted' ? 'ok' : s === 'rejected' ? 'danger' : 'sec'}`} onClick={() => setStatus(s)}>{REVIEW_STATUS[s]}</button>)}</div></div>}
    <h3>التعليقات</h3>{data.comments.map((c) => <div key={String(c.id)} className="card tight"><b>{String(c.full_name)}</b> <span className="muted">{fmtDate(String(c.created_at), { time: true })}</span><div>{String(c.comment)}</div></div>)}
    <form onSubmit={async (e) => { e.preventDefault(); await run(() => post(`/findings/${id}/comments`, { comment }), 'أُضيف التعليق'); setComment(''); reload(); }} className="row"><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="تعليق…" required /><button className="btn sm">إضافة</button></form>
    {data.adjustments.length > 0 && <><h3>تسويات مرتبطة</h3>{data.adjustments.map((a) => <div key={String(a.id)} className="chip">{String(a.adj_ref)} — {ADJ_STATUS[String(a.status)]}</div>)}</>}
    <h3>سجل الحالة</h3><ul className="muted">{data.history.map((h) => <li key={String(h.id)}>{fmtDate(String(h.created_at), { time: true })}: {String(h.from_status ?? '—')} → {REVIEW_STATUS[String(h.to_status)]} ({String(h.full_name ?? '')}) {h.note ? `- ${h.note}` : ''}</li>)}</ul></div>;
}

type Basis = { kind: string; items: { source: string; ref: string; quote?: string; lang?: string; source_code?: string }[]; note?: string; threshold?: string };
async function openInLibrary(it: { source: string; ref: string; quote?: string; source_code?: string }) {
  const w = window.open('', '_blank');
  try { const r = it.source_code && it.quote ? await get<{ id: string }>(`/legal/locate?source=${it.source_code}&quote=${encodeURIComponent(it.quote.slice(0, 120))}`) : null; if (w) w.location.href = r ? `/library?a=${r.id}` : `/library?q=${encodeURIComponent(it.ref)}${it.source_code ? `&src=${it.source_code}` : ''}`; }
  catch { if (w) w.location.href = `/library?q=${encodeURIComponent(it.ref)}${it.source_code ? `&src=${it.source_code}` : ''}`; }
}
/** الأساس النظامي للملاحظة: المصدر والمادة/الفقرة ومقتطف من النص، مع رابط لفتحه في المكتبة */
function BasisBox({ basis }: { basis: Basis | null }) {
  if (!basis) return null;
  const short = (t: string) => (t.match(/\((ISA|ISRS|ISAE) ?\d+\)/)?.[0].replace(/[()]/g, '') ?? t.match(/^(IAS|IFRS) ?\d+/)?.[0] ?? t.split(' — ')[0]);
  return <div className="card tight" style={{ margin: '8px 0' }}><b>الأساس النظامي</b>
    {basis.kind === 'حسابي' ? <p className="muted" style={{ margin: '4px 0 0' }}>{basis.note}</p> : basis.items.map((it, i) => <div key={i} style={{ marginTop: 6 }}>
      <div><b>{short(it.source)}</b> — {it.ref} <button className="btn sec sm" style={{ fontSize: 12 }} onClick={() => openInLibrary(it)}>فتح النص في المكتبة</button></div>
      <div className="muted" style={{ fontSize: 11.5 }}>{it.source}</div>
      {it.quote && <blockquote dir={it.lang === 'en' ? 'ltr' : 'rtl'} style={{ margin: '4px 0', padding: '4px 8px', borderInlineStart: '3px solid var(--gold-500, #b8962e)', fontSize: 12.5 }}>{it.quote}</blockquote>}
    </div>)}
    {basis.threshold && <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>{basis.threshold}</p>}
  </div>;
}

function AdjustmentForm({ eng, period, findingId, onDone }: { eng: string; period: string; findingId?: string; onDone: () => void }) {
  const { run, busy } = useAction(); const [f, setF] = useState({ description: '', rationale: '', calculation: '' }); const [lines, setLines] = useState([{ account_code: '', account_name: '', debit: '0', credit: '0' }, { account_code: '', account_name: '', debit: '0', credit: '0' }]);
  const dr = lines.reduce((s, l) => s + Number(l.debit || 0), 0); const cr = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); const r = await run(() => post('/adjustments', { engagement_id: eng, period_id: period, finding_id: findingId ?? null, ...f, rationale: f.rationale || null, calculation: f.calculation || null, lines: lines.map((l) => ({ ...l, account_name: l.account_name || null, debit: String(Number(l.debit || 0)), credit: String(Number(l.credit || 0)) })) }), 'تم تسجيل التسوية المقترحة'); if (r) onDone(); };
  return <form onSubmit={submit}><Field label="وصف التسوية *"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required /></Field><Field label="الأساس المحاسبي"><textarea value={f.rationale} onChange={(e) => setF({ ...f, rationale: e.target.value })} /></Field><Field label="الاحتساب"><input value={f.calculation} onChange={(e) => setF({ ...f, calculation: e.target.value })} /></Field>
    <table className="t"><thead><tr><th>رمز الحساب</th><th>اسم الحساب</th><th>مدين</th><th>دائن</th><th></th></tr></thead><tbody>{lines.map((l, i) => <tr key={i}><td><input value={l.account_code} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, account_code: e.target.value } : x))} required dir="ltr" /></td><td><input value={l.account_name} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, account_name: e.target.value } : x))} /></td><td><input type="number" step="0.01" min="0" value={l.debit} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, debit: e.target.value } : x))} dir="ltr" /></td><td><input type="number" step="0.01" min="0" value={l.credit} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, credit: e.target.value } : x))} dir="ltr" /></td><td><button type="button" className="btn sec sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button></td></tr>)}<tr className="total"><td colSpan={2}>الإجمالي</td><td className="num">{dr.toFixed(2)}</td><td className="num">{cr.toFixed(2)}</td><td>{Math.abs(dr - cr) < 0.005 ? <span className="badge ok">متوازن</span> : <span className="badge danger">غير متوازن</span>}</td></tr></tbody></table>
    <div className="row between" style={{ marginTop: 8 }}><button type="button" className="btn sec sm" onClick={() => setLines([...lines, { account_code: '', account_name: '', debit: '0', credit: '0' }])}><Plus size={15} /> سطر</button><button className="btn" disabled={busy || Math.abs(dr - cr) >= 0.005 || dr === 0}>حفظ كتسوية مقترحة</button></div>
    <p className="muted">التسوية لا تُرحَّل تلقائيًا؛ تمر بحالات: مقترحة → قيد المراجعة → معتمدة/مرفوضة. الترحيل يتم في النظام المحاسبي للعميل.</p></form>;
}

export function Findings() {
  const fsLabel = useFsLabels();
  const { eng, period, Selector } = useScope(); const { can, user } = useAuth(); const { run } = useAction(); const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState('findings'); const [sev, setSev] = useState(''); const [cat, setCat] = useState(''); const [st, setSt] = useState(''); const [open, setOpen] = useState<string | null>(sp.get('finding')); const [adjFor, setAdjFor] = useState<string | null | 'new'>(null); const [manual, setManual] = useState(false);
  const { data, loading, reload } = useLoad(() => eng ? get<{ findings: Row[]; counts: Record<string, string> }>(`/findings?engagement_id=${eng}${period ? `&period_id=${period}` : ''}${sev ? `&severity=${sev}` : ''}${cat ? `&category=${cat}` : ''}${st ? `&status=${st}` : ''}`) : Promise.resolve(null), [eng, period, sev, cat, st]);
  const { data: adj, reload: reloadAdj } = useLoad(() => eng ? get<{ adjustments: Row[] }>(`/adjustments?engagement_id=${eng}`) : Promise.resolve(null), [eng]);
  useEffect(() => { if (open) setSp((s) => { s.set('finding', open); return s; }, { replace: true }); }, [open]); // eslint-disable-line
  const [mf, setMf] = useState({ title: '', description: '', category: 'judgment', severity: 'medium', account_code: '', amount: '', recommendation: '' });
  const adjStatus = async (id: string, status: string) => { await run(() => post(`/adjustments/${id}/status`, { status }), 'تم تحديث حالة التسوية'); reloadAdj(); };
  return <Page title="الملاحظات والتسويات" sub="كل ملاحظة لها مرجع ومصدر ودليل حسابي؛ يراجعها المحاسب (قبول/رفض/معالجة) وتُحوّل عند الحاجة إلى تسوية مقترحة تمر بسير اعتماد."
    actions={eng && can('findings.edit') && <><button className="btn sec" onClick={() => setManual(true)}><Plus size={15} /> ملاحظة يدوية</button><button className="btn sec" onClick={() => setAdjFor('new')}><Plus size={15} /> تسوية مقترحة</button></>}>
    <Selector />
    {!eng ? <Empty text="اختر الارتباط" /> : <>
      <Tabs tabs={[{ key: 'findings', label: `الملاحظات (${data?.counts.total ?? 0})` }, { key: 'adjustments', label: `سجل التسويات (${adj?.adjustments.length ?? 0})` }]} active={tab} onChange={setTab} />
      {tab === 'findings' && <>{data && <div className="grid c4"><div className="card stat"><div className="v">{data.counts.open}</div><div className="l">مفتوحة / قيد المراجعة</div></div><div className="card stat danger"><div className="v">{data.counts.critical}</div><div className="l">حرجة</div></div><div className="card stat warn"><div className="v">{data.counts.high}</div><div className="l">مرتفعة</div></div><div className="card stat"><div className="v">{data.counts.accepted}</div><div className="l">مقبولة</div></div></div>}
        <div className="card tight row"><select value={sev} onChange={(e) => setSev(e.target.value)}><option value="">كل الخطورات</option>{Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">كل الفئات</option>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><select value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option>{Object.entries(REVIEW_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="card">{loading ? <Spinner /> : !data?.findings.length ? <Empty text="لا توجد ملاحظات" /> : <table className="t"><thead><tr><th>المرجع</th><th>الخطورة</th><th>الفئة</th><th>الملاحظة</th><th>الحساب</th><th className="num">المبلغ</th><th>الحالة</th><th></th></tr></thead><tbody>{data.findings.map((f) => <tr key={String(f.id)} className="clickable" onClick={() => setOpen(String(f.id))}><td className="mono">{String(f.finding_ref)}</td><td><Sev s={String(f.severity)} /></td><td>{CATEGORY[String(f.category)]}</td><td className="wrap"><b>{fmtNums(f.title)}</b><div className="muted">{fmtNums(String(f.description).slice(0, 160))}{String(f.description).length > 160 ? '…' : ''}</div>{f.basis_label ? <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>الأساس: {String(f.basis_label)}</div> : null}</td><td>{f.account_code ? <><span className="mono">{String(f.account_code)}</span>{f.account_name ? <div className="muted" style={{ fontSize: 12 }}>{String(f.account_name)}</div> : null}</> : f.fs_line_code ? (fsLabel[String(f.fs_line_code)] ?? String(f.fs_line_code)) : '—'}</td><td className="num"><Money v={f.amount as string} /></td><td><Badge k={String(f.review_status)} map={REVIEW_STATUS} tone={f.review_status === 'accepted' ? 'ok' : f.review_status === 'rejected' ? 'danger' : f.review_status === 'resolved' ? 'ok' : 'neutral'} />{f.origin === 'ai' && <span className="badge info">ذكي</span>}</td><td className="row">{can('findings.edit') && <button className="btn sec sm" onClick={(e) => { e.stopPropagation(); setAdjFor(String(f.id)); }}>تسوية</button>}{(can('data.delete') || (f.origin === 'manual' && can('findings.edit'))) && <DangerButton text={`حذف الملاحظة ${f.finding_ref} نهائيًا؟ (البديل المهني: رفضها مع ذكر السبب)`} onConfirm={async () => { await run(() => del(`/findings/${f.id}`), 'حُذفت الملاحظة'); reload(); }} />}</td></tr>)}</tbody></table>}</div></>}
      {tab === 'adjustments' && <div className="card">{!adj?.adjustments.length ? <Empty text="لا توجد تسويات مقترحة" /> : adj.adjustments.map((a) => { const lines = a.lines as unknown as { account_code: string; account_name: string | null; debit: string; credit: string }[]; const s = String(a.status); return <div key={String(a.id)} className="card tight"><div className="row between"><div><b className="mono">{String(a.adj_ref)}</b> {String(a.description)} {a.finding_ref && <span className="chip">{String(a.finding_ref)}</span>}</div><Badge k={s} map={ADJ_STATUS} tone={s === 'approved' ? 'ok' : s === 'rejected' ? 'danger' : 'neutral'} /></div>
        <table className="t"><tbody>{lines.map((l, i) => <tr key={i}><td className="mono">{l.account_code}</td><td>{l.account_name}</td><td className="num"><Money v={l.debit} /></td><td className="num"><Money v={l.credit} /></td></tr>)}<tr className="total"><td colSpan={2}>الإجمالي</td><td className="num"><Money v={String(a.total_debit)} /></td><td className="num"><Money v={String(a.total_credit)} /></td></tr></tbody></table>
        {a.rationale && <div className="muted">الأساس: {String(a.rationale)}</div>}<div className="muted">أعدها {String(a.created_by_name ?? '')} {fmtDate(String(a.created_at))}{a.approved_by_name && ` | اعتمدها ${a.approved_by_name}`}</div>
        <div className="row" style={{ marginTop: 6 }}>{s === 'proposed' && can('findings.edit') && <button className="btn sec sm" onClick={() => adjStatus(String(a.id), 'under_review')}>إرسال للمراجعة</button>}{s === 'under_review' && can('adjustments.approve') && <><button className="btn ok sm" onClick={() => adjStatus(String(a.id), 'approved')}>اعتماد</button><button className="btn danger sm" onClick={() => adjStatus(String(a.id), 'rejected')}>رفض</button></>}{s === 'approved' && <span className="muted">الترحيل يتم في النظام المحاسبي للعميل ثم يُعاد استيراد الميزان المعدّل</span>}{can('data.delete') && <DangerButton text={`حذف التسوية ${a.adj_ref}؟`} onConfirm={async () => { await run(() => del(`/adjustments/${a.id}`), 'حُذفت التسوية'); reloadAdj(); }} />}</div></div>; })}</div>}
    </>}
    {open && <FindingDrawer id={open} onClose={() => { setOpen(null); setSp((s) => { s.delete('finding'); return s; }, { replace: true }); }} onChanged={reload} />}
    {adjFor && <Modal title="تسوية مقترحة" onClose={() => setAdjFor(null)} wide><AdjustmentForm eng={eng} period={period} findingId={adjFor === 'new' ? undefined : adjFor} onDone={() => { setAdjFor(null); reloadAdj(); setTab('adjustments'); }} /></Modal>}
    {manual && <Modal title="ملاحظة يدوية" onClose={() => setManual(false)}><form onSubmit={async (e) => { e.preventDefault(); const r = await run(() => post('/findings', { engagement_id: eng, period_id: period || null, ...mf, account_code: mf.account_code || null, amount: mf.amount || null, recommendation: mf.recommendation || null }), 'أُضيفت الملاحظة'); if (r) { setManual(false); reload(); } }}>
      <Field label="العنوان *"><input value={mf.title} onChange={(e) => setMf({ ...mf, title: e.target.value })} required /></Field><Field label="الوصف *"><textarea value={mf.description} onChange={(e) => setMf({ ...mf, description: e.target.value })} required /></Field>
      <div className="grid c2"><Field label="الفئة"><select value={mf.category} onChange={(e) => setMf({ ...mf, category: e.target.value })}>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><Field label="الخطورة"><select value={mf.severity} onChange={(e) => setMf({ ...mf, severity: e.target.value })}>{Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><Field label="رمز الحساب"><input value={mf.account_code} onChange={(e) => setMf({ ...mf, account_code: e.target.value })} dir="ltr" /></Field><Field label="المبلغ"><input value={mf.amount} onChange={(e) => setMf({ ...mf, amount: e.target.value })} dir="ltr" /></Field></div>
      <Field label="الإجراء الموصى به"><input value={mf.recommendation} onChange={(e) => setMf({ ...mf, recommendation: e.target.value })} /></Field><div className="row end"><button className="btn">حفظ</button></div></form></Modal>}
    <span className="sr">{user?.email}</span>
  </Page>;
}
export { put };
