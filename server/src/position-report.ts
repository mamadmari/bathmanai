// ─────────────────────────────────────────────────────────────────────────────
// Automated position reporting — no manual checks needed.
//   • every N minutes (telegram.digestMinutes, default 10) a live card with the
//     toman profit/loss of every open position goes to the admin chat
//   • the moment a position opens or closes, an instant alert goes out with the
//     realised result in toman
// Everything is written to telegram_outbox, so a Telegram outage never loses a
// card (the worker retries) and the engine never rolls back a trade.
// ─────────────────────────────────────────────────────────────────────────────
import { pool, getEngineState, setEngineState, logEngine } from "./db.js";
import { getSettings, getSetting } from "./settings.js";
import { now, num } from "./util.js";
import { usdtTomanRate } from "./rates.js";
import { wallexTomanRate, wallexWalletToman } from "./wallex.js";

type Row = Record<string, any>;

const esc = (v: unknown): string =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tmn = (n: number): string => Math.round(n).toLocaleString("en-US");
const signedTmn = (n: number): string => (n >= 0 ? "+" : "−") + tmn(Math.abs(n));
const signedUsd = (n: number): string => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(4);
const fmtPx = (n: number): string => {
  const v = Math.abs(Number(n) || 0);
  if (v === 0) return "—";
  if (v >= 1000) return String(Math.round(v));
  if (v >= 1) return v.toFixed(3);
  if (v >= 0.01) return v.toFixed(5);
  return v.toPrecision(4);
};

async function tomanRate(): Promise<number> {
  const r = await wallexTomanRate().catch(() => 0);
  if (r > 0) return r;
  return await usdtTomanRate().catch(() => 0);
}

/** Live open positions, cheapest possible read (no broker round trip). */
async function openRows(): Promise<Row[]> {
  const res = await pool.query(
    `SELECT id, symbol, side, entry, current, quantity, size, pnl, stop_loss, take_profit,
            open_time, source, leverage
       FROM open_positions
      WHERE status = 'open'
      ORDER BY open_time ASC`
  );
  return res.rows;
}

function positionBlock(p: Row, rate: number): string {
  const entry = num(p.entry);
  const px = num(p.current) || entry;
  const pnlUsd = num(p.pnl);
  const pnlTmn = pnlUsd * rate;
  const dir = p.side === "short" ? -1 : 1;
  const pct = entry > 0 ? ((px - entry) / entry) * 100 * dir : 0;
  const sl = num(p.stop_loss);
  const tp = num(p.take_profit);
  const toStop = sl > 0 && px > 0 ? Math.abs((sl - px) / px) * 100 : 0;
  const toTarget = tp > 0 && px > 0 ? Math.abs((tp - px) / px) * 100 : 0;
  const ageMin = Math.max(0, Math.round((now() - num(p.open_time)) / 60_000));
  const age = ageMin >= 60 ? `${Math.floor(ageMin / 60)}س ${ageMin % 60}د` : `${ageMin}د`;
  const icon = pnlUsd >= 0 ? "🟢" : "🔴";
  const lines = [
    `${icon} <b>${esc(p.symbol)}</b> ${p.side === "short" ? "شورت ↘" : "لانگ ↗"}`,
    `ورود ${fmtPx(entry)} ← فعلی ${fmtPx(px)}`,
    `سود/ضرر: <b>${signedTmn(pnlTmn)} تومان</b> (${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}٪) · ${signedUsd(pnlUsd)} USDT`,
  ];
  if (sl > 0) lines.push(`حد ضرر ${sl} (${toStop.toFixed(1)}٪ فاصله)${tp > 0 ? ` · حد سود ${tp} (${toTarget.toFixed(1)}٪)` : ""}`);
  lines.push(`مدت ${age}`);
  return lines.join("\n");
}

async function freeToman(settings: Row, rows: Row[], rate: number): Promise<number> {
  if (String(settings["market.primaryProvider"] ?? "") === "wallex") {
    const w = await wallexWalletToman().catch(() => 0);
    if (w > 0) return w;
  }
  return rows.reduce((acc, p) => acc + num(p.size), 0) * rate;
}

async function enqueue(chatId: string, text: string, dedupKey: string): Promise<boolean> {
  try {
    await pool.query(
      "INSERT INTO telegram_outbox (dedup_key,chat_id,text) VALUES ($1,$2,$3) ON CONFLICT (dedup_key) DO NOTHING",
      [dedupKey, chatId, text]
    );
    return true;
  } catch (error: any) {
    await logEngine("ERROR", `position report: ${String(error?.message ?? error).slice(0, 160)}`, null, "telegram").catch(() => undefined);
    return false;
  }
}

function adminChat(settings: Row): string {
  // channel first (that is where the operator wants every report/position),
  // the bot's private chat only as a fallback
  const channel = String(settings["channel.id"] ?? "").trim();
  if (channel) return channel;
  return String(settings["telegram.adminId"] ?? "").trim();
}

/** The periodic card: equity, every open position in toman, totals. */
export async function sendPositionDigest(tag = "digest"): Promise<boolean> {
  const settings = await getSettings();
  if (!settings["telegram.enabled"] || settings["notify.telegram"] === false) return false;
  const chat = adminChat(settings);
  if (!chat) return false;
  const rows = await openRows();
  const rate = await tomanRate();
  const demoNow = String(settings["engine.mode"] ?? "demo") !== "live";
  const locked = rows.reduce((acc, p) => acc + num(p.size), 0) * rate;
  const openPnl = rows.reduce((acc, p) => acc + num(p.pnl) * rate, 0);
  const equityUsd = num(settings["engine.capital"]) + num(settings["engine.realizedPnl"]);
  const free = demoNow ? Math.max(0, equityUsd * rate - locked) : await freeToman(settings, rows, rate);
  const stamp = new Date().toLocaleTimeString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tehran",
  });
  const demo = String(settings["engine.mode"] ?? "demo") !== "live";
  const head = [
    `🐺 <b>گزارش پوزیشن‌ها</b>${demo ? " (دمو — سرمایهٔ فرضی)" : ""} — ${stamp}`,
    demoNow
      ? `سرمایهٔ فرضی: <b>${tmn(free + locked)} تومان</b> (${equityUsd.toFixed(2)} USDT · آزاد ${tmn(free)} · در پوزیشن ${tmn(locked)})`
      : `سرمایه: <b>${tmn(free + locked)} تومان</b> (کیف آزاد ${tmn(free)} · در پوزیشن ${tmn(locked)})`,
  ];
  const body = rows.length
    ? rows.map((p) => positionBlock(p, rate)).join("\n\n")
    : "🕯 پوزیشن بازی نیست — موتور در حال اسکن است.";
  const tail = [
    "──────────",
    `سود/ضرر باز: <b>${rows.length ? signedTmn(openPnl) + " تومان" : "۰"}</b>`,
    `نرخ تتر: ${tmn(rate)} تومان`,
  ];
  const text = [...head, "──────────", body, ...tail].join("\n");
  const bucket = Math.floor(now() / 60_000);
  return enqueue(chat, text, `digest:${tag}:${bucket}`);
}

/** Instant alert when a position opens or closes (realised result in toman). */
async function notifyEvent(mode: "open" | "close", p: Row, rate: number): Promise<void> {
  const settings = await getSettings();
  if (!settings["telegram.enabled"] || settings["notify.trade"] === false) return;
  const chat = adminChat(settings);
  if (!chat) return;
  const pnlUsd = num(p.pnl);
  const pnlTmn = pnlUsd * rate;
  const entry = num(p.entry);
  const px = num(p.current) || entry;
  const faSide = p.side === "short" ? "شورت" : "لانگ";
  const head =
    mode === "open"
      ? `🚀 <b>پوزیشن باز شد</b> — ${esc(p.symbol)} ${faSide}`
      : `${pnlUsd >= 0 ? "✅" : "🛑"} <b>پوزیشن بسته شد</b> — ${esc(p.symbol)} ${faSide}`;
  const lines = [head, `ورود ${fmtPx(entry)} ← خروج ${fmtPx(px)}`];
  if (mode === "close") lines.push(`نتیجهٔ خالص: <b>${signedTmn(pnlTmn)} تومان</b> (${signedUsd(pnlUsd)} USDT)`);
  else lines.push(`حجم ${num(p.quantity)} (${num(p.size).toFixed(2)} USDT) · اهرم ${num(p.leverage, 1)}`);
  if (mode === "close" && p.close_reason) {
    const reasonFa: Record<string, string> = {
      stop_loss: "حد ضرر",
      take_profit: "حد سود",
      trailing_stop: "استاپ متحرک",
      structure_invalidated: "بی‌اعتبار شدن ساختار",
      exchange_closed: "بسته‌شده توسط صرافی",
      manual: "بستن دستی",
      guard_stop_loss: "گارد: حد ضرر",
      guard_take_profit: "گارد: حد سود",
    };
    lines.push(`دلیل: ${esc(reasonFa[String(p.close_reason)] ?? p.close_reason)}`);
  }
  if (num(p.stop_loss) > 0) {
    lines.push(`حد ضرر ${num(p.stop_loss)}${num(p.take_profit) > 0 ? ` · حد سود ${num(p.take_profit)}` : ""}`);
  }
  await enqueue(chat, lines.join("\n"), `pos:${p.id}:${mode}`);
}

/** Snapshot diff — catches exchanges that close on their own (SL/TP) too. */
async function watchPositions(): Promise<void> {
  const prev = (await getEngineState("position_watch")) as Row | null;
  const prevIds: string[] = Array.isArray(prev?.ids) ? (prev!.ids as string[]).map(String) : [];
  const rows = await openRows();
  const ids = rows.map((r) => String(r.id));
  if (prev?.ids) {
    const rate = await tomanRate();
    for (const p of rows) if (!prevIds.includes(String(p.id))) await notifyEvent("open", p, rate);
    for (const id of prevIds) {
      if (ids.includes(id)) continue;
      const closed =
        (await pool.query("SELECT * FROM closed_positions WHERE id = $1", [id])).rows[0] ??
        (await pool.query("SELECT * FROM open_positions WHERE id = $1", [id])).rows[0];
      if (closed) await notifyEvent("close", closed, rate);
    }
  }
  await setEngineState("position_watch", { ids, at: now() });
}

/** Called from the worker loop: instant alerts + the throttled periodic card. */
export async function reportTick(): Promise<void> {
  try {
    await watchPositions();
  } catch (error: any) {
    await logEngine("WARNING", `position watch: ${String(error?.message ?? error).slice(0, 140)}`, null, "telegram").catch(() => undefined);
  }
  try {
    const minutes = Math.max(1, Math.min(1440, num(await getSetting<number>("telegram.digestMinutes", 10)) || 10));
    const state = (await getEngineState("position_digest")) as Row | null;
    if (state?.at && now() - num(state.at) < minutes * 60_000) return;
    if (await sendPositionDigest()) await setEngineState("position_digest", { at: now() });
  } catch (error: any) {
    await logEngine("WARNING", `position digest: ${String(error?.message ?? error).slice(0, 140)}`, null, "telegram").catch(() => undefined);
  }
}
