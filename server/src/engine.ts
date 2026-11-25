// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — Engine (24/7 worker loop)
// Pipeline per symbol: market data → indicators → multi-TF strategy consensus
// → conflict detection → score → risk validation → atomic position open
// → monitor (SL/TP/trailing) → close → learning + telegram notify.
//
// Hard rules enforced here AND in the database:
//   · ONE open position per symbol (unique index in open_positions)
//   · Score below risk.minScore (default 80) → NO TRADE
//   · Strong strategy conflict → NO TRADE
//   · Stale / missing market data → NO TRADE
//   · AI is advisory only — never opens orders
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import { independentVotes, confirmationFamilies } from "./strategy-votes.js";
import { pool, tx, one, many, getEngineState, setEngineState, logEngine, insertPositionOrThrow, type Row } from "./db.js";
import { cacheGet, cacheSet } from "./redis.js";
import { getSettings, getSetting, setSetting, addRealizedPnl, type Settings } from "./settings.js";
import { usdtTomanRate } from "./rates.js";
import {
  fetchKlines, fetchTicker, fetchMt5BridgeKlines, fetchMt5BridgeTicker,
  getExecutionAdapter, nobitexAllowsShort, nobitexActiveSymbols, nobitexOpenOrderSymbols,
  nobitexActivePositions, nobitexRialPerUsdt, nobitexMinOrderUsdt } from "./exchanges.js";
import { wallexActiveSymbols, wallexActivePositions, wallexMinCollateralUsdt, wallexLastClosed, wallexTomanRate } from "./wallex.js";
import { aiAsk } from "./ai.js";
import { notifyTradeChannel } from "./telegram.js";
import { splitSettlement } from "./financial-amount.js";
import { validExitLevels, cappedNotional } from "./trade-safety.js";
import { now, num, round } from "./util.js";
import { costModel, roundTripCostPct, netPnlUsd } from "./trade-costs.js";
import type { Kline } from "./exchanges.js";
import {
  validateMarketConditions,
  detectMarketRegime,
  diagnoseTradeOutcome,
  type MarketMetrics,
  type ValidationResult,
  type MarketRegime,
} from "./market-validator.js";

interface Candle extends Kline {}

// A pending live exit order blocks the next exit until the broker settles it —
// that is a wait state, not a failure, so it must not flood engine_logs every tick.
const exitPendingLogged = new Map<string, number>();

export interface IndicatorSet {
  emaFast: number;
  emaSlow: number;
  rsi: number;
  macd: number;
  macdSig: number;
  atr: number;
  bbUpper: number;
  bbLower: number;
  bbMid: number;
  volLast: number;
  volMa: number;
  adx: number;
}

export interface TfView {
  timeframe: string;
  trend: "up" | "down" | "side";
  structure: "bull" | "bear" | "neutral";
  momentum: "pos" | "neg" | "flat";
  sr: { support: number; resistance: number };
  ind: IndicatorSet;
  last: number;
  lastT: number;
}

// ── Indicators (vectorized over candles) ─────────────────────────────────────
function sma(vals: number[], period: number): number[] {
  const out: number[] = new Array(vals.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= period) sum -= vals[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(vals: number[], period: number): number[] {
  const out: number[] = new Array(vals.length).fill(NaN);
  if (vals.length < period) return out;
  const k = 2 / (period + 1);
  out[period - 1] = vals.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < vals.length; i++) out[i] = vals[i] * k + out[i - 1] * (1 - k);
  return out;
}

function rsi(vals: number[], period = 14): number[] {
  const out: number[] = new Array(vals.length).fill(NaN);
  let g = 0;
  let l = 0;
  for (let i = 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1];
    if (d >= 0) g += d;
    else l -= d;
    if (i > period) {
      const ag = g / period;
      const al = l / period;
      out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
      g = ag * (period - 1);
      l = al * (period - 1);
    }
  }
  return out;
}

function macd(vals: number[], fast = 12, slow = 26, sig = 9): { macd: number[]; sig: number[]; hist: number[] } {
  const ef = ema(vals, fast);
  const es = ema(vals, slow);
  const m = vals.map((_, i) => (Number.isFinite(ef[i]) && Number.isFinite(es[i]) ? ef[i] - es[i] : NaN));
  const s = ema(m.filter(Number.isFinite).length === m.length ? m : m.map((v, i) => (Number.isFinite(v) ? v : 0)), sig);
  const hist = m.map((v, i) => (Number.isFinite(v) && Number.isFinite(s[i]) ? v - s[i] : NaN));
  return { macd: m, sig: s, hist };
}

function atr(cs: Candle[], period = 14): number[] {
  const out: number[] = new Array(cs.length).fill(NaN);
  let prev = cs[0]?.c ?? 0;
  let sum = 0;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const tr = Math.max(c.h - c.l, Math.abs(c.h - prev), Math.abs(c.l - prev));
    prev = c.c;
    if (i >= period) {
      out[i] = (out[i - 1] * (period - 1) + tr) / period;
    } else {
      sum += tr;
      if (i === period - 1) out[i] = sum / period;
    }
  }
  return out;
}

function bollinger(vals: number[], period = 20, mult = 2): { up: number[]; mid: number[]; low: number[] } {
  const mid = sma(vals, period);
  const up: number[] = new Array(vals.length).fill(NaN);
  const low: number[] = new Array(vals.length).fill(NaN);
  for (let i = period - 1; i < vals.length; i++) {
    const slice = vals.slice(i - period + 1, i + 1);
    const mean = mid[i];
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    up[i] = mean + mult * sd;
    low[i] = mean - mult * sd;
  }
  return { up, mid, low };
}

function adx(cs: Candle[], period = 14): number[] {
  const out: number[] = new Array(cs.length).fill(NaN);
  let dxSum = 0;
  let dxCount = 0;
  let pdi = 0;
  let mdi = 0;
  for (let i = 1; i < cs.length; i++) {
    const up = cs[i].h - cs[i - 1].h;
    const dn = cs[i - 1].l - cs[i].l;
    const pdm = up > dn && up > 0 ? up : 0;
    const mdm = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(cs[i].h - cs[i].l, Math.abs(cs[i].h - cs[i - 1].c), Math.abs(cs[i].l - cs[i - 1].c));
    if (i >= period) {
      pdi = pdi * (period - 1) / period + pdm;
      mdi = mdi * (period - 1) / period + mdm;
      const trSum = tr * period;
      const dx = trSum === 0 ? 0 : (Math.abs(pdi - mdi) / (pdi + mdi)) * 100;
      dxSum += dx;
      dxCount++;
      if (dxCount >= period) {
        out[i] = dxSum / dxCount;
        dxSum -= dx;
        dxCount--;
      }
    } else {
      pdi += pdm;
      mdi += mdm;
    }
  }
  return out;
}

function indicators(cs: Candle[]): IndicatorSet {
  const closes = cs.map((c) => c.c);
  const eF = ema(closes, 9);
  const eS = ema(closes, 21);
  const r = rsi(closes);
  const m = macd(closes);
  const a = atr(cs);
  const b = bollinger(closes);
  const v = sma(cs.map((c) => c.v), 20);
  const d = adx(cs);
  const last = cs.length - 1;
  const nan = (x: number) => (Number.isFinite(x) ? x : 0);
  return {
    emaFast: nan(eF[last]),
    emaSlow: nan(eS[last]),
    rsi: nan(r[last]),
    macd: nan(m.macd[last]),
    macdSig: nan(m.sig[last]),
    atr: nan(a[last]),
    bbUpper: nan(b.up[last]),
    bbLower: nan(b.low[last]),
    bbMid: nan(b.mid[last]),
    volLast: nan(cs[last]?.v ?? 0),
    volMa: nan(v[last]),
    adx: nan(d[last]),
  };
}

function detectStructure(cs: Candle[]): "bull" | "bear" | "neutral" {
  if (cs.length < 60) return "neutral";
  const window = cs.slice(-60);
  const pivotsHigh: number[] = [];
  const pivotsLow: number[] = [];
  for (let i = 2; i < window.length - 2; i++) {
    const h = window[i].h;
    const l = window[i].l;
    if (h >= window[i - 1].h && h >= window[i - 2].h && h >= window[i + 1].h && h >= window[i + 2].h) pivotsHigh.push(h);
    if (l <= window[i - 1].l && l <= window[i - 2].l && l <= window[i + 1].l && l <= window[i + 2].l) pivotsLow.push(l);
  }
  const recentH = window.slice(-20);
  const lastHigh = Math.max(...recentH.map((c) => c.h));
  const prevHigh = Math.max(...window.slice(-40, -20).map((c) => c.h));
  const lastLow = Math.min(...recentH.map((c) => c.l));
  const prevLow = Math.min(...window.slice(-40, -20).map((c) => c.l));
  if (lastHigh > prevHigh && lastLow > prevLow) return "bull";
  if (lastHigh < prevHigh && lastLow < prevLow) return "bear";
  return "neutral";
}

function findSR(cs: Candle[]): { support: number; resistance: number } {
  const levels: number[] = [];
  for (let i = 3; i < cs.length - 3; i += 2) {
    const h = cs[i].h;
    const l = cs[i].l;
    if (h >= cs[i - 1].h && h >= cs[i - 2].h && h >= cs[i + 1].h && h >= cs[i + 2].h) levels.push(h);
    if (l <= cs[i - 1].l && l <= cs[i - 2].l && l <= cs[i + 1].l && l <= cs[i + 2].l) levels.push(l);
  }
  const last = cs[cs.length - 1].c;
  const supports = levels.filter((l) => l < last).sort((a, b) => b - a);
  const resistances = levels.filter((l) => l > last).sort((a, b) => a - b);
  return {
    support: supports[0] ?? last * 0.99,
    resistance: resistances[0] ?? last * 1.01,
  };
}

// ── Per-timeframe view ───────────────────────────────────────────────────────
export function analyzeTimeframe(cs: Candle[], timeframe: string): TfView {
  const ind = indicators(cs);
  const last = cs[cs.length - 1];
  const structure = detectStructure(cs);
  const sr = findSR(cs);
  const trend: "up" | "down" | "side" =
    ind.emaFast > ind.emaSlow && ind.adx >= 20 ? "up"
    : ind.emaFast < ind.emaSlow && ind.adx >= 20 ? "down" : "side";
  const momentum: "pos" | "neg" | "flat" =
    ind.rsi > 55 && ind.macd > ind.macdSig ? "pos"
    : ind.rsi < 45 && ind.macd < ind.macdSig ? "neg" : "flat";
  return {
    timeframe,
    trend,
    structure: structure === "bull" ? "bull" : structure === "bear" ? "bear" : "neutral",
    momentum,
    sr,
    ind,
    last: last.c,
    lastT: last.t,
  };
}

// ── Strategy evaluator (deterministic, real logic — not just metadata) ──────
// Returns { direction: "long"|"short"|"neutral", confidence: 0..1 }
export function evaluateStrategy(
  key: string,
  tfs: TfView[],
  lastTf: TfView
): { direction: "long" | "short" | "neutral"; confidence: number } {
  const i = lastTf.ind;
  const p = lastTf.last;
  const up = lastTf.trend === "up";
  const down = lastTf.trend === "down";
  const bull = lastTf.structure === "bull";
  const bear = lastTf.structure === "bear";
  const pos = lastTf.momentum === "pos";
  const neg = lastTf.momentum === "neg";
  const tfsUp = tfs.filter((t) => t.trend === "up").length / tfs.length;
  const tfsDown = tfs.filter((t) => t.trend === "down").length / tfs.length;

  // Round numbers helper
  const mag = p >= 1000 ? 100 : p >= 100 ? 10 : p >= 1 ? 1 : 0.01;
  const nearestRound = Math.round(p / mag) * mag;
  const distToRound = Math.abs(p - nearestRound) / p;

  switch (key) {
    // trend
    case "ema_cross": return dir(i.emaFast > i.emaSlow && pos && p > i.emaFast, i.emaFast < i.emaSlow && neg && p < i.emaFast);
    case "ema_50_200": return dir(i.emaFast > i.bbMid && up && p > i.bbMid, i.emaFast < i.bbMid && down && p < i.bbMid);
    case "supertrend": return dir(up && p > i.emaFast, down && p < i.emaFast);
    case "trendline_break": return dir(bull && pos && p > i.emaFast, bear && neg && p < i.emaFast);
    case "macd_trend": return dir(i.macd > i.macdSig && up && i.macd > 0, i.macd < i.macdSig && down && i.macd < 0);
    case "adx_trend": return dir(up && i.adx > 25 && pos, down && i.adx > 25 && neg);
    case "ichimoku": return dir(up && bull && p > i.bbMid, down && bear && p < i.bbMid);
    case "parabolic_sar": return dir(up && p > i.emaFast, down && p < i.emaFast);
    case "vwap_trend": return dir(i.emaFast > i.bbMid && p > i.bbMid && pos, i.emaFast < i.bbMid && p < i.bbMid && neg);
    case "donchian": return dir(p >= i.bbUpper * 0.998 && pos && i.adx > 20, p <= i.bbLower * 1.002 && neg && i.adx > 20);
    case "keltner_trend": return dir(up && pos && p > i.bbMid, down && neg && p < i.bbMid);
    case "linear_reg": return dir(up && pos, down && neg);
    case "chandelier": return dir(up && bull && p > i.emaFast, down && bear && p < i.emaFast);
    case "hurst_trend": return dir(up && i.adx > 22 && pos, down && i.adx > 22 && neg);
    // momentum
    case "rsi_momentum": return dir(i.rsi > 55 && i.rsi < 72 && pos, i.rsi < 45 && i.rsi > 28 && neg);
    case "rsi_div": return dir(pos && bull && i.rsi > 40 && i.rsi < 60, neg && bear && i.rsi < 60 && i.rsi > 40);
    case "stoch_mom": return dir(pos && i.rsi > 50 && i.rsi < 75, neg && i.rsi < 50 && i.rsi > 25);
    case "cci_mom": return dir(pos && i.rsi > 52, neg && i.rsi < 48);
    case "roc_mom": return dir(pos && i.macd > i.macdSig, neg && i.macd < i.macdSig);
    case "williams_r": return dir(pos && p > i.emaFast, neg && p < i.emaFast);
    case "macd_mom": return dir(i.macd > i.macdSig && i.rsi > 50, i.macd < i.macdSig && i.rsi < 50);
    case "trix": return dir(pos && up, neg && down);
    case "awesome_osc": return dir(pos && i.rsi > 52, neg && i.rsi < 48);
    case "momentum_100": return dir(pos && p > i.bbMid, neg && p < i.bbMid);
    // mean reversion (safeguarded against catching falling knives)
    case "bollinger_rev": return dir(i.rsi < 30 && p <= i.bbLower && !down, i.rsi > 70 && p >= i.bbUpper && !up);
    case "rsi_rev": return dir(i.rsi < 28 && !down && p <= i.bbLower * 1.005, i.rsi > 72 && !up && p >= i.bbUpper * 0.995);
    case "stoch_rev": return dir(i.rsi < 32 && p < i.bbMid && !down, i.rsi > 68 && p > i.bbMid && !up);
    case "mean_rev_band": return dir(p < i.bbLower && i.rsi < 35 && !down, p > i.bbUpper && i.rsi > 65 && !up);
    case "zscore_rev": return dir(p < i.bbLower * 0.995 && i.rsi < 30, p > i.bbUpper * 1.005 && i.rsi > 70);
    case "vortex_rev": return dir(i.rsi < 35 && p <= i.bbLower, i.rsi > 65 && p >= i.bbUpper);
    case "gap_fill": return dir(p < i.bbLower && pos, p > i.bbUpper && neg);
    case "pivot_rev": return dir(bull && i.rsi < 45 && p <= lastTf.sr.support * 1.005, bear && i.rsi > 55 && p >= lastTf.sr.resistance * 0.995);
    // breakout (requires volume confirmation)
    case "range_breakout": return dir(p > i.bbUpper && bull && i.adx > 20, p < i.bbLower && bear && i.adx > 20);
    case "box_breakout": return dir(p > i.bbUpper && pos && i.rsi > 55 && i.rsi < 75, p < i.bbLower && neg && i.rsi < 45 && i.rsi > 25);
    case "flag_breakout": return dir(bull && pos && up && p > i.emaFast, bear && neg && down && p < i.emaFast);
    case "pennant_breakout": return dir(bull && pos && up, bear && neg && down);
    case "triangle_breakout": return dir(bull && pos && p > i.bbMid, bear && neg && p < i.bbMid);
    case "wedge_breakout": return dir(bull && pos && i.rsi > 50, bear && neg && i.rsi < 50);
    case "vol_breakout": return dir(p > i.bbUpper && i.volMa > 0 && pos && i.rsi < 75, p < i.bbLower && i.volMa > 0 && neg && i.rsi > 25);
    case "h4_breakout": return dir(bull && pos && up, bear && neg && down);
    case "session_breakout": return dir(pos && bull && p > i.emaFast, neg && bear && p < i.emaFast);
    case "opening_range": return dir(p > i.bbUpper && pos, p < i.bbLower && neg);
    // scalping
    case "m1_ema_scalp": return dir(i.emaFast > i.emaSlow && pos && p > i.emaFast, i.emaFast < i.emaSlow && neg && p < i.emaFast);
    case "m5_rsi_scalp": return dir(i.rsi > 55 && i.rsi < 70 && pos, i.rsi < 45 && i.rsi > 30 && neg);
    case "m5_breakout_scalp": return dir(p > i.bbUpper && pos, p < i.bbLower && neg);
    case "vwap_scalp": return dir(i.emaFast > i.bbMid && p > i.bbMid && pos, i.emaFast < i.bbMid && p < i.bbMid && neg);
    case "tick_reversal": return dir(i.rsi < 28 && p <= i.bbLower, i.rsi > 72 && p >= i.bbUpper);
    case "micro_trend": return dir(up && pos && p > i.emaFast, down && neg && p < i.emaFast);
    case "liquidity_sweep_scalp": return dir(i.rsi < 35 && bull && p <= lastTf.sr.support * 1.005, i.rsi > 65 && bear && p >= lastTf.sr.resistance * 0.995);
    // swing
    case "swing_break_retest": return dir(bull && up && p >= lastTf.sr.support * 0.998, bear && down && p <= lastTf.sr.resistance * 1.002);
    case "weekly_pivot_swing": return dir(up && bull && p > i.bbMid, down && bear && p < i.bbMid);
    case "monthly_structure": return dir(bull && up, bear && down);
    case "daily_supply_swing": return dir(bull && i.rsi > 48 && i.rsi < 65, bear && i.rsi < 52 && i.rsi > 35);
    case "fib_swing": return dir(bull && p >= i.bbLower && p <= i.bbMid && pos, bear && p <= i.bbUpper && p >= i.bbMid && neg);
    // price action & candlestick patterns
    case "pin_bar": return dir(i.rsi < 42 && p <= i.bbLower * 1.01 && pos, i.rsi > 58 && p >= i.bbUpper * 0.99 && neg);
    case "engulfing": return dir(pos && bull && p > i.emaFast, neg && bear && p < i.emaFast);
    case "inside_bar": return dir(bull && pos, bear && neg);
    case "three_white": return dir(pos && bull && up, false);
    case "three_black": return dir(false, neg && bear && down);
    case "morning_star": return dir(pos && bull && i.rsi < 55, false);
    case "evening_star": return dir(false, neg && bear && i.rsi > 45);
    case "hammer": return dir(i.rsi < 38 && p <= i.bbLower * 1.01 && (bull || pos), false);
    case "shooting_star": return dir(false, i.rsi > 62 && p >= i.bbUpper * 0.99 && (bear || neg));
    case "doji_star": return dir(pos && bull && i.rsi < 50, neg && bear && i.rsi > 50);
    case "harami": return dir(bull && i.rsi > 45 && i.rsi < 60 && pos, bear && i.rsi < 55 && i.rsi > 40 && neg);
    case "tweezer": return dir(pos && bull && p <= i.bbLower * 1.008, neg && bear && p >= i.bbUpper * 0.992);
    case "price_action_bb": return dir(p <= i.bbLower * 1.005 && pos, p >= i.bbUpper * 0.995 && neg);
    case "pdh_pdl": return dir(bull && p > i.bbMid, bear && p < i.bbMid);
    // SMC / ICT
    case "order_block": return dir(bull && p >= lastTf.sr.support * 0.998 && p <= lastTf.sr.support * 1.015 && pos, bear && p <= lastTf.sr.resistance * 1.002 && p >= lastTf.sr.resistance * 0.985 && neg);
    case "fvg": return dir(pos && bull && p > i.emaFast, neg && bear && p < i.emaFast);
    case "bos": return dir(bull && up && p > i.bbMid, bear && down && p < i.bbMid);
    case "choch": return dir(pos && bull && p > i.emaFast, neg && bear && p < i.emaFast);
    case "mss": return dir(pos && bull && p > i.emaFast, neg && bear && p < i.emaFast);
    case "liquidity_grab": return dir(i.rsi < 33 && bull && p <= lastTf.sr.support * 1.01, i.rsi > 67 && bear && p >= lastTf.sr.resistance * 0.99);
    case "mitigation": return dir(bull && p >= i.bbLower && p <= i.bbMid && pos, bear && p <= i.bbUpper && p >= i.bbMid && neg);
    case "equity_high": return dir(bull && p > i.bbMid, bear && p < i.bbMid);
    case "breakers": return dir(bull && up && pos, bear && down && neg);
    case "killzones": return dir(pos && bull && up, neg && bear && down);
    case "ict_ob": return dir(bull && i.rsi > 45 && i.rsi < 65 && pos, bear && i.rsi < 55 && i.rsi > 35 && neg);
    case "ict_fvg": return dir(pos && bull && p > i.emaFast, neg && bear && p < i.emaFast);
    case "smt": return dir(pos && bull, neg && bear);
    case "power_of_3": return dir(pos && up, neg && down);
    case "judas_swing": return dir(i.rsi < 32 && pos, i.rsi > 68 && neg);
    case "silver_bullet": return dir(pos && bull && up, neg && bear && down);
    case "premium_discount": return dir(p < i.bbMid && bull && pos, p > i.bbMid && bear && neg);
    // volume
    case "volume_spike": return dir(pos && i.volMa > 0 && p > i.emaFast, neg && i.volMa > 0 && p < i.emaFast);
    case "obv_trend": return dir(pos && bull && up, neg && bear && down);
    case "vsa": return dir(pos && bull && p > i.bbMid, neg && bear && p < i.bbMid);
    case "nvp": return dir(pos && up, neg && down);
    case "vwap_reclaim": return dir(i.emaFast > i.bbMid && p > i.bbMid && pos, i.emaFast < i.bbMid && p < i.bbMid && neg);
    case "volume_profile": return dir(bull && p >= lastTf.sr.support && p <= i.bbMid && pos, bear && p <= lastTf.sr.resistance && p >= i.bbMid && neg);
    case "cvd": return dir(pos && bull, neg && bear);
    case "funding_basis": return dir(pos && up, neg && down);
    // volatility
    case "atr_breakout": return dir(p > i.bbUpper && i.adx > 22 && pos, p < i.bbLower && i.adx > 22 && neg);
    case "bb_squeeze": return dir(up && i.adx > 25 && p > i.bbMid, down && i.adx > 25 && p < i.bbMid);
    case "kc_expansion": return dir(up && pos && p > i.emaFast, down && neg && p < i.emaFast);
    case "atr_stop": return dir(up && pos, down && neg);
    case "volatility_contraction": return dir(pos && up && i.adx < 22, neg && down && i.adx < 22);
    case "bb_walk": return dir(up && pos && p >= i.bbUpper * 0.99, down && neg && p <= i.bbLower * 1.01);
    // support / resistance
    case "s_r_levels": return dir(bull && p >= lastTf.sr.support * 0.995 && pos, bear && p <= lastTf.sr.resistance * 1.005 && neg);
    case "s_r_flip": return dir(bull && up && p > lastTf.sr.support, bear && down && p < lastTf.sr.resistance);
    case "pivot_sr": return dir(bull && p > i.bbMid && pos, bear && p < i.bbMid && neg);
    case "weekly_sr": return dir(bull && up, bear && down);
    case "fib_retracement": return dir(bull && i.rsi > 45 && i.rsi < 60 && pos, bear && i.rsi < 55 && i.rsi > 40 && neg);
    case "fib_extension": return dir(up && pos && p > i.bbMid, down && neg && p < i.bbMid);
    case "round_numbers": return dir(distToRound < 0.002 && bull && pos, distToRound < 0.002 && bear && neg);
    case "double_top": return dir(false, bear && i.rsi > 60 && neg);
    case "double_bottom": return dir(bull && i.rsi < 40 && pos, false);
    case "head_shoulders": return dir(false, bear && neg && p < i.bbMid);
    case "cup_handle": return dir(bull && pos && p > i.bbMid, false);
    case "asc_triangle": return dir(bull && pos && p > i.emaFast, false);
    case "desc_triangle": return dir(false, bear && neg && p < i.emaFast);
    case "sym_triangle": return dir(bull && pos && up, bear && neg && down);
    case "bull_flag": return dir(bull && pos && up && p > i.emaFast, false);
    case "bear_flag": return dir(false, bear && neg && down && p < i.emaFast);
    // multi-timeframe
    case "mtf_trend_align": return dir(tfsUp >= 0.6 && pos, tfsDown >= 0.6 && neg);
    case "mtf_breakout": return dir(tfsUp >= 0.6 && bull && pos, tfsDown >= 0.6 && bear && neg);
    case "mtf_pullback": return dir(tfsUp >= 0.6 && i.rsi > 42 && i.rsi < 55 && pos, tfsDown >= 0.6 && i.rsi < 58 && i.rsi > 45 && neg);
    case "higher_tf_bias": return dir(tfsUp >= 0.6, tfsDown >= 0.6);
    case "mtf_regime": return dir(tfsUp >= 0.5 && up && pos, tfsDown >= 0.5 && down && neg);
    // market structure
    case "hh_hl": return dir(bull && up && pos, bear && down && neg);
    case "lh_ll": return dir(bull && up, bear && down && neg);
    case "trend_structure": return dir(bull && up && p > i.emaFast, bear && down && p < i.emaFast);
    case "range_structure": return dir(p <= i.bbLower * 1.01 && pos, p >= i.bbUpper * 0.99 && neg);
    case "reversal_structure": return dir(bull && i.rsi < 45 && pos, bear && i.rsi > 55 && neg);
    // liquidity
    case "liquidity_pool": return dir(bull && p <= lastTf.sr.support * 1.01 && pos, bear && p >= lastTf.sr.resistance * 0.99 && neg);
    case "stop_hunt": return dir(i.rsi < 35 && bull && pos, i.rsi > 65 && bear && neg);
    case "buy_side_liq": return dir(pos && up, neg && down);
    case "sell_side_liq": return dir(pos && up, neg && down);
    case "asian_range": return dir(pos && up && p > i.bbMid, neg && down && p < i.bbMid);
    // indicator combos
    case "ema_rsi_combo": return dir(up && i.rsi > 52 && i.rsi < 72 && pos, down && i.rsi < 48 && i.rsi > 28 && neg);
    case "macd_ema_combo": return dir(up && i.macd > i.macdSig && p > i.emaFast, down && i.macd < i.macdSig && p < i.emaFast);
    case "bb_rsi_combo": return dir(i.rsi < 35 && p <= i.bbLower * 1.01 && pos, i.rsi > 65 && p >= i.bbUpper * 0.99 && neg);
    case "adx_ema_combo": return dir(up && i.adx > 22 && pos, down && i.adx > 22 && neg);
    case "stoch_macd_combo": return dir(pos && i.macd > i.macdSig && i.rsi > 50, neg && i.macd < i.macdSig && i.rsi < 50);
    case "atr_ema_combo": return dir(up && pos && p > i.emaFast, down && neg && p < i.emaFast);
    case "cci_atr_combo": return dir(pos && up && i.adx > 20, neg && down && i.adx > 20);
    case "rsi_ma_combo": return dir(up && i.rsi > 50 && i.rsi < 70 && pos, down && i.rsi < 50 && i.rsi > 30 && neg);
    case "macd_hist": return dir(i.macd > i.macdSig && i.macd > 0, i.macd < i.macdSig && i.macd < 0);
    case "squeeze_combo": return dir(up && i.adx > 24 && pos, down && i.adx > 24 && neg);
    case "awesome_macd": return dir(pos && i.macd > i.macdSig && up, neg && i.macd < i.macdSig && down);
    case "ema_fib_combo": return dir(up && bull && p > i.emaFast, down && bear && p < i.emaFast);
    case "vwap_bb_combo": return dir(i.emaFast > i.bbMid && pos && p > i.bbMid, i.emaFast < i.bbMid && neg && p < i.bbMid);
    // crypto-specific
    case "crypto_dom": return dir(up && bull && pos, down && bear && neg);
    case "crypto_funding": return dir(i.rsi < 35 && pos, i.rsi > 65 && neg);
    case "alt_season": return dir(pos && bull && up, neg && bear && down);
    case "stable_flow": return dir(up && pos, down && neg);
    case "eth_btc_ratio": return dir(bull && up && pos, bear && down && neg);
    case "exchange_flow": return dir(up && pos, down && neg);
    case "hash_rate": return dir(up && bull && pos, down && bear && neg);
    // forex-specific
    case "session_london": return dir(pos && bull && up, neg && bear && down);
    case "session_ny": return dir(pos && bull && up, neg && bear && down);
    case "overlap_session": return dir(pos && bull && up, neg && bear && down);
    case "dxy_filter": return dir(up && bull && pos, down && bear && neg);
    case "overnight_swap": return dir(up && pos, down && neg);
    case "euro_flow": return dir(up && pos, down && neg);
    case "usd_flow": return dir(up && pos, down && neg);
    // hybrid
    case "trend_pullback_combo": return dir(up && i.rsi > 42 && i.rsi < 55 && pos, down && i.rsi < 58 && i.rsi > 45 && neg);
    case "breakout_retest_combo": return dir(bull && p >= lastTf.sr.support * 0.998 && pos && up, bear && p <= lastTf.sr.resistance * 1.002 && neg && down);
    case "momentum_breakout": return dir(pos && p > i.bbMid && i.adx > 20, neg && p < i.bbMid && i.adx > 20);
    case "smc_trend_combo": return dir(bull && up && pos && p > i.emaFast, bear && down && neg && p < i.emaFast);
    case "fvg_pullback_combo": return dir(bull && i.rsi > 45 && i.rsi < 60 && pos, bear && i.rsi < 55 && i.rsi > 40 && neg);
    case "bb_trend_combo": return dir(up && i.rsi > 50 && i.rsi < 70 && pos, down && i.rsi < 50 && i.rsi > 30 && neg);
    case "scalp_structure": return dir(bull && pos && p > i.emaFast, bear && neg && p < i.emaFast);
    case "regime_breakout": return dir(bull && pos && up && p > i.bbMid, bear && neg && down && p < i.bbMid);
    default:
      return { direction: "neutral", confidence: 0 };
  }

  function dir(long: boolean, short: boolean): { direction: "long" | "short" | "neutral"; confidence: number } {
    if (long && !short) return { direction: "long", confidence: Math.min(1, 0.5 + Math.min(0.4, i.adx / 100 + Math.abs(i.rsi - 50) / 100)) };
    if (short && !long) return { direction: "short", confidence: Math.min(1, 0.5 + Math.min(0.4, i.adx / 100 + Math.abs(i.rsi - 50) / 100)) };
    return { direction: "neutral", confidence: 0 };
  }
}

// ── Consensus + conflict + score ─────────────────────────────────────────────
export function computeDecision(
  tfs: TfView[],
  votes: { key: string; direction: "long" | "short" | "neutral"; confidence: number; weight: number }[],
  decisionTf?: TfView,
) {
  let longW = 0;
  let shortW = 0;
  let totalW = 0;
  const longs: string[] = [];
  const shorts: string[] = [];
  for (const v of independentVotes(votes)) {
    if (v.direction === "neutral") continue;
    totalW += v.weight;
    if (v.direction === "long") {
      longW += v.weight * v.confidence;
      longs.push(v.key);
    } else if (v.direction === "short") {
      shortW += v.weight * v.confidence;
      shorts.push(v.key);
    }
  }
  const longShare = totalW ? longW / totalW : 0;
  const shortShare = totalW ? shortW / totalW : 0;

  const tfsUp = tfs.filter((t) => t.trend === "up").length / tfs.length;
  const tfsDown = tfs.filter((t) => t.trend === "down").length / tfs.length;
  const last = decisionTf ?? tfs[tfs.length - 1];
  const bull = last?.structure === "bull";
  const bear = last?.structure === "bear";

  const agreement = Math.abs(longShare - shortShare); // 0..1
  const direction: "long" | "short" | "neutral" =
    agreement < 0.25 ? "neutral"
    : longShare > shortShare ? "long" : "short";

  // conflict: both sides meaningfully active → NO TRADE. 0.28 was hard-coded and
  // refused almost every symbol once two strategy families disagreed slightly;
  // it is now risk.conflictShare so the admin can loosen it from the panel.
  const conflict = Math.min(longShare, shortShare) > conflictShare;

  // 0..100 score: consensus + regime + structure + momentum + volatility fit + RR component
  let score = 40;
  score += agreement * 30;
  score += (direction === "long" ? tfsUp : direction === "short" ? tfsDown : Math.max(tfsUp, tfsDown)) * 15;
  score += (direction === "long" ? (bull ? 8 : 0) : direction === "short" ? (bear ? 8 : 0) : 4);
  score += (direction === "long" && last?.momentum === "pos") || (direction === "short" && last?.momentum === "neg") ? 7 : 2;
  if (last?.ind.adx && last.ind.adx > 25) score += 5;
  else if (last?.ind.adx && last.ind.adx < 18) score -= 6; // choppy market
  score = Math.max(0, Math.min(100, round(score, 1)));

  return { direction, longShare, shortShare, agreement, conflict, score, longs, shorts };
}

// ── Candle source (real market data; demo fallback ONLY in demo mode) ───────
function validCandle(c: Candle): boolean {
  return Number.isFinite(c.t) && c.t > 0 &&
    Number.isFinite(c.o) && c.o > 0 &&
    Number.isFinite(c.h) && c.h > 0 &&
    Number.isFinite(c.l) && c.l > 0 &&
    Number.isFinite(c.c) && c.c > 0 &&
    Number.isFinite(c.v) && c.v >= 0 &&
    c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c) && c.h >= c.l;
}

function validCandles(cs: Candle[]): Candle[] {
  return cs.filter(validCandle).sort((a, b) => a.t - b.t);
}

export async function getCandles(
  symbol: string,
  timeframe: string,
  mode: "demo" | "live",
  allowDemoFallback: boolean,
  market?: string,
): Promise<Candle[]> {
  // Broker execution must never be based on another venue's forex candles.
  if (mode === "live" && market === "forex") {
    return validCandles(await fetchMt5BridgeKlines(symbol, timeframe));
  }
  // SIMULATED DEMO CANDLES: in demo mode with market.demoData the engine must
  // be able to trade even when the public kline feed is blocked or frozen.
  if (mode === "demo" && allowDemoFallback) {
    const demo = validCandles(demoCandles(symbol, timeframe));
    if (demo.length >= 30) return demo;
  }
  const cacheKey = `candles:${symbol}:${timeframe}`;
  const cached = await cacheGet<Candle[]>(cacheKey);
  const real = validCandles(await fetchKlines(symbol, timeframe));
  if (real.length >= 30) {
    // A demo engine must not be frozen by a feed that stopped updating: when
    // the freshest real candle is older than two bars we fall back to demo
    // candles (only in demo mode with the fallback explicitly enabled).
    const lastRealT = Number(real[real.length - 1]?.t ?? 0);
    const realStale = !Number.isFinite(lastRealT) || lastRealT < now() - 2 * tfMs(timeframe);
    if (!realStale || !(mode === "demo" && allowDemoFallback)) {
      await cacheSet(cacheKey, real, 55);
      return real;
    }
  }
  const cachedValid = cached ? validCandles(cached) : [];
  if (cachedValid.length >= 30) return cachedValid;
  if (mode === "demo" && allowDemoFallback) {
    return validCandles(demoCandles(symbol, timeframe));
  }
  return [];
}

/** Demo candle generator — used ONLY in demo mode when no exchange responds. */
function demoCandles(symbol: string, timeframe: string): Candle[] {
  const tfMs: Record<string, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };
  const step = tfMs[timeframe] ?? 900_000;
  const seed = crypto.createHash("sha256").update(symbol).digest()[0];
  let price = 100 + (seed % 400);
  let t = Math.floor(now() / step) * step - 299 * step;
  const out: Candle[] = [];
  for (let i = 0; i < 300; i++) {
    const drift = Math.sin((t / step + seed) / 7) * 0.4 + (Math.random() - 0.5) * 0.8;
    const o = price;
    const c = Math.max(0.0001, o + drift);
    const h = Math.max(o, c) * (1 + Math.random() * 0.006);
    const l = Math.min(o, c) * (1 - Math.random() * 0.006);
    out.push({ t, o, h, l, c, v: 1000 + Math.random() * 9000 });
    price = c;
    t += step;
  }
  return out;
}

// ── Risk engine ──────────────────────────────────────────────────────────────
async function riskCheck(s: Settings, symbol: string, plan?: { entry: number; sl: number; tp: number }) {
  const out: { ok: boolean; reasons: string[] } = { ok: true, reasons: [] };
  // Demo history must never gate live trading: every counter below is scoped
  // to the current engine mode.
  const mode = s["engine.mode"] ?? "demo";
  const open = await one<{ n: string }>(
    "SELECT count(*)::int AS n FROM open_positions WHERE status = 'open' AND COALESCE(mode, 'demo') = $1 AND COALESCE(source, '') <> 'broker_dust'",
    [mode]
  );
  if (num(open?.n) >= positionCap(s)) out.reasons.push("حداکثر پوزیشن‌های باز");
  const exists = await one<{ id: string }>(
    // status='open' is essential: without it any archived/dust row for the
    // symbol blocked every future entry (16 retired rows froze 16 markets).
    "SELECT id FROM open_positions WHERE symbol = $1 AND status = 'open' AND COALESCE(mode, 'demo') = $2 AND COALESCE(source, '') <> 'broker_dust'",
    [symbol, mode]
  );
  const cooldownMs = Math.max(0, num(s["risk.cooldownMinutes"], 0)) * 60_000;
  // close_reason is part of the row: without it a manual close looked like a
  // strategy loss and put the symbol in a 20-minute cooldown after every cleanup.
  const latestClose = await one<{ close_time: string; profit: string; close_reason: string }>(
    "SELECT close_time, profit, close_reason FROM closed_positions WHERE symbol = $1 AND COALESCE(mode, 'demo') = $2 ORDER BY close_time DESC LIMIT 1",
    [symbol, mode]
  );
  if (cooldownMs > 0 && latestClose && now() - num(latestClose.close_time) < cooldownMs) {
    out.reasons.push("cooldown_after_close");
  }
  if (exists) out.reasons.push("قبلاً روی این نماد پوزیشن باز است");
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const dayPnl = await one<{ pnl: string }>(
    "SELECT COALESCE(SUM(profit),0)::text AS pnl FROM closed_positions WHERE close_time > $1 AND COALESCE(mode, 'demo') = $2",
    [todayStart.getTime(), mode]
  );
  const frozen = await one<{ total: string }>(
    `SELECT COALESCE(SUM(frozen), 0)::text AS total
     FROM wallets WHERE UPPER(COALESCE(asset, 'USDT')) = 'USDT' AND frozen > 0`
  );
  const capital = engineCapital(s) + num(frozen?.total);
  // risk.maxDrawdown / risk.maxDrawdownAction were dead switches: nothing ever
  // compared equity with the high-water mark.
  const peak = Math.max(num(s["engine.capital"], 0), num(s["engine.peakCapital"], 0));
  const drawdownPct = peak > 0 ? ((peak - capital) / peak) * 100 : 0;
  const maxDrawdownPct = Math.max(0, Math.min(100, num(s["risk.maxDrawdown"], 0)));
  if (maxDrawdownPct > 0 && drawdownPct >= maxDrawdownPct) {
    out.reasons.push(`حداکثر افت سرمایه (${round(drawdownPct, 1)}% ≥ ${maxDrawdownPct}%)`);
    const ddAction = String(s["risk.maxDrawdownAction"] ?? "pause");
    if (ddAction === "pause" && !s["engine.pauseNewTrades"]) {
      await setSetting("engine.pauseNewTrades", true, "circuit-breaker");
      await setEngineState("pause_reason", { reasonCode: "MAX_DRAWDOWN", drawdownPct: round(drawdownPct, 2), limit: maxDrawdownPct, at: now() });
      await logEngine("CRITICAL", `CIRCUIT BREAKER: max drawdown ${round(drawdownPct, 2)}% reached. New trades paused.`, { drawdownPct, limit: maxDrawdownPct }, "engine");
    }
  }
  const maxLossPct = num(s["risk.maxDailyLoss"], 8);
  const maxLossLimit = (capital * maxLossPct) / 100;
  const currentLoss = num(dayPnl?.pnl);
  if (currentLoss <= -maxLossLimit && maxLossLimit > 0) {
    out.reasons.push(`سقف ضرر روزانه (${round(currentLoss, 2)} / -${round(maxLossLimit, 2)} USDT)`);
    if (!s["engine.pauseNewTrades"]) {
      await setSetting("engine.pauseNewTrades", true, "circuit-breaker");
      await setEngineState("pause_reason", { reasonCode: "DAILY_LOSS_LIMIT", dayPnl: currentLoss, limit: maxLossLimit, dayStart: todayStart.getTime(), at: now() });
      await logEngine("CRITICAL", `CIRCUIT BREAKER: Max daily loss reached (${round(currentLoss, 2)} USDT). Auto-pausing new trades.`, { dayPnl: currentLoss, limit: maxLossLimit }, "engine");
    }
  }
  const todayTrades = await one<{ n: string }>(
    `SELECT count(*)::int AS n FROM (
       SELECT symbol, open_time FROM open_positions WHERE open_time >= $1 AND COALESCE(mode, 'demo') = $2
       UNION
       SELECT symbol, open_time FROM closed_positions WHERE open_time >= $1 AND COALESCE(mode, 'demo') = $2
     ) AS daily_entries`,
    [todayStart.getTime(), mode]
  );
  if (num(todayTrades?.n) >= num(s["risk.maxDailyTrades"])) out.reasons.push("سقف معاملات روزانه");
  const maxReentry = Math.max(0, Math.min(10, Math.round(num(s["risk.maxReentry"], 0))));
  const priorWins = await one<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM closed_positions
     WHERE symbol = $1 AND close_time > $2 AND profit > 0 AND COALESCE(mode, 'demo') = $3`,
    [symbol, todayStart.getTime(), mode]
  );
  if (num(priorWins?.n) > maxReentry) out.reasons.push("max_profitable_reentries_reached");

  // ── Freqtrade-style protections ────────────────────────────────────────────
  // Everything below is derived from the ledger (no extra state), so each guard
  // expires on its own as soon as the losing streak leaves the window.
  // 1) StoplossGuard: N stop-losses inside a rolling window pause all entries.
  const slCount = Math.max(0, Math.round(num(s["risk.protectionStoplossCount"], 3)));
  const slWindowMin = Math.max(0, num(s["risk.protectionStoplossWindowMin"], 60));
  const protCooldownMin = Math.max(0, num(s["risk.protectionCooldownMin"], 60));
  if (slCount > 0 && slWindowMin > 0 && protCooldownMin > 0) {
    const stops = await many<{ close_time: string }>(
      `SELECT close_time FROM closed_positions
        WHERE close_reason = 'stop_loss' AND COALESCE(mode, 'demo') = $1
        ORDER BY close_time DESC LIMIT $2`,
      [mode, slCount]
    );
    if (stops.length >= slCount) {
      const newest = num(stops[0]?.close_time);
      const oldest = num(stops[stops.length - 1]?.close_time);
      if (newest > 0 && oldest > 0 && newest - oldest <= slWindowMin * 60_000) {
        if (now() - oldest < protCooldownMin * 60_000) {
          out.reasons.push(`protection_stoploss_guard (${slCount} استاپ در ${slWindowMin} دقیقه)`);
        }
      }
    }
  }
  // 2) Consecutive losses: stop trading until a winning close appears.
  const maxConsec = Math.max(0, Math.round(num(s["risk.protectionMaxConsecutiveLosses"], 4)));
  if (maxConsec > 0) {
    const lastN = await many<{ profit: string }>(
      // Manual / administrative closes carry no information about the
      // strategies, so they must not lock the engine as a loss streak.
      `SELECT profit FROM closed_positions WHERE COALESCE(mode, 'demo') = $1
        AND COALESCE(close_reason, '') NOT IN ('manual_close', 'admin_close', 'manual', 'emergency_close', 'emergency_close_all')
        ORDER BY close_time DESC LIMIT $2`,
      [mode, maxConsec]
    );
    if (lastN.length >= maxConsec && lastN.every((r) => num(r.profit) < 0)) {
      out.reasons.push(`${maxConsec} ضرر پشت سر هم`);
    }
  }
  // 3) Per-symbol cooldown after a losing close.
  const lossCooldownMin = Math.max(0, num(s["risk.protectionLossCooldownMin"], 30));
  const latestManual = /manual_close|admin_close|^manual$|emergency_close/.test(String((latestClose as any)?.close_reason ?? ""));
  if (lossCooldownMin > 0 && latestClose && !latestManual && num(latestClose.profit) < 0 &&
      now() - num(latestClose.close_time) < lossCooldownMin * 60_000) {
    out.reasons.push("cooldown_after_loss");
  }
  // 4) LowProfitPairs: a symbol whose last N closes net nothing is blocked.
  const lpMinTrades = Math.max(0, Math.round(num(s["risk.protectionLowProfitMinTrades"], 8)));
  const lpMinPct = num(s["risk.protectionLowProfitMinPct"], 0);
  if (lpMinTrades > 0) {
    const lastK = await many<{ profit: string }>(
      `SELECT profit FROM closed_positions WHERE symbol = $1 AND COALESCE(mode, 'demo') = $2
        ORDER BY close_time DESC LIMIT $3`,
      [symbol, mode, lpMinTrades]
    );
    if (lastK.length >= lpMinTrades) {
      const total = lastK.reduce((a, r) => a + num(r.profit), 0);
      if (total <= lpMinPct) out.reasons.push(`low_profit_pair (${round(total, 4)})`);
    }
  }
  // 5) Cost-aware edge: a target that does not pay for the round trip is noise.
  const minRewardToCost = num(s["risk.minRewardToCost"], 3);
  if (plan && minRewardToCost > 0 && plan.entry > 0 && plan.tp > 0) {
    const rewardPct = (Math.abs(plan.tp - plan.entry) / plan.entry) * 100;
    // Trading fees are only part of it: the margin position fee, one renewal
    // block per 8h held and slippage are charged too.
    const costPct = roundTripCostPct(costModel(s), 8);
    const needed = costPct * minRewardToCost;
    if (rewardPct < needed) {
      out.reasons.push(
        `cost_edge_too_thin (target ${round(rewardPct, 2)}% < ${round(needed, 2)}% = ${minRewardToCost}x of ${round(costPct, 2)}% real cost)`
      );
    }
  }
  out.ok = out.reasons.length === 0;
  return out;
}

// ── Engine tick (one full scan cycle) ────────────────────────────────────────
export async function engineTick(): Promise<{ scanned: number; opened: number }> {
  // One in-flight decision loop across workers. PostgreSQL releases the lock
  // when its connection dies; a fixed Redis TTL may expire mid-scan and allow
  // a second worker to act on the same position.
  const lockClient = await pool.connect();
  let acquired = false;
  try {
    const r = await lockClient.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext('wolf-engine-tick')) AS acquired"
    );
    acquired = r.rows[0]?.acquired === true;
    if (!acquired) return { scanned: 0, opened: 0 };
    return await runEngineTick();
  } finally {
    try {
      if (acquired) await lockClient.query("SELECT pg_advisory_unlock(hashtext('wolf-engine-tick'))");
    } finally {
      lockClient.release();
    }
  }
}

async function runEngineTick(): Promise<{ scanned: number; opened: number }> {
  const s = await getSettings();
  setConflictShare(num(s["risk.conflictShare"], 0.28));
  const mode = s["engine.mode"];
  // Spot accounts (Nobitex) can only go long: a short entry has no coin to sell
  // and is rejected by the exchange, so those signals are skipped up front.
  const spotOnly =
    ["nobitex"].includes(String(s["market.primaryProvider"] ?? "").toLowerCase()) &&
    !(await nobitexAllowsShort().catch(() => false));
  const opened: string[] = [];

  // Keep the drawdown breaker's high-water mark current (only on a new high).
  const equityNow = engineCapital(s);
  if (equityNow > num(s["engine.peakCapital"], 0)) {
    await setSetting("engine.peakCapital", equityNow, "engine").catch(() => undefined);
  }

  // heartbeat first — always
  await setEngineState("heartbeat", { at: now(), mode, autonomous: s["engine.autonomous"] });

  const markets = await many<Row>(
    "SELECT * FROM markets WHERE enabled = true ORDER BY priority ASC, symbol ASC"
  );
  try {
    await retireDustPositions();
  } catch (e: any) {
    await logEngine("ERROR", `dust sweep: ${String(e?.message ?? e)}`, null, "execution");
  }
  // ── Open-position monitoring (always runs, even on emergency stop) ─────────
  const positions = await many<Row>(
    "SELECT * FROM open_positions WHERE status = 'open' AND COALESCE(source, '') <> 'broker_dust' ORDER BY open_time ASC"
  );
  for (const p of positions) {
    try {
      await monitorPosition(p, s);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg === "live_exit_pending_reconciliation") {
        const key = String(p.symbol);
        if (now() - (exitPendingLogged.get(key) ?? 0) >= 10 * 60_000) {
          exitPendingLogged.set(key, now());
          await logEngine("WARNING", `monitor ${p.symbol}: exit waits for broker reconciliation (a live exit order is still submitting)`, null, "engine");
        }
      } else {
        await logEngine("ERROR", `monitor ${p.symbol}: ${msg}`, null, "engine");
      }
    }
  }
  // Broker-side sweeps: a stale 'reconcile' row blocks its symbol forever, and a
  // position that the broker already closed (or never opened) must not stay open
  // in our ledger.
  try {
    await reconcileStaleLiveOrders(s);
    await adoptBrokerPositions(s);
    await reconcileLivePositions(s);
    if (s["market.adoptBrokerPositions"] === false) await closeOrphanBrokerPositions(s);
  } catch (e: any) {
    await logEngine("ERROR", `broker sweep: ${String(e?.message ?? e)}`, null, "execution");
  }

  // No enabled markets must not suppress exits for already-open positions.
  if (markets.length === 0) {
    await setEngineState("status", { state: "no_markets", at: now() });
    return { scanned: 0, opened: 0 };
  }

  // Parity with Convex: engine.enabled === false is a hard halt of the whole
  // loop (distinct from autonomous/pause, which only stop new trades).
  if (s["engine.emergencyStop"] || s["engine.enabled"] == false || !s["engine.autonomous"]) {
    await setEngineState("status", { state: s["engine.emergencyStop"] ? "emergency_stop" : "paused", reasonCode: s["engine.emergencyStop"] ? "EMERGENCY_STOP" : !s["engine.enabled"] ? "ENGINE_DISABLED" : "AUTONOMOUS_DISABLED", at: now() });
    return { scanned: 0, opened: 0 };
  }
  if (s["engine.pauseNewTrades"]) {
    await setEngineState("status", { state: "paused_new_trades", reasonCode: "NEW_TRADES_PAUSED", pause: await getEngineState("pause_reason"), at: now() });
    return { scanned: 0, opened: 0 };
  }

  // All analysis must run on the same timeframes the exits are built on:
  // engine.analysisTimeframes is a comma list, default is the full ladder.
  const activeTfs = String(s["engine.analysisTimeframes"] ?? "1m,5m,15m,30m,1h,4h,1d")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  // Live execution needs a *second* explicit switch on top of liveTradingEnabled;
  // without it the engine refuses to put money at risk.
  if (mode === "live" && s["trading.liveTradingEnabled"] && s["trading.liveExecutionEnabled"] !== true) {
    // No verified startup reconciliation or native protection contract exists
    // for these adapters. Block new money at risk until both are implemented.
    await setEngineState("status", { state: "live_blocked", reasonCode: "LIVE_EXECUTION_SWITCH_OFF", at: now() });
    await logEngine("WARNING", "LIVE entries blocked: trading.liveExecutionEnabled is off (second safety switch)", { reasonCode: "LIVE_EXECUTION_SWITCH_OFF" }, "execution");
    return { scanned: 0, opened: 0 };
  }
  const stratRows = await many<Row>(
    "SELECT * FROM strategies WHERE engine_enabled = true AND enabled = true"
  );
  // Real per-strategy track record (written on every close) — used to weight
  // votes below instead of trusting a static strategy weight forever.
  const perfRows = await many<Row>("SELECT key, win_rate FROM strategy_performance").catch(() => [] as Row[]);
  const perfMap = new Map<string, number>(perfRows.map((r) => [String(r.key), num(r.win_rate)]));

  // Operator switches that were stored but ignored: the scanner limit, the
  // spot/futures toggles and the number of new entries allowed per tick.
  const allowSpot = s["trading.spotEnabled"] !== false;
  const allowFutures = s["trading.futuresEnabled"] !== false;
  const scannerLimit = Math.max(1, Math.min(200, Math.round(num(s["engine.symbolScannerLimit"], 40))));
  const maxEntriesPerTick = Math.max(1, Math.min(20, Math.round(num(s["engine.concurrency"], 3))));
  const scanList = markets
    .filter((m) => (String(m.type ?? "futures") === "spot" ? allowSpot : allowFutures))
    .slice(0, scannerLimit);
  if (scanList.length === 0) {
    await setEngineState("status", { state: "no_tradable_markets", at: now(), reasonCode: "MARKET_TYPES_DISABLED" });
    return { scanned: 0, opened: 0 };
  }

  // A rejected scan must leave a trace: "scanned=17 opened=0" with no reason
  // told the admin nothing, so every gate fills this list and one line per tick
  // is written at the end.
  const gateRejects: string[] = [];
  const funnel = { noTf: 0, stale: 0, fewVotes: 0, noTicker: 0, maxVotes: 0 };
  // One database-backed tick lock covers monitoring and scanning alike.
  // Free margin is read once per tick and DECREMENTED by every fill: otherwise
  // four entries in the same tick each sized against the same balance and the
  // broker answered "Insufficient Balance" for the later ones.
  let liveFreeMargin: number | null | undefined;
  for (const m of scanList) {
      try {
        const tfs: TfView[] = [];
        const tfViews = await Promise.all(activeTfs.map(async (tf) => {
          const cs = await getCandles(m.symbol, tf, mode, s["market.demoData"], m.market);
          if (cs.length < 50) return null;
          const lastCandle = cs[cs.length - 1];
          if (!lastCandle || !validCandle(lastCandle) || lastCandle.c <= 0) return null;
          return { tf, cs, view: analyzeTimeframe(cs, tf) };
        }));
        for (const item of tfViews) {
          if (!item) continue;
          const { tf, cs, view } = item;
          tfs.push(view);
          // store candles (real data) for the chart
          await pool.query(
            `INSERT INTO candles (symbol, timeframe, t, o, h, l, c, v)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (symbol, timeframe, t) DO UPDATE SET o = EXCLUDED.o, h = EXCLUDED.h, l = EXCLUDED.l, c = EXCLUDED.c, v = EXCLUDED.v`,
            [m.symbol, tf, cs[cs.length - 1].t, cs[cs.length - 1].o, cs[cs.length - 1].h, cs[cs.length - 1].l, cs[cs.length - 1].c, cs[cs.length - 1].v]
          );
        }
        if (tfs.length < 3) {
          funnel.noTf += 1;
          continue; // insufficient data → NO TRADE
        }
        // Entries use a short execution timeframe; higher timeframes only
        // provide context. Using the final array item here used 1d candles for
        // every entry and made forex scalping effectively impossible.
        // The exit geometry (ATR multiples, cost gate) is built on this view, so it
        // must be an operator setting: 15m moves cannot pay for the round trip.
        const execTfSetting = String(s["engine.executionTimeframe"] ?? "15m");
        const executionTf = m.market === "forex" ? "5m" : execTfSetting;
        const lastTf = tfs.find((t) => t.timeframe === executionTf) ?? tfs.find((t) => ["5m", "15m", "30m"].includes(t.timeframe)) ?? tfs[0];
        // stale data guard
        const fresh = lastTf.lastT >= now() - 2 * tfMs(lastTf.timeframe);
        if (!fresh) {
          funnel.stale += 1;
          await logEngine("INFO", `skip ${m.symbol}: stale data`, null, "engine");
          continue;
        }

        // ── strategy votes (multi-timeframe aware) ──
        const votes: { key: string; direction: "long" | "short" | "neutral"; confidence: number; weight: number }[] = [];
        for (const st of stratRows) {
          if (st.market !== "all" && st.market !== m.market) continue;
          const tfList: string[] = st.timeframes ?? [];
          const myTfs = tfList.length ? tfs.filter((t) => tfList.includes(t.timeframe)) : tfs;
          if (myTfs.length === 0) continue;
          // Every vote must answer about the timeframe the trade is taken on:
          // passing myTfs[last] made daily-only strategies vote on the 1d trend
          // while the geometry/validator worked on 4h, so the same market looked
          // bullish to the validator and bearish to ichimoku (monotone shorts).
          // myTfs still supplies multi-timeframe context.
          const res = evaluateStrategy(st.key, myTfs, myTfs.find((t) => t.timeframe === lastTf.timeframe) ?? lastTf);
          if (res.direction === "neutral") continue;
          // A strategy with a real track record (strategy_performance) carries
          // proportionally more weight; unproven strategies stay neutral (1.0).
          const trackedWinRate = perfMap.get(String(st.key));
          const perfWeight = trackedWinRate === undefined
            ? 1
            : Math.max(0.6, Math.min(1.4, 0.6 + (trackedWinRate / 100) * 0.8));
          votes.push({ key: st.key, direction: res.direction, confidence: res.confidence, weight: num(st.weight, 1) * perfWeight });
        }
        const minConfirmations = Math.max(1, Math.min(20, Math.round(num(s["risk.minConfirmations"], 3))));
        // Silent skip was the reason "scanned=17 opened=0" had no explanation at
        // all: with no strategy votes every symbol leaves here before any log.
        const famCount = confirmationFamilies(votes);
        funnel.maxVotes = Math.max(funnel.maxVotes, votes.length);
        if (famCount < minConfirmations) {
          funnel.fewVotes += 1;
          continue;
        }

        const decision = computeDecision(tfs, votes, lastTf);

        // live ticker for entry price
        const tick = mode === "live" && m.market === "forex"
          ? await fetchMt5BridgeTicker(m.symbol)
          : await fetchTicker(m.symbol);
        // An entry must be backed by a positive live ticker. Never fall back to
        // an old/demo candle for opening a position.
        let price = Number(tick?.price);
        if ((!Number.isFinite(price) || price <= 0) && mode === "demo") {
          price = lastTf.last;
        }
        if (!Number.isFinite(price) || price <= 0) {
          funnel.noTicker += 1;
          await logEngine("INFO", `skip ${m.symbol}: no valid live ticker`, null, "engine");
          continue;
        }

        await pool.query(
          `UPDATE markets SET last_price = $1, change_24h = $2, updated_at = $3 WHERE symbol = $4`,
          [price, tick?.change24h ?? null, now(), m.symbol]
        );

        // ── signal creation (quality filter) ──
        // "live" consumes real market data. Until an exchange/broker account
        // is explicitly enabled, it is signal-only and never writes paper
        // positions with a misleading live label.
        const liveExecution = mode === "live" && s["trading.liveTradingEnabled"] === true;

        // ── entry decision ──
        const minScore = num(s["risk.minScore"], 80);
        const minConf = num(s["risk.minConfidence"], 0.5);
        const minRR = num(s["risk.minRR"], 1.2);
        const minConsensus = Math.max(0.4, Math.min(0.95, num(s["risk.minConsensus"], 0.55)));
        const consensus = Math.max(decision.longShare, decision.shortShare);
        // This gate used to `continue` without a trace: the panel showed
        // "scanned=17 opened=0" with no explanation. Directional candidates now
        // record exactly which condition rejected them.
        const families = decision.direction === "neutral" ? 0 : confirmationFamilies(votes, decision.direction);
        const needConsensus = Math.max(minConf, minConsensus);
        const gateReasons: string[] = [];
        if (decision.direction === "neutral") gateReasons.push("neutral");
        if (decision.conflict) gateReasons.push("strategies_conflict");
        if (decision.score < minScore) gateReasons.push(`score ${Math.round(decision.score)} < minScore ${minScore}`);
        if (decision.agreement < 0.2) gateReasons.push(`agreement ${round(decision.agreement, 2)} < 0.2`);
        if (consensus < needConsensus) gateReasons.push(`consensus ${round(consensus, 2)} < ${round(needConsensus, 2)}`);
        if (families < minConfirmations) gateReasons.push(`families ${families} < minConfirmations ${minConfirmations}`);
        if (gateReasons.length > 0) {
          if (decision.direction !== "neutral") {
            gateRejects.push(
              `${m.symbol}/${decision.direction}: ${gateReasons.join(", ")}`
            );
          }
          continue;
        }

        // ── Market Regime & Condition Validation ──
        const higherTf = tfs.find((t) => ["1h", "4h", "1d"].includes(t.timeframe)) ?? tfs[tfs.length - 1];
        const volRatio = lastTf.ind.volMa > 0 ? lastTf.ind.volLast / lastTf.ind.volMa : 1;
        const marketMetrics: MarketMetrics = {
          symbol: m.symbol,
          market: m.market === "forex" ? "forex" : "crypto",
          volumeReliable: m.market !== "forex" && lastTf.ind.volMa > 0 && lastTf.ind.volLast > 0,
          price,
          rsi: lastTf.ind.rsi,
          adx: lastTf.ind.adx,
          // Never hand the validator a bogus ATR: it widens the stop to
          // price - 1.1*ATR and that produced negative stop levels before.
          atr: Math.min(num(lastTf.ind.atr), price * 0.05),
          atrPct: price > 0 ? (lastTf.ind.atr / price) * 100 : 1.5,
          bbUpper: lastTf.ind.bbUpper,
          bbLower: lastTf.ind.bbLower,
          bbMid: lastTf.ind.bbMid,
          emaFast: lastTf.ind.emaFast,
          emaSlow: lastTf.ind.emaSlow,
          macd: lastTf.ind.macd,
          macdSig: lastTf.ind.macdSig,
          volumeRatio: Number.isFinite(volRatio) && volRatio > 0 ? volRatio : 1,
          higherTfTrend: higherTf?.trend as any,
          support: lastTf.sr.support,
          resistance: lastTf.sr.resistance,
        };

        const dir: "long" | "short" = decision.direction === "long" ? "long" : "short";
        const initialSl = dir === "long" ? lastTf.sr.support : lastTf.sr.resistance;
        const initialTp = dir === "long" ? lastTf.sr.resistance : lastTf.sr.support;

        const validation = validateMarketConditions(
          marketMetrics,
          dir,
          initialSl,
          initialTp,
          votes.map((v) => v.key),
          minRR,
          decision.score,
          s["risk.exhaustionGuardEnabled"] === false,
          {
            drought: num(s["risk.volumeDroughtRatio"], 0.02),
            low: num(s["risk.volumeLowRatio"], 0.15),
          },
        );

        if (!validation.allowed) {
          await logEngine(
            "INFO",
            `[MarketValidator] BLOCKED ${m.symbol} ${decision.direction}: ${validation.blockReason ?? "unfavorable conditions"} | regime=${validation.regime} warnings=${validation.warnings.join("; ")}`,
            { symbol: m.symbol, regime: validation.regime, reasons: validation.reasons },
            "engine"
          );
          continue;
        }

        if (validation.adjustedScore < minScore) {
          await logEngine(
            "INFO",
            `[MarketValidator] SKIPPED ${m.symbol} ${decision.direction}: adjusted score ${validation.adjustedScore} < min ${minScore} (${validation.warnings.join(", ")})`,
            null,
            "engine"
          );
          continue;
        }
        // Counter-HTF entries are the single biggest loss source: the validator
        // only penalises them, so a strong 4h score still opened shorts inside a
        // daily uptrend. Alignment is now a hard requirement (risk.requireHtfAlignment).
        const requireHtf = s["risk.requireHtfAlignment"] !== false;
        const htfAligned = (validation.diagnostics as any)?.isMtfAligned !== false;
        if (requireHtf && !htfAligned) {
          gateRejects.push(`${m.symbol}/${decision.direction}: counter_htf`);
          await logEngine(
            "INFO",
            `[MarketValidator] SKIPPED ${m.symbol} ${decision.direction}: counter_htf (higher timeframe opposes the trade)`,
            { symbol: m.symbol, direction: decision.direction, regime: validation.regime },
            "engine"
          );
          continue;
        }

        // The gate above already rejected "neutral", but TS cannot see that any
        // more once the check lives in a reasons array.
        const side: "long" | "short" = decision.direction === "long" ? "long" : "short";
        let sl = validation.adjustedSl ?? initialSl ?? (side === "long" ? price * 0.98 : price * 1.02);
        let tp = validation.adjustedTp ?? initialTp ?? (side === "long" ? price * 1.02 : price * 0.98);
        // risk.stopOffsetATR and risk.tp1..tp3ATR were editable in the panel but
        // never reached the engine: every stop/target came from swing levels.
        // ATR now owns the risk distance whenever it is available and sane.
        const atrValue = num(lastTf.ind?.atr);
        const atrUsable = atrValue > 0 && Number.isFinite(atrValue) && atrValue / price < 0.08;
        const slAtrMult = Math.max(0, num(s["risk.stopOffsetATR"], 0));
        const tpAtrMult = Math.max(0, num(s["risk.tp1ATR"], 0));
        if (atrUsable) {
          if (slAtrMult > 0) sl = side === "long" ? price - atrValue * slAtrMult : price + atrValue * slAtrMult;
          if (tpAtrMult > 0) tp = side === "long" ? price + atrValue * tpAtrMult : price - atrValue * tpAtrMult;
        }
        // A stop tighter than the round-trip cost is a guaranteed loss the moment
        // it is tapped, and a target under the cost line has no edge at all. Keep
        // both outside the fee band (ATR still decides the shape, the floor only
        // widens an over-tight level).
        const rtPct = Math.max(0.3, roundTripCostPct(costModel(s), 8));
        const floorSlPct = Math.min(0.04, Math.max(0.012, (rtPct * 1.8) / 100));
        const floorTpPct = Math.max(floorSlPct * Math.max(1.2, minRR), (rtPct * 2.6) / 100);
        if (Math.abs(price - sl) / price < floorSlPct) {
          const d = price * floorSlPct;
          sl = side === "long" ? price - d : price + d;
        }
        if (Math.abs(tp - price) / price < floorTpPct) {
          const d = price * floorTpPct;
          tp = side === "long" ? price + d : price - d;
        }
        // A 3xATR stop on a coin whose 4h ATR is 3% is 9% of price. Because the
        // exchange floor forces notional = 100% of equity, that is a 9% equity
        // loss on a single stop (real: ARB -7.5%). Cap both legs so the geometry
        // stays tradable and the reward/risk shape is kept.
        const maxStopPct = Math.min(0.2, Math.max(0.004, num(s["risk.maxStopPct"], 4) / 100));
        const maxTpPct = Math.min(0.5, Math.max(maxStopPct * 1.2, num(s["risk.maxTargetPct"], 10) / 100));
        const rrFloor = Math.max(1.2, num(s["risk.minRR"], 1.4));
        let capStopPct = Math.abs(price - sl) / price;
        if (capStopPct > maxStopPct) {
          const d = price * maxStopPct;
          sl = side === "long" ? price - d : price + d;
          capStopPct = maxStopPct;
        }
        let capTpPct = Math.min(Math.abs(tp - price) / price, maxTpPct);
        capTpPct = Math.max(capTpPct, capStopPct * rrFloor);
        tp = side === "long" ? price + price * capTpPct : price - price * capTpPct;
        const riskDist = Math.abs(price - sl);
        // Minimum SL distance: 0.15% of entry price (prevents opening and closing at same price)
        const minRiskDist = price * 0.0015;
        if (riskDist < minRiskDist) {
          await logEngine("INFO", `skip ${m.symbol}: SL too close (${round(riskDist/price*100,3)}% < 0.15%)`, null, "engine");
          continue;
        }
        const pricePrecision = effectivePriceDigits(m.digits, price, m.market);
        let roundedSl = round(sl, pricePrecision);
        let roundedTp = round(tp, pricePrecision);
        // A structurally "valid" but absurd geometry (e.g. SL 99% away,
        // TP 40x the entry) is as broken as an inverted one.
        const slPct = Math.abs(price - roundedSl) / price;
        const tpPct = Math.abs(roundedTp - price) / price;
        if (slPct > 0.15 || tpPct > 0.5 || tpPct < slPct * 0.5) {
          const pct2 = Math.max(0.004, Math.min(0.03, num(s["risk.fallbackRiskPct"], 0.8) / 100));
          const dist2 = price * pct2;
          const rr2 = Math.max(1.2, num(s["risk.minRR"], 1.2));
          roundedSl = side === "long" ? round(price - dist2, pricePrecision) : round(price + dist2, pricePrecision);
          roundedTp = side === "long" ? round(price + dist2 * rr2, pricePrecision) : round(price - dist2 * rr2, pricePrecision);
          await logEngine("INFO", `sane distance: rebuilt levels ${m.symbol} ${side}`, null, "engine");
        }
        if (!validExitLevels(side, price, roundedSl, roundedTp)) {
          // Swing/ATR levels can land on the wrong side of the fill price (or
          // collapse after rounding). Rebuild them from a percentage distance so
          // a valid signal is not silently dropped.
          const pct = Math.max(0.004, Math.min(0.03, num(s["risk.fallbackRiskPct"], 0.8) / 100));
          const dist = price * pct;
          const rrTarget = Math.max(1.2, num(s["risk.minRR"], 1.2));
          roundedSl = side === "long" ? round(price - dist, pricePrecision) : round(price + dist, pricePrecision);
          roundedTp = side === "long" ? round(price + dist * rrTarget, pricePrecision) : round(price - dist * rrTarget, pricePrecision);
          await logEngine("INFO", `repaired exit levels ${m.symbol} ${side} (${round(pct * 100, 2)}%)`, null, "engine");
        }
        const levelEpsilon = Math.max(price * 1e-6, 1e-12);
        if (Math.abs(roundedSl - price) < levelEpsilon || Math.abs(roundedTp - price) < levelEpsilon) {
          await logEngine("INFO", `skip ${m.symbol}: rounded exit level equals entry`, null, "engine");
          continue;
        }
        if (!validExitLevels(side, price, roundedSl, roundedTp)) {
          await logEngine("INFO", `skip ${m.symbol}: invalid exit direction`, {
            symbol: m.symbol, direction: side, entry: price, SL: roundedSl, TP: roundedTp,
            score: validation.adjustedScore, confidence: Math.max(decision.longShare, decision.shortShare),
            reasonCode: "INVALID_EXIT_LEVELS",
          }, "engine");
          continue;
        }
        const rr = Math.abs(roundedTp - price) / Math.abs(price - roundedSl);
        if (rr < minRR - Math.max(0.02, minRR * 0.01)) {
          await logEngine("INFO", `skip ${m.symbol}: RR ${round(rr, 2)} < minRR ${minRR}`, null, "engine");
          continue;
        }
        const liq = side === "long" ? price - riskDist * 3 : price + riskDist * 3;
        if (s["trading.allowSignals"]) {
          await createSignal(m.symbol, lastTf.timeframe, { ...decision, score: validation.adjustedScore }, price, votes, mode, roundedSl, roundedTp);
        }
        if (mode === "live" && !liveExecution) continue;
        if (mode === "live" && spotOnly && side === "short") {
          await logEngine("INFO", `skip ${m.symbol}: spot account cannot short`, {
            symbol: m.symbol,
            direction: side,
            reasonCode: "SPOT_CANNOT_SHORT",
          }, "engine");
          continue;
        }

        const risk = await riskCheck(s, m.symbol, { entry: price, sl: roundedSl, tp: roundedTp });
        if (!risk.ok) {
          await logEngine("INFO", `skip ${m.symbol}: ${risk.reasons.join(", ")}`, {
            symbol: m.symbol, direction: side, score: validation.adjustedScore,
            confidence: Math.max(decision.longShare, decision.shortShare),
            RR: rr, entry: price, SL: roundedSl, TP: roundedTp,
            reasonCode: "RISK_REJECTED", reasons: risk.reasons,
          }, "engine");
          continue;
        }

        const executionProvider = liveExecution
          ? (m.market === "forex" ? "mt5" : String(s["market.primaryProvider"] || "binance"))
          : "paper";
        // A tighter stop deserves more leverage (1 / (risk x 10)), but never more
        // than the exchange allows: Wallex multiplies by risk_coef, so the cap is
        // wallex.riskCoef (1 = off, 3 = three times the collateral).
        const levCap = executionProvider === "wallex"
          ? Math.max(1, Math.min(num(s["risk.maxLeverage"], 10), num(s["wallex.riskCoef"], 1)))
          : num(s["risk.maxLeverage"], 10);
        const leverage = Math.min(levCap, Math.max(1, Math.round(1 / Math.max(0.02, (riskDist / price) * 10))));
        const requestedSize = await positionSize(
          s,
          price,
          riskDist,
          rr,
          validation.adjustedScore,
          Math.max(decision.longShare, decision.shortShare),
          leverage,
          m.symbol
        );
        // Record the leverage the adapter actually requests, so margin, size and
        // the free-margin bookkeeping match the exchange (risk_coef = leverage).
        const execLev = leverage;
        let size = requestedSize;
        if (liveExecution) {
          const adapter = getExecutionAdapter(executionProvider, m.market);
          if (liveFreeMargin === undefined) {
            try {
              liveFreeMargin = await adapter.availableMargin?.() ?? null;
            } catch {
              liveFreeMargin = null;
            }
          }
          const available: number | null = liveFreeMargin ?? null;
          if (available === null || !Number.isFinite(available) || available <= 0) {
            await logEngine("WARNING", `skip ${m.symbol}: broker available capital unverified`, {
              symbol: m.symbol, direction: side, score: validation.adjustedScore,
              confidence: Math.max(decision.longShare, decision.shortShare), RR: rr,
              entry: price, SL: roundedSl, TP: roundedTp,
              requestedNotional: requestedSize, allowedNotional: 0,
              reasonCode: "BROKER_AVAILABLE_CAPITAL_UNVERIFIED", provider: executionProvider,
            }, "execution");
            continue;
          }
          // keep a 3% cushion for the trade fee and rounding, so a sized-to-the-edge
          // order is not rejected after the margin is already committed
          const cushion = executionProvider === "wallex" ? 1 : 0.97;
          size = Math.min(size, available * (executionProvider === "binance" ? 1 : execLev) * cushion);
          // A margin order under 500,000 rial (≈0.18 USDT) is refused with
          // SmallOrder. Sending it anyway produced phantom 'reconcile' rows and
          // broker fills without a DB row, so stop before the order.
          if (executionProvider === "nobitex") {
            const minUsdt = await nobitexMinOrderUsdt();
            if (minUsdt > 0 && size < minUsdt) {
              await logEngine("INFO", `skip ${m.symbol}: notional ${round(size, 4)} USDT < exchange minimum ${round(minUsdt, 4)}`, {
                symbol: m.symbol, direction: side, requestedNotional: size, allowedNotional: 0,
                reasonCode: "BELOW_EXCHANGE_MIN", provider: executionProvider,
              }, "execution");
              continue;
            }
          }
        }
        if (liveExecution && executionProvider === "wallex") {
          // Wallex refuses a position under 3,000,000 toman of collateral
          // (~10.9 USDT), so with a small balance the only honest size is the
          // exchange floor. Below it the entry is skipped, never silently enlarged.
          const floor = await wallexMinCollateralUsdt();
          const free = num(liveFreeMargin, 0);
          const room = free;
          if (floor > 0 && size < floor) {
            if (room < floor) {
              await logEngine("INFO", `skip ${m.symbol}: wallex floor ${round(floor, 2)} USDT > free margin ${round(free, 2)} USDT`, {
                symbol: m.symbol, direction: side, requestedNotional: size, allowedNotional: 0,
                reasonCode: "BELOW_EXCHANGE_MIN", provider: executionProvider,
              }, "execution");
              continue;
            }
            size = floor;
          }
        }
        if (!liveExecution) {
          const fixed = num(s["paper.notionalUsdt"], 0);
          if (fixed > 0) size = Math.min(fixed, Math.max(size, fixed));
        }
        const qty = Math.floor(size / price * 1e6) / 1e6;
        if (!Number.isFinite(qty) || qty <= 0) {
          await logEngine("INFO", `skip ${m.symbol}: zero executable size`, {
            symbol: m.symbol, direction: side, requestedNotional: requestedSize,
            allowedNotional: size, reasonCode: "ZERO_EXECUTABLE_SIZE",
          }, "engine");
          continue;
        }
        let remoteOrder: { orderId?: string; filledPrice?: number; filledQty?: number } | null = null;
        let pendingOrderId: string | null = null;
        if (liveExecution) {
          const unresolved = await one<{ id: string }>(
            "SELECT id FROM orders WHERE symbol = $1 AND mode = 'live' AND status IN ('submitting', 'reconcile') LIMIT 1",
            [m.symbol],
          );
          if (unresolved) {
            await logEngine("WARNING", `skip ${m.symbol}: live order awaits broker reconciliation`, { orderId: unresolved.id }, "execution");
            continue;
          }
          if (m.type === "futures" && executionProvider === "binance") {
            throw new Error("binance_spot_adapter_cannot_execute_futures");
          }
          const adapter = getExecutionAdapter(executionProvider, m.market);
          const idempotencyKey = `wolf-open-${crypto.randomUUID()}`;
          const pending = await one<{ id: string }>(
            `INSERT INTO orders (idempotency_key, exchange, symbol, side, type, price, qty, leverage, mode, status, validated)
             VALUES ($1,$2,$3,$4,'market',$5,$6,$7,'live','submitting',true) RETURNING id`,
            [idempotencyKey, executionProvider, m.symbol, side === "long" ? "buy" : "sell", price, qty, execLev],
          );
          pendingOrderId = pending?.id ?? null;
          if (!pendingOrderId) throw new Error("live_order_intent_not_recorded");
          let result;
          try {
            result = await adapter.placeOrder({
              symbol: m.symbol, side: side === "long" ? "buy" : "sell",
              qty, price, leverage: execLev, idempotencyKey,
              // Exchanges that keep the stop on their own book (Wallex) get the
              // levels with the entry; the guard stays as a second line.
              stopLoss: roundedSl, takeProfit: roundedTp,
            });
          } catch (error: any) {
            const failure = String(error?.message ?? error);
            // The broker already answered (Insufficient Balance, SmallOrder, HTTP 4xx,
            // an error body on HTTP 200): the order never existed, so the symbol must be
            // released now instead of being parked in 'reconcile' for the whole timeout.
            const definite = /insufficient balance|insufficient margin|small ?order|invalid ?balance|market ?closed|order rejected|\(HTTP 4\d\d\)|nobitex \/margin\/orders\/add/i.test(failure);
            await pool.query(
              definite
                ? "UPDATE orders SET status = 'rejected', validation_message = $2 WHERE id = $1"
                : "UPDATE orders SET status = 'reconcile', validation_message = $2 WHERE id = $1",
              [pendingOrderId, (definite ? "entry rejected by broker: " : "submission outcome unknown: ") + failure.slice(0, 300)],
            );
            if (definite) throw new Error(`live_entry_rejected:${failure}`);
            throw error;
          }
          if (!confirmedEntryFill(result, qty, price)) {
            // A definitive rejection creates no order, so it must not leave the
            // symbol blocked behind an unresolved 'reconcile' row.
            const rejected = result.rejected === true && !result.orderId;
            await pool.query(
              rejected
                ? "UPDATE orders SET status = 'rejected', validation_message = $2 WHERE id = $1"
                : "UPDATE orders SET status = 'reconcile', ref = $2, validation_message = $3 WHERE id = $1",
              rejected
                ? [pendingOrderId, String(result.error ?? 'rejected').slice(0, 300)]
                : [pendingOrderId, result.orderId ?? null, String(result.error ?? 'broker fill not confirmed').slice(0, 300)],
            );
            throw new Error(
              rejected
                ? `live_entry_rejected:${result.error ?? 'rejected'}`
                : `live_entry_requires_reconciliation:${result.error ?? 'fill_unverified'}`,
            );
          }
          remoteOrder = result;
          price = Number(result.filledPrice);
          if (typeof liveFreeMargin === "number") {
            liveFreeMargin = Math.max(0, liveFreeMargin - Math.min(liveFreeMargin, size / execLev));
          }
          if ((side === "long" && (roundedSl >= price || roundedTp <= price)) ||
              (side === "short" && (roundedSl <= price || roundedTp >= price))) {
            await pool.query("UPDATE orders SET status = 'reconcile', ref = $2, validation_message = 'fill price invalidated exit levels' WHERE id = $1", [pendingOrderId, result.orderId]);
            throw new Error("live_fill_exit_levels_invalid_reconciliation_required");
          }
        }
        const executedQty = round(Number(remoteOrder?.filledQty) > 0 ? Number(remoteOrder?.filledQty) : qty, 8);
        const executedSize = round(price * executedQty, 8);
        const executedMargin = round(executedSize / execLev, 8);
        let targets = buildStagedTargets(side, price, roundedSl, roundedTp, pricePrecision);
        // TP2/TP3 ATR multipliers extend the ladder beyond the primary target.
        if (atrUsable) {
          const extraTargets = [num(s["risk.tp2ATR"], 0), num(s["risk.tp3ATR"], 0)]
            .filter((mult) => mult > 0)
            .map((mult) => round(side === "long" ? price + atrValue * mult : price - atrValue * mult, pricePrecision))
            .filter((level) => (side === "long" ? level > roundedTp : level < roundedTp))
            .filter((level, index, all) => all.indexOf(level) === index);
          if (extraTargets.length) targets = [...targets, ...extraTargets];
        }

        // ── ATOMIC OPEN (DB unique index on symbol is the last line of defense) ──
        try {
          await tx(async (c) => {
            await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`pos:${m.symbol}`]);
            const dup = await c.query("SELECT id FROM open_positions WHERE symbol = $1", [m.symbol]);
            if (dup.rows.length > 0) throw new Error("duplicate_symbol");
            const pos = await insertPositionOrThrow(c, {
              symbol: m.symbol,
              market: m.market,
              side,
              entry: price,
              quantity: executedQty,
              size: executedSize,
              leverage,
              margin: executedMargin,
              score: validation.adjustedScore,
              confidence: Math.max(decision.longShare, decision.shortShare),
              strategyKeys: side === "long" ? decision.longs.slice(0, 5) : decision.shorts.slice(0, 5),
              stopLoss: roundedSl,
              takeProfit: roundedTp,
              liquidation: round(liq, pricePrecision),
              targets,
              expectedExit: roundedTp,
              expectedProfit: round((side === "long" ? roundedTp - price : price - roundedTp) * executedQty, 8),
              expectedDuration: 240,
              openTime: now(),
              mode,
              exchange: executionProvider,
              type: m.type ?? "futures",
              network: m.network ?? null,
            });
            await allocateFrozenCapital(c, pos.id, executedMargin, s);
            if (pendingOrderId) await c.query(
              "UPDATE orders SET status = 'filled', position_id = $2, ref = $3 WHERE id = $1",
              [pendingOrderId, pos.id, remoteOrder?.orderId],
            );
            await c.query(
              `INSERT INTO trade_analysis (position_id, symbol, side, structure, trend, momentum, support, resistance, entry, stop_loss, take_profit, targets, rr, confidence, position_size, margin, leverage, entry_reason_fa, entry_reason_en, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
              [
                pos.id, m.symbol, side, lastTf.structure, lastTf.trend, lastTf.momentum,
                roundedSl, roundedTp, price,
                roundedSl, roundedTp,
                targets, round(rr, 2),
                Math.max(decision.longShare, decision.shortShare), executedSize,
                executedMargin, leverage,
                `رژیم: ${validation.regime} | تأیید ولیدیتور بازار`,
                `Regime: ${validation.regime} | Market validator approved with score ${validation.adjustedScore}`,
                now(),
              ]
            );
          });
          opened.push(m.symbol);
          await logEngine("TRADE", `OPEN ${m.symbol} ${side} @ ${price} score=${validation.adjustedScore} regime=${validation.regime}`, { votes: votes.length, score: validation.adjustedScore, side, regime: validation.regime }, "engine");
          // telegram channel alert (best effort, never blocks engine)
          if (s["telegram.enabled"] && s["channel.postTrades"]) {
            const p = await one<Row>("SELECT * FROM open_positions WHERE symbol = $1", [m.symbol]);
            if (p) void notifyTradeChannel({ ...p, capital: engineCapital(s) }, "open").catch((error) => logEngine("WARNING", `trade open alert failed: ${error.message}`, { positionId: p.id }, "bot"));
          }
          // engine.concurrency caps how many new positions a single tick may
          // open, so one strong bar cannot fill every slot at once.
          if (opened.length >= maxEntriesPerTick) break;
        } catch (e: any) {
          // duplicate_symbol is handled right below by merging the fill into the
          // row that won the race, so it must not raise a CRITICAL alarm.
          if (pendingOrderId && remoteOrder?.orderId && e.message !== "duplicate_symbol") {
            await pool.query("UPDATE orders SET status = 'reconcile', ref = $2, validation_message = $3 WHERE id = $1",
              [pendingOrderId, remoteOrder.orderId, `broker filled but position commit failed: ${String(e.message).slice(0, 250)}`]);
            await logEngine("CRITICAL", `broker fill ${m.symbol} must be reconciled; no blind opposite order sent`, { orderId: pendingOrderId, brokerRef: remoteOrder.orderId }, "execution");
          }
          if (e.message === "duplicate_symbol") {
            // The adopt sweep can insert a row for this symbol between our
            // pre-check and the commit while the broker already filled. Merge the
            // real fill into that row instead of leaving an untracked position.
            const fq = Number(remoteOrder?.filledQty ?? 0);
            const fp = Number(remoteOrder?.filledPrice ?? price ?? 0);
            if (fq > 0 && fp > 0) {
              await pool.query(
                `UPDATE open_positions SET quantity = $2, size = $3, entry = $4, last_update = $5, source = 'engine'
                 WHERE symbol = $1 AND status = 'open'`,
                [m.symbol, fq, round(fq * fp, 8), fp, now()]
              );
              if (pendingOrderId) {
                await pool.query(
                  "UPDATE orders SET status = 'filled', validation_message = 'merged into existing open row' WHERE id = $1",
                  [pendingOrderId]
                );
              }
              opened.push(m.symbol);
              await logEngine("WARNING", `merged broker fill ${m.symbol} into the existing open row`, { orderId: pendingOrderId, brokerRef: remoteOrder?.orderId }, "execution");
            }
            continue;
          }
          await logEngine("WARNING", `open ${m.symbol} failed: ${e.message}`, null, "engine");
        }
      } catch (e: any) {
        await logEngine("WARNING", `scan ${m.symbol}: ${e.message}`, null, "engine");
      }
  }

  if (opened.length === 0) {
    const head = gateRejects.slice(0, 3).join(" | ");
    const more = gateRejects.length > 3 ? ` (+${gateRejects.length - 3} more)` : "";
    await logEngine(
      "WARNING",
      `no entry this scan: symbols=${scanList.length} insufficient_tf=${funnel.noTf} stale=${funnel.stale} few_votes=${funnel.fewVotes} (max_votes=${funnel.maxVotes}) no_ticker=${funnel.noTicker} gate_rejected=${gateRejects.length}${head ? ` :: ${head}${more}` : ""}`,
      { funnel, rejects: gateRejects.slice(0, 15), reasonCode: "NO_ENTRY_SCAN" },
      "engine"
    );
  }
  await setEngineState("status", { state: "running", at: now(), scanned: scanList.length });
  await setEngineState("last_scan", { at: now(), opened: opened.length });
  return { scanned: scanList.length, opened: opened.length };
}

function tfMs(tf: string): number {
  return ({ "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 }[tf] ?? 900_000);
}

/// Effective engine capital: the dashboard-facing chain (engine.capital →
/// risk.virtualCapital → engine.virtualCapital) plus the accumulated realized
/// P&L, so closed trades move the working capital exactly like the preview.
/** Both directions above this share mean "no trade" (risk.conflictShare). */
let conflictShare = 0.28;
export function setConflictShare(v: number): void {
  conflictShare = Math.max(0.1, Math.min(0.55, Number.isFinite(v) && v > 0 ? v : 0.28));
}

function engineCapital(s: any): number {
  const base = num(s["engine.capital"], num(s["risk.virtualCapital"], num(s["engine.virtualCapital"], 1000)));
  const realized = num(s["engine.realizedPnl"], 0);
  // Insolvency is not a licence to mint a synthetic USDT for new orders.
  return Math.max(0, base + realized);
}

function positionCap(s: any): number {
  const configured = num(s["engine.maxTotalPositions"], num(s["risk.maxOpenPositions"], 5));
  return Math.max(1, Math.min(50, Math.round(configured || 5)));
}

/** Crypto prices below one tick of a misconfigured market must not round to zero.
 * Forex retains broker-specific decimal precision. Database price scale is 8. */
export function effectivePriceDigits(configured: unknown, entry: number, market: string): number {
  const digits = Math.max(0, Math.min(8, Math.round(num(configured, 4))));
  if (market === "forex" || !Number.isFinite(entry) || entry <= 0) return digits;
  const required = entry.toFixed(8).replace(/0+$/, "").split(".")[1]?.length ?? 0;
  return Math.max(digits, required);
}

/** An acknowledgement or partial fill is not a completed entry. */
export function confirmedEntryFill(result: { ok: boolean; orderId?: string; filledPrice?: number; filledQty?: number }, requestedQty: number, price?: number): boolean {
  const filled = Number(result.filledQty);
  // Nobitex rounds the delegated amount to its own precision (0.260012 -> 0.26)
  // and takes the fee from the coin, so the fill is never bit-identical to the
  // request. Anything within 2% is the same trade; the engine puts the *filled*
  // size in the position, never the requested one.
  // 2% is right for real size, but a 0.3-USDT order is rounded in coin units far
  // beyond 2% — accept a fill inside 10 cents as well so small trades stop being
  // parked in 'reconcile' and logged as CRITICAL.
  const tolerance = Math.max(1e-8, Math.abs(Number(requestedQty)) * 0.02, Number(price) > 0 ? 0.1 / Number(price) : 0);
  return result.ok === true && typeof result.orderId === "string" && result.orderId.length > 0 &&
    Number.isFinite(result.filledPrice) && Number(result.filledPrice) > 0 &&
    Number.isFinite(filled) && filled > 0 &&
    Number.isFinite(requestedQty) && requestedQty > 0 &&
    Math.abs(filled - requestedQty) <= tolerance;
}

async function positionSize(
  s: any,
  price: number,
  riskDist: number,
  rr: number,
  score: number,
  confidence: number,
  leverage: number,
  symbol: string
): Promise<number> {
  const [frozenRow, openRow] = await Promise.all([
    one<{ total: string }>(
      `SELECT COALESCE(SUM(frozen), 0)::text AS total
       FROM wallets WHERE UPPER(COALESCE(asset, 'USDT')) = 'USDT' AND frozen > 0`
    ),
    one<{ count: string; total: string }>(
      `SELECT COUNT(*)::text AS count, COALESCE(SUM(margin), 0)::text AS total
       FROM open_positions WHERE status = 'open'`
    ),
  ]);
  const baseCapital = engineCapital(s);
  const frozenTotal = num(frozenRow?.total);
  // Frozen margin can only come out of the base capital; a leftover value
  // from an earlier capital base must not inflate the sizing pool.
  const pooledCapital = baseCapital + Math.min(frozenTotal, baseCapital);
  const allocationPct = Math.max(0.01, Math.min(1, num(s["engine.capitalAllocation"], 30) / 100));
  const usableCapital = pooledCapital * allocationPct;
  const committed = num(openRow?.total);
  const freeCapital = Math.max(0, usableCapital - committed);
  const slotsLeft = Math.max(1, positionCap(s) - num(openRow?.count));
  // Bounded quality weighting prevents one signal from consuming the pool.
  const quality = Math.max(
    0.65,
    Math.min(1.35, (score / 100) * (0.75 + Math.max(0, Math.min(1, confidence)) * 0.25) * Math.sqrt(Math.max(1, rr)))
  );
  const fairMargin = freeCapital * quality / (quality + Math.max(0, slotsLeft - 1));
  const riskAmount = pooledCapital * Math.max(0, num(s["risk.riskPerTrade"], 1.5)) / 100;
  const riskCapNotional = riskDist > 0 ? (riskAmount / riskDist) * price : 0;
  const exposure = await one<{ total: string }>(
    "SELECT COALESCE(SUM(ABS(quantity * entry)), 0)::text AS total FROM open_positions WHERE status = 'open' AND symbol = $1 AND COALESCE(source, '') <> 'broker_dust'",
    [symbol],
  );
  // risk.maxPosition (% of equity per position) and risk.maxExposure (% of
  // equity across all positions) were stored but never enforced. Both are
  // measured on committed MARGIN (like engine.capitalAllocation) and converted
  // to notional with this entry's leverage — measuring them on notional would
  // block every entry once any leverage is in play.
  const wholeBook = await one<{ total: string }>(
    "SELECT COALESCE(SUM(margin), 0)::text AS total FROM open_positions WHERE status = 'open' AND COALESCE(source, '') <> 'broker_dust'",
  );
  const maxPositionPct = Math.max(0, Math.min(100, num(s["risk.maxPosition"], 0)));
  const maxExposurePct = Math.max(0, Math.min(500, num(s["risk.maxExposure"], 0)));
  const positionRoom = maxPositionPct > 0
    ? (pooledCapital * maxPositionPct / 100) * leverage
    : freeCapital * leverage;
  const exposureRoom = maxExposurePct > 0
    ? Math.max(0, pooledCapital * maxExposurePct / 100 - num(wholeBook?.total)) * leverage
    : freeCapital * leverage;
  const capped = cappedNotional({
    requested: Math.min(fairMargin * leverage, riskCapNotional, positionRoom, exposureRoom),
    equity: pooledCapital, availableMargin: freeCapital, leverage,
    symbolExposure: num(exposure?.total), symbolCapPct: num(s["risk.maxSymbolExposure"], 25),
    minimumNotional: 1e-8,
  });
  return round(capped.allowed, 8);
}

async function allocateFrozenCapital(c: any, positionId: string, margin: number, s: any): Promise<void> {
  if (!(margin > 0)) return;
  // Serialize allocations with withdrawals/unfreezes and other engine entries.
  // Read the allocation totals in a second statement, after row locks are held,
  // so READ COMMITTED sees preceding transactions' committed allocations.
  await c.query(
    `SELECT id FROM wallets WHERE UPPER(COALESCE(asset, 'USDT')) = 'USDT'
     AND frozen > 0 ORDER BY user_id FOR UPDATE`
  );
  const wallets = await c.query(
    `SELECT w.user_id, SUM(w.frozen) AS frozen,
            COALESCE((SELECT SUM(a.principal) FROM position_capital_allocations a
                      WHERE a.user_id = w.user_id AND a.settled_at IS NULL), 0) AS allocated
     FROM wallets w
     WHERE UPPER(COALESCE(w.asset, 'USDT')) = 'USDT' AND w.frozen > 0
     GROUP BY w.user_id ORDER BY w.user_id`
  );
  const totalAvailable = wallets.rows.reduce((sum: number, w: Row) => sum + Math.max(0, num(w.frozen) - num(w.allocated)), 0);
  if (!(totalAvailable > 0)) return;
  // Engine-owned capital may fund the remainder of a position. Never assign
  // more user principal than the currently free frozen pool.
  const userFundedMargin = Math.min(margin, totalAvailable);
  const platformFeePct = s["fees.includePlatformCommission"] === false
    ? 0
    : Math.max(0, Math.min(100, num(s["fees.platformNormal"], 0)));
  for (const wallet of wallets.rows as Row[]) {
    const available = Math.max(0, num(wallet.frozen) - num(wallet.allocated));
    const principal = round(userFundedMargin * available / totalAvailable, 8);
    if (!(principal > 0)) continue;
    await c.query(
      `INSERT INTO position_capital_allocations
       (position_id, user_id, principal, share_pct, platform_fee_pct, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [positionId, wallet.user_id, principal, round(principal / margin * 100, 8), platformFeePct, now()]
    );
  }
}

async function settleFrozenCapital(c: any, positionId: string, margin: number, pnl: number, closingFraction = 1): Promise<void> {
  const rows = await c.query(
    `SELECT * FROM position_capital_allocations
     WHERE position_id = $1 AND settled_at IS NULL FOR UPDATE`,
    [positionId]
  );
  for (const allocation of rows.rows as Row[]) {
    const share = margin > 0 ? num(allocation.principal) / margin : 0;
    const gross = round(pnl * share, 8);
    const fee = gross > 0 ? round(gross * num(allocation.platform_fee_pct) / 100, 8) : 0;
    const net = round(gross - fee, 8);
    const wallets = (await c.query(
      `SELECT id, user_id, asset, network, frozen
       FROM wallets
       WHERE user_id = $1 AND UPPER(COALESCE(asset, 'USDT')) = 'USDT'
       ORDER BY created_at ASC, id ASC FOR UPDATE`,
      [allocation.user_id]
    )).rows as Row[];
    if (!wallets.length) throw new Error("allocated_user_wallet_missing");
    // Platform absorbs losses exceeding the customer's frozen equity. Record
    // the shortfall separately so the customer's ledger reconciles exactly.
    const settlement = splitSettlement(net.toFixed(8), wallets.map((wallet) => String(wallet.frozen)));
    const appliedNet = settlement.applied;
    const platformDeficit = settlement.deficit;
    await c.query(
      `UPDATE position_capital_allocations
       SET principal = $1,
           gross_pnl = COALESCE(gross_pnl, 0) + $2,
           platform_fee = COALESCE(platform_fee, 0) + $3,
           net_pnl = COALESCE(net_pnl, 0) + $4,
           platform_deficit = platform_deficit + $5,
           settled_at = CASE WHEN $1 <= 0.00000001 THEN $6 ELSE NULL END
       WHERE id = $7`,
      [round(num(allocation.principal) * Math.max(0, 1 - closingFraction), 8), gross, fee, appliedNet, platformDeficit, now(), allocation.id]
    );

    // Keep the principal committed, but apply each position's net result to
    // the user's frozen equity. This makes future allocations use only the
    // user's still-available frozen capital and keeps the ledger auditable.
    if (appliedNet !== "0") {
      for (const [index, wallet] of wallets.entries()) {
        const walletChange = settlement.changes[index];
        if (walletChange === "0") continue;
        await c.query(
          `UPDATE wallets SET frozen = frozen + $1,
             frozen_since = COALESCE(frozen_since, $2) WHERE id = $3`,
          [walletChange, now(), wallet.id]
        );
        await c.query(
          `INSERT INTO wallet_transactions
           (wallet_id, user_id, type, asset, amount, network, status, ref, note)
           VALUES ($1, $2, 'engine_settlement', 'USDT', $3, $4, 'confirmed', $5, $6)`,
          [wallet.id, wallet.user_id, walletChange, wallet.network ?? "TRC20", positionId,
            `Engine settlement: gross=${gross}, platform_fee=${fee}, applied=${walletChange}, platform_deficit=${platformDeficit}`]
        );
      }
    }
  }
}

// ── Position monitoring: SL/TP/trailing + dynamic BE + learning ───────────
export function buildStagedTargets(
  side: "long" | "short",
  entry: number,
  stopLoss: number,
  finalTarget: number,
  digits: number,
): number[] {
  const risk = Math.abs(entry - stopLoss);
  if (!(risk > 0)) return [round(finalTarget, digits)];
  const sign = side === "long" ? 1 : -1;
  const candidates = [entry + sign * risk, entry + sign * risk * 1.5, finalTarget]
    .map((v) => round(v, digits))
    .filter((v) => side === "long" ? v > entry && v <= finalTarget : v < entry && v >= finalTarget);
  return [...new Set(candidates)].sort((a, b) => side === "long" ? a - b : b - a);
}

async function monitorPosition(p: Row, s: any): Promise<void> {
  const brokerForex = p.mode === "live" && p.market === "forex";
  let tick = await (brokerForex ? fetchMt5BridgeTicker(p.symbol) : fetchTicker(p.symbol)).catch(() => null);
  let price = Number(tick?.price);
  const livePrice = Number.isFinite(price) && price > 0;
  let marketDigits = 4;
  // Always use the market precision, even when the live ticker is available.
  // Forex symbols otherwise defaulted to four decimals and could move SL/TP
  // to invalid broker precision.
  const mRow = await one<{ last_price: string; digits: number }>(
    "SELECT last_price, digits FROM markets WHERE symbol = $1",
    [p.symbol]
  ).catch(() => null);
  marketDigits = effectivePriceDigits(mRow?.digits, num(p.entry), String(p.market));
  if (brokerForex && !livePrice) {
    await logEngine("WARNING", `monitor ${p.symbol}: broker quote unavailable; no forex valuation or exit on a proxy price`, null, "engine");
    return;
  }
  // Fallback: last known price from markets table (avoids stale entry price)
  if (!livePrice) {
    price = Number(mRow?.last_price);
    if (!Number.isFinite(price) || price <= 0) {
      await logEngine("WARNING", `monitor ${p.symbol}: no valid price (ticker + fallback)`, null, "engine").catch(() => {});
      return;
    }
  }

  // A dead feed used to freeze a position for ever: the fallback price equalled
  // the entry, PnL stayed exactly 0 and no exit was ever evaluated (AUSDT sat
  // open for 7 hours with current == entry). Free the slot after N hours.
  // The price can also be `live` yet frozen: an illiquid TMN market repeats the
  // same last trade for hours, so the position sits at exactly the entry price.
  const frozenPrice = num(p.entry) > 0 && Math.abs(price - num(p.entry)) <= num(p.entry) * 1e-9;
  if (!livePrice || frozenPrice) {
    const openedAt = num(p.open_time, now());
    const staleLimitMs = Math.max(1, num(s["risk.staleFeedHours"], 4)) * 3_600_000;
    if (now() - openedAt >= staleLimitMs) {
      const held = Math.round((now() - openedAt) / 3_600_000);
      await logEngine("WARNING", `[StaleFeed] ${p.symbol} closed at entry: no live quote for ${held}h`, { symbol: p.symbol, hours: held }, "engine");
      await closePosition(p.id, "stale_feed", price, { ...p, stop_loss: num(p.stop_loss) }, s);
      return;
    }
  }

  const qty = num(p.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return;
  const entry = num(p.entry);
  const pnl = p.side === "long" ? (price - entry) * qty : (entry - price) * qty;
  const pnlPct = num(p.margin) > 0 ? (pnl / num(p.margin)) * 100 : 0;
  let sl = num(p.stop_loss);
  const tp = num(p.take_profit);
  let closeReason: string | null = null;
  const roundPrice = (v: number) => round(v, marketDigits);

  // ── Dynamic Breakeven & Profit Lock (prevents winning trades turning into losses) ──
  const gainPct = p.side === "long" ? ((price - entry) / entry) * 100 : ((entry - price) / entry) * 100;
  // Every exit threshold is derived from the real cost stack. Moving the stop
  // to "breakeven + 0.15%" used to book a guaranteed net loss: fees alone are
  // ~0.5% of notional, plus the position fee and one renewal block per 8h.
  const rtCostPct = Math.max(0.3, roundTripCostPct(costModel(s), 8));
  const beTriggerPct = Math.max(1.5, rtCostPct * 2.2);
  const lockTriggerPct = Math.max(0.5 + rtCostPct * 3, 2.6);
  // A locked exit must clear the whole round trip, otherwise "protecting" the
  // profit books a loss: 1.15x cost (0.93%) vs a real ~1.0% round trip was
  // exactly the -0.001..-0.006 net on every trailing_stop row.
  const lockBufferPct = Math.max(1.0, rtCostPct * 1.75);
  const beBuffer = entry * (lockBufferPct / 100);

  if (p.side === "long") {
    // Breakeven: once up +1.2%, lift SL above entry
    if (gainPct >= beTriggerPct && sl < entry + beBuffer) {
      const candidate = roundPrice(entry + beBuffer);
      if (candidate > sl && candidate < price) {
        sl = candidate;
        await pool.query("UPDATE open_positions SET stop_loss = $1 WHERE id = $2", [sl, p.id]);
        await logEngine("INFO", `[ProfitLock] ${p.symbol} LONG breakeven set @ ${sl} (gain: +${round(gainPct, 2)}%)`, null, "engine");
      }
    }
    // Lock 50% profit once up +2.2%
    else if (gainPct >= lockTriggerPct) {
      const halfGainSl = roundPrice(entry + (price - entry) * 0.5);
      if (halfGainSl > sl) {
        sl = halfGainSl;
        await pool.query("UPDATE open_positions SET stop_loss = $1 WHERE id = $2", [sl, p.id]);
        await logEngine("INFO", `[ProfitLock] ${p.symbol} LONG profit-locked @ ${sl} (gain: +${round(gainPct, 2)}%)`, null, "engine");
      }
    }
  } else {
    // Breakeven: once down +1.2% in profit, lower SL below entry
    if (gainPct >= beTriggerPct && sl > entry - beBuffer) {
      const candidate = roundPrice(entry - beBuffer);
      if (candidate > 0 && candidate < sl && candidate > price) {
        sl = candidate;
        await pool.query("UPDATE open_positions SET stop_loss = $1 WHERE id = $2", [sl, p.id]);
        await logEngine("INFO", `[ProfitLock] ${p.symbol} SHORT breakeven set @ ${sl} (gain: +${round(gainPct, 2)}%)`, null, "engine");
      }
    }
    // Lock 50% profit once up +2.2%
    else if (gainPct >= lockTriggerPct) {
      const halfGainSl = roundPrice(entry - (entry - price) * 0.5);
      if (halfGainSl < sl) {
        sl = halfGainSl;
        await pool.query("UPDATE open_positions SET stop_loss = $1 WHERE id = $2", [sl, p.id]);
        await logEngine("INFO", `[ProfitLock] ${p.symbol} SHORT profit-locked @ ${sl} (gain: +${round(gainPct, 2)}%)`, null, "engine");
      }
    }
  }

  // Optional trailing stop. It only moves in the direction of protection and
  // can never widen risk or sit beyond the current price.
  if (s["risk.trailingStop"] === true && livePrice) {
    const activate = Math.max(0.1, num(s["risk.trailingActivatePct"], Math.max(2.5, rtCostPct * 2.5)));
    const distance = Math.max(0.1, Math.min(20, num(s["risk.trailingDistancePct"], 0.8)));
    if (gainPct >= activate) {
      const candidate = p.side === "long"
        ? roundPrice(price * (1 - distance / 100))
        : roundPrice(price * (1 + distance / 100));
      const improves = p.side === "long" ? candidate > sl && candidate < price : candidate < sl && candidate > price;
      if (improves) {
        sl = candidate;
        await pool.query("UPDATE open_positions SET stop_loss = $1 WHERE id = $2", [sl, p.id]);
        await logEngine("INFO", `[TrailingStop] ${p.symbol} ${String(p.side).toUpperCase()} moved @ ${sl}`, { gainPct, distance }, "engine");
      }
    }
  }

  if (livePrice) {
    const stagedTargets = Array.isArray(p.targets)
      ? p.targets.map((v: unknown) => num(v)).filter((v: number) => Number.isFinite(v) && v > 0)
      : [];
    const nextTarget = stagedTargets[0];
    const targetHit = Number.isFinite(nextTarget) && (p.side === "long" ? price >= Number(nextTarget) : price <= Number(nextTarget));
    if (s["risk.partialExitEnabled"] !== false && stagedTargets.length > 1 && targetHit) {
      const fraction = Math.max(10, Math.min(80, num(s["risk.partialExitPct"], 40))) / 100;
      await closePartialPosition(p.id, fraction, "take_profit_partial", price, { ...p, stop_loss: sl }, s, stagedTargets.slice(1), sl);
      return;
    }
    if (p.side === "long") {
      if (price <= sl) closeReason = "stop_loss";
      else if (price >= tp) closeReason = "take_profit";
    } else {
      if (price >= sl) closeReason = "stop_loss";
      else if (price <= tp) closeReason = "take_profit";
    }
    const openedAt = num(p.open_time, now());
    const maxHoldMs = Math.max(5, num(s["risk.maxHoldingMinutes"], 1440)) * 60_000;
    if (!closeReason && s["risk.timeStopEnabled"] !== false && now() - openedAt >= maxHoldMs) {
      closeReason = "time_stop";
      await logEngine("WARNING", `[TimeStop] ${p.symbol} exceeded maximum holding time`, { ageMinutes: Math.round((now() - openedAt) / 60_000), maxHoldingMinutes: maxHoldMs / 60_000 }, "engine");
    }
  }

  const progress =
    tp === entry
      ? 0
      : p.side === "long"
        ? Math.min(100, Math.max(0, ((price - entry) / (tp - entry)) * 100))
        : Math.min(100, Math.max(0, ((entry - price) / (entry - tp)) * 100));
  await pool.query(
    `UPDATE open_positions SET current = $1, pnl = $2, pnl_pct = $3, progress = $4, last_update = $5 WHERE id = $6`,
    [price, round(pnl, 8), round(pnlPct, 4), round(progress, 2), now(), p.id]
  );

  if (closeReason) {
    await closePosition(p.id, closeReason, price, { ...p, stop_loss: sl }, s);
  }
}

async function markExitForReconciliation(intentId: string, reason: string, brokerRef?: string): Promise<void> {
  await pool.query(
    "UPDATE orders SET status = 'reconcile', validation_message = $2, ref = COALESCE($3, ref) WHERE id = $1",
    [intentId, reason.slice(0, 300), brokerRef ?? null],
  );
  await logEngine("CRITICAL", "live exit requires broker reconciliation; position must not be silently closed", { intentId, reason }, "execution");
}

async function executeVerifiedExit(
  p: Row, settings: any, quantity: number, requestedPrice: number,
): Promise<{ intentId: string; price: number }> {
  const provider = String(p.exchange || (p.market === "forex" ? "mt5" : settings["market.primaryProvider"] || "binance"));
  const adapter = getExecutionAdapter(provider, p.market);
  const key = `wolf-exit-${crypto.randomUUID()}`;
  const intentId = await tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`exit:${p.id}`]);
    const existing = await c.query(
      "SELECT id FROM orders WHERE position_id = $1 AND mode = 'live' AND status IN ('submitting','reconcile') LIMIT 1",
      [p.id],
    );
    if (existing.rows.length) throw new Error("live_exit_pending_reconciliation");
    const current = await c.query("SELECT quantity FROM open_positions WHERE id = $1 AND status = 'open' FOR UPDATE", [p.id]);
    if (!current.rows.length || Math.abs(num(current.rows[0].quantity) - num(p.quantity)) >= 0.000000005) {
      throw new Error("live_exit_position_changed");
    }
    const inserted = await c.query(
      `INSERT INTO orders (idempotency_key, exchange, symbol, side, type, price, qty, leverage, mode, status, validated, position_id)
       VALUES ($1,$2,$3,$4,'market',$5,$6,$7,'live','submitting',true,$8) RETURNING id`,
      [key, provider, p.symbol, p.side === "long" ? "sell" : "buy", requestedPrice, quantity, num(p.leverage, 1), p.id],
    );
    return String(inserted.rows[0].id);
  });
  try {
    const result = await adapter.closePosition(p.symbol, p.side, quantity, key);
    if (!confirmedEntryFill(result, quantity, requestedPrice)) {
      await markExitForReconciliation(intentId, result.error ?? "broker close fill not confirmed", result.orderId);
      throw new Error("live_exit_requires_reconciliation");
    }
    await pool.query("UPDATE orders SET ref = $2 WHERE id = $1", [intentId, result.orderId]);
    return { intentId, price: Number(result.filledPrice) };
  } catch (error: any) {
    // Unknown transport outcomes must block a duplicate close until reconciled.
    if (error?.message !== "live_exit_requires_reconciliation") {
      await markExitForReconciliation(intentId, String(error?.message ?? error));
    }
    throw error;
  }
}

async function closePartialPosition(
  positionId: string,
  fraction: number,
  reason: string,
  price: number,
  p: Row,
  s: any,
  remainingTargets: number[],
  protectedStop: number,
): Promise<void> {
  const qty = num(p.quantity);
  const entry = num(p.entry);
  const margin = num(p.margin);
  const closeFraction = Math.max(0.1, Math.min(0.8, fraction));
  const closeQty = round(qty * closeFraction, 8);
  const remainQty = round(qty - closeQty, 8);
  if (!(closeQty > 0) || !(remainQty > 0)) return;
  // Existing live positions remain live even if new live entries are disabled.
  const exit = p.mode === "live" ? await executeVerifiedExit(p, s, closeQty, price) : null;
  if (exit) price = exit.price;
  const grossPnl = p.side === "long" ? (price - entry) * closeQty : (entry - price) * closeQty;
  const heldHours = Math.max(0, (now() - num(p.open_time)) / 3_600_000);
  const costs = netPnlUsd(costModel(s), {
    notionalUsd: Math.abs(entry * closeQty),
    holdHours: heldHours,
    grossPnlUsd: grossPnl,
  });
  const pnl = round(costs.netUsd, 8);
  const feeTotal = round(costs.costUsd, 8);

  try { await tx(async (c) => {
    const locked = await c.query("SELECT quantity FROM open_positions WHERE id = $1 AND status = 'open' FOR UPDATE", [positionId]);
    if (!locked.rows.length || Math.abs(num(locked.rows[0].quantity) - qty) >= 0.000000005) {
      throw new Error("partial_exit_position_changed");
    }
    await c.query(
      `INSERT INTO closed_positions
       (symbol, market, side, entry, current, close_price, close_time, close_reason,
        quantity, size, leverage, margin, pnl, profit, pnl_pct, score, confidence,
        strategy_keys, exchange, fee, stop_loss, take_profit, targets, rr, status,
        open_time, mode, type, error, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'closed',$25,$26,$27,NULL,$28)`,
      [
        p.symbol, p.market, p.side, entry, price, price, now(), reason,
        closeQty, round(num(p.size) * closeFraction, 8), num(p.leverage), round(margin * closeFraction, 8),
        round(pnl, 8), round(pnl, 8), margin > 0 ? round((pnl / (margin * closeFraction)) * 100, 4) : 0,
        num(p.score), num(p.confidence), p.strategy_keys ?? [], p.exchange ?? "paper", feeTotal,
        protectedStop, num(p.take_profit), remainingTargets, rrOf(p), p.open_time, p.mode ?? "demo", p.type ?? "futures",
        p.user_id ?? null,
      ]
    );
    await settleFrozenCapital(c, positionId, margin, pnl, closeFraction);
    await addRealizedPnl(c, pnl);
    if (exit) await c.query("UPDATE orders SET status = 'filled' WHERE id = $1", [exit.intentId]);
    const remainingMargin = round(margin * (1 - closeFraction), 8);
    const remainingPnl = p.side === "long" ? (price - entry) * remainQty : (entry - price) * remainQty;
    await c.query(
      `UPDATE open_positions
       SET quantity = $1, size = $2, margin = $3, current = $4, pnl = $5,
           pnl_pct = $6, targets = $7, stop_loss = $8, last_update = $9
       WHERE id = $10`,
      [remainQty, round(num(p.size) * (1 - closeFraction), 8), remainingMargin, price,
        round(remainingPnl, 8), remainingMargin > 0 ? round((remainingPnl / remainingMargin) * 100, 4) : 0,
        remainingTargets, protectedStop, now(), positionId]
    );
  }); } catch (error: any) {
    if (exit) await markExitForReconciliation(exit.intentId, `partial close local commit failed: ${String(error?.message ?? error)}`);
    throw error;
  }
  await logEngine("TRADE", `PARTIAL CLOSE ${p.symbol} ${p.side} @ ${price} reason=${reason} qty=${closeQty} pnl=${round(pnl, 4)}`, null, "engine");
}

/**
 * Orders left in 'submitting'/'reconcile' block their symbol from trading for
 * good. Once they are older than trading.reconcileTimeoutMin and the broker
 * shows neither a working order nor a position for that symbol, they are
 * cleared. If the broker cannot be read the row is kept untouched.
 */
/**
 * Exchange "dust" rows (Nobitex leaves a few satoshi behind after a margin
 * close) can never be closed through the API and only burn an extension fee.
 * They are kept out of the book and their stuck exit intents are released.
 */
async function retireDustPositions(): Promise<void> {
  const rows = await many<Row>(
    "SELECT id FROM open_positions WHERE status = 'open' AND COALESCE(source, '') = 'broker_dust'"
  );
  if (rows.length === 0) return;
  const ids = rows.map((r) => String(r.id));
  await pool.query(
    "UPDATE orders SET status = 'rejected', validation_message = 'position_is_exchange_dust' WHERE status IN ('submitting','reconcile') AND position_id = ANY($1::uuid[])",
    [ids]
  );
  await pool.query(
    "UPDATE open_positions SET status = 'dust_archived' WHERE id = ANY($1::uuid[])",
    [ids]
  );
  await logEngine("WARNING", `retired ${ids.length} exchange dust position(s)`, { count: ids.length }, "execution");
}

async function reconcileStaleLiveOrders(s: Settings): Promise<number> {
  const rows = await many<Row>(
    "SELECT id, symbol, side, qty, position_id, created_at, validation_message FROM orders WHERE mode = 'live' AND status IN ('submitting','reconcile') ORDER BY created_at ASC LIMIT 50"
  );
  if (rows.length === 0) return 0;
  const timeoutMin = Math.max(1, num(s["trading.reconcileTimeoutMin"], 10));
  let held: string[] | null | undefined;
  let working: string[] | null | undefined;
  let cleared = 0;
  let settled = 0;
  for (const r of rows) {
    const ageMin = (now() - num(r.created_at)) / 60_000;
    // The broker answered with a definitive rejection — nothing was submitted, so
    // the symbol must be free immediately.
    const denied = /insufficient balance|insufficient margin|small ?order|\(HTTP 4\d\d\)|entry rejected by broker/i.test(String(r.validation_message ?? ""));
    if (denied && !r.position_id) {
      await pool.query("UPDATE orders SET status = 'rejected' WHERE id = $1", [r.id]);
      cleared += 1;
      continue;
    }
    if (!(ageMin >= timeoutMin)) continue;
    if (held === undefined) held = await nobitexActiveSymbols();
    if (working === undefined) working = await nobitexOpenOrderSymbols();
    if (held === null || working === null) return cleared; // broker unreadable: keep rows
    const symbol = String(r.symbol);
    if (held.includes(symbol) || working.includes(symbol)) {
      // The entry DID fill (the broker holds the coin) but the confirmation never
      // reached this row, so it sits in 'reconcile' forever. Settle it from the
      // position snapshot — never from a guess.
      if (!r.position_id && !working.includes(symbol)) {
        const pos = await one<Row>(
          "SELECT id, quantity FROM open_positions WHERE symbol = $1 AND status = 'open' ORDER BY open_time DESC LIMIT 1",
          [symbol]
        );
        const ratio = pos ? num(pos.quantity) / Math.max(1e-12, num(r.qty)) : 0;
        if (pos && ratio >= 0.98 && ratio <= 1.02) {
          await pool.query(
            "UPDATE orders SET status = 'filled', position_id = $3, validation_message = $2 WHERE id = $1",
            [r.id, `entry settled from broker position snapshot after ${Math.round(ageMin)} min`, String(pos.id)]
          );
          settled += 1;
        }
      }
      continue;
    }
    await pool.query(
      "UPDATE orders SET status = 'rejected', validation_message = $2 WHERE id = $1",
      [r.id, `stale_reconcile_auto_cleared after ${Math.round(ageMin)} min (no working order / no position at broker)`]
    );
    cleared += 1;
  }
  if (cleared > 0) {
    await logEngine("WARNING", `reconcile sweep: cleared ${cleared} stale live order(s)`, { cleared }, "execution");
  }
  if (settled > 0) {
    await logEngine("WARNING", `reconcile sweep: settled ${settled} live entry order(s) from broker positions`, { settled }, "execution");
  }
  return cleared + settled;
}

/**
 * A live position that no longer exists at the broker (closed manually, liquidated
 * or never actually opened) is settled in the ledger so it cannot block the symbol
 * or report a fantasy PnL.
 */
async function reconcileLivePositions(s: Settings): Promise<number> {
  if ((s["engine.mode"] ?? "demo") !== "live") return 0;
  const held =
    String(s["market.primaryProvider"] ?? "nobitex") === "wallex"
      ? await wallexActiveSymbols()
      : await nobitexActiveSymbols();
  if (held === null) return 0;
  const rows = await many<Row>(
    "SELECT * FROM open_positions WHERE status = 'open' AND COALESCE(mode, 'demo') = 'live' AND COALESCE(source, '') <> 'broker_dust'"
  );
  let closed = 0;
  for (const p of rows) {
    if (held.includes(String(p.symbol))) continue;
    if (now() - num(p.open_time) < 3 * 60_000) continue; // fills can lag a moment
    const pending = await one<{ id: string }>(
      "SELECT id FROM orders WHERE position_id = $1 AND mode = 'live' AND status IN ('submitting','reconcile') LIMIT 1",
      [p.id]
    );
    if (pending) continue;
    try {
      let px = num(p.current) || num(p.entry);
      // Wallex closes on its own at SL/TP: settle with the broker's real fill
      // price instead of the last ticker, so the ledger matches the exchange.
      if (String(s["market.primaryProvider"] ?? "nobitex") === "wallex") {
        const real = await wallexLastClosed(String(p.symbol), num(p.open_time), String(p.side));
        if (real?.closePrice) px = real.closePrice;
      }
      await closePosition(String(p.id), "exchange_closed", px, p, s, { skipBroker: true });
      closed += 1;
      await logEngine(
        "WARNING",
        `position sweep: ${p.symbol} ${p.side} closed at broker, settled locally @ ${px}`,
        { symbol: p.symbol, positionId: p.id },
        "execution"
      );
    } catch (e: any) {
      await logEngine("ERROR", `position sweep ${p.symbol}: ${String(e?.message ?? e)}`, null, "execution");
    }
  }
  return closed;
}

/**
 * Safety net: a broker position that no local row tracks (an entry whose fill was
 * never confirmed) has no stop-loss and no take-profit, so it is closed flat
 * rather than left running unattended.
 */
async function closeOrphanBrokerPositions(s: Settings): Promise<number> {
  if ((s["engine.mode"] ?? "demo") !== "live") return 0;
  const provider = String(s["market.primaryProvider"] ?? "nobitex");
  const held =
    provider === "wallex" ? await wallexActivePositions() : await nobitexActivePositions();
  if (!held || held.length === 0) return 0;
  const dbRows = await many<Row>(
    "SELECT symbol FROM open_positions WHERE status = 'open' AND COALESCE(mode, 'demo') = 'live'"
  );
  const known = new Set(dbRows.map((r) => String(r.symbol)));
  const inflight = await many<{ symbol: string }>(
    "SELECT DISTINCT symbol FROM orders WHERE mode = 'live' AND created_at > $1",
    [now() - 3 * 60_000]
  );
  const busy = new Set(inflight.map((r) => String(r.symbol)));
  let closed = 0;
  for (const p of held) {
    if (known.has(p.symbol) || busy.has(p.symbol)) continue;
    if (p.collateral <= 150_000) continue; // dust row: the exchange will not close it
    const adapter = getExecutionAdapter(provider, "crypto");
    try {
      const r = await adapter.closePosition(p.symbol, "short", p.qty, `orphan${Date.now()}`.slice(0, 32));
      closed += 1;
      await logEngine(
        "WARNING",
        `orphan sweep: closed untracked broker position ${p.symbol} (${p.qty})`,
        { symbol: p.symbol, result: r?.ok === true },
        "execution"
      );
    } catch (e: any) {
      await logEngine("ERROR", `orphan sweep ${p.symbol}: ${String(e?.message ?? e)}`, null, "execution");
    }
  }
  return closed;
}

/**
 * پوزیشن‌های صرافی که در پلتفرم ثبت نشده‌اند (فیل تأییدنشده، باز شدن دستی،
 * یا گردهای باقی‌ماندهٔ شورت) به‌صورت ردیف محلی ثبت می‌شوند تا پنل آن‌ها را
 * نشان دهد و موتور خودش با SL/TP ببندد. نوبیتکس پوزیشن را نمی‌بندد؛ فقط
 * لیکویید می‌کند.
 */
export async function adoptBrokerPositions(s?: Settings): Promise<number> {
  const settings = s ?? (await getSettings());
  if ((settings["engine.mode"] ?? "demo") !== "live") return 0;
  if (settings["market.adoptBrokerPositions"] === false) return 0;
  const held =
    String(settings["market.primaryProvider"] ?? "nobitex") === "wallex"
      ? await wallexActivePositions()
      : await nobitexActivePositions();
  if (!held || held.length === 0) return 0;
  const rows = await many<Row>(
    "SELECT symbol FROM open_positions WHERE status = 'open' AND COALESCE(mode, 'demo') = 'live'"
  );
  const tracked = new Set(rows.map((r) => String(r.symbol)));
  // Wallex reports prices in TOMAN, Nobitex in RIAL (1 toman = 10 rial). Mixing
  // them wrote entry=179 for an ETH position whose real entry was 1794 and booked
  // a fake +19 USDT profit. The provider picks the unit here.
  const providerForRate = String(settings["market.primaryProvider"] ?? "nobitex");
  let rate = 0;
  try {
    rate = providerForRate === "wallex" ? num(await wallexTomanRate()) : num(await nobitexRialPerUsdt());
  } catch {
    /* قیمت دلار در دسترس نیست: ورودی از قیمت بازار حساب می‌شود */
  }
  if (!(rate > 0)) {
    try {
      rate = num(await usdtTomanRate()) * (providerForRate === "wallex" ? 1 : 10);
    } catch {
      rate = 0;
    }
  }
  const slPct = Math.max(0.004, num(settings["risk.fallbackRiskPct"], 1.2) / 100);
  const rrTarget = Math.max(1.2, num(settings["risk.minRR"], 1.6));
  let adopted = 0;
  for (const p of held) {
    if (tracked.has(p.symbol)) continue;
    const tick = await fetchTicker(p.symbol).catch(() => null);
    const market = num(tick?.price);
    // وثیقهٔ حداقلی (۱۵۰ هزار ریال) یعنی پوزیشن «گرد» است؛ ورودی واقعی معلوم
    // نیست، پس قیمت بازار مبنا می‌شود و حد ضرر/سود گذاشته نمی‌شود تا موتور
    // هر تیک برای بستن آن تلاش نکند.
    // Collateral alone is not the test: a position that was closed down to a few
    // cents keeps a 450,000-rial collateral but its notional is far under the
    // exchange minimum, so it can never be closed and must not be tracked.
    const dust = p.collateral <= 160_000 || (rate > 0 && p.mark > 0 && (p.qty * p.mark) / rate < 0.2);
    // Dust has no trustworthy entry, cannot carry SL/TP and the exchange refuses
    // to close it: importing it only blocks the symbol and costs extension fee.
    if (dust) continue;
    // Nobitex reports the real fill price of a margin position (rial) — use it
    // instead of guessing from the collateral when it is available.
    const brokerEntry = rate > 0 ? p.entryPrice / rate : 0;
    const entry =
      brokerEntry > 0 ? brokerEntry : !dust && p.qty > 0 && rate > 0 ? p.collateral / p.qty / rate : market;
    if (!(entry > 0)) continue;
    const short = p.side === "short";
    const sl = dust ? 0 : short ? entry * (1 + slPct) : entry * (1 - slPct);
    const tp = dust ? 0 : short ? entry * (1 - slPct * rrTarget) : entry * (1 + slPct * rrTarget);
    const size = Number((entry * p.qty).toFixed(8));
    const margin = rate > 0 ? Number((p.collateral / rate).toFixed(8)) : size;
    try {
      await pool.query(
        `INSERT INTO open_positions
         (symbol, market, side, entry, current, quantity, size, leverage, margin, pnl, pnl_pct,
          score, confidence, strategy_keys, exchange, fee, stop_loss, take_profit, targets, progress,
          status, open_time, last_analysis, last_update, mode, source, type, dca_count, user_id)
         VALUES ($1,'crypto',$2,$3,$4,$5,$6,$13,$7,0,0,0,0,$8,'nobitex',0,$9,$10,'{}',0,
                 'open',$11,$11,$11,'live',$12,'futures',0,NULL)
         ON CONFLICT DO NOTHING`,
        [
          p.symbol, short ? "short" : "long", entry,
          // markPrice is quoted in rial like entryPrice
          p.mark > 0 && rate > 0 ? p.mark / rate : market || entry,
          p.qty, size, margin, ["adopted_broker"], sl, tp, now(), "broker_adopt",
          Math.max(1, p.leverage || 1),
        ]
      );
      adopted += 1;
      await logEngine(
        "WARNING",
        `adopted broker position ${p.symbol} ${short ? "short" : "long"} qty=${p.qty} entry=${round(entry, 6)} sl=${round(sl, 6)} tp=${round(tp, 6)}`,
        { symbol: p.symbol, qty: p.qty, collateral: p.collateral, dust },
        "execution"
      );
    } catch (e: any) {
      await logEngine("ERROR", `adopt ${p.symbol}: ${String(e?.message ?? e).slice(0, 160)}`, null, "execution");
    }
  }
  return adopted;
}

export async function closePosition(
  positionId: string,
  reason: string,
  price: number,
  p?: Row,
  s?: any,
  opts?: { skipBroker?: boolean }
): Promise<Row | null> {
  const pos = p ?? (await one<Row>("SELECT * FROM open_positions WHERE id = $1", [positionId]));
  if (!pos || pos.status !== "open") return null;
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("invalid_close_price");
  }
  const settings = s ?? (await getSettings());
  const qty = num(pos.quantity);
  const entry = num(pos.entry);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(qty) || qty <= 0) {
    throw new Error("invalid_position_values");
  }
  if (Math.abs(price - entry) < Math.max(entry * 1e-6, 1e-12)) {
    // stale_feed: the market stopped printing, so the entry price IS the exit.
    if (!reason.includes("emergency") && !reason.includes("manual") && reason !== "admin_close" &&
        reason !== "circuit_breaker" && reason !== "exchange_closed" && reason !== "stale_feed") {
      throw new Error("close_price_equals_entry");
    }
  }
  const exit = pos.mode === "live" && !opts?.skipBroker ? await executeVerifiedExit(pos, settings, qty, price) : null;
  if (exit) price = exit.price;
  const grossPnl = pos.side === "long" ? (price - entry) * qty : (entry - price) * qty;
  // What the broker keeps: two trade fees + position fee + one renewal block
  // per 8h held + the pool share of a win. The pnl stored below is the NET
  // that reaches the wallet, so equity, learning and reports never flatter
  // themselves.
  const heldHours = Math.max(0, (now() - num(pos.open_time)) / 3_600_000);
  const costs = netPnlUsd(costModel(settings), {
    notionalUsd: Math.abs(entry * qty),
    holdHours: heldHours,
    grossPnlUsd: grossPnl,
  });
  const pnl = round(costs.netUsd, 8);
  const feeTotal = round(costs.costUsd, 8);
  // A stop that fires in profit is a TREND stop, not a failed stop: reports and
  // the learning loop must not count a locked-in win as a losing stop-out.
  const reasonFinal = /stop_loss|trail_stop|trailing_stop/.test(reason) && pnl > 0 ? "trailing_stop" : reason;

  let closed: Row;
  try { closed = await tx(async (c) => {
    const locked = await c.query("SELECT quantity FROM open_positions WHERE id = $1 AND status = 'open' FOR UPDATE", [positionId]);
    if (!locked.rows.length || Math.abs(num(locked.rows[0].quantity) - qty) >= 0.000000005) {
      throw new Error("close_position_changed");
    }
    const r = await c.query(
      `INSERT INTO closed_positions
         (symbol, market, side, entry, current, close_price, close_time, close_reason,
          quantity, size, leverage, margin, pnl, profit, pnl_pct, score, confidence,
          strategy_keys, exchange, fee, stop_loss, take_profit, targets, rr, status,
          open_time, mode, type, error, user_id, gross_pnl)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'closed',$25,$26,$27,$28,$29,$30)
       RETURNING *`,
      [
        pos.symbol, pos.market, pos.side, entry, price, price, now(), reasonFinal,
        qty, num(pos.size), num(pos.leverage), num(pos.margin), round(pnl, 8),
        round(pnl, 8), num(pos.margin) > 0 ? round((pnl / num(pos.margin)) * 100, 4) : 0,
        num(pos.score), num(pos.confidence), pos.strategy_keys ?? [], pos.exchange ?? "paper",
        feeTotal, num(pos.stop_loss), num(pos.take_profit),
        pos.targets ?? [], rrOf(pos), pos.open_time, pos.mode ?? "demo",
        pos.type ?? "futures", null,
        pos.user_id ?? null,
        round(costs.grossUsd, 8),
      ]
    );
    await settleFrozenCapital(c, pos.id, num(pos.margin), pnl);
    await addRealizedPnl(c, pnl);
    if (exit) await c.query("UPDATE orders SET status = 'filled' WHERE id = $1", [exit.intentId]);
    await c.query("DELETE FROM open_positions WHERE id = $1", [positionId]);
    return r.rows[0] as Row;
  }); } catch (error: any) {
    if (exit) await markExitForReconciliation(exit.intentId, `close local commit failed: ${String(error?.message ?? error)}`);
    throw error;
  }

  await logEngine("TRADE", `CLOSE ${pos.symbol} ${pos.side} @ ${price} reason=${reason} pnl=${round(pnl, 4)}`, null, "engine");


  // learning record + AI review (best effort — never blocks)
  try {
    await recordLearning(pos, closed, settings);
  } catch {
    /* ignore */
  }
  if (settings["telegram.enabled"] && settings["channel.postTrades"]) {
    const capAfter = engineCapital(settings);
    void notifyTradeChannel({ ...pos, profit: pnl, closeReason: reason, capital: capAfter - pnl, capitalAfter: capAfter }, "close").catch((error) => logEngine("WARNING", `trade close alert failed: ${error.message}`, { positionId }, "bot"));
  }
  return closed;
}

function rrOf(p: Row): number {
  const entry = num(p.entry);
  const sl = num(p.stop_loss);
  const tp = num(p.take_profit);
  if (sl === entry) return 0;
  return Math.abs(tp - entry) / Math.abs(entry - sl);
}

async function recordLearning(pos: Row, closed: Row, s: any): Promise<void> {
  const win = num(closed.profit) >= 0;
  const pnl = num(closed.profit);
  const strategies = pos.strategy_keys ?? [];
  const entry = num(pos.entry);
  const closePrice = num(closed.close_price);
  const reason = closed.close_reason ?? (win ? "take_profit" : "stop_loss");

  // Perform root-cause diagnosis
  const diag = diagnoseTradeOutcome(
    pos.side,
    entry,
    closePrice,
    pnl,
    reason
  );

  await pool.query(
    `INSERT INTO learning_history (symbol, timeframe, strategies, scores, decision, result, pnl, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      pos.symbol, pos.type === "spot" ? "spot" : "futures", strategies,
      JSON.stringify({ score: num(pos.score), confidence: num(pos.confidence), diagnosis: diag.code, summary: diag.summaryEn, recommendation: diag.recommendation }),
      pos.side, win ? "win" : "loss", round(pnl, 8), now(),
    ]
  );
  // strategy performance aggregation
  for (const k of strategies.slice(0, 10)) {
    await pool.query(
      `INSERT INTO strategy_performance (strategy_key, trades, wins, losses, win_rate, total_pnl, avg_pnl, updated_at)
       VALUES ($1, 1, $2, $3, $4, $5, $5, $6)
       ON CONFLICT (strategy_key) DO UPDATE SET
         trades = strategy_performance.trades + 1,
         wins = strategy_performance.wins + $2,
         losses = strategy_performance.losses + $3,
         win_rate = (strategy_performance.wins + $2)::numeric * 100 / (strategy_performance.trades + 1),
         total_pnl = strategy_performance.total_pnl + $5,
         avg_pnl = strategy_performance.total_pnl / strategy_performance.trades,
         updated_at = EXCLUDED.updated_at`,
      [k, win ? 1 : 0, win ? 0 : 1, win ? 100 : 0, round(pnl, 8), now()]
    );
  }
  // AI review (fire-and-forget; AI must never block the engine)
  if (s["ai.enabled"]) {
    void aiAsk(
      "review",
      "You are a trading review assistant. Analyze this closed trade, list 2-3 concrete lessons in the user's language.",
      JSON.stringify({
        symbol: pos.symbol, side: pos.side, entry, exit: closePrice,
        pnl, reason, strategies, score: num(pos.score), diagnosis: diag.code,
      }),
      { cacheKey: `review:${pos.id}` }
    ).then((r) => {
      if (r) {
        return pool.query(
          `UPDATE learning_history SET ai_review = $1 WHERE symbol = $2 AND created_at = (SELECT max(created_at) FROM learning_history WHERE symbol = $2)`,
          [r.text, pos.symbol]
        );
      }
    }).catch(() => undefined);
  }
}

async function createSignal(
  symbol: string,
  timeframe: string,
  decision: ReturnType<typeof computeDecision>,
  price: number,
  votes: { key: string; direction: string }[],
  mode: "demo" | "live",
  stopLoss: number,
  takeProfit: number,
): Promise<void> {
  const side = decision.direction;
  if (side === "neutral") return;
  const entry = Number(price);
  if (!Number.isFinite(entry) || entry <= 0) return;
  const sl = stopLoss;
  const tp = takeProfit;
  if (!validExitLevels(side, entry, sl, tp)) return;
  await pool.query("UPDATE signals SET status='expired' WHERE status='open' AND expires_at <= $1", [now()]);
  const duplicate = await one("SELECT id FROM signals WHERE symbol=$1 AND timeframe=$2 AND direction=$3 AND mode=$4 AND status='open' AND expires_at > $5 LIMIT 1", [symbol, timeframe, side, mode, now()]);
  if (duplicate) return;
  if ((side === "long" && (sl >= entry || tp <= entry)) ||
      (side === "short" && (sl <= entry || tp >= entry))) return;
  const targets = buildStagedTargets(side, entry, sl, tp, 8);
  await pool.query(
    `INSERT INTO signals (symbol, timeframe, direction, entry, stop_loss, take_profit, targets, rr, score, confidence, strategy_keys, aggregate, price, mode, status, created_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'open',$15,$16)`,
    [
      symbol, timeframe, side, entry, sl, tp, targets, Math.abs(tp - entry) / Math.abs(entry - sl),
      decision.score, Math.max(decision.longShare, decision.shortShare),
      side === "long" ? decision.longs.slice(0, 5) : decision.shorts.slice(0, 5),
      JSON.stringify({ longShare: decision.longShare, shortShare: decision.shortShare, agreement: decision.agreement }),
      price, mode, now(), now() + 3600_000,
    ]
  );
}

// ── Emergency controls (admin) ───────────────────────────────────────────────
export async function emergencyStop(stop: boolean): Promise<void> {
  const s = await getSettings();
  s["engine.emergencyStop"] = stop;
  await pool.query(
    `INSERT INTO system_settings (key, value, group_name, updated_at) VALUES ('engine.emergencyStop', $1, 'engine', $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [JSON.stringify(stop), now()]
  );
  await logEngine("CRITICAL", `EMERGENCY STOP ${stop ? "ENGAGED" : "RELEASED"}`, null, "engine");
}

export async function closeAllPositions(reason = "emergency_close_all"): Promise<number> {
  const open = await many<Row>("SELECT * FROM open_positions WHERE status = 'open'");
  let n = 0;
  for (const p of open) {
    const tick = await fetchTicker(p.symbol).catch(() => null);
    const price = Number(tick?.price);
    if (!Number.isFinite(price) || price <= 0) {
      await logEngine("WARNING", `close ${p.symbol} skipped: no valid live ticker`, null, "engine");
      continue;
    }
    try {
      await closePosition(p.id, reason, price, p);
      n++;
    } catch {
      /* keep going */
    }
  }
  await logEngine("CRITICAL", `CLOSE ALL POSITIONS (${n})`, null, "engine");
  return n;
}
