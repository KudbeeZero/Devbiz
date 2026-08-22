/* ===========================================================================
 * KUDBEE Studio Hub — studio-sdk.js
 * The central nervous system: profile, levels, plugin rack, economy, agents,
 * blockchain-flavored wallet, spliced leaderboards, skins, terraforming.
 *
 * ZERO-BUILD: vanilla JS, no deps. All data lives in localStorage under
 * 'kudbee.studio.v1'. Everything here is SIMULATED — no real payments, no
 * real chain, no real AI API keys. Real integrations (Solana/Algorand,
 * payments, AI keys) are owner-only gates and slot in via the same API.
 * ========================================================================= */
(function () {
  'use strict';
  var LS = 'kudbee.studio.v1';
  var TAU = Math.PI * 2;

  function load() {
    try { return JSON.parse(localStorage.getItem(LS)) || {}; }
    catch (e) { return {}; }
  }
  function save(s) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) {} }
  function now() { return Date.now(); }

  var S = load();
  function ensure() {
    S.player = S.player || {
      name: 'Player', created: now(), xp: 0, level: 1,
      credits: 1000, skin: 'neon', wallet: null, bestStreak: 0
    };
    S.games = S.games || {};
    S.plugins = S.plugins || {};
    S.agents = S.agents || [];
    S.challenges = S.challenges || [];
    S.history = S.history || [];
    S.terra = S.terra || { stage: 1, energy: 0 };
    return S;
  }
  ensure();

  function bus() {
    if (!S._bus) { S._bus = {}; S._ev = []; }
    return { on: function (e, f) { (S._bus[e] = S._bus[e] || []).push(f); },
             emit: function (e, d) { (S._bus[e] || []).forEach(function (f) { try { f(d); } catch (_) {} }); } };
  }
  var BUS = bus();

  // ---- leveling / terraforming -------------------------------------------
  var TERRA_STAGES = [
    { n: 1, name: 'Spark',     tag: 'dormant table',   need: 0,    color: '#39e6ff' },
    { n: 2, name: 'Pulse',     tag: 'first contact',   need: 500,  color: '#7CFFb2' },
    { n: 3, name: 'Ignition',  tag: 'the field wakes', need: 2500, color: '#ffd34d' },
    { n: 4, name: 'Living',    tag: 'table breathes',  need: 8000, color: '#c46bff' },
    { n: 5, name: 'Sovereign', tag: 'full sentience',  need: 20000,color: '#ff6ec7' }
  ];
  function stageFor(xp) {
    var s = TERRA_STAGES[0];
    for (var i = 0; i < TERRA_STAGES.length; i++) if (xp >= TERRA_STAGES[i].need) s = TERRA_STAGES[i];
    return s;
  }
  function xpToLevel(xp) { return Math.floor(Math.sqrt(xp / 50)) + 1; }

  // ---- plugins (rack) -----------------------------------------------------
  // Each plugin has a level gate. Plugging it in unlocks a feature in the
  // hub. Real integrations (chain, AI keys, payments) are gated behind
  // owner-only flags; here they show as "available to connect".
  var PLUGINS = [
    { id: 'core-stats',  name: 'Core Stats',     icon: '◉', level: 1, desc: 'XP, levels, streaks, aggregate analytics.' },
    { id: 'pinball',     name: 'Pinball',        icon: '◎', level: 1, desc: 'Starbreak scores, secrets, multiball, combos.' },
    { id: 'darts',       name: 'Darts',          icon: '◆', level: 1, desc: 'Bullseye League, 180s, checkouts, flicks.' },
    { id: 'orbital',     name: 'Orbital',        icon: '✦', level: 2, desc: 'Twin-stick waves, combos, survival.' },
    { id: 'puzzles',     name: 'Circuit',        icon: '▦', level: 2, desc: 'Pipe boards, solve time, completion.' },
    { id: 'combo',       name: 'Combo Engine',   icon: '⁂', level: 3, desc: 'Cross-game combos & shot chains.' },
    { id: 'ai-agents',   name: 'AI Agent Bay',   icon: '✺', level: 3, desc: 'Spawn AI rivals that grind & compete for you.', gate: 'ai' },
    { id: 'blockchain',  name: 'Chain Wallet',   icon: '⬡', level: 4, desc: 'Solana + Algorand themed credits & stakes.', gate: 'chain' },
    { id: 'staking',     name: 'Stake Hall',     icon: '⚂', level: 4, desc: 'Wager credits on your runs, climb leaderboards.', gate: 'pay' },
    { id: 'mint',        name: 'Mint Lab',       icon: '✧', level: 5, desc: 'Turn top runs into on-chain highlights.', gate: 'chain' }
  ];

  // ---- economy (simulated credits) --------------------------------------
  var ECON = {
    wallet: function () {
      // A Solana/Algorand-flavored simulated wallet. Real keys = owner gate.
      if (!S.player.wallet) {
        S.player.wallet = {
          addr: 'KD' + Math.random().toString(36).slice(2, 10).toUpperCase(),
          sol: (Math.random() * 9.99).toFixed(3),
          algo: (Math.random() * 999).toFixed(2),
          kdb: S.player.credits
        };
      }
      return S.player.wallet;
    },
    addCredits: function (n, reason) {
      S.player.credits += n;
      if (S.player.wallet) S.player.wallet.kdb = S.player.credits;
      ECON.log('credit', n, reason);
      ECON.save(); return S.player.credits;
    },
    wager: function (amount, chance, reason) {
      // Simulated stake. Real money = owner gate.
      if (amount > S.player.credits) return { ok: false, msg: 'insufficient credits' };
      S.player.credits -= amount;
      var win = Math.random() < chance;
      var payout = win ? Math.round(amount * (1.8 + Math.random())) : 0;
      S.player.credits += payout;
      if (S.player.wallet) S.player.wallet.kdb = S.player.credits;
      ECON.log(win ? 'win' : 'loss', win ? payout : -amount, reason);
      ECON.save();
      return { ok: true, win: win, payout: payout, balance: S.player.credits };
    },
    log: function (type, amt, reason) {
      S.history.push({ t: now(), type: type, amt: amt, reason: reason || '' });
      if (S.history.length > 200) S.history.shift();
    }
  };

  // ---- AI agents (simulated) --------------------------------------------
  var AGENTS = {
    spawn: function (name, game, skill) {
      // Simulated agent. Real AI (LLM via API key) = owner gate.
      var ag = { id: 'ai_' + Math.random().toString(36).slice(2, 7), name: name || 'Rival',
                 game: game || 'pinball', skill: skill || 0.5, wins: 0, xp: 0, alive: true,
                 spawned: now() };
      S.agents.push(ag); AGENTS.save(); BUS.emit('agents'); return ag;
    },
    tick: function () {
      // Agents grind: occasionally earn XP/credits for the competition feel.
      S.agents.forEach(function (a) {
        if (!a.alive) return;
        if (Math.random() < 0.06 * a.skill) {
          a.xp += Math.round(20 + Math.random() * 80 * a.skill);
          a.wins++;
        }
      });
      AGENTS.save();
    },
    remove: function (id) { S.agents = S.agents.filter(function (a) { return a.id !== id; }); AGENTS.save(); BUS.emit('agents'); },
    clear: function () { S.agents = []; AGENTS.save(); BUS.emit('agents'); }
  };

  // ---- spliced leaderboards (local + rivals) ---------------------------
  var RIVALS = [
    { name: 'NOVA',   col: '#39e6ff' }, { name: 'KAI',    col: '#7CFFb2' },
    { name: 'ZEPH',   col: '#ffd34d' }, { name: 'IRIS',   col: '#c46bff' },
    { name: 'RONIN',  col: '#ff6ec7' }, { name: 'ECHO',   col: '#ff5d3c' }
  ];
  function seedRivals(game, n, base) {
    var r = [];
    for (var i = 0; i < (n || 5); i++) {
      var rv = RIVALS[i % RIVALS.length];
      r.push({ name: rv.name, col: rv.col, score: Math.round(base * (0.5 + Math.random())), you: false, ai: true });
    }
    return r;
  }
  function board(game, score, splice) {
    splice = splice || 'all';
    var self = { name: S.player.name || 'You', col: '#ffffff', score: score, you: true, ai: false };
    var base = score || 1000;
    var rows = [self].concat(seedRivals(game, 6, base));
    // weekly splice: scores drift lower, reshuffle who's near you
    if (splice === 'week') rows.forEach(function (r) { r.score = Math.round(r.score * (0.6 + Math.random() * 0.5)); });
    if (splice === 'day')  rows.forEach(function (r) { r.score = Math.round(r.score * (0.4 + Math.random() * 0.4)); });
    rows.sort(function (a, b) { return b.score - a.score; });
    return rows;
  }

  // ---- challenges --------------------------------------------------------
  var CHAL_TMPL = [
    { id: 'first-blood', name: 'First Blood',  desc: 'Log any score in a game.',  xp: 100 },
    { id: 'hat-trick',   name: 'Hat Trick',    desc: 'Score in 3 different games.', xp: 300 },
    { id: 'streak-3',    name: 'On Fire',      desc: 'Win 3 wagers in a row.',    xp: 500 },
    { id: 'agent',       name: 'Agent Smith',  desc: 'Spawn your first AI rival.', xp: 200 },
    { id: 'jackpot',     name: 'Jackpot',      desc: 'Hit a pinball jackpot.',     xp: 800 }
  ];
  function challenges() {
    if (!S.challenges.length) {
      CHAL_TMPL.forEach(function (c) { S.challenges.push(Object.assign({ done: false }, c)); });
    }
    return S.challenges;
  }
  function completeChallenge(id) {
    var c = challenges().find(function (x) { return x.id === id; });
    if (c && !c.done) { c.done = true; API.addXP(c.xp); BUS.emit('challenges'); }
  }

  // ---- skins -------------------------------------------------------------
  var SKINS = {
    neon:   { name: 'Neon',   bg: '#05050f', fg: '#cfe9ff', accent: '#39e6ff', accent2: '#c46bff', grid: 'rgba(57,230,255,0.08)' },
    ember:  { name: 'Ember',  bg: '#0f0705', fg: '#ffe9cf', accent: '#ff5d3c', accent2: '#ffd34d', grid: 'rgba(255,93,60,0.08)' },
    void:   { name: 'Void',   bg: '#050f0a', fg: '#cfffe9', accent: '#7CFFb2', accent2: '#39e6ff', grid: 'rgba(124,255,178,0.08)' },
    gold:   { name: 'Gold',   bg: '#0f0d05', fg: '#fff4cf', accent: '#ffd34d', accent2: '#c46bff', grid: 'rgba(255,211,77,0.08)' },
    royal:  { name: 'Royal',  bg: '#0a050f', fg: '#e9cfff', accent: '#c46bff', accent2: '#ff6ec7', grid: 'rgba(196,107,255,0.08)' }
  };

  // ---- core API ----------------------------------------------------------
  var API = {
    BUS: BUS,
    save: function () { save(S); },
    reset: function () { localStorage.removeItem(LS); S = {}; ensure(); BUS.emit('all'); },
    profile: function () { return S.player; },
    games: function () { return S.games; },
    terra: function () {
      var xp = S.player.xp;
      var stage = stageFor(xp);
      var next = TERRA_STAGES[stage.n] || null;
      var prevNeed = stage.need;
      var prog = next ? Math.min(1, (xp - prevNeed) / (next.need - prevNeed)) : 1;
      return { stage: stage, next: next, xp: xp, progress: prog,
               level: xpToLevel(xp), toNext: next ? next.need - xp : 0 };
    },
    track: function (game, event, payload) {
      S.games[game] = S.games[game] || { plays: 0, total: 0, best: 0, last: 0 };
      var g = S.games[game];
      g.plays++; g.last = now();
      if (event === 'score') {
        var sc = payload || 0; g.total += sc; if (sc > g.best) g.best = sc;
        var xp = Math.max(1, Math.round(sc / 100));
        API.addXP(xp);
      }
      S.history.push({ t: now(), game: game, event: event, payload: payload });
      BUS.emit('track', { game: game, event: event, payload: payload });
      API.save();
    },
    addXP: function (n) {
      S.player.xp += n;
      var lvl = xpToLevel(S.player.xp);
      if (lvl > S.player.level) { S.player.level = lvl; BUS.emit('level', lvl); }
      API.save();
    },
    addCredits: ECON.addCredits,
    wager: ECON.wager,
    wallet: ECON.wallet,
    history: function (n) { return (S.history || []).slice(-(n || 50)).reverse(); },
    plugins: function () { return PLUGINS.map(function (p) {
      return Object.assign({}, p, { unlocked: S.player.level >= p.level, installed: !!S.plugins[p.id] });
    }); },
    install: function (id) {
      var p = PLUGINS.find(function (x) { return x.id === id; });
      if (!p || S.player.level < p.level) return false;
      S.plugins[id] = { at: now() }; API.save(); BUS.emit('plugins'); return true;
    },
    uninstall: function (id) { delete S.plugins[id]; API.save(); BUS.emit('plugins'); },
    agents: function () { return S.agents; },
    spawnAgent: AGENTS.spawn,
    removeAgent: AGENTS.remove,
    clearAgents: AGENTS.clear,
    tickAgents: AGENTS.tick,
    board: board,
    challenges: challenges,
    completeChallenge: completeChallenge,
    skins: function () { return Object.keys(SKINS).map(function (k) { return { id: k, name: SKINS[k].name }; }); },
    skin: function (id) { if (SKINS[id]) { S.player.skin = id; API.save(); BUS.emit('skin'); } return SKINS[S.player.skin || 'neon']; },
    skinDef: function () { return SKINS[S.player.skin || 'neon']; },
    allSkins: function () { return SKINS; },
    // integration badges (Kilo CLI, MCP, SDK, chain) — status display
    integrations: function () {
      return [
        { id: 'kilo', name: 'Kilo CLI', status: 'connected', note: 'agent runner' },
        { id: 'mcp',  name: 'MCP',      status: 'ready',     note: 'tool server' },
        { id: 'sdk',  name: 'SDK',      status: 'ready',     note: 'game hooks' },
        { id: 'sol',  name: 'Solana',   status: S.player.wallet ? 'simulated' : 'idle', note: 'owner gate to connect' },
        { id: 'algo', name: 'Algorand', status: S.player.wallet ? 'simulated' : 'idle', note: 'owner gate to connect' }
      ];
    }
  };
  window.KDStudio = API;
})();
