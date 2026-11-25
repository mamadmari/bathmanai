// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — Telegram bridge (lightweight communication layer only)
// The bot NEVER runs the trading logic. It handles:
//   · /start → membership check → request phone → link to Mini App
//   · trade/signal notifications to channel & users
//   · verified initData (HMAC-SHA256) for the Mini App session
// All heavy logic lives in the API + engine.
// ─────────────────────────────────────────────────────────────────────────────
import { config } from "./config.js";
import crypto from "node:crypto";
import { now, num, clean } from "./util.js";
import { pool, one, many, audit, logEngine, type Row } from "./db.js";
import { loginByTelegramId, createSession, toAuthUser } from "./auth.js";
import type { AuthUser } from "./auth.js";
import { usdtTomanRate } from "./rates.js";
import { getSettings } from "./settings.js";

const API = "https://api.telegram.org";

function botToken(): string {
  return config.telegram.token;
}

/** Live bot token: prefer the env/config token, else the DB setting the
 *  admin saves in the panel (telegram.token). Deterministic XOR so an empty
 *  config token does not silently swallow the saved one. */
let dbTokenCache: string | null = null;
let dbTokenAt = 0;
async function resolveToken(): Promise<string> {
  const t = now();
  if (dbTokenCache && t - dbTokenAt < 30_000) return dbTokenCache;
  try {
    const s = (await getSettings()) as unknown as Record<string, any>;
    dbTokenCache = String(s["telegram.token"] ?? "").trim() || config.telegram.token || null;
    dbTokenAt = t;
    return dbTokenCache ?? "";
  } catch {
    return "";
  }
}

async function call<T = any>(method: string, body: Record<string, any>): Promise<T | null> {
  const token = await resolveToken();
  if (!token) return null;
  const url = `${API}/bot${token}/${method}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json()) as any;
    if (!json?.ok) {
      const description = String(json?.description ?? "unknown error");
      // Invalid bootstrap credentials should not flood engine logs every tick.
      // Keep the event observable but rate-limit identical Telegram failures.
      const recent = await pool.query("SELECT 1 FROM engine_logs WHERE message = $1 AND created_at > $2 LIMIT 1", [`telegram ${method} failed: ${description}`, now() - 300_000]);
      if (recent.rowCount === 0) await logEngine("WARNING", `telegram ${method} failed: ${description}`, body, "bot");
      return null;
    }
    return json.result as T;
  } catch (e: any) {
    await logEngine("WARNING", `telegram ${method} error: ${e.message}`, null, "bot");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Public Telegram CDN URL of a user's profile photo (cached 10 minutes).
 *  The URL embeds the bot token, so it is only ever used server-side: the
 *  browser receives it through /api/avatar/<sig>. */
const photoCache = new Map<number, { at: number; url: string | null }>();
export async function telegramUserPhoto(tgId: number): Promise<string | null> {
  if (!Number.isFinite(tgId) || tgId <= 0) return null;
  const cached = photoCache.get(tgId);
  if (cached && now() - cached.at < 600_000) return cached.url;
  const token = await resolveToken();
  if (!token) return null;
  try {
    const pRes = await fetch(`${API}/bot${token}/getUserProfilePhotos?user_id=${tgId}&limit=1`, {
      signal: AbortSignal.timeout(8000),
    });
    const pJson: any = await pRes.json();
    const sizes = pJson?.result?.photos?.[0];
    const fileId = Array.isArray(sizes) && sizes.length ? sizes[sizes.length - 1]?.file_id : null;
    if (!fileId) {
      photoCache.set(tgId, { at: now(), url: null });
      return null;
    }
    const fRes = await fetch(`${API}/bot${token}/getFile?file_id=${encodeURIComponent(String(fileId))}`, {
      signal: AbortSignal.timeout(8000),
    });
    const fJson: any = await fRes.json();
    const filePath = fJson?.result?.file_path;
    const url = filePath ? `${API}/file/bot${token}/${filePath}` : null;
    photoCache.set(tgId, { at: now(), url });
    return url;
  } catch {
    photoCache.set(tgId, { at: now(), url: null });
    return null;
  }
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  opts: { replyMarkup?: unknown; parseMode?: "HTML" | "Markdown" } = {}
): Promise<number | null> {
  const r = await call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: opts.parseMode ?? "HTML",
    reply_markup: opts.replyMarkup,
  });
  await pool.query(
    `INSERT INTO telegram_messages (chat_id, message_id, direction, type, text, status)
     VALUES ($1, $2, 'out', 'message', $3, $4)`,
    [String(chatId), r?.message_id ?? null, clean(text, 4000), r ? "sent" : "failed"]
  );
  return r?.message_id ?? null;
}

/** Send a photo (base64 PNG, HTTP URL, or Telegram file_id) — used for watermarked chart cards. */
export async function sendPhoto(
  chatId: string | number,
  photoInput: string,
  caption: string,
  opts: { parseMode?: "HTML" | "Markdown" } = {}
): Promise<number | null> {
  const token = await resolveToken();
  if (!token || !chatId) return null;
  const url = `${API}/bot${token}/sendPhoto`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    let res: Response;
    const isUrl = photoInput.startsWith("http://") || photoInput.startsWith("https://");
    const isFileId = !isUrl && /^[a-zA-Z0-9_-]{20,80}$/.test(photoInput.trim());

    if (isUrl || isFileId) {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: String(chatId),
          photo: photoInput.trim(),
          caption,
          parse_mode: opts.parseMode ?? "HTML",
        }),
        signal: controller.signal,
      });
    } else {
      const cleanBase64 = photoInput.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const form = new FormData();
      form.append("chat_id", String(chatId));
      form.append("caption", caption);
      if (opts.parseMode ?? "HTML") form.append("parse_mode", opts.parseMode ?? "HTML");
      form.append("photo", new Blob([buffer], { type: "image/png" }), "chart.png");

      res = await fetch(url, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    }

    const json = (await res.json()) as any;
    if (!json?.ok) {
      const description = String(json?.description ?? "unknown error");
      await logEngine("WARNING", `telegram sendPhoto failed for ${chatId}: ${description}`, null, "bot");
      return null;
    }
    const mid = json.result?.message_id ?? null;
    if (mid) {
      await pool.query(
        `INSERT INTO telegram_messages (chat_id, message_id, direction, type, text, status)
         VALUES ($1, $2, 'out', 'photo', $3, 'sent')`,
        [String(chatId), mid, clean(caption, 4000)]
      );
    }
    return mid;
  } catch (e: any) {
    await logEngine("WARNING", `telegram sendPhoto error: ${e.message}`, null, "bot");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Send an audio narration (base64 mp3/ogg or HTTP URL) — used for education lessons. */
export async function sendAudio(
  chatId: string | number,
  audioInput: string,
  caption: string,
  opts: { parseMode?: "HTML" | "Markdown" } = {}
): Promise<number | null> {
  const token = await resolveToken();
  if (!token || !chatId) return null;
  const url = `${API}/bot${token}/sendAudio`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    let res: Response;
    const isUrl = audioInput.startsWith("http://") || audioInput.startsWith("https://");
    const isFileId = !isUrl && /^[a-zA-Z0-9_-]{20,80}$/.test(audioInput.trim());

    if (isUrl || isFileId) {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: String(chatId),
          audio: audioInput.trim(),
          caption,
          parse_mode: opts.parseMode ?? "HTML",
        }),
        signal: controller.signal,
      });
    } else {
      const cleanBase64 = audioInput.replace(/^data:audio\/\w+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const form = new FormData();
      form.append("chat_id", String(chatId));
      form.append("caption", caption);
      if (opts.parseMode ?? "HTML") form.append("parse_mode", opts.parseMode ?? "HTML");
      form.append("audio", new Blob([buffer], { type: "audio/mpeg" }), "narration.mp3");

      res = await fetch(url, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    }

    const json = (await res.json()) as any;
    if (!json?.ok) {
      const description = String(json?.description ?? "unknown error");
      await logEngine("WARNING", `telegram sendAudio failed for ${chatId}: ${description}`, null, "bot");
      return null;
    }
    const mid = json.result?.message_id ?? null;
    if (mid) {
      await pool.query(
        `INSERT INTO telegram_messages (chat_id, message_id, direction, type, text, status)
         VALUES ($1, $2, 'out', 'audio', $3, 'sent')`,
        [String(chatId), mid, clean(caption, 4000)]
      );
    }
    return mid;
  } catch (e: any) {
    await logEngine("WARNING", `telegram sendAudio error: ${e.message}`, null, "bot");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Telegram channel membership check via getChatMember. */
export async function isChannelMember(
  tgId: number,
  channelId?: string
): Promise<boolean> {
  const s: any = await getSettings().catch(() => ({}));
  const target = channelId || s["channel.id"] || s["telegram.channelId"] || config.telegram.channelId;
  if (!target || !tgId) return false;
  const r = await call<{ status: string }>("getChatMember", {
    chat_id: target,
    user_id: tgId,
  });
  if (!r) return false;
  return ["creator", "administrator", "member"].includes(r.status);
}

/** Join-channel keyboard + "check again" button. */

/** The channel the bot should advertise / gate on (settings first, env second). */
export async function resolveChannelUsername(): Promise<string> {
  const s: any = await getSettings().catch(() => ({}));
  const raw = String(s["telegram.channelUsername"] || s["channel.username"] || config.telegram.channelUsername || "").trim();
  const invite = String(s["telegram.channelInviteLink"] || s["channel.inviteLink"] || "").trim();
  const cleaned = raw
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  if (cleaned) return cleaned;
  return invite.replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "");
}

export function joinChannelKeyboard(channelUsername: string): unknown {
  return {
    inline_keyboard: [
      [
        {
          text: "🔓 عضویت در کانال",
          url: /^https?:/i.test(channelUsername)
            ? channelUsername
            : `https://t.me/${channelUsername.replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "")}`,
        },
      ],
      [{ text: "✅ بررسی عضویت", callback_data: "check_membership" }],
    ],
  };
}

export function phoneKeyboard(): unknown {
  return {
    keyboard: [[{ text: "📱 ارسال شماره تماس", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

export function miniAppKeyboard(): unknown {
  return {
    inline_keyboard: [
      [
        {
          text: "🚀 ورود به Trading Wolf",
          web_app: { url: config.telegram.miniAppUrl || config.appUrl },
        },
      ],
    ],
  };
}

// ── Telegram Mini App initData verification (HMAC-SHA256) ───────────────────
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function validateMiniAppData(initData: string, token: string, maxAgeSeconds = 3600, timeMs = Date.now()): Record<string, string> | null {
  if (!token || !initData || initData.length > 16384) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-fA-F0-9]{64}$/.test(hash)) return null;
  params.delete("hash");
  const authDate = Number(params.get("auth_date"));
  const seconds = Math.floor(timeMs / 1000);
  if (!Number.isSafeInteger(authDate) || authDate <= 0 || authDate > seconds + 60 || seconds - authDate > maxAgeSeconds) return null;
  const checkString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const expected = crypto.createHmac("sha256", secret).update(checkString).digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(hash, "hex"))) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

export async function verifyInitData(initData: string, maxAgeSeconds = 3600): Promise<Record<string, string> | null> {
  return validateMiniAppData(initData, await resolveToken(), maxAgeSeconds);
}

/** Exchange a verified initData for a session token. */
export async function miniAppLogin(
  initData: string,
  ip = "0.0.0.0"
): Promise<{ user: AuthUser; token: string } | null> {
  const data = await verifyInitData(initData);
  if (!data?.user) throw new Error("داده تلگرام معتبر نیست. لطفاً از داخل ربات باز کنید.");
  let tg: any;
  try {
    tg = JSON.parse(data.user);
  } catch {
    throw new Error("داده تلگرام معتبر نیست.");
  }
  const tgId = Number(tg.id);
  if (!Number.isSafeInteger(tgId) || tgId <= 0) throw new Error("داده تلگرام معتبر نیست.");

  let user = await one<Row>("SELECT * FROM users WHERE tg_id = $1", [tgId]);
  if (!user) {
    // Auto-register from Telegram profile (contact is collected separately).
    const r = await pool.query(
      `INSERT INTO users (tg_id, tg_username, first_name, last_name, tg_language, language, image)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tg_id) DO UPDATE SET tg_username = COALESCE(NULLIF(EXCLUDED.tg_username, ''), users.tg_username),
         first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
         tg_language = EXCLUDED.tg_language,
         image = COALESCE(NULLIF(EXCLUDED.image, ''), users.image)
       RETURNING *`,
      [
        tgId,
        clean(tg.username, 64) || null,
        clean(tg.first_name, 128) || null,
        clean(tg.last_name, 128) || null,
        clean(tg.language_code, 8) || null,
        tg.language_code === "fa" ? "fa" : "fa",
        (tg as any).photo_url ? String((tg as any).photo_url).slice(0, 400) : null,
      ]
    );
    user = r.rows[0] as Row;
    await pool.query(
      `INSERT INTO wallets (user_id, owner, asset, network, balance)
       VALUES ($1, $2, 'USDT', 'TRC20', 0) ON CONFLICT DO NOTHING`,
      [user.id, user.id]
    );
    await audit("telegram_register", user.username ?? String(tgId), user.id, "user", { tgId });
  }
  if (!user.enabled) throw new Error("حساب شما غیرفعال است. با پشتیبانی تماس بگیرید.");
  // The owner opens the panel from inside Telegram too: match the numeric id
  // saved as telegram.adminId and keep that account admin.
  const ownerSettings = (await getSettings()) as unknown as Record<string, any>;
  const ownerTgId = String(ownerSettings["telegram.adminId"] ?? config.telegram.adminId ?? "").trim();
  if (ownerTgId && ownerTgId === String(tgId) && String((user as any).role ?? "") !== "admin") {
    await pool.query("UPDATE users SET role = $2, is_vip = true WHERE id = $1", [user.id, "admin"]);
    user = { ...(user as any), role: "admin" } as Row;
  }
  const token = await createSession(user.id, "mini_app", ip);
  await audit("login", user.username ?? String(tgId), user.id, "user", { via: "mini_app" }, ip);
  return { user: toAuthUser(user), token };
}

// ── Webhook update handler ───────────────────────────────────────────────────
export async function handleTelegramUpdate(update: any): Promise<void> {
  const msg = update.message ?? update.callback_query?.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const tgId = num(update.message?.from?.id ?? update.callback_query?.from?.id);
  const text: string = clean(msg.text, 1000);

  if (update.callback_query?.data === "check_membership") {
    const member = await isChannelMember(tgId);
    if (member) {
      await sendMessage(chatId, "✅ عضویت شما تأیید شد!\n\nبرای ورود، شماره تماس خود را ارسال کنید:", {
        replyMarkup: phoneKeyboard(),
      });
    } else {
      await sendMessage(
        chatId,
        "❌ هنوز عضو کانال نیستید.\n\nابتدا دکمه‌ی زیر را بزنید و عضو شوید، سپس «بررسی عضویت» را فشار دهید.",
        { replyMarkup: joinChannelKeyboard(await resolveChannelUsername()) }
      );
    }
    return;
  }

  if (msg.contact) {
    // ── Phone received → verify membership → create/update user → Mini App ──
    const phone = clean(msg.contact.phone_number, 24);
    if (Number(msg.contact.user_id) !== tgId || msg.chat.type !== "private") {
      await sendMessage(chatId, "فقط شمارهٔ متعلق به حساب تلگرام خودتان معتبر است.");
      return;
    }
    const member = await isChannelMember(tgId);
    if (!member) {
      await sendMessage(chatId, "❌ ابتدا باید عضو کانال شوید.", {
        replyMarkup: joinChannelKeyboard(await resolveChannelUsername()),
      });
      return;
    }
    await pool.query(
      `INSERT INTO users (tg_id, phone, phone_verified, channel_verified, last_activity)
       VALUES ($1,$2,true,true,$3) ON CONFLICT (tg_id) DO UPDATE SET phone=EXCLUDED.phone,
       phone_verified=true,channel_verified=true,last_activity=EXCLUDED.last_activity`,
      [tgId, phone, now()]);
    await audit("phone_verified", null, null, "user", { tgId });
    await sendMessage(
      chatId,
      `🎉 خوش آمدید، گرگ عزیز! 🐺\n\nشماره شما تأیید شد.\nاز دکمه‌ی زیر وارد پنل شوید:`,
      { replyMarkup: miniAppKeyboard() }
    );
    return;
  }

  if (/^\/start(?:@\w+)?(?:\s.*)?$/.test(text) || text === "start") {
    const member = await isChannelMember(tgId);
    if (member) {
      await sendMessage(
        chatId,
        "🐺 <b>Trading Wolf AI</b>\n\nبرای ورود، شماره تماس خود را ارسال کنید:",
        { replyMarkup: phoneKeyboard(), parseMode: "HTML" }
      );
    } else {
      await sendMessage(
        chatId,
        "🐺 به <b>Trading Wolf AI</b> خوش آمدید!\n\n⚠️ برای استفاده، ابتدا باید عضو کانال شوید:",
        { replyMarkup: joinChannelKeyboard(await resolveChannelUsername()), parseMode: "HTML" }
      );
    }
    return;
  }

  // Default: point every other message to the Mini App.
  await sendMessage(
    chatId,
    "🐺 تمام امکانات از داخل <b>Mini App</b> در دسترس است. دکمه‌ی زیر را بزنید:",
    { replyMarkup: miniAppKeyboard(), parseMode: "HTML" }
  );
}

// ── Trade alert to channel (with "view details" Mini App button) ────────────
﻿export function formatTradeAlert(p: Row, mode: "open" | "close" | "signal", lang: "fa" | "en"): string {
  const en = lang === "en";
  const money = (field: unknown): string => {
    const n = Number(field);
    if (!Number.isFinite(n) || n === 0) return en ? "not recorded" : "ثبت نشده";
    const a = Math.abs(n);
    const digits = a >= 100 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 8;
    return n.toFixed(digits).replace(/\.?0+$/, "");
  };
  const num2 = (v: unknown, d = 2) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(d).replace(/\.?0+$/, "") : "—";
  };
  const has = (v: unknown) => v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) > 0;
  const strategies = (Array.isArray(p.strategy_keys) ? p.strategy_keys : Array.isArray(p.strategyKeys) ? p.strategyKeys : []).slice(0, 4).join(" · ") || "—";
  const entry = Number(p.entry);
  const sl = Number(p.stop_loss ?? p.stopLoss);
  const tp = Number(p.take_profit ?? p.takeProfit);
  const qty = Number(p.quantity);
  const targets = Array.isArray(p.targets) ? (p.targets as unknown[]).map((t) => Number(t)).filter((t) => Number.isFinite(t) && t > 0) : [];
  const riskPct = has(entry) && has(sl) ? (Math.abs(entry - sl) / entry) * 100 : NaN;
  const rewardPct = has(entry) && has(tp) ? (Math.abs(tp - entry) / entry) * 100 : NaN;
  const rr = has(entry) && has(sl) && has(tp) ? Math.abs(tp - entry) / Math.abs(entry - sl) : Number(p.rr);
  // Money at risk at entry (1N) and the realised result expressed in N.
  const riskMoney = Number.isFinite(entry) && Number.isFinite(sl) && has(qty) ? Math.abs(entry - sl) * qty : NaN;
  const capital = Number(p.capital ?? p.capital_at_open);
  const capitalAfter = Number(p.capital_after ?? p.capitalAfter);
  const profitNum = Number(p.profit ?? p.pnl);
  const rMult = Number.isFinite(riskMoney) && riskMoney > 0 && Number.isFinite(profitNum)
    ? profitNum / riskMoney
    : Number(p.r_multiple ?? p.rMultiple);

  const side = String(p.side ?? "").toLowerCase() === "long" ? (en ? "🟢 LONG" : "🟢 لانگ") : en ? "🔴 SHORT" : "🔴 شورت";
  const market = String(p.market ?? "").trim();
  const tf = String(p.timeframe ?? p.expected_duration ?? "").trim();
  const head = mode === "open" ? (en ? "🐺 NEW TRADE OPENED" : "🐺 معامله جدید باز شد")
    : mode === "close" ? (en ? "🐺 TRADE CLOSED" : "🐺 معامله بسته شد")
    : en ? "🐺 NEW SIGNAL" : "🐺 سیگنال جدید";
  const lines: string[] = [];
  lines.push(head);
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push(`${en ? "📊 Symbol" : "📊 نماد"}: ${String(p.symbol ?? "-")}${market ? ` (${market}${tf ? ` · ${tf}` : ""})` : ""}`);
  lines.push(`${en ? "Side" : "جهت"}: ${side}${has(p.leverage) ? ` · ${en ? "leverage" : "اهرم"}: ${num2(p.leverage, 1)}x` : ""}`);
  lines.push(`${en ? "💵 Entry" : "💵 ورود"}: ${money(entry)}`);
  if (has(sl)) lines.push(`${en ? "🛑 Stop loss" : "🛑 حد ضرر"}: ${money(sl)}${Number.isFinite(riskPct) ? ` (${num2(riskPct, 2)}%)` : ""}`);
  if (has(tp)) lines.push(`${en ? "🎯 Final target" : "🎯 هدف نهایی"}: ${money(tp)}${Number.isFinite(rewardPct) ? ` (+${num2(rewardPct, 2)}%)` : ""}`);
  if (targets.length) lines.push(`${en ? "Ladder targets" : "اهداف پله‌ای"}: ${targets.map((t, i) => `TP${i + 1} ${money(t)}`).join(" · ")}`);
  if (Number.isFinite(rr) && rr > 0) lines.push(`${en ? "⚖️ Risk/Reward" : "⚖️ ریسک به ریوارد"}: ${num2(rr, 2)}`);
  if (has(p.size) || has(qty) || has(p.margin)) {
    lines.push(`${en ? "📦 Size" : "📦 حجم"}: ${has(qty) ? num2(qty, 6) : "—"}${has(p.margin) ? ` · ${en ? "margin" : "مارجین"} ${num2(p.margin, 2)}` : ""}${has(p.size) ? ` · ${en ? "notional" : "ارزش"} ${num2(p.size, 2)}` : ""} USDT`);
  }
  if (Number.isFinite(capital) && capital > 0) lines.push(`${en ? "💰 Available capital" : "💰 سرمایهٔ در دسترس"}: ${num2(capital, 2)} USDT`);
  if (Number.isFinite(riskMoney) && riskMoney > 0) lines.push(`${en ? "🛡 Risk 1N" : "🛡 ریسک 1N"}: ${num2(riskMoney, 2)} USDT${Number.isFinite(capital) && capital > 0 ? ` (${num2((riskMoney / capital) * 100, 2)}%)` : ""}`);
  if (has(p.score)) lines.push(`${en ? "🎯 Score" : "🎯 امتیاز"}: ${num2(p.score, 1)}/100${has(p.confidence) ? ` · ${en ? "confidence" : "اطمینان"} ${Math.round(Number(p.confidence) * 100)}%` : ""}`);
  lines.push(`${en ? "🧠 Strategies" : "🧠 استراتژی‌ها"}: ${strategies}`);
  if (has(p.liquidation)) lines.push(`${en ? "⚠️ Liquidation" : "⚠️ لیکوییدیشن"}: ${money(p.liquidation)}`);
  if (mode === "close") {
    const profit = Number(p.profit ?? p.pnl);
    const pnlPct = Number(p.pnl_pct ?? p.pnlPct);
    const win = Number.isFinite(profit) ? profit >= 0 : null;
    lines.push("━━━━━━━━━━━━━━━━━━");
    lines.push(`${win === null ? "💰" : win ? "✅" : "❌"} ${en ? "Result" : "نتیجه"}: ${Number.isFinite(profit) ? `${profit >= 0 ? "+" : ""}${num2(profit, 2)} USDT` : "—"}${Number.isFinite(pnlPct) ? ` (${pnlPct >= 0 ? "+" : ""}${num2(pnlPct, 2)}%)` : ""}`);
    if (Number.isFinite(rMult)) lines.push(`${en ? "📐 Result in N" : "📐 نتیجه بر حسب N"}: ${rMult >= 0 ? "+" : ""}${num2(rMult, 2)}N`);
    // The headline number above is NET. Show what the broker kept, and the toman
    // equivalent, so the channel never advertises a profit the wallet never saw.
    const grossPnl = Number((p as any).gross_pnl ?? (p as any).grossPnl);
    const feeUsd = Number((p as any).fee);
    const rateToman = Number((p as any).toman_rate ?? (p as any).tomanRate);
    const toToman = (usd: number) => (Number.isFinite(rateToman) && rateToman > 0 ? Math.round(usd * rateToman).toLocaleString("en-US") : "");
    if (Number.isFinite(grossPnl) && Number.isFinite(feeUsd) && feeUsd > 0) {
      lines.push(`${en ? "🧾 Gross / all costs" : "🧾 ناخالص / همهٔ هزینه‌ها"}: ${grossPnl >= 0 ? "+" : ""}${num2(grossPnl, 4)} / −${num2(feeUsd, 4)} USDT`);
      lines.push(`${en ? "📉 Cost share" : "📉 سهم هزینه"}: ${Number.isFinite(Number(p.size)) && Number(p.size) > 0 ? num2((feeUsd / Number(p.size)) * 100, 2) : "—"}% ${en ? "of notional" : "از ارزش معامله"}`);
      if (toToman(profit)) lines.push(`${en ? "🏦 Net in toman" : "🏦 خالص به تومان"}: ${profit >= 0 ? "+" : ""}${toToman(profit)} ${en ? "T" : "تومان"}`);
    }
    if (Number.isFinite(capitalAfter) && capitalAfter > 0) lines.push(`${en ? "💰 Capital after" : "💰 سرمایهٔ پس از معامله"}: ${num2(capitalAfter, 2)} USDT`);
    lines.push(`${en ? "Exit price" : "قیمت خروج"}: ${money(p.close_price ?? p.current)}`);
    lines.push(`${en ? "Exit reason" : "دلیل خروج"}: ${String(p.close_reason ?? p.closeReason ?? "—")}`);
    const openT = Number(p.open_time);
    const closeT = Number(p.close_time);
    if (Number.isFinite(openT) && Number.isFinite(closeT) && closeT > openT) {
      const mins = Math.round((closeT - openT) / 60000);
      const dur = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
      lines.push(`${en ? "⏳ Duration" : "⏳ مدت"}: ${dur}`);
    }
  }
  if (has(p.progress)) lines.push(`${en ? "Progress" : "پیشرفت"}: ${num2(Number(p.progress) * 100, 1)}%`);
  const when = Number(p.close_time ?? p.open_time ?? p.created_at);
  lines.push(`${en ? "🕒 Time" : "🕒 زمان"}: ${Number.isFinite(when) && when > 0 ? new Date(when).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—"}`);
  lines.push(`${en ? "Mode" : "حالت"}: ${String(p.mode ?? "demo").toUpperCase()}${p.exchange ? ` · ${String(p.exchange)}` : ""}`);
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("#WOLF_TRADE");
  return lines.join("\n");
}

export async function notifyTradeChannel(
  p: Row,
  mode: "open" | "close" | "signal"
): Promise<void> {
  const settings = await getSettings();
  // A signal alert used to obey channel.postTrades, so turning signal posts
  // off in the panel had no effect on anything.
  const postAllowed = mode === "signal" ? settings["channel.postSignals"] !== false : settings["channel.postTrades"] !== false;
  if (!settings["telegram.enabled"] || settings["notify.channel"] === false || !postAllowed || !(await resolveToken())) return;
  const channels = [
    { id: String(settings["channel.id"] || config.telegram.channelId || "").trim(), lang: "fa" as const },
    { id: String(settings["channel.enId"] || "").trim(), lang: "en" as const },
  ].filter((ch, index, all) => ch.id && all.findIndex((other) => other.id === ch.id) === index);
  const miniAppUrl = String(settings["telegram.miniAppUrl"] || config.telegram.miniAppUrl || config.appUrl || "").trim();
  for (const channel of channels) {
    const en = channel.lang === "en";
    const chartUrl = (() => {
      const sym = String(p.symbol ?? "").toUpperCase();
      if (!sym) return "";
      if (sym.endsWith("USDT")) return `https://www.tradingview.com/chart/?symbol=BINANCE:${sym}`;
      if (sym.endsWith("USD") && sym.length <= 7) return `https://www.tradingview.com/chart/?symbol=OANDA:${sym}`;
      return `https://www.tradingview.com/chart/?symbol=${sym}`;
    })();
    const buttons: any[] = [];
    if (chartUrl) buttons.push({ text: en ? "📈 Live chart" : "📈 چارت زنده", url: chartUrl });
    if (miniAppUrl.startsWith("https://")) buttons.push({ text: en ? "🐺 Open panel" : "🐺 ورود به پنل", url: miniAppUrl });
    const replyMarkup = buttons.length ? { inline_keyboard: [buttons] } : undefined;
    const rateToman = await usdtTomanRate().catch(() => 0);
    const payload = { ...p, toman_rate: rateToman } as Row;
    await pool.query(`INSERT INTO telegram_outbox (dedup_key,chat_id,text,reply_markup) VALUES ($1,$2,$3,$4) ON CONFLICT (dedup_key) DO NOTHING`,
      [`trade:${p.id}:${mode}:${channel.id}`, channel.id, formatTradeAlert(payload, mode, channel.lang), JSON.stringify(replyMarkup ?? null)]);
  }
}

/** Persistent retry queue; a Telegram outage never rolls back a trade. */
export async function drainTelegramOutbox(): Promise<void> {
  const settings = await getSettings();
  if (!settings["telegram.enabled"]) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rows = (await client.query("SELECT * FROM telegram_outbox WHERE status='pending' AND next_attempt_at <= $1 ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED", [now()])).rows;
    for (const row of rows) {
      // Telegram rejects "object expected as reply markup" when the field is
      // null (or the string "null"), which silently dropped every plain card.
      const rawMarkup = typeof row.reply_markup === "string" ? row.reply_markup.trim() : row.reply_markup;
      const markup = rawMarkup && rawMarkup !== "null" && rawMarkup !== "{}" ? rawMarkup : undefined;
      const payload: Record<string, unknown> = { chat_id: row.chat_id, text: row.text, parse_mode: "HTML" };
      if (markup) payload.reply_markup = markup;
      const result = await call<{ message_id: number }>("sendMessage", payload);
      const attempts = row.attempts + 1;
      await client.query(`UPDATE telegram_outbox SET attempts=$2,status=$3,message_id=$4,next_attempt_at=$5,last_error=$6 WHERE id=$1`,
        [row.id, attempts, result ? "sent" : attempts >= 12 ? "failed" : "pending", result?.message_id ?? null,
          now() + Math.min(3600_000, 5000 * 2 ** attempts), result ? null : "telegram_delivery_unconfirmed"]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

/** Send a notification row to a user's Telegram if they have tg_id. */
export async function notifyUserTelegram(
  userId: string,
  textFa: string,
  textEn: string
): Promise<void> {
  const settings = await getSettings();
  if (!settings["telegram.enabled"]) throw new Error("ارسال تلگرام غیرفعال است.");
  const u = await one<Row>("SELECT tg_id,language FROM users WHERE id = $1", [userId]);
  if (!u?.tg_id) throw new Error("ابتدا تلگرام همین حساب را متصل کنید.");
  if (!(await resolveToken())) throw new Error("توکن ربات تنظیم نشده است.");
  await pool.query("INSERT INTO telegram_outbox (dedup_key,chat_id,text) VALUES ($1,$2,$3)",
    [`user:${userId}:${crypto.randomUUID()}`, String(u.tg_id), u.language === "en" ? textEn || textFa : textFa || textEn]);
}

/** Set the webhook URL for the bot (called by admin API). */
/** Fetch getWebhookInfo from the Telegram API using the live token. */
export async function getWebhookInfoApi(): Promise<Record<string, any>> {
  try {
    const token = await resolveToken();
    if (!token) return { ok: false, error: "توکن ربات تنظیم نشده است." };
    const url = `${API}/bot${token}/getWebhookInfo`;
    const res = await fetch(url);
    const json = (await res.json()) as any;
    if (!json?.ok) {
      return { ok: false, error: String(json?.description ?? "خطا در دریافت وضعیت وبهوک"), ...(json?.result ?? {}) };
    }
    const r = json.result ?? {};
    return {
      ok: true,
      url: String(r.url ?? ""),
      pendingUpdateCount: Number(r.pending_update_count ?? 0),
      lastError: String(r.last_error_message ?? ""),
      lastErrorDate: Number(r.last_error_date ?? 0),
      description: String(r.description ?? ""),
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}


/** Drop the cached settings-derived bot token (call after the admin saves
 * a new token so the next Telegram call picks it up immediately). */
export function invalidateTelegramTokenCache(): void {
  dbTokenCache = null;
  dbTokenAt = 0;
}

export async function setWebhook(
  url: string,
  secret: string,
): Promise<{ ok: boolean; description?: string; error?: string }> {
  const token = await resolveToken();
  if (!token) {
    return { ok: false, error: "توکن ربات تنظیم نشده است." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${API}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
      }),
      signal: controller.signal,
    });
    const json = (await res.json()) as any;
    if (!json?.ok) {
      const description = String(json?.description ?? "setWebhook_failed");
      await logEngine("WARNING", `telegram setWebhook failed: ${description}`, { url: clean(url, 200) }, "bot");
      return { ok: false, description, error: description };
    }
    return { ok: true, description: String(json?.description ?? "") };
  } catch (e: any) {
    const emsg = String(e?.message ?? e);
    await logEngine("WARNING", `telegram setWebhook error: ${emsg}`, null, "bot");
    return { ok: false, error: emsg };
  } finally {
    clearTimeout(timer);
  }
}
