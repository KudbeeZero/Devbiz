# CLAUDE.md

Project instructions for agents working in this repository.

## Project

**Kudbee** — a creative dev studio site (web design, live AI agent training, and original
game development), built as a zero-build static site and deployed on Cloudflare Pages.

```
index.html              Marketing site markup, filed §01–§17 (no build step)
assets/site/            Site stylesheet + scripts, filed by section (see AGENTS.md → Site filing system)
wrangler.toml           Cloudflare Pages config (serves the repo root as static assets)
games/                  Kudbee Games Studio (HTML5 Canvas titles)
tools/                  Kudbee developer utilities (standalone HTML, no build step)
```

Everything is static — any file server works for local preview:

```bash
python3 -m http.server 8000
```

## MEMORY LAYERS — THE KUDBEE BRAIN

This file is not documentation; it is **long-term memory**. The whole repo is a brain, and
each region is a concrete file/route. When you learn something, write it to the *right layer* —
that is what turns this from a doc into a team. Start every task by reading the layer that
holds the relevant memory; end it by writing back what changed.

| Brain region | What it holds | Route(s) | Read / write when |
| --- | --- | --- | --- |
| **Cortex** — durable doctrine (long-term) | Identity, doctrine, conventions, guardrails | **`CLAUDE.md`** (this file) | Read at task start. Write when a rule becomes *permanent*. |
| **Hippocampus** — working memory (in-flight) | Live lane status, what's ready/blocked/must-not-touch | **`docs/BUILD_LEDGER.md`** | Write on every lane state change (own docs/process lane). |
| **Prefrontal cortex** — planning | Roadmap, backlog, process reference | **`docs/BUILD_PLAN.md`**, **`docs/BACKLOG.md`**, **`docs/PR_FLOW.md`** | Read before scoping; write when the plan changes. |
| **Cerebellum** — procedural reflexes (learned) | Habits distilled from repetition & fixed mistakes | **Reflexes log** (below) | Write when something is learned the *second* time. |
| **Amygdala** — guardrails / risk | Owner-only gates, `OWNER-OK` token, private surfaces | §11 below, **`docs/PRIVATE_TESTING_GATE.md`** | Never auto-cross. Read before any risky/irreversible action. |
| **Motor cortex** — execution surfaces | Where changes actually land | `index.html` + `assets/site/` (filed by section), `games/` (+ `games/shared/engine/`), `tools/`, `recording-it/`, `leaderboard/`, `clients/`, `lab/` | Read the file before editing (Doctrine §D). |
| **Sensory cortex** — external signals | How the brain perceives the outside | Cloudflare/Vercel deploys, **`ops/github-sentinel/`** | Treat deploy comments as signal, act only when actionable (§6). |
| **Corpus callosum** — the index/router | Which memory holds what | *this table* + `docs/` + **`AGENTS.md` → Site filing system** (directory of every `§`/`C`/`J`/`A`/`T` section of the site) | Consult when unsure where a memory — or a piece of the site — belongs. Update the directory in the same commit as any new section; `npm run site:filing` fails if it drifts. |

### Memory discipline (the save-triggers)

Save proactively — a month of this is what makes the brain yours:

1. **Every repeated instruction** → write it as a rule (Cortex / this file) so it never has to be said a third time.
2. **Every agreed convention** → write it (Cortex, or the Reflexes log if it's a habit).
3. **Every mistake made twice** → write a reflex (Cerebellum, below) so the pattern is caught next time.

Routing rule of thumb: *permanent rule* → CLAUDE.md · *in-flight state* → BUILD_LEDGER · *learned habit* → Reflexes log.

### Reflexes log (procedural memory)

Append-only. Newest first. Each entry: the trigger → the reflex.

- **2026-10-20** — **A call that must be picked up is data, not a timer (Abyss, owner: "the phone ringing and it has to be picked up... several more of those"; "when someone selects an answer... a really cool noise"):** an insistent call is a chain of call scenes: Decline leads to the next call, one `ring` level louder, and the last has a single choice because the phone has answered itself. No timers or engine state, so the graph walk proves every chain ends. Turn existing "it rings" prose into real call screens (`d5_lie`, `d5_ring`) before writing new ones. A reply's feel (sound, ripple, flex) depends only on the choice's own data (`add.dread > 0` = dark), so it never changes what the story does; spy on `ABY.Audio.sfx` in the evaluator to prove the sound fired.
- **2026-10-20** — **An investigation is pinned across days, and promised only where it can be kept (Abyss evidence board, owner: "send out one of your agents to do a deep prowl"; next logical step after scars):** in Notes two clues pin together (`ABY.LINKS`, pure `ABY.link`); the right pair is a flag that opens a hidden scene later, a wrong one costs. Notes are not in the graph walk's key, so an early clue can be merged away before its partner turns up: pin eagerly in the walk, and let the follow-up walks ask for a deduction's *clues* (`note:<id>`), seeding from anyone holding either one. Before promising a count ("pin five"), measure what one journey can reach (a beam search in `.pbtest/` found three, since Day One branches hold different clues) and count over nights instead (`deduced`, like `found`). The audit agent's report is worth reading before scoping: it found that leaving the ending card loses the next day and the wakes (critical, its own fix lane).
- **2026-10-20** — **A fall should cost something and teach something (Abyss, owner: "When this happens the player should have to restart from the beginning or create check points"):** a dark ending that carried straight on to the next day took the fear out of it. Falls (`fall: true`) never carry on; every dawn is a saved checkpoint and a journey has 3 wakes (+1 dread each); at zero, only Start over. Then make the death worth something: its scar (`scar_<fall>`) wakes with her and opens a way past that exact death. Before removing a `cont`, prove every day still has a way in that is not a fall (`falls-and-wakes`). The graph's follow-up walks must key on, and refuse seeds holding, the `noflag` that shuts a target, and must rebuild their target list each round (one walk can open the next target). Run the evaluator from a `git worktree` (with `node_modules` symlinked) to check `main` while you keep editing the branch: the evaluator serves the live checkout.
- **2026-10-20** — **Seven days and ten openings outgrow one queue (Abyss, owner: "Day 5 and Day 6 and day 7 there will be only 7 days total... scramble with 10 different openings"):** a shallow-first walk from ten openings spends its whole budget on Day One. Give each day its own queue and take from them in turn; count the LIMIT in *distinct* states (a lower-battery copy replacing a key is not a new state; counting it stopped the walk at 457k of 1.5M); and chase anything still unreached (a Day-One flag read on Day Six) from real reached states that hold its flags, nearest day first and earliest in it, merged on just those flags. Merging only prunes, so every witness is still real. A first journey opens on `ABY.START` (so the lock-screen reply and every name-picking evaluator flow still work); later ones are scrambled by a pure `pickOpening`, and the evaluator pins `__abyOpening` unless a flow opts in. Share cards print the ending count, so a new ending means rebuilding every card. `tools/share-cards.mjs` now lets Google Fonts load: it used to block them, and a sandbox without Space Grotesk then painted every card in Inter.
- **2026-10-20** — **Chords make a rite hard, and a faster fall makes it readable (Abyss, owner: "2 new in depth more harder flute maps and chord smash like Kudbee Riff"):** a melody entry `[note, steps, note2]` drops two notes in two lanes at once (both must be struck within ~0.12s for a SLAM); a chart may set `win` (share that must be whole, default 0.6) and `fall` (seconds a note falls, default 1.7). At 0.25s steps a 1.7s fall stacks notes into one blob on a phone: give hard charts `fall` ~1.0-1.1 and screenshot them mid-song at 844x390. `eval/graph.mjs` `hard-rites` proves a hard chart is faster than every plain rite, has no chord inside one lane and no same-lane notes closer than 0.2s; an optional rite is offered once through a `*_done` flag set on its win AND give choices, and any new optional choice changes a scene's chip count in the evaluator (d4_shore 3->4). `homebar-swipe` in `npm run abyss:eval` crashes the whole script in some sandboxes (also on the base commit), so verify new blocks from a scratch copy of the evaluator's helpers plus the new block, deleted afterwards.
- **2026-10-20** — **Deep acts outgrow the graph walk (Abyss Day Five, owner: "next phase"):** the reachability search stops at its state `LIMIT`, and a too-low limit reports Day Five endings as unreachable when they are only unvisited (it passed once the default was raised to 3,000,000, ~38s). Raise the limit before suspecting the story. A new ending ripples into `ECOL`, `GATE`, `WORLD`/`WORDS`, `fx` cases, the counts in `index.html` and the evaluator (tiles, 'of N', the pulse-rings regex), then `share-cards.mjs` (landing pages `s/<slug>/` must exist or `share-landing-pages` crashes), `VER` and the og `?v=`. Don't wait on an eval log from a run that crashed: rebuild the cards first.
- **2026-10-19** — **Rhythm rites are chart data, the haunting is dressing (Abyss Day Three, owner: "more games like Guitar Hero, really haunting - doors, cracks, flashes, blood"):** a story node plays a chart (`song: '<id>'`, `songNext` win/fail/give, bounded by `MAX_SONG_TRIES`); doors, cracks, flashes and blood are visual/audio only and never change what must be hit, so the graph test can prove a rite is fair and finishable. A phone that scrolls vertically needs `touch-action: pan-y` before a horizontal swipe fires, and the click after a swipe must be swallowed or it opens the icon under the finger. A lock-screen reply is a choice made later, not a shortcut: it sets `G.autoPick`, and the send waits for the first-run guide to close. Adding a first-run overlay breaks every evaluator flow that taps first: pre-save the 'seen' flag in `open()` and give the overlay its own check.
- **2026-10-19** — **Test the second half, not just the first (Abyss Day Two):** two real bugs shipped past a green graph test and were only caught by the browser run: `startRun` always delivered the opening scene (so Day Two began at the start), and `Scene.setGate` threw with no 3D, so an ending never showed on a device without WebGL. A pure-data test proves the story, not the glue: add a browser check for every new way into the game (a continue button, a `?fresh=1` link), and look up every per-ending table (`ECOL`, sounds, gate colours) when adding an ending. A scratch repro in `.pbtest/` (ignored) found both in minutes.
- **2026-10-19** — **Act two without a second game (Abyss Day Two, owner: "make this game amazing"):** extend the story as more data on the same engine, not new code: an ending with `cont` is carried into act two by a pure `ABY.carry(state)` (stats, flags, clues kept; dread eased; battery topped up), and the player's history is a number in the state (`mem` = endings found) that a choice can require, so the best ending rewards replaying. Prove it the same way: `eval/graph.mjs` (16 checks) walks Act 1 into Act 2 and a structural check proves every path to the true ending is gated on `mem`. Adding endings ripples: Share `WORDS`/`WORLD`, `fx` sounds, `scene` gate colours, the card text ('five' had been left in the share-card tool), the evaluator's `of 13`, then rebuild cards (`tools/share-cards.mjs`, bump `VER` and the og `?v=`).
- **2026-10-19** — **Horror depth without a state explosion (Abyss, owner: "in-depth, many scary options, alternate story lines"):** gated choices, a battery, dread and flags multiply the state space into millions, so a full walk cannot be the test. Prove the *structure* for every state instead (every scene keeps at least one always-available choice; those choices reach an ending) and use a bounded, shallow-first search with behaviour-equivalent states merged (stats capped at the highest rule, only flags something reads, battery in bands, keep the lowest battery) as the reachability witness; it also found three real bugs (an ending no path could reach, a dead phone that could still toggle its flashlight and go negative, a recharge choice that was unreachable). Make the cursed thing the phone itself (battery, flashlight, calls, photos, notes) so the horror is mechanical, not just text. A `display:` rule later in the file beats a media-query rule earlier in it (the rotate button stayed hidden). 'Scary options' means choices with a cost, not only scary text.
- **2026-10-19** — **A story game is a data graph plus a stage (Abyss):** the story lives in a pure `story.js` that node can load, and `eval/graph.mjs` walks every reachable state (links, reachability, no dead ends, every state finishes, all endings reachable) before any pixel is drawn. It caught an ending whose stat threshold no path could reach: compute the reachable maxima first, then set thresholds. 3D is tested headless with swiftshader and a cached copy of the CDN script whose hash is checked against the page's `integrity` (so the run proves the SRI too); no network -> skip, don't fail. A `hidden` attribute loses to any `display:` rule (`[hidden]{display:none !important}`), and an Enter key used to skip text will also press a focused button: only press it while the text is still typing. Gate: `npm run abyss:eval`. Abyss is now a simulated phone (owner goal): what lives *inside* an embedded device must be laid out with `@container` queries, not `@media` (a desktop bezel is a portrait phone in a landscape window); a parent's `setPointerCapture` swallows its children's clicks; a button with an infinite transform animation is never "stable" for a test.
- **2026-10-19** — **Security reflexes for games (owner: "improve security on the website and the games"):** (1) outside data (leaderboard names, cloud saves, share links, localStorage) is never markup: `textContent` or escape - a hostile leaderboard name ran script on Voidrunner until `escHtml` + the `board-name-is-text` check; (2) a cross-site script carries `integrity` + `crossorigin` and an exact version, guarded by `npm run games:csp`; (3) the leaderboard refuses impossible lines (`floor`, `rules` in `leaderboard/shared/core.js`) instead of clamping them into a win - and rebuild `leaderboard/worker/dist/worker.single.js` or the test fails; (4) `/games/*` has its own Report-Only CSP in `_headers` (enforce only after real-phone checks); (5) prove a new check by making it fail on the old code first. Owner-only: `ALLOW_DEMO=0`, `ALLOWED_ORIGINS`, rate limits, Worker redeploy, wallet-code changes (OWNER-OK).
- **2026-10-18** — **A game is an app (owner: "enterprise level App Store type"):** it plays offline and installs. A `sw.js` beside the game, network-first for the page + code (a deploy shows on the next load) and cache-first for pictures; the game page is cached under `./` because the host redirects `index.html` to the folder (and a cached redirect is rebuilt before it's served). The manifest carries an `id`, a maskable icon and phone screenshots rendered from the game (archery: `tools/app-assets.mjs`); phones get an INSTALL button from the second visit (Android: the kept `beforeinstallprompt`; iPhone: a Share -> Add to Home Screen card). Every local test server must serve a folder URL's `index.html` (the service worker asks for `./`), and the evaluator proves offline with `context.setOffline(true)` + `response.fromServiceWorker()`.
- **2026-10-18** — **Evaluator checks wait for state and vote, never guess:** archery's `cup-flow`, `crypto-worlds` and `share-level` each went red once on a correct game: a tap after a fixed `waitForTimeout(150)` hit a stale button list (the frame hadn't redrawn), a single sampled pixel caught a drifting wind leaf, and a scripted "win" on a gusty / moving level scored 0. Tap with `clickWhen` and then `waitForFunction` on the state you expect; sample a small patch and take the majority; script wins on a calm, still level with `KAR.Bot.hold` (not `Bot.shot` on a mover - firing straight into the sim never advances the target's clock). A red check is a real bug until it's reproduced in a loop (`.pbtest/`) and the cause is named.
- **2026-10-18** — **Every win is shareable with a picture (owner: "make sure this game is social"):** a game's wins (level, world, boss, cup, daily, trophy) get a 1200x630 brag card painted from the game's own art, a SHARE screen that previews it (phone share sheet with the image attached; X / Facebook / WhatsApp / copy / save), and a link to a per-moment landing page whose og:image matches (archery: `src/share.js`, `s/<slug>/`, `tools/share-cards.mjs`). No card for a loss.

- **2026-10-17** — **Every game page shares well (owner):** its `<head>` carries Open Graph + `twitter:card=summary_large_image` with absolute `https://devbiz.kudbee.workers.dev/...` URLs, an up-to-date description, and a 1200×630 image in `/assets/og/<game>.jpg` that shows the *current* game (render it from the game, e.g. `games/kudbee-archery/tools/og-card.mjs`; never a stale screenshot). Bump `?v=N` on the image URL whenever it changes (X / iMessage / Facebook cache cards for days). In-game SHARE buttons share the canonical URL, not `location`. Cards only go live once the page is on `main` (production) — say so.
- **2026-10-17** — **Game levels follow the Kudbee Birds pattern (owner liked it):** a level campaign is *worlds* of levels, each world ending in a **BOSS** level; PLAY opens a full-screen **level map** (one world per page, big tiles with number/name/stars or a padlock, the boss tile crowned, ‹ n/N › + swipe to page, BACK) painted as a **cartoon world backdrop** (owner: "a really cool background, like Angry Birds" - bold outlines, sun/moon + rays, puffy clouds, layered hills, the world's props showing in the gaps between tiles; never a dimmed photo), and the results card is LEVEL CLEARED! / WORLD n COMPLETE! with NEXT LEVEL as the big button plus RETRY / LEVELS. When levels are added or reordered, **migrate saved progress by index** (archery: `KAR.TOUR_V1`) and keep a level you already have stars on open; tune star targets with bots, not guesses (archery: `eval/calibrate.mjs`).
- **2026-10-17** — **Phone first (owner: "definitely focus more on phone"):** every game change is checked on an emulated landscape phone (Playwright 844×390, `isMobile`, `hasTouch`) with a screenshot, not just desktop. Bar: the canvas fills a wide screen (no letterbox bars — extend scenery, anchor HUD to the real edges), tap targets ≥ ~32 CSS px, small print ≥ ~11 CSS px (scale it up on `pointer: coarse`), touch aiming never puts the target under the thumb (drag-relative), multi-touch is pointer-id aware, a portrait card on phones, and real-device checks (iPhone Safari + Android Chrome) are listed as a manual gate.
- **2026-10-17** — **CDP touch in tests:** `Input.dispatchTouchEvent` `touchEnd` releases the points you *list* (not the ones you leave out) — to lift only the second finger send `touchEnd` with that finger's id. And when a menu's default mode changes, every evaluator flow that taps PLAY must set the mode it means first.
- **2026-10-17** — **Archery gameplay gate:** `npm run archery:engine` (48 headless checks) + `npm run archery:eval` (98 Playwright checks, ~3.5 min — run it in the background, once). Say “local passed, no CI configured.” Before committing, `git checkout -- games/kudbee-archery/eval/out/` (screenshots are regenerated by every run).
- **2026-09-27** — **Pinball feature module: tick logic from `physStep`, never from `frame()`:** the multiball-jackpot plug-in (DBZ-191) first called its own `update(dt)` from `frame()`, matching where the game's mission/fx-decay ticks live. It silently never activated in every headless test, because the evaluator and `__kbTest` drive gameplay via direct `physStep()` calls and never run a real `requestAnimationFrame` loop, so `frame()` — and anything only reachable from it — never executes outside a live browser tab. `launcher.js` already ticks from inside `physStep()` for exactly this reason; any new module needs the same to stay testable. Second bug in the same feature: a custom on-screen banner duplicated the existing `callout()` announcement text at the same screen position — screenshot-verify new HUD/world text against a live capture, not just the score math.
- **2026-09-26** — **Pinball bug report → reproduce the reported state in Playwright first, then fix:** PR #186 (wider multiball spread) and the first cut of #187 (saucer cooldown on the served ball) were guesses from reading code; neither touched the real cause. The owner's screenshot showed balls stacked in the *shooter lane* — plunger code read `balls[0]`, so a lane ball served during multiball could never launch. "Very slow" was the 5-step frame cap (half speed at 30fps / iOS Low Power Mode — note the yellow battery in phone screenshots). Scratch harnesses live in an untracked `.pbtest/`; add a rubric check that fails on `main` before the fix.
- **2026-09-26** — **Pinball "ball stuck" → scan the physics, don't patch the spot:** several lanes (DBZ-065/066/067) fixed stuck spots with geometry nudges and timed "FREED" rescues; the real causes were collision bugs (swept-TOI exit root, per-step friction drag, −v̂ normals, flat end-cap normals). Reproduce with `__kbTest.simulate()` over a table-wide grid *before* editing, and never tune constants or geometry without re-running the evaluator — the first attempt on PR #180 shipped unverified flipper changes that created a new wedge. Invariants live in `AGENTS.md` → *Pinball physics rules*.
- **2026-09-25** — **Cadence: 2 PR cycles/hour, one open PR max (owner):** timer `kudbee-two-pr-per-hour` @ `delaySeconds: 1800`. Before opening the next PR, merge the current lane to `main` and confirm **zero** open PRs. Details: `/cursor/stores/self/pr-hourly-cadence.md`.
- **2026-09-27** — **Pinball gameplay gate = evaluator 24/24:** (21 until 2026-09-26; +`multiball-lane`, +`hyperdrive-launch`; 23 until 2026-09-27; +`multiball-jackpot`) before claiming pinball playability merge-ready, run `npm run pinball:eval` from repo root (or `cd games/kudbee-pinball/eval && node evaluator.mjs`). Playwright + Chromium; **24** rubric checks including multiball shooter-lane, HYPERDRIVE launcher, multiball jackpots, nudge + Solar Sail mission, lower-table geo, gutter/flipper-band/drain-lip regression. Say “local passed, no CI configured.” Leaderboard unit gate: `npm run test:leaderboard`. Leaderboard LIVE is separate — static host 404 on `/api/leaderboard` is expected until Worker routing lands.
- **2026-07-17** — **Green Gate is a precondition, not a nicety:** CI workflows have been *removed* from this repo (see `claude/remove-ci-workflows`) to avoid billing stalls — there is no CI to check. Verify `main` is locally sane before building on it: run the project's local lint/typecheck/test commands and confirm they pass before declaring a base sound. Local verification is the only gate now — there is no remote CI run to wait on, and you must never block work waiting for a CI job that will never execute (see §7b).
- **2026-07-07** — **Branch deletion is currently impossible from this environment** — `git push origin --delete <branch>` reliably 403s against this environment's git proxy (not an auth issue retrying fixes), and the GitHub MCP server has no delete-branch/delete-ref tool. Don't retry the delete more than once. Instead, record the branch in `docs/BUILD_LEDGER.md`'s "Stale branches" table and move on — that table is now the actual record of what should be deleted once a path exists. The real fix is enabling GitHub's **"Automatically delete head branches"** repo setting (owner-only, Settings → General → Pull Requests) — recommend it, don't keep working around its absence. A future session may have a different git remote/tooling — don't assume this is permanent without checking again.
- **2026-07-02** — **No branches left behind:** when a PR/lane closes or merges, delete its branch (local + remote) in the same step. Land verified lanes to `main`, then delete; only a branch with active in-progress work may linger. *(2026-07-07 update: this remains the goal, but see the entry above — deletion is currently blocked at the tooling level in this environment; log the branch instead of retrying.)*
- **2026-07-02** — Owner prefers a **commit-streaming workflow**: don't reflexively open a PR per change. Default to one working/integration branch with incremental commits; open a PR only when a real review gate is needed or the owner asks. (See Working Conventions below.)
- **2026-07-02** — Session **cron jobs are cleared on a model switch** (`/model`). After switching, recreate any watch/check-in cron; never assume it survived.
- **2026-07-02** — Before extracting "shared" code, **diff the candidates first** — only lift what is genuinely duplicated. (Games engine: only `loop.js` + the `util` core were shared; `input/particles/audio/camera` had legitimately diverged.)
- **2026-07-02** — First CSP on an inline-heavy site ships **Report-Only**; enforcing is a real-browser gate, never a blind flip.
- **2026-07-02** — Vercel / Cloudflare bot **deploy comments are informational**; acknowledge silently per the Watcher Rule (§6), don't act.

### Working Conventions (living memory)

- **Commit-streaming default (owner, 2026-07-02):** prefer incremental commits on a working/integration branch over many small draft PRs. Open a PR only for a genuine review gate or on request. The detailed PR FLOW rules below still apply *when a PR is opened*.
- **Branch lifecycle — no branches left behind (owner, 2026-07-02):** `main` is the *only* long-lived branch and the deploy source (Cloudflare Pages) — keep it green and deployable. Working branches are short-lived and single-purpose (`claude/<lane>`); create one only for work in progress. When a lane is **done + verified** (or abandoned), land its commits to `main` and **delete the branch — local *and* remote — in the same step**. A branch may linger *only* while it holds active in-progress work you are explicitly continuing. A closed or merged PR ⇒ delete its head branch (its commits must already be on `main`, or be intentionally dropped). Turn on GitHub "auto-delete head branches".
- **Landing to `main`:** under the streaming flow the owner authorized (2026-07-02), a completed + verified lane may be fast-forwarded to `main` without a PR. Still: **flag production deploys** (a push to `main` auto-deploys), respect the §11 owner-only gates, and never take an `OWNER-OK` action without the token.
- **Closing PRs:** the owner may close PRs wholesale when consolidating or changing rules. Closing alone *keeps* the branch — so after a close, either land the commits to `main` or delete the branch; never leave it dangling.

## BUILD LEDGER

Every PR, phase, and active work lane is tracked with a numbered ID, a status label, and
an owner approval state in [`docs/BUILD_LEDGER.md`](docs/BUILD_LEDGER.md). Consult it to
see what is ready to merge, waiting, blocked, or must not be touched.

- **IDs** use per-project prefixes: `DBZ-###` (Devbiz), `GV-###` (GrowVerse),
  `REC-###` (Recorded It), `BOOM-###` (BOOMSKI / Copy Snap), `FR-###` (Frontier),
  `INFRA-###` (cross-project). One ID per work item, never reused.
- **Status labels** (use only these): `PLAN`, `BUILDING`, `DRAFT`, `AWAITING_AUDIT`,
  `MANUAL_CHECK`, `APPROVED`, `MERGED`, `HOLD`, `FIX_FIRST`, `BLOCKED`.
- **Approval rule:** an advisor (e.g. ChatGPT) may return `APPROVE` / `HOLD` /
  `FIX_FIRST` / `MANUAL_CHECK_REQUIRED`, but **no agent may merge** without explicit
  owner authorization for that specific PR. Mark `APPROVED` only when the
  merge-readiness rule in the ledger is fully met.

Keep ledger updates on a docs/process lane — never bundled into feature PRs.

## PR FLOW RULES

These rules govern how every future PR is planned, opened, watched, audited, merged, and
closed. They apply to all agents and contributors. Full reference: [`docs/PR_FLOW.md`](docs/PR_FLOW.md).

> **Default workflow (owner, 2026-07-02):** the studio now prefers a *commit-streaming* flow —
> incremental commits on a working/integration branch over a PR per change. The rules below apply
> **when a PR is actually opened** (a genuine review gate, or on owner request). See
> *Working Conventions* under **Memory Layers** above.

### 1. One PR = One Purpose

Every PR must have one lane only:

- docs/process
- infrastructure
- bug fix
- feature
- security/privacy
- economy/marketplace
- deployment/release

Do not mix lanes unless explicitly authorized.

### 2. Phase Order

Use phased PRs for larger work:

1. Plan / spec PR
2. Scaffold PR
3. Feature PR
4. Hardening / tests PR
5. Launch / enablement PR

Do not jump to Phase 2 before Phase 1 is merged or explicitly approved.

### 3. Draft First

New PRs should usually start as drafts unless they are tiny docs-only changes.

Draft means:

- scope is still being checked
- manual review may still be needed
- no merge expectation yet

### 4. AWAITING_AUDIT State

A PR may move to `AWAITING_AUDIT` only after:

- scope is frozen
- no more code changes are planned
- tests/checks are documented
- manual checks are documented if needed
- known risks are listed
- no unrelated work remains inside the PR

### 5. No Auto-Merge

Do not merge automatically.

Merge requires explicit owner approval.

### 6. Watcher Rule

If assigned to watch a PR, stay quiet unless something actionable happens.

Surface only:

- review comment
- merge conflict
- preview/deploy issue
- owner decision needed

Do not send repeated "still holding" messages.

### 7. Green Status Rule

Never claim green unless the exact check completed successfully.

Use precise language:

- local passed, no CI configured
- Cloudflare deployed
- manual preview passed

"Expected green" is not green.

### 7b. Green Gate (main must be green — non-negotiable)

`main` is the sole deploy source and must always be green. This is a *precondition*
for work, not a nice-to-have. **CI workflows have been removed from this repo**
(see the `claude/remove-ci-workflows` branch) to avoid billing stalls — there is no
remote CI to check, and you must never block work waiting for a CI job that will
never execute. The gate is now **local verification only**:

- **Before starting any task:** verify `main` is locally sound — run the project's
  local lint/typecheck/test commands and confirm they pass before declaring a base
  sound. Default Devbiz gate from repo root: **`npm run verify`** (pinball 24/24 +
  leaderboard unit tests). Do not build on a base you haven't verified locally.
- **Before claiming a branch is mergeable:** merge/rebase `main` into the working
  branch first, then confirm the branch's own local checks pass.
- **After any push to, or merge/ff into, `main`:** re-run local verification and
  confirm `main` is still sane before declaring the merge done.
- Owner approval is still required to merge (§11 / PR_FLOW §5).
- **Use precise language** (§7): say "local passed, no CI configured" — never claim
  "CI green" or "expected green." Expected green is not green.

### 8. Manual Check Rule

If a PR requires browser, wallet, payment, screen capture, API key, or deployment
verification, document it as a manual gate.

Do not mark it audit-ready until the manual gate is completed or explicitly waived.

### 9. Found But Not Changed

If unrelated work is discovered, do not fix it inside the PR. Use:

```
Found but not changed:
1. Issue:
2. Risk:
3. Recommended follow-up PR:
4. Blocking current task? Yes/No.
```

### 10. Closeout Format

Every PR closeout must use:

```
Asked:
Done:
Verified:
Needs you:
Risks / Notes:
```

Keep it compact. If there are no risks, say `Risks / Notes: None.`

### 11. Owner-Only Decisions

Stop and ask before:

- merging
- deploying
- changing pricing
- changing permissions/security policy
- enabling payment
- enabling AI/API keys
- changing token/credit behavior
- changing blockchain/proof behavior
- changing production environment variables
- retargeting branches
- opening a new PR lane

A **narrow set of irreversible / costly actions** additionally require a
confirmation token `OWNER-OK: <phrase>` in the instruction — even under full
delegation: enabling payment; enabling AI/API keys; changing token/credit or
blockchain/proof behavior; changing production environment variables. The phrase
is agreed out-of-band and never committed. See `docs/PR_FLOW.md` §11a.

Everything else above — including reversible security/permission/routing changes
(e.g. a config that 404s a private surface) and ordinary production merges/deploys
— needs only explicit owner authorization for that specific action, not the token.

### 12. Closed Lane Rule

When a PR is merged or closed:

- confirm final state
- unsubscribe/stand down if applicable
- do not reopen
- do not start follow-up work unless explicitly authorized

### 13. Current Status Snapshot

When asked for current state, report compactly:

- PR number/name
- status
- allowed actions
- blocked actions
- next owner action

Do not restate the whole project history.

## OUTPUT QUALITY DOCTRINE

Kudbee is a design-and-games studio: the work has to *look* and *feel* next-level, not just
function. These rules raise the bar for how agents work here. They are distilled from
widely-circulated long-running-agent prompt patterns (the June 2026 "Fable 5" system-prompt
discussion) — the durable lesson of which is that great agent output comes from **precise
capability, output contracts, and verification — not persona or vibes**. Adapted for this repo:

### A. Taste & visual ambition
- Treat every visual surface (site, game, tool) as a portfolio piece. When asked for "a spec"
  — a poster, a section, an animation — **build and verify the rendered result**, don't just
  describe it. Reach for the more impressive, more polished version when effort allows.
- Match the house style already in the codebase (zero-build, inline, vanilla, canvas vector
  art, the existing palette/`fitCanvas` helpers) before inventing new patterns.
- Performance is part of quality: 60fps target, `requestAnimationFrame`, pause work off-screen,
  honor `prefers-reduced-motion`, and degrade gracefully on mobile/low-power.

### B. Verify before claiming done
- Reuse the §7 Green Status language. "Expected green" is not green. Don't say a thing renders,
  passes, or deploys unless you actually ran the exact check and saw it.
- Actually create/modify the files — never just print intended content. Confirm structure
  (syntax-check JS, validate JSON-LD/XML, balance tags) before committing.

### C. Honesty about what was and wasn't done
- Own gaps and limitations plainly (use the §10 closeout `Needs you:` / `Risks` fields). If a
  step was skipped, a placeholder was left, or a manual gate remains, say so — don't paper over it.
- Don't fabricate data in code or markup (e.g. no schema.org `SearchAction` with no real search,
  no sitemap entries for URLs that don't exist).

### D. No laziness / no silent truncation
- Read the relevant file/skill/doc before editing it; don't guess at structure you can cheaply check.
- Don't truncate or "...rest unchanged" real deliverables. Ship the whole thing.

### E. Act decisively vs over-asking
- When the request and the codebase make the answer clear, act — then report. Reserve questions
  for genuine owner-only decisions (§11) or true ambiguity, and batch them.
- Keep replies tight: lead with the result, minimal formatting, no narration of internal machinery.
