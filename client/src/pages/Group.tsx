import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { get, post, put, del } from '../api';
import { useLoad, Modal, Field, useAction, DangerButton, Empty } from '../components/ui';
import { useAuth } from '../auth';
import { ENTITY } from '../format';

type Row = Record<string, string | number | null>;
export interface GroupComp { id: string; client_id: string; client_name: string; cr_number: string | null; entity_role: 'subsidiary' | 'at_cost'; ownership_pct: string | null; title: string; periods: { id: string; label: string; start_date: string; end_date: string; role: string; tb_rows: string; statements_at: string | null }[] }
export const ROLE_AR: Record<string, string> = { parent: 'الشركة الأم', subsidiary: 'شركة تابعة (تُوحَّد)', at_cost: 'استثمار بالتكلفة / بلا قوائم' };
const pct = (v: string | null) => v ? `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 8 })}%` : '—';

export function useGroup(engagementId: string | undefined, version = 0) {
  return useLoad(() => engagementId ? get<{ is_component: boolean; group_engagement_id?: string; components: GroupComp[] }>(`/engagements/${engagementId}/components`) : Promise.resolve(null), [engagementId, version]);
}
const pctIn = (v: string | null) => v ? String(Number(v)) : '100';

/** بطاقة شركات المجموعة في صفحة ارتباط المجموعة: لكل شركة ميزانها المنفصل، وتُجمع في التوحيد والتقرير */
export function GroupCompaniesCard({ engagement, periods, onChanged }: { engagement: Row; periods: Row[]; onChanged: () => void }) {
  const { can } = useAuth(); const { run, busy } = useAction();
  const { data, reload } = useGroup(String(engagement.id));
  const { data: clients } = useLoad(() => get<{ clients: Row[] }>('/clients'), []);
  const [add, setAdd] = useState(false);
  const [f, setF] = useState({ mode: 'new', client_id: '', legal_name_ar: '', legal_name_en: '', entity_type: 'llc', cr_number: '', entity_role: 'subsidiary', ownership_pct: '100' });
  if (!data || data.is_component) return null;
  const comps = data.components;
  const current = periods.find((p) => p.role === 'current') ?? periods[periods.length - 1];
  const cur = (c: GroupComp) => c.periods.find((p) => current && p.start_date === String(current.start_date).slice(0, 10) && p.end_date === String(current.end_date).slice(0, 10));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = f.mode === 'new' ? { company: { legal_name_ar: f.legal_name_ar, legal_name_en: f.legal_name_en || null, entity_type: f.entity_type, cr_number: f.cr_number || null }, entity_role: f.entity_role, ownership_pct: f.ownership_pct } : { client_id: f.client_id, entity_role: f.entity_role, ownership_pct: f.ownership_pct };
    const r = await run(() => post(`/engagements/${engagement.id}/components`, body), 'أُضيفت الشركة إلى المجموعة');
    if (r) { setAdd(false); setF({ ...f, legal_name_ar: '', legal_name_en: '', cr_number: '', client_id: '' }); reload(); onChanged(); }
  };
  const existing = (clients?.clients ?? []).filter((c) => c.id !== engagement.client_id && !comps.some((x) => x.client_id === c.id));
  return <div className="card"><div className="row between"><h2>شركات المجموعة</h2>{can('clients.manage') && <button className="btn sec sm" onClick={() => setAdd(true)}><Plus size={15} /> إضافة شركة للمجموعة</button>}</div>
    <p className="muted">كل شركة لها ميزان مراجعة منفصل تمامًا (لا تُخلط الأرصدة). تحلّل كل شركة وحدها من زر «فتح»، ويجمعها «التوحيد الدفتري» تلقائيًا، ويعرض تقرير المجموعة تقييمًا منفصلًا لكل شركة وتقييمًا موحدًا معًا. خطاب الارتباط واحد للمجموعة.</p>
    <table className="t ruled"><thead><tr><th>الشركة</th><th>العلاقة</th><th className="num">نسبة الملكية</th><th>ميزان {String(current?.label ?? 'الفترة الحالية')}</th><th></th></tr></thead><tbody>
      <tr><td><b>{String(engagement.client_name)}</b></td><td>{ROLE_AR.parent}</td><td className="num">—</td><td>هذه الصفحة</td><td /></tr>
      {comps.map((c) => { const p = cur(c); const tb = Number(p?.tb_rows ?? 0); return <tr key={c.id}><td><b>{c.client_name}</b>{c.cr_number && <div className="muted">سجل {c.cr_number}</div>}</td>
        <td>{can('clients.manage') ? <select style={{ minWidth: 220 }} value={c.entity_role} onChange={async (e) => { await run(() => put(`/engagements/${engagement.id}/components/${c.id}`, { entity_role: e.target.value }), 'حُدّثت العلاقة'); reload(); }}>{Object.entries(ROLE_AR).filter(([k]) => k !== 'parent').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> : ROLE_AR[c.entity_role]}</td>
        <td className="num">{can('clients.manage') ? <input style={{ width: 120 }} key={c.ownership_pct ?? ''} defaultValue={pctIn(c.ownership_pct)} dir="ltr" onBlur={async (e) => { if (e.target.value !== pctIn(c.ownership_pct)) { await run(() => put(`/engagements/${engagement.id}/components/${c.id}`, { ownership_pct: e.target.value }), 'حُدّثت نسبة الملكية'); reload(); } }} /> : pct(c.ownership_pct)}</td>
        <td>{c.entity_role === 'at_cost' ? <span className="muted">لا يلزم ميزان (تُدرج بالتكلفة)</span> : tb > 0 ? <span className="badge ok">✓ {tb} حساب{p?.statements_at ? ' | القوائم مولّدة' : ''}</span> : <span className="badge warn">لم يُرفع ميزانها بعد</span>}</td>
        <td className="row"><Link className="btn sec sm" to={`/engagements/${c.id}`}>فتح الشركة</Link>{p && c.entity_role !== 'at_cost' && <Link className="btn sec sm" to={`/trial-balance?engagement_id=${c.id}&period_id=${p.id}`}>الميزان</Link>}{can('data.delete') && <DangerButton text={`إزالة «${c.client_name}» من المجموعة؟ يُحذف ميزانها واستيراداتها وملاحظاتها داخل هذا الارتباط (سجل الشركة نفسه يبقى).`} onConfirm={async () => { await run(() => del(`/engagements/${engagement.id}/components/${c.id}`), 'أُزيلت الشركة'); reload(); onChanged(); }} />}</td></tr>; })}
    </tbody></table>
    {!comps.length && <Empty text="لم تُضف شركات بعد. إن كان العميل مجموعة شركات أضف كل شركة تابعة هنا، ثم ارفع ميزان كل شركة من نموذج الرفع باختيار الشركة." />}
    {add && <Modal title="إضافة شركة إلى المجموعة" onClose={() => setAdd(false)}><form onSubmit={save}>
      <div className="row"><label className="row"><input type="radio" checked={f.mode === 'new'} onChange={() => setF({ ...f, mode: 'new' })} style={{ width: 'auto' }} /> شركة جديدة</label><label className="row"><input type="radio" checked={f.mode === 'existing'} onChange={() => setF({ ...f, mode: 'existing' })} style={{ width: 'auto' }} /> عميل موجود في البرنامج</label></div>
      {f.mode === 'new' ? <div className="grid c2"><Field label="اسم الشركة (عربي) *"><input value={f.legal_name_ar} onChange={(e) => setF({ ...f, legal_name_ar: e.target.value })} required /></Field><Field label="الاسم (إنجليزي)"><input value={f.legal_name_en} onChange={(e) => setF({ ...f, legal_name_en: e.target.value })} dir="ltr" /></Field>
        <Field label="نوع الكيان"><select value={f.entity_type} onChange={(e) => setF({ ...f, entity_type: e.target.value })}>{Object.entries(ENTITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><Field label="رقم السجل التجاري"><input value={f.cr_number} onChange={(e) => setF({ ...f, cr_number: e.target.value })} dir="ltr" /></Field></div>
        : <Field label="العميل"><select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} required><option value="">— اختر —</option>{existing.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.legal_name_ar}</option>)}</select></Field>}
      <div className="grid c2"><Field label="العلاقة" hint="التابعة تُوحَّد بميزانها؛ «بالتكلفة» لشركة لا تتوفر قوائمها فتبقى بتكلفة الاستثمار"><select value={f.entity_role} onChange={(e) => setF({ ...f, entity_role: e.target.value })}><option value="subsidiary">{ROLE_AR.subsidiary}</option><option value="at_cost">{ROLE_AR.at_cost}</option></select></Field>
        <Field label="نسبة ملكية الأم %"><input value={f.ownership_pct} onChange={(e) => setF({ ...f, ownership_pct: e.target.value })} dir="ltr" required /></Field></div>
      <p className="muted">تُنشأ للشركة نفس فترات ارتباط المجموعة تلقائيًا، وسجلها يُحفظ منفصلًا تحت «{String(engagement.client_name)}».</p>
      <div className="row end"><button className="btn" disabled={busy}>إضافة</button></div></form></Modal>}
  </div>;
}

/** شريط في صفحة الشركة المكوّنة يوضح انتماءها للمجموعة */
export function ComponentBanner({ engagement }: { engagement: Row }) {
  if (!engagement.group_engagement_id) return null;
  return <div className="alert info">هذه الشركة ضمن مجموعة: <Link to={`/engagements/${engagement.group_engagement_id}`}><b>{String(engagement.group_title ?? 'ارتباط المجموعة')}</b></Link> ({ROLE_AR[String(engagement.entity_role)] ?? ''}{engagement.ownership_pct ? ` | ملكية ${pct(String(engagement.ownership_pct))}` : ''}). ميزانها وتحليلها منفصلان هنا؛ خطاب الارتباط والتوحيد والتقرير الموحد على مستوى المجموعة.</div>;
}

/** أهداف الرفع/النقل: الأم + شركات المجموعة (مع فتراتها) */
export function useGroupTargets(engagement: Row | null, periods: Row[], version = 0) {
  const rootId = engagement ? String(engagement.group_engagement_id ?? engagement.id) : undefined;
  const { data } = useGroup(rootId, version);
  const { data: root } = useLoad(() => rootId && engagement?.group_engagement_id ? get<{ engagement: Row; periods: Row[] }>(`/engagements/${rootId}`) : Promise.resolve(null), [rootId]);
  if (!engagement || !data || !data.components.length) return [];
  const rootEng = engagement.group_engagement_id ? root?.engagement : engagement; const rootPeriods = engagement.group_engagement_id ? (root?.periods ?? []) : periods;
  if (!rootEng) return [];
  return [{ id: String(rootEng.id), name: String(rootEng.client_name), role: 'parent', periods: rootPeriods }, ...data.components.map((c) => ({ id: c.id, name: c.client_name, role: c.entity_role, periods: c.periods as unknown as Row[] }))];
}
