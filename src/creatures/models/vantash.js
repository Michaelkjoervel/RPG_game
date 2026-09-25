// =============================================================================
// VANTASH — Umbra, stage 1 (single-stage), rare.
// "Lithe void-panther, used by Order elites; its tail ends in a hook of
// dark." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). A long, low, lithe panther in void-indigo
// fur with faint darker rosettes: high shoulder blades, a deep chest and a
// tucked waist on slender legs with big soft paws; a compact cat head with
// wide cheeks, small rounded ears, a short muzzle with little fangs, stern
// brows and glowing violet eyes. A thin seam of violet void-light runs down
// its spine. The signature: a long tail raised in a high arc that ends in a
// HOOK OF DARK — a black crescent claw with a glowing violet inner edge.
// Composed and unhurried (an elite's mount): regal personality.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const FUR_LO = 0x1c1830, FUR = 0x352e52, FUR_HI = 0x62578a, BELLY = 0x282240, ROSETTE = 0x17132a, VOID = 0x0e0b18, EDGE = 0xb48cff;

export function build_vantash(kit = kitDefault) {
  const pal = kit.palette(['umbra']);
  const fur = S.vcMat(kit, { rough: 0.5, emissive: 0x1a1530, emissiveIntensity: 0.5 });
  const glowMat = kit.mat(EDGE, { unlit: true });

  const root = new THREE.Group();

  // --- Torso: long and low, high shoulders, deep chest, tucked waist. -------
  const torso = S.spindle({
    len: 0.62, r: 0.11, sx: 0.84, sy: 1.08, p: 0.9, radial: 16, rings: 12,
    profile: (t) => 0.72 + 0.2 * S.bump(t, 0.2, 0.26) + 0.26 * S.bump(t, 0.74, 0.3),
    belly: (t) => 0.04 + 0.34 * S.bump(t, 0.36, 0.3),
    arch: (t) => 0.02 * S.bump(t, 0.22, 0.2) + 0.03 * S.bump(t, 0.72, 0.16),
  });
  S.paint(torso, { from: FUR_LO, to: FUR_HI, axis: 'y', exp: 0.8, noise: 0.012, seed: 160 });
  S.overlay(torso, BELLY, (x, y, z) => S.sstep(-0.05, -0.1, y) * 0.8);
  for (const [yaw, pitch, z] of [[1.1, 0.45, 0.12], [1.2, 0.25, -0.02], [1.0, 0.6, -0.14], [1.25, 0.4, 0.22], [0.95, 0.35, -0.22],
    [-1.1, 0.45, 0.08], [-1.2, 0.25, -0.06], [-1.0, 0.6, -0.16], [-1.25, 0.4, 0.2], [-0.95, 0.35, -0.24]]) {
    S.blush(torso, S.surface(torso, S.dirYP(yaw, pitch), { from: [0, 0, z] }), 0.024, ROSETTE, 0.55);
  }
  const neck = S.spindle({ len: 0.2, r: 0.075, sx: 0.95, sy: 1.05, p: 0.9, radial: 12, rings: 7, profile: (t) => 1.1 - 0.2 * t });
  S.pose(neck, [0, 0.07, 0.3], [-0.55, 0, 0]);
  S.paint(neck, { from: FUR_LO, to: FUR_HI, axis: 'y', noise: 0.012 });
  const body = S.bake([torso, neck], fur, 'body');
  root.add(body);
  body.position.y = 0.36;
  // the void seam down the spine
  const seam = S.grooveTop(torso, [[0, 0.24], [0, 0.1], [0, -0.06], [0, -0.22]], { radius: 0.006, lift: 0.001 });
  const seamMesh = new THREE.Mesh(S.paint(seam, 0xffffff), glowMat);
  seamMesh.name = 'voidSeam';
  body.add(seamMesh);

  // --- Head: compact cat, wide cheeks, short muzzle, stern brows. ------------
  const headGeo = S.spindle({
    len: 0.19, r: 0.085, sx: 1.1, sy: 1.0, pTail: 1, pNose: 1.15, radial: 16, rings: 12, belly: 0.06,
    profile: (t) => (t < 0.52 ? 1 : S.lerp(1, 0.6, S.sstep(0.52, 0.95, t))),
    syAt: (t) => S.lerp(0.92, 0.72, S.sstep(0.5, 0.9, t)),
    arch: (t) => -0.012 * S.sstep(0.5, 0.95, t),
  });
  S.paint(headGeo, { from: FUR_LO, to: FUR_HI, axis: 'y', noise: 0.01, seed: 161 });
  S.overlay(headGeo, BELLY, (x, y, z) => S.sstep(-0.02, -0.06, y) * 0.8);
  const SK = [0, 0, -0.02];
  const nose = S.pose(S.paint(S.ball(0.014, { sx: 1.4, sy: 0.8, radial: 7, rings: 5 }), 0x0c0a14), S.surface(headGeo, [0, 0.35, 1], { from: [0, -0.005, 0.04], inset: 0.004 }));
  const pads = [1, -1].map((sd) => S.pose(S.paint(S.ball(0.024, { sx: 1.0, sy: 0.8, radial: 8, rings: 6 }), 0x4a4270), S.surface(headGeo, [sd * 0.45, -0.25, 1], { from: [0, -0.02, 0.04], inset: 0.016 })));
  const fangs = [1, -1].map((sd) => {
    const g = S.taper(0.028, 0.006, { r1: 0.0015, radial: 5, rings: 3, capSeg: 1 });
    g.rotateX(Math.PI);
    S.paint(g, 0xece6f4);
    return S.pose(g, S.surface(headGeo, [sd * 0.3, -0.55, 1], { from: [0, -0.02, 0.05], inset: 0.004 }));
  });
  const brows = [1, -1].map((sd) => S.paint(S.groove(headGeo, [[sd * 0.2, 0.46], [sd * 0.45, 0.5], [sd * 0.7, 0.4]], { from: SK, radius: 0.007, lift: 0.001 }), VOID));
  const head = S.bake([headGeo, nose, ...pads, ...fangs, ...brows], fur, 'head');
  kit.at(body, head, 0, 0.18, 0.43, { rx: 0.1 });
  const eyeOpts = { irisColor: 0xc8a8ff, pupilColor: 0x0a0812, scleraColor: 0x120e1c, skinColor: 0x352e52, glintSize: 0.012 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.032, 0.56, 0.2, eyeOpts, { sink: 0.45, front: 0.6, from: SK });
  const eyeR = S.seatEye(kit, head, headGeo, 0.032, -0.56, 0.2, eyeOpts, { sink: 0.45, front: 0.6, from: SK });
  const mkEar = () => new THREE.Mesh(S.ear(0.08, 0.07, { color: FUR, inner: 0x6a4fa8, tip: 0.9, cup: 0.45, depth: 0.36, radial: 8, rings: 6 }), fur);
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.62, 0.9), { from: SK, inset: 0.012 });
  kit.at(head, earL, ea[0], ea[1], ea[2], { rz: -0.45, ry: 0.25 });
  kit.at(head, earR, -ea[0], ea[1], ea[2], { rz: 0.45, ry: -0.25 });

  // --- Slender legs, big soft paws. ---------------------------------------------
  const fore = { thighR: 0.062, shinR: 0.03, kneeR: 0.036, ankleR: 0.026, pawR: 0.044, pawLen: 1.2, bend: -0.1, split: 0.5, bulge: 0.3 };
  const hind = { thighR: 0.078, shinR: 0.03, kneeR: 0.036, ankleR: 0.026, pawR: 0.044, pawLen: 1.2, bend: 0.42, split: 0.46, bulge: 0.36 };
  const legs = [[0.07, -0.05, 0.2, fore], [-0.07, -0.05, 0.2, fore], [0.068, -0.03, -0.21, hind], [-0.068, -0.03, -0.21, hind]].map(([x, y, z, d]) => {
    const l = S.softLeg(0.36 + y, fur, { ...d, color: FUR, shinColor: FUR_LO, pawColor: 0x2a2442, toes: 3, radial: 7 });
    kit.at(body, l, x, y, z);
    return l;
  });

  // --- The tail: a high arc ending in the HOOK OF DARK. ---------------------
  const curls = [0.4, 0.3, 0.12, -0.08, -0.2, -0.26];
  const tail = S.softTail(6, fur, {
    segLen: 0.085, startR: 0.034, endR: 0.02, curl: (i) => curls[i], rootPitch: 0.45, radial: 8,
    color: (t) => S.mixHex(FUR, FUR_LO, t),
  });
  kit.at(body, tail, 0, 0.06, -0.3);
  const hook = new THREE.Group(); hook.name = 'hook';
  const hookGeo = S.taper(0.26, 0.036, { r1: 0.004, curve: 1.15, radial: 7, rings: 8, sx: 0.55 });
  hookGeo.rotateX(-Math.PI / 2); // grow on along the tail (-Z), curl up (+Y)
  S.paint(hookGeo, { from: 0x2a2244, to: VOID, axis: 'z' });
  hook.add(new THREE.Mesh(hookGeo, fur));
  const edgeGeo = S.taper(0.235, 0.011, { r1: 0.002, curve: 1.2, radial: 5, rings: 7, sx: 0.8 });
  edgeGeo.rotateX(-Math.PI / 2);
  edgeGeo.translate(0, 0.016, 0.005);
  const edge = new THREE.Mesh(S.paint(edgeGeo, 0xffffff), glowMat);
  edge.name = 'hookEdge';
  hook.add(edge);
  const hookGlow = S.glow(0x9a70ff, 0.26, 0.4);
  hookGlow.position.set(0, 0.09, -0.13);
  hook.add(hookGlow);
  kit.at(tail.tipAnchor, hook, 0, 0, 0.01);

  const spark = kit.heartspark(0.026, pal.eye, { seed: 161 });
  const sp = S.surface(torso, S.dirYP(0, -0.15), { from: [0, 0, 0.12], inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.3, 0.36));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, hook],
      fx: [spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.85,
      blinkEvery: 3.6,
    },
  };
}
