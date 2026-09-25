// =============================================================================
// THALASSYR, THE DEEPDREAM — Tide/Umbra, Firstborn legendary.
// "Abyssal leviathan sleeping beneath Mirrorlake; the world's dreams pool in
// its slow wake. Story-critical. Post-game encounter." (Design Bible §4, §2)
// =============================================================================
// A CROWN JEWEL and the largest Kindred (SPECIES.thalassyr.size = 3.2).
// Visual pass v2 (soft stylized) keeps the v1 composition — silhouette-first
// — but every mass is one smooth sculpted form:
//   1. COILING LENGTH. Torso + reared S-neck are ONE swept form; the tail is
//      a long soft chain posed into a lazy S that rides over two humps, so
//      its length reads from any camera (a straight tail is a tadpole).
//   2. A CREST THAT RUNS THE WHOLE ANIMAL: translucent deep-water sails on
//      the neck, back and every forward tail segment, tallest at the
//      shoulders, one continuous topline.
//   3. REARED HEAD looking down at the player: a broad abyssal wedge with a
//      heavy brow, a SEPARATE jaw (parts.jaw drops on a roar) lined with
//      fangs, swept horns, and a dream-lure on a stalk arcing over the snout.
// Deep-sea signalling: rows of bioluminescent spots along the flanks and
// tail (merged per body part, pulsing in a few phase groups), and dream motes
// in three pastel hues pooling in its wake.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const SKIN_LO = 0x1d3150, SKIN = 0x35527d, SKIN_HI = 0x5a7ea6, BELLY = 0x8aa6c6, CREST = 0x2f8fb4, GLOW = 0x66e8c8;

export function build_thalassyr(kit = kitDefault) {
  const skin = S.vcMat(kit, { rough: 0.34, metal: 0.06, emissive: 0x152947, emissiveIntensity: 0.55 });
  const crestMat = kit.mat(CREST, { rough: 0.3, transparent: true, opacity: 0.78, side: THREE.DoubleSide, emissive: 0x1d5f7d, emissiveIntensity: 0.8 });
  const glowA = kit.mat(GLOW, { unlit: true, transparent: true, opacity: 0.9 });
  const glowB = glowA.clone();
  const fangMat = S.smoothMat(kit, 0xdcecf4, { rough: 0.3 });

  const root = new THREE.Group();
  const spotsA = [], spotsB = [];
  const spot = (list, p, r) => { const g = new THREE.OctahedronGeometry(r * 1.15, 0); g.deleteAttribute('uv'); list.push(S.paint(g.translate(p[0], p[1], p[2]), 0xffffff)); };

  // --- Torso + reared S-neck ---------------------------------------------------
  const torso = S.spindle({ len: 0.95, r: 0.34, sx: 0.95, sy: 1.0, p: 0.9, radial: 20, rings: 14, profile: (t) => 0.8 + 0.22 * S.bump(t, 0.62, 0.4) });
  S.paint(torso, { from: SKIN_LO, to: SKIN_HI, axis: 'y', noise: 0.015, seed: 81 });
  S.overlay(torso, BELLY, (x, y, z) => S.sstep(-0.14, -0.24, y) * 0.9);
  const neckPts = [[0, 0.04, 0.36], [0, 0.26, 0.64], [0, 0.66, 0.74], [0, 1.06, 0.7], [0, 1.28, 0.84]];
  const neck = S.tubeAlong(neckPts, (t) => S.lerp(0.3, 0.2, t), { radial: 14, tubular: 16 });
  S.paint(neck, { from: SKIN, to: SKIN_HI, axis: 'y', noise: 0.015, seed: 82 });
  S.overlayN(neck, BELLY, (nx, ny, nz) => S.sstep(0.25, 0.65, nz - ny * 0.4) * 0.85);
  const body = S.bake([torso, neck], skin, 'body');
  root.add(body);
  body.position.y = 0.62;
  for (let i = 0; i < 5; i++) for (const sd of [1, -1]) {
    const z = 0.3 - i * 0.16;
    spot(i % 2 ? spotsB : spotsA, S.surface(torso, [sd, -0.1, 0], { from: [0, 0, z], inset: 0.004 }), 0.032 - i * 0.003);
  }
  for (let i = 0; i < 4; i++) for (const sd of [1, -1]) {
    const c = neckPts[i + 1];
    spot(i % 2 ? spotsA : spotsB, S.surface(neck, [sd, 0, 0], { from: c, inset: 0.004 }), 0.026);
  }

  // Crest over the neck and shoulders: one translucent sail mesh.
  const crest = [];
  for (let i = 0; i < 6; i++) {
    const u = i / 5;
    const c = i < 4 ? neckPts[4 - i] : [0, 0.2, 0.2 - (i - 4) * 0.3];
    const h = i < 4 ? 0.34 + i * 0.1 : 0.7 - (i - 4) * 0.12;
    const g = S.spindle({ len: 0.5, r: h * 0.5, sx: 0.07, sy: 1, radial: 12, rings: 8, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.05)), 0.8) * (0.75 + 0.25 * t) });
    g.rotateX(-0.35 - u * 0.1);
    const at = S.surface(i < 4 ? neck : torso, [0, 1, -0.2], { from: c, inset: 0.04 });
    crest.push(S.pose(g, [at[0], at[1] + h * 0.3, at[2]]));
  }
  const crestMesh = new THREE.Mesh(S.merge(crest.map((g) => S.paint(g, 0xffffff))), crestMat);
  crestMesh.name = 'crest';
  body.add(crestMesh);

  // Pectoral flippers (accents).
  const flippers = [1, -1].map((sd) => {
    const g = S.spindle({ len: 0.62, r: 0.16, sx: 1.4, sy: 0.12, radial: 12, rings: 8, pNose: 0.8, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.9)), 0.7) * (0.5 + 0.5 * t) });
    g.translate(0, 0, -0.31);
    const m = new THREE.Mesh(g, crestMat);
    m.name = 'flipper';
    kit.at(body, m, sd * 0.28, -0.14, 0.2, { ry: sd * 0.7, rz: -sd * 0.35 });
    return m;
  });

  // --- Head: broad abyssal wedge, heavy brow, horns, jaw, lure --------------
  const headGeo = S.spindle({
    len: 0.7, r: 0.26, sx: 0.95, sy: 0.9, pTail: 1.0, pNose: 1.05, radial: 20, rings: 14, belly: 0.25,
    profile: (t) => (t < 0.42 ? 1.0 : S.lerp(1.0, 0.66, S.sstep(0.42, 0.78, t))),
    syAt: (t) => S.lerp(0.95, 0.72, S.sstep(0.4, 0.8, t)),
  });
  S.paint(headGeo, { from: SKIN_LO, to: SKIN_HI, axis: 'y', noise: 0.012, seed: 88 });
  const browG = [1, -1].map((sd) => {
    const g = S.ball(0.14, { sx: 1.1, sy: 0.42, sz: 0.9, radial: 12, rings: 8 });
    S.paint(g, { from: 0x1a2a44, to: 0x2e4468, axis: 'y' });
    return S.pose(g, S.surface(headGeo, S.dirYP(sd * 0.5, 0.45), { from: [0, 0, 0.05], inset: 0.07 }), [0, 0, -sd * 0.3]);
  });
  const horns = [1, -1].map((sd) => {
    const g = S.taper(0.44, 0.06, { r1: 0.01, curve: -0.7, radial: 8, rings: 7 });
    S.paint(g, { from: 0x1a2a44, to: 0x6a86a8, axis: 'y' });
    S.aim(g, [sd * 0.55, 0.6, -0.55]);
    return S.pose(g, S.surface(headGeo, S.dirYP(sd * 0.6, 0.7), { from: [0, 0, -0.14], inset: 0.03 }));
  });
  const head = S.bake([headGeo, ...browG, ...horns], skin, 'head');
  kit.at(body, head, 0, 1.3, 0.98, { rx: 0.3 });
  for (const sd of [1, -1]) for (const z of [-0.05, 0.12]) spot(spotsA, S.surface(headGeo, [sd, -0.2, 0], { from: [0, -0.04, z], inset: 0.004 }), 0.022);
  const SK = [0, 0.02, -0.12];
  const eyeOpts = { irisColor: 0xcaf6ee, pupil: true, scleraColor: 0x07131c, skinColor: 0x35527d, glintSize: 0.03 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.08, 0.62, 0.2, eyeOpts, { sink: 0.5, front: 0.4, from: SK });
  const eyeR = S.seatEye(kit, head, headGeo, 0.08, -0.62, 0.2, eyeOpts, { sink: 0.5, front: 0.4, from: SK });

  // separate lower jaw lined with fangs and a glowing gumline
  const jawG = S.spindle({ len: 0.56, r: 0.2, sx: 0.95, sy: 0.4, radial: 16, rings: 10, profile: (t) => 0.95 - 0.3 * S.sstep(0.55, 1, t) });
  jawG.translate(0, 0, 0.26);
  S.paint(jawG, { from: 0x1d2e48, to: 0x2e4468, axis: 'y' });
  const fangs = [];
  for (const sd of [1, -1]) for (const [z, len] of [[0.46, 0.1], [0.34, 0.085], [0.2, 0.07]]) {
    const f = S.taper(len, 0.024, { r1: 0.004, radial: 5, rings: 3, capSeg: 1 });
    S.paint(f, 0xdcecf4);
    fangs.push(S.pose(f, [sd * 0.13, 0.05, z], [0, 0, sd * 0.08]));
  }
  const jaw = new THREE.Group(); jaw.name = 'jaw';
  jaw.add(S.bake([jawG], skin, 'jawMesh'));
  const fangMesh = new THREE.Mesh(S.merge(fangs), fangMat);
  fangMesh.name = 'fangs';
  jaw.add(fangMesh);
  const gum = S.tubeAlong([[0.14, 0.07, 0.08], [0.12, 0.08, 0.4], [0, 0.08, 0.52], [-0.12, 0.08, 0.4], [-0.14, 0.07, 0.08]], () => 0.016, { radial: 5, tubular: 16 });
  const gumMesh = new THREE.Mesh(S.paint(gum, 0xffffff), glowB);
  gumMesh.name = 'jawGlow';
  jaw.add(gumMesh);
  kit.at(head, jaw, 0, -0.17, -0.06);

  // the dream-lure arcing forward over the snout
  const lurePts = [[0, 0.2, -0.02], [0, 0.44, 0.1], [0, 0.5, 0.34], [0, 0.34, 0.5]];
  const stalk = new THREE.Mesh(S.paint(S.tubeAlong(lurePts, (t) => S.lerp(0.03, 0.012, t), { radial: 6, tubular: 12 }), 0x1a2a44), skin);
  stalk.name = 'lureStalk';
  head.add(stalk);
  const lure = kit.crystal(0.08, glowA.clone(), { coreColor: 0xffffff, detail: 0 });
  lure.name = 'lure';
  lure.position.set(0, 0.26, 0.54);
  head.add(lure);
  const lureGlow = S.glow(GLOW, 0.5, 0.6);
  lure.add(lureGlow);
  const lureMotes = kit.mote(7, { color: 0xa9f2e2, size: 0.028, radius: 0.18, height: 0.22, speed: 0.5, seed: 195 });
  kit.at(head, lureMotes, 0, 0.26, 0.54);

  // --- The coiling body ---------------------------------------------------------
  const N = 12;
  const YAW = [0, -0.14, -0.19, -0.22, -0.2, -0.12, 0.0, 0.12, 0.19, 0.2, 0.16, 0.1];
  const PITCH = [-0.06, -0.14, -0.04, 0.14, 0.18, 0.08, -0.1, -0.18, -0.12, 0.04, 0.14, 0.14];
  const tail = S.softTail(N, skin, {
    segLen: 0.3, startR: 0.32, endR: 0.06, rootPitch: -0.06, radial: 10,
    curl: (i) => PITCH[i] ?? 0, yaw: (i) => YAW[i + 1] ?? 0,
    color: (t) => S.mixHex(SKIN, SKIN_LO, t * 0.45),
  });
  kit.at(body, tail, 0, -0.02, -0.42);
  tail.pivots.forEach((p, i) => {
    const r = S.lerp(0.32, 0.06, i / N);
    const seg = p.children.find((c) => c.name === 'tailSeg');
    if (seg) S.overlay(seg.geometry, BELLY, (x, y, z) => S.sstep(-r * 0.35, -r * 0.7, y) * 0.85);
    const pts = [];
    for (const sd of [1, -1]) spot(pts, [sd * r * 0.96, -0.02, -0.15], Math.max(0.014, 0.028 * (1 - i / N)));
    if (pts.length) {
      const m = new THREE.Mesh(S.merge(pts), i % 2 ? glowA : glowB);
      m.name = 'bioSpots';
      p.add(m);
    }
    if (i < 9) {
      const h = 0.6 * (1 - i / 10) + 0.08;
      const g = S.spindle({ len: 0.4, r: h * 0.5, sx: 0.07, sy: 1, radial: 10, rings: 7, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.05)), 0.8) });
      const m = new THREE.Mesh(g, crestMat);
      m.name = 'crestFin';
      m.position.set(0, r * 0.9 + h * 0.3, -0.15);
      m.rotation.x = -0.3;
      p.add(m);
    }
  });
  const flukeG = S.spindle({ len: 0.4, r: 0.32, sx: 1.6, sy: 0.12, radial: 14, rings: 8, pNose: 0.7, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.95)), 0.6) * (0.4 + 0.6 * (1 - t)) });
  flukeG.translate(0, 0, -0.14);
  const fluke = new THREE.Mesh(flukeG, crestMat);
  fluke.name = 'fluke';
  kit.at(tail.tipAnchor, fluke, 0, 0, 0);

  const bodySpots = new THREE.Mesh(S.merge(spotsA), glowA);
  bodySpots.name = 'bioSpots';
  body.add(bodySpots);
  const bodySpotsB = new THREE.Mesh(S.merge(spotsB), glowB);
  bodySpotsB.name = 'bioSpots';
  body.add(bodySpotsB);
  let t = 0;
  const pulse = { update(dt) { t += dt; glowA.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.7)); glowB.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.7 + 2.1)); } };

  // --- Dreams pooling in its wake --------------------------------------------
  const dreamRose = kit.mote(10, { color: 0xe0b8c8, size: 0.04, radius: 1.2, height: 0.55, speed: 0.2, seed: 191 });
  kit.at(body, dreamRose, 0, 0.2, -0.9);
  const dreamLavender = kit.mote(8, { color: 0xc8b8e0, size: 0.034, radius: 1.0, height: 0.7, speed: 0.16, seed: 192 });
  kit.at(body, dreamLavender, 0, 0.35, -1.5);
  const dreamTeal = kit.mote(8, { color: 0xa0d8d8, size: 0.03, radius: 0.9, height: 0.45, speed: 0.24, seed: 193 });
  kit.at(body, dreamTeal, 0, 0.05, -0.3);

  const spark = kit.heartspark(0.09, GLOW, { seed: 194 });
  const sp = S.surface(torso, [0, -0.3, 1], { from: [0, 0, 0.25], inset: 0.012 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      jaw,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      accents: [...flippers, fluke, lure],
      fx: [pulse, lureMotes, dreamRose, dreamLavender, dreamTeal, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'calm',
      locomotion: 'serpent',
      breathAmp: 0.55,
      blinkEvery: 6.8,
    },
  };
}
