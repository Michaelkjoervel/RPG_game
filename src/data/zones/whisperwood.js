// WHISPERWOOD — dense, mysterious forest between the meadow and the deep dark.
// Layout (north = -Z, east = +X):
//   The south gate climbs from Dawnmeadow into birch-and-oak canopy. The main trail
//   winds north-east past a mushroom grove to Keeper Liora's light-shaft glade, then
//   on to the Gloamcavern gate. A fainter trail breaks off north-west toward a hidden
//   waterfall that conceals the way to Starfall Glade. A scarred, half-dead clearing
//   sits just off the main trail — the site of the story's first Hollowed encounter.
// Conventions: npc.face = yaw radians (0 faces +Z, PI/2 faces +X). prop.rot = same (hint).

export const ZONE = {
  id: 'whisperwood',
  name: 'Whisperwood',
  biome: 'forest',
  size: 240,

  ambient: {
    skyTop: 0x53869c, skyBottom: 0xafcaa2,
    fogColor: 0x8fa898, fogDensity: 0.016,
    sun: 0xdfe8c8,
    music: 'forest',
    weather: 'gloom', // the wood is rarely fully bright; low wisps drift under the canopy
  },

  terrain: { kind: 'forest', hills: 1.3, seed: 34 },
  water: null,

  paths: [
    { from: [0, 112], to: [10, 70], width: 5 },
    { from: [10, 70], to: [40, 22], width: 5 },
    { from: [40, 22], to: [90, 10], width: 4 },
    { from: [90, 10], to: [112, 0], width: 4 },
    { from: [55, 16], to: [74, 8], width: 2.5 },   // herbalist's hut
    { from: [48, 14], to: [52, -32], width: 3 },   // Liora's glade
    { from: [10, 65], to: [-34, 36], width: 3 },   // mushroom grove
    { from: [-38, 30], to: [-88, -80], width: 2 }, // faint trail to the hidden falls
    { from: [16, 66], to: [28, 78], width: 2 },    // the scarred clearing
  ],

  props: [
    // — mushroom grove (myclet habitat) —
    { kind: 'mushroom_giant', at: [-34, 36], scale: 1.3 },
    { kind: 'mushroom_giant', at: [-42, 30], scale: 1.1 },
    { kind: 'mushroom_cluster', density: 0.5, area: [-36, 34, 16] },
    { kind: 'fern', density: 0.4, area: [-36, 34, 20] },
    // — the grove spills onto the main trail: mushrooms all along the walk so the
    //   wood's identity is visible from the south gate to the cavern gate —
    { kind: 'mushroom_cluster', density: 0.4, area: [4, 90, 16] },
    { kind: 'mushroom_cluster', density: 0.38, area: [14, 62, 15] },
    { kind: 'mushroom_cluster', density: 0.36, area: [32, 38, 16] },
    { kind: 'mushroom_cluster', density: 0.36, area: [62, 16, 16] },
    { kind: 'mushroom_cluster', density: 0.32, area: [96, 6, 14] },
    { kind: 'mushroom_giant', at: [-4, 84], scale: 1.0 },
    { kind: 'mushroom_giant', at: [18, 52], scale: 1.15 },
    { kind: 'mushroom_giant', at: [46, 28], scale: 0.95 },
    { kind: 'mushroom_giant', at: [84, 4], scale: 1.1 },
    // — Keeper Liora's light-shaft glade —
    { kind: 'shrine_stone', at: [52, -35], scale: 1.15 },
    { kind: 'shrine_stone', at: [46, -33], scale: 0.85 },
    { kind: 'shrine_stone', at: [58, -33], scale: 0.85 },
    { kind: 'shrine_stone', at: [52, -42], scale: 0.8 },
    { kind: 'tree_glow', at: [40, -40], scale: 1.1 },
    { kind: 'tree_glow', at: [64, -40], scale: 1.1 },
    { kind: 'tree_glow', at: [40, -18], scale: 0.9 },
    { kind: 'tree_glow', at: [64, -18], scale: 0.9 },
    { kind: 'tree_glow', at: [52, -50], scale: 1.0 },
    { kind: 'fern', density: 0.3, area: [52, -35, 18] },
    // — herbalist Syl's hut —
    { kind: 'house_small', at: [76, 6], rot: -Math.PI / 2 },
    { kind: 'berry_bush', at: [80, 12] },
    { kind: 'flower_patch', at: [72, 14] },
    { kind: 'crate', at: [78, 0] },
    // — the scarred clearing (first Hollowed encounter site) —
    { kind: 'tree_dead', at: [28, 80], scale: 1.2 },
    { kind: 'tree_dead', at: [34, 74], scale: 0.9 },
    { kind: 'tree_dead', at: [24, 72], scale: 1.0 },
    { kind: 'rock', at: [30, 78], scale: 1.1 },
    { kind: 'grass_tuft', density: 0.08, area: [28, 76, 12] }, // deliberately sparse — life has thinned here
    // — the hidden waterfall (conceals the Starfall Glade way) —
    { kind: 'waterfall', at: [-92, -88], scale: 1.3 },
    { kind: 'hangmoss', at: [-86, -82] },
    { kind: 'hangmoss', at: [-98, -92] },
    { kind: 'fern', density: 0.3, area: [-90, -86, 14] },
    { kind: 'rock_mossy', at: [-80, -78] },
    // — general canopy, dense and towering —
    { kind: 'tree_birch', density: 0.34, area: [0, 0, 118] },
    { kind: 'tree_oak', density: 0.2, area: [0, 0, 110] },
    { kind: 'tree_pine', density: 0.14, area: [-40, -40, 60] },
    { kind: 'fern', density: 0.25, area: [0, 0, 110] },
    { kind: 'grass_tuft', density: 0.3, area: [0, 0, 110] },
    { kind: 'hangmoss', at: [20, -60] },
    { kind: 'hangmoss', at: [-20, 60] },
    { kind: 'rock_mossy', at: [70, -60] },
    { kind: 'rock_mossy', at: [-60, 70] },
    { kind: 'stump', at: [0, 40] },
    { kind: 'log', at: [14, 87], rot: Math.PI / 3 }, // beside the spawn trail — mossy fallen trunk greets the walk in
    { kind: 'log', at: [-10, -10], rot: Math.PI / 4 },
    { kind: 'fence', at: [0, 108], rot: 0 },
    { kind: 'fence', at: [12, 108], rot: 0 },
  ],

  portals: [
    { to: 'dawnmeadow', at: [0, 112], radius: 3, label: 'To Dawnmeadow', spawn: [0, -94] },
    { to: 'gloamcavern', at: [112, 0], radius: 3, label: 'To Gloamcavern', spawn: [-86, 0] },
    { to: 'starfallglade', at: [-94, -94], radius: 3, label: 'Behind the Falls', spawn: [52, 52], flag: 'glade_open' },
  ],

  npcs: [
    { id: 'keeper_liora', at: [52, -28], face: Math.PI }, // faces -Z into her glade
    { id: 'herbalist_syl', at: [74, 10], face: -Math.PI / 2 },
  ],

  encounters: {
    patches: [
      { at: [20, 40], r: 9 },
      { at: [70, 20], r: 8 },
      { at: [-10, -20], r: 8 },
    ],
    table: [
      { speciesId: 'myclet', w: 55, lv: [5, 8] },
      { speciesId: 'duskit', w: 50, lv: [5, 8] },
      { speciesId: 'dapplyn', w: 18, lv: [7, 9] },
      { speciesId: 'lanterling', w: 16, lv: [7, 9] },
      { speciesId: 'fungore', w: 14, lv: [8, 10] },
      { speciesId: 'noctyra', w: 13, lv: [8, 10] },
      { speciesId: 'glowvern', w: 10, lv: [8, 10] },
    ],
    rate: 0.2,
    roaming: [
      // Keeper Liora's lost companion — tucked near the falls, per her side quest.
      { speciesId: 'dapplyn', count: 1, area: [-70, -60, 26] },
    ],
  },

  interactables: [
    { kind: 'shrine', at: [52, -35] },
    { kind: 'chest', at: [-46, 24], item: 'super_tonic', qty: 1, flag: 'ww_chest1' },
    { kind: 'chest', at: [95, -8], item: 'remedy', qty: 2, flag: 'ww_chest2' },
    { kind: 'shard', at: [-6, 30], flag: 'ww_shard1', dialogue: 'lore_ww_1' },
    { kind: 'sparkle', at: [30, -5], item: 'glazed_charm', qty: 1, flag: 'ww_spark1' },
  ],

  spawn: [8, 90],
};
