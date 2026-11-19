# bathmanai

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white" alt="Node.js 22">
  <img src="https://img.shields.io/badge/dependencies-0-success" alt="zero dependencies">
  <img src="https://img.shields.io/badge/nginx-1.28-009639?logo=nginx&logoColor=white" alt="nginx">
  <img src="https://img.shields.io/badge/TLS-Let's%20Encrypt-003A70?logo=letsencrypt&logoColor=white" alt="Let's Encrypt">
  <img src="https://img.shields.io/badge/docs-GitHub%20Pages-7c5cff" alt="docs">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
</p>

<p align="center">
  <b>یک اکوسیستم پنج‌ماژولی فارسی، بدون هیچ وابستگی npm.</b><br>
  Five independent Persian web products running on one Linux server with zero backend dependencies.
</p>

<p align="center">
  <a href="docs/index.html"><b>مستندات فنی و رزومه پروژه →</b></a>
</p>

---

## محصولات / Products

| ماژول | دامنه | پورت | ذخیره‌سازی | توضیح |
|---|---|---|---|---|
| `site/` | bathmanai.ir · www | – | فایل استاتیک | پورتال معرفی خدمات (سایت، پنل، ربات) |
| `blupaper/` | blupaper.bathmanai.ir | – | فایل استاتیک | فروشگاه بگ بنددار و باکس چاپ اختصاصی |
| `jpx/` | – | – | فایل استاتیک | صفحه فرود مستقل |
| `clinic/` | clinic.bathmanai.ir | 8788 | JSON (atomic) | سامانه نوبت‌دهی پزشکی با پنل بیمار و مدیر |
| `cryptodesk/` | cryptodesk.bathmanai.ir · trade | 8787 | کش در حافظه | میز کار معاملات کریپتو با نمودار و ماشین‌حساب |
| `dlbot/` | bathmanai.ir/dlbot/ | 8792 | SQLite | ربات دانلودر تلگرام + پنل وب |

## پشته فنی / Stack

- **Runtime:** Node.js 22 — فقط ماژول‌های داخلی (`http`, `fs`, `path`, `crypto`, `node:sqlite`)
- **Frontend:** HTML5, CSS3 (Grid/Flex), Vanilla JS, Canvas 2D, Vazirmatn (self-hosted, RTL)
- **Infrastructure:** Ubuntu 26.04, Nginx (reverse proxy + TLS), systemd, certbot/Let's Encrypt, CDN
- **Integrations:** Telegram Bot API, yt-dlp, ffmpeg, market data API
- **Tooling:** Git, GitHub (deploy key), SSH, rsync, bash, PowerShell

## اجرای محلی / Run locally

```bash
node clinic/server.js          # http://127.0.0.1:8788
node cryptodesk/server.js      # http://127.0.0.1:8787
node --experimental-sqlite dlbot/src/server.js   # :8792 (needs /etc/dlbot.env)
```

هیچ `npm install`ی لازم نیست — پوشه‌ی `node_modules` وجود ندارد.

## استقرار / Deploy

```bash
git clone git@github.com:mamadmari/bathmanai.git /srv/bathmanai-repo
cd /srv/bathmanai-repo

cp deploy/nginx/*.conf /etc/nginx/sites-available/   # remove .conf suffix on the server
cp deploy/systemd/*.service /etc/systemd/system/
cp deploy/env/dlbot.env.example /etc/dlbot.env        # fill real values
chmod 600 /etc/dlbot.env

systemctl daemon-reload
systemctl enable --now clinic cryptodesk dlbot
nginx -t && systemctl reload nginx
```

مسیرها روی سرور: `/var/www/{bathmanai,blupaper,jpx}` و `/opt/{clinic,cryptodesk,dlbot}`.

## امنیت / Security

- رازها فقط در `/etc/dlbot.env` (مجوز 600) — داخل مخزن نیستند؛ الگو در `deploy/env/dlbot.env.example`.
- سرویس‌ها روی `127.0.0.1` گوش می‌دهند؛ فقط 80/443 عمومی است.
- ورود SSH فقط با کلید؛ TLS با تمدید خودکار.
- داده‌ی کاربران، دیتابیس و فایل‌های دانلود در `.gitignore`.

## مستندات / Docs

- صفحه‌ی کامل مستندات و رزومه: [`docs/index.html`](docs/index.html) (با GitHub Pages منتشر می‌شود)
- معماری، ماژول‌ها، آمار کد، امنیت و فرآیند استقرار در همان صفحه آمده است.

## ساختار / Layout

```
site/          # bathmanai.ir portal
blupaper/      # shop
jpx/           # landing page
clinic/        # appointment system (Node, JSON storage)
cryptodesk/    # market workbench (Node, REST API)
dlbot/         # telegram downloader bot + web panel (Node, SQLite)
deploy/        # nginx vhosts, systemd units, env template
docs/          # technical documentation & resume page
.github/       # CI + GitHub Pages workflows
```

## مجوز / License

MIT — استفاده و بازنشر با ذکر منبع آزاد است.
