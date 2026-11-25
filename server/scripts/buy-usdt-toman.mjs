// Converts toman (IRT/RLS wallet) into USDT through the usdt-rls market.
// usage: node server/scripts/buy-usdt-toman.mjs 10.5 CONFIRM
const [usdtRaw, confirm] = process.argv.slice(2);
if (confirm !== 'CONFIRM') { console.log('refusing: pass CONFIRM'); process.exit(1); }
const want = Number(usdtRaw);
if (!(want >= 1 && want <= 50)) { console.log('refusing: 1 <= usdt <= 50'); process.exit(1); }
const ex = await import('/opt/trading-wolf/server/dist/exchanges.js');
const call = ex.nobitexCall;
const stats = await (await fetch('https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls')).json();
const last = Number((stats?.stats?.['usdt-rls'] || {}).latest);
if (!(last > 0)) { console.log('no usdt-rls price'); process.exit(1); }
const price = Math.ceil((last * 1.005) / 10) * 10;
const wallets = (await call('GET', '/users/wallets/list'))?.wallets ?? [];
let rialFree = 0;
for (const w of wallets) {
  const c = String(w.currency || '').toUpperCase();
  if (c === 'RLS' || c === 'IRT') rialFree += Number(w.balance || 0) - Number(w.blocked || 0);
}
const maxUsdt = Math.floor((rialFree / price) * 100) / 100;
const amount = Math.min(want, maxUsdt);
console.log('rial free', rialFree, 'market(rial)', last, 'limit price', price, 'max usdt', maxUsdt, 'buying', amount);
if (!(amount >= 1)) { console.log('not enough toman'); process.exit(1); }
const body = {
  type: 'buy', execution: 'limit',
  srcCurrency: 'usdt', dstCurrency: 'rls',
  amount: String(amount.toFixed(2)), price: String(price),
  clientOrderId: 'wolfusdt' + Date.now(),
};
const res = await call('POST', '/market/orders/add', body);
console.log('RESPONSE:', JSON.stringify(res).slice(0, 600));
process.exit(0);
