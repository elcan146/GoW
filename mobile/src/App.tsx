import React, { useEffect, useRef } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native';
import { initAudio, onGameEnd, onPhase, sfx, sfxRandom } from './audio';
import { Board } from './components/Board';
import { CardInspector } from './components/CardInspector';
import { DeckBuilder } from './components/DeckBuilder';
import { LogTicker } from './components/LogTicker';
import { AiDriver, DitherOverlay, RoundEndOverlay, TurnBanner, Vignette } from './components/Overlays';
import { StatusBar } from './components/StatusBar';
import { useGameStore } from './game/store';
import type { Phase } from './game/types';
import { colors } from './theme';

export default function App() {
  const phase = useGameStore((s) => s.phase);
  const seenFx = useRef(new Set<number>());
  const prevPhase = useRef<Phase | null>(null);
  const prevWinner = useRef<string | null>(null);

  // Hide the Android system nav bar (||| O <) — true game immersive. Android
  // re-shows the bar on touches/backgrounding, so we force-hide it again on
  // every visibility change and on foreground, not just once at mount.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const hide = () => {
      NavigationBar.setPositionAsync('absolute').catch(() => {});
      NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => {});
      NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    };
    hide();
    const visSub = NavigationBar.addVisibilityListener(({ visibility }) => {
      if (visibility === 'visible') hide();
    });
    const appSub = AppState.addEventListener('change', (s) => s === 'active' && hide());
    return () => {
      visSub.remove();
      appSub.remove();
    };
  }, []);

  // Audio bridge — mirrors the web phaser/bridge.ts subscriber: phase
  // stingers, game-end sting, and per-fx sounds driven by the fx queue.
  useEffect(() => {
    initAudio();
    const unsub = useGameStore.subscribe((s) => {
      onPhase(s.phase, prevPhase.current);
      if (s.phase === 'game-end' && s.gameWinner !== prevWinner.current) {
        onGameEnd(s.gameWinner);
      }
      prevPhase.current = s.phase;
      prevWinner.current = s.gameWinner;

      for (const fx of s.fx) {
        if (seenFx.current.has(fx.id)) continue;
        seenFx.current.add(fx.id);
        if (fx.kind === 'slam') sfxRandom('slam', 3);
        else if (fx.kind === 'burn' || fx.kind === 'destroy') sfxRandom('burn', 3);
        else if (fx.kind === 'spy' || fx.kind === 'move') sfx('ui-click');
      }
      // Bound the seen-set so it can't grow forever across a long session.
      if (seenFx.current.size > 500) seenFx.current.clear();
    });
    return unsub;
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <ExpoStatusBar hidden />
      <View style={styles.center}>
        <StatusBar />
        {phase === 'deck-builder' ? <DeckBuilder /> : <Board />}
        <LogTicker />
        <TurnBanner />
        <RoundEndOverlay />
        <AiDriver />
        {/* CRT overlays — vignette + ordered-dither grain (web parity) */}
        <Vignette />
        {/* Card detail window — long-press any card (deck builder + board) */}
        <CardInspector />
        <DitherOverlay />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.void,
  },
  center: {
    flex: 1,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.border,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
});
