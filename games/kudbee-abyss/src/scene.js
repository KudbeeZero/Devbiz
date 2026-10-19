/* =====================================================================
 * Kudbee Abyss - scene.js (THE STAGE, three.js r128)
 * The art is a plane in a living void. The camera glides to whoever is speaking
 * (the Queen in the middle, the Guardian on the left, Vey on the right), the world
 * changes mood with the story (light, fog, tint, shards), the crystal and the gate
 * step forward for their scenes, and every choice throws a burst of sparks.
 * Layout is phone first: in landscape the art sits in the left half and the
 * dialogue takes the right; in portrait the art sits up and the dialogue below.
 * ===================================================================== */
var ABY = window.ABY = window.ABY || {};

ABY.Scene = (function () {
  var T = window.THREE;
  var S = { ready: false, frames: 0, mood: 'void', focus: 'queen', stage: 'chat', dim: 1, dimT: 1, dark: 0, throne: 0, torch: 0, torchT: 0, dread: 0, reduced: false, layout: { land: false, d0: 12 } };
  var scene, camera, renderer, art, artMat, bg, bgMat, bg2, bg2Mat, bg3, bg3Mat, torchL, torchCone, halo, shards, crystal, gate, gateMat, rays = [], motes, sparks, keyL, rimL, fillL, crystalL;
  var W = 1, H = 1, Hp = 8, Wp = 6, pointer = { x: 0, y: 0 }, tilt = { x: 0, y: 0 };
  var cam = { x: 0, y: 0, z: 9, lx: 0, ly: 0 }, camT = { x: 0, y: 0, z: 9, lx: 0, ly: 0 };
  var look = { crystal: 0, gate: 0, artA: 1, open: 0 }, lookT = { crystal: 0, gate: 0, artA: 1, open: 0 };
  var MOODS = {
    void:  { fog: 0x0a0420, key: 0xc46bff, rim: 0x39e6ff, shard: 0x6a3cff, tint: [0.80, 0.78, 0.95], rays: 0.05, dens: 0.020 },
    spire: { fog: 0x041a2a, key: 0x39e6ff, rim: 0xff6ec7, shard: 0x2fd0ff, tint: [0.70, 0.90, 1.00], rays: 0.09, dens: 0.016 },
    dusk:  { fog: 0x1a0a30, key: 0xff8a5c, rim: 0x7cffb2, shard: 0xff7a5c, tint: [1.00, 0.82, 0.80], rays: 0.06, dens: 0.018 },
    gate:  { fog: 0x120830, key: 0xffd34d, rim: 0xc46bff, shard: 0xffd34d, tint: [0.90, 0.85, 1.00], rays: 0.12, dens: 0.014 },
    dawn:  { fog: 0x24163c, key: 0xffe9b0, rim: 0x7cffb2, shard: 0xffe9b0, tint: [1.00, 1.00, 1.00], rays: 0.14, dens: 0.012 },
    throne: { fog: 0x0e0006, key: 0xff3a2a, rim: 0xffa83c, shard: 0xff4a1c, tint: [0.78, 0.66, 0.7], rays: 0.1, dens: 0.022 },
    dark:  { fog: 0x070008, key: 0xff3c3c, rim: 0x6a0fcc, shard: 0xb01030, tint: [0.55, 0.50, 0.62], rays: 0.03, dens: 0.026 },
  };
  var GATE = { dawn: [0xffd34d, 0xff9a5c], song: [0x39e6ff, 0xff6ec7], echo: [0xc46bff, 0x7cffb2], silence: [0x8890a8, 0x40485c], crown: [0xff2040, 0x400010], daybreak: [0xfff1b0, 0xffd34d], keeper: [0x8aa0ff, 0x1a1a3a], loop: [0x30ff90, 0x101020] };
  var CHAR = { queen: [0.47, 0.20, 0.60], guardian: [0.17, 0.30, 0.78], vey: [0.80, 0.60, 0.78] };   // art u, v(from the top), how close the camera comes (1 = framing the whole art)
  var tmpC;                                                       // (made in make(): THREE may not have loaded, and the game still runs without the 3D)

  function make(container, img, bgImg, bgImg2, bgImg3) {
    if (!T) return false;
    tmpC = new T.Color();
    try {
      var coarse = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
      renderer = new T.WebGLRenderer({ antialias: !coarse, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    S.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    scene = new T.Scene(); scene.background = new T.Color(0x05031a); scene.fog = new T.FogExp2(0x0a0420, 0.02);
    camera = new T.PerspectiveCamera(46, 1, 0.1, 120);

    scene.add(new T.AmbientLight(0x505070, 1.0));
    keyL = new T.DirectionalLight(0xc46bff, 1.0); keyL.position.set(4, 5, 6); scene.add(keyL);
    rimL = new T.PointLight(0x39e6ff, 1.5, 30); rimL.position.set(-5, 2, 5); scene.add(rimL);
    fillL = new T.PointLight(0xff6ec7, 0.9, 30); fillL.position.set(5, -3, 4); scene.add(fillL);
    torchL = new T.PointLight(0xfff0d0, 0, 28); scene.add(torchL);                                      // the phone's flashlight
    var tc = document.createElement('canvas'); tc.width = tc.height = 128; var tx = tc.getContext('2d'), tg = tx.createRadialGradient(64, 64, 0, 64, 64, 64); tg.addColorStop(0, 'rgba(255,244,214,0.9)'); tg.addColorStop(0.4, 'rgba(255,236,190,0.35)'); tg.addColorStop(1, 'rgba(255,230,180,0)'); tx.fillStyle = tg; tx.fillRect(0, 0, 128, 128);
    torchCone = new T.Mesh(new T.PlaneGeometry(16, 16), new T.MeshBasicMaterial({ map: new T.CanvasTexture(tc), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, fog: false })); torchCone.position.z = 3; scene.add(torchCone);

    // far nebula
    var nc = document.createElement('canvas'); nc.width = nc.height = 256; var nx = nc.getContext('2d');
    var ng = nx.createRadialGradient(128, 128, 0, 128, 128, 128);
    ng.addColorStop(0, 'rgba(120,40,220,0.55)'); ng.addColorStop(0.5, 'rgba(57,230,255,0.14)'); ng.addColorStop(1, 'rgba(5,3,26,0)');
    nx.fillStyle = ng; nx.fillRect(0, 0, 256, 256);
    var neb = new T.Mesh(new T.PlaneGeometry(46, 34), new T.MeshBasicMaterial({ map: new T.CanvasTexture(nc), transparent: true, opacity: 0.35, depthWrite: false }));
    neb.position.z = -26; scene.add(neb); S.neb = neb;

    // the world behind her: a far painting of the city of towers (parallax; the mood tints it; a missing image just leaves the nebula)
    if (bgImg && bgImg.naturalWidth) {
      var bt = new T.Texture(bgImg); bt.needsUpdate = true; bgMat = new T.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, fog: false });
      bg = new T.Mesh(new T.PlaneGeometry(96, 96 * bgImg.naturalHeight / bgImg.naturalWidth), bgMat); bg.position.set(0, 1, -46); scene.add(bg);
      // the same city, corrupted (the red eye): the world fades into it whenever the mood goes dark
      if (bgImg2 && bgImg2.naturalWidth) {
        var bt2 = new T.Texture(bgImg2); bt2.needsUpdate = true; bg2Mat = new T.MeshBasicMaterial({ map: bt2, transparent: true, opacity: 0, depthWrite: false, fog: false });
        bg2 = new T.Mesh(new T.PlaneGeometry(96, 96 * bgImg2.naturalHeight / bgImg2.naturalWidth), bg2Mat); bg2.position.set(0, 1, -45.5); scene.add(bg2);
      }
      // and the stairway to the eye: the world of the crown (mood 'throne')
      if (bgImg3 && bgImg3.naturalWidth) {
        var bt3 = new T.Texture(bgImg3); bt3.needsUpdate = true; bg3Mat = new T.MeshBasicMaterial({ map: bt3, transparent: true, opacity: 0, depthWrite: false, fog: false });
        bg3 = new T.Mesh(new T.PlaneGeometry(96, 96 * bgImg3.naturalHeight / bgImg3.naturalWidth), bg3Mat); bg3.position.set(0, 1, -45); scene.add(bg3);
      }
    }

    // stars
    var sp = new Float32Array(360 * 3);
    for (var i = 0; i < 360; i++) { sp[i * 3] = (Math.random() - 0.5) * 70; sp[i * 3 + 1] = (Math.random() - 0.5) * 42; sp[i * 3 + 2] = -14 - Math.random() * 28; }
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3));
    S.stars = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 0.1, transparent: true, opacity: 0.8, depthWrite: false })); scene.add(S.stars);

    // the art: a plane with soft edges, so it floats in the void
    var tex = new T.Texture(img); tex.needsUpdate = true;
    var mc = document.createElement('canvas'); mc.width = 128; mc.height = 170; var mx = mc.getContext('2d');
    mx.fillStyle = '#000'; mx.fillRect(0, 0, 128, 170);
    var gx = mx.createLinearGradient(0, 0, 128, 0); gx.addColorStop(0, '#000'); gx.addColorStop(0.16, '#fff'); gx.addColorStop(0.84, '#fff'); gx.addColorStop(1, '#000');
    mx.fillStyle = gx; mx.fillRect(0, 0, 128, 170);
    mx.globalCompositeOperation = 'multiply';
    var gy = mx.createLinearGradient(0, 0, 0, 170); gy.addColorStop(0, '#000'); gy.addColorStop(0.1, '#fff'); gy.addColorStop(0.88, '#fff'); gy.addColorStop(1, '#000');
    mx.fillStyle = gy; mx.fillRect(0, 0, 128, 170);
    artMat = new T.MeshBasicMaterial({ map: tex, alphaMap: new T.CanvasTexture(mc), transparent: true, depthWrite: false, fog: false });
    Hp = 8; Wp = Hp * (img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0.75);
    art = new T.Mesh(new T.PlaneGeometry(Wp, Hp), artMat); scene.add(art);

    // a pulse on her halo
    var hc = document.createElement('canvas'); hc.width = hc.height = 128; var hx = hc.getContext('2d');
    var hg = hx.createRadialGradient(64, 64, 8, 64, 64, 64); hg.addColorStop(0, 'rgba(196,107,255,0)'); hg.addColorStop(0.7, 'rgba(196,107,255,0.55)'); hg.addColorStop(1, 'rgba(196,107,255,0)');
    hx.fillStyle = hg; hx.fillRect(0, 0, 128, 128);
    halo = new T.Mesh(new T.PlaneGeometry(5.4, 5.4), new T.MeshBasicMaterial({ map: new T.CanvasTexture(hc), transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    halo.position.set((0.5 - 0.5) * Wp, (0.5 - 0.215) * Hp, 0.03); scene.add(halo);

    // shards drifting in the void
    var N = 90, geo = new T.IcosahedronGeometry(0.28, 0);
    shards = new T.InstancedMesh(geo, new T.MeshStandardMaterial({ color: 0x221a44, emissive: 0x6a3cff, emissiveIntensity: 0.7, flatShading: true, roughness: 0.5, metalness: 0.2 }), N);
    S.shardData = []; for (i = 0; i < N; i++) S.shardData.push({ a: Math.random() * 6.28, r: 3 + Math.random() * 9, y: (Math.random() - 0.5) * 9, z: -9 + Math.random() * 12, s: 0.4 + Math.random() * 1.2, sp: 0.03 + Math.random() * 0.08, rx: Math.random() * 6, ry: Math.random() * 6 });
    scene.add(shards);

    // god rays
    for (i = 0; i < 3; i++) {
      var r = new T.Mesh(new T.PlaneGeometry(1.6 + i * 0.7, 18), new T.MeshBasicMaterial({ color: 0xc46bff, transparent: true, opacity: 0.06, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide }));
      r.position.set(-3 + i * 3, 4, -4 - i); r.rotation.z = -0.35 + i * 0.28; scene.add(r); rays.push(r);
    }

    // the crystal
    crystal = new T.Group();
    var cm = new T.Mesh(new T.OctahedronGeometry(1, 0), new T.MeshStandardMaterial({ color: 0x1a3050, emissive: 0x39e6ff, emissiveIntensity: 1.1, flatShading: true, transparent: true, opacity: 0.92, roughness: 0.2, metalness: 0.4 }));
    cm.scale.set(0.7, 1.35, 0.7); crystal.add(cm);
    var cw = new T.Mesh(new T.OctahedronGeometry(1.18, 0), new T.MeshBasicMaterial({ color: 0x9fefff, wireframe: true, transparent: true, opacity: 0.35, fog: false }));
    cw.scale.set(0.7, 1.35, 0.7); crystal.add(cw);
    crystalL = new T.PointLight(0x39e6ff, 0, 14); crystal.add(crystalL);
    crystal.position.set(0, 0.3, 2.4); crystal.scale.setScalar(0.001); scene.add(crystal);

    // the gate: a ring of light and a swirling portal
    gate = new T.Group();
    var ring = new T.Mesh(new T.TorusGeometry(2.3, 0.13, 16, 72), new T.MeshBasicMaterial({ color: 0xffd34d, fog: false }));
    gate.add(ring); S.gateRing = ring;
    var ring2 = new T.Mesh(new T.TorusGeometry(2.7, 0.04, 8, 72), new T.MeshBasicMaterial({ color: 0xc46bff, transparent: true, opacity: 0.7, fog: false }));
    gate.add(ring2); S.gateRing2 = ring2;
    gateMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: { t: { value: 0 }, c1: { value: new T.Color(0xffd34d) }, c2: { value: new T.Color(0xff9a5c) }, open: { value: 0 } },
      vertexShader: 'varying vec2 v; void main(){ v = uv - 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec2 v; uniform float t, open; uniform vec3 c1, c2; void main(){ float r = length(v) * 2.0; if (r > open) discard; float a = atan(v.y, v.x); float s = sin(a * 5.0 + r * 9.0 - t * 2.2) * 0.5 + 0.5; float g = smoothstep(1.0, 0.0, r / max(open,0.001)); vec3 col = mix(c1, c2, s) * (0.35 + g * 1.1); gl_FragColor = vec4(col, (0.25 + g * 0.75)); }',
    });
    var disc = new T.Mesh(new T.CircleGeometry(2.3, 64), gateMat); disc.position.z = 0.02; gate.add(disc);
    gate.position.set(0, 0.2, 2.2); gate.visible = false; scene.add(gate);

    // motes + sparks (additive points)
    var mp = new Float32Array(70 * 3); for (i = 0; i < 70; i++) { mp[i * 3] = (Math.random() - 0.5) * 22; mp[i * 3 + 1] = (Math.random() - 0.5) * 13; mp[i * 3 + 2] = -6 + Math.random() * 9; }
    var mg = new T.BufferGeometry(); mg.setAttribute('position', new T.BufferAttribute(mp, 3));
    motes = new T.Points(mg, new T.PointsMaterial({ color: 0x7cffb2, size: 0.13, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false })); scene.add(motes);
    var SN = 160, spp = new Float32Array(SN * 3), spc = new Float32Array(SN * 3);
    var spg = new T.BufferGeometry(); spg.setAttribute('position', new T.BufferAttribute(spp, 3)); spg.setAttribute('color', new T.BufferAttribute(spc, 3));
    sparks = new T.Points(spg, new T.PointsMaterial({ size: 0.2, vertexColors: true, transparent: true, opacity: 1, blending: T.AdditiveBlending, depthWrite: false }));
    sparks.frustumCulled = false; S.sp = { n: SN, v: new Float32Array(SN * 3), life: new Float32Array(SN), pos: spp, col: spc, i: 0 }; scene.add(sparks);

    S.ready = true; resize(); S.setMood('void', true); S.setFocus('queen', true);
    return true;
  }

  function resize() {
    if (!renderer) return;
    var c = renderer.domElement.parentNode, r = c.getBoundingClientRect();
    W = Math.max(2, r.width); H = Math.max(2, r.height);
    renderer.setSize(W, H, true); camera.aspect = W / H; camera.updateProjectionMatrix();
    aim(true);
  }

  // where the camera goes for the current focus (the art is kept clear of the dialogue)
  function aim(snap) {
    var land = W / H >= 1.05, d0, fov = camera.fov * Math.PI / 180, tanH = Math.tan(fov / 2);
    var wall = S.stage !== 'chat';                              // the phone's lock / home / app screens: the art is a wallpaper, centred
    var vh = wall ? 0.88 : (land ? 1 : 0.62);                   // the share of the height the art may use (in the chat, portrait: the sheet takes the lower part)
    d0 = (Hp * 1.02) / (2 * tanH * vh);                          // distance at which the whole art fits that share
    var f = S.focus, ch = CHAR[f], zoom = ch ? (wall ? Math.max(0.9, ch[2]) : ch[2]) : 1.0;
    var cx = ch ? (ch[0] - 0.5) * Wp : 0, cy = ch ? (0.5 - ch[1]) * Hp : 0;
    var d = d0 * (ch ? zoom : 1.0);
    var vis = 2 * d * tanH, visW = vis * camera.aspect;
    var shiftX = (!wall && land) ? visW * 0.20 : 0, shiftY = wall ? -vis * 0.02 : (land ? 0 : -vis * 0.17);   // in the chat the world moves left (landscape) or up (portrait), out of the sheet's way
    camT.lx = cx + shiftX; camT.ly = cy + shiftY; camT.x = camT.lx; camT.y = camT.ly; camT.z = d;
    S.layout = { land: land, d0: d0 };
    if (snap) { for (var k in camT) cam[k] = camT[k]; }
  }

  S.setMood = function (m, snap) {
    S.mood = MOODS[m] ? m : 'void'; S.moodT = MOODS[S.mood];
    if (snap && S.ready) { var M = S.moodT; scene.fog.color.setHex(M.fog); scene.background.setHex(M.fog); keyL.color.setHex(M.key); rimL.color.setHex(M.rim); shards.material.emissive.setHex(M.shard); artMat.color.setRGB(M.tint[0], M.tint[1], M.tint[2]); if (bgMat) bgMat.color.setRGB(M.tint[0], M.tint[1], M.tint[2]); scene.fog.density = M.dens; }
  };
  S.setFocus = function (f, snap) {
    S.focus = f;
    lookT.crystal = f === 'crystal' ? 1 : 0; lookT.gate = f === 'gate' ? 1 : 0;
    lookT.artA = (f === 'crystal' || f === 'gate') ? 0.18 : 1;
    if (S.ready) { aim(!!snap); if (snap) { look.crystal = lookT.crystal; look.gate = lookT.gate; look.artA = lookT.artA; } }
  };
  S.setStage = function (stage, dim) { S.stage = stage; S.dimT = dim == null ? 1 : dim; if (S.ready) aim(false); };
  S.setTorch = function (on) { S.torchT = on ? 1 : 0; };
  S.setDread = function (d) { S.dread = Math.max(0, Math.min(1, d || 0)); };
  S.setGate = function (ending) {
    if (!S.ready) return;                                           // no 3D (blocked library, no WebGL): the ending still shows over the picture
    var g = GATE[ending] || GATE.dawn; gateMat.uniforms.c1.value.setHex(g[0]); gateMat.uniforms.c2.value.setHex(g[1]);
    S.gateRing.material.color.setHex(g[0]); S.gateRing2.material.color.setHex(g[1]);
  };
  S.openGate = function (v) { lookT.open = v ? 1 : 0; };

  // sparks from a point on the screen (px) - a choice, a note, a gate
  S.burst = function (px, py, color, n, speed) {
    if (!S.ready || S.reduced) return;
    var v = new T.Vector3((px / W) * 2 - 1, -(py / H) * 2 + 1, 0.5).unproject(camera), dir = v.sub(camera.position).normalize();
    var p = camera.position.clone().add(dir.multiplyScalar((1.5 - camera.position.z) / (dir.z || -1)));      // where that ray meets the plane z = 1.5, in front of the art
    var P = S.sp, c = tmpC.setHex(color || 0x39e6ff); n = n || 26; speed = speed || 3.2;
    for (var i = 0; i < n; i++) {
      var k = P.i++ % P.n, a = Math.random() * 6.283, b = (Math.random() - 0.3) * 2, s = speed * (0.4 + Math.random());
      P.pos[k * 3] = p.x; P.pos[k * 3 + 1] = p.y; P.pos[k * 3 + 2] = p.z;
      P.v[k * 3] = Math.cos(a) * s; P.v[k * 3 + 1] = Math.sin(a) * s * 0.8 + b; P.v[k * 3 + 2] = (Math.random() - 0.5) * 2;
      P.col[k * 3] = c.r; P.col[k * 3 + 1] = c.g; P.col[k * 3 + 2] = c.b; P.life[k] = 0.7 + Math.random() * 0.8;
    }
  };

  S.pointer = function (nx, ny) { pointer.x = nx; pointer.y = ny; };
  S.tilt = function (x, y) { tilt.x = x; tilt.y = y; };

  var m4 = null, q = null, e = null, v3 = null, sc = null, lastT = 0;
  S.render = function (now) {
    if (!S.ready) return;
    var t = now * 0.001, dt = Math.min(0.05, lastT ? t - lastT : 0.016); lastT = t;
    var rm = S.reduced ? 0 : 1, ease = 1 - Math.pow(0.001, dt * 0.9), M = S.moodT;

    // mood: fog, lights, tint, shard glow
    tmpC.setHex(M.fog); scene.fog.color.lerp(tmpC, ease); scene.background.lerp(tmpC, ease); scene.fog.density += (M.dens - scene.fog.density) * ease;
    tmpC.setHex(M.key); keyL.color.lerp(tmpC, ease); tmpC.setHex(M.rim); rimL.color.lerp(tmpC, ease);
    tmpC.setHex(M.shard); shards.material.emissive.lerp(tmpC, ease); if (S.dread > 0) { tmpC.setHex(0xff1830); shards.material.emissive.lerp(tmpC, S.dread * 0.35 * ease * 3); }
    if (bgMat) { bgMat.color.r += (M.tint[0] - bgMat.color.r) * ease; bgMat.color.g += (M.tint[1] - bgMat.color.g) * ease; bgMat.color.b += (M.tint[2] - bgMat.color.b) * ease; var fade = 1 - Math.pow(0.25, dt); S.dark += ((S.mood === 'dark' ? 1 : 0) - S.dark) * fade; S.throne += ((S.mood === 'throne' ? 1 : 0) - S.throne) * fade; var other = Math.max(S.dark, S.throne);
      bgMat.opacity = Math.min(1, 0.55 + 0.45 * (1 - S.dim) + (1 - look.artA) * 0.25) * (1 - other * 0.9);
      if (bg3) { bg3Mat.opacity = Math.min(1, S.throne * (0.75 + 0.25 * (1 - S.dim) + (1 - look.artA) * 0.3)); bg3.position.x = bg.position.x; bg3.position.y = bg.position.y; bg3.scale.setScalar(1.02 + Math.sin(t * 0.4) * 0.012 * rm); bg3Mat.color.setScalar(0.85 + 0.15 * Math.sin(t * 1.1)); }
      if (bg2) { bg2Mat.opacity = Math.min(1, S.dark * (0.7 + 0.3 * (1 - S.dim) + (1 - look.artA) * 0.3)); bg2.position.x = bg.position.x; bg2.position.y = bg.position.y; bg2.scale.setScalar(1 + Math.sin(t * 0.55) * 0.012 * rm); bg2Mat.color.setScalar(0.85 + 0.15 * Math.sin(t * 0.9)); } bg.position.x = -camera.position.x * 2.2 + Math.sin(t * 0.02) * 1.2 * rm; bg.position.y = 1 - camera.position.y * 1.2; }
    S.torch += (S.torchT - S.torch) * ease; var tb = 1 + S.torch * 0.4;
    artMat.color.r += (M.tint[0] * tb - artMat.color.r) * ease; artMat.color.g += (M.tint[1] * tb - artMat.color.g) * ease; artMat.color.b += (M.tint[2] * tb - artMat.color.b) * ease;
    for (var i = 0; i < rays.length; i++) { rays[i].material.color.lerp(keyL.color, ease); rays[i].material.opacity += (M.rays * (0.8 + 0.4 * Math.sin(t * 0.4 + i)) - rays[i].material.opacity) * ease; rays[i].position.x += Math.sin(t * 0.12 + i) * 0.0015 * rm; }

    // focus: look and set pieces
    for (var k in lookT) look[k] += (lookT[k] - look[k]) * (1 - Math.pow(0.002, dt));
    for (k in camT) cam[k] += (camT[k] - cam[k]) * (1 - Math.pow(0.0006, dt));
    var sway = rm * 0.22, px = pointer.x * 0.35 + tilt.x * 0.5, py = pointer.y * 0.2 + tilt.y * 0.3;
    camera.position.set(cam.x + Math.sin(t * 0.17) * sway + px, cam.y + Math.sin(t * 0.13) * sway * 0.6 + py, cam.z);
    if (S.dread > 0.66 && rm) { camera.position.x += (Math.random() - 0.5) * 0.04 * S.dread; camera.position.y += (Math.random() - 0.5) * 0.03 * S.dread; }
    torchL.intensity = S.torch * 2.6; torchL.position.set(camera.position.x, camera.position.y, camera.position.z - 3); torchCone.material.opacity = S.torch * 0.22 * (0.85 + 0.15 * Math.sin(t * 9)); torchCone.position.set(cam.lx, cam.ly, 3);
    camera.lookAt(cam.lx, cam.ly, 0);
    S.dim += (S.dimT - S.dim) * ease; artMat.opacity = look.artA * S.dim * (1 - S.throne * 0.5); art.position.z = (1 - look.artA) * -1.2;
    var pulse = 0.5 + 0.5 * Math.sin(t * 1.6); halo.material.opacity = (0.35 + pulse * 0.4) * look.artA * S.dim; halo.scale.setScalar(1 + pulse * 0.06);

    crystal.visible = look.crystal > 0.01;
    if (crystal.visible) {
      var cs = (0.2 + look.crystal * 1.25) * (S.layout.land ? 0.8 : 1); crystal.scale.setScalar(cs); crystal.rotation.y = t * 0.6 * (rm || 0.2); crystal.position.y = 0.3 + Math.sin(t * 0.9) * 0.18 * rm + cam.ly * 0.0;
      crystal.position.x = cam.lx; crystalL.intensity = look.crystal * (2.2 + Math.sin(t * 2.4) * 0.6);
    }
    gate.visible = look.gate > 0.01;
    if (gate.visible) {
      gate.position.x = cam.lx; gate.scale.setScalar((0.35 + look.gate * 0.65) * (S.layout.land ? 0.62 : 0.8)); gate.rotation.z = t * 0.05 * rm; S.gateRing2.rotation.z = -t * 0.2 * rm;
      gateMat.uniforms.t.value = t; gateMat.uniforms.open.value += (lookT.open * 1.0 - gateMat.uniforms.open.value) * (1 - Math.pow(0.15, dt));
    }

    // shards
    if (!m4) { m4 = new T.Matrix4(); q = new T.Quaternion(); e = new T.Euler(); v3 = new T.Vector3(); sc = new T.Vector3(); }
    for (i = 0; i < S.shardData.length; i++) {
      var s = S.shardData[i], a = s.a + t * s.sp * rm;
      v3.set(Math.cos(a) * s.r, s.y + Math.sin(t * 0.3 + i) * 0.3 * rm, s.z + Math.sin(a) * 2.2);
      e.set(s.rx + t * 0.2 * rm, s.ry + t * 0.15 * rm, 0); q.setFromEuler(e); sc.setScalar(s.s);
      m4.compose(v3, q, sc); shards.setMatrixAt(i, m4);
    }
    shards.instanceMatrix.needsUpdate = true;
    S.stars.rotation.y = t * 0.006 * rm; S.neb.position.x = Math.sin(t * 0.03) * 0.5 * rm;
    if (rm) { var mp = motes.geometry.attributes.position; for (i = 0; i < mp.count; i++) { mp.setX(i, mp.getX(i) + Math.sin(t * 0.5 + i) * 0.0025); mp.setY(i, mp.getY(i) + Math.cos(t * 0.4 + i * 0.5) * 0.0025 + 0.0006); if (mp.getY(i) > 7) mp.setY(i, -7); } mp.needsUpdate = true; }

    // sparks
    var P = S.sp, any = false;
    for (i = 0; i < P.n; i++) if (P.life[i] > 0) {
      any = true; P.life[i] -= dt; var j = i * 3;
      P.pos[j] += P.v[j] * dt; P.pos[j + 1] += P.v[j + 1] * dt; P.pos[j + 2] += P.v[j + 2] * dt; P.v[j] *= 0.97; P.v[j + 1] = P.v[j + 1] * 0.97 - 1.2 * dt;
      if (P.life[i] <= 0) P.pos[j + 1] = -999;
    }
    if (any) sparks.geometry.attributes.position.needsUpdate = true;

    renderer.render(scene, camera); S.frames++;
  };

  S.init = function (container, img, bgImg, bgImg2, bgImg3) { return make(container, img, bgImg, bgImg2, bgImg3); };
  S.resize = resize;
  S.drawCalls = function () { return renderer ? renderer.info.render.calls : 0; };
  S.camera = function () { return camera ? { x: camera.position.x, y: camera.position.y, z: camera.position.z } : null; };
  S.canvas = function () { return renderer && renderer.domElement; };
  return S;
})();
