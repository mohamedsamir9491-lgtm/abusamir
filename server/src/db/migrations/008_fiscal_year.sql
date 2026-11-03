-- السنة المالية الحالية للمكتب: NULL = تلقائي من تاريخ اليوم
ALTER TABLE office_settings ADD COLUMN IF NOT EXISTS current_fiscal_year INT CHECK (current_fiscal_year BETWEEN 2000 AND 2100);
-- ربط ارتباط السنة التالية بارتباطه الأصلي (للتتبع والمقارنة)
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS rolled_from_engagement_id UUID REFERENCES engagements(id) ON DELETE SET NULL;
-- تصحيح نوع الفترات القائمة من تواريخها (سنة كاملة / فترة جزئية)
UPDATE financial_periods SET period_type = CASE WHEN (start_date + interval '1 year' - interval '1 day')::date = end_date THEN 'annual' ELSE 'interim' END
  WHERE period_type IN ('annual', 'custom');
