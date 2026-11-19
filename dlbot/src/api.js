'use strict';
/**
 * API برای ربات سرورلس تلگرام (tgcloud).
 * همه‌چیز پشت X-Api-Key و روی HTTPS است؛ منطق سقف/پلن/اسپم در policy مشترک است.
 */
const crypto = require('node:crypto');
const config = require('./config');
const store = require('./db');
const dl = require('./downloader');
const policy = require('./policy');
const apiQueue = require('./apiqueue');

const MB = policy.MB;
const API_KEY = process.env.API_KEY || '';

function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sameKey(req) {
  if (!API_KEY) return false;
  const got = String(req.headers['x-api-key'] || '');
  const a = Buffer.from(got);
  const b = Buffer.from(API_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function userPayload(user) {
  return {
    id: user.id,
    lang: user.lang || '',
    phone_verified: !!user.phone_verified,
    phone: user.phone || '',
    blocked: !!user.blocked,
    sub_active: store.subActive(user),
    sub_until: user.sub_until || '',
    sub_quota_mb: user.sub_quota_mb || 0,
    downloads: user.downloads || 0,
    bytes: user.bytes || 0,
  };
}

function settingsPayload(st) {
  return {
    free_max_mb: st.free_max_mb,
    phone_max_mb: st.phone_max_mb,
    channel: st.channel || '',
    force_join: !!st.force_join,
    admin_username: st.admin_username || '',
    plans: st.plans || [],
    link_ttl_min: st.link_ttl_min,
    telegram_send_max_mb: st.telegram_send_max_mb,
    maintenance: !!st.maintenance,
    cooldown_sec: st.cooldown_sec,
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (promise, ms, fallback) => Promise.race([promise, wait(ms).then(() => fallback)]);

async function routeHello(body) {
  const from = body.from || {};
  if (!from.id) return [400, { ok: false, error: 'from required' }];
  const user = store.ensureUser(from);
  store.logEvent(user.id, 'hello', 'serverless');
  return [200, { ok: true, user: userPayload(user), settings: settingsPayload(store.settings()) }];
}

async function routeLang(body) {
  const uid = Number(body.uid);
  if (!uid) return [400, { ok: false }];
  store.setLang(uid, body.lang === 'en' ? 'en' : 'fa');
  return [200, { ok: true }];
}

async function routePhone(body) {
  const uid = Number(body.uid);
  const phone = String(body.phone || '').slice(0, 32);
  if (!uid || !/^\+?[0-9]{6,20}$/.test(phone.replace(/\s/g, ''))) return [400, { ok: false, error: 'bad phone' }];
  const user = store.getUser(uid);
  if (!user) return [404, { ok: false }];
  store.setPhone(uid, phone);
  store.logEvent(uid, 'phone', phone);
  return [200, { ok: true, user: userPayload(store.getUser(uid)) }];
}

async function routeRequest(body) {
  const uid = Number(body.uid);
  const rawUrl = String(body.url || '').slice(0, 2048);
  const user = store.getUser(uid);
  if (!user) return [404, { ok: false, reason: 'no_user' }];
  if (user.blocked) return [200, { ok: false, reason: 'banned' }];

  const st = store.settings();
  if (st.maintenance && !config.isAdmin(uid)) return [200, { ok: false, reason: 'maintenance' }];

  const url = dl.extractUrl(rawUrl);
  if (!url) {
    policy.bumpStrike(uid);
    return [200, { ok: false, reason: 'invalid_url' }];
  }

  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return [200, { ok: false, reason: 'invalid_url' }];
  }
  if ((st.blocklist || []).some((d) => host === d || host.endsWith(`.${d}`))) {
    return [200, { ok: false, reason: 'blocked_domain' }];
  }

  const spam = policy.checkSpam(user, st);
  if (!spam.ok) {
    store.logEvent(uid, 'rate_limited', spam.reason);
    return [200, { ok: false, ...spam }];
  }

  let probe = { kind: 'media', size: 0, filename: '' };
  try {
    probe = await withTimeout(dl.probe(url, st.allow_private_urls), 12000, { kind: 'media', size: 0, filename: '' });
  } catch (err) {
    if (err.code === 'private_host' || err.code === 'dns') {
      policy.bumpStrike(uid);
      return [200, { ok: false, reason: 'invalid_url' }];
    }
    probe = { kind: 'media', size: 0, filename: '' };
  }

  let estimate = probe.size || 0;
  let title = probe.filename || '';
  if (probe.kind === 'media' && !estimate) {
    const info = await withTimeout(dl.probeMedia(url).catch(() => ({ size: 0, title: '' })), 15000, { size: 0, title: '' });
    estimate = info.size || 0;
    title = info.title || title;
  }

  if (estimate > 0) {
    const tier = policy.tierFor(user, st, estimate);
    if (tier.tier === 'need_phone' || tier.tier === 'need_sub' || tier.tier === 'quota') {
      store.logEvent(uid, 'tier_block', `${tier.tier} ${Math.round(estimate / MB)}MB`);
      return [200, { ok: false, reason: tier.tier, size: estimate, left: tier.left || 0 }];
    }
  }

  const jobId = store.createJob({ userId: uid, url, tier: 'pending' });
  store.updateJob(jobId, { title: title || url.slice(0, 120), kind: probe.kind });
  apiQueue.enqueue(jobId);
  store.logEvent(uid, 'job_created', `${jobId} ${host}`.slice(0, 200));
  return [200, { ok: true, jobId, estimate }];
}

async function routeJob(url) {
  const uid = Number(url.searchParams.get('uid'));
  const id = Number(url.searchParams.get('id'));
  const job = store.getJob(id);
  if (!job || (uid && Number(job.user_id) !== uid)) return [404, { ok: false, reason: 'not_found' }];

  const out = {
    ok: true,
    status: job.status,
    size: job.size || 0,
    title: job.title || '',
    mime: job.mime || '',
    progress: apiQueue.progressOf(job.id) || 0,
  };
  if (job.status === 'ready' && job.token) {
    out.url = `${config.publicBase}/f/${job.token}`;
    out.expires_at = job.expires_at || '';
    out.ttl_min = store.settings().link_ttl_min;
  }
  if (job.status === 'failed' || job.status === 'rejected') out.reason = job.error || 'failed';
  return [200, out];
}

async function handle(req, res, pathname, url, bodyText) {
  if (!API_KEY) {
    json(res, 503, { ok: false, error: 'api disabled' });
    return;
  }
  if (!sameKey(req)) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return;
  }

  const route = pathname.replace(/^\/+|\/+$/g, '');
  let body = {};
  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      json(res, 400, { ok: false, error: 'bad json' });
      return;
    }
  }

  try {
    let result;
    if (route === 'hello') result = await routeHello(body);
    else if (route === 'lang') result = await routeLang(body);
    else if (route === 'phone') result = await routePhone(body);
    else if (route === 'request') result = await routeRequest(body);
    else if (route === 'job') result = await routeJob(url);
    else result = [404, { ok: false, error: 'unknown route' }];
    json(res, result[0], result[1]);
  } catch (err) {
    console.error('[api]', err.message);
    json(res, 500, { ok: false, error: 'internal' });
  }
}

module.exports = { handle };