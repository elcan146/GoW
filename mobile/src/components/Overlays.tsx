import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { DITHER_IMG, VIGNETTE_IMG } from '../fxAssets';
import { useGameStore } from '../game/store';
import { colors, ui } from '../theme';

/** CRT vignette — mirrors the web .scanlines radial-gradient overlay. */
export function Vignette() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={VIGNETTE_IMG} style={styles.fillImg} resizeMode="stretch" />
    </View>
  );
}

const DITHER_MODES = [0, 2, 4, 8] as const;
const DITHER_OPACITY: Record<number, number> = { 0: 0, 2: 0.55, 4: 0.4, 8: 0.28 };

/** Ordered-dither grain over the whole screen + mode toggle (off / 2 / 4 / 8).
 *  Uses the tiled Bayer PNG on every platform. The desktop build applies a real
 *  SVG Bayer filter to its Phaser canvas, but on RNW that same filter flattens
 *  the DOM and turns every translucent layer (zone shade, vignette, glows,
 *  banners) opaque — so we use the grain overlay, which is safe everywhere. */
export function DitherOverlay() {
  const [mode, setMode] = useState<number>(4);

  return (
    <>
      {mode > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Image
            source={DITHER_IMG}
            style={[styles.fillImg, { opacity: DITHER_OPACITY[mode] }]}
            resizeMode="cover"
          />
        </View>
      )}
      <TouchableOpacity
        style={styles.ditherToggle}
        onPress={() => setMode(DITHER_MODES[(DITHER_MODES.indexOf(mode as 0) + 1) % 4])}
      >
        <Text style={styles.ditherToggleText}>dither: {mode === 0 ? 'off' : mode}</Text>
      </TouchableOpacity>
    </>
  );
}

/** 'YOUR TURN' / 'ENEMY TURN' sweep on phase transitions — web parity. */
export function TurnBanner() {
  const phase = useGameStore((s) => s.phase);
  const { width } = useWindowDimensions();
  const [banner, setBanner] = useState<{ text: string; color: string; key: number } | null>(null);
  const prev = useRef(phase);
  useEffect(() => {
    if (phase === 'player-turn' && prev.current === 'ai-turn') {
      setBanner({ text: 'YOUR TURN', color: colors.chromeBright, key: Date.now() });
    } else if (phase === 'ai-turn' && prev.current === 'player-turn') {
      setBanner({ text: 'ENEMY TURN', color: colors.bloodNeon, key: Date.now() });
    }
    prev.current = phase;
  }, [phase]);
  if (!banner) return null;
  return <Sweep key={banner.key} text={banner.text} color={banner.color} width={width} onDone={() => setBanner(null)} />;
}

function Sweep({ text, color, width, onDone }: { text: string; color: string; width: number; onDone: () => void }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(550),
      Animated.timing(t, { toValue: 2, duration: 350, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(({ finished }) => finished && onDone());
  }, [t, onDone]);
  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.bannerText,
        {
          color,
          opacity: t.interpolate({ inputRange: [0, 0.15, 1.85, 2], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1, 2], outputRange: [-width, 0, width] }) },
          ],
        },
      ]}
    >
      {text}
    </Animated.Text>
  );
}

/** Drives the AI's turn: steps the AI on a timer while phase === 'ai-turn'. */
export function AiDriver() {
  const phase = useGameStore((s) => s.phase);
  const aiStep = useGameStore((s) => s.aiStep);
  const locations = useGameStore((s) => s.locations);

  useEffect(() => {
    if (phase !== 'ai-turn') return;
    const t = setTimeout(aiStep, 700);
    return () => clearTimeout(t);
  }, [phase, aiStep, locations]);

  return null;
}

export function RoundEndOverlay() {
  const phase = useGameStore((s) => s.phase);
  const roundResults = useGameStore((s) => s.roundResults);
  const nextRound = useGameStore((s) => s.nextRound);
  const restart = useGameStore((s) => s.restart);
  const gameWinner = useGameStore((s) => s.gameWinner);
  const crowns = useGameStore((s) => s.crowns);

  if (phase !== 'round-end' && phase !== 'game-end') return null;
  const last = roundResults[roundResults.length - 1];
  if (!last) return null;

  const isGameEnd = phase === 'game-end';
  const title = isGameEnd
    ? gameWinner === 'player'
      ? 'VICTORY'
      : gameWinner === 'ai'
        ? 'DEFEAT'
        : 'DRAW'
    : last.winner === 'player'
      ? `Round ${last.round} — You win`
      : last.winner === 'ai'
        ? `Round ${last.round} — AI wins`
        : `Round ${last.round} — Draw`;

  return (
    <View style={styles.overlay}>
      <PanelPop key={phase + title}>
      <View style={styles.panel}>
        <Text
          style={[
            styles.title,
            isGameEnd && gameWinner === 'ai' && { color: colors.bloodNeon },
          ]}
        >
          {title}
        </Text>

        <View style={styles.rows}>
          {last.locationWinners.map((w, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.rowLabel}>Location {i + 1}</Text>
              <Text style={styles.rowScore}>
                <Text style={{ color: colors.chromeBright }}>{last.playerTotals[i]}</Text>
                <Text style={{ color: colors.chromeDark }}> – </Text>
                <Text style={{ color: colors.bloodNeon }}>{last.aiTotals[i]}</Text>
              </Text>
              <Text
                style={[
                  styles.rowWinner,
                  w === 'player' && { color: colors.chromeBright },
                  w === 'ai' && { color: colors.bloodNeon },
                ]}
              >
                {w === 'tie' ? 'Draw' : w === 'player' ? 'You' : 'AI'}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.crowns}>
          Crowns — <Text style={{ color: colors.chromeBright, fontWeight: '700' }}>{crowns.player}</Text>
          {' : '}
          <Text style={{ color: colors.bloodNeon, fontWeight: '700' }}>{crowns.ai}</Text>
        </Text>

        <TouchableOpacity onPress={isGameEnd ? restart : nextRound} style={[ui.btnNeon, styles.cta]}>
          <Text style={[ui.btnText, ui.btnTextNeon, { fontSize: 13 }]}>
            {isGameEnd ? 'Play again' : 'Next round'}
          </Text>
        </TouchableOpacity>
      </View>
      </PanelPop>
    </View>
  );
}

/** Round/game-end panel entrance — scale-in like the web overlay. */
function PanelPop({ children }: { children: React.ReactNode }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }, [t]);
  return (
    <Animated.View
      style={{
        opacity: t,
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fillImg: { width: '100%', height: '100%' },
  ditherToggle: {
    position: 'absolute',
    right: 6,
    bottom: 4,
    zIndex: 60,
    backgroundColor: 'rgba(11,10,14,0.8)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ditherToggleText: {
    color: colors.chromeDark,
    fontSize: 9,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bannerText: {
    position: 'absolute',
    alignSelf: 'center',
    top: '38%',
    zIndex: 40,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 6,
    fontFamily: 'monospace',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  panel: {
    width: 340,
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderColor: colors.bloodDim,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    color: colors.chromeBright,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 4,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  rows: { marginTop: 14, alignSelf: 'stretch', gap: 5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rowLabel: {
    color: colors.chromeDark,
    fontSize: 10,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rowScore: { fontFamily: 'monospace', fontSize: 12, fontWeight: '700' },
  rowWinner: {
    width: 40,
    textAlign: 'right',
    color: colors.chromeDark,
    fontSize: 10,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
  },
  crowns: { marginTop: 12, color: colors.chrome, fontSize: 12, fontFamily: 'monospace' },
  cta: { marginTop: 16, alignSelf: 'stretch', paddingVertical: 10 },
});
