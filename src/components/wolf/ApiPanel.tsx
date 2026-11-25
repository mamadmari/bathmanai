import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { restFetch } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";

export const N = (v: unknown, d = 2) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d }) : "—";
};

export const DT = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Date(n).toLocaleString("en-GB", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

/** Safe scalar for <td> — never render an object (React #31). */
export function cell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => cell(x)).join(" · ").slice(0, 80);
  const o = v as Record<string, unknown>;
  for (const k of ["name_fa", "name", "label", "status", "key", "value", "id"]) {
    if (o[k] != null && typeof o[k] !== "object") return String(o[k]);
  }
  return "—";
}

type Col = { k: string; label: string; fmt?: "num" | "date" | "money" | "chip" | "mono" };
type Act = {
  label: string;
  method?: "POST" | "PATCH" | "DELETE";
  path: (row: any) => string;
  body?: (row: any) => unknown;
  confirmText?: string;
  tone?: "gold" | "ghost" | "danger";
};

/** Tiny generic REST table used to port the legacy panels 1:1. */
export function ApiTable({
  title,
  endpoint,
  arrayKey,
  columns,
  actions = [],
  token,
  emptyText,
  footer,
  params,
}: {
  title: string;
  endpoint: string;
  arrayKey: string;
  columns: Col[];
  actions?: Act[];
  token: string | null;
  emptyText?: string;
  footer?: ReactNode;
  params?: Record<string, string>;
}) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
      const r: any = await restFetch(endpoint + qs, { token, timeoutMs: 20_000 });
      const list = r?.[arrayKey];
      setRows(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? "—") });
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [endpoint, arrayKey, token, params]);

  useEffect(() => { void load(); }, [load]);

  const run = async (a: Act, row: any) => {
    if (a.confirmText && !window.confirm(a.confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      await restFetch(a.path(row), { method: a.method ?? "POST", token, body: a.body ? a.body(row) : {}, timeoutMs: 20_000 });
      setMsg({ ok: true, text: fa ? "انجام شد." : "Done." });
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? "—") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-card w-card-pad">
      <div className="w-sec">
        <div className="w-sec-title"><i />{title}</div>
        <div className="w-row" style={{ gap: 6 }}>
          <span className="w-chip">{rows.length}</span>
          <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void load()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={13} /> : <RefreshCw size={13} />}
          </button>
        </div>
      </div>
      {msg && <div className={`w-tiny ${msg.ok ? "w-up" : "w-down"}`} style={{ marginBottom: 6 }}>{msg.text}</div>}
      <div className="w-table-wrap">
        <table className="w-table w-table-min">
          <thead>
            <tr>
              {columns.map((c) => <th key={c.k}>{c.label}</th>)}
              {actions.length > 0 && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={String(row.id ?? i)}>
                {columns.map((c) => {
                  const v = row[c.k];
                  const text = c.fmt === "date" ? DT(v) : c.fmt === "money" || c.fmt === "num" ? N(v, c.fmt === "money" ? 2 : 4) : cell(v);
                  return (
                    <td key={c.k} className={c.fmt === "num" || c.fmt === "money" ? "w-num" : c.fmt === "mono" ? "w-mono" : c.fmt === "chip" ? "w-tiny" : ""}>
                      {c.fmt === "chip" ? <span className="w-chip">{text}</span> : text}
                    </td>
                  );
                })}
                {actions.length > 0 && (
                  <td>
                    <div className="w-row" style={{ gap: 4, justifyContent: "flex-end" }}>
                      {actions.map((a, j) => (
                        <button
                          key={j}
                          className={`w-btn w-btn-${a.tone ?? "ghost"} w-btn-sm`}
                          onClick={() => void run(a, row)}
                          disabled={busy}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!rows.length && !busy && (
              <tr><td colSpan={columns.length + (actions.length ? 1 : 0)} className="w-empty">{emptyText ?? (fa ? "موردی نیست." : "Nothing here.")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

/** Single-object endpoint rendered as a key/value list (referral, monitor…). */
export function ApiFacts({
  title,
  endpoint,
  fields,
  token,
  extra,
}: {
  title: string;
  endpoint: string;
  fields: { k: string; label: string; fmt?: "num" | "mono" }[];
  token: string | null;
  extra?: ReactNode;
}) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    restFetch(endpoint, { token, timeoutMs: 15_000 }).then((r) => setData(r)).catch((e) => setErr(String(e?.message ?? "—")));
  }, [endpoint, token]);
  return (
    <div className="w-card w-card-pad">
      <div className="w-sec"><div className="w-sec-title"><i />{title}</div></div>
      {err && <div className="w-tiny w-down">{err}</div>}
      <div className="w-list">
        {fields.map((f) => {
          const pick = (obj: any, path: string) => {
            const parts = String(path).split(".");
            let cur = obj;
            for (let i = 0; i < parts.length; i += 1) {
              if (cur == null || typeof cur !== "object") return undefined;
              const rest = parts.slice(i).join(".");
              if (rest in cur) return (cur as any)[rest];
              cur = (cur as any)[parts[i]];
            }
            return cur;
          };
          const v = pick(data, f.k);
          return (
            <div className="w-li" key={f.k}>
              <span>{f.label}</span>
              <b className={f.fmt === "num" ? "w-num" : f.fmt === "mono" ? "w-mono" : ""} dir={f.fmt === "mono" ? "ltr" : undefined}>
                {f.fmt === "num" ? N(v, 2) : cell(v)}
              </b>
            </div>
          );
        })}
        {!data && !err && <div className="w-empty">{fa ? "در حال دریافت…" : "Loading…"}</div>}
      </div>
      {extra}
    </div>
  );
}

/** Small POST form (voucher redeem, referral code, toman deposit…). */
export function ApiForm({
  title,
  hint,
  submit,
  fields,
  token,
  button,
}: {
  title: string;
  hint?: string;
  submit: { path: string; method?: "POST" | "PATCH" };
  fields: { k: string; label: string; type?: string; placeholder?: string }[];
  token: string | null;
  button: string;
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
      const r: any = await restFetch(submit.path, { method: submit.method ?? "POST", token, body: vals, timeoutMs: 20_000 });
      setMsg({ ok: true, text: String(r?.message ?? (fa ? "انجام شد." : "Done.")) });
      setVals({});
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
        {fields.map((f) => (
          <input
            key={f.k}
            className="w-input"
            type={f.type ?? "text"}
            placeholder={f.placeholder ?? f.label}
            value={vals[f.k] ?? ""}
            onChange={(e) => setVals((v) => ({ ...v, [f.k]: e.target.value }))}
            dir={f.type === "number" ? "ltr" : undefined}
          />
        ))}
        <button className="w-btn w-btn-gold w-btn-sm" onClick={() => void run()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />} {button}
        </button>
        {msg && <div className={`w-tiny ${msg.ok ? "w-up" : "w-down"}`}>{msg.text}</div>}
      </div>
    </div>
  );
}

export function ErrorNote({ text }: { text: string }) {
  return (
    <div className="w-row" style={{ gap: 6 }}>
      <AlertTriangle size={13} className="w-down" /> <span className="w-tiny w-down">{text}</span>
    </div>
  );
}

/** Fetch any endpoint and render it safely — objects become key/value rows. */
export function JsonCard({
  title,
  endpoint,
  token,
  params,
}: {
  title: string;
  endpoint: string;
  token: string | null;
  params?: Record<string, string>;
}) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
      const r: any = await restFetch(endpoint + qs, { token, timeoutMs: 25_000 });
      setData(r ?? {});
      setErr(null);
    } catch (e: any) {
      setErr(String(e?.message ?? "—"));
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [endpoint, token, JSON.stringify(params ?? null)]);

  useEffect(() => { void load(); }, [load]);

  const isScalar = (v: unknown) => v === null || typeof v !== "object";

  const body = (() => {
    if (err) return <div className="w-tiny w-down">{err}</div>;
    if (!data) return <div className="w-empty">{fa ? "در حال دریافت…" : "Loading…"}</div>;
    const entries = Array.isArray(data) ? null : Object.entries(data as Record<string, unknown>);
    if (entries) {
      return (
        <div className="w-list">
          {entries.map(([k, v]) => (
            <div className="w-li" key={k}>
              <span className="w-mono" dir="ltr" style={{ fontSize: 11 }}>{k}</span>
              {isScalar(v) ? (
                <b className="w-mono" dir="ltr" style={{ fontSize: 11.5 }}>{cell(v)}</b>
              ) : (
                <span className="w-tiny" style={{ maxWidth: "55%", textAlign: "end" }}>{cell(v)}</span>
              )}
            </div>
          ))}
        </div>
      );
    }
    const list = (data as unknown[]).slice(0, 50);
    if (!list.length) return <div className="w-empty">{fa ? "موردی نیست." : "Nothing here."}</div>;
    const keys = Array.from(
      new Set(list.flatMap((it) => (it && typeof it === "object" ? Object.keys(it as object) : [])).filter((k) => isScalar((list[0] as any)?.[k]))),
    ).slice(0, 6);
    return (
      <div className="w-tablewrap">
        <table className="w-table">
          <thead><tr>{keys.map((k) => <th key={k} className="w-mono">{k}</th>)}</tr></thead>
          <tbody>
            {list.map((row: any, i) => (
              <tr key={i}>{keys.map((k) => <td key={k} className="w-mono" dir="ltr">{cell(row?.[k])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  })();

  return (
    <div className="w-card w-card-pad">
      <div className="w-sec">
        <div className="w-sec-title"><i />{title}</div>
        <button className="w-btn w-btn-ghost w-btn-sm" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
        </button>
      </div>
      {body}
    </div>
  );
}

/** One-shot action buttons that print the raw JSON answer (backtest, AI test…). */
export function Runner({
  title,
  hint,
  actions,
  token,
}: {
  title: string;
  hint?: string;
  token: string | null;
  actions: {
    label: string;
    path: string;
    method?: "POST" | "GET";
    body?: unknown;
    confirmText?: string;
    tone?: "gold" | "ghost" | "danger";
  }[];
}) {
  const { lang } = useI18n();
  const fa = lang === "fa";
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (a: (typeof actions)[number]) => {
    if (a.confirmText && !window.confirm(a.confirmText)) return;
    setBusy(a.label);
    setErr(null);
    setOut(null);
    try {
      const r: any = await restFetch(a.path, {
        method: a.method ?? "POST",
        token,
        body: a.method === "GET" ? undefined : (a.body ?? {}),
        timeoutMs: 120_000,
      });
      setOut(JSON.stringify(r ?? {}, null, 2).slice(0, 6000));
    } catch (e: any) {
      setErr(String(e?.message ?? "—"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="w-card w-card-pad">
      <div className="w-sec"><div className="w-sec-title"><i />{title}</div></div>
      {hint && <div className="w-tiny" style={{ marginBottom: 8, lineHeight: 1.9 }}>{hint}</div>}
      <div className="w-row" style={{ gap: 6, flexWrap: "wrap" }}>
        {actions.map((a) => (
          <button
            key={a.label}
            className={`w-btn w-btn-${a.tone ?? "ghost"} w-btn-sm`}
            onClick={() => void run(a)}
            disabled={busy !== null}
          >
            {busy === a.label ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />} {a.label}
          </button>
        ))}
      </div>
      {err && <div className="w-tiny w-down" style={{ marginTop: 8 }}>{err}</div>}
      {out && (
        <pre className="w-mono" dir="ltr" style={{ marginTop: 8, maxHeight: 260, overflow: "auto", fontSize: 10.5, lineHeight: 1.6 }}>
          {out}
        </pre>
      )}
      {!out && !err && busy && <div className="w-tiny" style={{ marginTop: 8 }}>{fa ? "در حال اجرا…" : "Running…"}</div>}
    </div>
  );
}
