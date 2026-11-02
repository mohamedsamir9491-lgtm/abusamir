import { D, Decimal, ZERO, sum, net, toStr } from './money.js';
import { FS_LINE_MAP } from './fsLines.js';
import type { StatementPackage } from './statements.js';
import type { TbEntry } from './types.js';

/**
 * ورقة عمل التوحيد (IFRS 10 / IAS 27):
 * - تجمع قوائم المركز المالي لكل شركة بندًا بندًا (أرصدة ما قبل الاستبعاد) مع مرجع الحسابات المكوِّنة لكل بند،
 * - تُثبت قيود استبعاد متوازنة (مدين = دائن) بقدر ما يقابله دليل في دفاتر الطرفين فقط،
 * - لا تُنشئ أي حساب موازنة (لا حساب معلق ولا حقوق ملكية مجموعة): كل مبلغ لا يُثبت مقابله يبقى في بنده الأصلي
 *   ويُسجَّل في "سجل الفروق غير المحسومة" مع طبيعته المحتملة والجهة المسؤولة والدليل المطلوب،
 * - حقوق المجموعة = مجموع بنود حقوق الملكية بعد القيود؛ ويُتحقق أن الأصول = الالتزامات + حقوق الملكية + الحقوق غير المسيطرة وإلا يُرفض الناتج،
 * - الحالة "مكتملة" فقط عند خلو السجل من فروق مؤثرة واكتمال نطاق التوحيد وتوثيق تاريخ السيطرة.
 */
const ASSET_SECTIONS = new Set(['current_assets', 'non_current_assets', 'unclassified']);
export const NET_INCOME_LINE = { code: 'NET_INCOME', section: 'equity', label_ar: 'نتيجة الفترة', label_en: 'Result for the period' };
export const NCI_LINE = { code: 'NCI', section: 'nci', label_ar: 'حقوق غير مسيطرة', label_en: 'Non-controlling interests' };

export type ClaimNature = 'unpaid_subscription' | 'provisional' | 'other';
export interface WsCompany { key: string; label: string; entries: TbEntry[]; statements: StatementPackage }
export interface WsSubsidiary extends WsCompany {
  ownership_pct: string; profit_share_pct?: string | null;
  investment_codes_in_parent: string[]; parent_account_codes_in_sub: string[]; sub_account_codes_in_parent: string[];
  control_since?: string | null;                                   // تاريخ اكتساب السيطرة (عقد التأسيس / السجل / عقد الشراء)
  control_basis?: 'incorporation' | 'acquisition' | null;          // تأسيس من الأم (لا احتياطيات قبل الاقتناء) أو شراء لاحق
  pre_acquisition_equity?: string | null;                          // حقوق ملكية التابعة بتاريخ السيطرة عدا رأس المال (للشراء اللاحق)
  claim_nature?: ClaimNature | null;                               // طبيعة رصيد "جاري الأم" المدين لدى التابعة: اكتتاب غير مسدد موثق / مؤقت (دلالة رقمية) / أخرى
  other_equity_rights?: string | null;                             // حقوق تعاقدية لغير الأم (شريك بالعمل ونحوه) للإفصاح
}
export interface WsScopeItem { key: string; label: string; control: 'controlled' | 'not_controlled' | 'unknown'; has_data: boolean; investment_cost: string; receivable: string; payable: string; note?: string }
export interface WsEntryLine { line_code: string; company: string; account: string | null; debit: string; credit: string; note: string }
export interface WsEntry { ref: string; sub: string; description: string; basis: string; evidence: string[]; lines: WsEntryLine[]; total_debit: string; total_credit: string; support: 'documented' | 'provisional' }
export interface RegisterItem { ref: string; company: string; line_code: string; amount: string; description: string; nature_hypotheses: string[]; equity_effect: 'none' | 'possible' | 'immaterial'; max_equity_effect: string; responsible: string; required_evidence: string[]; status: 'open' }
interface Mov { opening: Decimal; period_debit: Decimal; period_credit: Decimal; closing: Decimal }

const movOf = (entries: TbEntry[], codes: string[]): Mov => {
  const sel = entries.filter((e) => codes.includes(e.account_code));
  return { opening: sum(sel.map((e) => net(e.opening_debit, e.opening_credit))), period_debit: sum(sel.map((e) => e.period_debit)), period_credit: sum(sel.map((e) => e.period_credit)), closing: sum(sel.map((e) => net(e.closing_debit, e.closing_credit))) };
};
const movStr = (m: Mov) => ({ opening: toStr(m.opening), period_debit: toStr(m.period_debit), period_credit: toStr(m.period_credit), closing: toStr(m.closing) });
const lineOfAccount = (st: StatementPackage, code: string): string | null => st.sfp.lines.find((l) => l.accounts.some((a) => a.code === code))?.code ?? null;
const lineOfAny = (st: StatementPackage, codes: string[], fallback: string) => codes.map((c) => lineOfAccount(st, c)).find((x) => x) ?? fallback;

export function buildConsolidationWorksheet(parent: WsCompany, subs: WsSubsidiary[], scope: WsScopeItem[] = []) {
  const companies = [parent, ...subs];
  for (const c of companies) if (!c.statements.sfp.balanced) throw new Error(`قائمة المركز المالي لـ${c.label} غير متوازنة (${c.statements.sfp.difference})؛ يُرفض التوحيد`);
  // 1) أرصدة ما قبل الاستبعاد لكل شركة بندًا بندًا، مع الحسابات المكوِّنة (مرجع الإثبات)
  const pre = new Map<string, Map<string, Decimal>>();
  const refs = new Map<string, Record<string, string[]>>();
  const lineMeta = new Map<string, { section: string; label_ar: string; label_en: string; sort: number }>();
  for (const c of companies) {
    const m = new Map<string, Decimal>();
    for (const l of c.statements.sfp.lines) {
      m.set(l.code, D(l.value));
      if (!lineMeta.has(l.code)) lineMeta.set(l.code, { section: l.section, label_ar: l.label_ar, label_en: l.label_en, sort: FS_LINE_MAP[l.code]?.sort_order ?? 500 });
      const r = refs.get(l.code) ?? {}; r[c.key] = l.accounts.map((a) => `${a.code} (${toStr(a.net)})`); refs.set(l.code, r);
    }
    m.set('NET_INCOME', D(c.statements.sfp.totals.find((t) => t.key === 'net_income_in_equity')?.value ?? 0)); pre.set(c.key, m);
    const r = refs.get('NET_INCOME') ?? {}; r[c.key] = ['قائمة الربح أو الخسارة']; refs.set('NET_INCOME', r);
  }
  lineMeta.set('NET_INCOME', { ...NET_INCOME_LINE, sort: 168 }); lineMeta.set('NCI', { ...NCI_LINE, sort: 180 });

  // 2) قيود الاستبعاد وسجل الفروق غير المحسومة
  const entries: WsEntry[] = []; const register: RegisterItem[] = []; const subDetails = [];
  const unreconciled = new Map<string, Decimal>(); // المبالغ الباقية في بنودها الأصلية بلا مقابل مُثبت (بند → مبلغ)
  const addUnrec = (code: string, v: Decimal) => unreconciled.set(code, (unreconciled.get(code) ?? ZERO).plus(v));
  const line = (line_code: string, company: string, account: string | null, debit: Decimal, credit: Decimal, note: string): WsEntryLine => ({ line_code, company, account, debit: toStr(debit), credit: toStr(credit), note });
  const push = (e: Omit<WsEntry, 'total_debit' | 'total_credit'>) => {
    const td = sum(e.lines.map((l) => l.debit)); const tc = sum(e.lines.map((l) => l.credit));
    if (!td.minus(tc).abs().lte('0.005')) throw new Error(`قيد التوحيد ${e.ref} غير متوازن: مدين ${toStr(td)} / دائن ${toStr(tc)}`);
    const lines = e.lines.filter((l) => !(D(l.debit).isZero() && D(l.credit).isZero()));
    if (lines.length) entries.push({ ...e, lines, total_debit: toStr(td), total_credit: toStr(tc) });
  };
  let n = 0; let regN = 0; const reg = (item: Omit<RegisterItem, 'ref' | 'status'>) => { regN += 1; register.push({ ref: `R${regN}`, status: 'open', ...item }); };
  const unmatchedWeighted: Decimal[] = []; // لفرضية الشطب: حصة الأم من الفروق غير المحسومة
  for (const s of subs) {
    const own = D(s.ownership_pct).div(100); const st = s.statements; const nature: ClaimNature = s.claim_nature ?? 'provisional';
    const inv = movOf(parent.entries, s.investment_codes_in_parent);
    const claim = movOf(s.entries, s.parent_account_codes_in_sub);          // مدين = تطالب به التابعة الأم
    const pClaim = movOf(parent.entries, s.sub_account_codes_in_parent);    // مدين = تطالب به الأم التابعة
    const capitalCodes = (st.sfp.lines.find((l) => l.code === 'SHARE_CAPITAL')?.accounts ?? []).map((a) => a.code);
    const capital = movOf(s.entries, capitalCodes); const subCapital = capital.closing.neg();
    const subEquity = D(st.key_figures.total_equity ?? 0);
    const invLine = lineOfAny(parent.statements, s.investment_codes_in_parent, 'INVESTMENTS');
    const claimLine = lineOfAny(st, s.parent_account_codes_in_sub, 'RELATED_PARTY_DR');
    const pClaimLine = lineOfAny(parent.statements, s.sub_account_codes_in_parent, 'RELATED_PARTY_DR');
    const subClaimOnParent = Decimal.max(claim.closing, ZERO); const subOwesParent = Decimal.max(claim.closing.neg(), ZERO);
    const parentClaimOnSub = Decimal.max(pClaim.closing, ZERO); const parentOwesSub = Decimal.max(pClaim.closing.neg(), ZERO);
    // مطابقة الاستثمار برأس المال: هوية الرصيد الافتتاحي والحركة والرصيد الختامي
    const identityOpening = capital.opening.neg().minus(Decimal.max(claim.opening, ZERO)).minus(inv.opening);
    const identityPeriod = inv.period_debit.minus(inv.period_credit).minus(claim.period_credit.minus(claim.period_debit));
    const impliedPaid = subCapital.minus(subClaimOnParent);
    const investmentVsImplied = inv.closing.minus(impliedPaid);
    const capitalMoved = !capital.period_debit.minus(capital.period_credit).isZero();
    const identityReconciles = !capitalMoved && investmentVsImplied.minus(identityPeriod.minus(identityOpening)).abs().lte('0.005');

    // E1: استبعاد الاستثمار مقابل حصة الأم في رأس المال، بقدر ما يقابله فقط
    n += 1;
    const capitalShare = subCapital.mul(own);
    let elimInvestment: Decimal, elimClaim: Decimal, elimCapital: Decimal, premium = ZERO, capitalNotCovered = ZERO;
    if (inv.closing.gte(capitalShare)) { elimInvestment = capitalShare; elimClaim = ZERO; elimCapital = capitalShare; premium = inv.closing.minus(capitalShare); }
    else {
      elimInvestment = inv.closing;
      elimClaim = nature === 'other' ? ZERO : Decimal.min(subClaimOnParent, capitalShare.minus(inv.closing));
      elimCapital = elimInvestment.plus(elimClaim); capitalNotCovered = capitalShare.minus(elimCapital);
    }
    const preAcq = s.pre_acquisition_equity ? D(s.pre_acquisition_equity).mul(own) : ZERO;
    const support: WsEntry['support'] = (nature === 'unpaid_subscription' || elimClaim.isZero()) && s.control_since ? 'documented' : 'provisional';
    push({ ref: `E${n}`, sub: s.label, support, description: `استبعاد الاستثمار في ${s.label} مقابل حصة الأم (${s.ownership_pct}%) في رأس مالها`,
      basis: [s.control_basis === 'incorporation' ? 'تأسيس من الأم: لا احتياطيات قبل الاقتناء' : s.control_basis === 'acquisition' ? 'شراء لاحق: تُستبعد حقوق الملكية بتاريخ السيطرة' : 'تاريخ اكتساب السيطرة غير مُثبت - القيد مشروط',
        elimClaim.isZero() ? '' : nature === 'unpaid_subscription' ? 'رصيد "جاري الأم" المدين لدى التابعة اكتتاب غير مسدد موثق' : 'تصنيف مؤقت: رصيد "جاري الأم" المدين لدى التابعة يُعامل اكتتابًا غير مسدد بدلالة هوية الرصيد الافتتاحي (رأس المال − المطالبة = الاستثمار) ويلزم إثباته بالمستندات'].filter(Boolean).join('؛ '),
      evidence: [`استثمار الأم (${s.investment_codes_in_parent.join('،')}): افتتاحي ${toStr(inv.opening)} + حركة ${toStr(inv.period_debit.minus(inv.period_credit))} = ختامي ${toStr(inv.closing)}`, `رأس مال التابعة (${capitalCodes.join('،')}): ${toStr(subCapital)}${capitalMoved ? ' (تحرك خلال الفترة)' : ''}`, `مطالبة التابعة على الأم (${s.parent_account_codes_in_sub.join('،')}): افتتاحي ${toStr(claim.opening)} مدين ${toStr(claim.period_debit)} دائن ${toStr(claim.period_credit)} ختامي ${toStr(claim.closing)}`, `هوية الافتتاح: (رأس المال − المطالبة) − الاستثمار = ${toStr(identityOpening)}`, `هوية الحركة: ما دفعته الأم − ما أثبتته التابعة = ${toStr(identityPeriod)}`],
      lines: [line('SHARE_CAPITAL', s.key, capitalCodes.join('،') || null, elimCapital, ZERO, 'حصة الأم في رأس مال التابعة (المستبعد)'), ...(preAcq.isZero() ? [] : [line('RETAINED_EARNINGS', s.key, null, preAcq, ZERO, 'احتياطيات ما قبل الاقتناء')]),
        line(invLine, parent.key, s.investment_codes_in_parent.join('،'), ZERO, elimInvestment.plus(preAcq), 'تكلفة الاستثمار لدى الأم'), line(claimLine, s.key, s.parent_account_codes_in_sub.join('،'), ZERO, elimClaim, 'اكتتاب غير مسدد بقدر (رأس المال − الاستثمار)')] });
    if (!elimClaim.isZero() && nature !== 'unpaid_subscription') reg({ company: s.label, line_code: claimLine, amount: toStr(elimClaim), description: `تصنيف مؤقت: ${toStr(elimClaim)} من رصيد "جاري الأم" المدين لدى ${s.label} عُومل اكتتابًا غير مسدد واستُبعد مقابل رأس المال`, nature_hypotheses: ['اكتتاب غير مسدد (تؤيده هوية الرصيد الافتتاحي)', 'قرض/تمويل تشغيلي من التابعة للأم لم تسجله الأم (يلزم حينئذ أن يكون رأس المال سُدد من مصدر آخر)'], equity_effect: 'none', max_equity_effect: '0.00', responsible: 'الشركة الأم: إثبات سداد رأس المال؛ التابعة: كشف حساب جاري الأم', required_evidence: ['كشوف البنك لحوالات رأس المال', 'قيود اليومية لحساب جاري الأم لدى التابعة', 'قرار الشركاء/إقرار سداد رأس المال', 'مطابقة ثنائية موقعة'] });
    if (!premium.isZero()) { addUnrec(invLine, premium); unmatchedWeighted.push(premium); reg({ company: parent.label, line_code: invLine, amount: toStr(premium), description: `تكلفة الاستثمار في ${s.label} تزيد على حصة الأم في رأس مالها بمبلغ ${toStr(premium)}؛ بقي في بند الاستثمارات بلا استبعاد`, nature_hypotheses: ['علاوة اقتناء/شهرة تتطلب قياس صافي الأصول بتاريخ السيطرة (IFRS 3)', 'مصاريف دُفعت نيابة عن التابعة سُجلت استثمارًا', 'خطأ تسجيل'], equity_effect: 'possible', max_equity_effect: toStr(premium), responsible: 'الشركة الأم', required_evidence: ['عقد الاستحواذ/التأسيس', 'كشف حساب الاستثمار', 'الحوالات'] }); }
    if (!capitalNotCovered.isZero()) { addUnrec('SHARE_CAPITAL', capitalNotCovered); reg({ company: s.label, line_code: 'SHARE_CAPITAL', amount: toStr(capitalNotCovered), description: `${toStr(capitalNotCovered)} من رأس مال ${s.label} لا يقابله استثمار لدى الأم ولا مطالبة مصنفة اكتتابًا؛ بقي ضمن حقوق الملكية الموحدة بلا استبعاد`, nature_hypotheses: ['رأس مال سُدد من طرف آخر غير الأم', 'استثمار لم تسجله الأم', 'رصيد جاري الأم لدى التابعة هو الاكتتاب غير المسدد (إن ثبت يُستبعدان معًا)'], equity_effect: 'possible', max_equity_effect: toStr(capitalNotCovered), responsible: 'الشركة الأم والتابعة', required_evidence: ['كشوف البنك', 'سجل المساهمين/الشركاء', 'قيود رأس المال'] }); }

    // E2: الأرصدة البينية المتبقية - يُستبعد المطابق فقط؛ غير المطابق يبقى في بنده الأصلي ويُسجَّل في السجل
    const remainingSubClaim = subClaimOnParent.minus(elimClaim);
    const m1 = Decimal.min(remainingSubClaim, parentOwesSub); const u1 = remainingSubClaim.minus(m1);
    const m2 = Decimal.min(parentClaimOnSub, subOwesParent); const u2 = parentClaimOnSub.minus(m2);
    n += 1;
    push({ ref: `E${n}`, sub: s.label, support: 'documented', description: `الأرصدة البينية بين الأم و${s.label}: استبعاد ما يقابله رصيد في دفاتر الطرف الآخر`,
      basis: 'كل رصيد بيني يُستبعد بقدر ما يقابله في دفاتر الطرف الآخر فقط؛ الباقي يبقى في بنده الأصلي ويُدرج في سجل الفروق غير المحسومة',
      evidence: [`مطالبة التابعة المتبقية بعد E${n - 1}: ${toStr(remainingSubClaim)} / التزام الأم المقابل: ${toStr(parentOwesSub)} → مطابق ${toStr(m1)}، غير مطابق ${toStr(u1)}`, `مطالبة الأم على التابعة: ${toStr(parentClaimOnSub)} / التزام التابعة المقابل: ${toStr(subOwesParent)} → مطابق ${toStr(m2)}، غير مطابق ${toStr(u2)}`],
      lines: [line(claimLine, s.key, s.parent_account_codes_in_sub.join('،'), ZERO, m1, 'مطالبة التابعة على الأم'), line('RELATED_PARTY_CR', parent.key, null, m1, ZERO, 'التزام الأم المقابل'),
        line(pClaimLine, parent.key, s.sub_account_codes_in_parent.join('،') || null, ZERO, m2, 'مطالبة الأم على التابعة'), line('RELATED_PARTY_CR', s.key, null, m2, ZERO, 'التزام التابعة المقابل')] });
    if (!u1.isZero()) { addUnrec(claimLine, u1); unmatchedWeighted.push(u1.mul(own)); reg({ company: s.label, line_code: claimLine, amount: toStr(u1), description: `${toStr(u1)} تطالب به ${s.label} الأم ولا يقابله التزام في دفاتر الأم ولا يفسره رأس المال؛ بقي ضمن أصول ${s.label} في القوائم الموحدة`, nature_hypotheses: [`دفعات من الأم لم تثبتها التابعة (هوية الحركة ${toStr(identityPeriod)})`, 'مصاريف/رسوم بنكية سُجلت استثمارًا لدى الأم', 'فرق توقيت حوالة', 'مبالغ دفعتها التابعة للأم أو عنها ولم تسجلها الأم'], equity_effect: 'possible', max_equity_effect: toStr(u1), responsible: 'الطرفان: مطابقة حركة بحركة', required_evidence: ['دفتر أستاذ حساب جاري الأم لدى التابعة (كل حركة: التاريخ، المبلغ، المستفيد، مرجع الحوالة)', 'دفتر أستاذ حساب الاستثمار لدى الأم', 'كشوف البنك للطرفين'] }); }
    if (!u2.isZero()) { addUnrec(pClaimLine, u2); unmatchedWeighted.push(u2); reg({ company: parent.label, line_code: pClaimLine, amount: toStr(u2), description: `${toStr(u2)} تطالب به الأم ${s.label} ولا يقابله التزام في دفاتر التابعة؛ بقي ضمن أصول الأم`, nature_hypotheses: ['دفعات عن التابعة لم تسجلها', 'فرق توقيت', 'خطأ تسجيل'], equity_effect: 'possible', max_equity_effect: toStr(u2), responsible: 'الطرفان', required_evidence: ['دفتر الأستاذ للطرفين', 'كشوف البنك'] }); }

    // E3: الحقوق غير المسيطرة = حصة الغير في حقوق ملكية التابعة الدفترية
    let nci = ZERO;
    if (own.lt(1)) {
      n += 1; const share = D(1).minus(own);
      const eqLines = [...(pre.get(s.key)!.entries())].filter(([code]) => lineMeta.get(code)?.section === 'equity');
      const ls = eqLines.map(([code, v]) => line(code, s.key, null, v.mul(share), ZERO, `حصة الغير ${toStr(share.mul(100))}%`));
      nci = sum(ls.map((l) => l.debit));
      push({ ref: `E${n}`, sub: s.label, support: 'documented', description: `الحقوق غير المسيطرة في ${s.label}`, basis: 'IFRS 10: حصة الغير في حقوق ملكية التابعة الدفترية', evidence: [`حقوق ملكية التابعة ${toStr(subEquity)} × ${toStr(share.mul(100))}%`], lines: [...ls, line('NCI', 'group', null, ZERO, nci, '')] });
      if (!u1.isZero()) reg({ company: s.label, line_code: 'NCI', amount: toStr(u1.mul(share)), description: `حصة الغير (${toStr(share.mul(100))}%) من الرصيد البيني غير المطابق؛ تتغير الحقوق غير المسيطرة بهذا القدر إن ثبت أنه ليس أصلًا`, nature_hypotheses: ['تابع للفرق R السابق'], equity_effect: 'possible', max_equity_effect: toStr(u1.mul(share)), responsible: 'تابع', required_evidence: ['تابع'] });
    }
    if (s.other_equity_rights) reg({ company: s.label, line_code: 'NCI', amount: '0.00', description: `حقوق تعاقدية لغير الأم: ${s.other_equity_rights}`, nature_hypotheses: ['حق في الأرباح دون حصة في رأس المال أو الخسائر: لا يمثل حصة في صافي الأصول؛ يُثبت التزامًا عند تحقق ربح قابل للتوزيع'], equity_effect: 'immaterial', max_equity_effect: '0.00', responsible: 'الإفصاح', required_evidence: ['عقد التأسيس المعتمد'] });
    const postAcqResults = subEquity.minus(subCapital);
    subDetails.push({ key: s.key, label: s.label, ownership_pct: s.ownership_pct, control_since: s.control_since ?? null, control_basis: s.control_basis ?? null, claim_nature: nature,
      control_status: s.control_since && s.control_basis ? 'documented' : 'pending',
      investment: movStr(inv), sub_claim_on_parent: movStr(claim), parent_claim_on_sub: movStr(pClaim), sub_capital: toStr(subCapital), sub_equity: toStr(subEquity),
      capital_matching: { implied_paid_capital: toStr(impliedPaid), investment_vs_implied_paid_capital: toStr(investmentVsImplied), identity_opening: toStr(identityOpening), identity_period: toStr(identityPeriod), identity_reconciles: identityReconciles, claim_matched_to_unpaid_capital: toStr(elimClaim), claim_classification: nature === 'unpaid_subscription' ? 'موثق' : nature === 'other' ? 'غير مطبق' : 'مؤقت - يلزم إثباته', unmatched_sub_claim: toStr(u1), unmatched_parent_claim: toStr(u2), investment_premium_not_eliminated: toStr(premium), capital_not_covered: toStr(capitalNotCovered) },
      bridge: { description: 'جسر التسوية بين فرق مطابقة الاستثمار برأس المال وبين أثر التابعة على حقوق المجموعة', investment_vs_implied_paid_capital: toStr(investmentVsImplied), post_acquisition_results: toStr(postAcqResults),
        contribution_with_difference_pending: toStr(postAcqResults.mul(own)), contribution_if_difference_written_off: toStr(investmentVsImplied.neg().plus(postAcqResults.mul(own))),
        explanation: `أثر ${s.label} على حقوق المجموعة = نتائجها المتراكمة منذ السيطرة (${toStr(postAcqResults)})${investmentVsImplied.isZero() ? '' : ` − فرق المطابقة (${toStr(investmentVsImplied)}) إن ثبت أنه ليس أصلًا؛ وما دام غير محسوم يبقى في بنده الأصلي`}` },
      nci: toStr(nci) });
  }

  // 3) الأرصدة بعد الاستبعاد = المجمع + أثر القيود (أصول: مدين − دائن؛ التزامات/حقوق: دائن − مدين)
  const codes = [...lineMeta.keys()].sort((a, b) => (lineMeta.get(a)!.sort - lineMeta.get(b)!.sort));
  const effect = new Map<string, { dr: Decimal; cr: Decimal }>();
  for (const e of entries) for (const l of e.lines) { const x = effect.get(l.line_code) ?? { dr: ZERO, cr: ZERO }; x.dr = x.dr.plus(l.debit); x.cr = x.cr.plus(l.credit); effect.set(l.line_code, x); }
  const rows = codes.map((code) => {
    const meta = lineMeta.get(code)!; const perCompany = Object.fromEntries(companies.map((c) => [c.key, toStr(pre.get(c.key)!.get(code) ?? ZERO)]));
    const aggregate = sum(companies.map((c) => pre.get(c.key)!.get(code) ?? ZERO)); const ef = effect.get(code) ?? { dr: ZERO, cr: ZERO };
    const consolidated = ASSET_SECTIONS.has(meta.section) ? aggregate.plus(ef.dr).minus(ef.cr) : aggregate.plus(ef.cr).minus(ef.dr);
    return { code, section: meta.section, label_ar: meta.label_ar, label_en: meta.label_en, per_company: perCompany, aggregate: toStr(aggregate), elimination_debit: toStr(ef.dr), elimination_credit: toStr(ef.cr), consolidated: toStr(consolidated), unreconciled: toStr(unreconciled.get(code) ?? ZERO), evidence: refs.get(code) ?? {}, _c: consolidated };
  }).filter((r) => !(D(r.aggregate).isZero() && D(r.elimination_debit).isZero() && D(r.elimination_credit).isZero()));
  const tot = (sec: (s: string) => boolean) => sum(rows.filter((r) => sec(r.section)).map((r) => r._c));
  const assets = tot((s) => ASSET_SECTIONS.has(s)); const liabilities = tot((s) => s === 'current_liabilities' || s === 'non_current_liabilities');
  const equity = tot((s) => s === 'equity'); const nciTotal = tot((s) => s === 'nci');
  const diff = assets.minus(liabilities).minus(equity).minus(nciTotal);
  if (!diff.abs().lte('0.05')) throw new Error(`ورقة عمل التوحيد غير متوازنة بفرق ${toStr(diff)}؛ لا يُسمح بموازنتها عبر حقوق الملكية أو حساب معلق`);
  const unrecTotal = sum([...unreconciled.values()]); const unrecWeighted = sum(unmatchedWeighted);
  const registerEffect = sum(register.filter((r) => r.equity_effect === 'possible').map((r) => r.max_equity_effect));
  // 4) نطاق التوحيد والحالة
  const scopeIncomplete = scope.filter((x) => x.control !== 'not_controlled' && !x.has_data);
  const controlPending = subDetails.filter((s) => s.control_status === 'pending').map((s) => s.label);
  const provisional = entries.filter((e) => e.support === 'provisional').map((e) => e.ref);
  const reasons = [
    ...(unrecTotal.isZero() ? [] : [`فروق بينية بلا مقابل مُثبت ${toStr(unrecTotal)} بقيت في بنودها الأصلية (سجل الفروق)`]),
    ...(provisional.length ? [`قيود مشروطة بتصنيف مؤقت لم يُثبت بعد: ${provisional.join('، ')}`] : []),
    ...controlPending.map((l) => `تاريخ اكتساب السيطرة على ${l} غير مُثبت بمستند`),
    ...scopeIncomplete.map((x) => `${x.label}: ${x.control === 'controlled' ? 'خاضعة للسيطرة' : 'نطاق السيطرة غير محدد'} ولا توجد قوائم/ميزان - نطاق التوحيد غير مكتمل`),
  ];
  const status: 'supported' | 'incomplete' = reasons.length ? 'incomplete' : 'supported';
  return {
    rows: rows.map(({ _c, ...r }) => r), entries, register, subsidiaries: subDetails, scope,
    totals: { assets: toStr(assets), liabilities: toStr(liabilities), equity: toStr(equity), nci: toStr(nciTotal), equation_difference: toStr(diff), eliminations_debit: toStr(sum(entries.map((e) => e.total_debit))), eliminations_credit: toStr(sum(entries.map((e) => e.total_credit))), unreconciled_total: toStr(unrecTotal), register_max_equity_effect: toStr(registerEffect) },
    group_equity_worksheet: toStr(equity),                                     // مجموع بنود حقوق الملكية بعد القيود المؤيدة؛ الفروق غير المحسومة باقية في بنودها
    hypothesis_unreconciled_not_assets: toStr(equity.minus(unrecWeighted)),    // فرضية حسابية فقط: لو ثبت أن الفروق غير المحسومة ليست أصولًا (ليست حدًا أدنى للقيمة)
    status, pending_reasons: reasons, _equity: equity, _unrecWeighted: unrecWeighted, _nci: nciTotal,
  };
}
