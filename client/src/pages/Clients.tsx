import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, post, put, del } from '../api';
import { Page, useLoad, Spinner, Empty, Modal, Field, useAction, DangerButton } from '../components/ui';
import { ENTITY, FRAMEWORK, ENG_STATUS, ENG_TYPE, fmtDate } from '../format';
import { useAuth } from '../auth';

type Client = Record<string, string | number | boolean | null>;
const empty = { legal_name_ar: '', legal_name_en: '', entity_type: 'llc', cr_number: '', vat_number: '', fiscal_year_end_month: 12, fiscal_year_end_day: 31, accounting_framework: 'unspecified', reporting_currency: 'SAR', industry: '', contact_name: '', contact_phone: '', contact_email: '', address: '', notes: '', is_demo: false };

export function ClientForm({ initial, onDone }: { initial?: Client; onDone: (id?: string) => void }) {
  const [f, setF] = useState<typeof empty>({ ...empty, ...(initial ? Object.fromEntries(Object.entries(initial).filter(([k]) => k in empty).map(([k, v]) => [k, v ?? ''])) : {}) } as typeof empty);
  const { run, busy } = useAction();
  const set = (k: keyof typeof empty, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...f, fiscal_year_end_month: Number(f.fiscal_year_end_month), fiscal_year_end_day: Number(f.fiscal_year_end_day), legal_name_en: f.legal_name_en || null, cr_number: f.cr_number || null, vat_number: f.vat_number || null, industry: f.industry || null, contact_name: f.contact_name || null, contact_phone: f.contact_phone || null, contact_email: f.contact_email || null, address: f.address || null, notes: f.notes || null };
    const r = await run(() => initial ? put(`/clients/${initial.id}`, body) : post<{ id: string }>('/clients', body), 'تم الحفظ');
    if (r) onDone((r as { id?: string }).id);
  };
  return <form onSubmit={submit}><div className="grid c2">
    <Field label="الاسم القانوني (عربي) *"><input value={f.legal_name_ar} onChange={(e) => set('legal_name_ar', e.target.value)} required /></Field>
    <Field label="الاسم القانوني (إنجليزي)"><input value={f.legal_name_en} onChange={(e) => set('legal_name_en', e.target.value)} dir="ltr" /></Field>
    <Field label="نوع الكيان"><select value={f.entity_type} onChange={(e) => set('entity_type', e.target.value)}>{Object.entries(ENTITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
    <Field label="النشاط / القطاع"><input value={f.industry} onChange={(e) => set('industry', e.target.value)} /></Field>
    <Field label="رقم السجل التجاري"><input value={f.cr_number} onChange={(e) => set('cr_number', e.target.value)} dir="ltr" /></Field>
    <Field label="الرقم الضريبي (ض.ق.م)"><input value={f.vat_number} onChange={(e) => set('vat_number', e.target.value)} dir="ltr" /></Field>
    <Field label="نهاية السنة المالية (شهر/يوم)"><div className="row"><input type="number" min={1} max={12} value={f.fiscal_year_end_month} onChange={(e) => set('fiscal_year_end_month', e.target.value)} style={{ width: 80 }} /><input type="number" min={1} max={31} value={f.fiscal_year_end_day} onChange={(e) => set('fiscal_year_end_day', e.target.value)} style={{ width: 80 }} /></div></Field>
    <Field label="إطار التقرير المالي" hint="لا يُفترض إطار بعينه؛ حدده بناءً على خطاب الارتباط"><select value={f.accounting_framework} onChange={(e) => set('accounting_framework', e.target.value)}>{Object.entries(FRAMEWORK).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
    <Field label="عملة التقرير"><input value={f.reporting_currency} onChange={(e) => set('reporting_currency', e.target.value.toUpperCase())} maxLength={3} dir="ltr" /></Field>
    <Field label="جهة الاتصال"><input value={f.contact_name} onChange={(e) => set('contact_name', e.target.value)} /></Field>
    <Field label="الهاتف"><input value={f.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} dir="ltr" /></Field>
    <Field label="البريد الإلكتروني"><input value={f.contact_email} onChange={(e) => set('contact_email', e.target.value)} dir="ltr" /></Field>
    <Field label="العنوان"><input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
  </div>
    <Field label="ملاحظات"><textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
    <label className="row"><input type="checkbox" checked={!!f.is_demo} onChange={(e) => set('is_demo', e.target.checked)} /> عميل تجريبي (بيانات اختبار - تُعرض بعلامة واضحة ولا تُخلط بالسجلات الفعلية)</label>
    <div className="row end" style={{ marginTop: 12 }}><button className="btn" disabled={busy}>{initial ? 'حفظ التعديلات' : 'إنشاء العميل'}</button></div></form>;
}

export function Clients() {
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const nav = useNavigate(); const { can } = useAuth(); const { run: runL } = useAction();
  const { data, loading, reload } = useLoad(() => get<{ clients: Client[] }>(`/clients?q=${encodeURIComponent(q)}`), [q]);
  return <Page title="العملاء" sub="كل عميل بسجلاته وارتباطاته منفصلًا" actions={can('clients.manage') && <button className="btn" onClick={() => setOpen(true)}>+ عميل جديد</button>}>
    <div className="card tight"><input placeholder="بحث بالاسم أو السجل التجاري…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    <div className="card">{loading ? <Spinner /> : !data?.clients.length ? <Empty text="لا يوجد عملاء بعد" /> : <table className="t"><thead><tr><th>العميل</th><th>الكيان</th><th>السجل التجاري</th><th>الإطار</th><th>العملة</th><th>الارتباطات</th>{can('data.delete') && <th></th>}</tr></thead><tbody>
      {data.clients.map((c) => <tr key={String(c.id)} className="clickable" onClick={() => nav(`/clients/${c.id}`)}><td><b>{c.legal_name_ar}</b> {c.is_demo && <span className="demo-tag">تجريبي</span>}<div className="muted">{c.legal_name_en}</div></td><td>{ENTITY[String(c.entity_type)]}</td><td className="mono">{c.cr_number ?? '—'}</td><td>{FRAMEWORK[String(c.accounting_framework)]}</td><td>{c.reporting_currency}</td><td>{c.engagement_count}</td>{can('data.delete') && <td className="row" onClick={(ev) => ev.stopPropagation()}><DangerButton label="أرشفة" text={`أرشفة العميل ${c.legal_name_ar}؟ يختفي من القوائم ويبقى في قاعدة البيانات للتطهير لاحقًا.`} onConfirm={async () => { await runL(() => del(`/clients/${c.id}`), 'أُرشف العميل'); reload(); }} /><DangerButton label="تطهير نهائي" text={`تطهير العميل ${c.legal_name_ar} نهائيًا بكل ارتباطاته ومستنداته وموازينه وتقاريره؟ لا يمكن التراجع.`} onConfirm={async () => { await runL(() => del(`/clients/${c.id}?hard=true`), 'طُهّر العميل نهائيًا'); reload(); }} /></td>}</tr>)}
    </tbody></table>}</div>
    {open && <Modal title="عميل جديد" onClose={() => setOpen(false)} wide><ClientForm onDone={(id) => { setOpen(false); reload(); if (id) nav(`/clients/${id}`); }} /></Modal>}
  </Page>;
}

export function ClientDetail() {
  const { id } = useParams(); const [edit, setEdit] = useState(false); const nav = useNavigate(); const { can } = useAuth();
  const { data, loading, reload } = useLoad(() => get<{ client: Client; engagements: Record<string, string>[]; outstanding_requests: Record<string, string>[] }>(`/clients/${id}`), [id]);
  if (loading || !data) return <Spinner />;
  const c = data.client;
  return <Page title={String(c.legal_name_ar)} sub={<>{c.legal_name_en} {c.is_demo && <span className="demo-tag">بيانات تجريبية</span>}</>} actions={<>{can('clients.manage') && <button className="btn sec" onClick={() => setEdit(true)}>تعديل</button>}{can('clients.manage') && <button className="btn" onClick={() => nav(`/engagements?new=1&client_id=${c.id}`)}>+ ارتباط جديد</button>}</>}>
    <div className="grid c2">
      <div className="card"><h2>بيانات العميل</h2><dl className="kv"><dt>نوع الكيان</dt><dd>{ENTITY[String(c.entity_type)]}</dd><dt>السجل التجاري</dt><dd className="mono">{c.cr_number ?? '—'}</dd><dt>الرقم الضريبي</dt><dd className="mono">{c.vat_number ?? '—'}</dd><dt>السنة المالية</dt><dd>تنتهي {c.fiscal_year_end_day}/{c.fiscal_year_end_month}</dd><dt>الإطار</dt><dd>{FRAMEWORK[String(c.accounting_framework)]}</dd><dt>العملة</dt><dd>{c.reporting_currency}</dd><dt>النشاط</dt><dd>{c.industry ?? '—'}</dd><dt>الاتصال</dt><dd>{[c.contact_name, c.contact_phone, c.contact_email].filter(Boolean).join(' | ') || '—'}</dd><dt>العنوان</dt><dd>{c.address ?? '—'}</dd><dt>ملاحظات</dt><dd>{c.notes ?? '—'}</dd></dl></div>
      <div className="card"><h2>طلبات مستندات معلقة</h2>{data.outstanding_requests.length ? <ul>{data.outstanding_requests.map((r) => <li key={r.id}><Link to={`/findings?engagement_id=&finding=${r.id}`}>{r.finding_ref}</Link> {r.title}</li>)}</ul> : <Empty text="لا توجد طلبات معلقة" />}</div>
    </div>
    <div className="card"><h2>الارتباطات والفترات</h2>{data.engagements.length ? <table className="t"><thead><tr><th>الارتباط</th><th>النوع</th><th>الحالة</th><th>فترات</th><th>مستندات</th><th>تقارير</th><th>أنشئ</th></tr></thead><tbody>
      {data.engagements.map((e) => <tr key={e.id} className="clickable" onClick={() => nav(`/engagements/${e.id}`)}><td><b>{e.title}</b></td><td>{ENG_TYPE[e.engagement_type]}</td><td>{ENG_STATUS[e.status]}</td><td>{e.period_count}</td><td>{e.document_count}</td><td>{e.report_count}</td><td>{fmtDate(e.created_at)}</td></tr>)}
    </tbody></table> : <Empty text="لا توجد ارتباطات" />}</div>
    {edit && <Modal title="تعديل العميل" onClose={() => setEdit(false)} wide><ClientForm initial={c} onDone={() => { setEdit(false); reload(); }} /></Modal>}
  </Page>;
}
