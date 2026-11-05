/** مساعد سهم الذكي: شريط طويل في الأعلى → نافذة محادثة منبثقة (كتابة أو صوت)، يجيب محليًا من بيانات البرنامج */
import { useEffect, useRef, useState } from 'react';
import { Mic, Send, X, Volume2, VolumeX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { post } from '../api';
import { useScope } from './Scope';

type Ans = { scope: string; intent: string; company: string; period: string; text: string[]; table?: { columns: string[]; rows: (string | number)[][] }; sources: string[]; suggestions: string[]; links?: { label: string; href: string }[] };
type Msg = { who: 'me' | 'bot'; text: string; table?: Ans['table']; sources?: string[]; links?: Ans['links'] };
const FIRST = ['كم المستحق على العملاء؟', 'كم حصلنا هذا العام؟', 'ما الإيراد المكتسب؟', 'ما مواعيدي القادمة؟', 'ملخص المكتب', 'ما سعر ضريبة الدخل على الشركات؟'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

export function AssistantBar({ onOpen }: { onOpen: () => void }) {
  return <button type="button" className="ai-bar" onClick={onOpen} aria-label="افتح مساعد سهم الذكي">
    <span className="ai-in"><b>مساعد سهم AI</b>
      <svg className="spark" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M10 2l1.8 5.6L17.5 9.5l-5.7 1.9L10 17l-1.8-5.6L2.5 9.5l5.7-1.9zM19 13l.9 2.6 2.6.9-2.6.9L19 20l-.9-2.6-2.6-.9 2.6-.9z" /></svg>
      <span className="hint">اضغط وتحدث معي أو اكتب سؤالك</span><span className="eq" aria-hidden="true"><i /><i /><i /><i /><i /></span></span></button>;
}

export function Assistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { eng, period, engagement } = useScope();
  const [msgs, setMsgs] = useState<Msg[]>([{ who: 'bot', text: 'أهلًا، أنا مساعد سهم. اسألني عن المستحقات أو التحصيل أو الإيرادات أو المواعيد أو أي عميل بالاسم. ولأسئلة القوائم والحسابات اختر الارتباط من الشريط العلوي.' }]);
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [listen, setListen] = useState(false); const [sugs, setSugs] = useState(FIRST);
  const [voice, setVoice] = useState(() => { try { return localStorage.getItem('ai-voice') !== 'off'; } catch { return true; } });
  const log = useRef<HTMLDivElement>(null); const inp = useRef<HTMLInputElement>(null); const rec = useRef<{ stop: () => void } | null>(null); const spoke = useRef(false);
  useEffect(() => { log.current?.scrollTo({ top: 1e6, behavior: 'smooth' }); }, [msgs, busy]);
  useEffect(() => { if (open) setTimeout(() => inp.current?.focus(), 250); else { try { speechSynthesis.cancel(); } catch { /* ignore */ } rec.current?.stop(); } }, [open]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (open && e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open, onClose]);
  const speak = (t: string) => { if (!voice) return; try { const u = new SpeechSynthesisUtterance(t.replace(/CL-\d{4}-(\d+)/g, 'رقم $1')); u.lang = 'ar-SA'; u.rate = 1.02; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* ignore */ } };
  const ask = async (text: string) => {
    const m = text.trim(); if (!m || busy) return; setQ(''); setMsgs((x) => [...x, { who: 'me', text: m }]); setBusy(true);
    try { const r = await post<Ans>('/ai/assistant', { message: m, engagement_id: eng || null, period_id: period || null });
      const t = r.text.join('\n'); setMsgs((x) => [...x, { who: 'bot', text: t, table: r.table, sources: r.sources, links: r.links }]); if (r.suggestions?.length) setSugs(r.suggestions.slice(0, 6));
      if (spoke.current) { speak(r.text.slice(0, 3).join('. ')); spoke.current = false; } }
    catch (e) { setMsgs((x) => [...x, { who: 'bot', text: `تعذر الرد: ${(e as Error).message}` }]); }
    finally { setBusy(false); }
  };
  const mic = () => {
    if (listen) { rec.current?.stop(); return; }
    if (!SR) { setMsgs((x) => [...x, { who: 'bot', text: 'المتصفح الحالي لا يدعم الإدخال الصوتي. استخدم Chrome أو Safari الحديث، أو اكتب سؤالك.' }]); return; }
    try { const r = new SR(); r.lang = 'ar-SA'; r.interimResults = true; r.maxAlternatives = 1; let final = '';
      r.onresult = (e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => { const last = e.results[e.results.length - 1]; setQ(last[0].transcript); if (last.isFinal) final = last[0].transcript; };
      r.onerror = (e: { error: string }) => { setListen(false); if (e.error === 'not-allowed') setMsgs((x) => [...x, { who: 'bot', text: 'لم يُسمح باستخدام الميكروفون. اسمح للمتصفح بالوصول إليه من إعدادات الموقع ثم أعد المحاولة.' }]); };
      r.onend = () => { setListen(false); rec.current = null; if (final) { spoke.current = true; ask(final); } };
      rec.current = r; r.start(); setListen(true); } catch { setListen(false); }
  };
  const toggleVoice = () => { const v = !voice; setVoice(v); try { localStorage.setItem('ai-voice', v ? 'on' : 'off'); } catch { /* ignore */ } if (!v) try { speechSynthesis.cancel(); } catch { /* ignore */ } };
  if (!open) return null;
  return <><div className="ai-veil" onClick={onClose} /><div className="ai-pop" role="dialog" aria-label="مساعد سهم الذكي">
    <div className="ai-head"><div className={`siri${busy || listen ? ' busy' : ''}`} aria-hidden="true"><i /><i /><i /><b /></div>
      <div className="tt"><b>مساعد سهم الذكي</b><span>{listen ? 'أستمع إليك…' : busy ? 'أراجع الأرقام…' : engagement ? `جاهز · المكتب + ${engagement.client_name}` : 'جاهز · يقرأ بيانات المكتب محليًا'}</span></div>
      <button type="button" className="ai-x" onClick={toggleVoice} title={voice ? 'إيقاف قراءة الردود بالصوت' : 'قراءة الردود بالصوت'}>{voice ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
      <button type="button" className="ai-x" onClick={onClose} aria-label="إغلاق"><X size={18} /></button></div>
    <div className="ai-log" ref={log}>{msgs.map((m, i) => <div key={i} className={`ai-m ${m.who}`}><div>{m.text}</div>
      {m.table && <div className="ai-tbl"><table className="t compact"><thead><tr>{m.table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{m.table.rows.slice(0, 12).map((r, j) => <tr key={j}>{r.map((v, k) => <td key={k} className={typeof v === 'number' || /^[\d,.()\-%/]+$/.test(String(v)) ? 'num' : ''}>{v}</td>)}</tr>)}</tbody></table></div>}
      {m.links?.length ? <div className="ai-links">{m.links.map((l) => <Link key={l.href} to={l.href} onClick={onClose}>{l.label}</Link>)}</div>
        : m.sources?.length ? <small className="ai-src">المصدر: {m.sources.join('، ')}</small> : null}</div>)}
      {busy && <div className="ai-typing"><i /><i /><i /></div>}</div>
    <div className="ai-sugs">{sugs.map((s) => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}</div>
    <form className="ai-inp" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
      <button type="button" className={`rb mic${listen ? ' live' : ''}`} onClick={mic} aria-label="تحدث بالصوت"><Mic size={19} /></button>
      <input ref={inp} id="ai-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="اكتب سؤالك… مثلًا: كم حصلنا هذا العام؟" autoComplete="off" />
      <button type="submit" className="rb snd" aria-label="إرسال" disabled={busy}><Send size={19} /></button></form>
  </div></>;
}
