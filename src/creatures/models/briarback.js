// =============================================================================
// BRIARBACK — Bloom, stage 2 (Thistlit awakens at L16).
// "Bristling thorn-boar, bramble armor, berry-red eyes. Protective
// headbutter." (Design Bible §4)
// =============================================================================
// Stouter and tougher than Thistlit: shellPlate armor scattered with small
// thorn cones (echoing Thistlit's quills, keeping the awakening chain
// visually related), forward-swept tusks for the "headbutter" identity, and
// the bible's one specific, load-bearing color note — berry-red eyes.

import * as THREE from 'three';
import { seededRandom } from '../../core/rng.js';
import * as kitDefault from '../kit.js';

export function build_briarback(kit = kitDefault) {
  const pal = kit.palette(['bloom']);
  const skin = kit.mat(0x4a3826, { rough: 0.7 });
  const bramble = kit.mat(0x5c4a30, { rough: 0.65 });
  const thornMat = kit.mat(0x6a4a6a, { rough: 0.55 });

  const root = new THREE.Group();

  const body = kit.blob(0.24, skin, { seed: 40, noise: 0.13, squash: { x: 1.1, y: 0.95, z: 1.25 } });
  root.add(body);
  body.position.y = 0.28;

  // Bramble-armor plates across the back, each dotted with a couple of
  // small thorns — visually rhymes with Thistlit's quill rows.
  const plateSpots = [[0, 0.17, 0.14, 0.16], [0, 0.19, -0.05, 0.18], [0, 0.16, -0.22, 0.13]];
  const rngThorn = seededRandom(9);
  for (const [x, y, z, sz] of plateSpots) {
    kit.at(body, kit.shellPlate(sz, sz * 0.65, sz * 0.5, bramble, { bulge: 0.1 }), x, y, z, { rx: -0.1 });
    for (let i = 0; i < 3; i++) {
      const tx = (rngThorn() - 0.5) * sz * 0.8, tz = z + (rngThorn() - 0.5) * sz * 0.5;
      kit.at(body, kit.cone(0.014, 0.045, thornMat, { segments: 5 }), tx, y + sz * 0.28, tz, { rx: -0.4, rz: tx * 2 });
    }
  }

  const head = kit.at(body, kit.orb(0.15, skin, { sz: 1.1, sy: 0.85 }), 0, 0.02, 0.22);

  // Berry-red eyes — the bible's specific color note for this species.
  const eyeL = kit.at(head, kit.eye(0.042, { irisColor: 0xb3213a, skinColor: 0x4a3826, glintSize: 0.015 }), 0.09, 0.02, 0.1, { ry: 0.3 });
  const eyeR = kit.at(head, kit.eye(0.042, { irisColor: 0xb3213a, skinColor: 0x4a3826, glintSize: 0.015 }), -0.09, 0.02, 0.1, { ry: -0.3 });

  const earL = kit.at(head, kit.ear(0.06, skin), 0.1, 0.09, -0.02, { rz: 0.25 });
  const earR = kit.at(head, kit.ear(0.06, skin), -0.1, 0.09, -0.02, { rz: -0.25 });

  // Forward-swept tusks — the "protective headbutter" identity.
  const tuskMat = kit.mat(0xe0d8c4, { rough: 0.35 });
  const tuskL = kit.at(head, kit.fang(0.09, tuskMat, { r: 0.022 }), 0.08, -0.06, 0.14, { rx: Math.PI * 0.72, rz: -0.2 });
  const tuskR = kit.at(head, kit.fang(0.09, tuskMat, { r: 0.022 }), -0.08, -0.06, 0.14, { rx: Math.PI * 0.72, rz: 0.2 });

  // Bristly brow — a couple of short quills over each eye for an alert,
  // ready-to-charge expression.
  kit.at(head, kit.cone(0.012, 0.04, thornMat, { segments: 5 }), 0.09, 0.11, 0.06, { rx: -0.5, rz: -0.2 });
  kit.at(head, kit.cone(0.012, 0.04, thornMat, { segments: 5 }), -0.09, 0.11, 0.06, { rx: -0.5, rz: 0.2 });

  // --- Legs: four stout, powerful legs. ---
  const legDefs = [
    [0.14, 0.17, 0.15], [-0.14, 0.17, 0.15],
    [0.14, 0.17, -0.14], [-0.14, 0.17, -0.14],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.24, skin, { thighR: 0.07, shinR: 0.05, footLen: 0.1 }), x, y, z));

  // Short curly tail — the curl is baked into the rest pose via the root
  // pivot's rotation.
  const tail = kit.at(body, kit.tailChain(3, skin, { segLen: 0.05, startR: 0.04, endR: 0.02 }), 0, 0.1, -0.24, { rx: 1.1 });

  const spark = kit.heartspark(0.04, pal.eye, { seed: 41 });
  kit.at(body, spark, 0, 0.05, 0.2);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, tuskL, tuskR],
      fx: [spark],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'quad',
      breathAmp: 1.15,
      blinkEvery: 3.6,
    },
  };
}
