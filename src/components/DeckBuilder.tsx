import { useMemo, useState } from 'react';
import { hoverTick } from '../audio';
import { CARDS, CARD_BY_ID } from '../game/cards';
import { DECK_SIZE } from '../game/effects';
import { useGameStore } from '../game/store';
import type { Faction, Rarity } from '../game/types';
import { CardView, RARITY_STYLE } from './CardView';

const FACTIONS: (Faction | 'all')[] = [
  'all', 'elarion', 'elderveld', 'kalthrone', 'hotc', 'hochreich', 'ravaria', 'varkazan', 'monster', 'unknown',
];
const RARITIES: (Rarity | 'all')[] = [
  'all', 'mortal', 'cursed', 'arcane', 'forbidden', 'mythic', 'relic', 'divine',
];

/** Rarity rank for sorting — mortal lowest, divine highest. */
const RARITY_RANK: Record<Rarity, number> = {
  mortal: 0, cursed: 1, arcane: 2, forbidden: 3, mythic: 4, relic: 5, divine: 6,
};

type SortKey = 'name' | 'power' | 'rarity' | 'faction';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'power', label: 'Power' },
  { key: 'rarity', label: 'Rarity' },
  { key: 'faction', label: 'Faction' },
];

export function DeckBuilder() {
  const builderDeck = useGameStore((s) => s.builderDeck);
  const addToDeck = useGameStore((s) => s.addToDeck);
  const removeFromDeck = useGameStore((s) => s.removeFromDeck);
  const autoFillDeck = useGameStore((s) => s.autoFillDeck);
  const clearDeck = useGameStore((s) => s.clearDeck);
  const startMatch = useGameStore((s) => s.startMatch);
  const savedDecks = useGameStore((s) => s.savedDecks);
  const saveDeck = useGameStore((s) => s.saveDeck);
  const deleteSavedDeck = useGameStore((s) => s.deleteSavedDeck);
  const loadSavedDeck = useGameStore((s) => s.loadSavedDeck);

  const [faction, setFaction] = useState<Faction | 'all'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [saveName, setSaveName] = useState('');

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of builderDeck) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [builderDeck]);

  const filtered = useMemo(() => {
    const list = CARDS.filter(
      (c) =>
        (faction === 'all' || c.faction === faction) &&
        (rarity === 'all' || c.rarity === rarity) &&
        (query === '' ||
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.text.toLowerCase().includes(query.toLowerCase())),
    );
    const dir = sortDir;
    const cmp =
      sort === 'power'
        ? (a: (typeof CARDS)[number], b: (typeof CARDS)[number]) => (a.power - b.power) * dir
        : sort === 'rarity'
          ? (a: (typeof CARDS)[number], b: (typeof CARDS)[number]) => (RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]) * dir
          : sort === 'faction'
            ? (a: (typeof CARDS)[number], b: (typeof CARDS)[number]) => a.faction.localeCompare(b.faction) * dir
            : (a: (typeof CARDS)[number], b: (typeof CARDS)[number]) => a.name.localeCompare(b.name) * dir;
    return [...list].sort(cmp);
  }, [faction, rarity, query, sort, sortDir]);

  // Remount key — replays the card-in animation on every filter/sort change.
  const gridKey = `${faction}|${rarity}|${query}|${sort}|${sortDir}`;

  const deckCards = useMemo(
    () => builderDeck.map((id) => CARD_BY_ID.get(id)!).filter(Boolean),
    [builderDeck],
  );
  const ready = builderDeck.length === DECK_SIZE;

  return (
    <div className="flex min-h-0 flex-1">
      {/* Card pool */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Filters */}
        <div className="panel-inset flex flex-wrap items-center gap-2 border-b border-[#2e2830] px-4 py-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards…"
            className="panel-inset w-40 px-2.5 py-1 font-mono text-xs text-chrome-bright outline-none placeholder:text-chrome-dark focus:border-blood"
          />
          <select
            value={faction}
            onChange={(e) => setFaction(e.target.value as Faction | 'all')}
            className="panel-inset px-2 py-1 font-mono text-xs uppercase text-chrome outline-none"
          >
            {FACTIONS.map((f) => (
              <option key={f} value={f}>{f === 'all' ? 'All factions' : f}</option>
            ))}
          </select>
          <select
            value={rarity}
            onChange={(e) => setRarity(e.target.value as Rarity | 'all')}
            className="panel-inset px-2 py-1 font-mono text-xs uppercase text-chrome outline-none"
          >
            {RARITIES.map((r) => (
              <option key={r} value={r}>{r === 'all' ? 'All rarities' : r}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="panel-inset px-2 py-1 font-mono text-xs uppercase text-chrome outline-none"
            title="Sort cards"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>Sort: {s.label}</option>
            ))}
          </select>
          <button
            onClick={() => setSortDir((d) => (d === 1 ? -1 : 1))}
            className="btn-chrome px-2 py-1 font-mono text-xs"
            title="Toggle sort direction"
          >
            {sortDir === 1 ? '↑' : '↓'}
          </button>
          <span className="ml-auto font-mono text-[11px] text-chrome-dark">{filtered.length} cards</span>
        </div>

        {/* Grid */}
        {/* content-start: without it, a single result row stretches to fill the grid height */}
        <div
          key={gridKey}
          className="deck-grid grid min-h-0 flex-1 content-start grid-cols-[repeat(auto-fill,minmax(8.75rem,1fr))] gap-3 overflow-y-auto p-4"
        >
          {filtered.map((c, i) => {
            const n = counts.get(c.id) ?? 0;
            const maxed = n >= 3 || builderDeck.length >= DECK_SIZE;
            return (
              <div
                key={c.id}
                className="anim-db-card relative"
                style={{ animationDelay: `${Math.min(i, 24) * 22}ms` }}
                onMouseEnter={hoverTick}
              >
                <CardView
                  card={c}
                  size="hand"
                  disabled={false}
                  onClick={() => addToDeck(c.id)}
                />
                {n > 0 && (
                  <span className="power-coin absolute right-1 top-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-black">
                    ×{n}
                  </span>
                )}
                <button
                  onClick={() => addToDeck(c.id)}
                  disabled={maxed}
                  className="btn-neon absolute bottom-1 left-1 z-10 flex h-5 w-5 items-center justify-center rounded-full text-xs font-black disabled:opacity-30"
                  title="Add to deck"
                >
                  +
                </button>
                {n > 0 && (
                  <button
                    onClick={() => removeFromDeck(c.id)}
                    className="btn-blood absolute bottom-1 right-8 z-10 flex h-5 w-5 items-center justify-center rounded-full text-xs font-black"
                    title="Remove from deck"
                  >
                    −
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Deck panel */}
      <aside className="iron-panel deck-panel flex w-56 shrink-0 flex-col border-l-2 border-[#3a2e33]">
        <div className="border-b border-[#3a2e33] px-3 py-2">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-chrome">Your deck</span>
            <span className={`font-mono text-sm font-bold ${ready ? 'text-blood-neon' : 'text-chrome-bright'}`}>
              {builderDeck.length}/{DECK_SIZE}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden bg-black/70 shadow-inner">
            <div
              className="h-full bg-blood-neon shadow-[0_0_8px_rgba(255,42,60,0.7)] transition-all"
              style={{ width: `${(builderDeck.length / DECK_SIZE) * 100}%` }}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {[...counts.entries()].map(([id, n]) => {
            const c = CARD_BY_ID.get(id)!;
            const r = RARITY_STYLE[c.rarity];
            return (
              <button
                key={id}
                onClick={() => removeFromDeck(id)}
                className="panel-inset flex w-full items-center gap-2 px-2 py-1 text-left hover:border-blood/60"
                title="Remove one"
              >
                <span className={`power-coin flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-black ${r.border}`}>
                  {c.power}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-chrome-bright/90">{c.name}</span>
                <span className={`font-mono text-[9px] uppercase ${r.text}`}>×{n}</span>
              </button>
            );
          })}
          {deckCards.length === 0 && (
            <p className="px-2 pt-4 text-center font-mono text-[11px] text-chrome-dark">
              Click cards to add them. Build exactly {DECK_SIZE}.
            </p>
          )}
        </div>

        {/* Saved decks */}
        <div className="space-y-1.5 border-t border-[#3a2e33] p-2">
          <div className="flex gap-1.5">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Deck name…"
              className="panel-inset min-w-0 flex-1 px-2 py-1 font-mono text-[11px] text-chrome-bright outline-none placeholder:text-chrome-dark focus:border-blood"
            />
            <button
              onClick={() => {
                saveDeck(saveName);
                setSaveName('');
              }}
              disabled={!saveName.trim() || builderDeck.length === 0}
              className="btn-chrome px-2 py-1 font-mono text-[11px] uppercase tracking-wider disabled:opacity-30"
            >
              Save
            </button>
          </div>
          {Object.keys(savedDecks).length > 0 && (
            <div className="max-h-24 space-y-1 overflow-y-auto">
              {Object.entries(savedDecks).map(([name, ids]) => (
                <div key={name} className="panel-inset flex items-center gap-1 px-1.5 py-1">
                  <button
                    onClick={() => loadSavedDeck(name)}
                    className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-chrome-bright/90 hover:text-blood-neon"
                    title={`Load “${name}” (${ids.length} cards)`}
                  >
                    {name}
                    <span className="ml-1 text-chrome-dark">{ids.length}</span>
                  </button>
                  <button
                    onClick={() => deleteSavedDeck(name)}
                    className="btn-blood flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-black"
                    title={`Delete “${name}”`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5 border-t border-[#3a2e33] p-2">
          <div className="flex gap-1.5">
            <button
              onClick={autoFillDeck}
              className="btn-chrome flex-1 py-1.5 font-mono text-[11px] uppercase tracking-wider"
            >
              Auto-fill
            </button>
            <button
              onClick={clearDeck}
              className="btn-chrome flex-1 py-1.5 font-mono text-[11px] uppercase tracking-wider"
            >
              Clear
            </button>
          </div>
          <button
            onClick={startMatch}
            disabled={!ready}
            className="btn-neon w-full py-2.5 font-mono text-sm uppercase tracking-widest"
          >
            {ready ? 'Start Match' : `Need ${DECK_SIZE - builderDeck.length} more`}
          </button>
        </div>
      </aside>
    </div>
  );
}
