// MIRRORLAKE — a huge, glass-still lake ringed by willows, with Driftmoor's stilted
// hamlet at its southern shore.
// Layout (north = -Z, east = +X):
//   The west gate meets the shoreline path, which forks north (past Ferryman Juno's
//   pier, then up to Keeper Maro's lakeside shrine and the Skyreach gate) and south
//   (down to Driftmoor's docks). A hidden nook behind a small falls sits south-west,
//   tucked off the Driftmoor trail.
// Conventions: npc.face = yaw radians (0 faces +Z, PI/2 faces +X). prop.rot = same (hint).
// NOTE: no "stilt house" prop exists in the pinned vocabulary — Driftmoor's stilted feel
// is implied by clustering house_small around dock boardwalks at the shoreline.

export const ZONE = {
  id: 'mirrorlake',
  name: 'Mirrorlake',
  biome: 'lake',
  size: 260,

  ambient: {
    skyTop: 0x9cc8e8, skyBottom: 0xdfe9e0,
    fogColor: 0xcbdce2, fogDensity: 0.007,
    sun: 0xeaf2ff,
    music: 'lake',
    weather: 'clear',
  },

  terrain: { kind: 'lake', hills: 0.5, seed: 58 },

  water: { level: 0.15, size: 150, pos: [40, 30] },

  paths: [
    { from: [-122, 0], to: [-70, 0], width: 5 },
    { from: [-70, 0], to: [-40, -42], width: 4 },
    { from: [-40, -42], to: [0, -90], width: 4 },
    { from: [0, -90], to: [0, -122], width: 5 },
    { from: [-20, -56], to: [8, -63], width: 3 },   // Keeper Maro's shrine
    { from: [-70, 0], to: [-42, 50], width: 4 },
    { from: [-42, 50], to: [10, 74], width: 4 },
    { from: [10, 74], to: [62, 70], width: 3.5 },   // into Driftmoor
    { from: [-45, 55], to: [-76, 86], width: 2 },   // hidden falls nook
    { from: [-58, 10], to: [-44, 34], width: 2.5 }, // Juno's pier
  ],

  props: [
    // — the shoreline, willows leaning over glass water —
    { kind: 'tree_willow', density: 0.22, area: [40, 30, 95] },
    { kind: 'reeds', density: 0.3, area: [40, 30, 90] },
    { kind: 'lilypad', density: 0.22, area: [40, 30, 80] },
    { kind: 'grass_tuft', density: 0.3, area: [-40, 0, 90] },
    // — Ferryman Juno's pier —
    { kind: 'dock', at: [-46, 32], rot: Math.PI / 4 },
    { kind: 'boat', at: [-40, 38], rot: Math.PI / 3 },
    { kind: 'lamp_post', at: [-50, 28] },
    // — Keeper Maro's lakeside shrine —
    { kind: 'shrine_stone', at: [8, -66], scale: 1.15 },
    { kind: 'shrine_stone', at: [2, -68], scale: 0.85 },
    { kind: 'shrine_stone', at: [14, -68], scale: 0.85 },
    { kind: 'reeds', density: 0.3, area: [8, -66, 14] },
    { kind: 'rock', at: [16, -60], scale: 1.0 },
    // — Driftmoor hamlet on the southern shore —
    { kind: 'dock', at: [58, 66], rot: 0 },
    { kind: 'dock', at: [70, 74], rot: Math.PI / 8 },
    { kind: 'house_small', at: [62, 78], rot: Math.PI * 0.15 },
    { kind: 'house_small', at: [78, 68], rot: -Math.PI * 0.3 },
    { kind: 'house_small', at: [50, 86], rot: Math.PI * 0.5 },
    { kind: 'shop_stall', at: [66, 72], rot: -Math.PI / 2 },
    { kind: 'boat', at: [80, 60], rot: Math.PI / 6 },
    { kind: 'boat', at: [56, 58], rot: -Math.PI / 5 },
    { kind: 'crate', at: [64, 76] },
    { kind: 'barrel', at: [70, 80] },
    { kind: 'lamp_post', at: [58, 72] },
    { kind: 'lamp_post', at: [74, 76] },
    // — hidden falls nook —
    { kind: 'waterfall', at: [-78, 90], scale: 1.0 },
    { kind: 'rock', at: [-72, 86], scale: 1.1 },
    { kind: 'hangmoss', at: [-82, 84] },
    { kind: 'fern', density: 0.25, area: [-76, 88, 10] },
    // — general shoreline & western approach dressing —
    { kind: 'rock_mossy', at: [-90, -10] },
    { kind: 'rock_mossy', at: [-30, -70] },
    { kind: 'bush', density: 0.06, area: [-90, 0, 40] },
    { kind: 'stump', at: [-95, 20] },
    { kind: 'log', at: [-20, 10], rot: Math.PI / 6 },
    { kind: 'fence', at: [-118, -6], rot: Math.PI / 2 },
    { kind: 'fence', at: [-118, 6], rot: Math.PI / 2 },
  ],

  portals: [
    { to: 'gloamcavern', at: [-122, 0], radius: 3, label: 'To Gloamcavern', spawn: [86, 0] },
    { to: 'skyreach', at: [0, -122], radius: 3, label: 'To Skyreach Pass', spawn: [0, 106] },
  ],

  npcs: [
    { id: 'keeper_maro', at: [8, -59], face: Math.PI }, // faces -Z into the shrine
    { id: 'ferryman_juno', at: [-44, 34], face: -Math.PI * 0.75 },
    { id: 'merchant_wren', at: [66, 75], face: Math.PI },
    { id: 'v_dm_1', at: [60, 82], face: -Math.PI / 3 },
    { id: 'v_dm_2', at: [80, 66], face: Math.PI * 0.8 },
  ],

  encounters: {
    // jellune is a night-blooming spawn in flavor — the fixed schema has no day/night
    // gate, so it's folded into the standard table at a modest weight.
    patches: [
      { at: [-20, -20], r: 9 },
      { at: [-10, 45], r: 9 },
    ],
    table: [
      { speciesId: 'finnet', w: 55, lv: [14, 17] },
      { speciesId: 'bogret', w: 18, lv: [15, 19] },
      { speciesId: 'jellune', w: 16, lv: [16, 20] },
      { speciesId: 'prismfin', w: 12, lv: [17, 20] },
    ],
    rate: 0.2,
    roaming: [],
  },

  interactables: [
    { kind: 'shrine', at: [8, -66] },
    { kind: 'chest', at: [-80, 92], item: 'gilded_charm', qty: 1, flag: 'ml_chest_falls' },
    { kind: 'chest', at: [74, 62], item: 'super_tonic', qty: 2, flag: 'ml_chest1' },
    { kind: 'sparkle', at: [-60, -20], item: 'honey_drop', qty: 1, flag: 'ml_spark1' },
  ],

  spawn: [-66, 0],
};
