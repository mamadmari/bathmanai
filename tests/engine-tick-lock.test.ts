import { describe, expect, test } from "bun:test";
import { pool } from "../server/src/db";
import { confirmedEntryFill, engineTick } from "../server/src/engine";

describe("engine single in-flight tick", () => {
  test("second worker skips analysis when the database lock is held", async () => {
    const originalConnect = pool.connect;
    let released = false;
    let queries = 0;
    pool.connect = (async () => ({
      query: async () => { queries++; return { rows: [{ acquired: false }] }; },
      release: () => { released = true; },
    })) as typeof pool.connect;
    try {
      expect(await engineTick()).toEqual({ scanned: 0, opened: 0 });
      expect(queries).toBe(1);
      expect(released).toBe(true);
    } finally {
      pool.connect = originalConnect;
    }
  });
});

describe("broker fill confirmation", () => {
  test("accepts only a fully filled, identified order at a positive broker price", () => {
    const full = { ok: true, orderId: "broker-123", filledQty: 2, filledPrice: 100 };
    expect(confirmedEntryFill(full, 2)).toBe(true);
    expect(confirmedEntryFill({ ...full, filledQty: 1 }, 2)).toBe(false);
    expect(confirmedEntryFill({ ...full, filledPrice: undefined }, 2)).toBe(false);
    expect(confirmedEntryFill({ ...full, orderId: "" }, 2)).toBe(false);
    expect(confirmedEntryFill({ ...full, ok: false }, 2)).toBe(false);
  });
});
