'use strict';
/** منطق ربات: زبان، قفل کانال، شماره، پلن، صف دانلود و تحویل فایل. */
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const config = require('./config');
const store = require('./db');
const tg = require('./tg');
const { t, fmtSize, fmtNum } = require('./i18n');
const dl = require('./downloader');
const files = require('./files');
const policy = require('./policy');
const media = require('./media');
const gallery = require('./gallery');
const adminbot = require('./adminbot');

const pending = new Map(); // pid → { url, userId, data, at }
const jobOpts = new Map(); // jobId → { audioOnly, maxHeight, title, artist, platform, optionLabel }
const jobCancel = new Map(); // jobId → AbortController (دکمه لغو)
let pendingSeq = 0;
const PENDING_TTL = 30 * 60 * 1000;

const MB = policy.MB;
const { maxBytesFor, tierFor, checkSpam, bumpStrike } = policy;
const memberCache = new Map();
const jobMsg = new Map();
const queue = [];
let activeJobs = 0;

/** پیام ضد اسپم را از نتیجه checkSpam می‌سازد */
function spamMessage(lang, spam) {
  return t(lang, spam.reason, {
    sec: spam.sec || 0,
    n: spam.n || 0,
    min: spam.min || 0,
    mb: spam.mb ? fmtNum(lang, spam.mb) : '',
  });
}

const langOf = (user) => (user && user.lang === 'en' ? 'en' : 'fa');
const kb = (rows) => ({ inline_keyboard: rows });

function langKeyboard() {
  return kb([[{ text: t('fa', 'btn_fa'), callback_data: 'lang:fa' }, { text: t('fa', 'btn_en'), callback_data: 'lang:en' }]]);
}

function mainKeyboard(lang, user) {
  const rows = [
    [
      { text: t(lang, 'btn_help'), callback_data: 'help' },
      { text: t(lang, 'btn_status'), callback_data: 'status' },
    ],
    [{ text: t(lang, 'btn_lang'), callback_data: 'lang' }],
  ];
  if (config.isAdmin(user.id)) rows.push([{ text: t(lang, 'btn_admin'), callback_data: 'ad|home' }]);
  return kb(rows);
}

function channelLink(channel) {
  const s = String(channel || '').trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^-100\d+$/.test(s)) return `https://t.me/c/${s.slice(4)}/1`;
  return `https://t.me/${s.replace(/^@/, '')}`;
}

/** کانال می‌تواند آیدی عددی (-100…) یا @username باشد */
function channelTarget(channel) {
  const s = String(channel || '').trim();
  return /^-?\d+$/.test(s) ? Number(s) : s;
}

function joinKeyboard(lang, st) {
  const channel = st.channel || '';
  return kb([[{ text: t(lang, 'btn_join'), url: channelLink(channel) }], [{ text: t(lang, 'btn_check'), callback_data: 'join:check' }]]);
}

function menuText(lang, user, st) {
  const base = t(lang, 'main_menu', {
    name: user.first_name || (lang === 'en' ? 'there' : 'دوست من'),
    free: fmtNum(lang, st.free_max_mb),
    phone: fmtNum(lang, st.phone_max_mb),
  });
  return st.welcome_extra ? `${base}\n\n${st.welcome_extra}` : base;
}

async function say(chatId, text, extra = {}) {
  return tg.sendMessage(chatId, text, extra);
}

/* --------------------------- قفل کانال --------------------------- */

async function isMember(userId) {
  const st = store.settings();
  if (!st.force_join || !st.channel) return true;
  const key = `${st.channel}:${userId}`;
  const hit = memberCache.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.ok;

  const res = await tg.getChatMember(channelTarget(st.channel), userId);
  let ok = false;
  if (res.ok) {
    ok = ['member', 'administrator', 'creator'].includes(res.result.status);
  } else if (/CHAT_ADMIN_REQUIRED|not enough rights|member list/i.test(res.description || '')) {
    // ربات در کانال ادمین نیست؛ برای اینکه کاربران قفل نشوند اجازه می‌دهیم و خطا ثبت می‌شود
    store.setSetting('channel_lock_error', res.description || 'admin required');
    store.logEvent(null, 'channel_error', res.description);
    ok = true;
  }
  memberCache.set(key, { ok, at: Date.now() });
  return ok;
}

async function joinGate(user, chatId) {
  const st = store.settings();
  if (!st.force_join || !st.channel) return true;
  const lang = langOf(user);
  if (await isMember(user.id)) return true;
  await say(chatId, t(lang, 'join_required', { channel: st.channel }), { reply_markup: joinKeyboard(lang, st) });
  return false;
}

/* ------------------------------ پلن‌ها ------------------------------ */

function plansText(lang, st) {
  return (st.plans || [])
    .map((p) => {
      const title = lang === 'en' ? p.en || p.fa : p.fa;
      const quota = p.quota_mb ? fmtSize(p.quota_mb * MB, lang) : lang === 'en' ? 'unlimited' : 'نامحدود';
      return `• ${title} — ${p.price} — ${p.days} ${lang === 'en' ? 'days' : 'روز'} — ${quota}`;
    })
    .join('\n');
}

function upgradeKeyboard(lang, st, tier) {
  const rows = [];
  if (tier === 'need_phone') rows.push([{ text: t(lang, 'btn_phone'), callback_data: 'phone' }]);
  const adminUser = String(st.admin_username || '').replace(/^@/, '');
  if (adminUser) rows.push([{ text: t(lang, 'btn_buy'), url: `https://t.me/${adminUser}` }]);
  return rows.length ? kb(rows) : undefined;
}

/** پیام مناسب برای هر نوع محدودیت */
async function explainTier(user, chatId, tier, bytes, st) {
  const lang = langOf(user);
  const vars = {
    mb: bytes ? fmtSize(bytes, lang) : '',
    free: fmtNum(lang, st.free_max_mb),
    phone: fmtNum(lang, st.phone_max_mb),
    phoneMax: fmtNum(lang, st.phone_max_mb),
    admin: st.admin_username || '@admin',
    id: user.id,
    plans: plansText(lang, st),
    left: tier === 'quota' ? fmtNum(lang, user.sub_quota_mb) : '',
    max: fmtNum(lang, Math.round(st.free_max_mb)),
  };
  const key = tier === 'quota' ? 'quota_exceeded' : tier === 'need_phone' || tier === 'need_sub' ? tier : 'too_big';
  await say(chatId, t(lang, key, vars), { reply_markup: upgradeKeyboard(lang, st, tier) });
}

/* ----------------------------- ضد اسپم ----------------------------- */

/* --------------------------- ورودی پیام‌ها --------------------------- */

async function onMessage(msg) {
  if (!msg.from || msg.from.is_bot) return;
  const chatId = msg.chat.id;
  if (msg.chat.type !== 'private') {
    if (msg.text && msg.text.trim().toLowerCase().startsWith('/id')) await say(chatId, `chat_id: ${chatId}`);
    return;
  }

  const user = store.ensureUser(msg.from);
  const st = store.settings();
  const lang = langOf(user);

  if (user.blocked) {
    await say(chatId, t(lang, 'banned'));
    return;
  }
  if (st.maintenance && !config.isAdmin(user.id)) {
    await say(chatId, t(lang, 'maintenance'));
    return;
  }

  if (msg.contact) return onContact(msg, user);

  const text = (msg.text || '').trim();

  if (text.startsWith('/')) return onCommand(msg, user, st, text);

  // ورودی‌های بتمن‌پنل (کانال، کوکی، پیام همگانی، رمز…)
  if (await adminbot.handleInput(msg, user).catch(() => false)) return;

  if (!user.lang) {
    await say(chatId, t('fa', 'choose_lang'), { reply_markup: langKeyboard() });
    return;
  }
  if (!(await joinGate(user, chatId))) return;

  if (msg.document || msg.video || msg.audio || msg.voice) return onTelegramFile(msg, user);

  const url = dl.extractUrl(text);
  if (url) return onUrl(msg, user, url);

  await say(chatId, menuText(lang, user, st), { reply_markup: mainKeyboard(lang, user) });
}

async function onContact(msg, user) {
  const chatId = msg.chat.id;
  const lang = langOf(user);
  const st = store.settings();
  const c = msg.contact;
  if (!c || Number(c.user_id) !== Number(user.id)) {
    await say(chatId, t(lang, 'phone_invalid'));
    return;
  }
  store.setPhone(user.id, c.phone_number);
  store.logEvent(user.id, 'phone', c.phone_number);
  const fresh = store.getUser(user.id);
  await say(chatId, t(lang, 'phone_saved', { phone: c.phone_number, phoneMax: fmtNum(lang, st.phone_max_mb) }), {
    reply_markup: { remove_keyboard: true, inline_keyboard: [[{ text: t(lang, 'btn_status'), callback_data: 'status' }]] },
  });
  store.logEvent(user.id, 'phone_ok', fresh.phone);
}

function statusText(user, st) {
  const lang = langOf(user);
  const sub = store.subActive(user)
    ? t(lang, 'sub_line', {
        date: new Date(user.sub_until).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fa-IR'),
        quota: user.sub_quota_mb ? fmtSize(user.sub_quota_mb * MB, lang) : lang === 'en' ? 'unlimited' : 'نامحدود',
      })
    : t(lang, 'sub_none');
  return t(lang, 'status_tpl', {
    id: user.id,
    lang: lang === 'en' ? 'English' : 'فارسی',
    phoneNumber: user.phone_verified ? user.phone : t(lang, 'sub_none'),
    sub,
    count: fmtNum(lang, user.downloads || 0),
    mb: fmtNum(lang, Math.round((user.bytes || 0) / MB)),
    free: fmtNum(lang, st.free_max_mb),
    phone: fmtNum(lang, st.phone_max_mb),
  });
}

async function onCommand(msg, user, st, text) {
  const chatId = msg.chat.id;
  const lang = langOf(user);
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, '');
  const args = text.split(/\s+/).slice(1);

  if (cmd === '/start') {
    if (!user.lang) {
      await say(chatId, t('fa', 'choose_lang'), { reply_markup: langKeyboard() });
      return;
    }
    if (!(await joinGate(user, chatId))) return;
    await say(chatId, menuText(lang, user, st), { reply_markup: mainKeyboard(lang, user) });
    return;
  }

  if (cmd === '/id') {
    await say(chatId, `🆔 ${user.id}`);
    return;
  }

  if (cmd === '/lang') {
    await say(chatId, t(lang, 'choose_lang'), { reply_markup: langKeyboard() });
    return;
  }

  if (cmd === '/help') {
    await say(chatId, t(lang, 'help', { free: fmtNum(lang, st.free_max_mb), phone: fmtNum(lang, st.phone_max_mb) }), {
      reply_markup: mainKeyboard(lang, user),
    });
    return;
  }

  if (cmd === '/status' || cmd === '/me') {
    await say(chatId, statusText(user, st), { reply_markup: mainKeyboard(lang, user) });
    return;
  }

  if (cmd === '/admin' || cmd === '/panel') {
    if (!config.isAdmin(user.id)) {
      await say(chatId, t(lang, 'only_admin'));
      return;
    }
    await adminbot.open(chatId);
    return;
  }

  if (cmd === '/stats') {
    if (!config.isAdmin(user.id)) return;
    const s = store.stats();
    await say(
      chatId,
      t(lang, 'stats_tpl', {
        users: fmtNum(lang, s.users),
        jobs: fmtNum(lang, s.jobs),
        gb: fmtNum(lang, (s.bytes / 1073741824).toFixed(1)),
        today: fmtNum(lang, s.today),
        queued: fmtNum(lang, s.queued),
        running: fmtNum(lang, s.running),
      })
    );
    return;
  }

  if (!config.isAdmin(user.id)) {
    await say(chatId, t(lang, 'only_admin'));
    return;
  }

  if (cmd === '/grant') {
    const id = Number(args[0]);
    const days = Number(args[1] || 30);
    const quota = Number(args[2] || 0);
    if (!id) {
      await say(chatId, 'Usage: /grant <user_id> [days] [quota_mb]');
      return;
    }
    const u = store.grantSub(id, days, quota);
    if (!u) {
      await say(chatId, `User ${id} not found`);
      return;
    }
    await say(chatId, `✅ ${id} → ${days}d / ${quota === 0 ? 'unlimited' : `${quota}MB`}`);
    store.logEvent(id, 'admin_grant', `by ${user.id}`);
    await say(id, t(langOf(u), 'joined_ok'));
    return;
  }

  if (cmd === '/ban' || cmd === '/unban') {
    const id = Number(args[0]);
    if (!id) return;
    store.setBlocked(id, cmd === '/ban');
    store.logEvent(id, cmd === '/ban' ? 'ban' : 'unban', `by ${user.id}`);
    await say(chatId, `${cmd === '/ban' ? '⛔️ banned' : '✅ unbanned'} ${id}`);
    return;
  }

  if (cmd === '/broadcast') {
    const body = args.join(' ').trim();
    if (!body) {
      await say(chatId, 'Usage: /broadcast <text>');
      return;
    }
    const ids = store.allUserIds();
    let sent = 0;
    for (const id of ids) {
      const r = await tg.sendMessage(id, body);
      if (r.ok) sent += 1;
      await new Promise((res) => setTimeout(res, 40));
    }
    store.logEvent(null, 'broadcast', `by ${user.id} to ${sent}/${ids.length}`);
    await say(chatId, `📣 sent to ${sent}/${ids.length}`);
    return;
  }
}

/* ---------------------------- دکمه‌های شیشه‌ای ---------------------------- */

async function onCallback(cq) {
  const msg = cq.message;
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const data = String(cq.data || '');
  const user = store.ensureUser(cq.from);
  const st = store.settings();
  const lang = langOf(user);

  if (data.startsWith('ad|')) {
    await adminbot.handleCallback(cq, user).catch(async (err) => {
      await tg.answerCallback(cq.id, `⚠️ ${String(err.message).slice(0, 150)}`);
    });
    return;
  }

  if (data.startsWith('cancel|')) {
    const id = Number(data.split('|')[1]);
    const job = store.getJob(id);
    if (!job || job.user_id !== user.id) {
      await tg.answerCallback(cq.id);
      return;
    }
    const qi = queue.indexOf(id);
    if (qi >= 0) queue.splice(qi, 1);
    const ac = jobCancel.get(id);
    if (ac) ac.abort();
    if (['pending', 'queued', 'running'].includes(job.status)) {
      store.updateJob(id, { status: 'cancelled', finished_at: store.now(), deleted_at: store.now() });
      await files.removeJobDir(id).catch(() => {});
    }
    await tg.answerCallback(cq.id, t(lang, 'cancelled'));
    await tg.editMessage(chatId, msg.message_id, t(lang, 'cancelled'), { reply_markup: { inline_keyboard: [] } }).catch(() => {});
    return;
  }

  if (data.startsWith('q|')) {
    await onQualityChoice(cq, user, st, data);
    return;
  }

  if (data.startsWith('lang:')) {
    const chosen = data.slice(5) === 'en' ? 'en' : 'fa';
    store.setLang(user.id, chosen);
    store.logEvent(user.id, 'lang', chosen);
    const fresh = store.getUser(user.id);
    await tg.answerCallback(cq.id, t(chosen, 'lang_saved'));
    await tg.editMessage(chatId, msg.message_id, t(chosen, 'lang_saved'), { reply_markup: { inline_keyboard: [] } });
    if (!(await joinGate(fresh, chatId))) return;
    await say(chatId, menuText(chosen, fresh, st), { reply_markup: mainKeyboard(chosen, fresh) });
    return;
  }

  if (data === 'join:check') {
    const key = `${st.channel}:${user.id}`;
    memberCache.delete(key);
    const ok = await isMember(user.id);
    if (!ok) {
      await tg.answerCallback(cq.id, t(lang, 'not_joined'), true);
      return;
    }
    await tg.answerCallback(cq.id, t(lang, 'joined_ok'));
    if (!user.lang) {
      await say(chatId, t('fa', 'choose_lang'), { reply_markup: langKeyboard() });
      return;
    }
    await say(chatId, menuText(lang, user, st), { reply_markup: mainKeyboard(lang, user) });
    return;
  }

  await tg.answerCallback(cq.id);

  if (data === 'help') {
    await tg.editMessage(chatId, msg.message_id, t(lang, 'help', { free: fmtNum(lang, st.free_max_mb), phone: fmtNum(lang, st.phone_max_mb) }), {
      reply_markup: mainKeyboard(lang, user),
    });
    return;
  }

  if (data === 'status') {
    await tg.editMessage(chatId, msg.message_id, statusText(user, st), { reply_markup: mainKeyboard(lang, user) });
    return;
  }

  if (data === 'lang') {
    await tg.editMessage(chatId, msg.message_id, t(lang, 'choose_lang'), { reply_markup: langKeyboard().inline_keyboard });
    return;
  }

  if (data === 'phone') {
    await say(chatId, t(lang, 'need_phone', { mb: '', free: fmtNum(lang, st.free_max_mb) }), {
      reply_markup: {
        keyboard: [[{ text: t(lang, 'btn_phone'), request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
    return;
  }
}

/* --------------------------- جریان دانلود --------------------------- */

function enqueue(jobId) {
  queue.push(jobId);
  pump();
}

function pump() {
  const st = store.settings();
  const limit = Math.max(1, Number(st.max_concurrent_global) || 1);
  while (activeJobs < limit && queue.length) {
    const id = queue.shift();
    activeJobs += 1;
    runJob(id)
      .catch((err) => console.error('[job]', id, err.message))
      .finally(() => {
        activeJobs -= 1;
        pump();
      });
  }
}

/* -------------------- پیش‌نمایش رسانه + انتخاب کیفیت -------------------- */

/** اطلاعات رسانه را نشان می‌دهد و کیفیت را می‌پرسد؛ اگر پلتفرم پشتیبانی نشود false برمی‌گرداند */
async function tryPreview(msg, user, url, st, lang) {
  const platform = media.detect(url);
  if (!media.supportsPreview(platform)) return false;

  const chatId = msg.chat.id;
  const wait = await say(chatId, t(lang, 'analyzing'));
  const waitId = wait.ok ? wait.result.message_id : null;

  let data = null;
  try {
    data = await media.info(url);
  } catch (err) {
    data = null;
  }
  if (!data || !data.ok) {
    if (waitId) await tg.deleteMessage(chatId, waitId).catch(() => {});
    return false;
  }

  const pid = `${(++pendingSeq).toString(36)}${Date.now().toString(36).slice(-4)}`;
  pending.set(pid, { url, userId: user.id, data, at: Date.now() });
  for (const [k, v] of pending) if (Date.now() - v.at > PENDING_TTL) pending.delete(k);

  const text = media.caption(lang, data);
  const markup = media.keyboard(pid, data);
  if (waitId) await tg.deleteMessage(chatId, waitId).catch(() => {});

  if (data.thumb) {
    const sent = await tg.call('sendPhoto', { chat_id: chatId, photo: data.thumb, caption: text, reply_markup: markup });
    if (sent && sent.ok) return true;
  }
  await say(chatId, text, { reply_markup: markup });
  return true;
}

/** کاربر کیفیت را انتخاب کرد → ساخت جاب با همان تنظیمات */
async function onQualityChoice(cq, user, st, data) {
  const parts = data.split('|');
  const pid = parts[1];
  const key = parts[2];
  const chatId = cq.message.chat.id;
  const lang = langOf(user);
  const entry = pending.get(pid);

  if (!entry || entry.userId !== user.id || Date.now() - entry.at > PENDING_TTL) {
    if (pid) pending.delete(pid);
    await tg.answerCallback(cq.id, t(lang, 'q_expired'), true);
    return;
  }
  const opt = key === 'gal' ? { key: 'gal', kind: 'gallery', height: 0, label: t(lang, 'gallery_btn') } : media.optionByKey(entry.data, key);
  if (!opt) {
    await tg.answerCallback(cq.id, t(lang, 'q_expired'), true);
    return;
  }

  const spam = checkSpam(user, st);
  if (!spam.ok) {
    await tg.answerCallback(cq.id);
    await say(chatId, spamMessage(lang, spam));
    return;
  }
  await tg.answerCallback(cq.id, t(lang, 'accepted'));

  const isGallery = opt.kind === 'gallery';
  const jobId = store.createJob({
    userId: user.id,
    url: opt.url || entry.data.source || entry.url,
    tier: 'pending',
    kind: isGallery ? 'album' : opt.direct ? 'direct' : 'media',
  });
  store.updateJob(jobId, { title: entry.data.title || entry.url.slice(0, 120), kind: isGallery ? 'album' : 'media', mime: '' });
  jobOpts.set(jobId, {
    audioOnly: opt.kind === 'audio',
    maxHeight: opt.height || 0,
    title: entry.data.title || '',
    artist: entry.data.artist || '',
    platform: entry.data.platform,
    optionLabel: opt.label,
    thumb: entry.data.thumb || '',
    album: isGallery,
    origKind: opt.direct ? 'direct' : 'media',
  });
  pending.delete(pid);

  const pos = queue.length + activeJobs + 1;
  const status = await say(chatId, t(lang, 'queued', { pos: fmtNum(lang, pos) }), {
    reply_markup: { inline_keyboard: [[{ text: t(lang, 'btn_cancel'), callback_data: `cancel|${jobId}` }]] },
  });
  if (status.ok) jobMsg.set(jobId, { chatId, messageId: status.result.message_id });
  enqueue(jobId);
}

async function onUrl(msg, user, url) {
  const chatId = msg.chat.id;
  const st = store.settings();
  const lang = langOf(user);


  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    await say(chatId, t(lang, 'invalid_url'));
    return;
  }
  if ((st.blocklist || []).some((d) => host === d || host.endsWith(`.${d}`))) {
    await say(chatId, t(lang, 'blocked_domain'));
    return;
  }

  const spam = checkSpam(user, st);
  if (!spam.ok) {
    await say(chatId, spamMessage(lang, spam));
    store.logEvent(user.id, 'rate_limited', spam.reason);
    return;
  }

  // یوتیوب/ساندکلاد/اسپاتیفای/رادیوجوان: پیش‌نمایش + انتخاب کیفیت
  if (await tryPreview(msg, user, url, st, lang).catch(() => false)) return;

  const statusMsg = await say(chatId, t(lang, 'fetching'));
  const statusId = statusMsg.ok ? statusMsg.result.message_id : null;
  const edit = (text, extra) => (statusId ? tg.editMessage(chatId, statusId, text, extra || {}) : say(chatId, text, extra));

  let probe = { kind: 'media', size: 0, filename: '' };
  try {
    probe = await dl.probe(url, st.allow_private_urls);
  } catch (err) {
    if (err.code === 'private_host' || err.code === 'dns') {
      const min = bumpStrike(user.id);
      await edit(min ? t(lang, 'muted', { min }) : t(lang, 'invalid_url'));
      return;
    }
    probe = { kind: 'media', size: 0, filename: '' };
  }

  let estimate = probe.size || 0;
  let title = probe.filename || '';
  if (probe.kind === 'media' && !estimate) {
    const info = await dl.probeMedia(url).catch(() => ({ size: 0, title: '' }));
    if (info.size) estimate = info.size;
    if (info.title) title = info.title;
  }

  if (estimate > 0) {
    const tier = tierFor(user, st, estimate);
    if (tier.tier === 'need_phone' || tier.tier === 'need_sub' || tier.tier === 'quota') {
      if (statusId) await tg.deleteMessage(chatId, statusId).catch(() => {});
      await explainTier(user, chatId, tier.tier, estimate, st);
      store.logEvent(user.id, 'tier_block', `${tier.tier} ${Math.round(estimate / MB)}MB`);
      return;
    }
  }

  const jobId = store.createJob({ userId: user.id, url, tier: 'pending' });
  const platform = media.detect(url);
  const isAlbum = platform === 'instagram' ? /\/(p|tv)\//i.test(url) : false;
  store.updateJob(jobId, { title: title || url.slice(0, 120), kind: isAlbum ? 'album' : probe.kind });
  const pos = queue.length + 1;
  const cancelKb = { inline_keyboard: [[{ text: t(lang, 'btn_cancel'), callback_data: `cancel|${jobId}` }]] };
  if (statusId) {
    jobMsg.set(jobId, { chatId, messageId: statusId });
    await tg.editMessage(chatId, statusId, t(lang, 'queued', { pos: fmtNum(lang, pos) }), { reply_markup: cancelKb });
  } else {
    const sent = await say(chatId, t(lang, 'queued', { pos: fmtNum(lang, pos) }), { reply_markup: cancelKb });
    if (sent.ok) jobMsg.set(jobId, { chatId, messageId: sent.result.message_id });
  }
  enqueue(jobId);
}

async function onTelegramFile(msg, user) {
  const chatId = msg.chat.id;
  const st = store.settings();
  const lang = langOf(user);
  const file = msg.document || msg.video || msg.audio || msg.voice;
  if (!file) return;
  const size = Number(file.file_size || 0);
  const maxTg = 20 * MB;

  if (!size || size > maxTg) {
    await say(chatId, t(lang, 'file_too_big_tg', { mb: '20' }));
    return;
  }
  if (!(await joinGate(user, chatId))) return;
  const spam = checkSpam(user, st);
  if (!spam.ok) {
    await say(chatId, spamMessage(lang, spam));
    return;
  }
  const tier = tierFor(user, st, size);
  if (tier.tier === 'need_phone' || tier.tier === 'need_sub' || tier.tier === 'quota') {
    await explainTier(user, chatId, tier.tier, size, st);
    return;
  }

  const statusMsg = await say(chatId, t(lang, 'fetching'));
  const statusId = statusMsg.ok ? statusMsg.result.message_id : null;
  const jobId = store.createJob({ userId: user.id, url: 'telegram', tier: tier.tier, kind: 'telegram' });
  store.updateJob(jobId, {
    status: 'running',
    started_at: store.now(),
    title: file.file_name || 'telegram-file',
    size,
    mime: file.mime_type || 'application/octet-stream',
  });

  try {
    const dir = await files.ensureJobDir(jobId);
    const info = await tg.getFile(file.file_id);
    if (!info.ok) throw new Error(info.description || 'getFile');
    const name = dl.sanitizeName(file.file_name || `file-${jobId}`);
    const dest = `${dir}/${name}`;
    await tg.downloadTelegramFile(info.result.file_path, dest, size + 1024);
    const job = store.getJob(jobId);
    const link = files.createLink({ ...job, file_name: name, mime: file.mime_type || 'application/octet-stream' }, st.link_ttl_min);
    store.updateJob(jobId, { file_name: name, status: 'ready', delivery: 'link', expires_at: link.expires });
    const text = t(lang, 'file_ready_link', { url: link.url, min: fmtNum(lang, st.link_ttl_min) });
    const markup = kb([[{ text: t(lang, 'btn_download', { mb: fmtSize(size, lang) }), url: link.url }]]);
    if (statusId) await tg.editMessage(chatId, statusId, text, { reply_markup: markup });
    else await say(chatId, text, { reply_markup: markup });
    store.addDownload(user.id, size);
  } catch (err) {
    await files.removeJobDir(jobId);
    store.updateJob(jobId, { status: 'failed', error: String(err.message).slice(0, 200), finished_at: store.now(), deleted_at: store.now() });
    const text = t(lang, 'error_download');
    if (statusId) await tg.editMessage(chatId, statusId, text);
    else await say(chatId, text);
  }
}

async function runJob(jobId) {
  const job = store.getJob(jobId);
  if (!job) return;
  const user = store.getUser(job.user_id);
  if (!user) return;
  const st = store.settings();
  const lang = langOf(user);
  const target = jobMsg.get(jobId) || {};
  const chatId = target.chatId || user.id;
  const statusId = target.messageId || null;
  let lastEdit = 0;

  const setStatus = async (text, extra) => {
    if (!statusId) return;
    if (!extra && Date.now() - lastEdit < 3000) return;
    lastEdit = Date.now();
    await tg.editMessage(chatId, statusId, text, extra || {}).catch(() => {});
  };
  const progress = (pct, extra) =>
    setStatus(t(lang, 'downloading', { pct: fmtNum(lang, pct), extra: extra && extra.speed ? ` · ${extra.speed}` : '' }));

  const dir = await files.ensureJobDir(jobId);
  store.updateJob(jobId, { status: 'running', started_at: store.now() });
  const started = Date.now();
  const maxBytes = maxBytesFor(user, st);

  const abort = new AbortController();
  jobCancel.set(jobId, abort);
  const signal = abort.signal;

  let result;
  const opts = jobOpts.get(jobId) || {};
  const isDirect = job.kind === 'direct' || opts.origKind === 'direct';
  const doDownload = (url) =>
    isDirect
      ? dl.downloadDirect(url, dir, { maxBytes, allowPrivate: st.allow_private_urls, onProgress: progress })
      : dl.downloadMedia(url, dir, {
          maxBytes,
          format: st.ytdlp_format,
          maxHeight: opts.maxHeight !== undefined ? opts.maxHeight : st.ytdlp_max_height,
          audioOnly: opts.audioOnly !== undefined ? opts.audioOnly : st.audio_only,
          onProgress: progress,
          signal,
        });

  try {
    // کاروسل/آلبوم: چند فایل با هم
    if (job.kind === 'album' || opts.album) {
      let pl = null;
      try {
        pl = await dl.downloadPlaylist(job.url, dir, { maxItems: 10, maxBytes, audioOnly: false, onProgress: progress, signal });
      } catch (err) {
        if (err.code === 'cancelled') throw err;
        pl = null; // فالبک: gallery-dl و بعد تک‌فایل
      }
      if (!pl || !pl.files.length) {
        // gallery-dl برای گالری‌ها (کاروسل اینستاگرام، برد پینترست، مدیای توییتر)
        try {
          const gal = await gallery.fetchMedia(job.url, dir, { limit: 10 });
          if (gal.ok && gal.files.length) pl = { files: gal.files };
        } catch {
          pl = null;
        }
      }
      if (pl && pl.files.length) {
        await deliverAlbum({ ...job, ...store.getJob(jobId) }, user, pl.files, st, chatId, setStatus, started);
        return;
      }
    }
    try {
      result = await doDownload(job.url);
    } catch (first) {
      // سایت پشتیبانی‌نشده: صفحه را می‌خوانیم و همان عنوان را در یوتیوب می‌گیریم
      const alt = await media.resolveByPage(job.url).catch(() => null);
      if (!alt || !alt.url || alt.url === job.url) throw first;
      store.logEvent(user.id, 'fallback_search', `${job.url} → ${String(alt.url).slice(0, 120)}`.slice(0, 300));
      result = await doDownload(alt.url);
      store.updateJob(jobId, { url: alt.url, title: alt.title || job.title });
    }
  } catch (err) {
    await files.removeJobDir(jobId);
    const code = err.code || 'download';
    if (code === 'cancelled') {
      store.updateJob(jobId, { status: 'cancelled', finished_at: store.now(), deleted_at: store.now() });
      await setStatus(t(lang, 'cancelled'), { reply_markup: { inline_keyboard: [] } });
      return;
    }
    store.updateJob(jobId, {
      status: 'failed',
      error: `${code}${err.detail ? `: ${String(err.detail).slice(0, 160)}` : ''}`,
      finished_at: store.now(),
      deleted_at: store.now(),
    });
    store.logEvent(user.id, 'job_failed', `${code} ${job.url || ''}`.slice(0, 400));

    if (code === 'too_big') {
      const size = Number(err.detail) || 0;
      const tier = tierFor(user, st, size);
      if (size && ['need_phone', 'need_sub', 'quota'].includes(tier.tier)) {
        await explainTier(user, chatId, tier.tier, size, st);
        return;
      }
      await setStatus(t(lang, 'too_big', { mb: fmtSize(size, lang), max: fmtNum(lang, Math.round(maxBytes / MB)) }), {
        reply_markup: { inline_keyboard: [] },
      });
      return;
    }
    if (code === 'private_host' || code === 'dns') {
      const min = bumpStrike(user.id);
      await setStatus(min ? t(lang, 'muted', { min }) : t(lang, 'invalid_url'), { reply_markup: { inline_keyboard: [] } });
      return;
    }
    const key = code === 'restricted' || code === 'http' ? 'error_download' : 'error_generic';
    await setStatus(t(lang, key), { reply_markup: { inline_keyboard: [] } });
    return;
  }

  store.updateJob(jobId, {
    file_name: path.basename(result.filePath),
    mime: result.mime,
    size: result.size,
    title: result.title || job.title,
  });

  const tier = tierFor(user, st, result.size);
  if (tier.tier === 'need_phone' || tier.tier === 'need_sub' || tier.tier === 'quota') {
    await files.removeJobDir(jobId);
    store.updateJob(jobId, { status: 'rejected', error: tier.tier, deleted_at: store.now() });
    await explainTier(user, chatId, tier.tier, result.size, st);
    return;
  }

  try {
    await deliver({ ...job, ...store.getJob(jobId) }, user, result, st, chatId, setStatus, started);
  } catch (err) {
    await files.removeJobDir(jobId);
    store.updateJob(jobId, { status: 'failed', error: String(err.message).slice(0, 200), deleted_at: store.now() });
    await setStatus(t(lang, 'error_generic'), { reply_markup: { inline_keyboard: [] } });
  } finally {
    jobCancel.delete(jobId);
    jobOpts.delete(jobId);
    jobMsg.delete(jobId);
  }
}

/** تصویر بندانگشتی از ویدیو با ffmpeg (برای قشنگی پیام تلگرام) */
function makeThumb(src, dest) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    try {
      const p = spawn(config.ffmpeg, ['-y', '-ss', '1', '-i', src, '-frames:v', '1', '-vf', 'scale=320:-2', dest], {
        stdio: 'ignore',
      });
      p.on('error', () => finish(false));
      p.on('close', (code) => finish(code === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 0));
    } catch {
      finish(false);
    }
  });
}

/** ارسال چند فایل: آلبوم (۲ تا ۱۰) و بقیه تک‌تک */
async function deliverAlbum(job, user, items, st, chatId, setStatus, started) {
  const lang = langOf(user);
  const total = items.reduce((s, i) => s + (i.size || 0), 0);
  const tier = tierFor(user, st, total);
  if (['need_phone', 'need_sub', 'quota'].includes(tier.tier)) {
    await files.removeJobDir(job.id);
    store.updateJob(job.id, { status: 'rejected', error: tier.tier, deleted_at: store.now() });
    await explainTier(user, chatId, tier.tier, total, st);
    return;
  }

  await setStatus(t(lang, 'uploading'), { reply_markup: { inline_keyboard: [] } });
  await tg.sendAction(chatId, 'upload_video');

  const caption = `${job.title || ''}\n${items.length} × ${fmtSize(total, lang)}`.trim();
  let sentCount = 0;

  // یک فایل: همان مسیر ساده (عکس/ویدئو/سند)
  if (items.length === 1) {
    const f = items[0];
    const name = path.basename(f.filePath);
    const single = /^video\//.test(f.mime)
      ? await tg.uploadFile('sendVideo', 'video', f.filePath, name, f.mime, { chat_id: chatId, supports_streaming: 'true', caption })
      : /^image\//.test(f.mime) && /^(image\/(jpeg|png))$/.test(f.mime)
        ? await tg.uploadFile('sendPhoto', 'photo', f.filePath, name, f.mime, { chat_id: chatId, caption })
        : await tg.uploadFile('sendDocument', 'document', f.filePath, name, f.mime, { chat_id: chatId, caption });
    if (single && single.ok) {
      await files.removeJobDir(job.id);
      store.updateJob(job.id, { status: 'sent', delivery: 'telegram', size: total, finished_at: store.now(), deleted_at: store.now() });
      store.addDownload(user.id, total);
      if (store.subActive(user)) store.consumeQuota(user.id, total / MB);
      const s1 = Math.max(1, Math.round((Date.now() - started) / 1000));
      await setStatus(t(lang, 'done_sent', { mb: fmtSize(total, lang), sec: fmtNum(lang, s1) }), { reply_markup: { inline_keyboard: [] } });
      return;
    }
  }
  for (let i = 0; i < items.length; i += 10) {
    const chunk = items.slice(i, i + 10);
    const albumable = chunk.every((f) => /^(image\/(jpeg|png)|video\/mp4)$/.test(f.mime));
    if (chunk.length > 1 && albumable) {
      const res = await tg
        .sendAlbum(chatId, chunk.map((f) => ({ path: f.filePath, name: path.basename(f.filePath), mime: f.mime, type: /^video\//.test(f.mime) ? 'video' : 'photo' })), i === 0 ? caption : '')
        .catch(() => ({ ok: false }));
      if (res && res.ok) {
        sentCount += chunk.length;
        continue;
      }
    }
    for (const f of chunk) {
      const name = path.basename(f.filePath);
      const isVideo = /^video\//.test(f.mime);
      const res = isVideo
        ? await tg.uploadFile('sendVideo', 'video', f.filePath, name, f.mime, { chat_id: chatId, supports_streaming: 'true', caption: sentCount === 0 ? caption : undefined })
        : await tg.uploadFile('sendDocument', 'document', f.filePath, name, f.mime, { chat_id: chatId, caption: sentCount === 0 ? caption : undefined });
      if (res && res.ok) sentCount += 1;
      else store.logEvent(user.id, 'upload_failed', String((res && res.description) || '').slice(0, 160));
    }
  }

  if (!sentCount) {
    await setStatus(t(lang, 'error_generic'), { reply_markup: { inline_keyboard: [] } });
    return;
  }
  await files.removeJobDir(job.id);
  store.updateJob(job.id, { status: 'sent', delivery: 'telegram', size: total, finished_at: store.now(), deleted_at: store.now() });
  store.addDownload(user.id, total);
  if (store.subActive(user)) store.consumeQuota(user.id, total / MB);
  const sec = Math.max(1, Math.round((Date.now() - started) / 1000));
  await setStatus(t(lang, 'album_ok', { n: fmtNum(lang, sentCount), mb: fmtSize(total, lang), sec: fmtNum(lang, sec) }), {
    reply_markup: { inline_keyboard: [] },
  });
}

/** فایل را در تلگرام می‌فرستد یا لینک موقت می‌سازد و فایل را فوراً پاک می‌کند */
async function deliver(job, user, file, st, chatId, setStatus, started) {
  const lang = langOf(user);
  const name = path.basename(file.filePath);
  const caption = `${file.title || name}\n${fmtSize(file.size, lang)}`;
  const sendMax = Math.min(Number(st.telegram_send_max_mb) || 50, config.localApi ? 2000 : 50) * MB;

  let sent = null;
  if (file.size <= sendMax) {
    await setStatus(t(lang, 'uploading'), { reply_markup: { inline_keyboard: [] } });
    await tg.sendAction(chatId, 'upload_document');
    const isVideo = /^video\//.test(file.mime);
    const isAudio = /^audio\//.test(file.mime);
    const method = isVideo ? 'sendVideo' : isAudio ? 'sendAudio' : 'sendDocument';
    const field = isVideo ? 'video' : isAudio ? 'audio' : 'document';
    const o = jobOpts.get(job.id) || {};
    const fields = { chat_id: chatId, caption, ...(isVideo ? { supports_streaming: 'true' } : {}) };
    if (isAudio) {
      const ttl = String(o.title || file.title || name).replace(/\.[^.]+$/, '').slice(0, 64);
      if (ttl) fields.title = ttl;
      if (o.artist) fields.performer = String(o.artist).slice(0, 64);
    }
    const extraFiles = [];
    if (isVideo) {
      const thumbPath = path.join(path.dirname(file.filePath), 'thumb.jpg');
      if (await makeThumb(file.filePath, thumbPath)) {
        extraFiles.push({ field: 'thumb', path: thumbPath, name: 'thumb.jpg', mime: 'image/jpeg' });
      }
    }
    sent = await tg.uploadFile(method, field, file.filePath, name, file.mime, fields, extraFiles);
    if (!sent.ok) {
      sent = await tg.uploadFile('sendDocument', 'document', file.filePath, name, file.mime, { chat_id: chatId, caption });
    }
    if (!sent.ok) store.logEvent(user.id, 'upload_failed', String(sent.description || '').slice(0, 200));
  }

  if (sent && sent.ok) {
    await files.removeJobDir(job.id);
    store.updateJob(job.id, { status: 'sent', delivery: 'telegram', finished_at: store.now(), deleted_at: store.now() });
    store.addDownload(user.id, file.size);
    if (store.subActive(user)) store.consumeQuota(user.id, file.size / MB);
    const sec = Math.max(1, Math.round((Date.now() - started) / 1000));
    await setStatus(t(lang, 'done_sent', { mb: fmtSize(file.size, lang), sec: fmtNum(lang, sec) }), {
      reply_markup: { inline_keyboard: [] },
    });
    return;
  }

  const link = files.createLink(job, st.link_ttl_min);
  store.addDownload(user.id, file.size);
  if (store.subActive(user)) store.consumeQuota(user.id, file.size / MB);
  store.updateJob(job.id, { status: 'ready', delivery: 'link', finished_at: store.now() });

  const text = t(lang, 'done_link', {
    mb: fmtSize(file.size, lang),
    tg: fmtNum(lang, Math.round(sendMax / MB)),
    min: fmtNum(lang, st.link_ttl_min),
  });
  const markup = kb([[{ text: t(lang, 'btn_download', { mb: fmtSize(file.size, lang) }), url: link.url }]]);
  await setStatus(text, { reply_markup: markup });
}

function resetInterrupted() {
  try {
    store.db.prepare("UPDATE jobs SET status = 'interrupted' WHERE status IN ('queued','running')").run();
  } catch (err) {
    console.error('[bot] reset', err.message);
  }
}

async function handleUpdate(update) {
  try {
    if (update.message) await onMessage(update.message);
    else if (update.callback_query) await onCallback(update.callback_query);
  } catch (err) {
    console.error('[bot] update error:', err.message);
  }
}

const liveStats = () => ({ queued: queue.length, active: activeJobs });

module.exports = { handleUpdate, resetInterrupted, liveStats, _pending: pending };