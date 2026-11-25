// ─────────────────────────────────────────────────────────────────────────────
// Wallex market sync — the tradable universe of the exchange, by definition.
//   • every margin market (TMN + USDT) becomes an enabled engine symbol
//   • every spot market is stored (enabled = false) so the panel can watch it
// Run: node scripts/sync-wallex-markets.mjs [--dry]
// ─────────────────────────────────────────────────────────────────────────────
const BASE = "https://api.wallex.ir";
const dry = process.argv.includes("--dry");
const { pool } = await import("../dist/db.js");

const margin = await (await fetch(`${BASE}/margin-trade/v1/public/markets`, { signal: AbortSignal.timeout(20000) })).json();
const marginRows = Array.isArray(margin?.result) ? margin.result : [];
const tm = new Map();
for (const m of marginRows) tm.set(String(m.symbol), { base: String(m.base), quote: String(m.quote) });

const spot = await (await fetch(`${BASE}/hector/web/v1/markets`, { headers: { "Accept-Encoding": "gzip" }, signal: AbortSignal.timeout(20000) })).json();
const spotRows = Array.isArray(spot?.result?.markets) ? spot.result.markets : [];

// wallex.quote=TMN is what the adapter actually places orders in, so a coin
// with only a USDT market (LINK today) would trade in demo and fail live.
const quoteSetting = "TMN";
const tradable = [...tm.entries()].filter(([sym, v]) => v.quote === quoteSetting && !/^USDT/.test(v.base));
console.log(`margin markets: ${tm.size} | tradable ${tradable.length}: ${tradable.map(([s]) => s).join(",")}`);
console.log(`spot markets: ${spotRows.length}`);

let enabled = 0;
let watched = 0;
for (const [symbol, v] of tradable) {
  const local = `${v.base}USDT`;
  if (dry) { console.log(` would enable ${local} (wallex ${symbol})`); continue; }
  const r = await pool.query(
    `insert into markets (symbol, name_en, name_fa, market, base, quote, digits, min_qty, precision, enabled, priority, type, spot_enabled, futures_enabled)
     values ($1,$2,$2,'crypto',$3,'USDT',8,0.000001,6,true,20,'spot',true,true)
     on conflict (symbol) do update set enabled = true, futures_enabled = true
     returning symbol`,
    [local, `${v.base} / USDT`, v.base]
  );
  enabled += r.rowCount ?? 0;
}
for (const m of spotRows) {
  const symbol = String(m.symbol ?? "");
  if (!/(TMN|USDT)$/.test(symbol)) continue;
  const base = String(m.base_asset ?? m.base ?? "").toUpperCase();
  if (!base) continue;
  if (dry) continue;
  const r = await pool.query(
    `insert into markets (symbol, name_en, name_fa, market, base, quote, digits, min_qty, precision, enabled, priority, type, spot_enabled, futures_enabled)
     values ($1,$2,$2,'crypto',$3,'USDT',8,0.000001,6,false,900,'spot',true,false)
     on conflict (symbol) do nothing
     returning symbol`,
    [symbol, `${base} spot`, base]
  );
  watched += r.rowCount ?? 0;
}
console.log(`enabled engine symbols: ${enabled} | new watch-only rows: ${watched}`);
const on = (await pool.query(`select symbol from markets where enabled order by symbol`)).rows.map((r) => r.symbol);
console.log(`engine universe now (${on.length}): ${on.join(",")}`);
await pool.end();
