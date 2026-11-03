-- إصلاح أسماء الملفات العربية التي حُفظت مشوّهة (فُكّت بترميز latin1 بدل UTF-8 قبل إصلاح الرفع)
CREATE OR REPLACE FUNCTION abusamir_fix_latin1(t text) RETURNS text AS $$
BEGIN
  IF t IS NULL OR t !~ '[ØÙÚÛ]' OR t ~ '[ء-ي]' THEN RETURN t; END IF;
  RETURN convert_from(convert_to(t, 'LATIN1'), 'UTF8');
EXCEPTION WHEN others THEN RETURN t;
END $$ LANGUAGE plpgsql;
UPDATE stored_files SET original_name = abusamir_fix_latin1(original_name) WHERE original_name ~ '[ØÙÚÛ]';
UPDATE source_documents SET title = abusamir_fix_latin1(title) WHERE title ~ '[ØÙÚÛ]';
-- أسماء الملفات التي استُبدلت حروفها العربية المشوّهة بـ «_» تُستعاد من عنوان المستند (حُفظ بالنص الأصلي)
UPDATE stored_files f SET original_name = left(regexp_replace(d.title, '[/\\:*?"<>|]+', '_', 'g'), 180)
  FROM source_documents d
  WHERE d.file_id = f.id AND f.original_name ~ '_' AND f.original_name !~ '[ء-ي]' AND d.title ~ '[ء-ي]';
DROP FUNCTION abusamir_fix_latin1(text);
