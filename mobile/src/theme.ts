import { StyleSheet } from 'react-native';
import type { Rarity } from './game/types';

/** Palette mirrored from the web tailwind.config.js. */
export const colors = {
  blood: '#c1121f',
  bloodNeon: '#ff2a3c',
  bloodDim: '#7a0e16',
  chrome: '#9aa3ad',
  chromeBright: '#e8ecf1',
  chromeDark: '#7a828e',
  void: '#050507',
  panel: '#0a080c',
  border: '#2e2830',
  borderLight: '#3a2e33',
  violet: '#7c3aed',
} as const;

export const RARITY_COLOR: Record<Rarity, string> = {
  mortal: '#9aa3ad',
  cursed: '#34d399',
  arcane: '#67e8f9',
  forbidden: '#c4b5fd',
  mythic: '#ff2a3c',
  relic: '#2dd4bf',
  divine: '#fde68a',
};

export const RARITY_BORDER: Record<Rarity, string> = {
  mortal: '#64748b',
  cursed: '#059669',
  arcane: '#0ea5e9',
  forbidden: '#8b5cf6',
  mythic: '#ef4444',
  relic: '#2dd4bf',
  divine: '#fcd34d',
};

export const RARITY_LABEL: Record<Rarity, string> = {
  mortal: 'Mortal',
  cursed: 'Cursed',
  arcane: 'Arcane',
  forbidden: 'Forbidden',
  mythic: 'Mythic',
  relic: 'Relic',
  divine: 'Divine',
};

/** Shared building blocks approximating the web panel/button styles. */
export const ui = StyleSheet.create({
  panel: {
    backgroundColor: 'rgba(10,8,12,0.9)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  panelInset: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnChrome: {
    backgroundColor: '#16121a',
    borderWidth: 1,
    borderColor: colors.chromeDark,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnNeon: {
    backgroundColor: '#2a060b',
    borderWidth: 1,
    borderColor: colors.bloodNeon,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBlood: {
    backgroundColor: '#1a0508',
    borderWidth: 1,
    borderColor: colors.blood,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: colors.chromeBright,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },
  btnTextNeon: {
    color: colors.bloodNeon,
  },
  mono: {
    fontFamily: 'monospace',
    color: colors.chrome,
  },
  coin: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: '#16121a',
    borderWidth: 2,
    borderColor: colors.chromeDark,
  },
});
