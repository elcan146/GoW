import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import ReAnimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { cardImage } from '../assets';
import { canPlayAt } from '../game/effects';
import { useGameStore } from '../game/store';
import type { CardDef } from '../game/types';
import { colors } from '../theme';
import { CardView, CARD_SIZES } from './CardView';
import { HandBar, TRAY_H, type HandDrag } from './HandBar';
import { LocationColumn } from './LocationColumn';
import { MusicPlayer } from './MusicPlayer';
import { Pager, type PagerHandle } from './Pager';

interface DragState {
  index: number;
  def: CardDef;
  bonus: number;
}

/**
 * Match board (portrait): AI hand strip on top, then a horizontal pager —
 * MusicPlayer ‹ Location 1 ‹ Location 2 ‹ Location 3 — and the hand tray
 * pinned to the bottom. The tray slides away on the music page.
 */
export function Board() {
  const locations = useGameStore((s) => s.locations);
  const aiHand = useGameStore((s) => s.ai.hand);
  const aiPassed = useGameStore((s) => s.ai.passed);
  const aiDeck = useGameStore((s) => s.ai.deck.length);
  const playerDeck = useGameStore((s) => s.player.deck.length);
  const shake = useGameStore((s) => s.shake);
  const fx = useGameStore((s) => s.fx);
  const hand = useGameStore((s) => s.player.hand);
  const selectedHand = useGameStore((s) => s.selectedHand);
  const selectCard = useGameStore((s) => s.selectCard);
  const playAtLocation = useGameStore((s) => s.playAtLocation);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState(1);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [denyTick, setDenyTick] = useState(0);
  const [hot, setHot] = useState(false);
  const rootRef = useRef<View>(null);
  const pagerRef = useRef<PagerHandle>(null);
  // Board origin + height in window coords — converts pageX/Y to local
  // ghost coords and locates the tray top for drop detection.
  const origin = useRef({ x: 0, y: 0, h: 0 });
  const pageRef = useRef(page);
  pageRef.current = page;
  const handRef = useRef(hand);
  handRef.current = hand;
  const selectedRef = useRef(selectedHand);
  selectedRef.current = selectedHand;
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  // Drag runs on the UI thread: the pan worklet writes these shared values
  // directly (no JS bridge per frame — that was the lag). ghostX/Y = finger
  // position; originX/Y + trayTop locate the board + drop line; page/hot gate
  // the drop + zone highlight. Only lifecycle events cross to JS via runOnJS.
  const ghostX = useSharedValue(0);
  const ghostY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const trayTop = useSharedValue(0);
  const pageSV = useSharedValue(1);
  const hotSV = useSharedValue(0);
  useEffect(() => {
    pageSV.value = page;
  }, [page, pageSV]);

  // JS-side drag lifecycle — invoked from the worklet via runOnJS.
  const onDragStart = useCallback(
    (i: number) => {
      const hc = handRef.current[i];
      if (!hc) return;
      // Select on drag start so playable zones light up (web parity).
      if (selectedRef.current !== i) selectCard(i);
      hotSV.value = 0;
      setHot(false);
      setDrag({ index: i, def: hc.def, bonus: hc.bonus });
    },
    [selectCard, hotSV],
  );
  const onDragEnd = useCallback(
    (_x: number, y: number) => {
      const d = dragRef.current;
      setDrag(null);
      hotSV.value = 0;
      setHot(false);
      if (!d) return;
      // Dropped above the tray while a location page is showing → play.
      if (y < trayTop.value && pageRef.current > 0) {
        const li = pageRef.current - 1;
        const st = useGameStore.getState();
        // Deny wiggle when the drop isn't legal (web deny shake parity).
        if (canPlayAt(st, 'player', d.def, li)) playAtLocation(li);
        else setDenyTick((n) => n + 1);
      }
    },
    [playAtLocation, trayTop, hotSV],
  );
  const onDragCancel = useCallback(() => {
    setDrag(null);
    hotSV.value = 0;
    setHot(false);
  }, [hotSV]);
  const onHot = useCallback((h: boolean) => setHot(h), []);

  const dragCb: HandDrag = {
    ghostX,
    ghostY,
    trayTop,
    page: pageSV,
    hot: hotSV,
    onStart: onDragStart,
    onEnd: onDragEnd,
    onCancel: onDragCancel,
    onHot,
  };

  // Ghost follows the finger entirely on the UI thread.
  const ghostStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: ghostX.value - originX.value - CARD_SIZES.hand.w / 2 },
      { translateY: ghostY.value - originY.value - CARD_SIZES.hand.h * 0.75 },
      { rotate: '-4deg' },
      { scale: 1.06 },
    ],
  }));

  // Board shake on card slams — mirrors the web WAAPI keyframes.
  useEffect(() => {
    if (!shake) return;
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0.6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -0.4, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [shake, shakeAnim]);
// Auto-focus the location the AI just played on. Each commit carries a fresh
  // fx batch; the newest slam/spy is the card that landed. Player plays are a
  // no-op scroll (they're already viewing that page). Track the handled id so
  // the fx-clear pass doesn't re-trigger.
  const lastFxRef = useRef(0);
  useEffect(() => {
    const play = [...fx].reverse().find((f) => f.kind === 'slam' || f.kind === 'spy');
    if (!play || play.id <= lastFxRef.current) return;
    lastFxRef.current = play.id;
    pagerRef.current?.scrollToPage(play.li + 1); // page 0 = music, locations 1-3
  }, [fx]);

  
  const tx = shakeAnim.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] });
  const ty = shakeAnim.interpolate({ inputRange: [-1, 1], outputRange: [3, -3] });
  // Zoom punch — the web board kicks scale ~1.02 on each slam.
  const punch = shakeAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: [1.018, 1, 1.018] });
  // Drag-over state for the visible location (web setHot) — driven by the
  // hot boolean flipped in onDragMove, not per-move position state.
  const dragHot = hot;

  const pages = [
    <MusicPlayer key="music" />,
    ...locations.map((loc, i) => (
      <View key={`${loc.def.id}-${i}`} style={styles.locPage}>
        <LocationColumn location={loc} index={i} hot={dragHot} />
      </View>
    )),
  ];

  return (
    <View
      ref={rootRef}
      style={styles.root}
      onLayout={() => {
        const node = rootRef.current as unknown as {
          measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
          getBoundingClientRect?: () => { left: number; top: number; height: number };
        } | null;
        // RNW View refs are DOM nodes (no measureInWindow) — fall back to
        // getBoundingClientRect so drop detection works on web.
        if (typeof node?.measureInWindow === 'function') {
          node.measureInWindow((x, y, _w, h) => {
            origin.current = { x, y, h };
            originX.value = x;
            originY.value = y;
            trayTop.value = y + h - TRAY_H;
          });
        } else if (typeof node?.getBoundingClientRect === 'function') {
          const r = node.getBoundingClientRect();
          origin.current = { x: r.left, y: r.top, h: r.height };
          originX.value = r.left;
          originY.value = r.top;
          trayTop.value = r.top + r.height - TRAY_H;
        }
      }}
    >
      {/* AI hand: fanned card backs + counts */}
      <View style={styles.aiRow}>
        {aiPassed ? (
          <View style={styles.passedTag}>
            <Text style={styles.passedText}>Opponent has passed</Text>
          </View>
        ) : (
          <View style={styles.aiFan}>
            {aiHand.slice(0, 8).map((hc, i) => (
              <View
                key={`${hc.def.id}-${i}`}
                style={{
                  marginLeft: i === 0 ? 0 : -16,
                  transform: [{ rotate: `${(i - aiHand.length / 2) * 3}deg` }],
                }}
              >
                <CardView card={hc.def} size="mini" faceDown disabled />
              </View>
            ))}
            <View style={styles.aiCount}>
              <Text style={styles.aiCountText}>{aiHand.length}</Text>
            </View>
          </View>
        )}
        <View style={styles.deckCount}>
          <Text style={styles.deckCountText}>
            decks {playerDeck} : {aiDeck}
          </Text>
        </View>
      </View>

      {/* One location at a time — swipe or use the edge arrows */}
      <Animated.View
        style={[styles.pagerWrap, { transform: [{ translateX: tx }, { translateY: ty }, { scale: punch }] }]}
      >
        <Pager ref={pagerRef} pages={pages} initialPage={1} onPageChange={setPage} />
      </Animated.View>

      <HandBar visible={page !== 0} dragIndex={drag?.index ?? -1} denyTick={denyTick} drag={dragCb} />

      {/* Floating card while dragging — rendered above the tray, which
          clips its children (overflow hidden). Positioned by ghostPos (an
          Animated value) so moves don't re-render the board. */}
      {drag && (
        <ReAnimated.View pointerEvents="none" style={[styles.ghost, ghostStyle]}>
          {/* Lightweight ghost — just frame + art + name. A full CardView mounts
              a GlowAura loop + PowerCoin pop + Pressable on pickup, which is the
              frame-hitch the user feels. This mounts ~3 nodes instead. */}
          <View style={[styles.ghostCard, { width: CARD_SIZES.hand.w, height: CARD_SIZES.hand.h }]}>
            {cardImage(drag.def.art) ? (
              <Image source={cardImage(drag.def.art)} style={styles.ghostImg} resizeMode="cover" />
            ) : null}
            <View style={styles.ghostPlate} pointerEvents="none">
              <Text numberOfLines={1} style={styles.ghostName}>{drag.def.name}</Text>
            </View>
          </View>
        </ReAnimated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    gap: 10,
  },
  aiFan: { flexDirection: 'row', alignItems: 'center' },
  aiCount: {
    marginLeft: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  aiCountText: { color: colors.chromeBright, fontSize: 11, fontFamily: 'monospace' },
  passedTag: {
    backgroundColor: '#1a0508',
    borderWidth: 1,
    borderColor: colors.blood,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  passedText: {
    color: colors.bloodNeon,
    fontSize: 10,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  deckCount: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deckCountText: { color: colors.chromeDark, fontSize: 9, fontFamily: 'monospace' },
  pagerWrap: { flex: 1, minHeight: 0 },
  locPage: { flex: 1, minHeight: 0, paddingHorizontal: 10, paddingVertical: 4 },
  ghost: {
    position: 'absolute',
    zIndex: 50,
    elevation: 50,
  },
  ghostCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 5,
    borderColor: colors.borderLight,
    backgroundColor: '#0a080c',
  },
  ghostImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  ghostPlate: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4,2,6,0.88)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,42,60,0.35)',
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  ghostName: { color: colors.chromeBright, fontSize: 11, fontWeight: '700' },
});
