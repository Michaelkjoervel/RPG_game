// =============================================================================
// BRIARBACK — Bloom, stage 2 (Thistlit awakens at L16).
// "Bristling thorn-boar, bramble armor, berry-red eyes. Protective
// headbutter." (Design Bible §4)
// =============================================================================
// Visual-overhaul rebuild. What carries it:
//   1. THE BRAMBLE DOME — signature: a dark-green tangled bramble mass
//      (lobedMass) grown over the whole back like a hedgerow, studded with
//      thorns and bright berry clusters that echo the berry-red eyes.
//   2. HEADBUTTER STANCE: head carried LOW off a deep chest, weight forward
//      over splayed forelegs, big forward-swept tusks — permanently one
//      breath away from a charge.
//   3. Two-tone hide via applyVertexGradient (dark loam under -> warm russet
//      top) so the boar reads as a lit animal, not a potato.

import * as THREE from 'three';
import { seededRandom } from '../../core/rng.js';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry, lobedMass } from '../../gfx/materials.js';

export function build_briarback(kit = kitDefault) {
  const pal = kit.palette(['bloom']);
  const hideV = kit.mat(0xffffff, { vertexColors: true, rough: 0.72 });
  const HIDE_LO = 0x3a2c1c, HIDE_HI = 0x7a5c38;
  const thornMat = kit.mat(0x8a9a6a, { rough: 0.5 });
  const berryMat = kit.mat(0xc42848, { rough: 0.35, emissive: 0x5c0818, emissiveIntensity: 0.6 });
  const skinHex = 0x54402a;

  const paint = (mesh, seed, lo = HIDE_LO, hi = HIDE_HI, jit = 0) => {
    if (jit) jitterGeometry(mesh.geometry, jit, seed);
    applyVertexGradient(mesh.geometry, { from: lo, to: hi, noise: 0.05, seed });
    return mesh;
  };

  const root = new THREE.Group();

  // Boar barrel: deep chest, weight pitched forward.
  const body = kit.blob(0.26, hideV, { seed: 40, noise: 0.1, squash: { x: 1.05, y: 0.95, z: 1.35 } });
  paint(body, 40);
  root.add(body);
  body.position.y = 0.34;
  body.rotation.x = 0.07;                            // nose-down charge pitch

  const chest = paint(kit.orb(0.2, hideV, { sy: 1.05, sz: 0.9 }), 41, HIDE_LO, HIDE_HI, 0.01);
  kit.at(body, chest, 0, -0.04, 0.22);

  // --- THE BRAMBLE DOME ----------------------------------------------------
  const bramble = lobedMass({ lobes: 5, radius: 0.2, spread: 0.72, squash: 0.68, from: 0x22381e, to: 0x557a40, seed: 43, jitter: 0.2 });
  kit.at(body, bramble, 0, 0.18, -0.06);
  // Thorns bristling out of the dome on quasi-random headings.
  const rngT = seededRandom(9);
  for (let i = 0; i < 10; i++) {
    const a = rngT() * Math.PI * 2, r = 0.1 + rngT() * 0.16;
    const t = kit.cone(0.02, 0.09 + rngT() * 0.05, thornMat, { segments: 5 });
    kit.at(bramble, t, Math.cos(a) * r, 0.1 + rngT() * 0.1, Math.sin(a) * r * 1.2 - 0.02,
      { rx: -0.5 + rngT() * 1.0, rz: (rngT() - 0.5) * 1.6 });
  }
  // Berry clusters tucked into the tangle — bright accents against the green.
  for (const [x, y, z] of [[0.14, 0.12, 0.08], [-0.12, 0.14, -0.1], [0.02, 0.16, -0.2]]) {
    const cl = new THREE.Group();
    for (let b = 0; b < 3; b++) kit.at(cl, kit.orb(0.024, berryMat), (b - 1) * 0.028, (b % 2) * 0.022, b * 0.012);
    kit.at(bramble, cl, x, y, z);
  }

  // --- Low headbutter head -------------------------------------------------
  const head = paint(kit.blob(0.17, hideV, { seed: 44, squash: { x: 0.95, y: 0.9, z: 1.15 } }), 44);
  kit.at(body, head, 0, -0.04, 0.34, { rx: 0.14 });   // carried LOW, brow first
  // Armored brow boss — the bit that does the headbutting.
  const boss = paint(kit.shellPlate(0.18, 0.12, 0.1, hideV, { bulge: 0.09 }), 45, 0x2c3a20, 0x5a7842);
  kit.at(head, boss, 0, 0.1, 0.05, { rx: -0.6 });
  const snout = paint(kit.capsule(0.06, 0.06, hideV, { capSeg: 3, radSeg: 8 }), 46, 0x4a3822, 0x8a684a);
  snout.geometry.rotateX(Math.PI / 2);
  kit.at(head, snout, 0, -0.05, 0.16);
  kit.at(head, kit.orb(0.05, kit.mat(0x9a6a5c, { rough: 0.5 }), { sy: 0.7, sz: 0.5 }), 0, -0.05, 0.22);

  // Berry-red eyes — the bible's one specific color note.
  const eyeL = kit.at(head, kit.eye(0.046, { irisColor: 0xf04a62, scleraColor: 0x241410, skinColor: skinHex, glintSize: 0.019 }), 0.1, 0.03, 0.1, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.046, { irisColor: 0xf04a62, scleraColor: 0x241410, skinColor: skinHex, glintSize: 0.019 }), -0.1, 0.03, 0.1, { ry: -0.35 });

  const earL = kit.at(head, kit.ear(0.07, hideV), 0.1, 0.1, -0.03, { rz: 0.35 });
  const earR = kit.at(head, kit.ear(0.07, hideV), -0.1, 0.1, -0.03, { rz: -0.35 });

  // Big forward-swept tusks.
  const tuskMat = kit.mat(0xeae0c8, { rough: 0.3 });
  const tuskL = kit.at(head, kit.horn(0.16, tuskMat, { baseR: 0.028, tipR: 0.007, bend: -0.7 }), 0.1, -0.08, 0.1, { rx: 0.6, rz: -0.15 });
  const tuskR = kit.at(head, kit.horn(0.16, tuskMat, { baseR: 0.028, tipR: 0.007, bend: -0.7 }), -0.1, -0.08, 0.1, { rx: 0.6, rz: 0.15 });

  // Bristle ridge between the ears.
  for (const [z, l] of [[0.02, 0.06], [-0.04, 0.07], [-0.1, 0.06]]) {
    kit.at(head, kit.cone(0.014, l, thornMat, { segments: 5 }), 0, 0.13, z, { rx: -0.5 });
  }

  // --- Legs: stout, forelegs splayed for the brace ------------------------
  const legDefs = [
    [0.16, -0.19, 0.2, -0.1], [-0.16, -0.19, 0.2, 0.1],
    [0.15, -0.19, -0.18, 0], [-0.15, -0.19, -0.18, 0],
  ];
  const legs = legDefs.map(([x, y, z, rz], i) => {
    const l = kit.at(body, kit.leg(0.3, hideV, { thighR: 0.075, shinR: 0.052, footLen: 0.1, footMat: kit.mat(0x33261a, { rough: 0.6 }) }), x, y, z, { rz });
    for (const c of l.hip.children) if (c.isMesh && c.geometry) paint(c, 47 + i);
    for (const c of l.knee.children) if (c.isMesh && c.geometry) paint(c, 51 + i);
    return l;
  });

  // Short curly tail with a thorn tip.
  const tail = kit.at(body, kit.tailChain(3, hideV, { segLen: 0.05, startR: 0.04, endR: 0.018 }), 0, 0.1, -0.3, { rx: 1.1 });
  tail.pivots.forEach((p, i) => { for (const c of p.children) if (c.isMesh && c.geometry && c.geometry.attributes) paint(c, 55 + i); });
  kit.at(tail.pivots[tail.pivots.length - 1], kit.cone(0.014, 0.045, thornMat, { segments: 5 }), 0, 0, -0.05, { rx: Math.PI / 2 });

  // Pollen-fleck drift around the bramble.
  const pollen = kit.mote(7, { color: 0xd8e89a, size: 0.016, radius: 0.3, height: 0.24, speed: 0.3, seed: 42 });
  kit.at(body, pollen, 0, 0.24, -0.05);

  const spark = kit.heartspark(0.04, pal.eye, { seed: 41 });
  kit.at(body, spark, 0, -0.1, 0.36);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, tuskL, tuskR],
      fx: [pollen, spark],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'quad',
      breathAmp: 1.15,
      blinkEvery: 3.6,
    },
  };
}
