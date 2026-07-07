/* ================================================================
   Kudbee Museum — exhibit data model (DBZ-058, north-star Phase B).

   A small, plain-JS data structure describing each exhibit's content —
   title, narrative beats, a simulated proof timeline, and links — so a
   future exhibit is authored as *data* (a new key in EXHIBITS below)
   instead of a hand-built page. This lane ships exactly one exhibit
   ('kudbee-contra'); the shape exists so Phase C (a full /museum section,
   gated on this lane clearing the owner's quality bar) can add more
   without inventing a second structure.

   Loaded as a plain classic <script> (no bundler, no ES modules) so it
   works identically served from Cloudflare Pages or a local static
   file server — matches every other shared file in assets/. Attaches a
   single global, window.KudbeeMuseum, mirroring the window.KC / window.
   KudbeeMotion convention already used in this repo.

   Truth note (Doctrine §C / north-star §5 "hard line"): the `timeline`
   array below is a SIMULATED, read-only illustration of Kudbee's proof
   philosophy (idea → agent runs → proof created → receipt → shipped).
   No entry in it is backed by a real wallet, mint, chain write, or
   live API — every timeline entry carries `simulated: true` and the
   page that renders this data is required to label it as illustrative
   wherever it appears. Only `narrative` and the exhibit's own shipped
   status describe things that actually happened.
   ================================================================ */
(function () {
    'use strict';

    var EXHIBITS = {
        'kudbee-contra': {
            slug: 'kudbee-contra',
            order: 1,
            kicker: 'Exhibit 01 · Flagship',
            title: 'Kudbee Contra',
            tagline: 'A 2.5D run-and-gun, built end-to-end through agent-driven dev sessions and shipped free to the browser — no install, no copyrighted assets, no bundler.',

            status: {
                label: 'Shipped',
                detail: 'Live in production · Kudbee Games Studio flagship',
                tone: 'shipped'
            },

            hero: {
                avif: '../../games/kudbee-contra/assets/backgrounds/neon-jungle-far.avif',
                webp: '../../games/kudbee-contra/assets/backgrounds/neon-jungle-far.webp',
                jpg: '../../games/kudbee-contra/assets/backgrounds/neon-jungle-far.jpg',
                srcAvif: '../../games/kudbee-contra/assets/backgrounds/neon-jungle-far-640.avif 640w, ../../games/kudbee-contra/assets/backgrounds/neon-jungle-far-960.avif 960w, ../../games/kudbee-contra/assets/backgrounds/neon-jungle-far-1280.avif 1280w, ../../games/kudbee-contra/assets/backgrounds/neon-jungle-far.avif 1920w',
                srcWebp: '../../games/kudbee-contra/assets/backgrounds/neon-jungle-far-640.webp 640w, ../../games/kudbee-contra/assets/backgrounds/neon-jungle-far-960.webp 960w, ../../games/kudbee-contra/assets/backgrounds/neon-jungle-far-1280.webp 1280w, ../../games/kudbee-contra/assets/backgrounds/neon-jungle-far.webp 1920w',
                srcJpg: '../../games/kudbee-contra/assets/backgrounds/neon-jungle-far-640.jpg 640w, ../../games/kudbee-contra/assets/backgrounds/neon-jungle-far-960.jpg 960w, ../../games/kudbee-contra/assets/backgrounds/neon-jungle-far-1280.jpg 1280w, ../../games/kudbee-contra/assets/backgrounds/neon-jungle-far.jpg 1920w',
                width: 1920,
                height: 823,
                alt: 'Kudbee Contra — the Neon Jungle Outpost, the game’s opening level',
                caption: 'Neon Jungle Outpost · Level 1'
            },

            facts: [
                { k: 'Engine', v: 'Vanilla Canvas 2D, zero-build' },
                { k: 'Parallax', v: '7 independently-scrolling layers' },
                { k: 'Loop', v: 'Fixed-timestep, 60 Hz' },
                { k: 'Resolution', v: '960×600 logical, scaled to fit' },
                { k: 'Input', v: 'Keyboard · gamepad · touch' },
                { k: 'Assets', v: '100% original — no licensed IP' }
            ],

            narrative: [
                {
                    k: 'The idea',
                    b: 'Kudbee Games Studio wanted a flagship title — something that proves the studio ships full, replayable products, not tech demos. A 2.5D run-and-gun was the pick: readable, physical, and hard to fake.'
                },
                {
                    k: 'Built by agents',
                    b: 'The engine, entities, and level data were authored through iterative Claude Code agent sessions — classic <script> files attached to one global namespace (window.KC), no bundler, no framework. Art and audio are procedural, generated in code rather than fetched from a runtime AI provider.'
                },
                {
                    k: 'Iteration',
                    b: 'Phase 1 shipped as a vertical slice: a full moveset for the Kudbee Operative and the K9 companion, seven parallax depth layers, pooled particles and projectiles, and a two-phase Hive Sentinel mini-boss — refined across build passes tracked in the studio’s own ledger.'
                },
                {
                    k: 'Shipped',
                    b: 'Free, in your browser, right now — no install, no signup, no paywall. It runs from a static file server exactly the way it runs in production.'
                }
            ],

            /* SIMULATED — see file header + the exhibit page's own inline
               labeling. Every entry below is illustrative only. */
            timeline: [
                {
                    stage: 'Idea',
                    simulated: false,
                    label: 'Real',
                    body: 'Flagship browser game, scoped by the studio.'
                },
                {
                    stage: 'Agent runs',
                    simulated: true,
                    label: 'Simulated',
                    body: 'Illustrative agent-session log — not a live process feed.'
                },
                {
                    stage: 'Proof created',
                    simulated: true,
                    label: 'Simulated',
                    body: 'A mocked proof artifact — no hash is computed, no chain is touched.'
                },
                {
                    stage: 'Receipt',
                    simulated: true,
                    label: 'Simulated',
                    body: 'A receipt-styled card for illustration only — no wallet or transaction exists.'
                },
                {
                    stage: 'Shipped',
                    simulated: false,
                    label: 'Real',
                    body: 'Live at /games/kudbee-contra/ today.'
                }
            ],

            links: {
                play: '../../games/kudbee-contra/index.html',
                home: '../../index.html',
                work: '../../index.html#work'
            }
        }
    };

    window.KudbeeMuseum = {
        exhibits: EXHIBITS,
        get: function (slug) { return EXHIBITS[slug] || null; }
    };
})();
