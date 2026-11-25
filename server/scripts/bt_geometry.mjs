// Compare exit geometries (S/R vs ATR) with the built-in backtester.
// read-only: system_settings are never touched.
// usage: node server/scripts/bt_geometry.mjs
const { pool } = await import('/opt/trading-wolf/server/dist/db.js');
const { runBacktest } = await import('/opt/trading-wolf/server/dist/engine-tools.js');

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'DOGEUSDT', 'SOLUSDT', 'ADAUSDT'];
const BASE = { minScore: 20, minConfidence: 0.35, minConsensus: 0.4, minConfirmations: 1, useValidator: false };
const GEOMS = [
  { name: 'sr         ', minRR: 0.8 },
  { name: 'atr 1.0/2.0', minRR: 0, atrSlMult: 1.0, atrTpMult: 2.0 },
  { name: 'atr 1.5/2.5', minRR: 0, atrSlMult: 1.5, atrTpMult: 2.5 },
  { name: 'atr 1.5/3.0', minRR: 0, atrSlMult: 1.5, atrTpMult: 3.0 },
  { name: 'atr 2.0/4.0', minRR: 0, atrSlMult: 2.0, atrTpMult: 4.0 },
];

for (const tf of ['15m', '1h']) {
  for (const g of GEOMS) {
    let trades = 0;
    let wins = 0;
    let pnl = 0;
    let gp = 0;
    let gl = 0;
    let dd = 0;
    for (const sym of SYMBOLS) {
      try {
        const r = await runBacktest(sym, tf, undefined, { ...BASE, ...g });
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
      `${tf} ${g.name} trades=${String(trades).padStart(3)} winRate=${(trades ? (wins / trades) * 100 : 0).toFixed(1)}% ` +
        `avgPnl=${(trades ? pnl / trades : 0).toFixed(3)}% netSum=${pnl.toFixed(2)}% ` +
        `PF=${(gl > 0 ? gp / gl : gp > 0 ? 99 : 0).toFixed(2)} maxDD=${dd.toFixed(1)}%`
    );
  }
}
await pool.end();
process.exit(0);
