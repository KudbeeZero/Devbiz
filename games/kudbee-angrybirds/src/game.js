KAB.Game = class {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = 960;
    this.canvas.height = 600;

    this.physics = new KAB.Physics();
    this.particles = new KAB.Particles();
    this.audio = new KAB.Audio();

    this.state = 'menu'; // menu, playing, levelComplete, gameOver
    this.level = 1;
    this.score = 0;
    this.birdsLeft = 3;
    this.currentBird = null;
    this.launched = false;

    // Slingshot
    this.slingshotX = 120;
    this.slingshotY = 500;
    this.slingshotDist = 80;
    this.mouseDown = false;
    this.mouseX = this.slingshotX;
    this.mouseY = this.slingshotY;

    this.setupLevel(1);
    this.setupInput();
    this.animate();
  }

  setupLevel(levelNum) {
    this.physics.bodies = [];
    this.score = levelNum === 1 ? 0 : this.score;
    this.birdsLeft = 3;
    this.launched = false;
    this.currentBird = this.spawnBird();

    if (levelNum === 1) {
      this.createLevel1();
    } else if (levelNum === 2) {
      this.createLevel2();
    } else {
      this.createLevel3();
    }

    this.state = 'playing';
  }

  spawnBird() {
    const bird = new KAB.Body(this.slingshotX, this.slingshotY, 16, 16, 'dynamic');
    bird.restitution = 0.6;
    bird.color = '#39e6ff';
    bird.type_name = 'bird';
    this.physics.add(bird);
    return bird;
  }

  createLevel1() {
    // Ground
    this.physics.add(new KAB.Body(480, 580, 960, 40, 'static')).color = '#2a4a5a';

    // Simple pyramid
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

    // Enemy
    const enemy = new KAB.Body(700, 450, 20, 20, 'dynamic');
    enemy.color = '#ff5d9e';
    enemy.type_name = 'enemy';
    this.physics.add(enemy);
  }

  createLevel2() {
    this.physics.add(new KAB.Body(480, 580, 960, 40, 'static')).color = '#2a4a5a';

    // Two towers
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

    // Complex structure
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

    this.currentBird.vel.x = (dx / Math.max(dist, 1)) * power * 15;
    this.currentBird.vel.y = (dy / Math.max(dist, 1)) * power * 15;
    this.launched = true;
    this.audio.launch();
    this.birdsLeft--;

    setTimeout(() => {
      if (this.launched && this.currentBird && Math.abs(this.currentBird.vel.x) < 0.5 && Math.abs(this.currentBird.vel.y) < 0.5) {
        this.nextBirdOrLevelComplete();
      }
    }, 3000);
  }

  nextBirdOrLevelComplete() {
    if (this.birdsLeft > 0) {
      this.launched = false;
      this.currentBird = this.spawnBird();
    } else {
      const enemies = this.physics.bodies.filter(b => b.type_name === 'enemy');
      if (enemies.length === 0) {
        this.state = 'levelComplete';
        this.score += 1000 + (this.birdsLeft + 1) * 500;
        this.audio.levelComplete();
      } else {
        this.state = 'gameOver';
        this.audio.gameOver();
      }
    }
  }

  update() {
    if (this.state !== 'playing') return;

    this.physics.step();
    this.particles.update();

    const enemies = this.physics.bodies.filter(b => b.type_name === 'enemy');
    if (enemies.length === 0 && !this.launched) {
      this.state = 'levelComplete';
      this.score += 1000 + (this.birdsLeft + 1) * 500;
      this.audio.levelComplete();
    }

    if (this.currentBird && this.currentBird.pos.x > 960) {
      this.nextBirdOrLevelComplete();
    }
  }

  draw() {
    this.ctx.fillStyle = '#0a0e27';
    this.ctx.fillRect(0, 0, 960, 600);

    // Draw level
    this.physics.bodies.forEach(body => {
      this.ctx.save();
      this.ctx.translate(body.pos.x, body.pos.y);
      this.ctx.rotate(body.rot);

      this.ctx.fillStyle = body.color || '#39e6ff';
      this.ctx.shadowColor = body.color ? body.color.replace('ff', 'cc') : '#00ffff';
      this.ctx.shadowBlur = 10;
      this.ctx.fillRect(-body.w / 2, -body.h / 2, body.w, body.h);
      this.ctx.shadowBlur = 0;
      this.ctx.restore();
    });

    // Draw slingshot
    this.ctx.strokeStyle = '#39e6ff';
    this.ctx.lineWidth = 3;
    this.ctx.shadowColor = '#39e6ff';
    this.ctx.shadowBlur = 8;
    this.ctx.beginPath();
    this.ctx.arc(this.slingshotX, this.slingshotY, 15, 0, Math.PI * 2);
    this.ctx.stroke();

    if (this.mouseDown && this.currentBird) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.slingshotX, this.slingshotY);
      this.ctx.lineTo(this.mouseX, this.mouseY);
      this.ctx.stroke();
    }
    this.ctx.shadowBlur = 0;

    this.particles.draw(this.ctx);

    // HUD
    this.ctx.fillStyle = '#39e6ff';
    this.ctx.font = 'bold 16px monospace';
    this.ctx.shadowColor = '#39e6ff';
    this.ctx.shadowBlur = 8;
    this.ctx.fillText(`SCORE: ${this.score}`, 20, 30);
    this.ctx.fillText(`LEVEL: ${this.level}`, 20, 55);
    this.ctx.fillText(`BIRDS: ${this.birdsLeft}`, 20, 80);
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
    this.ctx.fillStyle = 'rgba(10, 14, 39, 0.9)';
    this.ctx.fillRect(0, 0, 960, 600);
    this.ctx.fillStyle = '#7CFFb2';
    this.ctx.font = 'bold 40px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#7CFFb2';
    this.ctx.shadowBlur = 20;
    this.ctx.fillText('LEVEL COMPLETE!', 480, 200);
    this.ctx.font = '24px monospace';
    this.ctx.fillText(`+${1000 + (this.birdsLeft + 1) * 500} POINTS`, 480, 280);
    this.ctx.fillText('CLICK FOR NEXT LEVEL', 480, 380);
    this.ctx.shadowBlur = 0;
    this.ctx.textAlign = 'left';
  }

  drawGameOver() {
    this.ctx.fillStyle = 'rgba(10, 14, 39, 0.9)';
    this.ctx.fillRect(0, 0, 960, 600);
    this.ctx.fillStyle = '#ff5d9e';
    this.ctx.font = 'bold 40px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#ff5d9e';
    this.ctx.shadowBlur = 20;
    this.ctx.fillText('GAME OVER', 480, 200);
    this.ctx.font = '20px monospace';
    this.ctx.fillStyle = '#39e6ff';
    this.ctx.fillText(`FINAL SCORE: ${this.score}`, 480, 280);
    this.ctx.fillText('CLICK TO RESTART', 480, 380);
    this.ctx.shadowBlur = 0;
    this.ctx.textAlign = 'left';
  }

  handleClick() {
    if (this.state === 'menu') {
      this.state = 'playing';
    } else if (this.state === 'levelComplete') {
      this.level++;
      this.setupLevel(this.level);
    } else if (this.state === 'gameOver') {
      this.level = 1;
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
