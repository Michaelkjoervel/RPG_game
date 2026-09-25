// =============================================================================
// VELLIT — Neutral, stage 1 wild (Dawnmeadow & Brighthollow outskirts).
// "Tuft-tailed meadow hopper (rabbit-deer mix), oversized ears. Skittish."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized): a chubby sandy bean with a big round head,
// a cream muzzle and belly, tiny fawn nub-antlers, and the signature
// OVERSIZED ears — long soft cupped ears with dark tips, one standing alert
// and one flopped (skittish-but-curious in a single silhouette). Stubby
// forepaws, big hopper hind feet and a fat cotton tuft of a tail.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const TAN_LO = 0xa2825a, TAN = 0xcdb28a, TAN_HI = 0xe6d2ad, CREAM = 0xf6ecd8, TIP = 0x4a3f34, INNER = 0xefc6b8;

export function build_vellit(kit = kitDefault) {
  const pal = kit.palette(['neutral']);
  const fur = S.vcMat(kit, { rough: 0.74 });

  const root = new THREE.Group();

  // --- Body: a chubby hopper bean, haunches fuller than the chest. ---------
  const bodyGeo = S.spindle({
    len: 0.3, r: 0.135, sx: 0.98, sy: 0.95, p: 0.95, radial: 20, rings: 14, belly: 0.15,
    profile: (t) => 0.9 + 0.12 * S.bump(t, 0.3, 0.4),
    arch: (t) => 0.02 * Math.sin(Math.PI * t),
  });
  S.paint(bodyGeo, { from: TAN_LO, to: TAN_HI, axis: 'y', noise: 0.012, seed: 60 });
  S.overlay(bodyGeo, CREAM, (x, y, z) => S.sstep(-0.02, -0.09, y - 0.05 * S.sstep(0.0, 0.15, z)) * 0.95);
  // cotton tuft tail (part of the body)
  const tailGeo = S.puff(0.05, { count: 5, spread: 0.6, seed: 61, sy: 0.95 });
  S.pose(tailGeo, [0, 0.05, -0.15]);
  S.paint(tailGeo, { from: 0xe8dcc4, to: 0xfffaf0, axis: 'y', noise: 0.02 });
  const body = S.bake([bodyGeo, tailGeo], fur, 'body');
  root.add(body);
  body.position.y = 0.17;

  // --- Head: big and round, cream muzzle, pink nose. ------------------------
  const headGeo = S.spindle({ len: 0.2, r: 0.1, sx: 1.02, sy: 0.95, p: 1, radial: 20, rings: 14, profile: (t) => 0.92 + 0.1 * S.bump(t, 0.45, 0.45) });
  S.paint(headGeo, { from: 0xb89a70, to: TAN_HI, axis: 'y', noise: 0.01, seed: 61 });
  const muzzle = S.ball(0.045, { sx: 1.2, sy: 0.8, sz: 0.8, radial: 12, rings: 8 });
  S.pose(muzzle, S.surface(headGeo, S.dirYP(0, -0.32), { inset: 0.026 }));
  S.paint(muzzle, CREAM);
  const nose = S.ball(0.013, { sx: 1.3, sy: 0.8, radial: 8, rings: 5 });
  S.pose(nose, S.surface(muzzle, [0, 0.4, 1], { from: S.surface(headGeo, S.dirYP(0, -0.32), { inset: 0.026 }), inset: 0.004 }));
  S.paint(nose, 0xd88a8a);
  for (const s of [1, -1]) S.blush(headGeo, S.surface(headGeo, S.dirYP(s * 0.8, -0.2)), 0.035, 0xeaa08c, 0.6);
  // tiny fawn nub-antlers
  const nubs = [1, -1].map((s) => {
    const g = S.taper(0.04, 0.012, { r1: 0.006, curve: -0.2, radial: 7, rings: 5 });
    S.paint(g, { from: 0x9a7a52, to: 0xe0cda0, axis: 'y' });
    return S.pose(g, S.surface(headGeo, S.dirYP(s * 0.3, 1.05), { inset: 0.006 }), [-0.2, 0, -s * 0.3]);
  });
  const head = S.bake([headGeo, muzzle, nose, ...nubs], fur, 'head');
  kit.at(body, head, 0, 0.1, 0.15, { rz: 0.12, rx: -0.05 });

  const eyeOpts = { irisColor: 0x2a2016, skinColor: 0xcdb28a, glintSize: 0.017 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.042, 0.48, 0.12, eyeOpts, { sink: 0.42, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.042, -0.48, 0.12, eyeOpts, { sink: 0.42, front: 0.55 });

  // --- THE ears: oversized, soft, dark-tipped; one alert, one flopped. -----
  const mkEar = (droop) => {
    const g = S.ear(0.2, 0.075, { color: TAN, inner: INNER, tip: 0.9, cup: 0.5, depth: 0.32, droop });
    S.overlay(g, TIP, (x, y, z) => S.sstep(0.15, 0.19, y));
    return new THREE.Mesh(g, fur);
  };
  const earL = mkEar(0.05), earR = mkEar(0.45);
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.4, 1.0), { inset: 0.012 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.02, { rz: -0.14, ry: 0.25, rx: -0.12 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.02, { rz: 0.55, ry: -0.3, rx: -0.3 });

  // --- Legs: stubby forepaws, big hopper hind feet. -------------------------
  const front = [[0.07, -0.07, 0.09], [-0.07, -0.07, 0.09]].map(([x, y, z]) => {
    const l = S.softLeg(0.1, fur, { stubby: true, thighR: 0.032, kneeR: 0.026, pawR: 0.03, pawLen: 1.2, toes: 0, color: TAN, pawColor: CREAM, radial: 8 });
    kit.at(body, l, x, y, z);
    return l;
  });
  const hind = [[0.08, -0.04, -0.07], [-0.08, -0.04, -0.07]].map(([x, y, z]) => {
    const l = S.softLeg(0.13, fur, { thighR: 0.062, shinR: 0.03, kneeR: 0.036, pawR: 0.036, pawLen: 2.0, pawH: 0.03, toes: 0, bend: 0.45, split: 0.55, bulge: 0.35, color: TAN, shinColor: TAN, pawColor: CREAM });
    kit.at(body, l, x, y, z);
    return l;
  });

  const spark = kit.heartspark(0.024, pal.eye, { seed: 62 });
  const sp = S.surface(bodyGeo, S.dirYP(0, -0.1), { inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.2, 0.36));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      legs: [...front, ...hind].map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR],
      fx: [spark, S.variantFx(root)],
    },
    hints: {
      personality: 'skittish',
      locomotion: 'hop',
      breathAmp: 1.1,
      blinkEvery: 2.0,
    },
  };
}
