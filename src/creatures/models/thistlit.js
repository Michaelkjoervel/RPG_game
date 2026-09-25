// =============================================================================
// THISTLIT — Bloom, stage 1 starter.
// "Hedgehog-seedling, thistle-quill back, one sprout antenna. Shy but
// stubborn." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized): a round little seedling-hedgehog. A soft
// soil-brown bean of a body under a mantle of violet thistle quills (a soft
// domed cap bristling with pale-tipped quills, all one merged mesh), a big
// round face with a pointy button snout, rosy cheeks and a shy downward
// tilt, round little ears, four stubby legs — and the signature sprout
// antenna: a curved green stem with two leaves springing from the crown.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const SOIL_LO = 0x4a3a28, SOIL = 0x6e5638, SOIL_HI = 0x947650, FACE = 0xd8b88c, QUILL_LO = 0x4e3668, QUILL = 0x7a4f9a, QUILL_TIP = 0xe8d4f4, LEAF = 0x6fce5c;

export function build_thistlit(kit = kitDefault) {
  const pal = kit.palette(['bloom']);
  const skin = S.vcMat(kit, { rough: 0.75 });

  const root = new THREE.Group();

  // --- Body: a round seedling bean. ----------------------------------------
  const bodyGeo = S.spindle({ len: 0.29, r: 0.13, sx: 1.02, sy: 0.9, p: 0.95, radial: 20, rings: 14, belly: 0.2, profile: (t) => 0.92 + 0.1 * S.bump(t, 0.45, 0.45) });
  S.paint(bodyGeo, { from: SOIL_LO, to: SOIL_HI, axis: 'y', noise: 0.012, seed: 30 });
  S.overlay(bodyGeo, FACE, (x, y, z) => S.sstep(-0.03, -0.1, y) * S.sstep(-0.05, 0.08, z) * 0.7);
  // The thistle mantle: a low violet cap over the back (mostly hidden) ...
  const capGeo = S.spindle({ len: 0.3, r: 0.126, sx: 1.04, sy: 0.9, p: 0.9, radial: 16, rings: 10, profile: (t) => 0.95 - 0.1 * t });
  const cp = capGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) { const y = cp.getY(i); if (y < 0.03) cp.setY(i, 0.03 + (y - 0.03) * 0.2); }
  S.pose(capGeo, [0, 0.012, -0.012]);
  S.paint(capGeo, { from: QUILL_LO, to: 0x6e4e8a, axis: 'y', noise: 0.015 });
  // ... bristling with thistle quills standing OUT from the back, swept back,
  // pale-tipped — the hedgehog silhouette.
  const quills = [];
  let n = 0;
  for (let row = 0; row < 6; row++) {
    const count = 7 - Math.abs(row - 2.5) | 0;
    for (let i = 0; i < count; i++) {
      const u = count > 1 ? i / (count - 1) - 0.5 : 0;
      const yaw = u * 2.3;
      const pitch = 1.0 - Math.abs(u) * 0.8 - Math.max(0, row - 3) * 0.12;
      const from = [0, 0, 0.1 - row * 0.05];
      const at = S.surface(capGeo, S.dirYP(yaw, pitch), { from, inset: 0.01 });
      const nrm = S.dirYP(yaw, pitch);
      const len = 0.075 + ((n * 7919) % 13) / 13 * 0.03 - row * 0.004;
      const q = S.taper(len, 0.019, { r1: 0.003, curve: -0.12, radial: 6, rings: 5 });
      S.paint(q, { from: QUILL, to: QUILL_TIP, axis: 'y', exp: 2.4 });
      S.aim(q, [nrm[0], nrm[1], nrm[2] - 0.75]);
      S.pose(q, at);
      quills.push(q);
      n++;
    }
  }
  const body = S.bake([bodyGeo, capGeo, ...quills], skin, 'body');
  root.add(body);
  body.position.y = 0.14;

  // --- Head: big round face, pointy button snout, shy tilt. ---------------
  const headGeo = S.spindle({ len: 0.19, r: 0.095, sx: 1.06, sy: 0.96, p: 1, radial: 20, rings: 14, profile: (t) => 0.92 + 0.1 * S.bump(t, 0.42, 0.45) });
  S.paint(headGeo, { from: 0x7a6040, to: FACE, axis: 'z', noise: 0.01, seed: 31 });
  S.overlay(headGeo, SOIL, (x, y, z) => S.sstep(0.03, 0.08, y - z * 0.4) * 0.8);
  for (const s of [1, -1]) S.blush(headGeo, S.surface(headGeo, S.dirYP(s * 0.72, -0.2)), 0.03, 0xf08a8a, 0.75);
  const snout = S.taper(0.05, 0.034, { r1: 0.012, radial: 10, rings: 6, sx: 1.1, sz: 0.9 });
  snout.rotateX(Math.PI / 2);
  S.paint(snout, FACE);
  const sn = S.surface(headGeo, S.dirYP(0, -0.18), { inset: 0.02 });
  S.pose(snout, sn);
  const nose = S.ball(0.013, { sx: 1.2, sy: 0.9, radial: 8, rings: 5 });
  S.pose(nose, [sn[0], sn[1] + 0.001, sn[2] + 0.052]);
  S.paint(nose, 0x2a1e18);
  const earGeos = [1, -1].map((s) => {
    const g = S.ear(0.035, 0.04, { color: SOIL, inner: 0xd89a8a, tip: 0.5, cup: 0.5, depth: 0.45, radial: 8, rings: 6 });
    return S.pose(g, S.surface(headGeo, S.dirYP(s * 0.9, 0.55), { inset: 0.006 }), [0, s * 0.5, -s * 0.5]);
  });
  const head = S.bake([headGeo, snout, nose, ...earGeos], skin, 'head');
  kit.at(body, head, 0, 0.0, 0.15, { rx: 0.1, rz: -0.08 });

  const eyeOpts = { irisColor: 0x2a2016, skinColor: 0x6e5638, glintSize: 0.014 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.034, 0.46, 0.14, eyeOpts, { sink: 0.42, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.034, -0.46, 0.14, eyeOpts, { sink: 0.42, front: 0.55 });

  // --- The sprout antenna: curved stem + two leaves (accent — it bobs). ---
  const stem = S.taper(0.075, 0.007, { r1: 0.004, curve: 0.45, radial: 6, rings: 6 });
  S.paint(stem, { from: 0x4f9a3e, to: LEAF, axis: 'y' });
  const leafGeo = (s) => {
    const g = S.spindle({ len: 0.05, r: 0.016, sx: 1.0, sy: 0.22, radial: 8, rings: 6, pNose: 1.4, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.03)), 0.8) });
    g.translate(0, 0, 0.025);
    S.paint(g, { from: 0x4f9a3e, to: 0x9ae07a, axis: 'z' });
    return S.pose(g, [0, 0.074, 0.075 * 0.45 * 0.95], [-0.5, s * 1.1, s * 0.35]);
  };
  const sprout = S.bake([stem, leafGeo(1), leafGeo(-1)], skin, 'sprout');
  const spAt = S.surface(headGeo, S.dirYP(0.12, 1.25), { inset: 0.006 });
  kit.at(head, sprout, spAt[0], spAt[1], spAt[2], { rx: -0.25, rz: -0.15 });

  // --- Four stubby legs. ---------------------------------------------------
  const legs = [[0.065, -0.06, 0.07], [-0.065, -0.06, 0.07], [0.065, -0.06, -0.07], [-0.065, -0.06, -0.07]].map(([x, y, z]) => {
    const l = S.softLeg(0.085, skin, { stubby: true, thighR: 0.03, kneeR: 0.024, pawR: 0.028, pawLen: 1.25, toes: 3, color: SOIL, pawColor: 0x3a2c1e, radial: 8 });
    kit.at(body, l, x, y, z, { rz: Math.sign(x) * 0.12 });
    return l;
  });

  const spark = kit.heartspark(0.02, pal.eye, { seed: 31 });
  const spk = S.surface(bodyGeo, S.dirYP(0, -0.25), { inset: 0.008 });
  kit.at(body, spark, spk[0], spk[1], spk[2]);

  root.add(kit.shadowDisc(0.18, 0.36));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [sprout],
      fx: [spark, S.variantFx(root)],
    },
    hints: {
      personality: 'skittish',
      locomotion: 'quad',
      breathAmp: 0.85,
      blinkEvery: 2.1,
    },
  };
}
