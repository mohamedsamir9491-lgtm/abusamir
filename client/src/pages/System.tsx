import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { get, put, post } from '../api';
import { Page, useLoad, Spinner, useAction, Field, Modal } from '../components/ui';
import { useAuth } from '../auth';
import { fmtDate } from '../format';

type Row = Record<string, string | number | boolean | null>;
export function System() {
  const { can } = useAuth(); const { run, busy } = useAction(); const [ai, setAi] = useState({ allow_external: false, share_client_names: false, training_opt_out: true as const }); const [ret, setRet] = useState({ documents_years: 10, reports_years: 10, audit_log_years: 7, auto_delete: false }); const [delReq, setDelReq] = useState(false); const [dr, setDr] = useState({ client_id: '', scope: 'client', reason: '' }); const [verify, setVerify] = useState<Record<string, unknown> | null>(null);
  const { data, loading, reload } = useLoad(() => get<{ settings: { ai_policy: typeof ai; retention_policy: typeof ret }; env: Record<string, string | boolean | number> }>('/system/settings'), []);
  const { data: backups, reload: reloadB } = useLoad(() => can('system.manage') ? get<{ backups: Row[] }>('/system/backups') : Promise.resolve({ backups: [] }), []);
  const { data: dels, reload: reloadD } = useLoad(() => can('data.delete') ? get<{ requests: Row[] }>('/system/deletion-requests') : Promise.resolve({ requests: [] }), []);
  const { data: clients } = useLoad(() => get<{ clients: Row[] }>('/clients'), []);
  useEffect(() => { if (data) { setAi(data.settings.ai_policy); setRet(data.settings.retention_policy); } }, [data]);
  if (loading || !data) return <Spinner />;
  const manage = can('system.manage');
  return <Page title="إعدادات النظام" sub="سياسات الذكاء الاصطناعي والاحتفاظ بالبيانات، النسخ الاحتياطي، وطلبات الحذف">
    <FiscalYearCard />
    <OfficePoliciesCard />
    <ThresholdsCard />
    <div className="grid c2">
      <div className="card"><h2>بيئة الخادم</h2><dl className="kv"><dt>مزوّد الذكاء الاصطناعي</dt><dd className="mono">{String(data.env.ai_provider)}</dd><dt>السماح بالإرسال الخارجي (خادم)</dt><dd>{data.env.ai_allow_external ? 'نعم' : 'لا'}</dd><dt>تشفير الملفات المخزنة</dt><dd>{data.env.file_encryption ? 'مفعّل (AES-256-GCM)' : 'غير مفعّل — اضبط FILE_ENCRYPTION_KEY'}</dd><dt>الحد الأقصى للرفع</dt><dd>{String(data.env.max_upload_mb)} MB</dd><dt>البيئة</dt><dd className="mono">{String(data.env.node_env)}</dd></dl></div>
      <div className="card"><h2>سياسة الذكاء الاصطناعي</h2><fieldset disabled={!manage} style={{ border: 0, padding: 0 }}><label className="row"><input type="checkbox" checked={ai.allow_external} onChange={(e) => setAi({ ...ai, allow_external: e.target.checked })} /> السماح بإرسال بيانات العملاء المهيكلة لمزوّد خارجي (يتطلب تفويضًا تعاقديًا)</label><label className="row"><input type="checkbox" checked={ai.share_client_names} onChange={(e) => setAi({ ...ai, share_client_names: e.target.checked })} /> إرسال أسماء العملاء (الافتراضي: إخفاؤها)</label><label className="row"><input type="checkbox" checked disabled /> عدم استخدام البيانات للتدريب (ثابت)</label>{manage && <button className="btn sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => run(() => put('/system/settings/ai_policy', ai), 'تم الحفظ').then(reload)}>حفظ</button>}</fieldset>
        <h2>سياسة الاحتفاظ بالبيانات</h2><fieldset disabled={!manage} style={{ border: 0, padding: 0 }}><div className="grid c3"><Field label="المستندات (سنوات)"><input type="number" value={ret.documents_years} onChange={(e) => setRet({ ...ret, documents_years: Number(e.target.value) })} /></Field><Field label="التقارير (سنوات)"><input type="number" value={ret.reports_years} onChange={(e) => setRet({ ...ret, reports_years: Number(e.target.value) })} /></Field><Field label="سجل التدقيق (سنوات)"><input type="number" value={ret.audit_log_years} onChange={(e) => setRet({ ...ret, audit_log_years: Number(e.target.value) })} /></Field></div><label className="row"><input type="checkbox" checked={ret.auto_delete} onChange={(e) => setRet({ ...ret, auto_delete: e.target.checked })} /> حذف تلقائي بعد انتهاء المدة (غير موصى به؛ الحذف يتم عبر طلبات معتمدة)</label>{manage && <button className="btn sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => run(() => put('/system/settings/retention_policy', ret), 'تم الحفظ').then(reload)}>حفظ</button>}</fieldset></div>
    </div>
    {manage && <div className="card"><h2>النسخ الاحتياطي</h2><p className="muted">pg_dump بصيغة مخصصة + أرشيف الملفات المرفوعة. للاستعادة: <span className="mono">pg_restore --clean --if-exists -d $DATABASE_URL backup.dump</span> ثم فك أرشيف الملفات في مجلد التخزين. اختبار الاستعادة يتحقق من سلامة الأرشيف دون كتابة.</p><button className="btn" disabled={busy} onClick={() => run(() => post('/system/backups'), 'تم إنشاء النسخة').then(reloadB)}>إنشاء نسخة احتياطية الآن</button>
      <table className="t" style={{ marginTop: 10 }}><thead><tr><th>النسخة</th><th>الحجم</th><th>التاريخ</th><th>أرشيف ملفات</th><th></th></tr></thead><tbody>{backups?.backups.map((b) => <tr key={String(b.name)}><td className="mono">{b.name}</td><td className="num">{(Number(b.size_bytes) / 1024 / 1024).toFixed(2)} MB</td><td>{fmtDate(String(b.created_at), { time: true })}</td><td>{b.has_files_archive ? 'نعم' : 'لا'}</td><td><button className="btn sec sm" onClick={async () => { const r = await run(() => post<Record<string, unknown>>(`/system/backups/${b.name}/verify`)); if (r) setVerify(r); }}>اختبار الاستعادة</button></td></tr>)}</tbody></table>{verify && <div className={`alert ${verify.valid ? 'ok' : 'danger'}`}>{verify.valid ? `النسخة سليمة (${verify.table_data_entries} جدول بيانات)` : 'النسخة غير سليمة'} — {String(verify.note)}</div>}</div>}
    {can('data.delete') && <div className="card"><div className="row between"><h2>طلبات حذف البيانات</h2><button className="btn sec" onClick={() => setDelReq(true)}><Plus size={15} /> طلب حذف</button></div><p className="muted">الطلب يقدمه مستخدم ويعتمده مدير نظام مختلف (فصل المهام) ثم يُنفذ. يُحذف المستندات والسجلات المالية مع الإبقاء على سجل التدقيق.</p>
      <table className="t"><thead><tr><th>العميل</th><th>النطاق</th><th>السبب</th><th>الحالة</th><th>مقدم الطلب</th><th>التاريخ</th><th></th></tr></thead><tbody>{dels?.requests.map((d) => <tr key={String(d.id)}><td>{d.client_name}</td><td>{d.scope}</td><td>{d.reason}</td><td><span className="badge neutral">{d.status}</span></td><td>{d.requested_by_name}</td><td>{fmtDate(String(d.created_at))}</td><td className="row">{manage && d.status === 'requested' && <><button className="btn sm" onClick={() => run(() => post(`/system/deletion-requests/${d.id}/approve`), 'اعتُمد').then(reloadD)}>اعتماد</button><button className="btn sec sm" onClick={() => run(() => post(`/system/deletion-requests/${d.id}/reject`), 'رُفض').then(reloadD)}>رفض</button></>}{manage && d.status === 'approved' && <button className="btn danger sm" onClick={() => confirm('تنفيذ الحذف نهائي للبيانات المالية والمستندات. متابعة؟') && run(() => post(`/system/deletion-requests/${d.id}/execute`), 'نُفذ الحذف').then(reloadD)}>تنفيذ الحذف</button>}</td></tr>)}</tbody></table></div>}
    {delReq && <Modal title="طلب حذف بيانات" onClose={() => setDelReq(false)}><Field label="العميل"><select value={dr.client_id} onChange={(e) => setDr({ ...dr, client_id: e.target.value })}><option value="">—</option>{clients?.clients.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.legal_name_ar}</option>)}</select></Field><Field label="النطاق"><select value={dr.scope} onChange={(e) => setDr({ ...dr, scope: e.target.value })}><option value="client">كل بيانات العميل</option><option value="documents">المستندات فقط</option></select></Field><Field label="السبب (التزام تعاقدي/نظامي)"><textarea value={dr.reason} onChange={(e) => setDr({ ...dr, reason: e.target.value })} /></Field><div className="row end"><button className="btn danger" disabled={!dr.client_id || dr.reason.length < 5} onClick={async () => { await run(() => post('/system/deletion-requests', dr), 'سُجل الطلب'); setDelReq(false); reloadD(); }}>تقديم الطلب</button></div></Modal>}
  </Page>;
}

/** السنة المالية الحالية للمكتب: تلقائية من تاريخ اليوم، أو مضبوطة يدويًا (مثلًا أثناء إقفال السنة السابقة) */
function FiscalYearCard() {
  const { can } = useAuth(); const { run, busy } = useAction();
  const { data, reload } = useLoad(() => get<{ year: number; auto: boolean; setting: number | null; today: string }>('/office/fiscal-year'), []);
  const [auto, setAuto] = useState(true); const [year, setYear] = useState(0);
  useEffect(() => { if (data) { setAuto(data.auto); setYear(data.setting ?? data.year); } }, [data]);
  if (!data) return null;
  const save = async () => { await run(() => put('/office', { current_fiscal_year: auto ? null : year }), 'حُفظت السنة المالية'); reload(); window.dispatchEvent(new Event('fiscal-year-changed')); };
  return <div className="card"><h2>السنة المالية الحالية</h2>
    <p>السنة المعتمدة الآن: <b>{data.year}</b> {data.auto ? <span className="badge ok">تلقائية من تاريخ اليوم ({fmtDate(data.today)})</span> : <span className="badge warn">مضبوطة يدويًا</span>}</p>
    <p className="muted">تُستخدم افتراضيًا لكل ارتباط جديد (الفترة الحالية = هذه السنة، والسابقة = التي قبلها)، مع مراعاة نهاية السنة المالية لكل عميل. تنتقل تلقائيًا إلى السنة الجديدة مع بداية كل سنة ما لم تُضبط يدويًا.</p>
    <fieldset disabled={!can('office.manage')} style={{ border: 0, padding: 0 }}><div className="row">
      <label className="row"><input type="radio" checked={auto} onChange={() => setAuto(true)} style={{ width: 'auto' }} /> تلقائية</label>
      <label className="row"><input type="radio" checked={!auto} onChange={() => setAuto(false)} style={{ width: 'auto' }} /> يدوية:</label>
      <input type="number" min={2000} max={2100} value={year || ''} onChange={(e) => setYear(Number(e.target.value))} disabled={auto} style={{ width: 110 }} dir="ltr" />
      <button className="btn" onClick={save} disabled={busy || (!auto && (year < 2000 || year > 2100))}>حفظ</button></div></fieldset></div>;
}

type MatPolicy = { benchmark: 'auto' | 'pbt' | 'revenue' | 'total_assets' | 'largest'; pbt_pct: number; revenue_pct: number; assets_pct: number; min_amount: number };
const APPROVAL: [string, string, string][] = [
  ['single', 'مستخدم واحد', 'يراجع مُعد التقرير تقريره ويعتمده بنفسه، ويُكتب في التقرير صراحةً أنه روجع واعتُمد من المُعد نفسه دون فصل مهام.'],
  ['managers', 'المدير يعتمد ما أعدّه', 'المراجعة المهنية من مستخدم آخر غير المُعد، ويُسمح للمدير العام ومدير المكتب فقط باعتماد تقرير أعدّاه.'],
  ['separate', 'فصل كامل للمهام', 'لا يراجع أحد ولا يعتمد تقريرًا أعدّه، ولو كان مديرًا (ISA 220 / ISQM 1).'],
];
const BENCH: [MatPolicy['benchmark'], string][] = [
  ['auto', 'تلقائي: الربح قبل الزكاة والضريبة إن كانت المنشأة رابحة، وإلا الإيرادات، وإلا الأصول'],
  ['pbt', 'الربح قبل الزكاة والضريبة'], ['revenue', 'إجمالي الإيرادات'], ['total_assets', 'إجمالي الأصول'], ['largest', 'الأكبر من نسبة الإيرادات ونسبة الأصول (الطريقة السابقة)'],
];
/** سياسات المكتب: اعتماد التقارير والأهمية النسبية الافتراضية */
function OfficePoliciesCard() {
  const { can } = useAuth(); const { run, busy } = useAction();
  const { data, reload } = useLoad(() => get<{ settings: { report_approval_policy?: string; materiality_policy?: MatPolicy } }>('/office'), []);
  const [ap, setAp] = useState('managers'); const [mp, setMp] = useState<MatPolicy>({ benchmark: 'auto', pbt_pct: 5, revenue_pct: 1, assets_pct: 0.5, min_amount: 1000 });
  useEffect(() => { if (data) { setAp(data.settings.report_approval_policy ?? 'managers'); if (data.settings.materiality_policy) setMp(data.settings.materiality_policy); } }, [data]);
  if (!data) return null;
  const ok = mp.pbt_pct >= 0.1 && mp.pbt_pct <= 20 && mp.revenue_pct >= 0.05 && mp.revenue_pct <= 10 && mp.assets_pct >= 0.05 && mp.assets_pct <= 10 && mp.min_amount >= 0;
  const save = async () => { await run(() => put('/office', { report_approval_policy: ap, materiality_policy: mp }), 'حُفظت سياسات المكتب'); reload(); };
  const num = (k: keyof MatPolicy, v: string) => setMp({ ...mp, [k]: Number(v) });
  return <div className="card"><h2>سياسات المكتب</h2>
    <fieldset disabled={!can('office.manage')} style={{ border: 0, padding: 0 }}>
      <h3 style={{ marginTop: 0 }}>اعتماد التقارير</h3>
      {APPROVAL.map(([k, t, d]) => <label key={k} className="row" style={{ alignItems: 'flex-start', marginBottom: 6 }}><input type="radio" name="ap" checked={ap === k} onChange={() => setAp(k)} style={{ width: 'auto', marginTop: 4 }} /><span><b>{t}</b><br /><span className="muted">{d}</span></span></label>)}
      <h3>الأهمية النسبية الافتراضية</h3>
      <p className="muted" style={{ marginTop: 0 }}>تحديد الأهمية النسبية حكم مهني (ISA 320). الفقرة أ8 من المعيار تذكر أمثلة: 5% من الربح قبل الزكاة والضريبة لمنشأة هادفة للربح، و1% من الإيرادات أو المصروفات. نسبة الأصول اجتهاد للمكتب. تُطبق هذه السياسة ما لم تُحدد الأهمية يدويًا للارتباط، ويُذكر أساسها في التقرير.</p>
      <Field label="الأساس المرجعي"><select value={mp.benchmark} onChange={(e) => setMp({ ...mp, benchmark: e.target.value as MatPolicy['benchmark'] })}>{BENCH.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
      <div className="grid c4">
        <Field label="% من الربح قبل الزكاة والضريبة"><input type="number" step={0.5} min={0.1} max={20} value={mp.pbt_pct} onChange={(e) => num('pbt_pct', e.target.value)} dir="ltr" /></Field>
        <Field label="% من الإيرادات"><input type="number" step={0.1} min={0.05} max={10} value={mp.revenue_pct} onChange={(e) => num('revenue_pct', e.target.value)} dir="ltr" /></Field>
        <Field label="% من الأصول"><input type="number" step={0.1} min={0.05} max={10} value={mp.assets_pct} onChange={(e) => num('assets_pct', e.target.value)} dir="ltr" /></Field>
        <Field label="الحد الأدنى (بعملة العرض)"><input type="number" step={100} min={0} value={mp.min_amount} onChange={(e) => num('min_amount', e.target.value)} dir="ltr" /></Field>
      </div>
      <button className="btn" onClick={save} disabled={busy || !ok}>حفظ السياسات</button>
    </fieldset></div>;
}

/** عتبات التحليل: اجتهاد المكتب (ليست نصوصًا في المعايير) وتُذكر كذلك في كل ملاحظة تستخدمها */
const TH: [string, string, string, number][] = [
  ['variance_pct', 'تغير مجاميع القوائم عن الفترة السابقة', '%', 10], ['material_change_pct', 'تغير رصيد الحساب عن الفترة السابقة', '%', 25],
  ['current_ratio_min', 'الحد الأدنى لنسبة التداول', 'مرة', 1], ['ocf_to_profit_min', 'الحد الأدنى للتدفق التشغيلي ÷ صافي الربح', 'مرة', 0.5],
  ['dso_max_days', 'الحد الأعلى لفترة تحصيل الذمم', 'يوم', 120], ['concentration_pct', 'تركّز طرف واحد في الذمم المدينة أو الدائنة', '%', 40],
  ['expense_concentration_pct', 'تركّز بند واحد في المصروفات', '%', 40], ['related_party_pct', 'أرصدة الأطراف ذات العلاقة إلى الأصول (متوسطة)', '%', 20],
  ['related_party_high_pct', 'أرصدة الأطراف ذات العلاقة إلى الأصول (مرتفعة)', '%', 40], ['deferred_revenue_pct', 'الإيراد المؤجل إلى إيراد الفترة', '%', 30],
  ['lease_interest_min_pct', 'الحد الأدنى لفائدة التزام الإيجار', '%', 0.2],
  ['risk_cr_high', 'مخاطر السيولة: مرتفعة إذا نسبة التداول أقل من', 'مرة', 1], ['risk_cr_medium', 'مخاطر السيولة: متوسطة إذا أقل من', 'مرة', 1.5],
  ['risk_margin_medium_pct', 'مخاطر الربحية: متوسطة إذا هامش الربح أقل من', '%', 5], ['risk_de_high', 'مخاطر المديونية: مرتفعة إذا الالتزامات ÷ حقوق الملكية أكبر من', 'مرة', 2],
  ['risk_de_medium', 'مخاطر المديونية: متوسطة إذا أكبر من', 'مرة', 1], ['risk_wc_medium_pct', 'رأس المال العامل: متوسطة إذا أقل من (من الأصول المتداولة)', '%', 10],
  ['request_essential_pct', 'طلب المستندات «أساسي» إذا بلغ أثره من الأصول', '%', 5], ['request_supporting_pct', 'طلب المستندات «داعم» إذا بلغ أثره من الأصول', '%', 1],
];
function ThresholdsCard() {
  const { can } = useAuth(); const { run, busy } = useAction();
  const { data, reload } = useLoad(() => get<{ settings: { analysis_thresholds?: Record<string, number> } }>('/office'), []);
  const [v, setV] = useState<Record<string, number>>({});
  useEffect(() => { if (data) setV(Object.fromEntries(TH.map(([k, , , d]) => [k, Number(data.settings.analysis_thresholds?.[k] ?? d)]))); }, [data]);
  if (!data) return null;
  const changed = TH.filter(([k, , , d]) => v[k] !== d).length;
  const save = async () => { await run(() => put('/office', { analysis_thresholds: v }), 'حُفظت عتبات التحليل'); reload(); };
  return <div className="card"><h2>عتبات التحليل</h2>
    <p className="muted" style={{ marginTop: 0 }}>هذه العتبات اجتهاد المكتب وليست نصوصًا في المعايير؛ تحدد متى تُصدر الملاحظة ودرجتها، ويُذكر في كل ملاحظة أنها اجتهاد. تسري على التحليل القادم. {changed ? <b>({changed} معدّلة عن الافتراضي)</b> : null}</p>
    <fieldset disabled={!can('office.manage')} style={{ border: 0, padding: 0 }}>
      <div className="grid c3">{TH.map(([k, label, unit, d]) => <Field key={k} label={`${label} (${unit})`}><input type="number" step="any" min={0} value={v[k] ?? d} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} dir="ltr" title={`الافتراضي ${d}`} /></Field>)}</div>
      <div className="row"><button className="btn" onClick={save} disabled={busy}>حفظ العتبات</button><button className="btn sec" onClick={() => setV(Object.fromEntries(TH.map(([k, , , d]) => [k, d])))} disabled={busy}>استعادة الافتراضي</button></div>
    </fieldset></div>;
}
