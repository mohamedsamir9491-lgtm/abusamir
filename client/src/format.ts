export function fmtMoney(v: string | number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v); if (!Number.isFinite(n)) return String(v);
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return n < 0 ? `(${s})` : s;
}
export function fmtDate(iso: string | null | undefined, opts: { hijri?: boolean; time?: boolean } = {}): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso); if (isNaN(d.getTime())) return iso;
  const g = opts.time ? d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
  if (!opts.hijri) return g;
  try { return `${g} (${new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)})`; } catch { return g; }
}
export const SEVERITY: Record<string, string> = { critical: 'حرج', high: 'مرتفع', medium: 'متوسط', low: 'منخفض', info: 'للعلم' };
export const CATEGORY: Record<string, string> = { math_error: 'خطأ حسابي مؤكد', data_quality: 'جودة البيانات', accounting_issue: 'مسألة محاسبية', documents_required: 'يتطلب مستندات', judgment: 'حكم مهني', ai_observation: 'ملاحظة ذكية' };
export const REVIEW_STATUS: Record<string, string> = { open: 'مفتوحة', under_review: 'قيد المراجعة', accepted: 'مقبولة', rejected: 'مرفوضة', resolved: 'مُعالجة' };
export const ADJ_STATUS: Record<string, string> = { proposed: 'مقترحة', under_review: 'قيد المراجعة', approved: 'معتمدة', rejected: 'مرفوضة', posted: 'مرحّلة' };
export const REPORT_STATUS: Record<string, string> = { draft: 'مسودة', reviewed: 'تمت المراجعة', approved: 'معتمد للإصدار', issued: 'صادر' };
export const ENG_STATUS: Record<string, string> = { planning: 'تخطيط', data_collection: 'جمع البيانات', analysis: 'تحليل', review: 'مراجعة', reporting: 'إعداد التقارير', closed: 'مغلق' };
export const ENG_TYPE: Record<string, string> = { management_analysis: 'تحليل مالي إداري', valuation: 'تقييم شركة (قيمة سوقية/عادلة)', group_valuation: 'تقييم دفتري وتوحيد مجموعة', compilation: 'تجميع قوائم مالية', agreed_upon_review: 'مراجعة وفق إجراءات متفق عليها', bookkeeping: 'دعم محاسبي ومسك دفاتر', tax_analysis: 'تحليل ضريبي وزكوي', assurance_audit: 'ارتباط تأكيد / مراجعة مستقلة' };
export const FRAMEWORK: Record<string, string> = { ifrs: 'IFRS الكاملة', ifrs_smes: 'IFRS للمنشآت الصغيرة والمتوسطة', other: 'إطار آخر', unspecified: 'غير محدد' };
export const ENTITY: Record<string, string> = { llc: 'ذات مسؤولية محدودة', jsc: 'مساهمة', sole: 'مؤسسة فردية', partnership: 'تضامن/توصية', branch: 'فرع أجنبي', nonprofit: 'غير ربحية', other: 'أخرى' };
export const DOC_STATUS: Record<string, string> = { uploaded: 'مرفوع', processing: 'قيد المعالجة', imported: 'مستورد', rejected: 'مرفوض' };
export const IMPORT_STATUS: Record<string, string> = { created: 'منشأ', extracted: 'مستخرج', mapped: 'مربوط', validated: 'متحقق', committed: 'معتمد', failed: 'فشل', cancelled: 'ملغى' };
export const ROLE: Record<string, string> = { admin: 'مدير النظام', office_manager: 'مدير المكتب', accountant: 'محاسب', reviewer: 'مراجع', readonly: 'قراءة فقط' };
export const ACCOUNT_TYPE: Record<string, string> = { asset: 'أصول', liability: 'التزامات', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصاريف', other: 'أخرى' };
export const RUN_TYPE: Record<string, string> = { tb_validation: 'فحص ميزان المراجعة', statements: 'القوائم والنسب', journal: 'فحص اليومية', ai_analysis: 'تحليل ذكي', subledger_receivable: 'الذمم المدينة', subledger_payable: 'الذمم الدائنة', subledger_inventory: 'المخزون', subledger_fixed_asset: 'الأصول الثابتة', subledger_bank_transaction: 'المطابقة البنكية' };

export const DATA_TYPE: Record<string, string> = { trial_balance: 'ميزان المراجعة', general_ledger: 'دفتر الأستاذ العام', journal_entries: 'قيود اليومية', chart_of_accounts: 'دليل الحسابات', receivables: 'الذمم المدينة', payables: 'الذمم الدائنة', inventory: 'المخزون', fixed_assets: 'الأصول الثابتة', bank_statement: 'كشف حساب بنكي', financial_statements: 'قوائم مالية', contract: 'عقد', articles_of_association: 'عقد التأسيس / النظام الأساس', commercial_registration: 'السجل التجاري', invoice: 'فاتورة', other: 'أخرى', unknown: 'غير محدد' };
export const EXTRACT_METHOD: Record<string, string> = { xlsx: 'Excel', xls: 'Excel قديم', csv: 'CSV', json: 'JSON', 'pdf-tables': 'PDF (جدول معاد بناؤه)', 'pdf-text': 'PDF (نص)', ocr: 'تعرف ضوئي OCR', needs_ocr: 'يتطلب OCR', text: 'نص', manual: 'إدخال يدوي' };
