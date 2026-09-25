// =============================================================================
// CAIRNOX — Terra, stage 2 (Pebbin awakens at L20).
// "Walking cairn of balanced stones, moss shoulders, glowing keystone heart.
// Patient." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). Pebbin's two pebbles grow into a proper
// cairn of smooth, weathered stones balanced a little off-true, each able to
// sway on its own (accents) like a stack that never quite topples. It stands
// on four stout legs built from STACKED stones — a rounded thigh stone, a
// knee stone and a wide flat foot stone, splayed for stability — instead of
// v1's pillars. Soft moss cushions spill over the shoulders with grass and a
// few flowers, and the keystone heart is a faceted amber gem (genuinely
// crystalline, so it keeps its facets) glowing out of the chest stone.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const ST_LO = 0x5a5244, ST_HI = 0xaaa08c, MOSS_LO = 0x3b6632, MOSS_HI = 0x82b65a, AMBER = 0xffb85c;

// A cairn leg: a big rounded thigh stone and a wide flat foot stone.
// Same { group, hip, knee, foot } contract as kit.leg().
function stoneLeg(len, material, { r = 0.07, footR = 0.085, seed = 1 } = {}) {
  const hip = new THREE.Group(); hip.name = 'legHip';
  const knee = new THREE.Group(); knee.name = 'legKnee';
  hip.add(knee);
  const tl = len * 0.78;
  const tg = S.pebble(r, { sx: 1.06, sy: tl / (2 * r), sz: 1.0, seed, noise: 0.06, radial: 12, rings: 10 });
  tg.translate(0, -tl * 0.44, 0);
  S.paint(tg, { from: 0x625a4b, to: 0xa0968a, axis: 'y', noise: 0.035, seed });
  const thigh = new THREE.Mesh(tg, material); thigh.name = 'legThigh';
  hip.add(thigh);
  knee.position.set(0, -len * 0.7, 0);
  const fg = S.pebble(footR, { sx: 1.1, sy: 0.6, sz: 1.3, seed: seed + 7, noise: 0.06, flat: 0.55, radial: 12, rings: 8 });
  fg.computeBoundingBox();
  fg.translate(0, -len * 0.3 - fg.boundingBox.min.y, footR * 0.25);
  S.paint(fg, { from: 0x4b453a, to: 0x8a8070, axis: 'y', noise: 0.035, seed: seed + 7 });
  const foot = new THREE.Mesh(fg, material); foot.name = 'legFoot';
  knee.add(foot);
  return { group: hip, hip, knee, foot };
}

export function build_cairnox(kit = kitDefault) {
  const pal = kit.palette(['terra']);
  const stone = S.vcMat(kit, { rough: 0.84 });
  const gem = kit.mat(AMBER, { flat: true, rough: 0.2, metal: 0.1, emissive: 0xff9a2e, emissiveIntensity: 1.1 });

  const root = new THREE.Group();

  // --- Base stone (body) with moss shoulders -------------------------------
  const baseGeo = S.pebble(0.25, { sx: 1.18, sy: 0.78, sz: 1.08, seed: 100, noise: 0.07, flat: 0.2, radial: 20, rings: 14 });
  S.paint(baseGeo, { from: ST_LO, to: ST_HI, axis: 'y', exp: 0.9, noise: 0.03, seed: 100 });
  for (const [x, y, z, r] of [[0.2, 0.02, 0.14, 0.05], [-0.18, 0.06, -0.12, 0.06], [0.05, -0.05, 0.24, 0.04]]) S.blush(baseGeo, [x, y, z], r, 0xcfc585, 0.5);
  const mossPieces = [];
  for (const s of [1, -1]) {
    const m = S.puff(0.1, { count: 6, spread: 0.8, seed: 103 + s, sy: 0.5, blend: 0.8, flat: 0.5 });
    const at = S.surface(baseGeo, S.dirYP(s * 0.95, 0.75), { inset: 0.03 });
    S.pose(m, at, [0.1, 0, -s * 0.35], [1.2, 1, 1.1]);
    S.paint(m, { from: MOSS_LO, to: MOSS_HI, axis: 'y', noise: 0.03, seed: 104 + s });
    mossPieces.push(m);
    // grass sprigs + a flower in each moss cushion
    for (let i = 0; i < 4; i++) {
      const g = S.taper(0.07 + i * 0.012, 0.007, { r1: 0.0015, curve: (i % 2 ? 0.4 : -0.3), radial: 4, rings: 4, sx: 1.6, sz: 0.5 });
      S.paint(g, { from: 0x4f8a3a, to: 0x9fd46e, axis: 'y' });
      S.pose(g, [at[0] + (i - 1.5) * 0.028 * s, at[1] + 0.02, at[2] + (i % 2 ? 0.03 : -0.02)], [0, i * 0.8, s * (0.2 + i * 0.12)]);
      mossPieces.push(g);
    }
    const fl = S.ball(0.016, { sy: 0.7, radial: 7, rings: 5 });
    S.paint(fl, s > 0 ? 0xffe07a : 0xf2a6c8);
    S.pose(fl, [at[0] - s * 0.04, at[1] + 0.04, at[2] + 0.05]);
    mossPieces.push(fl);
  }
  const body = S.bake([baseGeo, ...mossPieces], stone, 'body');
  root.add(body);
  body.position.y = 0.36;

  // --- Balanced stones (each sways a little on its own) -------------------
  const s2Geo = S.pebble(0.18, { sx: 1.1, sy: 0.82, sz: 1.0, seed: 101, noise: 0.08, radial: 18, rings: 12 });
  S.paint(s2Geo, { from: 0x4d463a, to: 0x948a76, axis: 'y', noise: 0.03, seed: 101 });
  const stone2 = S.bake([s2Geo], stone, 'stone2');
  kit.at(body, stone2, 0.02, 0.22, 0.08, { rz: -0.06, rx: 0.08 });
  const s3Geo = S.pebble(0.125, { sx: 1.05, sy: 0.85, sz: 0.98, seed: 102, noise: 0.09, radial: 16, rings: 11 });
  S.paint(s3Geo, { from: 0x443e33, to: 0x837966, axis: 'y', noise: 0.03, seed: 102 });
  const stone3 = S.bake([s3Geo], stone, 'stone3');
  kit.at(stone2, stone3, -0.025, 0.15, 0.075, { rz: 0.09, rx: 0.06 });

  // --- Head stone with a mossy brow and glowing amber eyes ----------------
  const headGeo = S.pebble(0.112, { sx: 1.1, sy: 0.88, sz: 1.02, seed: 105, noise: 0.06, radial: 16, rings: 12 });
  S.paint(headGeo, { from: 0x5e564a, to: 0xa39985, axis: 'y', noise: 0.025, seed: 107 });
  const browMoss = S.puff(0.05, { count: 5, spread: 0.9, seed: 108, sy: 0.45, blend: 0.8, flat: 0.5 });
  S.pose(browMoss, S.surface(headGeo, S.dirYP(0, 1.0), { inset: 0.02 }), [0.35, 0, 0], [1.6, 1, 1.0]);
  S.paint(browMoss, { from: MOSS_LO, to: MOSS_HI, axis: 'y', noise: 0.03 });
  const mouth = S.paint(S.groove(headGeo, [[-0.25, -0.34], [0, -0.38], [0.25, -0.34]], { radius: 0.005, lift: -0.001 }), 0x2a251e);
  const head = S.bake([headGeo, browMoss, mouth], stone, 'head');
  kit.at(stone3, head, 0.005, 0.1, 0.1, { rx: 0.1 });
  const eyeOpts = { irisColor: AMBER, scleraColor: 0x2a241c, skinColor: 0x847a6c, glintSize: 0.012, irisScale: 1.08 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.037, 0.42, 0.06, eyeOpts, { sink: 0.45, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.037, -0.42, 0.06, eyeOpts, { sink: 0.45, front: 0.55 });

  // --- The glowing keystone heart, set into the chest stone ---------------
  const ks = S.surface(s2Geo, S.dirYP(0, -0.1), { inset: 0.03 });
  const keystone = kit.crystal(0.058, gem, { coreColor: 0xfff2c0 });
  keystone.name = 'keystone';
  keystone.scale.set(1, 1.25, 0.7);
  kit.at(stone2, keystone, ks[0], ks[1], ks[2] + 0.005, { rz: 0.4 });
  const spark = kit.heartspark(0.05, AMBER, { seed: 106 });
  kit.at(stone2, spark, ks[0], ks[1], ks[2] + 0.02);
  const halo = S.glow(AMBER, 0.3, 0.55);
  halo.name = 'keystoneHalo';
  kit.at(stone2, halo, ks[0], ks[1], ks[2] + 0.03);
  const glowOrbit = kit.mote(3, { color: pal.eye, size: 0.02, radius: 0.16, height: 0.08, speed: 0.4, seed: 107 });
  kit.at(stone2, glowOrbit, ks[0], ks[1] - 0.02, ks[2]);

  // --- Four stout stacked-stone legs, splayed for a patient stance --------
  const legDefs = [
    [0.19, -0.08, 0.15, 1, 0], [-0.19, -0.08, 0.15, -1, 1],
    [0.19, -0.08, -0.14, 1, 2], [-0.19, -0.08, -0.14, -1, 3],
  ];
  const legs = legDefs.map(([x, y, z, s, i]) => {
    const l = stoneLeg(0.36 + y, stone, { r: 0.075, footR: 0.085, seed: 110 + i * 11 });
    kit.at(body, l, x, y, z, { rz: s * 0.12 });
    return l;
  });

  root.add(kit.shadowDisc(0.46, 0.42));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [stone2, stone3],
      fx: [spark, glowOrbit, S.variantFx(root)],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'quad',
      breathAmp: 0.65,
      blinkEvery: 5.0,
    },
  };
}
