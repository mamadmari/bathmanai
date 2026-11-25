export function validExitLevels(side: string, entry: number, stopLoss: number, takeProfit: number): boolean {
  if (![entry, stopLoss, takeProfit].every((value) => Number.isFinite(value) && value > 0)) return false;
  return side === "long" ? stopLoss < entry && entry < takeProfit
    : side === "short" ? takeProfit < entry && entry < stopLoss : false;
}

export function cappedNotional(input: {
  requested: number; equity: number; availableMargin: number; leverage: number;
  symbolExposure: number; symbolCapPct: number; minimumNotional: number;
}): { allowed: number; reasonCode: string | null } {
  if (!Object.values(input).every(Number.isFinite) || input.leverage < 1 ||
      input.symbolExposure < 0 || input.minimumNotional <= 0 || input.symbolCapPct <= 0 || input.symbolCapPct > 100) {
    return { allowed: 0, reasonCode: "INVALID_RISK_INPUT" };
  }
  const symbolRemaining = Math.max(0, input.equity * input.symbolCapPct / 100 - input.symbolExposure);
  const allowed = Math.max(0, Math.min(input.requested, symbolRemaining, input.availableMargin * input.leverage));
  if (allowed < input.minimumNotional) return { allowed: 0, reasonCode: "BELOW_MINIMUM_EXECUTABLE_SIZE" };
  return { allowed, reasonCode: null };
}

export function quoteFresh(timestamp: number, currentTime: number, maximumAgeMs: number): boolean {
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= currentTime + 1000 &&
    currentTime - timestamp <= maximumAgeMs;
}
