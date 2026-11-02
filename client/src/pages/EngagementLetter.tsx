import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post, put, download } from '../api';
import { Page, useLoad, Spinner, Field, useAction } from '../components/ui';
import { useAuth } from '../auth';
import { fmtDate } from '../format';

type Fields = Record<string, string | string[]>;
interface Letter { engagement_id: string; letter_no: string | null; letter_date: string; status: string; fields: Fields; pdf_file_id: string | null; updated_at?: string }
const TEXT: [string, string, boolean][] = [['client_attention', 'المرسل إليه (الصفة)', false], ['client_name', 'اسم العميل', false], ['client_cr', 'السجل التجاري', false], ['client_address', 'العنوان', false], ['subject', 'الموضوع', false], ['period', 'الفترة', false], ['intro', 'التمهيد', true], ['limitations', 'حدود الارتباط', true], ['fees', 'الأتعاب والسداد', true], ['timeline', 'المدة', true], ['confidentiality', 'السرية', true], ['termination', 'الإنهاء والنظام الواجب التطبيق', true], ['closing', 'الخاتمة', true], ['office_signatory', 'الموقّع عن المكتب', false], ['office_signatory_title', 'صفته', false], ['client_signatory', 'الموقّع عن العميل', false], ['client_signatory_title', 'صفته', false]];
const LISTS: [string, string][] = [['scope', 'نطاق الخدمات'], ['deliverables', 'المخرجات'], ['management_resp', 'مسؤوليات الإدارة'], ['office_resp', 'مسؤوليات المكتب']];

/** شاشة خطاب الارتباط: تعبئة الحقول → حفظ → معاينة → PDF على ترويسة المكتب */
export function EngagementLetter() {
  const { id } = useParams(); const { can } = useAuth(); const { run, busy } = useAction();
  const { data, loading, reload } = useLoad(() => get<{ exists: boolean; letter: Letter }>(`/engagements/${id}/letter`), [id]);
  const [l, setL] = useState<Letter | null>(null); const [pv, setPv] = useState(0);
  useEffect(() => { if (data) setL(data.letter); }, [data]);
  if (loading || !l) return <Spinner />;
  const f = l.fields; const setF = (k: string, v: string | string[]) => setL({ ...l, fields: { ...f, [k]: v } });
  const save = async (status = l.status) => { const r = await run(() => put<{ letter: Letter }>(`/engagements/${id}/letter`, { letter_date: l.letter_date, status, fields: f }), 'حُفظ الخطاب'); if (r) { setL(r.letter); setPv((k) => k + 1); } };
  const pdf = async () => { await save(); const r = await run(() => post<{ file_id: string }>(`/engagements/${id}/letter/pdf`), 'جُهّز ملف PDF'); if (r) await download(`/engagements/${id}/letter/pdf`, `${l.letter_no ?? 'engagement-letter'}.pdf`); reload(); };
  return <Page title="خطاب الارتباط" sub={<><Link to={`/engagements/${id}`}>{String(f.engagement_title)}</Link> | {String(f.engagement_type)} | {l.letter_no ? `الرقم ${l.letter_no}` : 'لم يُحفظ بعد (يُمنح رقمًا عند الحفظ)'} | الحالة: {l.status === 'issued' ? 'صادر' : 'مسودة'}</>}
    actions={<div className="row">{can('clients.manage') && <button className="btn sec" disabled={busy} onClick={() => save('draft')}>حفظ كمسودة</button>}{can('clients.manage') && <button className="btn" disabled={busy} onClick={() => save('issued')}>حفظ وتعليم كصادر</button>}{can('reports.export') && <button className="btn ok" disabled={busy || !data?.exists && !l.letter_no} onClick={pdf}>PDF للطباعة</button>}</div>}>
    <div className="grid c2">
      <div className="card"><h2>بيانات الخطاب</h2>
        <div className="row"><Field label="تاريخ الخطاب"><input type="date" value={l.letter_date} onChange={(e) => setL({ ...l, letter_date: e.target.value })} /></Field><div className="muted" style={{ paddingTop: 22 }}>{fmtDate(l.letter_date, { hijri: true })}</div></div>
        {TEXT.map(([k, label, long]) => <Field key={k} label={label}>{long ? <textarea rows={3} value={String(f[k] ?? '')} onChange={(e) => setF(k, e.target.value)} /> : <input value={String(f[k] ?? '')} onChange={(e) => setF(k, e.target.value)} />}</Field>)}
        {LISTS.map(([k, label]) => <Field key={k} label={`${label} (سطر لكل بند)`}><textarea rows={5} value={(f[k] as string[] ?? []).join('\n')} onChange={(e) => setF(k, e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} /></Field>)}
        <p className="muted">الصياغة الافتراضية مشتقة من نوع الارتباط وبيانات العميل وإعدادات المكتب؛ عدّلها بحرية. التوقيع والختم يُدرجان من صفحة "ترويسة المكتب" إن كانا مفعّلين.</p>
      </div>
      <div className="card"><h2>معاينة على ترويسة المكتب</h2><p className="muted">المعاينة تعرض آخر نسخة محفوظة.</p>
        <iframe key={pv} title="preview" src={`/api/engagements/${id}/letter/preview`} style={{ width: '100%', height: 900, border: '1px solid #d7dde6', background: '#fff' }} /></div>
    </div>
  </Page>;
}
