// =============================================================================
// AURELARK — Gale, stage 2 (Pipwing awakens at L15).
// "Elegant lark with dawn-gradient plumage, trailing pennant feathers. Vain
// soloist." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). Pipwing's fluffball stretches into an
// elegant, streamlined lark with its chest thrown out and its beak lifted —
// vanity is a posture. The dawn gradient runs literally along the body:
// dusk-violet tail -> rose -> peach breast -> gold head. A swept-back golden
// crest crowns it, long folded wings end in gold tips, and the signature is
// the pair of long racket-tipped pennant streamers trailing from the tail
// (thin shaft, wide flag at the end) — readable at any distance.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const DUSK = 0x5a4482, ROSE = 0xd67aa0, PEACH = 0xffb896, GOLD = 0xffd27a, GOLD_HI = 0xffe6ad, BEAK = 0xff9a3c;
const dawn = (t) => (t < 0.35 ? S.mixHex(DUSK, ROSE, t / 0.35) : t < 0.7 ? S.mixHex(ROSE, PEACH, (t - 0.35) / 0.35) : S.mixHex(PEACH, GOLD, (t - 0.7) / 0.3));

export function build_aurelark(kit = kitDefault) {
  const pal = kit.palette(['gale']);
  const plume = S.vcMat(kit, { rough: 0.5 });
  const beakMat = S.smoothMat(kit, BEAK, { rough: 0.3 });

  const root = new THREE.Group();

  // --- Body: a sleek teardrop, chest thrown out and up. ---------------------
  const bodyGeo = S.spindle({
    len: 0.36, r: 0.085, sx: 0.92, sy: 1.08, p: 0.95, pTail: 0.8, radial: 20, rings: 14,
    profile: (t) => 0.42 + 0.58 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.72 + 0.12)), 0.8),
    belly: 0.05,
  });
  // dawn gradient nose-to-tail, then a paler throat
  S.paint(bodyGeo, { from: DUSK, to: GOLD, axis: 'z', noise: 0.01, seed: 72, fn: (x, y, z) => S.clamp01((z + 0.18) / 0.36) });
  const cols = bodyGeo.attributes.color, bp = bodyGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const c = new THREE.Color(dawn(S.clamp01((bp.getZ(i) + 0.18) / 0.36)));
    const k = 0.82 + 0.28 * S.sstep(-0.08, 0.09, bp.getY(i)); // darker underside
    cols.setXYZ(i, c.r * k, c.g * k, c.b * k);
  }
  S.overlay(bodyGeo, 0xffe0c4, (x, y, z) => S.sstep(0.02, 0.14, z) * S.sstep(0.02, -0.07, y) * 0.8);
  bodyGeo.rotateX(-0.32); // chest up
  // short proud neck, merged into the body
  const neckGeo = S.spindle({ len: 0.11, r: 0.058, sx: 0.95, sy: 1.0, radial: 12, rings: 8 });
  S.pose(neckGeo, [0, 0.07, 0.13], [-1.0, 0, 0]);
  S.paint(neckGeo, { from: PEACH, to: GOLD, axis: 'y', noise: 0.01 });
  const body = S.bake([bodyGeo, neckGeo], plume, 'body');
  root.add(body);
  body.position.y = 0.19;

  // --- Head: round, gold, beak lifted. -------------------------------------
  const headGeo = S.spindle({ len: 0.15, r: 0.07, sx: 0.95, sy: 0.95, p: 1, radial: 18, rings: 12, profile: (t) => 0.9 + 0.12 * S.bump(t, 0.45, 0.4) });
  S.paint(headGeo, { from: 0xffc27a, to: GOLD_HI, axis: 'y', noise: 0.01, seed: 74 });
  // a dusk eye-stripe sweeping back from the eye — a lark's mark
  S.overlay(headGeo, 0x6a4c86, (x, y, z) => S.sstep(0.022, 0.034, Math.abs(x)) * S.bump(y - (-z * 0.18), 0.012, 0.018) * S.sstep(0.03, -0.02, z) * 0.85);
  const head = S.bake([headGeo], plume, 'head');
  kit.at(body, head, 0, 0.14, 0.18, { rx: -0.14 });

  const eyeOpts = { irisColor: 0x241810, skinColor: 0xe8b870, glintSize: 0.011 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.029, 0.58, 0.12, eyeOpts, { sink: 0.42, front: 0.5 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.029, -0.58, 0.12, eyeOpts, { sink: 0.42, front: 0.5 });

  const beakGeo = S.taper(0.062, 0.018, { r1: 0.003, radial: 9, rings: 6, sx: 1.1, sz: 0.85 });
  beakGeo.rotateX(Math.PI / 2 - 0.08);
  const beak = new THREE.Mesh(beakGeo, beakMat);
  beak.name = 'beak';
  const bkp = S.surface(headGeo, S.dirYP(0, -0.05), { inset: 0.006 });
  kit.at(head, beak, bkp[0], bkp[1], bkp[2]);

  // Swept-back golden crest: vanity given shape.
  const crestG = [];
  for (let i = 0; i < 3; i++) {
    const u = i - 1;
    const g = S.taper(0.12 - Math.abs(u) * 0.03, 0.016, { r1: 0.004, curve: -0.85, radial: 7, rings: 7, sx: 1.8, sz: 0.65 });
    S.paint(g, { from: 0xffb64a, to: GOLD_HI, axis: 'y', noise: 0.01 });
    S.pose(g, [u * 0.01, 0, 0], [-0.55, 0, -u * 0.28]);
    crestG.push(g);
  }
  const crest = S.bake(crestG, plume, 'crest');
  const cp = S.surface(headGeo, S.dirYP(0, 1.05), { inset: 0.006 });
  kit.at(head, crest, cp[0], cp[1], cp[2]);

  // Long folded wings, dusk with gold tips.
  const wingParts = [1, -1].map((side) => {
    const w = S.softWing(0.23, plume, { side, width: 0.085, thick: 0.24, down: 0.42, spread: 0.2, color: { from: DUSK, to: 0x9a6aa8 }, tips: GOLD, feathers: 4 });
    const p = S.surface(bodyGeo, S.dirYP(side * 1.3, 0.35), { from: [0, 0, 0.04], inset: 0.018 });
    kit.at(body, w, p[0], p[1], p[2]);
    return w;
  });

  // Slender legs.
  const legs = [[0.03, -0.07, 0.0], [-0.03, -0.07, 0.0]].map(([x, y, z]) => {
    const l = S.softLeg(0.12, plume, { thighR: 0.02, shinR: 0.01, pawR: 0.016, pawLen: 1.7, toes: 3, bend: 0.25, color: 0xd9a070, shinColor: BEAK, pawColor: BEAK, radial: 7 });
    kit.at(body, l, x, y, z);
    return l;
  });

  // Tail fan + the signature racket-tipped pennant streamers.
  const fanG = [];
  for (let i = 0; i < 5; i++) {
    const u = i / 4 - 0.5;
    const g = S.spindle({ len: 0.13, r: 0.018, sx: 1.8, sy: 0.3, radial: 8, rings: 6, profile: (t) => 0.5 + 0.5 * Math.sin(Math.PI * t) });
    g.translate(0, 0, -0.065);
    S.paint(g, { from: 0x3f2f66, to: DUSK, axis: 'z', noise: 0.01 });
    S.pose(g, [0, 0, 0], [0.12, u * 0.7, 0]);
    fanG.push(g);
  }
  const fan = S.bake(fanG, plume, 'tailFan');
  kit.at(body, fan, 0, -0.045, -0.158, { rx: -0.2 });
  const pennants = [1, -1].map((s) => {
    const L = 0.46;
    const g = S.spindle({
      len: L, r: 0.034, sx: 0.2, sy: 1.0, radial: 8, rings: 18, p: 0.9,
      profile: (t) => (t < 0.3 ? 0.3 + 0.7 * Math.sin(Math.PI * S.clamp01(t / 0.3)) : 0.1 + 0.1 * t),
    });
    g.translate(0, 0, -L / 2);
    S.bendArc(g, L, -0.55);
    S.paint(g, { from: GOLD, to: ROSE, axis: 'z', noise: 0.01, fn: (x, y, z) => S.sstep(-0.3, -0.4, z) * 0.8 });
    const m = new THREE.Mesh(g, plume);
    m.name = 'pennant';
    kit.at(body, m, s * 0.012, -0.045, -0.152, { ry: s * 0.14, rx: 0.25 });
    return m;
  });

  // Dawn motes trailing behind the vain soloist.
  const motes = kit.mote(6, { color: GOLD, size: 0.014, radius: 0.07, height: 0.06, speed: 0.5, seed: 72 });
  kit.at(body, motes, 0, 0.02, -0.34);

  const spark = kit.heartspark(0.022, pal.eye, { seed: 73 });
  const sp = S.surface(bodyGeo, S.dirYP(0, -0.2), { inset: 0.006 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.2, 0.32));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      wings: wingParts.map((w) => w.bones),
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [crest, beak, fan, ...pennants],
      fx: [motes, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'fly',
      breathAmp: 0.85,
      blinkEvery: 3.2,
    },
  };
}
