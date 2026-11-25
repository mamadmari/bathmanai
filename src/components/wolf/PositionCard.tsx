import { useState } from "react";
import { ArrowDownToLine, BarChart3, ChevronDown, Info, Loader2, Send, X } from "lucide-react";
import { LiveChart } from "@/components/LiveChart";
import { CryptoIcon } from "@/components/CryptoIcon";
import { restFetch } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";

type Row = Record<string, any>;

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const has = (v: unknown) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const fmt = (v: unknown, d = 4): string => (has(v) ? num(v).toLocaleString("en-US", { maximumFractionDigits: d }) : "—");
const price = (v: unknown): string => {
  const x = num(v);
  if (!has(v) || x <= 0) return "—";
  return x.toLocaleString("en-US", { maximumFractionDigits: x >= 100 ? 2 : x >= 1 ? 4 : 6 });
};
const sgn = (v: unknown, d = 4): string => (has(v) ? `${num(v) >= 0 ? "+" : ""}${num(v).toFixed(d)}` : "—");
const toman = (usd: number, rate: number): string =>
  rate > 0 && Number.isFinite(usd) ? Math.round(Math.abs(usd) * rate).toLocaleString("en-US") : "—";
const durTxt = (minutes: number, fa: boolean): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = Math.round(minutes % 60);
  if (d > 0) return fa ? `${d} روز ${h} ساعت` : `${d}d ${h}h`;
  if (h > 0) return fa ? `${h}:${String(m).padStart(2, "0")} ساعت` : `${h}h ${m}m`;
  return fa ? `${m} دقیقه` : `${m}m`;
};

/** Rich, RTL position card: every exchange + market number, the chart, and the actions. */
export function PositionCard({
  p, rate, token, timeframe = "1h", basePath = "/me", onChanged, onWithdraw, allowClose = true,
}: {
  p: Row;
  rate: number;
  token: string | null;
  timeframe?: string;
  basePath?: string;
  onChanged?: () => void;
  onWithdraw?: () => void;
  allowClose?: boolean;
}) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [chart, setChart] = useState(false);
  const [detail, setDetail] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const entry = num(p.entry);
  const mark = num(p.current);
  const sl = num(p.stop_loss);
  const tp = num(p.take_profit);
  const qty = num(p.quantity);
  const lev = num(p.leverage) || 1;
  const long = String(p.side ?? "long").toLowerCase() !== "short";
  const pnl = num(p.pnl);
  const pnlPct = has(p.pnl_pct) ? num(p.pnl_pct) : entry > 0 ? ((mark - entry) / entry) * 100 * (long ? 1 : -1) : 0;
  const size = num(p.size) || entry * qty;
  const margin = num(p.margin) || (lev > 0 ? size / lev : size);
  const risk1n = has(p.risk_amount) ? num(p.risk_amount) : Math.abs(entry - sl) * qty;
  const reward = Math.abs(tp - entry) * qty;
  const rMult = has(p.r_multiple) ? num(p.r_multiple) : risk1n > 0 ? pnl / risk1n : 0;
  const rr = risk1n > 0 && reward > 0 ? reward / risk1n : 0;
  const span = Math.abs(tp - sl);
  const progress = span > 0 ? Math.max(0, Math.min(100, ((long ? mark - sl : sl - mark) / span) * 100)) : num(p.progress);
  const toSl = mark > 0 && sl > 0 ? ((long ? mark - sl : sl - mark) / mark) * 100 : NaN;
  const toTp = mark > 0 && tp > 0 ? ((long ? tp - mark : mark - tp) / mark) * 100 : NaN;
  const openedMin = num(p.open_time) > 0 ? (Date.now() - num(p.open_time)) / 60000 : NaN;
  const targets: number[] = Array.isArray(p.targets) ? p.targets.map((x: unknown) => num(x)) : [];
  const strategies: string[] = Array.isArray(p.strategy_keys) ? p.strategy_keys.map(String) : [];

  const act = async (label: string, path: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(label);
    setMsg(null);
    try {
      await restFetch(path, { token, method: "POST", body: {}, timeoutMs: 30_000 });
      setMsg({ ok: true, text: fa ? "انجام شد." : "done" });
      onChanged?.();
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? e) });
    } finally {
      setBusy(null);
    }
  };

  const fig = (label: string, value: string, tone?: "up" | "down" | "gold") => (
    <div className="w-posc-fig" key={label}>
      <span>{label}</span>
      <b dir="ltr" className={tone === "up" ? "w-up" : tone === "down" ? "w-down" : tone === "gold" ? "w-gold" : ""}>{value}</b>
    </div>
  );
  return (
    <div className="w-posc-card" dir="rtl">
      <div className="w-posc-head">
        <div className="w-posc-title">
          <CryptoIcon symbol={p.symbol} size="sm" />
          <b dir="ltr">{String(p.symbol ?? "—")}</b>
          <span className={`w-chip ${long ? "w-chip-up" : "w-chip-down"}`}>
            {long ? `▲ ${fa ? "لانگ" : "long"}` : `▼ ${fa ? "شورت" : "short"}`}
          </span>
          <span className="w-chip" dir="ltr">{timeframe} · {String(p.type ?? "futures")}</span>
          {lev > 1 && <span className="w-chip w-chip-gold" dir="ltr">×{lev}</span>}
        </div>
        <div className="w-posc-pnl">
          <b className={pnl >= 0 ? "w-up" : "w-down"} dir="ltr">{sgn(pnl)} $ <span>({sgn(pnlPct, 2)}%)</span></b>
          <span dir="ltr">{toman(pnl, rate)} {fa ? "تومان" : "IRT"}</span>
        </div>
      </div>

      <div className="w-posc-grid">
        {fig(fa ? "ورود" : "entry", price(entry), "gold")}
        {fig(fa ? "قیمت فعلی" : "mark", price(mark))}
        {fig(fa ? "حد ضرر" : "stop", price(sl), "down")}
        {fig(fa ? "حد سود" : "target", price(tp), "up")}
        {fig(fa ? "حجم" : "size", `${fmt(size, 2)} $`)}
        {fig(fa ? "وثیقه" : "margin", `${fmt(margin, 2)} $`)}
        {fig(fa ? "ریسک ۱R" : "1R", `${fmt(risk1n, 3)} $`)}
        {fig("R", sgn(rMult, 2), rMult >= 0 ? "up" : "down")}
        {fig(fa ? "ریسک/ریوارد" : "R:R", rr > 0 ? `1 : ${rr.toFixed(2)}` : "—")}
        {fig(fa ? "امتیاز" : "score", fmt(p.score, 0), "gold")}
        {fig(fa ? "کارمزد" : "fees", `${fmt(p.fee, 3)} $`, "down")}
        {fig(fa ? "مدت" : "age", durTxt(openedMin, fa))}
      </div>

      <div className="w-posc-track">
        <div className="w-posc-labels" dir="ltr">
          <span className="w-down">SL {price(sl)}{Number.isFinite(toSl) ? ` (${toSl.toFixed(2)}%)` : ""}</span>
          <span className="w-tiny">{Math.round(progress)}%</span>
          <span className="w-up">TP {price(tp)}{Number.isFinite(toTp) ? ` (${toTp.toFixed(2)}%)` : ""}</span>
        </div>
        <div className="w-posc-bar"><i style={{ width: `${progress}%` }} /></div>
      </div>

      <div className="w-posc-chips">
        <span className="w-chip w-chip-down" dir="ltr">{fa ? "حداکثر ضرر" : "max loss"} {sgn(-risk1n)} $ · {toman(risk1n, rate)}</span>
        <span className="w-chip w-chip-up" dir="ltr">{fa ? "سود هدف" : "target"} {sgn(reward)} $ · {toman(reward, rate)}</span>
        <span className="w-chip" dir="ltr">{String(p.source ?? "engine")}</span>
        {strategies.slice(0, 2).map((sx) => <span key={sx} className="w-chip" dir="ltr">{sx}</span>)}
      </div>

      <div className="w-posc-btns">
        {allowClose && (
          <button className="w-btn w-btn-danger w-btn-sm" disabled={busy !== null}
            onClick={() => void act("close", `${basePath}/positions/${p.id}/close`, fa ? `پوزیشن ${p.symbol} بسته شود؟` : `Close ${p.symbol}?`)}>
            {busy === "close" ? <Loader2 className="animate-spin" size={13} /> : <X size={13} />} {fa ? "بستن پوزیشن" : "close"}
          </button>
        )}
        {onWithdraw && (
          <button className="w-btn w-btn-gold w-btn-sm" onClick={onWithdraw}>
            <ArrowDownToLine size={13} /> {fa ? "برداشت مبلغ" : "withdraw"}
          </button>
        )}
        <button className="w-btn w-btn-ghost w-btn-sm" disabled={busy !== null}
          onClick={() => void act("tg", `${basePath}/positions/${p.id}/telegram`)}>
          {busy === "tg" ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />} {fa ? "تلگرام" : "telegram"}
        </button>
        <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => setChart((v) => !v)}>
          <BarChart3 size={13} /> {chart ? (fa ? "بستن چارت" : "hide chart") : fa ? "چارت" : "chart"}
        </button>
        <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => setDetail((v) => !v)}>
          <Info size={13} /> {fa ? "جزئیات" : "details"} <ChevronDown size={12} style={{ transform: detail ? "rotate(180deg)" : undefined }} />
        </button>
      </div>
      {msg && <div className={`w-tiny ${msg.ok ? "w-up" : "w-down"}`}>{msg.text}</div>}

      {chart && (
        <div className="w-posc-chart">
          <LiveChart symbol={String(p.symbol)} timeframe={timeframe} height={230}
            entry={entry} stopLoss={sl} takeProfit={tp} direction={long ? "long" : "short"} />
        </div>
      )}

      {detail && (
        <div className="w-posc-grid">
          {fig(fa ? "صرافی" : "exchange", String(p.exchange ?? "nobitex"))}
          {fig(fa ? "نوع" : "type", String(p.type ?? "futures"))}
          {fig(fa ? "شبکه" : "network", String(p.network ?? "—"))}
          {fig(fa ? "مقدار" : "qty", fmt(qty, 6))}
          {fig(fa ? "حالت" : "mode", String(p.mode ?? "live"))}
          {fig(fa ? "وضعیت" : "status", String(p.status ?? "open"))}
          {fig(fa ? "لیکوئید" : "liquidation", price(p.liquidation))}
          {fig(fa ? "اطمینان" : "confidence", fmt(p.confidence, 2))}
          {fig(fa ? "سود پیش‌بینی" : "expected", `${sgn(p.expected_profit)} $`)}
          {fig(fa ? "مدت پیش‌بینی" : "exp. time", has(p.expected_duration) ? durTxt(num(p.expected_duration), fa) : "—")}
          {fig(fa ? "پیشرفت" : "progress", `${fmt(p.progress, 0)}%`)}
          {fig(fa ? "DCA" : "dca", fmt(p.dca_count, 0))}
          {fig(fa ? "سیاست ریسک" : "policy", String(p.risk_policy_version ?? "—"))}
          {fig(fa ? "شناسه" : "id", String(p.id ?? "—").slice(0, 8))}
          {targets.length > 0 && fig(fa ? "تارگت‌ها" : "targets", targets.map((t) => price(t)).join(" · "), "up")}
          {strategies.length > 0 && fig(fa ? "استراتژی‌ها" : "strategies", strategies.join(" · "))}
        </div>
      )}
    </div>
  );
}

