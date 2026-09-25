// =============================================================================
// GLYPHANT — Terra/Lumen, stage 1 (single-stage), rare.
// "Small ruin-guardian elephant, glyphs carved in stone hide glow when it
// remembers." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). A chubby little stone elephant: a round
// sandstone barrel on four stubby pillar legs with pale toenails, a big round
// head with huge soft fan ears, small gold-capped tusks and a trunk that hangs
// and curls up at the tip (the trunk rides the animator's tail chain, so it
// sways as it explores). Its hide is weathered, carved stone — and the
// signature: RUNES carved across its flanks, ears-side and forehead, dark
// grooves that flood with warm gold light on a slow "remembering" pulse.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const STONE_LO = 0x62563e, STONE = 0x9a8c68, STONE_HI = 0xcfc39c, SAND = 0xe2d6b0, NAIL = 0xe8dcc0, IVORY = 0xf2ead4, GOLD = 0xd8a840;

// Rune strokes as [yaw, pitch] offsets (unit size) — soft, rounded glyphs.
const RUNES = [
  [[0, 1], [0.8, 0.2], [0.3, -0.9], [-0.6, -0.5], [-0.5, 0.5], [0.1, 0.6]], // spiral eye
  [[-0.9, 0.8], [0.8, 0.35], [-0.8, -0.2], [0.9, -0.8]], // zigzag
  [[-0.9, -0.8], [0, 0.9], [0.9, -0.8]], // chevron
];

export function build_glyphant(kit = kitDefault) {
  const pal = kit.palette(['terra', 'lumen']);
  const stone = S.vcMat(kit, { rough: 0.8 });
  const runeMat = kit.mat(0xffffff, { unlit: true, glow: 1 });
  const DIM = new THREE.Color(0x3e3220), BRIGHT = new THREE.Color(0xffe39a).multiplyScalar(1.7);
  runeMat.color.copy(DIM);

  const root = new THREE.Group();
  const rune = (geo, k, yaw, pitch, from, size) =>
    S.groove(geo, RUNES[k].map(([u, v]) => [yaw + u * size * (yaw > 0 ? 1 : -1), pitch + v * size]), { from, radius: 0.007, lift: 0.001, seg: 14 });

  // --- Body: a round sandstone barrel. -----------------------------------------
  const bodyGeo = S.spindle({ len: 0.5, r: 0.2, sx: 1.04, sy: 1.0, p: 0.96, radial: 18, rings: 12, belly: 0.1, profile: (t) => 0.9 + 0.1 * S.bump(t, 0.45, 0.4) });
  S.paint(bodyGeo, { from: STONE_LO, to: STONE_HI, axis: 'y', noise: 0.03, seed: 140 });
  for (const [yaw, pitch, z, r, c] of [[0.9, 0.9, 0.1, 0.05, SAND], [-1.2, 0.5, -0.12, 0.05, STONE_LO], [0.3, 1.2, -0.15, 0.04, SAND], [-0.4, 1.1, 0.12, 0.045, STONE_LO]]) {
    S.blush(bodyGeo, S.surface(bodyGeo, S.dirYP(yaw, pitch), { from: [0, 0, z] }), r, c, 0.5);
  }
  // a small tail with a dark tuft, baked
  const tailG = S.taper(0.1, 0.018, { r1: 0.01, curve: -0.4, radial: 6, rings: 4, capSeg: 1 });
  S.paint(tailG, STONE);
  const tuft = S.puff(0.022, { count: 3, spread: 0.5, seed: 146, radial: 7, rings: 5 });
  S.paint(tuft, 0x3a3226);
  tuft.translate(0, 0.1, -0.04);
  const tailAll = S.merge([tailG, tuft]);
  tailAll.rotateX(Math.PI - 0.5);
  S.pose(tailAll, S.surface(bodyGeo, [0, 0.3, -1], { inset: 0.01 }));
  const body = S.bake([bodyGeo, tailAll], stone, 'body');
  root.add(body);
  body.position.y = 0.33;
  const glyphGeos = [
    rune(bodyGeo, 0, 1.3, 0.35, [0, 0, 0.06], 0.22),
    rune(bodyGeo, 1, 1.25, 0.25, [0, 0, -0.14], 0.2),
    rune(bodyGeo, 2, -1.3, 0.35, [0, 0, 0.08], 0.22),
    rune(bodyGeo, 0, -1.25, 0.3, [0, 0, -0.13], 0.2),
    rune(bodyGeo, 2, 0.0, 1.35, [0, 0, -0.04], 0.2),
  ];
  const glyphs = new THREE.Mesh(S.merge(glyphGeos.map((g) => S.paint(g, 0xffffff))), runeMat);
  glyphs.name = 'glyphs';
  body.add(glyphs);

  // --- Head: big and round; tusks; the keeper's seal. ------------------------
  const headGeo = S.ball(0.16, { sx: 1.02, sy: 0.96, sz: 0.94, radial: 18, rings: 12 });
  S.paint(headGeo, { from: STONE_LO, to: STONE_HI, axis: 'y', noise: 0.025, seed: 141 });
  const tusks = [1, -1].map((sd) => {
    const g = S.taper(0.075, 0.016, { r1: 0.005, curve: 0.5, radial: 6, rings: 5, capSeg: 1 });
    S.paint(g, { from: GOLD, to: IVORY, axis: 'y', lo: 0.012, hi: 0.022 });
    S.aim(g, [sd * 0.35, -0.55, 1]);
    return S.pose(g, S.surface(headGeo, S.dirYP(sd * 0.35, -0.5), { inset: 0.012 }));
  });
  const head = S.bake([headGeo, ...tusks], stone, 'head');
  kit.at(body, head, 0, 0.13, 0.28);
  const seal = new THREE.Mesh(S.paint(S.groove(headGeo, [[0, 0.95], [0.18, 0.72], [0, 0.5], [-0.18, 0.72], [0, 0.95]], { radius: 0.007, lift: 0.001, seg: 14 }), 0xffffff), runeMat);
  seal.name = 'glyphs';
  head.add(seal);
  const eyeOpts = { irisColor: 0x3a2c1a, skinColor: 0x9a8c68, glintSize: 0.017 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.042, 0.55, 0.18, eyeOpts, { sink: 0.42, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.042, -0.55, 0.18, eyeOpts, { sink: 0.42, front: 0.55 });

  // Huge soft fan ears (accents).
  const mkEar = () => {
    const g = S.ear(0.2, 0.19, { color: STONE, inner: SAND, tip: 0.55, cup: 0.3, depth: 0.22, radial: 10, rings: 8 });
    return new THREE.Mesh(g, stone);
  };
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(1.2, 0.35), { inset: 0.02 });
  kit.at(head, earL, ea[0], ea[1] - 0.04, ea[2] - 0.03, { rz: -1.05, ry: 0.7, rx: 0.1 });
  kit.at(head, earR, -ea[0], ea[1] - 0.04, ea[2] - 0.03, { rz: 1.05, ry: -0.7, rx: 0.1 });

  // Trunk: a tail chain turned to face forward — hangs, then curls up.
  const trunk = S.softTail(5, stone, {
    segLen: 0.052, curl: 0.3, rootPitch: -1.35, radial: 8,
    radiusFn: (t) => S.lerp(0.046, 0.022, t) + 0.006 * S.bump(t, 1, 0.12),
    color: (t) => S.mixHex(STONE, SAND, t * 0.8),
  });
  const trunkHolder = new THREE.Group(); trunkHolder.name = 'trunkMount';
  trunkHolder.rotation.y = Math.PI;
  trunkHolder.add(trunk.group);
  const tp = S.surface(headGeo, S.dirYP(0, -0.15), { inset: 0.03 });
  kit.at(head, trunkHolder, tp[0], tp[1], tp[2]);

  // --- Stubby pillar legs with pale toenails. -----------------------------------
  const legs = [[0.12, -0.1, 0.14], [-0.12, -0.1, 0.14], [0.125, -0.09, -0.15], [-0.125, -0.09, -0.15]].map(([x, y, z]) => {
    const l = S.softLeg(0.33 + y, stone, { stubby: true, thighR: 0.078, kneeR: 0.07, pawR: 0.074, pawLen: 1.05, toes: 3, color: STONE, shinColor: STONE_LO, pawColor: STONE, radial: 10 });
    const fg = l.foot.geometry;
    fg.computeBoundingBox();
    const bb = fg.boundingBox;
    S.overlay(fg, NAIL, (px, py, pz) => S.sstep(bb.max.z - 0.035, bb.max.z - 0.01, pz) * S.sstep(bb.min.y + 0.045, bb.min.y + 0.02, py));
    kit.at(body, l, x, y, z);
    return l;
  });

  // The "remembering" pulse: the carved runes flood with light, then fade.
  let t = 1.7;
  const remembering = {
    update(dt) {
      t += dt;
      const local = t % 3.4;
      const g = local < 1.1 ? Math.sin((local / 1.1) * Math.PI) : 0;
      runeMat.color.copy(DIM).lerp(BRIGHT, 0.12 + 0.88 * g);
    },
  };
  remembering.update(0);

  const spark = kit.heartspark(0.03, pal.eye, { seed: 143 });
  const sp = S.surface(bodyGeo, S.dirYP(0, -0.1), { from: [0, 0, 0.1], inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.34, 0.4));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: trunk.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR],
      fx: [remembering, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.75,
      blinkEvery: 4.8,
    },
  };
}
