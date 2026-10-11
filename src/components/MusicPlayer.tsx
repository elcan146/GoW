import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  TRACKS,
  musicProgress,
  nextTrack,
  playTrack,
  prevTrack,
  seekMusic,
  setMusicVolume,
  togglePause,
  toggleShuffle,
  useMusicStore,
} from '../audio';

/** m:ss formatter for the seek bar readouts. */
function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Inline SVG icons — stroke inherits currentColor like a font glyph. */
const Svg = ({ size = 16, children }: { size?: number; children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

const Icon = {
  Shuffle: () => (
    <Svg>
      <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22" />
      <path d="m18 2 4 4-4 4" />
      <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
      <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
      <path d="m18 14 4 4-4 4" />
    </Svg>
  ),
  Prev: () => (
    <Svg>
      <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" stroke="none" />
      <line x1="5" y1="4" x2="5" y2="20" strokeWidth="2.5" />
    </Svg>
  ),
  Next: () => (
    <Svg>
      <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none" />
      <line x1="19" y1="4" x2="19" y2="20" strokeWidth="2.5" />
    </Svg>
  ),
  Play: () => (
    <Svg size={18}>
      <polygon points="7 4 20 12 7 20 7 4" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Pause: () => (
    <Svg size={18}>
      <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Vol: () => (
    <Svg size={15}>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </Svg>
  ),
  Mute: () => (
    <Svg size={15}>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" fill="currentColor" stroke="none" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </Svg>
  ),
};

/** Animated equalizer bars shown next to the audible track. */
function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="eq-bar w-[3px] rounded-sm bg-blood-neon"
          style={{
            height: '100%',
            animationDelay: `${i * 0.18}s`,
            animationPlayState: playing ? 'running' : 'paused',
            opacity: playing ? 1 : 0.4,
          }}
        />
      ))}
    </span>
  );
}

/** Fixed panel on the left edge — spinning album art, scrubber, transport, volume, track list. */
export function MusicPlayer() {
  const trackIdx = useMusicStore((s) => s.trackIdx);
  const started = useMusicStore((s) => s.started);
  const playing = useMusicStore((s) => s.playing);
  const volume = useMusicStore((s) => s.volume);
  const shuffle = useMusicStore((s) => s.shuffle);
  const [open, setOpen] = useState(true);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null); // held value while dragging
  const [prevVol, setPrevVol] = useState(0.32); // restore target for unmute

  const track = TRACKS[trackIdx];

  // Poll playback position for the seek bar (paused while scrubbing).
  useEffect(() => {
    if (!started) {
      setPos(0);
      setDur(0);
      return;
    }
    const t = setInterval(() => {
      const p = musicProgress();
      setDur(p.dur);
      if (scrub === null) setPos(p.pos);
    }, 250);
    return () => clearInterval(t);
  }, [started, scrub, trackIdx]);

  const onPick = (i: number) => {
    if (started && i === trackIdx) togglePause();
    else playTrack(i);
  };

  const commitScrub = (v: number) => {
    if (dur > 0) seekMusic(v / dur);
    setScrub(null);
  };

  const toggleVolMute = () => {
    if (volume > 0) {
      setPrevVol(volume);
      setMusicVolume(0);
    } else {
      setMusicVolume(prevVol > 0 ? prevVol : 0.32);
    }
  };

  const shownPos = scrub ?? pos;

  return (
    <aside className="zone-frame music-panel anim-player-in my-4 ml-4 flex w-64 shrink-0 flex-col overflow-hidden rounded-lg">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#2e2830] bg-black/60 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Equalizer playing={playing} />
          <span className="font-gothic metal-text truncate text-sm font-black tracking-wide">
            Soundtrack
          </span>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="util-btn shrink-0 font-mono text-xs"
          title={open ? 'Collapse' : 'Expand'}
        >
          {open ? '−' : '+'}
        </button>
      </div>

      {open && (
        <>
          {/* Album art — vinyl disc, one rotation per 10s, pauses with playback */}
          <div className="flex shrink-0 justify-center bg-black/60 px-4 pb-2 pt-4">
            <div className={`art-disc${playing ? '' : ' art-disc-paused'}`}>
              {started && track?.art ? (
                <img src={track.art} alt={track.name} className="art-disc-img" draggable={false} />
              ) : (
                <div className="art-disc-img art-disc-empty">♪</div>
              )}
              <div className="art-disc-hole" />
            </div>
          </div>

          {/* Current track title — wraps to 2 lines so long names show fully */}
          <div className="shrink-0 px-3 pb-1 text-center">
            <div className="font-gothic line-clamp-2 min-h-[2.5em] text-sm font-bold leading-tight text-chrome-bright">
              {started ? track?.name : '—'}
            </div>
          </div>

          {/* Seek bar */}
          <div className="shrink-0 px-3 pb-1">
            <input
              type="range"
              className="seek-bar"
              min={0}
              max={dur || 0}
              step={0.1}
              value={shownPos}
              disabled={!started || dur <= 0}
              onChange={(e) => setScrub(Number(e.target.value))}
              onPointerUp={(e) => commitScrub(Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => commitScrub(Number((e.target as HTMLInputElement).value))}
              aria-label="Seek"
            />
            <div className="flex justify-between font-mono text-[9px] text-chrome-dark">
              <span>{fmt(shownPos)}</span>
              <span>{fmt(dur)}</span>
            </div>
          </div>

          {/* Transport — prev / play-pause / next, centered */}
          <div className="flex shrink-0 items-center justify-center gap-3 px-3 py-1.5">
            <button onClick={prevTrack} className="tp-btn" title="Previous track">
              <Icon.Prev />
            </button>
            <button
              onClick={togglePause}
              disabled={!started}
              className="tp-btn tp-btn-main"
              title={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Icon.Pause /> : <Icon.Play />}
            </button>
            <button onClick={nextTrack} className="tp-btn" title="Next track">
              <Icon.Next />
            </button>
          </div>

          {/* Volume / mute + shuffle utility */}
          <div className="flex shrink-0 items-center gap-2 px-3 pb-2">
            <button
              onClick={toggleVolMute}
              className="util-btn"
              title={volume > 0 ? 'Mute music' : 'Unmute music'}
            >
              {volume > 0 ? <Icon.Vol /> : <Icon.Mute />}
            </button>
            <input
              type="range"
              className="seek-bar"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setMusicVolume(Number(e.target.value))}
              aria-label="Music volume"
            />
            <button
              onClick={toggleShuffle}
              className={`util-btn ml-auto${shuffle ? ' tp-btn-on' : ''}`}
              title={shuffle ? 'Shuffle: on' : 'Shuffle: off'}
            >
              <Icon.Shuffle />
            </button>
          </div>

          {/* Track list */}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto border-t border-[#2e2830] p-2">
            {TRACKS.map((t, i) => {
              const active = started && i === trackIdx;
              return (
                <button
                  key={t.name}
                  onClick={() => onPick(i)}
                  className={`track-row panel-inset flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors ${
                    active ? 'track-row-active' : ''
                  }`}
                >
                  <span
                    className={`font-mono text-[10px] ${
                      active ? 'text-blood-neon' : 'text-chrome-dark'
                    }`}
                  >
                    {active ? (playing ? '▮▮' : '▶') : String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={`line-clamp-2 min-w-0 flex-1 text-xs leading-tight ${
                      active ? 'text-chrome-bright' : 'text-chrome'
                    }`}
                  >
                    {t.name}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
