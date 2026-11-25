// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — the real cost of one Nobitex margin trade, in one place.
//
// Verified against https://nobitex.ir/pricing (tier «پایه», <100M toman / 30d):
//   · toman markets (coin-rls): 0.25% maker AND taker per side
//   · usdt markets (coin-usdt): 0.10% maker / 0.13% taker per side
//   · margin position fee: /margin/markets/list → positionFeeRate 0.0005 (0.05%)
//   · renewal (تمدید) fee: every 8h on the delegated value; /positions/list
//     returns it as `extensionFee` (measured ≈0.064% of notional per 8h)
//   · participation pool: 0.5% of the profit per renewed day (day 1 is free)
//   · toman withdrawal: 0.02% with a 4,000 toman floor
//
// Every PnL the platform reports is NET of these, so a "win" is money in the
// wallet — not a gross number that the fees silently eat.
import type { Settings } from "./settings.js";

export interface CostModel {
  feePct: number;
  slippagePct: number;
  positionFeePct: number;
  extensionPctPer8h: number;
  poolSharePctPerDay: number;
  withdrawFeeToman: number;
}

const DEFAULTS: CostModel = {
  feePct: 0.25,
  slippagePct: 0.1,
  positionFeePct: 0.05,
  extensionPctPer8h: 0.064,
  poolSharePctPerDay: 0.5,
  withdrawFeeToman: 4000,
};

const n = (v: unknown, d: number): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};

/** Cost settings, with Nobitex defaults for anything the panel has not set. */
export function costModel(s: Settings | Record<string, any> | null | undefined): CostModel {
  const c = (s ?? {}) as Record<string, any>;
  return {
    feePct: Math.max(0, n(c["trading.feePct"], DEFAULTS.feePct)),
    slippagePct: Math.max(0, n(c["trading.slippagePct"], DEFAULTS.slippagePct)),
    positionFeePct: Math.max(0, n(c["trading.positionFeePct"], DEFAULTS.positionFeePct)),
    extensionPctPer8h: Math.max(0, n(c["trading.extensionPctPer8h"], DEFAULTS.extensionPctPer8h)),
    poolSharePctPerDay: Math.max(0, n(c["trading.poolSharePctPerDay"], DEFAULTS.poolSharePctPerDay)),
    withdrawFeeToman: Math.max(0, n(c["trading.withdrawFeeToman"], DEFAULTS.withdrawFeeToman)),
  };
}

/** Renewal blocks charged for a position of `hours` age (one block per 8h). */
export function extensionBlocks(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.ceil(hours / 8);
}

/**
 * Percent of notional consumed by a full entry + exit at this holding time,
 * before any PnL: two trade fees, two slippages, the position fee and one
 * renewal block per 8h held.
 */
export function roundTripCostPct(m: CostModel, holdHours = 8): number {
  const blocks = Math.max(1, extensionBlocks(holdHours));
  return 2 * m.feePct + 2 * m.slippagePct + m.positionFeePct + m.extensionPctPer8h * blocks;
}

/** Everything the broker keeps, in USDT, for one trade. */
export interface CostBreakdown {
  feesUsd: number;
  extensionUsd: number;
  positionUsd: number;
  poolUsd: number;
  totalUsd: number;
  pctOfNotional: number;
}

export function tradeCosts(
  m: CostModel,
  input: { notionalUsd: number; holdHours: number; grossPnlUsd: number },
): CostBreakdown {
  const notional = Math.max(0, n(input.notionalUsd, 0));
  const hold = Math.max(0, n(input.holdHours, 0));
  const gross = n(input.grossPnlUsd, 0);
  const feesUsd = (notional * (m.feePct + m.slippagePct) * 2) / 100;
  const positionUsd = (notional * m.positionFeePct) / 100;
  const extensionUsd = (notional * m.extensionPctPer8h * extensionBlocks(hold)) / 100;
  // The pool only takes a share of a *winning* position, one day per renewal.
  const poolDays = Math.max(0, Math.floor(hold / 24));
  const poolUsd = gross > 0 ? (gross * m.poolSharePctPerDay * poolDays) / 100 : 0;
  const totalUsd = feesUsd + positionUsd + extensionUsd + poolUsd;
  return {
    feesUsd,
    extensionUsd,
    positionUsd,
    poolUsd,
    totalUsd,
    pctOfNotional: notional > 0 ? (totalUsd / notional) * 100 : 0,
  };
}

/** Net result of a trade (what actually reaches the wallet). */
export function netPnlUsd(
  m: CostModel,
  input: { notionalUsd: number; holdHours: number; grossPnlUsd: number },
): { grossUsd: number; costUsd: number; netUsd: number; breakdown: CostBreakdown } {
  const breakdown = tradeCosts(m, input);
  const grossUsd = n(input.grossPnlUsd, 0);
  return { grossUsd, costUsd: breakdown.totalUsd, netUsd: grossUsd - breakdown.totalUsd, breakdown };
}

/**
 * Smallest distance (in % of price) the target must be so a winner clears
 * `k` times the full round-trip cost.
 */
export function minTargetPct(m: CostModel, holdHours: number, k: number): number {
  return roundTripCostPct(m, holdHours) * Math.max(1, n(k, 2));
}
