-- درجة ثقة التصنيف ومصدره (آلي/يدوي) لحسابات دليل العميل
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC(4,2) NOT NULL DEFAULT 1;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS classification_source TEXT NOT NULL DEFAULT 'manual'; -- auto | manual
