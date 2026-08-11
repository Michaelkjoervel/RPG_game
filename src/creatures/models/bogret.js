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

export function build_bogret(kit = kitDefault) {
  const pal = kit.palette(['tide', 'terra']);
  const skin = kit.mat(0x5c7a54, { rough: 0.6 });
  const skinBelly = kit.mat(0xc4cf9c, { rough: 0.6 });
  const stone = kit.mat(0x8a8478, { rough: 0.75 });

  const root = new THREE.Group();

  const body = kit.blob(0.19, skin, { seed: 95, noise: 0.14, squash: { x: 1.2, y: 0.78, z: 1.15 } });
  root.add(body);
  body.position.y = 0.16;

  const belly = kit.blob(0.12, skinBelly, { seed: 96, noise: 0.06, squash: { x: 1.1, y: 0.7, z: 1 } });
  kit.at(body, belly, 0, -0.06, 0.06);

  const head = kit.at(body, kit.orb(0.13, skin, { sz: 0.95, sy: 0.75 }), 0, 0.09, 0.13);

  // Bulging, alert toad eyes perched high on the head.
  const eyeL = kit.at(head, kit.eye(0.048, { irisColor: 0xb3a020, skinColor: 0x5c7a54, glintSize: 0.017 }), 0.08, 0.06, 0.08, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.048, { irisColor: 0xb3a020, skinColor: 0x5c7a54, glintSize: 0.017 }), -0.08, 0.06, 0.08, { ry: -0.35 });

  // A perpetual grumpy frown-brow.
  kit.at(head, kit.brow(0.06, skin), 0.08, 0.1, 0.1, { rz: -0.35 });
  kit.at(head, kit.brow(0.06, skin), -0.08, 0.1, 0.1, { rz: 0.35 });

  // The boulder "hat" — a genuinely rough rock, not a polished prop, balanced off-center.
  const rngPeb = seededRandom(97);
  const boulder = kit.blob(0.14, stone, { seed: 98, noise: 0.28, squash: { x: 1.05, y: 0.85, z: 1 } });
  kit.at(body, boulder, 0.015, 0.2, -0.05, { rz: 0.1, ry: 0.4 });
  for (let i = 0; i < 3; i++) {
    kit.at(boulder, kit.orb(0.02 + rngPeb() * 0.015, stone), (rngPeb() - 0.5) * 0.16, 0.09 + rngPeb() * 0.03, (rngPeb() - 0.5) * 0.16);
  }

  // Four short, stubby legs.
  const legDefs = [
    [0.14, 0.13, 0.11], [-0.14, 0.13, 0.11],
    [0.15, 0.13, -0.1], [-0.15, 0.13, -0.1],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.14, skin, { thighR: 0.05, shinR: 0.038, footLen: 0.07 }), x, y, z));

  const spark = kit.heartspark(0.036, pal.eye, { seed: 99 });
  kit.at(body, spark, 0, 0.02, 0.12);

  return {
    group: kit.groundPlant(root),
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
