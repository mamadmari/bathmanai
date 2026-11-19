/* ==================================================================
   bathmanai.ir — رفتارهای صفحه اصلی
   سبک، بدون وابستگی، با احترام به prefers-reduced-motion
   ================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    reduceMotion = false;
  }

  /* ------------------------- ظاهر شدن تدریجی بخش‌ها ------------------------- */
  var groups = [
    ".section-head",
    ".project",
    ".service",
    ".cta-band",
    ".contact-card"
  ];
  var targets = [];
  groups.forEach(function (selector) {
    var found = document.querySelectorAll(selector);
    for (var i = 0; i < found.length; i++) targets.push(found[i]);
  });

  function showAll() {
    targets.forEach(function (el) { el.classList.add("is-in"); });
  }

  try {
    if (!("IntersectionObserver" in window) || reduceMotion) {
      showAll();
    } else {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

      targets.forEach(function (el, index) {
        el.style.transitionDelay = (index % 4) * 70 + "ms";
        observer.observe(el);
      });

      /* شبکه ایمنی: اگر به هر دلیلی observer فعال نشد، همه چیز دیده شود */
      window.setTimeout(showAll, 3000);
    }
    root.setAttribute("data-reveal", "1");
  } catch (err) {
    showAll();
    root.removeAttribute("data-reveal");
  }

  /* ------------------------------ سال جاری ------------------------------ */
  var yearEl = document.querySelector("[data-year]");
  if (yearEl) {
    try {
      yearEl.textContent = new Intl.DateTimeFormat("fa-IR", { year: "numeric" }).format(new Date());
    } catch (e) {
      yearEl.textContent = "۱۴۰۴";
    }
  }
})();
