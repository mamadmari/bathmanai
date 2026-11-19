'use strict';
/**
 * تشخیص پلتفرم و استخراج اطلاعات رسانه (عنوان، هنرمند، کاور، مدت، کیفیت‌ها).
 * یوتیوب/ساندکلاد: yt-dlp -J | اسپاتیفای/رادیوجوان: متای صفحه + جست‌وجوی یوتیوب
 */
const dl = require('./downloader');
const pathMod = require('node:path');
const { execFileSync } = require('node:child_process');

const HELPER = process.env.FETCH_HTML_BIN || pathMod.join(__dirname, '..', 'bin', 'fetch-html');

/** واکشی صفحه با شبیه‌سازی مرورگر (برای سایت‌های پشت Cloudflare) */
function browserFetch(url, limit = 2000000) {
  try {
    const html = execFileSync(HELPER, [url, String(limit)], { timeout: 32000, maxBuffer: limit + 2 * 1024 * 1024, encoding: 'utf8' });
    return { html: String(html || ''), finalUrl: '' };
  } catch (err) {
    const out = err && err.stdout ? String(err.stdout) : '';
    const meta = String((err && err.stderr) || '');
    const m = /final=(\S+)/.exec(meta);
    return { html: out, finalUrl: m ? m[1] : '' };
  }
}

const MB = 1024 * 1024;
const CACHE_TTL = 15 * 60 * 1000;
const cache = new Map();

const PLATFORMS = [
  { id: 'youtube', re: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/ },
  { id: 'soundcloud', re: /(^|\.)(soundcloud\.com|snd\.sc)$/ },
  { id: 'spotify', re: /(^|\.)(spotify\.com|spoti\.fi)$/ },
  { id: 'radiojavan', re: /(^|\.)(radiojavan\.com|rj\.app)$/ },
  { id: 'instagram', re: /(^|\.)instagram\.com$/ },
  { id: 'tiktok', re: /(^|\.)(tiktok\.com|vm\.tiktok\.com)$/ },
  { id: 'twitter', re: /(^|\.)(twitter\.com|x\.com)$/ },
  { id: 'pinterest', re: /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/ },
];

const LABELS = {
  youtube: { fa: 'یوتیوب', en: 'YouTube' },
  soundcloud: { fa: 'ساندکلاد', en: 'SoundCloud' },
  spotify: { fa: 'اسپاتیفای', en: 'Spotify' },
  radiojavan: { fa: 'رادیو جوان', en: 'Radio Javan' },
  instagram: { fa: 'اینستاگرام', en: 'Instagram' },
  tiktok: { fa: 'تیک‌تاک', en: 'TikTok' },
  twitter: { fa: 'ایکس (توییتر)', en: 'X (Twitter)' },
  pinterest: { fa: 'پینترست', en: 'Pinterest' },
  other: { fa: 'سایت', en: 'Website' },
};

/** شناسه پلتفرم از روی دامنه */
function detect(rawUrl) {
  let host;
  try {
    host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'other';
  }
  const hit = PLATFORMS.find((p) => p.re.test(host));
  return hit ? hit.id : 'other';
}

/** پلتفرم‌هایی که پیش‌نمایش + انتخاب کیفیت دارند */
function supportsPreview(platform) {
  return ['youtube', 'soundcloud', 'spotify', 'radiojavan', 'pinterest'].includes(platform);
}

function label(platform, lang) {
  const l = LABELS[platform] || LABELS.other;
  return lang === 'en' ? l.en : l.fa;
}

function fmtDur(sec) {
  const s = Math.round(Number(sec) || 0);
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

function fmtMb(bytes) {
  const mb = Number(bytes || 0) / MB;
  if (!mb) return '';
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb >= 100 ? Math.round(mb) : mb.toFixed(0)} MB`;
}

/** خروجی JSON یت‌دی‌ال‌پی را می‌خواند */
async function ytJson(url) {
  const res = await dl.runYtDlp(
    ['--no-playlist', '--no-warnings', '--no-color', '--skip-download', '--socket-timeout', '15', '--retries', '2', '-J', '--', url],
    { timeoutMs: 60000, maxOut: 6 * 1024 * 1024 }
  );
  const text = String(res.out || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** جست‌وجوی یوتیوب و برگرداندن بهترین نتیجه (برای اسپاتیفای/رادیوجوان) */
async function resolveSearch(query) {
  const res = await dl.runYtDlp(
    ['--flat-playlist', '--no-warnings', '--no-color', '--print', '%(id)s', '--', `ytsearch1:${query}`],
    { timeoutMs: 40000 }
  );
  const id = String(res.out || '')
    .split(/\s+/)
    .map((s) => s.trim())
    .find((s) => /^[A-Za-z0-9_-]{6,20}$/.test(s));
  if (!id) return null;
  const j = await ytJson(`https://www.youtube.com/watch?v=${id}`).catch(() => null);
  if (!j) return null;
  return {
    url: j.webpage_url || `https://www.youtube.com/watch?v=${id}`,
    title: j.title || '',
    artist: j.uploader || j.channel || '',
    duration: Number(j.duration || 0),
    thumb: pickThumb(j),
    formats: j.formats || [],
  };
}

/** متای اسپاتیفای از oEmbed عمومی (بدون کلید) */
async function spotifyMeta(url) {
  const res = await dl.safeFetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { timeoutMs: 15000 });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  if (!j) return null;
  const title = String(j.title || '')
    .replace(/^Spotify Embed:\s*/i, '')
    .trim();
  const m = /^(.+?)\s*[-–]\s*(?:song|track)\s*by\s+(.+)$/i.exec(title);
  return {
    title: m ? m[1].trim() : title,
    artist: m ? m[2].trim() : '',
    image: j.thumbnail_url || '',
  };
}

/** عنوان/هنرمند از اسلاگ لینک رادیوجوان (صفحه‌اش Cloudflare دارد) */
function radioJavanMeta(url) {
  const m = /(?:play\.)?radiojavan\.com\/(?:song|mp3)\/([^/?#]+)\/([^/?#]+)/i.exec(url);
  if (!m) return null;
  const dec = (s) => {
    try {
      return decodeURIComponent(s).replace(/[-_]+/g, ' ').trim();
    } catch {
      return s.replace(/[-_]+/g, ' ').trim();
    }
  };
  return { artist: dec(m[1]), title: dec(m[2]), image: '' };
}


function pickThumb(info) {
  const list = Array.isArray(info.thumbnails) ? info.thumbnails.filter((t) => t && t.url) : [];
  if (list.length) {
    list.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
    const best = list.find((t) => /\.(jpe?g|png|webp)(\?|$)/i.test(t.url)) || list[0];
    return best.url;
  }
  return info.thumbnail || '';
}

/** ارتفاع‌های موجود ویدئو (نزولی، حداکثر ۴ گزینه) + گزینه صوت */
function videoOptions(info) {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const audioSizes = formats
    .filter((f) => f.vcodec === 'none' && f.acodec && f.acodec !== 'none')
    .map((f) => Number(f.filesize || f.filesize_approx || 0))
    .sort((a, b) => b - a);
  const audioSize = audioSizes[0] || 0;

  const byHeight = new Map();
  for (const f of formats) {
    if (!f.height || f.vcodec === 'none') continue;
    const size = Number(f.filesize || f.filesize_approx || 0);
    const cur = byHeight.get(f.height);
    if (!cur || size > (cur.size || 0)) byHeight.set(f.height, { size });
  }
  const heights = Array.from(byHeight.keys())
    .sort((a, b) => b - a)
    .filter((h) => h <= 2160)
    .slice(0, 4);

  const options = heights.map((h) => {
    const meta = byHeight.get(h) || {};
    const est = meta.size ? meta.size + audioSize : 0;
    return { key: `v${h}`, kind: 'video', height: h, label: `${h}p${est ? ` • ~${fmtMb(est)}` : ''}` };
  });
  options.push({ key: 'a', kind: 'audio', height: 0, label: '🎵 MP3' });
  return options;
}

/** گزینه‌های سنک‌کلاد و مشابه (صوت + ویدئو اگر داشت) */
function audioOnlyOptions(info) {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const sizes = formats
    .filter((f) => f.acodec && f.acodec !== 'none')
    .map((f) => Number(f.filesize || f.filesize_approx || 0))
    .sort((a, b) => b - a);
  const est = sizes[0] || 0;
  const hasVideo = formats.some((f) => f.vcodec && f.vcodec !== 'none');
  const options = [];
  if (hasVideo) options.push({ key: 'vbest', kind: 'video', height: 0, label: '🎬 ویدئو' });
  options.push({ key: 'a', kind: 'audio', height: 0, label: `🎵 MP3${est ? ` • ~${fmtMb(est)}` : ''}` });
  return options;
}

/** متای صفحه (og:*) برای سایت‌هایی که yt-dlp پشتیبانی نمی‌کند */
async function pageMeta(url, limit = 400000) {
  let html = '';
  let finalUrl = url;
  try {
    const res = await dl.safeFetch(url, { timeoutMs: 25000 });
    if (res.ok) html = await res.text();
  } catch {
    /* از مرورگر شبیه‌سازی‌شده استفاده می‌کنیم */
  }
  if (!html || html.length < 500 || /<title>\s*Just a moment/i.test(html) || /cf-browser-verification|challenge-platform/i.test(html)) {
    const b = browserFetch(url, Math.max(limit, 1500000));
    if (b && b.html) {
      html = b.html;
      if (b.finalUrl) finalUrl = b.finalUrl;
    }
  }
  if (!html) return null;
  html = html.slice(0, limit);
  const meta = (name) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i');
    const alt = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, 'i');
    const m = re.exec(html) || alt.exec(html);
    return m ? m[1].replace(/&amp;/g, '&').trim() : '';
  };
  const mp3 = /https?:\/\/[^\s"'<>\\]+\.(?:mp3|m4a)(?:\?[^\s"'<>\\]*)?/i.exec(html);
  return {
    title: meta('og:title') || (/<title>([^<]+)<\/title>/i.exec(html) || [])[1] || '',
    description: meta('og:description') || meta('description') || '',
    image: meta('og:image') || meta('og:image:secure_url') || '',
    audio: mp3 ? mp3[0].replace(/\\\//g, '/') : '',
    type: meta('og:type') || '',
    media: !!(meta('og:video') || meta('og:video:url') || meta('og:audio') || /<video[\s>]/i.test(html)),
    html,
    finalUrl,
  };
}

/**
 * پینترست: ویدئو یا تصویر پین را از HTML صفحه بیرون می‌کشد
 * (yt-dlp برای بعضی پین‌ها شکست می‌خورد، ولی فایل در خود صفحه هست)
 */
async function pinterestInfo(rawUrl) {
  const meta = await pageMeta(rawUrl, 2500000).catch(() => null);
  if (!meta) return null;
  const html = meta.html || '';

  const mp4 = Array.from(new Set(html.match(/https:\/\/v1\.pinimg\.com\/videos\/[^"'\\\s]+?\.mp4[^"'\\\s]*/g) || []));
  const hls = Array.from(new Set(html.match(/https:\/\/v1\.pinimg\.com\/[^"'\\\s]+?\.m3u8[^"'\\\s]*/g) || []));
  const qualityOf = (u) => {
    const m = /(?:v_)?(\d{3,4})[pP]/.exec(u) || /(\d{3,4})p/.exec(u);
    return m ? Number(m[1]) : 0;
  };

  const options = [];
  if (mp4.length) {
    const sorted = mp4.map((u) => ({ u, q: qualityOf(u) })).sort((a, b) => b.q - a.q).slice(0, 4);
    for (const item of sorted) {
      options.push({
        key: `v${item.q || options.length}`,
        kind: 'video',
        height: item.q || 0,
        url: item.u,
        direct: true,
        label: item.q ? `${item.q}p` : '🎬 ویدئو / Video',
      });
    }
  } else if (hls.length) {
    options.push({ key: 'hls', kind: 'video', height: 0, url: hls[0], direct: false, label: '🎬 ویدئو / Video' });
  } else if (meta.image) {
    const original = meta.image.replace(/\/(?:\d+x\d*|originals)\//, '/originals/');
    options.push({ key: 'img', kind: 'image', height: 0, url: original, direct: true, label: '🖼 تصویر / Image' });
  }

  if (!options.length) return null;
  return {
    ok: true,
    platform: 'pinterest',
    source: options[0].url,
    title: meta.title || '',
    artist: '',
    duration: 0,
    thumb: meta.image || '',
    options,
    searched: false,
  };
}

/** سایت ناشناخته: اگر صفحه واقعاً رسانه دارد، همان عنوان را در یوتیوب پیدا می‌کند */
async function resolveByPage(url) {
  const meta = await pageMeta(url).catch(() => null);
  if (!meta || !meta.title) return null;
  const isMedia = /video|music|audio/i.test(meta.type || '') || meta.media || !!meta.audio;
  if (!isMedia) return null;
  if (meta.audio) return { url: meta.audio, title: meta.title, artist: '', duration: 0, thumb: meta.image, direct: true };
  const title = String(meta.title)
    .replace(/\s*[|•]\s*(YouTube|Instagram|TikTok|Facebook|Twitter|X|Pinterest|Vimeo|Dailymotion).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  if (!title) return null;
  const found = await resolveSearch(title).catch(() => null);
  if (!found) return null;
  return { ...found, title: found.title || title, thumb: meta.image || found.thumb };
}

/** عنوان و هنرمند را از og:title اسپاتیفای/رادیوجوان جدا می‌کند */
function splitArtist(title, platform) {
  const raw = String(title || '').trim();
  if (platform === 'spotify') {
    const m = /^(.*?)\s*[-–]\s*(?:song|track)\s*(?:and lyrics\s*)?by\s+(.+?)(?:\s*\|\s*Spotify)?$/i.exec(raw);
    if (m) return { title: m[1].trim(), artist: m[2].trim() };
    const m2 = /^(.*?)\s*\|\s*Spotify$/i.exec(raw);
    if (m2) return { title: m2[1].trim(), artist: '' };
  }
  const parts = raw.split(/\s+[-–]\s+/);
  if (parts.length >= 2) return { title: parts.slice(1).join(' - ').trim(), artist: parts[0].trim() };
  return { title: raw, artist: '' };
}

/** عنوان رادیوجوان: "Dadi Be Baad - Single by Aaren" → {title, artist} */
function rjTitle(title) {
  const raw = String(title || '')
    .replace(/\s*[|·]\s*Radio Javan.*$/i, '')
    .trim();
  const by = /\s+(?:-\s+[^by]*)?by\s+(.+)$/i.exec(raw);
  const artist = by ? by[1].trim() : '';
  let name = by ? raw.slice(0, by.index).trim() : raw;
  name = name.replace(/\s*[-–]\s*(Single|Album|EP|Playlist)\s*$/i, '').trim();
  return { title: name || raw, artist };
}

/** اطلاعات کامل یک لینک برای نمایش پیش‌نمایش */
async function info(rawUrl) {
  const platform = detect(rawUrl);
  const hit = cache.get(rawUrl);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.info;

  let out = null;
  if (platform === 'pinterest') {
    out = await pinterestInfo(rawUrl).catch(() => null);
  } else if (platform === 'youtube' || platform === 'soundcloud') {
    const j = await ytJson(rawUrl);
    if (j) {
      out = {
        ok: true,
        platform,
        source: rawUrl,
        title: j.title || j.fulltitle || '',
        artist: j.artist || j.uploader || j.channel || '',
        duration: Number(j.duration || 0),
        thumb: pickThumb(j),
        options: platform === 'youtube' ? videoOptions(j) : audioOnlyOptions(j),
        searched: false,
      };
    }
  } else if (platform === 'radiojavan') {
    const meta = await pageMeta(rawUrl, 1200000).catch(() => null);
    const finalUrl = (meta && meta.finalUrl) || rawUrl;
    const clean = meta ? String(meta.html).replace(/\\"/g, '"').replace(/\\\//g, '/') : '';
    const parsed = (meta && meta.title ? rjTitle(meta.title) : radioJavanMeta(finalUrl)) || { title: '', artist: '' };
    const songId = (/radiojavan:\/\/mp3\/(\d+)/.exec(clean) || [])[1] || '';

    let mp3 = '';
    if (clean && songId) {
      const re = /"id":(\d+)[\s\S]{0,900}?"link":"(https:[^"]+?\.mp3)"/g;
      let m;
      while ((m = re.exec(clean))) {
        if (m[1] === songId) {
          mp3 = m[2];
          break;
        }
      }
    }
    if (!mp3 && clean) {
      // اگر شناسه پیدا نشد، اولین لینک را فقط وقتی می‌گیریم که عنوانش با آهنگ بخواند
      const first = /"title":"([^"]{2,90})","explicit":(?:true|false),"link":"(https:[^"]+?\.mp3)"/.exec(clean);
      if (first && parsed.title && first[1].toLowerCase().includes(parsed.title.toLowerCase().slice(0, 12))) mp3 = first[2];
    }

    const dur = (/(?:music:duration|itemprop="duration")[^>]*content="PT(?:(\d+)M)?(?:(\d+)S)?"|content="PT(?:(\d+)M)?(?:(\d+)S)?"/.exec(clean) || []);
    const secs = dur.length ? Number(dur[1] || dur[3] || 0) * 60 + Number(dur[2] || dur[4] || 0) : 0;

    if (mp3) {
      out = {
        ok: true,
        platform,
        source: mp3,
        title: parsed.title || '',
        artist: parsed.artist || '',
        duration: secs,
        thumb: (meta && meta.image) || '',
        options: [{ key: 'a', kind: 'audio', height: 0, url: mp3, direct: true, label: '🎵 MP3 256' }],
        searched: false,
      };
    } else {
      const found =
        (await resolveSearch(`${parsed.title} ${parsed.artist}`.trim() || rawUrl).catch(() => null)) ||
        (parsed.title ? await resolveSearch(parsed.title).catch(() => null) : null);
      if (found) {
        out = {
          ok: true,
          platform,
          source: found.url,
          title: parsed.title || found.title,
          artist: parsed.artist || found.artist,
          duration: found.duration || secs,
          thumb: (meta && meta.image) || found.thumb,
          options: [{ key: 'a', kind: 'audio', height: 0, label: '🎵 MP3' }],
          searched: true,
        };
      }
    }
  } else if (platform === 'spotify') {
    const base = await spotifyMeta(rawUrl).catch(() => null);
    const query = base ? `${base.title || ''} ${base.artist || ''}`.trim() : '';
    const found =
      (await resolveSearch(query || rawUrl).catch(() => null)) ||
      (base && base.title ? await resolveSearch(base.title).catch(() => null) : null);
    if (base || found) {
      out = {
        ok: true,
        platform,
        source: (found && found.url) || `ytsearch1:${query || (base && base.title) || ''}`,
        title: (base && base.title) || (found && found.title) || query,
        artist: (base && base.artist) || (found && found.artist) || '',
        duration: (found && found.duration) || 0,
        thumb: (base && base.image) || (found && found.thumb) || '',
        options: [{ key: 'a', kind: 'audio', height: 0, label: '🎵 MP3' }],
        searched: true,
      };
    }
  }

  if (!out || !out.options.length) return { ok: false, platform };
  cache.set(rawUrl, { at: Date.now(), info: out });
  if (cache.size > 200) {
    for (const [k, v] of cache) if (Date.now() - v.at > CACHE_TTL) cache.delete(k);
  }
  return out;
}

/** متن پیش‌نمایش (کپشن عکس کاور) */
function caption(lang, data) {
  const L = lang === 'en';
  const lines = [`📀 ${label(data.platform, lang)}`];
  if (data.title) lines.push(`${L ? 'Title' : 'عنوان'}: ${data.title.slice(0, 120)}`);
  if (data.artist) lines.push(`${L ? 'Artist' : 'هنرمند'}: ${data.artist.slice(0, 80)}`);
  if (data.duration) lines.push(`${L ? 'Duration' : 'مدت'}: ${fmtDur(data.duration)}`);
  if (data.searched) lines.push(L ? 'Source: YouTube search of this track' : 'منبع دانلود: جست‌وجوی همان آهنگ در یوتیوب');
  lines.push('');
  lines.push(L ? 'Choose the quality:' : 'کیفیت را انتخاب کن:');
  return lines.join('\n').slice(0, 1000);
}

/** کیبورد انتخاب کیفیت (callback: q|<pid>|<key>) */
function keyboard(pid, data) {
  const rows = [];
  let row = [];
  for (const o of data.options) {
    row.push({ text: o.label, callback_data: `q|${pid}|${o.key}` });
    if (row.length === 2) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  if (data.platform === 'pinterest') rows.push([{ text: '🖼 همهٔ تصاویر / All images', callback_data: `q|${pid}|gal` }]);
  return { inline_keyboard: rows };
}

function optionByKey(data, key) {
  return (data.options || []).find((o) => o.key === key) || null;
}

module.exports = {
  detect,
  supportsPreview,
  label,
  info,
  caption,
  keyboard,
  optionByKey,
  resolveByPage,
  resolveSearch,
  fmtDur,
  fmtMb,
  pickThumb,
};



