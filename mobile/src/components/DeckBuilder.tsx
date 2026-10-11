import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { sfx } from '../audio';
import { CARDS, CARD_BY_ID } from '../game/cards';
import { DECK_SIZE } from '../game/effects';
import { useGameStore } from '../game/store';
import type { CardDef, Faction, Rarity } from '../game/types';
import { colors, RARITY_COLOR, ui } from '../theme';
import { CardView, CARD_SIZES } from './CardView';
import { MusicPlayer } from './MusicPlayer';
import { Pager, type PagerHandle } from './Pager';

const FACTIONS: Faction[] = [
  'elderveld',
  'ravaria',
  'hochreich',
  'varkazan',
  'kalthrone',
  'elarion',
  'hotc',
  'monster',
  'unknown',
];

const RARITIES: Rarity[] = [
  'mortal',
  'cursed',
  'arcane',
  'forbidden',
  'mythic',
  'relic',
  'divine',
];

const SORTS = [
  { id: 'power', label: 'Power' },
  { id: 'name', label: 'Name' },
  { id: 'faction', label: 'Faction' },
  { id: 'rarity', label: 'Rarity' },
] as const;

type SortId = (typeof SORTS)[number]['id'];
const RARITY_ORDER: Rarity[] = ['mortal', 'cursed', 'arcane', 'forbidden', 'relic', 'mythic', 'divine'];
const MAX_COPIES = 3; // mirrors store.ts
const GRID_COLS = 4;

function Chip({
  label,
  active,
  color,
  onPress,
  onLongPress,
}: {
  label: string;
  active?: boolean;
  color?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.chip,
        active && { borderColor: color ?? colors.bloodNeon, backgroundColor: 'rgba(42,6,11,0.6)' },
      ]}
    >
      <Text style={[styles.chipText, active && { color: color ?? colors.bloodNeon }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Middle page — the card pool with filters. */
function CardPool() {
  const builderDeck = useGameStore((s) => s.builderDeck);
  const addToDeck = useGameStore((s) => s.addToDeck);
  const inspectCard = useGameStore((s) => s.inspectCard);

  const [query, setQuery] = useState('');
  const [faction, setFaction] = useState<Faction | 'all'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [sort, setSort] = useState<SortId>('power');

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of builderDeck) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [builderDeck]);

  const filtered = useMemo(() => {
    let list = CARDS;
    if (faction !== 'all') list = list.filter((c) => c.faction === faction);
    if (rarity !== 'all') list = list.filter((c) => c.rarity === rarity);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.text.toLowerCase().includes(q));
    const sorted = [...list];
    if (sort === 'power') sorted.sort((a, b) => b.power - a.power);
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'faction') sorted.sort((a, b) => a.faction.localeCompare(b.faction) || b.power - a.power);
    else sorted.sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || b.power - a.power);
    return sorted;
  }, [query, faction, rarity, sort]);

  const renderCard = ({ item }: { item: CardDef }) => {
    const n = counts.get(item.id) ?? 0;
    const maxed = n >= MAX_COPIES || builderDeck.length >= DECK_SIZE;
    return (
      <View style={styles.cell}>
        <CardView
          card={item}
          size="grid"
          onPress={() => {
            if (!maxed) {
              sfx('ui-click');
              addToDeck(item.id);
            }
          }}
          onLongPress={() => inspectCard(item, 0)}
        />
        {n > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>×{n}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.page}>
      <View style={styles.filters}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search…"
          placeholderTextColor={colors.chromeDark}
          style={styles.search}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {SORTS.map((s) => (
            <Chip key={s.id} label={`⇅ ${s.label}`} active={sort === s.id} onPress={() => setSort(s.id)} />
          ))}
        </ScrollView>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={styles.chipStrip}>
        <Chip label="All" active={faction === 'all'} onPress={() => setFaction('all')} />
        {FACTIONS.map((f) => (
          <Chip key={f} label={f} active={faction === f} onPress={() => setFaction(f)} />
        ))}
        <View style={styles.chipSep} />
        <Chip label="Any ★" active={rarity === 'all'} onPress={() => setRarity('all')} />
        {RARITIES.map((r) => (
          <Chip
            key={r}
            label={r}
            active={rarity === r}
            color={RARITY_COLOR[r]}
            onPress={() => setRarity(r)}
          />
        ))}
      </ScrollView>
      <FlatList
        data={filtered}
        renderItem={renderCard}
        keyExtractor={(c) => c.id}
        numColumns={GRID_COLS}
        style={styles.list}
        contentContainerStyle={styles.grid}
        initialNumToRender={GRID_COLS * 4}
        windowSize={5}
      />
    </View>
  );
}

/** Right page — the current deck as a card grid + save/load controls. */
function DeckPage() {
  const builderDeck = useGameStore((s) => s.builderDeck);
  const inspectCard = useGameStore((s) => s.inspectCard);
  const savedDecks = useGameStore((s) => s.savedDecks);
  const removeFromDeck = useGameStore((s) => s.removeFromDeck);
  const saveDeck = useGameStore((s) => s.saveDeck);
  const loadSavedDeck = useGameStore((s) => s.loadSavedDeck);
  const deleteSavedDeck = useGameStore((s) => s.deleteSavedDeck);
  const [deckName, setDeckName] = useState('');

  const deckCards = useMemo(
    () => builderDeck.map((id) => CARD_BY_ID.get(id)!).filter(Boolean),
    [builderDeck],
  );

  return (
    <View style={styles.page}>
      <View style={styles.deckHeader}>
        <Text style={styles.deckTitle}>Your deck</Text>
        <Text style={styles.deckCount}>
          {builderDeck.length}/{DECK_SIZE}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[styles.progressFill, { width: `${(builderDeck.length / DECK_SIZE) * 100}%` }]}
        />
      </View>

      <FlatList
        data={deckCards}
        keyExtractor={(c, i) => `${c.id}-${i}`}
        numColumns={GRID_COLS}
        style={styles.list}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <CardView
              card={item}
              size="grid"
              onPress={() => {
                sfx('ui-click');
                removeFromDeck(item.id);
              }}
              onLongPress={() => inspectCard(item, 0)}
            />
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.deckEmpty}>
            Deck is empty — tap cards in the pool to add them.
          </Text>
        }
      />

      <View style={styles.saveRow}>
        <TextInput
          value={deckName}
          onChangeText={setDeckName}
          placeholder="Deck name…"
          placeholderTextColor={colors.chromeDark}
          style={styles.nameInput}
        />
        <TouchableOpacity
          onPress={() => {
            if (deckName.trim()) {
              sfx('ui-click');
              saveDeck(deckName.trim());
              setDeckName('');
            }
          }}
          style={ui.btnChrome}
        >
          <Text style={ui.btnText}>Save</Text>
        </TouchableOpacity>
      </View>
      {Object.keys(savedDecks).length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {Object.keys(savedDecks).map((name) => (
            <Chip
              key={name}
              label={name}
              onPress={() => {
                sfx('ui-click');
                loadSavedDeck(name);
              }}
              onLongPress={() => deleteSavedDeck(name)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** Deck builder — MusicPlayer ‹ CardPool ‹ Deck pages. */
export function DeckBuilder() {
  const builderDeck = useGameStore((s) => s.builderDeck);
  const autoFillDeck = useGameStore((s) => s.autoFillDeck);
  const clearDeck = useGameStore((s) => s.clearDeck);
  const startMatch = useGameStore((s) => s.startMatch);
  const pagerRef = useRef<PagerHandle>(null);

  const ready = builderDeck.length === DECK_SIZE;

  return (
    <View style={styles.root}>
      <Pager
        ref={pagerRef}
        initialPage={1}
        pages={[<MusicPlayer key="m" />, <CardPool key="p" />, <DeckPage key="d" />]}
      />

      {/* Bottom action bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity onPress={() => pagerRef.current?.scrollToPage(2)} style={ui.btnChrome}>
          <Text style={[ui.btnText, ready && { color: '#34d399' }]}>
            {builderDeck.length}/{DECK_SIZE}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { sfx('ui-click'); autoFillDeck(); }} style={ui.btnChrome}>
          <Text style={ui.btnText}>Auto</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { sfx('ui-click'); clearDeck(); }} style={ui.btnChrome}>
          <Text style={ui.btnText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={!ready}
          onPress={() => {
            sfx('ui-click');
            startMatch();
          }}
          style={[ui.btnNeon, styles.startBtn, !ready && { opacity: 0.4 }]}
        >
          <Text style={[ui.btnText, ui.btnTextNeon]}>
            {ready ? 'Start Match' : `Need ${DECK_SIZE - builderDeck.length}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { flex: 1, minHeight: 0 },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  search: {
    width: 110,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.chromeBright,
    fontSize: 11,
    fontFamily: 'monospace',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipStrip: {
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingBottom: 5,
    maxHeight: 34,
  },
  chipRow: { alignItems: 'center', gap: 5, paddingHorizontal: 8 },
  chipSep: { width: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  chipText: {
    color: colors.chrome,
    fontSize: 9,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  list: { flex: 1, minHeight: 0 },
  grid: { padding: 8, alignItems: 'center' },
  cell: { margin: 4 },
  countBadge: {
    position: 'absolute',
    top: -4,
    left: -4,
    backgroundColor: '#2a060b',
    borderWidth: 1,
    borderColor: colors.bloodNeon,
    paddingHorizontal: 5,
    paddingVertical: 1,
    zIndex: 5,
  },
  countBadgeText: { color: colors.bloodNeon, fontSize: 10, fontWeight: '700', fontFamily: 'monospace' },
  deckHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  deckTitle: {
    color: colors.chrome,
    fontSize: 11,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  deckCount: { color: colors.bloodNeon, fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  progressTrack: {
    height: 4,
    marginHorizontal: 10,
    marginTop: 4,
    marginBottom: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.bloodNeon },
  deckEmpty: {
    color: colors.chromeDark,
    fontSize: 10,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: 30,
    paddingHorizontal: 20,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  nameInput: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.chromeBright,
    fontSize: 10,
    fontFamily: 'monospace',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 2,
    borderColor: colors.border,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  startBtn: { flex: 1 },
});
