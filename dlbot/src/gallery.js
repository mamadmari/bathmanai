'use strict';
/** gallery-dl: گالری/کاروسل تصاویر (اینستاگرام، پینترست، توییتر، ردیت…) */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { mimeFor } = require('./downloader');

const HOSTS = /(^|\.)(instagram\.com|pinterest\.[a-z.]+|pin\.it|twitter\.com|x\.com|threads\.net|reddit\.com|flickr\.com|artstation\.com|deviantart\.com|tumblr\.com)$/i;

function supports(url) {
  try {
    return HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function run(args, timeoutMs = 240000) {
  return new Promise((resolve) => {
    let err = '';
    let child;
    try {
      child = spawn(config.galleryDl, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      resolve({ code: -1, err: e.message });
      return;
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stderr.on('data', (b) => {
      err = (err + b.toString()).slice(-4000);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, err: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, err });
    });
  });
}

/** لینک کوتاه (pin.it…) را با دنبال‌کردن ریدایرکت به آدرس اصلی تبدیل می‌کند */
async function canonical(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!/^pin\.it$/.test(host)) return url;
  } catch {
    return url;
  }
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': config.userAgent, accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(15000),
    });
    const finalUrl = res.url || url;
    if (res.body) res.body.cancel().catch(() => {});
    return finalUrl;
  } catch {
    return url;
  }
}

/** دانلود اولین N آیتم گالری در پوشه مشخص */
async function fetchMedia(url, dir, { limit = 10 } = {}) {
  if (!supports(url)) return { ok: false, files: [], err: 'unsupported host' };
  fs.mkdirSync(dir, { recursive: true });
  const target = await canonical(url);
  const args = ['--dest', dir, '--range', `1-${limit}`, '--no-mtime', '-o', 'filename={num:02d}_{filename}.{extension}'];
  const cookies = path.join(config.dataDir, 'cookies.txt');
  if (fs.existsSync(cookies)) args.push('--cookies', cookies);
  args.push('--', target);
  const res = await run(args);
  let files = [];
  try {
    files = fs
      .readdirSync(dir)
      .map((n) => path.join(dir, n))
      .filter((p) => {
        try {
          return fs.statSync(p).isFile() && !/\.(part|tmp|json|txt|sqlite3)$/i.test(p);
        } catch {
          return false;
        }
      });
  } catch {
    files = [];
  }
  files.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (!files.length) return { ok: false, files: [], err: String(res.err || '').slice(-200) };
  return {
    ok: true,
    files: files.slice(0, limit).map((p) => ({ filePath: p, size: fs.statSync(p).size, mime: mimeFor(p) })),
  };
}

module.exports = { supports, fetchMedia };
