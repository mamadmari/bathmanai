# Jev Trader review and scoped adaptation

Source: `jarrodwatts/jev-trader`, reviewed at commit `b587759e459ea049590102e54a0b07800864cdc3` (MIT, Jarrod Watts, 2026).
No source files or substantial code were copied; the design ideas below were independently implemented for this PostgreSQL/REST trading engine.

- Adopted: one in-flight decision loop. A PostgreSQL session advisory lock now covers position monitoring and market scans across workers; it is not limited by a Redis expiry. The same connection holds and releases the lock.
- Adopted: order intent is separate from confirmed execution. Live entry creates an `orders` intent before submitting. An order ID alone or a partial/unpriced fill does not create a position. Ambiguous submissions remain `reconcile` and block additional live entries for the symbol until a human verifies broker state. A confirmed fill and local position are linked in one database transaction.
- Adapted: pending orders count against effective exposure by blocking a new same-symbol entry. Existing global margin and position limits remain in force.
- Adapted: a live exit also records an intent before the broker call. The local position is reduced/closed only after a fully priced broker fill; failures remain visible for reconciliation. Disabling new live entries does not pretend that an old live position can be closed in paper mode.
- Not adopted: Monad/Kuru order-book, on-chain gas/nonce code, 300 ms quote replacement, mock model, and simulated fills. Those are venue-specific and unsuitable as evidence of returns on crypto/forex brokers.

Remaining hard release gates: broker order-status polling/reconciliation for partial fills, timeout and restart; reduce-only semantics and fill-confirmation contracts on every exchange; fee/spread/funding accounting; live broker sandbox with two workers; staging DB and rollback verification. Do not enable live execution before these pass.
