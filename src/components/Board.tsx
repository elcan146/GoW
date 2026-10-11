import { useEffect, useRef } from 'react';
import { useGameStore } from '../game/store';
import { LocationColumn } from './LocationColumn';
import { CardView } from './CardView';

export function Board() {
  const locations = useGameStore((s) => s.locations);
  const aiHand = useGameStore((s) => s.ai.hand);
  const aiPassed = useGameStore((s) => s.ai.passed);
  const aiDeck = useGameStore((s) => s.ai.deck.length);
  const playerDeck = useGameStore((s) => s.player.deck.length);
  const shake = useGameStore((s) => s.shake);
  const boardRef = useRef<HTMLDivElement>(null);

  // Camera shake via WAAPI — no remount, composited on the GPU thread.
  useEffect(() => {
    if (!shake || !boardRef.current) return;
    boardRef.current.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: 'translate(-6px,3px)' },
        { transform: 'translate(6px,-3px)' },
        { transform: 'translate(-4px,-2px)' },
        { transform: 'translate(4px,2px)' },
        { transform: 'translate(-2px,1px)' },
        { transform: 'translate(0,0)' },
      ],
      { duration: 380, easing: 'cubic-bezier(0.36,0.07,0.19,0.97)' },
    );
  }, [shake]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 px-4 py-1">
      {/* AI hand: fanned card backs */}
      <div className="flex h-14 shrink-0 items-center justify-center gap-3">
        {aiPassed ? (
          <span className="btn-blood px-4 py-1 font-mono text-[11px] uppercase tracking-widest">
            Opponent has passed
          </span>
        ) : (
          <div className="flex items-center">
            {aiHand.map((hc, i) => (
              <div
                key={`${hc.def.id}-${i}`}
                className="-ml-5 first:ml-0"
                style={{ transform: `rotate(${(i - aiHand.length / 2) * 3}deg)` }}
              >
                <CardView card={hc.def} size="mini" faceDown disabled />
              </div>
            ))}
            <span className="panel-inset ml-3 px-2.5 py-1 font-mono text-xs text-chrome-bright">
              {aiHand.length}
            </span>
          </div>
        )}
        <span className="panel-inset px-2.5 py-1 font-mono text-[10px] text-chrome-dark">
          decks {playerDeck} : {aiDeck}
        </span>
      </div>

      {/* Locations as 3 columns — shaken via WAAPI on slam */}
      <div ref={boardRef} className="flex min-h-0 flex-1 gap-3">
        {locations.map((loc, i) => (
          <LocationColumn key={loc.def.id} location={loc} index={i} />
        ))}
      </div>
    </div>
  );
}
