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
export const ENG_TYPE: Record<string, string> = { management_analysis: 'تحليل مالي إداري', valuation: 'تقييم شركة (قيمة سوقية/عادلة)', group_valuation: 'تقييم دفتري وتوحيد مجموعة', compilation: 'تجميع قوائم مالية', agreed_upon_review: 'إجراءات متفق عليها (ISRS 4400)', bookkeeping: 'دعم محاسبي ومسك دفاتر', tax_analysis: 'تحليل ضريبي وزكوي', assurance_audit: 'مراجعة القوائم المالية (ISA)' };
export const FRAMEWORK: Record<string, string> = { ifrs: 'IFRS الكاملة', ifrs_smes: 'IFRS للمنشآت الصغيرة والمتوسطة', other: 'إطار آخر', unspecified: 'غير محدد' };
export const ENTITY: Record<string, string> = { llc: 'ذات مسؤولية محدودة', jsc: 'مساهمة', sole: 'مؤسسة فردية', partnership: 'تضامن/توصية', branch: 'فرع أجنبي', nonprofit: 'غير ربحية', other: 'أخرى' };
export const DOC_STATUS: Record<string, string> = { uploaded: 'مرفوع', processing: 'قيد المعالجة', imported: 'مستورد', rejected: 'مرفوض' };
export const IMPORT_STATUS: Record<string, string> = { created: 'منشأ', extracted: 'مستخرج', mapped: 'مربوط', validated: 'متحقق', committed: 'معتمد', failed: 'فشل', cancelled: 'ملغى' };
export const ROLE: Record<string, string> = { admin: 'مدير النظام', office_manager: 'مدير المكتب', accountant: 'محاسب', reviewer: 'مراجع', readonly: 'قراءة فقط' };
export const ACCOUNT_TYPE: Record<string, string> = { asset: 'أصول', liability: 'التزامات', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصاريف', other: 'أخرى' };
export const RUN_TYPE: Record<string, string> = { tb_validation: 'فحص ميزان المراجعة', statements: 'القوائم والنسب', journal: 'فحص اليومية', ai_analysis: 'تحليل ذكي', subledger_receivable: 'الذمم المدينة', subledger_payable: 'الذمم الدائنة', subledger_inventory: 'المخزون', subledger_fixed_asset: 'الأصول الثابتة', subledger_bank_transaction: 'المطابقة البنكية' };

export const DATA_TYPE: Record<string, string> = { trial_balance: 'ميزان المراجعة', general_ledger: 'دفتر الأستاذ العام', journal_entries: 'قيود اليومية', chart_of_accounts: 'دليل الحسابات', receivables: 'الذمم المدينة', payables: 'الذمم الدائنة', inventory: 'المخزون', fixed_assets: 'الأصول الثابتة', bank_statement: 'كشف حساب بنكي', financial_statements: 'قوائم مالية', contract: 'عقد', articles_of_association: 'عقد التأسيس / النظام الأساس', commercial_registration: 'السجل التجاري', zakat_certificate: 'شهادة الزكاة', vat_certificate: 'شهادة ضريبة القيمة المضافة', municipal_license: 'رخصة البلدية', partners_resolution: 'قرار شركاء / جمعية', invoice: 'فاتورة', other: 'أخرى', unknown: 'غير محدد' };
export const EXTRACT_METHOD: Record<string, string> = { xlsx: 'Excel', xls: 'Excel قديم', csv: 'CSV', json: 'JSON', 'pdf-tables': 'PDF (جدول معاد بناؤه)', 'pdf-text': 'PDF (نص)', ocr: 'تعرف ضوئي OCR', needs_ocr: 'يتطلب OCR', text: 'نص', manual: 'إدخال يدوي' };

/** المستندات النظامية: تُستخرج بياناتها من شاشة «البيانات النظامية» ولا تُستورد كبيانات محاسبية */
export const OFFICIAL_TYPES = ['articles_of_association', 'commercial_registration', 'zakat_certificate', 'vat_certificate', 'municipal_license', 'partners_resolution', 'contract'];

/** أسماء الإجراءات المسجلة في سجل التدقيق بالعربية */
export const ACTION_LABELS: Record<string, string> = {
  'account.updated': 'تعديل حساب', 'account.upserted': 'حفظ حساب', 'accounts.auto_classified': 'تصنيف آلي للحسابات', 'adjustment.deleted': 'حذف تسوية', 'adjustment.proposed': 'اقتراح تسوية', 'adjustment.status_changed': 'تغيير حالة تسوية', 'adjustment.updated': 'تعديل تسوية',
  'ai.analysis_completed': 'تحليل المزوّد الخارجي', 'ai.analysis_requested': 'طلب تحليل خارجي', 'ai.chat': 'محادثة المحاسب الذكي', 'ai.assistant': 'سؤال لمساعد سهم', 'ai.local_analysis': 'تحليل محلي', 'ai.section_drafted': 'صياغة قسم',
  'analysis.group_consolidation': 'توحيد دفتري', 'analysis.journal': 'تحليل اليومية', 'analysis.statements': 'توليد القوائم', 'analysis.tb_validation': 'فحص الميزان', 'analysis_run.deleted': 'حذف تشغيل تحليل',
  'auth.login': 'تسجيل دخول', 'auth.login_failed': 'محاولة دخول فاشلة', 'auth.logout': 'تسجيل خروج', 'auth.password_changed': 'تغيير كلمة المرور',
  'client.archived': 'أرشفة عميل', 'client.created': 'عميل جديد', 'client.purged': 'حذف عميل نهائيًا', 'client.updated': 'تعديل عميل', 'data.deletion_requested': 'طلب حذف بيانات',
  'document.deleted': 'حذف مستند', 'document.downloaded': 'تنزيل مستند', 'document.moved': 'نقل مستند', 'document.updated': 'تعديل مستند', 'document.uploaded': 'رفع مستند',
  'engagement.created': 'ارتباط جديد', 'engagement.deleted': 'حذف ارتباط', 'engagement.rolled_forward': 'ارتباط السنة التالية', 'engagement.updated': 'تعديل ارتباط', 'engagement_letter.create': 'خطاب ارتباط', 'engagement_letter.update': 'تحديث خطاب', 'engagement_letter.deleted': 'حذف خطاب', 'engagement_letter.pdf': 'طباعة خطاب',
  'finding.commented': 'تعليق على ملاحظة', 'finding.created': 'ملاحظة جديدة', 'finding.deleted': 'حذف ملاحظة', 'finding.status_changed': 'تغيير حالة ملاحظة', 'finding.updated': 'تعديل ملاحظة',
  'group.company_added': 'إضافة شركة للمجموعة', 'group.company_removed': 'إزالة شركة من المجموعة', 'group.company_updated': 'تعديل شركة في المجموعة',
  'import.cancelled': 'إلغاء استيراد', 'import.committed': 'اعتماد استيراد', 'import.created': 'استيراد جديد', 'import.deleted': 'حذف استيراد', 'import.manual_entry': 'إدخال يدوي', 'import.mapped': 'ربط الأعمدة', 'import.validated': 'التحقق من الاستيراد',
  'office.settings_updated': 'تعديل هوية المكتب', 'official.confirmed': 'اعتماد بيانات نظامية', 'official.extracted': 'استخراج بيانات نظامية', 'period.created': 'فترة جديدة', 'period.deleted': 'حذف فترة',
  'report.commented': 'تعليق على تقرير', 'report.content_updated': 'تعديل تقرير', 'report.created': 'تقرير جديد', 'report.delete': 'حذف تقرير', 'report.exported_pdf': 'تصدير PDF', 'report.exported_xlsx': 'تصدير Excel', 'report.file_downloaded': 'تنزيل تقرير', 'report.regenerated': 'إعادة توليد تقرير',
  'request.created': 'طلب عميل يدوي', 'request.deleted': 'استبعاد طلب', 'request.updated': 'تحديث طلب', 'requests.exported': 'تصدير الطلبات', 'requests.refreshed': 'تحديث طلبات العميل', 'requests.status': 'تحديث حالة الطلبات',
  'shareholders.saved': 'حفظ سجل المساهمين', 'valuation.saved': 'حفظ تعديلات التقييم', 'valuation.approved': 'اعتماد تعديلات التقييم', 'valuation.reopened': 'إعادة فتح التقييم',
  'system.backup_created': 'نسخة احتياطية', 'system.backup_verified': 'التحقق من نسخة احتياطية', 'system.cleanup': 'تنظيف بيانات', 'system.setting_updated': 'تعديل إعدادات النظام',
  'letter.issue': 'إصدار خطاب', 'letter.sent': 'إرسال خطاب للعميل', 'letter.signed': 'توقيع العميل على الخطاب', 'letter.close': 'إقفال ارتباط', 'letter.cancel': 'إلغاء خطاب', 'letter.reopen': 'إعادة فتح خطاب', 'fees.schedule_generated': 'إنشاء جدول الأتعاب',
  'claim.issued': 'إصدار مطالبة أتعاب', 'claim.updated': 'تعديل مطالبة', 'claim.cancelled': 'إلغاء مطالبة', 'payment.recorded': 'تسجيل تحصيل', 'payment.deleted': 'حذف تحصيل', 'task.created': 'مهمة جديدة',
  'template.created': 'قالب جديد', 'template.deleted': 'حذف قالب', 'template.updated': 'تعديل قالب', 'user.created': 'مستخدم جديد', 'user.updated': 'تعديل مستخدم',
};

/** عدّ بالعربية مع مطابقة المعدود: 1 عميلًا واحدًا، 2 عميلين، 3-10 عملاء، 11+ عميلًا */
export function countAr(n: number, w: { one: string; two: string; few: string; many: string }): string {
  if (n === 0) return `لا ${w.few}`; if (n === 1) return w.one; if (n === 2) return w.two; const m = n % 100; return `${n} ${m >= 3 && m <= 10 ? w.few : w.many}`;
}
