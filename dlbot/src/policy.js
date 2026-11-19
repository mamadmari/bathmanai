'use strict';
/** قوانین مشترک سقف حجم، پلن و ضد اسپم (بین ربات تلگرام و API). */
const config = require('./config');
const store = require('./db');

const MB = 1024 * 1024;
const strikes = new Map();

/** حداکثر حجم مجاز برای این کاربر (0 = بدون سقف) */
function maxBytesFor(user, st) {
  if (config.isAdmin(user.id)) return 0;
  if (store.subActive(user)) return user.sub_quota_mb > 0 ? user.sub_quota_mb * MB : 0;
  if (user.phone_verified) return st.phone_max_mb * MB;
  return st.free_max_mb * MB;
}

/** سطح دسترسی را برای حجم مشخص تعیین می‌کند */
function tierFor(user, st, bytes) {
  const mb = bytes / MB;
  if (config.isAdmin(user.id)) return { tier: 'admin' };
  if (mb <= st.free_max_mb) return { tier: 'free' };
  if (mb <= st.phone_max_mb) return user.phone_verified ? { tier: 'phone' } : { tier: 'need_phone' };
  if (store.subActive(user)) {
    if (user.sub_quota_mb > 0 && mb > user.sub_quota_mb) return { tier: 'quota', left: user.sub_quota_mb };
    return { tier: 'sub' };
  }
  return { tier: 'need_sub' };
}

function bumpStrike(userId) {
  const rec = strikes.get(userId) || { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= 4) {
    rec.count = 0;
    rec.until = Date.now() + 10 * 60000;
    strikes.set(userId, rec);
    return 10;
  }
  strikes.set(userId, rec);
  return 0;
}

/** محدودیت‌های ضد اسپم؛ خروجی: { ok, reason, ...vars } */
function checkSpam(user, st) {
  const mute = strikes.get(user.id);
  if (mute && mute.until > Date.now()) {
    return { ok: false, reason: 'muted', min: Math.ceil((mute.until - Date.now()) / 60000) };
  }
  const last = store.lastUserJob(user.id);
  if (last) {
    const diff = Date.now() - new Date(last.created_at).getTime();
    if (diff < st.cooldown_sec * 1000) {
      return { ok: false, reason: 'cooldown', sec: Math.ceil((st.cooldown_sec * 1000 - diff) / 1000) };
    }
  }
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  if (store.userJobsSince(user.id, hourAgo) >= st.max_per_hour) {
    return { ok: false, reason: 'hourly_limit', n: st.max_per_hour };
  }
  if (store.userActiveJobs(user.id) >= st.max_concurrent_user) {
    return { ok: false, reason: 'concurrent_limit' };
  }
  if (st.max_daily_mb > 0) {
    const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    if (store.userBytesSince(user.id, dayStart) >= st.max_daily_mb * MB) {
      return { ok: false, reason: 'daily_limit', mb: st.max_daily_mb };
    }
  }
  return { ok: true };
}

module.exports = { MB, maxBytesFor, tierFor, checkSpam, bumpStrike };
