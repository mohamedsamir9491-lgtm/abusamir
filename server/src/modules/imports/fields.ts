/** تعريف حقول كل نوع بيانات وكلمات مفتاحية للربط التلقائي للأعمدة */
export interface FieldDef { key: string; label_ar: string; type: 'text' | 'number' | 'date'; required?: boolean; keywords: RegExp; group?: string }

export const DATA_TYPES = ['trial_balance', 'general_ledger', 'journal_entries', 'chart_of_accounts', 'receivables', 'payables', 'inventory', 'fixed_assets', 'bank_statement', 'financial_statements'] as const;
export type DataType = typeof DATA_TYPES[number];
export const DATA_TYPE_LABELS: Record<DataType, string> = {
  trial_balance: 'ميزان المراجعة', general_ledger: 'دفتر الأستاذ العام', journal_entries: 'قيود اليومية', chart_of_accounts: 'دليل الحسابات',
  receivables: 'الذمم المدينة', payables: 'الذمم الدائنة', inventory: 'المخزون', fixed_assets: 'الأصول الثابتة', bank_statement: 'كشف حساب بنكي', financial_statements: 'قوائم مالية',
};

const CODE = /(رمز|رقم|كود|code|acc(ount)?\s*(no|number|id|#)|^acct$|^account$)/i;
const NAME = /(اسم|بيان|وصف|name|description|title|account\s*name|label)/i;

export const FIELDS: Record<DataType, FieldDef[]> = {
  trial_balance: [
    { key: 'account_code', label_ar: 'رمز الحساب', type: 'text', required: true, keywords: CODE },
    { key: 'account_name', label_ar: 'اسم الحساب', type: 'text', keywords: NAME },
    { key: 'opening_debit', label_ar: 'افتتاحي مدين', type: 'number', keywords: /((افتتاح|أول|بداية|opening|beg).*(مدين|debit|dr))|((مدين|debit|dr).*(افتتاح|أول|بداية|opening|beg))/i, group: 'opening' },
    { key: 'opening_credit', label_ar: 'افتتاحي دائن', type: 'number', keywords: /((افتتاح|أول|بداية|opening|beg).*(دائن|credit|cr))|((دائن|credit|cr).*(افتتاح|أول|بداية|opening|beg))/i, group: 'opening' },
    { key: 'opening_balance', label_ar: 'رصيد افتتاحي (موقّع)', type: 'number', keywords: /^(?!.*(مدين|دائن|debit|credit)).*(افتتاح|أول المدة|بداية|opening|beginning)/i, group: 'opening' },
    { key: 'period_debit', label_ar: 'حركة مدين', type: 'number', keywords: /((حرك|الفترة|خلال|movement|period|activity|transaction|turnover|\d{1,2}\/\d{1,2}\/\d{4}).*(مدين|debit|dr))|((مدين|debit|dr).*(حرك|الفترة|خلال|movement|period|activity|turnover))/i, group: 'movements' },
    { key: 'period_credit', label_ar: 'حركة دائن', type: 'number', keywords: /((حرك|الفترة|خلال|movement|period|activity|transaction|turnover|\d{1,2}\/\d{1,2}\/\d{4}).*(دائن|credit|cr))|((دائن|credit|cr).*(حرك|الفترة|خلال|movement|period|activity|turnover))/i, group: 'movements' },
    { key: 'closing_debit', label_ar: 'ختامي مدين', type: 'number', keywords: /((ختام|نهائ|نهاي|آخر|closing|ending|end).*(مدين|debit|dr))|((مدين|debit|dr).*(ختام|نهائ|نهاي|آخر|closing|ending|end))|^(ال)?(مدين|debit|dr)$/i, group: 'closing' },
    { key: 'closing_credit', label_ar: 'ختامي دائن', type: 'number', keywords: /((ختام|نهائ|نهاي|آخر|closing|ending|end).*(دائن|credit|cr))|((دائن|credit|cr).*(ختام|نهائ|نهاي|آخر|closing|ending|end))|^(ال)?(دائن|credit|cr)$/i, group: 'closing' },
    { key: 'closing_balance', label_ar: 'رصيد ختامي (موقّع)', type: 'number', keywords: /^(?!.*(مدين|دائن|debit|credit)).*(ختام|نهائ|نهاي|آخر|الرصيد|closing|ending|^balance$|net)/i, group: 'closing' },
  ],
  journal_entries: [
    { key: 'entry_no', label_ar: 'رقم القيد', type: 'text', keywords: /(رقم القيد|رقم المستند|قيد|entry|voucher|jv|journal\s*(no|id|#)|doc(ument)?\s*(no|#))/i },
    { key: 'entry_date', label_ar: 'التاريخ', type: 'date', keywords: /(تاريخ|date)/i },
    { key: 'account_code', label_ar: 'رمز الحساب', type: 'text', required: true, keywords: CODE },
    { key: 'account_name', label_ar: 'اسم الحساب', type: 'text', keywords: /(اسم الحساب|account\s*name)/i },
    { key: 'debit', label_ar: 'مدين', type: 'number', keywords: /(مدين|debit|^dr$)/i },
    { key: 'credit', label_ar: 'دائن', type: 'number', keywords: /(دائن|credit|^cr$)/i },
    { key: 'description', label_ar: 'البيان', type: 'text', keywords: /(بيان|وصف|شرح|description|narration|memo|particulars)/i },
    { key: 'reference', label_ar: 'المرجع', type: 'text', keywords: /(مرجع|reference|ref)/i },
    { key: 'counterparty', label_ar: 'الطرف', type: 'text', keywords: /(طرف|عميل|مورد|party|customer|vendor|supplier)/i },
  ],
  general_ledger: [],
  chart_of_accounts: [
    { key: 'code', label_ar: 'رمز الحساب', type: 'text', required: true, keywords: CODE },
    { key: 'name_ar', label_ar: 'الاسم (عربي)', type: 'text', required: true, keywords: /(اسم|name|arabic|عربي)/i },
    { key: 'name_en', label_ar: 'الاسم (إنجليزي)', type: 'text', keywords: /(english|إنجليزي|name_en)/i },
    { key: 'account_type', label_ar: 'النوع', type: 'text', keywords: /(نوع|type|class|category|تصنيف)/i },
    { key: 'normal_balance', label_ar: 'طبيعة الرصيد', type: 'text', keywords: /(طبيعة|normal|nature)/i },
    { key: 'parent_code', label_ar: 'الحساب الأب', type: 'text', keywords: /(أب|رئيسي|parent|group)/i },
    { key: 'fs_line_code', label_ar: 'بند القوائم', type: 'text', keywords: /(بند|fs|line|statement|mapping|ربط)/i },
  ],
  receivables: [
    { key: 'counterparty', label_ar: 'العميل', type: 'text', required: true, keywords: /(عميل|اسم|customer|client|name|party|debtor)/i },
    { key: 'reference', label_ar: 'رقم الفاتورة/المرجع', type: 'text', keywords: /(فاتورة|مرجع|رقم|invoice|ref|number|doc)/i },
    { key: 'record_date', label_ar: 'تاريخ الفاتورة', type: 'date', keywords: /(تاريخ|date)/i },
    { key: 'due_date', label_ar: 'تاريخ الاستحقاق', type: 'date', keywords: /(استحقاق|due)/i },
    { key: 'amount', label_ar: 'المبلغ', type: 'number', keywords: /(مبلغ|قيمة|amount|value|total)/i },
    { key: 'balance', label_ar: 'الرصيد المتبقي', type: 'number', keywords: /(رصيد|متبقي|balance|outstanding|open)/i },
    { key: 'description', label_ar: 'البيان', type: 'text', keywords: /(بيان|وصف|description|memo)/i },
  ],
  payables: [
    { key: 'counterparty', label_ar: 'المورد', type: 'text', required: true, keywords: /(مورد|اسم|supplier|vendor|name|party|creditor)/i },
    { key: 'reference', label_ar: 'رقم الفاتورة/المرجع', type: 'text', keywords: /(فاتورة|مرجع|رقم|invoice|ref|number|doc)/i },
    { key: 'record_date', label_ar: 'تاريخ الفاتورة', type: 'date', keywords: /(تاريخ|date)/i },
    { key: 'due_date', label_ar: 'تاريخ الاستحقاق', type: 'date', keywords: /(استحقاق|due)/i },
    { key: 'amount', label_ar: 'المبلغ', type: 'number', keywords: /(مبلغ|قيمة|amount|value|total)/i },
    { key: 'balance', label_ar: 'الرصيد المتبقي', type: 'number', keywords: /(رصيد|متبقي|balance|outstanding|open)/i },
    { key: 'description', label_ar: 'البيان', type: 'text', keywords: /(بيان|وصف|description|memo)/i },
  ],
  inventory: [
    { key: 'reference', label_ar: 'رمز الصنف', type: 'text', keywords: /(رمز|كود|رقم الصنف|item\s*(code|no|id)|sku|code)/i },
    { key: 'description', label_ar: 'اسم الصنف', type: 'text', required: true, keywords: /(صنف|اسم|وصف|item|name|description)/i },
    { key: 'quantity', label_ar: 'الكمية', type: 'number', keywords: /(كمية|qty|quantity|units)/i },
    { key: 'unit_cost', label_ar: 'تكلفة الوحدة', type: 'number', keywords: /(تكلفة الوحدة|سعر|unit\s*(cost|price)|rate)/i },
    { key: 'amount', label_ar: 'القيمة الإجمالية', type: 'number', keywords: /(قيمة|إجمالي|مبلغ|value|amount|total|cost$)/i },
    { key: 'record_date', label_ar: 'تاريخ آخر حركة', type: 'date', keywords: /(تاريخ|date)/i },
    { key: 'category', label_ar: 'الفئة/المستودع', type: 'text', keywords: /(فئة|مستودع|مجموعة|category|warehouse|group|location)/i },
  ],
  fixed_assets: [
    { key: 'reference', label_ar: 'رمز الأصل', type: 'text', keywords: /(رمز|كود|رقم الأصل|asset\s*(code|no|id|tag)|code)/i },
    { key: 'description', label_ar: 'وصف الأصل', type: 'text', required: true, keywords: /(أصل|اسم|وصف|asset|name|description)/i },
    { key: 'category', label_ar: 'الفئة', type: 'text', keywords: /(فئة|نوع|مجموعة|category|class|type|group)/i },
    { key: 'record_date', label_ar: 'تاريخ الاقتناء', type: 'date', keywords: /(اقتناء|شراء|تاريخ|acquisition|purchase|date)/i },
    { key: 'cost', label_ar: 'التكلفة', type: 'number', keywords: /(تكلفة|cost|gross)/i },
    { key: 'rate_pct', label_ar: 'نسبة الاستهلاك %', type: 'number', keywords: /(نسبة|معدل|rate|%)/i },
    { key: 'useful_life_years', label_ar: 'العمر الإنتاجي (سنوات)', type: 'number', keywords: /(عمر|life|years)/i },
    { key: 'depreciation_period', label_ar: 'استهلاك الفترة', type: 'number', keywords: /((استهلاك|إهلاك|dep).*(سنة|فترة|period|year|charge|expense))|((الفترة|السنة|period|year).*(استهلاك|إهلاك|dep))/i },
    { key: 'accumulated_depreciation', label_ar: 'مجمع الاستهلاك', type: 'number', keywords: /(مجمع|accumulated|acc\.?\s*dep)/i },
    { key: 'net_book_value', label_ar: 'صافي القيمة الدفترية', type: 'number', keywords: /(صافي|دفترية|net|nbv|book value|carrying)/i },
  ],
  bank_statement: [
    { key: 'record_date', label_ar: 'التاريخ', type: 'date', required: true, keywords: /(تاريخ|date)/i },
    { key: 'description', label_ar: 'البيان', type: 'text', keywords: /(بيان|وصف|تفاصيل|description|narration|details|particulars)/i },
    { key: 'reference', label_ar: 'المرجع', type: 'text', keywords: /(مرجع|رقم|reference|ref|cheque|check|no)/i },
    { key: 'debit', label_ar: 'مدين (سحب)', type: 'number', keywords: /(مدين|سحب|خصم|debit|withdrawal|dr|paid out)/i },
    { key: 'credit', label_ar: 'دائن (إيداع)', type: 'number', keywords: /(دائن|إيداع|credit|deposit|cr|paid in)/i },
    { key: 'amount', label_ar: 'المبلغ (موقّع)', type: 'number', keywords: /(مبلغ|amount)/i },
    { key: 'balance', label_ar: 'الرصيد', type: 'number', keywords: /(رصيد|balance)/i },
  ],
  financial_statements: [
    { key: 'reference', label_ar: 'رمز البند', type: 'text', keywords: /(رمز|كود|code|line)/i },
    { key: 'description', label_ar: 'البند', type: 'text', required: true, keywords: /(بند|اسم|وصف|item|line|description|name|caption)/i },
    { key: 'amount', label_ar: 'الفترة الحالية', type: 'number', required: true, keywords: /(حالي|current|الفترة|amount|value|20\d\d)/i },
    { key: 'prior_amount', label_ar: 'الفترة السابقة', type: 'number', keywords: /(سابق|prior|previous|comparative|20\d\d)/i },
  ],
};
FIELDS.general_ledger = FIELDS.journal_entries;

/** عناوين مركّبة: دمج صف المجموعة (فوق صف العناوين، مع مراعاة الخلايا المدمجة) مع عنوان العمود */
export function compositeHeaders(rows: string[][], headerRow: number): string[] {
  const header = rows[headerRow - 1] ?? [];
  let groupRow: string[] | null = null;
  for (let r = headerRow - 2; r >= Math.max(0, headerRow - 4); r--) { if ((rows[r] ?? []).some((c) => c && c.trim())) { groupRow = rows[r]; break; } }
  return header.map((h, i) => {
    if (!groupRow) return h;
    let g = (groupRow[i] ?? '').trim();
    // الخلية المدمجة: نرث عنوان المجموعة من اليسار فقط للأعمدة ذات العناوين العامة (رصيد/مدين/دائن)
    if (!g && /^(ال)?(رصيد|مدين|دائن|balance|debit|credit|dr|cr)$/i.test((h ?? '').trim())) { for (let j = i - 1; j >= 0; j--) { if (groupRow[j] && groupRow[j].trim()) { g = groupRow[j].trim(); break; } } }
    return g ? `${g} ${h}`.trim() : h;
  });
}

export const OPENING_RX = /(افتتاح|أول المدة|أول الفترة|بداية|opening|beginning)/i;
export const CLOSING_RX = /(ختام|نهائ|نهاي|آخر المدة|آخر الفترة|closing|ending)/i;
export const MOVEMENT_RX = /(حرك|الفترة|خلال|movement|period|activity|turnover)/i;
/** هل يدل عنوان العمود على مجموعة مختلفة عن مجموعة الحقل (افتتاحي/حركة/ختامي)؟ */
export function headerConflictsWithField(header: string, group: string | undefined): boolean {
  const h = header.trim(); if (!h || !group) return false;
  const op = OPENING_RX.test(h), cl = CLOSING_RX.test(h);
  const mv = MOVEMENT_RX.test(h.replace(/(أول|آخر) (المدة|الفترة)/g, ''));
  if (group === 'closing') return (op && !cl) || (mv && !cl && !op);
  if (group === 'opening') return (cl && !op) || (mv && !op && !cl);
  if (group === 'movements') return (op || cl) && !mv;
  return false;
}

/** اقتراح ربط تلقائي للأعمدة بناءً على عناوينها (يمكن تمرير عناوين مركّبة) */
export function suggestMapping(dataType: DataType, headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const used = new Set<number>();
  const defs = FIELDS[dataType];
  // الحقول ذات الكلمات الأكثر تحديدًا أولًا (المجموعات المركبة ثم العامة)
  const ordered = [...defs].sort((a, b) => (b.keywords.source.length - a.keywords.source.length));
  for (const f of ordered) {
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const h = (headers[i] ?? '').trim();
      if (!h) continue;
      if (headerConflictsWithField(h, f.group)) continue; // «الرصيد الافتتاحي» لا يُربط أبدًا بحقل ختامي والعكس
      if (f.keywords.test(h)) { mapping[f.key] = i; used.add(i); break; }
    }
  }
  if (dataType === 'trial_balance') {
    // صيغة شائعة: رصيد افتتاحي (موقّع) | مدين | دائن | رصيد نهائي (موقّع)
    const balanceCols = headers.map((h, i) => (/^(.*\s)?(ال)?رصيد(\s.*)?$/i.test(h) || /balance/i.test(h)) && !/(مدين|دائن|debit|credit)/i.test(h) ? i : -1).filter((i) => i >= 0);
    const bareDr = headers.findIndex((h) => /(^|\s)(ال)?(مدين|debit|dr)$/i.test(h.trim())); const bareCr = headers.findIndex((h) => /(^|\s)(ال)?(دائن|credit|cr)$/i.test(h.trim()));
    if (balanceCols.length >= 2 && bareDr >= 0 && bareCr >= 0) {
      for (const k of Object.keys(mapping)) if (['opening_balance', 'closing_balance', 'closing_debit', 'closing_credit', 'period_debit', 'period_credit'].includes(k)) delete mapping[k];
      mapping.opening_balance = balanceCols[0]; mapping.closing_balance = balanceCols[balanceCols.length - 1]; mapping.period_debit = bareDr; mapping.period_credit = bareCr;
    } else if (balanceCols.length === 1 && mapping.closing_balance === undefined && mapping.closing_debit === undefined) mapping.closing_balance = balanceCols[0];
  }
  return mapping;
}

/** تحديد صف العناوين: أول صف يحتوي ≥2 خلية نصية غير رقمية ويليه صفوف ببيانات */
export function detectHeaderRow(rows: string[][], maxScan = 20): number {
  let best = 0; let bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const r = rows[i];
    const nonEmpty = r.filter((c) => c !== '');
    if (nonEmpty.length < 2) continue;
    const textual = nonEmpty.filter((c) => !/^[-+()\d.,\s٠-٩٬٫]+$/.test(c)).length;
    const score = textual * 2 + nonEmpty.length - i * 0.5;
    if (textual >= 2 && score > bestScore) { bestScore = score; best = i; }
  }
  return best + 1; // 1-based
}
