import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, Coins, Dices, GraduationCap, Loader2, Play, RefreshCw, Swords, Trophy } from "lucide-react";
import { MultiAgentArena } from "@/components/MultiAgentArena";
import { restFetch } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";

type Candle = { o: number; h: number; l: number; c: number };
type Prediction = { id: string; symbol: string; reward: number; candles: Candle[] };
type Quiz = { id: string; question: string; questionEn: string; options: string[]; reward: number };
type Edu = { id: string; title_fa: string; title_en: string; body_fa: string; body_en: string; source?: string; created_at?: string };

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "DOGEUSDT"];

type Tab = "predict" | "quiz" | "arena" | "learn";

export function GamesZone({ token }: { token: string | null }) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [tab, setTab] = useState<Tab>("predict");
  const [coins, setCoins] = useState<number | null>(null);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [predResult, setPredResult] = useState<{ won: boolean; reward: number } | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [quizResult, setQuizResult] = useState<{ won: boolean; reward: number; correct: number } | null>(null);
  const [lesson, setLesson] = useState<Edu[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const loadCoins = useCallback(async () => {
    if (!token) return;
    try {
      const r: any = await restFetch("/coins", { token, timeoutMs: 12_000 });
      setCoins(Number(r?.wolfCoins ?? 0));
    } catch {
      /* the balance chip simply stays hidden */
    }
  }, [token]);

  const loadLessons = useCallback(async () => {
    try {
      const r: any = await restFetch("/education", { timeoutMs: 12_000 });
      setLesson(Array.isArray(r?.education) ? r.education.slice(0, 12) : []);
    } catch {
      setLesson([]);
    }
  }, []);

  useEffect(() => {
    void loadCoins();
    void loadLessons();
  }, [loadCoins, loadLessons]);

  const startPrediction = async () => {
    setBusy("predict");
    setErr(null);
    setPredResult(null);
    try {
      const r: any = await restFetch("/coins/prediction/start", { method: "POST", token, body: { symbol }, timeoutMs: 15_000 });
      setPrediction({ id: String(r.id), symbol: String(r.symbol), reward: Number(r.reward ?? 0), candles: Array.isArray(r.candles) ? r.candles : [] });
    } catch (e: any) {
      setErr(String(e?.message ?? (fa ? "شروع پیش‌بینی ناموفق بود." : "Could not start the prediction.")));
    } finally {
      setBusy("");
    }
  };

  const resolvePrediction = async (direction: "long" | "short") => {
    if (!prediction) return;
    setBusy(direction);
    setErr(null);
    try {
      const r: any = await restFetch("/coins/prediction/resolve", { method: "POST", token, body: { id: prediction.id, direction }, timeoutMs: 15_000 });
      setPredResult({ won: Boolean(r?.won), reward: Number(r?.reward ?? 0) });
      setPrediction(null);
      void loadCoins();
    } catch (e: any) {
      setErr(String(e?.message ?? (fa ? "ثبت پیش‌بینی ناموفق بود." : "Could not resolve the prediction.")));
    } finally {
      setBusy("");
    }
  };

  const startQuiz = async () => {
    setBusy("quiz");
    setErr(null);
    setQuizResult(null);
    setPicked(null);
    try {
      const r: any = await restFetch("/coins/quiz/start", { method: "POST", token, body: {}, timeoutMs: 15_000 });
      setQuiz({ id: String(r.id), question: String(r.question ?? ""), questionEn: String(r.questionEn ?? ""), options: Array.isArray(r.options) ? r.options : [], reward: Number(r.reward ?? 0) });
    } catch (e: any) {
      setErr(String(e?.message ?? (fa ? "شروع آزمون ناموفق بود." : "Could not start the quiz.")));
    } finally {
      setBusy("");
    }
  };

  const resolveQuiz = async (chosen: number) => {
    if (!quiz || picked !== null) return;
    setPicked(chosen);
    setBusy("resolve");
    try {
      const r: any = await restFetch("/coins/quiz/resolve", { method: "POST", token, body: { id: quiz.id, chosen }, timeoutMs: 15_000 });
      setQuizResult({ won: Boolean(r?.won), reward: Number(r?.reward ?? 0), correct: Number(r?.correct ?? 0) });
      void loadCoins();
    } catch (e: any) {
      setErr(String(e?.message ?? (fa ? "ثبت پاسخ ناموفق بود." : "Could not submit the answer.")));
    } finally {
      setBusy("");
    }
  };

  const tabs: { key: Tab; icon: ReactNode; label: string }[] = [
    { key: "predict", icon: <Dices size={14} />, label: fa ? "پیش‌بینی کندل" : "Candle guess" },
    { key: "quiz", icon: <GraduationCap size={14} />, label: fa ? "آزمون ترید" : "Trading quiz" },
    { key: "arena", icon: <Swords size={14} />, label: fa ? "آرنای ایجنت‌ها" : "Agent arena" },
    { key: "learn", icon: <BookOpen size={14} />, label: fa ? "آموزش" : "Education" },
  ];

  const bars = useMemo(() => {
    const cs = prediction?.candles ?? [];
    if (!cs.length) return [] as { up: boolean; h: number }[];
    const hi = Math.max(...cs.map((c) => Number(c.h ?? c.c ?? 0)));
    const lo = Math.min(...cs.map((c) => Number(c.l ?? c.c ?? 0)));
    const span = hi - lo || 1;
    return cs.map((c) => ({ up: Number(c.c) >= Number(c.o), h: Math.round(((Number(c.c) - lo) / span) * 74) + 12 }));
  }, [prediction]);

  return (
    <div className="w-grid" style={{ gap: 14 }}>
      <div className="w-card w-card-pad">
        <div className="w-between" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="w-row" style={{ gap: 10, flexWrap: "wrap" }}>
            <span className="w-chip w-chip-gold">
              <Coins size={13} /> {coins === null ? "—" : coins.toLocaleString(fa ? "fa-IR" : "en-US")} {fa ? "سکه" : "coins"}
            </span>
            <span className="w-tiny">
              {fa ? "با پیش‌بینی کندل و آزمون ترید سکه بگیرید و در پکیج‌ها خرج کنید." : "Earn coins from the candle game and the quiz, then spend them on packages."}
            </span>
          </div>
          <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => { void loadCoins(); void loadLessons(); }} disabled={busy !== ""}>
            <RefreshCw size={14} /> {fa ? "بروزرسانی" : "Refresh"}
          </button>
        </div>
        <div className="w-row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="w-chip w-chip-gold">🎲 {fa ? "۴ بخش مجزا" : "4 separate pages"}</span>
          <span className="w-tiny">{fa ? "هر تب یک صفحهٔ کامل و مستقل است — روی هر کدام بزنید تا فقط همان بخش باز شود." : "Each tab is its own full page — tap one to open only that section."}</span>
        </div>
        <div className="w-tabs w-tabs-lg" style={{ marginTop: 10 }}>
          {tabs.map((t, i) => (
            <button
              key={t.key}
              className={`w-tab${tab === t.key ? " is-active" : ""}`}
              onClick={() => setTab(t.key)}
              aria-pressed={tab === t.key}
            >
              <span className="w-tab-num">{i + 1}</span> {t.icon} {t.label}
            </button>
          ))}
        </div>
        <div className="w-tiny" style={{ marginTop: 8 }}>
          {fa ? "صفحه فعلی: " : "Current page: "}<b>{tabs.find((x) => x.key === tab)?.label}</b>
        </div>
      </div>

      {err && <div className="w-card w-card-pad" style={{ borderColor: "rgba(255,107,107,.5)" }}><span className="w-down">{err}</span></div>}

      {tab === "predict" && (
        <div className="w-grid w-g-2" style={{ gap: 14 }}>
          <div className="w-card w-card-pad">
            <div className="w-sec">
              <div className="w-sec-title"><i />{fa ? "پیش‌بینی جهت کندل" : "Guess the next candle"}</div>
              <span className="w-reward">+{prediction?.reward ?? 5} {fa ? "سکه" : "coins"}</span>
            </div>
            <div className="w-toolbar" style={{ marginBottom: 12 }}>
              <select className="w-select" value={symbol} onChange={(e) => setSymbol(e.target.value)} disabled={busy !== "" || !!prediction}>
                {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void startPrediction()} disabled={busy !== "" || !!prediction}>
                {busy === "predict" ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />} {fa ? "شروع" : "Start"}
              </button>
            </div>
            {prediction ? (
              <>
                <div className="w-candles">
                  {bars.map((b, i) => (
                    <span key={i} className={`w-candle${b.up ? "" : " is-down"}`} style={{ height: `${b.h}%` }} />
                  ))}
                </div>
                <div className="w-tiny" style={{ margin: "10px 0" }}>
                  {fa ? "۴۰ کندل گذشته — کندل بعدی صعودی است یا نزولی؟" : "The last 40 candles — is the next one bullish or bearish?"}
                </div>
                <div className="w-row" style={{ gap: 10 }}>
                  <button className="w-btn w-btn-ghost" style={{ flex: 1 }} onClick={() => void resolvePrediction("long")} disabled={busy !== ""}>
                    🟢 {fa ? "صعودی" : "Long"}
                  </button>
                  <button className="w-btn w-btn-ghost" style={{ flex: 1 }} onClick={() => void resolvePrediction("short")} disabled={busy !== ""}>
                    🔴 {fa ? "نزولی" : "Short"}
                  </button>
                </div>
              </>
            ) : (
              <div className="w-empty">
                {predResult
                  ? predResult.won
                    ? `${fa ? "درست بود!" : "Correct!"} +${predResult.reward} ${fa ? "سکه" : "coins"}`
                    : fa ? "این‌بار نشد — دوباره تلاش کنید." : "Wrong this time — try again."
                  : fa ? "برای دیدن کندل‌ها دکمه شروع را بزنید." : "Press start to load the candles."}
              </div>
            )}
          </div>

          <div className="w-card w-card-pad">
            <div className="w-sec"><div className="w-sec-title"><i />{fa ? "سکه‌های شما" : "Your coins"}</div></div>
            <div className="w-kpi-value w-num" style={{ fontSize: 34 }}>{(coins ?? 0).toLocaleString(fa ? "fa-IR" : "en-US")}</div>
            <div className="w-kpi-foot">{fa ? "سکه گرگ — قابل استفاده در پکیج‌ها و آنلاک سیگنال" : "Wolf coins — usable on packages and signal unlocks"}</div>
            <div className="w-sep" style={{ margin: "14px 0" }} />
            <div className="w-list">
              <div className="w-li"><span>{fa ? "پیش‌بینی درست" : "Correct guess"}</span><b className="w-reward w-num">+{prediction?.reward ?? 5}</b></div>
              <div className="w-li"><span>{fa ? "پاداش زنجیره برد" : "Win-streak bonus"}</span><b className="w-reward w-num">+1…+4</b></div>
              <div className="w-li"><span>{fa ? "آزمون ترید" : "Trading quiz"}</span><b className="w-reward w-num">+{quiz?.reward ?? 3}</b></div>
            </div>
          </div>
        </div>
      )}

      {tab === "quiz" && (
        <div className="w-card w-card-pad">
          <div className="w-sec">
            <div className="w-sec-title"><i />{fa ? "آزمون ترید" : "Trading quiz"}</div>
            <div className="w-sec-actions">
              <span className="w-reward">+{quiz?.reward ?? 3} {fa ? "سکه" : "coins"}</span>
              <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void startQuiz()} disabled={busy !== ""}>
                {busy === "quiz" ? <Loader2 className="animate-spin" size={14} /> : <GraduationCap size={14} />}
                {quiz ? (fa ? "سؤال بعدی" : "Next question") : fa ? "شروع آزمون" : "Start quiz"}
              </button>
            </div>
          </div>
          {quiz ? (
            <div className="w-game">
              <b style={{ fontSize: 14.5 }}>{fa ? quiz.question : quiz.questionEn || quiz.question}</b>
              {quiz.options.map((opt, i) => {
                const cls = picked === null
                  ? ""
                  : i === picked
                    ? quizResult?.won ? " is-right" : " is-wrong"
                    : i === quizResult?.correct ? " is-right" : "";
                return (
                  <button key={i} className={`w-opt${cls}`} onClick={() => void resolveQuiz(i)} disabled={picked !== null || busy !== ""}>
                    <i>{i + 1}</i> {opt}
                  </button>
                );
              })}
              {quizResult && (
                <div className={quizResult.won ? "w-up" : "w-down"} style={{ fontWeight: 800 }}>
                  {quizResult.won
                    ? `${fa ? "آفرین! درست بود" : "Correct!"} +${quizResult.reward} ${fa ? "سکه" : "coins"}`
                    : fa ? "جواب اشتباه بود — گزینه سبز پاسخ درست است." : "Wrong answer — the green option is the right one."}
                </div>
              )}
            </div>
          ) : (
            <div className="w-empty">{fa ? "برای شروع آزمون دکمه بالا را بزنید." : "Press the button above to start."}</div>
          )}
        </div>
      )}

      {tab === "arena" && (
        <div className="w-card w-card-pad">
          <div className="w-sec"><div className="w-sec-title"><i />{fa ? "آرنای ایجنت‌ها" : "Multi-agent arena"}</div></div>
          <MultiAgentArena token={token ?? ""} lang={fa ? "fa" : "en"} />
        </div>
      )}

      {tab === "learn" && (
        <div className="w-card w-card-pad">
          <div className="w-sec">
            <div className="w-sec-title"><i />{fa ? "آموزش و مقالات" : "Education"}</div>
            <span className="w-tiny">{lesson.length}</span>
          </div>
          <div className="w-list">
            {lesson.map((e) => (
              <div className="w-li" key={e.id}>
                <div className="w-li-main">
                  <Trophy size={15} className="w-gold" />
                  <div>
                    <div style={{ fontWeight: 700 }}>{fa ? e.title_fa || e.title_en : e.title_en || e.title_fa}</div>
                    <div className="w-li-sub w-trunc" style={{ maxWidth: 430 }}>{(fa ? e.body_fa : e.body_en) || ""}</div>
                  </div>
                </div>
                <span className="w-chip">{e.source || (fa ? "آموزش" : "lesson")}</span>
              </div>
            ))}
            {!lesson.length && <div className="w-empty">{fa ? "هنوز آموزشی منتشر نشده." : "Nothing published yet."}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

