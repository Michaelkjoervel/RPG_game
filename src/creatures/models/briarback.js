// =============================================================================
// BRIARBACK — Bloom, stage 2 (Thistlit awakens at L16).
// "Bristling thorn-boar, bramble armor, berry-red eyes. Protective
// headbutter." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized): a stocky boar — a big barrel with a
// muscular shoulder hump, short sturdy legs on dark hooves, the head carried
// LOW and forward (a headbutter's guard), a broad disc snout, two curved
// thorn tusks and berry-red eyes. Its armour is a bramble mantle over the
// back: woven vines, violet-tipped thorns (Thistlit's quills, hardened),
// leaves and clusters of red berries — one merged mesh, readable at range.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const HIDE_LO = 0x3e2c20, HIDE = 0x6a4a34, HIDE_HI = 0x8e6a4a, SNOUT = 0xc8907a, VINE = 0x3f5a2c, VINE_HI = 0x6a8a3e, THORN = 0x6e4a8a, THORN_TIP = 0xe0cdf0, BERRY = 0xd8283c, LEAF = 0x5aa048, HOOF = 0x2a201a;

export function build_briarback(kit = kitDefault) {
  const pal = kit.palette(['bloom']);
  const hide = S.vcMat(kit, { rough: 0.7 });

  const root = new THREE.Group();

  // --- Body: stocky barrel, shoulder hump, head end lower. -----------------
  const bodyGeo = S.spindle({
    len: 0.62, r: 0.2, sx: 1.0, sy: 1.0, p: 0.92, radial: 18, rings: 12, belly: 0.18,
    profile: (t) => 0.8 + 0.1 * S.bump(t, 0.2, 0.3) + 0.2 * S.bump(t, 0.66, 0.32),
    arch: (t) => 0.05 * S.bump(t, 0.62, 0.22) - 0.03 * S.sstep(0.8, 1, t),
  });
  S.paint(bodyGeo, { from: HIDE_LO, to: HIDE_HI, axis: 'y', noise: 0.015, seed: 50 });
  // the bramble mantle over the back
  const mantle = [];
  const capAt = (yaw, pitch, z, inset = 0.0) => S.surface(bodyGeo, S.dirYP(yaw, pitch), { from: [0, 0, z], inset });
  // woven vines: arcs over the back
  for (let i = 0; i < 5; i++) {
    const z = 0.2 - i * 0.1;
    mantle.push(S.paint(S.groove(bodyGeo, [[-1.3, 0.25], [-0.7, 0.8], [0, 1.2], [0.7, 0.8], [1.3, 0.25]], { from: [0, 0, z], radius: 0.018, lift: 0.004, radial: 4, seg: 12 }), i % 2 ? VINE : VINE_HI));
  }
  mantle.push(S.paint(S.grooveTop(bodyGeo, [[0.02, 0.26], [-0.03, 0.1], [0.03, -0.06], [-0.02, -0.22]], { radius: 0.02, lift: 0.006, radial: 5 }), VINE));
  // thorns: Thistlit's quills, hardened — violet with pale tips
  let n = 0;
  for (let row = 0; row < 5; row++) for (let k = 0; k < 4; k++) {
    const u = (k + (row % 2) * 0.5) / 3.5 - 0.5;
    const yaw = u * 2.4, pitch = 1.1 - Math.abs(u) * 0.9;
    const at = capAt(yaw, pitch, 0.22 - row * 0.1, 0.004);
    const nrm = S.dirYP(yaw, pitch);
    const len = 0.07 + ((n * 7919) % 11) / 11 * 0.035;
    const g = S.taper(len, 0.018, { r1: 0.002, curve: -0.2, radial: 5, rings: 3, capSeg: 1 });
    S.paint(g, { from: THORN, to: THORN_TIP, axis: 'y', exp: 2 });
    S.aim(g, [nrm[0], nrm[1], nrm[2] - 0.5]);
    mantle.push(S.pose(g, at));
    n++;
  }
  // leaves and berry clusters tucked into the vines
  for (const [yaw, pitch, z, bs] of [[0.6, 0.85, 0.12, 1], [-0.7, 0.8, -0.02, 1], [0.3, 1.15, -0.2, 0], [-0.25, 1.05, 0.22, 0], [0.9, 0.5, -0.15, 1]]) {
    const at = capAt(yaw, pitch, z, -0.006);
    const leaf = S.spindle({ len: 0.07, r: 0.022, sx: 1, sy: 0.25, radial: 6, rings: 4, pNose: 1.4 });
    leaf.translate(0, 0, 0.03);
    S.paint(leaf, { from: 0x3f7a30, to: LEAF, axis: 'z' });
    mantle.push(S.pose(leaf, at, [-0.4, yaw + 0.8, 0]));
    if (bs) for (let b = 0; b < 3; b++) {
      const be = S.ball(0.018, { radial: 6, rings: 4 });
      S.paint(be, { from: 0x901828, to: BERRY, axis: 'y' });
      mantle.push(S.pose(be, [at[0] + (b - 1) * 0.02, at[1] + 0.012 + (b === 1 ? 0.012 : 0), at[2] + 0.015]));
    }
  }
  const body = S.bake([bodyGeo, ...mantle], hide, 'body');
  root.add(body);
  body.position.y = 0.4;

  // --- Head: low and forward, broad disc snout, thorn tusks. --------------
  const headGeo = S.spindle({
    len: 0.3, r: 0.13, sx: 1.05, sy: 0.95, pTail: 1, pNose: 0.8, radial: 18, rings: 14, belly: 0.1,
    profile: (t) => 1.0 - 0.3 * S.sstep(0.45, 1, t),
    arch: (t) => -0.02 * S.sstep(0.5, 1, t),
  });
  S.paint(headGeo, { from: HIDE_LO, to: HIDE_HI, axis: 'y', noise: 0.012, seed: 51 });
  const disc = S.spindle({ len: 0.05, r: 0.06, sx: 1.15, sy: 0.9, radial: 16, rings: 6 });
  const dAt = S.surface(headGeo, [0, 0, 1], { from: [0, -0.02, 0], inset: 0.012 });
  S.pose(disc, dAt);
  S.paint(disc, { from: 0xa87060, to: SNOUT, axis: 'y' });
  const nostrils = [1, -1].map((s) => S.paint(S.pose(S.ball(0.012, { sx: 0.8, radial: 6, rings: 4 }), [dAt[0] + s * 0.024, dAt[1], dAt[2] + 0.024]), 0x3a1e18));
  const tusks = [1, -1].map((s) => {
    const g = S.taper(0.075, 0.016, { r1: 0.003, curve: -0.6, radial: 7, rings: 5 });
    S.paint(g, { from: 0xe8dcc8, to: 0xfff8ec, axis: 'y' });
    return S.pose(g, S.surface(headGeo, [s * 0.8, -0.4, 0.5], { from: [0, -0.03, 0.08], inset: 0.01 }), [0.3, 0, -s * 0.35]);
  });
  const brows = [1, -1].map((s) => S.paint(S.groove(headGeo, [[s * 0.25, 0.46], [s * 0.45, 0.4], [s * 0.62, 0.28]], { from: [0, 0, -0.04], radius: 0.012, lift: 0.002 }), 0x2e2016));
  const head = S.bake([headGeo, disc, ...nostrils, ...tusks, ...brows], hide, 'head');
  kit.at(body, head, 0, 0.0, 0.4, { rx: 0.22 });
  const eyeOpts = { irisColor: 0xc8182c, pupilColor: 0x1a0608, scleraColor: 0xf2e6d4, skinColor: 0x5a3e2c, glintSize: 0.012 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.03, 0.62, 0.2, eyeOpts, { sink: 0.45, front: 0.55, from: [0, 0, -0.04] });
  const eyeR = S.seatEye(kit, head, headGeo, 0.03, -0.62, 0.2, eyeOpts, { sink: 0.45, front: 0.55, from: [0, 0, -0.04] });
  const mkEar = () => new THREE.Mesh(S.ear(0.075, 0.06, { color: HIDE, inner: 0x9a6a5a, tip: 1.1, cup: 0.5, depth: 0.4, radial: 8, rings: 6 }), hide);
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.7, 0.8), { from: [0, 0, -0.06], inset: 0.01 });
  kit.at(head, earL, ea[0], ea[1], ea[2], { rz: -0.9, ry: 0.4 });
  kit.at(head, earR, -ea[0], ea[1], ea[2], { rz: 0.9, ry: -0.4 });

  // --- Short sturdy legs on dark hooves. -----------------------------------
  const legs = [[0.12, -0.1, 0.19, -0.05], [-0.12, -0.1, 0.19, -0.05], [0.12, -0.08, -0.19, 0.22], [-0.12, -0.08, -0.19, 0.22]].map(([x, y, z, bend]) => {
    const l = S.softLeg(0.4 + y, hide, { thighR: 0.085, shinR: 0.045, kneeR: 0.05, ankleR: 0.038, pawR: 0.05, pawLen: 1.15, pawH: 0.04, toes: 2, bend, split: 0.5, bulge: 0.3, color: HIDE, shinColor: HIDE_LO, pawColor: HOOF });
    kit.at(body, l, x, y, z);
    return l;
  });

  // --- Short curly tail. ----------------------------------------------------
  const tail = S.softTail(3, hide, { segLen: 0.045, startR: 0.022, endR: 0.012, curl: 0.9, rootPitch: 0.6, color: HIDE });
  kit.at(body, tail, 0, 0.06, -0.3);

  const spark = kit.heartspark(0.03, pal.eye, { seed: 52 });
  const sp = S.surface(bodyGeo, S.dirYP(0, -0.25), { from: [0, 0, 0.2], inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.4, 0.4));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR],
      fx: [spark, S.variantFx(root)],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'quad',
      breathAmp: 1.1,
      blinkEvery: 3.6,
    },
  };
}
