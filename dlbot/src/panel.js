'use strict';
/** پنل مدیریت وب — HTML/CSS درون‌برنامه‌ای، بدون فایل خارجی. */

const esc = (v) =>
  String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fa = (n) => String(n === null || n === undefined ? '' : n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const num = (n) => fa(Number(n || 0).toLocaleString('en-US'));
const mb = (b) => {
  const v = Number(b || 0) / 1048576;
  if (v >= 1024) return `${fa((v / 1024).toFixed(1))} گیگ`;
  return `${fa(v.toFixed(v >= 100 ? 0 : 1))} مگ`;
};
const dt = (iso) => {
  if (!iso) return '—';
  try {
    return fa(new Date(iso).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' }));
  } catch {
    return esc(iso);
  }
};

const CSS = `
:root{--bg:#070a11;--card:rgba(255,255,255,.045);--line:rgba(255,255,255,.09);--ink:#eef2f8;--mut:#93a0b5;--gold:#ffc857;--mint:#4ade80;--red:#f87171}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(70% 45% at 90% 0%,rgba(255,200,87,.10),transparent 60%),radial-gradient(60% 40% at 0% 10%,rgba(127,176,255,.10),transparent 60%),var(--bg);color:var(--ink);font-family:Vazirmatn,"Segoe UI",Tahoma,sans-serif;font-size:14px;line-height:1.7;min-height:100vh}
a{color:var(--gold);text-decoration:none}
.wrap{max-width:1180px;margin:0 auto;padding:18px}
header.top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 18px;border:1px solid var(--line);border-radius:18px;background:linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.02))}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:16px}
.logo{width:34px;height:34px;border-radius:11px;background:linear-gradient(150deg,#ffd479,#e0a72c);display:grid;place-items:center;color:#241a00;font-weight:900}
nav.links{display:flex;gap:6px;flex-wrap:wrap;margin-inline-start:auto}
nav.links a{padding:7px 11px;border-radius:11px;color:var(--mut);border:1px solid transparent}
nav.links a:hover{color:var(--ink);background:rgba(255,255,255,.06)}
nav.links a.on{color:#241a00;background:linear-gradient(150deg,#ffd479,#e2ab30);font-weight:700}
.grid{display:grid;gap:12px;margin-top:14px}
.g4{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.g3{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.card{border:1px solid var(--line);border-radius:16px;background:var(--card);padding:14px 16px}
.card h3{margin:0 0 8px;font-size:14px;color:var(--mut);font-weight:600}
.stat{font-size:24px;font-weight:800;letter-spacing:-.5px}
.stat small{font-size:12px;color:var(--mut);font-weight:500}
.hint{color:var(--mut);font-size:12.5px}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
th,td{text-align:right;padding:8px 6px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:middle}
th{color:var(--mut);font-weight:600;font-size:12px}
tr:hover td{background:rgba(255,255,255,.03)}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11.5px;border:1px solid var(--line)}
.ok{color:var(--mint);border-color:rgba(74,222,128,.35);background:rgba(74,222,128,.1)}
.bad{color:var(--red);border-color:rgba(248,113,113,.35);background:rgba(248,113,113,.1)}
.warn{color:var(--gold);border-color:rgba(255,200,87,.35);background:rgba(255,200,87,.1)}
.mut{color:var(--mut)}
input,select,textarea{background:rgba(255,255,255,.06);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:8px 10px;font:inherit;width:100%}
textarea{min-height:70px;resize:vertical}
label{display:block;margin:10px 0 4px;color:var(--mut);font-size:12.5px}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:11px;border:1px solid var(--line);background:rgba(255,255,255,.07);color:var(--ink);font:inherit;cursor:pointer}
.btn:hover{background:rgba(255,255,255,.12)}
.btn.primary{background:linear-gradient(150deg,#ffd479,#dfa72c);color:#241a00;font-weight:700}
.btn.danger{color:var(--red);border-color:rgba(248,113,113,.35)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.msg{padding:10px 14px;border-radius:12px;margin-top:12px}
.msg.ok{background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.3);color:#b8f5c9}
.msg.bad{background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.3);color:#ffc9c9}
.login{max-width:380px;margin:12vh auto}
.login .logo{width:44px;height:44px;border-radius:14px;font-size:18px}
.pager{display:flex;gap:6px;justify-content:flex-start;margin-top:12px;flex-wrap:wrap}
.pager a{padding:6px 10px;border-radius:9px;border:1px solid var(--line);color:var(--mut)}
.pager a.on{background:rgba(255,255,255,.1);color:var(--ink)}
footer.foot{color:var(--mut);font-size:12px;text-align:center;margin:22px 0 10px}
@media(max-width:640px){.wrap{padding:10px}table{font-size:12px}th,td{padding:6px 4px}}
`;

function layout(title, body, { active = '', flash = null } = {}) {
  const nav = [
    ['/', 'داشبورد'],
    ['/users', 'کاربران'],
    ['/files', 'فایل‌ها'],
    ['/reports', 'گزارش‌ها'],
    ['/settings', 'تنظیمات'],
  ]
    .map(([href, label]) => `<a href="${href}" class="${active === href ? 'on' : ''}">${label}</a>`)
    .join('');
  const flashHtml = flash ? `<div class="msg ${flash.type === 'bad' ? 'bad' : 'ok'}">${esc(flash.text)}</div>` : '';
  return `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} — پنل دانلودر</title><style>${CSS}</style></head>
<body><div class="wrap">
<header class="top">
  <div class="brand"><span class="logo">DL</span><span>پنل مدیریت ربات دانلودر</span></div>
  <nav class="links">${nav}<a href="/logout">خروج</a></nav>
</header>
${flashHtml}
${body}
<footer class="foot">dlbot · bathmanai.ir/dlbot · داده‌ها روی همین سرور</footer>
</div></body></html>`;
}

function loginPage(error) {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>ورود — پنل دانلودر</title><style>${CSS}</style></head><body>
<div class="wrap"><div class="login card">
  <div class="brand" style="margin-bottom:14px"><span class="logo">DL</span><span>پنل مدیریت ربات دانلودر</span></div>
  ${error ? `<div class="msg bad">${esc(error)}</div>` : ''}
  <form method="post" action="/login">
    <label for="p">رمز عبور</label>
    <input id="p" name="password" type="password" autocomplete="current-password" required autofocus>
    <div class="row" style="margin-top:14px"><button class="btn primary" type="submit">ورود</button></div>
  </form>
  <p class="hint" style="margin-top:12px">رمز اولیه در فایل <code>/var/lib/dlbot/panel-password.txt</code> روی سرور است؛ بعد از ورود از تنظیمات عوضش کن.</p>
</div></div></body></html>`;
}

const statusPill = (s) => {
  const map = {
    sent: ['ok', 'ارسال شد'],
    ready: ['warn', 'لینک آماده'],
    running: ['warn', 'در حال دانلود'],
    queued: ['warn', 'در صف'],
    failed: ['bad', 'خطا'],
    rejected: ['bad', 'رد شد'],
    expired: ['bad', 'منقضی'],
    interrupted: ['bad', 'قطع شد'],
  };
  const [cls, label] = map[s] || ['', esc(s)];
  return `<span class="pill ${cls}">${label}</span>`;
};

function jobRows(rows) {
  if (!rows.length) return '<tr><td colspan="7" class="mut">چیزی ثبت نشده.</td></tr>';
  return rows
    .map(
      (j) => `<tr>
  <td class="mut">#${fa(j.id)}</td>
  <td>${j.username ? `@${esc(j.username)}` : esc(j.first_name || '')}<br><span class="mut" style="font-size:11px">${j.user_id}</span></td>
  <td title="${esc(j.url || '')}">${esc((j.title || j.url || '').slice(0, 46))}</td>
  <td>${j.size ? mb(j.size) : '—'}</td>
  <td>${statusPill(j.status)}${j.delivery ? `<br><span class="mut" style="font-size:11px">${esc(j.delivery)}</span>` : ''}</td>
  <td class="mut" style="font-size:12px">${dt(j.created_at)}</td>
  <td class="mut" style="font-size:11.5px">${esc((j.error || '').slice(0, 40))}</td>
</tr>`
    )
    .join('');
}

function dashboardPage({ stats, health, jobs, live }) {
  const usedPct = health.disk.total ? Math.min(100, Math.round((health.disk.used / health.disk.total) * 100)) : 0;
  return layout(
    'داشبورد',
    `<div class="grid g4">
  <div class="card"><h3>کاربران</h3><div class="stat">${num(stats.users)}</div><div class="hint">کل کاربران ثبت‌شده</div></div>
  <div class="card"><h3>دانلودهای موفق</h3><div class="stat">${num(stats.jobs)}</div><div class="hint">امروز: ${num(stats.today)}</div></div>
  <div class="card"><h3>حجم تحویل‌شده</h3><div class="stat">${mb(stats.bytes)}</div><div class="hint">مجموع فایل‌ها</div></div>
  <div class="card"><h3>صف / در حال اجرا</h3><div class="stat">${num(live.queued)} / ${num(live.active)}</div><div class="hint">سقف هم‌زمان در تنظیمات</div></div>
</div>

<div class="grid g3">
  <div class="card">
    <h3>وضعیت ربات</h3>
    <p class="hint" style="margin:0 0 8px">${health.bot.ok ? `<span class="pill ok">متصل</span> @${esc(health.bot.username || '')}` : `<span class="pill bad">قطع</span> ${esc(health.bot.error || '')}`}</p>
    <p class="hint" style="margin:0 0 6px">Webhook: ${health.webhook.url ? '<span class="pill ok">ثبت شده</span>' : '<span class="pill bad">ثبت نشده</span>'}</p>
    <p class="hint" style="margin:0;word-break:break-all">${esc(health.webhook.url || '')}</p>
    ${health.webhook.pending ? `<p class="hint" style="margin:6px 0 0">در انتظار: ${num(health.webhook.pending)}</p>` : ''}
    ${health.webhook.error ? `<p class="hint" style="margin:6px 0 0;color:var(--red)">${esc(health.webhook.error)}</p>` : ''}
  </div>
  <div class="card">
    <h3>قفل کانال</h3>
    <p class="hint" style="margin:0 0 8px">کانال: ${health.channel.name ? esc(health.channel.name) : '— تنظیم نشده'}</p>
    <p class="hint" style="margin:0 0 8px">وضعیت: ${health.channel.lock ? `<span class="pill ${health.channel.error ? 'warn' : 'ok'}">${health.channel.error ? 'فعال با هشدار' : 'فعال'}</span>` : '<span class="pill">غیرفعال</span>'}</p>
    ${health.channel.error ? `<p class="hint" style="color:var(--gold);margin:0">${esc(health.channel.error)}<br>ربات را در کانال ادمین کنید.</p>` : '<p class="hint" style="margin:0">ربات باید در کانال ادمین باشد تا عضویت را بررسی کند.</p>'}
  </div>
  <div class="card">
    <h3>سرور</h3>
    <p class="hint" style="margin:0 0 6px">آزاد: ${mb(health.disk.free)} — موقت: ${mb(health.disk.used)}</p>
    <div class="bar"><i style="width:${usedPct}%"></i></div>
    <p class="hint" style="margin:8px 0 0">yt-dlp: ${esc(health.tools.ytdlp || '—')} · ffmpeg: ${esc(health.tools.ffmpeg || '—')}</p>
    <p class="hint" style="margin:4px 0 0">API: ${health.localApi ? 'سرور محلی (آپلود تا ۲ گیگ)' : 'تلگرام ابری (سقف ۵۰ مگ)'}</p>
  </div>
</div>

<div class="card" style="margin-top:14px">
  <h3>آخرین فایل‌ها</h3>
  <table><thead><tr><th>#</th><th>کاربر</th><th>عنوان / لینک</th><th>حجم</th><th>وضعیت</th><th>زمان</th><th>خطا</th></tr></thead>
  <tbody>${jobRows(jobs)}</tbody></table>
  <div class="row" style="margin-top:10px"><a class="btn" href="/files">همه فایل‌ها</a><a class="btn" href="/reports">گزارش‌ها</a></div>
</div>

<div class="card" style="margin-top:14px">
  <h3>ارسال پیام همگانی</h3>
  <form method="post" action="/broadcast">
    <textarea name="text" placeholder="متن پیام برای همه کاربران…" required></textarea>
    <div class="row" style="margin-top:8px"><button class="btn primary" type="submit">ارسال</button><span class="hint">به همه کاربران غیرمسدود، با فاصله ایمن.</span></div>
  </form>
</div>`,
    { active: '/' }
  );
}

function pager(base, page, total, limit, q) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return '';
  const items = [];
  const qs = q ? `&q=${encodeURIComponent(q)}` : '';
  for (let i = 1; i <= pages; i += 1) {
    if (pages > 9 && Math.abs(i - page) > 3 && i !== 1 && i !== pages) continue;
    items.push(`<a class="${i === page ? 'on' : ''}" href="${base}?page=${i}${qs}">${fa(i)}</a>`);
  }
  return `<div class="pager">${items.join('')}</div>`;
}

function usersPage({ rows, total, page, limit, q }) {
  const body = rows.length
    ? rows
        .map(
          (u) => `<tr>
  <td class="mut">${u.id}</td>
  <td>${u.username ? `@${esc(u.username)}` : esc(u.first_name || '—')}${u.blocked ? ' <span class="pill bad">مسدود</span>' : ''}</td>
  <td>${u.phone_verified ? esc(u.phone) : '<span class="mut">—</span>'}</td>
  <td>${u.lang === 'en' ? 'EN' : 'FA'}</td>
  <td>${u.sub_until && new Date(u.sub_until) > new Date() ? `<span class="pill ok">${fa(new Date(u.sub_until).toLocaleDateString('fa-IR'))}</span>${u.sub_quota_mb ? `<br><span class="mut" style="font-size:11px">${mb(u.sub_quota_mb * 1048576)}</span>` : ''}` : '<span class="mut">—</span>'}</td>
  <td>${fa(u.downloads)} <span class="mut" style="font-size:11px">/ ${mb(u.bytes)}</span></td>
  <td class="mut" style="font-size:12px">${dt(u.last_seen)}</td>
  <td style="white-space:nowrap">
    <form method="post" action="/users/action" style="display:inline">
      <input type="hidden" name="id" value="${u.id}">
      <input type="hidden" name="action" value="${u.blocked ? 'unban' : 'ban'}">
      <button class="btn ${u.blocked ? '' : 'danger'}" type="submit">${u.blocked ? 'رفع مسدودی' : 'مسدود'}</button>
    </form>
    <form method="post" action="/users/action" style="display:inline">
      <input type="hidden" name="id" value="${u.id}">
      <input type="hidden" name="action" value="grant">
      <input name="days" type="number" value="30" min="1" max="3650" style="width:64px" title="روز">
      <input name="quota" type="number" value="20000" min="0" step="1000" style="width:86px" title="سهمیه مگابایت">
      <button class="btn" type="submit">اشتراک</button>
    </form>
  </td>
</tr>`
        )
        .join('')
    : '<tr><td colspan="8" class="mut">کاربری پیدا نشد.</td></tr>';

  return layout(
    'کاربران',
    `<div class="card">
  <h3>کاربران (${num(total)})</h3>
  <form method="get" action="/users" class="row">
    <input name="q" value="${esc(q)}" placeholder="جست‌وجو: شناسه، یوزرنیم، نام یا شماره" style="flex:1;min-width:200px">
    <button class="btn" type="submit">جست‌وجو</button>
  </form>
  <div style="overflow-x:auto">
  <table><thead><tr><th>ID</th><th>کاربر</th><th>شماره</th><th>زبان</th><th>اشتراک</th><th>دانلود</th><th>آخرین فعالیت</th><th>عملیات</th></tr></thead>
  <tbody>${body}</tbody></table>
  </div>
  ${pager('/users', page, total, limit, q)}
  <p class="hint" style="margin-top:10px">سهمیه «۰» یعنی نامحدود؛ اشتراک به تاریخ فعلی اضافه می‌شود.</p>
</div>`,
    { active: '/users' }
  );
}

function filesPage({ rows, total, page, limit, q }) {
  return layout(
    'فایل‌ها',
    `<div class="card">
  <h3>تاریخچه فایل‌ها (${num(total)})</h3>
  <form method="get" action="/files" class="row">
    <input name="q" value="${esc(q)}" placeholder="جست‌وجو: شناسه، کاربر، عنوان یا لینک" style="flex:1;min-width:200px">
    <button class="btn" type="submit">جست‌وجو</button>
    <a class="btn" href="/files.csv">CSV</a>
  </form>
  <div style="overflow-x:auto">
  <table><thead><tr><th>#</th><th>کاربر</th><th>عنوان / لینک</th><th>حجم</th><th>وضعیت</th><th>زمان</th><th>خطا</th></tr></thead>
  <tbody>${jobRows(rows)}</tbody></table>
  </div>
  ${pager('/files', page, total, limit, q)}
  <p class="hint" style="margin-top:10px">فایل‌ها روی دیسک نگه‌داری نمی‌شوند؛ فقط همین رکوردهای اطلاعاتی برای گزارش باقی می‌مانند.</p>
</div>`,
    { active: '/files' }
  );
}

function field(label, name, value, attrs = '') {
  return `<label for="f_${name}">${label}</label><input id="f_${name}" name="${name}" value="${esc(value)}" ${attrs}>`;
}

function check(label, name, on) {
  return `<label style="display:flex;gap:8px;align-items:center;margin:12px 0 0;color:var(--ink)"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} style="width:auto"> ${label}</label>`;
}

function settingsPage({ st, saved, cookies }) {
  const plans = JSON.stringify(st.plans || [], null, 2);
  const ck = cookies || { exists: false, kb: 0, at: '' };
  const cookieStatus = ck.exists
    ? `✅ فایل کوکی موجود است (${ck.kb} کیلوبایت، ${ck.at})`
    : '⛔️ فایل کوکی ثبت نشده — برای اینستاگرام/توییتر لازم است.';
  return layout(
    'تنظیمات',
    `${saved ? '<div class="msg ok">ذخیره شد.</div>' : ''}
<form method="post" action="/settings">
<div class="grid g3">
  <div class="card">
    <h3>سقف‌ها و اشتراک</h3>
    ${field('سقف رایگان (مگابایت)', 'free_max_mb', st.free_max_mb, 'type="number" min="1" max="4000"')}
    ${field('سقف با شماره موبایل (مگابایت)', 'phone_max_mb', st.phone_max_mb, 'type="number" min="1" max="4000"')}
    ${field('حجم ارسال مستقیم در تلگرام (مگابایت)', 'telegram_send_max_mb', st.telegram_send_max_mb, 'type="number" min="5" max="2000"')}
    <p class="hint">بالاتر از این حجم، فایل به‌صورت لینک موقت تحویل داده می‌شود (API ابری تلگرام حداکثر ۵۰ مگ).</p>
    ${field('اعتبار لینک دانلود (دقیقه)', 'link_ttl_min', st.link_ttl_min, 'type="number" min="1" max="10080"')}
    ${check('لینک بعد از اولین دانلود باطل و فایل پاک شود', 'delete_after_first_download', st.delete_after_first_download)}
  </div>

  <div class="card">
    <h3>قفل کانال و ضد اسپم</h3>
    ${field('کانال: آیدی عددی (-100…) یا @username', 'channel', st.channel)}
    <p class="hint">ربات را در کانال ادمین کن، بعد دکمه «تست کانال» را بزن. کانال خصوصی فقط با آیدی عددی کار می‌کند.</p>
    <button class="btn" type="submit" name="action" value="test_channel">تست کانال</button>
    ${st.channel_lock_error ? `<p class="hint" style="color:#ffb4b4">خطای آخر: ${String(st.channel_lock_error).slice(0, 160)}</p>` : ''}
    ${field('آیدی ادمین برای خرید اشتراک', 'admin_username', st.admin_username)}
    ${check('عضویت در کانال اجباری باشد', 'force_join', st.force_join)}
    ${field('فاصله بین دانلودها (ثانیه)', 'cooldown_sec', st.cooldown_sec, 'type="number" min="0" max="3600"')}
    ${field('حداکثر دانلود در ساعت', 'max_per_hour', st.max_per_hour, 'type="number" min="1" max="500"')}
    ${field('حداکثر دانلود هم‌زمان هر کاربر', 'max_concurrent_user', st.max_concurrent_user, 'type="number" min="1" max="10"')}
    ${field('حداکثر دانلود هم‌زمان کل سرور', 'max_concurrent_global', st.max_concurrent_global, 'type="number" min="1" max="10"')}
    ${field('سقف روزانه هر کاربر (مگابایت، ۰ = نامحدود)', 'max_daily_mb', st.max_daily_mb, 'type="number" min="0" max="200000"')}
  </div>

  <div class="card">
    <h3>دانلود و امنیت</h3>
    ${field('فرمت yt-dlp', 'ytdlp_format', st.ytdlp_format)}
    ${field('حداکثر کیفیت (ارتفاع)', 'ytdlp_max_height', st.ytdlp_max_height, 'type="number" min="144" max="4320"')}
    ${check('فقط صدا (mp3)', 'audio_only', st.audio_only)}
    ${check('اجازه آدرس‌های داخلی/خصوصی (خطرناک)', 'allow_private_urls', st.allow_private_urls)}
    ${check('حالت تعمیرات (فقط ادمین)', 'maintenance', st.maintenance)}
    ${field('پیام خوش‌آمد اضافه (اختیاری)', 'welcome_extra', st.welcome_extra)}
    <label for="f_cookies">کوکی‌ها (Netscape cookies.txt) — اینستاگرام/توییتر/سایت‌های محدود</label>
    <textarea id="f_cookies" name="cookies" style="min-height:110px;direction:ltr;font-family:monospace" placeholder="# Netscape HTTP Cookie File&#10;.instagram.com&#9;TRUE&#9;/&#9;TRUE&#9;..."></textarea>
    ${check('فایل کوکی را پاک کن', 'clear_cookies', false)}
    <p class="hint">${cookieStatus}</p>
    <label for="f_blocklist">دامنه‌های مسدود (هر خط یکی)</label>
    <textarea id="f_blocklist" name="blocklist">${esc((st.blocklist || []).join('\n'))}</textarea>
  </div>
</div>

<div class="grid g3">
  <div class="card">
    <h3>پلن‌ها (JSON)</h3>
    <textarea name="plans" style="min-height:190px;direction:ltr;font-family:monospace">${esc(plans)}</textarea>
    <p class="hint">هر پلن: id، fa، en، price، days، quota_mb (۰ = نامحدود).</p>
  </div>
  <div class="card">
    <h3>رمز پنل</h3>
    <label for="f_newpw">رمز جدید (خالی = بدون تغییر)</label>
    <input id="f_newpw" name="new_password" type="password" autocomplete="new-password" minlength="8">
    <label for="f_newpw2">تکرار رمز جدید</label>
    <input id="f_newpw2" name="new_password2" type="password" autocomplete="new-password" minlength="8">
    <p class="hint">حداقل ۸ کاراکتر؛ با scrypt ذخیره می‌شود.</p>
  </div>
  <div class="card">
    <h3>اطلاعات سیستم</h3>
    <p class="hint" style="margin:0 0 6px">توکن ربات فقط در <code>/etc/dlbot.env</code> است و در پنل نمایش داده نمی‌شود.</p>
    <p class="hint" style="margin:0 0 6px">Webhook: <code>/dlbot/hook/&lt;secret&gt;</code></p>
    <p class="hint" style="margin:0 0 6px">ادمین‌ها از <code>ADMIN_IDS</code> خوانده می‌شوند.</p>
    <p class="hint" style="margin:0">با تغییر کانال، قفل دوباره بررسی می‌شود.</p>
  </div>
</div>

<div class="row" style="margin-top:14px"><button class="btn primary" type="submit">ذخیره تنظیمات</button><a class="btn" href="/">بازگشت</a></div>
</form>`,
    { active: '/settings' }
  );
}

function reportsPage({ series, top, events, stats }) {
  const dayRows = series.length
    ? series.map((d) => `<tr><td>${fa(d.day)}</td><td>${num(d.jobs)}</td><td>${mb(d.bytes)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="mut">داده‌ای نیست.</td></tr>';
  const topRows = top.length
    ? top
        .map(
          (u) => `<tr><td>${fa(u.id)}</td><td>${u.username ? `@${esc(u.username)}` : esc(u.first_name || '—')}</td><td>${num(u.jobs)}</td><td>${mb(u.bytes)}</td><td class="mut">${dt(u.last)}</td></tr>`
        )
        .join('')
    : '<tr><td colspan="5" class="mut">داده‌ای نیست.</td></tr>';
  const evRows = events.length
    ? events
        .map(
          (e) => `<tr><td class="mut">${fa(e.id)}</td><td>${e.user_id || '—'}</td><td><span class="pill">${esc(e.type)}</span></td><td class="mut" style="font-size:12px">${esc((e.detail || '').slice(0, 60))}</td><td class="mut" style="font-size:12px">${dt(e.created_at)}</td></tr>`
        )
        .join('')
    : '<tr><td colspan="5" class="mut">داده‌ای نیست.</td></tr>';

  return layout(
    'گزارش‌ها',
    `<div class="grid g4">
  <div class="card"><h3>کل دانلود</h3><div class="stat">${num(stats.jobs)}</div></div>
  <div class="card"><h3>کل حجم</h3><div class="stat">${mb(stats.bytes)}</div></div>
  <div class="card"><h3>کاربران</h3><div class="stat">${num(stats.users)}</div></div>
  <div class="card"><h3>امروز</h3><div class="stat">${num(stats.today)}</div></div>
</div>

<div class="grid g3" style="margin-top:14px">
  <div class="card"><h3>روزهای گذشته</h3>
    <table><thead><tr><th>روز</th><th>دانلود</th><th>حجم</th></tr></thead><tbody>${dayRows}</tbody></table>
  </div>
  <div class="card"><h3>پرمصرف‌ترین کاربران</h3>
    <table><thead><tr><th>ID</th><th>کاربر</th><th>تعداد</th><th>حجم</th><th>آخرین</th></tr></thead><tbody>${topRows}</tbody></table>
  </div>
  <div class="card"><h3>خروجی</h3>
    <p class="hint">گزارش کامل را به‌صورت CSV بگیر (برای اکسل).</p>
    <div class="row"><a class="btn" href="/files.csv">CSV فایل‌ها</a><a class="btn" href="/users.csv">CSV کاربران</a></div>
  </div>
</div>

<div class="card" style="margin-top:14px"><h3>رویدادهای اخیر</h3>
<table><thead><tr><th>#</th><th>کاربر</th><th>رویداد</th><th>جزئیات</th><th>زمان</th></tr></thead><tbody>${evRows}</tbody></table></div>`,
    { active: '/reports' }
  );
}

module.exports = {
  esc,
  fa,
  num,
  mb,
  dt,
  CSS,
  layout,
  loginPage,
  dashboardPage,
  statusPill,
  jobRows,
  pager,
  usersPage,
  filesPage,
  settingsPage,
  reportsPage,
};