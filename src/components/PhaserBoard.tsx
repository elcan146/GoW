import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { createGame } from '../phaser/main';
import { attachBridge } from '../phaser/bridge';

/** Mounts the Phaser canvas; owns the game lifecycle + store bridge. */
export function PhaserBoard() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    const game = createGame(hostRef.current);
    gameRef.current = game;
    (window as unknown as { __game: Phaser.Game }).__game = game; // dev/debug handle
    const unsub = attachBridge(game);
    return () => {
      unsub();
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={hostRef} className="absolute inset-0" />
      {/* Vignette — darkens board edges, focuses the eye on the columns */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 80% at 50% 45%, transparent 55%, rgba(0,0,0,0.5) 100%)',
        }}
      />
    </div>
  );
}
