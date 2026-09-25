// =============================================================================
// GLOOMEL — Umbra/Tide, stage 1 (single-stage), rare.
// "Blind pale cave eel, lure of faint shadowlight. Sings in the dark."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). A long, soft, cave-pale eel: one smooth
// body that flows from a rounded head into a tapering tail laid in a lazy S
// (so its length shows to a 3/4 camera), bone-pale on top shading to cool
// violet-grey beneath, with a translucent violet fin ribbon running along
// the spine and a small tail fin. A gentle, wide face with pale filmed-over
// eyes (it is blind) and frilly gill fans. The signature: an anglerfish LURE
// arcing up from its crown and forward over the face, tipped with a glowing
// bead of blue shadowlight; faint motes of its "song" drift around it.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const SKIN_LO = 0x8a88a2, SKIN = 0xc8c8d6, SKIN_HI = 0xf2f2f6, BELLY = 0x9e9ab8, FIN = 0x9a8cd8, LURE = 0x8fb8ff;

export function build_gloomel(kit = kitDefault) {
  const pal = kit.palette(['umbra', 'tide']);
  const skin = S.vcMat(kit, { rough: 0.36 });
  const finMat = kit.mat(FIN, { rough: 0.3, transparent: true, opacity: 0.62, side: THREE.DoubleSide, emissive: 0x3a3a8a, emissiveIntensity: 0.5 });
  const lureMat = kit.mat(LURE, { unlit: true });

  const root = new THREE.Group();

  // --- Body: the front of the eel (the tail chain carries the rest). ------------
  const torso = S.spindle({ len: 0.3, r: 0.075, sx: 0.92, sy: 1.0, p: 0.6, radial: 14, rings: 10, profile: (t) => 0.92 + 0.1 * t });
  S.paint(torso, { from: SKIN_LO, to: SKIN_HI, axis: 'y', noise: 0.012, seed: 72 });
  S.overlay(torso, BELLY, (x, y, z) => S.sstep(-0.025, -0.06, y) * 0.7);
  const body = S.bake([torso], skin, 'body');
  root.add(body);
  body.position.y = 0.11;

  // --- Head: wide, gentle, blind; gill frills. -----------------------------------
  const headGeo = S.spindle({
    len: 0.2, r: 0.085, sx: 1.12, sy: 0.9, pTail: 1, pNose: 1.25, radial: 16, rings: 12, belly: 0.1,
    profile: (t) => (t < 0.4 ? 1 : S.lerp(1, 0.72, S.sstep(0.4, 1, t))),
  });
  S.paint(headGeo, { from: SKIN_LO, to: SKIN_HI, axis: 'y', noise: 0.01, seed: 73 });
  S.overlay(headGeo, BELLY, (x, y, z) => S.sstep(-0.02, -0.05, y) * 0.7);
  const mouth = S.paint(S.groove(headGeo, [[-0.45, -0.25], [-0.2, -0.33], [0, -0.35], [0.2, -0.33], [0.45, -0.25]], { radius: 0.006, lift: -0.001 }), 0x5a5470);
  const head = S.bake([headGeo, mouth], skin, 'head');
  kit.at(body, head, 0, 0.01, 0.17);
  const eyeOpts = { irisColor: 0xdfe6ee, pupil: false, scleraColor: 0xc9ccd8, skinColor: 0xc8c8d6, glintSize: 0.009 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.024, 0.62, 0.25, eyeOpts, { sink: 0.45, front: 0.5 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.024, -0.62, 0.25, eyeOpts, { sink: 0.45, front: 0.5 });
  const gills = [1, -1].map((sd) => {
    const g = S.spindle({ len: 0.08, r: 0.035, sx: 0.12, sy: 1, radial: 8, rings: 6, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.95)), 0.7) });
    g.translate(0, 0, 0.04);
    const m = new THREE.Mesh(g, finMat);
    m.name = 'gillFrill';
    const at = S.surface(headGeo, [sd, 0, -0.4], { inset: 0.01 });
    kit.at(head, m, at[0], at[1], at[2], { ry: sd * 2.3, rz: sd * 0.2 });
    return m;
  });

  // THE LURE: a slender stalk arcing up from the crown and over the face,
  // tipped with a bead of shadowlight (an accent: it bobs).
  const lure = new THREE.Group(); lure.name = 'lure';
  const stalk = S.tubeAlong([[0, 0, 0], [0, 0.1, -0.01], [0, 0.18, 0.04], [0, 0.2, 0.12], [0, 0.17, 0.18]], (t) => S.lerp(0.012, 0.005, t), { radial: 6, tubular: 14 });
  S.paint(stalk, { from: SKIN, to: 0xb8c8f0, axis: 'y' });
  lure.add(new THREE.Mesh(stalk, skin));
  const bead = new THREE.Mesh(S.ball(0.026, { radial: 10, rings: 7 }), lureMat);
  bead.name = 'lureBead';
  bead.position.set(0, 0.145, 0.185);
  lure.add(bead);
  const beadGlow = S.glow(LURE, 0.26, 0.6);
  beadGlow.position.copy(bead.position);
  lure.add(beadGlow);
  const la = S.surface(headGeo, S.dirYP(0, 1.1), { inset: 0.006 });
  kit.at(head, lure, la[0], la[1], la[2]);
  let lt = 0;
  const lurePulse = {
    update(dt) {
      lt += dt;
      const k = 0.5 + 0.5 * Math.sin(lt * 1.6);
      beadGlow.material.opacity = 0.35 + 0.45 * k;
      beadGlow.scale.setScalar(0.22 + 0.08 * k);
    },
  };

  // --- The long tail in a lazy S, with a fin ribbon along the spine. ---------------
  const N = 7;
  const YAW = [0, -0.26, -0.32, -0.12, 0.16, 0.32, 0.3];
  const tail = S.softTail(N, skin, {
    segLen: 0.1, startR: 0.074, endR: 0.012, rootPitch: -0.04, radial: 9, taperExp: 1.3,
    curl: 0.0, yaw: (i) => YAW[i + 1] ?? 0,
    color: (t) => S.mixHex(SKIN, SKIN_LO, t * 0.5),
  });
  kit.at(body, tail, 0, 0, -0.09);
  tail.pivots.forEach((p, i) => {
    const seg = p.children.find((c) => c.name === 'tailSeg');
    const r = S.lerp(0.072, 0.012, i / N);
    if (seg) S.overlay(seg.geometry, BELLY, (x, y, z) => S.sstep(-r * 0.3, -r * 0.7, y) * 0.7);
    if (i < N - 1) {
      const h = 0.07 * (1 - i / N) + 0.02;
      const g = S.spindle({ len: 0.12, r: h * 0.5, sx: 0.1, sy: 1, radial: 8, rings: 6, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.05)), 0.8) });
      const m = new THREE.Mesh(g, finMat);
      m.name = 'dorsalFin';
      m.position.set(0, r * 0.85 + h * 0.3, -0.05);
      m.rotation.x = -0.2;
      p.add(m);
    }
  });
  const tfG = S.spindle({ len: 0.1, r: 0.05, sx: 0.1, sy: 1, radial: 8, rings: 6, pNose: 0.8, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.95)), 0.6) * (0.5 + 0.5 * (1 - t)) });
  tfG.translate(0, 0, -0.04);
  const tailFin = new THREE.Mesh(tfG, finMat);
  tailFin.name = 'tailFin';
  kit.at(tail.tipAnchor, tailFin, 0, 0, 0);

  // Its song: faint shadowlight motes drifting along the flank.
  const song = kit.mote(7, { color: 0x8fa8e0, size: 0.014, radius: 0.45, height: 0.12, speed: 0.28, seed: 74 });
  kit.at(body, song, 0, 0.02, -0.25);
  const spark = kit.heartspark(0.026, pal.eye, { seed: 75 });
  const sp = S.surface(torso, [0, -0.4, 1], { inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.3, 0.3));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      accents: [...gills, tailFin, lure],
      fx: [song, spark, lurePulse, S.variantFx(root)],
    },
    hints: {
      personality: 'calm',
      locomotion: 'serpent',
      breathAmp: 0.6,
      blinkEvery: 5.2,
    },
  };
}
