// =============================================================================
// CHARVANE — Ember, stage 2 (Kindlet awakens at L16).
// "Lean coal-furred hound, magma cracks along spine, smoke wisps when it
// huffs. Loyal, proud." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized), sturdier round. The pup's round soot body
// grows into a young fire wolf with presence: a deep, full chest and a thick
// neck carried high under a big EMBER RUFF — Kindlet's fire belly grown into
// a mane of coal fur whose tips glow ember-orange (the halfway point to
// Pyrelith's molten mane). A broad young-wolf head (short muzzle, big amber
// eyes, tall ember-lined ears, flared cheek fur), thick legs that taper in
// ONE clean line from shoulder/haunch to round dark paws (no stacked joint
// bulges), set wide and square in a confident stance. Glowing magma seams
// run down the spine and over the shoulders, and the bushy tail lifts into
// a live flame. Static pieces per node are one vertex-coloured mesh.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const COAL_LO = 0x1c1615, COAL = 0x2e2522, COAL_HI = 0x4e423d, CRUST = 0x18110f,
  EMBER_LO = 0x7a2e16, EMBER = 0xc4521e, EMBER_HI = 0xf08a3a, SOCK = 0x1a1311, INNER = 0xb0502a;

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

export function build_charvane(kit = kitDefault) {
  const pal = kit.palette(['ember']);
  const fur = S.vcMat(kit, { rough: 0.66 });
  const magma = kit.mat(0xffa640, { unlit: true });

  const root = new THREE.Group();

  // A pointed fur clump (grows +Y, curls toward -Z), aimed along `dir`.
  const clump = (at, dir, len, w, from, to) => {
    const g = S.taper(len, w, { r1: w * 0.14, curve: -0.35, radial: 5, rings: 3, capSeg: 1, sx: 1.4, sz: 0.7 });
    S.paint(g, { from, to, axis: 'y', noise: 0.015 });
    S.aim(g, dir);
    return S.pose(g, at);
  };

  // --- Torso: deep full chest, firm waist, rounded haunch. -----------------
  const torsoGeo = S.spindle({
    len: 0.56, r: 0.195, sx: 1.04, sy: 1.04, p: 0.92, radial: 18, rings: 12,
    profile: (t) => 0.78 + 0.07 * S.bump(t, 0.2, 0.26) + 0.24 * S.bump(t, 0.7, 0.34),
    syAt: (t) => 1.0 + 0.06 * S.bump(t, 0.2, 0.26),
    belly: (t) => 0.05 + 0.22 * S.bump(t, 0.36, 0.28),
    arch: (t) => 0.035 * S.sstep(0.45, 1, t) - 0.01 * S.bump(t, 0.35, 0.3),
  });
  S.paint(torsoGeo, { from: COAL_LO, to: COAL_HI, axis: 'y', exp: 0.9, noise: 0.012, seed: 21 });
  // dark crust along the spine (the seams sit in it)
  S.overlay(torsoGeo, CRUST, (x, y, z) => S.sstep(0.13, 0.2, y + 0.04 * S.sstep(0.1, 0.3, z)) * (1 - S.sstep(0.03, 0.1, Math.abs(x))) * 0.8);
  // ember underglow on the chest and belly, Kindlet's fire belly
  S.overlay(torsoGeo, EMBER_LO, (x, y, z) => S.sstep(-0.08, -0.17, y) * S.sstep(-0.05, 0.2, z) * 0.85);
  // Thick neck carried high (part of the torso mesh).
  const neckGeo = S.spindle({ len: 0.28, r: 0.125, sx: 1.0, sy: 1.08, p: 0.92, radial: 14, rings: 8, profile: (t) => 1.12 - 0.2 * t });
  S.pose(neckGeo, [0, 0.14, 0.27], [-0.85, 0, 0]);
  S.paint(neckGeo, { from: COAL_LO, to: COAL_HI, axis: 'y', noise: 0.012, seed: 22 });
  // THE EMBER RUFF: a full collar of fur round the neck base, coal on the
  // nape, glowing ember on the breast — Kindlet's fire belly grown into a
  // mane — with pointed clumps radiating out of it, ember at every tip.
  const collar = ruffGeo();
  const RC = [0, 0.1, 0.26];
  S.pose(collar, RC, [0.72, 0, 0]); // local +Y -> up the neck, local +Z -> the breast
  const body = S.bake([torsoGeo, neckGeo, collar], fur, 'body');
  root.add(body);
  body.position.y = 0.39;

  // --- Magma seams: glowing cracks on spine, shoulders and haunch. ---------
  const seams = [
    S.grooveTop(torsoGeo, [[0.0, 0.14], [0.014, 0.07], [-0.01, -0.01], [0.012, -0.09], [-0.006, -0.17], [0.0, -0.24]], { radius: 0.015, lift: 0.001, seg: 14, radial: 3, caps: false }),
    S.grooveTop(torsoGeo, [[0.014, 0.07], [0.065, 0.05], [0.105, 0.02], [0.13, 0.005]], { radius: 0.009, lift: 0.001, seg: 7, radial: 3, caps: false }),
    S.grooveTop(torsoGeo, [[-0.01, -0.01], [-0.065, -0.03], [-0.115, -0.07]], { radius: 0.009, lift: 0.001, seg: 6, radial: 3, caps: false }),
    S.grooveTop(torsoGeo, [[0.012, -0.09], [0.065, -0.12], [0.11, -0.15]], { radius: 0.008, lift: 0.001, seg: 6, radial: 3, caps: false }),
    S.grooveTop(torsoGeo, [[-0.006, -0.17], [-0.05, -0.195], [-0.08, -0.215]], { radius: 0.008, lift: 0.001, seg: 6, radial: 3, caps: false }),
  ];
  const seamMesh = new THREE.Mesh(S.merge(seams.map((g) => S.paint(g, 0xffffff))), magma);
  seamMesh.name = 'magmaSeams';
  body.add(seamMesh);
  const seamGlow = S.glow(0xff7a2a, 0.36, 0.35);
  seamGlow.position.set(0, 0.21, -0.02);
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
    cheeks.push(clump(at, [sd * 0.85, -0.3 + i * 0.22, -1], 0.085 - i * 0.01, 0.04, COAL_HI, i === 0 ? EMBER : 0x8a5a44));
  }
  const brows = [1, -1].map((sd) => S.paint(S.groove(headGeo, [[sd * 0.25, 0.5], [sd * 0.45, 0.53], [sd * 0.65, 0.42]], { from: SK, radius: 0.008, lift: 0.001, seg: 8, caps: false }), 0x140e0d));
  const mouth = S.paint(S.groove(headGeo, [[-0.5, -0.32], [-0.25, -0.42], [0, -0.44], [0.25, -0.42], [0.5, -0.32]], { from: [0, -0.01, 0.06], radius: 0.0055, lift: -0.001, seg: 10, caps: false }), 0x120d0c);
  const head = S.bake([headGeo, noseGeo, ...cheeks, ...brows, mouth], fur, 'head');
  kit.at(body, head, 0, 0.35, 0.49, { rx: 0.04, ry: 0.1 });

  const eyeOpts = { irisColor: 0xe08a2a, pupilColor: 0x1a0e08, skinColor: 0x3a2d28, glintSize: 0.014 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.044, 0.58, 0.2, eyeOpts, { sink: 0.45, front: 0.66, from: SK });
  const eyeR = S.seatEye(kit, head, headGeo, 0.044, -0.58, 0.2, eyeOpts, { sink: 0.45, front: 0.66, from: SK });

  // Fangs peeking under the muzzle — a proud young wolf shows them, a little.
  const fangMat = S.smoothMat(kit, 0xefe8dc, { rough: 0.4 });
  for (const s of [1, -1]) {
    const f = new THREE.Mesh(S.taper(0.026, 0.008, { r1: 0.0018, radial: 6, rings: 5 }), fangMat);
    f.rotation.set(Math.PI - 0.15, 0, -s * 0.12);
    const p = S.surface(headGeo, [s * 0.6, -0.8, 0.25], { from: [0, -0.05, 0.1], inset: 0.004 });
    f.position.set(p[0], p[1] + 0.006, p[2]);
    head.add(f);
  }

  // Tall alert ears, ember-lined (accents — they twitch).
  const mkEar = () => new THREE.Mesh(S.ear(0.155, 0.11, { color: COAL_HI, inner: INNER, tip: 1.7, cup: 0.45, depth: 0.4, radial: 8, rings: 7 }), fur);
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.5, 1.0), { from: SK, inset: 0.018 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.015, { rz: -0.28, ry: 0.5, rx: -0.15 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.015, { rz: 0.28, ry: -0.5, rx: -0.15 });

  // Smoke wisps from the nostrils when it huffs.
  const smoke = kit.mote(3, { color: 0x8a8478, size: 0.014, radius: 0.035, height: 0.1, speed: 0.6, seed: 7 });
  kit.at(head, smoke, 0, -0.03, 0.2);

  // --- Legs: thick, one clean taper from shoulder/haunch to round paws. ----
  // knee radii sit ON the straight line between thigh and ankle (no joint
  // bulge), the muscle swell is barely there, the paw is one step wider.
  const foreDef = { thighR: 0.088, kneeR: 0.062, shinR: 0.05, ankleR: 0.04, pawR: 0.06, pawLen: 1.25, bend: -0.08, split: 0.5, bulge: 0.04 };
  const hindDef = { thighR: 0.092, kneeR: 0.062, shinR: 0.05, ankleR: 0.04, pawR: 0.06, pawLen: 1.25, bend: 0.3, split: 0.46, bulge: 0.02 };
  const legDefs = [
    [0.11, -0.07, 0.18, foreDef, 0.06], [-0.11, -0.07, 0.18, foreDef, -0.06],
    [0.088, -0.03, -0.16, hindDef, 0.07], [-0.088, -0.03, -0.16, hindDef, -0.07],
  ];
  const legs = legDefs.map(([x, y, z, d, rz]) => {
    const l = S.softLeg(0.39 + y, fur, { ...d, color: COAL, shinColor: 0x2c2220, pawColor: SOCK, toes: 3, radial: 8 });
    kit.at(body, l, x, y, z, { rz });
    return l;
  });

  // --- Tail: bushy and proud, lifting into a live flame. --------------------
  const tail = S.softTail(4, fur, {
    segLen: 0.1, curl: 0.22, rootPitch: 0.5, radial: 8,
    radiusFn: (t) => 0.048 + 0.04 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.08)) - 0.012 * t,
    color: (t) => (t < 0.7 ? S.mixHex(COAL_HI, COAL, t / 0.7) : S.mixHex(COAL, EMBER, S.sstep(0.7, 1, t))),
  });
  kit.at(body, tail, 0, 0.09, -0.27);
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
