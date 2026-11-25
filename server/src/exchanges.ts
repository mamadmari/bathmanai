// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — Exchange adapters
// Plugin-based: every provider implements the same interface
//   { ticker, klines, balance, placeOrder, closePosition }
// Market data works WITHOUT keys (public REST). Orders need keys, which are
// stored encrypted (exchange_accounts) and only used server-side.
// PAPER adapter is the default until the admin activates LIVE mode.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import { pool, many, logEngine } from "./db.js";
import { decryptSecret, now, num } from "./util.js";
import { getSetting } from "./settings.js";
import { wallexAdapter } from "./wallex.js";

export interface Kline {
  t: number; // open ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface OrderRequest {
  symbol: string;
  side: "buy" | "sell"; // buy = long/entry, sell = short/entry (or exit)
  qty: number;
  price?: number;
  leverage?: number;
  idempotencyKey: string;
  /** Optional protective levels. Wallex margin stores them on the exchange side,
   *  which is strictly better than a client-side guard. */
  stopLoss?: number;
  takeProfit?: number;
}

export interface OrderResult {
  ok: boolean;
  orderId?: string;
  filledPrice?: number;
  filledQty?: number;
  error?: string;
  /** True when the exchange gave a definitive rejection: no order exists, so
   *  the caller must not treat it as an unknown transport outcome. */
  rejected?: boolean;
}

export interface ExchangeAdapter {
  name: string;
  ticker(symbol: string): Promise<{ price: number; change24h: number } | null>;
  klines(symbol: string, timeframe: string, limit?: number): Promise<Kline[]>;
  balance(accountId?: string): Promise<number | null>; // USDT-equivalent available
  availableMargin?(accountId?: string): Promise<number | null>;
  placeOrder(req: OrderRequest): Promise<OrderResult>;
  closePosition(symbol: string, side: "long" | "short", qty: number, idempotencyKey?: string): Promise<OrderResult>;
}

// ── HTTP helper ──────────────────────────────────────────────────────────────
async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return res.json();
}

const TF: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "4h": "4h", "1d": "1d",
};

// ── Adapters ─────────────────────────────────────────────────────────────────
const binance: ExchangeAdapter = {
  name: "binance",
  async availableMargin(accountId) {
    return this.balance(accountId);
  },
  async ticker(symbol) {
    const j = await getJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
    return { price: num(j.lastPrice), change24h: num(j.priceChangePercent) };
  },
  async klines(symbol, timeframe, limit = 200) {
    const j = await getJson(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${TF[timeframe] ?? "15m"}&limit=${limit}`
    );
    return (j as any[]).map((k) => ({
      t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]),
    }));
  },
  async balance(accountId?: string) {
    const acc = await account("binance", accountId);
    if (!acc) return null;
    const q = new URLSearchParams({ timestamp: String(Date.now()) }).toString();
    const sig = crypto.createHmac("sha256", acc.secret).update(q).digest("hex");
    const j = await getJson(
      `https://api.binance.com/api/v3/account?${q}&signature=${sig}`,
      { "X-MBX-APIKEY": acc.key }
    );
    const usdt = (j.balances as any[]).find((b: any) => b.asset === "USDT");
    const available = usdt ? Number(usdt.free) : NaN;
    return Number.isFinite(available) && available >= 0 ? available : null;
  },
  async placeOrder(req) {
    const acc = await account("binance");
    if (!acc) return { ok: false, error: "بیننس پیکربندی نشده است." };
    const q = new URLSearchParams({
      symbol: req.symbol,
      side: req.side === "buy" ? "BUY" : "SELL",
      type: "MARKET",
      quantity: String(req.qty),
      newOrderRespType: "FULL",
      timestamp: String(Date.now()),
      newClientOrderId: req.idempotencyKey.slice(0, 36),
    }).toString();
    const sig = crypto.createHmac("sha256", acc.secret).update(q).digest("hex");
    const response = await fetch(`https://api.binance.com/api/v3/order?${q}&signature=${sig}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": acc.key },
      signal: AbortSignal.timeout(12_000),
    });
    const j: any = await response.json();
    if (!response.ok || j?.code) return { ok: false, error: j?.msg ?? `Binance order HTTP ${response.status}` };
    const filledQty = num(j.executedQty);
    const filledPrice = num(j.cummulativeQuoteQty) / filledQty;
    if (!j.orderId || j.status !== "FILLED" || !(filledQty > 0) || !(filledPrice > 0)) {
      return { ok: false, orderId: j.orderId ? String(j.orderId) : undefined,
        filledQty: filledQty > 0 ? filledQty : undefined, filledPrice: filledPrice > 0 ? filledPrice : undefined,
        error: "Binance order fill is unverified; reconcile order before another trade" };
    }
    return {
      ok: true,
      orderId: String(j.orderId),
      filledPrice,
      filledQty,
    };
  },
  async closePosition(symbol, side, qty, idempotencyKey) {
    return this.placeOrder({ symbol, side: side === "long" ? "sell" : "buy", qty, idempotencyKey: idempotencyKey ?? `close-${now()}-${symbol}` });
  },
};

const bybit: ExchangeAdapter = {
  name: "bybit",
  async ticker(symbol) {
    const j = await getJson(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`
    );
    const t = j?.result?.list?.[0];
    return t ? { price: num(t.lastPrice), change24h: num(t.price24hPcnt) * 100 } : null;
  },
  async klines(symbol, timeframe, limit = 200) {
    const j = await getJson(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${TF[timeframe] ?? "15"}&limit=${limit}`
    );
    return (j?.result?.list ?? []).map((k: any) => ({
      t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]),
    }));
  },
  async balance(accountId?: string) {
    const acc = await account("bybit", accountId);
    if (!acc) return null;
    const ts = Date.now();
    const q = `accountType=UNIFIED&api_key=${acc.key}&timestamp=${ts}&recv_window=5000`;
    const sig = crypto.createHmac("sha256", acc.secret).update(q).digest("hex");
    const j = await getJson(`https://api.bybit.com/v5/account/wallet-balance?${q}&sign=${sig}`);
    const coin = j?.result?.list?.[0]?.coin?.find((c: any) => c.coin === "USDT");
    return coin ? num(coin.walletBalance) : null;
  },
  async placeOrder(req) {
    const acc = await account("bybit");
    if (!acc) return { ok: false, error: "بای‌بیت پیکربندی نشده است." };
    const ts = Date.now();
    const body = {
      category: "linear",
      symbol: req.symbol,
      side: req.side === "buy" ? "Buy" : "Sell",
      orderType: "Market",
      qty: String(req.qty),
      orderLinkId: req.idempotencyKey.slice(0, 36),
    };
    const q = `api_key=${acc.key}&recv_window=5000&timestamp=${ts}`;
    const sig = crypto.createHmac("sha256", acc.secret)
      .update(q + JSON.stringify(body))
      .digest("hex");
    const j = await postJson(
      `https://api.bybit.com/v5/order/create?${q}&sign=${sig}`,
      body
    );
    if (j?.retCode !== 0) return { ok: false, error: j?.retMsg ?? "خطای بای‌بیت" };
    return { ok: true, orderId: j?.result?.orderId };
  },
  async closePosition(symbol, side, qty, idempotencyKey) {
    return this.placeOrder({ symbol, side: side === "long" ? "sell" : "buy", qty, idempotencyKey: idempotencyKey ?? `close-${now()}-${symbol}` });
  },
};

const okx: ExchangeAdapter = {
  name: "okx",
  async ticker(symbol) {
    const inst = toOkx(symbol);
    const j = await getJson(`https://www.okx.com/api/v5/market/ticker?instId=${inst}`);
    const t = j?.data?.[0];
    return t ? { price: num(t.last), change24h: num(t.open24h) ? ((num(t.last) - num(t.open24h)) / num(t.open24h)) * 100 : 0 } : null;
  },
  async klines(symbol, timeframe, limit = 200) {
    const inst = toOkx(symbol);
    const bar = (TF[timeframe] ?? "15m").replace("m", "m");
    const j = await getJson(
      `https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=${bar}&limit=${limit}`
    );
    return (j?.data ?? []).map((k: any) => ({
      t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]),
    }));
  },
  async balance(accountId?: string) {
    const acc = await account("okx", accountId);
    if (!acc) return null;
    const ts = new Date().toISOString();
    const path = "/api/v5/account/balance";
    const sign = crypto.createHmac("sha256", acc.secret).update(ts + "GET" + path + "").digest("base64");
    const j = await getJson(`https://www.okx.com${path}`, {
      "OK-ACCESS-KEY": acc.key,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": acc.passphrase ?? "",
    });
    const d = j?.data?.[0];
    if (!d) return null;
    const usdt = d.details?.find((x: any) => x.ccy === "USDT");
    return usdt ? num(usdt.availBal) + num(usdt.frozenBal) : null;
  },
  async placeOrder(req) {
    const acc = await account("okx");
    if (!acc) return { ok: false, error: "OKX پیکربندی نشده است." };
    const inst = toOkx(req.symbol);
    const body = JSON.stringify({
      instId: inst,
      tdMode: "cross",
      side: req.side === "buy" ? "buy" : "sell",
      ordType: "market",
      sz: String(req.qty),
    });
    const path = "/api/v5/trade/order";
    const ts = new Date().toISOString();
    const sign = crypto.createHmac("sha256", acc.secret).update(ts + "POST" + path + body).digest("base64");
    const j = await postJson(`https://www.okx.com${path}`, body, {
      "OK-ACCESS-KEY": acc.key,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": acc.passphrase ?? "",
      "content-type": "application/json",
    });
    if (j?.code !== "0") return { ok: false, error: j?.msg ?? "خطای OKX" };
    return { ok: true, orderId: j?.data?.[0]?.ordId };
  },
  async closePosition(symbol, side, qty, idempotencyKey) {
    return this.placeOrder({ symbol, side: side === "long" ? "sell" : "buy", qty, idempotencyKey: `close-${now()}-${symbol}` });
  },
};

const bingx: ExchangeAdapter = {
  name: "bingx",
  async ticker(symbol) {
    const j = await getJson(
      `https://open-api.bingx.com/openApi/spot/v1/market/ticker?symbol=${symbol}`
    );
    const t = j?.data;
    return t ? { price: num(t.lastPrice), change24h: num(t.priceChangePercent) } : null;
  },
  async klines(symbol, timeframe, limit = 200) {
    const j = await getJson(
      `https://open-api.bingx.com/openApi/spot/v1/market/kline?symbol=${symbol}&interval=${TF[timeframe] ?? "15m"}&limit=${limit}`
    );
    return (j?.data ?? []).map((k: any[]) => ({
      t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]),
    }));
  },
  async balance(accountId?: string) {
    const acc = await account("bingx", accountId);
    if (!acc) return null;
    const q = new URLSearchParams({ timestamp: String(Date.now()) }).toString();
    const sig = crypto.createHmac("sha256", acc.secret).update(q).digest("hex");
    const j = await getJson(
      `https://open-api.bingx.com/openApi/spot/v1/account/balance?${q}&signature=${sig}`,
      { "X-BX-APIKEY": acc.key }
    );
    const usdt = j?.data?.balances?.find((b: any) => b.asset === "USDT");
    return usdt ? num(usdt.free) + num(usdt.locked) : null;
  },
  async placeOrder(req) {
    const acc = await account("bingx");
    if (!acc) return { ok: false, error: "BingX پیکربندی نشده است." };
    const q = new URLSearchParams({
      symbol: req.symbol,
      side: req.side === "buy" ? "BUY" : "SELL",
      type: "MARKET",
      quantity: String(req.qty),
      timestamp: String(Date.now()),
      newClientOrderId: req.idempotencyKey.slice(0, 36),
    }).toString();
    const sig = crypto.createHmac("sha256", acc.secret).update(q).digest("hex");
    const j = await getJson(
      `https://open-api.bingx.com/openApi/spot/v1/trade/order?${q}&signature=${sig}`,
      { "X-BX-APIKEY": acc.key }
    );
    if (j?.code !== 0) return { ok: false, error: j?.msg ?? "خطای BingX" };
    return { ok: true, orderId: j?.data?.orderId };
  },
  async closePosition(symbol, side, qty) {
    return this.placeOrder({ symbol, side: side === "long" ? "sell" : "buy", qty, idempotencyKey: `close-${now()}-${symbol}` });
  },
};

// Market-data-only adapters (public REST, no keys needed).
function makePublicAdapter(name: string, tickerFn: (s: string) => Promise<{ price: number; change24h: number } | null>, klineFn: (s: string, tf: string, limit: number) => Promise<Kline[]>): ExchangeAdapter {
  return {
    name,
    ticker: tickerFn,
    klines: klineFn,
    async balance(accountId?: string) {
      const acc = await account(name, accountId);
      return acc ? null : null;
    },
    async placeOrder() {
      return { ok: false, error: `اجرای واقعی روی ${name} هنوز از پنل مدیریت فعال نشده است.` };
    },
    async closePosition() {
      return { ok: false, error: `اجرای واقعی روی ${name} هنوز از پنل مدیریت فعال نشده است.` };
    },
  };
}

const mexc = makePublicAdapter(
  "mexc",
  async (s) => {
    const j = await getJson(`https://api.mexc.com/api/v3/ticker/24hr?symbol=${s}`);
    return { price: num(j.lastPrice), change24h: num(j.priceChangePercent) };
  },
  async (s, tf, limit) => {
    const j = await getJson(`https://api.mexc.com/api/v3/klines?symbol=${s}&interval=${TF[tf] ?? "15m"}&limit=${limit}`);
    return (j as any[]).map((k) => ({ t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]) }));
  }
);

const gate = makePublicAdapter(
  "gate",
  async (s) => {
    const j = await getJson(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${s.replace("USDT", "_USDT")}`);
    const t = j?.[0];
    return t ? { price: num(t.last), change24h: num(t.change_percentage) } : null;
  },
  async (s, tf, limit) => {
    const j = await getJson(
      `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${s.replace("USDT", "_USDT")}&interval=${TF[tf] ?? "15m"}&limit=${limit}`
    );
    return (j as any[]).map((k) => ({ t: num(k[0]) * 1000, o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]) }));
  }
);

const kucoin = makePublicAdapter(
  "kucoin",
  async (s) => {
    const j = await getJson(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${s.replace("USDT", "-USDT")}`);
    return { price: num(j?.data?.price), change24h: 0 };
  },
  async (s, tf, limit) => {
    const j = await getJson(
      `https://api.kucoin.com/api/v1/market/candles?type=${TF[tf] ?? "15min"}&symbol=${s.replace("USDT", "-USDT")}`
    );
    return ((j?.data ?? []) as any[]).slice(0, limit).map((k) => ({
      t: num(k[0]) * 1000, o: num(k[1]), c: num(k[2]), h: num(k[3]), l: num(k[4]), v: num(k[5]),
    }));
  }
);

const lbank = makePublicAdapter(
  "lbank",
  async (s) => {
    const j = await getJson(`https://api.lbank.info/api/v2/ticker?symbol=${s.toLowerCase()}_usdt`);
    const t = j?.data?.[0];
    return t ? { price: num(t.ticker?.latest), change24h: 0 } : null;
  },
  async (s, tf, limit) => {
    const j = await getJson(
      `https://api.lbank.info/api/v2/kline?symbol=${s.toLowerCase()}_usdt&type=minute${TF[tf] ?? "15"}&size=${limit}`
    );
    return ((j?.data ?? []) as any[]).map((k) => ({
      t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]),
    }));
  }
);

const bitget = makePublicAdapter(
  "bitget",
  async (s) => {
    const j = await getJson(`https://api.bitget.com/api/v2/spot/market/tickers?symbol=${s}`);
    const t = j?.data?.[0];
    return t ? { price: num(t.lastPr), change24h: num(t.change24h) } : null;
  },
  async (s, tf, limit) => {
    const j = await getJson(
      `https://api.bitget.com/api/v2/spot/market/candles?symbol=${s}&granularity=${TF[tf] ?? "15m"}&limit=${limit}`
    );
    return ((j?.data ?? []) as any[]).map((k) => ({
      t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]),
    }));
  }
);

const coinex = makePublicAdapter(
  "coinex",
  async (s) => {
    const j = await getJson(`https://api.coinex.com/v1/market/ticker?market=${s}`);
    return { price: num(j?.data?.ticker?.last), change24h: 0 };
  },
  async (s, tf, limit) => {
    const j = await getJson(`https://api.coinex.com/v1/market/kline?market=${s}&type=${TF[tf] ?? "15min"}&limit=${limit}`);
    return ((j?.data ?? []) as any[]).map((k) => ({
      t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]),
    }));
  }
);

// ── Forex / Metals Helpers ──────────────────────────────────────────────────
const KRAKEN_PAIRS: Record<string, string> = {
  EURUSD: "ZEURZUSD",
  GBPUSD: "ZGBPZUSD",
  USDJPY: "ZUSDZJPY",
  AUDUSD: "ZAUDZUSD",
  USDCAD: "ZUSDZCAD",
  USDCHF: "ZUSDZCHF",
  NZDUSD: "ZNZDZUSD",
  EURGBP: "ZEURZGBP",
  EURJPY: "ZEURZJPY",
  GBPJPY: "ZGBPZJPY",
  EURCHF: "ZEURZCHF",
  GBPCHF: "ZGBPZCHF",
  GBPAUD: "ZGBPZAUD",
  GBPCAD: "ZGBPZCAD",
  GBPNZD: "ZGBPZNZD",
  EURAUD: "ZEURZAUD",
  EURCAD: "ZEURZCAD",
  EURNZD: "ZEURZNZD",
  AUDJPY: "ZAUDZJPY",
  CADJPY: "ZCADZJPY",
  CHFJPY: "ZCHFZJPY",
};

const FOREX_DEFAULTS: Record<string, number> = {
  XAUUSD: 3245.0,
  XAGUSD: 38.2,
  EURUSD: 1.085,
  GBPUSD: 1.272,
  USDJPY: 154.8,
  AUDUSD: 0.652,
  USDCAD: 1.372,
  USDCHF: 0.892,
  NZDUSD: 0.595,
  USDTRY: 38.65,
  EURJPY: 168.2,
  GBPJPY: 196.8,
  EURGBP: 0.852,
  AUDJPY: 100.9,
  USDZAR: 17.95,
  EURCHF: 0.968,
  GBPCHF: 1.135,
  EURAUD: 1.665,
  EURCAD: 1.488,
  USDCNH: 7.22,
};

export function isForexSymbol(symbol: string): boolean {
  return symbol in FOREX_DEFAULTS || symbol.startsWith("XAU") || symbol.startsWith("XAG") || !symbol.endsWith("USDT");
}

function mt5ContractSize(symbol: string): number {
  if (symbol.startsWith("XAU")) return 100;
  if (symbol.startsWith("XAG")) return 5_000;
  return 100_000;
}

async function fetchForexKrakenKlines(symbol: string, tf: string): Promise<Kline[]> {
  const map: Record<string, number> = { "1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1d": 1440 };
  const interval = map[tf] ?? 15;
  const pair = KRAKEN_PAIRS[symbol];
  if (!pair) return [];
  try {
    const j = await getJson(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}`);
    if (j?.error?.length || !j?.result) return [];
    const key = Object.keys(j.result).find((k) => k !== "last");
    const rows: any[] = key ? (j.result[key] ?? []) : [];
    return rows.map((r: any) => ({
      t: num(r[0]) * 1000,
      o: num(r[1]),
      h: num(r[2]),
      l: num(r[3]),
      c: num(r[4]),
      v: num(r[6] ?? 0),
    })).filter((c) => c.o > 0 && c.c > 0);
  } catch {
    return [];
  }
}

async function fetchYahooKlines(symbol: string, tf: string): Promise<Kline[]> {
  const intervalMap: Record<string, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "4h": "1h", "1d": "1d" };
  const rangeMap: Record<string, string> = { "1m": "1d", "5m": "5d", "15m": "5d", "30m": "1mo", "1h": "1mo", "4h": "3mo", "1d": "1y" };
  const s = symbol === "XAUUSD" ? "GC=F" : symbol === "XAGUSD" ? "SI=F" : `${symbol}=X`;
  try {
    const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=${intervalMap[tf] ?? "15m"}&range=${rangeMap[tf] ?? "5d"}`);
    const result = j?.chart?.result?.[0];
    const ts = result?.timestamp as number[] | undefined;
    const quote = result?.indicators?.quote?.[0];
    if (!ts || !quote || !Array.isArray(ts)) return [];
    const out: Kline[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = num(quote.open?.[i]);
      const h = num(quote.high?.[i]);
      const l = num(quote.low?.[i]);
      const c = num(quote.close?.[i]);
      if (o > 0 && c > 0 && h > 0 && l > 0) {
        out.push({ t: ts[i] * 1000, o, h, l, c, v: num(quote.volume?.[i] ?? 0) });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function mt5BridgeConfig(): { url: string; key?: string } | null {
  const configured = process.env.MT5_BRIDGE_URL;
  if (configured?.startsWith("http")) return { url: configured.replace(/\/$/, "") };
  return null;
}

export async function fetchMt5BridgeKlines(symbol: string, timeframe: string): Promise<Kline[]> {
  const configured = mt5BridgeConfig();
  const acc = await account("mt5");
  const url = configured?.url || (acc?.secret?.startsWith("http") ? acc.secret.replace(/\/$/, "") : "");
  if (!url) return [];
  try {
    const j = await getJson(`${url}/klines?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`, {
      ...(acc?.key ? { Authorization: `Bearer ${acc.key}` } : {}),
    });
    const rows: any[] = Array.isArray(j) ? j : (j?.data ?? j?.klines ?? j?.candles ?? []);
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => {
      const rawT = num(r?.t ?? r?.time ?? r?.timestamp ?? r?.[0]);
      return {
        t: rawT > 0 && rawT < 10_000_000_000 ? rawT * 1000 : rawT,
        o: num(r?.o ?? r?.open ?? r?.[1]),
        h: num(r?.h ?? r?.high ?? r?.[2]),
        l: num(r?.l ?? r?.low ?? r?.[3]),
        c: num(r?.c ?? r?.close ?? r?.[4]),
        v: num(r?.v ?? r?.volume ?? r?.[5] ?? 0),
      } as Kline;
    }).filter((k) => k.t > 0 && k.o > 0 && k.h > 0 && k.l > 0 && k.c > 0)
      .sort((a, b) => a.t - b.t);
  } catch {
    return [];
  }
}

export async function fetchMt5BridgeTicker(symbol: string): Promise<{ price: number; change24h: number } | null> {
  const configured = mt5BridgeConfig();
  const acc = await account("mt5");
  const url = configured?.url || (acc?.secret?.startsWith("http") ? acc.secret.replace(/\/$/, "") : "");
  if (!url) return null;
  try {
    const j = await getJson(`${url}/ticker?symbol=${encodeURIComponent(symbol)}`, {
      ...(acc?.key ? { Authorization: `Bearer ${acc.key}` } : {}),
    });
    const data = j?.data ?? j;
    const price = num(data?.price ?? data?.last ?? data?.bid ?? data?.ask);
    if (!(price > 0)) return null;
    return { price, change24h: num(data?.change24h ?? data?.changePercent ?? 0) };
  } catch {
    return null;
  }
}

// MT5 adapter with bridge support (REST API to Python/EA MT5 bridge) and robust execution
const mt5: ExchangeAdapter = {
  name: "mt5",
  async availableMargin(accountId) {
    const acc = await account("mt5", accountId);
    const bridgeUrl = process.env.MT5_BRIDGE_URL || acc?.secret;
    if (!bridgeUrl?.startsWith("http")) return null;
    const response = await getJson(`${bridgeUrl.replace(/\/$/, "")}/balance`, {
      ...(acc?.key ? { Authorization: `Bearer ${acc.key}` } : {}),
    });
    const raw = response?.free_margin ?? response?.margin_free;
    if (raw === undefined || raw === null || raw === "") return null;
    const available = Number(raw);
    return Number.isFinite(available) && available >= 0 ? available : null;
  },
  async ticker(symbol: string) {
    const acc = await account("mt5");
    const bridgeUrl = process.env.MT5_BRIDGE_URL || acc?.secret;
    if (bridgeUrl && bridgeUrl.startsWith("http")) {
      try {
        const j = await getJson(`${bridgeUrl.replace(/\/$/, "")}/ticker?symbol=${encodeURIComponent(symbol)}`, {
          ...(acc?.key ? { Authorization: `Bearer ${acc.key}` } : {}),
        });
        if (j?.price && j.price > 0) return { price: num(j.price), change24h: num(j.change24h ?? 0) };
      } catch {}
    }
    return fetchForexTicker(symbol);
  },
  async klines(symbol: string, timeframe: string) {
    const acc = await account("mt5");
    const bridgeUrl = process.env.MT5_BRIDGE_URL || acc?.secret;
    if (bridgeUrl && bridgeUrl.startsWith("http")) {
      try {
        const j = await getJson(`${bridgeUrl.replace(/\/$/, "")}/klines?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`, {
          ...(acc?.key ? { Authorization: `Bearer ${acc.key}` } : {}),
        });
        if (Array.isArray(j) && j.length >= 10) return j;
        if (Array.isArray(j?.data) && j.data.length >= 10) return j.data;
      } catch {}
    }
    return fetchForexKlines(symbol, timeframe);
  },
  async balance(accountId?: string) {
    const acc = await account("mt5", accountId);
    const bridgeUrl = process.env.MT5_BRIDGE_URL || acc?.secret;
    if (bridgeUrl && bridgeUrl.startsWith("http")) {
      try {
        const j = await getJson(`${bridgeUrl.replace(/\/$/, "")}/balance`, {
          ...(acc?.key ? { Authorization: `Bearer ${acc.key}` } : {}),
        });
        if (j?.balance !== undefined) return num(j.balance);
      } catch {}
    }
    return null; // Never invent a broker balance when the bridge is unavailable.
  },
  async placeOrder(req) {
    const acc = await account("mt5");
    const bridgeUrl = process.env.MT5_BRIDGE_URL || acc?.secret;
    if (bridgeUrl && bridgeUrl.startsWith("http")) {
      try {
        const res = await fetch(`${bridgeUrl.replace(/\/$/, "")}/order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(acc?.key ? { Authorization: `Bearer ${acc.key}` } : {}),
          },
          body: JSON.stringify({
            symbol: req.symbol,
            type: req.side === "buy" ? "BUY" : "SELL",
            // The engine stores base-asset quantity. MT5 bridges normally
            // expect lots, so convert at the adapter boundary.
            volume: req.qty / mt5ContractSize(req.symbol),
            price: req.price,
            leverage: req.leverage,
            comment: `WolfAI-${req.idempotencyKey}`,
          }),
          signal: AbortSignal.timeout(12000),
        });
        const j: any = await res.json();
        // A transport-level "ok" is not evidence of a broker fill.
        if (res.ok && j?.ok === true && (j.ticket || j.orderId) &&
            Number(j.price ?? j.filledPrice) > 0 && Number(j.filledQty ?? j.volume) > 0) {
          return {
            ok: true,
            orderId: String(j.ticket ?? j.orderId),
            filledPrice: num(j.price ?? j.filledPrice),
            filledQty: j.filledQty !== undefined
              ? num(j.filledQty)
              : num(j.volume) * mt5ContractSize(req.symbol),
          };
        }
        return { ok: false, error: j?.error || "MT5 bridge did not confirm a filled broker order" };
      } catch (e: any) {
        return { ok: false, error: `MT5 bridge unreachable: ${e.message}` };
      }
    }
    return { ok: false, error: "MT5 bridge is not configured; live forex order was not sent" };
  },
  async closePosition(symbol, side, qty, idempotencyKey) {
    const acc = await account("mt5");
    const bridgeUrl = process.env.MT5_BRIDGE_URL || acc?.secret;
    if (bridgeUrl && bridgeUrl.startsWith("http")) {
      try {
        const res = await fetch(`${bridgeUrl.replace(/\/$/, "")}/close`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(acc?.key ? { Authorization: `Bearer ${acc.key}` } : {}),
          },
          body: JSON.stringify({ symbol, side: side === "long" ? "SELL" : "BUY", volume: qty / mt5ContractSize(symbol), comment: idempotencyKey }),
          signal: AbortSignal.timeout(12000),
        });
        const j: any = await res.json();
        if (res.ok && j?.ok === true && (j.ticket || j.orderId) && Number(j.price ?? j.filledPrice) > 0 && Number(j.filledQty ?? j.volume) > 0) {
          return {
            ok: true,
            orderId: String(j.ticket ?? j.orderId),
            filledPrice: num(j.price ?? j.filledPrice),
            filledQty: j.filledQty !== undefined ? num(j.filledQty) : num(j.volume) * mt5ContractSize(symbol),
          };
        }
        return { ok: false, error: j?.error || "MT5 bridge did not confirm a broker close" };
      } catch (e: any) {
        return { ok: false, error: `MT5 bridge close error: ${e.message}` };
      }
    }
    return { ok: false, error: "MT5 bridge is not configured; live forex position was not closed" };
  },
};

// ── Nobitex (Iranian spot exchange) ──────────────────────────────────────────
// apiv2 requires Ed25519 request signing: sign `timestamp + METHOD + path +
// rawBody` with the private key and send Nobitex-Key / Nobitex-Signature /
// Nobitex-Timestamp. Market data (orderbook / stats / ohlc) is public.
// NOTE: `api.nobitex.ir` no longer resolves — the live host is apiv2.nobitex.ir.
const NOBITEX_BASE = "https://apiv2.nobitex.ir";
const NOBITEX_UA = "TradingWolf/1.0";
const NOBITEX_RES: Record<string, string> = {
  "1m": "1", "5m": "5", "15m": "15", "30m": "30", "1h": "60", "4h": "240", "1d": "D",
};
const NOBITEX_PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");

function nobitexSigner(secretB64: string) {
  const seed = Buffer.from(String(secretB64).trim(), "base64");
  if (seed.length !== 32) throw new Error("nobitex_private_key_invalid");
  return crypto.createPrivateKey({
    key: Buffer.concat([NOBITEX_PKCS8, seed]),
    format: "der",
    type: "pkcs8",
  });
}

export async function nobitexCall(method: "GET" | "POST", path: string, body?: unknown) {
  const acc = await account("nobitex");
  if (!acc) throw new Error("nobitex_keys_missing");
  const ts = String(Math.floor(Date.now() / 1000));
  const raw = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  const signature = crypto
    .sign(null, Buffer.concat([Buffer.from(`${ts}${method}${path}`), raw]), nobitexSigner(acc.secret))
    .toString("base64");
  const res = await fetch(NOBITEX_BASE + path, {
    method,
    headers: {
      "User-Agent": NOBITEX_UA,
      "Nobitex-Key": acc.key.trim(),
      "Nobitex-Signature": signature,
      "Nobitex-Timestamp": ts,
      ...(raw.length ? { "content-type": "application/json" } : {}),
    },
    body: raw.length ? raw : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || json?.status === "failed") {
    console.error("nobitex raw response", path, JSON.stringify(json).slice(0, 500));
    const detail = json?.detail ?? json?.error ?? json?.message ?? json?.code ?? JSON.stringify(json ?? {}).slice(0, 300);
    throw new Error(`nobitex ${path}: ${detail} (HTTP ${res.status})`);
  }
  return json;
}

/** Toman per 1 USDT, derived from BTCIRT / BTCUSDT (cached 60s). */
let nobitexUsdRate = { at: 0, value: 0 };
async function nobitexTomanPerUsdt(): Promise<number> {
  if (Date.now() - nobitexUsdRate.at < 60_000 && nobitexUsdRate.value > 0) return nobitexUsdRate.value;
  const [irt, usdt] = await Promise.all([
    getJson(`${NOBITEX_BASE}/v3/orderbook/BTCIRT`, { "User-Agent": NOBITEX_UA }),
    getJson(`${NOBITEX_BASE}/v3/orderbook/BTCUSDT`, { "User-Agent": NOBITEX_UA }),
  ]);
  const a = num(irt?.lastTradePrice);
  const b = num(usdt?.lastTradePrice);
  const value = a > 0 && b > 0 ? a / b : 0;
  nobitexUsdRate = { at: Date.now(), value };
  return value;
}

type NobitexQuote = { quote: "usdt" | "rls" | "margin"; rate: number };

/** Spot + margin (تعهدی) wallet totals in native units — rial is not converted. */
type NobitexWallets = { usdt: number; rial: number; marginUsdt: number; marginRial: number };
let nobitexWalletsCache: { at: number; value: NobitexWallets } | null = null;
async function nobitexWalletTotals(force = false): Promise<NobitexWallets> {
  if (!force && nobitexWalletsCache && Date.now() - nobitexWalletsCache.at < 15_000) return nobitexWalletsCache.value;
  const free = (rows: any[], cur: string) =>
    rows
      .filter((w) => String(w.currency ?? "").toUpperCase() === cur)
      .reduce((a, w) => a + Math.max(0, num(w.balance) - num(w.blockedBalance ?? w.blocked)), 0);
  const rialOf = (rows: any[]) => ["IRT", "RLS", "TOMAN"].reduce((a, c) => a + free(rows, c), 0);
  let spot: any[] = [];
  let margin: any[] = [];
  try {
    spot = (await nobitexCall("GET", "/users/wallets/list"))?.wallets ?? [];
  } catch {
    /* keep the previous reading */
  }
  try {
    margin = (await nobitexCall("POST", "/users/wallets/list", { type: "margin" }))?.wallets ?? [];
  } catch {
    /* margin wallet is optional */
  }
  const value: NobitexWallets = {
    usdt: free(spot, "USDT") + free(margin, "USDT"),
    rial: rialOf(spot) + rialOf(margin),
    marginUsdt: free(margin, "USDT"),
    marginRial: rialOf(margin),
  };
  nobitexWalletsCache = { at: Date.now(), value };
  return value;
}
let nobitexQuoteCache: { at: number; value: NobitexQuote } | null = null;

/** Decide which quote market an order goes to.
 *  `market.nobitexQuote` = "usdt" | "rls" forces a market, "auto" (default)
 *  picks the rial markets while the wallet holds toman and the USDT pairs once
 *  the owner keeps tether. The tether-toman market is closed nightly by the
 *  central bank while every `<coin>-rls` market trades 24/7, so a
 *  toman-funded account must execute in rial markets to stay always-on.
 *  `rate` = toman per 1 USDT, used to translate USDT prices into rial prices. */
async function nobitexQuoteInfo(force = false): Promise<NobitexQuote> {
  if (!force && nobitexQuoteCache && Date.now() - nobitexQuoteCache.at < 30_000) return nobitexQuoteCache.value;
  const override = String(
    (await getSetting<string>("market.nobitexQuote", "auto").catch(() => "auto")) ?? "auto"
  ).toLowerCase();
  const rate = (await nobitexTomanPerUsdt().catch(() => 0)) || 0;
  const totals = await nobitexWalletTotals().catch(() => ({ usdt: 0, rial: 0, marginUsdt: 0, marginRial: 0 }));
  const marginFunded = totals.marginRial > 0 || totals.marginUsdt > 0;
  let quote: "usdt" | "rls" | "margin";
  if (override === "usdt" || override === "rls" || override === "margin") {
    quote = override as "usdt" | "rls" | "margin";
  } else if (marginFunded) {
    // The owner keeps the capital in the margin (تعهدی) wallet, where the
    // exchange delegates the position and both sides can be traded.
    quote = "margin";
  } else if (totals.usdt >= 1) {
    quote = "usdt";
  } else if (totals.rial > 0) {
    quote = "rls";
  } else {
    quote = "usdt";
  }
  const value: NobitexQuote = { quote, rate };
  nobitexQuoteCache = { at: Date.now(), value };
  return value;
}

/** Best rial level of the `<COIN>IRT` book (ask when buying, bid when selling). */
async function nobitexRialTouch(coin: string, buy: boolean): Promise<number> {
  try {
    const book = await getJson(`${NOBITEX_BASE}/v3/orderbook/${coin.toUpperCase()}IRT`, { "User-Agent": NOBITEX_UA });
    const raw = (buy ? book?.asks : book?.bids) ?? [];
    const levels = (Array.isArray(raw) ? raw : [])
      .map((l: any) => num(l?.[0]))
      .filter((v: number) => v > 0);
    if (levels.length) return Math.round(buy ? Math.min(...levels) : Math.max(...levels));
  } catch {
    /* the caller falls back to the converted ticker price */
  }
  return 0;
}

/** Submit a Nobitex order, wait briefly for the match and cancel any rest so
 *  the bot never leaves stray orders on the account. `rate > 0` means the order
 *  was priced in rial and the fill has to be translated back to USDT. */
async function nobitexSettle(
  body: Record<string, unknown>,
  rate: number,
  endpoint: "spot" | "margin" = "spot",
  // Margin orders do not always report their fill on /market/orders/status: the
  // position itself is the proof. Ids held before the order tells new from old.
  knownPositionIds: string[] = []
): Promise<OrderResult> {
  let order: any;
  try {
    const j = await nobitexCall("POST", endpoint === "margin" ? "/margin/orders/add" : "/market/orders/add", body);
    order = j?.order;
    if (!order?.id) {
      return {
        ok: false,
        rejected: true,
        error: `${String(j?.code ?? "rejected")}: ${String(j?.detail ?? j?.message ?? "نوبیتکس سفارش را نپذیرفت.")}`,
      };
    }
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // A 4xx answer is a definitive rejection (amount, price, permission); only
    // unknown transport outcomes need reconciliation.
    return { ok: false, rejected: /\(HTTP 4\d\d\)/.test(msg), error: msg };
  }
  const id = Number(order.id);
  const wanted = num(order.amount);
  let status = String(order.status ?? "");
  let matched = num(order.matchedAmount);
  let avg = num(order.averagePrice);
  let fee = num(order.fee);
  // A margin (تعهدی) order is settled by the risk engine after the match, which
  // takes noticeably longer than a spot fill — wait longer before cancelling,
  // otherwise a filled entry is reported as unconfirmed.
  const tries = endpoint === "margin" ? 10 : 4;
  for (let i = 0; i < tries && matched < wanted; i += 1) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const s = (await nobitexCall("POST", "/market/orders/status", { id }))?.order ?? {};
      status = String(s.status ?? status);
      matched = num(s.matchedAmount) || matched;
      avg = num(s.averagePrice) || avg;
      fee = num(s.fee) || fee;
    } catch {
      break;
    }
    if (status === "Done" || status === "Canceled") break;
  }
  if (status !== "Done" && matched < wanted) {
    // A resting order must never be left on the account: Nobitex cancels with
    // update-status (by client id, because a margin order has no numeric id in
    // the order list).
    const byClient = String(body.clientOrderId ?? "").slice(0, 32);
    const cancels: Array<Record<string, unknown>> = [];
    if (byClient) cancels.push({ clientOrderId: byClient, status: "canceled", order: id });
    cancels.push({ order: id, status: "canceled" });
    for (const c of cancels) {
      try {
        await nobitexCall("POST", "/market/orders/update-status", c);
        break;
      } catch {
        /* try the next form */
      }
    }
    try {
      const s = (await nobitexCall("POST", "/market/orders/status", { id }))?.order ?? {};
      matched = num(s.matchedAmount) || matched;
      avg = num(s.averagePrice) || avg;
      fee = num(s.fee) || fee;
    } catch {
      /* keep the last known state */
    }
  }
  if (!(matched > 0)) {
    try {
      const s = (await nobitexCall("POST", "/market/orders/status", { id }))?.order ?? {};
      matched = num(s.matchedAmount) || matched;
      avg = num(s.averagePrice) || avg;
      fee = num(s.fee) || fee;
      status = String(s.status ?? status);
    } catch {
      /* keep the last known state */
    }
  }
  if (!(matched > 0) && endpoint === "margin") {
    // The margin engine books a position (تعهدی) instead of a plain fill, so ask
    // the position list — but only trust a row that did not exist before this
    // order, otherwise stale dust would look like a fresh fill.
    const base = String(body.srcCurrency ?? "").toLowerCase();
    try {
      const pl = await nobitexCall("GET", "/positions/list?status=active");
      const fresh = ((pl?.positions ?? []) as any[])
        .filter(
          (p) =>
            String(p.srcCurrency ?? "").toLowerCase() === base &&
            num(p.delegatedAmount) > 0 &&
            !knownPositionIds.includes(String(p.id))
        )
        .sort((a, b) => num(b.delegatedAmount) - num(a.delegatedAmount))[0];
      if (fresh) {
        const qty = num(fresh.delegatedAmount);
        const collateral = num(fresh.collateral);
        const entryRial = qty > 0 ? collateral / qty : 0;
        return {
          ok: true,
          orderId: fresh.id ? String(fresh.id) : String(id),
          filledQty: qty,
          filledPrice: rate > 0 && entryRial > 0 ? entryRial / rate : undefined,
        };
      }
    } catch {
      /* fall back to the unconfirmed answer below */
    }
  }
  if (!(matched > 0)) {
    return { ok: false, rejected: true, orderId: String(id), error: `سفارش پر نشد (${status || "unknown"})` };
  }
  const toUsdt = (v: number) => (rate > 0 ? v / rate : v);
  // A buy is credited net of the exchange fee (the fee is taken from the coin).
  const netQty = String(body.type) === "buy" ? Math.max(0, matched - fee) : matched;
  return {
    ok: true,
    orderId: String(id),
    filledQty: netQty > 0 ? netQty : matched,
    filledPrice: avg > 0 ? toUsdt(avg) : undefined,
  };
}

const nobitex: ExchangeAdapter = {
  name: "nobitex",
  async ticker(symbol) {
    const pair = String(symbol).trim().toUpperCase();
    try {
      const j = await getJson(`${NOBITEX_BASE}/v3/orderbook/${pair}`, { "User-Agent": NOBITEX_UA });
      const price = num(j?.lastTradePrice);
      if (!(price > 0)) return null;
      const base = pair.replace(/USDT$/, "").toLowerCase();
      let change24h = 0;
      try {
        const st = await getJson(`${NOBITEX_BASE}/market/stats?srcCurrency=${base}&dstCurrency=usdt`, {
          "User-Agent": NOBITEX_UA,
        });
        const s = st?.stats?.[`${base}-usdt`];
        const open = num(s?.dayOpen);
        if (open > 0) change24h = ((price - open) / open) * 100;
        else change24h = num(s?.dayChange);
      } catch {
        /* change is optional */
      }
      return { price, change24h };
    } catch {
      return null;
    }
  },
  async klines(symbol, timeframe, limit = 200) {
    const resolution = NOBITEX_RES[timeframe] ?? "15";
    const minutes = resolution === "D" ? 1440 : Number(resolution);
    const to = Math.floor(Date.now() / 1000);
    const bars = Math.min(Math.max(limit, 60), 300);
    const from = to - minutes * 60 * bars;
    const j = await getJson(
      `${NOBITEX_BASE}/market/udf/history?symbol=${String(symbol).trim().toUpperCase()}&resolution=${resolution}&from=${from}&to=${to}`,
      { "User-Agent": NOBITEX_UA }
    );
    if (j?.s !== "ok" || !Array.isArray(j?.t)) return [];
    const out: Kline[] = [];
    for (let i = 0; i < j.t.length; i += 1) {
      out.push({
        t: num(j.t[i]) * 1000,
        o: num(j.o?.[i]),
        h: num(j.h?.[i]),
        l: num(j.l?.[i]),
        c: num(j.c?.[i]),
        v: num(j.v?.[i]),
      });
    }
    return out;
  },
  async balance() {
    try {
      const t = await nobitexWalletTotals(true);
      const rate = await nobitexTomanPerUsdt();
      return t.usdt + (rate > 0 ? t.rial / rate : 0);
    } catch (e: any) {
      await logEngine("WARNING", `nobitex balance failed: ${e.message}`, null, "exchange");
      return null;
    }
  },
  // Available USDT for new entries (spot: free wallet balance).
  async availableMargin() {
    try {
      const t = await nobitexWalletTotals(true);
      // Rial (spot or margin collateral) is reported in USDT-equivalent so the
      // engine can size positions; placeOrder turns it into the right market.
      const rate = (await nobitexQuoteInfo()).rate;
      if (t.usdt > 0 && !(rate > 0)) return t.usdt;
      return t.usdt + (rate > 0 ? t.rial / rate : 0);
    } catch (e: any) {
      await logEngine("WARNING", `nobitex availableMargin failed: ${e.message}`, null, "exchange");
      return null;
    }
  },
  async placeOrder(req) {
    const match = /^([A-Z0-9]+)USDT$/i.exec(String(req.symbol).trim());
    if (!match) return { ok: false, error: `نماد برای نوبیتکس پشتیبانی نمی‌شود: ${req.symbol}` };
    const base = match[1].toLowerCase();
    const buy = req.side === "buy";
    const price = num(req.price);
    const qty = num(req.qty);
    if (!(qty > 0)) return { ok: false, error: "حجم سفارش نامعتبر است." };
    const clientOrderId = String(req.idempotencyKey ?? `wolf${Date.now()}`).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
    const { quote, rate } = await nobitexQuoteInfo();
    if (quote === "margin") {
      // Toman-funded margin (تعهدی) account: the exchange delegates the position
      // against the collateral, so both long and short entries are possible. The
      // order goes to the `<coin>-rls` margin market, which is open around the
      // clock (tether-toman is closed nightly).
      if (!(rate > 0)) return { ok: false, error: "نرخ لحظه‌ای تتر/تومان در دسترس نیست." };
      if (!(price > 0)) return { ok: false, error: "قیمت مرجع برای سفارش تعهدی لازم است." };
      const touch = await nobitexRialTouch(base, buy);
      const rialPrice = Math.max(1, Math.round(touch > 0 ? touch : price * rate * (buy ? 1.002 : 0.998)));
      const lev = Math.max(1, Math.min(3, Math.round(num((req as any).leverage, 1))));
      return nobitexSettle(
        {
          type: buy ? "buy" : "sell",
          execution: "limit",
          srcCurrency: base,
          dstCurrency: "rls",
          amount: String(Number(qty.toFixed(8))),
          price: String(rialPrice),
          leverage: String(lev),
          clientOrderId,
        },
        rate,
        "margin"
      );
    }
    if (quote === "rls") {
      // A toman-funded account trades the `<coin>-rls` market, which is open
      // around the clock (unlike tether-toman). Nobitex names a market
      // "<coin>-<quote>": srcCurrency is the coin, `amount` is always in coin
      // units and the price is quoted in rial. A small inside-the-spread limit
      // bounds the price while nobitexSettle follows the fill like a market
      // order and cancels whatever is left.
      if (!(rate > 0)) return { ok: false, error: "نرخ لحظه‌ای تتر/تومان در دسترس نیست." };
      if (!(price > 0)) return { ok: false, error: "قیمت مرجع برای سفارش تومانی لازم است." };
      // Price the limit at the touch of the rial book so the order behaves like
      // a market order; a wide offset would quietly donate the spread.
      let rialPrice = 0;
      try {
        const book = await getJson(`${NOBITEX_BASE}/v3/orderbook/${base.toUpperCase()}IRT`, {
          "User-Agent": NOBITEX_UA,
        });
        const raw = (buy ? book?.asks : book?.bids) ?? [];
        const levels = (Array.isArray(raw) ? raw : [])
          .map((l: any) => num(l?.[0]))
          .filter((v: number) => v > 0);
        if (levels.length) rialPrice = Math.round(buy ? Math.min(...levels) : Math.max(...levels));
      } catch {
        /* fall back to the converted ticker price */
      }
      if (!(rialPrice > 0)) rialPrice = Math.max(1, Math.round(price * rate * (buy ? 1.002 : 0.998)));
      let knownIds: string[] = [];
      try {
        const before = await nobitexCall("GET", "/positions/list?status=active");
        knownIds = ((before?.positions ?? []) as any[]).map((p) => String(p.id));
      } catch {
        /* without the snapshot a dust row could be mistaken for a fill */
      }
      return nobitexSettle(
        {
          type: buy ? "buy" : "sell",
          execution: "limit",
          srcCurrency: base,
          dstCurrency: "rls",
          amount: String(Number(qty.toFixed(8))),
          price: String(rialPrice),
          clientOrderId,
        },
        rate,
        "margin",
        knownIds
      );
    }
    // USDT quote: `amount` is in srcCurrency units (the coin) for both sides.
    return nobitexSettle(
      {
        type: buy ? "buy" : "sell",
        execution: "market",
        srcCurrency: base,
        dstCurrency: "usdt",
        amount: String(Number(qty.toFixed(8))),
        clientOrderId,
      },
      0
    );
  },
  async closePosition(symbol, side, qty, idempotencyKey) {
    const { quote, rate } = await nobitexQuoteInfo();
    if (quote === "margin") {
      // A margin position is settled through its own endpoint, not by an
      // opposite order (which would open a second position).
      const base = String(symbol).trim().replace(/USDT$/i, "").toLowerCase();
      try {
        const list = await nobitexCall("GET", "/positions/list?status=active");
        // Several positions can share a coin (dust rows from past settles), so
        // always settle the largest one — that is the engine's position.
        const pos = ((list?.positions ?? []) as any[])
          .filter((p) => String(p.srcCurrency ?? "").toLowerCase() === base)
          .sort((a, b) => num(b.delegatedAmount) - num(a.delegatedAmount))[0];
        if (!pos) return { ok: true, filledQty: num(qty) || undefined }; // already flat
        const held = num(pos.delegatedAmount);
        if (!(held > 0)) return { ok: true }; // already settled (no size left)
        const wanted = num(qty) > 0 ? Math.min(num(qty), held) : held;
        if (!(wanted > 0)) return { ok: true };
        const cid = String(idempotencyKey ?? `wolfclose${Date.now()}`).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
        // The settlement fee is taken from the coin that comes back, so a close
        // for exactly `held` leaves a dust remainder. Repeat with a small buffer
        // until the position is gone or stops shrinking.
        let remaining = wanted;
        let liability = num(pos.liability) || wanted;
        let lastOrderId: string | undefined;
        let lastError = "";
        let exitPrice = 0;
        for (let attempt = 0; attempt < 3 && remaining > 0; attempt += 1) {
          // Nobitex rejects anything ABOVE the liability (ExceedLiability), so the
          // request must be the smaller of what we hold and what we owe — asking
          // max() guaranteed a rejection whenever the fee had eaten into the coin.
          // Round DOWN: toFixed rounds half up and a hair above the liability is
          // rejected as "Amount Exceeds Liability" (that is what kept ETH stuck).
          const amount = Math.floor(Math.min(remaining, liability > 0 ? liability : remaining) * 1e8) / 1e8;
          if (!(amount > 0)) break;
          let r: any = null;
          try {
            r = await nobitexCall("POST", `/positions/${pos.id}/close`, {
              execution: "market",
              amount: String(amount),
              clientOrderId: `${cid}${attempt}`.slice(0, 32),
            });
          } catch (e: any) {
            // A dust position rejects the fee buffer ("Amount Exceeds
            // Liability"): retry with the exact delegated amount.
            lastError = String(e?.message ?? e);
            liability = remaining;
            if (attempt === 0) remaining = remaining; // keep going with the exact size
            continue;
          }
          if (r?.status !== "ok" && !r?.order?.id) {
            lastError = String(r?.code ?? r?.detail ?? "close rejected");
            liability = remaining;
            if (attempt === 0) continue;
            break;
          }
          lastOrderId = r?.order?.id ? String(r.order.id) : lastOrderId;
          let settled = false;
          for (let i = 0; i < 5; i += 1) {
            await new Promise((res) => setTimeout(res, 1200));
            try {
              const raw = await nobitexCall("GET", `/positions/${pos.id}/status`);
              const st = raw?.position ?? raw;
              if (!st) break;
              if (num(st.exitPrice) > 0) exitPrice = exitPrice || num(st.exitPrice);
              if (String(st.status ?? "") !== "Open") {
                settled = true;
                remaining = 0;
                break;
              }
              const left = num(st.delegatedAmount);
              liability = num(st.liability) || left;
              // Stop when the position is gone or the last close made no progress.
              if (!(left < remaining)) {
                remaining = left <= 1e-8 ? 0 : left;
                break;
              }
              remaining = left;
            } catch {
              /* keep polling */
            }
          }
          if (settled || remaining <= 0) break;
        }
        if (remaining > 0) {
          // A short is closed with a buy, so the fee is taken in the coin and a
          // dust remainder keeps the whole collateral blocked. Shrink the
          // collateral (the API keeps the margin ratio above its floor) so the
          // capital is usable again.
          const notional = remaining * num((pos as any).markPrice || 0);
          let target = Math.max(150_000, notional * 6);
          for (let i = 0; i < 4 && target > 0; i += 1) {
            try {
              await nobitexCall("POST", `/positions/${pos.id}/edit-collateral`, {
                collateral: String(Math.ceil(target)),
              });
              break;
            } catch {
              target *= 3;
            }
          }
          await logEngine(
            "WARNING",
            `nobitex margin: ${base.toUpperCase()} left ${remaining} on the exchange (${lastError || "dust"}), collateral released`,
            null,
            "exchange",
          );
        }
        return {
          ok: true,
          orderId: lastOrderId,
          filledQty: wanted,
          filledPrice: exitPrice > 0 && rate > 0 ? exitPrice / rate : undefined,
        };
      } catch (e: any) {
        return { ok: false, error: String(e?.message ?? e) };
      }
    }
    return this.placeOrder({
      symbol,
      side: side === "long" ? "sell" : "buy",
      qty,
      idempotencyKey: idempotencyKey ?? `close-${now()}-${symbol}`,
    });
  },
};

/** True when live execution may open short entries.
 *  Only the margin wallet could short, but closing a short is a buy whose fee
 *  comes out of the coin: the position never settles to zero, and Nobitex keeps
 *  the whole collateral of that row blocked. That would freeze the capital of
 *  every short, so shorts stay disabled unless the owner opts in explicitly. */
/** Symbols the margin account currently holds (null = the broker call failed). */
export async function nobitexActiveSymbols(): Promise<string[] | null> {
  try {
    const r = await nobitexCall("GET", "/positions/list?status=active");
    return ((r?.positions ?? []) as any[])
      .filter((p) => num(p.delegatedAmount) > 0)
      .map((p) => `${String(p.srcCurrency ?? "").toUpperCase()}USDT`);
  } catch {
    return null;
  }
}

/** Broker positions with their size (null = the broker call failed). */
export async function nobitexActivePositions(): Promise<
  Array<{
    symbol: string;
    side: "long" | "short";
    qty: number;
    collateral: number;
    entryPrice: number;
    liquidation: number;
    mark: number;
    leverage: number;
  }> | null
> {
  try {
    const r = await nobitexCall("GET", "/positions/list?status=active");
    return ((r?.positions ?? []) as any[])
      .filter((p) => num(p.delegatedAmount) > 0)
      .map((p) => ({
        symbol: `${String(p.srcCurrency ?? "").toUpperCase()}USDT`,
        side: String(p.side ?? "buy").toLowerCase() === "sell" ? ("short" as const) : ("long" as const),
        qty: num(p.delegatedAmount),
        collateral: num(p.collateral),
        entryPrice: num(p.entryPrice),
        liquidation: num(p.liquidationPrice),
        mark: num(p.markPrice),
        leverage: Math.max(1, num(p.leverage) || 1),
      }));
  } catch {
    return null;
  }
}

/**
 * Rial per 1 USDT. Nobitex quotes rial markets in rial, while `usdtTomanRate()`
 * (the rate used by the wallet/payment side) is toman — 10× smaller. Any rial
 * amount (position collateral, entryPrice) must be divided by this, not by the
 * toman rate, or every price comes out 10× too high.
 */
export async function nobitexRialPerUsdt(): Promise<number> {
  return nobitexTomanPerUsdt().catch(() => 0);
}

/** Symbols with a working order at the broker (null = the broker call failed). */
export async function nobitexOpenOrderSymbols(): Promise<string[] | null> {
  try {
    const r = await nobitexCall("GET", "/market/orders/list?status=open");
    return ((r?.orders ?? []) as any[]).map((o) => `${String(o.srcCurrency ?? "").toUpperCase()}USDT`);
  } catch {
    return null;
  }
}

/** Nobitex refuses a margin order whose value is under 500,000 rial. */
export async function nobitexMinOrderUsdt(): Promise<number> {
  const rate = num(await nobitexRialPerUsdt().catch(() => 0));
  return rate > 0 ? 500000 / rate : 0.2;
}

export async function nobitexAllowsShort(): Promise<boolean> {
  try {
    if (String((await getSetting<string>("market.nobitexAllowShorts", "false"))) === "true") {
      return (await nobitexQuoteInfo()).quote === "margin";
    }
    return false;
  } catch {
    return false;
  }
}

export const adapters: Record<string, ExchangeAdapter> = {
  binance, bybit, okx, bingx, mexc, gate, kucoin, lbank, bitget, coinex, mt5, nobitex, wallex: wallexAdapter,
};

/** Resolve the adapter used for an actual order. The paper adapter is never
 * selected for live execution; a missing live adapter is a hard error. */
export function getExecutionAdapter(provider: string | undefined, market?: string): ExchangeAdapter {
  const key = String(provider ?? (market === "forex" ? "mt5" : "binance")).trim().toLowerCase();
  const adapter = adapters[key];
  if (key === "paper") throw new Error("paper_adapter_not_live_execution");
  if (!adapter) throw new Error(`unsupported_execution_provider:${key}`);
  return adapter;
}

function toOkx(symbol: string): string {
  return symbol.replace(/^(.+)(USDT|USDC|BTC|ETH)$/, "$1-$2");
}

async function account(provider: string, accountId?: string): Promise<{ key: string; secret: string; passphrase?: string } | null> {
  const a = await pool
    .query(
      `SELECT api_key_enc, api_secret_enc, pass_phrase_enc FROM exchange_accounts
        WHERE provider = $1
          AND enabled = true
          AND environment = 'live'
          AND ($2::uuid IS NULL OR id = $2::uuid)
        ORDER BY created_at DESC LIMIT 1`,
      [provider, accountId ?? null]
    )
    .catch(() => ({ rows: [] as any[] }));
  const row = a.rows[0];
  if (!row) return null;
  try {
    return {
      key: decryptSecret(row.api_key_enc),
      secret: decryptSecret(row.api_secret_enc),
      passphrase: row.pass_phrase_enc ? decryptSecret(row.pass_phrase_enc) : undefined,
    };
  } catch {
    return null;
  }
}

/** Specialized Forex candles fetcher with robust multi-provider fallback. */
export async function fetchForexKlines(symbol: string, timeframe: string): Promise<Kline[]> {
  // 1. Prefer the configured MT5 bridge: this is the only source that can
  // provide broker-native forex candles for execution and scalping.
  const mt5Ks = await fetchMt5BridgeKlines(symbol, timeframe);
  if (mt5Ks.length >= 30) return mt5Ks.slice(-250);

  // 2. Try Kraken
  const krakenKs = await fetchForexKrakenKlines(symbol, timeframe);
  if (krakenKs.length >= 30) return krakenKs.slice(-250);

  // 3. Try Yahoo Finance
  const yahooKs = await fetchYahooKlines(symbol, timeframe);
  if (yahooKs.length >= 30) return yahooKs.slice(-250);

  // 4. For XAUUSD, use PAXG crypto gold proxy on OKX / Gate / Binance
  if (symbol === "XAUUSD") {
    for (const name of ["okx", "gate", "binance", "bybit"]) {
      const a = adapters[name];
      if (!a) continue;
      try {
        const ks = await a.klines("PAXGUSDT", timeframe, 200);
        if (ks.length >= 30) return ks.sort((x, y) => x.t - y.t).slice(-250);
      } catch {}
    }
  }

  // 5. For EURUSD, use EURUSDT proxy on MEXC / Binance
  if (symbol === "EURUSD") {
    for (const name of ["mexc", "binance", "bybit"]) {
      const a = adapters[name];
      if (!a) continue;
      try {
        const ks = await a.klines("EURUSDT", timeframe, 200);
        if (ks.length >= 30) return ks.sort((x, y) => x.t - y.t).slice(-250);
      } catch {}
    }
  }

  // Never invent forex candles in the production/live feed. A synthetic
  // series can make the engine appear healthy while it is trading on prices
  // that never existed. Demo mode gets its explicit fallback in engine.ts.
  return [];
}

/** Specialized Forex ticker fetcher. */
export async function fetchForexTicker(symbol: string): Promise<{ price: number; change24h: number } | null> {
  // Prefer the broker-native quote when MT5 is configured.
  const mt5Tick = await fetchMt5BridgeTicker(symbol);
  if (mt5Tick) return mt5Tick;

  // Try Yahoo Finance
  const s = symbol === "XAUUSD" ? "GC=F" : symbol === "XAGUSD" ? "SI=F" : `${symbol}=X`;
  try {
    const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=1d&range=2d`);
    const meta = j?.chart?.result?.[0]?.meta;
    const price = num(meta?.regularMarketPrice);
    const prev = num(meta?.chartPreviousClose ?? meta?.previousClose);
    if (price > 0) {
      const change24h = prev > 0 ? ((price - prev) / prev) * 100 : 0;
      return { price, change24h };
    }
  } catch {}

  // Gold proxy
  if (symbol === "XAUUSD") {
    const paxg = await adapters.binance.ticker("PAXGUSDT").catch(() => null);
    if (paxg && paxg.price > 0) return paxg;
  }

  return null;
}

/** Market data with provider fallback chain. Returns candles sorted by time asc. */
const MARKET_PROVIDERS = ["binance", "bybit", "okx", "bingx", "mexc", "gate", "kucoin", "lbank", "bitget", "coinex", "nobitex", "wallex"];

/** The configured primary provider first (Wallex-only symbols exist nowhere else). */
async function providerOrder(): Promise<string[]> {
  const primary = String((await getSetting<string>("market.primaryProvider", "").catch(() => "")) ?? "").toLowerCase();
  if (!primary || !MARKET_PROVIDERS.includes(primary)) return MARKET_PROVIDERS;
  return [primary, ...MARKET_PROVIDERS.filter((p) => p !== primary)];
}

export async function fetchKlines(
  symbol: string,
  timeframe: string,
  providers?: string[]
): Promise<Kline[]> {
  if (isForexSymbol(symbol)) {
    return fetchForexKlines(symbol, timeframe);
  }

  const order = providers ?? (await providerOrder());
  for (const name of order) {
    const a = adapters[name];
    if (!a) continue;
    try {
      const ks = await a.klines(symbol, timeframe, 300);
      if (ks.length >= 30) {
        // newest first on most exchanges → sort ascending
        const sorted = [...ks].sort((x, y) => x.t - y.t);
        return sorted.slice(-250);
      }
    } catch (e: any) {
      await logEngine("WARNING", `market ${name} ${symbol} ${timeframe} failed: ${e.message}`, null, "market");
    }
  }
  return [];
}

/** Best-effort real ticker with fallback. */
export async function fetchTicker(
  symbol: string
): Promise<{ price: number; change24h: number } | null> {
  if (isForexSymbol(symbol)) {
    return fetchForexTicker(symbol);
  }

  const order = await providerOrder();
  for (const name of order) {
    const a = adapters[name];
    try {
      const t = await a.ticker(symbol);
      if (t && t.price > 0) return t;
    } catch {
      /* next */
    }
  }
  return null;
}

/** Paper adapter used when LIVE trading is not activated. */
export const paperAdapter: ExchangeAdapter = {
  name: "paper",
  async ticker(symbol) {
    return fetchTicker(symbol);
  },
  async klines(symbol, timeframe, limit = 200) {
    return fetchKlines(symbol, timeframe);
  },
  async balance() {
    const s = await pool.query(`SELECT value FROM system_settings WHERE key = 'engine.virtualCapital'`);
    return num(s.rows[0]?.value ?? 1000);
  },
  async placeOrder(req) {
    return { ok: true, orderId: `paper-${now()}`, filledPrice: req.price, filledQty: req.qty };
  },
  async closePosition() {
    return { ok: true, orderId: `paper-${now()}` };
  },
};
