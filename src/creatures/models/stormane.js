// =============================================================================
// STORMANE — Volt, stage 2 (Fulmin awakens at L22).
// "Thunder-maned wolf, mane arcs with lightning when it howls.
// Storm-herald." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized): Fulmin's static fox kit grown into a
// storm-grey wolf — deep chest, tucked waist, heavy shoulders and thighs on
// real joints, a wedge head carried high with tall ears — and the signature
// THUNDER MANE: a big crest of pale-gold spiky fur standing on end from brow
// to shoulders, with live lightning arcs flickering through it. A bushy tail
// tipped with the same static gold.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const FUR_LO = 0x2c3444, FUR = 0x4c5a70, FUR_HI = 0x7e8ca4, MANE = 0xffe07a, MANE_LO = 0xd8a640, PALE = 0xc8d0dc, SOCK = 0x232a36;

// A few jagged bolts flickering through the mane (one merged mesh, toggled).
function maneArcs(material, anchors) {
  const group = new THREE.Group(); group.name = 'maneArcs';
  const geos = [];
  anchors.forEach(([a, b], k) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const pts = [];
    for (let i = 0; i <= 5; i++) {
      const p = A.clone().lerp(B, i / 5);
      if (i > 0 && i < 5) { p.x += (i % 2 ? 1 : -1) * 0.018; p.y += Math.sin(i * 2.1 + k) * 0.02; }
      pts.push(p);
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05), 10, 0.006, 3, false);
    g.deleteAttribute('uv');
    geos.push(S.paint(g, 0xffffff));
  });
  const mesh = new THREE.Mesh(S.merge(geos), material);
  group.add(mesh);
  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      mesh.visible = Math.sin(t * 13.7) + Math.sin(t * 31.3 + 1.1) > 0.4;
      mesh.scale.y = 0.8 + 0.4 * Math.abs(Math.sin(t * 47));
    },
  };
}

export function build_stormane(kit = kitDefault) {
  const pal = kit.palette(['volt']);
  const fur = S.vcMat(kit, { rough: 0.64 });
  const boltMat = kit.mat(0xfff4b0, { unlit: true });

  const root = new THREE.Group();

  // --- Torso + neck ------------------------------------------------------------
  const torso = S.spindle({
    len: 0.66, r: 0.175, sx: 0.88, sy: 1.1, p: 0.9, radial: 16, rings: 12,
    profile: (t) => 0.74 + 0.16 * S.bump(t, 0.17, 0.28) + 0.3 * S.bump(t, 0.72, 0.34),
    belly: (t) => 0.06 + 0.34 * S.bump(t, 0.36, 0.3),
    arch: (t) => 0.04 * S.sstep(0.45, 1, t),
  });
  S.paint(torso, { from: FUR_LO, to: FUR_HI, axis: 'y', exp: 0.9, noise: 0.012, seed: 30 });
  S.overlay(torso, PALE, (x, y, z) => S.sstep(-0.07, -0.16, y) * 0.8);
  const neck = S.spindle({ len: 0.3, r: 0.105, sx: 0.95, sy: 1.08, p: 0.9, radial: 14, rings: 8, profile: (t) => 1.12 - 0.22 * t });
  S.pose(neck, [0, 0.13, 0.3], [-0.85, 0, 0]);
  S.paint(neck, { from: FUR_LO, to: FUR_HI, axis: 'y', noise: 0.012 });
  // THE THUNDER MANE: a ruff of spiky pale-gold fur standing on end all round
  // the neck (a fan of round spikes per ring, swept up and back), brow to withers.
  const mane = [];
  const clump = (at, dir, len, w) => {
    const g = S.taper(len, w, { r1: w * 0.12, curve: -0.3, radial: 5, rings: 3, capSeg: 1 });
    S.paint(g, { from: MANE_LO, to: MANE, axis: 'y', noise: 0.015 });
    S.aim(g, dir);
    return S.pose(g, at);
  };
  const neckAll = S.merge([neck.clone()]);
  const AX = [0, Math.sin(0.85), Math.cos(0.85)], UPP = [0, Math.cos(0.85), -Math.sin(0.85)];
  for (let i = 0; i < 5; i++) {
    const u = i / 4;
    const from = [0, 0.13 + (u - 0.45) * 0.24 * AX[1], 0.3 + (u - 0.45) * 0.24 * AX[2]];
    for (let k = -2; k <= 2; k++) {
      const phi = k * 0.62 + (i % 2 ? 0.3 : 0);
      const d = [Math.sin(phi), Math.cos(phi) * UPP[1], Math.cos(phi) * UPP[2]];
      const at = S.surface(neckAll, d, { from, inset: 0.014 });
      const len = (0.16 - Math.abs(k) * 0.025) * (1.05 - Math.abs(u - 0.4) * 0.5);
      mane.push(clump(at, [d[0] * 1.2, d[1] + 0.35, d[2] - 0.5], len, 0.048));
    }
  }
  for (let i = 0; i < 3; i++) {
    const at = S.surface(torso, [0, 1, 0], { from: [0, 0, 0.16 - i * 0.1], inset: 0.012 });
    mane.push(clump(at, [0, 1, -0.8], 0.12 - i * 0.025, 0.05));
  }
  const body = S.bake([torso, neck, ...mane], fur, 'body');
  root.add(body);
  body.position.y = 0.47;
  const arcs = maneArcs(boltMat, [[[0.05, 0.36, 0.34], [-0.04, 0.28, 0.2]], [[-0.06, 0.34, 0.3], [0.05, 0.24, 0.14]], [[0.0, 0.3, 0.12], [0.0, 0.26, -0.04]]]);
  body.add(arcs.group);
  const maneGlow = S.glow(MANE, 0.5, 0.35);
  maneGlow.position.set(0, 0.3, 0.2);
  body.add(maneGlow);

  // --- Head: wolf wedge, tall ears -------------------------------------------------
  const headGeo = S.spindle({
    len: 0.36, r: 0.12, sx: 1.0, sy: 1.0, pTail: 1.0, pNose: 1.15, radial: 16, rings: 12, belly: 0.1,
    profile: (t) => (t < 0.42 ? 1.0 : S.lerp(1.0, 0.56, S.sstep(0.42, 0.68, t))) - 0.14 * S.sstep(0.72, 1, t),
    syAt: (t) => S.lerp(0.9, 0.72, S.sstep(0.42, 0.7, t)),
    arch: (t) => -0.045 * S.sstep(0.38, 0.75, t),
  });
  S.paint(headGeo, { from: FUR_LO, to: FUR_HI, axis: 'y', noise: 0.01, seed: 31 });
  S.overlay(headGeo, PALE, (x, y, z) => S.sstep(-0.05, -0.085, y) * S.sstep(0.0, 0.06, z));
  const nose = S.pose(S.paint(S.ball(0.027, { sx: 1.35, sy: 0.85, radial: 8, rings: 6 }), 0x14161c), S.surface(headGeo, [0, 0.25, 1], { from: [0, -0.04, 0.05], inset: 0.012 }));
  const brows = [1, -1].map((sd) => S.paint(S.groove(headGeo, [[sd * 0.16, 0.5], [sd * 0.4, 0.56], [sd * 0.62, 0.42]], { from: [0, 0, -0.075], radius: 0.008, lift: 0.001 }), 0x1a1e28));
  const cheeks = [];
  for (const sd of [1, -1]) for (let i = 0; i < 2; i++) cheeks.push(clump(S.surface(headGeo, [sd, -0.3 + i * 0.3, -0.15], { from: [0, -0.02, -0.05 - i * 0.03], inset: 0.012 }), [sd * 0.8, -0.1 + i * 0.3, -1], 0.07, 0.034));
  const head = S.bake([headGeo, nose, ...brows, ...cheeks], fur, 'head');
  kit.at(body, head, 0, 0.35, 0.53, { rx: 0.02, ry: -0.1 });
  const SK = [0, 0, -0.075];
  const eyeOpts = { irisColor: 0xffd23a, pupilColor: 0x1a1406, skinColor: 0x3a4454, glintSize: 0.012 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.034, 0.62, 0.2, eyeOpts, { sink: 0.45, front: 0.62, from: SK });
  const eyeR = S.seatEye(kit, head, headGeo, 0.034, -0.62, 0.2, eyeOpts, { sink: 0.45, front: 0.62, from: SK });
  const mkEar = () => {
    const g = S.ear(0.14, 0.09, { color: FUR, inner: 0x9aa4b8, tip: 1.9, cup: 0.45, depth: 0.4, radial: 8, rings: 7 });
    S.overlay(g, MANE, (x, y, z) => S.sstep(0.1, 0.13, y));
    return new THREE.Mesh(g, fur);
  };
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.5, 1.0), { from: SK, inset: 0.016 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.02, { rz: -0.3, ry: 0.55, rx: -0.2 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.02, { rz: 0.3, ry: -0.55, rx: -0.2 });

  // --- Legs ---------------------------------------------------------------------
  const foreDef = { thighR: 0.078, shinR: 0.036, kneeR: 0.045, ankleR: 0.03, pawR: 0.048, pawLen: 1.3, bend: -0.12, split: 0.52, bulge: 0.28 };
  const hindDef = { thighR: 0.1, shinR: 0.036, kneeR: 0.046, ankleR: 0.03, pawR: 0.048, pawLen: 1.3, bend: 0.4, split: 0.45, bulge: 0.35 };
  const legs = [[0.085, -0.06, 0.2, foreDef], [-0.085, -0.06, 0.2, foreDef], [0.08, -0.04, -0.21, hindDef], [-0.08, -0.04, -0.21, hindDef]].map(([x, y, z, d]) => {
    const l = S.softLeg(0.47 + y, fur, { ...d, color: FUR, shinColor: FUR_LO, pawColor: SOCK, toes: 3, radial: 7 });
    kit.at(body, l, x, y, z);
    return l;
  });

  // --- Bushy storm tail, static-gold tip --------------------------------------
  const tail = S.softTail(4, fur, {
    segLen: 0.1, curl: 0.16, rootPitch: 0.35, radial: 8,
    radiusFn: (t) => 0.042 + 0.038 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)) - 0.012 * t,
    color: (t) => (t < 0.7 ? S.mixHex(FUR, FUR_HI, t) : S.mixHex(FUR_HI, MANE, S.sstep(0.7, 0.9, t))),
  });
  kit.at(body, tail, 0, 0.08, -0.3);

  const spark = kit.heartspark(0.032, pal.eye, { seed: 32 });
  kit.at(body, spark, 0, 0.02, 0.4);

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
      fx: [arcs, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.9,
      blinkEvery: 3.6,
    },
  };
}
