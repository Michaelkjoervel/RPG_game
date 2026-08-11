// =============================================================================
// SYLVATHORN — Bloom/Terra, stage 3 (Briarback awakens at L34).
// "Tall antlered guardian — stag body, bark plates, hanging moss cloak,
// glade-green glow. Solemn." (Design Bible §4)
// =============================================================================
// The tallest and most stately of the 9 starters: long elegant legs, a
// composed branching antler pair (a horn() with smaller horn()s grafted on
// via `at()` for the branch tips), bark shellPlate armor, and a hanging
// moss "cloak" built from many petal()/leafBlade() strands — each swaying
// gently as its own accent. The heartspark uses a green tint here instead
// of the usual warm gold, tying directly into the bible's "glade-green
// glow" callout — a good example of heartspark's color argument in use.

import * as THREE from 'three';
import { seededRandom } from '../../core/rng.js';
import * as kitDefault from '../kit.js';

export function build_sylvathorn(kit = kitDefault) {
  const pal = kit.palette(['bloom', 'terra']);
  const skin = kit.mat(0x3a3226, { rough: 0.7 }); // dark bark-brown hide
  const barkMat = kit.mat(0x2c2820, { rough: 0.8 });
  const mossMat = kit.mat(0x4a7a3c, { rough: 0.6, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const glowMat = kit.mat(0xbfe89a, { unlit: true, transparent: true, opacity: 0.85 });

  const root = new THREE.Group();

  // Tall, elegant torso.
  const body = kit.capsule(0.16, 0.42, skin, { capSeg: 5, radSeg: 9 });
  body.geometry.rotateZ(Math.PI / 2);
  root.add(body);
  body.position.y = 0.92;

  // Bark plates down the back and shoulders.
  const plateSpots = [[0, 0.13, 0.15, 0.18], [0, 0.15, -0.05, 0.2], [0.13, 0.1, 0.15, 0.12], [-0.13, 0.1, 0.15, 0.12]];
  for (const [x, y, z, sz] of plateSpots) {
    kit.at(body, kit.shellPlate(sz, sz * 0.75, sz * 0.45, barkMat, { bulge: 0.07 }), x, y, z, { rx: -0.1, ry: x !== 0 ? Math.sign(-x) * 0.5 : 0 });
  }

  const head = kit.at(body, kit.blob(0.13, skin, { seed: 50, squash: { x: 0.85, y: 0.9, z: 1.3 } }), 0, 0.24, 0.32);

  const eyeL = kit.at(head, kit.eye(0.04, { irisColor: 0x2a3a1c, skinColor: 0x3a3226, glintSize: 0.015 }), 0.08, 0.02, 0.11, { ry: 0.3 });
  const eyeR = kit.at(head, kit.eye(0.04, { irisColor: 0x2a3a1c, skinColor: 0x3a3226, glintSize: 0.015 }), -0.08, 0.02, 0.11, { ry: -0.3 });

  const earL = kit.at(head, kit.ear(0.07, skin), 0.09, 0.1, -0.01, { rz: 0.35 });
  const earR = kit.at(head, kit.ear(0.07, skin), -0.09, 0.1, -0.01, { rz: -0.35 });

  // Branching antlers of hard bark, tinted with the glade-green glow at
  // the tips. Each side: one main horn with two smaller horns grafted on
  // partway up via `at()`, forming a believable branch silhouette.
  const antlerAccents = [];
  for (const side of [1, -1]) {
    const main = kit.horn(0.32, barkMat, { bend: 0.7, baseR: 0.028, tipR: 0.006 });
    const mainAt = kit.at(head, main, side * 0.07, 0.16, -0.02, { rz: side * 0.15, ry: side * 0.1 });
    antlerAccents.push(mainAt);
    for (const [t, s] of [[0.4, 0.55], [0.65, 0.4]]) {
      const branch = kit.horn(0.14 * s / 0.5, barkMat, { bend: 0.5, baseR: 0.014, tipR: 0.004 });
      kit.at(mainAt, branch, 0, 0.32 * t, 0, { rz: side * -0.9, ry: side * 0.4 });
    }
    kit.at(mainAt, kit.orb(0.014, glowMat.clone()), 0.02 * side, 0.32, 0.02);
  }

  // --- Legs: four long, elegant legs (much longer than any other starter). ---
  const legDefs = [
    [0.13, 0.62, 0.16], [-0.13, 0.62, 0.16],
    [0.13, 0.62, -0.15], [-0.13, 0.62, -0.15],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.58, skin, { thighR: 0.06, shinR: 0.04, footLen: 0.1 }), x, y, z));

  const tail = kit.at(body, kit.tailChain(3, skin, { segLen: 0.06, startR: 0.035, endR: 0.015 }), 0, 0.1, -0.22);

  // Hanging moss cloak: many drooping petal/leafBlade strands from the
  // shoulders and neck, each an independent accent for a gentle,
  // asynchronous sway. A few carry light motes for the "glade-green glow".
  const mossAccents = [];
  const rng = seededRandom(19);
  const mossSpots = [
    [0.14, 0.2, 0.1], [-0.14, 0.2, 0.1], [0.1, 0.22, -0.1], [-0.1, 0.22, -0.1],
    [0.06, 0.24, 0.2], [-0.06, 0.24, 0.2], [0, 0.2, -0.2],
  ];
  for (const [x, y, z] of mossSpots) {
    const len = 0.14 + rng() * 0.1;
    const strand = kit.leafBlade(len, mossMat, { width: 0.03 + rng() * 0.015 });
    const a = kit.at(body, strand, x, y, z, { rx: -Math.PI / 2 + 0.1, rz: (rng() - 0.5) * 0.4 });
    mossAccents.push(a);
  }
  const glowMotes = kit.mote(9, { color: 0xbfe89a, size: 0.02, radius: 0.35, height: 0.4, speed: 0.35, seed: 27 });
  kit.at(body, glowMotes, 0, 0.15, 0.05);

  // The heartspark, tinted glade-green rather than the usual warm gold —
  // ties directly into the bible's "glade-green glow" for this species.
  const spark = kit.heartspark(0.045, 0xbfe89a, { seed: 28 });
  kit.at(body, spark, 0, 0.05, 0.2);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, ...antlerAccents, ...mossAccents],
      fx: [glowMotes, spark],
    },
    hints: {
      personality: 'calm',
      locomotion: 'quad',
      breathAmp: 0.75,
      blinkEvery: 4.8,
    },
  };
}
