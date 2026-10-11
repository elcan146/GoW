import type { LocationDef } from './types';

// All locations from mechanics/mappowers.txt. Behavior is dispatched by id in the engine.
export const LOCATION_POOL: LocationDef[] = [
  { id: 'abyss', name: 'Abyss', text: 'All card abilities are disabled. Power of every card here is halved.' },
  { id: 'battlefield', name: 'Battlefield', text: 'Every card here gains +Power equal to the total number of cards at this location (both sides).' },
  { id: 'coliseum', name: 'Coliseum', text: "End of round: the winner's highest-Power card here doubles its Power and ability numbers." },
  { id: 'cursed-lands', name: 'Cursed Lands', text: 'Every card here loses 1 Power at the end of each turn.' },
  { id: 'dense-forest', name: 'Dense Forest', text: 'Half of the cards played here are hidden from the opponent.' },
  { id: 'desert', name: 'Desert', text: 'Only 4 cards per side can be played here.' },
  { id: 'dragons', name: 'Dragons', text: 'Each card played here has a 30% chance to be burned (destroyed).' },
  { id: 'elaria', name: 'Elaria', text: 'Elarion Empire cards here have their Power doubled.' },
  { id: 'elderlands', name: 'Elderlands', text: 'Elderveld cards here have their Power doubled.' },
  { id: 'future', name: 'Future', text: 'This location scores 0 this round. Cards here carry over to the next round.' },
  { id: 'hochreich', name: 'Hochreich', text: 'Hochreich cards here have their Power doubled.' },
  { id: 'hotc-camp', name: 'Horde of the Carrion Camp', text: 'Horde of the Carrion cards here have their Power doubled.' },
  { id: 'kal', name: 'Kal', text: 'Non-Kalthrone cards here have their Power halved.' },
  { id: 'mirror', name: 'Mirror', text: 'Each card played here has a 50% chance to switch to the enemy side.' },
  { id: 'hell', name: 'Hell', text: 'Only Monster, Cursed, and Arcane cards can be played here.' },
  { id: 'intestines', name: 'Intestines', text: 'Every card here has its Power set to 1.' },
  { id: 'labyrinth', name: 'Labyrinth', text: 'Each card played here has a 50% chance to become a Blobeye.' },
  { id: 'lava', name: 'Lava', text: 'If combined Power here exceeds 20, the highest-Power card is destroyed.' },
  { id: 'plague', name: 'Plague', text: 'Every card here loses 1 Power at the end of each turn. Cards at 0 Power are destroyed.' },
  { id: 'heaven', name: 'Heaven', text: 'Cards here cannot be destroyed or debuffed.' },
  { id: 'plains', name: 'Plains', text: 'No special effect.' },
  { id: 'ravaria', name: 'Ravaria', text: 'Ravaria cards here have their Power doubled.' },
  { id: 'random', name: 'Random', text: 'At round start, 8 random cards from each deck are played here automatically.' },
  { id: 'shadowland', name: 'Shadowland', text: 'All cards played here are face-down until the round ends.' },
  { id: 'stakes', name: 'Stakes', text: 'End of round: the winner adds a Divine Dragon to their hand.' },
  { id: 'valhalla', name: 'Valhalla', text: 'Cards destroyed here are resurrected at the end of the round.' },
  { id: 'varkaz', name: 'Varkaz', text: 'Only cards with no ability can be played here.' },
  { id: 'snowy', name: 'Snowy', text: 'No special effect.' },
  { id: 'soulland', name: 'Soulland', text: 'Ability cards here get +3 Power. Each card played here has a 10% chance to become a Monster.' },
  { id: 'swamps', name: 'Swamps', text: 'End of round: the loser adds 3 Werewolves to their hand.' },
];

export const MAX_CARDS_PER_SIDE = 8; // standard slots; +1 dedicated chaos slot

// Filename prefixes in public/locations (note source typos: abbys, colesium).
// Suffix _1/_2/_3 = left/center/right board slot.
const LOCATION_ART: Record<string, string> = {
  abyss: 'abbys',
  battlefield: 'battlefield',
  coliseum: 'colesium',
  'cursed-lands': 'cursedlands',
  'dense-forest': 'denseforest',
  desert: 'desert',
  dragons: 'dragons',
  elaria: 'Elaria',
  elderlands: 'Elderlands',
  future: 'future',
  heaven: 'heaven',
  hell: 'hell',
  hochreich: 'hochreich',
  'hotc-camp': 'hotc_camp',
  intestines: 'intestines',
  kal: 'Kal',
  labyrinth: 'labyrinth',
  lava: 'lava',
  mirror: 'mirror',
  plague: 'plague',
  plains: 'plains',
  random: 'random',
  ravaria: 'Ravaria',
  shadowland: 'shadowland',
  snowy: 'snowy',
  soulland: 'soulland',
  stakes: 'stakes',
  swamps: 'swamps',
  valhalla: 'valhalla',
  varkaz: 'Varkaz',
};

/** Art for a location at board slot index (0=left, 1=center, 2=right). */
export function locationArt(locId: string, slotIndex: number): string {
  const prefix = LOCATION_ART[locId] ?? locId;
  return `/locations/${prefix}_${slotIndex + 1}.jpeg`;
}
