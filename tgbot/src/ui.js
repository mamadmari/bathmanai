'use strict';

/** Ø±Ø§Ø¨Ø· Ú©Ø§Ø±Ø¨Ø±ÛŒ: Ù…ØªÙ†â€ŒÙ‡Ø§ Ùˆ Ú©ÛŒØ¨ÙˆØ±Ø¯Ù‡Ø§ÛŒ Ø´ÛŒØ´Ù‡â€ŒØ§ÛŒ */

const { config } = require('./config');
const nx = require('./nx');
const store = require('./store');

const L = 'â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€';
const LN = 'â”ˆâ”ˆâ”ˆâ”ˆâ”ˆâ”ˆâ”ˆâ”ˆâ”ˆâ”ˆâ”ˆâ”ˆâ”ˆâ”ˆâ”ˆ';

function money(n) { return Number(n || 0).toLocaleString('fa-IR') + ' ØªÙˆÙ…Ø§Ù†'; }
function gb(n) { return Number(n || 0).toLocaleString('fa-IR'); }

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function kb(rows) { return { inline_keyboard: rows }; }
function btn(text, data) { return { text, callback_data: data }; }
function urlBtn(text, url) { return { text, url }; }

const E = {
  rocket: 'ðŸš€', box: 'ðŸ“¦', key: 'ðŸ”‘', chart: 'ðŸ“Š', gift: 'ðŸŽ', book: 'ðŸŽ“',
  phone: 'â˜Žï¸', info: 'â„¹ï¸', shield: 'ðŸ›¡', back: 'â—€ï¸', home: 'ðŸ ', check: 'âœ…',
  cross: 'âŒ', clock: 'â³', card: 'ðŸ’³', money: 'ðŸ’°', star: 'â­ï¸', bolt: 'âš¡ï¸',
  lock: 'ðŸ”', refresh: 'ðŸ”„', users: 'ðŸ‘¥', plus: 'âž•', send: 'ðŸ“®', copy: 'ðŸ“‹',
};

function home(u) {
  const name = esc(u.name || 'Ø¯ÙˆØ³Øª');
  const text =
    `${L}\n` +
    `  ðŸ›° <b>Ø³Ø±ÙˆÛŒØ³ Ø§ØªØµØ§Ù„ Ø§Ù…Ù†</b>\n` +
    `  ${LN}\n` +
    `  Ø³Ù„Ø§Ù… <b>${name}</b> ðŸ‘‹\n\n` +
    `  Ø§ÛŒÙ†Ø¬Ø§ Ù…ÛŒâ€ŒØªÙˆÙ†ÛŒ Ø¨Ø¯ÙˆÙ† Ø¯Ø±Ø¯Ø³Ø±ØŒ Ø§ØªØµØ§Ù„ Ù¾Ø±Ø³Ø±Ø¹Øª Ùˆ Ù¾Ø§ÛŒØ¯Ø§Ø±\n` +
    `  Ø®ÙˆØ¯Øª Ø±Ùˆ Ø¯Ø± Ú†Ù†Ø¯ Ø«Ø§Ù†ÛŒÙ‡ ÙØ¹Ø§Ù„ Ú©Ù†ÛŒ.\n\n` +
    `  ${E.bolt} ÙØ¹Ø§Ù„â€ŒØ³Ø§Ø²ÛŒ Ø®ÙˆØ¯Ú©Ø§Ø± Ùˆ Ù„Ø­Ø¸Ù‡â€ŒØ§ÛŒ\n` +
    `  ${E.lock} Ú†Ù†Ø¯ Ù¾Ø±ÙˆØªÚ©Ù„ Ùˆ Ø§ØªØµØ§Ù„ Ú†Ù†Ø¯Ù…Ø³ÛŒØ±Ù‡\n` +
    `  ${E.refresh} Ù¾Ø´ØªÛŒØ¨Ø§Ù†ÛŒ Ø§Ø² ØªÙ…Ø¯ÛŒØ¯ Ùˆ Ø§ÙØ²Ø§ÛŒØ´ Ø­Ø¬Ù…\n\n` +
    `${LN}\n` +
    `  ${E.money} Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ú©ÛŒÙ Ù¾ÙˆÙ„: <b>${money(u.balance)}</b>\n` +
    `${L}`;
  return {
    text,
    keyboard: kb([
      [btn(`${E.rocket} Ø®Ø±ÛŒØ¯ Ø³Ø±ÙˆÛŒØ³`, 'buy')],
      [btn(`${E.key} Ø³Ø±ÙˆÛŒØ³â€ŒÙ‡Ø§ÛŒ Ù…Ù†`, 'my'), btn(`${E.box} Ú©ÛŒÙ Ù¾ÙˆÙ„`, 'wallet')],
      [btn(`${E.gift} Ø¯Ø¹ÙˆØª Ø¯ÙˆØ³ØªØ§Ù†`, 'ref'), btn(`${E.book} Ø¢Ù…ÙˆØ²Ø´ Ø§ØªØµØ§Ù„`, 'howto')],
      [btn(`${E.phone} Ù¾Ø´ØªÛŒØ¨Ø§Ù†ÛŒ`, 'support'), btn(`${E.info} Ø±Ø§Ù‡Ù†Ù…Ø§`, 'help')],
    ]),
  };
}

function planList(plans, u) {
  const rows = [];
  let body = `${L}\n  ${E.rocket} <b>Ø§Ù†ØªØ®Ø§Ø¨ Ø³Ø±ÙˆÛŒØ³</b>\n  ${LN}\n`;
  for (const p of plans) {
    body += `\n  <b>${p.title}</b> â€” ${E.star} ${gb(p.gb)} Ú¯ÛŒÚ¯ / ${gb(p.days)} Ø±ÙˆØ²\n`;
    body += `  ${E.money} ${money(p.price)}\n`;
    rows.push([btn(`${p.title} Â· ${gb(p.gb)} Ú¯ÛŒÚ¯ Â· ${money(p.price)}`, 'plan:' + p.id)]);
  }
  body += `\n${LN}\n  ${E.money} Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ø´Ù…Ø§: <b>${money(u.balance)}</b>\n` +
          `  ${E.info} Ù¾Ø±Ø¯Ø§Ø®Øª Ø§Ø² Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ø§Ù†Ø¬Ø§Ù… Ù…ÛŒâ€ŒØ´ÙˆØ¯.\n${L}`;
  rows.push([btn(`${E.box} Ø´Ø§Ø±Ú˜ Ú©ÛŒÙ Ù¾ÙˆÙ„`, 'wallet')]);
  rows.push([btn(`${E.back} Ø¨Ø§Ø²Ú¯Ø´Øª`, 'home')]);
  return { text: body, keyboard: kb(rows) };
}

function planDetail(p, u) {
  const enough = u.balance >= p.price;
  const text =
    `${L}\n  ${E.box} <b>${p.title}</b>\n  ${LN}\n\n` +
    `  ${E.star} Ø­Ø¬Ù…: <b>${gb(p.gb)} Ú¯ÛŒÚ¯Ø§Ø¨Ø§ÛŒØª</b>\n` +
    `  ${E.clock} Ù…Ø¯Øª: <b>${gb(p.days)} Ø±ÙˆØ²</b>\n` +
    `  ${E.users} Ø¯Ø³ØªÚ¯Ø§Ù‡ Ù‡Ù…Ø²Ù…Ø§Ù†: <b>${gb(config.nx.deviceLimit)}</b>\n` +
    `  ${E.bolt} Ù¾Ø±ÙˆØªÚ©Ù„â€ŒÙ‡Ø§: <b>Ú†Ù†Ø¯Ú¯Ø§Ù†Ù‡ Ùˆ Ø®ÙˆØ¯Ú©Ø§Ø±</b>\n\n` +
    `${LN}\n  ${E.money} Ù…Ø¨Ù„Øº: <b>${money(p.price)}</b>\n` +
    `  ${E.box} Ù…ÙˆØ¬ÙˆØ¯ÛŒ: <b>${money(u.balance)}</b>\n\n` +
    (enough
      ? `  ${E.check} Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ú©Ø§ÙÛŒ Ø§Ø³Øª â€” Ù‡Ù…ÛŒÙ† Ø­Ø§Ù„Ø§ ÙØ¹Ø§Ù„ Ù…ÛŒâ€ŒØ´ÙˆØ¯.`
      : `  ${E.cross} Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ú©Ø§ÙÛŒ Ù†ÛŒØ³ØªØ› Ø§ÙˆÙ„ Ú©ÛŒÙ Ù¾ÙˆÙ„ Ø±Ø§ Ø´Ø§Ø±Ú˜ Ú©Ù†ÛŒØ¯.`) +
    `\n${L}`;
  const rows = [];
  if (enough) rows.push([btn(`${E.check} Ù¾Ø±Ø¯Ø§Ø®Øª Ùˆ ÙØ¹Ø§Ù„â€ŒØ³Ø§Ø²ÛŒ`, 'pay:' + p.id)]);
  else rows.push([btn(`${E.box} Ø´Ø§Ø±Ú˜ Ú©ÛŒÙ Ù¾ÙˆÙ„`, 'wallet')]);
  rows.push([btn(`${E.back} Ø¨Ø§Ø²Ú¯Ø´Øª`, 'buy')]);
  return { text, keyboard: kb(rows) };
}
function wallet(u) {
  const s = store.data().settings;
  const text =
    `${L}\n  ${E.box} <b>Ú©ÛŒÙ Ù¾ÙˆÙ„</b>\n  ${LN}\n\n` +
    `  ${E.money} Ù…ÙˆØ¬ÙˆØ¯ÛŒ: <b>${money(u.balance)}</b>\n\n` +
    `  ${E.card} Ø´Ù…Ø§Ø±Ù‡ Ú©Ø§Ø±Øª Ø¨Ø±Ø§ÛŒ Ø´Ø§Ø±Ú˜:\n  <code>${esc(s.card)}</code>\n` +
    `  ${E.users} Ø¨Ù‡ Ù†Ø§Ù…: <b>${esc(s.cardName)}</b>\n\n` +
    `${LN}\n  ${E.info} Ù…Ø¨Ù„Øº Ø±Ø§ ÙˆØ§Ø±ÛŒØ² Ú©Ù†ÛŒØ¯ØŒ Ø³Ù¾Ø³ Â«Ø§Ø±Ø³Ø§Ù„ Ø±Ø³ÛŒØ¯Â» Ø±Ø§ Ø¨Ø²Ù†ÛŒØ¯.\n` +
    `  Ù¾Ø³ Ø§Ø² ØªØ£ÛŒÛŒØ¯ØŒ Ù…Ø¨Ù„Øº Ø¨Ù‡ Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ø§Ø¶Ø§ÙÙ‡ Ù…ÛŒâ€ŒØ´ÙˆØ¯.\n${L}`;
  return {
    text,
    keyboard: kb([
      [btn(`${E.send} Ø§Ø±Ø³Ø§Ù„ Ø±Ø³ÛŒØ¯`, 'receipt')],
      [btn(`${E.clock} Ø³ÙØ§Ø±Ø´â€ŒÙ‡Ø§ Ùˆ Ø±Ø³ÛŒØ¯Ù‡Ø§ÛŒ Ù…Ù†`, 'orders')],
      [btn(`${E.back} Ø¨Ø§Ø²Ú¯Ø´Øª`, 'home')],
    ]),
  };
}

function myServices(rows) {
  let text = `${L}\n  ${E.key} <b>Ø³Ø±ÙˆÛŒØ³â€ŒÙ‡Ø§ÛŒ Ù…Ù†</b>\n  ${LN}\n`;
  const keyboard = [];
  if (!rows.length) {
    text += `\n  ${E.info} Ù‡Ù†ÙˆØ² Ø³Ø±ÙˆÛŒØ³ÛŒ ÙØ¹Ø§Ù„ Ù†Ú©Ø±Ø¯Ù‡â€ŒØ§ÛŒØ¯.\n${L}`;
    keyboard.push([btn(`${E.rocket} Ø®Ø±ÛŒØ¯ Ø³Ø±ÙˆÛŒØ³`, 'buy')]);
  } else {
    rows.forEach((r) => {
      const s = r.state;
      const icon = s.expired ? E.cross : (s.daysLeft <= 3 ? E.clock : E.check);
      text += `\n  ${icon} <b>${esc(r.name)}</b>\n`;
      text += `     ${nx.fmtGb(s.usedBytes)} Ø§Ø² ${nx.fmtGb(s.volume)}\n`;
      text += `     ${E.clock} ${s.expired ? 'Ù…Ù†Ù‚Ø¶ÛŒ Ø´Ø¯Ù‡' : gb(s.daysLeft) + ' Ø±ÙˆØ² Ø¨Ø§Ù‚ÛŒâ€ŒÙ…Ø§Ù†Ø¯Ù‡'}\n`;
      keyboard.push([btn(`${icon} ${r.name} â€” ${s.expired ? 'Ù…Ù†Ù‚Ø¶ÛŒ' : gb(s.daysLeft) + ' Ø±ÙˆØ²'}`, 'svc:' + r.nxId)]);
    });
    text += `\n${L}`;
  }
  keyboard.push([btn(`${E.back} Ø¨Ø§Ø²Ú¯Ø´Øª`, 'home')]);
  return { text, keyboard: kb(keyboard) };
}

function serviceDetail(row) {
  const s = row.state;
  const text =
    `${L}\n  ${E.key} <b>${esc(row.name)}</b>\n  ${LN}\n\n` +
    `  ${E.star} Ø­Ø¬Ù… Ú©Ù„: <b>${nx.fmtGb(s.volume)}</b>\n` +
    `  ${E.chart} Ù…ØµØ±Ùâ€ŒØ´Ø¯Ù‡: <b>${nx.fmtGb(s.usedBytes)}</b>\n` +
    `  ${E.box} Ø¨Ø§Ù‚ÛŒâ€ŒÙ…Ø§Ù†Ø¯Ù‡: <b>${nx.fmtGb(Math.max(0, s.volume - s.usedBytes))}</b>\n` +
    `  ${E.clock} ${s.expired ? E.cross + ' Ù…Ù†Ù‚Ø¶ÛŒ Ø´Ø¯Ù‡' : gb(s.daysLeft) + ' Ø±ÙˆØ² Ø¨Ø§Ù‚ÛŒâ€ŒÙ…Ø§Ù†Ø¯Ù‡'}\n` +
    `  ${E.users} Ø¯Ø³ØªÚ¯Ø§Ù‡â€ŒÙ‡Ø§: <b>${gb(s.deviceLimit)}</b>\n\n` +
    `${LN}\n  ${E.lock} Ø§ØªØµØ§Ù„ (Ø¨Ø±Ø§ÛŒ Ù†Ù…Ø§ÛŒØ´ Ù„Ù…Ø³ Ú©Ù†ÛŒØ¯):\n` +
    `  <tg-spoiler>${esc(row.link || 'â€”')}</tg-spoiler>\n${L}`;
  return {
    text,
    keyboard: kb([
      [btn(`${E.copy} Ø¯Ø±ÛŒØ§ÙØª Ù„ÛŒÙ†Ú© Ø§Ø´ØªØ±Ø§Ú©`, 'sub:' + row.nxId)],
      [btn(`${E.refresh} ØªÙ…Ø¯ÛŒØ¯ / Ø§ÙØ²Ø§ÛŒØ´ Ø­Ø¬Ù…`, 'renew:' + row.nxId)],
      [btn(`${E.info} Ø±Ø§Ù‡Ù†Ù…Ø§ÛŒ Ø§ØªØµØ§Ù„`, 'howto')],
      [btn(`${E.back} Ø³Ø±ÙˆÛŒØ³â€ŒÙ‡Ø§`, 'my')],
    ]),
  };
}

function howto() {
  const text =
    `${L}\n  ${E.book} <b>Ø±Ø§Ù‡Ù†Ù…Ø§ÛŒ Ø§ØªØµØ§Ù„</b>\n  ${LN}\n\n` +
    `  ${E.bolt} <b>Ø§Ù†Ø¯Ø±ÙˆÛŒØ¯</b> â€” Ø§Ù¾ <b>v2rayNG</b> ÛŒØ§ <b>Hiddify</b>\n` +
    `      Ù„ÛŒÙ†Ú© Ø§Ø´ØªØ±Ø§Ú© Ø±Ø§ Ú©Ù¾ÛŒ Ùˆ Â«Import from clipboardÂ» Ø±Ø§ Ø¨Ø²Ù†ÛŒØ¯.\n\n` +
    `  ${E.bolt} <b>Ø¢ÛŒÙÙˆÙ†</b> â€” Ø§Ù¾ <b>Streisand</b> ÛŒØ§ <b>V2Box</b>\n` +
    `      Ø¯Ú©Ù…Ù‡ + Ø¨Ø§Ù„Ø§ÛŒ ØµÙØ­Ù‡ â† Add subscription â† Ù„ÛŒÙ†Ú© Ø±Ø§ Ø¨Ú†Ø³Ø¨Ø§Ù†ÛŒØ¯.\n\n` +
    `  ${E.bolt} <b>ÙˆÛŒÙ†Ø¯ÙˆØ²</b> â€” <b>v2rayN</b> ÛŒØ§ <b>Hiddify</b>\n` +
    `      Subscription â† Add â† Ù„ÛŒÙ†Ú© Ø±Ø§ ÙˆØ§Ø±Ø¯ Ùˆ Update Ú©Ù†ÛŒØ¯.\n\n` +
    `  ${E.bolt} <b>Ù…Ú©</b> â€” <b>Hiddify</b> ÛŒØ§ <b>V2Box</b>\n\n` +
    `${LN}\n  ${E.info} Ù‡Ù…ÛŒØ´Ù‡ Ø¢Ø®Ø±ÛŒÙ† Ù†Ø³Ø®Ù‡â€ŒÛŒ Ù„ÛŒÙ†Ú© Ø±Ø§ Ø§Ø² Â«Ø³Ø±ÙˆÛŒØ³â€ŒÙ‡Ø§ÛŒ Ù…Ù†Â» Ø¨Ú¯ÛŒØ±ÛŒØ¯.\n${L}`;
  return {
    text,
    keyboard: kb([
      [btn(`${E.key} Ø³Ø±ÙˆÛŒØ³â€ŒÙ‡Ø§ÛŒ Ù…Ù†`, 'my'), btn(`${E.phone} Ù¾Ø´ØªÛŒØ¨Ø§Ù†ÛŒ`, 'support')],
      [btn(`${E.back} Ø¨Ø§Ø²Ú¯Ø´Øª`, 'home')],
    ]),
  };
}
function help() {
  const s = store.data().settings;
  const text =
    `${L}\n  ${E.info} <b>Ø±Ø§Ù‡Ù†Ù…Ø§</b>\n  ${LN}\n\n` +
    `  ${E.rocket} <b>Ø®Ø±ÛŒØ¯</b>: Ø³Ø±ÙˆÛŒØ³ Ø±Ø§ Ø§Ù†ØªØ®Ø§Ø¨ Ú©Ù†ØŒ Ø§Ø² Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ù¾Ø±Ø¯Ø§Ø®Øª Ù…ÛŒâ€ŒØ´ÙˆØ¯ Ùˆ\n` +
    `      Ù„ÛŒÙ†Ú© Ø§ØªØµØ§Ù„ Ø¨Ù„Ø§ÙØ§ØµÙ„Ù‡ Ø³Ø§Ø®ØªÙ‡ Ù…ÛŒâ€ŒØ´ÙˆØ¯.\n\n` +
    `  ${E.box} <b>Ú©ÛŒÙ Ù¾ÙˆÙ„</b>: Ú©Ø§Ø±Øªâ€ŒØ¨Ù‡â€ŒÚ©Ø§Ø±Øª + Ø§Ø±Ø³Ø§Ù„ Ø±Ø³ÛŒØ¯ØŒ ØªØ£ÛŒÛŒØ¯ ØªÙˆØ³Ø· Ù¾Ø´ØªÛŒØ¨Ø§Ù†ÛŒ.\n\n` +
    `  ${E.gift} <b>Ø¯Ø¹ÙˆØª</b>: Ø¨Ø±Ø§ÛŒ Ù‡Ø± Ø¯ÙˆØ³Øª Ú©Ù‡ Ø§ÙˆÙ„ÛŒÙ† Ø®Ø±ÛŒØ¯Ø´ Ø±Ø§ Ø§Ù†Ø¬Ø§Ù… Ø¯Ù‡Ø¯ØŒ\n` +
    `      Ù‡Ø¯ÛŒÙ‡ Ù†Ù‚Ø¯ÛŒ Ø¨Ù‡ Ú©ÛŒÙ Ù¾ÙˆÙ„ Ø´Ù…Ø§ Ø§Ø¶Ø§ÙÙ‡ Ù…ÛŒâ€ŒØ´ÙˆØ¯.\n\n` +
    `  ${E.phone} <b>Ù¾Ø´ØªÛŒØ¨Ø§Ù†ÛŒ</b>: ${esc(s.support)}\n\n` +
    `${LN}  ${E.lock} Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ø§ØªØµØ§Ù„ ÙÙ‚Ø· Ø¨Ø±Ø§ÛŒ Ø´Ù…Ø§Ø³ØªØ› Ø¯Ø± Ø§Ø®ØªÛŒØ§Ø± Ø¯ÛŒÚ¯Ø±Ø§Ù† Ù†Ú¯Ø°Ø§Ø±ÛŒØ¯.\n${L}`;
  return { text, keyboard: kb([[btn(`${E.back} Ø¨Ø§Ø²Ú¯Ø´Øª`, 'home')]]) };
}

function refPage(u, botUsername) {
  const link = `https://t.me/${botUsername}?start=ref_${u.tgId}`;
  const text =
    `${L}\n  ${E.gift} <b>Ø¯Ø¹ÙˆØª Ø¯ÙˆØ³ØªØ§Ù†</b>\n  ${LN}\n\n` +
    `  ${E.users} ØªØ¹Ø¯Ø§Ø¯ Ø¯Ø¹ÙˆØªâ€ŒØ´Ø¯Ù‡â€ŒÙ‡Ø§: <b>${gb(u.refCount || 0)}</b>\n` +
    `  ${E.money} Ù‡Ø¯ÛŒÙ‡ Ù‡Ø± Ø¯Ø¹ÙˆØª: <b>${money(store.data().settings.refBonus)}</b>\n\n` +
    `  Ù„ÛŒÙ†Ú© Ø§Ø®ØªØµØ§ØµÛŒ Ø´Ù…Ø§:\n  <code>${esc(link)}</code>\n\n` +
    `${LN}  ${E.info} Ù‡Ø¯ÛŒÙ‡ Ù¾Ø³ Ø§Ø² Ø§ÙˆÙ„ÛŒÙ† Ø®Ø±ÛŒØ¯ Ø¯ÙˆØ³ØªØª ÙˆØ§Ø±ÛŒØ² Ù…ÛŒâ€ŒØ´ÙˆØ¯.\n${L}`;
  return {
    text,
    keyboard: kb([
      [urlBtn(`${E.send} Ø§Ø´ØªØ±Ø§Ú©â€ŒÚ¯Ø°Ø§Ø±ÛŒ`, 'https://t.me/share/url?url=' + encodeURIComponent(link))],
      [btn(`${E.back} Ø¨Ø§Ø²Ú¯Ø´Øª`, 'home')],
    ]),
  };
}

function renewMenu(nxId, plans) {
  const rows = plans.filter(p => p.days <= 30).map(p => [
    btn(`${E.plus} ${p.title} Â· ${gb(p.gb)} Ú¯ÛŒÚ¯ Â· ${money(p.price)}`, 'rnew:' + nxId + ':' + p.id),
  ]);
  const text =
    `${L}\n  ${E.refresh} <b>ØªÙ…Ø¯ÛŒØ¯ Ø³Ø±ÙˆÛŒØ³</b>\n  ${LN}\n\n` +
    `  ÛŒÚ©ÛŒ Ø§Ø² Ø¨Ø³ØªÙ‡â€ŒÙ‡Ø§ Ø±Ø§ Ø§Ù†ØªØ®Ø§Ø¨ Ú©Ù†Ø› Ø­Ø¬Ù… Ùˆ Ø²Ù…Ø§Ù† Ø¨Ù‡ Ø³Ø±ÙˆÛŒØ³ ÙØ¹Ù„ÛŒ Ø§Ø¶Ø§ÙÙ‡ Ù…ÛŒâ€ŒØ´ÙˆØ¯\n` +
    `  Ùˆ Ù„ÛŒÙ†Ú© Ø§ØªØµØ§Ù„ Ø´Ù…Ø§ ØªØºÛŒÛŒØ± Ù†Ù…ÛŒâ€ŒÚ©Ù†Ø¯.\n\n` +
    `${LN}  ${E.info} Ù¾Ø±Ø¯Ø§Ø®Øª Ø§Ø² Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ú©ÛŒÙ Ù¾ÙˆÙ„ Ø§Ù†Ø¬Ø§Ù… Ù…ÛŒâ€ŒØ´ÙˆØ¯.\n${L}`;
  rows.push([btn(`${E.back} Ø¨Ø§Ø²Ú¯Ø´Øª`, 'svc:' + nxId)]);
  return { text, keyboard: kb(rows) };
}

module.exports = {
  home, planList, planDetail, wallet, myServices, serviceDetail, howto, help, refPage,
  renewMenu, kb, btn, urlBtn, money, gb, esc, L, LN, E,
};
