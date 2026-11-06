import { useEffect, useState } from 'react';
import { Paperclip, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { get, put, post } from '../api';
import { useAuth } from '../auth';
import { useScope } from '../components/Scope';
import { Page, Spinner, Empty, Field, Money, useLoad, useAction } from '../components/ui';

type AssetRow = { code: string; name: string; kind: string; category: string; category_label: string; suggested_rate: number; tax_rate: number | null; tax_note: string; rate: number; method: 'rate' | 'owner' | 'none'; cost_open: number; cost_close: number; additions: number; accum_codes: string[]; accum_close: number; booked_period: number; nbv: number; expected: number; additional: number; owner_value: number | null; owner_ref: string | null; adjustment: number; adjusted_nbv: number; note: string | null; basis: string };
type Lease = { rou_codes: string[]; rou_cost: number; rou_accum: number; liability: number; finance_cost_booked: number; term_months: number | null; start_date: string | null; discount_rate: number | null; elapsed_days: number; dep_expected_cum: number; dep_additional: number; interest_estimate: number; interest_additional: number; adjustment: number; status: string; note: string | null };
type Other = { id: string; title: string; amount: number; note?: string | null };
type Nav = { book_equity: number; total_assets: number; assets: AssetRow[]; lease: Lease | null; others: Other[]; adjustments: { depreciation: number; owner_revaluation: number; lease: number; others: number; total: number }; adjusted_nav: number; warnings: string[] };
type CompanyResp = { company: string; period: { label: string; days: number }; currency: string; nav: Nav; status: string; approved_at: string | null; approved_by: string | null; categories: { code: string; label: string; rate: number; tax_rate: number | null; tax_note: string }[]; tax_note?: string };
type Holder = { name: string; pct: number; paid?: number | null; account_code?: string | null };
type GroupResp = { root_engagement_id: string; root_period_id: string; parent_name: string; currency: string; basis: string; base: number; nav: number; nav_low: number | null; adjustments_total: number; adjustments: { name: string; role: string; ownership: number; total: number; attributable: number }[]; consolidation: { equity: number; nci: number; unreconciled: number; status: string } | null;
  contributions: { books: number; official: number | null; used: string; amount: number; capital: number; apic: number; official_paid: number | null }; gain: number; gain_pct: number | null;
  holders: { name: string; pct: number; share: number; contributed: number; gain: number; account: string | null; current: number; net: number }[]; register: { basis: 'assumed_equal' | 'register'; contributions_basis: 'books' | 'official'; holders: Holder[]; note: string | null; saved: boolean };
  parent_accounts: { code: string; name: string; closing: number }[]; companies: { engagement_id: string; name: string; role: string; ownership: number; nav: Nav | null; investment_cost: number | null; status: string }[]; warnings: string[] };
const ROLE: Record<string, string> = { parent: 'الأم', subsidiary: 'تابعة', at_cost: 'بالتكلفة' };

export function Valuation() {
  const { eng, period, Selector } = useScope(); const [tab, setTab] = useState<'company' | 'group'>('company');
  return <Page title="تعديلات التقييم وتقرير المساهمين" sub="صافي الأصول المعدّل: حقوق الملكية الدفترية ± تعديلات التقييم (استهلاك غير مسجل بنسب سنوية مقترحة تعدّلها وتعتمدها، أو تقييم المالك، وعقود الإيجار، وتعديلات أخرى). التعديلات للتقييم فقط ولا تُرحَّل في الدفاتر.">
    <Selector />
    {!eng || !period ? <Empty text="اختر الارتباط والفترة (والشركة داخل المجموعة)" /> : <>
      <div className="tabs">{([['company', 'تعديلات الشركة المختارة'], ['group', 'المساهمون والقيمة الموحدة']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'company' ? <CompanyTab eng={eng} period={period} /> : <GroupTab eng={eng} period={period} />}
    </>}
  </Page>;
}

function CompanyTab({ eng, period }: { eng: string; period: string }) {
  const { can } = useAuth(); const { run, busy } = useAction();
  const { data, loading, reload } = useLoad(() => get<CompanyResp>(`/valuation/company?engagement_id=${eng}&period_id=${period}`), [eng, period]);
  const [assets, setAssets] = useState<Record<string, { category: string; rate: number; method: AssetRow['method']; owner_value: number | null; owner_ref: string | null }>>({});
  const [lease, setLease] = useState<{ term_months: number | null; start_date: string | null; discount_rate: number | null }>({ term_months: null, start_date: null, discount_rate: null });
  const [others, setOthers] = useState<Other[]>([]); const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!data) return; setAssets(Object.fromEntries(data.nav.assets.map((a) => [a.code, { category: a.category, rate: a.rate, method: a.method, owner_value: a.owner_value, owner_ref: a.owner_ref }])));
    setLease({ term_months: data.nav.lease?.term_months ?? null, start_date: data.nav.lease?.start_date ?? null, discount_rate: data.nav.lease?.discount_rate ?? null }); setOthers(data.nav.others); setDirty(false); }, [data]);
  if (loading) return <Spinner />; if (!data) return <Empty text="تعذر التحميل (هل يوجد ميزان معتمد لهذه الشركة والفترة؟)" />;
  const n = data.nav; const edit = can('findings.edit') && data.status !== 'approved';
  const upd = (code: string, patch: Partial<(typeof assets)[string]>) => { setAssets((s) => ({ ...s, [code]: { ...s[code], ...patch } })); setDirty(true); };
  const save = async () => { const r = await run(() => put('/valuation/company', { engagement_id: eng, period_id: period, inputs: { assets, lease: n.lease ? lease : undefined, others } }), 'حُفظت التعديلات وأعيد الاحتساب'); if (r) reload(); };
  const approve = async (approve: boolean) => { if (dirty) await save(); const r = await run(() => post('/valuation/company/approve', { engagement_id: eng, period_id: period, approve }), approve ? 'اعتُمدت تعديلات التقييم' : 'أعيد فتح التعديلات'); if (r) reload(); };
  return <>
    <div className="grid c4">
      <div className="card kpi"><div className="muted">حقوق الملكية الدفترية</div><div className="big"><Money v={n.book_equity} /></div></div>
      <div className="card kpi"><div className="muted">تعديلات التقييم</div><div className="big"><Money v={n.adjustments.total} /></div></div>
      <div className="card kpi"><div className="muted">صافي الأصول المعدّل</div><div className="big"><Money v={n.adjusted_nav} /></div></div>
      <div className="card kpi"><div className="muted">الحالة</div><div className="big" style={{ fontSize: 18 }}>{data.status === 'approved' ? <span className="badge ok">معتمدة{data.approved_by ? ` - ${data.approved_by}` : ''}</span> : data.status === 'draft' ? <span className="badge warn">مسودة</span> : <span className="badge neutral">بالنسب المقترحة (لم تُحفظ)</span>}</div></div>
    </div>
    {n.warnings.length > 0 && <div className="alert warn"><ul style={{ margin: 0, paddingInlineStart: 18 }}>{n.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
    <div className="card"><h2>الأصول الثابتة وغير الملموسة ({data.company} - {data.period.label}، {data.period.days} يومًا)</h2>
      {!n.assets.length ? <Empty text="لا توجد أصول ثابتة أو غير ملموسة في الميزان" /> : <div className="tscroll" style={{ maxHeight: 'none' }}><table className="t ruled compact" style={{ tableLayout: 'fixed' }}><thead><tr><th style={{ width: '20%' }}>الحساب</th><th style={{ width: '17%' }}>فئة الأصل</th><th style={{ width: '7%' }}>النسبة %</th><th style={{ width: '12%' }}>الطريقة</th><th style={{ width: '13%' }}>التكلفة / المجمع</th><th style={{ width: '9%' }}>صافي دفتري</th><th style={{ width: '10%' }}>الاستهلاك المحتسب / قيمة المالك</th><th style={{ width: '6%' }}>الأثر</th><th style={{ width: '9%' }}>صافي معدّل</th></tr></thead>
        <tbody>{n.assets.map((a) => { const s = assets[a.code] ?? a; return <tr key={a.code}>
          <td className="wrap"><b>{a.code}</b> {a.name}<div className="muted" style={{ fontSize: 11.5 }}>{a.basis}</div></td>
          <td>{edit ? <select style={{ width: '100%' }} value={s.category} onChange={(e) => { const c = data.categories.find((x) => x.code === e.target.value)!; upd(a.code, { category: c.code, rate: c.rate, method: c.code === 'land' ? 'none' : s.method === 'none' ? 'rate' : s.method }); }}>{data.categories.map((c) => <option key={c.code} value={c.code}>{c.label} ({c.rate}%{c.tax_rate != null ? ` | ضريبي ${c.tax_rate}%` : ''})</option>)}</select> : a.category_label}</td>
          <td>{edit ? <input type="number" min={0} max={100} step={0.5} value={s.rate} onChange={(e) => upd(a.code, { rate: Number(e.target.value) })} style={{ width: '100%' }} title={`المقترح ${a.suggested_rate}%`} /> : `${a.rate}%`}<div className="muted" style={{ fontSize: 11 }} title={a.tax_note}>ضريبي: {a.tax_rate != null ? `${a.tax_rate}%` : '—'}</div></td>
          <td>{edit ? <select style={{ width: '100%' }} value={s.method} onChange={(e) => upd(a.code, { method: e.target.value as AssetRow['method'] })}><option value="rate">استهلاك بالنسبة</option><option value="owner">تقييم المالك</option><option value="none">بلا تعديل</option></select> : ({ rate: 'استهلاك بالنسبة', owner: 'تقييم المالك', none: 'بلا تعديل' })[a.method]}</td>
          <td className="num"><Money v={a.cost_close} /><div className="muted" style={{ fontSize: 11.5 }}>مجمع <Money v={a.accum_close} />{a.booked_period ? <> | مسجل بالفترة <Money v={a.booked_period} /></> : null}</div></td><td className="num"><Money v={a.nbv} /></td>
          <td>{s.method === 'owner' ? (edit ? <><input type="number" step={0.01} placeholder="قيمة المالك" value={s.owner_value ?? ''} onChange={(e) => upd(a.code, { owner_value: e.target.value === '' ? null : Number(e.target.value) })} style={{ width: '100%' }} /><input placeholder="المرجع (تقرير التقييم)" value={s.owner_ref ?? ''} onChange={(e) => upd(a.code, { owner_ref: e.target.value || null })} style={{ width: '100%', marginTop: 4 }} /></> : <Money v={a.owner_value} />) : <Money v={a.additional} />}</td>
          <td className="num"><Money v={a.adjustment} /></td><td className="num"><b><Money v={a.adjusted_nbv} /></b></td></tr>; })}</tbody></table></div>}
      {n.assets.length > 0 && data.tax_note && <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>{data.tax_note}</p>}
      <p className="muted">النسب مقترحة شائعة (قسط ثابت على التكلفة) وليست نسبًا نظامية؛ عدّلها حسب طبيعة الأصل. الإضافات خلال الفترة تُستهلك بنصف المدة، ولا يتجاوز الاستهلاك صافي القيمة الدفترية.</p>
    </div>
    {n.lease && <div className="card"><h2>عقد الإيجار (IFRS 16)</h2>
      <div className="row" style={{ flexWrap: 'wrap' }}><span>أصل حق الاستخدام <Money v={n.lease.rou_cost} /></span><span>| مجمع استهلاكه <Money v={n.lease.rou_accum} /></span><span>| التزام الإيجار <Money v={n.lease.liability} /></span><span>| تكاليف تمويل مسجلة <Money v={n.lease.finance_cost_booked} /></span></div>
      <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
        <Field label="مدة العقد (بالأشهر)"><input type="number" min={1} disabled={!edit} value={lease.term_months ?? ''} onChange={(e) => { setLease({ ...lease, term_months: e.target.value ? Number(e.target.value) : null }); setDirty(true); }} style={{ width: 120 }} /></Field>
        <Field label="تاريخ بداية العقد"><input type="date" disabled={!edit} value={lease.start_date ?? ''} onChange={(e) => { setLease({ ...lease, start_date: e.target.value || null }); setDirty(true); }} /></Field>
        <Field label="معدل الخصم السنوي % (اختياري)"><input type="number" min={0} step={0.1} disabled={!edit} value={lease.discount_rate ?? ''} onChange={(e) => { setLease({ ...lease, discount_rate: e.target.value ? Number(e.target.value) : null }); setDirty(true); }} style={{ width: 120 }} /></Field>
      </div>
      {n.lease.status === 'needs_input' ? <div className="alert warn">أدخل مدة العقد وتاريخ بدايته من عقد الإيجار (مطلوب من العميل) لاحتساب الاستهلاك.</div>
        : <table className="t ruled compact"><tbody><tr><td>الاستهلاك المتراكم المتوقع حتى نهاية الفترة ({n.lease.elapsed_days} يومًا)</td><td className="num"><Money v={n.lease.dep_expected_cum} /></td></tr><tr><td>استهلاك إضافي</td><td className="num"><Money v={n.lease.dep_additional} /></td></tr><tr><td>فائدة الالتزام المقدّرة / الإضافية</td><td className="num"><Money v={n.lease.interest_estimate} /> / <Money v={n.lease.interest_additional} /></td></tr><tr className="strong-row"><td>الأثر على صافي الأصول</td><td className="num"><Money v={n.lease.adjustment} /></td></tr></tbody></table>}
    </div>}
    <div className="card"><h2>تعديلات أخرى</h2>
      <p className="muted">مثل: ذمم يُشك في تحصيلها (بالسالب)، تقييم استثمار في شركة بلا قوائم (الفرق عن التكلفة)، التزامات غير مسجلة. أدخل الأثر على صافي الأصول بإشارته.</p>
      <table className="t ruled compact"><thead><tr><th>البند</th><th style={{ width: 160 }}>الأثر (+/−)</th><th>السند / ملاحظة</th><th style={{ width: 50 }}></th></tr></thead><tbody>
        {others.map((o, i) => <tr key={o.id}><td><input disabled={!edit} value={o.title} onChange={(e) => { const x = [...others]; x[i] = { ...o, title: e.target.value }; setOthers(x); setDirty(true); }} /></td><td><input type="number" step={0.01} disabled={!edit} value={o.amount} onChange={(e) => { const x = [...others]; x[i] = { ...o, amount: Number(e.target.value) }; setOthers(x); setDirty(true); }} /></td><td><input disabled={!edit} value={o.note ?? ''} onChange={(e) => { const x = [...others]; x[i] = { ...o, note: e.target.value }; setOthers(x); setDirty(true); }} /></td><td>{edit && <button className="btn sec sm" onClick={() => { setOthers(others.filter((_, j) => j !== i)); setDirty(true); }}><Trash2 size={15} /></button>}</td></tr>)}
        {!others.length && <tr><td colSpan={4} className="muted">لا توجد</td></tr>}</tbody></table>
      {edit && <button className="btn sec sm" style={{ marginTop: 6 }} onClick={() => { setOthers([...others, { id: String(Date.now()), title: '', amount: 0, note: '' }]); setDirty(true); }}><Plus size={15} /> إضافة بند</button>}
    </div>
    {n.assets.some((a) => a.adjustment !== 0) || (n.lease?.adjustment ?? 0) !== 0 ? <div className="card"><h2>القيود المقترحة (للعلم - لا تُرحَّل)</h2><table className="t ruled compact"><thead><tr><th>البيان</th><th>مدين</th><th>دائن</th><th>المبلغ</th></tr></thead><tbody>
      {n.assets.filter((a) => a.method === 'rate' && a.additional > 0).map((a) => <tr key={a.code}><td>استهلاك {a.name} عن {data.period.label}</td><td>مصروف استهلاك</td><td>{a.accum_codes[0] ? `مجمع استهلاك (${a.accum_codes[0]})` : `مجمع استهلاك ${a.name}`}</td><td className="num"><Money v={a.additional} /></td></tr>)}
      {n.assets.filter((a) => a.method === 'owner' && a.adjustment !== 0).map((a) => <tr key={a.code}><td>إعادة تقييم {a.name} لأغراض التقييم</td><td>{a.adjustment > 0 ? a.name : 'عجز إعادة التقييم'}</td><td>{a.adjustment > 0 ? 'فائض إعادة التقييم' : a.name}</td><td className="num"><Money v={Math.abs(a.adjustment)} /></td></tr>)}
      {n.lease && n.lease.dep_additional > 0 && <tr><td>استهلاك أصل حق الاستخدام</td><td>مصروف استهلاك حق الاستخدام</td><td>مجمع استهلاك حق الاستخدام</td><td className="num"><Money v={n.lease.dep_additional} /></td></tr>}
      {n.lease && n.lease.interest_additional > 0 && <tr><td>فائدة التزام الإيجار</td><td>تكاليف تمويل</td><td>التزامات عقود الإيجار</td><td className="num"><Money v={n.lease.interest_additional} /></td></tr>}
    </tbody></table></div> : null}
    {can('findings.edit') && <div className="row end">{data.status === 'approved' ? can('findings.review') && <button className="btn sec" onClick={() => approve(false)} disabled={busy}>إعادة فتح للتعديل</button>
      : <><button className="btn sec" disabled={busy} onClick={() => { setAssets(Object.fromEntries(n.assets.map((a) => { const c = data.categories.find((x) => x.code === a.category)!; return [a.code, { category: a.category, rate: c.rate, method: a.category === 'land' ? 'none' : 'rate', owner_value: null, owner_ref: null }]; }))); setDirty(true); }}>استعادة النسب المقترحة</button>
        <button className="btn" disabled={busy || !dirty} onClick={save}>{busy ? <Spinner /> : 'حفظ وإعادة الاحتساب'}</button>{can('findings.review') && <button className="btn" disabled={busy} onClick={() => approve(true)}>اعتماد التعديلات</button>}</>}</div>}
  </>;
}

function GroupTab({ eng, period }: { eng: string; period: string }) {
  const { can } = useAuth(); const { run, busy } = useAction(); const nav = useNavigate();
  const { data, loading, reload } = useLoad(() => get<GroupResp>(`/valuation/group?engagement_id=${eng}&period_id=${period}`), [eng, period]);
  const [reg, setReg] = useState<GroupResp['register'] | null>(null);
  useEffect(() => { if (data) setReg(data.register); }, [data]);
  if (loading) return <Spinner />; if (!data || !reg) return <Empty text="تعذر احتساب القيمة الموحدة (هل يوجد ميزان معتمد للشركة الأم؟)" />;
  const C = data.contributions; const edit = can('findings.edit'); const sum = reg.holders.reduce((t, h) => t + Number(h.pct || 0), 0);
  const equal = () => { const k = reg.holders.length; if (!k) return; const b = Math.floor((100 / k) * 10000) / 10000; setReg({ ...reg, holders: reg.holders.map((h, i) => ({ ...h, pct: i === k - 1 ? Math.round((100 - b * (k - 1)) * 10000) / 10000 : b })) }); };
  const saveReg = async () => { const r = await run(() => put('/valuation/register', { engagement_id: eng, period_id: period, basis: reg.basis, contributions_basis: reg.contributions_basis, note: reg.note, holders: reg.holders.map((h) => ({ name: h.name.trim(), pct: Number(h.pct), paid: h.paid == null || (h.paid as unknown) === '' ? null : Number(h.paid), account_code: h.account_code || null })) }), 'حُفظ سجل المساهمين'); if (r) reload(); };
  const makeReport = async () => { const t = await run(() => get<{ templates: { id: string; code: string }[] }>('/report-templates')); const tpl = (t?.templates ?? (t as unknown as { id: string; code: string }[]) ?? []).find((x) => x.code === 'SHAREHOLDERS_NAV'); if (!tpl) return;
    const r = await run(() => post<{ id: string }>('/reports', { engagement_id: data.root_engagement_id, period_id: data.root_period_id, template_id: tpl.id }), 'أُنشئت مسودة تقرير المساهمين'); if (r?.id) nav(`/reports/${r.id}`); };
  return <>
    <div className="grid c4">
      <div className="card kpi"><div className="muted">{data.basis === 'consolidation' ? 'حقوق الملكية الموحدة الدفترية (للمساهمين)' : 'حقوق الملكية الدفترية'}</div><div className="big"><Money v={data.base} /></div></div>
      <div className="card kpi"><div className="muted">تعديلات التقييم المنسوبة</div><div className="big"><Money v={data.adjustments_total} /></div></div>
      <div className="card kpi"><div className="muted">صافي الأصول المعدّل للمساهمين</div><div className="big"><Money v={data.nav} /></div>{data.nav_low != null && <div className="muted" style={{ fontSize: 12 }}>لو ثبت أن الفروق البينية ليست أصولًا: <Money v={data.nav_low} /></div>}</div>
      <div className="card kpi"><div className="muted">{data.gain < 0 ? 'خسارة' : 'ربح'} المساهمين</div><div className="big"><Money v={data.gain} /></div><div className="muted" style={{ fontSize: 12 }}>مقابل ما دخلوا به <Money v={C.amount} />{data.gain_pct != null && <> | {Math.abs(data.gain_pct)}%</>}</div></div>
    </div>
    {data.warnings.length > 0 && <div className="alert warn"><ul style={{ margin: 0, paddingInlineStart: 18 }}>{data.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
    <div className="card"><h2>الشركات</h2><table className="t ruled compact"><thead><tr><th>الشركة</th><th>العلاقة</th><th>الملكية</th><th>حقوق الملكية الدفترية</th><th>التعديلات</th><th>صافي الأصول المعدّل</th><th>حالة التعديلات</th></tr></thead><tbody>
      {data.companies.map((c) => <tr key={c.engagement_id}><td>{c.name}</td><td>{ROLE[c.role]}</td><td>{c.role === 'parent' ? '—' : `${c.ownership}%`}</td><td className="num">{c.nav ? <Money v={c.nav.book_equity} /> : '—'}</td><td className="num">{c.nav ? <Money v={c.nav.adjustments.total} /> : '—'}</td><td className="num">{c.nav ? <Money v={c.nav.adjusted_nav} /> : c.investment_cost != null ? <>بالتكلفة <Money v={c.investment_cost} /></> : '—'}</td><td>{c.nav ? <span className={`badge ${c.status === 'approved' ? 'ok' : c.status === 'draft' ? 'warn' : 'neutral'}`}>{c.status === 'approved' ? 'معتمدة' : c.status === 'draft' ? 'مسودة' : 'نسب مقترحة'}</span> : '—'}</td></tr>)}
    </tbody></table><p className="muted">لا تُجمع قيم الشركات المنفصلة (ازدواج رأس المال)؛ القيمة الموحدة تبدأ من حقوق الملكية الموحدة في «التوحيد الدفتري» ثم تضاف تعديلات كل شركة بنسبة الملكية.</p></div>
    <div className="card"><h2>ما دخل به المساهمون</h2><table className="t ruled compact"><tbody>
      <tr><td>رأس المال حسب الدفاتر</td><td className="num"><Money v={C.capital} /></td></tr><tr><td>رأس المال الإضافي المدفوع حسب الدفاتر</td><td className="num"><Money v={C.apic} /></td></tr><tr className="strong-row"><td>الإجمالي حسب الدفاتر</td><td className="num"><Money v={C.books} /></td></tr>
      {C.official != null && <><tr><td>المدفوع من رأس المال حسب المستندات النظامية</td><td className="num"><Money v={C.official_paid} /></td></tr><tr className="strong-row"><td>الإجمالي حسب المستندات + رأس المال الإضافي</td><td className="num"><Money v={C.official} /></td></tr></>}
    </tbody></table>
      <Field label="الأساس المعتمد في التقرير"><select disabled={!edit} value={reg.contributions_basis} onChange={(e) => setReg({ ...reg, contributions_basis: e.target.value as 'books' | 'official' })}><option value="books">الدفاتر</option>{C.official != null && <option value="official">المستندات النظامية</option>}</select></Field>
    </div>
    <div className="card"><h2>سجل المساهمين {reg.basis === 'assumed_equal' && <span className="badge warn">نسب افتراضية</span>}</h2>
      <div className="row"><Field label="أساس النسب"><select disabled={!edit} value={reg.basis} onChange={(e) => setReg({ ...reg, basis: e.target.value as 'assumed_equal' | 'register' })}><option value="assumed_equal">افتراضي (بالتساوي) إلى حين ورود السجل</option><option value="register">من سجل المساهمين المعتمد</option></select></Field></div>
      <table className="t ruled compact"><thead><tr><th>المساهم</th><th style={{ width: 110 }}>النسبة %</th><th style={{ width: 150 }}>ما دفعه (اختياري)</th><th>حسابه الجاري في دفاتر الأم</th><th style={{ width: 50 }}></th></tr></thead><tbody>
        {reg.holders.map((h, i) => <tr key={i}><td><input disabled={!edit} value={h.name} onChange={(e) => { const x = [...reg.holders]; x[i] = { ...h, name: e.target.value }; setReg({ ...reg, holders: x }); }} /></td>
          <td><input type="number" step={0.0001} disabled={!edit} value={h.pct} onChange={(e) => { const x = [...reg.holders]; x[i] = { ...h, pct: Number(e.target.value) }; setReg({ ...reg, holders: x }); }} /></td>
          <td><input type="number" step={0.01} disabled={!edit} placeholder="بالنسبة" value={h.paid ?? ''} onChange={(e) => { const x = [...reg.holders]; x[i] = { ...h, paid: e.target.value === '' ? null : Number(e.target.value) }; setReg({ ...reg, holders: x }); }} /></td>
          <td><select disabled={!edit} value={h.account_code ?? ''} onChange={(e) => { const x = [...reg.holders]; x[i] = { ...h, account_code: e.target.value || null }; setReg({ ...reg, holders: x }); }}><option value="">— بلا حساب —</option>{data.parent_accounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name} ({a.closing.toLocaleString('en-US', { minimumFractionDigits: 2 })})</option>)}</select></td>
          <td>{edit && <button className="btn sec sm" onClick={() => setReg({ ...reg, holders: reg.holders.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>}</td></tr>)}
      </tbody><tfoot><tr className="strong-row"><td>المجموع</td><td className="num" style={{ color: Math.abs(sum - 100) > 0.01 ? 'var(--danger)' : undefined }}>{Math.round(sum * 10000) / 10000}%</td><td colSpan={3}></td></tr></tfoot></table>
      {edit && <div className="row" style={{ marginTop: 6 }}><button className="btn sec sm" onClick={() => setReg({ ...reg, holders: [...reg.holders, { name: '', pct: 0, paid: null, account_code: null }] })}><Plus size={15} /> مساهم</button><button className="btn sec sm" onClick={equal}>توزيع بالتساوي</button><button className="btn" disabled={busy || Math.abs(sum - 100) > 0.01 || reg.holders.some((h) => h.name.trim().length < 2)} onClick={saveReg}>حفظ السجل وإعادة الاحتساب</button></div>}
      {!reg.saved && <p className="muted">القائمة الحالية مأخوذة تلقائيًا من المؤسسين في البيانات النظامية المعتمدة بالتساوي؛ احفظها أو عدّلها.</p>}
    </div>
    <div className="card"><h2>نصيب كل مساهم</h2><table className="t ruled compact"><thead><tr><th>المساهم</th><th>النسبة</th><th>نصيبه من القيمة</th><th>ما دخل به</th><th>ربحه/(خسارته)</th><th>رصيده الجاري (مدين = عليه)</th><th>صافي ما يخصه</th></tr></thead><tbody>
      {data.holders.map((h) => <tr key={h.name}><td>{h.name}</td><td>{h.pct}%</td><td className="num"><Money v={h.share} /></td><td className="num"><Money v={h.contributed} /></td><td className="num"><Money v={h.gain} /></td><td className="num">{h.account ? <Money v={h.current} /> : '—'}</td><td className="num"><b><Money v={h.net} /></b></td></tr>)}
    </tbody></table></div>
    {can('reports.create') && <div className="row end"><button className="btn" disabled={busy} onClick={makeReport}>إنشاء «تقرير المساهمين الموحد»</button></div>}
  </>;
}
