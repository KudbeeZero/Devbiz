/* ═══════════════════════════════════════════════════════════════════
   assets/site/site.js — Kudbee marketing site interactions (index.html)
   One IIFE; sections share its closure (reduce, fine, scroll bus), so they
   stay in one file. Filing: BEGIN [Jxx] / END [Jxx] markers.
   Directory: AGENTS.md → "Site filing system".
   ═══════════════════════════════════════════════════════════════════ */
/* Progressive enhancement only — the full content story reads with JS off. */
(function () {
    /* ════════ BEGIN [J01] Setup + motion-token readers ════════ */
    'use strict';
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    var yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    /* ---------- Motion-token readers (DBZ-052) ----------
       Every new easing/duration this lane adds is read from the lane-04
       CSS custom properties at runtime instead of a hardcoded curve or
       millisecond literal — so the hero atmosphere always tracks
       whatever the tokens say, and there is nothing here to drift out of
       sync with the CSS. Failure mode is a neutral no-op (linear / the
       supplied fallback), never a silently reintroduced magic number. */
    function bezierFromPoints(x1, y1, x2, y2) {
        function a(p1, p2) { return 1 - 3 * p2 + 3 * p1; }
        function b(p1, p2) { return 3 * p2 - 6 * p1; }
        function c(p1) { return 3 * p1; }
        function bez(t, p1, p2) { return ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t; }
        function slope(t, p1, p2) { return 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1); }
        function tForX(x) {
            var t = x;
            for (var i = 0; i < 6; i++) {
                var s = slope(t, x1, x2);
                if (Math.abs(s) < 1e-6) break;
                t -= (bez(t, x1, x2) - x) / s;
            }
            return t;
        }
        return function (x) {
            if (x <= 0) return 0; if (x >= 1) return 1;
            return bez(tForX(x), y1, y2);
        };
    }
    function tokenEase(varName) {
        var raw = '';
        try { raw = getComputedStyle(document.documentElement).getPropertyValue(varName); } catch (e) {}
        var m = raw && raw.match(/cubic-bezier\(\s*([-.\d]+)\s*,\s*([-.\d]+)\s*,\s*([-.\d]+)\s*,\s*([-.\d]+)\s*\)/);
        if (!m) return function (x) { return x; }; // linear no-op fallback
        return bezierFromPoints(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4]));
    }
    function tokenMs(varName) {
        var raw = '';
        try { raw = getComputedStyle(document.documentElement).getPropertyValue(varName); } catch (e) {}
        var v = parseFloat(raw);
        if (isNaN(v)) return 0;
        return raw.indexOf('ms') !== -1 ? v : v * 1000;
    }
    /* ════════ END [J01] Setup + motion-token readers ════════ */

    /* ════════ BEGIN [J02] Preloader ════════ */
    var pre = document.getElementById('preloader');
    var hero = document.querySelector('.hero');
    function heroOn() { if (hero) hero.classList.add('on'); }
    (function () {
        if (!pre) { heroOn(); return; }
        var seen = false;
        try { seen = sessionStorage.getItem('kudbee.seen') === '1'; } catch (e) {}
        if (reduce || seen) { pre.classList.add('done'); heroOn(); return; }
        var bar = document.getElementById('plBar'), count = document.getElementById('plCount');
        var wipe = document.getElementById('plWipe'); // DBZ-052 logo mask wipe, synced to the same tick
        var start = performance.now(), DUR = 1050;
        function tick(now) {
            var t = Math.min(1, (now - start) / DUR);
            var eased = 1 - Math.pow(1 - t, 3);
            if (bar) bar.style.transform = 'scaleX(' + eased + ')';
            if (count) count.textContent = String(Math.round(eased * 100)).padStart(2, '0');
            if (wipe) wipe.style.width = (eased * 100).toFixed(2) + '%';
            if (t < 1) requestAnimationFrame(tick);
            else {
                pre.classList.add('done');
                try { sessionStorage.setItem('kudbee.seen', '1'); } catch (e) {}
                setTimeout(heroOn, 150);
            }
        }
        requestAnimationFrame(tick);
        // Hard fallback so the overlay can never strand the page.
        setTimeout(function () { pre.classList.add('done'); heroOn(); }, 4000);
    })();
    /* ════════ END [J02] Preloader ════════ */

    /* ════════ BEGIN [J03] Custom cursor ════════ */
    (function () {
        if (!fine || reduce) return;
        var dot = document.createElement('div'); dot.className = 'cursor-dot';
        var ring = document.createElement('div'); ring.className = 'cursor-ring';
        document.body.appendChild(dot); document.body.appendChild(ring);
        var x = -100, y = -100, rx = -100, ry = -100, raf = 0;
        function loop() {
            rx += (x - rx) * 0.16; ry += (y - ry) * 0.16;
            ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
            raf = requestAnimationFrame(loop);
        }
        document.addEventListener('pointermove', function (e) {
            x = e.clientX; y = e.clientY;
            dot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
            if (!raf) raf = requestAnimationFrame(loop);
        }, { passive: true });
        document.addEventListener('pointerover', function (e) {
            ring.classList.toggle('hot', !!e.target.closest('a, button, label[for], summary, input, select, textarea'));
        }, { passive: true });
    })();
    /* ════════ END [J03] Custom cursor ════════ */

    /* ════════ BEGIN [J04] Shared rAF scroll bus ════════ */
    /* ---------- Shared rAF scroll bus (DBZ-051) ----------
       Nav hide/progress, ghost-word parallax, and sticky-stack recede each
       used to add their own `window.addEventListener('scroll', ...)` + rAF
       gate. They now register with ONE passive listener + ONE rAF flush
       below instead of three independent ones — same per-effect math,
       fewer scroll listeners doing the same job. */
    var scrollTicking = false;
    var scrollUpdaters = [];
    function flushScrollUpdaters() {
        scrollTicking = false;
        for (var i = 0; i < scrollUpdaters.length; i++) scrollUpdaters[i]();
    }
    window.addEventListener('scroll', function () {
        if (!scrollTicking) { scrollTicking = true; requestAnimationFrame(flushScrollUpdaters); }
    }, { passive: true });
    /* ════════ END [J04] Shared rAF scroll bus ════════ */

    /* ════════ BEGIN [J05] Nav — progress, hide-on-scroll, active section, drawer ════════ */
    var nav = document.getElementById('siteNav');
    var progressBar = document.getElementById('progressBar');
    var navOpen = document.getElementById('nav-open');
    (function () {
        var lastY = window.scrollY;
        function onNavScroll() {
            var y = window.scrollY;
            if (nav) {
                if (y > 340 && y > lastY && !(navOpen && navOpen.checked)) nav.classList.add('hidden');
                else nav.classList.remove('hidden');
            }
            if (progressBar) {
                var doc = document.documentElement;
                var max = doc.scrollHeight - doc.clientHeight;
                progressBar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
            }
            lastY = y;
        }
        scrollUpdaters.push(onNavScroll);
        onNavScroll();
    })();
    // Active nav link follows the section in view.
    (function () {
        var links = document.querySelectorAll('#navLinks a[href^="#"]');
        if (!links.length || !('IntersectionObserver' in window)) return;
        var map = {};
        links.forEach(function (l) { map[l.getAttribute('href').slice(1)] = l; });
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                var l = map[e.target.id];
                if (l && e.isIntersecting) {
                    links.forEach(function (o) { o.classList.remove('active'); });
                    l.classList.add('active');
                }
            });
        }, { rootMargin: '-38% 0px -52% 0px' });
        Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
    })();
    // Section lighting (DBZ-052): one-shot top-glow per .sec, the "lit
    // exhibit" note from the north star — mirrors the reveal system's
    // "fires once, never re-hides" contract. Reduced-motion doesn't need
    // this at all: the CSS media query already forces the glow permanently
    // on with no transition, so there's nothing for the observer to gate.
    (function () {
        if (reduce) return;
        var sections = document.querySelectorAll('.sec');
        if (!sections.length) return;
        if (!('IntersectionObserver' in window)) {
            sections.forEach(function (s) { s.classList.add('lit'); });
            return;
        }
        var lio = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) { e.target.classList.add('lit'); lio.unobserve(e.target); }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
        sections.forEach(function (s) { lio.observe(s); });
    })();
    // Drawer: real accessible dialog — focus moves in on open, restores to the
    // trigger on close, the background is set inert (genuine focus trap on
    // supporting browsers), aria-expanded/aria-modal track state, Escape closes.
    (function () {
        if (!navOpen) return;
        var drawerEl = document.getElementById('drawer');
        var burger = document.querySelector('.burger');
        var dClose = document.querySelector('.d-close');
        var bgRegions = ['#siteNav', '#main', 'footer']
            .map(function (s) { return document.querySelector(s); }).filter(Boolean);
        var lastFocus = null;

        function closeDrawer() { setChecked(false); }
        function setChecked(checked) {
            if (navOpen.checked === checked) return;
            navOpen.checked = checked;
            navOpen.dispatchEvent(new Event('change', { bubbles: true }));
        }
        function setDrawer(open) {
            if (burger) burger.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (drawerEl) { if (open) drawerEl.setAttribute('aria-modal', 'true'); else drawerEl.removeAttribute('aria-modal'); }
            if (open) {
                lastFocus = document.activeElement;
                // Blur the about-to-be-inerted focused element FIRST so inert has
                // nothing to bounce focus off of; then move focus into the dialog.
                if (lastFocus && lastFocus.blur) lastFocus.blur();
                bgRegions.forEach(function (el) { el.setAttribute('inert', ''); });
                if (drawerEl) {
                    var focusDrawer = function () { if (navOpen.checked) drawerEl.focus(); };
                    requestAnimationFrame(focusDrawer);
                    setTimeout(focusDrawer, 40);
                }
            } else {
                bgRegions.forEach(function (el) { el.removeAttribute('inert'); });
                if (lastFocus && lastFocus.focus) { lastFocus.focus(); lastFocus = null; }
            }
        }
        navOpen.addEventListener('change', function () { setDrawer(navOpen.checked); });

        document.querySelectorAll('.drawer a').forEach(function (a) {
            a.addEventListener('click', closeDrawer);
        });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
        // Burger + close are real <button>s now — click (and native Enter/Space) just toggle the checkbox.
        if (burger) burger.addEventListener('click', function () { setChecked(!navOpen.checked); });
        if (dClose) dClose.addEventListener('click', closeDrawer);
    })();
    /* ════════ END [J05] Nav — progress, hide-on-scroll, active section, drawer ════════ */

    /* ════════ BEGIN [J06] Reveal / counter / magnetic / marquee ════════ */
    /* ---------- Reveal / counter / magnetic / marquee (DBZ-051) ----------
       Extracted to assets/kudbee-motion.js as shared primitives — see that
       file. If it 404s, [data-rv]/[data-count]/[data-mag]/.ribbon .track
       simply don't get their enhancement (static content, no counting
       animation, no magnetic pull, ribbon doesn't seamless-loop) — the page
       still renders and reads fine either way. */
    /* ════════ END [J06] Reveal / counter / magnetic / marquee ════════ */

    /* ════════ BEGIN [J07] Card spotlight follow ════════ */
    if (fine) document.querySelectorAll('.mini').forEach(function (c) {
        c.addEventListener('mousemove', function (e) {
            var r = c.getBoundingClientRect();
            c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        });
    });
    /* ════════ END [J07] Card spotlight follow ════════ */

    /* ════════ BEGIN [J08] Ghost-word parallax ════════ */
    (function () {
        if (reduce) return;
        var ghosts = document.querySelectorAll('.gword[data-speed]');
        if (!ghosts.length) return;
        function onGhostScroll() {
            var vh = window.innerHeight;
            ghosts.forEach(function (g) {
                var r = g.parentElement.getBoundingClientRect();
                if (r.bottom < 0 || r.top > vh) return;
                var sp = parseFloat(g.getAttribute('data-speed')) || 0.12;
                var off = (r.top - vh * 0.5) * sp;
                g.style.transform = 'translateX(-50%) translateY(' + off.toFixed(1) + 'px)';
            });
        }
        scrollUpdaters.push(onGhostScroll);
        onGhostScroll();
    })();
    /* ════════ END [J08] Ghost-word parallax ════════ */

    /* ════════ BEGIN [J09] Hero exit choreography ════════ */
    /* ---------- Hero exit choreography (DBZ-052) ----------
       The title/sub/CTA block eases up and fades slightly as the hero
       scrolls out of view — composite-only (translateY + opacity),
       subscribed onto the same shared scroll bus above instead of a
       fourth listener. Progress is shaped by --mo-ease-out (lane-04
       token, read at runtime via tokenEase — see the top of this
       script) so the feel matches the rest of the site's motion.
       Skipped entirely under reduced-motion: the hero keeps its plain,
       fully-visible static layout. */
    (function () {
        if (reduce) return;
        var heroWrap = document.getElementById('heroWrap');
        var heroSection = document.querySelector('.hero');
        if (!heroWrap || !heroSection) return;
        var ease = tokenEase('--mo-ease-out');
        var TRAVEL = 46, MIN_OPACITY = 0.4;
        function onHeroExitScroll() {
            var h = heroSection.offsetHeight || 1;
            var p = Math.max(0, Math.min(1, window.scrollY / (h * 0.62)));
            var eased = ease(p);
            heroWrap.style.transform = eased > 0 ? 'translateY(-' + (eased * TRAVEL).toFixed(2) + 'px)' : '';
            heroWrap.style.opacity = eased > 0 ? (1 - eased * (1 - MIN_OPACITY)).toFixed(3) : '';
        }
        scrollUpdaters.push(onHeroExitScroll);
        onHeroExitScroll();
    })();
    /* ════════ END [J09] Hero exit choreography ════════ */

    /* ════════ BEGIN [J10] Aurora per-section hue bias ════════ */
    /* ---------- Aurora per-section hue bias (DBZ-052) ----------
       Subtle, scroll-driven color bias on the ambient aurora: cyan-violet
       (default) everywhere except a green lean over Games and a magenta
       lean over Agents, per the north star's "lit exhibit" zones. Weight
       falls off with distance from the viewport center so the shift
       reads as a slow bias, never a hard cut; CSS (.aurora i) does the
       actual easing of the change via --mo-dur-4/--mo-ease-in-out, this
       just sets the target. Shares the scroll bus — no new listener.
       The custom property is written on .aurora itself (3 decorative
       children), not documentElement — profiling showed setting it on
       <html> every scroll tick pulled the whole document into style
       recalc (RecalcStyleDuration ~5x over a scripted scroll trace);
       scoping the write to the small subtree that actually consumes the
       token removes that cost. Also skips the write entirely when the
       target hasn't moved enough to matter. */
    (function () {
        if (reduce) return;
        var zones = [
            { id: 'games', hue: -38 },
            { id: 'agents', hue: 96 }
        ].map(function (z) { z.el = document.getElementById(z.id); return z; }).filter(function (z) { return z.el; });
        var auroraEl = document.querySelector('.aurora');
        if (!zones.length || !auroraEl) return;
        var lastBias = null;
        function onAuroraScroll() {
            var vh = window.innerHeight, vc = vh / 2, bias = 0;
            zones.forEach(function (z) {
                var r = z.el.getBoundingClientRect();
                var dist = Math.abs((r.top + r.height / 2) - vc);
                var span = Math.max(r.height, vh) * 0.9;
                var w = Math.max(0, 1 - dist / span);
                bias += z.hue * w;
            });
            bias = Math.max(-70, Math.min(120, bias));
            if (lastBias !== null && Math.abs(bias - lastBias) < 0.5) return;
            lastBias = bias;
            auroraEl.style.setProperty('--aurora-bias', bias.toFixed(1) + 'deg');
        }
        scrollUpdaters.push(onAuroraScroll);
        onAuroraScroll();
    })();
    /* ════════ END [J10] Aurora per-section hue bias ════════ */

    /* ════════ BEGIN [J11] Sticky service stack ════════ */
    (function () {
        if (reduce) return;
        var panels = Array.prototype.slice.call(document.querySelectorAll('#stack .panel'));
        if (panels.length < 2) return;
        function onStackScroll() {
            var vh = window.innerHeight;
            for (var i = 0; i < panels.length - 1; i++) {
                var next = panels[i + 1].getBoundingClientRect();
                var t = Math.max(0, Math.min(1, 1 - (next.top - 94) / (vh * 0.8)));
                panels[i].style.transform = 'scale(' + (1 - t * 0.05).toFixed(4) + ')';
                panels[i].style.filter = 'brightness(' + (1 - t * 0.35).toFixed(3) + ')';
            }
        }
        scrollUpdaters.push(onStackScroll);
        onStackScroll();
    })();
    /* ════════ END [J11] Sticky service stack ════════ */

    /* ════════ BEGIN [J12] Pinned story canvas ════════ */
    /* --------------------------------------------------------------
     * Pinned story — scroll resolves the process step by step, and a
     * canvas stage draws the idea → agent → proof → product journey.
     * rAF-gated by visibility; static under reduced-motion / no JS.
     * ------------------------------------------------------------ */
    (function () {
        var outer = document.getElementById('storyOuter');
        var stepsWrap = document.getElementById('storySteps');
        var bar = document.getElementById('storyBar');
        var canvas = document.getElementById('storyCanvas');
        var cap = document.getElementById('stageCap');
        if (!outer || !stepsWrap) return;
        var steps = Array.prototype.slice.call(stepsWrap.querySelectorAll('.step'));
        var CAPS = ['01 · discovery', '02 · strategy & design', '03 · build & train', '04 · proof', '05 · launch'];
        var progress = 0, active = false, running = false;
        var ctx = null, W = 0, H = 0;

        if (reduce) { steps.forEach(function (s) { s.classList.add('on'); }); if (bar) bar.style.transform = 'scaleX(1)'; return; }

        function fitStage() {
            if (!canvas || !canvas.getContext) return;
            var r = canvas.getBoundingClientRect();
            var dpr = Math.min(2, window.devicePixelRatio || 1);
            canvas.width = Math.max(2, r.width * dpr); canvas.height = Math.max(2, r.height * dpr);
            ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            W = r.width; H = r.height;
        }
        function readProgress() {
            var r = outer.getBoundingClientRect();
            var span = r.height - window.innerHeight;
            progress = span > 0 ? Math.max(0, Math.min(1, -r.top / span)) : 0;
            var idx = Math.min(steps.length - 1, Math.floor(progress * steps.length));
            steps.forEach(function (s, i) { s.classList.toggle('on', i <= idx); });
            if (bar) bar.style.transform = 'scaleX(' + progress + ')';
            if (cap) cap.textContent = CAPS[idx];
        }
        // Node constellation: 5 nodes light up left→right as the process resolves.
        var NODES = [[0.12, 0.62], [0.32, 0.34], [0.52, 0.6], [0.72, 0.32], [0.9, 0.58]];
        var COLS = ['#39e6ff', '#6f5bff', '#c46bff', '#7cffb2', '#ffd34d'];
        function draw(t) {
            if (!ctx) return;
            ctx.clearRect(0, 0, W, H);
            var lit = progress * (NODES.length - 1);
            // links
            for (var i = 0; i < NODES.length - 1; i++) {
                var a = NODES[i], b = NODES[i + 1];
                var seg = Math.max(0, Math.min(1, lit - i));
                ctx.strokeStyle = 'rgba(120,130,170,0.22)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(a[0] * W, a[1] * H); ctx.lineTo(b[0] * W, b[1] * H); ctx.stroke();
                if (seg > 0) {
                    var mx = a[0] + (b[0] - a[0]) * seg, my = a[1] + (b[1] - a[1]) * seg;
                    var g = ctx.createLinearGradient(a[0] * W, a[1] * H, b[0] * W, b[1] * H);
                    g.addColorStop(0, COLS[i]); g.addColorStop(1, COLS[i + 1]);
                    ctx.strokeStyle = g; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(a[0] * W, a[1] * H); ctx.lineTo(mx * W, my * H); ctx.stroke();
                    // traveling spark
                    var sp = (t * 0.0004 + i * 0.2) % 1;
                    if (sp < seg) {
                        var sx = a[0] + (b[0] - a[0]) * sp, sy = a[1] + (b[1] - a[1]) * sp;
                        ctx.save(); ctx.shadowColor = COLS[i]; ctx.shadowBlur = 12; ctx.fillStyle = '#fff';
                        ctx.beginPath(); ctx.arc(sx * W, sy * H, 2.4, 0, 7); ctx.fill(); ctx.restore();
                    }
                }
            }
            // nodes
            for (var n = 0; n < NODES.length; n++) {
                var p = NODES[n], on = lit >= n - 0.02;
                var px = p[0] * W, py = p[1] * H;
                var breathe = 1 + Math.sin(t * 0.002 + n) * 0.12;
                ctx.save();
                if (on) { ctx.shadowColor = COLS[n]; ctx.shadowBlur = 18; ctx.fillStyle = COLS[n]; }
                else { ctx.fillStyle = 'rgba(120,130,170,0.35)'; }
                ctx.beginPath(); ctx.arc(px, py, (on ? 7 : 4.5) * breathe, 0, 7); ctx.fill();
                if (on) { ctx.globalAlpha = 0.35; ctx.strokeStyle = COLS[n]; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.arc(px, py, 15 * breathe, 0, 7); ctx.stroke(); }
                ctx.restore();
            }
        }
        function loop(now) {
            if (!active) { running = false; return; }
            readProgress(); draw(now);
            requestAnimationFrame(loop);
        }
        function start() { if (!running) { running = true; requestAnimationFrame(loop); } }
        fitStage();
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                active = entries[0].isIntersecting; if (active) start(); else readProgress();
            }, { threshold: 0 }).observe(outer);
        } else { active = true; start(); }
        var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(fitStage, 200); });
    })();
    /* ════════ END [J12] Pinned story canvas ════════ */

    /* ════════ BEGIN [J13] Hero constellation canvas ════════ */
    /* --------------------------------------------------------------
     * Hero canvas — a drifting constellation in the house palette
     * that leans toward the cursor. rAF-gated by visibility, capped
     * on small/low-power devices, skipped under reduced-motion.
     * Neighbor links use a spatial grid (bucket points into LINK-sized
     * cells, only test the 3x3 neighborhood) instead of an O(n^2) scan
     * over every pair — same visual result, far fewer distance checks
     * once N grows past a couple dozen points.
     *
     * DBZ-052: three depth layers (far/mid/near), each with its own
     * point set, spatial grid and link pass — a link never bridges two
     * depths, so the existing grid-based cost model is unchanged (same
     * total point count, just partitioned). A pointer-parallax offset
     * scaled by depth is applied per layer at paint time only (a
     * ctx.translate around that layer's draw calls) — physics/positions
     * stay layer-local. Pointer gravity is shaped by --mo-ease-spring
     * (DBZ-051 token, parsed at runtime via tokenEase, never a
     * hardcoded curve) for a smoother pull with a slight overshoot.
     * Links blend each endpoint's own palette color across two half
     * segments (cyan→violet etc. along the line) instead of one flat
     * gray-blue stroke — same single ctx.strokeStyle-per-segment cost
     * as before, just two segments instead of one. An occasional
     * shooting spark streaks across the scene; its lifetime comes from
     * --mo-dur-8 (0.8s), also read at runtime.
     * ------------------------------------------------------------ */
    (function () {
        var canvas = document.getElementById('heroCanvas');
        if (!canvas || !canvas.getContext || reduce) return;
        var lowPower = !!(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
        var small = (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) || lowPower;
        var N = small ? 42 : 90, LINK = small ? 110 : 150, LINK2 = LINK * LINK;
        var ctx, W = 0, H = 0, layers = [], cols = 0, rows = 0;
        var mx = -9999, my = -9999, pnx = 0, pny = 0;
        var active = false, running = false, hidden = (typeof document.hidden === 'boolean') && document.hidden;
        var COLS = ['rgba(57,230,255,', 'rgba(111,91,255,', 'rgba(196,107,255,', 'rgba(124,255,178,'];
        // Depth scale, far → near: share of the point budget, point size,
        // drift speed, pointer-pull strength, and paint-time parallax (px).
        var DEPTH = [
            { count: 0.34, size: 0.68, speed: 0.55, pull: 0.55, parallax: 6 },
            { count: 0.36, size: 0.92, speed: 0.8, pull: 0.8, parallax: 14 },
            { count: 0.30, size: 1.28, speed: 1.15, pull: 1.25, parallax: 26 }
        ];
        var gravityEase = tokenEase('--mo-ease-spring');
        var sparkLifeMs = tokenMs('--mo-dur-8');
        function rand(a, b) { return a + Math.random() * (b - a); }
        function fit() {
            var r = canvas.getBoundingClientRect();
            var dpr = Math.min(lowPower ? 1.5 : 2, window.devicePixelRatio || 1);
            canvas.width = Math.max(2, r.width * dpr); canvas.height = Math.max(2, r.height * dpr);
            ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            W = r.width; H = r.height;
            cols = Math.max(1, Math.ceil(W / LINK)); rows = Math.max(1, Math.ceil(H / LINK));
            layers = [];
            var idx = 0;
            for (var li = 0; li < DEPTH.length; li++) {
                var d = DEPTH[li], count = Math.max(4, Math.round(N * d.count)), pts = [];
                for (var i = 0; i < count; i++) {
                    pts.push({
                        x: rand(0, W), y: rand(0, H),
                        vx: rand(-0.22, 0.22) * d.speed, vy: rand(-0.18, 0.18) * d.speed,
                        r: rand(1, 2.4) * d.size, c: COLS[idx % COLS.length], tw: rand(0, 6.28)
                    });
                    idx++;
                }
                layers.push({ def: d, pts: pts, grid: {} });
            }
        }
        canvas.parentElement.addEventListener('pointermove', function (e) {
            var r = canvas.getBoundingClientRect();
            mx = e.clientX - r.left; my = e.clientY - r.top;
            pnx = Math.max(-1, Math.min(1, (mx - W / 2) / (W / 2 || 1)));
            pny = Math.max(-1, Math.min(1, (my - H / 2) / (H / 2 || 1)));
        }, { passive: true });
        canvas.parentElement.addEventListener('pointerleave', function () { mx = -9999; my = -9999; pnx = 0; pny = 0; }, { passive: true });
        function cellKey(cx, cy) { return cx + ',' + cy; }
        function buildGrid(layer) {
            var grid = {}, pts = layer.pts;
            for (var i = 0; i < pts.length; i++) {
                var p = pts[i];
                var cx = Math.max(0, Math.min(cols - 1, Math.floor(p.x / LINK)));
                var cy = Math.max(0, Math.min(rows - 1, Math.floor(p.y / LINK)));
                var key = cellKey(cx, cy);
                (grid[key] || (grid[key] = [])).push(i);
            }
            layer.grid = grid;
        }
        function drawLink(pts, a, b, dist) {
            var q = pts[a], w = pts[b];
            var midx = (q.x + w.x) / 2, midy = (q.y + w.y) / 2;
            var al = (0.16 * (1 - dist / LINK)).toFixed(3);
            ctx.lineWidth = 1;
            ctx.strokeStyle = q.c + al + ')';
            ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(midx, midy); ctx.stroke();
            ctx.strokeStyle = w.c + al + ')';
            ctx.beginPath(); ctx.moveTo(midx, midy); ctx.lineTo(w.x, w.y); ctx.stroke();
        }
        function drawLinks(layer) {
            var pts = layer.pts, grid = layer.grid;
            for (var cy = 0; cy < rows; cy++) {
                for (var cx = 0; cx < cols; cx++) {
                    var here = grid[cellKey(cx, cy)];
                    if (!here) continue;
                    for (var ny = cy; ny <= cy + 1; ny++) {
                        for (var nx = (ny === cy ? cx : cx - 1); nx <= cx + 1; nx++) {
                            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                            var there = grid[cellKey(nx, ny)];
                            if (!there) continue;
                            var sameCell = (nx === cx && ny === cy);
                            for (var hi = 0; hi < here.length; hi++) {
                                var a = here[hi];
                                var startJ = sameCell ? hi + 1 : 0;
                                for (var tj = startJ; tj < there.length; tj++) {
                                    var b = there[tj];
                                    var q = pts[a], w = pts[b];
                                    var ddx = q.x - w.x, ddy = q.y - w.y;
                                    var d2 = ddx * ddx + ddy * ddy;
                                    if (d2 >= LINK2) continue;
                                    drawLink(pts, a, b, Math.sqrt(d2));
                                }
                            }
                        }
                    }
                }
            }
        }
        // Occasional shooting spark: a single fast streak, rare, self-expiring.
        var spark = null;
        function maybeSpawnSpark() {
            if (spark || small || Math.random() > 0.0022) return;
            var goRight = Math.random() > 0.5;
            spark = {
                x: goRight ? -20 : W + 20, y: rand(H * 0.05, H * 0.55),
                vx: (goRight ? 1 : -1) * rand(5.5, 8), vy: rand(0.8, 2.2),
                born: performance.now()
            };
        }
        function drawSpark(t) {
            if (!spark) return;
            var age = t - spark.born;
            if (age > sparkLifeMs || spark.x < -60 || spark.x > W + 60) { spark = null; return; }
            spark.x += spark.vx; spark.y += spark.vy;
            var life = Math.max(0, 1 - age / sparkLifeMs);
            ctx.save();
            ctx.globalAlpha = life;
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
            ctx.shadowColor = '#39e6ff'; ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(spark.x, spark.y);
            ctx.lineTo(spark.x - spark.vx * 5, spark.y - spark.vy * 5);
            ctx.stroke();
            ctx.restore();
        }
        function draw(t) {
            ctx.clearRect(0, 0, W, H);
            for (var li = 0; li < layers.length; li++) {
                var layer = layers[li], def = layer.def, pts = layer.pts;
                for (var i = 0; i < pts.length; i++) {
                    var p = pts[i];
                    p.x += p.vx; p.y += p.vy;
                    // pointer gravity, shaped by the spring token so the pull
                    // ramps in smoothly (with a slight overshoot) instead of
                    // linearly with proximity.
                    var dx = mx - p.x, dy = my - p.y, d2 = dx * dx + dy * dy;
                    if (d2 < 48400 && d2 > 1) {
                        var d = Math.sqrt(d2);
                        var prox = gravityEase(Math.max(0, Math.min(1, 1 - d / 220)));
                        var pull = prox * 0.35 * def.pull;
                        p.x += dx / d * pull; p.y += dy / d * pull;
                    }
                    if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
                    if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20;
                }
                buildGrid(layer);
                ctx.save();
                ctx.translate(pnx * def.parallax, pny * def.parallax);
                drawLinks(layer);
                for (var k = 0; k < pts.length; k++) {
                    var pt = pts[k];
                    var al = 0.35 + 0.35 * Math.sin(t * 0.0012 + pt.tw);
                    ctx.fillStyle = pt.c + al.toFixed(3) + ')';
                    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 7); ctx.fill();
                }
                ctx.restore();
            }
            maybeSpawnSpark();
            drawSpark(t);
        }
        function loop(now) {
            if (!active) { running = false; return; }
            draw(now); requestAnimationFrame(loop);
        }
        function start() { if (!running && !hidden) { running = true; requestAnimationFrame(loop); } }
        fit();
        var intersecting = false;
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                intersecting = entries[0].isIntersecting;
                active = intersecting && !hidden;
                if (active) start();
            }, { threshold: 0 }).observe(canvas);
        } else { intersecting = true; active = true; start(); }
        // Pause the rAF loop entirely while the tab is backgrounded — no point
        // animating a canvas nobody can see, and it keeps background CPU/battery down.
        document.addEventListener('visibilitychange', function () {
            hidden = document.hidden;
            active = intersecting && !hidden;
            if (active) start();
        });
        var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(fit, 220); });
    })();
    /* ════════ END [J13] Hero constellation canvas ════════ */

    /* ════════ BEGIN [J14] Neon scene painter (game thumbnails) ════════ */
    /* --------------------------------------------------------------
     * Neon scene painter — original vector art for thumbnails, in the
     * games' palette. Carried over from v1 (no images, no deps).
     * ------------------------------------------------------------ */
    var palette = { cyan: '#39e6ff', violet: '#c46bff', green: '#7CFFb2', red: '#ff5d3c', amber: '#ffd34d' };
    function fitCanvas(cv) {
        var r = cv.getBoundingClientRect();
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = Math.max(2, r.width * dpr);
        cv.height = Math.max(2, r.height * dpr);
        var ctx = cv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx: ctx, w: r.width, h: r.height };
    }
    function bg(ctx, w, h) {
        var g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#0a0420'); g.addColorStop(0.5, '#1a0b3e'); g.addColorStop(1, '#06121f');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    function moon(ctx, x, y, r, c) { ctx.save(); ctx.globalAlpha = 0.6; ctx.shadowColor = c; ctx.shadowBlur = 30; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.restore(); }
    function canopy(ctx, w, h, baseY, color) {
        ctx.fillStyle = color;
        for (var x = -20; x < w + 40; x += 46) {
            var hh = 50 + ((x * 13) % 60);
            ctx.beginPath(); ctx.moveTo(x, baseY); ctx.quadraticCurveTo(x + 26, baseY - hh, x + 52, baseY); ctx.closePath(); ctx.fill();
        }
    }
    function ground(ctx, w, h, gy) { var g = ctx.createLinearGradient(0, gy, 0, h); g.addColorStop(0, '#163026'); g.addColorStop(1, '#08140d'); ctx.fillStyle = g; ctx.fillRect(0, gy, w, h - gy); ctx.fillStyle = palette.green; ctx.fillRect(0, gy - 2, w, 2); }
    function shafts(ctx, w, h) { ctx.save(); ctx.globalCompositeOperation = 'screen'; for (var i = 0; i < 3; i++) { var lx = (i * 0.33 + 0.18) * w; var gr = ctx.createLinearGradient(lx, 0, lx + 60, h); gr.addColorStop(0, 'rgba(120,255,210,0.12)'); gr.addColorStop(1, 'rgba(120,255,210,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(lx - 20, 0); ctx.lineTo(lx + 20, 0); ctx.lineTo(lx + 80, h); ctx.lineTo(lx + 30, h); ctx.closePath(); ctx.fill(); } ctx.restore(); }
    function operative(ctx, x, y, s, dir) {
        ctx.save(); ctx.translate(x, y); ctx.scale(dir * s, s);
        ctx.shadowColor = palette.cyan; ctx.shadowBlur = 12;
        ctx.fillStyle = '#1769a3'; ctx.fillRect(-10, 6, 8, 20); ctx.fillRect(2, 6, 8, 20);
        ctx.fillStyle = '#1b9ad6'; ctx.fillRect(-12, -16, 24, 24);
        ctx.fillStyle = palette.cyan; ctx.fillRect(-12, -16, 24, 6);
        ctx.fillStyle = '#102030'; ctx.fillRect(-8, -30, 16, 15);
        ctx.fillStyle = palette.green; ctx.fillRect(-5, -26, 10, 4);
        ctx.fillStyle = '#0e4d75'; ctx.fillRect(8, -10, 22, 6);
        ctx.restore();
    }
    function drone(ctx, x, y, s) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.shadowColor = palette.violet; ctx.shadowBlur = 12; ctx.fillStyle = '#7a2bbf'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 12, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(6, -1, 4, 0, 7); ctx.fill(); ctx.restore(); }
    function bolt(ctx, x, y, c, a) { if (a === undefined) a = 1; if (a <= 0.02) return; ctx.save(); ctx.globalAlpha = a; ctx.shadowColor = c; ctx.shadowBlur = 10; ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, 7, 3, 0, 0, 7); ctx.fill(); ctx.restore(); }
    function boss(ctx, x, y, s) {
        ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
        ctx.shadowColor = palette.violet; ctx.shadowBlur = 22;
        ctx.fillStyle = '#3a1560'; ctx.fillRect(-55, -42, 110, 84);
        ctx.fillStyle = '#5a2a8f'; ctx.fillRect(-55, -42, 36, 84); ctx.fillRect(19, -42, 36, 84);
        ctx.fillStyle = palette.cyan; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.fill();
        ctx.restore();
    }
    function r(ctx, x, y, ww, hh, rad) {
        if (ww <= 0 || hh <= 0) return;
        rad = Math.min(rad, ww / 2, hh / 2);
        ctx.beginPath(); ctx.moveTo(x + rad, y);
        ctx.arcTo(x + ww, y, x + ww, y + hh, rad); ctx.arcTo(x + ww, y + hh, x, y + hh, rad);
        ctx.arcTo(x, y + hh, x, y, rad); ctx.arcTo(x, y, x + ww, y, rad); ctx.closePath(); ctx.fill();
    }
    var scenes = {
        jungle: function (ctx, w, h, t) { t = t || 0; bg(ctx, w, h); moon(ctx, w * 0.78, h * 0.26, h * 0.1, palette.violet); moon(ctx, w * 0.3, h * 0.2, h * 0.05, palette.cyan); canopy(ctx, w, h, h * 0.66, '#0c2a1e'); var gy = h * 0.78; ground(ctx, w, h, gy); shafts(ctx, w, h); operative(ctx, w * 0.32, gy, h / 110, 1); drone(ctx, w * 0.7, h * 0.4, h / 130);
            // t=0 -> sin(0)=0 -> flick=1, identical to the pre-animation static bolt
            var flick = 1 - 0.5 * Math.abs(Math.sin(t * 0.009));
            bolt(ctx, w * 0.45, gy - h * 0.13, palette.cyan, flick); },
        combat: function (ctx, w, h) { bg(ctx, w, h); canopy(ctx, w, h, h * 0.62, '#0c2a1e'); var gy = h * 0.8; ground(ctx, w, h, gy); operative(ctx, w * 0.22, gy, h / 105, 1); for (var i = 0; i < 4; i++) drone(ctx, w * (0.5 + i * 0.13), h * (0.3 + (i % 2) * 0.18), h / 150); for (var j = 0; j < 5; j++) bolt(ctx, w * (0.3 + j * 0.09), gy - h * 0.22 + (j % 2) * 14, palette.amber); shafts(ctx, w, h); },
        boss: function (ctx, w, h) { bg(ctx, w, h); var gy = h * 0.82; ground(ctx, w, h, gy); boss(ctx, w * 0.62, h * 0.42, h / 150); operative(ctx, w * 0.2, gy, h / 105, 1); for (var k = 0; k < 6; k++) { var a = -0.6 + k * 0.2; bolt(ctx, w * 0.5 + Math.cos(a) * 30, h * 0.45 + Math.sin(a) * 30, palette.red); } shafts(ctx, w, h); },
        web1: function (ctx, w, h) {
            var g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0c1c36'); g.addColorStop(1, '#090d20');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            // browser chrome
            ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, 0, w, h * 0.12);
            var dots = ['#ff5f57', '#febc2e', '#28c840'];
            for (var d = 0; d < 3; d++) { ctx.fillStyle = dots[d]; ctx.beginPath(); ctx.arc(w * 0.045 + d * w * 0.032, h * 0.06, h * 0.018, 0, 7); ctx.fill(); }
            ctx.fillStyle = 'rgba(255,255,255,0.09)';
            r(ctx, w * 0.2, h * 0.03, w * 0.6, h * 0.06, h * 0.03);
            // hero band with gradient headline
            var hg = ctx.createLinearGradient(w * 0.08, 0, w * 0.6, 0); hg.addColorStop(0, palette.cyan); hg.addColorStop(1, palette.violet);
            ctx.fillStyle = hg; r(ctx, w * 0.08, h * 0.24, w * 0.42, h * 0.075, h * 0.02);
            ctx.fillStyle = 'rgba(255,255,255,0.35)'; r(ctx, w * 0.08, h * 0.36, w * 0.3, h * 0.035, h * 0.017);
            ctx.save(); ctx.shadowColor = palette.cyan; ctx.shadowBlur = 12; ctx.fillStyle = palette.cyan;
            r(ctx, w * 0.08, h * 0.46, w * 0.14, h * 0.07, h * 0.035); ctx.restore();
            // three feature cards
            for (var i = 0; i < 3; i++) {
                var cx = w * 0.08 + i * w * 0.29;
                ctx.fillStyle = 'rgba(255,255,255,0.06)'; r(ctx, cx, h * 0.64, w * 0.25, h * 0.26, h * 0.03);
                ctx.fillStyle = [palette.cyan, palette.violet, palette.green][i];
                ctx.globalAlpha = 0.8; r(ctx, cx + w * 0.02, h * 0.68, w * 0.05, h * 0.05, h * 0.015); ctx.globalAlpha = 1;
                ctx.fillStyle = 'rgba(255,255,255,0.22)'; r(ctx, cx + w * 0.02, h * 0.77, w * 0.19, h * 0.025, h * 0.012);
                ctx.fillStyle = 'rgba(255,255,255,0.12)'; r(ctx, cx + w * 0.02, h * 0.82, w * 0.14, h * 0.025, h * 0.012);
            }
        },
        web2: function (ctx, w, h) { var g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#1a0e3e'); g.addColorStop(1, '#0a0a1e'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(196,107,255,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.7); for (var x = 0.1; x <= 0.9; x += 0.1) ctx.lineTo(w * x, h * (0.4 + Math.sin(x * 9) * 0.2)); ctx.stroke(); ctx.fillStyle = 'rgba(124,255,178,0.5)'; ctx.fillRect(w * 0.1, h * 0.2, w * 0.3, h * 0.08); },
        ai1: function (ctx, w, h) { ctx.fillStyle = '#120a2e'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(196,107,255,0.5)'; ctx.fillStyle = palette.violet; for (var i = 0; i < 6; i++) { var nx = w * (0.2 + Math.random() * 0.6), ny = h * (0.2 + Math.random() * 0.6); ctx.shadowColor = palette.violet; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(nx, ny, 6, 0, 7); ctx.fill(); } ctx.shadowBlur = 0; },
        ai2: function (ctx, w, h) { ctx.fillStyle = '#0a1a2e'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = palette.cyan; ctx.shadowColor = palette.cyan; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, h * 0.18, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(57,230,255,0.4)'; for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, h * (0.22 + i * 0.07), 0, 7); ctx.stroke(); } },
        scribe: function (ctx, w, h) {
            var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#151032'); g.addColorStop(1, '#0a081c');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(255,255,255,0.05)'; r(ctx, w * 0.08, h * 0.1, w * 0.84, h * 0.8, h * 0.04);
            var lines = [0.86, 0.62, 0.78, 0.5, 0.7, 0.4];
            for (var i = 0; i < lines.length; i++) {
                var y = h * (0.2 + i * 0.105);
                ctx.fillStyle = 'rgba(255,255,255,0.2)'; r(ctx, w * 0.14, y, w * 0.72 * lines[i], h * 0.035, h * 0.017);
                if (i === 1) { ctx.fillStyle = 'rgba(255,211,77,0.55)'; r(ctx, w * 0.14 + w * 0.2, y + h * 0.045, w * 0.16, h * 0.014, h * 0.007); }
                if (i === 3) { ctx.fillStyle = 'rgba(124,255,178,0.55)'; r(ctx, w * 0.14, y + h * 0.045, w * 0.12, h * 0.014, h * 0.007); }
            }
            ctx.save(); ctx.shadowColor = palette.violet; ctx.shadowBlur = 14; ctx.fillStyle = palette.violet;
            ctx.beginPath(); ctx.arc(w * 0.82, h * 0.76, h * 0.09, 0, 7); ctx.fill(); ctx.restore();
            ctx.strokeStyle = '#0a081c'; ctx.lineWidth = 2.5; ctx.beginPath();
            ctx.moveTo(w * 0.79, h * 0.79); ctx.lineTo(w * 0.85, h * 0.73); ctx.stroke();
        },
        tokens: function (ctx, w, h) {
            var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a1a2e'); g.addColorStop(1, '#070c1c');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
            for (var gy = 1; gy <= 3; gy++) { ctx.beginPath(); ctx.moveTo(w * 0.08, h * 0.85 - gy * h * 0.2); ctx.lineTo(w * 0.92, h * 0.85 - gy * h * 0.2); ctx.stroke(); }
            var bars = [0.34, 0.52, 0.42, 0.66, 0.5, 0.78], cols = [palette.cyan, palette.violet];
            for (var i = 0; i < bars.length; i++) {
                var bx = w * (0.11 + i * 0.135), bh = h * bars[i] * 0.72;
                ctx.save(); ctx.shadowColor = cols[i % 2]; ctx.shadowBlur = 10; ctx.fillStyle = cols[i % 2];
                ctx.globalAlpha = 0.85; r(ctx, bx, h * 0.85 - bh, w * 0.075, bh, w * 0.015); ctx.restore();
            }
            ctx.save(); ctx.strokeStyle = palette.green; ctx.shadowColor = palette.green; ctx.shadowBlur = 8; ctx.lineWidth = 2; ctx.beginPath();
            for (var p2 = 0; p2 < bars.length; p2++) { var px = w * (0.148 + p2 * 0.135), py = h * 0.82 - h * bars[p2] * 0.72; if (p2 === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
            ctx.stroke(); ctx.restore();
        },
        utm: function (ctx, w, h) {
            var g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#122212'); g.addColorStop(1, '#081408');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(255,255,255,0.07)'; r(ctx, w * 0.08, h * 0.16, w * 0.84, h * 0.16, h * 0.08);
            ctx.save(); ctx.shadowColor = palette.green; ctx.shadowBlur = 10; ctx.fillStyle = palette.green;
            r(ctx, w * 0.12, h * 0.205, w * 0.34, h * 0.07, h * 0.035); ctx.restore();
            ctx.fillStyle = 'rgba(124,255,178,0.35)'; r(ctx, w * 0.48, h * 0.205, w * 0.4, h * 0.07, h * 0.035);
            var chips = [[0.08, 0.48, 0.24, palette.cyan], [0.36, 0.48, 0.28, palette.violet], [0.08, 0.66, 0.32, palette.amber], [0.44, 0.66, 0.2, palette.green]];
            for (var i = 0; i < chips.length; i++) {
                var c = chips[i];
                ctx.fillStyle = 'rgba(255,255,255,0.06)'; r(ctx, w * c[0], h * c[1], w * c[2], h * 0.12, h * 0.06);
                ctx.save(); ctx.shadowColor = c[3]; ctx.shadowBlur = 8; ctx.fillStyle = c[3];
                ctx.beginPath(); ctx.arc(w * c[0] + h * 0.06, h * c[1] + h * 0.06, h * 0.025, 0, 7); ctx.fill(); ctx.restore();
                ctx.fillStyle = 'rgba(255,255,255,0.25)'; r(ctx, w * c[0] + h * 0.11, h * c[1] + h * 0.045, w * c[2] - h * 0.16, h * 0.03, h * 0.015);
            }
            ctx.save(); ctx.strokeStyle = palette.green; ctx.shadowColor = palette.green; ctx.shadowBlur = 8; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(w * 0.84, h * 0.72, h * 0.06, 0.5, 3.6); ctx.stroke();
            ctx.beginPath(); ctx.arc(w * 0.9, h * 0.66, h * 0.06, 3.6, 6.8); ctx.stroke(); ctx.restore();
        },
        invoice: function (ctx, w, h) {
            var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#241c0c'); g.addColorStop(1, '#120e08');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(255,255,255,0.07)'; r(ctx, w * 0.26, h * 0.08, w * 0.48, h * 0.84, w * 0.02);
            ctx.save(); ctx.shadowColor = palette.amber; ctx.shadowBlur = 10; ctx.fillStyle = palette.amber;
            r(ctx, w * 0.31, h * 0.15, w * 0.14, h * 0.05, h * 0.025); ctx.restore();
            ctx.fillStyle = 'rgba(255,255,255,0.2)'; r(ctx, w * 0.55, h * 0.15, w * 0.14, h * 0.035, h * 0.017);
            for (var i = 0; i < 4; i++) {
                var y = h * (0.32 + i * 0.1);
                ctx.fillStyle = 'rgba(255,255,255,0.18)'; r(ctx, w * 0.31, y, w * 0.22, h * 0.03, h * 0.015);
                ctx.fillStyle = 'rgba(255,211,77,0.4)'; r(ctx, w * 0.61, y, w * 0.08, h * 0.03, h * 0.015);
            }
            ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(w * 0.31, h * 0.74); ctx.lineTo(w * 0.69, h * 0.74); ctx.stroke();
            ctx.save(); ctx.shadowColor = palette.green; ctx.shadowBlur = 10; ctx.fillStyle = palette.green;
            r(ctx, w * 0.47, h * 0.79, w * 0.22, h * 0.07, h * 0.035); ctx.restore();
        },
        munch: function (ctx, w, h, t) {
            t = t || 0;
            ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, w, h);
            var cols = 9, rows = 7, cw = w / cols, rh = h / rows;
            ctx.strokeStyle = 'rgba(57,230,255,0.5)'; ctx.lineWidth = Math.max(1.5, cw * 0.05);
            for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
                if ((x + y * 3) % 5 === 0) continue;
                ctx.strokeRect(x * cw + 2, y * rh + 2, cw - 4, rh - 4);
            }
            ctx.fillStyle = 'rgba(255,211,77,0.8)';
            for (var i = 0; i < 18; i++) { var dx = (i * 53) % cols, dy = (i * 31) % rows; ctx.beginPath(); ctx.arc(dx * cw + cw / 2, dy * rh + rh / 2, Math.min(cw, rh) * 0.08, 0, 7); ctx.fill(); }
            // chomp: t=0 -> sin(0)=0 -> delta=0 -> arc(0.6, 5.6) exactly, matching the static frame
            var delta = Math.sin(t * 0.007) * 0.28;
            ctx.save(); ctx.shadowColor = palette.amber; ctx.shadowBlur = 10; ctx.fillStyle = palette.amber;
            ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.09, 0.6 + delta, 5.6 - delta); ctx.fill(); ctx.restore();
            ctx.save(); ctx.shadowColor = palette.violet; ctx.shadowBlur = 10; ctx.fillStyle = palette.violet;
            ctx.beginPath(); ctx.moveTo(w * 0.72, h * 0.32); ctx.lineTo(w * 0.82, h * 0.38); ctx.lineTo(w * 0.72, h * 0.44); ctx.closePath(); ctx.fill(); ctx.restore();
        },
        orbital: function (ctx, w, h, t) {
            t = t || 0;
            var g = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
            g.addColorStop(0, '#0c1230'); g.addColorStop(1, '#03030a'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(200,222,255,0.7)';
            for (var i = 0; i < 30; i++) { var sx = (i * 67 % 100) / 100 * w, sy = (i * 131 % 100) / 100 * h; ctx.beginPath(); ctx.arc(sx, sy, (i % 3) * 0.5 + 0.5, 0, 7); ctx.fill(); }
            ctx.save(); ctx.strokeStyle = palette.cyan; ctx.shadowColor = palette.cyan; ctx.shadowBlur = 10; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.36, 0, 7); ctx.stroke(); ctx.restore();
            ctx.save(); ctx.translate(w * 0.5, h * 0.22); ctx.rotate(-0.4); ctx.shadowColor = palette.cyan; ctx.shadowBlur = 8; ctx.strokeStyle = '#dff6ff'; ctx.lineWidth = 2;
            var s = Math.min(w, h) * 0.07; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.6); ctx.lineTo(0, s * 0.3); ctx.lineTo(-s * 0.7, s * 0.6); ctx.closePath(); ctx.stroke(); ctx.restore();
            for (var j = 0; j < 3; j++) { ctx.save(); ctx.shadowColor = palette.violet; ctx.shadowBlur = 8; ctx.strokeStyle = palette.violet; ctx.lineWidth = 1.6;
                // t=0 -> rotate(j) exactly, matching the static frame; drifts slowly after
                ctx.translate(w * (0.28 + j * 0.22), h * (0.62 + (j % 2) * 0.14)); ctx.rotate(j + t * 0.0012);
                ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, -3); ctx.lineTo(3, 0); ctx.lineTo(6, 3); ctx.closePath(); ctx.stroke(); ctx.restore(); }
        },
        circuit: function (ctx, w, h, t) {
            t = t || 0;
            var g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0e1230'); g.addColorStop(1, '#05061c');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            var cols = 5, rows = 4, cw = w / cols, rh = h / rows;
            ctx.strokeStyle = 'rgba(120,140,220,0.28)'; ctx.lineWidth = Math.max(2, cw * 0.06);
            var lines = [[0,1,1,1],[1,1,2,1],[2,1,2,2],[2,2,3,2],[1,1,1,2],[3,2,3,1],[3,1,4,1]];
            function pt(cx, cy) { return [cx * cw + cw / 2, cy * rh + rh / 2]; }
            lines.forEach(function (l) { var a = pt(l[0], l[1]), b = pt(l[2], l[3]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
            ctx.save(); ctx.strokeStyle = palette.cyan; ctx.shadowColor = palette.cyan; ctx.shadowBlur = 10; ctx.lineWidth = Math.max(2, cw * 0.055);
            var lit = [[0,1,1,1],[1,1,2,1],[1,1,1,2]];
            lit.forEach(function (l) { var a = pt(l[0], l[1]), b = pt(l[2], l[3]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
            ctx.restore();
            ctx.save(); ctx.shadowColor = palette.green; ctx.shadowBlur = 14; ctx.fillStyle = palette.green;
            var core = pt(1, 1); ctx.beginPath(); ctx.arc(core[0], core[1], Math.min(cw, rh) * 0.14, 0, 7); ctx.fill(); ctx.restore();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            [[0,1],[2,1],[2,2],[3,2],[1,2],[3,1],[4,1]].forEach(function (c) { var p = pt(c[0], c[1]); ctx.beginPath(); ctx.arc(p[0], p[1], Math.min(cw, rh) * 0.06, 0, 7); ctx.fill(); });
            // traveling spark along the lit path — alpha is 0 at t=0 (sin(0)=0), so
            // drawing it is a no-op on the static/reduced-motion frame
            var alpha = Math.max(0, Math.sin(t * 0.004));
            if (alpha > 0.01) {
                var travel = (t * 0.0006) % 1, segIdx = Math.min(lit.length - 1, Math.floor(travel * lit.length)), segT = travel * lit.length - segIdx;
                var sl = lit[segIdx], sa = pt(sl[0], sl[1]), sb = pt(sl[2], sl[3]);
                var sx = sa[0] + (sb[0] - sa[0]) * segT, sy = sa[1] + (sb[1] - sa[1]) * segT;
                ctx.save(); ctx.globalAlpha = alpha; ctx.shadowColor = '#fff'; ctx.shadowBlur = 12; ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(sx, sy, Math.min(cw, rh) * 0.05, 0, 7); ctx.fill(); ctx.restore();
            }
        },
        coverage: function (ctx, w, h) {
            var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0c1c2c'); g.addColorStop(1, '#070e18');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            var cx = w * 0.5, cy = h * 0.58, R = Math.min(w, h) * 0.34;
            var a0 = Math.PI * 0.8, a1 = Math.PI * 2.2, pct = 0.87;
            ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = R * 0.16; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
            var arcG = ctx.createLinearGradient(cx - R, cy, cx + R, cy); arcG.addColorStop(0, palette.cyan); arcG.addColorStop(1, palette.green);
            ctx.save(); ctx.shadowColor = palette.green; ctx.shadowBlur = 14; ctx.strokeStyle = arcG;
            ctx.beginPath(); ctx.arc(cx, cy, R, a0, a0 + (a1 - a0) * pct); ctx.stroke(); ctx.restore();
            ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '600 ' + (R * 0.42) + 'px Space Grotesk, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('87%', cx, cy - R * 0.05);
            ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '500 ' + (R * 0.14) + 'px Inter, sans-serif';
            ctx.fillText('COVERED · CI-ENFORCED', cx, cy + R * 0.28);
        },
        darts: function (ctx, w, h, t) {
            t = t || 0;
            var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a0f24'); g.addColorStop(1, '#05060f'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            var cx = w * 0.5, cy = h * 0.5, R = Math.min(w, h) * 0.42;
            for (var i = 0; i < 20; i++) {
                var a0 = (i * 18 - 9 - 90) * Math.PI / 180, a1 = (i * 18 + 9 - 90) * Math.PI / 180, even = i % 2 === 0;
                ctx.beginPath(); ctx.arc(cx, cy, R * 0.62, a0, a1); ctx.arc(cx, cy, R * 0.094, a1, a0, true); ctx.closePath();
                ctx.fillStyle = even ? '#0d1228' : '#161d3c'; ctx.fill();
                ctx.save(); ctx.shadowColor = even ? palette.cyan : palette.violet; ctx.shadowBlur = 10; ctx.fillStyle = even ? palette.cyan : palette.violet;
                ctx.beginPath(); ctx.arc(cx, cy, R * 0.629, a0, a1); ctx.arc(cx, cy, R * 0.582, a1, a0, true); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.arc(cx, cy, R * 0.953, a1, a0, true); ctx.closePath(); ctx.fill();
                ctx.restore();
            }
            ctx.save(); ctx.shadowColor = palette.green; ctx.shadowBlur = 12; ctx.fillStyle = palette.green; ctx.beginPath(); ctx.arc(cx, cy, R * 0.094, 0, 7); ctx.fill();
            ctx.shadowColor = '#ff3c5d'; ctx.fillStyle = '#ff3c5d'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.0374, 0, 7); ctx.fill(); ctx.restore();
            function dart(px, py, ang, col) { ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.fillStyle = '#eaf6ff'; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(12, -3); ctx.lineTo(12, 3); ctx.closePath(); ctx.fill(); ctx.fillStyle = col; ctx.fillRect(0, -3, 12, 6); ctx.fillStyle = '#1a2236'; ctx.fillRect(-10, -2, 10, 4); ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-20, -6); ctx.lineTo(-15, 0); ctx.lineTo(-20, 6); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.restore(); }
            var t20a = -90 * Math.PI / 180, rx = cx + Math.cos(t20a) * R * 0.605, ry = cy + Math.sin(t20a) * R * 0.605;
            dart(rx, ry, t20a + Math.PI * 0.15, palette.cyan); dart(cx, cy, Math.PI * 0.9, palette.amber);
            // reticle pulse: t=0 -> sin(0)=0 -> radius 14 / blur 12, exactly the static frame
            var p = Math.sin(t * 0.004);
            ctx.save(); ctx.strokeStyle = palette.green; ctx.shadowColor = palette.green; ctx.shadowBlur = 12 + p * 6; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(rx, ry, 14 + p * 3, 0, 7); ctx.stroke(); ctx.restore();
        },
        riff: function (ctx, w, h, t) {
            t = t || 0;
            ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, w, h);
            var cols = [palette.cyan, palette.violet, palette.green, palette.amber], n = 4, lw = w / (n + 1);
            // falling notes: wrap range is bigger than h so at t=0 (fall=0) every
            // ny is already inside [0, range) and the modulo is a no-op — exact
            // match with the pre-animation static frame.
            var range = h * 1.15, fall = (t * 0.045) % range;
            for (var i = 0; i < n; i++) {
                var x = lw * (i + 1);
                ctx.strokeStyle = 'rgba(120,150,210,0.22)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
                for (var j = 0; j < 2; j++) {
                    var ny = (h * (0.16 + i * 0.12 + j * 0.34) + fall) % range;
                    if (ny > h) continue;
                    ctx.save(); ctx.shadowColor = cols[i]; ctx.shadowBlur = 14; ctx.fillStyle = cols[i];
                    ctx.beginPath(); ctx.arc(x, ny, Math.min(w, h) * 0.05, 0, 7); ctx.fill(); ctx.restore();
                }
            }
            ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lw * 0.5, h * 0.82); ctx.lineTo(w - lw * 0.5, h * 0.82); ctx.stroke();
        },
        riff2: function (ctx, w, h, t) {
            t = t || 0;
            var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#07120b'); g.addColorStop(1, '#04070f');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            var cols = [palette.green, palette.cyan, palette.amber, palette.violet], n = 4, lw = w / (n + 1);
            // falling notes, same no-op-at-rest wrap trick as riff()
            var range = h * 1.15, fall = (t * 0.05) % range;
            for (var i = 0; i < n; i++) {
                var x = lw * (i + 1);
                ctx.strokeStyle = 'rgba(120,210,170,0.22)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
                for (var j = 0; j < 3; j++) {
                    var ny = (h * (0.1 + ((i * 2 + j * 3) % 7) * 0.11) + fall) % range;
                    if (ny > h) continue;
                    ctx.save(); ctx.shadowColor = cols[i]; ctx.shadowBlur = 14; ctx.fillStyle = cols[i];
                    ctx.beginPath(); ctx.arc(x, ny, Math.min(w, h) * 0.045, 0, 7); ctx.fill(); ctx.restore();
                }
            }
            ctx.save(); ctx.strokeStyle = palette.green; ctx.shadowColor = palette.green; ctx.shadowBlur = 12; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(lw * 0.5, h * 0.82); ctx.lineTo(w - lw * 0.5, h * 0.82); ctx.stroke();
            ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(lw * 2, h * 0.82, Math.min(w, h) * 0.07, 0, 7); ctx.stroke(); ctx.restore();
        },
        jackpot: function (ctx, w, h, t) {
            t = t || 0;
            var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1a1006'); g.addColorStop(1, '#05060f');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            var cols = [palette.red, palette.violet, palette.green, palette.cyan, palette.amber], reels = 5, rw = w / (reels + 1);
            for (var i = 0; i < reels; i++) {
                var x = rw * (i + 1);
                ctx.save(); ctx.strokeStyle = 'rgba(255,180,40,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - rw * 0.42, h * 0.14); ctx.lineTo(x - rw * 0.42, h * 0.66); ctx.moveTo(x + rw * 0.42, h * 0.14); ctx.lineTo(x + rw * 0.42, h * 0.66); ctx.stroke(); ctx.restore();
                var spin = (t * 0.01 + i * 0.6) % 1, y = h * 0.4 + Math.sin(spin * 6.283) * h * 0.05;
                ctx.save(); ctx.shadowColor = cols[i]; ctx.shadowBlur = 12; ctx.fillStyle = cols[i];
                ctx.beginPath(); ctx.arc(x, y, Math.min(w, h) * 0.055, 0, 7); ctx.fill(); ctx.restore();
            }
            ctx.save(); ctx.strokeStyle = palette.amber; ctx.shadowColor = palette.amber; ctx.shadowBlur = 14; ctx.lineWidth = 2;
            ctx.strokeRect(w * 0.06, h * 0.14, w * 0.88, h * 0.52);
            ctx.restore();
            ctx.save(); ctx.fillStyle = 'rgba(255,90,90,0.85)'; ctx.shadowColor = palette.red; ctx.shadowBlur = 10;
            ctx.font = '700 ' + (Math.min(w, h) * 0.09) + 'px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('JACKPOT', w / 2, h * 0.82); ctx.restore();
        },
        angrybirds: function (ctx, w, h, t) {
            t = t || 0;
            var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b1330'); g.addColorStop(1, '#1d2a5c'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            var u = Math.min(w, h), gy = h * 0.82;
            ctx.save(); ctx.globalAlpha = 0.5; ctx.shadowColor = palette.cyan; ctx.shadowBlur = 24; ctx.fillStyle = palette.cyan;
            ctx.beginPath(); ctx.arc(w * 0.8, h * 0.27, u * 0.11, 0, 7); ctx.fill(); ctx.restore();
            ctx.fillStyle = '#14224a';
            for (var i = 0; i < 9; i++) { var bw = w / 9, bh = h * (0.16 + ((i * 37) % 5) * 0.045); ctx.fillRect(i * bw, gy - bh, bw - 3, bh); }
            ctx.fillStyle = '#0c1630'; ctx.fillRect(0, gy, w, h - gy);
            ctx.save(); ctx.strokeStyle = palette.cyan; ctx.shadowColor = palette.cyan; ctx.shadowBlur = 10; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); ctx.restore();
            // slingshot
            var sx = w * 0.17, sy = gy - u * 0.2;
            ctx.save(); ctx.strokeStyle = '#a06a2a'; ctx.lineWidth = Math.max(3, u * 0.03); ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(sx - u * 0.04, gy); ctx.lineTo(sx - u * 0.04, sy + u * 0.03); ctx.lineTo(sx - u * 0.07, sy - u * 0.02);
            ctx.moveTo(sx + u * 0.04, gy); ctx.lineTo(sx + u * 0.04, sy + u * 0.03); ctx.lineTo(sx + u * 0.07, sy - u * 0.02); ctx.stroke(); ctx.restore();
            // tower: alternating wood / glass blocks with a drone on top
            var tx = w * 0.74, bs = u * 0.13, cols = [palette.amber, palette.cyan, palette.amber];
            for (var k = 0; k < 3; k++) {
                ctx.save(); ctx.fillStyle = k === 1 ? 'rgba(57,230,255,0.22)' : 'rgba(201,154,46,0.85)'; ctx.strokeStyle = cols[k]; ctx.lineWidth = 1.5;
                ctx.fillRect(tx - bs / 2, gy - bs * (k + 1), bs, bs); ctx.strokeRect(tx - bs / 2 + 0.75, gy - bs * (k + 1) + 0.75, bs - 1.5, bs - 1.5); ctx.restore();
            }
            var dy = gy - bs * 3 - bs * 0.45, dr = bs * 0.42;
            ctx.save(); ctx.shadowColor = '#ff5d9e'; ctx.shadowBlur = 14; ctx.fillStyle = '#ff5d9e';
            ctx.beginPath(); ctx.arc(tx, dy, dr, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
            ctx.fillStyle = '#150b1e'; ctx.fillRect(tx - dr * 0.7, dy - dr * 0.25, dr * 1.4, dr * 0.5);
            ctx.fillStyle = '#ffe9a8'; ctx.fillRect(tx - dr * 0.45, dy - dr * 0.08, dr * 0.3, dr * 0.16); ctx.fillRect(tx + dr * 0.15, dy - dr * 0.08, dr * 0.3, dr * 0.16); ctx.restore();
            // lob arc (dotted) + the bird riding it. t=0 -> phase 0.4, the static frame.
            var x0 = sx, y0 = sy, x2 = tx - dr, y2 = dy, x1 = (x0 + x2) / 2, y1 = Math.min(y0, y2) - h * 0.5;
            function at(p) { var q = 1 - p; return [q * q * x0 + 2 * q * p * x1 + p * p * x2, q * q * y0 + 2 * q * p * y1 + p * p * y2]; }
            ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.7)';
            for (var d = 0.06; d < 0.96; d += 0.07) { var pt = at(d); ctx.beginPath(); ctx.arc(pt[0], pt[1], 1.8, 0, 7); ctx.fill(); }
            ctx.restore();
            var ph = (0.4 + t * 0.00028) % 1, bp = at(ph), br = u * 0.055;
            ctx.save(); ctx.shadowColor = palette.cyan; ctx.shadowBlur = 14; ctx.fillStyle = palette.cyan;
            ctx.beginPath(); ctx.arc(bp[0], bp[1], br, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bp[0] + br * 0.35, bp[1] - br * 0.25, br * 0.28, 0, 7); ctx.fill();
            ctx.fillStyle = '#10142a'; ctx.beginPath(); ctx.arc(bp[0] + br * 0.42, bp[1] - br * 0.25, br * 0.12, 0, 7); ctx.fill();
            ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.moveTo(bp[0] + br * 0.85, bp[1] - br * 0.05); ctx.lineTo(bp[0] + br * 1.6, bp[1] + br * 0.2); ctx.lineTo(bp[0] + br * 0.85, bp[1] + br * 0.4); ctx.fill();
            ctx.restore();
        },
        pinball: function (ctx, w, h, t) {
            t = t || 0;
            var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a0a1e'); g.addColorStop(1, '#05060f'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            var bmp = [[0.32, 0.30], [0.60, 0.26], [0.46, 0.46]];
            for (var i = 0; i < bmp.length; i++) {
                var bx = w * bmp[i][0], by = h * bmp[i][1], r = Math.min(w, h) * 0.08;
                ctx.save(); ctx.shadowColor = palette.cyan; ctx.shadowBlur = 16; ctx.strokeStyle = palette.cyan; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.stroke(); ctx.restore();
            }
            ctx.save(); ctx.strokeStyle = palette.green; ctx.lineWidth = Math.min(w, h) * 0.05; ctx.lineCap = 'round'; ctx.shadowColor = palette.green; ctx.shadowBlur = 12;
            ctx.beginPath(); ctx.moveTo(w * 0.30, h * 0.84); ctx.lineTo(w * 0.46, h * 0.92); ctx.moveTo(w * 0.70, h * 0.84); ctx.lineTo(w * 0.54, h * 0.92); ctx.stroke(); ctx.restore();
            // ball drift: t=0 -> sin(0)=0 for both axes -> the exact static ball position
            var dx = Math.sin(t * 0.0021) * w * 0.035, dy = Math.sin(t * 0.0034) * h * 0.02;
            ctx.fillStyle = '#eaf6ff'; ctx.beginPath(); ctx.arc(w * 0.40 + dx, h * 0.66 + dy, Math.min(w, h) * 0.035, 0, 7); ctx.fill();
        },
        voidrunner: function (ctx, w, h, t) {
            t = t || 0;
            ctx.fillStyle = '#03030a'; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(200,222,255,0.8)';
            // starfield drift: every base sy already sits in [0, h), so at t=0
            // (drift=0) the modulo is a no-op and stars land on their static spots
            var drift = (t * 0.012) % h;
            for (var i = 0; i < 42; i++) { var sx = (i * 73 % 100) / 100 * w, sy = ((i * 149 % 100) / 100 * h + drift) % h, r = (i % 3) * 0.6 + 0.6; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill(); }
            ctx.save(); ctx.translate(w * 0.66, h * 0.32); ctx.strokeStyle = 'rgba(127,214,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath();
            for (var v = 0; v < 7; v++) { var a = v / 7 * Math.PI * 2, rr = Math.min(w, h) * 0.12 * (0.7 + (v % 2) * 0.3), px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (v === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.stroke(); ctx.restore();
            ctx.save(); ctx.translate(w * 0.42, h * 0.70);
            ctx.shadowColor = palette.green; ctx.shadowBlur = 14; ctx.fillStyle = 'rgba(120,255,200,0.55)'; ctx.beginPath(); ctx.arc(0, Math.min(w, h) * 0.05, Math.min(w, h) * 0.06, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
            ctx.fillStyle = '#dff6ff'; ctx.strokeStyle = palette.cyan; ctx.lineWidth = 2; var s = Math.min(w, h) * 0.07;
            ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.6); ctx.lineTo(0, s * 0.3); ctx.lineTo(-s * 0.7, s * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        },
        cornhole: function (ctx, w, h, t) {
            t = t || 0;
            var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0d0908'); g.addColorStop(1, '#05050f'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            // board (wooden surface tilted, side view)
            ctx.save();
            ctx.fillStyle = 'rgba(180, 120, 60, 0.9)'; // wood brown
            ctx.beginPath();
            ctx.moveTo(w * 0.3, h * 0.6); ctx.lineTo(w * 0.8, h * 0.5); ctx.lineTo(w * 0.82, h * 0.45); ctx.lineTo(w * 0.28, h * 0.65); ctx.closePath();
            ctx.fill();
            // board wood grain (darker stripes)
            ctx.strokeStyle = 'rgba(100, 60, 30, 0.6)';
            ctx.lineWidth = 2;
            for (var bd = 0; bd < 5; bd++) {
                var by = h * 0.5 + bd * h * 0.016;
                ctx.beginPath();
                ctx.moveTo(w * 0.3 + bd * w * 0.01, by);
                ctx.lineTo(w * 0.8 + bd * w * 0.01, by - h * 0.1);
                ctx.stroke();
            }
            ctx.restore();
            // hole (bright neon ring)
            var hx = w * 0.64, hy = h * 0.48;
            ctx.save();
            ctx.shadowColor = palette.amber;
            ctx.shadowBlur = 16;
            ctx.strokeStyle = palette.amber;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(hx, hy, Math.min(w, h) * 0.08, 0, 7);
            ctx.stroke();
            // hole interior
            ctx.fillStyle = 'rgba(255, 160, 60, 0.2)';
            ctx.fill();
            ctx.restore();
            // bag in flight (falling onto board)
            var bx = w * 0.5 + Math.sin(t * 0.0028) * w * 0.08;
            var by = h * 0.3 + Math.sin(t * 0.0042) * h * 0.15;
            ctx.save();
            ctx.shadowColor = palette.cyan;
            ctx.shadowBlur = 14;
            ctx.fillStyle = palette.cyan;
            ctx.fillRect(bx - w * 0.06, by - h * 0.08, w * 0.12, h * 0.12);
            // bag stitching
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx - w * 0.02, by - h * 0.08);
            ctx.lineTo(bx + w * 0.02, by + h * 0.04);
            ctx.stroke();
            ctx.restore();
            // ground hint
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(w * 0.2, h * 0.7);
            ctx.lineTo(w * 0.9, h * 0.7);
            ctx.stroke();
        },
        cricket: function (ctx, w, h, t) {
            t = t || 0;
            var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#051a08'); g.addColorStop(1, '#05050f'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            // grass pitch with perspective
            ctx.fillStyle = 'rgba(50, 120, 80, 0.6)';
            ctx.beginPath();
            ctx.moveTo(w * 0.2, h * 0.4);
            ctx.lineTo(w * 0.8, h * 0.4);
            ctx.lineTo(w * 0.85, h * 0.8);
            ctx.lineTo(w * 0.15, h * 0.8);
            ctx.closePath();
            ctx.fill();
            // pitch lines (crease)
            ctx.strokeStyle = palette.green;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.moveTo(w * 0.3, h * 0.4);
            ctx.lineTo(w * 0.3, h * 0.8);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(w * 0.7, h * 0.4);
            ctx.lineTo(w * 0.7, h * 0.8);
            ctx.stroke();
            ctx.globalAlpha = 1;
            // wickets (stumps) at far end
            var wk_x = w * 0.5;
            var wk_y = h * 0.42;
            ctx.save();
            ctx.strokeStyle = palette.cyan;
            ctx.lineWidth = 2;
            for (var st = 0; st < 3; st++) {
                ctx.beginPath();
                ctx.moveTo(wk_x - w * 0.04 + st * w * 0.04, wk_y);
                ctx.lineTo(wk_x - w * 0.04 + st * w * 0.04, wk_y - h * 0.08);
                ctx.stroke();
            }
            // bails
            ctx.beginPath();
            ctx.moveTo(wk_x - w * 0.065, wk_y - h * 0.075);
            ctx.lineTo(wk_x + w * 0.025, wk_y - h * 0.075);
            ctx.stroke();
            ctx.restore();
            // batsman silhouette
            var bt_x = w * 0.35;
            var bt_y = h * 0.65;
            ctx.save();
            ctx.fillStyle = palette.amber;
            ctx.shadowColor = palette.amber;
            ctx.shadowBlur = 12;
            // bat swing
            var bat_angle = t * 0.006;
            ctx.translate(bt_x, bt_y);
            ctx.rotate(bat_angle);
            ctx.fillRect(-w * 0.02, -h * 0.12, w * 0.04, h * 0.16);
            ctx.restore();
            // batter body
            ctx.save();
            ctx.fillStyle = palette.amber;
            ctx.beginPath();
            ctx.arc(bt_x, bt_y - h * 0.05, Math.min(w, h) * 0.035, 0, 7);
            ctx.fill();
            ctx.restore();
            // ball in flight
            var bl_x = w * 0.6 + Math.sin(t * 0.0025) * w * 0.1;
            var bl_y = h * 0.35 + Math.cos(t * 0.0035) * h * 0.1;
            ctx.save();
            ctx.shadowColor = palette.violet;
            ctx.shadowBlur = 14;
            ctx.fillStyle = palette.violet;
            ctx.beginPath();
            ctx.arc(bl_x, bl_y, Math.min(w, h) * 0.035, 0, 7);
            ctx.fill();
            // ball seam detail
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(bl_x, bl_y, Math.min(w, h) * 0.02, 0, 7);
            ctx.stroke();
            ctx.restore();
        }
    };
    // Game-scene canvases get a subtle idle-loop animation (DBZ-054): reticle
    // pulse, falling notes, ball/starfield drift, bolt flicker, chomp, debris
    // spin, circuit spark. Every animated scene fn above is written so t=0
    // reproduces its pre-animation static frame exactly (see the "t=0 -> ..."
    // comments in each), so paintAll's single frame and the reduced-motion
    // path below are pixel-identical to the art that shipped before this lane.
    var ANIMATED_SCENES = { jungle: 1, darts: 1, riff: 1, riff2: 1, pinball: 1, voidrunner: 1, munch: 1, orbital: 1, circuit: 1, cornhole: 1, cricket: 1, jackpot: 1, angrybirds: 1 };
    function paintAll() {
        document.querySelectorAll('.shot-canvas').forEach(function (cv) {
            var scene = cv.getAttribute('data-scene');
            if (!scenes[scene]) return;
            var f = fitCanvas(cv);
            scenes[scene](f.ctx, f.w, f.h, 0);
            if (ANIMATED_SCENES[scene]) cv._kfCache = f; // cached ctx/w/h for the shared ticker below
        });
    }
    // These vector-art thumbnails are decorative (aria-hidden) and mostly
    // below the fold, so painting them isn't on the critical path — hand it
    // to the browser's idle time instead of racing it against real work.
    // requestIdleCallback isn't in Safari; setTimeout is an equally-deferred fallback.
    function schedulePaintAll() {
        if ('requestIdleCallback' in window) requestIdleCallback(paintAll, { timeout: 500 });
        else setTimeout(paintAll, 200);
    }
    window.addEventListener('load', schedulePaintAll);
    schedulePaintAll();
    var prt; window.addEventListener('resize', function () { clearTimeout(prt); prt = setTimeout(paintAll, 200); });
    /* ════════ END [J14] Neon scene painter (game thumbnails) ════════ */

    /* ════════ BEGIN [J15] Arcade thumbnail motion ticker ════════ */
    /* --------------------------------------------------------------
     * Arcade thumbnail motion (DBZ-054) — one shared rAF ticker for every
     * animated game-scene canvas, not one loop per canvas. Gated by a single
     * IntersectionObserver (only currently-visible thumbnails redraw), paused
     * while the tab is hidden, and never started at all under
     * prefers-reduced-motion — paintAll's static frame above is the whole
     * experience in that case, exactly as it was before this lane.
     * ------------------------------------------------------------ */
    (function () {
        if (reduce || !('IntersectionObserver' in window)) return;
        var animCanvases = [];
        document.querySelectorAll('.shot-canvas').forEach(function (cv) {
            if (ANIMATED_SCENES[cv.getAttribute('data-scene')]) animCanvases.push(cv);
        });
        if (!animCanvases.length) return;
        var visible = new Set();
        var running = false, hidden = document.hidden;
        function tick(now) {
            if (!visible.size || hidden) { running = false; return; }
            for (var i = 0; i < animCanvases.length; i++) {
                var cv = animCanvases[i];
                if (!visible.has(cv) || !cv._kfCache) continue;
                scenes[cv.getAttribute('data-scene')](cv._kfCache.ctx, cv._kfCache.w, cv._kfCache.h, now);
            }
            requestAnimationFrame(tick);
        }
        function start() { if (!running) { running = true; requestAnimationFrame(tick); } }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) { if (en.isIntersecting) visible.add(en.target); else visible.delete(en.target); });
            if (visible.size && !hidden) start();
        }, { threshold: 0, rootMargin: '120px 0px' });
        animCanvases.forEach(function (cv) { io.observe(cv); });
        document.addEventListener('visibilitychange', function () {
            hidden = document.hidden;
            if (!hidden && visible.size) start();
        });
    })();
    /* ════════ END [J15] Arcade thumbnail motion ticker ════════ */

    /* ════════ BEGIN [J16] Legacy hash router ════════ */
    (function () {
        var MAP = {
            'home': 'home', 'page-home': 'home',
            'services': 'services', 'page-services': 'services',
            'agents': 'agents', 'page-agents': 'agents', 'store': 'agent-store',
            'work': 'work', 'page-work': 'work',
            'games': 'games', 'page-games': 'games',
            'tools': 'work', 'page-tools': 'work',
            'scribe': 'work', 'page-scribe': 'work',
            'contact': 'contact', 'page-contact': 'contact',
            'doctrine': 'doctrine', 'page-doctrine': 'doctrine',
            'pricing': 'pricing', 'process': 'process', 'lab': 'lab'
        };
        function apply() {
            var h = (location.hash || '').replace('#', '');
            if (!h) return;
            var id = MAP[h.toLowerCase()] || h;
            var el = document.getElementById(id);
            if (el) setTimeout(function () { el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }); }, 60);
        }
        window.addEventListener('hashchange', apply);
        apply();
    })();
    /* ════════ END [J16] Legacy hash router ════════ */

    /* ════════ BEGIN [J17] Floating "Start a project" pill ════════ */
    /* ---------- Floating "Start a project" pill (DBZ-056) ----------
       Shows once the visitor has scrolled past #services AND past #process
       into #work, hides again once #contact starts entering view (same CTA
       already lives inline there — no need to cover it).
       Originally watched #process (the section right after #services)
       entering view as the "just moved past services" signal, but #process
       is itself a 340vh `position: sticky`-pinned scrollytelling section
       (.story .pin-outer) — while it's pinned, its own step cards
       continuously animate through the same bottom-of-viewport region the
       pill occupies, so the pill (which latches on permanently once shown)
       ended up overlapping step-card text for the *entire* pinned scroll,
       not just at the boundary (found 2026-07-07, reproduced against both
       the last `#services` panel's `.pv-cap` caption chip and #process's
       own "01 · Discovery" step card). Fix: watch #work — the section that
       only enters view once the #process pin has fully released — instead.
       That flag latches permanently once true (mirrors the one-shot ".lit"
       section-lighting observer above — fires once, never re-hides) so
       scrolling on past #work into #games/#agents doesn't flicker the pill
       back off before #contact is actually near.
       Dismissable and remembered for the session via sessionStorage, so it
       never nags on repeat page views within a tab. */
    (function () {
        var pill = document.getElementById('floatCta');
        var closeBtn = document.getElementById('floatCtaClose');
        if (!pill || !closeBtn) return;
        var DISMISS_KEY = 'kudbee.fctaDismissed';
        var dismissed = false;
        try { dismissed = sessionStorage.getItem(DISMISS_KEY) === '1'; } catch (e) {}
        if (dismissed) { pill.hidden = true; return; }
        var pastServicesEl = document.getElementById('work');
        var contactEl = document.getElementById('contact');
        if (!pastServicesEl || !contactEl || !('IntersectionObserver' in window)) return;
        var pastServices = false;
        var nearContact = false;
        function sync() { pill.classList.toggle('show', pastServices && !nearContact); }
        var servicesIo = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) { pastServices = true; sync(); servicesIo.unobserve(e.target); }
            });
        }, { threshold: 0, rootMargin: '-10% 0px -10% 0px' });
        servicesIo.observe(pastServicesEl);
        var contactIo = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) { nearContact = e.isIntersecting; sync(); });
        }, { threshold: 0, rootMargin: '0px 0px -15% 0px' });
        contactIo.observe(contactEl);
        closeBtn.addEventListener('click', function () {
            pill.classList.remove('show');
            pill.hidden = true;
            try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
        });
    })();
    /* ════════ END [J17] Floating "Start a project" pill ════════ */

    /* ════════ BEGIN [J18] Contact form validation ════════ */
    /* ---------- Contact form: inline validation + honest mailto disclosure (DBZ-056) ----------
       This form has no backend (see the .form-note--top copy above it in the
       markup) — submitting it hands off to the browser's mailto: flow. This
       script only (a) validates the two required fields as-you-type/on-blur
       with a real per-field error string (not color alone) plus
       aria-invalid/aria-describedby, and (b) swaps the status line to an
       honest "opening your email app" message on a valid submit instead of
       implying a silent server-side send. It never fabricates a server-side
       success/failure the page can't actually observe. */
    (function () {
        var form = document.getElementById('contactForm');
        if (!form) return;
        var status = document.getElementById('cf-status');
        var fields = [
            {
                input: document.getElementById('cf-name'),
                err: document.getElementById('cf-name-err'),
                validate: function (v) { return v.trim() ? '' : 'Please enter your name.'; }
            },
            {
                input: document.getElementById('cf-email'),
                err: document.getElementById('cf-email-err'),
                validate: function (v) {
                    var t = v.trim();
                    if (!t) return 'Please enter your email.';
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return 'Enter a valid email address.';
                    return '';
                }
            }
        ];
        function setState(f, msg) {
            if (!f.input) return;
            var label = f.input.closest('label');
            f.input.setAttribute('aria-invalid', msg ? 'true' : 'false');
            if (f.err) f.err.textContent = msg;
            if (label) label.classList.toggle('err', !!msg);
        }
        fields.forEach(function (f) {
            if (!f.input) return;
            f.input.addEventListener('blur', function () { setState(f, f.validate(f.input.value)); });
            f.input.addEventListener('input', function () {
                // Only re-validate live once a field has already been flagged —
                // don't scold the visitor mid-first-keystroke.
                if (f.input.getAttribute('aria-invalid') === 'true') setState(f, f.validate(f.input.value));
            });
        });
        form.addEventListener('submit', function (e) {
            var firstInvalid = null;
            fields.forEach(function (f) {
                if (!f.input) return;
                var msg = f.validate(f.input.value);
                setState(f, msg);
                if (msg && !firstInvalid) firstInvalid = f.input;
            });
            if (firstInvalid) {
                e.preventDefault();
                firstInvalid.focus();
                if (status) status.textContent = 'Please fix the highlighted field before sending.';
                return;
            }
            if (status) status.textContent = 'Opening your email app with this message pre-filled — send it from there. If nothing opens, email kudbeezero@gmail.com directly.';
            // Not preventDefault()'d: the native mailto: action proceeds so the
            // browser actually opens the visitor's email client.
        });
    })();
    /* ════════ END [J18] Contact form validation ════════ */

})();
