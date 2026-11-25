// ─────────────────────────────────────────────────────────────────────────────
// Engine audit — one command answers "why is it not trading / what is broken".
//   node scripts/engine-audit.mjs [hours=24]
// Prints: settings, open positions with distance to SL/TP, funnel of the last
// scans, every skip reason, error groups, per-strategy and per-symbol results.
// ─────────────────────────────────────────────────────────────────────────────
const hours = Number(process.argv[2] ?? 24);
const since = Date.now() - hours * 3600_000;
const { pool } = await import("../dist/db.js");
const { getSettings } = await import("../dist/settings.js");
const s = await getSettings();
const wx = await import("../dist/wallex.js");
const rate = Number(await wx.wallexTomanRate().catch(() => 0)) || 0;

console.log(`\n=== SETTINGS (${hours}h window, rate ${Math.round(rate)}) ===`);
for (const k of Object.keys(s).sort()) {
  if (/^(risk|engine|trading|market|paper|wallex)\./.test(k) && !/apiKey|secret|token/i.test(k)) {
    console.log(`  ${k} = ${JSON.stringify(s[k])}`);
  }
}

console.log("\n=== OPEN POSITIONS ===");
const pos = (await pool.query(`select symbol, side, entry, current, quantity, size, stop_loss, take_profit, pnl, open_time, mode from open_positions where status='open' order by open_time`)).rows;
if (!pos.length) console.log("  none");
for (const p of pos) {
  const entry = Number(p.entry), px = Number(p.current), sl = Number(p.stop_loss), tp = Number(p.take_profit);
  const dir = p.side === "short" ? -1 : 1;
  const toSl = Math.abs((px - sl) / px) * 100;
  const toTp = Math.abs((tp - px) / px) * 100;
  const hold = Math.round((Date.now() - Number(p.open_time)) / 60000);
  console.log(`  ${p.symbol} ${p.side} ${p.mode} size=${Number(p.size).toFixed(3)} pnl=${Number(p.pnl).toFixed(4)} USDT (${Math.round(Number(p.pnl) * rate)} TMN) hold=${hold}m toSL=${toSl.toFixed(2)}% toTP=${toTp.toFixed(2)}%`);
}

console.log("\n=== SCAN FUNNEL ===");
const scans = (await pool.query(`select count(*)::int c from engine_logs where created_at > $1 and message like 'no entry this scan%'`, [since])).rows[0].c;
const opens = (await pool.query(`select count(*)::int c from engine_logs where created_at > $1 and message like 'TRADE OPEN%'`, [since])).rows[0].c;
console.log(`  scans=${scans} entries=${opens} -> ${(opens / Math.max(1, scans)).toFixed(2)} entries/scan`);

console.log("\n=== WHY NO ENTRY (skip reasons) ===");
const why = (await pool.query(`select regexp_replace(message, '^skip [A-Z0-9]+: ', '') r, count(*)::int c
  from engine_logs where created_at > $1 and message like 'skip %' group by 1 order by 2 desc limit 15`, [since])).rows;
for (const w of why) console.log(`  ${String(w.c).padStart(5)}x ${String(w.r).slice(0, 120)}`);

console.log("\n=== ERRORS / WARNINGS ===");
const errs = (await pool.query(`select level, regexp_replace(message, '[0-9]+', 'N', 'g') m, count(*)::int c
  from engine_logs where created_at > $1 and level in ('ERROR','WARNING') group by 1,2 order by 3 desc limit 12`, [since])).rows;
for (const e of errs) console.log(`  ${e.level} ${String(e.c).padStart(5)}x ${String(e.m).slice(0, 120)}`);

console.log("\n=== PER STRATEGY (closed) ===");
const st = (await pool.query(`select k, count(*)::int n, sum(case when pnl > 0 then 1 else 0 end)::int w, round(sum(pnl)::numeric,3) pnl, round(avg(pnl)::numeric,4) avg
  from (select unnest(strategy_keys) k, pnl from closed_positions where status='closed') t group by 1 order by 4 desc`)).rows;
for (const r of st) console.log(`  ${r.k.padEnd(22)} n=${r.n} win=${r.w} pnl=${r.pnl} avg=${r.avg}`);

console.log("\n=== PER SYMBOL (closed) ===");
const sy = (await pool.query(`select symbol, count(*)::int n, sum(case when pnl > 0 then 1 else 0 end)::int w, round(sum(pnl)::numeric,3) pnl
  from closed_positions where status='closed' group by 1 order by 4 desc`)).rows;
for (const r of sy) console.log(`  ${r.symbol.padEnd(12)} n=${r.n} win=${r.w} pnl=${r.pnl}`);
await pool.end();
