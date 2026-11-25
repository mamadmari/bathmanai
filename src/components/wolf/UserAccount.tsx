import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine, ArrowUpFromLine, BadgeCheck, Banknote, Bell, Check, Coins, Copy, Crown, Gift,
  Headphones, LifeBuoy, Loader2, Lock, LogOut, Moon, RefreshCw, Send, ShieldCheck, Sun, Timer, Wallet,
} from "lucide-react";
import { restFetch } from "@/lib/backend";
import { WOLF_THEME_LABEL, type WolfTheme } from "@/lib/wolf-theme";

/**
 * Account side of the member panel: wallet operations, deposit / unfreeze
 * requests, VIP, Wolf coins, referral, support tickets, notifications and the
 * profile. Rewritten on the `.ua` layer so it matches the rest of the console —
 * the legacy `.w-*` AccountZone is no longer embedded here.
 */

type Sub = "wallet" | "requests" | "vip" | "coins" | "referral" | "support" | "notifications" | "profile";
type Note = { ok: boolean; text: string };

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const N = (v: unknown, d = 2): string =>
  v !== null && v !== "" && Number.isFinite(Number(v))
    ? Number(v).toLocaleString("en-US", { maximumFractionDigits: d })
    : "—";
const T = (v: unknown): string => {
  const n = num(v);
  return n > 0 ? Math.round(n).toLocaleString("en-US") : "—";
};
const joined = (v: unknown): string => {
  const n = num(v);
  return n > 0 ? new Date(n).toLocaleDateString("en-GB") : "—";
};
const when = (v: unknown): string => {
  const n = num(v);
  return n > 0 ? new Date(n).toLocaleString("en-GB", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
};
const STATUS: Record<string, { fa: string; en: string; tone: string }> = {
  pending: { fa: "در انتظار تأیید", en: "pending", tone: "" },
  processing: { fa: "در حال پردازش", en: "processing", tone: "" },
  confirmed: { fa: "تأییدشده", en: "confirmed", tone: "ua-chip-up" },
  paid: { fa: "پرداخت‌شده", en: "paid", tone: "ua-chip-up" },
  rejected: { fa: "ردشده", en: "rejected", tone: "ua-chip-down" },
  failed: { fa: "ناموفق", en: "failed", tone: "ua-chip-down" },
  cancelled: { fa: "لغوشده", en: "cancelled", tone: "ua-chip-down" },
  open: { fa: "باز", en: "open", tone: "ua-chip-view" },
  answered: { fa: "پاسخ داده‌شده", en: "answered", tone: "ua-chip-up" },
  closed: { fa: "بسته", en: "closed", tone: "" },
};
const stChip = (v: unknown, fa: boolean): { text: string; tone: string } => {
  const s = STATUS[String(v ?? "pending")];
  return s ? { text: fa ? s.fa : s.en, tone: s.tone } : { text: String(v ?? "—"), tone: "" };
};
const TYPE_FA: Record<string, string> = {
  deposit: "واریز", withdrawal: "برداشت", unfreeze: "آزادسازی سرمایه",
  credit: "افزایش", debit: "کاهش", swap: "مبادله", fee: "کارمزد", reward: "پاداش",
};
const typeText = (v: unknown, fa: boolean): string => {
  const k = String(v ?? "");
  if (!fa) return k || "—";
  return TYPE_FA[k] ?? (k || "—");
};

export function UserAccount({ token, user, logout, isAdmin, theme, toggleTheme, fa, rate: rateProp }: {
  token: string | null;
  user: any;
  logout: () => Promise<void> | void;
  isAdmin: boolean;
  theme: WolfTheme;
  toggleTheme: () => void;
  fa: boolean;
  /** Live USDT→toman rate from the panel; falls back to coins.settings when absent. */
  rate?: number;
}) {
  const [sub, setSub] = useState<Sub>("wallet");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<Note | null>(null);

  const [wallet, setWallet] = useState<any>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [share, setShare] = useState<any>(null);
  const [vipInfo, setVipInfo] = useState<any>(null);
  const [packages, setPackages] = useState<any[]>([]);
  const [coins, setCoins] = useState<any>(null);
  const [shop, setShop] = useState<any[]>([]);
  const [coinHist, setCoinHist] = useState<any[]>([]);
  const [referral, setReferral] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [baleInfo, setBaleInfo] = useState<any>(null);

  const [depAmt, setDepAmt] = useState("");
  const [depNet, setDepNet] = useState("TRC20");
  const [depTx, setDepTx] = useState("");
  const [wdAmt, setWdAmt] = useState("");
  const [wdAddr, setWdAddr] = useState("");
  const [baleAmt, setBaleAmt] = useState("1000000");
  const [baleOrder, setBaleOrder] = useState<{ orderId: string; amount: number; link: string; status: string } | null>(null);
  const [tomanAmt, setTomanAmt] = useState("");
  const [tomanRef, setTomanRef] = useState("");
  const [freeAmt, setFreeAmt] = useState("");
  const [vipSel, setVipSel] = useState<any>(null);
  const [vipCap, setVipCap] = useState("");
  const [discount, setDiscount] = useState("");
  const [swapToman, setSwapToman] = useState("");
  const [swapUsdt, setSwapUsdt] = useState("");
  const [voucher, setVoucher] = useState("");
  const [coinBuy, setCoinBuy] = useState("100");
  const [refApply, setRefApply] = useState("");
  const [tSubject, setTSubject] = useState("");
  const [tText, setTText] = useState("");
  const [tPriority, setTPriority] = useState("normal");
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<any[]>([]);
  const [reply, setReply] = useState("");
  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState<Note | null>(null);
  const [quiz, setQuiz] = useState<any>(null);
  const [quizRes, setQuizRes] = useState<any>(null);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    const g = async (p: string) => {
      try { return await restFetch<any>(p, { token, timeoutMs: 15_000 }); } catch { return null; }
    };
    const [w, acc, vp, c, ch, cp, rf, tk, nt, bi] = await Promise.all([
      g("/wallet"), g("/account"), g("/vip/packages"), g("/coins"), g("/coins/history"),
      g("/coins/packages"), g("/referral"), g("/support/tickets"), g("/notifications"), g("/bale/info"),
    ]);
    setWallet(w?.wallet ?? null);
    setTxns(Array.isArray(w?.transactions) ? w.transactions : []);
    setAddresses(Array.isArray(w?.depositAddresses) ? w.depositAddresses : []);
    setProfile(acc?.profile ?? null);
    setVipInfo(acc?.vip ?? null);
    setShare(acc?.share ?? null);
    setPackages(Array.isArray(vp?.packages) ? vp.packages : []);
    setCoins(c ?? null);
    setCoinHist(Array.isArray(ch?.transactions) ? ch.transactions : []);
    setShop(Array.isArray(cp?.packages) ? cp.packages : []);
    setReferral(rf ?? null);
    setTickets(Array.isArray(tk?.tickets) ? tk.tickets : []);
    setNotifs(Array.isArray(nt?.notifications) ? nt.notifications : []);
    setBaleInfo(bi ?? null);
    setLoading(false);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const post = async (label: string, path: string, body: Record<string, unknown>, okText = ""): Promise<any> => {
    if (!token || busy) return null;
    setBusy(label);
    setNote(null);
    try {
      const r = await restFetch<any>(path, { method: "POST", token, body, timeoutMs: 45_000 });
      if (r && r.error) {
        setNote({ ok: false, text: String(r.error) });
        return r;
      }
      if (okText) setNote({ ok: true, text: okText });
      await load();
      return r;
    } catch (e: any) {
      setNote({ ok: false, text: String(e?.message ?? (fa ? "درخواست انجام نشد." : "Request failed.")) });
      return null;
    } finally {
      setBusy("");
    }
  };

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1600);
    } catch { /* clipboard blocked */ }
  };

  // Bale top-up: poll the order until the gateway confirms.
  useEffect(() => {
    if (!baleOrder?.orderId || baleOrder.status !== "pending" || !token) return;
    const id = window.setInterval(async () => {
      try {
        const r = await restFetch<any>(`/wallet/bale/orders/${baleOrder.orderId}`, { token, timeoutMs: 12_000 });
        const st = String(r?.order?.status ?? "pending");
        if (st === "pending") return;
        setBaleOrder((b) => (b ? { ...b, status: st } : b));
        setNote({
          ok: st === "paid",
          text: st === "paid"
            ? (fa ? "پرداخت موفق بود و کیف پول تومانی شارژ شد." : "Paid — the toman wallet was credited.")
            : st === "paid_test"
              ? (fa ? "در حالت آزمایشی ثبت شد؛ موجودی شارژ نشد." : "Recorded in test mode; the wallet was not credited.")
              : (fa ? `وضعیت سفارش: ${st}` : `Order status: ${st}`),
        });
        void load();
      } catch { /* keep polling */ }
    }, 4_000);
    return () => window.clearInterval(id);
  }, [baleOrder?.orderId, baleOrder?.status, token, fa, load]);

  const openTicket = async (id: string) => {
    setOpenId(id);
    setThread([]);
    try {
      const r = await restFetch<any>(`/support/tickets/${id}`, { token, timeoutMs: 15_000 });
      setThread(Array.isArray(r?.messages) ? r.messages : []);
    } catch { setThread([]); }
  };

  const savePassword = async () => {
    if (pwNew.trim().length < 8) {
      setPwMsg({ ok: false, text: fa ? "رمز جدید باید حداقل ۸ کاراکتر باشد." : "Password must be at least 8 characters." });
      return;
    }
    if (!token || busy) return;
    setBusy("password");
    setPwMsg(null);
    try {
      await restFetch("/auth/set-password", { method: "POST", token, body: { old: pwOld, new: pwNew }, timeoutMs: 15_000 });
      setPwMsg({ ok: true, text: fa ? "رمز ذخیره شد؛ از این پس با نام کاربری تلگرام و همین رمز وارد شوید." : "Saved — sign in with your Telegram username and this password." });
      setPwOld("");
      setPwNew("");
      await load();
    } catch (e: any) {
      setPwMsg({ ok: false, text: String(e?.message ?? (fa ? "ذخیرهٔ رمز ناموفق بود." : "Could not save the password.")) });
    } finally {
      setBusy("");
    }
  };

  const nets = Array.from(new Set(addresses.filter((a) => String(a.asset).toUpperCase() === "USDT").map((a) => String(a.network))));
  const cfg = coins?.settings ?? {};
  const tomanCard = String(cfg.tomanCard ?? "");
  const rate = num(rateProp) || num(cfg.usdtTomanRate);
  const perCoin = num(cfg.tomanPerCoin) || 5000;
  const pendingTx = txns.filter((t) => String(t.status) === "pending");
  const unread = notifs.filter((n) => !n.seen).length;
  const myWallet = wallet ?? {};
  const tgVerified = num(profile?.withdrawTgVerifiedAt) > 0;

  const msgBox = note ? <div className={`ua-msg ${note.ok ? "ok" : "err"}`} role="status">{note.text}</div> : null;

  const field = (label: string, extra: React.ReactNode) => (
    <label className="ua-field"><span>{label}</span>{extra}</label>
  );

  const netOptions = (nets.length ? nets : ["TRC20"]).map((n) => <option key={n} value={n}>{n}</option>);

  const renderWalletDeposit = () => (
    <div className="ua-card">
      <div className="ua-card-head"><h2>{fa ? "واریز تتر" : "Deposit USDT"}</h2>
        <span className="ua-card-sub">{String(myWallet.network ?? depNet ?? "TRC20")}</span></div>
      {String(myWallet.depositAddress ?? "") ? (
        <div className="ua-pos-cell" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <code dir="ltr" style={{ fontSize: 12.5, wordBreak: "break-all" }}>{String(myWallet.depositAddress)}</code>
          <button className="ua-btn ua-btn-sm ua-btn-ghost" onClick={() => void copy("dep", String(myWallet.depositAddress))}>
            <Copy size={12} /> {copied === "dep" ? (fa ? "کپی شد" : "copied") : fa ? "کپی" : "copy"}
          </button>
        </div>
      ) : <div className="ua-tiny">{fa ? "آدرس واریز هنوز تعریف نشده؛ با پشتیبانی تماس بگیرید." : "No deposit address configured yet."}</div>}
      <div className="ua-divider" />
      <div className="ua-row">
        {field(fa ? "مبلغ (تتر)" : "amount (USDT)", <input className="ua-input ua-num" inputMode="decimal" value={depAmt} onChange={(e) => setDepAmt(e.target.value)} placeholder="50" />)}
        {field(fa ? "شبکه" : "network", <select className="ua-input" value={depNet} onChange={(e) => setDepNet(e.target.value)}>{netOptions}</select>)}
      </div>
      <div className="ua-row" style={{ marginTop: 10 }}>
        {field(fa ? "هش تراکنش (اختیاری)" : "tx hash (optional)", <input className="ua-input" dir="ltr" value={depTx} onChange={(e) => setDepTx(e.target.value)} placeholder="0x…" />)}
        <button className="ua-btn ua-btn-primary" disabled={busy !== "" || !depAmt}
          onClick={() => void post("dep", "/wallet/deposit", { amount: depAmt, network: depNet, txid: depTx }, fa ? "درخواست واریز ثبت شد؛ بعد از تأیید تیم به موجودی اضافه می‌شود." : "Deposit request submitted.").then(() => { setDepAmt(""); setDepTx(""); })}>
          {busy === "dep" ? <Loader2 className="animate-spin" size={13} /> : <ArrowDownToLine size={13} />} {fa ? "ثبت واریز" : "submit deposit"}
        </button>
      </div>
      <div className="ua-note" style={{ marginTop: 10 }}>
        {fa ? "فقط شبکهٔ اعلام‌شده؛ واریز روی شبکهٔ دیگر قابل بازیابی نیست و تأیید واریز توسط تیم انجام می‌شود." : "Use the listed network only — deposits on other networks cannot be recovered."}
      </div>
    </div>
  );

  const renderWalletWithdraw = () => (
    <div className="ua-card">
      <div className="ua-card-head"><h2>{fa ? "برداشت تتر" : "Withdraw USDT"}</h2>
        <span className="ua-card-sub">{fa ? "حداقل ۱۰ تتر" : "min 10 USDT"}</span></div>
      {!tgVerified && (
        <div className="ua-note" style={{ marginBottom: 10 }}>
          {fa ? "برای برداشت اول باید تلگرام همین حساب تأیید شود؛ از ربات تلگرام وارد شوید و تأیید برداشت را بزنید." : "Telegram verification is required before withdrawing."}
        </div>
      )}
      <div className="ua-row">
        {field(fa ? "مبلغ (تتر)" : "amount (USDT)", <input className="ua-input ua-num" inputMode="decimal" value={wdAmt} onChange={(e) => setWdAmt(e.target.value)} placeholder="20" />)}
        {field(fa ? "شبکه" : "network", <select className="ua-input" value={depNet} onChange={(e) => setDepNet(e.target.value)}>{netOptions}</select>)}
      </div>
      <div className="ua-row" style={{ marginTop: 10 }}>
        {field(fa ? "آدرس مقصد" : "destination address", <input className="ua-input" dir="ltr" value={wdAddr} onChange={(e) => setWdAddr(e.target.value)} placeholder="T…" />)}
        <button className="ua-btn ua-btn-gold" disabled={busy !== "" || !wdAmt || !wdAddr || !tgVerified}
          onClick={() => void post("wd", "/wallet/withdraw", { amount: wdAmt, address: wdAddr, network: depNet, idempotencyKey: `w-${Date.now()}` }, fa ? "درخواست برداشت ثبت شد؛ بعد از تأیید تیم ارسال می‌شود." : "Withdrawal request submitted.").then(() => { setWdAmt(""); setWdAddr(""); })}>
          {busy === "wd" ? <Loader2 className="animate-spin" size={13} /> : <ArrowUpFromLine size={13} />} {fa ? "ثبت برداشت" : "request withdrawal"}
        </button>
      </div>
      <div className="ua-divider" />
      <div className="ua-fee-row"><span className="ua-muted">{fa ? "قابل برداشت" : "withdrawable"}</span><b className="ua-num">{N(myWallet.balance, 4)} USDT</b></div>
      <div className="ua-fee-row"><span className="ua-muted">{fa ? "درگیر در موتور" : "locked in engine"}</span><b className="ua-num">{N(myWallet.frozen, 4)} USDT</b></div>
    </div>
  );

  const walletBalances = () => (
    <div className="ua-grid ua-g4">
      <div className="ua-kpi"><div className="ua-kpi-l"><Wallet size={13} />{fa ? "تتر کیف پول" : "wallet USDT"}</div>
        <div className="ua-kpi-v ua-num">{N(myWallet.balance, 4)}</div>
        <div className="ua-kpi-s ua-num">{rate > 0 ? `${T(num(myWallet.balance) * rate)} تومان` : ""}</div></div>
      <div className="ua-kpi"><div className="ua-kpi-l"><Banknote size={13} />{fa ? "تومان" : "toman"}</div>
        <div className="ua-kpi-v ua-num">{T(coins?.toman)}</div>
        <div className="ua-kpi-s">{fa ? "شارژ با بله یا کارت" : "Bale or card top-up"}</div></div>
      <div className="ua-kpi"><div className="ua-kpi-l"><Lock size={13} />{fa ? "فریز در موتور" : "frozen in engine"}</div>
        <div className="ua-kpi-v ua-num">{N(myWallet.frozen, 4)}</div>
        <div className="ua-kpi-s">{fa ? "سهم" : "share"} {N(share?.ratio, 2)}%</div></div>
      <div className="ua-kpi"><div className="ua-kpi-l"><Coins size={13} />{fa ? "ولف‌کوین" : "wolf coins"}</div>
        <div className="ua-kpi-v ua-num">{N(coins?.wolfCoins, 0)}</div>
        <div className="ua-kpi-s">{fa ? "قابل خرج در فروشگاه" : "spendable in the shop"}</div></div>
    </div>
  );

  const renderWalletTxns = () => (
    <div className="ua-card">
      <div className="ua-card-head"><h2>{fa ? "تراکنش‌های کیف پول" : "Wallet transactions"}</h2>
        <span className="ua-card-sub">{N(txns.length, 0)}</span></div>
      {txns.length === 0 ? <div className="ua-empty"><Wallet size={18} /><span>{fa ? "تراکنشی ثبت نشده." : "No transactions yet."}</span></div> : (
        <div className="ua-table-wrap">
          <table className="ua-table">
            <thead><tr>
              <th>{fa ? "نوع" : "type"}</th><th>{fa ? "دارایی" : "asset"}</th><th>{fa ? "مبلغ" : "amount"}</th>
              <th>{fa ? "وضعیت" : "status"}</th><th>{fa ? "توضیح" : "note"}</th><th>{fa ? "زمان" : "when"}</th>
            </tr></thead>
            <tbody>
              {txns.slice(0, 20).map((t) => {
                const st = stChip(t.status, fa);
                const amt = num(t.amount);
                return (
                  <tr key={String(t.id)}>
                    <td>{typeText(t.type, fa)}</td>
                    <td dir="ltr">{String(t.asset ?? "—")}</td>
                    <td className={`ua-num ${amt >= 0 ? "ua-up" : "ua-down"}`}>{amt >= 0 ? "+" : ""}{N(amt, 4)}</td>
                    <td><span className={`ua-chip ${st.tone}`}>{st.text}</span></td>
                    <td className="ua-tiny" style={{ maxWidth: 220 }}>{String(t.note ?? "—")}</td>
                    <td className="ua-num ua-tiny">{when(t.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderWallet = () => (
    <>
      {walletBalances()}
      {msgBox}
      <div className="ua-grid ua-g2">{renderWalletDeposit()}{renderWalletWithdraw()}</div>
      {renderWalletTxns()}
    </>
  );

  const renderRequests = () => (
    <>
      {msgBox}
      <div className="ua-grid ua-g2">
        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "شارژ کیف پول تومانی با بله" : "Toman top-up via Bale"}</h2>
            <span className="ua-card-sub">{String(baleInfo?.botUsername ? `@${baleInfo.botUsername}` : "bale")}</span></div>
          <div className="ua-tiny" style={{ marginBottom: 10 }}>
            {fa ? "مبلغ را وارد کنید، لینک پرداخت ساخته می‌شود؛ پرداخت را در پیام‌رسان بله کامل کنید و همین صفحه به‌طور خودکار تأیید می‌شود." : "Create a payment link, pay in Bale, and this page confirms it automatically."}
          </div>
          <div className="ua-row">
            {field(fa ? "مبلغ (تومان)" : "amount (toman)", <input className="ua-input ua-num" inputMode="numeric" value={baleAmt} onChange={(e) => setBaleAmt(e.target.value.replace(/[^0-9]/g, ""))} placeholder="1000000" />)}
            <button className="ua-btn ua-btn-primary" disabled={busy !== "" || !baleAmt}
              onClick={() => void post("bale", "/wallet/bale/intent", { amount: Number(baleAmt) }, "").then((r) => {
                if (r?.order) setBaleOrder({ orderId: String(r.order.id ?? ""), amount: Number(r.order.amount ?? baleAmt), link: String(r.link ?? ""), status: "pending" });
              })}>
              {busy === "bale" ? <Loader2 className="animate-spin" size={13} /> : <Banknote size={13} />} {fa ? "ساخت لینک پرداخت" : "create payment link"}
            </button>
          </div>
          {baleOrder && (
            <div className="ua-note" style={{ marginTop: 10 }}>
              <div>{fa ? "مبلغ" : "amount"}: <b className="ua-num">{T(baleOrder.amount)} تومان</b> · {stChip(baleOrder.status, fa).text}</div>
              {baleOrder.link && (
                <a className="ua-btn ua-btn-gold ua-btn-sm" style={{ marginTop: 8 }} href={baleOrder.link} target="_blank" rel="noreferrer">
                  <Send size={12} /> {fa ? "پرداخت در بله" : "pay in Bale"}
                </a>
              )}
            </div>
          )}
          {num(baleInfo?.minTopup) > 0 && (
            <div className="ua-tiny" style={{ marginTop: 8 }}>
              {fa ? "حداقل" : "min"} {T(baleInfo?.minTopup)} · {fa ? "حداکثر" : "max"} {T(baleInfo?.maxTopup)} تومان
            </div>
          )}
        </div>

        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "واریز کارت‌به‌کارت" : "Card transfer"}</h2>
            <span className="ua-card-sub">{fa ? "تأیید توسط تیم" : "team approved"}</span></div>
          {tomanCard ? (
            <div className="ua-pos-cell" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <b className="ua-num" dir="ltr">{tomanCard}</b>
              <span className="ua-tiny">{String(cfg.tomanCardHolder ?? "")}</span>
              <button className="ua-btn ua-btn-sm ua-btn-ghost" onClick={() => void copy("card", tomanCard)}>
                <Copy size={12} /> {copied === "card" ? (fa ? "کپی شد" : "copied") : fa ? "کپی" : "copy"}
              </button>
            </div>
          ) : <div className="ua-tiny">{fa ? "شمارهٔ کارت اعلام نشده؛ از پشتیبانی بپرسید." : "No card configured yet."}</div>}
          <div className="ua-divider" />
          <div className="ua-row">
            {field(fa ? "مبلغ (تومان)" : "amount (toman)", <input className="ua-input ua-num" inputMode="numeric" value={tomanAmt} onChange={(e) => setTomanAmt(e.target.value.replace(/[^0-9]/g, ""))} placeholder="5000000" />)}
            {field(fa ? "کد پیگیری" : "reference", <input className="ua-input" dir="ltr" value={tomanRef} onChange={(e) => setTomanRef(e.target.value)} placeholder="123456" />)}
          </div>
          <button className="ua-btn ua-btn-gold" style={{ marginTop: 10 }} disabled={busy !== "" || !tomanAmt}
            onClick={() => void post("toman", "/wallet/deposit-toman", { amount: Number(tomanAmt), ref: tomanRef }, fa ? "درخواست واریز تومانی ثبت شد؛ پس از تأیید تیم موجودی شارژ می‌شود." : "Toman deposit request submitted.").then(() => { setTomanAmt(""); setTomanRef(""); })}>
            {busy === "toman" ? <Loader2 className="animate-spin" size={13} /> : <ArrowDownToLine size={13} />} {fa ? "ثبت درخواست واریز" : "submit deposit request"}
          </button>
        </div>
      </div>

      <div className="ua-grid ua-g2">
        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "آزادسازی سرمایه" : "Release capital"}</h2>
            <span className="ua-card-sub">{fa ? "حداقل چرخش ۷ روز" : "min 7 days"}</span></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "سرمایهٔ فریزشده" : "frozen"}</span><b className="ua-num">{N(myWallet.frozen, 4)} USDT</b></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "درگیر در معاملات باز" : "in open trades"}</span><b className="ua-num">{N(share?.engaged ?? 0, 4)} USDT</b></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "قابل درخواست" : "requestable"}</span><b className="ua-num">{N(Math.max(0, num(myWallet.frozen) - num(share?.engaged ?? 0)), 4)} USDT</b></div>
          <div className="ua-row" style={{ marginTop: 10 }}>
            {field(fa ? "مبلغ درخواست" : "amount", <input className="ua-input ua-num" inputMode="decimal" value={freeAmt} onChange={(e) => setFreeAmt(e.target.value)} placeholder={N(Math.max(0, num(myWallet.frozen) - num(share?.engaged ?? 0)), 2)} />)}
            <button className="ua-btn ua-btn-gold" disabled={busy !== "" || !freeAmt}
              onClick={() => void post("free", "/wallet/unfreeze", { amount: freeAmt }, fa ? "درخواست آزادسازی ثبت شد؛ از بخش تراکنش‌های کیف پول پیگیری کنید." : "Release request submitted.").then(() => setFreeAmt(""))}>
              {busy === "free" ? <Loader2 className="animate-spin" size={13} /> : <Lock size={13} />} {fa ? "ثبت آزادسازی" : "request release"}
            </button>
          </div>
          <div className="ua-note" style={{ marginTop: 10 }}>
            {fa ? "سرمایه باید حداقل ۷ روز در موتور بچرخد و بخشی که در معاملهٔ باز درگیر است آزاد نمی‌شود." : "Capital must stay in the engine for at least 7 days; capital in open trades is not released."}
          </div>
        </div>

        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "درخواست‌های در انتظار" : "Pending requests"}</h2>
            <span className="ua-card-sub">{N(pendingTx.length, 0)}</span></div>
          {pendingTx.length === 0 ? <div className="ua-empty"><Timer size={18} /><span>{fa ? "درخواست بازی ندارید." : "No pending request."}</span></div> : (
            <div className="ua-list">
              {pendingTx.slice(0, 8).map((t) => (
                <div className="ua-li" key={String(t.id)}>
                  <span className="ua-li-main"><Timer size={14} className="ua-muted" /><span>{typeText(t.type, fa)}</span></span>
                  <small className="ua-li-sub ua-num">{when(t.created_at)}</small>
                  <b className={`ua-num ${num(t.amount) >= 0 ? "ua-up" : "ua-down"}`}>{N(t.amount, 4)} {String(t.asset ?? "")}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );

  const renderVip = () => (
    <>
      {msgBox}
      <div className="ua-grid ua-g2">
        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "وضعیت اشتراک" : "Membership"}</h2>
            <span className={`ua-chip ${vipInfo?.active ? "ua-chip-up" : ""}`}>{vipInfo?.active ? (fa ? "فعال" : "active") : fa ? "غیرفعال" : "inactive"}</span></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "پکیج" : "package"}</span><b dir="ltr">{String(vipInfo?.packageKey ?? user?.vipPackage ?? "—")}</b></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "انقضا" : "expires"}</span><b className="ua-num">{vipInfo?.expiresAt ? joined(vipInfo.expiresAt) : "—"}</b></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "روز باقی‌مانده" : "days left"}</span><b className="ua-num">{N(vipInfo?.daysLeft, 0)}</b></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "کارمزد پلتفرم شما" : "your platform fee"}</span><b className="ua-num ua-down">{N(share?.commissionPct, 2)}%</b></div>
          <div className="ua-divider" />
          <button className="ua-btn ua-btn-primary" disabled={busy !== "" || Boolean(vipInfo?.active)}
            onClick={() => void post("trial", "/vip/trial", {}, fa ? "دورهٔ آزمایشی ۲۱ روزه فعال شد." : "21-day trial activated.")}>
            {busy === "trial" ? <Loader2 className="animate-spin" size={13} /> : <Gift size={13} />} {fa ? "فعال‌سازی دورهٔ آزمایشی ۲۱ روزه" : "start 21-day trial"}
          </button>
          <div className="ua-row" style={{ marginTop: 10 }}>
            {field(fa ? "کد تخفیف" : "discount code", <input className="ua-input" dir="ltr" value={discount} onChange={(e) => setDiscount(e.target.value.toUpperCase())} placeholder="WOLF2025" />)}
            <button className="ua-btn ua-btn-gold" disabled={busy !== "" || !discount}
              onClick={() => void post("disc", "/vip/discount", { code: discount }, fa ? "کد اعمال شد: ۷ روز VIP و ۱۰۰ سکه." : "Code applied.").then(() => setDiscount(""))}>
              {busy === "disc" ? <Loader2 className="animate-spin" size={13} /> : <BadgeCheck size={13} />} {fa ? "اعمال کد" : "apply"}
            </button>
          </div>
        </div>

        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "پکیج‌های VIP" : "VIP packages"}</h2>
            <span className="ua-card-sub">{N(packages.length, 0)}</span></div>
          {packages.length === 0 ? <div className="ua-empty"><Crown size={18} /><span>{fa ? "پکیجی فعال نیست." : "No package available."}</span></div> : (
            <div className="ua-list">
              {packages.map((p) => (
                <div className="ua-li" key={String(p.key)}>
                  <span className="ua-li-main">
                    <Crown size={15} className="ua-chip-view" />
                    <span>
                      <b>{String(p.name ?? p.title ?? p.key)}</b>
                      <small className="ua-li-sub ua-num">{fa ? "سرمایه" : "capital"} {N(p.min_capital, 0)}–{N(p.max_capital, 0)} USDT</small>
                    </span>
                  </span>
                  <span className="ua-chip ua-chip-view ua-num">{N(p.price, 2)} USDT</span>
                  <button className="ua-btn ua-btn-sm" onClick={() => { setVipSel(p); setVipCap(String(num(p.min_capital))); }}>
                    {fa ? "انتخاب" : "select"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {vipSel && (
        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? `درخواست پکیج ${String(vipSel.name ?? vipSel.key)}` : `Request ${String(vipSel.name ?? vipSel.key)}`}</h2>
            <button className="ua-iconbtn" style={{ marginInlineStart: "auto", width: 30, height: 30 }} onClick={() => setVipSel(null)} aria-label="close">×</button></div>
          <div className="ua-row">
            {field(fa ? "سرمایهٔ مورد نظر (تتر)" : "capital (USDT)", <input className="ua-input ua-num" inputMode="decimal" value={vipCap} onChange={(e) => setVipCap(e.target.value)} />)}
            <button className="ua-btn ua-btn-gold" disabled={busy !== "" || !vipCap}
              onClick={() => void post("vipreq", "/vip/request", { packageKey: String(vipSel.key), capital: Number(vipCap) }, fa ? "درخواست VIP ثبت شد؛ کارشناسان تماس می‌گیرند." : "VIP request submitted.")}>
              {busy === "vipreq" ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />} {fa ? "ثبت درخواست" : "submit request"}
            </button>
          </div>
          <div className="ua-tiny" style={{ marginTop: 8 }}>
            {fa ? `بازهٔ مجاز ${N(vipSel.min_capital, 0)} تا ${N(vipSel.max_capital, 0)} تتر است.` : `Allowed range ${N(vipSel.min_capital, 0)}–${N(vipSel.max_capital, 0)} USDT.`}
          </div>
        </div>
      )}
    </>
  );

  const renderCoinsBalances = () => (
    <div className="ua-grid ua-g3">
      <div className="ua-kpi"><div className="ua-kpi-l"><Coins size={13} />{fa ? "ولف‌کوین" : "wolf coins"}</div>
        <div className="ua-kpi-v ua-num">{N(coins?.wolfCoins, 0)}</div>
        <div className="ua-kpi-s ua-num">{T(num(coins?.wolfCoins) * perCoin)} تومان</div></div>
      <div className="ua-kpi"><div className="ua-kpi-l"><Banknote size={13} />{fa ? "تومان" : "toman"}</div>
        <div className="ua-kpi-v ua-num">{T(coins?.toman)}</div>
        <div className="ua-kpi-s ua-num">1 {fa ? "سکه" : "coin"} = {T(perCoin)} T</div></div>
      <div className="ua-kpi"><div className="ua-kpi-l"><Gift size={13} />{fa ? "جایزهٔ پروفایل" : "profile reward"}</div>
        <div className="ua-kpi-v">{coins?.profileRewardClaimed ? (fa ? "دریافت شد" : "claimed") : (fa ? "دریافت نشده" : "available")}</div>
        <div className="ua-kpi-s">{fa ? "تکمیل نام و تلفن" : "complete name and phone"}</div></div>
    </div>
  );

  const renderCoinsShop = () => (
    <>
      <div className="ua-grid ua-g2">
        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "خرید سکه" : "Buy coins"}</h2>
            <span className="ua-card-sub ua-num">1 = {T(perCoin)} T</span></div>
          <div className="ua-row">
            {field(fa ? "تعداد سکه" : "coins", <input className="ua-input ua-num" inputMode="numeric" value={coinBuy} onChange={(e) => setCoinBuy(e.target.value.replace(/[^0-9]/g, ""))} />)}
            <button className="ua-btn ua-btn-primary" disabled={busy !== "" || !coinBuy}
              onClick={() => void post("buyT", "/coins/buy", { coins: Number(coinBuy) }, fa ? "سکه‌ها با تومان خریداری شد." : "Coins purchased with toman.")}>
              {busy === "buyT" ? <Loader2 className="animate-spin" size={13} /> : <Coins size={13} />} {fa ? "خرید با تومان" : "pay with toman"}
            </button>
            <button className="ua-btn ua-btn-gold" disabled={busy !== "" || !coinBuy}
              onClick={() => void post("buyU", "/coins/buy-usdt", { coins: Number(coinBuy) }, fa ? "سکه‌ها با تتر خریداری شد." : "Coins purchased with USDT.")}>
              {busy === "buyU" ? <Loader2 className="animate-spin" size={13} /> : <Coins size={13} />} {fa ? "خرید با تتر" : "pay with USDT"}
            </button>
          </div>
          <div className="ua-tiny" style={{ marginTop: 8 }}>
            {fa ? `هزینه: ${T(Number(coinBuy) * perCoin)} تومان` : `cost: ${T(Number(coinBuy) * perCoin)} toman`}
            {rate > 0 ? ` · ${N((Number(coinBuy) * perCoin) / rate, 2)} USDT` : ""}
          </div>
          <div className="ua-divider" />
          <div className="ua-row">
            {field(fa ? "کد ووچر" : "voucher code", <input className="ua-input" dir="ltr" value={voucher} onChange={(e) => setVoucher(e.target.value.toUpperCase())} placeholder="WOLF-XXXX" />)}
            <button className="ua-btn" disabled={busy !== "" || !voucher}
              onClick={() => void post("voucher", "/coins/voucher/redeem", { code: voucher }, fa ? "ووچر ثبت شد و سکه‌ها اضافه شدند." : "Voucher redeemed.").then(() => setVoucher(""))}>
              {busy === "voucher" ? <Loader2 className="animate-spin" size={13} /> : <Gift size={13} />} {fa ? "ثبت ووچر" : "redeem"}
            </button>
            <button className="ua-btn ua-btn-ghost" disabled={busy !== "" || Boolean(coins?.profileRewardClaimed)}
              onClick={() => void post("reward", "/coins/claim-reward", {}, fa ? "جایزهٔ پروفایل دریافت شد." : "Profile reward claimed.")}>
              {busy === "reward" ? <Loader2 className="animate-spin" size={13} /> : <BadgeCheck size={13} />} {fa ? "جایزهٔ پروفایل" : "profile reward"}
            </button>
          </div>
        </div>

        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "بسته‌های سکه" : "Coin packages"}</h2>
            <span className="ua-card-sub">{N(shop.length, 0)}</span></div>
          {shop.length === 0 ? <div className="ua-empty"><Coins size={18} /><span>{fa ? "بسته‌ای تعریف نشده." : "No package defined."}</span></div> : (
            <div className="ua-mk">
              {shop.map((p, i) => (
                <div className="ua-mk-item" key={`${String(p.id ?? i)}`}>
                  <span className="ua-mk-top"><Coins size={14} />{N(p.coins ?? p.amount, 0)}</span>
                  <span className="ua-mk-price ua-num">{T(p.toman ?? p.priceToman ?? p.price)} تومان</span>
                  <button className="ua-btn ua-btn-sm ua-btn-gold" disabled={busy !== ""}
                    onClick={() => void post(`pkg${i}`, "/coins/package", { index: i }, fa ? "بسته خریداری شد." : "Package purchased.")}>
                    {busy === `pkg${i}` ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />} {fa ? "خرید" : "buy"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );

  const startQuiz = async () => {
    setQuizRes(null);
    const r = await post("quiz", "/coins/quiz/start", {}, "");
    if (r && !r.error) setQuiz(r);
  };

  const answerQuiz = async (i: number) => {
    if (!quiz) return;
    const r = await post("quiz", "/coins/quiz/resolve", { id: quiz.id, chosen: i }, "");
    if (r && !r.error) setQuizRes(r);
    setQuiz(null);
  };

  const renderCoinsGames = () => (
    <div className="ua-grid ua-g2">
      <div className="ua-card">
        <div className="ua-card-head"><h2>{fa ? "مبادله تومان و تتر" : "Toman / USDT swap"}</h2>
          <span className="ua-card-sub ua-num">1 USDT = {T(rate)} T</span></div>
        <div className="ua-row">
          {field(fa ? "تومان → تتر (تومان)" : "toman → USDT (toman)", <input className="ua-input ua-num" inputMode="numeric" value={swapToman} onChange={(e) => setSwapToman(e.target.value.replace(/[^0-9]/g, ""))} placeholder="1000000" />)}
          <button className="ua-btn ua-btn-primary" disabled={busy !== "" || !swapToman}
            onClick={() => void post("swapT", "/coins/swap/toman-to-usdt", { tomanAmount: Number(swapToman) }, fa ? "مبادله انجام شد." : "Swap done.").then(() => setSwapToman(""))}>
            {busy === "swapT" ? <Loader2 className="animate-spin" size={13} /> : <RefreshCw size={13} />} {fa ? "مبادله" : "swap"}
          </button>
        </div>
        <div className="ua-row" style={{ marginTop: 10 }}>
          {field(fa ? "تتر → تومان (تتر)" : "USDT → toman (USDT)", <input className="ua-input ua-num" inputMode="decimal" value={swapUsdt} onChange={(e) => setSwapUsdt(e.target.value)} placeholder="10" />)}
          <button className="ua-btn ua-btn-gold" disabled={busy !== "" || !swapUsdt}
            onClick={() => void post("swapU", "/coins/swap/usdt-to-toman", { usdtAmount: Number(swapUsdt) }, fa ? "مبادله انجام شد." : "Swap done.").then(() => setSwapUsdt(""))}>
            {busy === "swapU" ? <Loader2 className="animate-spin" size={13} /> : <RefreshCw size={13} />} {fa ? "مبادله" : "swap"}
          </button>
        </div>
        <div className="ua-tiny" style={{ marginTop: 8 }}>
          {fa ? "حداقل ۱۰٬۰۰۰ تومان یا ۰.۱ تتر؛ نرخ از سامانهٔ نرخ زندهٔ پلتفرم خوانده می‌شود." : "Minimum 10,000 toman or 0.1 USDT; the live platform rate is used."}
        </div>
      </div>

      <div className="ua-card">
        <div className="ua-card-head"><h2>{fa ? "کوییز آموزشی" : "Learning quiz"}</h2>
          <span className="ua-chip ua-chip-view">{fa ? "پاداش سکه" : "coin reward"}</span></div>
        {quiz ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.9, marginBottom: 10 }}>{fa ? String(quiz.question) : String(quiz.questionEn ?? quiz.question)}</div>
            <div className="ua-list">
              {(Array.isArray(quiz.options) ? quiz.options : []).map((o: string, i: number) => (
                <button key={o} className="ua-quiz-opt" disabled={busy !== ""} onClick={() => void answerQuiz(i)}>{o}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            {quizRes && (
              <div className={`ua-msg ${quizRes.won ? "ok" : "err"}`} style={{ marginBottom: 10 }}>
                {quizRes.won
                  ? (fa ? `پاسخ درست بود؛ ${N(quizRes.reward, 0)} سکه اضافه شد.` : `Correct — ${N(quizRes.reward, 0)} coins added.`)
                  : (fa ? "پاسخ نادرست بود؛ دوباره امتحان کنید." : "Wrong answer — try another question.")}
              </div>
            )}
            <div className="ua-tiny" style={{ marginBottom: 10 }}>
              {fa ? "هر سؤال یک بار قابل پاسخ است و پاسخ درست سکهٔ ولف می‌دهد." : "Each question can be answered once; a correct answer pays wolf coins."}
            </div>
            <button className="ua-btn ua-btn-primary" disabled={busy !== ""} onClick={() => void startQuiz()}>
              {busy === "quiz" ? <Loader2 className="animate-spin" size={13} /> : <Gift size={13} />} {fa ? "شروع کوییز" : "start quiz"}
            </button>
          </>
        )}
      </div>
    </div>
  );

  const renderCoinsHistory = () => (
    <div className="ua-card">
      <div className="ua-card-head"><h2>{fa ? "تاریخچهٔ سکه و تومان" : "Coin & toman ledger"}</h2>
        <span className="ua-card-sub">{N(coinHist.length, 0)}</span></div>
      {coinHist.length === 0 ? <div className="ua-empty"><Coins size={18} /><span>{fa ? "تراکنشی ثبت نشده." : "No ledger rows."}</span></div> : (
        <div className="ua-table-wrap">
          <table className="ua-table">
            <thead><tr>
              <th>{fa ? "ارز" : "currency"}</th><th>{fa ? "تغییر" : "delta"}</th><th>{fa ? "مانده" : "after"}</th>
              <th>{fa ? "دلیل" : "reason"}</th><th>{fa ? "مرجع" : "ref"}</th><th>{fa ? "زمان" : "when"}</th>
            </tr></thead>
            <tbody>
              {coinHist.slice(0, 25).map((r) => (
                <tr key={String(r.id)}>
                  <td><span className="ua-chip" dir="ltr">{String(r.currency ?? "—")}</span></td>
                  <td className={`ua-num ${num(r.delta) >= 0 ? "ua-up" : "ua-down"}`}>{num(r.delta) >= 0 ? "+" : ""}{N(r.delta, 2)}</td>
                  <td className="ua-num">{N(r.balance_after, 2)}</td>
                  <td className="ua-tiny" dir="ltr">{String(r.reason ?? "—")}</td>
                  <td className="ua-tiny" dir="ltr">{String(r.ref ?? "—")}</td>
                  <td className="ua-num ua-tiny">{when(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderReferral = () => (
    <>
      {msgBox}
      <div className="ua-grid ua-g2">
        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "لینک معرفی من" : "My referral link"}</h2>
            <span className="ua-chip ua-chip-view ua-num">{N(referral?.referred, 0)} {fa ? "دعوت‌شده" : "invited"}</span></div>
          <div className="ua-row">
            {field(fa ? "کد معرف" : "code", (
              <div style={{ display: "flex", gap: 8 }}>
                <input className="ua-input ua-num" dir="ltr" readOnly value={String(referral?.code ?? "—")} />
                <button className="ua-btn ua-btn-sm" onClick={() => void copy("code", String(referral?.code ?? ""))}>
                  <Copy size={12} /> {copied === "code" ? (fa ? "کپی شد" : "copied") : fa ? "کپی" : "copy"}
                </button>
              </div>
            ))}
          </div>
          <div className="ua-row" style={{ marginTop: 10 }}>
            {field(fa ? "لینک دعوت" : "invite link", (
              <div style={{ display: "flex", gap: 8 }}>
                <input className="ua-input" dir="ltr" readOnly value={String(referral?.link ?? "—")} />
                <button className="ua-btn ua-btn-sm" onClick={() => void copy("link", String(referral?.link ?? ""))}>
                  <Copy size={12} /> {copied === "link" ? (fa ? "کپی شد" : "copied") : fa ? "کپی" : "copy"}
                </button>
              </div>
            ))}
          </div>
          <div className="ua-divider" />
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "پاداش معرفی" : "referral reward"}</span>
            <b className={referral?.rewardEnabled ? "ua-up" : ""}>{referral?.rewardEnabled ? (fa ? "فعال" : "enabled") : fa ? "غیرفعال" : "disabled"}</b></div>
          <div className="ua-tiny" style={{ marginTop: 8 }}>
            {fa ? "هر کاربری که با لینک شما ثبت‌نام کند در آمار شما شمرده می‌شود." : "Sign-ups through your link are counted here."}
          </div>
        </div>

        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "وارد کردن کد معرف" : "Apply a referral code"}</h2></div>
          <div className="ua-row">
            {field(fa ? "کد دعوت‌کننده" : "referrer code", <input className="ua-input" dir="ltr" value={refApply} onChange={(e) => setRefApply(e.target.value)} placeholder="WOLF-XXXX" />)}
            <button className="ua-btn ua-btn-gold" disabled={busy !== "" || !refApply}
              onClick={() => void post("ref", "/referral/apply", { code: refApply }, fa ? "کد معرف ثبت شد." : "Referral code applied.").then(() => setRefApply(""))}>
              {busy === "ref" ? <Loader2 className="animate-spin" size={13} /> : <Gift size={13} />} {fa ? "ثبت کد" : "apply"}
            </button>
          </div>
          <div className="ua-note" style={{ marginTop: 10 }}>
            {fa ? "کد معرف فقط یک بار قابل ثبت است و کد خودتان پذیرفته نمی‌شود." : "A referral code can be applied once and cannot be your own code."}
          </div>
        </div>
      </div>
    </>
  );

  const renderSupport = () => (
    <>
      {msgBox}
      <div className="ua-grid ua-g2">
        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "تیکت جدید" : "New ticket"}</h2>
            <span className="ua-card-sub">{fa ? "پاسخ تیم در همین صفحه" : "answers land here"}</span></div>
          <div className="ua-row">
            {field(fa ? "موضوع" : "subject", <input className="ua-input" value={tSubject} onChange={(e) => setTSubject(e.target.value)} placeholder={fa ? "مثلاً تأیید واریز" : "e.g. deposit approval"} />)}
            {field(fa ? "اولویت" : "priority", (
              <select className="ua-input" value={tPriority} onChange={(e) => setTPriority(e.target.value)}>
                <option value="low">{fa ? "کم" : "low"}</option>
                <option value="normal">{fa ? "عادی" : "normal"}</option>
                <option value="high">{fa ? "زیاد" : "high"}</option>
              </select>
            ))}
          </div>
          <div className="ua-row" style={{ marginTop: 10 }}>
            {field(fa ? "متن پیام" : "message", <textarea className="ua-input" style={{ minHeight: 96, padding: 10 }} value={tText} onChange={(e) => setTText(e.target.value)} />)}
          </div>
          <button className="ua-btn ua-btn-primary" style={{ marginTop: 10 }} disabled={busy !== "" || !tSubject || !tText}
            onClick={() => void post("ticket", "/support/tickets", { subject: tSubject, text: tText, priority: tPriority }, fa ? "تیکت ثبت شد؛ پاسخ در همین بخش نمایش داده می‌شود." : "Ticket created.").then(() => { setTSubject(""); setTText(""); })}>
            {busy === "ticket" ? <Loader2 className="animate-spin" size={13} /> : <Headphones size={13} />} {fa ? "ارسال تیکت" : "send ticket"}
          </button>
        </div>

        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "تیکت‌های من" : "My tickets"}</h2>
            <span className="ua-card-sub">{N(tickets.length, 0)}</span></div>
          {tickets.length === 0 ? <div className="ua-empty"><LifeBuoy size={18} /><span>{fa ? "تیکتی ثبت نکرده‌اید." : "No ticket yet."}</span></div> : (
            <div className="ua-list">
              {tickets.map((t) => {
                const st = stChip(t.status, fa);
                return (
                  <div className="ua-li" key={String(t.id)}>
                    <span className="ua-li-main">
                      <LifeBuoy size={14} className="ua-muted" />
                      <span>
                        <b>{String(t.subject ?? "—")}</b>
                        <small className="ua-li-sub ua-num">{when(t.last_activity ?? t.created_at)}</small>
                      </span>
                    </span>
                    <span className={`ua-chip ${st.tone}`}>{st.text}</span>
                    <button className="ua-btn ua-btn-sm ua-btn-ghost" onClick={() => void openTicket(String(t.id))}>
                      {openId === String(t.id) ? (fa ? "بستن" : "close") : fa ? "گفتگو" : "open"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {openId && (
        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "گفتگوی تیکت" : "Ticket conversation"}</h2>
            <button className="ua-btn ua-btn-sm ua-btn-ghost" style={{ marginInlineStart: "auto" }} onClick={() => { setOpenId(null); setThread([]); }}>
              {fa ? "بستن" : "close"}
            </button></div>
          <div className="ua-thread">
            {thread.length === 0 ? <div className="ua-empty"><LifeBuoy size={18} /><span>{fa ? "پیامی نیست." : "No message."}</span></div> : (
              thread.map((m) => (
                <div key={String(m.id)} className={`ua-bubble ${m.from_admin ? "" : "me"}`}>
                  <div className="ua-tiny" style={{ marginBottom: 3 }}>
                    {m.from_admin ? (fa ? "پشتیبانی" : "support") : (fa ? "شما" : "you")} · {when(m.created_at)}
                  </div>
                  {String(m.text ?? "")}
                </div>
              ))
            )}
          </div>
          <div className="ua-row" style={{ marginTop: 10 }}>
            {field(fa ? "پاسخ شما" : "your reply", <input className="ua-input" value={reply} onChange={(e) => setReply(e.target.value)} />)}
            <button className="ua-btn ua-btn-gold" disabled={busy !== "" || !reply}
              onClick={() => void post("reply", `/support/tickets/${openId}/messages`, { text: reply }, fa ? "پیام ارسال شد." : "Message sent.").then(() => { setReply(""); void openTicket(openId); })}>
              {busy === "reply" ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />} {fa ? "ارسال" : "send"}
            </button>
          </div>
        </div>
      )}
    </>
  );

  const renderNotifications = () => (
    <>
      {msgBox}
      <div className="ua-card">
        <div className="ua-card-head"><h2>{fa ? "اعلان‌های من" : "My notifications"}</h2>
          <span className="ua-card-sub">{N(unread, 0)} {fa ? "خوانده‌نشده" : "unread"}</span>
          <button className="ua-btn ua-btn-sm ua-btn-ghost" style={{ marginInlineStart: "auto" }} disabled={busy !== "" || unread === 0}
            onClick={() => void post("readAll", "/notifications/read", { id: "all" }, fa ? "همه خوانده شدند." : "All marked as read.")}>
            {busy === "readAll" ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />} {fa ? "همه خوانده شد" : "mark all read"}
          </button>
        </div>
        {notifs.length === 0 ? <div className="ua-empty"><Bell size={18} /><span>{fa ? "اعلانی ندارید." : "No notification."}</span></div> : (
          <div className="ua-list">
            {notifs.slice(0, 30).map((n) => (
              <div className="ua-li" key={String(n.id)}>
                <span className="ua-li-main">
                  <Bell size={14} className={n.seen ? "ua-muted" : "ua-chip-view"} />
                  <span>
                    <b>{String(n.title ?? "—")}</b>
                    <small className="ua-li-sub">{String(n.body ?? "").slice(0, 140)}</small>
                  </span>
                </span>
                <small className="ua-li-sub ua-num">{when(n.created_at)}</small>
                {n.seen ? <span className="ua-chip">{fa ? "خوانده" : "read"}</span> : (
                  <button className="ua-btn ua-btn-sm" onClick={() => void post("read", "/notifications/read", { id: String(n.id) }, "")}>
                    {fa ? "خوانده شد" : "mark read"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const renderProfile = () => (
    <>
      {pwMsg && <div className={`ua-msg ${pwMsg.ok ? "ok" : "err"}`} role="status">{pwMsg.text}</div>}
      <div className="ua-grid ua-g2">
        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "پروفایل" : "Profile"}</h2>
            <span className={`ua-chip ${profile?.isVip ? "ua-chip-view" : ""}`}>{profile?.isVip ? "VIP" : String(profile?.role ?? "user")}</span></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "نام" : "name"}</span><b>{String(profile?.name || "—")}</b></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "نام کاربری" : "username"}</span><b dir="ltr">{String(profile?.username ?? "—")}</b></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "آیدی تلگرام" : "telegram id"}</span><b className="ua-num" dir="ltr">{String(profile?.tgId ?? "—")}</b></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "شمارهٔ تماس" : "phone"}</span><b className="ua-num" dir="ltr">{String(profile?.phone || "—")}</b></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "تاریخ عضویت" : "joined"}</span><b className="ua-num">{joined(profile?.registeredAt)}</b></div>
          <div className="ua-fee-row"><span className="ua-muted">{fa ? "اشتراک" : "vip"}</span>
            <b>{vipInfo?.active ? `${fa ? "فعال تا" : "until"} ${joined(vipInfo?.expiresAt)}` : (fa ? "عادی" : "standard")}</b></div>
        </div>

        <div className="ua-card">
          <div className="ua-card-head"><h2>{fa ? "نمایش و دسترسی" : "Appearance & access"}</h2></div>
          <div className="ua-list">
            <div className="ua-li">
              <span className="ua-li-main"><Sun size={14} className="ua-muted" /><span>{fa ? "تم" : "theme"}</span></span>
              <button className="ua-btn ua-btn-sm" onClick={toggleTheme}>
                {theme === "light" ? <Moon size={12} /> : <Sun size={12} />} {fa ? WOLF_THEME_LABEL[theme].fa : WOLF_THEME_LABEL[theme].en}
              </button>
            </div>
            <div className="ua-li">
              <span className="ua-li-main"><Bell size={14} className="ua-muted" /><span>{fa ? "اعلان‌ها" : "notifications"}</span></span>
              <span className="ua-chip ua-num">{N(unread, 0)} {fa ? "خوانده‌نشده" : "unread"}</span>
              <button className="ua-btn ua-btn-sm ua-btn-ghost" onClick={() => setSub("notifications")}>{fa ? "دیدن" : "view"}</button>
            </div>
            <div className="ua-li">
              <span className="ua-li-main"><Send size={14} className="ua-muted" /><span>{fa ? "ورود با تلگرام" : "telegram sign-in"}</span></span>
              <b className={profile?.tgId ? "ua-up" : "ua-down"}>{profile?.tgId ? (fa ? "متصل" : "linked") : (fa ? "متصل نیست" : "not linked")}</b>
            </div>
            {isAdmin && (
              <div className="ua-li">
                <span className="ua-li-main"><ShieldCheck size={14} className="ua-muted" /><span>{fa ? "دسترسی مدیریت" : "admin access"}</span></span>
                <a className="ua-btn ua-btn-sm ua-btn-ghost" href="/admin">{fa ? "کنسول مدیریت" : "admin console"}</a>
              </div>
            )}
            <div className="ua-li">
              <span className="ua-li-main"><LogOut size={14} className="ua-muted" /><span>{fa ? "خروج از حساب" : "sign out"}</span></span>
              <button className="ua-btn ua-btn-sm ua-btn-ghost" onClick={() => void logout()}>{fa ? "خروج" : "sign out"}</button>
            </div>
          </div>
        </div>
      </div>

      <div className="ua-card">
        <div className="ua-card-head"><h2>{fa ? "رمز عبور ورود از سایت" : "Website password"}</h2>
          <span className="ua-card-sub" dir="ltr">{String(profile?.username ? `@${profile.username}` : "")}</span></div>
        <div className="ua-row">
          {field(fa ? "رمز فعلی (اگر دارید)" : "current password", <input className="ua-input" type="password" autoComplete="current-password" value={pwOld} onChange={(e) => setPwOld(e.target.value)} />)}
          {field(fa ? "رمز جدید (حداقل ۸ کاراکتر)" : "new password (min 8)", <input className="ua-input" type="password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />)}
          <button className="ua-btn ua-btn-gold" disabled={busy !== "" || pwNew.length < 8} onClick={() => void savePassword()}>
            {busy === "password" ? <Loader2 className="animate-spin" size={13} /> : <ShieldCheck size={13} />} {fa ? "ذخیرهٔ رمز" : "save password"}
          </button>
        </div>
        <div className="ua-tiny" style={{ marginTop: 8 }}>
          {fa ? "با تعیین رمز می‌توانید مستقیم از صفحهٔ ورود با نام کاربری تلگرام وارد شوید، بدون نیاز به تلگرام." : "Set a password to sign in with your Telegram username."}
        </div>
      </div>
    </>
  );

  const SUBTABS: Array<{ key: Sub; icon: React.ReactNode; fa: string; en: string; badge?: number }> = [
    { key: "wallet", icon: <Wallet size={13} />, fa: "کیف پول", en: "Wallet" },
    { key: "requests", icon: <Banknote size={13} />, fa: "واریز و آزادسازی", en: "Deposits", badge: pendingTx.length },
    { key: "vip", icon: <Crown size={13} />, fa: "اشتراک VIP", en: "VIP" },
    { key: "coins", icon: <Coins size={13} />, fa: "سکه و بازی", en: "Coins" },
    { key: "referral", icon: <Gift size={13} />, fa: "معرفی دوستان", en: "Referral" },
    { key: "support", icon: <Headphones size={13} />, fa: "پشتیبانی", en: "Support", badge: tickets.filter((t) => String(t.status) !== "closed").length },
    { key: "notifications", icon: <Bell size={13} />, fa: "اعلان‌ها", en: "Alerts", badge: unread },
    { key: "profile", icon: <BadgeCheck size={13} />, fa: "پروفایل و امنیت", en: "Profile" },
  ];

  return (
    <>
      <div className="ua-subtabs" role="tablist">
        {SUBTABS.map((t) => (
          <button key={t.key} role="tab" aria-current={sub === t.key ? "page" : undefined}
            onClick={() => { setSub(t.key); setOpenId(null); }}>
            {t.icon}{fa ? t.fa : t.en}
            {t.badge ? <span className="ua-nav-badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {loading ? <div className="ua-card"><div className="ua-empty"><Loader2 className="animate-spin" size={18} /><span>{fa ? "در حال خواندن حساب…" : "loading account…"}</span></div></div> : sub === "wallet" ? renderWallet()
        : sub === "requests" ? renderRequests()
        : sub === "vip" ? renderVip()
        : sub === "coins" ? (<>{renderCoinsBalances()}{msgBox}{renderCoinsShop()}{renderCoinsGames()}{renderCoinsHistory()}</>)
        : sub === "referral" ? renderReferral()
        : sub === "support" ? renderSupport()
        : sub === "notifications" ? renderNotifications()
        : renderProfile()}
    </>
  );
}

