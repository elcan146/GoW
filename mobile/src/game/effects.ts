import { CARD_BY_ID, CARDS } from './cards';
import { MAX_CARDS_PER_SIDE } from './locations';
import type {
  BoardCard,
  CardDef,
  EffectDef,
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

/** The effect a board card currently provides (handles copied/stolen effects). */
const effOf = (c: BoardCard): EffectDef | undefined =>
  (c.copiedFrom ? CARD_BY_ID.get(c.copiedFrom) : c.def)?.effect;

const hasEffect = (g: EngineState, li: number, s: Side, type: EffectDef['type']): boolean =>
  boardAt(g, li, s).some((c) => isActive(c, g.locations[li]) && effOf(c)?.type === type);

/** Aura types that only affect cards at the aura's own location (doubleAuras re-applies these). */
const HERE_AURAS = new Set<EffectDef['type']>([
  'auraAllHere', 'auraFriendlyHere', 'auraFactionHere', 'auraKindHere',
]);

/** Cards at a location protected from destruction. */
export function isProtected(g: EngineState, li: number, s: Side, c: BoardCard): boolean {
  const loc = g.locations[li];
  if (loc.def.id === 'heaven') return true;
  if (c.def.kind === 'hero' || effOf(c)?.type === 'hero') return true;
  if (effOf(c)?.type === 'protect') return false; // protectors shield others, not themselves
  return boardAt(g, li, s).some(
    (x) => x.instanceId !== c.instanceId && isActive(x, loc) && effOf(x)?.type === 'protect',
  );
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
    const eff = effOf(aura);
    if (!eff) continue;
    const sameLoc = al === li;
    const adj = adjacent(al).includes(li);
    const mine = as === s;
    const amt = eff.amount ?? 0;
    let applied = 0;
    switch (eff.type) {
      case 'auraAllHere':        if (sameLoc) applied = amt; break;
      case 'auraFriendlyHere':   if (sameLoc && mine) applied = amt; break;
      case 'auraFactionHere':    if (sameLoc && c.def.faction === eff.faction) applied = amt; break;
      case 'auraKindHere':       if (sameLoc && mine && c.def.kind === eff.kind) applied = amt; break;
      case 'auraFactionGlobal':  if ((eff.scope === 'all' || mine) && c.def.faction === eff.faction) applied = amt; break;
      case 'auraKindGlobal':     if (mine && c.def.kind === eff.kind) applied = amt; break;
      case 'auraNameMatch':      if (mine && eff.namePattern && new RegExp(eff.namePattern, 'i').test(c.def.name)) applied = amt; break;
      case 'auraAdjacent':       if (adj && mine) applied = amt; break;
    }
    p += applied;
    // doubleAuras: the owner's other Ongoing auras at its location apply twice.
    if (applied && HERE_AURAS.has(eff.type) && sameLoc && mine && aura.def.kind === 'ongoing' &&
        boardAt(g, al, as).some((x) => x.instanceId !== aura.instanceId && isActive(x, g.locations[al]) && effOf(x)?.type === 'doubleAuras')) {
      p += applied;
    }
  }

  // --- self-scaling ongoings ---
  if (active) {
    const eff = effOf(c);
    if (eff?.type === 'selfPerHand') p += (eff.amount ?? 1) * sideState(g, s).hand.length;
    if (eff?.type === 'selfPerFaction') {
      const facs = new Set([...loc.player, ...loc.ai].map((x) => x.def.faction));
      p += (eff.amount ?? 1) * facs.size;
    }
    if (c.def.kind === 'factionBond') {
      const bondFac = eff?.type === 'factionBond' && eff.faction ? eff.faction : c.def.faction;
      if ([...loc.player, ...loc.ai].some((x) => x.instanceId !== c.instanceId && x.def.faction === bondFac)) {
        p *= 2;
      }
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
    // buffDrawn / buffHand auras: cards you draw gain bonus Power.
    let bonus = 0;
    for (let li = 0; li < 3; li++) {
      for (const x of boardAt(g, li, s)) {
        if (!isActive(x, g.locations[li])) continue;
        const eff = effOf(x);
        if (eff?.type === 'buffDrawn' || eff?.type === 'buffHand') bonus += eff.amount ?? 1;
      }
    }
    st.hand.push({ def, bonus });
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
  // trapOnEnemyMove: an enemy card moving here is destroyed.
  const trap = boardAt(g, toLi, opp(s)).find(
    (x) => isActive(x, to) && effOf(x)?.type === 'trapOnEnemyMove',
  );
  if (trap) destroyCard(g, toLi, s, c, `snared by ${trap.def.name}`);
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
  // hideCards: cards played at that location stay hidden.
  if ([...loc.player, ...loc.ai].some((x) => isActive(x, loc) && effOf(x)?.type === 'hideCards')) c.faceDown = true;

  // --- on-play auras ---
  for (const x of boardAt(g, li, e)) {
    if (!isActive(x, loc)) continue;
    const eff = effOf(x);
    if (eff?.type === 'debuffOnEnemyPlay') c.bonus -= eff.amount ?? 1;
  }
  for (const x of boardAt(g, li, s)) {
    if (x.instanceId === c.instanceId || !isActive(x, loc)) continue;
    const eff = effOf(x);
    if (eff?.type === 'buffOnFriendlyPlay') c.bonus += eff.amount ?? 1;
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
    boardAt(g, li, s).some((x) => x.instanceId !== c.instanceId && isActive(x, loc) && effOf(x)?.type === 'doubleOnReveal')
      ? 2
      : 1;
  for (let i = 0; i < times; i++) dispatchEffect(g, s, c, li);
}

// ---------------------------------------------------------------------------
// Per-card effect dispatch — data-driven via CardDef.effect (data/cards.json)
// ---------------------------------------------------------------------------

function enemyCards(g: EngineState, li: number, s: Side): BoardCard[] {
  return boardAt(g, li, opp(s)).filter((c) => !isProtected(g, li, opp(s), c));
}
const highest = (g: EngineState, li: number, arr: BoardCard[], s: Side) =>
  arr.reduce<BoardCard | undefined>((a, c) => (!a || cardPower(g, li, s, c) > cardPower(g, li, s, a) ? c : a), undefined);
const lowest = (g: EngineState, li: number, arr: BoardCard[], s: Side) =>
  arr.reduce<BoardCard | undefined>((a, c) => (!a || cardPower(g, li, s, c) < cardPower(g, li, s, a) ? c : a), undefined);

function dispatchEffect(g: EngineState, s: Side, c: BoardCard, li: number): void {
  const e = opp(s);
  const loc = g.locations[li];
  const foes = () => enemyCards(g, li, s);
  const eff = c.def.effect;
  if (!eff) return;

  // blockEnemyOnReveal: opponent's On Reveal abilities do not trigger here.
  if (c.def.kind === 'onReveal' && hasEffect(g, li, e, 'blockEnemyOnReveal')) return;

  const mineHere = () =>
    boardAt(g, li, s).filter((x) => x.instanceId !== c.instanceId && !isProtected(g, li, s, x));

  switch (eff.type) {
    // ------------------------------------------------------------- spy
    case 'spyDrawSteal':
      drawCards(g, s, eff.count ?? 1);
      stealFromDeck(g, s);
      break;
    case 'spyDraw':
      drawCards(g, s, eff.count ?? 1);
      break;
    case 'spyCopyLast': {
      const last = g.lastPlayedBy[e];
      if (last) addToHand(g, s, last);
      break;
    }
    case 'spyRevealHand':
      say(g, `${c.def.name} reveals enemy hand: ${sideState(g, e).hand.map((h) => h.def.name).join(', ') || 'empty'}`);
      break;

    // ------------------------------------------------------------- muster
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

    // ------------------------------------------------------------- medic
    case 'resurrect': {
      const filter = (x: BoardCard) =>
        (eff.includeHeroes || x.def.kind !== 'hero') &&
        (!eff.faction || x.def.faction === eff.faction);
      resurrect(g, s, li, filter, eff.amount ?? 0, eff.toHand ?? false);
      break;
    }
    case 'resurrectEnemy': {
      const est = sideState(g, e);
      const idx = est.destroyed.length ? Math.floor(Math.random() * est.destroyed.length) : -1;
      if (idx > -1 && boardAt(g, li, s).length < capacityFor(loc)) {
        const card = est.destroyed.splice(idx, 1)[0];
        card.owner = s;
        loc[s].push(card);
        say(g, `${c.def.name} raised ${card.def.name} for your side.`);
      }
      break;
    }
    case 'sacrificeResurrect': {
      const sacrifice = lowest(g, li, mineHere(), s);
      if (sacrifice) {
        destroyCard(g, li, s, sacrifice, `sacrificed to ${c.def.name}`);
        resurrect(g, s, li, (x) => x.def.power > sacrifice.def.power);
      }
      break;
    }

    // ------------------------------------------------------------- move
    case 'pullFriendly': {
      let best: { li: number; c: BoardCard } | undefined;
      for (let i = 0; i < 3; i++) {
        if (i === li) continue;
        for (const x of boardAt(g, i, s)) {
          if (!best || cardPower(g, i, s, x) > cardPower(g, best.li, s, best.c)) best = { li: i, c: x };
        }
      }
      if (best) moveCard(g, best.li, s, best.c, li);
      break;
    }
    case 'moveRandomEnemy': {
      const t = rnd(foes());
      if (t) moveCard(g, li, e, t, rnd([0, 1, 2].filter((i) => i !== li)) ?? li);
      break;
    }
    // moveOnceAdjacent / moveRandomEachTurn / trapOnEnemyMove are passive —
    // handled in endOfTurn / moveCard.

    // ------------------------------------------------------------- on reveal
    case 'destroyHighestIfTotal': {
      if (sideTotal(g, li, e) > (eff.threshold ?? 10)) {
        const t = highest(g, li, foes(), e);
        if (t) destroyCard(g, li, e, t);
      }
      break;
    }
    case 'debuffAllEnemies':
      foes().forEach((x) => (x.bonus -= eff.amount ?? 1));
      break;
    case 'silenceOngoingHere':
      [...loc.player, ...loc.ai].forEach((x) => { if (x.def.kind === 'ongoing') x.silenced = true; });
      break;
    case 'repeatOnReveal': {
      const others = boardAt(g, li, s).filter(
        (x) => x.instanceId !== c.instanceId && x.def.kind === 'onReveal' && isActive(x, loc),
      );
      for (const x of others) dispatchEffect(g, s, x, li);
      break;
    }
    case 'destroyLowest': {
      const t = lowest(g, li, foes(), e);
      if (t) destroyCard(g, li, e, t);
      break;
    }
    case 'destroyRandom': {
      const t = rnd(foes());
      if (t) destroyCard(g, li, e, t);
      break;
    }
    case 'draw':
      drawCards(g, s, eff.count ?? 1);
      break;
    case 'silenceNext':
      g.silenceNext[e] = true;
      break;
    case 'copyEnemyPlayedHere':
      if (g.playedHereThisTurn[e].has(li) && g.lastPlayedBy[e]) addToHand(g, s, g.lastPlayedBy[e]!);
      break;
    case 'resurrectAll': {
      const st = sideState(g, s);
      const matches = st.destroyed.filter((x) => x.def.power <= (eff.maxPower ?? 1));
      for (const x of matches) resurrect(g, s, li, (y) => y.instanceId === x.instanceId);
      break;
    }
    case 'summon': {
      const n = eff.count ?? 1;
      if (eff.target === 'adjacent') {
        for (let i = 0; i < n; i++) {
          const t = rnd(adjacent(li));
          if (t !== undefined && eff.token) summon(g, s, t, eff.token);
        }
      } else if (eff.token) {
        for (let i = 0; i < n; i++) summon(g, s, li, eff.token);
      }
      break;
    }
    case 'buffKindHere':
      boardAt(g, li, s).forEach((x) => { if (x.def.kind === eff.kind) x.bonus += eff.amount ?? 1; });
      break;
    case 'destroyBelow': {
      const max = eff.maxPower ?? 3;
      if (eff.all) {
        foes().filter((x) => cardPower(g, li, e, x) <= max).forEach((x) => destroyCard(g, li, e, x));
      } else {
        const t = foes().find((x) => cardPower(g, li, e, x) <= max);
        if (t) destroyCard(g, li, e, t);
      }
      break;
    }
    case 'sacrificeLowestDraw': {
      const t = lowest(g, li, mineHere(), s);
      if (t) {
        destroyCard(g, li, s, t, `sacrificed to ${c.def.name}`);
        drawCards(g, s, eff.count ?? 2);
      }
      break;
    }
    case 'moveRandomEnemyAdjacent': {
      const t = rnd(foes());
      const dest = rnd(adjacent(li));
      if (t && dest !== undefined) moveCard(g, li, e, t, dest);
      break;
    }
    case 'silenceAllEnemies':
      foes().forEach((x) => (x.silenced = true));
      break;
    case 'copyOngoing': {
      const t = rnd(boardAt(g, li, e).filter((x) => x.def.kind === 'ongoing'));
      if (t) { c.copiedFrom = t.def.id; say(g, `${c.def.name} copied ${t.def.name}.`); }
      break;
    }
    case 'stealOngoing': {
      if (!c.copiedFrom) {
        const t = rnd(boardAt(g, li, e).filter((x) => x.def.kind === 'ongoing' && !x.silenced));
        if (t) { c.copiedFrom = t.def.id; t.silenced = true; say(g, `${c.def.name} stole ${t.def.name}'s ability.`); }
      }
      break;
    }
    case 'stealPowerAll':
      foes().forEach((x) => { x.bonus -= eff.amount ?? 1; c.bonus += eff.amount ?? 1; });
      break;
    case 'devour': {
      const t = highest(g, li, mineHere(), s);
      if (t) {
        c.bonus += cardPower(g, li, s, t);
        destroyCard(g, li, s, t, `devoured by ${c.def.name}`);
      }
      break;
    }

    // ------------------------------------------------------------- ongoing on-play
    case 'buffHand':
      sideState(g, s).hand.forEach((h) => (h.bonus += eff.amount ?? 1));
      break;
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
        const eff = effOf(c);
        if (eff?.type === 'growPerTurn') c.bonus += eff.amount ?? 1;
        if (eff?.type === 'moveRandomEachTurn' && c.owner === side) {
          const dest = rnd([0, 1, 2].filter((i) => i !== li));
          if (dest !== undefined) moveCard(g, li, side, c, dest);
        }
        // Once-per-game movers activate at end of their owner's turn.
        if (eff?.type === 'moveOnceAdjacent' && !c.moved && c.owner === side) {
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
      const wolves = CARDS.filter((x) => x.name === 'Werewolf');
      for (let i = 0; i < 3 && wolves.length; i++) addToHand(g, loser, rnd(wolves)!);
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
