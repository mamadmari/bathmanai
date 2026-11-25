# Deploying Trading Wolf on a fresh server

Everything below was reconstructed from the running production box
(`/opt/trading-wolf` on 46.249.100.102). Secret values are **never** kept in this
file or in git — they live only in `.env` (see the variable names at the end).

## 1. Host

- Ubuntu 24.04/26.04, 2+ vCPU, **4 GB RAM minimum** (1 GB is not enough for
  PostgreSQL + Redis + api + worker + guard), 60 GB disk.
- Packages: `nginx`, `postgresql`, `redis-server`, `git`, `chrony`, `ufw`, `curl`.
- Node 22 LTS (`nvm` or NodeSource) and `pm2` (`npm i -g pm2`).
- `chrony` must be running and in sync: the exchanges reject signatures older
  than 30 seconds, so a drifting clock stops all reads and writes.

## 2. Database and cache

```
sudo -u postgres createuser wolf -P            # password goes into POSTGRES_PASSWORD
sudo -u postgres createdb -O wolf wolf_trading
# restore an existing installation
sudo -u postgres pg_restore -d wolf_trading --no-owner /root/backups/wolf_trading-<date>.dump
```

`server/migrations/*.sql` creates the schema from scratch:
`cd server && npm run migrate` (needs `DATABASE_URL`).

## 3. Code and builds

```
git clone git@github.com:mamadmari/trading-wolf-ai.git /opt/trading-wolf
cd /opt/trading-wolf && npm ci && npm run build          # frontend -> dist/
cd server && npm ci && npm run build                     # backend  -> server/dist/
cp -a /opt/trading-wolf/dist /var/www/trading-wolf/dist  # nginx static root
```

## 4. `.env` (names only)

Frontend: `VITE_BACKEND`, `VITE_API_URL`.
Backend: `NODE_ENV`, `APP_NAME`, `APP_PORT`, `APP_DOMAIN`, `APP_URL`,
`POSTGRES_PASSWORD`, `DATABASE_URL`, `DB_POOL_SIZE`, `REDIS_URL`, `APP_SECRET`,
`ENCRYPTION_KEY`, `CORS_ORIGINS`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`,
`TELEGRAM_ADMIN_ID`, `TELEGRAM_ASSISTANT_ID`, `TELEGRAM_CHANNEL_ID`,
`TELEGRAM_CHANNEL_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`,
`TELEGRAM_MINI_APP_URL`, `AI_PROVIDER`, `AI_MODEL`, `AI_KEY`,
`AI_PROVIDER_2`, `AI_MODEL_2`, `AI_KEY_2`, `AI_ENABLED`,
`SWAPWALLET_API_KEY`, `USDT_RATE`, `USDT_NETWORK`, `ENGINE_MODE`,
`ENGINE_CAPITAL`, `ENGINE_AUTONOMOUS`, `RISK_MIN_SCORE`, `RISK_MIN_CONFIDENCE`,
`RISK_RISK_PER_TRADE`, `RISK_MAX_LEVERAGE`, `BALE_BOT_TOKEN`.

`APP_SECRET` + `ENCRYPTION_KEY` are the pair that decrypts everything stored in
`exchange_accounts` and `system_settings` (the Wallex key included): copy them
from the old server or every stored secret has to be re-entered.

## 5. Processes

```
pm2 start server/dist/api.js    --name wolf-api    --cwd /opt/trading-wolf
pm2 start server/dist/worker.js --name wolf-worker --cwd /opt/trading-wolf
pm2 start server/scripts/guard.mjs --name wolf-guard --cwd /opt/trading-wolf
pm2 save && pm2 startup systemd
```

- `wolf-api` listens on `APP_PORT` (3001).
- `wolf-worker` runs the engine tick (reads `getSettings()` every cycle, so
  settings changes apply without a restart).
- `wolf-guard` only acts on **live** positions; it is the independent
  stop-loss/take-profit loop (Wallex has no resting stop order).

## 6. nginx

Copy `/etc/nginx/sites-enabled/wolf` from the old box. It is one `server` block
with `server_name _`, `root /var/www/trading-wolf/dist`, `/api/` and `/ws`
proxied to `127.0.0.1:3001`, `= /health` proxied, `index.html` served with
`no-store`, plus the CSP/HSTS headers. TLS is issued with
`certbot --nginx -d <domain>`.

## 7. Backups

```
# daily database dump (keeps 7 days)
0 4 * * * root pg_dump -Fc wolf_trading > /root/backups/wolf_trading-$(date +\%F).dump && find /root/backups -name 'wolf_trading-*.dump' -mtime +7 -delete
# code without node_modules/dist/secrets
tar czf /root/backups/wolf-code-$(date +\%F).tar.gz --exclude=node_modules --exclude=dist \
  --exclude=backups --exclude=.env -C /opt/trading-wolf .
```

## 8. Smoke test

```
curl -s http://127.0.0.1:3001/health
curl -s https://<domain>/api/rates/usdt
pm2 logs wolf-worker --lines 20      # expects "tick ok - scanned=N opened=M"
```

Then sign in on `/auth`, open `/app` (member console) and `/admin` (console).
