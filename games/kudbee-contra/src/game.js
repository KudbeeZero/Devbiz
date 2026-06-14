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
    this.enemies = [];
    this.pickups = this.level.pickups.map((p) => ({
      kind: p.kind, x: p.x, y: p.y, w: 26, h: 26, phase: Math.random() * 6, taken: false,
    }));
    this.projectiles.clear();
    this.particles.clear();
    this.score = 0;
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
    if (x != null) this.particles.damageNumber(x, y - 10, '+' + n, n >= 1000);
  };

  // Charge the OVERDRIVE meter (drives the K9 companion special).
  Game.prototype.addPower = function (n) {
    this.power = Math.min(this.powerMax, this.power + n);
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
      if (this.winTimer <= 0) { this.state = 'win'; this.audio.stopMusic(); }
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
            e.hurt(pr.damage);
            this.particles.spark(pr.x, pr.y, pr.color);
            if (pr.style === 'missile') this._missileBlast(pr.x, pr.y);
            pr.dead = true;
            break;
          }
        }
        // vs boss
        if (!pr.dead && this.boss && !this.boss.dead && this.bossActive) {
          if (Util.aabb(this._prBox(pr), this.boss.box())) {
            this.boss.hurt(pr.damage);
            this.particles.spark(pr.x, pr.y, pr.color);
            if (pr.style === 'missile') this._missileBlast(pr.x, pr.y);
            pr.dead = true;
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
        } else if (pk.kind === 'spread') {
          p.weaponKey = 'spread';
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

    // HUD + menus (screen space).
    this._drawHUD(ctx);
    if (this.state === 'menu') this._drawMenu(ctx);
    else if (this.state === 'pause') this._drawCenter(ctx, 'PAUSED', 'Press P / Start to resume');
    else if (this.state === 'gameover') this._drawCenter(ctx, 'GAME OVER', 'Score ' + this.score + ' — Press Enter / A to retry', '#ff5d6d');
    else if (this.state === 'win') this._drawCenter(ctx, 'OUTPOST CLEARED', 'Score ' + this.score + ' — Press Enter / A to play again', '#7CFFb2');

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

    // Score (right aligned).
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(String(this.score).padStart(6, '0'), this.viewW - 20, 20);
    ctx.textAlign = 'left';

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

  Game.prototype._drawMenu = function (ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(4,4,16,0.55)';
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    ctx.textAlign = 'center';

    ctx.shadowColor = '#39e6ff'; ctx.shadowBlur = 24;
    ctx.fillStyle = '#39e6ff';
    ctx.font = '900 64px monospace';
    ctx.fillText('KUDBEE', this.viewW / 2, this.viewH / 2 - 70);
    ctx.fillStyle = '#c46bff';
    ctx.shadowColor = '#c46bff';
    ctx.fillText('CONTRA', this.viewW / 2, this.viewH / 2 - 6);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#9fb6c8';
    ctx.font = '16px monospace';
    ctx.fillText('NEON JUNGLE OUTPOST  —  LEVEL 1', this.viewW / 2, this.viewH / 2 + 40);

    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('PRESS ENTER / TAP / A TO DEPLOY', this.viewW / 2, this.viewH / 2 + 80);
    }
    ctx.fillStyle = '#5d7488';
    ctx.font = '12px monospace';
    ctx.fillText('Move WASD/Arrows · Jump Space · Fire K/X · Grenade L/C · Slide Shift · K9 Special E', this.viewW / 2, this.viewH - 40);
    ctx.textAlign = 'left';
    ctx.restore();
  };

  Game.prototype._drawCenter = function (ctx, title, sub, color) {
    ctx.save();
    ctx.fillStyle = 'rgba(4,4,16,0.6)';
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = color || '#39e6ff';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 20;
    ctx.font = '900 52px monospace';
    ctx.fillText(title, this.viewW / 2, this.viewH / 2 - 10);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#cfe9ff';
    ctx.font = '16px monospace';
    ctx.fillText(sub, this.viewW / 2, this.viewH / 2 + 36);
    ctx.textAlign = 'left';
    ctx.restore();
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
