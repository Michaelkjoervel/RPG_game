// =============================================================================
// ZEPHYRA — Gale, stage 2 (Motling awakens at L18).
// "Moth queen, four ribbon wings, comet-trail scales. Regal drifter."
// (Design Bible §4)
// =============================================================================
// Motling grown into royalty: the same legless flight-sprite silhouette,
// but now FOUR wings (a second, smaller pair behind the first) built in the
// energy style for a translucent ribbon look rather than solid membrane —
// the explicit "four ribbon wings" flourish. "Comet-trail scales" become a
// long, slow trail of drifting motes streaming behind the body.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_zephyra(kit = kitDefault) {
  const pal = kit.palette(['gale']);
  const skin = kit.mat(0x6a5a8a, { rough: 0.4, metal: 0.05 });         // regal dusk-lavender
  const ribbonMat = kit.mat(0xd8c8ff, { unlit: true, additive: true, opacity: 0.5 });
  const glowMat = kit.mat(0xffe9b0, { unlit: true, transparent: true, opacity: 0.9 });

  const root = new THREE.Group();

  const body = kit.blob(0.075, skin, { seed: 83, noise: 0.08, squash: { x: 0.9, y: 1.1, z: 1.1 } });
  root.add(body);
  body.position.y = 0.14;

  const head = kit.at(body, kit.orb(0.045, skin, { sy: 0.9 }), 0, 0.05, 0.045);
  const eyeL = kit.at(head, kit.eye(0.019, { irisColor: 0x1c1428, skinColor: 0x6a5a8a, glintSize: 0.008 }), 0.028, 0.005, 0.03, { ry: 0.4 });
  const eyeR = kit.at(head, kit.eye(0.019, { irisColor: 0x1c1428, skinColor: 0x6a5a8a, glintSize: 0.008 }), -0.028, 0.005, 0.03, { ry: -0.4 });

  // Larger, glowing-tipped antennae — a regal crown of light.
  const antL = kit.at(head, kit.horn(0.07, skin, { bend: 0.55, baseR: 0.006, tipR: 0.002 }), 0.02, 0.045, -0.008, { rz: 0.22 });
  const antR = kit.at(head, kit.horn(0.07, skin, { bend: 0.55, baseR: 0.006, tipR: 0.002 }), -0.02, 0.045, -0.008, { rz: -0.22 });
  kit.at(antL, kit.orb(0.011, glowMat.clone()), 0.026, 0.065, 0);
  kit.at(antR, kit.orb(0.011, glowMat.clone()), -0.026, 0.065, 0);

  // FOUR ribbon wings: a forewing + smaller hindwing pair per side, all
  // energy-style so they read as flowing translucent ribbons rather than
  // solid moth membrane.
  const wingDefs = [
    [0.04, 0.03, 0.01, 1, 0.17, 0.14],
    [-0.04, 0.03, 0.01, -1, 0.17, 0.14],
    [0.035, 0.01, -0.03, 1, 0.12, 0.1],
    [-0.035, 0.01, -0.03, -1, 0.12, 0.1],
  ];
  const wingParts = wingDefs.map(([x, y, z, side, len, width]) => {
    const w = kit.wing(len, ribbonMat, { style: 'energy', bones: 3, width, droop: 0.1 });
    kit.at(body, w, x, y, z, { ry: 0.25 });
    w.group.scale.x = side;
    return w;
  });

  // Comet-trail: a long, slow stream of scattered scale-motes.
  const trail = kit.mote(12, { color: 0xd8c8ff, size: 0.012, radius: 0.1, height: 0.08, speed: 0.35, seed: 84 });
  kit.at(body, trail, 0, 0, -0.09);

  const spark = kit.heartspark(0.02, pal.eye, { seed: 85 });
  kit.at(body, spark, 0, 0, 0.06);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      wings: wingParts.map((w) => w.bones),
      accents: [antL, antR],
      fx: [trail, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'fly',
      hover: true,
      hoverAmp: 0.04,
      breathAmp: 0.85,
      blinkEvery: 3.6,
    },
  };
}
