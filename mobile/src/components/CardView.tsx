import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { cardBack, cardImage } from '../assets';
import { GLOW_SPRITES, RARITY_GLOW } from '../fxAssets';
import type { CardDef, Rarity } from '../game/types';
import { colors, RARITY_BORDER, RARITY_COLOR, RARITY_LABEL } from '../theme';

interface Props {
  card: CardDef;
  bonus?: number;
  power?: number; // computed board power (overrides card.power + bonus)
  selected?: boolean;
  disabled?: boolean;
  size?: 'hand' | 'board' | 'mini' | 'grid';
  faceDown?: boolean;
  silenced?: boolean;
  onPress?: () => void;
  /** Detail panel — fires even when disabled (web parity). */
  onInspect?: () => void;
  /** Hold-to-inspect — used by the deck builder (tap stays add/remove). */
  onLongPress?: () => void;
}

export const CARD_SIZES = {
  hand: { w: 80, h: 112 },
  board: { w: 58, h: 82 },
  mini: { w: 34, h: 48 },
  grid: { w: 84, h: 118 },
} as const;

/** Web frame-* parity: muted 1px bezel, dark inner hairline, colored bloom.
 *  Rarity reads through the glow aura + coin ring, not a bright border. */
const FRAME_BORDER: Record<Rarity, string> = {
  mortal: '#2e2830',
  cursed: '#1e4a2c',
  arcane: '#1e4a5e',
  forbidden: '#3a1e5e',
  mythic: '#5e1e26',
  relic: '#1e4a44',
  divine: '#5a4510',
};
const FRAME_INNER: Record<Rarity, string> = {
  mortal: '#1a1c20',
  cursed: '#0e2816',
  arcane: '#0e2836',
  forbidden: '#1c0e38',
  mythic: '#3a0810',
  relic: '#0e2e2a',
  divine: '#5a4510',
};

/** Soft rarity aura behind the card — mirrors the web CardSprite glow.
 *  Hand cards get the breathing pulse; board cards a static aura. */
function GlowAura({
  rarity,
  dim,
  pulse,
  base,
}: {
  rarity: Rarity;
  dim: { w: number; h: number };
  pulse: boolean;
  base?: number;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, t]);
  const a = base ?? RARITY_GLOW[rarity];
  const w = dim.w * 1.9;
  const h = dim.h * 1.6;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: w,
        height: h,
        left: (dim.w - w) / 2,
        top: (dim.h - h) / 2 + 6,
        opacity: pulse
          ? t.interpolate({ inputRange: [0, 1], outputRange: [a, a * 0.45] })
          : a,
        transform: [
          { scale: pulse ? t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] }) : 1 },
        ],
      }}
    >
      <Image source={GLOW_SPRITES[rarity]} style={{ width: '100%', height: '100%' }} />
    </Animated.View>
  );
}

/** Power chip straddling the TOP edge, centered — mirrors the Phaser
 *  CardSprite badge: dark rounded rect, rarity ring, number colored by
 *  buff/debuff. Pops when the shown value changes (web anim-coin-pop). */
function PowerCoin({
  shown,
  bonus,
  ring,
  size,
}: {
  shown: number;
  bonus: number;
  ring: string;
  size: 'hand' | 'board' | 'mini' | 'grid';
}) {
  const t = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    t.setValue(1);
    Animated.sequence([
      Animated.timing(t, { toValue: 1.45, duration: 130, useNativeDriver: true }),
      Animated.timing(t, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [shown, t]);
  const h = size === 'mini' ? 13 : size === 'board' ? 15 : size === 'grid' ? 17 : 19;
  // Phaser coinText color: buffed → green, debuffed → red, else chrome.
  const fg = bonus > 0 ? '#7ee08f' : bonus < 0 ? '#ff7a6a' : '#e8ecf1';
  return (
    // Full-width transparent strip centers the chip; scale pops around center.
    <Animated.View style={[styles.coinWrap, { transform: [{ scale: t }] }]}>
      <View style={[styles.coin, { height: h, borderColor: ring }]}>
        <Text
          style={[
            styles.coinText,
            { color: fg },
            size === 'mini' && { fontSize: 8 },
            size === 'board' && { fontSize: 10 },
            size === 'hand' && { fontSize: 13 },
            size === 'grid' && { fontSize: 12 },
          ]}
        >
          {shown}
        </Text>
      </View>
    </Animated.View>
  );
}

// Memoized — cards render many times (hand fan, board slots, AI fan, ghost)
// and select/drag store updates re-render their parents. Skipping unchanged
// cards kills most of the per-frame work that made pickup/drag janky.
export const CardView = React.memo(function CardView({
  card,
  bonus = 0,
  power,
  selected,
  disabled,
  size = 'hand',
  faceDown,
  silenced,
  onLongPress,
  onPress,
  onInspect,
}: Props) {
  const shown = Math.max(0, power ?? card.power + bonus);
  const dim = CARD_SIZES[size];
  const isHand = size === 'hand' || size === 'grid';
  const isMini = size === 'mini';
  const tint = RARITY_COLOR[card.rarity];
  const [hover, setHover] = useState(false);
  const hoverable = !disabled && !selected && isHand;

  if (faceDown) {
    const back = cardBack(card.faction);
    return (
      <View style={[styles.frame, { width: dim.w, height: dim.h, borderColor: '#2e2830' }]}>
        {back ? (
          <Image source={back} style={styles.imgFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.backFallback]} />
        )}
      </View>
    );
  }

  const art = cardImage(card.art);
  const showGlow = size === 'hand' || size === 'board';
  // Board auras — web aura-ongoing (blue) / aura-chaos (violet) pulse.
  const aura =
    size === 'board' ? (card.kind === 'ongoing' ? 'arcane' : card.kind === 'chaos' ? 'forbidden' : null) : null;
  const lift = selected ? -18 : hover ? -12 : 0;

  return (
    <View style={{ width: dim.w, height: dim.h }}>
      {showGlow && <GlowAura rarity={card.rarity} dim={dim} pulse={size === 'hand'} />}
      {aura && <GlowAura rarity={aura} dim={dim} pulse base={0.5} />}
      <Pressable
        onPress={() => {
          if (!disabled) onPress?.();
          onInspect?.();
        }}
        onLongPress={onLongPress}
        disabled={disabled && !onInspect && !onLongPress}
        onHoverIn={hoverable ? () => setHover(true) : undefined}
        onHoverOut={hoverable ? () => setHover(false) : undefined}
        style={[
          styles.frame,
          {
            width: dim.w,
            height: dim.h,
            borderColor: FRAME_BORDER[card.rarity],
            transform: [{ translateY: lift }],
          },
          selected && styles.selectedGlow,
          hover && styles.hoverGlow,
        ]}
      >
        {/* Inner hairline — the web frame-* ::before edge light */}
        <View
          pointerEvents="none"
          style={[styles.innerLine, { borderColor: FRAME_INNER[card.rarity] }]}
        />
        {art ? (
          <Image
            source={art}
            style={styles.imgFill}
            resizeMode="cover"
            tintColor={silenced ? '#9a6ac2' : undefined}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.artFallback]}>
            <Text style={styles.artFallbackText}>{card.name}</Text>
          </View>
        )}
        {/* Web gradient: dark top + heavy bottom behind the nameplate */}
        <View style={styles.topShade} pointerEvents="none" />

        <PowerCoin shown={shown} bonus={bonus} ring={RARITY_BORDER[card.rarity]} size={size} />

        {/* Chaos badge */}
        {card.kind === 'chaos' && !isMini && (
          <View style={styles.chaosBadge}>
            <Text style={styles.chaosBadgeText}>☄</Text>
          </View>
        )}

        {/* Name plate — black glass with the neon hairline */}
        <View style={styles.namePlate} pointerEvents="none">
          <Text
            numberOfLines={1}
            style={[
              styles.name,
              isMini && { fontSize: 7 },
              size === 'hand' && { fontSize: 11 },
              size === 'board' && { fontSize: 8 },
              size === 'grid' && { fontSize: 10 },
            ]}
          >
            {card.name}
          </Text>
          {isHand && (
            <Text style={[styles.sub, { color: tint }]} numberOfLines={1}>
              {RARITY_LABEL[card.rarity]} · {card.faction}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  // Explicit 100% size: on web, RNW Image falls back to the intrinsic
  // bitmap size (750x1050) when no width/height is given, which breaks
  // absoluteFill and leaves only a corner of the art visible.
  imgFill: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  frame: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 5,
    backgroundColor: '#0a080c',
  },
  // Web frame-* ::before — inset hairline that catches the edge light.
  innerLine: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: 4,
    margin: 1,
    zIndex: 3,
  },
  selectedGlow: {
    shadowColor: colors.bloodNeon,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  hoverGlow: {
    shadowColor: '#000',
    shadowOpacity: 0.85,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  // Web gradient top half — subtle darkening over the art's upper edge.
  topShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '30%',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  backFallback: {
    backgroundColor: '#14101a',
  },
  artFallback: {
    backgroundColor: '#14101a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  artFallbackText: {
    color: colors.chrome,
    fontSize: 9,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  // Transparent top strip — centers the chip horizontally (Phaser badge sits
  // at top-center, straddling the card's top edge).
  coinWrap: {
    position: 'absolute',
    top: 2,
    left: 0,
    right: 0,
    zIndex: 4,
    alignItems: 'center',
  },
  // Dark rounded chip with a rarity ring — Phaser drawBadge parity.
  coin: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(10,12,16,0.92)',
    borderWidth: 1.5,
  },
  coinText: {
    color: colors.chromeBright,
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  chaosBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    zIndex: 2,
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: '#3a0a12',
    borderWidth: 1,
    borderColor: colors.blood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chaosBadgeText: { color: colors.bloodNeon, fontSize: 8, fontWeight: '900' },
  namePlate: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    backgroundColor: 'rgba(4,2,6,0.88)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,42,60,0.35)',
    paddingHorizontal: 3,
    paddingTop: 2,
    paddingBottom: 2,
  },
  name: {
    color: colors.chromeBright,
    fontSize: 8,
    fontWeight: '700',
  },
  sub: {
    fontSize: 7,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
