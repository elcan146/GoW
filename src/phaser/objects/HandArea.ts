import Phaser from 'phaser';
import { drawTick, hoverTick, sfx } from '../../audio';
import type { CardDef, HandCard } from '../../game/types';
import { CARD_H, CARD_W, CardSprite } from './CardSprite';

const HAND_SCALE = 2.7;
const FAN_ANGLE = 5; // degrees of tilt per card from center
const FAN_ARC = 9; // px the edge cards droop
const HOVER_LIFT = 60;
const SELECT_LIFT = 40;
const SPACING = 170; // max px between card centers — shrinks to fit wide hands

export interface HandCallbacks {
  onSelect: (i: number) => void;
  onInspect: (def: CardDef, bonus: number) => void;
  /** Drop attempt at scene coords — returns true if the play went through. */
  onDropAt: (x: number, y: number) => boolean;
  /** Drag hover at scene coords — for zone highlight. */
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
}

export class HandArea extends Phaser.GameObjects.Container {
  private sprites: CardSprite[] = [];
  private bg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private cb: HandCallbacks;
  private interactive = true;
  private selected = -1;
  private trail: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Manual picking state — engine input on nested rotated containers is unreliable. */
  private hoverIdx = -1;
  private pressIdx = -1;
  private dragIdx = -1;
  private pressPos = { x: 0, y: 0 };
  /** Scene-space position new cards fly in from (the deck counter). */
  dealOrigin = { x: 0, y: 0 };
  /** Scene-space positions of cards that left the hand — used for fly-to-slot. */
  departed: { defId: string; x: number; y: number }[] = [];
  /** Tray width from layout() — fan spacing adapts so hands never overflow. */
  private areaW = 1200;
  /** Shifts the fan right to make room for the deck pile on the left. */
  fanOffsetX = 0;

  constructor(scene: Phaser.Scene, cb: HandCallbacks) {
    super(scene, 0, 0);
    this.cb = cb;
    this.bg = scene.add
      .rectangle(0, 0, 10, 10, 0x08070a, 0.88)
      .setStrokeStyle(2, 0x2e2830);
    this.label = scene.add
      .text(0, 0, '', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '13px',
        color: '#9aa3ad',
        fontStyle: 'bold',
        resolution: 2,
      })
      .setOrigin(0.5);
    this.add([this.bg, this.label]);
    scene.add.existing(this);
    // Neon-red spark trail while dragging a card.
    this.trail = scene.add
      .particles(0, 0, 'dot', {
        speed: { min: 10, max: 45 },
        scale: { start: 0.28, end: 0 },
        alpha: { start: 0.7, end: 0 },
        tint: [0xff2a3c, 0xff6a5a],
        lifespan: 350,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(60);

    // Manual hit detection — per-sprite input on nested rotated containers
    // produces stale transforms in this Phaser version, so we pick ourselves.
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  layout(w: number, h: number, cx: number, cy: number): void {
    this.setPosition(cx, cy);
    this.bg.setSize(w, h);
    this.areaW = w;
    this.label.setPosition(this.fanOffsetX, 0);
    this.fan(false);
  }

  /** Reconcile sprites with the hand array (index-based; hand order is stable). */
  sync(hand: HandCard[], selectedIdx: number, interactive: boolean): void {
    this.interactive = interactive;
    this.selected = selectedIdx;
    this.departed.length = 0; // only this commit's departures feed fly-to-slot

    // Cards removed → record departure point for fly-to-slot, then destroy.
    while (this.sprites.length > hand.length) {
      const idx = this.sprites.findIndex(
        (sp, i) => i >= hand.length || sp.def?.id !== hand[i]?.def.id,
      );
      const sp = this.sprites.splice(idx === -1 ? this.sprites.length - 1 : idx, 1)[0];
      if (sp.def) this.departed.push({ defId: sp.def.id, x: this.x + sp.x, y: this.y + sp.y + sp.inner.y });
      sp.destroy();
    }
    // Cards added → create sprites that fly in from the deck position.
    while (this.sprites.length < hand.length) {
      const sp = new CardSprite(
        this.scene,
        this.dealOrigin.x - this.x,
        this.dealOrigin.y - this.y,
      );
      sp.setScale(HAND_SCALE * 0.55);
      sp.setAlpha(0.4);
      this.add(sp);
      this.sprites.push(sp);
      sp.setData('dealt', false);
    }

    this.sprites.forEach((sp, i) => {
      const hc = hand[i];
      sp.setCard(hc.def, hc.bonus, hc.def.power + hc.bonus, false);
      sp.setSelected(i === selectedIdx);
      sp.setGlowPulse(true); // hand cards get the breathing rarity aura
    });

    this.label.setText(
      !interactive && hand.length ? 'WAITING…' : hand.length === 0 ? 'HAND EMPTY' : '',
    );
    this.fan(true);
  }

  /** Index of the topmost card under a scene-space point, or -1. */
  private cardAt(sx: number, sy: number): number {
    const lx = sx - this.x;
    const ly = sy - this.y;
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const sp = this.sprites[i];
      const hw = (CARD_W / 2 + 6) * sp.scale;
      const hh = (CARD_H / 2 + 6) * sp.scale;
      if (Math.abs(lx - sp.x) <= hw && Math.abs(ly - sp.y) <= hh) return i;
    }
    return -1;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    this.maybeStartDrag(p);
    if (this.dragIdx >= 0) {
      const sp = this.sprites[this.dragIdx];
      sp.setPosition(p.x - this.x, p.y - this.y);
      this.trail.emitParticleAt(p.x, p.y, 2);
      this.cb.onDragMove(p.x, p.y);
      return;
    }
    if (!this.interactive) return;
    const i = this.cardAt(p.x, p.y);
    if (i !== this.hoverIdx) {
      if (this.hoverIdx >= 0) this.fanCard(this.sprites[this.hoverIdx], this.hoverIdx, true);
      this.hoverIdx = i;
      if (i >= 0) {
        hoverTick();
        const sp = this.sprites[i];
        this.bringToTop(sp);
        this.scene.tweens.add({
          targets: sp,
          scale: HAND_SCALE * 1.07,
          duration: 140,
          ease: 'Cubic.easeOut',
        });
        this.scene.tweens.add({
          targets: sp.inner,
          y: -(HOVER_LIFT + (i === this.selected ? SELECT_LIFT : 0)),
          duration: 140,
          ease: 'Cubic.easeOut',
        });
      }
    }
    // Subtle tilt toward the cursor while hovering — physical-card feel.
    if (i >= 0) {
      const sp = this.sprites[i];
      const tilt = Phaser.Math.Clamp((p.x - (this.x + sp.x)) * 0.0016, -0.14, 0.14);
      sp.setRotation(tilt);
    }
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.interactive) return;
    const i = this.cardAt(p.x, p.y);
    if (i < 0) return;
    this.pressIdx = i;
    this.pressPos = { x: p.x, y: p.y };
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.dragIdx >= 0) {
      const sp = this.sprites[this.dragIdx];
      const i = this.dragIdx;
      this.dragIdx = -1;
      this.cb.onDragEnd();
      const played = this.cb.onDropAt(p.x, p.y);
      if (!played) {
        sfx('ui-click'); // deny tick
        this.fanCard(sp, i, true);
        this.scene.tweens.add({
          targets: sp,
          rotation: '+=0.07',
          duration: 55,
          yoyo: true,
          repeat: 3,
        });
      }
      return;
    }
    if (this.pressIdx >= 0) {
      const i = this.pressIdx;
      this.pressIdx = -1;
      const sp = this.sprites[i];
      this.cb.onSelect(i);
      if (sp?.def) this.cb.onInspect(sp.def, 0);
    }
  }

  /** Promote a press into a drag once the pointer travels past the threshold. */
  private maybeStartDrag(p: Phaser.Input.Pointer): void {
    if (this.pressIdx < 0 || this.dragIdx >= 0) return;
    if (Phaser.Math.Distance.Between(this.pressPos.x, this.pressPos.y, p.x, p.y) < 8) return;
    this.dragIdx = this.pressIdx;
    this.pressIdx = -1;
    const sp = this.sprites[this.dragIdx];
    this.cb.onSelect(this.dragIdx); // select so valid zones glow
    this.bringToTop(sp);
    this.scene.tweens.add({
      targets: sp,
      rotation: 0,
      scale: HAND_SCALE * 1.12,
      duration: 120,
    });
    this.scene.tweens.add({ targets: sp.inner, y: 0, duration: 120 });
  }

  private fanPos(i: number): { x: number; y: number; rot: number } {
    const n = this.sprites.length;
    const off = i - (n - 1) / 2;
    // Compress the fan when the hand is too wide for the tray — the
    // fanOffsetX shift eats into the usable width on the right side.
    const spacing = Math.min(
      SPACING,
      (this.areaW - CARD_W * HAND_SCALE - 40 - Math.abs(this.fanOffsetX) * 2) /
        Math.max(1, n - 1),
    );
    return {
      x: off * spacing + this.fanOffsetX,
      y: Math.abs(off) * FAN_ARC + 20,
      rot: (off * FAN_ANGLE * Math.PI) / 180,
    };
  }

  private fanCard(sp: CardSprite, i: number, animate: boolean): void {
    if (i < 0) return;
    const { x, y, rot } = this.fanPos(i);
    const lift = i === this.selected ? SELECT_LIFT : 0;
    sp.setHome(x, y, HAND_SCALE);
    if (animate) {
      this.scene.tweens.add({
        targets: sp,
        x,
        y,
        rotation: rot,
        scale: HAND_SCALE,
        duration: 200,
        ease: 'Cubic.easeOut',
      });
      this.scene.tweens.add({
        targets: sp.inner,
        y: -lift,
        duration: 200,
        ease: 'Cubic.easeOut',
      });
    } else {
      sp.setPosition(x, y).setRotation(rot).setScale(HAND_SCALE);
      sp.inner.setY(-lift);
    }
  }

  /** Re-seat all cards; new ones deal in with a stagger. */
  private fan(animate: boolean): void {
    this.sprites.forEach((sp, i) => {
      const isNew = sp.getData('dealt') === false;
      if (isNew) {
        sp.setData('dealt', true);
        const { x, y, rot } = this.fanPos(i);
        sp.setHome(x, y, HAND_SCALE);
        sp.inner.setY(i === this.selected ? -SELECT_LIFT : 0);
        this.scene.time.delayedCall(i * 70, () => drawTick());
        this.scene.tweens.add({
          targets: sp,
          x,
          y,
          rotation: rot,
          scale: HAND_SCALE,
          alpha: 1,
          duration: 420,
          delay: i * 70,
          ease: 'Back.easeOut',
        });
      } else {
        this.fanCard(sp, i, animate);
      }
    });
  }
}
