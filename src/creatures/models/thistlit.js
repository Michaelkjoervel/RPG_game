// =============================================================================
// THISTLIT — Bloom, stage 1 starter.
// "Hedgehog-seedling, thistle-quill back, one sprout antenna. Shy but
// stubborn." (Design Bible §4)
// =============================================================================
// A good example of "small sub-parts don't all need their own accent
// entry": the whole back of quills is built as plain children of `body`
// (they move for free with body's own breathing) — only the ONE sprout
// antenna (an asymmetric, characterful detail called out explicitly in the
// bible) gets its own accent entry for independent sway. "Shy" is played
// through body language, not geometry: the rest head-tilt sits slightly
// down and to the side rather than looking straight out.

import * as THREE from 'three';
import { seededRandom } from '../../core/rng.js';
import * as kitDefault from '../kit.js';

export function build_thistlit(kit = kitDefault) {
  const pal = kit.palette(['bloom']);
  const skin = kit.mat(0x5a4a34, { rough: 0.75 }); // soil-brown seedling body
  const quillMat = kit.mat(0x7a5a8a, { rough: 0.6 }); // muted thistle-violet
  const sproutMat = kit.mat(pal.primary, { rough: 0.5 });

  const root = new THREE.Group();

  const body = kit.blob(0.13, skin, { seed: 30, noise: 0.14, squash: { x: 1, y: 0.88, z: 1.15 } });
  root.add(body);
  body.position.y = 0.145;

  // Thistle quills — many small cones directly on the body, several
  // staggered rows. These do NOT get their own accent entries: they ride
  // along with body's breathing for free, which is exactly right for dense
  // small decoration like this.
  const rng = seededRandom(7);
  for (let row = 0; row < 4; row++) {
    const rowZ = 0.09 - row * 0.065;
    const count = 5 - Math.min(row, 2);
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0.5;
      const x = (t - 0.5) * (0.16 - row * 0.02);
      const len = 0.05 + rng() * 0.02;
      const q = kit.cone(0.012, len, quillMat, { segments: 5 });
      kit.at(body, q, x, 0.1 - row * 0.012, rowZ, { rx: -0.3 - row * 0.15, rz: x * 1.5 });
    }
  }

  const head = kit.at(body, kit.orb(0.09, skin, { sz: 1.05 }), 0, -0.02, 0.13);

  // Shy body language: eyes sit a touch low, slightly averted, rather than
  // straight ahead.
  const eyeL = kit.at(head, kit.eye(0.03, { irisColor: 0x2a2016, skinColor: 0x5a4a34, glintSize: 0.011 }), 0.05, -0.01, 0.065, { ry: 0.45 });
  const eyeR = kit.at(head, kit.eye(0.03, { irisColor: 0x2a2016, skinColor: 0x5a4a34, glintSize: 0.011 }), -0.05, -0.01, 0.065, { ry: -0.45 });
  head.rotation.x = 0.12; // shy downward tilt, baked into the rest pose

  // Small floppy ears.
  const earL = kit.at(head, kit.ear(0.04, skin, { floppy: true }), 0.07, 0.03, -0.01, { rz: 0.6, ry: -0.2 });
  const earR = kit.at(head, kit.ear(0.04, skin, { floppy: true }), -0.07, 0.03, -0.01, { rz: -0.6, ry: 0.2 });

  // The ONE sprout antenna — asymmetric and characterful, per the bible.
  // Gets its own accent entry since it should sway independently.
  const sprout = kit.at(head, kit.leafBlade(0.08, sproutMat, { width: 0.018 }), 0.02, 0.09, -0.01, { rx: -1.3, rz: 0.3 });

  // Four tiny stubby legs.
  const legDefs = [
    [0.07, 0.04, 0.07], [-0.07, 0.04, 0.07],
    [0.07, 0.04, -0.06], [-0.07, 0.04, -0.06],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.12, skin, { thighR: 0.03, shinR: 0.022, footLen: 0.04 }), x, y, z));

  // Small stub tail, mostly hidden under the quills.
  const tail = kit.at(body, kit.tailChain(2, skin, { segLen: 0.03, startR: 0.025, endR: 0.012 }), 0, 0, -0.11);

  const spark = kit.heartspark(0.024, pal.eye, { seed: 31 });
  kit.at(body, spark, 0, -0.02, 0.115);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, sprout],
      fx: [spark],
    },
    hints: {
      personality: 'skittish',
      locomotion: 'quad',
      breathAmp: 0.85,
      blinkEvery: 2.1,
    },
  };
}
