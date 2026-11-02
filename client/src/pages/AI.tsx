import { useState } from 'react';
import { get, post } from '../api';
import { Page, useLoad, Spinner, Empty, useAction, Sev, Modal } from '../components/ui';
import { useScope } from '../components/Scope';
import { fmtDate } from '../format';
import { useAuth } from '../auth';

interface Status { provider: string; available: boolean; authorized: boolean; reason: string | null; share_client_names: boolean; model: string | null }
interface Analysis { executive_summary_ar: string; financial_commentary_ar: string; risk_assessment: Record<string, { level: string; rationale: string }>; observations: { title: string; category: string; severity: string; fs_line_or_account: string | null; amount_quoted: string | null; evidence_refs: string[]; explanation: string; potential_impact: string | null; recommendation: string | null; confidence: string }[]; management_questions: string[]; documents_needed: string[]; review_checklist: string[]; limitations: string[]; _verification: { unverified_numbers: string[]; model: string; generated_at: string } }
const LV: Record<string, string> = { low: 'منخفض', medium: 'متوسط', high: 'مرتفع', unknown: 'غير محدد' };
const RISK: Record<string, string> = { liquidity: 'السيولة', profitability: 'الربحية', leverage: 'المديونية', working_capital: 'رأس المال العامل' };

export function AIPage() {
  const { eng, period, Selector, engagement } = useScope(); const { can } = useAuth(); const { run, busy } = useAction(); const [confirm, setConfirm] = useState(false);
  const { data: status } = useLoad(() => get<Status>('/ai/status'), []);
  const { data, loading, reload } = useLoad(() => period ? get<{ analysis: { result: Analysis; started_at: string } | null }>(`/ai/latest?period_id=${period}`) : Promise.resolve(null), [period]);
  const { data: reqs, reload: reloadReqs } = useLoad(() => eng ? get<{ requests: Record<string, string | number | null>[] }>(`/ai/requests?engagement_id=${eng}`) : Promise.resolve(null), [eng, data]);
  const analyze = async () => { setConfirm(false); const r = await run(() => post('/ai/analyze', { engagement_id: eng, period_id: period, confirm_external_transfer: true }), 'اكتمل التحليل الذكي وحُفظت الملاحظات للمراجعة'); if (r) { reload(); reloadReqs(); } };
  const a = data?.analysis?.result;
  return <Page title="المحاسب الذكي" sub="تحليل تفسيري يعتمد حصريًا على نتائج المحرك الحسابي. المخرجات تُتحقق من مخطط ثابت وتُفحص أرقامها مقابل البيانات المدخلة، وتُحفظ كملاحظات تتطلب مراجعة بشرية."
    actions={eng && period && can('ai.run') && <button className="btn" onClick={() => setConfirm(true)} disabled={busy || !status?.authorized}>{busy ? <Spinner /> : 'تشغيل التحليل الذكي'}</button>}>
    <div className={`alert ${status?.authorized ? 'ok' : 'warn'}`}>{!status ? '…' : status.authorized ? <>الخدمة مفعّلة: المزوّد {status.provider} ({status.model}). {status.share_client_names ? 'تُرسل أسماء العملاء' : 'تُخفى أسماء العملاء قبل الإرسال'}.</> : <>الخدمة غير متاحة: {status.reason} — كل الوظائف المحاسبية الحتمية (الفحوصات والقوائم والنسب والتقارير) تعمل بدون الذكاء الاصطناعي.</>}</div>
    <Selector />
    {!eng || !period ? <Empty text="اختر الارتباط والفترة" /> : loading ? <Spinner /> : !a ? <div className="card"><Empty text="لم يُجرَ تحليل ذكي لهذه الفترة" /><p className="muted" style={{ textAlign: 'center' }}>المتطلبات: فحص ميزان المراجعة + توليد القوائم المالية أولًا.</p></div> : <>
      <div className="muted">آخر تحليل: {fmtDate(data!.analysis!.started_at, { time: true })} | النموذج: {a._verification.model}</div>
      {a._verification.unverified_numbers.length > 0 && <div className="alert danger">تنبيه: وردت أرقام في نص المساعد لم يُعثر عليها في البيانات المدخلة ({a._verification.unverified_numbers.length}). راجعها قبل الاعتماد: {a._verification.unverified_numbers.slice(0, 8).join('؛ ')}</div>}
      <div className="grid c2"><div className="card"><h2>الملخص التنفيذي</h2><p style={{ whiteSpace: 'pre-wrap' }}>{a.executive_summary_ar}</p></div>
        <div className="card"><h2>تقييم المخاطر</h2><table className="t"><tbody>{Object.entries(a.risk_assessment).map(([k, v]) => <tr key={k}><td><b>{RISK[k] ?? k}</b></td><td><span className={`badge ${v.level === 'high' ? 'danger' : v.level === 'medium' ? 'warn' : v.level === 'low' ? 'ok' : 'neutral'}`}>{LV[v.level]}</span></td><td className="muted">{v.rationale}</td></tr>)}</tbody></table></div></div>
      <div className="card"><h2>التعليق المالي التحليلي</h2><p style={{ whiteSpace: 'pre-wrap' }}>{a.financial_commentary_ar}</p></div>
      <div className="card"><h2>الملاحظات ({a.observations.length})</h2>{a.observations.map((o, i) => <div key={i} className={`finding ${o.severity}`}><div className="title">{o.title} <Sev s={o.severity} /><span className="badge neutral">ثقة: {LV[o.confidence]}</span>{o.fs_line_or_account && <span className="chip">{o.fs_line_or_account}</span>}{o.amount_quoted && <span className="chip mono">{o.amount_quoted}</span>}</div><div className="desc">{o.explanation}</div>{o.potential_impact && <div className="muted">الأثر: {o.potential_impact}</div>}{o.recommendation && <div className="muted">التوصية: {o.recommendation}</div>}<div className="muted">الأدلة: {o.evidence_refs.join('، ')}</div></div>)}</div>
      <div className="grid c2"><div className="card"><h2>أسئلة للإدارة</h2><ol>{a.management_questions.map((q, i) => <li key={i}>{q}</li>)}</ol></div><div className="card"><h2>مستندات مطلوبة</h2><ul>{a.documents_needed.map((q, i) => <li key={i}>{q}</li>)}</ul></div>
        <div className="card"><h2>قائمة مراجعة المحاسب</h2><ul>{a.review_checklist.map((q, i) => <li key={i}>{q}</li>)}</ul></div><div className="card"><h2>حدود التحليل</h2><ul>{a.limitations.map((q, i) => <li key={i}>{q}</li>)}</ul></div></div>
    </>}
    {reqs && reqs.requests.length > 0 && <div className="card"><h2>سجل طلبات الذكاء الاصطناعي</h2><table className="t"><thead><tr><th>الغرض</th><th>المزوّد/النموذج</th><th>الحالة</th><th>الرموز (دخل/خرج)</th><th>بواسطة</th><th>الوقت</th></tr></thead><tbody>{reqs.requests.map((r) => <tr key={String(r.id)}><td>{r.purpose}</td><td className="mono">{r.provider}/{r.model ?? '—'}</td><td>{r.status}{r.error_message && <div className="muted" style={{ color: 'var(--danger)' }}>{r.error_message}</div>}</td><td className="num">{r.input_tokens ?? '—'}/{r.output_tokens ?? '—'}</td><td>{r.created_by_name}</td><td>{fmtDate(String(r.created_at), { time: true })}</td></tr>)}</tbody></table></div>}
    {confirm && <Modal title="تأكيد إرسال البيانات لمزوّد خارجي" onClose={() => setConfirm(false)}><p>سيتم إرسال ملخص البيانات المالية المهيكلة للفترة المحددة ({engagement?.client_name}) إلى مزوّد الذكاء الاصطناعي ({status?.provider}). {status?.share_client_names ? 'سيتضمن الإرسال اسم العميل.' : 'سيُستبدل اسم العميل بوسم عام.'} لا تُستخدم البيانات للتدريب افتراضيًا. يُسجل الإجراء في سجل التدقيق.</p><div className="row end"><button className="btn sec" onClick={() => setConfirm(false)}>إلغاء</button><button className="btn" onClick={analyze}>أؤكد الإرسال والتحليل</button></div></Modal>}
  </Page>;
}
