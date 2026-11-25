import { config } from "./config.js";
import { getSettings } from "./settings.js";
import { num } from "./util.js";

/**
 * USDT/Toman price engine.
 *
 * Reads the USDT price from several Iranian venues, keeps the highest bid as the
 * market anchor, then applies the house markup (500–1000 toman) so our quoted
 * price is never below the best market. The admin can switch to a manual price
 * at any time (`usdt.priceMode = manual`).
 */

type Source = { key: string; label: string; url: string; path: string; divide?: number; scale?: number };

const DEFAULT_SOURCES: Source[] = [
  { key: "wallex", label: "والکس", url: "https://api.wallex.ir/v1/markets", path: "result.symbols.USDTTMN.stats.lastPrice" },
  { key: "nobitex", label: "نوبیتکس", url: "https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls", path: "stats.usdt-rls.latest", divide: 10 },
  { key: "abantether", label: "آبان تتر", url: "https://api.abantether.com/api/v1/otc/currency-list", path: "data.USDT.price" },
  { key: "tetherland", label: "تترلند", url: "https://api.tetherland.com/currencies", path: "data.currencies.USDT.price" },
  { key: "tabdeal", label: "تب‌دیل", url: "https://api.tabdeal.org/r/api/v1/depth?symbol=USDTIRT", path: "asks.0.0" },
];

export type RateRow = {
  key: string;
  label: string;
  price: number | null;
  ok: boolean;
  error?: string;
  ms: number;
  url: string;
};

export type RateSnapshot = {
  rows: RateRow[];
  best: number | null;
  bestKey: string | null;
  markup: number;
  mode: "auto" | "manual";
  manualPrice: number;
  final: number | null;
  at: number;
};

const CACHE_TTL_MS = 45_000;
let cache: RateSnapshot | null = null;
let inFlight: Promise<RateSnapshot> | null = null;

function pick(obj: any, path: string): unknown {
  let cur = obj;
  for (const part of path.split(".")) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

async function fetchSource(src: Source): Promise<RateRow> {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(src.url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
          Accept: "application/json",
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: any = await res.json();
    const raw = pick(body, src.path);
    let price = Number(raw);
    if (!Number.isFinite(price) || price <= 0) throw new Error("price_not_found");
    if (src.divide) price = price / src.divide;
    if (src.scale) price = price * src.scale;
    return { key: src.key, label: src.label, price: Math.round(price), ok: true, ms: Date.now() - started, url: src.url };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "timeout" : String(e?.message ?? e).slice(0, 80);
    return { key: src.key, label: src.label, price: null, ok: false, error: msg, ms: Date.now() - started, url: src.url };
  }
}

async function sourcesFromSettings(): Promise<Source[]> {
  try {
    const s = await getSettings();
    const raw = (s as any)["usdt.sources"];
    const list = typeof raw === "string" && raw.trim() ? JSON.parse(raw) : raw;
    if (Array.isArray(list) && list.length) {
      return list
        .filter((x: any) => x && typeof x.url === "string" && typeof x.path === "string")
        .map((x: any, i: number) => ({
          key: String(x.key ?? `src${i}`),
          label: String(x.label ?? x.key ?? `source ${i}`),
          url: String(x.url),
          path: String(x.path),
          divide: Number.isFinite(Number(x.divide)) && Number(x.divide) > 0 ? Number(x.divide) : undefined,
        }));
    }
  } catch {
    /* fall back to defaults */
  }
  return DEFAULT_SOURCES;
}

export async function getUsdtRates(force = false): Promise<RateSnapshot> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const s = (await getSettings()) as any;
    const srcs = await sourcesFromSettings();
    const rows = await Promise.all(srcs.map((src) => fetchSource(src)));
    const ok = rows.filter((r) => r.ok && r.price);
    const bestRow = ok.sort((a, b) => Number(b.price) - Number(a.price))[0] ?? null;
    const markupRaw = num(s["usdt.markupToman"], 700);
    const markup = Math.max(0, Math.min(100_000, Math.round(markupRaw)));
    const mode = String(s["usdt.priceMode"] ?? "auto") === "manual" ? "manual" : "auto";
    const manualPrice = Math.max(0, Math.round(num(s["usdt.manualPrice"], 0)));
    const best = bestRow?.price ?? null;
    const final = mode === "manual" ? (manualPrice > 0 ? manualPrice : null) : best ? best + markup : null;
    const snap: RateSnapshot = {
      rows,
      best,
      bestKey: bestRow?.key ?? null,
      markup,
      mode,
      manualPrice,
      final,
      at: Date.now(),
    };
    cache = snap;
    inFlight = null;
    return snap;
  })().catch((e) => {
    inFlight = null;
    throw e;
  });
  return inFlight;
}

/**
 * The single source of truth for "our" USDT/Toman price.
 * manual (if set) → highest market + markup → stored setting → 95,000 fallback.
 */
export async function usdtTomanRate(): Promise<number> {
  try {
    const snap = await getUsdtRates();
    if (snap.final && snap.final > 10_000) return snap.final;
  } catch {
    /* network trouble — fall through to the stored value */
  }
  const s = (await getSettings()) as any;
  const stored = num(s["usdt.tomanRate"], 95_000);
  return Math.max(10_000, stored);
}

export function invalidateRateCache(): void {
  cache = null;
}

export const RATE_DEFAULT_SOURCES = DEFAULT_SOURCES;
export const RATE_APP_URL = config.appUrl;
