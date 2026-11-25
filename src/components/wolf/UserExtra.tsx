import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { restFetch } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";

type Msg = { role: "me" | "ai"; text: string; at: number };

/** WOLF AI chat (education assistant) + previous answers. */
export function AiChatZone({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadHistory = async () => {
    if (!token) return;
    try {
      const r: any = await restFetch("/ai/chats", { token, timeoutMs: 20_000 });
      setHistory(Array.isArray(r?.chats) ? r.chats : []);
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => { void loadHistory(); }, [token]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  const send = async () => {
    const text = q.trim();
    if (!text || busy) return;
    setMsgs((m) => [...m, { role: "me", text, at: Date.now() }]);
    setQ("");
    setBusy(true);
    setHint(null);
    try {
      const r: any = await restFetch("/ai/chat", { method: "POST", token, body: { question: text }, timeoutMs: 90_000 });
      const answer = String(r?.answer ?? r?.reply ?? r?.text ?? r?.message ?? (fa ? "پاسخی دریافت نشد." : "No answer."));
      setMsgs((m) => [...m, { role: "ai", text: answer, at: Date.now() }]);
      void loadHistory();
    } catch (e: any) {
      setHint(String(e?.message ?? (fa ? "سرویس هوش مصنوعی در دسترس نیست." : "AI unavailable.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-col" style={{ gap: 10 }}>
      <div className="w-card w-card-pad">
        <div className="w-sec">
          <div className="w-sec-title"><i />{fa ? "دستیار هوشمند ولف" : "WOLF AI assistant"}</div>
          <span className="w-chip w-chip-gold">AI</span>
        </div>
        <div className="w-tiny" style={{ lineHeight: 1.9, marginBottom: 8 }}>
          {fa
            ? "دربارهٔ استراتژی، مدیریت ریسک، روان‌شناسی معامله و مفاهیم بازار بپرس. پاسخ‌ها آموزشی است، نه توصیهٔ مالی."
            : "Ask about strategy, risk, trading psychology and market concepts. Educational only, not financial advice."}
        </div>

        <div className="w-col" style={{ gap: 8, maxHeight: 420, overflowY: "auto" }}>
          {!msgs.length && !busy && (
            <div className="w-empty">{fa ? "سؤالی بپرسید تا گفتگو شروع شود." : "Ask something to start."}</div>
          )}
          {msgs.map((m, i) => (
            <div
              key={i}
              className="w-card"
              style={{
                padding: "9px 11px",
                borderRadius: 12,
                alignSelf: m.role === "me" ? "flex-end" : "flex-start",
                maxWidth: "92%",
                background: m.role === "me" ? "var(--w-gold-soft, rgba(255,196,0,.12))" : "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.07)",
              }}
            >
              <div className="w-tiny" style={{ marginBottom: 3, opacity: 0.7 }}>
                {m.role === "me" ? (fa ? "شما" : "You") : "WOLF AI"}
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.95, whiteSpace: "pre-wrap" }}>{m.text}</div>
            </div>
          ))}
          {busy && (
            <div className="w-row w-tiny" style={{ gap: 6 }}>
              <Loader2 className="animate-spin" size={13} /> {fa ? "ولف در حال فکر کردن…" : "WOLF is thinking…"}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="w-row" style={{ gap: 6, marginTop: 10 }}>
          <input
            className="w-input"
            placeholder={fa ? "سؤال خود را بنویسید…" : "Type your question…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
          />
          <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void send()} disabled={busy || !q.trim()}>
            <Send size={13} />
          </button>
        </div>
        {hint && <div className="w-tiny w-down" style={{ marginTop: 6 }}>{hint}</div>}
      </div>

      <div className="w-card w-card-pad">
        <div className="w-sec"><div className="w-sec-title"><i />{fa ? "پاسخ‌های قبلی" : "Previous answers"}</div></div>
        {!history.length && <div className="w-empty">{fa ? "هنوز گفتگویی ثبت نشده است." : "No chat yet."}</div>}
        <div className="w-col" style={{ gap: 8 }}>
          {history.slice(0, 12).map((h, i) => (
            <div key={String(h.id ?? i)} className="w-card" style={{ padding: "8px 10px", borderRadius: 10 }}>
              <div className="w-tiny" style={{ marginBottom: 3, opacity: 0.7 }}>
                {String(h.model ?? h.provider ?? "AI")}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.9, whiteSpace: "pre-wrap" }}>
                {String(h.text ?? "—").slice(0, 600)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Coin packages, quiz and profile reward — ported from the legacy coins tab. */
export function CoinsShop({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [packages, setPackages] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [quiz, setQuiz] = useState<any>(null);
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    if (!token) return;
    restFetch("/coins/packages", { token, timeoutMs: 20_000 })
      .then((r: any) => setPackages(Array.isArray(r?.packages) ? r.packages : []))
      .catch(() => setPackages([]));
  }, [token]);

  const post = async (label: string, path: string, body: Record<string, unknown>) => {
    setBusy(label);
    setMsg(null);
    try {
      const r: any = await restFetch(path, { method: "POST", token, body, timeoutMs: 60_000 });
      setMsg({ ok: !r?.error, text: String(r?.error ?? r?.reason ?? r?.message ?? "OK") });
      return r;
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? "—") });
      return null;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="w-col" style={{ gap: 10 }}>
      <div className="w-card w-card-pad">
        <div className="w-sec"><div className="w-sec-title"><i />{fa ? "خرید بستهٔ سکه" : "Coin packages"}</div></div>
        {!packages.length && <div className="w-empty">{fa ? "بسته‌ای تعریف نشده است." : "No package."}</div>}
        <div className="w-grid w-g-3" style={{ gap: 8 }}>
          {packages.map((p, i) => (
            <div key={String(p.id ?? i)} className="w-card" style={{ padding: "10px 11px", borderRadius: 12 }}>
              <div className="w-num" style={{ fontWeight: 800, fontSize: 15 }}>{String(p.coins ?? p.amount ?? "—")} 🪙</div>
              <div className="w-tiny" style={{ marginBottom: 6 }}>{String(p.toman ?? p.priceToman ?? p.price ?? "")}</div>
              <button
                className="w-btn w-btn-gold w-btn-sm"
                style={{ width: "100%" }}
                disabled={busy !== null}
                onClick={() => void post(`pkg${i}`, "/coins/package", { index: i })}
              >
                {busy === `pkg${i}` ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />} {fa ? "خرید" : "Buy"}
              </button>
            </div>
          ))}
        </div>
        <div className="w-row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <button className="w-btn w-btn-ghost w-btn-sm" disabled={busy !== null} onClick={() => void post("reward", "/coins/claim-reward", {})}>
            {fa ? "دریافت جایزهٔ پروفایل" : "Claim profile reward"}
          </button>
          <button
            className="w-btn w-btn-ghost w-btn-sm"
            disabled={busy !== null}
            onClick={async () => {
              const r = await post("quiz", "/coins/quiz/start", {});
              if (r) setQuiz(r);
            }}
          >
            {fa ? "شروع کوییز" : "Start quiz"}
          </button>
        </div>
        {msg && <div className={`w-tiny ${msg.ok ? "w-up" : "w-down"}`} style={{ marginTop: 8 }}>{msg.text}</div>}
      </div>

      {quiz && (
        <div className="w-card w-card-pad">
          <div className="w-sec"><div className="w-sec-title"><i />{fa ? "کوییز سکه" : "Coin quiz"}</div></div>
          <div style={{ fontSize: 12.5, lineHeight: 1.95, marginBottom: 8 }}>
            {String(quiz.question ?? quiz.title ?? quiz.text ?? "—")}
          </div>
          <div className="w-col" style={{ gap: 6 }}>
            {(Array.isArray(quiz.options) ? quiz.options : []).map((o: any, i: number) => {
              const key = String(i);
              return (
                <button
                  key={key}
                  className={`w-btn w-btn-${answer === key ? "gold" : "ghost"} w-btn-sm`}
                  style={{ textAlign: "start" }}
                  onClick={() => setAnswer(key)}
                >
                  {String(o?.label ?? o?.text ?? o)}
                </button>
              );
            })}
            <button
              className="w-btn w-btn-gold w-btn-sm"
              disabled={!answer || busy !== null}
              onClick={async () => {
                const qid = String(quiz?.id ?? quiz?.quizId ?? quiz?.quiz_id ?? "");
                const r = await post("resolve", "/coins/quiz/resolve", { id: qid, chosen: Number(answer) });
                if (r) { setQuiz(null); setAnswer(""); }
              }}
            >
              {fa ? "ثبت پاسخ" : "Submit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Apply a referral code (the legacy panel had it inside the referral tab). */
export function ReferralApply({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r: any = await restFetch("/referral/apply", { method: "POST", token, body: { code: code.trim() }, timeoutMs: 30_000 });
      setMsg({ ok: !r?.error, text: String(r?.error ?? r?.message ?? "OK") });
      if (!r?.error) setCode("");
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? "—") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-card w-card-pad">
      <div className="w-sec"><div className="w-sec-title"><i />{fa ? "ثبت کد معرف" : "Apply referral code"}</div></div>
      <div className="w-tiny" style={{ marginBottom: 8, lineHeight: 1.9 }}>
        {fa ? "اگر با کد دوستتان ثبت‌نام نکرده‌اید، کد را اینجا وارد کنید." : "Enter a friend's code if you did not sign up with one."}
      </div>
      <div className="w-row" style={{ gap: 6 }}>
        <input className="w-input" dir="ltr" placeholder="WOLF-XXXX" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void apply()} disabled={busy || !code.trim()}>
          {busy ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
        </button>
      </div>
      {msg && <div className={`w-tiny ${msg.ok ? "w-up" : "w-down"}`} style={{ marginTop: 8 }}>{msg.text}</div>}
    </div>
  );
}

/** The three balances every user has: USDT (crypto), WOLF coin, Toman. */
export function ThreeWallets({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [wallet, setWallet] = useState<any>(null);
  const [coins, setCoins] = useState<any>(null);

  useEffect(() => {
    if (!token) return;
    restFetch("/wallet", { token, timeoutMs: 20_000 }).then(setWallet).catch(() => setWallet(null));
    restFetch("/coins", { token, timeoutMs: 20_000 }).then(setCoins).catch(() => setCoins(null));
  }, [token]);

  const rows: any[] = Array.isArray(wallet?.wallets) ? wallet.wallets : Array.isArray(wallet) ? wallet : [];
  const asset = (names: string[]) =>
    rows.find((w) => names.includes(String(w?.asset ?? w?.currency ?? "").toUpperCase()));
  const usdt = asset(["USDT"]);
  const irt = asset(["IRT", "TMN", "TOMAN"]);
  const wolf =
    Number(coins?.wolfCoins ?? coins?.wolf_coins ?? coins?.coins ?? coins?.balance ?? 0) || 0;

  const card = (label: string, value: string, hint: string, tone: string) => (
    <div className="w-card w-card-pad" style={{ padding: "11px 12px" }}>
      <div className="w-tiny" style={{ opacity: 0.75 }}>{label}</div>
      <div className={`w-num ${tone}`} style={{ fontSize: 17, fontWeight: 800 }}>{value}</div>
      <div className="w-tiny" style={{ opacity: 0.6 }}>{hint}</div>
    </div>
  );

  return (
    <div className="w-card w-card-pad">
      <div className="w-sec"><div className="w-sec-title"><i />{fa ? "سه موجودی من" : "My three balances"}</div></div>
      <div className="w-grid w-g-3" style={{ gap: 8 }}>
        {card(fa ? "تتر (USDT)" : "USDT", usdt ? `${Number(usdt.balance).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "0", usdt?.network ? String(usdt.network) : "TRC20", "w-up")}
        {card(fa ? "ولف کوین" : "WOLF coin", `${wolf.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, fa ? "برای سیگنال، بسته و کوییز" : "for signals, packages, quiz", "w-num")}
        {card(fa ? "تومان" : "Toman", irt ? `${Number(irt.balance).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "0", fa ? "واریز کارت به کارت" : "card top-up", "")}
      </div>
    </div>
  );
}

/** User settings: language, theme, password, AI option. */
export function SettingsZone({ token, theme, toggleTheme }: { token: string | null; theme?: string; toggleTheme?: () => void }) {
  const { lang, setLang } = useI18n() as any;
  const fa = lang === "fa";
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const changePassword = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r: any = await restFetch("/auth/change-password", {
        method: "POST",
        token,
        body: { currentPassword: cur, newPassword: next },
        timeoutMs: 20_000,
      });
      setMsg({ ok: !r?.error, text: String(r?.error ?? r?.message ?? (fa ? "رمز تغییر کرد." : "Password changed.")) });
      if (!r?.error) { setCur(""); setNext(""); }
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? "—") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-grid w-g-2" style={{ gap: 12 }}>
      <div className="w-card w-card-pad">
        <div className="w-sec"><div className="w-sec-title"><i />{fa ? "زبان و ظاهر" : "Language & look"}</div></div>
        <div className="w-row" style={{ gap: 6, marginBottom: 10 }}>
          <button className={`w-btn w-btn-sm ${fa ? "w-btn-gold" : "w-btn-ghost"}`} onClick={() => setLang?.("fa")}>فارسی</button>
          <button className={`w-btn w-btn-sm ${!fa ? "w-btn-gold" : "w-btn-ghost"}`} onClick={() => setLang?.("en")}>English</button>
        </div>
        {toggleTheme && (
          <button className="w-btn w-btn-ghost w-btn-sm" onClick={toggleTheme}>
            {String(theme) === "light" ? (fa ? "حالت تاریک" : "Dark mode") : (fa ? "حالت روشن" : "Light mode")}
          </button>
        )}
      </div>

      <div className="w-card w-card-pad">
        <div className="w-sec"><div className="w-sec-title"><i />{fa ? "تغییر رمز عبور" : "Change password"}</div></div>
        <div className="w-col" style={{ gap: 8 }}>
          <input className="w-input" type="password" dir="ltr" placeholder={fa ? "رمز فعلی" : "current password"} value={cur} onChange={(e) => setCur(e.target.value)} />
          <input className="w-input" type="password" dir="ltr" placeholder={fa ? "رمز جدید" : "new password"} value={next} onChange={(e) => setNext(e.target.value)} />
          <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void changePassword()} disabled={busy || !cur || next.length < 6}>
            {busy ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />} {fa ? "ذخیره" : "Save"}
          </button>
          {msg && <div className={`w-tiny ${msg.ok ? "w-up" : "w-down"}`}>{msg.text}</div>}
        </div>
      </div>
    </div>
  );
}
