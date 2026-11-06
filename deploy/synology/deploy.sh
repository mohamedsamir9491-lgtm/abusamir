#!/bin/bash
# تشغيل عبر SSH على الـ NAS: bash deploy.sh  (من داخل مجلد المشروع /volume1/docker/abusamir)
# يجلب آخر نسخة من GitHub إلى مجلد src ثم يبني ويشغّل الحاويات
set -e
cd "$(dirname "$0")"
REPO="${REPO_URL:-https://github.com/mohamedsamir9491-lgtm/abusamir.git}"
BRANCH="${REPO_BRANCH:-claude/accounting-platform}"
if [ ! -f .env ]; then echo "أنشئ ملف .env أولًا (انسخ .env.example وعدّل القيم)"; exit 1; fi
if [ -d src/.git ]; then (cd src && git fetch origin "$BRANCH" && git checkout -q "$BRANCH" && git pull -q origin "$BRANCH"); else git clone -b "$BRANCH" "$REPO" src; fi
(cd src && git rev-parse HEAD > COMMIT 2>/dev/null) || true
mkdir -p data/postgres data/storage
DC="docker compose"; command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1 && DC="docker-compose"
$DC build app
$DC up -d
echo "تم. افتح http://<عنوان-الـNAS>:$(grep -E '^APP_PORT=' .env | cut -d= -f2 | tr -d ' ' || echo 4000)"
$DC ps
