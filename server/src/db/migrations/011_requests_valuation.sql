-- طلبات المعلومات من العميل (قائمة واحدة للعميل تشمل كل شركات المجموعة)
CREATE TABLE IF NOT EXISTS client_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  root_engagement_id  UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  engagement_id       UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  period_id           UUID REFERENCES financial_periods(id) ON DELETE SET NULL,
  req_key             TEXT NOT NULL,
  ref_no              INTEGER NOT NULL,
  category            TEXT NOT NULL DEFAULT 'document' CHECK (category IN ('document','explanation','confirmation')),
  title               TEXT NOT NULL,
  reason              TEXT,
  amount              NUMERIC(20,2),
  links               JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority            TEXT NOT NULL DEFAULT 'essential' CHECK (priority IN ('essential','supporting')),
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','received','not_available','dismissed')),
  source              TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual')),
  obsolete            BOOLEAN NOT NULL DEFAULT false,
  document_id         UUID REFERENCES source_documents(id) ON DELETE SET NULL,
  response_note       TEXT,
  sent_at             TIMESTAMPTZ,
  received_at         TIMESTAMPTZ,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (root_engagement_id, engagement_id, req_key)
);
CREATE INDEX IF NOT EXISTS client_requests_root_idx ON client_requests(root_engagement_id);

-- ورقة تعديلات التقييم لكل شركة وفترة (مدخلات المحاسب فقط؛ الأرقام تُحتسب من الميزان)
CREATE TABLE IF NOT EXISTS valuation_workpapers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id  UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  period_id      UUID NOT NULL REFERENCES financial_periods(id) ON DELETE CASCADE,
  inputs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  approved_by    UUID REFERENCES users(id),
  approved_at    TIMESTAMPTZ,
  updated_by     UUID REFERENCES users(id),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, period_id)
);

-- سجل المساهمين للشركة الأم (أو الشركة المنفردة)
CREATE TABLE IF NOT EXISTS shareholder_registers (
  engagement_id        UUID PRIMARY KEY REFERENCES engagements(id) ON DELETE CASCADE,
  basis                TEXT NOT NULL DEFAULT 'assumed_equal' CHECK (basis IN ('assumed_equal','register')),
  contributions_basis  TEXT NOT NULL DEFAULT 'books' CHECK (contributions_basis IN ('books','official')),
  holders              JSONB NOT NULL DEFAULT '[]'::jsonb,
  note                 TEXT,
  updated_by           UUID REFERENCES users(id),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
