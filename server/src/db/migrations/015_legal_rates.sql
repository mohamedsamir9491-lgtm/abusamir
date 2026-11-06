-- جدول النسب والمبالغ النظامية للحاسبات: تُستخرج من نص المواد وتُطابق بين المصادر، ويعتمدها المكتب
CREATE TABLE IF NOT EXISTS legal_rates (
  id             text PRIMARY KEY,
  grp            text NOT NULL,
  label          text NOT NULL,
  unit           text NOT NULL,                 -- % أو ريال
  extracted      numeric,                       -- القيمة المقروءة من المصدر الرئيسي (آخر إصدار للمكتبة)
  status         text NOT NULL,                 -- match | match_note | single | conflict | missing
  evidence       jsonb NOT NULL DEFAULT '[]',   -- المصادر: النظام، المادة، الصفحة، القيمة، طريقة القراءة، المقتطف
  approved_value numeric,                       -- ما اعتمده المكتب (يُستخدم في الحاسبات)
  approved_by    uuid REFERENCES users(id),
  approved_at    timestamptz,
  note           text,
  library_version text,                         -- إصدار المكتبة الذي استُخرجت منه القيمة
  changed        boolean NOT NULL DEFAULT false, -- تغيّرت القيمة المستخرجة بعد الاعتماد: تحتاج مراجعة
  updated_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO permissions (code, description) VALUES ('legal.approve', 'اعتماد النسب النظامية للحاسبات') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_code, permission_code) VALUES ('admin', 'legal.approve'), ('office_manager', 'legal.approve') ON CONFLICT DO NOTHING;
