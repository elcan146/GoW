import Phaser from 'phaser';
import type { CardDef, Rarity } from '../../game/types';

export const CARD_W = 72;
export const CARD_H = 104;

const RARITY_COLOR: Record<Rarity, number> = {
  mortal: 0x565e68,
  cursed: 0x2e9f4d,
  arcane: 0x2ea8cf,
  forbidden: 0x8b5cf6,
  mythic: 0xc1121f,
  relic: 0x2eafa4,
  divine: 0xd9b84c,
};

/** Glow strength per rarity — mortal barely glows, divine burns bright. */
const RARITY_GLOW: Record<Rarity, number> = {
  mortal: 0.22,
  cursed: 0.45,
  arcane: 0.5,
  forbidden: 0.55,
  mythic: 0.65,
  relic: 0.55,
  divine: 0.7,
};

export class CardSprite extends Phaser.GameObjects.Container {
  instanceId = '';
  def: CardDef | null = null;
  private selected = false;
  /** Grid slot the sprite belongs to — fx tweens animate toward these. */
  homeX = 0;
  homeY = 0;
  baseScale = 1;
  /** Marked by a burn/destroy fx — kept alive until the animation finishes. */
  dying = false;
  private shownPower: number | null = null;
  /** Base glow alpha for the current rarity — the pulse scales around this. */
  private glowAlpha = RARITY_GLOW.mortal;
  private glowSX = 0;
  private glowSY = 0;
  private glowPulse?: Phaser.Tweens.Tween;

  /** Visual children live in here — hover lifts move inner, never the hitbox. */
  readonly inner: Phaser.GameObjects.Container;
  private art: Phaser.GameObjects.Image;
  private rarityGlow: Phaser.GameObjects.Image;
  private frame: Phaser.GameObjects.Rectangle;
  private nameBg: Phaser.GameObjects.Rectangle;
  private badge: Phaser.GameObjects.Graphics;
  private coinText: Phaser.GameObjects.Text;
  private nameText: Phaser.GameObjects.Text;
  private backImg: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    super(scene, x, y);
    // Rarity aura — soft radial sprite behind the card, biased downward so
    // it reads as a glow under/around the card and shines through transparent
    // parts of the art.
    this.rarityGlow = scene.add
      .image(0, 8, 'glow')
      .setDisplaySize(CARD_W * 1.9, CARD_H * 1.6)
      // NORMAL blend — an ADD-blended child forces the container into an
      // offscreen framebuffer that clears to opaque black in Phaser 4,
      // which is what rendered as a black box around the card.
      .setTint(RARITY_COLOR.mortal)
      .setAlpha(RARITY_GLOW.mortal)
      // Never show a fallback/missing texture as a box under the card.
      .setVisible(scene.textures.exists('glow'));
    this.glowSX = this.rarityGlow.scaleX;
    this.glowSY = this.rarityGlow.scaleY;
    this.art = scene.add.image(0, 0, 'card-ph').setDisplaySize(CARD_W, CARD_H);
    this.frame = scene.add
      .rectangle(0, 0, CARD_W, CARD_H)
      .setFillStyle(0, 0)
      .setStrokeStyle(1, 0x2e2830);
    // Nameplate — dark strip behind the name so it reads over any art.
    this.nameBg = scene.add
      .rectangle(0, CARD_H / 2 - 10, CARD_W - 4, 17, 0x05060a, 0.82);
    this.nameText = scene.add
      .text(0, CARD_H / 2 - 10, '', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '9px',
        color: '#e8ecf1',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      // Rasterize at 3x — the hand scales sprites to 2.7x, so 1x text blurs.
      .setResolution(3);
    // Power badge — dark chip straddling the top edge, ring colored by bonus.
    this.badge = scene.add.graphics();
    this.drawBadge(0xc8cdd4);
    this.coinText = scene.add
      .text(0, -CARD_H / 2 + 10, '', {
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: '12px',
        color: '#e8ecf1',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(3);
    this.backImg = scene.add
      .image(0, 0, 'card-ph')
      .setDisplaySize(CARD_W, CARD_H)
      .setVisible(false);
    this.inner = scene.add.container(0, 0, [
      this.rarityGlow, this.art, this.frame, this.nameBg, this.nameText, this.badge, this.coinText, this.backImg,
    ]);
    this.add(this.inner);
    this.setSize(CARD_W, CARD_H);
    // Exact-size hitbox — padded boxes used to bleed into neighbouring zones.
    this.setInteractive(
      new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H),
      Phaser.Geom.Rectangle.Contains,
    );
  }

  /** Rounded power chip pinned to the top edge; ring color = bonus state. */
  private drawBadge(ring: number): void {
    const w = 30;
    const h = 18;
    const y = -CARD_H / 2 + 1;
    this.badge.clear();
    this.badge.fillStyle(0x0a0c10, 0.92);
    this.badge.fillRoundedRect(-w / 2, y, w, h, 6);
    this.badge.lineStyle(1.5, ring, 1);
    this.badge.strokeRoundedRect(-w / 2, y, w, h, 6);
  }

  setHome(x: number, y: number, scale: number): void {
    this.homeX = x;
    this.homeY = y;
    this.baseScale = scale;
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.frame.setStrokeStyle(selected ? 3 : 1, selected ? 0xff2a3c : 0x2e2830);
  }

  /**
   * Update card visuals. Returns the power delta when the displayed power
   * changed on an already-live card (for floating +N/-N numbers), else null.
   */
  setCard(
    def: CardDef,
    bonus: number,
    power: number,
    faceDown: boolean,
    silenced = false,
  ): number | null {
    const prev = this.shownPower;
    this.shownPower = power;
    const delta = prev !== null && prev !== power && !faceDown ? power - prev : null;
    this.def = def;
    const key = `card-${def.id}`;
    this.art
      .setTexture(this.scene.textures.exists(key) ? key : 'card-ph')
      .setDisplaySize(CARD_W, CARD_H);
    this.frame.setStrokeStyle(this.selected ? 3 : 1, this.selected ? 0xff2a3c : 0x2e2830);
    this.glowAlpha = RARITY_GLOW[def.rarity];
    this.rarityGlow.setTint(RARITY_COLOR[def.rarity]).setAlpha(this.glowAlpha);
    this.nameText.setText(def.name);
    this.coinText.setText(String(Math.max(0, power)));
    // Ring matches rarity; the number itself carries the buff/debuff cue.
    this.drawBadge(RARITY_COLOR[def.rarity]);
    this.coinText.setColor(bonus > 0 ? '#7ee08f' : bonus < 0 ? '#ff7a6a' : '#e8ecf1');

    const backKey = `back-${def.faction}`;
    const showBack = faceDown && this.scene.textures.exists(backKey);
    this.backImg.setTexture(showBack ? backKey : 'card-ph').setDisplaySize(CARD_W, CARD_H);
    this.backImg.setVisible(faceDown);
    this.rarityGlow.setVisible(!faceDown && this.scene.textures.exists('glow'));
    this.art.setVisible(!faceDown);
    this.art.setTint(silenced ? 0x9a6ac2 : 0xffffff);
    this.nameBg.setVisible(!faceDown);
    this.nameText.setVisible(!faceDown);
    this.badge.setVisible(!faceDown);
    this.coinText.setVisible(!faceDown);
    return delta;
  }

  /**
   * Breathing pulse on the rarity aura — the glow swells and brightens, then
   * settles back. Driven off a plain object so it never fights setCard's
   * per-rarity alpha; onUpdate applies glowAlpha * factor each frame.
   */
  setGlowPulse(on: boolean): void {
    if (on && !this.glowPulse) {
      const driver = { t: 0 };
      this.glowPulse = this.scene.tweens.add({
        targets: driver,
        t: 1,
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          if (!this.rarityGlow.scene) return;
          const t = driver.t;
          // Spread outward while fading — a ripple that dissipates.
          this.rarityGlow
            .setAlpha(this.glowAlpha * (1 - 0.55 * t))
            .setScale(this.glowSX * (1 + 0.28 * t), this.glowSY * (1 + 0.28 * t));
        },
      });
    } else if (!on && this.glowPulse) {
      this.glowPulse.remove();
      this.glowPulse = undefined;
      this.rarityGlow.setAlpha(this.glowAlpha).setScale(this.glowSX, this.glowSY);
    }
  }

  destroy(fromScene?: boolean): void {
    this.glowPulse?.remove();
    this.glowPulse = undefined;
    super.destroy(fromScene);
  }
}
