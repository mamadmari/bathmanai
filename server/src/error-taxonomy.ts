// ─────────────────────────────────────────────────────────────────────────────
// Error taxonomy — turns raw engine / broker / DB messages into a small, stable
// set of categories with Persian labels, so the admin panel can show them on
// tabs instead of a wall of English log lines.
// ─────────────────────────────────────────────────────────────────────────────

export type ErrorCategoryKey =
  | "execution"
  | "broker"
  | "risk"
  | "data"
  | "engine"
  | "wallet"
  | "database"
  | "other";

export interface ErrorCategory {
  key: ErrorCategoryKey;
  fa: string;
  en: string;
  hint: string;
}

export const ERROR_CATEGORIES: ErrorCategory[] = [
  { key: "execution", fa: "اجرا و سفارش", en: "Execution", hint: "خطاهای ثبت/بستن سفارش، اختلاف دیتابیس با صرافی و پوزیشن‌های گرد." },
  { key: "broker", fa: "صرافی و اتصال", en: "Broker", hint: "خطای شبکه، احراز هویت، محدودیت نرخ و پاسخ ناموفق نوبیتکس." },
  { key: "risk", fa: "ریسک و گیت‌ها", en: "Risk gates", hint: "رد سیگنال به‌خاطر امتیاز/RR کم، کول‌داون، ضرر پیاپی یا محافظ استاپ." },
  { key: "data", fa: "دادهٔ بازار", en: "Market data", hint: "کندل/تایم‌فریم ناکافی، حجم خشک‌شده، ATR غیرمنطقی یا قیمت کهنه." },
  { key: "engine", fa: "موتور و اسکن", en: "Engine", hint: "خروجی هر اسکن: چند نماد دیده شد و هر گیت چند مورد را رد کرد." },
  { key: "wallet", fa: "سرمایه و کیف پول", en: "Wallet", hint: "موجودی ناکافی برای ورود یا خطای خواندن کیف پول." },
  { key: "database", fa: "دیتابیس", en: "Database", hint: "رکورد تکراری یا تضاد کلید یکتا؛ معمولاً یعنی ردیف قدیمی پاک نشده." },
  { key: "other", fa: "سایر", en: "Other", hint: "پیام‌هایی که در دسته‌های بالا جا نمی‌گیرند." },
];

const CATEGORY_BY_KEY = new Map(ERROR_CATEGORIES.map((c) => [c.key, c]));

export function categoryLabel(key: ErrorCategoryKey): string {
  return CATEGORY_BY_KEY.get(key)?.fa ?? "سایر";
}

type Rule = {
  re: RegExp;
  category: ErrorCategoryKey;
  code: string;
  fa: (m: RegExpMatchArray) => string;
};

const RULES: Rule[] = [
  {
    re: /no entry this scan:([\s\S]*)/i,
    category: "engine",
    code: "NO_ENTRY_SCAN",
    fa: (m) => {
      const g = (k: string) => {
        const x = m[1].match(new RegExp(k + "=(\\d+)"));
        return x ? x[1] : "?";
      };
      return `اسکن بدون ورود — نماد: ${g("symbols")} · تایم‌فریم ناکافی: ${g("insufficient_tf")} · رأی کم: ${g("few_votes")} از ${g("max_votes")} · بدون قیمت: ${g("no_ticker")} · رد در گیت: ${g("gate_rejected")}`;
    },
  },
  {
    re: /duplicate key value violates unique constraint/i,
    category: "database",
    code: "DUPLICATE_KEY",
    fa: () => "رکورد تکراری در دیتابیس (همان نماد از قبل باز یا آرشیو شده بود)",
  },
  {
    re: /ExceedLiability/i,
    category: "execution",
    code: "EXCEED_LIABILITY",
    fa: () => "مبلغ بستن از بدهی پوزیشن بیشتر بود؛ صرافی رد کرد",
  },
  {
    re: /SmallOrder/i,
    category: "execution",
    code: "SMALL_ORDER",
    fa: () => "حجم سفارش کمتر از حداقل مجاز صرافی است",
  },
  {
    re: /SPOT_CANNOT_SHORT/i,
    category: "execution",
    code: "SPOT_SHORT",
    fa: () => "حساب اسپات اجازهٔ شورت ندارد",
  },
  {
    re: /insufficient funds|insufficientmargin|zero executable size/i,
    category: "wallet",
    code: "NO_CAPITAL",
    fa: () => "سرمایه یا وثیقهٔ کافی برای این ورود نبود",
  },
  {
    re: /adopted broker position/i,
    category: "execution",
    code: "ADOPTED",
    fa: () => "پوزیشن صرافی بدون رکورد محلی بود و به موتور اضافه شد",
  },
  {
    re: /closed at broker|exchange_closed/i,
    category: "execution",
    code: "CLOSED_AT_BROKER",
    fa: () => "پوزیشن در صرافی بسته شده بود؛ رکورد محلی تسویه شد",
  },
  {
    re: /orphan/i,
    category: "execution",
    code: "ORPHAN",
    fa: () => "پوزیشن بدون استاپ/تارگت در صرافی پیدا و بسته شد",
  },
  {
    // "reconciliation" does not contain "reconcile" — match the stem.
    re: /live_exit_pending_reconciliation|exit waits for broker reconcil/i,
    category: "execution",
    code: "EXIT_WAIT",
    fa: () => "خروج در انتظار تسویه با صرافی است (یک سفارش خروج هنوز قطعی نشده)",
  },
  {
    re: /reconcil|stale live order/i,
    category: "execution",
    code: "RECONCILE",
    fa: () => "سفارش نامعلوم اصلاح یا رد شد",
  },
  {
    re: /guard|stop.?loss hit|take.?profit hit/i,
    category: "execution",
    code: "GUARD",
    fa: () => "محافظ استاپ‌لاس/تارگت",
  },
  {
    re: /VOLUME_DROUGHT/i,
    category: "data",
    code: "VOLUME_DROUGHT",
    fa: () => "حجم معاملات افت شدید داشت؛ نماد رد شد",
  },
  {
    re: /VOLUME_LOW|LOW_LIQUIDITY/i,
    category: "data",
    code: "VOLUME_LOW",
    fa: () => "نقدشوندگی پایین؛ نماد رد شد",
  },
  {
    re: /stale|no ticker|no_ticker|klines|candle/i,
    category: "data",
    code: "STALE_DATA",
    fa: () => "دادهٔ قیمت یا کندل کهنه/ناقص بود",
  },
  {
    re: /\bATR\b/,
    category: "data",
    code: "BAD_ATR",
    fa: () => "ATR غیرمنطقی؛ محاسبهٔ استاپ ممکن نبود",
  },
  {
    re: /minscore|low score|minrr|reward.?to.?risk|\bRR\b/i,
    category: "risk",
    code: "RISK_GATE",
    fa: () => "سیگنال از گیت امتیاز یا RR رد شد",
  },
  {
    re: /protection|cooldown|consecutive loss|low.?profit/i,
    category: "risk",
    code: "PROTECTION",
    fa: () => "محافظ ریسک فعال شد (کول‌داون یا ضرر پیاپی)",
  },
  {
    re: /nobitex raw response|ECONN|ETIMEDOUT|EAI_AGAIN|socket hang up|timeout|429|too many/i,
    category: "broker",
    code: "BROKER_API",
    fa: () => "خطای ارتباط یا محدودیت نرخ در صرافی",
  },
  {
    re: /401|403|unauthorized|invalid (api|signature)|nobitex-key/i,
    category: "broker",
    code: "BROKER_AUTH",
    fa: () => "احراز هویت صرافی رد شد (کلید یا امضا)",
  },
  {
    re: /balance failed|wallets|availablemargin/i,
    category: "wallet",
    code: "WALLET_READ",
    fa: () => "خواندن موجودی کیف پول ناموفق بود",
  },
];

const SOURCE_FALLBACK: Record<string, ErrorCategoryKey> = {
  execution: "execution",
  exchange: "broker",
  risk: "risk",
  data: "data",
  engine: "engine",
  wallet: "wallet",
  db: "database",
};

export interface Classified {
  category: ErrorCategoryKey;
  code: string;
  fa: string;
}

/** Category + Persian text for one log/order message. */
export function classifyError(source: string | null | undefined, message: string): Classified {
  const text = String(message ?? "");
  for (const rule of RULES) {
    const m = text.match(rule.re);
    if (m) return { category: rule.category, code: rule.code, fa: rule.fa(m) };
  }
  const src = String(source ?? "").toLowerCase();
  const category = SOURCE_FALLBACK[src] ?? "other";
  const short = text.replace(/\s+/g, " ").slice(0, 160);
  return { category, code: "UNCLASSIFIED", fa: short || "پیام بدون متن" };
}

export const __taxonomy = { RULES };
