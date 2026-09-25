// =============================================================================
// FUNGORE — Bloom/Venom, stage 2 (Myclet awakens at L20).
// "Shroom-bear, shelf-fungus armor, spore breath. Sleepy juggernaut."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). Myclet's mischief settled into a huge,
// slow, gentle bear: a round mossy barrel with a hunched back and heavy
// shoulders on four thick legs with big soft paws, a broad low head with a
// pale muzzle, small round ears and heavy-lidded sleepy eyes. The signature:
// SHELF-FUNGUS ARMOR — tiers of real bracket fungi jutting out of its back,
// shoulders and haunches (tan tops with growth rings and a cream rim, plum
// gills underneath), plus two little Myclet caps sprouting on its crown.
// Spores drift from its mouth when it breathes.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const FUR_LO = 0x2f3d1c, FUR = 0x4f6334, FUR_HI = 0x7a8f4e, MUZZLE = 0xb8b48a, SHELF = 0xd6c092, BAND = 0x9a7c52, RIM = 0xf4e8cc, GILL = 0x8a4a8a, PAW = 0x2a2418;

const BAND_C = new THREE.Color(BAND), RIM_C = new THREE.Color(RIM);

// A bracket fungus: a half disc sticking out along +Z (cut face on z = 0),
// domed top with growth rings, a cream rolled rim, plum gills underneath.
function shelfGeo(r, h) {
  const pts = [[0.001, -0.25 * h], [0.5 * r, -0.2 * h], [0.9 * r, -0.08 * h], [1.0 * r, 0.1 * h], [0.9 * r, 0.42 * h], [0.6 * r, 0.8 * h], [0.001, h]];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 10, -Math.PI / 2, Math.PI);
  g.deleteAttribute('uv');
  S.smooth(g);
  S.paint(g, SHELF);
  const col = g.attributes.color, pos = g.attributes.position, c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const d = Math.hypot(x, z) / r;
    if (y < -0.05 * h) c.setHex(S.mixHex(GILL, 0x5a3050, S.clamp01(1 - d)));
    else {
      c.setHex(S.mixHex(0xb89a6a, SHELF, d));
      c.lerp(BAND_C, 0.55 * Math.pow(Math.abs(Math.sin(d * Math.PI * 2.5)), 6));
      c.lerp(RIM_C, S.sstep(0.82, 0.97, d));
    }
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return g;
}

// Myclet's cap, small: dome + rim, spotted.
function miniCap(r, h) {
  const pts = [[0.001, 0.1 * h], [0.4 * r, 0.06 * h], [0.95 * r, 0.02 * h], [1.0 * r, 0.25 * h], [0.7 * r, 0.8 * h], [0.001, h]];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 10);
  g.deleteAttribute('uv');
  S.smooth(g);
  S.paint(g, { from: 0x6a2a50, to: 0xd0607e, axis: 'y' });
  const stem = S.taper(h * 0.9, r * 0.35, { r1: r * 0.3, radial: 6, rings: 3, capSeg: 1 });
  stem.translate(0, -h * 0.75, 0);
  S.paint(stem, 0xf2e2cc);
  return S.merge([g, stem]);
}

export function build_fungore(kit = kitDefault) {
  const pal = kit.palette(['bloom', 'venom']);
  const fur = S.vcMat(kit, { rough: 0.74 });

  const root = new THREE.Group();

  // --- Body: a hunched mossy barrel. -------------------------------------------------
  const torso = S.spindle({
    len: 0.62, r: 0.25, sx: 1.08, sy: 0.96, p: 0.95, radial: 18, rings: 12, belly: 0.12,
    profile: (t) => 0.84 + 0.1 * S.bump(t, 0.3, 0.3) + 0.14 * S.bump(t, 0.68, 0.3),
    arch: (t) => 0.05 * S.bump(t, 0.62, 0.3),
  });
  S.paint(torso, { from: FUR_LO, to: FUR_HI, axis: 'y', noise: 0.02, seed: 130 });
  S.overlay(torso, 0x8a9a64, (x, y, z) => S.sstep(-0.08, -0.2, y) * 0.5);
  // shelf-fungus armor, baked into the body
  // (spine tiers face backward like overlapping plates; flank shelves face out)
  const shelves = [];
  for (const [yaw, pitch, z, r, face] of [
    [0.0, 1.35, 0.16, 0.12, Math.PI], [0.0, 1.3, -0.03, 0.14, Math.PI], [0.0, 1.2, -0.21, 0.13, Math.PI],
    [1.0, 0.75, 0.12, 0.12, null], [-1.0, 0.75, 0.08, 0.12, null], [1.05, 0.55, -0.18, 0.1, null], [-1.1, 0.6, -0.15, 0.11, null],
  ]) {
    const g = shelfGeo(r, r * 0.42);
    const n = S.dirYP(yaw, pitch);
    g.rotateX(-0.25); // outer edge tips up a little
    g.rotateY(face ?? Math.atan2(n[0], n[2]));
    const at = S.surface(torso, n, { from: [0, 0, z], inset: r * 0.3 });
    shelves.push(S.pose(g, at));
  }
  const body = S.bake([torso, ...shelves], fur, 'body');
  root.add(body);
  body.position.y = 0.4;

  // --- Head: broad and low, pale muzzle, sleepy eyes, two little caps. -------------
  const headGeo = S.ball(0.15, { sx: 1.1, sy: 0.9, sz: 0.98, radial: 18, rings: 12 });
  S.paint(headGeo, { from: FUR_LO, to: FUR_HI, axis: 'y', noise: 0.015, seed: 131 });
  const muzzle = S.ball(0.08, { sx: 1.15, sy: 0.72, sz: 0.9, radial: 12, rings: 8 });
  S.paint(muzzle, MUZZLE);
  const mz = S.surface(headGeo, S.dirYP(0, -0.35), { inset: 0.045 });
  muzzle.translate(mz[0], mz[1], mz[2]);
  const nose = S.pose(S.paint(S.ball(0.024, { sx: 1.4, sy: 0.8, radial: 8, rings: 5 }), 0x2a2018), S.surface(muzzle, [0, 0.5, 1], { from: mz, inset: 0.01 }));
  const brows = [1, -1].map((sd) => S.paint(S.groove(headGeo, [[sd * 0.25, 0.42], [sd * 0.5, 0.4], [sd * 0.72, 0.28]], { radius: 0.012, lift: 0.002 }), FUR_LO));
  const caps = [[0.35, 1.15, 0.045, 0.05, -0.3], [-0.2, 1.3, 0.032, 0.038, 0.25]].map(([yaw, pitch, r, h, tilt]) => {
    const g = miniCap(r, h);
    g.rotateZ(tilt);
    return S.pose(g, S.surface(headGeo, S.dirYP(yaw, pitch), { inset: 0.005 }), null);
  });
  const head = S.bake([headGeo, muzzle, nose, ...brows, ...caps], fur, 'head');
  kit.at(body, head, 0, 0.1, 0.34, { rx: 0.12 });
  // jaw: a soft lower lip under the muzzle (the animator works it gently)
  const jawGeo = S.ball(0.06, { sx: 1.1, sy: 0.5, sz: 0.85, radial: 10, rings: 6 });
  S.paint(jawGeo, 0x9a9672);
  const jaw = new THREE.Mesh(jawGeo, fur);
  jaw.name = 'jaw';
  kit.at(head, jaw, mz[0], mz[1] - 0.045, mz[2] - 0.01);
  // sleepy eyes: a static heavy upper lid over each eye (the blink lid still works)
  const eyeOpts = { irisColor: 0x2a1e12, skinColor: 0x4f6334, glintSize: 0.013 };
  const eyes = [0.5, -0.5].map((yaw) => {
    const e = S.seatEye(kit, head, headGeo, 0.038, yaw, 0.18, eyeOpts, { sink: 0.4, front: 0.5 });
    const lg = new THREE.SphereGeometry(0.038 * 1.1, 14, 6, 0, Math.PI * 2, 0, 1.25);
    lg.deleteAttribute('uv');
    lg.rotateX(0.55);
    S.paint(lg, FUR);
    const lid = new THREE.Mesh(lg, fur);
    lid.name = 'sleepyLid';
    e.add(lid);
    return e;
  });
  const mkEar = () => new THREE.Mesh(S.ear(0.07, 0.075, { color: FUR, inner: 0x8a7a5a, tip: 0.5, cup: 0.4, depth: 0.4, radial: 8, rings: 6 }), fur);
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.95, 0.7), { inset: 0.012 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.01, { rz: -0.6, ry: 0.3 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.01, { rz: 0.6, ry: -0.3 });

  // --- Four thick legs, big soft paws. ------------------------------------------------
  const legs = [[0.16, -0.12, 0.19, -0.05, 0.1], [-0.16, -0.12, 0.19, -0.05, 0.1], [0.16, -0.1, -0.19, 0.2, 0.115], [-0.16, -0.1, -0.19, 0.2, 0.115]].map(([x, y, z, bend, thighR]) => {
    const l = S.softLeg(0.4 + y, fur, { thighR, shinR: 0.07, kneeR: 0.075, ankleR: 0.062, pawR: 0.085, pawLen: 1.15, toes: 3, bend, split: 0.5, bulge: 0.3, color: FUR, shinColor: FUR_LO, pawColor: PAW, radial: 9 });
    kit.at(body, l, x, y, z);
    return l;
  });

  // --- A little stub tail. ------------------------------------------------------------
  const tail = S.softTail(2, fur, { segLen: 0.04, startR: 0.04, endR: 0.03, curl: 0.4, radial: 8, color: FUR });
  const tp = S.surface(torso, [0, 0.35, -1], { inset: 0.02 });
  kit.at(body, tail, tp[0], tp[1], tp[2]);

  // Spore breath: slow purple-green motes from the mouth.
  const breath = kit.mote(6, { color: pal.secondary, size: 0.022, radius: 0.06, height: 0.12, speed: 0.35, seed: 132 });
  kit.at(jaw, breath, 0, 0.0, 0.06);
  const spark = kit.heartspark(0.04, pal.eye, { seed: 133 });
  const sp = S.surface(torso, S.dirYP(0, -0.2), { from: [0, 0, 0.18], inset: 0.02 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.46, 0.42));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      jaw,
      eyelids: eyes.map((e) => e.getObjectByName('eyelid')),
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR],
      fx: [breath, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'sleepy',
      locomotion: 'quad',
      breathAmp: 1.2,
      blinkEvery: 5.5,
    },
  };
}
