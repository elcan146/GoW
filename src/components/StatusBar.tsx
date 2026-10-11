import { useEffect, useState } from 'react';
import { isMuted, toggleMute } from '../audio';
import { TURN_SECONDS, useGameStore } from '../game/store';
import type { Phase } from '../game/types';

function Crowns({ count, color }: { count: number; color: string }) {
  return (
    <span className="flex gap-1.5">
      {[0, 1].map((i) => (
        <span
          key={i}
          className={`text-base leading-none ${i < count ? color : 'text-chrome-dark/50'}`}
        >
          ♛
        </span>
      ))}
    </span>
  );
}

const PHASE_STYLE: Record<Phase, { label: string; cls: string }> = {
  'deck-builder': {
    label: 'Build your deck',
    cls: 'border-chrome-dark/60 text-chrome',
  },
  'player-turn': {
    label: 'Your turn',
    cls: 'border-chrome/60 text-chrome-bright shadow-[0_0_10px_rgba(154,163,173,0.25)]',
  },
  'ai-turn': {
    label: 'Opponent’s turn…',
    cls: 'border-blood/70 text-blood-neon shadow-[0_0_10px_rgba(255,42,60,0.3)]',
  },
  'round-end': {
    label: 'Round over',
    cls: 'border-violet-700/60 text-violet-300',
  },
  'game-end': {
    label: 'Game over',
    cls: 'border-violet-700/60 text-violet-300',
  },
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
      const remain = Math.max(
        0,
        TURN_SECONDS - (Date.now() - s.turnStartedAt) / 1000,
      );
      setLeft(Math.ceil(remain));
      if (remain > 0) return;
      // Time expired — pass the turn to the opponent.
      if (s.phase === 'player-turn') {
        s.next();
      } else if (s.phase === 'ai-turn') {
        // Force the AI to finish its turn.
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
  return (
    <div
      className={`panel-inset flex items-center gap-2 border px-3 py-1 font-mono text-sm ${
        urgent
          ? 'border-blood-neon/80 text-blood-neon shadow-[0_0_10px_rgba(255,42,60,0.4)]'
          : phase === 'ai-turn'
            ? 'border-blood/60 text-blood-neon'
            : 'border-chrome-dark/60 text-chrome'
      }`}
      title="Turn timer"
    >
      <span className={`inline-block h-2 w-2 rounded-full ${urgent ? 'animate-pulse bg-blood-neon' : phase === 'ai-turn' ? 'bg-blood' : 'bg-chrome'}`} />
      <span className="w-8 text-right tabular-nums">{left}s</span>
      <span className="h-1 w-16 overflow-hidden rounded bg-black/60">
        <span
          className={`block h-full transition-[width] duration-200 ${urgent ? 'bg-blood-neon' : phase === 'ai-turn' ? 'bg-blood' : 'bg-chrome'}`}
          style={{ width: `${frac * 100}%` }}
        />
      </span>
    </div>
  );
}

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

  return (
    <header className="panel-inset flex h-14 shrink-0 items-center justify-between gap-4 border-b-2 border-[#2e2830] px-6">
      <div className="flex items-center gap-3">
        <h1 className="neon-text font-display text-3xl leading-none tracking-[0.08em]">
          Grails of War
        </h1>
        {inMatch && (
          <span className="panel-inset px-3 py-1 font-mono text-xs uppercase tracking-wider text-chrome">
            Round {round}/3
          </span>
        )}
      </div>

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-chrome-bright">You</span>
          <Crowns count={crowns.player} color="text-chrome-bright" />
        </div>
        <span
          className={`panel-inset border px-5 py-1.5 font-mono text-sm uppercase tracking-widest ${p.cls}`}
        >
          {p.label}
        </span>
        <TurnClock />
        <div className="flex items-center gap-2">
          <Crowns count={crowns.ai} color="text-blood-neon" />
          <span className="font-mono text-xs uppercase tracking-wider text-blood-neon">AI</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setMuted(toggleMute())}
          className="btn-chrome px-3 py-2 font-mono text-xs uppercase tracking-wider"
          title="Toggle sound"
        >
          {muted ? 'Muted' : 'Sound'}
        </button>
        {phase === 'player-turn' && selectedHand !== null && (
          <button
            onClick={cancelSelection}
            className="btn-chrome px-4 py-2 font-mono text-xs uppercase tracking-wider"
          >
            Cancel
          </button>
        )}
        {phase === 'player-turn' && !playerPassed && (
          <>
            <button
              onClick={next}
              className="btn-neon px-5 py-2 font-mono text-sm uppercase tracking-widest"
            >
              Next ⏭
            </button>
            <button
              onClick={pass}
              className="btn-blood px-5 py-2 font-mono text-sm uppercase tracking-widest"
            >
              Pass
            </button>
          </>
        )}
        <button
          onClick={restart}
          className="btn-chrome px-4 py-2 font-mono text-xs uppercase tracking-wider"
        >
          {phase === 'deck-builder' ? 'Reset' : 'Deck'}
        </button>
      </div>
    </header>
  );
}
