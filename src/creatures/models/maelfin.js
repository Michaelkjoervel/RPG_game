// =============================================================================
// MAELFIN — Tide, stage 2 (Nixling awakens at L16).
// "Sleek otter-mer with sail fins and spiral tail current. Playful
// show-off." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized): a sleek otter REARING UP on its webbed
// hind feet — the show-off pose — forepaws held proudly at the chest, a
// round otter head with a cream whisker-pad muzzle and little round ears,
// a smooth deep-teal pelt with a cream throat and belly, three translucent
// sail fins along the back (they ripple), and a long tail curling up into a
// fin with its spiral water current swirling around the tip.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const PELT_LO = 0x173f5a, PELT = 0x2a6e90, PELT_HI = 0x58a8c8, CREAM = 0xd8eef0, WEB = 0x163a52, SAIL = 0x4fb4d8;

export function build_maelfin(kit = kitDefault) {
  const pal = kit.palette(['tide']);
  const pelt = S.vcMat(kit, { rough: 0.38 });
  const sailMat = kit.mat(SAIL, { rough: 0.25, transparent: true, opacity: 0.72, side: THREE.DoubleSide, emissive: 0x1d6480, emissiveIntensity: 0.5 });

  const root = new THREE.Group();

  // --- Body: a sleek otter torso, rearing up (baked pitch). ----------------
  const PITCH = -0.62;
  const torso = S.spindle({
    len: 0.5, r: 0.11, sx: 0.92, sy: 1.0, p: 0.9, radial: 18, rings: 14,
    profile: (t) => 0.72 + 0.12 * S.bump(t, 0.22, 0.3) + 0.24 * S.bump(t, 0.68, 0.34),
  });
  S.paint(torso, { from: PELT_LO, to: PELT_HI, axis: 'y', noise: 0.012, seed: 15 });
  S.overlay(torso, CREAM, (x, y, z) => S.sstep(-0.03, -0.09, y) * S.sstep(-0.1, 0.1, z));
  torso.rotateX(PITCH);
  // forepaws held at the chest (static; part of the body)
  const arms = [1, -1].map((s) => {
    const g = S.limb(0.09, 0.028, 0.022, { radial: 8 });
    S.paint(g, { from: PELT_LO, to: PELT, axis: 'y' });
    const pw = S.ball(0.026, { sx: 1.1, sy: 0.8, sz: 1.2, radial: 8, rings: 6 });
    pw.translate(0, -0.1, 0.012);
    S.paint(pw, PELT_LO);
    const g2 = S.merge([g, pw]);
    return S.pose(g2, [s * 0.058, 0.13, 0.15], [-1.05, 0, -s * 0.3]);
  });
  const body = S.bake([torso, ...arms], pelt, 'body');
  root.add(body);
  body.position.y = 0.27;

  // --- Head: round otter head, cream whisker-pad muzzle. -------------------
  const headGeo = S.spindle({ len: 0.17, r: 0.078, sx: 1.06, sy: 0.92, p: 1, radial: 18, rings: 12, profile: (t) => 0.92 + 0.1 * S.bump(t, 0.4, 0.45) });
  S.paint(headGeo, { from: PELT, to: PELT_HI, axis: 'y', noise: 0.01, seed: 17 });
  const pad = S.ball(0.04, { sx: 1.35, sy: 0.8, sz: 0.9, radial: 12, rings: 8 });
  const padAt = S.surface(headGeo, S.dirYP(0, -0.3), { inset: 0.022 });
  S.pose(pad, padAt);
  S.paint(pad, CREAM);
  S.overlay(headGeo, CREAM, (x, y, z) => S.sstep(-0.02, -0.055, y) * S.sstep(0.0, 0.06, z));
  const nose = S.ball(0.014, { sx: 1.4, sy: 0.8, radial: 8, rings: 5 });
  S.pose(nose, [padAt[0], padAt[1] + 0.02, padAt[2] + 0.028]);
  S.paint(nose, 0x13283a);
  const ears = [1, -1].map((s) => S.pose(S.paint(S.ball(0.02, { sx: 1.1, sy: 0.9, sz: 0.55, radial: 8, rings: 6 }), PELT_LO), S.surface(headGeo, S.dirYP(s * 0.95, 0.6), { inset: 0.005 }), [0, s * 0.6, 0]));
  const whiskers = [];
  for (const s of [1, -1]) for (let i = 0; i < 2; i++) {
    const w = S.taper(0.055, 0.0028, { r1: 0.001, curve: 0.2, radial: 4, rings: 4 });
    S.paint(w, 0xe8f2f5);
    whiskers.push(S.pose(w, [padAt[0] + s * 0.04, padAt[1] - 0.004 - i * 0.01, padAt[2] + 0.01], [0.3, 0, -s * (1.35 + i * 0.2)]));
  }
  const head = S.bake([headGeo, pad, nose, ...ears, ...whiskers], pelt, 'head');
  kit.at(body, head, 0, 0.24, 0.2, { rx: 0.25, rz: 0.12 });
  const eyeOpts = { irisColor: 0x14384f, scleraColor: 0xdcecf0, skinColor: 0x2f6a8a, glintSize: 0.012 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.027, 0.42, 0.18, eyeOpts, { sink: 0.42, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.027, -0.42, 0.18, eyeOpts, { sink: 0.42, front: 0.55 });

  // --- Sail fins along the back (accents — they ripple). -------------------
  // sails run ALONG the pitched spine, rising off the back like a sailfish's
  const back = [0, Math.cos(PITCH), Math.sin(PITCH)]; // spine-normal, pointing up-back
  const sails = [[0.14, 0.15], [0.02, 0.13], [-0.1, 0.1]].map(([u, h]) => {
    const g = S.spindle({ len: h * 1.3, r: h * 0.5, sx: 0.08, sy: 1, radial: 10, rings: 8, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.05)), 0.75) * (0.7 + 0.3 * (1 - t)) });
    g.rotateX(PITCH);
    const m = new THREE.Mesh(g, sailMat);
    m.name = 'sail';
    const c = [0, -Math.sin(PITCH) * u, Math.cos(PITCH) * u];
    const at = S.surface(torso, back, { from: c, inset: 0.02 });
    kit.at(body, m, at[0] + back[0] * h * 0.32, at[1] + back[1] * h * 0.32, at[2] + back[2] * h * 0.32);
    return m;
  });

  // --- Webbed hind feet (biped): short, powerful, big flipper feet. --------
  const legs = [[0.07, -0.12, -0.06], [-0.07, -0.12, -0.06]].map(([x, y, z]) => {
    const l = S.softLeg(0.16, pelt, { thighR: 0.052, shinR: 0.03, kneeR: 0.034, pawR: 0.036, pawLen: 1.9, pawH: 0.024, toes: 4, bend: 0.45, split: 0.55, bulge: 0.3, color: PELT, shinColor: PELT_LO, pawColor: WEB });
    kit.at(body, l, x, y, z);
    return l;
  });

  // --- Long tail curling up into a fin; spiral current at the tip. --------
  const tail = S.softTail(6, pelt, {
    segLen: 0.08, startR: 0.055, endR: 0.02, curl: 0.24, rootPitch: -0.2, yaw: 0.06, radial: 9,
    color: (t) => S.mixHex(PELT, PELT_LO, t),
  });
  kit.at(body, tail, 0, -0.14, -0.14);
  const flukeGeo = S.spindle({ len: 0.13, r: 0.05, sx: 1.6, sy: 0.14, radial: 10, rings: 7, pNose: 0.8, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)), 0.7) });
  flukeGeo.translate(0, 0, -0.05);
  const fluke = new THREE.Mesh(flukeGeo, sailMat);
  fluke.name = 'tailFluke';
  kit.at(tail.tipAnchor, fluke, 0, 0, 0);
  const swirl = kit.mote(9, { color: 0xbfe6ff, size: 0.018, radius: 0.09, height: 0.08, speed: 1.6, seed: 17 });
  kit.at(tail.tipAnchor, swirl, 0, 0, -0.04);
  const splash = kit.mote(5, { color: 0xd8f2f8, size: 0.014, radius: 0.2, height: 0.16, speed: 0.5, seed: 19 });
  kit.at(body, splash, 0, 0.08, -0.1);

  const spark = kit.heartspark(0.028, pal.eye, { seed: 18 });
  const sp = S.surface(torso, [0, -0.1, 1], { from: [0, 0.1, 0.1], inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  const grounded = kit.groundPlant(root);
  const contact = kit.shadowDisc(0.28, 0.34);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [...sails, fluke],
      fx: [swirl, splash, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'eager',
      locomotion: 'biped',
      breathAmp: 1.0,
      blinkEvery: 2.8,
    },
  };
}
