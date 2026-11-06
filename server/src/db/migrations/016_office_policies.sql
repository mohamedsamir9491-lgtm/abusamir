-- سياسات المكتب القابلة للضبط من الإعدادات
-- 1) اعتماد التقارير: single = مستخدم واحد (يراجع المُعد ويعتمد تقريره، ويُذكر ذلك صراحة في التقرير)
--    managers = المُعد لا يراجع تقريره، ويُسمح للمدير العام ومدير المكتب باعتماد ما أعدّاه (السلوك السابق)
--    separate = فصل كامل: لا يراجع أحد ولا يعتمد تقريرًا أعدّه
ALTER TABLE office_settings ADD COLUMN IF NOT EXISTS report_approval_policy TEXT NOT NULL DEFAULT 'managers'
  CHECK (report_approval_policy IN ('single', 'managers', 'separate'));
-- 2) الأهمية النسبية الافتراضية (ISA 320: حكم مهني؛ الفقرة أ8 تذكر أمثلة: 5% من الربح قبل الزكاة والضريبة، 1% من الإيرادات)
ALTER TABLE office_settings ADD COLUMN IF NOT EXISTS materiality_policy JSONB NOT NULL
  DEFAULT '{"benchmark": "auto", "pbt_pct": 5, "revenue_pct": 1, "assets_pct": 0.5, "min_amount": 1000}';
-- ملاحظة على التقرير: هل راجعه/اعتمده المُعد نفسه
ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS self_reviewed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS self_approved BOOLEAN NOT NULL DEFAULT false;
