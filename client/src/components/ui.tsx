import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Check, Paperclip } from 'lucide-react';
import { Icon, pageIcon } from './nav';
import { fmtMoney, SEVERITY } from '../format';

// ---------- Toast ----------
const ToastCtx = createContext<{ show: (msg: string, err?: boolean) => void }>({ show: () => undefined });
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; err: boolean }[]>([]);
  const show = useCallback((msg: string, err = false) => { const id = Date.now() + Math.random(); setItems((x) => [...x, { id, msg, err }]); setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), err ? 7000 : 3500); }, []);
  return <ToastCtx.Provider value={{ show }}>{children}<div className="toast">{items.map((i) => <div key={i.id} className={i.err ? 'err' : ''}>{i.msg}</div>)}</div></ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

/** تنفيذ إجراء مع عرض الخطأ كتنبيه */
export function useAction() {
  const { show } = useToast(); const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => { setBusy(true); try { const r = await fn(); if (okMsg) show(okMsg); return r; } catch (e) { show((e as Error).message, true); return undefined; } finally { setBusy(false); } };
  return { run, busy };
}

// ---------- Data loading ----------
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [tick, setTick] = useState(0);
  useEffect(() => { let alive = true; setLoading(true); fn().then((d) => { if (alive) { setData(d); setError(null); } }).catch((e) => alive && setError((e as Error).message)).finally(() => alive && setLoading(false)); return () => { alive = false; }; }, [...deps, tick]); // eslint-disable-line
  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

export const Spinner = () => <span className="spinner" />;
export const Empty = ({ text = 'لا توجد بيانات' }: { text?: string }) => <div className="empty">{text}</div>;
export function Page({ title, sub, actions, children, icon }: { title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode; icon?: string }) {
  const loc = useLocation(); const ic = icon ?? pageIcon(loc.pathname);
  return <><div className="topbar">{ic && <div className="pic"><Icon n={ic} size={23} /></div>}<div className="ttl"><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>{actions && <div className="acts">{actions}</div>}</div>{children}</>;
}
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-bg" onClick={onClose}><div className={`modal${wide ? ' wide' : ''}`} onClick={(e) => e.stopPropagation()}><div className="row between" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>{title}</h2><button className="iconbtn" onClick={onClose} aria-label="إغلاق" title="إغلاق"><X size={18} /></button></div>{children}</div></div>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <div className="field"><label>{label}</label>{children}{hint && <span className="muted">{hint}</span>}</div>; }
export const Money = ({ v, d = 2 }: { v: string | number | null | undefined; d?: number }) => <span className="mono" style={{ color: Number(v) < 0 ? 'var(--danger)' : undefined }}>{fmtMoney(v, d)}</span>;
export const Sev = ({ s }: { s: string }) => <span className={`badge ${s}`}>{SEVERITY[s] ?? s}</span>;
export const Badge = ({ k, map, tone }: { k: string; map?: Record<string, string>; tone?: string }) => <span className={`badge ${tone ?? 'neutral'}`}>{map?.[k] ?? k}</span>;
export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return <div className="tabs">{tabs.map((t) => <button key={t.key} className={active === t.key ? 'active' : ''} onClick={() => onChange(t.key)}>{t.label}</button>)}</div>;
}
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return <div className="steps">{steps.map((s, i) => <div key={s} className={`s ${i < current ? 'done' : i === current ? 'cur' : ''}`}><span className="n">{i < current ? <Check size={13} strokeWidth={2.4} /> : i + 1}</span>{s}</div>)}</div>;
}
/** اختيار ملف بواجهة عربية موحدة (بدل نص المتصفح الافتراضي) */
export function FileInput({ onFiles, multiple, accept, inputRef, label = 'اختر الملف', required }: { onFiles?: (f: FileList | null) => void; multiple?: boolean; accept?: string; inputRef?: React.Ref<HTMLInputElement>; label?: string; required?: boolean }) {
  const [names, setNames] = useState<string>('');
  return <label className="file-pick"><input type="file" ref={inputRef} multiple={multiple} accept={accept} required={required} onChange={(e) => { const f = e.target.files; setNames(f && f.length ? [...f].map((x) => x.name).join('، ') : ''); onFiles?.(f); }} />
    <span className="btn sec sm"><Paperclip size={15} /> {multiple ? 'اختر الملفات' : label}</span><span className="fn">{names || 'لم يُختر ملف'}</span></label>;
}
/** مراحل العمل: نقاط متصلة؛ المرحلة الحالية = أول مرحلة غير مكتملة */
export function Stepper({ items }: { items: { label: string; done: boolean }[] }) {
  const cur = items.findIndex((i) => !i.done);
  return <div className="stepper">{items.map((it, i) => <div key={it.label} className={`st ${it.done ? 'done' : i === cur ? 'cur' : ''}`}><span className="dot">{it.done ? <Check size={13} strokeWidth={2.6} /> : i + 1}</span><span className="lb">{it.label}</span></div>)}</div>;
}
/** زر حذف/إجراء خطر بتأكيد صريح؛ يستخدم في كل الشاشات لتوحيد السلوك */
export function DangerButton({ label = 'حذف', text, onConfirm, small = true, disabled }: { label?: string; text: string; onConfirm: () => Promise<unknown> | void; small?: boolean; disabled?: boolean }) {
  return <button className={`btn danger-outline${small ? ' sm' : ''}`} disabled={disabled} onClick={async (e) => { e.stopPropagation(); if (!confirm(text)) return; await onConfirm(); }}>{label}</button>;
}
export function Confirm({ text, onYes, onNo, danger }: { text: ReactNode; onYes: () => void; onNo: () => void; danger?: boolean }) {
  return <Modal title="تأكيد الإجراء" onClose={onNo}><div style={{ marginBottom: 14 }}>{text}</div><div className="row end"><button className="btn sec" onClick={onNo}>إلغاء</button><button className={`btn ${danger ? 'danger' : ''}`} onClick={onYes}>تأكيد</button></div></Modal>;
}
