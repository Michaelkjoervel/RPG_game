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
    { kind: 'tree_willow', ring: [40, 30, 83], count: 34, startAngle: 0.1, jitter: 6, scale: 1.15 },
    { kind: 'tree_willow', density: 0.03, area: [-40, 0, 90] },
    { kind: 'reeds', density: 0.2, area: [40, 30, 90] },
    { kind: 'lilypad', density: 0.22, area: [40, 30, 80] },
    { kind: 'grass_tuft', density: 0.12, area: [-40, 0, 90] },
    { kind: 'rock_mossy', ring: [40, 30, 79], count: 16, startAngle: 0.5, jitter: 4 },
    // — the beacon: a stilted lantern tower out on the glass, framed by the first view —
    { kind: 'beacon', at: [-10, 40] },
    { kind: 'boat', at: [-6.5, 43], rot: 2.2 },
    // — Ferryman Juno's pier —
    { kind: 'dock', at: [-42.5, 34], rot: Math.PI / 2 },
    { kind: 'boat', at: [-35.5, 38], rot: Math.PI / 3 },
    { kind: 'lamp_post', at: [-50, 28] },
    { kind: 'barrel', at: [-41, 30.4] },
    { kind: 'crate', at: [-40.2, 32], scale: 0.8 },
    // — Keeper Maro's lakeside shrine —
    { kind: 'shrine_stone', at: [8, -66], scale: 1.15 },
    { kind: 'shrine_stone', at: [2, -68], scale: 0.85 },
    { kind: 'shrine_stone', at: [14, -68], scale: 0.85 },
    { kind: 'reeds', density: 0.3, area: [8, -66, 14] },
    { kind: 'rock', at: [16, -60], scale: 1.0 },
    { kind: 'flower_patch', ring: [8, -66, 8], count: 7, jitter: 1.5 },
    // — Driftmoor, the stilted hamlet on the southern water: a market deck, lake
    //   cottages on stilts, boardwalks and moored boats —
    { kind: 'deck', at: [66, 74] },
    { kind: 'shop_stall', at: [66, 73.4], rot: Math.PI, ground: 'water', lift: 0.6 },
    { kind: 'lamp_post', at: [64.3, 71.3], ground: 'water', lift: 0.6 },
    { kind: 'lamp_post', at: [68.6, 76.7], ground: 'water', lift: 0.6 },
    { kind: 'crate', at: [63.6, 76.3], ground: 'water', lift: 0.6 },
    { kind: 'barrel', at: [68.7, 71.3], ground: 'water', lift: 0.6 },
    { kind: 'house_stilt', at: [57, 86], rot: 2.5 },
    { kind: 'house_stilt', at: [72, 84.5], rot: -2.6 },
    { kind: 'house_stilt', at: [86, 64], rot: -1.1 },
    { kind: 'house_stilt', at: [48, 80], rot: 1.9 },
    { kind: 'boardwalk', at: [69.4, 80.4], rot: 0.54 },
    { kind: 'boardwalk', at: [61.2, 80.8], rot: -0.64 },
    { kind: 'boardwalk', at: [75.2, 70.2], rot: -1.1 },
    { kind: 'boardwalk', at: [53.8, 77], rot: -1.2 },
    { kind: 'boat', at: [80, 58], rot: Math.PI / 6 },
    { kind: 'boat', at: [56, 60], rot: -Math.PI / 5 },
    { kind: 'boat', at: [71, 69], rot: 0.4 },
    // — hidden falls nook —
    { kind: 'waterfall', at: [-78, 90], scale: 1.0 },
    { kind: 'cliff_wall', at: [-86, 94], rot: 0.5, scale: 1.1 },
    { kind: 'rock', at: [-72, 86], scale: 1.1 },
    { kind: 'hangmoss', at: [-82, 84] },
    { kind: 'fern', density: 0.25, area: [-76, 88, 10] },
    // — the west approach: a lamp-lit gate lane, fenced verges, the fork signpost —
    { kind: 'rock_mossy', at: [-90, -10] },
    { kind: 'rock_mossy', at: [-30, -70] },
    { kind: 'bush', density: 0.06, area: [-90, 0, 40] },
    { kind: 'stump', at: [-95, 20] },
    { kind: 'log', at: [-20, 10], rot: Math.PI / 6 },
    { kind: 'fence', at: [-118, -6], rot: Math.PI / 2 },
    { kind: 'fence', at: [-118, 6], rot: Math.PI / 2 },
    { kind: 'lamp_post', at: [-112, -4.2] },
    { kind: 'lamp_post', at: [-90, 4.2] },
    { kind: 'fence', line: [[-110, -5.6], [-78, -5.6]], step: 1.6, align: true },
    { kind: 'signpost', at: [-74.5, -5.2], rot: 0.6 },
    { kind: 'flower_patch', line: [[-110, 3.8], [-74, 3.8]], step: 6, jitter: 1.2 },
    { kind: 'flower_patch', line: [[-66, 4], [-47, 44]], step: 7, jitter: 1.5 },
    { kind: 'flower_patch', line: [[-67, -6], [-44, -40]], step: 7, jitter: 1.5 },
    { kind: 'path_lantern', line: [[-66.6, 3.2], [-46, 46]], step: 9 },
    { kind: 'path_lantern', line: [[-40, 54], [8, 76.6]], step: 9 },
    // — a forest edge frames the lakeland —
    { kind: 'tree_cluster', border: { inset: 5, step: 11, rows: 2, gap: 16 }, scale: 1.3 },
    { kind: 'tree_oak', density: 0.12, area: [-90, -60, 30] },
    { kind: 'tree_birch', density: 0.12, area: [-80, 60, 25] },
    { kind: 'tree_pine', density: 0.1, area: [-10, -100, 22] },
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

  spawn: [-52, 18],
  spawnFace: Math.PI * 0.38, // face east-southeast — the first view frames the glass water and Driftmoor's stilts
};
