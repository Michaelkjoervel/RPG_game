// SKYREACH PASS — a storm-lashed mountain switchback. Thin air, wind-bent pines,
// rope bridges over the gaps, snow at the crown.
// Layout (north = -Z, "up" the mountain; south = +Z, the way down to Mirrorlake):
//   The south gate begins the climb: a switchbacking trail crosses two rope bridges,
//   passes climber Bo's camp midway, then Keeper Sera's summit ring under the eternal
//   storm, through the snow line, and down the far side to the Sunken Ruins gate. A
//   side spur east of the camp drops into a warm pocket of magmite vents.
// Conventions: npc.face = yaw radians (0 faces +Z, PI/2 faces +X). prop.rot = same (hint).

export const ZONE = {
  id: 'skyreach',
  name: 'Skyreach Pass',
  biome: 'mountain',
  size: 240,

  ambient: {
    skyTop: 0x3c4658, skyBottom: 0x6a7488,
    fogColor: 0x525c70, fogDensity: 0.02,
    sun: 0xc9d4e4,
    music: 'mountain',
    weather: 'storm', // static per design; story later narrates the storm "calming" without a data change
  },

  terrain: { kind: 'mountain', hills: 1.8, seed: 61 },
  water: null,

  paths: [
    { from: [0, 112], to: [-30, 80], width: 4 },
    { from: [-30, 80], to: [20, 50], width: 4 },
    { from: [20, 50], to: [-20, 15], width: 4 },
    { from: [-20, 15], to: [10, -20], width: 3.5 },
    { from: [10, -20], to: [-10, -55], width: 3.5 },
    { from: [-10, -55], to: [0, -90], width: 4 },
    { from: [0, -90], to: [0, -112], width: 5 },
    { from: [15, -24], to: [55, -10], width: 2.5 }, // spur to the magmite vents
  ],

  props: [
    // — the two switchback crossings —
    { kind: 'bridge', at: [-6, 64], rot: Math.PI / 5, scale: 1.2 },
    { kind: 'bridge', at: [-2, 32], rot: -Math.PI / 7, scale: 1.2 },
    { kind: 'rock', at: [-14, 66], scale: 1.2 },
    { kind: 'rock', at: [10, 30], scale: 1.1 },
    // — climber Bo's camp, midway —
    { kind: 'tent', at: [8, -18], rot: -Math.PI / 4 },
    { kind: 'campfire', at: [4, -14] },
    { kind: 'crate', at: [12, -22] },
    { kind: 'rock_mossy', at: [16, -16] },
    // — Keeper Sera's summit ring, under the storm —
    { kind: 'shrine_stone', at: [-5, -58], scale: 1.2 },
    { kind: 'shrine_stone', at: [-12, -56], scale: 0.85 },
    { kind: 'shrine_stone', at: [2, -56], scale: 0.85 },
    { kind: 'shrine_stone', at: [-5, -65], scale: 0.8 },
    { kind: 'rock', at: [-16, -62], scale: 1.4 },
    { kind: 'rock', at: [8, -62], scale: 1.3 },
    { kind: 'banner', at: [-5, -70], rot: Math.PI },
    // — the snow line near the top —
    { kind: 'snow_pile', density: 0.3, area: [0, -68, 55] },
    { kind: 'ice_spike', density: 0.14, area: [0, -75, 45] },
    // — hand-placed markers up the ascent so the switchbacks never read as a
    //   featureless snowfield: frost-heaved boulders and ice teeth by the trail —
    { kind: 'rock', at: [-24, 20], scale: 1.5 },
    { kind: 'ice_spike', at: [-14, 8], scale: 1.1 },
    { kind: 'ice_spike', at: [16, -4], scale: 0.9 },
    { kind: 'rock', at: [-4, -34], scale: 1.6 },
    { kind: 'ice_spike', at: [-18, -40], scale: 1.2 },
    { kind: 'ice_spike', at: [6, -48], scale: 1.0 },
    { kind: 'rock', at: [-20, -76], scale: 1.4 },
    { kind: 'ice_spike', at: [10, -82], scale: 1.15 },
    { kind: 'ice_spike', density: 0.1, area: [0, -30, 30] },
    // — the magmite vent pocket, a warm scar amid the cold —
    { kind: 'lava_rock', density: 0.3, area: [58, -10, 18] },
    { kind: 'ember_vent', at: [58, -10] },
    { kind: 'ember_vent', at: [66, -4] },
    { kind: 'rock', at: [50, -18], scale: 1.1 },
    // — wind-bent pines and switchback scree, all the way up —
    { kind: 'tree_pine', density: 0.24, area: [0, 40, 100] },
    { kind: 'tree_pine', density: 0.1, area: [0, -40, 80] },
    { kind: 'rock', density: 0.18, area: [0, 0, 108] },
    { kind: 'rock_mossy', density: 0.08, area: [0, 60, 70] },
    { kind: 'grass_tuft', density: 0.14, area: [0, 70, 60] },
    { kind: 'stump', at: [-25, 40] },
    { kind: 'log', at: [30, 20], rot: Math.PI / 3 },
    { kind: 'fence', at: [0, 108], rot: 0 },
    { kind: 'fence', at: [10, 108], rot: 0 },
  ],

  portals: [
    { to: 'mirrorlake', at: [0, 112], radius: 3, label: 'To Mirrorlake', spawn: [0, -116] },
    { to: 'sunkenruins', at: [0, -112], radius: 3, label: 'To the Sunken Ruins', spawn: [0, 96] },
  ],

  npcs: [
    { id: 'climber_bo', at: [6, -16], face: Math.PI * 0.75 },
    { id: 'keeper_sera', at: [-5, -51], face: Math.PI }, // faces -Z into her ring
  ],

  encounters: {
    patches: [
      { at: [-15, 40], r: 9 },
      { at: [-5, -30], r: 9 },
    ],
    table: [
      { speciesId: 'nimbis', w: 55, lv: [18, 22] },
      { speciesId: 'rimehorn', w: 18, lv: [20, 24] },
      { speciesId: 'magmite', w: 16, lv: [20, 24] },
      { speciesId: 'stratovane', w: 6, lv: [23, 26] },
    ],
    rate: 0.2,
    roaming: [],
  },

  interactables: [
    { kind: 'shrine', at: [-5, -58] },
    { kind: 'chest', at: [68, -6], item: 'gilded_charm', qty: 1, flag: 'sr_chest_vents' },
    { kind: 'chest', at: [-24, 48], item: 'grand_tonic', qty: 1, flag: 'sr_chest1' },
    { kind: 'sparkle', at: [0, -85], item: 'froststone', qty: 1, flag: 'sr_spark1' },
  ],

  spawn: [0, 100],
};
