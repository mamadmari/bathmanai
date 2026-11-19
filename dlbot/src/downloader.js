'use strict';
/** دانلود مستقیم و yt-dlp با محافظت SSRF و سقف حجم. */
const fs = require('fs');
const fsp = require('node:fs/promises');
const path = require('path');
const net = require('net');
const dns = require('node:dns').promises;
const { spawn } = require('node:child_process');
const config = require('./config');

const MB = 1024 * 1024;

class DownloadError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail || '';
  }
}

function isPrivateIp(ip) {
  if (!ip) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    if (s === '::1' || s === '::') return true;
    if (s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80') || s.startsWith('ff')) return true;
    if (s.startsWith('::ffff:')) return isPrivateIp(s.slice(7));
    return false;
  }
  return true;
}

/** میزبان باید عمومی باشد (جلوگیری از SSRF) */
async function assertPublicHost(url, allowPrivate) {
  if (allowPrivate) return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new DownloadError('private_host');
    return;
  }
  if (/^(localhost|.*\.local|.*\.internal|.*\.lan)$/i.test(host)) throw new DownloadError('private_host');
  const addrs = await dns.lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!addrs.length) throw new DownloadError('dns');
  if (addrs.some((a) => isPrivateIp(a.address))) throw new DownloadError('private_host');
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** fetch با بازبینی هر مرحله ریدایرکت */
async function safeFetch(rawUrl, { method = 'GET', headers = {}, allowPrivate = false, timeoutMs = 45000 } = {}) {
  let current = new URL(rawUrl);
  for (let hop = 0; hop <= 6; hop += 1) {
    await assertPublicHost(current, allowPrivate);
    const res = await fetch(current, {
      method,
      redirect: 'manual',
      headers: { 'user-agent': config.userAgent, 'accept-language': 'en-US,en;q=0.9', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (REDIRECTS.has(res.status)) {
      const loc = res.headers.get('location');
      if (res.body) res.body.cancel().catch(() => {});
      if (!loc) throw new DownloadError('http', String(res.status));
      current = new URL(loc, current);
      method = 'GET';
      continue;
    }
    return res;
  }
  throw new DownloadError('redirect_loop');
}

/** اولین URL متن را برمی‌دارد */
function extractUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s<>"'`]+/i);
  if (!match) return null;
  let url = match[0].replace(/[)\].,،؛;!؟?]+$/u, '');
  if (url.length > 2048) return null;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const DIRECT_TYPES = [
  'video/',
  'audio/',
  'image/',
  'application/pdf',
  'application/zip',
  'application/x-zip',
  'application/x-rar',
  'application/x-7z-compressed',
  'application/msword',
  'application/vnd.openxmlformats',
  'application/vnd.ms-',
  'application/octet-stream',
  'application/epub',
  'text/plain',
];

function isDirectType(ct) {
  const t = String(ct || '').toLowerCase();
  return DIRECT_TYPES.some((p) => t.startsWith(p));
}

function fileNameFrom(url, cd) {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd || '');
  const plain = /filename="?([^";]+)"?/i.exec(cd || '');
  let name = '';
  if (star) {
    try {
      name = decodeURIComponent(star[1]);
    } catch {
      name = star[1];
    }
  } else if (plain) {
    name = plain[1];
  }
  if (!name) {
    try {
      name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
    } catch {
      name = '';
    }
  }
  name = String(name).replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim();
  if (!name || name.length < 2) name = 'file';
  return name.slice(-120);
}

function sanitizeName(name) {
  const clean = String(name || 'file').replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim();
  return (clean || 'file').slice(-120);
}

/** آیا این لینک فایل مستقیم است؟ */
async function probe(url, allowPrivate) {
  if (/\.(mp4|mkv|mp3|m4a|zip|rar|7z|pdf|epub|jpg|jpeg|png|gif|webp|docx?|xlsx?|pptx?)(\?|$)/i.test(url)) {
    return { kind: 'direct', size: 0, mime: '', filename: fileNameFrom(url, '') };
  }
  try {
    const res = await safeFetch(url, { method: 'HEAD', allowPrivate, timeoutMs: 20000 });
    const ct = res.headers.get('content-type') || '';
    const len = Number(res.headers.get('content-length') || 0);
    if (res.body) res.body.cancel().catch(() => {});
    if (isDirectType(ct)) {
      return { kind: 'direct', size: len, mime: ct.split(';')[0], filename: fileNameFrom(url, res.headers.get('content-disposition')) };
    }
    return { kind: 'media', size: len, mime: ct, filename: fileNameFrom(url, '') };
  } catch {
    return { kind: 'media', size: 0, mime: '', filename: fileNameFrom(url, '') };
  }
}

const MIME_BY_EXT = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  flv: 'video/x-flv',
  ts: 'video/mp2t',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  opus: 'audio/opus',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aac: 'audio/aac',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  epub: 'application/epub+zip',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function mimeFor(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

/** دانلود مستقیم HTTP با شمارش بایت و قطع در صورت عبور از سقف */
async function downloadDirect(url, dir, { maxBytes = 0, allowPrivate = false, onProgress } = {}) {
  const res = await safeFetch(url, { allowPrivate, timeoutMs: 60000 });
  if (!res.ok || !res.body) throw new DownloadError('http', String(res.status));
  const ct = (res.headers.get('content-type') || '').split(';')[0].trim();
  const declared = Number(res.headers.get('content-length') || 0);
  if (/^text\/html/i.test(ct)) {
    // صفحه‌ی وب است نه فایل → به فال‌بک جست‌وجو سپرده می‌شود
    if (res.body) res.body.cancel().catch(() => {});
    throw new DownloadError('not_file', ct);
  }
  if (declared && maxBytes && declared > maxBytes) throw new DownloadError('too_big', String(declared));
  const filename = fileNameFrom(url, res.headers.get('content-disposition'));
  const filePath = path.join(dir, filename);
  const out = fs.createWriteStream(filePath);
  let total = 0;
  try {
    for await (const chunk of res.body) {
      total += chunk.length;
      if (maxBytes && total > maxBytes) throw new DownloadError('too_big', String(total));
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      if (onProgress && declared) onProgress(Math.min(99, Math.round((total / declared) * 100)));
    }
  } catch (err) {
    out.destroy();
    await fsp.rm(filePath, { force: true }).catch(() => {});
    throw err;
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  return { filePath, size: total, mime: ct || mimeFor(filePath), title: filename, kind: 'direct' };
}

function runYtDlp(args, { timeoutMs = 60 * 60 * 1000, onLine, onProgress, maxOut = 20000, signal } = {}) {
  return new Promise((resolve) => {
    const child = spawn(config.ytDlp, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let errOut = '';
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    // لغو دستی از پنل/دکمه تلگرام
    const onAbort = () => {
      killed = true;
      child.kill('SIGKILL');
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    const handle = (buf, isErr) => {
      const text = buf.toString('utf8');
      if (isErr) errOut = (errOut + text).slice(-8000);
      else out = (out + text).slice(-maxOut);
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        if (onLine) onLine(line, isErr);
        const m = /\[download\]\s+(\d{1,3}(?:\.\d+)?)%(?:\s+of\s+~?\s*([\d.]+)([KMGT]iB))?(?:\s+at\s+([\d.]+)([KMGT]iB)\/s)?(?:\s+ETA\s+([\d:]+))?/.exec(line);
        if (m && onProgress) onProgress(Number(m[1]), { size: m[2] ? `${m[2]}${m[3]}` : '', speed: m[4] ? `${m[4]}${m[5]}/s` : '', eta: m[6] || '' });
      }
    };

    child.stdout.on('data', (b) => handle(b, false));
    child.stderr.on('data', (b) => handle(b, true));
    child.on('error', (err) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve({ code: -1, out, errOut: err.message, killed });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve({ code, out, errOut, killed });
    });
  });
}

/** حجم تقریبی و عنوان را قبل از دانلود می‌گیرد */
async function probeMedia(url) {
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--no-color',
    '--skip-download',
    '--socket-timeout',
    '15',
    '--retries',
    '1',
    '--print',
    '%(title)s',
    '--print',
    '%(filesize,filesize_approx)s',
    '--',
    url,
  ];
  const res = await runYtDlp(args, { timeoutMs: 60000 });
  const lines = `${res.out}\n${res.errOut}`
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let title = '';
  let size = 0;
  for (const line of lines) {
    if (/^\d+(\.\d+)?$/.test(line)) {
      const n = Math.round(Number(line));
      if (!size && n > 0) size = n;
    } else if (!title && !line.startsWith('[') && !line.startsWith('http') && !/ERROR|WARNING|Since /i.test(line)) {
      title = line.slice(0, 160);
    }
  }
  return { size, title, ok: res.code === 0 };
}

/** آرگومان‌های مشترک: کوکی، شبیه‌سازی مرورگر، ffmpeg */
function netArgs(url) {
  const extra = [];
  if (config.ffmpeg && /[\\/]/.test(config.ffmpeg)) extra.push('--ffmpeg-location', config.ffmpeg);
  if (fs.existsSync(path.join(config.dataDir, 'cookies.txt'))) {
    extra.push('--cookies', path.join(config.dataDir, 'cookies.txt'));
  }
  const imp = process.env.YTDLP_IMPERSONATE || '';
  if (imp) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      if (/(^|\.)(radiojavan\.com|rj\.app|instagram\.com|pin\.it|pinterest\.[a-z.]+|tiktok\.com|x\.com|twitter\.com|threads\.net)$/.test(host)) {
        extra.push('--impersonate', imp);
      }
    } catch {
      /* ytsearch1: و امثال آن */
    }
  }
  return extra;
}

/** دانلود چند آیتم (کاروسل اینستاگرام، آلبوم) */
async function downloadPlaylist(url, dir, { maxItems = 10, maxBytes = 0, audioOnly = false, onProgress, signal } = {}) {
  const args = [
    '--yes-playlist',
    '--playlist-end',
    String(Math.max(1, maxItems)),
    '--no-warnings',
    '--newline',
    '--no-color',
    '--no-mtime',
    '--socket-timeout',
    '20',
    '--retries',
    '3',
    '--fragment-retries',
    '3',
    '--restrict-filenames',
    '--no-part',
    '-o',
    path.join(dir, '%(playlist_index|1)02d_%(title).80B.%(ext)s'),
    '--print',
    'after_move:filepath',
  ];
  if (audioOnly) args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  else args.push('-f', 'bv*+ba/b', '--merge-output-format', 'mp4');
  if (maxBytes) args.push('--max-filesize', `${Math.max(1, Math.floor(maxBytes / MB))}M`);
  args.push(...netArgs(url), '--', url);

  const printed = [];
  const res = await runYtDlp(args, {
    timeoutMs: 30 * 60 * 1000,
    onProgress,
    signal,
    onLine: (line) => {
      const t = line.trim();
      if (t.startsWith('/') && fs.existsSync(t)) printed.push(t);
    },
  });
  if (signal && signal.aborted) throw new DownloadError('cancelled');

  let files = Array.from(new Set(printed)).filter((p) => fs.existsSync(p));
  if (!files.length && fs.existsSync(dir)) {
    files = fs
      .readdirSync(dir)
      .map((n) => path.join(dir, n))
      .filter((p) => {
        try {
          return fs.statSync(p).isFile() && !/\.(part|ytdl|temp)$/i.test(p);
        } catch {
          return false;
        }
      });
  }
  files.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  files = files.slice(0, maxItems);
  if (!files.length) {
    const detail = (res.errOut || res.out || '').split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 300);
    throw new DownloadError('download', detail || 'empty playlist');
  }
  return {
    files: files.map((p) => ({ filePath: p, size: fs.statSync(p).size, mime: mimeFor(p) })),
  };
}

/** دانلود از یوتیوب/اینستاگرام/… با yt-dlp */
async function downloadMedia(
  url,
  dir,
  { maxBytes = 0, format = 'bv*+ba/b', maxHeight = 1080, audioOnly = false, onProgress, noAudioGuard = false, signal } = {}
) {
  const outTpl = path.join(dir, '%(title).100B.%(ext)s');
  const height = maxHeight ? `[height<=${maxHeight}]` : '';
  let fmt = format || 'bv*+ba/b';
  if (audioOnly) fmt = 'ba/b';
  else if (height && !/height<=/.test(fmt)) fmt = `bv*${height}+ba/b${height}/b`;

  const args = [
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--no-color',
    '--no-mtime',
    '--socket-timeout',
    '20',
    '--retries',
    '3',
    '--fragment-retries',
    '3',
    '--concurrent-fragments',
    '2',
    '--restrict-filenames',
    '--no-part',
    '-o',
    outTpl,
    '--print',
    'after_move:filepath',
    '-f',
    fmt,
  ];
  // ffmpeg فقط وقتی مسیر کامل داده شده؛ نام خالی مثل «ffmpeg» ادغام را بی‌صدا خراب می‌کند
  if (config.ffmpeg && /[\\/]/.test(config.ffmpeg)) args.push('--ffmpeg-location', config.ffmpeg);
  if (maxBytes) args.push('--max-filesize', `${Math.max(1, Math.floor(maxBytes / MB))}M`);
  if (audioOnly) args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
  else args.push('--merge-output-format', 'mp4');
  args.push(...netArgs(url), '--', url);

  const printed = [];
  const res = await runYtDlp(args, {
    timeoutMs: 45 * 60 * 1000,
    onProgress,
    signal,
    onLine: (line) => {
      const t = line.trim();
      if (t.startsWith('/') && fs.existsSync(t)) printed.push(t);
      if (/larger than max-filesize/i.test(t)) printed.push('__TOO_BIG__');
    },
  });

  if (signal && signal.aborted) throw new DownloadError('cancelled');
  if (res.killed) throw new DownloadError('timeout');
  if (printed.includes('__TOO_BIG__')) throw new DownloadError('too_big');

  let filePath = printed.length ? printed[printed.length - 1] : '';
  if (!filePath || !fs.existsSync(filePath)) {
    const entries = fs.existsSync(dir)
      ? fs.readdirSync(dir).map((n) => path.join(dir, n)).filter((p) => fs.statSync(p).isFile())
      : [];
    entries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    filePath = entries[0] || '';
  }
  if (!filePath || !fs.existsSync(filePath)) {
    const detail = (res.errOut || res.out || '')
      .split('\n')
      .filter(Boolean)
      .slice(-2)
      .join(' ')
      .slice(0, 300);
    if (/private|login|sign in|not available|403|410|429/i.test(detail)) throw new DownloadError('restricted', detail);
    throw new DownloadError('download', detail);
  }

  const stat = fs.statSync(filePath);
  if (maxBytes && stat.size > maxBytes) {
    await fsp.rm(filePath, { force: true }).catch(() => {});
    throw new DownloadError('too_big', String(stat.size));
  }
  const mime = audioOnly ? 'audio/mpeg' : mimeFor(filePath);

  // اگر ویدیو خواسته بودیم ولی فقط صدا آمد (اینستاگرام DASH) → یک‌بار با فرمت ترکیبی دوباره
  if (!audioOnly && !noAudioGuard && /^audio\//.test(mime)) {
    await fsp.rm(filePath, { force: true }).catch(() => {});
    return downloadMedia(url, dir, {
      maxBytes,
      format: 'b[acodec!=none][vcodec!=none]/bv*+ba/b',
      maxHeight: 0,
      audioOnly: false,
      onProgress,
      noAudioGuard: true,
      signal,
    });
  }

  // پاک‌کردن تکه‌های باقی‌مانده (صوت/ویدئوی جدا که ادغام نشدند)
  try {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (p !== filePath && fs.statSync(p).isFile() && !/\.(jpg|jpeg|png|webp)$/i.test(name)) {
        fs.rmSync(p, { force: true });
      }
    }
  } catch {
    /* پاک‌سازی اختیاری */
  }

  return {
    filePath,
    size: stat.size,
    mime,
    title: path.basename(filePath).replace(/\.[^.]+$/, ''),
    kind: 'media',
  };
}

module.exports = {
  DownloadError,
  MB,
  downloadPlaylist,
  safeFetch,
  assertPublicHost,
  extractUrl,
  probe,
  probeMedia,
  mimeFor,
  runYtDlp,
  downloadDirect,
  downloadMedia,
  isDirectType,
  fileNameFrom,
  sanitizeName,
};