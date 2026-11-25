import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Activity, AlertTriangle, Loader2, Pause, Play, Power, RefreshCw, X } from "lucide-react";
import { restFetch } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";
import { PositionCard } from "@/components/wolf/PositionCard";

type Pos = Record<string, any>;
type Live = { ok: boolean; db: boolean; redis: boolean; engine: boolean; time: number };
type Overview = { engine?: Record<string, any>; stats?: Record<string, any>; exchanges?: any[] };
type Closed = { symbol: string; side: string; pnl: string | number; fee?: string | number; close_reason?: string; close_time?: string | number };
type LogRow = { id: string; level: string; message: string; created_at: string };
type Sys = {
  ok: boolean;
  app: { node: string; pid: number; uptimeSec: number; memMb: number; dbMs: number };
  counts: Record<string, number>;
};

const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ago = (ts?: number | string): string => {
  const t = n(ts);
  if (!t) return "—";
  const ms = Math.max(0, Date.now() - t);
  const m = Math.floor(ms / 60000);
  return m < 1 ? `${Math.floor(ms / 1000)}s` : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
const dur = (sec: number): string => {
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
};
const money = (v: number, d = 4) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;
const px = (v: number) => v.toFixed(v >= 100 ? 2 : v >= 1 ? 4 : 5);
const irt = (usd: number, rate: number) =>
  rate > 0 ? Math.round(Math.abs(usd) * rate).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";

const C = {
  a: "#f0c25a",
  up: "#3ddc97",
  down: "#ff6b6b",
  line: "rgba(255,255,255,.06)",
  soft: "rgba(255,255,255,.55)",
};
const card: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.012))",
  border: "1px solid rgba(255,255,255,.07)",
  borderRadius: 14,
  padding: "10px 12px",
};
const th: CSSProperties = {
  textAlign: "right", fontSize: 10.5, fontWeight: 700, color: C.soft,
  padding: "6px 8px", borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap",
};
const td: CSSProperties = {
  textAlign: "right", fontSize: 12, fontWeight: 600,
  padding: "7px 8px", borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap",
};
const ltr: CSSProperties = { direction: "ltr", fontFamily: "ui-monospace, monospace", unicodeBidi: "isolate" };

function Box({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" | "gold" }) {
  const color = tone === "up" ? C.up : tone === "down" ? C.down : tone === "gold" ? C.a : undefined;
  return (
    <div style={{ ...card, padding: "10px 12px", display: "grid", gap: 2 }}>
      <span style={{ fontSize: 10.5, color: C.soft }}>{label}</span>
      <b style={{ fontSize: 15, color, ...ltr }}>{value}</b>
      {sub && <span style={{ fontSize: 9.5, color: C.soft, opacity: 0.85, ...ltr }}>{sub}</span>}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "gold" }) {
  const color = tone === "up" ? C.up : tone === "down" ? C.down : tone === "gold" ? C.a : undefined;
  return (
    <div style={{ display: "grid", gap: 1, minWidth: 62 }}>
      <span style={{ fontSize: 10, color: C.soft }}>{label}</span>
      <b style={{ fontSize: 12.5, color, ...ltr }}>{value}</b>
    </div>
  );
}

function Switch({ on, busy, label, onClick }: { on: boolean; busy: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
        background: on ? "rgba(61,220,151,.14)" : "rgba(255,255,255,.05)",
        border: `1px solid ${on ? "rgba(61,220,151,.45)" : "rgba(255,255,255,.1)"}`,
        borderRadius: 9, padding: "5px 10px", color: "inherit", fontSize: 11.5, fontWeight: 700,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 99, background: on ? C.up : "rgba(255,255,255,.35)" }} />
      {label}
    </button>
  );
}

/** Overview = the old panel's live monitor AND its engine page in one screen. */
export function LiveMonitor({ token, onNavigate }: { token: string | null; onNavigate?: (tab: string) => void }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [health, setHealth] = useState<Live | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [open, setOpen] = useState<Pos[]>([]);
  const [closed, setClosed] = useState<Closed[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [sys, setSys] = useState<Sys | null>(null);
  const [rate, setRate] = useState(0);
  const [cfg, setCfg] = useState<Record<string, any>>({});
  const [err, setErr] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(0);
  const [engineBusy, setEngineBusy] = useState<string | null>(null);
  const [manual, setManual] = useState({ symbol: "", side: "long", note: "" });
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (!token || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    try {
      const [h, o, p, l, sy, rt, st] = await Promise.all([
        fetch("/health", { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<Live>) : null)).catch(() => null),
        restFetch<Overview>("/admin/overview", { token, timeoutMs: 20_000 }),
        restFetch<{ open: Pos[]; closed: Closed[] }>("/admin/positions", { token, timeoutMs: 20_000 }),
        restFetch<{ logs: LogRow[] }>("/admin/logs?limit=40", { token, timeoutMs: 20_000 }).catch(() => ({ logs: [] })),
        restFetch<Sys>("/admin/system", { token, timeoutMs: 15_000 }).catch(() => null),
        restFetch<{ price: number }>("/rates/usdt", { timeoutMs: 10_000 }).catch(() => null),
        restFetch<{ settings: Record<string, any> }>("/admin/settings", { token, timeoutMs: 15_000 }).catch(() => null),
      ]);
      setHealth(h);
      setOv(o);
      setOpen(p?.open ?? []);
      setClosed((p?.closed ?? []).slice(0, 12));
      setLogs((l?.logs ?? []).filter((x) => x.level !== "INFO").slice(0, 8));
      setSys(sy);
      setRate(n(rt?.price));
      setCfg(st?.settings ?? {});
      setUpdated(Date.now());
      setErr(null);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
      inflight.current = false;
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => void load(), 6000);
    return () => window.clearInterval(id);
  }, [auto, load]);

  const eng = ov?.engine ?? {};
  const st = ov?.stats ?? {};
  const equity = n(eng.capital);
  const up = health?.ok === true;
  const on = cfg["engine.enabled"] !== false;
  const rows = open;
  const net = closed.reduce((s, c) => s + n(c.pnl), 0);
  const fees = closed.reduce((s, c) => s + n(c.fee), 0);
  const heart = n(eng.heartbeatAt ?? eng.heartbeat?.at ?? eng.heartbeat);
  const scanning = n(eng.status?.scanned) || n(eng.lastScan?.scanned);
  const tf = String(cfg["engine.executionTimeframe"] ?? "1h");
  const alloc = n(cfg["engine.capitalAllocation"]);
  const openRisk = useMemo(() => rows.reduce((s, p) => s + Math.abs(n(p.entry) - n(p.stop_loss)) * n(p.quantity), 0), [rows]);

  const engineCall = async (label: string, path: string, body?: unknown, confirmText?: string) => {
    if (!token) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setEngineBusy(label);
    setErr(null);
    try {
      await restFetch(path, { token, method: "POST", body: body ?? {}, timeoutMs: 25_000 });
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setEngineBusy(null);
    }
  };

  const QUICK: Array<[string, string, string]> = [
    ["positions", fa ? "پوزیشن‌ها" : "positions", "📊"],
    ["users", fa ? "کاربران" : "users", "👥"],
    ["exchanges", fa ? "صرافی‌ها" : "exchanges", "🔌"],
    ["risk", fa ? "ریسک" : "risk", "🛡"],
    ["markets", fa ? "بازارها" : "markets", "📈"],
    ["errors", fa ? "خطاها" : "errors", "⚠️"],
    ["ledger", fa ? "دفتر مالی" : "ledger", "💳"],
    ["tickets", fa ? "پشتیبانی" : "support", "🎧"],
    ["vip", "VIP", "👑"],
    ["coins", fa ? "سکه/ووچر" : "coins", "🪙"],
    ["reports", fa ? "گزارش‌ها" : "reports", "📄"],
    ["settings", fa ? "تنظیمات" : "settings", "⚙️"],
  ];

  return (
    <div dir="rtl" className="lz-adm-ov">
      {/* ── status band ───────────────────────────────────────────────────── */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: up ? C.up : C.down, boxShadow: `0 0 8px ${up ? C.up : C.down}` }} />
          <b style={{ fontSize: 13.5 }}>{fa ? "نمای کلی" : "Overview"}</b>
          <span style={{ fontSize: 10.5, color: up ? C.up : C.down, ...ltr }}>{health ? (up ? "ONLINE" : "DEGRADED") : "—"}</span>
          <span className={`w-chip ${on ? "w-chip-up" : "w-chip-down"}`} style={{ fontSize: 10 }}>
            {fa ? "موتور" : "engine"} {on ? (fa ? "روشن" : "on") : fa ? "خاموش" : "off"}
          </span>
        </div>
        <div style={{ width: 1, height: 26, background: C.line }} />
        <Kpi label={fa ? "سرمایه" : "equity"} value={equity ? equity.toFixed(2) + " $" : "—"} tone="gold" />
        <Kpi label={fa ? "پوزیشن باز" : "open"} value={String(rows.length)} />
        <Kpi label={fa ? "قلب" : "heartbeat"} value={heart ? ago(heart) : "—"} tone={heart && Date.now() - heart > 180000 ? "down" : "up"} />
        <Kpi label={fa ? "حالت" : "mode"} value={String(eng.mode ?? "—").toUpperCase() + (eng.paused ? " ⏸" : "")} />
        <Kpi label="db/redis" value={`${health?.db ? "✓" : "✗"}/${health?.redis ? "✓" : "✗"}`} tone={health?.db && health?.redis ? "up" : "down"} />
        <div style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => setAuto((a) => !a)} title={fa ? "خودکار" : "auto"}>
            {auto ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void load()} disabled={busy} title={fa ? "به‌روزرسانی" : "refresh"}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </button>
          <span style={{ fontSize: 10, color: C.soft, ...ltr }}>{updated ? new Date(updated).toLocaleTimeString() : "—"}</span>
        </div>
      </div>

      {err && (
        <div style={{ ...card, borderColor: "rgba(255,107,107,.4)", color: C.down, fontSize: 11.5, display: "flex", gap: 6, alignItems: "center" }}>
          <AlertTriangle size={12} /> {err}
        </div>
      )}

      {/* ── quick access ──────────────────────────────────────────────────── */}
      <div style={{ ...card, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10.5, color: C.soft, marginInlineEnd: 4 }}>{fa ? "دسترسی سریع" : "quick"}</span>
        {QUICK.map(([tab, label, icon]) => (
          <button
            key={tab}
            onClick={() => onNavigate?.(tab)}
            style={{
              background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.09)",
              borderRadius: 9, padding: "5px 9px", color: "inherit", cursor: "pointer",
              fontSize: 11.5, fontWeight: 700, display: "inline-flex", gap: 5, alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12 }}>{icon}</span> {label}
          </button>
        ))}
      </div>

      {/* ── KPI: two rows of six, every money card also in toman ──────────── */}
      <div className="w-kpi6">
        <Box label={fa ? "پوزیشن باز" : "open"} value={String(st.openCount ?? rows.length)}
          sub={`${fa ? "ریسک باز" : "risk"} ${money(openRisk, 2)}$ · ${irt(openRisk, rate)}`} tone="gold" />
        <Box label={fa ? "سرمایهٔ کل" : "equity"} value={equity ? equity.toFixed(2) + " $" : "—"}
          sub={`≈ ${irt(equity, rate)} ${fa ? "تومان" : "IRT"}`} />
        <Box label={fa ? "سود تحقق‌یافته (خالص)" : "realized net"} value={money(n(st.realizedPnl)) + " $"}
          sub={`≈ ${irt(n(st.realizedPnl), rate)} ${fa ? "تومان" : "IRT"}`} tone={n(st.realizedPnl) >= 0 ? "up" : "down"} />
        <Box label={fa ? "سود باز" : "unrealized"} value={money(n(st.unrealizedPnl)) + " $"}
          sub={`≈ ${irt(n(st.unrealizedPnl), rate)} ${fa ? "تومان" : "IRT"}`} tone={n(st.unrealizedPnl) >= 0 ? "up" : "down"} />
        <Box label={fa ? "هزینهٔ کل" : "fees paid"} value={money(-Math.abs(n(st.fees))) + " $"}
          sub={`≈ ${irt(n(st.fees), rate)} ${fa ? "تومان" : "IRT"}`} tone="down" />
        <Box label={fa ? "سود امروز" : "today pnl"} value={money(n(st.todayPnl)) + " $"}
          sub={`≈ ${irt(n(st.todayPnl), rate)} ${fa ? "تومان" : "IRT"}`} tone={n(st.todayPnl) >= 0 ? "up" : "down"} />
        <Box label={fa ? "ترید امروز" : "today trades"} value={String(n(st.todayTrades))}
          sub={`${fa ? "بسته‌شده" : "closed"} · ${fa ? "کل" : "all"} ${n(st.closedCount)}`} />
        <Box label={fa ? "نرخ برد" : "win rate"} value={n(st.winRate).toFixed(1) + "%"}
          sub={fa ? "از معاملات بسته‌شده" : "closed trades"} tone="gold" />
        <Box label={fa ? "کاربران" : "users"} value={String(n(st.users))} sub={"VIP " + n(st.vipUsers)} />
        <Box label={fa ? "صرافی فعال" : "exchanges"} value={String((ov?.exchanges ?? []).filter((x: any) => x.enabled).length)}
          sub={String((ov?.exchanges ?? [])[0]?.provider ?? "—")} />
        <Box label={fa ? "اسکن آخر" : "last scan"} value={scanning ? String(scanning) : "—"} sub={fa ? "نماد" : "symbols"} />
        <Box label={fa ? "حالت موتور" : "engine"} value={String(eng.mode ?? "—").toUpperCase()}
          sub={eng.emergencyStop ? (fa ? "توقف اضطراری" : "stopped") : eng.paused ? (fa ? "ورود متوقف" : "paused") : (fa ? "فعال" : "running")}
          tone={eng.emergencyStop ? "down" : "up"} />
      </div>

      {/* ── engine page, merged here ──────────────────────────────────────── */}
      <div className="w-grid w-g-2" style={{ gap: 8 }}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <b style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}><Power size={13} className="w-gold" /> {fa ? "کنترل موتور" : "Engine control"}</b>
            <span className={`w-chip ${on && !eng.emergencyStop ? "w-chip-up" : "w-chip-down"}`}>
              {eng.emergencyStop ? (fa ? "توقف اضطراری" : "HALTED") : on ? (fa ? "روشن" : "ON") : (fa ? "خاموش" : "OFF")}
            </span>
          </div>
          <button
            className={`w-btn ${on ? "w-btn-danger" : "w-btn-gold"}`}
            style={{ width: "100%", height: 42, fontSize: 13.5, fontWeight: 900 }}
            disabled={engineBusy !== null}
            onClick={() => void engineCall("power", "/admin/engine/mode", { engineEnabled: !on })}
          >
            {engineBusy === "power" ? <Loader2 className="animate-spin" size={14} /> : <Power size={14} />}
            {on ? (fa ? " خاموش کردن موتور" : " Turn engine OFF") : (fa ? " روشن کردن موتور" : " Turn engine ON")}
          </button>
          <div className="w-list" style={{ marginTop: 8 }}>
            <div className="w-li"><span>{fa ? "حالت اجرا" : "mode"}</span><b className="w-mono" dir="ltr">{String(eng.mode ?? "—")}</b></div>
            <div className="w-li"><span>{fa ? "سرمایه" : "capital"}</span><b className="w-mono" dir="ltr">{equity.toFixed(4)} $ · {irt(equity, rate)}</b></div>
            <div className="w-li"><span>{fa ? "تخصیص سرمایه" : "allocation"}</span><b className="w-mono" dir="ltr">{alloc}%</b></div>
            <div className="w-li"><span>{fa ? "سود تحقق‌یافته" : "realized"}</span><b className={`w-mono ${n(st.realizedPnl) >= 0 ? "w-up" : "w-down"}`} dir="ltr">{money(n(st.realizedPnl))} $</b></div>
            <div className="w-li"><span>{fa ? "تایم‌فریم اجرا" : "timeframe"}</span><b className="w-mono" dir="ltr">{tf}</b></div>
          </div>
          <div className="w-row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <Switch on={!!eng.emergencyStop} busy={engineBusy !== null} label={eng.emergencyStop ? (fa ? "رفع توقف اضطراری" : "clear halt") : (fa ? "توقف اضطراری" : "emergency")}
              onClick={() => void engineCall("halt", "/admin/emergency/stop", { stop: !eng.emergencyStop },
                !eng.emergencyStop ? (fa ? "موتور کاملاً متوقف شود؟" : "Halt the engine?") : undefined)} />
            <Switch on={!!eng.paused} busy={engineBusy !== null} label={fa ? "توقف ورود جدید" : "pause entries"}
              onClick={() => void engineCall("pause", "/admin/emergency/pause", { paused: !eng.paused })} />
            <button className="w-btn w-btn-ghost w-btn-sm" disabled={engineBusy !== null} onClick={() => void engineCall("scan", "/admin/engine/scan")}>
              {engineBusy === "scan" ? <Loader2 className="animate-spin" size={12} /> : <Play size={12} />} {fa ? "اسکن دستی" : "scan"}
            </button>
          </div>
          <div className="w-open-box">
            <div className="w-open-title">⚡ {fa ? "باز کردن دستی پوزیشن" : "manual position"}</div>
            <div className="w-open-grid">
              <label>
                <span>{fa ? "نماد" : "symbol"}</span>
                <input className="w-input" placeholder="BTCUSDT" dir="ltr"
                  value={manual.symbol} onChange={(e) => setManual((m) => ({ ...m, symbol: e.target.value.toUpperCase() }))} />
              </label>
              <label>
                <span>{fa ? "جهت" : "side"}</span>
                <select className="w-input" value={manual.side} dir="ltr"
                  onChange={(e) => setManual((m) => ({ ...m, side: e.target.value }))}>
                  <option value="long">{fa ? "خرید (لانگ)" : "long"}</option>
                  <option value="short">{fa ? "فروش (شورت)" : "short"}</option>
                </select>
              </label>
              <button className="w-btn w-btn-gold" disabled={engineBusy !== null || manual.symbol.trim().length < 4}
                onClick={() => void engineCall("manual", "/admin/positions/open", manual, fa ? manual.symbol + " دستی باز شود؟" : "Open " + manual.symbol + "?")}>
                {engineBusy === "manual" ? <Loader2 className="animate-spin" size={13} /> : <Play size={13} />} {fa ? "باز کن" : "open"}
              </button>
            </div>
            <div className="w-row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <button className="w-btn w-btn-danger w-btn-sm" disabled={engineBusy !== null || rows.length === 0}
                onClick={() => void engineCall("closeall", "/admin/emergency/close-all", {}, fa ? "همهٔ پوزیشن‌ها بازار بسته شوند؟" : "Close every position at market?")}>
                {engineBusy === "closeall" ? <Loader2 className="animate-spin" size={12} /> : <X size={12} />} {fa ? "بستن همهٔ پوزیشن‌ها" : "close all"}
              </button>
              <span className="w-tiny" style={{ marginInlineStart: "auto", opacity: 0.7 }}>
                {fa ? "با قوانین کامل ریسک موتور و SL/TP خودکار باز می‌شود" : "opens with the engine's full risk rules"}
              </span>
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
            <b style={{ fontSize: 12.5 }}>{fa ? "پوزیشن‌های باز موتور" : "open engine positions"}</b>
            <span style={{ fontSize: 10.5, color: C.soft }}>{fa ? "ریسک و R هر پوزیشن" : "risk & R"}</span>
          </div>
          {rows.length === 0 ? (
            <div style={{ fontSize: 11.5, color: C.soft, padding: "8px 2px" }}>{fa ? "پوزیشن بازی نیست" : "none"}</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>{fa ? "نماد" : "symbol"}</th>
                    <th style={th}>{fa ? "جهت" : "side"}</th>
                    <th style={th}>{fa ? "ورود" : "entry"}</th>
                    <th style={th}>{fa ? "حجم" : "size"}</th>
                    <th style={th}>{fa ? "وثیقه" : "margin"}</th>
                    <th style={th}>{fa ? "ریسک ۱N" : "1N"}</th>
                    <th style={th}>R</th>
                    <th style={th}>PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p, i) => {
                    const risk = Math.abs(n(p.entry) - n(p.stop_loss)) * n(p.quantity);
                    const r = risk > 0 ? n(p.pnl) / risk : 0;
                    return (
                      <tr key={p.id ?? i}>
                        <td style={{ ...td, fontWeight: 800 }} dir="ltr">{p.symbol}</td>
                        <td style={{ ...td, color: String(p.side).toLowerCase() === "short" ? C.down : C.up, fontSize: 11 }} dir="ltr">{p.side}</td>
                        <td style={{ ...td, ...ltr }}>{px(n(p.entry))}</td>
                        <td style={{ ...td, ...ltr }}>{n(p.size).toFixed(2)}</td>
                        <td style={{ ...td, ...ltr }}>{n(p.margin).toFixed(2)}</td>
                        <td style={{ ...td, ...ltr, color: C.a }}>{risk.toFixed(4)}</td>
                        <td style={{ ...td, ...ltr, color: r >= 0 ? C.up : C.down }}>{r.toFixed(2)}</td>
                        <td style={{ ...td, ...ltr, color: n(p.pnl) >= 0 ? C.up : C.down }}>{money(n(p.pnl))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── every open position, full detail + chart ─────────────────────── */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <b style={{ fontSize: 12.5 }}>{fa ? "پوزیشن‌های باز" : "open positions"} <span style={{ color: C.soft, fontSize: 11 }}>({rows.length})</span></b>
        <span style={{ fontSize: 10.5, color: C.soft }}>{fa ? "هر کارت: چارت، جزئیات، ارسال به تلگرام، بستن" : "chart · details · telegram · close"}</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ ...card, fontSize: 11.5, color: C.soft }}>{fa ? "پوزیشن بازی نیست" : "none"}</div>
      ) : (
        <div className="w-grid w-g-2" style={{ gap: 8 }}>
          {rows.map((p) => (
            <PositionCard key={p.id} p={p} rate={rate} token={token} timeframe={tf} onChanged={() => void load()} />
          ))}
        </div>
      )}

      {/* ── closed + events ───────────────────────────────────────────────── */}
      <div className="w-grid w-g-2" style={{ gap: 8 }}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
            <b style={{ fontSize: 12.5 }}>{fa ? "بسته‌شده‌ها (خالص)" : "closed (net)"}</b>
            <span style={{ fontSize: 10.5, ...ltr }}>
              <span className={net >= 0 ? "w-up" : "w-down"}>{money(net)}</span>
              <span style={{ color: C.soft }}> / {money(-fees)}</span>
            </span>
          </div>
          <div style={{ maxHeight: 240, overflow: "auto" }}>
            {closed.map((c, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 2px", borderBottom: `1px solid ${C.line}`, fontSize: 11.5 }}>
                <span style={{ fontWeight: 700 }} dir="ltr">{c.symbol}</span>
                <span style={{ color: C.soft, fontSize: 10.5 }} dir="ltr">{String(c.close_reason ?? "closed")}</span>
                <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline", ...ltr }}>
                  <span className={n(c.pnl) >= 0 ? "w-up" : "w-down"}>{money(n(c.pnl))}</span>
                  <span style={{ fontSize: 10, color: C.soft }}>{irt(n(c.pnl), rate)}</span>
                </span>
              </div>
            ))}
            {closed.length === 0 && <div style={{ fontSize: 11.5, color: C.soft }}>{fa ? "معاملهٔ بسته‌شده‌ای نیست" : "none"}</div>}
          </div>
        </div>

        <div style={card}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
            <b style={{ fontSize: 12.5 }}>{fa ? "رخدادهای اخیر موتور" : "engine events"}</b>
            <span style={{ fontSize: 10.5, color: C.soft }}>{logs.length}</span>
          </div>
          <div style={{ maxHeight: 240, overflow: "auto" }}>
            {logs.map((l) => {
              const bad = l.level === "ERROR" || l.level === "CRITICAL";
              return (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6, padding: "4px 2px", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ fontSize: 9.5, color: bad ? C.down : C.a, ...ltr }}>{l.level}</span>
                  <div>
                    <div style={{ fontSize: 11, lineHeight: 1.65, direction: "rtl", textAlign: "right" }}>{String(l.message).slice(0, 110)}</div>
                    <div style={{ fontSize: 9.5, color: C.soft, ...ltr }}>{ago(l.created_at)}</div>
                  </div>
                </div>
              );
            })}
            {logs.length === 0 && <div style={{ fontSize: 11.5, color: C.soft }}>{fa ? "رخدادی نیست" : "none"}</div>}
          </div>
        </div>
      </div>

      {/* ── server + counters, one compact band ───────────────────────────── */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <b style={{ fontSize: 12 }}>{fa ? "سرور" : "server"}</b>
        <Kpi label="node" value={sys?.app?.node ?? "—"} />
        <Kpi label={fa ? "آپ‌تایم" : "uptime"} value={sys ? dur(sys.app.uptimeSec) : "—"} />
        <Kpi label="RAM" value={sys ? `${sys.app.memMb}MB` : "—"} />
        <Kpi label={fa ? "تاخیر db" : "db ms"} value={sys ? String(sys.app.dbMs) : "—"} tone={sys && sys.app.dbMs > 800 ? "down" : "up"} />
        <div style={{ width: 1, height: 24, background: C.line }} />
        <b style={{ fontSize: 12 }}>{fa ? "دیتابیس" : "db"}</b>
        <Kpi label={fa ? "کاربر" : "users"} value={sys ? String(sys.counts.users ?? 0) : "—"} />
        <Kpi label={fa ? "باز" : "open"} value={sys ? String(sys.counts.open_positions ?? 0) : "—"} />
        <Kpi label={fa ? "بسته" : "closed"} value={sys ? String(sys.counts.closed_positions ?? 0) : "—"} />
        <Kpi label={fa ? "سفارش ۲۴h" : "orders 24h"} value={sys ? String(sys.counts.orders_today ?? 0) : "—"} />
        <Kpi label={fa ? "سیگنال ۲۴h" : "signals 24h"} value={sys ? String(sys.counts.signals_today ?? 0) : "—"} />
        <Kpi label={fa ? "لاگ ۲۴h" : "logs 24h"} value={sys ? String(sys.counts.logs_today ?? 0) : "—"} />
        <span style={{ marginInlineStart: "auto", fontSize: 10, color: C.soft, display: "flex", gap: 4, alignItems: "center" }}>
          <Activity size={11} /> {fa ? "هر ۶ ثانیه" : "6s"}
        </span>
      </div>
    </div>
  );
}
