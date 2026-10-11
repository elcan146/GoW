import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { makeMutable, runOnJS, type SharedValue } from 'react-native-reanimated';
import { cardBack } from '../assets';
import { useGameStore } from '../game/store';
import { colors } from '../theme';
import { CardView, CARD_SIZES } from './CardView';

// Extra headroom so the selected card's -18 lift doesn't clip the tray.
export const TRAY_H = CARD_SIZES.hand.h + 34;
const DRAG_THRESHOLD = 8;

/**
 * Drag bridge between the hand cards and the board. The pan gesture runs on
 * the UI thread and writes the shared values directly — no JS bridge per
 * frame (the old PanResponder + setState-per-move was the lag). Only the
 * lifecycle events cross to JS via runOnJS.
 */
export interface HandDrag {
  /** Finger position in window coords — written by the pan worklet. */
  ghostX: SharedValue<number>;
  ghostY: SharedValue<number>;
  /** Window Y of the tray's top edge — the drop/hover threshold. */
  trayTop: SharedValue<number>;
  /** Current pager page (0 = music). Drops only play when > 0. */
  page: SharedValue<number>;
  /** 1 while hovering a playable zone — flipped on the UI thread. */
  hot: SharedValue<number>;
  /** Drag activated (crossed threshold). */
  onStart: (handIndex: number, x: number, y: number) => void;
  /** Released while dragging. */
  onEnd: (x: number, y: number) => void;
  /** Gesture cancelled/stolen mid-drag. */
  onCancel: () => void;
  /** Hover crossed the tray line. */
  onHot: (hot: boolean) => void;
}

// Fallback when no drag bridge is provided — dummy mutables + no-op callbacks.
const noopDrag: HandDrag = {
  ghostX: makeMutable(0),
  ghostY: makeMutable(0),
  trayTop: makeMutable(0),
  page: makeMutable(0),
  hot: makeMutable(0),
  onStart: () => {},
  onEnd: () => {},
  onCancel: () => {},
  onHot: () => {},
};

/** Staggered deal-in entrance — mirrors the web deal-in keyframe. */
function DealIn({ index, children }: { index: number; children: React.ReactNode }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 420,
      delay: index * 70,
      easing: Easing.out(Easing.back(1.1)),
      useNativeDriver: true,
    }).start();
  }, [index, t]);
  return (
    <Animated.View
      style={{
        opacity: t,
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [50, 0] }) },
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Hand card with tap-to-select + drag-to-play. The pan runs on the UI thread
 *  (react-native-gesture-handler + reanimated) so the ghost tracks the finger
 *  with no JS bridge per frame — the old PanResponder + setState was the lag. */
function DraggableCard({
  index,
  interactive,
  dragging,
  deny,
  drag,
  onTap,
  children,
}: {
  index: number;
  interactive: boolean;
  dragging: boolean;
  /** Bumps when a play is denied — selected card wiggles (web deny shake). */
  deny: number;
  drag: HandDrag;
  onTap: (i: number) => void;
  children: React.ReactNode;
}) {
  // Deny wiggle — quick left-right shake on the selected card.
  const wiggle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!deny) return;
    wiggle.setValue(0);
    Animated.timing(wiggle, {
      toValue: 1,
      duration: 320,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [deny, wiggle]);

  const { ghostX, ghostY, trayTop, page, hot, onStart, onEnd, onCancel, onHot } = drag;

  // Pan: activates after DRAG_THRESHOLD px (replaces the manual tap/drag
  // check). onUpdate writes the shared values on the UI thread; the hot flag
  // only crosses to JS when it flips. Lifecycle goes through runOnJS.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(DRAG_THRESHOLD)
        .enabled(interactive)
        .onStart((e) => {
          runOnJS(onStart)(index, e.absoluteX, e.absoluteY);
        })
        .onUpdate((e) => {
          ghostX.value = e.absoluteX;
          ghostY.value = e.absoluteY;
          const h = e.absoluteY < trayTop.value && page.value > 0 ? 1 : 0;
          if (h !== hot.value) {
            hot.value = h;
            runOnJS(onHot)(h === 1);
          }
        })
        .onEnd((e) => {
          runOnJS(onEnd)(e.absoluteX, e.absoluteY);
        })
        .onFinalize((_e, success) => {
          if (!success) runOnJS(onCancel)();
        }),
    [interactive, index, ghostX, ghostY, trayTop, page, hot, onStart, onEnd, onCancel, onHot],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .enabled(interactive)
        .onEnd(() => {
          runOnJS(onTap)(index);
        }),
    [interactive, index, onTap],
  );

  // Pan wins once it crosses the threshold; a clean release falls through to tap.
  const gesture = useMemo(() => Gesture.Exclusive(pan, tap), [pan, tap]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={{
          opacity: dragging ? 0.25 : 1,
          transform: [
            {
              translateX: wiggle.interpolate({
                inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
                outputRange: [0, -7, 7, -5, 5, 0],
              }),
            },
          ],
        }}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * Bottom tray: deck pile on the left, fanned hand cards.
 * Tap a card to select it (then tap a glowing location to play),
 * or drag it onto the visible location — mirrors the web build.
 * Slides/fades away when `visible` is false (music player page).
 */
export function HandBar({
  visible = true,
  dragIndex = -1,
  denyTick = 0,
  drag,
}: {
  visible?: boolean;
  dragIndex?: number;
  denyTick?: number;
  drag?: HandDrag;
}) {
  const hand = useGameStore((s) => s.player.hand);
  const deck = useGameStore((s) => s.player.deck);
  const selected = useGameStore((s) => s.selectedHand);
  const phase = useGameStore((s) => s.phase);
  const passed = useGameStore((s) => s.player.passed);
  const selectCard = useGameStore((s) => s.selectCard);

  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: false, // height animation
    }).start();
  }, [visible, anim]);

  const interactive = phase === 'player-turn' && !passed;
  // Fan overlap solved from the available width — cards never spill off-screen.
  const cardW = CARD_SIZES.hand.w;
  const fanW = Dimensions.get('window').width - PILE_W - 12 - 6 - 16;
  const overlap =
    hand.length > 1 ? Math.min(-8, Math.floor((fanW - cardW) / (hand.length - 1) - cardW)) : 0;
  const topBack = deck.length ? cardBack(deck[0].faction) : undefined;
  const dragCb = drag ?? noopDrag;

  return (
    <Animated.View
      style={[
        styles.tray,
        {
          height: anim.interpolate({ inputRange: [0, 1], outputRange: [0, TRAY_H] }),
          opacity: anim,
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {/* Deck pile */}
      <View style={styles.pile}>
        {deck.length > 0 ? (
          <>
            <View style={[styles.pileCard, { transform: [{ rotate: '-3deg' }, { translateX: -3 }, { translateY: 3 }] }]} />
            <View style={[styles.pileCard, { transform: [{ rotate: '2deg' }, { translateX: 2 }, { translateY: -2 }] }]} />
            <View style={styles.pileTop}>
              {topBack && <Image source={topBack} style={styles.imgFill} resizeMode="cover" />}
            </View>
            <Text style={styles.pileCount}>{deck.length}</Text>
          </>
        ) : (
          <Text style={styles.pileEmpty}>empty</Text>
        )}
      </View>

      {/* Hand fan */}
      <View style={styles.fan}>
        {hand.length === 0 && (
          <Text style={styles.hint}>{interactive ? 'HAND EMPTY' : 'WAITING…'}</Text>
        )}
        {hand.map((hc, i) => (
          // Key by slot index: cards shift left when one is played, so
          // survivors keep their component (no re-deal animation) while
          // newly drawn cards animate in at the tail.
          <View
            key={i}
            style={{
              marginLeft: i === 0 ? 0 : overlap,
              transform: [{ rotate: `${(i - (hand.length - 1) / 2) * 4}deg` }],
              zIndex: i === selected ? 10 : i,
            }}
          >
            <DealIn index={i}>
              <DraggableCard
                index={i}
                interactive={interactive}
                dragging={i === dragIndex}
                deny={i === selected ? denyTick : 0}
                drag={dragCb}
                onTap={selectCard}
              >
                <CardView
                  card={hc.def}
                  bonus={hc.bonus}
                  size="hand"
                  selected={i === selected}
                  disabled={!interactive}
                />
              </DraggableCard>
            </DealIn>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const PILE_W = 58;
const PILE_H = 82;

const styles = StyleSheet.create({
  // Explicit 100% size — RNW Image falls back to intrinsic bitmap dims otherwise.
  imgFill: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  tray: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8,7,10,0.9)',
    borderTopWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  pile: {
    width: PILE_W + 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  pileCard: {
    position: 'absolute',
    width: PILE_W,
    height: PILE_H,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.borderLight,
    backgroundColor: '#14101a',
  },
  pileTop: {
    width: PILE_W,
    height: PILE_H,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.borderLight,
    overflow: 'hidden',
    backgroundColor: '#14101a',
  },
  pileCount: {
    position: 'absolute',
    bottom: -14,
    color: colors.chromeBright,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  pileEmpty: {
    color: colors.chromeDark,
    fontSize: 9,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
  },
  fan: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    color: colors.chromeDark,
    fontSize: 11,
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
});
