// =============================================================================
// CHARVANE — Ember, stage 2 (Kindlet awakens at L16).
// "Lean coal-furred hound, magma cracks along spine, smoke wisps when it
// huffs. Loyal, proud." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). The pup's round soot body grows into a
// powerful, deep-chested hound: a big ribcage tapering to a tucked waist and
// a rounded haunch, a short thick neck carrying a broad head HIGH (pride is
// a posture), heavy shoulders and thighs that taper through real joints to
// slim wrists and hocks and round dark paws — no stick legs. Kindlet's ember
// belly survives as a warm ash chest ruff; the magma cracks are bold glowing
// seams laid ON the spine and flanks with dark crust around them, and the
// proud tail curls up into a live flame tuft. Static pieces per node are
// merged into one smooth vertex-coloured mesh (./soft.js).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const COAL_LO = 0x1c1716, COAL_HI = 0x524640, CRUST = 0x1b1311, ASH = 0x8d7466, ASH_HI = 0xb39886, SOCK = 0x1e1614;

export function build_charvane(kit = kitDefault) {
  const pal = kit.palette(['ember']);
  const fur = S.vcMat(kit, { rough: 0.66 });
  const magma = kit.mat(0xffa640, { unlit: true });

  const root = new THREE.Group();

  // --- Torso: big ribcage, tucked waist, rounded haunch. ------------------
  const torsoGeo = S.spindle({
    len: 0.64, r: 0.175, sx: 0.88, sy: 1.1, p: 0.9, radial: 18, rings: 14,
    profile: (t) => 0.74 + 0.16 * S.bump(t, 0.17, 0.28) + 0.28 * S.bump(t, 0.72, 0.36),
    belly: (t) => 0.06 + 0.34 * S.bump(t, 0.36, 0.3),
    arch: (t) => 0.04 * S.sstep(0.45, 1, t) - 0.012 * S.bump(t, 0.35, 0.3),
  });
  S.paint(torsoGeo, { from: COAL_LO, to: COAL_HI, axis: 'y', exp: 0.9, noise: 0.012, seed: 21 });
  S.overlay(torsoGeo, 0x6e5446, (x, y, z) => S.sstep(-0.06, -0.16, y) * S.sstep(0.05, 0.3, z));
  // dark crust around the spine seams
  S.overlay(torsoGeo, CRUST, (x, y, z) => S.sstep(0.12, 0.19, y + 0.04 * S.sstep(0.1, 0.3, z)) * (1 - S.sstep(0.03, 0.1, Math.abs(x))) * 0.8);
  // Short, thick neck (part of the torso mesh).
  const neckGeo = S.spindle({ len: 0.3, r: 0.1, sx: 0.95, sy: 1.08, p: 0.9, radial: 14, rings: 8, profile: (t) => 1.12 - 0.22 * t });
  S.pose(neckGeo, [0, 0.13, 0.3], [-0.85, 0, 0]);
  S.paint(neckGeo, { from: COAL_LO, to: COAL_HI, axis: 'y', noise: 0.012, seed: 22 });
  // Warm ash chest ruff: Kindlet's ember belly, grown into fur.
  const ruffGeo = S.puff(0.09, { count: 4, spread: 0.7, seed: 23, sy: 1.1, blend: 0.72 });
  S.pose(ruffGeo, [0, 0.0, 0.3], [0.5, 0, 0], [1.0, 1.15, 0.5]);
  S.paint(ruffGeo, { from: 0x5a4a42, to: 0x8a7264, axis: 'y', noise: 0.02, seed: 24 });
  // Dorsal ruff: pointed fur clumps along the crest of the neck and over
  // the shoulders, sweeping back — body-coloured so they read as fur.
  const maneGeos = [];
  const clump = (at, dir, len, w, from, to) => {
    const g = S.taper(len, w, { r1: w * 0.12, curve: -0.3, radial: 6, rings: 5, sx: 1.5, sz: 0.55 });
    S.paint(g, { from, to, axis: 'y', noise: 0.015 });
    S.aim(g, dir);
    return S.pose(g, at);
  };
  const neckAll = S.merge([neckGeo.clone()]);
  for (let i = 0; i < 5; i++) {
    const u = i / 4;
    const from = [0, 0.13 + (u - 0.5) * 0.22 * 0.75, 0.3 + (u - 0.5) * 0.22 * 0.66];
    const at = S.surface(neckAll, [0, 1, -0.35], { from, inset: 0.012 });
    maneGeos.push(clump(at, [0, 0.8, -1], 0.13 - u * 0.025, 0.05, COAL_LO, 0x6a574c));
  }
  for (const sd of [1, -1]) for (let i = 0; i < 2; i++) {
    const at2 = S.surface(neckAll, [sd, 0.2, -0.1], { from: [0, 0.06 + i * 0.07, 0.25 + i * 0.05], inset: 0.012 });
    maneGeos.push(clump(at2, [sd * 0.6, 0.35, -1], 0.1, 0.045, COAL_LO, 0x62524a));
  }
  const body = S.bake([torsoGeo, neckGeo, ruffGeo, ...maneGeos], fur, 'body');
  root.add(body);
  body.position.y = 0.47;

  // --- Magma seams: bold glowing cracks on spine, shoulders and haunch. ----
  const seams = [
    S.grooveTop(torsoGeo, [[0.0, 0.27], [0.014, 0.17], [-0.01, 0.06], [0.012, -0.05], [-0.006, -0.16], [0.0, -0.27]], { radius: 0.015, lift: 0.001, seg: 26 }),
    S.grooveTop(torsoGeo, [[0.012, 0.17], [0.06, 0.13], [0.09, 0.07], [0.11, 0.05]], { radius: 0.009, lift: 0.001 }),
    S.grooveTop(torsoGeo, [[-0.01, 0.06], [-0.06, 0.03], [-0.1, -0.03]], { radius: 0.009, lift: 0.001 }),
    S.grooveTop(torsoGeo, [[0.012, -0.05], [0.06, -0.1], [0.1, -0.13]], { radius: 0.008, lift: 0.001 }),
    S.grooveTop(torsoGeo, [[-0.006, -0.16], [-0.055, -0.2], [-0.09, -0.24]], { radius: 0.008, lift: 0.001 }),
  ];
  const seamMesh = new THREE.Mesh(S.merge(seams.map((g) => S.paint(g, 0xffffff))), magma);
  seamMesh.name = 'magmaSeams';
  body.add(seamMesh);
  const seamGlow = S.glow(0xff7a2a, 0.34, 0.35);
  seamGlow.position.set(0, 0.2, 0.0);
  seamGlow.scale.set(0.5, 0.2, 1);
  body.add(seamGlow);
  const embers = kit.mote(5, { color: 0xff9a3c, size: 0.016, radius: 0.16, height: 0.2, speed: 0.7, seed: 21 });
  kit.at(body, embers, 0, 0.18, -0.02);

  // --- Head: ONE wedge — a broad skull flowing into a thick, lowered
  // muzzle (a hound, not a ball with a snout stuck on). ----------------------
  const headGeo = S.spindle({
    len: 0.36, r: 0.12, sx: 1.0, sy: 1.0, pTail: 1.0, pNose: 1.15, radial: 20, rings: 16, belly: 0.1,
    profile: (t) => (t < 0.42 ? 1.0 : S.lerp(1.0, 0.56, S.sstep(0.42, 0.68, t))) - 0.14 * S.sstep(0.72, 1, t),
    syAt: (t) => S.lerp(0.9, 0.72, S.sstep(0.42, 0.7, t)),
    arch: (t) => -0.045 * S.sstep(0.38, 0.75, t),
  });
  S.paint(headGeo, { from: COAL_LO, to: COAL_HI, axis: 'y', noise: 0.01, seed: 25 });
  S.overlay(headGeo, ASH, (x, y, z) => S.sstep(-0.05, -0.085, y) * S.sstep(0.0, 0.06, z));   // pale jaw
  S.overlay(headGeo, 0x2a201c, (x, y, z) => S.sstep(0.1, 0.16, z) * 0.6);                       // darker muzzle tip
  const noseGeo = S.ball(0.028, { sx: 1.35, sy: 0.85, radial: 8, rings: 6 });
  S.pose(noseGeo, S.surface(headGeo, [0, 0.25, 1], { from: [0, -0.04, 0.05], inset: 0.012 }));
  S.paint(noseGeo, 0x141010);
  const SK = [0, 0.0, -0.075]; // skull centre, for seating parts
  // Pointed cheek fluff flaring back from the jaw.
  const cheekGeos = [];
  for (const sd of [1, -1]) for (let i = 0; i < 3; i++) {
    const at = S.surface(headGeo, [sd, -0.35 + i * 0.25, -0.15], { from: [0, -0.02, -0.04 - i * 0.03], inset: 0.012 });
    cheekGeos.push(clump(at, [sd * 0.8, -0.25 + i * 0.2, -1], 0.07 - i * 0.008, 0.035, COAL_HI, ASH));
  }
  const brows = [1, -1].map((sd) => S.paint(S.groove(headGeo, [[sd * 0.25, 0.5], [sd * 0.45, 0.52], [sd * 0.65, 0.4]], { from: SK, radius: 0.0075, lift: 0.001 }), 0x171010));
  const head = S.bake([headGeo, noseGeo, ...cheekGeos, ...brows], fur, 'head');
  kit.at(body, head, 0, 0.35, 0.53, { rx: 0.02, ry: 0.12 });
  const skullGeo = headGeo; // eyes/ears seat on the skull part of the wedge

  const eyeOpts = { irisColor: 0xd9822a, pupilColor: 0x1a0e08, skinColor: 0x3a2d28, glintSize: 0.012 };
  const eyeL = S.seatEye(kit, head, skullGeo, 0.034, 0.62, 0.2, eyeOpts, { sink: 0.45, front: 0.62, from: SK });
  const eyeR = S.seatEye(kit, head, skullGeo, 0.034, -0.62, 0.2, eyeOpts, { sink: 0.45, front: 0.62, from: SK });

  // Fangs peeking under the muzzle — a proud hound bares them, a little.
  const fangMat = S.smoothMat(kit, 0xefe8dc, { rough: 0.4 });
  for (const s of [1, -1]) {
    const f = new THREE.Mesh(S.taper(0.026, 0.008, { r1: 0.0018, radial: 6, rings: 5 }), fangMat);
    f.rotation.set(Math.PI - 0.15, 0, -s * 0.12);
    const p = S.surface(headGeo, [s * 0.7, -0.8, 0.2], { from: [0, -0.05, 0.1], inset: 0.004 });
    f.position.set(p[0], p[1] + 0.006, p[2]);
    head.add(f);
  }

  // Tall, alert ears (accents — they twitch).
  const mkEar = () => new THREE.Mesh(S.ear(0.125, 0.092, { color: COAL_HI, inner: 0x7a5c50, tip: 1.9, cup: 0.45, depth: 0.4, radial: 8, rings: 7 }), fur);
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(skullGeo, S.dirYP(0.5, 1.0), { from: SK, inset: 0.016 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.02, { rz: -0.3, ry: 0.55, rx: -0.2 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.02, { rz: 0.3, ry: -0.55, rx: -0.2 });

  // Smoke wisps from the nostrils when it huffs.
  const smoke = kit.mote(3, { color: 0x8a8478, size: 0.014, radius: 0.035, height: 0.1, speed: 0.6, seed: 7 });
  kit.at(head, smoke, 0, -0.04, 0.22);

  // --- Legs: heavy shoulders/thighs tapering through real joints. ----------
  const foreDef = { thighR: 0.078, shinR: 0.036, kneeR: 0.045, ankleR: 0.03, pawR: 0.048, pawLen: 1.3, bend: -0.12, split: 0.52, bulge: 0.28 };
  const hindDef = { thighR: 0.1, shinR: 0.036, kneeR: 0.046, ankleR: 0.03, pawR: 0.048, pawLen: 1.3, bend: 0.4, split: 0.45, bulge: 0.35 };
  const legDefs = [
    [0.085, -0.06, 0.2, foreDef], [-0.085, -0.06, 0.2, foreDef],
    [0.08, -0.04, -0.21, hindDef], [-0.08, -0.04, -0.21, hindDef],
  ];
  const legs = legDefs.map(([x, y, z, d]) => {
    const l = S.softLeg(0.47 + y, fur, { ...d, color: COAL_HI, shinColor: 0x3a2d28, pawColor: SOCK, toes: 3 });
    kit.at(body, l, x, y, z);
    return l;
  });

  // --- Tail: proud, curling up into a live flame tuft. ---------------------
  const tail = S.softTail(4, fur, {
    segLen: 0.1, curl: 0.2, rootPitch: 0.45, radial: 10,
    radiusFn: (t) => 0.042 + 0.036 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)) - 0.012 * t,
    color: (t) => S.mixHex(COAL_HI, 0x9a5a3c, Math.pow(t, 2.5)),
  });
  kit.at(body, tail, 0, 0.08, -0.3);
  const tailFlame = S.flame3d(kit, 0.17, { seed: 12, width: 0.095, colors: [0xd23a0e, 0xff8a2e, 0xffe08a], halo: 0.45 });
  kit.at(tail.tipAnchor, tailFlame, 0, 0.0, 0.0, { rx: -tail.tipPitch });

  // Heartspark riding on the chest ruff.
  const spark = kit.heartspark(0.032, pal.eye, { seed: 12 });
  kit.at(body, spark, 0, 0.03, 0.42);

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
