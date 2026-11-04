-- توحيد النص العربي للبحث (يطابق searchKey في الكود)
CREATE OR REPLACE FUNCTION ar_norm(t text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(lower(regexp_replace(
    translate(coalesce(t, ''), 'أإآٱىةؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', 'اااايهوي01234567890123456789'),
    '[ًٌٍَُِّْٰٕٖٜٟٓٔٗ٘ٙٚٛٝٞـ​‌‍‎‏‪‫‬‭‮⁦⁧⁨⁩]', '', 'g')), '\s+', ' ', 'g'))
$$;
