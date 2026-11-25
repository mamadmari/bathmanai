import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AlertTriangle, ArrowRight, Loader2, LockKeyhole, Send, ShieldCheck, User } from "lucide-react";
import logo from "@/assets/logo.svg";
import { restFetch } from "@/lib/backend";
import { useWolfAuth } from "@/hooks/use-wolf-auth";
import { LangToggle, useI18n } from "@/lib/i18n";
import { WolfThemeToggle } from "@/components/wolf/ThemeToggle";

type TgUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    onWolfTelegramAuth?: (user: TgUser) => void;
  }
}

function miniAppInitData(): string | null {
  if (typeof window === "undefined") return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
  return typeof tg?.initData === "string" && tg.initData ? tg.initData : null;
}

export default function Auth({ redirectAfterAuth = "/app" }: { redirectAfterAuth?: string }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const { login, loginTelegram, isAuthenticated, isLoading: authLoading } = useWolfAuth();
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo");
  const redirect = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : redirectAfterAuth;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "telegram" | "">("");
  const [error, setError] = useState<string | null>(null);
  const [showWidget, setShowWidget] = useState(false);
  const [botUsername, setBotUsername] = useState<string>("");
  const widgetBox = useRef<HTMLDivElement | null>(null);
  const initData = miniAppInitData();

  useEffect(() => {
    if (!authLoading && isAuthenticated) window.location.replace(redirect);
  }, [authLoading, isAuthenticated, redirect]);

  useEffect(() => {
    restFetch("/settings/public", { timeoutMs: 8000 })
      .then((r: any) => {
        const u = String(r?.telegramBot ?? r?.botUsername ?? "").replace(/^@/, "").trim();
        if (u) setBotUsername(u);
      })
      .catch(() => undefined);
  }, []);

  const finish = useCallback((token: string, user: any) => {
    try {
      if (token) window.localStorage.setItem("wolf.auth.token", token);
      if (user) window.localStorage.setItem("wolf.auth.user", JSON.stringify(user));
    } catch { /* private mode */ }
    window.location.replace(redirect);
  }, [redirect]);

  // Telegram Login Widget (browser) — the global callback Telegram invokes.
  useEffect(() => {
    window.onWolfTelegramAuth = (user: TgUser) => {
      setBusy("telegram");
      setError(null);
      void (async () => {
        try {
          const r: any = await restFetch("/auth/telegram-login", { method: "POST", body: user });
          if (!r?.token) throw new Error(fa ? "پاسخ نامعتبر از سرور." : "Invalid server response.");
          finish(r.token, r.user);
        } catch (e: any) {
          setError(String(e?.message ?? (fa ? "ورود با تلگرام ناموفق بود." : "Telegram sign-in failed.")));
          setBusy("");
        }
      })();
    };
    return () => { delete window.onWolfTelegramAuth; };
  }, [fa, finish]);

  // Inject the widget script once the bot username is known.
  useEffect(() => {
    if (!showWidget || !botUsername || initData || !widgetBox.current) return;
    const box = widgetBox.current;
    box.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "14");
    script.setAttribute("data-userpic", "true");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onWolfTelegramAuth(user)");
    box.appendChild(script);
    return () => { box.innerHTML = ""; };
  }, [botUsername, initData, showWidget]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy("password");
    setError(null);
    try {
      await login(username.trim(), password);
      setBusy("");
      window.location.replace(redirect);
    } catch (err: any) {
      setError(String(err?.message ?? (fa ? "ورود ناموفق بود." : "Sign-in failed.")));
      setBusy("");
    }
  };

  const telegramMiniApp = async () => {
    setError(null);
    if (!initData) {
      window.location.assign(`https://t.me/${botUsername || "marijtradebot"}?start=login`);
      return;
    }
    setBusy("telegram");
    try {
      await loginTelegram(initData);
      setBusy("");
      window.location.replace(redirect);
    } catch (err: any) {
      setError(String(err?.message ?? (fa ? "ورود تلگرام ناموفق بود." : "Telegram sign-in failed.")));
      setBusy("");
    }
  };


  const L = {
    title: fa ? "ورود به لانه گرگ" : "Enter the den",
    sub: fa ? "با تلگرام یا حساب کاربری خود وارد شوید" : "Sign in with Telegram or your account",
    user: fa ? "نام کاربری" : "Username",
    pass: fa ? "رمز عبور" : "Password",
    enter: fa ? "ورود" : "Sign in",
    tg: fa ? "ادامه با تلگرام" : "Continue with Telegram",
    tgHint: fa ? "در مرورگر با ویجت رسمی تلگرام؛ داخل ربات با دکمهٔ مینی‌اپ" : "Official Telegram widget in a browser; Mini App inside the bot",
    or: fa ? "یا با حساب کاربری" : "or use your account",
    secure: fa ? "نشست رمزنگاری‌شده · قابل ابطال از پنل" : "Encrypted session · revocable from your panel",
  };

  return (
    <div className="lz lz-auth">
      <div className="lz-wrap lz-auth-top">
        <Link to="/" className="lz-brand">
          <img src={logo} alt="Trading Wolf AI" width={36} height={36} />
          <div>
            <b>Trading Wolf <span className="lz-gold">AI</span></b>
            <span>{fa ? "موتور معاملاتی هوشمند" : "Smart trading engine"}</span>
          </div>
        </Link>
        <div className="lz-row" style={{ gap: 6 }}>
          <WolfThemeToggle />
          <LangToggle />
        </div>
      </div>

      <main className="lz-wrap lz-auth-main">
        <section className="lz-auth-aside">
          <span className="lz-eyebrow">{fa ? "لانهٔ گرگ" : "The den"}</span>
          <h1 style={{ fontSize: "clamp(26px, 3.6vw, 40px)" }}>
            {fa ? <>داده شکار می‌کند، <span className="lz-gold">نه احساس</span></> : <>Data hunts, <span className="lz-gold">not emotion</span></>}
          </h1>
          <p className="lz-lead">
            {fa
              ? "پنل شما یک نگاه زنده به موتور است: پوزیشن‌ها با فاصله تا حد ضرر و هدف، سود خالص به تومان، ژورنال معاملات و گزارش‌های خودکار."
              : "Your panel is a live view of the engine: positions with distance to stop and target, net P&L in toman, a trade journal and automated reports."}
          </p>
          <ul className="lz-auth-list">
            {[
              fa ? "۲۳ استراتژی با رأی‌گیری و وزن‌دهی واقعی" : "23 strategies with real weighting",
              fa ? "هزینهٔ کامل (کارمزد ۰.۲۵٪ هر طرف) در سود لحاظ می‌شود" : "Full costs (0.25% per side) priced into P&L",
              fa ? "گزارش خودکار در کانال تلگرام و پنل" : "Automated reports in the channel and panel",
            ].map((x) => (
              <li key={x}><ShieldCheck size={15} className="lz-gold" style={{ flex: "none", marginTop: 2 }} /> {x}</li>
            ))}
          </ul>
        </section>

        <section className="lz-card lz-auth-card">
          <h2>{L.title}</h2>
          <p style={{ marginTop: 6 }}>{L.sub}</p>

          {!initData && (
            <div style={{ marginTop: 16 }}>
              {showWidget ? (
                <div ref={widgetBox} style={{ display: "grid", placeItems: "center", minHeight: 52 }} />
              ) : (
                <button type="button" onClick={() => setShowWidget(true)} className="lz-btn" style={{ width: "100%" }}>
                  <Send size={15} /> {L.tg}
                </button>
              )}
              <p className="lz-auth-note" style={{ textAlign: "center", marginTop: 8 }}>
                {showWidget ? (fa ? "اگر ویجت نمایش داده نشد، از رمز عبور استفاده کنید." : "If the widget does not appear, use your password.") : L.tgHint}
              </p>
            </div>
          )}

          <div className="lz-divider">{L.or}</div>

          <form onSubmit={submit}>
            <div className="lz-field">
              <label htmlFor="lz-user">{L.user}</label>
              <div style={{ position: "relative" }}>
                <User size={15} style={{ position: "absolute", insetInlineStart: 12, top: 15, color: "var(--lz-muted)" }} />
                <input
                  id="lz-user"
                  className="lz-input"
                  style={{ paddingInlineStart: 34 }}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={fa ? "نام کاربری یا ایمیل" : "username or email"}
                />
              </div>
            </div>
            <div className="lz-field">
              <label htmlFor="lz-pass">{L.pass}</label>
              <div style={{ position: "relative" }}>
                <LockKeyhole size={15} style={{ position: "absolute", insetInlineStart: 12, top: 15, color: "var(--lz-muted)" }} />
                <input
                  id="lz-pass"
                  className="lz-input"
                  style={{ paddingInlineStart: 34 }}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="lz-alert" role="alert">
                <AlertTriangle size={15} style={{ flex: "none", marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="lz-btn lz-btn-primary"
              style={{ width: "100%", marginTop: 14 }}
              disabled={busy !== "" || !username.trim() || !password}
            >
              {busy === "password" ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
              {L.enter}
            </button>
          </form>

          <p className="lz-auth-note" style={{ marginTop: 12, textAlign: "center" }}>{L.secure}</p>
          <div className="lz-divider" />
          <div className="lz-between" style={{ fontSize: 12 }}>
            <Link to="/" className="lz-tiny" style={{ textDecoration: "none" }}>{fa ? "بازگشت به صفحهٔ اصلی" : "Back to home"}</Link>
            <Link to="/admin/login" className="lz-tiny" style={{ textDecoration: "none" }}>{fa ? "ورود مدیران" : "Admin sign-in"}</Link>
          </div>
        </section>
      </main>

      <footer className="lz-wrap">
        <div className="lz-foot">
          <span>© {new Date().getFullYear()} Trading Wolf AI</span>
          <span className="lz-tiny">{fa ? "معامله ریسک دارد؛ سرمایه‌ای که توان از دست دادنش را ندارید وارد نکنید." : "Trading carries risk; never risk capital you cannot afford to lose."}</span>
        </div>
      </footer>
    </div>
  );
}
