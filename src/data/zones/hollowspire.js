// THE HOLLOW SPIRE — the Order's cold geometric fortress. A linear gauntlet: corridor,
// holding cells, Vess's arena, Dorn's arena, then Sol's cracked-sky summit sanctum.
// Layout (north = -Z, up the spire; south = +Z, the way back to the Sunken Ruins):
//   Entrance corridor climbs from the south gate past a side room of empty holding
//   cells, into Lieutenant Vess's frost-touched arena, on to Lieutenant Dorn's
//   scorched arena, and finally up to Archon Sol's summit sanctum. No wild Kindred
//   dwell here — every fight in this zone is scripted.
// Conventions: npc.face = yaw radians (0 faces +Z, PI/2 faces +X). prop.rot = same (hint).

export const ZONE = {
  id: 'hollowspire',
  name: 'The Hollow Spire',
  biome: 'spire',
  size: 180,

  ambient: {
    skyTop: 0x14141c, skyBottom: 0x1e1c26,
    fogColor: 0x181620, fogDensity: 0.026,
    sun: 0x9a86b0,
    music: 'spire',
    weather: 'gloom',
  },

  terrain: { kind: 'spire', hills: 0.2, seed: 88 },
  water: null,

  paths: [
    { from: [0, 82], to: [0, 50], width: 5 },
    { from: [0, 50], to: [-15, 20], width: 4 },
    { from: [-15, 20], to: [0, -10], width: 4 },
    { from: [0, -10], to: [15, -40], width: 4 },
    { from: [15, -40], to: [0, -70], width: 4 },
    { from: [10, 45], to: [35, 35], width: 2.5 }, // holding cells side room
  ],

  props: [
    // — entrance corridor —
    { kind: 'spire_wall', density: 0.3, area: [0, 65, 22] },
    { kind: 'banner', at: [-10, 60], rot: Math.PI / 2 },
    { kind: 'banner', at: [10, 60], rot: -Math.PI / 2 },
    { kind: 'ember_vent', at: [-8, 48], scale: 0.8 },
    { kind: 'ember_vent', at: [8, 48], scale: 0.8 },
    // — the holding cells —
    { kind: 'fence', at: [30, 32], rot: 0 },
    { kind: 'fence', at: [40, 32], rot: 0 },
    { kind: 'fence', at: [30, 40], rot: Math.PI / 2 },
    { kind: 'fence', at: [40, 40], rot: Math.PI / 2 },
    { kind: 'crate', at: [35, 36] },
    { kind: 'crate', at: [37, 30], scale: 0.85 },
    { kind: 'spire_wall', density: 0.2, area: [35, 36, 14] },
    // — Lieutenant Vess's arena (frost-touched) —
    { kind: 'spire_wall', density: 0.22, area: [-15, 12, 20] },
    { kind: 'ice_spike', at: [-24, 6], scale: 0.9 },
    { kind: 'ice_spike', at: [-6, 4], scale: 0.9 },
    { kind: 'ember_vent', at: [-15, 20], scale: 0.7 },
    { kind: 'banner', at: [-25, 16], rot: Math.PI / 3 },
    // — Lieutenant Dorn's arena (scorched) —
    { kind: 'spire_wall', density: 0.22, area: [15, -38, 20] },
    { kind: 'lava_rock', at: [8, -44], scale: 1.0 },
    { kind: 'lava_rock', at: [24, -34], scale: 0.9 },
    { kind: 'ember_vent', at: [15, -46] },
    { kind: 'banner', at: [26, -40], rot: -Math.PI / 3 },
    // — Archon Sol's summit sanctum, skylight cracked open above —
    { kind: 'spire_wall', at: [-16, -78], rot: Math.PI / 2, scale: 1.4 },
    { kind: 'spire_wall', at: [16, -78], rot: -Math.PI / 2, scale: 1.4 },
    { kind: 'spire_wall', at: [0, -88], scale: 1.4 },
    { kind: 'ember_vent', at: [-10, -70], scale: 0.8 },
    { kind: 'ember_vent', at: [10, -70], scale: 0.8 },
    { kind: 'banner', at: [-14, -84], rot: Math.PI / 4 },
    { kind: 'banner', at: [14, -84], rot: -Math.PI / 4 },
    // — general corridor dressing, cold and geometric —
    { kind: 'spire_wall', density: 0.14, area: [0, 0, 80] },
    { kind: 'ember_vent', at: [0, 0], scale: 0.7 },
    { kind: 'rock', at: [-6, -15], scale: 0.8 },
    { kind: 'fence', at: [0, 76], rot: 0 },
  ],

  portals: [
    { to: 'sunkenruins', at: [0, 82], radius: 3, label: 'To the Sunken Ruins', spawn: [0, -96] },
  ],

  npcs: [
    { id: 'lt_vess', at: [-15, 8], face: Math.PI },
    { id: 'lt_dorn', at: [15, -32], face: Math.PI },
    { id: 'archon_sol', at: [0, -80], face: Math.PI },
  ],

  encounters: { patches: [], table: [], rate: 0, roaming: [] }, // every fight here is scripted

  interactables: [
    { kind: 'chest', at: [32, 38], item: 'vigil_bloom', qty: 1, flag: 'hs_chest_cells' },
    { kind: 'sparkle', at: [0, -60], item: 'starwoven_charm', qty: 1, flag: 'hs_spark1' },
  ],

  spawn: [0, 70],
};
