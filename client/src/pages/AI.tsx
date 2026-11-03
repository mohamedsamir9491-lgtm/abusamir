import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { Page, useLoad, Spinner, Empty, useAction, Sev, Modal } from '../components/ui';
import { useScope } from '../components/Scope';
import { fmtDate } from '../format';
import { useAuth } from '../auth';

interface Status { provider: string; available: boolean; authorized: boolean; reason: string | null; share_client_names: boolean; model: string | null }
interface Analysis { executive_summary_ar: string; financial_commentary_ar: string; risk_assessment: Record<string, { level: string; rationale: string }>; observations: { title: string; category: string; severity: string; fs_line_or_account: string | null; amount_quoted: string | null; evidence_refs: string[]; explanation: string; potential_impact: string | null; recommendation: string | null; confidence: string }[]; management_questions: string[]; documents_needed: string[]; review_checklist: string[]; limitations: string[]; _verification: { unverified_numbers: string[]; model: string; generated_at: string } }
const LV: Record<string, string> = { low: 'منخفض', medium: 'متوسط', high: 'مرتفع', unknown: 'غير محدد' };
const RISK: Record<string, string> = { liquidity: 'السيولة', profitability: 'الربحية', leverage: 'المديونية', working_capital: 'رأس المال العامل' };

interface ChatMsg { role: 'user' | 'assistant'; text: string[]; table?: { columns: string[]; rows: (string | number)[][] }; sources?: string[]; suggestions?: string[]; company?: string; engine?: string; unverified?: string[] }
const STARTERS = ['ملخص وضع الشركة', 'كم إجمالي الأصول؟', 'لماذا الخسارة؟', 'أكبر 5 مصروفات', 'ما الملاحظات الحرجة؟', 'كم نسبة التداول؟', 'ما المستندات المطلوبة؟', 'حقوق الملكية الموحدة للمجموعة', 'اشرح IFRS 16 عقود الإيجار'];

export function AIPage() {
  const { eng, period, Selector, engagement } = useScope(); const { can } = useAuth(); const { run, busy } = useAction(); const [confirm, setConfirm] = useState<null | 'analysis' | 'chat'>(null);
  const [tab, setTab] = useState<'chat' | 'analysis'>('chat');
  const { data: status } = useLoad(() => get<Status>('/ai/status'), []);
  const { data, loading, reload } = useLoad(() => period ? get<{ analysis: { result: Analysis & { _verification: { engine?: string } }; started_at: string } | null }>(`/ai/latest?period_id=${period}`) : Promise.resolve(null), [period]);
  const { data: reqs, reload: reloadReqs } = useLoad(() => eng ? get<{ requests: Record<string, string | number | null>[] }>(`/ai/requests?engagement_id=${eng}`) : Promise.resolve(null), [eng, data]);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]); const [input, setInput] = useState(''); const [useExternal, setUseExternal] = useState(false); const [sending, setSending] = useState(false);
  useEffect(() => { setMsgs([]); }, [eng, period]);
  useEffect(() => { const el = document.getElementById('chat-end'); el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [msgs]);
  const analyze = async (engine: 'local' | 'external') => { setConfirm(null); const r = await run(() => post('/ai/analyze', { engagement_id: eng, period_id: period, engine, confirm_external_transfer: engine === 'external' ? true : undefined }), engine === 'local' ? 'اكتمل التحليل المحلي وحُفظت الملاحظات للمراجعة' : 'اكتمل التحليل عبر المزوّد الخارجي'); if (r) { reload(); reloadReqs(); setTab('analysis'); } };
  const send = async (text?: string, external = useExternal) => {
    const m = (text ?? input).trim(); if (!m || sending) return; if (external && confirm !== 'chat') { setConfirm('chat'); return; }
    setConfirm(null); setInput(''); setMsgs((x) => [...x, { role: 'user', text: [m] }]); setSending(true);
    try { const r = await post<{ engine: string; text?: string[]; answer?: string; table?: ChatMsg['table']; sources?: string[]; suggestions?: string[]; company?: string; unverified_numbers?: string[] }>('/ai/chat', { engagement_id: eng, period_id: period, message: m, engine: external ? 'external' : 'local', confirm_external_transfer: external ? true : undefined });
      setMsgs((x) => [...x, { role: 'assistant', text: r.text ?? (r.answer ? r.answer.split('\n') : []), table: r.table, sources: r.sources, suggestions: r.suggestions, company: r.company, engine: r.engine, unverified: r.unverified_numbers }]);
    } catch (e) { setMsgs((x) => [...x, { role: 'assistant', text: [`تعذر الرد: ${(e as Error).message}`] }]); } finally { setSending(false); }
  };
  const a = data?.analysis?.result; const local = a?._verification?.engine === 'local';
  return <Page title="المحاسب الذكي" sub="يعمل محليًا بالكامل داخل البرنامج: تحليل قائم على قواعد وإجراءات محاسبية، ومحادثة تجيب من بيانات الميزان والقوائم والملاحظات والبيانات النظامية ومن المعرفة المحاسبية، مع مصدر كل رقم. لا تُرسل بيانات لأي جهة خارجية."
    actions={eng && period && can('ai.run') && <div className="row"><button className="btn" onClick={() => analyze('local')} disabled={busy}>{busy ? <Spinner /> : 'تشغيل التحليل المحلي'}</button>{status?.authorized && <button className="btn sec" onClick={() => setConfirm('analysis')} disabled={busy}>تحليل عبر المزوّد الخارجي</button>}</div>}>
    <div className="alert ok">المحرك المحلي مفعّل ويعمل دون أي اتصال خارجي. {status && (status.authorized ? <>المزوّد الخارجي ({status.provider}) مفعّل أيضًا ويُستخدم فقط عند اختياره صراحة.</> : <>المزوّد الخارجي غير مفعّل (جاهز للربط مستقبلًا من إعدادات الخادم).</>)}</div>
    <Selector />
    {!eng || !period ? <Empty text="اختر الارتباط والفترة" /> : <>
      <div className="tabs">{([['chat', 'المحادثة'], ['analysis', 'التحليل']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'chat' && <div className="card chat">
        <div className="chat-log">{!msgs.length && <div className="muted">اسأل عن أرقام {engagement?.client_name ?? 'الشركة'} أو عن أي مفهوم محاسبي. أمثلة:</div>}
          {!msgs.length && <div className="row" style={{ flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>{STARTERS.map((q) => <button key={q} className="chip-btn" onClick={() => send(q, false)}>{q}</button>)}</div>}
          {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.role === 'assistant' && m.company && <div className="muted" style={{ fontSize: 11.5 }}>{m.engine === 'external' ? 'مزوّد خارجي' : 'محلي'} | {m.company}</div>}
            {m.text.map((t, j) => <p key={j} style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{t}</p>)}
            {m.table && <div className="tscroll" style={{ maxHeight: 'none', margin: '6px 0' }}><table className="t ruled compact"><thead><tr>{m.table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{m.table.rows.map((r, j) => <tr key={j}>{r.map((v, k) => <td key={k} className={/^[\d(),.\-−%×]+$/.test(String(v)) && k > 0 ? 'num' : 'wrap'}>{v}</td>)}</tr>)}</tbody></table></div>}
            {m.unverified && m.unverified.length > 0 && <div className="alert danger">أرقام في الرد غير موجودة في البيانات: {m.unverified.join('، ')}</div>}
            {m.sources && m.sources.length > 0 && <div className="muted" style={{ fontSize: 11.5 }}>المصدر: {m.sources.join('؛ ')}</div>}
            {m.suggestions && m.suggestions.length > 0 && <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{m.suggestions.map((q) => <button key={q} className="chip-btn" onClick={() => send(q, false)}>{q}</button>)}</div>}</div>)}
          {sending && <div className="msg assistant"><Spinner /></div>}<div id="chat-end" /></div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); send(); }} style={{ marginTop: 8 }}><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="اكتب سؤالك… مثال: كم رصيد بنك ساب؟ أو قارن جراند بيونيسكوب" style={{ flex: 1 }} /><button className="btn" disabled={sending || !input.trim()}>إرسال</button>
          {status?.authorized && <label className="row" style={{ gap: 4 }}><input type="checkbox" style={{ width: 'auto' }} checked={useExternal} onChange={(e) => setUseExternal(e.target.checked)} /> عبر المزوّد الخارجي</label>}</form>
      </div>}
      {tab === 'analysis' && (loading ? <Spinner /> : !a ? <div className="card"><Empty text="لم يُجرَ تحليل لهذه الفترة بعد" /><p className="muted" style={{ textAlign: 'center' }}>اضغط «تشغيل التحليل المحلي»؛ يعمل مباشرة على الميزان المعتمد.</p></div> : <>
        <div className="muted">آخر تحليل: {fmtDate(data!.analysis!.started_at, { time: true })} | {local ? 'المحرك المحلي (قواعد وإجراءات محاسبية؛ كل الأرقام من بيانات البرنامج)' : `المزوّد الخارجي: ${a._verification.model}`}</div>
        {a._verification.unverified_numbers.length > 0 && <div className="alert danger">تنبيه: وردت أرقام لم يُعثر عليها في البيانات المدخلة ({a._verification.unverified_numbers.length}): {a._verification.unverified_numbers.slice(0, 8).join('؛ ')}</div>}
        <div className="grid c2"><div className="card"><h2>الملخص التنفيذي</h2><p style={{ whiteSpace: 'pre-wrap' }}>{a.executive_summary_ar}</p></div>
          <div className="card"><h2>تقييم المخاطر</h2><table className="t ruled"><tbody>{Object.entries(a.risk_assessment).map(([k, v]) => <tr key={k}><td><b>{RISK[k] ?? k}</b></td><td><span className={`badge ${v.level === 'high' ? 'danger' : v.level === 'medium' ? 'warn' : v.level === 'low' ? 'ok' : 'neutral'}`}>{LV[v.level]}</span></td><td className="muted wrap">{v.rationale}</td></tr>)}</tbody></table></div></div>
        <div className="card"><h2>التعليق المالي التحليلي</h2>{a.financial_commentary_ar.split('\n\n').map((p, i) => <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{p}</p>)}</div>
        <div className="card"><h2>نتائج الإجراءات التحليلية ({a.observations.length})</h2>{!a.observations.length && <div className="alert ok">لم تُظهر الإجراءات التحليلية مسائل إضافية على ما في الملاحظات.</div>}{a.observations.map((o, i) => <div key={i} className={`finding ${o.severity}`}><div className="title">{o.title} <Sev s={o.severity} />{o.evidence_refs?.[0] && <span className="muted">{o.evidence_refs[0]}</span>}</div><div className="desc">{o.explanation}</div>{o.recommendation && <div className="muted">الإجراء: {o.recommendation}</div>}</div>)}
          <p className="muted">تُحفظ هذه النتائج كملاحظات (LA-) في شاشة الملاحظات وتظهر في التقرير بعد مراجعتك.</p></div>
        <div className="grid c2"><div className="card"><h2>أسئلة للإدارة</h2><ol>{a.management_questions.map((q, i) => <li key={i}>{q}</li>)}</ol></div><div className="card"><h2>مستندات مطلوبة</h2><ul>{a.documents_needed.map((q, i) => <li key={i}>{q}</li>)}</ul></div>
          <div className="card"><h2>قائمة مراجعة المحاسب</h2><ul>{a.review_checklist.map((q, i) => <li key={i}>{q}</li>)}</ul></div><div className="card"><h2>حدود التحليل</h2><ul>{a.limitations.map((q, i) => <li key={i}>{q}</li>)}</ul></div></div>
      </>)}
    </>}
    {reqs && reqs.requests.length > 0 && <div className="card"><h2>سجل طلبات المزوّد الخارجي</h2><table className="t ruled"><thead><tr><th>الغرض</th><th>المزوّد/النموذج</th><th>الحالة</th><th>بواسطة</th><th>الوقت</th></tr></thead><tbody>{reqs.requests.map((r) => <tr key={String(r.id)}><td>{r.purpose}</td><td>{r.provider} {r.model ?? ''}</td><td>{r.status}</td><td>{r.created_by_name}</td><td>{fmtDate(String(r.created_at), { time: true })}</td></tr>)}</tbody></table></div>}
    {confirm && <Modal title="تأكيد إرسال البيانات لمزوّد خارجي" onClose={() => setConfirm(null)}><p>سيتم إرسال ملخص البيانات المالية المهيكلة للفترة المحددة ({engagement?.client_name}) إلى المزوّد الخارجي ({status?.provider}). {status?.share_client_names ? 'سيتضمن الإرسال اسم العميل.' : 'سيُخفى اسم العميل.'} هل تؤكد؟</p><div className="row end"><button className="btn sec" onClick={() => setConfirm(null)}>إلغاء</button><button className="btn" onClick={() => (confirm === 'analysis' ? analyze('external') : send(undefined, true))}>تأكيد الإرسال</button></div></Modal>}
  </Page>;
}
