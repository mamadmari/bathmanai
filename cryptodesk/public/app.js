/* ------------------------------------------------------------------
   CryptoDesk – منطق رابط کاربری
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var chart = null;

  var state = {
    symbol: 'BTCUSDT',
    interval: '1h',
    symbols: [],
    names: {},
    tickers: {},
    candles: [],
    markets: [],
    global: null,
    watchlist: [],
    usdRate: 100000,
    source: '—',
    updatedAt: 0,
    chartRequest: 0,
    lastOk: 0,
    lastError: 0,
    errorShown: false
  };

  /* ------------------------------ ابزار ------------------------------ */
  function num(id) {
    var node = $(id);
    if (!node) return 0;
    var v = parseFloat(String(node.value).replace(/,/g, ''));
    return isFinite(v) ? v : 0;
  }

  function fmtPriceSmart(v) {
    if (!isFinite(v) || v === 0) return '0';
    var abs = Math.abs(v);
    var d = abs >= 1000 ? 2 : abs >= 10 ? 3 : abs >= 1 ? 4 : abs >= 0.01 ? 5 : abs >= 0.0001 ? 7 : 9;
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtMoney(v, digits) {
    if (!isFinite(v)) return '—';
    var d = digits == null ? 2 : digits;
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtCompact(v) {
    if (!isFinite(v) || v === 0) return '0';
    var abs = Math.abs(v);
    if (abs >= 1e12) return (v / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toFixed(abs >= 1 ? 2 : 4);
  }

  function fmtQty(v) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    if (Math.abs(v) >= 1000) return fmtMoney(v, 2);
    return parseFloat(v.toFixed(6)).toLocaleString('en-US', { maximumFractionDigits: 6 });
  }

  function fmtPct(v) {
    if (!isFinite(v)) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  }

  function dirClass(v) {
    if (!isFinite(v) || Math.abs(v) < 0.0001) return 'flat';
    return v > 0 ? 'up' : 'down';
  }

  function pairLabel(symbol) {
    var quotes = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'BTC', 'ETH'];
    for (var i = 0; i < quotes.length; i++) {
      var q = quotes[i];
      if (symbol.length > q.length && symbol.slice(-q.length) === q) {
        return symbol.slice(0, -q.length) + '/' + q;
      }
    }
    return symbol;
  }

  function baseOf(symbol) {
    return symbol.replace(/(USDT|USDC|BUSD|FDUSD)$/, '');
  }

  function displayName(symbol) {
    var base = baseOf(symbol);
    return state.names[base] || base;
  }

  function api(path) {
    return fetch(path, { cache: 'no-store' }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
        return json;
      });
    });
  }

  function store(key, value) {
    try {
      if (value === undefined) {
        var raw = localStorage.getItem(key);
        return raw == null ? null : JSON.parse(raw);
      }
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* localStorage ممکن است غیرفعال باشد */
    }
    return null;
  }

  function toast(message, type) {
    var stack = $('toasts');
    if (!stack) return;
    var node = document.createElement('div');
    node.className = 'toast' + (type ? ' ' + type : '');
    node.textContent = message;
    stack.appendChild(node);
    setTimeout(function () {
      node.style.opacity = '0';
      node.style.transform = 'translateY(6px)';
      setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 220);
    }, 4200);
  }

  function setConn(mode, text) {
    var badge = $('connBadge');
    if (!badge) return;
    badge.setAttribute('data-state', mode);
    $('connText').textContent = text;
  }

  function timeAgo(ts) {
    if (!ts) return '—';
    var diff = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (diff < 5) return 'همین حالا';
    if (diff < 60) return diff + ' ثانیه پیش';
    if (diff < 3600) return Math.round(diff / 60) + ' دقیقه پیش';
    return Math.round(diff / 3600) + ' ساعت پیش';
  }

  /* ------------------------------ تنظیمات ذخیره‌شده ------------------------------ */
  var INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

  function loadPrefs() {
    var savedSymbol = store('cd:symbol');
    if (typeof savedSymbol === 'string' && savedSymbol.length >= 5) state.symbol = savedSymbol.toUpperCase();
    var savedInterval = store('cd:interval');
    if (INTERVALS.indexOf(savedInterval) >= 0) state.interval = savedInterval;
    var savedWatch = store('cd:watchlist');
    if (Array.isArray(savedWatch)) {
      state.watchlist = savedWatch.filter(function (s) { return typeof s === 'string' && s.length >= 5; }).slice(0, 30);
    }
    if (!state.watchlist.length) state.watchlist = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
    var rate = Number(store('cd:usdRate'));
    if (isFinite(rate) && rate > 0) state.usdRate = rate;
  }

  function initChart() {
    chart = new window.CryptoChart($('chartCanvas'), $('chartTooltip'));
    chart.setInterval(state.interval);
  }

  /* ------------------------------ فهرست نمادها ------------------------------ */
  function loadSymbols() {
    return api('/api/symbols').then(function (res) {
      state.symbols = res.symbols || [];
      state.symbols.forEach(function (item) {
        state.names[item.base] = item.name;
      });
      renderSymbolList($('symbolList'), '');
      renderSymbolList($('watchSearchList'), '');
    }).catch(function () {
      /* فهرست نمادها اختیاری است؛ جست‌وجوی دستی همچنان کار می‌کند */
    });
  }

  function renderSymbolList(target, query) {
    if (!target) return;
    var raw = String(query || '').trim();
    var q = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

    var items = state.symbols.filter(function (item) {
      if (!q) return true;
      return item.symbol.indexOf(q) >= 0 || item.base.indexOf(q) >= 0 || String(item.name || '').indexOf(raw) >= 0;
    }).slice(0, 60);

    target.innerHTML = '';

    function addOption(symbol, label, name) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'symbol-option';
      btn.setAttribute('data-symbol', symbol);

      var sym = document.createElement('span');
      sym.className = 'sym';
      sym.textContent = label;

      var nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = name;

      btn.appendChild(sym);
      btn.appendChild(nm);
      target.appendChild(btn);
    }

    items.forEach(function (item) {
      addOption(item.symbol, item.label, item.name);
    });

    if (!items.length && q.length >= 2) {
      var custom = /(USDT|USDC|BUSD|FDUSD)$/.test(q) ? q : q + 'USDT';
      addOption(custom, pairLabel(custom), 'استفاده از این نماد');
    }

    if (!target.children.length) {
      var empty = document.createElement('div');
      empty.className = 'hint';
      empty.style.padding = '10px';
      empty.textContent = 'نمادی یافت نشد.';
      target.appendChild(empty);
    }
  }

  /* ------------------------------ نمودار ------------------------------ */
  function loadChart() {
    var req = ++state.chartRequest;
    var overlay = $('chartOverlay');
    if (overlay) {
      overlay.hidden = false;
      overlay.textContent = 'در حال دریافت نمودار ' + pairLabel(state.symbol) + '…';
    }

    var url = '/api/klines?symbol=' + encodeURIComponent(state.symbol) +
      '&interval=' + state.interval + '&limit=400';

    api(url).then(function (res) {
      if (req !== state.chartRequest) return;
      state.candles = res.candles || [];
      state.source = res.source || '—';
      state.updatedAt = Date.now();
      state.lastOk = Date.now();
      state.errorShown = false;

      if (chart) {
        chart.setInterval(state.interval);
        chart.setData(state.candles);
      }
      if (overlay) overlay.hidden = true;

      updateChartHeader();
      updateChartMeta(res);
      syncCalculatorPrices(false);
      setConn('live', 'اتصال زنده');
    }).catch(function (err) {
      if (req !== state.chartRequest) return;
      if (overlay) {
        overlay.hidden = false;
        overlay.textContent = 'دریافت داده ناموفق بود؛ تلاش دوباره…';
      }
      setConn('error', 'قطع ارتباط');
      if (!state.errorShown) {
        toast('خطا در دریافت داده: ' + err.message, 'error');
        state.errorShown = true;
      }
    });
  }

  function currentTicker() {
    var t = state.tickers[state.symbol];
    if (t && t.last) return t;
    if (!state.candles.length) return null;
    var last = state.candles[state.candles.length - 1];
    return {
      symbol: state.symbol,
      last: last[4],
      changePct: last[1] ? ((last[4] - last[1]) / last[1]) * 100 : 0,
      high: last[2],
      low: last[3],
      volume: last[5],
      quoteVolume: 0
    };
  }

  function updateChartHeader() {
    var t = currentTicker();
    if (!t) return;

    $('lastPrice').textContent = fmtPriceSmart(t.last);

    var chg = $('priceChange');
    chg.textContent = fmtPct(t.changePct);
    chg.className = 'price-change ' + (t.changePct >= 0 ? 'up' : 'down');

    $('statHigh').textContent = t.high ? fmtPriceSmart(t.high) : '—';
    $('statLow').textContent = t.low ? fmtPriceSmart(t.low) : '—';
    $('statVol').textContent = t.quoteVolume ? '$' + fmtCompact(t.quoteVolume) : '—';

    document.title = pairLabel(state.symbol) + ' | ' + fmtPriceSmart(t.last) + ' | CryptoDesk';
  }

  function updateChartMeta(res) {
    $('chartSource').textContent = 'منبع: ' + String(res.source || '—');
    $('chartUpdated').textContent = 'آخرین بروزرسانی: ' + timeAgo(Date.now());
  }

  function setSymbol(symbol) {
    if (!symbol) return;
    state.symbol = String(symbol).toUpperCase();
    store('cd:symbol', state.symbol);
    var labelNode = $('symbolBtnText');
    if (labelNode) labelNode.textContent = pairLabel(state.symbol);
    closeSymbolMenu();
    hideWatchModal();
    loadChart();
    requestTickers();
  }

  /* ------------------------------ قیمت‌های لحظه‌ای ------------------------------ */
  function requestTickers() {
    var wanted = [];
    function push(symbol) {
      if (symbol && wanted.indexOf(symbol) < 0) wanted.push(symbol);
    }
    state.symbols.slice(0, 14).forEach(function (item) { push(item.symbol); });
    state.watchlist.forEach(push);
    push(state.symbol);
    wanted = wanted.slice(0, 60);
    if (!wanted.length) return Promise.resolve();

    return api('/api/tickers?symbols=' + wanted.join(',')).then(function (res) {
      (res.tickers || []).forEach(function (t) {
        state.tickers[t.symbol] = t;
      });
      state.lastOk = Date.now();
      setConn('live', 'اتصال زنده');
      renderTickerStrip();
      renderWatchlist();
      updateChartHeader();
      updateDcaMarketPrice();
    }).catch(function () {
      setConn('error', 'قطع ارتباط');
    });
  }

  function renderTickerStrip() {
    var track = $('tickerTrack');
    if (!track) return;

    var order = [];
    function push(symbol) {
      if (state.tickers[symbol] && order.indexOf(symbol) < 0) order.push(symbol);
    }
    state.watchlist.forEach(push);
    state.symbols.forEach(function (item) { push(item.symbol); });
    Object.keys(state.tickers).forEach(push);
    order = order.slice(0, 20);

    track.innerHTML = '';

    if (!order.length) {
      var ph = document.createElement('span');
      ph.className = 'ticker-placeholder';
      ph.textContent = 'در حال دریافت قیمت‌ها…';
      track.appendChild(ph);
      return;
    }

    order.forEach(function (symbol) {
      var t = state.tickers[symbol];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ticker-item' + (symbol === state.symbol ? ' active' : '');
      btn.setAttribute('data-symbol', symbol);

      var sym = document.createElement('span');
      sym.className = 'ticker-sym';
      sym.textContent = pairLabel(symbol);

      var price = document.createElement('span');
      price.className = 'ticker-price';
      price.textContent = fmtPriceSmart(t.last);

      var chg = document.createElement('span');
      chg.className = 'ticker-chg ' + dirClass(t.changePct);
      chg.textContent = fmtPct(t.changePct);

      btn.appendChild(sym);
      btn.appendChild(price);
      btn.appendChild(chg);
      track.appendChild(btn);
    });
  }

  /* ------------------------------ علاقه‌مندی‌ها ------------------------------ */
  function renderWatchlist() {
    var list = $('watchList');
    var empty = $('watchEmpty');
    if (!list) return;

    list.innerHTML = '';
    state.watchlist.forEach(function (symbol) {
      var t = state.tickers[symbol];
      var li = document.createElement('li');
      li.className = 'watch-row';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'watch-sym';
      var sym = document.createElement('span');
      sym.className = 'sym';
      sym.textContent = pairLabel(symbol);
      var nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = displayName(symbol);
      btn.appendChild(sym);
      btn.appendChild(nm);
      btn.addEventListener('click', function () { setSymbol(symbol); });

      var price = document.createElement('span');
      price.className = 'watch-price';
      price.textContent = t && t.last ? fmtPriceSmart(t.last) : '…';

      var chg = document.createElement('span');
      var pct = t ? t.changePct : NaN;
      chg.className = 'watch-chg ' + dirClass(pct);
      chg.textContent = isFinite(pct) ? fmtPct(pct) : '—';

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'watch-remove';
      del.title = 'حذف از علاقه‌مندی‌ها';
      del.textContent = '×';
      del.addEventListener('click', function () {
        state.watchlist = state.watchlist.filter(function (s) { return s !== symbol; });
        store('cd:watchlist', state.watchlist);
        renderWatchlist();
        renderTickerStrip();
        toast(pairLabel(symbol) + ' از علاقه‌مندی‌ها حذف شد');
      });

      li.appendChild(btn);
      li.appendChild(price);
      li.appendChild(chg);
      li.appendChild(del);
      list.appendChild(li);
    });

    if (empty) empty.hidden = state.watchlist.length > 0;
  }

  function addToWatchlist(symbol) {
    symbol = String(symbol || '').toUpperCase();
    if (!symbol) return;
    if (state.watchlist.indexOf(symbol) >= 0) {
      toast(pairLabel(symbol) + ' از قبل در علاقه‌مندی‌هاست');
      return;
    }
    if (state.watchlist.length >= 30) {
      toast('حداکثر ۳۰ نماد می‌توانید اضافه کنید', 'error');
      return;
    }
    state.watchlist.push(symbol);
    store('cd:watchlist', state.watchlist);
    renderWatchlist();
    requestTickers();
    toast(pairLabel(symbol) + ' به علاقه‌مندی‌ها اضافه شد');
  }

  /* ------------------------------ بازار و آمار جهانی ------------------------------ */
  function loadMarkets() {
    return api('/api/markets').then(function (res) {
      state.markets = res.coins || [];
      state.markets.forEach(function (coin) {
        var base = coin.base || coin.symbol;
        if (base && coin.name) state.names[base] = coin.name;
      });
      state.lastOk = Date.now();
      setConn('live', 'اتصال زنده');
      renderMovers();
    }).catch(function () {
      setConn('error', 'قطع ارتباط');
    });
  }

  function renderMovers() {
    var withData = state.markets.filter(function (coin) {
      var base = coin.base || coin.symbol;
      return base && isFinite(coin.change24h) && coin.marketCap > 0;
    });
    var gainers = withData.slice().sort(function (a, b) { return b.change24h - a.change24h; }).slice(0, 4);
    var losers = withData.slice().sort(function (a, b) { return a.change24h - b.change24h; }).slice(0, 4);
    renderMoverList($('gainers'), gainers);
    renderMoverList($('losers'), losers);
  }

  function renderMoverList(target, items) {
    if (!target) return;
    target.innerHTML = '';
    if (!items.length) {
      var ph = document.createElement('li');
      ph.className = 'placeholder';
      ph.textContent = 'در حال دریافت…';
      target.appendChild(ph);
      return;
    }
    items.forEach(function (coin) {
      var base = coin.base || coin.symbol;
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mover-row';
      btn.setAttribute('data-symbol', base + 'USDT');

      var sym = document.createElement('span');
      sym.className = 'sym';
      sym.textContent = base;

      var chg = document.createElement('span');
      chg.className = 'mover-change ' + dirClass(coin.change24h);
      chg.textContent = fmtPct(coin.change24h);

      btn.appendChild(sym);
      btn.appendChild(chg);
      li.appendChild(btn);
      target.appendChild(li);
    });
  }

  function loadGlobal() {
    return api('/api/global').then(function (res) {
      state.global = res;
      state.lastOk = Date.now();
      setConn('live', 'اتصال زنده');

      var g = res.global || res;
      $('gMcap').textContent = '$' + fmtCompact(g.totalMarketCap || 0);
      $('gVol').textContent = '$' + fmtCompact(g.totalVolume || 0);
      $('gBtcDom').textContent = isFinite(g.btcDominance) ? g.btcDominance.toFixed(1) + '%' : '—';

      var chg = $('gChange');
      chg.textContent = fmtPct(g.mcapChange24h || 0);
      chg.className = dirClass(g.mcapChange24h || 0);
      $('overviewUpdated').textContent = 'بروزرسانی: ' + timeAgo(Date.now());
    }).catch(function () {
      setConn('error', 'قطع ارتباط');
    });
  }

  /* ------------------------------ دریافت دوره‌ای ------------------------------ */
  var POLL = { tickers: 6000, chart: 8000, markets: 120000, global: 180000 };

  function startPolling() {
    function loop(name, fn) {
      setInterval(function () {
        if (document.hidden) return;
        fn();
      }, POLL[name]);
    }
    loop('tickers', requestTickers);
    loop('chart', loadChart);
    loop('markets', loadMarkets);
    loop('global', loadGlobal);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        requestTickers();
        loadChart();
      }
    });

    setInterval(function () {
      $('chartUpdated').textContent = 'آخرین بروزرسانی: ' + timeAgo(state.updatedAt);
    }, 5000);
  }

  /* ------------------------------ رویدادهای رابط کاربری ------------------------------ */
  function toggleSymbolMenu(force) {
    var menu = $('symbolMenu');
    var open = force == null ? menu.hidden : force;
    menu.hidden = !open;
    $('symbolBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      $('symbolSearch').value = '';
      renderSymbolList($('symbolList'), '');
      setTimeout(function () { $('symbolSearch').focus(); }, 30);
    }
  }

  function closeSymbolMenu() {
    if (!$('symbolMenu').hidden) toggleSymbolMenu(false);
  }

  function showWatchModal() {
    $('watchModal').hidden = false;
    $('watchSearch').value = '';
    renderSymbolList($('watchSearchList'), '');
    setTimeout(function () { $('watchSearch').focus(); }, 30);
  }

  function hideWatchModal() {
    $('watchModal').hidden = true;
  }

  function bindEvents() {
    /* انتخاب نماد */
    $('symbolBtn').addEventListener('click', function (event) {
      event.stopPropagation();
      toggleSymbolMenu();
    });
    $('symbolSearch').addEventListener('input', function () {
      renderSymbolList($('symbolList'), this.value);
    });
    $('symbolList').addEventListener('click', function (event) {
      var opt = event.target.closest('.symbol-option');
      if (opt) setSymbol(opt.getAttribute('data-symbol'));
    });

    /* کلیک بیرون و کلید Esc */
    document.addEventListener('click', function (event) {
      if (!$('symbolPicker').contains(event.target)) closeSymbolMenu();
      if (!$('watchModal').hidden && event.target === $('watchModal')) hideWatchModal();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeSymbolMenu();
        hideWatchModal();
      }
    });

    /* واچ‌لیست */
    $('addWatchBtn').addEventListener('click', showWatchModal);
    $('watchModalClose').addEventListener('click', hideWatchModal);
    $('watchSearch').addEventListener('input', function () {
      renderSymbolList($('watchSearchList'), this.value);
    });
    $('watchSearchList').addEventListener('click', function (event) {
      var opt = event.target.closest('.symbol-option');
      if (!opt) return;
      addToWatchlist(opt.getAttribute('data-symbol'));
      hideWatchModal();
    });
    $('watchSearch').addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      var raw = this.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!raw) return;
      addToWatchlist(/(USDT|USDC|BUSD|FDUSD)$/.test(raw) ? raw : raw + 'USDT');
      hideWatchModal();
    });

    /* نوار تیکر و برترین‌ها */
    $('tickerTrack').addEventListener('click', function (event) {
      var tick = event.target.closest('.tick');
      if (tick && tick.getAttribute('data-symbol')) setSymbol(tick.getAttribute('data-symbol'));
    });

    function moverClick(event) {
      var btn = event.target.closest('.mover');
      if (btn && btn.getAttribute('data-symbol')) setSymbol(btn.getAttribute('data-symbol'));
    }
    $('gainers').addEventListener('click', moverClick);
    $('losers').addEventListener('click', moverClick);

    /* تایم‌فریم‌ها */
    var tfRow = $('timeframes');
    tfRow.addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-interval]');
      if (!btn) return;
      var interval = btn.getAttribute('data-interval');
      if (interval === state.interval) return;
      state.interval = interval;
      store('cd:interval', interval);
      Array.prototype.forEach.call(tfRow.children, function (b) {
        b.classList.toggle('active', b === btn);
      });
      loadChart();
    });
    Array.prototype.forEach.call(tfRow.children, function (b) {
      b.classList.toggle('active', b.getAttribute('data-interval') === state.interval);
    });

    /* تب ماشین‌حساب‌ها */
    var tabs = document.querySelector('.tabs');
    tabs.addEventListener('click', function (event) {
      var tab = event.target.closest('.tab');
      if (!tab) return;
      var name = tab.getAttribute('data-tab');
      Array.prototype.forEach.call(tabs.querySelectorAll('.tab'), function (t) {
        var active = t === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function (panel) {
        panel.classList.toggle('active', panel.getAttribute('data-panel') === name);
      });
    });

    /* ورودی ماشین‌حساب‌ها */
    Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function (panel) {
      panel.addEventListener('input', calcAll);
      panel.addEventListener('change', calcAll);
    });
  }

  /* ------------------------------ ماشین‌حساب‌ها ------------------------------ */
  function renderResults(target, rows) {
    if (!target) return;
    target.innerHTML = '';
    rows.forEach(function (row) {
      var div = document.createElement('div');
      div.className = 'result-row' + (row.primary ? ' primary' : '');
      var label = document.createElement('span');
      label.textContent = row.label;
      var value = document.createElement('strong');
      value.textContent = row.value;
      if (row.cls) value.className = row.cls;
      div.appendChild(label);
      div.appendChild(value);
      target.appendChild(div);
    });
  }

  function resultPlaceholder(target, text) {
    renderResults(target, [{ label: 'نتیجه', value: text }]);
  }

  function calcPosition() {
    var out = $('posResults');
    var capital = num('posCapital');
    var riskPct = num('posRisk');
    var entry = num('posEntry');
    var stop = num('posStop');
    var target = num('posTarget');
    var leverage = Math.max(1, num('posLeverage'));
    var feePct = Math.max(0, num('posFee'));

    if (!(capital > 0)) return resultPlaceholder(out, 'سرمایه‌ی کل را وارد کنید');
    if (!(entry > 0) || !(stop > 0) || entry === stop) {
      return resultPlaceholder(out, 'قیمت ورود و حد ضرر را وارد کنید');
    }

    var isLong = stop < entry;
    var riskAmount = capital * riskPct / 100;
    var stopDist = Math.abs(entry - stop);
    var qty = riskAmount / stopDist;
    var notional = qty * entry;
    var margin = notional / leverage;
    var fees = notional * (feePct / 100) * 2;
    var liq = isLong
      ? entry * (1 - 1 / leverage + 0.005)
      : entry * (1 + 1 / leverage - 0.005);
    var stopPct = (stopDist / entry) * 100;
    var rows = [];

    rows.push({
      label: 'حجم پوزیشن (' + baseOf(state.symbol) + ')',
      value: fmtQty(qty),
      primary: true
    });
    rows.push({ label: 'ارزش پوزیشن', value: '$' + fmtMoney(notional) });
    rows.push({ label: 'مارجین لازم', value: '$' + fmtMoney(margin) });
    rows.push({ label: 'مبلغ ریسک', value: '$' + fmtMoney(riskAmount) });
    rows.push({ label: 'فاصله‌ی حد ضرر', value: stopPct.toFixed(2) + '%' });
    rows.push({ label: 'جهت معامله', value: isLong ? 'خرید (Long)' : 'فروش (Short)' });
    rows.push({ label: 'کارمزد رفت‌وبرگشت', value: '$' + fmtMoney(fees) });
    rows.push({ label: 'سرمایه‌ی درگیر', value: ((margin / capital) * 100).toFixed(1) + '%' });
    rows.push({ label: 'لیکوییدیشن تقریبی', value: fmtPriceSmart(liq), cls: 'down' });

    if (target > 0) {
      var reward = qty * Math.abs(target - entry) - fees;
      var rr = Math.abs(target - entry) / stopDist;
      rows.push({ label: 'نسبت سود به ضرر', value: rr.toFixed(2) + ' : 1' });
      rows.push({ label: 'سود خالص در هدف', value: '$' + fmtMoney(reward), cls: 'up' });
    }

    if (margin > capital) {
      rows.push({ label: 'هشدار', value: 'مارجین از سرمایه بیشتر است', cls: 'down' });
    }

    renderResults(out, rows);
  }

  function calcPnl() {
    var out = $('pnlResults');
    var side = $('pnlSide').value === 'short' ? 'short' : 'long';
    var entry = num('pnlEntry');
    var exit = num('pnlExit');
    var qty = num('pnlQty');
    var leverage = Math.max(1, num('pnlLeverage'));
    var feePct = Math.max(0, num('pnlFee'));

    if (!(entry > 0) || !(exit > 0) || !(qty > 0)) {
      return resultPlaceholder(out, 'قیمت ورود، خروج و مقدار را وارد کنید');
    }

    var sign = side === 'long' ? 1 : -1;
    var gross = (exit - entry) * qty * sign;
    var notional = entry * qty;
    var margin = notional / leverage;
    var fees = (entry + exit) * qty * (feePct / 100);
    var net = gross - fees;
    var roi = (net / notional) * 100;
    var roe = (net / margin) * 100;
    var f = feePct / 100;
    var breakEven = side === 'long'
      ? entry * (1 + f) / (1 - f)
      : entry * (1 - f) / (1 + f);

    renderResults(out, [
      { label: 'سود/زیان خالص', value: (net >= 0 ? '+$' : '-$') + fmtMoney(Math.abs(net)), primary: true, cls: dirClass(net) },
      { label: 'سود/زیان ناخالص', value: (gross >= 0 ? '+$' : '-$') + fmtMoney(Math.abs(gross)), cls: dirClass(gross) },
      { label: 'کارمزد کل', value: '$' + fmtMoney(fees) },
      { label: 'ROI (روی ارزش پوزیشن)', value: fmtPct(roi), cls: dirClass(roi) },
      { label: 'ROE (روی مارجین)', value: fmtPct(roe), cls: dirClass(roe) },
      { label: 'مارجین درگیر', value: '$' + fmtMoney(margin) },
      { label: 'نقطه‌ی سر‌به‌سر', value: fmtPriceSmart(breakEven) },
      { label: 'جهت', value: side === 'long' ? 'خرید (Long)' : 'فروش (Short)' }
    ]);
  }

  /* ------------------------------ میانگین ورود (DCA) ------------------------------ */
  function dcaAddRow(price, amount) {
    var wrap = $('dcaRows');
    if (!wrap) return;

    var row = document.createElement('div');
    row.className = 'dca-row';

    var priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.step = 'any';
    priceInput.inputMode = 'decimal';
    priceInput.className = 'dca-price';
    priceInput.placeholder = 'قیمت خرید';
    if (price != null && price !== '') priceInput.value = String(price);

    var amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.step = 'any';
    amountInput.inputMode = 'decimal';
    amountInput.className = 'dca-amount';
    amountInput.placeholder = 'مقدار';
    if (amount != null && amount !== '') amountInput.value = String(amount);

    var marketBtn = document.createElement('button');
    marketBtn.type = 'button';
    marketBtn.className = 'mini-btn';
    marketBtn.title = 'درج قیمت لحظه‌ای نماد فعال';
    marketBtn.textContent = 'بازار';
    marketBtn.addEventListener('click', function () {
      var t = currentTicker();
      if (t && t.last) {
        priceInput.value = String(t.last);
        calcDca();
      }
    });

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'icon-btn';
    delBtn.title = 'حذف ردیف';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', function () {
      if (row.parentNode) row.parentNode.removeChild(row);
      calcDca();
    });

    row.appendChild(priceInput);
    row.appendChild(amountInput);
    row.appendChild(marketBtn);
    row.appendChild(delBtn);
    wrap.appendChild(row);

    priceInput.addEventListener('input', calcDca);
    amountInput.addEventListener('input', calcDca);
  }

  function calcDca() {
    var out = $('dcaResults');
    var rows = $('dcaRows').querySelectorAll('.dca-row');
    var totalQty = 0;
    var totalCost = 0;
    var used = 0;

    Array.prototype.forEach.call(rows, function (row) {
      var p = parseFloat(row.querySelector('.dca-price').value);
      var q = parseFloat(row.querySelector('.dca-amount').value);
      if (p > 0 && q > 0) {
        totalQty += q;
        totalCost += p * q;
        used++;
      }
    });

    if (!used || !(totalQty > 0)) {
      return resultPlaceholder(out, 'قیمت و مقدار هر خرید را وارد کنید');
    }

    var avg = totalCost / totalQty;
    var t = currentTicker();
    var current = t && t.last ? t.last : 0;
    var rowsOut = [
      { label: 'میانگین ورود', value: fmtPriceSmart(avg), primary: true },
      { label: 'مجموع مقدار', value: fmtQty(totalQty) + ' ' + baseOf(state.symbol) },
      { label: 'مجموع سرمایه', value: '$' + fmtMoney(totalCost) },
      { label: 'تعداد خرید', value: String(used) }
    ];

    if (current > 0) {
      var pnl = (current - avg) * totalQty;
      var pnlPct = ((current - avg) / avg) * 100;
      rowsOut.push({ label: 'قیمت بازار', value: fmtPriceSmart(current) });
      rowsOut.push({ label: 'ارزش فعلی', value: '$' + fmtMoney(current * totalQty) });
      rowsOut.push({
        label: 'سود/زیان فعلی',
        value: (pnl >= 0 ? '+$' : '-$') + fmtMoney(Math.abs(pnl)),
        cls: dirClass(pnl)
      });
      rowsOut.push({ label: 'درصد سود/زیان', value: fmtPct(pnlPct), cls: dirClass(pnlPct) });
    }

    renderResults(out, rowsOut);
  }

  function updateDcaMarketPrice() {
    var wrap = $('dcaRows');
    if (!wrap) return;
    var t = currentTicker();
    if (!t || !t.last) return;

    var filled = false;
    Array.prototype.forEach.call(wrap.querySelectorAll('.dca-row'), function (row) {
      var input = row.querySelector('.dca-price');
      if (input && !input.value && !filled) {
        input.value = String(t.last);
        filled = true;
      }
    });

    if (filled) calcDca();
  }

  /* ------------------------------ تبدیل ارز ------------------------------ */
  var CONVERT_UNITS = [
    { value: 'BTC', label: 'بیت‌کوین (BTC)' },
    { value: 'ETH', label: 'اتریوم (ETH)' },
    { value: 'SOL', label: 'سولانا (SOL)' },
    { value: 'USDT', label: 'تتر (USDT)' },
    { value: 'USD', label: 'دلار (USD)' },
    { value: 'TOMAN', label: 'تومان' }
  ];

  function unitName(unit) {
    if (unit === 'TOMAN') return 'تومان';
    return unit;
  }

  function buildConvertUnits() {
    var from = $('cvtFrom');
    var to = $('cvtTo');
    from.innerHTML = '';
    to.innerHTML = '';
    CONVERT_UNITS.forEach(function (unit) {
      var o1 = document.createElement('option');
      o1.value = unit.value;
      o1.textContent = unit.label;
      from.appendChild(o1);

      var o2 = document.createElement('option');
      o2.value = unit.value;
      o2.textContent = unit.label;
      to.appendChild(o2);
    });
    from.value = 'BTC';
    to.value = 'USDT';
  }

  function usdValue(unit) {
    if (unit === 'USD' || unit === 'USDT') return 1;
    if (unit === 'TOMAN') return state.usdRate > 0 ? 1 / state.usdRate : NaN;
    var t = state.tickers[unit + 'USDT'];
    if (t && t.last > 0) return t.last;
    if (state.symbol === unit + 'USDT') {
      var cur = currentTicker();
      if (cur && cur.last > 0) return cur.last;
    }
    return NaN;
  }

  function calcConvert() {
    var out = $('cvtResult');
    var formula = $('cvtFormula');
    var amount = num('cvtAmount');
    var rate = num('cvtRate');
    if (rate > 0) {
      state.usdRate = rate;
      store('cd:usdRate', rate);
    }

    var from = $('cvtFrom').value;
    var to = $('cvtTo').value;
    var fromUsd = usdValue(from);
    var toUsd = usdValue(to);

    var quick = $('cvtQuick');
    quick.innerHTML = '';

    if (!(amount > 0) || !isFinite(fromUsd) || !isFinite(toUsd) || !(toUsd > 0)) {
      out.textContent = '—';
      formula.textContent = (!isFinite(fromUsd) || !isFinite(toUsd))
        ? 'قیمت این واحد هنوز دریافت نشده است…'
        : 'مقدار را وارد کنید.';
      return;
    }

    var result = amount * fromUsd / toUsd;
    var digits = Math.abs(result) >= 100 ? 2 : Math.abs(result) >= 1 ? 4 : 8;
    out.textContent = fmtMoney(result, digits) + ' ' + unitName(to);

    var oneUnit = fromUsd / toUsd;
    var oneDigits = Math.abs(oneUnit) >= 100 ? 2 : Math.abs(oneUnit) >= 1 ? 4 : 8;
    formula.textContent = '۱ ' + unitName(from) + ' = ' + fmtMoney(oneUnit, oneDigits) + ' ' + unitName(to);

    var btcPrice = usdValue('BTC');
    var ethPrice = usdValue('ETH');
    var chips = [];
    if (state.usdRate > 0) {
      chips.push(['۱ دلار', fmtMoney(state.usdRate, 0) + ' تومان']);
      if (isFinite(btcPrice)) {
        chips.push(['۱ بیت‌کوین', fmtMoney(btcPrice * state.usdRate, 0) + ' تومان']);
        chips.push(['۱ ساتوشی', fmtMoney((btcPrice / 1e8) * state.usdRate, 2) + ' تومان']);
      }
      if (isFinite(ethPrice)) {
        chips.push(['۱ اتریوم', fmtMoney(ethPrice * state.usdRate, 0) + ' تومان']);
      }
    } else {
      chips.push(['۱ دلار', 'نرخ دلار را وارد کنید']);
    }

    chips.forEach(function (item) {
      var chip = document.createElement('div');
      var label = document.createElement('span');
      label.textContent = item[0];
      var value = document.createElement('b');
      value.textContent = item[1];
      chip.appendChild(label);
      chip.appendChild(value);
      quick.appendChild(chip);
    });
  }

  /* ------------------------------ لیکوییدیشن ------------------------------ */
  function calcLiq() {
    var out = $('liqResults');
    var side = $('liqSide').value === 'short' ? 'short' : 'long';
    var entry = num('liqEntry');
    var leverage = Math.max(1, num('liqLeverage'));
    var mmrPct = Math.max(0, num('liqMmr'));
    var balance = Math.max(0, num('liqBalance'));

    if (!(entry > 0)) {
      return resultPlaceholder(out, 'قیمت ورود را وارد کنید');
    }

    var mmr = mmrPct / 100;
    var liq = side === 'long'
      ? entry * (1 - 1 / leverage + mmr)
      : entry * (1 + 1 / leverage - mmr);
    if (!(liq > 0)) liq = 0;

    var movePct = liq > 0 ? (Math.abs(liq - entry) / entry) * 100 : 100;

    var rows = [
      { label: 'قیمت لیکوییدیشن تقریبی', value: liq > 0 ? fmtPriceSmart(liq) : '—', primary: true, cls: 'down' },
      { label: 'فاصله از قیمت ورود', value: movePct.toFixed(2) + '%' },
      { label: 'جهت معامله', value: side === 'long' ? 'خرید (Long)' : 'فروش (Short)' },
      { label: 'اهرم', value: leverage + '×' },
      { label: 'نرخ نگهداری مارجین', value: mmrPct.toFixed(2) + '%' }
    ];

    if (balance > 0) {
      rows.push({ label: 'ارزش پوزیشن', value: '$' + fmtMoney(balance * leverage) });
      rows.push({ label: 'مارجین اولیه', value: '$' + fmtMoney(balance) });
      rows.push({ label: 'حداکثر زیان قابل تحمل', value: '$' + fmtMoney(balance) });
    }

    if (leverage >= 50) {
      rows.push({ label: 'هشدار', value: 'اهرم بالا؛ خطر لیکوییدیشن سریع', cls: 'down' });
    }

    renderResults(out, rows);
  }

  /* ------------------------------ هم‌زمان‌سازی و راه‌اندازی ------------------------------ */
  function syncCalculatorPrices(force) {
    var t = currentTicker();
    if (!t || !t.last) return;
    var price = t.last;

    var syncBox = $('posSyncPrice');
    var posEntry = $('posEntry');
    if (posEntry && ((syncBox && syncBox.checked) || force || !posEntry.value)) {
      posEntry.value = String(price);
      if (!$('posStop').value) $('posStop').value = String(price * 0.97);
      if (!$('posTarget').value) $('posTarget').value = String(price * 1.06);
    }

    ['pnlEntry', 'liqEntry'].forEach(function (id) {
      var node = $(id);
      if (node && !node.value && document.activeElement !== node) {
        node.value = String(price);
      }
    });

    calcAll();
  }

  function calcAll() {
    calcPosition();
    calcPnl();
    calcDca();
    calcConvert();
    calcLiq();
  }

  function init() {
    loadPrefs();
    initChart();

    $('symbolBtnText').textContent = pairLabel(state.symbol);
    $('cvtRate').value = String(state.usdRate);

    buildConvertUnits();
    dcaAddRow('', '');
    dcaAddRow('', '');

    bindEvents();

    $('dcaAddBtn').addEventListener('click', function () {
      dcaAddRow('', '');
      calcDca();
    });
    $('cvtSwapBtn').addEventListener('click', function () {
      var from = $('cvtFrom');
      var to = $('cvtTo');
      var tmp = from.value;
      from.value = to.value;
      to.value = tmp;
      calcConvert();
    });

    calcAll();

    loadSymbols();
    loadChart();
    requestTickers();
    loadMarkets();
    loadGlobal();
    startPolling();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
