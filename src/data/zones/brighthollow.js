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
    // — Maren's sanctum (the town's heart of learning) —
    { kind: 'house_large', at: [-20, -24], scale: 1.15, rot: Math.PI * 0.38 },
    { kind: 'lamp_post', at: [-13, -18] },
    { kind: 'flower_patch', at: [-26, -18] },
    // — Pip's stall, stacked with wares —
    { kind: 'shop_stall', at: [12, -8], rot: -Math.PI / 2 },
    { kind: 'crate', at: [15, -12] },
    { kind: 'crate', at: [17, -7], scale: 0.85 },
    { kind: 'barrel', at: [10, -13] },
    { kind: 'cart', at: [21, -3], rot: Math.PI / 5 },
    // — villager homes with gardens —
    { kind: 'house_small', at: [-30, 14], rot: Math.PI * 0.6 },
    { kind: 'fence', at: [-26, 20], rot: 0 },
    { kind: 'fence', at: [-33, 20], rot: 0 },
    { kind: 'berry_bush', at: [-28, 19] },
    { kind: 'flower_patch', at: [-24, 16] },
    { kind: 'house_small', at: [25, 18], rot: -Math.PI * 0.65 },
    { kind: 'fence', at: [21, 13], rot: Math.PI / 2 },
    { kind: 'fence', at: [21, 24], rot: Math.PI / 2 },
    { kind: 'berry_bush', at: [29, 23] },
    { kind: 'flower_patch', at: [22, 15] },
    { kind: 'house_small', at: [30, -18], rot: Math.PI * 0.8 },
    { kind: 'flower_patch', at: [26, -13] },
    { kind: 'barrel', at: [34, -14] },
    { kind: 'house_small', at: [-24, -38], rot: Math.PI * 0.15 },
    { kind: 'cart', at: [-18, -34], rot: -Math.PI / 3 },
    { kind: 'berry_bush', at: [-29, -33] },
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
    // — green edges: oak stands hug the town's corners —
    { kind: 'tree_oak', density: 0.25, area: [-55, -46, 22] },
    { kind: 'tree_oak', density: 0.22, area: [50, 48, 24] },
    { kind: 'tree_oak', density: 0.2, area: [-52, 44, 20] },
    { kind: 'tree_oak', density: 0.2, area: [48, -50, 22] },
    { kind: 'bush', density: 0.06, area: [0, 0, 62] },
    { kind: 'grass_tuft', density: 0.5, area: [0, 0, 74] },
    { kind: 'flower_patch', density: 0.14, area: [0, 22, 28] },
    { kind: 'stump', at: [-44, -40] },
    { kind: 'log', at: [46, 44], rot: Math.PI / 6 },
    { kind: 'rock_mossy', at: [-48, 38] },
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
