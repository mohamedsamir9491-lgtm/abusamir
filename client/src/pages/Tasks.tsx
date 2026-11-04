import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Check, RotateCcw, Trash2, Sparkles } from 'lucide-react';
import { get, post, patch, del } from '../api';
import { Page, Spinner, Empty, Modal, Field, useLoad, useAction } from '../components/ui';
import { fmtDate } from '../format';

type Task = { id: string; title: string; kind: string; priority: string; status: string; due_date: string | null; client_name: string | null; client_id: string | null; engagement_id: string | null; notes: string | null };
type Auto = { kind: string; title: string; date: string; client: string; engagement_id: string | null; tone: string };
const KIND: Record<string, string> = { delivery: 'تسليم', followup: 'متابعة', meeting: 'اجتماع', payment: 'تحصيل', document: 'مستندات', other: 'أخرى' };
const PRI: Record<string, [string, string]> = { high: ['عالية', 'danger'], normal: ['عادية', 'neutral'], low: ['منخفضة', 'neutral'] };
const today = () => new Date().toISOString().slice(0, 10);
const bucket = (d: string | null) => { if (!d) return 'بلا موعد'; const t = today(); if (d < t) return 'متأخرة'; if (d === t) return 'اليوم'; const w = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10); return d <= w ? 'هذا الأسبوع' : 'لاحقًا'; };
const ORDER = ['متأخرة', 'اليوم', 'هذا الأسبوع', 'لاحقًا', 'بلا موعد'];

export function Tasks() {
  const { run } = useAction(); const [status, setStatus] = useState('open'); const [add, setAdd] = useState(false);
  const { data, loading, reload } = useLoad(() => get<{ tasks: Task[]; auto: Auto[] }>(`/practice/tasks?status=${status}`), [status]);
  const items = [...(data?.tasks ?? []).map((t) => ({ ...t, auto: false, date: t.due_date })), ...(data?.auto ?? []).map((a, i) => ({ id: `a${i}`, title: a.title, kind: a.kind, priority: a.tone === 'danger' ? 'high' : 'normal', status: 'open', date: a.date, client_name: a.client, engagement_id: a.engagement_id, auto: true, client_id: null, notes: null, due_date: a.date }))];
  const groups = ORDER.map((g) => [g, items.filter((i) => bucket(i.date) === g)] as const).filter(([, l]) => l.length);
  return <Page title="المهام والمواعيد" sub="مهامك اليدوية مع المواعيد التي يولّدها البرنامج تلقائيًا: استحقاق المطالبات، وانتهاء صلاحية العروض غير الموقعة، ومواعيد تسليم الارتباطات."
    actions={<><div className="segtabs" style={{ margin: 0, border: 0 }}>{([['open', 'المفتوحة'], ['done', 'المنجزة']] as const).map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div><button className="btn" onClick={() => setAdd(true)}><Plus size={15} /> مهمة</button></>}>
    {loading || !data ? <Spinner /> : !items.length ? <div className="card"><Empty text="لا مهام" /></div> : groups.map(([g, list]) => <div key={g} className="card"><div className="ch"><span>{g}</span><span className="badge neutral">{list.length}</span></div>
      {list.map((t) => <div key={t.id} className="dl" style={{ marginBottom: 8 }}><div className="dd">{t.date ? <><b>{new Date(t.date + 'T12:00:00').getDate()}</b><small>{fmtDate(t.date).split('/').slice(1).join('/')}</small></> : <small>—</small>}</div>
        <div className="dt"><b>{t.title}</b><small>{KIND[t.kind] ?? t.kind}{t.client_name ? ` | ${t.client_name}` : ''}{t.auto ? ' | تلقائي' : ''}</small></div>
        {t.auto ? <span className="badge info"><Sparkles size={12} /> من البرنامج</span> : <span className={`badge ${PRI[t.priority]?.[1]}`}>{PRI[t.priority]?.[0]}</span>}
        {t.engagement_id && <Link className="btn sec sm" to={`/engagements/${t.engagement_id}`}>فتح</Link>}
        {!t.auto && <><button className="iconbtn sm" title={t.status === 'open' ? 'تم' : 'إعادة فتح'} onClick={async () => { await run(() => patch(`/practice/tasks/${t.id}`, { status: t.status === 'open' ? 'done' : 'open' })); reload(); }}>{t.status === 'open' ? <Check size={15} /> : <RotateCcw size={15} />}</button>
          <button className="iconbtn sm" title="حذف" onClick={async () => { if (confirm('حذف المهمة؟')) { await run(() => del(`/practice/tasks/${t.id}`)); reload(); } }}><Trash2 size={15} /></button></>}</div>)}</div>)}
    {add && <TaskModal onClose={() => setAdd(false)} onDone={() => { setAdd(false); reload(); }} />}
  </Page>;
}

export function TaskModal({ clientId, engagementId, onClose, onDone }: { clientId?: string; engagementId?: string; onClose: () => void; onDone: () => void }) {
  const { run, busy } = useAction(); const [f, setF] = useState({ title: '', kind: 'followup', priority: 'normal', due_date: '', notes: '' });
  return <Modal title="مهمة جديدة" onClose={onClose}><Field label="المهمة"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></Field>
    <div className="grid c3"><Field label="النوع"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><Field label="الأولوية"><select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(PRI).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select></Field><Field label="الموعد"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field></div>
    <Field label="ملاحظات"><textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} /></Field>
    <div className="row end"><button className="btn sec" onClick={onClose}>إلغاء</button><button className="btn" disabled={busy || f.title.trim().length < 2} onClick={async () => { const r = await run(() => post('/practice/tasks', { ...f, due_date: f.due_date || null, notes: f.notes || null, client_id: clientId ?? null, engagement_id: engagementId ?? null }), 'أُضيفت المهمة'); if (r) onDone(); }}>إضافة</button></div></Modal>;
}
