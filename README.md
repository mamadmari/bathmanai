# bathmanai

Monorepo for the bathmanai.ir projects (migrated from the Iranian server to the German
server 193.36.84.150). The domain is served through the WCDN CDN, whose origin is the
German server.

## Contents

- `site/` — main portal (static: index.html, app.js, styles.css, fonts) → https://bathmanai.ir
- `blupaper/` — shop site (static) → https://blupaper.bathmanai.ir
- `jpx/` — jpx site (static)
- `clinic/` — "Clinic Mehr" appointment system (Node, port 8788) → https://clinic.bathmanai.ir
- `cryptodesk/` — crypto trading workbench (Node, port 8787) → https://cryptodesk.bathmanai.ir
- `dlbot/` — Telegram downloader bot + web panel (Node + sqlite, port 8792) → https://bathmanai.ir/dlbot/
- `deploy/` — nginx vhosts, systemd units, env template

## Notes

- Secrets are **not** in this repo. Real runtime env lives in `/etc/dlbot.env` on the server
  (see `deploy/env/dlbot.env.example` for the variable names).
- App data (`data/`, `*.sqlite`, downloaded media) is runtime state and is not tracked.
- TLS certificates are managed by certbot (`/etc/letsencrypt`) on the server.
