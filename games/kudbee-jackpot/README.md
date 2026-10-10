# Kudbee Jackpot — Neon Fortune

> **Kudbee Games Studio** — a 5-reel, 9-payline neon slot machine with a scatter-triggered
> Bonus Wheel, four live progressive jackpots (Mini/Minor/Major/Grand), and the same
> provably-fair (HMAC-SHA256 commit-reveal) engine as **Kudbee Plinko**, extended to reels.

## Play

- **Hosted:** `/games/kudbee-jackpot/index.html`
- **Locally:** `python3 -m http.server 8000` →
  <http://localhost:8000/games/kudbee-jackpot/index.html>

## How it works

- **Reels:** 5 reels × 3 rows, 9 fixed paylines, one 40-symbol strip shared by all five
  reels. Match symbols left-to-right on a line (Wild substitutes for anything but Scatter)
  to win. Land 3+ Scatters anywhere on the grid for an instant scatter payout **and** the
  Bonus Wheel.
- **Bonus Wheel:** a 12-wedge wheel — cash multipliers (×2/×3/×5/×10 of total bet) plus
  four jackpot wedges (**Mini/Minor/Major/Grand**). Every spin quietly feeds all four
  jackpot meters (a fixed % of the total bet); hitting a jackpot wedge pays out whatever
  that meter has grown to, then resets it to its seed value.
- **Fairness:** identical construction to Kudbee Plinko — each spin's 5 reel stops (and
  the Bonus Wheel draw, when it triggers) come from
  `HMAC-SHA256(serverSeed, clientSeed:round:reel<N>)` via the browser's native Web Crypto
  API, mapped onto the reel strip. The server seed's hash is shown before you play under
  it; **Reveal & rotate** exposes the real seed afterward, and the same in-page Verify
  panel recomputes any past spin locally — no network call, no trust required. The full
  40-symbol reel strip is shown in the Fair panel, so nothing about the odds is hidden.
- **Money:** chip balance (`localStorage`) is **demo currency only**, independent from
  Plinko's. Jackpot pools are also local/per-browser — a genuinely **shared** live
  progressive across players would need a real backend (a Worker, same as the leaderboard's
  live mode), which is a separate, owner-approved future phase. **Connect Wallet** is the
  same read-only Phantom (`window.solana`) handshake as Plinko: shows your real address and,
  best-effort, your real SOL balance for context, never requests a signature, never touches
  the chip balance.

### Math, tuned by simulation before shipping

The reel strip and paytable were tuned with a 1,000,000-spin Node simulation (identical
payline/scatter/bonus-wheel logic to the client) before going anywhere near the real game,
after an early draft strip design accidentally produced a **169% RTP** (a bonus roughly
every 10 spins) — the bug was treating each reel's *visible 3-symbol window* as if it had
the same trigger probability as a single stop, when in fact a window is ~3× more likely to
contain a given symbol than a lone stop is. Final tuned numbers: **~94.6% RTP**, ~38% hit
frequency (any win), and a Bonus Wheel roughly every 260–270 spins.

## Checks

`npm run jackpot:eval` (also part of `npm run verify`) runs headless checks against the real page:
a 300k-spin return-to-player sample, hit rate, the exact Bonus Wheel odds computed from the strip, that the
Fair panel shows the real strip, chip accounting across spins, a provably-fair round-trip (revealed seed
hashes to the commitment and recomputes the same stops), and that closing the Bonus Wheel with ✕ still
pays the win.

## Controls

Pick a bet-per-line amount, hit **SPIN**. Touch and mouse both work; no keyboard required.

## Leaderboard

**kd-leaderboard** SDK (`GAME: 'jackpot'`). Metrics: `biggestWin`, `biggestJackpot`,
`totalSpins`. Live cloud needs Worker + `API_BASE` — see `leaderboard/README.md`.
