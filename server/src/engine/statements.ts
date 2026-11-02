import { D, Decimal, ZERO, sum, net, toStr } from './money.js';
import { FS_LINES, FS_LINE_MAP } from './fsLines.js';
import { resolveMeta, prefixMapFor } from './trialBalance.js';
import type { TbEntry, AccountMeta } from './types.js';

export interface LineValue {
  code: string; label_ar: string; label_en: string; section: string;
  value: string;                  // بالإشارة الطبيعية للعرض (أصول موجبة، التزامات موجبة، إيرادات موجبة، مصاريف موجبة)
  prior_value?: string | null;
  accounts: { code: string; name: string | null; net: string }[];
}
export interface SectionTotal { key: string; label_ar: string; label_en: string; value: string; prior_value?: string | null }

export interface StatementPackage {
  basis: 'trial_balance';
  period_label: string;
  prior_label?: string | null;
  currency: string;
  sfp: { lines: LineValue[]; totals: SectionTotal[]; balanced: boolean; difference: string };
  pl: { lines: LineValue[]; totals: SectionTotal[] };
  ce: { rows: { label_ar: string; label_en: string; value: string; note?: string }[]; status: 'ok' | 'insufficient_data'; note?: string };
  cf: { rows: { label_ar: string; label_en: string; value: string; section: string }[]; totals: SectionTotal[]; status: 'ok' | 'insufficient_data'; note?: string };
  key_figures: Record<string, string | null>;
  notes: string[];
}

/** حساب صافي الرصيد لكل بند من بنود القوائم */
export function aggregateByLine(entries: TbEntry[], accounts?: Map<string, AccountMeta>, which: 'closing' | 'opening' = 'closing') {
  const map = new Map<string, { net: Decimal; accounts: { code: string; name: string | null; net: string }[] }>();
  const pm = prefixMapFor(entries);
  for (const e of entries) {
    const meta = resolveMeta(e, accounts, pm);
    const n = which === 'closing' ? net(e.closing_debit, e.closing_credit) : net(e.opening_debit, e.opening_credit);
    const cur = map.get(meta.fs_line_code) ?? { net: ZERO, accounts: [] };
    cur.net = cur.net.plus(n);
    cur.accounts.push({ code: e.account_code, name: e.account_name, net: toStr(n) });
    map.set(meta.fs_line_code, cur);
  }
  return map;
}

/** تحويل صافي الرصيد (مدين موجب) إلى قيمة العرض الطبيعية للبند */
function presentValue(lineCode: string, netDebit: Decimal): Decimal {
  const l = FS_LINE_MAP[lineCode];
  if (!l) return netDebit;
  return l.normal_sign === 'credit' ? netDebit.neg() : netDebit;
}

export function buildStatements(params: {
  current: TbEntry[]; prior?: TbEntry[] | null; accounts?: Map<string, AccountMeta>;
  periodLabel: string; priorLabel?: string | null; currency?: string;
}): StatementPackage {
  const notes: string[] = [];
  const cur = aggregateByLine(params.current, params.accounts, 'closing');
  const pri = params.prior ? aggregateByLine(params.prior, params.accounts, 'closing') : null;
  const opening = aggregateByLine(params.current, params.accounts, 'opening');

  const lineVal = (m: Map<string, { net: Decimal; accounts: LineValue['accounts'] }> | null, code: string): Decimal | null => {
    if (!m) return null;
    const v = m.get(code);
    return v ? presentValue(code, v.net) : ZERO;
  };
  const buildLines = (statement: string): LineValue[] => FS_LINES.filter((l) => l.statement === statement).map((l) => {
    const v = cur.get(l.code);
    const pv = pri ? lineVal(pri, l.code) : null;
    return { code: l.code, label_ar: l.label_ar, label_en: l.label_en, section: l.section,
      value: toStr(v ? presentValue(l.code, v.net) : ZERO), prior_value: pv === null ? null : toStr(pv), accounts: v?.accounts ?? [] };
  }).filter((l) => !(D(l.value).isZero() && (l.prior_value == null || D(l.prior_value).isZero()) && l.accounts.length === 0));

  // ---- قائمة الربح أو الخسارة ----
  const plLines = buildLines('pl').concat(buildLines('oci'));
  const sec = (lines: LineValue[], section: string, prior = false) => sum(lines.filter((l) => l.section === section).map((l) => prior ? (l.prior_value ?? 0) : l.value));
  const plCalc = (prior: boolean) => {
    const revenue = sec(plLines, 'revenue', prior) ;
    // المردودات تُعرض كبند مدين داخل قسم الإيرادات: الإيراد الصافي = الإيرادات (دائن) - المردودات (مدين)
    const revLines = plLines.filter((l) => l.section === 'revenue');
    const netRevenue = sum(revLines.map((l) => { const v = D(prior ? (l.prior_value ?? 0) : l.value); return FS_LINE_MAP[l.code].normal_sign === 'debit' ? v.neg() : v; }));
    const cogs = sec(plLines, 'cost_of_sales', prior);
    const gross = netRevenue.minus(cogs);
    const opex = sec(plLines, 'operating_expenses', prior);
    const operating = gross.minus(opex);
    const nonOp = plLines.filter((l) => l.section === 'non_operating');
    const otherIncome = sum(nonOp.filter((l) => FS_LINE_MAP[l.code].normal_sign === 'credit').map((l) => prior ? (l.prior_value ?? 0) : l.value));
    const otherExp = sum(nonOp.filter((l) => FS_LINE_MAP[l.code].normal_sign === 'debit').map((l) => prior ? (l.prior_value ?? 0) : l.value));
    const beforeZakat = operating.plus(otherIncome).minus(otherExp);
    const zakat = sec(plLines, 'zakat_tax', prior);
    const netIncome = beforeZakat.minus(zakat);
    const oci = sec(plLines, 'oci', prior);
    const financeCost = sum(plLines.filter((l) => l.code === 'FINANCE_COST').map((l) => prior ? (l.prior_value ?? 0) : l.value));
    const depreciation = sum(plLines.filter((l) => l.code === 'DEPRECIATION_EXP').map((l) => prior ? (l.prior_value ?? 0) : l.value));
    return { revenue, netRevenue, cogs, gross, opex, operating, otherIncome, otherExp, beforeZakat, zakat, netIncome, oci, total: netIncome.plus(oci), financeCost, depreciation };
  };
  const plC = plCalc(false); const plP = pri ? plCalc(true) : null;
  const plTotals: SectionTotal[] = [
    { key: 'net_revenue', label_ar: 'صافي الإيرادات', label_en: 'Net revenue', value: toStr(plC.netRevenue), prior_value: plP ? toStr(plP.netRevenue) : null },
    { key: 'gross_profit', label_ar: 'مجمل الربح', label_en: 'Gross profit', value: toStr(plC.gross), prior_value: plP ? toStr(plP.gross) : null },
    { key: 'operating_profit', label_ar: 'الربح التشغيلي', label_en: 'Operating profit', value: toStr(plC.operating), prior_value: plP ? toStr(plP.operating) : null },
    { key: 'profit_before_zakat', label_ar: 'الربح قبل الزكاة والضريبة', label_en: 'Profit before zakat and tax', value: toStr(plC.beforeZakat), prior_value: plP ? toStr(plP.beforeZakat) : null },
    { key: 'net_income', label_ar: 'صافي الربح / (الخسارة)', label_en: 'Net profit / (loss)', value: toStr(plC.netIncome), prior_value: plP ? toStr(plP.netIncome) : null },
    { key: 'total_comprehensive', label_ar: 'إجمالي الدخل الشامل', label_en: 'Total comprehensive income', value: toStr(plC.total), prior_value: plP ? toStr(plP.total) : null },
  ];

  // ---- قائمة المركز المالي ----
  const sfpLines = buildLines('sfp');
  const sfpCalc = (prior: boolean, netIncome: Decimal) => {
    const g = (s: string) => sum(sfpLines.filter((l) => l.section === s).map((l) => {
      const v = D(prior ? (l.prior_value ?? 0) : l.value);
      // الحسابات المقابلة (مخصص/مجمع) تُطرح من مجموعتها
      return ['AR_ALLOWANCE', 'ACC_DEP'].includes(l.code) ? v.neg() : (l.code === 'DIVIDENDS' ? v.neg() : v);
    }));
    const currentAssets = g('current_assets'); const nonCurrentAssets = g('non_current_assets');
    const currentLiab = g('current_liabilities'); const nonCurrentLiab = g('non_current_liabilities');
    const unclassified = g('unclassified');
    const equityExcl = g('equity');
    // إن كان الميزان قبل الإقفال تُضاف نتيجة الفترة إلى حقوق الملكية
    const equity = equityExcl.plus(netIncome);
    const totalAssets = currentAssets.plus(nonCurrentAssets).plus(unclassified);
    const totalLiab = currentLiab.plus(nonCurrentLiab);
    return { currentAssets, nonCurrentAssets, totalAssets, currentLiab, nonCurrentLiab, totalLiab, equityExcl, equity, totalLiabEquity: totalLiab.plus(equity), unclassified };
  };
  const sC = sfpCalc(false, plC.netIncome); const sP = pri && plP ? sfpCalc(true, plP.netIncome) : null;
  const diff = sC.totalAssets.minus(sC.totalLiabEquity);
  if (!sC.unclassified.isZero()) notes.push(`يوجد صافي رصيد ${toStr(sC.unclassified)} في حسابات غير مصنفة/معلقة أُدرج ضمن الأصول مؤقتًا حتى يكتمل الربط.`);
  if (diff.abs().gt('0.05')) notes.push(`قائمة المركز المالي غير متوازنة بفرق ${toStr(diff)}؛ راجع توازن ميزان المراجعة وتصنيف الحسابات.`);
  notes.push('صافي ربح الفترة أُضيف إلى حقوق الملكية باعتبار ميزان المراجعة قبل الإقفال.');
  const sfpTotals: SectionTotal[] = [
    { key: 'current_assets', label_ar: 'إجمالي الأصول المتداولة', label_en: 'Total current assets', value: toStr(sC.currentAssets), prior_value: sP ? toStr(sP.currentAssets) : null },
    { key: 'non_current_assets', label_ar: 'إجمالي الأصول غير المتداولة', label_en: 'Total non-current assets', value: toStr(sC.nonCurrentAssets), prior_value: sP ? toStr(sP.nonCurrentAssets) : null },
    { key: 'total_assets', label_ar: 'إجمالي الأصول', label_en: 'Total assets', value: toStr(sC.totalAssets), prior_value: sP ? toStr(sP.totalAssets) : null },
    { key: 'current_liabilities', label_ar: 'إجمالي الالتزامات المتداولة', label_en: 'Total current liabilities', value: toStr(sC.currentLiab), prior_value: sP ? toStr(sP.currentLiab) : null },
    { key: 'non_current_liabilities', label_ar: 'إجمالي الالتزامات غير المتداولة', label_en: 'Total non-current liabilities', value: toStr(sC.nonCurrentLiab), prior_value: sP ? toStr(sP.nonCurrentLiab) : null },
    { key: 'total_liabilities', label_ar: 'إجمالي الالتزامات', label_en: 'Total liabilities', value: toStr(sC.totalLiab), prior_value: sP ? toStr(sP.totalLiab) : null },
    { key: 'net_income_in_equity', label_ar: 'صافي ربح / (خسارة) الفترة', label_en: 'Profit / (loss) for the period', value: toStr(plC.netIncome), prior_value: plP ? toStr(plP.netIncome) : null },
    { key: 'total_equity', label_ar: 'إجمالي حقوق الملكية', label_en: 'Total equity', value: toStr(sC.equity), prior_value: sP ? toStr(sP.equity) : null },
    { key: 'total_liabilities_equity', label_ar: 'إجمالي الالتزامات وحقوق الملكية', label_en: 'Total liabilities and equity', value: toStr(sC.totalLiabEquity), prior_value: sP ? toStr(sP.totalLiabEquity) : null },
  ];

  // ---- قائمة التغيرات في حقوق الملكية (تعتمد على الأرصدة الافتتاحية) ----
  const hasOpening = params.current.some((e) => !D(e.opening_debit).isZero() || !D(e.opening_credit).isZero());
  const equityOpen = sum([...opening.entries()].filter(([c]) => FS_LINE_MAP[c]?.section === 'equity').map(([c, v]) => presentValue(c, v.net).mul(c === 'DIVIDENDS' ? -1 : 1)));
  const capitalMov = (code: string) => {
    const c = cur.get(code)?.net ?? ZERO; const o = opening.get(code)?.net ?? ZERO;
    return presentValue(code, c.minus(o));
  };
  const ce: StatementPackage['ce'] = hasOpening ? {
    status: 'ok',
    rows: [
      { label_ar: 'الرصيد في بداية الفترة', label_en: 'Balance at beginning of period', value: toStr(equityOpen) },
      { label_ar: 'التغير في رأس المال', label_en: 'Change in share capital', value: toStr(capitalMov('SHARE_CAPITAL')) },
      { label_ar: 'التغير في الاحتياطيات', label_en: 'Change in reserves', value: toStr(capitalMov('STATUTORY_RESERVE').plus(capitalMov('OTHER_RESERVES'))) },
      { label_ar: 'التغير في جاري الشركاء / الأرباح المبقاة (حركات مباشرة)', label_en: 'Movements in current accounts / retained earnings', value: toStr(capitalMov('OWNER_CURRENT').plus(capitalMov('RETAINED_EARNINGS'))) },
      { label_ar: 'صافي ربح / (خسارة) الفترة', label_en: 'Profit / (loss) for the period', value: toStr(plC.netIncome) },
      { label_ar: 'الدخل الشامل الآخر', label_en: 'Other comprehensive income', value: toStr(plC.oci) },
      { label_ar: 'توزيعات أرباح / مسحوبات', label_en: 'Dividends / drawings', value: toStr(capitalMov('DIVIDENDS').neg()) },
      { label_ar: 'الرصيد في نهاية الفترة', label_en: 'Balance at end of period', value: toStr(sC.equity) },
    ],
  } : { status: 'insufficient_data', rows: [], note: 'يتطلب أرصدة افتتاحية لحسابات حقوق الملكية في ميزان المراجعة.' };

  // ---- قائمة التدفقات النقدية (الطريقة غير المباشرة) ----
  const cfRows: StatementPackage['cf']['rows'] = []; const cfTotals: SectionTotal[] = [];
  let cfStatus: 'ok' | 'insufficient_data' = 'insufficient_data'; let cfNote: string | undefined;
  const baseMap = hasOpening ? opening : (pri ?? null);
  if (baseMap) {
    cfStatus = 'ok';
    const delta = (code: string) => { // تغير صافي الرصيد المدين
      const c = cur.get(code)?.net ?? ZERO; const o = baseMap.get(code)?.net ?? ZERO; return c.minus(o);
    };
    const wcAssets = ['AR', 'OTHER_RECEIVABLES', 'RELATED_PARTY_DR', 'INVENTORY', 'VAT_RECEIVABLE', 'OTHER_CURRENT_ASSETS'];
    const wcLiabs = ['AP', 'ACCRUALS', 'RELATED_PARTY_CR', 'VAT_PAYABLE', 'OTHER_CURRENT_LIABILITIES', 'EOSB', 'ZAKAT_TAX_PAYABLE'];
    cfRows.push({ section: 'operating', label_ar: 'صافي ربح / (خسارة) الفترة', label_en: 'Profit / (loss) for the period', value: toStr(plC.netIncome) });
    cfRows.push({ section: 'operating', label_ar: 'تعديلات: الاستهلاك والإطفاء', label_en: 'Adjustments: depreciation and amortisation', value: toStr(plC.depreciation) });
    // الخسائر الائتمانية غير النقدية = الزيادة في المخصص (الشطب المباشر ينعكس في تغير الذمم)
    const allowDeltaCr = delta('AR_ALLOWANCE').neg();
    if (!allowDeltaCr.isZero()) cfRows.push({ section: 'operating', label_ar: 'تعديلات: التغير في مخصص الخسائر الائتمانية', label_en: 'Adjustments: change in ECL allowance', value: toStr(allowDeltaCr) });
    let op = plC.netIncome.plus(plC.depreciation).plus(allowDeltaCr);
    for (const c of wcAssets) { const d = delta(c); if (!d.isZero()) { cfRows.push({ section: 'operating', label_ar: `التغير في ${FS_LINE_MAP[c].label_ar}`, label_en: `Change in ${FS_LINE_MAP[c].label_en}`, value: toStr(d.neg()) }); op = op.minus(d); } }
    for (const c of wcLiabs) { const d = delta(c).neg(); if (!d.isZero()) { cfRows.push({ section: 'operating', label_ar: `التغير في ${FS_LINE_MAP[c].label_ar}`, label_en: `Change in ${FS_LINE_MAP[c].label_en}`, value: toStr(d) }); op = op.plus(d); } }
    cfTotals.push({ key: 'operating', label_ar: 'صافي النقد من الأنشطة التشغيلية', label_en: 'Net cash from operating activities', value: toStr(op) });
    let inv = ZERO;
    for (const c of ['PPE', 'INTANGIBLES', 'ROU_ASSETS', 'INVESTMENTS', 'OTHER_NON_CURRENT_ASSETS']) {
      const d = delta(c); if (!d.isZero()) { cfRows.push({ section: 'investing', label_ar: `إضافات / (استبعادات) ${FS_LINE_MAP[c].label_ar}`, label_en: `Additions / (disposals) ${FS_LINE_MAP[c].label_en}`, value: toStr(d.neg()) }); inv = inv.minus(d); }
    }
    const accDepDelta = delta('ACC_DEP').neg(); // زيادة المجمع (دائن)
    const depDiff = accDepDelta.minus(plC.depreciation);
    if (!depDiff.isZero()) { cfRows.push({ section: 'investing', label_ar: 'تعديل: فرق حركة مجمع الاستهلاك عن مصروف الاستهلاك (استبعادات/تصحيحات)', label_en: 'Adjustment: accumulated depreciation movement vs expense', value: toStr(depDiff) }); inv = inv.plus(depDiff); notes.push(`حركة مجمع الاستهلاك (${toStr(accDepDelta)}) تختلف عن مصروف الاستهلاك (${toStr(plC.depreciation)})؛ يلزم التحقق من الاستبعادات.`); }
    cfTotals.push({ key: 'investing', label_ar: 'صافي النقد من الأنشطة الاستثمارية', label_en: 'Net cash from investing activities', value: toStr(inv) });
    let fin = ZERO;
    for (const c of ['SHORT_TERM_LOANS', 'LONG_TERM_LOANS', 'LEASE_LIAB_CURRENT', 'LEASE_LIAB_NON_CURRENT', 'OTHER_NON_CURRENT_LIABILITIES', 'SHARE_CAPITAL', 'STATUTORY_RESERVE', 'OTHER_RESERVES', 'OWNER_CURRENT', 'RETAINED_EARNINGS']) {
      const d = delta(c).neg(); if (!d.isZero()) { cfRows.push({ section: 'financing', label_ar: `التغير في ${FS_LINE_MAP[c].label_ar}`, label_en: `Change in ${FS_LINE_MAP[c].label_en}`, value: toStr(d) }); fin = fin.plus(d); }
    }
    const divDelta = delta('DIVIDENDS');
    if (!divDelta.isZero()) { cfRows.push({ section: 'financing', label_ar: 'توزيعات أرباح / مسحوبات مدفوعة', label_en: 'Dividends / drawings paid', value: toStr(divDelta.neg()) }); fin = fin.minus(divDelta); }
    cfTotals.push({ key: 'financing', label_ar: 'صافي النقد من الأنشطة التمويلية', label_en: 'Net cash from financing activities', value: toStr(fin) });
    const netChange = op.plus(inv).plus(fin);
    const cashOpen = presentValue('CASH', baseMap.get('CASH')?.net ?? ZERO);
    const cashClose = presentValue('CASH', cur.get('CASH')?.net ?? ZERO);
    cfTotals.push({ key: 'net_change', label_ar: 'صافي التغير في النقد', label_en: 'Net change in cash', value: toStr(netChange) });
    cfTotals.push({ key: 'cash_opening', label_ar: 'النقد في بداية الفترة', label_en: 'Cash at beginning of period', value: toStr(cashOpen) });
    cfTotals.push({ key: 'cash_closing_computed', label_ar: 'النقد في نهاية الفترة (محسوب)', label_en: 'Cash at end of period (computed)', value: toStr(cashOpen.plus(netChange)) });
    cfTotals.push({ key: 'cash_closing_tb', label_ar: 'النقد في نهاية الفترة (حسب الميزان)', label_en: 'Cash at end of period (per TB)', value: toStr(cashClose) });
    const cfDiff = cashOpen.plus(netChange).minus(cashClose);
    cfTotals.push({ key: 'cf_difference', label_ar: 'فرق المطابقة', label_en: 'Reconciliation difference', value: toStr(cfDiff) });
    if (cfDiff.abs().gt('0.05')) notes.push(`قائمة التدفقات النقدية لا تتطابق مع رصيد النقد بفرق ${toStr(cfDiff)}؛ السبب عادة حسابات غير مصنفة أو حركات غير نقدية غير معدّلة.`);
    cfNote = hasOpening ? 'أُعدت بالطريقة غير المباشرة من الأرصدة الافتتاحية والختامية لميزان المراجعة. البنود غير النقدية غير المعدلة قد تحتاج تسوية يدوية.' : 'أُعدت من مقارنة أرصدة الفترة السابقة بالحالية.';
  } else {
    cfNote = 'يتطلب أرصدة افتتاحية أو ميزان فترة سابقة لحساب التغيرات.';
  }

  const kf: Record<string, string | null> = {
    total_assets: toStr(sC.totalAssets), current_assets: toStr(sC.currentAssets), non_current_assets: toStr(sC.nonCurrentAssets),
    total_liabilities: toStr(sC.totalLiab), current_liabilities: toStr(sC.currentLiab), non_current_liabilities: toStr(sC.nonCurrentLiab),
    total_equity: toStr(sC.equity), revenue: toStr(plC.netRevenue), cogs: toStr(plC.cogs), gross_profit: toStr(plC.gross),
    operating_profit: toStr(plC.operating), net_income: toStr(plC.netIncome), finance_cost: toStr(plC.financeCost), depreciation: toStr(plC.depreciation),
    cash: toStr(presentValue('CASH', cur.get('CASH')?.net ?? ZERO)),
    receivables: toStr(presentValue('AR', cur.get('AR')?.net ?? ZERO).minus(presentValue('AR_ALLOWANCE', cur.get('AR_ALLOWANCE')?.net ?? ZERO))),
    receivables_gross: toStr(presentValue('AR', cur.get('AR')?.net ?? ZERO)),
    inventory: toStr(presentValue('INVENTORY', cur.get('INVENTORY')?.net ?? ZERO)),
    payables: toStr(presentValue('AP', cur.get('AP')?.net ?? ZERO)),
    loans: toStr(presentValue('SHORT_TERM_LOANS', cur.get('SHORT_TERM_LOANS')?.net ?? ZERO).plus(presentValue('LONG_TERM_LOANS', cur.get('LONG_TERM_LOANS')?.net ?? ZERO))),
    operating_cash_flow: cfStatus === 'ok' ? cfTotals.find((t) => t.key === 'operating')!.value : null,
    prior_total_assets: sP ? toStr(sP.totalAssets) : null, prior_total_equity: sP ? toStr(sP.equity) : null,
    prior_revenue: plP ? toStr(plP.netRevenue) : null, prior_net_income: plP ? toStr(plP.netIncome) : null,
    prior_receivables: pri ? toStr(presentValue('AR', pri.get('AR')?.net ?? ZERO)) : null,
    prior_inventory: pri ? toStr(presentValue('INVENTORY', pri.get('INVENTORY')?.net ?? ZERO)) : null,
    prior_payables: pri ? toStr(presentValue('AP', pri.get('AP')?.net ?? ZERO)) : null,
    opening_receivables: hasOpening ? toStr(presentValue('AR', opening.get('AR')?.net ?? ZERO)) : null,
    opening_inventory: hasOpening ? toStr(presentValue('INVENTORY', opening.get('INVENTORY')?.net ?? ZERO)) : null,
    opening_payables: hasOpening ? toStr(presentValue('AP', opening.get('AP')?.net ?? ZERO)) : null,
    opening_total_assets: hasOpening ? toStr(sum([...opening.entries()].filter(([c]) => ['current_assets', 'non_current_assets'].includes(FS_LINE_MAP[c]?.section ?? '')).map(([c, v]) => presentValue(c, v.net).mul(['AR_ALLOWANCE', 'ACC_DEP'].includes(c) ? -1 : 1)))) : null,
  };

  return {
    basis: 'trial_balance', period_label: params.periodLabel, prior_label: params.priorLabel ?? null, currency: params.currency ?? 'SAR',
    sfp: { lines: sfpLines, totals: sfpTotals, balanced: diff.abs().lte('0.05'), difference: toStr(diff) },
    pl: { lines: plLines, totals: plTotals }, ce, cf: { rows: cfRows, totals: cfTotals, status: cfStatus, note: cfNote },
    key_figures: kf, notes,
  };
}
