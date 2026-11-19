'use strict';

/** Ã™â€¦Ã™â€ Ã˜Â·Ã™â€š Ã˜Â±Ã˜Â¨Ã˜Â§Ã˜Âª: Ã™â€¦Ã˜Â³Ã›Å’Ã˜Â±Ã›Å’Ã˜Â§Ã˜Â¨Ã›Å’ Ã˜Â¢Ã™Â¾Ã˜Â¯Ã›Å’Ã˜ÂªÃ¢â‚¬Å’Ã™â€¡Ã˜Â§Ã˜Å’ Ã˜Â®Ã˜Â±Ã›Å’Ã˜Â¯Ã˜Å’ ÃšÂ©Ã›Å’Ã™Â Ã™Â¾Ã™Ë†Ã™â€žÃ˜Å’ Ã™Ë† Ã™Â¾Ã™â€ Ã™â€ž Ã™â€¦Ã˜Â¯Ã›Å’Ã˜Â±Ã›Å’Ã˜Âª */

const { config } = require('./config');
const store = require('./store');
const nx = require('./nx');
const ui = require('./ui');
const tg = require('./tg');

const sessions = new Map();          // tgId -> { step, data }
const sec = (id) => { let s = sessions.get(id); if (!s) { s = { step: null, data: {} }; sessions.set(id, s); } return s; };
const isAdmin = (id) => config.adminIds.includes(Number(id));
const S = () => store.data().settings;
const money = ui.money;

function svcState(u) {
  const volume = Number(u.volume || 0);
  const used = Number(u.up || 0) + Number(u.down || 0);
  const dl = nx.daysLeft(u.expiry);
  return {
    volume, usedBytes: used,
    daysLeft: dl === null ? 9999 : dl,
    expired: dl !== null && dl <= 0,
    deviceLimit: u.deviceLimit || config.nx.deviceLimit,
  };
}

async function panelRows(user) {
  if (!user.nxUserId) return [];
  try {
    const u = await nx.getUser(user.nxUserId);
    const l = await nx.links(user.nxUserId);
    const link = firstLink(l) || u.subUrlPretty || u.subUrl || '';
    return [{ nxId: user.nxUserId, name: u.name, link, sub: u.subUrlPretty, state: svcState(u) }];
  } catch (e) {
    return [];
  }
}

function firstLink(l) {
  if (!l) return '';
  if (typeof l === 'string') return l;
  if (Array.isArray(l)) return typeof l[0] === 'string' ? l[0] : (l[0] && (l[0].link || l[0].url)) || '';
  if (l.links && l.links.length) return firstLink(l.links);
  if (l.urls && l.urls.length) return firstLink(l.urls);
  return l.subUrl || l.url || l.link || '';
}

async function show(chatId, messageId, view) {
  if (messageId) return tg.edit(chatId, messageId, view.text, view.keyboard);
  return tg.send(chatId, view.text, view.keyboard);
}

/* ---------------- ÃšÂ©Ã˜Â§Ã˜Â±Ã˜Â¨Ã˜Â±: Ã™Ë†Ã˜Â±Ã™Ë†Ã˜Â¯ Ã™Ë† Ã™â€¦Ã™â€ Ã™Ë† ---------------- */

async function onStart(msg, payload) {
  const id = msg.from.id;
  const profile = { first_name: msg.from.first_name, username: msg.from.username };
  let refBy = null;
  if (payload && payload.startsWith('ref_')) refBy = Number(payload.slice(4)) || null;
  const existed = !!store.data().users[String(id)];
  const u = store.getUser(id, { ...profile, refBy: existed ? undefined : refBy });

  if (!existed && refBy && refBy !== id) {
    const ref = store.data().users[String(refBy)];
    if (ref) {
      tg.send(refBy, `Ã°Å¸Å½â€° <b>${ui.esc(profile.first_name || 'Ã›Å’ÃšÂ© Ã˜Â¯Ã™Ë†Ã˜Â³Ã˜Âª')}</b> Ã˜Â¨Ã˜Â§ Ã™â€žÃ›Å’Ã™â€ ÃšÂ© Ã˜Â´Ã™â€¦Ã˜Â§ Ã™Ë†Ã˜Â§Ã˜Â±Ã˜Â¯ Ã˜Â´Ã˜Â¯.\n` +
        `Ã°Å¸â€™Â³ Ã™â€¡Ã˜Â¯Ã›Å’Ã™â€¡ Ã™Â¾Ã˜Â³ Ã˜Â§Ã˜Â² Ã˜Â§Ã™Ë†Ã™â€žÃ›Å’Ã™â€  Ã˜Â®Ã˜Â±Ã›Å’Ã˜Â¯Ã˜Â´ Ã™Ë†Ã˜Â§Ã˜Â±Ã›Å’Ã˜Â² Ã™â€¦Ã›Å’Ã¢â‚¬Å’Ã˜Â´Ã™Ë†Ã˜Â¯.`).catch(() => null);
    }
  }
  if (!config.adminIds.length) {
    S().adminIds = [Number(id)];
    store.touch();
    config.adminIds.push(Number(id));
    tg.send(id, '👑 شما به‌عنوان <b>مدیر</b> این ربات ثبت شدید.\nدستور /admin را بزنید.').catch(() => null);
  }
  sec(id).step = null;
  const hello = existed ? '' : `\nÃ¢Å“Â¨ <i>Ã˜Â­Ã˜Â³Ã˜Â§Ã˜Â¨ Ã˜Â´Ã™â€¦Ã˜Â§ Ã˜Â³Ã˜Â§Ã˜Â®Ã˜ÂªÃ™â€¡ Ã˜Â´Ã˜Â¯Ã˜â€º Ã˜Â®Ã™Ë†Ã˜Â´ Ã˜Â¢Ã™â€¦Ã˜Â¯Ã›Å’Ã˜Â¯!</i>\n`;
  const v = ui.home(u);
  if (hello) {
    await tg.send(id, hello.trim(), undefined);
  }
  return tg.send(id, v.text, v.keyboard);
}

async function mainMenu(msgOrCb, messageId) {
  const id = msgOrCb.from.id;
  const u = store.getUser(id, { first_name: msgOrCb.from.first_name, username: msgOrCb.from.username });
  sec(id).step = null;
  const v = ui.home(u);
  if (messageId) return tg.edit(id, messageId, v.text, v.keyboard);
  return tg.send(id, v.text, v.keyboard);
}

module.exports = {
  sessions, sec, isAdmin, S, svcState, panelRows, firstLink, show,
  onStart, mainMenu, handleMessage, handleCallback, notifyExpiring,
};

/* ---------------- Ã™Â¾Ã›Å’Ã˜Â§Ã™â€¦Ã¢â‚¬Å’Ã™â€¡Ã˜Â§Ã›Å’ Ã™â€¦Ã˜ÂªÃ™â€ Ã›Å’ ---------------- */

async function handleMessage(msg) {
  const id = msg.from.id;
  const u = store.getUser(id, { first_name: msg.from.first_name, username: msg.from.username });
  const s = sec(id);
  const text = (msg.text || '').trim();

  if (msg.chat.type !== 'private') return null;

  if (text.startsWith('/start')) {
    return onStart(msg, text.split(/\s+/)[1]);
  }

  if (s.step === 'receipt') return onReceiptSubmit(msg, u, s);
  if (s.step === 'support') {
    s.step = null;
    const admins = config.adminIds;
    for (const a of admins) {
      tg.send(a, `Ã¢ËœÅ½Ã¯Â¸Â <b>Ã™Â¾Ã›Å’Ã˜Â§Ã™â€¦ Ã™Â¾Ã˜Â´Ã˜ÂªÃ›Å’Ã˜Â¨Ã˜Â§Ã™â€ Ã›Å’</b>\nÃ°Å¸â€˜Â¤ ${ui.esc(u.name)} Ã¢â‚¬â€ <code>${id}</code>\n${ui.LN}\n${ui.esc(text)}`).catch(() => null);
      if (msg.photo) tg.copyMessage(a, msg.chat.id, msg.message_id).catch(() => null);
    }
    return tg.send(id, `Ã°Å¸â€œÂ® Ã™Â¾Ã›Å’Ã˜Â§Ã™â€¦ Ã˜Â´Ã™â€¦Ã˜Â§ Ã˜Â¨Ã˜Â±Ã˜Â§Ã›Å’ Ã™Â¾Ã˜Â´Ã˜ÂªÃ›Å’Ã˜Â¨Ã˜Â§Ã™â€ Ã›Å’ Ã˜Â§Ã˜Â±Ã˜Â³Ã˜Â§Ã™â€ž Ã˜Â´Ã˜Â¯.\n${ui.LN}\nÃ°Å¸â€¢Â Ã˜Â¨Ã™â€¡Ã¢â‚¬Å’Ã˜Â²Ã™Ë†Ã˜Â¯Ã›Å’ Ã™Â¾Ã˜Â§Ã˜Â³Ã˜Â® Ã™â€¦Ã›Å’Ã¢â‚¬Å’ÃšÂ¯Ã›Å’Ã˜Â±Ã›Å’Ã˜Â¯.`,
      ui.kb([[ui.btn('Ã°Å¸ÂÂ  Ã™â€¦Ã™â€ Ã™Ë†', 'home')]]));
  }
  if (s.step && s.step.startsWith('adm:')) return onAdminInput(msg, u, s, text);

  return tg.send(id, `Ã¢â€žÂ¹Ã¯Â¸Â Ã˜Â§Ã˜Â² Ã˜Â¯ÃšÂ©Ã™â€¦Ã™â€¡Ã¢â‚¬Å’Ã™â€¡Ã˜Â§Ã›Å’ Ã˜Â²Ã›Å’Ã˜Â± Ã˜Â§Ã˜Â³Ã˜ÂªÃ™ÂÃ˜Â§Ã˜Â¯Ã™â€¡ ÃšÂ©Ã™â€ Ã›Å’Ã˜Â¯.`, ui.kb([[ui.btn('Ã°Å¸ÂÂ  Ã™â€¦Ã™â€ Ã™Ë†', 'home')]]));
}

/* ---------------- Ã˜Â¯ÃšÂ©Ã™â€¦Ã™â€¡Ã¢â‚¬Å’Ã™â€¡Ã˜Â§ ---------------- */

async function handleCallback(q) {
  const id = q.from.id;
  const mid = q.message && q.message.message_id;
  const data = q.data || '';
  const u = store.getUser(id, { first_name: q.from.first_name, username: q.from.username });
  const s = sec(id);
  const parts = data.split(':');
  const head = parts[0];

  await tg.answer(q.id, '');

  if (S().maintenance && !isAdmin(id)) {
    return show(id, mid, {
      text: `Ã°Å¸â€ºÂ  <b>Ã˜Â­Ã˜Â§Ã™â€žÃ˜Âª Ã˜ÂªÃ˜Â¹Ã™â€¦Ã›Å’Ã˜Â±Ã˜Â§Ã˜Âª</b>\n${ui.LN}\nÃ˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³ Ã™â€¦Ã™Ë†Ã™â€šÃ˜ÂªÃ˜Â§Ã™â€¹ Ã˜Â¯Ã˜Â± Ã˜Â­Ã˜Â§Ã™â€ž Ã˜Â¨Ã™â€¡Ã¢â‚¬Å’Ã˜Â±Ã™Ë†Ã˜Â²Ã˜Â±Ã˜Â³Ã˜Â§Ã™â€ Ã›Å’ Ã˜Â§Ã˜Â³Ã˜Âª.\nÃšÂ©Ã™â€¦Ã›Å’ Ã˜Â¨Ã˜Â¹Ã˜Â¯ Ã˜Â¯Ã™Ë†Ã˜Â¨Ã˜Â§Ã˜Â±Ã™â€¡ Ã˜ÂªÃ™â€žÃ˜Â§Ã˜Â´ ÃšÂ©Ã™â€ Ã›Å’Ã˜Â¯.`,
      keyboard: ui.kb([]),
    });
  }

  switch (data) {
    case 'home': return show(id, mid, ui.home(u));
    case 'buy': return show(id, mid, ui.planList(store.data().plans, u));
    case 'wallet': return show(id, mid, ui.wallet(u));
    case 'orders': return show(id, mid, ordersView(u));
    case 'my': return show(id, mid, ui.myServices(await panelRows(u)));
    case 'ref': return show(id, mid, ui.refPage(u, q.message.chat.username || ''));
    case 'howto': return show(id, mid, ui.howto());
    case 'help': return show(id, mid, ui.help());
    case 'receipt': {
      s.step = 'receipt';
      return show(id, mid, {
        text: `${ui.L}\n  Ã°Å¸â€™Â³ <b>Ã˜Â´Ã˜Â§Ã˜Â±ÃšËœ ÃšÂ©Ã›Å’Ã™Â Ã™Â¾Ã™Ë†Ã™â€ž</b>\n  ${ui.LN}\n\n  Ã™â€¦Ã˜Â¨Ã™â€žÃ˜Âº Ã˜Â±Ã˜Â§ Ã˜Â¨Ã™â€¡ ÃšÂ©Ã˜Â§Ã˜Â±Ã˜Âª Ã˜Â²Ã›Å’Ã˜Â± Ã™Ë†Ã˜Â§Ã˜Â±Ã›Å’Ã˜Â² ÃšÂ©Ã™â€ Ã›Å’Ã˜Â¯:\n\n` +
          `  <code>${ui.esc(S().card)}</code>\n  Ã°Å¸â€˜Â¤ ${ui.esc(S().cardName)}\n\n` +
          `${ui.LN}  Ã˜Â³Ã™Â¾Ã˜Â³ <b>Ã™â€¦Ã˜Â¨Ã™â€žÃ˜Âº Ã™Ë†Ã˜Â§Ã˜Â±Ã›Å’Ã˜Â²Ã›Å’</b> Ã˜Â±Ã˜Â§ Ã˜Â¨Ã™â€¡ Ã˜ÂªÃ™Ë†Ã™â€¦Ã˜Â§Ã™â€  Ã˜Â¨Ã™ÂÃ˜Â±Ã˜Â³Ã˜ÂªÃ›Å’Ã˜Â¯.\n  Ã™â€¦Ã˜Â«Ã˜Â§Ã™â€ž: <code>100000</code>\n${ui.L}`,
        keyboard: ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'wallet')]]),
      });
    }
    case 'support': {
      s.step = 'support';
      return show(id, mid, {
        text: `${ui.L}\n  Ã¢ËœÅ½Ã¯Â¸Â <b>Ã™Â¾Ã˜Â´Ã˜ÂªÃ›Å’Ã˜Â¨Ã˜Â§Ã™â€ Ã›Å’</b>\n  ${ui.LN}\n\n  Ã˜Â³Ã˜Â¤Ã˜Â§Ã™â€ž Ã›Å’Ã˜Â§ Ã™â€¦Ã˜Â´ÃšÂ©Ã™â€žÃ˜Âª Ã˜Â±Ã˜Â§ Ã™â€¡Ã™â€¦Ã›Å’Ã™â€ Ã¢â‚¬Å’Ã˜Â¬Ã˜Â§ Ã˜Â¨Ã™â€ Ã™Ë†Ã›Å’Ã˜Â³ (Ã™â€¦Ã˜ÂªÃ™â€  Ã›Å’Ã˜Â§ Ã˜Â¹ÃšÂ©Ã˜Â³).\n` +
          `  Ã°Å¸â€˜Â¤ Ã˜Â¢Ã›Å’Ã¢â‚¬Å’Ã˜Â¯Ã›Å’: ${ui.esc(S().support)}\n${ui.L}`,
        keyboard: ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'home')]]),
      });
    }
    default: break;
  }

  if (head === 'plan') return show(id, mid, ui.planDetail(store.planById(parts[1]), u));
  if (head === 'pay') return payWithWallet(q, u, parts[1], mid);
  if (head === 'svc') return servicePage(id, mid, u, parts[1]);
  if (head === 'sub') return subLink(id, mid, u, parts[1]);
  if (head === 'renew') return show(id, mid, ui.renewMenu(parts[1], store.data().plans));
  if (head === 'rnew') return renewWithWallet(q, u, parts[1], parts[2], mid);
  if (head === 'order') return show(id, mid, orderView(store.getOrder(parts[1])));
  if (head === 'adm') return adminCallback(q, u, data, mid);

  return show(id, mid, ui.home(u));
}

async function servicePage(id, mid, user, nxId) {
  try {
    const p = await nx.getUser(nxId);
    const l = await nx.links(nxId);
    const row = { nxId, name: p.name, link: firstLink(l) || p.subUrl, sub: p.subUrlPretty, state: svcState(p) };
    return show(id, mid, ui.serviceDetail(row));
  } catch (e) {
    return show(id, mid, { text: `Ã¢ÂÅ’ Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³ Ã™Â¾Ã›Å’Ã˜Â¯Ã˜Â§ Ã™â€ Ã˜Â´Ã˜Â¯.\n${ui.LN}\n${ui.esc(e.message)}`, keyboard: ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'my')]]) });
  }
}

async function subLink(id, mid, user, nxId) {
  try {
    const p = await nx.getUser(nxId);
    const l = await nx.links(nxId);
    const direct = firstLink(l);
    const sub = p.subUrlPretty || p.subUrl;
    let text = `${ui.L}\n  Ã°Å¸â€â€” <b>Ã™â€žÃ›Å’Ã™â€ ÃšÂ©Ã¢â‚¬Å’Ã™â€¡Ã˜Â§Ã›Å’ Ã˜Â§Ã˜ÂªÃ˜ÂµÃ˜Â§Ã™â€ž</b>\n  ${ui.LN}\n\n  Ã°Å¸â€œÂ¡ <b>Ã˜Â§Ã˜Â´Ã˜ÂªÃ˜Â±Ã˜Â§ÃšÂ© (Ã˜ÂªÃ™Ë†Ã˜ÂµÃ›Å’Ã™â€¡Ã¢â‚¬Å’Ã˜Â´Ã˜Â¯Ã™â€¡)</b>\n  <code>${ui.esc(sub)}</code>\n\n`;
    if (direct) text += `  Ã°Å¸â€â€˜ <b>ÃšÂ©Ã˜Â§Ã™â€ Ã™ÂÃ›Å’ÃšÂ¯ Ã™â€¦Ã˜Â³Ã˜ÂªÃ™â€šÃ›Å’Ã™â€¦</b>\n  <code>${ui.esc(direct)}</code>\n\n`;
    text += `${ui.LN}  Ã¢â€žÂ¹Ã¯Â¸Â Ã˜Â¨Ã˜Â§ Ã™â€žÃ™â€¦Ã˜Â³ ÃšÂ©Ã™Â¾Ã›Å’ Ã™â€¦Ã›Å’Ã¢â‚¬Å’Ã˜Â´Ã™Ë†Ã˜Â¯Ã˜â€º Ã˜Â¨Ã˜Â¹Ã˜Â¯ Ã˜Â§Ã˜Â² Ã˜ÂªÃ™â€¦Ã˜Â¯Ã›Å’Ã˜Â¯ Ã™â€¡Ã™â€¦Ã˜Â§Ã™â€  Ã™â€žÃ›Å’Ã™â€ ÃšÂ© Ã™â€¦Ã˜Â¹Ã˜ÂªÃ˜Â¨Ã˜Â± Ã˜Â§Ã˜Â³Ã˜Âª.\n${ui.L}`;
    return show(id, mid, { text, keyboard: ui.kb([[ui.btn('Ã°Å¸â€œâ€¹ Ã˜Â±Ã˜Â§Ã™â€¡Ã™â€ Ã™â€¦Ã˜Â§Ã›Å’ Ã˜Â§Ã˜ÂªÃ˜ÂµÃ˜Â§Ã™â€ž', 'howto')], [ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'svc:' + nxId)]]) });
  } catch (e) {
    return tg.send(id, 'Ã¢ÂÅ’ Ã˜Â¯Ã˜Â±Ã›Å’Ã˜Â§Ã™ÂÃ˜Âª Ã™â€žÃ›Å’Ã™â€ ÃšÂ© Ã™â€ Ã˜Â§Ã™â€¦Ã™Ë†Ã™ÂÃ™â€š Ã˜Â¨Ã™Ë†Ã˜Â¯: ' + ui.esc(e.message));
  }
}

async function payWithWallet(q, user, planId, mid) {
  const id = q.from.id;
  const p = store.planById(planId);
  if (!p) return show(id, mid, ui.planList(store.data().plans, user));
  if (user.balance < p.price) {
    await tg.answer(q.id, 'Ã™â€¦Ã™Ë†Ã˜Â¬Ã™Ë†Ã˜Â¯Ã›Å’ ÃšÂ©Ã˜Â§Ã™ÂÃ›Å’ Ã™â€ Ã›Å’Ã˜Â³Ã˜Âª', true);
    return show(id, mid, ui.wallet(user));
  }
  user.balance -= p.price;
  store.touch();
  await show(id, mid, { text: `${ui.L}\n  Ã¢Å¡â„¢Ã¯Â¸Â <b>Ã˜Â¯Ã˜Â± Ã˜Â­Ã˜Â§Ã™â€ž Ã˜Â³Ã˜Â§Ã˜Â®Ã˜Âª Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³Ã¢â‚¬Â¦</b>\n  ${ui.LN}\n\n  Ãšâ€ Ã™â€ Ã˜Â¯ Ã˜Â«Ã˜Â§Ã™â€ Ã›Å’Ã™â€¡ Ã˜ÂµÃ˜Â¨Ã˜Â± ÃšÂ©Ã™â€ Ã›Å’Ã˜Â¯ Ã¢ÂÂ³`, keyboard: ui.kb([]) });
  try {
    const created = await nx.createUser({ name: 'tg' + id, gb: p.gb, days: p.days, remark: 'tg:' + id });
    user.nxUserId = created.id;
    store.touch();
    const link = firstLink(await nx.links(created.id)) || created.subUrlPretty;
    const o = store.addOrder({ tgId: id, type: 'plan', planId: p.id, price: p.price, status: 'paid', nxUserId: created.id, note: p.title });
    let text = `${ui.L}\n  Ã¢Å“â€¦ <b>Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³ Ã˜Â´Ã™â€¦Ã˜Â§ Ã™ÂÃ˜Â¹Ã˜Â§Ã™â€ž Ã˜Â´Ã˜Â¯</b>\n  ${ui.LN}\n\n  Ã°Å¸â€œÂ¦ ${p.title} Ã¢â‚¬â€ ${ui.gb(p.gb)} ÃšÂ¯Ã›Å’ÃšÂ¯ / ${ui.gb(p.days)} Ã˜Â±Ã™Ë†Ã˜Â²\n`;
    text += `  Ã°Å¸â€™Â³ Ã™Â¾Ã˜Â±Ã˜Â¯Ã˜Â§Ã˜Â®Ã˜Âª: ${ui.money(p.price)}\n  Ã°Å¸â€™Â° Ã™â€¦Ã™Ë†Ã˜Â¬Ã™Ë†Ã˜Â¯Ã›Å’: ${ui.money(user.balance)}\n  Ã°Å¸â€ â€ Ã˜Â³Ã™ÂÃ˜Â§Ã˜Â±Ã˜Â´: <code>${o.id}</code>\n\n`;
    text += `${ui.LN}  Ã°Å¸â€â€” <b>Ã™â€žÃ›Å’Ã™â€ ÃšÂ© Ã˜Â§Ã˜Â´Ã˜ÂªÃ˜Â±Ã˜Â§ÃšÂ©</b> (Ã™â€žÃ™â€¦Ã˜Â³ = ÃšÂ©Ã™Â¾Ã›Å’)\n  <code>${ui.esc(created.subUrlPretty)}</code>\n\n${ui.LN}  Ã°Å¸Å½â€œ Ã˜Â¯Ã˜Â± Ã‚Â«Ã˜Â¢Ã™â€¦Ã™Ë†Ã˜Â²Ã˜Â´ Ã˜Â§Ã˜ÂªÃ˜ÂµÃ˜Â§Ã™â€žÃ‚Â» Ã˜Â§Ã™Â¾ Ã™â€¦Ã™â€ Ã˜Â§Ã˜Â³Ã˜Â¨ Ã˜Â¯Ã˜Â³Ã˜ÂªÃšÂ¯Ã˜Â§Ã™â€¡Ã˜Âª Ã˜Â±Ã˜Â§ Ã˜Â¨Ã˜Â¨Ã›Å’Ã™â€ .\n${ui.L}`;
    await tg.send(id, text, ui.kb([[ui.btn('Ã°Å¸â€œÂ± Ã˜Â±Ã˜Â§Ã™â€¡Ã™â€ Ã™â€¦Ã˜Â§Ã›Å’ Ã˜Â§Ã˜ÂªÃ˜ÂµÃ˜Â§Ã™â€ž', 'howto')], [ui.btn('Ã°Å¸â€â€˜ Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³Ã¢â‚¬Å’Ã™â€¡Ã˜Â§Ã›Å’ Ã™â€¦Ã™â€ ', 'my'), ui.btn('Ã°Å¸ÂÂ  Ã™â€¦Ã™â€ Ã™Ë†', 'home')]]));
    if (link) await tg.send(id, 'Ã°Å¸â€â€˜ ÃšÂ©Ã˜Â§Ã™â€ Ã™ÂÃ›Å’ÃšÂ¯ Ã™â€¦Ã˜Â³Ã˜ÂªÃ™â€šÃ›Å’Ã™â€¦:\n<code>' + ui.esc(link) + '</code>', ui.kb([[ui.btn('Ã°Å¸ÂÂ  Ã™â€¦Ã™â€ Ã™Ë†', 'home')]]));
    for (const a of config.adminIds) {
      tg.send(a, `Ã°Å¸â€ºâ€™ <b>Ã˜Â®Ã˜Â±Ã›Å’Ã˜Â¯ Ã˜Â¬Ã˜Â¯Ã›Å’Ã˜Â¯</b>\nÃ°Å¸â€˜Â¤ ${ui.esc(user.name)} (<code>${id}</code>)\nÃ°Å¸â€œÂ¦ ${p.title}\nÃ°Å¸â€™Â³ ${ui.money(p.price)}`).catch(() => null);
    }
    return null;
  } catch (e) {
    user.balance += p.price;
    store.touch();
    return tg.send(id, 'Ã¢ÂÅ’ Ã˜Â³Ã˜Â§Ã˜Â®Ã˜Âª Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³ Ã™â€ Ã˜Â§Ã™â€¦Ã™Ë†Ã™ÂÃ™â€š Ã˜Â¨Ã™Ë†Ã˜Â¯Ã˜â€º Ã™â€¦Ã˜Â¨Ã™â€žÃ˜Âº Ã˜Â¨Ã™â€¡ ÃšÂ©Ã›Å’Ã™Â Ã™Â¾Ã™Ë†Ã™â€ž Ã˜Â¨Ã˜Â±ÃšÂ¯Ã˜Â´Ã˜Âª.\n<code>' + ui.esc(e.message) + '</code>', ui.kb([[ui.btn('Ã°Å¸â€Â Ã˜ÂªÃ™â€žÃ˜Â§Ã˜Â´ Ã˜Â¯Ã™Ë†Ã˜Â¨Ã˜Â§Ã˜Â±Ã™â€¡', 'buy')], [ui.btn('Ã¢ËœÅ½Ã¯Â¸Â Ã™Â¾Ã˜Â´Ã˜ÂªÃ›Å’Ã˜Â¨Ã˜Â§Ã™â€ Ã›Å’', 'support')]]));
  }
}
async function renewWithWallet(q, user, nxId, planId, mid) {
  const id = q.from.id;
  const p = store.planById(planId);
  if (!p) return show(id, mid, ui.renewMenu(nxId, store.data().plans));
  if (user.balance < p.price) {
    await tg.answer(q.id, 'Ã™â€¦Ã™Ë†Ã˜Â¬Ã™Ë†Ã˜Â¯Ã›Å’ ÃšÂ©Ã˜Â§Ã™ÂÃ›Å’ Ã™â€ Ã›Å’Ã˜Â³Ã˜Âª', true);
    return show(id, mid, ui.wallet(user));
  }
  user.balance -= p.price;
  store.touch();
  try {
    const upd = await nx.renew(nxId, { gb: p.gb, days: p.days });
    store.addOrder({ tgId: id, type: 'renew', planId: p.id, price: p.price, status: 'paid', nxUserId: nxId, note: p.title });
    const st = svcState(upd);
    let text = `${ui.L}\n  Ã¢Å“â€¦ <b>Ã˜ÂªÃ™â€¦Ã˜Â¯Ã›Å’Ã˜Â¯ Ã˜Â§Ã™â€ Ã˜Â¬Ã˜Â§Ã™â€¦ Ã˜Â´Ã˜Â¯</b>\n  ${ui.LN}\n\n  Ã°Å¸â€œÂ¦ ${p.title} Ã˜Â§Ã˜Â¶Ã˜Â§Ã™ÂÃ™â€¡ Ã˜Â´Ã˜Â¯\n`;
    text += `  Ã°Å¸â€œÅ  Ã˜Â­Ã˜Â¬Ã™â€¦ ÃšÂ©Ã™â€ž: ${nx.fmtGb(st.volume)}\n  Ã¢ÂÂ³ ${st.expired ? 'Ã¢â‚¬â€' : ui.gb(st.daysLeft) + ' Ã˜Â±Ã™Ë†Ã˜Â²'}\n  Ã°Å¸â€™Â° Ã™â€¦Ã™Ë†Ã˜Â¬Ã™Ë†Ã˜Â¯Ã›Å’: ${ui.money(user.balance)}\n\n`;
    text += `${ui.LN}  Ã°Å¸â€â€” Ã™â€žÃ›Å’Ã™â€ ÃšÂ© Ã˜Â§Ã˜Â´Ã˜ÂªÃ˜Â±Ã˜Â§ÃšÂ© Ã˜Â«Ã˜Â§Ã˜Â¨Ã˜Âª Ã˜Â§Ã˜Â³Ã˜ÂªÃ˜â€º Ã™ÂÃ™â€šÃ˜Â· Ã˜Â¯Ã˜Â± Ã˜Â§Ã™Â¾ Update ÃšÂ©Ã™â€ Ã›Å’Ã˜Â¯.\n${ui.L}`;
    return show(id, mid, { text, keyboard: ui.kb([[ui.btn('Ã°Å¸â€â€˜ Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³ Ã™â€¦Ã™â€ ', 'svc:' + nxId)], [ui.btn('Ã°Å¸ÂÂ  Ã™â€¦Ã™â€ Ã™Ë†', 'home')]]) });
  } catch (e) {
    user.balance += p.price;
    store.touch();
    return tg.send(id, 'Ã¢ÂÅ’ Ã˜ÂªÃ™â€¦Ã˜Â¯Ã›Å’Ã˜Â¯ Ã™â€ Ã˜Â§Ã™â€¦Ã™Ë†Ã™ÂÃ™â€š Ã˜Â¨Ã™Ë†Ã˜Â¯Ã˜â€º Ã™â€¦Ã˜Â¨Ã™â€žÃ˜Âº Ã˜Â¨Ã˜Â±ÃšÂ¯Ã˜Â´Ã˜Âª.\n<code>' + ui.esc(e.message) + '</code>');
  }
}

function ordersView(u) {
  const mine = Object.values(store.data().orders).filter(o => o.tgId === u.tgId).slice(-8).reverse();
  let text = `${ui.L}\n  Ã°Å¸â€œâ€˜ <b>Ã˜Â³Ã™ÂÃ˜Â§Ã˜Â±Ã˜Â´Ã¢â‚¬Å’Ã™â€¡Ã˜Â§Ã›Å’ Ã™â€¦Ã™â€ </b>\n  ${ui.LN}\n`;
  const rows = [];
  if (!mine.length) text += '\n  Ã¢â€žÂ¹Ã¯Â¸Â Ã™â€¡Ã™â€ Ã™Ë†Ã˜Â² Ã˜Â³Ã™ÂÃ˜Â§Ã˜Â±Ã˜Â´Ã›Å’ Ã˜Â«Ã˜Â¨Ã˜Âª Ã™â€ Ã˜Â´Ã˜Â¯Ã™â€¡.\n';
  for (const o of mine) {
    const st = o.status === 'paid' ? 'Ã¢Å“â€¦ Ã™Â¾Ã˜Â±Ã˜Â¯Ã˜Â§Ã˜Â®Ã˜ÂªÃ¢â‚¬Å’Ã˜Â´Ã˜Â¯Ã™â€¡' : (o.status === 'rejected' ? 'Ã¢ÂÅ’ Ã˜Â±Ã˜Â¯ Ã˜Â´Ã˜Â¯' : 'Ã¢ÂÂ³ Ã˜Â¯Ã˜Â± Ã˜Â§Ã™â€ Ã˜ÂªÃ˜Â¸Ã˜Â§Ã˜Â± Ã˜ÂªÃ˜Â£Ã›Å’Ã›Å’Ã˜Â¯');
    text += `\n  <b>#${o.id}</b> Ã¢â‚¬â€ ${ui.esc(o.note || o.type)}\n  Ã°Å¸â€™Â³ ${ui.money(o.price)}\n  ${st}\n`;
    rows.push([ui.btn(`#${o.id} Ã‚Â· ${st}`, 'order:' + o.id)]);
  }
  text += `\n${ui.L}`;
  rows.push([ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'home')]);
  return { text, keyboard: ui.kb(rows) };
}

function orderView(o) {
  if (!o) return { text: 'Ã¢ÂÅ’ Ã˜Â³Ã™ÂÃ˜Â§Ã˜Â±Ã˜Â´ Ã™Â¾Ã›Å’Ã˜Â¯Ã˜Â§ Ã™â€ Ã˜Â´Ã˜Â¯.', keyboard: ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'orders')]]) };
  const st = o.status === 'paid' ? 'Ã¢Å“â€¦ Ã™Â¾Ã˜Â±Ã˜Â¯Ã˜Â§Ã˜Â®Ã˜ÂªÃ¢â‚¬Å’Ã˜Â´Ã˜Â¯Ã™â€¡' : (o.status === 'rejected' ? 'Ã¢ÂÅ’ Ã˜Â±Ã˜Â¯ Ã˜Â´Ã˜Â¯Ã™â€¡' : 'Ã¢ÂÂ³ Ã˜Â¯Ã˜Â± Ã˜Â§Ã™â€ Ã˜ÂªÃ˜Â¸Ã˜Â§Ã˜Â± Ã˜ÂªÃ˜Â£Ã›Å’Ã›Å’Ã˜Â¯ Ã™Â¾Ã˜Â´Ã˜ÂªÃ›Å’Ã˜Â¨Ã˜Â§Ã™â€ Ã›Å’');
  let text = `${ui.L}\n  Ã°Å¸Â§Â¾ <b>Ã˜Â³Ã™ÂÃ˜Â§Ã˜Â±Ã˜Â´ #${o.id}</b>\n  ${ui.LN}\n\n  Ã°Å¸â€œÂ¦ Ã™â€ Ã™Ë†Ã˜Â¹: ${ui.esc(o.note || o.type)}\n  Ã°Å¸â€™Â³ Ã™â€¦Ã˜Â¨Ã™â€žÃ˜Âº: ${ui.money(o.price)}\n  Ã°Å¸â€œâ€¦ Ã˜ÂªÃ˜Â§Ã˜Â±Ã›Å’Ã˜Â®: ${new Date(o.createdAt).toLocaleString('fa-IR')}\n  ${st}\n`;
  if (o.receipt) text += `  Ã°Å¸Â§Â¾ Ã˜Â±Ã˜Â³Ã›Å’Ã˜Â¯: <code>${ui.esc(o.receipt)}</code>\n`;
  text += `${ui.L}`;
  return { text, keyboard: ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'orders')]]) };
}

async function onReceiptSubmit(msg, u, s) {
  const id = msg.from.id;
  const text = (msg.text || '').trim();
  if (s.step === 'receipt' && !s.data.amount) {
    const amount = Number(text.replace(/[^0-9]/g, ''));
    if (!amount || amount < 10000) {
      return tg.send(id, 'Ã¢Å¡Â Ã¯Â¸Â Ã™â€¦Ã˜Â¨Ã™â€žÃ˜Âº Ã™â€¦Ã˜Â¹Ã˜ÂªÃ˜Â¨Ã˜Â± Ã™â€ Ã›Å’Ã˜Â³Ã˜Âª. Ã˜Â¹Ã˜Â¯Ã˜Â¯Ã›Å’ Ã™â€¦Ã˜Â«Ã™â€ž <code>100000</code> Ã˜Â¨Ã™ÂÃ˜Â±Ã˜Â³Ã˜ÂªÃ›Å’Ã˜Â¯.', ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'wallet')]]));
    }
    s.data.amount = amount;
    return tg.send(id, `Ã°Å¸â€™Âµ Ã™â€¦Ã˜Â¨Ã™â€žÃ˜Âº: <b>${ui.money(amount)}</b>\nÃ˜Â­Ã˜Â§Ã™â€žÃ˜Â§ <b>Ã˜ÂªÃ˜ÂµÃ™Ë†Ã›Å’Ã˜Â± Ã˜Â±Ã˜Â³Ã›Å’Ã˜Â¯</b> Ã›Å’Ã˜Â§ ÃšÂ©Ã˜Â¯ Ã™Â¾Ã›Å’ÃšÂ¯Ã›Å’Ã˜Â±Ã›Å’ Ã˜Â±Ã˜Â§ Ã˜Â¨Ã™ÂÃ˜Â±Ã˜Â³Ã˜ÂªÃ›Å’Ã˜Â¯.`, ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'wallet')]]));
  }
  const receipt = msg.photo ? msg.photo[msg.photo.length - 1].file_id : text;
  const o = store.addOrder({ tgId: id, type: 'topup', price: s.data.amount, status: 'pending', receipt });
  s.step = null;
  s.data = {};
  await tg.send(id, `Ã°Å¸â€œÂ® Ã˜Â±Ã˜Â³Ã›Å’Ã˜Â¯ Ã˜Â«Ã˜Â¨Ã˜Âª Ã˜Â´Ã˜Â¯.\n${ui.LN}\nÃ°Å¸â€ â€ Ã˜Â³Ã™ÂÃ˜Â§Ã˜Â±Ã˜Â´: <code>${o.id}</code>\nÃ°Å¸â€™Â° ${ui.money(o.price)}\nÃ¢ÂÂ³ Ã™Â¾Ã˜Â³ Ã˜Â§Ã˜Â² Ã˜ÂªÃ˜Â£Ã›Å’Ã›Å’Ã˜Â¯Ã˜Å’ Ã™â€¦Ã™Ë†Ã˜Â¬Ã™Ë†Ã˜Â¯Ã›Å’ Ã˜Â§Ã˜Â¶Ã˜Â§Ã™ÂÃ™â€¡ Ã™â€¦Ã›Å’Ã¢â‚¬Å’Ã˜Â´Ã™Ë†Ã˜Â¯.`, ui.kb([[ui.btn('Ã°Å¸â€œâ€˜ Ã˜Â³Ã™ÂÃ˜Â§Ã˜Â±Ã˜Â´Ã¢â‚¬Å’Ã™â€¡Ã˜Â§Ã›Å’ Ã™â€¦Ã™â€ ', 'orders')], [ui.btn('Ã°Å¸ÂÂ  Ã™â€¦Ã™â€ Ã™Ë†', 'home')]]));
  for (const a of config.adminIds) {
    const t = `Ã°Å¸â€™Â³ <b>Ã˜Â±Ã˜Â³Ã›Å’Ã˜Â¯ Ã˜Â¬Ã˜Â¯Ã›Å’Ã˜Â¯</b> #${o.id}\nÃ°Å¸â€˜Â¤ ${ui.esc(u.name)} (<code>${id}</code>)\nÃ°Å¸â€™Â° ${ui.money(o.price)}`;
    await tg.send(a, t, ui.kb([[ui.btn('Ã¢Å“â€¦ Ã˜ÂªÃ˜Â£Ã›Å’Ã›Å’Ã˜Â¯', 'adm:ok:' + o.id), ui.btn('Ã¢ÂÅ’ Ã˜Â±Ã˜Â¯', 'adm:no:' + o.id)]]));
    if (msg.photo) await tg.copyMessage(a, msg.chat.id, msg.message_id);
  }
  return null;
}
function adminView() {
  const d = store.data();
  const users = store.usersList();
  const pend = store.pendingOrders();
  const paid = Object.values(d.orders).filter(o => o.status === 'paid').length;
  let text = `${ui.L}\n  Ã°Å¸â€ºÂ¡ <b>Ã™Â¾Ã™â€ Ã™â€ž Ã™â€¦Ã˜Â¯Ã›Å’Ã˜Â±Ã›Å’Ã˜Âª</b>\n  ${ui.LN}\n\n`;
  text += `  Ã°Å¸â€˜Â¥ ÃšÂ©Ã˜Â§Ã˜Â±Ã˜Â¨Ã˜Â±Ã˜Â§Ã™â€ : <b>${ui.gb(users.length)}</b>\n  Ã°Å¸â€œÂ¦ Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³ Ã™ÂÃ˜Â¹Ã˜Â§Ã™â€ž: <b>${ui.gb(users.filter(u => u.nxUserId).length)}</b>\n`;
  text += `  Ã°Å¸Â§Â¾ Ã˜Â³Ã™ÂÃ˜Â§Ã˜Â±Ã˜Â´ Ã™Â¾Ã˜Â±Ã˜Â¯Ã˜Â§Ã˜Â®Ã˜ÂªÃ¢â‚¬Å’Ã˜Â´Ã˜Â¯Ã™â€¡: <b>${ui.gb(paid)}</b>\n  Ã¢ÂÂ³ Ã˜Â¯Ã˜Â± Ã˜Â§Ã™â€ Ã˜ÂªÃ˜Â¸Ã˜Â§Ã˜Â±: <b>${ui.gb(pend.length)}</b>\n`;
  text += `  Ã°Å¸â€™Â° Ã˜ÂªÃ™â€ Ã˜Â¸Ã›Å’Ã™â€¦Ã˜Â§Ã˜Âª: ÃšÂ©Ã˜Â§Ã˜Â±Ã˜Âª <code>${ui.esc(d.settings.card)}</code>\n  Ã°Å¸â€ºÂ  Ã˜ÂªÃ˜Â¹Ã™â€¦Ã›Å’Ã˜Â±Ã˜Â§Ã˜Âª: ${d.settings.maintenance ? 'Ã˜Â±Ã™Ë†Ã˜Â´Ã™â€ ' : 'Ã˜Â®Ã˜Â§Ã™â€¦Ã™Ë†Ã˜Â´'}\n${ui.L}`;
  return { text, keyboard: ui.kb([
    [ui.btn('Ã¢ÂÂ³ Ã˜Â±Ã˜Â³Ã›Å’Ã˜Â¯Ã™â€¡Ã˜Â§Ã›Å’ Ã˜Â¯Ã˜Â± Ã˜Â§Ã™â€ Ã˜ÂªÃ˜Â¸Ã˜Â§Ã˜Â±', 'adm:pend')],
    [ui.btn('Ã°Å¸â€˜Â¥ ÃšÂ©Ã˜Â§Ã˜Â±Ã˜Â¨Ã˜Â±Ã˜Â§Ã™â€ ', 'adm:users'), ui.btn('Ã°Å¸â€œÅ  Ã˜Â¢Ã™â€¦Ã˜Â§Ã˜Â±', 'adm:stats')],
    [ui.btn('Ã°Å¸â€œÂ£ Ã™Â¾Ã›Å’Ã˜Â§Ã™â€¦ Ã™â€¡Ã™â€¦ÃšÂ¯Ã˜Â§Ã™â€ Ã›Å’', 'adm:bcast')],
    [ui.btn('Ã°Å¸â€™Â³ Ã˜Â´Ã™â€¦Ã˜Â§Ã˜Â±Ã™â€¡ ÃšÂ©Ã˜Â§Ã˜Â±Ã˜Âª', 'adm:set:card'), ui.btn('Ã°Å¸â€˜Â¤ Ã™â€ Ã˜Â§Ã™â€¦ ÃšÂ©Ã˜Â§Ã˜Â±Ã˜Âª', 'adm:set:name')],
    [ui.btn('Ã¢ËœÅ½Ã¯Â¸Â Ã˜Â¢Ã›Å’Ã¢â‚¬Å’Ã˜Â¯Ã›Å’ Ã™Â¾Ã˜Â´Ã˜ÂªÃ›Å’Ã˜Â¨Ã˜Â§Ã™â€ Ã›Å’', 'adm:set:support'), ui.btn('Ã°Å¸Å½Â Ã™â€¡Ã˜Â¯Ã›Å’Ã™â€¡ Ã˜Â¯Ã˜Â¹Ã™Ë†Ã˜Âª', 'adm:set:bonus')],
    [ui.btn('Ã°Å¸â€ºÂ  Ã˜ÂªÃ˜Â¹Ã™â€¦Ã›Å’Ã˜Â±Ã˜Â§Ã˜Âª', 'adm:maint'), ui.btn('Ã°Å¸ÂÂ  Ã™â€¦Ã™â€ Ã™Ë†', 'home')],
  ]) };
}

async function adminCallback(q, u, data, mid) {
  const id = q.from.id;
  if (!isAdmin(id)) return show(id, mid, ui.home(u));
  const parts = data.split(':');
  const op = parts[1];
  const s = sec(id);

  if (data === 'adm') return show(id, mid, adminView());
  if (op === 'pend') {
    const pend = store.pendingOrders();
    if (!pend.length) return show(id, mid, { text: 'Ã¢Å“â€¦ Ã˜Â±Ã˜Â³Ã›Å’Ã˜Â¯ Ã˜Â¯Ã˜Â± Ã˜Â§Ã™â€ Ã˜ÂªÃ˜Â¸Ã˜Â§Ã˜Â± Ã™â€ Ã›Å’Ã˜Â³Ã˜Âª.', keyboard: ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'adm')]]) });
    await show(id, mid, { text: `Ã¢ÂÂ³ ${ui.gb(pend.length)} Ã˜Â±Ã˜Â³Ã›Å’Ã˜Â¯ Ã˜Â¯Ã˜Â± Ã˜Â§Ã™â€ Ã˜ÂªÃ˜Â¸Ã˜Â§Ã˜Â± Ã˜Â¨Ã˜Â±Ã˜Â±Ã˜Â³Ã›Å’ Ã˜Â§Ã˜Â³Ã˜Âª.`, keyboard: ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'adm')]]) });
    for (const o of pend.slice(-10)) {
      const buyer = store.data().users[String(o.tgId)] || {};
      const t = `Ã°Å¸Â§Â¾ <b>#${o.id}</b> Ã‚Â· ${o.type === 'topup' ? 'Ã˜Â´Ã˜Â§Ã˜Â±ÃšËœ' : (o.note || o.type)}\nÃ°Å¸â€˜Â¤ ${ui.esc(buyer.name || '?')} (<code>${o.tgId}</code>)\nÃ°Å¸â€™Â° ${ui.money(o.price)}`;
      await tg.send(id, t, ui.kb([[ui.btn('Ã¢Å“â€¦ Ã˜ÂªÃ˜Â£Ã›Å’Ã›Å’Ã˜Â¯', 'adm:ok:' + o.id), ui.btn('Ã¢ÂÅ’ Ã˜Â±Ã˜Â¯', 'adm:no:' + o.id)]]));
      if (o.receipt && String(o.receipt).length > 30) await tg.call('sendPhoto', { chat_id: id, photo: o.receipt, caption: 'Ã˜Â±Ã˜Â³Ã›Å’Ã˜Â¯ #' + o.id }).catch(() => null);
    }
    return null;
  }
  if (op === 'ok' || op === 'no') {
    const o = store.getOrder(parts[2]);
    if (!o || o.status !== 'pending') return tg.answer(q.id, 'Ã˜Â§Ã›Å’Ã™â€  Ã˜Â³Ã™ÂÃ˜Â§Ã˜Â±Ã˜Â´ Ã™â€šÃ˜Â¨Ã™â€žÃ˜Â§Ã™â€¹ Ã˜Â¨Ã˜Â±Ã˜Â±Ã˜Â³Ã›Å’ Ã˜Â´Ã˜Â¯Ã™â€¡', true);
    if (op === 'no') {
      store.setOrder(o.id, { status: 'rejected' });
      await tg.send(o.tgId, `Ã¢ÂÅ’ Ã˜Â±Ã˜Â³Ã›Å’Ã˜Â¯ Ã˜Â³Ã™ÂÃ˜Â§Ã˜Â±Ã˜Â´ <code>${o.id}</code> Ã˜Â±Ã˜Â¯ Ã˜Â´Ã˜Â¯.\nÃ˜Â¨Ã˜Â±Ã˜Â§Ã›Å’ Ã™Â¾Ã›Å’ÃšÂ¯Ã›Å’Ã˜Â±Ã›Å’ Ã˜Â¨Ã˜Â§ Ã™Â¾Ã˜Â´Ã˜ÂªÃ›Å’Ã˜Â¨Ã˜Â§Ã™â€ Ã›Å’ Ã˜ÂªÃ™â€¦Ã˜Â§Ã˜Â³ Ã˜Â¨ÃšÂ¯Ã›Å’Ã˜Â±Ã›Å’Ã˜Â¯.`, ui.kb([[ui.btn('Ã¢ËœÅ½Ã¯Â¸Â Ã™Â¾Ã˜Â´Ã˜ÂªÃ›Å’Ã˜Â¨Ã˜Â§Ã™â€ Ã›Å’', 'support')]]));
      return show(id, mid, { text: `Ã¢ÂÅ’ Ã˜Â³Ã™ÂÃ˜Â§Ã˜Â±Ã˜Â´ #${o.id} Ã˜Â±Ã˜Â¯ Ã˜Â´Ã˜Â¯.`, keyboard: ui.kb([[ui.btn('Ã¢ÂÂ³ Ã™â€žÃ›Å’Ã˜Â³Ã˜Âª', 'adm:pend'), ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã™Â¾Ã™â€ Ã™â€ž', 'adm')]]) });
    }
    store.setOrder(o.id, { status: 'paid' });
    const buyer = store.getUser(o.tgId, {});
    buyer.balance += Number(o.price || 0);
    store.data().stats.revenue += Number(o.price || 0);
    store.data().stats.paid += 1;
    store.touch();
    if (buyer.refBy && !buyer.refPaid) {
      buyer.refPaid = true;
      const ref = store.data().users[String(buyer.refBy)];
      if (ref) { ref.balance += Number(S().refBonus || 0); ref.refCount = (ref.refCount || 0) + 1; store.touch();
        tg.send(ref.tgId, `Ã°Å¸Å½Â Ã™â€¡Ã˜Â¯Ã›Å’Ã™â€¡ Ã˜Â¯Ã˜Â¹Ã™Ë†Ã˜Âª: ${ui.money(S().refBonus)} Ã˜Â¨Ã™â€¡ ÃšÂ©Ã›Å’Ã™Â Ã™Â¾Ã™Ë†Ã™â€ž Ã˜Â´Ã™â€¦Ã˜Â§ Ã˜Â§Ã˜Â¶Ã˜Â§Ã™ÂÃ™â€¡ Ã˜Â´Ã˜Â¯.`).catch(() => null); }
    }
    await tg.send(buyer.tgId, `Ã¢Å“â€¦ Ã˜Â±Ã˜Â³Ã›Å’Ã˜Â¯ Ã˜Â´Ã™â€¦Ã˜Â§ Ã˜ÂªÃ˜Â£Ã›Å’Ã›Å’Ã˜Â¯ Ã˜Â´Ã˜Â¯.\nÃ°Å¸â€™Â° Ã™â€¦Ã™Ë†Ã˜Â¬Ã™Ë†Ã˜Â¯Ã›Å’: <b>${ui.money(buyer.balance)}</b>`, ui.kb([[ui.btn('Ã°Å¸Å¡â‚¬ Ã˜Â®Ã˜Â±Ã›Å’Ã˜Â¯ Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³', 'buy')], [ui.btn('Ã°Å¸ÂÂ  Ã™â€¦Ã™â€ Ã™Ë†', 'home')]]));
    return show(id, mid, { text: `Ã¢Å“â€¦ Ã˜Â³Ã™ÂÃ˜Â§Ã˜Â±Ã˜Â´ #${o.id} Ã˜ÂªÃ˜Â£Ã›Å’Ã›Å’Ã˜Â¯ Ã™Ë† ÃšÂ©Ã›Å’Ã™Â Ã™Â¾Ã™Ë†Ã™â€ž Ã˜Â´Ã˜Â§Ã˜Â±ÃšËœ Ã˜Â´Ã˜Â¯.`, keyboard: ui.kb([[ui.btn('Ã¢ÂÂ³ Ã™â€žÃ›Å’Ã˜Â³Ã˜Âª', 'adm:pend'), ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã™Â¾Ã™â€ Ã™â€ž', 'adm')]]) });
  }
  if (op === 'stats') {
    const d = store.data();
    const t = `Ã°Å¸â€œÅ  <b>Ã˜Â¢Ã™â€¦Ã˜Â§Ã˜Â±</b>\n${ui.LN}\nÃ°Å¸â€˜Â¥ ÃšÂ©Ã˜Â§Ã˜Â±Ã˜Â¨Ã˜Â±: ${ui.gb(store.usersList().length)}\nÃ°Å¸Â§Â¾ Ã˜Â³Ã™ÂÃ˜Â§Ã˜Â±Ã˜Â´: ${ui.gb(Object.keys(d.orders).length)}\nÃ°Å¸â€™Â° Ã˜Â¯Ã˜Â±Ã˜Â¢Ã™â€¦Ã˜Â¯: ${ui.money(d.stats.revenue)}\nÃ°Å¸â€ â€¢ Ã˜Â§Ã˜Â³Ã˜ÂªÃ˜Â§Ã˜Â±Ã˜Âª: ${ui.gb(d.stats.started)}\n${ui.L}`;
    return show(id, mid, { text: t, keyboard: ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'adm')]]) });
  }
  if (op === 'users') {
    const list = store.usersList().slice(-15).reverse();
    let t = `Ã°Å¸â€˜Â¥ <b>Ã˜Â¢Ã˜Â®Ã˜Â±Ã›Å’Ã™â€  ÃšÂ©Ã˜Â§Ã˜Â±Ã˜Â¨Ã˜Â±Ã˜Â§Ã™â€ </b>\n${ui.LN}\n`;
    const rows = [];
    for (const x of list) {
      t += `\nÃ°Å¸â€˜Â¤ ${ui.esc(x.name || '?')} <code>${x.tgId}</code>${x.nxUserId ? ' Ã°Å¸Å¸Â¢' : ''} Ã¢â‚¬â€ ${ui.money(x.balance)}\n`;
      rows.push([ui.btn(`${x.name || x.tgId} Ã‚Â· ${ui.money(x.balance)}`, 'adm:u:' + x.tgId)]);
    }
    rows.push([ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'adm')]);
    return show(id, mid, { text: t + ui.L, keyboard: ui.kb(rows) });
  }
  if (op === 'u') {
    const x = store.data().users[String(parts[2])];
    if (!x) return show(id, mid, { text: 'Ã¢ÂÅ’ ÃšÂ©Ã˜Â§Ã˜Â±Ã˜Â¨Ã˜Â± Ã™â€ Ã›Å’Ã˜Â³Ã˜Âª.', keyboard: ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'adm:users')]]) });
    let t = `Ã°Å¸â€˜Â¤ <b>${ui.esc(x.name || '?')}</b>\n${ui.LN}\nÃ°Å¸â€ â€ <code>${x.tgId}</code>\nÃ°Å¸â€™Â³ Ã™â€¦Ã™Ë†Ã˜Â¬Ã™Ë†Ã˜Â¯Ã›Å’: ${ui.money(x.balance)}\nÃ°Å¸â€œÂ¦ Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³: ${x.nxUserId ? '#' + x.nxUserId : 'Ã™â€ Ã˜Â¯Ã˜Â§Ã˜Â±Ã˜Â¯'}\nÃ°Å¸â€˜Â¥ Ã˜Â¯Ã˜Â¹Ã™Ë†Ã˜Âª: ${x.refCount || 0}\n`;
    return show(id, mid, { text: t + ui.L, keyboard: ui.kb([
      [ui.btn('Ã°Å¸â€™Â° +Ã›Â±Ã›Â°Ã›Â° Ã™â€¡Ã˜Â²Ã˜Â§Ã˜Â±', 'adm:bal:' + x.tgId + ':100000'), ui.btn('Ã°Å¸â€™Â° +Ã›ÂµÃ›Â° Ã™â€¡Ã˜Â²Ã˜Â§Ã˜Â±', 'adm:bal:' + x.tgId + ':50000')],
      [ui.btn('Ã°Å¸Å½Â Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³ Ã™â€¡Ã˜Â¯Ã›Å’Ã™â€¡', 'adm:gift:' + x.tgId)],
      [ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'adm:users')],
    ]) });
  }
  if (op === 'bal') {
    const x = store.data().users[String(parts[2])];
    if (x) { x.balance += Number(parts[3]); store.touch(); tg.send(x.tgId, `Ã°Å¸â€™Â° ${ui.money(parts[3])} Ã˜Â¨Ã™â€¡ ÃšÂ©Ã›Å’Ã™Â Ã™Â¾Ã™Ë†Ã™â€ž Ã˜Â´Ã™â€¦Ã˜Â§ Ã˜Â§Ã˜Â¶Ã˜Â§Ã™ÂÃ™â€¡ Ã˜Â´Ã˜Â¯.`).catch(() => null); }
    return tg.answer(q.id, 'Ã˜Â§Ã™â€ Ã˜Â¬Ã˜Â§Ã™â€¦ Ã˜Â´Ã˜Â¯', true);
  }
  if (op === 'gift') {
    const x = store.data().users[String(parts[2])];
    if (!x) return tg.answer(q.id, 'ÃšÂ©Ã˜Â§Ã˜Â±Ã˜Â¨Ã˜Â± Ã™â€ Ã›Å’Ã˜Â³Ã˜Âª', true);
    try {
      const p = store.data().plans[0];
      const created = await nx.createUser({ name: 'tg' + x.tgId, gb: p.gb, days: p.days, remark: 'gift:' + x.tgId });
      x.nxUserId = created.id; store.touch();
      await tg.send(x.tgId, `Ã°Å¸Å½Â Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³ Ã™â€¡Ã˜Â¯Ã›Å’Ã™â€¡ Ã™ÂÃ˜Â¹Ã˜Â§Ã™â€ž Ã˜Â´Ã˜Â¯!\nÃ°Å¸â€â€” <code>${ui.esc(created.subUrlPretty)}</code>`, ui.kb([[ui.btn('Ã°Å¸â€â€˜ Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³Ã¢â‚¬Å’Ã™â€¡Ã˜Â§Ã›Å’ Ã™â€¦Ã™â€ ', 'my')]]));
      return tg.answer(q.id, 'Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³ Ã™â€¡Ã˜Â¯Ã›Å’Ã™â€¡ Ã˜Â³Ã˜Â§Ã˜Â®Ã˜ÂªÃ™â€¡ Ã˜Â´Ã˜Â¯', true);
    } catch (e) { return tg.answer(q.id, 'Ã˜Â®Ã˜Â·Ã˜Â§: ' + e.message, true); }
  }
  if (op === 'maint') {
    store.updateSettings({ maintenance: !S().maintenance });
    return show(id, mid, adminView());
  }
  if (op === 'bcast') { s.step = 'adm:bcast'; return show(id, mid, { text: 'Ã°Å¸â€œÂ£ Ã™â€¦Ã˜ÂªÃ™â€  Ã™Â¾Ã›Å’Ã˜Â§Ã™â€¦ Ã™â€¡Ã™â€¦ÃšÂ¯Ã˜Â§Ã™â€ Ã›Å’ Ã˜Â±Ã˜Â§ Ã˜Â¨Ã™ÂÃ˜Â±Ã˜Â³Ã˜ÂªÃ›Å’Ã˜Â¯.', keyboard: ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'adm')]]) }); }
  if (op === 'set') {
    s.step = 'adm:set:' + parts[2];
    const labels = { card: 'Ã˜Â´Ã™â€¦Ã˜Â§Ã˜Â±Ã™â€¡ ÃšÂ©Ã˜Â§Ã˜Â±Ã˜Âª', name: 'Ã™â€ Ã˜Â§Ã™â€¦ Ã˜ÂµÃ˜Â§Ã˜Â­Ã˜Â¨ ÃšÂ©Ã˜Â§Ã˜Â±Ã˜Âª', support: 'Ã˜Â¢Ã›Å’Ã¢â‚¬Å’Ã˜Â¯Ã›Å’ Ã™Â¾Ã˜Â´Ã˜ÂªÃ›Å’Ã˜Â¨Ã˜Â§Ã™â€ Ã›Å’', bonus: 'Ã™â€¦Ã˜Â¨Ã™â€žÃ˜Âº Ã™â€¡Ã˜Â¯Ã›Å’Ã™â€¡ Ã˜Â¯Ã˜Â¹Ã™Ë†Ã˜Âª (Ã˜ÂªÃ™Ë†Ã™â€¦Ã˜Â§Ã™â€ )' };
    return show(id, mid, { text: `Ã¢Å“ÂÃ¯Â¸Â Ã™â€¦Ã™â€šÃ˜Â¯Ã˜Â§Ã˜Â± Ã˜Â¬Ã˜Â¯Ã›Å’Ã˜Â¯ Ã‚Â«${labels[parts[2]] || parts[2]}Ã‚Â» Ã˜Â±Ã˜Â§ Ã˜Â¨Ã™ÂÃ˜Â±Ã˜Â³Ã˜ÂªÃ›Å’Ã˜Â¯.`, keyboard: ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã˜Â¨Ã˜Â§Ã˜Â²ÃšÂ¯Ã˜Â´Ã˜Âª', 'adm')]]) });
  }
  return show(id, mid, adminView());
}
async function onAdminInput(msg, u, s, text) {
  const id = msg.from.id;
  const step = s.step;
  s.step = null;
  if (step === 'adm:bcast') {
    const list = store.usersList();
    let ok = 0;
    for (const x of list) {
      try { await tg.send(x.tgId, `Ã°Å¸â€œÂ£ <b>Ã˜Â§Ã˜Â·Ã™â€žÃ˜Â§Ã˜Â¹Ã›Å’Ã™â€¡</b>\n${ui.LN}\n${ui.esc(text)}`, ui.kb([[ui.btn('Ã°Å¸ÂÂ  Ã™â€¦Ã™â€ Ã™Ë†', 'home')]])); ok++; } catch (e) {}
    }
    return tg.send(id, `Ã°Å¸â€œÂ£ Ã˜Â¨Ã˜Â±Ã˜Â§Ã›Å’ ${ui.gb(ok)} ÃšÂ©Ã˜Â§Ã˜Â±Ã˜Â¨Ã˜Â± Ã˜Â§Ã˜Â±Ã˜Â³Ã˜Â§Ã™â€ž Ã˜Â´Ã˜Â¯.`, ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã™Â¾Ã™â€ Ã™â€ž', 'adm')]]));
  }
  if (step.startsWith('adm:set:')) {
    const key = step.split(':')[2];
    const patch = {};
    if (key === 'card') patch.card = text;
    else if (key === 'name') patch.cardName = text;
    else if (key === 'support') patch.support = text;
    else if (key === 'bonus') patch.refBonus = Number(text.replace(/[^0-9]/g, '')) || 0;
    store.updateSettings(patch);
    return tg.send(id, 'Ã¢Å“â€¦ Ã˜Â°Ã˜Â®Ã›Å’Ã˜Â±Ã™â€¡ Ã˜Â´Ã˜Â¯.\n' + JSON.stringify(patch), ui.kb([[ui.btn('Ã¢â€”â‚¬Ã¯Â¸Â Ã™Â¾Ã™â€ Ã™â€ž', 'adm')]]));
  }
  return tg.send(id, 'Ã¢Å¡Â Ã¯Â¸Â Ã™â€ Ã˜Â§Ã™â€¦Ã˜Â´Ã˜Â®Ã˜Âµ.', ui.kb([[ui.btn('Ã°Å¸ÂÂ  Ã™â€¦Ã™â€ Ã™Ë†', 'home')]]));
}

/* ---------- Ã›Å’Ã˜Â§Ã˜Â¯Ã˜Â¢Ã™Ë†Ã˜Â±Ã›Å’ Ã˜Â®Ã™Ë†Ã˜Â¯ÃšÂ©Ã˜Â§Ã˜Â± Ã˜Â§Ã™â€ Ã™â€šÃ˜Â¶Ã˜Â§ ---------- */

async function notifyExpiring() {
  const today = new Date().toISOString().slice(0, 10);
  for (const x of store.usersList()) {
    if (!x.nxUserId || x.lastNotify === today) continue;
    try {
      const p = await nx.getUser(x.nxUserId);
      const st = svcState(p);
      const near = !st.expired && st.daysLeft <= 3;
      if (!st.expired && !near) continue;
      const msgT = st.expired
        ? `Ã¢â€ºâ€Ã¯Â¸Â <b>Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³ Ã˜Â´Ã™â€¦Ã˜Â§ Ã™â€¦Ã™â€ Ã™â€šÃ˜Â¶Ã›Å’ Ã˜Â´Ã˜Â¯</b>\n${ui.LN}\nÃ˜Â¨Ã˜Â±Ã˜Â§Ã›Å’ Ã˜Â§Ã˜Â¯Ã˜Â§Ã™â€¦Ã™â€¡ Ã˜Â§Ã˜ÂªÃ˜ÂµÃ˜Â§Ã™â€žÃ˜Å’ Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³ Ã˜Â±Ã˜Â§ Ã˜ÂªÃ™â€¦Ã˜Â¯Ã›Å’Ã˜Â¯ ÃšÂ©Ã™â€ Ã›Å’Ã˜Â¯.`
        : `Ã¢ÂÂ³ <b>${ui.gb(st.daysLeft)} Ã˜Â±Ã™Ë†Ã˜Â² Ã˜ÂªÃ˜Â§ Ã™Â¾Ã˜Â§Ã›Å’Ã˜Â§Ã™â€  Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³</b>\n${ui.LN}\nÃ™â€¡Ã™â€¦Ã›Å’Ã™â€  Ã˜Â­Ã˜Â§Ã™â€žÃ˜Â§ Ã˜ÂªÃ™â€¦Ã˜Â¯Ã›Å’Ã˜Â¯ ÃšÂ©Ã™â€ Ã›Å’Ã˜Â¯ Ã˜ÂªÃ˜Â§ Ã™â€šÃ˜Â·Ã˜Â¹ Ã™â€ Ã˜Â´Ã™Ë†Ã›Å’Ã˜Â¯.`;
      await tg.send(x.tgId, msgT, ui.kb([[ui.btn('Ã°Å¸â€â€ž Ã˜ÂªÃ™â€¦Ã˜Â¯Ã›Å’Ã˜Â¯ Ã˜Â³Ã˜Â±Ã™Ë†Ã›Å’Ã˜Â³', 'renew:' + x.nxUserId)], [ui.btn('Ã°Å¸ÂÂ  Ã™â€¦Ã™â€ Ã™Ë†', 'home')]]));
      x.lastNotify = today;
      store.touch();
    } catch (e) { /* ignore */ }
  }
}