'use strict';

/** ذخیره‌سازی JSON با نوشتن اتمیک — بدون وابستگی. */

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  users: {},
  orders: {},
  settings: {
    card: '0000-0000-0000-0000',
    cardName: 'نام صاحب کارت',
    support: '@support',
    channel: '',
    maintenance: false,
    refBonus: 10000,
    trialGb: 0.5,
    trialDays: 2,
    testMode: false,
  },
  plans: null,
  stats: { started: 0, paid: 0, revenue: 0 },
  seq: { order: 1000 },
};

const PLANS = [
  { id: 'p1', title: 'سبک', gb: 20, days: 30, price: 39000 },
  { id: 'p2', title: 'استاندارد', gb: 50, days: 30, price: 69000 },
  { id: 'p3', title: 'حرفه‌ای', gb: 100, days: 30, price: 119000 },
  { id: 'p4', title: 'سه‌ماهه', gb: 150, days: 90, price: 249000 },
  { id: 'p5', title: 'شش‌ماهه', gb: 300, days: 180, price: 449000 },
];

let db = null;
let dbPath = null;
let dirty = false;

function deepMerge(base, patch) {
  const out = Object.assign({}, base);
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], v);
    } else { out[k] = v; }
  }
  return out;
}

function load(file) {
  dbPath = file;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch (e) { raw = null; }
  db = deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), raw || {});
  if (!db.plans) db.plans = JSON.parse(JSON.stringify(PLANS));
  saveNow();
  const t = setInterval(() => { if (dirty) saveNow(); }, 2000);
  t.unref();
  return db;
}

function saveNow() {
  if (!db || !dbPath) return;
  const tmp = dbPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, dbPath);
  dirty = false;
}

function touch() { dirty = true; }
function data() { return db; }

function getUser(tgId, profile) {
  const id = String(tgId);
  let u = db.users[id];
  if (!u) {
    u = {
      tgId: Number(tgId),
      name: (profile && profile.first_name) || '',
      username: (profile && profile.username) || '',
      balance: 0,
      refBy: (profile && profile.refBy) || null,
      refCount: 0,
      nxUserId: null,
      trialUsed: false,
      banned: false,
      createdAt: Date.now(),
    };
    db.users[id] = u;
    db.stats.started += 1;
    dirty = true;
  } else {
    if (profile && profile.username) u.username = profile.username;
    if (profile && profile.first_name) u.name = profile.first_name;
  }
  return u;
}

function nextId() {
  db.seq.order = (db.seq.order || 1000) + 1;
  dirty = true;
  return db.seq.order;
}

function addOrder(order) {
  const id = nextId();
  db.orders[id] = Object.assign({ id, status: 'pending', createdAt: Date.now() }, order);
  dirty = true;
  return db.orders[id];
}

function getOrder(id) { return db.orders[String(id)] || null; }

function setOrder(id, patch) {
  const o = db.orders[String(id)];
  if (!o) return null;
  Object.assign(o, patch);
  dirty = true;
  return o;
}

function usersList() { return Object.values(db.users); }

function pendingOrders() {
  return Object.values(db.orders).filter(o => o.status === 'pending' || o.status === 'review');
}

function updateSettings(patch) {
  db.settings = Object.assign(db.settings, patch);
  dirty = true;
  return db.settings;
}

function planById(id) { return db.plans.find(p => String(p.id) === String(id)) || null; }

function findUserByNxId(nxId) {
  return usersList().find(u => String(u.nxUserId) === String(nxId)) || null;
}

module.exports = {
  load, saveNow, touch, data, getUser, addOrder, getOrder, setOrder,
  usersList, pendingOrders, updateSettings, planById, findUserByNxId, PLANS,
};
