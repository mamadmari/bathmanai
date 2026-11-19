'use strict';

/**
 * CryptoDesk - دستیار معاملات کریپتو
 * -----------------------------------
 * سرور کاملاً بدون وابستگی npm (فقط ماژول‌های داخلی Node.js):
 *   - سرو فایل‌های استاتیک پوشه public
 *   - پروکسی + کش داده‌های بازار با فِیلاور خودکار بین چند صرافی
 *
 * اجرا:  node server.js
 * پورت:  PORT=8787 (قابل تغییر با متغیر محیطی)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const APP_VERSION = '1.0.0';
const STARTED_AT = Date.now();

/* ------------------------------------------------------------------ *
 *  لیست نمادهای پرطرفدار (برای نوار قیمت، واچ‌لیست و جست‌وجو)
 * ------------------------------------------------------------------ */
const POPULAR = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT',
  'ADAUSDT', 'TONUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT', 'TRXUSDT',
  'LTCUSDT', 'SHIBUSDT', 'NEARUSDT', 'SUIUSDT', 'APTUSDT', 'ARBUSDT',
  'OPUSDT', 'ATOMUSDT', 'ETCUSDT', 'BCHUSDT', 'UNIUSDT', 'FILUSDT',
  'INJUSDT', 'PEPEUSDT', 'SEIUSDT', 'TIAUSDT', 'RENDERUSDT', 'FETUSDT',
  'AAVEUSDT', 'ICPUSDT', 'HBARUSDT', 'ALGOUSDT', 'VETUSDT', 'STXUSDT',
  'IMXUSDT', 'GRTUSDT', 'LDOUSDT', 'ENAUSDT', 'JUPUSDT', 'WLDUSDT',
  'ONDOUSDT', 'CRVUSDT', 'SANDUSDT', 'AXSUSDT', 'GALAUSDT', 'THETAUSDT'
];

/* نام نمایشی نمادها برای رابط کاربری */
const NAMES = {
  BTC: 'بیت‌کوین', ETH: 'اتریوم', SOL: 'سولانا', BNB: 'بایننس‌کوین',
  XRP: 'ریپل', DOGE: 'دوج‌کوین', ADA: 'کاردانو', TON: 'تون‌کوین',
  AVAX: 'آوالانچ', LINK: 'چین‌لینک', DOT: 'پولکادات', TRX: 'ترون',
  LTC: 'لایت‌کوین', SHIB: 'شیبا اینو', NEAR: 'نیر', SUI: 'سویی',
  APT: 'اپتوس', ARB: 'آربیتروم', OP: 'آپتیمیزم', ATOM: 'کازموس',
  ETC: 'اتریوم کلاسیک', BCH: 'بیت‌کوین کش', UNI: 'یونی‌سواپ',
  FIL: 'فایل‌کوین', INJ: 'اینجکتیو', PEPE: 'پپه', SEI: 'سی',
  TIA: 'سلستیا', RENDER: 'رندر', FET: 'فچ', AAVE: 'آوی',
  ICP: 'اینترنت کامپیوتر', HBAR: 'هدرا', ALGO: 'الگورند',
  VET: 'ویتچین', STX: 'استکس', IMX: 'ایمیوتبل', GRT: 'گراف',
  LDO: 'لیدو', ENA: 'انا', JUP: 'جوپیتر', WLD: 'ورلدکوین',
  ONDO: 'اوندو', CRV: 'کرو', SAND: 'سندباکس', AXS: 'اکسی',
  GALA: 'گالا', THETA: 'تتا'
};

/* ------------------------------------------------------------------ *
 *  تایم‌فریم‌ها و معادل آن‌ها در هر صرافی
 * ------------------------------------------------------------------ */
const INTERVALS = {
  '1m':  { ms: 60e3,       binance: '1m',  bybit: '1',   okx: '1m',  kucoin: '1min',  geckoDays: 1 },
  '5m':  { ms: 5 * 60e3,   binance: '5m',  bybit: '5',   okx: '5m',  kucoin: '5min',  geckoDays: 1 },
  '15m': { ms: 15 * 60e3,  binance: '15m', bybit: '15',  okx: '15m', kucoin: '15min', geckoDays: 1 },
  '30m': { ms: 30 * 60e3,  binance: '30m', bybit: '30',  okx: '30m', kucoin: '30min', geckoDays: 2 },
  '1h':  { ms: 3600e3,     binance: '1h',  bybit: '60',  okx: '1H',  kucoin: '1hour', geckoDays: 14 },
  '4h':  { ms: 4 * 3600e3, binance: '4h',  bybit: '240', okx: '4H',  kucoin: '4hour', geckoDays: 60 },
  '1d':  { ms: 24 * 3600e3, binance: '1d', bybit: 'D',   okx: '1D',  kucoin: '1day',  geckoDays: 365 },
  '1w':  { ms: 7 * 24 * 3600e3, binance: '1w', bybit: 'W', okx: '1W', kucoin: '1week', geckoDays: 365 }
};

/* ------------------------------------------------------------------ *
 *  ابزارهای کوچک
 * ------------------------------------------------------------------ */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSymbol(raw) {
  const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return '';
  if (clean.length <= 10 && !/(USDT|USDC|BUSD|FDUSD|BTC|ETH)$/.test(clean)) {
    return clean + 'USDT';
  }
  return clean;
}

function pairLabel(symbol) {
  const quotes = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'BTC', 'ETH'];
  const quote = quotes.find((q) => symbol.endsWith(q) && symbol.length > q.length);
  if (!quote) return symbol;
  return symbol.slice(0, -quote.length) + '/' + quote;
}

function log() {
  const stamp = new Date().toISOString();
  console.log.apply(console, ['[' + stamp + ']'].concat(Array.from(arguments)));
}

/* ------------------------------------------------------------------ *
 *  کش ساده حافظه‌ای (با امکان بازگرداندن داده‌ی کهنه در صورت خطا)
 * ------------------------------------------------------------------ */
const store = new Map();

async function cached(key, ttl, producer) {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && now - hit.ts < ttl) {
    return { value: hit.value, ts: hit.ts, cache: 'hit' };
  }
  try {
    const value = await producer();
    store.set(key, { ts: now, ttl, value });
    return { value, ts: now, cache: 'miss' };
  } catch (err) {
    if (hit && now - hit.ts < Math.max(ttl * 30, 10 * 60e3)) {
      return {
        value: hit.value,
        ts: hit.ts,
        cache: 'stale',
        error: String((err && err.message) || err)
      };
    }
    throw err;
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.ts > Math.max(entry.ttl * 60, 3600e3)) store.delete(key);
  }
}, 5 * 60e3).unref();

/* ------------------------------------------------------------------ *
 *  کلاینت HTTP سبک (https + gzip/brotli + ریدایرکت + تایم‌اوت)
 * ------------------------------------------------------------------ */
function getJson(url, options, redirects) {
  const opts = options || {};
  const depth = redirects || 0;
  const timeout = opts.timeout || 9000;

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: Object.assign({
        'User-Agent': 'CryptoDesk/' + APP_VERSION + ' (+node)',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate, br'
      }, opts.headers || {})
    }, (res) => {
      const status = res.statusCode || 0;

      if (status >= 300 && status < 400 && res.headers.location && depth < 3) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        resolve(getJson(next, opts, depth + 1));
        return;
      }

      const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
      let stream = res;
      if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
      else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
      else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());

      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (status < 200 || status >= 300) {
          reject(new Error('HTTP ' + status + ' | ' + body.slice(0, 160)));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error('Invalid JSON | ' + body.slice(0, 120)));
        }
      });
      stream.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy(new Error('Timeout after ' + timeout + 'ms'));
    });
  });
}

/* ------------------------------------------------------------------ *
 *  صرافی‌ها: هر پراوایدر باید klines و tickers را به شکل یکسان بدهد
 *  خروجی کندل: [timestampMs, open, high, low, close, volume] صعودی
 * ------------------------------------------------------------------ */
function sanitizeCandles(rows) {
  const out = [];
  for (const row of rows || []) {
    const t = num(row[0]);
    const o = num(row[1]);
    const h = num(row[2]);
    const l = num(row[3]);
    const c = num(row[4]);
    const v = num(row[5]);
    if (t > 0 && o > 0 && h > 0 && l > 0 && c > 0) out.push([t, o, h, l, c, v]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

const binance = {
  name: 'binance',
  async klines(symbol, interval, limit) {
    const iv = INTERVALS[interval].binance;
    const data = await getJson(
      'https://api.binance.com/api/v3/klines?symbol=' + symbol +
      '&interval=' + iv + '&limit=' + limit
    );
    return sanitizeCandles(data);
  },
  async tickers(symbols) {
    const query = encodeURIComponent(JSON.stringify(symbols));
    const data = await getJson('https://api.binance.com/api/v3/ticker/24hr?symbols=' + query);
    return data.map((d) => ({
      symbol: d.symbol,
      last: num(d.lastPrice),
      changePct: num(d.priceChangePercent),
      high: num(d.highPrice),
      low: num(d.lowPrice),
      volume: num(d.volume),
      quoteVolume: num(d.quoteVolume)
    }));
  }
};

const bybit = {
  name: 'bybit',
  async klines(symbol, interval, limit) {
    const iv = INTERVALS[interval].bybit;
    const json = await getJson(
      'https://api.bybit.com/v5/market/kline?category=spot&symbol=' + symbol +
      '&interval=' + iv + '&limit=' + limit
    );
    if (json.retCode !== 0) throw new Error(json.retMsg || 'bybit error');
    const list = (json.result && json.result.list) || [];
    return sanitizeCandles(list.map((r) => [+r[0], +r[1], +r[2], +r[3], +r[4], +r[5]]));
  },
  async tickers(symbols) {
    const json = await getJson('https://api.bybit.com/v5/market/tickers?category=spot');
    if (json.retCode !== 0) throw new Error(json.retMsg || 'bybit error');
    const map = new Map(((json.result && json.result.list) || []).map((t) => [t.symbol, t]));
    const out = [];
    for (const symbol of symbols) {
      const t = map.get(symbol);
      if (!t) continue;
      out.push({
        symbol,
        last: num(t.lastPrice),
        changePct: num(t.price24hPcnt) * 100,
        high: num(t.highPrice24h),
        low: num(t.lowPrice24h),
        volume: num(t.volume24h),
        quoteVolume: num(t.turnover24h)
      });
    }
    return out;
  }
};

const okx = {
  name: 'okx',
  instId(symbol) {
    const quotes = ['USDT', 'USDC', 'BTC', 'ETH'];
    const quote = quotes.find((q) => symbol.endsWith(q) && symbol.length > q.length);
    if (!quote) return symbol + '-USDT';
    return symbol.slice(0, -quote.length) + '-' + quote;
  },
  async klines(symbol, interval, limit) {
    const iv = INTERVALS[interval].okx;
    const json = await getJson(
      'https://www.okx.com/api/v5/market/candles?instId=' + this.instId(symbol) +
      '&bar=' + iv + '&limit=' + Math.min(limit, 300)
    );
    if (json.code !== '0') throw new Error(json.msg || 'okx error');
    const rows = (json.data || []).map((r) => [+r[0], +r[1], +r[2], +r[3], +r[4], +r[5]]);
    return sanitizeCandles(rows);
  },
  async tickers(symbols) {
    const json = await getJson('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
    if (json.code !== '0') throw new Error(json.msg || 'okx error');
    const wanted = new Map();
    for (const symbol of symbols) wanted.set(this.instId(symbol), symbol);
    const out = [];
    for (const t of json.data || []) {
      const symbol = wanted.get(t.instId);
      if (!symbol) continue;
      const last = num(t.last);
      const open = num(t.open24h);
      out.push({
        symbol,
        last,
        changePct: open > 0 ? ((last - open) / open) * 100 : 0,
        high: num(t.high24h),
        low: num(t.low24h),
        volume: num(t.vol24h),
        quoteVolume: num(t.volCcy24h)
      });
    }
    return out;
  }
};

const kucoin = {
  name: 'kucoin',
  pair(symbol) {
    const quotes = ['USDT', 'USDC', 'BTC', 'ETH'];
    const quote = quotes.find((q) => symbol.endsWith(q) && symbol.length > q.length);
    if (!quote) return symbol + '-USDT';
    return symbol.slice(0, -quote.length) + '-' + quote;
  },
  async klines(symbol, interval, limit) {
    const iv = INTERVALS[interval].kucoin;
    const json = await getJson(
      'https://api.kucoin.com/api/v1/market/candles?type=' + iv +
      '&symbol=' + this.pair(symbol)
    );
    if (json.code !== '200000') throw new Error(json.msg || 'kucoin error');
    const rows = (json.data || []).map((r) => [+r[0] * 1000, +r[1], +r[3], +r[4], +r[2], +r[5]]);
    return sanitizeCandles(rows).slice(-limit);
  },
  async tickers(symbols) {
    const json = await getJson('https://api.kucoin.com/api/v1/market/allTickers');
    if (json.code !== '200000') throw new Error(json.msg || 'kucoin error');
    const map = new Map(((json.data && json.data.ticker) || []).map((t) => [t.symbol, t]));
    const out = [];
    for (const symbol of symbols) {
      const t = map.get(this.pair(symbol));
      if (!t) continue;
      out.push({
        symbol,
        last: num(t.last),
        changePct: num(t.changeRate) * 100,
        high: num(t.high),
        low: num(t.low),
        volume: num(t.vol),
        quoteVolume: num(t.volValue)
      });
    }
    return out;
  }
};

const providers = [binance, bybit, okx, kucoin];

/* ------------------------------------------------------------------ *
 *  فِیلاور خودکار: پراوایدری که آخرین بار موفق بوده اول امتحان می‌شود
 * ------------------------------------------------------------------ */
let preferred = String(process.env.PREFERRED_PROVIDER || 'binance');

function providerOrder() {
  const first = providers.find((p) => p.name === preferred) || providers[0];
  return [first].concat(providers.filter((p) => p !== first));
}

async function withFailover(method, args) {
  const errors = [];
  for (const provider of providerOrder()) {
    if (typeof provider[method] !== 'function') continue;
    try {
      const data = await provider[method].apply(provider, args);
      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error('empty response');
      }
      preferred = provider.name;
      return { data, source: provider.name };
    } catch (err) {
      errors.push(provider.name + ': ' + String((err && err.message) || err).slice(0, 120));
    }
  }
  throw new Error('ALL_PROVIDERS_FAILED ' + errors.join(' || '));
}

/* ------------------------------------------------------------------ *
 *  CoinGecko: نمای کلی بازار و جست‌وجوی شناسه‌ی کوین (فِیلاور نهایی)
 * ------------------------------------------------------------------ */
const GECKO_MARKETS = 'https://api.coingecko.com/api/v3/coins/markets';

async function geckoMarkets(limit) {
  const url = GECKO_MARKETS + '?vs_currency=usd&order=market_cap_desc&per_page=' +
    Math.min(limit, 250) + '&page=1&sparkline=false&price_change_percentage=24h';
  const rows = await getJson(url, { timeout: 12000 });
  return (rows || []).map((c) => ({
    id: c.id,
    symbol: String(c.symbol || '').toUpperCase(),
    name: c.name,
    price: num(c.current_price),
    change24h: num(c.price_change_percentage_24h),
    marketCap: num(c.market_cap),
    marketCapRank: num(c.market_cap_rank),
    volume: num(c.total_volume),
    high24h: num(c.high_24h),
    low24h: num(c.low_24h)
  }));
}

async function geckoIdFor(symbol) {
  const base = symbol.replace(/(USDT|USDC|BUSD|FDUSD)$/, '');
  const key = 'gecko:id:' + base;
  const hit = store.get(key);
  if (hit) return hit.value;

  const rows = await geckoMarkets(250);
  const market = rows.find((c) => c.symbol === base);
  if (!market) throw new Error('coin not found on coingecko: ' + base);
  store.set(key, { ts: Date.now(), ttl: 24 * 3600e3, value: market.id });
  return market.id;
}

async function geckoKlines(symbol, interval, limit) {
  const id = await geckoIdFor(symbol);
  const days = INTERVALS[interval].geckoDays;
  const rows = await getJson(
    'https://api.coingecko.com/api/v3/coins/' + encodeURIComponent(id) +
    '/ohlc?vs_currency=usd&days=' + days,
    { timeout: 12000 }
  );
  const candles = sanitizeCandles((rows || []).map((r) => [r[0], r[1], r[2], r[3], r[4], 0]));
  if (!candles.length) throw new Error('no ohlc data');
  return candles.slice(-limit);
}

/* ------------------------------------------------------------------ *
 *  توابع سطح‌بالا + کش
 * ------------------------------------------------------------------ */
function klineTtl(interval) {
  const ms = INTERVALS[interval].ms;
  return Math.max(6000, Math.min(Math.round(ms / 6), 20e3));
}

async function getKlines(symbol, interval, limit) {
  const key = 'klines:' + symbol + ':' + interval + ':' + limit;
  return cached(key, klineTtl(interval), async () => {
    try {
      const result = await withFailover('klines', [symbol, interval, limit]);
      return result;
    } catch (err) {
      const candles = await geckoKlines(symbol, interval, limit);
      return { data: candles, source: 'coingecko' };
    }
  });
}

async function getTickers(symbols) {
  const key = 'tickers:' + symbols.join(',');
  return cached(key, 8000, async () => {
    try {
      return await withFailover('tickers', [symbols]);
    } catch (err) {
      const rows = await geckoMarkets(250);
      const bySymbol = new Map(rows.map((c) => [c.symbol, c]));
      const data = [];
      for (const symbol of symbols) {
        const base = symbol.replace(/(USDT|USDC|BUSD|FDUSD)$/, '');
        const coin = bySymbol.get(base);
        if (!coin) continue;
        data.push({
          symbol,
          last: coin.price,
          changePct: coin.change24h,
          high: coin.high24h,
          low: coin.low24h,
          volume: 0,
          quoteVolume: coin.volume
        });
      }
      if (!data.length) throw err;
      return { data, source: 'coingecko' };
    }
  });
}

async function getMarkets(limit) {
  return cached('markets:' + limit, 90e3, async () => {
    try {
      return await geckoMarkets(limit);
    } catch (err) {
      const res = await getTickers(POPULAR);
      const data = res.data.map((t) => ({
        id: t.symbol,
        symbol: t.symbol.replace(/(USDT|USDC|BUSD|FDUSD)$/, ''),
        name: NAMES[t.symbol.replace(/(USDT|USDC|BUSD|FDUSD)$/, '')] || t.symbol,
        price: t.last,
        change24h: t.changePct,
        marketCap: 0,
        marketCapRank: 0,
        volume: t.quoteVolume,
        high24h: t.high,
        low24h: t.low
      }));
      return data;
    }
  });
}

async function getGlobal() {
  return cached('global', 180e3, async () => {
    const json = await getJson('https://api.coingecko.com/api/v3/global', { timeout: 12000 });
    const d = (json && json.data) || {};
    return {
      totalMarketCap: num(d.total_market_cap && d.total_market_cap.usd),
      totalVolume: num(d.total_volume && d.total_volume.usd),
      btcDominance: num(d.market_cap_percentage && d.market_cap_percentage.btc),
      ethDominance: num(d.market_cap_percentage && d.market_cap_percentage.eth),
      marketCapChange24h: num(d.market_cap_change_percentage_24h_usd),
      activeCoins: num(d.active_cryptocurrencies)
    };
  });
}

/* ------------------------------------------------------------------ *
 *  API
 * ------------------------------------------------------------------ */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

async function handleApi(url, res) {
  const route = url.pathname.replace(/\/+$/, '');

  if (route === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      version: APP_VERSION,
      node: process.version,
      uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
      preferredProvider: preferred,
      cacheEntries: store.size
    });
    return;
  }

  if (route === '/api/symbols') {
    sendJson(res, 200, {
      symbols: POPULAR.map((symbol) => {
        const base = symbol.replace(/(USDT|USDC|BUSD|FDUSD)$/, '');
        return { symbol, label: pairLabel(symbol), base, name: NAMES[base] || base };
      })
    });
    return;
  }

  if (route === '/api/tickers') {
    const raw = url.searchParams.get('symbols') || '';
    let symbols = raw.split(',').map(normalizeSymbol).filter(Boolean);
    if (!symbols.length) symbols = POPULAR.slice(0, 24);
    symbols = Array.from(new Set(symbols)).slice(0, 60);
    const result = await getTickers(symbols);
    sendJson(res, 200, {
      source: result.cache === 'stale' ? 'stale' : (result.value.source || 'unknown'),
      cache: result.cache,
      ts: result.ts,
      tickers: result.value.data
    });
    return;
  }

  if (route === '/api/klines') {
    const symbol = normalizeSymbol(url.searchParams.get('symbol'));
    if (!symbol || symbol.length < 5) {
      sendJson(res, 400, { error: 'نماد نامعتبر است' });
      return;
    }
    const interval = url.searchParams.get('interval') || '1h';
    if (!INTERVALS[interval]) {
      sendJson(res, 400, { error: 'تایم‌فریم نامعتبر است' });
      return;
    }
    const limit = Number(url.searchParams.get('limit')) || 300;
    const safeLimit = Math.min(1000, Math.max(20, limit));
    const result = await getKlines(symbol, interval, safeLimit);
    const candles = result.value.data;
    const source = result.value.source || 'unknown';
    sendJson(res, 200, {
      symbol,
      interval,
      limit: safeLimit,
      source,
      cache: result.cache,
      stale: result.cache === 'stale',
      ts: result.ts,
      candles: candles.map((c) => [c[0], c[1], c[2], c[3], c[4], c[5]])
    });
    return;
  }

  if (route === '/api/markets') {
    const limit = Math.min(100, Math.max(5, Number(url.searchParams.get('limit')) || 25));
    const result = await getMarkets(limit);
    sendJson(res, 200, {
      cache: result.cache,
      ts: result.ts,
      coins: result.value
    });
    return;
  }

  if (route === '/api/global') {
    const result = await getGlobal();
    sendJson(res, 200, Object.assign({ cache: result.cache, ts: result.ts }, result.value));
    return;
  }

  sendJson(res, 404, { error: 'API route not found' });
}

/* ------------------------------------------------------------------ *
 *  فایل‌های استاتیک
 * ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(pathname, res) {
  const decoded = decodeURIComponent(pathname.split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const target = path.join(PUBLIC_DIR, relative);

  if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== path.join(PUBLIC_DIR, 'index.html')) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.stat(target, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const ext = path.extname(target).toLowerCase();
    const isHtml = ext === '.html';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'SAMEORIGIN'
    });

    if (isHtml) {
      res.end(fs.readFileSync(target));
      return;
    }
    fs.createReadStream(target).pipe(res);
  });
}

/* ------------------------------------------------------------------ *
 *  سرور
 * ------------------------------------------------------------------ */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    handleApi(url, res).catch((err) => {
      log('API error:', req.url, String((err && err.message) || err));
      sendJson(res, 502, { error: 'دریافت داده از منابع بازار ناموفق بود', detail: String((err && err.message) || err) });
    });
    return;
  }

  serveStatic(url.pathname, res);
});

server.listen(PORT, HOST, () => {
  log('CryptoDesk v' + APP_VERSION + ' listening on http://' + HOST + ':' + PORT);
  log('providers:', providers.map((p) => p.name).join(' -> '), '| preferred:', preferred);
});

server.on('error', (err) => {
  log('server error:', err.message);
  if (err.code === 'EADDRINUSE') process.exit(1);
});




