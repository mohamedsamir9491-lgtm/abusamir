-- ============================================================
-- 001_init.sql : المخطط الأساسي لمنصة التحليل المالي
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- الأدوار والصلاحيات ----------
CREATE TABLE roles (
  code        TEXT PRIMARY KEY,
  name_ar     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  rank        INT  NOT NULL DEFAULT 0
);

CREATE TABLE permissions (
  code        TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_code       TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_code)
);

-- ---------- المستخدمون والجلسات ----------
CREATE TABLE users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                TEXT NOT NULL UNIQUE,
  password_hash        TEXT NOT NULL,
  full_name            TEXT NOT NULL,
  role_code            TEXT NOT NULL REFERENCES roles(code),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  failed_logins        INT NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ,
  last_login_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);

-- ---------- الملفات المخزنة (شعار/توقيع/ختم/مستندات) ----------
CREATE TABLE stored_files (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose          TEXT NOT NULL,              -- logo | signature | stamp | document | report_pdf | report_xlsx | backup
  original_name    TEXT NOT NULL,
  stored_path      TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  size_bytes       BIGINT NOT NULL,
  sha256           TEXT NOT NULL,
  is_encrypted     BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by      UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

-- ---------- إعدادات المكتب والترويسة ----------
CREATE TABLE office_settings (
  id                     INT PRIMARY KEY CHECK (id = 1),
  name_ar                TEXT NOT NULL DEFAULT '',
  name_en                TEXT NOT NULL DEFAULT '',
  logo_file_id           UUID REFERENCES stored_files(id),
  cr_number              TEXT,
  license_number         TEXT,
  license_authority      TEXT,
  address_ar             TEXT,
  address_en             TEXT,
  phone                  TEXT,
  email                  TEXT,
  website                TEXT,
  vat_number             TEXT,
  signatory_name         TEXT,
  signatory_title        TEXT,
  signature_file_id      UUID REFERENCES stored_files(id),
  stamp_file_id          UUID REFERENCES stored_files(id),
  use_signature          BOOLEAN NOT NULL DEFAULT FALSE,
  use_stamp              BOOLEAN NOT NULL DEFAULT FALSE,
  footer_ar              TEXT,
  footer_en              TEXT,
  disclaimer_ar          TEXT,
  disclaimer_en          TEXT,
  confidentiality_ar     TEXT NOT NULL DEFAULT 'سري - للاستخدام الداخلي للعميل والمكتب فقط',
  confidentiality_en     TEXT NOT NULL DEFAULT 'Confidential - for client and office use only',
  letterhead_template_ar TEXT,                 -- HTML اختياري للترويسة العربية
  letterhead_template_en TEXT,
  letterhead_file_id     UUID REFERENCES stored_files(id),  -- ترويسة رسمية مرفوعة (PDF/Word) إن وجدت
  page_margin_top_mm     NUMERIC(6,2) NOT NULL DEFAULT 20,
  page_margin_bottom_mm  NUMERIC(6,2) NOT NULL DEFAULT 20,
  page_margin_left_mm    NUMERIC(6,2) NOT NULL DEFAULT 18,
  page_margin_right_mm   NUMERIC(6,2) NOT NULL DEFAULT 18,
  header_height_mm       NUMERIC(6,2) NOT NULL DEFAULT 28,
  footer_height_mm       NUMERIC(6,2) NOT NULL DEFAULT 18,
  page_numbering         TEXT NOT NULL DEFAULT 'page_of_total', -- page_of_total | page_only | none
  default_font           TEXT NOT NULL DEFAULT 'Noto Naskh Arabic',
  primary_color          TEXT NOT NULL DEFAULT '#1f3a5f',
  updated_by             UUID REFERENCES users(id),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO office_settings (id) VALUES (1);

-- ---------- العملاء ----------
CREATE TABLE clients (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name_ar         TEXT NOT NULL,
  legal_name_en         TEXT,
  entity_type           TEXT NOT NULL DEFAULT 'llc',        -- llc | jsc | sole | partnership | branch | nonprofit | other
  cr_number             TEXT,
  vat_number            TEXT,
  fiscal_year_end_month INT NOT NULL DEFAULT 12 CHECK (fiscal_year_end_month BETWEEN 1 AND 12),
  fiscal_year_end_day   INT NOT NULL DEFAULT 31 CHECK (fiscal_year_end_day BETWEEN 1 AND 31),
  accounting_framework  TEXT NOT NULL DEFAULT 'unspecified', -- ifrs | ifrs_smes | other | unspecified
  reporting_currency    TEXT NOT NULL DEFAULT 'SAR',
  industry              TEXT,
  contact_name          TEXT,
  contact_phone         TEXT,
  contact_email         TEXT,
  address               TEXT,
  notes                 TEXT,
  is_demo               BOOLEAN NOT NULL DEFAULT FALSE,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

-- ---------- الارتباطات (المهام) ----------
CREATE TABLE engagements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  title              TEXT NOT NULL,
  engagement_type    TEXT NOT NULL DEFAULT 'management_analysis',
  -- management_analysis | agreed_upon_review | bookkeeping | tax_analysis | assurance_audit
  status             TEXT NOT NULL DEFAULT 'planning', -- planning | data_collection | analysis | review | reporting | closed
  framework          TEXT NOT NULL DEFAULT 'unspecified',
  currency           TEXT NOT NULL DEFAULT 'SAR',
  description        TEXT,
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX engagements_client_idx ON engagements(client_id);

-- ---------- الفترات المالية ----------
CREATE TABLE financial_periods (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  engagement_id  UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  label          TEXT NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  period_type    TEXT NOT NULL DEFAULT 'annual',  -- annual | quarter | month | custom
  role           TEXT NOT NULL DEFAULT 'current', -- current | prior | budget | comparative
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX periods_engagement_idx ON financial_periods(engagement_id);

-- ---------- المستندات المصدرية ----------
CREATE TABLE source_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  engagement_id  UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  period_id      UUID REFERENCES financial_periods(id) ON DELETE SET NULL,
  file_id        UUID NOT NULL REFERENCES stored_files(id),
  document_type  TEXT NOT NULL DEFAULT 'unknown',
  -- trial_balance | general_ledger | journal_entries | chart_of_accounts | receivables | payables |
  -- inventory | fixed_assets | bank_statement | financial_statements | invoice | contract | other | unknown
  title          TEXT,
  status         TEXT NOT NULL DEFAULT 'uploaded', -- uploaded | processing | imported | rejected
  notes          TEXT,
  uploaded_by    UUID REFERENCES users(id),
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX documents_engagement_idx ON source_documents(engagement_id);
CREATE INDEX documents_client_idx ON source_documents(client_id);

-- ---------- مهام الاستيراد ----------
CREATE TABLE import_jobs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id        UUID NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  client_id          UUID NOT NULL REFERENCES clients(id),
  engagement_id      UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  period_id          UUID REFERENCES financial_periods(id) ON DELETE SET NULL,
  data_type          TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'created',
  -- created | extracted | mapped | validated | committed | failed | cancelled
  sheet_name         TEXT,
  header_row         INT NOT NULL DEFAULT 1,
  detected_columns   JSONB NOT NULL DEFAULT '[]',
  column_mapping     JSONB NOT NULL DEFAULT '{}',
  options            JSONB NOT NULL DEFAULT '{}',
  extraction_meta    JSONB NOT NULL DEFAULT '{}',  -- confidence, method (xlsx/csv/pdf-text/ocr), warnings
  validation_report  JSONB,
  row_count          INT NOT NULL DEFAULT 0,
  error_message      TEXT,
  committed_at       TIMESTAMPTZ,
  committed_by       UUID REFERENCES users(id),
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX import_jobs_engagement_idx ON import_jobs(engagement_id);

CREATE TABLE imported_records (
  id             BIGSERIAL PRIMARY KEY,
  import_job_id  UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number     INT NOT NULL,
  raw            JSONB NOT NULL,
  mapped         JSONB,
  status         TEXT NOT NULL DEFAULT 'pending', -- pending | ok | warning | error | skipped
  messages       JSONB NOT NULL DEFAULT '[]',
  confidence     NUMERIC(5,4)
);
CREATE INDEX imported_records_job_idx ON imported_records(import_job_id, row_number);

-- ---------- بنود القوائم المالية (مرجعية) ----------
CREATE TABLE fs_line_items (
  code        TEXT PRIMARY KEY,
  statement   TEXT NOT NULL,   -- sfp | pl | oci | ce | cf
  section     TEXT NOT NULL,
  label_ar    TEXT NOT NULL,
  label_en    TEXT NOT NULL,
  normal_sign TEXT NOT NULL DEFAULT 'debit', -- debit | credit
  sort_order  INT NOT NULL DEFAULT 0
);

-- ---------- دليل الحسابات ----------
CREATE TABLE chart_of_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  code           TEXT NOT NULL,
  name_ar        TEXT NOT NULL,
  name_en        TEXT,
  account_type   TEXT NOT NULL,   -- asset | liability | equity | revenue | expense | other
  sub_type       TEXT,            -- current_asset | non_current_asset | current_liability | ...
  normal_balance TEXT NOT NULL,   -- debit | credit
  parent_code    TEXT,
  fs_line_code   TEXT REFERENCES fs_line_items(code),
  is_suspense    BOOLEAN NOT NULL DEFAULT FALSE,
  is_bank        BOOLEAN NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, code)
);

-- ---------- ميزان المراجعة ----------
CREATE TABLE trial_balance_entries (
  id             BIGSERIAL PRIMARY KEY,
  client_id      UUID NOT NULL REFERENCES clients(id),
  engagement_id  UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  period_id      UUID NOT NULL REFERENCES financial_periods(id) ON DELETE CASCADE,
  import_job_id  UUID REFERENCES import_jobs(id) ON DELETE SET NULL,
  account_code   TEXT NOT NULL,
  account_name   TEXT,
  opening_debit  NUMERIC(20,4) NOT NULL DEFAULT 0,
  opening_credit NUMERIC(20,4) NOT NULL DEFAULT 0,
  period_debit   NUMERIC(20,4) NOT NULL DEFAULT 0,
  period_credit  NUMERIC(20,4) NOT NULL DEFAULT 0,
  closing_debit  NUMERIC(20,4) NOT NULL DEFAULT 0,
  closing_credit NUMERIC(20,4) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'SAR',
  source_row     INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tb_period_idx ON trial_balance_entries(period_id);
CREATE INDEX tb_engagement_idx ON trial_balance_entries(engagement_id);
CREATE INDEX tb_account_idx ON trial_balance_entries(period_id, account_code);

-- ---------- قيود اليومية ----------
CREATE TABLE journal_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id),
  engagement_id  UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  period_id      UUID NOT NULL REFERENCES financial_periods(id) ON DELETE CASCADE,
  import_job_id  UUID REFERENCES import_jobs(id) ON DELETE SET NULL,
  entry_no       TEXT,
  entry_date     DATE,
  description    TEXT,
  reference      TEXT,
  source_row     INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX je_period_idx ON journal_entries(period_id);

CREATE TABLE journal_lines (
  id               BIGSERIAL PRIMARY KEY,
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_code     TEXT NOT NULL,
  account_name     TEXT,
  debit            NUMERIC(20,4) NOT NULL DEFAULT 0,
  credit           NUMERIC(20,4) NOT NULL DEFAULT 0,
  description      TEXT,
  counterparty     TEXT,
  source_row       INT
);
CREATE INDEX jl_entry_idx ON journal_lines(journal_entry_id);
CREATE INDEX jl_account_idx ON journal_lines(account_code);

-- ---------- السجلات الفرعية (مدينون/دائنون/مخزون/أصول/بنك) ----------
CREATE TABLE subledger_records (
  id             BIGSERIAL PRIMARY KEY,
  client_id      UUID NOT NULL REFERENCES clients(id),
  engagement_id  UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  period_id      UUID NOT NULL REFERENCES financial_periods(id) ON DELETE CASCADE,
  import_job_id  UUID REFERENCES import_jobs(id) ON DELETE SET NULL,
  record_type    TEXT NOT NULL,  -- receivable | payable | inventory | fixed_asset | bank_transaction
  record_date    DATE,
  reference      TEXT,
  counterparty   TEXT,
  description    TEXT,
  amount         NUMERIC(20,4),
  debit          NUMERIC(20,4),
  credit         NUMERIC(20,4),
  balance        NUMERIC(20,4),
  quantity       NUMERIC(20,4),
  data           JSONB NOT NULL DEFAULT '{}',
  source_row     INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subledger_period_type_idx ON subledger_records(period_id, record_type);

-- ---------- القوائم المالية المولّدة ----------
CREATE TABLE financial_statements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id),
  engagement_id  UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  period_id      UUID NOT NULL REFERENCES financial_periods(id) ON DELETE CASCADE,
  statement_type TEXT NOT NULL,   -- sfp | pl | ce | cf | ratios | package
  data           JSONB NOT NULL,
  inputs_hash    TEXT NOT NULL,
  generated_by   UUID REFERENCES users(id),
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fs_period_idx ON financial_statements(period_id, statement_type);

-- ---------- نتائج التحليل والمطابقات ----------
CREATE TABLE analysis_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id),
  engagement_id  UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  period_id      UUID REFERENCES financial_periods(id) ON DELETE CASCADE,
  run_type       TEXT NOT NULL,  -- tb_validation | statements | ratios | variance | reconciliation | ai_analysis | subledger
  status         TEXT NOT NULL DEFAULT 'running', -- running | completed | failed
  summary        JSONB NOT NULL DEFAULT '{}',
  result         JSONB,
  error_message  TEXT,
  started_by     UUID REFERENCES users(id),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ
);
CREATE INDEX analysis_runs_engagement_idx ON analysis_runs(engagement_id, run_type);

CREATE TABLE reconciliation_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id  UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  period_id      UUID NOT NULL REFERENCES financial_periods(id) ON DELETE CASCADE,
  recon_type     TEXT NOT NULL,   -- gl_vs_subledger | bank | tb_vs_statements | intercompany
  summary        JSONB NOT NULL DEFAULT '{}',
  items          JSONB NOT NULL DEFAULT '[]',
  run_id         UUID REFERENCES analysis_runs(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- الملاحظات (النتائج) ----------
CREATE SEQUENCE findings_ref_seq;
CREATE TABLE findings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID NOT NULL REFERENCES clients(id),
  engagement_id      UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  period_id          UUID REFERENCES financial_periods(id) ON DELETE CASCADE,
  finding_ref        TEXT NOT NULL UNIQUE,
  rule_code          TEXT,
  category           TEXT NOT NULL,
  -- math_error | data_quality | accounting_issue | documents_required | judgment | ai_observation
  severity           TEXT NOT NULL DEFAULT 'medium', -- critical | high | medium | low | info
  title              TEXT NOT NULL,
  description        TEXT NOT NULL,
  account_code       TEXT,
  account_name       TEXT,
  fs_line_code       TEXT,
  amount             NUMERIC(20,4),
  currency           TEXT,
  source_document_id UUID REFERENCES source_documents(id) ON DELETE SET NULL,
  source_row_ref     TEXT,
  evidence           JSONB NOT NULL DEFAULT '{}',
  calculation        TEXT,
  impact             TEXT,
  recommendation     TEXT,
  origin             TEXT NOT NULL DEFAULT 'engine', -- engine | ai | manual
  review_status      TEXT NOT NULL DEFAULT 'open',   -- open | under_review | accepted | rejected | resolved
  reviewer_id        UUID REFERENCES users(id),
  reviewer_note      TEXT,
  dedupe_key         TEXT,
  run_id             UUID REFERENCES analysis_runs(id) ON DELETE SET NULL,
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX findings_engagement_idx ON findings(engagement_id, severity);
CREATE UNIQUE INDEX findings_dedupe_idx ON findings(engagement_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- ---------- التسويات المقترحة ----------
CREATE SEQUENCE adjustments_ref_seq;
CREATE TABLE proposed_adjustments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID NOT NULL REFERENCES clients(id),
  engagement_id        UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  period_id            UUID REFERENCES financial_periods(id) ON DELETE CASCADE,
  finding_id           UUID REFERENCES findings(id) ON DELETE SET NULL,
  adj_ref              TEXT NOT NULL UNIQUE,
  description          TEXT NOT NULL,
  rationale            TEXT,
  calculation          TEXT,
  lines                JSONB NOT NULL DEFAULT '[]', -- [{account_code, account_name, debit, credit}]
  total_debit          NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_credit         NUMERIC(20,4) NOT NULL DEFAULT 0,
  evidence_document_id UUID REFERENCES source_documents(id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'proposed', -- proposed | under_review | approved | rejected | posted
  created_by           UUID REFERENCES users(id),
  reviewed_by          UUID REFERENCES users(id),
  approved_by          UUID REFERENCES users(id),
  approved_at          TIMESTAMPTZ,
  posted_at            TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX adjustments_engagement_idx ON proposed_adjustments(engagement_id, status);

-- ---------- قوالب التقارير ----------
CREATE TABLE report_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,
  report_type  TEXT NOT NULL,
  name_ar      TEXT NOT NULL,
  name_en      TEXT NOT NULL,
  description  TEXT,
  sections     JSONB NOT NULL DEFAULT '[]',
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- التقارير المولّدة ----------
CREATE SEQUENCE reports_ref_seq;
CREATE TABLE generated_reports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID NOT NULL REFERENCES clients(id),
  engagement_id      UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  period_id          UUID REFERENCES financial_periods(id) ON DELETE SET NULL,
  template_id        UUID REFERENCES report_templates(id),
  report_type        TEXT NOT NULL,
  reference_no       TEXT NOT NULL UNIQUE,
  title              TEXT NOT NULL,
  language           TEXT NOT NULL DEFAULT 'ar',
  status             TEXT NOT NULL DEFAULT 'draft', -- draft | reviewed | approved | issued
  current_version_no INT NOT NULL DEFAULT 0,
  prepared_by        UUID REFERENCES users(id),
  reviewed_by        UUID REFERENCES users(id),
  reviewed_at        TIMESTAMPTZ,
  approved_by        UUID REFERENCES users(id),
  approved_at        TIMESTAMPTZ,
  issued_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reports_engagement_idx ON generated_reports(engagement_id);

CREATE TABLE report_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    UUID NOT NULL REFERENCES generated_reports(id) ON DELETE CASCADE,
  version_no   INT NOT NULL,
  content      JSONB NOT NULL,      -- {meta, sections:[{key,title,enabled,order,blocks:[...]}]}
  snapshot     JSONB NOT NULL DEFAULT '{}', -- بيانات الحسابات والنتائج لحظة التوليد
  pdf_file_id  UUID REFERENCES stored_files(id),
  xlsx_file_id UUID REFERENCES stored_files(id),
  change_note  TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, version_no)
);

-- ---------- تعليقات المراجعة وسجل الاعتماد ----------
CREATE TABLE review_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,  -- finding | report | adjustment | import_job
  entity_id   UUID NOT NULL,
  user_id     UUID NOT NULL REFERENCES users(id),
  comment     TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX review_comments_entity_idx ON review_comments(entity_type, entity_id);

CREATE TABLE approval_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  user_id     UUID REFERENCES users(id),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX approval_history_entity_idx ON approval_history(entity_type, entity_id);

-- ---------- سجل التدقيق ----------
CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  client_id   UUID,
  details     JSONB NOT NULL DEFAULT '{}',
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX audit_logs_client_idx ON audit_logs(client_id);

-- ---------- طلبات الذكاء الاصطناعي ----------
CREATE TABLE ai_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID REFERENCES engagements(id) ON DELETE CASCADE,
  period_id     UUID REFERENCES financial_periods(id) ON DELETE SET NULL,
  provider      TEXT NOT NULL,
  model         TEXT,
  purpose       TEXT NOT NULL,
  input_hash    TEXT,
  input_tokens  INT,
  output_tokens INT,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | completed | failed | rejected_schema
  response      JSONB,
  error_message TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

-- ---------- إعدادات النظام وسياسة الاحتفاظ ----------
CREATE TABLE system_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO system_settings (key, value) VALUES
  ('retention_policy', '{"documents_years": 10, "reports_years": 10, "audit_log_years": 7, "auto_delete": false}'),
  ('ai_policy', '{"allow_external": false, "share_client_names": false, "training_opt_out": true}');

CREATE TABLE data_deletion_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id),
  scope         TEXT NOT NULL DEFAULT 'client', -- client | engagement | documents
  engagement_id UUID REFERENCES engagements(id),
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'requested', -- requested | approved | rejected | executed
  requested_by  UUID REFERENCES users(id),
  approved_by   UUID REFERENCES users(id),
  executed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- بيانات الأدوار والصلاحيات ----------
INSERT INTO roles (code, name_ar, name_en, rank) VALUES
  ('admin',          'مدير النظام',      'System Administrator', 100),
  ('office_manager', 'مدير المكتب',      'Office Manager',        80),
  ('accountant',     'محاسب',            'Accountant',            60),
  ('reviewer',       'مراجع',            'Reviewer',              50),
  ('readonly',       'قراءة فقط',        'Read-only User',        10);

INSERT INTO permissions (code, description) VALUES
  ('users.manage',        'إدارة المستخدمين والأدوار'),
  ('office.manage',       'تعديل إعدادات المكتب والترويسة'),
  ('system.manage',       'إعدادات النظام والنسخ الاحتياطي'),
  ('audit.view',          'عرض سجل التدقيق'),
  ('clients.view',        'عرض العملاء'),
  ('clients.manage',      'إضافة وتعديل العملاء والارتباطات'),
  ('documents.upload',    'رفع المستندات'),
  ('documents.delete',    'حذف المستندات'),
  ('imports.run',         'تشغيل الاستيراد والتحقق واعتماده'),
  ('analysis.run',        'تشغيل الفحوصات والتحليل'),
  ('ai.run',              'استخدام المساعد الذكي'),
  ('findings.edit',       'تعديل الملاحظات والتسويات'),
  ('findings.review',     'مراجعة واعتماد/رفض الملاحظات'),
  ('adjustments.approve', 'اعتماد التسويات'),
  ('reports.create',      'إنشاء وتعديل التقارير'),
  ('reports.review',      'مراجعة التقارير'),
  ('reports.approve',     'اعتماد التقارير للإصدار'),
  ('reports.export',      'تصدير التقارير'),
  ('templates.manage',    'إدارة قوالب التقارير'),
  ('data.delete',         'طلب/تنفيذ حذف بيانات');

INSERT INTO role_permissions SELECT 'admin', code FROM permissions;
INSERT INTO role_permissions SELECT 'office_manager', code FROM permissions WHERE code NOT IN ('system.manage');
INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('accountant','clients.view'),('accountant','clients.manage'),('accountant','documents.upload'),
  ('accountant','imports.run'),('accountant','analysis.run'),('accountant','ai.run'),
  ('accountant','findings.edit'),('accountant','reports.create'),('accountant','reports.export'),
  ('reviewer','clients.view'),('reviewer','analysis.run'),('reviewer','findings.review'),
  ('reviewer','adjustments.approve'),('reviewer','reports.review'),('reviewer','reports.approve'),
  ('reviewer','reports.export'),('reviewer','audit.view'),
  ('readonly','clients.view');
