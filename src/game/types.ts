export type Side = 'player' | 'ai';

export type Faction =
  | 'elarion'
  | 'elderveld'
  | 'kalthrone'
  | 'hotc'
  | 'hochreich'
  | 'ravaria'
  | 'varkazan'
  | 'monster'
  | 'unknown';

export type Rarity =
  | 'mortal'
  | 'cursed'
  | 'arcane'
  | 'forbidden'
  | 'mythic'
  | 'relic'
  | 'divine';

export type AbilityKind =
  | 'none'
  | 'onReveal'
  | 'ongoing'
  | 'chaos'
  | 'spy'
  | 'medic'
  | 'muster'
  | 'move'
  | 'factionBond'
  | 'hero';

export interface CardDef {
  id: string; // '0001'..'0214' or token id
  name: string;
  power: number;
  faction: Faction;
  rarity: Rarity;
  kind: AbilityKind;
  text: string;
  art: string;
  token?: boolean; // summon-only, not in deck pool
}

export interface BoardCard {
  instanceId: string;
  def: CardDef;
  owner: Side;
  bonus: number;
  faceDown?: boolean;
  silenced?: boolean;
  chaosTurnsLeft?: number;
  moved?: boolean;
  copiedFrom?: string; // card id whose ongoing was copied (Katerina/Vulture)
}

export type LocationId =
  | 'abyss' | 'battlefield' | 'coliseum' | 'cursed-lands' | 'dense-forest'
  | 'desert' | 'dragons' | 'elaria' | 'elderlands' | 'future' | 'hochreich'
  | 'hotc-camp' | 'kal' | 'mirror' | 'hell' | 'intestines' | 'labyrinth'
  | 'lava' | 'plague' | 'heaven' | 'plains' | 'ravaria' | 'random'
  | 'shadowland' | 'stakes' | 'valhalla' | 'varkaz' | 'snowy' | 'soulland'
  | 'swamps';

export interface LocationDef {
  id: LocationId;
  name: string;
  text: string;
}

export interface LocationState {
  def: LocationDef;
  player: BoardCard[];
  ai: BoardCard[];
  playerChaos: BoardCard | null;
  aiChaos: BoardCard | null;
}

export type Phase =
  | 'deck-builder'
  | 'player-turn'
  | 'ai-turn'
  | 'round-end'
  | 'game-end';

export interface HandCard {
  def: CardDef;
  bonus: number;
}

export interface SideState {
  deck: CardDef[];
  hand: HandCard[];
  destroyed: BoardCard[];
  passed: boolean;
}

export interface RoundResult {
  round: number;
  winner: Side | 'tie';
  locationWinners: (Side | 'tie')[];
  playerTotals: number[];
  aiTotals: number[];
}

/** Transient board animation event, produced by engine actions. */
export interface FxEvent {
  id: number;
  kind: 'slam' | 'spy' | 'move' | 'burn' | 'destroy';
  li: number;
  side: Side;
  instanceId?: string;
}
