import { useMemo, useRef, useState } from 'react';
import { Paperclip, Plus, Trash2 } from 'lucide-react';
import { get, post, patch, del, upload, download } from '../api';
import { useAuth } from '../auth';
import { useScope } from '../components/Scope';
import { Page, Spinner, Empty, Modal, Field, useLoad, useAction, useToast, Money, FileInput } from '../components/ui';

type Req = { id: string; ref: string; engagement_id: string; period_id: string | null; company: string; entity_role: string | null; title: string; reason: string | null; amount: string | null; priority: 'essential' | 'supporting'; status: string; source: string; obsolete: boolean; document_id: string | null; document_title: string | null; response_note: string | null; category: string };
type Data = { root_engagement_id: string; root_period_id: string; companies: { engagement_id: string; period_id: string | null; name: string; role: string }[]; requests: Req[]; stats: { total: number; essential_open: number; received: number } };
const STATUS: Record<string, string> = { pending: 'لم يُرسل', sent: 'أُرسل للعميل', received: 'وصل', not_available: 'غير متوفر لدى العميل', dismissed: 'مستبعد' };
const TONE: Record<string, string> = { pending: 'neutral', sent: 'warn', received: 'ok', not_available: 'danger', dismissed: 'neutral' };
const DOC_TYPES: [string, string][] = [['other', 'مستند داعم'], ['contract', 'عقد'], ['invoice', 'فاتورة'], ['articles_of_association', 'عقد تأسيس / نظام أساس'], ['commercial_registration', 'سجل تجاري']];

export function Requests() {
  const { eng, period, Selector, engagement } = useScope(); const { can } = useAuth(); const { run, busy } = useAction(); const { show: toast } = useToast();
  const { data, loading, reload } = useLoad(() => eng && period ? get<Data>(`/requests?engagement_id=${eng}&period_id=${period}`) : Promise.resolve(null), [eng, period]);
  const [filter, setFilter] = useState<'open' | 'all' | 'received'>('open'); const [sel, setSel] = useState<string[]>([]);
  const [edit, setEdit] = useState<Req | null>(null); const [adding, setAdding] = useState(false); const [wa, setWa] = useState<string | null>(null); const [up, setUp] = useState<Req | null>(null);
  const rows = useMemo(() => (data?.requests ?? []).filter((r) => filter === 'all' ? true : filter === 'received' ? r.status === 'received' : !r.obsolete && ['pending', 'sent', 'not_available'].includes(r.status)), [data, filter]);
  const byCo = useMemo(() => { const m = new Map<string, Req[]>(); for (const r of rows) m.set(r.company, [...(m.get(r.company) ?? []), r]); return [...m.entries()]; }, [rows]);
  const q = `engagement_id=${eng}&period_id=${period}`;
  const refresh = async (reanalyze: boolean) => { const r = await run(() => post<{ added: number; updated: number; removed: number; analyzed: number }>('/requests/refresh', { engagement_id: eng, period_id: period, reanalyze }), 'تم تحديث قائمة الطلبات'); if (r) { toast(`أُضيف ${r.added}، حُدّث ${r.updated}، أُزيل ${r.removed}${reanalyze ? ` | أعيد تحليل ${r.analyzed} شركة` : ''}`); reload(); } };
  const setStatus = async (r: Req, status: string) => { await run(() => patch(`/requests/${r.id}`, { status })); reload(); };
  const bulk = async (status: string) => { if (!sel.length) return; await run(() => patch('/requests/bulk/status', { ids: sel, status }), 'تم تحديث الحالة'); setSel([]); reload(); };
  const waText = () => {
    const open = (data?.requests ?? []).filter((r) => !r.obsolete && ['pending', 'sent'].includes(r.status)); const cos = [...new Set(open.map((r) => r.company))];
    const lines = ['السلام عليكم ورحمة الله وبركاته،', `لاستكمال تحليل وتقييم ${engagement?.client_name ?? ''}${cos.length > 1 ? ' وشركاتها' : ''}، نرجو تزويدنا بالتالي:`, ''];
    for (const co of cos) { lines.push(`*${co}*`); open.filter((r) => r.company === co).forEach((r, i) => lines.push(`${i + 1}. ${r.priority === 'essential' ? '(أساسي) ' : ''}${r.title}`)); lines.push(''); }
    lines.push('البنود «الأساسية» يتوقف عليها احتساب أرقام في التقرير. شاكرين تعاونكم.'); setWa(lines.join('\n'));
  };
  const canEdit = can('findings.edit');
  return <Page title="طلبات العميل" sub="قائمة واحدة بالمستندات والإيضاحات المطلوبة من العميل لكل شركات المجموعة، يولّدها البرنامج من التحليل والملاحظات والبيانات النظامية والتوحيد. كل طلب مرتبط برقم أو ملاحظة يحسمها، ولا تُدرج الطلبات العامة التي لا أثر لها. لا يُرسل البرنامج شيئًا بنفسه."
    actions={eng && period && <div className="row" style={{ flexWrap: 'wrap' }}>
      {can('analysis.run') && <><button className="btn" disabled={busy} onClick={() => refresh(false)}>{busy ? <Spinner /> : 'تحديث الطلبات من التحليل'}</button><button className="btn sec" disabled={busy} onClick={() => refresh(true)} title="يعيد التحليل المحلي لكل الشركات (بعد رفع مستندات جديدة) ثم يحدّث القائمة">إعادة التحليل ثم التحديث</button></>}
      <button className="btn sec" onClick={waText} disabled={!data?.requests.length}>نص للواتساب</button>
      {can('reports.export') && <><button className="btn sec" onClick={() => download(`/requests/export.xlsx?${q}`, `طلبات ${engagement?.client_name ?? ''}.xlsx`)} disabled={!data?.requests.length}>Excel</button><button className="btn sec" onClick={() => window.open(`/api/requests/print?${q}`, '_blank')} disabled={!data?.requests.length}>طباعة / PDF</button></>}
      {canEdit && <button className="btn sec" onClick={() => setAdding(true)}><Plus size={15} /> طلب يدوي</button>}</div>}>
    <Selector />
    {!eng || !period ? <Empty text="اختر الارتباط والفترة" /> : loading ? <Spinner /> : !data ? null : <>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="badge neutral">الطلبات القائمة: {data.stats.total}</span><span className="badge danger">أساسية مفتوحة: {data.stats.essential_open}</span><span className="badge ok">وصل: {data.stats.received}</span>
        <div className="tabs" style={{ marginInlineStart: 'auto', marginBottom: 0 }}>{([['open', 'المفتوحة'], ['received', 'الواردة'], ['all', 'الكل']] as const).map(([k, l]) => <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
      </div>
      {!data.requests.length && <div className="card"><Empty text="لا توجد طلبات بعد" /><p className="muted" style={{ textAlign: 'center' }}>اضغط «تحديث الطلبات من التحليل» بعد اعتماد الموازين وتشغيل التحليل والتوحيد.</p></div>}
      {sel.length > 0 && canEdit && <div className="card tight row"><b>{sel.length} محدد</b><button className="btn sec" onClick={() => bulk('sent')}>تعليمها: أُرسلت للعميل</button><button className="btn sec" onClick={() => bulk('pending')}>إرجاعها: لم تُرسل</button><button className="btn sec" onClick={() => setSel([])}>إلغاء التحديد</button></div>}
      {byCo.map(([co, rs]) => <div className="card" key={co}><h2>{co} <span className="muted" style={{ fontSize: 13 }}>({rs.length})</span></h2>
        <div className="tscroll" style={{ maxHeight: 'none' }}><table className="t ruled"><thead><tr><th style={{ width: 28 }}><input type="checkbox" style={{ width: 'auto' }} checked={rs.every((r) => sel.includes(r.id))} onChange={(e) => setSel((s) => e.target.checked ? [...new Set([...s, ...rs.map((r) => r.id)])] : s.filter((x) => !rs.some((r) => r.id === x)))} /></th><th style={{ width: '6%' }}>المرجع</th><th style={{ width: '6%' }}>الأولوية</th><th style={{ width: '42%' }}>المطلوب وسببه</th><th style={{ width: '10%' }}>المبلغ المرتبط</th><th style={{ width: '15%' }}>الحالة</th><th style={{ width: '12%' }}>المستند / رد العميل</th><th style={{ width: '9%' }}></th></tr></thead>
          <tbody>{rs.map((r) => <tr key={r.id} style={{ opacity: r.obsolete || r.status === 'dismissed' ? 0.55 : 1 }}>
            <td><input type="checkbox" style={{ width: 'auto' }} checked={sel.includes(r.id)} onChange={(e) => setSel((s) => e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id))} /></td>
            <td className="mono">{r.ref}</td><td><span className={`badge ${r.priority === 'essential' ? 'danger' : 'neutral'}`}>{r.priority === 'essential' ? 'أساسي' : 'داعم'}</span></td>
            <td className="wrap"><div><b>{r.title}</b></div>{r.reason && <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{r.reason}</div>}{r.obsolete && <div className="muted" style={{ fontSize: 12 }}>لم يعد لازمًا حسب آخر تحليل</div>}{r.source === 'manual' && <div className="muted" style={{ fontSize: 11.5 }}>يدوي/معدّل</div>}</td>
            <td className="num">{r.amount ? <Money v={r.amount} /> : '—'}</td>
            <td>{canEdit ? <select value={r.status} onChange={(e) => setStatus(r, e.target.value)}>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> : <span className={`badge ${TONE[r.status]}`}>{STATUS[r.status]}</span>}</td>
            <td className="wrap">{r.document_id ? <span className="badge ok" title={r.document_title ?? ''}><Paperclip size={13} /> {(r.document_title ?? 'مستند').slice(0, 28)}</span> : can('documents.upload') && r.period_id ? <button className="btn sec sm" onClick={() => setUp(r)}>رفع المستند</button> : null}{r.response_note && <div className="muted" style={{ fontSize: 12 }}>{r.response_note}</div>}</td>
            <td>{canEdit && <div className="row" style={{ gap: 4 }}><button className="btn sec sm" onClick={() => setEdit(r)}>تعديل</button><button className="btn sec sm" title={r.source === 'auto' ? 'استبعاد (لن يعود عند التحديث)' : 'حذف'} onClick={async () => { await run(() => del(`/requests/${r.id}`)); reload(); }}><Trash2 size={15} /></button></div>}</td>
          </tr>)}</tbody></table></div></div>)}
    </>}
    {wa != null && <Modal title="نص الطلبات للواتساب (للنسخ والإرسال منك)" onClose={() => setWa(null)} wide><textarea readOnly value={wa} style={{ width: '100%', minHeight: 360, fontFamily: 'inherit' }} /><div className="row end"><button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(wa); toast('نُسخ النص'); } catch { toast('تعذر النسخ تلقائيًا؛ انسخه يدويًا'); } }}>نسخ النص</button></div><p className="muted">بعد الإرسال حدّد الطلبات وعلّمها «أُرسلت للعميل».</p></Modal>}
    {edit && <EditModal r={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    {adding && data && <AddModal companies={data.companies} period={period} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    {up && <UploadModal r={up} onClose={() => setUp(null)} onDone={() => { setUp(null); reload(); }} />}
  </Page>;
}

function EditModal({ r, onClose, onSaved }: { r: Req; onClose: () => void; onSaved: () => void }) {
  const { run, busy } = useAction(); const [f, setF] = useState({ title: r.title, reason: r.reason ?? '', priority: r.priority, response_note: r.response_note ?? '' });
  return <Modal title={`تعديل الطلب ${r.ref}`} onClose={onClose}>
    <Field label="المطلوب"><textarea value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} rows={3} /></Field>
    <Field label="السبب"><textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={3} /></Field>
    <Field label="الأولوية"><select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Req['priority'] })}><option value="essential">أساسي</option><option value="supporting">داعم</option></select></Field>
    <Field label="رد العميل / ملاحظة"><textarea value={f.response_note} onChange={(e) => setF({ ...f, response_note: e.target.value })} rows={2} /></Field>
    <p className="muted">تعديل النص يجعل الطلب يدويًا فلا يُستبدل عند تحديث القائمة.</p>
    <div className="row end"><button className="btn sec" onClick={onClose}>إلغاء</button><button className="btn" disabled={busy} onClick={async () => { const changed = f.title !== r.title || f.reason !== (r.reason ?? ''); const ok = await run(() => patch(`/requests/${r.id}`, { ...(changed ? { title: f.title, reason: f.reason || null } : {}), priority: f.priority, response_note: f.response_note || null }), 'تم الحفظ'); if (ok !== undefined) onSaved(); }}>حفظ</button></div>
  </Modal>;
}

function AddModal({ companies, period, onClose, onSaved }: { companies: Data['companies']; period: string; onClose: () => void; onSaved: () => void }) {
  const { run, busy } = useAction(); const withP = companies.filter((c) => c.period_id);
  const [f, setF] = useState({ engagement_id: withP[0]?.engagement_id ?? '', title: '', reason: '', priority: 'essential' });
  const co = companies.find((c) => c.engagement_id === f.engagement_id);
  return <Modal title="طلب يدوي" onClose={onClose}>
    <Field label="الشركة"><select value={f.engagement_id} onChange={(e) => setF({ ...f, engagement_id: e.target.value })}>{withP.map((c) => <option key={c.engagement_id} value={c.engagement_id}>{c.name}</option>)}</select></Field>
    <Field label="المطلوب"><textarea value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} rows={3} /></Field>
    <Field label="السبب (اختياري)"><textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={2} /></Field>
    <Field label="الأولوية"><select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="essential">أساسي</option><option value="supporting">داعم</option></select></Field>
    <div className="row end"><button className="btn sec" onClick={onClose}>إلغاء</button><button className="btn" disabled={busy || f.title.trim().length < 3 || !co?.period_id} onClick={async () => { const ok = await run(() => post('/requests', { engagement_id: f.engagement_id, period_id: co?.period_id ?? period, title: f.title.trim(), reason: f.reason.trim() || null, priority: f.priority }), 'أُضيف الطلب'); if (ok !== undefined) onSaved(); }}>إضافة</button></div>
  </Modal>;
}

function UploadModal({ r, onClose, onDone }: { r: Req; onClose: () => void; onDone: () => void }) {
  const { run, busy } = useAction(); const ref = useRef<HTMLInputElement>(null); const [type, setType] = useState('other');
  const go = async () => { const file = ref.current?.files?.[0]; if (!file) return; const fd = new FormData(); fd.append('engagement_id', r.engagement_id); if (r.period_id) fd.append('period_id', r.period_id); fd.append('document_type', type); fd.append('title', `${r.ref} - ${file.name}`.slice(0, 300)); fd.append('files', file);
    const res = await run(() => upload<{ documents: { id: string }[] }>('/documents/upload', fd)); const id = res?.documents?.[0]?.id; if (!id) return;
    const ok = await run(() => patch(`/requests/${r.id}`, { document_id: id }), 'رُفع المستند وعُلّم الطلب «وصل»'); if (ok !== undefined) onDone(); };
  return <Modal title={`رفع مستند للطلب ${r.ref}`} onClose={onClose}>
    <p><b>{r.company}</b>: {r.title}</p>
    <Field label="نوع المستند"><select value={type} onChange={(e) => setType(e.target.value)}>{DOC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
    <Field label="الملف"><FileInput inputRef={ref} /></Field>
    <p className="muted">ميزان المراجعة يُرفع من «رفع المستندات» ثم «الاستيراد والتحقق»، والعقود والسجلات تُستخرج بياناتها من «البيانات النظامية». بعد رفع المستندات اضغط «إعادة التحليل ثم التحديث».</p>
    <div className="row end"><button className="btn sec" onClick={onClose}>إلغاء</button><button className="btn" disabled={busy} onClick={go}>{busy ? <Spinner /> : 'رفع وربط'}</button></div>
  </Modal>;
}
