import { useEffect } from 'react';
import { useGameStore } from '../game/store';

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
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in">
      <div className="iron-panel w-96 border-2 border-[#7a0e16] p-7 text-center shadow-[0_0_60px_rgba(193,18,31,0.25),0_0_60px_rgba(0,0,0,0.9)]">
        <h2
          className={`font-gothic text-3xl font-black tracking-[0.15em] ${
            isGameEnd && gameWinner === 'player'
              ? 'metal-text'
              : isGameEnd && gameWinner === 'ai'
                ? 'neon-text'
                : 'metal-text'
          }`}
          style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
        >
          {title}
        </h2>

        <div className="mt-5 space-y-1.5 font-mono text-sm">
          {last.locationWinners.map((w, i) => (
            <div
              key={i}
              className="panel-inset flex items-center justify-between px-4 py-2"
            >
              <span className="text-xs uppercase tracking-wider text-chrome-dark">
                Location {i + 1}
              </span>
              <span className="font-bold">
                <span className="text-chrome-bright">{last.playerTotals[i]}</span>
                <span className="mx-1.5 text-chrome-dark">–</span>
                <span className="text-blood-neon">{last.aiTotals[i]}</span>
              </span>
              <span
                className={`w-12 text-right text-xs uppercase ${
                  w === 'player'
                    ? 'text-chrome-bright'
                    : w === 'ai'
                      ? 'text-blood-neon'
                      : 'text-chrome-dark'
                }`}
              >
                {w === 'tie' ? 'Draw' : w === 'player' ? 'You' : 'AI'}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 font-mono text-sm text-chrome">
          Crowns — <span className="font-bold text-chrome-bright">{crowns.player}</span> :{' '}
          <span className="font-bold text-blood-neon">{crowns.ai}</span>
        </div>

        <button
          onClick={isGameEnd ? restart : nextRound}
          className="btn-neon mt-6 w-full py-2.5 font-mono text-sm uppercase tracking-widest"
        >
          {isGameEnd ? 'Play again' : 'Next round'}
        </button>
      </div>
    </div>
  );
}
