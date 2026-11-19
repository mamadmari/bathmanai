'use strict';
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY,
  username       TEXT,
  first_name     TEXT,
  lang           TEXT,
  phone          TEXT,
  phone_verified INTEGER NOT NULL DEFAULT 0,
  blocked        INTEGER NOT NULL DEFAULT 0,
  sub_until      TEXT,
  sub_quota_mb   INTEGER NOT NULL DEFAULT 0,
  downloads      INTEGER NOT NULL DEFAULT 0,
  bytes          INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  last_seen      TEXT
);
CREATE TABLE IF NOT EXISTS jobs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  url         TEXT,
  title       TEXT,
  file_name   TEXT,
  mime        TEXT,
  size        INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL,
  tier        TEXT,
  kind        TEXT,
  token       TEXT UNIQUE,
  delivery    TEXT,
  error       TEXT,
  created_at  TEXT NOT NULL,
  started_at  TEXT,
  finished_at TEXT,
  expires_at  TEXT,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  type       TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
`);

const now = () => new Date().toISOString();
const newToken = () => crypto.randomBytes(18).toString('hex');

/* --------------------------- تنظیمات --------------------------- */

const DEFAULT_SETTINGS = {
  free_max_mb: 500,
  phone_max_mb: 1000,
  telegram_send_max_mb: 50,
  force_join: true,
  channel: '',
  admin_username: '@bathmanai',
  cooldown_sec: 20,
  max_per_hour: 8,
  max_concurrent_global: 1,
  max_concurrent_user: 1,
  max_daily_mb: 0,
  link_ttl_min: 180,
  delete_after_first_download: true,
  allow_private_urls: false,
  blocklist: [],
  maintenance: false,
  welcome_extra: '',
  ytdlp_format: 'bv*+ba/b',
  ytdlp_max_height: 1080,
  audio_only: false,
  plans: [
    { id: 'p30', fa: 'اشتراک یک‌ماهه', en: '1-month plan', price: '۲۹۰٬۰۰۰ تومان', days: 30, quota_mb: 20000 },
    { id: 'p90', fa: 'اشتراک سه‌ماهه', en: '3-month plan', price: '۷۵۰٬۰۰۰ تومان', days: 90, quota_mb: 70000 },
  ],
  panel_password_hash: '',
  last_webhook_error: '',
};

function settings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

const upsertSetting = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

function setSetting(key, value) {
  upsertSetting.run(String(key), JSON.stringify(value));
}

function setSettings(obj) {
  for (const [k, v] of Object.entries(obj)) setSetting(k, v);
}

function num(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** فقط کلیدهای شناخته‌شده و با اعتبارسنجی ذخیره می‌شوند */
function saveSettings(input) {
  const s = {};
  if (input.free_max_mb !== undefined) s.free_max_mb = num(input.free_max_mb, 1, 4000, 500);
  if (input.phone_max_mb !== undefined) s.phone_max_mb = num(input.phone_max_mb, 1, 4000, 1000);
  if (input.telegram_send_max_mb !== undefined) s.telegram_send_max_mb = num(input.telegram_send_max_mb, 5, 2000, 50);
  if (input.force_join !== undefined) s.force_join = !!input.force_join;
  if (input.channel !== undefined) s.channel = String(input.channel || '').trim().slice(0, 120);
  if (input.admin_username !== undefined) s.admin_username = String(input.admin_username || '').trim().slice(0, 120);
  if (input.cooldown_sec !== undefined) s.cooldown_sec = num(input.cooldown_sec, 0, 3600, 20);
  if (input.max_per_hour !== undefined) s.max_per_hour = num(input.max_per_hour, 1, 500, 8);
  if (input.max_concurrent_global !== undefined) s.max_concurrent_global = num(input.max_concurrent_global, 1, 10, 1);
  if (input.max_concurrent_user !== undefined) s.max_concurrent_user = num(input.max_concurrent_user, 1, 10, 1);
  if (input.max_daily_mb !== undefined) s.max_daily_mb = num(input.max_daily_mb, 0, 200000, 0);
  if (input.link_ttl_min !== undefined) s.link_ttl_min = num(input.link_ttl_min, 1, 10080, 180);
  if (input.delete_after_first_download !== undefined) s.delete_after_first_download = !!input.delete_after_first_download;
  if (input.allow_private_urls !== undefined) s.allow_private_urls = !!input.allow_private_urls;
  if (input.maintenance !== undefined) s.maintenance = !!input.maintenance;
  if (input.welcome_extra !== undefined) s.welcome_extra = String(input.welcome_extra || '').slice(0, 800);
  if (input.ytdlp_format !== undefined) s.ytdlp_format = String(input.ytdlp_format || 'bv*+ba/b').slice(0, 200);
  if (input.ytdlp_max_height !== undefined) s.ytdlp_max_height = num(input.ytdlp_max_height, 144, 4320, 1080);
  if (input.audio_only !== undefined) s.audio_only = !!input.audio_only;
  if (input.plans !== undefined && Array.isArray(input.plans)) {
    s.plans = input.plans.slice(0, 12).map((p, i) => ({
      id: String(p.id || `p${i + 1}`).slice(0, 24),
      fa: String(p.fa || '').slice(0, 80),
      en: String(p.en || '').slice(0, 80),
      price: String(p.price || '').slice(0, 80),
      days: num(p.days, 1, 3650, 30),
      quota_mb: num(p.quota_mb, 0, 5000000, 0),
    }));
  }
  if (input.blocklist !== undefined && Array.isArray(input.blocklist)) {
    s.blocklist = input.blocklist
      .map((d) => String(d).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 500);
  }
  if (Object.keys(s).length) setSettings(s);
  return s;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  const calc = crypto.scryptSync(String(password), salt, 32);
  const exp = Buffer.from(hash, 'hex');
  return exp.length === calc.length && crypto.timingSafeEqual(exp, calc);
}

/* ----------------------------- کاربران ----------------------------- */

const qGetUser = db.prepare('SELECT * FROM users WHERE id = ?');

function getUser(id) {
  return qGetUser.get(Number(id));
}

/** کاربر را می‌سازد یا اطلاعات پروفایلش را تازه می‌کند */
function ensureUser(from) {
  const id = Number(from.id);
  const existing = getUser(id);
  const stamp = now();
  if (!existing) {
    db.prepare('INSERT INTO users (id, username, first_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?)').run(
      id,
      from.username || null,
      from.first_name || null,
      stamp,
      stamp
    );
    return getUser(id);
  }
  db.prepare('UPDATE users SET username = ?, first_name = ?, last_seen = ? WHERE id = ?').run(
    from.username || existing.username || null,
    from.first_name || existing.first_name || null,
    stamp,
    id
  );
  return { ...existing, username: from.username || existing.username, first_name: from.first_name || existing.first_name, last_seen: stamp };
}

function setLang(id, lang) {
  db.prepare('UPDATE users SET lang = ? WHERE id = ?').run(lang === 'en' ? 'en' : 'fa', Number(id));
}

function setPhone(id, phone) {
  db.prepare('UPDATE users SET phone = ?, phone_verified = 1 WHERE id = ?').run(String(phone).slice(0, 32), Number(id));
}

function setBlocked(id, blocked) {
  db.prepare('UPDATE users SET blocked = ? WHERE id = ?').run(blocked ? 1 : 0, Number(id));
}

function grantSub(id, days, quotaMb) {
  const u = getUser(id);
  if (!u) return null;
  const start = u.sub_until && new Date(u.sub_until) > new Date() ? new Date(u.sub_until) : new Date();
  start.setDate(start.getDate() + Number(days || 30));
  const quota = Math.max(0, Number(quotaMb) || 0);
  db.prepare('UPDATE users SET sub_until = ?, sub_quota_mb = ? WHERE id = ?').run(start.toISOString(), quota, Number(id));
  logEvent(id, 'sub_grant', `${days}d/${quota}MB`);
  return getUser(id);
}

function subActive(user) {
  return !!(user && user.sub_until && new Date(user.sub_until).getTime() > Date.now());
}

function consumeQuota(id, mb) {
  const u = getUser(id);
  if (!u || !u.sub_quota_mb) return;
  const left = Math.max(0, u.sub_quota_mb - Math.ceil(mb));
  db.prepare('UPDATE users SET sub_quota_mb = ? WHERE id = ?').run(left, Number(id));
}

function addDownload(id, bytes) {
  db.prepare('UPDATE users SET downloads = downloads + 1, bytes = bytes + ? WHERE id = ?').run(Number(bytes) || 0, Number(id));
}

function listUsers({ q = '', limit = 50, offset = 0 } = {}) {
  if (q) {
    const like = `%${String(q).trim()}%`;
    return db
      .prepare(
        `SELECT * FROM users
         WHERE CAST(id AS TEXT) LIKE ? OR IFNULL(username,'') LIKE ? OR IFNULL(first_name,'') LIKE ? OR IFNULL(phone,'') LIKE ?
         ORDER BY last_seen DESC LIMIT ? OFFSET ?`
      )
      .all(like, like, like, like, limit, offset);
  }
  return db.prepare('SELECT * FROM users ORDER BY last_seen DESC LIMIT ? OFFSET ?').all(limit, offset);
}

function countUsers(q = '') {
  if (!q) return db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const like = `%${String(q).trim()}%`;
  return db
    .prepare(
      `SELECT COUNT(*) AS c FROM users
       WHERE CAST(id AS TEXT) LIKE ? OR IFNULL(username,'') LIKE ? OR IFNULL(first_name,'') LIKE ? OR IFNULL(phone,'') LIKE ?`
    )
    .get(like, like, like, like).c;
}

function allUserIds() {
  return db.prepare('SELECT id FROM users WHERE blocked = 0').all().map((r) => r.id);
}

function logEvent(userId, type, detail) {
  try {
    db.prepare('INSERT INTO events (user_id, type, detail, created_at) VALUES (?, ?, ?, ?)').run(
      userId === null || userId === undefined ? null : Number(userId),
      String(type),
      detail === undefined || detail === null ? null : String(detail).slice(0, 500),
      now()
    );
  } catch {
    /* لاگ نباید جریان ربات را قطع کند */
  }
}

/* ------------------------------ دانلودها ------------------------------ */

function createJob({ userId, url, tier }) {
  const info = db
    .prepare("INSERT INTO jobs (user_id, url, tier, status, created_at) VALUES (?, ?, ?, 'queued', ?)")
    .run(Number(userId), url || null, tier || null, now());
  return Number(info.lastInsertRowid);
}

const JOB_FIELDS = [
  'title',
  'file_name',
  'mime',
  'size',
  'status',
  'tier',
  'kind',
  'token',
  'delivery',
  'error',
  'started_at',
  'finished_at',
  'expires_at',
  'deleted_at',
];

function updateJob(id, fields) {
  const keys = Object.keys(fields).filter((k) => JOB_FIELDS.includes(k));
  if (!keys.length) return;
  const sql = `UPDATE jobs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...keys.map((k) => fields[k]), Number(id));
}

function getJob(id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(Number(id));
}

function jobByToken(token) {
  return db.prepare('SELECT * FROM jobs WHERE token = ?').get(String(token));
}

function userJobsSince(userId, sinceIso) {
  return db.prepare('SELECT COUNT(*) AS c FROM jobs WHERE user_id = ? AND created_at >= ?').get(Number(userId), sinceIso).c;
}

function userActiveJobs(userId) {
  return db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE user_id = ? AND status IN ('queued','running')").get(Number(userId)).c;
}

function userBytesSince(userId, sinceIso) {
  return db
    .prepare('SELECT IFNULL(SUM(size),0) AS s FROM jobs WHERE user_id = ? AND created_at >= ?')
    .get(Number(userId), sinceIso).s;
}

function lastUserJob(userId) {
  return db.prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(Number(userId));
}

function queuedCount() {
  return db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'queued'").get().c;
}

function runningCount() {
  return db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'running'").get().c;
}

function listJobs({ q = '', limit = 50, offset = 0 } = {}) {
  if (q) {
    const like = `%${String(q).trim()}%`;
    return db
      .prepare(
        `SELECT j.*, u.username, u.first_name FROM jobs j LEFT JOIN users u ON u.id = j.user_id
         WHERE CAST(j.id AS TEXT) LIKE ? OR CAST(j.user_id AS TEXT) LIKE ? OR IFNULL(j.title,'') LIKE ? OR IFNULL(j.url,'') LIKE ?
         ORDER BY j.id DESC LIMIT ? OFFSET ?`
      )
      .all(like, like, like, like, limit, offset);
  }
  return db
    .prepare(
      `SELECT j.*, u.username, u.first_name FROM jobs j LEFT JOIN users u ON u.id = j.user_id
       ORDER BY j.id DESC LIMIT ? OFFSET ?`
    )
    .all(limit, offset);
}

function countJobs(q = '') {
  if (!q) return db.prepare('SELECT COUNT(*) AS c FROM jobs').get().c;
  const like = `%${String(q).trim()}%`;
  return db
    .prepare(
      `SELECT COUNT(*) AS c FROM jobs
       WHERE CAST(id AS TEXT) LIKE ? OR CAST(user_id AS TEXT) LIKE ? OR IFNULL(title,'') LIKE ? OR IFNULL(url,'') LIKE ?`
    )
    .get(like, like, like, like).c;
}

/** رکوردهایی که فایلشان باید پاک شود */
function expiredJobs() {
  return db
    .prepare("SELECT * FROM jobs WHERE status IN ('ready','queued','running') AND expires_at IS NOT NULL AND expires_at < ?")
    .all(now());
}

function stats() {
  const all = db.prepare("SELECT COUNT(*) c, IFNULL(SUM(size),0) s FROM jobs WHERE status IN ('sent','link')").get();
  const today = db.prepare("SELECT COUNT(*) c FROM jobs WHERE created_at >= ?").get(new Date(new Date().setHours(0, 0, 0, 0)).toISOString()).c;
  return {
    users: countUsers(''),
    jobs: all.c,
    bytes: all.s,
    today,
    queued: queuedCount(),
    running: runningCount(),
  };
}

function dailySeries(days = 14) {
  const from = new Date(Date.now() - (days - 1) * 86400000);
  from.setHours(0, 0, 0, 0);
  return db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS jobs, IFNULL(SUM(size),0) AS bytes
       FROM jobs WHERE created_at >= ? GROUP BY day ORDER BY day DESC`
    )
    .all(from.toISOString());
}

function topUsers(limit = 10) {
  return db
    .prepare(
      `SELECT u.id, u.username, u.first_name, COUNT(j.id) AS jobs, IFNULL(SUM(j.size),0) AS bytes, MAX(j.created_at) AS last
       FROM users u JOIN jobs j ON j.user_id = u.id AND j.status IN ('sent','link')
       GROUP BY u.id ORDER BY jobs DESC LIMIT ?`
    )
    .all(limit);
}

function recentEvents(limit = 50) {
  return db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(limit);
}

function expiredLinksCleanup(nowIso) {
  db.prepare("UPDATE jobs SET status = 'expired' WHERE status = 'ready' AND expires_at IS NOT NULL AND expires_at < ?").run(nowIso);
}

function activeJobIds() {
  return db
    .prepare("SELECT id FROM jobs WHERE status IN ('queued','running','ready')")
    .all()
    .map((r) => r.id);
}

function freshJobs(sinceIso) {
  return db.prepare('SELECT * FROM jobs WHERE created_at >= ? ORDER BY id DESC').all(sinceIso);
}

module.exports = {
  db,
  now,
  newToken,
  settings,
  setSetting,
  setSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  hashPassword,
  verifyPassword,
  getUser,
  ensureUser,
  setLang,
  setPhone,
  setBlocked,
  grantSub,
  subActive,
  consumeQuota,
  addDownload,
  listUsers,
  countUsers,
  allUserIds,
  logEvent,
  createJob,
  updateJob,
  getJob,
  jobByToken,
  userJobsSince,
  userActiveJobs,
  userBytesSince,
  lastUserJob,
  queuedCount,
  runningCount,
  listJobs,
  countJobs,
  expiredJobs,
  expiredLinksCleanup,
  activeJobIds,
  freshJobs,
  stats,
  dailySeries,
  topUsers,
  recentEvents,
};
