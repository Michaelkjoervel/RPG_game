// =============================================================================
// FULMIN — Volt, stage 1 wild (Dawnmeadow & Brighthollow outskirts).
// "Static-furred fox kit, sparks between ear tips. Zoomies incarnate."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized): a chubby fox kit — round orange bean,
// cream chest and muzzle, dark socks, a huge fluffy tail curling up with a
// cream tip, big head with tall dark-tipped ears and static-fluffed cheek and
// crown tufts standing on end. The signature: a live zigzag spark arcing
// between the ear tips (a 3D bolt that reads from every angle, flickering).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const FOX_LO = 0xa8451c, FOX = 0xd8672c, FOX_HI = 0xf29a50, CREAM = 0xf6ead0, SOCK = 0x3a2418, TIP = 0x2e1c14;

// A jagged 3D bolt between two points, flickering (a { group, update } fx).
function sparkBolt(a, b, material, glowColor, { jags = 6, amp = 0.02, radius = 0.0085, seed = 1 } = {}) {
  const group = new THREE.Group(); group.name = 'sparkArc';
  const pts = [];
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  for (let i = 0; i <= jags; i++) {
    const t = i / jags;
    const p = A.clone().lerp(B, t);
    if (i > 0 && i < jags) { p.y += (i % 2 ? 1 : -1) * amp * (1 - Math.abs(t - 0.5)); p.z += Math.sin(i * 2.3 + seed) * amp * 0.6; }
    p.y += Math.sin(Math.PI * t) * amp * 1.6; // bows upward
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
  const geo = new THREE.TubeGeometry(curve, jags * 4, radius, 4, false);
  geo.deleteAttribute('uv');
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'sparkMesh';
  group.add(mesh);
  const halo = S.glow(glowColor, A.distanceTo(B) * 1.3, 0.6);
  halo.position.copy(A).lerp(B, 0.5);
  group.add(halo);
  let t = seed;
  function update(dt) {
    t += dt;
    const on = Math.sin(t * 17.3) + Math.sin(t * 29.1 + 1.3) > -0.6;
    mesh.visible = on;
    mesh.scale.y = 0.6 + 0.8 * Math.abs(Math.sin(t * 41));
    halo.material.opacity = on ? 0.35 + 0.25 * Math.abs(Math.sin(t * 23)) : 0.12;
  }
  return { group, update };
}

export function build_fulmin(kit = kitDefault) {
  const pal = kit.palette(['volt']);
  const fur = S.vcMat(kit, { rough: 0.66 });
  const boltMat = kit.mat(0xfff2a0, { unlit: true });

  const root = new THREE.Group();

  // --- Body: a chubby fox-kit bean. ----------------------------------------
  const bodyGeo = S.spindle({ len: 0.3, r: 0.13, sx: 0.96, sy: 0.95, p: 0.95, radial: 20, rings: 14, belly: 0.18, profile: (t) => 0.9 + 0.12 * S.bump(t, 0.6, 0.45) });
  S.paint(bodyGeo, { from: FOX_LO, to: FOX_HI, axis: 'y', noise: 0.012, seed: 110 });
  S.overlay(bodyGeo, CREAM, (x, y, z) => S.sstep(0.0, 0.12, z - y * 0.5 - 0.02) * S.sstep(0.06, -0.02, y));
  // static-fluffed back tufts
  const back = [];
  for (let i = 0; i < 3; i++) {
    const g = S.taper(0.05, 0.018, { r1: 0.003, curve: -0.3, radial: 6, rings: 5, sx: 1.4, sz: 0.6 });
    S.paint(g, { from: FOX, to: FOX_HI, axis: 'y' });
    back.push(S.pose(g, S.surface(bodyGeo, [0, 1, 0], { from: [0, 0, 0.06 - i * 0.06], inset: 0.012 }), [-0.5, 0, (i - 1) * 0.3]));
  }
  const body = S.bake([bodyGeo, ...back], fur, 'body');
  root.add(body);
  body.position.y = 0.15;

  // --- Head: big and round, pointed cream muzzle, static cheek tufts. -------
  const headGeo = S.spindle({ len: 0.19, r: 0.095, sx: 1.08, sy: 0.92, p: 1, radial: 20, rings: 14, profile: (t) => 0.92 + 0.1 * S.bump(t, 0.4, 0.45) });
  S.paint(headGeo, { from: FOX_LO, to: FOX_HI, axis: 'y', noise: 0.01, seed: 111 });
  const muzzle = S.spindle({ len: 0.09, r: 0.036, sx: 1.05, sy: 0.85, p: 0.95, pNose: 1.2, radial: 12, rings: 8, profile: (t) => 1 - 0.45 * t });
  const mz = S.surface(headGeo, S.dirYP(0, -0.25), { inset: 0.03 });
  S.pose(muzzle, [mz[0], mz[1], mz[2] + 0.02], [0.12, 0, 0]);
  S.paint(muzzle, CREAM);
  const nose = S.ball(0.012, { sx: 1.3, sy: 0.85, radial: 8, rings: 5 });
  S.pose(nose, S.surface(muzzle, [0, 0.35, 1], { from: [mz[0], mz[1], mz[2] + 0.02], inset: 0.005 }));
  S.paint(nose, 0x2a1c14);
  S.overlay(headGeo, CREAM, (x, y, z) => S.sstep(0.03, 0.07, z) * S.sstep(0.0, -0.05, y));
  const cheeks = [];
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) {
    const g = S.taper(0.045 - i * 0.006, 0.016, { r1: 0.003, curve: 0.2, radial: 6, rings: 4, sx: 1.4, sz: 0.6 });
    S.paint(g, { from: FOX_HI, to: CREAM, axis: 'y' });
    cheeks.push(S.pose(g, S.surface(headGeo, S.dirYP(s * 1.25, -0.3 + i * 0.22), { inset: 0.012 }), [0, 0, -s * (1.6 - i * 0.25)]));
  }
  const crown = [];
  for (let i = 0; i < 3; i++) {
    const g = S.taper(0.05, 0.016, { r1: 0.003, curve: 0.35 - i * 0.2, radial: 6, rings: 5, sx: 1.4, sz: 0.6 });
    S.paint(g, { from: FOX, to: FOX_HI, axis: 'y' });
    crown.push(S.pose(g, S.surface(headGeo, S.dirYP((i - 1) * 0.3, 1.2), { inset: 0.01 }), [-0.2, 0, (i - 1) * -0.45]));
  }
  const head = S.bake([headGeo, muzzle, nose, ...cheeks, ...crown], fur, 'head');
  kit.at(body, head, 0, 0.1, 0.15, { rz: 0.1, rx: -0.06 });

  const eyeOpts = { irisColor: 0x2a1c08, skinColor: 0xd8672c, glintSize: 0.016 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.04, 0.46, 0.14, eyeOpts, { sink: 0.42, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.04, -0.46, 0.14, eyeOpts, { sink: 0.42, front: 0.55 });

  // --- Tall dark-tipped ears; the spark arcs between their tips. -----------
  const mkEar = () => {
    const g = S.ear(0.11, 0.075, { color: FOX, inner: CREAM, tip: 1.4, cup: 0.5, depth: 0.38 });
    S.overlay(g, TIP, (x, y, z) => S.sstep(0.07, 0.1, y));
    return new THREE.Mesh(g, fur);
  };
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.55, 0.85), { inset: 0.012 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.01, { rz: -0.35, ry: 0.3, rx: -0.1 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.01, { rz: 0.35, ry: -0.3, rx: -0.1 });
  // ear tips in head space (ear local tip (0, 0.105, 0) through the ear rotation)
  const tipOf = (ear) => { ear.updateMatrix(); return new THREE.Vector3(0, 0.105, 0).applyMatrix4(ear.matrix).toArray(); };
  const spark1 = sparkBolt(tipOf(earL), tipOf(earR), boltMat, pal.primary, { seed: 5 });
  head.add(spark1.group);

  // --- Stubby legs with dark socks. -----------------------------------------
  const legs = [[0.07, -0.07, 0.09], [-0.07, -0.07, 0.09], [0.07, -0.06, -0.08], [-0.07, -0.06, -0.08]].map(([x, y, z]) => {
    const l = S.softLeg(0.09, fur, { stubby: true, thighR: 0.035, kneeR: 0.028, pawR: 0.031, pawLen: 1.3, toes: 3, color: FOX, shinColor: SOCK, pawColor: SOCK, radial: 8 });
    kit.at(body, l, x, y, z, { rz: Math.sign(x) * 0.08 });
    return l;
  });

  // --- The big fluffy tail, curling up, cream tip. --------------------------
  const tail = S.softTail(5, fur, {
    segLen: 0.07, startR: 0.05, endR: 0.06, curl: 0.3, rootPitch: 0.4, taperExp: 0.6,
    color: (t) => (t < 0.72 ? S.mixHex(FOX, FOX_HI, t) : S.mixHex(FOX_HI, CREAM, S.sstep(0.72, 0.85, t))),
  });
  kit.at(body, tail, 0, 0.03, -0.14);
  const tipPuff = new THREE.Mesh(S.paint(S.puff(0.055, { count: 4, spread: 0.5, seed: 112, sy: 1.1 }), CREAM), fur);
  tipPuff.name = 'tailTip';
  kit.at(tail.tipAnchor, tipPuff, 0, 0.0, -0.01);

  const zap = kit.heartspark(0.026, pal.eye, { seed: 111 });
  const zp = S.surface(bodyGeo, S.dirYP(0, -0.1), { inset: 0.01 });
  kit.at(body, zap, zp[0], zp[1], zp[2]);

  root.add(kit.shadowDisc(0.2, 0.36));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR],
      fx: [spark1, zap, S.variantFx(root)],
    },
    hints: {
      personality: 'eager',
      locomotion: 'quad',
      breathAmp: 1.3,
      blinkEvery: 1.7,
    },
  };
}
