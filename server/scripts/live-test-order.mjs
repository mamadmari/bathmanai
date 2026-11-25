// One-shot guarded live order for Nobitex.
// usage: node server/scripts/live-test-order.mjs XRPUSDT 5 CONFIRM
const [symbol, usdtRaw, confirm] = process.argv.slice(2);
if (confirm !== 'CONFIRM') {
  console.log('refusing: pass CONFIRM as the third argument');
  process.exit(1);
}
const usd = Number(usdtRaw);
if (!symbol || !(usd >= 3 && usd <= 20)) {
  console.log('refusing: symbol required and 3 <= usdt <= 20');
  process.exit(1);
}
const ex = await import('/opt/trading-wolf/server/dist/exchanges.js');
const a = ex.getExecutionAdapter('nobitex', 'spot');
const available = await a.availableMargin();
console.log('available usdt:', available);
if (!(Number(available) >= usd)) { console.log('balance too low for this order'); process.exit(1); }
const t = await a.ticker(symbol);
if (!t?.price) { console.log('no ticker for', symbol); process.exit(1); }
const qty = Number((usd / t.price).toFixed(8));
console.log('placing market buy', symbol, 'qty', qty, 'approx usdt', usd, 'price', t.price);
const res = await a.placeOrder({ symbol, side: 'buy', qty, price: t.price, leverage: 1, idempotencyKey: 'livetest-' + Date.now() });
console.log('EXCHANGE RESPONSE:', JSON.stringify(res));
process.exit(0);
