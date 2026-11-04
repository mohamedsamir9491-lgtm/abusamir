-- ===== دورة حياة خطاب الارتباط =====
ALTER TABLE engagement_letters ADD COLUMN IF NOT EXISTS lifecycle TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE engagement_letters ADD COLUMN IF NOT EXISTS sent_at DATE;
ALTER TABLE engagement_letters ADD COLUMN IF NOT EXISTS signed_at DATE;
ALTER TABLE engagement_letters ADD COLUMN IF NOT EXISTS signed_document_id UUID REFERENCES source_documents(id) ON DELETE SET NULL;
ALTER TABLE engagement_letters ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE engagement_letters ADD COLUMN IF NOT EXISTS closed_at DATE;
UPDATE engagement_letters SET lifecycle = 'issued' WHERE status = 'issued' AND lifecycle = 'draft';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engagement_letters_lifecycle_chk') THEN
    ALTER TABLE engagement_letters ADD CONSTRAINT engagement_letters_lifecycle_chk CHECK (lifecycle IN ('draft','issued','sent','signed','closed','cancelled'));
  END IF;
END $$;

-- ===== الارتباط: المسؤول وموعد التسليم =====
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS delivered_at DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE office_settings ADD COLUMN IF NOT EXISTS revenue_target NUMERIC(18,2);

-- ===== جدول الأتعاب (الدفعات) =====
CREATE TABLE IF NOT EXISTS fee_installments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id  UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  seq            INTEGER NOT NULL,
  label          TEXT NOT NULL,
  pct            NUMERIC(7,4),
  amount         NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  vat_rate       NUMERIC(5,2) NOT NULL DEFAULT 0,
  trigger        TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('signing','delivery','date','manual')),
  due_date       DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_installments_eng_idx ON fee_installments(engagement_id);

-- ===== مطالبات الأتعاب (مع رقم الفاتورة من نظام الفوترة الخارجي) =====
CREATE TABLE IF NOT EXISTS fee_claims (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_no             TEXT NOT NULL UNIQUE,
  client_id            UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  engagement_id        UUID NOT NULL REFERENCES engagements(id) ON DELETE RESTRICT,
  installment_id       UUID REFERENCES fee_installments(id) ON DELETE SET NULL,
  issue_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date             DATE,
  description          TEXT,
  amount               NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  vat_rate             NUMERIC(5,2) NOT NULL DEFAULT 0,
  vat_amount           NUMERIC(18,2) NOT NULL DEFAULT 0,
  total                NUMERIC(18,2) NOT NULL,
  external_invoice_no  TEXT,
  status               TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','cancelled')),
  notes                TEXT,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_claims_client_idx ON fee_claims(client_id);
CREATE INDEX IF NOT EXISTS fee_claims_eng_idx ON fee_claims(engagement_id);

-- ===== التحصيلات (جزئية أو كاملة، كل تحصيل على مطالبة) =====
CREATE TABLE IF NOT EXISTS fee_payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_no  TEXT NOT NULL UNIQUE,
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  claim_id    UUID NOT NULL REFERENCES fee_claims(id) ON DELETE RESTRICT,
  pay_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  amount      NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  method      TEXT NOT NULL DEFAULT 'bank' CHECK (method IN ('bank','cash','cheque','card','other')),
  reference   TEXT,
  notes       TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_payments_claim_idx ON fee_payments(claim_id);
CREATE INDEX IF NOT EXISTS fee_payments_client_idx ON fee_payments(client_id);

-- ===== المهام والمواعيد =====
CREATE TABLE IF NOT EXISTS office_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'followup' CHECK (kind IN ('delivery','followup','meeting','payment','document','other')),
  priority       TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('high','normal','low')),
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  due_date       DATE,
  client_id      UUID REFERENCES clients(id) ON DELETE CASCADE,
  engagement_id  UUID REFERENCES engagements(id) ON DELETE CASCADE,
  assigned_to    UUID REFERENCES users(id) ON DELETE SET NULL,
  notes          TEXT,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS office_tasks_due_idx ON office_tasks(status, due_date);

-- صلاحيات المالية
INSERT INTO permissions (code, description) VALUES ('finance.view', 'عرض الأتعاب والمطالبات والتحصيلات'), ('finance.manage', 'إصدار المطالبات وتسجيل التحصيلات') ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permissions (role_code, permission_code) SELECT r, p FROM (VALUES ('admin','finance.view'),('admin','finance.manage'),('office_manager','finance.view'),('office_manager','finance.manage'),('reviewer','finance.view')) v(r,p)
  WHERE EXISTS (SELECT 1 FROM roles WHERE code = v.r) ON CONFLICT DO NOTHING;
