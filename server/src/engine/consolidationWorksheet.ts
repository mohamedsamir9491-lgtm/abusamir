import { D, Decimal, ZERO, sum, net, toStr } from './money.js';
import { FS_LINE_MAP } from './fsLines.js';
import type { StatementPackage } from './statements.js';
import type { TbEntry } from './types.js';

/**
 * ورقة عمل التوحيد (IFRS 10 / IAS 27):
 * - تجمع قوائم المركز المالي لكل شركة بندًا بندًا (أرصدة ما قبل الاستبعاد)،
 * - تُثبت قيود استبعاد متوازنة (مدين = دائن) لكل قيد مع دليله من ميزان كل شركة (رصيد افتتاحي، حركة، رصيد ختامي)،
 * - لا تستخدم حقوق ملكية المجموعة حسابًا موازنًا: كل فرق لا يُثبت مقابله يُرحَّل إلى بند معلق ظاهر (IC_SUSPENSE / ACQ_DIFF)،
 * - حقوق المجموعة = مجموع بنود حقوق الملكية بعد القيود، ويُتحقق أن الأصول = الالتزامات + حقوق الملكية + الحقوق غير المسيطرة وإلا يُرفض الناتج.
 */
export const PENDING_LINES = {
  IC_SUSPENSE: { code: 'IC_SUSPENSE', section: 'pending', label_ar: 'أرصدة بينية بلا مقابل مُثبت (بند معلق)', label_en: 'Intercompany balances without proven counterpart (pending)' },
  ACQ_DIFF: { code: 'ACQ_DIFF', section: 'pending', label_ar: 'فرق تكلفة الاقتناء عن حصة الأم في رأس المال (معلق حتى تحديد صافي الأصول بتاريخ السيطرة)', label_en: 'Acquisition cost vs share of capital (pending)' },
  NET_INCOME: { code: 'NET_INCOME', section: 'equity', label_ar: 'نتيجة الفترة', label_en: 'Result for the period' },
  NCI: { code: 'NCI', section: 'nci', label_ar: 'حقوق غير مسيطرة', label_en: 'Non-controlling interests' },
} as const;
const ASSET_SECTIONS = new Set(['current_assets', 'non_current_assets', 'unclassified', 'pending']);

export interface WsCompany { key: string; label: string; entries: TbEntry[]; statements: StatementPackage }
export interface WsSubsidiary extends WsCompany {
  ownership_pct: string; profit_share_pct?: string | null;
  investment_codes_in_parent: string[]; parent_account_codes_in_sub: string[]; sub_account_codes_in_parent: string[];
  control_since?: string | null;           // تاريخ اكتساب السيطرة (من عقد التأسيس / السجل / عقد الشراء)
  control_basis?: 'incorporation' | 'acquisition' | null; // تأسيس من الأم (لا احتياطيات قبل الاقتناء) أو شراء لاحق
  pre_acquisition_equity?: string | null;  // حقوق ملكية التابعة بتاريخ السيطرة عدا رأس المال (للشراء اللاحق)
}
export interface WsEntryLine { line_code: string; company: string; account: string | null; debit: string; credit: string; note: string }
export interface WsEntry { ref: string; sub: string; description: string; basis: string; evidence: string[]; lines: WsEntryLine[]; total_debit: string; total_credit: string }
interface Mov { opening: Decimal; period_debit: Decimal; period_credit: Decimal; closing: Decimal }

const movOf = (entries: TbEntry[], codes: string[]): Mov => {
  const sel = entries.filter((e) => codes.includes(e.account_code));
  return { opening: sum(sel.map((e) => net(e.opening_debit, e.opening_credit))), period_debit: sum(sel.map((e) => e.period_debit)), period_credit: sum(sel.map((e) => e.period_credit)), closing: sum(sel.map((e) => net(e.closing_debit, e.closing_credit))) };
};
const movStr = (m: Mov) => ({ opening: toStr(m.opening), period_debit: toStr(m.period_debit), period_credit: toStr(m.period_credit), closing: toStr(m.closing) });
const lineOfAccount = (st: StatementPackage, code: string): string | null => st.sfp.lines.find((l) => l.accounts.some((a) => a.code === code))?.code ?? null;
const lineOfAny = (st: StatementPackage, codes: string[], fallback: string) => codes.map((c) => lineOfAccount(st, c)).find((x) => x) ?? fallback;

export function buildConsolidationWorksheet(parent: WsCompany, subs: WsSubsidiary[]) {
  const companies = [parent, ...subs];
  // 1) أرصدة ما قبل الاستبعاد لكل شركة بندًا بندًا (بالإشارة المعروضة)
  const pre = new Map<string, Map<string, Decimal>>();
  const lineMeta = new Map<string, { section: string; label_ar: string; label_en: string; sort: number }>();
  for (const c of companies) {
    const m = new Map<string, Decimal>();
    for (const l of c.statements.sfp.lines) { m.set(l.code, D(l.value)); if (!lineMeta.has(l.code)) lineMeta.set(l.code, { section: l.section, label_ar: l.label_ar, label_en: l.label_en, sort: FS_LINE_MAP[l.code]?.sort_order ?? 500 }); }
    const ni = D(c.statements.sfp.totals.find((t) => t.key === 'net_income_in_equity')?.value ?? 0);
    m.set('NET_INCOME', ni); pre.set(c.key, m);
  }
  lineMeta.set('NET_INCOME', { ...PENDING_LINES.NET_INCOME, sort: 168 });
  lineMeta.set('IC_SUSPENSE', { ...PENDING_LINES.IC_SUSPENSE, sort: 950 });
  lineMeta.set('ACQ_DIFF', { ...PENDING_LINES.ACQ_DIFF, sort: 951 });
  lineMeta.set('NCI', { ...PENDING_LINES.NCI, sort: 180 });

  // 2) قيود الاستبعاد
  const entries: WsEntry[] = []; const subDetails = [];
  const line = (line_code: string, company: string, account: string | null, debit: Decimal, credit: Decimal, note: string): WsEntryLine => ({ line_code, company, account, debit: toStr(debit), credit: toStr(credit), note });
  const push = (e: Omit<WsEntry, 'total_debit' | 'total_credit'>) => {
    const td = sum(e.lines.map((l) => l.debit)); const tc = sum(e.lines.map((l) => l.credit));
    if (!td.minus(tc).abs().lte('0.005')) throw new Error(`قيد التوحيد ${e.ref} غير متوازن: مدين ${toStr(td)} / دائن ${toStr(tc)}`);
    const lines = e.lines.filter((l) => !(D(l.debit).isZero() && D(l.credit).isZero()));
    if (lines.length) entries.push({ ...e, lines, total_debit: toStr(td), total_credit: toStr(tc) });
  };
  let n = 0;
  for (const s of subs) {
    const own = D(s.ownership_pct).div(100);
    const st = s.statements;
    const inv = movOf(parent.entries, s.investment_codes_in_parent);
    const claim = movOf(s.entries, s.parent_account_codes_in_sub);          // مدين = تطالب به التابعة الأم
    const pClaim = movOf(parent.entries, s.sub_account_codes_in_parent);    // مدين = تطالب به الأم التابعة
    const capital = movOf(s.entries, (st.sfp.lines.find((l) => l.code === 'SHARE_CAPITAL')?.accounts ?? []).map((a) => a.code));
    const subCapital = capital.closing.neg();                                // دائن → موجب
    const subEquity = D(st.key_figures.total_equity ?? 0);
    const invLine = lineOfAny(parent.statements, s.investment_codes_in_parent, 'INVESTMENTS');
    const claimLine = lineOfAny(st, s.parent_account_codes_in_sub, 'RELATED_PARTY_DR');
    const pClaimLine = lineOfAny(parent.statements, s.sub_account_codes_in_parent, 'RELATED_PARTY_DR');
    const subClaimOnParent = Decimal.max(claim.closing, ZERO); const subOwesParent = Decimal.max(claim.closing.neg(), ZERO);
    const parentClaimOnSub = Decimal.max(pClaim.closing, ZERO); const parentOwesSub = Decimal.max(pClaim.closing.neg(), ZERO);

    // مطابقة الاستثمار برأس المال: هوية الرصيد الافتتاحي والحركة والرصيد الختامي
    const identityOpening = capital.opening.neg().minus(Decimal.max(claim.opening, ZERO)).minus(inv.opening); // رأس المال − مطالبة التابعة − استثمار الأم (افتتاحي)
    const identityPeriod = inv.period_debit.minus(inv.period_credit).minus(claim.period_credit.minus(claim.period_debit)); // ما دفعته الأم − ما أثبتته التابعة
    const impliedPaid = subCapital.minus(subClaimOnParent);
    const investmentVsImplied = inv.closing.minus(impliedPaid);              // = identityPeriod − identityOpening (عند ثبات رأس المال)

    // E1: استبعاد الاستثمار مقابل حصة الأم في رأس المال؛ ما تطالب به التابعة من الأم بقدر رأس المال غير المسدد يُستبعد باعتباره اكتتابًا غير مسدد
    n += 1;
    const parentShareCapital = subCapital.mul(own);
    const unpaidCapacity = Decimal.max(parentShareCapital.minus(inv.closing), ZERO);
    const claimMatchedToCapital = s.control_basis === 'acquisition' ? ZERO : Decimal.min(subClaimOnParent, unpaidCapacity);
    const preAcq = s.pre_acquisition_equity ? D(s.pre_acquisition_equity).mul(own) : ZERO;
    const e1Debits = parentShareCapital.plus(preAcq); const e1Credits = inv.closing.plus(claimMatchedToCapital);
    const acqDiff = e1Credits.minus(e1Debits); // موجب = تكلفة الاستثمار تزيد على حصة الأم في رأس المال (فرق اقتناء مدين)
    push({ ref: `E${n}`, sub: s.label, description: `استبعاد الاستثمار في ${s.label} مقابل حصة الأم (${s.ownership_pct}%) في رأس مالها بتاريخ اكتساب السيطرة`,
      basis: s.control_basis === 'incorporation' ? 'تأسيس من الأم: لا احتياطيات قبل الاقتناء؛ رصيد "جاري الأم" المدين لدى التابعة بقدر رأس المال غير المسدد يُعامل اكتتابًا غير مسدد' : s.control_basis === 'acquisition' ? 'شراء لاحق: تُستبعد حقوق الملكية بتاريخ السيطرة' : 'تاريخ اكتساب السيطرة غير مُثبت - القيد مشروط',
      evidence: [`استثمار الأم (${s.investment_codes_in_parent.join('،')}): افتتاحي ${toStr(inv.opening)} + حركة ${toStr(inv.period_debit.minus(inv.period_credit))} = ختامي ${toStr(inv.closing)}`, `رأس مال التابعة: ${toStr(subCapital)}`, `مطالبة التابعة على الأم (${s.parent_account_codes_in_sub.join('،')}): افتتاحي ${toStr(claim.opening)} مدين ${toStr(claim.period_debit)} دائن ${toStr(claim.period_credit)} ختامي ${toStr(claim.closing)}`, `هوية الافتتاح: رأس المال − المطالبة − الاستثمار = ${toStr(identityOpening)}`, `هوية الحركة: ما دفعته الأم − ما أثبتته التابعة = ${toStr(identityPeriod)}`],
      lines: [line('SHARE_CAPITAL', s.key, null, parentShareCapital, ZERO, 'حصة الأم في رأس مال التابعة'), ...(preAcq.isZero() ? [] : [line('RETAINED_EARNINGS', s.key, null, preAcq, ZERO, 'احتياطيات ما قبل الاقتناء')]),
        line(invLine, parent.key, s.investment_codes_in_parent.join('،'), ZERO, inv.closing, 'تكلفة الاستثمار لدى الأم'), line(claimLine, s.key, s.parent_account_codes_in_sub.join('،'), ZERO, claimMatchedToCapital, 'اكتتاب غير مسدد بقدر (رأس المال − الاستثمار)'),
        line('ACQ_DIFF', 'group', null, Decimal.max(acqDiff, ZERO), Decimal.max(acqDiff.neg(), ZERO), acqDiff.isZero() ? '' : 'فرق مُعلق: لا يُقفل في حقوق الملكية')] });
    // E2: الأرصدة البينية المتبقية - استبعاد المطابق منها، وترحيل غير المطابق إلى بند معلق
    const remainingSubClaim = subClaimOnParent.minus(claimMatchedToCapital);
    const m1 = Decimal.min(remainingSubClaim, parentOwesSub); const u1 = remainingSubClaim.minus(m1);
    const m2 = Decimal.min(parentClaimOnSub, subOwesParent); const u2 = parentClaimOnSub.minus(m2);
    n += 1;
    push({ ref: `E${n}`, sub: s.label, description: `الأرصدة البينية بين الأم و${s.label}: استبعاد المطابق وترحيل غير المطابق إلى بند معلق`,
      basis: 'كل رصيد بيني يُستبعد فقط بقدر ما يقابله في دفاتر الطرف الآخر؛ الباقي بند معلق لا يُحمَّل على حقوق الملكية',
      evidence: [`مطالبة التابعة المتبقية بعد E${n - 1}: ${toStr(remainingSubClaim)} / التزام الأم المقابل: ${toStr(parentOwesSub)} → مطابق ${toStr(m1)}، غير مطابق ${toStr(u1)}`, `مطالبة الأم على التابعة: ${toStr(parentClaimOnSub)} / التزام التابعة المقابل: ${toStr(subOwesParent)} → مطابق ${toStr(m2)}، غير مطابق ${toStr(u2)}`],
      lines: [line(claimLine, s.key, s.parent_account_codes_in_sub.join('،'), ZERO, remainingSubClaim, 'مطالبة التابعة على الأم'), line('RELATED_PARTY_CR', parent.key, null, m1, ZERO, 'التزام الأم المقابل'), line('IC_SUSPENSE', 'group', null, u1, ZERO, 'بلا مقابل في دفاتر الأم'),
        line(pClaimLine, parent.key, s.sub_account_codes_in_parent.join('،') || null, ZERO, parentClaimOnSub, 'مطالبة الأم على التابعة'), line('RELATED_PARTY_CR', s.key, null, m2, ZERO, 'التزام التابعة المقابل'), line('IC_SUSPENSE', 'group', null, u2, ZERO, 'بلا مقابل في دفاتر التابعة')] });
    // E3: الحقوق غير المسيطرة = حصة الغير في صافي أصول التابعة الخارجية (حقوق الملكية − ما تطالب به الأم + ما تدين به للأم)
    let nci = ZERO;
    if (own.lt(1)) {
      n += 1; const share = D(1).minus(own);
      const eqLines = [...(pre.get(s.key)!.entries())].filter(([code]) => lineMeta.get(code)?.section === 'equity');
      const ls = eqLines.map(([code, v]) => line(code, s.key, null, v.mul(share), ZERO, `حصة الغير ${toStr(share.mul(100))}%`));
      const nciBook = sum(ls.map((l) => l.debit)); const adj = share.mul(subClaimOnParent.minus(subOwesParent));
      nci = nciBook.minus(adj);
      push({ ref: `E${n}`, sub: s.label, description: `الحقوق غير المسيطرة في ${s.label}`, basis: 'IFRS 10: حصة الغير في صافي أصول التابعة بعد استبعاد ما تطالب به الأم (اكتتاب غير مسدد/رصيد بيني) - متسقة مع المعادلة المباشرة', evidence: [`حقوق ملكية التابعة ${toStr(subEquity)} × ${toStr(share.mul(100))}% = ${toStr(nciBook)}؛ ناقص حصة الغير من الرصيد البيني على الأم ${toStr(adj)}`],
        lines: [...ls, line('NCI', 'group', null, ZERO, nciBook, ''), line('NCI', 'group', null, Decimal.max(adj, ZERO), Decimal.max(adj.neg(), ZERO), 'حصة الغير من الرصيد البيني على الأم'), line('IC_SUSPENSE', 'group', null, Decimal.max(adj.neg(), ZERO), Decimal.max(adj, ZERO), 'حصة الغير من الرصيد البيني على الأم')] });
    }
    const postAcqResults = subEquity.minus(subCapital); // بافتراض السيطرة منذ التأسيس؛ وإلا يلزم حقوق الملكية بتاريخ السيطرة
    subDetails.push({ key: s.key, label: s.label, ownership_pct: s.ownership_pct, control_since: s.control_since ?? null, control_basis: s.control_basis ?? null,
      control_status: s.control_since && s.control_basis ? 'documented' : 'pending',
      investment: movStr(inv), sub_claim_on_parent: movStr(claim), parent_claim_on_sub: movStr(pClaim), sub_capital: toStr(subCapital), sub_equity: toStr(subEquity),
      capital_matching: { implied_paid_capital: toStr(impliedPaid), investment_vs_implied_paid_capital: toStr(investmentVsImplied), identity_opening: toStr(identityOpening), identity_period: toStr(identityPeriod), identity_reconciles: investmentVsImplied.minus(identityPeriod.minus(identityOpening)).abs().lte('0.005'), claim_matched_to_unpaid_capital: toStr(claimMatchedToCapital), unmatched_sub_claim: toStr(u1), unmatched_parent_claim: toStr(u2), acquisition_difference: toStr(acqDiff) },
      bridge: {
        description: 'جسر التسوية بين فرق مطابقة الاستثمار برأس المال وبين أثر التابعة على حقوق المجموعة',
        investment_vs_implied_paid_capital: toStr(investmentVsImplied),
        post_acquisition_results: toStr(postAcqResults),
        contribution_if_difference_written_off: toStr(investmentVsImplied.neg().plus(postAcqResults.mul(own))),
        contribution_with_difference_pending: toStr(postAcqResults.mul(own)),
        explanation: `أثر ${s.label} على حقوق المجموعة = نتائجها المتراكمة منذ السيطرة (${toStr(postAcqResults)}) ${investmentVsImplied.isZero() ? '' : `− فرق المطابقة (${toStr(investmentVsImplied)}) إذا عُدّ خسارة؛ أما إذا بقي معلقًا فلا يُخصم`}`,
      }, nci: toStr(nci) });
  }

  // 3) الأرصدة بعد الاستبعاد = المجمع + أثر القيود (أصول: مدين − دائن؛ التزامات/حقوق: دائن − مدين)
  const codes = [...lineMeta.keys()].sort((a, b) => (lineMeta.get(a)!.sort - lineMeta.get(b)!.sort));
  const effect = new Map<string, { dr: Decimal; cr: Decimal }>();
  for (const e of entries) for (const l of e.lines) { const x = effect.get(l.line_code) ?? { dr: ZERO, cr: ZERO }; x.dr = x.dr.plus(l.debit); x.cr = x.cr.plus(l.credit); effect.set(l.line_code, x); }
  const rows = codes.map((code) => {
    const meta = lineMeta.get(code)!; const perCompany = Object.fromEntries(companies.map((c) => [c.key, toStr(pre.get(c.key)!.get(code) ?? ZERO)]));
    const aggregate = sum(companies.map((c) => pre.get(c.key)!.get(code) ?? ZERO)); const ef = effect.get(code) ?? { dr: ZERO, cr: ZERO };
    const consolidated = ASSET_SECTIONS.has(meta.section) ? aggregate.plus(ef.dr).minus(ef.cr) : aggregate.plus(ef.cr).minus(ef.dr);
    return { code, section: meta.section, label_ar: meta.label_ar, label_en: meta.label_en, per_company: perCompany, aggregate: toStr(aggregate), elimination_debit: toStr(ef.dr), elimination_credit: toStr(ef.cr), consolidated: toStr(consolidated), _c: consolidated };
  }).filter((r) => !(D(r.aggregate).isZero() && D(r.elimination_debit).isZero() && D(r.elimination_credit).isZero()));
  const tot = (sec: (s: string) => boolean) => sum(rows.filter((r) => sec(r.section)).map((r) => r._c));
  const assets = tot((s) => s === 'current_assets' || s === 'non_current_assets' || s === 'unclassified');
  const pending = tot((s) => s === 'pending'); const liabilities = tot((s) => s === 'current_liabilities' || s === 'non_current_liabilities');
  const equity = tot((s) => s === 'equity'); const nciTotal = tot((s) => s === 'nci');
  const diff = assets.plus(pending).minus(liabilities).minus(equity).minus(nciTotal);
  if (!diff.abs().lte('0.05')) throw new Error(`ورقة عمل التوحيد غير متوازنة بفرق ${toStr(diff)}؛ لا يُسمح بموازنتها عبر حقوق الملكية`);
  const totalDr = sum(entries.map((e) => e.total_debit)); const totalCr = sum(entries.map((e) => e.total_credit));
  const controlPending = subDetails.filter((s) => s.control_status === 'pending').map((s) => s.label);
  const status: 'pending' | 'supported' = pending.isZero() && controlPending.length === 0 ? 'supported' : 'pending';
  return {
    rows: rows.map(({ _c, ...r }) => r), entries, subsidiaries: subDetails,
    totals: { assets: toStr(assets), pending_items: toStr(pending), liabilities: toStr(liabilities), equity: toStr(equity), nci: toStr(nciTotal), equation_difference: toStr(diff), eliminations_debit: toStr(totalDr), eliminations_credit: toStr(totalCr) },
    group_equity_worksheet: toStr(equity),
    group_equity_if_pending_written_off: toStr(equity.minus(pending)),
    status, pending_reasons: [...(pending.isZero() ? [] : [`بنود معلقة بقيمة ${toStr(pending)} بلا مقابل مُثبت`]), ...controlPending.map((l) => `تاريخ اكتساب السيطرة على ${l} غير مُثبت بمستند`)],
    _equity: equity, _pending: pending, _nci: nciTotal,
  };
}
