import Phaser from 'phaser';
import { PreloadScene } from './scenes/PreloadScene';
import { BoardScene } from './scenes/BoardScene';

/** Mounts the Phaser canvas into a React-managed div. */
export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    transparent: true,
    // Snap texture-based objects (incl. Text) to whole pixels — zone/card
    // positions are often fractional, which is what makes the text blurry.
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
    scene: [PreloadScene, BoardScene],
  });
}
