// =============================================================================
// PYRELITH — Ember/Terra, stage 3 (Charvane awakens at L34).
// "Heavy obsidian-plated saurian, molten mane, crown of embers. Slow fuse,
// unstoppable." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). The final form of the Kindlet line: a
// massive, low saurian whose shoulders stand higher than its hips so the
// whole animal leans into its next step, head carried low and forward under
// a heavy brow with a separate jaw (parts.jaw opens on attacks). The hide is
// smooth basalt; the ARMOUR is obsidian — volcanic glass, so its scutes are
// deliberately faceted and glossy (the one place facets belong). Bold
// magma seams run between the plates, a molten flame mane rolls along the
// neck, and a crown of horns carries embers at every tip. Thick sprawled
// legs end in broad feet with obsidian claws; a heavy tail counterweights it.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const HIDE_LO = 0x221b1a, HIDE_HI = 0x6a5446, BELLY = 0x8a4a2a, OBS_LO = 0x15121a, OBS_HI = 0x3c3548;

// A faceted obsidian scute: a low, sharp-ridged shard (flat shaded).
function scuteGeo(w, h, d, seed = 1) {
  const g = new THREE.OctahedronGeometry(1, 0);
  g.scale(w * 0.5, h, d * 0.5);
  g.translate(0, h * 0.35, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0) pos.setY(i, y * 0.3); // shallow buried base
    pos.setZ(i, pos.getZ(i) - Math.max(0, pos.getY(i)) * 0.35 * (0.8 + 0.2 * Math.sin(seed))); // sweep back
  }
  g.computeVertexNormals();
  return g;
}

export function build_pyrelith(kit = kitDefault) {
  const pal = kit.palette(['ember', 'terra']);
  const hide = S.vcMat(kit, { rough: 0.62 });
  const obsidian = kit.mat(0xffffff, { vertexColors: true, flat: true, rough: 0.22, metal: 0.25 });
  const magma = kit.mat(0xffa33c, { unlit: true });
  const magmaHot = kit.mat(0xffd27a, { unlit: true });
  const mouthMat = kit.mat(0xff7a22, { unlit: true });

  const root = new THREE.Group();

  // --- Body: a massive, low barrel; shoulders higher than hips. ------------
  const bodyGeo = S.spindle({
    len: 1.12, r: 0.36, sx: 1.08, sy: 0.84, p: 0.9, radial: 22, rings: 16,
    profile: (t) => 0.78 + 0.14 * S.bump(t, 0.22, 0.3) + 0.24 * S.bump(t, 0.68, 0.34),
    belly: 0.22,
    arch: (t) => 0.1 * S.sstep(0.35, 0.95, t) - 0.03,
  });
  S.paint(bodyGeo, { from: HIDE_LO, to: HIDE_HI, axis: 'y', exp: 0.9, noise: 0.015, seed: 9 });
  S.overlay(bodyGeo, BELLY, (x, y, z) => S.sstep(-0.12, -0.26, y) * 0.8);
  // short, thick neck rising into the head
  const neckGeo = S.spindle({ len: 0.46, r: 0.2, sx: 1.05, sy: 0.9, radial: 16, rings: 10, profile: (t) => 1.15 - 0.3 * t });
  S.pose(neckGeo, [0, 0.12, 0.56], [-0.32, 0, 0]);
  S.paint(neckGeo, { from: HIDE_LO, to: HIDE_HI, axis: 'y', noise: 0.015, seed: 10 });
  S.overlay(neckGeo, BELLY, (x, y, z) => S.sstep(0.02, -0.1, y) * 0.75);
  const body = S.bake([bodyGeo, neckGeo], hide, 'body');
  root.add(body);
  body.position.y = 0.66;

  // --- Obsidian scutes along the spine, rising toward the crown. -----------
  const plates = [];
  const spine = [[0.5, 0.2, 0.25], [0.34, 0.24, 0.26], [0.17, 0.26, 0.26], [0.0, 0.24, 0.24], [-0.17, 0.2, 0.2], [-0.33, 0.16, 0.17], [-0.47, 0.12, 0.13]];
  spine.forEach(([z, h, w], i) => {
    const p = S.surface(bodyGeo, [0, -1, 0], { from: [0, 3, z], nearest: true, inset: 0.03 });
    const g = scuteGeo(w, h, w * 0.9, i);
    S.pose(g, p, [-0.12, 0, 0]);
    S.paint(g, { from: OBS_LO, to: OBS_HI, axis: 'y', noise: 0.02, seed: i });
    plates.push(g);
    // flank plates, smaller, angled out
    if (i > 0 && i < 6) for (const s of [1, -1]) {
      const q = S.surface(bodyGeo, S.dirYP(s * 1.0, 0.6), { from: [0, 0, z], inset: 0.03 });
      const f = scuteGeo(w * 0.6, h * 0.45, w * 0.55, i + s);
      S.pose(f, q, [0, 0, -s * 0.85]);
      S.paint(f, { from: OBS_LO, to: OBS_HI, axis: 'y', noise: 0.02 });
      plates.push(f);
    }
  });
  const plateMesh = new THREE.Mesh(S.merge(plates), obsidian);
  plateMesh.name = 'obsidianScutes';
  body.add(plateMesh);

  // --- Magma seams between the plates and a molten underbelly line. ---------
  const seams = [];
  for (const s of [1, -1]) {
    seams.push(S.grooveTop(bodyGeo, [[s * 0.2, 0.42], [s * 0.26, 0.28], [s * 0.22, 0.12], [s * 0.28, -0.04], [s * 0.24, -0.2], [s * 0.28, -0.34]], { radius: 0.018, lift: 0.002, seg: 20 }));
    seams.push(S.groove(bodyGeo, [[s * 1.2, 0.1], [s * 1.35, -0.05], [s * 1.5, 0.05]], { from: [0, 0, 0.3], radius: 0.013, lift: 0.002 }));
    seams.push(S.groove(bodyGeo, [[s * 1.7, 0.15], [s * 1.9, 0.0], [s * 2.05, 0.12]], { from: [0, 0, -0.2], radius: 0.013, lift: 0.002 }));
  }
  const seamMesh = new THREE.Mesh(S.merge(seams.map((g) => S.paint(g, 0xffffff))), magma);
  seamMesh.name = 'magmaSeams';
  body.add(seamMesh);
  const bellyGlow = S.glow(0xff6a1a, 0.9, 0.35);
  bellyGlow.position.set(0, -0.28, 0.05);
  bellyGlow.scale.set(1.0, 0.3, 1);
  body.add(bellyGlow);

  // --- Head: heavy, low, furnace-lit; separate jaw. -------------------------
  const skullGeo = S.spindle({
    len: 0.5, r: 0.2, sx: 1.08, sy: 0.72, p: 0.9, pNose: 1.2, radial: 20, rings: 14, belly: 0.25,
    profile: (t) => 0.95 + 0.12 * S.bump(t, 0.35, 0.3) - 0.28 * S.sstep(0.55, 1, t),
  });
  S.paint(skullGeo, { from: HIDE_LO, to: HIDE_HI, axis: 'y', noise: 0.015, seed: 11 });
  // heavy obsidian brow ridges baked into the skull (glossy dark tint)
  const browGeos = [1, -1].map((s) => {
    const g = S.spindle({ len: 0.2, r: 0.05, sx: 1.2, sy: 0.7, radial: 10, rings: 7 });
    S.pose(g, S.surface(skullGeo, S.dirYP(s * 0.5, 0.55), { inset: 0.02 }), [0.1, s * 0.4, s * 0.25]);
    return S.paint(g, { from: OBS_LO, to: OBS_HI, axis: 'y' });
  });
  const nostrils = [1, -1].map((s) => S.paint(S.pose(S.ball(0.018, { radial: 6, rings: 4 }), S.surface(skullGeo, S.dirYP(s * 0.12, 0.18), { from: [0, 0, 0.15], inset: 0.005 })), 0x120c0a));
  const head = S.bake([skullGeo, ...browGeos, ...nostrils], hide, 'head');
  kit.at(body, head, 0, 0.26, 0.86, { rx: 0.12 });

  const jawGeo = S.spindle({ len: 0.42, r: 0.15, sx: 1.05, sy: 0.4, p: 0.9, radial: 16, rings: 10, profile: (t) => 0.95 - 0.35 * S.sstep(0.5, 1, t) });
  jawGeo.translate(0, 0, 0.15);
  S.paint(jawGeo, { from: 0x3a2a24, to: 0x5a4438, axis: 'y', noise: 0.01 });
  const mouthGlow = S.ball(0.09, { sx: 1.25, sy: 0.22, sz: 1.3, radial: 12, rings: 6 });
  S.pose(mouthGlow, [0, 0.05, 0.14]);
  const jawMesh = S.bake([jawGeo], hide, 'jaw');
  const jaw = new THREE.Group(); jaw.name = 'jaw';
  jaw.add(jawMesh);
  const mouth = new THREE.Mesh(S.paint(mouthGlow, 0xffffff), mouthMat);
  mouth.name = 'mouthGlow';
  jaw.add(mouth);
  kit.at(head, jaw, 0, -0.085, -0.03);

  const eyeOpts = { irisColor: 0xffa33c, scleraColor: 0x241812, skinColor: 0x3a2e28, glintSize: 0.02 };
  const eyeL = S.seatEye(kit, head, skullGeo, 0.05, 0.62, 0.25, eyeOpts, { sink: 0.55, front: 0.55 });
  const eyeR = S.seatEye(kit, head, skullGeo, 0.05, -0.62, 0.25, eyeOpts, { sink: 0.55, front: 0.55 });

  // --- Crown of embers: obsidian horns sweeping back, embers at the tips. ---
  const hornGeos = [], tipGeos = [];
  const crownN = 5;
  for (let i = 0; i < crownN; i++) {
    const a = (i / (crownN - 1) - 0.5) * 1.8;
    const len = 0.34 - Math.abs(a) * 0.08;
    const g = S.taper(len, 0.05, { r1: 0.01, curve: -0.55, radial: 7, rings: 6 });
    const base = S.surface(skullGeo, S.dirYP(a * 0.5, 0.95 - Math.abs(a) * 0.15), { from: [0, 0, -0.08], inset: 0.02 });
    S.pose(g, base, [-0.35, 0, -a * 0.5]);
    S.paint(g, { from: OBS_LO, to: 0x6a5a70, axis: 'y' });
    hornGeos.push(g);
    // ember bead at the tip: follow the horn's curve (tip = base + R * (0, len, curve*len))
    const tip = new THREE.Vector3(0, len * 0.98, -0.55 * len * 0.92).applyEuler(new THREE.Euler(-0.35, 0, -a * 0.5));
    tipGeos.push(S.pose(S.ball(0.034, { radial: 6, rings: 4 }), [base[0] + tip.x, base[1] + tip.y, base[2] + tip.z]));
  }
  const crown = new THREE.Mesh(S.merge(hornGeos), obsidian);
  crown.name = 'crown';
  head.add(crown);
  const embersTips = new THREE.Mesh(S.merge(tipGeos.map((g) => S.paint(g, 0xffffff))), magmaHot);
  embersTips.name = 'crownEmbers';
  head.add(embersTips);
  const headFlame = S.flame3d(kit, 0.3, { seed: 27, width: 0.2, colors: [0xb23a0c, 0xf5701e, 0xffd377], halo: 0.4 });
  const hf = S.surface(skullGeo, S.dirYP(0, 1.2), { from: [0, 0, -0.06], inset: 0.03 });
  kit.at(head, headFlame, hf[0], hf[1], hf[2]);

  // --- Molten mane rolling along the neck and shoulders. --------------------
  const torsoAll = S.merge([bodyGeo.clone(), neckGeo.clone()]);
  const maneSpots = [[0.66, 0.3], [0.5, 0.38], [0.32, 0.32]];
  const manes = maneSpots.map(([z, h], i) => {
    const f = S.flame3d(kit, h, { seed: 20 + i, width: h * 0.55, colors: [0xb23a0c, 0xf5701e, 0xffd377], halo: 0.3 });
    const p = S.surface(torsoAll, [0, -1, 0], { from: [0, 3, z], nearest: true, inset: 0.06 });
    kit.at(body, f, p[0], Math.min(p[1], 0.5), p[2]);
    return f;
  });

  // --- Legs: thick, sprawled, broad feet with obsidian claws. ---------------
  const clawMat = obsidian;
  const legDefs = [
    [0.34, -0.14, 0.34, 1, 0.1], [-0.34, -0.14, 0.34, -1, 0.1],
    [0.32, -0.12, -0.34, 1, 0.25], [-0.32, -0.12, -0.34, -1, 0.25],
  ];
  const legs = legDefs.map(([x, y, z, s, bend]) => {
    const l = S.softLeg(0.66 + y, hide, {
      thighR: 0.17, shinR: 0.1, kneeR: 0.115, ankleR: 0.09, pawR: 0.12, pawLen: 1.25, pawH: 0.08, toes: 0,
      bend, split: 0.5, bulge: 0.3, color: HIDE_HI, shinColor: 0x3a2e28, pawColor: 0x2a2220, radial: 12,
    });
    kit.at(body, l, x, y, z, { rz: s * 0.1 });
    const claws = [];
    for (const u of [-1, 0, 1]) {
      const c = new THREE.ConeGeometry(0.028, 0.08, 4, 1);
      c.deleteAttribute('uv');
      c.rotateX(Math.PI / 2 + 0.35);
      S.paint(c, { from: OBS_LO, to: OBS_HI, axis: 'z' });
      claws.push(S.pose(c, [u * 0.075, -0.25, 0.0], [0, u * 0.25, 0]));
    }
    // place claws at the front of the paw (paw lives in the knee frame)
    l.foot.geometry.computeBoundingBox();
    const bb = l.foot.geometry.boundingBox;
    const cm = new THREE.Mesh(S.merge(claws.map((g) => { g.translate(0, bb.min.y + 0.03 + 0.25, bb.max.z - 0.03); return g; })), clawMat);
    cm.name = 'claws';
    l.knee.add(cm);
    return l;
  });

  // --- Tail: heavy counterweight with scutes and an ember tip. --------------
  const tail = S.softTail(5, hide, {
    segLen: 0.2, startR: 0.2, endR: 0.06, curl: -0.04, rootPitch: -0.12,
    color: (t) => S.mixHex(HIDE_HI, 0x4a3a30, t),
  });
  kit.at(body, tail, 0, 0.04, -0.5);
  tail.pivots.forEach((p, i) => {
    const sz = 0.2 - i * 0.03;
    const g = scuteGeo(sz, sz * 0.7, sz * 0.8, i + 9);
    S.pose(g, [0, 0.2 - i * 0.036, -0.1], [-0.25, 0, 0]);
    S.paint(g, { from: OBS_LO, to: OBS_HI, axis: 'y' });
    const m = new THREE.Mesh(g, obsidian); m.name = 'tailScute';
    p.add(m);
  });
  const tailEmber = new THREE.Mesh(S.ball(0.05, { radial: 10, rings: 7 }), magmaHot);
  tailEmber.name = 'tailEmber';
  kit.at(tail.tipAnchor, tailEmber, 0, 0.01, 0);

  const embers = kit.mote(12, { color: 0xff9a3c, size: 0.03, radius: 0.6, height: 0.5, speed: 0.4, seed: 33 });
  kit.at(body, embers, 0, 0.2, 0);

  const spark = kit.heartspark(0.055, pal.eye, { seed: 44 });
  const sp = S.surface(neckGeo, [0, -0.6, 1], { from: [0, 0.1, 0.6], inset: 0.02 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  const grounded = kit.groundPlant(root);
  const contact = kit.shadowDisc(0.8, 0.34);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body,
      head,
      jaw,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [],
      fx: [...manes, headFlame, embers, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'quad',
      breathAmp: 1.3,
      blinkEvery: 4.2,
    },
  };
}
