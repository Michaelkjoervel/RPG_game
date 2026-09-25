// =============================================================================
// VELDRUN — Neutral, stage 2 (Vellit awakens at L14).
// "Swift antelope-hare, ribbon tail streams when sprinting. Aloof racer."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). v1's weak spot was a camel-like neck join
// (a tube stuck onto a barrel); here body and neck are ONE sculpted form —
// the neck is a swept tube that grows out of the chest and flows up into the
// head. A lean racer: deep narrow chest, tucked waist, long slender legs with
// knee-forward hind legs, long rabbit-antelope ears with dark tips, small
// swept horns, the head held high and turned slightly away (aloof). The
// signature: long ribbon streamers flowing from the tail (they stream when it
// runs).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const TAN_LO = 0x9a7a52, TAN = 0xcdb28a, TAN_HI = 0xeadcbc, CREAM = 0xf8f0e0, TIP = 0x4a3f34, HORN = 0x5a4a3a, RIB = [0xf2e6d0, 0xd8a86a, 0x9a7aa8];

export function build_veldrun(kit = kitDefault) {
  const pal = kit.palette(['neutral']);
  const fur = S.vcMat(kit, { rough: 0.7 });
  const ribbonMat = kit.mat(0xffffff, { vertexColors: true, rough: 0.5, side: THREE.DoubleSide });

  const root = new THREE.Group();

  // --- Body + neck: one swept form. -------------------------------------------
  const bodyGeo = S.spindle({
    len: 0.5, r: 0.12, sx: 0.85, sy: 1.08, p: 0.92, radial: 18, rings: 14,
    profile: (t) => 0.74 + 0.14 * S.bump(t, 0.2, 0.28) + 0.28 * S.bump(t, 0.72, 0.32),
    belly: (t) => 0.06 + 0.3 * S.bump(t, 0.4, 0.28),
    arch: (t) => 0.03 * S.sstep(0.5, 1, t),
  });
  S.paint(bodyGeo, { from: TAN_LO, to: TAN_HI, axis: 'y', noise: 0.012, seed: 64 });
  S.overlay(bodyGeo, CREAM, (x, y, z) => S.sstep(-0.05, -0.11, y) * 0.95);
  const neckGeo = S.tubeAlong([[0, 0.02, 0.17], [0, 0.11, 0.25], [0, 0.2, 0.3], [0, 0.26, 0.35]], (t) => S.lerp(0.09, 0.062, t), { radial: 12, tubular: 14 });
  S.paint(neckGeo, { from: TAN, to: TAN_HI, axis: 'y', noise: 0.012 });
  S.overlayN(neckGeo, CREAM, (nx, ny, nz) => S.sstep(0.3, 0.7, nz - ny * 0.3) * 0.9);
  const body = S.bake([bodyGeo, neckGeo], fur, 'body');
  root.add(body);
  body.position.y = 0.44;

  // --- Head: fine and aloof, turned a little away. -----------------------------
  const headGeo = S.spindle({
    len: 0.23, r: 0.085, sx: 0.86, sy: 1.0, pTail: 1, pNose: 1.1, radial: 16, rings: 12,
    profile: (t) => (t < 0.4 ? 1 : S.lerp(1, 0.62, S.sstep(0.4, 0.8, t))),
    syAt: (t) => S.lerp(0.95, 0.75, S.sstep(0.4, 0.8, t)),
    arch: (t) => -0.015 * S.sstep(0.4, 0.9, t),
  });
  S.paint(headGeo, { from: TAN_LO, to: TAN_HI, axis: 'y', noise: 0.01, seed: 65 });
  S.overlay(headGeo, CREAM, (x, y, z) => S.sstep(0.05, 0.1, z) * 0.8);
  const nose = S.pose(S.paint(S.ball(0.011, { sx: 1.3, sy: 0.8, radial: 7, rings: 5 }), 0x5a4038), S.surface(headGeo, [0, 0.3, 1], { from: [0, -0.01, 0.03], inset: 0.004 }));
  const horns = [1, -1].map((sd) => {
    const g = S.taper(0.08, 0.012, { r1: 0.003, curve: -0.6, radial: 6, rings: 5 });
    S.paint(g, { from: HORN, to: 0xa89478, axis: 'y' });
    S.aim(g, [sd * 0.2, 1, -0.35]);
    return S.pose(g, S.surface(headGeo, S.dirYP(sd * 0.3, 1.0), { from: [0, 0, -0.03], inset: 0.004 }));
  });
  const head = S.bake([headGeo, nose, ...horns], fur, 'head');
  kit.at(body, head, 0, 0.31, 0.4, { rx: -0.05, ry: -0.3 });
  const SK = [0, 0, -0.03];
  const eyeOpts = { irisColor: 0x2a2016, skinColor: 0xcdb28a, glintSize: 0.012 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.034, 0.72, 0.2, eyeOpts, { sink: 0.45, front: 0.45, from: SK });
  const eyeR = S.seatEye(kit, head, headGeo, 0.034, -0.72, 0.2, eyeOpts, { sink: 0.45, front: 0.45, from: SK });
  const mkEar = () => {
    const g = S.ear(0.19, 0.06, { color: TAN, inner: 0xecc8b8, tip: 1.2, cup: 0.5, depth: 0.3, radial: 8, rings: 8 });
    S.overlay(g, TIP, (x, y, z) => S.sstep(0.15, 0.18, y));
    return new THREE.Mesh(g, fur);
  };
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.6, 0.8), { from: SK, inset: 0.008 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.01, { rz: -0.35, ry: 0.3, rx: -0.35 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.01, { rz: 0.35, ry: -0.3, rx: -0.35 });

  // --- Long racer legs. ----------------------------------------------------------
  const legs = [[0.07, -0.06, 0.16, -0.08, 0.045], [-0.07, -0.06, 0.16, -0.08, 0.045], [0.07, -0.04, -0.16, 0.45, 0.065], [-0.07, -0.04, -0.16, 0.45, 0.065]].map(([x, y, z, bend, thighR]) => {
    const l = S.softLeg(0.44 + y, fur, { thighR, shinR: 0.022, kneeR: 0.028, ankleR: 0.018, pawR: 0.026, pawLen: 1.3, pawH: 0.024, toes: 0, bend, split: 0.5, bulge: 0.34, color: TAN, shinColor: TAN_HI, pawColor: 0x3a3028, radial: 8 });
    kit.at(body, l, x, y, z);
    return l;
  });

  // --- The ribbon tail: long flowing streamers (a swaying accent). -----------
  const ribbons = new THREE.Group(); ribbons.name = 'ribbonTail';
  const rib = [];
  for (let i = 0; i < 3; i++) {
    const u = i - 1;
    const L = 0.34 - Math.abs(u) * 0.06;
    const g = S.spindle({ len: L, r: 0.022, sx: 1.0, sy: 0.12, radial: 8, rings: 14, profile: (t) => 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.9)) });
    g.translate(0, 0, -L / 2);
    S.bendArc(g, L, -0.5 - Math.abs(u) * 0.15);
    S.paint(g, { from: RIB[(i + 1) % 3], to: RIB[i], axis: 'z' });
    S.pose(g, [u * 0.02, 0, 0], [0, u * 0.25, u * 0.4]);
    rib.push(g);
  }
  const puffG = S.puff(0.04, { count: 4, spread: 0.5, seed: 66, sy: 1.0 });
  S.paint(puffG, CREAM);
  ribbons.add(new THREE.Mesh(S.merge(rib), ribbonMat));
  ribbons.add(new THREE.Mesh(puffG, fur));
  kit.at(body, ribbons, 0, 0.06, -0.26, { rx: 0.4 });

  const spark = kit.heartspark(0.022, pal.eye, { seed: 64 });
  const sp = S.surface(bodyGeo, S.dirYP(0, -0.1), { from: [0, 0, 0.12], inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.26, 0.36));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, ribbons],
      fx: [spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.75,
      blinkEvery: 4.0,
    },
  };
}
