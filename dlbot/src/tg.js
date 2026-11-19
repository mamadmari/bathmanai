'use strict';
/** پوشش نازک روی Bot API — بدون هیچ کتابخانه بیرونی. */
const fs = require('fs');
const https = require('node:https');
const http = require('node:http');
const config = require('./config');
const { parseProxy, tunnel, tlsTunnel } = require('./proxy');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROXY = parseProxy(process.env.TG_PROXY || '');
const API = new URL(config.apiRoot);
const API_SECURE = API.protocol === 'https:';
const API_HOST = API.hostname;
const API_PORT = Number(API.port || (API_SECURE ? 443 : 80));

function endpoint(method) {
  return `${config.apiRoot}/bot${config.token}/${method}`;
}

/** درخواست متنی از طریق تونل پروکسی (برای سرورهای بلاک‌شده) */
async function proxySend(method, bodyString, contentType, timeoutMs) {
  let sock;
  try {
    sock = API_SECURE ? await tlsTunnel(PROXY, API_HOST, API_PORT, 20000) : await tunnel(PROXY, API_HOST, API_PORT, 20000);
  } catch (err) {
    return { ok: false, description: `proxy: ${err.message}` };
  }
  return new Promise((resolve) => {
    const mod = API_SECURE ? https : http;
    const req = mod.request(
      {
        method: 'POST',
        host: API_HOST,
        port: API_PORT,
        path: `/bot${config.token}/${method}`,
        hostname: API_HOST,
        headers: {
          'content-type': contentType,
          'content-length': Buffer.byteLength(bodyString),
          host: API_HOST,
        },
        agent: false,
        createConnection: () => sock,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ ok: false, description: data.slice(0, 200) || `HTTP ${res.statusCode}` });
          }
        });
      }
    );
    req.on('error', (e) => {
      sock.destroy();
      resolve({ ok: false, description: `proxy: ${e.message}` });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, description: 'proxy timeout' });
    });
    req.end(bodyString);
  });
}

async function raw(method, init, timeoutMs, attempt = 0) {
  let res;
  try {
    res = await fetch(endpoint(method), { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    return { ok: false, description: `network: ${err.message}` };
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { ok: false, description: text.slice(0, 300) || `HTTP ${res.status}` };
  }
  if (!data.ok && data.error_code === 429 && attempt < 2) {
    const wait = Math.min(30000, (data.parameters && data.parameters.retry_after ? data.parameters.retry_after : 3) * 1000);
    await sleep(wait);
    return raw(method, init, timeoutMs, attempt + 1);
  }
  return data;
}

/** درخواست JSON به متدهای Bot API */
function call(method, payload = {}, timeoutMs = 35000) {
  if (PROXY) return proxySend(method, JSON.stringify(payload), 'application/json', timeoutMs);
  return raw(
    method,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
    timeoutMs
  );
}

/** آپلود multipart از طریق تونل پروکسی (استریم فایل از دیسک) */
async function proxyUpload(method, field, filePath, filename, mime, fields, timeoutMs) {
  const boundary = `----dlbot${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const chunks = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${String(v)}\r\n`));
  }
  const safeName = String(filename).replace(/["\r\n]/g, '_');
  const head = Buffer.concat(chunks);
  const fileHead = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${safeName}"\r\nContent-Type: ${
      mime || 'application/octet-stream'
    }\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  let fileSize = 0;
  try {
    fileSize = fs.statSync(filePath).size;
  } catch (err) {
    return { ok: false, description: `file: ${err.message}` };
  }

  let sock;
  try {
    sock = API_SECURE ? await tlsTunnel(PROXY, API_HOST, API_PORT, 20000) : await tunnel(PROXY, API_HOST, API_PORT, 20000);
  } catch (err) {
    return { ok: false, description: `proxy: ${err.message}` };
  }

  return new Promise((resolve) => {
    const mod = API_SECURE ? https : http;
    const req = mod.request(
      {
        method: 'POST',
        host: API_HOST,
        port: API_PORT,
        path: `/bot${config.token}/${method}`,
        hostname: API_HOST,
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          'content-length': head.length + fileHead.length + fileSize + tail.length,
          host: API_HOST,
        },
        agent: false,
        createConnection: () => sock,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ ok: false, description: data.slice(0, 200) || `HTTP ${res.statusCode}` });
          }
        });
      }
    );
    req.on('error', (e) => {
      sock.destroy();
      resolve({ ok: false, description: `proxy: ${e.message}` });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, description: 'proxy timeout' });
    });
    req.write(head);
    req.write(fileHead);
    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      req.destroy();
      resolve({ ok: false, description: `read: ${err.message}` });
    });
    stream.pipe(req, { end: false });
    stream.on('end', () => req.end(tail));
  });
}


async function uploadFile(method, field, filePath, filename, mime, fields = {}, extraFiles = [], timeoutMs = 900000) {
  if (PROXY) return proxyUpload(method, field, filePath, filename, mime, fields, timeoutMs);
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  let blob;
  try {
    blob = await fs.openAsBlob(filePath, { type: mime || 'application/octet-stream' });
  } catch {
    const buf = await fs.promises.readFile(filePath);
    blob = new Blob([buf], { type: mime || 'application/octet-stream' });
  }
  fd.append(field, blob, filename);
  for (const ex of extraFiles || []) {
    if (!ex || !ex.path) continue;
    let b2;
    try {
      b2 = await fs.openAsBlob(ex.path, { type: ex.mime || 'image/jpeg' });
    } catch {
      b2 = new Blob([await fs.promises.readFile(ex.path)], { type: ex.mime || 'image/jpeg' });
    }
    fd.append(ex.field, b2, ex.name || 'file');
  }
  const data = await raw(method, { method: 'POST', body: fd }, timeoutMs);
  if (!data.ok) data.networkFile = true;
  return data;
}

/** ارسال آلبوم (۲ تا ۱۰ فایل) از دیسک محلی */
async function sendAlbum(chatId, items, caption = '') {
  if (PROXY) return { ok: false, description: 'album_proxy_unsupported' };
  const list = (items || []).slice(0, 10);
  if (list.length < 2) return { ok: false, description: 'album_need_two' };
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  const media = list.map((it, i) => ({
    type: it.type === 'video' ? 'video' : 'photo',
    media: `attach://f${i}`,
    ...(i === 0 && caption ? { caption: String(caption).slice(0, 1000) } : {}),
  }));
  fd.append('media', JSON.stringify(media));
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    let blob;
    try {
      blob = await fs.openAsBlob(it.path, { type: it.mime || 'application/octet-stream' });
    } catch {
      blob = new Blob([await fs.promises.readFile(it.path)], { type: it.mime || 'application/octet-stream' });
    }
    fd.append(`f${i}`, blob, it.name || `file${i}`);
  }
  return raw('sendMediaGroup', { method: 'POST', body: fd }, 900000);
}

/* --------------------------- میان‌برهای رایج --------------------------- */

async function getMe(timeoutMs) {
  return call('getMe', {}, timeoutMs || 35000);
}

async function sendMessage(chatId, text, extra = {}) {
  const payload = { chat_id: chatId, text: String(text).slice(0, 4000), link_preview_options: { is_disabled: true }, ...extra };
  const data = await call('sendMessage', payload);
  if (!data.ok && /can't parse entities/i.test(data.description || '')) {
    delete payload.parse_mode;
    return call('sendMessage', payload);
  }
  return data;
}

function editMessage(chatId, messageId, text, extra = {}) {
  const payload = { chat_id: chatId, message_id: messageId, text: String(text).slice(0, 4000), link_preview_options: { is_disabled: true }, ...extra };
  return call('editMessageText', payload);
}

function answerCallback(id, text, showAlert = false) {
  return call('answerCallbackQuery', { callback_query_id: id, text: text ? String(text).slice(0, 190) : undefined, show_alert: !!showAlert });
}

function sendAction(chatId, action = 'upload_video') {
  return call('sendChatAction', { chat_id: chatId, action });
}

function getChatMember(chatId, userId) {
  return call('getChatMember', { chat_id: chatId, user_id: userId });
}

function getChat(chatId, timeoutMs) {
  return call('getChat', { chat_id: chatId }, timeoutMs || 35000);
}

function setWebhook(url, secret) {
  return call('setWebhook', {
    url,
    secret_token: secret || undefined,
    max_connections: 40,
    allowed_updates: ['message', 'callback_query', 'edited_message'],
    drop_pending_updates: true,
  });
}

function getWebhookInfo(timeoutMs) {
  return call('getWebhookInfo', {}, timeoutMs || 35000);
}

function deleteMessage(chatId, messageId) {
  return call('deleteMessage', { chat_id: chatId, message_id: messageId });
}

function getFile(fileId) {
  return call('getFile', { file_id: fileId });
}

/** دریافت فایل تلگرام روی دیسک (تا سقف مجاز API) */
async function downloadTelegramFile(filePath, destPath, maxBytes) {
  const pathPart = `/file/bot${config.token}/${filePath}`;
  let stream;
  if (PROXY) {
    const sock = API_SECURE ? await tlsTunnel(PROXY, API_HOST, API_PORT, 20000) : await tunnel(PROXY, API_HOST, API_PORT, 20000);
    stream = await new Promise((resolve, reject) => {
      const mod = API_SECURE ? https : http;
      const req = mod.get(
        { host: API_HOST, port: API_PORT, path: pathPart, headers: { host: API_HOST }, agent: false, createConnection: () => sock },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`file http ${res.statusCode}`));
            return;
          }
          resolve(res);
        }
      );
      req.on('error', reject);
      req.setTimeout(300000, () => req.destroy(new Error('download timeout')));
    });
  } else {
    const res = await fetch(`${config.apiRoot}${pathPart}`, { signal: AbortSignal.timeout(300000) });
    if (!res.ok || !res.body) throw new Error(`file http ${res.status}`);
    stream = res.body;
  }

  const out = fs.createWriteStream(destPath);
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (maxBytes && total > maxBytes) {
      out.destroy();
      throw new Error('file too big');
    }
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  return total;
}

module.exports = {
  call,
  uploadFile,
  sendAlbum,
  getMe,
  sendMessage,
  editMessage,
  answerCallback,
  sendAction,
  getChatMember,
  getChat,
  setWebhook,
  getWebhookInfo,
  deleteMessage,
  getFile,
  downloadTelegramFile,
};