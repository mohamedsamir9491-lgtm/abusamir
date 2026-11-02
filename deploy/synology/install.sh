#!/bin/bash
# تثبيت/تحديث منصة التحليل المالي على Synology DSM - يُنفَّذ على الـ NAS بصلاحية root:
#   sudo bash install.sh
# يجلب الكود من GitHub (فرع claude/accounting-platform)، ينشئ .env بمفاتيح عشوائية عند أول مرة، يبني الحاويات ويشغّلها.
set -euo pipefail
DIR="${INSTALL_DIR:-/volume1/docker/abusamir}"
BRANCH="${REPO_BRANCH:-claude/accounting-platform}"
TARBALL="https://codeload.github.com/mohamedsamir9491-lgtm/abusamir/tar.gz/refs/heads/${BRANCH}"
export PATH="$PATH:/usr/local/bin:/var/packages/ContainerManager/target/usr/bin:/var/packages/Docker/target/usr/bin"
echo "== [1/5] التحقق من Docker"
command -v docker >/dev/null || { echo "Docker غير موجود. ثبّت حزمة Container Manager من Package Center ثم أعد المحاولة."; exit 1; }
if docker compose version >/dev/null 2>&1; then DC="docker compose"; elif command -v docker-compose >/dev/null; then DC="docker-compose"; else echo "docker compose غير متاح"; exit 1; fi
mkdir -p "$DIR/data/postgres" "$DIR/data/storage" && cd "$DIR"
echo "== [2/5] تنزيل الكود ($BRANCH)"
rm -rf src.new && mkdir src.new
curl -fsSL "$TARBALL" | tar xz -C src.new --strip-components=1
rm -rf src && mv src.new src
cp src/deploy/synology/docker-compose.yml docker-compose.yml
echo "== [3/5] إعداد .env"
if [ ! -f .env ]; then
  rnd() { openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
  ADMIN_PW="Ab$(rnd 4)!$(rnd 3)"
  cat > .env <<ENV
DB_PASSWORD=$(rnd 24)
APP_PORT=${APP_PORT:-4000}
JWT_SECRET=$(rnd 32)
FILE_ENCRYPTION_KEY=$(rnd 32)
# غيّرها إلى عنوان HTTPS بعد إعداد Reverse Proxy في DSM ثم: docker compose up -d
CLIENT_ORIGIN=http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost):${APP_PORT:-4000}
COOKIE_SECURE=false
SESSION_HOURS=12
MAX_UPLOAD_MB=25
ADMIN_EMAIL=admin@office.local
ADMIN_PASSWORD=$ADMIN_PW
ADMIN_NAME=مدير النظام
AI_PROVIDER=none
ANTHROPIC_API_KEY=
AI_MODEL=claude-opus-5-5
AI_ALLOW_EXTERNAL=false
ENV
  chmod 600 .env
  echo "   أُنشئ ملف .env بمفاتيح عشوائية. كلمة مرور المدير الأولى محفوظة فيه (ADMIN_PASSWORD) ويُطلب تغييرها عند أول دخول."
else
  echo "   ملف .env موجود - لم يُغيَّر."
fi
echo "== [4/5] بناء صورة التطبيق (قد يستغرق 5-15 دقيقة أول مرة)"
$DC build app
echo "== [5/5] التشغيل"
$DC up -d
PORT=$(grep -E '^APP_PORT=' .env | cut -d= -f2)
for i in $(seq 1 40); do sleep 3; if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then OK=1; break; fi; done
$DC ps
if [ "${OK:-0}" = "1" ]; then
  IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  echo "✅ التطبيق يعمل: http://${IP}:${PORT}  (الدخول: ADMIN_EMAIL و ADMIN_PASSWORD من الملف $DIR/.env)"
  echo "   لعرض كلمة المرور الأولى: grep ADMIN_PASSWORD $DIR/.env"
else
  echo "❌ لم يستجب التطبيق بعد. راجع السجل: docker logs --tail 100 abusamir-app"
fi
