/* ═══════════════════════════════════════════════════════════════════
   assets/site/agent.js — Kudbee Agent concierge widget + owner config.
   KUDBEE_CONFIG is a global read by store.js too (load agent.js first).
   Filing: BEGIN [Axx] / END [Axx]. Directory: AGENTS.md → "Site filing system".
   ═══════════════════════════════════════════════════════════════════ */
/* ════════ BEGIN [A01] Owner config — capture endpoints ════════ */
/* --------------------------------------------------------------
 * DBZ-055 — single owner config block (ties into DBZ-039/DBZ-040).
 * Both capture forms below (agent lead capture + tiny-app waitlist)
 * read their POST endpoint from here, so the owner pastes both
 * Formspree/Formsubmit URLs in exactly one place. Both stay '' —
 * no backend is enabled by this lane; each capture form falls back
 * to a mailto: draft (and always saves locally) until an endpoint
 * is set here.
 * ------------------------------------------------------------ */
var KUDBEE_CONFIG = {
    LEAD_ENDPOINT: '',     // TODO(owner): paste a Formspree/Formsubmit POST URL to auto-collect agent leads.
    WAITLIST_ENDPOINT: ''  // TODO(owner): paste a Formspree/Formsubmit POST URL to auto-collect tiny-app waitlist signups.
};
/* ════════ END [A01] Owner config — capture endpoints ════════ */

/* ════════ BEGIN [A02] Kudbee Agent — setup + site index ════════ */
(function initAgent() {
    var log = document.getElementById('agent-log');
    var form = document.getElementById('agent-form');
    var input = document.getElementById('agent-input');
    var send = document.getElementById('agent-send');
    var chips = document.getElementById('agent-chips');
    var state = document.getElementById('agent-state');
    if (!log || !form) return;

    var CAL = 'https://cal.com/kudbee';
    var BASE = (window.KUDBEE_AGENT_URL || '').replace(/\/$/, '');
    var busy = false;

    /* --------------------------------------------------------------
     * Site index — the Kudbee Agent's "brain". Every section/surface
     * is indexed here so the agent answers instantly and deep-links
     * you straight there, with no backend. Keep in sync as pages ship.
     * target: a "#section" anchor on this page, or a URL (opens it).
     * ------------------------------------------------------------ */
    var KB = [
        { t: 'Web design & development', kw: 'website websites web design develop build site convert landing redesign page speed', b: "Web design is my #1 craft — high-converting, hand-built, fast sites with no page-builder bloat. Want to see real client work, or start a project?", a: [['See the work', '#work'], ['Start a project', '#contact']] },
        { t: 'Services & pricing', kw: 'services pricing plans price cost package offer what do you do rates quote', b: "I design websites (my #1), teach teams to build their own AI agents & infrastructure, and craft original games. Site packages run $99–$500; AI work is scoped on a quick discovery call.", a: [['Browse services', '#services'], ['See pricing', '#pricing']] },
        { t: 'AI agent training & consulting', kw: 'ai agent agents training teach learn consulting infrastructure workshop zoom team build your own automate', b: "I teach you and your team to build your own AI agents and infrastructure — hands-on, live over Zoom, no black boxes. You own everything you build.", a: [['How training works', '#services'], ['Build your own brain', 'brain/']] },
        { t: 'Build your own memory layer', kw: 'memory layer second brain remember context across devices platform knowledge personal ai notes brain recall persistent', b: "Build Your Own Brain: I teach you to stand up a portable memory layer that remembers across every app and device — ChatGPT, Claude, Cursor, phone, laptop — and you keep control of your data.", a: [['Open the page', 'brain/'], ['Book a call', CAL]] },
        { t: 'Selected work / portfolio', kw: 'work portfolio examples example case study studies clients proof projects results showcase', b: "Selected Work leads with real client websites — ModernMed Chicago and La Grange Park Fastpitch — plus AI work, tools and original games.", a: [['See the work', '#work']] },
        { t: 'ModernMed Chicago (client site)', kw: 'modernmed modern med medical clinic healthcare doctor concierge client example website chicago', b: "ModernMed Chicago — a concierge medical clinic site I designed end-to-end: clinical-luxury brand, booking, service pages, blog and SEO.", a: [['View the site', 'clients/modernmed/index.html'], ['More work', '#work']] },
        { t: 'La Grange Park Fastpitch (client site)', kw: 'la grange park fastpitch softball baseball league youth sports club client website team', b: "La Grange Park Fastpitch — a youth softball league site with an embroidered heritage-patch look and real registration/division content.", a: [['View the site', 'clients/grange-park-fastpitch/index.html'], ['More work', '#work']] },
        { t: 'Games', kw: 'games game play arcade browser contra darts riff pinball voidrunner munch orbital puzzles maze twinstick circuit fun studio', b: "I build original browser games — Contra, Darts, Munch, Orbital, Puzzles, Riff, Riff II, Pinball, Voidrunner and Abyss — ten titles, all free, no install, 60fps.", a: [['Enter the arcade', '#games'], ['Play Kudbee Contra', 'games/kudbee-contra/index.html']] },
        { t: 'Kudbee Munch (maze-chase game)', kw: 'munch maze chase chicago bee beezer drone windy city pacman pac-man style', b: "Kudbee Munch — Windy City: an original maze-chase through a neon Chicago grid. Sweep honey chips, power up on Deep Dish Slices, and outsmart four surveillance drones.", a: [['Play Kudbee Munch', 'games/kudbee-munch/index.html']] },
        { t: 'Kudbee Orbital (twin-stick game)', kw: 'orbital twin stick space skirmish drones asteroids zero gravity', b: "Kudbee Orbital: a zero-gravity twin-stick arena skirmish — Newtonian drift, drone waves, splitting asteroids.", a: [['Play Kudbee Orbital', 'games/kudbee-orbital/index.html']] },
        { t: 'Kudbee Puzzles (circuit game)', kw: 'puzzles circuit rotate pipe brain teaser levels', b: "Kudbee Puzzles — Circuit: 30 rotate-the-pipe brain-benders, every board provably solvable, from a 4×4 warm-up to 8×8 wrap-around boards.", a: [['Play Kudbee Puzzles', 'games/kudbee-puzzles/index.html']] },
        { t: 'Kudbee Contra (flagship game)', kw: 'contra flagship run gun shooter neon jungle 2.5d play', b: "Kudbee Contra is the flagship — a 2.5D run-and-gun. Free in your browser, right now.", a: [['Play Kudbee Contra', 'games/kudbee-contra/index.html']] },
        { t: 'Developer tools', kw: 'tools tool utilities utility token analyzer coverage dashboard utm builder campaign url invoice generator pdf billing apps developer', b: "Kudbee Tools are standalone browser apps — the Token Price Analyzer, a UTM campaign-URL Builder, an Invoice Generator (PDF) and a live coverage breakdown.", a: [['See the tools', '#work'], ['UTM Builder', 'tools/utm-builder/index.html'], ['Invoice Generator', 'tools/invoice-generator/index.html']] },
        { t: 'Kudbee Scribe (writing tool)', kw: 'scribe writing write editor grammar privacy text draft', b: "Kudbee Scribe is a privacy-first writing tool that runs entirely in your browser — nothing leaves your device.", a: [['Open Scribe', 'tools/kudbee-scribe/index.html']] },
        { t: 'Tiny apps store', kw: 'store tiny apps install app qr palette passphrase og preview five dollar buy', b: "The Kudbee Tiny Apps store: focused little apps you can install in seconds — four are live and free, more at $5 each. Try the install terminal.", a: [['Open the store', '#agent-store']] },
        { t: 'The Lab / music videos', kw: 'lab music video visuals audio reactive drone show grow experiments media', b: "The Studio Lab holds the media experiments — audio-reactive music videos, a particle drone show, and the Grow Companion — all rendered live in the browser.", a: [['Visit the lab', '#lab'], ['Open the Lab page', 'lab/index.html']] },
        { t: 'Articles / blog', kw: 'blog articles article posts post read seo guide learn writing content news', b: "The articles cover building your own memory layer, what actually makes a website convert, and teaching teams to build AI agents.", a: [['Read the blog', 'blog/']] },
        { t: 'Contact & booking', kw: 'contact book booking call email reach hire quote start project talk get in touch phone schedule message', b: "Reach me any way you like — book a discovery call, email, or the contact form. I reply within 24 hours, and I'm here 24/7.", a: [['Book a discovery call', CAL], ['Contact section', '#contact']] },
        { t: 'The Kudbee Doctrine', kw: 'doctrine principles philosophy how you think values approach standards quality believe', b: "The Kudbee Doctrine is how I think about building — taste, verification, honesty, and no shortcuts. Eight articles, out in the open.", a: [['Read the doctrine', '#doctrine']] },
        { t: 'About Kudbee', kw: 'about who are you what is kudbee studio company team story personal', b: "Kudbee is my one-person creative dev studio: premium web design (my #1), teaching teams to build their own AI agents & infrastructure, and original browser games.", a: [['Start a project', '#contact'], ['See the work', '#work']] },
        { t: 'Pricing tiers in detail', kw: 'pricing price prices cost starter launch studio pro tier tiers package packages breakdown revisions revision pages included how much', b: "Site pricing breaks into four flat tiers: Starter $99 (1-page), Launch $199 (up to 3 pages + SEO basics), Studio $399 (up to 6 pages, custom animation — best value), and Pro $500 (up to 10 pages, advanced SEO, blog/CMS, 30-day launch support). AI training and agent suites are scoped separately on a discovery call.", a: [['See pricing', '#pricing'], ['Book a demo', CAL]] },
        { t: 'How work ships (process)', kw: 'process steps step how it works workflow methodology discovery strategy proof launch timeline what happens next', b: "Work ships in five steps: Discovery (a fast goals call), Strategy & design (wireframes or agent architecture on paper first), Build & train (live sessions as it comes together), Proof (everything verified before it's called done), then Launch & support on Cloudflare — yours to keep.", a: [['See the process', '#process']] },
        { t: 'The Kudbee Online League', kw: 'league leaderboard leaderboards score scores rank ranking compete competitive ladder online', b: "The Kudbee Online League is a global leaderboard across the arcade — post a score in Kudbee Darts or Kudbee Riff (I and II) and claim your spot on the ladder.", a: [['View the leaderboard', 'leaderboard/public/leaderboard.html'], ['Enter the arcade', '#games']] },
        { t: 'Kudbee Darts (league game)', kw: 'darts 501 cricket dartboard throw ai rival rivals xp ladder skins', b: "Kudbee Darts: 501 & Cricket against smart AI rivals, with an XP ladder and unlockable skins — one of the two games feeding the Online League.", a: [['Play Kudbee Darts', 'games/kudbee-darts/index.html'], ['View the leaderboard', 'leaderboard/public/leaderboard.html']] },
        { t: 'Kudbee Riff & Riff II (rhythm games)', kw: 'riff rhythm fret guitar track neon music note charted beat', b: "Kudbee Riff and Riff II are rhythm games charted to real original studio tracks — Fret Rush, and the newer Neon Fret Rush — both feed the Online League leaderboard.", a: [['Play Kudbee Riff', 'games/kudbee-riff/index.html'], ['Play Riff II', 'games/kudbee-riff-2/index.html']] },
        { t: 'Kudbee Pinball & Voidrunner', kw: 'pinball starbreak voidrunner asteroid dive flyer table skill shots space', b: "Kudbee Pinball — Starbreak is a neon space table with real skill shots; Kudbee Voidrunner — Asteroid Dive is a steer-and-blast flyer through drifting asteroids.", a: [['Play Kudbee Pinball', 'games/kudbee-pinball/index.html'], ['Play Kudbee Voidrunner', 'games/kudbee-voidrunner/index.html']] },
        { t: 'Doctrine — privacy & API keys (Article III)', kw: 'privacy security secure api key keys safe server worker leak data protect', b: "Doctrine Article III — Keys live on the server, always: every model call runs through a Cloudflare Worker that holds the secret, so the client (your browser) never sees it. Privacy and security are the floor, not a paid tier.", a: [['Read the doctrine', '#doctrine']] },
        { t: 'Doctrine — own your stack (Article II)', kw: 'own stack infrastructure lock-in vendor lockin cloudflare keep code keys yours portable', b: "Doctrine Article II — Own your stack: everything is built on infrastructure you can actually keep — static front-ends and serverless Workers on Cloudflare, no rented black boxes. When an engagement ends, the work — keys, code, and all — is yours.", a: [['Read the doctrine', '#doctrine']] },
        { t: 'Grow Companion (Lab piece)', kw: 'grow companion plant seed time lapse interactive sprout', b: "Grow Companion is an interactive Lab piece — watch a plant grow in time-lapse, then plant your own seed, rendered live in the browser.", a: [['Open Grow Companion', 'lab/grow/index.html'], ['Visit the lab', '#lab']] }
    ];
    var STOP = { 'the':1,'a':1,'an':1,'and':1,'or':1,'to':1,'of':1,'for':1,'in':1,'on':1,'is':1,'are':1,'do':1,'you':1,'i':1,'me':1,'my':1,'we':1,'can':1,'how':1,'what':1,'with':1,'your':1,'about':1,'show':1,'tell':1,'need':1,'want':1,'get':1,'please':1,'kudbee':1 };
    function toks(s) { return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(function (w) { return w.length > 1 && !STOP[w]; }); }
/* ════════ END [A02] Kudbee Agent — setup + site index ════════ */

/* ════════ BEGIN [A03] Agent KB scoring ════════ */
    /* ---------- KB scoring (DBZ-055): stemming + typo tolerance + multi-intent ----------
       A trailing-suffix stemmer folds plurals/verb forms onto one root (so
       "pricing" and "priced" both hit "price"), and a bounded Levenshtein
       check tolerates a single typo/transposition on longer keywords (so
       "pricng" or "gmaes" still lands). scoreKB ranks every entry instead of
       stopping at the first hit, so a query that touches two topics — e.g.
       "pricing and ai training" — can surface both instead of only whichever
       KB row happened to score first. */
    function stem(w) {
        if (w.length > 5 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
        if (w.length > 6 && /ing$/.test(w)) return w.slice(0, -3);
        if (w.length > 5 && /(ed|es)$/.test(w)) return w.slice(0, -2);
        if (w.length > 4 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
        return w;
    }
    // Levenshtein distance, but bails out the moment it's proven > 1 (we only
    // ever care whether two short keywords are "off by one typo").
    function lev1(a, b) {
        if (a === b) return 0;
        var la = a.length, lb = b.length;
        if (Math.abs(la - lb) > 1) return 2;
        var prev = [], i, j;
        for (j = 0; j <= lb; j++) prev[j] = j;
        for (i = 1; i <= la; i++) {
            var cur = [i], rowMin = i;
            for (j = 1; j <= lb; j++) {
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                if (cur[j] < rowMin) rowMin = cur[j];
            }
            if (rowMin > 1) return 2; // whole row already past tolerance — short-circuit
            prev = cur;
        }
        return prev[lb];
    }
    function fuzzyScore(qTok, kwTok) {
        if (qTok === kwTok) return 3;
        if (stem(qTok) === stem(kwTok)) return 2.2;
        if (qTok.length >= 4 && kwTok.length >= 4 && Math.abs(qTok.length - kwTok.length) <= 1 && lev1(qTok, kwTok) <= 1) return 1.4;
        return 0;
    }
    // Precompute each entry's keyword token list once.
    for (var kbi = 0; kbi < KB.length; kbi++) {
        var kbe = KB[kbi];
        kbe._kw = kbe.kw.split(/\s+/);
        kbe._ti = kbe.t.toLowerCase();
        kbe._bl = kbe.b.toLowerCase();
    }
    // Ranks every KB entry against the query; returns [{entry, score}, ...] sorted high→low.
    function rankKB(q) {
        var qt = toks(q), ranked = [];
        for (var i = 0; i < KB.length; i++) {
            var e = KB[i], s = 0;
            for (var j = 0; j < qt.length; j++) {
                var w = qt[j], best = 0;
                for (var k = 0; k < e._kw.length; k++) {
                    var m = fuzzyScore(w, e._kw[k]);
                    if (m > best) best = m;
                }
                s += best;
                if (e._ti.indexOf(w) !== -1) s += 2;
                if (e._bl.indexOf(w) !== -1) s += 1;
            }
            if (s > 0) ranked.push({ entry: e, score: s });
        }
        ranked.sort(function (a, b) { return b.score - a.score; });
        return ranked;
    }
    // Picks up to two entries for multi-intent questions — the runner-up only
    // counts if it's a genuinely different, still-strong topic, never a weak
    // tail match.
    function pickHits(q) {
        var ranked = rankKB(q);
        if (!ranked.length) return [];
        var hits = [ranked[0].entry], top = ranked[0].score;
        for (var i = 1; i < ranked.length; i++) {
            if (ranked[i].score >= 4 && ranked[i].score >= top * 0.5 && ranked[i].entry.t !== ranked[0].entry.t) {
                hits.push(ranked[i].entry);
                break; // cap at two topics — stay focused, don't dump the whole KB
            }
        }
        return hits;
    }

    var pinnedToBottom = true;
    function scroll(force) {
        if (force || pinnedToBottom) log.scrollTop = log.scrollHeight;
    }
    log.addEventListener('scroll', function () {
        // Smarter auto-scroll (DBZ-055): if the visitor has scrolled up to
        // read history, new messages must not yank the viewport back down.
        // Only re-pin once they're within a small threshold of the bottom.
        pinnedToBottom = (log.scrollHeight - log.scrollTop - log.clientHeight) < 32;
    }, { passive: true });
    function addMsg(role, text) {
        var el = document.createElement('div');
        el.className = 'agent-msg in ' + (role === 'user' ? 'user' : 'bot');
        el.textContent = text;
        log.appendChild(el);
        // A message the visitor just sent should always pull the log down to
        // show it; a bot reply respects whatever scroll position they're in.
        scroll(role === 'user');
        return el;
    }
    function goTo(target) {
        if (target.charAt(0) === '#') {
            var s = document.querySelector(target);
            if (s) s.scrollIntoView({ block: 'start', behavior: 'smooth' });
        } else if (/^https?:/.test(target)) {
            window.open(target, '_blank', 'noopener');
        } else {
            window.location.href = target;
        }
    }
    function addBot(text, actions) {
        var el = addMsg('bot', text);
        if (actions && actions.length) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;';
            actions.forEach(function (act) {
                var btn = document.createElement('button');
                btn.type = 'button'; btn.textContent = act[0] + ' →';
                btn.style.cssText = 'font:600 12px/1 inherit;color:#04040a;background:var(--grad);border:none;border-radius:999px;padding:8px 13px;cursor:pointer;';
                btn.addEventListener('click', function () { goTo(act[1]); });
                row.appendChild(btn);
            });
            el.appendChild(row); scroll();
        }
        return el;
    }
    function typingEl() {
        var t = document.createElement('div');
        t.className = 'agent-typing';
        t.innerHTML = '<span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span><span class="sr-only">Kudbee Agent is typing…</span>';
        log.appendChild(t); scroll(); return t;
    }
    function setBusy(b) { busy = b; send.disabled = b; input.disabled = b; }

    // Local, no-backend answer from the site index. Supports multi-intent:
    // a question that scores meaningfully on two distinct KB rows gets both
    // answers, joined into one reply, with a merged (deduped) action list.
    function answerLocal(text) {
        var hits = pickHits(text);
        if (hits.length === 1) {
            addBot(hits[0].b, hits[0].a);
        } else if (hits.length > 1) {
            var combined = hits[0].b + ' And on ' + hits[1].t.replace(/\s*\([^)]*\)/, '').toLowerCase() + ' — ' + hits[1].b;
            var seen = {}, actions = [];
            hits.forEach(function (h) {
                (h.a || []).forEach(function (act) {
                    if (!seen[act[1]]) { seen[act[1]] = true; actions.push(act); }
                });
            });
            addBot(combined, actions.slice(0, 4));
        } else {
            addBot("I can help with web design, AI agent training, building your own memory layer, client work, games, tools, pricing, or booking a call. Which one sounds right?", [['See the work', '#work'], ['Book a call', CAL]]);
        }
        // Offer to capture the lead on buying intent.
        if ((hits.length && /Contact|About Kudbee|Services|memory layer|Pricing tiers/.test(hits[0].t)) ||
            /\b(book|email|contact|quote|hire|reach|budget|price|pricing|cost|start a project|get started)\b/.test(text.toLowerCase())) {
            captureCTA();
        }
    }
/* ════════ END [A03] Agent KB scoring ════════ */

/* ════════ BEGIN [A04] Lead capture + chat UI ════════ */
    // ---- Lead capture (no backend): POST to a form endpoint if set, else mailto; always saved locally ----
    var LEAD_ENDPOINT = KUDBEE_CONFIG.LEAD_ENDPOINT; // see the config block at the top of this script.
    var captured = false;
    function recentUser() {
        return history.filter(function (m) { return m.role === 'user'; }).slice(-4).map(function (m) { return m.content; }).join(' | ');
    }
    function saveLead(email, ctx) {
        try {
            var a = JSON.parse(localStorage.getItem('kudbee.leads') || '[]');
            a.push({ email: email, ctx: ctx, at: new Date().toISOString() });
            localStorage.setItem('kudbee.leads', JSON.stringify(a.slice(-50)));
        } catch (e) {}
    }
    function mailtoFallback(email, ctx) {
        var subj = encodeURIComponent('New lead from the Kudbee Agent');
        var body = encodeURIComponent('Email: ' + email + '\n\nWhat they asked the agent:\n' + (ctx || '(no prior messages)'));
        window.location.href = 'mailto:kudbeezero@gmail.com?subject=' + subj + '&body=' + body;
    }
    function captureCTA() {
        if (captured) return;
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:7px;margin-top:8px;';
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = '📨 Leave your email';
        b.style.cssText = 'font:600 12px/1 inherit;color:var(--txt-2);background:var(--panel-2);border:1px solid var(--border);border-radius:999px;padding:8px 13px;cursor:pointer;';
        b.addEventListener('click', function () { row.remove(); offerCapture(); });
        row.appendChild(b); log.appendChild(row); scroll();
    }
    function offerCapture() {
        if (captured) return;
        addMsg('bot', "Drop your email and I'll make sure the studio follows up — no spam, just your project.");
        var f = document.createElement('form');
        f.style.cssText = 'display:flex;gap:7px;margin-top:2px;';
        var inp = document.createElement('input');
        inp.type = 'email'; inp.required = true; inp.placeholder = 'you@company.com'; inp.setAttribute('aria-label', 'Your email');
        inp.style.cssText = 'flex:1;min-width:0;background:rgba(3,3,8,0.7);border:1px solid var(--border);border-radius:10px;padding:10px 12px;color:var(--txt);font:14px inherit;outline:none;';
        var sb = document.createElement('button');
        sb.type = 'submit'; sb.textContent = 'Send';
        sb.style.cssText = 'flex:none;font:600 13px/1 inherit;color:#04040a;background:var(--grad);border:none;border-radius:10px;padding:0 16px;cursor:pointer;';
        f.appendChild(inp); f.appendChild(sb); log.appendChild(f); scroll(); inp.focus();
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var email = inp.value.trim();
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { inp.focus(); return; }
            var ctx = recentUser();
            saveLead(email, ctx); captured = true; f.remove();
            function done() { addBot('Got it — ' + email + '. I\'ll reach out shortly. Want to grab a time now?', [['Book a discovery call', CAL]]); }
            if (LEAD_ENDPOINT) {
                fetch(LEAD_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify({ email: email, context: ctx, source: 'kudbee-agent' }) })
                    .then(done).catch(function () { mailtoFallback(email, ctx); done(); });
            } else { mailtoFallback(email, ctx); done(); }
        });
    }

    // Optional live backend (drafting briefs / booking). Falls back to local.
    var history = [{ role: 'assistant', content: log.textContent.trim() }];
    async function answerBackend(text) {
        var typing = typingEl(), botEl = null, acc = '';
        function ensureBot() { if (!botEl) { if (typing.parentNode) typing.parentNode.removeChild(typing); botEl = addMsg('bot', ''); } return botEl; }
        var res = await fetch(BASE + '/api/agent/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: history }) });
        if (!res.ok || !res.body) throw new Error('bad response');
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
        while (true) {
            var chunk = await reader.read(); if (chunk.done) break;
            buf += dec.decode(chunk.value, { stream: true });
            var parts = buf.split('\n\n'); buf = parts.pop();
            for (var i = 0; i < parts.length; i++) {
                var line = parts[i].trim(); if (line.indexOf('data:') !== 0) continue;
                var evt; try { evt = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
                if (evt.type === 'text') { acc += evt.delta; ensureBot().textContent = acc; scroll(); }
                else if (evt.type === 'error') { ensureBot().textContent = acc || ('⚠ ' + evt.message); }
            }
        }
        if (typing.parentNode) typing.parentNode.removeChild(typing);
        if (acc) history.push({ role: 'assistant', content: acc });
        if (!acc && !botEl) throw new Error('empty');
    }

    async function ask(text) {
        if (busy || !text.trim()) return;
        text = text.trim();
        addMsg('user', text);
        history.push({ role: 'user', content: text });
        input.value = '';
        if (chips) chips.style.display = 'none';
        setBusy(true);
        try {
            if (BASE) { try { await answerBackend(text); } catch (e) { answerLocal(text); } }
            else {
                var typing = typingEl();
                await new Promise(function (r) { setTimeout(r, 360); });
                if (typing.parentNode) typing.parentNode.removeChild(typing);
                answerLocal(text);
            }
        } finally { setBusy(false); input.focus(); }
    }

    // If a backend is configured, reflect its health; otherwise we're the index.
    if (BASE) {
        fetch(BASE + '/api/agent/health').then(function (r) { return r.json(); }).then(function (h) {
            state.textContent = (h && h.demo) ? 'demo mode' : 'live · ask me anything';
        }).catch(function () { state.textContent = 'online · indexed this site'; });
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
    if (chips) chips.querySelectorAll('.agent-chip').forEach(function (b) {
        b.addEventListener('click', function () {
            if (b.hasAttribute('data-capture')) { chips.style.display = 'none'; offerCapture(); }
            else { ask(b.textContent); }
        });
    });
})();
/* ════════ END [A04] Lead capture + chat UI ════════ */
