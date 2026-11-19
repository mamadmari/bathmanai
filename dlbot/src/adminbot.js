'use strict';
/**
 * 🦇 بتمن‌پنل — مدیریت کامل ربات داخل خود تلگرام (دکمه‌های شیشه‌ای + ایموجی)
 * همه‌چیز از Bot API و SQLite محلی؛ نیازی به پنل وب نیست.
 */
const path = require('node:path');
const fs = require('node:fs');
const config = require('./config');
const store = require('./db');
const tg = require('./tg');
const files = require('./files');
const policy = require('./policy');

const MB = policy.MB;
const pending = new Map(); // userId → { mode, chatId, data, at }
const PENDING_TTL = 15 * 60 * 1000;

const esc = (s) =>
  String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const n = (v) => Number(v || 0).toLocaleString('en-US');
const size = (bytes) => {
  const b = Number(bytes || 0);
  if (b >= 1024 * MB) return `${(b / (1024 * MB)).toFixed(2)} GB`;
  if (b >= MB) return `${(b / MB).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
};
const btn = (text, data) => ({ text, callback_data: data });
const kb = (rows) => ({ inline_keyboard: rows });

const NUMKEYS = {
  free_max_mb: { label: 'سقف رایگان', unit: 'MB' },
  phone_max_mb: { label: 'سقف با شماره', unit: 'MB' },
  telegram_send_max_mb: { label: 'ارسال مستقیم', unit: 'MB' },
  cooldown_sec: { label: 'فاصله', unit: 'ثانیه' },
  max_per_hour: { label: 'در ساعت', unit: 'عدد' },
  max_concurrent_global: { label: 'همزمان کل', unit: 'عدد' },
  max_concurrent_user: { label: 'همزمان کاربر', unit: 'عدد' },
  link_ttl_min: { label: 'اعتبار لینک', unit: 'دقیقه' },
  ytdlp_max_height: { label: 'کیفیت', unit: 'p' },
};

const BOOLKEYS = {
  force_join: 'قفل کانال',
  maintenance: 'حالت تعمیر',
  delete_after_first_download: 'حذف بعد از اولین دانلود',
  allow_private_urls: 'اجازه آدرس خصوصی',
  audio_only: 'همیشه MP3',
};

const HOME_KB = () => [
  [btn('👥 کاربران', 'ad|users|0'), btn('📥 دانلودها', 'ad|files')],
  [btn('⚙️ تنظیمات', 'ad|set'), btn('📣 کانال', 'ad|ch')],
  [btn('🍪 کوکی‌ها', 'ad|cookies'), btn('📢 پیام همگانی', 'ad|bc')],
  [btn('🧾 رویدادها', 'ad|events'), btn('🔐 رمز پنل وب', 'ad|pw')],
  [btn('🔄 بروزرسانی', 'ad|home'), btn('❌ بستن', 'ad|close')],
];

function cookiesInfo() {
  try {
    const st = fs.statSync(path.join(config.dataDir, 'cookies.txt'));
    return { exists: true, kb: Math.max(1, Math.round(st.size / 1024)), at: st.mtime.toISOString().slice(0, 16).replace('T', ' ') };
  } catch {
    return { exists: false, kb: 0, at: '' };
  }
}

function homeScreen() {
  const st = store.settings();
  const s = store.stats();
  const ck = cookiesInfo();
  const channel = st.channel ? `<code>${esc(st.channel)}</code>` : '⛔️ تنظیم نشده';
  const lines = [
    '🦇 <b>بتمن‌پنل</b> · <i>Bat Panel</i>',
    '━━━━━━━━━━━━━━━━',
    `👥 کاربران: <b>${n(s.users)}</b>   📥 دانلود: <b>${n(s.jobs)}</b>   📅 امروز: <b>${n(s.today)}</b>`,
    `💾 حجم کل: <b>${size(s.bytes)}</b>`,
    `⏳ در صف: <b>${n(s.queued)}</b>   ⚙️ در حال اجرا: <b>${n(s.running)}</b>`,
    `📣 کانال: ${channel} ${st.force_join ? '🔒' : '🔓'}`,
    `🍪 کوکی: ${ck.exists ? `✅ ${ck.kb}KB · ${ck.at}` : '⛔️ ندارد'}`,
    `🎚 کیفیت: <b>${n(st.ytdlp_max_height)}p</b>   🎵 ${st.audio_only ? 'MP3' : 'ویدیو'}`,
    st.maintenance ? '🛠 <b>حالت تعمیر روشن است</b>' : '',
  ].filter(Boolean);
  return { text: lines.join('\n'), markup: kb(HOME_KB()) };
}

function usersScreen(page = 0, q = '') {
  const per = 6;
  const total = store.countUsers(q);
  const list = store.listUsers({ q, limit: per, offset: page * per });
  const rows = [];
  for (const u of list) {
    const name = u.first_name || u.username || String(u.id);
    const flag = u.blocked ? '⛔️' : u.phone_verified ? '📱' : '👤';
    rows.push([btn(`${flag} ${name.slice(0, 22)}`, `ad|u|${u.id}`)]);
  }
  const nav = [];
  if (page > 0) nav.push(btn('◀️ قبلی', `ad|users|${page - 1}`));
  if ((page + 1) * per < total) nav.push(btn('بعدی ▶️', `ad|users|${page + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([btn('🔍 جست‌وجو', 'ad|find'), btn('🔄 بروزرسانی', `ad|users|${page}`)]);
  rows.push([btn('🏠 داشبورد', 'ad|home'), btn('❌ بستن', 'ad|close')]);
  const text = ['👥 <b>کاربران</b>', '━━━━━━━━━━━━━━━━', q ? `🔍 فیلتر: <code>${esc(q)}</code>` : '', `📊 مجموع: <b>${n(total)}</b> · نمایش: ${list.length}`, list.length ? '' : '— خالی —']
    .filter(Boolean)
    .join('\n');
  return { text, markup: kb(rows) };
}

function profileScreen(id) {
  const u = store.getUser(id);
  if (!u) return { text: '❌ کاربر پیدا نشد.', markup: kb([[btn('👥 کاربران', 'ad|users|0')]]) };
  const sub = store.subActive(u)
    ? `تا <b>${String(u.sub_until).slice(0, 10)}</b>${u.sub_quota_mb ? ` · ${n(u.sub_quota_mb)}MB` : ' · نامحدود'}`
    : '✖️ ندارد';
  const text = [
    '👤 <b>پروفایل کاربر</b>',
    '━━━━━━━━━━━━━━━━',
    `🧑 نام: <b>${esc(u.first_name || '—')}</b>${u.username ? ` (@${esc(u.username)})` : ''}`,
    `🆔 <code>${u.id}</code>`,
    `📱 شماره: ${u.phone_verified ? `✅ <code>${esc(u.phone || '')}</code>` : '✖️ تأیید نشده'}`,
    `🚫 وضعیت: <b>${u.blocked ? 'مسدود' : 'آزاد'}</b>`,
    `⬇️ دانلود: <b>${n(u.downloads)}</b> · <b>${size(u.bytes)}</b>`,
    `🎁 اشتراک: ${sub}`,
    `🌐 زبان: ${u.lang === 'en' ? 'English' : 'فارسی'}`,
    `📅 آخرین فعالیت: ${String(u.last_seen || '').slice(0, 16).replace('T', ' ')}`,
  ].join('\n');
  const rows = [
    [u.blocked ? btn('✅ آنبن', `ad|unban|${id}`) : btn('⛔️ بن', `ad|ban|${id}`), btn('✉️ پیام', `ad|msg|${id}`)],
    [btn('🎁 ۷ روز', `ad|gift|${id}|7`), btn('🎁 ۳۰ روز', `ad|gift|${id}|30`)],
    [btn('💎 ۳۰ روز + ۵GB', `ad|gift|${id}|30|5120`)],
    [btn('◀️ کاربران', 'ad|users|0'), btn('🏠 داشبورد', 'ad|home')],
  ];
  return { text, markup: kb(rows) };
}

function filesScreen() {
  const jobs = store.listJobs({ limit: 8 });
  const emoji = { sent: '✅', ready: '🔗', running: '⚙️', 'queued': '⏳', failed: '❌', rejected: '🚫', cancelled: '🗑', expired: '⌛️' };
  const rows = [];
  const lines = ['📥 <b>آخرین دانلودها</b>', '━━━━━━━━━━━━━━━━'];
  for (const j of jobs) {
    const t = String(j.title || j.url || '').replace(/\s+/g, ' ').slice(0, 26);
    lines.push(`${emoji[j.status] || '•'} <code>#${j.id}</code> ${esc(t)} · ${size(j.size)}`);
    if (['running', 'queued', 'ready'].includes(j.status)) {
      rows.push([btn(`❌ لغو #${j.id}`, `ad|jc|${j.id}`), btn(`🗑 حذف #${j.id}`, `ad|jd|${j.id}`)]);
    }
  }
  if (!jobs.length) lines.push('— خالی —');
  rows.push([btn('♻️ ریست گیرکرده‌ها', 'ad|reset'), btn('🔄 بروزرسانی', 'ad|files')]);
  rows.push([btn('🏠 داشبورد', 'ad|home'), btn('❌ بستن', 'ad|close')]);
  return { text: lines.join('\n'), markup: kb(rows) };
}

function settingsScreen() {
  const st = store.settings();
  const text = [
    '⚙️ <b>تنظیمات</b>',
    '━━━━━━━━━━━━━━━━',
    `📏 رایگان: <b>${n(st.free_max_mb)}</b>MB · 📱 با شماره: <b>${n(st.phone_max_mb)}</b>MB`,
    `📤 ارسال مستقیم: <b>${n(st.telegram_send_max_mb)}</b>MB`,
    `⏱ فاصله: <b>${n(st.cooldown_sec)}</b>s · 🕐 در ساعت: <b>${n(st.max_per_hour)}</b>`,
    `⚙️ همزمان: کل <b>${n(st.max_concurrent_global)}</b> · کاربر <b>${n(st.max_concurrent_user)}</b>`,
    `🔗 TTL لینک: <b>${n(st.link_ttl_min)}</b> دقیقه`,
    `🎚 کیفیت: <b>${n(st.ytdlp_max_height)}p</b> · 🎵 فقط صدا: ${st.audio_only ? '✅' : '✖️'}`,
    `🔒 قفل کانال: ${st.force_join ? '✅' : '✖️'} · 🛠 تعمیر: ${st.maintenance ? '✅' : '✖️'}`,
  ].join('\n');
  const rows = [
    [btn('📏 سقف‌ها', 'ad|set|limits'), btn('⏱ محدودیت‌ها', 'ad|set|rate')],
    [btn('🎚 کیفیت', 'ad|set|quality'), btn('🔧 کلیدها', 'ad|set|flags')],
    [btn('🏠 داشبورد', 'ad|home'), btn('❌ بستن', 'ad|close')],
  ];
  return { text, markup: kb(rows) };
}

function limitsScreen() {
  const st = store.settings();
  const text = [
    '📏 <b>سقف حجم‌ها</b>',
    '━━━━━━━━━━━━━━━━',
    `👤 رایگان: <b>${n(st.free_max_mb)}</b> MB`,
    `📱 با شماره: <b>${n(st.phone_max_mb)}</b> MB`,
    `📤 ارسال مستقیم تلگرام: <b>${n(st.telegram_send_max_mb)}</b> MB`,
  ].join('\n');
  const rows = [
    [btn('➖ رایگان', 'ad|inc|free_max_mb|-100'), btn('➕ رایگان', 'ad|inc|free_max_mb|100')],
    [btn('➖ با شماره', 'ad|inc|phone_max_mb|-100'), btn('➕ با شماره', 'ad|inc|phone_max_mb|100')],
    [btn('➖ ارسال مستقیم', 'ad|inc|telegram_send_max_mb|-5'), btn('➕ ارسال مستقیم', 'ad|inc|telegram_send_max_mb|5')],
    [btn('🎯 رایگان=۳۰۰', 'ad|setv|free_max_mb|300'), btn('🎯 رایگان=۱۰۰۰', 'ad|setv|free_max_mb|1000')],
    [btn('🏠 داشبورد', 'ad|home'), btn('⚙️ تنظیمات', 'ad|set')],
  ];
  return { text, markup: kb(rows) };
}

function rateScreen() {
  const st = store.settings();
  const text = [
    '⏱ <b>محدودیت‌ها و صف</b>',
    '━━━━━━━━━━━━━━━━',
    `⏳ فاصله بین درخواست‌ها: <b>${n(st.cooldown_sec)}</b> ثانیه`,
    `🕐 سقف در ساعت: <b>${n(st.max_per_hour)}</b>`,
    `⚙️ همزمان کل: <b>${n(st.max_concurrent_global)}</b> · هر کاربر: <b>${n(st.max_concurrent_user)}</b>`,
    `🔗 اعتبار لینک: <b>${n(st.link_ttl_min)}</b> دقیقه`,
  ].join('\n');
  const rows = [
    [btn('➖ فاصله', 'ad|inc|cooldown_sec|-10'), btn('➕ فاصله', 'ad|inc|cooldown_sec|10')],
    [btn('➖ در ساعت', 'ad|inc|max_per_hour|-2'), btn('➕ در ساعت', 'ad|inc|max_per_hour|2')],
    [btn('➖ TTL لینک', 'ad|inc|link_ttl_min|-30'), btn('➕ TTL لینک', 'ad|inc|link_ttl_min|30')],
    [btn('⚙️ همزمان کل', 'ad|inc|max_concurrent_global|1'), btn('👤 هر کاربر', 'ad|inc|max_concurrent_user|1')],
    [btn('🏠 داشبورد', 'ad|home'), btn('⚙️ تنظیمات', 'ad|set')],
  ];
  return { text, markup: kb(rows) };
}

function qualityScreen() {
  const st = store.settings();
  const text = [
    '🎚 <b>کیفیت دانلود</b>',
    '━━━━━━━━━━━━━━━━',
    `حداکثر ارتفاع: <b>${n(st.ytdlp_max_height)}p</b>`,
    `🎵 فقط صدا (MP3): <b>${st.audio_only ? 'روشن' : 'خاموش'}</b>`,
  ].join('\n');
  const rows = [
    [btn('720p', 'ad|setv|ytdlp_max_height|720'), btn('1080p', 'ad|setv|ytdlp_max_height|1080'), btn('1440p', 'ad|setv|ytdlp_max_height|1440')],
    [btn('2160p', 'ad|setv|ytdlp_max_height|2160'), btn('همه', 'ad|setv|ytdlp_max_height|4320')],
    [btn(`${st.audio_only ? '🔊' : '🎬'} پیش‌فرض: ${st.audio_only ? 'صدا' : 'ویدیو'}`, 'ad|toggle|audio_only')],
    [btn('🏠 داشبورد', 'ad|home'), btn('⚙️ تنظیمات', 'ad|set')],
  ];
  return { text, markup: kb(rows) };
}

function flagsScreen() {
  const st = store.settings();
  const text = ['🔧 <b>کلیدهای رفتاری</b>', '━━━━━━━━━━━━━━━━'];
  const rows = [];
  for (const [k, label] of Object.entries(BOOLKEYS)) {
    const on = !!st[k];
    text.push(`${on ? '🟢' : '⚫️'} ${label}`);
    rows.push([btn(`${on ? '✅' : '⭕️'} ${label}`, `ad|toggle|${k}`)]);
  }
  rows.push([btn('🏠 داشبورد', 'ad|home'), btn('⚙️ تنظیمات', 'ad|set')]);
  return { text: text.join('\n'), markup: kb(rows) };
}

function channelScreen(error) {
  const st = store.settings();
  const text = [
    '📣 <b>قفل کانال</b>',
    '━━━━━━━━━━━━━━━━',
    `کانال: ${st.channel ? `<code>${esc(st.channel)}</code>` : '⛔️ تنظیم نشده'}`,
    `وضعیت قفل: <b>${st.force_join ? 'روشن' : 'خاموش'}</b>`,
    '',
    '🔹 ربات باید در کانال <b>ادمین</b> باشد.',
    '🔹 برای کانال خصوصی، یک پیام از کانال را <b>فوروارد</b> کن.',
    error ? `⚠️ ${esc(error)}` : '',
  ].filter(Boolean).join('\n');
  const rows = [
    [btn('🔗 ثبت با نام/آیدی', 'ad|ch|set'), btn('📋 فوروارد از کانال', 'ad|ch|fwd')],
    [btn('🧪 تست کانال', 'ad|ch|test'), btn('🗑 حذف کانال', 'ad|ch|del')],
    [btn(`${st.force_join ? '🔓 خاموش کردن قفل' : '🔒 روشن کردن قفل'}`, 'ad|toggle|force_join')],
    [btn('🏠 داشبورد', 'ad|home'), btn('❌ بستن', 'ad|close')],
  ];
  return { text, markup: kb(rows) };
}

function cookiesScreen(extra) {
  const ck = cookiesInfo();
  const text = [
    '🍪 <b>کوکی‌ها</b>',
    '━━━━━━━━━━━━━━━━',
    ck.exists ? `وضعیت: ✅ <b>${ck.kb} KB</b> · ${ck.at}` : 'وضعیت: ⛔️ فایلی ثبت نشده',
    '',
    'برای اینستاگرام (پست خصوصی/کاروسل)، توییتر و بردهای پینترست لازم است.',
    'روش ۱: فایل <code>cookies.txt</code> (فرمت Netscape) را همین‌جا بفرست.',
    'روش ۲: متن کوکی را پیست کن.',
    extra ? `\n${esc(extra)}` : '',
  ].filter(Boolean).join('\n');
  const rows = [
    [btn('📎 ارسال فایل کوکی', 'ad|ck|file'), btn('📝 پیست متن', 'ad|ck|paste')],
    [btn('🗑 حذف کوکی‌ها', 'ad|ck|del')],
    [btn('🏠 داشبورد', 'ad|home'), btn('❌ بستن', 'ad|close')],
  ];
  return { text, markup: kb(rows) };
}

function eventsScreen() {
  const ev = store.recentEvents(12);
  const lines = ['🧾 <b>آخرین رویدادها</b>', '━━━━━━━━━━━━━━━━'];
  for (const e of ev) {
    lines.push(`• <code>${String(e.created_at).slice(11, 16)}</code> ${esc(e.type)}${e.detail ? ` — ${esc(String(e.detail).slice(0, 40))}` : ''}`);
  }
  if (!ev.length) lines.push('— خالی —');
  return {
    text: lines.join('\n'),
    markup: kb([
      [btn('🔄 بروزرسانی', 'ad|events'), btn('🏠 داشبورد', 'ad|home')],
      [btn('❌ بستن', 'ad|close')],
    ]),
  };
}

/* ------------------------------ نمایش/ویرایش ------------------------------ */

async function show(chatId, messageId, screen) {
  if (messageId) {
    const r = await tg.editMessage(chatId, messageId, screen.text, { parse_mode: 'HTML', reply_markup: screen.markup });
    if (r && r.ok) return r;
    if (r && /message is not modified/i.test(String(r.description || ''))) return r;
  }
  return tg.call('sendMessage', {
    chat_id: chatId,
    text: screen.text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: screen.markup,
  });
}

/** باز کردن پنل با پیام تازه */
async function open(chatId) {
  const screen = homeScreen();
  await tg.call('sendMessage', {
    chat_id: chatId,
    text: screen.text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: screen.markup,
  });
}

function askInput(userId, chatId, mode, prompt, data) {
  pending.set(userId, { mode, chatId, data: data || null, at: Date.now() });
  for (const [k, v] of pending) if (Date.now() - v.at > PENDING_TTL) pending.delete(k);
  return tg.call('sendMessage', {
    chat_id: chatId,
    text: prompt,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '✖️ انصراف', callback_data: 'ad|cancel' }]] },
  });
}


/* ------------------------------ منطق دکمه‌ها ------------------------------ */

const cookiesPath = () => path.join(config.dataDir, 'cookies.txt');
let bcText = '';

async function testChannel(channel) {
  const target = /^-?\d+$/.test(String(channel || '')) ? Number(channel) : String(channel || '');
  const info = await tg.getChat(target, 15000);
  if (!info.ok) return { ok: false, msg: String(info.description || 'getChat failed').slice(0, 140) };
  const me = await tg.getMe();
  const botId = (me && me.result && me.result.id) || 0;
  const mem = botId ? await tg.getChatMember(target, botId) : { ok: false };
  const status = mem.ok ? mem.result.status : 'unknown';
  return { ok: mem.ok && ['administrator', 'creator'].includes(status), msg: `${(info.result && info.result.title) || channel} · ربات: ${status}` };
}

function subForSetting(key) {
  if (['free_max_mb', 'phone_max_mb', 'telegram_send_max_mb'].includes(key)) return limitsScreen();
  if (['cooldown_sec', 'max_per_hour', 'link_ttl_min', 'max_concurrent_global', 'max_concurrent_user'].includes(key)) return rateScreen();
  if (key === 'ytdlp_max_height') return qualityScreen();
  return settingsScreen();
}

async function handleCallback(cq, user) {
  if (!config.isAdmin(user.id)) {
    await tg.answerCallback(cq.id, '⛔️ فقط مدیر');
    return;
  }
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const parts = String(cq.data || '').split('|');
  const a = parts[1] || 'home';

  if (a === 'close') {
    await tg.answerCallback(cq.id);
    await tg.deleteMessage(chatId, messageId).catch(() => {});
    return;
  }
  if (a === 'noop') {
    await tg.answerCallback(cq.id);
    return;
  }
  if (a === 'ch' || a === 'ck' || a === 'bc') {
    await handleSection(cq, user, parts, chatId, messageId);
    return;
  }

  let screen = null;
  let toast = '';

  if (a === 'cancel') {
    pending.delete(user.id);
    await tg.answerCallback(cq.id, 'لغو شد');
    screen = homeScreen();
  } else if (a === 'home') {
    screen = homeScreen();
  } else if (a === 'users') {
    screen = usersScreen(Number(parts[2] || 0));
  } else if (a === 'u') {
    screen = profileScreen(Number(parts[2]));
  } else if (a === 'ban' || a === 'unban') {
    const id = Number(parts[2]);
    store.setBlocked(id, a === 'ban');
    store.logEvent(id, a === 'ban' ? 'ban' : 'unban', `by ${user.id}`);
    toast = a === 'ban' ? '⛔️ مسدود شد' : '✅ آزاد شد';
    screen = profileScreen(id);
  } else if (a === 'gift') {
    const id = Number(parts[2]);
    const days = Number(parts[3] || 30);
    const quota = Number(parts[4] || 0);
    const u2 = store.grantSub(id, days, quota);
    if (u2) {
      store.logEvent(id, 'admin_grant', `by ${user.id} ${days}d/${quota}MB`);
      toast = `🎁 ${days} روز اعمال شد`;
    } else toast = 'کاربر پیدا نشد';
    screen = profileScreen(id);
  } else if (a === 'msg') {
    await tg.answerCallback(cq.id);
    await askInput(user.id, chatId, 'usermsg', `✉️ پیام برای <code>${parts[2]}</code> را بنویس:`, Number(parts[2]));
    return;
  } else if (a === 'find') {
    await tg.answerCallback(cq.id);
    await askInput(user.id, chatId, 'find', '🔍 نام، یوزرنیم یا آیدی را بنویس:');
    return;
  } else if (a === 'files') {
    screen = filesScreen();
  } else if (a === 'jc' || a === 'jd') {
    const id = Number(parts[2]);
    await files.removeJobDir(id).catch(() => {});
    store.updateJob(id, { status: 'cancelled', finished_at: store.now(), deleted_at: store.now() });
    toast = a === 'jc' ? '❌ لغو شد' : '🗑 حذف شد';
    screen = filesScreen();
  } else if (a === 'reset') {
    const list = store.listJobs({ limit: 100 }).filter((j) => ['running', 'queued', 'pending'].includes(j.status));
    let k = 0;
    for (const j of list) {
      if (Date.now() - new Date(j.created_at).getTime() > 2 * 3600 * 1000) {
        store.updateJob(j.id, { status: 'failed', error: 'stuck', finished_at: store.now(), deleted_at: store.now() });
        await files.removeJobDir(j.id).catch(() => {});
        k += 1;
      }
    }
    toast = `♻️ ${k} جاب ریست شد`;
    screen = filesScreen();
  } else if (a === 'set') {
    const sub = parts[2];
    screen = sub === 'limits' ? limitsScreen() : sub === 'rate' ? rateScreen() : sub === 'quality' ? qualityScreen() : sub === 'flags' ? flagsScreen() : settingsScreen();
  } else if (a === 'inc') {
    const key = parts[2];
    const cur = Number(store.settings()[key] || 0);
    const next = cur + Number(parts[3] || 0);
    store.saveSettings({ [key]: next });
    toast = `✅ ${next}`;
    screen = subForSetting(key);
  } else if (a === 'setv') {
    const key = parts[2];
    store.saveSettings({ [key]: Number(parts[3] || 0) });
    toast = '✅ ثبت شد';
    screen = subForSetting(key);
  } else if (a === 'toggle') {
    const key = parts[2];
    const cur = !!store.settings()[key];
    store.saveSettings({ [key]: !cur });
    toast = `${BOOLKEYS[key] || key}: ${!cur ? 'روشن' : 'خاموش'}`;
    screen = key === 'force_join' ? channelScreen() : key === 'audio_only' ? qualityScreen() : flagsScreen();
  } else if (a === 'events') {
    screen = eventsScreen();
  } else if (a === 'pw') {
    await tg.answerCallback(cq.id);
    await askInput(user.id, chatId, 'pw', '🔐 رمز جدید پنل وب (حداقل ۸ کاراکتر) را بفرست:');
    return;
  } else {
    screen = homeScreen();
  }

  await tg.answerCallback(cq.id, toast || undefined);
  if (screen) await show(chatId, messageId, screen);
}


/* --------------------- بخش کانال / کوکی / پیام همگانی --------------------- */

function bcPreview() {
  return {
    text: [
      '📢 <b>پیام همگانی</b>',
      '━━━━━━━━━━━━━━━━',
      `👥 گیرندگان: <b>${n(store.allUserIds().length)}</b>`,
      '',
      bcText ? `پیش‌نمایش:\n\n${esc(bcText)}` : 'هنوز متنی نوشته نشده.',
    ].join('\n'),
    markup: kb(
      [
        [btn('✍️ نوشتن پیام', 'ad|bc|write')],
        bcText ? [btn('✅ ارسال کن', 'ad|bc|send'), btn('🗑 پاک کردن', 'ad|bc|clear')] : [],
        [btn('🏠 داشبورد', 'ad|home'), btn('❌ بستن', 'ad|close')],
      ].filter((r) => r.length)
    ),
  };
}

async function handleSection(cq, user, parts, chatId, messageId) {
  const a = parts[1];
  const sub = parts[2] || '';
  let screen = null;
  let toast = '';

  if (a === 'ch') {
    if (sub === 'set') {
      await tg.answerCallback(cq.id);
      await askInput(user.id, chatId, 'channel', '🔗 آیدی کانال را بفرست:\nمثال: <code>@bathmanai</code> یا <code>-1001234567890</code>');
      return;
    }
    if (sub === 'fwd') {
      await tg.answerCallback(cq.id);
      await askInput(user.id, chatId, 'channelfwd', '📋 یک پیام از خود کانال را <b>فوروارد</b> کن.');
      return;
    }
    if (sub === 'test') {
      const st2 = store.settings();
      if (!st2.channel) toast = 'اول کانال را ثبت کن';
      else {
        const r = await testChannel(st2.channel);
        store.setSetting('channel_lock_error', r.ok ? '' : r.msg);
        toast = `${r.ok ? '✅' : '⚠️'} ${r.msg}`.slice(0, 190);
      }
      screen = channelScreen();
    } else if (sub === 'del') {
      store.saveSettings({ channel: '', force_join: false });
      toast = '🗑 کانال حذف شد';
      screen = channelScreen();
    } else {
      screen = channelScreen();
    }
  } else if (a === 'ck') {
    if (sub === 'file') {
      await tg.answerCallback(cq.id);
      await askInput(user.id, chatId, 'cookiefile', '📎 فایل <code>cookies.txt</code> را همین‌جا بفرست.');
      return;
    }
    if (sub === 'paste') {
      await tg.answerCallback(cq.id);
      await askInput(user.id, chatId, 'cookietext', '📝 متن کوکی (فرمت Netscape) را پیست کن.');
      return;
    }
    if (sub === 'del') {
      fs.rmSync(cookiesPath(), { force: true });
      toast = '🗑 کوکی‌ها حذف شد';
    }
    screen = cookiesScreen();
  } else if (a === 'bc') {
    if (sub === 'write') {
      await tg.answerCallback(cq.id);
      await askInput(user.id, chatId, 'bctext', '📢 متن پیام همگانی را بنویس:');
      return;
    }
    if (sub === 'clear') {
      bcText = '';
      toast = '🗑 پاک شد';
    } else if (sub === 'send' && bcText) {
      const ids = store.allUserIds();
      let sent = 0;
      for (const id of ids) {
        const r = await tg.sendMessage(id, bcText, { parse_mode: 'HTML' });
        if (r.ok) sent += 1;
        await new Promise((res) => setTimeout(res, 45));
      }
      store.logEvent(null, 'broadcast', `by ${user.id} → ${sent}/${ids.length}`);
      toast = `📢 ${sent}/${ids.length}`;
      bcText = '';
    }
    screen = bcPreview();
  }

  await tg.answerCallback(cq.id, toast || undefined);
  if (screen) await show(chatId, messageId, screen);
}


/* ------------------------------ ورودی متنی ------------------------------ */

async function handleInput(msg, user) {
  if (!config.isAdmin(user.id)) return false;
  const rec = pending.get(user.id);
  if (!rec) return false;
  if (Date.now() - rec.at > PENDING_TTL) {
    pending.delete(user.id);
    return false;
  }
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();

  if (rec.mode === 'cookiefile') {
    const doc = msg.document;
    if (!doc) return false;
    pending.delete(user.id);
    const info = await tg.getFile(doc.file_id);
    if (!info.ok) {
      await tg.sendMessage(chatId, `⚠️ ${info.description || 'getFile failed'}`);
      return true;
    }
    await tg.downloadTelegramFile(info.result.file_path, cookiesPath(), 5 * MB);
    fs.chmodSync(cookiesPath(), 0o600);
    await show(chatId, null, cookiesScreen('✅ فایل کوکی ذخیره شد.'));
    return true;
  }

  if (!text) return false;
  pending.delete(user.id);

  if (rec.mode === 'channel') {
    const ch = text.replace(/^https?:\/\/t\.me\//i, '@').trim();
    store.saveSettings({ channel: ch, force_join: true });
    const r = await testChannel(ch);
    store.setSetting('channel_lock_error', r.ok ? '' : r.msg);
    await show(chatId, null, channelScreen(`${r.ok ? '✅' : '⚠️'} ${r.msg}`));
    return true;
  }

  if (rec.mode === 'channelfwd') {
    const chat =
      (msg.forward_from_chat && msg.forward_from_chat.id) ||
      (msg.forward_origin && msg.forward_origin.chat && msg.forward_origin.chat.id) ||
      (msg.forward_origin && msg.forward_origin.sender_chat && msg.forward_origin.sender_chat.id);
    if (!chat) {
      await show(chatId, null, channelScreen('این پیام از کانال فوروارد نشده بود.'));
      return true;
    }
    store.saveSettings({ channel: String(chat), force_join: true });
    const r = await testChannel(String(chat));
    store.setSetting('channel_lock_error', r.ok ? '' : r.msg);
    await show(chatId, null, channelScreen(`${r.ok ? '✅' : '⚠️'} ${r.msg}`));
    return true;
  }

  if (rec.mode === 'cookietext') {
    const txt = text.replace(/\r\n/g, '\n').trim();
    if (!/\t/.test(txt)) {
      await show(chatId, null, cookiesScreen('⛔️ فرمت درست نیست (باید Netscape و با تب).'));
      return true;
    }
    fs.writeFileSync(cookiesPath(), `${txt}\n`, { mode: 0o600 });
    await show(chatId, null, cookiesScreen('✅ کوکی ذخیره شد.'));
    return true;
  }

  if (rec.mode === 'bctext') {
    bcText = text.slice(0, 3800);
    await show(chatId, null, bcPreview());
    return true;
  }

  if (rec.mode === 'pw') {
    if (text.length < 8) {
      await tg.sendMessage(chatId, '⚠️ رمز باید حداقل ۸ کاراکتر باشد.');
      return true;
    }
    store.setSetting('panel_password_hash', store.hashPassword(text));
    await tg.sendMessage(chatId, '🔐 رمز پنل وب تغییر کرد.');
    return true;
  }

  if (rec.mode === 'usermsg') {
    const id = Number(rec.data);
    const r = await tg.sendMessage(id, text);
    await tg.sendMessage(chatId, r.ok ? `✅ ارسال شد به ${id}` : `⚠️ ${r.description || 'خطا'}`);
    return true;
  }

  if (rec.mode === 'find') {
    await show(chatId, null, usersScreen(0, text));
    return true;
  }

  return false;
}

module.exports = { open, handleCallback, handleInput, pending };

