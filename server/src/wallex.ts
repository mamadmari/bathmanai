// ─────────────────────────────────────────────────────────────────────────────
// Wallex (والکس) — margin trading adapter.
// Unlike Nobitex (order based, closes leave dust), Wallex works on *positions*:
//   POST  /margin-trade/v1/positions                open (with stop_loss/take_profit)
//   PATCH /margin-trade/v1/positions/{id}/close     close the whole position
//   PATCH /margin-trade/v1/positions/{id}/sltp      move the protective levels
// so a close can never leave an unclosable remainder behind.
// ─────────────────────────────────────────────────────────────────────────────
import { logEngine } from "./db.js";
import { decryptSecret, num } from "./util.js";
import { getSetting } from "./settings.js";
import type { ExchangeAdapter, Kline } from "./exchanges.js";

const BASE = "https://api.wallex.ir";
const RES: Record<string, string> = {
  "1m": "1", "5m": "15", "15m": "15", "30m": "15",
  "1h": "60", "4h": "240", "8h": "480", "12h": "720", "1d": "1D", "3d": "3D",
};

let keyCache: { key: string; at: number } | null = null;
async function apiKey(): Promise<string> {
  if (keyCache && Date.now() - keyCache.at < 300_000) return keyCache.key;
  const stored = String((await getSetting<string>("wallex.apiKey", "")) ?? "");
  const key = stored.includes(":") ? decryptSecret(stored) : stored;
  keyCache = { key, at: Date.now() };
  return key;
}

async function call(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<any> {
  const key = await apiKey();
  if (!key) throw new Error("wallex_api_key_missing");
  const res = await fetch(BASE + path, {
    method,
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok || json?.success === false) {
    const detail =
      json?.result && typeof json.result === "object" ? JSON.stringify(json.result) : String(json?.message ?? res.status);
    throw new Error(`wallex ${path}: ${String(detail).slice(0, 240)}`);
  }
  return json;
}

let marketsCache: { at: number; data: Map<string, any> } | null = null;
/** Kept tiny on purpose: only the cache TTL is read from settings here. */
async function getSettingSafe<T>(key: string, fallback: T): Promise<T> {
  try {
    const { getSetting } = await import("./settings.js");
    const v = await getSetting<T>(key, fallback);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
async function markets(): Promise<Map<string, any>> {
  const ttl = Math.max(500, Math.min(60_000, num(await getSettingSafe("wallex.tickerCacheMs", 2000)) || 2000));
  if (marketsCache && Date.now() - marketsCache.at < ttl) return marketsCache.data;
  const res = await fetch(`${BASE}/hector/web/v1/markets`, {
    headers: { "Accept-Encoding": "gzip" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`wallex markets HTTP ${res.status}`);
  const j: any = await res.json();
  const map = new Map<string, any>();
  for (const m of j?.result?.markets ?? []) map.set(String(m.symbol), m);
  marketsCache = { at: Date.now(), data: map };
  return map;
}

/** The engine prices in USDT; Wallex TMN markets are quoted in toman.
 *  The rate is the single most dangerous number in the system: a 10x snapshot
 *  glitch once produced entry=6341 for BTC (real 63412) and sized a position
 *  from garbage. USDTTMN quotes the rate directly, so it comes first, every
 *  candidate is sanity-banded, two markets must agree, and the last good value
 *  is reused instead of returning nonsense. */
let lastGoodRate = 0;
let lastGoodAt = 0;
const rateSane = (r: number): boolean => Number.isFinite(r) && r > 50_000 && r < 3_000_000;

export async function wallexTomanRate(): Promise<number> {
  const remember = (r: number): number => {
    lastGoodRate = r;
    lastGoodAt = Date.now();
    return r;
  };
  try {
    const mk = await markets();
    const direct = num(mk.get("USDTTMN")?.price);
    const btcTmn = num(mk.get("BTCTMN")?.price);
    const btcUsdt = num(mk.get("BTCUSDT")?.price);
    const ratio = btcTmn > 0 && btcUsdt > 0 ? btcTmn / btcUsdt : 0;
    const ethTmn = num(mk.get("ETHTMN")?.price);
    const ethUsdt = num(mk.get("ETHUSDT")?.price);
    const ratio2 = ethTmn > 0 && ethUsdt > 0 ? ethTmn / ethUsdt : 0;
    const agree = (a: number, b: number): boolean => a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) < 0.05;
    if (rateSane(direct) && (ratio === 0 || agree(direct, ratio))) return remember(direct);
    if (rateSane(ratio) && (ratio2 === 0 || agree(ratio, ratio2))) return remember(ratio);
    if (rateSane(ratio2)) return remember(ratio2);
    if (rateSane(direct)) return remember(direct);
  } catch {
    /* ignore */
  }
  // A transient bad snapshot must not poison sizing: keep the last good rate.
  if (lastGoodRate > 0 && Date.now() - lastGoodAt < 30 * 60_000) return lastGoodRate;
  return 0;
}

/** Best bid/ask of a margin market. */
export async function wallexDepth(market: string): Promise<{ bid: number; ask: number }> {
  try {
    const res = await fetch(`${BASE}/v1/depth?symbol=${encodeURIComponent(market)}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { bid: 0, ask: 0 };
    const j: any = await res.json();
    return { bid: num(j?.result?.bid?.[0]?.price), ask: num(j?.result?.ask?.[0]?.price) };
  } catch {
    return { bid: 0, ask: 0 };
  }
}

/** Free TMN balance of the wallet (0 when unknown). */
export async function wallexWalletToman(): Promise<number> {
  try {
    const key = await apiKey();
    if (!key) return 0;
    const res = await fetch(`${BASE}/v1/account/balances`, { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return 0;
    const j: any = await res.json();
    return num(j?.result?.balances?.TMN?.value);
  } catch {
    return 0;
  }
}

/** Exchange floor for a single position (3,000,000 toman on TMN markets). */
export async function wallexMinCollateralUsdt(): Promise<number> {
  const rate = await wallexTomanRate();
  const min = num((await getSetting<number>("wallex.minCollateralToman", 3_000_000)) ?? 3_000_000);
  return rate > 0 ? min / rate : 10.9;
}

export async function wallexOpenPositions(): Promise<any[]> {
  const j = await call("GET", "/margin-trade/v1/positions").catch(() => null);
  const list = j?.result;
  if (Array.isArray(list)) return list;
  if (Array.isArray(list?.positions)) return list.positions;
  return [];
}

export async function wallexMarketsInfo(): Promise<{ symbol: string; base: string; quote: string; min: number; max: number }[]> {
  const j = await call("GET", "/margin-trade/v1/public/markets").catch(() => null);
  const rows = Array.isArray(j?.result) ? j.result : [];
  return rows.map((m: any) => ({
    symbol: String(m.symbol),
    base: String(m.base),
    quote: String(m.quote),
    min: num(m.min_risk_coef),
    max: num(m.max_risk_coef),
  }));
}

export const wallexAdapter: ExchangeAdapter = {
  name: "wallex",
  async ticker(symbol) {
    try {
      const mk = await markets();
      const m = mk.get(String(symbol).trim().toUpperCase());
      const price = num(m?.price);
      if (!(price > 0)) return null;
      return { price, change24h: num(m?.change_24h) };
    } catch {
      return null;
    }
  },
  async klines(symbol, timeframe, limit = 200) {
    const resolution = RES[timeframe] ?? "60";
    const minutes = resolution === "1D" ? 1440 : resolution === "3D" ? 4320 : Number(resolution);
    const to = Math.floor(Date.now() / 1000);
    const bars = Math.min(Math.max(limit, 60), 300);
    const from = to - minutes * 60 * bars;
    try {
      const res = await fetch(
        `${BASE}/v1/udf/history?symbol=${encodeURIComponent(String(symbol).trim().toUpperCase())}&resolution=${resolution}&from=${from}&to=${to}`,
        { signal: AbortSignal.timeout(15_000) }
      );
      if (!res.ok) return [];
      const j: any = await res.json();
      if (j?.s !== "ok" || !Array.isArray(j?.t)) return [];
      const out: Kline[] = [];
      for (let i = 0; i < j.t.length; i += 1) {
        const rawT = num(j.t[i]);
        out.push({ t: rawT < 1e12 ? rawT * 1000 : rawT, o: num(j.o?.[i]), h: num(j.h?.[i]), l: num(j.l?.[i]), c: num(j.c?.[i]), v: num(j.v?.[i]) });
      }
      return out;
    } catch {
      return [];
    }
  },
  async balance() {
    try {
      const j = await call("GET", "/v1/account/balances");
      const b = j?.result?.balances ?? {};
      const tmn = num(b?.TMN?.value);
      const usdt = num(b?.USDT?.value);
      const rate = await wallexTomanRate();
      return usdt + (rate > 0 ? tmn / rate : 0);
    } catch (e: any) {
      await logEngine("WARNING", `wallex balance failed: ${e.message}`, null, "exchange");
      return null;
    }
  },
  async availableMargin() {
    return this.balance();
  },
  async placeOrder(req) {
    const symbol = String(req.symbol).trim().toUpperCase();
    const price = num(req.price);
    if (!(price > 0) || !(num(req.qty) > 0)) return { ok: false, rejected: true, error: "wallex: invalid price or qty" };
    const rate = await wallexTomanRate();
    const quote = String((await getSetting<string>("wallex.quote", "TMN")) ?? "TMN").toUpperCase() === "USDT" ? "USDT" : "TMN";
    const market = quote === "TMN" ? symbol.replace(/USDT$/, "TMN") : symbol;
    const scale = quote === "TMN" && rate > 0 ? rate : 1;
    // A position opens with a *limit* price: it must cross the book or it rests
    // unfilled (a mid price left a real test position stuck in PENDING).
    const tmnMarket = quote === "TMN" ? symbol.replace(/USDT$/, "TMN") : symbol;
    const book = await wallexDepth(tmnMarket);
    const cross = req.side === "buy" ? book.ask * 1.002 : book.bid * 0.998;
    const unitPrice = cross > 0 ? cross : price * scale;
    // The exchange floor (3,000,000 toman) is often the whole balance, so the
    // collateral is clamped up to it but never above what the wallet holds.
    const minColl = Math.round(num((await getSetting<number>("wallex.minCollateralToman", 3_000_000)) ?? 3_000_000));
    const walletTmn = quote === "TMN" ? (await wallexWalletToman()) : 0;
    // Keep ~1% of the wallet free for the extension fee / interest, but never
    // below the exchange floor (at exactly 3M toman there is nothing to keep).
    const keep = Math.floor(walletTmn * 0.99);
    const usable = walletTmn > 0 ? (keep >= minColl ? keep : Math.floor(walletTmn)) : 0;
    // risk_coef multiplies the exposure: Wallex opens collateral x risk_coef.
    // Dividing the collateral keeps exposure == qty x price, so stored qty, PnL,
    // SL/TP and the close amount stay consistent with the exchange.
    const coef = Math.max(1, Math.min(10, Math.round(num(req.leverage, 1) * 2) / 2));
    let collateral = Math.max(Math.round((num(req.qty) * unitPrice) / coef), minColl);
    if (usable > 0) collateral = Math.min(collateral, usable);
    if (collateral < minColl) {
      return { ok: false, rejected: true, error: `wallex: free ${Math.round(walletTmn)} toman < minimum collateral ${minColl}` };
    }
    const effQty = unitPrice > 0 ? (collateral * coef) / unitPrice : num(req.qty);
    const body: Record<string, unknown> = {
      market,
      side: req.side === "buy" ? "long" : "short",
      collateral: String(collateral),
      open_price: String(Math.round(unitPrice * 100) / 100),
      risk_coef: String(coef),
    };
    if (num(req.stopLoss) > 0) body.stop_loss = String(Math.round(num(req.stopLoss) * scale * 100) / 100);
    if (num(req.takeProfit) > 0) body.take_profit = String(Math.round(num(req.takeProfit) * scale * 100) / 100);
    try {
      const j = await call("POST", "/margin-trade/v1/positions", body);
      const created = j?.result ?? {};
      const id = created.id ? String(created.id) : "";
      let filled = num(created.open_filled_price) || unitPrice;
      // The open rests as a limit order until it matches: wait for OPEN so the
      // engine never records a fill the exchange has not made.
      for (let i = 0; i < 12 && id; i += 1) {
        await new Promise((r) => setTimeout(r, 1500));
        const row = (await wallexOpenPositions()).find((x) => String(x.id) === id);
        if (!row) break;
        const state = String(row.state ?? "").toUpperCase();
        if (state === "OPEN" || state === "PARTIALLY_FILLED") {
          filled = num(row.open_filled_price) || filled;
          break;
        }
        if (state === "CANCELED" || state === "REJECTED") {
          return { ok: false, rejected: true, error: `wallex: position ${state.toLowerCase()}` };
        }
      }
      return {
        ok: true,
        orderId: id || undefined,
        filledQty: Number(effQty.toFixed(8)),
        filledPrice: scale !== 1 ? filled / scale : filled,
      };
    } catch (e: any) {
      return { ok: false, rejected: true, error: String(e.message).slice(0, 240) };
    }
  },
  async closePosition(symbol, side, qty, idempotencyKey) {
    const symbolUp = String(symbol).trim().toUpperCase();
    const tmnSymbol = symbolUp.replace(/USDT$/, "TMN");
    try {
      const list = await wallexOpenPositions();
      const pos = list
        .filter((p) => {
          const mk = String(p.market ?? "").toUpperCase();
          return mk === symbolUp || mk === tmnSymbol;
        })
        .filter((p) => String(p.side) === (side === "long" ? "long" : "short"))
        .sort((a, b) => num(b?.collateral?.value ?? b.collateral) - num(a?.collateral?.value ?? a.collateral))[0];
      if (!pos) return { ok: true, filledQty: num(qty) || undefined };
      const isTmn = String(pos.market ?? "").toUpperCase().endsWith("TMN");
      const rate = isTmn ? await wallexTomanRate() : 0;
      const mark = num(pos.mark_price) || num(pos.open_price);
      // The close is also a limit order: it must cross the book and it settles
      // asynchronously (CLOSING -> SETTLING -> gone, ~10-15s).
      const book = await wallexDepth(String(pos.market));
      const isLong = String(pos.side) === "long";
      const cross = isLong ? book.bid * 0.998 : book.ask * 1.002;
      const closePrice = cross > 0 ? cross : mark;
      const j = await call("PATCH", `/margin-trade/v1/positions/${pos.id}/close`, {
        price: String(Math.floor(closePrice * 100) / 100),
      });
      const out = j?.result ?? {};
      let filled = num(out.close_filled_price) || num(out.close_price) || closePrice;
      for (let i = 0; i < 10; i += 1) {
        await new Promise((r) => setTimeout(r, 1500));
        const row = (await wallexOpenPositions()).find((x) => String(x.id) === String(pos.id));
        if (!row) break;
        const state = String(row.state ?? "").toUpperCase();
        if (state === "CLOSED" || state === "SETTLED") {
          filled = num(row.close_filled_price) || filled;
          break;
        }
      }
      return {
        ok: true,
        orderId: pos.id ? String(pos.id) : idempotencyKey,
        filledQty: num(qty) || undefined,
        filledPrice: rate > 0 ? filled / rate : filled,
      };
    } catch (e: any) {
      return { ok: false, error: String(e.message).slice(0, 240) };
    }
  },
};

/** Symbols (BTCUSDT form) of the positions Wallex currently holds open. */
export async function wallexActiveSymbols(): Promise<string[] | null> {
  try {
    const list = await wallexOpenPositions();
    const out: string[] = [];
    for (const p of list) {
      const state = String(p?.state ?? "").toUpperCase();
      if (!["OPEN", "PARTIALLY_FILLED", "CLOSING", "SETTLING"].includes(state)) continue;
      const m = String(p?.market ?? "").toUpperCase();
      const base = m.replace(/(IRT|TMN|USDT)$/, "");
      if (base) out.push(`${base}USDT`);
    }
    return [...new Set(out)];
  } catch {
    return null;
  }
}

/** Open Wallex positions in the broker shape the engine sweeps expect.
 *  Prices and collateral are in toman, like Nobitex reports them. */
export async function wallexActivePositions(): Promise<
  { symbol: string; side: "long" | "short"; qty: number; collateral: number; mark: number; entryPrice: number; leverage: number }[] | null
> {
  try {
    const rate = await wallexTomanRate();
    const list = await wallexOpenPositions();
    let markets: any[] = [];
    try {
      const res = await fetch(`${BASE}/hector/web/v1/markets`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) markets = ((await res.json()) as any)?.result?.markets ?? [];
    } catch {
      markets = [];
    }
    const out: { symbol: string; side: "long" | "short"; qty: number; collateral: number; mark: number; entryPrice: number; leverage: number }[] = [];
    for (const p of list) {
      const state = String(p?.state ?? "").toUpperCase();
      if (!["OPEN", "PARTIALLY_FILLED"].includes(state)) continue;
      const market = String(p?.market ?? "").toUpperCase();
      const base = market.replace(/(IRT|TMN|USDT)$/, "");
      if (!base) continue;
      const usdtQuoted = market.endsWith("USDT");
      const k = usdtQuoted ? rate : 1;
      const entryPrice = (num(p?.open_filled_price) || num(p?.open_price)) * k;
      const mark = num(markets.find((x) => String(x?.symbol).toUpperCase() === market)?.price) * k || entryPrice;
      const collateral = num(p?.collateral?.value) * k;
      // Wallex exposure equals the collateral (a short borrows the coin, a long
      // borrows toman, but profit is measured on the collateral — verified on a
      // real short: -7.3% for a -7.37% move). Adding the loan doubled qty.
      const coef = Math.max(1, Math.min(10, num(p?.risk_coef) || num(p?.riskCoef) || 1));
      const notional = num(p?.collateral?.value) * k * coef;
      const qty = entryPrice > 0 ? notional / entryPrice : 0;
      if (!(entryPrice > 0) || !(qty > 0)) continue;
      out.push({ symbol: `${base}USDT`, side: String(p?.side) === "short" ? "short" : "long", qty, collateral, mark, entryPrice, leverage: 1 });
    }
    return out;
  } catch {
    return null;
  }
}

/** Real exit for a symbol that vanished from the open list.
 *  Wallex has no closed-position feed (status=closed returns the live list), so
 *  the authoritative exit is the FINISHED order on the opposite side of the
 *  position — wilder than the last ticker and includes the real fill. */
export async function wallexLastClosed(
  symbol: string,
  openedAtMs: number,
  side?: string
): Promise<{ closePrice: number } | null> {
  try {
    const base = String(symbol).toUpperCase().replace(/USDT$/, "");
    const wantSide = String(side ?? "").toLowerCase() === "long" ? "sell" : "buy";
    const j = await call("GET", "/margin-trade/v1/orders?status=FINISHED");
    const rows: any[] = Array.isArray(j?.result) ? j.result : [];
    const rate = await wallexTomanRate();
    const pick = rows
      .filter((r) => String(r?.market ?? "").toUpperCase().replace(/(IRT|TMN|USDT)$/, "") === base)
      .filter((r) => String(r?.side ?? "").toLowerCase() === wantSide)
      .map((r) => ({ r, at: Date.parse(String(r?.updated_at ?? r?.created_at ?? "")) || 0 }))
      .filter((x) => x.at > openedAtMs + 5_000)
      .sort((a, b) => b.at - a.at)[0];
    if (!pick) return null;
    const usdtQuoted = String(pick.r?.market ?? "").toUpperCase().endsWith("USDT");
    const price = num(pick.r?.filled_price?.value) || num(pick.r?.price?.value);
    const k = usdtQuoted ? 1 : 1 / rate;
    const closePrice = price * k;
    return closePrice > 0 ? { closePrice } : null;
  } catch {
    return null;
  }
}
