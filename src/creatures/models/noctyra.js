// =============================================================================
// NOCTYRA — Umbra/Gale, stage 2 (Duskit awakens at L21).
// "Great owl of dusk-feathers that blur into shadow at the edges.
// Night-watcher." (Design Bible §4)
// =============================================================================
// Duskit's compact mask-disc silhouette grown into something genuinely
// imposing. The signature "feathers blur into shadow at the edges" is built
// as a fringe of translucent, fading feather-blades around the wings and
// tail — several leafBlade layers of decreasing opacity fanning outward, so
// the true edge of the creature never reads as a hard line, exactly the
// described blur.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

// A small fan of feather blades at decreasing opacity, simulating a soft
// "blurred" silhouette edge — kit.js has no alpha-gradient primitive, so
// this stacks several thin translucent blades instead.
function blurFringe(parent, m, count, len, x, y, z, spreadRz) {
  const blades = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const mm = m.clone();
    mm.opacity = 0.55 - t * 0.45;
    const blade = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([
      [0, 0.015], [len * (0.6 + t * 0.5), 0.01], [len * (0.72 + t * 0.55), 0], [len * (0.6 + t * 0.5), -0.01], [0, -0.015],
    ].map(([px, py]) => new THREE.Vector2(px, py))), 4), mm);
    blade.position.set(x, y, z);
    blade.rotation.z = spreadRz * t;
    parent.add(blade);
    blades.push(blade);
  }
  return blades;
}

export function build_noctyra(kit = kitDefault) {
  const pal = kit.palette(['umbra', 'gale']);
  const skin = kit.mat(0x3a2c4a, { rough: 0.55 });          // deep dusk purple-blue
  const discMat = kit.mat(0xa89ec4, { rough: 0.5 });
  const beakMat = kit.mat(0x2a2034, { rough: 0.35 });
  const fringeMat = kit.mat(0x241a30, { unlit: true, transparent: true, opacity: 0.4, side: THREE.DoubleSide });

  const root = new THREE.Group();

  const body = kit.blob(0.19, skin, { seed: 170, noise: 0.09, squash: { x: 1.05, y: 1.15, z: 1.05 } });
  root.add(body);
  body.position.y = 0.26;

  const head = kit.at(body, kit.orb(0.15, skin, { sy: 1.02 }), 0, 0.17, 0.02);
  const disc = kit.at(head, kit.orb(0.13, discMat, { sy: 1.05, sz: 0.35 }), 0, 0, 0.06);
  const eyeL = kit.at(disc, kit.eye(0.048, { irisColor: pal.secondary, scleraColor: 0x14101a, skinColor: 0xa89ec4, glintSize: 0.018 }), 0.05, 0.005, 0.17, { ry: 0.15 });
  const eyeR = kit.at(disc, kit.eye(0.048, { irisColor: pal.secondary, scleraColor: 0x14101a, skinColor: 0xa89ec4, glintSize: 0.018 }), -0.05, 0.005, 0.17, { ry: -0.15 });
  const beak = kit.at(disc, kit.cone(0.024, 0.045, beakMat, { segments: 6 }), 0, -0.045, 0.17, { rx: Math.PI / 2 });

  const tuftL = kit.at(head, kit.leafBlade(0.06, skin, { width: 0.02 }), 0.075, 0.13, -0.02, { rx: -1.15, rz: 0.15 });
  const tuftR = kit.at(head, kit.leafBlade(0.06, skin, { width: 0.02 }), -0.075, 0.13, -0.02, { rx: -1.15, rz: -0.15 });

  // Great wings, feathered and larger than Duskit's stubs.
  const wingDefs = [[0.16, 0.02, -0.02, 1], [-0.16, 0.02, -0.02, -1]];
  const wingParts = wingDefs.map(([x, y, z, side]) => {
    const w = kit.wing(0.32, skin, { style: 'feathered', bones: 3, width: 0.24 });
    kit.at(body, w, x, y, z, { ry: 0.1 });
    w.group.scale.x = side;
    // Blur-fringe of fading feathers along the wing's trailing edge.
    blurFringe(w.group, fringeMat, 4, 0.14, w.group.scale.x > 0 ? 0.1 : -0.1, -0.02, 0.02, 0.5);
    return w;
  });

  // Talon feet.
  const legDefs = [[0.06, 0.02, 0.01], [-0.06, 0.02, 0.01]];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.1, beakMat, { thighR: 0.028, shinR: 0.02, footLen: 0.045 }), x, y, z));

  // Tail, its own soft blur-fringe at the trailing edge.
  const tail = kit.at(body, kit.tailChain(3, skin, { segLen: 0.06, startR: 0.05, endR: 0.02 }), 0, 0.03, -0.2);
  blurFringe(tail.pivots[tail.pivots.length - 1], fringeMat, 3, 0.09, 0, 0, -0.03, 0.4);

  const spark = kit.heartspark(0.038, pal.eye, { seed: 171 });
  kit.at(body, spark, 0, 0.02, 0.13);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      wings: wingParts.map((w) => w.bones),
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [disc, tuftL, tuftR, beak],
      fx: [spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'fly',
      breathAmp: 0.75,
      blinkEvery: 4.8,
    },
  };
}
