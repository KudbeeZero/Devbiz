/* =====================================================================
 * Kudbee Archery — share.js
 * SHARING: every win makes a 1200 x 630 brag card painted from the game's own
 * art (the world's cartoon map backdrop, the results panel, stars, cups,
 * medals, coins). Phones hand the picture straight to the share sheet;
 * elsewhere a SHARE screen previews it with X / Facebook / WhatsApp / copy /
 * save. The link in every share is a little landing page per world, cup,
 * daily, tour or trophy (s/<slug>/) whose og:image is the same card without
 * the personal numbers (tools/share-cards.mjs renders those), so a pasted
 * link unfurls with the right picture too.
 * ===================================================================== */

KAR.Share = {
  SITE: 'https://devbiz.kudbee.workers.dev',
  PATH: '/games/kudbee-archery/',
  W: 1200, H: 630,
  // the landing pages (one card image each, in /assets/og/archery/<slug>.jpg)
  SLUGS: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'cup-bronze', 'cup-silver', 'cup-gold', 'daily', 'champion', 'trophy'],
  CUP_SLUG: ['cup-bronze', 'cup-silver', 'cup-gold'],
  url(slug) { return this.SITE + this.PATH + (slug ? 's/' + slug + '/' : 'index.html'); },

  // the landing page's own card: the same layout with the challenge instead of a score
  generic(slug) {
    const n = KAR.TOUR.length, w = /^w(\d)$/.exec(slug);
    if (w) {
      const v = +w[1] - 1, V = KAR.VENUES[v], L = KAR.TOUR.filter(t => t.v === v), boss = L.find(t => t.boss);
      return { v, ribbon: 'WORLD ' + (v + 1), col: 'yellow', big: V.name, bigSize: 64, line1: L.length + ' LEVELS' + (boss ? '  ·  BOSS: ' + boss.name : ''), line2: 'CAN YOU 3-STAR IT?', icon: v >= 5 ? 'coin' : 'target' };
    }
    const c = this.CUP_SLUG.indexOf(slug);
    if (c >= 0) return { v: [1, 2, 3][c], ribbon: 'THE CUP', col: 'yellow', big: KAR.CUPS[c].name, bigSize: 70, line1: '8 ARCHERS  ·  3 KNOCKOUT ROUNDS', line2: 'BEAT ' + KAR.RIVALS.length + ' RIVALS TO LIFT IT', icon: 'cup', tier: c };
    if (slug === 'daily') return { v: 4, ribbon: 'DAILY CHALLENGE', col: 'green', big: 'BALLOON POP', bigSize: 70, line1: 'THE SAME BALLOONS FOR EVERYONE TODAY', line2: 'POST YOUR SCORE  ·  BEAT YOUR FRIENDS', icon: 'balloon' };
    if (slug === 'champion') return { v: 2, ribbon: 'TOUR CHAMPION', col: 'green', big: n + ' LEVELS', bigSize: 80, line1: KAR.VENUES.length + ' WORLDS  ·  ' + KAR.TOUR.filter(t => t.boss).length + ' BOSSES BEATEN', line2: 'CAN YOU FINISH THE TOUR?', icon: 'crown' };
    if (slug === 'trophy') return { v: 0, ribbon: 'TROPHY WON', col: 'yellow', big: KAR.ACH.length + ' TROPHIES', bigSize: 70, line1: 'BADGES FOR THE LONG HAUL', line2: 'HOW MANY CAN YOU COLLECT?', icon: 'medal' };
    return { v: 2, ribbon: 'KUDBEE ARCHERY', col: 'green', big: n + ' LEVELS', bigSize: 80, line1: KAR.VENUES.length + ' WORLDS  ·  BOSSES  ·  THE CUP', line2: 'READ THE WIND  ·  HIT THE GOLD', icon: 'target' };
  },

  // ---- the card ----
  // info: { v (world backdrop), ribbon, col, big, bigSize, line1, line2, stars (0..3 or undefined), icon, tier }
  card(info) {
    const cv = document.createElement('canvas'); cv.width = this.W; cv.height = this.H;
    const ctx = cv.getContext('2d'), R = KAR.Render, U = KAR.UI;
    // the game's 960 x 640 stage, widened to the card's 1.9:1 the way wide screens are (XL / XW)
    const s = this.H / R.H, XW = this.W / s, XL = 480 - XW / 2, keep = { XL: R.XL, XW: R.XW, res: R.res, map: R._mapC, venue: R.venue };
    R.XL = XL; R.XW = XW; R.res = 1; R._mapC = null;
    try {
      ctx.setTransform(s, 0, 0, s, -XL * s, 0);
      R.mapScene(ctx, info.v | 0, 7.5);
      this._paint(ctx, info, XL, XW);
    } finally {
      if (R._mapC) R.dropMap();
      R.XL = keep.XL; R.XW = keep.XW; R.res = keep.res; R._mapC = keep.map; R.venue = keep.venue;
    }
    return cv;
  },
  _paint(ctx, info, XL, XW) {
    const U = KAR.UI, R = KAR.Render, XR = XL + XW;
    // the title, top left, like the game's menu
    U.bubble(ctx, 'KUDBEE', XL + 150, 66, 36, '#ffffff', '#cfe9ff', -0.04);
    U.bubble(ctx, 'ARCHERY', XL + 150, 128, 58, '#fff27a', '#ff9a1f', -0.04);
    // the results panel
    U.panel(ctx, 250, 150, 460, 360, info.col === 'red' ? 'red' : 'blue');
    this._ribbon(ctx, 480, 112, info.ribbon, info.col || 'green');
    const st = info.stars, hasStars = st !== undefined && st !== null;
    U.fit(ctx, String(info.big), 480, hasStars ? 290 : 300, info.bigSize || 96, '#ffffff', 420);
    if (hasStars) for (let i = 0; i < 3; i++) U.star(ctx, 480 + (i - 1) * 84, 352 - (i === 1 ? 14 : 0), i === 1 ? 40 : 32, i < st, 1);
    if (info.line1) U.fit(ctx, info.line1, 480, hasStars ? 430 : 386, 26, '#ffe9a8', 420);
    if (info.line2) U.fit(ctx, info.line2, 480, hasStars ? 470 : 440, 22, '#ffffff', 420);
    // the trophy beside it: a cup, a medal, the boss crown, the world's coin or a target
    const ix = XL + (250 - XL) / 2 + 6, iy = 360, k = info.icon;
    if (k === 'cup') U.cupIcon(ctx, ix, iy + 10, 86, KAR.CUPS[info.tier | 0].col);
    else if (k === 'medal') { ctx.save(); ctx.translate(ix, iy); ctx.scale(2.6, 2.6); U.medal(ctx, 0, 0, true); ctx.restore(); }
    else if (k === 'crown') U.crown(ctx, ix, iy, 46);
    else if (k === 'balloon') this._balloons(ctx, ix, iy);
    else if (k === 'coin') R._coin(ctx, ix, iy, 70, 0.4, ['btc', 'sol', 'algo'][(info.v | 0) - 5] || 'k');
    else this._target(ctx, ix, iy, 84);
    this._target(ctx, XR - (XR - 710) / 2 - 6, 340, 96, true);
    // the call to action and where to play
    this._chip(ctx, 480, 548, 'PLAY FREE  ·  ' + this.SITE.replace(/^https:\/\//, '').toUpperCase(), ['#a9ec62', '#2f8a2a']);
  },
  // a ribbon sized to its words (the game's U.ribbon is fixed-width)
  _ribbon(ctx, x, y, text, col) {
    const U = KAR.UI; ctx.save(); ctx.font = '400 38px ' + U.FONT; const w = Math.min(560, Math.max(380, ctx.measureText(text).width + 90)); ctx.restore();
    U.ribbon(ctx, x, y - 30, w, '', col);
    U.fit(ctx, text, x, y + 12, 38, '#ffffff', w - 50);
  },
  _chip(ctx, x, y, t, c) {
    const U = KAR.UI; ctx.save(); ctx.font = '400 24px ' + U.FONT; const w = ctx.measureText(t).width + 48;
    U.rr(ctx, x - w / 2 - 3, y - 3, w + 6, 50, 18); ctx.fillStyle = U.OUT; ctx.fill();
    const gr = ctx.createLinearGradient(0, y, 0, y + 44); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]);
    U.rr(ctx, x - w / 2, y, w, 44, 15); ctx.fillStyle = gr; ctx.fill(); ctx.restore();
    U.text(ctx, t, x, y + 31, 24, '#ffffff', 'center');
  },
  // a target face (and, on the right, an arrow in the X)
  _target(ctx, x, y, r, arrow) {
    const U = KAR.UI, rings = ['#f4f4f0', '#f4f4f0', '#1f2328', '#1f2328', '#2f8fe0', '#2f8fe0', '#e8483a', '#e8483a', '#ffd23f', '#ffd23f'];
    ctx.save(); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 6.283); ctx.fillStyle = U.OUT; ctx.fill();
    rings.forEach((c, i) => { ctx.beginPath(); ctx.arc(x, y, r * (1 - i / 10), 0, 6.283); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = i === 2 || i === 3 ? '#9aa3ad' : 'rgba(0,0,0,0.35)'; ctx.stroke(); });
    ctx.beginPath(); ctx.arc(x, y, r * 0.05, 0, 6.283); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
    if (arrow) {                         // the shaft comes at you a little from the right, fletching out of the face
      const tx = x + r * 0.03, ty = y - r * 0.02, ex = tx + r * 0.55, ey = ty + r * 0.42;
      ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ex, ey); ctx.lineWidth = 10; ctx.strokeStyle = U.OUT; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = '#d9a35c'; ctx.stroke();
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(ex - 18, ey - 14); ctx.lineTo(ex + 8 + (s > 0 ? 14 : 0), ey + 4 - (s > 0 ? 18 : -10)); ctx.lineTo(ex + 6, ey + 6); ctx.closePath(); ctx.fillStyle = s > 0 ? '#ff6b5a' : '#ffe14d'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = U.OUT; ctx.stroke(); }
    }
    ctx.restore();
  },
  _balloons(ctx, x, y) {
    const U = KAR.UI;
    [[-34, 18, '#ff6b5a'], [30, 6, '#7ac7ff'], [0, -36, '#ffe14d']].forEach(([dx, dy, c]) => {
      const bx = x + dx, by = y + dy;
      ctx.beginPath(); ctx.moveTo(bx, by + 44); ctx.quadraticCurveTo(bx + 10, by + 70, bx - 4, by + 96); ctx.lineWidth = 2.5; ctx.strokeStyle = U.OUT; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(bx, by, 34, 42, 0, 0, 6.283); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(bx - 11, by - 14, 8, 12, -0.5, 0, 6.283); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
    });
  },

  // ---- turning a moment into a share: { slug, text, info } ----
  // kind: 'shareLevel' (a tour level / world boss / the whole tour), 'share' (the daily), 'shareCup', 'shareGame',
  // or 'shareTrophy' (with a: the trophy)
  moment(kind, m, g, a) {
    const D = KAR.Store.data;
    if (kind === 'shareGame') return { slug: '', text: 'Kudbee Archery — read the wind, hold your breath, hit the gold. ' + KAR.TOUR.length + ' levels, ' + KAR.VENUES.length + ' worlds, a boss at the end of each. Free in your browser:', info: this.generic('') };
    if (kind === 'shareTrophy' && a) return { slug: 'trophy', text: 'I won the ' + a.name + ' trophy in Kudbee Archery (' + a.text + ') · ' + KAR.achCount(D) + ' of ' + KAR.ACH.length + ' won. How many can you get?',
      info: { v: 0, ribbon: 'TROPHY WON!', col: 'yellow', big: a.name, bigSize: 64, line1: a.text.toUpperCase(), line2: KAR.achCount(D) + ' OF ' + KAR.ACH.length + ' TROPHIES', icon: 'medal' } };
    if (kind === 'shareCup' && m && m.cup && m.winner === 0) {
      const c = D.cup, champ = c && c.won, cp = KAR.CUPS[m.cup.tier], rd = KAR.CUP_ROUNDS[m.cup.round];
      return { slug: this.CUP_SLUG[m.cup.tier], text: champ ? 'I won the ' + cp.name + ' in Kudbee Archery — beat ' + m.cup.name + ' ' + m.total(0) + '–' + m.total(1) + ' in the final. Can you lift it?' : 'I knocked ' + m.cup.name + ' out of the ' + cp.name + ' ' + rd.toLowerCase() + ' in Kudbee Archery, ' + m.total(0) + '–' + m.total(1) + '. Can you go all the way?',
        info: { v: [1, 2, 3][m.cup.tier], ribbon: champ ? cp.name + ' WINNER!' : rd + ' WON!', col: 'green', big: m.total(0) + ' – ' + m.total(1), bigSize: 92, line1: 'BEAT ' + m.cup.name, line2: 'SETS ' + m.sets[0] + ' – ' + m.sets[1] + '  ·  ' + m.dist + ' M', icon: 'cup', tier: m.cup.tier } };
    }
    if (kind === 'shareLevel' && m && m.mode === 'stage' && m.stars() >= 1) {
      const st = m.stars(), V = KAR.VENUES[m.venue], boss = !!m.def.boss, done = g && g.tourDone, star = '★'.repeat(st);
      const text = done ? 'I finished the whole Kudbee Archery tour — all ' + KAR.VENUES.length + ' world bosses beaten! Last one: ' + m.def.name + ', ' + m.total(0) + ' ' + star + '. Can you?'
        : boss ? 'I beat the World ' + (m.venue + 1) + ' boss, ' + m.def.name + ' (' + V.name + '), with ' + m.total(0) + ' ' + star + ' in Kudbee Archery. Can you beat it?'
        : 'I scored ' + m.total(0) + ' on Level ' + (m.lv + 1) + ' · ' + m.def.name + ' ' + star + ' in Kudbee Archery. Can you beat it?';
      return { slug: done ? 'champion' : 'w' + (m.venue + 1), text,
        info: { v: m.venue, ribbon: done ? 'TOUR COMPLETE!' : boss ? 'WORLD ' + (m.venue + 1) + ' COMPLETE!' : 'LEVEL ' + (m.lv + 1) + ' CLEARED!', col: 'green', big: m.total(0), bigSize: 110, stars: st,
          line1: V.name + '  ·  ' + m.def.name, line2: 'OUT OF ' + m.max + '  ·  ' + m.xs(0) + ' X  ·  ' + m.dist + ' M', icon: done || boss ? 'crown' : m.venue >= 5 ? 'coin' : 'target' } };
    }
    // a GHOST CHALLENGE: this round as a link a friend plays against (same level, same wind, your arrows as ghosts)
    if (kind === 'shareChallenge' && m && m.mode === 'stage' && m.over && m.total(0) > 0) {
      const gh = KAR.Ghost.of(m, KAR.Cloud && KAR.Cloud.meta.name); if (!gh) return null;
      const L = m.def, beat = m.ghost && m.total(0) > m.ghost.total;
      return { slug: 'challenge', url: KAR.Ghost.link(gh),
        text: (beat ? 'I just beat ' + m.ghost.name + '\'s ' + m.ghost.total + ' with ' + m.total(0) : 'Beat my ' + m.total(0)) + ' on Level ' + (m.lv + 1) + ' · ' + L.name + ' in Kudbee Archery. Same wind I had, and my arrows land beside yours as ghosts:',
        info: { v: m.venue, ribbon: 'CAN YOU BEAT ME?', col: 'yellow', big: m.total(0), bigSize: 110, stars: gh.stars,
          line1: 'LEVEL ' + (m.lv + 1) + '  ·  ' + L.name, line2: 'SAME WIND  ·  BEAT MY GHOST', icon: L.boss ? 'crown' : m.venue >= 5 ? 'coin' : 'target' } };
    }
    if (kind === 'share' && m && m.daily) {
      const dd = D.daily;
      return { slug: 'daily', text: 'Kudbee Archery · Daily #' + m.daily + ' (' + KAR.Daily.date(m.daily) + ') · ' + m.score + ' pts · ' + m.popped + ' popped · best combo ×' + Math.max(1, Math.min(5, m.bestCombo)) + '. Same balloons for everyone today — beat me:',
        info: { v: 4, ribbon: 'DAILY #' + m.daily, col: 'green', big: m.score, bigSize: 110, line1: m.popped + ' POPPED  ·  BEST COMBO ×' + Math.max(1, Math.min(5, m.bestCombo)), line2: KAR.Daily.date(m.daily) + '  ·  TODAY\'S BEST ' + dd.best, icon: 'balloon' } };
    }
    return null;
  },
  // the card as a PNG file for the share sheet (async; the game makes it as the results card opens, so the tap
  // that shares it still counts as the user's gesture)
  file(cv) {
    return new Promise(res => { try { cv.toBlob(b => res(b ? new File([b], 'kudbee-archery.png', { type: 'image/png' }) : null), 'image/png'); } catch (e) { res(null); } });
  },
  canFiles(f) { try { return !!(f && navigator.canShare && navigator.share && navigator.canShare({ files: [f] })); } catch (e) { return false; } },
  // where the SHARE screen's buttons go (a new tab each)
  intent(net, text, url) {
    const e = encodeURIComponent;
    if (net === 'x') return 'https://twitter.com/intent/tweet?text=' + e(text) + '&url=' + e(url);
    if (net === 'fb') return 'https://www.facebook.com/sharer/sharer.php?u=' + e(url);
    if (net === 'wa') return 'https://wa.me/?text=' + e(text + ' ' + url);
    return url;
  },
};
