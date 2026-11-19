'use strict';
/** مدیریت فایل‌های موقت، لینک امضاشده و پاک‌سازی خودکار. */
const fs = require('fs');
const fsp = require('node:fs/promises');
const path = require('path');
const config = require('./config');
const store = require('./db');
const { newToken, now } = store;

function jobDir(jobId) {
  return path.join(config.tmpDir, String(jobId));
}

async function ensureJobDir(jobId) {
  const dir = jobDir(jobId);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function removeJobDir(jobId) {
  await fsp.rm(jobDir(jobId), { recursive: true, force: true }).catch(() => {});
}

/** لینک موقت امضاشده می‌سازد و فایل را روی دیسک نگه می‌دارد */
function createLink(job, ttlMin) {
  const token = newToken();
  const expires = new Date(Date.now() + Math.max(1, ttlMin) * 60000).toISOString();
  store.updateJob(job.id, { token, status: 'ready', expires_at: expires });
  return { token, expires, url: `${config.publicBase}/f/${token}` };
}

function asciiFallback(name) {
  const ascii = String(name)
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .trim();
  return ascii || 'file';
}

/** ارسال فایل به مرورگر با پشتیبانی Range و حذف پس از تحویل */
async function serveJobFile(req, res, job, { deleteAfter = true } = {}) {
  const fileName = job.file_name || 'file';
  const filePath = path.join(jobDir(job.id), path.basename(fileName));
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    res.writeHead(410, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('file not found or already downloaded');
    return;
  }

  const headers = {
    'content-type': job.mime || 'application/octet-stream',
    'content-disposition': `attachment; filename="${asciiFallback(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'cache-control': 'no-store, no-cache, must-revalidate',
    'x-robots-tag': 'noindex',
    'accept-ranges': 'bytes',
  };

  const range = req.headers.range;
  const start = range ? Math.max(0, parseInt(String(range).replace(/[^0-9-].*$/, ''), 10) || 0) : 0;

  if (range && start < stat.size) {
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${stat.size - 1}/${stat.size}`, 'content-length': stat.size - start });
    fs.createReadStream(filePath, { start }).pipe(res);
    return;
  }

  res.writeHead(200, { ...headers, 'content-length': stat.size });
  const stream = fs.createReadStream(filePath);

  let aborted = false;
  const finish = () => {
    if (aborted) return;
    aborted = true;
    store.logEvent(job.user_id, 'link_download', `job=${job.id} size=${stat.size}`);
    if (deleteAfter) {
      removeJobDir(job.id).then(() => store.updateJob(job.id, { status: 'sent', delivery: 'link', deleted_at: now() }));
    } else {
      store.updateJob(job.id, { delivery: 'link' });
    }
  };

  stream.on('error', () => {
    res.destroy();
    finish();
  });
  res.on('close', finish);
  stream.pipe(res);
}

/** فضای دیسک و حجم پوشه موقت */
function diskInfo() {
  let free = 0;
  let size = 0;
  try {
    const st = fs.statfsSync(config.tmpDir);
    free = st.bavail * st.bsize;
  } catch {
    free = 0;
  }
  const walk = (dir) => {
    let total = 0;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      try {
        if (e.isDirectory()) total += walk(p);
        else total += fs.statSync(p).size;
      } catch {
        /* ignore */
      }
    }
    return total;
  };
  size = walk(config.tmpDir);
  return { free, used: size };
}

/** هر دقیقه: پاک‌سازی لینک‌های منقضی و پوشه‌های بی‌صاحب */
async function janitor() {
  const stamp = now();
  store.expiredLinksCleanup(stamp);
  for (const job of store.expiredJobs()) {
    await removeJobDir(job.id);
    store.updateJob(job.id, { status: 'expired', deleted_at: stamp });
  }
  const active = new Set(store.activeJobIds().map(String));
  let entries = [];
  try {
    entries = await fsp.readdir(config.tmpDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (active.has(e.name)) continue;
    const p = path.join(config.tmpDir, e.name);
    const age = Date.now() - (await fsp.stat(p).then((s) => s.mtimeMs).catch(() => Date.now()));
    if (age > 10 * 60000) await fsp.rm(p, { recursive: true, force: true }).catch(() => {});
  }
}

function startJanitor() {
  janitor().catch(() => {});
  setInterval(() => janitor().catch(() => {}), 60000).unref();
}

module.exports = { jobDir, ensureJobDir, removeJobDir, createLink, serveJobFile, diskInfo, janitor, startJanitor, asciiFallback };