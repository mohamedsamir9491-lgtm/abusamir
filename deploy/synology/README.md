# النشر على Synology NAS (DSM 7 + Container Manager)

المتطلبات: NAS بمعالج x86_64 (معظم أجهزة Plus/+)، حزمة **Container Manager** مثبتة، ومساحة 3 جيجابايت تقريبًا لصورة التطبيق (تتضمن Chromium لتوليد PDF).

## الطريقة أ: من واجهة DSM (بدون طرفية)
1. **File Station** → أنشئ المجلد `docker/abusamir` ثم داخله المجلد `src`.
2. حمّل المشروع من GitHub كملف ZIP (الفرع `claude/accounting-platform`) وفك ضغطه داخل `src` بحيث يصبح الملف `src/Dockerfile` موجودًا.
3. انسخ الملفين `deploy/synology/docker-compose.yml` و`deploy/synology/.env.example` إلى `docker/abusamir`، وأعد تسمية `.env.example` إلى `.env` وعدّل القيم (كلمة مرور قاعدة البيانات، `JWT_SECRET`، `ADMIN_PASSWORD`، `CLIENT_ORIGIN`).
4. **Container Manager → Project → Create**: الاسم `abusamir`، المسار `docker/abusamir`، المصدر "Use existing docker-compose.yml" → Next → Build. أول بناء يستغرق عدة دقائق.
5. بعد التشغيل افتح `http://<IP-الـNAS>:4000` وسجّل الدخول بـ `ADMIN_EMAIL`/`ADMIN_PASSWORD` ثم غيّر كلمة المرور.

## الطريقة ب: عبر SSH (أسرع للتحديثات)
```bash
ssh <user>@sahm5.synology.me -p <ssh-port>
sudo -i
mkdir -p /volume1/docker/abusamir && cd /volume1/docker/abusamir
curl -fsSL https://raw.githubusercontent.com/mohamedsamir9491-lgtm/abusamir/claude/accounting-platform/deploy/synology/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/mohamedsamir9491-lgtm/abusamir/claude/accounting-platform/deploy/synology/.env.example -o .env.example
curl -fsSL https://raw.githubusercontent.com/mohamedsamir9491-lgtm/abusamir/claude/accounting-platform/deploy/synology/deploy.sh -o deploy.sh
cp .env.example .env && vi .env        # عدّل القيم
bash deploy.sh                          # يجلب الكود ويبني ويشغّل
```
التحديث لاحقًا: `bash deploy.sh` مرة أخرى.

## الوصول الآمن عبر HTTPS (Reverse Proxy في DSM)
Control Panel → Login Portal → Advanced → **Reverse Proxy** → Create:
- Source: HTTPS، hostname `sahm5.synology.me`، port مثل `4443` (أو subdomain مخصص) — واستخدم شهادة DSM الحالية.
- Destination: HTTP، `localhost`، port `4000`.
- في Custom Header فعّل **WebSocket** (اختياري) واضبط `CLIENT_ORIGIN` في `.env` على العنوان نفسه ثم أعد تشغيل الحاوية.
افتح المنفذ 4443 في الراوتر/الجدار الناري إن أردت الوصول من الخارج، ولا تفتح 4000 مباشرة.

## النسخ الاحتياطي
- بيانات قاعدة البيانات والملفات في `docker/abusamir/data` — أضف هذا المجلد إلى **Hyper Backup**.
- من داخل التطبيق: إعدادات النظام → إنشاء نسخة احتياطية (pg_dump + أرشيف الملفات) تُحفظ في `data/storage/backups`.

## استكشاف الأعطال
- `docker logs -f abusamir-app` لمتابعة سجل التطبيق، و`docker logs abusamir-db` لقاعدة البيانات.
- إن فشل بناء الصورة لمعالج ARM: الـ NAS غير مدعوم لصورة Chromium؛ شغّل التطبيق على Mac mini بدلًا منه (انظر docs/DEPLOYMENT.md).
- تغيير `ADMIN_PASSWORD` بعد أول تشغيل لا يؤثر؛ غيّر كلمة المرور من داخل التطبيق.
