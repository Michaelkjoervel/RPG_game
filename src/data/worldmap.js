// WORLDMAP — aggregates every zone into the region of Vael (the Duskmere Reach).
// Consumed by world/world.js (`loadZone` reads `ZONES[id]`) and by UI/story code that
// needs the travel order or a zone's wild-level band.

import { ZONE as BRIGHTHOLLOW } from './zones/brighthollow.js';
import { ZONE as DAWNMEADOW } from './zones/dawnmeadow.js';
import { ZONE as WHISPERWOOD } from './zones/whisperwood.js';
import { ZONE as GLOAMCAVERN } from './zones/gloamcavern.js';
import { ZONE as MIRRORLAKE } from './zones/mirrorlake.js';
import { ZONE as SKYREACH } from './zones/skyreach.js';
import { ZONE as SUNKENRUINS } from './zones/sunkenruins.js';
import { ZONE as HOLLOWSPIRE } from './zones/hollowspire.js';
import { ZONE as STARFALLGLADE } from './zones/starfallglade.js';

export const ZONES = {
  brighthollow: BRIGHTHOLLOW,
  dawnmeadow: DAWNMEADOW,
  whisperwood: WHISPERWOOD,
  gloamcavern: GLOAMCAVERN,
  mirrorlake: MIRRORLAKE,
  skyreach: SKYREACH,
  sunkenruins: SUNKENRUINS,
  hollowspire: HOLLOWSPIRE,
  starfallglade: STARFALLGLADE,
};

// Main travel chain first (per the design bible's region map), the hidden glade last —
// it branches off Whisperwood rather than continuing the chain.
export const ZONE_ORDER = [
  'brighthollow',
  'dawnmeadow',
  'whisperwood',
  'gloamcavern',
  'mirrorlake',
  'skyreach',
  'sunkenruins',
  'hollowspire',
  'starfallglade',
];

// Wild encounter level bands per the design bible §7. brighthollow is the home town
// (no wild encounters) so it has no band. hollowspire and starfallglade carry a band
// for reference/UI purposes even though their own encounter tables are empty (every
// fight in hollowspire is scripted; starfallglade's legendary is story-triggered).
export const LEVEL_BANDS = {
  brighthollow: null,
  dawnmeadow: [2, 6],
  whisperwood: [5, 10],
  gloamcavern: [9, 15],
  mirrorlake: [14, 20],
  skyreach: [18, 26],
  sunkenruins: [24, 32],
  hollowspire: [30, 38],
  starfallglade: [36, 45],
};
