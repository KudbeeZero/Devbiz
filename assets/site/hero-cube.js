/* ═══════════════════════════════════════════════════════════════════════════
 * Kudbee Premium Hero Cube — Interactive 3D rotating cube in canvas
 * Adds premium "$1M website" visual appeal to the hero section
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  class HeroCube {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: false });
      this.width = canvas.width;
      this.height = canvas.height;
      this.time = 0;
      this.mouseX = 0.5;
      this.mouseY = 0.5;
      this.scrollProgress = 0;
      this.scrollVelocity = 0;  // scroll speed (positive = down, negative = up)
      this.lastScrollY = 0;
      this.scrollMomentum = 0;  // decaying momentum for smooth spinning

      // 3D cube vertices (normalized -1 to 1)
      this.vertices = [
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],  // back
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]       // front
      ];

      // Cube faces (indices into vertices)
      this.faces = [
        [0, 1, 2, 3],  // back
        [4, 5, 6, 7],  // front
        [0, 1, 5, 4],  // bottom
        [2, 3, 7, 6],  // top
        [0, 3, 7, 4],  // left
        [1, 2, 6, 5]   // right
      ];

      // Neon colors for each face (Kudbee palette)
      this.colors = [
        '#39e6ff',  // cyan
        '#c46bff',  // violet
        '#7CFFb2',  // green
        '#ffd34d',  // gold
        '#ff5d3c',  // ember
        '#bff3ff'   // light cyan
      ];

      // Animation is armed by init() — it runs only while the canvas is on screen.
      this.visible = false;
      this.running = false;
    }

    rotate(vertices, angleX, angleY, angleZ) {
      const rotX = angleX;
      const rotY = angleY;
      const rotZ = angleZ;

      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

      return vertices.map(v => {
        let [x, y, z] = v;

        // Rotate around X
        let y1 = y * cosX - z * sinX;
        let z1 = y * sinX + z * cosX;

        // Rotate around Y
        let x2 = x * cosY + z1 * sinY;
        let z2 = -x * sinY + z1 * cosY;

        // Rotate around Z
        let x3 = x2 * cosZ - y1 * sinZ;
        let y3 = x2 * sinZ + y1 * cosZ;

        return [x3, y3, z2];
      });
    }

    project(vertices, fov = 500) {
      return vertices.map(v => {
        const [x, y, z] = v;
        const scale = fov / (5 + z);
        return [
          x * scale + this.width / 2,
          y * scale + this.height / 2,
          z
        ];
      });
    }

    drawCube() {
      const time = this.time * 0.001;
      const mouseInfluence = (this.mouseX - 0.5) * 0.002;
      const scrollInfluence = this.scrollProgress * 0.003;

      // Scroll momentum drives the spin (decays over time)
      this.scrollMomentum *= 0.92;  // friction

      // Rotation angles (auto-rotating + mouse + scroll momentum)
      const angleX = time * 0.3 + (this.mouseY - 0.5) * 0.5 + this.scrollMomentum * 0.15;
      const angleY = time * 0.5 + mouseInfluence * 2 + this.scrollVelocity * 0.008;
      const angleZ = time * 0.2 + scrollInfluence + this.scrollMomentum * 0.08;

      // Transform vertices
      const rotated = this.rotate(this.vertices, angleX, angleY, angleZ);
      const projected = this.project(rotated);

      // Sort faces by average Z depth (painter's algorithm)
      const faceData = this.faces.map((face, idx) => {
        const avgZ = face.reduce((sum, i) => sum + rotated[i][2], 0) / face.length;
        return { face, idx, avgZ };
      });
      faceData.sort((a, b) => a.avgZ - b.avgZ);

      // Clear canvas
      this.ctx.clearRect(0, 0, this.width, this.height);

      // Draw each face
      faceData.forEach(({ face, idx }) => {
        const points = face.map(i => projected[i]);

        // Face color with glow
        const col = this.colors[idx];
        const alpha = 0.1 + (Math.sin(time + idx) * 0.05 + 0.5) * 0.15;

        // Draw face
        this.ctx.fillStyle = col;
        this.ctx.globalAlpha = alpha;
        this.ctx.beginPath();
        this.ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
          this.ctx.lineTo(points[i][0], points[i][1]);
        }
        this.ctx.closePath();
        this.ctx.fill();

        // Draw edge
        this.ctx.strokeStyle = col;
        this.ctx.globalAlpha = 0.4 + Math.sin(time + idx) * 0.1;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      });

      // Glow effect (light bloom)
      this.ctx.globalAlpha = 0.3;
      this.ctx.filter = 'blur(20px)';
      faceData.slice(-3).forEach(({ face, idx }) => {
        const points = face.map(i => projected[i]);
        this.ctx.fillStyle = this.colors[idx];
        this.ctx.beginPath();
        this.ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
          this.ctx.lineTo(points[i][0], points[i][1]);
        }
        this.ctx.closePath();
        this.ctx.fill();
      });
      this.ctx.filter = 'none';
      this.ctx.globalAlpha = 1;
    }

    startAnimation() {
      if (this.running) return;
      this.running = true;
      const animate = (timestamp) => {
        // Stop the loop while the canvas isn't rendered (display:none at ≤1024px); startAnimation() resumes it.
        if (!this.visible) { this.running = false; return; }
        this.time = timestamp;
        this.drawCube();
        requestAnimationFrame(animate);
      };

      requestAnimationFrame(animate);
    }
  }

  // Initialize when DOM is ready
  function init() {
    const canvas = document.getElementById('heroCube');
    if (!canvas) return;

    // Set canvas size
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.min(rect.width, 300);
    canvas.height = Math.min(rect.height, 300);

    const cube = new HeroCube(canvas);

    // Track mouse movement
    document.addEventListener('mousemove', (e) => {
      cube.mouseX = e.clientX / window.innerWidth;
      cube.mouseY = e.clientY / window.innerHeight;
    });

    // Track scroll and velocity for spinning
    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      cube.scrollProgress = scrolled / maxScroll;

      // Calculate scroll velocity (pixels per frame)
      const deltaScroll = scrolled - cube.lastScrollY;
      cube.scrollVelocity = deltaScroll;
      cube.scrollMomentum = Math.max(cube.scrollMomentum, deltaScroll * 0.5);
      cube.lastScrollY = scrolled;
    }, { passive: true });

    // Arm the animation after the page's load event, and only while rendered:
    // the blur-filtered redraw is the costliest per-frame work here, and it used
    // to run forever — even behind the intro overlay and on tablets/phones, where
    // the wrapper is display:none and nothing was visible.
    function armCube() {
      if (!('IntersectionObserver' in window)) { cube.visible = true; cube.startAnimation(); return; }
      new IntersectionObserver(function (entries) {
        cube.visible = entries[0].isIntersecting;
        if (cube.visible) cube.startAnimation();
      }).observe(canvas);
    }
    if (document.readyState === 'complete') armCube();
    else window.addEventListener('load', armCube, { once: true });

    // Responsive canvas resizing
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const newRect = canvas.parentElement.getBoundingClientRect();
        canvas.width = Math.min(newRect.width, 300);
        canvas.height = Math.min(newRect.height, 300);
      }, 250);
    });
  }

  // Wait for DOM if not ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
