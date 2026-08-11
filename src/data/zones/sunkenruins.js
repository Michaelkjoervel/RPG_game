// THE SUNKEN RUINS — a half-drowned temple, terraces flooded near the entrance,
// rising dry toward the Hollow Spire gate. Ruin_arch colonnades, glyph murals, and
// a trial dais deep within.
// Layout (north = -Z, further into the ruins; south = +Z, the way down from Skyreach):
//   The south gate opens onto flooded colonnaded terraces (the single water body
//   sits here, representing the drowned halls). The path climbs dry past Scholar
//   Imre's camp, a side chamber holds the water-stair valve puzzle, and the trail
//   continues north to Sancturne's trial dais and the gated Hollow Spire gate.
// Conventions: npc.face = yaw radians (0 faces +Z, PI/2 faces +X). prop.rot = same (hint).
// NOTE for the integrator: the puzzle's 3 valve interactables (kind:'valve') and the
// Sancturne trial (kind:'dais') are not in world-living's documented chest/shard/shrine/
// sparkle vocabulary — see deviations in the zone-content report.

export const ZONE = {
  id: 'sunkenruins',
  name: 'The Sunken Ruins',
  biome: 'ruins',
  size: 220,

  ambient: {
    skyTop: 0x9aa8b8, skyBottom: 0xc7d0c2,
    fogColor: 0xaab4ac, fogDensity: 0.014,
    sun: 0xe4e8d8,
    music: 'ruins',
    weather: 'clear',
  },

  terrain: { kind: 'ruins', hills: 0.7, seed: 73 },

  water: { level: 0.1, size: 70, pos: [0, 42] }, // the drowned entrance terraces

  paths: [
    { from: [0, 102], to: [0, 60], width: 5 },
    { from: [0, 60], to: [-28, 20], width: 4 },
    { from: [-28, 20], to: [0, -10], width: 4 },
    { from: [0, -10], to: [0, -60], width: 4 },
    { from: [0, -60], to: [0, -102], width: 5 },
    { from: [-28, 20], to: [-55, 10], width: 2.5 }, // Scholar Imre's camp
    { from: [10, -2], to: [45, -22], width: 3 },    // water-stair puzzle chamber
  ],

  props: [
    // — flooded colonnaded terraces —
    { kind: 'ruin_arch', at: [-18, 60], rot: Math.PI / 2 },
    { kind: 'ruin_arch', at: [18, 60], rot: -Math.PI / 2 },
    { kind: 'ruin_arch', at: [-18, 30], rot: Math.PI / 2 },
    { kind: 'ruin_arch', at: [18, 30], rot: -Math.PI / 2 },
    { kind: 'ruin_pillar', density: 0.25, area: [0, 42, 55] },
    { kind: 'ruin_wall', density: 0.15, area: [0, 42, 60] },
    { kind: 'lilypad', density: 0.15, area: [0, 42, 50] },
    // — Scholar Imre's camp —
    { kind: 'tent', at: [-58, 8], rot: Math.PI / 3 },
    { kind: 'campfire', at: [-53, 12] },
    { kind: 'crate', at: [-60, 4] },
    { kind: 'crate', at: [-56, 2], scale: 0.85 },
    // — the water-stair puzzle chamber —
    { kind: 'ruin_wall', density: 0.3, area: [44, -24, 16] },
    { kind: 'ruin_pillar', at: [36, -18] },
    { kind: 'ruin_pillar', at: [52, -18] },
    // — dry ascent toward the trial dais —
    { kind: 'ruin_arch', at: [-16, -20], rot: Math.PI / 2 },
    { kind: 'ruin_arch', at: [16, -20], rot: -Math.PI / 2 },
    { kind: 'ruin_pillar', density: 0.18, area: [0, -40, 45] },
    // — Sancturne's trial dais —
    { kind: 'ruin_pillar', at: [-14, -78] },
    { kind: 'ruin_pillar', at: [14, -78] },
    { kind: 'ruin_pillar', at: [-14, -68] },
    { kind: 'ruin_pillar', at: [14, -68] },
    { kind: 'ruin_wall', at: [0, -86], scale: 1.3 },
    // — general ruin dressing —
    { kind: 'rock', density: 0.14, area: [0, 0, 95] },
    { kind: 'rock_mossy', density: 0.08, area: [0, 0, 95] },
    { kind: 'fern', density: 0.12, area: [0, 30, 70] },
    { kind: 'grass_tuft', density: 0.16, area: [0, -30, 80] },
    { kind: 'stump', at: [40, 40] },
    { kind: 'fence', at: [0, 96], rot: 0 },
    { kind: 'fence', at: [12, 96], rot: 0 },
  ],

  portals: [
    { to: 'skyreach', at: [0, 102], radius: 3, label: 'To Skyreach Pass', spawn: [0, -106] },
    { to: 'hollowspire', at: [0, -102], radius: 3, label: 'To the Hollow Spire', spawn: [0, 76], flag: 'ruins_cleared' },
  ],

  npcs: [
    { id: 'scholar_imre', at: [-56, 10], face: Math.PI * 0.7 },
  ],

  encounters: {
    patches: [
      { at: [-14, 0], r: 9 },
      { at: [0, -35], r: 9 },
    ],
    table: [
      { speciesId: 'glyphant', w: 8, lv: [25, 29] },
      { speciesId: 'vantash', w: 6, lv: [26, 32] },
    ],
    rate: 0.16,
    roaming: [],
  },

  interactables: [
    { kind: 'shard', at: [-18, 56], flag: 'ru_shard1', dialogue: 'lore_ruins_1' },
    { kind: 'shard', at: [20, 12], flag: 'ru_shard2', dialogue: 'lore_ruins_2' },
    { kind: 'shard', at: [-18, -24], flag: 'ru_shard3', dialogue: 'lore_ruins_3' },
    { kind: 'valve', at: [40, -25], flag: 'ru_valve_1' },
    { kind: 'valve', at: [48, -25], flag: 'ru_valve_2' },
    { kind: 'valve', at: [44, -32], flag: 'ru_valve_3' },
    { kind: 'dais', at: [0, -78], flag: 'ru_sancturne_trial' },
    { kind: 'chest', at: [24, 46], item: 'gilded_charm', qty: 1, flag: 'ru_chest1' },
  ],

  spawn: [0, 90],
};
