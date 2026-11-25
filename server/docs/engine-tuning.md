# Motor bugs & tuning playbook (Trading Wolf)

Last updated: 23 Nov 2026 — after the Wallex migration and the demo restart.

## 1. Bugs found and fixed (newest first)

| # | Bug | Symptom | Fix |
|---|---|---|---|
| 1 | RR float boundary `if (rr < minRR)` | 392 candidates rejected in 6 h with `RR 2.15 < minRR 2.15`; engine looked asleep | compare with `1e-6` tolerance (`engine.ts`) |
| 2 | `wallexAdapter.klines` returned UDF timestamps in **seconds** | every symbol "stale data" once Wallex became the first provider | `t < 1e12 ? t*1000 : t` |
| 3 | `fetchKlines` tried 12 providers with Wallex last | 6 WARNINGs per timeframe per Wallex-only symbol, ~10 s each | `market.primaryProvider` first (`providerOrder()`) |
| 4 | `closePartialPosition` booked **gross** PnL with `fee=0` | 860 demo rows "profitable", real account bled | full cost model on partials |
| 5 | `wallexTomanRate` from a broken BTC ratio | BTC entry 6341 instead of 63412 | USDTTMN + sanity band + cross-check + last-good |
| 6 | adopt path divided toman price by the rial rate | entry 10× too small, +19 USDT fake profit | provider-aware conversion |
| 7 | `wallexActivePositions` notional = collateral+loan | 2× sizing, phantom equity | notional = collateral |
| 8 | Ticker snapshot cached 60 s | decisions on stale prices | `wallex.tickerCacheMs` (default 2000) |
| 9 | 4 timeframes fetched sequentially per symbol | a 17-symbol scan = 68 sequential HTTP calls | `Promise.all` per symbol |
| 10 | Telegram cards stuck in outbox | `reply_markup: null` rejected by the API | markup only when buttons exist |

## 2. Known-but-intended behaviour (not bugs)

* **One position per symbol** → thousands of `skip <SYM>: قبلاً روی این نماد پوزیشن باز است`. By design.
* **`insufficient_tf=1`** → a thinly traded market (usually `COPXONUSDT`) has no 15m history; needs ≥3 timeframes.
* **A losing demo position stays open** → the engine exits only on SL, TP, trailing, ROI table or the 48 h time stop (`risk.maxHoldingMinutes=2880`). A −0.9 % open loss with SL at −3.4 % is normal.
* **`engine.leverage` / `risk.maxLeverage`** are decorative: Wallex margin has no leverage (`risk_coef=1`), the whole notional is collateral.

## 3. Open issues / next candidates

1. `risk.maxHoldingMinutes = 2880` (48 h) is long for a 4 h strategy — capital sits idle. Candidates: 480–720.
2. `insufficient_tf` on commodities — could fall back to 3 of 4 timeframes.
3. `ADMIN_PASSWORD` unset, admin seeded with a default password.
4. `runBacktest()` still has no Wallex feed → 0 trades in the internal backtest.
5. `risk.roiTable` (6 % → 3 % → 1.5 %) was written for a 15m scalp, not for the current 4 h geometry.

## 4. Tooling

```bash
cd /opt/trading-wolf/server
node scripts/engine-audit.mjs 6        # settings, open positions, funnel, skip reasons, per-strategy/symbol
node scripts/sync-wallex-markets.mjs   # every Wallex margin market -> enabled symbol, spot list -> watch-only
node scripts/backtest.mjs BTCUSDT 4h --json
node scripts/bt_geometry.mjs           # ATR/TP grid on real candles
node scripts/bt_costs.mjs              # how much of the edge the 0.96% round trip eats
node scripts/repair-equity.mjs --dry   # ledger sanity
```

## 5. Tuning loop (use this order, never guess)

1. `engine-audit` → read the skip-reason histogram. That is the *actual* bottleneck.
2. Change **one** knob (RR, stop ATR, confirmations, timeframe).
3. Wait 24 h, run `engine-audit 24`, compare `pnl`, win rate, and `avg win / avg loss`.
4. Only then decide. A round trip costs 0.96 %, so any target under ~2 % is structurally dead.

## 2026-11-25 — owner-approved tuning (why the engine booked tiny wins)

Evidence from the demo ledger (7 days, 60 closed trades, -7.99 USDT):

| exit | n | net | avg gross |
| --- | --- | --- | --- |
| stop_loss | 17 | -4.79 | -1.90% of notional |
| manual | 3 | -1.40 | -2.06% |
| time_stop | 5 | -0.28 | +0.36% |
| guard_stop_loss | 12 | -0.07 | ~0% |
| trailing_stop | 4 | +0.08 | +0.76% |
| take_profit_partial | 3 | +0.16 | - |

So winners were closed at ~+0.8% while losers ran to ~-1.9%: the realised
reward:risk was ~1:2.4 against a 2.15:1 design, and 47% of the loss was fees.
Two code paths cut the winners: `guard.mjs` moves the stop to entry +/-
`risk.guardTrailBufferPct` (was 1.4%) as soon as price covers 60% of the way to
the target, and the engine's ProfitLock moves to breakeven after 1.6x the round
trip cost. Nothing ever let a winner reach the 5/7.5/10 ATR ladder.

Changes (settings + `DEFAULT_SETTINGS`, no code logic touched):

- `risk.stopOffsetATR` 2 -> 1.3 and `risk.maxStopPct` 3.5 -> 2: initial risk
  drops to 1.3-2% (still above the 1.8x cost floor of ~1.26%).
- `risk.guardTrailBufferPct` 1.4 -> 3: the guard now locks at least +3%.
- `risk.trailingActivatePct` 3 -> 4 and `risk.trailingDistancePct` 1 -> 1.5:
  the engine trail only starts well inside profit and tolerates more noise.
- `risk.maxHoldingMinutes` 720 -> 4320: with `engine.executionTimeframe=4h` a
  12h cap was three candles; winners were cut by the clock (5 time_stop rows).
- `risk.minConfirmations` 2 -> 1 with `risk.minScore` 55 -> 58: 9 of 13 symbols
  were rejected as `few_votes` because only 12 of 165 strategies are enabled,
  so the funnel starved (0 entries in 24h). One vote + a higher score gate.

Known dead switches (documented, not touched): `risk.roiEnabled` /
`risk.roiTable` are never read by the engine or the guard.
