// =============================================================================
// BOGRET — Tide/Terra, stage 1 (single-stage), uncommon.
// "Grumpy stone-backed toad, wears its boulder like a hat. Territorial."
// (Design Bible §4)
// =============================================================================
// A squat, wide-bodied toad with a genuine boulder — a rough noisy blob,
// not a smooth prop — balanced on its back like an ill-fitting hat. Four
// short legs are present (so the walk cycle has something to drive), but
// `hints.locomotion:'hop'` is forced explicitly rather than left to infer
// 'quad' from leg count, because a toad's gait reads as a hop, not a
// stride — kit's walkFn 'hop' case animates via body squash/launch, and the
// (mostly decorative, barely-bending) legs just tuck along for the ride.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { seededRandom } from '../../core/rng.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_bogret(kit = kitDefault) {
  const pal = kit.palette(['tide', 'terra']);
  // Swamp-toad hide: mud-dark under-body up to a lit moss-green back.
  const skin = kit.mat(0xffffff, { vertexColors: true, rough: 0.62 });
  const SKIN_LO = 0x35482e, SKIN_HI = 0x7fa060;
  const paint = (mesh, seed, lo = SKIN_LO, hi = SKIN_HI, jit = 0) => {
    if (jit) jitterGeometry(mesh.geometry, jit, seed);
    applyVertexGradient(mesh.geometry, { from: lo, to: hi, noise: 0.05, seed });
    return mesh;
  };
  const skinBelly = kit.mat(0xc9d4a0, { rough: 0.6 });
  const stone = kit.mat(0xffffff, { vertexColors: true, rough: 0.78 });

  const root = new THREE.Group();

  const body = paint(kit.blob(0.19, skin, { seed: 95, noise: 0.14, squash: { x: 1.2, y: 0.78, z: 1.15 } }), 95);
  root.add(body);
  body.position.y = 0.16;

  const belly = kit.blob(0.12, skinBelly, { seed: 96, noise: 0.06, squash: { x: 1.1, y: 0.7, z: 1 } });
  kit.at(body, belly, 0, -0.06, 0.06);
  // Pale throat pouch — the croak sac, and the toad's brightest patch.
  kit.at(body, kit.orb(0.075, skinBelly, { sy: 0.8 }), 0, 0.0, 0.2);

  const head = kit.at(body, paint(kit.orb(0.13, skin, { sz: 0.95, sy: 0.75 }), 97), 0, 0.09, 0.13);
  // Wide grumpy mouth line — a dark seam across the whole face.
  kit.at(head, kit.box(0.19, 0.012, 0.03, kit.mat(0x22301e, { rough: 0.9 })), 0, -0.03, 0.1, { rx: -0.1 });

  // Bulging, alert toad eyes perched high on the head.
  const eyeL = kit.at(head, kit.eye(0.048, { irisColor: 0xb3a020, skinColor: 0x5c7a54, glintSize: 0.017 }), 0.08, 0.06, 0.08, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.048, { irisColor: 0xb3a020, skinColor: 0x5c7a54, glintSize: 0.017 }), -0.08, 0.06, 0.08, { ry: -0.35 });

  // A perpetual grumpy frown-brow.
  kit.at(head, paint(kit.brow(0.06, skin), 98.2), 0.08, 0.1, 0.1, { rz: -0.35 });
  kit.at(head, paint(kit.brow(0.06, skin), 98.7), -0.08, 0.1, 0.1, { rz: 0.35 });

  // The boulder "hat" — a genuinely rough rock, gradient-lit, mossy on top,
  // balanced off-center like it was dropped there and never questioned.
  const rngPeb = seededRandom(97);
  const boulder = kit.blob(0.16, stone, { seed: 98, noise: 0.28, squash: { x: 1.05, y: 0.88, z: 1 } });
  applyVertexGradient(boulder.geometry, { from: 0x565046, to: 0xa8a08e, noise: 0.06, seed: 98 });
  kit.at(body, boulder, 0.02, 0.21, -0.05, { rz: 0.12, ry: 0.4 });
  for (let i = 0; i < 3; i++) {
    const peb = kit.orb(0.02 + rngPeb() * 0.015, stone);
    applyVertexGradient(peb.geometry, { from: 0x565046, to: 0xa09884, noise: 0.06, seed: 99 + i });
    kit.at(boulder, peb, (rngPeb() - 0.5) * 0.16, 0.1 + rngPeb() * 0.03, (rngPeb() - 0.5) * 0.16);
  }
  // Moss capping the boulder ties hat to swamp.
  kit.at(boulder, kit.fluffTuft(0.045, kit.mat(0x5a7a3c, { rough: 0.6 }), { count: 4, seed: 12 }), -0.04, 0.13, 0.03);

  // Four short, stubby legs, forelegs splayed in the guard-my-patch brace.
  const legDefs = [
    [0.15, 0.13, 0.11, -0.18], [-0.15, 0.13, 0.11, 0.18],
    [0.15, 0.13, -0.1, 0], [-0.15, 0.13, -0.1, 0],
  ];
  const legs = legDefs.map(([x, y, z, rz], i) => {
    const l = kit.at(body, kit.leg(0.14, skin, { thighR: 0.05, shinR: 0.038, footLen: 0.07, footMat: kit.mat(0x46603c, { rough: 0.6 }) }), x, y, z, { rz });
    for (const c of l.hip.children) if (c.isMesh && c.geometry) paint(c, 101 + i);
    for (const c of l.knee.children) if (c.isMesh && c.geometry && c !== l.foot) paint(c, 105 + i);
    return l;
  });

  const spark = kit.heartspark(0.036, pal.eye, { seed: 99 });
  kit.at(body, spark, 0, 0.02, 0.12);

  const grounded = kit.groundPlant(root);
  // Soft contact shadow so the creature reads planted on any ground.
  const contact = kit.shadowDisc(0.32, 0.32);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [boulder],
      fx: [spark],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'hop',
      breathAmp: 1.1,
      blinkEvery: 3.2,
    },
  };
}
