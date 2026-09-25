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
    // — Keeper Bramwell's shrine ring, a flowering hollow ringed by birches —
    { kind: 'shrine_stone', at: [-38, 48], scale: 1.2 },
    { kind: 'shrine_stone', at: [-32, 46], scale: 0.9 },
    { kind: 'shrine_stone', at: [-44, 46], scale: 0.9 },
    { kind: 'shrine_stone', at: [-38, 55], scale: 0.85 },
    { kind: 'flower_patch', density: 0.5, area: [-38, 48, 12] },
    { kind: 'rock_mossy', at: [-30, 53] },
    { kind: 'tree_birch', ring: [-38, 49, 15.5], count: 10, startAngle: 0.3, jitter: 2.2 },
    { kind: 'bush', ring: [-38, 49, 11.5], count: 8, startAngle: 0.9, jitter: 1.5 },
    // — the pond's edge: willows, reeds, a little jetty —
    { kind: 'reeds', density: 0.4, area: [58, 42, 14] },
    { kind: 'reeds', density: 0.25, area: [58, 42, 24] },
    { kind: 'lilypad', density: 0.3, area: [58, 42, 10] },
    { kind: 'tree_willow', density: 0.05, area: [58, 42, 30] },
    { kind: 'rock', at: [70, 50], scale: 1.1 },
    { kind: 'rock_mossy', density: 0.03, area: [58, 42, 28] },
    { kind: 'flower_patch', at: [48, 30] },
    { kind: 'flower_patch', density: 0.2, area: [44, 30, 10] },
    { kind: 'bench', at: [40.5, 33.5], rot: 2.3 },
    // — landmarks: the windmill on the western rise greets the west gate; the
    //   great oak crowns the meadow's heart; twin oaks frame the north gate —
    { kind: 'windmill', at: [-61, -19], rot: -1.05 },
    { kind: 'fence', line: [[-70, -29], [-53, -29]], step: 1.6, align: true },
    { kind: 'woodpile', at: [-55, -13.5], rot: 0.4 },
    { kind: 'tree_oak', at: [22, -8], scale: 2.1 },
    { kind: 'flower_patch', ring: [22, -8, 5.5], count: 7, jitter: 1 },
    { kind: 'rock_mossy', at: [27.5, -3.5], scale: 0.8 },
    { kind: 'tree_oak', at: [-8.5, -86], scale: 1.5 },
    { kind: 'tree_oak', at: [8.5, -85], scale: 1.45 },
    { kind: 'signpost', at: [5.5, -78], rot: 3.0 },
    { kind: 'bush', line: [[-8, -70], [-8, -80]], step: 5, jitter: 1 },
    { kind: 'bush', line: [[8, -70], [8, -80]], step: 5, jitter: 1 },
    // — oak clusters dotting the hills —
    { kind: 'tree_oak', density: 0.3, area: [-70, -55, 26] },
    { kind: 'tree_oak', density: 0.28, area: [40, -70, 24] },
    { kind: 'tree_oak', density: 0.22, area: [-70, 60, 20] },
    { kind: 'tree_oak', density: 0.18, area: [85, 60, 22] },
    { kind: 'tree_birch', density: 0.1, area: [60, -20, 22] },
    // — a forest edge frames the whole meadow (gaps where the gates open) —
    { kind: 'tree_cluster', border: { inset: 5, step: 11, rows: 2, gap: 16 }, scale: 1.3 },
    { kind: 'rock', border: { inset: 13, step: 22, rows: 1, gap: 16 }, scale: 1.3 },
    // — along the walks: flowers at the verges, bushes and stones a few steps off —
    { kind: 'flower_patch', line: [[-90, 4.8], [-54, 12]], step: 6, jitter: 1.5 },
    { kind: 'flower_patch', line: [[-50, 11.8], [-12, 4.9]], step: 6, jitter: 1.5 },
    { kind: 'flower_patch', line: [[-2.6, -8], [3.2, -48]], step: 7, jitter: 1.5 },
    { kind: 'flower_patch', line: [[3.4, -54], [3.4, -92]], step: 7, jitter: 1.5 },
    { kind: 'bush', line: [[-48, 14.5], [-14, 8.2]], step: 9, jitter: 2 },
    { kind: 'bush', line: [[-60, 2], [-88, -3.5]], step: 9, jitter: 2 },
    { kind: 'rock', line: [[-11.5, -12], [-6.5, -44]], step: 9, jitter: 2, scale: 0.8 },
    { kind: 'rock', line: [[6.5, -58], [6.5, -90]], step: 11, jitter: 2, scale: 0.8 },
    // — meadow dressing, dense and alive —
    { kind: 'flower_patch', density: 0.14, area: [0, 0, 95] },
    { kind: 'grass_tuft', density: 0.18, area: [0, 0, 100] },
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
    // — the west gate: a fenced pasture lane and a signpost —
    { kind: 'fence', at: [-96, -6], rot: Math.PI / 2 },
    { kind: 'fence', at: [-96, 6], rot: Math.PI / 2 },
    { kind: 'fence', line: [[-91, -5.3], [-66, -1.2]], step: 1.6, align: true },
    { kind: 'fence', line: [[-91, 7.8], [-68, 11.6]], step: 1.6, align: true },
    { kind: 'signpost', at: [-85, -3.2], rot: -0.3 },
    { kind: 'signpost', at: [-11, -3.8], rot: 0.8 },
    { kind: 'lamp_post', at: [-95, 4.2] },
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
