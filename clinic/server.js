'use strict';

/**
 * کلینیک مهر — سیستم نوبت‌دهی پزشکی
 * ------------------------------------
 * سرور بدون هیچ وابستگی npm (فقط ماژول‌های داخلی Node.js):
 *   - سرو فایل‌های استاتیک پوشه public
 *   - API ورود با موبایل (کد آزمایشی)، نوبت‌دهی و پنل مدیریت
 *   - ذخیره‌سازی وضعیت در data/db.json (نوشتن اتمیک)
 *
 * اجرا: node server.js
 * پورت: PORT=8788
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 8788;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const APP_VERSION = '1.0.0';
const STARTED_AT = Date.now();

/* کد ورود آزمایشی — در نسخه واقعی جای خود را به پیامک می‌دهد */
const DEMO_CODE = process.env.DEMO_CODE || '11111';
const SESSION_TTL = 7 * 24 * 3600e3;

/* شماره‌هایی که با ورود به آن‌ها نقش مدیر فعال می‌شود */
const SEED_ADMINS = ['09120000000'];

/* ------------------------------------------------------------------ *
 *  تخصص‌ها — هر تخصص رنگ و آیکون اختصاصی دارد (المان جداکننده)
 * ------------------------------------------------------------------ */
const SPECIALTIES = [
  { id: 'cardio', name: 'قلب و عروق', short: 'قلب', icon: 'heart', color: '#ef4444', soft: '#fee2e2', desc: 'تشخیص و درمان بیماری‌های قلبی، فشار خون و آریتمی' },
  { id: 'derma', name: 'پوست، مو و زیبایی', short: 'پوست', icon: 'skin', color: '#f59e0b', soft: '#fef3c7', desc: 'درمان آکنه، ریزش مو، لیزر و خدمات زیبایی پوست' },
  { id: 'ortho', name: 'ارتوپدی', short: 'ارتوپدی', icon: 'bone', color: '#3b82f6', soft: '#dbeafe', desc: 'بیماری‌های استخوان، مفاصل، زانو و ستون فقرات' },
  { id: 'peds', name: 'اطفال', short: 'اطفال', icon: 'baby', color: '#10b981', soft: '#d1fae5', desc: 'مراقبت و درمان کودکان از نوزادی تا نوجوانی' },
  { id: 'neuro', name: 'مغز و اعصاب', short: 'اعصاب', icon: 'brain', color: '#8b5cf6', soft: '#ede9fe', desc: 'سردرد، میگرن، صرع و اختلالات عصبی' },
  { id: 'eye', name: 'چشم‌پزشکی', short: 'چشم', icon: 'eye', color: '#06b6d4', soft: '#cffafe', desc: 'معاینه بینایی، شبکیه، آب مروارید و لیزیک' }
];


/* ------------------------------------------------------------------ *
 *  پزشکان نمونه (۳ پزشک برای هر تخصص)
 *  days: 0=شنبه … 6=جمعه | shifts: am (۹ تا ۱۲:۳۰) و pm (۱۶ تا ۱۹:۳۰)
 * ------------------------------------------------------------------ */
const SEED_DOCTORS = [
  { id: 'd101', name: 'دکتر سارا محمدی', specialtyId: 'cardio', title: 'متخصص قلب و عروق', rating: 4.9, reviews: 128, fee: 450000, exp: 12, days: [0, 1, 3, 4], shifts: ['am', 'pm'], active: true, bio: 'عضو انجمن قلب ایران، دارای بورد تخصصی اکوکاردیوگرافی و تست ورزش.' },
  { id: 'd102', name: 'دکتر امیر رضایی', specialtyId: 'cardio', title: 'فلوشیپ اینترونشنال کاردیولوژی', rating: 4.8, reviews: 86, fee: 520000, exp: 15, days: [1, 2, 3], shifts: ['pm'], active: true, bio: 'متخصص آنژیوگرافی و استنت‌گذاری عروق کرونر، بیش از ۴۰۰۰ عمل موفق.' },
  { id: 'd103', name: 'دکتر نگار کاظمی', specialtyId: 'cardio', title: 'متخصص قلب و اکوکاردیوگرافی', rating: 4.7, reviews: 64, fee: 380000, exp: 8, days: [0, 2, 4, 5], shifts: ['am'], active: true, bio: 'تمرکز بر بیماری‌های مادرزادی قلب و پیگیری فشار خون.' },

  { id: 'd201', name: 'دکتر مریم احمدی', specialtyId: 'derma', title: 'متخصص پوست، مو و زیبایی', rating: 4.9, reviews: 154, fee: 400000, exp: 11, days: [0, 1, 2, 4], shifts: ['am', 'pm'], active: true, bio: 'درمان آکنه و جای جوش، لیزر موهای زائد و بوتاکس با تکنیک روز.' },
  { id: 'd202', name: 'دکتر بهنام شریفی', specialtyId: 'derma', title: 'متخصص پوست و لیزر', rating: 4.6, reviews: 58, fee: 350000, exp: 7, days: [1, 3, 5], shifts: ['pm'], active: true, bio: 'فلوشیپ لیزر پوست، درمان لک و ملاسما با پروتکل‌های ترکیبی.' },
  { id: 'd203', name: 'دکتر الهام نوری', specialtyId: 'derma', title: 'متخصص پوست و مو', rating: 4.8, reviews: 92, fee: 320000, exp: 9, days: [0, 2, 3, 4], shifts: ['am'], active: true, bio: 'درمان ریزش مو، PRP و مشاوره پوست نوجوانان.' },

  { id: 'd301', name: 'دکتر رضا کریمی', specialtyId: 'ortho', title: 'متخصص ارتوپدی و جراحی زانو', rating: 4.8, reviews: 112, fee: 500000, exp: 14, days: [0, 1, 3], shifts: ['am', 'pm'], active: true, bio: 'جراحی آرتروسکوپی زانو، تعویض مفصل و آسیب‌های ورزشی.' },
  { id: 'd302', name: 'دکتر حسین توکلی', specialtyId: 'ortho', title: 'متخصص ارتوپدی و ستون فقرات', rating: 4.7, reviews: 73, fee: 460000, exp: 12, days: [2, 4, 5], shifts: ['am'], active: true, bio: 'درمان دیسک کمر، تنگی کانال و جراحی‌های کم‌تهاجمی.' },
  { id: 'd303', name: 'دکتر سمانه فرهادی', specialtyId: 'ortho', title: 'متخصص ارتوپدی کودکان', rating: 4.6, reviews: 41, fee: 420000, exp: 6, days: [1, 3, 4], shifts: ['pm'], active: true, bio: 'زدگی، انحراف پا و مشکلات استخوانی کودکان.' },

  { id: 'd401', name: 'دکتر زهرا موسوی', specialtyId: 'peds', title: 'متخصص اطفال و نوزادان', rating: 4.9, reviews: 176, fee: 300000, exp: 13, days: [0, 1, 2, 3, 4], shifts: ['am', 'pm'], active: true, bio: 'پیگیری رشد و واکسیناسیون، درمان عفونت‌های شایع کودکان.' },
  { id: 'd402', name: 'دکتر علی صداقت', specialtyId: 'peds', title: 'متخصص اطفال و آلرژی', rating: 4.7, reviews: 88, fee: 280000, exp: 10, days: [1, 3, 5], shifts: ['am'], active: true, bio: 'آسم، آلرژی غذایی و تست‌های حساسیت در کودکان.' },
  { id: 'd403', name: 'دکتر پریسا زمانی', specialtyId: 'peds', title: 'متخصص اطفال و تغذیه', rating: 4.8, reviews: 65, fee: 260000, exp: 8, days: [0, 2, 4], shifts: ['pm'], active: true, bio: 'تغذیه کودک، کم‌اشتهایی و مشکلات گوارشی.' },

  { id: 'd501', name: 'دکتر فرهاد اکبری', specialtyId: 'neuro', title: 'متخصص مغز و اعصاب', rating: 4.9, reviews: 98, fee: 550000, exp: 16, days: [0, 1, 2], shifts: ['am', 'pm'], active: true, bio: 'صرع، MS و اختلالات حافظه؛ عضو هیئت علمی دانشگاه.' },
  { id: 'd502', name: 'دکتر شیدا رحیمی', specialtyId: 'neuro', title: 'متخصص سردرد و میگرن', rating: 4.8, reviews: 77, fee: 480000, exp: 9, days: [2, 3, 4], shifts: ['am'], active: true, bio: 'کلینیک تخصصی سردرد، درمان پیشگیرانه میگرن و بوتاکس درمانی.' },
  { id: 'd503', name: 'دکتر کاوه نعمتی', specialtyId: 'neuro', title: 'متخصص صرع و نوار مغز', rating: 4.6, reviews: 45, fee: 450000, exp: 11, days: [1, 4, 5], shifts: ['pm'], active: true, bio: 'تفسیر EEG، تنظیم داروی ضدصرع و اختلالات خواب.' },

  { id: 'd601', name: 'دکتر لیلا صابری', specialtyId: 'eye', title: 'متخصص چشم و شبکیه', rating: 4.9, reviews: 121, fee: 420000, exp: 12, days: [0, 1, 3, 4], shifts: ['am'], active: true, bio: 'درمان آب مروارید، دیابت چشمی و تزریق داخل چشم.' },
  { id: 'd602', name: 'دکتر محمد بهرامی', specialtyId: 'eye', title: 'متخصص چشم و لیزیک', rating: 4.7, reviews: 69, fee: 480000, exp: 10, days: [1, 2, 4], shifts: ['pm'], active: true, bio: 'جراحی لیزیک، PKR و اصلاح عیوب انکساری.' },
  { id: 'd603', name: 'دکتر آیدا سلطانی', specialtyId: 'eye', title: 'متخصص چشم کودکان', rating: 4.8, reviews: 52, fee: 360000, exp: 7, days: [0, 2, 3], shifts: ['am', 'pm'], active: true, bio: 'تنبلی چشم، انحراف و معاینه بینایی کودکان.' }
];

/* ساعت‌های هر شیفت */
const SHIFTS = {
  am: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30'],
  pm: ['16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30']
};

const STATUSES = ['pending', 'confirmed', 'done', 'canceled'];


/* ------------------------------------------------------------------ *
 *  ابزارهای تاریخ و اعتبارسنجی
 * ------------------------------------------------------------------ */
function log() {
  console.log.apply(console, ['[' + new Date().toISOString() + ']'].concat(Array.from(arguments)));
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function isoDate(date) {
  const d = new Date(date);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function todayISO() { return isoDate(new Date()); }

function parseISO(dateStr) {
  const parts = String(dateStr || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function addDaysISO(dateStr, days) {
  const d = parseISO(dateStr) || new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function isValidDate(dateStr) {
  const d = parseISO(dateStr);
  return !!d && isoDate(d) === dateStr;
}

/* 0 = شنبه … 6 = جمعه */
function weekdayIndex(dateStr) {
  const d = parseISO(dateStr);
  if (!d) return -1;
  return (d.getDay() + 1) % 7;
}

function isPastSlot(dateStr, time) {
  const d = parseISO(dateStr);
  if (!d) return true;
  const hm = String(time || '').split(':').map(Number);
  d.setHours(hm[0] || 0, hm[1] || 0, 0, 0);
  return d.getTime() < Date.now();
}

function doctorSlots(doc) {
  const out = [];
  (doc.shifts || []).forEach((s) => { (SHIFTS[s] || []).forEach((t) => out.push(t)); });
  return out;
}

function normalizeMobile(raw) {
  let m = String(raw || '').replace(/\D/g, '');
  if (m.startsWith('0098')) m = m.slice(4);
  else if (m.startsWith('98') && m.length === 12) m = m.slice(2);
  if (m.length === 10 && m.startsWith('9')) m = '0' + m;
  return m;
}

function validMobile(m) { return /^09\d{9}$/.test(m); }

function publicDoctor(doc) {
  const sp = SPECIALTIES.find((s) => s.id === doc.specialtyId) || null;
  return Object.assign({}, doc, {
    slots: doctorSlots(doc),
    specialty: sp ? { id: sp.id, name: sp.name, color: sp.color, icon: sp.icon } : null
  });
}

/* ------------------------------------------------------------------ *
 *  ذخیره‌سازی (JSON روی دیسک)
 * ------------------------------------------------------------------ */
let db = {
  doctors: [],
  appointments: [],
  admins: [],
  sessions: {},
  meta: { createdAt: Date.now() }
};

function seedDoctors() {
  return SEED_DOCTORS.map((d) => Object.assign({}, d, { createdAt: Date.now() }));
}

function seedAppointments() {
  const samples = [
    ['مینا حسینی', '09121234567', 'confirmed', 0],
    ['سعید رستمی', '09123334455', 'pending', 0],
    ['نگار عبدی', '09351112233', 'confirmed', 1],
    ['حامد قاسمی', '09107778899', 'pending', 1],
    ['الهام کوهی', '09361234567', 'done', -1],
    ['رضا مهدوی', '09190001122', 'canceled', 1]
  ];
  const out = [];
  samples.forEach((row, idx) => {
    const doc = db.doctors[idx % db.doctors.length];
    if (!doc) return;
    for (let step = 0; step < 8; step++) {
      const date = addDaysISO(todayISO(), row[3] + Math.floor(step / 4));
      if (doc.days.indexOf(weekdayIndex(date)) === -1) continue;
      const slots = doctorSlots(doc);
      const taken = out.filter((a) => a.doctorId === doc.id && a.date === date).map((a) => a.time);
      const time = slots.find((t) => taken.indexOf(t) === -1 && (row[3] < 0 || !isPastSlot(date, t)));
      if (!time) continue;
      out.push({
        id: 'a' + (1000 + idx),
        doctorId: doc.id,
        patientName: row[0],
        mobile: row[1],
        date: date,
        time: time,
        note: '',
        status: row[2],
        createdAt: Date.now() - (idx + 1) * 3600e3,
        updatedAt: Date.now() - (idx + 1) * 3600e3
      });
      break;
    }
  });
  return out;
}

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db = Object.assign(db, raw || {});
    }
  } catch (err) {
    log('db load failed:', String(err.message || err));
  }
  if (!Array.isArray(db.doctors) || !db.doctors.length) db.doctors = seedDoctors();
  if (!Array.isArray(db.admins) || !db.admins.length) db.admins = SEED_ADMINS.slice();
  if (!db.sessions || typeof db.sessions !== 'object') db.sessions = {};
  db.appointments = Array.isArray(db.appointments) ? db.appointments : [];
  if (!db.appointments.length) db.appointments = seedAppointments();
  saveDb();
}

function saveDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    log('db save failed:', String(err.message || err));
  }
}

/* ------------------------------------------------------------------ *
 *  نشست‌ها
 * ------------------------------------------------------------------ */
function cleanupSessions() {
  const now = Date.now();
  Object.keys(db.sessions).forEach((token) => {
    const s = db.sessions[token];
    if (!s || now - s.createdAt > SESSION_TTL) delete db.sessions[token];
  });
}

function issueToken(mobile, name) {
  cleanupSessions();
  const role = db.admins.indexOf(mobile) !== -1 ? 'admin' : 'patient';
  const token = crypto.randomBytes(24).toString('hex');
  const known = Object.keys(db.sessions).find((t) => db.sessions[t].mobile === mobile);
  if (known) delete db.sessions[known];
  db.sessions[token] = { mobile: mobile, name: name || '', role: role, createdAt: Date.now() };
  saveDb();
  return { token: token, role: role };
}

function currentUser(req) {
  const header = String(req.headers.authorization || '');
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const s = db.sessions[token];
  if (!s) return null;
  return { token: token, mobile: s.mobile, name: s.name, role: s.role, isAdmin: s.role === 'admin', createdAt: s.createdAt };
}


/* ------------------------------------------------------------------ *
 *  API — لایه‌های کمکی
 * ------------------------------------------------------------------ */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 128 * 1024) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (err) { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

function findDoctor(id) {
  return db.doctors.find((d) => d.id === id) || null;
}

function slotStatus(doctorId, date) {
  const doc = findDoctor(doctorId);
  if (!doc || !isValidDate(date)) return null;
  const weekday = weekdayIndex(date);
  const open = !!doc.active && doc.days.indexOf(weekday) !== -1;
  const taken = db.appointments
    .filter((a) => a.doctorId === doctorId && a.date === date && a.status !== 'canceled')
    .map((a) => a.time);
  const slots = doctorSlots(doc).map((time) => ({
    time: time,
    taken: taken.indexOf(time) !== -1,
    past: isPastSlot(date, time)
  }));
  const freeCount = slots.filter((s) => !s.taken && !s.past).length;
  return { doctorId: doctorId, date: date, weekday: weekday, open: open, freeCount: freeCount, slots: slots };
}

function upcomingDays(doc, count) {
  const out = [];
  for (let i = 0; i < (count || 14); i++) {
    const date = addDaysISO(todayISO(), i);
    const st = slotStatus(doc.id, date);
    if (!st) continue;
    out.push({ date: date, weekday: st.weekday, open: st.open, freeCount: st.freeCount });
  }
  return out;
}

function appointmentView(a) {
  const doc = findDoctor(a.doctorId);
  return Object.assign({}, a, {
    doctor: doc
      ? { id: doc.id, name: doc.name, title: doc.title, fee: doc.fee, specialtyId: doc.specialtyId, specialty: publicDoctor(doc).specialty }
      : null
  });
}

/* ------------------------------------------------------------------ *
 *  API — مسیریابی
 * ------------------------------------------------------------------ */
async function handleApi(req, res, url) {
  const route = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method || 'GET';
  const user = currentUser(req);

  /* ---------------------------- سلامت ---------------------------- */
  if (route === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      app: 'clinic-mehr',
      version: APP_VERSION,
      node: process.version,
      uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
      demoCode: DEMO_CODE,
      doctors: db.doctors.length,
      appointments: db.appointments.length
    });
    return;
  }

  /* ------------------------- ورود با موبایل ------------------------- */
  if (route === '/api/auth/request' && method === 'POST') {
    const body = await readJson(req);
    const mobile = normalizeMobile(body.mobile);
    if (!validMobile(mobile)) {
      sendJson(res, 400, { error: 'شماره موبایل معتبر نیست (مثال: 09121234567)' });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      mobile: mobile,
      demo: true,
      demoCode: DEMO_CODE,
      message: 'کد تأیید در حالت آزمایشی روی صفحه نمایش داده می‌شود.',
      role: db.admins.indexOf(mobile) !== -1 ? 'admin' : 'patient'
    });
    return;
  }

  if (route === '/api/auth/verify' && method === 'POST') {
    const body = await readJson(req);
    const mobile = normalizeMobile(body.mobile);
    const code = String(body.code || '').replace(/\D/g, '');
    if (!validMobile(mobile)) {
      sendJson(res, 400, { error: 'شماره موبایل معتبر نیست' });
      return;
    }
    if (code !== DEMO_CODE) {
      sendJson(res, 401, { error: 'کد تأیید نادرست است (کد آزمایشی: ' + DEMO_CODE + ')' });
      return;
    }
    const name = String(body.name || '').trim().slice(0, 60);
    const issued = issueToken(mobile, name);
    sendJson(res, 200, {
      ok: true,
      token: issued.token,
      user: { mobile: mobile, role: issued.role, name: name, isAdmin: issued.role === 'admin' }
    });
    return;
  }

  if (route === '/api/auth/logout' && method === 'POST') {
    if (user) {
      delete db.sessions[user.token];
      saveDb();
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (route === '/api/me') {
    if (!user) { sendJson(res, 401, { error: 'ابتدا وارد شوید' }); return; }
    sendJson(res, 200, { user: { mobile: user.mobile, name: user.name, role: user.role, isAdmin: user.isAdmin } });
    return;
  }


  /* ---------------------------- کاتالوگ ---------------------------- */
  if (route === '/api/specialties') {
    sendJson(res, 200, {
      specialties: SPECIALTIES.map((s) => ({
        id: s.id,
        name: s.name,
        short: s.short,
        icon: s.icon,
        color: s.color,
        soft: s.soft,
        desc: s.desc,
        doctorCount: db.doctors.filter((d) => d.specialtyId === s.id && d.active).length
      }))
    });
    return;
  }

  if (route === '/api/doctors') {
    const specialtyId = url.searchParams.get('specialty') || '';
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
    let list = db.doctors.slice();
    if (specialtyId) list = list.filter((d) => d.specialtyId === specialtyId);
    if (q) list = list.filter((d) => (d.name + ' ' + d.title).toLowerCase().indexOf(q) !== -1);
    list = list.sort((a, b) => (b.active - a.active) || (b.rating - a.rating));
    sendJson(res, 200, { doctors: list.map(publicDoctor) });
    return;
  }

  const doctorMatch = route.match(/^\/api\/doctors\/([\w-]+)$/);
  if (doctorMatch) {
    const doc = findDoctor(doctorMatch[1]);
    if (!doc) { sendJson(res, 404, { error: 'پزشک پیدا نشد' }); return; }
    sendJson(res, 200, { doctor: publicDoctor(doc), days: upcomingDays(doc, 14) });
    return;
  }

  if (route === '/api/slots') {
    const doctorId = url.searchParams.get('doctorId') || '';
    const date = url.searchParams.get('date') || todayISO();
    const st = slotStatus(doctorId, date);
    if (!st) { sendJson(res, 404, { error: 'پزشک یا تاریخ نامعتبر است' }); return; }
    sendJson(res, 200, st);
    return;
  }


  /* ---------------------------- نوبت‌ها ---------------------------- */
  if (route === '/api/appointments' && method === 'GET') {
    if (!user) { sendJson(res, 401, { error: 'ابتدا وارد شوید' }); return; }
    let list = db.appointments.slice();
    if (!user.isAdmin) {
      list = list.filter((a) => a.mobile === user.mobile);
    } else {
      const status = url.searchParams.get('status') || '';
      const date = url.searchParams.get('date') || '';
      const doctorId = url.searchParams.get('doctorId') || '';
      const q = String(url.searchParams.get('q') || '').trim();
      if (status) list = list.filter((a) => a.status === status);
      if (date) list = list.filter((a) => a.date === date);
      if (doctorId) list = list.filter((a) => a.doctorId === doctorId);
      if (q) list = list.filter((a) => (a.patientName + ' ' + a.mobile).indexOf(q) !== -1);
    }
    list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    sendJson(res, 200, { appointments: list.map(appointmentView) });
    return;
  }

  if (route === '/api/appointments' && method === 'POST') {
    if (!user) { sendJson(res, 401, { error: 'برای رزرو نوبت ابتدا وارد شوید' }); return; }
    const body = await readJson(req);
    const doc = findDoctor(String(body.doctorId || ''));
    if (!doc || !doc.active) { sendJson(res, 400, { error: 'پزشک در دسترس نیست' }); return; }
    const date = String(body.date || '');
    const time = String(body.time || '');
    if (!isValidDate(date)) { sendJson(res, 400, { error: 'تاریخ نامعتبر است' }); return; }
    if (date < todayISO()) { sendJson(res, 400, { error: 'نمی‌توان برای روز گذشته نوبت گرفت' }); return; }
    if (doc.days.indexOf(weekdayIndex(date)) === -1) { sendJson(res, 400, { error: 'پزشک در این روز مطب ندارد' }); return; }
    if (doctorSlots(doc).indexOf(time) === -1) { sendJson(res, 400, { error: 'ساعت انتخابی معتبر نیست' }); return; }
    if (isPastSlot(date, time)) { sendJson(res, 400, { error: 'این ساعت گذشته است' }); return; }
    const clash = db.appointments.find((a) => a.doctorId === doc.id && a.date === date && a.time === time && a.status !== 'canceled');
    if (clash) { sendJson(res, 409, { error: 'این نوبت لحظاتی پیش رزرو شد؛ ساعت دیگری انتخاب کنید' }); return; }
    const patientName = String(body.patientName || user.name || '').trim().slice(0, 60);
    if (!patientName) { sendJson(res, 400, { error: 'نام بیمار را وارد کنید' }); return; }
    const mine = db.appointments.find((a) => a.mobile === user.mobile && a.doctorId === doc.id && a.date === date && a.status !== 'canceled');
    if (mine) { sendJson(res, 409, { error: 'برای این روز نوبت دیگری نزد این پزشک دارید', appointmentId: mine.id }); return; }
    const appt = {
      id: 'a' + crypto.randomBytes(4).toString('hex'),
      doctorId: doc.id,
      patientName: patientName,
      mobile: user.mobile,
      date: date,
      time: time,
      note: String(body.note || '').trim().slice(0, 300),
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    db.appointments.push(appt);
    saveDb();
    sendJson(res, 201, { ok: true, appointment: appointmentView(appt) });
    return;
  }

  const apptMatch = route.match(/^\/api\/appointments\/([\w-]+)$/);
  if (apptMatch && method === 'PATCH') {
    if (!user) { sendJson(res, 401, { error: 'ابتدا وارد شوید' }); return; }
    const appt = db.appointments.find((a) => a.id === apptMatch[1]);
    if (!appt) { sendJson(res, 404, { error: 'نوبت پیدا نشد' }); return; }
    if (!user.isAdmin && appt.mobile !== user.mobile) { sendJson(res, 403, { error: 'دسترسی مجاز نیست' }); return; }
    const body = await readJson(req);
    const status = String(body.status || '');
    if (STATUSES.indexOf(status) === -1) { sendJson(res, 400, { error: 'وضعیت نامعتبر است' }); return; }
    if (!user.isAdmin && status !== 'canceled') { sendJson(res, 403, { error: 'بیمار فقط می‌تواند نوبت خود را لغو کند' }); return; }
    if (!user.isAdmin && isPastSlot(appt.date, appt.time)) { sendJson(res, 400, { error: 'نوبت گذشته قابل لغو نیست' }); return; }
    appt.status = status;
    appt.updatedAt = Date.now();
    saveDb();
    sendJson(res, 200, { ok: true, appointment: appointmentView(appt) });
    return;
  }


  /* ----------------------------- مدیر ----------------------------- */
  if (route.startsWith('/api/admin/') && (!user || !user.isAdmin)) {
    sendJson(res, 403, { error: 'این بخش فقط برای مدیر کلینیک است' });
    return;
  }

  if (route === '/api/admin/stats') {
    const today = todayISO();
    const byStatus = { pending: 0, confirmed: 0, done: 0, canceled: 0 };
    db.appointments.forEach((a) => { if (byStatus[a.status] !== undefined) byStatus[a.status]++; });
    const upcoming = [];
    for (let i = 0; i < 7; i++) {
      const date = addDaysISO(today, i);
      upcoming.push({ date: date, count: db.appointments.filter((a) => a.date === date && a.status !== 'canceled').length });
    }
    const specialties = SPECIALTIES.map((s) => {
      const ids = db.doctors.filter((d) => d.specialtyId === s.id).map((d) => d.id);
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        icon: s.icon,
        doctors: db.doctors.filter((d) => d.specialtyId === s.id && d.active).length,
        appointments: db.appointments.filter((a) => ids.indexOf(a.doctorId) !== -1 && a.status !== 'canceled').length
      };
    });
    const byDoctor = {};
    db.appointments.forEach((a) => {
      if (a.status === 'canceled') return;
      byDoctor[a.doctorId] = (byDoctor[a.doctorId] || 0) + 1;
    });
    const topDoctors = Object.keys(byDoctor)
      .map((id) => {
        const d = findDoctor(id);
        return d ? { id: id, name: d.name, count: byDoctor[id], specialtyId: d.specialtyId } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    sendJson(res, 200, {
      totals: {
        appointments: db.appointments.length,
        today: db.appointments.filter((a) => a.date === today && a.status !== 'canceled').length,
        pending: byStatus.pending,
        confirmed: byStatus.confirmed,
        done: byStatus.done,
        canceled: byStatus.canceled,
        doctors: db.doctors.length,
        activeDoctors: db.doctors.filter((d) => d.active).length,
        patients: new Set(db.appointments.map((a) => a.mobile)).size
      },
      today: today,
      upcoming: upcoming,
      specialties: specialties,
      topDoctors: topDoctors
    });
    return;
  }

  if (route === '/api/admin/doctors' && method === 'POST') {
    const body = await readJson(req);
    const name = String(body.name || '').trim();
    const sp = SPECIALTIES.find((s) => s.id === String(body.specialtyId || ''));
    if (!name) { sendJson(res, 400, { error: 'نام پزشک الزامی است' }); return; }
    if (!sp) { sendJson(res, 400, { error: 'تخصص نامعتبر است' }); return; }
    const days = Array.isArray(body.days) ? body.days.map(Number).filter((n) => n >= 0 && n <= 6) : [];
    const shifts = Array.isArray(body.shifts) ? body.shifts.filter((s) => SHIFTS[s]) : [];
    const doc = {
      id: 'd' + crypto.randomBytes(4).toString('hex'),
      name: name.slice(0, 80),
      specialtyId: sp.id,
      title: String(body.title || sp.name).slice(0, 80),
      rating: 4.5,
      reviews: 0,
      fee: Math.max(0, Number(body.fee) || 200000),
      exp: Math.max(0, Number(body.exp) || 1),
      days: days.length ? days : [0, 1, 2, 3, 4],
      shifts: shifts.length ? shifts : ['am'],
      active: body.active === false ? false : true,
      bio: String(body.bio || '').slice(0, 300),
      createdAt: Date.now()
    };
    db.doctors.push(doc);
    saveDb();
    sendJson(res, 201, { ok: true, doctor: publicDoctor(doc) });
    return;
  }

  const adminDoctorMatch = route.match(/^\/api\/admin\/doctors\/([\w-]+)$/);
  if (adminDoctorMatch && method === 'PATCH') {
    const doc = findDoctor(adminDoctorMatch[1]);
    if (!doc) { sendJson(res, 404, { error: 'پزشک پیدا نشد' }); return; }
    const body = await readJson(req);
    if (typeof body.active === 'boolean') doc.active = body.active;
    if (body.fee !== undefined) doc.fee = Math.max(0, Number(body.fee) || doc.fee);
    if (typeof body.name === 'string' && body.name.trim()) doc.name = body.name.trim().slice(0, 80);
    if (typeof body.title === 'string' && body.title.trim()) doc.title = body.title.trim().slice(0, 80);
    if (typeof body.bio === 'string') doc.bio = body.bio.slice(0, 300);
    if (Array.isArray(body.days)) {
      const days = body.days.map(Number).filter((n) => n >= 0 && n <= 6);
      if (days.length) doc.days = days;
    }
    if (Array.isArray(body.shifts)) {
      const shifts = body.shifts.filter((s) => SHIFTS[s]);
      if (shifts.length) doc.shifts = shifts;
    }
    saveDb();
    sendJson(res, 200, { ok: true, doctor: publicDoctor(doc) });
    return;
  }

  sendJson(res, 404, { error: 'API route not found' });
}


/* ------------------------------------------------------------------ *
 *  فایل‌های استاتیک
 * ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(pathname, res) {
  const decoded = decodeURIComponent(pathname.split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const target = path.join(PUBLIC_DIR, relative);

  if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== path.join(PUBLIC_DIR, 'index.html')) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.stat(target, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      /* SPA: هر مسیر ناشناخته به صفحه اصلی برمی‌گردد */
      const fallback = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(fallback)) {
        const body = fs.readFileSync(fallback);
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
        res.end(body);
        return;
      }
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const ext = path.extname(target).toLowerCase();
    const isHtml = ext === '.html';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'SAMEORIGIN'
    });

    if (isHtml) {
      res.end(fs.readFileSync(target));
      return;
    }
    fs.createReadStream(target).pipe(res);
  });
}

/* ------------------------------------------------------------------ *
 *  سرور
 * ------------------------------------------------------------------ */
loadDb();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => {
      log('API error:', req.url, String((err && err.message) || err));
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'خطای داخلی سرور', detail: String((err && err.message) || err) });
      }
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  serveStatic(url.pathname, res);
});

server.listen(PORT, HOST, () => {
  log('کلینیک مهر v' + APP_VERSION + ' listening on http://' + HOST + ':' + PORT);
  log('کد ورود آزمایشی: ' + DEMO_CODE + ' | شماره مدیر نمونه: ' + SEED_ADMINS[0]);
});

server.on('error', (err) => {
  log('server error:', err.message);
  if (err.code === 'EADDRINUSE') process.exit(1);
});
