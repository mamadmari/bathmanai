// Does the edge survive real costs? Higher timeframes + the margin fee (0.25%/side).
// read-only: system_settings are never touched.
const { pool } = await import('/opt/trading-wolf/server/dist/db.js');
const { runBacktest } = await import('/opt/trading-wolf/server/dist/engine-tools.js');

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'DOGEUSDT', 'SOLUSDT', 'ADAUSDT'];
const BASE = { minScore: 20, minConfidence: 0.35, minConsensus: 0.4, minConfirmations: 1, useValidator: false };
const GEOMS = [
  { name: 'sr  ', minRR: 0.8 },
  { name: 'a1.5/2.5', minRR: 0, atrSlMult: 1.5, atrTpMult: 2.5 },
  { name: 'a2/4', minRR: 0, atrSlMult: 2.0, atrTpMult: 4.0 },
];

for (const tf of ['1h', '4h']) {
  for (const feePct of [0.25, 0.5]) {
    for (const g of GEOMS) {
      let trades = 0;
      let wins = 0;
      let pnl = 0;
      let gp = 0;
      let gl = 0;
      let dd = 0;
      for (const sym of SYMBOLS) {
        try {
          const r = await runBacktest(sym, tf, undefined, { ...BASE, ...g, feePct });
          for (const t of r.tradeList ?? []) {
            const p = Number(t.pnlPct) || 0;
            if (p > 0) gp += p;
            else gl += -p;
          }
          trades += r.trades;
          wins += r.wins;
          pnl += r.avgPnlPct * r.trades;
          dd = Math.max(dd, r.maxDrawdownPct);
        } catch {}
      }
      console.log(
        `${tf} fee=${feePct} ${g.name.padEnd(8)} trades=${String(trades).padStart(3)} ` +
          `winRate=${(trades ? (wins / trades) * 100 : 0).toFixed(1)}% avgPnl=${(trades ? pnl / trades : 0).toFixed(3)}% ` +
          `netSum=${pnl.toFixed(2)}% PF=${(gl > 0 ? gp / gl : gp > 0 ? 99 : 0).toFixed(2)} maxDD=${dd.toFixed(1)}%`
      );
    }
  }
}
await pool.end();
process.exit(0);
