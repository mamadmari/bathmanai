'use strict';
/**
 * dlbot — تنظیمات پایه از فایل env (/etc/dlbot.env) خوانده می‌شود.
 * هیچ مقدار حساسی داخل کد نیست.
 */
const fs = require('fs');
const path = require('path');

function loadEnvFile(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 1) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* فایل env اختیاری است */
  }
}

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = process.env.DLBOT_ENV || '/etc/dlbot.env';
loadEnvFile(ENV_FILE);

const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

const config = {
  root: ROOT,
  envFile: ENV_FILE,
  token: process.env.BOT_TOKEN || '',
  apiRoot: (process.env.BOT_API_ROOT || 'https://api.telegram.org').replace(/\/+$/, ''),
  adminIds: String(process.env.ADMIN_IDS || '')
    .split(/[,\s;]+/)
    .filter(Boolean)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0),
  port: Number(process.env.PORT || 8792),
  host: process.env.HOST || '127.0.0.1',
  dataDir: DATA_DIR,
  tmpDir: TMP_DIR,
  dbPath: process.env.DB_PATH || path.join(DATA_DIR, 'dlbot.sqlite'),
  publicBase: (process.env.PUBLIC_BASE || 'https://bathmanai.ir/dlbot').replace(/\/+$/, ''),
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  panelPassword: process.env.PANEL_PASSWORD || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  ytDlp: process.env.YTDLP_BIN || 'yt-dlp',
  galleryDl: process.env.GALLERY_DL_BIN || 'gallery-dl',
  botMode: String(process.env.BOT_MODE || 'webhook').toLowerCase(),
  ffmpeg: process.env.FFMPEG_BIN || 'ffmpeg',
  adminPanelPath: '/dlbot',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
};

config.isAdmin = (id) => config.adminIds.includes(Number(id));
config.localApi = !/api\.telegram\.org/.test(config.apiRoot);

module.exports = config;
