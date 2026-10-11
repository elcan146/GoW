import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  musicProgress,
  nextTrack,
  playTrack,
  prevTrack,
  seekMusic,
  setMusicVolume,
  sfx,
  startMusic,
  togglePause,
  toggleShuffle,
  TRACKS,
  useMusicStore,
} from '../audio';
import { colors, ui } from '../theme';

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Horizontal bar — tap to set a 0..1 fraction (seek / volume). */
function Bar({
  frac,
  onSet,
  color,
}: {
  frac: number;
  onSet: (f: number) => void;
  color?: string;
}) {
  const [w, setW] = useState(1);
  return (
    <Pressable
      style={styles.bar}
      onLayout={(e) => setW(Math.max(1, e.nativeEvent.layout.width))}
      onPress={(e) => onSet(Math.min(1, Math.max(0, e.nativeEvent.locationX / w)))}
    >
      <View
        style={[
          styles.barFill,
          {
            width: `${Math.min(100, Math.max(0, frac * 100))}%`,
            backgroundColor: color ?? colors.bloodNeon,
          },
        ]}
      />
    </Pressable>
  );
}

/** OST player page — leftmost page of both the deck builder and the match. */
export function MusicPlayer() {
  const trackIdx = useMusicStore((s) => s.trackIdx);
  const started = useMusicStore((s) => s.started);
  const playing = useMusicStore((s) => s.playing);
  const volume = useMusicStore((s) => s.volume);
  const shuffle = useMusicStore((s) => s.shuffle);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  // Vinyl spin — rotates the album art while a track is playing.
  const spin = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (playing) {
      spinLoop.current = Animated.loop(
        Animated.timing(spin, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }),
      );
      spinLoop.current.start();
    } else {
      spinLoop.current?.stop();
    }
    return () => spinLoop.current?.stop();
  }, [playing, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  useEffect(() => {
    const t = setInterval(() => {
      const p = musicProgress();
      setPos(p.pos);
      setDur(p.dur);
    }, 500);
    return () => clearInterval(t);
  }, []);

  const track = TRACKS[trackIdx];

  return (
    <View style={styles.root}>
      <Text style={styles.header}>OST Player</Text>

      <View style={styles.artWrap}>
        <Animated.View style={[styles.artDisc, { transform: [{ rotate }] }]}>
          {track?.art ? (
            <Image source={track.art} style={styles.art} resizeMode="cover" />
          ) : (
            <View style={[styles.art, styles.artEmpty]} />
          )}
          <View style={styles.discHole} pointerEvents="none" />
        </Animated.View>
      </View>

      <Text numberOfLines={1} style={styles.trackName}>
        {track?.name ?? '—'}
      </Text>

      <View style={styles.seekRow}>
        <Text style={styles.time}>{fmt(pos)}</Text>
        <View style={styles.seekWrap}>
          <Bar frac={dur > 0 ? pos / dur : 0} onSet={seekMusic} />
        </View>
        <Text style={styles.time}>{fmt(dur)}</Text>
      </View>

      <View style={styles.transport}>
        <TouchableOpacity
          onPress={() => {
            sfx('ui-click');
            prevTrack();
          }}
          style={ui.btnChrome}
        >
          <Text style={ui.btnText}>◂◂</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            sfx('ui-click');
            if (!started) startMusic();
            else togglePause();
          }}
          style={[ui.btnNeon, styles.playBtn]}
        >
          <Text style={[ui.btnText, ui.btnTextNeon, { fontSize: 16 }]}>
            {playing ? '❙❙' : '▶'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            sfx('ui-click');
            nextTrack();
          }}
          style={ui.btnChrome}
        >
          <Text style={ui.btnText}>▸▸</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            sfx('ui-click');
            toggleShuffle();
          }}
          style={[ui.btnChrome, shuffle && styles.shuffleOn]}
        >
          <Text style={[ui.btnText, shuffle && { color: colors.bloodNeon }]}>Shuf</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.volRow}>
        <Text style={styles.volLabel}>Vol</Text>
        <View style={styles.seekWrap}>
          <Bar frac={volume} onSet={setMusicVolume} color={colors.chrome} />
        </View>
      </View>

      <ScrollView style={styles.trackList} contentContainerStyle={styles.trackListContent}>
        {TRACKS.map((t, i) => (
          <TouchableOpacity
            key={t.name}
            onPress={() => {
              sfx('ui-click');
              playTrack(i);
            }}
            style={[styles.trackRow, i === trackIdx && styles.trackRowActive]}
          >
            <Text
              numberOfLines={1}
              style={[styles.trackRowText, i === trackIdx && { color: colors.bloodNeon }]}
            >
              {i === trackIdx ? '▸ ' : ''}
              {t.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: 'rgba(5,5,7,0.6)',
  },
  header: {
    color: colors.bloodNeon,
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
  artDisc: { width: '100%', height: '100%' },
  discHole: {
    position: 'absolute',
    alignSelf: 'center',
    top: '47%',
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#0b0a0e',
    borderWidth: 2,
    borderColor: 'rgba(200,205,212,0.4)',
  },
  artWrap: {
    marginTop: 12,
    width: 190,
    height: 190,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  art: { width: '100%', height: '100%' },
  artEmpty: { backgroundColor: '#14101a' },
  trackName: {
    marginTop: 10,
    color: colors.chromeBright,
    fontSize: 14,
    fontWeight: '700',
    maxWidth: '90%',
  },
  seekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    alignSelf: 'stretch',
  },
  seekWrap: { flex: 1 },
  time: { color: colors.chromeDark, fontSize: 10, fontFamily: 'monospace', width: 34 },
  bar: {
    height: 16,
    justifyContent: 'center',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  playBtn: { paddingHorizontal: 20, paddingVertical: 8 },
  shuffleOn: { borderColor: colors.bloodNeon, backgroundColor: 'rgba(42,6,11,0.6)' },
  volRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    alignSelf: 'stretch',
  },
  volLabel: {
    color: colors.chromeDark,
    fontSize: 10,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    width: 34,
  },
  trackList: { marginTop: 12, alignSelf: 'stretch', flex: 1, minHeight: 0 },
  trackListContent: { paddingBottom: 12 },
  trackRow: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
  },
  trackRowActive: { borderColor: colors.bloodDim, backgroundColor: 'rgba(42,6,11,0.5)' },
  trackRowText: { color: colors.chrome, fontSize: 11, fontFamily: 'monospace' },
});
