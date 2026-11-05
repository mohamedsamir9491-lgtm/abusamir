/** محادثة المحاسب الذكي (محلية): فهم السؤال بالقواعد → إجابة من بيانات البرنامج مع المصدر والاحتساب، أو من قاعدة المعرفة المحاسبية */
import { buildLocalContext, localAnalysis, money, type LocalContext, type Acc } from './local.js';
import { findTopics } from './knowledge.js';

export interface ChatAnswer { intent: string; company: string; period: string; text: string[]; table?: { columns: string[]; rows: (string | number)[][] }; sources: string[]; suggestions: string[]; links?: { label: string; href: string }[] }
const N = (s: string) => s.toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[؟?!.,،:؛]/g, ' ').replace(/\s+/g, ' ').trim();
const toks = (s: string) => N(s).split(' ').map((t) => t.replace(/^(وال|بال|فال|كال|لل|ال|و)(?=\S{3,})/, '')).filter((t) => t.length >= 2);
const INPUT_AR: Record<string, string> = { current_assets: 'الأصول المتداولة', current_liabilities: 'الالتزامات المتداولة', cash: 'النقد', inventory: 'المخزون', total_assets: 'إجمالي الأصول', total_liabilities: 'إجمالي الالتزامات', total_equity: 'حقوق الملكية', equity: 'حقوق الملكية', revenue: 'الإيرادات', net_profit: 'صافي الربح', gross_profit: 'مجمل الربح', cogs: 'تكلفة الإيرادات', receivables: 'الذمم المدينة', payables: 'الذمم الدائنة', operating_cash_flow: 'التدفق التشغيلي', finance_costs: 'تكاليف التمويل', operating_profit: 'الربح التشغيلي', days: 'أيام الفترة', debt: 'القروض', average_equity: 'متوسط حقوق الملكية', average_assets: 'متوسط الأصول', avg_equity: 'متوسط حقوق الملكية', avg_inventory: 'متوسط المخزون', avg_payables: 'متوسط الذمم الدائنة', avg_receivables: 'متوسط الذمم المدينة', avg_total_assets: 'متوسط إجمالي الأصول', finance_cost: 'تكاليف التمويل', loans: 'القروض', net_income: 'صافي الربح' };
const has = (q: string, ...words: string[]) => words.some((w) => q.includes(N(w)));
const SUGGEST = ['كم إجمالي الأصول؟', 'ما رصيد حساب البنك؟', 'أكبر 5 مصروفات', 'لماذا الخسارة؟', 'ما الملاحظات الحرجة؟', 'كم نسبة التداول؟', 'ما المستندات المطلوبة؟', 'ما حقوق الملكية الموحدة للمجموعة؟', 'اشرح معالجة عقود الإيجار IFRS 16'];
const FIG: { key: string; label: string; words: string[] }[] = [
  { key: 'total_assets', label: 'إجمالي الأصول', words: ['اجمالي الاصول', 'مجموع الاصول', 'الاصول كلها', 'كم الاصول', 'قيمه الاصول'] },
  { key: 'current_assets', label: 'الأصول المتداولة', words: ['الاصول المتداوله'] }, { key: 'non_current_assets', label: 'الأصول غير المتداولة', words: ['الاصول غير المتداوله', 'الاصول الثابته'] },
  { key: 'total_liabilities', label: 'إجمالي الالتزامات', words: ['الالتزامات', 'المطلوبات', 'الخصوم', 'الديون'] }, { key: 'current_liabilities', label: 'الالتزامات المتداولة', words: ['الالتزامات المتداوله', 'الخصوم المتداوله'] },
  { key: 'total_equity', label: 'حقوق الملكية', words: ['حقوق الملكيه', 'حقوق المساهمين', 'حقوق الشركاء', 'صافي الاصول', 'القيمه الدفتريه'] },
  { key: 'revenue', label: 'الإيرادات', words: ['الايرادات', 'الايراد', 'المبيعات', 'الدخل'] }, { key: 'gross_profit', label: 'مجمل الربح', words: ['مجمل الربح'] },
  { key: 'operating_profit', label: 'الربح التشغيلي', words: ['الربح التشغيلي', 'الخساره التشغيليه'] }, { key: 'net_income', label: 'صافي الربح / (الخسارة)', words: ['صافي الربح', 'صافي الخساره', 'النتيجه', 'الربح', 'الخساره', 'الارباح'] },
  { key: 'cash', label: 'النقد وما في حكمه', words: ['النقد', 'النقديه', 'الكاش', 'السيوله النقديه', 'رصيد البنوك'] }, { key: 'receivables', label: 'الذمم المدينة (صافي)', words: ['الذمم المدينه', 'العملاء', 'المدينين', 'المدينون'] },
  { key: 'inventory', label: 'المخزون', words: ['المخزون', 'البضاعه'] }, { key: 'finance_cost', label: 'تكاليف التمويل', words: ['تكاليف التمويل', 'الفوائد', 'مصاريف بنكيه'] }, { key: 'depreciation', label: 'الاستهلاك والإطفاء', words: ['الاستهلاك', 'الاهلاك', 'الاطفاء'] },
];

function findAccounts(c: LocalContext, q: string): Acc[] {
  const codes: string[] = q.match(/\d{4,}/g) ?? []; if (codes.length) { const a = c.accounts.filter((x) => codes.includes(x.code)); if (a.length) return a; }
  const qt = toks(q).filter((t) => !['رصيد', 'حساب', 'كم', 'ما', 'هو', 'هي', 'في', 'من', 'على', 'عن', 'قيمه', 'ماهو', 'الحساب', 'اعطني', 'عطني', 'ابغى', 'عايز', 'اريد'].includes(t));
  if (!qt.length) return [];
  const scored = c.accounts.map((a) => { const at = toks(a.name + ' ' + a.label); const s = qt.reduce((x, t) => x + (at.some((y) => y === t || (t.length >= 3 && (y.startsWith(t) || t.startsWith(y)))) ? 1 : 0), 0); return { a, s }; }).filter((x) => x.s > 0);
  const best = Math.max(0, ...scored.map((x) => x.s)); return scored.filter((x) => x.s === best && best >= Math.min(2, qt.length)).map((x) => x.a).slice(0, 8);
}
const accLine = (a: Acc) => [a.code, a.name, a.label, money(a.opening), money(a.debit), money(a.credit), money(a.closing)];
const ACC_COLS = ['الرمز', 'الحساب', 'بند القوائم', 'افتتاحي (صافي)', 'مدين الفترة', 'دائن الفترة', 'ختامي (صافي)'];

type Loader = (engagementId: string, periodId: string) => Promise<LocalContext>;
export async function answerQuestion(engagementId: string, periodId: string, question: string, load: Loader = buildLocalContext): Promise<ChatAnswer> {
  let c = await load(engagementId, periodId);
  const q = N(question);
  // سؤال عن شركة أخرى في المجموعة: نجيب من بياناتها
  if (c.group) { const hit = c.group.companies.find((co) => co.engagementId !== engagementId && co.periodId && toks(co.name).filter((t) => !['شركه'].includes(t) && t.length >= 3).some((t) => q.includes(t))); const two = c.group.companies.filter((co) => toks(co.name).filter((t) => t !== 'شركه' && t.length >= 3).some((t) => q.includes(t)));
    if (two.length >= 2 && has(q, 'قارن', 'مقارنه', 'الفرق بين')) return compareCompanies(c, two, load);
    if (hit && hit.role !== 'at_cost') c = await load(hit.engagementId, hit.periodId!); }
  const base = { company: c.company, period: c.period.label, suggestions: [] as string[] };
  const ans = (intent: string, text: string[], extra: Partial<ChatAnswer> = {}): ChatAnswer => ({ intent, ...base, text, sources: [], ...extra });
  const src = `ميزان مراجعة ${c.company} - ${c.period.label}`;
  const conceptual = /(ما هو|ماهو|ما هي|ماهي|ما معني|اشرح|عرف|كيف يعالج|كيف تعالج|معالجه|ما المقصود|متي|هل يجب)/.test(q) || /\b(ifrs|ias)\s?\d+/.test(q);
  if (!q || has(q, 'مساعده', 'ماذا تستطيع', 'تقدر تعمل', 'امثله', 'وش تقدر', 'ايش تقدر') || /^(مرحبا|السلام عليكم|اهلا|هلا)/.test(q))
    return ans('help', [`أجيب عن بيانات ${c.company} (${c.period.label}) من الميزان والقوائم والملاحظات في البرنامج، وعن المفاهيم والمعايير المحاسبية. كل إجابة رقمية معها مصدرها وطريقة احتسابها، ولا أقدّم أرقامًا غير موجودة في البيانات.`], { suggestions: SUGGEST });
  // البيانات النظامية
  if (has(q, 'السجل التجاري', 'الشركاء', 'الملاك', 'المساهمين', 'المؤسسين', 'مجلس الاداره', 'المدير', 'انتهاء السجل', 'حسب العقد', 'عقد التاسيس', 'النظام الاساس', 'الرقم الموحد', 'حسب السجل', 'حسب النظام', 'حسب الوثائق', 'البيانات النظاميه', 'المدفوع', 'غير المدفوع', 'المكتتب') && !conceptual) {
    if (!c.official.length) return ans('official', [`لا توجد بيانات نظامية معتمدة لـ${c.company}. ارفع عقد التأسيس/النظام الأساس والسجل التجاري واعتمد بياناتهما من شاشة «البيانات النظامية».`]);
    const v = (k: string) => { for (const r of c.official) { const x = r.fields[k]?.value; if (x != null && x !== '' && !(Array.isArray(x) && !x.length)) return x; } return null; };
    const lines = [`البيانات النظامية المعتمدة لـ${c.company}:`];
    if (v('unified_no') || v('cr_no')) lines.push(`السجل: ${v('cr_no') ?? '—'} | الرقم الموحد: ${v('unified_no') ?? '—'}${v('cr_expiry_hijri') ? ` | ينتهي ${v('cr_expiry_hijri')} هـ` : ''}`);
    if (v('capital') != null) lines.push(`رأس المال: ${money(Number(v('capital')))}${v('paid_capital') != null ? ` | المدفوع: ${money(Number(v('paid_capital')))}` : ''}${v('shares_count') ? ` | ${Number(v('shares_count')).toLocaleString('en-US')} حصة/سهم × ${money(Number(v('share_value') ?? 0))}` : ''}`);
    if (v('capital') != null) { const books = c.accounts.filter((a) => a.fs === 'SHARE_CAPITAL').reduce((t, a) => t - a.closing, 0); const cap = Number(v('capital')); const paid = v('paid_capital') != null ? Number(v('paid_capital')) : cap;
      lines.push(`رصيد رأس المال في الميزان: ${money(books)}${Math.abs(books - cap) < 0.01 ? (paid < cap ? ` = رأس المال المكتتب؛ الجزء غير المدفوع ${money(cap - paid)} يلزم عرضه مستحقًا على الشركاء أو طرحه من حقوق الملكية (IAS 1 / IAS 32).` : ' مطابق للمستند.') : Math.abs(books - paid) < 0.01 ? ' = المدفوع حسب المستند.' : `؛ يختلف عن المستند بـ ${money(books - cap)}.`}`); }
    const partners = (v('partners') ?? []) as { name: string; nature: string; pct: number | null }[]; const board = (v('board') ?? []) as { name: string; position: string }[];
    return ans('official', lines, { table: partners.length ? { columns: ['الشريك/المؤسس', 'الصفة', 'النسبة'], rows: partners.map((p) => [p.name, ({ capital: 'شريك بالمال', work: 'شريك بالعمل', founder: 'مؤسس', owner: 'مالك' } as Record<string, string>)[p.nature] ?? p.nature, p.pct != null ? `${p.pct}%` : '—']) } : board.length ? { columns: ['الاسم', 'المنصب'], rows: board.map((b) => [b.name, b.position]) } : undefined, sources: c.official.map((r) => r.title) });
  }
  // المجموعة والتوحيد
  if (c.group && has(q, 'المجموعه', 'الموحد', 'الموحده', 'التوحيد', 'الشركات التابعه', 'كل الشركات', 'الشركات') && !conceptual) {
    const cons = c.group.consolidation; const rows: (string | number)[][] = [];
    for (const co of c.group.companies) { if (!co.periodId || co.role === 'at_cost') { rows.push([co.name, co.role === 'parent' ? 'الأم' : co.role === 'at_cost' ? 'بالتكلفة' : 'تابعة', co.ownership ? `${Number(co.ownership)}%` : '—', '—', '—', '—']); continue; }
      try { const x = await load(co.engagementId, co.periodId); rows.push([co.name, co.role === 'parent' ? 'الأم' : 'تابعة', co.ownership ? `${Number(co.ownership)}%` : '—', money(x.kf.total_assets ?? 0), money(x.kf.total_equity ?? 0), money(x.kf.net_income ?? 0)]); } catch { rows.push([co.name, co.role, '—', 'لا ميزان', '—', '—']); } }
    const text = [`شركات مجموعة ${c.group.companies[0]!.name} (${c.period.label}):`];
    if (cons) text.push(`حقوق الملكية الموحدة بعد الاستبعادات: ${money(Number(cons.group_equity_worksheet))}${Number(cons.worksheet?.totals?.unreconciled_total ?? 0) ? `، منها فروق بينية غير محسومة ${money(Number(cons.worksheet.totals.unreconciled_total))}` : ''}؛ حقوق ملكية الأم المنفصلة ${money(Number(cons.parent?.book_equity ?? 0))}. الحالة: ${cons.status === 'supported' ? 'مدعومة' : 'غير نهائية'}.`, 'لا تُجمع حقوق الشركات المنفصلة لأن استثمار الأم في التابعات جزء من حقوقها (ازدواج)؛ القيمة الموحدة من ورقة التوحيد.');
    else text.push('لم يُشغَّل التوحيد لهذه الفترة بعد؛ شغّله من شاشة «التوحيد الدفتري».');
    return ans('group', text, { table: { columns: ['الشركة', 'العلاقة', 'الملكية', 'إجمالي الأصول', 'حقوق الملكية', 'صافي الربح/(الخسارة)'], rows }, sources: ['موازين الشركات المعتمدة', ...(cons ? ['آخر تشغيل للتوحيد الدفتري'] : [])] });
  }
  // معرفة محاسبية (سؤال نظري أو ذكر معيار)
  const topics = findTopics(question);
  if (conceptual && topics.length) { const t = topics[0]!; const text = [`${t.title} (${t.ref}):`, t.body];
    if (t.id === 'ifrs16') { const rou = c.accounts.filter((a) => a.fs === 'ROU_ASSETS'); if (rou.length) text.push(`في بيانات ${c.company}: أصل حق استخدام ${money(rou.reduce((s, a) => s + a.closing, 0))}، ومصروف الاستهلاك المسجل ${money(c.kf.depreciation ?? 0)}، وتكاليف التمويل ${money(c.kf.finance_cost ?? 0)}.`); }
    if (t.id === 'losses' || t.id === 'capital') { const sc = c.st.sfp.lines.find((l) => l.code === 'SHARE_CAPITAL'); if (sc) text.push(`في بيانات ${c.company}: رأس المال في الدفاتر ${money(Number(sc.value))}.`); }
    return ans('knowledge', text, { sources: [t.ref], suggestions: topics.slice(1, 4).map((x) => `اشرح ${x.title}`) }); }
  // أكبر N
  const topM = q.match(/(اكبر|اعلى|اهم)\s*(\d+)?/);
  if (topM) { const k = Number(topM[2] ?? 5); let list: Acc[] = []; let what = '';
    if (has(q, 'مصروف', 'مصاريف', 'تكالي')) { list = c.accounts.filter((a) => a.statement === 'pl' && a.closing > 0 && !['REVENUE', 'OTHER_INCOME'].includes(a.fs)); what = 'المصروفات'; }
    else if (has(q, 'ايراد', 'مبيعات')) { list = c.accounts.filter((a) => a.statement === 'pl' && a.closing < 0).map((a) => ({ ...a, closing: -a.closing })); what = 'الإيرادات'; }
    else if (has(q, 'التزام', 'مطلوب', 'دائن', 'خصوم')) { list = c.accounts.filter((a) => a.statement === 'sfp' && a.closing < 0 && !['SHARE_CAPITAL', 'ADDITIONAL_CAPITAL', 'RETAINED_EARNINGS', 'STATUTORY_RESERVE', 'OTHER_RESERVES'].includes(a.fs)).map((a) => ({ ...a, closing: -a.closing })); what = 'الالتزامات'; }
    else { list = c.accounts.filter((a) => a.statement === 'sfp' && a.closing > 0); what = 'الأصول'; }
    const tot = list.reduce((s, a) => s + a.closing, 0); const top = [...list].sort((a, b) => b.closing - a.closing).slice(0, k);
    return ans('top', [`أكبر ${top.length} حسابات في ${what} (${c.period.label}) من إجمالي ${money(tot)}:`], { table: { columns: ['الرمز', 'الحساب', 'المبلغ', 'النسبة'], rows: top.map((a) => [a.code, a.name, money(a.closing), tot ? `${((a.closing / tot) * 100).toFixed(1)}%` : '—']) }, sources: [src] }); }
  // لماذا الخسارة/الربح
  if (has(q, 'لماذا', 'ليه', 'ليش', 'سبب', 'اسباب', 'تفسير', 'وش سبب') && has(q, 'خساره', 'ربح', 'عجز', 'انخفاض', 'ارتفاع', 'النتيجه')) {
    const rev = c.kf.revenue ?? 0, ni = c.kf.net_income ?? 0; const exps = c.accounts.filter((a) => a.statement === 'pl' && a.closing > 0 && !['REVENUE', 'OTHER_INCOME'].includes(a.fs)).sort((a, b) => b.closing - a.closing);
    const totE = exps.reduce((s, a) => s + a.closing, 0);
    const text = [`${ni < 0 ? 'صافي الخسارة' : 'صافي الربح'} ${money(Math.abs(ni))} ${c.period.phrase} = الإيرادات ${money(rev)} − المصروفات ${money(totE)}${Math.abs(rev - totE - ni) > 0.5 ? ' ± بنود أخرى' : ''}.`];
    if (rev === 0) text.push('لا توجد إيرادات مسجلة في الفترة، فالنتيجة تساوي المصروفات تقريبًا.');
    text.push(`أكبر المصروفات: ${exps.slice(0, 3).map((a) => `${a.name} ${money(a.closing)} (${totE ? ((a.closing / totE) * 100).toFixed(0) : 0}%)`).join('، ')}.`);
    const v = c.variance.filter((x) => x.material && !x.key.startsWith('total:')).slice(0, 3); if (v.length && c.prior) text.push(`أبرز التغيرات مقابل ${c.prior.label}: ${v.map((x) => `${x.label_ar} ${Number(x.change) >= 0 ? '+' : ''}${money(Number(x.change))}`).join('، ')}.`);
    return ans('why', text, { sources: [`قائمة الربح أو الخسارة - ${c.period.label}`], suggestions: ['أكبر 5 مصروفات', 'ما الملاحظات الحرجة؟'] }); }
  // التدفقات النقدية
  if (has(q, 'تدفق', 'التدفقات', 'النقد من التشغيل', 'cash flow')) { const cf = c.st.cf; if (cf.status !== 'ok') return ans('cf', [cf.note ?? 'بيانات غير كافية لقائمة التدفقات النقدية.']); const t = (k: string) => Number(cf.totals.find((x) => x.key === k)?.value ?? 0);
    return ans('cf', [`التدفقات النقدية ${c.period.phrase} (الطريقة غير المباشرة):`], { table: { columns: ['البند', 'المبلغ'], rows: [['صافي النقد من الأنشطة التشغيلية', money(t('operating'))], ['صافي النقد من الأنشطة الاستثمارية', money(t('investing'))], ['صافي النقد من الأنشطة التمويلية', money(t('financing'))], ['صافي التغير في النقد', money(t('net_change'))], ['النقد أول الفترة', money(t('cash_opening'))], ['النقد آخر الفترة (حسب الميزان)', money(t('cash_closing_tb'))]] }, sources: [`قائمة التدفقات النقدية - ${c.period.label}`] }); }
  // النسب المالية
  const ratio = c.ratios.find((r) => { const rl = toks(r.label_ar).filter((t) => t.length >= 3 && !['نسبه', 'معدل'].includes(t)); return rl.length && rl.every((t) => q.includes(t)); });
  if (ratio || has(q, 'نسبه التداول', 'السيوله السريعه', 'المديونيه', 'العائد علي', 'هامش', 'دوران', 'فتره التحصيل')) { const r = ratio ?? c.ratios.find((x) => has(q, ...toks(x.label_ar).filter((t) => t.length >= 4)));
    if (r) return ans('ratio', [`${r.label_ar}: ${r.value == null ? 'غير قابلة للاحتساب' : `${r.value}${r.unit === 'pct' ? '%' : r.unit === 'days' ? ' يومًا' : ['times', 'ratio', 'x'].includes(r.unit) ? ' مرة' : ''}`}${r.status === 'not_meaningful' ? ' (غير ذات معنى)' : ''}.`, `المعادلة: ${r.formula_ar}.`, `المدخلات: ${Object.entries(r.inputs).map(([k, v]) => `${INPUT_AR[k] ?? k} ${v == null ? '—' : money(Number(v))}`).join('، ')}.`, ...(r.interpretation_ar ? [r.interpretation_ar] : []), ...(r.note ? [r.note] : []), ...(!c.period.full && ['pct', 'times'].includes(r.unit) ? [`الفترة جزئية (${c.period.days} يومًا) وغير محوّلة لأساس سنوي.`] : [])], { sources: [`النسب المالية - ${c.period.label}`] }); }
  // رصيد حساب
  if (has(q, 'رصيد', 'حساب') || /\d{5,}/.test(q)) { const found = findAccounts(c, question);
    if (found.length) return ans('account', [found.length === 1 ? `رصيد ${found[0]!.code} ${found[0]!.name} في نهاية الفترة ${money(found[0]!.closing)} (${found[0]!.closing >= 0 ? 'مدين' : 'دائن'}).` : `وجدت ${found.length} حسابات مطابقة:`], { table: { columns: ACC_COLS, rows: found.map(accLine) }, sources: [src] }); }
  // أرقام رئيسية
  const fig = FIG.filter((f) => f.words.some((w) => q.includes(N(w)))).sort((a, b) => Math.max(...b.words.filter((w) => q.includes(N(w))).map((w) => w.length)) - Math.max(...a.words.filter((w) => q.includes(N(w))).map((w) => w.length)))[0];
  if (fig && !has(q, 'ملاحظ', 'مستند')) { const v = c.kf[fig.key] ?? 0; const lines = c.st.sfp.lines.concat(c.st.pl.lines);
    const detail = fig.key === 'cash' ? c.accounts.filter((a) => a.fs === 'CASH') : fig.key === 'receivables' ? c.accounts.filter((a) => ['AR', 'AR_ALLOWANCE'].includes(a.fs)) : [];
    const text = [`${fig.label} ${c.period.phrase}: ${money(v)}.`];
    if (fig.key === 'net_income' && (c.kf.revenue ?? 0) > 0) text.push(`هامش صافي الربح ${(((c.kf.net_income ?? 0) / (c.kf.revenue ?? 1)) * 100).toFixed(1)}%.`);
    if (fig.key === 'total_equity') { const eqL = c.st.sfp.lines.filter((l) => l.section === 'equity'); text.push(`مكوناتها: ${eqL.map((l) => `${l.label_ar} ${money(Number(l.value))}`).join('، ')}، ونتيجة الفترة ${money(c.kf.net_income ?? 0)}.`); }
    void lines;
    return ans('figure', text, { table: detail.length ? { columns: ACC_COLS, rows: detail.map(accLine) } : undefined, sources: [`القوائم المالية المشتقة من ${src}`] }); }
  if (has(q, 'راس المال العامل')) { const wc = (c.kf.current_assets ?? 0) - (c.kf.current_liabilities ?? 0); return ans('figure', [`رأس المال العامل = الأصول المتداولة ${money(c.kf.current_assets ?? 0)} − الالتزامات المتداولة ${money(c.kf.current_liabilities ?? 0)} = ${money(wc)}.`], { sources: [src] }); }
  // الملاحظات
  if (has(q, 'ملاحظ', 'مشاكل', 'اخطاء', 'تنبيهات', 'حرج', 'مرتفع', 'مفتوح')) { let fs = c.findings; if (has(q, 'حرج', 'مرتفع', 'خطير', 'مهم', 'جوهري')) fs = fs.filter((f) => ['critical', 'high'].includes(f.severity));
    const SEV: Record<string, string> = { critical: 'حرج', high: 'مرتفع', medium: 'متوسط', low: 'منخفض', info: 'للعلم' };
    return ans('findings', [fs.length ? `${fs.length} ملاحظة مفتوحة${has(q, 'حرج', 'مرتفع') ? ' بالخطورة المطلوبة' : ''} (${c.period.label}):` : 'لا توجد ملاحظات مفتوحة بهذه الخطورة.'], { table: fs.length ? { columns: ['المرجع', 'الخطورة', 'الملاحظة', 'المبلغ'], rows: fs.slice(0, 15).map((f) => [f.ref, SEV[f.severity] ?? f.severity, f.title, f.amount ? money(Number(f.amount)) : '—']) } : undefined, sources: ['شاشة الملاحظات والتسويات'] }); }
  // المقارنة
  if (has(q, 'قارن', 'مقارنه', 'تغير', 'الفتره السابقه', 'السنه الماضيه', 'تطور')) { if (!c.prior || !c.variance.length) return ans('variance', ['لا تتوفر فترة مقارنة بميزان معتمد لهذه الشركة.']);
    const rows = c.variance.filter((v) => !v.key.startsWith('total:')).sort((a, b) => Math.abs(Number(b.change)) - Math.abs(Number(a.change))).slice(0, 10);
    return ans('variance', [`أكبر التغيرات مقابل ${c.prior.label}:`], { table: { columns: ['البند', 'الحالية', 'السابقة', 'التغير', '%'], rows: rows.map((v) => [v.label_ar, money(Number(v.current)), money(Number(v.comparative)), money(Number(v.change)), v.change_pct ?? '—']) }, sources: ['مقارنة الفترات'] }); }
  // المستندات المطلوبة
  if (has(q, 'مستند', 'ناقص', 'مطلوب', 'اطلب من العميل', 'نطلب')) { const a = localAnalysis(c); return ans('documents', ['المستندات المطلوبة حسب التحليل والملاحظات:'], { table: { columns: ['المستند'], rows: a.documents_needed.map((d) => [d]) }, sources: ['التحليل المحلي والملاحظات'] }); }
  // الملخص والتقييم العام
  if (has(q, 'ملخص', 'لخص', 'وضع الشركه', 'تقييم عام', 'استمراري', 'مخاطر', 'رايك')) { const a = localAnalysis(c); const L: Record<string, string> = { low: 'منخفض', medium: 'متوسط', high: 'مرتفع', unknown: 'غير محدد' };
    return ans('summary', [a.executive_summary_ar], { table: { columns: ['المجال', 'مستوى المخاطر', 'السبب'], rows: [['السيولة', L[a.risk_assessment.liquidity.level]!, a.risk_assessment.liquidity.rationale], ['الربحية', L[a.risk_assessment.profitability.level]!, a.risk_assessment.profitability.rationale], ['المديونية', L[a.risk_assessment.leverage.level]!, a.risk_assessment.leverage.rationale], ['رأس المال العامل', L[a.risk_assessment.working_capital.level]!, a.risk_assessment.working_capital.rationale]] }, sources: ['التحليل المحلي'] }); }
  if (has(q, 'قيمه الشركه', 'كم تساوي', 'التقييم', 'تقييم الشركه')) { const eq = c.kf.total_equity ?? 0; return ans('valuation', [`القيمة الدفترية لحقوق ملكية ${c.company} ${c.period.phrase}: ${money(eq)}.`, ...(c.group?.consolidation ? [`القيمة الدفترية الموحدة للمجموعة: ${money(Number(c.group.consolidation.group_equity_worksheet))}.`] : []), 'القيمة الدفترية نقطة بداية وليست قيمة سوقية؛ القيمة العادلة تتطلب منهج السوق أو الدخل أو صافي الأصول المعدلة (IFRS 13 ومعايير التقييم الدولية)، ولأغراض نظامية يلزم مقيم معتمد.'], { sources: [src] }); }
  if (topics.length) { const t = topics[0]!; return ans('knowledge', [`${t.title} (${t.ref}):`, t.body], { sources: [t.ref] }); }
  return ans('unknown', ['لم أتمكن من فهم السؤال بدقة ضمن ما أستطيع الإجابة عنه من البيانات أو المفاهيم المحاسبية. جرّب صياغة أقرب لأحد الأمثلة، أو اذكر اسم الحساب/البند/المعيار.'], { suggestions: SUGGEST });
}

async function compareCompanies(c: LocalContext, cos: { name: string; engagementId: string; periodId: string | null; role: string }[], load: Loader): Promise<ChatAnswer> {
  const ctxs: LocalContext[] = []; for (const co of cos) if (co.periodId && co.role !== 'at_cost') { try { ctxs.push(await load(co.engagementId, co.periodId)); } catch { /* بلا ميزان */ } }
  const keys: [string, string][] = [['total_assets', 'إجمالي الأصول'], ['total_liabilities', 'إجمالي الالتزامات'], ['total_equity', 'حقوق الملكية'], ['revenue', 'الإيرادات'], ['net_income', 'صافي الربح/(الخسارة)'], ['cash', 'النقد']];
  return { intent: 'compare', company: ctxs.map((x) => x.company).join(' / '), period: c.period.label, text: [`مقارنة ${ctxs.map((x) => x.company).join(' و')} (${c.period.label}):`], table: { columns: ['البند', ...ctxs.map((x) => x.company)], rows: keys.map(([k, l]) => [l, ...ctxs.map((x) => money(x.kf[k] ?? 0))]) }, sources: ctxs.map((x) => `ميزان ${x.company}`), suggestions: [] };
}
