// =============================================================================
// STRATOVANE — Gale/Volt, stage 2 (Nimbis awakens at L26), rare.
// "Manta of storm-cloud, lightning veins, thunder on wingbeat." (Design
// Bible §4)
// =============================================================================
// Visual-overhaul rebuild — the old model was authored so small it rescaled
// into a featureless blob at this species' size (2.0). Now:
//   1. A REAL STORM-FRONT BODY: a manta hull with a cumulonimbus stack of
//      gradient-painted cloud lobes (lobedMass) boiling over its back —
//      anvil-dark below, sun-lit above.
//   2. BROAD MANTA WINGS: 3-boned membranes swept wide with a solid leading
//      edge, carrying jagged LIGHTNING VEINS that flash on a rolling thunder
//      pulse (signature detail, visible at any distance when it fires).
//   3. Storm accessories that read at 64px: volt-yellow eyes under a heavy
//      brow, twin cephalic horns, a long vane tail, and a drizzle of rain
//      motes falling out of its own underside.
// Proportion note: registry.js rescales by measured HEIGHT — the cloud stack
// and raised wingtips buy height, keeping raw width:height near 2:1.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { seededRandom } from '../../core/rng.js';
import { applyVertexGradient, jitterGeometry, lobedMass } from '../../gfx/materials.js';

function lightningVein(kit, len, segCount, seed) {
  const group = new THREE.Group(); group.name = 'lightningVein';
  const rng = seededRandom(seed);
  const m = kit.mat(0xffe94f, { unlit: true, transparent: true, opacity: 0.35 });
  const segs = [];
  let x = 0, y = 0;
  for (let i = 0; i < segCount; i++) {
    const segLen = len / segCount;
    const dx = (rng() - 0.5) * segLen * 1.5;
    const s = kit.box(0.016, segLen, 0.01, m);
    s.position.set(x + dx * 0.5, y - segLen * 0.5, 0.004);
    s.rotation.z = Math.atan2(dx, -segLen) * 0.6;
    group.add(s);
    segs.push(s);
    x += dx; y -= segLen;
  }
  return { group, mat: m, segs };
}

export function build_stratovane(kit = kitDefault) {
  const pal = kit.palette(['gale', 'volt']);
  const cloudV = kit.mat(0xffffff, { vertexColors: true, rough: 0.6 });
  const HULL_LO = 0x2c3040, HULL_HI = 0x767c92;
  const wingV = kit.mat(0xffffff, { vertexColors: true, rough: 0.55, side: THREE.DoubleSide });
  const voltGlow = kit.mat(0xffe94f, { unlit: true, transparent: true, opacity: 0.8 });

  const paint = (mesh, seed, lo = HULL_LO, hi = HULL_HI, jit = 0) => {
    if (jit) jitterGeometry(mesh.geometry, jit, seed);
    applyVertexGradient(mesh.geometry, { from: lo, to: hi, noise: 0.05, seed });
    return mesh;
  };

  const root = new THREE.Group();

  // --- Manta hull ----------------------------------------------------------
  const body = kit.blob(0.3, cloudV, { seed: 110, noise: 0.14, squash: { x: 1.0, y: 0.6, z: 1.15 } });
  paint(body, 110);
  root.add(body);
  body.position.y = 0.66;

  // Cumulonimbus stack boiling over the back — storm-dark, only the crowns lit.
  const stack = lobedMass({ lobes: 5, radius: 0.22, spread: 0.7, squash: 0.75, from: 0x272b3c, to: 0x7c8398, seed: 111, jitter: 0.2 });
  kit.at(body, stack, 0, 0.22, -0.04);
  const stack2 = lobedMass({ lobes: 3, radius: 0.15, spread: 0.66, squash: 0.75, from: 0x2c3044, to: 0x9aa2b8, seed: 112, jitter: 0.22 });
  kit.at(body, stack2, 0.05, 0.44, -0.1);

  // Storm-lit face: heavy brow shelf, volt eyes, twin cephalic horns.
  const brow = paint(kit.orb(0.16, cloudV, { sy: 0.5, sz: 0.7 }), 113, 0x262a38, 0x5e6478);
  kit.at(body, brow, 0, 0.12, 0.26);
  const eyeL = kit.at(body, kit.eye(0.058, { irisColor: 0xffe94f, scleraColor: 0x181a24, skinColor: 0x3e4254, glintSize: 0.021 }), 0.1, 0.05, 0.3, { ry: 0.25 });
  const eyeR = kit.at(body, kit.eye(0.058, { irisColor: 0xffe94f, scleraColor: 0x181a24, skinColor: 0x3e4254, glintSize: 0.021 }), -0.1, 0.05, 0.3, { ry: -0.25 });
  const hornL = paint(kit.horn(0.24, cloudV, { baseR: 0.04, tipR: 0.01, bend: 0.5 }), 114, 0x262a38, 0x6e7488);
  const hornR = paint(kit.horn(0.24, cloudV, { baseR: 0.04, tipR: 0.01, bend: -0.5 }), 115, 0x262a38, 0x6e7488);
  const hornLAt = kit.at(body, hornL, 0.15, 0.1, 0.28, { rx: 1.2, rz: -0.35 });
  const hornRAt = kit.at(body, hornR, -0.15, 0.1, 0.28, { rx: 1.2, rz: 0.35 });
  // Mouth slot on the leading edge.
  kit.at(body, kit.box(0.16, 0.02, 0.04, kit.mat(0x14161e, { rough: 0.9 })), 0, -0.05, 0.34);

  // --- Broad manta wings ---------------------------------------------------
  const veins = [];
  const wings = [];
  for (const side of [1, -1]) {
    const w = kit.wing(0.46, wingV, { style: 'membrane', bones: 3, width: 0.32, droop: 0.08 });
    // Paint every membrane card: pale storm-gray at the root, anvil-dark tips.
    w.group.traverse((n) => {
      if (n.isMesh && n.geometry) {
        applyVertexGradient(n.geometry, { from: 0x565e78, to: 0x2c3042, axis: 'x', noise: 0.04, seed: 116 });
      }
    });
    kit.at(body, w, side * 0.16, 0.06, 0.0, { rx: -0.06, ry: side * -0.1, rz: side * 0.35, sx: side < 0 ? -1 : 1 });
    wings.push(w);
    // Solid leading-edge spar so the wing survives a silhouette test.
    const spar = paint(kit.capsule(0.02, 0.4, cloudV, { capSeg: 3, radSeg: 6 }), 117, 0x262a38, 0x767c92);
    spar.geometry.rotateZ(Math.PI / 2);               // genuine crossbar — the one right use
    kit.at(w.bones[0], spar, 0.21, 0.02, 0.015);
    // Lightning veins across the mid and outer cards. Attached to the CARD
    // MESH itself (so they inherit its exact tilt and lie flat on the
    // membrane), rotated 90° so the zigzag runs spanwise, floated a hair
    // proud of the surface.
    const card1 = w.bones[1].children.find((c) => c.isMesh);
    const card2 = w.bones[2].children.find((c) => c.isMesh);
    const v1 = lightningVein(kit, 0.26, 6, 200 + (side > 0 ? 0 : 10));
    if (card1) kit.at(card1, v1, 0.01, 0.02, 0.012, { rz: Math.PI / 2 });
    const v2 = lightningVein(kit, 0.18, 5, 201 + (side > 0 ? 0 : 10));
    if (card2) kit.at(card2, v2, 0.01, 0.02, 0.012, { rz: Math.PI / 2 });
    veins.push(v1, v2);
  }

  // --- Vane tail -----------------------------------------------------------
  const tail = kit.at(body, kit.tailChain(5, cloudV, { segLen: 0.07, startR: 0.045, endR: 0.012 }), 0, -0.02, -0.28);
  tail.pivots.forEach((p, i) => {
    for (const c of p.children) if (c.isMesh && c.geometry && c.geometry.attributes) paint(c, 118 + i);
  });
  const tailVane = kit.at(tail.pivots[tail.pivots.length - 1], kit.fin(0.14, kit.mat(0x8990a8, { rough: 0.5, side: THREE.DoubleSide }), { width: 0.07 }), 0, 0, -0.04, { rz: Math.PI / 2 });

  // --- Thunder + weather ---------------------------------------------------
  let thunderT = 0;
  const thunder = {
    update(dt) {
      thunderT += dt;
      const period = 2.6;
      const local = thunderT % period;
      const flash = local < 0.14 ? 1 - local / 0.14 : (local < 0.3 ? 0.5 * (1 - (local - 0.14) / 0.16) : 0);
      for (const v of veins) v.mat.opacity = 0.35 + flash * 0.65;
    },
  };
  // Rain falling out of its own underside; charge motes about the crown.
  const rain = kit.mote(9, { color: 0xaec6e0, size: 0.016, radius: 0.3, height: 0.45, speed: 0.7, seed: 119 });
  kit.at(body, rain, 0, -0.4, 0);
  const charge = kit.mote(8, { color: 0xffe94f, size: 0.02, radius: 0.4, height: 0.3, speed: 0.4, seed: 112 });
  kit.at(body, charge, 0, 0.3, -0.05);

  const spark = kit.heartspark(0.045, pal.eye, { seed: 113 });
  kit.at(body, spark, 0, -0.08, 0.3);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      wings: wings.map((w) => w.bones),
      accents: [hornLAt, hornRAt, stack, stack2, tailVane],
      fx: [thunder, rain, charge, spark],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'fly',
      breathAmp: 0.9,
      blinkEvery: 4.0,
    },
  };
}
