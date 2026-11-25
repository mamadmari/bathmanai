/**
 * Per-strategy scoreboard for the demo sample.
 *   node server/scripts/strategy-scoreboard.mjs [hours]
 * Prints n / wins / win-rate / net / fee per strategy, sorted by net, plus the
 * total and the fee share. Read-only: it never writes settings.
 */
import { pool } from "../dist/db.js";

const hours = Math.max(1, Number(process.argv[2] || 12));
const since = Date.now() - hours * 3_600_000;

const rows = (await pool.query(
  `select k as key, count(*)::int n,
          sum(case when pnl > 0 then 1 else 0 end)::int wins,
          round(sum(pnl)::numeric, 4) net,
          round(sum(case when pnl > 0 then pnl else 0 end)::numeric, 4) gross_win,
          round(sum(case when pnl <= 0 then pnl else 0 end)::numeric, 4) gross_loss,
          round(sum(fee)::numeric, 4) fee
     from (select unnest(strategy_keys) k, pnl, fee from closed_positions
            where status = 'closed' and close_time >= $1) x
    group by 1 order by net desc`,
  [since]
)).rows;

const total = (await pool.query(
  `select count(*)::int n,
          sum(case when pnl > 0 then 1 else 0 end)::int wins,
          round(sum(pnl)::numeric, 4) net,
          round(sum(fee)::numeric, 4) fee
     from closed_positions where status = 'closed' and close_time >= $1`,
  [since]
)).rows[0];

console.log(`\n== last ${hours}h == closed trades=${total.n} wins=${total.wins} net=${total.net} USDT  fee=${total.fee} USDT`);
if (total.net !== null && Number(total.fee) > 0) {
  console.log(`   fees are ${(Number(total.fee) / Math.max(0.0001, Math.abs(Number(total.net) || 0.0001)) * 100).toFixed(0)}% of the absolute net`);
}
console.log("\nstrategy                 n   win   net$     fee$");
for (const r of rows) {
  const wr = r.n ? ((r.wins / r.n) * 100).toFixed(0) + "%" : "—";
  console.log(`${String(r.key).padEnd(22)} ${String(r.n).padStart(3)}  ${wr.padStart(4)}  ${String(r.net).padStart(8)}  ${String(r.fee).padStart(7)}`);
}
if (!rows.length) console.log("(no closed trade in this window)");
console.log("");
await pool.end();
