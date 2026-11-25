// Guarded live MARGIN (تعهدی) test order on Nobitex.
// usage: node server/scripts/live-test-margin.mjs DOGE 1.5 buy|sell CONFIRM
const [coinRaw, mTomanRaw, sideRaw, confirm] = process.argv.slice(2);
if (confirm !== 'CONFIRM') {
  console.log('refusing: pass CONFIRM as the last argument');
  process.exit(1);
}
const coin = String(coinRaw || '').toLowerCase();
const mToman = Number(mTomanRaw);
const side = sideRaw === 'sell' ? 'sell' : 'buy';
if (!/^[a-z0-9_]{2,10}$/.test(coin) || !(mToman >= 0.6 && mToman <= 3)) {
  console.log('refusing: coin + 0.6..3 (million toman) + buy|sell');
  process.exit(1);
}
const ex = await import('/opt/trading-wolf/server/dist/exchanges.js');
const call = ex.nobitexCall;
const w = await call('POST', '/users/wallets/list', { type: 'margin' });
const rial = (w?.wallets ?? []).filter((x) => x.currency === 'rls').reduce((a, x) => a + Number(x.balance), 0);
console.log('margin rial', rial);
const book = await (await fetch(`https://apiv2.nobitex.ir/v3/orderbook/${coin.toUpperCase()}IRT`)).json();
const levels = (side === 'buy' ? book?.asks : book?.bids ?? []).map((l) => Number(l?.[0])).filter((v) => v > 0);
const touch = levels.length ? (side === 'buy' ? Math.min(...levels) : Math.max(...levels)) : 0;
if (!(touch > 0)) {
  console.log('no rial book for', coin);
  process.exit(1);
}
const budget = Math.floor(mToman * 1_000_000);
const target = side === 'buy' ? touch : touch * 1.0;
const qty = Math.floor((budget / target) * 100) / 100;
console.log('market', coin.toUpperCase() + 'IRT', 'side', side, 'touch', touch, 'qty', qty, 'notional ~', Math.round(qty * touch), 'rial');
const body = {
  type: side,
  execution: 'limit',
  srcCurrency: coin,
  dstCurrency: 'rls',
  amount: String(qty),
  price: String(Math.round(touch)),
  leverage: '1',
  clientOrderId: 'wolfmgn' + Date.now(),
};
console.log('REQUEST', JSON.stringify(body));
const res = await call('POST', '/margin/orders/add', body);
console.log('RESPONSE', JSON.stringify(res).slice(0, 600));
const id = res?.order?.id;
if (id) {
  await new Promise((r) => setTimeout(r, 2500));
  try {
    const st = await call('POST', '/market/orders/status', { id: Number(id) });
    console.log('STATUS', JSON.stringify(st?.order ?? st).slice(0, 400));
  } catch (e) {
    console.log('STATUS ERR', String(e.message).slice(0, 120));
  }
}
const pos = await call('GET', '/positions/list?status=active');
console.log('POSITIONS', JSON.stringify(pos?.positions ?? pos).slice(0, 700));
process.exit(0);
