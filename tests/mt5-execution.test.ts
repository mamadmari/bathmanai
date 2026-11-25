import { describe, expect, test } from "bun:test";
import { adapters } from "../server/src/exchanges";
import { pool } from "../server/src/db";
import { getCandles } from "../server/src/engine";
import { encryptSecret } from "../server/src/util";

describe("MT5 live execution without a broker bridge", () => {
  test("never reports an invented balance, entry, or exit", async () => {
    const originalUrl = process.env.MT5_BRIDGE_URL;
    const originalQuery = pool.query;
    delete process.env.MT5_BRIDGE_URL;
    // An isolated empty exchange-account lookup; no database or broker is touched.
    pool.query = (async () => ({ rows: [] })) as typeof pool.query;
    try {
      expect(await adapters.mt5.balance()).toBeNull();
      const entry = await adapters.mt5.placeOrder({
        symbol: "XAUUSD", side: "buy", qty: 1, idempotencyKey: "no-bridge",
      });
      const exit = await adapters.mt5.closePosition("XAUUSD", "long", 1);
      expect(entry.ok).toBe(false);
      expect(entry.orderId).toBeUndefined();
      expect(exit.ok).toBe(false);
      expect(exit.orderId).toBeUndefined();
    } finally {
      pool.query = originalQuery;
      if (originalUrl === undefined) delete process.env.MT5_BRIDGE_URL;
      else process.env.MT5_BRIDGE_URL = originalUrl;
    }
  });

  test("does not mistake a bridge acknowledgement for a broker fill", async () => {
    const originalUrl = process.env.MT5_BRIDGE_URL;
    const originalQuery = pool.query;
    const originalFetch = globalThis.fetch;
    process.env.MT5_BRIDGE_URL = "http://mt5-bridge.test";
    pool.query = (async () => ({ rows: [] })) as typeof pool.query;
    globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;
    try {
      const entry = await adapters.mt5.placeOrder({
        symbol: "EURUSD", side: "buy", qty: 100_000, idempotencyKey: "ack-only",
      });
      const exit = await adapters.mt5.closePosition("EURUSD", "long", 100_000);
      expect(entry.ok).toBe(false);
      expect(exit.ok).toBe(false);
      expect(entry.orderId).toBeUndefined();
      expect(exit.orderId).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
      pool.query = originalQuery;
      if (originalUrl === undefined) delete process.env.MT5_BRIDGE_URL;
      else process.env.MT5_BRIDGE_URL = originalUrl;
    }
  });

  test("accepts a broker close only with ticket, actual price, and filled quantity", async () => {
    const originalUrl = process.env.MT5_BRIDGE_URL;
    const originalQuery = pool.query;
    const originalFetch = globalThis.fetch;
    process.env.MT5_BRIDGE_URL = "http://mt5-bridge.test";
    pool.query = (async () => ({ rows: [] })) as typeof pool.query;
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.comment).toBe("exit-once");
      return new Response(JSON.stringify({ ok: true, ticket: "broker-exit-1", price: 4220, volume: 0.01 }), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await adapters.mt5.closePosition("XAUUSD", "long", 1, "exit-once");
      expect(result).toMatchObject({ ok: true, orderId: "broker-exit-1", filledPrice: 4220, filledQty: 1 });
    } finally {
      globalThis.fetch = originalFetch;
      pool.query = originalQuery;
      if (originalUrl === undefined) delete process.env.MT5_BRIDGE_URL;
      else process.env.MT5_BRIDGE_URL = originalUrl;
    }
  });

  test("live forex candles come only from the broker, never a synthetic fallback", async () => {
    const originalUrl = process.env.MT5_BRIDGE_URL;
    const originalQuery = pool.query;
    const originalFetch = globalThis.fetch;
    delete process.env.MT5_BRIDGE_URL;
    pool.query = (async () => ({ rows: [] })) as typeof pool.query;
    globalThis.fetch = (async () => { throw new Error("no network expected"); }) as typeof fetch;
    try {
      expect(await getCandles("XAUUSD", "5m", "live", true, "forex")).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
      pool.query = originalQuery;
      if (originalUrl === undefined) delete process.env.MT5_BRIDGE_URL;
      else process.env.MT5_BRIDGE_URL = originalUrl;
    }
  });
});

describe("Binance spot execution", () => {
  test("locked funds are not available capital", async () => {
    const originalQuery = pool.query;
    const originalFetch = globalThis.fetch;
    pool.query = (async () => ({ rows: [{ api_key_enc: encryptSecret("test-key"), api_secret_enc: encryptSecret("test-secret") }] })) as typeof pool.query;
    globalThis.fetch = (async () => new Response(JSON.stringify({ balances: [
      { asset: "USDT", free: "25", locked: "975" },
    ] }), { status: 200 })) as typeof fetch;
    try {
      expect(await adapters.binance.availableMargin?.()).toBe(25);
    } finally {
      globalThis.fetch = originalFetch;
      pool.query = originalQuery;
    }
  });
  test("invalid broker balance is unknown, not zero or fake funds", async () => {
    const originalQuery = pool.query;
    const originalFetch = globalThis.fetch;
    pool.query = (async () => ({ rows: [{ api_key_enc: encryptSecret("test-key"), api_secret_enc: encryptSecret("test-secret") }] })) as typeof pool.query;
    globalThis.fetch = (async () => new Response(JSON.stringify({ balances: [
      { asset: "USDT", free: "invalid", locked: "975" },
    ] }), { status: 200 })) as typeof fetch;
    try {
      expect(await adapters.binance.availableMargin?.()).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
      pool.query = originalQuery;
    }
  });
  test("uses signed POST and rejects an order without a confirmed fill", async () => {
    const originalQuery = pool.query;
    const originalFetch = globalThis.fetch;
    let method = "";
    pool.query = (async () => ({ rows: [{ api_key_enc: encryptSecret("test-key"), api_secret_enc: encryptSecret("test-secret") }] })) as typeof pool.query;
    globalThis.fetch = (async (_url, init) => {
      method = String(init?.method);
      return new Response(JSON.stringify({ orderId: 123, status: "NEW", executedQty: "0" }), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await adapters.binance.placeOrder({
        symbol: "BTCUSDT", side: "buy", qty: 0.001, idempotencyKey: "test-order",
      });
      expect(method).toBe("POST");
      expect(result.ok).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      pool.query = originalQuery;
    }
  });
});
