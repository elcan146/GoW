import Phaser from 'phaser';

const FACTIONS = [
  'elarion', 'elderveld', 'kalthrone', 'hotc', 'hochreich',
  'ravaria', 'varkazan', 'monster', 'unknown',
];

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('preload');
  }

  preload(): void {
    for (const f of FACTIONS) {
      this.load.image(`back-${f}`, `/card_back/${f}_back.png`);
    }
    // Audio is handled by Howler (src/audio.ts) — not Phaser's loader.
  }

  create(): void {
    // Placeholder card face shown while real art lazy-loads.
    const p = this.add.graphics();
    p.fillStyle(0x0a080c, 1).fillRoundedRect(0, 0, 72, 104, 6);
    p.lineStyle(2, 0x2e2830, 1).strokeRoundedRect(0, 0, 72, 104, 6);
    p.lineStyle(1, 0x7a0e16, 0.6).strokeRoundedRect(6, 6, 60, 92, 4);
    p.generateTexture('card-ph', 72, 104);
    p.destroy();

    // Soft white dot for particle emitters.
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
    g.generateTexture('dot', 16, 16);
    g.destroy();

    // Soft radial glow — used for the rarity aura behind cards. Concentric
    // alpha circles approximate a radial gradient (Graphics has no radial
    // fill, and canvas textures render opaque black under WebGL here).
    const gl = this.add.graphics();
    for (let i = 8; i >= 1; i--) {
      gl.fillStyle(0xffffff, 0.14);
      gl.fillCircle(32, 32, i * 4);
    }
    gl.generateTexture('glow', 64, 64);
    gl.destroy();

    // Wait for webfonts so canvas text doesn't fall back to serif.
    const start = () => this.scene.start('board');
    let started = false;
    const go = () => { if (!started) { started = true; start(); } };
    document.fonts?.ready.then(go);
    this.time.delayedCall(1500, go);
  }
}
