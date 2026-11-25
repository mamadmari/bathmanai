// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — engine worker (24/7)
//   ROLE=worker node dist/worker.js   (PM2: wolf-worker / docker: worker)
// Runs engineTick() in a loop, keeps the heartbeat fresh, and logs a watchdog
// alarm when it ever stalls. Exactly one worker should run — duplicate
// positions are additionally blocked by the DB unique index on symbol.
// ─────────────────────────────────────────────────────────────────────────────
import { setEngineState, getEngineState, logEngine, closeDb } from "./db.js";
import { closeRedis } from "./redis.js";
import { engineTick } from "./engine.js";
import { getSettings } from "./settings.js";
import { now } from "./util.js";
import { drainTelegramOutbox } from "./telegram.js";
import { reportTick } from "./position-report.js";
import { pollBaleUpdates, registerBaleCommands } from "./bale.js";

let stopping = false;
let tickStartedAt = 0;
let wakeSleep: (() => void) | undefined;
let shutdownTimer: ReturnType<typeof setTimeout> | undefined;

async function loop(): Promise<void> {
  let consecutiveErrors = 0;
  while (!stopping) {
    const started = Date.now();
    tickStartedAt = started;
    try {
      const s = await getSettings();
      // The dashboard writes engine.scanIntervalMinutes; the seed/env default is
      // engine.scanIntervalSec. Honor whichever is present (minutes wins when set).
      let intervalSec = Math.max(1, Math.min(600, Number(s["engine.scanIntervalSec"]) || 60));
      // A stored `0` minutes used to collapse the loop to one second and made
      // engine.scanIntervalSec unreachable. Only a positive value wins now.
      const intervalMinutes = Number(s["engine.scanIntervalMinutes"]);
      if (Number.isFinite(intervalMinutes) && intervalMinutes > 0) {
        intervalSec = Math.max(1, Math.min(600, intervalMinutes * 60));
      }
      const res = await engineTick();
      if (stopping) break;
      // automated position reporting: instant open/close alerts + the periodic
      // toman P/L card (throttled by telegram.digestMinutes)
      await reportTick().catch((error) => console.error("[worker] report:", error.message));
      // drain last so a card queued in this tick leaves immediately
      await drainTelegramOutbox().catch((error) => console.error("[worker] outbox:", error.message));
      // engineTick owns the database heartbeat; keep a worker-level heartbeat
      // too so a long market scan cannot make health look permanently stale.
      await setEngineState("heartbeat", { at: now(), state: "running", lastTickMs: Date.now() - started });
      consecutiveErrors = 0;
      console.log(`[worker] tick ok — scanned=${res.scanned} opened=${res.opened} (${Date.now() - started}ms)`);
      // The engine owns status/pause reasons. A worker heartbeat is not proof
      // that trading is running and must never overwrite an engine pause.
      await setEngineState("last_scan", { at: now(), scanned: res.scanned, opened: res.opened });
      await sleep(intervalSec * 1000);
    } catch (e: any) {
      if (stopping) break;
      consecutiveErrors++;
      console.error("[worker] tick error:", e.message);
      await logEngine("ERROR", `worker tick: ${e.message}`, { consecutiveErrors }, "engine").catch(() => undefined);
      await setEngineState("heartbeat", { at: now(), state: "error", consecutiveErrors }).catch(() => undefined);
      await setEngineState("status", { state: "error", error: String(e?.message ?? e).slice(0, 500), at: now() }).catch(() => undefined);
      // circuit breaker-ish backoff, but never die permanently
      await sleep(Math.min(30_000, 5_000 * consecutiveErrors));
    }
  }
}

async function watchdog(): Promise<void> {
  // Every 60s: verify the loop is alive by checking the heartbeat age.
  while (!stopping) {
    await new Promise((r) => setTimeout(r, 15_000));
    if (stopping) return;
    // In-process clock cannot be refreshed by another worker. A stuck scan
    // releases its session advisory lock when PM2 restarts this process.
    if (tickStartedAt && now() - tickStartedAt > 900_000) {
      console.error("[worker] WATCHDOG: tick exceeded 15 minutes; restarting for reconciliation");
      process.exit(1);
    }
    try {
      const hb = await getEngineState("heartbeat");
      const age = hb?.at ? now() - Number(hb.at) : Infinity;
      if (age > 300_000) {
        await logEngine("CRITICAL", `WATCHDOG: heartbeat stale (${Math.round(age / 1000)}s)`, null, "engine");
      }
    } catch {
      /* ignore */
    }
  }
}

function sleep(ms: number): Promise<void> {
  tickStartedAt = 0;
  return new Promise((r) => {
    const timer = setTimeout(() => { wakeSleep = undefined; r(); }, ms);
    wakeSleep = () => { clearTimeout(timer); wakeSleep = undefined; r(); };
  });
}

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log("[worker] shutting down…");
  wakeSleep?.();
  // Keep DB/exchange resources alive until the in-flight tick settles.
  // Forced exit leaves uncertain intents for reconciliation, never a retry.
  shutdownTimer = setTimeout(() => process.exit(1), 30_000);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

loop().then(async () => {
  await setEngineState("status", { state: "stopped", at: now() }).catch(() => undefined);
  await Promise.allSettled([closeDb(), closeRedis()]);
  if (shutdownTimer) clearTimeout(shutdownTimer);
  process.exit(0);
}).catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
void watchdog();

// Bale payment bot: independent 3.5s long-poll loop (engine ticks are minutes apart).
async function baleLoop(): Promise<void> {
  while (!stopping) {
    try {
      if (!(globalThis as any).__baleCmds) { (globalThis as any).__baleCmds = true; void registerBaleCommands(); }
      await pollBaleUpdates();
    } catch (e: any) {
      console.error("[worker] bale:", String(e?.message ?? e));
    }
    await new Promise((r) => setTimeout(r, 3_500));
  }
}
void baleLoop();
