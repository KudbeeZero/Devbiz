/* =====================================================================
 * Kudbee Leaderboard — public/app.js
 * Wires the page: account state, metric tabs, standings, and a one-click
 * "publish my Kudbee Darts stats" that reads the same-origin local profile
 * the game saves (localStorage 'kd.profile.v1') and submits it.
 * ===================================================================== */
(function () {
  'use strict';

  var METRICS = [
    { key: 'rating', label: 'Rating' },
    { key: 'bestCheckout', label: 'Best Checkout' },
    { key: 'total180s', label: '180s' },
    { key: 'wins', label: 'Wins' },
    { key: 'bestStreak', label: 'Best Streak' },
  ];
  var current = 'rating';
  var lb = null;

  var el = function (id) { return document.getElementById(id); };
  function toast(msg) {
    var t = el('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---- Read the local Kudbee Darts profile -> leaderboard metrics ----
  function readDartsProfile() {
    try {
      var raw = localStorage.getItem('kd.profile.v1');
      if (!raw) return null;
      var d = JSON.parse(raw);
      var x01 = (d.stats && d.stats.x01) || {};
      var cri = (d.stats && d.stats.cricket) || {};
      var wins = (x01.won || 0) + (cri.won || 0);
      // Mirror the in-game rating formula so the page and game agree.
      var rating = 1180 + (d.level || 1) * 38 + (d.ladderRank || 0) * 150
                 + (d.bestStreak || 0) * 22 + wins * 6;
      return {
        name: null,
        level: d.level || 1,
        metrics: {
          rating: rating,
          bestCheckout: x01.bestCheckout || 0,
          total180s: x01.total180s || 0,
          wins: wins,
          bestStreak: d.bestStreak || 0,
        },
      };
    } catch (e) { return null; }
  }

  // ---- Account UI ----------------------------------------------------
  function renderAccount() {
    var box = el('account');
    box.innerHTML = '';
    var badge = el('modeBadge');
    if (lb.mode() === 'clerk') { badge.textContent = 'Live accounts'; badge.className = 'mode-badge live'; }
    else { badge.textContent = 'Demo mode'; badge.className = 'mode-badge demo'; }

    var u = lb.user();
    if (u) {
      var chip = document.createElement('div'); chip.className = 'chip';
      var av = document.createElement('div'); av.className = 'avatar';
      av.textContent = (u.name || '?').charAt(0).toUpperCase();
      var nm = document.createElement('span'); nm.textContent = u.name + (u.demo ? '' : '');
      chip.appendChild(av); chip.appendChild(nm);
      var out = document.createElement('button'); out.className = 'btn ghost'; out.textContent = 'Sign out';
      out.onclick = function () { lb.signOut().then(refreshAll); };
      box.appendChild(chip); box.appendChild(out);
    } else {
      var inb = document.createElement('button'); inb.className = 'btn'; inb.textContent = 'Sign in';
      inb.onclick = function () { lb.signIn().then(refreshAll); };
      box.appendChild(inb);
    }
  }

  // ---- Tabs ----------------------------------------------------------
  function renderTabs() {
    var box = el('tabs'); box.innerHTML = '';
    METRICS.forEach(function (m) {
      var b = document.createElement('button');
      b.className = 'tab' + (m.key === current ? ' active' : '');
      b.textContent = m.label;
      b.onclick = function () { current = m.key; renderTabs(); loadBoard(); };
      box.appendChild(b);
    });
  }

  // ---- Standings -----------------------------------------------------
  function loadBoard() {
    var rows = el('rows');
    lb.leaderboard(current, 50).then(function (data) {
      if (!data.entries || !data.entries.length) {
        rows.innerHTML = '<div class="empty">No scores yet — be the first to publish!</div>';
        return;
      }
      rows.innerHTML = '';
      data.entries.forEach(function (e) {
        var row = document.createElement('div'); row.className = 'row' + (e.you ? ' you' : '');
        var rank = document.createElement('div');
        rank.className = 'rank' + (e.rank <= 3 ? ' g' + e.rank : '');
        rank.textContent = '#' + e.rank;
        var name = document.createElement('div'); name.className = 'pname';
        name.appendChild(document.createTextNode(e.name));
        if (e.you) { var tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'YOU'; name.appendChild(tag); }
        var val = document.createElement('div'); val.className = 'pval';
        val.textContent = (current === 'bestCheckout' && !e.value) ? '—' : e.value;
        row.appendChild(rank); row.appendChild(name); row.appendChild(val);
        rows.appendChild(row);
      });
    }).catch(function (err) {
      rows.innerHTML = '<div class="empty">Couldn\'t load standings (' + (err.message || 'error') + ').</div>';
    });
  }

  // ---- Publish panel -------------------------------------------------
  var profile = null;
  function renderPublish() {
    profile = readDartsProfile();
    var grid = el('statgrid'); grid.innerHTML = '';
    var hint = el('publishHint');
    if (!profile) {
      hint.textContent = 'No local Kudbee Darts profile found yet. Play a match first, then come back to publish.';
      el('publishBtn').disabled = true; el('publishBtn').style.opacity = .5;
      return;
    }
    hint.textContent = 'From your local profile (level ' + profile.level + '). Publishing keeps your best-ever values.';
    var m = profile.metrics;
    [['Rating', m.rating], ['Best checkout', m.bestCheckout || '—'], ['180s', m.total180s], ['Wins', m.wins], ['Best streak', m.bestStreak]]
      .forEach(function (pair) {
        var s = document.createElement('div'); s.className = 'stat';
        s.innerHTML = '<div class="k">' + pair[0] + '</div><div class="v">' + pair[1] + '</div>';
        grid.appendChild(s);
      });
  }

  function publish() {
    if (!profile) return;
    if (!lb.isSignedIn()) {
      lb.signIn().then(function () { renderAccount(); if (lb.isSignedIn()) doSubmit(); });
      return;
    }
    doSubmit();
  }
  function doSubmit() {
    var u = lb.user();
    var name = u ? u.name : null;
    el('publishStatus').textContent = 'Publishing…';
    lb.submit(name, profile.metrics).then(function (res) {
      var rank = res.ranks && res.ranks.rating;
      el('publishStatus').textContent = rank ? ('Published! You are #' + rank + ' by rating.') : 'Published!';
      toast('Stats published to the Bullseye League 🎯');
      loadBoard();
    }).catch(function (err) {
      el('publishStatus').textContent = 'Failed: ' + (err.message || 'error');
    });
  }

  function refreshAll() { renderAccount(); renderPublish(); loadBoard(); }

  // ---- Boot ----------------------------------------------------------
  var cfg = window.KD_LB_CONFIG || {};
  var back = document.querySelector('.back');
  if (back && cfg.GAME_URL) back.setAttribute('href', cfg.GAME_URL);

  KDLeaderboard.create(cfg).then(function (client) {
    lb = client;
    renderTabs();
    el('publishBtn').onclick = publish;
    refreshAll();
  });
})();
