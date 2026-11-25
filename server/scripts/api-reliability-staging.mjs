import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";

if (!/^wolf_release_staging_[0-9]{8}$/.test(process.env.PGDATABASE ?? "")) throw new Error("isolated staging database required");
const { pool } = await import("../dist/db.js");
const { hashPassword, createSession } = await import("../dist/auth.js");
const { RISK_PRESETS } = await import("../dist/settings.js");
const { tx, insertPositionOrThrow } = await import("../dist/db.js");
const { closePosition, engineTick } = await import("../dist/engine.js");
const port = 3107;
const botToken = "123456:isolated-staging-fixture";
const api = spawn(process.execPath, ["dist/api.js"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    APP_PORT: String(port),
    NODE_ENV: "test",
    TELEGRAM_BOT_TOKEN: botToken,
  },
  stdio: ["ignore", "ignore", "inherit"],
});
let count = 0;
let token;
async function request(path, body, expected = 200) {
  const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
  count++;
  return data;
}
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const password = crypto.randomBytes(24).toString("hex");
  const username = `staging-${Date.now()}`;
  const admin = (await pool.query("INSERT INTO users (username,password_hash,role,is_admin,enabled) VALUES ($1,$2,'admin',true,true) RETURNING id", [username, await hashPassword(password)])).rows[0];
  const logged = await request("/auth/login", { username, password });
  assert.ok(logged.token);
  token = logged.token;
  assert.equal((await request("/auth/me")).user.id, admin.id);
  await request("/auth/login", { username, password: "wrong" }, 401);
  for (const preset of Object.keys(RISK_PRESETS)) {
    await request("/admin/settings/preset", { preset, confirmOverwrite: true });
    const s = (await request("/admin/settings")).settings;
    for (const [key, value] of Object.entries(RISK_PRESETS[preset])) assert.deepEqual(s[key], value, `${preset}:${key}`);
  }
  await request("/admin/settings", { settings: { "risk.minScore": "81", "risk.trailingStop": "false" } });
  let s = (await request("/admin/settings")).settings;
  assert.equal(s["risk.minScore"], 81);
  assert.equal(s["risk.trailingStop"], false);
  assert.equal(s["risk.preset"], "custom");
  await request("/admin/settings/preset", { preset: "balanced" }, 409);
  await request("/admin/settings", { settings: { "risk.minScore": 82 }, expected: { "risk.minScore": 70 } }, 409);
  await request("/admin/settings", { settings: { "unknown.key": true } }, 400);
  await request("/admin/settings", { settings: { "risk.minScore": "invalid" } }, 400);
  await request("/admin/settings", { settings: { "engine.realizedPnl": 0 } }, 400);
  await pool.query("INSERT INTO system_settings (key,value,group_name) VALUES ('engine.mode','\"live\"'::jsonb,'engine') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value");
  await request("/admin/engine/mode", { telegramEnabled: "false" });
  s = (await request("/admin/settings")).settings;
  assert.equal(s["engine.mode"], "live");
  assert.equal(s["telegram.enabled"], false);
  await request("/auth/preferences", { name: "Staging profile", language: "en", notificationsEnabled: false });
  assert.equal((await request("/auth/me")).user.name, "Staging profile");
  const created = await request("/admin/users", { username: `user-${Date.now()}`, password, role: "user", name: "Staging User" });
  assert.equal(created.user.role, "user");
  assert.equal(created.user.is_vip, false);
  const userId = created.user.id;
  const wallet = (await pool.query("SELECT id FROM wallets WHERE user_id=$1", [userId])).rows[0];
  await assert.rejects(pool.query("UPDATE wallets SET balance=-1 WHERE id=$1", [wallet.id]), /wallets_balance_nonnegative/);
  count++;
  token = (await request("/auth/login", { username: created.user.username, password })).token;
  await request("/admin/settings", undefined, 403);
  await request("/auth/miniapp", { initData: "tampered" }, 401);
  await request("/account");
  await request("/me/positions");
  await request("/me/trades");
  // Signed fixtures test HMAC and real registration/session SQL, not Telegram
  // network delivery. They run only in this isolated database.
  await pool.query("INSERT INTO system_settings(key,value,group_name) VALUES ('telegram.token',$1,'telegram') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value", [JSON.stringify(botToken)]);
  const fields = new URLSearchParams({ auth_date: String(Math.floor(Date.now()/1000)), user: JSON.stringify({ id: 987654321, first_name: "Staging Telegram" }) });
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  fields.set("hash", crypto.createHmac("sha256", secret).update([...fields.entries()].map(([k,v]) => `${k}=${v}`).sort().join("\n")).digest("hex"));
  const telegram = await request("/auth/miniapp", { initData: fields.toString() });
  assert.equal(telegram.user.tg_id, 987654321);
  assert.ok(telegram.token);
  // Explicit SIM lifecycle with actual PostgreSQL insert, settlement, close,
  // PnL update and persistent outbox. NO exchange/fill is claimed here.
  await pool.query("UPDATE system_settings SET value='\"demo\"'::jsonb WHERE key='engine.mode'");
  await pool.query("INSERT INTO system_settings(key,value,group_name) VALUES ('engine.enabled','false','engine') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value");
  const simulated = await tx((client) => insertPositionOrThrow(client, {
    symbol: `SIM${Date.now()}`, market: "crypto", side: "long", entry: 100, quantity: 1, size: 100,
    leverage: 1, margin: 100, score: 90, confidence: 0.8, stopLoss: 90, takeProfit: 120,
    openTime: Date.now(), mode: "demo", exchange: "paper", type: "spot",
  }));
  await pool.query("UPDATE open_positions SET user_id=$1 WHERE id=$2", [userId, simulated.id]);
  const owned = (await pool.query("SELECT * FROM open_positions WHERE id=$1", [simulated.id])).rows[0];
  const before = Number((await pool.query("SELECT value FROM system_settings WHERE key='engine.realizedPnl'")).rows[0]?.value ?? 0);
  const closed = await closePosition(owned.id, "sim_test_close", 110, owned);
  assert.equal(Number(closed.profit), 10);
  assert.equal(closed.user_id, userId);
  assert.equal((await pool.query("SELECT id FROM open_positions WHERE id=$1", [owned.id])).rowCount, 0);
  assert.equal(Number((await pool.query("SELECT value FROM system_settings WHERE key='engine.realizedPnl'")).rows[0].value), before+10);
  count++;
  await pool.query("DELETE FROM telegram_outbox WHERE chat_id='987654322'");
  await pool.query("UPDATE users SET tg_id=NULL WHERE tg_id=987654322");
  await pool.query("UPDATE users SET tg_id=987654322 WHERE id=$1", [userId]);
  await pool.query("INSERT INTO system_settings(key,value,group_name) VALUES ('telegram.enabled','true','telegram') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value");
  const { notifyUserTelegram } = await import("../dist/telegram.js");
  await notifyUserTelegram(userId, "SIM close +10 USDT", "SIM close +10 USDT");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM telegram_outbox WHERE chat_id='987654322' AND status='pending'")).rows[0].n, 1);
  count++;
  console.log(JSON.stringify({ sim: "PASS", executionMode: "demo", explicitTestPrice: 110, profit: 10, openRowRemoved: true, closedOwnerPreserved: true, realizedPnlAtomic: true, telegramPersistentQueued: true, telegramNetworkDelivery: "NOT_TESTED", realExchangeOrdersSubmitted: 0 }));
  console.log(JSON.stringify({ ok: true, checks: count, passwordLogin: true, allRiskPresetsPersisted: true, stringsNormalized: true, customOverwriteBlocked: true, staleSaveBlocked: true, switchPreservesLiveMode: true, preferencesPersisted: true, regularUserCreated: true, negativeBalanceRejected: true, adminDeniedToUser: true, forgedTelegramRejected: true, realExchangeOrdersSubmitted: 0 }));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  api.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => api.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
  if (api.exitCode === null) api.kill("SIGKILL");
  await Promise.race([pool.end(), new Promise((resolve) => setTimeout(resolve, 2000))]);
}
