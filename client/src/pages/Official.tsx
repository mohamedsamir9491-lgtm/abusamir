import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get, post, put } from '../api';
import { Page, useLoad, Spinner, Empty, Field, useAction, Badge, Modal, Sev } from '../components/ui';
import { useAuth } from '../auth';
import { DATA_TYPE, fmtDate, ENTITY } from '../format';
import { ROLE_AR } from './Group';

type Row = Record<string, string | number | null>;
type FieldV = { value: any; evidence: { page: number; snippet: string } | null; confidence: number; source: 'auto' | 'manual' }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Fields = Record<string, FieldV>;
interface Company { engagement_id: string; name: string; role: string; documents: Row[]; checklist: { key: string; label: string; required: boolean; status: string }[] }
const ST: Record<string, [string, string]> = { missing: ['غير مقدّم', 'danger'], received: ['مرفوع - لم يُعتمد', 'warn'], confirmed: ['معتمد', 'ok'] };
const NAT: Record<string, string> = { capital: 'شريك بالمال', work: 'شريك بالعمل', founder: 'مؤسس', owner: 'مالك' };
const APPLIED: Record<string, string> = { cr_number: 'رقم السجل', legal_name_ar: 'اسم العميل', entity_type: 'الشكل القانوني', fiscal_year_end: 'نهاية السنة المالية', ownership_pct: 'نسبة الملكية', control_since: 'تاريخ السيطرة', other_equity_rights: 'حقوق الشريك بالعمل', findings: 'ملاحظات المطابقة' };
const FORM: Record<string, string> = { llc: 'ذات مسؤولية محدودة', jsc: 'مساهمة', sole: 'مؤسسة فردية', partnership: 'تضامن/توصية', other: 'أخرى' };

/** البيانات النظامية: مستندات كل شركة، الاستخراج المحلي، المراجعة والاعتماد، والتطبيق على العميل والمجموعة */
export function Official() {
  const [sp, setSp] = useSearchParams(); const eng = sp.get('engagement_id') ?? ''; const docParam = sp.get('document_id'); const recParam = sp.get('record_id');
  const { can } = useAuth(); const { run, busy } = useAction();
  const { data: engs } = useLoad(() => get<{ engagements: Row[] }>('/engagements'), []);
  const { data, loading, reload } = useLoad(() => eng ? get<{ group_engagement_id: string; companies: Company[] }>(`/official?engagement_id=${eng}`) : Promise.resolve(null), [eng]);
  const [extracting, setExtracting] = useState('');
  const extract = async (docId: string) => { setExtracting(docId); const r = await run(() => post<{ id: string }>('/official/extract', { document_id: docId }), 'اكتمل الاستخراج؛ راجع الحقول قبل الاعتماد'); setExtracting(''); if (r) { reload(); setSp((s) => { s.set('record_id', r.id); s.delete('document_id'); return s; }); } };
  // فتح مستند وصل من صفحة الارتباط: استخراج تلقائي إن لم يُستخرج، وإلا فتح سجله
  useEffect(() => { if (!data || !docParam) return; const d = data.companies.flatMap((c) => c.documents).find((x) => x.id === docParam); if (!d) return; if (d.record_id) setSp((s) => { s.set('record_id', String(d.record_id)); s.delete('document_id'); return s; }); else if (can('documents.upload') && !extracting) extract(docParam); }, [data, docParam]); // eslint-disable-line
  return <Page title="البيانات النظامية" sub="تُقرأ عقود التأسيس والأنظمة الأساسية والسجلات التجارية محليًا (نص أو تعرف ضوئي)، وتُعرض الحقول مع مصدر كل منها لتراجعها وتعتمدها، ثم تُطبَّق على بيانات العميل والمجموعة وتُطابق بالدفاتر.">
    <div className="card tight"><Field label="الارتباط"><select value={eng} onChange={(e) => setSp(e.target.value ? { engagement_id: e.target.value } : {})} style={{ minWidth: 360 }}><option value="">— اختر —</option>{engs?.engagements.filter((e) => !e.group_engagement_id).map((e) => <option key={String(e.id)} value={String(e.id)}>{e.client_name} — {e.title}</option>)}</select></Field></div>
    {!eng ? <Empty text="اختر الارتباط" /> : loading || !data ? <Spinner /> : <>
      {recParam && <RecordReview id={recParam} onClose={() => setSp((s) => { s.delete('record_id'); return s; })} onChanged={reload} />}
      {data.companies.map((c) => <div key={c.engagement_id} className="card"><div className="row between"><h2>{c.name} <span className="muted" style={{ fontSize: 13 }}>({ROLE_AR[c.role] ?? c.role})</span></h2><Link className="btn sec sm" to={`/engagements/${c.engagement_id}`}>رفع مستند لهذه الشركة</Link></div>
        <div className="row" style={{ marginBottom: 8 }}>{c.checklist.map((k) => <span key={k.key} className={`badge ${ST[k.status]?.[1] ?? 'neutral'}`}>{k.label}: {ST[k.status]?.[0] ?? k.status}{!k.required && k.status === 'missing' ? ' (اختياري)' : ''}</span>)}</div>
        {c.documents.length ? <table className="t ruled"><thead><tr><th>المستند</th><th>النوع</th><th>الحالة</th><th></th></tr></thead><tbody>{c.documents.map((d) => <tr key={String(d.id)}>
          <td>{d.title}<div className="muted">{fmtDate(String(d.uploaded_at), { time: true })}</div></td><td>{DATA_TYPE[String(d.document_type)] ?? d.document_type}</td>
          <td>{!d.record_id ? <span className="badge neutral">لم تُستخرج بياناته</span> : d.record_status === 'confirmed' ? <span className="badge ok">معتمد {d.confirmed_at ? fmtDate(String(d.confirmed_at)) : ''}</span> : <span className="badge warn">مستخرج - بانتظار المراجعة</span>}</td>
          <td className="row">{d.record_id && <button className="btn sm" onClick={() => setSp((s) => { s.set('record_id', String(d.record_id)); return s; })}>مراجعة</button>}{can('documents.upload') && <button className="btn sec sm" disabled={busy || extracting === d.id} onClick={() => (!d.record_id || confirm('إعادة الاستخراج تستبدل الحقول المستخرجة سابقًا (والمعدلة يدويًا). متابعة؟')) && extract(String(d.id))}>{extracting === d.id ? 'جارٍ القراءة…' : d.record_id ? 'إعادة الاستخراج' : 'استخراج البيانات'}</button>}<a className="btn sec sm" href={`/api/documents/${d.id}/download`}>تنزيل</a></td></tr>)}</tbody></table>
          : <Empty text="لا توجد مستندات نظامية لهذه الشركة. ارفع عقد التأسيس/النظام الأساس والسجل التجاري من صفحة الشركة باختيار نوع المستند المناسب." />}
      </div>)}
    </>}
  </Page>;
}

function RecordReview({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { can } = useAuth(); const { run, busy } = useAction();
  const { data, reload } = useLoad(() => get<{ record: { id: string; status: string; doc_kind: string; fields: Fields; warnings: string[]; page_count: number; confirmed_at: string | null; applied: Record<string, unknown> | null }; document: { title: string; document_type: string }; company: { name: string; client: Row; ownership_pct: string | null; group_engagement_id: string | null; period: Row | null }; checks: Row[] }>(`/official/${id}`), [id]);
  const [F, setF] = useState<Fields | null>(null); const [dirty, setDirty] = useState(false); const [pageView, setPageView] = useState<{ page: number; text: string } | null>(null);
  const [apply, setApply] = useState({ client_cr: true, client_name: false, client_form: true, client_fy: true, group_ownership: true, group_control: true, group_rights: true });
  useEffect(() => { if (data) { setF(data.record.fields); setDirty(false); } }, [data]);
  if (!data || !F) return <div className="card"><Spinner /></div>;
  const set = (k: string, value: unknown) => { setF({ ...F, [k]: { ...(F[k] ?? { evidence: null, confidence: 0 }), value, source: 'manual' } as FieldV }); setDirty(true); };
  const v = (k: string) => F[k]?.value ?? null;
  const evid = (k: string) => { const e = F[k]?.evidence; const src = F[k]?.source; return <span className="muted" style={{ fontSize: 11.5 }}>{src === 'manual' ? 'عُدّل يدويًا' : e ? <>ص{e.page}: «{e.snippet.slice(0, 110)}» <a href="#" onClick={async (ev) => { ev.preventDefault(); const r = await get<{ page: { page: number; text: string } }>(`/official/${id}/page/${e.page}`); setPageView(r.page); }}>عرض الصفحة</a></> : v(k) == null ? 'لم يُعثر عليه في المستند' : ''}</span>; };
  const txt = (k: string, label: string, dir?: 'ltr') => <Field label={label}><input value={v(k) ?? ''} onChange={(e) => set(k, e.target.value || null)} dir={dir} />{evid(k)}</Field>;
  const numF = (k: string, label: string) => <Field label={label}><input value={v(k) ?? ''} onChange={(e) => set(k, e.target.value === '' ? null : Number(String(e.target.value).replace(/,/g, '')))} dir="ltr" />{evid(k)}</Field>;
  const boolF = (k: string, label: string, yes: string, no: string) => <Field label={label}><select value={v(k) == null ? '' : v(k) ? '1' : '0'} onChange={(e) => set(k, e.target.value === '' ? null : e.target.value === '1')}><option value="">غير محدد</option><option value="1">{yes}</option><option value="0">{no}</option></select>{evid(k)}</Field>;
  const partners = (v('partners') ?? []) as { name: string; nature: string; id_no: string | null; amount: number | null; pct: number | null }[];
  const board = (v('board') ?? []) as { name: string; position: string }[];
  const save = async () => { await run(() => put(`/official/${id}`, { fields: F }), 'حُفظت التعديلات'); setDirty(false); reload(); };
  const confirmRec = async () => { if (dirty) await run(() => put(`/official/${id}`, { fields: F })); const r = await run(() => post<{ applied: Record<string, unknown> }>(`/official/${id}/confirm`, { apply: data.company.group_engagement_id ? apply : { ...apply, group_ownership: false, group_control: false, group_rights: false } }), 'اعتُمدت البيانات'); if (r) { reload(); onChanged(); } };
  const cl = data.company.client; const isComp = !!data.company.group_engagement_id;
  const parentPct = partners.find((p) => p.nature !== 'work' && p.pct != null)?.pct;
  return <div className="card" style={{ borderColor: 'var(--primary)' }}>
    <div className="row between"><h2>مراجعة: {data.document.title} <span className="muted" style={{ fontSize: 13 }}>| {data.company.name} | {data.record.page_count} صفحة</span></h2><div className="row">{data.record.status === 'confirmed' ? <span className="badge ok">معتمد {data.record.confirmed_at ? fmtDate(data.record.confirmed_at, { time: true }) : ''}</span> : <span className="badge warn">بانتظار المراجعة</span>}<button className="btn sec sm" onClick={onClose}>إغلاق</button></div></div>
    {data.record.warnings.map((w) => <div key={w} className="alert warn">{w}</div>)}
    <div className="alert info">الحقول مستخرجة آليًا من نص المستند؛ تحت كل حقل الموضع الذي أُخذ منه. راجعها وعدّل ما يلزم، ثم «اعتماد وتطبيق». لا يُستخدم شيء قبل الاعتماد.</div>
    <h3>الهوية والتسجيل</h3><div className="grid c3">{txt('company_name', 'اسم الشركة')}
      <Field label="الشكل القانوني"><select value={v('legal_form') ?? ''} onChange={(e) => set('legal_form', e.target.value || null)}><option value="">غير محدد</option>{Object.entries(FORM).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>{evid('legal_form')}</Field>
      {boolF('single_person', 'شركة شخص واحد', 'نعم', 'لا')}{txt('unified_no', 'الرقم الموحد', 'ltr')}{txt('cr_no', 'رقم السجل التجاري', 'ltr')}{txt('request_no', 'رقم الطلب', 'ltr')}
      {txt('head_office', 'المركز الرئيس')}{boolF('is_draft', 'حالة المستند', 'مسودة', 'نسخة نهائية')}</div>
    <h3>التواريخ</h3><div className="grid c3">{txt('contract_date_hijri', 'تاريخ العقد (هجري)', 'ltr')}<Field label="تاريخ العقد (ميلادي)"><input type="date" value={v('contract_date') ?? ''} onChange={(e) => set('contract_date', e.target.value || null)} />{evid('contract_date')}</Field>{txt('first_fy_end', 'نهاية السنة المالية الأولى', 'ltr')}
      {txt('cr_issue_hijri', 'إصدار السجل (هجري)', 'ltr')}{txt('cr_expiry_hijri', 'انتهاء السجل (هجري)', 'ltr')}<Field label="انتهاء السجل (ميلادي)"><input type="date" value={v('cr_expiry') ?? ''} onChange={(e) => set('cr_expiry', e.target.value || null)} />{evid('cr_expiry')}</Field></div>
    <h3>رأس المال والسنة المالية</h3><div className="grid c3">{numF('capital', 'رأس المال المصدر')}{numF('paid_capital', 'رأس المال المدفوع')}{boolF('fully_paid', 'سداد رأس المال', 'مدفوع بالكامل', 'مدفوع جزئيًا')}{numF('shares_count', 'عدد الحصص / الأسهم')}{numF('share_value', 'قيمة الحصة / السهم')}
      <Field label="نهاية السنة المالية (يوم/شهر)"><div className="row"><input style={{ width: 70 }} value={v('fy_end_day') ?? ''} onChange={(e) => set('fy_end_day', e.target.value ? Number(e.target.value) : null)} dir="ltr" />/<input style={{ width: 70 }} value={v('fy_end_month') ?? ''} onChange={(e) => set('fy_end_month', e.target.value ? Number(e.target.value) : null)} dir="ltr" /></div>{evid('fy_end_month')}</Field></div>
    <h3>الشركاء / المؤسسون</h3>
    <table className="t ruled"><thead><tr><th>الاسم</th><th>الصفة</th><th>رقم الهوية/السجل</th><th className="num">قيمة الحصص</th><th className="num">النسبة %</th><th /></tr></thead><tbody>{partners.map((p, i) => <tr key={i}>
      <td><input value={p.name} onChange={(e) => set('partners', partners.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></td>
      <td><select value={p.nature} onChange={(e) => set('partners', partners.map((x, j) => j === i ? { ...x, nature: e.target.value } : x))}>{Object.entries(NAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
      <td><input value={p.id_no ?? ''} dir="ltr" onChange={(e) => set('partners', partners.map((x, j) => j === i ? { ...x, id_no: e.target.value || null } : x))} /></td>
      <td className="num"><input value={p.amount ?? ''} dir="ltr" style={{ width: 120 }} onChange={(e) => set('partners', partners.map((x, j) => j === i ? { ...x, amount: e.target.value ? Number(e.target.value.replace(/,/g, '')) : null } : x))} /></td>
      <td className="num"><input value={p.pct ?? ''} dir="ltr" style={{ width: 100 }} onChange={(e) => set('partners', partners.map((x, j) => j === i ? { ...x, pct: e.target.value ? Number(e.target.value) : null } : x))} /></td>
      <td><button className="btn sec sm" onClick={() => set('partners', partners.filter((_, j) => j !== i))}>حذف</button></td></tr>)}</tbody></table>
    <div className="row"><button className="btn sec sm" onClick={() => set('partners', [...partners, { name: '', nature: 'capital', id_no: null, amount: null, pct: null }])}>+ شريك</button>{evid('partners')}</div>
    {board.length > 0 && <><h3>الإدارة</h3><table className="t ruled"><thead><tr><th>الاسم</th><th>المنصب</th></tr></thead><tbody>{board.map((b, i) => <tr key={i}><td>{b.name}</td><td>{b.position}</td></tr>)}</tbody></table></>}
    {Array.isArray(v('activities')) && v('activities').length > 0 && <details style={{ marginTop: 8 }}><summary>الأنشطة ({v('activities').length})</summary><ul>{(v('activities') as string[]).map((a, i) => <li key={i}>{a}</li>)}</ul></details>}
    <h3>نتيجة المطابقة مع الدفاتر وبيانات العميل</h3>
    {data.checks.length ? data.checks.map((c) => <div key={String(c.dedupe_key)} className={`finding ${c.severity}`}><div className="title"><Sev s={String(c.severity)} /> {c.title}</div><div className="desc">{c.description}</div>{c.recommendation && <div className="muted">الإجراء: {c.recommendation}</div>}</div>) : <div className="alert ok">لا تعارض بين بيانات المستند والدفاتر وسجل العميل{data.company.period ? ` (فترة ${data.company.period.label})` : ''}.</div>}
    <p className="muted">تُسجَّل نتائج المطابقة كملاحظات على الفترة الحالية للشركة عند الاعتماد، وتظهر في التقرير.</p>
    {can('documents.upload') && <><h3>التطبيق عند الاعتماد</h3>
      <div className="grid c2">
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={apply.client_cr} onChange={(e) => setApply({ ...apply, client_cr: e.target.checked })} /> رقم السجل للعميل: {String(cl.cr_number ?? '—')} ← <b>{v('cr_no') ?? v('unified_no') ?? '—'}</b></label>
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={apply.client_form} onChange={(e) => setApply({ ...apply, client_form: e.target.checked })} /> الشكل القانوني: {ENTITY[String(cl.entity_type)] ?? cl.entity_type} ← <b>{FORM[v('legal_form')] ?? '—'}</b></label>
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={apply.client_fy} onChange={(e) => setApply({ ...apply, client_fy: e.target.checked })} /> نهاية السنة المالية: {cl.fiscal_year_end_day}/{cl.fiscal_year_end_month} ← <b>{v('fy_end_month') ? `${v('fy_end_day')}/${v('fy_end_month')}` : '—'}</b></label>
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={apply.client_name} onChange={(e) => setApply({ ...apply, client_name: e.target.checked })} /> اسم العميل: {String(cl.legal_name_ar)} ← <b>{v('company_name') ?? '—'}</b></label>
        {isComp && <><label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={apply.group_ownership} onChange={(e) => setApply({ ...apply, group_ownership: e.target.checked })} /> نسبة ملكية الأم في المجموعة: {Number(data.company.ownership_pct ?? 100)}% ← <b>{parentPct != null ? `${parentPct}%` : '—'}</b></label>
          <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={apply.group_control} onChange={(e) => setApply({ ...apply, group_control: e.target.checked })} /> تاريخ اكتساب السيطرة (التأسيس) في التوحيد ← <b>{v('contract_date') ? fmtDate(v('contract_date')) : '—'}</b></label>
          <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={apply.group_rights} onChange={(e) => setApply({ ...apply, group_rights: e.target.checked })} /> حقوق الشريك بالعمل في التوحيد ← <b>{partners.filter((p) => p.nature === 'work').map((p) => p.name).join('، ') || '—'}</b></label></>}
      </div>
      <div className="row end" style={{ marginTop: 10 }}><button className="btn sec" disabled={busy || !dirty} onClick={save}>حفظ التعديلات</button><button className="btn ok" disabled={busy} onClick={confirmRec}>اعتماد وتطبيق</button></div></>}
    {data.record.applied && Object.keys(data.record.applied).length > 0 && <p className="muted">طُبّق عند آخر اعتماد: {Object.entries(data.record.applied).map(([k, x]) => `${APPLIED[k] ?? k}: ${k === 'entity_type' ? (FORM[String(x)] ?? x) : k === 'control_since' ? fmtDate(String(x)) : k === 'ownership_pct' ? `${x}%` : x}`).join(' | ')}</p>}
    {pageView && <Modal title={`نص الصفحة ${pageView.page}`} onClose={() => setPageView(null)}><pre style={{ whiteSpace: 'pre-wrap', direction: 'rtl', maxHeight: '60vh', overflow: 'auto', fontSize: 12.5 }}>{pageView.text}</pre></Modal>}
  </div>;
}
