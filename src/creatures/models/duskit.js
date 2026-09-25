// =============================================================================
// DUSKIT — Umbra, stage 1 wild (Whisperwood).
// "Small twilight owl, mask-like face disc, silent. Judgmental stare."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized): a round dusk-violet owlet — one soft ball
// of a body with a speckled pale breast, a big round head carrying the
// signature pale heart-shaped facial MASK, two huge amber eyes under
// flat, stern brows (the judgmental stare), little ear tufts, a tiny hooked
// beak, folded wings with dark tips and small taloned feet.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const DUSK_LO = 0x3e355e, DUSK = 0x5b5180, DUSK_HI = 0x7d70a2, MASK = 0xd6cfe0, MASK_LO = 0xa89fba, BREAST = 0xb4aac8, BEAK = 0x3a3048;

export function build_duskit(kit = kitDefault) {
  const pal = kit.palette(['umbra']);
  const plume = S.vcMat(kit, { rough: 0.7, emissive: 0x1c1733, emissiveIntensity: 0.5 });

  const root = new THREE.Group();

  // --- Body: a round owlet ball, pale speckled breast. ---------------------
  const bodyGeo = S.spindle({ len: 0.22, r: 0.115, sx: 1.0, sy: 1.08, p: 1, radial: 20, rings: 14, belly: 0.1 });
  S.paint(bodyGeo, { from: DUSK_LO, to: DUSK_HI, axis: 'y', noise: 0.012, seed: 160 });
  S.overlay(bodyGeo, BREAST, (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return S.sstep(0.25, 0.6, (z - y * 0.2) / l); });
  // breast speckles (little chevrons of dusk)
  for (let i = 0; i < 9; i++) {
    const yaw = ((i % 3) - 1) * 0.35 + (i % 2) * 0.1, pitch = -0.1 - Math.floor(i / 3) * 0.28;
    S.blush(bodyGeo, S.surface(bodyGeo, S.dirYP(yaw, pitch)), 0.018, DUSK, 0.7);
  }
  const body = S.bake([bodyGeo], plume, 'body');
  root.add(body);
  body.position.y = 0.13;

  // --- Head: big, round, with the pale heart-shaped mask. -----------------
  const headGeo = S.ball(0.1, { sx: 1.05, sy: 0.95, sz: 0.95, radial: 20, rings: 14 });
  S.paint(headGeo, { from: DUSK, to: DUSK_HI, axis: 'y', noise: 0.01, seed: 161 });
  // the facial disc: a flattened heart of pale feathers laid on the face
  const disc = S.spindle({ len: 0.034, r: 0.09, sx: 1.08, sy: 1.0, p: 1, radial: 22, rings: 8, profile: (t) => 1 });
  const dp = disc.attributes.position;
  for (let i = 0; i < dp.count; i++) { // heart: dip at the top-centre, point at the chin
    const x = dp.getX(i), y = dp.getY(i);
    const heart = y > 0 ? -0.018 * S.bump(x, 0, 0.03) : -0.012 * (1 - S.sstep(0.0, 0.03, Math.abs(x)));
    dp.setY(i, y + heart - (y < 0 ? 0.008 * S.sstep(0.02, 0.08, Math.abs(x)) : 0));
  }
  S.paint(disc, { from: MASK_LO, to: MASK, axis: 'y', noise: 0.01 });
  // a darker rim around the mask
  S.overlay(disc, 0x8a80a2, (x, y, z) => S.sstep(0.07, 0.095, Math.hypot(x / 1.08, y)));
  S.pose(disc, S.surface(headGeo, S.dirYP(0, -0.05), { inset: 0.013 }));
  // stern flat brows (the judgmental stare) and a tiny hooked beak
  const brows = [1, -1].map((s) => S.paint(S.groove(disc, [[s * 0.1, 0.5], [s * 0.4, 0.44], [s * 0.7, 0.3]], { from: [0, 0, -0.03], radius: 0.007, lift: 0.002 }), 0x2e2640));
  const beak = S.taper(0.03, 0.014, { r1: 0.003, curve: 0.5, radial: 7, rings: 5 });
  beak.rotateX(Math.PI - 0.35);
  S.paint(beak, BEAK);
  const bk = S.surface(disc, S.dirYP(0, -0.22), { inset: 0.004 });
  S.pose(beak, [bk[0], bk[1] + 0.02, bk[2]]);
  // ear tufts
  const tufts = [1, -1].map((s) => {
    const g = S.taper(0.05, 0.016, { r1: 0.003, curve: -0.4, radial: 6, rings: 5, sx: 1.4, sz: 0.6 });
    S.paint(g, { from: DUSK, to: 0x9a8cc0, axis: 'y' });
    return S.pose(g, S.surface(headGeo, S.dirYP(s * 0.55, 0.95), { inset: 0.012 }), [-0.3, 0, -s * 0.45]);
  });
  const head = S.bake([headGeo, disc, ...brows, beak, ...tufts], plume, 'head');
  kit.at(body, head, 0, 0.13, 0.01, { rz: 0.06 });

  const eyeOpts = { irisColor: 0xe0b44c, pupilColor: 0x14101c, scleraColor: 0x1a1522, skinColor: 0xb8b0c4, glintSize: 0.014, irisScale: 1.15 };
  const eyeL = S.seatEye(kit, head, disc, 0.036, 0.34, 0.1, eyeOpts, { sink: 0.4, front: 0.75 });
  const eyeR = S.seatEye(kit, head, disc, 0.036, -0.34, 0.1, eyeOpts, { sink: 0.4, front: 0.75 });

  // --- Folded wings with dark tips. -----------------------------------------
  const wingParts = [1, -1].map((side) => {
    const w = S.softWing(0.15, plume, { side, width: 0.1, thick: 0.28, down: 0.8, spread: 0.3, color: { from: DUSK_LO, to: DUSK }, tips: 0x2e2744, feathers: 3 });
    const p = S.surface(bodyGeo, S.dirYP(side * 1.3, 0.35), { inset: 0.02 });
    kit.at(body, w, p[0], p[1], p[2]);
    return w;
  });

  // --- Small taloned feet. -------------------------------------------------
  const legs = [[0.04, -0.1, 0.02], [-0.04, -0.1, 0.02]].map(([x, y, z]) => {
    const l = S.softLeg(0.05, plume, { thighR: 0.016, shinR: 0.011, pawR: 0.02, pawLen: 1.4, toes: 3, color: DUSK, shinColor: 0x6a5e80, pawColor: BEAK, radial: 7 });
    kit.at(body, l, x, y, z);
    return l;
  });

  const spark = kit.heartspark(0.02, pal.eye, { seed: 161 });
  const sp = S.surface(bodyGeo, S.dirYP(0, -0.05), { inset: 0.008 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.13, 0.34));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      wings: wingParts.map((w) => w.bones),
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [],
      fx: [spark, S.variantFx(root)],
    },
    hints: {
      personality: 'calm',
      locomotion: 'fly',
      breathAmp: 0.7,
      blinkEvery: 5.0,
    },
  };
}
