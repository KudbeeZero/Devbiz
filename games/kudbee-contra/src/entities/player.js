/* =====================================================================
 * Kudbee Contra — entities/player.js
 * The "Kudbee Operative". Owns movement physics (run, jump, double-jump,
 * slide), 8-direction aiming, shooting, grenades, damage with i-frames,
 * death and respawn. Collides against the level's solid platforms via
 * swept-axis AABB resolution.
 *
 * The player calls back into `game` for projectiles, audio, and particles
 * so this file stays focused on the operative itself.
 * ===================================================================== */
(function (KC) {
  'use strict';
  const Util = KC.Util;

  // --- Tunable physics constants -----------------------------------------
  const RUN_SPEED = 260;
  const ACCEL = 2200;
  const FRICTION = 2600;
  const GRAVITY = 2000;
  const JUMP_V = 620;
  const MAX_FALL = 1100;
  const SLIDE_SPEED = 420;
  const SLIDE_TIME = 0.42;
  const COYOTE = 0.09;        // grace window to jump after leaving a ledge
  const JUMP_BUFFER = 0.10;   // remember a jump press slightly early
  const IFRAME_TIME = 1.1;

  const STAND_W = 26, STAND_H = 50, SLIDE_H = 26;

  function Player(game) {
    this.game = game;
    this.reset(game.level.playerStart.x, game.level.playerStart.y);
    this.maxHealth = 6;
    this.lives = 3;
    this.weaponKey = 'pulse';
  }

  Player.prototype.reset = function (x, y) {
    this.x = x; this.y = y;
    this.w = STAND_W; this.h = STAND_H;
    this.vx = 0; this.vy = 0;
    this.dir = 1;
    this.grounded = false;
    this.jumps = 0;            // jumps used since leaving ground
    this.maxJumps = 2;         // ground + one double-jump
    this.sliding = false;
    this.slideT = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.fireCd = 0;
    this.grenadeCd = 0;
    this.health = 6;
    this.iframe = 0;
    this.dead = false;
    this.deathT = 0;
    this.phase = 0;            // animation phase
    this.aim = 0;              // -1 up, 0 forward, 1 down (visual)
  };

  Player.prototype.fullReset = function () {
    this.reset(this.game.level.playerStart.x, this.game.level.playerStart.y);
    this.weaponKey = 'pulse';
  };

  Player.prototype.weapon = function () { return KC.Weapons[this.weaponKey]; };

  Player.prototype.hurt = function (dmg) {
    if (this.iframe > 0 || this.dead) return;
    this.health -= dmg;
    this.iframe = IFRAME_TIME;
    this.game.audio.playerHurt();
    this.game.camera.shake(0.5);
    this.game.hurtFx = 0.45;   // brief red screen-edge flash (drawn by game.js)
    this.game.particles.burst(this.cx(), this.cy(), '#39e6ff', 14, 240, { glow: true });
    if (this.health <= 0) this._die();
  };

  Player.prototype._die = function () {
    this.dead = true;
    this.deathT = 0;
    this.vy = -380;
    this.vx = -this.dir * 120;
    this.game.audio.explosion();
    this.game.camera.shake(0.7);
    this.game.particles.explosion(this.cx(), this.cy(), false);
    this.game.onPlayerDeath();
  };

  Player.prototype.cx = function () { return this.x + this.w / 2; };
  Player.prototype.cy = function () { return this.y + this.h / 2; };

  Player.prototype.update = function (dt, input, level) {
    this.phase += dt * (Math.abs(this.vx) > 20 ? 12 : 4);

    if (this.dead) { this._updateDeath(dt, level); return; }

    if (this.iframe > 0) this.iframe -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.grenadeCd > 0) this.grenadeCd -= dt;

    const left = input.down('left');
    const right = input.down('right');
    const up = input.down('up');
    const down = input.down('down');

    // ---- Facing & aim ----
    if (left && !right) this.dir = -1;
    if (right && !left) this.dir = 1;
    this.aim = up ? -1 : (down && !this.grounded ? 1 : 0);

    // ---- Slide ----
    if (input.justPressed('slide') && this.grounded && !this.sliding && Math.abs(this.vx) > 30) {
      this.sliding = true;
      this.slideT = SLIDE_TIME;
      this.vx = this.dir * SLIDE_SPEED;
      this.game.audio.land();
      this.game.particles.burst(this.cx(), this.y + this.h, '#9fefff', 8, 160, { life: 0.3 });
    }
    if (this.sliding) {
      this.slideT -= dt;
      this.h = SLIDE_H;
      // keep feet on the ground while crouched
      if (this.slideT <= 0 || !this.grounded) {
        this.sliding = false;
        this.y -= (STAND_H - SLIDE_H);
        this.h = STAND_H;
      }
    } else {
      this.h = STAND_H;
    }

    // ---- Horizontal movement ----
    if (!this.sliding) {
      const move = (right ? 1 : 0) - (left ? 1 : 0);
      if (move !== 0) {
        this.vx = Util.approach(this.vx, move * RUN_SPEED, ACCEL * dt);
      } else {
        this.vx = Util.approach(this.vx, 0, FRICTION * dt);
      }
    } else {
      // friction during slide
      this.vx = Util.approach(this.vx, this.dir * 60, 900 * dt);
    }

    // ---- Jump (with coyote time + input buffer + double jump) ----
    if (input.justPressed('jump')) this.jumpBuffer = JUMP_BUFFER;
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;
    if (this.coyote > 0) this.coyote -= dt;

    const canGroundJump = this.grounded || this.coyote > 0;
    if (this.jumpBuffer > 0 && (canGroundJump || this.jumps < this.maxJumps)) {
      this.vy = -JUMP_V;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.sliding = false;
      this.h = STAND_H;
      this.jumps = canGroundJump ? 1 : this.jumps + 1;
      this.grounded = false;
      this.game.audio.jump();
      if (this.jumps > 1) {
        // double-jump puff
        this.game.particles.burst(this.cx(), this.y + this.h, '#7CFFb2', 10, 180, { life: 0.35 });
      }
    }
    // Variable jump height: release to cut upward velocity.
    if (input.justReleased('jump') && this.vy < -200) this.vy = -200;

    // ---- Gravity ----
    this.vy += GRAVITY * dt;
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;

    // ---- Integrate + collide ----
    this._moveAndCollide(dt, level);

    // ---- Shooting (auto-fire on touch devices) ----
    if ((input.down('fire') || this.game.autoFire) && this.fireCd <= 0 && !this.sliding) this._shoot();

    // ---- Grenade ----
    if (input.justPressed('grenade') && this.grenadeCd <= 0) {
      this.grenadeCd = 0.8;
      this.game.projectiles.grenade(this.cx(), this.cy(), this.dir, up);
      this.game.audio.grenade();
    }

    // Fell out of the world.
    if (this.y > level.groundY + 600) this._die();
  };

  Player.prototype._shoot = function () {
    const w = this.weapon();
    this.fireCd = w.cooldown;
    // 8-direction firing from the muzzle.
    let dx = this.dir, dy = 0;
    const input = this.game.input;
    const up = input.down('up'), down = input.down('down');
    const left = input.down('left'), right = input.down('right');
    if (up && (left || right)) { dx = this.dir; dy = -1; }
    else if (up && !left && !right) { dx = 0; dy = -1; }
    else if (down && !this.grounded) { dy = 1; dx = (left || right) ? this.dir : 0; }
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;

    const mx = this.cx() + dx * 22;
    const my = this.cy() - 8 + dy * 14;
    this.game.projectiles.fireWeapon(w, mx, my, dx, dy, true);
    this.game.audio[w.sfx]();
    this.game.particles.muzzle(mx, my, dx >= 0 ? 1 : -1);
    this.game.camera.shake(0.06);
  };

  Player.prototype._moveAndCollide = function (dt, level) {
    // Horizontal.
    this.x += this.vx * dt;
    let box = this._box();
    for (let i = 0; i < level.platforms.length; i++) {
      const p = level.platforms[i];
      if (Util.aabb(box, p)) {
        if (this.vx > 0) this.x = p.x - this.w;
        else if (this.vx < 0) this.x = p.x + p.w;
        this.vx = 0;
        box = this._box();
      }
    }
    // Clamp to level bounds.
    this.x = Util.clamp(this.x, 0, level.width - this.w);

    // Vertical.
    this.y += this.vy * dt;
    box = this._box();
    const wasGrounded = this.grounded;
    this.grounded = false;
    for (let i = 0; i < level.platforms.length; i++) {
      const p = level.platforms[i];
      if (Util.aabb(box, p)) {
        if (this.vy > 0) {
          this.y = p.y - this.h;
          this.grounded = true;
          this.jumps = 0;
        } else if (this.vy < 0) {
          this.y = p.y + p.h;
        }
        this.vy = 0;
        box = this._box();
      }
    }
    if (this.grounded) {
      this.coyote = COYOTE;
      if (!wasGrounded && this.vy >= 0) {
        // just landed
        this.game.audio.land();
        this.game.particles.burst(this.cx(), this.y + this.h, '#9fefff', 6, 120, { life: 0.25 });
      }
    }
  };

  Player.prototype._box = function () { return { x: this.x, y: this.y, w: this.w, h: this.h }; };

  Player.prototype._updateDeath = function (dt, level) {
    this.deathT += dt;
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y > level.groundY - this.h) { this.y = level.groundY - this.h; this.vx *= 0.8; }
  };

  // Respawn at a safe x near the camera after a death (if lives remain).
  Player.prototype.respawn = function (x) {
    const y = this.game.level.groundY - STAND_H;
    this.reset(x, y);
    this.iframe = IFRAME_TIME * 1.5;
  };

  Player.prototype.draw = function (ctx, sprites) {
    if (this.dead) {
      // tumbling fade handled by particles; draw faint shell
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - this.deathT);
      ctx.translate(this.x, this.y);
      sprites.drawPlayer(ctx, this.w, this.h, { dir: this.dir, phase: this.phase, action: 'hit' });
      ctx.restore();
      return;
    }
    // i-frame blink.
    if (this.iframe > 0 && Math.floor(this.iframe * 20) % 2 === 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    sprites.drawPlayer(ctx, this.w, this.h, {
      dir: this.dir,
      phase: this.phase,
      moving: Math.abs(this.vx) > 20,
      action: this.sliding ? 'slide' : 'idle',
      aim: this.aim,
    });
    ctx.restore();
  };

  KC.Player = Player;
})(window.KC = window.KC || {});
