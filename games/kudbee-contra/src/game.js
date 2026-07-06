/* =====================================================================
 * Kudbee Contra — game.js
 * The orchestrator: owns the canvas, the fixed-timestep loop, the state
 * machine (menu / play / pause / gameover / win), the spawn director,
 * collision + damage resolution, pickups, the HUD, and all on-canvas menus.
 *
 * Logical resolution is a fixed 960x600; the canvas is scaled responsively
 * to its container so layout stays crisp and consistent across devices.
 * ===================================================================== */
(function (KC) {
  'use strict';
  const Util = KC.Util;

  const VIEW_W = 960;
  const VIEW_H = 600;

  function Game(opts) {
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.touchRoot = opts.touchRoot || null;
    this.hud = opts.hud || null;       // optional DOM callbacks
    this.debug = false;
    this.autoFire = false;             // mobile: fire continuously without a button

    this.viewW = VIEW_W;
    this.viewH = VIEW_H;
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;

    this.level = KC.Levels.level1;

    // Engine systems.
    this.input = new KC.Input(this.touchRoot);
    this.audio = new KC.Audio();
    this.camera = new KC.Camera(VIEW_W, VIEW_H);
    this.particles = new KC.Particles();
    this.projectiles = new KC.Projectiles();
    this.sprites = new KC.Sprites();
    this.parallax = new KC.Parallax(VIEW_W, VIEW_H, this.sprites);

    this.state = 'menu';
    this.loop = new KC.Loop(this._update.bind(this), this._render.bind(this));

    // Presentation: honor reduced-motion for menu/UI-level animation, keep a
    // menu clock for the cinematic title, and lazy-build the vignette overlay.
    this.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.menuT = 0;
    this._vignette = null;
    this.best = 0;
    try { this.best = parseInt(window.localStorage.getItem('kudbee-contra.best'), 10) || 0; } catch (e) { /* storage unavailable */ }

    this._initRun();
    this._bindMeta();
  }

  // Reset everything for a fresh playthrough.
  Game.prototype._initRun = function () {
    this.camera.setBounds(0, this.level.width);
    this.camera.x = 0;
    this.camera.zoomTo(1);
    this.player = new KC.Player(this);
    this.companion = new KC.Companion(this);
    this.power = 0;
    this.powerMax = 100;
    this.xp = 0;
    this.playerLevel = 1;
    this.xpToNext = 80;
    this.levelFlash = 0;
    this.enemies = [];
    this.pickups = this.level.pickups.map((p) => ({
      kind: p.kind, x: p.x, y: p.y, w: 26, h: 26, phase: Math.random() * 6, taken: false,
    }));
    this.projectiles.clear();
    this.particles.clear();
    this.score = 0;
    this.kills = 0;
    this.runTime = 0;
    this.hurtFx = 0;       // brief red edge flash when the operative takes a hit
    this.scorePop = 0;     // HUD score punch on gain
    this.newBest = false;
    this.lives = this.player.lives;
    this.spawnFlags = this.level.spawns.map(() => false);
    this.boss = null;
    this.bossActive = false;
    this.arenaLocked = false;
    this.reveal = 0;
    this.respawnTimer = 0;
    this.won = false;
    this.winTimer = 0;
  };

  Game.prototype._bindMeta = function () {
    // Toggle debug FPS with backtick.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') this.debug = !this.debug;
      if (e.code === 'KeyM') { this.audio.setEnabled(!this.audio.enabled); }
    });
  };

  Game.prototype.start = function () { this.loop.start(); };

  // ---- State helpers -----------------------------------------------------
  Game.prototype._beginPlay = function () {
    this.audio.unlock();
    this._initRun();
    this.state = 'play';
    this.audio.startMusic(1);
  };

  Game.prototype.restart = function () { this._beginPlay(); };

  Game.prototype.addScore = function (n, x, y) {
    this.score += n;
    this.scorePop = 0.35;
    if (x != null) this.particles.damageNumber(x, y - 10, '+' + n, n >= 1000);
  };

  // Called by enemies/boss on death — feeds the end-of-run stats recap.
  Game.prototype.registerKill = function () { this.kills++; };

  // Persist best score at the end of a run (additive; safe if storage is blocked).
  Game.prototype._endRun = function () {
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
      try { window.localStorage.setItem('kudbee-contra.best', String(this.best)); } catch (e) { /* ignore */ }
    }
  };

  // Charge the OVERDRIVE meter (drives the K9 companion special).
  Game.prototype.addPower = function (n) {
    this.power = Math.min(this.powerMax, this.power + n);
  };

  // Award XP and roll over into level-ups (which buff the operative + K9).
  Game.prototype.addXP = function (n) {
    this.xp += n;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this._levelUp();
    }
  };

  Game.prototype._levelUp = function () {
    this.playerLevel++;
    this.xpToNext = Math.round(this.xpToNext * 1.35);
    this.levelFlash = 1.8;
    // +1 max health (capped) with a small heal; K9 grows stronger each level.
    if (this.player.maxHealth < 12) {
      this.player.maxHealth++;
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 1);
    }
    this.companion.level = this.playerLevel;
    this.audio.powerup();
    this.camera.shake(0.22);
    this.particles.burst(this.player.cx(), this.player.cy(), '#7CFFb2', 26, 280, { glow: true });
  };

  Game.prototype.maybeDropPickup = function (x, y) {
    if (Math.random() < 0.18) {
      this.pickups.push({ kind: 'health', x: x - 13, y: y - 13, w: 26, h: 26, phase: 0, taken: false });
    }
  };

  Game.prototype.onPlayerDeath = function () {
    this.lives--;
    if (this.lives <= 0) {
      this.respawnTimer = 1.6;   // wait then game over
    } else {
      this.respawnTimer = 1.2;   // wait then respawn
    }
  };

  Game.prototype.onBossDefeated = function () {
    this.won = true;
    this.winTimer = 2.2;
  };

  // ===== UPDATE ==========================================================
  Game.prototype._update = function (dt) {
    this.input.poll();
    this.parallax.update(dt);
    this.particles.update(dt);

    if (this.state === 'menu') {
      this.menuT += dt;
      // Cinematic attract-mode: slowly drift the camera through the level so
      // the parallax jungle scrolls behind the logo (skipped for reduced motion).
      if (!this.reducedMotion) {
        const range = Math.max(0, this.level.width - this.viewW);
        const ping = (this.menuT * 26) % (range * 2);
        this.camera.x = ping < range ? ping : range * 2 - ping;
      }
      if (this.input.justPressed('start') || this.input.justPressed('jump') || this.input.justPressed('fire')) {
        this._beginPlay();
      }
      return;
    }
    if (this.state === 'gameover' || this.state === 'win') {
      if (this.input.justPressed('start') || this.input.justPressed('jump')) this._beginPlay();
      // let particles/camera settle
      this.camera.follow(this.camera.x + this.viewW / 2, this.viewH / 2, 0, dt);
      return;
    }
    if (this.state === 'play') {
      if (this.input.justPressed('pause')) { this.state = 'pause'; this.audio.stopMusic(); return; }
    } else if (this.state === 'pause') {
      if (this.input.justPressed('pause') || this.input.justPressed('start')) { this.state = 'play'; this.audio.startMusic(this.bossActive ? 2 : 1); }
      return;
    }

    // ---- Active play ----
    const p = this.player;
    p.update(dt, this.input, this.level);

    this.runTime += dt;
    if (this.levelFlash > 0) this.levelFlash -= dt;
    if (this.hurtFx > 0) this.hurtFx -= dt;
    if (this.scorePop > 0) this.scorePop -= dt;

    // Special: unleash the K9 missile barrage when OVERDRIVE is charged.
    if (this.input.justPressed('special') && this.power >= this.powerMax && !this.companion.active && !p.dead) {
      this.companion.activate();
      this.power = 0;
    }

    // Respawn / game-over sequencing.
    if (p.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        if (this.lives > 0) {
          const safeX = Util.clamp(this.camera.x + this.viewW * 0.3, 40, this.level.width - 80);
          p.respawn(safeX);
        } else {
          this.state = 'gameover';
          this._endRun();
          this.audio.stopMusic();
        }
      }
    }

    // Spawn director.
    this._runSpawns();

    // Update enemies.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, p, this.level);
      if (e.dead) this.enemies.splice(i, 1);
    }

    // Boss.
    if (this.bossActive && this.boss && !this.boss.dead) {
      this.boss.update(dt, p);
    }
    if (this.reveal > 0) {
      this.reveal -= dt;
      if (this.reveal <= 0) this.camera.zoomTo(1);
    }

    // Companion follows + (when active) fires homing missiles at targets.
    var targets = this.enemies;
    if (this.boss && !this.boss.dead && this.bossActive) targets = this.enemies.concat([this.boss]);
    this.companion.update(dt, p, targets);

    // Projectiles + collisions.
    this.projectiles.update(dt, this.level.groundY);
    this._homeMissiles(dt);
    this._resolveCollisions();
    this.projectiles.sweep();

    // Pickups.
    this._updatePickups(dt, p);

    // Camera.
    if (!p.dead) this.camera.follow(p.cx(), p.cy(), p.dir, dt);
    else this.camera.follow(this.camera.x + this.viewW / 2, this.viewH / 2, 0, dt);

    // Win sequence.
    if (this.won) {
      this.winTimer -= dt;
      if (this.winTimer <= 0) { this.state = 'win'; this._endRun(); this.audio.stopMusic(); }
    }

    // Sync DOM HUD if provided.
    if (this.hud) this.hud(this._hudState());
  };

  Game.prototype._runSpawns = function () {
    const rightEdge = this.camera.x + this.viewW;
    for (let i = 0; i < this.level.spawns.length; i++) {
      if (this.spawnFlags[i]) continue;
      const s = this.level.spawns[i];
      if (rightEdge >= s.trigger) {
        this.spawnFlags[i] = true;
        this.enemies.push(new KC.Enemy(this, s.type, s.x, s.y));
      }
    }
    // Boss trigger.
    if (!this.bossActive && rightEdge >= this.level.bossArena.triggerX) {
      this._startBoss();
    }
  };

  Game.prototype._startBoss = function () {
    this.bossActive = true;
    this.arenaLocked = true;
    const a = this.level.bossArena;
    this.camera.setBounds(a.lockMinX, a.lockMaxX);
    this.boss = new KC.Boss(this, a.bossSpawn.x, a.bossSpawn.y);
    this.reveal = 1.6;
    this.camera.zoomTo(1.12);
    this.camera.shake(0.4);
    this.audio.bossAlarm();
    this.audio.startMusic(2);
  };

  Game.prototype._resolveCollisions = function () {
    const active = this.projectiles.pool.active;
    for (let i = 0; i < active.length; i++) {
      const pr = active[i];
      if (pr.dead && !pr.exploded) continue;

      // Grenade airburst → area damage.
      if (pr.exploded && !pr.handled) {
        pr.handled = true;
        this.particles.explosion(pr.x, pr.y, true);
        this.audio.explosion();
        this.camera.shake(0.3);
        this._areaDamage(pr.x, pr.y, 90, 4);
        continue;
      }

      if (pr.friendly) {
        // vs enemies
        for (let j = 0; j < this.enemies.length; j++) {
          const e = this.enemies[j];
          if (Util.aabb(this._prBox(pr), e.box())) {
            if (pr.pierce) {
              if (pr.hit.indexOf(e) !== -1) continue;  // already struck
              e.hurt(pr.damage);
              pr.hit.push(e);
              this.particles.spark(pr.x, pr.y, pr.color);
              // piercing bolts keep going
            } else {
              e.hurt(pr.damage);
              this.particles.spark(pr.x, pr.y, pr.color);
              if (pr.style === 'missile') this._missileBlast(pr.x, pr.y);
              pr.dead = true;
              break;
            }
          }
        }
        // vs boss
        if (!pr.dead && this.boss && !this.boss.dead && this.bossActive) {
          if (Util.aabb(this._prBox(pr), this.boss.box()) && pr.hit.indexOf(this.boss) === -1) {
            this.boss.hurt(pr.damage);
            this.particles.spark(pr.x, pr.y, pr.color);
            if (pr.style === 'missile') this._missileBlast(pr.x, pr.y);
            if (pr.pierce) pr.hit.push(this.boss); else pr.dead = true;
          }
        }
      } else {
        // enemy projectile vs player
        const p = this.player;
        if (!p.dead && Util.aabb(this._prBox(pr), { x: p.x, y: p.y, w: p.w, h: p.h })) {
          p.hurt(pr.damage);
          this.particles.spark(pr.x, pr.y, '#ff5d6d');
          pr.dead = true;
        }
      }
    }
  };

  // Steer active companion missiles toward the nearest target each frame.
  Game.prototype._homeMissiles = function (dt) {
    const active = this.projectiles.pool.active;
    for (let i = 0; i < active.length; i++) {
      const pr = active[i];
      if (pr.dead || pr.style !== 'missile') continue;
      let best = null, bd = Infinity;
      for (let j = 0; j < this.enemies.length; j++) {
        const e = this.enemies[j];
        const d = Util.dist(pr.x, pr.y, e.cx(), e.cy());
        if (d < bd) { bd = d; best = e; }
      }
      if (this.boss && !this.boss.dead && this.bossActive) {
        const d = Util.dist(pr.x, pr.y, this.boss.cx(), this.boss.cy());
        if (d < bd) { bd = d; best = this.boss; }
      }
      if (best) {
        const desired = Math.atan2(best.cy() - pr.y, best.cx() - pr.x);
        const cur = Math.atan2(pr.vy, pr.vx);
        let diff = desired - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = 7 * dt;
        const na = cur + Util.clamp(diff, -turn, turn);
        const sp = Math.hypot(pr.vx, pr.vy);
        pr.vx = Math.cos(na) * sp;
        pr.vy = Math.sin(na) * sp;
      }
      // smoke/spark trail
      this.particles.emit({ x: pr.x, y: pr.y, vx: 0, vy: 0, life: 0.3, size: 3, color: '#ffd34d', glow: true, shrink: true, gravity: 0, drag: 0 });
    }
  };

  Game.prototype._missileBlast = function (x, y) {
    this.particles.explosion(x, y, false);
    this.audio.explosion();
    this.camera.shake(0.18);
    this._areaDamage(x, y, 64, 2);
  };

  Game.prototype._areaDamage = function (x, y, radius, dmg) {
    for (let j = 0; j < this.enemies.length; j++) {
      const e = this.enemies[j];
      if (Util.dist(x, y, e.cx(), e.cy()) < radius) e.hurt(dmg);
    }
    if (this.boss && !this.boss.dead && this.bossActive && Util.dist(x, y, this.boss.cx(), this.boss.cy()) < radius + 40) {
      this.boss.hurt(dmg);
    }
  };

  Game.prototype._prBox = function (pr) { return { x: pr.x - pr.radius, y: pr.y - pr.radius, w: pr.radius * 2, h: pr.radius * 2 }; };

  Game.prototype._updatePickups = function (dt, p) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.phase += dt;
      if (Util.aabb({ x: pk.x, y: pk.y, w: pk.w, h: pk.h }, { x: p.x, y: p.y, w: p.w, h: p.h })) {
        if (pk.kind === 'health') {
          p.health = Math.min(p.maxHealth, p.health + 2);
        } else {
          p.weaponKey = pk.kind;   // spread | plasma | laser
        }
        this.audio.powerup();
        this.particles.burst(pk.x + pk.w / 2, pk.y + pk.h / 2, pk.kind === 'health' ? '#4dff9e' : '#ffd34d', 14, 200, { glow: true });
        this.pickups.splice(i, 1);
      }
    }
  };

  Game.prototype._hudState = function () {
    return {
      health: this.player.health, maxHealth: this.player.maxHealth,
      lives: this.lives, score: this.score,
      weapon: this.player.weapon().name,
      boss: this.bossActive && this.boss && !this.boss.dead ? this.boss.health / this.boss.maxHealth : null,
    };
  };

  // ===== RENDER ==========================================================
  Game.prototype._render = function () {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    // Background parallax (screen space, reads camera internally).
    this.parallax.drawBack(ctx, this.camera);

    // World space.
    ctx.save();
    this.camera.apply(ctx);

    this._drawProps(ctx);
    this._drawPlatforms(ctx);

    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      ctx.save();
      ctx.translate(pk.x, pk.y);
      this.sprites.drawPickup(ctx, pk.w, pk.h, pk.kind, pk.phase);
      ctx.restore();
    }

    for (let i = 0; i < this.enemies.length; i++) this.enemies[i].draw(ctx, this.sprites);
    if (this.boss && !this.boss.dead && this.bossActive) this.boss.draw(ctx, this.sprites);

    this.projectiles.draw(ctx);
    if (this.state !== 'menu') this.player.draw(ctx, this.sprites);
    if (this.companion && this.state !== 'menu') this.companion.draw(ctx, this.sprites);
    this.particles.draw(ctx);

    ctx.restore();

    // Foreground atmospherics (screen space).
    this.parallax.drawFront(ctx, this.camera);

    // Damage flash + low-health pulse (screen space, under the HUD).
    if (this.state === 'play' || this.state === 'pause') this._drawVignettes(ctx);

    // HUD + menus (screen space).
    this._drawHUD(ctx);
    if (this.state === 'menu') this._drawMenu(ctx);
    else if (this.state === 'pause') this._drawPauseOverlay(ctx);
    else if (this.state === 'gameover') this._drawEndOverlay(ctx, false);
    else if (this.state === 'win') this._drawEndOverlay(ctx, true);

    // Level-up flash toast.
    if (this.levelFlash > 0 && (this.state === 'play' || this.state === 'pause')) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.levelFlash);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7CFFb2';
      ctx.shadowColor = '#7CFFb2'; ctx.shadowBlur = 16;
      ctx.font = '900 32px monospace';
      ctx.fillText('LEVEL UP!  LV ' + this.playerLevel, this.viewW / 2, 130);
      ctx.font = '14px monospace';
      ctx.fillText('+1 MAX HEALTH · K9 UPGRADED', this.viewW / 2, 156);
      ctx.restore();
      ctx.textAlign = 'left';
    }

    if (this.debug) this._drawDebug(ctx);
  };

  Game.prototype._drawPlatforms = function (ctx) {
    const L = this.level;
    for (let i = 0; i < L.platforms.length; i++) {
      const p = L.platforms[i];
      // Cull off-screen.
      if (p.x + p.w < this.camera.x - 40 || p.x > this.camera.x + this.viewW + 40) continue;
      const isGround = p.y >= L.groundY;
      // Solid body.
      const g = ctx.createLinearGradient(0, p.y, 0, p.y + Math.min(p.h, 80));
      g.addColorStop(0, isGround ? '#163026' : '#1c2a3a');
      g.addColorStop(1, isGround ? '#0a1a12' : '#0e1622');
      ctx.fillStyle = g;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // Neon top edge.
      ctx.fillStyle = isGround ? '#39e6a0' : '#39b6e6';
      ctx.fillRect(p.x, p.y - 2, p.w, 3);
      ctx.save();
      ctx.shadowColor = isGround ? '#39e6a0' : '#39b6e6';
      ctx.shadowBlur = 10;
      ctx.fillRect(p.x, p.y - 1, p.w, 1);
      ctx.restore();
    }
  };

  Game.prototype._drawProps = function (ctx) {
    const L = this.level;
    for (let i = 0; i < L.props.length; i++) {
      const pr = L.props[i];
      if (pr.x < this.camera.x - 60 || pr.x > this.camera.x + this.viewW + 60) continue;
      ctx.save();
      ctx.translate(pr.x, pr.y);
      if (pr.type === 'plant') {
        ctx.shadowColor = '#5effa0';
        ctx.shadowBlur = 16;
        ctx.strokeStyle = '#2f8f5a';
        ctx.lineWidth = 4;
        for (let b = -2; b <= 2; b++) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(b * 14, -40, b * 22, -70 - Math.abs(b) * 6);
          ctx.stroke();
          ctx.fillStyle = '#7CFFb2';
          ctx.beginPath();
          ctx.arc(b * 22, -70 - Math.abs(b) * 6, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // console
        ctx.shadowColor = '#39b6e6';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#10202e';
        ctx.fillRect(-16, -54, 32, 54);
        ctx.fillStyle = '#39b6e6';
        ctx.fillRect(-12, -48, 24, 14);
        ctx.fillStyle = '#7CFFb2';
        ctx.fillRect(-12, -28, 6, 6);
        ctx.fillRect(-2, -28, 6, 6);
      }
      ctx.restore();
    }
  };

  // ---- HUD ---------------------------------------------------------------
  Game.prototype._drawHUD = function (ctx) {
    if (this.state === 'menu') return;
    ctx.save();
    ctx.font = 'bold 16px monospace';
    ctx.textBaseline = 'top';

    // Soft glass panels behind the HUD clusters for readability.
    const lpw = Math.max(184, 19 + this.player.maxHealth * 20);
    ctx.fillStyle = 'rgba(4,8,18,0.45)';
    this._roundRect(ctx, 12, 12, lpw, 102, 10); ctx.fill();
    this._roundRect(ctx, this.viewW - 12 - 168, 12, 168, 66, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(57,230,255,0.14)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, 12, 12, lpw, 102, 10); ctx.stroke();
    this._roundRect(ctx, this.viewW - 12 - 168, 12, 168, 66, 10); ctx.stroke();

    // Health pips.
    for (let i = 0; i < this.player.maxHealth; i++) {
      const filled = i < this.player.health;
      ctx.fillStyle = filled ? '#39e6ff' : 'rgba(255,255,255,0.15)';
      ctx.shadowColor = filled ? '#39e6ff' : 'transparent';
      ctx.shadowBlur = filled ? 8 : 0;
      this._roundRect(ctx, 20 + i * 20, 20, 15, 12, 3);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Lives + weapon.
    ctx.fillStyle = '#cfe9ff';
    ctx.fillText('LIVES ' + this.lives, 20, 40);
    ctx.fillStyle = '#ffd34d';
    ctx.fillText(this.player.weapon().name.toUpperCase(), 20, 60);

    // OVERDRIVE meter (drives the K9 companion special).
    const ox = 20, oy = 86, ow = 156, oh = 9;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    this._roundRect(ctx, ox, oy, ow, oh, 4); ctx.fill();
    const frac = this.power / this.powerMax;
    const ready = frac >= 1;
    ctx.fillStyle = ready ? '#ffd34d' : '#c46bff';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = ready ? 12 : 5;
    this._roundRect(ctx, ox, oy, Math.max(0, ow * frac), oh, 4); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = 'bold 10px monospace';
    if (this.companion.active) {
      ctx.fillStyle = '#ff5d3c';
      ctx.fillText('K9 BARRAGE ACTIVE', ox, oy + oh + 4);
    } else if (ready) {
      const blink = Math.floor(performance.now() / 350) % 2 === 0;
      ctx.fillStyle = blink ? '#ffd34d' : '#8a7a3a';
      ctx.fillText('OVERDRIVE READY — E / Y', ox, oy + oh + 4);
    } else {
      ctx.fillStyle = '#8a7fa0';
      ctx.fillText('OVERDRIVE ' + Math.floor(frac * 100) + '%', ox, oy + oh + 4);
    }

    // Score (right aligned) with a punch-scale pop on gain.
    ctx.save();
    ctx.textAlign = 'right';
    const pop = this.scorePop > 0 ? this.scorePop / 0.35 : 0;
    if (pop > 0) {
      const s = 1 + pop * 0.18;
      ctx.translate(this.viewW - 20, 20);
      ctx.scale(s, s);
      ctx.translate(-(this.viewW - 20), -20);
      ctx.shadowColor = '#ffd34d';
      ctx.shadowBlur = 10 * pop;
    }
    ctx.fillStyle = pop > 0.45 ? '#ffe9a8' : '#ffffff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(String(this.score).padStart(6, '0'), this.viewW - 20, 20);
    ctx.restore();

    // Level + XP bar (top-right, under score).
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7CFFb2';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('LV ' + this.playerLevel, this.viewW - 20, 48);
    ctx.textAlign = 'left';
    const xw = 120, xh = 5, xx = this.viewW - 20 - xw, xy = 66;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    this._roundRect(ctx, xx, xy, xw, xh, 2); ctx.fill();
    ctx.fillStyle = '#7CFFb2'; ctx.shadowColor = '#7CFFb2'; ctx.shadowBlur = 6;
    this._roundRect(ctx, xx, xy, xw * Math.min(1, this.xp / this.xpToNext), xh, 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Boss bar.
    if (this.bossActive && this.boss && !this.boss.dead) {
      const bw = this.viewW * 0.6;
      const bx = (this.viewW - bw) / 2;
      const by = this.viewH - 36;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      this._roundRect(ctx, bx - 3, by - 3, bw + 6, 18, 4); ctx.fill();
      const frac = Math.max(0, this.boss.health / this.boss.maxHealth);
      ctx.fillStyle = this.boss.phaseNum >= 2 ? '#ff3c5d' : '#c46bff';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
      this._roundRect(ctx, bx, by, bw * frac, 12, 3); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('HIVE SENTINEL', this.viewW / 2, by - 18);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  };

  // ---- Title screen (cinematic attract mode) -----------------------------
  Game.prototype._drawMenu = function (ctx) {
    const W = this.viewW, H = this.viewH;
    const t = this.menuT;
    const rm = this.reducedMotion;
    const intro = rm ? 1 : Math.min(1, t / 1.1);
    const ease = 1 - Math.pow(1 - intro, 3);   // ease-out entrance

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // Cinematic grade over the drifting level (darker top/bottom).
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, 'rgba(3,4,14,0.82)');
    bg.addColorStop(0.45, 'rgba(4,5,18,0.52)');
    bg.addColorStop(1, 'rgba(3,4,14,0.86)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Letterbox bars with a thin neon rule.
    ctx.fillStyle = '#020208';
    ctx.fillRect(0, 0, W, 42);
    ctx.fillRect(0, H - 42, W, 42);
    ctx.fillStyle = 'rgba(57,230,255,0.25)';
    ctx.fillRect(0, 42, W, 1);
    ctx.fillRect(0, H - 43, W, 1);

    // Studio strap (top bar) + footer (bottom bar).
    ctx.fillStyle = 'rgba(159,182,200,0.75)';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('K U D B E E   G A M E S   S T U D I O', W / 2, 27);
    ctx.fillStyle = 'rgba(93,116,136,0.8)';
    ctx.font = '10px monospace';
    ctx.fillText('100% ORIGINAL — CODE · ART · AUDIO', W / 2, H - 17);

    // ---- Logo block ----
    const float = rm ? 0 : Math.sin(t * 1.4) * 4;
    ctx.save();
    ctx.globalAlpha = ease;
    ctx.translate(0, (1 - ease) * 26);

    // Ghost echo behind the wordmark.
    ctx.fillStyle = 'rgba(57,230,255,0.05)';
    ctx.font = '900 118px monospace';
    ctx.fillText('KUDBEE', W / 2, H / 2 - 60 + float * 0.5);

    // KUDBEE — cyan gradient, neon glow.
    const g1 = ctx.createLinearGradient(0, H / 2 - 138, 0, H / 2 - 70);
    g1.addColorStop(0, '#bdf6ff');
    g1.addColorStop(0.55, '#39e6ff');
    g1.addColorStop(1, '#1f8fb8');
    ctx.shadowColor = '#39e6ff'; ctx.shadowBlur = 26;
    ctx.fillStyle = g1;
    ctx.font = '900 68px monospace';
    ctx.fillText('KUDBEE', W / 2, H / 2 - 78 + float);

    // CONTRA — violet gradient, neon glow.
    const g2 = ctx.createLinearGradient(0, H / 2 - 70, 0, H / 2 - 2);
    g2.addColorStop(0, '#f0d9ff');
    g2.addColorStop(0.55, '#c46bff');
    g2.addColorStop(1, '#7a3cc9');
    ctx.shadowColor = '#c46bff'; ctx.shadowBlur = 26;
    ctx.fillStyle = g2;
    ctx.fillText('CONTRA', W / 2, H / 2 - 10 - float);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Specular sweep across the wordmark (skipped for reduced motion).
    if (!rm) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(W / 2 - 260, H / 2 - 150, 520, 150);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const sx = W / 2 - 660 + ((t * 220) % 1440);
      const sg = ctx.createLinearGradient(sx, 0, sx + 150, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(210,245,255,0.14)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(W / 2 - 260, H / 2 - 150, 520, 150);
      ctx.restore();
    }

    // Divider energy bar.
    ctx.save();
    ctx.globalAlpha = ease;
    const dw = 320 * ease;
    const dy = H / 2 + 10;
    const dg = ctx.createLinearGradient(W / 2 - dw / 2, 0, W / 2 + dw / 2, 0);
    dg.addColorStop(0, 'rgba(57,230,255,0)');
    dg.addColorStop(0.5, 'rgba(57,230,255,0.9)');
    dg.addColorStop(1, 'rgba(196,107,255,0)');
    ctx.fillStyle = dg;
    ctx.fillRect(W / 2 - dw / 2, dy, dw, 2);

    // Mission pill.
    ctx.font = 'bold 14px monospace';
    const sub = 'LEVEL 1  —  NEON JUNGLE OUTPOST';
    const sw = ctx.measureText(sub).width;
    ctx.fillStyle = 'rgba(10,16,30,0.7)';
    this._roundRect(ctx, W / 2 - sw / 2 - 16, dy + 14, sw + 32, 28, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(57,230,255,0.35)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, W / 2 - sw / 2 - 16, dy + 14, sw + 32, 28, 14); ctx.stroke();
    ctx.fillStyle = '#9fdcf0';
    ctx.fillText(sub, W / 2, dy + 33);

    // Press-to-start (soft pulse instead of a hard blink).
    const pa = rm ? 1 : 0.55 + 0.45 * Math.sin(t * 3.2);
    ctx.globalAlpha = ease * Math.max(0.3, pa);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#39e6ff'; ctx.shadowBlur = 12;
    ctx.font = 'bold 19px monospace';
    ctx.fillText('PRESS ENTER · TAP · (A) TO DEPLOY', W / 2, dy + 86);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = ease;

    // Best score.
    if (this.best > 0) {
      ctx.fillStyle = '#ffd34d';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('BEST  ' + String(this.best).padStart(6, '0'), W / 2, dy + 114);
    }

    // Controls panel.
    ctx.fillStyle = 'rgba(6,10,22,0.62)';
    this._roundRect(ctx, W / 2 - 350, H - 116, 700, 44, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(57,230,255,0.16)';
    this._roundRect(ctx, W / 2 - 350, H - 116, 700, 44, 10); ctx.stroke();
    this._drawControlItems(ctx, W / 2, H - 94, [
      ['WASD', 'MOVE'], ['SPACE', 'JUMP'], ['K', 'FIRE'],
      ['L', 'GRENADE'], ['SHIFT', 'SLIDE'], ['E', 'K9 SPECIAL'],
    ]);

    ctx.restore();
    ctx.restore();
  };

  // Row of keycap + label control hints, centered on cx.
  Game.prototype._drawControlItems = function (ctx, cx, cy, items) {
    ctx.save();
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    const padX = 7, gapKey = 8, gapItem = 26, capH = 22;
    let total = 0;
    const meas = [];
    for (let i = 0; i < items.length; i++) {
      const kw = ctx.measureText(items[i][0]).width + padX * 2;
      const lw = ctx.measureText(items[i][1]).width;
      meas.push({ key: items[i][0], label: items[i][1], kw: kw, lw: lw });
      total += kw + gapKey + lw;
    }
    total += gapItem * (items.length - 1);
    let x = cx - total / 2;
    for (let i = 0; i < meas.length; i++) {
      const m = meas[i];
      ctx.fillStyle = 'rgba(20,30,46,0.9)';
      this._roundRect(ctx, x, cy - capH / 2, m.kw, capH, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(159,182,200,0.4)';
      ctx.lineWidth = 1;
      this._roundRect(ctx, x, cy - capH / 2, m.kw, capH, 5); ctx.stroke();
      ctx.fillStyle = '#dff3ff';
      ctx.fillText(m.key, x + padX, cy + 4);
      ctx.fillStyle = '#7f97ab';
      ctx.fillText(m.label, x + m.kw + gapKey, cy + 4);
      x += m.kw + gapKey + m.lw + gapItem;
    }
    ctx.restore();
  };

  // ---- Overlay panels (pause / game over / win) ---------------------------
  Game.prototype._panel = function (ctx, x, y, w, h, accent) {
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 34;
    ctx.fillStyle = 'rgba(6,9,20,0.92)';
    this._roundRect(ctx, x, y, w, h, 14); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    this._roundRect(ctx, x, y, w, h, 14); ctx.stroke();
    ctx.globalAlpha = 1;
    // Corner accent ticks.
    ctx.fillStyle = accent;
    ctx.fillRect(x + 18, y - 1, 46, 3);
    ctx.fillRect(x + w - 64, y - 1, 46, 3);
    ctx.restore();
  };

  // Columns of small stat label/value pairs, centered on cx.
  Game.prototype._statCols = function (ctx, cx, y, stats, valueColor) {
    const colW = 132;
    const x0 = cx - (stats.length * colW) / 2 + colW / 2;
    for (let i = 0; i < stats.length; i++) {
      const x = x0 + i * colW;
      ctx.fillStyle = '#67809a';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(stats[i][0], x, y);
      ctx.fillStyle = valueColor || '#e8f6ff';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(String(stats[i][1]), x, y + 26);
    }
  };

  Game.prototype._fmtTime = function (s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  Game.prototype._promptAlpha = function () {
    return this.reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(performance.now() / 300);
  };

  Game.prototype._drawPauseOverlay = function (ctx) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(3,4,14,0.66)';
    ctx.fillRect(0, 0, W, H);
    const pw = 480, ph = 250, px = (W - pw) / 2, py = (H - ph) / 2;
    this._panel(ctx, px, py, pw, ph, '#39e6ff');

    ctx.fillStyle = '#39e6ff';
    ctx.shadowColor = '#39e6ff'; ctx.shadowBlur = 18;
    ctx.font = '900 40px monospace';
    ctx.fillText('PAUSED', W / 2, py + 64);
    ctx.shadowBlur = 0;

    this._statCols(ctx, W / 2, py + 102, [
      ['SCORE', String(this.score).padStart(6, '0')],
      ['KILLS', this.kills],
      ['TIME', this._fmtTime(this.runTime)],
    ]);

    ctx.globalAlpha = 0.45 + 0.55 * this._promptAlpha();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('P / ESC / START — RESUME', W / 2, py + 186);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#5d7488';
    ctx.font = '12px monospace';
    ctx.fillText('M MUTE  ·  ~ DEBUG', W / 2, py + 216);
    ctx.restore();
  };

  Game.prototype._drawEndOverlay = function (ctx, won) {
    const W = this.viewW, H = this.viewH;
    const accent = won ? '#7CFFb2' : '#ff5d6d';
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(3,4,14,0.72)';
    ctx.fillRect(0, 0, W, H);
    const pw = 560, ph = 330, px = (W - pw) / 2, py = (H - ph) / 2;
    this._panel(ctx, px, py, pw, ph, accent);

    ctx.fillStyle = accent;
    ctx.shadowColor = accent; ctx.shadowBlur = 22;
    ctx.font = '900 44px monospace';
    ctx.fillText(won ? 'OUTPOST CLEARED' : 'GAME OVER', W / 2, py + 68);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#8fa8bd';
    ctx.font = '13px monospace';
    ctx.fillText(won ? 'THE NEON JUNGLE FALLS SILENT' : 'THE OUTPOST HOLDS... FOR NOW', W / 2, py + 94);

    // Final score, gold-lit on a new best.
    ctx.fillStyle = '#67809a';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('FINAL SCORE', W / 2, py + 132);
    ctx.fillStyle = this.newBest ? '#ffd34d' : '#ffffff';
    if (this.newBest) { ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 14; }
    ctx.font = '900 36px monospace';
    ctx.fillText(String(this.score).padStart(6, '0'), W / 2, py + 168);
    ctx.shadowBlur = 0;
    ctx.fillStyle = this.newBest ? '#ffd34d' : '#67809a';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(this.newBest ? '★ NEW BEST ★' : 'BEST  ' + String(this.best).padStart(6, '0'), W / 2, py + 190);

    this._statCols(ctx, W / 2, py + 224, [
      ['KILLS', this.kills],
      ['TIME', this._fmtTime(this.runTime)],
      ['LEVEL', 'LV ' + this.playerLevel],
    ]);

    ctx.globalAlpha = 0.45 + 0.55 * this._promptAlpha();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(won ? 'PRESS ENTER / TAP — PLAY AGAIN' : 'PRESS ENTER / TAP — RETRY', W / 2, py + 296);
    ctx.restore();
  };

  // ---- Damage / low-health vignette ---------------------------------------
  Game.prototype._drawVignettes = function (ctx) {
    const p = this.player;
    let a = 0;
    if (this.hurtFx > 0) a = Math.min(0.5, this.hurtFx * 1.4);
    if (!p.dead && p.health > 0 && p.health <= 2) {
      const pulse = this.reducedMotion
        ? 0.22
        : 0.15 + 0.13 * (0.5 + 0.5 * Math.sin(performance.now() / 280));
      a = Math.max(a, pulse);
    }
    if (a <= 0.005) return;
    if (!this._vignette) this._buildVignette();
    ctx.save();
    ctx.globalAlpha = a;
    ctx.drawImage(this._vignette, 0, 0);
    ctx.restore();
  };

  // Cached offscreen radial vignette (built once; drawing it per frame is cheap).
  Game.prototype._buildVignette = function () {
    const c = document.createElement('canvas');
    c.width = this.viewW; c.height = this.viewH;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(
      this.viewW / 2, this.viewH / 2, this.viewH * 0.38,
      this.viewW / 2, this.viewH / 2, this.viewH * 0.85
    );
    grad.addColorStop(0, 'rgba(255,40,70,0)');
    grad.addColorStop(1, 'rgba(255,30,60,0.9)');
    g.fillStyle = grad;
    g.fillRect(0, 0, this.viewW, this.viewH);
    this._vignette = c;
  };

  Game.prototype._drawDebug = function (ctx) {
    ctx.save();
    ctx.fillStyle = '#7CFFb2';
    ctx.font = '12px monospace';
    ctx.fillText('FPS ' + this.loop.fps + '  ENT ' + this.enemies.length + '  PRJ ' + this.projectiles.pool.active.length + '  PRT ' + this.particles.pool.active.length, 20, this.viewH - 22);
    ctx.restore();
  };

  Game.prototype._roundRect = function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  KC.Game = Game;
  KC.VIEW_W = VIEW_W;
  KC.VIEW_H = VIEW_H;
})(window.KC = window.KC || {});
