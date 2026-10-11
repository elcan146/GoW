import Phaser from 'phaser';
import { flipTick, sfxRandom, whoosh } from '../../audio';
import { canPlayAt, locationWinner } from '../../game/effects';
import { locationArt } from '../../game/locations';
import type { GameState } from '../../game/store';
import type { CardDef, FxEvent, Phase, Side } from '../../game/types';
import { CardSprite } from '../objects/CardSprite';
import { HandArea } from '../objects/HandArea';
import { LocationZone } from '../objects/LocationZone';

const TOP_BAR = 64;
const HAND_H = 340;
const ZONE_GAP = 12;
const SIDE_PAD = 12;
/** Horizontal room reserved at the tray's left edge for the deck pile. */
const PILE_W = 150;
const PILE_W_CARD = 92;
const PILE_H_CARD = 132;

export class BoardScene extends Phaser.Scene {
  private zones: LocationZone[] = [];
  private aiBacks: Phaser.GameObjects.Image[] = [];
  private aiCountText!: Phaser.GameObjects.Text;
  private deckText!: Phaser.GameObjects.Text;
  private state: GameState | null = null;
  private seenFx = new Set<number>();
  private pendingArt = new Set<string>();
  private artLoading = false;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fire!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ash!: Phaser.GameObjects.Particles.ParticleEmitter;
  private handArea!: HandArea;
  private deckPile!: Phaser.GameObjects.Container;
  private pileBacks: Phaser.GameObjects.Image[] = [];
  private pileCount!: Phaser.GameObjects.Text;
  private prevPhase: Phase | null = null;
  /** Scene-space positions of cards that left a zone alive this commit (move fx). */
  private departedBoard: { defId: string; x: number; y: number }[] = [];

  onPlay: ((li: number) => void) | null = null;
  onInspect: ((def: CardDef, bonus: number, power?: number) => void) | null = null;
  onSelectHand: ((i: number) => void) | null = null;

  constructor() {
    super('board');
  }

  create(): void {
    for (let i = 0; i < 3; i++) {
      this.zones.push(
        new LocationZone(this, i, {
          onPlay: (li) => this.onPlay?.(li),
          onInspect: (c, power) => this.onInspect?.(c.def, c.bonus, power),
          onDepart: (defId, x, y) => this.departedBoard.push({ defId, x, y }),
        }),
      );
    }
    this.aiCountText = this.add
      .text(0, 0, '', { fontFamily: '"Share Tech Mono", monospace', fontSize: '13px', color: '#e8ecf1', fontStyle: 'bold', resolution: 2 })
      .setOrigin(0, 0.5);
    this.deckText = this.add
      .text(0, 0, '', { fontFamily: '"Share Tech Mono", monospace', fontSize: '11px', color: '#9aa3ad', resolution: 2 })
      .setOrigin(0.5, 0.5);

    // Burst emitters — dormant until explode() is called by fx animations.
    this.dust = this.add.particles(0, 0, 'dot', {
      speed: { min: 40, max: 150 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 0.55, end: 0 },
      tint: [0x9aa3ad, 0x6a7078, 0x3a3f47],
      lifespan: 550,
      emitting: false,
    });
    this.fire = this.add.particles(0, 0, 'dot', {
      speed: { min: 60, max: 210 },
      angle: { min: 230, max: 310 },
      gravityY: -140,
      scale: { start: 0.75, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xff8a95, 0xff2a3c, 0x8f0f1a],
      lifespan: 750,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    // Ash that drifts down after a burn.
    this.ash = this.add.particles(0, 0, 'dot', {
      speedY: { min: 25, max: 70 },
      speedX: { min: -18, max: 18 },
      scale: { start: 0.3, end: 0.05 },
      alpha: { start: 0.6, end: 0 },
      tint: [0x9a9a9a, 0x6a6a6a, 0x3f3f3f],
      lifespan: 1300,
      emitting: false,
    });

    this.input.dragDistanceThreshold = 8;
    // Location art drifts a few px opposite the cursor — cheap depth.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      for (const z of this.zones) z.parallax(p.x, p.y);
    });

    this.handArea = new HandArea(this, {
      onSelect: (i) => this.onSelectHand?.(i),
      onInspect: (def, bonus) => this.onInspect?.(def, bonus),
      onDropAt: (x, y) => {
        const z = this.zoneAt(x, y);
        if (z && z.isPlayable) {
          this.onPlay?.(z.li);
          return true;
        }
        return false;
      },
      onDragMove: (x, y) => this.setHotAt(x, y),
      onDragEnd: () => this.clearHot(),
    });
    this.handArea.fanOffsetX = PILE_W / 2;

    // Deck pile — stacked card backs at the tray's left edge. The top back
    // mirrors the next card's faction; dealt cards fly out of this pile.
    this.deckPile = this.add.container(0, 0);
    for (let i = 0; i < 3; i++) {
      const b = this.add
        .image(i * 4 - 4, -i * 4 + 4, 'back-unknown')
        .setDisplaySize(PILE_W_CARD, PILE_H_CARD)
        .setRotation((i - 1) * 0.04);
      this.pileBacks.push(b);
      this.deckPile.add(b);
    }
    this.pileCount = this.add
      .text(0, PILE_H_CARD / 2 + 16, '', {
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: '15px',
        color: '#e8ecf1',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5);
    this.deckPile.add(this.pileCount);

    this.scale.on('resize', () => this.layoutAll());
    this.layoutAll();
    if (this.state) this.syncAll(this.state);
  }

  // ------------------------------------------------- drop targeting (scene space)

  setHotAt(x: number, y: number): void {
    this.zones.forEach((z) => z.setHot(z.containsPoint(x, y)));
  }

  clearHot(): void {
    this.zones.forEach((z) => z.setHot(false));
  }

  zoneAt(x: number, y: number): LocationZone | undefined {
    return this.zones.find((z) => z.containsPoint(x, y));
  }

  /** Called by the bridge on every store commit. */
  onState(s: GameState): void {
    this.state = s;
    if (!this.zones.length) return;
    this.ensureArt(s);
    this.syncAll(s);
    this.playFx(s.fx);
  }

  // ---------------------------------------------------------------- layout

  private layoutAll(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const zw = (w - SIDE_PAD * 2 - ZONE_GAP * 2) / 3;
    const zh = h - TOP_BAR - HAND_H - 8;
    this.zones.forEach((z, i) => {
      z.setPosition(SIDE_PAD + zw / 2 + i * (zw + ZONE_GAP), TOP_BAR + zh / 2);
      z.layout(zw, zh);
    });
    if (this.handArea) {
      this.handArea.layout(w - SIDE_PAD * 2, HAND_H, w / 2, h - HAND_H / 2);
      const pileX = SIDE_PAD + PILE_W / 2;
      const pileY = h - HAND_H / 2;
      this.deckPile.setPosition(pileX, pileY);
      // Dealt cards fly out of the pile, not the old top-right counter.
      this.handArea.dealOrigin = { x: pileX, y: pileY };
    }
    this.layoutAiRow();
  }

  private layoutAiRow(): void {
    const w = this.scale.width;
    const n = this.aiBacks.length;
    this.aiBacks.forEach((b, i) => {
      b.setPosition(w / 2 + (i - (n - 1) / 2) * 26, TOP_BAR / 2);
      b.setRotation(((i - (n - 1) / 2) * 3 * Math.PI) / 180);
    });
    this.aiCountText.setPosition(w / 2 + (n * 26) / 2 + 14, TOP_BAR / 2);
    this.deckText.setPosition(w - SIDE_PAD - 60, TOP_BAR / 2);
  }

  // ----------------------------------------------------------------- sync

  private syncAll(s: GameState): void {
    this.departedBoard.length = 0;
    const dying = new Set(
      s.fx.filter((f) => (f.kind === 'burn' || f.kind === 'destroy') && f.instanceId).map((f) => f.instanceId!),
    );
    const selected = s.selectedHand !== null ? s.player.hand[s.selectedHand] : null;
    this.zones.forEach((z, i) => {
      const loc = s.locations[i];
      if (!loc) return;
      const playable =
        s.phase === 'player-turn' &&
        !s.player.passed &&
        selected !== null &&
        canPlayAt(s, 'player', selected.def, i);
      z.setLocation(loc, s, playable, dying);
    });
    this.syncAiRow(s);
    this.handArea?.sync(
      s.player.hand,
      s.selectedHand ?? -1,
      s.phase === 'player-turn' && !s.player.passed,
    );
    if (s.phase !== this.prevPhase) {
      if (s.phase === 'player-turn') {
        // New round / match start → staggered reveal; mid-round swap → banner.
        if (this.prevPhase === 'ai-turn') this.turnBanner('YOUR TURN', '#e8ecf1');
        else this.roundTransition();
      } else if (s.phase === 'ai-turn') this.turnBanner('ENEMY TURN', '#ff2a3c');
      else if (s.phase === 'round-end') this.roundEndSeq(s);
      else if (s.phase === 'game-end') this.gameEndSeq(s);
    }
    this.prevPhase = s.phase;
  }

  /** Round transition: black covers lift off zones left→right, then banner. */
  private roundTransition(): void {
    this.zones.forEach((z, li) => z.playReveal(li * 160));
    this.time.delayedCall(520, () => this.turnBanner('YOUR TURN', '#e8ecf1'));
  }

  /** Big phase banner that sweeps across the board. */
  private turnBanner(text: string, color: string): void {
    const w = this.scale.width;
    const y = TOP_BAR + (this.scale.height - TOP_BAR - HAND_H) / 2;
    const t = this.add
      .text(-320, y, text, {
        fontFamily: 'Cinzel, Georgia, serif',
        fontSize: '46px',
        color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(90)
      .setAlpha(0.95);
    this.tweens.add({ targets: t, x: w / 2, duration: 320, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: t,
      x: w + 320,
      duration: 320,
      delay: 850,
      ease: 'Cubic.easeIn',
      onComplete: () => t.destroy(),
    });
  }

  /** Game-end cinematic: dim, result text scale-in, particle rain, zoom. */
  private gameEndSeq(s: GameState): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const winner = s.gameWinner;
    const dim = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0).setDepth(80);
    this.tweens.add({ targets: dim, fillAlpha: 0.55, duration: 800 });

    const label = winner === 'player' ? 'VICTORY' : winner === 'ai' ? 'DEFEAT' : 'DRAW';
    const color = winner === 'player' ? '#e8ecf1' : winner === 'ai' ? '#ff2a3c' : '#9aa3ad';
    const t = this.add
      .text(w / 2, h / 2 - 40, label, {
        fontFamily: 'Cinzel, Georgia, serif',
        fontSize: '72px',
        color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 8,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(95)
      .setScale(0.4)
      .setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 600, ease: 'Back.easeOut' });

    this.add
      .particles(0, -20, 'dot', {
        x: { min: 0, max: w },
        speedY: { min: 120, max: 260 },
        speedX: { min: -20, max: 20 },
        scale: { min: 0.15, max: 0.4 },
        alpha: { start: 0.9, end: 0.2 },
        tint: winner === 'player' ? [0xe8ecf1, 0x9aa3ad, 0xffffff] : [0xff2a3c, 0x7a0e16],
        lifespan: 3500,
        frequency: 60,
      })
      .setDepth(90);
    this.cameras.main.zoomTo(1.05, 900);
  }

  /** Round-end celebration: winner flashes gold + coin pulses, loser dims. */
  private roundEndSeq(s: GameState): void {
    [0, 1, 2].forEach((li) => {
      const z = this.zones[li];
      const winner = locationWinner(s, li);
      this.time.delayedCall(li * 350, () => {
        if (winner === 'tie') {
          z.flash(0x565e68);
          return;
        }
        z.flash(winner === 'player' ? 0xe8ecf1 : 0xff2a3c);
        z.pulseCoin(winner);
        this.fire.explode(10, z.x, z.y);
      });
    });
  }

  private syncAiRow(s: GameState): void {
    const n = Math.min(s.ai.hand.length, 10);
    while (this.aiBacks.length < n) {
      const b = this.add.image(0, 0, 'back-unknown').setDisplaySize(34, 50);
      const target = b.scaleX;
      b.setScale(0);
      this.tweens.add({ targets: b, scale: target, duration: 260, ease: 'Back.easeOut' });
      this.aiBacks.push(b);
    }
    while (this.aiBacks.length > n) this.aiBacks.pop()!.destroy();
    this.aiCountText.setText(s.ai.passed ? 'PASSED' : `${s.ai.hand.length}`);
    this.deckText.setText(`decks ${s.player.deck.length} : ${s.ai.deck.length}`);
    this.syncDeckPile(s);
    this.layoutAiRow();
  }

  /** Pile shows the next card's faction back + remaining deck count. */
  private syncDeckPile(s: GameState): void {
    const n = s.player.deck.length;
    this.deckPile.setVisible(n > 0);
    if (!n) return;
    const topKey = `back-${s.player.deck[0].faction}`;
    const key = this.textures.exists(topKey) ? topKey : 'back-unknown';
    this.pileBacks.forEach((b, i) => {
      // Only the top card mirrors the real next card; deeper backs stay generic.
      b.setTexture(i === this.pileBacks.length - 1 ? key : 'back-unknown');
      b.setVisible(i >= this.pileBacks.length - Math.min(3, n));
    });
    this.pileCount.setText(String(n));
  }

  // ------------------------------------------------------------ art loading

  private ensureArt(s: GameState): void {
    if (this.artLoading) return;
    const want: { key: string; url: string }[] = [];
    const addCard = (def: CardDef) => {
      const key = `card-${def.id}`;
      if (!this.textures.exists(key) && !this.pendingArt.has(key)) {
        this.pendingArt.add(key);
        want.push({ key, url: def.art });
      }
    };
    for (const loc of s.locations) {
      for (const c of [...loc.player, ...loc.ai]) addCard(c.def);
      if (loc.playerChaos) addCard(loc.playerChaos.def);
      if (loc.aiChaos) addCard(loc.aiChaos.def);
    }
    s.player.hand.forEach((hc) => addCard(hc.def));
    s.ai.hand.forEach((hc) => addCard(hc.def));
    s.player.deck.forEach(addCard);
    s.ai.deck.forEach(addCard);

    // Location art for the 3 active slots.
    s.locations.forEach((loc, i) => {
      const key = `loc-${loc.def.id}-${i}`;
      if (!this.textures.exists(key) && !this.pendingArt.has(key)) {
        this.pendingArt.add(key);
        want.push({ key, url: locationArt(loc.def.id, i) });
      }
    });

    if (!want.length) return;
    this.artLoading = true;
    for (const { key, url } of want) this.load.image(key, url);
    this.load.once('complete', () => {
      this.artLoading = false;
      if (this.state) this.syncAll(this.state);
      // Another batch may have been requested while loading.
      if (this.state) this.ensureArt(this.state);
    });
    this.load.start();
  }

  // --------------------------------------------------------------- fx anims

  private playFx(fx: FxEvent[]): void {
    for (const f of fx) {
      if (this.seenFx.has(f.id)) continue;
      this.seenFx.add(f.id);
      const zone = this.zones[f.li];
      if (!zone) continue;
      const sp = f.instanceId ? zone.getSprite(f.instanceId) : undefined;
      switch (f.kind) {
        case 'slam':
          if (sp) this.animSlam(sp, zone, f.side);
          else this.cameras.main.shake(160, 0.006);
          // Heavier cards land deeper — pitch scales with printed power.
          sfxRandom(
            'slam',
            3,
            Phaser.Math.Clamp(1.15 - (sp?.def?.power ?? 4) * 0.04, 0.75, 1.15),
          );
          break;
        case 'spy':
          if (sp) this.animSpy(sp);
          flipTick();
          break;
        case 'move':
          if (sp) this.animMove(sp, zone);
          whoosh();
          break;
        case 'burn':
          if (sp) this.animBurn(sp, zone, f.instanceId!);
          sfxRandom('burn', 3);
          break;
        case 'destroy':
          if (sp) this.animDestroy(sp, zone);
          sfxRandom('burn', 3);
          break;
      }
    }
    if (this.seenFx.size > 400) this.seenFx.clear();
  }

  private animSlam(sp: CardSprite, zone: LocationZone, side: Side): void {
    const { homeX, homeY, baseScale } = sp;
    // Fly from where the card actually was: player's hand slot or AI's backs.
    let from: { x: number; y: number } | null = null;
    if (side === 'player' && sp.def) {
      const d = this.handArea?.departed.find((p) => p.defId === sp.def!.id);
      if (d) from = { x: d.x - zone.x, y: d.y - zone.y };
    } else if (side === 'ai' && this.aiBacks.length) {
      const b = this.aiBacks[this.aiBacks.length - 1];
      from = { x: b.x - zone.x, y: b.y - zone.y };
    }
    if (from) {
      sp.setPosition(from.x, from.y);
      sp.setScale(baseScale * 1.15);
      sp.setAlpha(1);
      this.tweens.add({
        targets: sp,
        x: homeX,
        y: homeY,
        scale: baseScale,
        duration: 320,
        ease: 'Quad.easeIn',
        onComplete: () => this.impact(zone, homeX, homeY),
      });
      return;
    }
    // Fallback: drop from above.
    sp.setPosition(homeX, homeY - 90);
    sp.setScale(baseScale * 1.3);
    sp.setAlpha(0);
    this.tweens.add({
      targets: sp,
      x: homeX,
      y: homeY,
      alpha: 1,
      scale: baseScale,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => this.impact(zone, homeX, homeY),
    });
  }

  /** Slam landing: shake + dust + a quick camera punch. */
  private impact(zone: LocationZone, x: number, y: number): void {
    this.cameras.main.shake(140, 0.005);
    this.dust.explode(14, zone.x + x, zone.y + y + 30);
    this.cameras.main.zoomTo(1.02, 70);
    this.time.delayedCall(90, () => this.cameras.main.zoomTo(1, 220));
  }

  private animSpy(sp: CardSprite): void {
    const { homeX, homeY, baseScale } = sp;
    sp.setPosition(homeX, homeY - 70);
    sp.setScale(0, baseScale);
    this.tweens.add({
      targets: sp,
      x: homeX,
      y: homeY,
      scaleX: baseScale,
      duration: 500,
      ease: 'Back.easeOut',
    });
  }

  private animMove(sp: CardSprite, zone: LocationZone): void {
    // Fly from the zone the card departed, if we tracked one this commit.
    const d = sp.def ? this.departedBoard.find((p) => p.defId === sp.def!.id) : undefined;
    if (d) {
      sp.setPosition(d.x - zone.x, d.y - zone.y);
      this.tweens.add({
        targets: sp,
        x: sp.homeX,
        y: sp.homeY,
        duration: 400,
        ease: 'Cubic.easeInOut',
      });
      return;
    }
    this.tweens.add({
      targets: sp,
      y: sp.homeY - 24,
      duration: 160,
      yoyo: true,
      ease: 'Cubic.easeOut',
    });
  }

  /** Destroy (non-burn): the card tips and crumbles to gray ash. */
  private animDestroy(sp: CardSprite, zone: LocationZone): void {
    sp.dying = true;
    this.tweens.killTweensOf(sp); // stop any chaos pulse fighting this
    const wx = zone.x + sp.x;
    const wy = zone.y + sp.y;
    this.tweens.add({
      targets: sp,
      alpha: 0,
      scale: sp.baseScale * 0.6,
      rotation: 0.3,
      y: sp.y + 14,
      duration: 380,
      ease: 'Cubic.easeIn',
      onComplete: () => sp.destroy(),
    });
    this.ash.explode(24, wx, wy);
  }

  private animBurn(sp: CardSprite, zone: LocationZone, id: string): void {
    sp.dying = true;
    this.tweens.killTweensOf(sp);
    zone.dropSprite(id);
    sp.off('pointerdown');
    this.tweens.add({
      targets: sp,
      alpha: 0,
      scale: sp.baseScale * 1.4,
      y: sp.y - 18,
      duration: 450,
      ease: 'Cubic.easeIn',
      onComplete: () => sp.destroy(),
    });
    this.fire.explode(22, zone.x + sp.x, zone.y + sp.y);
    this.ash.explode(16, zone.x + sp.x, zone.y + sp.y);
    this.cameras.main.flash(120, 255, 42, 60);
  }
}
