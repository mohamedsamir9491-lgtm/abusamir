-- وضع الترويسة: generated = ترويسة مولّدة من بيانات المكتب | design = تصميم مرفوع كامل الصفحة (تُخفى الترويسة المولّدة ويُحجز ارتفاع الرأس والتذييل تلقائيًا من حدود التصميم)
ALTER TABLE office_settings ADD COLUMN IF NOT EXISTS letterhead_mode TEXT NOT NULL DEFAULT 'generated';
UPDATE office_settings SET letterhead_mode = 'design', page_margin_top_mm = LEAST(page_margin_top_mm, 8), page_margin_bottom_mm = LEAST(page_margin_bottom_mm, 8) WHERE letterhead_file_id IS NOT NULL;
