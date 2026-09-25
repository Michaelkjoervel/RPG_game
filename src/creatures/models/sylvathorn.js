// =============================================================================
// SYLVATHORN — Bloom/Terra, stage 3 (Briarback awakens at L34).
// "Tall antlered guardian — stag body, bark plates, hanging moss cloak,
// glade-green glow. Solemn." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). The final form of the Thistlit line: a
// tall, solemn stag-guardian. One sculpted deep-chested body carried on long
// stag legs (knee-forward hind legs, dark hooves), a thick upright neck and a
// noble wedge head. Its armour is BARK: rounded bark plates with dark
// grain over the shoulders and spine. A cloak of moss drapes the back — soft
// cushions (one-ball shading) with strands hanging down the flanks — and
// its antlers are living wood, branching, every tip budding glade-green
// light. Glowing green eyes; slow glow-motes drift around it.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const HIDE_LO = 0x3a3122, HIDE = 0x5e4f38, HIDE_HI = 0x8a7652, BARK_LO = 0x2a2218, BARK_HI = 0x6a5a3e, MOSS_LO = 0x2c4a26, MOSS_HI = 0x8ac862, GLOW = 0xbfe89a, HOOF = 0x2a3522;

export function build_sylvathorn(kit = kitDefault) {
  const pal = kit.palette(['bloom', 'terra']);
  const hide = S.vcMat(kit, { rough: 0.7 });
  const glowMat = kit.mat(GLOW, { unlit: true });

  const root = new THREE.Group();

  // --- Body: deep chest, tucked waist, strong haunch. -----------------------
  const LEG = 0.72, hipY = -0.16;
  const bodyGeo = S.spindle({
    len: 1.0, r: 0.22, sx: 0.88, sy: 1.08, p: 0.9, radial: 20, rings: 16,
    profile: (t) => 0.72 + 0.2 * S.bump(t, 0.2, 0.26) + 0.36 * S.bump(t, 0.74, 0.3),
    belly: (t) => 0.06 + 0.3 * S.bump(t, 0.42, 0.28),
    arch: (t) => 0.05 * S.sstep(0.45, 1, t),
  });
  S.paint(bodyGeo, { from: HIDE_LO, to: HIDE_HI, axis: 'y', exp: 0.9, noise: 0.015, seed: 50 });
  const neckGeo = S.spindle({ len: 0.56, r: 0.14, sx: 0.9, sy: 1.1, radial: 16, rings: 10, profile: (t) => 1.25 - 0.42 * t });
  S.pose(neckGeo, [0, 0.28, 0.52], [-(Math.PI / 2 - 0.5), 0, 0]);
  S.paint(neckGeo, { from: HIDE_LO, to: HIDE_HI, axis: 'y', noise: 0.015, seed: 53 });
  // bark plates over shoulders and spine
  const plates = [];
  const plate = (at, dir, w, h, seed) => {
    const g = S.pebble(w, { sx: 1, sy: 0.32, sz: h / w, seed, noise: 0.08, radial: 12, rings: 8 });
    S.paint(g, { from: BARK_LO, to: BARK_HI, axis: 'y', noise: 0.03, seed });
    // bark grain: darker stripes along the plate
    S.overlay(g, 0x1e1810, (x, y, z) => (Math.abs(Math.sin(x * 70 + seed)) > 0.93 ? 0.7 : 0));
    S.aim(g, dir);
    return S.pose(g, at);
  };
  for (const [z, w, seed] of [[0.26, 0.15, 1], [0.08, 0.16, 2], [-0.1, 0.14, 3], [-0.28, 0.12, 4]]) {
    const at = S.surface(bodyGeo, [0, 1, 0], { from: [0, 0, z], inset: 0.03 });
    plates.push(plate(at, [0, 1, -0.15], w, w * 1.1, seed));
  }
  for (const sd of [1, -1]) {
    const at = S.surface(bodyGeo, S.dirYP(sd * 1.0, 0.5), { from: [0, 0, 0.26], inset: 0.03 });
    plates.push(plate(at, [sd * 0.8, 0.6, 0.1], 0.13, 0.14, 7 + sd));
  }
  // the moss cloak: cushions over the back + strands hanging down the flanks
  const moss = [];
  for (const [z, r, seed] of [[0.18, 0.15, 61], [-0.05, 0.14, 62], [-0.26, 0.12, 63]]) {
    const at = S.surface(bodyGeo, [0, 1, 0], { from: [0, 0, z], inset: 0.02 });
    const g = S.puff(r, { count: 6, spread: 0.8, seed, sy: 0.55, blend: 0.8, flat: 0.5 });
    S.pose(g, [at[0], at[1] + 0.02, at[2]], null, [1.25, 1, 1.1]);
    S.paint(g, { from: MOSS_LO, to: MOSS_HI, axis: 'y', noise: 0.03, seed });
    moss.push(g);
  }
  for (let i = 0; i < 10; i++) {
    const sd = i % 2 ? 1 : -1;
    const z = 0.28 - Math.floor(i / 2) * 0.13;
    const at = S.surface(bodyGeo, S.dirYP(sd * 1.15, 0.45), { from: [0, 0, z], inset: 0.01 });
    const len = 0.2 + ((i * 37) % 7) * 0.02;
    const g = S.taper(len, 0.028, { r1: 0.006, curve: 0.25, radial: 6, rings: 5, sx: 1.6, sz: 0.5 });
    S.paint(g, { from: 0x6aa852, to: 0x2c4a26, axis: 'y' });
    g.rotateX(Math.PI); // hang down
    S.pose(g, at, [0, 0, -sd * 0.25]);
    moss.push(g);
  }
  const body = S.bake([bodyGeo, neckGeo, ...plates, ...moss], hide, 'body');
  root.add(body);
  body.position.y = LEG - hipY;

  // --- Head: a noble stag wedge. -------------------------------------------
  const headGeo = S.spindle({
    len: 0.42, r: 0.14, sx: 0.84, sy: 1.0, pTail: 1.0, pNose: 1.1, radial: 18, rings: 14, belly: 0.08,
    profile: (t) => (t < 0.38 ? 1.0 : S.lerp(1.0, 0.56, S.sstep(0.38, 0.72, t))) - 0.1 * S.sstep(0.75, 1, t),
    syAt: (t) => S.lerp(0.92, 0.74, S.sstep(0.4, 0.75, t)),
    arch: (t) => -0.05 * S.sstep(0.35, 0.8, t),
  });
  S.paint(headGeo, { from: HIDE_LO, to: HIDE_HI, axis: 'y', noise: 0.012, seed: 54 });
  S.overlay(headGeo, 0x2e281c, (x, y, z) => S.sstep(0.13, 0.2, z) * 0.8);
  const hMoss = S.puff(0.06, { count: 4, spread: 0.7, seed: 64, sy: 0.6 });
  S.pose(hMoss, S.surface(headGeo, [0, -0.6, -0.4], { from: [0, 0, -0.05], inset: 0.02 }));
  S.paint(hMoss, { from: MOSS_LO, to: MOSS_HI, axis: 'y' });
  const head = S.bake([headGeo, hMoss], hide, 'head');
  kit.at(body, head, 0, 0.58, 0.72, { rx: 0.12 });
  const SK = [0, 0, -0.09];
  const eyeOpts = { irisColor: 0x9ce080, scleraColor: 0x1c180e, skinColor: 0x5c503a, glintSize: 0.017 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.042, 0.7, 0.22, eyeOpts, { sink: 0.45, front: 0.45, from: SK });
  const eyeR = S.seatEye(kit, head, headGeo, 0.042, -0.7, 0.22, eyeOpts, { sink: 0.45, front: 0.45, from: SK });
  const mkEar = () => new THREE.Mesh(S.ear(0.13, 0.075, { color: HIDE, inner: 0x9a8a6a, tip: 1.2, cup: 0.5, depth: 0.32, radial: 8, rings: 7 }), hide);
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.85, 0.5), { from: SK, inset: 0.012 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.02, { rz: -1.1, ry: 0.4 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.02, { rz: 1.1, ry: -0.4 });

  // --- Living-wood antlers, every tip budding glade-green light. -----------
  const antlers = [], buds = [];
  for (const sd of [1, -1]) {
    const beamLen = 0.52;
    const beam = S.taper(beamLen, 0.05, { r1: 0.018, curve: -0.35, radial: 8, rings: 8 });
    S.paint(beam, { from: BARK_LO, to: 0x7a6a4a, axis: 'y', noise: 0.02 });
    const parts = [beam];
    const tipsLocal = [[0, beamLen, -0.35 * beamLen]];
    for (const [t, len, splay] of [[0.35, 0.22, 0.9], [0.6, 0.2, 0.55], [0.82, 0.14, 0.3]]) {
      const tine = S.taper(len, 0.024, { r1: 0.008, curve: -0.25, radial: 6, rings: 5 });
      S.paint(tine, { from: BARK_LO, to: 0x7a6a4a, axis: 'y' });
      const base = [0, t * beamLen, -0.35 * beamLen * t * t];
      S.pose(tine, base, [0.25, 0, -splay]);
      parts.push(tine);
      const tip = new THREE.Vector3(0, len, -0.25 * len).applyEuler(new THREE.Euler(0.25, 0, -splay));
      tipsLocal.push([base[0] + tip.x, base[1] + tip.y, base[2] + tip.z]);
    }
    const m = S.bake(parts, hide, 'antler');
    const at = S.surface(headGeo, S.dirYP(sd * 0.35, 1.0), { from: SK, inset: 0.02 });
    kit.at(head, m, at[0], at[1], at[2], { rz: -sd * 0.55, rx: -0.25 });
    if (sd < 0) m.scale.x = -1;
    antlers.push(m);
    const bg = tipsLocal.map((p) => S.paint(S.ball(0.026, { radial: 8, rings: 6 }).translate(p[0], p[1], p[2]), 0xffffff));
    const budMesh = new THREE.Mesh(S.merge(bg), glowMat);
    budMesh.name = 'antlerBuds';
    m.add(budMesh);
    buds.push(budMesh);
  }

  // --- Long stag legs, dark hooves. -----------------------------------------
  const legs = [[0.13, hipY, 0.28, -0.1, 0.11], [-0.13, hipY, 0.28, -0.1, 0.11], [0.13, hipY + 0.02, -0.3, 0.42, 0.14], [-0.13, hipY + 0.02, -0.3, 0.42, 0.14]].map(([x, y, z, bend, thighR]) => {
    const l = S.softLeg(LEG + (y - hipY), hide, { thighR, shinR: 0.046, kneeR: 0.055, ankleR: 0.036, pawR: 0.05, pawLen: 1.15, pawH: 0.05, toes: 2, bend, split: 0.48, bulge: 0.34, color: HIDE, shinColor: HIDE_LO, pawColor: HOOF });
    kit.at(body, l, x, y, z);
    return l;
  });

  const tail = S.softTail(3, hide, { segLen: 0.07, startR: 0.04, endR: 0.02, curl: 0.25, rootPitch: 0.4, color: HIDE });
  kit.at(body, tail, 0, 0.1, -0.48);

  const glowMotes = kit.mote(9, { color: GLOW, size: 0.022, radius: 0.45, height: 0.5, speed: 0.3, seed: 27 });
  kit.at(body, glowMotes, 0, 0.25, 0.05);
  const spark = kit.heartspark(0.05, GLOW, { seed: 28 });
  const sp = S.surface(bodyGeo, S.dirYP(0, -0.15), { from: [0, 0, 0.3], inset: 0.012 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  const grounded = kit.groundPlant(root);
  const contact = kit.shadowDisc(0.45, 0.34);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR],
      fx: [glowMotes, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.75,
      blinkEvery: 5.0,
    },
  };
}
