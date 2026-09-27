# Kudbee Plinko — Neon Drop

> **Kudbee Games Studio** — a neon Galton-board drop game with a real, independently
> verifiable **provably-fair** engine (HMAC-SHA256 commit-reveal), demo chips, and an
> optional read-only Solana (Phantom) wallet connect.

## Play

- **Hosted:** `/games/kudbee-plinko/index.html`
- **Locally:** `python3 -m http.server 8000` →
  <http://localhost:8000/games/kudbee-plinko/index.html>

## How it works

- **Board:** 12 peg rows → 13 landing slots. Each peg is a genuine 50/50 split, so real
  Galton-board math applies: drops land near the **center** far more often than the
  **edges**. Multipliers are weighted accordingly — center slots pay less than the bet
  back most of the time (`0.5×`–`1×`), edge slots pay big (`9×`, `40×`) because they're
  statistically rare.
- **Fairness:** every drop's left/right sequence comes from
  `HMAC-SHA256(serverSeed, clientSeed:round:row)` — a real cryptographic coin flip per
  row, computed with the browser's native Web Crypto API (`crypto.subtle`), not
  `Math.random()`. The current server seed's **SHA-256 hash** is shown *before* any
  round is played under it (the "🔒 Fair" badge), so it can't be changed retroactively.
  Hit **Reveal & rotate** any time to expose the real seed for every round played under
  it, then verify any of them yourself in the same panel — it recomputes the result
  locally with no network call.
- **Money:** chip balance (`localStorage`) is **demo currency only**. The **Connect
  Wallet** button is a read-only Phantom (`window.solana`) handshake — it shows your
  real public address and, best-effort, your real SOL balance for context — but never
  requests a transaction signature and never touches the demo chip balance. No real
  funds move anywhere in this build.

### Honest scope note

This demo runs *both* roles of the commit-reveal scheme (the "house" seed and your
play) in your own browser, so you can see and test the exact algorithm end-to-end.
For that scheme to be adversarially safe with **real** money, the server seed has to
be generated and held by a real backend the player can't see in advance (otherwise a
player could pick client-seed values after peeking at a client-side "server" seed).
That backend — plus real wallet-authorized wagering — is a separate, owner-approved
future phase; this build is the fun/mechanics layer only.

## Controls

Tap a bet size, tap **DROP**. Touch and mouse both work; no keyboard required.

## Leaderboard

**kd-leaderboard** SDK (`GAME: 'plinko'`). Metrics: `bestMultiplier`, `biggestWin`,
`totalDrops`. Live cloud needs Worker + `API_BASE` — see `leaderboard/README.md`.
