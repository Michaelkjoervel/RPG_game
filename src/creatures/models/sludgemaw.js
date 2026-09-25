// =============================================================================
// SLUDGEMAW — Venom/Terra, stage 2 (Oozel awakens at L24).
// "Bulky tar-slime with stalactite teeth. Slow, inexorable." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). Oozel's puddle grown into a heavy, glossy
// mound of tar: one smooth slumped form with a flared puddle skirt, thick
// drips running down its flanks and an oily violet-green sheen on the crown
// where the light catches it. Oozel's mineral hat has become crust islands
// with little stalagmites riding the top. Two small venom-yellow eyes sit on
// low mounds under heavy tar brows. The signature: THE MAW — a wide dark
// mouth across the whole front with a venom glow deep inside, stalactite
// teeth hanging from a thick upper lip and a lower lip of stalagmites (the
// jaw part, so it can gape).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const TAR_LO = 0x100e0a, TAR = 0x2a2818, TAR_HI = 0x57553a, SHEEN = 0x6c5c86, CRUST_LO = 0x5a5040, CRUST_HI = 0x9a8e70, TOOTH = 0xe0d4a8, MAW = 0x0a0806;

// The mound: a lathe (bottom -> top, outward normals) with drips and lumps.
function moundGeo() {
  const pts = [[0.001, 0], [0.33, 0], [0.365, 0.018], [0.35, 0.05], [0.325, 0.12], [0.3, 0.22], [0.25, 0.33], [0.16, 0.42], [0.001, 0.46]];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 26);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const drips = [[0.9, 0.9], [2.2, 0.7], [3.5, 1.0], [4.6, 0.8], [5.6, 0.6]];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const a = Math.atan2(x, z);
    let k = 1 + 0.025 * Math.sin(a * 3 + y * 9) + 0.02 * Math.sin(a * 5 - y * 14);
    for (const [da, s] of drips) {
      const d = Math.atan2(Math.sin(a - da), Math.cos(a - da));
      k += 0.07 * s * Math.exp(-d * d * 60) * S.sstep(0.36, 0.1, y) * S.sstep(0.0, 0.05, y);
    }
    pos.setXYZ(i, x * k, y, z * k * 0.9);
  }
  S.smooth(g);
  return g;
}

export function build_sludgemaw(kit = kitDefault) {
  const pal = kit.palette(['venom', 'terra']);
  const tar = S.vcMat(kit, { rough: 0.2, metal: 0.1 });
  const glowMat = kit.mat(0x9ad838, { unlit: true });

  const root = new THREE.Group();

  // --- Body: the tar mound, the maw's upper half, crown sheen, eye mounds. -------
  const mound = moundGeo();
  S.paint(mound, { from: TAR_LO, to: TAR_HI, axis: 'y', exp: 0.8, noise: 0.02, seed: 66 });
  S.overlayN(mound, SHEEN, (nx, ny, nz) => S.sstep(0.55, 0.9, ny) * S.sstep(-0.2, 0.4, nz) * 0.55);
  const MY = 0.2; // maw centre height
  const mawAt = S.surface(mound, [0, 0, 1], { from: [0, MY, 0] });
  const maw = S.ball(0.17, { sx: 1.35, sy: 0.5, sz: 0.4, radial: 16, rings: 8 });
  S.paint(maw, MAW);
  maw.translate(mawAt[0], mawAt[1], mawAt[2] - 0.045);
  const upperLip = S.tubeAlong([[-0.2, MY + 0.02, mawAt[2] - 0.1], [-0.12, MY + 0.07, mawAt[2] - 0.02], [0, MY + 0.085, mawAt[2] + 0.012], [0.12, MY + 0.07, mawAt[2] - 0.02], [0.2, MY + 0.02, mawAt[2] - 0.1]], (t) => 0.024 + 0.01 * Math.sin(Math.PI * t), { radial: 8, tubular: 16 });
  S.paint(upperLip, { from: TAR, to: TAR_HI, axis: 'y' });
  const stalactites = [];
  for (let i = 0; i < 7; i++) {
    const u = i / 6 - 0.5;
    const len = 0.07 + 0.03 * Math.cos(u * Math.PI) - (i % 2) * 0.02;
    const g = S.taper(len, 0.018, { r1: 0.003, radial: 5, rings: 3, capSeg: 1 });
    g.rotateX(Math.PI);
    S.paint(g, { from: 0x8a7e58, to: TOOTH, axis: 'y', lo: -len * 0.5, hi: 0 });
    const x = u * 0.3;
    stalactites.push(S.pose(g, [x, MY + 0.07 - Math.abs(u) * 0.08, mawAt[2] - 0.005 - u * u * 0.3]));
  }
  const eyeMounds = [1, -1].map((sd) => {
    const g = S.ball(0.07, { sx: 1.1, sy: 0.75, radial: 10, rings: 7 });
    S.paint(g, { from: TAR, to: TAR_HI, axis: 'y' });
    return S.pose(g, S.surface(mound, S.dirYP(sd * 0.42, 0.55), { from: [0, 0.15, 0], inset: 0.02 }));
  });
  const brows = [1, -1].map((sd) => S.paint(S.groove(mound, [[sd * 0.22, 0.95], [sd * 0.42, 0.98], [sd * 0.62, 0.86]], { from: [0, 0.12, 0], radius: 0.018, lift: 0.02 }), TAR_LO));
  const body = S.bake([mound, maw, upperLip, ...stalactites, ...eyeMounds, ...brows], tar, 'body');
  root.add(body);
  const venomGlow = S.glow(0x9ad838, 0.3, 0.5);
  venomGlow.position.set(mawAt[0], mawAt[1] - 0.01, mawAt[2] - 0.02);
  body.add(venomGlow);
  const throat = new THREE.Mesh(S.ball(0.03, { sx: 1.5, sy: 0.6, radial: 8, rings: 5 }), glowMat);
  throat.name = 'venomThroat';
  throat.position.set(mawAt[0], mawAt[1] - 0.01, mawAt[2] - 0.03);
  body.add(throat);

  const eyeOpts = { irisColor: 0xd0e86a, pupilColor: 0x1a1c04, scleraColor: 0x141008, skinColor: 0x2a2818, glintSize: 0.016 };
  const eyes = eyeMounds.map((_, k) => {
    const sd = k === 0 ? 1 : -1;
    const at = S.surface(mound, S.dirYP(sd * 0.42, 0.55), { from: [0, 0.15, 0], inset: -0.02 });
    const e = S.eye(kit, 0.042, eyeOpts);
    e.position.set(at[0], at[1] + 0.012, at[2] + 0.02);
    e.rotation.set(-0.35, sd * 0.25, 0);
    body.add(e);
    return e;
  });

  // --- The lower jaw: a thick lip of stalagmites (it gapes on attack). --------------
  const jawPivot = [0, MY - 0.05, mawAt[2] - 0.14];
  const lower = S.tubeAlong([[-0.19, 0.0, 0.05], [-0.11, -0.035, 0.12], [0, -0.045, 0.155], [0.11, -0.035, 0.12], [0.19, 0.0, 0.05]], (t) => 0.026 + 0.008 * Math.sin(Math.PI * t), { radial: 8, tubular: 16 });
  S.paint(lower, { from: TAR_LO, to: TAR, axis: 'y' });
  const stalagmites = [];
  for (let i = 0; i < 6; i++) {
    const u = (i + 0.5) / 6 - 0.5;
    const len = 0.05 + 0.025 * Math.cos(u * Math.PI);
    const g = S.taper(len, 0.015, { r1: 0.003, radial: 5, rings: 3, capSeg: 1 });
    S.paint(g, { from: 0x8a7e58, to: TOOTH, axis: 'y', lo: 0, hi: len * 0.5 });
    stalagmites.push(S.pose(g, [u * 0.3, -0.02, 0.15 - u * u * 0.35]));
  }
  const jaw = S.bake([lower, ...stalagmites], tar, 'jaw');
  kit.at(body, jaw, jawPivot[0], jawPivot[1], jawPivot[2]);

  // --- Crust islands on the crown, with little stalagmites (accents). --------------
  const crust = [];
  for (const [yaw, pitch, r, seed] of [[0.4, 1.25, 0.12, 74], [-0.9, 1.05, 0.075, 75]]) {
    const g = S.pebble(r, { sx: 1.15, sy: 0.42, sz: 1.0, seed, noise: 0.14, radial: 12, rings: 8 });
    S.paint(g, { from: CRUST_LO, to: CRUST_HI, axis: 'y', noise: 0.03, seed });
    const parts = [g];
    for (let k = 0; k < (r > 0.1 ? 3 : 1); k++) {
      const sp = S.taper(0.07 - k * 0.015, 0.018, { r1: 0.003, radial: 5, rings: 3, capSeg: 1 });
      S.paint(sp, { from: CRUST_LO, to: 0xc8bc98, axis: 'y' });
      parts.push(S.pose(sp, [(k - 1) * r * 0.45, r * 0.3, (k % 2 ? -1 : 1) * r * 0.2], [0.15 * (k - 1), 0, -0.2 * (k - 1)]));
    }
    const m = new THREE.Mesh(S.merge(parts), tar);
    m.name = 'crust';
    const at = S.surface(mound, S.dirYP(yaw, pitch), { from: [0, 0.15, 0], inset: r * 0.25 });
    kit.at(body, m, at[0], at[1], at[2], { ry: yaw });
    crust.push(m);
  }

  const gooDrip = kit.mote(5, { color: 0x9ac838, size: 0.016, radius: 0.22, height: 0.12, speed: 0.2, seed: 68 });
  kit.at(body, gooDrip, 0, 0.26, 0.05);
  const spark = kit.heartspark(0.03, pal.eye, { seed: 69 });
  kit.at(body, spark, 0, 0.3, 0.12);

  root.add(kit.shadowDisc(0.4, 0.45));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      jaw,
      eyelids: eyes.map((e) => e.getObjectByName('eyelid')),
      accents: crust,
      fx: [gooDrip, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'hop',
      breathAmp: 1.1,
      blinkEvery: 4.4,
    },
  };
}
