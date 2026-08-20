// =============================================================================
// CHANDELISK — Terra/Lumen, stage 2 (Shardling awakens at L25).
// "Chandelier-spider, hanging crystal limbs, prisms scatter rainbow shards."
// (Design Bible §4)
// =============================================================================
// Visual-overhaul rebuild. The old model was a dung-beetle with the crystal
// hidden under it. Now the whole design is A CHANDELIER FIRST:
//   1. HIGH STANCE: six long translucent crystal legs splay wide from a
//      raised sandstone hub — the frame of the chandelier.
//   2. THE HANGING ARRAY — signature: a ring of six glowing icicle crystals
//      swinging beneath the hub rim around one grand two-tier central drop,
//      every pendant emissive so the underside is a lit jewel-box.
//   3. Gradient sandstone hub with a faceted crystal crown on top, four gold
//      eyes, and the bible's rainbow prism scatter orbiting below.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_chandelisk(kit = kitDefault) {
  const pal = kit.palette(['terra', 'lumen']);
  const stoneV = kit.mat(0xffffff, { vertexColors: true, rough: 0.6 });
  const STONE_LO = 0x4a3d26, STONE_HI = 0x9c8a5e;
  const crystalMat = kit.mat(0xf2e8c8, { rough: 0.12, metal: 0.08, transparent: true, opacity: 0.8, emissive: 0xd8b868, emissiveIntensity: 0.35 });
  const skinHex = 0x7d6c46;

  const root = new THREE.Group();

  // --- The hub: raised sandstone body --------------------------------------
  const thorax = kit.blob(0.16, stoneV, { seed: 62, noise: 0.09, squash: { x: 1.05, y: 0.72, z: 1.15 } });
  jitterGeometry(thorax.geometry, 0.008, 62);
  applyVertexGradient(thorax.geometry, { from: STONE_LO, to: STONE_HI, noise: 0.05, seed: 62 });
  root.add(thorax);
  thorax.position.y = 0.5;

  // Faceted crystal crown on top — the chandelier's finial.
  const crown = kit.crystal(0.09, crystalMat, { coreColor: pal.eye, detail: 0 });
  kit.at(thorax, crown, 0, 0.13, -0.02, { s: 1 });
  crown.rotation.z = 0.2;

  // Head knuckle at the front with four gold eyes.
  const head = kit.orb(0.075, stoneV, { sz: 1.1, sy: 0.85 });
  applyVertexGradient(head.geometry, { from: STONE_LO, to: STONE_HI, noise: 0.05, seed: 63 });
  kit.at(thorax, head, 0, 0.0, 0.16);
  const eyeL = kit.at(head, kit.eye(0.028, { irisColor: 0xffe9b0, scleraColor: 0x2c2414, skinColor: skinHex, glintSize: 0.011 }), 0.045, 0.01, 0.06, { ry: 0.4 });
  const eyeR = kit.at(head, kit.eye(0.028, { irisColor: 0xffe9b0, scleraColor: 0x2c2414, skinColor: skinHex, glintSize: 0.011 }), -0.045, 0.01, 0.06, { ry: -0.4 });
  const eyeL2 = kit.at(head, kit.eye(0.016, { irisColor: 0xffe9b0, scleraColor: 0x2c2414, skinColor: skinHex, glintSize: 0.006 }), 0.038, 0.034, 0.055, { ry: 0.4 });
  const eyeR2 = kit.at(head, kit.eye(0.016, { irisColor: 0xffe9b0, scleraColor: 0x2c2414, skinColor: skinHex, glintSize: 0.006 }), -0.038, 0.034, 0.055, { ry: -0.4 });
  // Crystal mandibles.
  kit.at(head, kit.cone(0.012, 0.04, crystalMat, { segments: 4 }), 0.028, -0.02, 0.055, { rx: -0.6, rz: 0.25 });
  kit.at(head, kit.cone(0.012, 0.04, crystalMat, { segments: 4 }), -0.028, -0.02, 0.055, { rx: -0.6, rz: -0.25 });

  // --- Six crystal legs, splayed wide ---------------------------------------
  const legSpots = [
    { x: 0.13, z: 0.1, ry: 0.55 }, { x: -0.13, z: 0.1, ry: -0.55 },
    { x: 0.16, z: -0.02, ry: 0.95 }, { x: -0.16, z: -0.02, ry: -0.95 },
    { x: 0.13, z: -0.13, ry: 1.4 }, { x: -0.13, z: -0.13, ry: -1.4 },
  ];
  const legs = legSpots.map(({ x, z, ry }, i) => {
    const l = kit.at(thorax, kit.leg(0.44, crystalMat, { thighR: 0.024, shinR: 0.015, footLen: 0.045 }), x, 0.02, z, { ry, rz: Math.sign(x) * 0.35 });
    l.knee.rotation.z = -Math.sign(x) * 0.3;          // splay out, then drop in
    kit.at(l.knee, kit.crystal(0.028, crystalMat, { coreColor: 0xfff6dc, detail: 0 }), 0, -0.01, 0);
    return l;
  });
  const legParts = legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot }));

  // --- THE HANGING ARRAY ----------------------------------------------------
  // Six icicle pendants around the rim + a grand two-tier central drop.
  const pendants = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.26;
    const len = 0.13 + (i % 2) * 0.04;
    const p = new THREE.Group(); p.name = 'pendant';
    kit.at(thorax, p, Math.cos(a) * 0.13, -0.08, Math.sin(a) * 0.14);
    p.rotation.z = Math.cos(a) * 0.14;                // slight outward swing
    const ice = kit.cone(0.026, len, crystalMat, { segments: 5, flip: true });
    p.add(ice);
    kit.at(p, kit.orb(0.016, kit.mat(0xfff2cc, { unlit: true, transparent: true, opacity: 0.9 })), 0, -len - 0.012, 0);
    pendants.push(p);
  }
  const drop = new THREE.Group(); drop.name = 'grandDrop';
  kit.at(thorax, drop, 0, -0.1, -0.01);
  const tier1 = kit.crystal(0.085, crystalMat, { coreColor: 0xfff6dc, detail: 1 });
  kit.at(drop, tier1, 0, -0.06, 0);
  const tier2 = kit.crystal(0.05, crystalMat, { coreColor: 0xffffff, detail: 0 });
  kit.at(drop, tier2, 0, -0.2, 0);
  kit.at(drop, kit.orb(0.02, kit.mat(0xfff6dc, { unlit: true, transparent: true, opacity: 0.95 })), 0, -0.28, 0);

  // Rainbow prism scatter — one mote cluster per spectrum hue, orbiting low.
  const spectrum = [0xff6a5c, 0xffb85c, 0xfff08c, 0x8ce08c, 0x7ac6ff, 0xb08cff];
  const scatterFx = spectrum.map((c, i) => {
    const m = kit.mote(2, { color: c, size: 0.018, radius: 0.05, height: 0.04, speed: 0.5 + i * 0.05, seed: 70 + i });
    const a = (i / spectrum.length) * Math.PI * 2;
    kit.at(thorax, m, Math.cos(a) * 0.2, -0.2, Math.sin(a) * 0.2);
    return m;
  });

  const spark = kit.heartspark(0.032, pal.eye, { seed: 71 });
  kit.at(thorax, spark, 0, 0.05, 0.19);

  return {
    group: kit.groundPlant(root),
    parts: {
      body: thorax,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid'), eyeL2.getObjectByName('eyelid'), eyeR2.getObjectByName('eyelid')],
      legs: legParts,
      accents: [crown, ...pendants, drop],
      fx: [...scatterFx, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.75,
      blinkEvery: 3.6,
    },
  };
}
