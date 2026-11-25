import { describe, expect, test } from "bun:test";
import { lessThanAmount, positiveAmount, withdrawalKey, splitSettlement } from "../server/src/financial-amount";

describe("wallet amount boundaries", () => {
  test("rejects zero, negative, exponent, excess precision and oversized amounts", () => {
    for (const amount of [0, "0.00000000", -1, "1e4", "0.000000001", "12345678901234567", null, Infinity]) {
      expect(positiveAmount(amount)).toBeNull();
    }
  });
  test("preserves decimal strings for PostgreSQL NUMERIC", () => {
    expect(positiveAmount("9007199254740991.12345678")).toBe("9007199254740991.12345678");
    expect(positiveAmount("0.00000001")).toBe("0.00000001");
    expect(lessThanAmount("0.29999999", "0.3")).toBe(true);
    expect(lessThanAmount("0.30000000", "0.3")).toBe(false);
  });
  test("requires a stable, safe retry key", () => {
    expect(withdrawalKey("withdrawal-2026-09-25-0001")).not.toBeNull();
    expect(withdrawalKey("x")).toBeNull();
  });
});

describe("engine settlement across frozen wallets", () => {
  test("does not turn a shortfall into customer debt", () => {
    expect(splitSettlement("-14.00000001", ["5", "7"])).toEqual({
      applied: "-12", deficit: "2.00000001", changes: ["-5", "-7"],
    });
  });
  test("settles exact fractional cents without creating negative wallets", () => {
    expect(splitSettlement("-0.30000001", ["0.1", "0.2"])).toEqual({
      applied: "-0.3", deficit: "0.00000001", changes: ["-0.1", "-0.2"],
    });
    expect(splitSettlement("0.00000001", ["0", "0"])).toEqual({
      applied: "0.00000001", deficit: "0", changes: ["0.00000001", "0"],
    });
  });
});
