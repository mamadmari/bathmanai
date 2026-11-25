// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — Bale (بله) payment bot
// Bale's Bot API mirrors the Telegram one (https://tapi.bale.ai/bot<token>/M).
// Flow: web panel creates an order → user opens ble.ir/<bot>?start=wolf_pay_<code>
// → bot sends an in-app wallet invoice → successful_payment credits the IRT
// wallet of that order's owner.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import { now, num, clean } from "./util.js";
import { pool, one, many, audit, type Row } from "./db.js";
import { getSettings } from "./settings.js";
import { sendMessage } from "./telegram.js";

const API = "https://tapi.bale.ai";
const TEST_PROVIDER = "WALLET-TEST-1111111111111111";
const CURRENCY = "IRR"; // Bale invoices are expressed in Rials

export async function baleToken(): Promise<string> {
  const s = (await getSettings()) as unknown as Record<string, any>;
  return String(s["bale.token"] || process.env.BALE_BOT_TOKEN || "").trim();
}

async function providerToken(): Promise<{ token: string; test: boolean }> {
  const s = (await getSettings()) as unknown as Record<string, any>;
  const real = String(s["bale.providerToken"] || process.env.BALE_PROVIDER_TOKEN || "").trim();
  if (real) return { token: real, test: false };
  return { token: TEST_PROVIDER, test: true };
}

export async function baleCall(method: string, payload: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<any> {
  const token = await baleToken();
  if (!token) return { ok: false, description: "bale token missing" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return await res.json();
  } catch (e: any) {
    return { ok: false, description: String(e?.message ?? "bale request failed") };
  } finally {
    clearTimeout(timer);
  }
}

let botInfoCache: { at: number; username: string; id: number; name: string } | null = null;

export async function baleBotInfo(): Promise<{ username: string; id: number; name: string } | null> {
  if (botInfoCache && Date.now() - botInfoCache.at < 3_600_000) return botInfoCache;
  const r = await baleCall("getMe");
  if (!r?.ok || !r.result) return null;
  botInfoCache = {
    at: Date.now(),
    username: String(r.result.username ?? ""),
    id: Number(r.result.id ?? 0),
    name: String(r.result.first_name ?? ""),
  };
  return botInfoCache;
}

/** Short, URL-safe code used inside ble.ir/<bot>?start=<code>. */
function shortCode(orderId: string): string {
  return `wolf_pay_${String(orderId).replace(/-/g, "").slice(0, 18)}`;
}

export async function baleDeepLink(orderId: string): Promise<string> {
  const info = await baleBotInfo();
  const s = (await getSettings()) as unknown as Record<string, any>;
  const username = info?.username || String(s["bale.botUsername"] || "wlofbot");
  return `https://ble.ir/${username}?start=${shortCode(orderId)}`;
}

export async function createBaleOrder(userId: string, amountToman: number, purpose = "wallet_topup") {
  // The payload MUST be derived from the order id: the deep link carries the
  // short code and the bot looks the order up by it, so both must match.
  const id = crypto.randomUUID();
  const payload = shortCode(id);
  const r = await pool.query(
    `INSERT INTO bale_orders (id, user_id, amount, currency, status, purpose, payload, provider_test, created_at)
     VALUES ($1, $2, $3, 'IRT', 'pending', $4, $5, true, $6) RETURNING *`,
    [id, userId, Math.round(amountToman), purpose, payload, now()],
  );
  return r.rows[0] as Row;
}

export async function orderByCode(code: string): Promise<Row | null> {
  const payload = String(code).startsWith("wolf_pay_") ? String(code) : `wolf_pay_${String(code).replace(/^wolf_pay_/, "")}`;
  return one<Row>("SELECT * FROM bale_orders WHERE payload = $1", [payload]);
}

export async function orderByInvoicePayload(payload: string): Promise<Row | null> {
  return one<Row>("SELECT * FROM bale_orders WHERE payload = $1", [String(payload)]);
}

export async function orderForUser(userId: string, orderId: string): Promise<Row | null> {
  return one<Row>("SELECT * FROM bale_orders WHERE id = $1 AND user_id = $2", [orderId, userId]);
}

/** Ensure an IRT wallet exists, then add the amount and log the transaction. */
export async function creditIrtWallet(userId: string, amountToman: number, orderId: string, note: string): Promise<number> {
  let wallet = await one<Row>("SELECT * FROM wallets WHERE user_id = $1 AND asset = 'IRT' ORDER BY created_at ASC LIMIT 1", [userId]);
  if (!wallet) {
    const r = await pool.query(
      `INSERT INTO wallets (user_id, owner, asset, network, balance) VALUES ($1, $2, 'IRT', 'BALE', 0)
       ON CONFLICT DO NOTHING RETURNING *`,
      [userId, userId],
    );
    wallet = (r.rows[0] as Row) ?? (await one<Row>("SELECT * FROM wallets WHERE user_id = $1 AND asset = 'IRT' ORDER BY created_at ASC LIMIT 1", [userId]));
  }
  if (!wallet) throw new Error("IRT wallet not available");
  const updated = await one<Row>("UPDATE wallets SET balance = COALESCE(balance,0) + $1 WHERE id = $2 RETURNING balance", [amountToman, wallet.id]);
  const balance = num(updated?.balance);
  await pool.query(
    `INSERT INTO wallet_transactions (wallet_id, user_id, type, asset, amount, network, status, ref, note, balance_after)
     VALUES ($1,$2,'deposit','IRT',$3,'BALE','approved',$4,$5,$6)`,
    [wallet.id, userId, amountToman, orderId, note, balance],
  );
  return balance;
}

async function baleSend(chatId: string | number, text: string, keyboard?: unknown): Promise<any> {
  return baleCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

async function sendInvoiceForOrder(chatId: string | number, order: Row): Promise<any> {
  const provider = await providerToken();
  const toman = num(order.amount);
  const result = await baleCall("sendInvoice", {
    chat_id: chatId,
    title: "شارژ کیف پول Trading Wolf AI",
    description: `شارژ ${toman.toLocaleString("fa-IR")} تومانی کیف پول تومانی\nکد سفارش: ${String(order.payload)}`,
    payload: String(order.payload),
    provider_token: provider.token,
    currency: CURRENCY,
    prices: [{ label: "شارژ کیف پول", amount: Math.round(toman * 10) }],
    need_name: false,
    need_phone_number: false,
    need_email: false,
    is_flexible: false,
  });
  if (provider.test) {
    await baleSend(chatId, "⚠️ درگاه در حالت <b>آزمایشی</b> است (توکن آزمایشی بله). پرداخت انجام می‌شود اما پول واقعی جابه‌جا نمی‌شود و موجودی فقط پس از تنظیم توکن اصلی کیف پول شارژ می‌شود.");
  }
  return result;
}

async function notifyOwner(text: string): Promise<void> {
  try {
    const s = (await getSettings()) as unknown as Record<string, any>;
    const adminId = num(s["telegram.adminId"]);
    if (adminId) await sendMessage(adminId, text);
  } catch {
    /* owner notification is best-effort */
  }
}

async function markPaidAndCredit(update: any): Promise<void> {
  const payment = update?.message?.successful_payment;
  if (!payment) return;
  const payload = String(payment.invoice_payload ?? "");
  const order = await orderByInvoicePayload(payload);
  if (!order) return;
  if (String(order.status) === "paid") return;
  const chargeId = String(payment.telegram_payment_charge_id ?? payment.provider_payment_charge_id ?? "");
  const toman = Math.round(num(payment.total_amount) / 10); // invoice amounts are Rials
  const s = (await getSettings()) as unknown as Record<string, any>;
  const creditTest = s["bale.creditTestPayments"] === true;
  const isTest = order.provider_test === true;
  await pool.query(
    "UPDATE bale_orders SET status = $2, paid_at = $3, payment_charge_id = $4, chat_id = $5 WHERE id = $1",
    [order.id, isTest && !creditTest ? "paid_test" : "paid", now(), chargeId, String(update.message?.chat?.id ?? "")],
  );
  if (isTest && !creditTest) {
    await baleSend(update.message.chat.id, "✅ پرداخت ثبت شد، اما درگاه آزمایشی است و موجودی شارژ نشد. لطفاً با پشتیبانی تماس بگیرید.");
    await notifyOwner(`⚠️ <b>پرداخت تستی بله</b>\n👤 ${order.user_id}\n💵 ${toman} تومان\nکد: ${payload}`);
    return;
  }
  try {
    const balance = await creditIrtWallet(String(order.user_id), toman, String(order.id), "شارژ با ربات بله");
    await audit("bale_topup", null, String(order.user_id), "wallet", { amount: toman, order: order.id, chargeId });
    await baleSend(
      update.message.chat.id,
      `✅ <b>شارژ با موفقیت انجام شد</b>\n💵 مبلغ: ${toman.toLocaleString("fa-IR")} تومان\n💳 موجودی جدید: ${balance.toLocaleString("fa-IR")} تومان`,
      { inline_keyboard: [[{ text: "🐺 باز کردن پنل", url: "https://wolf.nightmind.ir/app" }]] },
    );
    await notifyOwner(`💰 <b>شارژ کیف پول</b>\n💵 ${toman} تومان\n🧾 سفارش ${String(order.payload)}`);
  } catch (e: any) {
    await pool.query("UPDATE bale_orders SET status = 'failed' WHERE id = $1", [order.id]);
    await notifyOwner(`❌ خطا در شارژ سفارش ${String(order.payload)}: ${String(e?.message ?? "")}`);
  }
}

const WELCOME_TEXT = [
  "🐺 **Trading Wolf AI** — کیف پول تومانی",
  "",
  "من پرداخت‌های شما را انجام می‌دهم. برای شارژ، از پنل دکمهٔ «شارژ با بله» را بزنید تا لینک پرداخت بیاید؛ همین‌جا روی «پرداخت» بزنید.",
  "",
  "دستورها: /pay آخرین سفارش • /panel ورود به پنل • /support پشتیبانی • /help راهنما",
].join("\n");

const SUPPORT_TEXT = [
  "🎧 پشتیبانی Trading Wolf AI",
  "",
  "سؤال یا مشکل داری؟ روی دکمهٔ زیر بزن و مستقیم با تیم حرف بزن. میانگین پاسخ‌دهی: کمتر از ۳۰ دقیقه.",
  "",
  "قبل از پیام، کد سفارش پرداختت را آماده کن تا سریع‌تر بررسی شود.",
].join("\n");

/** Command menu shown by the Bale client. */
export async function registerBaleCommands(): Promise<void> {
  try {
    await baleCall("setMyCommands", {
      commands: [
        { command: "start", description: "شروع و راهنمای شارژ" },
        { command: "pay", description: "پرداخت آخرین سفارش" },
        { command: "panel", description: "ورود به پنل کاربری" },
        { command: "support", description: "پشتیبانی" },
        { command: "help", description: "راهنما" },
      ],
    });
  } catch {
    /* the bot may not be ready yet — never crash the worker */
  }
}

const HELP_TEXT =
  "🐺 <b>ربات پرداخت Trading Wolf AI</b>\n\n" +
  "برای شارژ کیف پول تومانی:\n" +
  "1️⃣ وارد پنل شوید → کیف پول → «شارژ با بله»\n" +
  "2️⃣ روی «پرداخت در بله» بزنید و همین ربات باز می‌شود\n" +
  "3️⃣ فاکتور را پرداخت کنید؛ موجودی بلافاصله اضافه می‌شود.\n\n" +
  "دستورها:\n/pay — پرداخت آخرین فاکتور\n/help — راهنما\n/ping — بررسی سلامت\n\n" +
  "🌐 https://wolf.nightmind.ir/app";

export async function handleBaleUpdate(update: any): Promise<void> {
  if (!update) return;

  // 1) payment pre-checkout: approve only known, pending orders
  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const order = await orderByInvoicePayload(String(q.invoice_payload ?? ""));
    const ok = Boolean(order) && String(order?.status) === "pending";
    await baleCall("answerPreCheckoutQuery", {
      pre_checkout_query_id: q.id,
      ok,
      ...(ok ? {} : { error_message: "این سفارش معتبر یا فعال نیست. از پنل یک سفارش جدید بسازید." }),
    });
    return;
  }

  // 2) successful payment → credit the wallet
  if (update.message?.successful_payment) {
    await markPaidAndCredit(update);
    return;
  }

  // 3) callback buttons
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = String(cb.data ?? "");
    const chatId = cb.message?.chat?.id ?? cb.from?.id;
    await baleCall("answerCallbackQuery", { callback_query_id: cb.id });
    if (data === "help" && chatId) {
    await baleSend(chatId, HELP_TEXT);
    return;
  }

  if (data.startsWith("pay:") && chatId) {
      const order = await orderByCode(data.slice(4));
      if (order) await sendInvoiceForOrder(chatId, order);
    }
    return;
  }

  const msg = update.message;
  const chatId = msg?.chat?.id;
  const text = clean(msg?.text, 200);
  if (!chatId || !text) return;

  // 4) deep link /start wolf_pay_<code>
  if (text.startsWith("/start")) {
    const payload = text.split(" ").slice(1).join(" ").trim();
    if (payload.startsWith("wolf_pay_")) {
      const order = await orderByCode(payload);
      if (!order) {
        await baleSend(chatId, "❌ این لینک پرداخت معتبر نیست یا منقضی شده. از پنل یک سفارش جدید بسازید.");
        return;
      }
      if (String(order.status) !== "pending") {
        await baleSend(chatId, `ℹ️ این سفارش قبلاً پردازش شده است (وضعیت: ${String(order.status)}).`);
        return;
      }
      await pool.query("UPDATE bale_orders SET chat_id = $2 WHERE id = $1", [order.id, String(chatId)]);
      await sendInvoiceForOrder(chatId, order);
      return;
    }
    await baleSend(chatId, WELCOME_TEXT, {
      inline_keyboard: [
        [{ text: "💳 شارژ کیف پول (پنل)", url: "https://wolf.nightmind.ir/app" }],
        [{ text: "🎧 پشتیبانی", url: "https://t.me/marijtrade" }, { text: "📊 کانال سیگنال", url: "https://t.me/marijtrade" }],
        [{ text: "❓ راهنما", callback_data: "help" }],
      ],
    });
    return;
  }

  if (text.startsWith("/support") || text.startsWith("/help")) {
    await baleSend(chatId, SUPPORT_TEXT, {
      inline_keyboard: [[{ text: "🎧 گفتگو با پشتیبانی", url: "https://t.me/marijtrade" }]],
    });
    return;
  }

  if (text.startsWith("/panel")) {
    await baleSend(chatId, "🔗 پنل کاربری Trading Wolf AI:", {
      inline_keyboard: [[{ text: "ورود به پنل", url: "https://wolf.nightmind.ir/app" }]],
    });
    return;
  }

  if (text.startsWith("/pay")) {
    const last = await one<Row>(
      "SELECT * FROM bale_orders WHERE chat_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
      [String(chatId)],
    );
    if (last) await sendInvoiceForOrder(chatId, last);
    else await baleSend(chatId, "سفارش بازی نداری. از پنل «شارژ با بله» را بزن.");
    return;
  }

  if (text.startsWith("/ping")) {
    await baleSend(chatId, "pong ✅");
    return;
  }

  await baleSend(chatId, HELP_TEXT);
}

async function baleState(key: string): Promise<string | null> {
  const row = await one<Row>("SELECT v FROM bale_state WHERE k = $1", [key]);
  return row ? String(row.v) : null;
}

async function setBaleState(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO bale_state (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
    [key, value],
  );
}

/** Long polling kept in the worker: Bale delivers updates without inbound webhooks. */
export async function pollBaleUpdates(): Promise<number> {
  const s = (await getSettings()) as unknown as Record<string, any>;
  if (s["bale.enabled"] === false) return 0;
  if (!(await baleToken())) return 0;
  const offset = Number((await baleState("offset")) ?? 0) || 0;
  const res = await baleCall("getUpdates", { offset, limit: 20, timeout: 0 }, 20_000);
  const list = Array.isArray(res?.result) ? res.result : [];
  let handled = 0;
  for (const update of list) {
    try {
      await handleBaleUpdate(update);
      handled++;
    } catch (e: any) {
      console.error("[bale] update failed", String(e?.message ?? e));
    }
    const id = Number(update?.update_id);
    if (Number.isFinite(id)) await setBaleState("offset", String(id + 1));
  }
  return handled;
}
