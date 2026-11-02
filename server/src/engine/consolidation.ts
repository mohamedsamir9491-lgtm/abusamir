import { D, Decimal, ZERO, sum, net, toStr } from './money.js';
import { buildStatements } from './statements.js';
import type { TbEntry, AccountMeta } from './types.js';

/**
 * محرك توحيد وتقييم دفتري للمجموعة (IFRS 10 / IAS 27 بأسلوب صافي الأصول):
 * - يفصل بين: القيمة الدفترية المنفصلة للشركة الأم، صافي أصول المجموعة بعد الاستبعادات، صافي الأصول المعدل (تعديلات موثقة فقط).
 * - يستبعد الاستثمار مقابل حقوق ملكية التابعة، والأرصدة البينية، ويمنع ازدواج الاحتساب، ويعزل الفروق غير المطابقة بوصفها بنود تسوية لا خسائر مؤكدة.
 * - لا يحتسب قيمة عادلة: ذلك يتطلب توقعات وفرضيات معلنة خارج نطاق هذا المحرك.
 */
export interface GroupCompany { key: string; label: string; entries: TbEntry[]; accounts?: Map<string, AccountMeta>; periodLabel: string }
export interface SubsidiarySpec extends GroupCompany {
  ownership_pct: string;                     // نسبة حصة الأم في رأس المال (0-100)
  profit_share_pct?: string | null;          // حصة الأم في الأرباح إن اختلفت تعاقديًا
  investment_codes_in_parent: string[];      // حسابات الاستثمار لدى الأم
  parent_account_codes_in_sub: string[];     // حسابات الأم (جاري/ذمم) في دفاتر التابعة
  sub_account_codes_in_parent: string[];     // حسابات التابعة (جاري/ذمم) في دفاتر الأم
}
export interface AtCostSpec { key: string; label: string; investment_codes_in_parent: string[]; receivable_codes_in_parent: string[]; note?: string }
export interface DocumentedAdjustment { ref: string; description: string; amount: string; evidence: string; affects: 'parent' | string }
export interface SensitivityItem { key: string; title: string; condition: string; amount: string; direction: 'increase' | 'decrease' | 'either'; status: 'unresolved'; required_documents: string[] }

const netOf = (entries: TbEntry[], codes: string[]) => sum(entries.filter((e) => codes.includes(e.account_code)).map((e) => net(e.closing_debit, e.closing_credit)));

export function consolidate(input: { parent: GroupCompany; subsidiaries: SubsidiarySpec[]; at_cost: AtCostSpec[]; adjustments?: DocumentedAdjustment[]; currency?: string }) {
  const pStat = buildStatements({ current: input.parent.entries, accounts: input.parent.accounts, periodLabel: input.parent.periodLabel });
  if (!pStat.sfp.balanced) throw new Error(`قائمة المركز المالي للشركة الأم غير متوازنة (${pStat.sfp.difference})؛ يُرفض التوحيد`);
  const parentEquity = D(pStat.key_figures.total_equity ?? 0);
  const subs = input.subsidiaries.map((sub) => {
    const st = buildStatements({ current: sub.entries, accounts: sub.accounts, periodLabel: sub.periodLabel });
    if (!st.sfp.balanced) throw new Error(`قائمة المركز المالي لـ${sub.label} غير متوازنة (${st.sfp.difference})؛ يُرفض التوحيد`);
    const subEquity = D(st.key_figures.total_equity ?? 0);
    const own = D(sub.ownership_pct).div(100);
    const investmentCost = netOf(input.parent.entries, sub.investment_codes_in_parent);           // مدين لدى الأم
    const subRecFromParent = netOf(sub.entries, sub.parent_account_codes_in_sub);                  // مدين = مستحق من الأم، دائن = مستحق إلى الأم
    const parentRecFromSub = netOf(input.parent.entries, sub.sub_account_codes_in_parent);         // مدين = مستحق من التابعة، دائن = مستحق إلى التابعة
    // مطابقة الأرصدة البينية: ما تطالب به التابعة الأم يجب أن يقابله التزام لدى الأم والعكس
    const subClaimOnParent = Decimal.max(subRecFromParent, ZERO); const subOwesParent = Decimal.max(subRecFromParent.neg(), ZERO);
    const parentClaimOnSub = Decimal.max(parentRecFromSub, ZERO); const parentOwesSub = Decimal.max(parentRecFromSub.neg(), ZERO);
    const unmatched1 = subClaimOnParent.minus(parentOwesSub);   // رصيد تطالب به التابعة بلا مقابل لدى الأم (موجب)
    const unmatched2 = parentClaimOnSub.minus(subOwesParent);   // رصيد تطالب به الأم بلا مقابل لدى التابعة (موجب)
    const subCapital = D(st.sfp.lines.find((l) => l.code === 'SHARE_CAPITAL')?.value ?? 0);
    const impliedPaidCapital = subCapital.minus(subClaimOnParent);
    const investmentVsPaid = investmentCost.minus(impliedPaidCapital);
    // صافي أصول التابعة بعد استبعاد ما تطالب به الأم (لا يُعد أصلًا خارج المجموعة) وإضافة ما تدين به للأم
    const subNetAssetsExternal = subEquity.minus(subClaimOnParent).plus(subOwesParent);
    const parentShare = subNetAssetsExternal.mul(own); const nci = subNetAssetsExternal.minus(parentShare);
    // المساهمة في حقوق ملكية المجموعة = حصة الأم في صافي أصول التابعة الخارجية − تكلفة الاستثمار المستبعدة − ذمم الأم على التابعة (استُبعدت؛ مقابلها أُضيف ضمن subOwesParent) + ما تدين به الأم للتابعة (استُبعد من التزامات الأم؛ مقابله طُرح من subClaimOnParent)
    const contribution = parentShare.minus(investmentCost).minus(parentClaimOnSub).plus(parentOwesSub);
    return { key: sub.key, label: sub.label, ownership_pct: sub.ownership_pct, profit_share_pct: sub.profit_share_pct ?? null, statements: st, sub_equity: toStr(subEquity), sub_capital: toStr(subCapital),
      investment_cost_in_parent: toStr(investmentCost), sub_claim_on_parent: toStr(subClaimOnParent), sub_owes_parent: toStr(subOwesParent), parent_claim_on_sub: toStr(parentClaimOnSub), parent_owes_sub: toStr(parentOwesSub),
      unmatched_sub_claim: toStr(unmatched1), unmatched_parent_claim: toStr(unmatched2), implied_paid_capital: toStr(impliedPaidCapital), investment_vs_implied_paid_capital: toStr(investmentVsPaid),
      sub_net_assets_external: toStr(subNetAssetsExternal), parent_share: toStr(parentShare), nci: toStr(nci), contribution_to_group_equity: toStr(contribution), _contribution: contribution, _nci: nci, _inv: investmentCost, _unm1: unmatched1, _unm2: unmatched2, _ivp: investmentVsPaid };
  });
  const atCost = input.at_cost.map((a) => ({ key: a.key, label: a.label, investment_cost: toStr(netOf(input.parent.entries, a.investment_codes_in_parent)), receivable_from_company: toStr(netOf(input.parent.entries, a.receivable_codes_in_parent)), note: a.note ?? 'لم تُقدَّم قوائم مالية؛ مُبقاة بالقيمة الدفترية كمرجع مؤقت مشروط' }));
  const groupEquity = subs.reduce((acc, s) => acc.plus(s._contribution), parentEquity);
  const adjustments = input.adjustments ?? [];
  const adjustedNav = adjustments.reduce((acc, a) => acc.plus(D(a.amount)), groupEquity);
  // قيود الاستبعاد المقترحة (للعرض والمراجعة؛ لا تُرحَّل)
  const eliminations = subs.flatMap((s) => {
    const rows: { sub: string; description: string; debit: string; credit: string; account: string }[] = [];
    rows.push({ sub: s.label, description: 'استبعاد الاستثمار مقابل حقوق ملكية التابعة', account: 'حقوق ملكية التابعة (رأس المال والأرباح المبقاة ونتيجة الفترة)', debit: s.sub_equity, credit: '0.00' });
    rows.push({ sub: s.label, description: 'استبعاد الاستثمار مقابل حقوق ملكية التابعة', account: 'الاستثمار في التابعة لدى الأم', debit: '0.00', credit: s.investment_cost_in_parent });
    if (!D(s.sub_claim_on_parent).isZero()) rows.push({ sub: s.label, description: 'استبعاد رصيد بيني: مستحق من الأم في دفاتر التابعة', account: 'جاري/ذمم الأم لدى التابعة', debit: '0.00', credit: s.sub_claim_on_parent });
    if (!D(s.parent_claim_on_sub).isZero()) rows.push({ sub: s.label, description: 'استبعاد رصيد بيني: مستحق من التابعة في دفاتر الأم', account: 'جاري/ذمم التابعة لدى الأم', debit: '0.00', credit: s.parent_claim_on_sub });
    const residual = D(s.sub_equity).minus(s.investment_cost_in_parent).minus(s.sub_claim_on_parent).minus(s.parent_claim_on_sub).plus(s.sub_owes_parent).plus(s.parent_owes_sub);
    rows.push({ sub: s.label, description: 'فرق الاستبعاد (حصة الأم في صافي أصول التابعة الخارجية − تكلفة الاستثمار) يُضاف إلى حقوق ملكية المجموعة', account: 'حقوق ملكية المجموعة / حقوق غير مسيطرة', debit: residual.lt(0) ? toStr(residual.abs()) : '0.00', credit: residual.gte(0) ? toStr(residual) : '0.00' });
    return rows;
  });
  const sensitivity: SensitivityItem[] = [];
  for (const s of subs) {
    if (!s._unm1.isZero()) sensitivity.push({ key: `ic_${s.key}`, title: `رصيد تطالب به ${s.label} من الأم بلا مقابل في دفاتر الأم`, condition: 'إن ثبت أنه رأس مال غير مدفوع أو التزام فعلي على الأم فلا أثر على حقوق المجموعة بعد الاستبعاد (أُخذ في الحسبان)؛ وإن ثبت أنه خطأ قيد لدى التابعة فتُصحح دفاتر التابعة بالمبلغ نفسه دون أثر على المجموعة', amount: toStr(s._unm1), direction: 'either', status: 'unresolved', required_documents: ['قيود اليومية وكشوف البنك للحوالات بين الشركتين', 'مطابقة ثنائية موقعة'] });
    if (!s._ivp.isZero()) sensitivity.push({ key: `inv_${s.key}`, title: `فرق بين استثمار الأم المسجل في ${s.label} ورأس المال المحصّل ضمنيًا لدى التابعة`, condition: 'قد يمثل مصاريف دُفعت نيابةً عن التابعة أو خطأ تسجيل لدى أحد الطرفين؛ أثره على حقوق المجموعة يتراوح بين صفر والمبلغ', amount: toStr(s._ivp.abs()), direction: s._ivp.gt(0) ? 'decrease' : 'increase', status: 'unresolved', required_documents: ['مستندات الحوالات', 'كشف حساب الاستثمار لدى الأم'] });
  }
  for (const a of atCost) { if (!D(a.investment_cost).isZero() || !D(a.receivable_from_company).isZero()) sensitivity.push({ key: `cost_${a.key}`, title: `قابلية استرداد الاستثمار والذمم لدى ${a.label} (بلا قوائم مالية)`, condition: 'الأثر الأقصى = كامل المبلغ إن تعذر الاسترداد؛ لا يُعد خسارة مؤكدة', amount: toStr(D(a.investment_cost).plus(a.receivable_from_company)), direction: 'decrease', status: 'unresolved', required_documents: ['ميزان مراجعة/قوائم الشركة', 'كشوف بنكية', 'عقد التأسيس والسجل التجاري'] }); }
  return {
    basis: 'صافي الأصول الدفترية مع استبعادات التوحيد (IFRS 10 / IAS 27) - لا يشمل قياسًا بالقيمة العادلة',
    currency: input.currency ?? 'SAR',
    parent: { label: input.parent.label, book_equity: toStr(parentEquity), statements: pStat },
    subsidiaries: subs.map(({ _contribution, _nci, _inv, _unm1, _unm2, _ivp, ...rest }) => rest),
    at_cost: atCost,
    group_equity_before_adjustments: toStr(groupEquity),
    nci_total: toStr(subs.reduce((acc, s) => acc.plus(s._nci), ZERO)),
    documented_adjustments: adjustments,
    adjusted_net_assets: toStr(adjustedNav),
    fair_value: { status: 'not_available', reason: 'يتطلب توقعات تشغيلية ومعدل خصم أو مضاعفات سوقية مدعومة بمصادر معلنة؛ غير متاح من البيانات الحالية' },
    eliminations, sensitivity,
    checks: { parent_sfp_balanced: pStat.sfp.balanced, all_subs_balanced: subs.every((s) => s.statements.sfp.balanced), unmatched_intercompany_total: toStr(subs.reduce((acc, s) => acc.plus(s._unm1).plus(s._unm2), ZERO)), investment_vs_paid_capital_total: toStr(subs.reduce((acc, s) => acc.plus(s._ivp.abs()), ZERO)) },
  };
}
