import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Building2, BriefcaseBusiness, ReceiptText, FileText, CornerDownLeft, Bell, X } from 'lucide-react';
import { get } from '../api';
import { useAuth } from '../auth';
import { NAV, Icon } from './nav';
import { matches } from '../text';

type Result = { kind: string; id: string; title: string; sub: string; engagement_id?: string; child?: boolean; to?: string; icon?: string };
const KIND_LABEL: Record<string, string> = { screen: 'الشاشات', client: 'العملاء والشركات', engagement: 'الارتباطات', claim: 'المطالبات', document: 'المستندات' };

/** البحث الشامل: Ctrl+K أو / من أي شاشة */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState<Result[]>([]); const [hi, setHi] = useState(0); const nav = useNavigate(); const { can } = useAuth(); const t = useRef<number | undefined>(undefined);
  useEffect(() => { if (!open) { setQ(''); setRes([]); } }, [open]);
  useEffect(() => {
    const screens: Result[] = NAV.flatMap((g) => g.items.filter(([, , p]) => can(p)).map(([to, label, , ic]) => ({ kind: 'screen', id: to, title: label, sub: g.title, to, icon: ic }))).filter((s) => matches(`${s.title} ${s.sub}`, q)).slice(0, q ? 6 : 8);
    window.clearTimeout(t.current);
    if (!q.trim()) { setRes(screens); return; }
    t.current = window.setTimeout(() => { get<{ results: Result[] }>(`/practice/search?q=${encodeURIComponent(q)}`).then((r) => setRes([...r.results, ...screens])).catch(() => setRes(screens)); }, 160);
  }, [q, open]); // eslint-disable-line
  useEffect(() => { setHi(0); }, [res]);
  if (!open) return null;
  const go = (r: Result) => { onClose();
    if (r.kind === 'screen') nav(r.to!); else if (r.kind === 'client') nav(`/clients/${r.id}`); else if (r.kind === 'engagement') nav(`/engagements/${r.id}`);
    else if (r.kind === 'claim') nav(`/finance/claims?q=${encodeURIComponent(r.title)}`); else if (r.kind === 'document' && r.engagement_id) nav(`/engagements/${r.engagement_id}`); };
  const icon = (r: Result) => r.kind === 'screen' ? <Icon n={r.icon ?? 'file'} size={16} /> : r.kind === 'client' ? (r.child ? <CornerDownLeft size={15} /> : <Building2 size={16} />) : r.kind === 'engagement' ? <BriefcaseBusiness size={16} /> : r.kind === 'claim' ? <ReceiptText size={16} /> : <FileText size={16} />;
  return <div className="pal-bg" onClick={onClose}><div className="pal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="البحث الشامل">
    <div className="sw-search"><Search size={17} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن عميل أو سجل تجاري أو ارتباط أو مطالبة أو شاشة…"
      onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(res.length - 1, h + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); } if (e.key === 'Enter' && res[hi]) go(res[hi]); if (e.key === 'Escape') onClose(); }} /><kbd>Esc</kbd></div>
    <div className="sw-list">{!res.length && <div className="sw-empty">{q ? `لا نتائج لـ «${q}»` : 'ابدأ الكتابة…'}</div>}
      {res.map((r, i) => <div key={`${r.kind}-${r.id}-${i}`}>{(i === 0 || res[i - 1].kind !== r.kind) && <div className="sw-grp">{KIND_LABEL[r.kind] ?? r.kind}</div>}
        <button className={`sw-item${r.child ? ' child' : ''}${i === hi ? ' hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => go(r)}>{icon(r)}<span className="t"><b>{r.title}</b><small>{r.sub}</small></span></button></div>)}</div>
    <div className="sw-foot"><span><kbd>↑↓</kbd> تنقل</span><span><kbd>Enter</kbd> فتح</span><span>البحث لا يفرّق بين أ/ا، ى/ي، ة/ه، ١/1</span></div>
  </div></div>;
}

type Note = { tone: string; icon: string; title: string; sub: string; link: string };
/** التنبيهات: تُحسب محليًا (مطالبات متأخرة، خطابات لم توقّع، مهام قريبة، طلبات أساسية) */
export function NotificationsBell() {
  const [open, setOpen] = useState(false); const [data, setData] = useState<{ items: Note[]; count: number } | null>(null); const nav = useNavigate();
  const load = () => get<{ items: Note[]; count: number }>('/practice/notifications').then(setData).catch(() => setData(null));
  useEffect(() => { load(); const id = window.setInterval(load, 120000); return () => window.clearInterval(id); }, []);
  return <div className="bell"><button className="iconbtn" title="التنبيهات" onClick={() => { setOpen((o) => !o); load(); }}><Bell size={17} />{!!data?.count && <em>{data.count > 9 ? '9+' : data.count}</em>}</button>
    {open && <><div className="sw-scrim" onClick={() => setOpen(false)} /><div className="bell-pop"><div className="row between" style={{ padding: '4px 6px 8px' }}><b>التنبيهات</b><button className="iconbtn sm" onClick={() => setOpen(false)}><X size={15} /></button></div>
      {!data?.items.length ? <div className="sw-empty">لا توجد تنبيهات</div> : data.items.map((n, i) => <button key={i} className="note-item" onClick={() => { setOpen(false); nav(n.link); }}><span className={`ni-ic ${n.tone}`}><Icon n={n.icon === 'hourglass' ? 'aging' : n.icon === 'receipt' ? 'claims' : n.icon === 'letter' ? 'letter' : n.icon === 'calendar' ? 'tasks' : 'requests'} size={16} /></span><span className="t"><b>{n.title}</b><small>{n.sub}</small></span></button>)}
    </div></>}</div>;
}
