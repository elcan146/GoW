import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { locationImage } from '../assets';
import { GLOW_SPRITES } from '../fxAssets';
import { canPlayAt, capacityFor, cardPower, sideTotal } from '../game/effects';
import { useGameStore } from '../game/store';
import type { BoardCard, FxEvent, HandCard, LocationState, Side } from '../game/types';
import { colors } from '../theme';
import { CardView, CARD_SIZES } from './CardView';

interface Props {
  location: LocationState;
  index: number;
  /** Drag-hover state driven by the hand's pointer drag (web setHot). */
  hot?: boolean;
}

/** Ambient particle recipe per location id — mirrors the web emitter table. */
type AmbientKind = 'embers' | 'snow' | 'fog' | 'murk' | 'holy' | 'void';
const AMBIENT: Record<string, AmbientKind> = {
  lava: 'embers', dragons: 'embers', hell: 'embers',
  snowy: 'snow',
  'dense-forest': 'fog', shadowland: 'fog',
  swamps: 'murk', intestines: 'murk',
  heaven: 'holy', valhalla: 'holy',
  abyss: 'void',
};

type FxFor = (instanceId: string) => FxEvent | undefined;

/** Entrance animation for a board card targeted by an fx event —
 *  slam flies in from the owner's side, spy flips in, move hops.
 *  Mirrors the web tweens (player cards fly up, ai cards fly down). */
function FxCard({ fx, side, children }: { fx?: FxEvent; side: Side; children: React.ReactNode }) {
  const t = useRef(new Animated.Value(1)).current;
  const kind = fx?.kind;
  const animate = kind === 'slam' || kind === 'spy' || kind === 'move';
  useEffect(() => {
    if (!animate) return;
    t.setValue(0);
    Animated.timing(t, {
      toValue: 1,
      duration: kind === 'spy' ? 650 : kind === 'move' ? 600 : 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx?.id]);

  if (!animate) return <>{children}</>;

  const from = side === 'player' ? 90 : -90;
  const style =
    kind === 'slam'
      ? {
          opacity: t,
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) },
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1.3, 1] }) },
          ],
        }
      : kind === 'spy'
        ? {
            opacity: t,
            transform: [
              { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) },
              { scaleX: t.interpolate({ inputRange: [0, 1], outputRange: [0.05, 1] }) },
            ],
          }
        : {
            // move — hop
            transform: [
              { translateY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -24, 0] }) },
            ],
          };

  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Death animation for a card that left the board via burn/destroy —
 *  burn flashes red and rises apart, destroy crumples and sinks. */
function DyingCard({ card, kind }: { card: BoardCard; kind: 'burn' | 'destroy' }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 650,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [t]);
  const style =
    kind === 'burn'
      ? {
          opacity: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.9, 0] }),
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -26] }) },
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) },
          ],
        }
      : {
          opacity: t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.8, 0] }),
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) },
            { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '24deg'] }) },
          ],
        };
  return (
    <Animated.View style={style}>
      <CardView card={card.def} bonus={card.bonus} size="board" disabled />
      {kind === 'burn' && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: '#ff2a3c',
              opacity: t.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.55, 0] }),
            },
          ]}
        />
      )}
    </Animated.View>
  );
}

/** Floating +N/-N power-change number rising off a card (web spawnFloat). */
function FloatText({ delta }: { delta: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [t]);
  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.floatText,
        {
          color: delta > 0 ? '#34d399' : colors.bloodNeon,
          opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) }],
        },
      ]}
    >
      {delta > 0 ? `+${delta}` : delta}
    </Animated.Text>
  );
}

/** One ambient mote — loops forever, direction/color per location kind. */
function AmbientDot({
  kind,
  left,
  delay,
  dur,
  size,
  drift,
}: {
  kind: AmbientKind;
  left: number;
  delay: number;
  dur: number;
  size: number;
  drift: number;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: dur, delay, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const falling = kind === 'snow';
  const still = kind === 'fog';
  const peak = kind === 'fog' ? 0.12 : kind === 'void' ? 0.35 : 0.7;
  const color =
    kind === 'embers'
      ? ['#ff2a3c', '#ff6a5a', '#c1121f'][left % 3]
      : kind === 'snow'
        ? '#eaf4ff'
        : kind === 'fog'
          ? '#9aa3ad'
          : kind === 'murk'
            ? ['#5a7832', '#3c642d'][left % 2]
            : kind === 'holy'
              ? ['#e8ecf1', '#ff8a95'][left % 2]
              : ['#3a0a30', '#6a2a50'][left % 2];
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: `${left}%`,
        top: '55%',
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: color,
        opacity: t.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, peak, peak, 0] }),
        transform: [
          {
            translateY: still
              ? 0
              : t.interpolate({ inputRange: [0, 1], outputRange: falling ? [-30, 150] : [40, -150] }),
          },
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
        ],
      }}
    />
  );
}

/** Ambient particle field for a zone — embers/snow/fog/murk/holy/void. */
const Ambient = React.memo(function Ambient({ kind }: { kind: AmbientKind }) {
  const dots = useMemo(
    () =>
      Array.from({ length: kind === 'fog' ? 5 : 10 }, (_, i) => ({
        left: (i * 37 + 13) % 96,
        delay: i * 260,
        dur: 2400 + (i % 5) * 400,
        size: kind === 'fog' ? 30 : kind === 'void' ? 9 : 3 + (i % 3),
        drift: ((i % 3) - 1) * 16,
      })),
    [kind],
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {dots.map((d, i) => (
        <AmbientDot key={i} kind={kind} {...d} />
      ))}
    </View>
  );
});

/** Continuous fire licking around a live chaos card (web syncChaosFire). */
function ChaosFire() {
  const dots = useMemo(
    () => [0, 1, 2, 3].map((i) => ({ left: 4 + i * 13, delay: i * 170, dur: 520 + i * 110 })),
    [],
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {dots.map((d, i) => (
        <AmbientDot key={i} kind="embers" size={3} drift={(i % 2) * 8 - 4} {...d} />
      ))}
    </View>
  );
}

/** Round-transition reveal: black cover lifts off this zone (web playReveal). */
function RevealCover({ delay }: { delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 450,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: '#060504',
          opacity: t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
          transform: [{ scaleY: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.001] }) }],
        },
      ]}
    />
  );
}

/** Round-end juice: zone flash + winning coin pulse (web flash/pulseCoin). */
function RoundEndFlash({ winner }: { winner: 'player' | 'ai' | 'tie' }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [t]);
  const color = winner === 'player' ? '#e8ecf1' : winner === 'ai' ? '#ff2a3c' : '#7a828e';
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: color, opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }) },
      ]}
    />
  );
}

function PulseCoin({ pulse, children }: { pulse: boolean; children: React.ReactNode }) {
  const t = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!pulse) return;
    Animated.sequence([
      Animated.timing(t, { toValue: 1.35, duration: 160, useNativeDriver: true }),
      Animated.timing(t, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [pulse, t]);
  return <Animated.View style={{ transform: [{ scale: t }] }}>{children}</Animated.View>;
}

/** Zone-level effect: dust ring on slams, red flash on burn/destroy. */
function ZoneFx({ kind }: { kind: FxEvent['kind'] }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [t]);

  if (kind === 'slam') {
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.dustRing,
          {
            opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.4] }) }],
          },
        ]}
      />
    );
  }
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.flash,
        {
          opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
          transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.8] }) }],
        },
      ]}
    >
      <Image source={GLOW_SPRITES.mythic} style={{ width: '100%', height: '100%' }} />
    </Animated.View>
  );
}

interface Ghost {
  card: BoardCard;
  kind: 'burn' | 'destroy';
  key: number;
  slot: number;
}
interface Float {
  key: number;
  slot: number;
  delta: number;
}

const CardSlots = React.memo(function CardSlots({
  cards,
  capacity,
  side,
  locIndex,
  fxFor,
}: {
  cards: BoardCard[];
  capacity: number;
  side: Side;
  locIndex: number;
  fxFor: FxFor;
}) {
  const dim = CARD_SIZES.board;
  const inspectCard = useGameStore((s) => s.inspectCard);
  const fx = useGameStore((s) => s.fx);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [floats, setFloats] = useState<Float[]>([]);
  const prevRef = useRef<Map<string, { card: BoardCard; power: number; slot: number }>>(new Map());

  // Track power deltas (floaters) and departures (burn/destroy ghosts).
  useEffect(() => {
    const state = useGameStore.getState();
    const prev = prevRef.current;
    const next = new Map<string, { card: BoardCard; power: number; slot: number }>();
    cards.forEach((c, i) =>
      next.set(c.instanceId, { card: c, power: cardPower(state, locIndex, side, c), slot: i }),
    );

    const newFloats: Float[] = [];
    for (const c of cards) {
      const p = prev.get(c.instanceId);
      const n = next.get(c.instanceId)!;
      if (p && p.power !== n.power) {
        newFloats.push({ key: c.instanceId.length + n.power * 31 + Date.now() % 1000, slot: n.slot, delta: n.power - p.power });
      }
    }

    const newGhosts: Ghost[] = [];
    for (const f of fx) {
      if (
        f.li === locIndex &&
        f.side === side &&
        (f.kind === 'burn' || f.kind === 'destroy') &&
        f.instanceId &&
        !next.has(f.instanceId)
      ) {
        const p = prev.get(f.instanceId);
        if (p) newGhosts.push({ card: p.card, kind: f.kind, key: f.id, slot: p.slot });
      }
    }
    prevRef.current = next;

    if (newFloats.length) {
      const keys = newFloats.map((f) => f.key);
      setFloats((fl) => [...fl, ...newFloats]);
      setTimeout(() => setFloats((fl) => fl.filter((f) => !keys.includes(f.key))), 950);
    }
    if (newGhosts.length) {
      const keys = newGhosts.map((g) => g.key);
      setGhosts((g) => [...g.filter((x) => !keys.includes(x.key)), ...newGhosts]);
      setTimeout(() => setGhosts((g) => g.filter((x) => !keys.includes(x.key))), 700);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, fx]);

  // Merge live cards and dying ghosts into fixed slot cells.
  const cells: { card?: BoardCard; ghost?: Ghost }[] = Array.from({ length: capacity }, () => ({}));
  cards.forEach((c, i) => {
    if (i < capacity) cells[i].card = c;
  });
  for (const g of ghosts) {
    let slot = g.slot < capacity && !cells[g.slot].card && !cells[g.slot].ghost ? g.slot : -1;
    if (slot < 0) slot = cells.findIndex((c) => !c.card && !c.ghost);
    if (slot >= 0) cells[slot].ghost = g;
  }

  const state = useGameStore.getState();
  return (
    <View style={styles.slots}>
      {cells.map((cell, i) => {
        const c = cell.card;
        const g = cell.ghost;
        if (!c && !g) {
          return <View key={`e${i}`} style={[styles.slotEmpty, { width: dim.w, height: dim.h }]} />;
        }
        const p = c ? cardPower(state, locIndex, side, c) : 0;
        const hidden = !!c && side === 'ai' && c.faceDown;
        return (
          <View key={c?.instanceId ?? `g${g!.key}`} style={{ width: dim.w, height: dim.h }}>
            {g && <DyingCard card={g.card} kind={g.kind} />}
            {c && (
              <FxCard fx={fxFor(c.instanceId)} side={side}>
                <CardView
                  card={c.def}
                  bonus={c.bonus}
                  power={p}
                  size="board"
                  faceDown={hidden}
                  silenced={c.silenced}
                  disabled
                  onInspect={hidden ? undefined : () => inspectCard(c.def, c.bonus, p)}
                />
              </FxCard>
            )}
            {floats
              .filter((f) => f.slot === i)
              .map((f) => (
                <FloatText key={f.key} delta={f.delta} />
              ))}
          </View>
        );
      })}
    </View>
  );
});

const ChaosSlot = React.memo(function ChaosSlot({
  card,
  side,
  locIndex,
  fxFor,
}: {
  card: BoardCard | null;
  side: Side;
  locIndex: number;
  fxFor: FxFor;
}) {
  const state = useGameStore.getState();
  const dim = CARD_SIZES.board;
  // Hook must run unconditionally — before the !card early return.
  const inspectCard = useGameStore((s) => s.inspectCard);
  if (!card) {
    return (
      <View style={[styles.chaosEmpty, { width: dim.w, height: dim.h }]}>
        <Text style={styles.chaosEmptyText}>chaos</Text>
      </View>
    );
  }
  const p = cardPower(state, locIndex, side, card);
  const hidden = side === 'ai' && card.faceDown;
  return (
    <View>
      <FxCard fx={fxFor(card.instanceId)} side={side}>
        <CardView
          card={card.def}
          bonus={card.bonus}
          power={p}
          size="board"
          faceDown={hidden}
          silenced={card.silenced}
          disabled
          onInspect={hidden ? undefined : () => inspectCard(card.def, card.bonus, p)}
        />
      </FxCard>
      {!hidden && <ChaosFire />}
      <View style={styles.chaosTag}>
        <Text style={styles.chaosTagText}>chaos</Text>
      </View>
    </View>
  );
});

/** The heavy, mostly-static zone content — art, ambient motes, both card
 *  halves, and the banner. Memoized so hot/playable/selectedHand changes
 *  (drag hover, card select) re-render only the thin Pressable wrapper, not
 *  this subtree — that's what made hovering a zone feel laggy. */
const LocationBody = React.memo(function LocationBody({
  location,
  index,
  capacity,
  fxFor,
  ambient,
  art,
  aTotal,
  pTotal,
  winner,
  selected,
}: {
  location: LocationState;
  index: number;
  capacity: number;
  fxFor: FxFor;
  ambient: AmbientKind | null;
  art: ReturnType<typeof locationImage>;
  aTotal: number;
  pTotal: number;
  winner: 'player' | 'ai' | 'tie' | null;
  /** Selected hand card — its name/ability/power replace the location label. */
  selected: HandCard | null;
}) {
  return (
    <>
      {/* Web uses setDisplaySize (stretch) — cover would crop a dark center slice */}
      {art && <Image source={art} style={styles.imgFill} resizeMode="stretch" />}
      <View style={styles.shade} pointerEvents="none" />
      {ambient && <Ambient kind={ambient} />}

      {/* AI cards (top half) */}
      <View style={styles.half}>
        <CardSlots cards={location.ai} capacity={capacity} side="ai" locIndex={index} fxFor={fxFor} />
        <ChaosSlot card={location.aiChaos} side="ai" locIndex={index} fxFor={fxFor} />
      </View>

      {/* Location banner with power totals */}
      <View style={styles.banner}>
        <PulseCoin pulse={winner === 'ai'}>
          <View style={[styles.totalCoin, aTotal >= pTotal && aTotal > 0 && { borderColor: colors.bloodNeon }]}>
            <Text style={[styles.totalText, aTotal >= pTotal && aTotal > 0 && { color: colors.bloodNeon }]}>
              {aTotal}
            </Text>
          </View>
        </PulseCoin>
        <View style={styles.bannerMid}>
          {selected ? (
            <>
              <Text numberOfLines={1} style={styles.locName}>
                {selected.def.name}
                <Text
                  style={[
                    styles.selPower,
                    selected.bonus > 0 && { color: '#7ee08f' },
                    selected.bonus < 0 && { color: '#ff7a6a' },
                  ]}
                >
                  {'  '}{Math.max(0, selected.def.power + selected.bonus)}
                </Text>
              </Text>
              <Text numberOfLines={2} style={styles.locText}>
                {selected.def.text || '—'}
              </Text>
            </>
          ) : (
            <>
              <Text numberOfLines={1} style={styles.locName}>
                {location.def.name}
              </Text>
              <Text numberOfLines={2} style={styles.locText}>
                {location.def.text}
              </Text>
            </>
          )}
        </View>
        <PulseCoin pulse={winner === 'player'}>
          <View style={[styles.totalCoin, pTotal >= aTotal && pTotal > 0 && { borderColor: '#34d399' }]}>
            <Text style={[styles.totalText, pTotal >= aTotal && pTotal > 0 && { color: '#34d399' }]}>
              {pTotal}
            </Text>
          </View>
        </PulseCoin>
      </View>

      {/* Player cards (bottom half) */}
      <View style={styles.half}>
        <ChaosSlot card={location.playerChaos} side="player" locIndex={index} fxFor={fxFor} />
        <CardSlots cards={location.player} capacity={capacity} side="player" locIndex={index} fxFor={fxFor} />
      </View>
    </>
  );
});

// Memoized — Board re-renders on drag start/end (ghost mount) and on the hot
// flag; with stable location/index/hot props this skips the redundant pass.
export const LocationColumn = React.memo(function LocationColumn({ location, index, hot }: Props) {
  const phase = useGameStore((s) => s.phase);
  const playAtLocation = useGameStore((s) => s.playAtLocation);
  const selectedHand = useGameStore((s) => s.selectedHand);
  const hand = useGameStore((s) => s.player.hand);
  const playerPassed = useGameStore((s) => s.player.passed);
  const fx = useGameStore((s) => s.fx);
  const state = useGameStore.getState();
  // Stable across re-renders so memoized children (CardSlots/ChaosSlot) hold.
  const locFx = useMemo(() => fx.filter((f) => f.li === index), [fx, index]);
  const fxFor: FxFor = useCallback(
    (instanceId) => locFx.find((f) => f.instanceId === instanceId),
    [locFx],
  );

  // Round-transition reveal covers — fire when a fresh player turn starts.
  const [revealKey, setRevealKey] = useState(0);
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (prevPhase.current !== phase && phase === 'player-turn') setRevealKey((k) => k + 1);
    prevPhase.current = phase;
  }, [phase]);

  const pTotal = sideTotal(state, index, 'player');
  const aTotal = sideTotal(state, index, 'ai');
  const capacity = capacityFor(location);
  const selected = selectedHand !== null ? hand[selectedHand] : null;
  const playable =
    phase === 'player-turn' &&
    !playerPassed &&
    selected !== null &&
    canPlayAt(state, 'player', selected.def, index);

  const scoring = phase === 'round-end' || phase === 'game-end';
  const winner = scoring ? (pTotal > aTotal ? 'player' : aTotal > pTotal ? 'ai' : 'tie') : null;
  const art = locationImage(location.def.id, index);
  const ambient = AMBIENT[location.def.id] ?? null;

  return (
    <Pressable
      onPress={() => playable && playAtLocation(index)}
      style={[
        styles.zone,
        playable && styles.zonePlayable,
        hot && playable && styles.zoneHot,
        winner === 'player' && styles.zoneWinPlayer,
        winner === 'ai' && styles.zoneWinAi,
      ]}
    >
      <LocationBody
        location={location}
        index={index}
        capacity={capacity}
        fxFor={fxFor}
        ambient={ambient}
        art={art}
        aTotal={aTotal}
        pTotal={pTotal}
        selected={selected}
        winner={winner}
      />

      {/* Zone-level fx: dust rings on slams, flash on burn/destroy */}
      {locFx.map((f) =>
        f.kind === 'slam' || f.kind === 'burn' || f.kind === 'destroy' ? (
          <ZoneFx key={f.id} kind={f.kind} />
        ) : null,
      )}

      {winner && <RoundEndFlash winner={winner} />}
      {revealKey > 0 && <RevealCover key={revealKey} delay={index * 140} />}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // Explicit 100% size — RNW Image falls back to intrinsic bitmap dims otherwise.
  // zIndex lifts the art above the zone's opaque backgroundColor (RNW paints the
  // inner background-image div at z-index:-1 inside a filtered stacking context).
  imgFill: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', zIndex: 0 },
  zone: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  zonePlayable: {
    borderColor: colors.bloodNeon,
    shadowColor: colors.bloodNeon,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 6,
  },
  zoneWinPlayer: { borderColor: colors.chromeBright },
  zoneWinAi: { borderColor: colors.bloodNeon },
  zoneHot: {
    borderColor: colors.bloodNeon,
    borderWidth: 2,
    backgroundColor: 'rgba(42,6,11,0.55)',
    shadowColor: colors.bloodNeon,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 8,
  },
  floatText: {
    position: 'absolute',
    top: -6,
    alignSelf: 'center',
    zIndex: 6,
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'monospace',
    textShadowColor: '#000',
    textShadowRadius: 3,
  },
  shade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  half: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
    gap: 3,
  },
  slots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  slotEmpty: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(122,130,142,0.25)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  chaosEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(193,18,31,0.4)',
    backgroundColor: 'rgba(26,5,8,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chaosEmptyText: {
    color: 'rgba(193,18,31,0.6)',
    fontSize: 8,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
  },
  chaosTag: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
    backgroundColor: '#3a0a12',
    borderWidth: 1,
    borderColor: colors.blood,
    paddingHorizontal: 3,
  },
  chaosTagText: {
    color: colors.bloodNeon,
    fontSize: 6,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 5,
    paddingVertical: 4,
    backgroundColor: 'rgba(10,8,12,0.9)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(193,18,31,0.3)',
  },
  bannerMid: { flex: 1, alignItems: 'center', minWidth: 0 },
  locName: {
    color: colors.chromeBright,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  locText: {
    color: colors.chromeDark,
    fontSize: 8,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  // Selected card's power — inline after the name on the location label.
  selPower: {
    color: colors.chromeBright,
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  totalCoin: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.chromeDark,
    backgroundColor: '#16121a',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
  },
  totalText: {
    color: colors.chromeBright,
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  dustRing: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    width: 90,
    height: 90,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: 'rgba(200,205,212,0.8)',
  },
  flash: {
    position: 'absolute',
    alignSelf: 'center',
    top: '30%',
    width: 160,
    height: 160,
  },
});
