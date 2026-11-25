import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight, BarChart3, Check, Cpu, Flame, LineChart, Lock, Menu,
  Radar, ShieldCheck, Sparkles, Trophy, Users, X, Zap,
} from "lucide-react";
import logo from "@/assets/logo.svg";
import { restFetch } from "@/lib/backend";
import { LangToggle, useI18n } from "@/lib/i18n";
import { WolfThemeToggle } from "../components/wolf/ThemeToggle";
import { CryptoIcon } from "@/components/CryptoIcon";
import { MarketSheet } from "@/components/wolf/MarketSheet";

type Market = {
  symbol: string;
  name_fa?: string;
  name_en?: string;
  market?: string;
  last_price?: string | number | null;
  change_24h?: string | number | null;
};
type Signal = { symbol?: string; direction?: string; score?: number | string; timeframe?: string };

const fmt = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 3 : 6;
  return n.toLocaleString("en-US", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits });
};

export default function Landing() {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [markets, setMarkets] = useState<Market[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [wins, setWins] = useState<any[]>([]);
  const [stuck, setStuck] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<Market | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const r: any = await restFetch("/markets", { timeoutMs: 9000 });
      if (alive.current) setMarkets(Array.isArray(r?.markets) ? r.markets : []);
    } catch { /* the public page must survive a failed ticker */ }
    try {
      const s: any = await restFetch("/signals/recent", { timeoutMs: 9000 });
      if (alive.current) setSignals(Array.isArray(s?.signals) ? s.signals.slice(0, 6) : []);
    } catch { /* same */ }
    try {
      const w: any = await restFetch("/public/wins", { timeoutMs: 9000 });
      if (alive.current) setWins(Array.isArray(w?.feed) ? w.feed.slice(0, 24) : []);
    } catch { /* same */ }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const id = window.setInterval(load, 20_000);
    const onScroll = () => setStuck(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { alive.current = false; window.clearInterval(id); window.removeEventListener("scroll", onScroll); };
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ticker = useMemo(() => {
    const list = markets.filter((m) => Number(m.last_price) > 0);
    return list.length ? [...list, ...list] : [];
  }, [markets]);
  const crypto = useMemo(() => markets.filter((m) => m.market !== "forex" && Number(m.last_price) > 0).slice(0, 6), [markets]);
  const commodities = useMemo(() => markets.filter((m) => m.market === "commodity" && Number(m.last_price) > 0).slice(0, 6), [markets]);

  const T = {
    nav: fa ? ["امکانات", "چطور کار می‌کند", "بازارها", "پلن‌ها", "سوالات"] : ["Features", "How it works", "Markets", "Plans", "FAQ"],
    badge: fa ? "هوش مصنوعی + ۲۳ استراتژی · کریپتو و کالای توکنیزه" : "AI + 23 strategies · Crypto & tokenised commodities",
    h1a: fa ? "گرگ، شکارش را" : "The wolf picks",
    h1b: fa ? "با داده انتخاب می‌کند" : "its prey with data",
    lead: fa
      ? "موتور معاملاتی ۲۴/۷ روی ۱۷ بازار والکس — از بیت‌کوین و اتریوم تا طلا، نفت، مس و نقرهٔ توکنیزه — با ۴ تایم‌فریم، رأی‌گیری ۲۳ استراتژی، اعتبارسنجی رژیم بازار و مدیریت ریسک چندلایه."
      : "A 24/7 engine on 17 Wallex markets — BTC and ETH through tokenised gold, oil, copper and silver — with 4 timeframes, 23-strategy voting, regime validation and layered risk control.",
    cta1: fa ? "شروع رایگان" : "Start free",
    cta2: fa ? "دیدن داشبورد" : "See dashboard",
    live: fa ? "موتور زنده" : "Engine live",
    trust: fa ? ["حد ضرر خودکار", "گزارش شفاف", "بدون کارمزد پنهان"] : ["Automatic stops", "Transparent reports", "No hidden fees"],
  };

  const features = [
    {
      icon: <Radar size={18} />,
      t: fa ? "اسکن ۱۷ بازار در هر چرخه" : "Scans 17 markets per cycle",
      b: fa
        ? "کریپتو و کالاهای توکنیزه (طلا، نفت، مس، نقره) با ۴ تایم‌فریم هم‌زمان پایش می‌شوند؛ فقط ستاپ‌هایی می‌مانند که چند خانوادهٔ استراتژی روی آن‌ها توافق دارند."
        : "Crypto and tokenised commodities (gold, oil, copper, silver) across 4 timeframes; only setups confirmed by several strategy families survive.",
    },
    {
      icon: <ShieldCheck size={18} />,
      t: fa ? "مدیریت ریسک چندلایه" : "Layered risk control",
      b: fa
        ? "حد ضرر ATR با سقف ۳.۵٪، تریلینگ، خروج پله‌ای، سقف اکسپوژر و قطع‌کن خودکار ضرر روزانه."
        : "ATR stops capped at 3.5%, trailing, staged exits, exposure caps and an automatic daily-loss breaker.",
    },
    {
      icon: <Cpu size={18} />,
      t: fa ? "رأی‌گیری ۲۳ استراتژی" : "23-strategy voting",
      b: fa
        ? "وزن هر استراتژی با عملکرد واقعی‌اش تنظیم می‌شود؛ روند، شکست ساختار، مومنتوم و حجم با هم سنجیده می‌شوند."
        : "Each strategy is re-weighted by its real win-rate; trend, structure break, momentum and volume are combined.",
    },
    {
      icon: <BarChart3 size={18} />,
      t: fa ? "هزینهٔ واقعی، سود خالص" : "Real costs, net profit",
      b: fa
        ? "کارمزد ۰.۲۵٪ هر طرف، عبور از دفتر و تمدید در محاسبهٔ سود لحاظ می‌شود؛ تارگت زیر نوار هزینه پذیرفته نمی‌شود."
        : "Fee 0.25% per side, crossing and renewal are priced in; a target inside the cost band is rejected.",
    },
    {
      icon: <Zap size={18} />,
      t: fa ? "اجرای شفاف" : "Transparent execution",
      b: fa
        ? "هر ورود و خروج در پنل و کانال تلگرام با دلیل، امتیاز و سطوح کامل اعلام می‌شود."
        : "Every entry and exit is published to the panel and Telegram channel with reason, score and levels.",
    },
    {
      icon: <Lock size={18} />,
      t: fa ? "امنیت و جداسازی سرمایه" : "Security & isolation",
      b: fa
        ? "ورود با تأیید تلگرام، نشست قابل ابطال، کیف پول جدا برای هر کاربر و لاگ کامل عملیات."
        : "Telegram-verified login, revocable sessions, per-user wallets and a complete audit log.",
    },
  ];

  const steps = [
    [fa ? "ورود با تلگرام یا رمز" : "Sign in", fa ? "در چند ثانیه حساب بسازید؛ چیزی نصب نمی‌کنید." : "Create an account in seconds, nothing to install."],
    [fa ? "انتخاب سطح ریسک" : "Pick risk", fa ? "از محافظه‌کار تا تهاجمی؛ همهٔ آستانه‌ها قابل تنظیم است." : "Conservative to aggressive — every threshold is editable."],
    [fa ? "موتور شروع می‌کند" : "Engine takes over", fa ? "سیگنال، ورود، حد ضرر، اهداف و خروج؛ خودکار و مستند." : "Signals, entries, stops, targets and exits — automatic and documented."],
    [fa ? "پیگیری و برداشت" : "Track & withdraw", fa ? "گزارش روزانه، کیف پول شفاف و برداشت با تأیید تلگرام." : "Daily reports, a transparent wallet and Telegram-confirmed withdrawals."],
  ];

  const plans = [
    { n: fa ? "رایگان" : "Free", p: fa ? "۰" : "0", f: false,
      items: fa ? ["سیگنال‌های عمومی", "۱ نماد در دیده‌بان", "آموزش پایه", "گزارش روزانه"] : ["Public signals", "1 watchlist symbol", "Basic academy", "Daily report"] },
    { n: fa ? "نقره‌ای" : "Silver", p: fa ? "۴۹۰٬۰۰۰" : "490,000", f: true,
      items: fa ? ["همهٔ سیگنال‌ها + دلیل ورود", "۱۰ نماد", "اعلان تلگرام", "ژورنال معاملات"] : ["All signals + reason", "10 symbols", "Telegram alerts", "Trade journal"] },
    { n: fa ? "طلایی" : "Gold", p: fa ? "۱٬۲۹۰٬۰۰۰" : "1,290,000", f: false,
      items: fa ? ["مدیریت سرمایه اختصاصی", "دسترسی کامل بازارها", "تحلیل AI هر معامله", "پشتیبانی اولویت‌دار"] : ["Capital management", "All markets", "AI trade analysis", "Priority support"] },
  ];

  const faq: [string, string][] = fa
    ? [
        ["آیا سود تضمین می‌شود؟", "نه. هیچ موتور معاملاتی سود تضمینی ندارد. ما شفافیت کامل معاملات، مدیریت ریسک و گزارش دقیق ارائه می‌دهیم؛ تصمیم نهایی و مسئولیت سرمایه با شماست."],
        ["موتور روی چه بازارهایی کار می‌کند؟", "روی ۱۷ بازار تعهدی صرافی والکس: کریپتو (بیت‌کوین، اتریوم، سولانا، ریپل، آدا، دوج، BNB، آربیتروم، پپه، شیبا و…) و کالاهای توکنیزه (طلا، نفت، مس، نقره). هر نماد در ۴ تایم‌فریم تحلیل می‌شود."],
        ["حد ضرر و خروج چگونه تعیین می‌شود؟", "حد ضرر بر پایهٔ ATR با سقف سخت ۳.۵٪، اهداف بر پایهٔ مضارب ATR با سقف ۱۲٪ و خروج پله‌ای + تریلینگ پس از سود."],
        ["ورود با تلگرام چطور کار می‌کند؟", "با دکمهٔ تلگرام در صفحهٔ ورود یا مینی‌اپ؛ نشست شما از پنل قابل ابطال است."],
        ["چطور برداشت کنم؟", "از بخش کیف پول با تأیید تلگرام؛ درخواست پس از بررسی به حساب شما واریز می‌شود."],
      ]
    : [
        ["Is profit guaranteed?", "No trading engine can guarantee profit. We provide full transparency, risk control and precise reporting; the capital decision remains yours."],
        ["Which markets?", "The 17 Wallex margin markets: crypto (BTC, ETH, SOL, XRP, ADA, DOGE, BNB, ARB, PEPE, SHIB…) and tokenised commodities (gold, oil, copper, silver). Each is analysed on 4 timeframes."],
        ["How are stops and exits set?", "ATR-based stops with a hard 3.5% cap, ATR-multiple targets capped at 12%, staged exits and a trailing stop once in profit."],
        ["How does Telegram login work?", "Use the Telegram button on the login page or the mini app; the session is revocable from your panel."],
        ["How do I withdraw?", "From the wallet page with Telegram confirmation; requests are reviewed and paid to your account."],
      ];

  const priceRow = (m: Market) => {
    const ch = Number(m.change_24h);
    const up = Number.isFinite(ch) ? ch >= 0 : true;
    return (
      <tr key={m.symbol} onClick={() => setSheet(m)} style={{ cursor: "pointer" }}>
        <td>
          <div className="lz-row" style={{ gap: 9 }}>
            <CryptoIcon symbol={m.symbol} size="sm" />
            <div style={{ lineHeight: 1.25 }}>
              <b style={{ fontSize: 13 }}>{m.symbol}</b>
              <div className="lz-tiny">{m.market === "commodity" ? (fa ? "کالا" : "Commodity") : "Crypto"}</div>
            </div>
          </div>
        </td>
        <td style={{ textAlign: "end", fontWeight: 700 }} className="lz-num">${fmt(m.last_price)}</td>
        <td style={{ textAlign: "end" }} className="lz-num">
          <span className={up ? "lz-up" : "lz-down"}>{Number.isFinite(ch) ? `${up ? "+" : ""}${ch.toFixed(2)}%` : "—"}</span>
        </td>
      </tr>
    );
  };

  return (
    <div className="lz">
      {/* ── nav ───────────────────────────────────────────────────────────── */}
      <div className={`lz-nav${stuck ? " is-stuck" : ""}`}>
        <div className="lz-wrap lz-nav-in">
          <Link to="/" className="lz-brand">
            <img src={logo} alt="Trading Wolf AI" width={36} height={36} />
            <div>
              <b>Trading Wolf <span className="lz-gold">AI</span></b>
              <span>{fa ? "موتور معاملاتی هوشمند" : "Smart trading engine"}</span>
            </div>
          </Link>

          <nav className="lz-links" aria-label={fa ? "ناوبری اصلی" : "Main navigation"}>
            {["#features", "#how", "#markets", "#plans", "#faq"].map((h, i) => (
              <a key={h} href={h}>{T.nav[i]}</a>
            ))}
          </nav>

          <div className="lz-cta">
            <span className="lz-hide-xs lz-row" style={{ gap: 6 }}>
              <WolfThemeToggle />
              <LangToggle />
            </span>
            <Link to="/auth" className="lz-btn lz-btn-sm lz-hide-xs">{fa ? "ورود" : "Sign in"}</Link>
            <Link to="/auth" className="lz-btn lz-btn-sm lz-btn-primary">
              {T.cta1} <ArrowRight size={15} />
            </Link>
            <button
              type="button"
              className="lz-btn lz-btn-icon lz-burger"
              aria-label={fa ? "منوی صفحه" : "Page menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={18} />
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="lz-sheet" role="dialog" aria-modal="true" aria-label={fa ? "منوی صفحه" : "Page menu"}
          onClick={() => setMenuOpen(false)}>
          <div className="lz-sheet-card" onClick={(e) => e.stopPropagation()}>
            <div className="lz-between" style={{ marginBottom: 6 }}>
              <b style={{ fontSize: 14 }}>{fa ? "منوی صفحه" : "Page menu"}</b>
              <button type="button" className="lz-btn lz-btn-icon" aria-label={fa ? "بستن" : "Close"} onClick={() => setMenuOpen(false)}>
                <X size={18} />
              </button>
            </div>
            {["#features", "#how", "#markets", "#plans", "#faq"].map((h, i) => (
              <a key={h} href={h} onClick={() => setMenuOpen(false)}>{T.nav[i]}</a>
            ))}
            <div className="lz-row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Link to="/auth" className="lz-btn" onClick={() => setMenuOpen(false)}>{fa ? "ورود" : "Sign in"}</Link>
              <Link to="/auth" className="lz-btn lz-btn-primary" onClick={() => setMenuOpen(false)}>{T.cta1}</Link>
            </div>
            <div className="lz-row" style={{ gap: 8, marginTop: 10 }}>
              <WolfThemeToggle />
              <LangToggle />
            </div>
          </div>
        </div>
      )}

      {/* ── hero ──────────────────────────────────────────────────────────── */}
      <header className="lz-wrap lz-hero">
        <div className="lz-hero-art" aria-hidden="true">
          <img src={logo} alt="" />
        </div>
        <div className="lz-hero-ridge" aria-hidden="true" />
        <div className="lz-hero-grid">
          <div className="lz-hero-copy">
            <span className="lz-chip lz-chip-gold"><Sparkles size={13} /> {T.badge}</span>
            <h1>{T.h1a}<br /><span className="lz-gold">{T.h1b}</span></h1>
            <p className="lz-lead">{T.lead}</p>
            <div className="lz-hero-cta">
              <Link to="/auth" className="lz-btn lz-btn-primary">{T.cta1} <ArrowRight size={15} /></Link>
              <Link to="/auth" className="lz-btn"><LineChart size={15} /> {T.cta2}</Link>
            </div>
            <div className="lz-trust">
              {T.trust.map((x) => (<span key={x}><Check size={13} className="lz-up" /> {x}</span>))}
            </div>
          </div>

          <aside className="lz-card lz-panel" aria-label={fa ? "وضعیت موتور" : "Engine status"}>
            <div className="lz-between" style={{ marginBottom: 12 }}>
              <span className="lz-row" style={{ gap: 7, fontSize: 12.5, fontWeight: 700 }}>
                <i className="lz-dot" /> {T.live}
              </span>
              <span className="lz-chip lz-chip-gold">{fa ? "دمو" : "DEMO"}</span>
            </div>
            <div className="lz-kpi-mini">
              <div><b>۱۷</b><span>{fa ? "بازار فعال" : "live markets"}</span></div>
              <div><b>۲۳</b><span>{fa ? "استراتژی" : "strategies"}</span></div>
              <div><b>۴</b><span>{fa ? "تایم‌فریم" : "timeframes"}</span></div>
              <div><b>۲۵s</b><span>{fa ? "هر چرخه" : "per cycle"}</span></div>
            </div>
            <div className="lz-sep" />
            <div className="lz-col" style={{ gap: 2 }}>
              {signals.slice(0, 3).map((s, i) => (
                <div className="lz-sig-row" key={i}>
                  <span className="lz-row" style={{ gap: 7 }}>
                    <b>{s.symbol}</b>
                    <span className={`lz-chip ${s.direction === "long" ? "lz-chip-up" : "lz-chip-down"}`} style={{ minHeight: 20, fontSize: 10 }}>
                      {s.direction === "long" ? (fa ? "خرید" : "LONG") : (fa ? "فروش" : "SHORT")}
                    </span>
                  </span>
                  <span className="lz-tiny">{s.timeframe} · {Number(s.score ?? 0).toFixed(0)}</span>
                </div>
              ))}
              {!signals.length && <span className="lz-tiny">{fa ? "در حال همگام‌سازی با موتور…" : "Syncing with the engine…"}</span>}
            </div>
          </aside>
        </div>
      </header>

      {/* ── live wins + ticker ────────────────────────────────────────────── */}
      <div className="lz-wrap">
        <div className="lz-wins">
          <span className="lz-wins-tag"><Trophy size={13} /> {fa ? "سودهای زنده" : "LIVE WINS"}</span>
          <div className="lz-wins-track">
            {(wins.length ? [...wins, ...wins] : []).map((w: any, i: number) => {
              const p = Number(w.profit_usd ?? 0);
              return (
                <button key={`w${i}`} type="button" className="lz-win" onClick={() => setSheet({ symbol: String(w.symbol), market: "engine" })}>
                  {p >= 400 ? <Flame size={13} className="lz-gold" /> : <Zap size={13} className="lz-up" />}
                  <b>{String(w.symbol)}</b>
                  <span className={p >= 0 ? "lz-up" : "lz-down"} dir="ltr">{p >= 0 ? "+" : ""}{p.toFixed(1)}$</span>
                </button>
              );
            })}
            {!wins.length && <span className="lz-tiny">{fa ? "موتور در حال شکار اولین سود این چرخه…" : "Hunting the first win of the cycle…"}</span>}
          </div>
        </div>
      </div>

      <div className="lz-ticker">
        <div className="lz-ticker-track">
          {ticker.map((m, i) => {
            const ch = Number(m.change_24h);
            const up = Number.isFinite(ch) ? ch >= 0 : true;
            return (
              <button key={`${m.symbol}-${i}`} type="button" className="lz-ticker-item" onClick={() => setSheet(m)}>
                <b>{m.symbol}</b>
                <span className="lz-num">${fmt(m.last_price)}</span>
                <span className={up ? "lz-up" : "lz-down"}>
                  {Number.isFinite(ch) ? `${up ? "▲" : "▼"} ${Math.abs(ch).toFixed(2)}%` : "—"}
                </span>
              </button>
            );
          })}
          {!ticker.length && <span className="lz-ticker-item">{fa ? "در حال دریافت قیمت‌ها…" : "Loading prices…"}</span>}
        </div>
      </div>

      {/* ── stats ─────────────────────────────────────────────────────────── */}
      <section className="lz-wrap lz-sec">
        <div className="lz-grid4">
          {[
            [fa ? "۱۷" : "17", fa ? "بازار تریدپذیر" : "Tradable markets"],
            [fa ? "۲۳" : "23", fa ? "استراتژی همکار" : "Strategies"],
            [fa ? "۴" : "4", fa ? "تایم‌فریم تحلیل" : "Analysis TFs"],
            [fa ? "~۲۵ثانیه" : "~25s", fa ? "هر چرخه کامل" : "Per full cycle"],
          ].map(([v, l]) => (
            <div className="lz-stat" key={l}><b>{v}</b><span>{l}</span></div>
          ))}
        </div>
      </section>

      {/* ── features ──────────────────────────────────────────────────────── */}
      <section id="features" className="lz-wrap lz-sec">
        <div className="lz-stack" style={{ marginBottom: 18 }}>
          <span className="lz-eyebrow">{fa ? "امکانات" : "Features"}</span>
          <h2>{fa ? "شکار با نظم مهندسی‌شده" : "Hunting with engineering discipline"}</h2>
          <p className="lz-lead">{fa ? "هر بخش از موتور یک کار مشخص می‌کند و همهٔ تصمیم‌ها ثبت و قابل بازبینی هستند." : "Every part of the engine has one job, and every decision is logged and reviewable."}</p>
        </div>
        <div className="lz-auto">
          {features.map((f) => (
            <article className="lz-card lz-feature" key={f.t}>
              <span className="lz-feature-ico">{f.icon}</span>
              <h3>{f.t}</h3>
              <p>{f.b}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── how ───────────────────────────────────────────────────────────── */}
      <section id="how" className="lz-wrap lz-sec">
        <div className="lz-stack" style={{ marginBottom: 18 }}>
          <span className="lz-eyebrow">{fa ? "شروع" : "Get started"}</span>
          <h2>{fa ? "چطور با این سیستم کار می‌کنم" : "How it works"}</h2>
        </div>
        <div className="lz-steps">
          {steps.map(([t, b], i) => (
            <div className="lz-step" key={t}>
              <span className="lz-step-n">{i + 1}</span>
              <div><b>{t}</b><span>{b}</span></div>
            </div>
          ))}
        </div>
      </section>

      {/* ── markets ───────────────────────────────────────────────────────── */}
      <section id="markets" className="lz-wrap lz-sec">
        <div className="lz-stack" style={{ marginBottom: 18 }}>
          <span className="lz-eyebrow">{fa ? "بازارها" : "Markets"}</span>
          <h2>{fa ? "کریپتو و کالاهای توکنیزه، یک نگاه" : "Crypto and tokenised commodities at a glance"}</h2>
        </div>
        <div className="lz-grid2">
          <div className="lz-card lz-card-flat">
            <div className="lz-between" style={{ marginBottom: 8 }}>
              <b style={{ fontSize: 13.5 }}>{fa ? "کریپتو" : "Crypto"}</b>
              <span className="lz-tiny">{crypto.length} {fa ? "نماد" : "symbols"}</span>
            </div>
            <div className="lz-tbl-wrap">
              <table className="lz-tbl">
                <thead><tr><th>{fa ? "نماد" : "Symbol"}</th><th style={{ textAlign: "end" }}>{fa ? "قیمت" : "Price"}</th><th style={{ textAlign: "end" }}>24h</th></tr></thead>
                <tbody>{crypto.map(priceRow)}</tbody>
              </table>
            </div>
          </div>
          <div className="lz-card lz-card-flat">
            <div className="lz-between" style={{ marginBottom: 8 }}>
              <b style={{ fontSize: 13.5 }}>{fa ? "کالاهای توکنیزه" : "Tokenised commodities"}</b>
              <span className="lz-tiny">{commodities.length} {fa ? "نماد" : "symbols"}</span>
            </div>
            <div className="lz-tbl-wrap">
              <table className="lz-tbl">
                <thead><tr><th>{fa ? "نماد" : "Symbol"}</th><th style={{ textAlign: "end" }}>{fa ? "قیمت" : "Price"}</th><th style={{ textAlign: "end" }}>24h</th></tr></thead>
                <tbody>
                  {commodities.length ? commodities.map(priceRow) : (
                    <tr><td colSpan={3} className="lz-tiny">{fa ? "در حال دریافت قیمت کالاها…" : "Loading commodity prices…"}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── plans ─────────────────────────────────────────────────────────── */}
      <section id="plans" className="lz-wrap lz-sec">
        <div className="lz-stack" style={{ marginBottom: 18 }}>
          <span className="lz-eyebrow">{fa ? "پلن‌ها" : "Plans"}</span>
          <h2>{fa ? "سطح دسترسی خود را انتخاب کنید" : "Pick your access level"}</h2>
        </div>
        <div className="lz-grid3">
          {plans.map((p) => (
            <article className={`lz-plan${p.f ? " is-featured" : ""}`} key={p.n}>
              <div className="lz-between">
                <b style={{ fontSize: 14.5 }}>{p.n}</b>
                {p.f && <span className="lz-chip lz-chip-gold">{fa ? "پیشنهاد ما" : "Recommended"}</span>}
              </div>
              <div className="lz-row" style={{ gap: 6, alignItems: "baseline" }}>
                <b className="lz-price">{p.p}</b>
                <span className="lz-tiny">{fa ? "تومان / ماه" : "Toman / mo"}</span>
              </div>
              <ul>
                {p.items.map((it) => (<li key={it}><Check size={13} className="lz-up" /> {it}</li>))}
              </ul>
              <Link to="/auth" className={`lz-btn${p.f ? " lz-btn-primary" : ""}`} style={{ marginTop: "auto" }}>
                {p.f ? (fa ? "انتخاب" : "Choose") : (fa ? "شروع" : "Start")}
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* ── faq ───────────────────────────────────────────────────────────── */}
      <section id="faq" className="lz-wrap lz-sec">
        <div className="lz-stack" style={{ marginBottom: 18 }}>
          <span className="lz-eyebrow">{fa ? "سوالات" : "FAQ"}</span>
          <h2>{fa ? "چیزهایی که باید بدانید" : "Things you should know"}</h2>
        </div>
        <div className="lz-faq">
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── final CTA ─────────────────────────────────────────────────────── */}
      <section className="lz-wrap lz-sec">
        <div className="lz-cta-card">
          <h2 style={{ marginBottom: 8 }}>{fa ? "امشب، گرگ برایت شکار می‌کند" : "Tonight the wolf hunts for you"}</h2>
          <p style={{ margin: "0 auto 18px", maxWidth: "52ch" }}>
            {fa ? "ورود با تلگرام، انتخاب سطح ریسک و مشاهدهٔ لحظه‌ای پوزیشن‌ها. بدون نصب، بدون تعهد." : "Sign in with Telegram, pick a risk level and watch positions live. Nothing to install, no lock-in."}
          </p>
          <div className="lz-row" style={{ justifyContent: "center", flexWrap: "wrap", gap: 10 }}>
            <Link to="/auth" className="lz-btn lz-btn-primary">{T.cta1} <ArrowRight size={15} /></Link>
            <Link to="/auth" className="lz-btn">{T.cta2}</Link>
          </div>
        </div>
      </section>

      {/* ── footer ────────────────────────────────────────────────────────── */}
      <footer className="lz-wrap">
        <div className="lz-foot">
          <span className="lz-row" style={{ gap: 8 }}>
            <img src={logo} alt="" width={22} height={22} style={{ borderRadius: 7 }} />
            Trading Wolf AI · {new Date().getFullYear()}
          </span>
          <nav className="lz-row" style={{ gap: 14, flexWrap: "wrap" }}>
            <a href="#features">{T.nav[0]}</a>
            <a href="#markets">{T.nav[2]}</a>
            <a href="#plans">{T.nav[3]}</a>
            <a href="#faq">{T.nav[4]}</a>
            <Link to="/auth">{fa ? "ورود" : "Sign in"}</Link>
          </nav>
        </div>
      </footer>

      {sheet && (
        <MarketSheet
          symbol={sheet.symbol}
          market={sheet.market}
          price={sheet.last_price as any}
          change={sheet.change_24h as any}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
