// One-shot guarded live close for Nobitex: sells the whole free balance of the
// coin behind `<SYMBOL>USDT` in whatever quote market the adapter picks.
// usage: node server/scripts/live-test-close.mjs XRPUSDT CONFIRM
const [symbol, confirm] = process.argv.slice(2);
if (confirm !== 'CONFIRM') {
  console.log('refusing: pass CONFIRM as the second argument');
  process.exit(1);
}
const base = String(symbol || '').trim().toUpperCase().replace(/USDT$/, '');
if (!/^[A-Z0-9]{2,10}$/.test(base)) {
  console.log('refusing: symbol required (e.g. XRPUSDT)');
  process.exit(1);
}
const ex = await import('/opt/trading-wolf/server/dist/exchanges.js');
const a = ex.getExecutionAdapter('nobitex', 'spot');
const wallets = (await ex.nobitexCall('GET', '/users/wallets/list'))?.wallets ?? [];
const row = wallets.find((w) => String(w.currency).toUpperCase() === base);
const free = row ? Number(row.balance) - Number(row.blocked || 0) : 0;
console.log('free', base, free);
if (!(free > 0)) {
  console.log('nothing to sell');
  process.exit(0);
}
const t = await a.ticker(base + 'USDT');
if (!t?.price) {
  console.log('no ticker for', base);
  process.exit(1);
}
const qty = Number(free.toFixed(8));
console.log('placing sell', base + 'USDT', 'qty', qty, 'price', t.price);
const res = await a.placeOrder({ symbol: base + 'USDT', side: 'sell', qty, price: t.price, leverage: 1, idempotencyKey: 'liveclose-' + Date.now() });
console.log('EXCHANGE RESPONSE:', JSON.stringify(res));
const after = (await ex.nobitexCall('GET', '/users/wallets/list'))?.wallets ?? [];
console.log('WALLETS', JSON.stringify(after.filter((w) => Number(w.balance) > 0).map((w) => [w.currency, w.balance])));
process.exit(0);
