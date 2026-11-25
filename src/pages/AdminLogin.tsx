import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { AlertTriangle, ArrowRight, Loader2, LockKeyhole, ShieldCheck, User } from "lucide-react";
import logo from "@/assets/logo.svg";
import { restFetch } from "@/lib/backend";
import { useWolfAuth } from "@/hooks/use-wolf-auth";
import { LangToggle, useI18n } from "@/lib/i18n";
import { WolfThemeToggle } from "@/components/wolf/ThemeToggle";

/**
 * Dedicated admin sign-in. The user dashboard has no route into the console:
 * an admin has to authenticate here, and RequireAdmin additionally checks the
 * per-tab gate, so a plain user session can never open /admin.
 */
export default function AdminLogin() {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const { login, logout } = useWolfAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      // The auth hook persists the session under `wolf.token`; reading another
      // key sent an empty bearer, /auth/me answered 401 and the console looked
      // broken although the password had been accepted.
      const readToken = () => window.localStorage.getItem("wolf.token") ?? "";
      let token = readToken();
      if (!token) {
        await new Promise((r) => setTimeout(r, 250));
        token = readToken();
      }
      const me: any = await restFetch("/auth/me", { token, timeoutMs: 10_000 });
      const user = me?.user ?? me ?? {};
      const isAdmin = user?.isAdmin === true || user?.is_admin === true || String(user?.role ?? "").toLowerCase() === "admin";
      if (!isAdmin) {
        await logout().catch(() => undefined);
        throw new Error(fa ? "این حساب دسترسی مدیریت ندارد." : "This account has no admin access.");
      }
      window.sessionStorage.setItem("wolf.admin.gate", "1");
      nav("/admin", { replace: true });
    } catch (err: any) {
      setError(String(err?.message ?? (fa ? "ورود ناموفق بود." : "Sign-in failed.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lz lz-auth">
      <div className="lz-wrap lz-auth-top">
        <Link to="/" className="lz-brand">
          <img src={logo} alt="Trading Wolf AI" width={36} height={36} />
          <div>
            <b>Trading Wolf <span className="lz-gold">AI</span></b>
            <span>{fa ? "کنسول مدیریت" : "Admin console"}</span>
          </div>
        </Link>
        <div className="lz-row" style={{ gap: 6 }}>
          <WolfThemeToggle />
          <LangToggle />
        </div>
      </div>

      <main className="lz-wrap lz-auth-main">
        <section className="lz-auth-aside">
          <span className="lz-eyebrow">{fa ? "دسترسی محدود" : "Restricted"}</span>
          <h1 style={{ fontSize: "clamp(26px, 3.4vw, 38px)" }}>
            {fa ? <>کنسول ادمین، <span className="lz-gold">جدا از پنل کاربری</span></> : <>Admin console, <span className="lz-gold">separate from the user panel</span></>}
          </h1>
          <p className="lz-lead">
            {fa
              ? "ورود تنها با حساب مدیر انجام می‌شود و نشست این تب جدا از نشست کاربری است. برای خروج، از دکمهٔ خروج کنسول استفاده کنید."
              : "Only an admin account can sign in here, and this tab keeps its own session separate from the user panel."}
          </p>
          <ul className="lz-auth-list">
            {[
              fa ? "موتور، پوزیشن‌ها و ریسک در یک نگاه" : "Engine, positions and risk at a glance",
              fa ? "گزارش خطاها و لاگ‌های عملیات" : "Error centre and operation logs",
              fa ? "تنظیمات صرافی، بازارها و کاربران" : "Exchange, market and user settings",
            ].map((x) => (
              <li key={x}><ShieldCheck size={15} className="lz-gold" style={{ flex: "none", marginTop: 2 }} /> {x}</li>
            ))}
          </ul>
        </section>

        <section className="lz-card lz-auth-card">
          <div className="lz-row" style={{ gap: 10, marginBottom: 10 }}>
            <span className="lz-feature-ico"><LockKeyhole size={18} /></span>
            <div>
              <h2 style={{ fontSize: 20 }}>{fa ? "ورود مدیر" : "Admin sign-in"}</h2>
              <p className="lz-tiny">{fa ? "فقط حساب‌های با نقش admin" : "Only accounts with the admin role"}</p>
            </div>
          </div>

          <form onSubmit={submit}>
            <div className="lz-field">
              <label htmlFor="adm-user">{fa ? "نام کاربری" : "Username"}</label>
              <div style={{ position: "relative" }}>
                <User size={15} style={{ position: "absolute", insetInlineStart: 12, top: 15, color: "var(--lz-muted)" }} />
                <input id="adm-user" className="lz-input" style={{ paddingInlineStart: 34 }} autoComplete="username"
                  value={username} onChange={(e) => setUsername(e.target.value)} placeholder={fa ? "نام کاربری مدیر" : "admin username"} />
              </div>
            </div>
            <div className="lz-field">
              <label htmlFor="adm-pass">{fa ? "رمز عبور" : "Password"}</label>
              <div style={{ position: "relative" }}>
                <LockKeyhole size={15} style={{ position: "absolute", insetInlineStart: 12, top: 15, color: "var(--lz-muted)" }} />
                <input id="adm-pass" className="lz-input" style={{ paddingInlineStart: 34 }} type="password"
                  autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
            </div>

            {error && (
              <div className="lz-alert" role="alert">
                <AlertTriangle size={15} style={{ flex: "none", marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="lz-btn lz-btn-primary" style={{ width: "100%", marginTop: 14 }}
              disabled={busy || !username.trim() || !password}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
              {fa ? "ورود به کنسول" : "Open console"}
            </button>
          </form>

          <div className="lz-divider" />
          <div className="lz-between" style={{ fontSize: 12 }}>
            <Link to="/auth" className="lz-tiny" style={{ textDecoration: "none" }}>{fa ? "ورود کاربران" : "User sign-in"}</Link>
            <Link to="/" className="lz-tiny" style={{ textDecoration: "none" }}>{fa ? "صفحهٔ اصلی" : "Home"}</Link>
          </div>
        </section>
      </main>

      <footer className="lz-wrap">
        <div className="lz-foot">
          <span>© {new Date().getFullYear()} Trading Wolf AI</span>
          <span className="lz-tiny">{fa ? "نشست مدیر برای این تب جداگانه ثبت می‌شود." : "The admin session is scoped to this tab."}</span>
        </div>
      </footer>
    </div>
  );
}
