import { CARD_BY_ID } from './cards';
import { MAX_CARDS_PER_SIDE } from './locations';
import type {
  BoardCard,
  CardDef,
  FxEvent,
  LocationState,
  Side,
  SideState,
} from './types';

// ---------------------------------------------------------------------------
// Engine state shared with the store. All functions mutate a draft object.
// ---------------------------------------------------------------------------

export interface EngineState {
  locations: LocationState[];
  player: SideState;
  ai: SideState;
  log: string[];
  lastPlayedBy: Record<Side, CardDef | null>;
  playedHereThisTurn: Record<Side, Set<number>>; // Bounty Hunter
  silenceNext: Record<Side, boolean>; // Mother Lunara
  fx: FxEvent[]; // transient animation events for the UI
}

let fxSeq = 0;
export function pushFx(g: EngineState, kind: FxEvent['kind'], li: number, side: Side, instanceId?: string): void {
  g.fx.push({ id: ++fxSeq, kind, li, side, instanceId });
}

export const HAND_LIMIT = 5;
export const DECK_SIZE = 30;

export const opp = (s: Side): Side => (s === 'player' ? 'ai' : 'player');
export const sideState = (g: EngineState, s: Side): SideState => g[s];
export const boardAt = (g: EngineState, li: number, s: Side): BoardCard[] =>
  g.locations[li][s];

let uid = 0;
export const newInstance = (def: CardDef, owner: Side, bonus = 0): BoardCard => ({
  instanceId: `${def.id}-${owner}-${uid++}-${Math.random().toString(36).slice(2, 7)}`,
  def,
  owner,
  bonus,
});

const say = (g: EngineState, msg: string) => {
  g.log.unshift(msg);
  if (g.log.length > 60) g.log.length = 60;
};

const rnd = <T>(arr: T[]): T | undefined =>
  arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;

const adjacent = (li: number): number[] =>
  [li - 1, li + 1].filter((i) => i >= 0 && i <= 2);

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const isActive = (c: BoardCard, loc: LocationState): boolean =>
  !c.silenced && loc.def.id !== 'abyss';

/** All board cards (both sides, all locations) with coordinates. */
export function* allCards(g: EngineState) {
  for (let li = 0; li < 3; li++) {
    for (const s of ['player', 'ai'] as Side[]) {
      for (const c of g.locations[li][s]) yield { li, s, c };
      const ch = g.locations[li][s === 'player' ? 'playerChaos' : 'aiChaos'];
      if (ch) yield { li, s, c: ch };
    }
  }
}

const hasAura = (g: EngineState, li: number, s: Side, id: string): boolean =>
  boardAt(g, li, s).some((c) => c.def.id === id && isActive(c, g.locations[li]));

/** Cards at a location protected from destruction. */
export function isProtected(g: EngineState, li: number, s: Side, c: BoardCard): boolean {
  const loc = g.locations[li];
  if (loc.def.id === 'heaven') return true;
  if (c.def.kind === 'hero') return true;
  if (c.def.id === '0023' || c.def.id === '0179') return false; // protectors aren't self-protected vs. each other? keep simple: they protect others
  if (hasAura(g, li, s, '0023')) return true; // Mage Lyssandra
  if (hasAura(g, li, s, '0179')) return true; // Arc Warrior
  return false;
}

/** Effective power of a board card, incl. auras + location modifiers. */
export function cardPower(g: EngineState, li: number, s: Side, c: BoardCard): number {
  const loc = g.locations[li];
  const lid = loc.def.id;
  if (lid === 'intestines') return 1;

  let p = c.def.power + c.bonus;
  const active = isActive(c, loc);

  // --- ongoing auras (from any card on the board) ---
  for (const { li: al, s: as, c: aura } of allCards(g)) {
    if (aura.instanceId === c.instanceId || !isActive(aura, g.locations[al])) continue;
    const sameLoc = al === li;
    const adj = adjacent(al).includes(li);
    const mine = as === s;
    const id = aura.copiedFrom ?? aura.def.id;
    switch (id) {
      case '0033': // Mosskin: +1 all other cards at this location
      case '0101': // Foresterian (Luminous)
        if (sameLoc) p += 1;
        break;
      case '0131': // Elephant Cart: your other cards here +1
        if (sameLoc && mine) p += 1;
        break;
      case '0011': // Thalindra: Elarion cards here +2
        if (sameLoc && c.def.faction === 'elarion') p += 2;
        break;
      case '0134': // Prince Muhammed: Varkazan cards here +2
        if (sameLoc && c.def.faction === 'varkazan') p += 2;
        break;
      case '0048': // Sgt. Drustan: your No Ability cards here +2
        if (sameLoc && mine && c.def.kind === 'none') p += 2;
        break;
      case '0049': // General Eldran: your other Ongoing cards here +2
        if (sameLoc && mine && c.def.kind === 'ongoing') p += 2;
        break;
      case '0095': // King Carrion: your HotC cards +2 (global)
        if (mine && c.def.faction === 'hotc') p += 2;
        break;
      case '0069': // Queen Elvira: all Elarion +1 globally
        if (c.def.faction === 'elarion') p += 1;
        break;
      case '0100': // General Oren: your No Ability cards +3 globally
        if (mine && c.def.kind === 'none') p += 3;
        break;
      case '0210': // Clockwork: your mechanical/construct cards +2
        if (mine && /clockwork|golem|automaton|construct|clock/i.test(c.def.name)) p += 2;
        break;
      case '0009': // Elowyn: adjacent locations +1 (your cards)
        if (adj && mine) p += 1;
        break;
      case '0188': // Starbound: adjacent locations +2 (your cards)
        if (adj && mine) p += 2;
        break;
    }
    // Skull of Xyveron: owner's other Ongoing auras at its location apply twice.
    if (sameLoc && mine && aura.def.kind === 'ongoing' &&
        boardAt(g, al, as).some((x) => x.def.id === '0016' && isActive(x, g.locations[al]))) {
      // re-apply the same aura once more
      switch (id) {
        case '0033': case '0101': p += 1; break;
        case '0131': p += 1; break;
        case '0011': if (c.def.faction === 'elarion') p += 2; break;
        case '0134': if (c.def.faction === 'varkazan') p += 2; break;
        case '0048': if (c.def.kind === 'none') p += 2; break;
        case '0049': if (c.def.kind === 'ongoing') p += 2; break;
      }
    }
  }

  // --- self-scaling ongoings ---
  if (active) {
    const id = c.copiedFrom ?? c.def.id;
    if (id === '0062' || id === '0094' || id === '0102') p += sideState(g, s).hand.length; // Foresterian: +1/hand card
    if (id === '0088') {
      const facs = new Set([...loc.player, ...loc.ai].map((x) => x.def.faction));
      p += facs.size; // World Coalition
    }
    if (c.def.kind === 'factionBond' &&
        [...loc.player, ...loc.ai].some((x) => x.instanceId !== c.instanceId && x.def.faction === c.def.faction)) {
      p *= 2;
    }
  }

  // --- location modifiers ---
  if (lid === 'battlefield')
    p +=
      loc.player.length +
      loc.ai.length +
      (loc.playerChaos ? 1 : 0) +
      (loc.aiChaos ? 1 : 0);
  if (lid === 'soulland' && c.def.kind !== 'none') p += 3;
  if (
    (lid === 'elaria' && c.def.faction === 'elarion') ||
    (lid === 'elderlands' && c.def.faction === 'elderveld') ||
    (lid === 'hochreich' && c.def.faction === 'hochreich') ||
    (lid === 'hotc-camp' && c.def.faction === 'hotc') ||
    (lid === 'ravaria' && c.def.faction === 'ravaria')
  ) p *= 2;
  if (lid === 'kal' && c.def.faction !== 'kalthrone') p = Math.floor(p / 2);
  if (lid === 'abyss') p = Math.floor(p / 2);

  return Math.max(0, p);
}

export function sideTotal(g: EngineState, li: number, s: Side): number {
  const loc = g.locations[li];
  let t = loc[s].reduce((a, c) => a + cardPower(g, li, s, c), 0);
  const ch = loc[s === 'player' ? 'playerChaos' : 'aiChaos'];
  if (ch) t += cardPower(g, li, s, ch);
  return t;
}

// ---------------------------------------------------------------------------
// Hand / deck helpers
// ---------------------------------------------------------------------------

export function drawCards(g: EngineState, s: Side, n: number): void {
  const st = sideState(g, s);
  for (let i = 0; i < n && st.deck.length && st.hand.length < HAND_LIMIT; i++) {
    const def = st.deck.shift()!;
    // Wordkeeper (Archivist): cards you draw gain +1 Power.
    const arch = [...Array(3)].some((_, li) => hasAura(g, li, s, '0111'));
    st.hand.push({ def, bonus: arch ? 1 : 0 });
  }
}

export function addToHand(g: EngineState, s: Side, def: CardDef, bonus = 0): void {
  const st = sideState(g, s);
  if (st.hand.length < HAND_LIMIT) st.hand.push({ def, bonus });
}

function stealFromDeck(g: EngineState, s: Side): void {
  const victim = sideState(g, opp(s));
  if (victim.deck.length) addToHand(g, s, victim.deck.shift()!);
}

// ---------------------------------------------------------------------------
// Placement / destruction / movement
// ---------------------------------------------------------------------------

export function capacityFor(loc: LocationState): number {
  return loc.def.id === 'desert' ? 4 : MAX_CARDS_PER_SIDE;
}

export function canPlayAt(g: EngineState, s: Side, def: CardDef, li: number): boolean {
  const loc = g.locations[li];
  if (def.kind === 'chaos') {
    return loc[s === 'player' ? 'playerChaos' : 'aiChaos'] === null;
  }
  // Spies deploy to the enemy side — capacity is checked there.
  const target = def.kind === 'spy' ? opp(s) : s;
  if (boardAt(g, li, target).length >= capacityFor(loc)) return false;
  switch (loc.def.id) {
    case 'hell':
      return def.faction === 'monster' || def.rarity === 'cursed' || def.rarity === 'arcane';
    case 'varkaz':
      return def.kind === 'none';
    default:
      return true;
  }
}

export function destroyCard(g: EngineState, li: number, s: Side, c: BoardCard, cause = 'destroyed'): void {
  if (isProtected(g, li, s, c)) return;
  const loc = g.locations[li];
  // Valhalla: destruction effects trigger but the card immediately resurrects.
  if (loc.def.id === 'valhalla') {
    say(g, `${c.def.name} was ${cause} at ${loc.def.name} — but Valhalla resurrected it.`);
    return;
  }
  const key = s === 'player' ? 'playerChaos' : 'aiChaos';
  if (loc[key]?.instanceId === c.instanceId) loc[key] = null;
  else loc[s] = loc[s].filter((x) => x.instanceId !== c.instanceId);
  sideState(g, c.owner).destroyed.push(c);
  pushFx(g, cause.includes('burn') ? 'burn' : 'destroy', li, s, c.instanceId);
  say(g, `${c.def.name} was ${cause} at ${loc.def.name}.`);
}

/** Lava is a continuous check: combined Power > 20 destroys the highest card. */
export function checkLava(g: EngineState): void {
  for (let li = 0; li < 3; li++) {
    const loc = g.locations[li];
    if (loc.def.id !== 'lava') continue;
    const combined = sideTotal(g, li, 'player') + sideTotal(g, li, 'ai');
    if (combined <= 20) continue;
    const all = [...loc.player, ...loc.ai].filter((x) => !isProtected(g, li, x.owner, x));
    const t = all.reduce<BoardCard | undefined>(
      (a, x) => (!a || cardPower(g, li, x.owner, x) > cardPower(g, li, a.owner, a) ? x : a),
      undefined,
    );
    if (t) destroyCard(g, li, t.owner, t, 'consumed by Lava');
  }
}

function moveCard(g: EngineState, fromLi: number, s: Side, c: BoardCard, toLi: number): void {
  const to = g.locations[toLi];
  if (boardAt(g, toLi, s).length >= capacityFor(to)) return;
  const from = g.locations[fromLi];
  from[s] = from[s].filter((x) => x.instanceId !== c.instanceId);
  to[s].push(c);
  pushFx(g, 'move', toLi, s, c.instanceId);
  // Michellsky trap: enemy card moving here is destroyed.
  if (hasAura(g, toLi, opp(s), '0083')) destroyCard(g, toLi, s, c, 'snared by Michellsky');
  else say(g, `${c.def.name} moved to ${to.def.name}.`);
}

function summon(g: EngineState, s: Side, li: number, tokenId: string, bonus = 0): void {
  const def = CARD_BY_ID.get(tokenId);
  if (!def || boardAt(g, li, s).length >= capacityFor(g.locations[li])) return;
  g.locations[li][s].push(newInstance(def, s, bonus));
}

function resurrect(g: EngineState, s: Side, li: number, filter: (c: BoardCard) => boolean, bonus = 0, toHand = false): boolean {
  const st = sideState(g, s);
  const idx = st.destroyed.findIndex(filter);
  if (idx === -1) return false;
  const card = st.destroyed.splice(idx, 1)[0];
  card.bonus += bonus;
  card.owner = s;
  if (toHand) {
    addToHand(g, s, card.def, card.bonus);
  } else if (boardAt(g, li, s).length < capacityFor(g.locations[li])) {
    g.locations[li][s].push(card);
  } else {
    st.destroyed.push(card);
    return false;
  }
  say(g, `${card.def.name} was resurrected.`);
  return true;
}

// ---------------------------------------------------------------------------
// On-play pipeline: location triggers, then the card's own effect.
// ---------------------------------------------------------------------------

export function onCardPlayed(g: EngineState, s: Side, c: BoardCard, li: number): void {
  const loc = g.locations[li];
  const lid = loc.def.id;
  const e = opp(s);

  g.lastPlayedBy[s] = c.def;
  g.playedHereThisTurn[s].add(li);

  // --- location on-play triggers ---
  if (lid === 'dragons' && Math.random() < 0.3) {
    destroyCard(g, li, s, c, 'burned by Dragons');
    return;
  }
  if (lid === 'mirror' && Math.random() < 0.5) {
    // Card may be on either side (spies deploy to the enemy side).
    const from = loc[s].some((x) => x.instanceId === c.instanceId) ? s : e;
    const dest = opp(from);
    loc[from] = loc[from].filter((x) => x.instanceId !== c.instanceId);
    if (loc[dest].length < capacityFor(loc)) {
      c.owner = dest;
      loc[dest].push(c);
      say(g, `Mirror flipped ${c.def.name} to the other side.`);
    } else loc[from].push(c);
  }
  if (lid === 'labyrinth' && Math.random() < 0.5) {
    c.def = CARD_BY_ID.get('0214')!; // Blobeye
    say(g, `Labyrinth transformed a card into Blobeye.`);
  }
  // Soulland: only no-ability cards can be transformed.
  if (lid === 'soulland' && c.def.kind === 'none' && Math.random() < 0.1) {
    c.def = CARD_BY_ID.get('t-monster')!;
    say(g, `Soulland transformed a card into a Monster.`);
  }

  // --- vision ---
  if (lid === 'shadowland') c.faceDown = true;
  else if (lid === 'dense-forest' && Math.random() < 0.5) c.faceDown = true;
  // Drusilla: cards played at her location stay hidden.
  if ([...loc.player, ...loc.ai].some((x) => x.def.id === '0015' && isActive(x, loc))) c.faceDown = true;

  // --- enemy on-play auras ---
  for (const x of boardAt(g, li, e)) {
    if (!isActive(x, loc)) continue;
    if (x.def.id === '0058' || x.def.id === '0144') c.bonus -= 1; // Varyena / Torturer
  }
  for (const x of boardAt(g, li, s)) {
    if (x.instanceId !== c.instanceId && isActive(x, loc) && x.def.id === '0206') c.bonus += 1; // Winged Herald
  }

  // --- Mother Lunara: next enemy card loses its ability ---
  if (g.silenceNext[s]) {
    c.silenced = true;
    g.silenceNext[s] = false;
    say(g, `${c.def.name}'s ability was removed by Mother Lunara.`);
    return;
  }

  if (!isActive(c, loc)) return;

  const times =
    c.def.kind === 'onReveal' &&
    boardAt(g, li, s).some((x) => x.instanceId !== c.instanceId && x.def.id === '0178' && isActive(x, loc))
      ? 2 // Master of Arcana
      : 1;
  for (let i = 0; i < times; i++) dispatchEffect(g, s, c, li);
}

// ---------------------------------------------------------------------------
// Per-card effect dispatch (exact powers from mechanics/powers.txt)
// ---------------------------------------------------------------------------

function enemyCards(g: EngineState, li: number, s: Side): BoardCard[] {
  return boardAt(g, li, opp(s)).filter((c) => !isProtected(g, li, opp(s), c));
}
const highest = (g: EngineState, li: number, arr: BoardCard[], s: Side) =>
  arr.reduce<BoardCard | undefined>((a, c) => (!a || cardPower(g, li, s, c) > cardPower(g, li, s, a) ? c : a), undefined);
const lowest = (g: EngineState, li: number, arr: BoardCard[], s: Side) =>
  arr.reduce<BoardCard | undefined>((a, c) => (!a || cardPower(g, li, s, c) < cardPower(g, li, s, a) ? c : a), undefined);
const nonHero = (c: BoardCard) => c.def.kind !== 'hero';

function dispatchEffect(g: EngineState, s: Side, c: BoardCard, li: number): void {
  const e = opp(s);
  const loc = g.locations[li];
  const foes = () => enemyCards(g, li, s);
  const id = c.def.id;

  // Mantis: opponent's On Reveal abilities do not trigger at its location.
  if (c.def.kind === 'onReveal' && hasAura(g, li, e, '0168')) return;

  switch (c.def.kind) {
    case 'spy': {
      // Card was already placed on the enemy side by the store.
      if (id === '0002' || id === '0068' || id === '0103') { drawCards(g, s, 1); stealFromDeck(g, s); }
      else if (id === '0061' || id === '0126') drawCards(g, s, 2);
      else if (id === '0045') { const last = g.lastPlayedBy[e]; if (last) addToHand(g, s, last); }
      else if (id === '0089') say(g, `Red Crows reveals enemy hand: ${sideState(g, e).hand.map((h) => h.def.name).join(', ') || 'empty'}`);
      break;
    }
    case 'muster': {
      const st = sideState(g, s);
      const matches = st.deck.filter((d) => d.name === c.def.name);
      st.deck = st.deck.filter((d) => d.name !== c.def.name);
      for (const d of matches) {
        if (boardAt(g, li, s).length >= capacityFor(loc)) { st.deck.push(d); continue; }
        loc[s].push(newInstance(d, s));
      }
      if (matches.length) say(g, `${c.def.name} mustered ${matches.length} more.`);
      break;
    }
    case 'medic': {
      if (id === '0063') { // Gormuth: enemy's destroyed card to your side
        const est = sideState(g, e);
        const idx = est.destroyed.length ? Math.floor(Math.random() * est.destroyed.length) : -1;
        if (idx > -1 && boardAt(g, li, s).length < capacityFor(loc)) {
          const card = est.destroyed.splice(idx, 1)[0];
          card.owner = s;
          loc[s].push(card);
          say(g, `Gormuth raised ${card.def.name} for your side.`);
        }
      } else if (id === '0099') { // Lonely Vampire: destroy one of yours to resurrect a higher-power card
        const mine = boardAt(g, li, s).filter((x) => x.instanceId !== c.instanceId && !isProtected(g, li, s, x));
        const sacrifice = lowest(g, li, mine, s);
        if (sacrifice) {
          destroyCard(g, li, s, sacrifice, 'sacrificed to Lonely Vampire');
          resurrect(g, s, li, (x) => x.def.power > sacrifice.def.power);
        }
      } else if (id === '0143') resurrect(g, s, li, (x) => x.def.faction === 'ravaria');
      else if (id === '0170') resurrect(g, s, li, nonHero, 0, true); // Conjurer → hand
      else if (id === '0191') resurrect(g, s, li, () => true, 2); // Sunk Crypt +2
      else resurrect(g, s, li, nonHero); // Pothead, Maldrith, Corvella, Hollow Wraith
      break;
    }
    case 'move': {
      if (id === '0008') { // Thaldrak: move one of your cards from another location here
        let best: { li: number; c: BoardCard } | undefined;
        for (let i = 0; i < 3; i++) {
          if (i === li) continue;
          for (const x of boardAt(g, i, s)) {
            if (!best || cardPower(g, i, s, x) > cardPower(g, best.li, s, best.c)) best = { li: i, c: x };
          }
        }
        if (best) moveCard(g, best.li, s, best.c, li);
      } else if (id === '0067') { // Swamp Vampire: move random enemy card to another location
        const t = rnd(foes());
        if (t) moveCard(g, li, e, t, rnd([0, 1, 2].filter((i) => i !== li)) ?? li);
      }
      // 0050/0123/0205 move at end of turn; 0149 Bruce moves every turn; 0083 is a trap (passive).
      break;
    }
    case 'onReveal': {
      switch (id) {
        case '0003': case '0193': { // Calystria / Void-Knight: destroy highest enemy if their total > 10
          if (sideTotal(g, li, e) > 10) { const t = highest(g, li, foes(), e); if (t) destroyCard(g, li, e, t); }
          break;
        }
        case '0007': case '0106': foes().forEach((x) => (x.bonus -= 1)); break; // Anastasia / Burner
        case '0014': // Zevrak: remove abilities from all Ongoing cards here
          [...loc.player, ...loc.ai].forEach((x) => { if (x.def.kind === 'ongoing') x.silenced = true; });
          break;
        case '0022': { // Mage Morgana: repeat On Reveal of your other cards here
          const others = boardAt(g, li, s).filter((x) => x.instanceId !== c.instanceId && x.def.kind === 'onReveal' && isActive(x, loc));
          for (const x of others) dispatchEffect(g, s, x, li);
          break;
        }
        case '0029': case '0152': case '0207': { // Nythrak / Sage / Stalker: destroy lowest enemy
          const t = lowest(g, li, foes(), e); if (t) destroyCard(g, li, e, t);
          break;
        }
        case '0051': { const t = rnd(foes()); if (t) destroyCard(g, li, e, t); break; } // Tharic
        case '0057': case '0107': drawCards(g, s, 1); break; // Ulyana / Wordkeeper
        case '0074': g.silenceNext[e] = true; break; // Mother Lunara
        case '0078': { // Elderveld Archers: strongest enemy if their total > 15
          if (sideTotal(g, li, e) > 15) { const t = highest(g, li, foes(), e); if (t) destroyCard(g, li, e, t); }
          break;
        }
        case '0080': { // Bounty Hunter: copy opponent's card played here this turn
          if (g.playedHereThisTurn[e].has(li) && g.lastPlayedBy[e]) addToHand(g, s, g.lastPlayedBy[e]!);
          break;
        }
        case '0091': { // Draelon: resurrect all destroyed 1-Power cards
          const st = sideState(g, s);
          const ones = st.destroyed.filter((x) => x.def.power === 1);
          for (const x of ones) resurrect(g, s, li, (y) => y.instanceId === x.instanceId);
          break;
        }
        case '0092': { const t = rnd(adjacent(li)); if (t !== undefined) summon(g, s, t, 't-elemental'); break; } // Runica
        case '0097': boardAt(g, li, s).forEach((x) => { if (x.def.kind === 'ongoing') x.bonus += 2; }); break; // Ashtun
        case '0105': { const t = foes().find((x) => cardPower(g, li, e, x) <= 3); if (t) destroyCard(g, li, e, t); break; } // Howler
        case '0108': summon(g, s, li, 't-beetle'); summon(g, s, li, 't-beetle'); break; // Daar
        case '0119': { // Butcher: destroy your lowest card here to draw 2
          const mine = boardAt(g, li, s).filter((x) => x.instanceId !== c.instanceId && !isProtected(g, li, s, x));
          const t = lowest(g, li, mine, s);
          if (t) { destroyCard(g, li, s, t, 'sacrificed to Butcher'); drawCards(g, s, 2); }
          break;
        }
        case '0121': { const t = foes().find((x) => cardPower(g, li, e, x) <= 4); if (t) destroyCard(g, li, e, t); break; } // Grigori
        case '0132': { // Vale: highest enemy if their total > 12
          if (sideTotal(g, li, e) > 12) { const t = highest(g, li, foes(), e); if (t) destroyCard(g, li, e, t); }
          break;
        }
        case '0137': { // Great Owl: move random enemy card to adjacent location
          const t = rnd(foes()); const dest = rnd(adjacent(li));
          if (t && dest !== undefined) moveCard(g, li, e, t, dest);
          break;
        }
        case '0140': foes().forEach((x) => (x.bonus -= 2)); break; // Freak the Exelor
        case '0154': foes().forEach((x) => (x.silenced = true)); break; // Synerva
        case '0172': { // Vulture: copy an enemy Ongoing card's text
          const t = rnd(boardAt(g, li, e).filter((x) => x.def.kind === 'ongoing'));
          if (t) { c.copiedFrom = t.def.id; say(g, `Vulture copied ${t.def.name}.`); }
          break;
        }
        case '0183': foes().filter((x) => cardPower(g, li, e, x) <= 2).forEach((x) => destroyCard(g, li, e, x)); break; // Lord Zealot
        case '0197': { // Lilith: steal 2 Power from every enemy card here
          foes().forEach((x) => { x.bonus -= 2; c.bonus += 2; });
          break;
        }
        case '0200': summon(g, s, li, 't-flame-demon'); summon(g, s, li, 't-flame-demon'); break; // Varnok
        case '0211': { // Warten: destroy a friendly card here to gain its Power
          const mine = boardAt(g, li, s).filter((x) => x.instanceId !== c.instanceId && !isProtected(g, li, s, x));
          const t = highest(g, li, mine, s);
          if (t) { c.bonus += cardPower(g, li, s, t); destroyCard(g, li, s, t, 'devoured by Warten'); }
          break;
        }
      }
      break;
    }
    case 'ongoing': {
      // Katerina: steal text from a random enemy Ongoing card here (one-time on play).
      if (id === '0043' && !c.copiedFrom) {
        const t = rnd(boardAt(g, li, e).filter((x) => x.def.kind === 'ongoing' && !x.silenced));
        if (t) { c.copiedFrom = t.def.id; t.silenced = true; say(g, `Katerina stole ${t.def.name}'s ability.`); }
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// End-of-turn hooks (called when a side clicks Next / finishes its turn)
// ---------------------------------------------------------------------------

export function endOfTurn(g: EngineState, s: Side): void {
  for (let li = 0; li < 3; li++) {
    const loc = g.locations[li];
    const lid = loc.def.id;

    for (const side of ['player', 'ai'] as Side[]) {
      // Cursed Lands / Plague: -1 Power per turn; Plague destroys at 0.
      if (lid === 'cursed-lands' || lid === 'plague') {
        const key = side === 'player' ? 'playerChaos' : 'aiChaos';
        const targets = [...loc[side], ...(loc[key] ? [loc[key]] : [])];
        for (const c of targets) {
          c.bonus -= 1;
          if (lid === 'plague' && cardPower(g, li, side, c) <= 0) destroyCard(g, li, side, c, 'claimed by Plague');
        }
      }
      for (const c of [...loc[side]]) {
        if (!isActive(c, loc)) continue;
        if (c.def.id === '0086') c.bonus += 1; // Baby Dragon
        if (c.def.id === '0149' && c.owner === side) { // Bruce the Bat
          const dest = rnd([0, 1, 2].filter((i) => i !== li));
          if (dest !== undefined) moveCard(g, li, side, c, dest);
        }
        // Once-per-game movers activate at end of their owner's turn.
        if ((c.def.id === '0050' || c.def.id === '0123' || c.def.id === '0205') && !c.moved && c.owner === side) {
          const dest = rnd(adjacent(li));
          if (dest !== undefined) { c.moved = true; moveCard(g, li, side, c, dest); }
        }
      }
    }

    // Chaos burn rolls — every chaos card ticks at the end of each turn.
    for (const side of ['player', 'ai'] as Side[]) {
      const key = side === 'player' ? 'playerChaos' : 'aiChaos';
      const ch = loc[key];
      if (!ch || ch.chaosTurnsLeft === undefined) continue;
      if (ch.chaosTurnsLeft > 0) {
        ch.chaosTurnsLeft -= 1;
        const total = Math.max(1, sideTotal(g, li, side));
        const chance = cardPower(g, li, side, ch) / total;
        if (Math.random() < chance) {
          const targets = [...loc.player, ...loc.ai].filter(
            (x) => x.instanceId !== ch.instanceId && !isProtected(g, li, x.owner, x),
          );
          const t = rnd(targets);
          if (t) destroyCard(g, li, t.owner, t, `burned by ${ch.def.name}`);
        }
      }
    }

  }
  checkLava(g);
  // Clear the OPPONENT's play markers — their plays stay visible to us (Bounty Hunter)
  // until our next turn ends.
  g.playedHereThisTurn[opp(s)].clear();
}

// ---------------------------------------------------------------------------
// Round resolution
// ---------------------------------------------------------------------------

export function locationWinner(g: EngineState, li: number): Side | 'tie' {
  if (g.locations[li].def.id === 'future') return 'tie'; // scores 0 this round
  const p = sideTotal(g, li, 'player');
  const a = sideTotal(g, li, 'ai');
  return p > a ? 'player' : a > p ? 'ai' : 'tie';
}

export function endOfRound(g: EngineState): { winners: (Side | 'tie')[]; pTotals: number[]; aTotals: number[] } {
  const winners = [0, 1, 2].map((li) => locationWinner(g, li));
  const pTotals = [0, 1, 2].map((li) => (g.locations[li].def.id === 'future' ? 0 : sideTotal(g, li, 'player')));
  const aTotals = [0, 1, 2].map((li) => (g.locations[li].def.id === 'future' ? 0 : sideTotal(g, li, 'ai')));

  for (let li = 0; li < 3; li++) {
    const loc = g.locations[li];
    const w = winners[li];
    if (loc.def.id === 'coliseum' && w !== 'tie') {
      const t = highest(g, li, loc[w], w);
      if (t) { t.bonus += cardPower(g, li, w, t); say(g, `Coliseum: ${t.def.name} doubled its Power.`); }
    }
    if (loc.def.id === 'stakes' && w !== 'tie') {
      addToHand(g, w, CARD_BY_ID.get('t-divine-dragon')!);
      say(g, `Stakes: ${w} gained a Divine Dragon.`);
    }
    if (loc.def.id === 'swamps' && w !== 'tie') {
      const loser = opp(w);
      const WEREWOLVES = ['0046', '0064', '0072', '0076', '0087', '0112'];
      for (let i = 0; i < 3; i++) addToHand(g, loser, CARD_BY_ID.get(rnd(WEREWOLVES)!)!);
      say(g, `Swamps: ${loser} gained 3 Werewolves.`);
    }
  }

  // Reveal face-down cards at round end.
  for (const { c } of allCards(g)) c.faceDown = false;
  return { winners, pTotals, aTotals };
}

/** Clear the board between rounds. Future keeps its cards. */
export function clearBoard(g: EngineState): void {
  for (const loc of g.locations) {
    if (loc.def.id === 'future') continue;
    for (const s of ['player', 'ai'] as Side[]) {
      sideState(g, s).destroyed.push(...loc[s]);
      loc[s] = [];
      const key = s === 'player' ? 'playerChaos' : 'aiChaos';
      if (loc[key]) sideState(g, s).destroyed.push(loc[key]!);
      loc[key] = null;
    }
  }
}
