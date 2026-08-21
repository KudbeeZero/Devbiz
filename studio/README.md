# KUDBEE Studio Hub — Command Center

A central, agent-driven dashboard that every Kudbee game plugs into. It's the
**profile / economy / competition / blockchain / AI layer** — the "Rubik's cube"
where each face is a real primitive and they all interlock through one profile.

> ZERO-BUILD: vanilla JS, no deps. All data lives locally in
> `localStorage` under `kudbee.studio.v1`. Real integrations (Solana, Algorand,
> AI keys, payments) slot in via the same API and are flagged as owner-only gates.

## Run

```bash
cd studio && python3 -m http.server 8080
# → http://localhost:8080/
```

Or open `index.html` directly. The Hub is also reachable from the studio root
`index.html#studio` once wired into the main nav.

## The Cube — architecture

```
                          ┌───────────────────────────┐
                          │      KUDBEE STUDIO HUB     │
                          │  profile · economy · board │
                          └─────────────┬─────────────┘
                                        │
          ┌──────────────┬──────────────┼──────────────┬──────────────┐
          │              │              │              │              │
     ┌────▼────┐   ┌─────▼────┐  ┌─────▼────┐  ┌─────▼────┐  ┌─────▼────┐
     │  Games  │   │  Plugin  │  │  Chain   │  │   AI     │  │   Edge   │
     │ pinball │   │  Rack    │  │  Wallet  │  │  Agent   │  │   CF     │
     │ darts   │   │  (LVL)   │  │  SOL     │  │  Bay     │  │  D1/KV   │
     │ orbital │   │          │  │  ALGO    │  │          │  │  R2/DO   │
     │ puzzles │   │          │  │  KDB     │  │          │  │  Wrk/Que │
     └────┬────┘   └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘
          │              │              │              │              │
          └──────────────┴──────────────┴──────────────┴──────────────┘
                                     │
                              studio-sdk.js
                            (the integration
                             surface: SDK · MCP
                             · CLI hooks)
```

Each face is swappable and testable in isolation — that's the cube. Pull any
node, the rest keep working. Add a face, everything inherits the new primitive.

## Layers (what each file does)

| File | Layer | Responsibility |
|---|---|---|
| `studio-sdk.js` | **SDK** | Profile, XP/levels, skins, plugin registry, economy, AI agents, spliced leaderboards, chain wallet, challenges, event bus. The single integration surface every game imports. |
| `analytics.js` | **Charts** | Zero-dep canvas charts — bar, radar, sparkline, donut, ring. DPR-aware, theme-aware. |
| `app.js` | **Controller** | Renders the Hub, binds the SDK to the DOM, runs the AI-agent grind loop, draws the constellation. |
| `index.html` | **View** | Dashboard layout — terraforming, architecture, stats, charts, plugin rack, leaderboard, agent bay, wallet, challenges, integrations. |
| `styles.css` | **Theme** | KUDBEE-branded, skin-driven via CSS custom properties. |

## External real-world integrations (the cube's owner-gated faces)

These are the actual services the Hub is built to connect. All are simulated
locally today; connecting the real thing is an **owner-only gate** (§11).

| Service | How it plugs in | What it unlocks |
|---|---|---|
| **Cloudflare Workers** | API gateway / session routing / rate limiting | Edge compute, the hub's backend |
| **D1** | Player profiles, stats, plugin registry, brackets | Globally-replicated SQLite |
| **KV** | Sessions, rate-limit counters, feature flags | Sub-ms distributed reads |
| **R2** | Game assets, replay/NFT blobs, audit logs | **Zero egress** at scale |
| **Durable Objects** | Real-time multiplayer rooms, agent sessions, live brackets | Authoritative stateful WebSockets |
| **Queues + Workflows** | Async jobs — replay analysis, stat aggregation, rewards | Native checkpointing + retries |
| **Solana** (Anchor + Core Candy Machine) | On-chain rewards, stakes, mint top runs as NFTs | Fast/cheap transactions |
| **Algorand** (Python 5.0 + AlgoKit) | Verifiable AI-agent actions, on-chain attestations | Python-native contracts, fast finality |
| **MCP server** | Exposes studio tools to AI agents (`spawn`, `track`, `leaderboard`) | Agent-to-studio interface |
| **CLI** (Kilo/Kiro-style) | Operator terminal: `studio deploy`, `studio agent spawn`, `studio board` | DevOps |
| **Terraform** | Dev/staging/prod isolation, WAF, mTLS, binding sync | Environment parity |

## Plugin rack

Plugins are the cube's plug-in modules. Each has a **level gate** (installable
once the player reaches that level) and optional **owner gates** (`chain`, `ai`,
`pay`) that flag a real service connection is required before the full feature
goes live. Install a plugin and it wires its primitive into the Hub.

## Leaderboards — spliced, never demoralizing

Borrowed directly from gamification research (Yu-kai Chou, Octalysis): instead
of one all-time global board, the Hub splices by **time window** (daily /
weekly / all-time) and always shows you vs. AI rivals in a tight band. There's
always a winnable path — never a wall of untouchable scores.

## Terraforming — progression as worldbuilding

Your studio evolves through 5 stages as you earn XP:

1. **Spark** → 2. **Pulse** → 3. **Ignition** → 4. **Living** → 5. **Sovereign**

Each stage wakes new infrastructure: core stats → games → combo engine → AI
agents → chain wallet + stake hall. The table literally comes alive.

## Games that plug in

| Game | SDK hook | What it pushes |
|---|---|---|
| `kudbee-pinball` | loads `../studio/studio-sdk.js`, tracks on game-over | Best score per run, "pinball" plugin auto-installs |
| `kudbee-darts` | loads `../studio/studio-sdk.js`, tracks career on load | Wins, 180s, coins→credits, "darts" plugin auto-installs |

A game imports the SDK and calls `KDStudio.track('game-id', 'score', n)` — that's
it. Everything else (XP, levels, boards, wallet) flows from that single call.

## Next phases (polish / review / CI)

- [ ] Wire `studio/` into the root `index.html` nav as a first-class destination
- [ ] Cloudflare Worker backend (D1 schema + KV namespaces + R2 bucket)
- [ ] Real Solana Anchor program + Metaplex Core Candy Machine (owner gate)
- [ ] Real Algorand AlgoKit contracts in Python (owner gate)
- [ ] MCP server exposing studio tools to AI agents
- [ ] Operator CLI (`studio` binary)
- [ ] Terraform for env isolation
- [ ] CI: htmlhint + Playwright smoke on the Hub + existing quality gate

## ⚠️ Owner-only gates

Real payments/gambling, real blockchain transactions (Solana/Algorand), and real
AI API keys are **owner-only decisions** requiring an `OWNER-OK` confirmation
token before they can be enabled. This demo simulates all of them locally with
no real money, no real chain, no real API keys. The integration points are real
and ready — the switches are yours to flip.
