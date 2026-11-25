// One-shot guarded live order in a rial (toman) market: <COIN>-rls.
// usage: node server/scripts/live-test-order-rls.mjs DOGE 1.5 CONFIRM   (1.5 = million toman)
const [coinRaw, mTomanRaw, confirm] = process.argv.slice(2);
if (confirm !== 'CONFIRM') { console.log('refusing: pass CONFIRM'); process.exit(1); }
const coin = String(coinRaw || '').toLowerCase();
const mToman = Number(mTomanRaw);
if (!/^[a-z0-9]{2,10}$/.test(coin) || !(mToman >= 0.5 && mToman <= 3)) { console.log('refusing: coin + 0.5..3 (million toman)'); process.exit(1); }
const ex = await import('/opt/trading-wolf/server/dist/exchanges.js');
const call = ex.nobitexCall;
const stats = await (await fetch(`https://apiv2.nobitex.ir/market/stats?srcCurrency=${coin}&dstCurrency=rls`)).json();
const st = (stats?.stats || {})[`${coin}-rls`] || {};
const price = Number(st.latest);
if (!(price > 0)) { console.log('no price for', coin + '-rls'); process.exit(1); }
const rialBudget = Math.floor(mToman * 1_000_000);
const limit = Math.ceil((price * 1.01) / 10) * 10;
const qty = Math.floor((rialBudget / limit) * 100) / 100;
console.log('market', coin + '-rls', 'last', price, 'limit', limit, 'qty', qty, 'cost rial ~', Math.round(qty * limit));
if (!(qty > 0)) { console.log('qty too small'); process.exit(1); }
const body = {
  type: 'buy', execution: 'limit',
  srcCurrency: coin, dstCurrency: 'rls',
  amount: String(qty), price: String(limit),
  clientOrderId: 'wolftest' + Date.now(),
};
const res = await call('POST', '/market/orders/add', body);
console.log('RESPONSE:', JSON.stringify(res).slice(0, 500));
process.exit(0);
