// =============================================================================
// SYLVATHORN — Bloom/Terra, stage 3 (Briarback awakens at L34).
// "Tall antlered guardian — stag body, bark plates, hanging moss cloak,
// glade-green glow. Solemn." (Design Bible §4)
// =============================================================================
// Rebuilt for the visual overhaul. The guardian is carried by three shapes:
//   1. HEIGHT: long legs (0.7) under a deep chest, neck raised, head held
//      high — the tallest, most vertical starter finale.
//   2. AN ANTLER CANOPY: two thick bark beams sweeping up-and-out, each
//      carrying branch tines and glowing leaf-bud tips — half rack, half
//      tree crown, reading as a canopy silhouette at any distance.
//   3. THE MOSS CLOAK: rounded moss masses draped over shoulders and rump
//      (lobedMass — gradient-painted organic clumps), with long hanging
//      strands swaying underneath. "Moss cloaks its shoulders like old
//      grief."
// Hide and bark are vertex-gradient painted (dark root-brown under -> warm
// lit bark top, mottled); the glade-green glow lives in bud tips, eyes,
// heartspark and drifting motes.

import * as THREE from 'three';
import { seededRandom } from '../../core/rng.js';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry, lobedMass } from '../../gfx/materials.js';

export function build_sylvathorn(kit = kitDefault) {
  const pal = kit.palette(['bloom', 'terra']);
  const hideV = kit.mat(0xffffff, { vertexColors: true, rough: 0.7 });
  const HIDE_LO = 0x3a3122, HIDE_HI = 0x7d6c4c;
  const BARK_LO = 0x2e2719, BARK_HI = 0x5e5138;
  const mossMat = kit.mat(0x4a7a3c, { rough: 0.6, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const glowMat = kit.mat(0xbfe89a, { unlit: true, transparent: true, opacity: 0.9 });
  const skinHex = 0x5c503a;

  const paint = (mesh, seed, lo = HIDE_LO, hi = HIDE_HI, jit = 0) => {
    if (jit) jitterGeometry(mesh.geometry, jit, seed);
    applyVertexGradient(mesh.geometry, { from: lo, to: hi, noise: 0.045, seed });
    return mesh;
  };

  const root = new THREE.Group();

  // --- Tall stag torso -----------------------------------------------------
  const body = kit.capsule(0.19, 0.46, hideV, { capSeg: 5, radSeg: 10 });
  body.geometry.rotateX(Math.PI / 2);
  paint(body, 50, HIDE_LO, HIDE_HI, 0.006);
  root.add(body);

  const LEG = 0.7, THIGH_R = 0.062, SHIN_R = 0.042;
  const legDrop = 0.92 * LEG + 0.25 * THIGH_R + 0.925 * SHIN_R;   // ≈ 0.698
  const hipY = -0.16;
  body.position.y = legDrop - hipY;

  // Deep chest, high haunches.
  const chest = paint(kit.orb(0.21, hideV, { sy: 1.08, sz: 0.92 }), 51, HIDE_LO, HIDE_HI, 0.008);
  kit.at(body, chest, 0, -0.03, 0.24);
  const haunch = paint(kit.orb(0.19, hideV, { sy: 1.1, sz: 0.95 }), 52, HIDE_LO, HIDE_HI, 0.008);
  kit.at(body, haunch, 0, -0.01, -0.26);

  // Bark plates down the spine + shoulder guards, painted darker than hide.
  const plateSpots = [[0, 0.15, 0.12, 0.2], [0, 0.17, -0.08, 0.22], [0, 0.14, -0.26, 0.16]];
  for (const [x, y, z, sz] of plateSpots) {
    const p = kit.shellPlate(sz, sz * 0.75, sz * 0.5, hideV, { bulge: 0.08 });
    applyVertexGradient(p.geometry, { from: BARK_LO, to: BARK_HI, noise: 0.05, seed: sz * 90 });
    kit.at(body, p, x, y, z, { rx: -Math.PI / 2 + 0.35 });
  }
  for (const side of [1, -1]) {
    const p = kit.shellPlate(0.16, 0.14, 0.1, hideV, { bulge: 0.08 });
    applyVertexGradient(p.geometry, { from: BARK_LO, to: BARK_HI, noise: 0.05, seed: 57 });
    kit.at(body, p, side * 0.17, 0.05, 0.22, { ry: side * (Math.PI / 2 - 0.3), rz: -side * 0.3 });
  }

  // --- Raised neck + solemn head ------------------------------------------
  const NECK_TILT = 0.5;
  const neck = kit.capsule(0.105, 0.3, hideV, { capSeg: 4, radSeg: 9 });
  paint(neck, 53);
  const nHalf = 0.15 + 0.105;
  kit.at(body, neck, 0, 0.1 + nHalf * Math.cos(NECK_TILT), 0.28 + nHalf * Math.sin(NECK_TILT), { rx: NECK_TILT });
  const headY = 0.1 + 2 * nHalf * Math.cos(NECK_TILT);
  const headZ = 0.28 + 2 * nHalf * Math.sin(NECK_TILT);

  const head = paint(kit.blob(0.13, hideV, { seed: 50, squash: { x: 0.85, y: 0.9, z: 1.35 } }), 54);
  kit.at(body, head, 0, headY, headZ, { rx: -0.12 });
  const muzzle = paint(kit.capsule(0.05, 0.09, hideV, { capSeg: 3, radSeg: 8 }), 55, 0x4a3f2c, 0x8a7a58);
  muzzle.geometry.rotateX(Math.PI / 2);
  kit.at(head, muzzle, 0, -0.045, 0.15);
  kit.at(head, kit.orb(0.042, kit.mat(0x38301f, { rough: 0.6 }), { sy: 0.75, sz: 0.9 }), 0, -0.05, 0.21);

  // Deep-set glade-green eyes.
  const eyeL = kit.at(head, kit.eye(0.045, { irisColor: 0x9ce080, scleraColor: 0x1c180e, skinColor: skinHex, glintSize: 0.017 }), 0.085, 0.02, 0.1, { ry: 0.4 });
  const eyeR = kit.at(head, kit.eye(0.045, { irisColor: 0x9ce080, scleraColor: 0x1c180e, skinColor: skinHex, glintSize: 0.017 }), -0.085, 0.02, 0.1, { ry: -0.4 });
  const earL = kit.at(head, paint(kit.ear(0.11, hideV, { width: 0.06 }), 56), 0.09, 0.08, -0.04, { rz: 0.55, rx: -0.25 });
  const earR = kit.at(head, paint(kit.ear(0.11, hideV, { width: 0.06 }), 56.5), -0.09, 0.08, -0.04, { rz: -0.55, rx: -0.25 });

  // --- THE ANTLER CANOPY ---------------------------------------------------
  // Thick bark beams with branch tines; every terminal carries a glowing
  // leaf-bud, so the rack reads tree-crown, not weapon.
  const antlerAccents = [];
  const BEAM_LEN = 0.56, BEAM_BEND = 0.5;
  for (const side of [1, -1]) {
    const beam = kit.horn(BEAM_LEN, hideV, { bend: side * BEAM_BEND, baseR: 0.06, tipR: 0.016, segments: 7 });
    applyVertexGradient(beam.geometry, { from: BARK_LO, to: 0x6e5f42, noise: 0.04, seed: 58 });
    const beamAt = kit.at(head, beam, side * 0.07, 0.1, -0.03, { rz: -side * 0.5, rx: -0.3 });
    antlerAccents.push(beamAt);
    const tines = [[0.3, 0.3, 0.95], [0.55, 0.26, 0.6], [0.8, 0.2, 0.3]];
    for (const [t, len, splay] of tines) {
      const tine = kit.horn(len, hideV, { bend: side * 0.5, baseR: 0.028, tipR: 0.008 });
      applyVertexGradient(tine.geometry, { from: BARK_LO, to: 0x6e5f42, noise: 0.04, seed: 59 + t * 10 });
      const tineAt = kit.at(beamAt, tine, BEAM_BEND * t * t * BEAM_LEN * side, t * BEAM_LEN, 0, { rz: -side * splay, ry: side * 0.2 });
      kit.at(tineAt, kit.orb(0.028, glowMat.clone()), side * 0.5 * len * 0.4, len, 0);
    }
    kit.at(beamAt, kit.orb(0.034, glowMat.clone()), BEAM_BEND * BEAM_LEN * side, BEAM_LEN, 0);
  }

  // --- Legs: long, fine, bark-shinned -------------------------------------
  const legDefs = [
    [0.13, hipY, 0.24], [-0.13, hipY, 0.24],
    [0.135, hipY, -0.25], [-0.135, hipY, -0.25],
  ];
  const legs = legDefs.map(([x, y, z], i) => {
    const l = kit.at(body, kit.leg(LEG, hideV, { thighR: THIGH_R, shinR: SHIN_R, footLen: 0.1, footMat: kit.mat(0x35492c, { rough: 0.5 }) }), x, y, z);
    for (const c of l.hip.children) if (c.isMesh && c.geometry) paint(c, 60 + i);
    for (const c of l.knee.children) if (c.isMesh && c.geometry) paint(c, 64 + i);
    kit.at(l.hip, paint(kit.orb(0.075, hideV, { sy: 1.25, sz: 1.05 }), 68 + i), 0, -0.04, 0);
    return l;
  });
  // Hind pair angled — mid-step solemnity, not a table.
  legs[2].hip.rotation.x = 0.1; legs[3].hip.rotation.x = 0.1;
  legs[2].knee.rotation.x = 0.12; legs[3].knee.rotation.x = 0.12;

  // --- THE MOSS CLOAK ------------------------------------------------------
  // Rounded moss masses draped over the shoulders and rump; long strands
  // hang and sway beneath them.
  const mossAccents = [];
  const shoulderMoss = lobedMass({ lobes: 4, radius: 0.19, spread: 0.72, squash: 0.62, from: 0x2c4a26, to: 0x8ac862, seed: 61, jitter: 0.18 });
  kit.at(body, shoulderMoss, 0, 0.16, 0.16);
  mossAccents.push(shoulderMoss);
  const rumpMoss = lobedMass({ lobes: 3, radius: 0.15, spread: 0.72, squash: 0.62, from: 0x2c4a26, to: 0x7ab458, seed: 62, jitter: 0.18 });
  kit.at(body, rumpMoss, 0, 0.14, -0.24);
  mossAccents.push(rumpMoss);
  const rng = seededRandom(19);
  const mossSpots = [
    [0.16, 0.1, 0.2], [-0.16, 0.1, 0.2], [0.14, 0.1, -0.02], [-0.14, 0.1, -0.02],
    [0.12, 0.08, -0.24], [-0.12, 0.08, -0.24], [0, 0.12, -0.36],
  ];
  for (const [x, y, z] of mossSpots) {
    const len = 0.2 + rng() * 0.14;
    const strand = kit.leafBlade(len, mossMat, { width: 0.035 + rng() * 0.02 });
    mossAccents.push(kit.at(body, strand, x, y, z, { rx: -Math.PI / 2 + 0.08, rz: (rng() - 0.5) * 0.5 }));
  }
  // A moss beard under the jaw — the old-grief detail.
  mossAccents.push(kit.at(head, kit.leafBlade(0.12, mossMat, { width: 0.03 }), 0.02, -0.07, 0.08, { rx: -Math.PI / 2 + 0.15 }));
  mossAccents.push(kit.at(head, kit.leafBlade(0.09, mossMat, { width: 0.026 }), -0.03, -0.07, 0.06, { rx: -Math.PI / 2 + 0.05 }));

  const tail = kit.at(body, kit.tailChain(3, hideV, { segLen: 0.06, startR: 0.035, endR: 0.015 }), 0, 0.1, -0.4, { rx: 0.5 });
  tail.pivots.forEach((p, i) => { for (const c of p.children) if (c.isMesh && c.geometry && c.geometry.attributes) paint(c, 72 + i); });

  const glowMotes = kit.mote(11, { color: 0xbfe89a, size: 0.022, radius: 0.42, height: 0.5, speed: 0.3, seed: 27 });
  kit.at(body, glowMotes, 0, 0.2, 0.05);

  const spark = kit.heartspark(0.05, 0xbfe89a, { seed: 28 });
  kit.at(body, spark, 0, -0.08, 0.42);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, ...antlerAccents, ...mossAccents],
      fx: [glowMotes, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.75,
      blinkEvery: 5.0,
    },
  };
}
