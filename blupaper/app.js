/* ==================================================================
   بلو پیپر — منطق فروشگاه و کاستومایزر
   بدون وابستگی؛ داده‌ها در بالای فایل قابل ویرایش‌اند
   ================================================================== */
(function () {
  "use strict";

  /* ------------------------------ داده‌ها ------------------------------ */
  var CATS = [
    { id: "all", name: "همه" },
    { id: "bag", name: "بگ بنددار" },
    { id: "shoe", name: "باکس کفش" },
    { id: "food", name: "باکس غذا" },
    { id: "gift", name: "جعبه کادو" }
  ];

  var COLORS = [
    { id: "kraft", name: "کرافت", hex: "#d9b98a" },
    { id: "white", name: "سفید", hex: "#f6f1e6" },
    { id: "blue", name: "آبی", hex: "#2f6fd0" },
    { id: "black", name: "مشکی", hex: "#2a3140" },
    { id: "pink", name: "صورتی", hex: "#e3a7b6" }
  ];

  var PRODUCTS = [
    {
      id: "bag-kraft", name: "بگ بنددار کرافت", cat: "bag", mockup: "bag",
      base: 38000, badge: "پرفروش", defaultColor: "kraft", defaultSize: 1,
      desc: "بگ کشیدار کرافت مقوایی؛ مناسب بوتیک، کافه و هدیه.",
      sizes: ["۲۰×۳۰", "۳۰×۴۰", "۴۰×۵۰"], sizeFactor: [1, 1.35, 1.7]
    },
    {
      id: "bag-fabric", name: "بگ پارچه‌ای بنددار", cat: "bag", mockup: "bag",
      base: 52000, badge: "چاپ عالی", defaultColor: "white", defaultSize: 1,
      desc: "پارچه‌ی ضخیم با بند کنفی؛ قابل استفاده‌ی دوباره.",
      sizes: ["۲۵×۳۵", "۳۵×۴۵", "۴۵×۵۵"], sizeFactor: [1, 1.4, 1.85]
    },
    {
      id: "shoe-box", name: "باکس کفش", cat: "shoe", mockup: "box",
      base: 68000, badge: "", defaultColor: "blue", defaultSize: 0,
      desc: "باکس سخت با درب کشویی و چاپ تمام‌رنگ.",
      sizes: ["۳۳×۲۲×۱۲", "۳۶×۲۵×۱۳"], sizeFactor: [1, 1.25]
    },
    {
      id: "food-box", name: "باکس غذا", cat: "food", mockup: "box",
      base: 46000, badge: "", defaultColor: "kraft", defaultSize: 0,
      desc: "باکس کرافت مقاوم برای بیرون‌بر و فست‌فود.",
      sizes: ["۱۵×۱۵×۸", "۲۲×۱۶×۸"], sizeFactor: [1, 1.3]
    },
    {
      id: "gift-box", name: "جعبه کادو با روبان", cat: "gift", mockup: "gift",
      base: 79000, badge: "ویژه", defaultColor: "pink", defaultSize: 0,
      desc: "جعبه‌ی سخت با روبان ساتن؛ برای هدیه و مناسبت.",
      sizes: ["۲۰×۲۰×۱۰", "۲۵×۲۵×۱۲"], sizeFactor: [1, 1.35]
    },
    {
      id: "gift-set", name: "ست هدیه (بگ + جعبه)", cat: "gift", mockup: "gift",
      base: 126000, badge: "", defaultColor: "black", defaultSize: 0,
      desc: "بگ و جعبه‌ی هم‌طرح؛ آماده‌ی تحویل به مشتری.",
      sizes: ["ست کوچک", "ست بزرگ"], sizeFactor: [1, 1.4]
    }
  ];

  var TIERS = [
    { min: 100, factor: 0.85 },
    { min: 50, factor: 0.9 },
    { min: 10, factor: 0.95 },
    { min: 1, factor: 1 }
  ];
  var CUSTOM_FEE = 0.18;

  function uri(inner, w, h) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' + inner + "</svg>"
    );
  }

  var DESIGNS = [
    {
      id: "dots", name: "نقطه‌های آبی", note: "مینیمال",
      href: uri('<rect width="600" height="700" fill="#f7f3ea"/><g fill="#1d5fd0" opacity="0.85"><circle cx="90" cy="90" r="16"/><circle cx="210" cy="60" r="10"/><circle cx="330" cy="110" r="14"/><circle cx="470" cy="70" r="9"/><circle cx="540" cy="180" r="13"/><circle cx="150" cy="240" r="11"/><circle cx="300" cy="280" r="17"/><circle cx="450" cy="320" r="10"/><circle cx="80" cy="380" r="13"/><circle cx="240" cy="430" r="9"/><circle cx="390" cy="470" r="15"/><circle cx="530" cy="420" r="11"/><circle cx="160" cy="560" r="12"/><circle cx="330" cy="600" r="8"/><circle cx="480" cy="620" r="14"/></g>', 600, 700)
    },
    {
      id: "stripes", name: "راه‌راه مورب", note: "کلاسیک",
      href: uri('<rect width="600" height="700" fill="#f7f3ea"/><g stroke="#1d5fd0" stroke-width="14" opacity="0.75"><path d="M-100 120 L700 -80"/><path d="M-100 300 L700 100"/><path d="M-100 480 L700 280"/><path d="M-100 660 L700 460"/><path d="M-100 840 L700 640"/></g>', 600, 700)
    },
    {
      id: "waves", name: "موج آرام", note: "لطیف",
      href: uri('<rect width="600" height="700" fill="#eef4ff"/><g fill="none" stroke="#2f6fd0" stroke-width="10" opacity="0.55"><path d="M-40 140 q75 -60 150 0 t150 0 t150 0 t150 0"/><path d="M-40 280 q75 -60 150 0 t150 0 t150 0 t150 0"/><path d="M-40 420 q75 -60 150 0 t150 0 t150 0 t150 0"/><path d="M-40 560 q75 -60 150 0 t150 0 t150 0 t150 0"/></g>', 600, 700)
    },
    {
      id: "geo", name: "هندسی مدرن", note: "جسور",
      href: uri('<rect width="600" height="700" fill="#f7f3ea"/><g opacity="0.9"><path d="M0 0 L300 0 L0 300 Z" fill="#1d5fd0"/><path d="M600 700 L300 700 L600 400 Z" fill="#2f6fd0"/><rect x="330" y="120" width="140" height="140" fill="#e0b46a" transform="rotate(18 400 190)"/><circle cx="150" cy="520" r="70" fill="none" stroke="#1d5fd0" stroke-width="12"/></g>', 600, 700)
    },
    {
      id: "logo", name: "لوگوی بلو پیپر", note: "برند",
      href: uri('<rect width="600" height="700" fill="#fffdf8"/><rect x="180" y="180" width="240" height="240" rx="40" fill="none" stroke="#1d5fd0" stroke-width="6"/><path d="M262 300 h76 l-10 78 a16 16 0 0 1 -16 14 h-24 a16 16 0 0 1 -16 -14 Z" fill="#1d5fd0"/><path d="M286 298 c0 -16 10 -27 22 -27 s22 11 22 27" fill="none" stroke="#1d5fd0" stroke-width="8" stroke-linecap="round"/><text x="300" y="500" text-anchor="middle" font-family="Segoe UI, Tahoma, sans-serif" font-size="52" font-weight="700" fill="#0e1b2c">blu.paperr</text>', 600, 700)
    },
    {
      id: "leaf", name: "شاخ و برگ", note: "طبیعی",
      href: uri('<rect width="600" height="700" fill="#f2f7f2"/><g fill="none" stroke="#2f7d5d" stroke-width="8" opacity="0.6"><path d="M80 620 C180 520 220 380 200 220"/><path d="M300 640 C400 520 420 380 380 200"/><path d="M520 660 C560 520 540 380 500 240"/></g><g fill="#2f7d5d" opacity="0.55"><ellipse cx="150" cy="500" rx="46" ry="18" transform="rotate(-35 150 500)"/><ellipse cx="240" cy="430" rx="46" ry="18" transform="rotate(28 240 430)"/><ellipse cx="350" cy="470" rx="46" ry="18" transform="rotate(-28 350 470)"/><ellipse cx="450" cy="380" rx="46" ry="18" transform="rotate(32 450 380)"/><ellipse cx="530" cy="520" rx="46" ry="18" transform="rotate(-30 530 520)"/></g>', 600, 700)
    }
  ];

  /* ------------------------------ ابزارها ------------------------------ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function shade(hex, p) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function f(c) {
      return Math.max(0, Math.min(255, Math.round(p > 0 ? c + (255 - c) * p : c * (1 + p))));
    }
    return "#" + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
  }

  var faNum = (function () {
    try { return new Intl.NumberFormat("fa-IR"); } catch (e) { return null; }
  })();

  function fmt(n) {
    var v = Math.round(n || 0);
    return (faNum ? faNum.format(v) : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) + " تومان";
  }
  function fmtNum(n) {
    var v = Math.round(n || 0);
    return faNum ? faNum.format(v) : String(v);
  }
  function toEnDigits(str) {
    return String(str).replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); });
  }

  function colorOf(id) {
    for (var i = 0; i < COLORS.length; i++) if (COLORS[i].id === id) return COLORS[i];
    return COLORS[0];
  }
  function productOf(id) {
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].id === id) return PRODUCTS[i];
    return PRODUCTS[0];
  }
  function designOf(id) {
    for (var i = 0; i < DESIGNS.length; i++) if (DESIGNS[i].id === id) return DESIGNS[i];
    return null;
  }
  function tierFactor(qty) {
    for (var i = 0; i < TIERS.length; i++) if (qty >= TIERS[i].min) return TIERS[i].factor;
    return 1;
  }
  function unitPrice(prod, sizeIdx, custom) {
    var base = prod.base * (prod.sizeFactor[sizeIdx] || 1);
    if (custom) base *= 1 + CUSTOM_FEE;
    return Math.round(base / 500) * 500;
  }
  function lineTotal(prod, sizeIdx, custom, qty) {
    var raw = unitPrice(prod, sizeIdx, custom) * qty * tierFactor(qty);
    return Math.round(raw / 500) * 500;
  }

  /* ------------------------------ ماکاپ SVG ------------------------------ */
  var uidSeq = 0;
  function nextId() { uidSeq += 1; return "bp" + uidSeq; }

  function designLayer(clipId, area, href, t) {
    if (!href) return "";
    var cx = area.x + area.w / 2;
    var cy = area.y + area.h / 2;
    var s = t && t.scale ? t.scale : 1;
    var rot = t && t.rotate ? t.rotate : 0;
    var tx = t && t.tx ? t.tx : 0;
    var ty = t && t.ty ? t.ty : 0;
    var op = t && t.opacity != null ? t.opacity : 1;
    return '<g clip-path="url(#' + clipId + ')">' +
      '<g class="design-move" transform="translate(' + tx.toFixed(2) + " " + ty.toFixed(2) + ')">' +
      '<g transform="translate(' + cx + " " + cy + ") rotate(" + rot + ") scale(" + s + ") translate(" + (-cx) + " " + (-cy) + ')">' +
      '<image href="' + href + '" x="' + area.x + '" y="' + area.y + '" width="' + area.w + '" height="' + area.h + '" preserveAspectRatio="xMidYMid slice" opacity="' + op + '"/>' +
      "</g></g></g>";
  }

  /* ------------------------------ وضعیت ------------------------------ */
  var store = { cat: "all", cart: [] };

  var cz = {
    productId: "bag-kraft",
    color: "kraft",
    size: 1,
    design: null,
    tx: 0, ty: 0, scale: 1, rotate: 0, opacity: 1,
    qty: 10
  };

  function loadCart() {
    try {
      var raw = localStorage.getItem("bp_cart_v1");
      if (!raw) return;
      var arr = JSON.parse(raw);
      if (Object.prototype.toString.call(arr) === "[object Array]") store.cart = arr;
    } catch (e) { /* بی‌صدا */ }
  }
  function saveCart() {
    try { localStorage.setItem("bp_cart_v1", JSON.stringify(store.cart)); } catch (e) { /* بی‌صدا */ }
  }

  /* ------------------------------ کاتالوگ ------------------------------ */
  function renderCats() {
    var host = $("#catChips");
    if (!host) return;
    host.innerHTML = CATS.map(function (c) {
      return '<button type="button" class="chip-btn' + (store.cat === c.id ? " is-active" : "") + '" data-cat="' + c.id + '">' + c.name + "</button>";
    }).join("");
  }

  function productCard(p, index) {
    var color = colorOf(p.defaultColor);
    var design = DESIGNS[index % DESIGNS.length];
    var from = unitPrice(p, p.defaultSize || 0, false);
    return '<article class="product">' +
      '<div class="product-media">' +
        (p.badge ? '<span class="product-badge">' + p.badge + "</span>" : "") +
        mockup(p.mockup, color.hex, design.href, { scale: 1 }) +
      "</div>" +
      '<div class="product-body">' +
        "<h3>" + p.name + "</h3>" +
        '<p class="product-desc">' + p.desc + "</p>" +
        '<div class="product-meta"><span class="price">از ' + fmt(from) + '</span><span class="unit">هر عدد</span></div>' +
        '<div class="product-actions">' +
          '<button class="btn btn-primary" type="button" data-design="' + p.id + '">طرح خودت</button>' +
          '<button class="btn btn-ghost" type="button" data-quick="' + p.id + '">افزودن ساده</button>' +
        "</div>" +
      "</div>" +
    "</article>";
  }

  function renderProducts() {
    var host = $("#productGrid");
    if (!host) return;
    var list = PRODUCTS.filter(function (p) { return store.cat === "all" || p.cat === store.cat; });
    host.innerHTML = list.map(function (p, i) { return productCard(p, PRODUCTS.indexOf(p)); }).join("");
    fadeProducts();
  }

  /* ------------------------------ سبد سفارش ------------------------------ */
  function cartTotal() {
    return store.cart.reduce(function (s, it) { return s + it.total; }, 0);
  }

  function recalcItem(it) {
    var p = productOf(it.productId);
    it.unit = unitPrice(p, it.size, it.custom);
    it.total = lineTotal(p, it.size, it.custom, it.qty);
  }

  function renderCart() {
    var host = $("#cartItems");
    var empty = $("#cartEmpty");
    if (!host) return;

    if (!store.cart.length) {
      host.innerHTML = "";
      host.hidden = true;
      if (empty) empty.hidden = false;
    } else {
      host.hidden = false;
      if (empty) empty.hidden = true;
      host.innerHTML = store.cart.map(function (it, idx) {
        return '<div class="cart-item">' +
          '<span class="cart-thumb">' + mockup(it.mockup, it.colorHex, it.designHref, {
            tx: it.tx, ty: it.ty, scale: it.scale, rotate: it.rotate, opacity: it.opacity
          }) + "</span>" +
          '<div class="cart-info">' +
            "<strong>" + it.productName + "</strong>" +
            "<small>" + it.colorName + " · " + it.sizeLabel + (it.custom ? " · طرح اختصاصی" : "") + "</small>" +
            '<div class="cart-line">' +
              '<span class="cart-qty">' +
                '<button type="button" data-cart-minus="' + idx + '" aria-label="کم کردن">−</button>' +
                "<span>" + fmtNum(it.qty) + "</span>" +
                '<button type="button" data-cart-plus="' + idx + '" aria-label="زیاد کردن">+</button>' +
              "</span>" +
              "<strong>" + fmt(it.total) + "</strong>" +
            "</div>" +
          "</div>" +
          '<button type="button" class="cart-remove" data-cart-remove="' + idx + '" aria-label="حذف">✕</button>' +
        "</div>";
      }).join("");
    }

    var totalEl = $("#cartTotal");
    if (totalEl) totalEl.textContent = fmt(cartTotal());
    var btn = $("#checkoutBtn");
    if (btn) btn.disabled = !store.cart.length;
  }

  function updateCounts() {
    var n = store.cart.reduce(function (s, it) { return s + it.qty; }, 0);
    var a = $("#cartCount"), b = $("#cartCount2");
    if (a) a.textContent = fmtNum(n);
    if (b) b.textContent = fmtNum(n);
  }

  function addToCart(item) {
    store.cart.push(item);
    saveCart();
    renderCart();
    updateCounts();
  }

  function newUid() {
    return "i" + Date.now() + Math.floor(Math.random() * 1000);
  }

  function addCustom() {
    var p = currentProduct();
    if (!cz.design) {
      toast("اول یک طرح آپلود کن یا از طرح‌های آماده انتخاب کن");
      return;
    }
    var color = colorOf(cz.color);
    var custom = !!cz.design.custom;
    addToCart({
      uid: newUid(),
      productId: p.id, productName: p.name, mockup: p.mockup,
      color: cz.color, colorHex: color.hex, colorName: color.name,
      size: cz.size, sizeLabel: p.sizes[cz.size],
      qty: cz.qty, custom: custom,
      designHref: cz.design.href, designName: cz.design.name,
      tx: cz.tx, ty: cz.ty, scale: cz.scale, rotate: cz.rotate, opacity: cz.opacity,
      unit: unitPrice(p, cz.size, custom),
      total: lineTotal(p, cz.size, custom, cz.qty)
    });
    openCart();
    toast("به سبد اضافه شد");
  }

  function addSimple(productId) {
    var p = productOf(productId);
    var size = p.defaultSize || 0;
    var color = colorOf(p.defaultColor);
    addToCart({
      uid: newUid(),
      productId: p.id, productName: p.name, mockup: p.mockup,
      color: p.defaultColor, colorHex: color.hex, colorName: color.name,
      size: size, sizeLabel: p.sizes[size], qty: 10, custom: false,
      designHref: null, designName: "بدون طرح",
      tx: 0, ty: 0, scale: 1, rotate: 0, opacity: 1,
      unit: unitPrice(p, size, false),
      total: lineTotal(p, size, false, 10)
    });
    openCart();
    toast("۱۰ عدد به سبد اضافه شد");
  }

  /* ------------------------------ بازکردن/بستن ------------------------------ */
  function lockScroll(on) {
    document.body.style.overflow = on ? "hidden" : "";
  }

  function openCart() {
    var d = $("#cartDrawer"), b = $("#cartBackdrop");
    if (!d) return;
    d.classList.add("open");
    d.setAttribute("aria-hidden", "false");
    if (b) b.hidden = false;
    lockScroll(true);
  }

  function closeCart() {
    var d = $("#cartDrawer"), b = $("#cartBackdrop");
    if (!d) return;
    d.classList.remove("open");
    d.setAttribute("aria-hidden", "true");
    if (b) b.hidden = true;
    lockScroll(false);
  }

  function openModal(id, backdropId) {
    var m = $(id), b = $(backdropId);
    if (!m) return;
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    if (b) b.hidden = false;
    lockScroll(true);
  }

  function closeModal(id, backdropId) {
    var m = $(id), b = $(backdropId);
    if (!m) return;
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    if (b) b.hidden = true;
    lockScroll(false);
  }

  /* ------------------------------ اعلان کوتاه ------------------------------ */
  var toastTimer = null;
  function toast(msg) {
    var el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }


  /* ------------------------------ کاستومایزر ------------------------------ */
  function currentProduct() { return productOf(cz.productId); }

  function renderCzTabs() {
    var host = $("#czProducts");
    if (!host) return;
    host.innerHTML = PRODUCTS.map(function (p) {
      return '<button type="button" class="cz-tab' + (p.id === cz.productId ? " is-active" : "") + '" data-cz-product="' + p.id + '">' + p.name + "</button>";
    }).join("");
  }

  function renderColors() {
    var host = $("#czColors");
    if (!host) return;
    host.innerHTML = COLORS.map(function (c) {
      return '<button type="button" class="swatch' + (c.id === cz.color ? " is-active" : "") + '" data-color="' + c.id +
        '" style="background:' + c.hex + '" title="' + c.name + '" aria-label="' + c.name + '"></button>';
    }).join("");
  }

  function renderSizes() {
    var host = $("#czSizes");
    if (!host) return;
    var p = currentProduct();
    host.innerHTML = p.sizes.map(function (s, i) {
      return '<button type="button" class="size-btn' + (i === cz.size ? " is-active" : "") + '" data-size="' + i + '">' + s + "</button>";
    }).join("");
  }

  function renderStage() {
    var host = $("#stageWrap");
    if (!host) return;
    var p = currentProduct();
    var color = colorOf(cz.color);
    host.innerHTML = mockup(p.mockup, color.hex, cz.design ? cz.design.href : null, {
      tx: cz.tx, ty: cz.ty, scale: cz.scale, rotate: cz.rotate, opacity: cz.opacity
    }, p.name);
  }

  function updatePrice() {
    var p = currentProduct();
    var custom = !!(cz.design && cz.design.custom);
    var up = unitPrice(p, cz.size, custom);
    var total = lineTotal(p, cz.size, custom, cz.qty);
    var unitEl = $("#czUnitPrice");
    var totalEl = $("#czPrice");
    var nameEl = $("#czDesignName");
    if (unitEl) unitEl.textContent = fmt(up);
    if (totalEl) totalEl.textContent = fmt(total);
    if (nameEl) {
      nameEl.textContent = cz.design
        ? cz.design.name + (custom ? " — چاپ اختصاصی (+۱۸٪)" : " — طرح آماده")
        : "هنوز طرحی انتخاب نشده؛ از طرح‌های آماده هم می‌توانی استفاده کنی.";
    }
    var clearBtn = $("#czClearDesign");
    if (clearBtn) clearBtn.hidden = !cz.design;
  }

  function syncSliders() {
    var s = $("#czScale"), r = $("#czRotate"), o = $("#czOpacity");
    if (s) s.value = Math.round(cz.scale * 100);
    if (r) r.value = cz.rotate;
    if (o) o.value = Math.round(cz.opacity * 100);
  }

  function applyDesign(design) {
    cz.design = design;
    cz.tx = 0;
    cz.ty = 0;
    cz.scale = 1;
    cz.rotate = 0;
    cz.opacity = 1;
    syncSliders();
    renderStage();
    updatePrice();
  }

  function openCustomizer(productId) {
    var p = productOf(productId);
    cz.productId = p.id;
    cz.color = p.defaultColor;
    cz.size = p.defaultSize || 0;
    cz.qty = Math.max(10, cz.qty);
    var q = $("#czQty");
    if (q) q.value = cz.qty;
    renderCzTabs();
    renderColors();
    renderSizes();
    renderStage();
    updatePrice();
    var target = $("#customizer");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderDesigns() {
    var host = $("#designGrid");
    if (!host) return;
    host.innerHTML = DESIGNS.map(function (d) {
      return '<button type="button" class="design-card" data-design-id="' + d.id + '">' +
        '<span class="design-thumb"><img src="' + d.href + '" alt="' + d.name + '" loading="lazy"></span>' +
        "<strong>" + d.name + "</strong><small>" + d.note + "</small></button>";
    }).join("");
  }

  function handleFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      toast("فقط PNG، JPG یا WEBP قابل استفاده است");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast("حجم فایل بیشتر از ۸ مگابایت است");
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var max = 900;
        var k = Math.min(1, max / Math.max(img.width, img.height));
        var cw = Math.round(img.width * k);
        var ch = Math.round(img.height * k);
        var href = e.target.result;
        try {
          var canvas = document.createElement("canvas");
          canvas.width = cw;
          canvas.height = ch;
          canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
          href = canvas.toDataURL("image/png");
        } catch (err) { /* از فایل اصلی استفاده می‌کنیم */ }
        applyDesign({
          href: href,
          name: file.name.replace(/\.[^.]+$/, ""),
          custom: true
        });
        toast("طرح اضافه شد؛ می‌توانی جابه‌جا و بزرگ‌نمایی کنی");
      };
      img.onerror = function () { toast("فایل تصویری قابل خواندن نبود"); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function mockup(kind, hex, href, t, label) {
    var uid = nextId();
    var clipId = uid + "-clip";
    var isBag = kind === "bag";
    var area = isBag ? { x: 104, y: 168, w: 192, h: 226 } : { x: 106, y: 182, w: 190, h: 172 };
    var defs = "<defs>" +
      '<linearGradient id="' + uid + '-body" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0" stop-color="' + shade(hex, -0.3) + '"/>' +
        '<stop offset=".14" stop-color="' + shade(hex, -0.06) + '"/>' +
        '<stop offset=".44" stop-color="' + shade(hex, 0.14) + '"/>' +
        '<stop offset=".74" stop-color="' + shade(hex, 0.02) + '"/>' +
        '<stop offset="1" stop-color="' + shade(hex, -0.32) + '"/>' +
      "</linearGradient>" +
      '<linearGradient id="' + uid + '-top" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="' + shade(hex, 0.24) + '"/>' +
        '<stop offset="1" stop-color="' + shade(hex, -0.14) + '"/>' +
      "</linearGradient>" +
      '<linearGradient id="' + uid + '-shade" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#000" stop-opacity=".16"/>' +
        '<stop offset=".22" stop-color="#000" stop-opacity="0"/>' +
        '<stop offset=".78" stop-color="#000" stop-opacity="0"/>' +
        '<stop offset="1" stop-color="#000" stop-opacity=".16"/>' +
      "</linearGradient>" +
      '<clipPath id="' + clipId + '"><rect x="' + area.x + '" y="' + area.y + '" width="' + area.w + '" height="' + area.h + '" rx="10"/></clipPath>' +
      "</defs>";

    var aria = label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"';
    var open = '<svg viewBox="0 0 400 460" xmlns="http://www.w3.org/2000/svg"' + aria + ">" + defs;

    if (isBag) {
      return open +
        '<ellipse cx="200" cy="428" rx="110" ry="13" fill="#0e1b2c" opacity=".13"/>' +
        '<path d="M104 164 C104 134 142 120 200 120 C258 120 296 134 296 164 L312 396 Q314 420 292 420 L108 420 Q86 420 88 396 Z" fill="url(#' + uid + '-body)"/>' +
        designLayer(clipId, area, href, t) +
        '<rect x="' + area.x + '" y="' + area.y + '" width="' + area.w + '" height="' + area.h + '" rx="10" fill="url(#' + uid + '-shade)"/>' +
        '<path d="M92 166 C118 128 282 128 308 166 C282 188 118 188 92 166 Z" fill="url(#' + uid + '-top)"/>' +
        '<path d="M124 158 q12 10 26 4M180 152 q14 12 30 4M236 152 q14 10 28 2" stroke="#000" stroke-opacity=".07" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M104 200 L102 380" stroke="#fff" stroke-opacity=".18" stroke-width="6" stroke-linecap="round"/>' +
        '<path d="M178 150 C172 118 186 96 200 92 C214 96 228 118 222 150" fill="none" stroke="' + shade(hex, -0.5) + '" stroke-width="4" stroke-linecap="round"/>' +
        '<circle cx="200" cy="91" r="5.5" fill="' + shade(hex, -0.52) + '"/>' +
        '<path d="M200 96 q-10 22 -4 34M200 96 q10 22 4 34" fill="none" stroke="' + shade(hex, -0.42) + '" stroke-width="3" stroke-linecap="round"/>' +
        "</svg>";
    }

    var ribbon = kind === "gift";
    return open +
      '<ellipse cx="212" cy="392" rx="122" ry="13" fill="#0e1b2c" opacity=".13"/>' +
      '<path d="M96 176 L138 138 L348 138 L306 176 Z" fill="' + shade(hex, 0.2) + '"/>' +
      '<path d="M306 176 L348 138 L348 330 L306 368 Z" fill="' + shade(hex, -0.26) + '"/>' +
      '<rect x="96" y="176" width="210" height="192" fill="url(#' + uid + '-body)"/>' +
      designLayer(clipId, area, href, t) +
      '<rect x="' + area.x + '" y="' + area.y + '" width="' + area.w + '" height="' + area.h + '" rx="6" fill="url(#' + uid + '-shade)"/>' +
      '<path d="M96 176 L306 176" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>' +
      '<path d="M306 176 L306 368" stroke="#000" stroke-opacity=".12" stroke-width="2"/>' +
      (ribbon
        ? '<rect x="186" y="176" width="30" height="192" fill="#fbefd6"/>' +
          '<rect x="96" y="258" width="210" height="26" fill="#fbefd6"/>' +
          '<path d="M186 176 L196 176 L160 138 L150 138 Z" fill="#fbefd6" opacity=".9"/>' +
          '<path d="M206 176 L216 176 L196 138 L186 138 Z" fill="#fbefd6" opacity=".9"/>' +
          '<path d="M201 138 c-26 -22 -50 -8 -42 12 c7 16 26 10 42 -2" fill="#f7e4c4"/>' +
          '<path d="M201 138 c26 -22 50 -8 42 12 c-7 16 -26 10 -42 -2" fill="#f7e4c4"/>' +
          '<circle cx="201" cy="140" r="9" fill="#f0d3a6"/>'
        : "") +
      "</svg>";
  }

  function renderHero() {
    var host = $("#heroBag");
    if (host) host.innerHTML = mockup("bag", "#d9b98a", DESIGNS[0].href, { scale: 1.04 }, "بگ بنددار با طرح اختصاصی");
  }

  /* ------------------------------ ثبت سفارش ------------------------------ */
  function normalizePhone(v) {
    var d = toEnDigits(v).replace(/\D/g, "");
    if (d.indexOf("0098") === 0) d = "0" + d.slice(4);
    else if (d.indexOf("98") === 0 && d.length === 12) d = "0" + d.slice(2);
    if (d.length === 10 && d.charAt(0) === "9") d = "0" + d;
    return d;
  }

  function openCheckout() {
    if (!store.cart.length) { toast("سبد خالی است"); return; }
    var count = store.cart.reduce(function (s, it) { return s + it.qty; }, 0);
    var summary = $("#orderSummary");
    if (summary) {
      summary.innerHTML = "<span>" + fmtNum(count) + " عدد در " + fmtNum(store.cart.length) + " ردیف</span><strong>" + fmt(cartTotal()) + "</strong>";
    }
    openModal("#checkoutModal", "#checkoutBackdrop");
  }

  function markError(input, on) {
    var field = input.closest(".field");
    if (field) field.classList.toggle("is-error", !!on);
  }

  function validateForm(form) {
    var ok = true;
    var name = form.elements.name;
    var phone = form.elements.phone;
    var city = form.elements.city;
    var address = form.elements.address;

    if (!name.value.trim() || name.value.trim().length < 3) { markError(name, true); ok = false; } else markError(name, false);
    if (!/^09\d{9}$/.test(normalizePhone(phone.value))) { markError(phone, true); ok = false; } else markError(phone, false);
    if (!city.value.trim()) { markError(city, true); ok = false; } else markError(city, false);
    if (address.value.trim().length < 10) { markError(address, true); ok = false; } else markError(address, false);

    return ok;
  }

  function orderText(order) {
    var lines = [];
    lines.push("سفارش بلو پیپر — کد " + order.code);
    lines.push("نام: " + order.customer.name);
    lines.push("موبایل: " + order.customer.phone);
    lines.push("شهر: " + order.customer.city);
    lines.push("آدرس: " + order.customer.address);
    lines.push("ارسال: " + order.customer.shipping);
    if (order.customer.note) lines.push("توضیح: " + order.customer.note);
    lines.push("—");
    order.items.forEach(function (it, i) {
      lines.push((i + 1) + ") " + it.productName + " | " + it.colorName + " | " + it.sizeLabel +
        (it.custom ? " | طرح اختصاصی: " + it.designName : " | بدون طرح") +
        " | " + fmtNum(it.qty) + " عدد | " + fmt(it.total));
    });
    lines.push("—");
    lines.push("جمع کل: " + fmt(order.total));
    return lines.join("\n");
  }

  function saveOrder(order) {
    try {
      var raw = localStorage.getItem("bp_orders_v1");
      var arr = raw ? JSON.parse(raw) : [];
      if (Object.prototype.toString.call(arr) !== "[object Array]") arr = [];
      arr.unshift(order);
      localStorage.setItem("bp_orders_v1", JSON.stringify(arr.slice(0, 20)));
    } catch (e) { /* بی‌صدا */ }
  }

  var lastOrderText = "";

  function submitOrder(ev) {
    ev.preventDefault();
    var form = ev.target;
    if (!validateForm(form)) {
      toast("لطفاً فیلدهای مشخص‌شده را کامل کن");
      return;
    }
    var count = store.cart.reduce(function (s, it) { return s + it.qty; }, 0);
    var order = {
      code: "BP-" + String(Math.floor(Math.random() * 9000) + 1000) + "-" + String(Date.now()).slice(-4),
      createdAt: new Date().toISOString(),
      customer: {
        name: form.elements.name.value.trim(),
        phone: normalizePhone(form.elements.phone.value),
        city: form.elements.city.value.trim(),
        address: form.elements.address.value.trim(),
        shipping: form.elements.shipping.value,
        note: form.elements.note.value.trim()
      },
      items: store.cart.slice(),
      count: count,
      total: cartTotal()
    };

    lastOrderText = orderText(order);
    saveOrder(order);

    // نمایش کد و خلاصه
    var codeEl = $("#orderCode");
    if (codeEl) codeEl.textContent = order.code;

    closeModal("#checkoutModal", "#checkoutBackdrop");
    openModal("#successModal", "#successBackdrop");

    store.cart = [];
    saveCart();
    renderCart();
    updateCounts();
    form.reset();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        resolve();
      } catch (err) { reject(err); }
    });
  }


  /* ------------------------------ ویرایش سبد ------------------------------ */
  function changeQty(idx, delta) {
    var it = store.cart[idx];
    if (!it) return;
    it.qty = Math.max(1, Math.min(2000, it.qty + delta));
    recalcItem(it);
    saveCart();
    renderCart();
    updateCounts();
  }

  function removeItem(idx) {
    if (!store.cart[idx]) return;
    store.cart.splice(idx, 1);
    saveCart();
    renderCart();
    updateCounts();
    toast("از سبد حذف شد");
  }

  function setCzQty(v) {
    cz.qty = Math.max(1, Math.min(2000, Math.round(v || 1)));
    var input = $("#czQty");
    if (input) input.value = cz.qty;
    updatePrice();
  }

  /* ------------------------------ کشیدن طرح ------------------------------ */
  function initDrag() {
    var wrap = $("#stageWrap");
    if (!wrap) return;
    var dragging = false, startX = 0, startY = 0, baseX = 0, baseY = 0, unit = 1;

    wrap.addEventListener("pointerdown", function (ev) {
      var svg = wrap.querySelector("svg");
      if (!svg) return;
      if (!cz.design) {
        toast("اول یک طرح انتخاب یا آپلود کن");
        return;
      }
      dragging = true;
      wrap.classList.add("dragging");
      var rect = svg.getBoundingClientRect();
      unit = 400 / rect.width;
      startX = ev.clientX;
      startY = ev.clientY;
      baseX = cz.tx;
      baseY = cz.ty;
      try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* مرورگر قدیمی */ }
      ev.preventDefault();
    });

    wrap.addEventListener("pointermove", function (ev) {
      if (!dragging) return;
      cz.tx = baseX + (ev.clientX - startX) * unit;
      cz.ty = baseY + (ev.clientY - startY) * unit;
      var g = wrap.querySelector(".design-move");
      if (g) g.setAttribute("transform", "translate(" + cz.tx.toFixed(2) + " " + cz.ty.toFixed(2) + ")");
      else renderStage();
    });

    function stop() {
      if (!dragging) return;
      dragging = false;
      wrap.classList.remove("dragging");
    }
    wrap.addEventListener("pointerup", stop);
    wrap.addEventListener("pointercancel", stop);
    wrap.addEventListener("pointerleave", stop);
  }

  /* ------------------------------ رویدادها ------------------------------ */
  function bindEvents() {
    document.addEventListener("click", function (ev) {
      var t = ev.target;

      var catBtn = t.closest("[data-cat]");
      if (catBtn) { store.cat = catBtn.getAttribute("data-cat"); renderCats(); renderProducts(); return; }

      var designBtn = t.closest("[data-design]");
      if (designBtn) { openCustomizer(designBtn.getAttribute("data-design")); return; }

      var quickBtn = t.closest("[data-quick]");
      if (quickBtn) { addSimple(quickBtn.getAttribute("data-quick")); return; }

      var tab = t.closest("[data-cz-product]");
      if (tab) { openCustomizer(tab.getAttribute("data-cz-product")); return; }

      var sw = t.closest("[data-color]");
      if (sw) { cz.color = sw.getAttribute("data-color"); renderColors(); renderStage(); return; }

      var sz = t.closest("[data-size]");
      if (sz) { cz.size = parseInt(sz.getAttribute("data-size"), 10) || 0; renderSizes(); updatePrice(); return; }

      var dcard = t.closest("[data-design-id]");
      if (dcard) {
        var d = designOf(dcard.getAttribute("data-design-id"));
        if (d) {
          applyDesign({ href: d.href, name: d.name, custom: false, presetId: d.id });
          var czEl = $("#customizer");
          if (czEl) czEl.scrollIntoView({ behavior: "smooth", block: "start" });
          toast("طرح «" + d.name + "» روی محصول نشست");
        }
        return;
      }

      var minus = t.closest("[data-cart-minus]");
      if (minus) { changeQty(parseInt(minus.getAttribute("data-cart-minus"), 10), -1); return; }

      var plus = t.closest("[data-cart-plus]");
      if (plus) { changeQty(parseInt(plus.getAttribute("data-cart-plus"), 10), 1); return; }

      var rm = t.closest("[data-cart-remove]");
      if (rm) { removeItem(parseInt(rm.getAttribute("data-cart-remove"), 10)); return; }
    });

    ["#cartBtn", "#cartBtn2"].forEach(function (sel) {
      var el = $(sel);
      if (el) el.addEventListener("click", openCart);
    });

    var closeCartBtn = $("#closeCart");
    if (closeCartBtn) closeCartBtn.addEventListener("click", closeCart);
    var cartBackdrop = $("#cartBackdrop");
    if (cartBackdrop) cartBackdrop.addEventListener("click", closeCart);

    var checkoutBtn = $("#checkoutBtn");
    if (checkoutBtn) checkoutBtn.addEventListener("click", function () {
      if (!store.cart.length) { toast("سبد خالی است"); return; }
      closeCart();
      openCheckout();
    });

    var closeCheckoutBtn = $("#closeCheckout");
    if (closeCheckoutBtn) closeCheckoutBtn.addEventListener("click", function () {
      closeModal("#checkoutModal", "#checkoutBackdrop");
    });
    var checkoutBackdrop = $("#checkoutBackdrop");
    if (checkoutBackdrop) checkoutBackdrop.addEventListener("click", function () {
      closeModal("#checkoutModal", "#checkoutBackdrop");
    });

    var form = $("#orderForm");
    if (form) form.addEventListener("submit", submitOrder);

    var closeSuccessBtn = $("#closeSuccess");
    if (closeSuccessBtn) closeSuccessBtn.addEventListener("click", function () {
      closeModal("#successModal", "#successBackdrop");
    });
    var successBackdrop = $("#successBackdrop");
    if (successBackdrop) successBackdrop.addEventListener("click", function () {
      closeModal("#successModal", "#successBackdrop");
    });

    var copyBtn = $("#copyOrder");
    if (copyBtn) copyBtn.addEventListener("click", function () {
      copyText(lastOrderText).then(function () { toast("خلاصه سفارش کپی شد"); })
        .catch(function () { toast("کپی نشد؛ دستی انتخاب کن"); });
    });

    var emptyShop = $("#emptyShop");
    if (emptyShop) emptyShop.addEventListener("click", closeCart);
  }

  function bindCustomizer() {
    var addBtn = $("#czAdd");
    if (addBtn) addBtn.addEventListener("click", addCustom);

    var clearBtn = $("#czClearDesign");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      cz.design = null;
      cz.tx = 0; cz.ty = 0; cz.scale = 1; cz.rotate = 0; cz.opacity = 1;
      syncSliders();
      renderStage();
      updatePrice();
      toast("طرح برداشته شد؛ محصول بدون چاپ است");
    });

    var resetBtn = $("#czReset");
    if (resetBtn) resetBtn.addEventListener("click", function () {
      cz.tx = 0; cz.ty = 0; cz.scale = 1; cz.rotate = 0; cz.opacity = 1;
      syncSliders();
      renderStage();
      toast("طرح بازنشانی شد");
    });

    var qtyMinus = $("#qtyMinus");
    if (qtyMinus) qtyMinus.addEventListener("click", function () { setCzQty(cz.qty - 1); });
    var qtyPlus = $("#qtyPlus");
    if (qtyPlus) qtyPlus.addEventListener("click", function () { setCzQty(cz.qty + 1); });

    var qtyInput = $("#czQty");
    if (qtyInput) qtyInput.addEventListener("change", function () {
      setCzQty(parseInt(toEnDigits(qtyInput.value), 10) || 1);
    });

    var scale = $("#czScale");
    if (scale) scale.addEventListener("input", function () {
      cz.scale = Math.max(0.6, Math.min(2.3, parseInt(scale.value, 10) / 100));
      renderStage();
    });
    var rotate = $("#czRotate");
    if (rotate) rotate.addEventListener("input", function () {
      cz.rotate = parseInt(rotate.value, 10) || 0;
      renderStage();
    });
    var opacity = $("#czOpacity");
    if (opacity) opacity.addEventListener("input", function () {
      cz.opacity = Math.max(0.55, Math.min(1, parseInt(opacity.value, 10) / 100));
      renderStage();
    });

    var fileInput = $("#czFile");
    if (fileInput) fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
      fileInput.value = "";
    });

    var uploadLabel = document.querySelector(".upload");
    if (uploadLabel) {
      ["dragenter", "dragover"].forEach(function (evt) {
        uploadLabel.addEventListener(evt, function (e) {
          e.preventDefault();
          uploadLabel.classList.add("is-drag");
        });
      });
      ["dragleave", "drop"].forEach(function (evt) {
        uploadLabel.addEventListener(evt, function (e) {
          e.preventDefault();
          uploadLabel.classList.remove("is-drag");
        });
      });
      uploadLabel.addEventListener("drop", function (e) {
        var dt = e.dataTransfer;
        if (dt && dt.files && dt.files[0]) handleFile(dt.files[0]);
      });
    }

    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      closeCart();
      closeModal("#checkoutModal", "#checkoutBackdrop");
      closeModal("#successModal", "#successBackdrop");
    });
  }

  /* ------------------------------ ظاهر شدن ------------------------------ */
  function initReveal() {
    var els = $$(".section-head, .design-card, .cz, .cta, .faq details");
    function showAll() {
      els.forEach(function (el) { el.classList.add("is-in"); });
    }
    try {
      var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!("IntersectionObserver" in window) || reduce) { showAll(); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        });
      }, { rootMargin: "0px 0px -6% 0px", threshold: 0.1 });
      els.forEach(function (el, i) {
        el.style.transitionDelay = (i % 4) * 60 + "ms";
        io.observe(el);
      });
      setTimeout(showAll, 3000);
    } catch (e) { showAll(); }
  }

  function fadeProducts() {
    requestAnimationFrame(function () {
      $$("#productGrid .product").forEach(function (el) { el.classList.add("is-in"); });
    });
  }

  /* ------------------------------ شروع ------------------------------ */
  function init() {
    loadCart();
    renderCats();
    renderProducts();
    renderHero();
    renderDesigns();
    renderCzTabs();
    renderColors();
    renderSizes();
    applyDesign({ href: DESIGNS[0].href, name: DESIGNS[0].name, custom: false, presetId: DESIGNS[0].id });
    updatePrice();
    renderCart();
    updateCounts();
    bindEvents();
    bindCustomizer();
    initDrag();
    initReveal();

    var y = document.querySelector("[data-year]");
    if (y) {
      try {
        y.textContent = new Intl.DateTimeFormat("fa-IR", { year: "numeric" }).format(new Date());
      } catch (e) { /* بی‌صدا */ }
    }
    document.documentElement.setAttribute("bp-ready", "1");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

