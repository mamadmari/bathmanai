// Backtest runner for the engine's own strategies.
// usage: node server/scripts/backtest.mjs [SYMBOL|all] [TF] [--json]
//   node server/scripts/backtest.mjs all 1h
//   node server/scripts/backtest.mjs BTCUSDT 15m --json
const { pool } = await import('/opt/trading-wolf/server/dist/db.js');
const { runBacktest } = await import('/opt/trading-wolf/server/dist/engine-tools.js');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const asJson = process.argv.includes('--json');
const target = String(args[0] || 'all').toUpperCase();
const tf = String(args[1] || '1h');

const rows = await pool.query(
  target === 'ALL'
    ? `SELECT symbol FROM markets WHERE enabled = true ORDER BY priority ASC, symbol ASC`
    : `SELECT symbol FROM markets WHERE symbol = $1`,
  target === 'ALL' ? [] : [target]
);
if (!rows.rowCount) {
  console.log('no such symbol:', target);
  process.exit(1);
}

const out = [];
for (const r of rows.rows) {
  try {
    const res = await runBacktest(r.symbol, tf);
    out.push(res);
    if (!asJson) {
      console.log(
        [
          r.symbol.padEnd(9),
          `trades=${String(res.trades).padStart(3)}`,
          `win=${String(res.winRate).padStart(5)}%`,
          `PF=${String(res.profitFactor).padStart(5)}`,
          `avgRR=${String(res.avgRr).padStart(4)}`,
          `avgPnl=${String(res.avgPnlPct).padStart(7)}%`,
          `maxDD=${String(res.maxDrawdownPct).padStart(5)}%`,
          `sharpe=${String(res.sharpe).padStart(5)}`,
        ].join(' ')
      );
    }
  } catch (e) {
    if (!asJson) console.log(r.symbol.padEnd(9), 'ERR', String(e.message).slice(0, 80));
  }
}

const all = out.filter((r) => r.trades > 0);
const sum = (f) => all.reduce((a, r) => a + Number(f(r) || 0), 0);
const trades = sum((r) => r.trades);
const wins = sum((r) => r.wins);
const pnl = sum((r) => r.avgPnlPct * r.trades);
if (asJson) {
  console.log(JSON.stringify({ tf, results: out }, null, 2));
} else {
  console.log('---');
  console.log(
    `TOTAL symbols=${all.length} trades=${trades} winRate=${trades ? ((wins / trades) * 100).toFixed(2) : 0}% ` +
      `avgPnl=${trades ? (pnl / trades).toFixed(4) : 0}% netPnlSum=${pnl.toFixed(2)}%`
  );
}
await pool.end();
process.exit(0);
