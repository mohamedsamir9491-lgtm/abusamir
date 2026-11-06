-- 3) عتبات التحليل (اجتهاد المكتب) — القيم الافتراضية في lib/thresholds.ts وتُدمج مع ما يحفظه المكتب
ALTER TABLE office_settings ADD COLUMN IF NOT EXISTS analysis_thresholds JSONB NOT NULL DEFAULT '{}';
