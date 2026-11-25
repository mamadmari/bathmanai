# Trading Wolf on the German box (migration of 25 Nov 2026)

Live copy: `https://wolf.bathmanai.ir` (origin `193.36.84.150`, wildcard
`*.bathmanai.ir` points at the WCDN edge which then proxies here).
The old box `46.249.100.102` (`/opt/trading-wolf`) is untouched and still
serves `wolf.nightmind.ir` — it is the rollback target.

## Host

- `root@193.36.84.150`, hostkey `SHA256:23KWzeL8wcFi5UuzURNVdCLZHgwVBWgG+PrXJBxUSws`,
  provider hostname `srv4700261119`, Ubuntu 26.04.
- **1 vCPU / 1.9 GB RAM** (shared with remnawave, pasarguard, nx-panel, bots).
  Compressed: `shared_buffers=128MB`, `max_connections=40`, `work_mem=4MB`, and a
  second 2 GB swap file (`/swapfile2`) as an OOM safety net. Upgrade or move the
  box before turning the engine to live mode.
- `chrony` keeps the clock in sync (exchange signatures die after 30 s of drift).

## Layout

| what | where |
| --- | --- |
| code (git `mamadmari/trading-wolf-ai`) | `/opt/trading-wolf` |
| static frontend | `/var/www/trading-wolf/dist` |
| pm2 apps | `wolf-api` (:3201), `wolf-worker`, `wolf-guard` |
| nginx vhost | `/etc/nginx/sites-available/wolf` -> `sites-enabled/wolf` |
| logs | `/var/log/wolf-*.out.log`, `/var/log/wolf-*.err.log` |
| db backups | `/root/backups/wolf_trading-*.dump` + `/etc/cron.d/wolf-backup` |
| secrets | `/opt/trading-wolf/.env` (mode 600, git-ignored) |

`APP_PORT=3201`: on this box port 3001 is published by the remnawave docker stack.
`DATABASE_URL` points at the local PostgreSQL 18 as role `wolf`.

## How it was moved

1. `rsync -a --exclude=backups --exclude='*.dump' /opt/trading-wolf/ de:/opt/trading-wolf/`
   (node_modules included, source and target are both Ubuntu 26.04 / Node 22).
2. German box: `apt install postgresql-18 redis-server`, `npm i -g pm2`.
3. `pg_dump -Fc` dump copied over, then restored:
   `install -o postgres /root/backups/<dump> /var/lib/postgresql/` **first** —
   `postgres` cannot read `/root` (mode 700) — then
   `pg_restore -d wolf_trading --no-owner --no-acl -j 4 <dump>`.
4. Ownership hand-over to the app role (`server/docs/sql/grant-wolf.sql`):
   tables/sequences/views + `ALTER DATABASE/Schema`. With `--no-owner` everything
   lands owned by `postgres` and the app dies with *permission denied for table*.
5. `cp -a dist /var/www/trading-wolf/dist`, pm2 three processes, nginx vhost,
   `certbot --nginx -d wolf.bathmanai.ir --no-redirect`.

## Shadow-period settings (turned off on purpose)

| key | value here | why |
| --- | --- | --- |
| `telegram.enabled` | `false` | otherwise both boxes post the same trade to the real channel |
| `bale.enabled` | `false` | the Bale bot long-polls `getUpdates`; two pollers fight over offsets |
| `engine.mode` | `demo` | no real orders anywhere during the move |

The Telegram bot uses a **webhook** (set only by an admin API call), so a second
api process cannot steal it. `wolf-guard` exits immediately while mode is `demo`.

## Cut-over checklist

1. Confirm on the new box: `curl -s localhost:3201/health`,
   `pm2 ls` (three `online`), worker log shows `tick ok`.
2. Set `telegram.enabled`/`bale.enabled` back to `true` **only** on the box that
   should own notifications.
3. Point `wolf.nightmind.ir` at the new origin (CDN origin change, not DNS) and
   purge the CDN cache; keep the old box running 48 h.
4. Then `pm2 stop wolf-worker` (or the whole stack) on the old box.
5. Admin panel: `/admin` (gate `wolf.admin.gate`) — engine switch stays in demo
   until the owner decides.

## Gotchas seen during the move

- WCDN served *Upstream Error* for `wolf.bathmanai.ir` until an nginx **443**
  vhost with a certificate for that exact name existed: the edge fetches the
  origin over HTTPS and an SNI/cert mismatch silently falls back to the default
  vhost. HTTP-01 for certbot works through the CDN, so the cert was issued
  directly on the origin.
- The CDN caches its error pages: bust with `?cb=<ts>` or purge in the WCDN panel.
- Do not add the origin IP as a `server_name` here — most hosts behind this CDN
  arrive with their real `Host`, and hijacking the IP would break `bathmanai.ir`.
