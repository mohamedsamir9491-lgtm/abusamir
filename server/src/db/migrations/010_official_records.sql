-- البيانات النظامية المستخرجة من المستندات الرسمية (عقد التأسيس، السجل التجاري...) مع أدلتها ومراجعة المستخدم
CREATE TABLE IF NOT EXISTS official_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  document_id   UUID NOT NULL UNIQUE REFERENCES source_documents(id) ON DELETE CASCADE,
  doc_kind      TEXT NOT NULL DEFAULT 'other',
  status        TEXT NOT NULL DEFAULT 'extracted' CHECK (status IN ('extracted', 'confirmed')),
  fields        JSONB NOT NULL DEFAULT '{}'::jsonb,
  pages         JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings      JSONB NOT NULL DEFAULT '[]'::jsonb,
  applied       JSONB,
  extracted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_by  UUID REFERENCES users(id),
  confirmed_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS official_engagement_idx ON official_records(engagement_id);
