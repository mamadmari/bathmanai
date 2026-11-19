'use strict';

/**
 * کلینیک مهر — منطق سمت کلاینت
 * ------------------------------
 * یک صفحه برای دو نقش: بیمار (رزرو و پیگیری) و مدیر (داشبورد و مدیریت).
 * احراز هویت با موبایل + کد آزمایشی؛ توکن در localStorage نگه‌داری می‌شود.
 */

/* ---------------------------- آیکون‌ها ---------------------------- */
const ICONS = {
  heart: '<path d="M12 20s-7-4.5-7-9.4A4.2 4.2 0 0 1 12 7.5a4.2 4.2 0 0 1 7 3.1C19 15.5 12 20 12 20Z"/>',
  skin: '<path d="M12 4c3 3.6 5.5 6.2 5.5 9a5.5 5.5 0 1 1-11 0C6.5 10.2 9 7.6 12 4Z"/><path d="M9.6 13.4a2.5 2.5 0 0 0 2.3 2.5"/>',
  bone: '<path d="M8 4.6a2 2 0 0 1 3 1.9l1.4 1.4 1.5-1.5a2 2 0 1 1 2.9 2.9l-1.5 1.5 1.4 1.4a2 2 0 1 1-2.9 2.9l-1.4-1.4-1.5 1.5a2 2 0 1 1-2.9-2.9l1.5-1.5-1.4-1.4A2 2 0 0 1 8 4.6Z"/>',
  baby: '<circle cx="12" cy="7.6" r="3.1"/><path d="M5.6 20c.5-3.4 3-5.2 6.4-5.2s5.9 1.8 6.4 5.2"/><path d="M10.4 7.5h.01M13.6 7.5h.01"/>',
  brain: '<path d="M9.6 4.6A3 3 0 0 0 7.2 9.5a3.2 3.2 0 0 0 .5 4.7A2.9 2.9 0 0 0 12 18.4V6a2.6 2.6 0 0 0-2.4-1.4Z"/><path d="M14.4 4.6A3 3 0 0 1 16.8 9.5a3.2 3.2 0 0 1-.5 4.7 2.9 2.9 0 0 1-4.3 4.2"/>',
  eye: '<path d="M2.6 12S6 6.6 12 6.6 21.4 12 21.4 12 18 17.4 12 17.4 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v3.4M16 3v3.4"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 1.8"/>',
  star: '<path d="m12 4.4 2.3 4.7 5.2.7-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2L4.5 9.8l5.2-.7L12 4.4Z"/>',
  cash: '<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 12h.01M17.5 12h.01"/>',
  chart: '<path d="M4 19V5M4 19h16"/><path d="M8 15v-3.5M12 15V8M16 15v-5.5"/>',
  users: '<circle cx="9.5" cy="8.5" r="3.2"/><path d="M3.6 19.5c.5-3.2 2.9-5 5.9-5s5.4 1.8 5.9 5"/><path d="M16.2 5.6a3 3 0 0 1 0 5.9M17.4 14.8c2 .5 3.3 2.1 3.6 4.7"/>',
  grid: '<rect x="3.6" y="3.6" width="7" height="7" rx="2"/><rect x="13.4" y="3.6" width="7" height="7" rx="2"/><rect x="3.6" y="13.4" width="7" height="7" rx="2"/><rect x="13.4" y="13.4" width="7" height="7" rx="2"/>',
  stethoscope: '<path d="M6 4v5a3.5 3.5 0 0 0 7 0V4"/><path d="M9.5 15.6v.9a4.4 4.4 0 0 0 8.8 0v-1.1"/><circle cx="18.3" cy="13.6" r="1.9"/>',
  arrow: '<path d="M9 5l7 7-7 7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5V10h-5.4"/>',
  user: '<circle cx="12" cy="8.4" r="3.6"/><path d="M4.8 20c.6-3.6 3.4-5.6 7.2-5.6s6.6 2 7.2 5.6"/>',
  phone: '<path d="M7 3.8h2.5l1.4 3.6-2 1.4a10.5 10.5 0 0 0 4.3 4.3l1.4-2 3.6 1.4V15a2.2 2.2 0 0 1-2.4 2.2A13.5 13.5 0 0 1 4.8 6.2 2.2 2.2 0 0 1 7 3.8Z"/>'
};

function icon(name, extra) {
  const body = ICONS[name] || ICONS.calendar;
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra ? ' class="' + extra + '"' : '') + '>' +
    body + '</svg>';
}

const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const SHIFT_LABELS = { am: 'صبح (۹ تا ۱۲:۳۰)', pm: 'عصر (۱۶ تا ۱۹:۳۰)' };
const STATUS_META = {
  pending: { label: 'در انتظار تأیید', cls: 'badge-pending' },
  confirmed: { label: 'تأییدشده', cls: 'badge-confirmed' },
  done: { label: 'انجام‌شده', cls: 'badge-done' },
  canceled: { label: 'لغوشده', cls: 'badge-canceled' }
};

const ROLE_LABEL = { patient: 'پنل بیمار', admin: 'پنل مدیریت کلینیک' };


/* ---------------------------- وضعیت برنامه ---------------------------- */
const state = {
  token: localStorage.getItem('clinic.token') || '',
  user: null,
  specialties: [],
  activeTab: 'book',
  selectedSpecialty: '',
  search: '',
  mine: [],
  adminDoctors: [],
  filters: { status: '', date: '', doctorId: '', q: '' },
  booking: { doctor: null, days: [], date: '', slots: null, time: '' }
};

const $ = (id) => document.getElementById(id);

/* ---------------------------- ابزارها ---------------------------- */
function esc(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

function toFa(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/* تبدیل ارقام فارسی/عربی به لاتین (برای ورودی‌های عددی) */
function normalizeDigits(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function toJalali(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

function splitISODate(dateStr) {
  return String(dateStr || '').split('-').map(Number);
}

function jalaliParts(dateStr) {
  const p = splitISODate(dateStr);
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return [0, 1, 1];
  return toJalali(p[0], p[1], p[2]);
}

function weekdayName(dateStr) {
  const p = splitISODate(dateStr);
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return '';
  const d = new Date(p[0], p[1] - 1, p[2]);
  return WEEKDAYS[(d.getDay() + 1) % 7] || '';
}

function shortDate(dateStr) {
  const j = jalaliParts(dateStr);
  return toFa(j[2]) + ' ' + JALALI_MONTHS[j[1] - 1];
}

function fullDate(dateStr) {
  const j = jalaliParts(dateStr);
  return weekdayName(dateStr) + ' ' + toFa(j[2]) + ' ' + JALALI_MONTHS[j[1] - 1] + ' ' + toFa(j[0]);
}

function fmtMoney(value) {
  const n = Number(value) || 0;
  return toFa(n.toLocaleString('en-US')) + ' تومان';
}

function initials(name) {
  const parts = String(name || '').replace('دکتر', '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'د';
  return (parts[0][0] || '') + (parts[1] ? parts[1][0] : '');
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

let toastTimer = null;
function toast(message, type) {
  const box = $('toast');
  if (!box) return;
  box.textContent = message;
  box.className = 'toast ' + (type || 'ok');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.className = 'toast hidden'; }, 3400);
}

async function api(path, options) {
  const opts = Object.assign({ method: 'GET' }, options || {});
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const res = await fetch(path, Object.assign({}, opts, { headers: headers }));
  let data = null;
  try { data = await res.json(); } catch (err) { data = null; }
  if (!res.ok) {
    const message = (data && data.error) || 'خطا در ارتباط با سرور (' + toFa(res.status) + ')';
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data || {};
}

function emptyState(text, hint) {
  return '<div class="empty-state"><span class="emoji">🩺</span><strong>' + esc(text) + '</strong>' +
    (hint ? '<span class="muted small">' + esc(hint) + '</span>' : '') + '</div>';
}


/* ---------------------------- ورود با موبایل ---------------------------- */
let pendingMobile = '';

function showLoginError(message) {
  const box = $('loginError');
  if (!message) {
    box.textContent = '';
    box.classList.add('hidden');
    return;
  }
  box.textContent = message;
  box.classList.remove('hidden');
}

function gotoStep(step) {
  document.querySelectorAll('#loginForm .step').forEach((node) => {
    node.classList.toggle('hidden', Number(node.dataset.step) !== step);
  });
  showLoginError('');
}

async function requestCode() {
  const mobile = normalizeDigits($('mobileInput').value).replace(/\D/g, '');
  if (!/^09\d{9}$/.test(mobile)) {
    showLoginError('شماره موبایل را در قالب ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید.');
    return;
  }
  const btn = $('requestCodeBtn');
  btn.disabled = true;
  btn.textContent = 'در حال ارسال…';
  try {
    const res = await api('/api/auth/request', { method: 'POST', body: JSON.stringify({ mobile: mobile }) });
    pendingMobile = res.mobile;
    $('loginMobileLabel').textContent = toFa(res.mobile);
    $('codeEcho').textContent = toFa(res.demoCode);
    $('codeInput').value = '';
    gotoStep(2);
    $('codeInput').focus();
  } catch (err) {
    showLoginError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'دریافت کد تأیید';
  }
}

async function verifyCode() {
  const code = normalizeDigits($('codeInput').value).replace(/\D/g, '');
  if (code.length < 4) {
    showLoginError('کد تأیید را کامل وارد کنید.');
    return;
  }
  const btn = $('verifyBtn');
  btn.disabled = true;
  btn.textContent = 'در حال ورود…';
  try {
    const res = await api('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ mobile: pendingMobile, code: code })
    });
    state.token = res.token;
    state.user = res.user;
    localStorage.setItem('clinic.token', res.token);
    toast((res.user.isAdmin ? 'خوش آمدید مدیر کلینیک' : 'خوش آمدید') + ' — ورود موفق');
    enterApp();
  } catch (err) {
    showLoginError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'ورود به کلینیک';
  }
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (err) { /* بی‌اهمیت */ }
  state.token = '';
  state.user = null;
  state.mine = [];
  localStorage.removeItem('clinic.token');
  $('appView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
  $('mobileInput').value = '';
  gotoStep(1);
}

/* ---------------------------- اتصال رویدادهای ورود ---------------------------- */
async function quickLogin(mobile) {
  try {
    $('mobileInput').value = mobile;
    const res = await api('/api/auth/request', { method: 'POST', body: JSON.stringify({ mobile: mobile }) });
    const verified = await api('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ mobile: res.mobile, code: res.demoCode })
    });
    state.token = verified.token;
    state.user = verified.user;
    localStorage.setItem('clinic.token', verified.token);
    toast(verified.user.isAdmin ? 'ورود آزمایشی مدیر کلینیک' : 'ورود آزمایشی بیمار');
    enterApp();
  } catch (err) {
    showLoginError(err.message);
  }
}

function bindLogin() {
  $('requestCodeBtn').addEventListener('click', requestCode);
  $('verifyBtn').addEventListener('click', verifyCode);
  $('backToMobile').addEventListener('click', () => gotoStep(1));
  $('logoutBtn').addEventListener('click', logout);

  $('mobileInput').addEventListener('input', () => {
    $('mobileInput').value = normalizeDigits($('mobileInput').value).replace(/[^\d]/g, '');
  });
  $('codeInput').addEventListener('input', () => {
    $('codeInput').value = normalizeDigits($('codeInput').value).replace(/[^\d]/g, '');
  });
  $('mobileInput').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); requestCode(); }
  });
  $('codeInput').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); verifyCode(); }
  });

  document.querySelectorAll('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', () => quickLogin(btn.dataset.quick));
  });
}

/* ---------------------------- چیدمان برنامه ---------------------------- */
const TABS_PATIENT = [
  { id: 'book', label: 'رزرو نوبت', icon: 'grid' },
  { id: 'mine', label: 'نوبت‌های من', icon: 'calendar' }
];
const TABS_ADMIN = [
  { id: 'dashboard', label: 'داشبورد', icon: 'chart' },
  { id: 'appts', label: 'نوبت‌ها', icon: 'calendar', badge: true },
  { id: 'doctors', label: 'پزشکان', icon: 'stethoscope' },
  { id: 'book', label: 'رزرو نوبت', icon: 'grid' },
  { id: 'mine', label: 'نوبت‌های من', icon: 'calendar' }
];

function renderTabs() {
  const tabs = state.user && state.user.isAdmin ? TABS_ADMIN : TABS_PATIENT;
  $('tabs').innerHTML = tabs.map((tab) =>
    '<button type="button" class="tab-btn' + (state.activeTab === tab.id ? ' active' : '') +
    '" data-tab="' + tab.id + '">' + icon(tab.icon) + '<span>' + esc(tab.label) + '</span>' +
    (tab.badge ? '<span class="tab-badge hidden" data-badge="pending"></span>' : '') + '</button>'
  ).join('');
  $('tabs').querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });
}

function setTab(id) {
  state.activeTab = id;
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== 'tab-' + id);
  });
  $('tabs').querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === id);
  });
  if (id === 'book') {
    loadSpecialties().then(renderSpecialties).catch((err) => toast(err.message, 'err'));
  } else if (id === 'mine') {
    loadMine();
  } else if (id === 'dashboard') {
    loadDashboard();
  } else if (id === 'appts') {
    loadAdminAppointments();
  } else if (id === 'doctors') {
    loadAdminDoctors();
  }
}

function enterApp() {
  const user = state.user;
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('roleLabel').textContent = ROLE_LABEL[user.role] || 'پنل کاربر';
  $('userName').textContent = user.name || (user.isAdmin ? 'مدیر کلینیک' : 'کاربر مهمان');
  $('userMobile').textContent = toFa(user.mobile);
  $('userAvatar').textContent = user.name ? initials(user.name) : 'م';
  renderTabs();
  setTab(user.isAdmin ? 'dashboard' : 'book');
  refreshPendingBadge();
}

async function refreshPendingBadge() {
  if (!state.user || !state.user.isAdmin) return;
  try {
    const data = await api('/api/appointments?status=pending');
    const count = (data.appointments || []).length;
    const badge = document.querySelector('[data-badge="pending"]');
    if (badge) {
      badge.textContent = toFa(count);
      badge.classList.toggle('hidden', count === 0);
    }
  } catch (err) { /* بی‌اهمیت */ }
}


/* ---------------------------- بیمار: تخصص‌ها ---------------------------- */
async function loadSpecialties() {
  if (state.specialties.length) return state.specialties;
  const data = await api('/api/specialties');
  state.specialties = data.specialties || [];
  return state.specialties;
}

function specCard(sp) {
  return '<button type="button" class="spec-card' + (state.selectedSpecialty === sp.id ? ' active' : '') +
    '" data-spec="' + sp.id + '" style="--sp:' + sp.color + ';--sp-soft:' + sp.soft + '">' +
    '<span class="spec-icon">' + icon(sp.icon) + '</span>' +
    '<span class="spec-name">' + esc(sp.name) + '</span>' +
    '<span class="spec-desc">' + esc(sp.desc) + '</span>' +
    '<span class="spec-foot"><span class="spec-count">' + toFa(sp.doctorCount) + ' پزشک</span>' +
    '<span class="spec-go">انتخاب پزشک' + icon('back') + '</span></span>' +
    '</button>';
}

function renderSpecialties() {
  const grid = $('specialtyGrid');
  if (!state.specialties.length) {
    grid.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    return;
  }
  grid.innerHTML = state.specialties.map(specCard).join('');
  grid.querySelectorAll('[data-spec]').forEach((btn) => {
    btn.addEventListener('click', () => openSpecialty(btn.dataset.spec));
  });
  if (!state.selectedSpecialty) $('doctorArea').classList.add('hidden');
}

async function openSpecialty(specialtyId) {
  state.selectedSpecialty = specialtyId;
  state.search = '';
  const input = $('doctorSearch');
  if (input) input.value = '';
  renderSpecialties();

  const sp = state.specialties.find((s) => s.id === specialtyId);
  const area = $('doctorArea');
  area.classList.remove('hidden');
  area.innerHTML =
    '<div class="doctor-area-head">' +
      '<button type="button" class="back-btn" id="backToSpecs">' + icon('back') + 'همه تخصص‌ها</button>' +
      '<div class="doctor-area-title">' +
        '<span class="spec-icon" style="--sp:' + sp.color + ';--sp-soft:' + sp.soft + '">' + icon(sp.icon) + '</span>' +
        '<div><strong>' + esc(sp.name) + '</strong><small>' + esc(sp.desc) + '</small></div>' +
      '</div>' +
    '</div>' +
    '<div class="doctor-grid" id="doctorGrid">' +
      '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>' +
    '</div>';
  $('backToSpecs').addEventListener('click', () => {
    state.selectedSpecialty = '';
    renderSpecialties();
    $('doctorArea').classList.add('hidden');
  });

  try {
    const data = await api('/api/doctors?specialty=' + encodeURIComponent(specialtyId));
    renderDoctorGrid(data.doctors || []);
  } catch (err) {
    $('doctorGrid').innerHTML = emptyState('دریافت فهرست پزشکان ناموفق بود', err.message);
  }
}

function doctorCard(doc) {
  const sp = doc.specialty || {};
  const dayPills = (doc.days || []).map((i) => '<span class="day-pill">' + WEEKDAYS[i] + '</span>').join('');
  return '<article class="doctor-card' + (doc.active ? '' : ' doctor-inactive') + '" data-doctor="' + doc.id +
    '" style="--sp:' + (sp.color || '#0e7490') + '">' +
    '<div class="doctor-top">' +
      '<span class="doctor-avatar">' + esc(initials(doc.name)) + '</span>' +
      '<div><div class="doctor-name">' + esc(doc.name) + '</div>' +
      '<div class="doctor-title">' + esc(doc.title) + '</div></div>' +
    '</div>' +
    '<div class="doctor-meta">' +
      '<span class="meta-pill star">' + icon('star') + toFa(Number(doc.rating).toFixed(1)) + ' (' + toFa(doc.reviews) + ')</span>' +
      '<span class="meta-pill">' + icon('users') + toFa(doc.exp) + ' سال تجربه</span>' +
      (doc.active ? '' : '<span class="inactive-tag">غیرفعال</span>') +
    '</div>' +
    '<div class="doctor-days">' + dayPills + '</div>' +
    '<div class="doctor-foot">' +
      '<span class="fee">هزینه ویزیت<strong>' + fmtMoney(doc.fee) + '</strong></span>' +
      '<button type="button" class="btn btn-primary btn-sm"' + (doc.active ? '' : ' disabled') + '>' +
        (doc.active ? 'رزرو نوبت' : 'در دسترس نیست') + '</button>' +
    '</div>' +
    '</article>';
}

function renderDoctorGrid(doctors) {
  const grid = $('doctorGrid');
  if (!grid) return;
  if (!doctors.length) {
    grid.innerHTML = emptyState('پزشکی یافت نشد', 'عبارت جست‌وجو را تغییر دهید.');
    return;
  }
  grid.innerHTML = doctors.map(doctorCard).join('');
  grid.querySelectorAll('[data-doctor]').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('doctor-inactive')) return;
      openDoctorModal(card.dataset.doctor);
    });
  });
}

async function runDoctorSearch(query) {
  state.search = String(query || '').trim();
  const area = $('doctorArea');
  if (!state.search) {
    if (state.selectedSpecialty) {
      openSpecialty(state.selectedSpecialty);
    } else {
      area.classList.add('hidden');
      area.innerHTML = '';
    }
    return;
  }
  area.classList.remove('hidden');
  area.innerHTML =
    '<div class="doctor-area-head">' +
      '<div class="doctor-area-title"><div><strong>نتایج جست‌وجو: ' + esc(state.search) + '</strong>' +
      '<small>در همه تخصص‌ها</small></div></div></div>' +
    '<div class="doctor-grid" id="doctorGrid"><div class="skeleton"></div><div class="skeleton"></div></div>';
  try {
    const data = await api('/api/doctors?q=' + encodeURIComponent(state.search));
    renderDoctorGrid(data.doctors || []);
  } catch (err) {
    $('doctorGrid').innerHTML = emptyState('جست‌وجو ناموفق بود', err.message);
  }
}


/* ---------------------------- بیمار: رزرو نوبت ---------------------------- */
function closeModal() {
  modalRoot().innerHTML = '';
  document.body.style.overflow = '';
}

async function openDoctorModal(doctorId) {
  try {
    const data = await api('/api/doctors/' + encodeURIComponent(doctorId));
    state.booking = { doctor: data.doctor, days: data.days || [], date: '', slots: null, time: '' };
    renderBookingModal();
    const firstOpen = (data.days || []).find((d) => d.open && d.freeCount > 0);
    if (firstOpen) {
      selectBookingDay(firstOpen.date);
    } else {
      $('slotHint').textContent = 'در ۱۴ روز آینده نوبت آزاد ندارد';
      $('slotGrid').innerHTML = '<div class="muted small">برای این پزشک در دو هفته آینده ساعت آزادی باقی نمانده است.</div>';
    }
  } catch (err) {
    toast(err.message, 'err');
  }
}

function dayChip(day) {
  const label = !day.open ? 'تعطیل' : (day.freeCount === 0 ? 'تکمیل' : toFa(day.freeCount) + ' آزاد');
  const disabled = !day.open || day.freeCount === 0;
  return '<button type="button" class="day-chip' + (state.booking.date === day.date ? ' active' : '') +
    '" data-day="' + day.date + '"' + (disabled ? ' disabled' : '') + '>' +
    '<strong>' + WEEKDAYS[day.weekday] + '</strong>' +
    '<small>' + shortDate(day.date) + '</small>' +
    '<span class="free">' + label + '</span>' +
    '</button>';
}

function modalHeaderHtml() {
  const doc = state.booking.doctor;
  const sp = doc.specialty || {};
  return '<div class="modal-head">' +
    '<span class="doctor-avatar">' + esc(initials(doc.name)) + '</span>' +
    '<div>' +
      '<h3>' + esc(doc.name) + '</h3>' +
      '<small>' + esc(doc.title) + (sp.name ? ' — ' + esc(sp.name) : '') + '</small>' +
      '<div class="doctor-meta" style="margin-top:6px">' +
        '<span class="meta-pill star">' + icon('star') + toFa(Number(doc.rating).toFixed(1)) + '</span>' +
        '<span class="meta-pill">' + icon('cash') + fmtMoney(doc.fee) + '</span>' +
      '</div>' +
    '</div>' +
    '<button type="button" class="modal-close" data-close aria-label="بستن">' + icon('close') + '</button>' +
    '</div>';
}


function modalBodyHtml() {
  const b = state.booking;
  const doc = b.doctor;
  return '<div class="modal-body">' +
    '<div class="doctor-bio">' + esc(doc.bio || 'توضیحی برای این پزشک ثبت نشده است.') + '</div>' +
    '<div>' +
      '<div class="modal-section-title"><span>انتخاب روز مراجعه</span><small>۱۴ روز آینده</small></div>' +
      '<div class="day-chips" id="dayChips">' + b.days.map(dayChip).join('') + '</div>' +
    '</div>' +
    '<div>' +
      '<div class="modal-section-title"><span>ساعت آزاد</span><small id="slotHint">در حال بارگذاری…</small></div>' +
      '<div class="slot-grid" id="slotGrid"><div class="muted small">لطفاً صبر کنید…</div></div>' +
      '<div class="slot-legend">' +
        '<span class="legend-item"><span class="legend-dot"></span>آزاد</span>' +
        '<span class="legend-item"><span class="legend-dot on"></span>انتخاب‌شده</span>' +
        '<span class="legend-item"><span class="legend-dot off"></span>رزروشده / گذشته</span>' +
      '</div>' +
    '</div>' +
    '<form class="booking-form" id="bookingForm" novalidate>' +
      '<div class="booking-summary" id="bookingSummary">' + icon('calendar') +
        '<span>برای ادامه، روز و ساعت را انتخاب کنید.</span></div>' +
      '<div class="row">' +
        '<label class="field"><span>نام و نام خانوادگی بیمار</span>' +
          '<input id="patientName" maxlength="60" placeholder="مثلاً مینا حسینی" value="' +
            esc((state.user && state.user.name) || '') + '"></label>' +
        '<label class="field"><span>شماره موبایل</span>' +
          '<input dir="ltr" value="' + toFa((state.user && state.user.mobile) || '') + '" disabled></label>' +
      '</div>' +
      '<label class="field"><span>توضیح (اختیاری)</span>' +
        '<textarea id="patientNote" maxlength="300" placeholder="علت مراجعه یا نکته‌ای که پزشک باید بداند"></textarea></label>' +
      '<button type="submit" class="btn btn-primary btn-block" id="confirmBooking">تأیید و ثبت نوبت</button>' +
    '</form>' +
    '</div>';
}

function renderBookingModal() {
  const sp = state.booking.doctor.specialty || {};
  const modal = '<div class="modal" style="--sp:' + (sp.color || '#0e7490') + '">' +
    modalHeaderHtml() + modalBodyHtml() + '</div>';

  modalRoot().innerHTML = '<div class="modal-backdrop">' + modal + '</div>';
  document.body.style.overflow = 'hidden';

  modalRoot().querySelector('.modal-backdrop').addEventListener('click', (ev) => {
    if (ev.target === ev.currentTarget) closeModal();
  });
  modalRoot().querySelector('[data-close]').addEventListener('click', closeModal);
  modalRoot().querySelectorAll('#dayChips .day-chip').forEach((btn) => {
    btn.addEventListener('click', () => selectBookingDay(btn.dataset.day));
  });
  $('bookingForm').addEventListener('submit', submitBooking);
}

async function selectBookingDay(date) {
  const b = state.booking;
  b.date = date;
  b.time = '';
  document.querySelectorAll('#dayChips .day-chip').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.day === date);
  });
  const grid = $('slotGrid');
  grid.innerHTML = '<div class="muted small">در حال دریافت ساعت‌ها…</div>';
  try {
    const data = await api('/api/slots?doctorId=' + encodeURIComponent(b.doctor.id) + '&date=' + date);
    b.slots = data.slots || [];
    renderSlots();
    updateBookingSummary();
  } catch (err) {
    grid.innerHTML = '<div class="muted small">' + esc(err.message) + '</div>';
  }
}


function renderSlots() {
  const b = state.booking;
  const grid = $('slotGrid');
  if (!grid) return;
  const list = b.slots || [];
  if (!list.length) {
    grid.innerHTML = '<div class="muted small">برای این روز ساعتی تعریف نشده است.</div>';
    return;
  }
  const free = list.filter((s) => !s.taken && !s.past);
  $('slotHint').textContent = fullDate(b.date) + ' — ' + toFa(free.length) + ' ساعت آزاد';
  grid.innerHTML = list.map((s) =>
    '<button type="button" class="slot-btn' + (b.time === s.time ? ' active' : '') + '" data-time="' + s.time + '"' +
    (s.taken || s.past ? ' disabled' : '') + ' dir="ltr">' + toFa(s.time) + '</button>'
  ).join('');
  grid.querySelectorAll('.slot-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      b.time = btn.dataset.time;
      renderSlots();
      updateBookingSummary();
    });
  });
}

function updateBookingSummary() {
  const b = state.booking;
  const box = $('bookingSummary');
  if (!box) return;
  if (b.date && b.time) {
    box.innerHTML = icon('calendar') + '<span><strong>' + fullDate(b.date) + ' — ساعت ' + toFa(b.time) +
      '</strong> | ' + esc(b.doctor.name) + '</span>';
  } else {
    box.innerHTML = icon('calendar') + '<span>روز و ساعت مراجعه را انتخاب کنید.</span>';
  }
}

async function submitBooking(ev) {
  ev.preventDefault();
  const b = state.booking;
  const nameInput = $('patientName');
  const noteInput = $('patientNote');
  const name = (nameInput.value || '').trim();
  const note = (noteInput.value || '').trim();
  if (!b.date || !b.time) { toast('روز و ساعت مراجعه را انتخاب کنید', 'err'); return; }
  if (name.length < 3) { toast('نام بیمار را کامل وارد کنید', 'err'); return; }

  const btn = $('confirmBooking');
  btn.disabled = true;
  btn.textContent = 'در حال ثبت…';
  try {
    await api('/api/appointments', {
      method: 'POST',
      body: JSON.stringify({ doctorId: b.doctor.id, date: b.date, time: b.time, patientName: name, note: note })
    });
    closeModal();
    toast('نوبت ' + fullDate(b.date) + ' ساعت ' + toFa(b.time) + ' ثبت شد و در انتظار تأیید است');
    setTab('mine');
    refreshPendingBadge();
  } catch (err) {
    toast(err.message, 'err');
    btn.disabled = false;
    btn.textContent = 'تأیید و ثبت نوبت';
  }
}

/* ---------------------------- بیمار: نوبت‌های من ---------------------------- */
function apptCard(appt) {
  const meta = STATUS_META[appt.status] || STATUS_META.pending;
  const sp = (appt.doctor && appt.doctor.specialty) || {};
  const canCancel = (appt.status === 'pending' || appt.status === 'confirmed');
  return '<div class="appt-item" style="--sp:' + (sp.color || '#0e7490') + '">' +
    '<div class="appt-when">' +
      '<strong dir="ltr">' + toFa(appt.time) + '</strong>' +
      '<small>' + weekdayName(appt.date) + ' ' + shortDate(appt.date) + '</small>' +
    '</div>' +
    '<div class="appt-main">' +
      '<strong>' + esc((appt.doctor && appt.doctor.name) || 'پزشک') + '</strong>' +
      '<div class="doctor-line">' + esc((appt.doctor && appt.doctor.title) || '') +
        (sp.name ? ' — ' + esc(sp.name) : '') + '</div>' +
      '<div class="doctor-line">بیمار: ' + esc(appt.patientName) + ' | ' + fullDate(appt.date) + '</div>' +
      (appt.note ? '<div class="note-line">یادداشت: ' + esc(appt.note) + '</div>' : '') +
      '<div class="appt-code">#' + esc(appt.id) + '</div>' +
    '</div>' +
    '<div class="appt-actions">' +
      '<span class="badge ' + meta.cls + '">' + meta.label + '</span>' +
      (canCancel
        ? '<button type="button" class="action-btn cancel" data-cancel="' + appt.id + '">لغو نوبت</button>'
        : '') +
    '</div>' +
    '</div>';
}

async function loadMine() {
  const list = $('mineList');
  const stats = $('mineStats');
  list.innerHTML = '<div class="skeleton" style="min-height:88px"></div><div class="skeleton" style="min-height:88px"></div>';
  try {
    const data = await api('/api/appointments');
    state.mine = data.appointments || [];
    /* مدیر در این تب فقط نوبت‌های خودش را می‌بیند؛ همه‌ی نوبت‌ها در تب «نوبت‌ها» است */
    if (state.user && state.user.isAdmin) {
      state.mine = state.mine.filter((a) => a.mobile === state.user.mobile);
    }
    const upcoming = state.mine.filter((a) => a.status === 'pending' || a.status === 'confirmed');
    const done = state.mine.filter((a) => a.status === 'done');
    const canceled = state.mine.filter((a) => a.status === 'canceled');

    stats.innerHTML =
      '<div class="stat-box"><span>نوبت‌های فعال</span><strong>' + toFa(upcoming.length) + '</strong></div>' +
      '<div class="stat-box"><span>انجام‌شده</span><strong>' + toFa(done.length) + '</strong></div>' +
      '<div class="stat-box"><span>لغوشده</span><strong>' + toFa(canceled.length) + '</strong></div>' +
      '<div class="stat-box"><span>کل نوبت‌ها</span><strong>' + toFa(state.mine.length) + '</strong></div>';

    if (!state.mine.length) {
      list.innerHTML = emptyState('هنوز نوبتی ثبت نکرده‌اید', 'از تب «رزرو نوبت» یک پزشک و ساعت انتخاب کنید.');
      return;
    }
    /* نوبت‌های امروز و آینده اول (صعودی)، سپس گذشته‌ها (نزولی) */
    const today = todayStr();
    const upcomingList = state.mine
      .filter((a) => a.date >= today)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const pastList = state.mine
      .filter((a) => a.date < today)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const sorted = upcomingList.concat(pastList);
    list.innerHTML = sorted.map(apptCard).join('');
    list.querySelectorAll('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => cancelAppointment(btn.dataset.cancel));
    });
  } catch (err) {
    list.innerHTML = emptyState('دریافت نوبت‌ها ناموفق بود', err.message);
  }
}

async function cancelAppointment(id) {
  const appt = state.mine.find((a) => a.id === id);
  const when = appt ? fullDate(appt.date) + ' ساعت ' + toFa(appt.time) : 'این نوبت';
  if (!window.confirm('آیا از لغو نوبت ' + when + ' مطمئن هستید؟')) return;
  try {
    await api('/api/appointments/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({ status: 'canceled' })
    });
    toast('نوبت لغو شد');
    loadMine();
    refreshPendingBadge();
  } catch (err) {
    toast(err.message, 'err');
  }
}


/* ---------------------------- مدیر: داشبورد ---------------------------- */
function kpiHtml(item) {
  return '<div class="kpi" style="--kpi-soft:' + item.soft + '">' +
    '<span>' + esc(item.label) + '</span>' +
    '<strong>' + toFa(item.value) + '</strong>' +
    '<small>' + esc(item.hint) + '</small>' +
    '</div>';
}

async function loadDashboard() {
  const kpi = $('kpiGrid');
  kpi.innerHTML = '<div class="skeleton" style="min-height:92px"></div><div class="skeleton" style="min-height:92px"></div>' +
    '<div class="skeleton" style="min-height:92px"></div><div class="skeleton" style="min-height:92px"></div>';
  try {
    const s = await api('/api/admin/stats');
    const t = s.totals;
    kpi.innerHTML = [
      { label: 'نوبت‌های امروز', value: t.today, hint: 'بدون احتساب لغوشده‌ها', soft: '#e0f2fe' },
      { label: 'در انتظار تأیید', value: t.pending, hint: 'نیازمند بررسی مدیر', soft: '#fef3c7' },
      { label: 'تأییدشده', value: t.confirmed, hint: 'در انتظار مراجعه بیمار', soft: '#dbeafe' },
      { label: 'انجام‌شده', value: t.done, hint: 'ویزیت‌های تکمیل‌شده', soft: '#dcfce7' },
      { label: 'لغوشده', value: t.canceled, hint: 'توسط بیمار یا کلینیک', soft: '#fee2e2' },
      { label: 'پزشکان فعال', value: t.activeDoctors + ' / ' + t.doctors, hint: 'از مجموع پزشکان کلینیک', soft: '#ede9fe' },
      { label: 'بیماران یکتا', value: t.patients, hint: 'بر اساس شماره موبایل', soft: '#cffafe' },
      { label: 'کل نوبت‌ها', value: t.appointments, hint: 'از ابتدای راه‌اندازی', soft: '#f1f5f9' }
    ].map(kpiHtml).join('');

    /* نمودار ۷ روز آینده */
    const week = s.upcoming || [];
    const maxCount = Math.max.apply(null, week.map((d) => d.count).concat([1]));
    $('weekRange').textContent = week.length ? shortDate(week[0].date) + ' تا ' + shortDate(week[week.length - 1].date) : '';
    $('weekChart').innerHTML = week.map((d) => {
      const height = d.count === 0 ? 6 : Math.max(10, Math.round((d.count / maxCount) * 100));
      return '<div class="week-col' + (d.date === s.today ? ' today' : '') + '">' +
        '<div class="week-bar-wrap"><div class="week-bar" style="height:' + height + '%"></div></div>' +
        '<b>' + toFa(d.count) + '</b>' +
        '<span>' + weekdayName(d.date) + '</span>' +
        '<span>' + shortDate(d.date) + '</span>' +
        '</div>';
    }).join('');

    /* توزیع تخصص‌ها */
    const specs = s.specialties || [];
    const maxSpec = Math.max.apply(null, specs.map((x) => x.appointments).concat([1]));
    $('specialtyBars').innerHTML = specs.map((sp) =>
      '<div class="bar-row" style="--sp:' + sp.color + '">' +
        '<div class="bar-row-top"><span class="swatch"></span><span>' + esc(sp.name) + '</span>' +
          '<strong>' + toFa(sp.appointments) + ' نوبت · ' + toFa(sp.doctors) + ' پزشک</strong></div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' +
          Math.round((sp.appointments / maxSpec) * 100) + '%"></div></div>' +
      '</div>'
    ).join('') || '<div class="muted small">داده‌ای موجود نیست.</div>';

    /* پزشکان پرمراجعه */
    const top = s.topDoctors || [];
    $('topDoctors').innerHTML = top.length
      ? top.map((d, i) => {
        const sp = specs.find((x) => x.id === d.specialtyId);
        return '<div class="top-row">' +
          '<span class="rank">' + toFa(i + 1) + '</span>' +
          '<div><strong>' + esc(d.name) + '</strong><small>' + esc(sp ? sp.name : '') + '</small></div>' +
          '<span class="count">' + toFa(d.count) + ' نوبت</span>' +
          '</div>';
      }).join('')
      : '<div class="muted small">هنوز نوبتی ثبت نشده است.</div>';

    await refreshPendingBadge();
  } catch (err) {
    kpi.innerHTML = emptyState('دریافت آمار ناموفق بود', err.message);
  }
}


/* ---------------------------- مدیر: نوبت‌ها ---------------------------- */
function adminApptRow(appt) {
  const meta = STATUS_META[appt.status] || STATUS_META.pending;
  const sp = (appt.doctor && appt.doctor.specialty) || {};
  const actions = [];
  if (appt.status === 'pending') {
    actions.push('<button type="button" class="action-btn approve" data-set="confirmed" data-id="' + appt.id + '">تأیید</button>');
    actions.push('<button type="button" class="action-btn cancel" data-set="canceled" data-id="' + appt.id + '">لغو</button>');
  } else if (appt.status === 'confirmed') {
    actions.push('<button type="button" class="action-btn finish" data-set="done" data-id="' + appt.id + '">انجام شد</button>');
    actions.push('<button type="button" class="action-btn cancel" data-set="canceled" data-id="' + appt.id + '">لغو</button>');
  }
  return '<div class="admin-appt">' +
    '<div class="who"><strong>' + esc(appt.patientName) + '</strong>' +
      '<small>' + toFa(appt.mobile) + '</small></div>' +
    '<div class="what">' + esc((appt.doctor && appt.doctor.name) || '—') +
      '<span class="spec">' + esc(sp.name || '') + '</span></div>' +
    '<div class="when-box"><span class="badge ' + meta.cls + '">' + meta.label + '</span>' +
      '<small>' + fullDate(appt.date) + ' — ' + toFa(appt.time) + '</small></div>' +
    '<div class="row-actions">' + (actions.join('') || '<span class="muted small">بدون اقدام</span>') + '</div>' +
    '</div>';
}

async function loadAdminAppointments() {
  const box = $('adminApptList');
  box.innerHTML = '<div class="skeleton" style="min-height:64px"></div><div class="skeleton" style="min-height:64px"></div>';
  try {
    /* فهرست پزشکان برای فیلتر */
    if (!state.adminDoctors.length) {
      const docs = await api('/api/doctors');
      state.adminDoctors = docs.doctors || [];
      $('filterDoctor').innerHTML = '<option value="">همه پزشکان</option>' +
        state.adminDoctors.map((d) => '<option value="' + d.id + '">' + esc(d.name) + '</option>').join('');
    }

    const params = new URLSearchParams();
    if (state.filters.status) params.set('status', state.filters.status);
    if (state.filters.date) params.set('date', state.filters.date);
    if (state.filters.doctorId) params.set('doctorId', state.filters.doctorId);
    if (state.filters.q) params.set('q', state.filters.q);
    const query = params.toString();

    const data = await api('/api/appointments' + (query ? '?' + query : ''));
    const list = data.appointments || [];
    if (!list.length) {
      box.innerHTML = emptyState('نوبتی با این فیلتر پیدا نشد', 'فیلترها را تغییر دهید یا پاک‌کنید.');
      return;
    }
    box.innerHTML = list.map(adminApptRow).join('');
    box.querySelectorAll('[data-set]').forEach((btn) => {
      btn.addEventListener('click', () => setAppointmentStatus(btn.dataset.id, btn.dataset.set));
    });
  } catch (err) {
    box.innerHTML = emptyState('دریافت نوبت‌ها ناموفق بود', err.message);
  }
}

async function setAppointmentStatus(id, status) {
  const labels = { confirmed: 'تأیید', done: 'انجام‌شده', canceled: 'لغو' };
  if (status === 'canceled' && !window.confirm('این نوبت لغو شود؟')) return;
  try {
    await api('/api/appointments/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({ status: status })
    });
    toast('وضعیت نوبت به «' + (labels[status] || status) + '» تغییر کرد');
    loadAdminAppointments();
    refreshPendingBadge();
  } catch (err) {
    toast(err.message, 'err');
  }
}


/* ---------------------------- مدیر: پزشکان ---------------------------- */
function adminDoctorRow(doc) {
  const sp = doc.specialty || {};
  const days = (doc.days || []).map((d) => WEEKDAYS[d]).join('، ');
  const shifts = (doc.shifts || []).map((s) => (s === 'am' ? 'صبح' : 'عصر')).join(' + ');
  return '<div class="admin-doc-row" style="--sp:' + (sp.color || '#0e7490') + '">' +
    '<div class="doc-who">' +
      '<span class="doctor-avatar">' + esc(initials(doc.name)) + '</span>' +
      '<div><strong>' + esc(doc.name) + '</strong><small>' + esc(doc.title) + '</small></div>' +
    '</div>' +
    '<div class="schedule-line">' +
      (sp.name ? esc(sp.name) + '<br>' : '') + esc(days) + '<br>' + esc(shifts) +
    '</div>' +
    '<div class="fee-edit">' +
      '<input type="number" min="0" step="10000" dir="ltr" value="' + Number(doc.fee) + '" data-fee="' + doc.id + '">' +
      '<button type="button" class="action-btn" data-savefee="' + doc.id + '">ذخیره</button>' +
    '</div>' +
    '<label class="toggle"><input type="checkbox" data-active="' + doc.id + '"' +
      (doc.active ? ' checked' : '') + '>فعال</label>' +
    '</div>';
}

async function loadAdminDoctors() {
  const box = $('adminDoctorList');
  box.innerHTML = '<div class="skeleton" style="min-height:68px"></div><div class="skeleton" style="min-height:68px"></div>';
  try {
    await loadSpecialties();
    const data = await api('/api/doctors');
    state.adminDoctors = data.doctors || [];
    const filterDoctor = $('filterDoctor');
    if (filterDoctor) {
      filterDoctor.innerHTML = '<option value="">همه پزشکان</option>' +
        state.adminDoctors.map((d) => '<option value="' + d.id + '">' + esc(d.name) + '</option>').join('');
      filterDoctor.value = state.filters.doctorId || '';
    }
    if (!state.adminDoctors.length) {
      box.innerHTML = emptyState('پزشکی ثبت نشده است');
      return;
    }
    /* گروه‌بندی بر اساس تخصص برای دید بهتر مدیر */
    box.innerHTML = state.specialties.map((sp) => {
      const docs = state.adminDoctors.filter((d) => d.specialtyId === sp.id);
      if (!docs.length) return '';
      return '<div class="card">' +
        '<div class="card-head">' +
          '<h3 style="display:flex;align-items:center;gap:8px">' +
            '<span class="spec-icon" style="--sp:' + sp.color + ';--sp-soft:' + sp.soft + ';width:30px;height:30px;border-radius:9px">' +
              icon(sp.icon) + '</span>' + esc(sp.name) + '</h3>' +
          '<span class="muted small">' + toFa(docs.filter((d) => d.active).length) + ' فعال از ' + toFa(docs.length) + '</span>' +
        '</div>' +
        '<div class="admin-doctor-list">' + docs.map(adminDoctorRow).join('') + '</div>' +
        '</div>';
    }).join('');

    box.querySelectorAll('[data-active]').forEach((input) => {
      input.addEventListener('change', () => toggleDoctor(input.dataset.active, input.checked));
    });
    box.querySelectorAll('[data-savefee]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = box.querySelector('[data-fee="' + btn.dataset.savefee + '"]');
        saveDoctorFee(btn.dataset.savefee, input.value);
      });
    });
  } catch (err) {
    box.innerHTML = emptyState('دریافت پزشکان ناموفق بود', err.message);
  }
}

async function toggleDoctor(id, active) {
  try {
    await api('/api/admin/doctors/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({ active: !!active })
    });
    toast(active ? 'پزشک فعال شد' : 'پزشک غیرفعال شد');
    loadAdminDoctors();
  } catch (err) {
    toast(err.message, 'err');
    loadAdminDoctors();
  }
}

async function saveDoctorFee(id, fee) {
  const value = Number(fee);
  if (!Number.isFinite(value) || value < 0) { toast('تعرفه معتبر نیست', 'err'); return; }
  try {
    await api('/api/admin/doctors/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({ fee: value })
    });
    toast('تعرفه ویزیت به ' + fmtMoney(value) + ' تغییر کرد');
    loadAdminDoctors();
  } catch (err) {
    toast(err.message, 'err');
  }
}


async function openAddDoctorModal() {
  await loadSpecialties();
  const options = state.specialties.map((s) => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');
  const dayChecks = WEEKDAYS.map((name, i) =>
    '<label class="check-pill"><input type="checkbox" value="' + i + '"' + (i < 5 ? ' checked' : '') + '>' + name + '</label>'
  ).join('');
  const modal = '<div class="modal" style="max-width:640px">' +
    '<div class="modal-head"><div><h3>افزودن پزشک جدید</h3>' +
      '<small>پزشک بلافاصله در فهرست بیماران نمایش داده می‌شود.</small></div>' +
      '<button type="button" class="modal-close" data-close aria-label="بستن">' + icon('close') + '</button></div>' +
    '<form class="modal-body" id="addDoctorForm" novalidate>' +
      '<div class="form-grid">' +
        '<label class="field"><span>نام پزشک</span><input id="newDocName" maxlength="80" placeholder="دکتر ..." required></label>' +
        '<label class="field"><span>تخصص</span><select id="newDocSpecialty">' + options + '</select></label>' +
        '<label class="field full"><span>عنوان تخصصی</span><input id="newDocTitle" maxlength="80" placeholder="متخصص ..."></label>' +
        '<label class="field"><span>تعرفه ویزیت (تومان)</span><input id="newDocFee" type="number" min="0" step="10000" value="350000" dir="ltr"></label>' +
        '<label class="field"><span>سابقه (سال)</span><input id="newDocExp" type="number" min="0" max="60" value="5" dir="ltr"></label>' +
        '<div class="field full"><span>روزهای حضور</span><div class="check-row" id="newDocDays">' + dayChecks + '</div></div>' +
        '<div class="field full"><span>شیفت کاری</span>' +
          '<div class="check-row" id="newDocShifts">' +
            '<label class="check-pill"><input type="checkbox" value="am" checked>صبح (۹ تا ۱۲:۳۰)</label>' +
            '<label class="check-pill"><input type="checkbox" value="pm">عصر (۱۶ تا ۱۹:۳۰)</label>' +
          '</div>' +
        '</div>' +
        '<label class="field full"><span>معرفی کوتاه</span><textarea id="newDocBio" maxlength="300" placeholder="سابقه و حوزه تمرکز"></textarea></label>' +
      '</div>' +
      '<button type="submit" class="btn btn-primary btn-block" id="saveNewDoctor">ثبت پزشک</button>' +
    '</form>' +
    '</div>';

  modalRoot().innerHTML = '<div class="modal-backdrop">' + modal + '</div>';
  document.body.style.overflow = 'hidden';
  modalRoot().querySelector('.modal-backdrop').addEventListener('click', (ev) => {
    if (ev.target === ev.currentTarget) closeModal();
  });
  modalRoot().querySelector('[data-close]').addEventListener('click', closeModal);
  $('addDoctorForm').addEventListener('submit', submitNewDoctor);
}


async function submitNewDoctor(ev) {
  ev.preventDefault();
  const name = ($('newDocName').value || '').trim();
  if (name.length < 3) { toast('نام پزشک را کامل وارد کنید', 'err'); return; }
  const days = Array.from(document.querySelectorAll('#newDocDays input:checked')).map((i) => Number(i.value));
  const shifts = Array.from(document.querySelectorAll('#newDocShifts input:checked')).map((i) => i.value);
  if (!days.length) { toast('حداقل یک روز حضور انتخاب کنید', 'err'); return; }
  if (!shifts.length) { toast('حداقل یک شیفت کاری انتخاب کنید', 'err'); return; }

  const btn = $('saveNewDoctor');
  btn.disabled = true;
  btn.textContent = 'در حال ثبت…';
  try {
    await api('/api/admin/doctors', {
      method: 'POST',
      body: JSON.stringify({
        name: name,
        specialtyId: $('newDocSpecialty').value,
        title: ($('newDocTitle').value || '').trim(),
        fee: Number($('newDocFee').value) || 0,
        exp: Number($('newDocExp').value) || 0,
        days: days,
        shifts: shifts,
        bio: ($('newDocBio').value || '').trim()
      })
    });
    closeModal();
    toast('پزشک جدید ثبت شد');
    loadAdminDoctors();
  } catch (err) {
    toast(err.message, 'err');
    btn.disabled = false;
    btn.textContent = 'ثبت پزشک';
  }
}

/* ---------------------------- راه‌اندازی ---------------------------- */
function debounce(fn, wait) {
  let timer = null;
  return function () {
    const args = arguments;
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(null, args), wait);
  };
}

function bindEvents() {
  bindLogin();

  const search = $('doctorSearch');
  if (search) search.addEventListener('input', debounce(() => runDoctorSearch(search.value), 280));

  $('refreshMine').addEventListener('click', loadMine);
  $('refreshDashboard').addEventListener('click', loadDashboard);
  $('addDoctorBtn').addEventListener('click', openAddDoctorModal);

  const filterStatus = $('filterStatus');
  const filterDate = $('filterDate');
  const filterDoctor = $('filterDoctor');
  const filterQuery = $('filterQuery');

  const applyFilters = () => {
    state.filters = {
      status: filterStatus.value,
      date: filterDate.value,
      doctorId: filterDoctor.value,
      q: filterQuery.value.trim()
    };
    loadAdminAppointments();
  };
  [filterStatus, filterDate, filterDoctor].forEach((node) => node.addEventListener('change', applyFilters));
  filterQuery.addEventListener('input', debounce(applyFilters, 320));

  $('clearFilters').addEventListener('click', () => {
    filterStatus.value = '';
    filterDate.value = '';
    filterDoctor.value = '';
    filterQuery.value = '';
    state.filters = { status: '', date: '', doctorId: '', q: '' };
    loadAdminAppointments();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && modalRoot().innerHTML) closeModal();
  });
}

async function boot() {
  bindEvents();
  try {
    const health = await api('/api/health');
    $('demoCodeLabel').textContent = toFa(health.demoCode);
    $('codeEcho').textContent = toFa(health.demoCode);
  } catch (err) {
    showLoginError('ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.');
  }

  if (state.token) {
    try {
      const me = await api('/api/me');
      state.user = me.user;
      enterApp();
      return;
    } catch (err) {
      state.token = '';
      localStorage.removeItem('clinic.token');
    }
  }

  $('appView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
  gotoStep(1);
}

document.addEventListener('DOMContentLoaded', boot);
