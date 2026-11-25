import { expect, test } from "bun:test";
import { signalView } from "../server/src/signal-view";

test("locked premium response contains no plan or strategy details", () => {
  const signal = { id: "signal-1", symbol: "BTCUSDT", entry: 100, stop_loss: 90, take_profit: 120, targets: [120], strategy_keys: ["private"], aggregate: { secret: true }, reasons_fa: ["private"] };
  const locked = signalView(signal);
  expect(locked.symbol).toBe("BTCUSDT");
  for (const key of ["entry", "stop_loss", "take_profit", "targets", "strategy_keys", "aggregate", "reasons_fa"]) expect(key in locked).toBe(false);
  expect(signalView(signal, true).entry).toBe(100);
  expect(signalView({ ...signal, access: "free" }).entry).toBe(100);
});