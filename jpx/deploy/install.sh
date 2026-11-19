#!/usr/bin/env bash
# نصب/بروزرسانی پورتال JPX روی nginx
# اجرا: bash /var/www/jpx/deploy/install.sh
set -euo pipefail

SITE_ROOT="/var/www/jpx/site"
DEPLOY_DIR="/var/www/jpx/deploy"
SITE_NAME="jpx"

if [ "$(id -u)" -ne 0 ]; then
  echo "این اسکریپت باید با کاربر root اجرا شود." >&2
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "nginx نصب نیست. ابتدا: apt-get install -y nginx" >&2
  exit 1
fi

mkdir -p "$SITE_ROOT" "$DEPLOY_DIR"

if [ ! -f "$SITE_ROOT/index.html" ]; then
  echo "هشدار: $SITE_ROOT/index.html وجود ندارد؛ ابتدا فایل‌های سایت را آپلود کنید." >&2
fi

chown -R root:root /var/www/jpx
find "$SITE_ROOT" -type d -exec chmod 755 {} +
find "$SITE_ROOT" -type f -exec chmod 644 {} +

CONF_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/nginx-jpx.conf"
if [ ! -f "$CONF_SRC" ]; then
  echo "فایل nginx-jpx.conf در کنار اسکریپت پیدا نشد." >&2
  exit 1
fi

install -m 644 "$CONF_SRC" "/etc/nginx/sites-available/${SITE_NAME}"
ln -sf "/etc/nginx/sites-available/${SITE_NAME}" "/etc/nginx/sites-enabled/${SITE_NAME}"

# فقط پورتال باید default_server باشد؛ از بقیه سایت‌ها این پرچم را برمی‌داریم.
if [ -d /etc/nginx/sites-enabled ]; then
  for f in /etc/nginx/sites-enabled/*; do
    [ -f "$f" ] || continue
    case "$f" in
      *"/${SITE_NAME}") continue ;;
    esac
    if grep -q "default_server" "$f" 2>/dev/null; then
      sed -i 's/[[:space:]]\{1,\}default_server//g' "$f"
    fi
  done
fi

if ! nginx -t; then
  echo "پیکربندی nginx معتبر نیست." >&2
  exit 1
fi

systemctl enable nginx >/dev/null 2>&1 || true
systemctl reload nginx || systemctl restart nginx

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  echo "قواعد فایروال بررسی شد."
fi

sleep 1
echo "--- بررسی پورتال ---"
if curl -fsS --max-time 8 -H "Host: jpx.ir" "http://127.0.0.1/healthz"; then
  echo "پورتال JPX فعال است."
else
  echo "پاسخ سلامت پورتال دریافت نشد." >&2
  exit 1
fi

echo "--- بررسی پروکسی اپ ---"
if curl -fsS --max-time 8 -H "Host: trade.jpx.ir" "http://127.0.0.1/api/health" >/dev/null; then
  echo "ساب‌دامین trade به CryptoDesk وصل است."
else
  echo "هشدار: trade.jpx.ir هنوز پاسخ نمی‌دهد (سرویس cryptodesk را بررسی کنید)." >&2
fi
