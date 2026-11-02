# النشر والتشغيل

## 1. خادم المكتب / Mac mini (بدون Docker)
```bash
# PostgreSQL
brew install postgresql@16 && brew services start postgresql@16     # macOS
createuser -P abusamir && createdb -O abusamir abusamir
# التطبيق
git clone <repo> && cd abusamir
cp .env.example .env   # اضبط DATABASE_URL, JWT_SECRET (32+ حرفًا), FILE_ENCRYPTION_KEY (openssl rand -hex 32), ADMIN_*
npm ci && npm run build
npx playwright install chromium
pip3 install -r python/requirements.txt
./scripts/install-fonts.sh
NODE_ENV=production npm start   # يطبق الهجرات ويحمّل البيانات المرجعية وينشئ المدير الأول ثم يخدم الواجهة على PORT
```
شغّله كخدمة دائمة (launchd على macOS أو systemd على Linux) وضع أمامه Nginx/Caddy بشهادة TLS واضبط `COOKIE_SECURE=true` و`CLIENT_ORIGIN`.

### ملاحظات Mac mini 16GB
- Chromium يُشغَّل عند كل تصدير PDF ويُغلق بعده؛ لا توجد نماذج محلية ثقيلة.
- الذكاء الاصطناعي اختياري وخارجي؛ اتركه `AI_PROVIDER=none` حتى يتم التفويض.

## 2. Docker
```bash
cp .env.example .env   # عدّل الأسرار
docker compose up -d --build
```
الخدمات: `db` (PostgreSQL 16 مع حجم دائم) و`app` (Node + Chromium + Python). التخزين في حجم `storage`.

## 3. النسخ الاحتياطي والاستعادة
- من الواجهة: إعدادات النظام → إنشاء نسخة (pg_dump مخصص + أرشيف الملفات) → "اختبار الاستعادة" يتحقق من سلامة الأرشيف.
- من الطرفية: `npm run backup -w server`.
- الاستعادة: `pg_restore --clean --if-exists -d "$DATABASE_URL" storage/backups/backup-<stamp>.dump` ثم `tar -xzf backup-<stamp>-files.tar.gz -C storage`.
- جدولة يومية عبر cron/launchd ونسخ خارجي مشفر.

## 4. الأمان
- غيّر `JWT_SECRET` و`ADMIN_PASSWORD` فورًا؛ يُجبر المدير على تغيير كلمة المرور عند أول دخول.
- `FILE_ENCRYPTION_KEY` يفعّل تشفير AES-256-GCM لكل الملفات المرفوعة والتقارير المخزنة.
- قفل الحساب 15 دقيقة بعد 5 محاولات فاشلة؛ جلسات 12 ساعة قابلة للإبطال.
- HTTPS إلزامي في الإنتاج (`COOKIE_SECURE=true`).
- سجل التدقيق لا يُحذف ضمن طلبات حذف البيانات.

## 5. الذكاء الاصطناعي (اختياري)
```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
AI_MODEL=claude-opus-5-5
AI_ALLOW_EXTERNAL=true
```
ثم من إعدادات النظام فعّل "السماح بالإرسال الخارجي" (يتطلب صلاحية مدير النظام وتفويضًا تعاقديًا من العميل). بدون ذلك تعمل كل الوظائف المحاسبية.

## 6. OCR
غير مضمّن. لتفعيله مستقبلًا: `apt install tesseract-ocr tesseract-ocr-ara` + `pip install pytesseract pillow` وتوسيع `python/extract_pdf.py`. حاليًا تُرفض الصور/PDF الممسوحة برسالة واضحة مع خيار الإدخال اليدوي.
