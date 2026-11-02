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
  const Selector = () => <div className="card tight"><div className="row">
    <Field label="الارتباط"><select value={eng} onChange={(e) => set('engagement_id', e.target.value)} style={{ minWidth: 320 }}><option value="">— اختر الارتباط —</option>{engs?.engagements.map((e) => <option key={String(e.id)} value={String(e.id)}>{e.client_name}{e.is_demo ? ' (تجريبي)' : ''} — {e.title}</option>)}</select></Field>
    <Field label="الفترة"><select value={period} onChange={(e) => set('period_id', e.target.value)} style={{ minWidth: 200 }}><option value="">—</option>{det?.periods.map((p) => <option key={String(p.id)} value={String(p.id)}>{p.label}</option>)}</select></Field>
    {det && <div className="muted" style={{ paddingTop: 20 }}>{det.engagement.client_name} | {det.engagement.currency}</div>}</div></div>;
  return { eng, period, engagement: det?.engagement ?? null, periods: det?.periods ?? [], periodRow, Selector };
}
