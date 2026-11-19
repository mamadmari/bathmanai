'use strict';
/**
 * لانگ‌پولینگ تلگرام (getUpdates) — برای وقتی که دامنه/گواهی برای webhook آماده نیست.
 * با BOT_MODE=poll فعال می‌شود و در آن حالت webhook ثبت نمی‌شود.
 */
const config = require('./config');
const tg = require('./tg');
const bot = require('./bot');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let offset = 0;
let running = false;
let stopping = false;
let fails = 0;

async function once() {
  const res = await tg.call(
    'getUpdates',
    { offset, timeout: 25, limit: 50, allowed_updates: ['message', 'callback_query', 'edited_message'] },
    45000
  );
  if (!res.ok) {
    const desc = String(res.description || '');
    if (/409|Conflict|terminated by other getUpdates|webhook is active/i.test(desc)) {
      console.warn('[poll] conflict (webhook یا نمونه‌ی دیگر فعال است):', desc);
      fails = 0;
      await sleep(5000);
    } else if (/^network:|ECONNRESET|socket|fetch failed|aborted|timeout/i.test(desc)) {
      fails += 1;
      const wait = Math.min(8000, 500 * 2 ** Math.min(fails, 4));
      if (fails <= 3 || fails % 20 === 0) console.warn('[poll] network:', desc, `retry in ${wait}ms`);
      await sleep(wait);
    } else {
      console.warn('[poll] getUpdates:', desc || 'unknown');
      fails = 0;
      await sleep(3000);
    }
    return 0;
  }
  fails = 0;
  const list = Array.isArray(res.result) ? res.result : [];
  for (const upd of list) {
    offset = Math.max(offset, Number(upd.update_id) + 1);
    bot.handleUpdate(upd).catch((err) => console.error('[poll] update', err.message));
  }
  return list.length;
}

async function start() {
  if (running || stopping) return;
  running = true;

  const del = await tg.call('deleteWebhook', { drop_pending_updates: false });
  console.log('[poll] deleteWebhook:', del.ok ? 'ok' : del.description || 'failed');

  const me = await tg.getMe();
  if (me.ok) {
    console.log(`[poll] as @${me.result.username} (${me.result.id}) — long polling started`);
  } else {
    console.error('[poll] getMe failed:', me.description || 'unknown');
  }

  while (!stopping) {
    try {
      await once();
    } catch (err) {
      console.error('[poll] loop error:', err.message);
      await sleep(5000);
    }
  }
  running = false;
}

function stop() {
  stopping = true;
}

module.exports = { start, stop, get offset() { return offset; } };

if (require.main === module) {
  if (!config.token) {
    console.error('BOT_TOKEN تنظیم نشده است.');
    process.exit(1);
  }
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  bot.resetInterrupted();
  start().catch((err) => {
    console.error('[poll] fatal:', err);
    process.exit(1);
  });
}
