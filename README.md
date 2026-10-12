<div align="center">
  <img src="assets/logocut.png" alt="Grails of War" width="640" />

  **A tactical lane-battle card game of hidden plays and best-of-three conquest.**

  [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-8b0000.svg)](LICENSE)
  [![React](https://img.shields.io/badge/React-18-61dafb.svg?logo=react&logoColor=white)](https://react.dev)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
  [![Phaser](https://img.shields.io/badge/Phaser-4-blueviolet.svg)](https://phaser.io)
  [![React Native](https://img.shields.io/badge/React%20Native-0.79-61dafb.svg?logo=react&logoColor=white)](https://reactnative.dev)
  [![Expo](https://img.shields.io/badge/Expo-53-000000.svg?logo=expo&logoColor=white)](https://expo.dev)
  [![Vite](https://img.shields.io/badge/Vite-5-646cff.svg?logo=vite&logoColor=white)](https://vite.dev)

</div>

---

## About

**Grails of War** is a digital card game prototype that blends the simultaneous-turn tension of *Gwent* with the three-location board warfare of *Marvel Snap*. Both players commit their plays in secret; the board decides who is worthy of the Grails.

The project is a **monorepo** containing:

- **Web client** — React + TypeScript + Vite, with a Phaser-rendered board and hand-drawn dark-fantasy art direction.
- **Mobile client** — React Native + Expo port that shares the same pure-TypeScript game engine (`src/game/`) verbatim.

---

## Demo

<div align="center">
  <table>
    <tr>
      <td align="center"><b>🖥️ Web</b></td>
      <td align="center"><b>📱 Mobile</b></td>
    </tr>
    <tr>
      <td><video src="https://github.com/user-attachments/assets/c2f23a0f-6efa-4a39-ad79-d4b137d10aa5" poster="https://raw.githubusercontent.com/elcan146/GoW/main/assets/grailsofwar_pc.jpg" controls muted width="520"></video></td>
      <td><video src="https://github.com/user-attachments/assets/ef204c23-6e3f-41a1-b71d-664e27bd860e" poster="https://raw.githubusercontent.com/elcan146/GoW/main/assets/grailsofwar_mobile.jpg" controls muted width="220"></video></td>
    </tr>
    <tr>
      <td align="center"><sub>Phaser-rendered board on desktop</sub></td>
      <td align="center"><sub>Touch-optimized Expo client</sub></td>
    </tr>
  </table>
</div>

---

## Gameplay

| Rule | Details |
| :--- | :--- |
| **Rounds** | Best 2 out of 3. The board clears between rounds; hands carry over. |
| **Hand** | 10 cards drawn at the start — no redraws for the rest of the match. Card advantage is the core resource. |
| **Board** | 3 Locations (Left / Middle / Right), each with a unique modifier and a 4-card cap per side. |
| **Turns** | Simultaneous. Each player secretly picks 1 card and a target Location, then both reveal. No mana. |
| **Pass** | Passing locks you out for the remainder of the round. |
| **Winning** | At round end, the higher Power at 2 of 3 Locations wins the round and earns a Crown token. |

### Features

- Simultaneous reveal system with "On Reveal" card effects
- Distinct location modifiers that reshape each round
- Mock opponent AI that plays until low on cards, then passes
- Deck builder with saved decks persisted locally
- Original soundtrack, sound effects, and card art (kept local — see *Assets* below)
- Touch-optimized mobile UI: tap-to-select card, tap-to-play location, long-press to inspect

---

## Tech Stack

| Layer | Web | Mobile |
| :--- | :--- | :--- |
| **Framework** | React 18 + Vite | React Native 0.79 + Expo 53 |
| **Rendering** | Phaser 4 board scene | Native `View` / `Image` / `Animated` |
| **State** | Zustand | Zustand (shared engine) |
| **Audio** | Howler | `expo-audio` |
| **Styling** | Tailwind CSS | StyleSheet + mirrored theme |
| **Language** | TypeScript | TypeScript |

---

## Project Structure

```text
grails-of-war/
├── src/
│   ├── components/     # React UI: Board, CardView, CardInspector, overlays...
│   ├── game/           # Pure-TS engine: cards, effects, store, types (shared)
│   └── phaser/         # Phaser scenes, objects, and the React bridge
├── mobile/
│   ├── src/
│   │   ├── game/       # Verbatim copy of src/game (engine-agnostic)
│   │   ├── components/ # RN screens: DeckBuilder, Board, HandBar, LogTicker...
│   │   └── platform/   # AsyncStorage shim, polyfills
│   ├── android/        # Bare-workflow Android project (com.grailsofwar.app)
│   └── scripts/        # Asset & card generation utilities
├── mechanics/          # Game design documents (powers, factions, backgrounds)
└── public/             # Web static assets
```

---

## Getting Started

### Web

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build
```

### Mobile (Expo)

```bash
cd mobile
npm install
npx expo install --fix   # resolve any version mismatches
npx expo start           # scan QR with Expo Go, or press 'a' for emulator
```

Build a standalone APK:

```bash
npm install -g eas-cli
eas build -p android --profile apk
```

See [`mobile/README.md`](mobile/README.md) for controls, syncing the shared game engine, and platform differences.

---

## Assets

Large media files (card art, location backgrounds, card backs, SFX, OST) are **git-ignored** and kept local. Drop them into `public/` (web) and `mobile/assets/` (mobile), then regenerate the manifest:

```bash
cd mobile
npm run gen:assets
```

---

## License

**GNU General Public License v3.0** — see [`LICENSE`](LICENSE).

This program is free software: you can redistribute it and/or modify it under the terms of the GNU GPL v3. Any distributed version must also make its source available under the same license.

<div align="center">
  <sub>Forged in the pursuit of the Grails.</sub>
</div>
