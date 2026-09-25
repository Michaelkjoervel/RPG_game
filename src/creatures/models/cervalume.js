// =============================================================================
// CERVALUME — Lumen/Bloom, stage 2 (Dapplyn awakens at a Shrine).
// "Radiant deer, antlers of hard light, hooves leave glowing blossoms.
// Awakens only where shardlight pools." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). Dapplyn's fawn grown into a graceful adult
// doe-stag: a lean ivory-and-honey body whose neck flows up out of the chest
// (one sculpted form, no tube-on-barrel join), long slender legs on gold
// hooves, a gentle head with big dark eyes and wide leaf ears, the fawn's
// cream dapples still on its back. The signature reads at any distance: a
// crown of HARD-LIGHT ANTLERS — lyre-shaped beams with forward tines, made of
// unlit gold light that brightens to white at the tips (they bloom on High).
// Each hoof stands on a small glowing blossom.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const COAT_LO = 0xa8844e, COAT = 0xd8bc88, COAT_HI = 0xf6ead0, CREAM = 0xfffaf0, HOOF = 0xc8963c;
const LIGHT = [0xe88f22, 0xffc850, 0xfff4cc];

// One hard-light antler (left side for sd = +1). Base at the origin.
function antlerGeo(sd) {
  const L = 0.34, C = -0.32; // the beam curves back in toward the crown at the top
  const parts = [S.taper(L, 0.017, { r1: 0.005, curve: C, radial: 6, rings: 7, capSeg: 1 })];
  for (const [t, len, dx] of [[0.32, 0.11, 0.9], [0.58, 0.12, 0.6], [0.82, 0.08, 0.4]]) {
    const g = S.taper(len, 0.009, { r1: 0.003, curve: 0.25, radial: 5, rings: 4, capSeg: 1 });
    S.aim(g, [dx, 1, -0.35]);
    parts.push(S.pose(g, [0, t * L, C * L * t * t]));
  }
  const g = S.merge(parts);
  // local +Z (the beam's bend) -> inward; local +X -> forward; then splay out and back
  g.rotateY(-sd * Math.PI / 2);
  g.rotateZ(-sd * 0.55);
  g.rotateX(-0.3);
  g.computeBoundingBox();
  const h = g.boundingBox.max.y;
  S.paint(g, { fn: (x, y, z) => S.clamp01(y / h), from: LIGHT[0], to: LIGHT[2] });
  const col = g.attributes.color, pos = g.attributes.position, c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = S.clamp01(pos.getY(i) / h);
    c.setHex(t < 0.55 ? S.mixHex(LIGHT[0], LIGHT[1], t / 0.55) : S.mixHex(LIGHT[1], LIGHT[2], (t - 0.55) / 0.45));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return g;
}

// A flat five-petal rosette of light (normal +Y), for under each hoof.
function blossomGeo(r) {
  const g = new THREE.CircleGeometry(r, 30);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  for (let i = 1; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const a = Math.atan2(y, x);
    const k = 0.45 + 0.55 * Math.pow(Math.abs(Math.cos(2.5 * a)), 0.6);
    pos.setXY(i, x * k, y * k);
  }
  g.rotateX(-Math.PI / 2);
  S.paint(g, { fn: (x, y, z) => S.clamp01(Math.hypot(x, z) / r), from: 0xfff2c4, to: 0xff8fc0 });
  return g;
}

export function build_cervalume(kit = kitDefault) {
  const pal = kit.palette(['lumen', 'bloom']);
  const fur = S.vcMat(kit, { rough: 0.6 });
  const lightMat = kit.mat(0xffffff, { unlit: true, vertexColors: true });
  lightMat.userData.softVC = true;
  const bloomMat = kit.mat(0xffffff, { unlit: true, vertexColors: true, transparent: true, opacity: 0.85 });
  bloomMat.depthWrite = false;
  bloomMat.userData.softVC = true;

  const root = new THREE.Group();

  // --- Body + neck: one swept form; dapples on the back. ----------------------
  const bodyGeo = S.spindle({
    len: 0.54, r: 0.125, sx: 0.84, sy: 1.08, p: 0.92, radial: 16, rings: 12,
    profile: (t) => 0.76 + 0.14 * S.bump(t, 0.2, 0.28) + 0.26 * S.bump(t, 0.72, 0.32),
    belly: (t) => 0.06 + 0.3 * S.bump(t, 0.4, 0.28),
    arch: (t) => 0.03 * S.sstep(0.5, 1, t),
  });
  S.paint(bodyGeo, { from: COAT_LO, to: COAT_HI, axis: 'y', noise: 0.012, seed: 150 });
  S.overlay(bodyGeo, CREAM, (x, y, z) => S.sstep(-0.05, -0.11, y) * 0.95);
  for (const [yaw, pitch, z] of [[0.9, 0.75, 0.1], [1.1, 0.5, -0.04], [0.8, 0.8, -0.16], [0.35, 1.2, 0.02],
    [-0.9, 0.75, 0.06], [-1.1, 0.5, -0.1], [-0.8, 0.8, 0.14], [-0.35, 1.2, -0.12]]) {
    S.blush(bodyGeo, S.surface(bodyGeo, S.dirYP(yaw, pitch), { from: [0, 0, z] }), 0.022, CREAM, 0.95);
  }
  const neckGeo = S.tubeAlong([[0, 0.02, 0.17], [0, 0.14, 0.245], [0, 0.26, 0.29], [0, 0.34, 0.31]], (t) => S.lerp(0.085, 0.056, t), { radial: 12, tubular: 12 });
  S.paint(neckGeo, { from: COAT, to: COAT_HI, axis: 'y', noise: 0.012 });
  S.overlayN(neckGeo, CREAM, (nx, ny, nz) => S.sstep(0.3, 0.7, nz - ny * 0.3) * 0.9);
  const body = S.bake([bodyGeo, neckGeo], fur, 'body');
  root.add(body);
  body.position.y = 0.46;

  // --- Head: gentle, big dark eyes, wide leaf ears, the light crown. ---------
  const headGeo = S.spindle({
    len: 0.23, r: 0.088, sx: 0.9, sy: 1.0, pTail: 1, pNose: 1.1, radial: 16, rings: 12,
    profile: (t) => (t < 0.42 ? 1 : S.lerp(1, 0.6, S.sstep(0.42, 0.85, t))),
    syAt: (t) => S.lerp(0.98, 0.76, S.sstep(0.4, 0.85, t)),
    arch: (t) => -0.018 * S.sstep(0.4, 0.9, t),
  });
  S.paint(headGeo, { from: COAT_LO, to: COAT_HI, axis: 'y', noise: 0.01, seed: 151 });
  S.overlay(headGeo, CREAM, (x, y, z) => S.sstep(0.04, 0.1, z) * S.sstep(0.0, -0.04, y) * 0.9);
  const nose = S.pose(S.paint(S.ball(0.013, { sx: 1.3, sy: 0.8, radial: 7, rings: 5 }), 0x3a2a20), S.surface(headGeo, [0, 0.3, 1], { from: [0, -0.01, 0.03], inset: 0.004 }));
  const head = S.bake([headGeo, nose], fur, 'head');
  kit.at(body, head, 0, 0.38, 0.37, { rx: 0.18 });
  const SK = [0, 0, -0.03];
  const eyeOpts = { irisColor: 0x2e1c10, skinColor: 0xd8bc88, glintSize: 0.014 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.038, 0.62, 0.2, eyeOpts, { sink: 0.42, front: 0.5, from: SK });
  const eyeR = S.seatEye(kit, head, headGeo, 0.038, -0.62, 0.2, eyeOpts, { sink: 0.42, front: 0.5, from: SK });
  const mkEar = () => new THREE.Mesh(S.ear(0.14, 0.085, { color: COAT, inner: 0xf2d8c4, tip: 1.0, cup: 0.5, depth: 0.3, radial: 8, rings: 7 }), fur);
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(1.0, 0.45), { from: SK, inset: 0.01 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.015, { rz: -1.15, ry: 0.35, rx: -0.1 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.015, { rz: 1.15, ry: -0.35, rx: -0.1 });

  // THE ANTLERS OF HARD LIGHT (accents: they sway about their base).
  const antlers = [1, -1].map((sd) => {
    const m = new THREE.Mesh(antlerGeo(sd), lightMat);
    m.name = 'antler';
    const at = S.surface(headGeo, S.dirYP(sd * 0.32, 1.05), { from: SK, inset: 0.012 });
    kit.at(head, m, at[0], at[1], at[2]);
    return m;
  });
  const crownGlow = S.glow(0xffe0a0, 0.42, 0.3);
  crownGlow.position.set(0, 0.28, -0.08);
  head.add(crownGlow);

  // --- Long legs on gold hooves, each standing on a blossom of light. -------
  const legs = [[0.068, -0.06, 0.17, -0.08, 0.05], [-0.068, -0.06, 0.17, -0.08, 0.05], [0.068, -0.04, -0.17, 0.42, 0.07], [-0.068, -0.04, -0.17, 0.42, 0.07]].map(([x, y, z, bend, thighR]) => {
    const l = S.softLeg(0.46 + y, fur, { thighR, shinR: 0.024, kneeR: 0.03, ankleR: 0.02, pawR: 0.027, pawLen: 1.25, pawH: 0.028, toes: 0, bend, split: 0.5, bulge: 0.32, color: COAT, shinColor: COAT_HI, pawColor: HOOF, radial: 7 });
    kit.at(body, l, x, y, z);
    return l;
  });
  const blossom = blossomGeo(0.055);
  legs.forEach((l, i) => {
    l.foot.geometry.computeBoundingBox();
    const bb = l.foot.geometry.boundingBox;
    const b = new THREE.Mesh(blossom, bloomMat);
    b.name = 'blossom';
    b.position.set(0, bb.min.y + 0.003, (bb.min.z + bb.max.z) * 0.5 + 0.1 * (bb.max.z - bb.min.z));
    b.rotation.y = i * 1.3;
    l.foot.add(b);
  });

  // --- Short white flag of a tail. ---------------------------------------------
  const tail = S.softTail(2, fur, {
    segLen: 0.045, curl: 0.35, rootPitch: 0.7, radial: 8,
    radiusFn: (t) => 0.026 + 0.012 * Math.sin(Math.PI * Math.min(1, t + 0.2)),
    color: (t) => S.mixHex(COAT, CREAM, t),
  });
  kit.at(body, tail, 0, 0.08, -0.27);

  // A slow drift of pale-gold light about the shoulders.
  const motes = kit.mote(8, { color: 0xfff2c8, size: 0.02, radius: 0.3, height: 0.3, speed: 0.3, seed: 151 });
  kit.at(body, motes, 0, 0.18, 0.08);
  const spark = kit.heartspark(0.03, 0xfff2c8, { seed: 152 });
  const sp = S.surface(bodyGeo, S.dirYP(0, -0.1), { from: [0, 0, 0.12], inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.28, 0.36));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, ...antlers],
      fx: [motes, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.7,
      blinkEvery: 4.6,
    },
  };
}
