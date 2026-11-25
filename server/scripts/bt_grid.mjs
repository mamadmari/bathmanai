// Grid-search the entry thresholds with the built-in backtester (read-only:
// nothing is written to system_settings, the live engine keeps its own values).
// usage: node server/scripts/bt_grid.mjs
const { pool } = await import('/opt/trading-wolf/server/dist/db.js');
const { runBacktest } = await import('/opt/trading-wolf/server/dist/engine-tools.js');

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'DOGEUSDT', 'SOLUSDT', 'ADAUSDT'];
const TFS = ['15m', '1h'];
const PROFILES = [
  { name: 'strict  ', minScore: 55, minConfidence: 0.55, minConsensus: 0.55, minConfirmations: 3, minRR: 1.5 },
  { name: 'balanced', minScore: 45, minConfidence: 0.45, minConsensus: 0.45, minConfirmations: 2, minRR: 1.2 },
  { name: 'loose   ', minScore: 35, minConfidence: 0.4, minConsensus: 0.4, minConfirmations: 2, minRR: 1.0 },
  { name: 'signal  ', minScore: 20, minConfidence: 0.35, minConsensus: 0.4, minConfirmations: 1, minRR: 0.8, useValidator: false },
];

for (const tf of TFS) {
  for (const p of PROFILES) {
    let trades = 0;
    let wins = 0;
    let pnl = 0;
    let dd = 0;
    const rows = [];
    for (const sym of SYMBOLS) {
      try {
        const r = await runBacktest(sym, tf, undefined, p);
        trades += r.trades;
        wins += r.wins;
        pnl += r.avgPnlPct * r.trades;
        dd = Math.max(dd, r.maxDrawdownPct);
        rows.push(`${sym.replace('USDT', '')}:${r.trades}/${r.winRate}%`);
      } catch {
        rows.push(`${sym}:ERR`);
      }
    }
    console.log(
      `${tf} ${p.name} trades=${String(trades).padStart(3)} winRate=${(trades ? (wins / trades) * 100 : 0).toFixed(1)}% ` +
        `avgPnl=${(trades ? pnl / trades : 0).toFixed(3)}% netSum=${pnl.toFixed(2)}% maxDD=${dd.toFixed(1)}% [${rows.join(' ')}]`
    );
  }
}
await pool.end();
process.exit(0);
