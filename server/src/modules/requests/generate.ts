/** توليد طلبات المعلومات من العميل: كل طلب مرتبط برقم أو ملاحظة يحسمها، ويُستبعد ما لا أثر له
 * الأولوية: أساسي إذا بلغ أثره 5% من أصول الشركة أو كان شرطًا لرقم في التقرير؛ داعم من 1%؛ ويُحذف ما دون ذلك */
import type { LocalContext } from '../ai/local.js';
import { money } from '../ai/local.js';
import { toks, type Register } from '../valuation/nav.js';

export interface ReqDraft { engagementId: string; periodId: string | null; company: string; key: string; category: 'document' | 'explanation' | 'confirmation'; title: string; reason: string; amount: number | null; priority: 'essential' | 'supporting'; links: string[] }
export interface ReqCompany { engagementId: string; periodId: string | null; name: string; role: 'parent' | 'subsidiary' | 'at_cost'; ctx: LocalContext | null; investment: number | null; receivable: number | null }
export interface ReqRegisterItem { company: string; amount: string; equity_effect: string; description: string }
export interface DeriveInput { companies: ReqCompany[]; register: Register | null; consolidationRegister: ReqRegisterItem[]; periodEnd: string }

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const N = (s: string) => s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
function prio(amount: number, ta: number, hi = 0.05, lo = 0.01): 'essential' | 'supporting' | null {
  if (!ta) return amount ? 'supporting' : null; const r = Math.abs(amount) / ta; return r >= hi ? 'essential' : r >= lo ? 'supporting' : null;
}

export function deriveRequests(inp: DeriveInput): ReqDraft[] {
  const out: ReqDraft[] = [];
  const parent = inp.companies.find((c) => c.role === 'parent');
  const parentTA = parent?.ctx?.kf.total_assets ?? 0; const parentName = parent?.name ?? 'الشركة الأم';
  const add = (c: ReqCompany, r: Omit<ReqDraft, 'engagementId' | 'periodId' | 'company'>) => { if (!out.some((x) => x.engagementId === c.engagementId && x.key === r.key)) out.push({ engagementId: c.engagementId, periodId: c.periodId, company: c.name, ...r }); };
  for (const c of inp.companies) {
    const x = c.ctx;
    if (!x) {
      if (c.role === 'at_cost') { const exp = (c.investment ?? 0) + Math.max(0, c.receivable ?? 0);
        add(c, { key: 'tb', category: 'document', title: `ميزان مراجعة ${c.name} للفترة نفسها (أو آخر قوائم مالية معتمدة) مع عقد تأسيسها`, reason: `استثمار ${parentName} فيها ${money(c.investment ?? 0)}${c.receivable ? ` ومستحق لـ${parentName} عليها ${money(c.receivable)}` : ''} (${parentTA ? pct(exp / parentTA) : '—'} من أصول ${parentName})؛ تبقى بالتكلفة في التقييم إلى حين توافر قوائمها`, amount: exp, priority: prio(exp, parentTA) ?? 'supporting', links: [] }); }
      else add(c, { key: 'tb', category: 'document', title: `ميزان مراجعة ${c.name} للفترة`, reason: 'لا يوجد ميزان معتمد لهذه الشركة في الفترة؛ لا يمكن تقييمها بدونه', amount: null, priority: 'essential', links: [] });
      continue;
    }
    const ta = x.kf.total_assets ?? 0; const F = (rule: string) => x.findings.filter((f) => f.rule === rule);
    const acc = (code: string | null | undefined) => x.accounts.find((a) => a.code === code);
    const sumFs = (...fs: string[]) => x.accounts.filter((a) => fs.includes(a.fs)).reduce((t, a) => t + a.closing, 0);
    // 1) ما دخل به المساهمون (رأس المال المدفوع ورأس المال الإضافي)
    const apic = -sumFs('ADDITIONAL_CAPITAL'); const d2 = F('DOC-002')[0];
    if (c.role === 'parent' && (d2 || (apic > 0 && prio(apic, ta)))) add(c, { key: 'contributions', category: 'document', title: 'بيان بما دفعه كل مساهم فعلًا، مع كشوف البنك لإيداعات رأس المال وقرارات المساهمين', reason: [d2?.title, apic > 0 ? `الدفاتر تُظهر رأس مال إضافي مدفوع ${money(apic)} يلزم سنده (قرار وإيداع) وبيان هل هو مساهمة لا تُرد أم قرض من المساهمين` : null, 'يحدد هذا المبلغ «ما دخل به المساهمون» في تقرير المساهمين'].filter(Boolean).join('؛ '), amount: d2?.amount ? Number(d2.amount) : apic, priority: 'essential', links: [d2?.ref].filter(Boolean) as string[] });
    // 2) الحساب البيني مع الأم (تابعة): سداد رأس المال والفروق غير المحسومة
    if (c.role === 'subsidiary') {
      const d3 = F('DOC-003')[0]; const reg = inp.consolidationRegister.filter((r) => r.company === c.name && Number(r.amount) > 0);
      const pending = reg.filter((r) => r.equity_effect === 'possible').reduce((t, r) => t + Number(r.amount), 0);
      if (d3 || reg.length) add(c, { key: 'intercompany', category: 'document', title: `كشف حساب «جاري ${parentName}» لدى ${c.name} بكل حركاته، ومطابقة موقعة مع حساب الاستثمار لدى الأم، وما يثبت سداد رأس المال`, reason: [d3?.title, pending ? `فرق غير محسوم في التوحيد ${money(pending)} قد يؤثر على القيمة الموحدة` : null].filter(Boolean).join('؛ '), amount: d3?.amount ? Number(d3.amount) : pending, priority: 'essential', links: [d3?.ref].filter(Boolean) as string[] });
    }
    // 3) نسخة نهائية من المستند النظامي
    for (const f of F('DOC-004')) add(c, { key: 'final_articles', category: 'document', title: `النسخة النهائية المعتمدة من ${f.title.replace(/\s*نسخة مسودة.*$/, '').trim()}`, reason: f.title, amount: null, priority: 'essential', links: [f.ref] });
    const types = new Set(x.official.map((o) => o.type));
    if (!types.has('articles_of_association') && !F('DOC-004').length) add(c, { key: 'articles', category: 'document', title: 'عقد التأسيس / النظام الأساس المعتمد وآخر تعديلاته', reason: 'لإثبات رأس المال ونسب الملكية والصلاحيات', amount: null, priority: 'essential', links: [] });
    if (!types.has('commercial_registration')) add(c, { key: 'cr', category: 'document', title: 'صورة السجل التجاري الساري', reason: 'للتحقق من الكيان وحالته وتاريخ انتهاء السجل', amount: null, priority: 'supporting', links: [] });
    // 4) جاري الشركاء المدين
    for (const f of F('TB-025')) { const a = acc(f.account); const amt = Number(f.amount ?? a?.closing ?? 0); const inReg = !inp.register?.holders.length || inp.register.holders.some((h) => toks(h.name).filter((t) => a && toks(a.name).includes(t)).length >= 2);
      add(c, { key: `partner:${f.account ?? f.ref}`, category: 'explanation', title: `كشف حساب «${a?.name ?? f.title}» وسبب رصيده المدين ${money(amt)} وطريقة تسويته (سداد أو خصم من حقوق الشريك)`, reason: `رصيد مستحق على شريك يُخصم من نصيبه في تقرير المساهمين${inReg ? '' : '؛ ولا يظهر الاسم ضمن المساهمين المسجلين، فيلزم تأكيد صفته'}`, amount: amt, priority: prio(amt, ta) ?? 'supporting', links: [f.ref] }); }
    // 5) الخسائر المتراكمة ونصف رأس المال
    const cap = -sumFs('SHARE_CAPITAL'); const losses = sumFs('RETAINED_EARNINGS') - (x.kf.net_income ?? 0);
    if (cap > 0 && losses >= cap * 0.5) add(c, { key: 'losses_resolution', category: 'document', title: `صورة قرار المساهمين/الشركاء بشأن بلوغ الخسائر المتراكمة ${pct(losses / cap)} من رأس المال (إن صدر)`, reason: `الخسائر المتراكمة ${money(losses)} مقابل رأس مال ${money(cap)}؛ نظام الشركات يرتب إجراءات عند بلوغ الخسائر نصف رأس المال (المادة 132 للمساهمة، والمادة 182 لذات المسؤولية المحدودة)، ويحدد ذلك أساس استمرار النشاط في التقييم`, amount: losses, priority: 'essential', links: [...F('TB-024'), ...F('LA-009')].map((f) => f.ref) });
    // 6) الأصول الثابتة وغير الملموسة والإيجار
    const ppe = sumFs('PPE'); const ia = sumFs('INTANGIBLES');
    for (const f of F('LA-001')) { const p = prio(ppe, ta); if (p) add(c, { key: 'asset_register', category: 'document', title: 'سجل الأصول الثابتة: وصف كل أصل وتاريخ شرائه وتكلفته', reason: `${f.title}؛ بدونه يُحتسب الاستهلاك بالنسب السنوية المقترحة المعتمدة منك`, amount: ppe, priority: p, links: [f.ref] }); }
    for (const f of F('LA-002')) { const p = prio(ia, ta); if (p) add(c, { key: 'intangibles', category: 'document', title: 'بيان الأصول غير الملموسة: طبيعتها وتاريخ اقتنائها ومدة الانتفاع بها', reason: `${f.title}؛ بدونه يُحتسب الإطفاء بالنسبة المقترحة المعتمدة منك`, amount: ia, priority: p, links: [f.ref] }); }
    const lz = [...F('LA-003'), ...F('LA-004')]; const rou = sumFs('ROU_ASSETS');
    if (lz.length) add(c, { key: 'lease', category: 'document', title: 'عقد الإيجار وملاحقه: تاريخ البداية والمدة وقيمة الدفعات ومواعيدها وأي دفعة مقدمة', reason: `أصل حق استخدام ${money(rou)} والتزام إيجار ${money(-sumFs('LEASE_LIAB_CURRENT', 'LEASE_LIAB_NON_CURRENT'))} دون استهلاك أو فائدة مسجلة؛ يلزم العقد لاحتسابهما وفق IFRS 16`, amount: rou, priority: prio(rou, ta) ?? 'supporting', links: lz.map((f) => f.ref) });
    // 7) الرواتب والمكافأة
    for (const f of F('LA-005')) { const amt = Number(f.amount ?? 0); const p = prio(amt, ta, 0.05, 0.01); if (p) add(c, { key: 'payroll', category: 'explanation', title: `كشف بالرواتب المستحقة (${money(amt)}) بأسماء الموظفين، وتوضيح عدم ظهور مصروف رواتب في الفترة`, reason: f.title, amount: amt, priority: p, links: [f.ref] }); }
    for (const f of F('LA-006')) { const amt = Number(f.amount ?? 0); const p = prio(amt, ta); if (p) add(c, { key: 'eosb', category: 'document', title: 'كشف الموظفين بتواريخ التعيين والرواتب الأساسية لتحديث مكافأة نهاية الخدمة', reason: f.title, amount: amt, priority: p, links: [f.ref] }); }
    // 8) مصروفات مبهمة كبيرة (نثرية/متنوعة) أو أي مصروف يتجاوز 10% من الأصول
    for (const f of F('LA-007')) { const a = acc(f.account); const amt = Number(f.amount ?? 0); const vague = /نثري|متنوع|اخري|عمومي|مختلف/.test(N(a?.name ?? f.title)); const p = vague ? prio(amt, ta) : (ta && amt / ta >= 0.1 ? 'supporting' : null);
      if (p) add(c, { key: `expense:${f.account ?? f.ref}`, category: 'document', title: `كشف تفصيلي بحركة «${a?.name ?? 'المصروف'}» (${money(amt)}) مع مستندات البنود الكبيرة`, reason: `${f.title}؛ للتحقق من طبيعتها وعدم وجود أصول أو مسحوبات مسجلة مصروفًا`, amount: amt, priority: p, links: [f.ref] }); }
    // 9) الإيرادات المؤجلة
    for (const f of F('LA-010')) { const amt = Number(f.amount ?? 0); const p = prio(amt, ta, 0.1, 0.01); if (p) add(c, { key: 'deferred_revenue', category: 'document', title: `العقود المرتبطة بالإيرادات المؤجلة (${money(amt)}) وما نُفذ منها حتى ${inp.periodEnd}`, reason: f.title, amount: amt, priority: p, links: [f.ref] }); }
    // 10) أرصدة يُشك في تصنيفها (غير البينية)
    for (const f of F('TB-016')) { const a = acc(f.account); if (!a || /جاري|استثمار/.test(a.name) || ['RELATED_PARTY_DR', 'RELATED_PARTY_CR'].includes(a.fs)) continue; const amt = Math.abs(a.closing); const p = prio(amt, ta);
      if (p) add(c, { key: `classify:${a.code}`, category: 'explanation', title: `توضيح طبيعة رصيد «${a.name}» (${money(amt)}) مع كشف تفصيلي بالأسماء والتواريخ`, reason: `${f.title}؛ يحدد قابلية التحصيل وتصنيفه في التقييم`, amount: amt, priority: p, links: [f.ref] }); }
    // 11) النقد
    const cashAll = x.accounts.filter((a) => a.fs === 'CASH' && a.closing > 0).sort((a, b) => b.closing - a.closing); const cash = cashAll.reduce((t, a) => t + a.closing, 0); const cashAcc = cashAll.filter((a) => a.closing >= Math.max(100, cash * 0.01)); const pc = prio(cash, ta, 0.1, 0.03);
    if (pc) add(c, { key: 'bank_statements', category: 'document', title: `كشوف الحسابات البنكية كما في ${inp.periodEnd}: ${cashAcc.slice(0, 4).map((a) => `${a.name} (${money(a.closing)})`).join('، ')}`, reason: `لإثبات وجود النقد ${money(cash)} (${pct(cash / ta)} من الأصول)`, amount: cash, priority: pc, links: [] });
  }
  // على مستوى المالك: سجل المساهمين وتقييم الأصول الاختياري
  if (parent) {
    const R = inp.register;
    if (!R || R.basis === 'assumed_equal') add(parent, { key: 'shareholders_register', category: 'document', title: 'سجل المساهمين: اسم كل مساهم وعدد أسهمه والمدفوع منها', reason: R?.holders.length ? `نسب المساهمين في التقرير حاليًا افتراضية بالتساوي بين ${R.holders.length} مساهمين حتى وصول السجل` : 'لا توجد نسب مساهمين معتمدة لتوزيع القيمة', amount: null, priority: 'essential', links: [] });
    const hasAssets = inp.companies.some((c) => c.ctx && c.ctx.accounts.some((a) => ['PPE', 'INTANGIBLES', 'ROU_ASSETS'].includes(a.fs) && a.closing > 0 && prio(a.closing, c.ctx!.kf.total_assets ?? 0)));
    if (hasAssets) add(parent, { key: 'owner_valuation', category: 'document', title: 'تقرير تقييم معتمد للأصول (اختياري)', reason: 'إن وُجد يُستخدم بدل الاستهلاك المحتسب بالنسب المقترحة', amount: null, priority: 'supporting', links: [] });
  }
  const clean = (t: string) => t.replace(/\.(pdf|png|jpe?g|xlsx?|docx?)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  for (const r of out) { r.title = clean(r.title); r.reason = clean(r.reason); }
  const order = (r: ReqDraft) => (r.priority === 'essential' ? 0 : 1);
  return out.sort((a, b) => order(a) - order(b));
}
