'use strict';

/**
 * btm-bot â€” Ø±Ø¨Ø§Øª Ù…Ø¯ÛŒØ±ÛŒØª Ùˆ ÙØ±ÙˆØ´ Ø³Ø±ÙˆÛŒØ³ Ø§ØªØµØ§Ù„
 * Ù¾ÛŒÚ©Ø±Ø¨Ù†Ø¯ÛŒ Ø§Ø² ÙØ§ÛŒÙ„ Ù…Ø­ÛŒØ·ÛŒ Ø®ÙˆØ§Ù†Ø¯Ù‡ Ù…ÛŒâ€ŒØ´ÙˆØ¯ (/etc/btm-bot.env) â€” Ù‡ÛŒÚ† Ø±Ø§Ø²ÛŒ Ø¯Ø± Ú©Ø¯ Ù†ÛŒØ³Øª.
 */

const path = require('path');

function env(name, def) {
  const v = process.env[name];
  return (v === undefined || v === '') ? def : v;
}

const config = {
  botToken: env('BOT_TOKEN', ''),
  // Ù…Ø³ÛŒØ± ØªØµØ§Ø¯ÙÛŒ ÙˆØ¨Ù‡ÙˆÚ©Ø› ØªÙ„Ú¯Ø±Ø§Ù… Ø¢Ù† Ø±Ø§ Ø¬Ø§ÛŒÛŒ Ù†Ø´Ø§Ù† Ù†Ù…ÛŒâ€ŒØ¯Ù‡Ø¯
  webhookPath: env('BOT_WEBHOOK_PATH', ''),
  // Ù‡Ø¯Ø± X-Telegram-Bot-Api-Secret-Token
  webhookSecret: env('BOT_WEBHOOK_SECRET', ''),
  publicBase: env('PUBLIC_BASE', 'https://bathmanai.ir'),
  port: Number(env('PORT', '8790')),
  host: env('HOST', '127.0.0.1'),

  dbPath: env('DB_PATH', '/var/lib/btm-bot/db.json'),
  adminIds: String(env('ADMIN_IDS', '')).split(',').map(s => Number(s.trim())).filter(Boolean),
  channel: env('CHANNEL', ''),

  nx: {
    base: env('NX_BASE', 'http://127.0.0.1:23348'),
    token: env('NX_TOKEN', ''),
    templateId: Number(env('NX_TEMPLATE_ID', '1')),
    deviceLimit: Number(env('NX_DEVICE_LIMIT', '3')),
    ipLimit: Number(env('NX_IP_LIMIT', '3')),
  },

  // Ø¢Ø¯Ø±Ø³ ØªØ­ÙˆÛŒÙ„ Ù„ÛŒÙ†Ú© Ø§Ø´ØªØ±Ø§Ú©Ø› Ø¨Ø§ ÙˆØ¨Ù‡ÙˆÚ© Ù¾Ù†Ù„ Ø¯Ø± Ù…ØªØºÛŒØ± SUB_PREFIX Ù‚Ø§Ø¨Ù„ ØªØºÛŒÛŒØ± Ø§Ø³Øª
  subPrefix: env('SUB_PREFIX', ''),

  tmpDir: path.join('/var/lib/btm-bot', 'tmp'),
};

function assertConfig() {
  const missing = [];
  if (!config.botToken) missing.push('BOT_TOKEN');
  if (!config.webhookPath) missing.push('BOT_WEBHOOK_PATH');
  if (!config.nx.token) missing.push('NX_TOKEN');
  if (!config.adminIds.length) missing.push('ADMIN_IDS');
  if (missing.length) {
    throw new Error('missing config: ' + missing.join(', '));
  }
}

module.exports = { config, assertConfig };
