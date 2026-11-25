import { describe, expect, test } from "bun:test";
import { formatTradeAlert } from "../server/src/telegram";

describe("Telegram trade alerts", () => {
  const trade = {
    symbol: "BTCUSDT", side: "long", entry: 78308.91,
    stop_loss: 77000, take_profit: 81000, targets: [79000, 80000, 81000],
    strategy_keys: ["ema_cross"], score: 61.1, confidence: 0.9,
    profit: -6.14, close_reason: "stop_loss",
  };

  test("reads database column names and includes targets in both languages", () => {
    for (const lang of ["fa", "en"] as const) {
      const alert = formatTradeAlert(trade, "open", lang);
      expect(alert).toContain("77000");
      expect(alert).toContain("81000");
      expect(alert).toContain("TP1: 79000");
      expect(alert).toContain("ema_cross");
      expect(alert).not.toContain("undefined");
    }
  });

  test("closed trade uses stored exit reason", () => {
    expect(formatTradeAlert(trade, "close", "en")).toContain("stop_loss");
  });

  test("small profit remains visible without meaningless fixed four-decimal rounding", () => {
    const alert = formatTradeAlert({ ...trade, profit: 0.00001234 }, "close", "en");
    expect(alert).toContain("+0.00001234 USDT");
  });
});
