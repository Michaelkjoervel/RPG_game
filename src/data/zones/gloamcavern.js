// GLOAMCAVERN — a crystal-lit dark beneath the wood. Close, echoing, watchful.
// Layout (north = -Z, east = +X):
//   The west gate opens into a crystal-veined tunnel that threads east to the far
//   gate. Branches lead to Lanternkeeper Ode's camp, a hidden pocket where the
//   deserter Finn is holed up, a still underground pool, a stash behind the
//   stalagmite field, and a north-east chamber housing the light-puzzle.
// Conventions: npc.face = yaw radians (0 faces +Z, PI/2 faces +X). prop.rot = same (hint).
//
// NOTE for the integrator: the light-puzzle's 4 rock_crystal pedestals are listed under
// `interactables` with kind:'pedestal' (see deviations in the zone-content report — this
// kind is not in world-living's documented chest/shard/shrine/sparkle vocabulary and needs
// a renderer + story.js hookup for the puzzle logic).

export const ZONE = {
  id: 'gloamcavern',
  name: 'Gloamcavern',
  biome: 'cave',
  size: 200,

  ambient: {
    skyTop: 0x1c2030, skyBottom: 0x141826,
    // base density authored low: the 'gloom' weather multiplies it ~1.45x at
    // runtime — 0.013 lands on the intended ~0.018 effective in-game
    fogColor: 0x171b28, fogDensity: 0.013,
    sun: 0x8fa0c8,
    music: 'cave',
    weather: 'gloom',
  },

  terrain: { kind: 'cave', hills: 0.6, seed: 45 },

  water: { level: 0.05, size: 30, pos: [48, 40] }, // a still, black underground pool

  paths: [
    { from: [-92, 0], to: [-40, -10], width: 5 },
    { from: [-40, -10], to: [0, 0], width: 5 },
    { from: [0, 0], to: [40, 8], width: 5 },
    { from: [40, 8], to: [92, 0], width: 5 },
    { from: [8, 4], to: [16, -38], width: 2.5 },    // Lanternkeeper Ode's camp
    { from: [-45, -8], to: [-62, 46], width: 2 },   // Finn's hidden pocket
    { from: [30, 6], to: [48, 36], width: 2.5 },    // the still pool
    { from: [50, 4], to: [62, -56], width: 2.5 },   // the light-puzzle chamber
    { from: [-48, -12], to: [-70, -34], width: 1.8 }, // stash behind the stalagmites
  ],

  props: [
    // — crystal-lit main tunnel —
    { kind: 'crystal_cluster', at: [-30, -6], scale: 1.1 },
    { kind: 'crystal_cluster', at: [10, 2], scale: 1.0 },
    { kind: 'crystal_cluster', at: [50, 6], scale: 1.2 },
    { kind: 'crystal_cluster', at: [78, -2], scale: 1.0 },
    { kind: 'crystal_cluster', at: [-70, 4], scale: 0.9 },
    { kind: 'rock_crystal', density: 0.2, area: [0, 0, 90] },
    // — Lanternkeeper Ode's camp —
    { kind: 'campfire', at: [17, -36] },
    { kind: 'tent', at: [22, -40], rot: Math.PI / 6 },
    { kind: 'crate', at: [14, -33] },
    { kind: 'crystal_cluster', at: [25, -34], scale: 0.7 },
    // — Finn's hidden pocket —
    { kind: 'campfire', at: [-62, 48], scale: 0.7 },
    { kind: 'rock', at: [-58, 52], scale: 1.2 },
    { kind: 'rock_mossy', at: [-68, 44] },
    // — the still pool —
    { kind: 'stalactite', density: 0.3, area: [48, 40, 16] },
    { kind: 'rock', at: [40, 34], scale: 1.3 },
    // — the light-puzzle chamber (north-east pocket) —
    { kind: 'crystal_cluster', at: [56, -50], scale: 0.8 },
    { kind: 'crystal_cluster', at: [68, -50], scale: 0.8 },
    { kind: 'stalagmite', density: 0.25, area: [62, -56, 14] },
    // — stalagmite field & hidden stash —
    { kind: 'stalagmite', density: 0.35, area: [-65, -25, 24] },
    { kind: 'stalactite', density: 0.3, area: [-65, -25, 24] },
    { kind: 'rock', at: [-72, -32], scale: 1.0 },
    // — general dressing, close and craggy —
    { kind: 'stalagmite', density: 0.16, area: [0, 0, 92] },
    { kind: 'stalactite', density: 0.2, area: [0, 0, 92] },
    { kind: 'hangmoss', at: [-10, 20] },
    { kind: 'hangmoss', at: [30, -20] },
    { kind: 'rock_mossy', at: [-20, 30] },
    { kind: 'rock', at: [60, 20], scale: 0.9 },
  ],

  portals: [
    { to: 'whisperwood', at: [-92, 0], radius: 3, label: 'To Whisperwood', spawn: [106, 0] },
    { to: 'mirrorlake', at: [92, 0], radius: 3, label: 'To Mirrorlake', spawn: [-116, 0] },
  ],

  npcs: [
    { id: 'lanternkeeper_ode', at: [19, -38], face: -Math.PI / 2 },
    { id: 'deserter_finn', at: [-64, 50], face: Math.PI / 2 }, // wary, half in shadow
  ],

  encounters: {
    patches: [
      { at: [-10, -4], r: 9 },
      { at: [60, 12], r: 8 },
    ],
    table: [
      { speciesId: 'sonark', w: 55, lv: [9, 12] },
      { speciesId: 'oozel', w: 50, lv: [9, 12] },
      { speciesId: 'shardling', w: 18, lv: [11, 14] },
      { speciesId: 'reverbane', w: 16, lv: [12, 15] },
      { speciesId: 'sludgemaw', w: 15, lv: [12, 15] },
      { speciesId: 'chandelisk', w: 6, lv: [13, 15] },
      { speciesId: 'gloomel', w: 5, lv: [12, 15] },
    ],
    rate: 0.22,
    roaming: [
      { speciesId: 'shardling', count: 2, area: [-10, 0, 40] },
    ],
  },

  interactables: [
    { kind: 'chest', at: [-72, -34], item: 'ferry_gear', qty: 1, flag: 'gc_chest_ferrygear' },
    { kind: 'chest', at: [80, -6], item: 'super_tonic', qty: 2, flag: 'gc_chest1' },
    { kind: 'sparkle', at: [-30, -2], item: 'glazed_charm', qty: 1, flag: 'gc_spark1' },
    { kind: 'pedestal', at: [58, -54], flag: 'gc_pedestal_1' },
    { kind: 'pedestal', at: [66, -54], flag: 'gc_pedestal_2' },
    { kind: 'pedestal', at: [58, -46], flag: 'gc_pedestal_3' },
    { kind: 'pedestal', at: [66, -46], flag: 'gc_pedestal_4' },
  ],

  spawn: [-40, -8],
};
