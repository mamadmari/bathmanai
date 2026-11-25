// Benchmark: is the market tradable at our costs at all?
// EMA(21) cross EMA(55) trend following, ATR(14) exits, fee 0.5%/side, slip 0.1%.
// read-only.
const { pool } = await import('/opt/trading-wolf/server/dist/db.js');
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'DOGEUSDT', 'SOLUSDT', 'ADAUSDT'];
const FEE = 0.005;
const SLIP = 0.001;

const ema = (vals, n) => {
  const k = 2 / (n + 1);
  const out = [];
  let prev = vals[0];
  for (let i = 0; i < vals.length; i++) {
    prev = i === 0 ? vals[0] : vals[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
};
const atr = (cs, n = 14) => {
  const out = [0];
  let prev = 0;
  for (let i = 1; i < cs.length; i++) {
    const tr = Math.max(cs[i].h - cs[i].l, Math.abs(cs[i].h - cs[i - 1].c), Math.abs(cs[i].l - cs[i - 1].c));
    prev = i === 1 ? tr : (prev * (n - 1) + tr) / n;
    out.push(prev);
  }
  return out;
};

for (const tf of ['1h', '4h']) {
  let allPnl = 0;
  let trades = 0;
  let wins = 0;
  let gp = 0;
  let gl = 0;
  const per = [];
  for (const sym of SYMBOLS) {
    const r = await pool.query(
      `SELECT t, o::float8 o, h::float8 h, l::float8 l, c::float8 c FROM candles
        WHERE symbol=$1 AND timeframe=$2 ORDER BY t ASC`,
      [sym, tf]
    );
    const cs = r.rows;
    if (cs.length < 120) { per.push(`${sym}:nodata`); continue; }
    const closes = cs.map((c) => c.c);
    const f = ema(closes, 21);
    const s = ema(closes, 55);
    const a = atr(cs, 14);
    let pos = null;
    let symPnl = 0;
    let symTrades = 0;
    for (let i = 60; i < cs.length - 1; i++) {
      const px = cs[i].c;
      if (pos) {
        const hitSl = pos.side === 'long' ? cs[i].l <= pos.sl : cs[i].h >= pos.sl;
        const hitTp = pos.side === 'long' ? cs[i].h >= pos.tp : cs[i].l <= pos.tp;
        let exit = null;
        if (hitSl) exit = pos.sl;
        else if (hitTp) exit = pos.tp;
        else if (pos.side === 'long' ? f[i] < s[i] : f[i] > s[i]) exit = px;
        if (exit != null) {
          const fill = pos.side === 'long' ? exit * (1 - SLIP) : exit * (1 + SLIP);
          const pnl = ((pos.side === 'long' ? fill - pos.entry : pos.entry - fill) / pos.entry - FEE * 2) * 100;
          symPnl += pnl;
          symTrades++;
          if (pnl > 0) gp += pnl;
          else gl += -pnl;
          if (pnl > 0) wins++;
          pos = null;
        }
      }
      if (!pos && a[i] > 0) {
        const up = f[i] > s[i] && f[i - 1] <= s[i - 1];
        const dn = f[i] < s[i] && f[i - 1] >= s[i - 1];
        if (up || dn) {
          const side = up ? 'long' : 'short';
          const entry = side === 'long' ? px * (1 + SLIP) : px * (1 - SLIP);
          pos = {
            side,
            entry,
            sl: side === 'long' ? px - 2 * a[i] : px + 2 * a[i],
            tp: side === 'long' ? px + 4 * a[i] : px - 4 * a[i],
          };
        }
      }
    }
    trades += symTrades;
    allPnl += symPnl;
    per.push(`${sym.replace('USDT', '')}:${symTrades}/${symTrades ? (symPnl / symTrades).toFixed(2) : 0}%`);
  }
  console.log(
    `${tf} ema-cross trades=${trades} winRate=${trades ? ((wins / trades) * 100).toFixed(1) : 0}% ` +
      `avgPnl=${trades ? (allPnl / trades).toFixed(3) : 0}% netSum=${allPnl.toFixed(2)}% ` +
      `PF=${(gl > 0 ? gp / gl : 0).toFixed(2)} [${per.join(' ')}]`
  );
}
await pool.end();
process.exit(0);
