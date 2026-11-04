import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { UserPlus, Search, ChevronDown, ChevronLeft, LayoutDashboard, BriefcaseBusiness, Wallet, FolderOpen, ClipboardList, Network, Users, History, Pencil, Plus, ArrowDownUp, Sheet } from 'lucide-react';
import { get } from '../api';
import { useAuth } from '../auth';
import { Page, Spinner, Empty, Modal, Money, useLoad } from '../components/ui';
import { ClientForm } from './Clients';
import { FinancePanel } from '../components/FinancePanel';
import { TaskModal } from './Tasks';
import { ENG_TYPE, ENG_STATUS, ENTITY, fmtDate, ACTION_LABELS, fmtMoney } from '../format';

type C = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const STATUS_TONE: Record<string, string> = { active: 'info', awaiting_signature: 'warn', overdue: 'danger', closed: 'neutral', new: 'neutral', archived: 'neutral' };
const ini = (n: string) => String(n ?? '').replace(/^(شركة|مؤسسة|مجموعة|مصنع|مكتب)\s+/, '').trim()[0] ?? '؟';

/** بيت العملاء: مبني لآلاف العملاء (بحث موحد، فلاتر، ترتيب، صفحات، المجموعات وشركاتها) */
export function ClientsHub() {
  const { can } = useAuth(); const nav = useNavigate(); const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(''); const [seg, setSeg] = useState('all'); const [industry, setIndustry] = useState(''); const [type, setType] = useState(''); const [sort, setSort] = useState('activity'); const [page, setPage] = useState(1); const [per, setPer] = useState(25);
  const [debQ, setDebQ] = useState(''); useEffect(() => { const t = window.setTimeout(() => { setDebQ(q); setPage(1); }, 220); return () => window.clearTimeout(t); }, [q]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({}); const [creating, setCreating] = useState(sp.get('new') === '1');
  const { data, loading } = useLoad(() => get<{ clients: C[]; total: number; page: number; per: number; segments: Record<string, number>; industries: string[]; stats: Record<string, number>; status_labels: Record<string, string> }>(`/practice/clients?q=${encodeURIComponent(debQ)}&segment=${seg}&industry=${encodeURIComponent(industry)}&type=${type}&sort=${sort}&page=${page}&per=${per}`), [debQ, seg, industry, type, sort, page, per]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;
  const csv = () => { if (!data) return; const rows = [['العميل', 'السجل', 'الخدمة', 'الأتعاب', 'المحصّل', 'المستحق', 'الحالة'], ...data.clients.map((c) => [c.legal_name_ar, c.cr_number ?? '', ENG_TYPE[c.engagement?.type] ?? '', c.fee, c.collected, c.outstanding, data.status_labels[c.status] ?? c.status])];
    const blob = new Blob(['﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'العملاء.csv'; a.click(); };
  return <Page title="بيت العملاء" sub="كل العملاء ومجموعاتهم وشركاتهم التابعة، مع ارتباطاتهم وأتعابهم ومستحقاتهم. البحث لا يفرّق بين أ/ا، ى/ي، ة/ه، والأرقام العربية/الإنجليزية."
    actions={can('clients.manage') && <button className="btn" onClick={() => setCreating(true)}><UserPlus size={16} /> عميل جديد</button>}>
    <div className="dgrid">
      {data && ([['إجمالي العملاء', fmtMoney(data.stats.clients, 0), `${data.stats.active} تحت التنفيذ | ${data.stats.archived} مؤرشف`, ''], ['مجموعات وشركات تابعة', String(data.stats.groups), `تضم ${data.stats.group_companies} شركة`, ''], ['أتعاب الارتباطات', fmtMoney(data.stats.fee), 'ريال بدون الضريبة', ''], ['المستحق على العملاء', fmtMoney(data.stats.outstanding), 'شامل الضريبة', 'warnt']] as const).map(([l, v, s, c]) => <div key={l} className="card mk s3"><small>{l}</small><b className={c}>{v}</b><span className="muted" style={{ fontSize: 12 }}>{s}</span></div>)}
      <section className="card s12">
        <div className="segtabs">{data && ([['all', 'الكل'], ['active', 'تحت التنفيذ'], ['awaiting_signature', 'بانتظار التوقيع'], ['overdue', 'متأخرون في السداد'], ['archived', 'مؤرشفون']] as const).map(([k, l]) => <button key={k} className={seg === k ? 'on' : ''} onClick={() => { setSeg(k); setPage(1); }}>{l}<em>{data.segments[k] ?? 0}</em></button>)}</div>
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="sw-search" style={{ boxShadow: 'none', borderColor: 'var(--border)', background: 'var(--surface)', height: 40, flex: '1 1 340px' }}><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو السجل التجاري أو الرقم الضريبي…" /></div>
          <select value={industry} onChange={(e) => { setIndustry(e.target.value); setPage(1); }}><option value="">كل القطاعات</option>{data?.industries.map((i) => <option key={i} value={i}>{i}</option>)}</select>
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">كل الخدمات</option>{Object.entries(ENG_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <label className="row" style={{ gap: 6, flex: '0 0 auto' }}><ArrowDownUp size={15} className="muted" /><select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 170 }}><option value="activity">الأحدث نشاطًا</option><option value="name">الاسم</option><option value="fee">الأعلى أتعابًا</option><option value="outstanding">الأعلى مستحقًا</option></select></label>
          <button className="btn sec" onClick={csv}><Sheet size={15} /> تصدير</button></div>
        {loading || !data ? <Spinner /> : !data.clients.length ? <Empty text={q ? `لا نتائج لـ «${q}»` : 'لا عملاء بعد'} /> : <div className="tscroll" style={{ maxHeight: 'none' }}><table className="t"><thead><tr><th>العميل</th><th>الخدمة الحالية</th><th>التنفيذ</th><th className="num">الأتعاب</th><th className="num">المحصّل</th><th className="num">المستحق</th><th>المسؤول</th><th>الحالة</th></tr></thead><tbody>
          {data.clients.map((c) => { const og = openGroups[c.id] ?? !!debQ; return [<tr key={c.id} className={c.companies.length ? 'grp clickable' : 'clickable'} onClick={() => nav(`/clients/${c.id}`)}>
            <td><div className="cl">{c.companies.length > 0 && <button className="iconbtn sm" onClick={(e) => { e.stopPropagation(); setOpenGroups((x) => ({ ...x, [c.id]: !og })); }} aria-label="الشركات">{og ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}</button>}<span className="cav">{ini(c.legal_name_ar)}</span><div><b>{c.legal_name_ar}</b><small>{ENTITY[c.entity_type] ?? c.entity_type}{c.cr_number ? ` | س.ت ${c.cr_number}` : ''}{c.companies.length ? ` | ${c.companies.length + 1} شركات` : ''}{c.is_demo ? ' | تجريبي' : ''}</small></div></div></td>
            <td>{c.engagement ? ENG_TYPE[c.engagement.type] ?? c.engagement.type : <span className="muted">—</span>}</td>
            <td>{c.progress ? <><div className="mini"><i style={{ width: `${c.progress.done / c.progress.total * 100}%` }} /></div><small className="muted">{c.progress.done}/{c.progress.total}</small></> : '—'}</td>
            <td className="num"><Money v={c.fee} /></td><td className="num"><Money v={c.collected} /></td><td className="num"><b><Money v={c.outstanding} /></b></td><td>{c.assigned_name ?? <span className="muted">أنت</span>}</td>
            <td><span className={`badge ${STATUS_TONE[c.status] ?? 'neutral'}`}>{data.status_labels[c.status] ?? c.status}</span></td></tr>,
            ...(og ? c.companies.map((k: C) => <tr key={k.id} className="sub clickable" onClick={() => nav(`/clients/${k.id}`)}><td><div className="cl"><span className="tree" /><div><b style={{ fontWeight: 500 }}>{k.legal_name_ar}</b><small>{k.engagement?.role === 'at_cost' ? 'بالتكلفة' : `تابعة ${Number(k.engagement?.ownership ?? 100)}%`}</small></div></div></td><td className="muted" colSpan={7}>ضمن ارتباط المجموعة</td></tr>) : [])]; })}</tbody></table></div>}
        {data && <div className="pg"><span className="muted">عرض {data.total ? (page - 1) * data.per + 1 : 0}–{Math.min(page * data.per, data.total)} من {fmtMoney(data.total, 0)} عميل</span><span style={{ flex: 1 }} />
          <button className="pgb" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: Math.min(5, pages) }, (_, i) => { const p = Math.max(1, Math.min(pages - 4, page - 2)) + i; return p <= pages ? <button key={p} className={`pgb${p === page ? ' on' : ''}`} onClick={() => setPage(p)}>{p}</button> : null; })}
          <button className="pgb" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button><select value={per} onChange={(e) => { setPer(Number(e.target.value)); setPage(1); }} style={{ width: 110 }}>{[25, 50, 100].map((n) => <option key={n} value={n}>{n} / صفحة</option>)}</select></div>}
      </section></div>
    {creating && <Modal title="عميل جديد" onClose={() => { setCreating(false); setSp({}); }} wide><ClientForm onDone={(id) => { setCreating(false); if (id) nav(`/clients/${id}`); }} /></Modal>}
  </Page>;
}

/** ملف العميل الشامل */
export function ClientProfile() {
  const { id } = useParams(); const { can } = useAuth(); const [tab, setTab] = useState('overview'); const [edit, setEdit] = useState(false); const [task, setTask] = useState(false);
  const { data, loading, reload } = useLoad(() => get<{ client: C; companies: C[]; engagements: C[]; finance: C[]; totals: Record<string, number>; counts: Record<string, string>; documents: C[]; activity: C[]; tasks: C[] }>(`/practice/clients/${id}`), [id]);
  if (loading || !data) return <Spinner />;
  const c = data.client; const T = data.totals; const roots = data.engagements.filter((e) => !e.group_engagement_id && e.client_name === c.legal_name_ar);
  const TABS: [string, typeof LayoutDashboard, string][] = [['overview', LayoutDashboard, 'نظرة عامة'], ['engagements', BriefcaseBusiness, `الارتباطات (${data.engagements.length})`], ['finance', Wallet, 'المالية'], ['documents', FolderOpen, `المستندات (${data.counts.documents})`], ['companies', Network, `الشركات (${data.companies.length})`], ['contacts', Users, 'جهات الاتصال'], ['activity', History, 'السجل']];
  return <Page title={c.legal_name_ar} sub={<>{ENTITY[c.entity_type] ?? c.entity_type}{c.cr_number ? ` | س.ت ${c.cr_number}` : ''}{c.vat_number ? ` | الرقم الضريبي ${c.vat_number}` : ''}{c.parent_name ? <> | ضمن مجموعة <Link to={`/clients/${c.parent_client_id}`}>{c.parent_name}</Link></> : ''}</>}
    actions={<>{can('clients.manage') && <button className="btn sec" onClick={() => setEdit(true)}><Pencil size={15} /> تعديل</button>}<button className="btn sec" onClick={() => setTask(true)}><Plus size={15} /> مهمة</button>{can('clients.manage') && !c.parent_client_id && <Link className="btn" to={`/engagements?new=1&client_id=${c.id}`}><Plus size={15} /> ارتباط جديد</Link>}</>}>
    <div className="card"><div className="phl"><span className="pav">{ini(c.legal_name_ar)}</span><div><h2 style={{ margin: 0 }}>{c.legal_name_ar} {c.is_active ? <span className="badge ok">نشط</span> : <span className="badge neutral">مؤرشف</span>}{data.companies.length > 0 && <span className="badge gold" style={{ background: 'var(--gold-050)', color: 'var(--gold-600)' }}>مجموعة {data.companies.length + 1} شركات</span>}</h2>
      <div className="muted">{c.industry ? `${c.industry} | ` : ''}{c.address ? `${c.address} | ` : ''}المسؤول: {c.assigned_name ?? 'أنت'}</div></div></div>
      <div className="phk"><div><small>أتعاب الارتباطات</small><b>{fmtMoney(T.fee)}</b></div><div><small>المحصّل (بدون الضريبة)</small><b className="okt">{fmtMoney(T.collected)}</b></div><div><small>المستحق على العميل</small><b className={T.outstanding ? 'warnt' : ''}>{fmtMoney(T.outstanding)}</b></div><div><small>المكتسب حسب التنفيذ</small><b>{fmtMoney(T.earned)}</b></div><div><small>طلبات معلّقة | ملاحظات مفتوحة</small><b>{data.counts.requests} | {data.counts.findings}</b></div></div>
      <div className="ptabs">{TABS.map(([k, I, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><I size={15} /> {l}</button>)}</div></div>
    {tab === 'overview' && <>{roots.map((e) => <FinancePanel key={e.id} engagementId={e.id} compact />)}{!roots.length && <div className="card"><Empty text={c.parent_client_id ? 'هذه شركة ضمن مجموعة؛ أتعابها في ارتباط المجموعة' : 'لا ارتباطات لهذا العميل بعد'} /></div>}
      {data.tasks.length > 0 && <div className="card"><div className="ch"><span>المهام</span></div>{data.tasks.map((t) => <div key={t.id} className="dl" style={{ marginBottom: 8 }}><div className="dt"><b>{t.title}</b><small>{t.due_date ? fmtDate(t.due_date) : 'بلا موعد'} | {t.status === 'done' ? 'منجزة' : 'مفتوحة'}</small></div></div>)}</div>}</>}
    {tab === 'engagements' && <div className="card"><table className="t"><thead><tr><th>الارتباط</th><th>الشركة</th><th>الفترة</th><th>الحالة</th><th>الخطاب</th><th></th></tr></thead><tbody>
      {data.engagements.map((e) => <tr key={e.id}><td><b>{ENG_TYPE[e.engagement_type] ?? e.title}</b>{e.group_engagement_id && <div className="muted">ضمن المجموعة</div>}</td><td>{e.client_name}</td><td>{e.period_label ?? '—'}</td><td><span className="badge info">{ENG_STATUS[e.status] ?? e.status}</span></td><td>{e.lifecycle ?? '—'}</td><td><Link className="btn sec sm" to={`/engagements/${e.id}`}>فتح</Link></td></tr>)}</tbody></table></div>}
    {tab === 'finance' && (roots.length ? roots.map((e) => <FinancePanel key={e.id} engagementId={e.id} />) : <div className="card"><Empty text="لا بيانات مالية" /></div>)}
    {tab === 'documents' && <div className="card">{!data.documents.length ? <Empty text="لا مستندات" /> : <table className="t"><thead><tr><th>المستند</th><th>الشركة</th><th>النوع</th><th>تاريخ الرفع</th><th></th></tr></thead><tbody>{data.documents.map((d) => <tr key={d.id}><td>{d.title}</td><td>{d.company}</td><td>{d.document_type}</td><td>{fmtDate(d.uploaded_at, { time: true })}</td><td><a className="btn sec sm" href={`/api/documents/${d.id}/download`}>تنزيل</a></td></tr>)}</tbody></table>}</div>}
    {tab === 'companies' && <div className="card">{!data.companies.length ? <Empty text="ليست مجموعة" /> : <table className="t"><thead><tr><th>الشركة</th><th>السجل</th><th>العلاقة</th><th>الملكية</th><th></th></tr></thead><tbody>{data.companies.map((k) => <tr key={k.id}><td><b>{k.legal_name_ar}</b></td><td>{k.cr_number ?? '—'}</td><td>{k.entity_role === 'at_cost' ? 'بالتكلفة' : 'تابعة'}</td><td>{k.ownership_pct ? `${Number(k.ownership_pct)}%` : '—'}</td><td><Link className="btn sec sm" to={`/clients/${k.id}`}>الملف</Link></td></tr>)}</tbody></table>}</div>}
    {tab === 'contacts' && <div className="card"><div className="kvs">{([['جهة الاتصال', c.contact_name], ['الهاتف', c.contact_phone], ['البريد', c.contact_email], ['العنوان', c.address], ['ملاحظات', c.notes]] as const).map(([l, v]) => <div key={l}><small>{l}</small><b>{v || '—'}</b></div>)}</div></div>}
    {tab === 'activity' && <div className="card"><div className="tl">{data.activity.map((a, i) => <div className="ev" key={i}><span className="dot2"><History size={14} /></span><div><b>{ACTION_LABELS[a.action] ?? a.action}</b><small>{a.user_name ?? '—'} | {fmtDate(a.created_at, { time: true })}</small></div></div>)}</div></div>}
    {edit && <Modal title="تعديل بيانات العميل" onClose={() => setEdit(false)} wide><ClientForm initial={c} onDone={() => { setEdit(false); reload(); }} /></Modal>}
    {task && <TaskModal clientId={c.id} onClose={() => setTask(false)} onDone={() => { setTask(false); reload(); }} />}
  </Page>;
}
