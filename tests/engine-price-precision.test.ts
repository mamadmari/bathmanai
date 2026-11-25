import { describe, expect, test } from "bun:test";
import { effectivePriceDigits, buildStagedTargets } from "../server/src/engine";
import { round } from "../server/src/util";

describe("engine exit price precision", () => {
  test("SHIB stop loss never rounds to zero and staged targets remain positive", () => {
    const entry = 0.00000516;
    const digits = effectivePriceDigits(4, entry, "crypto");
    expect(digits).toBe(8);
    const stop = round(entry * 0.98, digits);
    const target = round(entry * 1.04, digits);
    expect(stop).toBeGreaterThan(0);
    expect(stop).toBeLessThan(entry);
    expect(target).toBeGreaterThan(entry);
    expect(buildStagedTargets("long", entry, stop, target, digits).every((v) => v > 0)).toBe(true);
  });

  test("broker forex precision remains configured; normal crypto retains its precision", () => {
    expect(effectivePriceDigits(3, 149.12345, "forex")).toBe(3);
    expect(effectivePriceDigits(4, 78308.91, "crypto")).toBe(4);
    expect(effectivePriceDigits(4, 0.00000001, "crypto")).toBe(8);
  });
});
