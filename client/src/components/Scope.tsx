import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get } from '../api';
import { useLoad, Field } from './ui';

type Row = Record<string, string | number | null>;
/** محدد الارتباط/الفترة المشترك بين صفحات التحليل */
export function useScope() {
  const [sp, setSp] = useSearchParams();
  const eng = sp.get('engagement_id') ?? ''; const period = sp.get('period_id') ?? '';
  const { data: engs } = useLoad(() => get<{ engagements: Row[] }>('/engagements'), []);
  const { data: det } = useLoad(() => eng ? get<{ engagement: Row; periods: Row[] }>(`/engagements/${eng}`) : Promise.resolve(null), [eng]);
  useEffect(() => { if (det && !period && det.periods.length) { const p = det.periods.find((x) => x.role === 'current') ?? det.periods[det.periods.length - 1]; setSp((s) => { s.set('period_id', String(p.id)); return s; }, { replace: true }); } }, [det]); // eslint-disable-line
  const set = (k: string, v: string) => setSp((s) => { if (v) s.set(k, v); else s.delete(k); if (k === 'engagement_id') s.delete('period_id'); return s; });
  const periodRow = det?.periods.find((p) => p.id === period) ?? null;
  // شركات المجموعة: التبديل بين الأم وشركاتها مع الإبقاء على الفترة نفسها (بالتواريخ)
  const rootId = det ? String(det.engagement.group_engagement_id ?? det.engagement.id) : '';
  const { data: grp } = useLoad(() => rootId ? get<{ components: { id: string; client_name: string; periods: { id: string; start_date: string; end_date: string }[] }[] }>(`/engagements/${rootId}/components`) : Promise.resolve(null), [rootId]);
  const { data: rootDet } = useLoad(() => rootId && det?.engagement.group_engagement_id ? get<{ engagement: Row; periods: Row[] }>(`/engagements/${rootId}`) : Promise.resolve(null), [rootId]);
  const companies = grp && grp.components.length ? [{ id: rootId, name: String((det?.engagement.group_engagement_id ? rootDet?.engagement.client_name : det?.engagement.client_name) ?? 'الشركة الأم') + ' (الأم)', periods: ((det?.engagement.group_engagement_id ? rootDet?.periods : det?.periods) ?? []).map((p) => ({ id: String(p.id), start_date: String(p.start_date).slice(0, 10), end_date: String(p.end_date).slice(0, 10) })) }, ...grp.components.filter((c) => (c as { entity_role?: string }).entity_role !== 'at_cost').map((c) => ({ id: c.id, name: c.client_name, periods: c.periods }))] : [];
  const switchCompany = (toId: string) => { const to = companies.find((c) => c.id === toId); if (!to) return; const pr = periodRow ? to.periods.find((p) => p.start_date === String(periodRow.start_date).slice(0, 10) && p.end_date === String(periodRow.end_date).slice(0, 10)) : null; setSp((s) => { s.set('engagement_id', toId); if (pr) s.set('period_id', pr.id); else s.delete('period_id'); return s; }); };
  const Selector = () => <div className="card tight"><div className="row">
    <Field label="الارتباط"><select value={eng} onChange={(e) => set('engagement_id', e.target.value)} style={{ minWidth: 320 }}><option value="">— اختر الارتباط —</option>{engs?.engagements.filter((e) => !e.group_engagement_id || e.id === eng).map((e) => <option key={String(e.id)} value={String(e.id)}>{e.client_name}{e.is_demo ? ' (تجريبي)' : ''} — {e.title}</option>)}</select></Field>
    {companies.length > 0 && <Field label="الشركة"><select value={eng} onChange={(e) => switchCompany(e.target.value)} style={{ minWidth: 220 }}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
    <Field label="الفترة"><select value={period} onChange={(e) => set('period_id', e.target.value)} style={{ minWidth: 200 }}><option value="">—</option>{det?.periods.map((p) => <option key={String(p.id)} value={String(p.id)}>{p.label}</option>)}</select></Field>
    {det && <div className="muted" style={{ paddingTop: 20 }}>{det.engagement.client_name} | {det.engagement.currency}</div>}</div></div>;
  return { eng, period, engagement: det?.engagement ?? null, periods: det?.periods ?? [], periodRow, Selector };
}
