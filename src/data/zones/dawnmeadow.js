// DAWNMEADOW — the tutorial fields east of Brighthollow. Soft, sunlit, welcoming.
// Layout (north = -Z, east = +X):
//   The west gate opens onto a winding meadow path that forks: south-west to Keeper
//   Bramwell's shrine ring (tucked in a flowering hollow), east to a quiet pond, and
//   on north to the Whisperwood treeline. Oak clusters break the open rolling hills.
// Conventions: npc.face = yaw radians (0 faces +Z, PI/2 faces +X). prop.rot = same (hint).

export const ZONE = {
  id: 'dawnmeadow',
  name: 'Dawnmeadow',
  biome: 'meadow',
  size: 220,

  ambient: {
    skyTop: 0x9fd8ff, skyBottom: 0xdff2e0,
    fogColor: 0xcfe8d8, fogDensity: 0.008,
    sun: 0xfff2d0,
    music: 'meadow',
    weather: 'clear',
  },

  terrain: { kind: 'meadow', hills: 1.0, seed: 22 },

  water: { level: 0.3, size: 46, pos: [58, 42] }, // a stream-less pond, glassy and still

  paths: [
    // west gate -> heart of the meadow
    { from: [-100, 0], to: [-52, 8], width: 5 },
    { from: [-52, 8], to: [-6, 0], width: 5 },
    // meadow heart -> north gate (Whisperwood treeline)
    { from: [-6, 0], to: [0, -50], width: 5 },
    { from: [0, -50], to: [0, -100], width: 5 },
    // branch south-west to Bramwell's shrine hollow
    { from: [-28, 14], to: [-38, 42], width: 3 },
    // branch east to the pond
    { from: [-2, -6], to: [44, 30], width: 3 },
  ],

  props: [
    // — Keeper Bramwell's shrine ring, a flowering hollow —
    { kind: 'shrine_stone', at: [-38, 48], scale: 1.2 },
    { kind: 'shrine_stone', at: [-32, 46], scale: 0.9 },
    { kind: 'shrine_stone', at: [-44, 46], scale: 0.9 },
    { kind: 'shrine_stone', at: [-38, 55], scale: 0.85 },
    { kind: 'flower_patch', density: 0.5, area: [-38, 48, 12] },
    { kind: 'rock_mossy', at: [-30, 53] },
    // — the pond's edge —
    { kind: 'reeds', density: 0.4, area: [58, 42, 14] },
    { kind: 'lilypad', density: 0.3, area: [58, 42, 10] },
    { kind: 'rock', at: [70, 50], scale: 1.1 },
    { kind: 'flower_patch', at: [48, 30] },
    // — oak clusters dotting the hills —
    { kind: 'tree_oak', density: 0.3, area: [-70, -55, 26] },
    { kind: 'tree_oak', density: 0.28, area: [40, -70, 24] },
    { kind: 'tree_oak', density: 0.22, area: [-70, 60, 20] },
    { kind: 'tree_oak', density: 0.18, area: [85, 60, 22] },
    // — meadow dressing, dense and alive —
    { kind: 'flower_patch', density: 0.3, area: [0, 0, 95] },
    { kind: 'grass_tuft', density: 0.55, area: [0, 0, 100] },
    { kind: 'bush', density: 0.08, area: [0, 0, 90] },
    // — mid-field landmarks so the open center doesn't read empty —
    { kind: 'tree_oak', at: [25, 22], scale: 1.15 },
    { kind: 'tree_birch', at: [-22, 32] },
    { kind: 'tree_oak', at: [18, -34], scale: 0.9 },
    { kind: 'rock', at: [-8, 28], scale: 0.8 },
    { kind: 'mushroom_cluster', at: [27, 18] },
    { kind: 'rock_mossy', at: [20, -35] },
    { kind: 'rock_mossy', at: [-60, -20] },
    { kind: 'stump', at: [-15, -60] },
    { kind: 'log', at: [12, -75], rot: Math.PI / 5 },
    { kind: 'fence', at: [-96, -6], rot: Math.PI / 2 },
    { kind: 'fence', at: [-96, 6], rot: Math.PI / 2 },
  ],

  portals: [
    { to: 'brighthollow', at: [-100, 0], radius: 3, label: 'To Brighthollow', spawn: [66, 0] },
    { to: 'whisperwood', at: [0, -100], radius: 3, label: 'To Whisperwood', spawn: [0, 106] },
  ],

  npcs: [
    { id: 'keeper_bramwell', at: [-38, 41], face: 0 }, // faces +Z into the shrine ring
  ],

  encounters: {
    patches: [
      { at: [-60, 4], r: 8 },
      { at: [-6, -30], r: 9 },
      { at: [15, -75], r: 8 },
    ],
    table: [
      { speciesId: 'vellit', w: 55, lv: [2, 4] },
      { speciesId: 'pipwing', w: 50, lv: [2, 4] },
      { speciesId: 'motling', w: 45, lv: [2, 4] },
      { speciesId: 'pebbin', w: 48, lv: [2, 5] },
      { speciesId: 'veldrun', w: 20, lv: [4, 6] },
      { speciesId: 'aurelark', w: 18, lv: [4, 6] },
      { speciesId: 'zephyra', w: 16, lv: [4, 6] },
      { speciesId: 'cairnox', w: 18, lv: [4, 6] },
      { speciesId: 'fulmin', w: 20, lv: [3, 6] },
      { speciesId: 'stormane', w: 6, lv: [5, 6] },
    ],
    rate: 0.2,
    roaming: [
      { speciesId: 'pebbin', count: 2, area: [-55, -35, 26] },
      { speciesId: 'vellit', count: 3, area: [30, -10, 32] },
    ],
  },

  interactables: [
    { kind: 'shrine', at: [-38, 48] },
    { kind: 'chest', at: [-46, 58], item: 'tonic', qty: 2, flag: 'dm_chest1' },
    { kind: 'chest', at: [72, 46], item: 'woven_charm', qty: 1, flag: 'dm_chest2' },
    { kind: 'shard', at: [76, 52], flag: 'dm_shard1', dialogue: 'lore_dm_1' },
  ],

  spawn: [-6, 4],
};
