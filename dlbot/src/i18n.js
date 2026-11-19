'use strict';
/** متن‌های دوزبانه ربات (fa / en). */

const S = {
  choose_lang: { fa: '🌐 زبان خودت را انتخاب کن:', en: '🌐 Choose your language:' },
  lang_saved: { fa: 'زبان روی فارسی تنظیم شد.', en: 'Language set to English.' },
  btn_fa: { fa: '🇮🇷 فارسی', en: '🇮🇷 فارسی' },
  btn_en: { fa: '🇬🇧 English', en: '🇬🇧 English' },

  join_required: {
    fa: '📢 برای استفاده از ربات اول باید عضو کانال ما باشی:\n{channel}\n\nبعد از عضویت روی «✅ عضو شدم» بزن.',
    en: '📢 To use this bot you must join our channel first:\n{channel}\n\nAfter joining, tap “✅ I joined”.',
  },
  btn_join: { fa: '📢 عضویت در کانال', en: '📢 Join channel' },
  btn_check: { fa: '✅ عضو شدم', en: '✅ I joined' },
  not_joined: {
    fa: '⛔️ هنوز عضویتی تأیید نشد. اگر تازه عضو شدی چند ثانیه صبر کن و دوباره بزن.',
    en: '⛔️ Membership not confirmed yet. If you just joined, wait a few seconds and try again.',
  },
  joined_ok: { fa: '✅ عضویت تأیید شد.', en: '✅ Membership confirmed.' },

  main_menu: {
    fa: 'سلام {name} 👋\n\nمن دانلودر همه‌کاره‌ام: کافیه یک لینک بفرستی تا فایلش را برایت بیاورم (یوتیوب، اینستاگرام، تیک‌تاک، توییتر، فایل مستقیم و…).\n\n🎁 بدون شماره و اشتراک: تا {free} مگابایت\n📱 با ثبت شماره موبایل: تا {phone} مگابایت\n⭐️ با اشتراک: بدون محدودیت حجمی (طبق سهمیه)\n\n🔗 فقط کافی است لینک را بفرستی.',
    en: 'Hi {name} 👋\n\nI’m a universal downloader: send me a link and I’ll fetch the file (YouTube, Instagram, TikTok, Twitter, direct files, …).\n\n🎁 No phone / no plan: up to {free} MB\n📱 With phone number: up to {phone} MB\n⭐️ With a plan: no size cap (up to your quota)\n\n🔗 Just send the link.',
  },
  btn_help: { fa: '📚 راهنما', en: '📚 Help' },
  btn_status: { fa: '👤 وضعیت من', en: '👤 My status' },
  btn_lang: { fa: '🌐 زبان', en: '🌐 Language' },
  btn_support: { fa: '💬 پشتیبانی', en: '💬 Support' },
  btn_back: { fa: '⬅️ بازگشت', en: '⬅️ Back' },
  btn_admin: { fa: '🛠 پنل مدیریت', en: '🛠 Admin panel' },

  help: {
    fa: '📚 راهنمای استفاده\n\n۱) لینک ویدیو/فایل را بفرست.\n۲) حجم فایل بررسی می‌شود؛ اگر از سقف پلن‌ات بیشتر بود بهت می‌گویم.\n۳) فایل یا لینک دانلود را می‌گیری.\n\n• فایل‌ها روی سرور نگه‌داری نمی‌شوند؛ بلافاصله پس از تحویل پاک می‌شوند.\n• لینک‌های دانلود موقت‌اند و با اولین دانلود یا پایان مهلت باطل می‌شوند.\n• ارسال لینک‌های تکراری و اسپم باعث محدودیت موقت می‌شود.\n\nℹ️ سقف‌ها: رایگان تا {free}MB — با شماره تا {phone}MB — اشتراک بدون سقف.',
    en: '📚 How to use\n\n1) Send a video/file link.\n2) The size is checked; if it exceeds your plan limit I’ll tell you.\n3) You get the file or a download link.\n\n• Files are never kept on the server — they are deleted right after delivery.\n• Download links are temporary and expire after the first download or the time limit.\n• Repeated links and spam lead to a temporary limit.\n\nℹ️ Limits: free up to {free}MB — with phone up to {phone}MB — plan = no size cap.',
  },

  status_tpl: {
    fa: '👤 وضعیت تو\n\n🆔 شناسه: {id}\n🌐 زبان: {lang}\n📱 شماره: {phoneNumber}\n⭐️ اشتراک: {sub}\n📊 دانلودها: {count} فایل ({mb} مگابایت)\n\n🎁 سقف رایگان: تا {free}MB\n📱 سقف با شماره: تا {phone}MB',
    en: '👤 Your status\n\n🆔 ID: {id}\n🌐 Language: {lang}\n📱 Phone: {phoneNumber}\n⭐️ Plan: {sub}\n📊 Downloads: {count} files ({mb} MB)\n\n🎁 Free cap: up to {free}MB\n📱 With phone: up to {phone}MB',
  },
  sub_none: { fa: 'ندارد', en: 'none' },
  sub_line: {
    fa: 'فعال تا {date} — سهمیه باقی‌مانده {quota}',
    en: 'active until {date} — {quota} left',
  },

  need_phone: {
    fa: '📱 این فایل {mb} مگابایت است؛ برای فایل‌های بالای {free} مگابایت باید یک‌بار شماره موبایل خودت را به اشتراک بگذاری.\n\nدکمه «📱 ثبت شماره» را بزن (شماره‌ی دیگران پذیرفته نمی‌شود).',
    en: '📱 This file is {mb} MB; for files above {free} MB you need to share your own phone number once.\n\nTap “📱 Share my number” (other people’s numbers are rejected).',
  },
  btn_phone: { fa: '📱 ثبت شماره', en: '📱 Share my number' },
  phone_saved: {
    fa: '✅ شماره {phone} ثبت شد. حالا لینک را دوباره بفرست (تا {phoneMax}MB).',
    en: '✅ Number {phone} saved. Send the link again (up to {phoneMax}MB).',
  },
  phone_invalid: {
    fa: '⛔️ فقط شماره‌ی خودت را با دکمه‌ی «📱 ثبت شماره» به اشتراک بگذار.',
    en: '⛔️ Please share your own number using the “📱 Share my number” button.',
  },

  need_sub: {
    fa: '⭐️ این فایل {mb} مگابایت است؛ فایل‌های بالای {phone} مگابایت فقط با اشتراک قابل دریافت‌اند.\n\n💳 پلن‌ها:\n{plans}\n\nبرای خرید اشتراک به {admin} پیام بده و شناسه‌ی خودت را بفرست:\n🆔 {id}',
    en: '⭐️ This file is {mb} MB; files above {phone} MB require a plan.\n\n💳 Plans:\n{plans}\n\nMessage {admin} to buy a plan and send your ID:\n🆔 {id}',
  },
  btn_buy: { fa: '💬 خرید اشتراک', en: '💬 Buy a plan' },
  quota_exceeded: {
    fa: '⛔️ سهمیه اشتراک‌ات برای این فایل کافی نیست (باقی‌مانده {left}MB، لازم {mb}MB). با {admin} تماس بگیر.',
    en: '⛔️ Your plan quota is too small ({left}MB left, {mb}MB needed). Contact {admin}.',
  },
  sub_expired: { fa: '⏳ اشتراک‌ات تمام شده است. با {admin} تماس بگیر.', en: '⏳ Your plan has expired. Contact {admin}.' },

  got_url: { fa: '🔎 لینک را گرفتم، بررسی می‌کنم…', en: '🔎 Got the link, checking…' },
  invalid_url: { fa: '⛔️ لینک معتبر نیست. یک آدرس http/https بفرست.', en: '⛔️ That’s not a valid link. Send an http/https URL.' },
  blocked_domain: { fa: '⛔️ این دامنه پشتیبانی نمی‌شود.', en: '⛔️ This domain is not supported.' },
  cooldown: { fa: '⏱ کمی آرام‌تر! {sec} ثانیه دیگر دوباره تلاش کن.', en: '⏱ Slow down! Try again in {sec} seconds.' },
  hourly_limit: { fa: '📊 سقف {n} دانلود در ساعت را پر کرده‌ای. کمی بعد تلاش کن.', en: '📊 You reached the limit of {n} downloads per hour. Try later.' },
  concurrent_limit: { fa: '⏳ یک دانلود در حال انجام داری؛ تا تمام شود صبر کن.', en: '⏳ You already have a download in progress; wait for it to finish.' },
  daily_limit: { fa: '📊 سقف {mb} مگابایت در روز را پر کرده‌ای.', en: '📊 You reached the {mb} MB daily limit.' },
  muted: { fa: '⛔️ به‌دلیل ارسال‌های نامعتبر موقتاً محدود شده‌ای ({min} دقیقه).', en: '⛔️ You are temporarily limited due to invalid submissions ({min} min).' },
  banned: { fa: '⛔️ دسترسی‌ات به ربات مسدود است.', en: '⛔️ Your access to this bot is blocked.' },
  maintenance: { fa: '🛠 ربات موقتاً در حال به‌روزرسانی است. کمی بعد امتحان کن.', en: '🛠 The bot is under maintenance. Please try again later.' },
  queued: { fa: '🕐 در صف دانلود قرار گرفت (نفر {pos}).', en: '🕐 Queued (position {pos}).' },
  fetching: { fa: '📡 در حال گرفتن اطلاعات فایل…', en: '📡 Fetching file info…' },
  analyzing: { fa: '🔍 در حال شناسایی لینک…', en: '🔍 Analyzing link…' },
  accepted: { fa: '⏳ شروع می‌کنم', en: '⏳ Starting' },
  q_expired: { fa: '⛔️ این انتخاب منقضی شده؛ لینک را دوباره بفرست.', en: '⛔️ This choice expired — send the link again.' },
  downloading: { fa: '⬇️ در حال دانلود… {pct}٪{extra}', en: '⬇️ Downloading… {pct}%{extra}' },
  processing: { fa: '⚙️ در حال آماده‌سازی فایل…', en: '⚙️ Preparing the file…' },
  uploading: { fa: '⬆️ در حال ارسال در تلگرام…', en: '⬆️ Uploading to Telegram…' },
  done_sent: {
    fa: '✅ تمام شد — {mb} در {sec} ثانیه.\n🧹 فایل از سرور پاک شد.',
    en: '✅ Done — {mb} in {sec}s.\n🧹 The file was deleted from the server.',
  },
  done_link: {
    fa: '✅ فایل آماده است — {mb}.\nحجم از سقف ارسال مستقیم تلگرام ({tg}MB) بیشتر است، پس لینک دانلود موقت می‌دهم:\n\n⏳ اعتبار: {min} دقیقه (یا تا اولین دانلود)\n🧹 فایل بعد از تحویل از سرور پاک می‌شود.',
    en: '✅ File ready — {mb}.\nIt is above Telegram’s direct-send cap ({tg}MB), so here is a temporary link:\n\n⏳ Valid: {min} min (or until first download)\n🧹 The file is deleted from the server after delivery.',
  },
  btn_download: { fa: '⬇️ دانلود فایل ({mb})', en: '⬇️ Download ({mb})' },
  btn_cancel: { fa: '✖️ لغو', en: '✖️ Cancel' },
  album_ok: { fa: '✅ {n} فایل ارسال شد — {mb} در {sec} ثانیه.', en: '✅ {n} files sent — {mb} in {sec}s.' },
  gallery_btn: { fa: '🖼 همهٔ تصاویر (آلبوم)', en: '🖼 All images (album)' },
  link_gone: { fa: '⌛️ این لینک منقضی یا مصرف شده است. لینک را دوباره بفرست.', en: '⌛️ This link expired or was used. Send the link again.' },
  too_big: { fa: '⛔️ حجم فایل ({mb}) از سقف مجاز تو ({max}MB) بیشتر است.', en: '⛔️ File size ({mb}) exceeds your limit ({max}MB).' },
  error_generic: { fa: '❌ خطایی رخ داد. لطفاً دوباره تلاش کن.', en: '❌ Something went wrong. Please try again.' },
  error_download: { fa: '❌ دانلود این لینک ممکن نشد (ممکن است خصوصی یا محدود باشد).', en: '❌ Could not download this link (it may be private or restricted).' },
  unsupported: { fa: '⛔️ این نوع فایل پشتیبانی نمی‌شود.', en: '⛔️ This file type is not supported.' },
  cancelled: { fa: '🗑 لغو شد.', en: '🗑 Cancelled.' },
  only_admin: { fa: '⛔️ فقط مدیر.', en: '⛔️ Admins only.' },
  only_private: { fa: 'ℹ️ این دستور فقط در چت خصوصی کار می‌کند.', en: 'ℹ️ This command works in private chat only.' },
  stats_tpl: {
    fa: '📊 آمار کلی\n\n👥 کاربران: {users}\n⬇️ دانلودها: {jobs}\n💾 حجم کل: {gb} گیگابایت\n📅 امروز: {today} دانلود\n⏳ در صف: {queued} — در حال اجرا: {running}',
    en: '📊 Overall stats\n\n👥 Users: {users}\n⬇️ Downloads: {jobs}\n💾 Total: {gb} GB\n📅 Today: {today} downloads\n⏳ Queued: {queued} — running: {running}',
  },
  file_hint_use_url: {
    fa: '📎 برای گرفتن لینک فایل، لطفاً یک آدرس http(s) بفرست.\n(ارسال مستقیم فایل در تلگرام فقط برای فایل‌های کوچک تا {mb}MB پشتیبانی می‌شود.)',
    en: '📎 To get a file link, send an http(s) URL.\n(Direct Telegram files are supported up to {mb}MB.)',
  },
  file_too_big_tg: { fa: '⛔️ تلگرام اجازه نمی‌دهد ربات فایل‌های بزرگ‌تر از {mb}MB را از تلگرام دریافت کند.', en: '⛔️ Telegram does not allow bots to fetch files above {mb}MB.' },
  file_ready_link: { fa: '✅ لینک موقت فایل تو (تا {min} دقیقه):\n{url}', en: '✅ Your temporary file link (valid {min} min):\n{url}' },
  maintenance_admin: { fa: 'حالت تعمیرات روشن است؛ برای کاربران عادی ربات پیام تعمیرات می‌دهد.', en: 'Maintenance mode is on; regular users get a maintenance notice.' },
};

function t(lang, key, vars) {
  const entry = S[key];
  if (!entry) return key;
  let out = entry[lang === 'en' ? 'en' : 'fa'];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

const faNum = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/** عدد را بر اساس زبان قالب‌بندی می‌کند */
function fmtNum(lang, n) {
  const s = Number(n).toLocaleString('en-US');
  return lang === 'en' ? s : faNum(s);
}

/** حجم بایت را خوانا می‌کند */
function fmtSize(bytes, lang) {
  const b = Number(bytes) || 0;
  const mb = b / 1048576;
  let num;
  if (mb >= 1024) {
    const gb = mb / 1024;
    num = gb >= 10 ? gb.toFixed(0) : gb.toFixed(1).replace(/\.0$/, '');
    return lang === 'en' ? `${num} GB` : `${faNum(num)} گیگابایت`;
  }
  num = mb >= 100 ? mb.toFixed(0) : mb.toFixed(1).replace(/\.0$/, '');
  return lang === 'en' ? `${num} MB` : `${faNum(num)} مگابایت`;
}

module.exports = { t, S, faNum, fmtNum, fmtSize };
