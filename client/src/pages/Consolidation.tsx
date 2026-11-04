import { Fragment, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { get, post, put } from '../api';
import { Link } from 'react-router-dom';
import { Page, useLoad, Spinner, Empty, Field, useAction, Money } from '../components/ui';
import { useScope } from '../components/Scope';
import { useAuth } from '../auth';
import { fmtDate } from '../format';

type Row = Record<string, string | number | null>;
interface Sub { key: string; engagement_id: string; period_id: string; ownership_pct: string; profit_share_pct: string; investment_codes_in_parent: string; parent_account_codes_in_sub: string; sub_account_codes_in_parent: string; control_since: string; control_basis: 'incorporation' | 'acquisition' | ''; claim_nature: 'provisional' | 'unpaid_subscription' | 'other'; other_equity_rights: string }
interface AtCost { key: string; label: string; investment_codes_in_parent: string; receivable_codes_in_parent: string; payable_codes_in_parent: string; control: 'controlled' | 'not_controlled' | 'unknown'; note: string }
interface Prefill { parent: { name: string; accounts: Record<string, { name: string; net: number }> }; setup: unknown; companies: { engagement_id: string; name: string; role: string; ownership_pct: string | null; period_id: string | null; period_label: string; tb_rows: number; suggested: Record<string, string[]>; accounts: Record<string, { name: string; net: number }> }[] }
const split = (s: string) => s.split(/[،,\s]+/).map((x) => x.trim()).filter(Boolean);
const blankSub = (): Sub => ({ key: `s${Date.now() % 100000}`, engagement_id: '', period_id: '', ownership_pct: '100', profit_share_pct: '', investment_codes_in_parent: '', parent_account_codes_in_sub: '', sub_account_codes_in_parent: '', control_since: '', control_basis: 'incorporation', claim_nature: 'provisional', other_equity_rights: '' });
const blankCost = (): AtCost => ({ key: `c${Date.now() % 100000}`, label: '', investment_codes_in_parent: '', receivable_codes_in_parent: '', payable_codes_in_parent: '', control: 'unknown', note: '' });

function PeriodSelect({ engagementId, value, onChange }: { engagementId: string; value: string; onChange: (v: string) => void }) {
  const { data } = useLoad(() => engagementId ? get<{ periods: Row[] }>(`/engagements/${engagementId}`) : Promise.resolve(null), [engagementId]);
  return <select value={value} onChange={(e) => onChange(e.target.value)}><option value="">— الفترة —</option>{data?.periods.map((p) => <option key={String(p.id)} value={String(p.id)}>{p.label}</option>)}</select>;
}

/** صفحة التوحيد الدفتري للمجموعة: تُحدد الأم والتابعات وحسابات الاستثمار والأرصدة البينية، ثم يُشغَّل المحرك وتُعرض ورقة العمل والقيود وسجل الفروق */
export function Consolidation() {
  const { eng, period, Selector } = useScope(); const { can } = useAuth(); const { run, busy } = useAction();
  const { data: engs } = useLoad(() => get<{ engagements: Row[] }>('/engagements'), []);
  const { data: last, reload } = useLoad(() => period ? get<{ run: { id: string; started_at: string; result: Record<string, unknown> } | null }>(`/analysis/group/latest?period_id=${period}`) : Promise.resolve(null), [period]);
  const [subs, setSubs] = useState<Sub[]>([]); const [costs, setCosts] = useState<AtCost[]>([]); const [result, setResult] = useState<Record<string, unknown> | null>(null);
  // وضع المجموعة: الشركات تأتي من «شركات المجموعة» في ارتباط الأم، والحسابات تُقترح من الأسماء، والإعداد يُحفظ على الخادم
  const { data: grpInfo } = useLoad(() => eng ? get<{ is_component: boolean; group_engagement_id?: string; components: unknown[] }>(`/engagements/${eng}/components`) : Promise.resolve(null), [eng]);
  const isGroup = !!grpInfo && !grpInfo.is_component && grpInfo.components.length > 0;
  const { data: pre, reload: reloadPre } = useLoad(() => isGroup && period ? get<Prefill>(`/engagements/${eng}/components/prefill?period_id=${period}`) : Promise.resolve(null), [eng, period, isGroup]);
  const [loadedFor, setLoadedFor] = useState('');
  useEffect(() => {
    if (!pre || loadedFor === `${eng}:${period}`) return; setLoadedFor(`${eng}:${period}`);
    const saved = (pre.setup ?? {}) as { subs?: Sub[]; costs?: AtCost[] };
    const j = (v: string[]) => v.join(', ');
    const sv = (id: string) => saved.subs?.find((x) => x.key === id); const cv = (id: string) => saved.costs?.find((x) => x.key === id);
    setSubs(pre.companies.filter((c) => c.role === 'subsidiary').map((c) => { const o = sv(c.engagement_id); return { ...blankSub(), ...(o ?? {}), key: c.engagement_id, engagement_id: c.engagement_id, period_id: c.period_id ?? '', ownership_pct: c.ownership_pct ?? '100',
      investment_codes_in_parent: o?.investment_codes_in_parent ?? j(c.suggested.investment_codes_in_parent), parent_account_codes_in_sub: o?.parent_account_codes_in_sub ?? j(c.suggested.parent_account_codes_in_sub), sub_account_codes_in_parent: o?.sub_account_codes_in_parent ?? j(c.suggested.sub_account_codes_in_parent) }; }));
    setCosts([...pre.companies.filter((c) => c.role === 'at_cost').map((c) => { const o = cv(c.engagement_id); return { ...blankCost(), ...(o ?? {}), key: c.engagement_id, label: c.name,
      investment_codes_in_parent: o?.investment_codes_in_parent ?? j(c.suggested.investment_codes_in_parent), receivable_codes_in_parent: o?.receivable_codes_in_parent ?? j(c.suggested.receivable_codes_in_parent), payable_codes_in_parent: o?.payable_codes_in_parent ?? j(c.suggested.payable_codes_in_parent) }; }),
      ...((saved.costs ?? []).filter((x) => !pre.companies.some((c) => c.engagement_id === x.key)))]);
  }, [pre]); // eslint-disable-line
  const saveSetup = async (quiet = false) => { if (!isGroup) return true; return !!(await run(() => put(`/engagements/${eng}/components/setup/save`, { setup: { subs, costs } }), quiet ? undefined : 'حُفظ إعداد التوحيد')); };
  const preCo = (id: string) => pre?.companies.find((c) => c.engagement_id === id);
  const accNames = (codes: string, map?: Record<string, { name: string; net: number }>) => split(codes).map((c) => map?.[c] ? `${c}: ${map[c].name} (${Number(map[c].net).toLocaleString('en-US', { minimumFractionDigits: 2 })})` : `${c}: غير موجود في الميزان`).join(' | ');
  useEffect(() => { if (isGroup) return; try { const saved = localStorage.getItem(`consol:${eng}`); if (saved) { const j = JSON.parse(saved); setSubs(j.subs ?? []); setCosts(j.costs ?? []); } else { setSubs([]); setCosts([]); } } catch { /* ignore */ } setResult(null); }, [eng]);
  useEffect(() => {
    if (!last?.run) return; setResult(last.run.result);
    // استعادة إعداد التوحيد المحفوظ مع آخر تشغيل عند غيابه من هذا المتصفح (جهاز آخر أو مستخدم آخر)
    const inp = (last.run.result as { input?: { subsidiaries?: Record<string, unknown>[]; at_cost?: Record<string, unknown>[] } }).input;
    const j = (v: unknown) => Array.isArray(v) ? v.join(', ') : String(v ?? '');
    if (inp && !subs.length && !costs.length && !isGroup) {
      persist((inp.subsidiaries ?? []).map((x) => ({ ...blankSub(), ...x, investment_codes_in_parent: j(x.investment_codes_in_parent), parent_account_codes_in_sub: j(x.parent_account_codes_in_sub), sub_account_codes_in_parent: j(x.sub_account_codes_in_parent), profit_share_pct: String(x.profit_share_pct ?? ''), control_since: String(x.control_since ?? ''), other_equity_rights: String(x.other_equity_rights ?? ''), control_basis: (x.control_basis ?? '') as Sub['control_basis'], claim_nature: (x.claim_nature ?? 'provisional') as Sub['claim_nature'] }) as Sub),
        (inp.at_cost ?? []).map((x) => ({ ...blankCost(), ...x, investment_codes_in_parent: j(x.investment_codes_in_parent), receivable_codes_in_parent: j(x.receivable_codes_in_parent), payable_codes_in_parent: j(x.payable_codes_in_parent), note: String(x.note ?? ''), control: (x.control ?? 'unknown') as AtCost['control'] }) as AtCost));
    }
  }, [last]); // eslint-disable-line
  const persist = (s: Sub[], c: AtCost[]) => { setSubs(s); setCosts(c); try { localStorage.setItem(`consol:${eng}`, JSON.stringify({ subs: s, costs: c })); } catch { /* ignore */ } };
  const execute = async () => {
    if (isGroup && !(await saveSetup(true))) return;
    const body = { parent: { engagement_id: eng, period_id: period },
      subsidiaries: subs.map((s) => ({ key: s.key, engagement_id: s.engagement_id, period_id: s.period_id, ownership_pct: s.ownership_pct || '100', profit_share_pct: s.profit_share_pct || null, investment_codes_in_parent: split(s.investment_codes_in_parent), parent_account_codes_in_sub: split(s.parent_account_codes_in_sub), sub_account_codes_in_parent: split(s.sub_account_codes_in_parent), control_since: s.control_since || null, control_basis: s.control_basis || null, claim_nature: s.claim_nature, other_equity_rights: s.other_equity_rights || null })),
      at_cost: costs.map((c) => ({ key: c.key, label: c.label, investment_codes_in_parent: split(c.investment_codes_in_parent), receivable_codes_in_parent: split(c.receivable_codes_in_parent), payable_codes_in_parent: split(c.payable_codes_in_parent), control: c.control, note: c.note || undefined })), adjustments: [] };
    const r = await run(() => post<{ run_id: string; result: Record<string, unknown> }>('/analysis/group/consolidate', body), 'اكتمل التوحيد وحُفظ كتشغيل تحليل'); if (r) { setResult(r.result); reload(); }
  };
  const R = result as null | { status: string; pending_reasons: string[]; parent: { label: string; book_equity: string }; group_equity_worksheet: string; hypothesis_unreconciled_not_assets: string; subsidiaries: { key: string; label: string }[]; worksheet: { rows: Row[]; entries: Row[]; register: Row[]; subsidiaries: Row[]; scope: Row[]; totals: Record<string, string> } };
  const comp: Record<string, string> = { parent: R?.parent.label ?? 'الأم', group: 'المجموعة', ...Object.fromEntries((R?.subsidiaries ?? []).map((s) => [s.key, s.label])) };
  return <Page title="التوحيد الدفتري للمجموعة" sub="اختر ارتباط الشركة الأم وفترتها، ثم أضف التابعات (ارتباط كل منها وفترتها وحسابات الاستثمار والجاري)، ثم شغّل. النتيجة تُحفظ ويمكن إدراجها قسمًا في أي تقرير على ارتباط الأم (قسم: التوحيد الدفتري للمجموعة)."
    actions={eng && period && can('analysis.run') && <div className="row">{isGroup && <button className="btn sec" disabled={busy} onClick={() => saveSetup()}>حفظ الإعداد</button>}{isGroup && <button className="btn sec" disabled={busy} onClick={() => { setLoadedFor(''); reloadPre(); }} title="يعيد قراءة الشركات والحسابات المقترحة (يُبقي ما حفظته)">تحديث من المجموعة</button>}<button className="btn" disabled={busy || !subs.length} onClick={execute}>{busy ? 'جارٍ التشغيل…' : 'تشغيل التوحيد'}</button></div>}>
    <Selector />
    {grpInfo?.is_component && <div className="alert warn">هذه شركة ضمن مجموعة؛ التوحيد يُشغَّل من ارتباط المجموعة (الأم). <Link to={`/consolidation?engagement_id=${grpInfo.group_engagement_id}`}>افتح توحيد المجموعة</Link></div>}
    {eng && grpInfo && !grpInfo.is_component && !isGroup && <div className="alert info">الطريقة الموصى بها: أضف شركات المجموعة من صفحة ارتباط الأم («شركات المجموعة») ليملأ البرنامج هذه الشاشة تلقائيًا ويحفظ الإعداد. يمكنك أيضًا ربط ارتباطات منفصلة يدويًا أدناه.</div>}
    {!eng || !period ? <Empty text="اختر ارتباط الشركة الأم والفترة" /> : <>
      <div className="card"><h2>الشركات التابعة (تدخل ورقة العمل)</h2>
        {subs.map((s, i) => <div key={s.key} className="card tight" style={{ marginBottom: 8 }}>
          {isGroup ? <div className="row between"><h3 style={{ margin: 0 }}>{preCo(s.engagement_id)?.name ?? 'شركة'} <span className="muted" style={{ fontSize: 13 }}>| {preCo(s.engagement_id)?.period_label} | {Number(preCo(s.engagement_id)?.tb_rows ?? 0) > 0 ? `ميزان معتمد (${preCo(s.engagement_id)?.tb_rows} حساب)` : 'لا يوجد ميزان معتمد لهذه الفترة'} | ملكية {Number(s.ownership_pct)}% (تُعدّل من صفحة الارتباط)</span></h3></div> : null}
          <div className="row">{!isGroup && <><Field label="ارتباط التابعة"><select value={s.engagement_id} onChange={(e) => persist(subs.map((x, k) => k === i ? { ...x, engagement_id: e.target.value, period_id: '' } : x), costs)}><option value="">— اختر —</option>{engs?.engagements.filter((e) => e.id !== eng).map((e) => <option key={String(e.id)} value={String(e.id)}>{e.client_name} - {e.title}</option>)}</select></Field>
            <Field label="الفترة"><PeriodSelect engagementId={s.engagement_id} value={s.period_id} onChange={(v) => persist(subs.map((x, k) => k === i ? { ...x, period_id: v } : x), costs)} /></Field>
            </>}
            <Field label="نسبة الملكية %"><input style={{ width: 80 }} readOnly={isGroup} value={s.ownership_pct} onChange={(e) => persist(subs.map((x, k) => k === i ? { ...x, ownership_pct: e.target.value } : x), costs)} /></Field>
            <Field label="حصة الأرباح % (إن اختلفت)"><input style={{ width: 110 }} value={s.profit_share_pct} onChange={(e) => persist(subs.map((x, k) => k === i ? { ...x, profit_share_pct: e.target.value } : x), costs)} /></Field></div>
          <div className="row"><Field label="حساب الاستثمار لدى الأم (رموز)" hint={isGroup ? accNames(s.investment_codes_in_parent, pre?.parent.accounts) : 'مثال: 106021'}><input value={s.investment_codes_in_parent} onChange={(e) => persist(subs.map((x, k) => k === i ? { ...x, investment_codes_in_parent: e.target.value } : x), costs)} /></Field>
            <Field label="حساب جاري الأم لدى التابعة (رموز)" hint={isGroup ? accNames(s.parent_account_codes_in_sub, preCo(s.engagement_id)?.accounts) : 'مثال: 202005'}><input value={s.parent_account_codes_in_sub} onChange={(e) => persist(subs.map((x, k) => k === i ? { ...x, parent_account_codes_in_sub: e.target.value } : x), costs)} /></Field>
            <Field label="حساب جاري التابعة لدى الأم (رموز)" hint={isGroup && s.sub_account_codes_in_parent ? accNames(s.sub_account_codes_in_parent, pre?.parent.accounts) : 'اتركه فارغًا إن لم يوجد'}><input value={s.sub_account_codes_in_parent} onChange={(e) => persist(subs.map((x, k) => k === i ? { ...x, sub_account_codes_in_parent: e.target.value } : x), costs)} /></Field></div>
          <div className="row"><Field label="تاريخ اكتساب السيطرة" hint="من عقد التأسيس/السجل؛ فارغ = غير مُثبت"><input type="date" value={s.control_since} onChange={(e) => persist(subs.map((x, k) => k === i ? { ...x, control_since: e.target.value } : x), costs)} /></Field>
            <Field label="أساس السيطرة"><select value={s.control_basis} onChange={(e) => persist(subs.map((x, k) => k === i ? { ...x, control_basis: e.target.value as Sub['control_basis'] } : x), costs)}><option value="incorporation">تأسيس من الأم</option><option value="acquisition">شراء لاحق</option><option value="">غير محدد</option></select></Field>
            <Field label="طبيعة رصيد جاري الأم المدين لدى التابعة"><select value={s.claim_nature} onChange={(e) => persist(subs.map((x, k) => k === i ? { ...x, claim_nature: e.target.value as Sub['claim_nature'] } : x), costs)}><option value="provisional">مؤقت: اكتتاب غير مسدد بدلالة الأرصدة (يلزم إثباته)</option><option value="unpaid_subscription">اكتتاب غير مسدد موثق بالمستندات</option><option value="other">أخرى (قرض/تشغيلي) - لا يُطابق برأس المال</option></select></Field>
            <Field label="حقوق تعاقدية لغير الأم (للإفصاح)"><input value={s.other_equity_rights} onChange={(e) => persist(subs.map((x, k) => k === i ? { ...x, other_equity_rights: e.target.value } : x), costs)} placeholder="مثال: شريك بالعمل 0.00000001% من الأرباح" /></Field>
            <button className="btn sec sm" style={{ alignSelf: 'end' }} onClick={() => persist(subs.filter((_, k) => k !== i), costs)}>إزالة</button></div></div>)}
        {isGroup ? <p className="muted">الشركات التابعة تأتي من «شركات المجموعة» في صفحة ارتباط الأم؛ أضف أو أزل الشركات هناك. الحسابات مقترحة من أسماء الحسابات في الموازين؛ راجعها (يظهر اسم كل حساب ورصيده تحت الحقل) وعدّلها عند الحاجة.</p> : <button className="btn sec sm" onClick={() => persist([...subs, blankSub()], costs)}><Plus size={15} /> إضافة تابعة</button>}
      </div>
      <div className="card"><h2>شركات بلا قوائم (تُعرض بالقيمة الدفترية خارج ورقة العمل مؤقتًا)</h2>
        {costs.map((c, i) => <div key={c.key} className="row" style={{ marginBottom: 6 }}><Field label="الاسم"><input readOnly={isGroup && !!preCo(c.key)} value={c.label} onChange={(e) => persist(subs, costs.map((x, k) => k === i ? { ...x, label: e.target.value } : x))} /></Field><Field label="حساب الاستثمار لدى الأم" hint={isGroup && c.investment_codes_in_parent ? accNames(c.investment_codes_in_parent, pre?.parent.accounts) : undefined}><input value={c.investment_codes_in_parent} onChange={(e) => persist(subs, costs.map((x, k) => k === i ? { ...x, investment_codes_in_parent: e.target.value } : x))} /></Field><Field label="ذمم مدينة لدى الأم" hint={isGroup && c.receivable_codes_in_parent ? accNames(c.receivable_codes_in_parent, pre?.parent.accounts) : undefined}><input value={c.receivable_codes_in_parent} onChange={(e) => persist(subs, costs.map((x, k) => k === i ? { ...x, receivable_codes_in_parent: e.target.value } : x))} /></Field><Field label="ذمم دائنة لدى الأم" hint={isGroup && c.payable_codes_in_parent ? accNames(c.payable_codes_in_parent, pre?.parent.accounts) : undefined}><input value={c.payable_codes_in_parent} onChange={(e) => persist(subs, costs.map((x, k) => k === i ? { ...x, payable_codes_in_parent: e.target.value } : x))} /></Field>
          <Field label="السيطرة"><select value={c.control} onChange={(e) => persist(subs, costs.map((x, k) => k === i ? { ...x, control: e.target.value as AtCost['control'] } : x))}><option value="unknown">غير محددة</option><option value="controlled">قائمة (تابعة)</option><option value="not_controlled">غير قائمة</option></select></Field><Field label="ملاحظة"><input value={c.note} onChange={(e) => persist(subs, costs.map((x, k) => k === i ? { ...x, note: e.target.value } : x))} /></Field><button className="btn sec sm" style={{ alignSelf: 'end' }} onClick={() => persist(subs, costs.filter((_, k) => k !== i))}>إزالة</button></div>)}
        <button className="btn sec sm" onClick={() => persist(subs, [...costs, blankCost()])}><Plus size={15} /> إضافة شركة</button>
      </div>
      {R && <ConsolidationResult R={R} comp={comp} lastRunAt={last?.run?.started_at ?? null} />}
    </>}
  </Page>;
}

const nf = (v: unknown) => Number(v ?? 0);
const money = (v: unknown) => nf(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** تنسيق المبالغ داخل النصوص التوضيحية (مبالغ بكسور عشرية فقط؛ رموز الحسابات تبقى كما هي) */
const fmtNums = (s: unknown) => String(s ?? '').replace(/-?\d{4,}\.\d{2}(?!\d)/g, (m) => money(m));
const SECTION_LABEL: Record<string, string> = { current_assets: 'الأصول المتداولة', non_current_assets: 'الأصول غير المتداولة', unclassified: 'بنود غير مصنفة (ضمن الأصول)', current_liabilities: 'الالتزامات المتداولة', non_current_liabilities: 'الالتزامات غير المتداولة', equity: 'حقوق الملكية', nci: 'حقوق غير مسيطرة' };
const ok = (v: unknown) => Math.abs(nf(v)) < 0.005;

type WRow = { code: string; section: string; label_ar: string; per_company: Record<string, string>; aggregate: string; elimination_debit: string; elimination_credit: string; consolidated: string; unreconciled: string };
/** نتيجة التوحيد: ملخص، ورقة عمل بأقسام وإجماليات، قيود الاستبعاد، سجل الفروق، ومطابقة الاستثمار برأس المال */
function ConsolidationResult({ R, comp, lastRunAt }: { R: Record<string, any>; comp: Record<string, string>; lastRunAt: string | null }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const W = R.worksheet; const rows = W.rows as WRow[]; const keys = ['parent', ...R.subsidiaries.map((s: { key: string }) => s.key)];
  const lineLabel = Object.fromEntries(rows.map((r) => [r.code, r.label_ar])) as Record<string, string>;
  const sumBy = (rs: WRow[], f: (r: WRow) => unknown) => rs.reduce((a, r) => a + nf(f(r)), 0);
  const cols: { k: string; f: (r: WRow) => unknown }[] = [...keys.map((k) => ({ k, f: (r: WRow) => r.per_company[k] ?? 0 })), { k: 'agg', f: (r) => r.aggregate }, { k: 'dr', f: (r) => r.elimination_debit }, { k: 'cr', f: (r) => r.elimination_credit }, { k: 'cons', f: (r) => r.consolidated }, { k: 'unrec', f: (r) => r.unreconciled }];
  const group = (secs: string[]) => rows.filter((r) => secs.includes(r.section));
  const totalRow = (label: string, rs: WRow[], cls = 'total', skip: string[] = ['dr', 'cr']) => <tr className={cls}><td>{label}</td>{cols.map((c) => <td key={c.k} className="num">{skip.includes(c.k) ? '' : <Money v={String(sumBy(rs, c.f))} />}</td>)}</tr>;
  const assets = group(['current_assets', 'non_current_assets', 'unclassified']); const liabs = group(['current_liabilities', 'non_current_liabilities']); const equity = group(['equity', 'nci']);
  const check = cols.map((c) => sumBy(assets, c.f) - sumBy(liabs, c.f) - sumBy(equity, c.f));
  const conditional = (W.entries as { ref: string; support: string }[]).filter((e) => e.support !== 'documented').map((e) => e.ref);
  const netIncome = rows.find((r) => r.code === 'NET_INCOME');
  const T = W.totals;
  const section = (sec: string) => { const rs = group([sec]); if (!rs.length) return null; return <>
    <tr className="group"><td colSpan={cols.length + 1}>{SECTION_LABEL[sec] ?? sec}</td></tr>
    {rs.map((r) => <tr key={r.code}><td>{r.label_ar}</td>{cols.map((c) => <td key={c.k} className={`num${c.k === 'cons' ? ' strong' : ''}`}>{c.k === 'unrec' && ok(c.f(r)) ? '' : (c.k === 'dr' || c.k === 'cr') && ok(c.f(r)) ? '—' : <Money v={String(c.f(r))} />}</td>)}</tr>)}
    {rs.length > 1 && sec !== 'equity' && sec !== 'nci' && totalRow(`إجمالي ${SECTION_LABEL[sec]}`, rs, 'subtotal')}</>; };
  return <>
    <div className="card"><h2>النتيجة {lastRunAt && <span className="muted">(آخر تشغيل {fmtDate(lastRunAt, { time: true })})</span>}</h2>
      <p><span className={`badge ${R.status === 'supported' ? 'ok' : 'warn'}`}>{R.status === 'supported' ? 'مدعومة بالأدلة' : 'غير مكتملة - لا تُعتمد قائمة موحدة ولا قيمة نهائية'}</span></p>
      {R.pending_reasons.length > 0 && <ul>{R.pending_reasons.map((x: string) => <li key={x}>{fmtNums(x)}</li>)}</ul>}
      <div className="grid c2">
        <dl className="kv">
          <dt>حقوق ملكية الأم (القوائم المنفصلة)</dt><dd><Money v={R.parent.book_equity} /></dd>
          <dt>حقوق الملكية الموحدة بعد قيود الاستبعاد</dt><dd><b><Money v={R.group_equity_worksheet} /></b>{conditional.length > 0 && <div className="muted">تشمل قيودًا مشروطة ({conditional.join('، ')}) تعتمد على إثبات تصنيف جاري الأم لدى التابعة</div>}</dd>
          <dt>منها فروق بينية غير محسومة باقية ضمن الأصول</dt><dd><Money v={T.unreconciled_total} /></dd>
          <dt>حقوق الملكية لو ثبت أن هذه الفروق ليست أصولًا (فرضية)</dt><dd><Money v={R.hypothesis_unreconciled_not_assets} /></dd>
          <dt>حقوق غير مسيطرة</dt><dd><Money v={T.nci} /></dd>
        </dl>
        <dl className="kv">
          <dt>إجمالي الأصول الموحدة</dt><dd><Money v={T.assets} /></dd>
          <dt>إجمالي الالتزامات الموحدة</dt><dd><Money v={T.liabilities} /></dd>
          <dt>نتيجة الفترة الموحدة</dt><dd><Money v={netIncome?.consolidated ?? '0'} /></dd>
          <dt>فحص معادلة الميزانية الموحدة</dt><dd>{ok(T.equation_difference) ? <span className="badge ok">متوازنة (الفرق 0.00)</span> : <span className="badge danger">فرق <Money v={T.equation_difference} /></span>}</dd>
          <dt>توازن قيود الاستبعاد</dt><dd>مدين <Money v={T.eliminations_debit} /> = دائن <Money v={T.eliminations_credit} /> {ok(nf(T.eliminations_debit) - nf(T.eliminations_credit)) ? '✓' : '✗'}</dd>
          <dt>مطالبات التابعات على الأم بلا التزام مقابل في دفاتر الأم</dt><dd><Money v={R.checks?.unmatched_intercompany_total ?? 0} /></dd>
        </dl></div>
      {(W.scope ?? []).length > 0 && <><h3>شركات خارج ورقة العمل (بالقيمة الدفترية لدى الأم)</h3><table className="t ruled compact"><thead><tr><th>الشركة</th><th className="num">تكلفة الاستثمار</th><th className="num">ذمم مدينة لدى الأم</th><th className="num">ذمم دائنة لدى الأم</th><th>السيطرة</th><th>ملاحظة</th></tr></thead><tbody>
        {W.scope.map((x: Record<string, string>) => <tr key={x.key}><td>{x.label}</td><td className="num"><Money v={x.investment_cost} /></td><td className="num"><Money v={x.receivable} /></td><td className="num"><Money v={x.payable} /></td><td>{x.control === 'controlled' ? 'خاضعة للسيطرة' : x.control === 'not_controlled' ? 'غير خاضعة' : 'غير محددة'}</td><td className="wrap">{x.note}</td></tr>)}</tbody></table></>}
      <p className="muted">لإدراج هذه النتيجة في تقرير: افتح التقرير على ارتباط الأم ← «إضافة قسم» ← نوع «التوحيد الدفتري للمجموعة».</p></div>

    <div className="card"><h2>ورقة العمل</h2><p className="muted">المبالغ بالعرض الطبيعي لكل بند (الأصول مدينة، الالتزامات وحقوق الملكية دائنة). الموحد = المجمع ± قيود الاستبعاد.</p>
      <div className="tscroll" style={{ maxHeight: 'none' }}><table className="t ruled compact sticky1"><thead><tr><th>البند</th>{keys.map((k) => <th key={k} className="num">{comp[k]}</th>)}<th className="num">المجمع</th><th className="num">استبعاد مدين</th><th className="num">استبعاد دائن</th><th className="num">الموحد</th><th className="num">غير محسوم</th></tr></thead><tbody>
        {section('current_assets')}{section('non_current_assets')}{section('unclassified')}
        {totalRow('إجمالي الأصول', assets)}
        {section('current_liabilities')}{section('non_current_liabilities')}
        {totalRow('إجمالي الالتزامات', liabs)}
        {section('equity')}{section('nci')}
        {totalRow('إجمالي حقوق الملكية', equity)}
        {totalRow('إجمالي الالتزامات وحقوق الملكية', [...liabs, ...equity])}
        <tr className="check"><td>فحص: الأصول − (الالتزامات + حقوق الملكية)</td>{cols.map((c, i) => <td key={c.k} className="num">{c.k === 'dr' ? <Money v={T.eliminations_debit} /> : c.k === 'cr' ? <Money v={T.eliminations_credit} /> : c.k === 'unrec' ? '' : ok(check[i]) ? '✓ 0.00' : <span style={{ color: 'var(--danger)' }}>{money(check[i])}</span>}</td>)}</tr>
      </tbody></table></div></div>

    <div className="card"><h2>قيود الاستبعاد</h2>
      <div className="tscroll" style={{ maxHeight: 'none' }}><table className="t ruled compact"><thead><tr><th>البند (الحساب)</th><th>الدفاتر</th><th>البيان</th><th className="num">مدين</th><th className="num">دائن</th></tr></thead><tbody>
        {(W.entries as Record<string, any>[]).map((e) => <Fragment key={e.ref}>
          <tr className="group"><td colSpan={3}><span className="mono">{e.ref}</span> <span className={`badge ${e.support === 'documented' ? 'ok' : 'warn'}`}>{e.support === 'documented' ? 'مؤيد بالمستندات' : 'مشروط (تصنيف مؤقت)'}</span> {e.description}</td><td className="num"><Money v={e.total_debit} /></td><td className="num"><Money v={e.total_credit} /></td></tr>
          {(e.lines as Record<string, string>[]).map((l, i) => <tr key={i}><td>{lineLabel[l.line_code] ?? l.line_code}{l.account ? <span className="muted"> ({l.account})</span> : ''}</td><td>{comp[l.company] ?? l.company}</td><td className="wrap">{l.note}</td><td className="num">{ok(l.debit) ? '' : <Money v={l.debit} />}</td><td className="num">{ok(l.credit) ? '' : <Money v={l.credit} />}</td></tr>)}
          <tr><td colSpan={5} className="wrap muted" style={{ fontSize: 12 }}><b>الأساس:</b> {fmtNums(e.basis)}<br /><b>الأدلة:</b> {(e.evidence as string[]).map(fmtNums).join('؛ ')}</td></tr>
        </Fragment>)}</tbody></table></div></div>

    {W.register.length > 0 && <div className="card"><h2>سجل الفروق غير المحسومة</h2>
      <div className="tscroll" style={{ maxHeight: 'none' }}><table className="t ruled compact"><thead><tr><th>المرجع</th><th>الشركة</th><th>الوصف والاحتمالات</th><th className="num">المبلغ</th><th>الأثر الأقصى على حقوق الملكية</th><th>المسؤول</th><th>الدليل المطلوب</th></tr></thead><tbody>
        {(W.register as Record<string, any>[]).map((x) => <tr key={x.ref}><td className="mono">{x.ref}</td><td>{x.company}</td><td className="wrap" style={{ minWidth: 260 }}>{fmtNums(x.description)}<div className="muted">{(x.nature_hypotheses as string[]).map(fmtNums).join('؛ ')}</div></td><td className="num"><Money v={x.amount} /></td><td>{x.equity_effect === 'none' ? 'لا أثر' : x.equity_effect === 'immaterial' ? 'غير جوهري' : <Money v={x.max_equity_effect} />}</td><td className="wrap">{x.responsible}</td><td className="wrap">{(x.required_evidence as string[]).join('؛ ')}</td></tr>)}</tbody></table></div></div>}

    <div className="card"><h2>مطابقة الاستثمار برأس المال</h2>
      <p className="muted">هوية الافتتاح = رأس مال التابعة − مطالبتها الافتتاحية على الأم − استثمار الأم الافتتاحي (المتوقع صفر). هوية الحركة = صافي حركة الاستثمار لدى الأم − النقص في مطالبة التابعة خلال الفترة. الفرق الختامي = استثمار الأم الختامي − (رأس المال − مطالبة التابعة الختامية) = هوية الحركة − هوية الافتتاح.</p>
      <div className="tscroll" style={{ maxHeight: 'none' }}><table className="t ruled compact"><thead><tr><th>البند</th>{W.subsidiaries.map((s: Record<string, string>) => <th key={s.key} className="num">{s.label}</th>)}</tr></thead><tbody>
        {([
          ['group', 'استثمار الأم في التابعة'], ['افتتاحي', (s: any) => s.investment.opening], ['مدين خلال الفترة', (s: any) => s.investment.period_debit], ['دائن خلال الفترة', (s: any) => s.investment.period_credit], ['ختامي', (s: any) => s.investment.closing, 'subtotal'],
          ['group', 'مطالبة التابعة على الأم (جاري الأم لدى التابعة)'], ['افتتاحي', (s: any) => s.sub_claim_on_parent.opening], ['مدين خلال الفترة', (s: any) => s.sub_claim_on_parent.period_debit], ['دائن خلال الفترة', (s: any) => s.sub_claim_on_parent.period_credit], ['ختامي', (s: any) => s.sub_claim_on_parent.closing, 'subtotal'],
          ['group', 'المطابقة'], ['رأس مال التابعة', (s: any) => s.sub_capital], ['رأس المال المدفوع ضمنًا (رأس المال − المطالبة)', (s: any) => s.capital_matching.implied_paid_capital], ['هوية الافتتاح', (s: any) => s.capital_matching.identity_opening], ['هوية الحركة', (s: any) => s.capital_matching.identity_period], ['الفرق الختامي', (s: any) => s.capital_matching.investment_vs_implied_paid_capital, 'total'],
        ] as [string, any, string?][]).map(([a, b, cls], i) => a === 'group' ? <tr key={i} className="group"><td colSpan={W.subsidiaries.length + 1}>{b}</td></tr> : <tr key={i} className={cls ?? ''}><td>{a}</td>{W.subsidiaries.map((s: any) => <td key={s.key} className="num"><Money v={String(b(s) ?? 0)} /></td>)}</tr>)}
        <tr><td>تتطابق الهويتان مع الفرق؟</td>{W.subsidiaries.map((s: any) => <td key={s.key} className="num">{s.capital_matching.identity_reconciles ? '✓ نعم' : '✗ لا'}</td>)}</tr>
        <tr><td>تصنيف رصيد جاري الأم</td>{W.subsidiaries.map((s: any) => <td key={s.key} className="wrap">{s.capital_matching.claim_classification}</td>)}</tr>
        <tr><td>تاريخ اكتساب السيطرة</td>{W.subsidiaries.map((s: any) => <td key={s.key}>{s.control_since ? fmtDate(String(s.control_since)) : 'غير مُثبت'}</td>)}</tr>
        <tr><td>أثر التابعة على حقوق المجموعة</td>{W.subsidiaries.map((s: any) => <td key={s.key} className="wrap" style={{ fontSize: 12 }}>{fmtNums(s.bridge?.explanation)}</td>)}</tr>
      </tbody></table></div></div>
  </>;
}
