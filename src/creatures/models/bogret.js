// =============================================================================
// BOGRET — Tide/Terra, stage 1 (single-stage), uncommon.
// "Grumpy stone-backed toad, wears its boulder like a hat. Territorial."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). A squat, wide, wet-skinned bog toad: one
// low smooth body with big folded haunches, a broad flat head with a
// cream throat, and the GRUMP — a wide down-turned mouth line and two
// bulging golden eyes under heavy lids slanted into a permanent scowl.
// Soft warts speckle the back. On top sits the boulder: a smooth river
// stone with a mossy cap and a couple of pebbles, perched slightly askew
// like a hat it refuses to take off. Four stubby legs (forelegs braced
// wide, long webbed hind feet); `hints.locomotion: 'hop'` forces the toad
// gait. Static pieces per node are one vertex-coloured mesh (./soft.js).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const SKIN_LO = 0x2e4428, SKIN = 0x4f7a3c, SKIN_HI = 0x86ac5a, THROAT = 0xe2dca2, WART = 0x3a5a2c, WART_HI = 0x9ab868,
  LIP = 0x1e2c18, FOOT = 0x9cb468, STONE_LO = 0x5a5448, STONE_HI = 0xb4ac98, MOSS_LO = 0x3e6a2c, MOSS_HI = 0x8cbc58;

export function build_bogret(kit = kitDefault) {
  const pal = kit.palette(['tide', 'terra']);
  const skin = S.vcMat(kit, { rough: 0.42 });
  const stone = S.vcMat(kit, { rough: 0.9 });

  const root = new THREE.Group();

  // --- Body: low and wide, flat belly, big folded haunches, warts. ---------
  const bodyGeo = S.spindle({
    len: 0.4, r: 0.17, sx: 1.22, sy: 0.74, p: 0.95, radial: 20, rings: 14, belly: 0.42,
    profile: (t) => 0.86 + 0.14 * S.bump(t, 0.58, 0.4),
    arch: (t) => 0.035 * S.sstep(0.3, 1, t),
  });
  S.paint(bodyGeo, { from: SKIN_LO, to: SKIN_HI, axis: 'y', exp: 0.8, noise: 0.015, seed: 95 });
  S.overlay(bodyGeo, THROAT, (x, y, z) => S.sstep(-0.03, -0.08, y) * S.sstep(0.0, 0.12, z) * 0.9);
  const haunches = [1, -1].map((s) => {
    const g = S.ball(0.088, { sx: 0.85, sy: 0.78, sz: 1.25, radial: 14, rings: 10 });
    S.paint(g, { from: SKIN_LO, to: SKIN_HI, axis: 'y', noise: 0.015, seed: 96 + s });
    return S.pose(g, [s * 0.165, -0.03, -0.085], [0, s * 0.35, 0]);
  });
  const warts = [];
  const wartSpots = [[0.5, 0.95, 0.05, 0.016], [-0.6, 0.9, -0.05, 0.014], [0.95, 0.6, -0.12, 0.013], [-1.0, 0.55, 0.02, 0.015], [0.2, 1.2, -0.12, 0.012], [1.1, 0.35, 0.1, 0.012], [-1.15, 0.4, -0.12, 0.013]];
  for (const [yaw, pitch, z, r] of wartSpots) {
    const p = S.surface(bodyGeo, S.dirYP(yaw, pitch), { from: [0, 0, z], inset: r * 0.45 });
    S.blush(bodyGeo, p, r * 2.4, WART, 0.6);
    warts.push(S.paint(S.pose(S.ball(r, { sy: 0.7, radial: 6, rings: 4 }), p), WART_HI));
  }
  const body = S.bake([bodyGeo, ...haunches, ...warts], skin, 'body');
  root.add(body);
  body.position.y = 0.12;

  // --- Head: broad, flat, cream throat, the down-turned grumpy mouth. ------
  const headGeo = S.spindle({
    len: 0.24, r: 0.14, sx: 1.28, sy: 0.6, p: 0.95, pNose: 1.15, radial: 20, rings: 12, belly: 0.25,
    profile: (t) => 0.9 + 0.1 * S.bump(t, 0.45, 0.4),
  });
  S.paint(headGeo, { from: SKIN_LO, to: SKIN_HI, axis: 'y', noise: 0.012, seed: 97 });
  S.overlay(headGeo, THROAT, (x, y, z) => S.sstep(-0.01, -0.06, y) * 0.95);
  const mouth = S.paint(S.groove(headGeo, [[-0.95, -0.36], [-0.65, -0.2], [-0.32, -0.12], [0, -0.1], [0.32, -0.12], [0.65, -0.2], [0.95, -0.36]], { radius: 0.0075, lift: -0.002, seg: 22 }), LIP);
  const nost = [0.12, -0.12].map((yw) => S.paint(S.pose(S.ball(0.007, { radial: 5, rings: 3 }), S.surface(headGeo, S.dirYP(yw, 0.12), { inset: 0.002 })), LIP));
  // eye mounds high on the head, heavy scowling lids over them
  const mounds = [], lids = [], eyeAt = [];
  const ER = 0.042;
  for (const s of [1, -1]) {
    const mp = S.surface(headGeo, S.dirYP(s * 0.55, 0.8), { from: [0, -0.02, 0.0], inset: 0.03 });
    const m = S.ball(0.055, { sx: 1.0, sy: 0.85, radial: 12, rings: 9 });
    S.paint(m, { from: SKIN, to: SKIN_HI, axis: 'y', noise: 0.012 });
    mounds.push(S.pose(m, mp));
    const e = [mp[0] + s * 0.006, mp[1] + 0.02, mp[2] + 0.024];
    eyeAt.push(e);
    const lid = S.ball(ER * 1.16, { sy: 0.55, sz: 1.0, radial: 12, rings: 7 });
    S.paint(lid, { from: SKIN, to: SKIN_HI, axis: 'y' });
    lids.push(S.pose(lid, [e[0], e[1] + ER * 0.62, e[2] - ER * 0.05], [-0.25, 0, s * 0.42]));
  }
  const head = S.bake([headGeo, mouth, ...nost, ...mounds, ...lids], skin, 'head');
  kit.at(body, head, 0, 0.055, 0.15, { rx: -0.05 });

  const eyeOpts = { irisColor: 0xd8a62a, pupilColor: 0x1a1406, skinColor: SKIN, glintSize: 0.016 };
  const eyes = eyeAt.map((e, k) => {
    const s = k === 0 ? 1 : -1;
    const g = S.eye(kit, ER, eyeOpts);
    g.position.set(e[0], e[1], e[2]);
    g.rotation.set(-0.1, s * 0.35, 0);
    head.add(g);
    return g;
  });

  // --- The boulder hat: a smooth river stone, mossy cap, two pebbles. ------
  const boulderGeo = S.pebble(0.15, { sx: 1.08, sy: 0.78, sz: 1.0, seed: 98, noise: 0.11, radial: 18, rings: 12, flat: 0.25 });
  S.paint(boulderGeo, { from: STONE_LO, to: STONE_HI, axis: 'y', exp: 0.9, noise: 0.03, seed: 98 });
  S.blush(boulderGeo, [0.07, 0.04, 0.09], 0.07, 0x8a8270, 0.5);
  const moss = S.puff(0.065, { count: 6, spread: 0.85, seed: 99, sy: 0.55, flat: 0.6, radial: 8, rings: 5 });
  S.paint(moss, { from: MOSS_LO, to: MOSS_HI, axis: 'y', noise: 0.03, seed: 99 });
  S.pose(moss, S.surface(boulderGeo, [0, 1, 0], { from: [-0.03, 0, -0.02], inset: 0.022 }), [0, 0, 0.1], [1.25, 1, 1.1]);
  const sprout = S.taper(0.05, 0.006, { r1: 0.002, curve: 0.4, radial: 5, rings: 4 });
  S.paint(sprout, { from: MOSS_LO, to: MOSS_HI, axis: 'y' });
  S.pose(sprout, S.surface(boulderGeo, [0, 1, 0], { from: [-0.05, 0, -0.01], inset: -0.012 }), [0, 0.6, -0.25]);
  const pebbles = [[0.11, 0.035, 0.05, 0.03, 3], [-0.1, 0.02, 0.08, 0.022, 4]].map(([x, y, z, r, seed]) => {
    const g = S.pebble(r, { sx: 1.2, sy: 0.75, seed, noise: 0.08, radial: 9, rings: 6 });
    S.paint(g, { from: STONE_LO, to: STONE_HI, axis: 'y', noise: 0.03, seed });
    return S.pose(g, [x, y, z]);
  });
  const boulder = new THREE.Mesh(S.merge([boulderGeo, moss, sprout, ...pebbles]), stone);
  boulder.name = 'boulder';
  const bp = S.surface(bodyGeo, [0, 1, 0], { from: [0.0, 0, -0.04], inset: 0.0 });
  kit.at(body, boulder, bp[0] + 0.01, bp[1] + 0.07, bp[2], { rz: 0.16, ry: 0.4, rx: -0.06 });

  // --- Stubby legs: forelegs braced wide, long webbed hind feet. -----------
  const legDefs = [
    [0.15, -0.03, 0.12, 0.38, 0, 0.045, 0.04, 1.3], [-0.15, -0.03, 0.12, -0.38, 0, 0.045, 0.04, 1.3],
    [0.19, -0.04, -0.06, 0.1, 0.55, 0.05, 0.05, 1.7], [-0.19, -0.04, -0.06, -0.1, -0.55, 0.05, 0.05, 1.7],
  ];
  const legs = legDefs.map(([x, y, z, rz, ry, thighR, pawR, pawLen]) => {
    const l = S.softLeg(0.12 + y, skin, { stubby: true, thighR, kneeR: thighR * 0.75, pawR, pawLen, toes: 4, color: SKIN, shinColor: SKIN, pawColor: FOOT, radial: 8 });
    kit.at(body, l, x, y, z, { rz, ry });
    return l;
  });

  const spark = kit.heartspark(0.028, pal.eye, { seed: 99 });
  const sp = S.surface(headGeo, S.dirYP(0, -0.5), { inset: 0.006 });
  kit.at(head, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.32, 0.4));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: eyes.map((e) => e.getObjectByName('eyelid')),
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [boulder],
      fx: [spark, S.variantFx(root)],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'hop',
      breathAmp: 1.1,
      blinkEvery: 3.2,
    },
  };
}
