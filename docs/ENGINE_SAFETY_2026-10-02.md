# Engine safety checkpoint — 2026-10-02

This is a partial implementation, not a production release or a profitability claim.

## Root causes corrected

- Settings database failures previously became trading defaults. They now propagate.
- PostgreSQL JSONB string values were reparsed as JSON and silently dropped. The driver-decoded values are now preserved. Null values fail closed.
- Opportunistic mode defaults to false. Existing explicit database values are not overwritten.
- Automatic entry validates finite, positive, correctly ordered exit prices before risk checks.
- Symbol notional caps previously capped margin and multiplied that cap by leverage. The cap now applies to notional and subtracts existing symbol exposure.
- Automatic live entries require confirmed available broker capital. Binance uses free USDT, not locked USDT; MT5 requires explicit free_margin or margin_free. Adapters without this capability cannot pass this gate.
- Entry quantity rounds down rather than potentially rounding above the capital limit.

## Verification actually performed

- `bun.cmd test tests/`: 214 passed, 0 failed, 17 files, exit code 0.
- `npm.cmd run build` in server: passed, exit code 0.
- `git diff --check`: passed; CRLF normalization warnings only.
- New tests cover strict exit geometry, notional cap boundary/reduction, zero executable size, freshness utility boundaries, database read failure, preservation of settings, null settings, and unavailable/locked Binance funds.

These include mocks and pure unit tests. They are not proof of live execution or complete end-to-end SIM. The freshness helper is not yet a canonical feed integration.

## Release blockers still outstanding

- Manual entry still needs the same durable execution/risk pipeline as automatic entry.
- Startup exchange/DB reconciliation, partial fill persistence and protection require implementation and integration tests.
- Exchange-specific lot step and minimum notional are not yet used by the cap helper; engine supplies a numerical floor, not a verified exchange executable minimum.
- Broker equity/risk budgeting, pending order capital reservation, and portfolio-wide risk need a single authoritative reconciliation-backed snapshot.
- Futures reduce-only support is incomplete across adapters.
- Canonical WS feed recovery, family-weighted consensus, exact signal/plan lifecycle and deduplication are incomplete.
- Premium API redaction, persistent Telegram outbox, settings revision/preset conflict handling, UI accounting, and real watchdog recovery remain open.
- The complete requested failure matrix, database-backed API tests, restart simulation and end-to-end SIM have not been run for this checkpoint.

Production deployment is intentionally withheld until these gates are satisfied.
