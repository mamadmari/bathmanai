// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — system settings
// Stored in system_settings (key → JSONB value). Every threshold is editable
// from the Admin panel; nothing important is hardcoded in the engine.
// ─────────────────────────────────────────────────────────────────────────────
import { pool, one } from "./db.js";
import { num, now } from "./util.js";
import { normalizeSetting } from "./setting-values.js";

export interface Settings {
  "engine.mode": "demo" | "live";
  "engine.autonomous": boolean;
  "engine.enabled": boolean;
  "engine.useAI": boolean;
  "telegram.enabled": boolean;
  "telegram.digestMinutes": number;
  "paper.notionalUsdt": number; // demo size per position (mirror the exchange floor)
  "channel.postTrades": boolean;
  "channel.postSignals": boolean;
  "trading.liveTradingEnabled": boolean;
  "trading.liveExecutionEnabled": boolean;
  "coins.referralEnabled": boolean;
  "engine.virtualCapital": number;
  "engine.scanIntervalSec": number;
  "engine.scanIntervalMinutes": number;
  "engine.concurrency": number;       // max NEW positions opened per tick
  "engine.peakCapital": number;       // equity high-water mark (drawdown breaker)
  "engine.maxTotalPositions": number;
  "engine.symbolScannerLimit": number;
  "engine.loopSeconds": number;
  "engine.capital": number;
  "engine.realizedPnl": number;
  "engine.tradeType": string;
  "risk.virtualCapital": number;
  "risk.realCapital": number;
  "risk.maxExposure": number;
  "risk.maxPosition": number;
  "risk.maxScaleIn": number;
  "risk.maxReentry": number;
  "risk.trailingStop": boolean;
  "risk.roiEnabled": boolean;
  "risk.roiTable": string;
  "risk.cooldownMinutes": number;
  "risk.protectionStoplossCount": number; // Freqtrade-style StoplossGuard: how many stop-losses trip the guard
  "risk.protectionStoplossWindowMin": number; // ... inside this rolling window (minutes)
  "risk.protectionCooldownMin": number; // entries stay blocked for this long after the guard trips
  "risk.protectionLossCooldownMin": number; // per-symbol cooldown after a losing close
  "risk.protectionMaxConsecutiveLosses": number; // block all entries after N losing closes in a row
  "risk.protectionLowProfitMinTrades": number; // LowProfitPairs: look at the last N closes of the symbol
  "risk.protectionLowProfitMinPct": number; // ... block it while their total profit is at/below this
  "risk.minRewardToCost": number; // target must be at least N x the round-trip cost
  "risk.volumeDroughtRatio": number; // relative volume below this hard-blocks an entry
  "risk.volumeLowRatio": number; // below this the setup only loses score
  "trading.reconcileTimeoutMin": number; // stale broker-reconcile rows are cleared after this
  "engine.executionTimeframe": string; // timeframe that owns price, ATR stop and targets
  "engine.analysisTimeframes": string; // comma list of the timeframes every strategy votes on
  "market.adoptBrokerPositions": boolean; // import broker positions the platform does not track yet
  "trading.feePct": number; // trade fee per side, in percent (Nobitex toman market = 0.25)
  "trading.slippagePct": number; // assumed slippage per side, in percent
  "trading.positionFeePct": number; // margin position fee, % of the delegated notional
  "trading.extensionPctPer8h": number; // renewal fee per 8h block, % of notional
  "trading.poolSharePctPerDay": number; // participation-pool share of a win, % per renewed day
  "trading.withdrawFeeToman": number; // flat toman withdrawal fee (0.02%, min 4,000)
  "risk.stopOffsetATR": number;
  "risk.tp1ATR": number;
  "risk.tp2ATR": number;
  "risk.tp3ATR": number;
  "risk.trailingActivatePct": number;
  "risk.trailingDistancePct": number;
  "risk.maxDrawdownAction": string;
  "risk.aiAdvisor": boolean;
  "risk.requireFreshData": boolean;
  "risk.opportunisticEnabled": boolean;
  "ai.freeFallback": boolean;
  "ai.randomProvider": boolean;
  "ai.selfVerify": boolean;
  "ai.secondaryEnabled": boolean;
  "ai.rotationMinutes": number;
  "ai.postEntryReviewMinutes": number;
  "auth.sessionHours": number;
  "channel.id": string;
  "channel.username": string;
  "channel.inviteLink": string;
  "channel.enId": string;
  "channel.enUsername": string;
  "channel.enInviteLink": string;
  "telegram.username": string;
  "db.host": string;
  "db.port": number;
  "db.name": string;
  "db.user": string;
  "db.password": string;
  "system.domain": string;
  "system.serverIp": string;
  "markets.syncMinutes": number;
  "markets.pricesMinutes": number;
  "markets.priceSeconds": number;
  "markets.candleSeconds": number;
  "fees.takerPct": number;
  "fees.makerPct": number;
  "fees.transferPct": number;
  "fees.transferFlatUsdt": number;
  "fees.platformNormal": number;
  "fees.platformBronze": number;
  "fees.platformSilver": number;
  "fees.platformGold": number;
  "fees.platformPlatinum": number;
  "fees.includePlatformCommission": boolean;
  "learning.educationHourUTC": number;
  "learning.autoGenerate": boolean;
  "learning.autoApprove": boolean;
  "data.pruneHours": number;
  "tts.enabled": boolean;
  "tts.baseUrl": string;
  "tts.voice": string;
  "tts.speed": number;
  "tts.apiKey": string;
  "usdt.tomanRate": number;
  "usdt.markupToman": number;
  "usdt.priceMode": string;
  "usdt.manualPrice": number;
  "usdt.sources": string;
  "coins.aiCost": number;
  "coins.rewardPrediction": number;
  "coins.rewardReferral": number;
  "coins.rewardReferralNew": number;
  "coins.packages": unknown;
  "vip.minCapital": number;
  "wallet.tomanCard": string;
  "wallet.tomanCardHolder": string;
  "wallet.swapwalletEnabled": boolean;
  "support.botUsername": string;
  "support.vipUsername": string;
  "swapwallet.apiKey": string;
  "engine.emergencyStop": boolean;
  "engine.pauseNewTrades": boolean;
  "engine.capitalAllocation": number; // % of virtual capital usable at once

  "risk.minScore": number;          // default 80 — entry threshold
  "risk.minConfidence": number;     // 0..1
  "risk.minConsensus": number;      // 0..1 (engine consensus gate)
  "risk.conflictShare": number;      // 0..1: both sides above this = no trade
  "risk.requireHtfAlignment": boolean; // reject entries that fight the higher timeframe
  "risk.guardTrailBufferPct": number;  // minimum profit (in %) the guard keeps when it moves the stop
  "risk.minConfirmations": number;  // min strategy confirmations
  "risk.minRR": number;
  "risk.maxStopPct": number; // hard cap on |entry-stop| as % of price
  "risk.maxTargetPct": number; // hard cap on |target-entry| as % of price
  "risk.riskPerTrade": number;      // % of capital risked per trade
  "risk.maxLeverage": number;
  "risk.maxOpenPositions": number;
  "risk.staleFeedHours": number;
  /** Wallex risk_coef: 1 = no leverage, 3 = exposure is 3x the collateral. */
  "wallex.riskCoef": number;
  "risk.maxSymbolExposure": number; // % of capital on one symbol
  "risk.maxDailyLoss": number;      // % of capital per day
  "risk.maxDailyTrades": number;
  "risk.exhaustionGuardEnabled": boolean;
  "risk.fallbackRiskPct": number;
  "risk.maxDrawdown": number;       // % engine-wide
  "risk.maxHoldingMinutes": number; // hard maximum lifetime of an open position
  "risk.timeStopEnabled": boolean;
  "risk.partialExitEnabled": boolean;
  "risk.partialExitPct": number;
  "risk.maxDCA": number;
  "risk.dcaEnabled": boolean;
  "risk.preset": "conservative" | "balanced" | "aggressive" | "custom";

  "trading.spotEnabled": boolean;
  "trading.futuresEnabled": boolean;
  "trading.allowSignals": boolean;

  "ai.enabled": boolean;
  "ai.provider": string;
  "ai.model": string;
  "ai.key": string;
  "ai.provider2": string;
  "ai.model2": string;
  "ai.key2": string;
  "ai.learningReviewHours": number; // AI learning-supervisor cadence
  "learning.autoApply": boolean;    // apply AI tuning automatically

  "chat.purgeHours": number;        // AI chat history retention (hours)

  "telegram.token": string;
  "telegram.channelEnId": string;   // English education channel
  "telegram.adminId": number;
  "telegram.assistantId": number;
  "telegram.channelId": string;
  "telegram.channelUsername": string;
  "telegram.webhookSecret": string;
  "telegram.webhookUrl": string;
  "telegram.miniAppUrl": string;
  "bale.enabled": boolean;
  "bale.token": string;
  "bale.providerToken": string;
  "bale.botUsername": string;
  "bale.minTopup": number;
  "bale.maxTopup": number;
  "bale.creditTestPayments": boolean;

  "support.email": string;          // landing / support settings (public)
  "support.telegramBot": string;    // support bot username (public)

  "usdt.rate": number;       // USDT → USD
  "usdt.irtRate": number;    // USDT → IRT (for display)
  "usdt.network": string;    // default deposit network

  "wallet.depositEnabled": boolean;
  "wallet.withdrawEnabled": boolean;
  "wallet.minWithdraw": number;

  "notify.trade": boolean;
  "notify.signal": boolean;
  "notify.system": boolean;
  "notify.telegram": boolean;
  "notify.channel": boolean;

  "vip.requestsEnabled": boolean;
  "vip.freeTrial": boolean;        // allow the one-time free VIP trial
  "vip.trialHours": number;        // free-trial duration in hours

  "coins.enabled": boolean;        // wolf-coin economy master switch
  "coins.coinPerHour": number;     // wolf-coins burned per idle hour
  "coins.rewardProfile": number; // wolf-coins reward for completing the profile (once)
  "coins.tomanPerCoin": number;  // wolf-coins purchase rate (toman per coin)

  "market.primaryProvider": string;
  "market.fallbackProviders": string[];
  "market.demoData": boolean; // demo candle generation (demo mode only)
  "market.nobitexQuote": "auto" | "usdt" | "rls" | "margin"; // Nobitex execution: auto = margin/rial while the wallet holds toman
  "market.nobitexAllowShorts": string; // "true" enables short entries in the margin wallet (settling leaves blocked collateral)
}

export const DEFAULT_SETTINGS: Settings = {
  "risk.exhaustionGuardEnabled": true,
  "risk.fallbackRiskPct": 0.8,
  "engine.mode": "demo",
  "engine.autonomous": true,
  "engine.enabled": true,
  "engine.useAI": true,
  "telegram.enabled": true,
  "telegram.digestMinutes": 10,
  "paper.notionalUsdt": 0,
  "channel.postTrades": true,
  "channel.postSignals": true,
  "trading.liveTradingEnabled": false,
  "trading.liveExecutionEnabled": false,
  "coins.referralEnabled": true,
  "engine.virtualCapital": 1000,
  "engine.scanIntervalSec": 60,
  "engine.scanIntervalMinutes": 1,
  "engine.concurrency": 3,
  "engine.peakCapital": 0,
  "engine.maxTotalPositions": 8,
  "engine.symbolScannerLimit": 40,
  "engine.loopSeconds": 60,
  "engine.capital": 1000,
  "engine.realizedPnl": 0,
  "engine.tradeType": "futures",
  "risk.virtualCapital": 1000,
  "risk.realCapital": 100,
  "risk.maxExposure": 35,
  "risk.maxPosition": 12,
  "risk.maxScaleIn": 0,
  "risk.maxReentry": 0,
  "risk.trailingStop": false,
  "risk.roiEnabled": false,
  "risk.roiTable": "",
  "risk.cooldownMinutes": 45,
  "risk.protectionStoplossCount": 3,
  "risk.protectionStoplossWindowMin": 60,
  "risk.protectionCooldownMin": 60,
  "risk.protectionLossCooldownMin": 30,
  "risk.protectionMaxConsecutiveLosses": 4,
  "risk.protectionLowProfitMinTrades": 8,
  "risk.protectionLowProfitMinPct": 0,
  "risk.minRewardToCost": 3,
  "risk.volumeDroughtRatio": 0.02,
  "risk.volumeLowRatio": 0.15,
  "trading.reconcileTimeoutMin": 10,
  "engine.executionTimeframe": "15m",
  "engine.analysisTimeframes": "1m,5m,15m,30m,1h,4h,1d",
  "market.adoptBrokerPositions": true,
  "trading.feePct": 0.25,
  "trading.slippagePct": 0.1,
  "trading.positionFeePct": 0.05,
  "trading.extensionPctPer8h": 0.064,
  "trading.poolSharePctPerDay": 0.5,
  "trading.withdrawFeeToman": 4000,
  "risk.stopOffsetATR": 1.3,
  "risk.tp1ATR": 1.8,
  "risk.tp2ATR": 3.0,
  "risk.tp3ATR": 4.5,
  "risk.trailingActivatePct": 4,
  "risk.trailingDistancePct": 1.5,
  "risk.maxDrawdownAction": "pause",
  "risk.aiAdvisor": true,
  "risk.requireFreshData": true,
  "risk.opportunisticEnabled": false,
  "ai.freeFallback": true,
  "ai.randomProvider": true,
  "ai.selfVerify": false,
  "ai.secondaryEnabled": false,
  "ai.rotationMinutes": 5,
  "ai.postEntryReviewMinutes": 30,
  "auth.sessionHours": 1,
  "channel.id": "",
  "channel.username": "",
  "channel.inviteLink": "",
  "channel.enId": "",
  "channel.enUsername": "",
  "channel.enInviteLink": "",
  "telegram.username": "",
  "db.host": "",
  "db.port": 5432,
  "db.name": "",
  "db.user": "",
  "db.password": "",
  "system.domain": "",
  "system.serverIp": "",
  "markets.syncMinutes": 15,
  "markets.pricesMinutes": 5,
  "markets.priceSeconds": 300,
  "markets.candleSeconds": 900,
  "fees.takerPct": 0.1,
  "fees.makerPct": 0.05,
  "fees.transferPct": 0.5,
  "fees.transferFlatUsdt": 1,
  "fees.platformNormal": 50,
  "fees.platformBronze": 30,
  "fees.platformSilver": 15,
  "fees.platformGold": 10,
  "fees.platformPlatinum": 10,
  "fees.includePlatformCommission": true,
  "learning.educationHourUTC": 4,
  "learning.autoGenerate": true,
  "learning.autoApprove": false,
  "data.pruneHours": 12,
  "tts.enabled": true,
  "tts.baseUrl": "",
  "tts.voice": "fa-IR-FaridNeural",
  "tts.speed": 1,
  "tts.apiKey": "",
  "usdt.tomanRate": 95000,
  "usdt.markupToman": 700,
  "usdt.priceMode": "auto",
  "usdt.manualPrice": 0,
  "usdt.sources": "",
  "coins.aiCost": 50,
  "coins.rewardPrediction": 5,
  "coins.rewardReferral": 0,
  "coins.rewardReferralNew": 5,
  "coins.packages": [],
  "vip.minCapital": 20,
  "wallet.tomanCard": "",
  "wallet.tomanCardHolder": "",
  "wallet.swapwalletEnabled": false,
  "support.botUsername": "",
  "support.vipUsername": "",
  "engine.emergencyStop": false,
  "engine.pauseNewTrades": false,
  "engine.capitalAllocation": 30,

  "risk.minScore": 80,
  "risk.minConfidence": 0.5,
  "risk.minConsensus": 0.55,
  "risk.conflictShare": 0.28,
  "risk.requireHtfAlignment": true,
  "risk.guardTrailBufferPct": 3,
  "risk.minConfirmations": 3,
  "risk.minRR": 1.2,
  "risk.maxStopPct": 2,
  "risk.maxTargetPct": 10,
  "risk.riskPerTrade": 1.5,
  "risk.maxLeverage": 20,
  "risk.maxOpenPositions": 2,
  "risk.staleFeedHours": 4,
  "wallex.riskCoef": 1,
  "risk.maxSymbolExposure": 25,
  "risk.maxDailyLoss": 5,
  "risk.maxDailyTrades": 20,
  "risk.maxDrawdown": 15,
  "risk.maxHoldingMinutes": 4320,
  "risk.timeStopEnabled": true,
  "risk.partialExitEnabled": true,
  "risk.partialExitPct": 40,
  "risk.maxDCA": 2,
  "risk.dcaEnabled": false,
  "risk.preset": "balanced",

  "trading.spotEnabled": true,
  "trading.futuresEnabled": true,
  "trading.allowSignals": true,

  "ai.enabled": true,
  "ai.provider": "gemini",
  "ai.model": "gemini-flash-latest",
  "ai.key": "",
  "ai.provider2": "openai",
  "ai.model2": "gpt-4o-mini",
  "ai.key2": "",
  "ai.learningReviewHours": 6,
  "learning.autoApply": true,

  "chat.purgeHours": 6,

  "telegram.token": "",
  "telegram.channelEnId": "",
  "telegram.adminId": 0,
  "telegram.assistantId": 0,
  "telegram.channelId": "",
  "telegram.channelUsername": "",
  "telegram.webhookSecret": "",
  "telegram.webhookUrl": "",
  "telegram.miniAppUrl": "",
  "bale.enabled": true,
  "bale.token": "",
  "bale.providerToken": "",
  "bale.botUsername": "wlofbot",
  "bale.minTopup": 50000,
  "bale.maxTopup": 50000000,
  "bale.creditTestPayments": false,

  "support.email": "",
  "support.telegramBot": "",

  "usdt.rate": 1,
  "usdt.irtRate": 0,
  "usdt.network": "TRC20",

  "wallet.depositEnabled": true,
  "wallet.withdrawEnabled": true,
  "wallet.minWithdraw": 10,

  "notify.trade": true,
  "notify.signal": true,
  "notify.system": true,
  "notify.telegram": true,
  "notify.channel": true,

  "vip.requestsEnabled": true,
  "vip.freeTrial": true,
  "vip.trialHours": 48,

  "coins.enabled": true,
  "coins.coinPerHour": 60,
  "coins.rewardProfile": 10,
  "coins.tomanPerCoin": 5000,

  "swapwallet.apiKey": "",

  "market.primaryProvider": "binance",
  "market.fallbackProviders": ["bybit", "okx", "bingx", "mexc", "gate"],
  "market.demoData": true,
  "market.nobitexQuote": "auto",
  "market.nobitexAllowShorts": "false",
};

export const RISK_PRESETS: Record<string, Partial<Settings>> = {
  ultra_conservative: {
    "risk.minScore": 90,
    "risk.minConfidence": 0.7,
    "risk.minRR": 2.0,
    "risk.riskPerTrade": 0.5,
    "risk.maxLeverage": 3,
    "risk.maxOpenPositions": 2,
    "risk.maxSymbolExposure": 10,
    "risk.maxDailyLoss": 1,
    "risk.maxDailyTrades": 5,
    "risk.maxDrawdown": 5,
    "risk.maxDCA": 0,
    "risk.dcaEnabled": false,
    "risk.minConsensus": 0.65,
    "risk.minConfirmations": 4,
    "risk.maxHoldingMinutes": 240,
    "risk.timeStopEnabled": true,
    "risk.trailingStop": true,
    "risk.partialExitEnabled": true,
    "risk.partialExitPct": 50,
    "risk.maxReentry": 0,
    "engine.capitalAllocation": 15,
  },
  conservative: {
    "risk.minScore": 85,
    "risk.minConfidence": 0.6,
    "risk.minRR": 1.5,
    "risk.riskPerTrade": 0.75,
    "risk.maxLeverage": 5,
    "risk.maxOpenPositions": 4,
    "risk.maxSymbolExposure": 15,
    "risk.maxDailyLoss": 2,
    "risk.maxDailyTrades": 8,
    "risk.maxDrawdown": 8,
    "risk.maxDCA": 1,
    "risk.dcaEnabled": false,
    "risk.minConsensus": 0.60,
    "risk.minConfirmations": 3,
    "risk.maxHoldingMinutes": 480,
    "risk.timeStopEnabled": true,
    "risk.trailingStop": true,
    "risk.partialExitEnabled": true,
    "risk.partialExitPct": 45,
    "risk.maxReentry": 1,
    "engine.capitalAllocation": 20,
  },
  balanced: {
    "risk.minScore": 80,
    "risk.minConfidence": 0.5,
    "risk.minRR": 1.2,
    "risk.riskPerTrade": 1.5,
    "risk.maxLeverage": 10,
    "risk.maxOpenPositions": 8,
    "risk.maxSymbolExposure": 25,
    "risk.maxDailyLoss": 5,
    "risk.maxDailyTrades": 15,
    "risk.maxDrawdown": 15,
    "risk.maxDCA": 2,
    "risk.dcaEnabled": false,
    "risk.minConsensus": 0.55,
    "risk.minConfirmations": 3,
    "risk.maxHoldingMinutes": 720,
    "risk.timeStopEnabled": true,
    "risk.trailingStop": true,
    "risk.partialExitEnabled": true,
    "risk.partialExitPct": 40,
    "risk.maxReentry": 2,
    "engine.capitalAllocation": 30,
  },
  aggressive: {
    "risk.minScore": 75,
    "risk.minConfidence": 0.45,
    "risk.minRR": 1.0,
    "risk.riskPerTrade": 2.5,
    "risk.maxLeverage": 20,
    "risk.maxOpenPositions": 15,
    "risk.maxSymbolExposure": 40,
    "risk.maxDailyLoss": 8,
    "risk.maxDailyTrades": 30,
    "risk.maxDrawdown": 25,
    "risk.maxDCA": 3,
    "risk.dcaEnabled": false,
    "risk.minConsensus": 0.50,
    "risk.minConfirmations": 2,
    "risk.maxHoldingMinutes": 360,
    "risk.timeStopEnabled": true,
    "risk.trailingStop": true,
    "risk.partialExitEnabled": true,
    "risk.partialExitPct": 35,
    "risk.maxReentry": 3,
    "engine.capitalAllocation": 45,
  },
  very_aggressive: {
    "risk.minScore": 70,
    "risk.minConfidence": 0.35,
    "risk.minRR": 1.2,
    "risk.riskPerTrade": 3.0,
    "risk.maxLeverage": 50,
    "risk.maxOpenPositions": 25,
    "risk.maxSymbolExposure": 50,
    "risk.maxDailyLoss": 15,
    "risk.maxDailyTrades": 50,
    "risk.maxDrawdown": 35,
    "risk.maxDCA": 5,
    "risk.dcaEnabled": false,
    "risk.minConsensus": 0.48,
    "risk.minConfirmations": 2,
    "risk.maxHoldingMinutes": 180,
    "risk.timeStopEnabled": true,
    "risk.trailingStop": true,
    "risk.partialExitEnabled": true,
    "risk.partialExitPct": 30,
    "risk.maxReentry": 4,
    "engine.capitalAllocation": 60,
  },
};

export async function getSettings(): Promise<Settings> {
  const rows = await pool
    .query("SELECT key, value FROM system_settings")
    .then((r) => r.rows);
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.value === null || r.value === undefined) {
      throw new Error(`invalid_system_setting:${r.key}`);
    }
    (out as any)[r.key] = normalizeSetting(r.key, r.value, DEFAULT_SETTINGS as unknown as Record<string, unknown>);
  }
  return out;
}

export async function getSetting<T>(key: string, fallback?: T): Promise<T | undefined> {
  const row = await one<{ value: unknown }>("SELECT value FROM system_settings WHERE key = $1", [key]);
  if (!row) return fallback;
  try {
    const v = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    return (v === undefined ? fallback : v) as T;
  } catch {
    return (row.value === undefined ? fallback : row.value) as T;
  }
}

export async function setSetting(
  key: string,
  value: unknown,
  group = "system",
  updatedBy?: string | null
): Promise<void> {
  value = normalizeSetting(key, value, DEFAULT_SETTINGS as unknown as Record<string, unknown>);
  const client = await pool.connect();
  try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(742019)");
  await client.query(
    `INSERT INTO system_settings (key, value, group_name, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
       group_name = EXCLUDED.group_name, updated_at = EXCLUDED.updated_at,
       updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(value ?? null), group, now(), updatedBy ?? null]
  );
  await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

/** Atomic custom edits with per-key optimistic concurrency. */
export async function saveSettingsPatch(patch: Record<string, unknown>, expected: Record<string, unknown>, by?: string | null): Promise<void> {
  const defaults = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
  const entries = Object.entries(patch).map(([key, value]) => [key, normalizeSetting(key, value, defaults)] as const);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(742019)");
    for (const [key, value] of entries) {
      const row = (await client.query("SELECT value FROM system_settings WHERE key = $1", [key])).rows[0];
      const current = row ? normalizeSetting(key, row.value, defaults) : defaults[key];
      if (Object.prototype.hasOwnProperty.call(expected, key) && JSON.stringify(normalizeSetting(key, expected[key], defaults)) !== JSON.stringify(current)) {
        throw new Error(`settings_conflict:${key}`);
      }
      await client.query(
        `INSERT INTO system_settings (key,value,group_name,updated_at,updated_by) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by`,
        [key, JSON.stringify(value), key.split(".")[0], now(), by ?? null]);
    }
    if (entries.some(([key]) => key.startsWith("risk.") || key === "engine.capitalAllocation")) {
      await client.query(`INSERT INTO system_settings (key,value,group_name,updated_at,updated_by) VALUES ('risk.preset','"custom"'::jsonb,'risk',$1,$2)
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by`, [now(), by ?? null]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

/** Apply a named risk preset (admin). */
export async function applyRiskPreset(preset: string, by?: string | null): Promise<void> {
  const p = RISK_PRESETS[preset];
  if (!p) throw new Error("پیش‌تنظیم نامعتبر است.");
  const entries: Array<[string, unknown, string]> = Object.entries(p).map(([key, value]) => [key, value, "risk"]);
  if (p["risk.maxOpenPositions"] !== undefined) {
    const cap = Math.max(1, Math.min(50, Math.round(Number(p["risk.maxOpenPositions"]) || 5)));
    entries.push(["risk.maxOpenPositions", cap, "risk"]);
    entries.push(["engine.maxTotalPositions", cap, "engine"]);
  }
  entries.push(["risk.preset", preset, "risk"]);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(742019)");
    for (const [key, value, group] of entries) {
      await client.query(
        `INSERT INTO system_settings (key, value, group_name, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, group_name = EXCLUDED.group_name,
           updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
        [key, JSON.stringify(value), group, now(), by ?? null]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Settlement and capital mirror commit together; no lost concurrent PnL. */
export async function addRealizedPnl(client: { query: (...args: any[]) => Promise<any> }, pnl: number): Promise<void> {
  if (!Number.isFinite(pnl)) throw new Error("invalid_realized_pnl");
  await client.query("SELECT pg_advisory_xact_lock(742019)");
  await client.query(`INSERT INTO system_settings (key,value,group_name,updated_at) VALUES ('engine.realizedPnl',to_jsonb($1::numeric),'engine',$2)
    ON CONFLICT (key) DO UPDATE SET value=to_jsonb((system_settings.value #>> '{}')::numeric + $1::numeric),updated_at=EXCLUDED.updated_at`, [pnl, now()]);
}
