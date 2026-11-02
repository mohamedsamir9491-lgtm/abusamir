import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post, put, download } from '../api';
import { Page, useLoad, Spinner, Field, useAction } from '../components/ui';
import { useAuth } from '../auth';
import { fmtDate } from '../format';

interface Section { title: string; paragraphs: string[]; items: string[]; items_style: 'numbered' | 'bullets' | 'none'; after: string[] }
interface FeeRow { stage: string; pct: string; due: string }
interface Fields { template_code: string; template_name: string; summary_service: string; summary_period: string; summary_deliverables: string; fees_amount: string; vat_note: string; duration: string; office_contact: string; client_contact: string; fees_schedule: FeeRow[]; entity_name: string; legal_form: string; client_attention: string; client_cr: string; greeting: string; subject: string; intro: string[]; sections: Section[]; closing: string; party1_label: string; party1_name: string; party1_signatory: string; party2_label: string; party2_name: string; party2_signatory: string; engagement_title: string; engagement_type: string }
interface Letter { engagement_id: string; letter_no: string | null; letter_date: string; status: string; fields: Fields; pdf_file_id: string | null }
const ORD = ['أولًا', 'ثانيًا', 'ثالثًا', 'رابعًا', 'خامسًا', 'سادسًا', 'سابعًا', 'ثامنًا', 'تاسعًا', 'عاشرًا', 'حادي عشر', 'ثاني عشر', 'ثالث عشر', 'رابع عشر', 'خامس عشر', 'سادس عشر', 'سابع عشر', 'ثامن عشر', 'تاسع عشر', 'عشرون'];
const lines = (a: string[]) => a.join('\n'); const unlines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

/** شاشة خطاب الارتباط بهيكل نموذج المكتب: غلاف → تاريخ ومرسل إليه وموضوع وتمهيد → أقسام مرقمة → خاتمة وتوقيع الطرفين */
export function EngagementLetter() {
  const { id } = useParams(); const { can } = useAuth(); const { run, busy } = useAction();
  const { data, loading, reload } = useLoad(() => get<{ exists: boolean; letter: Letter }>(`/engagements/${id}/letter`), [id]);
  const { data: tpls } = useLoad(() => get<{ templates: { code: string; name: string; description: string; standard: string }[] }>(`/engagements/${id}/letter/templates`), [id]);
  const [l, setL] = useState<Letter | null>(null); const [pv, setPv] = useState(0); const [tab, setTab] = useState<'head' | 'summary' | 'sections' | 'sign'>('head'); const [detail, setDetail] = useState('');
  useEffect(() => { if (data) setL(data.letter); }, [data]);
  if (loading || !l) return <Spinner />;
  const f = l.fields; const setF = (patch: Partial<Fields>) => setL({ ...l, fields: { ...f, ...patch } });
  const setSec = (i: number, patch: Partial<Section>) => setF({ sections: f.sections.map((s, k) => k === i ? { ...s, ...patch } : s) });
  const move = (i: number, d: number) => { const s = [...f.sections]; const j = i + d; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; setF({ sections: s }); };
  const save = async (status = l.status) => { const r = await run(() => put<{ letter: Letter }>(`/engagements/${id}/letter`, { letter_date: l.letter_date, status, fields: f }), 'حُفظ الخطاب'); if (r) { setL(r.letter); setPv((k) => k + 1); } };
  const pdf = async () => { await save(); const r = await run(() => post<{ file_id: string }>(`/engagements/${id}/letter/pdf`), 'جُهّز ملف PDF'); if (r) await download(`/engagements/${id}/letter/pdf`, `${l.letter_no ?? 'engagement-letter'}.pdf`); reload(); };
  const applyTemplate = async (code: string) => { if (!code) return; if (f.sections.length && !confirm('تطبيق هذا النموذج سيستبدل كل أقسام الخطاب الحالية بالصياغة الافتراضية للنموذج (لا يُحفظ حتى تضغط حفظ). متابعة؟')) return; const r = await run(() => post<{ fields: Fields }>(`/engagements/${id}/letter/reset`, { template_code: code, subject_detail: detail || null }), 'طُبق النموذج'); if (r) setF({ ...r.fields, fees_amount: f.fees_amount || r.fields.fees_amount }); };
  const setFee = (i: number, patch: Partial<FeeRow>) => setF({ fees_schedule: f.fees_schedule.map((x, k) => k === i ? { ...x, ...patch } : x) });
  return <Page title="خطاب الارتباط" sub={<><Link to={`/engagements/${id}`}>{f.engagement_title}</Link> | {f.engagement_type} | {l.letter_no ? `الرقم ${l.letter_no}` : 'لم يُحفظ بعد (يُمنح رقمًا عند الحفظ)'} | الحالة: {l.status === 'issued' ? 'صادر' : 'مسودة'}</>}
    actions={<div className="row">{can('clients.manage') && <button className="btn sec" disabled={busy} onClick={() => save('draft')}>حفظ كمسودة</button>}{can('clients.manage') && <button className="btn" disabled={busy} onClick={() => save('issued')}>حفظ وتعليم كصادر</button>}{can('reports.export') && <button className="btn ok" disabled={busy} onClick={pdf}>PDF للطباعة</button>}</div>}>
    <div className="grid c2">
      <div className="card">
        {can('clients.manage') && <div className="card tight" style={{ marginBottom: 10, background: '#f6f8fb' }}><div className="row"><Field label="نموذج الخطاب (حسب الخدمة المقدمة لهذا العميل)"><select value={f.template_code} onChange={(e) => applyTemplate(e.target.value)} style={{ minWidth: 340 }}>{tpls?.templates.map((t) => <option key={t.code} value={t.code}>{t.name} - {t.standard}</option>)}</select></Field><Field label="موضوع الفحص / تفصيل (اختياري)" hint="مثال: الموظف فلان - عهدة الصندوق"><input value={detail} onChange={(e) => setDetail(e.target.value)} /></Field><button className="btn sec sm" style={{ alignSelf: 'end' }} disabled={busy} onClick={() => applyTemplate(f.template_code)}>إعادة تطبيق النموذج</button></div><div className="muted">{tpls?.templates.find((t) => t.code === f.template_code)?.description}</div></div>}
        <div className="row" style={{ marginBottom: 8 }}>{([['head', 'الغلاف والترويسة'], ['summary', 'ملخص الارتباط والأتعاب'], ['sections', `الأقسام (${f.sections.length})`], ['sign', 'الخاتمة والتوقيع']] as const).map(([k, v]) => <button key={k} className={`btn sm ${tab === k ? '' : 'sec'}`} onClick={() => setTab(k)}>{v}</button>)}</div>
        {tab === 'summary' && <>
          <Field label="الخدمة (سطر الملخص)"><input value={f.summary_service} onChange={(e) => setF({ summary_service: e.target.value })} /></Field>
          <Field label="الفترة / تاريخ العمل"><input value={f.summary_period} onChange={(e) => setF({ summary_period: e.target.value })} /></Field>
          <Field label="المخرجات (سطر الملخص)"><input value={f.summary_deliverables} onChange={(e) => setF({ summary_deliverables: e.target.value })} /></Field>
          <div className="row"><Field label="الأتعاب (مثال: 25,000 ريال سعودي)"><input value={f.fees_amount} onChange={(e) => setF({ fees_amount: e.target.value })} /></Field><Field label="ملاحظة الضريبة"><input value={f.vat_note} onChange={(e) => setF({ vat_note: e.target.value })} /></Field></div>
          <Field label="المدة المتوقعة"><input value={f.duration} onChange={(e) => setF({ duration: e.target.value })} /></Field>
          <div className="row"><Field label="جهة الاتصال - المكتب"><input value={f.office_contact} onChange={(e) => setF({ office_contact: e.target.value })} /></Field><Field label="جهة الاتصال - العميل"><input value={f.client_contact} onChange={(e) => setF({ client_contact: e.target.value })} /></Field></div>
          <h3>جدول السداد</h3><table className="t"><thead><tr><th>المرحلة</th><th>النسبة</th><th>موعد الاستحقاق</th><th></th></tr></thead><tbody>{f.fees_schedule.map((r, i) => <tr key={i}><td><input value={r.stage} onChange={(e) => setFee(i, { stage: e.target.value })} /></td><td><input style={{ width: 70 }} value={r.pct} onChange={(e) => setFee(i, { pct: e.target.value })} /></td><td><input value={r.due} onChange={(e) => setFee(i, { due: e.target.value })} /></td><td><button className="btn sec sm" onClick={() => setF({ fees_schedule: f.fees_schedule.filter((_, k) => k !== i) })}>×</button></td></tr>)}</tbody></table>
          <div className="row between"><button className="btn sec sm" onClick={() => setF({ fees_schedule: [...f.fees_schedule, { stage: '', pct: '', due: '' }] })}>+ مرحلة</button>{(() => { const sum = f.fees_schedule.reduce((a, r) => a + (parseFloat(r.pct.replace(/[^\d.]/g, '')) || 0), 0); return <span className={`badge ${Math.abs(sum - 100) < 0.01 ? 'ok' : 'warn'}`}>مجموع النسب: {sum}%{Math.abs(sum - 100) < 0.01 ? '' : ' (يجب أن يساوي 100%)'}</span>; })()}</div>
          <p className="muted">الافتراضي: 50% مقدمًا عند التوقيع و50% قبل تسليم التقرير النهائي. عدّل المراحل والنسب والمواعيد بحرية لكل عميل.</p>
        </>}
        {tab === 'head' && <>
          <div className="row"><Field label="تاريخ الخطاب"><input type="date" value={l.letter_date} onChange={(e) => setL({ ...l, letter_date: e.target.value })} /></Field><div className="muted" style={{ paddingTop: 22 }}>{fmtDate(l.letter_date, { hijri: true })}</div></div>
          <Field label="اسم المنشأة (صفحة الغلاف)"><input value={f.entity_name} onChange={(e) => setF({ entity_name: e.target.value })} /></Field>
          <Field label="الكيان القانوني (صفحة الغلاف)"><input value={f.legal_form} onChange={(e) => setF({ legal_form: e.target.value })} /></Field>
          <Field label="المرسل إليه"><input value={f.client_attention} onChange={(e) => setF({ client_attention: e.target.value })} /></Field>
          <Field label="السجل التجاري"><input value={f.client_cr} onChange={(e) => setF({ client_cr: e.target.value })} /></Field>
          <Field label="التحية"><input value={f.greeting} onChange={(e) => setF({ greeting: e.target.value })} /></Field>
          <Field label="الموضوع"><input value={f.subject} onChange={(e) => setF({ subject: e.target.value })} /></Field>
          <Field label="التمهيد (فقرة في كل سطر)"><textarea rows={7} value={lines(f.intro)} onChange={(e) => setF({ intro: unlines(e.target.value) })} /></Field>
        </>}
        {tab === 'sections' && <>
          {f.sections.map((s, i) => <div key={i} className="card tight" style={{ marginBottom: 8 }}>
            <div className="row between"><b>{ORD[i] ?? i + 1}: {s.title}</b><span className="row"><button className="btn sec sm" onClick={() => move(i, -1)}>▲</button><button className="btn sec sm" onClick={() => move(i, 1)}>▼</button><button className="btn sec sm" onClick={() => confirm('حذف هذا القسم؟') && setF({ sections: f.sections.filter((_, k) => k !== i) })}>حذف</button></span></div>
            <Field label="العنوان"><input value={s.title} onChange={(e) => setSec(i, { title: e.target.value })} /></Field>
            <Field label="الفقرات (فقرة في كل سطر)"><textarea rows={4} value={lines(s.paragraphs)} onChange={(e) => setSec(i, { paragraphs: unlines(e.target.value) })} /></Field>
            <div className="row"><Field label="نمط البنود"><select value={s.items_style} onChange={(e) => setSec(i, { items_style: e.target.value as Section['items_style'] })}><option value="numbered">مرقمة (1، 2، 3)</option><option value="bullets">نقطية</option><option value="none">بلا بنود</option></select></Field></div>
            {s.items_style !== 'none' && <Field label="البنود (بند في كل سطر)"><textarea rows={6} value={lines(s.items)} onChange={(e) => setSec(i, { items: unlines(e.target.value) })} /></Field>}
            <Field label="فقرات بعد البنود (اختياري)"><textarea rows={2} value={lines(s.after ?? [])} onChange={(e) => setSec(i, { after: unlines(e.target.value) })} /></Field>
          </div>)}
          <button className="btn sec sm" onClick={() => setF({ sections: [...f.sections, { title: 'قسم جديد', paragraphs: [], items: [], items_style: 'none', after: [] }] })}>+ إضافة قسم</button>
        </>}
        {tab === 'sign' && <>
          <Field label="الخاتمة"><input value={f.closing} onChange={(e) => setF({ closing: e.target.value })} /></Field>
          <div className="row"><Field label="عنوان الطرف الأول"><input value={f.party1_label} onChange={(e) => setF({ party1_label: e.target.value })} /></Field><Field label="اسمه"><input value={f.party1_name} onChange={(e) => setF({ party1_name: e.target.value })} /></Field><Field label="الموقّع عنه"><input value={f.party1_signatory} onChange={(e) => setF({ party1_signatory: e.target.value })} /></Field></div>
          <div className="row"><Field label="عنوان الطرف الثاني"><input value={f.party2_label} onChange={(e) => setF({ party2_label: e.target.value })} /></Field><Field label="اسمه"><input value={f.party2_name} onChange={(e) => setF({ party2_name: e.target.value })} /></Field><Field label="الموقّع عنه"><input value={f.party2_signatory} onChange={(e) => setF({ party2_signatory: e.target.value })} /></Field></div>
          <p className="muted">توقيع المكتب وختمه ورقم القيد تُدرج من صفحة "ترويسة المكتب" إن كانت مفعّلة.</p>
        </>}
      </div>
      <div className="card"><h2>معاينة على ترويسة المكتب</h2><p className="muted">المعاينة تعرض آخر نسخة محفوظة؛ اضغط حفظ لتحديثها.</p>
        <iframe key={pv} title="preview" src={`/api/engagements/${id}/letter/preview`} style={{ width: '100%', height: 1000, border: '1px solid #d7dde6', background: '#fff' }} /></div>
    </div>
  </Page>;
}
