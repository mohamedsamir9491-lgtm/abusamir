-- المكتبة النظامية: الأنظمة واللوائح والأدلة والاتفاقيات (الزكاة والضريبة والجمارك) والمعايير الدولية
-- تُعبّأ من ملف المكتبة المرفق بالبرنامج (assets/legal/corpus.json.gz) ويُتعرف على إصدارها من legal_meta

-- تقليص البادئات الشائعة (ال، وال، بال، لل، و…) لكل كلمة بعد التوحيد، ليطابق «الزكاة» = «زكاة» = «وبالزكاة»
CREATE OR REPLACE FUNCTION ar_stem_text(t text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(ar_norm(t), '(^|[^ء-ي0-9a-z])(وبال|وكال|فبال|ولل|فلل|وال|بال|فال|كال|لل|ال|و)([ء-ي0-9a-z]{3,})', '\1\3', 'g')
$$;

CREATE TABLE IF NOT EXISTS legal_meta (id int PRIMARY KEY DEFAULT 1, version text NOT NULL, built_at text, loaded_at timestamptz NOT NULL DEFAULT now(), sources int, chunks int);

CREATE TABLE IF NOT EXISTS legal_sources (
  code text PRIMARY KEY,
  title text NOT NULL,
  item text,
  category text NOT NULL DEFAULT '',
  doc_type text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'active',
  source_url text,
  page_url text,
  sha256 text,
  pages int,
  extraction text,
  lang text NOT NULL DEFAULT 'ar',
  custom boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legal_chunks (
  id bigserial PRIMARY KEY,
  source_code text NOT NULL REFERENCES legal_sources(code) ON DELETE CASCADE,
  ord int NOT NULL,
  kind text NOT NULL,
  ref text NOT NULL,
  num int,
  heading text,
  body text NOT NULL,
  page_from int,
  page_to int,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', ar_stem_text(coalesce(heading, '') || ' ' || body))) STORED
);
CREATE INDEX IF NOT EXISTS legal_chunks_tsv ON legal_chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS legal_chunks_src ON legal_chunks (source_code, ord);
