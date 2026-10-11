import { PhaserBoard } from './components/PhaserBoard';
import { CardInspector } from './components/CardInspector';
import { MusicPlayer } from './components/MusicPlayer';
import { DeckBuilder } from './components/DeckBuilder';
import { StatusBar } from './components/StatusBar';
import { Scanlines } from './components/Scanlines';
import { DitherOverlay } from './components/DitherOverlay';
import { GameStage } from './components/GameStage';
import { AiDriver, RoundEndOverlay } from './components/Overlays';
import { useGameStore } from './game/store';

/**
 * Layout mode switch for A/B testing:
 *   (default)      — Approach 2: fluid CSS grid, fills any window, no letterbox.
 *   ?layout=stage  — Approach 1: fixed-resolution stage, CSS-scaled (16:9 letterbox).
 */
const FLUID = new URLSearchParams(window.location.search).get('layout') !== 'stage';

export default function App() {
  const log = useGameStore((s) => s.log);
  const phase = useGameStore((s) => s.phase);

  const content = (
    <>
      <MusicPlayer />
      <div className="center-zone relative flex h-full min-w-0 flex-1 flex-col border-x-2 border-[#2e2830] bg-black/40">
        <StatusBar />
        {phase === 'deck-builder' ? <DeckBuilder /> : <PhaserBoard />}

        {/* Event ticker */}
        <div className="panel-inset flex h-6 shrink-0 items-center gap-4 overflow-hidden border-t border-[#2e2830] px-4 font-mono text-[10px] text-blood-neon/50">
          <span className="shrink-0 text-chrome-dark">▸▸</span>
          {log.slice(0, 2).map((entry, i) => (
            <span key={i} className="truncate">
              {entry}
            </span>
          ))}
        </div>

        <RoundEndOverlay />
        <AiDriver />
      </div>
      <CardInspector />
    </>
  );

  return FLUID ? (
    /* Approach 2 — fluid grid shell; rules live in index.css (.layout-fluid). */
    <div className="void-deck layout-fluid fixed inset-0 overflow-hidden">
      {content}
      <DitherOverlay />
      <Scanlines />
    </div>
  ) : (
    /* Approach 1 — fixed-proportion stage scaled to fit (see GameStage). */
    <>
      <GameStage>{content}</GameStage>
      <DitherOverlay />
      <Scanlines />
    </>
  );
}
