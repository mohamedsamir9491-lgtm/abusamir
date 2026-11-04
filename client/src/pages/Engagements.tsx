import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { get, post, put, del } from '../api';
import { Page, useLoad, Spinner, Empty, Modal, Field, useAction, Badge, DangerButton, Stepper } from '../components/ui';
import { ClipboardList, FilePenLine, Plus } from 'lucide-react';
import { Icon } from '../components/nav';
import { ENG_STATUS, ENG_TYPE, FRAMEWORK, fmtDate, DOC_STATUS, IMPORT_STATUS, DATA_TYPE, OFFICIAL_TYPES } from '../format';
import { useAuth } from '../auth';
import { DocumentUpload } from './Upload';
import { GroupCompaniesCard, ComponentBanner, useGroupTargets } from './Group';
import { fiscalYear, fiscalYearOf, isFullYear, periodLabel, periodType, periodErrors, periodWarnings, shiftYears, addDays, fmt } from '../periods';

type Row = Record<string, string | number | null>;
const PERIOD_ROLE: Record<string, string> = { current: 'الفترة الحالية', prior: 'الفترة السابقة', budget: 'موازنة', comparative: 'مقارنة' };

type PRow = { label: string; start_date: string; end_date: string; period_type: string; role: string };
type Mode = 'full' | 'ytd' | 'custom'; type Compare = 'full_prior' | 'same_prior' | 'none';
/** يبني فترات الارتباط من نوع الفترة والسنة ونهاية السنة المالية للعميل */
function buildPeriods(mode: Mode, year: number, asOf: string, compare: Compare, m: number, d: number): PRow[] {
  const fy = fiscalYear(year, m, d);
  const cur = mode === 'ytd' ? { start: fy.start, end: asOf < fy.start ? fy.start : asOf > fy.end ? fy.end : asOf } : fy;
  const rows: PRow[] = [];
  if (compare !== 'none') {
    const pr = compare === 'full_prior' || isFullYear(cur.start, cur.end) ? fiscalYear(year - 1, m, d) : { start: shiftYears(cur.start, -1), end: shiftYears(cur.end, -1) };
    rows.push({ label: periodLabel(pr.start, pr.end), start_date: pr.start, end_date: pr.end, period_type: periodType(pr.start, pr.end), role: 'prior' });
  }
  rows.push({ label: periodLabel(cur.start, cur.end), start_date: cur.start, end_date: cur.end, period_type: periodType(cur.start, cur.end), role: 'current' });
  return rows;
}

export function EngagementForm({ clientId, onDone }: { clientId?: string; onDone: (id: string) => void }) {
  const { data: clients } = useLoad(() => get<{ clients: Row[] }>('/clients'), []);
  const { data: fyInfo } = useLoad(() => get<{ year: number; auto: boolean; today: string }>('/office/fiscal-year'), []);
  const [f, setF] = useState({ client_id: clientId ?? '', title: '', engagement_type: 'management_analysis', framework: 'unspecified', currency: 'SAR', description: '' });
  const [titleTouched, setTitleTouched] = useState(false);
  const [mode, setMode] = useState<Mode>('full'); const [year, setYear] = useState<number>(0); const [asOf, setAsOf] = useState(''); const [compare, setCompare] = useState<Compare>('full_prior');
  const [periods, setPeriods] = useState<PRow[]>([]);
  const { run, busy } = useAction();
  const client = clients?.clients.find((c) => String(c.id) === f.client_id);
  const fyM = Number(client?.fiscal_year_end_month ?? 12), fyD = Number(client?.fiscal_year_end_day ?? 31);
  useEffect(() => { if (!f.client_id && clients?.clients.length) setF((x) => ({ ...x, client_id: String(clients.clients[0].id) })); }, [clients]); // eslint-disable-line
  // السنة المالية الافتراضية = السنة الحالية للمكتب (تلقائية من تاريخ اليوم)، و«حتى تاريخ» = اليوم
  useEffect(() => { if (fyInfo && !year) { setYear(fyInfo.year); setAsOf(fyInfo.today); } }, [fyInfo]); // eslint-disable-line
  // عملة وإطار العميل افتراضيًا
  useEffect(() => { if (client) setF((x) => ({ ...x, currency: String(client.reporting_currency ?? x.currency), framework: String(client.accounting_framework ?? x.framework) })); }, [f.client_id, clients]); // eslint-disable-line
  // الفترات تُحسب تلقائيًا ما لم يخترها المستخدم يدويًا
  useEffect(() => { if (year && mode !== 'custom') setPeriods(buildPeriods(mode, year, asOf || `${year}-12-31`, compare, fyM, fyD)); }, [mode, year, asOf, compare, fyM, fyD]);
  const current = periods.find((p) => p.role === 'current');
  useEffect(() => { if (!titleTouched && client && current) setF((x) => ({ ...x, title: `${ENG_TYPE[x.engagement_type] ?? ''} – ${client.legal_name_ar} – ${current.label}` })); }, [titleTouched, f.client_id, f.engagement_type, current?.label]); // eslint-disable-line
  const editRow = (i: number, patch: Partial<PRow>) => { setMode('custom'); setPeriods(periods.map((x, j) => { if (j !== i) return x; const n = { ...x, ...patch }; if ((patch.start_date || patch.end_date) && x.label === periodLabel(x.start_date, x.end_date) && n.start_date && n.end_date) n.label = periodLabel(n.start_date, n.end_date); if (n.start_date && n.end_date) n.period_type = periodType(n.start_date, n.end_date); return n; })); };
  const errors = periodErrors(periods); const warnings = periodWarnings(periods, fyInfo?.today);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); if (errors.length) return; const r = await run(() => post<{ id: string }>('/engagements', { ...f, description: f.description || null, periods }), 'تم إنشاء الارتباط'); if (r) onDone(r.id); };
  return <form onSubmit={submit}>
    <Field label="العميل *"><select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} required>{clients?.clients.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.legal_name_ar}{c.is_demo ? ' (تجريبي)' : ''}</option>)}</select></Field>
    <div className="grid c2"><Field label="عنوان الارتباط *" hint={titleTouched ? 'عدّلته يدويًا؛ لن يتغير تلقائيًا' : 'يُكتب تلقائيًا من النوع والعميل والفترة'}><input value={f.title} onChange={(e) => { setTitleTouched(true); setF({ ...f, title: e.target.value }); }} required /></Field>
      <Field label="نوع الارتباط" hint="يحدد طبيعة التقرير ويمنع عرضه كرأي مراجع مستقل"><select value={f.engagement_type} onChange={(e) => setF({ ...f, engagement_type: e.target.value })}>{Object.entries(ENG_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="الإطار المحاسبي"><select value={f.framework} onChange={(e) => setF({ ...f, framework: e.target.value })}>{Object.entries(FRAMEWORK).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="العملة"><input value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} maxLength={3} dir="ltr" /></Field></div>
    <Field label="الوصف"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
    <h3>الفترات المالية</h3>
    <p className="muted">نهاية السنة المالية للعميل: <b>{fyD}/{fyM}</b> | السنة المالية الحالية للمكتب: <b>{fyInfo?.year ?? '…'}</b>{fyInfo?.auto ? ' (تلقائية من تاريخ اليوم)' : ' (مضبوطة يدويًا)'}</p>
    <div className="grid c4">
      <Field label="نوع الفترة"><select value={mode} onChange={(e) => setMode(e.target.value as Mode)}><option value="full">سنة مالية كاملة</option><option value="ytd">من بداية السنة حتى تاريخ</option><option value="custom">فترة مخصصة (تعديل يدوي)</option></select></Field>
      <Field label="السنة المالية" hint={year ? `${fmt(fiscalYear(year, fyM, fyD).start)} – ${fmt(fiscalYear(year, fyM, fyD).end)}` : undefined}><input type="number" min={2000} max={2100} value={year || ''} onChange={(e) => { const y = Number(e.target.value); setYear(y); if (mode === 'custom') setMode('full'); }} disabled={mode === 'custom'} dir="ltr" /></Field>
      {mode === 'ytd' && <Field label="حتى تاريخ"><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>}
      <Field label="المقارنة"><select value={compare} onChange={(e) => setCompare(e.target.value as Compare)} disabled={mode === 'custom'}><option value="full_prior">السنة السابقة كاملة</option><option value="same_prior">نفس المدة من السنة السابقة</option><option value="none">بدون فترة مقارنة</option></select></Field>
    </div>
    <table className="t"><thead><tr><th>التسمية</th><th>من</th><th>إلى</th><th>النوع</th><th>الدور</th><th></th></tr></thead><tbody>{periods.map((p, i) => <tr key={i}>
      <td><input value={p.label} onChange={(e) => editRow(i, { label: e.target.value })} /></td><td><input type="date" value={p.start_date} onChange={(e) => editRow(i, { start_date: e.target.value })} /></td><td><input type="date" value={p.end_date} onChange={(e) => editRow(i, { end_date: e.target.value })} /></td>
      <td>{p.start_date && p.end_date ? (isFullYear(p.start_date, p.end_date) ? 'سنة كاملة' : 'فترة جزئية') : '—'}</td>
      <td><select value={p.role} onChange={(e) => editRow(i, { role: e.target.value })}>{Object.entries(PERIOD_ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td><td><button type="button" className="btn sec sm" onClick={() => { setMode('custom'); setPeriods(periods.filter((_, j) => j !== i)); }}>حذف</button></td></tr>)}</tbody></table>
    <button type="button" className="btn sec sm" onClick={() => { setMode('custom'); setPeriods([...periods, { label: '', start_date: '', end_date: '', period_type: 'annual', role: 'comparative' }]); }}><Plus size={15} /> فترة</button>
    {errors.map((x) => <div key={x} className="alert danger">{x}</div>)}
    {warnings.map((x) => <div key={x} className="alert warn">{x}</div>)}
    <div className="row end" style={{ marginTop: 12 }}><button className="btn" disabled={busy || errors.length > 0 || !periods.length}>إنشاء الارتباط</button></div></form>;
}

export function Engagements() {
  const [sp] = useSearchParams(); const [open, setOpen] = useState(sp.get('new') === '1'); const nav = useNavigate(); const { can } = useAuth(); const { run: runL } = useAction();
  const { data, loading, reload } = useLoad(() => get<{ engagements: Row[] }>('/engagements'), []);
  return <Page title="الارتباطات" sub="كل ارتباط يرتبط بعميل واحد وفتراته المالية" actions={can('clients.manage') && <button className="btn" onClick={() => setOpen(true)}><Plus size={15} /> ارتباط جديد</button>}>
    <div className="card">{loading ? <Spinner /> : !data?.engagements.length ? <Empty text="لا توجد ارتباطات" /> : <table className="t"><thead><tr><th>الارتباط</th><th>العميل</th><th>النوع</th><th>الحالة</th><th>فترات</th><th>ملاحظات مفتوحة</th><th>آخر تحديث</th></tr></thead><tbody>
      {data.engagements.filter((e) => !e.group_engagement_id).map((e) => <tr key={String(e.id)} className="clickable" onClick={() => nav(`/engagements/${e.id}`)}><td><b>{e.title}</b>{Number(e.component_count) > 0 && <div className="muted">مجموعة: {Number(e.component_count) + 1} شركات (الأم + {e.component_count})</div>}</td><td>{e.client_name} {e.is_demo && <span className="demo-tag">تجريبي</span>}</td><td>{ENG_TYPE[String(e.engagement_type)]}</td><td><Badge k={String(e.status)} map={ENG_STATUS} /></td><td>{e.period_count}</td><td>{e.open_findings}</td><td>{fmtDate(String(e.updated_at))}</td>{can('data.delete') && <td onClick={(ev) => ev.stopPropagation()}><DangerButton text={`حذف الارتباط "${e.title}" بكل فتراته ومستنداته وموازينه وملاحظاته وتقاريره؟ لا يمكن التراجع.`} onConfirm={async () => { await runL(() => del(`/engagements/${e.id}`), 'حُذف الارتباط'); reload(); }} /></td>}</tr>)}</tbody></table>}</div>
    {open && <Modal title="ارتباط جديد" onClose={() => setOpen(false)} wide><EngagementForm clientId={sp.get('client_id') ?? undefined} onDone={(id) => nav(`/engagements/${id}`)} /></Modal>}</Page>;
}

export function EngagementDetail() {
  const { id } = useParams(); const nav = useNavigate(); const { can } = useAuth(); const { run } = useAction();
  const { data, loading, reload } = useLoad(() => get<{ engagement: Row; periods: Row[]; documents: Row[]; imports: Row[]; stats: Row }>(`/engagements/${id}`), [id]);
  const { data: prog, reload: reloadProg } = useLoad(() => get<{ periods: { period: Row; tb_rows: string; je_count: string; sub_count: string; tb_validated_at: string | null; statements_at: string | null; ai_at: string | null; open_findings: string; total_findings: string; reports: string; approved_reports: string; comparison: { label: string; engagement_id: string; engagement_title: string; same_engagement: boolean; length_mismatch: boolean } | null }[] }>(`/analysis/progress?engagement_id=${id}`), [id]);
  const [nextYear, setNextYear] = useState<{ title: string; start_date: string; end_date: string; comparison: { label: string; has_tb: boolean } } | null>(null);
  const [addPeriod, setAddPeriod] = useState(false); const [np, setNp] = useState({ label: '', start_date: '', end_date: '', period_type: 'annual', role: 'current' });
  const { data: fyInfo } = useLoad(() => get<{ year: number; today: string }>('/office/fiscal-year'), []);
  const [groupVer, setGroupVer] = useState(0); const targets = useGroupTargets(data?.engagement ?? null, data?.periods ?? [], groupVer); const [uploadTo, setUploadTo] = useState('');
  if (loading || !data) return <Spinner />;
  const e = data.engagement; const refresh = () => { reload(); reloadProg(); };
  const setStatus = (status: string) => run(() => put(`/engagements/${id}`, { status }), 'تم تحديث الحالة').then(refresh);
  return <Page title={ENG_TYPE[String(e.engagement_type)] ?? String(e.title)} sub={<><Link to={`/clients/${e.client_id}`}>{e.client_name}</Link> {e.is_demo && <span className="demo-tag">تجريبي</span>} | {FRAMEWORK[String(e.framework)]} | {e.currency}{e.rolled_from_engagement_id && <> | مُرحّل من: <Link to={`/engagements/${e.rolled_from_engagement_id}`}>{e.rolled_from_title}</Link></>}</>}
    actions={<>{can('clients.manage') && <label className="status-select">الحالة<select value={String(e.status)} onChange={(ev) => setStatus(ev.target.value)}>{Object.entries(ENG_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
      <Link className="btn sec" to={`/requests?engagement_id=${id}${data.periods[0] ? `&period_id=${(data.periods.find((p) => p.role === 'current') ?? data.periods[data.periods.length - 1]).id}` : ''}`}><ClipboardList size={16} /> طلبات العميل</Link>
      <Link className="btn" to={`/engagements/${e.group_engagement_id ?? id}/letter`}><FilePenLine size={16} /> {e.group_engagement_id ? 'خطاب ارتباط المجموعة' : 'خطاب الارتباط'}</Link>
      {can('data.delete') && <DangerButton small={false} label="حذف" text={`حذف الارتباط "${e.title}" بكل بياناته؟ لا يمكن التراجع.`} onConfirm={async () => { await run(() => del(`/engagements/${id}`), 'حُذف الارتباط'); nav('/engagements'); }} />}</>}>
    <ComponentBanner engagement={e} />
    <div className="card"><h2>تقدم العمل حسب الفترة</h2>
      {prog?.periods.map((p) => { const steps = [['بيانات مستوردة', Number(p.tb_rows) > 0], ['فحص الميزان', !!p.tb_validated_at], ['القوائم والنسب', !!p.statements_at], ['مراجعة الملاحظات', Number(p.total_findings) > 0 && Number(p.open_findings) === 0], ['تقرير', Number(p.reports) > 0], ['اعتماد', Number(p.approved_reports) > 0]] as [string, boolean][]; const done = steps.filter((s) => s[1]).length;
        return <div key={String(p.period.id)} className="period-block"><div className="row between"><b>{p.period.label} <span className="muted">({PERIOD_ROLE[String(p.period.role)]}{p.period.start_date && !String(p.period.label).includes(fmtDate(String(p.period.start_date)).split('/').map((x) => x.padStart(2, '0')).join('/')) ? ` | ${fmtDate(String(p.period.start_date))} - ${fmtDate(String(p.period.end_date))}` : ''})</span></b><span className="meta"><span>{p.tb_rows} حساب في الميزان</span>{Number(p.je_count) > 0 && <span>{p.je_count} قيد</span>}{Number(p.sub_count) > 0 && <span>{p.sub_count} سجل فرعي</span>}<span>{p.open_findings} ملاحظة مفتوحة من {p.total_findings}</span></span></div>
          <div className="muted" style={{ fontSize: 12.5 }}>{p.comparison ? <>المقارنة مع: <b>{p.comparison.label}</b>{!p.comparison.same_engagement && <> (من ارتباط <Link to={`/engagements/${p.comparison.engagement_id}`}>{p.comparison.engagement_title}</Link>)</>}{p.comparison.length_mismatch && <span className="badge warn" style={{ marginInlineStart: 6 }}>مدة فترة المقارنة تختلف عن الفترة الحالية (سنة كاملة مقابل فترة جزئية)؛ فسّر المقارنات بحذر</span>}</> : 'لا توجد فترة مقارنة بميزان معتمد لهذا العميل'}</div>
          <Stepper items={steps.map(([label, ok]) => ({ label, done: ok }))} /><div className="row end" style={{ marginTop: 8 }}><span className="muted" style={{ marginInlineEnd: 'auto' }}>اكتمل {done} من {steps.length}</span>
            <Link className="btn sec sm" to={`/trial-balance?engagement_id=${id}&period_id=${p.period.id}`}><Icon n="table" size={15} /> الميزان</Link><Link className="btn sec sm" to={`/analysis?engagement_id=${id}&period_id=${p.period.id}`}><Icon n="chart" size={15} /> التحليل</Link><Link className="btn sec sm" to={`/findings?engagement_id=${id}&period_id=${p.period.id}`}><Icon n="flag" size={15} /> الملاحظات</Link><Link className="btn sec sm" to={`/valuation?engagement_id=${id}&period_id=${p.period.id}`}><Icon n="valuation" size={15} /> التقييم</Link><Link className="btn sec sm" to={`/reports?engagement_id=${id}&period_id=${p.period.id}`}><Icon n="file" size={15} /> التقارير</Link></div></div>; })}
      {can('clients.manage') && <div className="row" style={{ marginTop: 10 }}><button className="btn sec sm" onClick={() => { setNp(suggestPeriod(data.periods, Number(e.fiscal_year_end_month ?? 12), Number(e.fiscal_year_end_day ?? 31), fyInfo?.year ?? new Date().getFullYear())); setAddPeriod(true); }}><Plus size={15} /> إضافة فترة</button>
        {!e.group_engagement_id && <button className="btn sec sm" onClick={async () => { const r = await run(() => get<{ title: string; period: { start_date: string; end_date: string }; comparison: { label: string; has_tb: boolean } }>(`/engagements/${id}/next-year`)); if (r) setNextYear({ title: r.title, ...r.period, comparison: r.comparison }); }}>إنشاء ارتباط السنة التالية</button>}</div>}
    </div>
    {!e.group_engagement_id && <GroupCompaniesCard engagement={e} periods={data.periods} onChanged={() => { refresh(); setGroupVer((v) => v + 1); }} />}
    <div className="grid">
      <div className="card"><h2>المستندات</h2>
        {can('documents.upload') && <>{targets.length > 0 && <Field label="رفع المستند لشركة" hint="ميزان كل شركة يُرفع على شركته؛ لا تخلط موازين الشركات في شركة واحدة"><select value={uploadTo || String(id)} onChange={(ev) => setUploadTo(ev.target.value)}>{targets.map((t) => <option key={t.id} value={t.id}>{t.name}{t.id === id ? ' (هذه الصفحة)' : ''}</option>)}</select></Field>}
          {(() => { const t = targets.find((x) => x.id === (uploadTo || id)); return <DocumentUpload key={t?.id ?? String(id)} engagementId={t?.id ?? String(id)} periods={(t?.periods ?? data.periods) as Row[]} onDone={() => { refresh(); if (t && t.id !== id) alert(`رُفع المستند على «${t.name}». افتح الشركة لاستيراده.`); }} compact />; })()}</>}
        {data.documents.length ? <table className="t"><thead><tr><th>المستند</th><th>النوع</th><th>الفترة</th><th>الحالة</th><th>الحجم</th><th></th></tr></thead><tbody>{data.documents.map((d) => <tr key={String(d.id)}><td>{d.title ?? d.original_name}<div className="muted">{d.original_name} | {fmtDate(String(d.uploaded_at), { time: true })} | {d.uploaded_by_name}</div></td><td>{DATA_TYPE[String(d.document_type)] ?? String(d.document_type)}</td><td>{data.periods.find((p) => p.id === d.period_id)?.label ?? '—'}</td><td><Badge k={String(d.status)} map={DOC_STATUS} tone={d.status === 'imported' ? 'ok' : 'neutral'} /></td><td className="num">{(Number(d.size_bytes) / 1024).toFixed(0)} KB</td>
          <td className="row">{OFFICIAL_TYPES.includes(String(d.document_type)) ? <button className="btn sm" onClick={() => nav(`/official?engagement_id=${e.group_engagement_id ?? id}&document_id=${d.id}`)}>استخراج البيانات</button> : can('imports.run') && <button className="btn sm" onClick={() => nav(`/imports?engagement_id=${id}&document_id=${d.id}`)}>استيراد</button>}<a className="btn sec sm" href={`/api/documents/${d.id}/download`}>تنزيل</a>{can('documents.delete') && d.status !== 'imported' && <button className="btn sec sm" onClick={() => confirm('حذف المستند؟') && run(() => del(`/documents/${d.id}`), 'تم الحذف').then(refresh)}>حذف</button>}
            {can('documents.upload') && targets.length > 0 && d.status !== 'imported' && <select value="" onChange={async (ev) => { const to = targets.find((x) => x.id === ev.target.value); if (to && confirm(`نقل «${d.title ?? d.original_name}» إلى «${to.name}»؟`)) { await run(() => post(`/documents/${d.id}/move`, { engagement_id: to.id }), `نُقل المستند إلى ${to.name}`); refresh(); } }} style={{ width: 150 }}><option value="">نقل إلى شركة…</option>{targets.filter((x) => x.id !== id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}</td></tr>)}</tbody></table> : <Empty text="لم تُرفع مستندات بعد" />}</div>
      <div className="card"><h2>مهام الاستيراد</h2>{data.imports.length ? <table className="t"><thead><tr><th>النوع</th><th>الفترة</th><th>الحالة</th><th>الصفوف</th><th>التاريخ</th></tr></thead><tbody>{data.imports.map((j) => <tr key={String(j.id)} className="clickable" onClick={() => nav(`/imports/${j.id}`)}><td>{DATA_TYPE[String(j.data_type)] ?? String(j.data_type)}</td><td>{data.periods.find((p) => p.id === j.period_id)?.label ?? '—'}</td><td><Badge k={String(j.status)} map={IMPORT_STATUS} tone={j.status === 'committed' ? 'ok' : j.status === 'failed' ? 'danger' : 'neutral'} /></td><td>{j.row_count}</td><td>{fmtDate(String(j.created_at), { time: true })}</td></tr>)}</tbody></table> : <Empty text="لا توجد مهام استيراد" />}
        <h2>إحصاءات</h2><dl className="kv"><dt>أسطر ميزان المراجعة</dt><dd>{data.stats.tb_rows}</dd><dt>الملاحظات (مفتوحة/الكل)</dt><dd>{data.stats.findings_open}/{data.stats.findings_total}</dd><dt>التسويات المقترحة</dt><dd>{data.stats.adjustments}</dd><dt>التقارير</dt><dd>{data.stats.reports}</dd><dt>آخر فحص للميزان</dt><dd>{fmtDate(data.stats.last_validation_at as string, { time: true })}</dd></dl></div>
    </div>
    {addPeriod && <Modal title="إضافة فترة مالية" onClose={() => setAddPeriod(false)}><form onSubmit={async (ev) => { ev.preventDefault(); const r = await run(() => post(`/engagements/${id}/periods`, np), 'تمت الإضافة'); if (r) { setAddPeriod(false); refresh(); } }}>
      <p className="muted">مقترحة من نهاية السنة المالية للعميل ({Number(e.fiscal_year_end_day ?? 31)}/{Number(e.fiscal_year_end_month ?? 12)}) والفترات الموجودة؛ عدّلها عند الحاجة.</p>
      <Field label="التسمية"><input value={np.label} onChange={(e2) => setNp({ ...np, label: e2.target.value })} required /></Field><div className="grid c2"><Field label="من"><input type="date" value={np.start_date} onChange={(e2) => setNp(withAuto(np, { start_date: e2.target.value }))} required /></Field><Field label="إلى"><input type="date" value={np.end_date} onChange={(e2) => setNp(withAuto(np, { end_date: e2.target.value }))} required /></Field></div>
      {np.start_date && np.end_date && <p className="muted">النوع: {isFullYear(np.start_date, np.end_date) ? 'سنة مالية كاملة' : 'فترة جزئية'}</p>}
      {periodErrors([...data.periods.map((x) => ({ label: String(x.label), start_date: String(x.start_date).slice(0, 10), end_date: String(x.end_date).slice(0, 10), role: String(x.role) })), np]).map((x) => <div key={x} className="alert danger">{x}</div>)}
      <Field label="الدور"><select value={np.role} onChange={(e2) => setNp({ ...np, role: e2.target.value })}>{Object.entries(PERIOD_ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><div className="row end"><button className="btn">إضافة</button></div></form></Modal>}
    {nextYear && <Modal title="إنشاء ارتباط السنة التالية" onClose={() => setNextYear(null)}>
      <p>يُنشأ ارتباط جديد لنفس العميل بنفس النوع والإطار والعملة، وتُستخدم <b>{nextYear.comparison.label}</b> {nextYear.comparison.has_tb ? 'وميزانها المعتمد' : '(لا يوجد لها ميزان معتمد بعد)'} للمقارنة تلقائيًا دون إعادة رفع.</p>
      <Field label="عنوان الارتباط الجديد"><input value={nextYear.title} onChange={(ev) => setNextYear({ ...nextYear, title: ev.target.value })} /></Field>
      <div className="grid c2"><Field label="من"><input type="date" value={nextYear.start_date} onChange={(ev) => setNextYear({ ...nextYear, start_date: ev.target.value })} /></Field><Field label="إلى"><input type="date" value={nextYear.end_date} onChange={(ev) => setNextYear({ ...nextYear, end_date: ev.target.value })} /></Field></div>
      <p className="muted">الفترة: {nextYear.start_date && nextYear.end_date ? periodLabel(nextYear.start_date, nextYear.end_date) : '—'}</p>
      <div className="row end"><button className="btn" onClick={async () => { const r = await run(() => post<{ id: string }>(`/engagements/${id}/next-year`, { title: nextYear.title, start_date: nextYear.start_date, end_date: nextYear.end_date }), 'أُنشئ ارتباط السنة التالية'); if (r) { setNextYear(null); nav(`/engagements/${r.id}`); } }}>إنشاء</button></div></Modal>}
  </Page>;
}

/** فترة مقترحة للإضافة: سابقة للحالية إن لم توجد سابقة، وإلا السنة التالية؛ وبلا فترات = السنة الحالية للمكتب */
function suggestPeriod(periods: Row[], m: number, d: number, officeYear: number) {
  const ps = periods.map((x) => ({ start: String(x.start_date).slice(0, 10), end: String(x.end_date).slice(0, 10), role: String(x.role) }));
  const cur = ps.find((x) => x.role === 'current');
  let start: string, end: string, role = 'current';
  if (!ps.length) { const fy = fiscalYear(officeYear, m, d); start = fy.start; end = fy.end; }
  else if (cur && !ps.some((x) => x.role === 'prior')) { role = 'prior'; if (isFullYear(cur.start, cur.end)) { const fy = fiscalYear(fiscalYearOf(cur.end, m, d) - 1, m, d); start = fy.start; end = fy.end; } else { start = shiftYears(cur.start, -1); end = shiftYears(cur.end, -1); } }
  else { const last = [...ps].sort((a, b) => b.end.localeCompare(a.end))[0]!; role = 'comparative'; const fy = fiscalYear(fiscalYearOf(addDays(last.end, 1), m, d), m, d); start = fy.start; end = fy.end; }
  return { label: periodLabel(start, end), start_date: start, end_date: end, period_type: periodType(start, end), role };
}
/** تحديث التسمية والنوع تلقائيًا عند تغيير التواريخ (إن لم تُعدَّل التسمية يدويًا) */
function withAuto<T extends { label: string; start_date: string; end_date: string; period_type: string }>(p: T, patch: Partial<T>): T {
  const n = { ...p, ...patch };
  if (n.start_date && n.end_date) { if (!p.label || (p.start_date && p.end_date && p.label === periodLabel(p.start_date, p.end_date))) n.label = periodLabel(n.start_date, n.end_date); n.period_type = periodType(n.start_date, n.end_date); }
  return n;
}
