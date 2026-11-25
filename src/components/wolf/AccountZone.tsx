import { CoinsShop, ReferralApply, SettingsZone, ThreeWallets } from "@/components/wolf/UserExtra";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowUpFromLine, BadgeCheck, Banknote, Bell, CalendarDays, Coins, Copy, CreditCard, Crown, ExternalLink, Headphones, LifeBuoy, Loader2, LogOut, RefreshCw, Share2, ShieldCheck, Wallet } from "lucide-react";
import { SupportTicketModal } from "@/components/SupportTicketModal";
import { VipTrialCard } from "@/components/VipTrialCard";
import { ApiFacts, ApiForm, ApiTable } from "@/components/wolf/ApiPanel";
import { restFetch } from "@/lib/backend";
import { WOLF_THEME_LABEL, type WolfTheme } from "@/lib/wolf-theme";
import { useI18n } from "@/lib/i18n";

type Tab = "wallet" | "vip" | "support" | "profile" | "activity" | "referral" | "coins" | "requests" | "settings";

const N = (v: unknown, d = 2) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d }) : "—";
};

export function AccountZone({
  token,
  user,
  logout,
  isAdmin,
  theme,
  toggleTheme,
}: {
  token: string | null;
  user: any;
  logout: () => Promise<void> | void;
  isAdmin: boolean;
  theme: WolfTheme;
  toggleTheme: () => void;
}) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [tab, setTab] = useState<Tab>("wallet");
  const [wallet, setWallet] = useState<any>(null);
  const [txn, setTxn] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [openTicket, setOpenTicket] = useState(false);
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("TRC20");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [topupAmount, setTopupAmount] = useState("100000");
  const [baleInfo, setBaleInfo] = useState<any>(null);
  const [bale, setBale] = useState<{ orderId: string; amount: number; link: string; status: string } | null>(null);
  const [irt, setIrt] = useState<number | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const safe = async (p: string) => {
      try { return await restFetch(p, { token, timeoutMs: 12_000 }); } catch { return null; }
    };
    const [w, t, p, acc] = await Promise.all([safe("/wallet"), safe("/support/tickets"), safe("/vip/packages"), safe("/account")]);
    setProfile((acc as any)?.profile ?? null);
    setWallet((w as any)?.wallet ?? null);
    setTxn(Array.isArray((w as any)?.transactions) ? (w as any).transactions : []);
    setAddresses(Array.isArray((w as any)?.depositAddresses) ? (w as any).depositAddresses : []);
    setTickets(Array.isArray((t as any)?.tickets) ? (t as any).tickets : []);
    setPackages(Array.isArray((p as any)?.packages) ? (p as any).packages : []);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const savePassword = async () => {
    if (pwNew.trim().length < 8) {
      setPwMsg({ ok: false, text: fa ? "رمز جدید باید حداقل ۸ کاراکتر باشد." : "Password must be at least 8 characters." });
      return;
    }
    setBusy("password");
    setPwMsg(null);
    try {
      await restFetch("/auth/set-password", { method: "POST", token, body: { old: pwOld, new: pwNew }, timeoutMs: 15_000 });
      setPwMsg({ ok: true, text: fa ? "رمز ذخیره شد. حالا با نام کاربری تلگرام + این رمز از صفحه ورود وارد شوید." : "Password saved — sign in with your Telegram username and this password." });
      setPwOld("");
      setPwNew("");
      void load();
    } catch (e: any) {
      setPwMsg({ ok: false, text: String(e?.message ?? (fa ? "ذخیره رمز ناموفق بود." : "Could not save the password.")) });
    } finally {
      setBusy("");
    }
  };

  const doDeposit = async () => {
    if (!amount) return;
    setBusy("deposit");
    setMsg(null);
    try {
      const r: any = await restFetch("/wallet/deposit", { method: "POST", token, body: { amount, network }, timeoutMs: 15_000 });
      setMsg({ ok: true, text: String(r?.message ?? (fa ? "درخواست واریز ثبت شد." : "Deposit request submitted.")) });
      setAmount("");
      void load();
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? (fa ? "ثبت واریز ناموفق بود." : "Deposit failed.")) });
    } finally {
      setBusy("");
    }
  };

  const doWithdraw = async () => {
    if (!amount || !address) return;
    setBusy("withdraw");
    setMsg(null);
    try {
      const r: any = await restFetch("/wallet/withdraw", { method: "POST", token, body: { amount, address, network, idempotencyKey: `w-${Date.now()}` }, timeoutMs: 15_000 });
      setMsg({ ok: true, text: String(r?.message ?? (fa ? "درخواست برداشت ثبت شد." : "Withdrawal request submitted.")) });
      setAmount("");
      setAddress("");
      void load();
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? (fa ? "ثبت برداشت ناموفق بود." : "Withdrawal failed.")) });
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    restFetch("/bale/info", { timeoutMs: 10_000 }).then((r) => setBaleInfo(r)).catch(() => undefined);
  }, []);

  const createBaleIntent = async () => {
    const amount = Number(String(topupAmount).replace(/[^0-9]/g, ""));
    if (!amount) return;
    setBusy("bale");
    setMsg(null);
    try {
      const r: any = await restFetch("/wallet/bale/intent", { method: "POST", token, body: { amount }, timeoutMs: 20_000 });
      setBale({ orderId: String(r?.order?.id ?? ""), amount: Number(r?.order?.amount ?? amount), link: String(r?.link ?? ""), status: "pending" });
      setMsg({ ok: true, text: fa ? "لینک پرداخت ساخته شد؛ در بله پرداخت را کامل کنید." : "Payment link created — finish it in Bale." });
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? (fa ? "ساخت سفارش ناموفق بود." : "Could not create the order.")) });
    } finally {
      setBusy("");
    }
  };

  // Poll the order until Bale confirms (or 3 minutes pass).
  useEffect(() => {
    if (!bale?.orderId || bale.status !== "pending") return;
    let tries = 0;
    const id = window.setInterval(async () => {
      tries += 1;
      try {
        const r: any = await restFetch(`/wallet/bale/orders/${bale.orderId}`, { token, timeoutMs: 12_000 });
        if (Number.isFinite(Number(r?.balanceIrt))) setIrt(Number(r.balanceIrt));
        const st = String(r?.order?.status ?? "pending");
        if (st !== "pending") {
          setBale((b) => (b ? { ...b, status: st } : b));
          setMsg({
            ok: st === "paid",
            text: st === "paid"
              ? (fa ? "پرداخت موفق بود و کیف پول تومانی شارژ شد." : "Paid — toman wallet credited.")
              : st === "paid_test"
                ? (fa ? "پرداخت در حالت آزمایشی ثبت شد؛ موجودی شارژ نشد." : "Recorded in test mode; wallet not credited.")
                : (fa ? `وضعیت سفارش: ${st}` : `Order status: ${st}`),
          });
          void load();
          window.clearInterval(id);
        }
      } catch { /* keep polling */ }
      if (tries > 45) window.clearInterval(id);
    }, 4_000);
    return () => window.clearInterval(id);
  }, [bale?.orderId, bale?.status, token, fa, load]);

  const claimTrial = async () => {
    setMsg(null);
    try {
      await restFetch("/vip/trial", { method: "POST", token, body: {}, timeoutMs: 15_000 });
      setMsg({ ok: true, text: fa ? "دوره آزمایشی فعال شد." : "Trial activated." });
      void load();
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? (fa ? "فعال‌سازی ناموفق بود." : "Could not activate.")) });
    }
  };

  const applyDiscount = async (code: string) => {
    try {
      const r: any = await restFetch("/vip/discount", { method: "POST", token, body: { code }, timeoutMs: 15_000 });
      return { ok: true, message: String(r?.message ?? (fa ? "کد اعمال شد." : "Code applied.")) };
    } catch (e: any) {
      return { ok: false, message: String(e?.message ?? (fa ? "کد نامعتبر است." : "Invalid code.")) };
    }
  };

  const tabs: { key: Tab; icon: ReactNode; label: string }[] = [
    { key: "wallet", icon: <Wallet size={14} />, label: fa ? "کیف پول" : "Wallet" },
    { key: "vip", icon: <Crown size={14} />, label: fa ? "اشتراک VIP" : "VIP" },
    { key: "support", icon: <LifeBuoy size={14} />, label: fa ? "پشتیبانی" : "Support" },
    { key: "profile", icon: <BadgeCheck size={14} />, label: fa ? "پروفایل" : "Profile" },
    { key: "activity", icon: <Bell size={14} />, label: fa ? "اعلان‌ها" : "Alerts" },
    { key: "coins", icon: <Coins size={14} />, label: fa ? "سکه و مبادله" : "Coins" },
    { key: "referral", icon: <Share2 size={14} />, label: fa ? "معرفی دوستان" : "Referral" },
    { key: "requests", icon: <Banknote size={14} />, label: fa ? "درخواست‌ها" : "Requests" },
    { key: "settings", icon: <BadgeCheck size={14} />, label: fa ? "تنطیمات" : "Settings" },
  ];

  return (
    <div className="w-grid" style={{ gap: 14 }}>
      <div className="w-card w-card-pad">
        <div className="w-between" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="w-sec-title"><i />{fa ? "حساب و کیف پول" : "Account & wallet"}</div>
          <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void load()} disabled={busy !== ""}>
            <RefreshCw size={14} /> {fa ? "بروزرسانی" : "Refresh"}
          </button>
        </div>
        <div className="w-tabs" style={{ marginTop: 12 }}>
          {tabs.map((t) => (
            <button key={t.key} className={`w-tab${tab === t.key ? " is-active" : ""}`} onClick={() => setTab(t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div className="w-card w-card-pad" style={{ borderColor: msg.ok ? "rgba(53,214,138,.45)" : "rgba(255,107,107,.5)" }}>
          <span className={msg.ok ? "w-up" : "w-down"}>{msg.text}</span>
        </div>
      )}

      {tab === "settings" && (
        <div className="w-col" style={{ gap: 12 }}>
          <SettingsZone token={token} theme={theme} toggleTheme={toggleTheme} />
        </div>
      )}

      {tab === "wallet" && (
        <>
          <div className="w-grid w-g-3" style={{ gap: 14 }}>
            <div className="w-kpi">
              <div className="w-kpi-label">{fa ? "موجودی USDT" : "USDT balance"}</div>
              <div className="w-kpi-value w-num">{N(wallet?.balance, 4)}</div>
              <div className="w-kpi-foot">{fa ? "قابل برداشت" : "withdrawable"}</div>
            </div>
            <div className="w-kpi">
              <div className="w-kpi-label">{fa ? "بلوکه‌شده" : "Frozen"}</div>
              <div className="w-kpi-value w-num">{N(wallet?.frozen, 4)}</div>
              <div className="w-kpi-foot">{fa ? "مارجین پوزیشن‌ها" : "position margin"}</div>
            </div>
            <div className="w-kpi">
              <div className="w-kpi-label">{fa ? "تراکنش‌ها" : "Transactions"}</div>
              <div className="w-kpi-value w-num">{txn.length}</div>
              <div className="w-kpi-foot">{fa ? "آخرین ۵۰ مورد" : "latest 50"}</div>
            </div>
          </div>

          <div className="w-grid w-g-2" style={{ gap: 14 }}>
            <div className="w-card w-card-pad">
              <div className="w-sec"><div className="w-sec-title"><i />{fa ? "واریز USDT" : "Deposit USDT"}</div></div>
              <div className="w-row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div className="w-field" style={{ flex: 1, minWidth: 130 }}>
                  <label className="w-lbl">{fa ? "مبلغ" : "Amount"}</label>
                  <input className="w-input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50" inputMode="decimal" />
                </div>
                <div className="w-field" style={{ flex: 1, minWidth: 130 }}>
                  <label className="w-lbl">{fa ? "شبکه" : "Network"}</label>
                  <select className="w-select" value={network} onChange={(e) => setNetwork(e.target.value)}>
                    {["TRC20", "BEP20", "ERC20"].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void doDeposit()} disabled={busy !== "" || !amount}>
                  {busy === "deposit" ? <Loader2 className="animate-spin" size={14} /> : <ArrowDownToLine size={14} />} {fa ? "ثبت واریز" : "Deposit"}
                </button>
              </div>
              <div className="w-sep" style={{ margin: "14px 0" }} />
              <div className="w-tiny">{fa ? "آدرس‌های واریز:" : "Deposit addresses:"}</div>
              <div className="w-list">
                {addresses.slice(0, 4).map((a: any, i: number) => (
                  <div className="w-li" key={i}>
                    <span className="w-mono w-trunc" style={{ maxWidth: 240, fontSize: 11.5 }}>{a.address}</span>
                    <span className="w-chip">{a.asset} · {a.network}</span>
                  </div>
                ))}
                {!addresses.length && <div className="w-empty">{fa ? "آدرسی تعریف نشده." : "No address configured."}</div>}
              </div>
            </div>

            <div className="w-card w-card-pad">
              <div className="w-sec"><div className="w-sec-title"><i />{fa ? "برداشت USDT" : "Withdraw USDT"}</div></div>
              <div className="w-grid" style={{ gap: 10 }}>
                <div className="w-field">
                  <label className="w-lbl">{fa ? "مبلغ" : "Amount"}</label>
                  <input className="w-input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="20" inputMode="decimal" />
                </div>
                <div className="w-field">
                  <label className="w-lbl">{fa ? "آدرس مقصد" : "Destination address"}</label>
                  <input className="w-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="T..." />
                </div>
                <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void doWithdraw()} disabled={busy !== "" || !amount || !address}>
                  {busy === "withdraw" ? <Loader2 className="animate-spin" size={14} /> : <ArrowUpFromLine size={14} />} {fa ? "ثبت برداشت" : "Withdraw"}
                </button>
                <div className="w-tiny">
                  {fa ? "برداشت نیازمند تأیید تلگرام همین حساب است؛ در غیر این صورت سرور پیام راهنما می‌دهد." : "Withdrawals require Telegram verification of this account; the server returns a hint otherwise."}
                </div>
              </div>
            </div>
          </div>
          <ThreeWallets token={token} />
        </>
      )}



          <div className="w-card w-card-pad w-glass">
            <div className="w-sec">
              <div className="w-sec-title"><i />{fa ? "شارژ کیف پول تومانی با بله" : "Top up with Bale"}</div>
              <span className="w-chip w-chip-gold">
                <CreditCard size={12} /> {irt === null ? "—" : N(irt, 0)} {fa ? "تومان" : "IRT"}
              </span>
            </div>
            <div className="w-toolbar" style={{ marginBottom: 10 }}>
              {[50000, 100000, 200000, 500000].map((v) => (
                <button key={v} className={`w-tab${String(v) === topupAmount ? " is-active" : ""}`} onClick={() => setTopupAmount(String(v))}>
                  {v.toLocaleString("fa-IR")}
                </button>
              ))}
            </div>
            <div className="w-row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input
                className="w-input"
                style={{ maxWidth: 170 }}
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                inputMode="numeric"
                placeholder="100000"
              />
              <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void createBaleIntent()} disabled={busy !== "" || !topupAmount}>
                {busy === "bale" ? <Loader2 className="animate-spin" size={14} /> : <CreditCard size={14} />} {fa ? "پرداخت در بله" : "Pay in Bale"}
              </button>
            </div>
            <div className="w-tiny" style={{ marginTop: 8 }}>
              {fa ? "موجودی تومانی برای خرید پکیج و سکه گرگ استفاده می‌شود؛ پرداخت از طریق ربات بله انجام می‌شود و مبلغ بلافاصله به کیف پول تومانی شما اضافه می‌گردد." : "The toman balance pays for packages and wolf coins; the Bale bot charges it instantly."}
            </div>
            {bale ? (
              <div className="w-pos-card" style={{ marginTop: 10 }}>
                <div className="w-between" style={{ flexWrap: "wrap", gap: 8 }}>
                  <b style={{ fontSize: 13 }}>{fa ? `سفارش ${N(bale.amount, 0)} تومانی` : `Order ${N(bale.amount, 0)} Toman`}</b>
                  <span className={`w-chip${bale.status === "paid" ? " w-chip-up" : bale.status === "paid_test" ? " w-chip-gold" : ""}`}>{bale.status}</span>
                </div>
                <div className="w-row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <a className="w-btn w-btn-gold w-btn-sm" href={bale.link} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> {fa ? "باز کردن بله" : "Open Bale"}
                  </a>
                  <button
                    className="w-btn w-btn-ghost w-btn-sm"
                    onClick={() => {
                      try { void navigator.clipboard.writeText(bale.link); } catch { /* ignore */ }
                      setMsg({ ok: true, text: fa ? "لینک کپی شد." : "Link copied." });
                    }}
                  >
                    <Copy size={13} /> {fa ? "کپی لینک" : "Copy"}
                  </button>
                  <span className="w-chip">@{baleInfo?.botUsername ?? "wlofbot"}</span>
                </div>
                <div className="w-tiny">{fa ? "پس از پرداخت در بله، وضعیت این کارت خودکار به «paid» تغییر می‌کند." : "After paying, this card switches to paid automatically."}</div>
              </div>
            ) : null}
            {baleInfo?.testMode ? (
              <div className="w-tiny w-down" style={{ marginTop: 6 }}>
                {fa ? "درگاه در حالت آزمایشی است؛ تا تنظیم توکن کیف پول بله، پرداخت‌ها پول واقعی جابه‌جا نمی‌کنند." : "Test gateway: no real money until the Bale wallet provider token is configured."}
              </div>
            ) : null}
          </div>
      {tab === "vip" && (
        <div className="w-grid w-g-2" style={{ gap: 14 }}>
          <div className="w-card w-card-pad">
            <VipTrialCard
              isVip={Boolean(user?.isVip)}
              vipExpiresAt={user?.vipExpiresAt ? Number(user.vipExpiresAt) : undefined}
              onClaimTrial={claimTrial}
              onApplyDiscount={applyDiscount}
              lang={fa ? "fa" : "en"}
            />
          </div>
          <div className="w-card w-card-pad">
            <div className="w-sec"><div className="w-sec-title"><i />{fa ? "پکیج‌های VIP" : "VIP packages"}</div><span className="w-tiny">{packages.length}</span></div>
            <div className="w-list">
              {packages.map((p: any) => (
                <div className="w-li" key={p.id ?? p.key}>
                  <div className="w-li-main">
                    <Crown size={15} className="w-gold" />
                    <div>
                      <div style={{ fontWeight: 700 }}>{p.name ?? p.title ?? p.key}</div>
                      <div className="w-li-sub">{fa ? "سرمایه" : "capital"} {N(p.min_capital, 0)} – {N(p.max_capital, 0)} USDT</div>
                    </div>
                  </div>
                  <span className="w-chip w-chip-gold w-num">{N(p.price, 2)} USDT</span>
                </div>
              ))}
              {!packages.length && <div className="w-empty">{fa ? "پکیجی فعال نیست." : "No active package."}</div>}
            </div>
            <div className="w-tiny" style={{ marginTop: 10 }}>
              {fa ? "خرید و فعال‌سازی پکیج از داشبورد کامل (تب VIP) با تأیید ادمین انجام می‌شود." : "Purchases are completed in the full dashboard (VIP tab) with admin approval."}
            </div>
          </div>
        </div>
      )}

      {tab === "support" && (
        <div className="w-card w-card-pad">
          <div className="w-sec">
            <div className="w-sec-title"><i />{fa ? "تیکت‌های پشتیبانی" : "Support tickets"}</div>
            <button className="w-btn w-btn-gold w-btn-sm" onClick={() => setOpenTicket(true)}>
              <Headphones size={14} /> {fa ? "تیکت جدید" : "New ticket"}
            </button>
          </div>
          <div className="w-list">
            {tickets.map((t: any) => (
              <div className="w-li" key={t.id}>
                <div className="w-li-main">
                  <LifeBuoy size={15} className="w-gold" />
                  <div>
                    <div style={{ fontWeight: 700 }}>{t.subject}</div>
                    <div className="w-li-sub w-trunc" style={{ maxWidth: 420 }}>{t.message ?? t.last_message ?? ""}</div>
                  </div>
                </div>
                <span className={`w-chip${t.status === "open" ? " w-chip-gold" : t.status === "closed" ? "" : " w-chip-violet"}`}>{t.status ?? "open"}</span>
              </div>
            ))}
            {!tickets.length && <div className="w-empty">{fa ? "تیکتی ثبت نکرده‌اید." : "No tickets yet."}</div>}
          </div>
          <SupportTicketModal
            open={openTicket}
            onOpenChange={setOpenTicket}
            tickets={tickets}
            lang={fa ? "fa" : "en"}
            onCreateTicket={async (subject, message, category, priority) => {
              await restFetch("/support/tickets", { method: "POST", token, body: { subject, message, category, priority }, timeoutMs: 15_000 });
              void load();
            }}
          />
        </div>
      )}


      {tab === "activity" && (
        <div className="w-grid" style={{ gap: 14 }}>
          <ApiTable
            title={fa ? "اعلان‌های من" : "My notifications"}
            endpoint="/notifications"
            arrayKey="notifications"
            token={token}
            columns={[
              { k: "title", label: fa ? "عنوان" : "Title" },
              { k: "body", label: fa ? "متن" : "Body" },
              { k: "created_at", label: fa ? "زمان" : "When", fmt: "date" },
            ]}
            actions={[{ label: fa ? "خوانده شد" : "Read", path: () => "/notifications/read", body: (r: any) => ({ id: r.id }) }]}
            emptyText={fa ? "اعلانی ندارید." : "No notifications."}
          />
        </div>
      )}

      {tab === "coins" && (
        <div className="w-grid w-g-2" style={{ gap: 14 }}>
          <ApiFacts
            title={fa ? "کیف سکه و تومان" : "Coins & toman"}
            endpoint="/coins"
            token={token}
            fields={[
              { k: "wolfCoins", label: fa ? "ولف‌کوین" : "Wolf coins", fmt: "num" },
              { k: "toman", label: fa ? "تومان" : "Toman", fmt: "num" },
              { k: "profileRewardClaimed", label: fa ? "جایزه پروفایل" : "Profile reward" },
            ]}
          />
          <ApiForm
            title={fa ? "مبادله تومان → USDT" : "Swap toman → USDT"}
            submit={{ path: "/coins/swap/toman-to-usdt" }}
            fields={[{ k: "tomanAmount", label: fa ? "مبلغ تومان" : "Toman amount", type: "number" }]}
            token={token}
            button={fa ? "مبادله" : "Swap"}
          />
          <ApiForm
            title={fa ? "مبادله USDT → تومان" : "Swap USDT → toman"}
            submit={{ path: "/coins/swap/usdt-to-toman" }}
            fields={[{ k: "usdtAmount", label: fa ? "مبلغ USDT" : "USDT amount", type: "number" }]}
            token={token}
            button={fa ? "مبادله" : "Swap"}
          />
          <ApiForm
            title={fa ? "ثبت کد ووچر" : "Redeem a voucher"}
            submit={{ path: "/coins/voucher/redeem" }}
            fields={[{ k: "code", label: fa ? "کد ووچر" : "Voucher code" }]}
            token={token}
            button={fa ? "ثبت" : "Redeem"}
          />
          <div style={{ gridColumn: "1 / -1" }}>
            <ApiTable
              title={fa ? "تاریخچه سکه" : "Coin history"}
              endpoint="/coins/history"
              arrayKey="transactions"
              token={token}
              columns={[
                { k: "currency", label: fa ? "ارز" : "Currency", fmt: "chip" },
                { k: "delta", label: fa ? "تغییر" : "Delta", fmt: "num" },
                { k: "balance_after", label: fa ? "مانده" : "Balance", fmt: "num" },
                { k: "reason", label: fa ? "دلیل" : "Reason" },
                { k: "created_at", label: fa ? "زمان" : "When", fmt: "date" },
              ]}
            />
          </div>
          <CoinsShop token={token} />
        </div>
      )}

      {tab === "referral" && (
        <div className="w-grid w-g-2" style={{ gap: 14 }}>
          <ApiFacts
            title={fa ? "لینک معرفی من" : "My referral"}
            endpoint="/referral"
            token={token}
            fields={[
              { k: "code", label: fa ? "کد" : "Code", fmt: "mono" },
              { k: "link", label: fa ? "لینک" : "Link", fmt: "mono" },
              { k: "referred", label: fa ? "دعوت‌شده‌ها" : "Invited", fmt: "num" },
              { k: "rewardEnabled", label: fa ? "پاداش فعال" : "Reward on" },
            ]}
          />
          <ApiForm
            title={fa ? "ثبت کد معرف" : "Apply a referral code"}
            hint={fa ? "اگر با لینک کسی ثبت‌نام نکرده‌اید، کد او را اینجا وارد کنید." : "If you joined without a link, enter the inviter code here."}
            submit={{ path: "/referral/apply" }}
            fields={[{ k: "code", label: fa ? "کد معرف" : "Referral code" }]}
            token={token}
            button={fa ? "ثبت کد" : "Apply"}
          />
          <ReferralApply token={token} />
        </div>
      )}

      {tab === "requests" && (
        <div className="w-grid w-g-2" style={{ gap: 14 }}>
          <ApiForm
            title={fa ? "واریز تومانی" : "Toman deposit"}
            hint={fa ? "پس از تأیید ادمین، مبلغ به کیف پول تومانی شما اضافه می‌شود." : "After admin approval the amount is credited to your toman wallet."}
            submit={{ path: "/wallet/deposit-toman" }}
            fields={[
              { k: "amount", label: fa ? "مبلغ تومان" : "Toman amount", type: "number" },
            ]}
            token={token}
            button={fa ? "ثبت واریز" : "Submit"}
          />
          <ApiForm
            title={fa ? "آزادسازی سرمایه" : "Unfreeze capital"}
            hint={fa ? "درخواست آزادسازی بخشی از سرمایهٔ درگیر (با تأیید ادمین)." : "Request release of part of the engaged capital (admin approved)."}
            submit={{ path: "/wallet/unfreeze" }}
            fields={[{ k: "amount", label: fa ? "مبلغ" : "Amount", type: "number" }]}
            token={token}
            button={fa ? "درخواست" : "Request"}
          />
          <div style={{ gridColumn: "1 / -1" }}>
            <ApiTable
              title={fa ? "تراکنش‌های کیف پول" : "Wallet transactions"}
              endpoint="/wallet"
              arrayKey="transactions"
              token={token}
              columns={[
                { k: "type", label: fa ? "نوع" : "Type", fmt: "chip" },
                { k: "asset", label: fa ? "دارایی" : "Asset" },
                { k: "amount", label: fa ? "مبلغ" : "Amount", fmt: "num" },
                { k: "network", label: fa ? "شبکه" : "Network" },
                { k: "status", label: fa ? "وضعیت" : "Status", fmt: "chip" },
                { k: "created_at", label: fa ? "زمان" : "When", fmt: "date" },
              ]}
              emptyText={fa ? "تراکنشی نیست." : "No transaction."}
            />
          </div>
        </div>
      )}

      {tab === "profile" && (() => {
        const firstName = profile?.firstName || user?.firstName || "";
        const lastName = profile?.lastName || user?.lastName || "";
        const fullName = [firstName, lastName].filter(Boolean).join(" ").trim()
          || profile?.name || user?.name || (fa ? "کاربر گرگ" : "Wolf trader");
        const tgUsername = profile?.tgUsername || user?.tgUsername || "";
        const tgId = profile?.tgId ?? user?.tgId ?? null;
        const photo = profile?.photo || user?.image || "";
        const joined = Number(profile?.registeredAt ?? user?.registeredAt ?? 0);
        const joinedText = joined > 0
          ? new Date(joined).toLocaleDateString(fa ? "fa-IR" : "en-GB", { year: "numeric", month: "long", day: "numeric" })
          : "—";
        const initials = (firstName || fullName || "W").trim().slice(0, 2).toUpperCase();
        const vip = Boolean(profile?.isVip ?? user?.isVip);
        const vipUntil = Number(user?.vipExpiresAt ?? 0);
        return (
        <div className="w-grid" style={{ gap: 14 }}>
          <div className="w-card w-card-pad w-glass">
            <div className="w-row" style={{ gap: 16, flexWrap: "wrap" }}>
              <span className="w-avatar" style={{ width: 84, height: 84, fontSize: 26 }}>
                {photo ? <img src={photo} alt={initials} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : <b>{initials}</b>}
              </span>
              <div style={{ flex: "1 1 220px", minWidth: 200 }}>
                <div className="w-row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 19 }}>{fullName}</b>
                  {vip && <span className="w-chip w-chip-gold"><Crown size={12} /> VIP</span>}
                  {isAdmin && <span className="w-chip w-chip-violet">ADMIN</span>}
                </div>
                <div className="w-tiny" dir="ltr" style={{ marginTop: 4, fontWeight: 700 }}>
                  {tgUsername ? `@${tgUsername}` : (profile?.username || user?.username || "—")}
                </div>
                <div className="w-row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  <span className="w-chip"><CalendarDays size={12} /> {fa ? "عضو از " : "Joined "}{joinedText}</span>
                  {tgId ? <span className="w-chip"><ShieldCheck size={12} /> {fa ? "شناسه تلگرام" : "TG id"} <b className="w-mono">{tgId}</b></span> : null}
                  <span className="w-chip w-chip-up"><Wallet size={12} /> {N(wallet?.balance)} USDT</span>
                </div>
                <div className="w-row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {tgUsername ? (
                    <a className="w-btn w-btn-gold w-btn-sm" href={`https://t.me/${tgUsername}`} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} /> {fa ? "پروفایل تلگرام من" : "My Telegram profile"}
                    </a>
                  ) : null}
                  <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void load()} disabled={busy !== ""}>
                    {busy ? <Loader2 className="animate-spin" size={13} /> : <RefreshCw size={13} />} {fa ? "بروزرسانی" : "Refresh"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="w-grid w-g-2" style={{ gap: 14 }}>
            <div className="w-card w-card-pad">
              <div className="w-sec"><div className="w-sec-title"><i />{fa ? "مشخصات حساب" : "Account"}</div></div>
              <div className="w-list">
                <div className="w-li"><span>{fa ? "نام" : "Name"}</span><b>{fullName}</b></div>
                <div className="w-li"><span>{fa ? "نام کاربری تلگرام" : "Telegram username"}</span><b dir="ltr">{tgUsername ? `@${tgUsername}` : "—"}</b></div>
                <div className="w-li"><span>{fa ? "شناسه تلگرام" : "Telegram id"}</span><b className="w-mono" dir="ltr">{tgId ?? "—"}</b></div>
                <div className="w-li"><span>{fa ? "نقش" : "Role"}</span><b>{isAdmin ? (fa ? "ادمین" : "admin") : (profile?.role || user?.role || "user")}</b></div>
                <div className="w-li"><span>{fa ? "وضعیت VIP" : "VIP"}</span><b className={vip ? "w-up" : ""}>{vip ? (fa ? "فعال" : "active") : (fa ? "غیرفعال" : "inactive")}{vip && vipUntil > 0 ? ` · ${new Date(vipUntil).toLocaleDateString("en-GB")}` : ""}</b></div>
                <div className="w-li"><span>{fa ? "موجودی تومانی" : "Toman balance"}</span><b className="w-num">{N(irt ?? 0, 0)}</b></div>
              </div>
            </div>

            <div className="w-card w-card-pad">
              <div className="w-sec"><div className="w-sec-title"><i />{fa ? "نمایش و امنیت" : "Appearance & access"}</div></div>
              <div className="w-list">
                <div className="w-li">
                  <span>{fa ? "تم" : "Theme"}</span>
                  <button className="w-btn w-btn-ghost w-btn-sm" onClick={toggleTheme}>
                    {fa ? WOLF_THEME_LABEL[theme].fa : WOLF_THEME_LABEL[theme].en}
                  </button>
                </div>
                <div className="w-li">
                  <span>{fa ? "ورود از تلگرام" : "Telegram sign-in"}</span>
                  <b className={tgId ? "w-up" : "w-down"}>{tgId ? (fa ? "متصل" : "linked") : (fa ? "متصل نیست" : "not linked")}</b>
                </div>
                <div className="w-li">
                  <span>{fa ? "خروج از حساب" : "Sign out"}</span>
                  <button className="w-btn w-btn-danger w-btn-sm" onClick={() => void logout()}>
                    <LogOut size={13} /> {fa ? "خروج" : "Sign out"}
                  </button>
                </div>
              </div>
            </div>

            <div className="w-card w-card-pad">
              <div className="w-sec">
                <div className="w-sec-title"><i />{fa ? "رمز عبور ورود از سایت" : "Website password"}</div>
                <span className={`w-chip ${profile?.hasPassword ? "w-chip-up" : "w-chip-gold"}`}>
                  {profile?.hasPassword ? (fa ? "تعیین شده" : "set") : (fa ? "تعیین نشده" : "not set")}
                </span>
              </div>
              <div className="w-tiny" style={{ marginBottom: 10, lineHeight: 1.9 }}>
                {fa
                  ? <>با تعیین رمز، می‌توانید مستقیم از <b>/auth</b> با نام کاربری تلگرام <b dir="ltr">{tgUsername ? `@${tgUsername}` : "—"}</b> و همین رمز وارد شوید — بدون نیاز به تلگرام.</>
                  : <>Set a password to sign in at <b>/auth</b> with your Telegram username <b dir="ltr">{tgUsername ? `@${tgUsername}` : "—"}</b> — no Telegram needed.</>}
              </div>
              <div className="w-col" style={{ gap: 8 }}>
                {profile?.hasPassword ? (
                  <input
                    className="w-input"
                    type="password"
                    autoComplete="current-password"
                    placeholder={fa ? "رمز فعلی" : "Current password"}
                    value={pwOld}
                    onChange={(e) => setPwOld(e.target.value)}
                  />
                ) : null}
                <input
                  className="w-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder={fa ? "رمز جدید (حداقل ۸ کاراکتر)" : "New password (min 8 chars)"}
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                />
                <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void savePassword()} disabled={busy !== "" || pwNew.length < 8}>
                  {busy === "password" ? <Loader2 className="animate-spin" size={13} /> : <ShieldCheck size={13} />} {fa ? "ذخیره رمز" : "Save password"}
                </button>
                {pwMsg && <div className={`w-tiny ${pwMsg.ok ? "w-up" : "w-down"}`}>{pwMsg.text}</div>}
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
