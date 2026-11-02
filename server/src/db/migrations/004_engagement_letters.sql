-- خطابات الارتباط + صلاحية حذف التقارير
CREATE TABLE IF NOT EXISTS engagement_letters (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id  UUID NOT NULL UNIQUE REFERENCES engagements(id) ON DELETE CASCADE,
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  letter_no      TEXT,
  letter_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  fields         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'draft', -- draft | issued
  pdf_file_id    UUID REFERENCES stored_files(id),
  created_by     UUID REFERENCES users(id),
  updated_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS letters_ref_seq;
INSERT INTO permissions (code, description) VALUES ('reports.delete', 'حذف التقارير (تنظيف التقارير غير السليمة)') ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permissions (role_code, permission_code) VALUES ('admin', 'reports.delete') ON CONFLICT DO NOTHING;
