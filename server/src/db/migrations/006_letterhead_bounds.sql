-- حدود تصميم الترويسة المرفوع (تُحسب آليًا من الصورة) لتحديد ارتفاع الرأس والتذييل في وضع التصميم
ALTER TABLE office_settings ADD COLUMN IF NOT EXISTS letterhead_top_mm NUMERIC(6,2);
ALTER TABLE office_settings ADD COLUMN IF NOT EXISTS letterhead_bottom_mm NUMERIC(6,2);
