/* ===========================================================================
 * KUDBEE Studio Hub — analytics.js
 * Zero-dep canvas charts: bar, radar, sparkline, donut, ring. DPR-aware.
 * ========================================================================= */
(function () {
  'use strict';
  function ctx2d(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    var c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c: c, w: r.width, h: r.height };
  }
  function col(a, o) { return 'rgba(' + a.join(',') + ',' + (o == null ? 1 : o) + ')'; }
  function rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  function bar(canvas, data, opts) {
    opts = opts || {};
    var o = ctx2d(canvas), c = o.c, W = o.w, H = o.h;
    var pad = { l: 34, r: 10, t: 12, b: 22 }, bw = (W - pad.l - pad.r) / data.length;
    var max = Math.max(1, opts.max || Math.max.apply(null, data.map(function (d) { return d.v; })));
    c.clearRect(0, 0, W, H);
    // grid
    c.strokeStyle = opts.grid || 'rgba(120,170,230,0.10)'; c.lineWidth = 1;
    for (var g = 0; g <= 4; g++) { var y = pad.t + (H - pad.t - pad.b) * g / 4; c.beginPath(); c.moveTo(pad.l, y); c.lineTo(W - pad.r, y); c.stroke(); }
    data.forEach(function (d, i) {
      var x = pad.l + bw * i + bw * 0.18, ww = bw * 0.64;
      var hh = (H - pad.t - pad.b) * (d.v / max), y = H - pad.b - hh;
      var grad = c.createLinearGradient(0, y, 0, H - pad.b);
      grad.addColorStop(0, col(rgb(d.color || opts.accent || '#39e6ff'), 0.95));
      grad.addColorStop(1, col(rgb(d.color || opts.accent || '#39e6ff'), 0.15));
      c.fillStyle = grad; c.beginPath();
      c.roundRect ? c.roundRect(x, y, ww, hh, 4) : c.rect(x, y, ww, hh); c.fill();
      if (d.label) { c.fillStyle = opts.axis || 'rgba(207,233,255,0.6)'; c.font = '10px Inter, system-ui'; c.textAlign = 'center'; c.fillText(d.label, x + ww / 2, H - pad.b + 14); }
    });
  }

  function radar(canvas, axes, opts) {
    opts = opts || {};
    var o = ctx2d(canvas), c = o.c, W = o.w, H = o.h, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.36;
    c.clearRect(0, 0, W, H); var n = axes.length;
    c.strokeStyle = 'rgba(120,170,230,0.18)'; c.lineWidth = 1;
    for (var ring = 1; ring <= 4; ring++) { c.beginPath(); for (var i = 0; i <= n; i++) { var a = (i % n) / n * Math.PI * 2 - Math.PI / 2, rr = R * ring / 4; var px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); }
    c.beginPath(); axes.forEach(function (ax, i) { var a = i / n * Math.PI * 2 - Math.PI / 2; c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }); c.stroke();
    // data polygon
    c.beginPath(); axes.forEach(function (ax, i) { var a = i / n * Math.PI * 2 - Math.PI / 2, rr = R * (ax.v || 0); var px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.closePath();
    c.fillStyle = col(rgb(opts.accent || '#39e6ff'), 0.22); c.fill(); c.strokeStyle = col(rgb(opts.accent || '#39e6ff'), 0.9); c.lineWidth = 2; c.stroke();
    c.fillStyle = 'rgba(207,233,255,0.75)'; c.font = '10px Inter, system-ui'; c.textAlign = 'center';
    axes.forEach(function (ax, i) { var a = i / n * Math.PI * 2 - Math.PI / 2; c.fillText(ax.label, cx + Math.cos(a) * (R + 14), cy + Math.sin(a) * (R + 14) + 3); });
  }

  function spark(canvas, data, opts) {
    opts = opts || {};
    var o = ctx2d(canvas), c = o.c, W = o.w, H = o.h, pad = 4;
    c.clearRect(0, 0, W, H); var max = Math.max.apply(null, data), min = Math.min.apply(null, data), rng = (max - min) || 1;
    function pt(i) { return { x: pad + (W - pad * 2) * i / (data.length - 1), y: H - pad - (H - pad * 2) * ((data[i] - min) / rng) }; }
    var p = pt(0); c.beginPath(); c.moveTo(p.x, p.y); for (var i = 1; i < data.length; i++) { p = pt(i); c.lineTo(p.x, p.y); }
    c.strokeStyle = col(rgb(opts.accent || '#39e6ff'), 0.9); c.lineWidth = 2; c.stroke();
    // fill under
    c.lineTo(W - pad, H - pad); c.lineTo(pad, H - pad); c.closePath();
    c.fillStyle = col(rgb(opts.accent || '#39e6ff'), 0.12); c.fill();
  }

  function donut(canvas, data, opts) {
    opts = opts || {};
    var o = ctx2d(canvas), c = o.c, W = o.w, H = o.h, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.4, ir = R * 0.6;
    c.clearRect(0, 0, W, H); var tot = data.reduce(function (s, d) { return s + d.v; }, 0) || 1, s = -Math.PI / 2;
    data.forEach(function (d) {
      var a = s + (d.v / tot) * Math.PI * 2; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, s, a); c.arc(cx, cy, ir, a, s, true); c.closePath();
      c.fillStyle = col(rgb(d.color), 0.9); c.fill(); s = a;
    });
    c.fillStyle = opts.center || '#fff'; c.font = '700 ' + Math.round(R * 0.28) + 'px "Space Grotesk", system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(opts.centerLabel || '', cx, cy);
  }

  function ring(canvas, value, opts) {
    opts = opts || {};
    var o = ctx2d(canvas), c = o.c, W = o.w, H = o.h, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42, lw = opts.lw || 8;
    c.clearRect(0, 0, W, H);
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.strokeStyle = 'rgba(120,170,230,0.15)'; c.lineWidth = lw; c.stroke();
    c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, value));
    c.strokeStyle = col(rgb(opts.accent || '#39e6ff'), 0.95); c.lineWidth = lw; c.lineCap = 'round'; c.stroke();
    c.fillStyle = opts.fg || '#fff'; c.font = '700 ' + Math.round(R * 0.5) + 'px "Space Grotesk", system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText((value * 100).toFixed(0) + '%', cx, cy + 1);
    if (opts.sub) { c.fillStyle = 'rgba(207,233,255,0.55)'; c.font = '11px Inter, system-ui'; c.fillText(opts.sub, cx, cy + R * 0.42); }
  }

  window.KDCharts = { bar: bar, radar: radar, spark: spark, donut: donut, ring: ring };
})();
