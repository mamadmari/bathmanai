'use strict';
/** سرور HTTP: webhook تلگرام، پنل مدیریت و لینک‌های دانلود. */
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const config = require('./config');
const store = require('./db');
const tg = require('./tg');
const bot = require('./bot');
const files = require('./files');
const panel = require('./panel');
const api = require('./api');

const PREFIX = '/dlbot';
const LIMIT = 50;
const SECRET = config.sessionSecret || crypto.createHash('sha256').update(`dlbot|${config.token}`).digest('hex');
const loginFails = new Map();

/* ----------------------------- ابزارها ----------------------------- */

function ensurePanelPassword() {
  const st = store.settings();
  if (st.panel_password_hash) return;
  const pwd = config.panelPassword || crypto.randomBytes(9).toString('base64url');
  store.setSetting('panel_password_hash', store.hashPassword(pwd));
  try {
    fs.writeFileSync(path.join(config.dataDir, 'panel-password.txt'), `${pwd}\n`, { mode: 0o600 });
  } catch {
    /* ignore */
  }
  console.log('[panel] initial password stored in data/panel-password.txt');
}

function sign(payload) {
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
  return `${p}.${mac}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [p, mac] = token.split('.');
  const calc = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
  if (calc.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(mac))) return null;
  try {
    const data = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    return data.exp && data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const sessionOf = (req) => verifyToken(cookies(req).dlbot_sess);
const isAuthed = (req) => !!sessionOf(req);

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || '';
}

function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseForm(text) {
  const out = {};
  for (const [k, v] of new URLSearchParams(text)) out[k] = v;
  return out;
}

function send(res, status, html, headers = {}) {
  const body = Buffer.from(String(html), 'utf8');
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...headers,
  });
  res.end(body);
}

const redirect = (res, to) => {
  res.writeHead(302, { location: to, 'cache-control': 'no-store' });
  res.end();
};

function csv(res, name, header, rows) {
  const q = (v) => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
  const text = '\uFEFF' + [header.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\r\n');
  const buf = Buffer.from(text, 'utf8');
  res.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${name}"`,
    'content-length': buf.length,
    'cache-control': 'no-store',
  });
  res.end(buf);
}

const sameOrigin = (req) => {
  const src = req.headers.origin || req.headers.referer || '';
  if (!src) return true;
  try {
    return new URL(src).host === String(req.headers.host || '');
  } catch {
    return false;
  }
};

const tools = { ytdlp: '', ffmpeg: '' };
function readTools() {
  for (const [key, bin, args] of [
    ['ytdlp', config.ytDlp, ['--version']],
    ['ffmpeg', config.ffmpeg, ['-version']],
  ]) {
    try {
      tools[key] = execFileSync(bin, args, { encoding: 'utf8', timeout: 5000 }).split('\n')[0].trim().slice(0, 60);
    } catch {
      tools[key] = '';
    }
  }
}

/* ------------------------------ سلامت ------------------------------ */

const healthCache = { at: 0, data: null };

async function health() {
  if (healthCache.data && Date.now() - healthCache.at < 20000) return healthCache.data;
  const st = store.settings();
  let me = { ok: false, description: 'timeout' };
  let wh = { ok: false, description: 'timeout' };
  try {
    const [meRes, whRes] = await Promise.all([tg.getMe(8000), tg.getWebhookInfo(8000)]);
    me = meRes;
    wh = whRes;
  } catch (err) {
    me = { ok: false, description: err.message };
  }
  let channelError = '';
  if (st.channel) {
    const chat = await tg.getChat(st.channel, 8000).catch((err) => ({ ok: false, description: err.message }));
    if (!chat.ok) channelError = chat.description || 'chat not found';
  }
  const disk = files.diskInfo();
  let total = 0;
  try {
    const s = fs.statfsSync(config.dataDir);
    total = s.blocks * s.bsize;
  } catch {
    total = 0;
  }
  const data = {
    bot: { ok: !!me.ok, username: me.ok ? me.result.username : '', error: me.ok ? '' : me.description || '' },
    webhook: {
      url: wh.ok ? wh.result.url || '' : '',
      pending: wh.ok ? wh.result.pending_update_count || 0 : 0,
      error: wh.ok ? wh.result.last_error_message || '' : wh.description || '',
    },
    channel: {
      name: st.channel,
      lock: !!st.force_join && !!st.channel,
      error: channelError || st.channel_lock_error || '',
    },
    disk: { free: disk.free, used: disk.used, total },
    tools,
    localApi: config.localApi,
  };
  healthCache.at = Date.now();
  healthCache.data = data;
  return data;
}

/* --------------------------- مسیرهای پنل --------------------------- */

/** وضعیت فایل کوکی برای نمایش در پنل */
function cookiesInfo() {
  try {
    const st = fs.statSync(path.join(config.dataDir, 'cookies.txt'));
    return { exists: true, kb: Math.max(1, Math.round(st.size / 1024)), at: st.mtime.toISOString().slice(0, 16).replace('T', ' ') };
  } catch {
    return { exists: false, kb: 0, at: '' };
  }
}

/** مسیر را با یا بدون پیشوند /dlbot می‌پذیرد */
function routeOf(pathname) {
  if (pathname === PREFIX || pathname.startsWith(`${PREFIX}/`)) return pathname.slice(PREFIX.length) || '/';
  return pathname || '/';
}

async function routeGet(req, res, url) {
  const route = routeOf(url.pathname);
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const q = String(url.searchParams.get('q') || '').slice(0, 80);
  const flash = url.searchParams.get('ok') ? { type: 'ok', text: url.searchParams.get('ok') } : null;

  if (!isAuthed(req)) {
    if (route === '/health') {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    send(res, 200, panel.loginPage(url.searchParams.get('e') ? 'رمز اشتباه است.' : ''));
    return;
  }

  if (route === '/' || route === '') {
    const data = await health();
    send(
      res,
      200,
      panel.dashboardPage({
        stats: store.stats(),
        health: data,
        jobs: store.listJobs({ limit: 10 }),
        live: bot.liveStats(),
      })
    );
    return;
  }

  if (route === '/users') {
    send(
      res,
      200,
      panel.usersPage({
        rows: store.listUsers({ q, limit: LIMIT, offset: (page - 1) * LIMIT }),
        total: store.countUsers(q),
        page,
        limit: LIMIT,
        q,
      })
    );
    return;
  }

  if (route === '/files') {
    send(
      res,
      200,
      panel.filesPage({
        rows: store.listJobs({ q, limit: LIMIT, offset: (page - 1) * LIMIT }),
        total: store.countJobs(q),
        page,
        limit: LIMIT,
        q,
      })
    );
    return;
  }

  if (route === '/reports') {
    send(
      res,
      200,
      panel.reportsPage({
        series: store.dailySeries(14),
        top: store.topUsers(10),
        events: store.recentEvents(40),
        stats: store.stats(),
      })
    );
    return;
  }

  if (route === '/settings') {
    send(res, 200, panel.settingsPage({ st: store.settings(), saved: !!flash, cookies: cookiesInfo() }));
    return;
  }

  if (route === '/files.csv') {
    const rows = store.listJobs({ q, limit: 5000 }).map((j) => [
      j.id,
      j.user_id,
      j.username || j.first_name || '',
      j.title || '',
      j.url || '',
      j.size || 0,
      j.status,
      j.tier || '',
      j.delivery || '',
      j.error || '',
      j.created_at,
      j.deleted_at || '',
    ]);
    csv(res, 'dlbot-files.csv', ['id', 'user_id', 'user', 'title', 'url', 'bytes', 'status', 'tier', 'delivery', 'error', 'created_at', 'deleted_at'], rows);
    return;
  }

  if (route === '/users.csv') {
    const rows = store.listUsers({ q, limit: 5000 }).map((u) => [
      u.id,
      u.username || '',
      u.first_name || '',
      u.lang || '',
      u.phone || '',
      u.phone_verified ? 'yes' : 'no',
      u.sub_until || '',
      u.sub_quota_mb || 0,
      u.downloads || 0,
      u.bytes || 0,
      u.blocked ? 'yes' : 'no',
      u.created_at,
      u.last_seen || '',
    ]);
    csv(res, 'dlbot-users.csv', ['id', 'username', 'name', 'lang', 'phone', 'phone_verified', 'sub_until', 'sub_quota_mb', 'downloads', 'bytes', 'blocked', 'created_at', 'last_seen'], rows);
    return;
  }

  if (route === '/health') {
    const data = await health();
    const body = Buffer.from(JSON.stringify({ ...data, stats: store.stats(), live: bot.liveStats() }));
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-store' });
    res.end(body);
    return;
  }

  if (route === '/logout') {
    res.writeHead(302, {
      location: '/',
      'set-cookie': 'dlbot_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    });
    res.end();
    return;
  }

  send(res, 404, panel.layout('پیدا نشد', '<div class="card">صفحه پیدا نشد. <a href="/">داشبورد</a></div>'));
}

/* --------------------------- مسیرهای POST --------------------------- */

async function routePost(req, res, url) {
  const route = routeOf(url.pathname);
  const body = await readBody(req);
  const form = parseForm(body);

  if (route === '/login') {
    const ip = clientIp(req);
    const rec = loginFails.get(ip) || { n: 0, until: 0 };
    if (rec.until > Date.now()) {
      redirect(res, '/?e=1');
      return;
    }
    const st = store.settings();
    if (!store.verifyPassword(form.password || '', st.panel_password_hash)) {
      rec.n += 1;
      if (rec.n >= 5) {
        rec.n = 0;
        rec.until = Date.now() + 10 * 60000;
      }
      loginFails.set(ip, rec);
      store.logEvent(null, 'panel_login_fail', ip);
      redirect(res, '/?e=1');
      return;
    }
    loginFails.delete(ip);
    store.logEvent(null, 'panel_login', ip);
    const token = sign({ exp: Date.now() + 7 * 86400000 });
    const isHttps = String(req.headers['x-forwarded-proto'] || '').includes('https');
    res.writeHead(302, {
      location: '/',
      'set-cookie': `dlbot_sess=${token}; Path=/; HttpOnly; SameSite=Lax${isHttps ? '; Secure' : ''}; Max-Age=604800`,
    });
    res.end();
    return;
  }

  if (!isAuthed(req)) {
    send(res, 403, panel.loginPage('جلسه منقضی شده؛ دوباره وارد شو.'));
    return;
  }
  if (!sameOrigin(req)) {
    send(res, 403, panel.loginPage('درخواست از دامنه نامعتبر.'));
    return;
  }

  if (route === '/settings') {
    const input = {
      free_max_mb: form.free_max_mb,
      phone_max_mb: form.phone_max_mb,
      telegram_send_max_mb: form.telegram_send_max_mb,
      link_ttl_min: form.link_ttl_min,
      delete_after_first_download: form.delete_after_first_download === 'on',
      channel: form.channel,
      admin_username: form.admin_username,
      force_join: form.force_join === 'on',
      cooldown_sec: form.cooldown_sec,
      max_per_hour: form.max_per_hour,
      max_concurrent_user: form.max_concurrent_user,
      max_concurrent_global: form.max_concurrent_global,
      max_daily_mb: form.max_daily_mb,
      ytdlp_format: form.ytdlp_format,
      ytdlp_max_height: form.ytdlp_max_height,
      audio_only: form.audio_only === 'on',
      allow_private_urls: form.allow_private_urls === 'on',
      maintenance: form.maintenance === 'on',
      welcome_extra: form.welcome_extra,
      blocklist: String(form.blocklist || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
    let note = 'تنظیمات ذخیره شد.';
    if (form.plans) {
      try {
        input.plans = JSON.parse(form.plans);
      } catch {
        note = 'تنظیمات ذخیره شد؛ اما JSON پلن‌ها نامعتبر بود.';
      }
    }
    store.saveSettings(input);

    // کوکی‌ها (Netscape cookies.txt) → /var/lib/dlbot/cookies.txt
    if (typeof form.cookies === 'string' && form.cookies.trim()) {
      try {
        const txt = form.cookies.replace(/\r\n/g, '\n').trim();
        if (!/^#?\s*(HttpOnly_)?/i.test(txt) && !/\t/.test(txt)) {
          note = 'کوکی نامعتبر بود (باید فرمت Netscape با تب باشد).';
        } else {
          fs.writeFileSync(path.join(config.dataDir, 'cookies.txt'), `${txt}\n`, { mode: 0o600 });
          note = 'تنظیمات و کوکی‌ها ذخیره شد.';
        }
      } catch (err) {
        note = `ذخیره کوکی ناموفق: ${err.message}`;
      }
    }
    if (form.clear_cookies === 'on') {
      try {
        fs.rmSync(path.join(config.dataDir, 'cookies.txt'), { force: true });
        note = 'تنظیمات ذخیره شد؛ فایل کوکی پاک شد.';
      } catch {
        /* ignore */
      }
    }

    // تست کانال: شناسه عددی یا @username
    if (form.action === 'test_channel') {
      const ch = String(form.channel || store.settings().channel || '').trim();
      if (!ch) {
        redirect(res, `/settings?ok=${encodeURIComponent('اول کانال را وارد کن.')}`);
        return;
      }
      const chatId = /^-?\d+$/.test(ch) ? Number(ch) : ch;
      const info = await tg.getChat(chatId, 15000);
      let msg;
      if (info.ok) {
        const me = await tg.getChatMember(chatId, Number((config.adminIds || [])[0] || 0));
        msg = me.ok
          ? `کانال «${info.result.title || info.result.username || ch}» پیدا شد؛ وضعیت ربات: ${me.result.status}`
          : `کانال «${info.result.title || ch}» پیدا شد؛ ولی وضعیت ربات خوانده نشد: ${me.description || ''}`;
        if (me.ok && !['administrator', 'creator'].includes(me.result.status)) {
          msg += ' — ربات باید ادمین کانال باشد.';
        }
        store.setSetting('channel_lock_error', '');
      } else {
        msg = `خطا: ${String(info.description || 'getChat failed').slice(0, 120)}`;
        store.setSetting('channel_lock_error', msg);
      }
      store.logEvent(null, 'channel_test', msg.slice(0, 200));
      redirect(res, `/settings?ok=${encodeURIComponent(msg)}`);
      return;
    }

    if (form.new_password) {
      if (String(form.new_password).length < 8 || form.new_password !== form.new_password2) {
        redirect(res, `/settings?ok=${encodeURIComponent('رمز جدید باید حداقل ۸ کاراکتر و با تکرارش یکسان باشد.')}`);
        return;
      }
      store.setSetting('panel_password_hash', store.hashPassword(form.new_password));
      note = 'تنظیمات و رمز پنل ذخیره شد.';
    }
    healthCache.data = null;
    store.logEvent(null, 'settings_saved', 'panel');
    redirect(res, `/settings?ok=${encodeURIComponent(note)}`);
    return;
  }

  if (route === '/users/action') {
    const id = Number(form.id);
    const action = String(form.action || '');
    if (!id) {
      redirect(res, `/users?ok=${encodeURIComponent('کاربر نامعتبر.')}`);
      return;
    }
    if (action === 'ban') store.setBlocked(id, true);
    else if (action === 'unban') store.setBlocked(id, false);
    else if (action === 'grant') store.grantSub(id, Number(form.days) || 30, Number(form.quota) || 0);
    store.logEvent(id, `panel_${action}`, 'by panel');
    redirect(res, `/users?ok=${encodeURIComponent(action === 'grant' ? 'اشتراک اعمال شد.' : 'وضعیت کاربر تغییر کرد.')}`);
    return;
  }

  if (route === '/broadcast') {
    const text = String(form.text || '').trim().slice(0, 3500);
    if (!text) {
      redirect(res, `/?ok=${encodeURIComponent('متن پیام خالی است.')}`);
      return;
    }
    const ids = store.allUserIds();
    (async () => {
      let sent = 0;
      for (const id of ids) {
        const r = await tg.sendMessage(id, text);
        if (r.ok) sent += 1;
        await new Promise((r2) => setTimeout(r2, 45));
      }
      store.logEvent(null, 'broadcast', `panel ${sent}/${ids.length}`);
    })();
    redirect(res, `/?ok=${encodeURIComponent(`ارسال به ${ids.length} کاربر شروع شد.`)}`);
    return;
  }

  redirect(res, `/`);
}

/* ------------------------- لینک دانلود و webhook ------------------------- */

async function serveLink(req, res, token) {
  const job = store.jobByToken(token);
  const st = store.settings();
  if (!job || job.status !== 'ready' || (job.expires_at && new Date(job.expires_at) < new Date())) {
    res.writeHead(410, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('expired');
    return;
  }
  await files.serveJobFile(req, res, job, { deleteAfter: !!st.delete_after_first_download });
}

async function receiveHook(req, res, secret) {
  const header = req.headers['x-telegram-bot-api-secret-token'];
  if (!config.webhookSecret || secret !== config.webhookSecret || header !== config.webhookSecret) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('forbidden');
    return;
  }
  const raw = await readBody(req, 2 * 1024 * 1024).catch(() => '');
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('ok');
  if (!raw) return;
  let update = null;
  try {
    update = JSON.parse(raw);
  } catch {
    return;
  }
  bot.handleUpdate(update);
}

/* ------------------------------ راه‌اندازی ------------------------------ */

async function handler(req, res) {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400);
    res.end('bad request');
    return;
  }
  const route = routeOf(url.pathname);

  try {
    if (route.startsWith('/f/')) {
      await serveLink(req, res, route.slice(3));
      return;
    }
    if (route.startsWith('/hook/')) {
      await receiveHook(req, res, route.slice(6));
      return;
    }
    if (route.startsWith('/api/')) {
      const bodyText = req.method === 'POST' ? await readBody(req, 64 * 1024).catch(() => '') : '';
      await api.handle(req, res, route.slice(5), url, bodyText);
      return;
    }
    if (req.method === 'POST') {
      await routePost(req, res, url);
      return;
    }
    await routeGet(req, res, url);
  } catch (err) {
    console.error('[http]', err.message);
    if (!res.headersSent) send(res, 500, panel.layout('خطا', '<div class="card">خطای داخلی سرور.</div>'));
  }
}

async function start() {
  if (!config.token) {
    console.error('[dlbot] BOT_TOKEN تنظیم نشده است.');
    process.exit(1);
  }
  ensurePanelPassword();
  readTools();
  bot.resetInterrupted();
  files.startJanitor();

  const server = http.createServer(handler);
  server.listen(config.port, config.host, () => {
    console.log(`[dlbot] listening http://${config.host}:${config.port}${PREFIX}/`);
  });

  if (config.botMode === 'poll' && config.token) {
    require('./poller')
      .start()
      .catch((err) => console.error('[poll]', err.message));
  } else if (config.botMode === 'poll') {
    console.warn('[poll] BOT_MODE=poll ولی BOT_TOKEN تنظیم نشده است.');
  } else if (config.webhookSecret) {
    const hookUrl = `${config.publicBase}/hook/${config.webhookSecret}`;
    tg.setWebhook(hookUrl, config.webhookSecret)
      .then((r) => {
        console.log('[webhook]', r.ok ? 'set' : `failed: ${r.description}`);
        if (!r.ok) store.setSetting('last_webhook_error', String(r.description || ''));
      })
      .catch((err) => console.error('[webhook]', err.message));
  } else {
    console.warn('[webhook] WEBHOOK_SECRET تنظیم نشده؛ webhook ثبت نشد.');
  }
}

module.exports = { start, handler };

start().catch((err) => {
  console.error('[dlbot] boot failed:', err);
  process.exit(1);
});