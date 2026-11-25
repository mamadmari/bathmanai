import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  Activity, AlertTriangle, BarChart3, Briefcase, Check, Crown, FileText, LayoutDashboard,
  LogOut, Menu, Moon, Newspaper, Play, Power, Save, Send, Sun, TrendingUp, Users, X, History,
  Cable, Sliders, Wallet, Headphones, Coins, Gauge, Loader2,
} from "lucide-react";
import { AdminManagementPanel } from "@/components/AdminManagementPanel";
import { UserAdmin } from "@/components/wolf/AdminExtra";
import { FundamentalNewsSection } from "@/components/FundamentalNewsSection";
import { LiveMonitor } from "@/components/wolf/LiveMonitor";
import { ApiFacts, ApiTable } from "@/components/wolf/ApiPanel";
import {
  AiAdmin, ContentAdmin, MarketsAdmin, MintAdmin, PositionsOps, SwapWalletAdmin,
  CostAdmin, ErrorsAdmin, RatesAdmin, TicketReply, TuneAdmin,
} from "@/components/wolf/AdminExtra";
import { RiskAdmin } from "@/components/wolf/RiskAdmin";
import { Cpu, FlaskConical, Radio, Repeat, ShieldCheck } from "lucide-react";
import { CryptoIcon } from "@/components/CryptoIcon";
import { restFetch } from "@/lib/backend";
import { displayName, WolfAvatar } from "@/pages/AppHome";
import { useI18n } from "@/lib/i18n";
import { useWolfAuth } from "@/hooks/use-wolf-auth";
import { useWolfTheme } from "@/lib/wolf-theme";

function SettingKeyEditor({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [keys, setKeys] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [key, setKey] = useState("");
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    restFetch("/admin/settings", { token, timeoutMs: 20_000 })
      .then((r: any) => {
        const s = r?.settings ?? {};
        setDraft(s);
        setKeys(Object.keys(s).sort());
      })
      .catch(() => setKeys([]));
  }, [token]);

  const pick = (k: string) => {
    setKey(k);
    const v = draft[k];
    setVal(typeof v === "string" ? v : JSON.stringify(v ?? null));
    setMsg(null);
  };

  const parse = (raw: string): unknown => {
    const s = raw.trim();
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "null") return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if (s.startsWith("[") || s.startsWith("{")) {
      try { return JSON.parse(s); } catch { return raw; }
    }
    return raw;
  };

  const save = async () => {
    if (!key) return;
    setBusy(true);
    setMsg(null);
    try {
      await restFetch("/admin/settings", { method: "POST", token, body: { [key]: parse(val) }, timeoutMs: 20_000 });
      setMsg({ ok: true, text: fa ? "\u0630\u062e\u06cc\u0631\u0647 \u0634\u062f" : "Saved." });
      setDraft((d) => ({ ...d, [key]: parse(val) }));
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? "\u2014") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-card w-card-pad">
      <div className="w-sec">
        <div className="w-sec-title"><i />{fa ? "\u062a\u0646\u0638\u06cc\u0645\u0627\u062a \u06a9\u0644\u06cc\u062f\u200c\u0628\u0647\u200c\u06a9\u0644\u06cc\u062f" : "Settings editor"}</div>
        <span className="w-chip">{keys.length}</span>
      </div>
      <div className="w-col" style={{ gap: 8 }}>
        <select className="w-input" value={key} onChange={(e) => pick(e.target.value)} dir="ltr">
          <option value="">{fa ? "\u06a9\u0644\u06cc\u062f \u0631\u0627 \u0627\u0646\u062a\u062e\u0627\u0628 \u06a9\u0646\u06cc\u062f" : "Pick a key"}</option>
          {keys.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input className="w-input" dir="ltr" value={val} onChange={(e) => setVal(e.target.value)} placeholder="value (JSON compatible)" />
        <div className="w-row" style={{ gap: 8 }}>
          <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void save()} disabled={busy || !key}>
            {busy ? <Loader2 className="animate-spin" size={13} /> : <Save size={13} />}{fa ? " \u0630\u062e\u06cc\u0631\u0647" : "Save"}
          </button>
          {msg && <span className={`w-tiny ${msg.ok ? "w-up" : "w-down"}`}>{msg.text}</span>}
        </div>
        <div className="w-tiny" style={{ lineHeight: 1.9 }}>
          {fa
            ? "\u062a\u063a\u06cc\u06cc\u0631\u0627\u062a \u0645\u0648\u062a\u0648\u0631 \u0628\u062f\u0648\u0646 \u0631\u06cc\u200c\u0627\u0633\u062a\u0627\u0631\u062a \u0627\u0639\u0645\u0627\u0644 \u0645\u06cc\u200c\u0634\u0648\u062f (worker \u0647\u0631 \u0686\u0631\u062e\u0647 \u0645\u06cc\u200c\u062e\u0648\u0627\u0646\u062f)."
            : "Engine settings apply on the next worker cycle; no restart needed."}
        </div>
      </div>
    </div>
  );
}

function EngineControl({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [s, setS] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r: any = await restFetch("/admin/settings", { token, timeoutMs: 15_000 });
      setS(r?.settings ?? {});
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? "—") });
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const post = async (label: string, path: string, body: unknown) => {
    setBusy(label);
    setMsg(null);
    try {
      await restFetch(path, { method: "POST", token, body, timeoutMs: 20_000 });
      setMsg({ ok: true, text: fa ? "اعمال شد." : "Applied." });
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? "—") });
    } finally {
      setBusy(null);
    }
  };

  const on = s["engine.enabled"] !== false;
  const halted = !!s["engine.emergencyStop"];
  const paused = !!s["engine.pauseNewTrades"];
  const mode = String(s["engine.mode"] ?? "demo");

  return (
    <div className="w-card w-card-pad">
      <div className="w-sec">
        <div className="w-sec-title"><i />{fa ? "کنترل موتور" : "Engine control"}</div>
        <span className={`w-chip ${on && !halted ? "w-up" : "w-down"}`}>
          {halted ? (fa ? "توقف اضطراری" : "HALTED") : on ? (fa ? "روشن" : "ON") : (fa ? "خاموش" : "OFF")}
        </span>
      </div>

      <button
        className={`w-btn ${on ? "w-btn-danger" : "w-btn-gold"}`}
        style={{ width: "100%", height: 46, fontSize: 14, fontWeight: 900 }}
        onClick={() => void post("power", "/admin/engine/mode", { engineEnabled: !on })}
        disabled={busy !== null}
      >
        {busy === "power" ? <Loader2 className="animate-spin" size={15} /> : <Power size={15} />}
        {on ? (fa ? " خاموش کردن موتور" : " Turn engine OFF") : (fa ? " روشن کردن موتور" : " Turn engine ON")}
      </button>

      <div className="w-list" style={{ marginTop: 10 }}>
        <div className="w-li"><span>{fa ? "حالت اجرا" : "Run mode"}</span>
          <b className="w-mono" dir="ltr">{mode === "live" ? (fa ? "واقعی (live)" : "live") : (fa ? "آزمایشی (demo)" : "demo")}</b>
        </div>
        <div className="w-li"><span>{fa ? "سرمایه" : "Capital"}</span><b className="w-num">{String(s["engine.capital"] ?? "—")}</b></div>
        <div className="w-li"><span>{fa ? "سود/زیان محقق‌شده" : "Realized PnL"}</span><b className="w-num">{String(s["engine.realizedPnl"] ?? "—")}</b></div>
      </div>

      <div className="w-row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void post("halt", "/admin/emergency/stop", { stop: !halted })} disabled={busy !== null}>
          {halted ? (fa ? "رفع توقف اضطراری" : "Clear halt") : (fa ? "توقف اضطراری" : "Emergency stop")}
        </button>
        <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void post("pause", "/admin/emergency/pause", { pause: !paused })} disabled={busy !== null}>
          {paused ? (fa ? "ادامهٔ ورودهای جدید" : "Resume entries") : (fa ? "توقف ورودهای جدید" : "Pause new trades")}
        </button>
        <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void post("scan", "/admin/engine/scan", {})} disabled={busy !== null}>
          {busy === "scan" ? <Loader2 className="animate-spin" size={13} /> : <Play size={13} />} {fa ? "اسکن دستی" : "Scan now"}
        </button>
      </div>
      {msg && <div className={`w-tiny ${msg.ok ? "w-up" : "w-down"}`} style={{ marginTop: 8 }}>{msg.text}</div>}
      <div className="w-tiny" style={{ marginTop: 8, lineHeight: 1.9 }}>
        {fa
          ? "خاموش کردن موتور فقط ورودهای جدید را متوقف می‌کند؛ پوزیشن‌های باز توسط موتور مدیریت می‌شوند. تغییر حالت demo/live از این پنل انجام نمی‌شود."
          : "Turning the engine off stops new entries; open positions keep being managed. demo/live is not switchable from here."}
      </div>
    </div>
  );
}

type Tab =
  | "live"
  | "overview" | "engine" | "positions" | "strategies" | "users" | "reports" | "comms" | "logs"
  | "exchanges" | "settings" | "ledger" | "tickets" | "vip" | "coins" | "monitor"
  | "markets" | "risk" | "errors" | "rates" | "ai" | "content" | "swapwallet" | "mint" | "tune";

const N = (v: unknown, d = 2) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });
};

/** Never render an object into JSX (React #31) — pick a readable scalar. */
const txt = (v: unknown, fallback = "—"): string => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") return v.trim() || fallback;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["state", "status", "message", "name", "value", "kind"]) {
      const candidate = o[k];
      if (typeof candidate === "string" && candidate) return candidate;
      if (typeof candidate === "number") return String(candidate);
    }
    return fallback;
  }
  return fallback;
};

const ago = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const sec = Math.max(0, Math.round((Date.now() - n) / 1000));
  return sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.round(sec / 60)}m` : `${Math.round(sec / 3600)}h`;
};

export default function AdminConsole() {
  const { token, logout } = useWolfAuth();
  const { lang } = useI18n();
  const fa = lang === "fa";
  const { theme, toggle } = useWolfTheme();
  const [tab, setTab] = useState<Tab>("live");
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [baleInfo, setBaleInfo] = useState<any>(null);
  const [baleToken, setBaleToken] = useState("");
  const [baleMin, setBaleMin] = useState("");
  const [d, setD] = useState<any>({ overview: null, open: [], closed: [], report: null, logs: [], tg: null, news: [], strategies: [] });
  const [score, setScore] = useState<{ hours: number; total: any; rows: any[] }>({ hours: 12, total: null, rows: [] });
  const [scoreHours, setScoreHours] = useState(12);

  useEffect(() => {
    if (!token) return;
    let live = true;
    restFetch<{ hours: number; total: any; rows: any[] }>(`/admin/strategy-scoreboard?hours=${scoreHours}`, { token, timeoutMs: 20_000 })
      .then((r) => { if (live) setScore(r ?? { hours: scoreHours, total: null, rows: [] }); })
      .catch(() => { if (live) setScore({ hours: scoreHours, total: null, rows: [] }); });
    return () => { live = false; };
  }, [token, scoreHours, tab]);

  const load = useCallback(async () => {
    if (!token) return;
    const safe = async (p: string) => {
      try { return await restFetch(p, { token, timeoutMs: 16_000 }); } catch { return null; }
    };
    const [overview, pos, report, logs, tg, news, strat] = await Promise.all([
      safe("/admin/overview"), safe("/admin/positions"), safe(`/admin/reports?period=${period}`),
      safe("/admin/logs"), safe("/admin/telegram/webhook-info"), safe("/admin/news?limit=12"), safe("/admin/strategies"),
    ]);
    setD({
      overview,
      open: Array.isArray((pos as any)?.open) ? (pos as any).open : Array.isArray((overview as any)?.openPositions) ? (overview as any).openPositions : [],
      closed: Array.isArray((pos as any)?.closed) ? (pos as any).closed.slice(0, 30) : [],
      report: report ?? null,
      logs: Array.isArray((logs as any)?.logs) ? (logs as any).logs.slice(0, 80) : Array.isArray((overview as any)?.logs) ? (overview as any).logs : [],
      tg: tg ?? null,
      news: Array.isArray((news as any)?.news) ? (news as any).news : [],
      strategies: Array.isArray((strat as any)?.strategies) ? (strat as any).strategies : [],
    });
  }, [token, period]);

  useEffect(() => {
    void load();
    const id = window.setInterval(load, 20_000);
    return () => window.clearInterval(id);
  }, [load]);
  const act = async (label: string, path: string, body?: unknown, method = "POST") => {
    setBusy(label);
    setMsg(null);
    try {
      await restFetch(path, { method, token, body: body ?? {}, timeoutMs: 25_000 });
      setMsg({ ok: true, text: fa ? "انجام شد." : "Done." });
      void load();
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? (fa ? "عملیات ناموفق بود." : "Action failed.")) });
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    restFetch("/bale/info", { timeoutMs: 10_000 }).then((r) => setBaleInfo(r)).catch(() => undefined);
  }, []);

  const saveBale = async () => {
    const body: Record<string, unknown> = {};
    if (baleToken.trim()) body["bale.providerToken"] = baleToken.trim();
    const min = Number(String(baleMin).replace(/[^0-9]/g, ""));
    if (min >= 1000) body["bale.minTopup"] = min;
    if (!Object.keys(body).length) {
      setMsg({ ok: false, text: fa ? "مقداری برای ذخیره وارد نشده است." : "Nothing to save." });
      return;
    }
    await act("bale", "/admin/settings", body);
    setBaleToken("");
    setBaleMin("");
    restFetch("/bale/info", { timeoutMs: 10_000 }).then((r) => setBaleInfo(r)).catch(() => undefined);
  };

  const engine = d.overview?.engine ?? {};
  const stats = d.overview?.stats ?? {};
  const report = d.report ?? {};
  const engineState = txt(engine.status, "idle");
  const heartbeatAt = (engine.heartbeat as any)?.at ?? 0;
  const online = Number(heartbeatAt) > 0 && Date.now() - Number(heartbeatAt) < 180_000;
  const lastScan = txt(engine.lastScan, "—");
  const openPnl = d.open.reduce((s: number, p: any) => s + Number(p.pnl ?? 0), 0);

  const nav: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "live", label: fa ? "نمای کلی" : "Overview", icon: <LayoutDashboard size={16} /> },
    { key: "positions", label: fa ? "پوزیشن‌ها" : "Positions", icon: <Briefcase size={16} /> },
    { key: "strategies", label: fa ? "استراتژی‌ها" : "Strategies", icon: <AlertTriangle size={16} /> },
    { key: "users", label: fa ? "کاربران و مالی" : "Users & finance", icon: <Users size={16} /> },
    { key: "reports", label: fa ? "گزارش‌ها" : "Reports", icon: <FileText size={16} /> },
    { key: "comms", label: fa ? "ارتباطات" : "Comms", icon: <Newspaper size={16} /> },
    { key: "logs", label: fa ? "لاگ‌ها" : "Logs", icon: <Activity size={16} /> },
    { key: "exchanges", label: fa ? "صرافی‌ها" : "Exchanges", icon: <Cable size={16} /> },
    { key: "settings", label: fa ? "تنظیمات" : "Settings", icon: <Sliders size={16} /> },
    { key: "ledger", label: fa ? "دفتر مالی" : "Ledger", icon: <Wallet size={16} /> },
    { key: "tickets", label: fa ? "پشتیبانی" : "Support", icon: <Headphones size={16} /> },
    { key: "vip", label: "VIP", icon: <Crown size={16} /> },
    { key: "coins", label: fa ? "سکه و ووچر" : "Coins", icon: <Coins size={16} /> },
    { key: "monitor", label: fa ? "مانیتور" : "Monitor", icon: <Gauge size={16} /> },
    { key: "markets", label: fa ? "بازارها" : "Markets", icon: <BarChart3 size={16} /> },
    { key: "risk", label: fa ? "ریسک" : "Risk", icon: <ShieldCheck size={16} /> },
    { key: "errors", label: fa ? "خطاها" : "Errors", icon: <AlertTriangle size={16} /> },
    { key: "rates", label: fa ? "نرخ تتر" : "USDT rate", icon: <Radio size={16} /> },
    { key: "ai", label: "AI", icon: <Cpu size={16} /> },
    { key: "content", label: fa ? "محتوا و ارسال" : "Content", icon: <Radio size={16} /> },
    { key: "swapwallet", label: fa ? "سواپ‌ولت" : "SwapWallet", icon: <Repeat size={16} /> },
    { key: "mint", label: fa ? "سکه و ووچر" : "Mint", icon: <Coins size={16} /> },
    { key: "tune", label: fa ? "بک‌تست و تیونر" : "Tune", icon: <FlaskConical size={16} /> },
  ];
  const title = nav.find((n) => n.key === tab)?.label ?? "";
  // 24 flat links were unreadable: the sidebar now shows five collapsible groups
  // and only the group of the active tab is open by default.
  const NAV_GROUPS: Array<{ key: string; label: string; keys: string[] }> = [
    { key: "engine", label: fa ? "موتور و معامله" : "Engine", keys: ["live", "positions", "strategies", "errors"] },
    { key: "market", label: fa ? "بازار و ریسک" : "Market & risk", keys: ["markets", "risk", "tune"] },
    { key: "people", label: fa ? "کاربران و مالی" : "Users & money", keys: ["users", "ledger", "tickets", "vip", "coins", "mint", "swapwallet", "rates"] },
    { key: "content", label: fa ? "محتوا و ارتباط" : "Content", keys: ["content", "comms", "ai"] },
    { key: "system", label: fa ? "سیستم" : "System", keys: ["exchanges", "settings", "logs", "reports"] },
  ];
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  const categories = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of d.strategies) {
      const key = txt(s.category_fa ?? s.category, "other");
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [d.strategies]);

  const CONFLICTS: Record<string, string[]> = {
    trend: ["mean_reversion", "scalping"],
    mean_reversion: ["trend", "breakout", "momentum"],
    breakout: ["mean_reversion", "support_resistance"],
    support_resistance: ["breakout"],
    scalping: ["swing", "trend"],
    swing: ["scalping"],
    momentum: ["mean_reversion"],
  };

  const togglePick = (key: string, category: string) => {
    setMsg(null);
    setPicked((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      const clash = (CONFLICTS[category] ?? []).find((c) =>
        d.strategies.some((s: any) => prev.includes(s.key) && txt(s.category) === c),
      );
      if (clash) {
        setMsg({ ok: false, text: fa ? `این دسته با «${clash}» در حالت فعال تضاد دارد.` : `This category conflicts with "${clash}".` });
        return prev;
      }
      return [...prev, key];
    });
  };
  return (
    <div className="w-root w-grid-bg">
      <div className="w-shell">
        {open && <div className="w-scrim" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 55 }} />}
        <aside className={`w-side${open ? " is-open" : ""}`}>
          <div className="w-row" style={{ gap: 10, padding: "0 6px 10px" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: "linear-gradient(160deg, rgba(240,194,90,.24), rgba(240,194,90,.05))", border: "1px solid rgba(240,194,90,.32)" }}>
              <Activity size={17} className="w-gold" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{fa ? "کنسول ادمین" : "Admin console"}</div>
              <div className="w-tiny">Trading Wolf AI</div>
            </div>
          </div>
          {NAV_GROUPS.map((g) => {
            const items = nav.filter((n) => g.keys.includes(String(n.key)));
            const isOpen = items.some((i) => i.key === tab) || openGroups.includes(g.key);
            return (
              <div key={g.key}>
                <button
                  className="w-group-title"
                  style={{ width: "100%", textAlign: "start", cursor: "pointer", background: "none", border: 0, color: "inherit" }}
                  onClick={() => setOpenGroups((prev) => (prev.includes(g.key) ? prev.filter((k) => k !== g.key) : [...prev, g.key]))}
                >
                  {g.label} <span style={{ opacity: 0.5 }}>{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen &&
                  items.map((n) => (
                    <button key={n.key} className={`w-side-link${tab === n.key ? " is-active" : ""}`} onClick={() => { setTab(n.key); setOpen(false); }}>
                      {n.icon} {n.label}
                    </button>
                  ))}
              </div>
            );
          })}
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            <Link to="/app" className="w-side-link"><Users size={16} /> {fa ? "پنل کاربری" : "User panel"}</Link>
            <Link to="/admin/full" className="w-side-link" style={{ opacity: 0.8 }}>
              <History size={16} /> {fa ? "پنل ادمین قبلی (برای انتقال)" : "Legacy admin panel"}
            </Link>
            <button className="w-side-link" onClick={() => void logout()}><LogOut size={16} /> {fa ? "خروج" : "Sign out"}</button>
          </div>
        </aside>

        <main className="w-main">
          <header className="w-topbar">
            <div className="w-row" style={{ gap: 10 }}>
              <button className="w-btn w-btn-ghost w-btn-icon w-burger" onClick={() => setOpen(true)} aria-label="menu"><Menu size={17} /></button>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
                <div className="w-tiny">Trading Wolf AI · admin</div>
              </div>
            </div>
            <div className="w-row" style={{ gap: 8 }}>
              <button className="w-btn w-btn-ghost w-btn-icon" onClick={toggle} title={fa ? "تغییر تم" : "Toggle theme"}>
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>
          </header>

          <div className="w-body">
            {msg && (
              <div className="w-card w-card-pad" style={{ marginBottom: 10, borderColor: msg.ok ? "rgba(53,214,138,.45)" : "rgba(255,107,107,.5)" }}>
                <span className={msg.ok ? "w-up" : "w-down"}>{msg.text}</span>
              </div>
            )}
            <div className="w-fade-in">
              {false && tab === "overview" && (
                <>
                  <div className="w-grid w-g-4">
                    <div className="w-kpi"><div className="w-kpi-label">{fa ? "پوزیشن باز" : "Open positions"}</div><div className="w-kpi-value w-num">{N(stats.openCount ?? d.open.length, 0)}</div><div className="w-kpi-foot">{fa ? "سود شناور" : "floating"} {N(openPnl)} USDT</div></div>
                    <div className="w-kpi"><div className="w-kpi-label">{fa ? "بسته‌شده" : "Closed"}</div><div className="w-kpi-value w-num">{N(stats.closedCount, 0)}</div><div className="w-kpi-foot">{fa ? "سود تحقق‌یافته" : "realized"} {N(stats.realizedPnl)}</div></div>
                    <div className="w-kpi"><div className="w-kpi-label">{fa ? "معاملات امروز" : "Today"}</div><div className="w-kpi-value w-num">{N(stats.today?.trades ?? report.trades, 0)}</div><div className="w-kpi-foot">{fa ? "برد" : "wins"} {N(report.wins, 0)}</div></div>
                    <div className="w-kpi"><div className="w-kpi-label">{fa ? "وبهوک تلگرام" : "Telegram webhook"}</div><div className="w-kpi-value" style={{ fontSize: 20, color: d.tg?.ok ? "var(--w-up)" : "var(--w-down)" }}>{d.tg?.ok ? "OK" : "—"}</div><div className="w-kpi-foot">{fa ? "در صف" : "pending"} {N(d.tg?.pendingUpdateCount, 0)}</div></div>
                  </div>

                  <div className="w-grid w-g-2">
                    <div className="w-card w-card-pad">
                      <div className="w-sec"><div className="w-sec-title"><i />{fa ? "وضعیت موتور" : "Engine"}</div><span className={`w-chip${online ? " w-chip-up" : " w-chip-down"}`}>{online ? (fa ? "آنلاین" : "online") : fa ? "آفلاین" : "offline"}</span></div>
                      <div className="w-list">
                        <div className="w-li"><span>{fa ? "وضعیت" : "Status"}</span><b>{engineState}</b></div>
                        <div className="w-li"><span>{fa ? "حالت" : "Mode"}</span><b>{txt(engine.mode)}</b></div>
                        <div className="w-li"><span>{fa ? "سرمایه" : "Capital"}</span><b className="w-num">{N(engine.capital)}</b></div>
                        <div className="w-li"><span>{fa ? "آخرین ضربان" : "Heartbeat"}</span><b>{ago(heartbeatAt)}</b></div>
                        <div className="w-li"><span>{fa ? "آخرین اسکن" : "Last scan"}</span><b>{lastScan}</b></div>
                        <div className="w-li"><span>{fa ? "توقف اضطراری" : "Emergency stop"}</span><b className={engine.emergencyStop ? "w-down" : "w-up"}>{engine.emergencyStop ? (fa ? "روشن" : "on") : fa ? "خاموش" : "off"}</b></div>
                      </div>
                      <div className="w-pos-actions" style={{ marginTop: 10 }}>
                        <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => setTab("engine")}>
                          <Power size={13} /> {fa ? "کنترل کامل موتور" : "Full engine control"}
                        </button>
                        <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void act("sendall", "/admin/positions/send-all-telegram")} disabled={busy !== ""}>
                          <Send size={13} /> {fa ? "ارسال همه به کانال" : "Send all"}
                        </button>
                      </div>
                    </div>

                    <div className="w-card w-card-pad">
                      <div className="w-sec"><div className="w-sec-title"><i />{fa ? "رویدادهای اخیر" : "Recent events"}</div><span className="w-tiny">{d.logs.length}</span></div>
                      <div className="w-list" style={{ maxHeight: 250, overflow: "auto" }}>
                        {d.logs.slice(0, 12).map((l: any, i: number) => (
                          <div className="w-li" key={i}>
                            <div className="w-li-main"><span className="w-mono w-tiny">{txt(l.level, "info").toUpperCase()}</span><span className="w-trunc" style={{ maxWidth: 200, fontSize: 12 }}>{txt(l.message)}</span></div>
                            <span className="w-tiny">{ago(l.created)}</span>
                          </div>
                        ))}
                        {!d.logs.length && <div className="w-empty">{fa ? "رویدادی نیست." : "No event."}</div>}
                      </div>
                    </div>
                  </div>
                </>
              )}
{tab === "engine" && (
                <div className="w-grid w-g-2">
                  <EngineControl token={token} />
                  <ApiTable
                    title={fa ? "پوزیشن‌های باز موتور" : "Open engine positions"}
                    endpoint="/admin/positions"
                    arrayKey="open"
                    token={token}
                    columns={[
                      { k: "symbol", label: fa ? "نماد" : "Symbol" },
                      { k: "side", label: fa ? "جهت" : "Side", fmt: "chip" },
                      { k: "entry", label: fa ? "ورود" : "Entry", fmt: "num" },
                      { k: "size", label: fa ? "حجم" : "Size", fmt: "num" },
                      { k: "margin", label: fa ? "مارجین" : "Margin", fmt: "num" },
                      { k: "risk_amount", label: fa ? "ریسک 1N" : "1N", fmt: "num" },
                      { k: "r_multiple", label: "R", fmt: "num" },
                      { k: "pnl", label: "PnL", fmt: "num" },
                    ]}
                    emptyText={fa ? "پوزیشن بازی نیست." : "No open position."}
                  />
                  <PositionsOps token={token} />
                </div>
              )}
              {tab === "positions" && (
                <>
                  <div className="w-card w-card-pad">
                    <div className="w-sec"><div className="w-sec-title"><i />{fa ? "پوزیشن‌های باز" : "Open positions"}</div><span className="w-chip">{d.open.length}</span></div>
                    <div className="w-grid w-g-2" style={{ gap: 10 }}>
                      {d.open.map((p: any) => (
                        <div className="w-pos-card" key={p.id}>
                          <div className="w-pos-head">
                            <div className="w-row" style={{ gap: 8 }}><CryptoIcon symbol={p.symbol} size="sm" /><div><b style={{ fontSize: 13 }}>{txt(p.symbol)}</b><div className="w-tiny">{txt(p.side)} · {txt(p.mode)}</div></div></div>
                            <b className={`w-num ${Number(p.pnl) >= 0 ? "w-up" : "w-down"}`}>{Number(p.pnl) >= 0 ? "+" : ""}{N(p.pnl)}</b>
                          </div>
                          <div className="w-pos-actions">
                            <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void act(`c${p.id}`, `/admin/positions/${p.id}/close`)} disabled={busy !== ""}>{fa ? "بستن" : "Close"}</button>
                            <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void act(`t${p.id}`, `/admin/positions/${p.id}/telegram`)} disabled={busy !== ""}><Send size={12} /> {fa ? "تلگرام" : "Telegram"}</button>
                          </div>
                        </div>
                      ))}
                      {!d.open.length && <div className="w-empty">{fa ? "پوزیشن بازی نیست." : "No open position."}</div>}
                    </div>
                  </div>
                  <div className="w-card w-card-pad">
                    <div className="w-sec"><div className="w-sec-title"><i />{fa ? "بسته‌شده‌ها" : "Closed"}</div><span className="w-chip">{d.closed.length}</span></div>
                    <div className="w-table-wrap">
                      <table className="w-table w-table-min">
                        <thead><tr><th>{fa ? "نماد" : "Symbol"}</th><th>{fa ? "جهت" : "Side"}</th><th>{fa ? "خروج" : "Exit"}</th><th>{fa ? "دلیل" : "Reason"}</th><th>{fa ? "سود" : "Profit"}</th></tr></thead>
                        <tbody>
                          {d.closed.map((p: any) => (
                            <tr key={p.id}>
                              <td><div className="w-row" style={{ gap: 7 }}><CryptoIcon symbol={p.symbol} size="xs" /><b>{txt(p.symbol)}</b></div></td>
                              <td className="w-tiny">{txt(p.side)}</td>
                              <td className="w-num">{N(p.close_price, 4)}</td>
                              <td className="w-tiny">{txt(p.close_reason)}</td>
                              <td className={`w-num ${Number(p.profit) >= 0 ? "w-up" : "w-down"}`}>{Number(p.profit) >= 0 ? "+" : ""}{N(p.profit)}</td>
                            </tr>
                          ))}
                          {!d.closed.length && <tr><td colSpan={5} className="w-empty">{fa ? "معامله بسته‌ای نیست." : "No closed trade."}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {tab === "strategies" && (
                <div className="w-card w-card-pad">
                  <div className="w-sec">
                    <div className="w-sec-title"><i />{fa ? "فعال‌سازی هم‌زمان استراتژی‌ها" : "Enable strategies together"}</div>
                    <div className="w-sec-actions">
                      <span className="w-chip w-chip-gold">{picked.length} {fa ? "انتخاب" : "picked"}</span>
                      <button className="w-btn w-btn-gold w-btn-sm" disabled={!picked.length || busy !== ""} onClick={() => void act("bulk", "/admin/strategies/bulk", { keys: picked, enabled: true }).then(() => setPicked([]))}>
                        <Save size={13} /> {fa ? "فعال‌سازی" : "Enable"}
                      </button>
                      <button className="w-btn w-btn-ghost w-btn-sm" disabled={!picked.length || busy !== ""} onClick={() => void act("bulk", "/admin/strategies/bulk", { keys: picked, enabled: false }).then(() => setPicked([]))}>
                        <X size={13} /> {fa ? "خاموش کردن" : "Disable"}
                      </button>
                    </div>
                  </div>
                  <div className="w-tiny" style={{ marginBottom: 10 }}>
                    {fa ? "دسته‌های متضاد (مثل ترند و بازگشتی) هم‌زمان فعال نمی‌شوند؛ سرور هم این را بررسی می‌کند." : "Opposing categories (trend vs mean-reversion) cannot be on together — the server enforces it too."}
                  </div>
                  <div className="w-grid w-g-3" style={{ gap: 10 }}>
                    {categories.map(([cat, items]) => (
                      <div className="w-card" key={cat} style={{ padding: 12 }}>
                        <div className="w-between" style={{ marginBottom: 6 }}>
                          <b style={{ fontSize: 12.5 }}>{cat}</b>
                          <span className="w-tiny">{items.length}</span>
                        </div>
                        <div className="w-list" style={{ maxHeight: 190, overflow: "auto" }}>
                          {items.map((s: any) => {
                            const on = picked.includes(s.key);
                            return (
                              <button key={s.key} className="w-li" onClick={() => togglePick(s.key, txt(s.category))} style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", font: "inherit", textAlign: "start", width: "100%" }}>
                                <span className="w-li-main">{on ? <Check size={13} className="w-up" /> : <span style={{ width: 13 }} />}<span className="w-trunc" style={{ maxWidth: 170 }}>{txt(s.name_fa ?? s.name ?? s.key)}</span></span>
                                <span className={`w-chip${s.enabled ? " w-chip-up" : ""}`}>{s.enabled ? (fa ? "روشن" : "on") : fa ? "خاموش" : "off"}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {tab === "strategies" && (
                <div className="w-card w-card-pad">
                  <div className="w-sec">
                    <div className="w-sec-title"><i />{fa ? "امتیاز استراتژی‌ها (معاملات واقعی دمو)" : "Strategy scoreboard (demo trades)"}</div>
                    <div className="w-sec-actions">
                      <select className="w-input" value={scoreHours} onChange={(e) => setScoreHours(Number(e.target.value))} dir="ltr" style={{ maxWidth: 96, minHeight: 30 }}>
                        {[6, 12, 24, 72].map((h) => <option key={h} value={h}>{h}h</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="w-row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    <span className="w-chip w-chip-gold">
                      {fa ? "معامله" : "trades"}: <b className="w-mono" dir="ltr">{N(score.total?.trades, 0)}</b>
                    </span>
                    <span className="w-chip">
                      {fa ? "برد" : "wins"}: <b className="w-mono" dir="ltr">{N(score.total?.wins, 0)}</b>
                    </span>
                    <span className="w-chip">
                      {fa ? "نرخ برد" : "win rate"}: <b className="w-mono" dir="ltr">{(Number(N(score.total?.trades, 0)) ? (Number(N(score.total?.wins, 0)) / Number(N(score.total?.trades, 1))) * 100 : 0).toFixed(1)}%</b>
                    </span>
                    <span className={`w-chip ${Number(N(score.total?.net)) >= 0 ? "w-chip-up" : "w-chip-down"}`}>
                      {fa ? "خالص" : "net"}: <b className="w-mono" dir="ltr">{N(score.total?.net)} $</b>
                    </span>
                    <span className="w-chip">
                      {fa ? "کارمزد" : "fees"}: <b className="w-mono" dir="ltr">{N(score.total?.fee)} $</b>
                    </span>
                  </div>
                  {score.rows.length === 0 ? (
                    <div className="lz-adm-empty">
                      <b>{fa ? "در این بازه معاملهٔ بسته‌شده‌ای نیست" : "No closed trade in this window"}</b>
                      <span>{fa ? "بازه را بزرگ‌تر کنید یا منتظر خروج اولین پوزیشن‌ها بمانید." : "Widen the window or wait for exits."}</span>
                    </div>
                  ) : (
                    <div className="w-table-wrap" style={{ maxHeight: 380, overflow: "auto" }}>
                      <table className="w-table">
                        <thead>
                          <tr>
                            <th>{fa ? "استراتژی" : "strategy"}</th>
                            <th>{fa ? "معامله" : "n"}</th>
                            <th>{fa ? "برد" : "win"}</th>
                            <th>{fa ? "نرخ برد" : "wr"}</th>
                            <th>{fa ? "خالص" : "net $"}</th>
                            <th>{fa ? "میانگین" : "avg $"}</th>
                            <th>{fa ? "کارمزد" : "fee $"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {score.rows.map((r: any) => {
                            const net = Number(N(r.net)) || 0;
                            const avg = Number(N(r.avg_pnl)) || 0;
                            const n = Number(N(r.trades, 0)) || 0;
                            const wins = Number(N(r.wins, 0)) || 0;
                            return (
                              <tr key={String(r.key)}>
                                <td className="w-mono" dir="ltr">{String(r.key)}</td>
                                <td className="w-mono" dir="ltr">{n}</td>
                                <td className="w-mono" dir="ltr">{wins}</td>
                                <td className="w-mono" dir="ltr">{n ? ((wins / n) * 100).toFixed(0) : "0"}%</td>
                                <td className={`w-mono ${net >= 0 ? "w-up" : "w-down"}`} dir="ltr">{net >= 0 ? "+" : ""}{net}</td>
                                <td className={`w-mono ${avg >= 0 ? "w-up" : "w-down"}`} dir="ltr">{avg}</td>
                                <td className="w-mono" dir="ltr">{N(r.fee)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {tab === "users" && (
                <div className="w-card w-card-pad">
                  <div className="w-sec"><div className="w-sec-title"><i />{fa ? "کاربران، VIP، سکه و نقش‌ها" : "Users, VIP, coins & roles"}</div></div>
                  <UserAdmin token={token} />
                </div>
              )}

              {tab === "reports" && (
                <>
                  <div className="w-card w-card-pad">
                    <div className="w-sec">
                      <div className="w-sec-title"><i />{fa ? "گزارش عملکرد" : "Performance"}</div>
                      <div className="w-tabs">
                        {([["daily", fa ? "امروز" : "Today"], ["weekly", fa ? "هفته" : "Week"], ["monthly", fa ? "ماه" : "Month"]] as const).map(([k, label]) => (
                          <button key={k} className={`w-tab${period === k ? " is-active" : ""}`} onClick={() => setPeriod(k)}>{label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="w-grid w-g-4" style={{ marginTop: 8 }}>
                      {[[fa ? "معاملات" : "Trades", N(report.trades, 0)], [fa ? "نرخ برد" : "Win rate", `${N(report.winRate, 1)}%`], [fa ? "تحقق‌یافته" : "Realized", N(report.realizedPnl)], [fa ? "ضریب سود" : "PF", N(report.profitFactor, 2)], [fa ? "میانگین برد" : "Avg win", N(report.avgWin)], [fa ? "میانگین ضرر" : "Avg loss", N(report.avgLoss)], [fa ? "حداکثر افت" : "Max DD", N(report.maxDrawdown)], [fa ? "شارپ" : "Sharpe", N(report.sharpe, 2)]].map(([k, v]) => (
                        <div className="w-kpi" key={String(k)} style={{ padding: "11px 13px" }}><div className="w-kpi-label">{k}</div><div className="w-kpi-value w-num" style={{ fontSize: 18 }}>{v}</div></div>
                      ))}
                    </div>
                  </div>
                  <div className="w-grid w-g-2">
                    <div className="w-card w-card-pad">
                      <div className="w-sec"><div className="w-sec-title"><i />{fa ? "رتبه استراتژی‌ها" : "Strategy rank"}</div></div>
                      <div className="w-list">{(report.strategyRank ?? []).map((s: any) => (<div className="w-li" key={s.key}><span className="w-trunc" style={{ maxWidth: 190 }}>{txt(s.key)}</span><b className={`w-num ${Number(s.pnl) >= 0 ? "w-up" : "w-down"}`}>{N(s.pnl)}</b></div>))}{!(report.strategyRank ?? []).length && <div className="w-empty">—</div>}</div>
                    </div>
                    <div className="w-card w-card-pad">
                      <div className="w-sec"><div className="w-sec-title"><i />{fa ? "رتبه نمادها" : "Symbol rank"}</div></div>
                      <div className="w-list">{(report.symbolRank ?? []).map((s: any) => (<div className="w-li" key={s.symbol}><span>{txt(s.symbol)}</span><b className={`w-num ${Number(s.pnl) >= 0 ? "w-up" : "w-down"}`}>{N(s.pnl)}</b></div>))}{!(report.symbolRank ?? []).length && <div className="w-empty">—</div>}</div>
                    </div>
                  </div>
                </>
              )}
              {tab === "comms" && (
                <div className="w-grid" style={{ gap: 12 }}>
                  <div className="w-card w-card-pad">
                    <div className="w-sec">
                      <div className="w-sec-title"><i />{fa ? "وضعیت تلگرام" : "Telegram"}</div>
                      <span className={`w-chip ${d.tg?.ok ? "w-chip-up" : "w-chip-down"}`}>{d.tg?.ok ? (fa ? "متصل" : "connected") : fa ? "قطع" : "offline"}</span>
                    </div>
                    <div className="w-list">
                      <div className="w-li"><span>Webhook</span><b className="w-mono w-tiny w-trunc" style={{ maxWidth: 240 }}>{txt(d.tg?.url)}</b></div>
                      <div className="w-li"><span>{fa ? "در صف" : "Pending"}</span><b className="w-num">{N(d.tg?.pendingUpdateCount, 0)}</b></div>
                    </div>
                    <button className="w-btn w-btn-gold w-btn-sm" style={{ marginTop: 10 }} onClick={() => void act("sendall2", "/admin/positions/send-all-telegram")} disabled={busy !== ""}>
                      <Send size={13} /> {fa ? "ارسال همه پوزیشن‌ها به کانال" : "Send all positions"}
                    </button>
                  </div>
                  <div className="w-card w-card-pad">
                    <div className="w-sec">
                      <div className="w-sec-title"><i />{fa ? "درگاه پرداخت بله" : "Bale payments"}</div>
                      <span className={`w-chip ${baleInfo?.testMode ? "w-chip-gold" : "w-chip-up"}`}>
                        {baleInfo?.testMode ? (fa ? "حالت تست" : "Test mode") : (fa ? "فعال" : "Live")}
                      </span>
                    </div>
                    <div className="w-list">
                      <div className="w-li"><span>{fa ? "ربات" : "Bot"}</span><b className="w-mono w-tiny">@{txt(baleInfo?.botUsername, "wlofbot")}</b></div>
                      <div className="w-li"><span>{fa ? "حداقل شارژ" : "Min top-up"}</span><b className="w-num">{N(baleInfo?.minTopup, 0)}</b></div>
                      <div className="w-li"><span>{fa ? "حداکثر شارژ" : "Max top-up"}</span><b className="w-num">{N(baleInfo?.maxTopup, 0)}</b></div>
                    </div>
                    <div className="w-tiny" style={{ marginTop: 8 }}>
                      {fa
                        ? "برای پرداخت واقعی، توکن کیف پول (provider token) را از BotFather بله بگیرید و اینجا ذخیره کنید. تا آن موقع پرداخت‌ها در حالت تست ثبت می‌شوند و موجودی شارژ نمی‌شود."
                        : "For real payments, paste the wallet provider token from Bale's BotFather. Until then payments stay in test mode."}
                    </div>
                    <div className="w-row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      <input
                        className="w-input"
                        style={{ maxWidth: 260 }}
                        type="password"
                        autoComplete="off"
                        placeholder={fa ? "provider token بله" : "Bale provider token"}
                        value={baleToken}
                        onChange={(e) => setBaleToken(e.target.value)}
                      />
                      <input
                        className="w-input"
                        style={{ maxWidth: 120 }}
                        inputMode="numeric"
                        placeholder={fa ? "حداقل شارژ" : "min"}
                        value={baleMin}
                        onChange={(e) => setBaleMin(e.target.value)}
                      />
                      <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void saveBale()} disabled={busy !== ""}>
                        <Save size={13} /> {fa ? "ذخیره" : "Save"}
                      </button>
                    </div>
                  </div>
                  <div className="w-card w-card-pad">
                    <div className="w-sec"><div className="w-sec-title"><i />{fa ? "اخبار اقتصادی" : "Fundamental news"}</div></div>
                    <FundamentalNewsSection news={d.news as any} lang={fa ? "fa" : "en"} />
                  </div>
                </div>
              )}

              {tab === "exchanges" && (
                <div className="w-grid" style={{ gap: 12 }}>
                  <ApiTable
                    title={fa ? "صرافی‌های متصل" : "Connected exchanges"}
                    endpoint="/admin/exchanges"
                    arrayKey="exchanges"
                    token={token}
                    columns={[
                      { k: "name", label: fa ? "نام" : "Name" },
                      { k: "provider", label: fa ? "ارائه‌دهنده" : "Provider", fmt: "mono" },
                      { k: "environment", label: fa ? "محیط" : "Env", fmt: "chip" },
                      { k: "enabled", label: fa ? "فعال" : "On" },
                      { k: "status", label: fa ? "وضعیت" : "Status", fmt: "chip" },
                      { k: "balance", label: fa ? "موجودی" : "Balance", fmt: "num" },
                      { k: "last_test", label: fa ? "آخرین تست" : "Last test", fmt: "date" },
                    ]}
                    emptyText={fa ? "صرافی وصل نشده — از پنل قدیمی کلید اضافه کنید." : "No venue connected."}
                  />
                  <ApiFacts
                    title={fa ? "پرایم‌ری‌پروایدر" : "Execution settings"}
                    endpoint="/admin/settings"
                    token={token}
                    fields={[
                      { k: "settings.market.primaryProvider", label: fa ? "صرافی اجرا" : "Venue", fmt: "mono" },
                    ]}
                  />
                </div>
              )}

              {tab === "ledger" && (
                <div className="w-grid" style={{ gap: 12 }}>
                  <ApiTable
                    title={fa ? "تراکنش‌های همه کاربران" : "All wallet transactions"}
                    endpoint="/admin/wallet/transactions"
                    arrayKey="transactions"
                    token={token}
                    columns={[
                      { k: "username", label: fa ? "کاربر" : "User" },
                      { k: "type", label: fa ? "نوع" : "Type", fmt: "chip" },
                      { k: "asset", label: fa ? "دارایی" : "Asset" },
                      { k: "amount", label: fa ? "مبلغ" : "Amount", fmt: "num" },
                      { k: "status", label: fa ? "وضعیت" : "Status", fmt: "chip" },
                      { k: "created_at", label: fa ? "زمان" : "When", fmt: "date" },
                    ]}
                  />
                </div>
              )}

              {tab === "tickets" && (
                <div className="w-grid" style={{ gap: 12 }}>
                  <ApiTable
                    title={fa ? "تیکت‌های پشتیبانی" : "Support tickets"}
                    endpoint="/admin/support/tickets"
                    arrayKey="tickets"
                    token={token}
                    columns={[
                      { k: "username", label: fa ? "کاربر" : "User" },
                      { k: "subject", label: fa ? "موضوع" : "Subject" },
                      { k: "priority", label: fa ? "اولویت" : "Priority", fmt: "chip" },
                      { k: "status", label: fa ? "وضعیت" : "Status", fmt: "chip" },
                      { k: "last_activity", label: fa ? "آخرین فعالیت" : "Last", fmt: "date" },
                    ]}
                    actions={[
                      { label: fa ? "بستن" : "Close", path: (r: any) => `/admin/support/tickets/${r.id}/status`, body: () => ({ status: "closed" }) },
                      { label: fa ? "در جریان" : "Open", path: (r: any) => `/admin/support/tickets/${r.id}/status`, body: () => ({ status: "open" }) },
                    ]}
                  />
                  <TicketReply token={token} />
                </div>
              )}

              {tab === "vip" && (
                <div className="w-grid" style={{ gap: 12 }}>
                  <ApiTable
                    title={fa ? "درخواست‌های VIP" : "VIP requests"}
                    endpoint="/admin/vip/requests"
                    arrayKey="requests"
                    token={token}
                    columns={[
                      { k: "username", label: fa ? "کاربر" : "User" },
                      { k: "package", label: fa ? "پکیج" : "Package" },
                      { k: "status", label: fa ? "وضعیت" : "Status", fmt: "chip" },
                      { k: "created_at", label: fa ? "زمان" : "When", fmt: "date" },
                    ]}
                    actions={[
                      { label: fa ? "تأیید" : "Approve", path: (r: any) => `/admin/vip/requests/${r.id}/review`, body: () => ({ approve: true }), tone: "gold" },
                      { label: fa ? "رد" : "Reject", path: (r: any) => `/admin/vip/requests/${r.id}/review`, body: () => ({ approve: false }), tone: "danger" },
                    ]}
                    emptyText={fa ? "درخواستی نیست." : "No request."}
                  />
                  <ApiTable
                    title={fa ? "پکیج‌های VIP" : "VIP packages"}
                    endpoint="/admin/vip/packages"
                    arrayKey="packages"
                    token={token}
                    columns={[
                      { k: "key", label: "Key", fmt: "mono" },
                      { k: "name_fa", label: fa ? "نام" : "Name" },
                      { k: "price", label: fa ? "قیمت" : "Price", fmt: "num" },
                      { k: "duration_days", label: fa ? "روز" : "Days", fmt: "num" },
                      { k: "min_capital", label: fa ? "حداقل سرمایه" : "Min cap", fmt: "num" },
                    ]}
                  />
                </div>
              )}

              {tab === "coins" && (
                <div className="w-grid" style={{ gap: 12 }}>
                  <ApiTable
                    title={fa ? "دفتر سکه" : "Coin ledger"}
                    endpoint="/admin/coins"
                    arrayKey="ledger"
                    token={token}
                    columns={[
                      { k: "username", label: fa ? "کاربر" : "User" },
                      { k: "currency", label: fa ? "ارز" : "Currency", fmt: "chip" },
                      { k: "delta", label: fa ? "تغییر" : "Delta", fmt: "num" },
                      { k: "balance_after", label: fa ? "مانده" : "Balance", fmt: "num" },
                      { k: "reason", label: fa ? "دلیل" : "Reason" },
                      { k: "created_at", label: fa ? "زمان" : "When", fmt: "date" },
                    ]}
                  />
                  <ApiTable
                    title={fa ? "ووچرها" : "Vouchers"}
                    endpoint="/admin/coins"
                    arrayKey="vouchers"
                    token={token}
                    columns={[
                      { k: "code", label: fa ? "کد" : "Code", fmt: "mono" },
                      { k: "amount", label: fa ? "مبلغ" : "Amount", fmt: "num" },
                      { k: "currency", label: fa ? "ارز" : "Currency", fmt: "chip" },
                      { k: "used_by", label: fa ? "استفاده‌شده" : "Used" },
                      { k: "created_at", label: fa ? "زمان" : "When", fmt: "date" },
                    ]}
                    emptyText={fa ? "ووچری نیست." : "No voucher."}
                  />
                </div>
              )}

              {tab === "live" && <LiveMonitor token={token} onNavigate={(t) => setTab(t as any)} />}
              {tab === "monitor" && (
                <div className="w-grid w-g-2" style={{ gap: 12 }}>
                  <ApiFacts
                    title={fa ? "وضعیت سرور" : "Server"}
                    endpoint="/monitor/stats"
                    token={token}
                    fields={[
                      { k: "ok", label: fa ? "سالم" : "Healthy" },
                      { k: "at", label: fa ? "زمان" : "At" },
                    ]}
                  />
                  <ApiTable
                    title={fa ? "گزارش‌ها" : "Reports"}
                    endpoint="/admin/reports"
                    arrayKey="strategyRank"
                    token={token}
                    columns={[
                      { k: "key", label: fa ? "استراتژی" : "Strategy" },
                      { k: "trades", label: fa ? "تعداد" : "Trades", fmt: "num" },
                      { k: "pnl", label: "PnL", fmt: "num" },
                    ]}
                  />
                </div>
              )}

              {tab === "settings" && (
                <div className="w-grid w-g-2">
                  <SettingKeyEditor token={token} />
                  <ApiFacts
                    title={fa ? "تنظیمات کلیدی" : "Settings snapshot"}
                    endpoint="/admin/settings"
                    token={token}
                    fields={[
                      { k: "settings.engine.mode", label: fa ? "حالت" : "Mode", fmt: "mono" },
                      { k: "settings.market.primaryProvider", label: fa ? "صرافی اجرا" : "Venue", fmt: "mono" },
                      { k: "settings.risk.minScore", label: "risk.minScore", fmt: "mono" },
                      { k: "settings.engine.maxTotalPositions", label: "engine.maxTotalPositions", fmt: "mono" },
                    ]}
                  />
                </div>
              )}

              {tab === "markets" && <MarketsAdmin token={token} />}
              {tab === "risk" && (
                <div className="w-grid" style={{ gap: 10 }}>
                  <CostAdmin token={token} />
                  <RiskAdmin token={token} />
                </div>
              )}
              {tab === "errors" && <ErrorsAdmin token={token} />}
              {tab === "ai" && <AiAdmin token={token} />}
              {tab === "content" && <ContentAdmin token={token} />}
              {tab === "swapwallet" && <SwapWalletAdmin token={token} />}
              {tab === "mint" && <MintAdmin token={token} />}
              {tab === "tune" && <TuneAdmin token={token} />}

              {tab === "rates" && <RatesAdmin token={token} />}

              {tab === "logs" && (
                <div className="w-card w-card-pad">
                  <div className="w-sec"><div className="w-sec-title"><i />{fa ? "لاگ موتور" : "Engine logs"}</div><span className="w-tiny">{d.logs.length}</span></div>
                  <div className="w-table-wrap">
                    <table className="w-table w-table-min">
                      <thead><tr><th>{fa ? "سطح" : "Level"}</th><th>{fa ? "پیام" : "Message"}</th><th>{fa ? "زمان" : "Time"}</th></tr></thead>
                      <tbody>
                        {d.logs.map((l: any, i: number) => (
                          <tr key={i}>
                            <td><span className="w-chip" data-level={txt(l.level, "info").toUpperCase()}>{txt(l.level, "info").toUpperCase()}</span></td>
                            <td className="w-trunc" style={{ maxWidth: 520 }}>{txt(l.message)}</td>
                            <td className="w-tiny w-num" dir="ltr" style={{ whiteSpace: "nowrap" }}>
                              {new Date(Number(l.created)).toLocaleTimeString(fa ? "fa-IR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}
                              <span style={{ opacity: 0.6 }}> · {ago(l.created)}{fa ? " قبل" : " ago"}</span>
                            </td>
                          </tr>
                        ))}
                        {!d.logs.length && <tr><td colSpan={3} className="w-empty">{fa ? "لاگی نیست." : "No log."}</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
