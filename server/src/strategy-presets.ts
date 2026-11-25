// -----------------------------------------------------------------------------
// WOLF Strategy Presets — 10 ready-to-use states for the strategy registry.
// Mirrors src/convex/strategyPresets.ts so the REST backend exposes the same
// one-click presets as the preview. Each preset enables a *compatible* set of
// strategies and writes bounded engine/risk settings for that style.
// -----------------------------------------------------------------------------
import { pool, many } from "./db.js";
import { getSetting, setSetting } from "./settings.js";
import { clean } from "./util.js";
import { logEngine } from "./db.js";

export type StrategyPreset = {
  id: string;
  icon: string;
  nameFa: string;
  nameEn: string;
  descriptionFa: string;
  descriptionEn: string;
  keys: string[];
  risk: Record<string, number | boolean | string>;
  market?: "crypto" | "forex" | "all";
  recommended?: boolean;
};

export const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    id: "all_rounder", icon: "⚖️", nameFa: "همه‌کاره متوازن", nameEn: "Balanced All-Rounder",
    descriptionFa: "ترکیب امن از روند + مومنتوم + ساختار + پرایس اکشن. برای شروع و بیشتر بازارها، بدون تداخل منطقی.",
    descriptionEn: "Safe blend of trend + momentum + structure + price action. Best starting point for most markets, no logical conflicts.",
    keys: ["trend_ema", "trend_macd", "trend_adx", "combo_trio", "combo_ema_rsi", "combo_wolf", "mom_rsi", "brk_level", "sr_levels", "smc_ob", "struct_bos", "swing_retest", "vol_spike", "pa_engulfing"],
    risk: { "risk.minScore": 30, "risk.minConfidence": 0.5, "risk.minConsensus": 0.52, "risk.minConfirmations": 3, "risk.minRR": 1.0 },
    market: "all", recommended: true,
  },
  {
    id: "trend_rider", icon: "📈", nameFa: "سوار روند", nameEn: "Trend Rider",
    descriptionFa: "پیروی از روند با EMA، MACD، ADX، سوپرترند و پولبک. مناسب بازارهای دارای حرکت؛ میانگین‌ها و بازگشت به میانگین خاموش‌اند.",
    descriptionEn: "Trend-following with EMA, MACD, ADX, SuperTrend and pullbacks. For trending markets; mean-reversion is excluded.",
    keys: ["trend_ema", "trend_cross", "trend_macd", "trend_adx", "trend_supertrend", "trend_psar", "trend_channel", "swing_pullback", "mtf_highertf", "mtf_filter", "mtf_bias", "combo_trio", "vol_obv"],
    risk: { "risk.minScore": 25, "risk.minConfidence": 0.45, "risk.minConsensus": 0.5, "risk.minConfirmations": 2, "risk.minRR": 1.0 },
    market: "all",
  },
  {
    id: "breakout_hunter", icon: "💥", nameFa: "شکارچی بریک‌اوت", nameEn: "Breakout Hunter",
    descriptionFa: "شکست تثبیت، مثلث، دونچیان و اسکویز بولینجر با تأیید حجم. مناسب خروج از رنج؛ استراتژی‌های بازگشتی خاموش‌اند.",
    descriptionEn: "Consolidation/triangle/Donchian/squeeze breakouts with volume confirmation. For range-breakouts; fade strategies excluded.",
    keys: ["brk_consolidation", "brk_donchian", "brk_level", "brk_volatility", "brk_move", "pat_triangle", "pat_rectangle", "pat_flag", "vola_bbsqueeze", "vola_range", "vola_funnel", "sr_pivot", "vol_spike"],
    risk: { "risk.minScore": 30, "risk.minConfidence": 0.5, "risk.minConsensus": 0.52, "risk.minConfirmations": 2, "risk.minRR": 1.0 },
    market: "all",
  },
  {
    id: "mean_reversion", icon: "🪃", nameFa: "بازگشت به میانگین", nameEn: "Mean Reversion",
    descriptionFa: "بولینجر، RSI(2)، Z-Score و کلتنر برای خرید اشباع فروش و فروش اشباع خرید. ضد روند — استراتژی‌های دنبال‌کننده روند خاموش‌اند.",
    descriptionEn: "Bollinger, RSI(2), Z-Score and Keltner for faded extremes. Contrarian by design — trend-following is switched off.",
    keys: ["meanr_bb", "meanr_rsi2", "meanr_zscore", "meanr_keltner", "mom_rsi", "sr_levels", "sr_fib", "vola_atr", "pa_doji", "pa_hammershooting"],
    risk: { "risk.minScore": 30, "risk.minConfidence": 0.5, "risk.minConsensus": 0.5, "risk.minConfirmations": 2, "risk.minRR": 1.2 },
    market: "all",
  },
  {
    id: "scalp_fast", icon: "⚡", nameFa: "اسکالپ سریع", nameEn: "Fast Scalp",
    descriptionFa: "اسکالپ از حمایت/مقاومت، VWAP و کیل‌زون با استوکاستیک و CCI. معاملات کوتاه و پرتعداد — مناسب فارکس و تایم‌فریم‌های کوچک.",
    descriptionEn: "S/R scalps, VWAP and killzones with Stoch/CCI. Short, frequent trades — suited to forex and low timeframes.",
    keys: ["scalp_snr", "scalp_vwap", "scalp_momentum", "mom_stoch", "mom_cci", "mom_williams", "liq_sweep", "ict_killzone", "brk_move", "vol_spike"],
    risk: { "risk.minScore": 25, "risk.minConfidence": 0.45, "risk.minConsensus": 0.48, "risk.minConfirmations": 2, "risk.minRR": 1.0, "risk.maxDailyTrades": 20, "risk.maxOpenPositions": 5, "risk.maxHoldingMinutes": 180, "risk.timeStopEnabled": true, "risk.trailingStop": true },
    market: "forex",
  },
  {
    id: "smc_master", icon: "🏦", nameFa: "اس‌ام‌سی / پول هوشمند", nameEn: "SMC / Smart Money",
    descriptionFa: "اُردر بلاک، FVG، برداشت نقدینگی و شکست ساختار. منطق نهادها — مناسب همه بازارها با خروجی کم‌تر ولی کیفیت بالاتر.",
    descriptionEn: "Order blocks, FVG, liquidity sweeps and structure breaks. Institutional logic — fewer, higher-quality setups.",
    keys: ["smc_ob", "smc_fvg", "smc_liquidity", "smc_mitigation", "smc_imbalance", "smc_breaker", "liq_sweep", "liq_poi", "struct_bos", "struct_choch", "struct_mss", "combo_wolf"],
    risk: { "risk.minScore": 28, "risk.minConfidence": 0.48, "risk.minConsensus": 0.5, "risk.minConfirmations": 2, "risk.minRR": 1.0 },
    market: "all",
  },
  {
    id: "ict_precision", icon: "🎯", nameFa: "آی‌سی‌تی دقیق", nameEn: "ICT Precision",
    descriptionFa: "کیل‌زون، OTE، سیلور بولت و پاور ۳ با فیلتر FVG. ورودهای ظریف در سشن‌های لندن/نیویورک.",
    descriptionEn: "Killzones, OTE, Silver Bullet and Power of 3 with FVG filters. Precise entries around London/NY sessions.",
    keys: ["ict_killzone", "ict_opening", "ict_ote", "ict_silverbullet", "ict_power3", "ict_smart", "smc_fvg", "smc_liquidity", "liq_session", "mtf_highertf"],
    risk: { "risk.minScore": 28, "risk.minConfidence": 0.48, "risk.minConsensus": 0.5, "risk.minConfirmations": 2, "risk.minRR": 1.0 },
    market: "all",
  },
  {
    id: "swing_structure", icon: "🌊", nameFa: "سوینگ و ساختار", nameEn: "Swing & Structure",
    descriptionFa: "ری‌تست، پولبک و الگوهای کلاسیک (سر و شانه، جام و دسته) با احترام به ساختار. معاملات طولانی‌تر با R:R بالاتر.",
    descriptionEn: "Retests, pullbacks and classic patterns (H&S, cup & handle) respecting structure. Longer holds with higher R:R.",
    keys: ["swing_retest", "swing_pullback", "swing_aroon", "swing_harami", "struct_continuation", "struct_reversal", "pat_double", "pat_headshoulder", "pat_cup", "sr_trendline", "sr_levels", "trend_ema"],
    risk: { "risk.minScore": 30, "risk.minConfidence": 0.5, "risk.minConsensus": 0.52, "risk.minConfirmations": 2, "risk.minRR": 1.2 },
    market: "all",
  },
  {
    id: "momentum_burst", icon: "🚀", nameFa: "موج مومنتوم", nameEn: "Momentum Burst",
    descriptionFa: "RSI، ROC، CCI و هیستوگرام MACD با تأیید حجم و OBV. ورود هم‌جهت حرکت قوی — بازگشت به میانگین خاموش است.",
    descriptionEn: "RSI, ROC, CCI and MACD histogram with volume/OBV confirmation. Rides strong moves — mean-reversion excluded.",
    keys: ["mom_rsi", "mom_macdhist", "mom_roc", "mom_cci", "mom_williams", "vol_spike", "vol_obv", "vol_vwap", "brk_move", "pa_hammershooting", "combo_trio"],
    risk: { "risk.minScore": 30, "risk.minConfidence": 0.5, "risk.minConsensus": 0.52, "risk.minConfirmations": 2, "risk.minRR": 1.0 },
    market: "all",
  },
  {
    id: "wolf_confluence", icon: "🐺", nameFa: "کانفلوئنس WOLF", nameEn: "WOLF Confluence",
    descriptionFa: "ترکیب اختصاصی WOLF: ساختار + نقدینگی + واگرایی + ترکیب‌های کلاسیک. بالاترین کیفیت سیگنال با تداخل کنترل‌شده — پیشنهاد اصلی.",
    descriptionEn: "The signature WOLF blend: structure + liquidity + divergence + classic combos. Highest-signal-quality with controlled overlap — recommended.",
    keys: ["combo_wolf", "combo_trio", "combo_ema_rsi", "combo_macd_bb", "trend_ema", "smc_ob", "smc_fvg", "struct_bos", "liq_sweep", "sr_levels", "vol_spike", "pa_pinbar"],
    risk: { "risk.minScore": 25, "risk.minConfidence": 0.45, "risk.minConsensus": 0.5, "risk.minConfirmations": 2, "risk.minRR": 1.0 },
    market: "all", recommended: true,
  },
];

export function getStrategyPreset(id: string): StrategyPreset | undefined {
  return STRATEGY_PRESETS.find((p) => p.id === id);
}

function boolValue(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

const PRESET_KEY_ALIASES: Record<string, string> = {
  trend_ema: "ema_cross", trend_cross: "ema_50_200", trend_macd: "macd_trend",
  trend_adx: "adx_trend", trend_supertrend: "supertrend", trend_psar: "parabolic_sar",
  trend_channel: "donchian", swing_pullback: "swing_break_retest",
  mtf_highertf: "higher_tf_bias", mtf_filter: "mtf_trend_align", mtf_bias: "mtf_regime",
  combo_trio: "macd_ema_combo", combo_ema_rsi: "ema_rsi_combo", combo_wolf: "smc_trend_combo",
  combo_macd_bb: "stoch_macd_combo", mom_rsi: "rsi_momentum", mom_stoch: "stoch_mom",
  mom_cci: "cci_mom", mom_williams: "williams_r", mom_macdhist: "macd_hist", mom_roc: "roc_mom",
  brk_consolidation: "range_breakout", brk_donchian: "donchian", brk_level: "range_breakout",
  brk_volatility: "atr_breakout", brk_move: "momentum_breakout", pat_triangle: "triangle_breakout",
  pat_rectangle: "box_breakout", pat_flag: "flag_breakout", vola_bbsqueeze: "bb_squeeze",
  vola_range: "volatility_contraction", vola_funnel: "kc_expansion", vola_atr: "atr_stop",
  sr_pivot: "pivot_sr", sr_levels: "s_r_levels", sr_fib: "fib_retracement", sr_trendline: "trendline_break",
  meanr_bb: "bollinger_rev", meanr_rsi2: "rsi_rev", meanr_zscore: "zscore_rev",
  meanr_keltner: "keltner_trend", pa_doji: "doji_star", pa_hammershooting: "hammer",
  pa_engulfing: "engulfing", pa_pinbar: "pin_bar", scalp_snr: "s_r_levels",
  scalp_vwap: "vwap_scalp", scalp_momentum: "m5_rsi_scalp", liq_sweep: "liquidity_grab",
  smc_ob: "order_block", smc_fvg: "fvg", smc_liquidity: "liquidity_grab",
  smc_mitigation: "mitigation", smc_imbalance: "fvg", smc_breaker: "breakers",
  liq_poi: "liquidity_pool", struct_bos: "bos", struct_choch: "choch", struct_mss: "mss",
  ict_killzone: "killzones", ict_opening: "opening_range", ict_ote: "fib_retracement",
  ict_silverbullet: "silver_bullet", ict_power3: "power_of_3", ict_smart: "smt",
  liq_session: "overlap_session", swing_retest: "swing_break_retest", swing_aroon: "higher_tf_bias",
  swing_harami: "harami", struct_continuation: "trend_structure",
  struct_reversal: "reversal_structure", pat_double: "double_bottom",
  pat_headshoulder: "head_shoulders", pat_cup: "cup_handle", vol_spike: "volume_spike",
  vol_obv: "obv_trend", vol_vwap: "vwap_trend",
};

function resolvePresetKeys(keys: string[], available: Set<string>): Set<string> {
  return new Set(keys.map((key) => available.has(key) ? key : PRESET_KEY_ALIASES[key]).filter((key): key is string => Boolean(key && available.has(key))));
}

export async function listStrategyPresets(): Promise<any> {
  const rows = await many("SELECT key, enabled, engine_enabled FROM strategies");
  const enabledKeys = new Set(rows.filter((r) => boolValue(r.enabled) && boolValue(r.engine_enabled)).map((r) => String(r.key)));
  const byKey = new Map(rows.map((r) => [String(r.key), r]));
  const currentPreset = String((await getSetting("engine.strategyPreset")) ?? "") || "";
  const presets = STRATEGY_PRESETS.map((p) => {
    // Preset labels intentionally use readable aliases; resolve them to the
    // actual registry keys before reporting counts and active state.
    const matched = [...resolvePresetKeys(p.keys, new Set(byKey.keys()))];
    const active = matched.filter((k) => enabledKeys.has(k)).length;
    return {
      id: p.id,
      icon: p.icon,
      nameFa: p.nameFa,
      nameEn: p.nameEn,
      descriptionFa: p.descriptionFa,
      descriptionEn: p.descriptionEn,
      market: p.market ?? "all",
      recommended: Boolean(p.recommended),
      strategyCount: matched.length,
      activeCount: active,
      isActive: active === matched.length && active > 0,
    };
  });
  return { presets, current: currentPreset, total: rows.length };
}

export async function applyStrategyPreset(presetId: string, by?: string | null): Promise<any> {
  const requestedId = clean(String(presetId ?? ""), 30).trim().toLowerCase();
  if (!requestedId) throw new Error("preset_required");
  // Enabling every registered strategy creates opposing votes and makes the
  // engine indecisive. The dashboard's legacy "all" action now means the
  // curated WOLF confluence bundle, not all 165 unrelated rules at once.
  const id = requestedId === "all" ? "wolf_confluence" : requestedId;
  let enabled: boolean;
  let keys: string[] = [];
  if (id === "none") {
    enabled = false;
  } else {
    const preset = getStrategyPreset(id);
    if (!preset) throw new Error(`preset_not_found:${STRATEGY_PRESETS.map((p) => p.id).join(",")}`);
    enabled = true;
    keys = preset.keys;
  }
  const rows = await many("SELECT id, key, enabled, engine_enabled FROM strategies");
  const resolvedKeys = resolvePresetKeys(keys, new Set(rows.map((row) => String(row.key))));
  let changed = 0;
  for (const row of rows) {
    const key = String(row.key);
    const on = enabled && (keys.length === 0 || resolvedKeys.has(key));
    const cur = boolValue(row.enabled) && boolValue(row.engine_enabled);
    if (cur !== on) {
      await pool.query("UPDATE strategies SET enabled = $1, engine_enabled = $1 WHERE id = $2", [on, row.id]);
      changed++;
    }
  }
  if (id !== "none") {
    await setSetting("engine.strategyPreset", id, "admin:strategy-preset", by ?? null);
  }
  await logEngine("INFO", `strategy-preset applied=${id} requested=${requestedId} changed=${changed}`, null, "system");
  return { ok: true, preset: id, requestedPreset: requestedId, enabled: enabled ? resolvedKeys.size : 0, changed };
}

/**
 * Applies MULTIPLE non-conflicting presets at once: the union of every
 * selected preset's strategy keys is enabled, everything else is disabled,
 * while the separately chosen risk profile remains unchanged. Mirrors
 * src/convex/strategies.ts:applyMultipleStrategyPresets — this was missing
 * from the REST server entirely, so the "apply" button on this screen
 * silently hit /api/monitor/health and did nothing.
 */
export async function applyMultipleStrategyPresets(
  presetIds: string[],
  by?: string | null
): Promise<any> {
  const rows = await many("SELECT id, key, enabled, engine_enabled FROM strategies");
  if (rows.length === 0) throw new Error("strategies_not_seeded");

  const rawKeys: string[] = [];
  const validPresetIds: string[] = [];
  for (const raw of presetIds ?? []) {
    const id = String(raw ?? "").trim().toLowerCase();
    if (!id) continue;
    const preset = getStrategyPreset(id);
    if (preset) {
      validPresetIds.push(id);
      rawKeys.push(...preset.keys);
    }
  }
  const unionKeys = resolvePresetKeys(rawKeys, new Set(rows.map((row) => String(row.key))));

  let changed = 0;
  for (const row of rows) {
    const on = unionKeys.has(String(row.key));
    const cur = boolValue(row.enabled) && boolValue(row.engine_enabled);
    if (cur !== on) {
      await pool.query("UPDATE strategies SET enabled = $1, engine_enabled = $1 WHERE id = $2", [on, row.id]);
      changed++;
    }
  }
  await setSetting("engine.strategyPreset", validPresetIds.join(","), "admin:multi-strategy-preset", by ?? null);
  await logEngine("INFO", `multi-strategy-preset applied=[${validPresetIds.join(",")}] changed=${changed}`, null, "system");
  return { ok: true, activePresets: validPresetIds, enabledCount: unionKeys.size, changed };
}
