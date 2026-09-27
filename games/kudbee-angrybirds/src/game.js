KAB.Game = class {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = 960;
    this.canvas.height = 600;

    this.physics = new KAB.Physics();
    this.particles = new KAB.Particles();
    this.audio = new KAB.Audio();

    this.state = 'menu';
    this.level = 1;
    this.score = 0;
    this.totalScore = 0;
    this.birdQueue = [];
    this.currentBird = null;
    this.launched = false;
    this.screenShake = 0;
    this.combo = 0;
    this.comboTimer = 0;

    // Slingshot
    this.slingshotX = 120;
    this.slingshotY = 500;
    this.slingshotDist = 80;
    this.mouseDown = false;
    this.mouseX = this.slingshotX;
    this.mouseY = this.slingshotY;

    // Bird types: cyan (fast), gold (heavy), green (bouncy)
    this.birdTypes = ['cyan', 'gold', 'green'];
    this.birdSpecs = {
      cyan: { w: 14, h: 14, mass: 1, restitution: 0.5, color: '#39e6ff', speed: 1.2 },
      gold: { w: 18, h: 18, mass: 1.8, restitution: 0.3, color: '#ffd34d', speed: 0.8 },
      green: { w: 16, h: 16, mass: 1.2, restitution: 0.8, color: '#7CFFb2', speed: 1.0 }
    };

    this.setupLevel(1);
    this.setupInput();
    this.animate();
  }

  setupLevel(levelNum) {
    this.physics.bodies = [];
    if (levelNum === 1) this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.launched = false;
    this.setupBirdQueue(levelNum);
    this.currentBird = this.spawnBird();

    if (levelNum === 1) this.createLevel1();
    else if (levelNum === 2) this.createLevel2();
    else if (levelNum === 3) this.createLevel3();
    else if (levelNum === 4) this.createLevel4();
    else if (levelNum === 5) this.createLevel5();
    else if (levelNum === 6) this.createLevel6();

    this.state = 'playing';
  }

  setupBirdQueue(levelNum) {
    const queues = {
      1: ['cyan', 'cyan', 'gold'],
      2: ['cyan', 'green', 'gold'],
      3: ['green', 'cyan', 'cyan', 'gold'],
      4: ['gold', 'cyan', 'green', 'cyan'],
      5: ['cyan', 'cyan', 'green', 'gold', 'cyan'],
      6: ['green', 'gold', 'cyan', 'green', 'cyan']
    };
    this.birdQueue = queues[levelNum] || ['cyan', 'cyan', 'gold'];
  }

  spawnBird() {
    if (this.birdQueue.length === 0) return null;
    const type = this.birdQueue.shift();
    const spec = this.birdSpecs[type];
    const bird = new KAB.Body(this.slingshotX, this.slingshotY, spec.w, spec.h, 'dynamic');
    bird.restitution = spec.restitution;
    bird.color = spec.color;
    bird.type_name = 'bird';
    bird.birdType = type;
    bird.speedMult = spec.speed;
    this.physics.add(bird);
    return bird;
  }

  createLevel1() {
    this.physics.add(new KAB.Body(480, 580, 960, 40, 'static')).color = '#2a4a5a';
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3 - i; j++) {
        const x = 600 + j * 50 + i * 25;
        const y = 500 - i * 50;
        const block = new KAB.Body(x, y, 40, 40, 'dynamic');
        block.color = '#c46bff';
        block.restitution = 0.4;
        this.physics.add(block);
      }
    }
    const enemy = new KAB.Body(700, 450, 20, 20, 'dynamic');
    enemy.color = '#ff5d9e';
    enemy.type_name = 'enemy';
    this.physics.add(enemy);
  }

  createLevel2() {
    this.physics.add(new KAB.Body(480, 580, 960, 40, 'static')).color = '#2a4a5a';
    for (let i = 0; i < 4; i++) {
      const b1 = new KAB.Body(550 + i * 50, 520 - i * 40, 40, 40, 'dynamic');
      b1.color = '#ffd34d';
      this.physics.add(b1);
      const b2 = new KAB.Body(700 + i * 50, 520 - i * 40, 40, 40, 'dynamic');
      b2.color = '#39e6ff';
      this.physics.add(b2);
    }
    const enemy = new KAB.Body(680, 420, 20, 20, 'dynamic');
    enemy.color = '#ff5d9e';
    enemy.type_name = 'enemy';
    this.physics.add(enemy);
  }

  createLevel3() {
    this.physics.add(new KAB.Body(480, 580, 960, 40, 'static')).color = '#2a4a5a';
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        if ((i + j) % 2 === 0) {
          const x = 520 + j * 35;
          const y = 500 - i * 40;
          const block = new KAB.Body(x, y, 35, 35, 'dynamic');
          block.color = ['#39e6ff', '#ffd34d', '#c46bff', '#7CFFb2'][Math.floor(Math.random() * 4)];
          this.physics.add(block);
        }
      }
    }
    const e1 = new KAB.Body(620, 400, 18, 18, 'dynamic');
    e1.color = '#ff5d9e';
    e1.type_name = 'enemy';
    this.physics.add(e1);
    const e2 = new KAB.Body(720, 420, 18, 18, 'dynamic');
    e2.color = '#ff5d9e';
    e2.type_name = 'enemy';
    this.physics.add(e2);
  }

  createLevel4() {
    this.physics.add(new KAB.Body(480, 580, 960, 40, 'static')).color = '#2a4a5a';
    // Castle structure
    const castle = [
      {x: 600, y: 520, w: 50, h: 50}, {x: 700, y: 520, w: 50, h: 50},
      {x: 650, y: 450, w: 50, h: 50}, {x: 600, y: 380, w: 40, h: 40},
      {x: 700, y: 380, w: 40, h: 40}, {x: 650, y: 300, w: 40, h: 40}
    ];
    castle.forEach(b => {
      const block = new KAB.Body(b.x, b.y, b.w, b.h, 'dynamic');
      block.color = ['#39e6ff', '#ffd34d'][Math.floor(Math.random() * 2)];
      this.physics.add(block);
    });
    for (let i = 0; i < 2; i++) {
      const enemy = new KAB.Body(580 + i * 140, 480, 18, 18, 'dynamic');
      enemy.color = '#ff5d9e';
      enemy.type_name = 'enemy';
      this.physics.add(enemy);
    }
  }

  createLevel5() {
    this.physics.add(new KAB.Body(480, 580, 960, 40, 'static')).color = '#2a4a5a';
    // Bridge structure
    for (let x = 550; x < 800; x += 45) {
      const block = new KAB.Body(x, 500, 40, 20, 'dynamic');
      block.color = '#c46bff';
      this.physics.add(block);
    }
    // Tower on bridge
    for (let i = 0; i < 3; i++) {
      const block = new KAB.Body(675, 450 - i * 45, 40, 40, 'dynamic');
      block.color = '#ffd34d';
      this.physics.add(block);
    }
    for (let i = 0; i < 2; i++) {
      const enemy = new KAB.Body(650 + i * 50, 410, 18, 18, 'dynamic');
      enemy.color = '#ff5d9e';
      enemy.type_name = 'enemy';
      this.physics.add(enemy);
    }
  }

  createLevel6() {
    this.physics.add(new KAB.Body(480, 580, 960, 40, 'static')).color = '#2a4a5a';
    // Boss level: massive structure
    const structures = [
      {x: 550, y: 500, w: 60, h: 60}, {x: 700, y: 500, w: 60, h: 60},
      {x: 625, y: 410, w: 50, h: 50}, {x: 625, y: 320, w: 50, h: 50},
      {x: 550, y: 240, w: 40, h: 40}, {x: 700, y: 240, w: 40, h: 40}
    ];
    structures.forEach(s => {
      const block = new KAB.Body(s.x, s.y, s.w, s.h, 'dynamic');
      block.color = ['#39e6ff', '#ffd34d', '#7CFFb2'][Math.floor(Math.random() * 3)];
      this.physics.add(block);
    });
    for (let i = 0; i < 3; i++) {
      const enemy = new KAB.Body(550 + i * 75, 460, 20, 20, 'dynamic');
      enemy.color = '#ff5d9e';
      enemy.type_name = 'enemy';
      this.physics.add(enemy);
    }
  }

  setupInput() {
    document.addEventListener('mousedown', e => this.onMouseDown(e));
    document.addEventListener('mousemove', e => this.onMouseMove(e));
    document.addEventListener('mouseup', e => this.onMouseUp(e));

    document.addEventListener('touchstart', e => this.onTouchStart(e));
    document.addEventListener('touchmove', e => this.onTouchMove(e));
    document.addEventListener('touchend', e => this.onTouchEnd(e));
  }

  onMouseDown(e) {
    if (this.state !== 'playing' || this.launched) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    const dx = x - this.slingshotX;
    const dy = y - this.slingshotY;
    if (dx * dx + dy * dy < 30 * 30) {
      this.mouseDown = true;
      this.mouseX = x;
      this.mouseY = y;
    }
  }

  onMouseMove(e) {
    if (!this.mouseDown) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
  }

  onMouseUp(e) {
    if (!this.mouseDown) return;
    this.mouseDown = false;
    this.launchBird();
  }

  onTouchStart(e) { this.onMouseDown({clientX: e.touches[0].clientX, clientY: e.touches[0].clientY}); }
  onTouchMove(e) { this.onMouseMove({clientX: e.touches[0].clientX, clientY: e.touches[0].clientY}); }
  onTouchEnd(e) { this.onMouseUp({}); }

  launchBird() {
    if (!this.currentBird || this.launched) return;
    const dx = this.slingshotX - this.mouseX;
    const dy = this.slingshotY - this.mouseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const power = Math.min(dist / 30, 3);
    const speedMult = this.currentBird.speedMult || 1;

    this.currentBird.vel.x = (dx / Math.max(dist, 1)) * power * 15 * speedMult;
    this.currentBird.vel.y = (dy / Math.max(dist, 1)) * power * 15 * speedMult;
    this.launched = true;
    this.audio.launch();

    setTimeout(() => {
      if (this.launched && this.currentBird && Math.abs(this.currentBird.vel.x) < 0.5 && Math.abs(this.currentBird.vel.y) < 0.5) {
        this.nextBirdOrLevelComplete();
      }
    }, 3000);
  }

  nextBirdOrLevelComplete() {
    if (this.birdQueue.length > 0) {
      this.launched = false;
      this.currentBird = this.spawnBird();
    } else {
      const enemies = this.physics.bodies.filter(b => b.type_name === 'enemy');
      if (enemies.length === 0) {
        this.state = 'levelComplete';
        this.score += 1000 + this.birdQueue.length * 300;
        this.totalScore += this.score;
        this.audio.levelComplete();
      } else {
        this.state = 'gameOver';
        this.totalScore += this.score;
        this.audio.gameOver();
      }
    }
  }

  update() {
    if (this.state !== 'playing') return;

    this.physics.step();
    this.particles.update();

    if (this.screenShake > 0) this.screenShake *= 0.9;
    if (this.comboTimer > 0) this.comboTimer--;

    const enemies = this.physics.bodies.filter(b => b.type_name === 'enemy');
    if (enemies.length === 0 && !this.launched) {
      this.state = 'levelComplete';
      this.score += 1000 + this.birdQueue.length * 300;
      this.totalScore += this.score;
      this.audio.levelComplete();
    }

    if (this.currentBird && this.currentBird.pos.x > 960) {
      this.nextBirdOrLevelComplete();
    }
  }

  draw() {
    this.ctx.fillStyle = '#0a0e27';
    this.ctx.fillRect(0, 0, 960, 600);

    const shake = this.screenShake > 0 ? KAB.Util.randRange(-this.screenShake, this.screenShake) : 0;

    this.ctx.save();
    this.ctx.translate(shake, shake * 0.5);

    // Draw level
    this.physics.bodies.forEach(body => {
      this.ctx.save();
      this.ctx.translate(body.pos.x, body.pos.y);
      this.ctx.rotate(body.rot);

      this.ctx.fillStyle = body.color || '#39e6ff';
      this.ctx.shadowColor = body.color ? body.color : '#00ffff';
      this.ctx.shadowBlur = 12;
      this.ctx.shadowOffsetX = 0;
      this.ctx.shadowOffsetY = 2;
      this.ctx.fillRect(-body.w / 2, -body.h / 2, body.w, body.h);

      // Outline glow
      this.ctx.strokeStyle = body.color;
      this.ctx.lineWidth = 1;
      this.ctx.globalAlpha = 0.6;
      this.ctx.shadowBlur = 0;
      this.ctx.strokeRect(-body.w / 2, -body.h / 2, body.w, body.h);
      this.ctx.globalAlpha = 1;
      this.ctx.restore();
    });

    // Draw slingshot with enhanced visuals
    this.ctx.strokeStyle = '#39e6ff';
    this.ctx.lineWidth = 4;
    this.ctx.shadowColor = '#39e6ff';
    this.ctx.shadowBlur = 12;
    this.ctx.beginPath();
    this.ctx.arc(this.slingshotX, this.slingshotY, 15, 0, Math.PI * 2);
    this.ctx.stroke();

    this.ctx.fillStyle = '#0a0e27';
    this.ctx.beginPath();
    this.ctx.arc(this.slingshotX, this.slingshotY, 8, 0, Math.PI * 2);
    this.ctx.fill();

    if (this.mouseDown && this.currentBird) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.slingshotX, this.slingshotY);
      this.ctx.lineTo(this.mouseX, this.mouseY);
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }
    this.ctx.shadowBlur = 0;

    this.particles.draw(this.ctx);
    this.ctx.restore();

    // HUD with enhanced styling
    this.ctx.fillStyle = '#39e6ff';
    this.ctx.font = 'bold 14px monospace';
    this.ctx.shadowColor = '#39e6ff';
    this.ctx.shadowBlur = 8;
    this.ctx.fillText(`LV${this.level}`, 20, 25);
    this.ctx.font = 'bold 18px monospace';
    this.ctx.fillText(this.score.toString().padStart(6, '0'), 20, 50);

    // Bird queue display
    this.ctx.font = '12px monospace';
    this.ctx.fillText('NEXT:', 870, 30);
    this.birdQueue.slice(0, 3).forEach((type, i) => {
      const spec = this.birdSpecs[type];
      this.ctx.fillStyle = spec.color;
      this.ctx.shadowColor = spec.color;
      this.ctx.beginPath();
      this.ctx.arc(885 + i * 20, 40, 6, 0, Math.PI * 2);
      this.ctx.fill();
    });

    this.ctx.shadowBlur = 0;

    if (this.state === 'levelComplete') {
      this.drawLevelComplete();
    } else if (this.state === 'gameOver') {
      this.drawGameOver();
    } else if (this.state === 'menu') {
      this.drawMenu();
    }
  }

  drawMenu() {
    this.ctx.fillStyle = 'rgba(10, 14, 39, 0.8)';
    this.ctx.fillRect(0, 0, 960, 600);
    this.ctx.fillStyle = '#39e6ff';
    this.ctx.font = 'bold 48px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#39e6ff';
    this.ctx.shadowBlur = 20;
    this.ctx.fillText('KUDBEE BIRDS', 480, 150);
    this.ctx.font = '20px monospace';
    this.ctx.fillText('Click and drag bird to aim, release to fire', 480, 220);
    this.ctx.fillText('Destroy all enemies to advance', 480, 260);
    this.ctx.fillText('CLICK TO START', 480, 350);
    this.ctx.shadowBlur = 0;
    this.ctx.textAlign = 'left';
  }

  drawLevelComplete() {
    this.ctx.fillStyle = 'rgba(10, 14, 39, 0.95)';
    this.ctx.fillRect(0, 0, 960, 600);

    const bonus = 1000 + this.birdQueue.length * 300;
    const levelColor = this.level >= 6 ? '#ffd34d' : '#7CFFb2';

    this.ctx.fillStyle = levelColor;
    this.ctx.font = 'bold 40px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = levelColor;
    this.ctx.shadowBlur = 20;
    this.ctx.fillText('LEVEL COMPLETE!', 480, 140);

    this.ctx.font = '20px monospace';
    this.ctx.fillStyle = '#39e6ff';
    this.ctx.fillText(`LEVEL ${this.level}`, 480, 200);
    this.ctx.fillStyle = '#ffd34d';
    this.ctx.fillText(`+${bonus} POINTS`, 480, 240);
    this.ctx.fillStyle = '#c46bff';
    this.ctx.fillText(`TOTAL: ${this.totalScore}`, 480, 280);

    if (this.level >= 6) {
      this.ctx.fillStyle = '#ff5d9e';
      this.ctx.font = 'bold 32px monospace';
      this.ctx.fillText('🎮 ALL LEVELS CLEARED! 🎮', 480, 350);
    }

    this.ctx.font = '16px monospace';
    this.ctx.fillStyle = '#39e6ff';
    this.ctx.fillText(this.level >= 6 ? 'CLICK TO RESTART' : 'CLICK FOR NEXT LEVEL', 480, 480);
    this.ctx.shadowBlur = 0;
    this.ctx.textAlign = 'left';
  }

  drawGameOver() {
    this.ctx.fillStyle = 'rgba(10, 14, 39, 0.95)';
    this.ctx.fillRect(0, 0, 960, 600);
    this.ctx.fillStyle = '#ff5d9e';
    this.ctx.font = 'bold 40px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#ff5d9e';
    this.ctx.shadowBlur = 20;
    this.ctx.fillText('GAME OVER', 480, 140);

    this.ctx.font = '20px monospace';
    this.ctx.fillStyle = '#39e6ff';
    this.ctx.fillText(`REACHED LEVEL: ${this.level}`, 480, 200);
    this.ctx.fillStyle = '#ffd34d';
    this.ctx.fillText(`LEVEL SCORE: ${this.score}`, 480, 240);
    this.ctx.fillStyle = '#c46bff';
    this.ctx.fillText(`TOTAL SCORE: ${this.totalScore}`, 480, 280);

    this.ctx.font = '16px monospace';
    this.ctx.fillStyle = '#39e6ff';
    this.ctx.fillText('CLICK TO RESTART', 480, 480);
    this.ctx.shadowBlur = 0;
    this.ctx.textAlign = 'left';
  }

  handleClick() {
    if (this.state === 'menu') {
      this.state = 'playing';
    } else if (this.state === 'levelComplete') {
      if (this.level >= 6) {
        this.level = 1;
        this.totalScore = 0;
        this.setupLevel(1);
      } else {
        this.level++;
        this.setupLevel(this.level);
      }
    } else if (this.state === 'gameOver') {
      this.level = 1;
      this.totalScore = 0;
      this.setupLevel(1);
    }
  }

  animate() {
    this.update();
    this.draw();
    requestAnimationFrame(() => this.animate());
  }
};

document.addEventListener('click', () => {
  if (window.game) window.game.handleClick();
});

document.addEventListener('DOMContentLoaded', () => {
  window.game = new KAB.Game();
});
