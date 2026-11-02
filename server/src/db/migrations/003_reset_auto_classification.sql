-- الحسابات التي أُنشئت آليًا عند الاستيراد قبل تتبع مصدر التصنيف تُعلَّم كتصنيف آلي حتى تتحدث مع إعادة الاستيراد
UPDATE chart_of_accounts SET classification_source = 'auto', classification_confidence = 0.5 WHERE classification_source = 'manual' AND updated_at = created_at;
