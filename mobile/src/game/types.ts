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

/**
 * Data-driven card behavior. Every card's effect is described by a `type`
 * plus optional params — the engine (effects.ts) interprets these generically,
 * so rebalancing a card means editing data/cards.json, not engine code.
 */
export type EffectType =
  // --- passive auras (evaluated inside cardPower) ---
  | 'auraAllHere'        // +amount to ALL other cards at this location
  | 'auraFriendlyHere'   // +amount to your other cards at this location
  | 'auraFactionHere'    // +amount to `faction` cards at this location (any owner)
  | 'auraKindHere'       // +amount to your cards of ability `kind` at this location
  | 'auraFactionGlobal'  // +amount to `faction` cards everywhere (scope: mine|all)
  | 'auraKindGlobal'     // +amount to your cards of ability `kind` everywhere
  | 'auraNameMatch'      // +amount to your cards whose name matches namePattern
  | 'auraAdjacent'       // +amount to your cards at adjacent locations
  | 'doubleAuras'        // your other ongoing auras here apply twice
  | 'selfPerHand'        // this card: +amount per card in your hand
  | 'selfPerFaction'     // this card: +amount per distinct faction at this location
  | 'protect'            // your other cards here can't be destroyed
  | 'hideCards'          // cards played here stay face-down
  | 'debuffOnEnemyPlay'  // enemy cards played here get -amount
  | 'buffOnFriendlyPlay' // your cards played here get +amount
  | 'blockEnemyOnReveal' // enemy On Reveal abilities don't trigger here
  | 'doubleOnReveal'     // your On Reveal abilities here trigger twice
  | 'buffDrawn'          // cards you draw get +amount
  | 'buffHand'           // on play + while active: cards in your hand get +amount
  // --- end-of-turn ---
  | 'growPerTurn'        // +amount to itself at end of each turn
  | 'moveRandomEachTurn' // moves to a random location at end of each turn
  | 'moveOnceAdjacent'   // moves to an adjacent location once per game
  // --- on-play (kind: move) ---
  | 'pullFriendly'       // move your strongest card from another location here
  | 'moveRandomEnemy'    // move a random enemy card here to another location
  | 'trapOnEnemyMove'    // passive: enemy cards that move here are destroyed
  // --- spy ---
  | 'spyDrawSteal'       // draw `count`, steal 1 from enemy deck
  | 'spyDraw'            // draw `count`
  | 'spyCopyLast'        // copy the last card the enemy played into your hand
  | 'spyRevealHand'      // reveal the enemy hand (log)
  // --- medic ---
  | 'resurrect'          // revive destroyed card(s): faction/toHand/amount/includeHeroes
  | 'resurrectEnemy'     // revive a random enemy destroyed card to your side
  | 'sacrificeResurrect' // destroy your weakest here, revive a higher-power card
  // --- muster ---
  | 'muster'             // play all same-named cards from your deck here
  // --- on reveal ---
  | 'destroyHighestIfTotal' // destroy highest enemy if enemy total > threshold
  | 'debuffAllEnemies'   // all enemy cards here get -amount
  | 'silenceOngoingHere' // remove abilities from all Ongoing cards here
  | 'repeatOnReveal'     // repeat On Reveal of your other cards here
  | 'destroyLowest'      // destroy the lowest-power enemy card here
  | 'destroyRandom'      // destroy a random enemy card here
  | 'draw'               // draw `count` cards
  | 'silenceNext'        // the next card the opponent plays loses its ability
  | 'copyEnemyPlayedHere'// if enemy played here this turn, copy that card to hand
  | 'resurrectAll'       // revive all your destroyed cards with power <= maxPower
  | 'summon'             // summon `count` of `token` (target: here|adjacent)
  | 'buffKindHere'       // your cards of ability `kind` here get +amount
  | 'destroyBelow'       // destroy enemy card(s) with power <= maxPower (all?)
  | 'sacrificeLowestDraw'// destroy your lowest card here, draw `count`
  | 'moveRandomEnemyAdjacent' // move a random enemy here to an adjacent location
  | 'silenceAllEnemies'  // remove abilities from all enemy cards here
  | 'copyOngoing'        // copy the effect of a random enemy Ongoing card here
  | 'stealOngoing'       // steal the effect of a random enemy Ongoing card here
  | 'stealPowerAll'      // steal `amount` power from every enemy card here
  | 'devour'             // destroy your strongest other card here, gain its power
  // --- misc ---
  | 'chaos'              // chaos slot: `turns` burn rolls of power/sideTotal
  | 'factionBond'        // power doubles if another `faction` (default: own) card is here
  | 'hero'               // immune to effects and destruction
  | 'none';

export interface EffectDef {
  type: EffectType;
  amount?: number;       // power delta / bonus magnitude
  turns?: number;        // chaos duration
  threshold?: number;    // enemy side-total required (destroyHighestIfTotal)
  maxPower?: number;     // target power ceiling (destroyBelow / resurrectAll)
  count?: number;        // draws / summons
  faction?: Faction;     // faction filter or bond override
  kind?: AbilityKind;    // ability-kind filter (auraKindHere, buffKindHere…)
  token?: string;        // token id to summon
  target?: 'here' | 'adjacent';
  scope?: 'mine' | 'all';
  all?: boolean;         // hit every matching target instead of one
  toHand?: boolean;      // resurrect to hand instead of board
  includeHeroes?: boolean;
  namePattern?: string;  // regex for auraNameMatch
}

export interface CardDef {
  id: string; // '0001'..'0214' or token id
  name: string;
  power: number;
  faction: Faction;
  rarity: Rarity;
  kind: AbilityKind;
  text: string;
  art: string;
  effect?: EffectDef; // data-driven behavior; absent = no effect
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
