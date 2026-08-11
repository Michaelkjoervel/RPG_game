// =============================================================================
// AURIOS, THE DAWNHART — Lumen, Firstborn legendary.
// "Great stag of morning light, antlers a rising sunburst, walks above the
// ground on light itself, dawn motes." (Design Bible §4, §2)
// =============================================================================
// A CROWN JEWEL — the first of three legendary Firstborn, deserving every
// extra pass. Built on the same tall-elegant-quadruped frame as sylvathorn
// (its nearest silhouette cousin), but the personality is entirely
// different: sylvathorn is solemn bark and moss, Aurios is pure radiant
// light. Three signature touches carry it:
//   1. SUNBURST ANTLERS — not a branching pair, but a full radial fan of
//      eleven emissive rays from one crown point, tallest at center,
//      tapering to the sides, unmistakably a rising sun.
//   2. WALKS ON LIGHT — each hoof sits on its own soft radiant disc, and a
//      wider light-pool washes the ground beneath the whole body, so even
//      standing still it visibly doesn't quite touch the dirt.
//   3. DAWN MOTES — warm gold-to-rose-pink drifting motes (two mote()
//      layers at different hues) instead of one flat color, for a genuine
//      dawn-sky gradient feel around the body.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { seededRandom } from '../../core/rng.js';

export function build_aurios(kit = kitDefault) {
  const pal = kit.palette(['lumen']);
  const coat = kit.mat(0xf2e6cc, { rough: 0.4, metal: 0.04 });
  const coatLight = kit.mat(0xfff6e0, { rough: 0.35 });
  const rayMat = kit.mat(0xffd98c, { unlit: true, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const rayMatCore = kit.mat(0xfff6d0, { unlit: true, transparent: true, opacity: 0.95 });
  const lightPoolMat = kit.mat(0xffe9b0, { unlit: true, transparent: true, opacity: 0.4, side: THREE.DoubleSide });

  const root = new THREE.Group();

  const body = kit.capsule(0.2, 0.58, coat, { capSeg: 5, radSeg: 10 });
  body.geometry.rotateZ(Math.PI / 2);
  root.add(body);
  body.position.y = 1.16;

  // Radiant chest and belly wash — brighter underside, as if lit from within.
  const chestGlow = kit.capsule(0.12, 0.5, coatLight, { capSeg: 4, radSeg: 7 });
  chestGlow.geometry.rotateZ(Math.PI / 2);
  chestGlow.scale.set(0.7, 0.55, 1);
  kit.at(body, chestGlow, 0, -0.12, 0);

  const head = kit.at(body, kit.blob(0.16, coat, { seed: 170, squash: { x: 0.85, y: 0.9, z: 1.3 } }), 0, 0.28, 0.4);
  const eyeL = kit.at(head, kit.eye(0.046, { irisColor: 0xfff2c8, scleraColor: 0x2a2214, pupil: true, skinColor: 0xf2e6cc, glintSize: 0.018 }), 0.09, 0.02, 0.13, { ry: 0.3 });
  const eyeR = kit.at(head, kit.eye(0.046, { irisColor: 0xfff2c8, scleraColor: 0x2a2214, pupil: true, skinColor: 0xf2e6cc, glintSize: 0.018 }), -0.09, 0.02, 0.13, { ry: -0.3 });
  const earL = kit.at(head, kit.ear(0.08, coat), 0.1, 0.11, -0.01, { rz: 0.35 });
  const earR = kit.at(head, kit.ear(0.08, coat), -0.1, 0.11, -0.01, { rz: -0.35 });

  // --- Sunburst antler crown: eleven emissive rays fanned from one point. ---
  const rayCount = 11;
  const crownAccents = [];
  const crownGlow = kit.orb(0.045, rayMatCore.clone());
  const crown = kit.at(head, crownGlow, 0, 0.19, -0.03);
  for (let i = 0; i < rayCount; i++) {
    const t = i / (rayCount - 1) - 0.5; // -0.5 .. 0.5
    const centerBoost = 1 - Math.abs(t) * 1.15; // tallest at center
    const len = 0.16 + Math.max(0.15, centerBoost) * 0.28;
    const ray = kit.cone(0.012 + Math.max(0, centerBoost) * 0.006, len, i % 2 === 0 ? rayMat : rayMatCore, { segments: 5 });
    const fan = kit.at(crown, ray, Math.sin(t * 2.5) * 0.03, 0, 0, { rz: -t * 2.1, rx: -0.25 - Math.abs(t) * 0.3 });
    crownAccents.push(fan);
  }

  const muzzle = kit.at(head, kit.orb(0.06, coatLight, { sz: 1.15, sy: 0.65 }), 0, -0.06, 0.16);

  // --- Legs: long, elegant — a legendary's stride. ---
  const legDefs = [
    [0.16, 0.72, 0.2], [-0.16, 0.72, 0.2],
    [0.16, 0.72, -0.18], [-0.16, 0.72, -0.18],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.68, coat, { thighR: 0.075, shinR: 0.05, footLen: 0.12 }), x, y, z));

  // Each hoof rests on its own soft radiant disc — "walks above the ground on light."
  const hoofGlows = legs.map((l) => {
    const disc = kit.orb(0.09, lightPoolMat, { sx: 1, sy: 0.12, sz: 1 });
    kit.at(l.foot, disc, 0, -0.02, 0.02);
    return disc;
  });
  // A wider light-pool washing the ground beneath the whole body.
  const groundPool = kit.orb(0.4, lightPoolMat, { sx: 1, sy: 0.05, sz: 1.3 });
  kit.at(body, groundPool, 0, -0.7, 0);

  const tail = kit.at(body, kit.tailChain(3, coat, { segLen: 0.08, startR: 0.04, endR: 0.016 }), 0, 0.14, -0.3);

  // Dawn motes: two layered hues, gold and rose, for a real dawn-sky gradient.
  const dawnGold = kit.mote(12, { color: 0xffd98c, size: 0.026, radius: 0.55, height: 0.6, speed: 0.3, seed: 171 });
  kit.at(body, dawnGold, 0, 0.1, 0);
  const dawnRose = kit.mote(8, { color: 0xffb0a0, size: 0.02, radius: 0.4, height: 0.45, speed: 0.24, seed: 172 });
  kit.at(body, dawnRose, 0, 0.2, -0.1);

  const spark = kit.heartspark(0.055, 0xfff2c8, { seed: 173 });
  kit.at(body, spark, 0, 0.08, 0.24);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, ...crownAccents],
      fx: [dawnGold, dawnRose, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      hover: true,
      hoverAmp: 0.035,
      breathAmp: 0.7,
      blinkEvery: 5.4,
    },
  };
}
