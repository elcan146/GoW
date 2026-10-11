# Grails of War — Mobile (React Native + Expo)

Native port of the web game. No webview — the board is rendered with plain
React Native views; the game engine (`src/game/`) is shared verbatim with the
web version.

## Layout

```
mobile/
  index.js               entry — polyfills + storage hydration, then App
  src/
    game/                copied from ../src/game (pure TS, engine-agnostic)
    platform/
      storage.ts         localStorage-compatible shim over AsyncStorage
      polyfills.ts       structuredClone fallback
    assets.ts            GENERATED — require() manifest (see scripts/)
    audio.ts             expo-audio port of the web Howler layer
    theme.ts             palette/styles mirrored from tailwind.config.js
    components/          RN screens: DeckBuilder, Board, HandBar,
                         LocationColumn, CardView, StatusBar,
                         CardInspector, Overlays, LogTicker
  assets/                copied from ../public (cards, backs, locations, sfx, ost)
  scripts/gen-assets.mjs regenerates src/assets.ts after asset changes
```

## Setup

```powershell
cd mobile
npm install
npx expo install --fix   # if npm warns about version mismatches
npx expo start           # scan QR with Expo Go, or press 'a' for emulator
```

## Build an APK

```powershell
npm install -g eas-cli
eas login
eas build -p android --profile apk
```

## Controls (touch adaptations)

- **Deck builder** — tap a card to add it; long-press to inspect; tap a deck
  chip to remove it; long-press a saved-deck chip to delete it.
- **Match** — tap a hand card to select it, then tap a glowing location to
  play. Long-press any card to inspect. Tap again / Cancel to deselect.
- Drag-to-play from the web version is replaced by tap-select → tap-location.

## Differences from web

- Phaser board → plain RN `View`/`Image`/`Animated` (no Skia dependency yet).
- Howler → `expo-audio`; same API surface in `src/audio.ts`.
- `localStorage` → AsyncStorage-backed sync shim (`src/platform/storage.ts`);
  deck + saved decks + mute persist across launches.
- No custom fonts yet (web uses Cinzel/Rajdhani/etc.) — add `expo-font` later.
- No particle effects / drag trail — candidates: `react-native-reanimated` or
  `@shopify/react-native-skia` if you want them back.

## Keeping game logic in sync

`src/game/` is a copy. After changing `../src/game/*` on the web side:

```powershell
Copy-Item -Recurse ..\src\game\* src\game\
# then re-apply the one mobile patch: store.ts imports kv and uses it in
# the `storage` helper (see git diff for the two-line change).
```

After adding/removing files under `assets/`:

```powershell
npm run gen:assets
```
