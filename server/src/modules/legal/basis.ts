/** الأساس النظامي لكل ملاحظة يصدرها البرنامج (rule_code ← المصدر والمادة/الفقرة ومقتطف من النص).
 *  المقتطفات منسوخة من نصوص المكتبة النظامية نفسها (المعايير بنصها الكامل 2026 والمعتمد في المملكة، والأنظمة من هيئة الخبراء)،
 *  وتُولَّد بأداة tools/rules/basis_find.py. «حسابي» = فحص على البيانات لا يحتاج سندًا. العتبات الرقمية اجتهاد المكتب ويُذكر ذلك. */
export interface BasisItem { source: string; ref: string; quote?: string; lang?: 'ar' | 'en'; source_code?: string }
export interface RuleBasis { kind: 'سند' | 'حسابي'; items: BasisItem[]; note?: string; threshold?: string }
export const RULE_BASIS: Record<string, RuleBasis> = {
 "AP-001": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 520 (ISA 520): الإجراءات التحليلية",
    "ref": "صفحة 3–4",
    "quote": "المالية. وتشمل الإجراءات التحليلية أيضاً التحري الضروري عن التقلبات أو العلاقات التي يتم التعرف علها والتي لا تتسق مع المعلومات الأخرى ذات الصلة أو تختلف عن القيم المتوقعة بمبلغ كبير. (راجع: الفقرة أ١1-أ؟) المتطلبات الإجراءات التحليلية الأساس يجب على المراجع:",
    "lang": "ar",
    "source_code": "c77b4c7e3389"
   }
  ],
  "threshold": "العتبة (تقادم أكثر من 90 يومًا) اجتهاد المكتب وليست نصًا في المعيار."
 },
 "AP-002": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "AP-003": {
  "kind": "سند",
  "items": [
   {
    "source": "IFRS 7 الأدوات المالية: الإفصاحات (Financial Instruments Disclosures) — النص الكامل 2026",
    "ref": "الفقرة 34(ج)",
    "quote": "(c) concentrations of risk if not apparent from the disclosures made in accordance with (a) and (b).",
    "lang": "en",
    "source_code": "cf66c0f01f5c"
   }
  ],
  "threshold": "العتبة (طرف يمثل 40% أو أكثر) اجتهاد المكتب وليست نصًا في المعيار."
 },
 "AP-004": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "AR-001": {
  "kind": "سند",
  "items": [
   {
    "source": "IFRS 9 الأدوات المالية (Financial Instruments) — النص الكامل 2026",
    "ref": "الفقرة 5.5.11",
    "quote": "5.5.11 If reasonable and supportable forward-looking information is available without undue cost or effort, an entity cannot rely solely on past due information when determining whether credit risk has increased significantly since initial recognition. However, when information that is more fo",
    "lang": "en",
    "source_code": "bc28d4e21f7a"
   }
  ],
  "threshold": "العتبة (تقادم أكثر من 90 يومًا) اجتهاد المكتب وليست نصًا في المعيار."
 },
 "AR-002": {
  "kind": "سند",
  "items": [
   {
    "source": "IFRS 9 الأدوات المالية (Financial Instruments) — النص الكامل 2026",
    "ref": "الفقرة 5.5.1",
    "quote": "5.5.1 An entity shall recognise a loss allowance for expected credit losses on a financial asset that is measured in accordance with paragraphs 4.1.2 or 4.1.2A, a lease receivable, a contract asset or a loan commitment and a financial guarantee contract to which the impairment",
    "lang": "en",
    "source_code": "bc28d4e21f7a"
   }
  ]
 },
 "AR-003": {
  "kind": "سند",
  "items": [
   {
    "source": "IFRS 7 الأدوات المالية: الإفصاحات (Financial Instruments Disclosures) — النص الكامل 2026",
    "ref": "الفقرة 34(ج)",
    "quote": "(c) concentrations of risk if not apparent from the disclosures made in accordance with (a) and (b).",
    "lang": "en",
    "source_code": "cf66c0f01f5c"
   }
  ],
  "threshold": "العتبة (طرف يمثل 40% أو أكثر) اجتهاد المكتب وليست نصًا في المعيار."
 },
 "AR-004": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "BANK-000": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "BANK-001": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "BANK-002": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "BANK-003": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "DOC-001": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 1 عرض القوائم المالية — المعتمد في المملكة (الهيئة السعودية للمراجعين والمحاسبين 2026)",
    "ref": "الفقرة 79",
    "quote": "لكل فئة من فئات رأس المال المساهم به: )0( عدد الأسهم المصرح the 0( عدد الأسهم المصدرة والمدفوعة بالكامل. والمصدرة التي لم تدفع بالكامل؛ ليه القيمة الاسمية للسهمء أوبيان أن الأسهم ليست لبا قيمة اس",
    "lang": "ar",
    "source_code": "f1859195dc31"
   }
  ]
 },
 "DOC-002": {
  "kind": "سند",
  "items": [
   {
    "source": "نظام الشركات — النص الموحد من هيئة الخبراء",
    "ref": "المادة التاسعة والخمسون",
    "quote": "يجب ألا يقلّ رأس مال شركة المساهمة المصدر عن (خمسمائة ألف) ريال، ويجب ألا يقلّ المدفوع منه عند التأسيس عن (الربع).",
    "lang": "ar",
    "source_code": "4b0e4b4d0bd0"
   }
  ]
 },
 "DOC-003": {
  "kind": "سند",
  "items": [
   {
    "source": "IFRS 10 القوائم المالية الموحدة (Consolidated Financial Statements) — النص الكامل 2026",
    "ref": "الفقرة B86",
    "quote": "B86 Consolidated financial statements: (a) combine like items of assets, liabilities, equity, income, expenses and cash flows of the parent with those of its subsidiaries.",
    "lang": "en",
    "source_code": "95e9e1d749b4"
   }
  ]
 },
 "DOC-004": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 500 (ISA 500): أدلة المراجعة",
    "ref": "صفحة 10–11",
    "quote": "لأمور التي تمت مناقشتها). ٠. تكون أدلة المراجعة التي توفرها المستندات الأصلية el في إمكانية الاعتماد علها من أدلة المراجعة التي توفرها النسخ الضوئية أو النسخ المرسلة بالفاكس.ء أو المستندات التي تم تصويرها أو رقمنتها أو المحولة بأية صورة أخرى إلى شكل إلكترون",
    "lang": "ar",
    "source_code": "4b3c670989e2"
   }
  ]
 },
 "DOC-005": {
  "kind": "سند",
  "items": [
   {
    "source": "نظام السجل التجاري — النص الموحد من هيئة الخبراء",
    "ref": "المادة الحادية عشرة",
    "quote": "يجب على التاجر أن يقدم سنويًّا إلى المسجل تأكيدًا للبيانات المقيدة في السجل التجاري، وذلك وفقًا لما تحدده اللائحة.",
    "lang": "ar",
    "source_code": "77cf2fd0d8c1"
   },
   {
    "source": "نظام السجل التجاري — النص الموحد من هيئة الخبراء",
    "ref": "المادة الخامسة عشرة",
    "quote": "يُعلق المسجل قيد التاجر إذا لم يقدم التأكيد السنوي خلال (تسعين) يومًا من تاريخ استحقاقه. يتعين على المسجل، قبل إجراء التعليق وفقًا للفقرة (1) من هذه المادة، إنذار التاجر بأنه سيُعلَّق قيده بعد (أربعة عشر) يومًا من تاريخ الإنذار. وفي حال انقضت المدة دون تقديم التاجر التأكيد السنوي، يُشعر التاجر بقرار تعليق قيده. يقيد المسجل قرار تعليق القيد في السجل التجاري، ويترتب على ذلك تعليق جميع التراخيص الصادرة للقيد المعلق، وتبين اللائحة الآثار الأخرى المترتبة على قرار تعليق القيد.يُعلق القيد في السجل التجاري لمدة (سنة). وعلى المسجل رفع التعليق عن قيد التاجر إذا تقدم خلال هذه المدة بطلب رفعه مع تقديم الت…",
    "lang": "ar",
    "source_code": "77cf2fd0d8c1"
   }
  ]
 },
 "DOC-006": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "DOC-007": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "DOC-008": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "DOC-009": {
  "kind": "سند",
  "items": [
   {
    "source": "IFRS 10 القوائم المالية الموحدة (Consolidated Financial Statements) — النص الكامل 2026",
    "ref": "الفقرة B89",
    "quote": "B89 When potential voting rights, or other derivatives containing potential voting rights, exist, the proportion of profit or loss and changes in equity allocated to the parent and non-controlling interests in preparing consolidated financial statements is deter",
    "lang": "en",
    "source_code": "95e9e1d749b4"
   }
  ]
 },
 "FA-001": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 16 الممتلكات والآلات والمعدات (Property Plant And Equipment) — النص الكامل 2026",
    "ref": "الفقرة 6",
    "quote": "Carrying amount is the amount at which an asset is recognised after deducting any accumulated depreciation and accumulated impairment losses. Cost is the amount of cash or cash equivalents paid or the fair value of the other consideration given to acquire an asset at the time of its acquisition or construction or, where applicable, th",
    "lang": "en",
    "source_code": "817459cfadf3"
   }
  ]
 },
 "FA-002": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 16 الممتلكات والآلات والمعدات (Property Plant And Equipment) — النص الكامل 2026",
    "ref": "الفقرة 50",
    "quote": "50 The depreciable amount of an asset shall be allocated on a systematic basis over its useful life. 51 The residual value and the useful life of an asset shall be reviewed at least at each financial year-end and, if expectations differ from previous estimates, the change(s) shall be a",
    "lang": "en",
    "source_code": "817459cfadf3"
   }
  ]
 },
 "FA-003": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 16 الممتلكات والآلات والمعدات (Property Plant And Equipment) — النص الكامل 2026",
    "ref": "الفقرة 50",
    "quote": "50 The depreciable amount of an asset shall be allocated on a systematic basis over its useful life. 51 The residual value and the useful life of an asset shall be reviewed at least at each financial year-end and, if expectations differ from previous estimates, the change(s) shall be a",
    "lang": "en",
    "source_code": "817459cfadf3"
   }
  ]
 },
 "FA-004": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 16 الممتلكات والآلات والمعدات (Property Plant And Equipment) — النص الكامل 2026",
    "ref": "الفقرة 60",
    "quote": "60 The depreciation method used shall reflect the pattern in which the asset’s future economic benefits are expected to be consumed by the entity. 61 The depreciation method applied to an asset shall be reviewed at least at each financial year-end and, if there has been a si",
    "lang": "en",
    "source_code": "817459cfadf3"
   }
  ]
 },
 "FS-001": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "FS-002": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 7 قائمة التدفقات النقدية (Statement Of Cash Flows) — النص الكامل 2026",
    "ref": "الفقرة 45",
    "quote": "45 An entity shall disclose the components of cash and cash equivalents and shall present a reconciliation of the amounts in its statement of cash flows with the equivalent items reported in the statement of financial position. 46 In view of the variety of cash management practic",
    "lang": "en",
    "source_code": "a9fd6b4a1fab"
   }
  ]
 },
 "FS-010": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 570 (ISA 570): الاستمرارية — المحدَّث (يسري على الفترات التي تبدأ في 15 ديسمبر 2026 أو بعده)",
    "ref": "صفحة 14–15",
    "quote": "البقاء كمنشأة مستمرة. وهذه الأمثلة ليست شاملة. مالية e وجود مركز صافٍ بالالتزامات أو الالتزامات المتداولة. e اقتراب القروض محددة الأجل من موعد استحقاقها دون وجود فرص واقعية للتجديد أو للسداد؛ أو الاعتماد المفرط على الاقتراض قصير الأجل لتمويل الأصول طويلة الأجل.",
    "lang": "ar",
    "source_code": "8ae7774e3dce"
   }
  ],
  "threshold": "العتبة (نسبة التداول أقل من 1) اجتهاد المكتب وليست نصًا في المعيار."
 },
 "FS-011": {
  "kind": "سند",
  "items": [
   {
    "source": "نظام الشركات — النص الموحد من هيئة الخبراء",
    "ref": "المادة الثانية والثلاثون بعد المائة",
    "quote": "إذا بلغت خسائر شركة المساهمة (نصف) رأس المال المصدر، وجب على مجلس الإدارة الإفصاح عن ذلك وعما توصل إليه من توصيات بشأن تلك الخسائر خلال (ستين) يومًا من تاريخ علمه ببلوغها هذا المقدار، ودعوة الجمعية العامة غير العادية إلى الاجتماع خلال (مائة وثمانين) يومًا من تاريخ العلم بذلك للنظر في استمرار الشركة مع اتخاذ أي من الإجراءات اللازمة لمعالجة تلك الخسائر، أو حلّها.",
    "lang": "ar",
    "source_code": "4b0e4b4d0bd0"
   },
   {
    "source": "نظام الشركات — النص الموحد من هيئة الخبراء",
    "ref": "المادة الثانية والثمانون بعد المائة",
    "quote": "إذا بلغت خسائر الشركة نصف رأس مالها، وجب على مدير الشركة دعوة الجمعية العامة للشركاء إلى الاجتماع خلال (ستين) يومًا من تاريخ العلم ببلوغ الخسارة هذا المقدار للنظر في استمرار الشركة مع اتخاذ أي من الإجراءات اللازمة لمعالجة تلك الخسائر، أو حلها.",
    "lang": "ar",
    "source_code": "4b0e4b4d0bd0"
   },
   {
    "source": "معيار المراجعة 570 (ISA 570): الاستمرارية — المحدَّث (يسري على الفترات التي تبدأ في 15 ديسمبر 2026 أو بعده)",
    "ref": "صفحة 14–15",
    "quote": "البقاء كمنشأة مستمرة. وهذه الأمثلة ليست شاملة. مالية e وجود مركز صافٍ بالالتزامات أو الالتزامات المتداولة. e اقتراب القروض محددة الأجل من موعد استحقاقها دون وجود فرص واقعية للتجديد أو للسداد؛ أو الاعتماد المفرط على الاقتراض قصير الأجل لتمويل الأصول طويلة الأجل.",
    "lang": "ar",
    "source_code": "8ae7774e3dce"
   }
  ]
 },
 "FS-012": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 570 (ISA 570): الاستمرارية",
    "ref": "صفحة 8–9",
    "quote": "ريخية أو المستقبلية. . المعدلات المالية الرئيسية السلبية. . الخسائر التشغيلية الجوهرية أو التدهور الكبير في قيمة الأصول المستخدمة لتوليد التدفقات النقدية. . التأخر في توزيعات الأرباح أو توقفها. . عدم القدرة على السداد للدائنين في تواريخ الاستحقاق. . عدم القدرة على ا",
    "lang": "ar",
    "source_code": "4c6face0b587"
   }
  ]
 },
 "FS-013": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 570 (ISA 570): الاستمرارية",
    "ref": "صفحة 8–9",
    "quote": "جل. . المؤشرات على سحب الدعم المالي من قبل الدائنين. . وجود تدفقات نقدية تشغيلية سالبة تشير إلمها القوائم المالية التاريخية أو المستقبلية. . المعدلات المالية الرئيسية السلبية. . الخسائر التشغيلية الجوهرية أو التدهور الكبير في قيمة الأصول المستخدمة لتوليد التدفقات ال",
    "lang": "ar",
    "source_code": "4c6face0b587"
   }
  ],
  "threshold": "العتبة (التدفق التشغيلي أقل من نصف الربح) اجتهاد المكتب وليست نصًا في المعيار."
 },
 "FS-014": {
  "kind": "سند",
  "items": [
   {
    "source": "IFRS 9 الأدوات المالية (Financial Instruments) — النص الكامل 2026",
    "ref": "الفقرة 5.5.1",
    "quote": "5.5.1 An entity shall recognise a loss allowance for expected credit losses on a financial asset that is measured in accordance with paragraphs 4.1.2 or 4.1.2A, a lease receivable, a contract asset or a loan commitment and a financial guarantee contract to which the impairment",
    "lang": "en",
    "source_code": "bc28d4e21f7a"
   }
  ],
  "threshold": "العتبة (فترة تحصيل تتجاوز 120 يومًا) اجتهاد المكتب وليست نصًا في المعيار."
 },
 "INV-001": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "INV-002": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 2 المخزون (Inventories) — النص الكامل 2026",
    "ref": "الفقرة 9",
    "quote": "9 Inventories shall be measured at the lower of cost and net realisable value.",
    "lang": "en",
    "source_code": "4dbbdccba231"
   }
  ]
 },
 "INV-003": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 2 المخزون (Inventories) — النص الكامل 2026",
    "ref": "الفقرة 9",
    "quote": "9 Inventories shall be measured at the lower of cost and net realisable value.",
    "lang": "en",
    "source_code": "4dbbdccba231"
   }
  ]
 },
 "JE-001": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "JE-002": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "JE-003": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "JE-004": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "JE-005": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "JE-006": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "LA-001": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 16 الممتلكات والآلات والمعدات (Property Plant And Equipment) — النص الكامل 2026",
    "ref": "الفقرة 55",
    "quote": "55 Depreciation of an asset begins when it is available for use, ie when it is in the location and condition necessary for it to be capable of operating in the manner intended by management. Depreciation of an asset ceases at the earlier of the date that the asset",
    "lang": "en",
    "source_code": "817459cfadf3"
   }
  ]
 },
 "LA-002": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 38 الأصول غير الملموسة (Intangible Assets) — النص الكامل 2026",
    "ref": "الفقرة 97",
    "quote": "97 The depreciable amount of an intangible asset with a finite useful life shall be allocated on a systematic basis over its useful life. Amortisation shall begin when the asset is available for use, ie when it is in the location and condition necessary for it to be capable of operating in the manner in",
    "lang": "en",
    "source_code": "a11a320786d3"
   }
  ]
 },
 "LA-003": {
  "kind": "سند",
  "items": [
   {
    "source": "IFRS 16 عقود الإيجار (Leases) — النص الكامل 2026",
    "ref": "الفقرة 31",
    "quote": "31 A lessee shall apply the depreciation requirements in IAS 16 Property, Plant and Equipment in depreciating the right-of-use asset, subject to the requirements in paragraph 32. A850 © IFRS Foundation 32 If the lease transfers ownership of the underlying asset to the lessee by the",
    "lang": "en",
    "source_code": "f0cc0dfe7166"
   }
  ]
 },
 "LA-004": {
  "kind": "سند",
  "items": [
   {
    "source": "IFRS 16 عقود الإيجار (Leases) — النص الكامل 2026",
    "ref": "الفقرة 36",
    "quote": "36 After the commencement date, a lessee shall measure the lease liability by: (a) increasing the carrying amount to reflect interest on the lease liability; (b) reducing the carrying amount to reflect the lease payments made; and (c) remeasuring the carrying amount to reflect any reassessment or lease",
    "lang": "en",
    "source_code": "f0cc0dfe7166"
   }
  ],
  "threshold": "العتبة (فائدة أقل من 0.2% من الالتزام) اجتهاد المكتب وليست نصًا في المعيار."
 },
 "LA-005": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 19 منافع الموظفين (Employee Benefits) — النص الكامل 2026",
    "ref": "الفقرة 11",
    "quote": "11 When an employee has rendered service to an entity during an accounting period, the entity shall recognise the undiscounted amount of short-term employee benefits expected to be paid in exchange for that service: (a) as a liability (accrued expense), after deducting",
    "lang": "en",
    "source_code": "4e8c2cb0192e"
   }
  ]
 },
 "LA-006": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 19 منافع الموظفين (Employee Benefits) — النص الكامل 2026",
    "ref": "الفقرة 67",
    "quote": "67 An entity shall use the projected unit credit method to determine the present value of its defined benefit obligations and the related current service cost and, where applicable, past service cost. 68 The projected unit credit method (sometimes known as the accrued benefit method p",
    "lang": "en",
    "source_code": "4e8c2cb0192e"
   }
  ]
 },
 "LA-007": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 520 (ISA 520): الإجراءات التحليلية",
    "ref": "صفحة 3–4",
    "quote": "المالية. وتشمل الإجراءات التحليلية أيضاً التحري الضروري عن التقلبات أو العلاقات التي يتم التعرف علها والتي لا تتسق مع المعلومات الأخرى ذات الصلة أو تختلف عن القيم المتوقعة بمبلغ كبير. (راجع: الفقرة أ١1-أ؟) المتطلبات الإجراءات التحليلية الأساس يجب على المراجع:",
    "lang": "ar",
    "source_code": "c77b4c7e3389"
   }
  ],
  "threshold": "العتبة (بند يتجاوز نسبة مرتفعة من المصروفات) اجتهاد المكتب وليست نصًا في المعيار."
 },
 "LA-008": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 24 الإفصاحات عن الأطراف ذات العلاقة (Related Party Disclosures) — النص الكامل 2026",
    "ref": "الفقرة 18",
    "quote": "18 If an entity has had related party transactions during the periods covered by the financial statements, it shall disclose the nature of the related party relationship as well as information about those transactions and outstanding balances, including commitments, necessary for",
    "lang": "en",
    "source_code": "a617928af04d"
   }
  ],
  "threshold": "العتبة (20% و40% من الأصول) اجتهاد المكتب وليست نصًا في المعيار."
 },
 "LA-009": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 570 (ISA 570): الاستمرارية",
    "ref": "صفحة 4",
    "quote": "ت إجراءات تقييم المخاطر والأنشطة المتعلقة بها إذا كانت هناك أحداث أو ظروف قد تثير شكوكاً كبيرة حول قدرة المنشأة على البقاء كمنشأة مستمرة. وعند القيام بذلك. يجب على المراجع أن يحدد ما إذا كانت الإدارة قد أجرت بالفعل تقييماً مبدئياً لقدرة المنشأة على البقاء كمنشأة مستمرة؛ ومن",
    "lang": "ar",
    "source_code": "4c6face0b587"
   }
  ]
 },
 "LA-010": {
  "kind": "سند",
  "items": [
   {
    "source": "IFRS 15 الإيراد من العقود مع العملاء (Revenue From Contracts With Customers) — النص الكامل 2026",
    "ref": "الفقرة 106",
    "quote": "106 If a customer pays consideration, or an entity has a right to an amount of consideration that is unconditional (ie a receivable), before the entity transfers a good or service to the customer, the entity shall present the contract as a contract liability when th",
    "lang": "en",
    "source_code": "d9b895b3387c"
   }
  ],
  "threshold": "العتبة (30% من إيراد الفترة) اجتهاد المكتب وليست نصًا في المعيار."
 },
 "REC-001": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 500 (ISA 500): أدلة المراجعة",
    "ref": "صفحة 3",
    "quote": "الاستنتاجات التي يستند إلها رأيه. وتشمل أدلة المراجعة WS من المعلومات الواردة في السجلات المحاسبية التي تستند إليها القوائم المالية والمعلومات المتحصل ple من مصادر أخرى.",
    "lang": "ar",
    "source_code": "4b3c670989e2"
   }
  ]
 },
 "REC-002": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "SL-000": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "SL-001": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 500 (ISA 500): أدلة المراجعة",
    "ref": "صفحة 3",
    "quote": "الاستنتاجات التي يستند إلها رأيه. وتشمل أدلة المراجعة WS من المعلومات الواردة في السجلات المحاسبية التي تستند إليها القوائم المالية والمعلومات المتحصل ple من مصادر أخرى.",
    "lang": "ar",
    "source_code": "4b3c670989e2"
   }
  ]
 },
 "TB-001": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "TB-002": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "TB-003": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "TB-004": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "TB-005": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "TB-006": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "TB-007": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "TB-008": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "TB-009": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 1 عرض القوائم المالية — المعتمد في المملكة (الهيئة السعودية للمراجعين والمحاسبين 2026)",
    "ref": "الفقرة 66",
    "quote": "يجب على المنشأة تصنيف الأصل على أنه متداول عندما: (i) تتوقع تحقق broil! أوعندما تنوي بيع الأصل أواستبلاكه. خلال دورتها التشغيلية العادية؛ أو )~( تحتفظ بالأصل بشكل رئيسي لغرض المتاجرة؛ أو )¢( = تتوقع تحقق الأصل خل",
    "lang": "ar",
    "source_code": "f1859195dc31"
   }
  ]
 },
 "TB-010": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 1 عرض القوائم المالية — المعتمد في المملكة (الهيئة السعودية للمراجعين والمحاسبين 2026)",
    "ref": "الفقرة 32",
    "quote": "لايجوزللمنشأة أن تجري مقاصة بين الأصول والالتزامات. أوبين الدخل والمصروفات, مالم تكن مطالبة أومسموحاً لها بذلك بموجب معياردولي للتقرير المالي.",
    "lang": "ar",
    "source_code": "f1859195dc31"
   }
  ]
 },
 "TB-011": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 500 (ISA 500): أدلة المراجعة",
    "ref": "صفحة 1–3",
    "quote": "مسؤولية المراجع عن تصميم وتنفيذ إجراءات المراجعة للحصول على ما يكفي من أدلة المراجعة المناسبة حتى يكون قادراً على استخلاص استنتاجات معقولة تشكل أساساً لرأيه.",
    "lang": "ar",
    "source_code": "4b3c670989e2"
   }
  ]
 },
 "TB-012": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 520 (ISA 520): الإجراءات التحليلية",
    "ref": "صفحة 3–4",
    "quote": "المالية. وتشمل الإجراءات التحليلية أيضاً التحري الضروري عن التقلبات أو العلاقات التي يتم التعرف علها والتي لا تتسق مع المعلومات الأخرى ذات الصلة أو تختلف عن القيم المتوقعة بمبلغ كبير. (راجع: الفقرة أ١1-أ؟) المتطلبات الإجراءات التحليلية الأساس يجب على المراجع:",
    "lang": "ar",
    "source_code": "c77b4c7e3389"
   }
  ]
 },
 "TB-013": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "TB-014": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 520 (ISA 520): الإجراءات التحليلية",
    "ref": "صفحة 3–4",
    "quote": "المالية. وتشمل الإجراءات التحليلية أيضاً التحري الضروري عن التقلبات أو العلاقات التي يتم التعرف علها والتي لا تتسق مع المعلومات الأخرى ذات الصلة أو تختلف عن القيم المتوقعة بمبلغ كبير. (راجع: الفقرة أ١1-أ؟) المتطلبات الإجراءات التحليلية الأساس يجب على المراجع:",
    "lang": "ar",
    "source_code": "c77b4c7e3389"
   },
   {
    "source": "معيار المراجعة 320 (ISA 320): الأهمية النسبية عند تخطيط وتنفيذ المراجعة",
    "ref": "صفحة 6–7",
    "quote": "حديد الأهمية النسبية على ممارسة الحكم المي. Gili, في الغالب نسبة مئوية على أساس مرجعي مختارء كنقطة بداية لتحديد الأهمية النسبية للقوائم المالية ككل. وتشمل العوامل التي قد تؤثر في تحديد الأساس المرجعي المناسب ما يلي: . عناصر القوائم المالية (على سبيل SLM الأصولء الا",
    "lang": "ar",
    "source_code": "610bc7e94943"
   }
  ],
  "threshold": "العتبة (تغير يتجاوز الأهمية النسبية ونسبة التغير المادي (25%)) اجتهاد المكتب وليست نصًا في المعيار."
 },
 "TB-015": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 520 (ISA 520): الإجراءات التحليلية",
    "ref": "صفحة 3–4",
    "quote": "المالية. وتشمل الإجراءات التحليلية أيضاً التحري الضروري عن التقلبات أو العلاقات التي يتم التعرف علها والتي لا تتسق مع المعلومات الأخرى ذات الصلة أو تختلف عن القيم المتوقعة بمبلغ كبير. (راجع: الفقرة أ١1-أ؟) المتطلبات الإجراءات التحليلية الأساس يجب على المراجع:",
    "lang": "ar",
    "source_code": "c77b4c7e3389"
   }
  ]
 },
 "TB-015B": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 520 (ISA 520): الإجراءات التحليلية",
    "ref": "صفحة 3–4",
    "quote": "المالية. وتشمل الإجراءات التحليلية أيضاً التحري الضروري عن التقلبات أو العلاقات التي يتم التعرف علها والتي لا تتسق مع المعلومات الأخرى ذات الصلة أو تختلف عن القيم المتوقعة بمبلغ كبير. (راجع: الفقرة أ١1-أ؟) المتطلبات الإجراءات التحليلية الأساس يجب على المراجع:",
    "lang": "ar",
    "source_code": "c77b4c7e3389"
   }
  ]
 },
 "TB-016": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 1 عرض القوائم المالية — المعتمد في المملكة (الهيئة السعودية للمراجعين والمحاسبين 2026)",
    "ref": "الفقرة 66",
    "quote": "يجب على المنشأة تصنيف الأصل على أنه متداول عندما: (i) تتوقع تحقق broil! أوعندما تنوي بيع الأصل أواستبلاكه. خلال دورتها التشغيلية العادية؛ أو )~( تحتفظ بالأصل بشكل رئيسي لغرض المتاجرة؛ أو )¢( = تتوقع تحقق الأصل خل",
    "lang": "ar",
    "source_code": "f1859195dc31"
   }
  ]
 },
 "TB-017": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "TB-018": {
  "kind": "حسابي",
  "items": [],
  "note": "فحص حسابي على البيانات نفسها (توازن القيد المزدوج واتساق الأرصدة)؛ لا يحتاج سندًا نظاميًا."
 },
 "TB-021": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 7 قائمة التدفقات النقدية (Statement Of Cash Flows) — النص الكامل 2026",
    "ref": "الفقرة 8",
    "quote": "8 Bank borrowings are generally considered to be financing activities. However, in some countries, bank overdrafts which are repayable on demand form an integral part of an entity's cash management. In these circumstances, bank overdrafts are included",
    "lang": "en",
    "source_code": "a9fd6b4a1fab"
   }
  ]
 },
 "TB-022": {
  "kind": "سند",
  "items": [
   {
    "source": "IFRS 9 الأدوات المالية (Financial Instruments) — النص الكامل 2026",
    "ref": "الفقرة 5.5.1",
    "quote": "5.5.1 An entity shall recognise a loss allowance for expected credit losses on a financial asset that is measured in accordance with paragraphs 4.1.2 or 4.1.2A, a lease receivable, a contract asset or a loan commitment and a financial guarantee contract to which the impairment",
    "lang": "en",
    "source_code": "bc28d4e21f7a"
   }
  ]
 },
 "TB-023": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 16 الممتلكات والآلات والمعدات (Property Plant And Equipment) — النص الكامل 2026",
    "ref": "الفقرة 6",
    "quote": "Carrying amount is the amount at which an asset is recognised after deducting any accumulated depreciation and accumulated impairment losses. Cost is the amount of cash or cash equivalents paid or the fair value of the other consideration given to acquire an asset at the time of its acquisition or construction or, where applicable, th",
    "lang": "en",
    "source_code": "817459cfadf3"
   }
  ]
 },
 "TB-024": {
  "kind": "سند",
  "items": [
   {
    "source": "نظام الشركات — النص الموحد من هيئة الخبراء",
    "ref": "المادة الثانية والثلاثون بعد المائة",
    "quote": "إذا بلغت خسائر شركة المساهمة (نصف) رأس المال المصدر، وجب على مجلس الإدارة الإفصاح عن ذلك وعما توصل إليه من توصيات بشأن تلك الخسائر خلال (ستين) يومًا من تاريخ علمه ببلوغها هذا المقدار، ودعوة الجمعية العامة غير العادية إلى الاجتماع خلال (مائة وثمانين) يومًا من تاريخ العلم بذلك للنظر في استمرار الشركة مع اتخاذ أي من الإجراءات اللازمة لمعالجة تلك الخسائر، أو حلّها.",
    "lang": "ar",
    "source_code": "4b0e4b4d0bd0"
   },
   {
    "source": "نظام الشركات — النص الموحد من هيئة الخبراء",
    "ref": "المادة الثانية والثمانون بعد المائة",
    "quote": "إذا بلغت خسائر الشركة نصف رأس مالها، وجب على مدير الشركة دعوة الجمعية العامة للشركاء إلى الاجتماع خلال (ستين) يومًا من تاريخ العلم ببلوغ الخسارة هذا المقدار للنظر في استمرار الشركة مع اتخاذ أي من الإجراءات اللازمة لمعالجة تلك الخسائر، أو حلها.",
    "lang": "ar",
    "source_code": "4b0e4b4d0bd0"
   }
  ]
 },
 "TB-025": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 24 الإفصاحات عن الأطراف ذات العلاقة (Related Party Disclosures) — النص الكامل 2026",
    "ref": "الفقرة 18",
    "quote": "18 If an entity has had related party transactions during the periods covered by the financial statements, it shall disclose the nature of the related party relationship as well as information about those transactions and outstanding balances, including commitments, necessary for",
    "lang": "en",
    "source_code": "a617928af04d"
   }
  ]
 },
 "TB-026": {
  "kind": "سند",
  "items": [
   {
    "source": "IAS 2 المخزون (Inventories) — النص الكامل 2026",
    "ref": "الفقرة 34",
    "quote": "34 When inventories are sold, the carrying amount of those inventories shall be recognised as an expense in the period in which the related revenue is recognised. The amount of any write-down of inventories to net realisable value and all losses of inventori",
    "lang": "en",
    "source_code": "4dbbdccba231"
   }
  ]
 },
 "VAR-001": {
  "kind": "سند",
  "items": [
   {
    "source": "معيار المراجعة 520 (ISA 520): الإجراءات التحليلية",
    "ref": "صفحة 3–4",
    "quote": "المالية. وتشمل الإجراءات التحليلية أيضاً التحري الضروري عن التقلبات أو العلاقات التي يتم التعرف علها والتي لا تتسق مع المعلومات الأخرى ذات الصلة أو تختلف عن القيم المتوقعة بمبلغ كبير. (راجع: الفقرة أ١1-أ؟) المتطلبات الإجراءات التحليلية الأساس يجب على المراجع:",
    "lang": "ar",
    "source_code": "c77b4c7e3389"
   }
  ],
  "threshold": "العتبة (تغير يتجاوز الأهمية النسبية و10%) اجتهاد المكتب وليست نصًا في المعيار."
 }
};

/** اسم مختصر للمصدر: «IAS 16» أو «ISA 520» أو «نظام الشركات» */
export function shortSource(title: string): string {
  const m = title.match(/\((ISA|ISRS|ISAE|ISQM) ?\d+\)/) ?? title.match(/^(IAS|IFRS|IFRIC|SIC) ?\d+/);
  if (m) return m[0].replace(/[()]/g, '');
  return title.split(' — ')[0];
}
export function basisFor(ruleCode: string | null | undefined): RuleBasis | null {
  if (!ruleCode) return null;
  return RULE_BASIS[ruleCode] ?? RULE_BASIS[ruleCode.replace(/-R$/, '')] ?? null;
}
/** نص قصير للتقرير: «IAS 16 الفقرة 50؛ نظام الشركات المادة الثانية والثلاثون بعد المائة» */
export function basisLabel(b: RuleBasis | null): string {
  if (!b) return '';
  if (b.kind === 'حسابي') return 'فحص حسابي على البيانات';
  return b.items.map((i) => `${shortSource(i.source)} ${i.ref}`).join('؛ ') + (b.threshold ? ' — العتبة الرقمية اجتهاد المكتب' : '');
}
