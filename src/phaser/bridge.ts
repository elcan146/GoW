import type Phaser from 'phaser';
import { onGameEnd, onPhase } from '../audio';
import { useGameStore } from '../game/store';
import type { Phase } from '../game/types';
import type { BoardScene } from './scenes/BoardScene';

let activeGame: Phaser.Game | null = null;

function board(): BoardScene | null {
  if (!activeGame) return null;
  const b = activeGame.scene.getScene('board') as BoardScene | null;
  // sys.isActive() is safe pre-boot; ScenePlugin.isActive() throws before
  // the scene's manager is assigned.
  return b && b.sys && b.sys.isActive() ? b : null;
}

/**
 * Wires the Zustand store into the Phaser board scene.
 * The store stays the single source of truth; the scene is a pure renderer.
 * Returns an unsubscribe function.
 */
export function attachBridge(game: Phaser.Game): () => void {
  activeGame = game;
  let prevPhase: Phase | null = null;
  let prevWinner: string | null = null;

  const unsub = useGameStore.subscribe((s) => {
    board()?.onState(s);
    onPhase(s.phase, prevPhase);
    if (s.phase === 'game-end' && s.gameWinner !== prevWinner) {
      onGameEnd(s.gameWinner);
    }
    prevPhase = s.phase;
    prevWinner = s.gameWinner;
  });

  // PhaserBoard only mounts once the match starts, so the deck-builder →
  // player-turn commit fired before this subscriber existed. Replay it so
  // round-1 music/stingers aren't skipped.
  const init = useGameStore.getState();
  onPhase(init.phase, 'deck-builder');
  prevPhase = init.phase;
  prevWinner = init.gameWinner;

  // Once the board scene is live: wire callbacks + push current state.
  const t = setInterval(() => {
    const b = board();
    if (!b) return;
    b.onPlay = (li) => useGameStore.getState().playAtLocation(li);
    b.onInspect = (def, bonus, power) =>
      useGameStore.getState().inspectCard(def, bonus, power);
    b.onSelectHand = (i) => useGameStore.getState().selectCard(i);
    b.onState(useGameStore.getState());
    clearInterval(t);
  }, 100);
  const kill = setTimeout(() => clearInterval(t), 10000);

  return () => {
    unsub();
    clearInterval(t);
    clearTimeout(kill);
    if (activeGame === game) activeGame = null;
  };
}
