// Guarded live SHORT test on the Nobitex margin wallet.
// usage: node server/scripts/live-test-short.mjs XRPUSDT 3 CONFIRM
const [symbol, usdtRaw, confirm] = process.argv.slice(2);
if (confirm !== 'CONFIRM') {
  console.log('refusing: pass CONFIRM as the third argument');
  process.exit(1);
}
const usd = Number(usdtRaw);
if (!symbol || !(usd >= 3 && usd <= 10)) {
  console.log('refusing: symbol required and 3 <= usdt <= 10');
  process.exit(1);
}
const ex = await import('/opt/trading-wolf/server/dist/exchanges.js');
const a = ex.getExecutionAdapter('nobitex', 'spot');
console.log('short allowed:', await ex.nobitexAllowsShort());
console.log('available usdt:', await a.availableMargin());
const t = await a.ticker(symbol);
if (!t?.price) {
  console.log('no ticker for', symbol);
  process.exit(1);
}
const qty = Number((usd / t.price).toFixed(8));
console.log('placing margin SELL', symbol, 'qty', qty, 'ref price', t.price);
const open = await a.placeOrder({ symbol, side: 'sell', qty, price: t.price, leverage: 1, idempotencyKey: 'shorts' + Date.now() });
console.log('OPEN:', JSON.stringify(open));
const pos = await ex.nobitexCall('GET', '/positions/list?status=active');
console.log('POSITIONS', JSON.stringify((pos?.positions ?? []).map((p) => [p.id, p.srcCurrency, p.side, p.status, p.delegatedAmount, p.leverage])));
if (open.ok && open.filledQty) {
  const close = await a.closePosition(symbol, 'short', open.filledQty, 'shortc' + Date.now());
  console.log('CLOSE:', JSON.stringify(close));
  const after = await ex.nobitexCall('GET', '/positions/list?status=active');
  console.log('ACTIVE_AFTER', JSON.stringify((after?.positions ?? []).map((p) => [p.id, p.status])));
  const w = await ex.nobitexCall('POST', '/users/wallets/list', { type: 'margin' });
  console.log('MARGIN_WALLET', JSON.stringify((w?.wallets ?? []).map((x) => [x.currency, x.balance])));
}
process.exit(0);
