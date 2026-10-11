import { create } from 'zustand';
import { CARDS, CARD_BY_ID } from './cards';
import { LOCATION_POOL } from './locations';
import {
  DECK_SIZE,
  HAND_LIMIT,
  canPlayAt,
  capacityFor,
  cardPower,
  checkLava,
  clearBoard,
  drawCards,
  endOfRound,
  endOfTurn,
  newInstance,
  onCardPlayed,
  opp,
  pushFx,
  sideTotal,
  type EngineState,
} from './effects';
import type {
  BoardCard,
  CardDef,
  FxEvent,
  LocationState,
  Phase,
  RoundResult,
  Side,
} from './types';

const ROUNDS_TO_WIN = 2;
const MAX_ROUNDS = 3;
const MAX_COPIES = 3;
const DECK_KEY = 'grails-of-war-deck';
const DECKS_KEY = 'grails-of-war-saved-decks';
/** Seconds per turn — when it runs out the turn passes to the opponent. */
export const TURN_SECONDS = 30;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickLocations(): LocationState[] {
  return shuffle(LOCATION_POOL)
    .slice(0, 3)
    .map((def) => ({ def, player: [], ai: [], playerChaos: null, aiChaos: null }));
}

function randomDeck(): CardDef[] {
  const counts = new Map<string, number>();
  const deck: CardDef[] = [];
  while (deck.length < DECK_SIZE) {
    const c = CARDS[Math.floor(Math.random() * CARDS.length)];
    const n = counts.get(c.id) ?? 0;
    if (n >= MAX_COPIES) continue;
    counts.set(c.id, n + 1);
    deck.push(c);
  }
  return shuffle(deck);
}

const storage = {
  get: (k: string): string | null => {
    try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; }
  },
  set: (k: string, v: string) => {
    try { globalThis.localStorage?.setItem(k, v); } catch { /* noop */ }
  },
};

function loadDeck(): string[] {
  try {
    const raw = storage.get(DECK_KEY);
    if (raw) {
      const ids = JSON.parse(raw) as string[];
      return ids.filter((id) => CARD_BY_ID.has(id)).slice(0, DECK_SIZE);
    }
  } catch { /* ignore */ }
  return [];
}

/** Sanitize a saved id list: known cards, ≤3 copies, ≤DECK_SIZE. */
function sanitizeDeck(ids: string[]): string[] {
  const counts = new Map<string, number>();
  const out: string[] = [];
  for (const id of ids) {
    if (!CARD_BY_ID.has(id)) continue;
    const n = counts.get(id) ?? 0;
    if (n >= MAX_COPIES || out.length >= DECK_SIZE) continue;
    counts.set(id, n + 1);
    out.push(id);
  }
  return out;
}

function loadSavedDecks(): Record<string, string[]> {
  try {
    const raw = storage.get(DECKS_KEY);
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, string[]>;
      const out: Record<string, string[]> = {};
      for (const [name, ids] of Object.entries(obj)) {
        if (Array.isArray(ids)) out[name] = sanitizeDeck(ids);
      }
      return out;
    }
  } catch { /* ignore */ }
  return {};
}

/** Card currently shown in the right-side detail panel. */
export interface InspectedCard {
  def: CardDef;
  bonus: number;
  power?: number; // computed board power, when inspecting a played card
}

export interface GameState extends EngineState {
  phase: Phase;
  round: number;
  crowns: { player: number; ai: number };
  builderDeck: string[];
  fx: FxEvent[]; // transient board animation events
  shake: number; // increments on each card slam — drives board shake
  selectedHand: number | null; // index into player.hand
  inspected: InspectedCard | null; // card shown in the detail panel
  roundResults: RoundResult[];
  gameWinner: Side | 'tie' | null;
  aiPlaysThisTurn: number;
  /** Bumped on every turn boundary — drives the 30s turn clock. */
  turnId: number;
  /** Date.now() when the current turn began. */
  turnStartedAt: number;
  /** Named deck slots persisted to localStorage. */
  savedDecks: Record<string, string[]>;

  // deck builder
  addToDeck: (id: string) => void;
  removeFromDeck: (id: string) => void;
  autoFillDeck: () => void;
  clearDeck: () => void;
  saveDeck: (name: string) => void;
  deleteSavedDeck: (name: string) => void;
  loadSavedDeck: (name: string) => void;
  startMatch: () => void;

  // match
  selectCard: (handIndex: number) => void;
  cancelSelection: () => void;
  inspectCard: (def: CardDef, bonus?: number, power?: number) => void;
  closeInspector: () => void;
  playAtLocation: (locationIndex: number) => void;
  next: () => void; // end your turn → AI turn
  pass: () => void; // lock board for the round
  aiStep: () => void; // called on a timer while phase === 'ai-turn'
  nextRound: () => void;
  restart: () => void; // back to deck builder
}

type Draft = EngineState;

function draftOf(s: GameState): Draft {
  return structuredClone({
    locations: s.locations,
    player: s.player,
    ai: s.ai,
    log: s.log,
    lastPlayedBy: s.lastPlayedBy,
    playedHereThisTurn: {
      player: new Set(s.playedHereThisTurn.player),
      ai: new Set(s.playedHereThisTurn.ai),
    },
    silenceNext: { ...s.silenceNext },
    fx: [], // fresh event queue per action
  });
}

function commit(d: Draft): Partial<GameState> {
  return {
    locations: d.locations,
    player: d.player,
    ai: d.ai,
    log: d.log,
    lastPlayedBy: d.lastPlayedBy,
    playedHereThisTurn: d.playedHereThisTurn,
    silenceNext: d.silenceNext,
    fx: d.fx,
  };
}

const emptyEngine = (): EngineState => ({
  locations: [],
  player: { deck: [], hand: [], destroyed: [], passed: false },
  ai: { deck: [], hand: [], destroyed: [], passed: false },
  log: [],
  lastPlayedBy: { player: null, ai: null },
  playedHereThisTurn: { player: new Set(), ai: new Set() },
  silenceNext: { player: false, ai: false },
  fx: [],
});

/** Play a card from a side's hand onto the board (handles spy/chaos placement). */
function playCard(d: Draft, s: Side, handIndex: number, li: number): boolean {
  const st = d[s];
  const hc = st.hand[handIndex];
  if (!hc || !canPlayAt(d, s, hc.def, li)) return false;
  st.hand.splice(handIndex, 1);

  const card = newInstance(hc.def, s, hc.bonus);
  const loc = d.locations[li];
  const e = opp(s);
  const who = s === 'player' ? 'You' : 'AI';

  if (hc.def.kind === 'chaos') {
    const turns = Number(hc.def.text.match(/\((\d+)\s*turn/)?.[1] ?? 1);
    card.chaosTurnsLeft = turns;
    loc[s === 'player' ? 'playerChaos' : 'aiChaos'] = card;
    d.lastPlayedBy[s] = hc.def;
    d.playedHereThisTurn[s].add(li);
    pushFx(d, 'slam', li, s, card.instanceId);
    d.log.unshift(`${who} played ${hc.def.name} into the Chaos Slot at ${loc.def.name}.`);
  } else if (hc.def.kind === 'spy') {
    // Spies deploy to the enemy side.
    if (loc[e].length >= capacityFor(loc)) { st.hand.splice(handIndex, 0, hc); return false; }
    loc[e].push(card);
    pushFx(d, 'spy', li, e, card.instanceId);
    d.log.unshift(`${who} infiltrated ${hc.def.name} at ${loc.def.name}.`);
    onCardPlayed(d, s, card, li);
  } else {
    loc[s].push(card);
    pushFx(d, 'slam', li, s, card.instanceId);
    d.log.unshift(`${who} played ${hc.def.name} at ${loc.def.name}.`);
    onCardPlayed(d, s, card, li);
  }

  drawCards(d, s, 1); // draw-on-play
  checkLava(d); // continuous hazard
  return true;
}

function hasPlays(d: Draft, s: Side): boolean {
  const st = d[s];
  if (st.passed || st.hand.length === 0) return false;
  return st.hand.some((hc) => d.locations.some((_, li) => canPlayAt(d, s, hc.def, li)));
}

function sideDone(d: Draft, s: Side): boolean {
  return d[s].passed || !hasPlays(d, s);
}

/** Auto-play up to 8 cards per deck at the Random location (round start). */
function applyRandomLocation(d: Draft): void {
  for (let li = 0; li < 3; li++) {
    const loc = d.locations[li];
    if (loc.def.id !== 'random') continue;
    for (const s of ['player', 'ai'] as Side[]) {
      const st = d[s];
      while (loc[s].length < capacityFor(loc) && st.deck.length) {
        loc[s].push(newInstance(st.deck.shift()!, s));
      }
    }
    d.log.unshift('Random dealt 8 cards from each deck.');
  }
}

export const useGameStore = create<GameState>((set, get) => {
  /** Commit a draft, bump the shake counter on slams, auto-clear fx events. */
  const apply = (d: Draft, extra: Partial<GameState> = {}) => {
    const slams = d.fx.filter((f) => f.kind === 'slam' || f.kind === 'spy').length;
    set({
      ...commit(d),
      ...(slams ? { shake: get().shake + slams } : {}),
      ...extra,
    });
    if (d.fx.length) setTimeout(() => set({ fx: [] }), 1500);
  };

  return {
  ...emptyEngine(),
  phase: 'deck-builder',
  round: 1,
  crowns: { player: 0, ai: 0 },
  builderDeck: loadDeck(),
  shake: 0,
  selectedHand: null,
  inspected: null,
  roundResults: [],
  gameWinner: null,
  aiPlaysThisTurn: 0,
  turnId: 0,
  turnStartedAt: 0,
  savedDecks: loadSavedDecks(),

  // ------------------------------------------------------------- deck builder
  addToDeck: (id) => {
    const s = get();
    if (s.builderDeck.length >= DECK_SIZE) return;
    if (s.builderDeck.filter((x) => x === id).length >= MAX_COPIES) return;
    const next = [...s.builderDeck, id];
    storage.set(DECK_KEY, JSON.stringify(next));
    set({ builderDeck: next });
  },
  removeFromDeck: (id) => {
    const s = get();
    const i = s.builderDeck.lastIndexOf(id);
    if (i === -1) return;
    const next = [...s.builderDeck];
    next.splice(i, 1);
    storage.set(DECK_KEY, JSON.stringify(next));
    set({ builderDeck: next });
  },
  autoFillDeck: () => {
    const deck = randomDeck().map((c) => c.id);
    storage.set(DECK_KEY, JSON.stringify(deck));
    set({ builderDeck: deck });
  },
  clearDeck: () => {
    storage.set(DECK_KEY, JSON.stringify([]));
    set({ builderDeck: [] });
  },
  saveDeck: (name) => {
    const s = get();
    const key = name.trim();
    if (!key || !s.builderDeck.length) return;
    const savedDecks = { ...s.savedDecks, [key]: [...s.builderDeck] };
    storage.set(DECKS_KEY, JSON.stringify(savedDecks));
    set({ savedDecks });
  },
  deleteSavedDeck: (name) => {
    const savedDecks = { ...get().savedDecks };
    delete savedDecks[name];
    storage.set(DECKS_KEY, JSON.stringify(savedDecks));
    set({ savedDecks });
  },
  loadSavedDeck: (name) => {
    const ids = get().savedDecks[name];
    if (!ids) return;
    const deck = sanitizeDeck(ids);
    storage.set(DECK_KEY, JSON.stringify(deck));
    set({ builderDeck: deck });
  },
  startMatch: () => {
    const s = get();
    if (s.builderDeck.length !== DECK_SIZE) return;
    const playerDeck = shuffle(s.builderDeck.map((id) => CARD_BY_ID.get(id)!));
    const aiDeck = randomDeck();
    const d: Draft = {
      ...emptyEngine(),
      locations: pickLocations(),
      player: { deck: playerDeck, hand: [], destroyed: [], passed: false },
      ai: { deck: aiDeck, hand: [], destroyed: [], passed: false },
      log: ['— Round 1 begins —'],
    };
    drawCards(d, 'player', HAND_LIMIT);
    drawCards(d, 'ai', HAND_LIMIT);
    applyRandomLocation(d);
    apply(d, { phase: 'player-turn', round: 1, crowns: { player: 0, ai: 0 }, roundResults: [], gameWinner: null, selectedHand: null, inspected: null, aiPlaysThisTurn: 0, turnId: s.turnId + 1, turnStartedAt: Date.now() });
  },

  // -------------------------------------------------------------------- match
  selectCard: (i) => {
    const s = get();
    if (s.phase !== 'player-turn' || s.player.passed) return;
    if (!s.player.hand[i]) return;
    set({ selectedHand: s.selectedHand === i ? null : i });
  },
  cancelSelection: () => set({ selectedHand: null }),

  inspectCard: (def, bonus = 0, power) => set({ inspected: { def, bonus, power } }),
  closeInspector: () => set({ inspected: null }),

  playAtLocation: (li) => {
    const s = get();
    if (s.phase !== 'player-turn' || s.selectedHand === null || s.player.passed) return;
    const d = draftOf(s);
    if (!playCard(d, 'player', s.selectedHand, li)) return;
    apply(d, { selectedHand: null });
  },

  next: () => {
    const s = get();
    if (s.phase !== 'player-turn') return;
    const d = draftOf(s);
    endOfTurn(d, 'player');
    const turn = { turnId: s.turnId + 1, turnStartedAt: Date.now() };
    if (sideDone(d, 'player') && sideDone(d, 'ai')) return finishRound(d, apply, get);
    // If AI is done (passed/no plays) the player keeps the initiative.
    if (sideDone(d, 'ai')) {
      apply(d, { phase: 'player-turn', selectedHand: null, ...turn });
      return;
    }
    apply(d, { phase: 'ai-turn', aiPlaysThisTurn: 0, selectedHand: null, ...turn });
  },

  pass: () => {
    const s = get();
    if (s.phase !== 'player-turn' || s.player.passed) return;
    const d = draftOf(s);
    d.player.passed = true;
    endOfTurn(d, 'player');
    d.log.unshift('You passed.');
    if (sideDone(d, 'ai')) return finishRound(d, apply, get);
    apply(d, { phase: 'ai-turn', aiPlaysThisTurn: 0, selectedHand: null, turnId: s.turnId + 1, turnStartedAt: Date.now() });
  },

  aiStep: () => {
    const s = get();
    if (s.phase !== 'ai-turn') return;
    const d = draftOf(s);

    const turn = { turnId: s.turnId + 1, turnStartedAt: Date.now() };
    if (sideDone(d, 'ai')) {
      if (!d.ai.passed && d.ai.hand.length === 0) d.ai.passed = true;
      if (sideDone(d, 'player')) return finishRound(d, apply, get);
      endOfTurn(d, 'ai');
      apply(d, { phase: 'player-turn', ...turn });
      return;
    }

    // Decide: pass when nearly out of cards, else play one card.
    const st = d.ai;
    const shouldPass = st.hand.length <= 1 && s.aiPlaysThisTurn >= 2;
    if (shouldPass) {
      d.ai.passed = true;
      d.log.unshift('AI passed.');
      endOfTurn(d, 'ai');
      if (sideDone(d, 'player')) return finishRound(d, apply, get);
      apply(d, { phase: 'player-turn', ...turn });
      return;
    }

    // Pick a random playable card + valid location.
    const options: { hi: number; li: number }[] = [];
    st.hand.forEach((hc, hi) => {
      d.locations.forEach((_, li) => {
        if (canPlayAt(d, 'ai', hc.def, li)) options.push({ hi, li });
      });
    });
    if (!options.length) {
      d.ai.passed = true;
      endOfTurn(d, 'ai');
      if (sideDone(d, 'player')) return finishRound(d, apply, get);
      apply(d, { phase: 'player-turn', ...turn });
      return;
    }
    const pick = options[Math.floor(Math.random() * options.length)];
    playCard(d, 'ai', pick.hi, pick.li);

    const plays = s.aiPlaysThisTurn + 1;
    const endChance = plays >= 3 ? 0.75 : plays >= 1 ? 0.35 : 0;
    if (Math.random() < endChance) {
      endOfTurn(d, 'ai');
      if (sideDone(d, 'player')) return finishRound(d, apply, get);
      apply(d, { phase: 'player-turn', aiPlaysThisTurn: 0, ...turn });
    } else {
      apply(d, { aiPlaysThisTurn: plays });
    }
  },

  nextRound: () => {
    const s = get();
    if (s.phase !== 'round-end') return;
    const d = draftOf(s);

    // Future: cards there carry over to the new active location (same slot).
    const carried: { li: number; side: Side; std: BoardCard[]; chaos: BoardCard | null }[] = [];
    d.locations.forEach((loc, li) => {
      if (loc.def.id !== 'future') return;
      (['player', 'ai'] as Side[]).forEach((side) => {
        const key = side === 'player' ? 'playerChaos' : 'aiChaos';
        carried.push({ li, side, std: [...loc[side]], chaos: loc[key] });
      });
    });

    clearBoard(d);
    // Locations are re-drawn from the pool each round.
    d.locations = pickLocations();
    for (const { li, side, std, chaos } of carried) {
      const loc = d.locations[li];
      const key = side === 'player' ? 'playerChaos' : 'aiChaos';
      for (const c of std) {
        if (loc[side].length < capacityFor(loc)) loc[side].push(c);
        else d[side].destroyed.push(c);
      }
      if (chaos) {
        if (loc[key] === null) loc[key] = chaos;
        else d[side].destroyed.push(chaos);
      }
    }

    d.player.passed = false;
    d.ai.passed = false;
    d.lastPlayedBy = { player: null, ai: null };
    d.silenceNext = { player: false, ai: false };
    d.playedHereThisTurn = { player: new Set(), ai: new Set() };
    applyRandomLocation(d);
    d.log.unshift(`— Round ${s.round + 1} begins —`);
    apply(d, { round: s.round + 1, phase: 'player-turn', selectedHand: null, aiPlaysThisTurn: 0, turnId: s.turnId + 1, turnStartedAt: Date.now() });
  },

  restart: () => {
    set({ ...emptyEngine(), phase: 'deck-builder', round: 1, crowns: { player: 0, ai: 0 }, roundResults: [], gameWinner: null, selectedHand: null, inspected: null, aiPlaysThisTurn: 0, turnId: 0, turnStartedAt: 0 });
  },
  };
});

function finishRound(
  d: Draft,
  apply: (d: Draft, extra?: Partial<GameState>) => void,
  get: () => GameState,
): void {
  const s = get();
  const { winners, pTotals, aTotals } = endOfRound(d);
  const pWins = winners.filter((w) => w === 'player').length;
  const aWins = winners.filter((w) => w === 'ai').length;
  const winner: Side | 'tie' = pWins > aWins ? 'player' : aWins > pWins ? 'ai' : 'tie';
  const crowns = { ...s.crowns };
  if (winner === 'player') crowns.player += 1;
  if (winner === 'ai') crowns.ai += 1;
  const gameOver = crowns.player >= ROUNDS_TO_WIN || crowns.ai >= ROUNDS_TO_WIN || s.round >= MAX_ROUNDS;
  const gameWinner = gameOver
    ? crowns.player > crowns.ai ? 'player' : crowns.ai > crowns.player ? 'ai' : 'tie'
    : null;
  d.log.unshift(`Round ${s.round} → ${winner === 'tie' ? 'draw' : winner + ' wins'}`);
  apply(d, {
    crowns,
    roundResults: [...s.roundResults, { round: s.round, winner, locationWinners: winners, playerTotals: pTotals, aiTotals: aTotals }],
    phase: gameOver ? 'game-end' : 'round-end',
    gameWinner,
    selectedHand: null,
  });
}

// Re-export for components.
export { cardPower, sideTotal, canPlayAt };
