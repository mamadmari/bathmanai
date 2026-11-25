/** Premium details are not serialized until a paid unlock is confirmed. */
export function signalView(signal: Record<string, any>, unlocked = false): Record<string, any> {
  const summary = {
    id: signal.id, symbol: signal.symbol, timeframe: signal.timeframe,
    direction: signal.direction, score: signal.score, confidence: signal.confidence,
    mode: signal.mode, status: signal.status, created_at: signal.created_at,
    expires_at: signal.expires_at, unlocked,
  };
  if (!unlocked && signal.access !== "free") return summary;
  return { ...signal, ...summary };
}