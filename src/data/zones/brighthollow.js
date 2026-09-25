// BRIGHTHOLLOW — the starting town. Warm, safe, lived-in.
// Layout (north = -Z, east = +X):
//   Center plaza with the shrine stone + Warden statue; Maren's sanctum (large house)
//   sits NW of the plaza; Pip's stall E of it; four villager homes ring the plaza with
//   little gardens; lamp-lit east road runs to the gate and the Dawnmeadow portal.
// No wild encounters — this is home.
// Conventions: npc.face = yaw radians (0 faces +Z, PI/2 faces +X). prop.rot = same (hint).

export const ZONE = {
  id: 'brighthollow',
  name: 'Brighthollow',
  biome: 'town',
  size: 160,

  ambient: {
    skyTop: 0x8ecbff, skyBottom: 0xffe8c8,
    fogColor: 0xdfe9f0, fogDensity: 0.006,
    sun: 0xfff2d0,
    music: 'town',
    weather: 'clear',
  },

  terrain: { kind: 'town', hills: 0.15, seed: 11 },
  water: null,

  paths: [
    // plaza cross
    { from: [-14, 0], to: [14, 0], width: 6 },
    { from: [0, -12], to: [0, 12], width: 6 },
    // east road to the gate
    { from: [14, 0], to: [44, 0], width: 4 },
    { from: [44, 0], to: [72, 0], width: 4 },
    // west lane (homes), north lane (sanctum), south lane
    { from: [-14, 0], to: [-40, 6], width: 3 },
    { from: [0, -12], to: [-14, -20], width: 3 },
    { from: [0, 12], to: [2, 30], width: 3 },
  ],

  props: [
    // — plaza landmarks —
    { kind: 'shrine_stone', at: [0, -2], scale: 1.3 },
    { kind: 'statue_warden', at: [6, 4], scale: 1.1, rot: -Math.PI / 4 },
    { kind: 'well', at: [-10, 8] },
    { kind: 'bench', at: [-6, -5], rot: 1.107 },
    { kind: 'bench', at: [6.5, -5.2], rot: -1.138 },
    { kind: 'planter', at: [4.2, -5.4] },
    { kind: 'planter', at: [-4.3, 3.8] },
    { kind: 'flower_bed', at: [8.2, 8.2], rot: Math.PI / 4 },
    { kind: 'flower_bed', at: [-7.4, 4.6], rot: 0.1 },
    // — the market: Pip's stall plus two neighbours on the plaza's north side —
    { kind: 'shop_stall', at: [12, -8], rot: -Math.PI / 2 },
    { kind: 'shop_stall', at: [-7, -8.5], rot: 0 },
    { kind: 'shop_stall', at: [-12.5, -6.2], rot: Math.PI / 2 },
    { kind: 'crate', at: [15, -12] },
    { kind: 'crate', at: [17, -7], scale: 0.85 },
    { kind: 'barrel', at: [10, -13] },
    { kind: 'crate', at: [-4.6, -10.6], scale: 0.8 },
    { kind: 'barrel', at: [-15.5, -9] },
    { kind: 'cart', at: [19.5, -14], rot: Math.PI / 5 },
    // — bunting strung across the plaza roads —
    { kind: 'bunting', at: [8.5, 0], rot: Math.PI / 2 },
    { kind: 'bunting', at: [-8.5, 0], rot: Math.PI / 2 },
    { kind: 'bunting', at: [0, -9.5], rot: 0 },
    // — Maren's sanctum (the town's heart of learning) —
    { kind: 'house_large', at: [-20, -24], scale: 1.15, rot: Math.PI * 0.38 },
    { kind: 'lamp_post', at: [-11.5, -21.5] },
    { kind: 'flower_patch', at: [-26, -18] },
    { kind: 'planter', at: [-15.2, -21.8] },
    // — north row facing the plaza —
    { kind: 'townhouse', at: [-5, -23], rot: 0.15 },
    { kind: 'townhouse', at: [6, -21], rot: 0 },
    { kind: 'townhouse', at: [13, -22], rot: -0.1 },
    { kind: 'house_small', at: [21.5, -21], rot: -0.2 },
    { kind: 'house_small', at: [31, -19.5], rot: -0.45 },
    { kind: 'woodpile', at: [26.5, -24], rot: 0.3 },
    { kind: 'flower_bed', at: [9.5, -16.5], rot: 0 },
    { kind: 'planter', at: [2.4, -18.6] },
    // — the east road: houses face the street from both sides —
    { kind: 'house_small', at: [27, -9], rot: 0 },
    { kind: 'townhouse', at: [36, -8.6], rot: 0 },
    { kind: 'house_small', at: [45, -9.4], rot: 0.05 },
    { kind: 'townhouse', at: [53.5, -8.6], rot: 0 },
    { kind: 'townhouse', at: [29.5, 8.6], rot: Math.PI },
    { kind: 'house_small', at: [38.5, 9.2], rot: Math.PI },
    { kind: 'townhouse', at: [47, 8.6], rot: Math.PI },
    { kind: 'house_small', at: [56.5, 9.6], rot: Math.PI + 0.1 },
    { kind: 'planter', at: [32.6, -5.4] }, { kind: 'planter', at: [41.6, 5.6] },
    { kind: 'planter', at: [49.8, -5.4] }, { kind: 'barrel', at: [51, 5.6] },
    { kind: 'bench', at: [42, -5.6], rot: 0 },
    { kind: 'bunting', at: [33, 0], rot: Math.PI / 2 },
    { kind: 'bunting', at: [48, 0], rot: Math.PI / 2 },
    // — villager homes with gardens —
    { kind: 'house_small', at: [-30, 14], rot: Math.PI * 0.6 },
    { kind: 'fence', line: [[-35.5, 20], [-24, 20]], step: 1.6, align: true },
    { kind: 'berry_bush', at: [-28, 18] },
    { kind: 'flower_bed', at: [-31.5, 17.6], rot: 0 },
    { kind: 'flower_patch', at: [-24, 16] },
    { kind: 'house_small', at: [25, 18], rot: -Math.PI * 0.65 },
    { kind: 'fence', line: [[21, 16.5], [21, 26]], step: 1.6, align: true },
    { kind: 'fence', line: [[22, 26.5], [31, 26.5]], step: 1.6, align: true },
    { kind: 'berry_bush', at: [29, 23] },
    { kind: 'flower_bed', at: [25.5, 23.4], rot: 0 },
    { kind: 'flower_patch', at: [22, 15] },
    { kind: 'house_small', at: [-24, -38], rot: Math.PI * 0.15 },
    { kind: 'cart', at: [-16.5, -33], rot: -Math.PI / 3 },
    { kind: 'berry_bush', at: [-29, -33] },
    { kind: 'hedge', line: [[-31, -30], [-18, -30]], step: 2.3, align: true },
    // — the west lane —
    { kind: 'townhouse', at: [-24, -6.8], rot: 0.22 },
    { kind: 'house_small', at: [-34, -4.2], rot: 0.22 },
    { kind: 'townhouse', at: [-21, 11.4], rot: Math.PI + 0.22 },
    { kind: 'woodpile', at: [-38.5, -8.5], rot: 0.2 },
    { kind: 'signpost', at: [-42, 1.8], rot: -1.2 },
    { kind: 'path_lantern', line: [[-18, -1.7], [-38, 2.9]], step: 6.6 },
    // — the south lane —
    { kind: 'house_small', at: [-8, 22], rot: Math.PI / 2 },
    { kind: 'townhouse', at: [10, 25], rot: -Math.PI / 2 },
    { kind: 'flower_bed', at: [-8.5, 16.8], rot: Math.PI / 2 },
    { kind: 'path_lantern', line: [[2.9, 15], [4.4, 29]], step: 7 },
    // — lamplight along the ways (lit at dusk) —
    { kind: 'lamp_post', at: [10, 10] },
    { kind: 'lamp_post', at: [-10, -10] },
    { kind: 'lamp_post', at: [10, -10] },
    { kind: 'lamp_post', at: [-10, 10] },
    { kind: 'lamp_post', at: [30, 3] },
    { kind: 'lamp_post', at: [50, -3] },
    { kind: 'lamp_post', at: [-30, 9] },
    // — the east gate —
    { kind: 'fence', at: [66, -6], rot: Math.PI / 2 },
    { kind: 'fence', at: [66, 6], rot: Math.PI / 2 },
    { kind: 'lamp_post', at: [67, -4] },
    { kind: 'lamp_post', at: [67, 4] },
    { kind: 'bunting', at: [62.5, 0], rot: Math.PI / 2 },
    { kind: 'signpost', at: [60, -4.6], rot: 2.6 },
    { kind: 'hedge', line: [[58, -10], [58, -16]], step: 2.3, align: true },
    { kind: 'hedge', line: [[60, 12], [60, 18]], step: 2.3, align: true },
    // — trees ring the plaza; oak stands and a forest wall frame the town —
    { kind: 'tree_oak', ring: [0, -1, 18.5], count: 10, startAngle: Math.PI / 10, scale: 0.9, jitter: 1.2 },
    { kind: 'tree_birch', ring: [0, -1, 26], count: 12, startAngle: 0.2, scale: 1.0, jitter: 2.5 },
    { kind: 'tree_cluster', border: { inset: 5, step: 10, rows: 2, gap: 15 }, scale: 1.25 },
    { kind: 'tree_oak', density: 0.25, area: [-55, -46, 22] },
    { kind: 'tree_oak', density: 0.22, area: [50, 48, 24] },
    { kind: 'tree_oak', density: 0.2, area: [-52, 44, 20] },
    { kind: 'tree_oak', density: 0.2, area: [48, -50, 22] },
    { kind: 'tree_birch', density: 0.12, area: [0, 55, 20] },
    { kind: 'tree_birch', density: 0.12, area: [8, -55, 20] },
    { kind: 'bush', density: 0.07, area: [0, 0, 66] },
    { kind: 'grass_tuft', density: 0.45, area: [0, 0, 74] },
    { kind: 'flower_patch', density: 0.14, area: [0, 22, 28] },
    { kind: 'flower_patch', density: 0.1, area: [0, 0, 60] },
    { kind: 'stump', at: [-44, -40] },
    { kind: 'log', at: [46, 44], rot: Math.PI / 6 },
    { kind: 'rock_mossy', at: [-48, 38] },
    { kind: 'rock', density: 0.03, area: [0, 0, 70] },
  ],

  portals: [
    { to: 'dawnmeadow', at: [72, 0], radius: 3, label: 'To Dawnmeadow', spawn: [-94, 0] },
  ],

  npcs: [
    { id: 'elder_maren', at: [-16, -17], face: Math.PI * 0.7 },   // by the sanctum door, watching the plaza
    { id: 'merchant_pip', at: [12, -10.5], face: 0 },             // behind the stall counter
    { id: 'v_bh_1', at: [-8, 7], face: -Math.PI / 2 },            // drawing water at the well
    { id: 'v_bh_2', at: [23, 14], face: Math.PI * 0.9 },          // tending the garden
    { id: 'v_bh_3', at: [56, 2], face: Math.PI / 2 },             // gazing down the east road
    { id: 'v_bh_4', at: [2, 22], face: Math.PI },                 // idling on the south lane
  ],

  encounters: { patches: [], table: [], rate: 0, roaming: [] },

  interactables: [
    { kind: 'shrine', at: [0, -2] },                                            // the plaza shrine — rest & heal
    { kind: 'chest', at: [-27, -43], item: 'tonic', qty: 2, flag: 'bh_chest1' },// tucked behind Maren's sanctum
    { kind: 'sparkle', at: [48, 42], item: 'woven_charm', qty: 1, flag: 'bh_spark1' }, // hidden in the oak stand
    { kind: 'sparkle', at: [-46, 40], item: 'honey_drop', qty: 1, flag: 'bh_spark2' }, // west grove sweetness
  ],

  spawn: [0, 6],
};
