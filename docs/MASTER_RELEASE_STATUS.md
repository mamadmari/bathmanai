# Master release status — 2026-09-25

This is an evidence-limited checkpoint, not a production release approval. The attached master plan covers the entire product; the release branch also contains subsequent wallet, Telegram authentication, ownership, engine allocation, and migration changes.

## VERIFIED DONE

- REST backend trade alert formatter now reads both PostgreSQL snake_case fields and legacy camelCase fields. Local tests cover open and close alerts in Persian and English.
- Trade alerts use `telegram.enabled`, `channel.postTrades`, `channel.id`, and `channel.enId` settings. The frontend exposes these settings; delivery to actual channels has not been tested.
- Strategy preset selection no longer silently changes risk thresholds. Risk presets continue to set their own values.
- Local server TypeScript build succeeded; existing 184 tests and two additional alert tests passed.
- On 2026-09-25, all migrations 0001–0011 applied to a separate empty PostgreSQL database `wolf_release_staging_20260925`; this does not prove they are safe on production data.
- The isolated database withdrawal concurrency script passed: 100 concurrent 3-USDT requests against a 100-USDT wallet yielded 33 accepted, 67 rejected, 1 USDT remaining, 33 ledger entries totaling -99 USDT; replay of the same idempotency key returned the prior result. No production funds were touched.
- Server TypeScript build and 193 local tests pass at commit `620cef8` on GitHub branch `release/product-overhaul`. This is not a complete E2E test.
- MT5 live adapter no longer invents a 10,000 balance or successful entry/exit without a broker bridge. A bridge acknowledgement without a broker ticket and confirmed fill is rejected. Two offline adapter tests pass; broker-native integration and reconciliation are still pending.
- Live forex scan now requires candles and a quote from the MT5 bridge. Monitoring an already-open live forex position does not calculate P&L or trigger an exit using an old market quote or public-market proxy when the broker quote is unavailable. Offline regression test covers the missing-bridge candle path; live broker behavior remains untested.
- Binance spot order request now uses signed POST and requests a full response; an acknowledgement without a confirmed fill is not recorded as a completed position. A mocked transport test verifies the HTTP method and rejection. Partial fills/timeouts must be reconciled against the exchange before live trading is enabled.
- Crypto stop/target precision now preserves the entry's fractional digits (up to the database's 8-digit scale), preventing low-price symbols such as SHIB from rounding protective levels to zero; repeated breakeven logging without an actual stop improvement is prevented. Unit tests cover SHIB and unchanged configured forex precision. This does not validate broker tick sizes or guarantee a profitable exit.
- The engine monitors pre-existing open positions even when no markets are enabled; previously the empty-market return skipped all position monitoring. The server builds and local suite pass; this path still needs an isolated database integration test.
- Jev Trader design review is recorded in `docs/JEV_TRADER_INTEGRATION.md`. The engine now takes one PostgreSQL advisory lock over monitoring and scanning. Live entry records a durable order intent and requires a full priced fill; uncertain outcomes block further entry on that symbol for manual reconciliation. The unit suite checks lock contention and fill validity, but real broker lifecycle and multi-worker staging tests are pending.
- On 2026-09-25, isolated PostgreSQL staging check `server/scripts/engine-intent-staging-check.mjs` passed: a second connection could not acquire the engine lock, the lock released correctly, and an unresolved live order intent remained queryable; the fixture was rolled back. This verifies database primitives, not an entire running two-worker/broker lifecycle.
- Live full and partial exits now record an order intent and refuse to mutate a position or settle customer capital without a confirmed broker fill at an actual price; an ambiguous outcome remains pending reconciliation. A mock MT5 response test verifies ticket/price/quantity handling. The extended staging script and a real broker lifecycle test are still pending.

## PARTIALLY DONE

- Forex freshness, low-volume rejection, and daily trade limits were located in the engine, but live data feeds and end-to-end outcomes were not validated.
- A live MT5 bridge must provide verifiable fill/close details before live forex can work. The exact bridge response schema and account mapping have not been integrated or tested against a real broker; do not enable live forex execution yet.
- Strategy presets select strategy rows and save selection, but an initial preset is not automatically applied to existing installations; no production database inspection was done in this checkpoint.
- Wallet withdrawals validate decimal input, serialize the debit per wallet, and support a unique retry key; the isolated 100-request PostgreSQL test passed. Unfreeze approval transfers available frozen funds back to available balance, but its end-to-end flow is untested.
- Telegram Mini App signatures now use the correct binary HMAC secret and check freshness. Linking and withdrawal verification use signed identity; local signature tests passed, but a real Telegram session is untested.
- Wallet transaction deletion is blocked by a new migration; duplicate wallet migration preserves transaction references. Both migrations ran on an empty staging database but require realistic-data dry-run and backup verification.
- Private `/api/me/positions`, `/api/me/trades`, `/api/me/orders`, `/api/me/transactions`, and account/dashboard queries now filter by authenticated user. Ownership tests with two distinct users are still pending.
- Engine capital allocation now locks frozen wallets before computing outstanding reservations, preventing concurrent entries from relying on the same unlocked snapshot. Settlement caps the user's loss at frozen equity across USDT wallets and records any uncovered loss as a platform deficit. Unit tests cover exact fractional amounts and multiple wallets; database concurrency and reconciliation remain unverified.

## NOT DONE

- Full product/architecture/security/financial audit, canonical decimal ledger, AI/Arena/mobile/E2E/load tests, realistic-data migration and rollback exercises.
- Confirm actual channel delivery, both channel IDs and bot permissions against staging.

## BLOCKED

- Production release: realistic-data migration, security/E2E gates and verified backup/rollback are absent from this checkpoint; one isolated concurrency gate passed.
- Live withdrawal settlement proof and broker reconciliation need an integration and operational review before real-money use.
- MT5 live execution requires real broker confirmation and reconciliation before real-money use. The adapter currently fails closed in the absence of a bridge.
- Repository-wide lint currently fails with 1,875 errors and 24 warnings; the baseline is not a passing release gate.
- A first SSH probe failed, but a later read-only connection using the existing authorized key succeeded. The isolated staging database and staging files are on the server. No production service, database, or web files were deployed from this branch.

## DEFERRED

- Production deployment and any change to live execution, risk limits, stale-data or liquidity guards until feed and accounting verification.
