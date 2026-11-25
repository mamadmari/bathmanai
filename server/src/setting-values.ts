/** Strict, default-aware decoding for persisted operator switches. */
export function settingOn(value: unknown): boolean {
  if (value === true || value === 1) return true;
  return typeof value === "string" && ["true", "1", "on", "yes"].includes(value.trim().toLowerCase());
}

export function settingNotFalse(value: unknown, fallback = true): boolean {
  return value == null ? fallback : settingOn(value);
}

export function normalizeSetting(key: string, value: unknown, defaults: Record<string, unknown>): unknown {
  if (value == null) throw new Error(`invalid_system_setting:${key}`);
  const base = defaults[key];
  if (typeof base === "boolean") {
    if (typeof value === "boolean") return value;
    const text = String(value).trim().toLowerCase();
    if (["true", "1", "on", "yes"].includes(text)) return true;
    if (["false", "0", "off", "no"].includes(text)) return false;
    throw new Error(`invalid_system_setting:${key}`);
  }
  if (typeof base === "number") {
    if (typeof value !== "number" && typeof value !== "string") throw new Error(`invalid_system_setting:${key}`);
    const n = Number(value);
    if (String(value).trim() === "" || !Number.isFinite(n)) throw new Error(`invalid_system_setting:${key}`);
    return n;
  }
  return value;
}