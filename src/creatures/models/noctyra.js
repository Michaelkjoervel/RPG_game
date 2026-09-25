// =============================================================================
// NOCTYRA — Umbra/Gale, stage 2 (Duskit awakens at L21).
// "Great owl of dusk-feathers that blur into shadow at the edges.
// Night-watcher." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). Duskit's owlet grown into a great horned
// owl: a big, soft, pear-shaped body with a barred breast, a broad head with
// the family's heart-shaped mask, fierce amber eyes under stern brows and
// long horn tufts. v1's weak spot was flat folded wings; here the wings are
// real VOLUMES — thick feather paddles folded against the flanks with layered
// primaries — and every edge (wing tips, tail fan, tufts) darkens into
// shadow, so the silhouette blurs into the night. Talons grip the ground.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const DUSK_LO = 0x2a2344, DUSK = 0x4a3f6e, DUSK_HI = 0x7a6c9e, SHADOW = 0x17122a, MASK = 0xcfc6dc, MASK_LO = 0x9a90b0, BREAST = 0xa89cc0, BEAK = 0x2e2638, TALON = 0x2a2230;

export function build_noctyra(kit = kitDefault) {
  const pal = kit.palette(['umbra', 'gale']);
  const plume = S.vcMat(kit, { rough: 0.72, emissive: 0x1c1733, emissiveIntensity: 0.45 });

  const root = new THREE.Group();

  // --- Body: big, soft, pear-shaped; barred breast. ----------------------
  const bodyGeo = S.spindle({ len: 0.38, r: 0.19, sx: 1.0, sy: 1.12, p: 1, radial: 20, rings: 14, belly: 0.1, profile: (t) => 0.92 + 0.1 * S.bump(t, 0.55, 0.4) });
  bodyGeo.rotateX(-0.35); // upright owl posture
  S.paint(bodyGeo, { from: DUSK_LO, to: DUSK_HI, axis: 'y', noise: 0.015, seed: 170 });
  S.overlayN(bodyGeo, BREAST, (nx, ny, nz) => S.sstep(0.15, 0.55, nz - ny * 0.2) * 0.9);
  for (let i = 0; i < 5; i++) { // bars across the breast
    const y = -0.12 + i * 0.05;
    S.overlay(bodyGeo, DUSK, (x, yy, z) => (z > 0.05 ? S.bump(yy, y, 0.01) * 0.6 * (1 - S.sstep(0.06, 0.14, Math.abs(x))) : 0));
  }
  // fanned tail, darkening into shadow
  const tailG = S.spindle({ len: 0.2, r: 0.07, sx: 1.8, sy: 0.25, radial: 10, rings: 8, profile: (t) => 0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)) });
  S.pose(tailG, [0, -0.1, -0.2], [0.55, 0, 0]);
  S.paint(tailG, { from: SHADOW, to: DUSK, axis: 'z' });
  const body = S.bake([bodyGeo, tailG], plume, 'body');
  root.add(body);
  body.position.y = 0.3;

  // --- Head: broad, heart-shaped mask, stern brows, horn tufts. ----------
  const headGeo = S.ball(0.15, { sx: 1.08, sy: 0.92, sz: 0.95, radial: 20, rings: 14 });
  S.paint(headGeo, { from: DUSK, to: DUSK_HI, axis: 'y', noise: 0.012, seed: 171 });
  const disc = S.spindle({ len: 0.05, r: 0.13, sx: 1.12, sy: 1.0, p: 1, radial: 22, rings: 8 });
  const dp = disc.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i), y = dp.getY(i);
    dp.setY(i, y + (y > 0 ? -0.024 * S.bump(x, 0, 0.04) : -0.016 * (1 - S.sstep(0, 0.04, Math.abs(x)))));
  }
  S.smooth(disc);
  S.paint(disc, { from: MASK_LO, to: MASK, axis: 'y', noise: 0.01 });
  S.overlay(disc, SHADOW, (x, y, z) => S.sstep(0.105, 0.135, Math.hypot(x / 1.12, y)) * 0.85);
  S.pose(disc, S.surface(headGeo, S.dirYP(0, -0.05), { inset: 0.016 }));
  const brows = [1, -1].map((sd) => S.paint(S.groove(disc, [[sd * 0.1, 0.5], [sd * 0.4, 0.46], [sd * 0.72, 0.3]], { from: [0, 0, -0.05], radius: 0.01, lift: 0.002 }), SHADOW));
  const beak = S.taper(0.045, 0.02, { r1: 0.004, curve: 0.5, radial: 7, rings: 5 });
  beak.rotateX(Math.PI - 0.35);
  S.paint(beak, BEAK);
  const bk = S.surface(disc, S.dirYP(0, -0.2), { inset: 0.004 });
  S.pose(beak, [bk[0], bk[1] + 0.03, bk[2]]);
  const tufts = [1, -1].map((sd) => {
    const g = S.taper(0.13, 0.03, { r1: 0.004, curve: -0.45, radial: 7, rings: 6, sx: 1.5, sz: 0.55 });
    S.paint(g, { from: DUSK, to: SHADOW, axis: 'y' });
    return S.pose(g, S.surface(headGeo, S.dirYP(sd * 0.6, 0.85), { inset: 0.016 }), [-0.25, 0, -sd * 0.5]);
  });
  const head = S.bake([headGeo, disc, ...brows, beak, ...tufts], plume, 'head');
  kit.at(body, head, 0, 0.26, 0.06, { rz: 0.08 });
  const eyeOpts = { irisColor: 0xe8a83a, pupilColor: 0x120e18, scleraColor: 0x18141c, skinColor: 0x4a3f6e, glintSize: 0.016, irisScale: 1.15 };
  const eyeL = S.seatEye(kit, head, disc, 0.046, 0.34, 0.1, eyeOpts, { sink: 0.4, front: 0.75 });
  const eyeR = S.seatEye(kit, head, disc, 0.046, -0.34, 0.1, eyeOpts, { sink: 0.4, front: 0.75 });

  // --- Wings: real feather VOLUMES folded along the flanks. ---------------
  const wingParts = [1, -1].map((side) => {
    const w = S.softWing(0.34, plume, { side, width: 0.2, thick: 0.34, down: 0.95, spread: 0.3, color: { from: SHADOW, to: DUSK }, tips: SHADOW, feathers: 4 });
    const p = S.surface(bodyGeo, S.dirYP(side * 1.3, 0.45), { inset: 0.03 });
    kit.at(body, w, p[0], p[1], p[2]);
    return w;
  });

  // --- Talons. ---------------------------------------------------------------
  const legs = [[0.06, -0.19, 0.04], [-0.06, -0.19, 0.04]].map(([x, y, z]) => {
    const l = S.softLeg(0.1, plume, { thighR: 0.04, shinR: 0.02, pawR: 0.03, pawLen: 1.5, pawH: 0.02, toes: 3, color: DUSK, shinColor: 0x5a4e78, pawColor: TALON, radial: 7 });
    kit.at(body, l, x, y, z);
    return l;
  });

  const shadowWisps = kit.mote(6, { color: 0x3a3060, size: 0.03, radius: 0.28, height: 0.3, speed: 0.25, seed: 172 });
  kit.at(body, shadowWisps, 0, 0.05, -0.1);
  const spark = kit.heartspark(0.028, pal.eye, { seed: 171 });
  const sp = S.surface(bodyGeo, S.dirYP(0, 0.0), { inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.22, 0.36));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      wings: wingParts.map((w) => w.bones),
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [],
      fx: [shadowWisps, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'fly',
      breathAmp: 0.75,
      blinkEvery: 4.8,
    },
  };
}
