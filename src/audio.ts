import { Howl, Howler } from 'howler';
import { create } from 'zustand';
import type { Phase } from './game/types';

/**
 * Central audio — Howler drives both DOM UI sounds and Phaser board SFX.
 * SFX use WebAudio (low latency); music streams via html5 so the ~33MB
 * WAVs don't decode fully into memory.
 */

const SFX: Record<string, { src: string; volume: number; pool: number }> = {
  'slam-1': { src: '/sfx/card_slam_1.mp3', volume: 0.8, pool: 3 },
  'slam-2': { src: '/sfx/card_slam_2.mp3', volume: 0.8, pool: 3 },
  'slam-3': { src: '/sfx/card_slam_3.mp3', volume: 0.8, pool: 3 },
  'burn-1': { src: '/sfx/burn_1.mp3', volume: 0.75, pool: 2 },
  'burn-2': { src: '/sfx/burn_2.mp3', volume: 0.75, pool: 2 },
  'burn-3': { src: '/sfx/burn_3.mp3', volume: 0.75, pool: 2 },
  'hover-1': { src: '/sfx/cardhand_hovering_1.mp3', volume: 0.35, pool: 2 },
  'hover-2': { src: '/sfx/cardhand_hovering_2.mp3', volume: 0.35, pool: 2 },
  'hover-3': { src: '/sfx/cardhand_hovering_3.mp3', volume: 0.35, pool: 2 },
  'hover-4': { src: '/sfx/cardhand_hovering_4.mp3', volume: 0.35, pool: 2 },
  'ui-click': { src: '/sfx/ui_click.wav', volume: 0.3, pool: 2 },
  'round-start': { src: '/sfx/round_start.mp3', volume: 0.7, pool: 1 },
  'round-end': { src: '/sfx/round_end.mp3', volume: 0.7, pool: 1 },
  victory: { src: '/sfx/victory.mp3', volume: 0.8, pool: 1 },
  lose: { src: '/sfx/lose.mp3', volume: 0.8, pool: 1 },
};

const MUSIC: { src: string; art: string | null }[] = [
  { src: '/ost/Armorhead - OK logicex.wav', art: '/ost/albumarts/Armorhead - OK logicex.png' },
  { src: '/ost/Arrow For My Conjurer - Brosolliosis.wav', art: '/ost/albumarts/Arrow For My Conjurer - Brosolliosis.png' },
  { src: '/ost/Brass Armor - The Way.wav', art: '/ost/albumarts/Brass Armor - The Way.png' },
  { src: '/ost/Despair of Love - Ocean.wav', art: '/ost/albumarts/Despair of Love - Ocean.png' },
  { src: '/ost/High Altar - Descent.wav', art: '/ost/albumarts/High Altar - Descent.png' },
  { src: '/ost/Nuclear Demons - Catacombs.wav', art: '/ost/albumarts/Nuclear Demons - Catacombs.png' },
  { src: '/ost/Polycastle - Ruins.wav', art: '/ost/albumarts/Polycastle - Ruins.png' },
  { src: '/ost/queenlover - still mine.wav', art: '/ost/albumarts/queenlover - still mine.png' },
  { src: '/ost/Rose of Requiem - Dread.wav', art: '/ost/albumarts/Rose of Requiem - Dread.png' },
  { src: '/ost/SuccyGirls - Rave.wav', art: '/ost/albumarts/SuccyGirls - Rave.png' },
  { src: '/ost/The Marching Iron - Pavement.wav', art: '/ost/albumarts/The Marching Iron - Pavement.png' },
  { src: '/ost/Verti Skull - Dither.wav', art: '/ost/albumarts/Verti Skull - Dither.png' },
  { src: '/ost/Wolfanic - Feral.wav', art: '/ost/albumarts/Wolfanic - Feral.png' },
];

const howls = new Map<string, Howl>();
let music: Howl | null = null;
let trackIdx = Math.floor(Math.random() * MUSIC.length);
let musicVolume = 0.32;
let shuffle = true;
let lastHover = 0;
let muted = localStorage.getItem('gow-muted') === '1';

/** Track display info for the player — filename minus dir + extension, plus art. */
export const TRACKS = MUSIC.map((t) => ({
  name: t.src.replace(/^.*\//, '').replace(/\.[^.]+$/, ''),
  art: t.art,
}));

interface MusicState {
  trackIdx: number;
  started: boolean; // a track is loaded (may be paused)
  playing: boolean; // actually audible right now
  volume: number; // music-only volume, 0..1
  shuffle: boolean; // next/prev pick randomly instead of sequentially
}

/** Reactive mirror of the music player state — drives the OST panel UI. */
export const useMusicStore = create<MusicState>(() => ({
  trackIdx,
  started: false,
  playing: false,
  volume: musicVolume,
  shuffle,
}));

function get(key: string): Howl | null {
  const def = SFX[key];
  if (!def) return null;
  let h = howls.get(key);
  if (!h) {
    h = new Howl({ src: [def.src], volume: def.volume, pool: def.pool, preload: true });
    howls.set(key, h);
  }
  return h;
}

/** Play an SFX by key. Safe to call before unlock — Howler queues it. */
export function sfx(key: string): void {
  get(key)?.play();
}

/** Play an SFX with playback-rate (pitch) and optional volume override. */
export function sfxRate(key: string, rate: number, volume?: number): void {
  const h = get(key);
  if (!h) return;
  const id = h.play();
  if (rate !== 1) h.rate(rate, id);
  if (volume !== undefined) h.volume(volume, id);
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
  Howler.mute(muted);
  localStorage.setItem('gow-muted', muted ? '1' : '0');
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

/** Card hover tick — rate-limited so fast sweeps don't machine-gun. */
export function hoverTick(): void {
  const now = performance.now();
  if (now - lastHover < 90) return;
  lastHover = now;
  sfxRandom('hover', 4);
}

/** Start a random ambient track, looping. Idempotent. */
export function startMusic(): void {
  if (music) return;
  music = new Howl({ src: [MUSIC[trackIdx].src], html5: true, loop: true, volume: musicVolume });
  music.play();
  useMusicStore.setState({ trackIdx, started: true, playing: true });
}

/** Crossfade to the next OST track — called on each new round. */
export function nextTrack(): void {
  if (!music) {
    startMusic();
    return;
  }
  const old = music;
  // Shuffle: random offset in [1, len-1] so the same track never repeats.
  trackIdx = shuffle
    ? (trackIdx + 1 + Math.floor(Math.random() * (MUSIC.length - 1))) % MUSIC.length
    : (trackIdx + 1) % MUSIC.length;
  old.fade(musicVolume, 0, 1200);
  // unload (not stop) — aborts the stream and releases the html5 node back to
  // the pool. stop() leaves the request pending; ~6 dead tracks would exhaust
  // the browser's per-origin connection limit and stall every new track.
  setTimeout(() => old.unload(), 1300);
  music = new Howl({ src: [MUSIC[trackIdx].src], html5: true, loop: true, volume: 0 });
  music.play();
  music.fade(0, musicVolume, 1200);
  useMusicStore.setState({ trackIdx, started: true, playing: true });
}

/** Jump to a specific OST track — used by the music player panel. */
export function playTrack(i: number): void {
  trackIdx = ((i % MUSIC.length) + MUSIC.length) % MUSIC.length;
  const old = music;
  if (old) {
    old.fade(musicVolume, 0, 600);
    setTimeout(() => old.unload(), 650);
  }
  music = new Howl({ src: [MUSIC[trackIdx].src], html5: true, loop: true, volume: musicVolume });
  music.play();
  useMusicStore.setState({ trackIdx, started: true, playing: true });
}

/** Previous OST track — wraps around (random when shuffle is on). */
export function prevTrack(): void {
  playTrack(
    shuffle
      ? trackIdx + 1 + Math.floor(Math.random() * (MUSIC.length - 1))
      : trackIdx - 1,
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
  const dur = music.duration();
  if (dur > 0) music.seek(Math.min(1, Math.max(0, frac)) * dur);
}

/** Current playback position + duration in seconds (0/0 when idle). */
export function musicProgress(): { pos: number; dur: number } {
  if (!music) return { pos: 0, dur: 0 };
  const dur = music.duration() || 0;
  const pos = typeof music.seek() === 'number' ? (music.seek() as number) : 0;
  return { pos, dur };
}

/** Music-only volume (0..1) — independent of the global SFX mute. */
export function setMusicVolume(v: number): void {
  musicVolume = Math.min(1, Math.max(0, v));
  music?.volume(musicVolume);
  useMusicStore.setState({ volume: musicVolume });
}

/** Pause/resume the current track. */
export function togglePause(): void {
  if (!music) return;
  if (music.playing()) {
    music.pause();
    useMusicStore.setState({ playing: false });
  } else {
    music.play();
    useMusicStore.setState({ playing: true });
  }
}

export function stopMusic(): void {
  music?.unload();
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

/**
 * Global listeners — call once at app start.
 * Delegated click sound on any <button>, plus the first-gesture audio unlock.
 */
export function initAudio(): void {
  if (muted) Howler.mute(true);
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('button:not(:disabled)')) sfx('ui-click');
    },
    { capture: true },
  );
}
