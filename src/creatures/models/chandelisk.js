// =============================================================================
// CHANDELISK — Terra/Lumen, stage 2 (Shardling awakens at L25).
// "Chandelier-spider, hanging crystal limbs, prisms scatter rainbow shards."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). Shardling grown into a living chandelier,
// in the same language: a raised, round sandstone hub on six tall arched
// legs (a cut gem at every knee, crystal tips at the feet), a faceted crown
// gem on top, and the signature HANGING ARRAY beneath — a ring of long gem
// drops around the rim and one grand two-tier central drop with a glowing
// heart, every gem a prism of gold, rose, mint, sky and violet facets (flat
// shaded on purpose: cut crystal). A big-eyed face with two small upper
// eyes, crystal fangs, and a slow rainbow scatter of light below.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const STONE_LO = 0x5a4c38, STONE_HI = 0xb8a47c, LEG = 0x4a4034, LEG_HI = 0x8a7a5e, TIP = 0xf8e6b0;
const PRISM = [0xffb020, 0xff5a8a, 0x3fd0a0, 0x4a90ff, 0xffe060, 0xb060ff];

export function build_chandelisk(kit = kitDefault) {
  const pal = kit.palette(['terra', 'lumen']);
  const skin = S.vcMat(kit, { rough: 0.7 });
  const gemMat = kit.mat(0xffffff, { vertexColors: true, flat: true, rough: 0.12, metal: 0.05, transparent: true, opacity: 0.93, emissive: 0x3a2408, emissiveIntensity: 0.45 });
  const coreMat = kit.mat(0xfff0c0, { unlit: true });

  const root = new THREE.Group();

  // --- The hub: a raised round sandstone body. --------------------------------------
  const bodyGeo = S.ball(0.19, { sx: 1.05, sy: 0.74, sz: 1.1, radial: 18, rings: 12 });
  S.paint(bodyGeo, { from: STONE_LO, to: STONE_HI, axis: 'y', noise: 0.025, seed: 62 });
  // a darker rim band where the drops hang from
  S.overlay(bodyGeo, 0x3a3024, (x, y, z) => S.bump(y, -0.06, 0.025) * 0.7);
  const body = S.bake([bodyGeo], skin, 'body');
  root.add(body);
  const H = 0.4;
  body.position.y = H;

  // Crown gem on top (accent: sways).
  const crown = new THREE.Group(); crown.name = 'crown';
  const cg = new THREE.Mesh(S.brilliant(0.045, 0.08, 0.02, PRISM, { seed: 1 }), gemMat);
  cg.rotation.x = Math.PI; // the long point up, table down onto the hub
  cg.position.y = 0.02;
  crown.add(cg);
  kit.at(body, crown, 0, 0.125, -0.02);

  // --- Head: big-eyed, two small upper eyes, crystal fangs. --------------------------
  const headGeo = S.ball(0.085, { sx: 1.08, sy: 0.9, sz: 0.95, radial: 14, rings: 10 });
  S.paint(headGeo, { from: STONE_LO, to: STONE_HI, axis: 'y', noise: 0.015, seed: 63 });
  const fangs = [1, -1].map((sd) => {
    const g = S.taper(0.035, 0.011, { r1: 0.002, curve: 0.5, radial: 5, rings: 4, capSeg: 1 });
    g.rotateX(Math.PI);
    S.paint(g, TIP);
    return S.pose(g, S.surface(headGeo, S.dirYP(sd * 0.3, -0.55), { inset: 0.006 }));
  });
  const head = S.bake([headGeo, ...fangs], skin, 'head');
  const hp = S.surface(bodyGeo, [0, 0.05, 1], { inset: 0.03 });
  kit.at(body, head, hp[0], hp[1], hp[2] + 0.04);
  const eyeOpts = { irisColor: 0x3a2a14, skinColor: 0x8c7c60, glintSize: 0.013 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.032, 0.42, 0.12, eyeOpts, { sink: 0.4, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.032, -0.42, 0.12, eyeOpts, { sink: 0.4, front: 0.55 });
  const smallOpts = { ...eyeOpts, detail: 0.5, microGlint: false };
  const eyeL2 = S.seatEye(kit, head, headGeo, 0.016, 0.28, 0.72, smallOpts, { sink: 0.4, front: 0.55 });
  const eyeR2 = S.seatEye(kit, head, headGeo, 0.016, -0.28, 0.72, smallOpts, { sink: 0.4, front: 0.55 });

  // --- Six tall arched legs, a gem at every knee. ----------------------------------------
  const kneeGem = S.brilliant(0.028, 0.034, 0.014, PRISM, { seed: 3 });
  const legs = [];
  for (const [a, i] of [[0.6, 0], [0.05, 1], [-0.52, 2]]) for (const sd of [1, -1]) {
    const dir = new THREE.Vector3(sd * Math.cos(a), 0, Math.sin(a));
    const hipAt = S.surface(bodyGeo, [dir.x, -0.15, dir.z], { inset: 0.02 });
    const hip = new THREE.Group(); hip.name = 'legHip';
    hip.position.set(...hipAt);
    body.add(hip);
    const K = dir.clone().multiplyScalar(0.15 + 0.015 * (1 - i % 2)).setY(0.12);
    const F = dir.clone().multiplyScalar(0.27).setY(-(H + hipAt[1]));
    const tg = S.limb(K.length(), 0.026, 0.018, { radial: 7, capSeg: 2, shaftSeg: 2 });
    S.paint(tg, { from: LEG, to: LEG_HI, axis: 'y' });
    S.aim(tg, K.clone().negate().toArray());
    const thigh = new THREE.Mesh(tg, skin); thigh.name = 'legThigh';
    hip.add(thigh);
    const knee = new THREE.Group(); knee.name = 'legKnee';
    knee.position.copy(K);
    hip.add(knee);
    const kg = new THREE.Mesh(kneeGem, gemMat); kg.name = 'kneeGem';
    kg.position.y = 0.014;
    knee.add(kg);
    const D = F.clone().sub(K);
    const sg = S.limb(D.length(), 0.018, 0.009, { radial: 7, capSeg: 2, shaftSeg: 3 });
    S.paint(sg, { from: TIP, to: LEG, axis: 'y', lo: -D.length(), hi: -D.length() + 0.05 });
    S.aim(sg, D.clone().negate().toArray());
    const foot = new THREE.Mesh(sg, skin); foot.name = 'legFoot';
    knee.add(foot);
    legs.push({ hip, knee, foot });
  }

  // --- THE HANGING ARRAY: gem drops round the rim + the grand drop. ---------------
  const pendants = [];
  const dropGeoA = S.brilliant(0.036, 0.14, 0.015, PRISM, { seed: 2 });
  const dropGeoB = S.brilliant(0.03, 0.1, 0.012, PRISM, { seed: 5 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    const p = new THREE.Group(); p.name = 'pendant';
    const at = S.surface(bodyGeo, [Math.cos(a), -0.35, Math.sin(a)], { inset: 0.02 });
    kit.at(body, p, at[0], at[1], at[2]);
    const thread = S.paint(S.limb(0.03, 0.004, 0.004, { radial: 6, capSeg: 1, shaftSeg: 2 }), 0xd8b870);
    p.add(new THREE.Mesh(thread, skin));
    const g = new THREE.Mesh(i % 2 ? dropGeoB : dropGeoA, gemMat); g.name = 'drop';
    g.position.y = -0.04;
    p.add(g);
    pendants.push(p);
  }
  const drop = new THREE.Group(); drop.name = 'grandDrop';
  kit.at(body, drop, 0, -0.12, -0.01);
  const t1 = new THREE.Mesh(S.brilliant(0.075, 0.15, 0.035, PRISM, { seed: 4, facets: 10 }), gemMat); t1.name = 'dropTier';
  t1.position.y = -0.03;
  drop.add(t1);
  const t2 = new THREE.Mesh(S.brilliant(0.045, 0.1, 0.02, PRISM, { seed: 6 }), gemMat); t2.name = 'dropTier';
  t2.position.y = -0.23;
  drop.add(t2);
  const heart = new THREE.Mesh(S.ball(0.024, { radial: 8, rings: 6 }), coreMat); heart.name = 'dropHeart';
  heart.position.y = -0.04;
  drop.add(heart);
  const dropGlow = S.glow(0xfff0c0, 0.34, 0.45);
  dropGlow.position.y = -0.07;
  drop.add(dropGlow);

  // Rainbow prism scatter below.
  const spectrum = [0xff6a5c, 0xffb85c, 0xfff08c, 0x8ce08c, 0x7ac6ff, 0xb08cff];
  const scatterFx = spectrum.map((c, i) => {
    const m = kit.mote(2, { color: c, size: 0.016, radius: 0.06, height: 0.05, speed: 0.5 + i * 0.05, seed: 70 + i });
    const a = (i / spectrum.length) * Math.PI * 2;
    kit.at(body, m, Math.cos(a) * 0.2, -0.24, Math.sin(a) * 0.2);
    return m;
  });

  const spark = kit.heartspark(0.022, pal.eye, { seed: 71 });
  kit.at(drop, spark, 0, -0.04, 0);

  const grounded = kit.groundPlant(root);
  const contact = kit.shadowDisc(0.36, 0.32);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body,
      head,
      eyelids: [eyeL, eyeR, eyeL2, eyeR2].map((e) => e.getObjectByName('eyelid')),
      legs,
      accents: [crown, ...pendants, drop],
      fx: [...scatterFx, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.75,
      blinkEvery: 3.6,
    },
  };
}
