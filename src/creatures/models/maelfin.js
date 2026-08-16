// =============================================================================
// MAELFIN — Tide, stage 2 (Nixling awakens at L16).
// "Sleek otter-mer with sail fins and spiral tail current. Playful
// show-off." (Design Bible §4)
// =============================================================================
// Demonstrates repurposing kit.wing() as a dorsal SAIL rather than a flying
// wing — a wing's bone chain flaps around local Z exactly like a sail
// rippling, so it's a natural fit. Also shows fin() used for a row of
// smaller accent fins and a "spiral tail current" built from a tight ring
// of drifting motes rather than new geometry.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_maelfin(kit = kitDefault) {
  const pal = kit.palette(['tide']);
  const skin = kit.mat(0x2f6a8a, { rough: 0.45 });
  const sailMat = kit.mat(pal.primary, { rough: 0.3, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
  const bellyMat = kit.mat(0xcfe9f2, { rough: 0.55 });

  const root = new THREE.Group();

  // Sleek torso — a capsule with the rotation baked into the GEOMETRY (see
  // kit.capsule's JSDoc) so `body` stays a normal, unrotated attachment
  // anchor for everything below. The bake is about X: that swings the
  // Y-aligned capsule onto Z, nose-to-tail. (About Z would put it on X and
  // lay the otter sideways across the view.)
  const body = kit.capsule(0.098, 0.36, skin, { capSeg: 5, radSeg: 9 });
  body.geometry.rotateX(Math.PI / 2);
  root.add(body);
  body.position.y = 0.28;

  // Pale belly patch, tucked slightly into the torso — same nose-to-tail axis
  // as its parent body, scaled thinner in cross-section (x/y) but full length.
  const bellyPatch = kit.capsule(0.075, 0.24, bellyMat, { capSeg: 4, radSeg: 7 });
  bellyPatch.geometry.rotateX(Math.PI / 2);
  bellyPatch.scale.set(0.62, 0.62, 1);
  kit.at(body, bellyPatch, 0, -0.07, 0.02);

  // Head carried a little above the shoulder line so the otter reads as head +
  // body rather than one continuous sausage.
  const head = kit.at(body, kit.orb(0.095, skin, { sz: 1.1, sy: 0.9 }), 0, 0.075, 0.27);
  const eyeL = kit.at(head, kit.eye(0.036, { irisColor: 0x123044, skinColor: 0x2f6a8a, glintSize: 0.014 }), 0.06, 0.015, 0.075, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.036, { irisColor: 0x123044, skinColor: 0x2f6a8a, glintSize: 0.014 }), -0.06, 0.015, 0.075, { ry: -0.35 });
  const earL = kit.at(head, kit.ear(0.04, skin), 0.065, 0.06, 0, { rz: 0.3 });
  const earR = kit.at(head, kit.ear(0.04, skin), -0.065, 0.06, 0, { rz: -0.3 });

  // Whiskers — a small, characterful, otter-specific touch.
  const whiskerMat = kit.mat(0xe8f2f5, { unlit: true, opacity: 0.7, transparent: true });
  const whiskL = kit.at(head, kit.leafBlade(0.05, whiskerMat, { width: 0.004 }), 0.05, -0.03, 0.09, { ry: -0.3, rz: 0.15 });
  const whiskR = kit.at(head, kit.leafBlade(0.05, whiskerMat, { width: 0.004 }), -0.05, -0.03, 0.09, { ry: Math.PI + 0.3, rz: -0.15 });

  // Dorsal sail: a row of three wing() sails of decreasing size along the
  // spine — the "show-off" fin row. Each is a { group, bones } wrapper, so
  // `.group` goes into accents.
  const sailDefs = [[0, 0.13, 0.13, 0.15], [0, 0.15, 0.0, 0.13], [0, 0.13, -0.12, 0.1]];
  const sails = sailDefs.map(([x, y, z, len]) => {
    const w = kit.wing(len, sailMat, { style: 'membrane', bones: 2, width: len * 0.9, droop: 0.05 });
    kit.at(body, w, x, y, z, { rx: -Math.PI / 2, ry: Math.PI / 2 });
    return w.group;
  });

  // Flippers — short, wide "legs" standing in for otter-mer limbs. Local Y is
  // measured from the torso centre, so the hips belong just under the belly
  // (-0.093 = drop of kit.leg(0.16) minus the torso height) — that is what
  // plants the flippers on y=0 instead of leaving them dangling inside the body.
  const legDefs = [[0.09, -0.093, 0.12], [-0.09, -0.093, 0.12]];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.16, skin, { thighR: 0.04, shinR: 0.032, footLen: 0.09 }), x, y, z));

  // A pair of small flourish fins near the hips, echoing the sail shape at
  // a smaller scale.
  const hipFinL = kit.at(body, kit.fin(0.09, sailMat), 0.1, 0.06, -0.12, { rx: -0.3, ry: 0.6 });
  const hipFinR = kit.at(body, kit.fin(0.09, sailMat), -0.1, 0.06, -0.12, { rx: -0.3, ry: -0.6 });

  // Long tail ending in a broad fin flourish, with a tight spiral of motes
  // representing the "spiral tail current" — no new geometry needed, just
  // a playful particle detail.
  const tail = kit.at(body, kit.tailChain(5, skin, { segLen: 0.075, startR: 0.045, endR: 0.02 }), 0, 0.01, -0.25);
  const tailFin = kit.at(tail.pivots[tail.pivots.length - 1], kit.fin(0.12, sailMat), 0, 0, -0.02, { ry: Math.PI / 2 });
  const swirl = kit.mote(8, { color: 0xbfe6ff, size: 0.016, radius: 0.05, height: 0.05, speed: 1.4, seed: 17 });
  kit.at(tail.pivots[tail.pivots.length - 1], swirl, 0, 0, -0.08);

  const spark = kit.heartspark(0.032, pal.eye, { seed: 18 });
  kit.at(body, spark, 0, -0.03, 0.26);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, whiskL, whiskR, ...sails, hipFinL, hipFinR, tailFin],
      fx: [swirl, spark],
    },
    hints: {
      personality: 'eager',
      locomotion: 'biped', // only 2 legs (flippers) — alternating paddle gait
      breathAmp: 1.0,
      blinkEvery: 2.8,
    },
  };
}
