/* =====================================================================
 * Kudbee Birds — game.js
 * The controller: fixed-timestep loop (frame-rate independent), pointer /
 * touch / keyboard input, screen flow (menu → select → play → won/lost),
 * and the juice (shake, slow-mo, particles, sound) wired to world events.
 * Logical canvas is 960x600; CSS scales it, pointer coords are mapped back.
 * ===================================================================== */

KAB.Game = class {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = KAB.Render.W * this.dpr;
    canvas.height = KAB.Render.H * this.dpr;
    this.reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    KAB.Store.load();
    this.audio = new KAB.Audio();
    this.particles = new KAB.Particles();
    this.world = new KAB.World(this._handlers());

    this.screen = 'menu';          // menu | select | play | paused | won | lost
    this.time = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.shake = 0;
    this.shownScore = 0;
    this.hintT = 0;
    this.overlayT = 0;
    this.pendingEnd = null;
    this.starSfx = 0;
    this.newBest = false;
    this.focusIdx = 0;
    this.focusPending = true;
    this.aim = null;               // pull position while dragging
    this.keyAim = { on: false, angle: 38, pull: 82 };
    this.fxBudget = 0;
    this.last = 0;

    this.world.load(0);
    this._bindInput();
    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  // ---- flow ---------------------------------------------------------------
  startLevel(i) {
    i = Math.max(0, Math.min(KAB.LEVELS.length - 1, i));
    this.world.load(i);
    this.particles.clear();
    this.screen = 'play';
    this.shownScore = 0;
    this.hintT = 6;
    this.aim = null;
    this.keyAim.on = false;
    this.pendingEnd = null;
    this.newBest = false;
    this.slowT = 0;
    this.acc = 0;
    this.focusIdx = -1;
    this.focusPending = true;
  }

  setScreen(s) {
    this.screen = s;
    this.overlayT = 0;
    this.focusPending = true;
    this.starSfx = 0;
  }

  continueIndex() {
    for (let i = 0; i < KAB.LEVELS.length; i++) if (KAB.Store.best(i).stars === 0) return i;
    return 0;
  }

  activate(id) {
    this.audio.ensure();
    this.audio.click();
    if (id === 'play') this.startLevel(this.continueIndex());
    else if (id === 'levels') this.setScreen('select');
    else if (id === 'back') this.setScreen('menu');
    else if (id.indexOf('lvl') === 0) this.startLevel(parseInt(id.slice(3), 10));
    else if (id === 'resume') this.screen = 'play';
    else if (id === 'pause') this.setScreen('paused');
    else if (id === 'restart' || id === 'retry') this.startLevel(this.world.index);
    else if (id === 'next') this.startLevel(this.world.index + 1);
    else if (id === 'mute') this.audio.setMuted(!this.audio.muted);
  }

  togglePause() {
    if (this.screen === 'play') { this.aim = null; this.setScreen('paused'); }
    else if (this.screen === 'paused') this.screen = 'play';
  }

  // ---- world events -> feedback ---------------------------------------------
  _handlers() {
    const g = this;
    return {
      launch(b, speed) {
        g.audio.launch(speed);
        g.particles.ring(KAB.SLING.x, KAB.SLING.y, KAB.BIRDS[b.data.type].color, 50, 0.3, 3);
        g.particles.spark(b.x, b.y, KAB.BIRDS[b.data.type].color, 10, 220, 0.4);
        g._addShake(2);
        g.hintT = 0;
      },
      ability(kind, x, y, b) {
        g.audio.ability(kind);
        const c = KAB.BIRDS[b.data.type].color;
        g.particles.ring(x, y, c, kind === 'slam' ? 70 : 52, 0.35, 4);
        g.particles.spark(x, y, c, kind === 'split' ? 22 : 16, 260, 0.5);
        g._addShake(kind === 'slam' ? 3 : 1.5);
      },
      impact(a, b, closing, x, y) {
        if (g.fxBudget <= 0) return;
        g.fxBudget--;
        const other = a.kind === 'bird' ? b : a;
        const mat = other.kind === 'ground' ? 'stone' : other.kind === 'enemy' ? 'wood' : other.mat;
        const s = Math.min(1, closing / 700);
        g.audio.hit(mat, s);
        const col = other.kind === 'block' ? KAB.Mat[other.mat].color : '#ffffff';
        g.particles.spark(x, y, col, 2 + Math.round(s * 6), 120 + s * 200, 0.4);
        g._addShake(s * 3.2);
        if (a.kind === 'bird' && closing > 200 && Math.hypot(a.vx, a.vy) > 250) g.particles.ring(x, y, '#ffffff', 22 + s * 24, 0.25, 2);
      },
      destroy(b) {
        g.audio.shatter(b.mat);
        const col = KAB.Mat[b.mat].color;
        g.particles.shards(b.x, b.y, col, Math.min(16, 6 + Math.round(b.w * b.h / 260)), Math.max(b.w, b.h) * 0.5);
        if (b.mat === 'glass') g.particles.shards(b.x, b.y, '#ffffff', 5, 12);
        if (b.mat !== 'glass') g.particles.smoke(b.x, b.y, 3, '#8aa0c8');
        g._addShake(2.5);
      },
      kill(e, chain) {
        g.audio.kill();
        const col = KAB.ENEMIES[e.data.type].color;
        const x = Math.min(920, Math.max(40, e.x)), y = Math.min(520, e.y);
        g.particles.ring(x, y, col, 70, 0.5, 4);
        g.particles.spark(x, y, col, 26, 280, 0.7);
        g.particles.spark(x, y, '#ffe9a8', 12, 180, 0.6);
        g.particles.smoke(x, y, 5, '#cbbad8');
        g._addShake(4);
      },
      explode(x, y, R) {
        g.audio.boom();
        g.particles.ring(x, y, '#ffb02e', R, 0.5, 6);
        g.particles.ring(x, y, '#ff5d3c', R * 0.7, 0.4, 4);
        g.particles.spark(x, y, '#ffb02e', 44, 460, 0.8);
        g.particles.smoke(x, y, 10, '#6b5a5a');
        g._addShake(14);
      },
      score(points, x, y, kind) {
        const px = Math.min(920, Math.max(40, x)), py = Math.min(515, y);
        if (kind === 'enemy') g.particles.popup(px, py - 18, '+' + KAB.UI.fmt(points), '#ff9ac9', 24);
        else if (kind === 'chain') g.particles.popup(px, py - 10, 'CHAIN +' + KAB.UI.fmt(points), '#ffd34d', 18);
        else g.particles.popup(px, py - 8, '+' + KAB.UI.fmt(points), '#ffffff', 14);
      },
      lastKill() {
        if (!g.reduceMotion) g.slowT = 0.9;
      },
      birdGone(b) {
        g.particles.spark(b.x, b.y, KAB.BIRDS[b.data.type].color, 8, 120, 0.4);
      },
      win(stars, score, bonus) {
        g.newBest = KAB.Store.record(g.world.index, stars, score);
        g.pendingEnd = { screen: 'won', t: 0.7 };
        g.audio.win();
      },
      lose() {
        g.pendingEnd = { screen: 'lost', t: 0.8 };
        g.audio.lose();
      },
    };
  }

  _addShake(v) { if (!this.reduceMotion) this.shake = Math.min(14, this.shake + v); }

  // ---- input -----------------------------------------------------------------
  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * KAB.Render.W / r.width, y: (e.clientY - r.top) * KAB.Render.H / r.height };
  }

  _clampAim(px, py) {
    const S = KAB.SLING;
    let dx = px - S.x, dy = py - S.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > KAB.MAX_PULL) { dx = dx / d * KAB.MAX_PULL; dy = dy / d * KAB.MAX_PULL; }
    const r = this.world.current ? KAB.BIRDS[this.world.current].r : 12;
    return { x: S.x + dx, y: Math.min(S.y + dy, KAB.GROUND_Y - r - 3) };
  }

  _bindInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', e => this._onDown(e));
    c.addEventListener('pointermove', e => this._onMove(e));
    c.addEventListener('pointerup', e => this._onUp(e));
    c.addEventListener('pointercancel', () => { this.aim = null; });
    c.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this._onKey(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.screen === 'play') this.togglePause(); this.audio.suspend(); }
      else this.audio.resume();
    });
    window.addEventListener('blur', () => { if (this.screen === 'play') this.togglePause(); });
  }

  _firstGesture() {
    if (this.audio.ensure()) this.audio.startMusic();
  }

  _onDown(e) {
    this._firstGesture();
    const p = this._pt(e);
    const i = KAB.UI.hit(p.x, p.y);
    if (i >= 0) { e.preventDefault(); this.activate(KAB.UI.buttons[i].id); return; }
    if (this.screen !== 'play') return;
    const w = this.world;
    if (w.state === 'ready' && w.current) {
      const S = KAB.SLING;
      if (Math.hypot(p.x - S.x, p.y - S.y) < 95) {
        this.aim = this._clampAim(p.x, p.y);
        this.keyAim.on = false;
        try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
    } else if (w.state === 'flying') w.useAbility();
  }

  _onMove(e) {
    const p = this._pt(e);
    if (this.aim) {
      const prev = this.aim;
      this.aim = this._clampAim(p.x, p.y);
      const t = Math.min(1, Math.hypot(this.aim.x - KAB.SLING.x, this.aim.y - KAB.SLING.y) / KAB.MAX_PULL);
      if (Math.hypot(this.aim.x - prev.x, this.aim.y - prev.y) > 3) this.audio.stretch(t);
      return;
    }
    const i = KAB.UI.hit(p.x, p.y);
    if (i >= 0) this.focusIdx = i;
    else if (this.screen === 'play') this.focusIdx = -1;
    this.canvas.style.cursor = i >= 0 ? 'pointer' : (this.screen === 'play' && this.world.state === 'ready' && Math.hypot(p.x - KAB.SLING.x, p.y - KAB.SLING.y) < 95 ? 'grab' : 'default');
  }

  _onUp(e) {
    if (!this.aim) return;
    const a = this.aim;
    this.aim = null;
    if (!this.world.fire(a.x, a.y)) this.audio.click();
  }

  _onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const overlay = this.screen !== 'play';
    this._firstGesture();
    if (k === 'm' || k === 'M') { this.audio.setMuted(!this.audio.muted); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') {
      e.preventDefault();
      if (this.screen === 'play' || this.screen === 'paused') this.togglePause();
      else if (this.screen === 'select') this.setScreen('menu');
      return;
    }
    if ((k === 'r' || k === 'R') && (this.screen === 'play' || this.screen === 'paused' || this.screen === 'won' || this.screen === 'lost')) { this.startLevel(this.world.index); return; }
    if ((k === 'n' || k === 'N') && this.screen === 'won' && this.world.index < KAB.LEVELS.length - 1) { this.startLevel(this.world.index + 1); return; }

    if (overlay) {
      const n = KAB.UI.buttons.length;
      if (!n) return;
      const sel = this.screen === 'select';
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'Tab') {
        e.preventDefault();
        const step = sel && k === 'ArrowDown' ? KAB.LEVELS.length / 2 : 1;
        this.focusIdx = Math.min(n - 1, (this.focusIdx < 0 ? -1 : this.focusIdx) + step);
      } else if (k === 'ArrowLeft' || k === 'ArrowUp') {
        e.preventDefault();
        const step = sel && k === 'ArrowUp' ? KAB.LEVELS.length / 2 : 1;
        this.focusIdx = Math.max(0, this.focusIdx - step);
      } else if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        const b = KAB.UI.buttons[this.focusIdx];
        if (b && !b.disabled) this.activate(b.id);
      }
      return;
    }

    const w = this.world;
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (w.state === 'flying') w.useAbility();
      else if (w.state === 'ready' && w.current) {
        const p = this._keyPull();
        w.fire(p.x, p.y);
        this.keyAim.on = false;
      }
    } else if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      if (w.state !== 'ready') return;
      const a = this.keyAim;
      a.on = true;
      if (k === 'ArrowUp') a.angle = Math.min(85, a.angle + 2);
      if (k === 'ArrowDown') a.angle = Math.max(3, a.angle - 2);
      if (k === 'ArrowRight') a.pull = Math.min(KAB.MAX_PULL, a.pull + 3);
      if (k === 'ArrowLeft') a.pull = Math.max(30, a.pull - 3);
    }
  }

  _keyPull() {
    const a = this.keyAim, rad = a.angle * Math.PI / 180;
    return this._clampAim(KAB.SLING.x - Math.cos(rad) * a.pull, KAB.SLING.y + Math.sin(rad) * a.pull);
  }

  // ---- loop ------------------------------------------------------------------
  _frame(ts) {
    requestAnimationFrame(this._frame);
    const dt = Math.min(0.1, (ts - this.last) / 1000) || 0;
    this.last = ts;
    this._update(dt);
    this._render();
  }

  _update(dt) {
    this.time += dt;
    if (this.slowT > 0) { this.slowT -= dt; this.timeScale = this.slowT > 0 ? 0.3 : 1; } else this.timeScale = 1;
    const sdt = dt * this.timeScale;
    this.fxBudget = 6;

    if (this.screen === 'play') {
      this.acc += sdt;
      let n = 0;
      while (this.acc >= KAB.TICK && n < 5) { this.world.step(); this.acc -= KAB.TICK; n++; }
      if (this.acc > KAB.TICK) this.acc = 0;
      this.hintT = Math.max(0, this.hintT - dt);

      for (const b of this.world.birds) {
        if (b.alive && !b.asleep && Math.abs(b.vx) + Math.abs(b.vy) > 260 && Math.random() < 0.8) this.particles.trail(b.x, b.y, KAB.BIRDS[b.data.type].color);
      }
      if (this.pendingEnd) {
        this.pendingEnd.t -= dt;
        if (this.pendingEnd.t <= 0) { const s = this.pendingEnd.screen; this.pendingEnd = null; this.setScreen(s); }
      }
    }
    if (this.screen === 'won' || this.screen === 'lost') {
      this.overlayT += dt;
      if (this.screen === 'won') {
        const times = [0.5, 0.92, 1.34];
        while (this.starSfx < this.world.stars && this.overlayT > times[this.starSfx]) this.audio.star(this.starSfx++);
      }
    } else this.overlayT += dt;

    this.particles.update(sdt);
    this.shake *= Math.exp(-dt * 9);
    this.shownScore += (this.world.score - this.shownScore) * Math.min(1, dt * 9);
    if (Math.abs(this.world.score - this.shownScore) < 1) this.shownScore = this.world.score;
  }

  _render() {
    const ctx = this.ctx, w = this.world, R = KAB.Render, S = KAB.SLING;
    const th = w.level.theme;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, R.W, R.H);
    ctx.save();
    if (this.shake > 0.15) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    R.drawBackground(ctx, th, w.index, this.time, this.dpr, this.reduceMotion);

    const showWorld = this.screen !== 'menu' && this.screen !== 'select';
    // waiting birds on the ground
    if (showWorld) w.queue.slice(0, 5).forEach((ty, i) => {
      const r = KAB.BIRDS[ty].r;
      R.drawBird(ctx, 78 + i * 38, KAB.GROUND_Y - r - 1, r, ty, 0, 0, this.time, { noGlow: true, blink: (this.time * 0.6 + i * 0.9) % 4 > 3.9 });
    });

    // aim state
    let pull = null;
    if (w.state === 'ready' && w.current) {
      if (this.aim) pull = this.aim;
      else if (this.keyAim.on) pull = this._keyPull();
    }
    const bx = pull ? pull.x : S.x, by = pull ? pull.y : S.y;
    const stretch = pull ? Math.min(1, Math.hypot(bx - S.x, by - S.y) / KAB.MAX_PULL) : 0;

    if (showWorld) R.slingBack(ctx, th.accent, bx, by, stretch);
    if (showWorld && w.state === 'ready' && w.current) {
      const spec = KAB.BIRDS[w.current];
      const look = pull ? Math.atan2(S.y - by, S.x - bx) : -0.2;
      R.drawBird(ctx, bx, by, spec.r, w.current, pull ? look * 0.25 : 0, look, this.time, { blink: !pull && (this.time * 0.8) % 4 > 3.9 });
    }
    if (showWorld) R.slingFront(ctx, th.accent, bx, by, stretch);
    if (showWorld && pull) R.trajectory(ctx, w.preview(bx, by, 80), th.accent, this.time);

    // bodies
    const bodies = showWorld ? w.phys.bodies : [];
    for (const b of bodies) if (b.kind === 'block') R.drawBlock(ctx, b, th.accent);
    for (const b of bodies) if (b.kind === 'enemy') R.drawEnemy(ctx, b, this.time);
    for (const b of bodies) {
      if (b.kind !== 'bird') continue;
      const moving = Math.abs(b.vx) + Math.abs(b.vy) > 30;
      const dir = Math.atan2(b.vy, b.vx);
      const fly = moving && !b.data.touched;
      R.drawBird(ctx, b.x, b.y, b.r, b.data.type, fly ? dir : b.angle, dir, this.time, { blink: b.asleep });
    }

    this.particles.draw(ctx);
    ctx.restore();

    KAB.UI.begin();
    if (this.screen === 'play' || this.screen === 'paused' || this.screen === 'won' || this.screen === 'lost') KAB.UI.hud(ctx, this);
    if (this.screen === 'menu') KAB.UI.menu(ctx, this);
    else if (this.screen === 'select') KAB.UI.select(ctx, this);
    else if (this.screen === 'paused') { KAB.UI.buttons.length = 0; KAB.UI.pause(ctx, this); }
    else if (this.screen === 'won') { KAB.UI.buttons.length = 0; KAB.UI.won(ctx, this); }
    else if (this.screen === 'lost') { KAB.UI.buttons.length = 0; KAB.UI.lost(ctx, this); }

    if (this.focusPending) {
      let i = KAB.UI.buttons.findIndex(b => b.primary && !b.hud);
      if (i < 0 && this.screen === 'select') i = KAB.UI.buttons.findIndex(b => b.id === 'lvl' + this.continueIndex());
      if (i < 0 && this.screen !== 'play') i = KAB.UI.buttons.findIndex(b => !b.disabled && !b.hud);
      this.focusIdx = i;
      this.focusPending = false;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.KABGame = new KAB.Game(document.getElementById('gameCanvas'));
});
