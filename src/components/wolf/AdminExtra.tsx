import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { restFetch } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";
import { ApiFacts, ApiTable, JsonCard, N, Runner } from "@/components/wolf/ApiPanel";
import { PositionCard } from "@/components/wolf/PositionCard";

type Field = { k: string; label: string; type?: "text" | "number" | "json" | "area"; ph?: string };

/** One button → one POST, with inline feedback (presets, toggles). */
export function ActBtn({
  label,
  path,
  body,
  token,
  tone = "ghost",
  confirmText,
  onDone,
}: {
  label: string;
  path: string;
  body?: Record<string, unknown>;
  token: string | null;
  tone?: "gold" | "ghost" | "danger";
  confirmText?: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r: any = await restFetch(path, { method: "POST", token, body: body ?? {}, timeoutMs: 120_000 });
      setMsg({ ok: r?.error ? false : true, text: String(r?.error ?? r?.message ?? r?.reason ?? "OK") });
      if (!r?.error) onDone?.();
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? "—") });
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="w-col" style={{ gap: 3, alignItems: "stretch" }}>
      <button className={`w-btn w-btn-${tone} w-btn-sm`} onClick={() => void run()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />} {label}
      </button>
      {msg && <span className={`w-tiny ${msg.ok ? "w-up" : "w-down"}`} style={{ maxWidth: 220 }}>{msg.text}</span>}
    </span>
  );
}

/** Small typed POST form (numbers coerced, JSON fields parsed). */
export function PostForm({
  title,
  hint,
  path,
  fields,
  button,
  token,
  tone = "gold",
  onDone,
}: {
  title: string;
  hint?: string;
  path: string;
  fields: Field[];
  button: string;
  token: string | null;
  tone?: "gold" | "ghost" | "danger";
  onDone?: () => void;
}) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {};
      for (const f of fields) {
        const raw = (vals[f.k] ?? "").trim();
        if (raw === "") continue;
        if (f.type === "number") {
          const n = Number(raw);
          if (!Number.isFinite(n)) throw new Error(`${f.label}: ${fa ? "عدد نامعتبر" : "invalid number"}`);
          body[f.k] = n;
        } else if (f.type === "json") {
          body[f.k] = JSON.parse(raw);
        } else {
          body[f.k] = raw;
        }
      }
      const r: any = await restFetch(path, { method: "POST", token, body, timeoutMs: 90_000 });
      setMsg({ ok: !r?.error, text: String(r?.error ?? r?.message ?? r?.reason ?? "OK") });
      if (!r?.error) {
        setVals({});
        onDone?.();
      }
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? "—") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-card w-card-pad">
      <div className="w-sec"><div className="w-sec-title"><i />{title}</div></div>
      {hint && <div className="w-tiny" style={{ marginBottom: 8, lineHeight: 1.9 }}>{hint}</div>}
      <div className="w-col" style={{ gap: 8 }}>
        {fields.map((f) =>
          f.type === "area" ? (
            <textarea
              key={f.k}
              className="w-input"
              rows={3}
              placeholder={f.ph ?? f.label}
              value={vals[f.k] ?? ""}
              onChange={(e) => setVals((v) => ({ ...v, [f.k]: e.target.value }))}
            />
          ) : (
            <input
              key={f.k}
              className="w-input"
              type={f.type === "number" ? "number" : "text"}
              placeholder={f.ph ?? f.label}
              value={vals[f.k] ?? ""}
              onChange={(e) => setVals((v) => ({ ...v, [f.k]: e.target.value }))}
              dir={f.type === "number" || f.type === "json" ? "ltr" : undefined}
            />
          ),
        )}
        <button className={`w-btn w-btn-${tone} w-btn-sm`} onClick={() => void run()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />} {button}
        </button>
        {msg && <div className={`w-tiny ${msg.ok ? "w-up" : "w-down"}`}>{msg.text}</div>}
      </div>
    </div>
  );
}

/** Mini close-price chart from the public candles endpoint (no auth needed). */
function Sparkline({ symbol }: { symbol: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!symbol) return;
    restFetch(`/markets/${encodeURIComponent(symbol)}/candles?timeframe=1h&limit=60`, { timeoutMs: 15_000 })
      .then((r: any) => {
        if (!alive) return;
        const list = Array.isArray(r) ? r : (r?.candles ?? r?.data ?? []);
        setRows(Array.isArray(list) ? list : []);
        setErr(null);
      })
      .catch((e: any) => { if (alive) setErr(String(e?.message ?? "—")); });
    return () => { alive = false; };
  }, [symbol]);

  const path = useMemo(() => {
    const closes = rows.map((c) => Number(c.c ?? c.close)).filter((n) => Number.isFinite(n));
    if (closes.length < 2) return "";
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || 1;
    return closes
      .map((v, i) => `${i === 0 ? "M" : "L"}${((i / (closes.length - 1)) * 280).toFixed(1)},${(60 - ((v - min) / span) * 54).toFixed(1)}`)
      .join(" ");
  }, [rows]);

  if (err) return <div className="w-tiny w-down">{err}</div>;
  if (!path) return <div className="w-empty">—</div>;
  const up = Number(rows[rows.length - 1]?.c ?? 0) >= Number(rows[0]?.c ?? 0);
  return (
    <svg viewBox="0 0 280 62" width="100%" height="62" role="img" aria-label={symbol}>
      <path d={path} fill="none" stroke={up ? "#38e08a" : "#ff5f6d"} strokeWidth="1.6" />
    </svg>
  );
}

/** Markets & candles: seed, single-symbol detail, chart glance. */
export function MarketsAdmin({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [detail, setDetail] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!symbol.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await restFetch(`/admin/markets/${encodeURIComponent(symbol.trim().toUpperCase())}`, { token, timeoutMs: 25_000 });
      setDetail(r);
    } catch (e: any) {
      setErr(String(e?.message ?? "—"));
      setDetail(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-grid w-g-2">
      <div className="w-card w-card-pad">
        <div className="w-sec"><div className="w-sec-title"><i />{fa ? "یک نماد" : "Single symbol"}</div></div>
        <div className="w-row" style={{ gap: 6, marginBottom: 8 }}>
          <input className="w-input" dir="ltr" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTCUSDT" />
          <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void load()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
          </button>
        </div>
        {err && <div className="w-tiny w-down">{err}</div>}
        <Sparkline symbol={symbol.trim().toUpperCase()} />
        {detail && (
          <div className="w-list" style={{ marginTop: 6 }}>
            {Object.entries(detail as Record<string, any>).slice(0, 14).map(([k, v]) => (
              <div className="w-li" key={k}>
                <span className="w-mono" dir="ltr" style={{ fontSize: 11 }}>{k}</span>
                <b className="w-mono" dir="ltr" style={{ fontSize: 11.5 }}>
                  {v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v)}
                </b>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="w-card w-card-pad">
        <div className="w-sec"><div className="w-sec-title"><i />{fa ? "ابزارها" : "Tools"}</div></div>
        <div className="w-tiny" style={{ marginBottom: 8, lineHeight: 1.9 }}>
          {fa ? "اگر جدول بازارها خالی شد، آن را با seed پر کنید (۲۰ کریپتو + ۲۰ فارکس)." : "If the market table is empty, seed it (20 crypto + 20 forex)."}
        </div>
        <div className="w-row" style={{ gap: 6, flexWrap: "wrap" }}>
          <ActBtn label={fa ? "پر کردن بازارها" : "Seed markets"} path="/admin/markets/seed" token={token} />
        </div>
      </div>
      <ApiTable
        title={fa ? "بازارهای فعال" : "Active markets"}
        endpoint="/markets"
        arrayKey="markets"
        token={token}
        columns={[
          { k: "symbol", label: fa ? "نماد" : "Symbol", fmt: "mono" },
          { k: "market", label: fa ? "بازار" : "Market" },
          { k: "price", label: fa ? "قیمت" : "Price", fmt: "num" },
          { k: "change24h", label: "24h %", fmt: "num" },
        ]}
      />
      <JsonCard title={fa ? "سلامت بازار" : "Market health"} endpoint="/monitor/health" token={token} />
    </div>
  );
}

/** Risk bundles + strategy presets. */
export function RiskAdmin({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const presets: { key: string; fa: string; en: string }[] = [
    { key: "ultra_conservative", fa: "فوق محافظه‌کار", en: "ultra conservative" },
    { key: "conservative", fa: "محافظه‌کار", en: "conservative" },
    { key: "balanced", fa: "متعادل", en: "balanced" },
    { key: "aggressive", fa: "تهاجمی", en: "aggressive" },
    { key: "very_aggressive", fa: "بسیار تهاجمی", en: "very aggressive" },
  ];
  return (
    <div className="w-grid w-g-2">
      <div className="w-card w-card-pad">
        <div className="w-sec"><div className="w-sec-title"><i />{fa ? "بستهٔ ریسک موتور" : "Engine risk bundle"}</div></div>
        <div className="w-tiny" style={{ marginBottom: 10, lineHeight: 1.9 }}>
          {fa
            ? "هر دکمه کل بستهٔ ریسک را یک‌جا اعمال می‌کند: سرمایه، تعداد پوزیشن، حد ضرر/سود، حداقل امتیاز و تأییدها."
            : "Each button applies the whole bundle: capital, max positions, SL/TP, min score and confirmations."}
        </div>
        <div className="w-row" style={{ gap: 8, flexWrap: "wrap" }}>
          {presets.map((p) => (
            <ActBtn
              key={p.key}
              label={fa ? p.fa : p.en}
              path="/admin/settings/preset"
              body={{ preset: p.key }}
              token={token}
              tone={p.key === "balanced" ? "gold" : "ghost"}
              confirmText={fa ? `بستهٔ «${p.fa}» روی موتور اعمال شود؟` : `Apply "${p.en}" to the engine?`}
            />
          ))}
        </div>
      </div>
      <ApiFacts
        title={fa ? "ریسک فعلی" : "Current risk"}
        endpoint="/admin/settings"
        token={token}
        fields={[
          { k: "settings.risk.minScore", label: "risk.minScore", fmt: "mono" },
          { k: "settings.risk.minRR", label: "risk.minRR", fmt: "mono" },
          { k: "settings.risk.minConfirmations", label: "risk.minConfirmations", fmt: "mono" },
          { k: "settings.engine.maxTotalPositions", label: "engine.maxTotalPositions", fmt: "mono" },
          { k: "settings.engine.capital", label: "engine.capital", fmt: "mono" },
          { k: "settings.risk.riskPerTrade", label: "risk.riskPerTrade (% per trade)", fmt: "mono" },
          { k: "settings.risk.minRewardToCost", label: "risk.minRewardToCost (edge vs fees)", fmt: "mono" },
          { k: "settings.trading.feePct", label: "trading.feePct (per side)", fmt: "mono" },
          { k: "settings.engine.executionTimeframe", label: "engine.executionTimeframe", fmt: "mono" },
          { k: "settings.risk.protectionStoplossCount", label: "risk.protectionStoplossCount", fmt: "mono" },
        ]}
      />
      <JsonCard title={fa ? "پیش‌تنظیم‌های استراتژی" : "Strategy presets"} endpoint="/admin/strategies/presets" token={token} />
      <Runner
        title={fa ? "اعمال چند پیش‌تنظیم" : "Multi preset"}
        hint={fa ? "برای اعمال چندبستهٔ استراتژی، شناسه‌ها را در کادر بنویسید و دکمه را بزنید (مثلاً trend,smc)." : "Type comma separated ids (e.g. trend,smc) then press."}
        token={token}
        actions={[{ label: fa ? "اعمال trend+smc" : "Apply trend+smc", path: "/admin/strategies/presets/multi", body: { presetIds: ["trend", "smc"] } }]}
      />
    </div>
  );
}

/** AI providers, usage, tuning, suggestions. */
export function AiAdmin({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  return (
    <div className="w-grid w-g-2">
      <JsonCard title={fa ? "سرویس‌دهنده‌های AI" : "AI providers"} endpoint="/admin/ai/providers" token={token} />
      <JsonCard title={fa ? "مصرف AI" : "AI usage"} endpoint="/admin/ai/usage" token={token} />
      <Runner
        title={fa ? "تست و بافت" : "Test & context"}
        hint={fa ? "اتصال مدل، بافت تیونینگ و بازبینی یادگیری." : "Model connectivity, tuning context, learning review."}
        token={token}
        actions={[
          { label: fa ? "تست اتصال" : "Test", path: "/admin/ai/test", tone: "gold" },
          { label: fa ? "بافت تیونینگ" : "Tuning context", path: "/admin/ai/tuning-context" },
          { label: fa ? "بازبینی یادگیری" : "Review learning", path: "/admin/ai/review-learning" },
        ]}
      />
      <PostForm
        title={fa ? "تیونینگ ریسک با AI" : "AI risk tuning"}
        hint={fa ? "فقط کلیدهای risk.* پذیرفته می‌شوند؛ مثال: risk.minScore = 62" : "Only risk.* keys; e.g. risk.minScore = 62"}
        path="/admin/ai/tuning"
        token={token}
        button={fa ? "ذخیره" : "Save"}
        fields={[
          { k: "key", label: "risk.minScore", ph: "risk.minScore" },
          { k: "value", label: fa ? "مقدار" : "value", type: "number", ph: "62" },
        ]}
      />
      <PostForm
        title={fa ? "پیشنهاد استراتژی" : "Strategy suggestion"}
        hint={fa ? "موضوع تمرکز را بنویسید (خالی = عمومی)." : "Optional focus, empty = general."}
        path="/admin/ai/suggest"
        token={token}
        button={fa ? "درخواست" : "Ask"}
        fields={[{ k: "focus", label: fa ? "تمرکز" : "focus", ph: fa ? "مثلاً بیت‌کوین در تایم ۱۵ دقیقه" : "e.g. BTC 15m trend" }]}
      />
    </div>
  );
}

/** News, education, notifications and Telegram delivery. */
export function ContentAdmin({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  return (
    <div className="w-grid w-g-2">
      <JsonCard title={fa ? "خبرهای منتشرشده" : "Published news"} endpoint="/admin/news" token={token} />
      <JsonCard title={fa ? "آموزش روزانه" : "Education"} endpoint="/admin/education" token={token} />
      <div className="w-card w-card-pad">
        <div className="w-sec"><div className="w-sec-title"><i />{fa ? "ساخت آموزش امروز" : "Generate today"}</div></div>
        <div className="w-tiny" style={{ marginBottom: 10, lineHeight: 1.9 }}>
          {fa ? "محتوای آموزشی روز را از عملکرد موتور می‌سازد (force = بازسازی حتی اگر موجود باشد)." : "Builds today's lesson from engine performance (force = rebuild)."}
        </div>
        <div className="w-row" style={{ gap: 8, flexWrap: "wrap" }}>
          <ActBtn label={fa ? "بازسازی اجباری" : "Force build"} path="/admin/education/generate-day" body={{ force: true }} token={token} tone="gold" />
        </div>
      </div>
      <PostForm
        title={fa ? "ارسال اعلان" : "Send notification"}
        hint={fa ? "target: user | vip | all — برای یک کاربر، userId را هم پر کنید." : "target: user | vip | all — fill userId for a single user."}
        path="/admin/notify"
        token={token}
        button={fa ? "ارسال اعلان" : "Send"}
        fields={[
          { k: "target", label: "target", ph: "all" },
          { k: "userId", label: "userId", ph: fa ? "اختیاری" : "optional" },
          { k: "titleFa", label: fa ? "عنوان" : "title" },
          { k: "textFa", label: fa ? "متن" : "text", type: "area" },
        ]}
      />
      <PostForm
        title={fa ? "پیام تلگرام" : "Telegram message"}
        hint={fa ? "با test=bot پیام به‌صورت آزمایشی به ادمین می‌رود." : "test=bot sends the message to the admin as a probe."}
        path="/admin/telegram/send"
        token={token}
        button={fa ? "ارسال" : "Send"}
        fields={[
          { k: "text", label: fa ? "متن پیام" : "text", type: "area" },
          { k: "test", label: "test", ph: "bot" },
        ]}
      />
      <div className="w-card w-card-pad">
        <div className="w-sec"><div className="w-sec-title"><i />{fa ? "وب‌هوک تلگرام" : "Telegram webhook"}</div></div>
        <JsonCard title={fa ? "وضعیت فعلی" : "Current info"} endpoint="/admin/telegram/webhook-info" token={token} />
        <div style={{ marginTop: 10 }}>
          <PostForm
            title={fa ? "ثبت آدرس وب‌هوک" : "Set webhook"}
            hint={fa ? "خالی بگذارید تا از دامنهٔ پیش‌فرض استفاده شود (…/telegram/webhook)." : "Leave empty to use the default domain (…/telegram/webhook)."}
            path="/admin/telegram/set-webhook"
            token={token}
            button={fa ? "ثبت" : "Set"}
            fields={[{ k: "publicUrl", label: "https://wolf.nightmind.ir", ph: "https://wolf.nightmind.ir" }]}
          />
        </div>
      </div>
    </div>
  );
}

/** SwapWallet OTC bridge (buy/sell USDT with toman). */
export function SwapWalletAdmin({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  return (
    <div className="w-grid w-g-2">
      <JsonCard title={fa ? "وضعیت SwapWallet" : "SwapWallet status"} endpoint="/admin/swapwallet" token={token} />
      <div className="w-card w-card-pad">
        <div className="w-sec"><div className="w-sec-title"><i />{fa ? "فعال‌سازی" : "Enable"}</div></div>
        <div className="w-tiny" style={{ marginBottom: 10, lineHeight: 1.9 }}>
          {fa ? "فعال‌سازی سرویس سواپ برای کاربران؛ برای تست ابتدا آن را خاموش نگه دارید." : "Expose the swap service to users; keep it off while testing."}
        </div>
        <div className="w-row" style={{ gap: 8, flexWrap: "wrap" }}>
          <ActBtn label={fa ? "روشن" : "On"} path="/admin/swapwallet/enabled" body={{ enabled: true }} token={token} tone="gold" />
          <ActBtn label={fa ? "خاموش" : "Off"} path="/admin/swapwallet/enabled" body={{ enabled: false }} token={token} tone="danger" />
        </div>
      </div>
      <PostForm
        title={fa ? "کلید API" : "API key"}
        hint={fa ? "کلید باید با apikey- شروع شود (رمزنگاری‌شده ذخیره می‌شود)." : "Key must start with apikey- (stored encrypted)."}
        path="/admin/swapwallet/key"
        token={token}
        button={fa ? "ذخیره کلید" : "Save key"}
        fields={[{ k: "apiKey", label: "apikey-…", ph: "apikey-…" }]}
      />
      <PostForm
        title={fa ? "استعلام نرخ" : "Quote"}
        hint={fa ? "مثال: USDT → IRT با ۱۰۰ دلار." : "e.g. USDT → IRT with 100."}
        path="/admin/swapwallet/quote"
        token={token}
        button={fa ? "استعلام" : "Quote"}
        fields={[
          { k: "sourceToken", label: "USDT", ph: "USDT" },
          { k: "destinationToken", label: "IRT", ph: "IRT" },
          { k: "sourceAmount", label: fa ? "مبلغ" : "amount", type: "number", ph: "100" },
        ]}
      />
      <PostForm
        title={fa ? "ثبت سفارش" : "Place order"}
        hint={fa ? "swapToken از پاسخ استعلام کپی کنید." : "Copy swapToken from the quote answer."}
        path="/admin/swapwallet/order"
        token={token}
        button={fa ? "ثبت سفارش" : "Order"}
        tone="danger"
        fields={[{ k: "swapToken", label: "swapToken" }]}
      />
    </div>
  );
}

/** Coin ledger adjustments + voucher minting. */
export function MintAdmin({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  return (
    <div className="w-grid w-g-2">
      <PostForm
        title={fa ? "تعدیل سکه / تومان کاربر" : "Adjust user balance"}
        hint={fa ? "delta منفی = کسر، مثبت = افزایش. currency: wolf یا toman." : "Negative delta = debit, positive = credit. currency: wolf | toman."}
        path="/admin/coins/adjust"
        token={token}
        button={fa ? "اعمال" : "Apply"}
        tone="danger"
        fields={[
          { k: "userId", label: "userId" },
          { k: "currency", label: "wolf | toman", ph: "wolf" },
          { k: "delta", label: fa ? "مقدار" : "delta", type: "number", ph: "100" },
        ]}
      />
      <PostForm
        title={fa ? "ساخت ووچر" : "Mint voucher"}
        hint={fa ? "اگر کد خالی بماند خودکار ساخته می‌شود (WOLF-XXXXXX)." : "Leave the code empty to auto-generate (WOLF-XXXXXX)."}
        path="/admin/coins/voucher"
        token={token}
        button={fa ? "ساخت ووچر" : "Create"}
        fields={[
          { k: "code", label: fa ? "کد (اختیاری)" : "code (optional)", ph: "WOLF-XXXXXX" },
          { k: "coins", label: fa ? "تعداد سکه" : "coins", type: "number", ph: "50" },
          { k: "maxUses", label: fa ? "حداکثر استفاده" : "maxUses", type: "number", ph: "1" },
        ]}
      />
      <ApiTable
        title={fa ? "کاربران" : "Users"}
        endpoint="/admin/users"
        arrayKey="users"
        token={token}
        columns={[
          { k: "username", label: fa ? "کاربر" : "User", fmt: "mono" },
          { k: "role", label: fa ? "نقش" : "Role", fmt: "chip" },
          { k: "wolf_coins", label: fa ? "سکه" : "Coins", fmt: "num" },
        ]}
      />
      <JsonCard title={fa ? "دفتر سکه و ووچر" : "Coin ledger & vouchers"} endpoint="/admin/coins" token={token} />
    </div>
  );
}

/** Backtest / research / tuner jobs. */
export function TuneAdmin({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  return (
    <div className="w-grid w-g-2">
      <Runner
        title={fa ? "بک‌تست و پژوهش" : "Backtest & research"}
        hint={fa ? "اجرای این کارها چند ثانیه تا چند دقیقه طول می‌کشد؛ نتیجه به‌صورت JSON نمایش داده می‌شود." : "These jobs take seconds to minutes; the raw JSON answer is shown."}
        token={token}
        actions={[
          { label: fa ? "بک‌تست" : "Backtest", path: "/admin/engine/backtest", tone: "gold" },
          { label: fa ? "بک‌تست AI" : "AI backtest", path: "/admin/engine/ai-backtest" },
          { label: fa ? "پژوهش" : "Research", path: "/admin/engine/research" },
          { label: fa ? "تیونر" : "Tuner", path: "/admin/engine/tuner" },
        ]}
      />
      <JsonCard title={fa ? "یادگیری موتور" : "Engine learning"} endpoint="/admin/learning" token={token} />
      <PostForm
        title={fa ? "پاک‌سازی تاریخچه" : "Clear history"}
        hint={fa ? "این کار رکوردهای قدیمی را پاک می‌کند؛ با احتیاط." : "Deletes old records — use with care."}
        path="/admin/history/clear"
        token={token}
        button={fa ? "پاک‌سازی" : "Clear"}
        tone="danger"
        fields={[{ k: "days", label: fa ? "قدیمی‌تر از چند روز" : "older than days", type: "number", ph: "90" }]}
      />
      <JsonCard title={fa ? "لاگ موتور" : "Engine log"} endpoint="/admin/logs" token={token} params={{ limit: "20" }} />
    </div>
  );
}

/** Manual position ops: open one by hand, close everything. */
/**
 * Positions workspace: the open book (shared PositionCard), the closed history
 * and the two manual controls, on the .lz panel rhythm.
 */
export function PositionsOps({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [open, setOpen] = useState<Record<string, any>[]>([]);
  const [closed, setClosed] = useState<Record<string, any>[]>([]);
  const [rate, setRate] = useState(0);
  const [tf, setTf] = useState("1h");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      const [pos, r] = await Promise.all([
        restFetch<{ open: any[]; closed: any[] }>("/admin/positions", { token, timeoutMs: 20_000 }),
        restFetch<{ price: number }>("/rates/usdt", { timeoutMs: 10_000 }).catch(() => null),
      ]);
      setOpen(pos?.open ?? []);
      setClosed(pos?.closed ?? []);
      setRate(Number((r as any)?.price) || 0);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const money = (v: unknown) => (n(v) >= 0 ? "+" : "") + n(v).toFixed(4) + " $";
  const irt = (usd: unknown) => (rate > 0 ? Math.round(n(usd) * rate).toLocaleString("en-US") : "—");
  const unreal = open.reduce((a, p) => a + n(p.pnl), 0);
  const openRisk = open.reduce((a, p) => a + Math.abs(n(p.entry) - n(p.stop_loss)) * n(p.quantity), 0);
  const closedPnl = closed.reduce((a, p) => a + n(p.pnl), 0);
  const wins = closed.filter((c) => n(c.pnl) > 0).length;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;
  const tone = (v: number) => (v > 0 ? "w-up" : v < 0 ? "w-down" : "");
  const dt = (v: unknown) => {
    const t = Number(v);
    if (!t) return "—";
    return new Date(t).toLocaleString(fa ? "fa-IR" : "en-GB", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };


  return (
    <div className="lz-adm-pos">
      <div className="lz-adm-pos-head">
        <div>
          <span className="lz-adm-eyebrow">{fa ? "دفتر پوزیشن‌ها" : "Position book"}</span>
          <h3>{fa ? "پوزیشن‌های باز و بسته" : "Open and closed positions"}</h3>
        </div>
        <div className="lz-adm-pos-tools">
          <select className="w-input" value={tf} onChange={(e) => setTf(e.target.value)} dir="ltr" style={{ maxWidth: 96 }}>
            {["15m", "1h", "4h", "1d"].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void load()} disabled={busy}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : (fa ? "به‌روزرسانی" : "refresh")}
          </button>
        </div>
      </div>

      <div className="w-kpi6">
        <div><span>{fa ? "پوزیشن باز" : "open"}</span><b>{open.length}</b><small>{fa ? "در دفتر" : "in book"}</small></div>
        <div><span>{fa ? "سود باز" : "unrealized"}</span><b className={tone(unreal)}>{money(unreal)}</b><small>≈ {irt(unreal)} {fa ? "تومان" : "IRT"}</small></div>
        <div><span>{fa ? "ریسک تا استاپ" : "risk to stop"}</span><b>{money(-Math.abs(openRisk))}</b><small>≈ {irt(-Math.abs(openRisk))} {fa ? "تومان" : "IRT"}</small></div>
        <div><span>{fa ? "بسته‌شده" : "closed"}</span><b>{closed.length}</b><small>{fa ? "در دفتر" : "in book"}</small></div>
        <div><span>{fa ? "سود بسته‌شده" : "closed pnl"}</span><b className={tone(closedPnl)}>{money(closedPnl)}</b><small>≈ {irt(closedPnl)} {fa ? "تومان" : "IRT"}</small></div>
        <div><span>{fa ? "نرخ برد" : "win rate"}</span><b>{winRate.toFixed(1)}%</b><small>{wins}/{closed.length}</small></div>
      </div>

      {err ? <div className="w-tiny w-down" style={{ padding: "4px 2px" }}>{err}</div> : null}

      <div className="w-sec"><div className="w-sec-title"><i />{fa ? "پوزیشن‌های باز" : "Open positions"}</div></div>
      {open.length === 0 ? (
        <div className="lz-adm-empty">
          <b>{fa ? "هیچ پوزیشن بازی نیست" : "No open position"}</b>
          <span>{fa ? "موتور در اسکن بعدی اگر سیگنال معتبر ببیند وارد می‌شود." : "The engine enters on the next valid signal."}</span>
        </div>
      ) : (
        <div className="w-posc-wrap">
          {open.map((p) => (
            <PositionCard key={p.id} p={p} rate={rate} token={token} timeframe={tf} onChanged={() => void load()} />
          ))}
        </div>
      )}


      <div className="w-sec"><div className="w-sec-title"><i />{fa ? "تاریخچهٔ بسته‌شده" : "Closed history"}</div></div>
      {closed.length === 0 ? (
        <div className="lz-adm-empty">
          <b>{fa ? "هنوز معاملهٔ بسته‌شده‌ای نیست" : "Nothing closed yet"}</b>
          <span>{fa ? "با اولین خروج (SL/TP/زمانی) این جدول پر می‌شود." : "Fills up on the first exit."}</span>
        </div>
      ) : (
        <div className="w-table-wrap">
          <table className="w-table">
            <thead>
              <tr>
                <th>{fa ? "نماد" : "symbol"}</th>
                <th>{fa ? "جهت" : "side"}</th>
                <th>{fa ? "دلیل خروج" : "reason"}</th>
                <th>{fa ? "خالص" : "net"}</th>
                <th>{fa ? "تومان" : "IRT"}</th>
                <th>{fa ? "کارمزد" : "fee"}</th>
                <th>{fa ? "زمان" : "time"}</th>
              </tr>
            </thead>
            <tbody>
              {closed.slice(0, 15).map((c, k) => (
                <tr key={String(c.id ?? c.symbol ?? "") + k}>
                  <td className="w-mono" dir="ltr">{String(c.symbol ?? "—")}</td>
                  <td>{String(c.side ?? "") === "short" ? (fa ? "شورت" : "short") : (fa ? "لانگ" : "long")}</td>
                  <td className="w-mono" dir="ltr">{String(c.close_reason ?? "—").replace(/_/g, " ")}</td>
                  <td className={`w-mono ${tone(n(c.pnl))}`} dir="ltr">{money(c.pnl)}</td>
                  <td className="w-mono" dir="ltr">{irt(c.pnl)}</td>
                  <td className="w-mono" dir="ltr">{n(c.fee).toFixed(4)}</td>
                  <td className="w-mono" dir="ltr">{dt(c.close_time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="w-grid w-g-2" style={{ gap: 12, marginTop: 12 }}>
        <PostForm
          title={fa ? "باز کردن پوزیشن دستی" : "Open manual position"}
          hint={fa ? "side: long یا short (خالی = تشخیص موتور)." : "side: long | short (empty = engine decides)."}
          path="/admin/positions/open"
          token={token}
          button={fa ? "باز کن" : "Open"}
          fields={[
            { k: "symbol", label: fa ? "نماد" : "symbol", ph: "BTCUSDT" },
            { k: "side", label: "long | short", ph: "long" },
            { k: "note", label: fa ? "یادداشت" : "note", type: "area" },
          ]}
        />
        <div className="w-card w-card-pad">
          <div className="w-sec"><div className="w-sec-title"><i />{fa ? "بستن همهٔ پوزیشن‌ها" : "Close everything"}</div></div>
          <div className="w-tiny" style={{ marginBottom: 10, lineHeight: 1.9 }}>
            {fa ? "همهٔ پوزیشن‌های باز بازار بسته می‌شوند. این عمل برگشت‌پذیر نیست." : "Every open position is closed. This cannot be undone."}
          </div>
          <ActBtn
            label={fa ? "بستن همه" : "Close all"}
            path="/admin/emergency/close-all"
            body={{ confirm: "close_all" }}
            token={token}
            tone="danger"
            confirmText={fa ? "همهٔ پوزیشن‌های باز بسته شوند؟" : "Close every open position?"}
          />
        </div>
      </div>
    </div>
  );
}

/** Reply to a support ticket from the admin console. */
export function TicketReply({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [id, setId] = useState("");
  return (
    <div className="w-card w-card-pad">
      <div className="w-sec"><div className="w-sec-title"><i />{fa ? "پاسخ به تیکت" : "Reply to ticket"}</div></div>
      <div className="w-tiny" style={{ marginBottom: 8, lineHeight: 1.9 }}>
        {fa ? "شناسهٔ تیکت را از جدول بالا بردارید و پاسخ را بنویسید." : "Copy the ticket id from the table above, then write the reply."}
      </div>
      <input className="w-input" dir="ltr" placeholder={fa ? "شناسه تیکت" : "ticket id"} value={id} onChange={(e) => setId(e.target.value.trim())} />
      {id ? (
        <div style={{ marginTop: 10 }}>
          <PostForm
            title={fa ? `پاسخ به ${id}` : `Reply to ${id}`}
            path={`/admin/support/tickets/${encodeURIComponent(id)}/reply`}
            token={token}
            button={fa ? "ارسال پاسخ" : "Send reply"}
            fields={[{ k: "text", label: fa ? "متن پاسخ" : "text", type: "area" }]}
          />
        </div>
      ) : null}
    </div>
  );
}

/** USDT/Toman rate engine — admin only (all venues + markup + manual price). */
export function RatesAdmin({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [snap, setSnap] = useState<any>(null);
  const [markup, setMarkup] = useState("700");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (r: any) => {
    if (!r) return;
    setSnap(r);
    setMarkup(String(r.markup ?? 700));
    setMode(r.mode === "manual" ? "manual" : "auto");
    setManual(r.manualPrice ? String(r.manualPrice) : "");
  };

  const load = async (force = false) => {
    if (!token) return;
    setBusy(force ? "refresh" : "load");
    setMsg(null);
    try {
      const r: any = force
        ? await restFetch("/admin/rates/refresh", { method: "POST", token, body: {}, timeoutMs: 40_000 })
        : await restFetch("/admin/rates", { token, timeoutMs: 40_000 });
      apply(r);
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? "—") });
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => { void load(false); }, [token]);

  const save = async () => {
    setBusy("save");
    setMsg(null);
    try {
      const r: any = await restFetch("/admin/rates/config", {
        method: "POST",
        token,
        body: { markupToman: Number(markup) || 0, mode, manualPrice: Number(manual) || 0 },
        timeoutMs: 40_000,
      });
      apply(r);
      setMsg({ ok: true, text: fa ? "ذخیره شد و نرخ دوباره خوانده شد." : "Saved and re-read." });
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? "—") });
    } finally {
      setBusy(null);
    }
  };

  const rows: any[] = Array.isArray(snap?.rows) ? snap.rows : [];
  const best = Number(snap?.best);
  const final = Number(snap?.final);

  return (
    <div className="w-grid w-g-2">
      <div className="w-card w-card-pad">
        <div className="w-sec">
          <div className="w-sec-title"><i />{fa ? "نرخ لحظه‌ای تتر از صرافی‌ها" : "Live USDT rates"}</div>
          <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void load(true)} disabled={busy !== null}>
            {busy === "refresh" ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />} {fa ? "بازخوانی" : "Refresh"}
          </button>
        </div>
        <div className="w-tablewrap">
          <table className="w-table">
            <thead>
              <tr>
                <th>{fa ? "منبع" : "Venue"}</th>
                <th>{fa ? "قیمت (تومان)" : "Price (toman)"}</th>
                <th>{fa ? "وضعیت" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="w-num">{r.ok && r.price ? N(r.price, 0) : "—"}</td>
                  <td className="w-tiny">
                    {r.ok ? (
                      <span className="w-chip w-chip-up">{N(r.ms, 0)}ms</span>
                    ) : (
                      <span className="w-chip w-chip-down" title={String(r.error ?? "")}>{String(r.error ?? "error").slice(0, 24)}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={3} className="w-empty">{fa ? "در حال خواندن…" : "Reading…"}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="w-list" style={{ marginTop: 8 }}>
          <div className="w-li">
            <span>{fa ? "بالاترین نرخ بازار" : "Best market price"}</span>
            <b className="w-num">{best ? N(best, 0) : "—"} {fa ? "تومان" : "toman"}</b>
          </div>
          <div className="w-li">
            <span>{fa ? "قیمت نهایی ما (مبنای همهٔ محاسبات)" : "Our final price (used everywhere)"}</span>
            <b className="w-num w-up">{final ? N(final, 0) : "—"} {fa ? "تومان" : "toman"}</b>
          </div>
        </div>
        <div className="w-tiny" style={{ marginTop: 8, lineHeight: 1.9 }}>
          {fa
            ? "قیمت ما = بالاترین نرخ بازار + کارمزد افزایشی؛ در حالت دستی همان عدد دستی مبنا است."
            : "Our price = highest market price + markup; in manual mode the manual number wins."}
        </div>
      </div>

      <div className="w-card w-card-pad">
        <div className="w-sec"><div className="w-sec-title"><i />{fa ? "تنظیم قیمت تتر ما" : "Our USDT price"}</div></div>
        <div className="w-col" style={{ gap: 8 }}>
          <div className="w-row" style={{ gap: 6 }}>
            <button className={`w-btn w-btn-sm ${mode === "auto" ? "w-btn-gold" : "w-btn-ghost"}`} onClick={() => setMode("auto")}>
              {fa ? "خودکار (بازار + کارمزد)" : "Auto (market + markup)"}
            </button>
            <button className={`w-btn w-btn-sm ${mode === "manual" ? "w-btn-gold" : "w-btn-ghost"}`} onClick={() => setMode("manual")}>
              {fa ? "دستی" : "Manual"}
            </button>
          </div>
          <label className="w-tiny">{fa ? "کارمزد افزایشی (پیشنهاد ۵۰۰ تا ۱۰۰۰ تومان)" : "Markup (500–1000 toman)"}</label>
          <input className="w-input" dir="ltr" type="number" value={markup} onChange={(e) => setMarkup(e.target.value)} />
          <label className="w-tiny">{fa ? "قیمت دستی تتر (تومان) — صفر = غیرفعال" : "Manual price (toman) — 0 = off"}</label>
          <input className="w-input" dir="ltr" type="number" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="—" />
          <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void save()} disabled={busy !== null}>
            {busy === "save" ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />} {fa ? "ذخیره" : "Save"}
          </button>
          {msg && <div className={`w-tiny ${msg.ok ? "w-up" : "w-down"}`}>{msg.text}</div>}
          {snap?.at ? (
            <div className="w-tiny" style={{ opacity: 0.7 }}>
              {fa ? "آخرین بازخوانی: " : "Last read: "}
              {new Date(Number(snap.at)).toLocaleString("en-GB")}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}



/** کاربران: نقش/VIP/دسترسی/سکه و تعدیل موجودی — روی REST واقعی، نه API قدیمی. */
export function UserAdmin({ token }: { token: string | null }) {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { asset: string; amount: string }>>({});

  const load = async () => {
    setBusy(true);
    try {
      const r: any = await restFetch(`/api/admin/users?q=${encodeURIComponent(q)}`, { token, timeoutMs: 30_000 });
      const list = Array.isArray(r) ? r : Array.isArray(r?.users) ? r.users : Array.isArray(r?.data) ? r.data : [];
      setRows(list);
      setMsg(list.length ? null : "لیستی برنگشت");
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, [token]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      const r: any = await restFetch(`/api/admin/users/${id}`, { method: "PATCH", token, body, timeoutMs: 30_000 });
      setMsg(r?.error ?? "ذخیره شد");
      void load();
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    }
  };
  const adjust = async (id: string) => {
    const d = draft[id];
    if (!d || !Number(d.amount)) {
      setMsg("مبلغ را وارد کنید (منفی = برداشت)");
      return;
    }
    try {
      const r: any = await restFetch(`/api/admin/users/${id}/balance`, {
        method: "POST",
        token,
        body: { asset: d.asset || "IRT", amount: Number(d.amount) },
        timeoutMs: 30_000,
      });
      setMsg(r?.error ?? `موجودی جدید: ${N(r?.balance, 4)}`);
      void load();
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    }
  };

  return (
    <div className="w-col" style={{ gap: 10 }}>
      <div className="w-row" style={{ gap: 8, flexWrap: "wrap" }}>
        <input className="w-input" style={{ maxWidth: 240 }} placeholder="جستجوی نام کاربری" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void load()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />} جستجو
        </button>
        <span className="w-tiny w-muted">{rows.length} کاربر</span>
        {msg && <span className="w-tiny w-up" style={{ maxWidth: 340 }}>{msg}</span>}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="w-table">
          <thead>
            <tr>
              <th>کاربر</th>
              <th>نقش</th>
              <th>VIP</th>
              <th>دسترسی</th>
              <th>سکه</th>
              <th>تعدیل موجودی</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u: any) => {
              const d = draft[u.id] ?? { asset: "IRT", amount: "" };
              return (
                <tr key={u.id}>
                  <td>
                    <div className="w-col" style={{ gap: 1 }}>
                      <b>{u.username}</b>
                      <span className="w-tiny w-muted">{u.name || u.phone || u.tg_username || "—"}</span>
                    </div>
                  </td>
                  <td>
                    <select className="w-input" value={u.role ?? "user"} onChange={(e) => void patch(u.id, { role: e.target.value })}>
                      {["user", "vip", "assistant", "admin"].map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="w-input"
                      style={{ minWidth: 96 }}
                      defaultValue={u.vip_package ?? ""}
                      placeholder="bronze/silver/gold"
                      onBlur={(e) => {
                        if ((e.target.value || "") !== (u.vip_package ?? "")) {
                          void patch(u.id, { vip_package: e.target.value, is_vip: !!e.target.value });
                        }
                      }}
                    />
                  </td>
                  <td>
                    <div className="w-row" style={{ gap: 4, flexWrap: "wrap" }}>
                      <ActBtn
                        label={u.can_trade ? "معامله: روشن" : "معامله: خاموش"}
                        path={`/api/admin/users/${u.id}`}
                        body={{ can_trade: !u.can_trade }}
                        token={token}
                        onDone={load}
                      />
                      <ActBtn
                        label={u.enabled ? "فعال" : "مسدود"}
                        path={`/api/admin/users/${u.id}`}
                        body={{ enabled: !u.enabled }}
                        token={token}
                        tone={u.enabled ? "ghost" : "danger"}
                        onDone={load}
                      />
                    </div>
                  </td>
                  <td>
                    <input
                      className="w-input"
                      style={{ maxWidth: 88 }}
                      type="number"
                      defaultValue={u.wolf_coins ?? 0}
                      onBlur={(e) => {
                        if (Number(e.target.value) !== Number(u.wolf_coins ?? 0)) {
                          void patch(u.id, { wolf_coins: Number(e.target.value) });
                        }
                      }}
                    />
                  </td>
                  <td>
                    <div className="w-row" style={{ gap: 4, flexWrap: "wrap" }}>
                      <select
                        className="w-input"
                        style={{ maxWidth: 76 }}
                        value={d.asset}
                        onChange={(e) => setDraft({ ...draft, [u.id]: { ...d, asset: e.target.value } })}
                      >
                        {["IRT", "USDT", "WOLF"].map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                      <input
                        className="w-input"
                        style={{ maxWidth: 96 }}
                        placeholder="+/-"
                        value={d.amount}
                        onChange={(e) => setDraft({ ...draft, [u.id]: { ...d, amount: e.target.value } })}
                      />
                      <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void adjust(u.id)}>اعمال</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── خطاها: دسته‌بندی‌شده و فارسی ─────────────────────────────────────────── */
type ErrEvent = {
  at: number;
  level: string;
  source: string;
  symbol: string | null;
  raw: string;
  category: string;
  code: string;
  fa: string;
  count?: number;
};
type ErrCat = { key: string; fa: string; en: string; hint: string; count: number };

const HOURS_CHOICES = [6, 24, 72, 168];

function errTime(ts: number): string {
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Error centre: every engine / broker / DB failure on tabs, in Persian. */
export function ErrorsAdmin({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [hours, setHours] = useState(24);
  const [cat, setCat] = useState("all");
  const [data, setData] = useState<{
    hours: number; total: number; unique: number; errors: number; categories: ErrCat[]; events: ErrEvent[];
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r: any = await restFetch(`/admin/errors?hours=${hours}`, { token, timeoutMs: 25_000 });
      setData(r);
    } catch (e: any) {
      setErr(String(e?.message ?? "—"));
      setData(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, token]);

  const cats = data?.categories ?? [];
  const shown = (data?.events ?? []).filter((e) => cat === "all" || e.category === cat);
  const active = cats.find((c) => c.key === cat);


  return (
    <div className="w-grid" style={{ gap: 10 }}>
      <div className="w-card w-card-pad">
        <div className="w-sec">
          <div className="w-sec-title"><i />{fa ? "مرکز خطاها" : "Error centre"}</div>
          <div className="w-row" style={{ gap: 6, flexWrap: "wrap" }}>
            {HOURS_CHOICES.map((h) => (
              <button
                key={h}
                className={`w-chip ${hours === h ? "w-chip-gold" : ""}`}
                onClick={() => setHours(h)}
                style={{ cursor: "pointer" }}
              >
                {h < 24 ? `${h}h` : `${h / 24}d`}
              </button>
            ))}
            <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void load()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
              {fa ? "به‌روزرسانی" : "Refresh"}
            </button>
          </div>
        </div>
        {err && <div className="w-tiny w-down" style={{ marginTop: 6 }}>{err}</div>}
        <div className="w-row" style={{ gap: 14, marginTop: 10, flexWrap: "wrap" }}>
          <div>
            <div className="w-tiny">{fa ? "کل رویداد" : "Events"}</div>
            <b className="w-mono" dir="ltr">{data ? N(data.total) : "—"}</b>
          </div>
          <div>
            <div className="w-tiny">{fa ? "خطای جدی" : "Errors"}</div>
            <b className="w-mono w-down" dir="ltr">{data ? N(data.errors) : "—"}</b>
          </div>
          <div>
            <div className="w-tiny">{fa ? "بازه" : "Window"}</div>
            <b className="w-mono" dir="ltr">{data ? `${data.hours}h` : "—"}</b>
          </div>
        </div>
      </div>

      <div className="w-card w-card-pad">
        <div className="w-sec"><div className="w-sec-title"><i />{fa ? "دسته‌بندی" : "Categories"}</div></div>
        <div className="w-row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button
            className={`w-chip ${cat === "all" ? "w-chip-gold" : ""}`}
            onClick={() => setCat("all")}
            style={{ cursor: "pointer" }}
          >
            {fa ? "همه" : "All"} <b className="w-mono" dir="ltr">{data ? (data.unique ?? data.events.length) : "—"}</b>
          </button>
          {cats.map((c) => (
            <button
              key={c.key}
              className={`w-chip ${cat === c.key ? "w-chip-gold" : ""}`}
              onClick={() => setCat(c.key)}
              style={{ cursor: "pointer", opacity: c.count === 0 ? 0.5 : 1 }}
            >
              {fa ? c.fa : c.en} <b className="w-mono" dir="ltr">{c.count}</b>
            </button>
          ))}
        </div>
        {active && (
          <div className="w-tiny" style={{ marginTop: 8, lineHeight: 1.9 }}>
            {active.hint}
          </div>
        )}
      </div>

      <ErrTable fa={fa} cats={cats} shown={shown} />
    </div>
  );
}


function ErrTable({ fa, cats, shown }: { fa: boolean; cats: ErrCat[]; shown: ErrEvent[] }) {
  return (
    <div className="w-card w-card-pad">
      <div className="w-sec">
        <div className="w-sec-title"><i />{fa ? "رویدادها" : "Events"}</div>
        <div className="w-tiny">{fa ? `${shown.length} مورد` : `${shown.length} items`}</div>
      </div>
      {shown.length === 0 && (
        <div className="w-tiny" style={{ padding: "10px 0" }}>
          {fa ? "در این بازه چیزی ثبت نشده — یعنی موتور بدون خطا کار کرده." : "Nothing recorded in this window."}
        </div>
      )}
      {shown.length > 0 && (
        <div className="w-table-wrap" dir={fa ? "rtl" : "ltr"}>
          <table className="w-table w-table-min">
            <thead>
              <tr>
                <th>{fa ? "زمان" : "Time"}</th>
                <th>{fa ? "سطح" : "Level"}</th>
                <th>{fa ? "دسته" : "Category"}</th>
                <th>{fa ? "پیام" : "Message"}</th>
                <th>{fa ? "کد" : "Code"}</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 200).map((e, i) => (
                <tr key={`${e.at}-${i}`}>
                  <td className="w-mono" dir="ltr" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{errTime(e.at)}</td>
                  <td>
                    <span className={`w-chip ${e.level === "ERROR" ? "w-chip-down" : ""}`} style={{ fontSize: 10 }}>
                      {e.level}
                    </span>
                  </td>
                  <td style={{ fontSize: 11.5 }}>{cats.find((c) => c.key === e.category)?.fa ?? e.category}</td>
                  <td style={{ fontSize: 12, lineHeight: 1.8 }}>
                    {e.fa}
                    {!!e.count && e.count > 1 && (
                      <span className="w-chip" style={{ fontSize: 10, marginInlineStart: 6, opacity: 0.8 }}>
                        ×{e.count}
                      </span>
                    )}
                    {e.symbol && <span className="w-mono" dir="ltr" style={{ opacity: 0.6 }}> · {e.symbol}</span>}
                    {e.raw && e.raw !== e.fa && (
                      <details style={{ marginTop: 2 }}>
                        <summary className="w-tiny" style={{ cursor: "pointer", opacity: 0.65 }}>
                          {fa ? "متن اصلی" : "raw"}
                        </summary>
                        <div className="w-mono" dir="ltr" style={{ fontSize: 10.5, opacity: 0.75, whiteSpace: "pre-wrap" }}>
                          {String(e.raw).slice(0, 400)}
                        </div>
                      </details>
                    )}
                  </td>
                  <td className="w-mono" dir="ltr" style={{ fontSize: 10.5, opacity: 0.7 }}>{e.code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── اقتصاد معامله: همهٔ هزینه‌های نوبیتکس + آستانه‌ها ──────────────────────── */
const COST_FIELDS: Array<{ k: string; fa: string; hint: string; step: number }> = [
  { k: "trading.feePct", fa: "کارمزد معامله (هر طرف، ٪)", step: 0.01, hint: "بازار تومانی نوبیتکس: ۰.۲۵٪" },
  { k: "trading.slippagePct", fa: "لیزشدن قیمت (هر طرف، ٪)", step: 0.01, hint: "اختلاف قیمت اجرا با قیمت لحظه‌ای" },
  { k: "trading.positionFeePct", fa: "کارمزد موقعیت تعهدی (٪)", step: 0.01, hint: "positionFeeRate نوبیتکس = ۰.۰۵٪" },
  { k: "trading.extensionPctPer8h", fa: "کارمزد تمدید هر ۸ ساعت (٪)", step: 0.001, hint: "از API: extensionFee ≈ ۰.۰۶۴٪ ارزش امانت" },
  { k: "trading.poolSharePctPerDay", fa: "سهم استخر از سود (٪ در روز)", step: 0.1, hint: "۰.۵٪ سود برای هر روز تمدید" },
  { k: "trading.withdrawFeeToman", fa: "کارمزد برداشت تومان", step: 500, hint: "۰.۰۲٪ با حداقل ۴٬۰۰۰ تومان" },
  { k: "risk.minRewardToCost", fa: "هدف ≥ چند برابر هزینهٔ کل", step: 0.1, hint: "گیت «ادج»: با ۳، هدف باید ۳ برابر هزینهٔ کامل باشد" },
  { k: "risk.minRR", fa: "حداقل ریسک به ریوارد", step: 0.1, hint: "هدف تقسیم بر حد ضرر" },
];

/** The economics of one trade: every Nobitex cost plus the entry gates. */
export function CostAdmin({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    restFetch("/admin/settings", { token, timeoutMs: 20_000 })
      .then((r: any) => {
        const s = r?.settings ?? {};
        const next: Record<string, number> = {};
        for (const f of COST_FIELDS) next[f.k] = Number(s[f.k] ?? 0);
        setDraft(next);
      })
      .catch(() => setMsg({ ok: false, text: fa ? "خواندن تنظیمات ناموفق بود" : "failed to load settings" }));
  }, [token, fa]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const patch: Record<string, number> = {};
      for (const f of COST_FIELDS) if (Number.isFinite(draft[f.k])) patch[f.k] = Number(draft[f.k]);
      await restFetch("/admin/settings", { token, method: "POST", body: patch, timeoutMs: 20_000 });
      setMsg({ ok: true, text: fa ? "ذخیره شد — موتور از چرخهٔ بعد همین اعداد را می‌خواند" : "saved" });
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? "—") });
    } finally {
      setBusy(false);
    }
  };

  const v = (k: string, d = 0) => (Number.isFinite(draft[k]) ? draft[k] : d);
  const costPct = 2 * v("trading.feePct", 0.25) + 2 * v("trading.slippagePct", 0.1)
    + v("trading.positionFeePct", 0.05) + v("trading.extensionPctPer8h", 0.064);
  const k = Math.max(1, v("risk.minRewardToCost", 3));
  const be = costPct / 100;
  const need = costPct * k;

  return (
    <div className="w-card w-card-pad">
      <div className="w-sec">
        <div className="w-sec-title"><i />{fa ? "اقتصاد معامله (هزینه‌های واقعی نوبیتکس)" : "Trade economics"}</div>
        <div className="w-tiny">{fa ? "سود/ضرر همه‌جا «خالص» است" : "all PnL is net"}</div>
      </div>
      <div className="w-row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <span className="w-chip">{fa ? "هزینهٔ رفت‌وبرگشت" : "round trip"}: <b className="w-mono" dir="ltr">{costPct.toFixed(2)}%</b></span>
        <span className="w-chip">{fa ? "سربه‌سر" : "breakeven"} ×N: <b className="w-mono" dir="ltr">{be.toFixed(3)}N</b></span>
        <span className="w-chip w-chip-gold">{fa ? "حداقل هدف قبول‌شده" : "min target"}: <b className="w-mono" dir="ltr">{need.toFixed(2)}%</b></span>
      </div>
      <div className="w-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
        {COST_FIELDS.map((f) => (
          <label key={f.k} style={{ display: "grid", gap: 3 }}>
            <span className="w-tiny">{f.fa}</span>
            <input
              className="w-input"
              dir="ltr"
              type="number"
              step={f.step}
              value={Number.isFinite(draft[f.k]) ? draft[f.k] : ""}
              onChange={(e) => setDraft((d) => ({ ...d, [f.k]: Number(e.target.value) }))}
            />
            <span className="w-tiny" style={{ opacity: 0.65, fontSize: 10.5 }}>{f.hint}</span>
          </label>
        ))}
      </div>
      <div className="w-row" style={{ gap: 8, marginTop: 10, alignItems: "center" }}>
        <button className="w-btn w-btn-gold" onClick={() => void save()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
          {fa ? "ذخیره" : "Save"}
        </button>
        {msg && <span className={`w-tiny ${msg.ok ? "" : "w-down"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
