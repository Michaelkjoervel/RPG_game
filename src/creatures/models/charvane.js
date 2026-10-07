// =============================================================================
// CHARVANE — Ember, stage 2 (Kindlet awakens at L16).
// "Lean coal-furred hound, magma cracks along spine, smoke wisps when it
// huffs. Loyal, proud." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized), v4 round. The pup's round soot body grows
// into a young fire WOLF with presence: a deep, full chest and a thick neck
// carried high under a big EMBER RUFF (Kindlet's fire belly grown into a
// mane of coal fur whose tips glow ember-orange, halfway to Pyrelith's molten
// mane), a broad young-wolf head with big amber eyes and ember-tipped ears.
// Behind the chest the body TAPERS like a wolf's, not a bear's: the loin
// tucks up, the croup is narrower than the shoulders and slopes to the tail.
// The battle camera sits behind-left of the player's creature, so the rear
// is designed too: flattened hams (not balls) with ember-tipped britches fur,
// hind legs with a real dog-leg (stifle forward, hock back, upright
// pastern), magma seams that run down the spine and on over both haunches
// and hams, and a bushy smoke-brown brush of a tail lifting into a live
// flame. The coat is warm charcoal-brown on top (form reads under the rim
// light), coal on the underside and socks. Static pieces per node are one
// vertex-coloured mesh.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const COAL_LO = 0x221916, COAL = 0x3b2d27, COAL_HI = 0x6c5547, SMOKE = 0x84695a, CRUST = 0x2a1b15,
  FLANK = 0x7a6152, SADDLE = 0x4f3e35,
  EMBER_LO = 0x7a2e16, EMBER = 0xc4521e, EMBER_HI = 0xf08a3a, SOCK = 0x1c1412, INNER = 0xb0502a;

// THE EMBER RUFF as ONE soft form: a sphere round the neck base whose
// equator is pushed out into fluffy tufts that sweep back down the neck (a
// lion's / fire-fox's ruff), longest at the breast and sides. Coal at the
// root, ember-rust over the breast, glowing ember at every tuft tip. Local
// +Y = the neck axis, +Z = the breast; pose it onto the neck.
function ruffGeo() {
  const R = 0.135;
  const g = S.ball(R, { radial: 30, rings: 14 });
  const pos = g.attributes.position;
  const amp = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const rr = Math.hypot(x, z);
    if (rr < 1e-5) continue;
    const a = Math.atan2(x, z), h = y / R;
    const band = Math.exp(-Math.pow((h + 0.1) / 0.7, 2));
    const tuft = Math.pow(Math.max(0, Math.cos(a * 7)), 1.5);
    const k = 0.085 * tuft * band * (0.78 + 0.22 * Math.cos(a)) + 0.016 * band;
    amp[i] = k;
    pos.setXYZ(i, x * 1.28 + (x / rr) * k, y - k * 1.15, z * 0.98 + (z / rr) * k);
  }
  S.smooth(g);
  S.paint(g, 0xffffff);
  const col = g.attributes.color, C = new THREE.Color(), E1 = new THREE.Color(EMBER_LO), E2 = new THREE.Color(EMBER), E3 = new THREE.Color(EMBER_HI);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    C.setHex(S.mixHex(COAL, COAL_HI, S.clamp01(y / R * 0.5 + 0.5)));
    const front = S.sstep(-0.2, 0.7, z / Math.max(1e-5, Math.hypot(x, z)));
    C.lerp(E1, front * S.sstep(0.6, -0.4, y / R) * 0.9);
    const tip = S.clamp01(amp[i] / 0.075);
    C.lerp(E2, S.sstep(0.35, 0.8, tip) * 0.85);
    C.lerp(E3, S.sstep(0.8, 1.0, tip) * 0.6);
    col.setXYZ(i, C.r, C.g, C.b);
  }
  return g;
}

// A bent limb swept through joint nodes [y, z, r, back] (top -> bottom, in
// the leg's YZ plane, x = 0): one mitred ring per joint, so a hock or a
// stifle stays a crisp, readable angle instead of a pinch or a ball, `sub`
// extra rings per span, and round caps at both ends. `sx` flattens it
// sideways (a ham, a forearm); `back` (default 1) swells the rear half of
// that ring (the point of the hock, the round of the buttock). Exactly
// `radial` sides (no DETAIL scaling), indexed, smooth normals, no uv.
function sweep(nodes, { radial = 8, sub = 0, capTop = 2, capBot = 2, sx = 1 } = {}) {
  const N = nodes.length;
  const seg = [];
  for (let i = 0; i < N - 1; i++) {
    const dy = nodes[i + 1][0] - nodes[i][0], dz = nodes[i + 1][1] - nodes[i][1];
    const l = Math.hypot(dy, dz) || 1;
    seg.push([dy / l, dz / l]);
  }
  const rings = []; // [cy, cz, ty, tz, rx, rn, back]
  const node = (i, t, miter) => rings.push([nodes[i][0], nodes[i][1], t[0], t[1], nodes[i][2] * sx, nodes[i][2] * miter, nodes[i][3] ?? 1]);
  // top cap (pole excluded)
  const T0 = seg[0], n0 = nodes[0];
  for (let i = 1; i < capTop; i++) {
    const th = (Math.PI / 2) * (i / capTop), r = n0[2] * Math.sin(th);
    rings.push([n0[0] - T0[0] * n0[2] * Math.cos(th), n0[1] - T0[1] * n0[2] * Math.cos(th), T0[0], T0[1], r * sx, r, n0[3] ?? 1]);
  }
  for (let i = 0; i < N; i++) {
    if (i === 0) node(0, seg[0], 1);
    else if (i === N - 1) node(i, seg[N - 2], 1);
    else {
      const a = seg[i - 1], b = seg[i];
      let ty = a[0] + b[0], tz = a[1] + b[1];
      const l = Math.hypot(ty, tz) || 1; ty /= l; tz /= l;
      node(i, [ty, tz], 1 / Math.max(0.5, ty * b[0] + tz * b[1]));
    }
    if (i < N - 1) for (let k = 1; k <= sub; k++) {
      const u = k / (sub + 1), A = nodes[i], B = nodes[i + 1];
      const r = S.lerp(A[2], B[2], u);
      rings.push([S.lerp(A[0], B[0], u), S.lerp(A[1], B[1], u), seg[i][0], seg[i][1], r * sx, r, S.lerp(A[3] ?? 1, B[3] ?? 1, u)]);
    }
  }
  const TL = seg[N - 2], nL = nodes[N - 1];
  for (let i = capBot - 1; i >= 1; i--) {
    const th = (Math.PI / 2) * (i / capBot), r = nL[2] * Math.sin(th);
    rings.push([nL[0] + TL[0] * nL[2] * Math.cos(th), nL[1] + TL[1] * nL[2] * Math.cos(th), TL[0], TL[1], r * sx, r, nL[3] ?? 1]);
  }
  const M = radial, pos = [], idx = [];
  pos.push(0, n0[0] - T0[0] * n0[2], n0[1] - T0[1] * n0[2]); // top pole
  for (const [cy, cz, ty, tz, rx, rn, bk] of rings) {
    // in-plane normal of tangent (ty, tz) = (tz, -ty): forward for a leg
    for (let k = 0; k < M; k++) {
      const ph = (k / M) * Math.PI * 2, c = Math.cos(ph);
      const n = rn * c * (c < 0 ? bk : 1);
      pos.push(rx * Math.sin(ph), cy + tz * n, cz - ty * n);
    }
  }
  const bot = pos.length / 3;
  pos.push(0, nL[0] + TL[0] * nL[2], nL[1] + TL[1] * nL[2]);
  const R = rings.length, at = (r, k) => 1 + r * M + (k % M);
  for (let k = 0; k < M; k++) idx.push(0, at(0, k + 1), at(0, k));
  for (let r = 0; r < R - 1; r++) for (let k = 0; k < M; k++) {
    idx.push(at(r, k), at(r, k + 1), at(r + 1, k + 1), at(r, k), at(r + 1, k + 1), at(r + 1, k));
  }
  for (let k = 0; k < M; k++) idx.push(bot, at(R - 1, k), at(R - 1, k + 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // wind every face outward whatever the ring order: flip if the volume is negative
  let vol = 0;
  const P = g.attributes.position, A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    A.fromBufferAttribute(P, idx[i]); B.fromBufferAttribute(P, idx[i + 1]); C.fromBufferAttribute(P, idx[i + 2]);
    vol += A.dot(B.cross(C));
  }
  if (vol < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.setIndex(idx);
  return S.smooth(g);
}

// A soft fur tuft: a short curved leaf of fur (base buried at `at`), wide
// across and thin through, curling toward -Z of its own frame, aimed along
// `dir`. Coat colour at the root, `to` only on the last stretch (`exp`).
// ~30 triangles (a 5-sided sweep), so a fringe of them is affordable.
function tuft(at, dir, len, w, from, to, { curl = 0.35, flat = 1.5, exp = 1.6 } = {}) {
  const g = sweep([[0, 0, w], [-len * 0.45, curl * len * 0.22, w * 0.78], [-len, curl * len, w * 0.1]], { radial: 5, capTop: 1, capBot: 1, sx: flat });
  g.rotateX(Math.PI); // grow +Y, curl toward -Z
  S.paint(g, { from, to, axis: 'y', lo: 0, hi: len, exp, noise: 0.015 });
  S.aim(g, dir);
  return S.pose(g, at);
}

// A glowing seam tube through points (any space), unlit, open-ended.
function seamTube(pts, radius, seg = 8) {
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))), seg, radius, 3, false);
  g.deleteAttribute('uv');
  return S.paint(S.smooth(g), 0xffffff);
}

export function build_charvane(kit = kitDefault) {
  const pal = kit.palette(['ember']);
  const fur = S.vcMat(kit, { rough: 0.66 });
  const magma = kit.mat(0xffa640, { unlit: true });

  const root = new THREE.Group();

  // --- Torso: deep full chest, tucked-up loin, narrower sloping croup. ----
  const torsoGeo = S.spindle({
    len: 0.56, r: 0.195, sx: 0.86, sy: 1.02, p: 0.92, pTail: 1.08, radial: 18, rings: 12,
    profile: (t) => 0.6 + 0.42 * S.bump(t, 0.72, 0.32),
    syAt: (t) => S.lerp(0.95 + 0.15 * S.bump(t, 0.4, 0.18), 1.0, S.sstep(0.5, 0.72, t)),
    belly: (t) => 0.05 + 0.4 * (1 - S.sstep(0.38, 0.62, t)),
    arch: (t) => -0.02 * (1 - S.sstep(0.05, 0.35, t)) + 0.02 * S.bump(t, 0.76, 0.2),
  });
  // wolf coat: coal underside, warm smoke-brown flanks, a darker SADDLE over
  // the back from the shoulders to the croup (its edge draws the body's turn
  // from behind), a narrow dark crust along the spine for the seams
  S.paint(torsoGeo, { from: COAL_LO, to: FLANK, axis: 'y', lo: -0.17, hi: 0.06, exp: 0.8, noise: 0.012, seed: 21 });
  S.overlay(torsoGeo, SADDLE, (x, y, z) => S.sstep(0.05, 0.12, y + 0.25 * Math.max(0, -z - 0.12)) * (1 - S.sstep(0.1, 0.2, z)) * 0.9);
  S.overlay(torsoGeo, CRUST, (x, y, z) => S.sstep(0.1, 0.16, y) * (1 - S.sstep(0.012, 0.045, Math.abs(x))) * 0.7);
  // ember underglow on the chest and belly, Kindlet's fire belly
  S.overlay(torsoGeo, EMBER_LO, (x, y, z) => S.sstep(-0.08, -0.17, y) * S.sstep(-0.05, 0.2, z) * 0.85);
  // Thick neck carried high (part of the torso mesh).
  const neckGeo = S.spindle({ len: 0.28, r: 0.125, sx: 1.0, sy: 1.08, p: 0.92, radial: 14, rings: 8, profile: (t) => 1.12 - 0.2 * t });
  S.pose(neckGeo, [0, 0.14, 0.27], [-0.85, 0, 0]);
  S.paint(neckGeo, { from: COAL_LO, to: COAL_HI, axis: 'y', noise: 0.012, seed: 22 });
  // THE EMBER RUFF round the neck base.
  const collar = ruffGeo();
  const RC = [0, 0.1, 0.26];
  S.pose(collar, RC, [0.72, 0, 0]); // local +Y -> up the neck, local +Z -> the breast
  // where the tail sets on, ringed by a fluffy collar of fur tufts
  const tr = S.surface(torsoGeo, [0, 0.45, -1], { from: [0, 0.03, -0.12], inset: 0.035 });
  const tailFluff = [[0.62, 0.4, 0.07], [-0.62, 0.4, 0.07], [0.0, 0.75, 0.06], [0.45, -0.25, 0.06], [-0.45, -0.25, 0.06]].map(([x, y, L]) => tuft(
    [tr[0] + x * 0.03, tr[1] + y * 0.03, tr[2] + 0.012], [x, y, -1], L, 0.03, FLANK, SMOKE, { curl: 0.3, flat: 1.4, exp: 1.5 }));
  const body = S.bake([torsoGeo, neckGeo, collar, ...tailFluff], fur, 'body');
  root.add(body);
  body.position.y = 0.39;

  // --- Magma seams: spine, shoulders, and on over both haunches. ----------
  const seams = [
    S.grooveTop(torsoGeo, [[0.0, 0.14], [0.012, 0.07], [-0.008, -0.01], [0.008, -0.09], [0.0, -0.17], [0.0, -0.235]], { radius: 0.015, lift: 0.001, seg: 14, radial: 3, caps: false }),
    S.grooveTop(torsoGeo, [[0.012, 0.07], [0.058, 0.05], [0.09, 0.025], [0.11, 0.01]], { radius: 0.009, lift: 0.001, seg: 7, radial: 3, caps: false }),
    S.grooveTop(torsoGeo, [[-0.008, -0.01], [-0.052, -0.03], [-0.085, -0.06]], { radius: 0.009, lift: 0.001, seg: 6, radial: 3, caps: false }),
  ];
  // haunch seams: fork off the spine over the croup and run down each haunch
  for (const sd of [1, -1]) {
    seams.push(S.groove(torsoGeo, [[sd * 0.25, 1.25], [sd * 0.9, 1.05], [sd * 1.25, 0.7], [sd * 1.4, 0.3]], { from: [0, -0.02, -0.15], radius: 0.01, lift: 0.001, seg: 9, radial: 3, caps: false }));
  }
  const seamMesh = new THREE.Mesh(S.merge(seams.map((g) => S.paint(g, 0xffffff))), magma);
  seamMesh.name = 'magmaSeams';
  body.add(seamMesh);
  const seamGlow = S.glow(0xff7a2a, 0.36, 0.35);
  seamGlow.position.set(0, 0.18, -0.08);
  seamGlow.scale.set(0.5, 0.2, 1);
  body.add(seamGlow);
  const embers = kit.mote(5, { color: 0xff9a3c, size: 0.016, radius: 0.16, height: 0.2, speed: 0.7, seed: 21 });
  kit.at(body, embers, 0, 0.2, -0.04);

  // --- Head: a broad young-wolf skull, short thick muzzle. -----------------
  const headGeo = S.spindle({
    len: 0.36, r: 0.145, sx: 1.04, sy: 1.0, pTail: 1.0, pNose: 1.15, radial: 18, rings: 12, belly: 0.1,
    profile: (t) => (t < 0.45 ? 1.0 : S.lerp(1.0, 0.6, S.sstep(0.45, 0.72, t))) - 0.12 * S.sstep(0.76, 1, t),
    syAt: (t) => S.lerp(0.92, 0.74, S.sstep(0.45, 0.72, t)),
    arch: (t) => -0.04 * S.sstep(0.4, 0.78, t),
  });
  S.paint(headGeo, { from: COAL_LO, to: COAL_HI, axis: 'y', noise: 0.01, seed: 25 });
  S.overlay(headGeo, 0x6a4a3c, (x, y, z) => S.sstep(-0.05, -0.09, y) * S.sstep(0.0, 0.07, z) * 0.9); // warm jaw
  S.overlay(headGeo, 0x261c19, (x, y, z) => S.sstep(0.1, 0.15, z) * 0.6);                             // dark muzzle tip
  const noseGeo = S.ball(0.03, { sx: 1.35, sy: 0.85, radial: 8, rings: 6 });
  S.pose(noseGeo, S.surface(headGeo, [0, 0.25, 1], { from: [0, -0.04, 0.05], inset: 0.012 }));
  S.paint(noseGeo, 0x120d0c);
  const SK = [0, 0.0, -0.06];
  // Flared cheek fur, ember-tipped, sweeping back from the jaw.
  const cheeks = [];
  for (const sd of [1, -1]) for (let i = 0; i < 3; i++) {
    const at = S.surface(headGeo, [sd, -0.35 + i * 0.25, -0.2], { from: [0, -0.02, -0.03 - i * 0.03], inset: 0.012 });
    cheeks.push(tuft(at, [sd * 0.85, -0.3 + i * 0.22, -1], 0.085 - i * 0.01, 0.028, COAL_HI, i === 0 ? EMBER : 0x8a5a44, { exp: 1 }));
  }
  const brows = [1, -1].map((sd) => S.paint(S.groove(headGeo, [[sd * 0.25, 0.5], [sd * 0.45, 0.53], [sd * 0.65, 0.42]], { from: SK, radius: 0.008, lift: 0.001, seg: 8, radial: 3, caps: false }), 0x140e0d));
  const mouth = S.paint(S.groove(headGeo, [[-0.5, -0.32], [-0.25, -0.42], [0, -0.44], [0.25, -0.42], [0.5, -0.32]], { from: [0, -0.01, 0.06], radius: 0.0055, lift: -0.001, seg: 10, radial: 3, caps: false }), 0x120d0c);
  const head = S.bake([headGeo, noseGeo, ...cheeks, ...brows, mouth], fur, 'head');
  kit.at(body, head, 0, 0.35, 0.49, { rx: 0.04, ry: 0.1 });

  const eyeOpts = { irisColor: 0xe08a2a, pupilColor: 0x1a0e08, skinColor: 0x3a2d28, glintSize: 0.014 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.044, 0.58, 0.2, eyeOpts, { sink: 0.45, front: 0.66, from: SK });
  const eyeR = S.seatEye(kit, head, headGeo, 0.044, -0.58, 0.2, eyeOpts, { sink: 0.45, front: 0.66, from: SK });

  // Fangs peeking under the muzzle — a proud young wolf shows them, a little.
  const fangMat = S.smoothMat(kit, 0xefe8dc, { rough: 0.4 });
  for (const s of [1, -1]) {
    const f = new THREE.Mesh(S.taper(0.026, 0.008, { r1: 0.0018, radial: 6, rings: 5, capSeg: 1 }), fangMat);
    f.rotation.set(Math.PI - 0.15, 0, -s * 0.12);
    const p = S.surface(headGeo, [s * 0.6, -0.8, 0.25], { from: [0, -0.05, 0.1], inset: 0.004 });
    f.position.set(p[0], p[1] + 0.006, p[2]);
    head.add(f);
  }

  // Tall alert ears, ember-lined and ember-TIPPED (they read from behind too).
  const mkEar = () => {
    const g = S.ear(0.155, 0.11, { color: COAL_HI, inner: INNER, tip: 1.7, cup: 0.45, depth: 0.4, radial: 8, rings: 7 });
    S.overlay(g, EMBER, (x, y) => S.sstep(0.09, 0.15, y) * 0.9);
    return new THREE.Mesh(g, fur);
  };
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.5, 1.0), { from: SK, inset: 0.018 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.015, { rz: -0.28, ry: 0.5, rx: -0.15 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.015, { rz: 0.28, ry: -0.5, rx: -0.15 });

  // Smoke wisps from the nostrils when it huffs.
  const smoke = kit.mote(3, { color: 0x8a8478, size: 0.014, radius: 0.035, height: 0.1, speed: 0.6, seed: 7 });
  kit.at(head, smoke, 0, -0.03, 0.2);

  // --- Legs (contract { hip, knee, foot }) ---------------------------------
  // Paint a leg piece by height: coat at the top fading to coal socks.
  const legPaint = (g, yTop, yBot, top, bot) => S.paint(g, { from: bot, to: top, axis: 'y', lo: yBot, hi: yTop, noise: 0.012, seed: 31 });
  const mkPaw = (r, at) => {
    const pg = S.paw(r, { len: 1.25, h: r * 0.78, toes: 3, radial: 9, rings: 5 });
    S.paint(pg, SOCK);
    return pg.translate(at[0], at[1], at[2]);
  };

  // FORELEGS: shoulder -> elbow (tucked back under the chest), straight
  // forearm, wrist, and a short forward-sloping pastern into the paw.
  const foreLeg = (len) => {
    const hip = new THREE.Group(); hip.name = 'legHip';
    const knee = new THREE.Group(); knee.name = 'legKnee';
    hip.add(knee);
    const pr = 0.056, ankle = -(len - pr * 0.78);
    const E = [-0.12, -0.022];
    const up = sweep([[0, 0, 0.08], [-0.06, -0.012, 0.064], [E[0], E[1], 0.049]], { radial: 8, sx: 0.82, capTop: 2, capBot: 2 });
    legPaint(up, 0.02, E[0] - 0.04, COAL_HI, COAL);
    const thigh = new THREE.Mesh(up, fur); thigh.name = 'legThigh';
    hip.add(thigh);
    knee.position.set(0, E[0], E[1]);
    const ay = ankle - E[0];
    const lo = sweep([[0, 0, 0.049], [-0.045, 0.002, 0.044], [ay + 0.034, 0.012, 0.032], [ay, 0.026, 0.03]], { radial: 8, sx: 0.92, capTop: 2, capBot: 2 });
    legPaint(lo, 0.02, ay, COAL, SOCK);
    const foot = new THREE.Mesh(S.merge([lo, mkPaw(pr, [0, ay, 0.026])]), fur); foot.name = 'legFoot';
    knee.add(foot);
    return { group: hip, hip, knee, foot };
  };

  // HIND LEGS — the dog-leg: a broad flattened HAM (front edge to the stifle,
  // round of the buttock behind), stifle forward, gaskin sloping BACK to a
  // pointed hock, upright pastern to the paw. Ember-tipped britches fur at
  // the back of the ham and a magma seam down its outside.
  const hindLeg = (len, sd) => {
    const hip = new THREE.Group(); hip.name = 'legHip';
    const knee = new THREE.Group(); knee.name = 'legKnee';
    hip.add(knee);
    const pr = 0.056, ankle = -(len - pr * 0.78);
    const K = [-0.145, 0.05];
    const ham = sweep([[0.01, -0.005, 0.088, 1.25], [-0.07, 0.012, 0.072, 1.3], [K[0], K[1], 0.046]], { radial: 8, sx: 0.64, capTop: 2, capBot: 2 });
    legPaint(ham, 0.06, K[0], FLANK, COAL);
    S.overlay(ham, SMOKE, (x, y, z) => S.sstep(-0.08, 0.0, y) * S.sstep(0.0, -0.06, z) * 0.5); // lit round of the ham
    // britches: a fringe of fur hanging from the back of the ham (a husky's
    // "trousers"), smoke-brown, warming to ember only at the very tips
    const fluff = [[-0.035, 0.075, 0.6], [-0.075, 0.07, 0.25], [-0.11, 0.055, -0.1]].map(([y, L, out], i) => tuft(
      S.surface(ham, [sd * out * 0.4, 0, -1], { from: [0, y, 0.01], inset: 0.012 }), [sd * out * 0.5, -1, -0.55], L, 0.02, SMOKE, i === 1 ? EMBER_HI : EMBER, { curl: 0.4, flat: 1.25, exp: 2.6 }));
    const thigh = new THREE.Mesh(S.merge([ham, ...fluff]), fur); thigh.name = 'legThigh';
    hip.add(thigh);
    // the haunch seam continues down the outside of the ham
    const seamPts = [[-0.0, -0.035], [-0.035, -0.02], [-0.07, 0.0], [-0.1, 0.02]].map(([y, z]) => S.surface(ham, [sd, 0, 0], { from: [0, y, z], inset: -0.0015 }));
    const hamSeam = new THREE.Mesh(seamTube(seamPts, 0.0085, 7), magma); hamSeam.name = 'magmaSeams';
    hip.add(hamSeam);
    knee.position.set(0, K[0], K[1]);
    const ay = ankle - K[0];
    const H = [-0.105, -0.1];
    const lo = sweep([[0, 0, 0.046], [-0.045, -0.04, 0.043], [H[0], H[1], 0.03, 1.35], [ay, -0.088, 0.028]], { radial: 8, sx: 0.85, capTop: 2, capBot: 2 });
    S.paint(lo, { from: SOCK, to: COAL_HI, axis: 'y', lo: ay, hi: 0.03, exp: 0.6, noise: 0.012, seed: 33 });
    const foot = new THREE.Mesh(S.merge([lo, mkPaw(pr, [0, ay, -0.088])]), fur); foot.name = 'legFoot';
    knee.add(foot);
    return { group: hip, hip, knee, foot };
  };

  const legDefs = [
    [0.105, -0.07, 0.18, 0, 0.05], [-0.105, -0.07, 0.18, 0, -0.05],
    [0.074, -0.02, -0.165, 1, 0.05], [-0.074, -0.02, -0.165, 1, -0.05],
  ];
  const legs = legDefs.map(([x, y, z, hind, rz]) => {
    const l = hind ? hindLeg(0.39 + y, Math.sign(x)) : foreLeg(0.39 + y);
    kit.at(body, l, x, y, z, { rz });
    return l;
  });

  // --- Tail: a bushy smoke-brown brush lifting into a live flame. ----------
  const tail = S.softTail(4, fur, {
    segLen: 0.1, curl: 0.32, rootPitch: -0.12, radial: 10, capSeg: 2,
    radiusFn: (t) => 0.036 + 0.03 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.12)) - 0.006 * t,
    color: (t) => (t < 0.7 ? S.mixHex(FLANK, SADDLE, t / 0.7) : t < 0.88 ? S.mixHex(SADDLE, EMBER_LO, (t - 0.7) / 0.18) : S.mixHex(EMBER_LO, EMBER, (t - 0.88) / 0.12)),
  });
  kit.at(body, tail, tr[0], tr[1], tr[2]);
  const tailFlame = S.flame3d(kit, 0.18, { seed: 12, width: 0.1, colors: [0xd23a0e, 0xff8a2e, 0xffe08a], halo: 0.45 });
  kit.at(tail.tipAnchor, tailFlame, 0, 0.0, 0.0, { rx: -tail.tipPitch });

  // Heartspark riding on the ember chest ruff.
  const spark = kit.heartspark(0.032, pal.eye, { seed: 12 });
  const sp = S.surface(collar, [0, -0.45, 1], { from: RC, inset: 0.02 });
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
      fx: [smoke, embers, tailFlame, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.9,
      blinkEvery: 3.4,
    },
  };
}
