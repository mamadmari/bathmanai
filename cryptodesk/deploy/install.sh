#!/usr/bin/env bash
# نصب/بروزرسانی CryptoDesk روی سرور اوبونتو
# اجرا: bash /opt/cryptodesk/deploy/install.sh
set -euo pipefail

APP_DIR="/opt/cryptodesk"
PORT="${PORT:-8787}"
SERVICE="cryptodesk"

if [ "$(id -u)" -ne 0 ]; then
  echo "این اسکریپت باید با کاربر root اجرا شود." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js نصب نیست. ابتدا: apt-get install -y nodejs" >&2
  exit 1
fi

NODE_BIN="$(command -v node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 16 ]; then
  echo "Node.js 16 یا بالاتر لازم است (نسخه فعلی: $(node -v))" >&2
  exit 1
fi

mkdir -p "$APP_DIR"

cat > "/etc/systemd/system/${SERVICE}.service" <<UNIT
[Unit]
Description=CryptoDesk - Persian crypto trading workbench
Documentation=https://github.com/
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=PORT=${PORT}
Environment=NODE_ENV=production
ExecStart=${NODE_BIN} server.js
Restart=always
RestartSec=3
LimitNOFILE=4096
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1 || true
systemctl restart "$SERVICE"
sleep 2

if ! systemctl is-active --quiet "$SERVICE"; then
  echo "سرویس بالا نیامد؛ لاگ:" >&2
  journalctl -u "$SERVICE" -n 40 --no-pager >&2
  exit 1
fi

if command -v nginx >/dev/null 2>&1; then
  if [ -d /etc/nginx/sites-available ]; then
    if [ -f /etc/nginx/sites-enabled/default ]; then
      rm -f /etc/nginx/sites-enabled/default
    fi
    sed "s/__PORT__/${PORT}/g" "${APP_DIR}/deploy/nginx-cryptodesk.conf" \
      > /etc/nginx/sites-available/"${SERVICE}"
    ln -sf /etc/nginx/sites-available/"${SERVICE}" /etc/nginx/sites-enabled/"${SERVICE}"
    if nginx -t >/dev/null 2>&1; then
      systemctl enable nginx >/dev/null 2>&1 || true
      systemctl reload nginx || systemctl restart nginx
      echo "nginx پیکربندی شد (پورت 80)."
    else
      echo "پیکربندی nginx معتبر نبود؛ از پورت ${PORT} استفاده کنید." >&2
      nginx -t >&2 || true
    fi
  fi
fi

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw allow "${PORT}/tcp" >/dev/null 2>&1 || true
  echo "قواعد فایروال اعمال شد."
fi

sleep 1
echo "--- وضعیت سرویس ---"
systemctl --no-pager --lines=0 status "$SERVICE" | head -6
echo "--- بررسی سلامت محلی ---"
if curl -fsS --max-time 8 "http://127.0.0.1:${PORT}/api/health"; then
  echo
  echo "CryptoDesk فعال است: http://<server-ip>:${PORT}"
else
  echo "پاسخ سلامت دریافت نشد." >&2
  exit 1
fi
