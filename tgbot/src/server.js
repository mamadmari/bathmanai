'use strict';

/**
 * btm-bot — نقطه ورود
 * حالت پیش‌فرض: long-polling (هیچ پورت عمومی، هیچ دامنه‌ای در معرض نیست).
 * اگر BOT_MODE=webhook بود، وبهوک روی مسیر تصادفی تنظیم می‌شود.
 */

const http = require('http');
const { config, assertConfig } = require('./config');
const store = require('./store');
const tg = require('./tg');
const handlers = require('./handlers');

const log = (...a) => console.log(new Date().toISOString(), ...a);
const mode = (process.env.BOT_MODE || 'poll').toLowerCase();

async function onUpdate(update) {
  try {
    if (update.message) {
      const t = (update.message.text || '').trim();
      if (t === '/admin' || t === '/panel') {
        await handlers.handleCallback({ id: 'cmd' + Date.now(), from: update.message.from, message: null, data: 'adm' });
        return;
      }
      await handlers.handleMessage(update.message);
    } else if (update.callback_query) {
      await handlers.handleCallback(update.callback_query);
    }
  } catch (e) {
    log('update error:', e.message);
  }
}

async function pollLoop() {
  let offset = 0;
  log('polling started');
  for (;;) {
    try {
      const res = await fetch('https://api.telegram.org/bot' + config.botToken + '/getUpdates?timeout=50&allowed_updates=' + encodeURIComponent(JSON.stringify(['message', 'callback_query'])) + (offset ? '&offset=' + offset : ''), { signal: AbortSignal.timeout(65000) });
      const json = await res.json();
      if (!json.ok) {
        log('poll api error:', json.description || res.status);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      for (const u of json.result || []) {
        offset = u.update_id + 1;
        await onUpdate(u);
      }
    } catch (e) {
      log('poll error:', e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function main() {
  assertConfig();
  store.load(config.dbPath);
  const bootAdmins = (store.data().settings.adminIds || []);
  if (bootAdmins.length) config.adminIds = Array.from(new Set(config.adminIds.concat(bootAdmins)));
  log('admins:', config.adminIds.join(',') || '(none yet - first /start claims ownership)');

  const server = http.createServer((req, res) => {
    const url = (req.url || '').split('?')[0];
    if (req.method === 'GET' && url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }
    res.writeHead(404); res.end('not found');
  });
  server.listen(config.port, config.host, () => log('health on', config.host + ':' + config.port));

  if (mode === 'webhook' && config.webhookPath) {
    try { await tg.call('deleteWebhook', { drop_pending_updates: false }); } catch (e) {}
  } else {
    try { const r = await tg.call('deleteWebhook', { drop_pending_updates: false }); log('webhook cleared:', JSON.stringify(r)); } catch (e) { log('deleteWebhook:', e.message); }
    pollLoop();
  }

  setInterval(() => { handlers.notifyExpiring().catch(() => null); }, 6 * 60 * 60 * 1000);
  setTimeout(() => { handlers.notifyExpiring().catch(() => null); }, 60000);

  const bye = () => { store.saveNow(); server.close(() => process.exit(0)); };
  process.on('SIGTERM', bye);
  process.on('SIGINT', bye);
}

main().catch((e) => { console.error('fatal:', e.message); process.exit(1); });