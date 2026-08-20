// =============================================================================
// RIMEHORN — Frost, stage 1 (single-stage), uncommon.
// "Shaggy ibex, horns of clear ice, frost-breath. Sure-footed elder."
// (Design Bible §4)
// =============================================================================
// A sturdy mountain quadruped: a shaggy coat built from clustered
// `kit.fluffTuft()` puffs over a normal blob torso, a pair of curved
// `kit.horn()` icicles in a translucent frost material, and a slow, steady
// breath-mist of pale motes drifting from its muzzle. `hints.personality:
// 'regal'` with a slowed breath gives it the composed, unhurried bearing of
// a mountain elder rather than a skittish prey animal.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { seededRandom } from '../../core/rng.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_rimehorn(kit = kitDefault) {
  const pal = kit.palette(['frost']);
  // Shaggy mountain coat: slate-shadowed under-wool up to lit snow along the
  // spine — never one flat sheep-white.
  const coat = kit.mat(0xffffff, { vertexColors: true, rough: 0.8 });
  const COAT_LO = 0x8a92a4, COAT_HI = 0xf4f8fc;
  const paint = (mesh, seed, lo = COAT_LO, hi = COAT_HI, jit = 0) => {
    if (jit) jitterGeometry(mesh.geometry, jit, seed);
    applyVertexGradient(mesh.geometry, { from: lo, to: hi, noise: 0.04, seed });
    return mesh;
  };
  const coatDark = kit.mat(0x9aa2b4, { rough: 0.75 });
  // Clear ice: translucent with a cold inner light so the horns READ.
  const iceMat = kit.mat(0xbfe6ff, { rough: 0.08, metal: 0.05, transparent: true, opacity: 0.85, emissive: 0x4f9cd8, emissiveIntensity: 0.5 });

  const root = new THREE.Group();

  const body = paint(kit.blob(0.19, coat, { seed: 120, noise: 0.1, squash: { x: 1.05, y: 0.95, z: 1.5 } }), 120);
  root.add(body);
  body.position.y = 0.36;

  // Shaggy coat: clustered fluff tufts along the back and flanks, painted so
  // the fleece shades with the body.
  const tuftSpots = [[0, 0.16, 0.15], [0, 0.18, -0.02], [0, 0.16, -0.18], [0.13, 0.02, -0.1], [-0.13, 0.02, -0.1], [0.11, 0.05, 0.14], [-0.11, 0.05, 0.14]];
  const tufts = tuftSpots.map(([x, y, z], i) => {
    const t = kit.fluffTuft(0.105, coat, { count: 6, seed: 121 + i });
    for (const c of t.children) if (c.isMesh && c.geometry) paint(c, 130 + i);
    return kit.at(body, t, x, y, z);
  });

  const head = kit.at(body, paint(kit.blob(0.13, coat, { seed: 122, squash: { x: 0.9, y: 0.85, z: 1.1 } }), 122), 0, 0.16, 0.28);
  const eyeL = kit.at(head, kit.eye(0.038, { irisColor: 0x3a2c1c, skinColor: 0xd8dce4, glintSize: 0.014 }), 0.08, 0.02, 0.09, { ry: 0.3 });
  const eyeR = kit.at(head, kit.eye(0.038, { irisColor: 0x3a2c1c, skinColor: 0xd8dce4, glintSize: 0.014 }), -0.08, 0.02, 0.09, { ry: -0.3 });
  const earL = kit.at(head, kit.ear(0.07, coatDark, { floppy: true }), 0.1, 0.07, -0.03, { rz: 0.4, ry: -0.2 });
  const earR = kit.at(head, kit.ear(0.07, coatDark, { floppy: true }), -0.1, 0.07, -0.03, { rz: -0.4, ry: 0.2 });

  // THE ICE HORNS — big ibex crescents of lit glacier glass rising off the
  // crown before sweeping back and out. horn() grows +Y bending +X, so a
  // -90° ry turn aims the bend BACKWARD (+Z -> -Z ... via mount): mount each
  // nearly upright, bend carries the arc rearward. A solid pale core rides
  // inside each so the crescent still reads when the glass catches sky.
  const hornCore = kit.mat(0xdff2ff, { rough: 0.25, emissive: 0x6fb4e0, emissiveIntensity: 0.6 });
  const horns = [];
  for (const side of [1, -1]) {
    const h = kit.horn(0.52, iceMat, { baseR: 0.065, tipR: 0.012, bend: 1.15 });
    const hAt = kit.at(head, h, side * 0.075, 0.08, -0.01, { ry: Math.PI / 2, rz: side * 0.42, rx: -0.35 });
    const core = kit.horn(0.5, hornCore, { baseR: 0.032, tipR: 0.007, bend: 1.15 });
    kit.at(hAt, core, 0, 0.005, 0);
    horns.push(hAt);
  }
  const hornL = horns[0], hornR = horns[1];
  kit.at(head, kit.horn(0.09, iceMat, { baseR: 0.02, tipR: 0.005, bend: 0.3 }), 0.05, 0.11, 0.05, { rz: -0.5 });
  kit.at(head, kit.horn(0.09, iceMat, { baseR: 0.02, tipR: 0.005, bend: -0.3 }), -0.05, 0.11, 0.05, { rz: 0.5 });

  const muzzle = kit.at(head, kit.orb(0.05, coatDark, { sz: 1.2, sy: 0.7 }), 0, -0.06, 0.11);
  // The elder's icicle beard.
  const beard = kit.at(head, kit.fluffTuft(0.045, coatDark, { count: 4, seed: 125 }), 0, -0.1, 0.07);
  kit.at(head, kit.cone(0.012, 0.05, iceMat, { segments: 5, flip: true }), 0.015, -0.12, 0.07);
  kit.at(head, kit.cone(0.009, 0.035, iceMat, { segments: 5, flip: true }), -0.02, -0.115, 0.06);

  const legDefs = [
    [0.11, 0.19, 0.16], [-0.11, 0.19, 0.16],
    [0.11, 0.19, -0.14], [-0.11, 0.19, -0.14],
  ];
  const legs = legDefs.map(([x, y, z], i) => {
    const l = kit.at(body, kit.leg(0.28, coat, { thighR: 0.07, shinR: 0.05, footLen: 0.1, footMat: kit.mat(0x6e7688, { rough: 0.6 }) }), x, y, z);
    for (const c of l.hip.children) if (c.isMesh && c.geometry) paint(c, 140 + i);
    for (const c of l.knee.children) if (c.isMesh && c.geometry && c !== l.foot) paint(c, 144 + i);
    return l;
  });

  const tail = kit.at(body, kit.tailChain(2, coat, { segLen: 0.045, startR: 0.035, endR: 0.018 }), 0, 0.12, -0.27);
  tail.pivots.forEach((p, i) => {
    for (const c of p.children) if (c.isMesh && c.geometry && c.geometry.attributes) paint(c, 148 + i);
  });

  // Steady frost-breath mist from the muzzle.
  const breath = kit.mote(6, { color: 0xeaf6ff, size: 0.018, radius: 0.05, height: 0.08, speed: 0.6, seed: 123 });
  kit.at(muzzle, breath, 0, -0.02, 0.06);

  const spark = kit.heartspark(0.04, pal.eye, { seed: 124 });
  kit.at(body, spark, 0, 0.06, 0.2);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, hornL, hornR, ...tufts],
      fx: [breath, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.8,
      blinkEvery: 4.6,
    },
  };
}
