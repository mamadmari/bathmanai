import { describe, expect, test } from "bun:test";
import { normalizeSetting, settingOn, settingNotFalse } from "../server/src/setting-values";
import { DEFAULT_SETTINGS, getSettings, saveSettingsPatch, applyRiskPreset } from "../server/src/settings";
import { pool } from "../server/src/db";

describe("persisted operator settings", () => {
  test("strict explicit on and default-aware off", () => {
    for (const value of [true, 1, "true", "TRUE", "on", "yes"]) expect(settingOn(value)).toBe(true);
    for (const value of [false, 0, "false", "0", "off", "no", "invalid", {}, undefined]) expect(settingOn(value)).toBe(false);
    expect(settingNotFalse(undefined)).toBe(true);
    expect(settingNotFalse(undefined, false)).toBe(false);
    expect(settingNotFalse("false")).toBe(false);
  });
  test("stored strings normalize without silently dropping invalid settings", async () => {
    const original = pool.query;
    pool.query = (async () => ({ rows: [
      { key: "engine.enabled", value: "false" },
      { key: "risk.trailingStop", value: "true" },
      { key: "risk.maxDailyLoss", value: "5" },
    ] })) as typeof pool.query;
    try {
      const s = await getSettings();
      expect(s["engine.enabled"]).toBe(false);
      expect(s["risk.trailingStop"]).toBe(true);
      expect(s["risk.maxDailyLoss"]).toBe(5);
    } finally { pool.query = original; }
    for (const value of ["invalid", "", null, {}, NaN]) {
      expect(() => normalizeSetting("risk.maxDailyLoss", value, DEFAULT_SETTINGS as any)).toThrow();
    }
  });
  test("custom save conflicts roll back the entire patch", async () => {
    const original = pool.connect;
    const queries: string[] = [];
    let released = false;
    pool.connect = (async () => ({
      query: async (sql: string) => {
        queries.push(sql);
        return { rows: sql.startsWith("SELECT value") ? [{ value: 91 }] : [] };
      }, release: () => { released = true; },
    })) as typeof pool.connect;
    try {
      await expect(saveSettingsPatch({ "risk.minScore": 80 }, { "risk.minScore": 75 })).rejects.toThrow("settings_conflict:risk.minScore");
      expect(queries).toContain("ROLLBACK");
      expect(queries).not.toContain("COMMIT");
      expect(released).toBe(true);
    } finally { pool.connect = original; }
  });
  test("preset uses one dedicated transaction and releases on write failure", async () => {
    const original = pool.connect;
    const queries: string[] = [];
    let released = false;
    pool.connect = (async () => ({
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes("INSERT")) throw new Error("write failed");
        return { rows: [] };
      }, release: () => { released = true; },
    })) as typeof pool.connect;
    try {
      await expect(applyRiskPreset("balanced")).rejects.toThrow("write failed");
      expect(queries).toContain("BEGIN");
      expect(queries).toContain("SELECT pg_advisory_xact_lock(742019)");
      expect(queries).toContain("ROLLBACK");
      expect(released).toBe(true);
    } finally { pool.connect = original; }
  });
});