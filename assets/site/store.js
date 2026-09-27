/* ═══════════════════════════════════════════════════════════════════
   assets/site/store.js — tiny-app store install terminal. Reads
   KUDBEE_CONFIG from agent.js. Filing: BEGIN [Txx] / END [Txx].
   ═══════════════════════════════════════════════════════════════════ */
/* ════════ BEGIN [T01] Tiny-app store — install terminal ════════ */
/* --------------------------------------------------------------
 * Kudbee tiny-app store — futuristic install terminal. Clicking
 * Install spins up a simulated `kudbee add <slug>` install, then
 * offers the live tool or a $5 checkout placeholder. No backend,
 * no payment wired (owner-gated) — purely the storefront experience.
 * ------------------------------------------------------------ */
(function initStore() {
    var term = document.getElementById('term-body');
    var panel = document.getElementById('agent-terminal');
    if (!term || !panel) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var live = panel.querySelector('.term-live');
    var busy = false;

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, reduce ? 0 : ms); }); }
    function line(html) { var d = document.createElement('div'); d.className = 'term-line'; d.innerHTML = html; term.appendChild(d); term.scrollTop = term.scrollHeight; return d; }
    async function typeInto(el, text) {
        if (reduce) { el.textContent = text; return; }
        for (var i = 0; i < text.length; i++) { el.textContent += text[i]; term.scrollTop = term.scrollHeight; await sleep(20); }
    }
    function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
/* ════════ END [T01] Tiny-app store — install terminal ════════ */

/* ════════ BEGIN [T02] Typed terminal commands ════════ */
    /* ---------- Typed terminal commands (DBZ-055) ----------
       Real keyboard input, not decorative: `kudbee help`, `kudbee list`,
       `kudbee open <slug>` (plus the `add` alias the store cards already
       advertise as `kudbee add <slug>`), with Up/Down cycling command
       history like a real shell prompt. */
    var cmdHistory = [];
    var histIdx = 0;
    function currentInput() { return term.querySelector('.term-cmd-input'); }
    function addPrompt(focusIt) {
        var row = document.createElement('div');
        row.className = 'term-line term-prompt';
        row.innerHTML = '<span class="pr">kudbee@studio</span><span class="dim">:~$</span>';
        var inp = document.createElement('input');
        inp.type = 'text'; inp.className = 'term-cmd-input'; inp.autocomplete = 'off'; inp.autocapitalize = 'off';
        inp.spellcheck = false; inp.setAttribute('aria-label', 'Kudbee terminal command input');
        row.appendChild(inp);
        term.appendChild(row); term.scrollTop = term.scrollHeight;
        inp.addEventListener('keydown', onPromptKeydown);
        // Only steal focus when the visitor is already interacting with the
        // terminal (mid command, or just triggered an install) — never on
        // initial page load, which would be a rude, unrequested focus jump.
        if (focusIt) inp.focus({ preventScroll: true });
        return inp;
    }
    function commitPromptLine(inp, text) {
        var row = inp.closest('.term-prompt');
        if (!row) return;
        row.classList.remove('term-prompt');
        row.innerHTML = '<span class="pr">kudbee@studio</span><span class="dim">:~$</span> <span class="cmd">' + escapeHtml(text) + '</span>';
    }
    function findCard(slug) {
        var match = null;
        document.querySelectorAll('.store-card').forEach(function (c) { if (c.getAttribute('data-app') === slug) match = c; });
        return match;
    }
    function runCommand(raw) {
        var inp = currentInput(), text = (raw || '').trim();
        if (inp) commitPromptLine(inp, text);
        if (!text) { addPrompt(true); return; }
        cmdHistory.push(text); histIdx = cmdHistory.length;
        var parts = text.split(/\s+/);
        var root = parts[0].toLowerCase();
        if (root !== 'kudbee') {
            line('<span class="warn">command not found: ' + escapeHtml(parts[0]) + '</span> <span class="dim">— try</span> <span class="cmd">kudbee help</span>');
            addPrompt(true);
            return;
        }
        var sub = (parts[1] || 'help').toLowerCase();
        if (sub === 'help') {
            line('<span class="ok">Available commands</span>');
            line('<span class="cmd">kudbee help</span><span class="dim"> — show this list</span>');
            line('<span class="cmd">kudbee list</span><span class="dim"> — list every tiny app &amp; status</span>');
            line('<span class="cmd">kudbee open &lt;slug&gt;</span><span class="dim"> — install &amp; open an app, e.g. kudbee open scribe</span>');
            line('<span class="dim">↑ / ↓ — cycle command history</span>');
            addPrompt(true);
        } else if (sub === 'list') {
            var cards = document.querySelectorAll('.store-card');
            line('<span class="ok">' + cards.length + ' apps available</span> <span class="dim">· installs in your browser · private by default</span>');
            cards.forEach(function (card) {
                var slug = card.getAttribute('data-app'), name = card.getAttribute('data-name');
                var isLive = card.getAttribute('data-live') === '1';
                var status = isLive ? '<span class="ok">● live</span>' : '<span class="warn">○ $5</span>';
                line('&nbsp; <span class="cmd">' + escapeHtml(slug) + '</span> <span class="dim">— ' + escapeHtml(name) + '</span> ' + status);
            });
            addPrompt(true);
        } else if (sub === 'open' || sub === 'add') {
            var slug = (parts[2] || '').toLowerCase();
            if (!slug) { line('<span class="warn">usage: kudbee open &lt;slug&gt;</span> <span class="dim">— try</span> <span class="cmd">kudbee list</span>'); addPrompt(true); return; }
            var card = findCard(slug);
            if (!card) { line('<span class="warn">unknown app: ' + escapeHtml(slug) + '</span> <span class="dim">— try</span> <span class="cmd">kudbee list</span>'); addPrompt(true); return; }
            panel.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
            install(card.getAttribute('data-app'), card.getAttribute('data-name'), card.getAttribute('data-live') === '1', card.getAttribute('data-url') || '');
            // install() clears the screen and re-adds a fresh, focused prompt when it finishes.
        } else {
            line('<span class="warn">unknown command: kudbee ' + escapeHtml(sub) + '</span> <span class="dim">— try</span> <span class="cmd">kudbee help</span>');
            addPrompt(true);
        }
    }
    function onPromptKeydown(e) {
        var inp = e.target;
        if (e.key === 'Enter') {
            e.preventDefault();
            runCommand(inp.value);
        } else if (e.key === 'ArrowUp') {
            if (!cmdHistory.length) return;
            e.preventDefault();
            histIdx = Math.max(0, histIdx - 1);
            inp.value = cmdHistory[histIdx] || '';
            inp.setSelectionRange(inp.value.length, inp.value.length);
        } else if (e.key === 'ArrowDown') {
            if (!cmdHistory.length) return;
            e.preventDefault();
            histIdx = Math.min(cmdHistory.length, histIdx + 1);
            inp.value = histIdx === cmdHistory.length ? '' : cmdHistory[histIdx];
            inp.setSelectionRange(inp.value.length, inp.value.length);
        }
    }
    // Clicking anywhere in the terminal (not on a link/button) focuses the
    // live command prompt, like a real terminal window.
    panel.addEventListener('click', function (e) {
        if (e.target.closest('a, button, input')) return;
        var inp = currentInput();
        if (inp) inp.focus();
    });

    // Checkout via Gumroad. Flip PAYMENT_LIVE to true once the products exist.
    // TODO(owner): set GUMROAD to your real store ("https://<handle>.gumroad.com/l/")
    // and PAYMENT_LIVE = true after creating a $5 product per app slug.
    var GUMROAD = 'https://kudbee.gumroad.com/l/';
    var PAYMENT_LIVE = false;
    function buyOnGumroad(slug) {
        if (PAYMENT_LIVE) { window.open(GUMROAD + slug, '_blank', 'noopener'); line('<span class="ok">→ opening Gumroad checkout…</span>'); }
        else { line('<span class="warn">→ checkout opens on Gumroad — $5</span> <span class="dim">(store goes live once the owner publishes the product)</span>'); }
    }

    // Demand capture: per-app waitlist, saved locally; POSTs to endpoint if set, else mailto.
    var WAITLIST_ENDPOINT = KUDBEE_CONFIG.WAITLIST_ENDPOINT; // see the config block at the top of this script.
    function mailtoWaitlist(slug, email) {
        window.location.href = 'mailto:kudbeezero@gmail.com?subject=' + encodeURIComponent('Waitlist: ' + slug) + '&body=' + encodeURIComponent('Email: ' + email + '\nApp: ' + slug);
    }
    function joinWaitlist(slug, name) {
        line('<span class="ok">→ join the waitlist for ' + name + '</span> <span class="dim">— drop your email, no spam.</span>');
        var f = document.createElement('form'); f.className = 'term-cta'; f.style.marginTop = '8px';
        var inp = document.createElement('input');
        inp.type = 'email'; inp.required = true; inp.placeholder = 'you@email.com'; inp.setAttribute('aria-label', 'Your email for the ' + name + ' waitlist');
        inp.style.cssText = 'flex:1;min-width:0;background:#05050b;border:1px solid var(--border);border-radius:999px;padding:10px 14px;color:var(--txt);font:13px ui-monospace,monospace;outline:none;';
        var sb = document.createElement('button'); sb.type = 'submit'; sb.className = 'buy'; sb.textContent = 'Notify me';
        f.appendChild(inp); f.appendChild(sb); term.appendChild(f); term.scrollTop = term.scrollHeight; inp.focus();
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var email = inp.value.trim();
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { inp.focus(); return; }
            try { var a = JSON.parse(localStorage.getItem('kudbee.waitlist') || '[]'); a.push({ app: slug, email: email, at: new Date().toISOString() }); localStorage.setItem('kudbee.waitlist', JSON.stringify(a.slice(-100))); } catch (err) {}
            f.remove();
            function done() { line('<span class="ok">✓ you’re on the list for ' + name + '.</span> <span class="dim">we’ll email you at launch.</span>'); }
            if (WAITLIST_ENDPOINT) {
                fetch(WAITLIST_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify({ app: slug, email: email, source: 'kudbee-store' }) })
                    .then(done).catch(function () { mailtoWaitlist(slug, email); done(); });
            } else { mailtoWaitlist(slug, email); done(); }
        });
    }

    async function install(slug, name, isLive, url) {
        if (busy) return; busy = true;
        if (live) { live.textContent = 'installing'; live.style.color = 'var(--magenta)'; }
        panel.classList.add('installing');
        term.innerHTML = '';
        var l1 = line('<span class="pr">kudbee@studio</span><span class="dim">:~$</span> <span class="cmd"></span><span class="term-cursor"></span>');
        await typeInto(l1.querySelector('.cmd'), 'npx kudbee add ' + slug);
        var cur = l1.querySelector('.term-cursor'); if (cur) cur.remove();
        await sleep(280);
        var steps = [
            ['dim', '· resolving registry…'],
            ['dim', '· fetching ' + slug + '@latest'],
            ['vio', '◇ verifying signature ✓'],
            ['dim', '· installing dependencies'],
            ['ok', '▸ building ' + name],
            ['dim', '· optimizing for your browser (zero-build)']
        ];
        for (var i = 0; i < steps.length; i++) { await sleep(300); line('<span class="' + steps[i][0] + '">' + steps[i][1] + '</span>'); }
        await sleep(320);
        line('<span class="ok">✓ ' + name + ' installed.</span> <span class="dim">ready in this browser — private, no signup.</span>');
        var cta = document.createElement('div'); cta.className = 'term-cta';
        if (isLive && url) {
            cta.innerHTML = '<a class="buy" href="' + url + '" target="_blank" rel="noopener">Open ' + name + ' →</a><button class="ghost" type="button" data-buy>Get the download — $5</button>';
        } else {
            cta.innerHTML = '<button class="buy" type="button" data-buy>Get it — $5 →</button><button class="ghost" type="button" data-book>Notify me at launch</button>';
        }
        term.appendChild(cta); term.scrollTop = term.scrollHeight;
        var buy = cta.querySelector('[data-buy]'); if (buy) buy.addEventListener('click', function () { buyOnGumroad(slug); });
        var book = cta.querySelector('[data-book]'); if (book) book.addEventListener('click', function () { joinWaitlist(slug, name); });
        if (live) { live.textContent = 'ready'; live.style.color = 'var(--green)'; }
        panel.classList.remove('installing');
        busy = false;
        addPrompt(true);
    }

    document.querySelectorAll('.store-card').forEach(function (card) {
        var btn = card.querySelector('.install-btn');
        if (!btn) return;
        btn.addEventListener('click', function () {
            panel.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
            install(card.getAttribute('data-app'), card.getAttribute('data-name'),
                    card.getAttribute('data-live') === '1', card.getAttribute('data-url') || '');
        });
    });

    addPrompt(false); // seed the live command prompt on load — never steal focus unrequested
})();
/* ════════ END [T02] Typed terminal commands ════════ */
