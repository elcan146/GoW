import Phaser from 'phaser';
import { capacityFor, cardPower, sideTotal, type EngineState } from '../../game/effects';
import type { BoardCard, LocationState, Side } from '../../game/types';
import { CARD_H, CARD_W, CardSprite } from './CardSprite';

const BANNER_H = 76;
const PAD = 8;
const GAP = 6;
const COLS = 4;
/** Space between the card grid, the chaos row, and the banner. */
const CHAOS_GAP = 6;

/** Ambient particle recipe per location id (replaces the old CSS overlays). */
type Ambient = 'embers' | 'snow' | 'fog' | 'murk' | 'holy' | 'void';
const AMBIENT: Record<string, Ambient> = {
  lava: 'embers', dragons: 'embers', hell: 'embers',
  snowy: 'snow',
  'dense-forest': 'fog', shadowland: 'fog',
  swamps: 'murk', intestines: 'murk',
  heaven: 'holy', valhalla: 'holy',
  abyss: 'void',
};

export interface ZoneCallbacks {
  onPlay: (li: number) => void;
  onInspect: (c: BoardCard, power: number) => void;
  /** Card left this zone alive (moved elsewhere) — scene-space position. */
  onDepart?: (defId: string, x: number, y: number) => void;
}

export class LocationZone extends Phaser.GameObjects.Container {
  readonly li: number;
  locId = '';
  private zw = 100;
  private zh = 100;

  private bg: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Rectangle;
  private bannerBg: Phaser.GameObjects.Rectangle;
  private nameText: Phaser.GameObjects.Text;
  private descText: Phaser.GameObjects.Text;
  private aiCoin: Phaser.GameObjects.Arc;
  private aiTotalText: Phaser.GameObjects.Text;
  private pCoin: Phaser.GameObjects.Arc;
  private pTotalText: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private hit: Phaser.GameObjects.Zone;

  private sprites = new Map<string, CardSprite>();
  private chaosSprites: Partial<Record<Side, CardSprite>> = {};
  private chaosSlots: Partial<Record<Side, Phaser.GameObjects.Graphics>> = {};
  private chaosFire: Partial<Record<Side, Phaser.GameObjects.Particles.ParticleEmitter>> = {};
  /** Shared scale for grid + chaos cards — solved in layout/setLocation. */
  private gridScale = 1;
  private ambient: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private ambientKind: Ambient | null = null;
  private cb: ZoneCallbacks;
  private playable = false;
  private engine: EngineState | null = null;
  private loc: LocationState | null = null;

  constructor(scene: Phaser.Scene, li: number, cb: ZoneCallbacks) {
    super(scene, 0, 0);
    this.li = li;
    this.cb = cb;

    this.bg = scene.add.image(0, 0, 'card-ph');
    this.hit = scene.add.zone(0, 0, 10, 10).setInteractive();
    this.bannerBg = scene.add
      .rectangle(0, 0, 10, BANNER_H, 0x0a080c, 0.9)
      .setStrokeStyle(1, 0x7a0e16);
    this.nameText = scene.add
      .text(0, -16, '', {
        fontFamily: 'Cinzel, Georgia, serif',
        fontSize: '21px',
        color: '#e8ecf1',
        fontStyle: 'bold',
        resolution: 2,
      })
      .setOrigin(0.5);
    this.descText = scene.add
      .text(0, 16, '', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '13px',
        color: '#9aa3ad',
        align: 'center',
        resolution: 2,
      })
      .setOrigin(0.5);
    this.aiCoin = scene.add.circle(0, 0, 19, 0x7a0e16).setStrokeStyle(2, 0x101216);
    this.aiTotalText = scene.add
      .text(0, 0, '0', { fontFamily: '"Share Tech Mono", monospace', fontSize: '18px', color: '#ffb0b8', fontStyle: 'bold', resolution: 2 })
      .setOrigin(0.5);
    this.pCoin = scene.add.circle(0, 0, 19, 0xc8cdd4).setStrokeStyle(2, 0x101216);
    this.pTotalText = scene.add
      .text(0, 0, '0', { fontFamily: '"Share Tech Mono", monospace', fontSize: '18px', color: '#0a0c10', fontStyle: 'bold', resolution: 2 })
      .setOrigin(0.5);
    this.glow = scene.add
      .rectangle(0, 0, 10, 10)
      .setFillStyle(0xff2a3c, 0.06)
      .setStrokeStyle(2, 0xc1121f)
      .setVisible(false);
    this.hint = scene.add
      .text(0, 0, 'PLAY HERE', {
        fontFamily: 'Cinzel, Georgia, serif',
        fontSize: '18px',
        color: '#ff2a3c',
        fontStyle: 'bold',
        resolution: 2,
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.add([
      this.bg, this.hit, this.bannerBg, this.nameText, this.descText,
      this.aiCoin, this.aiTotalText, this.pCoin, this.pTotalText, this.glow, this.hint,
    ]);
    scene.add.existing(this);

    this.hit.on('pointerdown', () => { if (this.playable) this.cb.onPlay(this.li); });
    this.hit.on('pointerover', () => { if (this.playable) this.hint.setVisible(true); });
    this.hit.on('pointerout', () => this.hint.setVisible(false));
  }

  get isPlayable(): boolean {
    return this.playable;
  }

  /** Drag-hover state driven by the hand's pointer drag. */
  setHot(hot: boolean): void {
    if (hot) {
      this.glow.setVisible(true);
      this.glow.setStrokeStyle(2, this.playable ? 0xff2a3c : 0x565e68);
      this.glow.setFillStyle(this.playable ? 0xff2a3c : 0x565e68, this.playable ? 0.14 : 0.1);
      this.hint.setVisible(this.playable);
    } else {
      this.glow.setVisible(this.playable);
      this.glow.setStrokeStyle(2, 0xc1121f);
      this.glow.setFillStyle(0xff2a3c, 0.06);
      this.hint.setVisible(false);
    }
  }

  /** Subtle art parallax — bg drifts a few px opposite the cursor. */
  parallax(px: number, py: number): void {
    this.bg.setPosition(
      Phaser.Math.Clamp((this.x - px) * 0.014, -9, 9),
      Phaser.Math.Clamp((this.y - py) * 0.014, -9, 9),
    );
  }

  /** Round-transition reveal: black cover lifts off this zone. */
  playReveal(delayMs: number): void {
    const cover = this.scene.add.rectangle(0, 0, this.zw, this.zh, 0x060504, 1);
    this.add(cover);
    this.scene.tweens.add({
      targets: cover,
      alpha: 0,
      scaleY: 0.02,
      duration: 450,
      delay: delayMs,
      ease: 'Cubic.easeIn',
      onComplete: () => cover.destroy(),
    });
  }

  /** Round-end juice: flash the zone, pulse the winning side's coin. */
  flash(color: number): void {
    const f = this.scene.add
      .rectangle(this.x, this.y, this.zw, this.zh, color, 0)
      .setDepth(50);
    this.scene.tweens.add({
      targets: f,
      alpha: { from: 0, to: 0.3 },
      duration: 220,
      yoyo: true,
      repeat: 2,
      onComplete: () => f.destroy(),
    });
  }

  pulseCoin(side: Side): void {
    const coin = side === 'ai' ? this.aiCoin : this.pCoin;
    const txt = side === 'ai' ? this.aiTotalText : this.pTotalText;
    this.scene.tweens.add({
      targets: [coin, txt],
      scale: 1.6,
      duration: 260,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  }

  setDimmed(dim: boolean): void {
    this.scene.tweens.add({
      targets: this,
      alpha: dim ? 0.55 : 1,
      duration: 400,
    });
  }

  /** Is a scene-space point inside this zone's bounds? */
  containsPoint(x: number, y: number): boolean {
    return (
      x >= this.x - this.zw / 2 &&
      x <= this.x + this.zw / 2 &&
      y >= this.y - this.zh / 2 &&
      y <= this.y + this.zh / 2
    );
  }

  getSprite(instanceId: string): CardSprite | undefined {
    return this.sprites.get(instanceId);
  }

  dropSprite(instanceId: string): void {
    this.sprites.delete(instanceId);
  }

  layout(w: number, h: number): void {
    this.zw = w;
    this.zh = h;
    this.bg.setDisplaySize(w, h);
    this.hit.setSize(w, h);
    // Zone hit areas are top-left anchored — recenter so the clickable
    // region matches the visual zone instead of covering the hand.
    const ha = this.hit.input!.hitArea as Phaser.Geom.Rectangle;
    ha.setTo(-w / 2, -h / 2, w, h);
    this.glow.setSize(w - 4, h - 4);
    this.bannerBg.setSize(w - 8, BANNER_H);
    this.descText.setWordWrapWidth(w - 96);
    this.aiCoin.setPosition(-w / 2 + 32, 0);
    this.aiTotalText.setPosition(-w / 2 + 32, 0);
    this.pCoin.setPosition(w / 2 - 32, 0);
    this.pTotalText.setPosition(w / 2 - 32, 0);
    if (this.loc && this.engine) {
      this.gridScale = this.solveScale(capacityFor(this.loc));
      this.syncCards(this.loc, this.engine, new Set());
      this.drawChaosSlots();
    }
  }

  setLocation(loc: LocationState, state: EngineState, playable: boolean, dying: Set<string>): void {
    this.loc = loc;
    this.engine = state;
    this.playable = playable;
    this.locId = loc.def.id;

    const artKey = `loc-${loc.def.id}-${this.li}`;
    if (this.scene.textures.exists(artKey)) {
      this.bg.setTexture(artKey).setDisplaySize(this.zw, this.zh);
    }

    this.nameText.setText(loc.def.name.toUpperCase());
    this.descText.setText(loc.def.text);
    const aiT = sideTotal(state, this.li, 'ai');
    const pT = sideTotal(state, this.li, 'player');
    this.aiTotalText.setText(String(aiT));
    this.pTotalText.setText(String(pT));
    // Live scoreboard — the side ahead keeps a bright coin, loser dims.
    const tied = pT === aiT;
    this.pCoin.setAlpha(tied || pT > aiT ? 1 : 0.5);
    this.pTotalText.setAlpha(tied || pT > aiT ? 1 : 0.6);
    this.aiCoin.setAlpha(tied || aiT > pT ? 1 : 0.5);
    this.aiTotalText.setAlpha(tied || aiT > pT ? 1 : 0.6);
    this.glow.setVisible(playable);
    if (this.hit.input) this.hit.input.cursor = playable ? 'pointer' : 'default';

    this.gridScale = this.solveScale(capacityFor(loc));
    this.syncAmbient();
    this.syncCards(loc, state, dying);
    this.drawChaosSlots();
  }

  /** (Re)build the ambient particle emitter when the location kind changes. */
  private syncAmbient(): void {
    const kind = AMBIENT[this.loc!.def.id] ?? null;
    if (kind === this.ambientKind) return;
    this.ambientKind = kind;
    this.ambient?.destroy();
    this.ambient = null;
    if (!kind) return;

    const zone = {
      type: 'random' as const,
      source: {
        getRandomPoint: (p: { x: number; y: number }) => {
          p.x = Phaser.Math.FloatBetween(-this.zw / 2, this.zw / 2);
          p.y = Phaser.Math.FloatBetween(-this.zh / 2, this.zh / 2);
        },
      },
    };
    const base = { emitZone: zone, lifespan: 3000, quantity: 1 };
    const cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig =
      kind === 'embers'
        ? { ...base, speedY: { min: -30, max: -60 }, speedX: { min: -8, max: 8 }, scale: { start: 0.22, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: [0xff2a3c, 0xff6a5a, 0xc1121f], frequency: 140, blendMode: Phaser.BlendModes.ADD }
        : kind === 'snow'
          ? { ...base, speedY: { min: 18, max: 40 }, speedX: { min: -10, max: 10 }, scale: { min: 0.08, max: 0.2 }, alpha: { start: 0.7, end: 0.2 }, tint: 0xeaf4ff, frequency: 200 }
          : kind === 'fog'
            ? { ...base, speedX: { min: -14, max: 14 }, speedY: { min: -4, max: 4 }, scale: { min: 2.5, max: 5 }, alpha: { start: 0, end: 0.1 }, tint: 0x9aa3ad, frequency: 700, lifespan: 5000 }
            : kind === 'murk'
              ? { ...base, speedY: { min: -12, max: -26 }, scale: { min: 0.15, max: 0.4 }, alpha: { start: 0.35, end: 0 }, tint: [0x5a7832, 0x3c642d], frequency: 500 }
              : kind === 'holy'
                ? { ...base, speedY: { min: -10, max: -22 }, scale: { min: 0.1, max: 0.3 }, alpha: { start: 0.5, end: 0 }, tint: [0xe8ecf1, 0xff8a95], frequency: 380, blendMode: Phaser.BlendModes.ADD }
                : { ...base, scale: { min: 0.3, max: 0.9 }, alpha: { start: 0.3, end: 0 }, tint: [0x3a0a30, 0x1a0518], frequency: 600, lifespan: 4000 };
    this.ambient = this.scene.add.particles(0, 0, 'dot', cfg);
    this.addAt(this.ambient, 2); // above bg, below cards
  }

  private syncCards(loc: LocationState, state: EngineState, dying: Set<string>): void {
    const cap = capacityFor(loc);
    const seen = new Set<string>();
    for (const side of ['ai', 'player'] as Side[]) {
      loc[side].forEach((c, i) => {
        seen.add(c.instanceId);
        const { x, y, s } = this.slotPos(side, i, cap);
        let sp = this.sprites.get(c.instanceId);
        // Destroyed sprites lose their scene — drop the stale ref and rebuild.
        if (sp && !sp.scene) {
          this.sprites.delete(c.instanceId);
          sp = undefined;
        }
        if (!sp) {
          sp = new CardSprite(this.scene, x, y);
          this.add(sp);
          this.bringToTop(this.glow);
          this.bringToTop(this.hint);
          this.sprites.set(c.instanceId, sp);
          sp.setScale(s);
        } else if (!sp.dying && (sp.x !== x || sp.y !== y)) {
          this.scene.tweens.add({ targets: sp, x, y, duration: 180, ease: 'Cubic.easeOut' });
        }
        sp.setHome(x, y, s);
        sp.instanceId = c.instanceId;
        const d = sp.setCard(c.def, c.bonus, cardPower(state, this.li, side, c), side === 'ai' && !!c.faceDown, !!c.silenced);
        if (d !== null) this.spawnFloat(sp.x, sp.y, d);
        sp.off('pointerdown');
        sp.on('pointerdown', () => this.cb.onInspect(c, cardPower(state, this.li, side, c)));
      });
      this.syncChaos(side === 'ai' ? loc.aiChaos : loc.playerChaos, side, state, seen);
    }
    for (const [id, sp] of this.sprites) {
      if (!seen.has(id) && !dying.has(id) && !sp.dying) {
        this.sprites.delete(id);
        if (sp.def) this.cb.onDepart?.(sp.def.id, this.x + sp.x, this.y + sp.y);
        sp.destroy();
      }
    }
  }

  /** Floating +N/-N power-change number rising off a card. */
  private spawnFloat(x: number, y: number, delta: number): void {
    const t = this.scene.add
      .text(x, y - 30, `${delta > 0 ? '+' : ''}${delta}`, {
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: '17px',
        color: delta > 0 ? '#7ee787' : '#ff2a3c',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5);
    this.add(t);
    this.scene.tweens.add({
      targets: t,
      y: y - 78,
      alpha: { from: 1, to: 0 },
      scale: { from: 1.25, to: 0.9 },
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private syncChaos(
    card: BoardCard | null,
    side: Side,
    state: EngineState,
    seen: Set<string>,
  ): void {
    let existing = this.chaosSprites[side];
    if (existing && !existing.scene) {
      this.chaosSprites[side] = undefined;
      existing = undefined;
    }
    if (!card) {
      if (existing && !existing.dying) existing.destroy();
      this.chaosSprites[side] = undefined;
      this.chaosFire[side]?.destroy();
      this.chaosFire[side] = undefined;
      this.drawChaosSlots();
      return;
    }
    seen.add(card.instanceId);
    const { x, y } = this.chaosPos(side);
    const s = this.gridScale;
    let sp = existing;
    if (!sp || sp.instanceId !== card.instanceId) {
      if (sp && !sp.dying) sp.destroy();
      sp = new CardSprite(this.scene, x, y);
      this.add(sp);
      this.chaosSprites[side] = sp;
      // Dedicated wide hitbox — the chaos row is otherwise empty, so the
      // card is easy to click without touching the banner text or grid.
      sp.input!.hitArea.setTo(-CARD_W, -CARD_H / 2 - 4, CARD_W * 2, CARD_H + 8);
    }
    sp.setPosition(x, y);
    sp.setHome(x, y, s);
    sp.setScale(s);
    sp.instanceId = card.instanceId;
    const d = sp.setCard(card.def, card.bonus, cardPower(state, this.li, side, card), side === 'ai' && !!card.faceDown, !!card.silenced);
    if (d !== null) this.spawnFloat(sp.x, sp.y, d);
    sp.off('pointerdown');
    sp.on('pointerdown', () => this.cb.onInspect(card, cardPower(state, this.li, side, card)));
    this.sprites.set(card.instanceId, sp);
    this.syncChaosFire(side);
    this.drawChaosSlots();
  }

  /** Continuous fire licking around a live chaos card. */
  private syncChaosFire(side: Side): void {
    let em = this.chaosFire[side];
    if (!em) {
      const self = this;
      em = this.scene.add.particles(0, 0, 'dot', {
        lifespan: { min: 320, max: 650 },
        speedY: { min: -40, max: -85 },
        speedX: { min: -14, max: 14 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 0.85, end: 0 },
        tint: [0xff2a3c, 0xff6a2a, 0xffb02a, 0xc1121f],
        frequency: 40,
        blendMode: Phaser.BlendModes.ADD,
        emitZone: {
          type: 'random',
          source: {
            getRandomPoint: (p: { x: number; y: number }) => {
              const w = CARD_W * self.gridScale;
              const h = CARD_H * self.gridScale;
              p.x = Phaser.Math.FloatBetween(-w / 2, w / 2);
              p.y = Phaser.Math.FloatBetween(-h / 2, h / 2);
            },
          },
        },
      });
      this.add(em);
      this.chaosFire[side] = em;
    }
    const { x, y } = this.chaosPos(side);
    em.setPosition(x, y);
  }

  /** Empty-slot outline under each side's chaos row. */
  private drawChaosSlots(): void {
    for (const side of ['ai', 'player'] as Side[]) {
      let g = this.chaosSlots[side];
      if (!g) {
        g = this.scene.add.graphics();
        this.addAt(g, 3); // above bg/hit, below cards
        this.chaosSlots[side] = g;
      }
      g.clear();
      const { x, y } = this.chaosPos(side);
      const w = CARD_W * this.gridScale;
      const h = CARD_H * this.gridScale;
      const color = side === 'ai' ? 0x7a0e16 : 0x8a929c;
      g.fillStyle(0x060504, 0.35).fillRoundedRect(x - w / 2, y - h / 2, w, h, 5);
      g.lineStyle(1, color, 0.55).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 5);
      g.setVisible(!this.chaosSprites[side]);
    }
  }

  /**
   * Scale shared by grid + chaos cards. Each half of the zone stacks:
   * grid rows + chaos row (CARD_H*s) + gaps + half the banner — solved
   * analytically so everything fits without overlap.
   */
  private solveScale(cap: number): number {
    const halfH = this.zh / 2;
    const rows = Math.ceil(cap / COLS);
    const widthFit = (this.zw - PAD * 2 - GAP * (COLS - 1)) / (CARD_W * COLS);
    const heightFit =
      (halfH - BANNER_H / 2 - CHAOS_GAP * 2 - PAD - GAP * (rows - 1)) /
      (CARD_H * (rows + 1));
    return Math.max(0.3, Math.min(1, widthFit, heightFit));
  }

  private slotPos(side: Side, i: number, cap: number): { x: number; y: number; s: number } {
    const s = this.gridScale;
    const rows = Math.ceil(cap / COLS);
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const rowCount = Math.min(COLS, cap - row * COLS);
    const x = (col - (rowCount - 1) / 2) * (CARD_W * s + GAP);
    const gridH = CARD_H * s * rows + GAP * (rows - 1);
    const gridCenterY = side === 'ai'
      ? -this.zh / 2 + PAD + gridH / 2
      : this.zh / 2 - PAD - gridH / 2;
    const y = gridCenterY + (row - (rows - 1) / 2) * (CARD_H * s + GAP);
    return { x, y, s };
  }

  /** Chaos card sits in its own row between the grid and the banner. */
  private chaosPos(side: Side): { x: number; y: number } {
    const off = BANNER_H / 2 + CHAOS_GAP + (CARD_H * this.gridScale) / 2;
    return { x: 0, y: side === 'ai' ? -off : off };
  }
}
