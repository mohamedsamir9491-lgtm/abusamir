import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, CalendarRange, ChevronDown, Search, CornerDownLeft, History, Check } from 'lucide-react';
import { matches } from '../text';
import { get } from '../api';
import { useLoad } from './ui';

type Row = Record<string, string | number | null>;
type Company = { id: string; name: string; periods: { id: string; start_date: string; end_date: string }[] };
interface ScopeValue { eng: string; period: string; engagement: Row | null; periods: Row[]; periodRow: Row | null; companies: Company[]; engagements: Row[]; scoped: boolean
  setEngagement: (id: string) => void; setPeriod: (id: string) => void; switchCompany: (id: string) => void; Selector: () => null }

/** الصفحات التي تعمل على ارتباط وفترة: يُطبَّق عليها سياق العمل المحفوظ تلقائيًا */
export const SCOPED = ['/upload', '/imports', '/official', '/requests', '/trial-balance', '/analysis', '/consolidation', '/valuation', '/findings', '/ai', '/reports'];
const KEY = 'work-context';
const load = (): { eng?: string; period?: string } => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } };
const save = (v: { eng?: string; period?: string }) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } };
const Ctx = createContext<ScopeValue | null>(null);

/** سياق العمل المشترك (العميل/الارتباط › الشركة › الفترة) يُختار مرة واحدة من الشريط العلوي ويبقى عبر الشاشات */
export function ScopeProvider({ children }: { children: ReactNode }) {
  const [sp, setSp] = useSearchParams(); const loc = useLocation(); const nav = useNavigate();
  const scoped = SCOPED.some((p) => loc.pathname === p || loc.pathname.startsWith(p + '/'));
  const engPath = /^\/engagements\/([0-9a-f-]{36})/.exec(loc.pathname)?.[1] ?? '';
  const [stored, setStored] = useState(load);
  const remember = (v: { eng?: string; period?: string }) => { save(v); if (v.eng !== stored.eng || v.period !== stored.period) setStored(v); };
  // الارتباط والفترة الفعّالان: من الرابط في الصفحات المرتبطة، ومن صفحة الارتباط، وإلا من السياق المحفوظ
  const eng = scoped ? (sp.get('engagement_id') ?? '') : engPath || (stored.eng ?? '');
  const period = scoped ? (sp.get('period_id') ?? '') : (stored.eng === eng ? stored.period ?? '' : '');
  useEffect(() => { if (scoped && !sp.get('engagement_id') && stored.eng) setSp((s) => { s.set('engagement_id', stored.eng!); if (stored.period) s.set('period_id', stored.period); return s; }, { replace: true }); }, [loc.pathname]); // eslint-disable-line
  const { data: engs } = useLoad(() => get<{ engagements: Row[] }>('/engagements'), []);
  const { data: det } = useLoad(() => eng ? get<{ engagement: Row; periods: Row[] }>(`/engagements/${eng}`).catch(() => null) : Promise.resolve(null), [eng]);
  useEffect(() => {
    if (!det || !det.periods.length || det.engagement.id !== eng) return;
    const valid = det.periods.some((p) => p.id === period);
    if (!valid) { const p = det.periods.find((x) => x.role === 'current') ?? det.periods[det.periods.length - 1];
      if (scoped) setSp((s) => { s.set('period_id', String(p.id)); return s; }, { replace: true }); else remember({ eng, period: String(p.id) }); }
  }, [det, period]); // eslint-disable-line
  useEffect(() => { if (eng && (scoped || engPath)) remember({ eng, period: period || (stored.eng === eng ? stored.period : undefined) }); }, [eng, period]); // eslint-disable-line
  const periodRow = det?.periods.find((p) => p.id === period) ?? null;
  const rootId = det ? String(det.engagement.group_engagement_id ?? det.engagement.id) : '';
  const { data: grp } = useLoad(() => rootId ? get<{ components: { id: string; client_name: string; entity_role?: string; periods: Company['periods'] }[] }>(`/engagements/${rootId}/components`).catch(() => null) : Promise.resolve(null), [rootId]);
  const { data: rootDet } = useLoad(() => rootId && det?.engagement.group_engagement_id ? get<{ engagement: Row; periods: Row[] }>(`/engagements/${rootId}`) : Promise.resolve(null), [rootId]);
  const companies: Company[] = useMemo(() => grp && grp.components.length ? [{ id: rootId, name: String((det?.engagement.group_engagement_id ? rootDet?.engagement.client_name : det?.engagement.client_name) ?? 'الشركة الأم') + ' (الأم)', periods: ((det?.engagement.group_engagement_id ? rootDet?.periods : det?.periods) ?? []).map((p) => ({ id: String(p.id), start_date: String(p.start_date).slice(0, 10), end_date: String(p.end_date).slice(0, 10) })) },
    ...grp.components.filter((c) => c.entity_role !== 'at_cost').map((c) => ({ id: c.id, name: c.client_name, periods: c.periods }))] : [], [grp, rootDet, det, rootId]);
  const apply = (e: string, p?: string) => {
    if (scoped) { setSp((s) => { if (e) s.set('engagement_id', e); else s.delete('engagement_id'); if (p) s.set('period_id', p); else s.delete('period_id'); return s; }); return; }
    remember({ eng: e, period: p }); if (engPath && e && e !== engPath) nav(`/engagements/${e}`);
  };
  const switchCompany = (toId: string) => { const to = companies.find((c) => c.id === toId); if (!to) return; const pr = periodRow ? to.periods.find((p) => p.start_date === String(periodRow.start_date).slice(0, 10) && p.end_date === String(periodRow.end_date).slice(0, 10)) : null; apply(toId, pr?.id); };
  const value: ScopeValue = { eng, period, engagement: det?.engagement ?? null, periods: det?.periods ?? [], periodRow, companies, engagements: engs?.engagements ?? [], scoped, setEngagement: (id) => apply(id), setPeriod: (id) => apply(eng, id), switchCompany, Selector: () => null };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** محدد الارتباط/الفترة المشترك: القيم من الشريط العلوي؛ Selector لم يعد يعرض شيئًا داخل الصفحات */
export function useScope() {
  const v = useContext(Ctx); if (!v) throw new Error('ScopeProvider missing');
  return { eng: v.eng, period: v.period, engagement: v.engagement, periods: v.periods, periodRow: v.periodRow, Selector: v.Selector };
}

const RECENT = 'recent-engagements';
const recent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT) ?? '[]'); } catch { return []; } };
const pushRecent = (id: string) => { try { localStorage.setItem(RECENT, JSON.stringify([id, ...recent().filter((x) => x !== id)].slice(0, 6))); } catch { /* ignore */ } };

/** قائمة الاختيار الذكية: بحث بالاسم أو السجل (بلا فرق بين أ/ا و١/1)، المجموعات وشركاتها، الأخيرة، الفترة؛ تعمل بلوحة المفاتيح */
export function ContextBar() {
  const v = useContext(Ctx)!; const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [hi, setHi] = useState(0);
  const roots = v.engagements.filter((e) => !e.group_engagement_id);
  const kids = (id: unknown) => v.engagements.filter((e) => e.group_engagement_id === id);
  const label = (e: Row) => String(e.client_name ?? '');
  const items = useMemo(() => {
    const out: { id: string; title: string; sub: string; child?: boolean; recent?: boolean; badge?: string }[] = [];
    const add = (e: Row, child = false, rec = false) => out.push({ id: String(e.id), title: label(e), sub: child ? `${e.entity_role === 'at_cost' ? 'بالتكلفة' : 'تابعة'} | ضمن المجموعة` : String(e.title ?? ''), child, recent: rec, badge: !child && kids(e.id).length ? `${kids(e.id).length + 1} شركات` : e.is_demo ? 'تجريبي' : undefined });
    if (!q.trim()) {
      const rec = recent().map((id) => v.engagements.find((e) => e.id === id)).filter(Boolean) as Row[];
      rec.slice(0, 4).forEach((e) => add(e, !!e.group_engagement_id, true));
      roots.forEach((e) => { add(e); kids(e.id).filter((k) => k.entity_role !== 'at_cost').forEach((k) => add(k, true)); });
    } else {
      roots.forEach((e) => { const ks = kids(e.id); const hitRoot = matches(`${e.client_name} ${e.title}`, q); const hitKids = ks.filter((k) => matches(`${k.client_name}`, q));
        if (hitRoot || hitKids.length) { add(e); (hitRoot ? ks.filter((k) => k.entity_role !== 'at_cost') : hitKids).forEach((k) => add(k, true)); } });
    }
    return out;
  }, [q, v.engagements]); // eslint-disable-line
  useEffect(() => { setHi(0); }, [q, open]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  const choose = (id: string) => { pushRecent(id); const isKid = v.engagements.find((e) => e.id === id)?.group_engagement_id; if (isKid || v.companies.some((c) => c.id === id)) v.switchCompany(id); if (!v.companies.some((c) => c.id === id)) v.setEngagement(id); setOpen(false); setQ(''); };
  const cur = v.engagements.find((e) => e.id === v.eng);
  const company = v.companies.find((c) => c.id === v.eng)?.name ?? (cur ? label(cur) : '');
  return <div className="switcher">
    <button className={`sw-btn${open ? ' on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
      <Building2 size={16} /><b>{company.replace(/\s*\(الأم\)$/, '') || 'اختر العميل والارتباط'}</b>
      {v.periodRow && <span className="sw-per"><CalendarRange size={14} />{String(v.periodRow.label).replace(/^الفترة من /, '')}</span>}<ChevronDown size={15} /></button>
    {open && <><div className="sw-scrim" onClick={() => setOpen(false)} /><div className="sw-pop" role="dialog">
      <div className="sw-search"><Search size={16} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم العميل أو الشركة أو الارتباط…"
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(items.length - 1, h + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); } if (e.key === 'Enter' && items[hi]) choose(items[hi].id); }} /><kbd>Esc</kbd></div>
      <div className="sw-list">{!items.length && <div className="sw-empty">لا نتائج لـ «{q}»</div>}
        {items.map((it, i) => <div key={`${it.id}-${i}`}>{(i === 0 || items[i - 1].recent !== it.recent) && <div className="sw-grp">{it.recent ? 'الأخيرة' : q ? 'نتائج البحث' : 'كل العملاء والارتباطات'}</div>}
          <button className={`sw-item${it.child ? ' child' : ''}${i === hi ? ' hi' : ''}${it.id === v.eng ? ' cur' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => choose(it.id)}>
            {it.child ? <CornerDownLeft size={14} /> : it.recent ? <History size={15} /> : <Building2 size={16} />}<span className="t"><b>{it.title}</b><small>{it.sub}</small></span>{it.badge && <span className="tag">{it.badge}</span>}{it.id === v.eng && <Check size={15} />}</button></div>)}</div>
      {v.eng && v.periods.length > 0 && <div className="sw-periods"><span className="muted">الفترة:</span>{v.periods.map((p) => <button key={String(p.id)} className={`chip-btn${p.id === v.period ? ' on' : ''}`} onClick={() => { v.setPeriod(String(p.id)); setOpen(false); }}>{String(p.label).replace(/^الفترة من /, '')}</button>)}</div>}
      <div className="sw-foot"><span><kbd>↑↓</kbd> تنقل</span><span><kbd>Enter</kbd> اختيار</span><span><kbd>Ctrl K</kbd> البحث الشامل</span></div>
    </div></>}
  </div>;
}
