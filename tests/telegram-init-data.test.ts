import { describe, expect, test } from "bun:test";
import crypto from "node:crypto";
import { validateMiniAppData } from "../server/src/telegram";

describe("Telegram Mini App signed identity", () => {
  const token = "123456:fixture-token-not-a-credential";
  const nowMs = 1_790_000_000_000;
  const signed = (authDate: number, userId = 12345) => {
    const fields = new URLSearchParams({ auth_date: String(authDate), user: JSON.stringify({ id: userId }) });
    const check = [...fields.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
    const key = crypto.createHmac("sha256", "WebAppData").update(token).digest();
    fields.set("hash", crypto.createHmac("sha256", key).update(check).digest("hex"));
    return fields.toString();
  };

  test("accepts a fresh Telegram signature", () => {
    const data = signed(Math.floor(nowMs / 1000) - 30);
    expect(JSON.parse(validateMiniAppData(data, token, 300, nowMs)?.user ?? "null")?.id).toBe(12345);
  });

  test("rejects tampering, stale and future data", () => {
    const fresh = signed(Math.floor(nowMs / 1000) - 30);
    expect(validateMiniAppData(fresh.replace("12345", "12346"), token, 300, nowMs)).toBeNull();
    expect(validateMiniAppData(signed(Math.floor(nowMs / 1000) - 301), token, 300, nowMs)).toBeNull();
    expect(validateMiniAppData(signed(Math.floor(nowMs / 1000) + 61), token, 300, nowMs)).toBeNull();
    expect(validateMiniAppData(fresh, "other-token", 300, nowMs)).toBeNull();
  });
});
