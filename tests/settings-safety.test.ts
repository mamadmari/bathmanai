import { describe, expect, test } from "bun:test";
import { pool } from "../server/src/db";
import { getSettings } from "../server/src/settings";

describe("settings fail closed", () => {
  test("database errors do not become default trading settings", async () => {
    const original = pool.query;
    pool.query = (async () => { throw new Error("database offline"); }) as typeof pool.query;
    try {
      await expect(getSettings()).rejects.toThrow("database offline");
    } finally { pool.query = original; }
  });
  test("JSONB strings and custom values are preserved without reparsing", async () => {
    const original = pool.query;
    pool.query = (async () => ({ rows: [
      { key: "engine.mode", value: "live" },
      { key: "risk.minScore", value: 91 },
    ] })) as typeof pool.query;
    try {
      const settings = await getSettings();
      expect(settings["engine.mode"]).toBe("live");
      expect(settings["risk.minScore"]).toBe(91);
      expect(settings["risk.opportunisticEnabled"]).toBe(false);
    } finally { pool.query = original; }
  });
  test("null settings do not silently become trading defaults", async () => {
    const original = pool.query;
    pool.query = (async () => ({ rows: [{ key: "risk.minScore", value: null }] })) as typeof pool.query;
    try {
      await expect(getSettings()).rejects.toThrow("invalid_system_setting:risk.minScore");
    } finally { pool.query = original; }
  });
});
