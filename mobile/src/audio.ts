import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer, AudioSource } from 'expo-audio';
import { create } from 'zustand';
import { MUSIC_FILES, SFX_FILES } from './assets';
import { kv } from './platform/storage';
import type { Phase } from './game/types';

/**
 * Central audio — expo-audio port of the web Howler layer.
 * Same API surface as src/audio.ts on web: sfx/sfxRate/sfxRandom, the tick
 * helpers, music transport, and the phase/game-end stingers.
 */

const SFX: Record<string, { file: string; volume: number; pool: number }> = {
  'slam-1': { file: 'card_slam_1.mp3', volume: 0.8, pool: 3 },
  'slam-2': { file: 'card_slam_2.mp3', volume: 0.8, pool: 3 },
  'slam-3': { file: 'card_slam_3.mp3', volume: 0.8, pool: 3 },
  'burn-1': { file: 'burn_1.mp3', volume: 0.75, pool: 2 },
  'burn-2': { file: 'burn_2.mp3', volume: 0.75, pool: 2 },
  'burn-3': { file: 'burn_3.mp3', volume: 0.75, pool: 2 },
  'hover-1': { file: 'cardhand_hovering_1.mp3', volume: 0.35, pool: 2 },
  'hover-2': { file: 'cardhand_hovering_2.mp3', volume: 0.35, pool: 2 },
  'hover-3': { file: 'cardhand_hovering_3.mp3', volume: 0.35, pool: 2 },
  'hover-4': { file: 'cardhand_hovering_4.mp3', volume: 0.35, pool: 2 },
  'ui-click': { file: 'ui_click.wav', volume: 0.3, pool: 2 },
  'round-start': { file: 'round_start.mp3', volume: 0.7, pool: 1 },
  'round-end': { file: 'round_end.mp3', volume: 0.7, pool: 1 },
  victory: { file: 'victory.mp3', volume: 0.8, pool: 1 },
  lose: { file: 'lose.mp3', volume: 0.8, pool: 1 },
};

const MUSIC = MUSIC_FILES;

const pools = new Map<string, AudioPlayer[]>();
let music: AudioPlayer | null = null;
let trackIdx = MUSIC.length ? Math.floor(Math.random() * MUSIC.length) : 0;
let musicVolume = 0.32;
let shuffle = true;
let lastHover = 0;
let muted = kv.getItem('gow-muted') === '1';
let audioReady = false;

/** Track display info for the player — filename minus extension, plus art. */
export const TRACKS = MUSIC.map((t) => ({ name: t.name, art: t.art }));

interface MusicState {
  trackIdx: number;
  started: boolean;
  playing: boolean;
  volume: number;
  shuffle: boolean;
}

/** Reactive mirror of the music player state — drives the OST panel UI. */
export const useMusicStore = create<MusicState>(() => ({
  trackIdx,
  started: false,
  playing: false,
  volume: musicVolume,
  shuffle,
}));

function ensureAudioMode(): void {
  if (audioReady) return;
  audioReady = true;
  // Play SFX even when the device is silenced (game-appropriate default).
  setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
}

/** Best-effort playback rate — property name differs across expo-audio versions. */
function setRate(p: AudioPlayer, rate: number): void {
  try {
    const anyP = p as unknown as {
      setPlaybackRate?: (r: number) => void;
      playbackRate?: number;
    };
    if (typeof anyP.setPlaybackRate === 'function') anyP.setPlaybackRate(rate);
    else anyP.playbackRate = rate;
  } catch {
    /* rate unsupported — play at normal speed */
  }
}

function getSfx(key: string): AudioPlayer | null {
  const def = SFX[key];
  const src = def ? SFX_FILES[def.file] : undefined;
  if (!def || src === undefined) return null;
  let pool = pools.get(key);
  if (!pool) {
    pool = [];
    pools.set(key, pool);
  }
  let p = pool.find((x) => !x.playing);
  if (!p && pool.length < def.pool) {
    p = createAudioPlayer(src as AudioSource);
    pool.push(p);
  }
  if (!p) p = pool[0]; // all busy — steal the oldest voice
  return p;
}

/** Play an SFX by key. */
export function sfx(key: string): void {
  sfxRate(key, 1);
}

/** Play an SFX with playback-rate (pitch) and optional volume override. */
export function sfxRate(key: string, rate: number, volume?: number): void {
  if (muted) return;
  ensureAudioMode();
  const def = SFX[key];
  const p = getSfx(key);
  if (!def || !p) return;
  try {
    p.volume = volume ?? def.volume;
    setRate(p, rate);
    if (p.playing) p.pause();
    p.seekTo(0);
    p.play();
  } catch {
    /* player released mid-call — ignore */
  }
}

export function sfxRandom(prefix: string, count: number, rate = 1): void {
  sfxRate(`${prefix}-${1 + Math.floor(Math.random() * count)}`, rate);
}

/** Soft card-draw tick — pitched-down hover. */
export function drawTick(): void {
  sfxRate(`hover-${1 + Math.floor(Math.random() * 4)}`, 0.75, 0.3);
}

/** Card flip/reveal — pitched-up hover. */
export function flipTick(): void {
  sfxRate(`hover-${1 + Math.floor(Math.random() * 4)}`, 1.35, 0.4);
}

/** Move whoosh — fast, quiet hover. */
export function whoosh(): void {
  sfxRate(`hover-${1 + Math.floor(Math.random() * 4)}`, 1.7, 0.22);
}

/** Global mute — persisted across sessions. */
export function toggleMute(): boolean {
  muted = !muted;
  kv.setItem('gow-muted', muted ? '1' : '0');
  if (muted && music) {
    try {
      music.pause();
    } catch { /* noop */ }
    useMusicStore.setState({ playing: false });
  } else if (!muted && music && useMusicStore.getState().started) {
    try {
      music.play();
    } catch { /* noop */ }
    useMusicStore.setState({ playing: true });
  }
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

/** Card touch tick — rate-limited so fast taps don't machine-gun. */
export function hoverTick(): void {
  const now = Date.now();
  if (now - lastHover < 90) return;
  lastHover = now;
  sfxRandom('hover', 4);
}

/** expo-audio has no built-in fade — step the volume on a timer. */
function fadeTo(p: AudioPlayer, from: number, to: number, ms: number, done?: () => void): void {
  const steps = 12;
  const dt = ms / steps;
  let i = 0;
  const t = setInterval(() => {
    i += 1;
    try {
      p.volume = from + (to - from) * Math.min(1, i / steps);
    } catch {
      clearInterval(t);
      return;
    }
    if (i >= steps) {
      clearInterval(t);
      done?.();
    }
  }, dt);
}

function release(p: AudioPlayer | null): void {
  if (!p) return;
  try {
    p.pause();
    p.remove();
  } catch {
    /* already released */
  }
}

/** Start a random ambient track, looping. Idempotent. */
export function startMusic(): void {
  if (music || !MUSIC.length || muted) return;
  ensureAudioMode();
  music = createAudioPlayer(MUSIC[trackIdx].src);
  music.loop = true;
  music.volume = musicVolume;
  music.play();
  useMusicStore.setState({ trackIdx, started: true, playing: true });
}

/** Crossfade to the next OST track — called on each new round. */
export function nextTrack(): void {
  if (!MUSIC.length) return;
  if (!music) {
    startMusic();
    return;
  }
  const old = music;
  trackIdx = shuffle
    ? (trackIdx + 1 + Math.floor(Math.random() * (MUSIC.length - 1))) % MUSIC.length
    : (trackIdx + 1) % MUSIC.length;
  fadeTo(old, musicVolume, 0, 1200, () => release(old));
  music = createAudioPlayer(MUSIC[trackIdx].src);
  music.loop = true;
  music.volume = 0;
  if (!muted) music.play();
  fadeTo(music, 0, musicVolume, 1200);
  useMusicStore.setState({ trackIdx, started: true, playing: !muted });
}

/** Jump to a specific OST track — used by the music player panel. */
export function playTrack(i: number): void {
  if (!MUSIC.length) return;
  trackIdx = ((i % MUSIC.length) + MUSIC.length) % MUSIC.length;
  const old = music;
  if (old) fadeTo(old, musicVolume, 0, 600, () => release(old));
  music = createAudioPlayer(MUSIC[trackIdx].src);
  music.loop = true;
  music.volume = musicVolume;
  if (!muted) music.play();
  useMusicStore.setState({ trackIdx, started: true, playing: !muted });
}

/** Previous OST track — wraps around (random when shuffle is on). */
export function prevTrack(): void {
  playTrack(
    shuffle ? trackIdx + 1 + Math.floor(Math.random() * (MUSIC.length - 1)) : trackIdx - 1,
  );
}

/** Toggle shuffle mode — affects next/prev and round-change rotation. */
export function toggleShuffle(): void {
  shuffle = !shuffle;
  useMusicStore.setState({ shuffle });
}

/** Seek to a fraction (0..1) of the current track. */
export function seekMusic(frac: number): void {
  if (!music) return;
  const dur = music.duration;
  if (dur > 0) {
    try {
      music.seekTo(Math.min(1, Math.max(0, frac)) * dur);
    } catch { /* noop */ }
  }
}

/** Current playback position + duration in seconds (0/0 when idle). */
export function musicProgress(): { pos: number; dur: number } {
  if (!music) return { pos: 0, dur: 0 };
  try {
    return { pos: music.currentTime || 0, dur: music.duration || 0 };
  } catch {
    return { pos: 0, dur: 0 };
  }
}

/** Music-only volume (0..1) — independent of the global SFX mute. */
export function setMusicVolume(v: number): void {
  musicVolume = Math.min(1, Math.max(0, v));
  if (music) {
    try {
      music.volume = musicVolume;
    } catch { /* noop */ }
  }
  useMusicStore.setState({ volume: musicVolume });
}

/** Pause/resume the current track. */
export function togglePause(): void {
  if (!music) return;
  try {
    if (music.playing) {
      music.pause();
      useMusicStore.setState({ playing: false });
    } else {
      music.play();
      useMusicStore.setState({ playing: true });
    }
  } catch { /* noop */ }
}

export function stopMusic(): void {
  release(music);
  music = null;
  useMusicStore.setState({ started: false, playing: false });
}

/** Phase-transition stingers. Call with the new phase on each commit. */
export function onPhase(phase: Phase, prev: Phase | null): void {
  if (phase === prev) return;
  if (phase === 'player-turn' && (prev === 'deck-builder' || prev === 'round-end')) {
    if (prev === 'deck-builder') startMusic();
    else nextTrack(); // new round → rotate the OST
    sfx('round-start');
  } else if (phase === 'round-end' || phase === 'game-end') {
    sfx('round-end');
  }
}

export function onGameEnd(winner: 'player' | 'ai' | 'tie' | null): void {
  if (winner === 'player') sfx('victory');
  else if (winner === 'ai') sfx('lose');
}

/** One-time audio setup — call at app start. */
export function initAudio(): void {
  ensureAudioMode();
}
