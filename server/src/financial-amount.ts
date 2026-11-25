/** Validate a positive amount without converting it to IEEE-754 floating point. */
export function positiveAmount(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value);
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/.test(raw)) return null;
  if (!/[1-9]/.test(raw)) return null;
  return raw;
}

export function withdrawalKey(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{16,128}$/.test(value) ? value : null;
}

export function lessThanAmount(amount: string, minimum: string): boolean {
  return toUnits(amount) < toUnits(minimum);
}

function toUnits(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const units = BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0") || "0");
  return negative ? -units : units;
}

function fromUnits(units: bigint): string {
  if (units === 0n) return "0";
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  const fraction = String(abs % 100_000_000n).padStart(8, "0").replace(/0+$/, "");
  return sign + String(abs / 100_000_000n) + (fraction ? `.${fraction}` : "");
}

/** Exact USDT settlement across wallets; the platform absorbs any deficit. */
export function splitSettlement(net: string, frozenBalances: string[]): {
  applied: string; deficit: string; changes: string[];
} {
  const requested = toUnits(net);
  const changes = frozenBalances.map(() => 0n);
  if (requested >= 0n) {
    if (changes.length) changes[0] = requested;
    return { applied: changes.length ? fromUnits(requested) : "0", deficit: "0", changes: changes.map(fromUnits) };
  }
  let loss = -requested;
  for (let i = 0; i < frozenBalances.length; i++) {
    const balance = toUnits(frozenBalances[i]) > 0n ? toUnits(frozenBalances[i]) : 0n;
    const used = loss < balance ? loss : balance;
    changes[i] = -used;
    loss -= used;
  }
  return { applied: fromUnits(requested + loss), deficit: fromUnits(loss), changes: changes.map(fromUnits) };
}
