// wolf-guard: independent stop-loss / take-profit enforcement.
// Nobitex margin has no resting stop order for a position (close is always a
// market /positions/{id}/close), so protection lives in software. The engine
// checks every tick; this process is the second pair of eyes in case the engine
// tick is slow, stuck on a scan, or the worker is restarting.
//
// pm2 start server/scripts/guard.mjs --name wolf-guard --cwd /opt/trading-wolf
const path = '/opt/trading-wolf/server/dist';
const { pool } = await import(`${path}/db.js`);
const { getSettings } = await import(`${path}/settings.js`);
const { closePosition } = await import(`${path}/engine.js`);
const ex = await import(`${path}/exchanges.js`);

const LOOP_MS = 20_000;
const num = (v) => Number(v) || 0;
let running = false;

async function cycle() {
  if (running) return;
  running = true;
  try {
    const s = await getSettings();
    if ((s['engine.mode'] ?? 'demo') !== 'live') return;
    const rows = await pool.query(
      `SELECT * FROM open_positions WHERE status = 'open' AND COALESCE(mode,'demo') = 'live' AND COALESCE(source, '') <> 'broker_dust' AND stop_loss > 0 AND size >= 0.2`
    );
    for (const p of rows.rows) {
      const t = await ex.fetchTicker(String(p.symbol)).catch(() => null);
      const px = num(t?.price);
      if (!(px > 0)) continue;
      const sl = num(p.stop_loss);
      const tp = num(p.take_profit);
      const short = p.side === 'short';
      const hitStop = short ? sl > 0 && px >= sl : sl > 0 && px <= sl;
      const hitTarget = short ? tp > 0 && px <= tp : tp > 0 && px >= tp;
      // trailing: once past 60% of the way to the target, move the stop to entry
      const entry = num(p.entry);
      const half = tp > 0 && entry > 0 ? (short ? entry - (entry - tp) * 0.6 : entry + (tp - entry) * 0.6) : 0;
      const armed = half > 0 && (short ? px <= half : px >= half);
      if (hitStop || hitTarget) {
        const reason = hitStop ? 'stop_loss' : tp > 0 && ((short && px <= tp) || (!short && px >= tp)) ? 'take_profit' : 'trail_stop';
        await closePosition(p.id, `guard_${reason}`, px, p, s);
        console.log(new Date().toISOString(), 'CLOSED', p.symbol, reason, px);
      } else if (armed) {
        // Moving the stop to the entry price booked a guaranteed net loss: the
        // round trip is ~1% of notional, so "breakeven" exits lost money. Keep a
        // buffer that clears the cost band (risk.guardTrailBufferPct).
        const bufferPct = Math.max(0.5, num(s['risk.guardTrailBufferPct'], 1.4));
        const protectedStop = short ? entry * (1 + bufferPct / 100) : entry * (1 - bufferPct / 100);
        const improves = short ? sl > protectedStop : sl < protectedStop;
        if (improves) {
          await pool.query('UPDATE open_positions SET stop_loss = $2, last_update = $3 WHERE id = $1', [p.id, protectedStop, Date.now()]);
          console.log(new Date().toISOString(), 'TRAIL', p.symbol, 'stop ->', protectedStop, `(+${bufferPct}% buffer)`);
        }
      }
    }
  } catch (e) {
    console.log(new Date().toISOString(), 'guard error', String(e?.message ?? e).slice(0, 160));
  } finally {
    running = false;
  }
}

console.log('wolf-guard started, loop', LOOP_MS, 'ms');
await cycle();
setInterval(() => void cycle(), LOOP_MS);
