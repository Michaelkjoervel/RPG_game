// =============================================================================
// DAPPLYN — Bloom, stage 1 uncommon (Whisperwood).
// "Fawn dappled with living light-spots that drift like sun through leaves.
// Gentle." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized): a chibi fawn — a round honey-brown body on
// slender tapered legs with little dark hooves, a big gentle head with a
// cream muzzle and big dark eyes, soft leaf-shaped ears and two tiny budding
// sprouts. Its coat carries classic cream fawn spots, and over them drift
// the signature LIVING sun-flecks: small glowing dapples that glide along
// the flanks on looping paths baked onto the skin at build time (no per-frame
// raycasts or allocation), brightening and fading like light through leaves.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const FAWN_LO = 0x7a5232, FAWN = 0x9a6f45, FAWN_HI = 0xc99c68, CREAM = 0xf4e6cc, HOOF = 0x3a2a1e, FLECK = 0xfff0b8;

// Sun-flecks gliding over a surface: each follows a closed loop of points
// precomputed ON the skin; update() only lerps between stored numbers.
function sunFlecks(bodyGeo, material, loops) {
  const group = new THREE.Group(); group.name = 'sunFlecks';
  const items = loops.map((loop, i) => {
    const pts = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const yaw = loop.yaw + Math.cos(a) * loop.ry, pitch = loop.pitch + Math.sin(a) * loop.rp;
      pts.push(...S.surface(bodyGeo, S.dirYP(yaw, pitch), { from: [0, 0, loop.z], inset: -0.003 }));
    }
    const mesh = new THREE.Mesh(S.ball(loop.r, { sy: 1, sz: 0.35, radial: 10, rings: 6 }), material.clone());
    mesh.name = 'fleck';
    // lie flat on the skin: face the loop's outward direction (small loops)
    const n = new THREE.Vector3(...S.dirYP(loop.yaw, loop.pitch));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    group.add(mesh);
    return { mesh, pts, sp: 0.18 + (i % 3) * 0.05, ph: i * 1.7 };
  });
  let t = 0;
  function update(dt) {
    t += dt;
    for (const it of items) {
      const f = ((t * it.sp + it.ph) % 1 + 1) % 1 * 8;
      const k0 = Math.floor(f) % 8, k1 = (k0 + 1) % 8, u = f - Math.floor(f);
      const p = it.pts;
      it.mesh.position.set(
        p[k0 * 3] + (p[k1 * 3] - p[k0 * 3]) * u,
        p[k0 * 3 + 1] + (p[k1 * 3 + 1] - p[k0 * 3 + 1]) * u,
        p[k0 * 3 + 2] + (p[k1 * 3 + 2] - p[k0 * 3 + 2]) * u,
      );
      it.mesh.material.opacity = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.3 + it.ph * 2));
    }
  }
  update(0);
  return { group, update };
}

export function build_dapplyn(kit = kitDefault) {
  const pal = kit.palette(['bloom']);
  const fur = S.vcMat(kit, { rough: 0.68 });
  const fleckMat = kit.mat(FLECK, { unlit: true, transparent: true, opacity: 0.8 });

  const root = new THREE.Group();

  // --- Body: a round, short fawn body with a cream belly and spots. -------
  const bodyGeo = S.spindle({
    len: 0.4, r: 0.13, sx: 0.92, sy: 1.0, p: 0.95, radial: 20, rings: 14, belly: 0.12,
    profile: (t) => 0.88 + 0.1 * S.bump(t, 0.3, 0.3) + 0.08 * S.bump(t, 0.7, 0.3),
  });
  S.paint(bodyGeo, { from: FAWN_LO, to: FAWN_HI, axis: 'y', noise: 0.012, seed: 140 });
  S.overlay(bodyGeo, CREAM, (x, y, z) => S.sstep(-0.04, -0.11, y));
  const spotDirs = [[1.1, 0.5, 0.1], [1.25, 0.3, -0.05], [0.95, 0.65, -0.12], [1.15, 0.45, -0.16], [0.7, 0.85, 0.06],
    [-1.1, 0.5, 0.08], [-1.2, 0.35, -0.08], [-0.9, 0.65, -0.14], [-0.7, 0.85, 0.0], [0.2, 1.2, -0.1], [-0.25, 1.15, 0.04]];
  for (const [yaw, pitch, z] of spotDirs) S.blush(bodyGeo, S.surface(bodyGeo, S.dirYP(yaw, pitch), { from: [0, 0, z] }), 0.024, CREAM, 0.95);
  const tailGeo = S.puff(0.038, { count: 4, spread: 0.5, seed: 141, sy: 1.2 });
  S.pose(tailGeo, [0, 0.07, -0.2], [0.6, 0, 0]);
  S.paint(tailGeo, { from: FAWN, to: CREAM, axis: 'y' });
  const body = S.bake([bodyGeo, tailGeo], fur, 'body');
  root.add(body);
  body.position.y = 0.33;

  const flecks = sunFlecks(bodyGeo, fleckMat, [
    { yaw: 1.2, pitch: 0.35, ry: 0.25, rp: 0.2, z: 0.05, r: 0.018 },
    { yaw: 1.05, pitch: 0.6, ry: 0.2, rp: 0.15, z: -0.1, r: 0.014 },
    { yaw: -1.2, pitch: 0.35, ry: 0.25, rp: 0.2, z: -0.02, r: 0.018 },
    { yaw: -1.0, pitch: 0.6, ry: 0.2, rp: 0.15, z: 0.1, r: 0.014 },
    { yaw: 0.0, pitch: 1.2, ry: 0.4, rp: 0.12, z: -0.05, r: 0.016 },
  ]);
  body.add(flecks.group);

  // --- Head: big and gentle, cream muzzle, leaf ears, budding sprouts. -----
  const headGeo = S.spindle({ len: 0.2, r: 0.095, sx: 1.02, sy: 0.94, p: 1, radial: 20, rings: 14, profile: (t) => 0.92 + 0.1 * S.bump(t, 0.4, 0.45) });
  S.paint(headGeo, { from: FAWN_LO, to: FAWN_HI, axis: 'y', noise: 0.01, seed: 141 });
  const muzzle = S.spindle({ len: 0.1, r: 0.045, sx: 1.0, sy: 0.85, p: 1, pNose: 1.2, radial: 12, rings: 8, profile: (t) => 1 - 0.3 * t });
  const mz = S.surface(headGeo, S.dirYP(0, -0.3), { inset: 0.035 });
  S.pose(muzzle, [mz[0], mz[1], mz[2] + 0.02], [0.15, 0, 0]);
  S.paint(muzzle, CREAM);
  const nose = S.ball(0.014, { sx: 1.3, sy: 0.85, radial: 8, rings: 5 });
  S.pose(nose, S.surface(muzzle, [0, 0.3, 1], { from: [mz[0], mz[1], mz[2] + 0.02], inset: 0.005 }));
  S.paint(nose, 0x3a2a1c);
  const buds = [1, -1].map((s) => {
    const stem = S.taper(0.035, 0.008, { r1: 0.004, curve: 0.3, radial: 6, rings: 4 });
    S.paint(stem, 0x6a8a3a);
    const leaf = S.spindle({ len: 0.035, r: 0.011, sx: 1, sy: 0.3, radial: 8, rings: 5, pNose: 1.4 });
    leaf.translate(0, 0, 0.018);
    S.paint(leaf, { from: 0x5aa048, to: 0x9ad870, axis: 'z' });
    S.pose(leaf, [0, 0.034, 0.01], [-0.6, s * 0.9, 0]);
    const g = S.merge([stem, leaf]);
    return S.pose(g, S.surface(headGeo, S.dirYP(s * 0.35, 1.05), { inset: 0.005 }), [-0.2, 0, -s * 0.35]);
  });
  const head = S.bake([headGeo, muzzle, nose, ...buds], fur, 'head');
  kit.at(body, head, 0, 0.14, 0.2, { rz: -0.12, rx: 0.05 });

  const eyeOpts = { irisColor: 0x2a1a10, skinColor: 0x9a6f45, glintSize: 0.018 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.044, 0.5, 0.12, eyeOpts, { sink: 0.42, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.044, -0.5, 0.12, eyeOpts, { sink: 0.42, front: 0.55 });

  // soft leaf-shaped ears (accents)
  const mkEar = () => new THREE.Mesh(S.ear(0.11, 0.07, { color: FAWN, inner: 0xe8c8a8, tip: 1.1, cup: 0.5, depth: 0.3 }), fur);
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.8, 0.55), { inset: 0.01 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.01, { rz: -1.0, ry: 0.4 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.01, { rz: 1.2, ry: -0.4, rx: 0.1 });

  // --- Slender tapered legs with little dark hooves. -----------------------
  const legDefs = [[0.07, -0.07, 0.13, -0.05], [-0.07, -0.07, 0.13, -0.05], [0.07, -0.06, -0.13, 0.3], [-0.07, -0.06, -0.13, 0.3]];
  const legs = legDefs.map(([x, y, z, bend]) => {
    const l = S.softLeg(0.33 + y, fur, { thighR: bend > 0 ? 0.05 : 0.042, shinR: 0.022, kneeR: 0.027, ankleR: 0.019, pawR: 0.024, pawLen: 1.2, pawH: 0.026, toes: 0, bend, split: 0.5, bulge: 0.3, color: FAWN, shinColor: FAWN_HI, pawColor: HOOF, radial: 8 });
    kit.at(body, l, x, y, z);
    return l;
  });

  const spark = kit.heartspark(0.026, pal.eye, { seed: 141 });
  const sp = S.surface(bodyGeo, S.dirYP(0, -0.05), { inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.26, 0.36));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR],
      fx: [flecks, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'calm',
      locomotion: 'quad',
      breathAmp: 0.85,
      blinkEvery: 3.6,
    },
  };
}
