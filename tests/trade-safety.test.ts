import { describe, expect, test } from "bun:test";
import { cappedNotional, validExitLevels, quoteFresh } from "../server/src/trade-safety";

describe("trade safety", () => {
  const base = { requested: 300, equity: 500, availableMargin: 100, leverage: 10,
    symbolExposure: 0, symbolCapPct: 25, minimumNotional: 10 };
  test("notional cap is not multiplied by leverage", () => {
    expect(cappedNotional(base)).toEqual({ allowed: 125, reasonCode: null });
  });
  test("cap equality is executable and existing exposure reduces size", () => {
    expect(cappedNotional({ ...base, requested: 125 }).allowed).toBe(125);
    expect(cappedNotional({ ...base, symbolExposure: 100 }).allowed).toBe(25);
  });
  test("below exchange minimum cannot execute", () => {
    expect(cappedNotional({ ...base, symbolExposure: 120 }).reasonCode).toBe("BELOW_MINIMUM_EXECUTABLE_SIZE");
  });
  test("zero balance and zero size cannot execute", () => {
    expect(cappedNotional({ ...base, availableMargin: 0 }).allowed).toBe(0);
    expect(cappedNotional({ ...base, requested: 0 }).allowed).toBe(0);
  });
  test("invalid numeric inputs fail closed", () => {
    expect(cappedNotional({ ...base, equity: NaN }).reasonCode).toBe("INVALID_RISK_INPUT");
    expect(cappedNotional({ ...base, leverage: 0 }).allowed).toBe(0);
  });
  test("exit geometry is strict and finite", () => {
    expect(validExitLevels("long", 100, 90, 120)).toBe(true);
    expect(validExitLevels("short", 100, 120, 90)).toBe(true);
    for (const side of ["long", "short", "neutral"]) {
      expect(validExitLevels(side, 100, 100, 120)).toBe(false);
      expect(validExitLevels(side, NaN, 90, 120)).toBe(false);
    }
    expect(validExitLevels("long", 100, 120, 90)).toBe(false);
  });
  test("missing stale and future quotes fail freshness", () => {
    expect(quoteFresh(9900, 10000, 500)).toBe(true);
    expect(quoteFresh(0, 10000, 500)).toBe(false);
    expect(quoteFresh(9000, 10000, 500)).toBe(false);
    expect(quoteFresh(12000, 10000, 500)).toBe(false);
  });
});
