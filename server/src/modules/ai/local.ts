import { getOfficeSettings } from '../office/routes.js';
import { thresholdsOf, DEFAULT_THRESHOLDS, type AnalysisThresholds } from '../../lib/thresholds.js';
/**
 * المحاسب الذكي المحلي: تحليل ومحادثة قائمان على قواعد محاسبية وبيانات البرنامج فقط، بلا أي اتصال خارجي.
 * كل رقم في المخرجات مأخوذ من الميزان/القوائم/الملاحظات المحسوبة في البرنامج ومعه مصدره؛ لا تُخترع أرقام ولا نسب ضرائب.
 */
import { many, one } from '../../db/pool.js';
import { badRequest } from '../../lib/errors.js';
import { loadPeriod } from '../../middleware/scope.js';
import { getStatementsPackage, loadTbEntries, loadAccountMap, latestRun, findPriorPeriod } from '../analysis/service.js';
import { buildStatements } from '../../engine/statements.js';
import { computeRatios } from '../../engine/ratios.js';
import { resolveMeta, prefixMapFor } from '../../engine/trialBalance.js';
import { FS_LINE_MAP } from '../../engine/fsLines.js';
import { net, toStr } from '../../engine/money.js';
import { periodPhrase, isFullYear } from '../../lib/periods.js';
import { listComponents, matchingPeriod } from '../engagements/group.js';
import type { AiAnalysis } from './schema.js';
import type { EngineFinding, TbEntry } from '../../engine/types.js';

export interface Acc { code: string; name: string; fs: string; label: string; section: string; statement: string; opening: number; debit: number; credit: number; closing: number }
export interface LocalContext {
  engagementId: string; periodId: string; clientId: string; company: string; currency: string; entityType: string;
  T?: AnalysisThresholds; // عتبات المكتب (الافتراضي عند غيابها)
  period: { label: string; start: string; end: string; phrase: string; full: boolean; days: number };
  accounts: Acc[]; kf: Record<string, number>; st: ReturnType<typeof buildStatements>; ratios: ReturnType<typeof computeRatios>;
  prior: { label: string } | null; variance: { key: string; label_ar: string; current: string; comparative: string; change: string; change_pct: string | null; material: boolean }[];
  findings: { ref: string; rule: string | null; severity: string; title: string; description: string; amount: string | null; category: string; account?: string | null }[];
  group: null | { companies: { name: string; role: string; ownership: string | null; engagementId: string; periodId: string | null }[]; consolidation: Record<string, any> | null }; // eslint-disable-line @typescript-eslint/no-explicit-any
  official: { title: string; type?: string; fields: Record<string, { value: any }> }[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  statementsGeneratedAt: string | null;
}
const n = (v: unknown) => Number(v ?? 0) || 0;
export const money = (v: number) => (v < 0 ? `(${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** الجزء الحسابي الخالص من السياق (بلا قاعدة بيانات): الحسابات المصنفة والقوائم والنسب */
export function accountsCore(entries: TbEntry[], amap: Parameters<typeof buildStatements>[0]['accounts'], label: string, days: number, stIn?: ReturnType<typeof buildStatements>, ratiosIn?: ReturnType<typeof computeRatios>) {
  const pm = prefixMapFor(entries);
  const accounts: Acc[] = entries.map((t) => { const m = resolveMeta(t, amap, pm); const L = FS_LINE_MAP[m.fs_line_code];
    return { code: t.account_code, name: t.account_name ?? '', fs: m.fs_line_code, label: L?.label_ar ?? m.fs_line_code, section: L?.section ?? 'unclassified', statement: L?.statement ?? 'sfp', opening: n(toStr(net(t.opening_debit, t.opening_credit))), debit: n(t.period_debit), credit: n(t.period_credit), closing: n(toStr(net(t.closing_debit, t.closing_credit))) }; });
  const st = stIn ?? buildStatements({ current: entries, accounts: amap, periodLabel: label });
  const ratios = ratiosIn ?? computeRatios(st.key_figures, { periodDays: days });
  const kf = Object.fromEntries(Object.entries(st.key_figures).map(([k, v]) => [k, n(v)]));
  return { accounts, st, ratios, kf };
}

export async function buildLocalContext(engagementId: string, periodId: string): Promise<LocalContext> {
  const e = await one<{ id: string; client_id: string; currency: string; client_name: string; entity_type: string; group_engagement_id: string | null }>(`SELECT e.id, e.client_id, e.currency, c.legal_name_ar AS client_name, c.entity_type, e.group_engagement_id FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.id = $1`, [engagementId]);
  if (!e) throw badRequest('الارتباط غير موجود');
  const p = await loadPeriod(periodId, engagementId);
  const entries = await loadTbEntries(periodId);
  if (!entries.length) throw badRequest('لا يوجد ميزان معتمد لهذه الفترة؛ استورد الميزان أولًا');
  const amap = await loadAccountMap(e.client_id);
  const pkg = await getStatementsPackage(periodId);
  const days = Math.round((Date.parse(p.end_date) - Date.parse(p.start_date)) / 86400000) + 1;
  const core = accountsCore(entries, amap, p.label, days, pkg?.data.statements, pkg?.data.ratios);
  const { accounts, st, ratios, kf } = core;
  const prior = (pkg?.data.prior as { label: string } | null | undefined) ?? (await findPriorPeriod(engagementId, e.client_id, periodId)) ?? null;
  const variance = ((pkg?.data.variance as { rows?: LocalContext['variance'] } | null)?.rows ?? []);
  const findings = await many<{ ref: string; rule: string | null; severity: string; title: string; description: string; amount: string | null; category: string; account: string | null }>(`SELECT finding_ref AS ref, rule_code AS rule, severity, title, description, amount, category, account_code AS account FROM findings WHERE period_id = $1 AND review_status IN ('open','under_review') ORDER BY CASE severity WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END DESC, COALESCE(amount,0) DESC`, [periodId]);
  let group: LocalContext['group'] = null;
  const rootId = e.group_engagement_id ?? e.id; const comps = await listComponents(rootId);
  if (comps.length) {
    const rp = e.group_engagement_id ? await matchingPeriod(rootId, p.start_date, p.end_date) : { id: periodId };
    const cons = rp ? await latestRun(rp.id, 'consolidation') : null;
    const rootName = (await one<{ n: string }>('SELECT c.legal_name_ar AS n FROM engagements x JOIN clients c ON c.id = x.client_id WHERE x.id = $1', [rootId]))?.n ?? '';
    group = { companies: [{ name: rootName, role: 'parent', ownership: null, engagementId: rootId, periodId: rp?.id ?? null }, ...await Promise.all(comps.map(async (c) => ({ name: c.client_name, role: c.entity_role, ownership: c.ownership_pct, engagementId: c.id, periodId: (await matchingPeriod(c.id, p.start_date, p.end_date))?.id ?? null })))], consolidation: (cons?.result as Record<string, unknown> | null) ?? null };
  }
  const official = await many<{ title: string; type: string; fields: Record<string, { value: unknown }> }>(`SELECT d.title, d.document_type AS type, r.fields FROM official_records r JOIN source_documents d ON d.id = r.document_id WHERE r.engagement_id = $1 AND r.status = 'confirmed'`, [engagementId]);
  const T = thresholdsOf((await getOfficeSettings() as { analysis_thresholds?: unknown }).analysis_thresholds);
  return { T, engagementId, periodId, clientId: e.client_id, company: e.client_name, currency: e.currency, entityType: e.entity_type,
    period: { label: p.label, start: p.start_date, end: p.end_date, phrase: periodPhrase(p.start_date, p.end_date), full: isFullYear(p.start_date, p.end_date), days },
    accounts, kf, st, ratios, prior: prior ? { label: (prior as { label: string }).label } : null, variance, findings, group, official, statementsGeneratedAt: pkg?.generated_at ?? null };
}

const byFs = (c: LocalContext, ...codes: string[]) => c.accounts.filter((a) => codes.includes(a.fs));
const sumClose = (as: Acc[]) => as.reduce((s, a) => s + a.closing, 0);
const expenseAccounts = (c: LocalContext) => c.accounts.filter((a) => a.statement === 'pl' && a.closing > 0 && !['REVENUE', 'OTHER_INCOME'].includes(a.fs));

/** إجراءات تحليلية محلية (قواعد) تكمّل فحوصات الميزان؛ رموزها LA- */
export function localObservations(c: LocalContext): EngineFinding[] {
  const T = c.T ?? DEFAULT_THRESHOLDS;
  const out: EngineFinding[] = []; const k = c.kf; const add = (f: Omit<EngineFinding, 'dedupe_key'>) => out.push({ ...f, dedupe_key: `${f.rule_code}:${f.account_code ?? f.fs_line_code ?? ''}` });
  const dep = n(k.depreciation);
  // أصول قابلة للاستهلاك دون استهلاك مسجل في الفترة
  const ppe = byFs(c, 'PPE').filter((a) => a.closing > 0); const intang = byFs(c, 'INTANGIBLES').filter((a) => a.closing > 0); const rou = byFs(c, 'ROU_ASSETS').filter((a) => a.closing > 0);
  const accDepMoved = byFs(c, 'ACC_DEP').some((a) => Math.abs(a.closing - a.opening) > 0.01);
  if (ppe.length && dep === 0 && !accDepMoved) add({ rule_code: 'LA-001', category: 'accounting_issue', severity: 'medium', title: `لم يُسجل استهلاك للممتلكات والمعدات خلال الفترة (رصيدها ${money(sumClose(ppe))})`, description: `يوجد ممتلكات ومعدات بقيمة ${money(sumClose(ppe))} ولا يظهر مصروف استهلاك ولا حركة في مجمع الاستهلاك ${c.period.phrase}. IAS 16 يتطلب توزيع تكلفة الأصل على عمره الإنتاجي؛ عدم التسجيل يضخم الأصول والنتيجة.`, fs_line_code: 'PPE', amount: String(sumClose(ppe)), evidence: { accounts: ppe.map((a) => a.code), depreciation: dep }, recommendation: 'طلب جدول الأصول والاستهلاك وإثبات استهلاك الفترة.' });
  if (intang.length && dep === 0) add({ rule_code: 'LA-002', category: 'accounting_issue', severity: 'medium', title: `لم يُسجل إطفاء للأصول غير الملموسة خلال الفترة (رصيدها ${money(sumClose(intang))})`, description: `أصول غير ملموسة بقيمة ${money(sumClose(intang))} دون مصروف إطفاء ${c.period.phrase}. IAS 38 يتطلب إطفاء الأصول ذات العمر المحدد.`, fs_line_code: 'INTANGIBLES', amount: String(sumClose(intang)), evidence: { accounts: intang.map((a) => a.code) }, recommendation: 'تحديد العمر الإنتاجي وإثبات الإطفاء أو توثيق أن العمر غير محدد مع اختبار الهبوط.' });
  if (rou.length) {
    const rouOpen = rou.reduce((s, a) => s + a.opening, 0), rouClose = sumClose(rou);
    if (dep === 0 && rouClose > 0) add({ rule_code: 'LA-003', category: 'accounting_issue', severity: 'high', title: `أصل حق الاستخدام (${money(rouClose)}) دون استهلاك مسجل`, description: `IFRS 16 يتطلب استهلاك أصل حق الاستخدام على مدة العقد (أو العمر الإنتاجي إن كان أقصر). لا يظهر مصروف استهلاك ${c.period.phrase}${rouOpen === 0 ? '، والأصل أُثبت خلالها' : ''}؛ يلزم احتساب استهلاك الفترة من تاريخ بدء العقد.`, fs_line_code: 'ROU_ASSETS', amount: String(rouClose), evidence: { rou_opening: rouOpen, rou_closing: rouClose, depreciation: dep }, recommendation: 'طلب عقد الإيجار وجدول الاستهلاك والفائدة وإثبات القيود.' });
    const lease = sumClose(byFs(c, 'LEASE_LIAB_CURRENT', 'LEASE_LIAB_NON_CURRENT')); const fc = n(k.finance_cost);
    if (lease < -1 && fc < Math.abs(lease) * T.lease_interest_min_pct / 100) add({ rule_code: 'LA-004', category: 'accounting_issue', severity: 'medium', title: `التزام إيجار (${money(Math.abs(lease))}) دون مصروف فائدة يُذكر`, description: `مصروف التمويل ${money(fc)} فقط مقابل التزام إيجار ${money(Math.abs(lease))}. IFRS 16 يتطلب إثبات فائدة على التزام الإيجار بمعدل الخصم؛ غيابها يعني أن التزام الإيجار لم يُحدَّث.`, fs_line_code: 'LEASE_LIAB_NON_CURRENT', amount: String(Math.abs(lease)), evidence: { lease_liability: lease, finance_cost: fc }, recommendation: 'إعداد جدول إطفاء التزام الإيجار وإثبات الفائدة والدفعات.' });
  }
  // رواتب مستحقة دون مصروف رواتب
  const accr = c.accounts.filter((a) => a.closing < -1 && /رواتب|أجور|اجور|موظفين/.test(a.name) && a.statement === 'sfp');
  const salaryExp = c.accounts.filter((a) => a.statement === 'pl' && /رواتب|أجور|اجور|موظف/.test(a.name)).reduce((s, a) => s + a.closing, 0);
  if (accr.length && salaryExp <= 0) add({ rule_code: 'LA-005', category: 'accounting_issue', severity: 'medium', title: `رواتب ومستحقات موظفين (${money(Math.abs(sumClose(accr)))}) دون مصروف رواتب في الفترة`, description: `يظهر في الالتزامات ${accr.map((a) => `${a.code} ${a.name}`).join('، ')} بينما لا يظهر مصروف رواتب ${c.period.phrase}. إما أن المستحقات قديمة لم تُسدد أو أن مصروف الفترة لم يُسجل.`, account_code: accr[0]!.code, account_name: accr[0]!.name, amount: String(Math.abs(sumClose(accr))), evidence: { accounts: accr.map((a) => a.code), salary_expense: salaryExp }, recommendation: 'طلب مسيرات الرواتب ومطابقتها مع التأمينات الاجتماعية.' });
  const eosb = byFs(c, 'EOSB'); if (eosb.length && eosb.every((a) => Math.abs(a.closing - a.opening) < 0.01) && (accr.length || salaryExp > 0)) add({ rule_code: 'LA-006', category: 'accounting_issue', severity: 'low', title: 'مخصص مكافأة نهاية الخدمة لم يتغير خلال الفترة', description: `رصيد المخصص ${money(Math.abs(sumClose(eosb)))} ثابت ${c.period.phrase} مع وجود موظفين؛ IAS 19 يتطلب تحديث الالتزام في نهاية كل فترة.`, fs_line_code: 'EOSB', amount: String(Math.abs(sumClose(eosb))), evidence: {}, recommendation: 'إعداد احتساب المخصص حسب نظام العمل بأسماء الموظفين وأجورهم.' });
  // تركّز المصروفات
  const exps = expenseAccounts(c); const totExp = exps.reduce((s, a) => s + a.closing, 0);
  const top = [...exps].sort((a, b) => b.closing - a.closing)[0];
  if (top && totExp > 0 && top.closing / totExp >= T.expense_concentration_pct / 100 && exps.length >= 3) add({ rule_code: 'LA-007', category: 'judgment', severity: top.closing / totExp >= Math.max(0.7, T.expense_concentration_pct / 100) ? 'medium' : 'low', title: `تركّز المصروفات في «${top.name}» (${pct(top.closing / totExp)} من الإجمالي)`, description: `الحساب ${top.code} ${top.name} بمبلغ ${money(top.closing)} يمثل ${pct(top.closing / totExp)} من مصروفات الفترة (${money(totExp)}). يلزم التحقق من طبيعته ومستنداته${/نثري/.test(top.name) ? '؛ المصاريف النثرية بهذا الحجم تحتاج تحليلًا وتوثيقًا تفصيليًا' : ''}.`, account_code: top.code, account_name: top.name, amount: String(top.closing), evidence: { share: top.closing / totExp, total_expenses: totExp }, recommendation: 'طلب كشف تفصيلي بالحركات والفواتير المؤيدة.' });
  // الأطراف ذات العلاقة
  const rp = c.accounts.filter((a) => ['RELATED_PARTY_DR', 'DUE_FROM_SHAREHOLDERS'].includes(a.fs) && a.closing > 0); const rpT = sumClose(rp); const ta = n(k.total_assets);
  if (rpT > 0 && ta > 0 && rpT / ta >= T.related_party_pct / 100) add({ rule_code: 'LA-008', category: 'judgment', severity: rpT / ta >= T.related_party_high_pct / 100 ? 'high' : 'medium', title: `أرصدة مستحقة من أطراف ذات علاقة ${money(rpT)} (${pct(rpT / ta)} من الأصول)`, description: `جزء جوهري من الأصول أرصدة على أطراف ذات علاقة/مساهمين (${rp.map((a) => `${a.code} ${a.name}: ${money(a.closing)}`).join('؛ ')}). IAS 24 يتطلب الإفصاح، ويلزم تقييم قابلية التحصيل (IFRS 9) والشروط.`, amount: String(rpT), evidence: { accounts: rp.map((a) => a.code), share_of_assets: rpT / ta }, recommendation: 'طلب مصادقات الأرصدة واتفاقيات التمويل وخطة السداد.' });
  // مؤشرات الاستمرارية مجتمعة
  const wc = n(k.current_assets) - n(k.current_liabilities); const ni = n(k.net_income); const eq = n(k.total_equity); const cfo = c.st.cf.status === 'ok' ? n(c.st.cf.totals.find((t) => t.key === 'operating')?.value) : null;
  const signals = [ni < 0 ? `صافي خسارة ${money(Math.abs(ni))}` : null, wc < 0 ? `رأس مال عامل سالب ${money(wc)}` : null, cfo != null && cfo < 0 ? `تدفق تشغيلي سالب ${money(cfo)}` : null, eq <= 0 ? 'حقوق ملكية سالبة' : null].filter(Boolean) as string[];
  if (signals.length >= 2) add({ rule_code: 'LA-009', category: 'judgment', severity: signals.length >= 3 || eq <= 0 ? 'high' : 'medium', title: `مؤشرات تستدعي تقييم الاستمرارية: ${signals.join('، ')}`, description: `اجتماع هذه المؤشرات ${c.period.phrase} يستدعي تقييم قدرة المنشأة على الاستمرار ومصادر تمويلها (IAS 1.25)، والإفصاح عن أي شكوك جوهرية.`, evidence: { net_income: ni, working_capital: wc, operating_cash_flow: cfo, equity: eq }, recommendation: 'طلب خطة الإدارة والتمويل للاثني عشر شهرًا القادمة وأي التزامات من الشركاء بالدعم.' });
  // إيرادات مؤجلة كبيرة مقابل الإيراد
  const def = c.accounts.filter((a) => /مؤجل/.test(a.name) && a.closing < 0 && a.statement === 'sfp'); const rev = n(k.revenue);
  if (def.length && rev > 0 && Math.abs(sumClose(def)) / rev >= T.deferred_revenue_pct / 100) add({ rule_code: 'LA-010', category: 'judgment', severity: 'low', title: `إيرادات مؤجلة ${money(Math.abs(sumClose(def)))} تعادل ${pct(Math.abs(sumClose(def)) / rev)} من إيراد الفترة`, description: 'يلزم التحقق من التزامات الأداء غير المنفذة وتوقيت الاعتراف بالإيراد (IFRS 15).', account_code: def[0]!.code, account_name: def[0]!.name, amount: String(Math.abs(sumClose(def))), evidence: {}, recommendation: 'طلب العقود وجدول الاعتراف بالإيراد.' });
  return out;
}

const level = (bad: boolean, mid: boolean) => (bad ? 'high' : mid ? 'medium' : 'low') as 'high' | 'medium' | 'low';
/** التحليل المحلي الكامل بنفس مخطط مخرجات المساعد (يُعرض ويدخل التقارير) */
export function localAnalysis(c: LocalContext): AiAnalysis {
  const k = c.kf; const ta = n(k.total_assets), tl = n(k.total_liabilities), eq = n(k.total_equity), rev = n(k.revenue), ni = n(k.net_income), ca = n(k.current_assets), cl = n(k.current_liabilities), gp = n(k.gross_profit);
  const wc = ca - cl; const obs = localObservations(c);
  const high = c.findings.filter((f) => ['critical', 'high'].includes(f.severity));
  const sfpLines = c.st.sfp.lines.filter((l) => ['current_assets', 'non_current_assets'].includes(l.section) && n(l.value) > 0).sort((a, b) => n(b.value) - n(a.value)).slice(0, 3);
  const exps = [...expenseAccounts(c)].sort((a, b) => b.closing - a.closing).slice(0, 3);
  const cf = c.st.cf; const cft = (key: string) => n(cf.totals.find((t) => t.key === key)?.value);
  const summary = [
    `يعرض هذا التحليل المركز المالي والأداء لـ${c.company} ${c.period.phrase}${c.period.full ? '' : ` (${c.period.days} يومًا)`} اعتمادًا على ميزان المراجعة المعتمد في البرنامج.`,
    `بلغ إجمالي الأصول ${money(ta)} مقابل التزامات ${money(tl)}، فكانت حقوق الملكية الدفترية ${money(eq)}.`,
    rev > 0 ? `حققت الفترة إيرادات ${money(rev)} و${ni >= 0 ? 'صافي ربح' : 'صافي خسارة'} ${money(Math.abs(ni))} (هامش ${pct(ni / rev)}).` : `لا توجد إيرادات مسجلة في الفترة، وبلغ ${ni >= 0 ? 'صافي الربح' : 'صافي الخسارة'} ${money(Math.abs(ni))}.`,
    wc < 0 ? `رأس المال العامل سالب (${money(wc)})، أي أن الالتزامات المتداولة تتجاوز الأصول المتداولة.` : `رأس المال العامل ${money(wc)}.`,
    high.length ? `سُجلت ${high.length} ملاحظة مرتفعة الخطورة أو حرجة تتطلب المعالجة قبل اعتماد النتائج، أبرزها: ${high.slice(0, 2).map((f) => f.title).join('؛ ')}.` : 'لا توجد ملاحظات مرتفعة الخطورة مفتوحة.',
    c.group?.consolidation ? `على مستوى المجموعة بلغت حقوق الملكية الموحدة بعد الاستبعادات ${money(n(c.group.consolidation.group_equity_worksheet))} (${c.group.consolidation.status === 'supported' ? 'مدعومة بالأدلة' : 'غير نهائية لوجود بنود غير محسومة'}).` : '',
  ].filter(Boolean).join(' ');
  const comm: string[] = [];
  comm.push(`المركز المالي: تتركز الأصول في ${sfpLines.map((l) => `${l.label_ar} (${money(n(l.value))}، ${pct(n(l.value) / (ta || 1))})`).join('، ') || '—'}. الأصول المتداولة ${money(ca)} والالتزامات المتداولة ${money(cl)}${cl > 0 ? `، ونسبة التداول ${(ca / cl).toFixed(2)}` : ''}.`);
  comm.push(`الأداء: ${rev > 0 ? `الإيرادات ${money(rev)}، مجمل الربح ${money(gp)}، الربح التشغيلي ${money(n(k.operating_profit))}، ` : ''}أبرز المصروفات: ${exps.map((a) => `${a.name} ${money(a.closing)}`).join('، ') || '—'}.`);
  if (cf.status === 'ok') comm.push(`التدفقات النقدية: التشغيلية ${money(cft('operating'))}، الاستثمارية ${money(cft('investing'))}، التمويلية ${money(cft('financing'))}، وصافي التغير في النقد ${money(cft('net_change'))}.`);
  if (c.variance.length && c.prior) { const mat = c.variance.filter((v) => v.material && !v.key.startsWith('total:')).slice(0, 4); if (mat.length) comm.push(`مقارنة بـ${c.prior.label}: ${mat.map((v) => `${v.label_ar} ${n(v.change) >= 0 ? 'ارتفع' : 'انخفض'} بـ${money(Math.abs(n(v.change)))}${v.change_pct ? ` (${v.change_pct}%)` : ''}`).join('؛ ')}.`); }
  if (!c.period.full) comm.push(`الفترة جزئية (${c.period.days} يومًا)؛ أرقام الربحية والدوران غير محوّلة لأساس سنوي.`);
  const de = tl / (eq || 1); const T = c.T ?? DEFAULT_THRESHOLDS;
  const risk = {
    liquidity: cl <= 0 ? { level: 'low' as const, rationale: 'لا توجد التزامات متداولة.' } : { level: level(ca / cl < T.risk_cr_high, ca / cl < T.risk_cr_medium), rationale: `نسبة التداول ${(ca / cl).toFixed(2)} (الأصول المتداولة ${money(ca)} ÷ الالتزامات المتداولة ${money(cl)}).` },
    profitability: rev > 0 ? { level: level(ni < 0, ni / rev < T.risk_margin_medium_pct / 100), rationale: `هامش صافي الربح ${pct(ni / rev)}.` } : { level: (ni < 0 ? 'high' : 'unknown') as 'high' | 'unknown', rationale: ni < 0 ? `لا إيرادات مع صافي خسارة ${money(Math.abs(ni))}.` : 'لا إيرادات في الفترة.' },
    leverage: eq <= 0 ? { level: 'high' as const, rationale: 'حقوق الملكية صفرية أو سالبة.' } : { level: level(de > T.risk_de_high, de > T.risk_de_medium), rationale: `الالتزامات إلى حقوق الملكية ${de.toFixed(2)}.` },
    working_capital: { level: level(wc < 0, ca > 0 && wc / ca < T.risk_wc_medium_pct / 100), rationale: `رأس المال العامل ${money(wc)}.` },
  };
  const questions = new Set<string>();
  for (const o of obs) questions.add(({ 'LA-001': 'ما سياسة الاستهلاك المتبعة؟ ولماذا لم يُسجل استهلاك الفترة؟', 'LA-002': 'ما العمر الإنتاجي للأصول غير الملموسة ولماذا لم تُطفأ؟', 'LA-003': 'ما تاريخ بدء عقد الإيجار ومدته ومعدل الخصم المستخدم؟', 'LA-004': 'هل سُددت دفعات الإيجار وكيف قُيدت؟', 'LA-005': 'هل الرواتب المستحقة قديمة؟ ولماذا لا يظهر مصروف رواتب للفترة؟', 'LA-006': 'كم عدد الموظفين وأجورهم لاحتساب مكافأة نهاية الخدمة؟', 'LA-007': 'ما طبيعة الحساب الأكبر في المصروفات وما مستنداته؟', 'LA-008': 'ما شروط الأرصدة مع الأطراف ذات العلاقة وموعد سدادها؟', 'LA-009': 'ما خطة الإدارة لتمويل العمليات خلال الاثني عشر شهرًا القادمة؟', 'LA-010': 'ما الالتزامات التعاقدية غير المنفذة المقابلة للإيرادات المؤجلة؟' } as Record<string, string>)[o.rule_code] ?? o.title);
  for (const f of high.slice(0, 8)) questions.add(`بخصوص «${f.title}»: ما التفسير والمستند المؤيد؟`);
  const docs = new Set<string>(['كشوف الحسابات البنكية في نهاية الفترة لمطابقة النقد']);
  for (const o of obs) { if (o.recommendation) docs.add(o.recommendation.replace(/^طلب /, '')); }
  if (!c.official.length) docs.add('عقد التأسيس / النظام الأساس والسجل التجاري (لم تُعتمد بيانات نظامية للشركة)');
  return {
    executive_summary_ar: summary,
    financial_commentary_ar: comm.join('\n\n'),
    risk_assessment: risk,
    observations: obs.map((o) => ({ title: o.title, category: o.category === 'math_error' ? 'accounting_issue' : o.category as never, severity: o.severity, fs_line_or_account: o.account_code ?? o.fs_line_code ?? null, amount_quoted: o.amount ?? null, evidence_refs: [o.rule_code], explanation: o.description, potential_impact: o.impact ?? null, recommendation: o.recommendation ?? null, confidence: 'high' as const })),
    management_questions: [...questions].slice(0, 30),
    documents_needed: [...docs].slice(0, 30),
    review_checklist: ['مطابقة أرصدة النقد بكشوف البنوك', 'مراجعة التصنيف الآلي للحسابات وتعديل ما يلزم', 'مراجعة الملاحظات المفتوحة واعتماد أو رفض كل منها', 'التحقق من القيود غير الاعتيادية قرب نهاية الفترة', 'مطابقة الأرصدة مع الأطراف ذات العلاقة', ...(c.group ? ['مراجعة قيود الاستبعاد وسجل الفروق في التوحيد'] : []), 'اعتماد التسويات المقترحة قبل إصدار التقرير'],
    limitations: ['التحليل مبني على ميزان مراجعة قبل الإقفال وتصنيف آلي للحسابات؛ لم تُجرَ مصادقات خارجية.', 'الإجراءات تحليلية ولا تمثل رأي مراجع مستقل.', ...(c.period.full ? [] : ['الفترة جزئية وأرقامها غير محوّلة لأساس سنوي.']), ...(c.prior ? [] : ['لا تتوفر فترة مقارنة بميزان معتمد.'])],
  };
}
