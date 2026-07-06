/* =====================================================================
 * Kudbee Contra — world/parallax.js
 * Seven procedurally-drawn, independently-scrolling layers that create the
 * 2.5D illusion of depth for the Neon Jungle Outpost:
 *   0 far-bg     (sky gradient + moons)      factor ~0.05
 *   1 background (distant neon skyline)      factor ~0.20
 *   2 midground  (jungle canopy silhouettes) factor ~0.45
 *   3 gameplay   (handled by level/entities) factor 1.00
 *   4 foreground (near vines, drawn over)    factor ~1.25
 *   5 particle   (drifting spores/debris)    factor ~0.7
 *   6 lighting   (god-ray shafts + fog)      screen-space overlay
 *
 * Layers are deterministic from a seed so they tile/repeat smoothly without
 * storing huge bitmaps. Real painted parallax art can replace any layer via
 * assets/manifest.json (keys bg.neon-jungle.far / .back / .mid / .fore).
 * ===================================================================== */
(function (KC) {
  'use strict';
  const Util = KC.Util;

  function seeded(seed) {
    // tiny deterministic PRNG (mulberry32)
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Parallax(viewW, viewH, sprites) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.sprites = sprites;
    this.t = 0;

    // Pre-generate prop positions for repeatable layers.
    const r = seeded(1337);
    this.skyline = [];
    for (let i = 0; i < 60; i++) {
      this.skyline.push({ x: i * 120 + r() * 60, w: 40 + r() * 60, h: 80 + r() * 160, hue: 180 + r() * 120 });
    }
    this.canopy = [];
    for (let i = 0; i < 80; i++) {
      this.canopy.push({ x: i * 90 + r() * 50, w: 70 + r() * 90, h: 120 + r() * 120, glow: r() > 0.6 });
    }
    this.spores = [];
    for (let i = 0; i < 70; i++) {
      this.spores.push({ x: r() * 4000, y: r() * viewH, s: 1 + r() * 2.5, sp: 6 + r() * 14, ph: r() * 6 });
    }
  }

  Parallax.prototype.update = function (dt) { this.t += dt; };

  // ---- Background layers (drawn before entities) ------------------------
  Parallax.prototype.drawBack = function (ctx, cam) {
    const W = this.viewW, H = this.viewH;

    // If a painted/AI-generated backdrop is supplied via the manifest
    // (bg.neon-jungle.far), use it for layers 0-2 and skip the procedural
    // sky/skyline/canopy. Otherwise fall through to the procedural version.
    const S = this.sprites;
    if (S && S.has && S.has('bg.neon-jungle.far')) {
      this._drawImageBackdrop(ctx, cam, S.images['bg.neon-jungle.far']);
      // Moons: farthest layer, slowest parallax, floated in the upper sky.
      if (S.has('bg.neon-jungle.moons')) this._drawMoons(ctx, cam, S.images['bg.neon-jungle.moons']);
      return;
    }

    // Layer 0: sky gradient.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0420');
    g.addColorStop(0.45, '#1a0b3e');
    g.addColorStop(0.8, '#2b1a5e');
    g.addColorStop(1, '#14233f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Two moons / planets, very slow parallax.
    const px0 = cam.parallaxX(0.04);
    this._moon(ctx, (W * 0.78 + px0 * 0.2) % (W + 200), H * 0.22, 46, '#ff8ad6', 0.5);
    this._moon(ctx, (W * 0.25 + px0 * 0.3), H * 0.16, 26, '#8ad6ff', 0.4);

    // Layer 1: distant neon skyline.
    this._tiled(ctx, cam, 0.2, 2000, (off) => {
      for (let i = 0; i < this.skyline.length; i++) {
        const b = this.skyline[i];
        const x = b.x + off;
        if (x < -120 || x > W + 120) continue;
        const top = H * 0.62 - b.h;
        ctx.fillStyle = 'hsla(' + b.hue + ',70%,18%,0.9)';
        ctx.fillRect(x, top, b.w, b.h);
        // window lights
        ctx.fillStyle = 'hsla(' + b.hue + ',90%,60%,0.5)';
        for (let wy = top + 8; wy < top + b.h; wy += 14) {
          ctx.fillRect(x + 6, wy, 4, 4);
          ctx.fillRect(x + b.w - 10, wy, 4, 4);
        }
      }
    });

    // Layer 2: jungle canopy silhouettes.
    this._tiled(ctx, cam, 0.45, 1600, (off) => {
      for (let i = 0; i < this.canopy.length; i++) {
        const c = this.canopy[i];
        const x = c.x + off;
        if (x < -160 || x > W + 160) continue;
        const baseY = H * 0.72;
        ctx.fillStyle = '#0c2a1e';
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.quadraticCurveTo(x + c.w * 0.5, baseY - c.h, x + c.w, baseY);
        ctx.closePath();
        ctx.fill();
        if (c.glow) {
          ctx.fillStyle = 'rgba(80,255,180,0.5)';
          ctx.beginPath();
          ctx.arc(x + c.w * 0.5, baseY - c.h * 0.7, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    // Ground band.
    const gg = ctx.createLinearGradient(0, H * 0.7, 0, H);
    gg.addColorStop(0, '#0c1f17');
    gg.addColorStop(1, '#061009');
    ctx.fillStyle = gg;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
  };

  // ---- Foreground + atmospherics (drawn after entities) -----------------
  Parallax.prototype.drawFront = function (ctx, cam) {
    const W = this.viewW, H = this.viewH;

    // Layer 5: drifting spores (mid-depth particles).
    ctx.save();
    for (let i = 0; i < this.spores.length; i++) {
      const s = this.spores[i];
      const x = (s.x - cam.x * 0.7 + this.t * s.sp) % (W + 40);
      const xx = x < 0 ? x + W + 40 : x;
      const y = s.y + Math.sin(this.t + s.ph) * 10;
      ctx.fillStyle = 'rgba(140,255,200,' + (0.15 + (s.s / 4) * 0.25) + ')';
      ctx.beginPath();
      ctx.arc(xx, y, s.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Layer 4: nearest foliage. Use the foreground image when supplied,
    // otherwise procedural hanging vines. Both use strong parallax.
    const S = this.sprites;
    if (S && S.has && S.has('bg.neon-jungle.fore')) {
      this._drawForeground(ctx, cam, S.images['bg.neon-jungle.fore']);
    } else {
      const off = cam.parallaxX(1.25) % 320;
      ctx.fillStyle = 'rgba(6,20,12,0.92)';
      for (let x = (off % 320) - 320; x < W + 320; x += 320) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(x + 30, 60, x + 10, 130);
        ctx.lineTo(x + 30, 130);
        ctx.quadraticCurveTo(x + 55, 60, x + 40, 0);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Layer 6: god-ray light shafts (screen-space, additive).
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
      const lx = (i * 0.33 + 0.15) * W + Math.sin(this.t * 0.2 + i) * 30;
      const grad = ctx.createLinearGradient(lx, 0, lx + 120, H);
      grad.addColorStop(0, 'rgba(120,255,210,0.10)');
      grad.addColorStop(1, 'rgba(120,255,210,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(lx - 40, 0);
      ctx.lineTo(lx + 40, 0);
      ctx.lineTo(lx + 160, H);
      ctx.lineTo(lx + 60, H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Fog gradient + subtle vignette for depth.
    const fog = ctx.createLinearGradient(0, H * 0.55, 0, H);
    fog.addColorStop(0, 'rgba(40,80,90,0)');
    fog.addColorStop(1, 'rgba(40,90,100,0.22)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);

    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  };

  // Tile a supplied backdrop image across the view with slow parallax, then
  // lay the procedural ground band on top so platforms read clearly.
  Parallax.prototype._drawImageBackdrop = function (ctx, cam, img) {
    const W = this.viewW, H = this.viewH;
    const aspect = img.width / img.height;
    const drawH = H;
    const drawW = drawH * aspect;
    const factor = 0.25;
    let off = cam.parallaxX(factor) % drawW;
    if (off > 0) off -= drawW;
    for (let x = off; x < W + drawW; x += drawW) {
      ctx.drawImage(img, x, 0, drawW, drawH);
    }
    // Subtle wash to seat the art into the game's palette.
    ctx.fillStyle = 'rgba(8,8,24,0.12)';
    ctx.fillRect(0, 0, W, H);

    // Ground band (matches procedural baseline).
    const gg = ctx.createLinearGradient(0, H * 0.7, 0, H);
    gg.addColorStop(0, '#0c1f17');
    gg.addColorStop(1, '#061009');
    ctx.fillStyle = gg;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
  };

  // Moons drift very slowly (factor 0.07) high in the sky — the deepest layer.
  Parallax.prototype._drawMoons = function (ctx, cam, img) {
    const W = this.viewW, H = this.viewH;
    const dw = W * 1.55;
    const dh = dw * (img.height / img.width);
    const dy = H * 0.30 - dh / 2;
    let off = cam.parallaxX(0.07) % dw;
    if (off > 0) off -= dw;
    ctx.save();
    ctx.globalAlpha = 0.92;
    for (let x = off; x < W + dw; x += dw) ctx.drawImage(img, x, dy, dw, dh);
    ctx.restore();
  };

  // Foreground foliage frame: a single symmetric composition (hanging vines
  // top, monstera leaves bottom-corners, transparent middle) — not a
  // repeating texture. It used to be tiled + scrolled like the other
  // parallax layers, which sent leaf clusters drifting into the middle of
  // the arena as the camera panned, burying the player/enemies mid-combat.
  // Pin it in screen space instead, "cover"-fit so it always frames the
  // viewport edges and never obstructs the play area.
  Parallax.prototype._drawForeground = function (ctx, cam, img) {
    const W = this.viewW, H = this.viewH;
    const scale = Math.max(W / img.width, H / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  };

  Parallax.prototype._tiled = function (ctx, cam, factor, span, draw) {
    let off = cam.parallaxX(factor) % span;
    if (off > 0) off -= span;
    ctx.save();
    ctx.translate(off, 0);
    draw(0);
    ctx.translate(span, 0);
    draw(0);
    ctx.restore();
  };

  Parallax.prototype._moon = function (ctx, x, y, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = 40;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  KC.Parallax = Parallax;
})(window.KC = window.KC || {});
