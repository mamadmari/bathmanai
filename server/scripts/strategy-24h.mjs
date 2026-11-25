/**
 * Per-strategy test on the last 24 hours of real market data.
 *   node server/scripts/strategy-24h.mjs [hours] [tf]
 * Every vote of every strategy becomes a virtual trade: entry at the close of
 * the signal candle, stop/target from ATR (2.2 / 2.2 x RR), 0.25% fee + 0.1%
 * slippage per side. Read-only: nothing in the engine or the database changes.
 */
import { analyzeWindow, activeStrategies } from "../dist/engine-tools.js";
import { fetchKlines } from "../dist/exchanges.js";
import { getSettings } from "../dist/settings.js";
import { pool } from "../dist/db.js";

const hours = Math.max(4, Number(process.argv[2] || 24));
const tf = String(process.argv[3] || "1h");
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const settings = await getSettings();
const feePct = n(settings["trading.feePct"]) || 0.25;
const slipPct = n(settings["trading.slippagePct"]) || 0.1;
const rr = n(settings["risk.minRR"]) || 2.15;
const atrSl = n(settings["stopOffsetATR"]) || 2.2;

const markets = (await pool.query(`select symbol from markets where enabled order by symbol`)).rows.map((r) => r.symbol);
const defs = await activeStrategies();

const per = new Map(); // key -> { n, wins, net, longN, shortN }
const add = (k) => {
  if (!per.has(k)) per.set(k, { n: 0, wins: 0, net: 0, longN: 0, shortN: 0, open: 0, best: -99, worst: 99 });
  return per.get(k);
};

let candlesTotal = 0;
let signals = 0;
for (const sym of markets) {
  let candles = [];
  try {
    candles = await fetchKlines(sym, tf);
  } catch {
    continue;
  }
  if (!Array.isArray(candles) || candles.length < 60) continue;
  candlesTotal += candles.length;
  const barMs = tf === "1h" ? 3600_000 : tf === "4h" ? 4 * 3600_000 : tf === "1d" ? 86400_000 : 900_000;
  const since = Date.now() - hours * 3600_000;

  for (let i = 45; i < candles.length - 2; i++) {
    const t = Number(candles[i].time ?? candles[i].t ?? 0);
    if (t && t < since) continue;
    let r;
    try {
      r = analyzeWindow(candles, i, tf, defs, sym);
    } catch {
      continue;
    }
    const atr = n(r?.lastTf?.ind?.atr);
    const price = n(candles[i].c ?? candles[i].close);
    if (!(price > 0) || !(atr > 0)) continue;
    for (const v of r.votes ?? []) {
      if (v.direction !== "long" && v.direction !== "short") continue;
      if (n(v.confidence) < 0.5) continue;
      signals++;
      const long = v.direction === "long";
      const sl = long ? price - atr * atrSl : price + atr * atrSl;
      const tp = long ? price + atr * atrSl * rr : price - atr * atrSl * rr;
      const end = Math.min(candles.length - 1, i + 96);
      let outcome = null;
      for (let j = i + 1; j <= end; j++) {
        const hi = n(candles[j].h ?? candles[j].high), lo = n(candles[j].l ?? candles[j].low);
        if (long) {
          if (lo <= sl) { outcome = "loss"; break; }
          if (hi >= tp) { outcome = "win"; break; }
        } else {
          if (hi >= sl) { outcome = "loss"; break; }
          if (lo <= tp) { outcome = "win"; break; }
        }
      }
      const cost = 2 * (feePct + slipPct);
      const riskPct = atrSl * (atr / price) * 100;
      // A trade that reached neither level is marked to market at the horizon,
      // not booked as a full stop-out: otherwise every slow strategy looks dead.
      const exitPx = outcome ? (long && outcome === "win" ? tp : !long && outcome === "win" ? tp : sl) : n(candles[end].c ?? candles[end].close);
      const pct = outcome === "win" ? rr * riskPct - cost
        : outcome === "loss" ? -riskPct - cost
        : ((long ? exitPx - price : price - exitPx) / price) * 100 - cost;
      const s = add(v.key);
      s.n++;
      if (outcome === "win") s.wins++;
      if (!outcome) s.open++;
      if (long) s.longN++; else s.shortN++;
      s.net += pct;
      s.best = Math.max(s.best, pct);
      s.worst = Math.min(s.worst, pct);
    }
  }
}

const rows = [...per.entries()].map(([key, v]) => ({
  key, n: v.n, winRate: v.n ? (v.wins / v.n) * 100 : 0, net: v.net, open: v.open,
  avg: v.n ? v.net / v.n : 0, longN: v.longN, shortN: v.shortN, best: v.best, worst: v.worst,
}));
rows.sort((a, b) => b.net - a.net);

console.log(`\n=== ${hours}h per-strategy test on real candles (tf=${tf}) ===`);
console.log(`symbols=${markets.length} candles=${candlesTotal} virtual signals=${signals} strategies=${defs.length}`);
console.log(`model: entry=close, SL=${atrSl}xATR, TP=${atrSl * rr}xATR, cost=${(2 * (feePct + slipPct)).toFixed(2)}% round trip\n`);
console.log("strategy                n  open win%    net%    avg%   L/S");
for (const r of rows.slice(0, 25)) {
  console.log(`${r.key.padEnd(22)} ${String(r.n).padStart(3)}  ${String(r.open).padStart(4)} ${r.winRate.toFixed(0).padStart(4)}  ${r.net.toFixed(1).padStart(7)}  ${r.avg.toFixed(2).padStart(6)}  ${r.longN}/${r.shortN}`);
}
console.log("... worst 10:");
for (const r of rows.slice(-10)) {
  console.log(`${r.key.padEnd(22)} ${String(r.n).padStart(3)}  ${r.winRate.toFixed(0).padStart(4)}  ${r.net.toFixed(1).padStart(7)}  ${r.avg.toFixed(2).padStart(6)}  ${r.longN}/${r.shortN}`);
}
console.log("");
await pool.end();
