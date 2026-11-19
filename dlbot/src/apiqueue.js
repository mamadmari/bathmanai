'use strict';
const path = require('path');
const store = require('./db');
const dl = require('./downloader');
const files = require('./files');
const policy = require('./policy');

const queue = [];
const progress = new Map();
let active = 0;

function enqueue(jobId) {
  queue.push(jobId);
  pump();
}

function pump() {
  const st = store.settings();
  const limit = Math.max(1, Number(st.max_concurrent_global) || 1);
  while (active < limit && queue.length) {
    const id = queue.shift();
    active += 1;
    runJob(id)
      .catch((err) => console.error('[api-job]', id, err.message))
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

async function runJob(jobId) {
  const job = store.getJob(jobId);
  if (!job) return;
  const user = store.getUser(job.user_id);
  if (!user) return;
  const st = store.settings();
  const maxBytes = policy.maxBytesFor(user, st);
  const dir = await files.ensureJobDir(jobId);
  store.updateJob(jobId, { status: 'running', started_at: store.now() });
  progress.set(jobId, 0);

  try {
    const opts = { maxBytes, onProgress: (pct) => progress.set(jobId, pct) };
    const res =
      job.kind === 'direct'
        ? await dl.downloadDirect(job.url, dir, opts)
        : await dl.downloadMedia(job.url, dir, {
            ...opts,
            format: st.ytdlp_format,
            maxHeight: st.ytdlp_max_height,
            audioOnly: st.audio_only,
          });

    store.updateJob(jobId, { file_name: path.basename(res.filePath), mime: res.mime, size: res.size, title: res.title });
    const tier = policy.tierFor(user, st, res.size);
    if (['need_phone', 'need_sub', 'quota'].includes(tier.tier)) {
      await files.removeJobDir(jobId);
      store.updateJob(jobId, { status: 'rejected', error: tier.tier, finished_at: store.now(), deleted_at: store.now() });
      return;
    }
    const fresh = store.getJob(jobId);
    files.createLink(fresh, st.link_ttl_min);
    store.updateJob(jobId, { status: 'ready', delivery: 'link', finished_at: store.now() });
    store.addDownload(user.id, res.size);
    if (store.subActive(user)) store.consumeQuota(user.id, res.size / policy.MB);
  } catch (err) {
    await files.removeJobDir(jobId);
    const code = err.code || 'download';
    store.updateJob(jobId, {
      status: 'failed',
      error: `${code}${err.detail ? `: ${String(err.detail).slice(0, 150)}` : ''}`,
      finished_at: store.now(),
      deleted_at: store.now(),
    });
    store.logEvent(user.id, 'job_failed', `${code} ${job.url || ''}`.slice(0, 400));
  } finally {
    progress.delete(jobId);
  }
}

module.exports = { enqueue, progressOf: (id) => progress.get(Number(id)), stats: () => ({ queued: queue.length, active }) };
