import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, RefreshCw, Target, X, Zap } from "lucide-react";
import { CryptoIcon } from "@/components/CryptoIcon";
import { restFetch } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";

type Candle = { t: number; o: number; h: number; l: number; c: number; v?: number };

export type ChartLevels = {
  side?: "long" | "short";
  entry?: number;
  sl?: number;
  tp?: number;
  liq?: number;
  openedAt?: number;
  closedAt?: number;
};

const TFS = ["15m", "1h", "4h", "1d"];

const N = (v: unknown, d = 2) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return Math.abs(n) >= 100 ? n.toFixed(2) : n.toFixed(d);
};

/** Lightweight SVG candlestick chart with our own trade levels. */
function CandleChart({ candles, levels }: { candles: Candle[]; levels?: ChartLevels }) {
  const geo = useMemo(() => {
    if (!candles.length) return null;
    const vals = candles.flatMap((c) => [Number(c.h ?? c.c), Number(c.l ?? c.c)]);
    const marks: number[] = [];
    for (const key of ["entry", "sl", "tp", "liq"] as const) {
      const v = Number(levels?.[key] ?? 0);
      if (Number.isFinite(v) && v > 0) {
        marks.push(v);
        vals.push(v);
      }
    }
    const hi = Math.max(...vals);
    const lo = Math.min(...vals);
    const span = hi - lo || 1;
    const pad = span * 0.04;
    const top = hi + pad;
    const bottom = lo - pad;
    const range = top - bottom || 1;
    const y = (price: number) => ((top - price) / range) * 100;
    const step = 100 / candles.length;
    const bars = candles.map((c, i) => {
      const o = Number(c.o ?? c.c);
      const cl = Number(c.c);
      return {
        x: i * step,
        w: Math.max(step * 0.62, 0.6),
        bodyTop: y(Math.max(o, cl)),
        bodyH: Math.max(y(Math.min(o, cl)) - y(Math.max(o, cl)), 0.6),
        wickTop: y(Number(c.h ?? cl)),
        wickBottom: y(Number(c.l ?? cl)),
        up: cl >= o,
      };
    });
    const entryX = levels?.openedAt
      ? (() => {
          const closest = candles.reduce((best, c, i) => (Math.abs(c.t - Number(levels.openedAt)) < Math.abs(candles[best].t - Number(levels.openedAt)) ? i : best), 0);
          return (closest + 0.5) * step;
        })()
      : null;
    const lines = ([ ["entry", "ورود/Entry", "var(--w-gold)", false], ["sl", "حد ضرر/SL", "var(--w-down)", true], ["tp", "تارگت/TP", "var(--w-up)", true], ["liq", "لیکوئید/LIQ", "#ff9f43", true] ] as const)
      .map(([key, label, color, dash]) => {
        const v = Number(levels?.[key as keyof ChartLevels] ?? 0);
        return Number.isFinite(v) && v > 0 ? { key, label, color, dash, v, y: y(v) } : null;
      })
      .filter(Boolean) as { key: string; label: string; color: string; dash: boolean; v: number; y: number }[];
    return { hi, lo, bars, lines, entryX, entryY: levels?.entry ? y(Number(levels.entry)) : null };
  }, [candles, levels]);

  if (!geo) return <div className="w-empty">—</div>;
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: 240, display: "block" }}>
        {geo.bars.map((b, i) => (
          <g key={i} fill={b.up ? "var(--w-up)" : "var(--w-down)"} stroke={b.up ? "var(--w-up)" : "var(--w-down)"} strokeWidth={0.18}>
            <line x1={b.x + b.w / 2} x2={b.x + b.w / 2} y1={b.wickTop} y2={b.wickBottom} />
            <rect x={b.x} y={b.bodyTop} width={b.w} height={b.bodyH} rx={0.3} />
          </g>
        ))}
        {geo.lines.map((l) => (
          <line
            key={l.key}
            x1={0}
            x2={100}
            y1={l.y}
            y2={l.y}
            stroke={l.color}
            strokeWidth={0.35}
            strokeDasharray={l.dash ? "1.6 1.2" : undefined}
            opacity={0.95}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {geo.entryX !== null && geo.entryY !== null && (
          <circle cx={geo.entryX} cy={geo.entryY} r={1.5} fill="var(--w-gold)" stroke="#000" strokeWidth={0.25} />
        )}
      </svg>
      {geo.lines.map((l) => (
        <span key={l.key} className="w-level-tag" style={{ top: `${l.y}%`, color: l.color }}>
          {l.label} {N(l.v, 4)}
        </span>
      ))}
      <div className="w-between w-tiny" style={{ marginTop: 4 }}>
        <span>H {N(geo.hi)}</span>
        <span>L {N(geo.lo)}</span>
      </div>
    </div>
  );
}

export function MarketSheet({
  symbol,
  market,
  price,
  change,
  levels,
  onClose,
}: {
  symbol: string;
  market?: string;
  price?: number | string;
  change?: number | string;
  levels?: ChartLevels;
  onClose: () => void;
}) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [tf, setTf] = useState("15m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [meta, setMeta] = useState<{ source: string; count: number }>({ source: "", count: 0 });
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const r: any = await restFetch(`/markets/${encodeURIComponent(symbol)}/candles?tf=${tf}`, { timeoutMs: 18_000 });
      const rows = Array.isArray(r?.candles) ? r.candles : [];
      setCandles(rows.slice(-90));
      setMeta({ source: String(r?.source ?? ""), count: Number(r?.count ?? rows.length) });
    } catch (e: any) {
      setErr(String(e?.message ?? (fa ? "دریافت چارت ناموفق بود." : "Could not load the chart.")));
      setCandles([]);
    } finally {
      setBusy(false);
    }
  }, [symbol, tf, fa]);

  useEffect(() => { void load(); }, [load]);

  const ch = Number(change);
  const up = Number.isFinite(ch) ? ch >= 0 : true;
  const hasLevels = Boolean(levels && (levels.entry || levels.sl || levels.tp || levels.liq));

  return (
    <div className="w-modal" onClick={onClose}>
      <div className="w-modal-scrim" />
      <div className="w-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="w-between" style={{ marginBottom: 12 }}>
          <div className="w-row" style={{ gap: 10 }}>
            <CryptoIcon symbol={symbol} size="md" />
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{symbol}</div>
              <div className="w-tiny">{market ?? "—"}</div>
            </div>
          </div>
          <button className="w-btn w-btn-ghost w-btn-icon" onClick={onClose} aria-label="close"><X size={16} /></button>
        </div>
        <div className="w-grid w-g-3" style={{ marginBottom: 12 }}>
          <div className="w-kpi" style={{ padding: "10px 12px" }}>
            <div className="w-kpi-label">{fa ? "قیمت" : "Price"}</div>
            <div className="w-kpi-value w-num" style={{ fontSize: 17 }}>{N(price, 4)}</div>
          </div>
          <div className="w-kpi" style={{ padding: "10px 12px" }}>
            <div className="w-kpi-label">{fa ? "تغییر ۲۴ ساعته" : "24h change"}</div>
            <div className="w-kpi-value w-num" style={{ fontSize: 17, color: up ? "var(--w-up)" : "var(--w-down)" }}>
              {Number.isFinite(ch) ? `${up ? "+" : ""}${ch.toFixed(2)}%` : "—"}
            </div>
          </div>
          <div className="w-kpi" style={{ padding: "10px 12px" }}>
            <div className="w-kpi-label">{fa ? "منبع داده" : "Data source"}</div>
            <div className="w-kpi-value" style={{ fontSize: 14 }}>{meta.source || "—"}</div>
          </div>
        </div>

        <div className="w-between" style={{ flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <div className="w-tabs">
            {TFS.map((x) => (
              <button key={x} className={`w-tab${tf === x ? " is-active" : ""}`} onClick={() => setTf(x)}>{x}</button>
            ))}
          </div>
          <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void load()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />} {fa ? "بروزرسانی" : "Refresh"}
          </button>
        </div>

        {err && <div className="w-small w-down" style={{ marginBottom: 8 }}>{err}</div>}

        <div className="w-card" style={{ padding: 10 }}>
          {busy && !candles.length ? (
            <div className="w-shimmer" style={{ height: 240, borderRadius: 12 }} />
          ) : (
            <CandleChart candles={candles} levels={levels} />
          )}
        </div>

        {hasLevels ? (
          <div className="w-legend" style={{ marginTop: 10 }}>
            {Number(levels?.entry) > 0 && <span style={{ color: "var(--w-gold)" }}><i /> {fa ? "ورود" : "Entry"} {N(levels?.entry, 4)}</span>}
            {Number(levels?.sl) > 0 && <span style={{ color: "var(--w-down)" }}><i className="w-dash" /> {fa ? "حد ضرر" : "Stop"} {N(levels?.sl, 4)}</span>}
            {Number(levels?.tp) > 0 && <span style={{ color: "var(--w-up)" }}><i className="w-dash" /> {fa ? "تارگت" : "Target"} {N(levels?.tp, 4)}</span>}
            {Number(levels?.liq) > 0 && <span style={{ color: "#ff9f43" }}><i className="w-dash" /> {fa ? "لیکوئیدیشن" : "Liquidation"} {N(levels?.liq, 4)}</span>}
          </div>
        ) : (
          <div className="w-tiny" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Target size={13} /> {fa ? "برای دیدن سطوح ورود/حد ضرر/تارگت، از کارت پوزیشن روی «چارت» بزنید." : "Open the chart from a position card to see entry/stop/target levels."}
          </div>
        )}

        <div className="w-tiny" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <BarChart3 size={13} /> {meta.count} {fa ? "کندل" : "candles"} · {tf}
        </div>
        <div className="w-tiny" style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, opacity: 0.85 }}>
          <Zap size={12} /> {fa ? "داده بازار هم‌زمان از چند صرافی با زنجیره جایگزین گرفته می‌شود." : "Candles come from a multi-exchange fallback chain."}
        </div>
      </div>
    </div>
  );
}
