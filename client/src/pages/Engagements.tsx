import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { get, post, put, del } from '../api';
import { Page, useLoad, Spinner, Empty, Modal, Field, useAction, Badge } from '../components/ui';
import { ENG_STATUS, ENG_TYPE, FRAMEWORK, fmtDate, DOC_STATUS, IMPORT_STATUS } from '../format';
import { useAuth } from '../auth';
import { DocumentUpload } from './Upload';

type Row = Record<string, string | number | null>;
const PERIOD_ROLE: Record<string, string> = { current: 'الفترة الحالية', prior: 'الفترة السابقة', budget: 'موازنة', comparative: 'مقارنة' };

export function EngagementForm({ clientId, onDone }: { clientId?: string; onDone: (id: string) => void }) {
  const { data: clients } = useLoad(() => get<{ clients: Row[] }>('/clients'), []);
  const y = new Date().getFullYear() - 1;
  const [f, setF] = useState({ client_id: clientId ?? '', title: `التحليل المالي للسنة المالية ${y}`, engagement_type: 'management_analysis', framework: 'unspecified', currency: 'SAR', description: '' });
  const [periods, setPeriods] = useState([{ label: `السنة المالية ${y - 1}`, start_date: `${y - 1}-01-01`, end_date: `${y - 1}-12-31`, period_type: 'annual', role: 'prior' }, { label: `السنة المالية ${y}`, start_date: `${y}-01-01`, end_date: `${y}-12-31`, period_type: 'annual', role: 'current' }]);
  const { run, busy } = useAction();
  useEffect(() => { if (!f.client_id && clients?.clients.length) setF((x) => ({ ...x, client_id: String(clients.clients[0].id) })); }, [clients]); // eslint-disable-line
  const submit = async (e: React.FormEvent) => { e.preventDefault(); const r = await run(() => post<{ id: string }>('/engagements', { ...f, description: f.description || null, periods }), 'تم إنشاء الارتباط'); if (r) onDone(r.id); };
  return <form onSubmit={submit}>
    <Field label="العميل *"><select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} required>{clients?.clients.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.legal_name_ar}{c.is_demo ? ' (تجريبي)' : ''}</option>)}</select></Field>
    <div className="grid c2"><Field label="عنوان الارتباط *"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
      <Field label="نوع الارتباط" hint="يحدد طبيعة التقرير ويمنع عرضه كرأي مراجع مستقل"><select value={f.engagement_type} onChange={(e) => setF({ ...f, engagement_type: e.target.value })}>{Object.entries(ENG_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="الإطار المحاسبي"><select value={f.framework} onChange={(e) => setF({ ...f, framework: e.target.value })}>{Object.entries(FRAMEWORK).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="العملة"><input value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} maxLength={3} dir="ltr" /></Field></div>
    <Field label="الوصف"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
    <h3>الفترات المالية</h3>
    <table className="t"><thead><tr><th>التسمية</th><th>من</th><th>إلى</th><th>الدور</th><th></th></tr></thead><tbody>{periods.map((p, i) => <tr key={i}>
      <td><input value={p.label} onChange={(e) => setPeriods(periods.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></td><td><input type="date" value={p.start_date} onChange={(e) => setPeriods(periods.map((x, j) => j === i ? { ...x, start_date: e.target.value } : x))} /></td><td><input type="date" value={p.end_date} onChange={(e) => setPeriods(periods.map((x, j) => j === i ? { ...x, end_date: e.target.value } : x))} /></td>
      <td><select value={p.role} onChange={(e) => setPeriods(periods.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}>{Object.entries(PERIOD_ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td><td><button type="button" className="btn sec sm" onClick={() => setPeriods(periods.filter((_, j) => j !== i))}>حذف</button></td></tr>)}</tbody></table>
    <button type="button" className="btn sec sm" onClick={() => setPeriods([...periods, { label: '', start_date: '', end_date: '', period_type: 'annual', role: 'current' }])}>+ فترة</button>
    <div className="row end" style={{ marginTop: 12 }}><button className="btn" disabled={busy}>إنشاء الارتباط</button></div></form>;
}

export function Engagements() {
  const [sp] = useSearchParams(); const [open, setOpen] = useState(sp.get('new') === '1'); const nav = useNavigate(); const { can } = useAuth();
  const { data, loading } = useLoad(() => get<{ engagements: Row[] }>('/engagements'), []);
  return <Page title="الارتباطات" sub="كل ارتباط يرتبط بعميل واحد وفتراته المالية" actions={can('clients.manage') && <button className="btn" onClick={() => setOpen(true)}>+ ارتباط جديد</button>}>
    <div className="card">{loading ? <Spinner /> : !data?.engagements.length ? <Empty text="لا توجد ارتباطات" /> : <table className="t"><thead><tr><th>الارتباط</th><th>العميل</th><th>النوع</th><th>الحالة</th><th>فترات</th><th>ملاحظات مفتوحة</th><th>آخر تحديث</th></tr></thead><tbody>
      {data.engagements.map((e) => <tr key={String(e.id)} className="clickable" onClick={() => nav(`/engagements/${e.id}`)}><td><b>{e.title}</b></td><td>{e.client_name} {e.is_demo && <span className="demo-tag">تجريبي</span>}</td><td>{ENG_TYPE[String(e.engagement_type)]}</td><td><Badge k={String(e.status)} map={ENG_STATUS} /></td><td>{e.period_count}</td><td>{e.open_findings}</td><td>{fmtDate(String(e.updated_at))}</td></tr>)}</tbody></table>}</div>
    {open && <Modal title="ارتباط جديد" onClose={() => setOpen(false)} wide><EngagementForm clientId={sp.get('client_id') ?? undefined} onDone={(id) => nav(`/engagements/${id}`)} /></Modal>}</Page>;
}

export function EngagementDetail() {
  const { id } = useParams(); const nav = useNavigate(); const { can } = useAuth(); const { run } = useAction();
  const { data, loading, reload } = useLoad(() => get<{ engagement: Row; periods: Row[]; documents: Row[]; imports: Row[]; stats: Row }>(`/engagements/${id}`), [id]);
  const { data: prog, reload: reloadProg } = useLoad(() => get<{ periods: { period: Row; tb_rows: string; je_count: string; sub_count: string; tb_validated_at: string | null; statements_at: string | null; ai_at: string | null; open_findings: string; total_findings: string; reports: string; approved_reports: string }[] }>(`/analysis/progress?engagement_id=${id}`), [id]);
  const [addPeriod, setAddPeriod] = useState(false); const [np, setNp] = useState({ label: '', start_date: '', end_date: '', period_type: 'annual', role: 'current' });
  if (loading || !data) return <Spinner />;
  const e = data.engagement; const refresh = () => { reload(); reloadProg(); };
  const setStatus = (status: string) => run(() => put(`/engagements/${id}`, { status }), 'تم تحديث الحالة').then(refresh);
  return <Page title={String(e.title)} sub={<><Link to={`/clients/${e.client_id}`}>{e.client_name}</Link> {e.is_demo && <span className="demo-tag">تجريبي</span>} | {ENG_TYPE[String(e.engagement_type)]} | {FRAMEWORK[String(e.framework)]} | {e.currency}</>}
    actions={<div className="row"><Link className="btn" to={`/engagements/${id}/letter`}>خطاب الارتباط</Link>{can('clients.manage') && <select value={String(e.status)} onChange={(ev) => setStatus(ev.target.value)}>{Object.entries(ENG_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</div>}>
    <div className="card"><h2>تقدم العمل حسب الفترة</h2>
      {prog?.periods.map((p) => { const steps = [['بيانات مستوردة', Number(p.tb_rows) > 0], ['فحص الميزان', !!p.tb_validated_at], ['القوائم والنسب', !!p.statements_at], ['مراجعة الملاحظات', Number(p.total_findings) > 0 && Number(p.open_findings) === 0], ['تقرير', Number(p.reports) > 0], ['اعتماد', Number(p.approved_reports) > 0]] as [string, boolean][]; const done = steps.filter((s) => s[1]).length;
        return <div key={String(p.period.id)} style={{ marginBottom: 12 }}><div className="row between"><b>{p.period.label} <span className="muted">({PERIOD_ROLE[String(p.period.role)]} | {fmtDate(String(p.period.start_date))} - {fmtDate(String(p.period.end_date))})</span></b><span className="muted">{p.tb_rows} سطر ميزان | {p.je_count} قيد | {p.sub_count} سجل فرعي | {p.open_findings}/{p.total_findings} ملاحظة مفتوحة</span></div>
          <div className="progress" style={{ margin: '6px 0' }}><i style={{ width: `${(done / steps.length) * 100}%` }} /></div><div className="row">{steps.map(([l, ok]) => <span key={l} className={`badge ${ok ? 'ok' : 'neutral'}`}>{ok ? '✓ ' : ''}{l}</span>)}
            <span style={{ flex: 1 }} /><Link className="btn sec sm" to={`/trial-balance?engagement_id=${id}&period_id=${p.period.id}`}>الميزان</Link><Link className="btn sec sm" to={`/analysis?engagement_id=${id}&period_id=${p.period.id}`}>التحليل</Link><Link className="btn sec sm" to={`/findings?engagement_id=${id}&period_id=${p.period.id}`}>الملاحظات</Link><Link className="btn sec sm" to={`/reports?engagement_id=${id}&period_id=${p.period.id}`}>التقارير</Link></div></div>; })}
      {can('clients.manage') && <button className="btn sec sm" onClick={() => setAddPeriod(true)}>+ إضافة فترة</button>}
    </div>
    <div className="grid c2">
      <div className="card"><h2>المستندات</h2>
        {can('documents.upload') && <DocumentUpload engagementId={String(id)} periods={data.periods} onDone={refresh} compact />}
        {data.documents.length ? <table className="t"><thead><tr><th>المستند</th><th>النوع</th><th>الفترة</th><th>الحالة</th><th>الحجم</th><th></th></tr></thead><tbody>{data.documents.map((d) => <tr key={String(d.id)}><td>{d.title ?? d.original_name}<div className="muted">{d.original_name} | {fmtDate(String(d.uploaded_at), { time: true })} | {d.uploaded_by_name}</div></td><td>{String(d.document_type)}</td><td>{data.periods.find((p) => p.id === d.period_id)?.label ?? '—'}</td><td><Badge k={String(d.status)} map={DOC_STATUS} tone={d.status === 'imported' ? 'ok' : 'neutral'} /></td><td className="num">{(Number(d.size_bytes) / 1024).toFixed(0)} KB</td>
          <td className="row">{can('imports.run') && <button className="btn sm" onClick={() => nav(`/imports?engagement_id=${id}&document_id=${d.id}`)}>استيراد</button>}<a className="btn sec sm" href={`/api/documents/${d.id}/download`}>تنزيل</a>{can('documents.delete') && d.status !== 'imported' && <button className="btn sec sm" onClick={() => confirm('حذف المستند؟') && run(() => del(`/documents/${d.id}`), 'تم الحذف').then(refresh)}>حذف</button>}</td></tr>)}</tbody></table> : <Empty text="لم تُرفع مستندات بعد" />}</div>
      <div className="card"><h2>مهام الاستيراد</h2>{data.imports.length ? <table className="t"><thead><tr><th>النوع</th><th>الفترة</th><th>الحالة</th><th>الصفوف</th><th>التاريخ</th></tr></thead><tbody>{data.imports.map((j) => <tr key={String(j.id)} className="clickable" onClick={() => nav(`/imports/${j.id}`)}><td>{String(j.data_type)}</td><td>{data.periods.find((p) => p.id === j.period_id)?.label ?? '—'}</td><td><Badge k={String(j.status)} map={IMPORT_STATUS} tone={j.status === 'committed' ? 'ok' : j.status === 'failed' ? 'danger' : 'neutral'} /></td><td>{j.row_count}</td><td>{fmtDate(String(j.created_at), { time: true })}</td></tr>)}</tbody></table> : <Empty text="لا توجد مهام استيراد" />}
        <h2>إحصاءات</h2><dl className="kv"><dt>أسطر ميزان المراجعة</dt><dd>{data.stats.tb_rows}</dd><dt>الملاحظات (مفتوحة/الكل)</dt><dd>{data.stats.findings_open}/{data.stats.findings_total}</dd><dt>التسويات المقترحة</dt><dd>{data.stats.adjustments}</dd><dt>التقارير</dt><dd>{data.stats.reports}</dd><dt>آخر فحص للميزان</dt><dd>{fmtDate(data.stats.last_validation_at as string, { time: true })}</dd></dl></div>
    </div>
    {addPeriod && <Modal title="إضافة فترة مالية" onClose={() => setAddPeriod(false)}><form onSubmit={async (ev) => { ev.preventDefault(); const r = await run(() => post(`/engagements/${id}/periods`, np), 'تمت الإضافة'); if (r) { setAddPeriod(false); refresh(); } }}>
      <Field label="التسمية"><input value={np.label} onChange={(e2) => setNp({ ...np, label: e2.target.value })} required /></Field><div className="grid c2"><Field label="من"><input type="date" value={np.start_date} onChange={(e2) => setNp({ ...np, start_date: e2.target.value })} required /></Field><Field label="إلى"><input type="date" value={np.end_date} onChange={(e2) => setNp({ ...np, end_date: e2.target.value })} required /></Field></div>
      <Field label="الدور"><select value={np.role} onChange={(e2) => setNp({ ...np, role: e2.target.value })}>{Object.entries(PERIOD_ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><div className="row end"><button className="btn">إضافة</button></div></form></Modal>}
  </Page>;
}
