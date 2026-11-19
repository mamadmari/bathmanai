'use strict';
/**
 * تونل پروکسی بدون وابستگی: SOCKS5 و HTTP CONNECT.
 * در سرورهایی که api.telegram.org بلاک است، با TG_PROXY فعال می‌شود.
 * نمونه: socks5://user:pass@host:1080 یا http://host:8080
 */
const net = require('node:net');
const tls = require('node:tls');

function parseProxy(str) {
  if (!str) return null;
  try {
    const u = new URL(str);
    const protocol = u.protocol.replace(':', '').toLowerCase();
    if (!['socks5', 'socks5h', 'socks', 'http', 'https'].includes(protocol)) return null;
    return {
      protocol: protocol === 'socks' ? 'socks5' : protocol,
      host: u.hostname,
      port: Number(u.port) || (protocol.startsWith('socks') ? 1080 : 8080),
      username: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
    };
  } catch {
    return null;
  }
}

/** دقیقاً n بایت از سوکت می‌خواند (حالت paused، بدون گم‌شدن داده) */
function readBytes(sock, n) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let len = 0;
    sock.pause();
    const cleanup = () => {
      sock.off('readable', onReadable);
      sock.off('error', onError);
      sock.off('end', onEnd);
    };
    const onReadable = () => {
      let chunk;
      while ((chunk = sock.read()) !== null) {
        chunks.push(chunk);
        len += chunk.length;
      }
      if (len < n) return;
      cleanup();
      const all = Buffer.concat(chunks);
      if (all.length > n) sock.unshift(all.subarray(n));
      resolve(all.subarray(0, n));
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onEnd = () => {
      cleanup();
      reject(new Error('socket closed during handshake'));
    };
    sock.on('readable', onReadable);
    sock.on('error', onError);
    sock.on('end', onEnd);
    onReadable();
  });
}

/** تا رسیدن \r\n\r\n می‌خواند (برای پاسخ CONNECT) */
function readUntil(sock, marker) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const m = Buffer.from(marker, 'latin1');
    sock.pause();
    const cleanup = () => {
      sock.off('readable', onReadable);
      sock.off('error', onError);
      sock.off('end', onEnd);
    };
    const onReadable = () => {
      let chunk;
      while ((chunk = sock.read()) !== null) buf = Buffer.concat([buf, chunk]);
      const idx = buf.indexOf(m);
      if (idx < 0) return;
      cleanup();
      const rest = buf.subarray(idx + m.length);
      if (rest.length) sock.unshift(rest);
      resolve(buf.subarray(0, idx + m.length).toString('latin1'));
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onEnd = () => {
      cleanup();
      reject(new Error('socket closed during handshake'));
    };
    sock.on('readable', onReadable);
    sock.on('error', onError);
    sock.on('end', onEnd);
    onReadable();
  });
}

async function socks5(sock, p, host, port) {
  const useAuth = !!(p.username || p.password);
  sock.write(Buffer.from(useAuth ? [5, 2, 0, 2] : [5, 1, 0]));
  const hello = await readBytes(sock, 2);
  if (hello[0] !== 5) throw new Error('socks: bad version');
  const method = hello[1];
  if (method === 2) {
    const u = Buffer.from(p.username);
    const pw = Buffer.from(p.password);
    sock.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([pw.length]), pw]));
    const auth = await readBytes(sock, 2);
    if (auth[1] !== 0) throw new Error('socks: auth failed');
  } else if (method !== 0) {
    throw new Error('socks: no acceptable auth');
  }

  const name = Buffer.from(host);
  const req = Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([port >> 8, port & 255])]);
  sock.write(req);
  const head = await readBytes(sock, 4);
  if (head[1] !== 0) throw new Error(`socks: connect failed (${head[1]})`);
  const atyp = head[3];
  if (atyp === 1) await readBytes(sock, 4 + 2);
  else if (atyp === 4) await readBytes(sock, 16 + 2);
  else if (atyp === 3) {
    const len = (await readBytes(sock, 1))[0];
    await readBytes(sock, len + 2);
  } else throw new Error('socks: bad address type');
}

async function httpConnect(sock, p, host, port) {
  const auth = p.username ? `Proxy-Authorization: Basic ${Buffer.from(`${p.username}:${p.password}`).toString('base64')}\r\n` : '';
  sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`);
  const head = await readUntil(sock, '\r\n\r\n');
  if (!/^HTTP\/1\.[01] 200/i.test(head)) throw new Error(`proxy: ${head.split('\r\n')[0] || 'connect failed'}`);
}

/** سوکت تونل‌شده تا مقصد برمی‌گرداند */
function tunnel(p, host, port, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: p.host, port: p.port });
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error('proxy timeout'));
    }, timeoutMs);
    sock.setNoDelay(true);
    sock.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    sock.once('connect', async () => {
      try {
        if (p.protocol.startsWith('socks')) await socks5(sock, p, host, port);
        else await httpConnect(sock, p, host, port);
        clearTimeout(timer);
        sock.removeAllListeners('error');
        sock.resume();
        resolve(sock);
      } catch (err) {
        clearTimeout(timer);
        sock.destroy();
        reject(err);
      }
    });
  });
}

/** اتصال TLS روی تونل */
async function tlsTunnel(p, host, port, timeoutMs) {
  const sock = await tunnel(p, host, port, timeoutMs);
  return new Promise((resolve, reject) => {
    const t = tls.connect({ socket: sock, servername: host }, () => resolve(t));
    t.once('error', reject);
    t.setTimeout(timeoutMs, () => t.destroy(new Error('tls timeout')));
  });
}

module.exports = { parseProxy, tunnel, tlsTunnel };
