// One-off migration: builds data/cards.json from the current generated
// src/game/cards.ts + src/game/backgrounds.ts, attaching the data-driven
// `effect` object that reproduces today's hardcoded effects.ts behavior.
//
// Run once:  node scripts/extract-cards.mjs
// Afterwards cards.json is the source of truth — edit it directly or via
// scripts/card_editor.py, then regenerate with scripts/gen-cards.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cardsTs = readFileSync(join(root, 'src/game/cards.ts'), 'utf8');
const bgTs = readFileSync(join(root, 'src/game/backgrounds.ts'), 'utf8');

const unesc = (s) => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');

// --- parse cards.ts entries -------------------------------------------------
const CARD_RE =
  /\{ id: '([^']+)', name: '((?:[^'\\]|\\.)*)', power: (\d+), faction: '(\w+)', rarity: '(\w+)', kind: '(\w+)', text: '((?:[^'\\]|\\.)*)', art: '([^']+)'(, token: true)? \}/g;

const cards = [];
for (const m of cardsTs.matchAll(CARD_RE)) {
  cards.push({
    id: m[1],
    name: unesc(m[2]),
    power: +m[3],
    faction: m[4],
    rarity: m[5],
    kind: m[6],
    text: unesc(m[7]),
    art: m[8],
    token: !!m[9],
  });
}

// --- parse backgrounds.ts ----------------------------------------------------
const backgrounds = {};
for (const m of bgTs.matchAll(/'(\d{4})':\s*"((?:[^"\\]|\\.)*)"/g)) {
  backgrounds[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\n/g, '\n');
}

// --- effect map: reproduces the hardcoded logic in src/game/effects.ts -------
const E = {
  // ongoing auras
  '0033': { type: 'auraAllHere', amount: 1 },
  '0101': { type: 'auraAllHere', amount: 1 },
  '0131': { type: 'auraFriendlyHere', amount: 1 },
  '0011': { type: 'auraFactionHere', faction: 'elarion', amount: 2 },
  '0134': { type: 'auraFactionHere', faction: 'varkazan', amount: 2 },
  '0048': { type: 'auraKindHere', kind: 'none', amount: 2 },
  '0049': { type: 'auraKindHere', kind: 'ongoing', amount: 2 },
  '0095': { type: 'auraFactionGlobal', faction: 'hotc', scope: 'mine', amount: 2 },
  '0069': { type: 'auraFactionGlobal', faction: 'elarion', scope: 'all', amount: 1 },
  '0100': { type: 'auraKindGlobal', kind: 'none', amount: 3 },
  '0210': { type: 'auraNameMatch', namePattern: 'clockwork|golem|automaton|construct|clock', amount: 2 },
  '0009': { type: 'auraAdjacent', amount: 1 },
  '0188': { type: 'auraAdjacent', amount: 2 },
  '0016': { type: 'doubleAuras' },
  '0062': { type: 'selfPerHand', amount: 1 },
  '0094': { type: 'selfPerHand', amount: 1 },
  '0102': { type: 'selfPerHand', amount: 1 },
  '0088': { type: 'selfPerFaction', amount: 1 },
  '0023': { type: 'protect' },
  '0179': { type: 'protect' },
  '0015': { type: 'hideCards' },
  '0058': { type: 'debuffOnEnemyPlay', amount: 1 },
  '0144': { type: 'debuffOnEnemyPlay', amount: 1 },
  '0206': { type: 'buffOnFriendlyPlay', amount: 1 },
  '0168': { type: 'blockEnemyOnReveal' },
  '0178': { type: 'doubleOnReveal' },
  '0111': { type: 'buffDrawn', amount: 1 },
  '0199': { type: 'buffHand', amount: 1 },
  '0043': { type: 'stealOngoing' },
  // end-of-turn
  '0086': { type: 'growPerTurn', amount: 1 },
  '0149': { type: 'moveRandomEachTurn' },
  '0050': { type: 'moveOnceAdjacent' },
  '0123': { type: 'moveOnceAdjacent' },
  '0205': { type: 'moveOnceAdjacent' },
  // move kind
  '0008': { type: 'pullFriendly' },
  '0067': { type: 'moveRandomEnemy' },
  '0083': { type: 'trapOnEnemyMove' },
  // spy
  '0002': { type: 'spyDrawSteal', count: 1 },
  '0068': { type: 'spyDrawSteal', count: 1 },
  '0103': { type: 'spyDrawSteal', count: 1 },
  '0061': { type: 'spyDraw', count: 2 },
  '0126': { type: 'spyDraw', count: 2 },
  '0045': { type: 'spyCopyLast' },
  '0089': { type: 'spyRevealHand' },
  // medic
  '0063': { type: 'resurrectEnemy' },
  '0099': { type: 'sacrificeResurrect' },
  '0143': { type: 'resurrect', faction: 'ravaria' },
  '0170': { type: 'resurrect', toHand: true },
  '0191': { type: 'resurrect', amount: 2, includeHeroes: true },
  '0004': { type: 'resurrect' },
  '0032': { type: 'resurrect' },
  '0052': { type: 'resurrect' },
  '0124': { type: 'resurrect' },
  // on reveal
  '0003': { type: 'destroyHighestIfTotal', threshold: 10 },
  '0193': { type: 'destroyHighestIfTotal', threshold: 10 },
  '0078': { type: 'destroyHighestIfTotal', threshold: 15 },
  '0132': { type: 'destroyHighestIfTotal', threshold: 12 },
  '0007': { type: 'debuffAllEnemies', amount: 1 },
  '0106': { type: 'debuffAllEnemies', amount: 1 },
  '0140': { type: 'debuffAllEnemies', amount: 2 },
  '0014': { type: 'silenceOngoingHere' },
  '0022': { type: 'repeatOnReveal' },
  '0029': { type: 'destroyLowest' },
  '0152': { type: 'destroyLowest' },
  '0207': { type: 'destroyLowest' },
  '0051': { type: 'destroyRandom' },
  '0057': { type: 'draw', count: 1 },
  '0107': { type: 'draw', count: 1 },
  '0074': { type: 'silenceNext' },
  '0080': { type: 'copyEnemyPlayedHere' },
  '0091': { type: 'resurrectAll', maxPower: 1 },
  '0092': { type: 'summon', token: 't-elemental', count: 1, target: 'adjacent' },
  '0097': { type: 'buffKindHere', kind: 'ongoing', amount: 2 },
  '0105': { type: 'destroyBelow', maxPower: 3 },
  '0121': { type: 'destroyBelow', maxPower: 4 },
  '0183': { type: 'destroyBelow', maxPower: 2, all: true },
  '0108': { type: 'summon', token: 't-beetle', count: 2 },
  '0200': { type: 'summon', token: 't-flame-demon', count: 2 },
  '0119': { type: 'sacrificeLowestDraw', count: 2 },
  '0137': { type: 'moveRandomEnemyAdjacent' },
  '0154': { type: 'silenceAllEnemies' },
  '0172': { type: 'copyOngoing' },
  '0197': { type: 'stealPowerAll', amount: 2 },
  '0211': { type: 'devour' },
};

const MUSTER = new Set(['0013', '0019', '0031', '0037', '0042', '0046', '0055', '0064', '0071', '0072', '0076', '0087', '0112']);
const HERO = new Set(['0153', '0184', '0190']);

function effectFor(c) {
  if (E[c.id]) return E[c.id];
  if (c.kind === 'chaos') {
    const turns = +(c.text.match(/\((\d+)\s*turn/)?.[1] ?? 1);
    return { type: 'chaos', turns };
  }
  if (MUSTER.has(c.id) || c.kind === 'muster') return { type: 'muster' };
  if (HERO.has(c.id) || c.kind === 'hero') return { type: 'hero' };
  if (c.kind === 'factionBond') return { type: 'factionBond' };
  return { type: 'none' };
}

// --- emit --------------------------------------------------------------------
const out = { cards: [], tokens: [] };
const unmapped = [];
for (const c of cards) {
  const effect = effectFor(c);
  if (!c.token && c.kind !== 'none' && effect.type === 'none') unmapped.push(c.id);
  const entry = {
    id: c.id,
    name: c.name,
    power: c.power,
    faction: c.faction,
    rarity: c.rarity,
    kind: c.kind,
    text: c.text,
    art: c.art,
    effect,
  };
  if (!c.token) entry.background = backgrounds[c.id] ?? '';
  if (c.token) entry.token = true;
  (c.token ? out.tokens : out.cards).push(entry);
}

mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'data/cards.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`cards.json: ${out.cards.length} cards + ${out.tokens.length} tokens`);
const missingBg = out.cards.filter((c) => !c.background).map((c) => c.id);
if (missingBg.length) console.log('missing background:', missingBg.join(', '));
if (unmapped.length) console.log('WARNING unmapped ability kinds:', unmapped.join(', '));
