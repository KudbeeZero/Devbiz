/* ===========================================================================
 * KUDBEE Studio Hub — app.js
 * Wires KDStudio profile + plugins + boards + agents + wallet + challenges
 * into the dashboard UI. Renders the constellation (architecture view),
 * the terraforming stage, plugin rack, spliced leaderboards, AI agent bay,
 * chain wallet panel, and integration status.
 * ========================================================================= */
(function () {
  'use strict';
  var S = window.KDStudio, Charts = window.KDCharts;
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function skin() { return S.skinDef(); }
  function $(id) { return document.getElementById(id); }
  function applySkin() {
    var k = skin(), r = document.documentElement.style;
    r.setProperty('--bg', k.bg); r.setProperty('--fg', k.fg); r.setProperty('--accent', k.accent);
    r.setProperty('--accent2', k.accent2); r.setProperty('--grid', k.grid);
    document.body.style.background = k.bg; document.body.style.color = k.fg;
  }

  // ---- constellation (architecture view) -----------------------------------
  var NODES = [
    { id: 'hub', label: 'KUDBEE HUB', x: 0.5, y: 0.5, r: 30, color: '#ffffff', kind: 'core' },
    { id: 'pinball', label: 'Pinball', x: 0.2, y: 0.22, color: '#39e6ff' },
    { id: 'darts', label: 'Darts', x: 0.8, y: 0.22, color: '#7CFFb2' },
    { id: 'orbital', label: 'Orbital', x: 0.15, y: 0.62, color: '#ffd34d' },
    { id: 'puzzles', label: 'Circuit', x: 0.85, y: 0.62, color: '#c46bff' },
    { id: 'd1', label: 'D1', x: 0.35, y: 0.85, color: '#ff6ec7' },
    { id: 'kv', label: 'KV', x: 0.5, y: 0.9, color: '#39e6ff' },
    { id: 'r2', label: 'R2', x: 0.65, y: 0.85, color: '#7CFFb2' },
    { id: 'sol', label: 'Solana', x: 0.32, y: 0.42, color: '#14f195' },
    { id: 'algo', label: 'Algorand', x: 0.68, y: 0.42, color: '#00a4ff' },
    { id: 'agent', label: 'Agents', x: 0.5, y: 0.12, color: '#ff5d3c' }
  ];
  function drawConstellation() {
    var cv = $('constellation'); if (!cv || !Charts) return;
    var o = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
    cv.width = r.width * dpr; cv.height = r.height * dpr; o.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = r.width, H = r.height, skinA = skin(); o.clearRect(0, 0, W, H);
    var t = performance.now() / 1000;
    function P(n) { return { x: n.x * W, y: n.y * H }; }
    // links
    NODES.forEach(function (n) {
      if (n.id === 'hub') return;
      var a = P(NODES[0]), b = P(n);
      o.beginPath(); o.moveTo(a.x, a.y); o.lineTo(b.x, b.y);
      o.strokeStyle = 'rgba(' + hex(n.color) + ',0.18)'; o.lineWidth = 1.5; o.stroke();
      // travelling pulse
      var ph = (t * 0.4 + n.x) % 1, px = a.x + (b.x - a.x) * ph, py = a.y + (b.y - a.y) * ph;
      o.beginPath(); o.arc(px, py, 2.5, 0, Math.PI * 2); o.fillStyle = 'rgba(' + hex(n.color) + ',0.9)'; o.fill();
    });
    // nodes
    NODES.forEach(function (n) {
      var p = P(n), col = n.color;
      o.beginPath(); o.arc(p.x, p.y, n.r || 14, 0, Math.PI * 2);
      o.fillStyle = 'rgba(' + hex(col) + ',0.15)'; o.fill();
      o.beginPath(); o.arc(p.x, p.y, n.r || 14, 0, Math.PI * 2); o.strokeStyle = 'rgba(' + hex(col) + ',0.85)'; o.lineWidth = 2; o.stroke();
      o.fillStyle = skinA.fg; o.font = (n.kind === 'core' ? '700 ' : '') + '10px "Space Grotesk", system-ui'; o.textAlign = 'center'; o.textBaseline = 'middle';
      o.fillText(n.label, p.x, p.y);
    });
  }
  function hex(h) { var n = parseInt(h.slice(1), 16); return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255); }

  // ---- main render --------------------------------------------------------
  function render() {
    applySkin();
    var p = S.profile(), terra = S.terra(), skinA = skin();

    // header
    $('h-name').textContent = esc(p.name);
    $('h-credits').textContent = Math.round(p.credits).toLocaleString() + ' KDB';
    $('h-level').textContent = 'LVL ' + terra.level;

    // terraforming stage
    var stage = terra.stage;
    $('terra-name').textContent = stage.name;
    $('terra-tag').textContent = stage.tag;
    $('terra-stage-num').textContent = 'STAGE ' + stage.n + ' / 5';
    if ($('terra-ring')) Charts.ring($('terra-ring'), terra.progress, { accent: stage.color, sub: terra.toNext + ' XP to next' });
    $('terra-energy').style.width = (terra.progress * 100).toFixed(0) + '%';
    $('terra-energy').style.background = stage.color;
    // stage pips
    var pips = $('terra-pips'); if (pips) {
      pips.innerHTML = '';
      for (var i = 1; i <= 5; i++) { var pip = el('div', 'pip' + (i <= stage.n ? ' on' : '') + (i === stage.n ? ' cur' : '')); pip.title = (S.allSkins ? '' : '') + 'Stage ' + i; pips.appendChild(pip); }
    }

    // XP bar
    var totalFor = (terra.level) * 50, prevFor = (terra.level - 1) * 50, xpp = (p.xp - prevFor) / (totalFor - prevFor);
    $('xp-bar').style.width = (Math.max(0, Math.min(1, xpp)) * 100).toFixed(0) + '%';
    $('xp-text').textContent = p.xp.toLocaleString() + ' XP';

    // game stats — aggregate
    var games = S.games(), totPlays = 0, totScore = 0, best = 0, fav = '-', favPlays = 0;
    Object.keys(games).forEach(function (g) {
      totPlays += games[g].plays || 0; totScore += games[g].total || 0; if ((games[g].best || 0) > best) best = games[g].best || 0;
      if ((games[g].plays || 0) > favPlays) { favPlays = games[g].plays; fav = g; }
    });
    $('stat-plays').textContent = totPlays; $('stat-score').textContent = totScore.toLocaleString();
    $('stat-best').textContent = best.toLocaleString(); $('stat-fav').textContent = fav;

    // radar (game balance) + bar (plays per game)
    var radarAxes = [], barData = [];
    [['pinball', '#39e6ff'], ['darts', '#7CFFb2'], ['orbital', '#ffd34d'], ['puzzles', '#c46bff']].forEach(function (g) {
      var gp = games[g[0]] || { plays: 0, total: 0, best: 0 };
      radarAxes.push({ label: g[0], v: Math.min(1, (gp.total || 0) / Math.max(1, totScore)) });
      barData.push({ label: g[0].slice(0, 3), v: gp.plays || 0, color: g[1] });
    });
    if ($('radar')) Charts.radar($('radar'), radarAxes, { accent: skinA.accent });
    if ($('bar-plays')) Charts.bar($('bar-plays'), barData, { accent: skinA.accent });

    // credit sparkline
    var hist = S.history(30).filter(function (h) { return h.type === 'credit' || h.type === 'win' || h.type === 'loss'; });
    var bal = p.credits, series = []; for (var i = 0; i < 20; i++) { series.push(bal); bal -= (Math.random() - 0.45) * 40; }
    if ($('spark-credits')) Charts.spark($('spark-credits'), series.reverse(), { accent: skinA.accent });

    renderPlugins(); renderBoard(); renderAgents(); renderWallet(); renderChallenges(); renderIntegrations();
    drawConstellation();
  }

  function renderPlugins() {
    var wrap = $('plugin-rack'); if (!wrap) return;
    wrap.innerHTML = '';
    S.plugins().forEach(function (p) {
      var card = el('div', 'plugin' + (p.installed ? ' installed' : '') + (!p.unlocked ? ' locked' : ''));
      card.innerHTML = '<div class="plugin-icon">' + p.icon + '</div><div class="plugin-body"><div class="plugin-name">' + esc(p.name) + '</div><div class="plugin-desc">' + esc(p.desc) + '</div><div class="plugin-meta">' + (p.gate ? '<span class="gate-tag">' + p.gate + ' gate</span>' : '') + '<span class="lvl-req">LVL ' + p.level + '</span></div></div>';
      var btn = el('button', 'plugin-btn');
      if (!p.unlocked) { btn.textContent = '🔒 LVL ' + p.level; btn.disabled = true; }
      else if (p.installed) { btn.textContent = '✓ Active'; btn.classList.add('active'); btn.onclick = function () { S.uninstall(p.id); render(); }; }
      else { btn.textContent = 'Install'; btn.onclick = function () { S.install(p.id); render(); }; }
      card.appendChild(btn);
      wrap.appendChild(card);
    });
  }

  var BOARD_GAME = 'pinball', BOARD_SPLICE = 'all';
  function renderBoard() {
    var games = S.games(); var score = (games[BOARD_GAME] && games[BOARD_GAME].best) || 0;
    var rows = S.board(BOARD_GAME, score, BOARD_SPLICE);
    var tb = $('board-body'); if (!tb) return;
    tb.innerHTML = ''; var max = rows.length ? rows[0].score : 1;
    rows.forEach(function (r, i) {
      var row = el('div', 'board-row' + (r.you ? ' you' : ''));
      row.innerHTML = '<span class="b-rank">' + (i + 1) + '</span><span class="b-name" style="color:' + (r.you ? '#fff' : r.col) + '">' + esc(r.name) + (r.you ? ' (you)' : r.ai ? ' ✺' : '') + '</span><span class="b-score">' + r.score.toLocaleString() + '</span>';
      var bar = el('div', 'b-bar'); bar.style.width = (r.score / Math.max(1, max) * 100) + '%'; bar.style.background = r.col;
      row.appendChild(bar); tb.appendChild(row);
    });
  }

  function renderAgents() {
    var list = $('agent-list'); if (!list) return; var agents = S.agents();
    list.innerHTML = '';
    if (!agents.length) { list.innerHTML = '<div class="empty">No rivals spawned yet. The AI Agent Bay sits idle.</div>'; return; }
    agents.forEach(function (a) {
      var row = el('div', 'agent-row');
      row.innerHTML = '<span class="agent-dot"></span><span class="agent-name">' + esc(a.name) + '</span><span class="agent-game">' + esc(a.game) + '</span><span class="agent-xp">' + (a.xp || 0) + ' xp</span><span class="agent-wins">' + (a.wins || 0) + 'w</span>';
      var kill = el('button', 'agent-kill'); kill.textContent = '✕'; kill.onclick = function () { S.removeAgent(a.id); render(); };
      row.appendChild(kill); list.appendChild(row);
    });
  }

  function renderWallet() {
    var w = S.wallet(); if (!w) return;
    $('w-addr').textContent = w.addr; $('w-kdb').textContent = Math.round(w.kdb).toLocaleString();
    $('w-sol').textContent = w.sol + ' SOL'; $('w-algo').textContent = w.algo + ' ALGO';
  }

  function renderChallenges() {
    var wrap = $('challenge-list'); if (!wrap) return;
    wrap.innerHTML = '';
    S.challenges().forEach(function (c) {
      var row = el('div', 'challenge' + (c.done ? ' done' : ''));
      row.innerHTML = '<span class="ch-check">' + (c.done ? '✓' : '○') + '</span><span class="ch-name">' + esc(c.name) + '</span><span class="ch-xp">+' + c.xp + '</span>';
      var desc = el('div', 'ch-desc'); desc.textContent = c.desc; row.appendChild(desc);
      if (!c.done) { row.style.cursor = 'pointer'; row.onclick = function () { S.completeChallenge(c.id); render(); }; }
      wrap.appendChild(row);
    });
  }

  function renderIntegrations() {
    var wrap = $('integrations'); if (!wrap) return;
    wrap.innerHTML = '';
    S.integrations().forEach(function (it) {
      var row = el('div', 'int-row');
      row.innerHTML = '<span class="int-dot ' + it.status + '"></span><span class="int-name">' + esc(it.name) + '</span><span class="int-status">' + esc(it.status) + '</span><span class="int-note">' + esc(it.note) + '</span>';
      wrap.appendChild(row);
    });
  }

  // ---- actions ------------------------------------------------------------
  function spawnAgent() {
    var names = ['Vex', 'Nova', 'Rook', 'Iris', 'Echo', 'Zeph', 'Kai', 'Ronin', 'Lux', 'Onyx'];
    var games = ['pinball', 'darts', 'orbital', 'puzzles'];
    S.spawnAgent(names[Math.floor(Math.random() * names.length)], games[Math.floor(Math.random() * games.length)], 0.3 + Math.random() * 0.6);
    render();
  }
  function placeWager() {
    var amt = Math.round(S.profile().credits * 0.1);
    if (amt < 10) { flash('Not enough KDB to wager.'); return; }
    var r = S.wager(amt, 0.5, 'manual stake');
    flash(r.win ? ('🏆 Won ' + r.payout + ' KDB!') : ('Lost ' + amt + ' KDB'));
    render();
  }
  function simScore() {
    var games = ['pinball', 'darts', 'orbital', 'puzzles'], g = games[Math.floor(Math.random() * games.length)];
    var sc = Math.round(500 + Math.random() * 20000);
    S.track(g, 'score', sc);
    flash('Tracked ' + sc.toLocaleString() + ' on ' + g);
    render();
  }
  function flash(msg) {
    var t = $('toast'); if (!t) return; t.textContent = msg; t.classList.add('show');
    clearTimeout(flash._t); flash._t = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }
  function cycleSkin() {
    var ss = S.skins(), cur = S.profile().skin, idx = ss.findIndex(function (s) { return s.id === cur; });
    S.skin(ss[(idx + 1) % ss.length].id); render();
  }

  // ---- boot ---------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    applySkin(); render();
    S.BUS.on('all', render);
    // bind buttons
    if ($('btn-spawn')) $('btn-spawn').onclick = spawnAgent;
    if ($('btn-wager')) $('btn-wager').onclick = placeWager;
    if ($('btn-sim')) $('btn-sim').onclick = simScore;
    if ($('btn-skin')) $('btn-skin').onclick = cycleSkin;
    if ($('btn-clear-agents')) $('btn-clear-agents').onclick = function () { S.clearAgents(); render(); };
    // board controls
    [['pinball', 'pin'], ['darts', 'dart'], ['orbital', 'orb'], ['puzzles', 'puz']].forEach(function (g) {
      var b = $('board-' + g[1]); if (b) b.onclick = function () { BOARD_GAME = g[0]; render(); };
    });
    [['all', 'b-all'], ['week', 'b-week'], ['day', 'b-day']].forEach(function (s) {
      var b = $(s[1]); if (b) b.onclick = function () { BOARD_SPLICE = s[0]; render(); };
    });
    // agent tick loop (rivals grind)
    setInterval(function () { S.tickAgents(); if ($('agent-list')) render(); }, 4000);
    window.addEventListener('resize', drawConstellation);
  });
})();
