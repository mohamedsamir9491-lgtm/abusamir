/** صافي الأصول المعدّل: حسابات خالصة بلا قاعدة بيانات (قابلة للاختبار)
 * الأساس: حقوق الملكية الدفترية ± تعديلات التقييم (استهلاك غير مسجل بنسب معتمدة، تقييم المالك، عقد الإيجار، تعديلات أخرى) */
import type { Acc } from '../ai/local.js';

export interface AssetCategory { code: string; label: string; rate: number; re: RegExp; tax_rate: number | null; tax_note: string }
/** نسب نظام ضريبة الدخل (المادة 17/ب) للمقارنة فقط: تُطبق ضريبيًا بالقسط المتناقص على باقي قيمة كل مجموعة، ولا تحل محل تقدير العمر الإنتاجي محاسبيًا (IAS 16) */
export const TAX_DEP_NOTE = 'النسب الضريبية من نظام ضريبة الدخل (المادة 17/ب) للمقارنة فقط: تُطبق ضريبيًا بطريقة القسط المتناقص على باقي قيمة كل مجموعة من الأصول، ولا تحل محل تقدير العمر الإنتاجي للأغراض المحاسبية (IAS 16).';
/** نسب استهلاك سنوية شائعة مقترحة (قسط ثابت) - قابلة للتعديل ويعتمدها المحاسب؛ ليست نسبًا نظامية ملزمة */
export const ASSET_CATEGORIES: AssetCategory[] = [
  { code: 'land', label: 'أراضٍ (لا تُستهلك)', rate: 0, re: /(^|\s)(ارض|اراضي|الارض|الاراضي)(\s|$)/, tax_rate: null, tax_note: 'الأرض لا تُستهلك (المادة 17/أ)' },
  { code: 'buildings', label: 'مبانٍ وإنشاءات', rate: 4, re: /مبان|مبني|انشاءات|عقارات/, tax_rate: 5, tax_note: 'المباني الثابتة — المادة 17/ب/1 (المباني الصناعية والزراعية المتنقلة 10%)' },
  { code: 'leasehold', label: 'تحسينات وديكورات على مبانٍ مستأجرة', rate: 20, re: /ديكور|تحسينات|تشطيبات/, tax_rate: null, tax_note: 'لا نسبة صريحة لها في النظام' },
  { code: 'computers', label: 'حاسبات وأجهزة إلكترونية', rate: 25, re: /حاسب|كمبيوتر|لابتوب|حواسيب|الكترون|طابعات|سيرفر/, tax_rate: 25, tax_note: 'الأجهزة والبرمجيات — المادة 17/ب/3' },
  { code: 'vehicles', label: 'سيارات ووسائل نقل', rate: 25, re: /سيار|مركبات|وسائل نقل|شاحن/, tax_rate: 25, tax_note: 'سيارات الركوب والشحن — المادة 17/ب/3' },
  { code: 'machinery', label: 'آلات ومعدات تشغيل', rate: 10, re: /الات|ماكين|مكائن|معدات تشغيل|معدات ثقيله|خطوط انتاج/, tax_rate: 25, tax_note: 'المصانع والآلات والمكائن — المادة 17/ب/3' },
  { code: 'furniture', label: 'أثاث ومفروشات', rate: 10, re: /اثاث|مفروشات|موبيليا/, tax_rate: 10, tax_note: 'الأثاث — المادة 17/ب/5' },
  { code: 'office_equipment', label: 'أجهزة ومعدات مكتبية', rate: 15, re: /اجهز|معدات|مكتبي|تكييف|مكيفات/, tax_rate: 25, tax_note: 'الأجهزة والمعدات — المادة 17/ب/3' },
  { code: 'tools', label: 'عدد وأدوات', rate: 20, re: /عدد وادوات|ادوات/, tax_rate: null, tax_note: 'حسب طبيعة الأداة: معدات 25% (17/ب/3) أو أصول أخرى 10% (17/ب/5)' },
  { code: 'software', label: 'برامج وأصول غير ملموسة', rate: 20, re: /برامج|برنامج|غير ملموس|علامه|تراخيص|رخص|موقع الكتروني|تطبيق/, tax_rate: 25, tax_note: 'البرمجيات 25% (17/ب/3)؛ وغير الملموسة الأخرى كالشهرة 10% (17/ب/5)' },
  { code: 'other', label: 'أصول أخرى', rate: 10, re: /.^/, tax_rate: 10, tax_note: 'الأصول الأخرى — المادة 17/ب/5' },
];
export const CATEGORY_BY_CODE = Object.fromEntries(ASSET_CATEGORIES.map((c) => [c.code, c]));

const N = (s: string) => s.replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const STOP = new Set(['مجمع', 'مخصص', 'اهلاك', 'اهتلاك', 'استهلاك', 'اطفاء', 'من', 'في', 'على', 'شركه', 'جاري', 'شريك', 'مساهم', 'حساب', 'بن', 'ابن', 'بنت', 'عبد']);
export const toks = (s: string) => N(s).split(/[\s\-_/()،,.]+/).map((w) => w.replace(/^و(?=...)/, '').replace(/^ال(?=..)/, '')).filter((w) => w.length >= 2 && !STOP.has(w));
const overlap = (a: string[], b: string[]) => a.filter((x) => b.includes(x)).length;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function suggestCategory(name: string, kind: 'ppe' | 'intangible'): string {
  if (kind === 'intangible') return 'software';
  const n = N(name);
  return ASSET_CATEGORIES.find((c) => c.code !== 'other' && c.code !== 'software' && c.re.test(n))?.code ?? 'other';
}

export interface AssetInput { category?: string; rate?: number; method?: 'rate' | 'owner' | 'none'; owner_value?: number | null; owner_ref?: string | null; note?: string | null }
export interface LeaseInput { term_months?: number | null; start_date?: string | null; discount_rate?: number | null; note?: string | null }
export interface OtherInput { id: string; title: string; amount: number; note?: string | null }
export interface NavInputs { assets?: Record<string, AssetInput>; lease?: LeaseInput; others?: OtherInput[] }
export interface PeriodInfo { start: string; end: string; days: number }

export interface AssetRow { code: string; name: string; kind: 'ppe' | 'intangible'; category: string; category_label: string; suggested_rate: number; tax_rate: number | null; tax_note: string; rate: number; method: 'rate' | 'owner' | 'none'
  cost_open: number; cost_close: number; additions: number; accum_codes: string[]; accum_close: number; booked_period: number; nbv: number
  expected: number; additional: number; owner_value: number | null; owner_ref: string | null; adjustment: number; adjusted_nbv: number; note: string | null; basis: string }
export interface LeaseCalc { rou_codes: string[]; rou_cost: number; rou_accum: number; liability: number; finance_cost_booked: number; term_months: number | null; start_date: string | null; discount_rate: number | null
  elapsed_days: number; dep_expected_cum: number; dep_additional: number; interest_estimate: number; interest_additional: number; adjustment: number; status: 'computed' | 'needs_input' | 'none'; note: string | null }
export interface CompanyNav { book_equity: number; total_assets: number; assets: AssetRow[]; unpaired_accum: { code: string; name: string; closing: number }[]; lease: LeaseCalc | null; others: OtherInput[]
  adjustments: { depreciation: number; owner_revaluation: number; lease: number; others: number; total: number }; adjusted_nav: number; warnings: string[] }

const isAccumName = (n: string) => /مجمع|اهلاك|اهتلاك|استهلاك|اطفاء/.test(N(n));
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

export function computeCompanyNav(accounts: Acc[], kf: Record<string, number>, inputs: NavInputs, period: PeriodInfo): CompanyNav {
  const f = period.days / 365; const warnings: string[] = [];
  const accum = accounts.filter((a) => a.fs === 'ACC_DEP' || (['PPE', 'INTANGIBLES', 'ROU_ASSETS'].includes(a.fs) && a.closing < 0 && isAccumName(a.name)));
  const rouAccum = accum.filter((a) => a.fs === 'ROU_ASSETS' || /استخدام/.test(N(a.name)));
  const costs = accounts.filter((a) => ['PPE', 'INTANGIBLES'].includes(a.fs) && !accum.includes(a) && (a.closing !== 0 || a.opening !== 0));
  // ربط كل مجمع بحساب التكلفة الأقرب اسمًا (من النوع نفسه)
  const pair = new Map<string, Acc[]>(); const unpaired: Acc[] = [];
  for (const m of accum.filter((x) => !rouAccum.includes(x))) {
    const wantIntangible = /اطفاء/.test(N(m.name)) || m.fs === 'INTANGIBLES';
    const pool = costs.filter((c) => (c.fs === 'INTANGIBLES') === wantIntangible);
    const scored = pool.map((c) => ({ c, s: overlap(toks(m.name), toks(c.name)) })).sort((x, y) => y.s - x.s);
    const best = scored[0] && scored[0].s > 0 ? scored[0].c : pool.length === 1 ? pool[0] : null;
    if (best) pair.set(best.code, [...(pair.get(best.code) ?? []), m]); else unpaired.push(m);
  }
  if (unpaired.length) warnings.push(`حسابات مجمع استهلاك لم تُربط بأصل (${unpaired.map((u) => u.name).join('، ')}): حدّد الأصل المقابل أو راجع التصنيف`);
  const assets: AssetRow[] = costs.map((c) => {
    const kind: 'ppe' | 'intangible' = c.fs === 'INTANGIBLES' ? 'intangible' : 'ppe';
    const inp = inputs.assets?.[c.code] ?? {};
    const category = inp.category && CATEGORY_BY_CODE[inp.category] ? inp.category : suggestCategory(c.name, kind);
    const cat = CATEGORY_BY_CODE[category]!; const rate = inp.rate ?? cat.rate;
    const method: AssetRow['method'] = inp.method ?? (category === 'land' ? 'none' : 'rate');
    const ms = pair.get(c.code) ?? [];
    const accumClose = -ms.reduce((t, m) => t + m.closing, 0); // موجب
    const booked = ms.reduce((t, m) => t + (m.credit - m.debit), 0);
    const costOpen = Math.max(0, c.opening); const costClose = c.closing; const additions = Math.max(0, costClose - costOpen);
    const nbv = costClose - accumClose;
    const expected = r2((costOpen * rate / 100) * f + (additions * rate / 100) * f / 2);
    const additional = method === 'rate' ? r2(Math.min(Math.max(0, expected - booked), Math.max(0, nbv))) : 0;
    const ov = method === 'owner' && inp.owner_value != null ? Number(inp.owner_value) : null;
    const adjustment = method === 'owner' ? (ov == null ? 0 : r2(ov - nbv)) : -additional;
    if (method === 'owner' && ov == null) warnings.push(`«${c.name}»: اخترت تقييم المالك دون إدخال القيمة`);
    const basis = method === 'owner' ? `تقييم المالك${inp.owner_ref ? ` (${inp.owner_ref})` : ''}` : method === 'none' ? 'بلا تعديل' : `قسط ثابت ${rate}% سنويًا على التكلفة × ${period.days}/365${additions > 0 ? '، والإضافات بنصف المدة' : ''}${booked > 0 ? `، مطروحًا منه المسجل ${r2(booked)}` : ''}`;
    return { code: c.code, name: c.name, kind, category, category_label: cat.label, suggested_rate: cat.rate, tax_rate: cat.tax_rate, tax_note: cat.tax_note, rate, method, cost_open: r2(costOpen), cost_close: r2(costClose), additions: r2(additions), accum_codes: ms.map((m) => m.code), accum_close: r2(accumClose), booked_period: r2(booked), nbv: r2(nbv), expected, additional, owner_value: ov, owner_ref: inp.owner_ref ?? null, adjustment, adjusted_nbv: r2(nbv + adjustment), note: inp.note ?? null, basis };
  });
  // عقد الإيجار (IFRS 16)
  const rou = accounts.filter((a) => a.fs === 'ROU_ASSETS' && !rouAccum.includes(a) && a.closing > 0);
  let lease: LeaseCalc | null = null;
  if (rou.length) {
    const L = inputs.lease ?? {}; const cost = rou.reduce((t, a) => t + a.closing, 0); const acc = -rouAccum.reduce((t, a) => t + a.closing, 0);
    const liab = -accounts.filter((a) => ['LEASE_LIAB_CURRENT', 'LEASE_LIAB_NON_CURRENT'].includes(a.fs)).reduce((t, a) => t + a.closing, 0);
    const fcBooked = accounts.filter((a) => a.fs === 'FINANCE_COST').reduce((t, a) => t + a.closing, 0);
    const base = { rou_codes: rou.map((a) => a.code), rou_cost: r2(cost), rou_accum: r2(acc), liability: r2(liab), finance_cost_booked: r2(fcBooked), term_months: L.term_months ?? null, start_date: L.start_date ?? null, discount_rate: L.discount_rate ?? null, note: L.note ?? null };
    if (!L.term_months || !L.start_date) lease = { ...base, elapsed_days: 0, dep_expected_cum: 0, dep_additional: 0, interest_estimate: 0, interest_additional: 0, adjustment: 0, status: 'needs_input' };
    else {
      const termDays = L.term_months * 365 / 12; const elapsed = Math.max(0, Math.min(days(L.start_date, period.end), termDays));
      const depCum = r2(cost * elapsed / termDays); const depAdd = r2(Math.min(Math.max(0, depCum - acc), Math.max(0, cost - acc)));
      const inPeriod = Math.max(0, days(L.start_date > period.start ? L.start_date : period.start, period.end));
      const interest = L.discount_rate ? r2(liab * (L.discount_rate / 100) * inPeriod / 365) : 0; const intAdd = r2(Math.max(0, interest - fcBooked));
      lease = { ...base, elapsed_days: Math.round(elapsed), dep_expected_cum: depCum, dep_additional: depAdd, interest_estimate: interest, interest_additional: intAdd, adjustment: -r2(depAdd + intAdd), status: 'computed' };
      if (!L.discount_rate) warnings.push('عقد الإيجار: لم يُدخل معدل الخصم، فلم تُقدَّر فائدة الالتزام');
    }
  }
  const others = (inputs.others ?? []).filter((o) => o.title && Number.isFinite(Number(o.amount))).map((o) => ({ ...o, amount: r2(Number(o.amount)) }));
  const dep = r2(assets.filter((a) => a.method === 'rate').reduce((t, a) => t + a.adjustment, 0));
  const reval = r2(assets.filter((a) => a.method === 'owner').reduce((t, a) => t + a.adjustment, 0));
  const lz = lease?.adjustment ?? 0; const oth = r2(others.reduce((t, o) => t + o.amount, 0));
  const total = r2(dep + reval + lz + oth); const eq = kf.total_equity ?? 0;
  return { book_equity: r2(eq), total_assets: r2(kf.total_assets ?? 0), assets, unpaired_accum: unpaired.map((u) => ({ code: u.code, name: u.name, closing: u.closing })), lease, others, adjustments: { depreciation: dep, owner_revaluation: reval, lease: lz, others: oth, total }, adjusted_nav: r2(eq + total), warnings };
}

// ---------------- المساهمون والقيمة الموحدة ----------------
export interface Holder { name: string; pct: number; paid?: number | null; account_code?: string | null }
export interface Register { basis: 'assumed_equal' | 'register'; contributions_basis: 'books' | 'official'; holders: Holder[]; note?: string | null; saved: boolean }

const isPartnerAccount = (a: Acc) => ['OWNER_CURRENT', 'DUE_FROM_SHAREHOLDERS', 'DUE_TO_SHAREHOLDERS'].includes(a.fs) || /جاري (ال)?(شريك|مساهم)|حساب (ال)?(شريك|مساهم)/.test(N(a.name));
export const partnerAccounts = (accounts: Acc[]) => accounts.filter((a) => isPartnerAccount(a) && (a.closing !== 0 || a.opening !== 0));
/** مطابقة حساب جاري بمساهم: اسمان على الأقل مشتركان (الاسم الأول واسم العائلة) */
export function matchHolderAccount(holder: string, accounts: Acc[]): Acc | null {
  const t = toks(holder); let best: Acc | null = null; let bs = 0;
  for (const a of partnerAccounts(accounts)) { const s = overlap(t, toks(a.name)); if (s > bs) { bs = s; best = a; } }
  return bs >= 2 ? best : null;
}
export function equalHolders(names: string[], accounts: Acc[]): Holder[] {
  const n = names.length; if (!n) return [];
  const base = Math.floor((100 / n) * 10000) / 10000;
  return names.map((name, i) => ({ name, pct: i === n - 1 ? Math.round((100 - base * (n - 1)) * 10000) / 10000 : base, paid: null, account_code: matchHolderAccount(name, accounts)?.code ?? null }));
}

export interface GroupCompanyNav { engagement_id: string; name: string; role: 'parent' | 'subsidiary' | 'at_cost'; ownership: number; nav: CompanyNav | null; investment_cost: number | null; receivable_from: number | null; status: string }
export interface GroupNavInput {
  companies: GroupCompanyNav[];
  consolidation: { equity: number; nci: number; hypothesis: number | null; unreconciled: number; status: string } | null;
  parent: { accounts: Acc[]; capital: number; apic: number; official_capital: number | null; official_paid: number | null };
  register: Register;
}
export function computeGroupNav(g: GroupNavInput) {
  const warnings: string[] = []; const parent = g.companies.find((c) => c.role === 'parent')!;
  const subs = g.companies.filter((c) => c.role === 'subsidiary');
  let base: number; let basis: 'consolidation' | 'sum_of_parts';
  if (g.consolidation) { base = r2(g.consolidation.equity - g.consolidation.nci); basis = 'consolidation'; }
  else {
    basis = 'sum_of_parts'; base = parent.nav?.book_equity ?? 0;
    for (const s of subs) if (s.nav) base += (s.ownership / 100) * s.nav.book_equity - (s.investment_cost ?? 0);
    base = r2(base); if (subs.length) warnings.push('لم يُشغَّل التوحيد الدفتري لهذه الفترة؛ القيمة الموحدة تقريبية (حقوق الأم − تكلفة الاستثمار + الحصة في حقوق التابعة) ولا تستبعد الأرصدة البينية');
  }
  const adjRows = g.companies.filter((c) => c.nav && c.role !== 'at_cost').map((c) => ({ name: c.name, role: c.role, ownership: c.role === 'parent' ? 100 : c.ownership, total: c.nav!.adjustments.total, attributable: r2(c.nav!.adjustments.total * (c.role === 'parent' ? 1 : c.ownership / 100)) }));
  const adj = r2(adjRows.reduce((t, r) => t + r.attributable, 0));
  const nav = r2(base + adj);
  const navLow = g.consolidation?.hypothesis != null && g.consolidation.unreconciled ? r2(g.consolidation.hypothesis - g.consolidation.nci + adj) : null;
  const atCost = g.companies.filter((c) => c.role === 'at_cost');
  if (atCost.length) warnings.push(`شركات بلا قوائم تبقى بالتكلفة ضمن القيمة: ${atCost.map((c) => `${c.name} (${(c.investment_cost ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })})`).join('، ')}`);
  if (g.consolidation && g.consolidation.status !== 'supported') warnings.push('التوحيد الدفتري غير نهائي (بنود غير محسومة)؛ القيمة الموحدة مبدئية');
  // ما دخل به المساهمون
  const P = g.parent; const booksContrib = r2(P.capital + P.apic);
  const officialContrib = P.official_paid != null ? r2(P.official_paid + P.apic) : null;
  const useOfficial = g.register.contributions_basis === 'official' && officialContrib != null;
  const contributions = useOfficial ? officialContrib! : booksContrib;
  const gain = r2(nav - contributions); const gainPct = contributions ? r2((gain / contributions) * 100) : null;
  if (officialContrib != null && Math.abs(officialContrib - booksContrib) >= 0.01) warnings.push(`المساهمات حسب الدفاتر ${booksContrib.toLocaleString('en-US', { minimumFractionDigits: 2 })} وحسب المستندات النظامية ${officialContrib.toLocaleString('en-US', { minimumFractionDigits: 2 })}؛ المعتمد في الاحتساب: ${useOfficial ? 'المستندات النظامية' : 'الدفاتر'} إلى حين تأكيد العميل`);
  const H = g.register.holders; const sumPct = r2(H.reduce((t, h) => t + Number(h.pct || 0), 0));
  if (H.length && Math.abs(sumPct - 100) > 0.01) warnings.push(`مجموع نسب المساهمين ${sumPct}% وليس 100%`);
  if (g.register.basis === 'assumed_equal' && H.length) warnings.push(`نسب المساهمين افتراضية (بالتساوي بين ${H.length}) إلى حين ورود سجل المساهمين`);
  const pa = partnerAccounts(P.accounts);
  // آخر مساهم يمتص فرق التقريب ليتطابق المجموع مع القيمة الإجمالية عندما تكتمل النسب 100%
  const full = H.length > 0 && Math.abs(sumPct - 100) <= 0.01; let sumShare = 0; let sumContrib = 0;
  const holders = H.map((h, i) => {
    const last = full && i === H.length - 1;
    const acc = h.account_code ? P.accounts.find((a) => a.code === h.account_code) ?? null : null; const share = last ? r2(nav - sumShare) : r2(nav * h.pct / 100);
    const contributed = h.paid != null ? r2(Number(h.paid)) : last && H.every((x) => x.paid == null) ? r2(contributions - sumContrib) : r2(contributions * h.pct / 100); const current = acc ? r2(acc.closing) : 0;
    sumShare = r2(sumShare + share); sumContrib = r2(sumContrib + contributed);
    return { name: h.name, pct: h.pct, share, contributed, gain: r2(share - contributed), account: acc ? `${acc.code} ${acc.name}` : null, current, net: r2(share - current) };
  });
  const matched = new Set(H.map((h) => h.account_code).filter(Boolean));
  const unmatched = pa.filter((a) => !matched.has(a.code)).map((a) => ({ code: a.code, name: a.name, closing: r2(a.closing) }));
  if (unmatched.length) warnings.push(`حسابات جارية للشركاء لم تُربط بمساهم: ${unmatched.map((u) => `${u.name} (${u.closing.toLocaleString('en-US', { minimumFractionDigits: 2 })})`).join('، ')}`);
  return { basis, base, consolidation: g.consolidation, adjustments: adjRows, adjustments_total: adj, nav, nav_low: navLow, contributions: { books: booksContrib, official: officialContrib, used: useOfficial ? 'official' : 'books', amount: contributions, capital: P.capital, apic: P.apic, official_capital: P.official_capital, official_paid: P.official_paid }, gain, gain_pct: gainPct, holders, unmatched_accounts: unmatched, register: g.register, warnings, at_cost: atCost.map((c) => ({ name: c.name, investment_cost: c.investment_cost, receivable_from: c.receivable_from })) };
}
export type GroupNav = ReturnType<typeof computeGroupNav>;
