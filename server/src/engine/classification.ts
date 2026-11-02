/**
 * تصنيف الحسابات الاستدلالي: يعتمد على اسم الحساب (عربي/إنجليزي) ثم على بادئة الرمز.
 * النتيجة اقتراح بدرجة ثقة؛ المحاسب يراجع ويعدّل الربط النهائي في دليل الحسابات.
 */
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'other';
export type NormalBalance = 'debit' | 'credit';

export interface Classification {
  account_type: AccountType;
  sub_type: string;
  normal_balance: NormalBalance;
  fs_line_code: string;
  is_suspense: boolean;
  is_bank: boolean;
  confidence: number; // 0..1
  reason: string;
}

interface Rule { re: RegExp; type: AccountType; sub: string; nb: NormalBalance; fs: string; conf: number; suspense?: boolean; bank?: boolean }

const RULES: Rule[] = [
  // مصاريف ذات كلمات مميزة تُفحص أولًا لتجنب التداخل مع قواعد الميزانية
  { re: /(تكاليف تمويل|مصاريف تمويل|فوائد|عمولات بنكية|finance cost|interest expense|bank charges)/i, type: 'expense', sub: 'finance_cost', nb: 'debit', fs: 'FINANCE_COST', conf: 0.85 },
  { re: /(تكلفة.*(مبيعات|إيراد|بضاعة|خدمات)|مشتريات|cost of (sales|revenue|goods)|cogs|purchases)/i, type: 'expense', sub: 'cost_of_sales', nb: 'debit', fs: 'COGS', conf: 0.85 },
  { re: /^(?!.*مخصص).*(خسائر ائتمانية|ديون معدومة|مصروف.*(ديون|مشكوك)|bad debt|expected credit loss|impairment of receivable)/i, type: 'expense', sub: 'operating_expense', nb: 'debit', fs: 'ECL_EXP', conf: 0.85 },
  // حسابات معلقة ووسيطة (أولوية عالية)
  { re: /(معلق|وسيط|مؤقت|تسوية|suspense|clearing|temporary|unallocated|غير موزع)/i, type: 'other', sub: 'suspense', nb: 'debit', fs: 'SUSPENSE', conf: 0.9, suspense: true },
  // النقد والبنوك
  { re: /(بنك|مصرف|صندوق|نقد|نقدية|عهدة نقدية|bank|cash|petty)/i, type: 'asset', sub: 'current_asset', nb: 'debit', fs: 'CASH', conf: 0.85, bank: true },
  // مخصصات مقابل الذمم
  { re: /(مخصص.*(ديون|ذمم|مشكوك|ائتمان)|خسائر ائتمانية|allowance.*(doubtful|receivable|credit)|ecl|bad debt provision)/i, type: 'asset', sub: 'contra_asset', nb: 'credit', fs: 'AR_ALLOWANCE', conf: 0.85 },
  // الزكاة والضرائب
  { re: /(ضريبة القيمة المضافة|vat|قيمة مضافة).*(مدين|مدخلات|مستحق.*استرداد|input|receivable|recoverable)/i, type: 'asset', sub: 'current_asset', nb: 'debit', fs: 'VAT_RECEIVABLE', conf: 0.8 },
  { re: /(ضريبة القيمة المضافة|vat|قيمة مضافة)/i, type: 'liability', sub: 'current_liability', nb: 'credit', fs: 'VAT_PAYABLE', conf: 0.7 },
  { re: /(مصروف|مصاريف).*(زكاة|ضريبة الدخل)|zakat.*(expense|charge)|income tax expense/i, type: 'expense', sub: 'zakat_tax', nb: 'debit', fs: 'ZAKAT_TAX_EXP', conf: 0.85 },
  { re: /(زكاة|ضريبة الدخل|zakat|income tax)/i, type: 'liability', sub: 'current_liability', nb: 'credit', fs: 'ZAKAT_TAX_PAYABLE', conf: 0.7 },
  // أطراف ذات علاقة
  { re: /(مستحق من|due from).*(أطراف|شركات شقيقة|related|affiliate)|(أطراف ذات علاقة|related part).*(مدين|receivable)/i, type: 'asset', sub: 'current_asset', nb: 'debit', fs: 'RELATED_PARTY_DR', conf: 0.8 },
  { re: /(مستحق إلى|مستحق الى|due to).*(أطراف|شركات شقيقة|related|affiliate)|(أطراف ذات علاقة|related part).*(دائن|payable)/i, type: 'liability', sub: 'current_liability', nb: 'credit', fs: 'RELATED_PARTY_CR', conf: 0.8 },
  // الذمم
  { re: /(ذمم.*مدين|مدينون|عملاء|عميل|receivable|customers?|debtors|a\/r|\bar\b)/i, type: 'asset', sub: 'current_asset', nb: 'debit', fs: 'AR', conf: 0.85 },
  { re: /(مقدم|مدفوع مقدم|prepaid|advance to|سلف|عهد|deposits? paid|تأمينات مدفوعة)/i, type: 'asset', sub: 'current_asset', nb: 'debit', fs: 'OTHER_RECEIVABLES', conf: 0.75 },
  { re: /(ذمم.*دائن|دائنون|موردون|مورد|payable|suppliers?|vendors?|creditors|a\/p|\bap\b)/i, type: 'liability', sub: 'current_liability', nb: 'credit', fs: 'AP', conf: 0.85 },
  { re: /(مستحق|مستحقة|accrued|accrual|رواتب مستحقة|إجازات|تذاكر)/i, type: 'liability', sub: 'current_liability', nb: 'credit', fs: 'ACCRUALS', conf: 0.75 },
  { re: /(نهاية الخدمة|مكافأة نهاية|end of service|eosb|gratuity)/i, type: 'liability', sub: 'non_current_liability', nb: 'credit', fs: 'EOSB', conf: 0.9 },
  // المخزون
  { re: /(مخزون|بضاعة|مواد خام|إنتاج تحت التشغيل|inventor|stock|goods|raw material|wip)/i, type: 'asset', sub: 'current_asset', nb: 'debit', fs: 'INVENTORY', conf: 0.85 },
  // الأصول الثابتة
  { re: /(مجمع.*(استهلاك|إهلاك|إطفاء)|accumulated (dep|amort))/i, type: 'asset', sub: 'contra_asset', nb: 'credit', fs: 'ACC_DEP', conf: 0.95 },
  { re: /(مصروف|مصاريف).*(استهلاك|إهلاك|إطفاء)|(استهلاك|إهلاك|إطفاء).*(مصروف|السنة|الفترة)|depreciation|amorti[sz]ation/i, type: 'expense', sub: 'operating_expense', nb: 'debit', fs: 'DEPRECIATION_EXP', conf: 0.85 },
  { re: /(حق الاستخدام|right.of.use|rou)/i, type: 'asset', sub: 'non_current_asset', nb: 'debit', fs: 'ROU_ASSETS', conf: 0.9 },
  { re: /(غير ملموس|برامج|شهرة|تراخيص|intangible|software|goodwill|licen[cs]e)/i, type: 'asset', sub: 'non_current_asset', nb: 'debit', fs: 'INTANGIBLES', conf: 0.8 },
  { re: /(أصول ثابتة|ممتلكات|آلات|معدات|سيارات|مركبات|أثاث|مباني|أراضي|أجهزة|حاسب|تحسينات|fixed asset|ppe|property|plant|equipment|vehicle|furniture|building|land|computer|leasehold)/i, type: 'asset', sub: 'non_current_asset', nb: 'debit', fs: 'PPE', conf: 0.8 },
  { re: /(استثمار|investment|صكوك|sukuk|أسهم)/i, type: 'asset', sub: 'non_current_asset', nb: 'debit', fs: 'INVESTMENTS', conf: 0.7 },
  // القروض والإيجار
  { re: /(التزامات.*إيجار|lease liabilit)/i, type: 'liability', sub: 'non_current_liability', nb: 'credit', fs: 'LEASE_LIAB_NON_CURRENT', conf: 0.8 },
  { re: /(قرض|قروض|تسهيلات|تمويل|مرابحة|loan|borrowing|facility|murabaha|overdraft|جاري مدين)/i, type: 'liability', sub: 'non_current_liability', nb: 'credit', fs: 'LONG_TERM_LOANS', conf: 0.7 },
  // حقوق الملكية
  { re: /(رأس المال|رأسمال|share capital|capital stock|paid.?in capital)/i, type: 'equity', sub: 'equity', nb: 'credit', fs: 'SHARE_CAPITAL', conf: 0.95 },
  { re: /(احتياطي نظامي|statutory reserve|legal reserve)/i, type: 'equity', sub: 'equity', nb: 'credit', fs: 'STATUTORY_RESERVE', conf: 0.95 },
  { re: /(احتياطي|reserve)/i, type: 'equity', sub: 'equity', nb: 'credit', fs: 'OTHER_RESERVES', conf: 0.8 },
  { re: /(أرباح مبقاة|أرباح محتجزة|خسائر متراكمة|retained|accumulated (loss|profit|deficit))/i, type: 'equity', sub: 'equity', nb: 'credit', fs: 'RETAINED_EARNINGS', conf: 0.95 },
  { re: /(جاري الشريك|جاري الشركاء|جاري المالك|partner.*current|owner.*current|shareholder.*current)/i, type: 'equity', sub: 'equity', nb: 'credit', fs: 'OWNER_CURRENT', conf: 0.85 },
  { re: /(توزيعات|مسحوبات|dividend|drawing)/i, type: 'equity', sub: 'equity', nb: 'debit', fs: 'DIVIDENDS', conf: 0.85 },
  // تكلفة المبيعات وتكاليف التمويل (قبل قواعد الإيرادات لتجنب التداخل)
  // الإيرادات
  { re: /(مردودات|مسموحات|خصم مسموح|returns|allowances|discount allowed)/i, type: 'revenue', sub: 'contra_revenue', nb: 'debit', fs: 'SALES_RETURNS', conf: 0.85 },
  { re: /^(?!.*(تكاليف|تكلفة|مصاريف|مصروف|cost|expense)).*(إيرادات تمويل|أرباح مرابحة|interest income|finance income|profit on deposit)/i, type: 'revenue', sub: 'finance_income', nb: 'credit', fs: 'FINANCE_INCOME', conf: 0.85 },
  { re: /(إيرادات أخرى|إيراد آخر|other income|miscellaneous income|أرباح بيع|gain)/i, type: 'revenue', sub: 'other_income', nb: 'credit', fs: 'OTHER_INCOME', conf: 0.8 },
  { re: /(إيراد|إيرادات|مبيعات|sales|revenue|income|خدمات مقدمة|fees? earned)/i, type: 'revenue', sub: 'revenue', nb: 'credit', fs: 'REVENUE', conf: 0.8 },
  // المصاريف
  { re: /(بيع|تسويق|دعاية|إعلان|عمولات مبيعات|selling|marketing|advertis|promotion)/i, type: 'expense', sub: 'operating_expense', nb: 'debit', fs: 'SELLING_EXP', conf: 0.8 },
  { re: /(رواتب|أجور|إيجار|كهرباء|مياه|اتصالات|صيانة|تأمين|رسوم|اشتراكات|أتعاب|قرطاسية|ضيافة|سفر|عمومية|إدارية|مصروف|مصاريف|salar|wage|rent|utilit|maintenance|insurance|fees|subscription|stationery|travel|general|administrative|expense)/i, type: 'expense', sub: 'operating_expense', nb: 'debit', fs: 'ADMIN_EXP', conf: 0.7 },
  { re: /(خسائر|خسارة|loss)/i, type: 'expense', sub: 'other_expense', nb: 'debit', fs: 'OTHER_EXPENSE', conf: 0.6 },
];

/** تصنيف حسب بادئة الرمز (الترقيم الشائع 1=أصول 2=التزامات 3=حقوق ملكية 4=إيرادات 5=مصاريف) */
function byCodePrefix(code: string): Partial<Classification> | null {
  const c = code.trim();
  const first = c[0];
  switch (first) {
    case '1': return { account_type: 'asset', sub_type: 'current_asset', normal_balance: 'debit', fs_line_code: 'OTHER_CURRENT_ASSETS', confidence: 0.4, reason: 'بادئة الرمز 1 (أصول)' };
    case '2': return { account_type: 'liability', sub_type: 'current_liability', normal_balance: 'credit', fs_line_code: 'OTHER_CURRENT_LIABILITIES', confidence: 0.4, reason: 'بادئة الرمز 2 (التزامات)' };
    case '3': return { account_type: 'equity', sub_type: 'equity', normal_balance: 'credit', fs_line_code: 'OTHER_RESERVES', confidence: 0.4, reason: 'بادئة الرمز 3 (حقوق ملكية)' };
    case '4': return { account_type: 'revenue', sub_type: 'revenue', normal_balance: 'credit', fs_line_code: 'REVENUE', confidence: 0.4, reason: 'بادئة الرمز 4 (إيرادات)' };
    case '5': case '6': return { account_type: 'expense', sub_type: 'operating_expense', normal_balance: 'debit', fs_line_code: 'ADMIN_EXP', confidence: 0.4, reason: `بادئة الرمز ${first} (مصاريف)` };
    default: return null;
  }
}

export function classifyAccount(code: string, name: string | null | undefined): Classification {
  const n = (name ?? '').trim();
  const prefix = byCodePrefix(code ?? '');
  if (n) {
    for (const r of RULES) {
      if (r.re.test(n)) {
        let conf = r.conf;
        // إن كانت بادئة الرمز تتعارض مع النوع المستنتج من الاسم نخفض الثقة
        if (prefix && prefix.account_type && prefix.account_type !== r.type && r.type !== 'other') conf = Math.max(0.35, conf - 0.3);
        else if (prefix && prefix.account_type === r.type) conf = Math.min(0.98, conf + 0.05);
        return { account_type: r.type, sub_type: r.sub, normal_balance: r.nb, fs_line_code: r.fs, is_suspense: !!r.suspense, is_bank: !!r.bank,
          confidence: conf, reason: `مطابقة اسم الحساب "${n}"` };
      }
    }
  }
  if (prefix) {
    return { account_type: prefix.account_type!, sub_type: prefix.sub_type!, normal_balance: prefix.normal_balance!, fs_line_code: prefix.fs_line_code!,
      is_suspense: false, is_bank: false, confidence: prefix.confidence!, reason: prefix.reason! };
  }
  return { account_type: 'other', sub_type: 'unclassified', normal_balance: 'debit', fs_line_code: 'UNMAPPED', is_suspense: false, is_bank: false, confidence: 0, reason: 'تعذر التصنيف' };
}

export const SUB_TYPE_LABELS: Record<string, string> = {
  current_asset: 'أصل متداول', non_current_asset: 'أصل غير متداول', contra_asset: 'حساب مقابل للأصول',
  current_liability: 'التزام متداول', non_current_liability: 'التزام غير متداول', equity: 'حقوق ملكية',
  revenue: 'إيراد', contra_revenue: 'حساب مقابل للإيرادات', other_income: 'إيراد آخر', finance_income: 'إيراد تمويل',
  cost_of_sales: 'تكلفة المبيعات', operating_expense: 'مصروف تشغيلي', finance_cost: 'تكلفة تمويل', other_expense: 'مصروف آخر',
  zakat_tax: 'زكاة وضريبة', suspense: 'حساب معلق', unclassified: 'غير مصنف',
};
export const TYPE_LABELS: Record<AccountType, string> = { asset: 'أصول', liability: 'التزامات', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصاريف', other: 'أخرى' };
