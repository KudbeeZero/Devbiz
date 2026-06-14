/* =====================================================================
 * Kudbee Contra — entities/enemies.js
 * Original enemy archetypes with readable state-machine AI:
 *   - Drone        : floats, PATROL -> CHASE -> dive (contact damage)
 *   - Cyber Soldier : walks platforms, PATROL -> ranged ATTACK, brief COVER
 *   - Turret       : stationary, aims and fires on a cadence
 *   - Hive Sentinel : 2-phase mini-boss (volley fire; enrages under 50% HP)
 *
 * States are plain string enums so they read clearly and are easy to grow
 * into full behavior trees later (see docs/GAME_DESIGN.md + AI_INTEGRATION).
 * Enemies call into `game` for projectiles / particles / audio.
 * ===================================================================== */
(function (KC) {
  'use strict';
  const Util = KC.Util;
  const GRAVITY = 2000;

  function Enemy(game, type, x, y) {
    this.game = game;
    this.type = type;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.dir = -1;
    this.phase = Math.random() * 6;
    this.state = 'patrol';
    this.stateT = 0;
    this.fireCd = Util.rand(0.5, 1.5);
    this.flash = 0;
    this.dead = false;
    this.aimAngle = 0;

    const cfg = CONFIG[type];
    this.w = cfg.w; this.h = cfg.h;
    this.health = cfg.health;
    this.maxHealth = cfg.health;
    this.score = cfg.score;
    this.contactDamage = cfg.contact;
    this.patrolDir = Math.random() < 0.5 ? -1 : 1;
    this.homeX = x;
    this.grounded = false;
  }

  const CONFIG = {
    drone:   { w: 38, h: 30, health: 3, score: 100, contact: 1, range: 360, speed: 150 },
    soldier: { w: 30, h: 50, health: 4, score: 150, contact: 1, range: 460, speed: 70 },
    turret:  { w: 44, h: 40, health: 6, score: 200, contact: 1, range: 520, speed: 0 },
  };

  Enemy.prototype.cx = function () { return this.x + this.w / 2; };
  Enemy.prototype.cy = function () { return this.y + this.h / 2; };
  Enemy.prototype.box = function () { return { x: this.x, y: this.y, w: this.w, h: this.h }; };

  Enemy.prototype.hurt = function (dmg) {
    this.health -= dmg;
    this.flash = 0.08;
    this.game.particles.spark(this.cx(), this.cy(), '#fff');
    if (this.health <= 0) this._die();
  };

  Enemy.prototype._die = function () {
    this.dead = true;
    this.game.audio.explosion();
    this.game.particles.explosion(this.cx(), this.cy(), false);
    this.game.camera.shake(0.12);
    this.game.addScore(this.score, this.cx(), this.cy());
    this.game.addPower(15);
    this.game.maybeDropPickup(this.cx(), this.cy());
  };

  Enemy.prototype.update = function (dt, player, level) {
    this.phase += dt * 4;
    this.stateT += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;

    const dx = player.cx() - this.cx();
    const dy = player.cy() - this.cy();
    const distToPlayer = Math.hypot(dx, dy);
    const cfg = CONFIG[this.type];

    if (this.type === 'drone') this._updateDrone(dt, player, dx, dy, distToPlayer, cfg);
    else if (this.type === 'soldier') this._updateSoldier(dt, player, level, dx, dy, distToPlayer, cfg);
    else if (this.type === 'turret') this._updateTurret(dt, player, dx, dy, distToPlayer, cfg);

    // Contact damage.
    if (!player.dead && Util.aabb(this.box(), { x: player.x, y: player.y, w: player.w, h: player.h })) {
      player.hurt(this.contactDamage);
    }
  };

  // --- Drone --------------------------------------------------------------
  Enemy.prototype._updateDrone = function (dt, player, dx, dy, dist, cfg) {
    if (dist < cfg.range) this.state = 'chase';
    else this.state = 'patrol';

    if (this.state === 'chase') {
      const ang = Math.atan2(dy, dx);
      this.vx = Util.approach(this.vx, Math.cos(ang) * cfg.speed, 600 * dt);
      this.vy = Util.approach(this.vy, Math.sin(ang) * cfg.speed, 600 * dt);
      this.dir = dx < 0 ? -1 : 1;
    } else {
      // hover patrol around home
      this.vx = Util.approach(this.vx, this.patrolDir * 50, 300 * dt);
      this.vy = Math.sin(this.phase) * 30;
      if (Math.abs(this.x - this.homeX) > 140) this.patrolDir *= -1;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  };

  // --- Cyber Soldier ------------------------------------------------------
  Enemy.prototype._updateSoldier = function (dt, player, level, dx, dy, dist, cfg) {
    // gravity + platform stand
    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;
    this.grounded = false;
    const box = this.box();
    for (let i = 0; i < level.platforms.length; i++) {
      const p = level.platforms[i];
      if (Util.aabb(box, p) && this.vy > 0 && (this.y + this.h - this.vy * dt) <= p.y + 8) {
        this.y = p.y - this.h; this.vy = 0; this.grounded = true; break;
      }
    }

    const inRange = dist < cfg.range && Math.abs(dy) < 120;
    if (inRange) {
      this.dir = dx < 0 ? -1 : 1;
      // alternate ATTACK and brief COVER (stop firing, reposition)
      if (this.state !== 'attack' && this.state !== 'cover') { this.state = 'attack'; this.stateT = 0; }
      if (this.state === 'attack') {
        this.vx = Util.approach(this.vx, 0, 600 * dt);
        if (this.fireCd <= 0) {
          this._fireAt(player, 360, 1);
          this.fireCd = 1.1;
        }
        if (this.stateT > 2.4) { this.state = 'cover'; this.stateT = 0; this.patrolDir = -this.dir; }
      } else if (this.state === 'cover') {
        this.vx = Util.approach(this.vx, this.patrolDir * cfg.speed, 500 * dt);
        if (this.stateT > 1.0) { this.state = 'attack'; this.stateT = 0; }
      }
    } else {
      this.state = 'patrol';
      this.vx = Util.approach(this.vx, this.patrolDir * cfg.speed * 0.7, 400 * dt);
      this.dir = this.patrolDir;
      if (Math.abs(this.x - this.homeX) > 120) this.patrolDir *= -1;
    }
    this.x += this.vx * dt;
  };

  // --- Turret -------------------------------------------------------------
  Enemy.prototype._updateTurret = function (dt, player, dx, dy, dist, cfg) {
    this.aimAngle = Math.atan2(dy, dx);
    this.dir = dx < 0 ? -1 : 1;
    if (dist < cfg.range) {
      this.state = 'attack';
      if (this.fireCd <= 0) {
        this._fireAt(player, 320, 1);
        this.fireCd = 1.4;
      }
    } else {
      this.state = 'idle';
    }
  };

  Enemy.prototype._fireAt = function (player, speed, dmg) {
    const dx = player.cx() - this.cx();
    const dy = player.cy() - this.cy();
    const len = Math.hypot(dx, dy) || 1;
    this.game.projectiles.spawn({
      x: this.cx(), y: this.cy(),
      vx: dx / len * speed, vy: dy / len * speed,
      radius: 5, damage: dmg, friendly: false,
      color: '#ff5d6d', style: 'enemy', life: 2.4,
    });
    this.game.audio.enemyShoot();
  };

  Enemy.prototype.draw = function (ctx, sprites) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.flash > 0) { ctx.globalCompositeOperation = 'lighter'; }
    if (this.type === 'drone') sprites.drawDrone(ctx, this.w, this.h, this);
    else if (this.type === 'soldier') sprites.drawSoldier(ctx, this.w, this.h, { dir: this.dir, phase: this.phase, moving: Math.abs(this.vx) > 10 });
    else if (this.type === 'turret') sprites.drawTurret(ctx, this.w, this.h, this);
    ctx.restore();
  };

  /* =====================================================================
   * Hive Sentinel — mini-boss with two phases.
   * ===================================================================== */
  function Boss(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.w = 130; this.h = 110;
    this.vx = 0; this.vy = 0;
    this.dir = -1;
    this.health = 60;
    this.maxHealth = 60;
    this.phaseNum = 1;
    this.phase = 0;
    this.state = 'intro';
    this.stateT = 0;
    this.fireCd = 1.5;
    this.flash = 0;
    this.dead = false;
    this.score = 2500;
    this.contactDamage = 2;
    this.anchorY = y;
  }

  Boss.prototype.cx = function () { return this.x + this.w / 2; };
  Boss.prototype.cy = function () { return this.y + this.h / 2; };
  Boss.prototype.box = function () { return { x: this.x, y: this.y, w: this.w, h: this.h }; };

  Boss.prototype.hurt = function (dmg) {
    if (this.state === 'intro') return;
    this.health -= dmg;
    this.flash = 0.06;
    this.game.particles.spark(this.cx() + Util.rand(-40, 40), this.cy() + Util.rand(-30, 30), '#fff');
    if (this.phaseNum === 1 && this.health <= this.maxHealth * 0.5) {
      this.phaseNum = 2;
      this.game.audio.bossAlarm();
      this.game.camera.shake(0.6);
      this.game.particles.explosion(this.cx(), this.cy(), true);
    }
    if (this.health <= 0) this._die();
  };

  Boss.prototype._die = function () {
    this.dead = true;
    this.game.camera.shake(1);
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this.game.particles.explosion(this.cx() + Util.rand(-50, 50), this.cy() + Util.rand(-40, 40), true), i * 120);
    }
    this.game.audio.explosion();
    this.game.addScore(this.score, this.cx(), this.cy());
    this.game.onBossDefeated();
  };

  Boss.prototype.update = function (dt, player) {
    this.phase += dt * 4;
    this.stateT += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;

    if (this.state === 'intro') {
      // drift down into the arena; handled timing by game reveal
      if (this.stateT > 1.6) { this.state = 'fight'; this.stateT = 0; }
      this.y = this.anchorY + Math.sin(this.stateT * 2) * 4;
      return;
    }

    // Hover bob and slow horizontal sweep across the arena.
    this.y = this.anchorY + Math.sin(this.phase * 0.8) * 26;
    const targetX = player.cx() - this.w / 2;
    const speed = this.phaseNum === 2 ? 90 : 55;
    this.x = Util.approach(this.x, Util.clamp(targetX, this.game.level.bossArena.lockMinX + 40, this.game.level.width - this.w - 40), speed * dt);
    this.dir = player.cx() < this.cx() ? -1 : 1;

    // Firing patterns.
    if (this.fireCd <= 0) {
      if (this.phaseNum === 1) {
        this._volley(player, 5, 0.5, 300);
        this.fireCd = 1.6;
      } else {
        this._volley(player, 7, 0.7, 360);
        // extra downward spray
        for (let i = 0; i < 4; i++) {
          const a = Math.PI * (0.25 + i * 0.16);
          this.game.projectiles.spawn({ x: this.cx(), y: this.cy(), vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, radius: 5, damage: 1, friendly: false, color: '#ff5d6d', style: 'enemy', life: 3 });
        }
        this.fireCd = 1.1;
      }
      this.game.audio.enemyShoot();
    }

    if (!player.dead && Util.aabb(this.box(), { x: player.x, y: player.y, w: player.w, h: player.h })) {
      player.hurt(this.contactDamage);
    }
  };

  Boss.prototype._volley = function (player, count, spread, speed) {
    const dx = player.cx() - this.cx();
    const dy = player.cy() - this.cy();
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1) - 0.5);
      const a = base + t * spread;
      this.game.projectiles.spawn({
        x: this.cx(), y: this.cy(),
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        radius: 6, damage: 1, friendly: false, color: '#ff7a3c', style: 'enemy', life: 3,
      });
    }
  };

  Boss.prototype.draw = function (ctx, sprites) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.flash > 0) ctx.globalCompositeOperation = 'lighter';
    sprites.drawBoss(ctx, this.w, this.h, { phase: this.phase, phaseNum: this.phaseNum });
    ctx.restore();
  };

  KC.Enemy = Enemy;
  KC.Boss = Boss;
})(window.KC = window.KC || {});
