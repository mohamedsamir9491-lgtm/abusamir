import { D, Decimal, safeDiv, toStr } from './money.js';

export interface RatioResult {
  code: string; group: string; label_ar: string; label_en: string;
  formula_ar: string; formula: string;
  inputs: Record<string, string | null>;
  value: string | null; unit: 'ratio' | 'pct' | 'days' | 'amount' | 'times';
  status: 'ok' | 'insufficient_data';
  note?: string;
  prior_value?: string | null;
  interpretation_ar?: string;
}

type KF = Record<string, string | null>;

function avg(a: string | null | undefined, b: string | null | undefined): Decimal | null {
  if (a == null && b == null) return null;
  if (a == null) return D(b); if (b == null) return D(a);
  return D(a).plus(D(b)).div(2);
}

export function computeRatios(kf: KF, opts: { periodDays?: number; priorKf?: KF | null } = {}): RatioResult[] {
  const days = opts.periodDays ?? 365;
  const out: RatioResult[] = [];
  const get = (k: string) => (kf[k] == null ? null : D(kf[k]!));
  const nn = (...vals: (Decimal | null)[]) => vals.every((v) => v !== null);
  const push = (r: Omit<RatioResult, 'status' | 'inputs' | 'value'> & { inputs: Record<string, Decimal | null>; value: Decimal | null; note?: string }) => {
    const ok = r.value !== null;
    out.push({ ...r, inputs: Object.fromEntries(Object.entries(r.inputs).map(([k, v]) => [k, v === null ? null : toStr(v)])),
      value: ok ? (r.unit === 'ratio' || r.unit === 'times' ? r.value!.toDecimalPlaces(2).toFixed(2) : r.unit === 'days' ? r.value!.toDecimalPlaces(0).toFixed(0) : toStr(r.value!)) : null,
      status: ok ? 'ok' : 'insufficient_data', note: ok ? r.note : (r.note ?? 'بيانات غير كافية للاحتساب') });
  };

  const ca = get('current_assets'), cl = get('current_liabilities'), inv = get('inventory'), cash = get('cash');
  const ta = get('total_assets'), tl = get('total_liabilities'), te = get('total_equity'), rev = get('revenue'), cogs = get('cogs');
  const gp = get('gross_profit'), op = get('operating_profit'), ni = get('net_income'), ar = get('receivables_gross'), ap = get('payables');
  const loans = get('loans'), fc = get('finance_cost'), ocf = get('operating_cash_flow');
  const prior = opts.priorKf ?? {};
  const avgOrEnd = (k: string, priorKey: string, openKey: string) => {
    const end = get(k); const base = kf[openKey] ?? prior[priorKey] ?? null;
    return base != null ? avg(toStr(end ?? 0), base) : end;
  };

  // السيولة
  push({ code: 'current_ratio', group: 'liquidity', label_ar: 'نسبة التداول', label_en: 'Current ratio', formula_ar: 'الأصول المتداولة ÷ الالتزامات المتداولة', formula: 'current_assets / current_liabilities',
    inputs: { current_assets: ca, current_liabilities: cl }, value: nn(ca, cl) ? safeDiv(ca!, cl!) : null, unit: 'ratio',
    note: nn(ca, cl) && cl!.isZero() ? 'الالتزامات المتداولة صفر' : undefined, interpretation_ar: 'أقل من 1 يشير إلى ضغط على السيولة قصيرة الأجل.' });
  push({ code: 'quick_ratio', group: 'liquidity', label_ar: 'نسبة السيولة السريعة', label_en: 'Quick ratio', formula_ar: '(الأصول المتداولة − المخزون) ÷ الالتزامات المتداولة', formula: '(current_assets - inventory) / current_liabilities',
    inputs: { current_assets: ca, inventory: inv, current_liabilities: cl }, value: nn(ca, cl) ? safeDiv(ca!.minus(inv ?? 0), cl!) : null, unit: 'ratio' });
  push({ code: 'cash_ratio', group: 'liquidity', label_ar: 'نسبة النقدية', label_en: 'Cash ratio', formula_ar: 'النقد ÷ الالتزامات المتداولة', formula: 'cash / current_liabilities',
    inputs: { cash, current_liabilities: cl }, value: nn(cash, cl) ? safeDiv(cash!, cl!) : null, unit: 'ratio' });
  push({ code: 'working_capital', group: 'liquidity', label_ar: 'رأس المال العامل', label_en: 'Working capital', formula_ar: 'الأصول المتداولة − الالتزامات المتداولة', formula: 'current_assets - current_liabilities',
    inputs: { current_assets: ca, current_liabilities: cl }, value: nn(ca, cl) ? ca!.minus(cl!) : null, unit: 'amount' });
  // المديونية
  push({ code: 'debt_to_equity', group: 'leverage', label_ar: 'نسبة الالتزامات إلى حقوق الملكية', label_en: 'Debt-to-equity (total liabilities)', formula_ar: 'إجمالي الالتزامات ÷ حقوق الملكية', formula: 'total_liabilities / total_equity',
    inputs: { total_liabilities: tl, total_equity: te }, value: nn(tl, te) && !te!.isZero() ? safeDiv(tl!, te!) : null, unit: 'ratio',
    note: nn(tl, te) && te!.lte(0) ? 'حقوق الملكية صفر أو سالبة؛ النسبة غير ذات معنى' : undefined });
  push({ code: 'loans_to_equity', group: 'leverage', label_ar: 'القروض إلى حقوق الملكية', label_en: 'Borrowings-to-equity', formula_ar: 'القروض ÷ حقوق الملكية', formula: 'loans / total_equity',
    inputs: { loans, total_equity: te }, value: nn(loans, te) && te!.gt(0) ? safeDiv(loans!, te!) : null, unit: 'ratio' });
  push({ code: 'debt_ratio', group: 'leverage', label_ar: 'نسبة الالتزامات إلى الأصول', label_en: 'Debt ratio', formula_ar: 'إجمالي الالتزامات ÷ إجمالي الأصول', formula: 'total_liabilities / total_assets',
    inputs: { total_liabilities: tl, total_assets: ta }, value: nn(tl, ta) ? safeDiv(tl!, ta!) : null, unit: 'ratio' });
  push({ code: 'equity_ratio', group: 'leverage', label_ar: 'نسبة حقوق الملكية إلى الأصول', label_en: 'Equity ratio', formula_ar: 'حقوق الملكية ÷ إجمالي الأصول', formula: 'total_equity / total_assets',
    inputs: { total_equity: te, total_assets: ta }, value: nn(te, ta) ? safeDiv(te!, ta!) : null, unit: 'ratio' });
  push({ code: 'interest_coverage', group: 'leverage', label_ar: 'تغطية تكاليف التمويل', label_en: 'Interest coverage', formula_ar: 'الربح التشغيلي ÷ تكاليف التمويل', formula: 'operating_profit / finance_cost',
    inputs: { operating_profit: op, finance_cost: fc }, value: nn(op, fc) && !fc!.isZero() ? safeDiv(op!, fc!) : null, unit: 'times', note: fc && fc.isZero() ? 'لا توجد تكاليف تمويل' : undefined });
  // الربحية
  const pctOf = (a: Decimal | null, b: Decimal | null) => (nn(a, b) && !b!.isZero() ? safeDiv(a!, b!)!.mul(100) : null);
  push({ code: 'gross_margin', group: 'profitability', label_ar: 'هامش مجمل الربح', label_en: 'Gross profit margin', formula_ar: 'مجمل الربح ÷ صافي الإيرادات × 100', formula: 'gross_profit / revenue * 100',
    inputs: { gross_profit: gp, revenue: rev }, value: pctOf(gp, rev), unit: 'pct' });
  push({ code: 'operating_margin', group: 'profitability', label_ar: 'هامش الربح التشغيلي', label_en: 'Operating profit margin', formula_ar: 'الربح التشغيلي ÷ صافي الإيرادات × 100', formula: 'operating_profit / revenue * 100',
    inputs: { operating_profit: op, revenue: rev }, value: pctOf(op, rev), unit: 'pct' });
  push({ code: 'net_margin', group: 'profitability', label_ar: 'هامش صافي الربح', label_en: 'Net profit margin', formula_ar: 'صافي الربح ÷ صافي الإيرادات × 100', formula: 'net_income / revenue * 100',
    inputs: { net_income: ni, revenue: rev }, value: pctOf(ni, rev), unit: 'pct' });
  const avgAssets = avgOrEnd('total_assets', 'prior_total_assets', 'opening_total_assets');
  push({ code: 'roa', group: 'profitability', label_ar: 'العائد على الأصول', label_en: 'Return on assets', formula_ar: 'صافي الربح ÷ متوسط إجمالي الأصول × 100', formula: 'net_income / avg_total_assets * 100',
    inputs: { net_income: ni, avg_total_assets: avgAssets }, value: pctOf(ni, avgAssets), unit: 'pct',
    note: kf['opening_total_assets'] == null && prior['prior_total_assets'] == null ? 'استُخدم رصيد نهاية الفترة لعدم توفر رصيد البداية' : undefined });
  const avgEquity = prior['prior_total_equity'] != null ? avg(toStr(te ?? 0), prior['prior_total_equity']) : te;
  push({ code: 'roe', group: 'profitability', label_ar: 'العائد على حقوق الملكية', label_en: 'Return on equity', formula_ar: 'صافي الربح ÷ متوسط حقوق الملكية × 100', formula: 'net_income / avg_equity * 100',
    inputs: { net_income: ni, avg_equity: avgEquity }, value: avgEquity && avgEquity.gt(0) ? pctOf(ni, avgEquity) : null, unit: 'pct',
    note: avgEquity && avgEquity.lte(0) ? 'حقوق الملكية صفر أو سالبة' : (prior['prior_total_equity'] == null ? 'استُخدم رصيد نهاية الفترة' : undefined) });
  // الكفاءة
  const avgAr = avgOrEnd('receivables_gross', 'prior_receivables', 'opening_receivables');
  const arTurn = nn(rev, avgAr) && avgAr!.gt(0) ? safeDiv(rev!, avgAr!) : null;
  push({ code: 'receivables_turnover', group: 'efficiency', label_ar: 'معدل دوران الذمم المدينة', label_en: 'Receivables turnover', formula_ar: 'صافي الإيرادات ÷ متوسط الذمم المدينة', formula: 'revenue / avg_receivables',
    inputs: { revenue: rev, avg_receivables: avgAr }, value: arTurn, unit: 'times', note: avgAr && avgAr.lte(0) ? 'لا توجد ذمم مدينة' : undefined });
  push({ code: 'dso', group: 'efficiency', label_ar: 'فترة التحصيل (أيام)', label_en: 'Days sales outstanding', formula_ar: `متوسط الذمم المدينة ÷ صافي الإيرادات × ${days}`, formula: `avg_receivables / revenue * ${days}`,
    inputs: { avg_receivables: avgAr, revenue: rev }, value: nn(rev, avgAr) && rev!.gt(0) ? safeDiv(avgAr!, rev!)!.mul(days) : null, unit: 'days' });
  const avgInv = avgOrEnd('inventory', 'prior_inventory', 'opening_inventory');
  push({ code: 'inventory_turnover', group: 'efficiency', label_ar: 'معدل دوران المخزون', label_en: 'Inventory turnover', formula_ar: 'تكلفة المبيعات ÷ متوسط المخزون', formula: 'cogs / avg_inventory',
    inputs: { cogs, avg_inventory: avgInv }, value: nn(cogs, avgInv) && avgInv!.gt(0) ? safeDiv(cogs!, avgInv!) : null, unit: 'times', note: avgInv && avgInv.lte(0) ? 'لا يوجد مخزون' : undefined });
  push({ code: 'dio', group: 'efficiency', label_ar: 'فترة بقاء المخزون (أيام)', label_en: 'Days inventory outstanding', formula_ar: `متوسط المخزون ÷ تكلفة المبيعات × ${days}`, formula: `avg_inventory / cogs * ${days}`,
    inputs: { avg_inventory: avgInv, cogs }, value: nn(cogs, avgInv) && cogs!.gt(0) && avgInv!.gt(0) ? safeDiv(avgInv!, cogs!)!.mul(days) : null, unit: 'days' });
  const avgAp = avgOrEnd('payables', 'prior_payables', 'opening_payables');
  push({ code: 'dpo', group: 'efficiency', label_ar: 'فترة السداد للموردين (أيام)', label_en: 'Days payables outstanding', formula_ar: `متوسط الذمم الدائنة ÷ تكلفة المبيعات × ${days}`, formula: `avg_payables / cogs * ${days}`,
    inputs: { avg_payables: avgAp, cogs }, value: nn(cogs, avgAp) && cogs!.gt(0) && avgAp!.gt(0) ? safeDiv(avgAp!, cogs!)!.mul(days) : null, unit: 'days' });
  push({ code: 'asset_turnover', group: 'efficiency', label_ar: 'معدل دوران الأصول', label_en: 'Asset turnover', formula_ar: 'صافي الإيرادات ÷ متوسط إجمالي الأصول', formula: 'revenue / avg_total_assets',
    inputs: { revenue: rev, avg_total_assets: avgAssets }, value: nn(rev, avgAssets) && avgAssets!.gt(0) ? safeDiv(rev!, avgAssets!) : null, unit: 'times' });
  // التدفق النقدي
  push({ code: 'ocf_to_net_income', group: 'cash_flow', label_ar: 'التدفق النقدي التشغيلي ÷ صافي الربح', label_en: 'Operating cash flow to net income', formula_ar: 'صافي النقد من التشغيل ÷ صافي الربح', formula: 'operating_cash_flow / net_income',
    inputs: { operating_cash_flow: ocf, net_income: ni }, value: nn(ocf, ni) && !ni!.isZero() ? safeDiv(ocf!, ni!) : null, unit: 'ratio',
    note: ocf === null ? 'قائمة التدفقات النقدية غير متاحة' : undefined, interpretation_ar: 'يميز الربح المحاسبي عن النقد الفعلي؛ نسبة منخفضة باستمرار تستدعي التحقق من جودة الأرباح.' });
  push({ code: 'ocf_to_current_liabilities', group: 'cash_flow', label_ar: 'التدفق النقدي التشغيلي ÷ الالتزامات المتداولة', label_en: 'Operating cash flow ratio', formula_ar: 'صافي النقد من التشغيل ÷ الالتزامات المتداولة', formula: 'operating_cash_flow / current_liabilities',
    inputs: { operating_cash_flow: ocf, current_liabilities: cl }, value: nn(ocf, cl) && !cl!.isZero() ? safeDiv(ocf!, cl!) : null, unit: 'ratio' });
  return out;
}
