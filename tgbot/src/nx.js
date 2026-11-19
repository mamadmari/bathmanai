'use strict';

/**
 * کلاینت پنل NX (فقط از داخل سرور، روی 127.0.0.1).
 * همه‌ی درخواست‌ها با توکن Bearer انجام می‌شود.
 */

const { config } = require('./config');

function url(p) { return config.nx.base.replace(/\/+$/, '') + p; }

async function call(method, p, body) {
  const res = await fetch(url(p), {
    method,
    headers: {
      Authorization: 'Bearer ' + config.nx.token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = { raw: text }; }
  if (!res.ok) {
    const msg = (json && (json.error || json.message)) || ('HTTP ' + res.status);
    const err = new Error('nx: ' + msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

const GB = 1024 * 1024 * 1024;
const DAY = 86400;

function subUrlOf(user) {
  const base = config.subPrefix || config.publicBase;
  if (user && user.subId) return base.replace(/\/+$/, '') + '/s/' + user.subId;
  return (user && user.subUrl) || '';
}

async function createUser({ name, gb, days, deviceLimit, ipLimit, remark }) {
  const body = {
    name,
    remark: remark || 'btm',
    templateIds: [config.nx.templateId],
    volume: Math.round(gb * GB),
    duration: Math.round(days * DAY),
    deviceLimit: deviceLimit || config.nx.deviceLimit,
    ipLimit: ipLimit || config.nx.ipLimit,
    enable: true,
  };
  const u = await call('POST', '/api/users', body);
  u.subUrlPretty = subUrlOf(u);
  return u;
}

async function getUser(id) {
  const u = await call('GET', '/api/users/' + encodeURIComponent(id));
  u.subUrlPretty = subUrlOf(u);
  return u;
}

async function findByName(name) {
  const r = await call('GET', '/api/users?q=' + encodeURIComponent(name) + '&limit=5');
  const items = (r && r.items) || [];
  return items.find(x => x.name === name) || null;
}

/** تمدید/افزایش حجم با PATCH (فقط فیلدهای تغییر‌یافته) */
async function patchUser(id, patch) {
  const u = await call('PATCH', '/api/users/' + encodeURIComponent(id), patch);
  u.subUrlPretty = subUrlOf(u);
  return u;
}

async function renew(id, { gb, days }) {
  const cur = await getUser(id);
  const body = {};
  if (gb) body.volume = Number(cur.volume || 0) + Math.round(gb * GB);
  if (days) body.expiry = Math.max(Number(cur.expiry || 0), Math.floor(Date.now() / 1000)) + Math.round(days * DAY);
  body.enable = true;
  if (cur.expiry && Math.floor(Date.now() / 1000) > cur.expiry) {
    body.expiry = Math.floor(Date.now() / 1000) + Math.round((days || 30) * DAY);
  }
  return patchUser(id, body);
}

async function setEnable(id, enable) {
  return patchUser(id, { enable: !!enable });
}

async function removeUser(id) {
  return call('DELETE', '/api/users/' + encodeURIComponent(id));
}

async function links(id) {
  try {
    const r = await call('GET', '/api/users/' + encodeURIComponent(id) + '/links');
    return r;
  } catch (e) { return null; }
}

async function summary() {
  try { return await call('GET', '/api/users/summary'); } catch (e) { return null; }
}

function fmtGb(bytes) {
  const v = Number(bytes || 0) / GB;
  if (v >= 100) return v.toFixed(0) + ' گیگ';
  if (v >= 10) return v.toFixed(1) + ' گیگ';
  return v.toFixed(2) + ' گیگ';
}

function daysLeft(expiry) {
  if (!expiry) return null;
  const s = Math.floor(expiry - Date.now() / 1000);
  if (s <= 0) return 0;
  return Math.ceil(s / DAY);
}

module.exports = {
  createUser, getUser, findByName, patchUser, renew, setEnable, removeUser,
  links, summary, fmtGb, daysLeft, subUrlOf, call,
};
