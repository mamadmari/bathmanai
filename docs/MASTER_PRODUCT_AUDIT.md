# Product audit — initial findings (2026-09-25)

This is an initial, limited code audit. It does not claim completion of the master plan's full audit.

## Current architecture and flows verified in code

- React dashboard reads settings and strategy presets through REST compatibility mappings.
- Node/TypeScript server reads PostgreSQL system settings and strategy rows; worker evaluates market candles, validates opportunities, creates positions, monitors exits, and calls the Telegram bridge.
- Risk presets write risk settings; strategy presets enable a curated set of database strategies.

## Reproduced code defects

- Trade notifications formatted PostgreSQL records using camelCase TP, SL and strategy names, resulting in `undefined` prices and missing strategy names.
- Engine notification gates read legacy `notify.*` flags, while the dashboard edits `telegram.enabled` and `channel.postTrades`.
- Server trade notifications ignored `channel.enId`.
- Strategy preset applications silently replaced risk settings, obscuring which risk profile actually controlled the engine.

## Trade skip reasons located

- `stale data`: execution timeframe candle is older than two timeframe intervals. Feed freshness needs provider testing before any relaxation.
- `VOLUME_DROUGHT`: crypto volume below the near-zero threshold is rejected; provider volume accuracy remains unverified.
- `سقف معاملات روزانه`: the old implementation counted exit rows, including partial exits, instead of entries. The patch counts distinct daily entries and records the original opening time on all exit rows. The intended trading-day timezone still needs confirmation.

## Unverified areas

Financial ledger/concurrency, user authorization, withdrawal state machine, AI, gamification, complete UX/mobile, security, CI, staging and production runtime were not audited. Do not infer release readiness from the local build and tests.

## Financial and security findings from the second code review

- A withdrawal checked a wallet balance before entering the transaction and ignored whether its conditional debit affected any row. Competing requests could have inserted withdrawal records even when only one debit succeeded.
- Unfreeze approval reduced `frozen` without crediting spendable `balance`. It also ignored capital allocated to open positions.
- The initial wallet deduplication migration referenced columns not created by earlier migrations and deleted duplicate wallets while ledger records had a cascading foreign key.
- The admin user deletion path erased wallet transactions. It now disables access and revokes sessions; historical data remains.
- Mini App verification used hexadecimal hash strings in place of the binary HMAC secret described in Telegram's Mini App specification. Telegram account linking trusted a supplied ID without verifying signed `initData`; the one-time withdrawal confirmation REST mapping incorrectly targeted the withdrawal endpoint.
- Financial settlement and fee calculations still use JavaScript floating point in the engine. Confirmed withdrawals are still approved manually; there is no on-chain settlement verification. These remain release blockers.
- `/api/dashboard` originally returned other users' and unowned positions, closed trades and aggregate profit in a private response. `/api/account` similarly returned unowned open positions and estimated an individual's earnings from global trade profit. The patch scopes private rows and derives the customer's share from the capital-allocation records; a two-user authorization test remains pending.
- `orders` had no `user_id`; a nullable owner column is added. Legacy unowned orders cannot be attributed to a customer without trustworthy provenance.
- Before the new engine patch, two simultaneous entries could read the same unallocated frozen funds. Settlement capped a wallet at zero but recorded the entire negative PnL as a customer ledger debit. The patch serializes reservations and distinguishes the applied customer loss from the platform-funded deficit; the source PnL calculation still needs canonical decimal math and exchange reconciliation.
