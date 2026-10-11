import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { isMuted, sfx, toggleMute } from '../audio';
import { TURN_SECONDS, useGameStore } from '../game/store';
import type { Phase } from '../game/types';
import { colors, ui } from '../theme';

function Crowns({ count, color }: { count: number; color: string }) {
  return (
    <View style={styles.crowns}>
      {[0, 1].map((i) => (
        <Text key={i} style={[styles.crown, { color: i < count ? color : 'rgba(122,130,142,0.4)' }]}>
          ♛
        </Text>
      ))}
    </View>
  );
}

const PHASE_STYLE: Record<Phase, { label: string; color: string; border: string }> = {
  'deck-builder': { label: 'Build your deck', color: colors.chrome, border: colors.chromeDark },
  'player-turn': { label: 'Your turn', color: colors.chromeBright, border: colors.chrome },
  'ai-turn': { label: 'Opponent’s turn…', color: colors.bloodNeon, border: colors.blood },
  'round-end': { label: 'Round over', color: '#c4b5fd', border: colors.violet },
  'game-end': { label: 'Game over', color: '#c4b5fd', border: colors.violet },
};

/** 30s turn clock — auto-passes to the opponent when it hits zero. */
function TurnClock() {
  const phase = useGameStore((s) => s.phase);
  const turnId = useGameStore((s) => s.turnId);
  const [left, setLeft] = useState(TURN_SECONDS);

  useEffect(() => {
    if (phase !== 'player-turn' && phase !== 'ai-turn') return;
    const tick = () => {
      const s = useGameStore.getState();
      const remain = Math.max(0, TURN_SECONDS - (Date.now() - s.turnStartedAt) / 1000);
      setLeft(Math.ceil(remain));
      if (remain > 0) return;
      if (s.phase === 'player-turn') {
        s.next();
      } else if (s.phase === 'ai-turn') {
        for (let i = 0; i < 24 && useGameStore.getState().phase === 'ai-turn'; i++) {
          s.aiStep();
        }
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [phase, turnId]);

  if (phase !== 'player-turn' && phase !== 'ai-turn') return null;
  const frac = Math.max(0, Math.min(1, left / TURN_SECONDS));
  const urgent = left <= 5;
  const c = urgent ? colors.bloodNeon : phase === 'ai-turn' ? colors.blood : colors.chrome;
  return (
    <View style={[styles.clock, { borderColor: c }]}>
      <View style={[styles.dot, { backgroundColor: c }]} />
      <Text style={[styles.clockText, { color: c }]}>{left}s</Text>
      <View style={styles.clockBar}>
        <View style={[styles.clockFill, { width: `${frac * 100}%`, backgroundColor: c }]} />
      </View>
    </View>
  );
}

/** Compact two-row header for portrait. */
export function StatusBar() {
  const round = useGameStore((s) => s.round);
  const crowns = useGameStore((s) => s.crowns);
  const phase = useGameStore((s) => s.phase);
  const cancelSelection = useGameStore((s) => s.cancelSelection);
  const next = useGameStore((s) => s.next);
  const pass = useGameStore((s) => s.pass);
  const restart = useGameStore((s) => s.restart);
  const playerPassed = useGameStore((s) => s.player.passed);
  const selectedHand = useGameStore((s) => s.selectedHand);
  const [muted, setMuted] = useState(isMuted());

  const p = PHASE_STYLE[phase];
  const inMatch = phase !== 'deck-builder';
  const press = (fn: () => void) => () => {
    sfx('ui-click');
    fn();
  };

  return (
    <View style={styles.bar}>
      {/* Row 1: title, crowns, phase, mute */}
      <View style={styles.row}>
        <Text style={styles.title}>Grails of War</Text>
        {inMatch && (
          <View style={styles.roundTag}>
            <Text style={styles.roundText}>R{round}/3</Text>
          </View>
        )}
        <View style={styles.spacer} />
        <View style={styles.crownGroup}>
          <Crowns count={crowns.player} color={colors.chromeBright} />
          <View style={[styles.phaseTag, { borderColor: p.border }]}>
            <Text style={[styles.phaseText, { color: p.color }]}>{p.label}</Text>
          </View>
          <Crowns count={crowns.ai} color={colors.bloodNeon} />
        </View>
        <TouchableOpacity onPress={() => setMuted(toggleMute())} style={ui.btnChrome}>
          <Text style={ui.btnText}>{muted ? 'Muted' : 'Snd'}</Text>
        </TouchableOpacity>
      </View>

      {/* Row 2 (match only): clock + actions */}
      {inMatch && (
        <View style={styles.row}>
          <TurnClock />
          <View style={styles.spacer} />
          {phase === 'player-turn' && selectedHand !== null && (
            <TouchableOpacity onPress={press(cancelSelection)} style={ui.btnChrome}>
              <Text style={ui.btnText}>Cancel</Text>
            </TouchableOpacity>
          )}
          {phase === 'player-turn' && !playerPassed && (
            <>
              <TouchableOpacity onPress={press(next)} style={ui.btnNeon}>
                <Text style={[ui.btnText, ui.btnTextNeon]}>Next ⏭</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={press(pass)} style={ui.btnBlood}>
                <Text style={[ui.btnText, { color: colors.bloodNeon }]}>Pass</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={press(restart)} style={ui.btnChrome}>
            <Text style={ui.btnText}>Deck</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    borderBottomWidth: 2,
    borderColor: colors.border,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  spacer: { flex: 1 },
  title: {
    color: colors.bloodNeon,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
    textShadowColor: 'rgba(255,42,60,0.5)',
    textShadowRadius: 8,
  },
  roundTag: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  roundText: {
    color: colors.chrome,
    fontSize: 9,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
  },
  crownGroup: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  crowns: { flexDirection: 'row', gap: 2 },
  crown: { fontSize: 12, lineHeight: 14 },
  phaseTag: {
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  phaseText: {
    fontSize: 9,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  clock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  clockText: { fontSize: 11, fontFamily: 'monospace', width: 26, textAlign: 'right' },
  clockBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    overflow: 'hidden',
  },
  clockFill: { height: '100%' },
});
