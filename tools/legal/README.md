# أدوات بناء المكتبة النظامية

تبني ملف المكتبة المرفق بالبرنامج (`server/assets/legal/corpus.json.gz`) وجدول النسب (`server/assets/legal/rates.json`) من المصادر الرسمية. تُشغَّل على جهاز التطوير وليس على السيرفر.

| الخطوة | الأمر | الناتج |
|---|---|---|
| جمع روابط الملفات من صفحات الهيئة | `node crawl2.mjs list.json <رابط الصفحات> items.json` | قائمة الملفات لكل نظام |
| عرض صفحة تُحمَّل بالجافاسكربت | `node render2.mjs <رابط>...` | روابط المستندات |
| تحميل الملفات | `python3 -I download.py items.json docs/` | `docs/manifest.json` |
| استخراج النص | `python3 -I extract.py docs/ ... text/` | نص كل صفحة؛ قراءة ضوئية عربية عند تلف طبقة النص |
| ملخصات IFRS الرسمية | `python3 -I ifrs_fetch.py ifrs-summaries.json extra/ifrs.extra.json` | مصدر إضافي |
| ملفات الأمانة العامة للجان | `node gstc-titles.mjs` | `gstc-items.json` |
| التقسيم إلى مواد وبناء المكتبة | `python3 -I structure.py text/ docs/manifest.json ... extra/*.extra.json corpus.json.gz` | ملف المكتبة |
| استخراج النسب ومطابقتها | `python3 -I rates.py corpus.json.gz rates.json` | جدول النسب |

يتطلب: poppler-utils، tesseract-ocr مع ara، Playwright.

## قواعد النسب

- القيمة تُقرأ من نص المادة فقط. المكتوب بالحروف أوثق، ثم الرقم مع علامة %، ثم أنماط القراءة الضوئية المعطوبة (منخفضة الثقة).
- «متطابقة»: مصدران رسميان أو أكثر بنفس القيمة. غير ذلك يحتاج اعتماد المكتب في شاشة «النسب والحاسبات».
- بعد الاعتماد، إذا تغيرت القيمة المستخرجة في إصدار لاحق من المكتبة يُعلَّم البند «تغيّر المصدر» ويحتاج مراجعة.
