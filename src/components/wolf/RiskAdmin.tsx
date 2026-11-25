import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { restFetch } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";

type Field = {
  k: string;
  fa: string;
  hint?: string;
  step?: number;
  kind?: "num" | "bool" | "select";
  options?: string[];
  wired?: boolean;
};

const g = (title: string, fields: Field[]) => ({ title, fields });

const PRESETS: Array<{ key: string; fa: string; en: string; note: string }> = [
  { key: "ultra_conservative", fa: "فوق محافظه‌کار", en: "ultra conservative", note: "حداقل ریسک، فقط بهترین سیگنال‌ها" },
  { key: "conservative", fa: "محافظه‌کار", en: "conservative", note: "ریسک کم، تأییدهای بیشتر" },
  { key: "balanced", fa: "متعادل", en: "balanced", note: "تنظیم فعلی موتور" },
  { key: "aggressive", fa: "تهاجمی", en: "aggressive", note: "معاملات بیشتر، ریسک بالاتر" },
  { key: "very_aggressive", fa: "بسیار تهاجمی", en: "very aggressive", note: "حداکثر فرصت‌ها، ریسک بالا" },
];

/** Preview numbers each preset would produce, straight from the server table. */
const PRESET_PREVIEW: Record<string, Record<string, number>> = {
  ultra_conservative: { "risk.riskPerTrade": 0.5, "risk.maxOpenPositions": 2, "risk.minScore": 90, "risk.minRR": 2, "risk.maxDailyLoss": 1 },
  conservative: { "risk.riskPerTrade": 0.75, "risk.maxOpenPositions": 4, "risk.minScore": 85, "risk.minRR": 1.5, "risk.maxDailyLoss": 2 },
  balanced: { "risk.riskPerTrade": 1.5, "risk.maxOpenPositions": 8, "risk.minScore": 80, "risk.minRR": 1.2, "risk.maxDailyLoss": 5 },
  aggressive: { "risk.riskPerTrade": 2.5, "risk.maxOpenPositions": 15, "risk.minScore": 75, "risk.minRR": 1, "risk.maxDailyLoss": 8 },
  very_aggressive: { "risk.riskPerTrade": 3, "risk.maxOpenPositions": 25, "risk.minScore": 70, "risk.minRR": 1.2, "risk.maxDailyLoss": 15 },
};

const GROUPS = [
  g("اندازهٔ پوزیشن و سرمایه", [
    { k: "risk.riskPerTrade", fa: "ریسک هر معامله (٪ سرمایه)", step: 0.1, hint: "۱.۵٪ = با سرمایهٔ ۱۰۰ دلاری، ۱.۵ دلار ریسک تا حد ضرر" },
    { k: "risk.maxOpenPositions", fa: "حداکثر پوزیشن باز", step: 1, hint: "سقف هم‌زمان؛ روی engine.maxTotalPositions هم اثر می‌گذارد" },
    { k: "engine.capitalAllocation", fa: "تخصیص سرمایهٔ موتور (٪)", step: 1 },
    { k: "risk.maxLeverage", fa: "حداکثر اهرم", step: 1 },
    { k: "risk.maxSymbolExposure", fa: "سقف تمرکز روی یک نماد (٪)", step: 1 },
    { k: "risk.maxExposure", fa: "سقف کلی در معرض بودن (٪)", step: 1 },
    { k: "risk.maxPosition", fa: "سقف یک پوزیشن (٪ سرمایه)", step: 1 },
    { k: "risk.fallbackRiskPct", fa: "ریسک پشتیبان (٪)", step: 0.1, hint: "اگر اندازه‌گذاری اصلی ممکن نشد" },
  ]),
  g("گیت‌های ورود (چه چیزی وارد شود)", [
    { k: "risk.minScore", fa: "حداقل امتیاز سیگنال", step: 1 },
    { k: "risk.minConfidence", fa: "حداقل اطمینان", step: 0.01 },
    { k: "risk.minConsensus", fa: "حداقل اجماع استراتژی‌ها", step: 0.01 },
    { k: "risk.minConfirmations", fa: "حداقل تأیید (خانوادهٔ استراتژی)", step: 1, hint: "با رأی‌های کمتر از این، سیگنال رد می‌شود" },
    { k: "risk.minRR", fa: "حداقل ریسک به ریوارد", step: 0.1 },
    { k: "risk.minRewardToCost", fa: "هدف ≥ چند برابر هزینهٔ کل", step: 0.1, hint: "گیت ادج؛ با ۲.۴٪ برگشت کامل، هدف حداقل ۷.۲٪" },
    { k: "risk.exhaustionGuardEnabled", fa: "گارد خستگی روند", kind: "bool" },
    { k: "risk.requireFreshData", fa: "دادهٔ تازه الزامی", kind: "bool", wired: false },
  ]),
  g("خروج، تریلینگ و حد سود", [
    { k: "risk.stopOffsetATR", fa: "حد ضرر (× ATR)", step: 0.1 },
    { k: "risk.tp1ATR", fa: "هدف ۱ (× ATR)", step: 0.1 },
    { k: "risk.tp2ATR", fa: "هدف ۲ (× ATR)", step: 0.1 },
    { k: "risk.tp3ATR", fa: "هدف ۳ (× ATR)", step: 0.1 },
    { k: "risk.trailingStop", fa: "تریلینگ استاپ", kind: "bool" },
    { k: "risk.trailingActivatePct", fa: "فعال‌شدن تریلینگ (٪ سود)", step: 0.1 },
    { k: "risk.trailingDistancePct", fa: "فاصلهٔ تریلینگ (٪)", step: 0.1 },
    { k: "risk.partialExitEnabled", fa: "خروج پله‌ای", kind: "bool" },
    { k: "risk.partialExitPct", fa: "درصد خروج پله‌ای", step: 1 },
    { k: "risk.timeStopEnabled", fa: "خروج زمانی", kind: "bool" },
    { k: "risk.maxHoldingMinutes", fa: "حداکثر نگه‌داری (دقیقه)", step: 10 },
    { k: "risk.cooldownMinutes", fa: "کول‌داون بین ورودها (دقیقه)", step: 5 },
    { k: "risk.maxReentry", fa: "حداکثر ورود مجدد به نماد", step: 1 },
  ]),
  g("محدودیت‌های روزانه", [
    { k: "risk.maxDailyLoss", fa: "حداکثر ضرر روزانه (٪)", step: 0.5 },
    { k: "risk.maxDailyTrades", fa: "حداکثر معامله در روز", step: 1 },
    { k: "risk.maxDrawdown", fa: "حداکثر افت سرمایه (٪)", step: 0.5 },
    { k: "risk.maxDrawdownAction", fa: "واکنش به افت", kind: "select", options: ["pause", "stop", "reduce"] },
  ]),
  g("حفاظت‌ها (استاپ‌گارد)", [
    { k: "risk.protectionStoplossCount", fa: "چند حد ضرر در پنجره", step: 1 },
    { k: "risk.protectionStoplossWindowMin", fa: "پنجرهٔ شمارش (دقیقه)", step: 10 },
    { k: "risk.protectionCooldownMin", fa: "کول‌داون بعد از تریپ", step: 10 },
    { k: "risk.protectionMaxConsecutiveLosses", fa: "حداکثر ضرر پیاپی", step: 1 },
    { k: "risk.protectionLossCooldownMin", fa: "کول‌داون نماد بعد از ضرر", step: 5 },
    { k: "risk.protectionLowProfitMinTrades", fa: "حداقل معامله برای سنجش سود", step: 1 },
    { k: "risk.protectionLowProfitMinPct", fa: "حداقل سود تجمعی (٪)", step: 0.1 },
  ]),
  g("فیلتر بازار", [
    { k: "risk.volumeDroughtRatio", fa: "حجم خشک (نسبت به میانگین)", step: 0.01 },
    { k: "risk.volumeLowRatio", fa: "حجم کم (نسبت به میانگین)", step: 0.01 },
  ]),
];

/** Risk page: every knob the engine really reads, presets that apply in one click. */
export function RiskAdmin({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [cur, setCur] = useState<Record<string, any>>({});
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rate, setRate] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [s, rt] = await Promise.all([
        restFetch<{ settings: Record<string, any> }>("/admin/settings", { token, timeoutMs: 20_000 }),
        restFetch<{ price: number }>("/rates/usdt", { timeoutMs: 10_000 }).catch(() => null),
      ]);
      const map = s?.settings ?? {};
      setCur(map);
      setDraft(map);
      setRate(Number(rt?.price ?? 0));
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? e) });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const changed = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const grp of GROUPS) {
      for (const f of grp.fields) {
        if (JSON.stringify(cur[f.k] ?? null) !== JSON.stringify(draft[f.k] ?? null)) out[f.k] = draft[f.k];
      }
    }
    return out;
  }, [cur, draft]);

  const save = async () => {
    if (!token || !Object.keys(changed).length) return;
    setBusy("save");
    setMsg(null);
    try {
      await restFetch("/admin/settings", { token, method: "POST", body: changed, timeoutMs: 25_000 });
      setCur((c) => ({ ...c, ...changed }));
      setMsg({ ok: true, text: fa ? `${Object.keys(changed).length} کلید ذخیره شد — از چرخهٔ بعد موتور همین‌ها را می‌خواند` : "saved" });
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? e) });
    } finally {
      setBusy(null);
    }
  };

  const applyPreset = async (key: string, title: string) => {
    if (!token) return;
    if (!window.confirm(fa ? `پیش‌تنظیم «${title}» روی موتور اعمال شود؟ همهٔ مقادیر ریسک بازنویسی می‌شوند.` : `Apply "${title}"?`)) return;
    setBusy(key);
    setMsg(null);
    try {
      await restFetch("/admin/settings/preset", { token, method: "POST", body: { preset: key, confirmOverwrite: true }, timeoutMs: 25_000 });
      await load();
      setMsg({ ok: true, text: fa ? `پیش‌تنظیم «${title}» اعمال شد` : "applied" });
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? e) });
    } finally {
      setBusy(null);
    }
  };

  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const feePct = num(draft["trading.feePct"] ?? 0.25);
  const slipPct = num(draft["trading.slippagePct"] ?? 0.1);
  const posFee = num(draft["trading.positionFeePct"] ?? 0.05);
  const extFee = num(draft["trading.extensionPctPer8h"] ?? 0.064);
  const roundTrip = 2 * feePct + 2 * slipPct + posFee + extFee;
  const capital = num(draft["engine.capital"]) + num(draft["engine.realizedPnl"]);
  const riskPct = num(draft["risk.riskPerTrade"] ?? 1.5);
  const perTrade = (capital * riskPct) / 100;
  const maxPos = num(draft["risk.maxOpenPositions"] ?? 8);
  const maxRisk = perTrade * maxPos;
  const presetNow = String(cur["risk.preset"] ?? "custom");
  const irt = (usd: number) => (rate > 0 ? Math.round(Math.abs(usd) * rate).toLocaleString("en-US") : "—");
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="w-card w-card-pad">
        <div className="w-sec">
          <div className="w-sec-title"><i />{fa ? "بستهٔ ریسک متصل به موتور" : "risk bundle"}</div>
          <div className="w-row" style={{ gap: 6 }}>
            <span className="w-chip w-chip-gold" dir="ltr">{presetNow}</span>
            <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={12} /> : <RefreshCw size={12} />}
            </button>
          </div>
        </div>
        <div className="w-row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <span className="w-chip">{fa ? "هزینهٔ رفت‌وبرگشت" : "round trip"}: <b className="w-mono" dir="ltr">{roundTrip.toFixed(2)}%</b></span>
          <span className="w-chip">{fa ? "ریسک هر معامله" : "risk/trade"}: <b className="w-mono" dir="ltr">{perTrade.toFixed(2)}$ · {irt(perTrade)}</b></span>
          <span className="w-chip">{fa ? "حداکثر ریسک هم‌زمان" : "max risk"}: <b className="w-mono" dir="ltr">{maxRisk.toFixed(2)}$ · {irt(maxRisk)}</b></span>
          <span className="w-chip">{fa ? "سرمایه" : "capital"}: <b className="w-mono" dir="ltr">{capital.toFixed(2)}$</b></span>
        </div>
        <div className="w-tiny" style={{ lineHeight: 1.9 }}>
          {fa
            ? "همهٔ این عددها را موتور هر چرخه از system_settings می‌خواند؛ ذخیره = اعمال، بدون ری‌استارت."
            : "Every value is read by the engine each cycle; saving applies instantly."}
        </div>
        {msg && <div className={`w-tiny ${msg.ok ? "w-up" : "w-down"}`} style={{ marginTop: 6 }}>{msg.text}</div>}
      </div>

      <div className="w-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8 }}>
        {PRESETS.map((p) => {
          const pv = PRESET_PREVIEW[p.key] ?? {};
          const active = presetNow === p.key;
          return (
            <div key={p.key} className="w-card w-card-pad" style={{ display: "grid", gap: 6, borderColor: active ? "rgba(240,194,90,.5)" : undefined }}>
              <div className="w-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <b style={{ fontSize: 12.5 }}>{fa ? p.fa : p.en}</b>
                {active && <span className="w-chip w-chip-gold">{fa ? "فعال" : "active"}</span>}
              </div>
              <div className="w-tiny">{p.note}</div>
              <div style={{ display: "grid", gap: 2, fontSize: 10.5 }}>
                <span>{fa ? "ریسک هر معامله" : "risk/trade"}: <b dir="ltr">{pv["risk.riskPerTrade"]}%</b></span>
                <span>{fa ? "حداکثر پوزیشن" : "max pos"}: <b dir="ltr">{pv["risk.maxOpenPositions"]}</b></span>
                <span>{fa ? "حداقل امتیاز" : "min score"}: <b dir="ltr">{pv["risk.minScore"]}</b></span>
                <span>{fa ? "حداقل R:R" : "min RR"}: <b dir="ltr">{pv["risk.minRR"]}</b></span>
                <span>{fa ? "ضرر روزانه" : "daily loss"}: <b dir="ltr">{pv["risk.maxDailyLoss"]}%</b></span>
              </div>
              <button className={`w-btn ${active ? "w-btn-ghost" : "w-btn-gold"} w-btn-sm`} disabled={busy !== null}
                onClick={() => void applyPreset(p.key, fa ? p.fa : p.en)}>
                {busy === p.key ? <Loader2 className="animate-spin" size={12} /> : <ShieldCheck size={12} />} {fa ? "اعمال این بسته" : "apply"}
              </button>
            </div>
          );
        })}
      </div>
      {GROUPS.map((grp) => (
        <div key={grp.title} className="w-card w-card-pad">
          <div className="w-sec">
            <div className="w-sec-title"><i />{grp.title}</div>
            <span className="w-tiny">{grp.fields.length}</span>
          </div>
          <div className="w-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
            {grp.fields.map((f) => {
              const val = draft[f.k];
              const dirty = JSON.stringify(cur[f.k] ?? null) !== JSON.stringify(val ?? null);
              return (
                <label key={f.k} style={{ display: "grid", gap: 3, padding: 6, borderRadius: 9, border: `1px solid ${dirty ? "rgba(240,194,90,.45)" : "rgba(255,255,255,.07)"}` }}>
                  <span className="w-tiny" style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
                    <span>{f.fa}</span>
                    <span className={f.wired === false ? "w-down" : "w-up"} style={{ fontSize: 9, opacity: 0.85 }}>
                      {f.wired === false ? (fa ? "فقط ذخیره" : "stored") : fa ? "متصل" : "wired"}
                    </span>
                  </span>
                  {f.kind === "bool" ? (
                    <button
                      className={`w-btn ${val ? "w-btn-gold" : "w-btn-ghost"} w-btn-sm`}
                      onClick={(e) => { e.preventDefault(); setDraft((d) => ({ ...d, [f.k]: !val })); }}
                    >
                      {val ? (fa ? "روشن" : "on") : (fa ? "خاموش" : "off")}
                    </button>
                  ) : f.kind === "select" ? (
                    <select className="w-input" dir="ltr" value={String(val ?? "")}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.k]: e.target.value }))}>
                      {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className="w-input" dir="ltr" type="number" step={f.step ?? 1}
                      value={val === undefined || val === null || val === "" ? "" : String(val)}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.k]: e.target.value === "" ? "" : Number(e.target.value) }))} />
                  )}
                  <span className="w-mono" style={{ fontSize: 9, opacity: 0.55 }} dir="ltr">{f.k}</span>
                  {f.hint && <span className="w-tiny" style={{ fontSize: 9.5, opacity: 0.7 }}>{f.hint}</span>}
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <div className="w-card w-card-pad" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", position: "sticky", bottom: 8, zIndex: 5 }}>
        <button className="w-btn w-btn-gold" onClick={() => void save()} disabled={busy !== null || !Object.keys(changed).length}>
          {busy === "save" ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
          {fa ? "ذخیره و اعمال روی موتور" : "save & apply"}
        </button>
        <span className="w-chip">{fa ? "تغییرها" : "changed"}: <b dir="ltr">{Object.keys(changed).length}</b></span>
        {Object.keys(changed).length > 0 && (
          <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => setDraft(cur)}>{fa ? "بازگردانی" : "reset"}</button>
        )}
        <span className="w-tiny" style={{ marginInlineStart: "auto" }}>
          {fa ? "پیش‌تنظیم‌ها همهٔ مقادیر را یک‌جا می‌نشانند؛ تغییر دستی بعد از آن، بسته را custom می‌کند." : "manual edits make the preset custom"}
        </span>
      </div>
    </div>
  );
}
