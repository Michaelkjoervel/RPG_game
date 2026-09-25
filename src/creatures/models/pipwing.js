// =============================================================================
// PIPWING — Gale, stage 1 wild (Dawnmeadow & Brighthollow outskirts).
// "Plump round songbird, feather-cowlick. Chirps constantly."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized): a fluffball — one round, slightly pear-
// shaped body with a big round head nested into it, a cream belly and a
// fresh meadow-green back, rosy cheeks, a tiny beak, stubby folded wings
// that flutter out from its sides, a perky tail tuft and little orange feet.
// The signature is the feather-cowlick: a big curled sky-teal plume springing
// off the crown, readable at battle distance.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const BACK = 0x6fae4c, BACK_HI = 0x96cd67, CREAM = 0xfaf3dc, CREAM_LO = 0xe8dcba, WING = 0x4f8a3e, WING_TIP = 0xdcebb8, BEAK = 0xffa94d, COWL = 0x6fd0c0;

export function build_pipwing(kit = kitDefault) {
  const pal = kit.palette(['gale']);
  const plume = S.vcMat(kit, { rough: 0.62 });
  const beakMat = S.smoothMat(kit, BEAK, { rough: 0.35 });

  const root = new THREE.Group();

  // --- Body: a round fluffball, a touch wider at the bottom. --------------
  const bodyGeo = S.spindle({
    len: 0.27, r: 0.14, sx: 1.0, sy: 1.02, p: 1, radial: 20, rings: 14, belly: 0.12,
    profile: (t) => 0.95 + 0.06 * S.bump(t, 0.55, 0.5),
  });
  S.paint(bodyGeo, { from: 0x5a9442, to: BACK_HI, axis: 'y', exp: 0.9, noise: 0.012, seed: 70 });
  // cream breast & belly: a big soft oval on the front-underside
  S.overlay(bodyGeo, CREAM, (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return S.sstep(0.05, 0.4, (z * 0.85 - y * 0.55) / l); });
  S.overlay(bodyGeo, CREAM_LO, (x, y, z) => S.sstep(-0.06, -0.13, y) * 0.5);
  // stub tail tuft (part of the body silhouette)
  const tailGeo = S.spindle({ len: 0.1, r: 0.03, sx: 1.6, sy: 0.5, p: 0.9, radial: 10, rings: 7, profile: (t) => 0.7 + 0.3 * Math.sin(Math.PI * t) });
  S.pose(tailGeo, [0, 0.05, -0.15], [0.7, 0, 0]);
  S.paint(tailGeo, { from: WING, to: BACK, axis: 'y', noise: 0.01 });
  const body = S.bake([bodyGeo, tailGeo], plume, 'body');
  root.add(body);
  body.position.y = 0.16;

  // --- Head: big and round, nested into the top of the body. --------------
  const headGeo = S.ball(0.1, { sx: 1.04, sy: 0.98, sz: 0.98, radial: 20, rings: 14 });
  S.paint(headGeo, { from: BACK, to: BACK_HI, axis: 'y', exp: 0.9, noise: 0.01, seed: 71 });
  // cream face mask around the eyes and beak
  S.overlay(headGeo, CREAM, (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return S.sstep(0.2, 0.55, (z - y * 0.45) / l); });
  for (const s of [1, -1]) S.blush(headGeo, S.surface(headGeo, S.dirYP(s * 0.72, -0.22)), 0.04, 0xf49a86, 0.85);
  const head = S.bake([headGeo], plume, 'head');
  kit.at(body, head, 0, 0.125, 0.04, { rz: -0.1, rx: -0.05 });

  const eyeOpts = { irisColor: 0x2a2016, skinColor: 0xd8e6c0, glintSize: 0.016 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.036, 0.46, 0.1, eyeOpts, { sink: 0.36, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.036, -0.46, 0.1, eyeOpts, { sink: 0.36, front: 0.55 });

  // Tiny beak (accent — it chirps).
  const beakGeo = S.taper(0.042, 0.022, { r1: 0.004, radial: 10, rings: 6, sx: 1.25, sz: 0.8 });
  beakGeo.rotateX(Math.PI / 2 + 0.12); // grow +Y -> forward
  const beak = new THREE.Mesh(beakGeo, beakMat);
  beak.name = 'beak';
  const bp = S.surface(headGeo, S.dirYP(0, -0.12), { inset: 0.006 });
  kit.at(head, beak, bp[0], bp[1], bp[2]);

  // THE feather-cowlick: three curled plumes springing off the crown.
  const cowl = [];
  for (let i = 0; i < 3; i++) {
    const u = i - 1;
    const g = S.taper(0.095 - Math.abs(u) * 0.025, 0.022, { r1: 0.005, curve: 0.95, radial: 8, rings: 8, sx: 1.7, sz: 0.75 });
    S.paint(g, { from: 0x3fa89a, to: COWL, axis: 'y', noise: 0.01 });
    S.pose(g, [u * 0.014, 0, -Math.abs(u) * 0.01], [-0.25 - Math.abs(u) * 0.15, 0, -u * 0.55]);
    cowl.push(g);
  }
  const cowlick = S.bake(cowl, plume, 'cowlick');
  const cp = S.surface(headGeo, S.dirYP(0, 1.25), { inset: 0.008 });
  kit.at(head, cowlick, cp[0], cp[1], cp[2], { rz: -0.25 });

  // Stubby folded wings that flutter out from the sides.
  const wingParts = [1, -1].map((side) => {
    const w = S.softWing(0.16, plume, { side, width: 0.095, thick: 0.3, down: 0.7, spread: 0.35, color: { from: WING, to: BACK }, tips: WING_TIP, feathers: 3 });
    const p = S.surface(bodyGeo, S.dirYP(side * 1.3, 0.38), { inset: 0.022 });
    kit.at(body, w, p[0], p[1], p[2]);
    return w;
  });

  // Little orange feet peeking out under the fluff.
  const legs = [[0.045, -0.1, 0.03], [-0.045, -0.1, 0.03]].map(([x, y, z]) => {
    const l = S.softLeg(0.06, plume, { thighR: 0.014, shinR: 0.01, pawR: 0.02, pawLen: 1.5, toes: 3, color: BEAK, pawColor: 0xf09a3e, radial: 7 });
    kit.at(body, l, x, y, z);
    return l;
  });

  const spark = kit.heartspark(0.026, pal.eye, { seed: 71 });
  const sp = S.surface(bodyGeo, S.dirYP(0, -0.1), { inset: 0.008 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.16, 0.36));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      wings: wingParts.map((w) => w.bones),
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [cowlick, beak],
      fx: [spark, S.variantFx(root)],
    },
    hints: {
      personality: 'eager',
      locomotion: 'fly',
      breathAmp: 1.2,
      blinkEvery: 1.8,
    },
  };
}
