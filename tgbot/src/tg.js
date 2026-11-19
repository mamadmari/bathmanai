'use strict';

/** پوشش نازک روی Telegram Bot API با fetch داخلی Node 22 */

const { config } = require('./config');

const API = 'https://api.telegram.org/bot' + config.botToken;

async function call(method, payload) {
  const res = await fetch(API + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
    signal: AbortSignal.timeout(25000),
  });
  const json = await res.json().catch(() => null);
  if (!json || !json.ok) {
    const desc = (json && json.description) || ('HTTP ' + res.status);
    const err = new Error('tg:' + method + ': ' + desc);
    err.body = json;
    throw err;
  }
  return json.result;
}

const send = (chatId, text, keyboard, extra) =>
  call('sendMessage', Object.assign({
    chat_id: chatId, text, parse_mode: 'HTML',
    reply_markup: keyboard, disable_web_page_preview: true,
  }, extra || {}));

const edit = (chatId, messageId, text, keyboard) =>
  call('editMessageText', {
    chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML',
    reply_markup: keyboard, disable_web_page_preview: true,
  }).catch(e => { if (String(e.message).includes('not modified')) return null; throw e; });

const answer = (id, text, alert) =>
  call('answerCallbackQuery', { callback_id: id, callback_query_id: id, text: text || '', show_alert: !!alert })
    .then(r => r)
    .catch(() => null);

const copyMessage = (chatId, fromChatId, messageId) =>
  call('copyMessage', { chat_id: chatId, from_chat_id: fromChatId, message_id: messageId })
    .catch(() => null);

module.exports = { call, send, edit, answer, copyMessage };
