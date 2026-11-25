import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3, Bell, BriefcaseBusiness, Coins, Eye, Gauge, Home, LifeBuoy, LogOut, Menu, Moon, Percent,
  RefreshCw, Search, Sparkles, Sun, Target, TrendingUp, Wallet, X,
} from "lucide-react";
import { CryptoIcon } from "@/components/CryptoIcon";
import { LiveChart } from "@/components/LiveChart";
import { UserAccount } from "@/components/wolf/UserAccount";
import { AiChatZone } from "@/components/wolf/UserExtra";
import { MarketSheet } from "@/components/wolf/MarketSheet";
import { WolfAvatar, displayName } from "@/components/wolf/Identity";
import { restFetch } from "@/lib/backend";
import { useWolfAuth } from "@/hooks/use-wolf-auth";
import { useI18n } from "@/lib/i18n";
import { useWolfTheme } from "@/lib/wolf-theme";

type Tab = "home" | "markets" | "positions" | "performance" | "wallet" | "account" | "ai";

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const has = (v: unknown) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const N = (v: unknown, d = 2): string =>
  has(v) ? num(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d }) : "—";
const sgn = (v: unknown, d = 2): string => (has(v) ? `${num(v) >= 0 ? "+" : ""}${num(v).toFixed(d)}` : "—");
const px = (v: unknown): string => {
  const x = num(v);
  if (!has(v) || x <= 0) return "—";
  return x.toLocaleString("en-US", { maximumFractionDigits: x >= 100 ? 2 : x >= 1 ? 4 : 6 });
};
const toman = (usd: number, rate: number): string =>
  rate > 0 && Number.isFinite(usd) ? Math.round(usd * rate).toLocaleString("en-US") : "—";
const when = (v: unknown): string => {
  const n = num(v);
  if (n <= 0) return "—";
  return new Date(n).toLocaleString("en-GB", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const held = (from: unknown): string => {
  const a = num(from);
  if (a <= 0) return "—";
  const m = Math.max(0, Math.round((Date.now() - a) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};
const signed = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;

function Kpi({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone?: "up" | "down"; icon?: React.ReactNode }) {
  return (
    <div className="ua-kpi">
      <div className="ua-kpi-l">{icon}{label}</div>
      <div className={`ua-kpi-v ua-num ${tone === "up" ? "ua-up" : tone === "down" ? "ua-down" : ""}`}>{value}</div>
      {sub && <div className="ua-kpi-s ua-num">{sub}</div>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="ua-empty"><Eye size={18} /><span>{text}</span></div>;
}


/** Read-only position card: numbers + the chart, and intentionally no actions. */
function PositionView({ p, fa, rate }: { p: any; fa: boolean; rate: number }) {
  const [chart, setChart] = useState(false);
  const [tf, setTf] = useState("1h");
  const entry = num(p.entry);
  const mark = num(p.current);
  const sl = num(p.stopLoss);
  const tp = num(p.takeProfit);
  const long = String(p.side ?? "long").toLowerCase() !== "short";
  const myNet = num(p.myPnlNet);
  const span = Math.abs(tp - sl);
  const progress = span > 0 ? Math.max(0, Math.min(100, ((long ? mark - sl : sl - mark) / span) * 100)) : 0;
  const toSl = mark > 0 && sl > 0 ? Math.abs(((long ? mark - sl : sl - mark) / mark) * 100) : NaN;
  const toTp = mark > 0 && tp > 0 ? Math.abs(((long ? tp - mark : mark - tp) / mark) * 100) : NaN;

  return (
    <div className="ua-card ua-pos">
      <div className="ua-pos-top">
        <CryptoIcon symbol={String(p.symbol)} size="md" />
        <span className="ua-pos-sym" dir="ltr">{String(p.symbol)}</span>
        <span className={`ua-chip ${long ? "ua-chip-up" : "ua-chip-down"}`}>
          {long ? (fa ? "خرید" : "LONG") : (fa ? "فروش" : "SHORT")}
        </span>
        {p.mode && <span className="ua-chip">{String(p.mode)}</span>}
        <button className="ua-btn ua-btn-ghost ua-btn-sm" style={{ marginInlineStart: "auto" }} onClick={() => setChart((v) => !v)}>
          <BarChart3 size={13} /> {chart ? (fa ? "بستن چارت" : "hide") : fa ? "چارت" : "chart"}
        </button>
        <div className={`ua-pos-pnl ${myNet >= 0 ? "ua-up" : "ua-down"}`}>
          <b className="ua-num">{signed(myNet, 4)} $</b>
          <span className="ua-num">{signed(num(p.pnlPct), 2)}% · {toman(myNet, rate)} T</span>
        </div>
      </div>

      <div className="ua-pos-grid">
        <div className="ua-pos-cell"><span>{fa ? "ورود" : "entry"}</span><b className="ua-num">{px(entry)}</b></div>
        <div className="ua-pos-cell"><span>{fa ? "قیمت فعلی" : "mark"}</span><b className="ua-num">{px(mark)}</b></div>
        <div className="ua-pos-cell"><span>{fa ? "حد ضرر" : "stop"}</span><b className="ua-num ua-down">{px(sl)}</b></div>
        <div className="ua-pos-cell"><span>{fa ? "حد سود" : "target"}</span><b className="ua-num ua-up">{px(tp)}</b></div>
      </div>

      <div>
        <div className="ua-sl">
          <span className="ua-sl-fill" style={{ width: `${progress}%` }} />
          <span className="ua-sl-mark" style={{ insetInlineStart: `calc(${progress}% - 1.5px)` }} />
        </div>
        <div className="ua-sl-legend ua-num">
          <span>SL {px(sl)}</span>
          <span>{Number.isFinite(toSl) ? `${N(toSl, 2)}%` : "—"} · {Number.isFinite(toTp) ? `${N(toTp, 2)}%` : "—"}</span>
          <span>TP {px(tp)}</span>
        </div>
      </div>

      <div className="ua-pos-foot">
        <span className="ua-chip" dir="ltr">{fa ? "سهم من" : "my share"} {N(p.myCapital, 2)} $</span>
        <span className="ua-chip" dir="ltr">{fa ? "کارمزد من" : "my fee"} {N(p.myFee, 3)} $</span>
        <span className="ua-chip" dir="ltr">{fa ? "مدت" : "age"} {held(p.openTime)}</span>
        <span className="ua-chip" dir="ltr">{fa ? "اهرم" : "lev"} {N(p.leverage, 1)}x</span>
        <span className="ua-chip" dir="ltr">{fa ? "امتیاز" : "score"} {N(p.score, 0)}</span>
        {(p.strategies || []).slice(0, 2).map((s: string) => <span key={s} className="ua-chip" dir="ltr">{s}</span>)}
      </div>

      {chart && (
        <div style={{ marginTop: 4 }}>
          <div className="ua-presets" style={{ marginBottom: 8 }}>
            {["15m", "1h", "4h", "1d"].map((t) => (
              <button key={t} className={`ua-btn ua-btn-sm ${tf === t ? "ua-btn-primary" : "ua-btn-ghost"}`} onClick={() => setTf(t)}>{t}</button>
            ))}
          </div>
          <LiveChart symbol={String(p.symbol)} timeframe={tf} height={250} entry={entry} stopLoss={sl} takeProfit={tp}
            direction={long ? "long" : "short"} />
        </div>
      )}
    </div>
  );
}

/** Demo (paper) capital: the member parks up to the platform cap and sees a live share. */
function DemoBox({ demo, rate, fa, onSave, busy }: { demo: any; rate: number; fa: boolean; onSave: (v: number) => void; busy: boolean }) {
  const max = Math.max(1, num(demo?.maxUsdt));
  const [value, setValue] = useState<number>(num(demo?.capitalUsdt) || Math.min(25, max));
  useEffect(() => { if (num(demo?.capitalUsdt) > 0) setValue(num(demo.capitalUsdt)); }, [demo?.capitalUsdt]);
  const active = Boolean(demo?.active);
  const pnl = num(demo?.pnlUsdt);
  return (
    <div className="ua-card">
      <div className="ua-card-head">
        <h2>{fa ? "سرمایهٔ آزمایشی (دمو)" : "Demo capital"}</h2>
        <span className="ua-card-sub">{active ? (fa ? "فعال" : "active") : fa ? "غیرفعال" : "inactive"}</span>
      </div>
      <div className="ua-alloc">
        <div className="ua-hero-row">
          <div className={`ua-kpi-v ua-num ${pnl >= 0 ? "ua-up" : "ua-down"}`}>{signed(pnl, 4)} $</div>
          <span className="ua-chip">{fa ? "سود/زیان لحظه‌ای" : "live pnl"}</span>
          <span className="ua-chip ua-num">{signed(num(demo?.pnlPct), 3)}%</span>
          <span className="ua-chip ua-num" dir="ltr">{toman(pnl, rate)} T</span>
        </div>
        <div className="ua-alloc-row">
          <input type="range" min={0} max={max} step={1} value={value}
            onChange={(e) => setValue(Number(e.target.value))} aria-label={fa ? "سرمایهٔ دمو" : "demo capital"} />
          <input className="ua-input" type="number" min={0} max={max} step={1} value={value}
            onChange={(e) => setValue(Math.max(0, Math.min(max, Number(e.target.value))))} />
          <span className="ua-muted ua-num">/ {max} USDT</span>
        </div>
        <div className="ua-presets">
          {[10, 25, 50, max].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
            <button key={v} className="ua-btn ua-btn-sm ua-btn-ghost" onClick={() => setValue(v)}>{v}</button>
          ))}
          <button className="ua-btn ua-btn-sm ua-btn-primary" disabled={busy} onClick={() => onSave(value)}>
            {busy ? <RefreshCw size={13} className="animate-spin" /> : <Gauge size={13} />} {fa ? "ثبت سرمایه" : "save"}
          </button>
          {active && (
            <button className="ua-btn ua-btn-sm ua-btn-ghost" disabled={busy} onClick={() => onSave(0)}>
              <X size={13} /> {fa ? "بستن حساب دمو" : "close"}
            </button>
          )}
        </div>
        {active && (
          <div className="ua-grid ua-g3">
            <div className="ua-kpi"><div className="ua-kpi-l">{fa ? "سهم از استخر" : "pool share"}</div>
              <div className="ua-kpi-v ua-num">{N(demo.sharePct, 3)}%</div></div>
            <div className="ua-kpi"><div className="ua-kpi-l">{fa ? "کارمزد پلتفرم" : "platform fee"}</div>
              <div className="ua-kpi-v ua-num ua-down">{N(demo.platformFeeUsdt, 4)} $</div></div>
            <div className="ua-kpi"><div className="ua-kpi-l">{fa ? "خالص برای من" : "net to me"}</div>
              <div className={`ua-kpi-v ua-num ${num(demo.netUsdt) >= 0 ? "ua-up" : "ua-down"}`}>{signed(num(demo.netUsdt), 4)} $</div></div>
          </div>
        )}
        <div className="ua-note">
          {fa
            ? `سرمایهٔ آزمایشی پول واقعی نیست: با ثبت مبلغ، همان سهمی از استخر معاملات را می‌گیرید که نسبت این مبلغ به سرمایهٔ موتور است و سود/زیان هر پوزیشن (پس از کسر کارمزد صرافی) لحظه‌ای روی همین عدد حساب می‌شود. سقف فعلی ${max} تتر است.`
            : `Demo capital is not real money: the engine mirrors the same share of every trade for this amount, after exchange fees. Current cap ${max} USDT.`}
        </div>
      </div>
    </div>
  );
}

/** Fee transparency card: what the exchange charges us, and what we charge the member. */
function FeesCard({ fees, me, fa }: { fees: any; me: any; fa: boolean }) {
  const rows: Array<[string, string, string?]> = [
    [fa ? "کارمزد صرافی (هر طرف)" : "exchange fee / side", `${N(fees?.exchangePerSidePct, 3)}%`],
    [fa ? "کارمزد رفت‌وبرگشت معامله" : "round trip", `${N(fees?.exchangeRoundTripPct, 3)}%`, "down"],
    [fa ? "کارمزد تمدید پوزیشن (هر ۸ ساعت)" : "renewal / 8h", `${N(fees?.renewPer8hPct, 4)}%`],
    [fa ? "کارمزد پلتفرم (از سود)" : "platform fee on profit", `${N(me?.commissionPct ?? fees?.platformPct, 2)}%`, "down"],
    [fa ? "حداقل کارمزد برداشت تومان" : "min toman withdrawal fee", `${N(fees?.withdrawFeeToman, 0)} T`],
  ];
  return (
    <div className="ua-card">
      <div className="ua-card-head">
        <h2>{fa ? "ساختار کارمزد" : "Fee structure"}</h2>
        <Percent size={14} className="ua-muted" />
        <span className="ua-card-sub">{fa ? `بستهٔ ${me?.vipPackage ?? "عادی"}` : String(me?.vipPackage ?? "standard")}</span>
      </div>
      {rows.map(([label, value, tone]) => (
        <div className="ua-fee-row" key={label}>
          <span className="ua-muted">{label}</span>
          <b className={`ua-num ${tone === "down" ? "ua-down" : ""}`}>{value}</b>
        </div>
      ))}
      <div className="ua-note" style={{ marginTop: 10 }}>
        {fa
          ? "همهٔ کارمزدهایی که خودمان به صرافی می‌دهیم (معامله، تمدید، برداشت) داخل سود/زیان خالص شما حساب شده است؛ کارمزد پلتفرم فقط از سود مثبت و به‌اندازهٔ درصد بالا گرفته می‌شود. ضرر هیچ کارمزدی به شما اضافه نمی‌کند."
          : "Every exchange cost we pay (trade, renewal, withdrawal) is already inside your net PnL; the platform fee is charged on positive profit only."}
      </div>
    </div>
  );
}

function HomeTab({ p, rate, markets, fa, onGo, onSymbol }: {
  p: any; rate: number; markets: any[]; fa: boolean; onGo: (t: Tab) => void; onSymbol: (s: string) => void;
}) {
  const me = p?.me ?? {};
  const demo = p?.demo ?? {};
  const pool = p?.pool ?? {};
  const positions: any[] = Array.isArray(p?.positions) ? p.positions : [];
  const active = Boolean(demo?.active);
  const myCapital = active ? num(demo.capitalUsdt) : num(me.contribution);
  const myPnl = active ? num(demo.netUsdt) : num(me.floatingUsdt) + num(me.realizedUsdt) - num(me.platformFeeUsdt);
  const myEquity = myCapital + myPnl;
  const moving = markets.filter((m) => num(m.change_24h) !== 0).slice(0, 6);

  return (
    <>
      <div className="ua-grid ua-g21">
        <div className="ua-hero">
          <div className="ua-hero-l">
            <Wallet size={14} />
            {active ? (fa ? "ارزش حساب آزمایشی من" : "my demo equity") : fa ? "سرمایهٔ فریزشدهٔ من" : "my frozen capital"}
            <span className="ua-chip ua-chip-view"><Eye size={11} /> {fa ? "فقط مشاهده" : "view only"}</span>
          </div>
          <div className="ua-hero-v ua-num">{N(myEquity, 4)} <small>USDT</small></div>
          <div className="ua-hero-row">
            <span className={`ua-chip ${myPnl >= 0 ? "ua-chip-up" : "ua-chip-down"}`}>
              {signed(myPnl, 4)} $ · {toman(myPnl, rate)} تومان
            </span>
            <span className="ua-chip ua-num" dir="ltr">{myCapital > 0 ? `${signed((myPnl / myCapital) * 100, 3)}%` : "—"}</span>
            <span className="ua-chip ua-num">{fa ? "سهم" : "share"} {N(active ? demo.sharePct : me.sharePct, 3)}%</span>
            <span className={`ua-chip ${pool.running ? "ua-chip-live" : ""}`}>
              <span className="ua-dot" /> {pool.running ? (fa ? "موتور فعال" : "engine running") : fa ? "موتور متوقف" : "engine paused"}
            </span>
          </div>
          <div className="ua-hero-foot">
            <span>{fa ? "سرمایهٔ استخر" : "pool equity"}: <b className="ua-num">{N(pool.equityUsdt, 4)} $</b></span>
            <span>{fa ? "پوزیشن باز" : "open"}: <b className="ua-num">{N(pool.openCount, 0)}</b></span>
            <span>{fa ? "سود باز" : "floating"}: <b className={`ua-num ${num(pool.openPnlUsdt) >= 0 ? "ua-up" : "ua-down"}`}>{signed(num(pool.openPnlUsdt), 4)} $</b></span>
          </div>
          <div className="ua-hero-row" style={{ marginTop: 6 }}>
            <button className="ua-btn ua-btn-primary ua-btn-sm" onClick={() => onGo("performance")}>
              <Gauge size={13} /> {active ? (fa ? "مدیریت سرمایهٔ دمو" : "manage demo") : fa ? "فعال‌سازی حساب دمو" : "start demo"}
            </button>
            <button className="ua-btn ua-btn-sm ua-btn-ghost" onClick={() => onGo("positions")}>
              <BriefcaseBusiness size={13} /> {fa ? "پوزیشن‌ها" : "positions"}
            </button>
            <button className="ua-btn ua-btn-sm ua-btn-ghost" onClick={() => onGo("wallet")}>
              <Wallet size={13} /> {fa ? "کیف پول" : "wallet"}
            </button>
          </div>
        </div>

        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "وضعیت حساب" : "Account"}</h2></div>
          <div className="ua-grid ua-g2">
            <Kpi label={fa ? "تتر آزاد" : "free USDT"} value={N(me.usdt, 3)} sub="USDT" icon={<Wallet size={12} />} />
            <Kpi label={fa ? "تومان" : "Toman"} value={N(me.irt, 0)} sub="IRT" icon={<Coins size={12} />} />
            <Kpi label={fa ? "کارمزد پلتفرم" : "platform fee"} value={`${N(me.commissionPct ?? p?.fees?.platformPct, 2)}%`} sub={fa ? "از سود" : "on profit"} icon={<Percent size={12} />} />
            <Kpi label={fa ? "هزینهٔ معامله" : "trade cost"} value={`${N(p?.fees?.exchangeRoundTripPct, 2)}%`} sub={fa ? "رفت‌وبرگشت" : "round trip"} icon={<TrendingUp size={12} />} />
          </div>
          <div className="ua-divider" />
          <div className="ua-tiny">
            {fa
              ? "شما فقط می‌توانید ببینید؛ باز کردن، بستن و تنظیم موتور در اختیار تیم است. سود و زیان هر معامله بلافاصله روی سهم شما اعمال می‌شود."
              : "View only: the engine opens and closes trades for you. Your share follows every trade live."}
          </div>
        </div>
      </div>

      <div className="ua-card">
        <div className="ua-card-head">
          <h2>{fa ? "پوزیشن‌های باز موتور" : "Engine positions"}</h2>
          <span className="ua-card-sub">{N(positions.length, 0)} {fa ? "باز" : "open"}</span>
          <button className="ua-btn ua-btn-sm ua-btn-ghost" style={{ marginInlineStart: "auto" }} onClick={() => onGo("positions")}>
            {fa ? "جزئیات و چارت" : "details"} <Target size={13} />
          </button>
        </div>
        {positions.length === 0 ? <Empty text={fa ? "همین حالا پوزیشن بازی نیست." : "No open positions right now."} /> : (
          <div className="ua-table-wrap">
            <table className="ua-table">
              <thead>
                <tr>
                  <th>{fa ? "نماد" : "symbol"}</th><th>{fa ? "جهت" : "side"}</th>
                  <th>{fa ? "سود من" : "my pnl"}</th><th>{fa ? "قیمت" : "mark"}</th>
                  <th>{fa ? "حد ضرر" : "stop"}</th><th>{fa ? "حد سود" : "target"}</th><th>{fa ? "مدت" : "age"}</th>
                </tr>
              </thead>
              <tbody>
                {positions.slice(0, 5).map((x) => (
                  <tr key={String(x.symbol)} onClick={() => onSymbol(String(x.symbol))} style={{ cursor: "pointer" }}>
                    <td><b dir="ltr">{String(x.symbol)}</b></td>
                    <td>
                      <span className={`ua-chip ${String(x.side) === "short" ? "ua-chip-down" : "ua-chip-up"}`} dir="ltr">
                        {String(x.side)}
                      </span>
                    </td>
                    <td className={`ua-num ${num(x.myPnlNet) >= 0 ? "ua-up" : "ua-down"}`}>{signed(num(x.myPnlNet), 4)} $</td>
                    <td className="ua-num">{px(x.current)}</td>
                    <td className="ua-num ua-down">{px(x.stopLoss)}</td>
                    <td className="ua-num ua-up">{px(x.takeProfit)}</td>
                    <td className="ua-num ua-tiny">{held(x.openTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ua-card">
        <div className="ua-card-head"><h2>{fa ? "بازارهای فعال" : "Live markets"}</h2>
          <span className="ua-card-sub">{N(markets.length, 0)}</span>
          <button className="ua-btn ua-btn-sm ua-btn-ghost" style={{ marginInlineStart: "auto" }} onClick={() => onGo("markets")}>
            {fa ? "همهٔ بازارها" : "all markets"}
          </button>
        </div>
        <div className="ua-mk">
          {(moving.length ? moving : markets.slice(0, 8)).map((m) => (
            <button key={m.symbol} className="ua-mk-item" onClick={() => onSymbol(String(m.symbol))}>
              <span className="ua-mk-top"><CryptoIcon symbol={String(m.symbol)} size="sm" />{String(m.base ?? m.symbol)}</span>
              <span className="ua-mk-price ua-num">{px(m.last_price)}</span>
              <span className={`ua-tiny ua-num ${num(m.change_24h) >= 0 ? "ua-up" : "ua-down"}`}>{signed(num(m.change_24h), 2)}%</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}




function PositionsTab({ p, rate, fa, onSymbol }: { p: any; rate: number; fa: boolean; onSymbol: (s: string) => void }) {
  const rows: any[] = Array.isArray(p?.positions) ? p.positions : [];
  const totalMine = rows.reduce((a, x) => a + num(x.myPnlNet), 0);
  return (
    <>
      <div className="ua-grid ua-g4">
        <Kpi label={fa ? "پوزیشن باز" : "open"} value={N(rows.length, 0)} icon={<BriefcaseBusiness size={12} />} />
        <Kpi label={fa ? "سود شناور من" : "my floating"} value={`${signed(totalMine, 4)} $`} tone={totalMine >= 0 ? "up" : "down"} sub={`${toman(totalMine, rate)} T`} />
        <Kpi label={fa ? "سرمایهٔ درگیر من" : "my capital in"} value={`${N(rows.reduce((a, x) => a + num(x.myCapital), 0), 2)} $`} />
        <Kpi label={fa ? "ظرفیت استخر" : "pool slots"} value={`${N(p?.pool?.openCount, 0)} / ${N(p?.pool?.maxTotalPositions, 0)}`} />
      </div>
      {rows.length === 0 ? (
        <div className="ua-card"><Empty text={fa ? "پوزیشنی باز نیست؛ موتور در اسکن بعدی ورود می‌گیرد." : "No open positions; the engine keeps scanning."} /></div>
      ) : (
        <div className="ua-grid ua-g2">
          {rows.map((x) => (
            <div key={String(x.symbol)}>
              <PositionView p={x} fa={fa} rate={rate} />
              <button className="ua-btn ua-btn-sm ua-btn-ghost" style={{ marginTop: 6 }} onClick={() => onSymbol(String(x.symbol))}>
                <BarChart3 size={13} /> {fa ? "تحلیل بازار" : "market view"}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function PerformanceTab({ p, rate, fa, onSaveDemo, busy, msg }: {
  p: any; rate: number; fa: boolean; onSaveDemo: (v: number) => void; busy: boolean; msg: string | null;
}) {
  const closed: any[] = Array.isArray(p?.closed) ? p.closed : [];
  const mine = closed.reduce((a, x) => a + num(x.myNet), 0);
  const wins = closed.filter((x) => num(x.net) > 0).length;
  const feeTotal = closed.reduce((a, x) => a + num(x.myFee), 0);
  return (
    <>
      <div className="ua-grid ua-g4">
        <Kpi label={fa ? "معاملات بسته‌شده" : "closed"} value={N(closed.length, 0)} icon={<Bell size={12} />} />
        <Kpi label={fa ? "نرخ برد" : "win rate"} value={`${closed.length ? N((wins / closed.length) * 100, 0) : 0}%`} />
        <Kpi label={fa ? "سود سهم من" : "my net"} value={`${signed(mine, 4)} $`} tone={mine >= 0 ? "up" : "down"} sub={`${toman(mine, rate)} T`} />
        <Kpi label={fa ? "کارمزد سهم من" : "my fees"} value={`${N(feeTotal, 3)} $`} tone="down" />
      </div>

      <DemoBox demo={p?.demo} rate={rate} fa={fa} onSave={onSaveDemo} busy={busy} />
      {msg && <div className="ua-card ua-tiny">{msg}</div>}

      <div className="ua-grid ua-g21">
        <div className="ua-card">
          <div className="ua-card-head">
            <h2>{fa ? "آخرین معاملات موتور" : "Latest engine trades"}</h2>
            <span className="ua-card-sub">{fa ? "۲۰ مورد آخر" : "last 20"}</span>
          </div>
          {closed.length === 0 ? <Empty text={fa ? "معاملهٔ بسته‌شده‌ای نیست." : "No closed trades yet."} /> : (
            <div className="ua-table-wrap">
              <table className="ua-table">
                <thead>
                  <tr>
                    <th>{fa ? "نماد" : "symbol"}</th><th>{fa ? "جهت" : "side"}</th>
                    <th>{fa ? "خالص" : "net"}</th><th>{fa ? "کارمزد" : "fee"}</th>
                    <th>{fa ? "دلیل" : "reason"}</th><th>{fa ? "سهم من" : "my part"}</th><th>{fa ? "زمان" : "time"}</th>
                  </tr>
                </thead>
                <tbody>
                  {closed.map((x, i) => (
                    <tr key={`${x.symbol}-${x.closeTime}-${i}`}>
                      <td><b dir="ltr">{String(x.symbol)}</b></td>
                      <td><span className={`ua-chip ${String(x.side) === "short" ? "ua-chip-down" : "ua-chip-up"}`}>{String(x.side)}</span></td>
                      <td className={`ua-num ${num(x.net) >= 0 ? "ua-up" : "ua-down"}`}>{signed(num(x.net), 4)}</td>
                      <td className="ua-num ua-muted">{N(x.fee, 4)}</td>
                      <td className="ua-tiny" dir="ltr">{String(x.reason ?? "—")}</td>
                      <td className={`ua-num ${num(x.myNet) >= 0 ? "ua-up" : "ua-down"}`}>{signed(num(x.myNet), 4)}</td>
                      <td className="ua-num ua-tiny">{when(x.closeTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <FeesCard fees={p?.fees} me={p?.me} fa={fa} />
      </div>
    </>
  );
}


function MarketsTab({ markets, fa, onSymbol }: { markets: any[]; fa: boolean; onSymbol: (s: string) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toUpperCase();
    return markets.filter((m) => !t || String(m.symbol).toUpperCase().includes(t)
      || String(m.name_fa ?? "").includes(q.trim())
      || String(m.base ?? "").toUpperCase().includes(t));
  }, [markets, q]);
  return (
    <div className="ua-card">
      <div className="ua-card-head">
        <h2>{fa ? "بازارها" : "Markets"}</h2>
        <span className="ua-card-sub">{N(list.length, 0)}</span>
      </div>
      <div className="ua-search" style={{ marginBottom: 12 }}>
        <Search size={15} className="ua-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={fa ? "جستجوی نماد…" : "search symbol…"} />
      </div>
      {list.length === 0 ? <Empty text={fa ? "بازاری پیدا نشد." : "No market found."} /> : (
        <div className="ua-mk">
          {list.map((m) => (
            <button key={m.symbol} className="ua-mk-item" onClick={() => onSymbol(String(m.symbol))}>
              <span className="ua-mk-top"><CryptoIcon symbol={String(m.symbol)} size="sm" />{String(m.base ?? m.symbol)}</span>
              <span className="ua-mk-price ua-num">{px(m.last_price)}</span>
              <span className={`ua-tiny ua-num ${num(m.change_24h) >= 0 ? "ua-up" : "ua-down"}`}>{signed(num(m.change_24h), 2)}%</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WalletTab({ p, rate, fa, onGo }: { p: any; rate: number; fa: boolean; onGo: (t: Tab) => void }) {
  const me = p?.me ?? {};
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(me.depositAddress ?? ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };
  return (
    <>
      <div className="ua-grid ua-g3">
        <div className="ua-card">
          <div className="ua-card-head"><h2>USDT</h2><span className="ua-card-sub">{String(me.network ?? "TRC20")}</span></div>
          <div className="ua-kpi-v ua-num">{N(me.usdt, 4)}</div>
          <div className="ua-tiny" style={{ marginTop: 4 }}>{toman(num(me.usdt), rate)} تومان</div>
        </div>
        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "تومان" : "Toman"}</h2></div>
          <div className="ua-kpi-v ua-num">{N(me.irt, 0)}</div>
          <div className="ua-tiny" style={{ marginTop: 4 }}>{fa ? "شارژ با بله / کارت" : "Bale / card top-up"}</div>
        </div>
        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "سرمایهٔ فریزشده" : "Frozen capital"}</h2></div>
          <div className="ua-kpi-v ua-num">{N(me.frozen, 4)}</div>
          <div className="ua-tiny" style={{ marginTop: 4 }}>{fa ? "سهم از استخر" : "pool share"} {N(me.sharePct, 3)}%</div>
        </div>
      </div>

      <div className="ua-grid ua-g21">
        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "واریز تتر" : "Deposit USDT"}</h2>
            <span className="ua-card-sub">{String(me.network ?? "TRC20")}</span></div>
          {me.depositAddress ? (
            <>
              <div className="ua-pos-cell" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <code dir="ltr" style={{ fontSize: 12.5, wordBreak: "break-all" }}>{String(me.depositAddress)}</code>
                <button className="ua-btn ua-btn-sm" onClick={() => void copy()}>
                  {copied ? (fa ? "کپی شد" : "copied") : fa ? "کپی" : "copy"}
                </button>
              </div>
              <div className="ua-tiny" style={{ marginTop: 8 }}>
                {fa ? "فقط شبکهٔ TRC20؛ واریز روی شبکهٔ دیگر قابل بازیابی نیست." : "TRC20 only — other networks cannot be recovered."}
              </div>
            </>
          ) : (
            <Empty text={fa ? "آدرس واریز هنوز تنظیم نشده؛ با پشتیبانی در تماس باشید." : "No deposit address configured yet."} />
          )}
          <div className="ua-divider" />
          <div className="ua-hero-row">
            <button className="ua-btn ua-btn-primary ua-btn-sm" onClick={() => onGo("account")}>
              <Wallet size={13} /> {fa ? "واریز / برداشت / تاریخچه" : "deposit / withdraw / history"}
            </button>
            <button className="ua-btn ua-btn-sm ua-btn-ghost" onClick={() => onGo("account")}>
              <Coins size={13} /> {fa ? "سکه و ووچر" : "coins & vouchers"}
            </button>
          </div>
        </div>
        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "وضعیت سرمایه" : "Capital status"}</h2></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "حداقل مدت چرخش" : "min lock"}</span>
            <b className="ua-num">7 {fa ? "روز" : "days"}</b></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "کارمزد پلتفرم" : "platform fee"}</span>
            <b className="ua-num ua-down">{N(me.commissionPct, 2)}%</b></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "سود شناور فعلی" : "floating now"}</span>
            <b className={`ua-num ${num(me.floatingUsdt) >= 0 ? "ua-up" : "ua-down"}`}>{signed(num(me.floatingUsdt), 4)} $</b></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "سود قطعی‌شده" : "realized"}</span>
            <b className={`ua-num ${num(me.realizedUsdt) >= 0 ? "ua-up" : "ua-down"}`}>{signed(num(me.realizedUsdt), 4)} $</b></div>
          <div className="ua-note" style={{ marginTop: 10 }}>
            {fa
              ? "آزادسازی سرمایه از بخش کیف پول ثبت می‌شود و بعد از تأیید تیم انجام می‌گیرد؛ بخشی که در معاملهٔ باز درگیر است آزاد نمی‌شود."
              : "Unfreezing is requested from the wallet and approved by the team; capital locked in open trades is not released."}
          </div>
        </div>
      </div>
    </>
  );
}

/** Lightweight market overlay — read-only chart, no order buttons. */
function SymbolSheet({ symbol, fa, onClose, mine }: { symbol: string; fa: boolean; onClose: () => void; mine?: any }) {
  const [tf, setTf] = useState("1h");
  return (
    <div
      role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(2,6,23,.72)", backdropFilter: "blur(6px)",
        display: "grid", placeItems: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ua-card" style={{ width: "min(1000px, 100%)", maxHeight: "92vh", overflow: "auto" }}>
        <div className="ua-card-head">
          <CryptoIcon symbol={symbol} size="md" />
          <h2 dir="ltr">{symbol}</h2>
          <span className="ua-chip">{fa ? "نمایش فقط" : "view only"}</span>
          <span className="ua-card-sub" />
          <button className="ua-iconbtn" onClick={onClose} aria-label={fa ? "بستن" : "close"}><X size="sm" /></button>
        </div>
        <div className="ua-presets" style={{ marginBottom: 10 }}>
          {["15m", "1h", "4h", "1d"].map((t) => (
            <button key={t} className={`ua-btn ua-btn-sm ${tf === t ? "ua-btn-primary" : "ua-btn-ghost"}`} onClick={() => setTf(t)}>{t}</button>
          ))}
        </div>
        <LiveChart symbol={symbol} timeframe={tf} height={380}
          entry={mine ? num(mine.entry) : undefined}
          stopLoss={mine ? num(mine.stopLoss) : undefined}
          takeProfit={mine ? num(mine.takeProfit) : undefined}
          direction={mine && String(mine.side).toLowerCase() === "short" ? "short" : "long"} />
        {mine && (
          <div className="ua-grid ua-g4" style={{ marginTop: 12 }}>
            <div className="ua-pos-cell"><span>{fa ? "ورود" : "entry"}</span><b className="ua-num">{px(mine.entry)}</b></div>
            <div className="ua-pos-cell"><span>{fa ? "قیمت" : "mark"}</span><b className="ua-num">{px(mine.current)}</b></div>
            <div className="ua-pos-cell"><span>{fa ? "حد ضرر" : "stop"}</span><b className="ua-num ua-down">{px(mine.stopLoss)}</b></div>
            <div className="ua-pos-cell"><span>{fa ? "حد سود" : "target"}</span><b className="ua-num ua-up">{px(mine.takeProfit)}</b></div>
          </div>
        )}
      </div>
    </div>
  );
}



export function UserPanel({ variant }: { variant?: "mobile" | "desktop" } = {}) {
  const { token, user, logout, isAdmin } = useWolfAuth();
  const { lang } = useI18n();
  const fa = lang === "fa";
  const { theme, toggle } = useWolfTheme();
  const [tab, setTab] = useState<Tab>("home");
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<any>(null);
  const [rate, setRate] = useState(0);
  const [markets, setMarkets] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const r = await restFetch<any>("/user/panel", { token, timeoutMs: 12000 });
      setP(r);
    } catch { /* keep the previous snapshot */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = window.setInterval(() => void load(), 12_000);
    return () => window.clearInterval(id);
  }, [load]);
  useEffect(() => {
    void restFetch<any>("/rates/usdt", { timeoutMs: 9000 })
      .then((r) => setRate(num(r?.rate ?? r?.toman ?? r?.price ?? r?.usdtToman ?? r?.usdt_toman)))
      .catch(() => undefined);
    void restFetch<any>("/markets", { timeoutMs: 9000 })
      .then((r) => setMarkets(Array.isArray(r?.markets) ? r.markets : []))
      .catch(() => undefined);
  }, []);

  const saveDemo = async (value: number) => {
    if (!token || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await restFetch<any>("/user/demo", { method: "POST", token, body: { amount: value } });
      setMsg(value > 0
        ? (fa ? `سرمایهٔ دمو روی ${N(r?.capital, 0)} تتر ثبت شد؛ سود/زیان لحظه‌ای از همین نقطه حساب می‌شود.` : `Demo capital set to ${N(r?.capital, 0)} USDT.`)
        : (fa ? "حساب دمو بسته شد." : "Demo account closed."));
      await load();
    } catch (e: any) {
      setMsg(e?.message ? String(e.message) : fa ? "ثبت انجام نشد." : "Could not save.");
    } finally { setBusy(false); }
  };

  const nav: Array<{ key: Tab; icon: React.ReactNode; fa: string; en: string }> = [
    { key: "home", icon: <Home size="sm" />, fa: "خانه", en: "Home" },
    { key: "markets", icon: <TrendingUp size="sm" />, fa: "بازارها", en: "Markets" },
    { key: "positions", icon: <BriefcaseBusiness size="sm" />, fa: "پوزیشن‌ها", en: "Positions" },
    { key: "performance", icon: <Gauge size="sm" />, fa: "عملکرد و دمو", en: "Performance" },
    { key: "wallet", icon: <Wallet size="sm" />, fa: "کیف پول", en: "Wallet" },
    { key: "account", icon: <LifeBuoy size="sm" />, fa: "حساب و پشتیبانی", en: "Account" },
    { key: "ai", icon: <Sparkles size="sm" />, fa: "دستیار هوشمند", en: "WOLF AI" },
  ];
  const title: Array<{ key: Tab; fa: string; en: string; subFa: string; subEn: string }> = [
    { key: "home", fa: "نمای کلی", en: "Overview", subFa: "سهم شما از موتور، لحظه‌ای", subEn: "your share of the engine, live" },
    { key: "markets", fa: "بازارها", en: "Markets", subFa: "قیمت و تغییر ۲۴ ساعته", subEn: "price and 24h change" },
    { key: "positions", fa: "پوزیشن‌های باز", en: "Open positions", subFa: "حد ضرر، حد سود و سود سهم شما", subEn: "stops, targets and your PnL" },
    { key: "performance", fa: "عملکرد و سرمایهٔ دمو", en: "Performance", subFa: "کارنامه، کارمزدها و سقف ۱۰۰ تتری دمو", subEn: "track record, fees, 100 USDT demo cap" },
    { key: "wallet", fa: "کیف پول", en: "Wallet", subFa: "تتر، تومان و سرمایهٔ فریزشده", subEn: "USDT, toman and frozen capital" },
    { key: "account", fa: "حساب و پشتیبانی", en: "Account", subFa: "پروفایل، VIP، تیکت و سکه", subEn: "profile, VIP, tickets and coins" },
    { key: "ai", fa: "دستیار هوشمند", en: "WOLF AI", subFa: "پرسش و پاسخ دربارهٔ بازار", subEn: "ask about the market" },
  ];
  const head = title.find((t) => t.key === tab) ?? title[0];
  const openPos: any[] = Array.isArray(p?.positions) ? p.positions : [];
  const mineForSheet = sheet ? openPos.find((x) => String(x.symbol) === sheet) : undefined;

  return (
    <div className={`ua ${variant === "mobile" ? "ua-m" : ""}`}>
      {open && <button className="ua-scrim" aria-label="close" onClick={() => setOpen(false)} />}
      <aside className={`ua-side ${open ? "is-open" : ""}`}>
        <div className="ua-brand">
          <span className="ua-brand-mark">W</span>
          <span className="ua-brand-txt"><b>Trading Wolf</b><span>{fa ? "پنل کاربری" : "member panel"}</span></span>
        </div>
        <nav className="ua-nav">
          {nav.map((n) => (
            <button key={n.key} className="ua-nav-item" aria-current={tab === n.key ? "page" : undefined}
              onClick={() => { setTab(n.key); setOpen(false); }}>
              {n.icon}{fa ? n.fa : n.en}
              {n.key === "positions" && openPos.length > 0 && <span className="ua-nav-badge">{openPos.length}</span>}
            </button>
          ))}
          {isAdmin && (
            <a className="ua-nav-item" href="/admin" onClick={() => setOpen(false)}>
              <LifeBuoy size="sm" /> {fa ? "کنسول مدیریت" : "admin console"}
            </a>
          )}
        </nav>
        <div className="ua-me">
          <WolfAvatar user={user} size={34} />
          <span className="ua-me-txt">
            <b>{displayName(user, fa)}</b>
            <span>{fa ? "فقط مشاهده" : "view only"}</span>
          </span>
        </div>
        <div className="ua-side-actions">
          <button className="ua-iconbtn" onClick={toggle} aria-label={fa ? "تغییر تم" : "theme"}>
            {theme === "light" ? <Moon size="sm" /> : <Sun size="sm" />}
          </button>

          <button className="ua-iconbtn" onClick={() => void logout()} aria-label={fa ? "خروج" : "logout"}>
            <LogOut size="sm" />
          </button>
        </div>
      </aside>

      <div className="ua-main">
        <header className="ua-top">
          <button className="ua-iconbtn ua-burger" onClick={() => setOpen(true)} aria-label={fa ? "منو" : "menu"}>
            <Menu size={17} />
          </button>
          <div className="ua-top-txt">
            <h1>{fa ? head.fa : head.en}</h1>
            <p>{fa ? head.subFa : head.subEn}</p>
          </div>
          <div className="ua-top-actions">
            <span className="ua-chip ua-chip-view"><Eye size={11} /> {fa ? "فقط مشاهده" : "view only"}</span>
            <span className={`ua-chip ${p?.pool?.running ? "ua-chip-live" : ""}`}>
              <span className="ua-dot" /> {p?.pool?.running ? (fa ? "زنده" : "live") : fa ? "متوقف" : "paused"}
            </span>
            <button className="ua-iconbtn" onClick={() => void load()} aria-label={fa ? "بروزرسانی" : "refresh"}>
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </header>

        <div className="ua-body">
          {msg && <div className="ua-card ua-tiny" role="status">{msg}</div>}
          {!p && loading ? (
            <div className="ua-card"><Empty text={fa ? "در حال خواندن حساب…" : "loading account…"} /></div>
          ) : tab === "home" ? (
            <HomeTab p={p} rate={rate} markets={markets} fa={fa} onGo={setTab} onSymbol={setSheet} />
          ) : tab === "markets" ? (
            <MarketsTab markets={markets} fa={fa} onSymbol={setSheet} />
          ) : tab === "positions" ? (
            <PositionsTab p={p} rate={rate} fa={fa} onSymbol={setSheet} />
          ) : tab === "performance" ? (
            <PerformanceTab p={p} rate={rate} fa={fa} onSaveDemo={(v) => void saveDemo(v)} busy={busy} msg={null} />
          ) : tab === "wallet" ? (
            <WalletTab p={p} rate={rate} fa={fa} onGo={setTab} />
          ) : tab === "account" ? (
            <UserAccount token={token} user={user} logout={logout} isAdmin={isAdmin} theme={theme} toggleTheme={toggle} fa={fa} rate={rate} />
          ) : (
            <div className="ua-embed"><AiChatZone token={token} /></div>
          )}
        </div>
      </div>

      <nav className="ua-bottom" aria-label={fa ? "ناوبری" : "navigation"}>
        {[
          { key: "home" as Tab, icon: <Home size={18} />, fa: "خانه", en: "home" },
          { key: "positions" as Tab, icon: <BriefcaseBusiness size={18} />, fa: "پوزیشن", en: "positions" },
          { key: "performance" as Tab, icon: <Gauge size={18} />, fa: "دمو", en: "demo" },
          { key: "wallet" as Tab, icon: <Wallet size={18} />, fa: "کیف پول", en: "wallet" },
          { key: "account" as Tab, icon: <LifeBuoy size={18} />, fa: "حساب", en: "account" },
        ].map((n) => (
          <button key={n.key} aria-current={tab === n.key ? "page" : undefined} onClick={() => setTab(n.key)}>
            {n.icon}{fa ? n.fa : n.en}
          </button>
        ))}
      </nav>

      {sheet && <SymbolSheet symbol={sheet} fa={fa} mine={mineForSheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

