import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, CalendarRange, ChevronLeft, Network } from 'lucide-react';
import { get } from '../api';
import { useLoad } from './ui';

type Row = Record<string, string | number | null>;
type Company = { id: string; name: string; periods: { id: string; start_date: string; end_date: string }[] };
interface ScopeValue { eng: string; period: string; engagement: Row | null; periods: Row[]; periodRow: Row | null; companies: Company[]; engagements: Row[]; scoped: boolean
  setEngagement: (id: string) => void; setPeriod: (id: string) => void; switchCompany: (id: string) => void; Selector: () => null }

/** الصفحات التي تعمل على ارتباط وفترة: يُطبَّق عليها سياق العمل المحفوظ تلقائيًا */
export const SCOPED = ['/official', '/requests', '/trial-balance', '/analysis', '/consolidation', '/valuation', '/findings', '/ai', '/reports'];
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

/** الشريط العلوي: العميل/الارتباط › الشركة › الفترة */
export function ContextBar() {
  const v = useContext(Ctx)!; const roots = v.engagements.filter((e) => !e.group_engagement_id || e.id === v.eng);
  const curRoot = v.engagement ? String(v.engagement.group_engagement_id ?? v.engagement.id) : '';
  return <div className="ctxbar">
    <label className="ctx" title="العميل والارتباط"><Building2 size={16} /><span>الارتباط</span>
      <select value={v.companies.length ? curRoot : v.eng} onChange={(e) => v.setEngagement(e.target.value)}><option value="">— اختر —</option>{roots.filter((e) => !e.group_engagement_id).map((e) => <option key={String(e.id)} value={String(e.id)}>{e.client_name}{e.is_demo ? ' (تجريبي)' : ''} — {e.title}</option>)}</select></label>
    {v.companies.length > 0 && <><ChevronLeft size={14} className="sep" /><label className="ctx" title="الشركة داخل المجموعة"><Network size={16} /><span>الشركة</span>
      <select value={v.eng} onChange={(e) => v.switchCompany(e.target.value)}>{v.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></>}
    {v.eng && <><ChevronLeft size={14} className="sep" /><label className="ctx" title="الفترة"><CalendarRange size={16} /><span>الفترة</span>
      <select value={v.period} onChange={(e) => v.setPeriod(e.target.value)}><option value="">—</option>{v.periods.map((p) => <option key={String(p.id)} value={String(p.id)}>{p.label}</option>)}</select></label></>}
  </div>;
}
