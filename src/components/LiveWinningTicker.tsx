import React, { useEffect, useState } from "react";
import { restFetch } from "@/lib/backend";

/**
 * Live profit/loss tape on the home page.
 * Data: public wins feed (same numbers the channel posts), refreshed every 20s.
 */
export const LiveWinningTicker: React.FC<{ lang?: "fa" | "en" }> = ({ lang = "fa" }) => {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      restFetch("/public/wins", { timeoutMs: 12_000 })
        .then((r: any) => {
          if (!alive) return;
          setItems(Array.isArray(r?.feed) ? r.feed.slice(0, 18) : []);
        })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 20_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!items.length) return null;
  const row = [...items, ...items];

  return (
    <div className="w-ticker" aria-label={lang === "fa" ? "سود و ضرر زنده" : "live pnl"}>
      <span className="w-ticker-badge">{lang === "fa" ? "زنده" : "LIVE"}</span>
      <div className="w-ticker-track">
        {row.map((it, i) => {
          const pnl = Number(it.profit_usd ?? it.profit ?? 0);
          const mult = Number(it.multiplier ?? 0);
          return (
            <span className="w-ticker-item" key={`${it.symbol}-${i}`}>
              <b>{String(it.symbol ?? "").replace("USDT", "")}</b>
              <span className={pnl >= 0 ? "w-up" : "w-down"}>
                {pnl >= 0 ? "+" : ""}
                {pnl.toFixed(2)} USDT
              </span>
              {Number.isFinite(mult) && mult !== 0 ? (
                <span className="w-ticker-mult">{mult > 0 ? "+" : ""}{mult.toFixed(1)}%</span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
};
