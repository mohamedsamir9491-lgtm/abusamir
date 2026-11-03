/** قوالب التقارير النظامية: فصل العرض (الأقسام) عن الحسابات والنتائج */
export type SectionType = 'cover' | 'intro' | 'scope' | 'sources' | 'summary' | 'tb_summary' | 'findings' | 'statements_sfp' | 'statements_pl' | 'statements_cf' | 'statements_ce'
  | 'ratios' | 'variance' | 'aging' | 'adjustments' | 'documents_needed' | 'questions' | 'ai_commentary' | 'risks' | 'recommendations' | 'limitations' | 'disclaimer' | 'appendix_tb' | 'appendix_accounts' | 'signatures' | 'custom_text' | 'fixed_assets' | 'inventory' | 'bank' | 'checklist' | 'consolidation' | 'valuation_terms';

export interface TemplateSection { key: string; type: SectionType; title_ar: string; title_en: string; enabled: boolean; order: number; options?: Record<string, unknown> }
export interface SystemTemplate { code: string; report_type: string; name_ar: string; name_en: string; description: string; sections: TemplateSection[] }

const S = (key: string, type: SectionType, title_ar: string, title_en: string, order: number, enabled = true, options?: Record<string, unknown>): TemplateSection => ({ key, type, title_ar, title_en, enabled, order, options });

const COMMON_HEAD = (o = 0) => [
  S('cover', 'cover', 'صفحة الغلاف', 'Cover', o + 1),
  S('intro', 'intro', 'مقدمة', 'Introduction', o + 2),
  S('scope', 'scope', 'نطاق العمل والهدف', 'Scope and objective', o + 3),
  S('sources', 'sources', 'مصادر البيانات التي تمت مراجعتها', 'Data sources reviewed', o + 4),
  S('summary', 'summary', 'الملخص التنفيذي', 'Executive summary', o + 5),
];
const COMMON_TAIL = (o = 90) => [
  S('recommendations', 'recommendations', 'التوصيات', 'Recommendations', o + 1),
  S('limitations', 'limitations', 'المخاطر والقيود على التحليل', 'Risks and limitations', o + 2),
  S('disclaimer', 'disclaimer', 'إخلاء المسؤولية', 'Disclaimer', o + 3),
  S('signatures', 'signatures', 'الإعداد والمراجعة', 'Preparer and reviewer', o + 4),
];

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  { code: 'TB_REVIEW', report_type: 'trial_balance_review', name_ar: 'تقرير مراجعة ميزان المراجعة', name_en: 'Trial Balance Review Report', description: 'فحص التوازن والاتساق والأرصدة غير الطبيعية والحسابات المعلقة',
    sections: [...COMMON_HEAD(), S('tb_summary', 'tb_summary', 'نتائج فحص ميزان المراجعة', 'Trial balance checks', 10), S('findings', 'findings', 'الملاحظات التفصيلية', 'Detailed findings', 11, true, { rule_prefixes: ['TB-'] }), S('documents_needed', 'documents_needed', 'المستندات المطلوبة', 'Documents required', 12), ...COMMON_TAIL(), S('appendix_tb', 'appendix_tb', 'ملحق: ميزان المراجعة المصنف', 'Appendix: classified trial balance', 99)] },
  { code: 'FS_ANALYSIS', report_type: 'financial_statement_analysis', name_ar: 'تقرير تحليل القوائم المالية', name_en: 'Financial Statement Analysis Report', description: 'القوائم المالية المشتقة والنسب والمقارنات',
    sections: [...COMMON_HEAD(), S('statements_sfp', 'statements_sfp', 'قائمة المركز المالي', 'Statement of financial position', 10), S('statements_pl', 'statements_pl', 'قائمة الربح أو الخسارة', 'Statement of profit or loss', 11), S('statements_ce', 'statements_ce', 'قائمة التغيرات في حقوق الملكية', 'Statement of changes in equity', 12), S('statements_cf', 'statements_cf', 'قائمة التدفقات النقدية', 'Statement of cash flows', 13), S('ratios', 'ratios', 'النسب المالية', 'Financial ratios', 14), S('variance', 'variance', 'مقارنة الفترات', 'Period comparison', 15), S('ai_commentary', 'ai_commentary', 'التعليق التحليلي', 'Analytical commentary', 16), S('findings', 'findings', 'الملاحظات', 'Findings', 17, true, { rule_prefixes: ['FS-', 'VAR-', 'AI'] }), ...COMMON_TAIL()] },
  { code: 'MGMT_ANALYSIS', report_type: 'management_analysis', name_ar: 'تقرير التحليل المالي للإدارة', name_en: 'Management Financial Analysis Report', description: 'ملخص تنفيذي ومؤشرات ومخاطر موجهة للإدارة',
    sections: [...COMMON_HEAD(), S('risks', 'risks', 'تقييم المخاطر', 'Risk assessment', 10), S('ratios', 'ratios', 'المؤشرات المالية الرئيسية', 'Key indicators', 11), S('variance', 'variance', 'أبرز التغيرات', 'Key changes', 12), S('ai_commentary', 'ai_commentary', 'التعليق التحليلي', 'Analytical commentary', 13), S('questions', 'questions', 'أسئلة للإدارة', 'Questions for management', 14), ...COMMON_TAIL()] },
  { code: 'ERRORS_ADJ', report_type: 'errors_and_adjustments', name_ar: 'تقرير الأخطاء المحاسبية والتسويات', name_en: 'Accounting Errors and Adjustments Report', description: 'الأخطاء المؤكدة والتسويات المقترحة بحالاتها',
    sections: [...COMMON_HEAD(), S('findings', 'findings', 'الأخطاء والمسائل المحاسبية', 'Errors and accounting issues', 10, true, { categories: ['math_error', 'accounting_issue'] }), S('adjustments', 'adjustments', 'سجل التسويات المقترحة', 'Proposed adjustments register', 11), ...COMMON_TAIL()] },
  { code: 'AR_AP', report_type: 'receivables_payables', name_ar: 'تقرير تحليل الذمم المدينة والدائنة', name_en: 'Receivables and Payables Analysis Report', description: 'أعمار الذمم والتركّز والمطابقة مع الأستاذ العام',
    sections: [...COMMON_HEAD(), S('aging_ar', 'aging', 'أعمار الذمم المدينة', 'Receivables aging', 10, true, { type: 'receivable' }), S('aging_ap', 'aging', 'أعمار الذمم الدائنة', 'Payables aging', 11, true, { type: 'payable' }), S('findings', 'findings', 'الملاحظات', 'Findings', 12, true, { rule_prefixes: ['AR-', 'AP-', 'SL-'] }), ...COMMON_TAIL()] },
  { code: 'CASH_LIQ', report_type: 'cash_flow_liquidity', name_ar: 'تقرير التدفقات النقدية والسيولة', name_en: 'Cash Flow and Liquidity Analysis Report', description: 'التدفقات النقدية ونسب السيولة',
    sections: [...COMMON_HEAD(), S('statements_cf', 'statements_cf', 'قائمة التدفقات النقدية', 'Statement of cash flows', 10), S('ratios', 'ratios', 'نسب السيولة والتدفق النقدي', 'Liquidity and cash flow ratios', 11, true, { groups: ['liquidity', 'cash_flow'] }), S('findings', 'findings', 'الملاحظات', 'Findings', 12, true, { rule_prefixes: ['FS-01', 'BANK-', 'TB-021'] }), ...COMMON_TAIL()] },
  { code: 'RATIOS', report_type: 'financial_ratios', name_ar: 'تقرير النسب المالية', name_en: 'Financial Ratios Report', description: 'كل النسب مع المعادلات والمدخلات',
    sections: [...COMMON_HEAD(), S('ratios', 'ratios', 'النسب المالية', 'Financial ratios', 10, true, { show_formulas: true }), ...COMMON_TAIL()] },
  { code: 'INVENTORY', report_type: 'inventory_analysis', name_ar: 'تقرير تحليل المخزون', name_en: 'Inventory Analysis Report', description: 'فحص سجل المخزون ومطابقته',
    sections: [...COMMON_HEAD(), S('inventory', 'inventory', 'تحليل المخزون', 'Inventory analysis', 10), S('findings', 'findings', 'الملاحظات', 'Findings', 11, true, { rule_prefixes: ['INV-', 'SL-'] }), ...COMMON_TAIL()] },
  { code: 'FIXED_ASSETS', report_type: 'fixed_assets_review', name_ar: 'تقرير مراجعة الأصول الثابتة والاستهلاك', name_en: 'Fixed Assets and Depreciation Review Report', description: 'سجل الأصول والاستهلاك ومطابقته',
    sections: [...COMMON_HEAD(), S('fixed_assets', 'fixed_assets', 'سجل الأصول الثابتة', 'Fixed assets register', 10), S('findings', 'findings', 'الملاحظات', 'Findings', 11, true, { rule_prefixes: ['FA-', 'SL-', 'TB-023'] }), ...COMMON_TAIL()] },
  { code: 'BANK_RECON', report_type: 'bank_reconciliation_exceptions', name_ar: 'تقرير استثناءات مطابقة البنك', name_en: 'Bank Reconciliation Exceptions Report', description: 'الحركات غير المطابقة بين كشف البنك والدفاتر',
    sections: [...COMMON_HEAD(), S('bank', 'bank', 'نتائج المطابقة البنكية', 'Bank reconciliation results', 10), S('findings', 'findings', 'الملاحظات', 'Findings', 11, true, { rule_prefixes: ['BANK-'] }), ...COMMON_TAIL()] },
  { code: 'VARIANCE', report_type: 'period_variance', name_ar: 'تقرير الفروقات بين الفترات', name_en: 'Period-to-Period Variance Report', description: 'مقارنة الفترة الحالية بالسابقة',
    sections: [...COMMON_HEAD(), S('variance', 'variance', 'تحليل الفروقات', 'Variance analysis', 10, true, { all_rows: true }), S('findings', 'findings', 'التغيرات الجوهرية', 'Material changes', 11, true, { rule_prefixes: ['TB-014', 'TB-015', 'VAR-'] }), ...COMMON_TAIL()] },
  { code: 'PRELIM', report_type: 'preliminary_findings', name_ar: 'تقرير النتائج الأولية والتوصيات', name_en: 'Preliminary Findings and Recommendations Report', description: 'كل الملاحظات مرتبة حسب الأهمية',
    sections: [...COMMON_HEAD(), S('tb_summary', 'tb_summary', 'ملخص الفحوصات', 'Checks summary', 10), S('findings', 'findings', 'الملاحظات مرتبة حسب الأهمية', 'Findings by materiality', 11), S('adjustments', 'adjustments', 'التسويات المقترحة', 'Proposed adjustments', 12), S('questions', 'questions', 'أسئلة للإدارة', 'Questions for management', 13), ...COMMON_TAIL()] },
  { code: 'MISSING_DOCS', report_type: 'missing_documents', name_ar: 'تقرير المستندات الناقصة واستفسارات المحاسب', name_en: 'Missing Documents and Accountant Queries Report', description: 'قائمة طلبات المستندات والاستفسارات',
    sections: [S('cover', 'cover', 'صفحة الغلاف', 'Cover', 1), S('intro', 'intro', 'مقدمة', 'Introduction', 2), S('documents_needed', 'documents_needed', 'المستندات المطلوبة', 'Documents required', 10), S('questions', 'questions', 'الاستفسارات', 'Queries', 11), S('findings', 'findings', 'البنود التي تتطلب مستندات', 'Items requiring support', 12, true, { categories: ['documents_required'] }), S('checklist', 'checklist', 'قائمة مراجعة المحاسب', 'Accountant checklist', 13), S('signatures', 'signatures', 'الإعداد والمراجعة', 'Preparer and reviewer', 90)] },
  { code: 'CUSTOM', report_type: 'custom', name_ar: 'تقرير مخصص (منشئ التقارير)', name_en: 'Custom Report Builder', description: 'يبدأ فارغًا ويضيف المحاسب الأقسام التي يريدها',
    sections: [S('cover', 'cover', 'صفحة الغلاف', 'Cover', 1), S('summary', 'summary', 'الملخص التنفيذي', 'Executive summary', 2), S('custom_1', 'custom_text', 'قسم نصي', 'Text section', 3), S('disclaimer', 'disclaimer', 'إخلاء المسؤولية', 'Disclaimer', 90), S('signatures', 'signatures', 'الإعداد والمراجعة', 'Preparer and reviewer', 91)] },
];

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  cover: 'صفحة الغلاف', intro: 'مقدمة', scope: 'النطاق والهدف', sources: 'مصادر البيانات', summary: 'ملخص تنفيذي', tb_summary: 'نتائج فحص الميزان', findings: 'الملاحظات', statements_sfp: 'قائمة المركز المالي',
  statements_pl: 'قائمة الربح أو الخسارة', statements_cf: 'قائمة التدفقات النقدية', statements_ce: 'التغيرات في حقوق الملكية', ratios: 'النسب المالية', variance: 'مقارنة الفترات', aging: 'أعمار الذمم', adjustments: 'التسويات',
  documents_needed: 'المستندات المطلوبة', questions: 'أسئلة للإدارة', ai_commentary: 'التعليق التحليلي', risks: 'تقييم المخاطر', recommendations: 'التوصيات', limitations: 'القيود', disclaimer: 'إخلاء المسؤولية', appendix_tb: 'ملحق الميزان',
  appendix_accounts: 'ملحق الحسابات', signatures: 'التوقيعات', custom_text: 'نص حر', consolidation: 'التوحيد الدفتري للمجموعة (ورقة العمل والقيود وسجل الفروق)', valuation_terms: 'شروط التقييم المتفق عليها في خطاب الارتباط', fixed_assets: 'الأصول الثابتة', inventory: 'المخزون', bank: 'المطابقة البنكية', checklist: 'قائمة مراجعة',
};
