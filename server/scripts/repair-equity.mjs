// ─────────────────────────────────────────────────────────────────────────────
// repair-equity.mjs — make the ledger tell the truth.
//
//  1. adds `gross_pnl` to closed_positions (see migrations/0002_real_costs.sql)
//  2. marks rows whose entry/exit are in different units (rial vs USDT) as
//     `invalid_units` and zeroes them — they invented tens of USDT of "profit"
//  3. recomputes `fee` (real Nobitex costs) and `pnl` (net) for every closed row
//  4. rebuilds engine.realizedPnl from those net rows and re-bases
//     engine.capital so that `capital + realizedPnl` equals real broker equity
//
// Usage: node scripts/repair-equity.mjs [--dry]
import { pool, logEngine } from "../dist/db.js";
import { getSettings, setSetting } from "../dist/settings.js";
import { costModel, netPnlUsd } from "../dist/trade-costs.js";
import { nobitexActivePositions, nobitexRialPerUsdt, nobitexCall } from "../dist/exchanges.js";

const dry = process.argv.includes("--dry");
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

await pool.query("ALTER TABLE closed_positions ADD COLUMN IF NOT EXISTS gross_pnl numeric");

const { rows } = await pool.query("SELECT * FROM closed_positions ORDER BY close_time ASC");
console.log(`closed rows: ${rows.length}${dry ? " (dry run)" : ""}`);
let fixedUnits = 0, repriced = 0, netSum = 0, grossSum = 0, feeSum = 0;

for (const r of rows) {
  const entry = n(r.entry), exit = n(r.close_price), qty = n(r.quantity);
  const ratio = entry > 0 && exit > 0 ? exit / entry : 1;
  const unitBroken = ratio > 5 || ratio < 0.2;
  if (unitBroken) {
    fixedUnits += 1;
    if (!dry) {
      await pool.query(
        `UPDATE closed_positions SET status='invalid_units', pnl=0, profit=0, fee=0, gross_pnl=0,
                error=COALESCE(error,'entry/exit in different units') WHERE id=$1`,
        [r.id],
      );
    }
    continue;
  }
  const isDemo = String(r.mode) !== "live";
  const gross = r.side === "long" ? (exit - entry) * qty : (entry - exit) * qty;
  const holdHours = Math.max(0, (n(r.close_time) - n(r.open_time)) / 3_600_000);
  // paper/demo trades pay no broker fees
  const costs = isDemo
    ? { netUsd: gross, costUsd: 0, grossUsd: gross }
    : netPnlUsd(costModel(await getSettings()), { notionalUsd: Math.abs(entry * qty), holdHours, grossPnlUsd: gross });
  if (!isDemo) {
    grossSum += gross;
    feeSum += costs.costUsd;
    netSum += costs.netUsd;
    repriced += 1;
  }
  if (!dry) {
    await pool.query(
      `UPDATE closed_positions SET gross_pnl=$2, fee=$3, pnl=$4, profit=$4,
              pnl_pct = CASE WHEN margin > 0 THEN round(($4 / margin) * 100, 4) ELSE 0 END
        WHERE id=$1`,
      [r.id, costs.grossUsd, costs.costUsd, costs.netUsd],
    );
  }
}

// ── real broker equity (USDT) ────────────────────────────────────────────────
const rialPerUsdt = await nobitexRialPerUsdt();
const spot = (await nobitexCall("GET", "/users/wallets/list").catch(() => null))?.wallets ?? [];
const margin = (await nobitexCall("POST", "/users/wallets/list", { type: "margin" }).catch(() => null))?.wallets ?? [];
const walletRial = (list) => list.reduce((sum, w) => sum + n(w.rialBalance ?? (String(w.currency) === "rls" ? w.balance : 0)), 0);
// Own funds only: wallet balances (spot + margin). Delegated/leveraged notional is
// borrowed money and must never be counted as capital.
const equityRial = walletRial(spot) + walletRial(margin);
const equityUsd = rialPerUsdt > 0 ? equityRial / rialPerUsdt : 0;

console.log(`live closed: ${repriced} repriced, ${fixedUnits} unit-broken rows neutralised`);
console.log(`gross ${grossSum.toFixed(4)} − costs ${feeSum.toFixed(4)} = net ${netSum.toFixed(4)} USDT`);
console.log(`broker equity ≈ ${equityUsd.toFixed(4)} USDT (${equityRial.toFixed(0)} rial @ ${rialPerUsdt.toFixed(0)})`);

if (!dry) {
  await setSetting("engine.realizedPnl", Number(netSum.toFixed(8)), "engine");
  await setSetting("engine.capital", Number((equityUsd - netSum).toFixed(8)), "engine");
  await setSetting("engine.peakCapital", Number(equityUsd.toFixed(8)), "engine");
  await setSetting("engine.equityRebuiltAt", Date.now(), "engine");
  await logEngine(
    "WARNING",
    `equity rebuilt: net realized ${netSum.toFixed(4)} USDT, capital re-based to broker equity ${equityUsd.toFixed(4)} USDT (${fixedUnits} rows neutralised)`,
    { netSum, equityUsd, fixedUnits },
    "engine",
  );
}
await pool.end();
