// STARFALL GLADE — a tiny, hidden dell under permanent dusk, reached only through the
// falls behind Whisperwood. A ring of glow-trees stands sentinel around a shallow
// crater pool where legend says Aurios walks. No wild Kindred live here; the
// Firstborn's manifestation is entirely story-driven.
// Layout: intimate and radial — everything orbits the crater pool at the center.
// Conventions: npc.face = yaw radians (0 faces +Z, PI/2 faces +X). prop.rot = same (hint).

export const ZONE = {
  id: 'starfallglade',
  name: 'Starfall Glade',
  biome: 'glade',
  size: 140,

  ambient: {
    skyTop: 0x2c2650, skyBottom: 0x6a4e78,
    fogColor: 0x4a3d68, fogDensity: 0.012,
    sun: 0xffcf9c,
    music: 'glade',
    weather: 'clear',
    stars: true, // permanent twilight — sky.js keeps starfields visible at any dayTime
  },

  terrain: { kind: 'glade', hills: 0.6, seed: 91 },

  water: { level: 0.18, size: 36, pos: [0, 0] }, // the shallow crater pool

  paths: [
    { from: [58, 58], to: [30, 30], width: 4 },
    { from: [30, 30], to: [0, 20], width: 4 },
  ],

  props: [
    // — the crater centerpiece: a ring of rune-lit shrine stones at the pool's rim,
    //   where legend says Aurios first touched down —
    { kind: 'shrine_stone', at: [0, -21], scale: 1.25 },
    { kind: 'shrine_stone', at: [19, -19], scale: 0.95 },
    { kind: 'shrine_stone', at: [21, 0], scale: 1.15 },
    { kind: 'shrine_stone', at: [19, 19], scale: 0.95 },
    { kind: 'shrine_stone', at: [0, 21], scale: 1.25 },
    { kind: 'shrine_stone', at: [-19, 19], scale: 0.95 },
    { kind: 'shrine_stone', at: [-21, 0], scale: 1.15 },
    { kind: 'shrine_stone', at: [-19, -19], scale: 0.95 },
    // — starfall crystal, scattered where shards struck —
    { kind: 'crystal_cluster', at: [12, -26], scale: 1.1 },
    { kind: 'crystal_cluster', at: [-26, -12], scale: 1.0 },
    { kind: 'crystal_cluster', at: [26, 14], scale: 0.95 },
    { kind: 'crystal_cluster', at: [-14, 27], scale: 1.1 },
    { kind: 'crystal_cluster', at: [34, -22], scale: 0.9 },
    { kind: 'crystal_cluster', at: [-36, -20], scale: 1.0 },
    { kind: 'crystal_cluster', at: [24, 30], scale: 0.85 }, // beside the entry path — first thing the Warden passes
    // — the glow-tree ring around the crater pool —
    { kind: 'tree_glow', at: [0, -28], scale: 1.1 },
    { kind: 'tree_glow', at: [20, -20], scale: 1.05 },
    { kind: 'tree_glow', at: [28, 0], scale: 1.1 },
    { kind: 'tree_glow', at: [20, 20], scale: 1.05 },
    { kind: 'tree_glow', at: [0, 28], scale: 1.1 },
    { kind: 'tree_glow', at: [-20, 20], scale: 1.05 },
    { kind: 'tree_glow', at: [-28, 0], scale: 1.1 },
    { kind: 'tree_glow', at: [-20, -20], scale: 1.05 },
    // — lumen flowers, spiraling out from the water's edge —
    { kind: 'flower_patch', at: [8, 6], scale: 0.8 },
    { kind: 'flower_patch', at: [-6, 10], scale: 0.85 },
    { kind: 'flower_patch', at: [-12, -4], scale: 0.9 },
    { kind: 'flower_patch', at: [-2, -14], scale: 0.95 },
    { kind: 'flower_patch', at: [14, -10], scale: 1.0 },
    { kind: 'flower_patch', at: [22, 4], scale: 1.0 },
    { kind: 'flower_patch', at: [16, 18], scale: 1.05 },
    { kind: 'flower_patch', at: [0, 24], scale: 1.05 },
    { kind: 'flower_patch', at: [-18, 14], scale: 1.1 },
    { kind: 'flower_patch', at: [-24, -8], scale: 1.1 },
    // — glowfern undergrowth and soft edges —
    { kind: 'glowfern', density: 0.3, area: [0, 0, 45] },
    { kind: 'fern', density: 0.2, area: [0, 0, 55] },
    { kind: 'grass_tuft', density: 0.35, area: [0, 0, 60] },
    { kind: 'rock_mossy', at: [40, -10] },
    { kind: 'rock_mossy', at: [-38, 12] },
    { kind: 'crystal_cluster', at: [46, 30], scale: 0.8 },
    { kind: 'fence', at: [52, 52], rot: -Math.PI / 4 },
  ],

  portals: [
    { to: 'whisperwood', at: [58, 58], radius: 3, label: 'Back to Whisperwood', spawn: [-88, -88] },
  ],

  npcs: [],

  encounters: { patches: [], table: [], rate: 0, roaming: [] }, // legendary Aurios arrives via story only

  interactables: [
    { kind: 'shard', at: [-8, 34], flag: 'sg_shard1', dialogue: 'lore_glade_1' },
  ],

  spawn: [32, 32],
  spawnFace: -Math.PI * 0.75, // face the crater pool — the hero view
};
