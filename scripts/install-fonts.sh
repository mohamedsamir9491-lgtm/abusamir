#!/usr/bin/env bash
# تثبيت الخطوط العربية على مستوى النظام ليستخدمها Chromium في ترويسة/تذييل PDF
# Linux: ~/.local/share/fonts أو /usr/local/share/fonts ؛ macOS: ~/Library/Fonts
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HERE/server/assets/fonts/ttf"
if [[ "$(uname)" == "Darwin" ]]; then DEST="$HOME/Library/Fonts"; else DEST="${FONT_DIR:-$HOME/.local/share/fonts/abusamir}"; fi
mkdir -p "$DEST"
cp "$SRC"/*.ttf "$DEST"/
command -v fc-cache >/dev/null 2>&1 && fc-cache -f "$DEST" >/dev/null 2>&1 || true
echo "تم تثبيت الخطوط في $DEST"
