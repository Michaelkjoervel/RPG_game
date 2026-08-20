// =============================================================================
// MAELFIN — Tide, stage 2 (Nixling awakens at L16).
// "Sleek otter-mer with sail fins and spiral tail current. Playful
// show-off." (Design Bible §4)
// =============================================================================
// Visual-overhaul rebuild. The show-off reads through:
//   1. AN ARCED, MID-LEAP POSE: chest up, tail swept high behind — the
//      whole body is one S-curve instead of a level sausage.
//   2. THE SAIL ROW — signature: three translucent aqua dorsal sails of
//      falling size down the spine, echoed by hip fins and a big tail fan,
//      every membrane in two-tone aqua/foam.
//   3. Two-tone pelt via applyVertexGradient (deep sea-slate under -> bright
//      teal top) with a cream belly and throat, so the otter reads sleek and
//      wet rather than flat blue.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_maelfin(kit = kitDefault) {
  const pal = kit.palette(['tide']);
  const peltV = kit.mat(0xffffff, { vertexColors: true, rough: 0.42 });
  const PELT_LO = 0x1c4a66, PELT_HI = 0x4f9cc0;
  const bellyMat = kit.mat(0xd8eef2, { rough: 0.5 });
  const sailMat = kit.mat(0x4fb4d8, { rough: 0.25, transparent: true, opacity: 0.78, side: THREE.DoubleSide, emissive: 0x1d6480, emissiveIntensity: 0.6 });
  const foamMat = kit.mat(0xc4ecf2, { rough: 0.2, transparent: true, opacity: 0.7, side: THREE.DoubleSide, emissive: 0x5da8b8, emissiveIntensity: 0.4 });
  const skinHex = 0x2f6a8a;

  const paint = (mesh, seed, lo = PELT_LO, hi = PELT_HI, jit = 0) => {
    if (jit) jitterGeometry(mesh.geometry, jit, seed);
    applyVertexGradient(mesh.geometry, { from: lo, to: hi, noise: 0.04, seed });
    return mesh;
  };

  const root = new THREE.Group();

  // Sleek torso, chest lifted — the mid-leap arc.
  const body = kit.capsule(0.1, 0.34, peltV, { capSeg: 5, radSeg: 10 });
  body.geometry.rotateX(Math.PI / 2);
  paint(body, 15);
  root.add(body);
  body.position.y = 0.34;
  body.rotation.x = -0.22;                           // nose up, tail down-back

  // Cream belly and chest patch.
  const bellyPatch = kit.capsule(0.07, 0.24, bellyMat, { capSeg: 4, radSeg: 7 });
  bellyPatch.geometry.rotateX(Math.PI / 2);
  bellyPatch.scale.set(0.66, 0.58, 1);
  kit.at(body, bellyPatch, 0, -0.062, 0.03);
  const chest = paint(kit.orb(0.095, peltV, { sy: 1.05 }), 16, PELT_LO, PELT_HI, 0.006);
  kit.at(body, chest, 0, -0.01, 0.17);

  // Head carried high, cheeky tilt.
  const head = paint(kit.blob(0.085, peltV, { seed: 17, squash: { x: 0.95, y: 0.95, z: 1.2 } }), 17);
  kit.at(body, head, 0, 0.1, 0.28, { rx: 0.1, rz: 0.06 });
  const eyeL = kit.at(head, kit.eye(0.03, { irisColor: 0x14384f, scleraColor: 0xdcecf0, skinColor: skinHex, glintSize: 0.013 }), 0.055, 0.02, 0.072, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.03, { irisColor: 0x14384f, scleraColor: 0xdcecf0, skinColor: skinHex, glintSize: 0.013 }), -0.055, 0.02, 0.072, { ry: -0.35 });
  const earL = kit.at(head, paint(kit.ear(0.042, peltV), 21.2), 0.065, 0.062, -0.01, { rz: 0.35 });
  const earR = kit.at(head, paint(kit.ear(0.042, peltV), 21.7), -0.065, 0.062, -0.01, { rz: -0.35 });
  // Cream muzzle with whiskers.
  kit.at(head, kit.orb(0.045, bellyMat, { sz: 1.25, sy: 0.8 }), 0, -0.035, 0.075);
  kit.at(head, kit.orb(0.016, kit.mat(0x1c3244, { rough: 0.4 }), { sy: 0.7 }), 0, -0.02, 0.115);
  const whiskerMat = kit.mat(0xe8f2f5, { unlit: true, opacity: 0.7, transparent: true });
  const whiskL = kit.at(head, kit.leafBlade(0.055, whiskerMat, { width: 0.004 }), 0.05, -0.03, 0.08, { ry: -0.3, rz: 0.15 });
  const whiskR = kit.at(head, kit.leafBlade(0.055, whiskerMat, { width: 0.004 }), -0.05, -0.03, 0.08, { ry: Math.PI + 0.3, rz: -0.15 });

  // --- THE SAIL ROW --------------------------------------------------------
  // Three double-layer sails of falling size down the spine.
  const sails = [];
  const sailDefs = [[0.12, 0.16, 0.2], [0.14, 0.02, 0.17], [0.12, -0.11, 0.13]];
  for (const [y, z, len] of sailDefs) {
    const s = kit.fin(len, sailMat, { width: len * 0.95, curve: 0.35 });
    sails.push(kit.at(body, s, 0, y, z, { rz: Math.PI / 2, rx: -0.5 }));
    const f = kit.fin(len * 0.66, foamMat, { width: len * 0.6, curve: 0.4 });
    sails.push(kit.at(body, f, 0, y + 0.008, z - 0.012, { rz: Math.PI / 2, rx: -0.62 }));
  }

  // Flipper "legs" — front pair braced, short and webbed-dark.
  const legDefs = [[0.085, -0.075, 0.12], [-0.085, -0.075, 0.12]];
  const flipperMat = kit.mat(0x17405c, { rough: 0.4 });
  const legs = legDefs.map(([x, y, z], i) => {
    const l = kit.at(body, kit.leg(0.15, peltV, { thighR: 0.038, shinR: 0.03, footLen: 0.07, footMat: flipperMat }), x, y, z);
    for (const c of l.hip.children) if (c.isMesh && c.geometry) paint(c, 18 + i);
    for (const c of l.knee.children) if (c.isMesh && c.geometry) paint(c, 20 + i);
    return l;
  });

  // Hip fins echoing the sails.
  const hipFinL = kit.at(body, kit.fin(0.1, sailMat), 0.09, 0.03, -0.14, { rx: -0.3, ry: 0.7, rz: 0.3 });
  const hipFinR = kit.at(body, kit.fin(0.1, sailMat), -0.09, 0.03, -0.14, { rx: -0.3, ry: -0.7, rz: -0.3 });

  // --- Tail: swept UP and curled — the spiral flourish ---------------------
  const tail = kit.at(body, kit.tailChain(6, peltV, { segLen: 0.08, startR: 0.05, endR: 0.016 }), 0, 0.02, -0.2);
  tail.pivots.forEach((p, i) => {
    for (const c of p.children) if (c.isMesh && c.geometry && c.geometry.attributes) paint(c, 22 + i);
    p.rotation.x = i === 0 ? 0.55 : 0.16;            // compounding lift = upward curl
    p.rotation.y = i > 2 ? 0.12 : 0;
  });
  const tailFin = kit.at(tail.pivots[tail.pivots.length - 1], kit.fin(0.14, sailMat, { width: 0.12 }), 0, 0, -0.03, { ry: Math.PI / 2 });
  const tailFin2 = kit.at(tail.pivots[tail.pivots.length - 1], kit.fin(0.14, sailMat, { width: 0.12 }), 0, 0, -0.03, { ry: -Math.PI / 2 });
  // The spiral current: a tight ring of droplets orbiting the raised tail tip.
  const swirl = kit.mote(9, { color: 0xbfe6ff, size: 0.018, radius: 0.09, height: 0.08, speed: 1.6, seed: 17 });
  kit.at(tail.pivots[tail.pivots.length - 1], swirl, 0, 0, -0.06);
  const splash = kit.mote(6, { color: 0xd8f2f8, size: 0.014, radius: 0.2, height: 0.16, speed: 0.5, seed: 19 });
  kit.at(body, splash, 0, 0.08, -0.1);

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
      accents: [earL, earR, whiskL, whiskR, ...sails, hipFinL, hipFinR, tailFin, tailFin2],
      fx: [swirl, splash, spark],
    },
    hints: {
      personality: 'eager',
      locomotion: 'biped',
      breathAmp: 1.0,
      blinkEvery: 2.8,
    },
  };
}
