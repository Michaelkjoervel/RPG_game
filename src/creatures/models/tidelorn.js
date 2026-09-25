// =============================================================================
// TIDELORN — Tide/Gale, stage 3 (Maelfin awakens at L34).
// "Long serpentine leviathan with a mane of living water, moon-pale
// underbelly. Serene, vast." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). The final form of the Nixling line: a
// long, serene sea-serpent. The body and its reared S-neck are ONE smooth
// sculpted form (the neck is a swept tube, no stacked capsules), the tail is
// a long soft chain posed into a lazy S that coils away behind it, and a
// moon-pale belly runs continuously from chin to fluke. Its mane is LIVING
// WATER: tongues of translucent water rippling along the crest of the neck
// (they flicker like a current), and Nixling's gill fronds survive as long
// flowing whiskers on the noble wedge head. Translucent pectoral flippers
// and a whale fluke finish it; mist drifts in its wake.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const SKIN_LO = 0x14384f, SKIN = 0x2f6a84, SKIN_HI = 0x5aa2be, BELLY = 0xe6f2f0, WATER = [0x2a86b0, 0x5cc4e0, 0xd4f4fa], FIN = 0x3fa8c8;

export function build_tidelorn(kit = kitDefault) {
  const pal = kit.palette(['tide', 'gale']);
  const skin = S.vcMat(kit, { rough: 0.36, metal: 0.05 });
  const finMat = kit.mat(FIN, { rough: 0.25, transparent: true, opacity: 0.7, side: THREE.DoubleSide, emissive: 0x1d6480, emissiveIntensity: 0.6 });

  const root = new THREE.Group();
  const bellyPaint = (g, below) => S.overlay(g, BELLY, (x, y, z) => S.sstep(below, below - 0.06, y) * 0.95);

  // --- Torso + reared S-neck: one smooth form. ------------------------------
  const torso = S.spindle({ len: 0.8, r: 0.23, sx: 0.95, sy: 1.0, p: 0.9, radial: 18, rings: 12, profile: (t) => 0.8 + 0.22 * S.bump(t, 0.62, 0.4) });
  S.paint(torso, { from: SKIN_LO, to: SKIN_HI, axis: 'y', noise: 0.015, seed: 24 });
  bellyPaint(torso, -0.08);
  const neckPts = [[0, 0.02, 0.3], [0, 0.18, 0.5], [0, 0.48, 0.58], [0, 0.78, 0.56], [0, 0.95, 0.66]];
  const neck = S.tubeAlong(neckPts, (t) => S.lerp(0.2, 0.13, t), { radial: 14, tubular: 22 });
  S.paint(neck, { from: SKIN, to: SKIN_HI, axis: 'y', noise: 0.015, seed: 30 });
  // pale throat down the front of the neck (faces forward/down)
  S.overlayN(neck, BELLY, (nx, ny, nz) => S.sstep(0.25, 0.65, nz - ny * 0.4) * 0.92);
  const body = S.bake([torso, neck], skin, 'body');
  root.add(body);
  body.position.y = 0.46;

  // --- The mane of living water: rippling water tongues along the crest. ---
  const mane = [];
  const manePts = [[0.52, 0.28, 0.32], [0.6, 0.48, 0.36], [0.62, 0.66, 0.34], [0.64, 0.84, 0.3], [0.34, 0.2, 0.28], [0.12, 0.26, 0.22]];
  manePts.forEach(([z, y, h], i) => {
    const holder = new THREE.Group(); holder.name = 'maneHolder';
    const f = S.flame3d(kit, h, { seed: 40 + i, width: h * 0.5, colors: WATER, halo: 0.25 });
    for (const L of f.group.children) if (L.material) { L.material.opacity = 0.7; L.material.transparent = true; }
    holder.add(f.group);
    holder.rotation.x = -0.9; // flow back
    holder.position.set(0, y + 0.05, z - 0.08);
    body.add(holder);
    mane.push(f);
  });

  // --- Pectoral flippers (accents). ------------------------------------------
  const flippers = [1, -1].map((sd) => {
    const g = S.spindle({ len: 0.42, r: 0.11, sx: 1.4, sy: 0.12, radial: 12, rings: 8, pNose: 0.8, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.9)), 0.7) * (0.5 + 0.5 * t) });
    g.translate(0, 0, -0.21);
    const m = new THREE.Mesh(g, finMat);
    m.name = 'flipper';
    kit.at(body, m, sd * 0.19, -0.1, 0.2, { ry: sd * 0.6, rz: -sd * 0.35 });
    return m;
  });

  // --- Head: a noble wedge, flowing whisker-fronds, moon-pale eyes. --------
  const headGeo = S.spindle({
    len: 0.44, r: 0.14, sx: 0.9, sy: 1.0, pTail: 1.0, pNose: 1.1, radial: 18, rings: 14, belly: 0.1,
    profile: (t) => (t < 0.4 ? 1.0 : S.lerp(1.0, 0.6, S.sstep(0.4, 0.75, t))) - 0.08 * S.sstep(0.8, 1, t),
    syAt: (t) => S.lerp(0.95, 0.7, S.sstep(0.4, 0.75, t)),
    arch: (t) => -0.03 * S.sstep(0.4, 0.85, t),
  });
  S.paint(headGeo, { from: SKIN_LO, to: SKIN_HI, axis: 'y', noise: 0.012, seed: 25 });
  bellyPaint(headGeo, -0.04);
  const smile = S.paint(S.groove(headGeo, [[-0.5, -0.3], [-0.25, -0.38], [0, -0.4], [0.25, -0.38], [0.5, -0.3]], { from: [0, 0, 0.05], radius: 0.006, lift: -0.001 }), 0x0e2a3a);
  const fronds = [];
  for (const sd of [1, -1]) for (let i = 0; i < 2; i++) {
    const len = 0.3 - i * 0.07;
    const g = S.taper(len, 0.022, { r1: 0.004, curve: -0.5, radial: 6, rings: 7, sx: 1.5, sz: 0.5 });
    S.paint(g, { from: 0x5cc4e0, to: 0xd4f4fa, axis: 'y' });
    S.aim(g, [sd * 0.6, -0.1 - i * 0.3, -0.8]);
    fronds.push(S.pose(g, S.surface(headGeo, [sd, -0.2 - i * 0.2, -0.2], { from: [0, -0.02, 0.04 - i * 0.05], inset: 0.01 })));
  }
  const crestG = S.spindle({ len: 0.3, r: 0.07, sx: 0.1, sy: 1, radial: 10, rings: 8, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.05)), 0.8) });
  crestG.rotateX(0.5);
  S.pose(crestG, S.surface(headGeo, [0, 1, -0.3], { from: [0, 0, -0.06], inset: 0.01 }));
  S.paint(crestG, 0x3fa8c8);
  const head = S.bake([headGeo, smile, ...fronds, crestG], skin, 'head');
  kit.at(body, head, 0, 1.0, 0.74, { rx: 0.2 });
  const SK = [0, 0, -0.08];
  const eyeOpts = { irisColor: 0xd8f2ff, pupil: true, scleraColor: 0x0b2430, skinColor: 0x2f6a84, glintSize: 0.023 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.056, 0.7, 0.22, eyeOpts, { sink: 0.45, front: 0.45, from: SK });
  const eyeR = S.seatEye(kit, head, headGeo, 0.056, -0.7, 0.22, eyeOpts, { sink: 0.45, front: 0.45, from: SK });

  // --- The long coiling tail. --------------------------------------------------
  const N = 10;
  const YAW = [0, -0.16, -0.22, -0.2, -0.1, 0.06, 0.18, 0.22, 0.18, 0.1];
  const PITCH = [-0.12, -0.08, 0.02, 0.08, 0.1, 0.04, -0.04, -0.06, 0.1, 0.18];
  const tail = S.softTail(N, skin, {
    segLen: 0.24, startR: 0.2, endR: 0.045, rootPitch: -0.08, radial: 10,
    curl: (i) => PITCH[i] ?? 0, yaw: (i) => YAW[i + 1] ?? 0,
    color: (t) => S.mixHex(SKIN, SKIN_LO, t * 0.5),
  });
  kit.at(body, tail, 0, -0.02, -0.34);
  // moon-pale belly along the tail + crest fins on the first segments
  tail.pivots.forEach((p, i) => {
    const seg = p.children.find((c) => c.name === 'tailSeg');
    if (seg) {
      const r = S.lerp(0.2, 0.045, i / N);
      S.overlay(seg.geometry, BELLY, (x, y, z) => S.sstep(-r * 0.35, -r * 0.7, y) * 0.9);
    }
    if (i < 7) {
      const h = 0.26 * (1 - i / 8) + 0.05;
      const g = S.spindle({ len: 0.3, r: h * 0.5, sx: 0.1, sy: 1, radial: 10, rings: 7, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.05)), 0.8) });
      const m = new THREE.Mesh(g, finMat);
      m.name = 'crestFin';
      m.position.set(0, S.lerp(0.2, 0.045, i / N) * 0.9 + h * 0.3, -0.12);
      m.rotation.x = -0.3;
      p.add(m);
    }
  });
  const flukeG = S.spindle({ len: 0.28, r: 0.2, sx: 1.6, sy: 0.12, radial: 14, rings: 8, pNose: 0.7, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.95)), 0.6) * (0.4 + 0.6 * (1 - t)) });
  flukeG.translate(0, 0, -0.1);
  const fluke = new THREE.Mesh(flukeG, finMat);
  fluke.name = 'fluke';
  kit.at(tail.tipAnchor, fluke, 0, 0, 0);

  const mist = kit.mote(10, { color: 0xdff6ff, size: 0.024, radius: 0.8, height: 0.5, speed: 0.22, seed: 25 });
  kit.at(body, mist, 0, 0.2, -0.5);
  const spark = kit.heartspark(0.05, pal.eye, { seed: 26 });
  const sp = S.surface(torso, [0, -0.3, 1], { from: [0, 0, 0.2], inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      accents: [...flippers, fluke],
      fx: [...mane, mist, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'serpent',
      breathAmp: 0.7,
      blinkEvery: 4.8,
    },
  };
}
