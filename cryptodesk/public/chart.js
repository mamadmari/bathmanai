/* ------------------------------------------------------------------
   CryptoDesk – نمودار شمعی سبک روی Canvas (بدون هیچ وابستگی)
   قابلیت‌ها: شمع + حجم، زوم با چرخ ماوس، جابه‌جایی با درگ،
              کراس‌هیر و تولتیپ OHLCV، محور قیمت و زمان
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var UP = '#16c784';
  var DOWN = '#ea3943';
  var GRID = 'rgba(28, 42, 65, 0.65)';
  var AXIS_TEXT = '#64748b';
  var CROSS = 'rgba(148, 163, 184, 0.42)';
  var FONT = '11px Vazirmatn, "Segoe UI", Tahoma, sans-serif';
  var MIN_VISIBLE = 12;

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function fmtPrice(v, digits) {
    if (!isFinite(v)) return '—';
    return v.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function fmtCompact(v) {
    if (!isFinite(v)) return '—';
    var abs = Math.abs(v);
    if (abs >= 1e12) return (v / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toFixed(abs >= 1 ? 2 : 4);
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function IranTime(ts) {
    return new Date(ts).toLocaleString('en-GB', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(',', '');
  }

  function axisTime(ts, interval) {
    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tehran',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date(ts));
    var map = {};
    parts.forEach(function (p) { map[p.type] = p.value; });

    if (interval === '1d' || interval === '1w') return map.day + '/' + map.month;
    if (interval === '4h' || interval === '1h') return map.day + '/' + map.month + ' ' + map.hour + ':00';
    return map.hour + ':' + map.minute;
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function CryptoChart(canvas, tooltip, options) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tooltip = tooltip || null;
    this.opts = options || {};
    this.candles = [];
    this.interval = '1h';
    this.precision = 2;
    this.visibleCount = 120;
    this.offset = 0;
    this.hover = null;
    this.drag = null;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.padding = { top: 16, right: 88, bottom: 26, left: 10 };
    this.volumeRatio = 0.18;
    this.frame = null;
    this._bindEvents();
    this._observeResize();
  }

  CryptoChart.prototype.schedule = function () {
    var self = this;
    if (this.frame) return;
    this.frame = global.requestAnimationFrame(function () {
      self.frame = null;
      self.render();
    });
  };

  CryptoChart.prototype.setInterval = function (interval) {
    this.interval = interval || '1h';
    this.schedule();
  };

  CryptoChart.prototype.setData = function (candles) {
    this.candles = Array.isArray(candles) ? candles.slice() : [];
    this.offset = 0;
    if (!this.candles.length) {
      this.visibleCount = MIN_VISIBLE;
    } else {
      this.visibleCount = clamp(this.visibleCount || 120, MIN_VISIBLE, this.candles.length);
    }
    this._autoPrecision();
    this.schedule();
  };

  CryptoChart.prototype.updateLast = function (candle) {
    if (!Array.isArray(candle)) return;
    var last = this.candles[this.candles.length - 1];
    if (last && candle[0] === last[0]) {
      this.candles[this.candles.length - 1] = candle;
    } else if (last && candle[0] > last[0]) {
      this.candles.push(candle);
      if (this.candles.length > 1500) this.candles.shift();
    } else {
      return;
    }
    this._autoPrecision();
    this.schedule();
  };

  CryptoChart.prototype._autoPrecision = function () {
    var last = this.candles.length ? this.candles[this.candles.length - 1][4] : 0;
    if (last <= 0) { this.precision = 2; return; }
    if (last >= 1000) this.precision = 2;
    else if (last >= 10) this.precision = 3;
    else if (last >= 1) this.precision = 4;
    else if (last >= 0.01) this.precision = 5;
    else if (last >= 0.0001) this.precision = 7;
    else this.precision = 9;
  };

  CryptoChart.prototype._observeResize = function () {
    var self = this;
    if (typeof ResizeObserver === 'function') {
      this._resizeObserver = new ResizeObserver(function () { self.schedule(); });
      this._resizeObserver.observe(this.canvas);
    } else {
      global.addEventListener('resize', function () { self.schedule(); });
    }
  };

  /* ---------------------------- محاسبات چیدمان ---------------------------- */
  CryptoChart.prototype._resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var w = Math.max(160, Math.floor(rect.width));
    var h = Math.max(140, Math.floor(rect.height));
    this.dpr = Math.min(2, global.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(w * this.dpr) || this.canvas.height !== Math.round(h * this.dpr)) {
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
    }
    this.width = w;
    this.height = h;
    return { width: w, height: h };
  };

  CryptoChart.prototype._layout = function () {
    var p = this.padding;
    var plotW = Math.max(40, this.width - p.left - p.right);
    var plotH = Math.max(40, this.height - p.top - p.bottom);
    var volH = Math.round(plotH * this.volumeRatio);
    var priceH = Math.max(20, plotH - volH - 10);
    return {
      left: p.left,
      top: p.top,
      width: plotW,
      height: plotH,
      priceTop: p.top,
      priceHeight: priceH,
      volTop: p.top + priceH + 10,
      volHeight: volH
    };
  };

  CryptoChart.prototype._visible = function () {
    var total = this.candles.length;
    var count = clamp(this.visibleCount || MIN_VISIBLE, MIN_VISIBLE, Math.max(MIN_VISIBLE, total));
    var end = clamp(total - this.offset, count, total);
    var start = Math.max(0, end - count);
    return { start: start, end: end, items: this.candles.slice(start, end), count: count };
  };

  /* ------------------------------ رندر اصلی ------------------------------ */
  CryptoChart.prototype.render = function () {
    this._resize();
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.font = FONT;
    ctx.textBaseline = 'middle';

    var L = this._layout();
    var view = this._visible();
    var items = view.items;
    if (!items.length) return;

    var min = Infinity;
    var max = -Infinity;
    var maxVol = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i][3] < min) min = items[i][3];
      if (items[i][2] > max) max = items[i][2];
      if (items[i][5] > maxVol) maxVol = items[i][5];
    }
    if (!isFinite(min) || !isFinite(max) || min === max) {
      min = min - Math.abs(min || 1) * 0.01;
      max = max + Math.abs(max || 1) * 0.01;
    }
    var span = max - min;
    min -= span * 0.08;
    max += span * 0.08;

    var step = L.width / items.length;
    var priceH = L.priceHeight;
    var priceToY = function (price) {
      return L.priceTop + priceH - ((price - min) / (max - min)) * priceH;
    };

    this._geometry = {
      L: L,
      view: view,
      min: min,
      max: max,
      step: step,
      priceToY: priceToY,
      maxVol: maxVol
    };

    this._drawGrid(ctx, L, min, max, items, step, view);
    this._drawVolume(ctx, L, items, step, maxVol);
    this._drawCandles(ctx, L, items, step, priceToY);
    this._drawLastPrice(ctx, L, items[items.length - 1][4], priceToY);
    this._drawCrosshair(ctx, L, items, step, priceToY, view);
  };

  CryptoChart.prototype._drawGrid = function (ctx, L, min, max, items, step, view) {
    var lines = 5;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = FONT;
    ctx.textAlign = 'left';

    for (var i = 0; i < lines; i++) {
      var ratio = i / (lines - 1);
      var y = Math.round(L.priceTop + L.priceHeight * ratio) + 0.5;
      var price = max - (max - min) * ratio;

      ctx.strokeStyle = GRID;
      ctx.beginPath();
      ctx.moveTo(L.left, y);
      ctx.lineTo(L.left + L.width, y);
      ctx.stroke();

      ctx.fillStyle = AXIS_TEXT;
      ctx.fillText(fmtPrice(price, this.precision), L.left + L.width + 8, y);
    }

    /* برچسب‌های زمان */
    ctx.textAlign = 'center';
    var ticks = 4;
    for (var t = 0; t <= ticks; t++) {
      var idx = Math.round((items.length - 1) * (t / ticks));
      var candle = items[idx];
      if (!candle) continue;
      var x = Math.round(L.left + step * (idx + 0.5)) + 0.5;
      var label = axisTime(candle[0], this.interval);

      ctx.fillStyle = AXIS_TEXT;
      var textWidth = ctx.measureText(label).width;
      var tx = clamp(x, L.left + textWidth / 2, L.left + L.width - textWidth / 2);
      ctx.fillText(label, tx, L.top + L.height + 14);
    }

    /* خط جداکننده‌ی ناحیه حجم */
    ctx.strokeStyle = 'rgba(28, 42, 65, 0.45)';
    ctx.beginPath();
    ctx.moveTo(L.left, L.volTop - 5.5);
    ctx.lineTo(L.left + L.width, L.volTop - 5.5);
    ctx.stroke();
    ctx.restore();
  };

  CryptoChart.prototype._drawVolume = function (ctx, L, items, step, maxVol) {
    var maxV = maxVol || 1;
    var barWidth = Math.max(1, Math.min(14, step * 0.62));
    ctx.save();
    for (var i = 0; i < items.length; i++) {
      var c = items[i];
      var h = Math.max(1, (c[5] / maxV) * L.volHeight);
      var x = L.left + step * (i + 0.5) - barWidth / 2;
      var y = L.volTop + L.volHeight - h;
      ctx.fillStyle = c[4] >= c[1] ? 'rgba(22, 199, 132, 0.32)' : 'rgba(234, 57, 67, 0.32)';
      ctx.fillRect(x, y, barWidth, h);
    }
    ctx.restore();
  };

  CryptoChart.prototype._drawCandles = function (ctx, L, items, step, priceToY) {
    var bodyWidth = Math.max(1, Math.min(15, step * 0.64));
    ctx.save();

    for (var i = 0; i < items.length; i++) {
      var c = items[i];
      var x = L.left + step * (i + 0.5);
      var isUp = c[4] >= c[1];
      var color = isUp ? UP : DOWN;
      var yHigh = priceToY(c[2]);
      var yLow = priceToY(c[3]);
      var yOpen = priceToY(c[1]);
      var yClose = priceToY(c[4]);

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(1, Math.min(2, step * 0.1));

      /* سایه‌ی شمع */
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, yHigh);
      ctx.lineTo(Math.round(x) + 0.5, yLow);
      ctx.stroke();

      /* بدنه‌ی شمع */
      var top = Math.min(yOpen, yClose);
      var height = Math.max(1, Math.abs(yClose - yOpen));
      ctx.fillRect(x - bodyWidth / 2, top, bodyWidth, height);
    }
    ctx.restore();
  };

  CryptoChart.prototype._drawLastPrice = function (ctx, L, price, priceToY) {
    var y = priceToY(price);
    var prev = this.candles.length > 1 ? this.candles[this.candles.length - 2][4] : price;
    var color = price >= prev ? UP : DOWN;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(L.left, Math.round(y) + 0.5);
    ctx.lineTo(L.left + L.width, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    var text = fmtPrice(price, this.precision);
    ctx.font = '600 ' + FONT;
    var tw = ctx.measureText(text).width;
    var boxW = tw + 14;
    var boxH = 19;
    var bx = L.left + L.width + 2;
    var by = y - boxH / 2;

    ctx.fillStyle = color;
    roundRect(ctx, bx, by, boxW, boxH, 5);
    ctx.fill();

    ctx.fillStyle = '#04140f';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 7, by + boxH / 2 + 0.5);
    ctx.restore();
  };

  CryptoChart.prototype._drawCrosshair = function (ctx, L, items, step, priceToY, view) {
    var h = this.hover;
    if (!h) {
      this._hideTooltip();
      return;
    }

    var idx = Math.floor((h.x - L.left) / step);
    if (idx < 0 || idx >= items.length) {
      this._hideTooltip();
      return;
    }

    var c = items[idx];
    var x = L.left + step * (idx + 0.5);
    var geo = this._geometry;

    ctx.save();
    ctx.strokeStyle = CROSS;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, L.priceTop);
    ctx.lineTo(Math.round(x) + 0.5, L.volTop + L.volHeight);
    ctx.stroke();

    if (h.y >= L.priceTop && h.y <= L.priceTop + L.priceHeight) {
      ctx.beginPath();
      ctx.moveTo(L.left, Math.round(h.y) + 0.5);
      ctx.lineTo(L.left + L.width, Math.round(h.y) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);

      var price = geo.max - ((h.y - L.priceTop) / L.priceHeight) * (geo.max - geo.min);
      var text = fmtPrice(price, this.precision);
      ctx.font = '600 ' + FONT;
      var tw = ctx.measureText(text).width;
      var boxW = tw + 14;
      var boxH = 19;
      var bx = L.left + L.width + 2;
      var by = clamp(h.y - boxH / 2, L.priceTop, L.priceTop + L.priceHeight - boxH);

      ctx.fillStyle = '#243449';
      roundRect(ctx, bx, by, boxW, boxH, 5);
      ctx.fill();

      ctx.fillStyle = '#e8eef8';
      ctx.textAlign = 'left';
      ctx.fillText(text, bx + 7, by + boxH / 2 + 0.5);
    }
    ctx.restore();

    this._updateTooltip(c, x, h.y, L, idx + view.start);
  };

  CryptoChart.prototype._updateTooltip = function (c, x, y, L, absIndex) {
    if (!this.tooltip) return;

    var p = this.precision;
    var prevClose = absIndex > 0 && this.candles[absIndex - 1] ? this.candles[absIndex - 1][4] : c[1];
    var change = prevClose ? ((c[4] - prevClose) / prevClose) * 100 : 0;
    var changeColor = change >= 0 ? UP : DOWN;

    this.tooltip.innerHTML =
      '<div class="tt-row"><span>باز</span><strong>' + fmtPrice(c[1], p) + '</strong></div>' +
      '<div class="tt-row"><span>بالا</span><strong>' + fmtPrice(c[2], p) + '</strong></div>' +
      '<div class="tt-row"><span>پایین</span><strong>' + fmtPrice(c[3], p) + '</strong></div>' +
      '<div class="tt-row"><span>بسته</span><strong style="color:' + changeColor + '">' + fmtPrice(c[4], p) + '</strong></div>' +
      '<div class="tt-row"><span>حجم</span><strong>' + fmtCompact(c[5]) + '</strong></div>' +
      '<div class="tt-time">' + IranTime(c[0]) + ' (تهران)</div>';

    this.tooltip.hidden = false;

    var tipW = this.tooltip.offsetWidth || 180;
    var tipH = this.tooltip.offsetHeight || 140;
    var left = x + 16;
    if (left + tipW > this.width - 8) left = Math.max(8, x - tipW - 16);
    var top = clamp(y - tipH / 2, 8, Math.max(8, this.height - tipH - 8));

    this.tooltip.style.left = Math.round(left) + 'px';
    this.tooltip.style.top = Math.round(top) + 'px';
  };

  CryptoChart.prototype._hideTooltip = function () {
    if (this.tooltip) this.tooltip.hidden = true;
  };

  CryptoChart.prototype._point = function (event) {
    var rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  CryptoChart.prototype._bindEvents = function () {
    var self = this;
    var canvas = this.canvas;

    canvas.style.cursor = 'crosshair';

    canvas.addEventListener('pointermove', function (event) {
      var pos = self._point(event);
      var geo = self._geometry;
      var L = geo ? geo.L : self._layout();
      var step = geo ? geo.step : L.width / Math.max(1, self._visible().items.length);

      if (self.drag) {
        var dx = pos.x - self.drag.x;
        var total = self.candles.length;
        var count = Math.min(self.drag.count, total);
        var maxOffset = Math.max(0, total - count);
        self.offset = clamp(self.drag.offset + dx / step, 0, maxOffset);
        self.hover = null;
        self._hideTooltip();
        self.schedule();
        return;
      }

      self.hover = pos;
      self.schedule();
    });

    canvas.addEventListener('pointerdown', function (event) {
      var pos = self._point(event);
      var geo = self._geometry;
      self.drag = {
        x: pos.x,
        offset: self.offset,
        count: self.visibleCount,
        step: geo ? geo.step : 1
      };
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
      }
      canvas.style.cursor = 'grabbing';
    });

    function endDrag() {
      if (!self.drag) return;
      self.drag = null;
      canvas.style.cursor = 'crosshair';
      self.schedule();
    }

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', function () {
      self.drag = null;
      self.hover = null;
      self._hideTooltip();
      canvas.style.cursor = 'crosshair';
      self.schedule();
    });

    canvas.addEventListener('wheel', function (event) {
      event.preventDefault();
      if (!self.candles.length) return;

      var pos = self._point(event);
      var L = self._layout();
      var view = self._visible();
      var total = self.candles.length;
      var factor = event.deltaY > 0 ? 1.15 : 1 / 1.15;
      var nextCount = clamp(Math.round(view.count * factor), MIN_VISIBLE, total);
      if (nextCount === view.count) return;

      var ratio = clamp((pos.x - L.left) / L.width, 0, 1);
      var anchor = view.start + ratio * view.count;
      var startNew = anchor - ratio * nextCount;

      self.visibleCount = nextCount;
      self.offset = clamp(total - (startNew + nextCount), 0, Math.max(0, total - nextCount));
      self.schedule();
    }, { passive: false });

    canvas.addEventListener('dblclick', function () {
      self.visibleCount = clamp(120, MIN_VISIBLE, Math.max(MIN_VISIBLE, self.candles.length));
      self.offset = 0;
      self.schedule();
    });
  };

  global.CryptoChart = CryptoChart;
  global.CryptoChartUtils = {
    fmtPrice: fmtPrice,
    fmtCompact: fmtCompact,
    iranTime: IranTime
  };
})(window);
