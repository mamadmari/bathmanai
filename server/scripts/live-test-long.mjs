// Guarded live LONG round trip on the Nobitex margin wallet (open + close).
// usage: node server/scripts/live-test-long.mjs XRPUSDT 3 CONFIRM
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
const call = ex.nobitexCall;
console.log('allowsShort', await ex.nobitexAllowsShort(), 'available', await a.availableMargin());
const t = await a.ticker(symbol);
if (!t?.price) {
  console.log('no ticker for', symbol);
  process.exit(1);
}
const qty = Number((usd / t.price).toFixed(8));
console.log('OPEN buy', symbol, qty, '@', t.price);
const open = await a.placeOrder({ symbol, side: 'buy', qty, price: t.price, leverage: 1, idempotencyKey: 'long' + Date.now() });
console.log('OPEN:', JSON.stringify(open));
const act = await call('GET', '/positions/list?status=active');
const mine = (act?.positions ?? [])
  .filter((p) => String(p.srcCurrency).toUpperCase() === symbol.replace(/USDT$/, ''))
  .sort((x, y) => Number(y.delegatedAmount) - Number(x.delegatedAmount))[0];
console.log('POSITION', mine ? JSON.stringify({ id: mine.id, delegated: mine.delegatedAmount, collateral: mine.collateral, side: mine.side }) : 'none');
if (open.ok && open.filledQty) {
  const close = await a.closePosition(symbol, 'long', open.filledQty, 'longc' + Date.now());
  console.log('CLOSE:', JSON.stringify(close));
  const after = await call('GET', '/positions/list?status=active');
  console.log('ACTIVE_AFTER', JSON.stringify((after?.positions ?? []).map((p) => [p.id, p.srcCurrency, p.delegatedAmount, p.collateral])));
  const w = await call('POST', '/users/wallets/list', { type: 'margin' });
  console.log('WALLET', JSON.stringify((w?.wallets ?? []).map((x) => [x.currency, x.balance, x.blockedBalance])));
  console.log('available after', await a.availableMargin());
}
process.exit(0);
