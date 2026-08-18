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
  kit.paint(body, { from: 0x453824, to: 0x7a6244, noise: 0.06, seed: 30 });
  root.add(body);
  body.position.y = 0.145;

  // Thistle quills — a proper crown of them now: longer, thicker, two-tone
  // (violet shading to a pale tip via a small cap cone), staggered rows.
  // They ride along with body's breathing for free (no accent entries).
  const rng = seededRandom(7);
  const quillTip = kit.mat(0xc9a8d8, { rough: 0.5 });
  for (let row = 0; row < 4; row++) {
    const rowZ = 0.09 - row * 0.065;
    const count = 5 - Math.min(row, 2);
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0.5;
      const x = (t - 0.5) * (0.17 - row * 0.02);
      const len = 0.08 + rng() * 0.035;
      const q = kit.cone(0.017, len, quillMat, { segments: 5 });
      kit.at(q, kit.cone(0.008, len * 0.36, quillTip, { segments: 5 }), 0, len * 0.62, 0);
      kit.at(body, q, x, 0.095 - row * 0.012, rowZ, { rx: -0.25 - row * 0.22, rz: x * 1.8 + (rng() - 0.5) * 0.2 });
    }
  }

  const head = kit.at(body, kit.orb(0.09, skin, { sz: 1.05 }), 0, -0.02, 0.13);
  kit.paint(head, { from: 0x4e3f2a, to: 0x7a6244, noise: 0.05, seed: 31 });

  // Shy body language: eyes sit a touch low and peek out from under the
  // quill crown — but they FACE FORWARD now, so the shyness reads as a
  // lowered head, not as averted blank eyeballs.
  const eyeL = kit.at(head, kit.eye(0.034, { irisColor: 0x2a2016, skinColor: 0x5a4a34, glintSize: 0.013 }), 0.048, -0.005, 0.072, { ry: 0.25 });
  const eyeR = kit.at(head, kit.eye(0.034, { irisColor: 0x2a2016, skinColor: 0x5a4a34, glintSize: 0.013 }), -0.048, -0.005, 0.072, { ry: -0.25 });
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
