import { D, Decimal, ZERO, sum, net, isZero, toStr, pct, safeDiv } from './money.js';
import { classifyAccount, learnPrefixMap, TYPE_LABELS, type PrefixMap } from './classification.js';
import type { TbEntry, AccountMeta, EngineFinding, Severity } from './types.js';

export interface TbValidationOptions {
  tolerance?: string;            // فرق مقبول للتقريب (افتراضي 0.05)
  materiality?: string | null;   // حد الأهمية النسبية؛ يُحسب تلقائيًا إن لم يُحدد
  accounts?: Map<string, AccountMeta>;
  priorEntries?: TbEntry[] | null;
  priorLabel?: string;
  currentLabel?: string;
  columnsPresent?: { opening: boolean; movements: boolean; closing: boolean };
  materialChangePct?: number;    // نسبة التغير المعتبرة مادية (افتراضي 25%)
  materialityPolicy?: MaterialityPolicy | null; // سياسة المكتب عند عدم تحديد الأهمية يدويًا
}

/** سياسة الأهمية النسبية للمكتب. ISA 320: تحديد الأهمية حكم مهني يبدأ غالبًا بنسبة من أساس مرجعي؛
 *  الفقرة أ8 تذكر أمثلة: 5% من الربح من العمليات المستمرة قبل الزكاة والضريبة لمنشأة هادفة للربح، و1% من الإيرادات أو المصروفات.
 *  نسبة الأصول ليس لها مثال في المعيار (اجتهاد المكتب). */
export interface MaterialityPolicy { benchmark: 'auto' | 'pbt' | 'revenue' | 'total_assets' | 'largest'; pbt_pct: number; revenue_pct: number; assets_pct: number; min_amount: number }
export const DEFAULT_MATERIALITY_POLICY: MaterialityPolicy = { benchmark: 'auto', pbt_pct: 5, revenue_pct: 1, assets_pct: 0.5, min_amount: 1000 };
const pctText = (n: number) => `${Number(n.toFixed(3))}%`;
/** الأهمية النسبية من سياسة المكتب، مع نص الأساس المستخدم (يُعرض في التقرير) */
export function computeMateriality(t: { revenue: Decimal; assets: Decimal; pbt: Decimal }, policy?: MaterialityPolicy | null): { materiality: Decimal; basis: string } {
  const P = { ...DEFAULT_MATERIALITY_POLICY, ...(policy ?? {}) };
  const byPbt = t.pbt.gt(0) ? t.pbt.mul(P.pbt_pct).div(100) : ZERO; const byRev = t.revenue.gt(0) ? t.revenue.mul(P.revenue_pct).div(100) : ZERO; const byAssets = t.assets.gt(0) ? t.assets.mul(P.assets_pct).div(100) : ZERO;
  const PBT = `${pctText(P.pbt_pct)} من الربح قبل الزكاة والضريبة (ISA 320 أ8)`; const REV = `${pctText(P.revenue_pct)} من إجمالي الإيرادات (ISA 320 أ8)`; const AST = `${pctText(P.assets_pct)} من إجمالي الأصول (اجتهاد المكتب)`;
  let m = ZERO; let basis = '';
  const pick = (v: Decimal, b: string) => { if (m.isZero() && v.gt(0)) { m = v; basis = b; } };
  if (P.benchmark === 'pbt') { pick(byPbt, PBT); pick(byRev, `${REV} — لا يوجد ربح قبل الزكاة`); }
  else if (P.benchmark === 'revenue') pick(byRev, REV);
  else if (P.benchmark === 'total_assets') pick(byAssets, AST);
  else if (P.benchmark === 'largest') { if (byRev.gte(byAssets)) pick(byRev, `${REV}، وهو الأكبر من نسبة الأصول`); pick(byAssets, `${AST}، وهو الأكبر من نسبة الإيرادات`); }
  else { pick(byPbt, `${PBT} — المنشأة رابحة`); pick(byRev, `${REV} — المنشأة خاسرة أو بلا ربح`); }
  pick(byAssets, `${AST} — لا تتوفر أسس أخرى`);
  if (m.isZero()) { m = D(P.min_amount); basis = `الحد الأدنى للمكتب ${P.min_amount} لعدم توفر أساس (يُفضل تحديدها يدويًا)`; }
  else if (m.lt(P.min_amount)) { basis += `؛ رُفعت إلى الحد الأدنى للمكتب ${P.min_amount}`; m = D(P.min_amount); }
  return { materiality: m, basis: `${basis} — سياسة المكتب، قابلة للتعديل لكل ارتباط` };
}

export interface AccountAnalysis {
  account_code: string;
  account_name: string | null;
  source_row: number | null;
  meta: AccountMeta;
  opening_net: string; movement_net: string; closing_net: string;
  computed_closing_net: string;
  closing_matches: boolean;
  balance_side: 'debit' | 'credit' | 'zero';
  abnormal_balance: boolean;
  prior_closing_net?: string | null;
  change_amount?: string | null;
  change_pct?: string | null;
}

export interface TbValidationResult {
  summary: {
    rows: number;
    unique_accounts: number;
    totals: {
      opening: { debit: string; credit: string; difference: string; balanced: boolean };
      movements: { debit: string; credit: string; difference: string; balanced: boolean };
      closing: { debit: string; credit: string; difference: string; balanced: boolean };
    };
    computed_check: { accounts_with_mismatch: number };
    materiality: string;
    materiality_basis: string;
    tolerance: string;
    columns_present: { opening: boolean; movements: boolean; closing: boolean };
    counts_by_severity: Record<Severity, number>;
    counts_by_category: Record<string, number>;
    type_totals: Record<string, string>;  // صافي الرصيد الختامي حسب نوع الحساب
    net_income_from_tb: string | null;    // إيرادات - مصاريف (إن وُجدت حسابات نتيجة)
    prior_compared: boolean;
  };
  findings: EngineFinding[];
  accounts: AccountAnalysis[];
}

function detectColumns(entries: TbEntry[]) {
  const any = (f: (e: TbEntry) => boolean) => entries.some(f);
  return {
    opening: any((e) => !D(e.opening_debit).isZero() || !D(e.opening_credit).isZero()),
    movements: any((e) => !D(e.period_debit).isZero() || !D(e.period_credit).isZero()),
    closing: any((e) => !D(e.closing_debit).isZero() || !D(e.closing_credit).isZero()),
  };
}

export function prefixMapFor(entries: TbEntry[]): PrefixMap { return learnPrefixMap(entries.map((e) => ({ code: e.account_code, name: e.account_name }))); }

export function resolveMeta(e: TbEntry, accounts?: Map<string, AccountMeta>, prefixMap?: PrefixMap): AccountMeta {
  const known = accounts?.get(e.account_code);
  if (known) return known;
  const nb = net(e.closing_debit, e.closing_credit);
  const c = classifyAccount(e.account_code, e.account_name, nb.isZero() ? 'zero' : nb.gt(0) ? 'debit' : 'credit', prefixMap);
  return { code: e.account_code, name_ar: e.account_name ?? '', account_type: c.account_type, sub_type: c.sub_type,
    normal_balance: c.normal_balance, fs_line_code: c.fs_line_code, is_suspense: c.is_suspense, is_bank: c.is_bank, confidence: c.confidence };
}

export function validateTrialBalance(entries: TbEntry[], opts: TbValidationOptions = {}): TbValidationResult {
  const tolerance = D(opts.tolerance ?? '0.05');
  const findings: EngineFinding[] = [];
  const cols = opts.columnsPresent ?? detectColumns(entries);
  const curLabel = opts.currentLabel ?? 'الفترة الحالية';
  const priorLabel = opts.priorLabel ?? 'الفترة السابقة';
  const rowRef = (e: TbEntry) => (e.source_row != null ? `الصف ${e.source_row}` : null);

  // ---------- الإجماليات ----------
  const tot = {
    opening: { debit: sum(entries.map((e) => e.opening_debit)), credit: sum(entries.map((e) => e.opening_credit)) },
    movements: { debit: sum(entries.map((e) => e.period_debit)), credit: sum(entries.map((e) => e.period_credit)) },
    closing: { debit: sum(entries.map((e) => e.closing_debit)), credit: sum(entries.map((e) => e.closing_credit)) },
  };
  const mk = (k: keyof typeof tot) => {
    const diff = tot[k].debit.minus(tot[k].credit);
    return { debit: toStr(tot[k].debit), credit: toStr(tot[k].credit), difference: toStr(diff), balanced: diff.abs().lte(tolerance) };
  };
  const totals = { opening: mk('opening'), movements: mk('movements'), closing: mk('closing') };

  const totalRules: { key: keyof typeof tot; code: string; label: string; present: boolean }[] = [
    { key: 'opening', code: 'TB-001', label: 'الأرصدة الافتتاحية', present: cols.opening },
    { key: 'movements', code: 'TB-002', label: 'حركات الفترة', present: cols.movements },
    { key: 'closing', code: 'TB-003', label: 'الأرصدة الختامية', present: cols.closing },
  ];
  for (const r of totalRules) {
    if (!r.present) continue;
    const diff = tot[r.key].debit.minus(tot[r.key].credit);
    if (diff.abs().gt(tolerance)) {
      findings.push({
        rule_code: r.code, category: 'math_error', severity: 'critical',
        title: `عدم توازن ${r.label}: المدين لا يساوي الدائن`,
        description: `إجمالي المدين في ${r.label} ${toStr(tot[r.key].debit)} وإجمالي الدائن ${toStr(tot[r.key].credit)}؛ الفرق ${toStr(diff)}. ميزان المراجعة غير متوازن ولا يمكن الاعتماد عليه قبل تصحيح الفرق.`,
        amount: toStr(diff.abs()),
        evidence: { total_debit: toStr(tot[r.key].debit), total_credit: toStr(tot[r.key].credit), rows: entries.length },
        calculation: `${toStr(tot[r.key].debit)} - ${toStr(tot[r.key].credit)} = ${toStr(diff)}`,
        impact: 'القوائم المالية المشتقة من هذا الميزان ستكون غير متوازنة.',
        recommendation: 'مراجعة مصدر الميزان، التحقق من اكتمال الصفوف المستوردة، والبحث عن قيد غير متوازن أو حساب محذوف.',
        dedupe_key: `${r.code}`,
      });
    } else if (!diff.isZero()) {
      findings.push({
        rule_code: `${r.code}-R`, category: 'data_quality', severity: 'low',
        title: `فرق تقريب بسيط في ${r.label}`,
        description: `يوجد فرق قدره ${toStr(diff)} ضمن حد التسامح (${toStr(tolerance)}). يُنصح بتوحيد التقريب.`,
        amount: toStr(diff.abs()), evidence: { difference: toStr(diff), tolerance: toStr(tolerance) }, dedupe_key: `${r.code}-R`,
      });
    }
  }

  // ---------- فحوصات على مستوى الصفوف ----------
  const byCode = new Map<string, TbEntry[]>();
  for (const e of entries) {
    const code = (e.account_code ?? '').trim();
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code)!.push(e);
  }

  for (const [code, rows] of byCode) {
    if (code === '') {
      for (const e of rows) {
        findings.push({ rule_code: 'TB-007', category: 'data_quality', severity: 'high', title: 'صف بدون رمز حساب',
          description: `الصف ${e.source_row ?? '?'} (${e.account_name ?? 'بدون اسم'}) لا يحتوي على رمز حساب ولا يمكن ربطه بالقوائم.`,
          account_name: e.account_name, source_row_ref: rowRef(e), amount: toStr(net(e.closing_debit, e.closing_credit).abs()),
          evidence: { row: e.source_row, name: e.account_name }, recommendation: 'إضافة رمز الحساب أو استبعاد الصف إن كان صف إجمالي.',
          dedupe_key: `TB-007:${e.source_row}` });
      }
      continue;
    }
    if (rows.length > 1) {
      findings.push({ rule_code: 'TB-005', category: 'data_quality', severity: 'high', title: `رمز الحساب ${code} مكرر ${rows.length} مرات`,
        description: `ظهر رمز الحساب ${code} في الصفوف ${rows.map((r) => r.source_row ?? '?').join('، ')}. التكرار قد يضاعف الأرصدة أو يشير إلى حسابات مختلفة بنفس الرمز.`,
        account_code: code, account_name: rows[0].account_name, source_row_ref: rows.map((r) => r.source_row).filter(Boolean).join(','),
        amount: toStr(sum(rows.map((r) => net(r.closing_debit, r.closing_credit))).abs()),
        evidence: { rows: rows.map((r) => ({ row: r.source_row, name: r.account_name, closing_debit: toStr(r.closing_debit), closing_credit: toStr(r.closing_credit) })) },
        recommendation: 'التحقق من دليل الحسابات ودمج الصفوف أو تصحيح الرموز.', dedupe_key: `TB-005:${code}` });
    }
  }

  // ---------- الأهمية النسبية ----------
  const analyses: AccountAnalysis[] = [];
  const typeTotals: Record<string, Decimal> = {};
  let revenueTotal = ZERO; let expenseTotal = ZERO; let assetsTotal = ZERO; let zakatTaxTotal = ZERO;
  const priorMap = new Map<string, TbEntry>();
  for (const p of opts.priorEntries ?? []) priorMap.set(p.account_code.trim(), p);

  const prefixMap = prefixMapFor(entries);
  for (const e of entries) {
    const meta = resolveMeta(e, opts.accounts, prefixMap);
    const openingNet = net(e.opening_debit, e.opening_credit);
    const movNet = net(e.period_debit, e.period_credit);
    const closingNet = net(e.closing_debit, e.closing_credit);
    const computed = openingNet.plus(movNet);
    const matches = cols.opening && cols.movements && cols.closing ? computed.minus(closingNet).abs().lte(tolerance) : true;
    const side: AccountAnalysis['balance_side'] = closingNet.isZero() ? 'zero' : closingNet.gt(0) ? 'debit' : 'credit';
    const bilateral = ['RETAINED_EARNINGS', 'OWNER_CURRENT', 'RELATED_PARTY_DR', 'RELATED_PARTY_CR', 'DUE_FROM_SHAREHOLDERS', 'DUE_TO_SHAREHOLDERS', 'OTHER_OPERATING'].includes(meta.fs_line_code);
    const abnormal = side !== 'zero' && side !== meta.normal_balance && meta.account_type !== 'other' && !bilateral;
    typeTotals[meta.account_type] = (typeTotals[meta.account_type] ?? ZERO).plus(closingNet);
    if (meta.account_type === 'revenue') revenueTotal = revenueTotal.plus(closingNet.neg());
    if (meta.account_type === 'expense') expenseTotal = expenseTotal.plus(closingNet);
    if (meta.account_type === 'expense' && meta.sub_type === 'zakat_tax') zakatTaxTotal = zakatTaxTotal.plus(closingNet);
    if (meta.account_type === 'asset') assetsTotal = assetsTotal.plus(closingNet);
    const prior = priorMap.get(e.account_code.trim());
    const priorNet = prior ? net(prior.closing_debit, prior.closing_credit) : null;
    const change = priorNet ? closingNet.minus(priorNet) : null;
    const changePct = priorNet && !priorNet.isZero() ? pct(change!, priorNet.abs()) : null;
    analyses.push({ account_code: e.account_code, account_name: e.account_name, source_row: e.source_row ?? null, meta,
      opening_net: toStr(openingNet), movement_net: toStr(movNet), closing_net: toStr(closingNet), computed_closing_net: toStr(computed),
      closing_matches: matches, balance_side: side, abnormal_balance: abnormal,
      prior_closing_net: priorNet ? toStr(priorNet) : null, change_amount: change ? toStr(change) : null, change_pct: changePct ? changePct.toFixed(2) : null });
  }

  let materiality: Decimal; let basis: string;
  if (opts.materiality) { materiality = D(opts.materiality); basis = 'محددة من المحاسب'; }
  else ({ materiality, basis } = computeMateriality({ revenue: revenueTotal, assets: assetsTotal, pbt: revenueTotal.minus(expenseTotal.minus(zakatTaxTotal)) }, opts.materialityPolicy));
  const sevByAmount = (amt: Decimal, base: Severity = 'medium'): Severity => amt.abs().gte(materiality) ? (base === 'medium' ? 'high' : base) : base;

  // ---------- فحوصات الحساب الواحد ----------
  for (let i = 0; i < analyses.length; i++) {
    const a = analyses[i];
    const e = entries[i];
    const ref = rowRef(e);
    const closingNet = D(a.closing_net);
    const nm = a.account_name ?? '';

    if (!nm.trim()) {
      findings.push({ rule_code: 'TB-006', category: 'data_quality', severity: 'low', title: `الحساب ${a.account_code} بدون اسم`,
        description: `رمز الحساب ${a.account_code} في ${ref ?? 'الملف'} لا يحمل اسمًا، ما يصعّب التصنيف والمراجعة.`,
        account_code: a.account_code, source_row_ref: ref, evidence: { row: a.source_row }, recommendation: 'استكمال اسم الحساب من دليل الحسابات.',
        dedupe_key: `TB-006:${a.account_code}` });
    }
    if (!a.closing_matches) {
      const diff = D(a.computed_closing_net).minus(closingNet);
      findings.push({ rule_code: 'TB-004', category: 'math_error', severity: sevByAmount(diff, 'high'),
        title: `الرصيد الختامي للحساب ${a.account_code} لا يساوي الافتتاحي + الحركات`,
        description: `${nm || a.account_code}: الافتتاحي ${a.opening_net} + صافي الحركات ${a.movement_net} = ${a.computed_closing_net} بينما الرصيد الختامي المسجل ${a.closing_net}. الفرق ${toStr(diff)}.`,
        account_code: a.account_code, account_name: nm, source_row_ref: ref, amount: toStr(diff.abs()),
        evidence: { opening_net: a.opening_net, movement_net: a.movement_net, computed: a.computed_closing_net, reported: a.closing_net },
        calculation: `${a.opening_net} + (${a.movement_net}) = ${a.computed_closing_net} ≠ ${a.closing_net}`,
        impact: 'قد يشير إلى قيد مفقود، أو ترحيل خاطئ، أو خطأ في استخراج الميزان.',
        recommendation: 'مطابقة الحساب مع دفتر الأستاذ العام وكشف الحركات.', dedupe_key: `TB-004:${a.account_code}` });
    }
    if (!D(e.closing_debit).isZero() && !D(e.closing_credit).isZero()) {
      findings.push({ rule_code: 'TB-008', category: 'data_quality', severity: 'medium', title: `الحساب ${a.account_code} يحمل رصيدًا مدينًا ودائنًا معًا`,
        description: `سُجل للحساب ${nm || a.account_code} رصيد ختامي مدين ${toStr(e.closing_debit)} ودائن ${toStr(e.closing_credit)} في الوقت نفسه. المتعارف عليه عرض صافي الرصيد في جانب واحد.`,
        account_code: a.account_code, account_name: nm, source_row_ref: ref, amount: toStr(Decimal.min(D(e.closing_debit), D(e.closing_credit))),
        evidence: { closing_debit: toStr(e.closing_debit), closing_credit: toStr(e.closing_credit), net: a.closing_net },
        recommendation: 'التحقق من طريقة استخراج الميزان؛ تم استخدام صافي الرصيد في التحليل.', dedupe_key: `TB-008:${a.account_code}` });
    }
    for (const col of ['opening_debit', 'opening_credit', 'period_debit', 'period_credit', 'closing_debit', 'closing_credit'] as const) {
      if (D(e[col]).lt(0)) {
        findings.push({ rule_code: 'TB-013', category: 'data_quality', severity: 'medium', title: `قيمة سالبة في عمود ${col} للحساب ${a.account_code}`,
          description: `الحساب ${nm || a.account_code} يحمل قيمة سالبة (${toStr(e[col])}) في عمود ${col}. القيم السالبة في أعمدة المدين/الدائن قد تعكس إشارة مقلوبة.`,
          account_code: a.account_code, account_name: nm, source_row_ref: ref, amount: toStr(D(e[col]).abs()),
          evidence: { column: col, value: toStr(e[col]) }, recommendation: 'التأكد من الإشارة؛ تم احتساب الصافي كما ورد.', dedupe_key: `TB-013:${a.account_code}:${col}` });
      }
    }
    if (a.meta.fs_line_code === 'UNMAPPED' || (a.meta.confidence !== undefined && a.meta.confidence < 0.5)) {
      findings.push({ rule_code: 'TB-009', category: 'data_quality', severity: closingNet.isZero() ? 'low' : 'medium',
        title: `الحساب ${a.account_code} غير مربوط ببند قوائم مالية بثقة كافية`,
        description: `تعذر تحديد تصنيف الحساب "${nm || a.account_code}" بثقة (الثقة ${Math.round((a.meta.confidence ?? 0) * 100)}%). التصنيف المقترح: ${a.meta.fs_line_code}.`,
        account_code: a.account_code, account_name: nm, source_row_ref: ref, amount: toStr(closingNet.abs()), fs_line_code: a.meta.fs_line_code,
        evidence: { suggested: a.meta.fs_line_code, confidence: a.meta.confidence, account_type: a.meta.account_type },
        recommendation: 'مراجعة التصنيف في دليل الحسابات واعتماد الربط الصحيح.', dedupe_key: `TB-009:${a.account_code}` });
    }
    if (a.meta.is_suspense && !closingNet.isZero()) {
      findings.push({ rule_code: 'TB-011', category: 'accounting_issue', severity: sevByAmount(closingNet, 'high'),
        title: `حساب معلق/وسيط برصيد غير مُسوّى: ${nm || a.account_code}`,
        description: `الحساب ${a.account_code} مصنف كحساب معلق/وسيط ويحمل رصيدًا ختاميًا ${a.closing_net}. الحسابات المعلقة يجب تسويتها قبل إعداد القوائم.`,
        account_code: a.account_code, account_name: nm, source_row_ref: ref, amount: toStr(closingNet.abs()),
        evidence: { closing_net: a.closing_net }, impact: 'قد يخفي بنودًا غير مصنفة أو أخطاء في التسجيل.',
        recommendation: 'تحليل مكونات الرصيد وإعادة تصنيفه إلى الحسابات الصحيحة أو الحصول على مستندات مؤيدة.', dedupe_key: `TB-011:${a.account_code}` });
    }
    if (a.abnormal_balance && !a.meta.is_suspense) {
      const isBank = a.meta.is_bank;
      findings.push({ rule_code: isBank ? 'TB-021' : 'TB-010', category: isBank ? 'judgment' : 'accounting_issue', severity: sevByAmount(closingNet, 'medium'),
        title: isBank ? `حساب بنكي برصيد دائن: ${nm || a.account_code}` : `رصيد غير طبيعي للحساب ${a.account_code} (${nm})`,
        description: isBank
          ? `الحساب البنكي ${nm || a.account_code} يظهر برصيد دائن ${toStr(closingNet.abs())}. قد يمثل سحبًا على المكشوف يجب عرضه ضمن الالتزامات، أو شيكات صادرة لم تُصرف، أو خطأ تسجيل.`
          : `الحساب من نوع "${TYPE_LABELS[a.meta.account_type]}" طبيعة رصيده ${a.meta.normal_balance === 'debit' ? 'مدينة' : 'دائنة'} لكنه يظهر برصيد ${side(a)} قدره ${toStr(closingNet.abs())}.`,
        account_code: a.account_code, account_name: nm, source_row_ref: ref, amount: toStr(closingNet.abs()), fs_line_code: a.meta.fs_line_code,
        evidence: { expected_side: a.meta.normal_balance, actual_side: a.balance_side, closing_net: a.closing_net, account_type: a.meta.account_type },
        impact: 'قد يعكس خطأ تصنيف، أو قيدًا معكوسًا، أو حالة تحتاج إعادة عرض (مثل دفعات مقدمة من العملاء).',
        recommendation: isBank ? 'مطابقة كشف الحساب البنكي والتأكد من التصنيف الصحيح.' : 'مراجعة حركات الحساب والمستندات المؤيدة وتأكيد التصنيف.',
        dedupe_key: `TB-010:${a.account_code}` });
    }
    const hasActivity = !D(a.movement_net).isZero() || !D(e.period_debit).isZero() || !D(e.period_credit).isZero();
    if (hasActivity && closingNet.isZero() && cols.movements && cols.closing && ['asset', 'liability', 'equity'].includes(a.meta.account_type)) {
      findings.push({ rule_code: 'TB-012', category: 'judgment', severity: 'info', title: `حساب نشط برصيد ختامي صفري: ${nm || a.account_code}`,
        description: `الحساب ${a.account_code} شهد حركات خلال الفترة (مدين ${toStr(e.period_debit)} / دائن ${toStr(e.period_credit)}) لكن رصيده الختامي صفر. قد يكون طبيعيًا (حساب وسيط مُسوّى) أو يستدعي التحقق.`,
        account_code: a.account_code, account_name: nm, source_row_ref: ref, amount: toStr(sum([e.period_debit, e.period_credit])),
        evidence: { period_debit: toStr(e.period_debit), period_credit: toStr(e.period_credit) }, dedupe_key: `TB-012:${a.account_code}` });
    }
    if (a.meta.confidence !== undefined && a.meta.confidence >= 0.35 && a.meta.confidence < 0.6 && a.meta.fs_line_code !== 'UNMAPPED') {
      // تضارب بين الاسم وبادئة الرمز
      findings.push({ rule_code: 'TB-016', category: 'data_quality', severity: 'low', title: `احتمال خطأ تصنيف: ${nm || a.account_code}`,
        description: `اسم الحساب "${nm}" يوحي بتصنيف (${a.meta.fs_line_code}) بينما رمز الحساب ${a.account_code} يوحي بمجموعة مختلفة. يلزم تأكيد التصنيف.`,
        account_code: a.account_code, account_name: nm, source_row_ref: ref, amount: toStr(closingNet.abs()),
        evidence: { suggested: a.meta.fs_line_code, confidence: a.meta.confidence }, recommendation: 'تأكيد التصنيف في دليل الحسابات.', dedupe_key: `TB-016:${a.account_code}` });
    }
    // مقارنة بالفترة السابقة
    if (a.prior_closing_net != null && opts.priorEntries) {
      const change = D(a.change_amount!);
      const pctNum = a.change_pct != null ? Number(a.change_pct) : null;
      const thr = opts.materialChangePct ?? 25;
      if (change.abs().gte(materiality) && (pctNum === null || Math.abs(pctNum) >= thr)) {
        findings.push({ rule_code: 'TB-014', category: 'judgment', severity: change.abs().gte(materiality.mul(5)) ? 'high' : 'medium',
          title: `تغير جوهري في الحساب ${a.account_code} (${nm}) مقارنة بـ${priorLabel}`,
          description: `صافي رصيد الحساب تغير من ${a.prior_closing_net} (${priorLabel}) إلى ${a.closing_net} (${curLabel})؛ التغير ${toStr(change)}${pctNum !== null ? ` (${a.change_pct}%)` : ''} ويتجاوز حد الأهمية النسبية ${toStr(materiality)}.`,
          account_code: a.account_code, account_name: nm, source_row_ref: ref, amount: toStr(change.abs()), fs_line_code: a.meta.fs_line_code,
          evidence: { prior: a.prior_closing_net, current: a.closing_net, change: toStr(change), change_pct: a.change_pct, materiality: toStr(materiality) },
          calculation: `${a.closing_net} - (${a.prior_closing_net}) = ${toStr(change)}`,
          recommendation: 'الحصول على تفسير من الإدارة والمستندات المؤيدة للتغير.', dedupe_key: `TB-014:${a.account_code}` });
      }
    } else if (opts.priorEntries && opts.priorEntries.length && !closingNet.isZero()) {
      findings.push({ rule_code: 'TB-015', category: 'judgment', severity: closingNet.abs().gte(materiality) ? 'medium' : 'info',
        title: `حساب جديد لم يظهر في ${priorLabel}: ${nm || a.account_code}`,
        description: `الحساب ${a.account_code} يحمل رصيدًا ${a.closing_net} في ${curLabel} ولم يكن موجودًا في ${priorLabel}.`,
        account_code: a.account_code, account_name: nm, source_row_ref: ref, amount: toStr(closingNet.abs()),
        evidence: { current: a.closing_net }, recommendation: 'الاستفسار عن سبب فتح الحساب وطبيعة رصيده.', dedupe_key: `TB-015:${a.account_code}` });
    }
  }
  if (opts.priorEntries) {
    const curCodes = new Set(entries.map((e) => e.account_code.trim()));
    for (const p of opts.priorEntries) {
      const pn = net(p.closing_debit, p.closing_credit);
      if (!curCodes.has(p.account_code.trim()) && !pn.isZero()) {
        findings.push({ rule_code: 'TB-015B', category: 'judgment', severity: pn.abs().gte(materiality) ? 'medium' : 'info',
          title: `حساب موجود في ${priorLabel} واختفى من ${curLabel}: ${p.account_name ?? p.account_code}`,
          description: `الحساب ${p.account_code} كان برصيد ${toStr(pn)} في ${priorLabel} ولا يظهر في ميزان ${curLabel}.`,
          account_code: p.account_code, account_name: p.account_name, amount: toStr(pn.abs()), evidence: { prior: toStr(pn) },
          recommendation: 'التأكد من إقفال الحساب أو دمجه أو سقوطه سهوًا من الميزان.', dedupe_key: `TB-015B:${p.account_code}` });
      }
    }
  }

  // ---------- فحوصات العلاقات بين الحسابات ----------
  const lineNet = (fs: string) => sum(analyses.filter((a) => a.meta.fs_line_code === fs).map((a) => a.closing_net));
  const ar = lineNet('AR'); const arAllow = lineNet('AR_ALLOWANCE');
  if (ar.gt(0) && arAllow.neg().gt(ar)) {
    findings.push({ rule_code: 'TB-022', category: 'accounting_issue', severity: 'high', title: 'مخصص الخسائر الائتمانية يتجاوز رصيد الذمم المدينة',
      description: `المخصص ${toStr(arAllow.abs())} أكبر من إجمالي الذمم المدينة ${toStr(ar)}، وهو وضع غير منطقي يستدعي المراجعة.`,
      amount: toStr(arAllow.abs().minus(ar)), fs_line_code: 'AR_ALLOWANCE', evidence: { receivables: toStr(ar), allowance: toStr(arAllow.abs()) },
      recommendation: 'مراجعة احتساب المخصص وأرصدة العملاء.', dedupe_key: 'TB-022' });
  }
  // مجمع الاستهلاك يشمل إطفاء الأصول غير الملموسة، فتُقارن بتكلفة الثابتة وغير الملموسة معًا (IAS 16 / IAS 38)
  const ppe = lineNet('PPE').plus(lineNet('INTANGIBLES')); const accDep = lineNet('ACC_DEP');
  if (ppe.gt(0) && accDep.neg().gt(ppe)) {
    findings.push({ rule_code: 'TB-023', category: 'accounting_issue', severity: 'high', title: 'مجمع الاستهلاك والإطفاء يتجاوز تكلفة الأصول الثابتة وغير الملموسة',
      description: `مجمع الاستهلاك ${toStr(accDep.abs())} أكبر من تكلفة الأصول الثابتة وغير الملموسة ${toStr(ppe)}؛ لا يمكن أن يتجاوز الاستهلاك التكلفة.`,
      amount: toStr(accDep.abs().minus(ppe)), fs_line_code: 'ACC_DEP', evidence: { ppe_cost: toStr(ppe), accumulated_depreciation: toStr(accDep.abs()) },
      recommendation: 'مراجعة سجل الأصول الثابتة وجدول الاستهلاك.', dedupe_key: 'TB-023' });
  }
  const capital = lineNet('SHARE_CAPITAL').neg(); const retained = lineNet('RETAINED_EARNINGS').neg();
  const plNet = analyses.filter((a) => a.meta.account_type === 'revenue' || a.meta.account_type === 'expense').reduce((s2, a) => s2.plus(a.closing_net), ZERO).neg();
  const accumulated = retained.plus(plNet);
  if (capital.gt(0) && accumulated.lt(0) && accumulated.abs().gte(capital.mul('0.5'))) {
    findings.push({ rule_code: 'TB-024', category: 'judgment', severity: accumulated.abs().gte(capital) ? 'critical' : 'high', title: `الخسائر المتراكمة (${toStr(accumulated.abs())}) بلغت ${accumulated.abs().div(capital).mul(100).toFixed(0)}% من رأس المال`,
      description: `الخسائر المتراكمة شاملة نتيجة الفترة ${toStr(accumulated.abs())} مقابل رأس مال ${toStr(capital)}. بلوغ الخسائر نصف رأس المال يستوجب إجراءات نظامية — نظام الشركات: في شركة المساهمة إذا بلغت الخسائر نصف رأس المال المصدر يفصح مجلس الإدارة عن ذلك خلال 60 يومًا من علمه ويدعو الجمعية العامة غير العادية خلال 180 يومًا (المادة 132)، وفي الشركة ذات المسؤولية المحدودة يدعو المدير الجمعية العامة للشركاء خلال 60 يومًا (المادة 182)، للنظر في استمرار الشركة مع معالجة الخسائر أو حلها — ويثير مسألة الاستمرارية (ISA 570).`,
      amount: toStr(accumulated.abs()), fs_line_code: 'RETAINED_EARNINGS', evidence: { capital: toStr(capital), retained_earnings: toStr(retained), period_result: toStr(plNet), accumulated: toStr(accumulated) },
      calculation: `${toStr(retained)} + (${toStr(plNet)}) = ${toStr(accumulated)}`, recommendation: 'عرض الأمر على الشركاء/الجمعية العامة واتخاذ القرار النظامي (زيادة رأس المال، تخفيضه، أو الاستمرار بشروط).', dedupe_key: 'TB-024' });
  }
  for (const a of analyses.filter((x) => x.meta.fs_line_code === 'DUE_FROM_SHAREHOLDERS' && D(x.closing_net).gt(0))) {
    findings.push({ rule_code: 'TB-025', category: 'accounting_issue', severity: D(a.closing_net).gte(materiality) ? 'high' : 'medium', title: `رصيد مدين على جاري الشريك/المساهم: ${a.account_name ?? a.account_code}`,
      description: `حساب ${a.account_code} (${a.account_name}) يحمل رصيدًا مدينًا ${a.closing_net} أي مبلغًا مستحقًا على الشريك للشركة. يلزم التحقق من طبيعته (مسحوبات، قرض، مصاريف شخصية) وأثره النظامي والزكوي، وعرضه كذمم مدينة من أطراف ذات علاقة لا ضمن حقوق الملكية.`,
      account_code: a.account_code, account_name: a.account_name, amount: a.closing_net, fs_line_code: 'DUE_FROM_SHAREHOLDERS', evidence: { closing_net: a.closing_net },
      recommendation: 'الحصول على مصادقة الشريك ومستندات الحركات، وإعادة التصنيف إن لزم.', dedupe_key: `TB-025:${a.account_code}` });
  }
  const hasPl = analyses.some((a) => a.meta.account_type === 'revenue' || a.meta.account_type === 'expense');
  const netIncome = hasPl ? revenueTotal.minus(expenseTotal) : null;
  const assets = typeTotals['asset'] ?? ZERO;
  const liabilities = (typeTotals['liability'] ?? ZERO).neg();
  const equity = (typeTotals['equity'] ?? ZERO).neg();
  if (cols.closing && totals.closing.balanced) {
    const other = typeTotals['other'] ?? ZERO;
    const gap = assets.plus(other).minus(liabilities).minus(equity).minus(netIncome ?? ZERO);
    if (gap.abs().gt(tolerance)) {
      findings.push({ rule_code: 'TB-017', category: 'data_quality', severity: 'medium', title: 'المعادلة المحاسبية لا تتوازن بعد التصنيف',
        description: `الأصول ${toStr(assets)} - الالتزامات ${toStr(liabilities)} - حقوق الملكية ${toStr(equity)} - صافي الدخل ${netIncome ? toStr(netIncome) : '0'} = ${toStr(gap)}. الميزان متوازن لكن التصنيف الحالي للحسابات يترك فرقًا، ما يعني أن بعض الحسابات مصنفة في مجموعة خاطئة.`,
        amount: toStr(gap.abs()), evidence: { assets: toStr(assets), liabilities: toStr(liabilities), equity: toStr(equity), net_income: netIncome ? toStr(netIncome) : null, unclassified: toStr(other) },
        recommendation: 'مراجعة تصنيف الحسابات ذات الثقة المنخفضة في دليل الحسابات.', dedupe_key: 'TB-017' });
    }
  }
  const allZero = entries.filter((e) => ['opening_debit', 'opening_credit', 'period_debit', 'period_credit', 'closing_debit', 'closing_credit'].every((c) => D(e[c as keyof TbEntry] as string).isZero()));
  if (allZero.length) {
    findings.push({ rule_code: 'TB-018', category: 'data_quality', severity: 'info', title: `${allZero.length} حساب بأرصدة صفرية بالكامل`,
      description: `الحسابات التالية بلا أرصدة أو حركات: ${allZero.slice(0, 15).map((e) => e.account_code).join('، ')}${allZero.length > 15 ? '…' : ''}.`,
      evidence: { accounts: allZero.map((e) => e.account_code) }, dedupe_key: 'TB-18' });
  }

  const counts_by_severity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const counts_by_category: Record<string, number> = {};
  for (const f of findings) { counts_by_severity[f.severity]++; counts_by_category[f.category] = (counts_by_category[f.category] ?? 0) + 1; }

  return {
    summary: {
      rows: entries.length, unique_accounts: byCode.size, totals,
      computed_check: { accounts_with_mismatch: analyses.filter((a) => !a.closing_matches).length },
      materiality: toStr(materiality), materiality_basis: basis, tolerance: toStr(tolerance), columns_present: cols,
      counts_by_severity, counts_by_category,
      type_totals: Object.fromEntries(Object.entries(typeTotals).map(([k, v]) => [k, toStr(v)])),
      net_income_from_tb: netIncome ? toStr(netIncome) : null, prior_compared: !!opts.priorEntries,
    },
    findings, accounts: analyses,
  };
}

function side(a: AccountAnalysis): string { return a.balance_side === 'debit' ? 'مدين' : a.balance_side === 'credit' ? 'دائن' : 'صفري'; }
export { safeDiv };
