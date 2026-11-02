# المعمارية

## الطبقات
1. **الواجهة** (`client/`): React/TypeScript، RTL، تتصل بـ `/api` عبر كوكي جلسة HttpOnly.
2. **الخادم** (`server/src`):
   - `app.ts` / `index.ts`: Express، helmet، CORS، rate-limit على الدخول، خدمة الواجهة المبنية.
   - `middleware/`: المصادقة (JWT + جدول جلسات قابل للإبطال)، الصلاحيات (أدوار → صلاحيات من قاعدة البيانات)، سجل التدقيق، عزل النطاق (`scope.ts` يمنع خلط فترة/مستند عميل بآخر).
   - `engine/` **المحرك الحتمي** (بلا اعتماد على قاعدة البيانات، مختبر بالوحدة):
     - `money.ts` حساب عشري (decimal.js) وتطبيع الأرقام العربية/الأقواس/Dr-Cr.
     - `classification.ts` تصنيف استدلالي للحسابات (اسم + بادئة رمز) مع درجة ثقة.
     - `trialBalance.ts` قواعد TB-001..TB-023 (توازن، اتساق افتتاحي+حركات=ختامي، تكرار، أسماء ناقصة، أرصدة غير طبيعية، معلقة، تغيرات جوهرية، مخصص > ذمم، مجمع > تكلفة…).
     - `statements.ts` المركز المالي، الربح أو الخسارة، التغيرات في حقوق الملكية، التدفقات النقدية (غير مباشرة).
     - `ratios.ts` النسب مع المعادلة والمدخلات و"بيانات غير كافية".
     - `variance.ts`، `journal.ts` (JE-001..006 + REC)، `subledger.ts` (SL/AR/AP/FA/INV/BANK).
   - `modules/`: auth, users, office, clients, engagements, documents, imports (parsers + wizard), accounts, trialbalance, analysis (يربط المحرك بالقاعدة ويحفظ التشغيلات والملاحظات مع إزالة التكرار)، findings/adjustments، ai (طبقة مزوّد مستقلة + مخطط Zod + فحص الأرقام)، reports (قوالب → لقطة بيانات → محتوى أقسام → HTML → PDF/Excel)، audit، system (سياسات، نسخ احتياطي، طلبات حذف)، dashboard.
3. **قاعدة البيانات**: PostgreSQL، هجرات SQL في `server/src/db/migrations`، مفاتيح أجنبية وفهارس، `NUMERIC(20,4)` للمبالغ.
4. **Python** (اختياري): استخراج جداول PDF النصي و`.xls`. عند غيابه تُعرض رسالة واضحة. OCR غير مضمّن (يتطلب tesseract + حزمة عربية).

## تدفق البيانات
رفع ملف → `stored_files` (مشفر اختياريًا) + `source_documents` → `import_jobs` (استخراج → صفوف خام في `imported_records` → ربط أعمدة → تحقق مع تقرير → اعتماد بتأكيد صريح) → جداول هدف (`trial_balance_entries`, `journal_entries/lines`, `subledger_records`, `chart_of_accounts`) → `analysis_runs` + `findings` (مرجع F-xxxx، مصدر، صف، احتساب) → `financial_statements` (حزمة قوائم+نسب+فروقات) → `generated_reports` + `report_versions` (محتوى + لقطة بيانات لإعادة الإنتاج) → PDF/Excel في `stored_files` → `audit_logs` في كل خطوة.

## الذكاء الاصطناعي
`modules/ai/provider.ts`: واجهة `AiProvider` مع مزوّدين (`none`، `anthropic` عبر SDK الرسمي ومخرجات منظمة). الإرسال يتطلب ثلاث بوابات: `AI_PROVIDER` + `AI_ALLOW_EXTERNAL` في الخادم + سياسة النظام `ai_policy.allow_external` + تأكيد المستخدم في كل طلب. أسماء العملاء تُخفى افتراضيًا. كل رقم في المخرجات يُقارن بمجموعة أرقام المدخلات ويُعلَّم غير المتحقق منه.

## توليد PDF
HTML عربي (خطوط Noto Naskh Arabic/Cairo مضمّنة base64) → Chromium عبر Playwright → A4 مع ترويسة/تذييل ثابتين يتكرران بكل صفحة (أسلوب الجدول الغلافي)، رؤوس الجداول تتكرر عبر الصفحات، ترقيم "صفحة X من Y" عبر قالب التذييل.
