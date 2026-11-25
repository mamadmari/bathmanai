// Round trip test for a SHORT on the Nobitex margin wallet, with the fixed
// cancel path. usage: node server/scripts/live-test-short2.mjs XRPUSDT 3 CONFIRM
const [symbol, usdtRaw, confirm] = process.argv.slice(2);
if (confirm !== 'CONFIRM') {
  console.log('refusing: pass CONFIRM');
  process.exit(1);
}
const usd = Number(usdtRaw);
const ex = await import('/opt/trading-wolf/server/dist/exchanges.js');
const call = ex.nobitexCall;
const a = ex.getExecutionAdapter('nobitex', 'spot');
const snap = async (label) => {
  const w = await call('POST', '/users/wallets/list', { type: 'margin' });
  const bal = (w?.wallets ?? []).find((x) => x.currency === 'rls');
  const pos = await call('GET', '/positions/list?status=active');
  const open = (await call('GET', '/market/orders/list?status=open'))?.orders ?? [];
  console.log(label, JSON.stringify({
    rial: bal?.balance,
    blocked: bal?.blockedBalance,
    available: await a.availableMargin(),
    positions: (pos?.positions ?? []).map((p) => [p.id, p.srcCurrency, p.side, p.delegatedAmount, p.collateral]),
    openOrders: open.map((o) => [o.srcCurrency, o.type, o.amount, o.matchedAmount]),
  }));
};
await snap('BEFORE');
const t = await a.ticker(symbol);
const qty = Number((usd / t.price).toFixed(8));
console.log('OPEN SELL', symbol, qty, '@', t.price);
const open = await a.placeOrder({ symbol, side: 'sell', qty, price: t.price, leverage: 1, idempotencyKey: 'sh2' + Date.now() });
console.log('OPEN RESULT', JSON.stringify(open));
await snap('AFTER_OPEN');
if (open.ok && open.filledQty) {
  const close = await a.closePosition(symbol, 'short', open.filledQty, 'sh2c' + Date.now());
  console.log('CLOSE RESULT', JSON.stringify(close));
  await new Promise((r) => setTimeout(r, 4000));
  await snap('AFTER_CLOSE');
}
process.exit(0);
