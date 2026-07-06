/* ================================================================
   Kudbee shared motion engine — JS half (DBZ-051, north-star Phase A).

   Loaded with `defer`, pure progressive enhancement: every primitive below
   is additive. If this file 404s, nothing on the page breaks — [data-rv]
   sections just never got their hidden/observer treatment from
   kudbee-motion.css either (that stylesheet's rules are keyed off the same
   attributes), so content renders fully visible and static, which is a
   safe, readable fallback.

   Ported from index.html's inline script with behavior otherwise
   unchanged: same thresholds, same easing math, same reduced-motion gates.
   ================================================================ */
(function () {
    'use strict';
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;

    /* ---------- Reveal primitive ---------- */
    if ('IntersectionObserver' in window) {
        var rio = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } });
        }, { threshold: 0.14, rootMargin: '0px 0px -4% 0px' });
        document.querySelectorAll('[data-rv]').forEach(function (el) { rio.observe(el); });
    } else {
        document.querySelectorAll('[data-rv]').forEach(function (el) { el.classList.add('in'); });
    }

    /* ---------- Counter primitive ---------- */
    function animateCount(el) {
        var target = parseInt(el.getAttribute('data-count'), 10);
        var start = performance.now(), dur = 1500;
        function step(now) {
            var t = Math.min(1, (now - start) / dur);
            el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
            if (t < 1) requestAnimationFrame(step);
        }
        if (reduce) { el.textContent = target; return; }
        requestAnimationFrame(step);
    }
    if ('IntersectionObserver' in window) {
        var cio = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) { if (e.isIntersecting) { animateCount(e.target); cio.unobserve(e.target); } });
        }, { threshold: 0.5 });
        document.querySelectorAll('[data-count]').forEach(function (el) { cio.observe(el); });
    }

    /* ---------- Magnetic primitive ---------- */
    (function () {
        if (!fine || reduce) return;
        document.querySelectorAll('[data-mag]').forEach(function (el) {
            var raf = 0, tx = 0, ty = 0;
            function apply() { raf = 0; el.style.transform = 'translate(' + tx + 'px,' + ty + 'px)'; }
            el.addEventListener('pointermove', function (e) {
                var r = el.getBoundingClientRect();
                tx = (e.clientX - r.left - r.width / 2) * 0.22;
                ty = (e.clientY - r.top - r.height / 2) * 0.3;
                if (!raf) raf = requestAnimationFrame(apply);
            });
            el.addEventListener('pointerleave', function () {
                if (raf) { cancelAnimationFrame(raf); raf = 0; }
                el.style.transform = '';
            });
        });
    })();

    /* ---------- Marquee primitive: duplicate track content once for a
       seamless loop. Kept scoped to `.ribbon .track` only — matches the
       exact pre-DBZ-051 behavior (the lab marquee is not JS-duplicated
       today either, so it isn't touched here to avoid a visual change). --- */
    document.querySelectorAll('.ribbon .track').forEach(function (t) { t.innerHTML += t.innerHTML; });

    /* ---------- Tilt primitive (new, DBZ-051 infra) ----------
       Not wired to any element in this lane (see kudbee-motion.css) — new
       visual effects are out of scope here. Available for lane 05/11 via
       data-tilt (optional data-tilt-max for the degree range, default 8). */
    (function () {
        if (!fine || reduce) return;
        document.querySelectorAll('[data-tilt]').forEach(function (el) {
            var raf = 0, rx = 0, ry = 0;
            var max = parseFloat(el.getAttribute('data-tilt-max')) || 8;
            function apply() {
                raf = 0;
                el.style.setProperty('--kmo-tilt-x', rx.toFixed(2) + 'deg');
                el.style.setProperty('--kmo-tilt-y', ry.toFixed(2) + 'deg');
            }
            el.addEventListener('pointermove', function (e) {
                var r = el.getBoundingClientRect();
                var px = (e.clientX - r.left) / r.width - 0.5;
                var py = (e.clientY - r.top) / r.height - 0.5;
                rx = -py * max * 2;
                ry = px * max * 2;
                if (!raf) raf = requestAnimationFrame(apply);
            });
            el.addEventListener('pointerleave', function () {
                if (raf) { cancelAnimationFrame(raf); raf = 0; }
                rx = 0; ry = 0;
                el.style.setProperty('--kmo-tilt-x', '0deg');
                el.style.setProperty('--kmo-tilt-y', '0deg');
            });
        });
    })();

    /* ---------- Shared rAF scroll bus ----------
       Small reusable utility: one passive scroll listener, one rAF flush,
       any number of subscriber callbacks. Exposed on window.KudbeeMotion so
       index.html's own page-specific scroll effects (nav hide, ghost-word
       parallax, sticky-stack recede) can subscribe here instead of each
       adding its own listener — that's the "one shared rAF scroll bus"
       DBZ-051 asks for. index.html falls back to its own local listener per
       effect if this file hasn't loaded (window.KudbeeMotion undefined),
       so behavior is unchanged either way. */
    var scrollSubs = [];
    var scrollTicking = false;
    function flushScroll() {
        scrollTicking = false;
        for (var i = 0; i < scrollSubs.length; i++) scrollSubs[i]();
    }
    window.addEventListener('scroll', function () {
        if (!scrollTicking) { scrollTicking = true; requestAnimationFrame(flushScroll); }
    }, { passive: true });

    window.KudbeeMotion = {
        onScroll: function (fn) { if (typeof fn === 'function') scrollSubs.push(fn); }
    };
})();
