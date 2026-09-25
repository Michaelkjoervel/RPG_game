// =============================================================================
// SHARDLING — Terra/Lumen, stage 1, uncommon.
// "Crystal spiderling, translucent gem abdomen refracting light. Collector."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). A chubby little spider built around one
// focal point: a big cut GEM abdomen — a faceted brilliant (flat shaded on
// purpose) whose facets throw back gold, rose, mint and sky light like a
// prism, with a glowing core inside and two small hoard-shards stuck to it.
// The body is a round sandstone thorax with a big-eyed head (two big eyes,
// two small), little crystal fangs, and six slim legs with high arched
// knees — the classic spider silhouette — ending in tiny crystal tips.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const STONE_LO = 0x5e5140, STONE = 0x8c7c60, STONE_HI = 0xc0b08a, LEG = 0x4a4034, LEG_HI = 0x7a6c56, TIP = 0xf8e6b0;
const PRISM = [0xffb020, 0xff5a8a, 0x3fd0a0, 0x4a90ff, 0xffe060, 0xb060ff];

const brilliant = (r, h1, h2, seed = 0) => S.brilliant(r, h1, h2, PRISM, { seed });

export function build_shardling(kit = kitDefault) {
  const pal = kit.palette(['terra', 'lumen']);
  const skin = S.vcMat(kit, { rough: 0.7 });
  const gemMat = kit.mat(0xffffff, { vertexColors: true, flat: true, rough: 0.12, metal: 0.05, transparent: true, opacity: 0.93, emissive: 0x3a2408, emissiveIntensity: 0.4 });
  const coreMat = kit.mat(0xffe6a0, { unlit: true });

  const root = new THREE.Group();

  // --- Thorax: round sandstone body. ---------------------------------------------
  const bodyGeo = S.ball(0.085, { sx: 1.0, sy: 0.82, sz: 1.08, radial: 16, rings: 10 });
  S.paint(bodyGeo, { from: STONE_LO, to: STONE_HI, axis: 'y', noise: 0.02, seed: 60 });
  const body = S.bake([bodyGeo], skin, 'body');
  root.add(body);
  body.position.y = 0.13;

  // --- The GEM abdomen (an accent: it sways gently). ------------------------------
  const abdomen = new THREE.Group(); abdomen.name = 'gemAbdomen';
  const gem = new THREE.Mesh(brilliant(0.1, 0.13, 0.05, 0), gemMat);
  gem.name = 'gem';
  gem.rotation.x = -Math.PI / 2 + 0.35; // table faces back and a little up
  abdomen.add(gem);
  const core = new THREE.Mesh(S.ball(0.04, { radial: 10, rings: 7 }), coreMat);
  core.name = 'gemCore';
  core.position.set(0, 0, -0.02);
  abdomen.add(core);
  const coreGlow = S.glow(0xffd070, 0.32, 0.4);
  coreGlow.position.set(0, 0.01, -0.03);
  abdomen.add(coreGlow);
  for (const [x, y, z, r, rx, rz, seed] of [[0.065, 0.05, -0.05, 0.028, -0.5, -0.6, 2], [-0.06, 0.06, -0.02, 0.022, -0.3, 0.7, 4]]) {
    const shard = new THREE.Mesh(brilliant(r, r * 1.5, r * 0.5, seed), gemMat);
    shard.name = 'hoardShard';
    shard.position.set(x, y, z);
    shard.rotation.set(rx, 0, rz);
    abdomen.add(shard);
  }
  const ab = S.surface(bodyGeo, [0, 0.35, -1], { inset: 0.02 });
  kit.at(body, abdomen, ab[0], ab[1] + 0.02, ab[2] - 0.07);

  // --- Head: big-eyed, little crystal fangs. ---------------------------------------
  const headGeo = S.ball(0.062, { sx: 1.08, sy: 0.9, sz: 0.95, radial: 14, rings: 10 });
  S.paint(headGeo, { from: STONE_LO, to: STONE_HI, axis: 'y', noise: 0.015, seed: 61 });
  const fangs = [1, -1].map((sd) => {
    const g = S.taper(0.028, 0.009, { r1: 0.002, curve: 0.5, radial: 5, rings: 4, capSeg: 1 });
    g.rotateX(Math.PI);
    S.paint(g, TIP);
    return S.pose(g, S.surface(headGeo, S.dirYP(sd * 0.3, -0.55), { inset: 0.006 }));
  });
  const head = S.bake([headGeo, ...fangs], skin, 'head');
  const hp = S.surface(bodyGeo, [0, 0.1, 1], { inset: 0.02 });
  kit.at(body, head, hp[0], hp[1] + 0.01, hp[2] + 0.035);
  const eyeOpts = { irisColor: 0x3a2a14, skinColor: 0x8c7c60, glintSize: 0.012 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.03, 0.42, 0.1, eyeOpts, { sink: 0.4, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.03, -0.42, 0.1, eyeOpts, { sink: 0.4, front: 0.55 });
  const smallOpts = { ...eyeOpts, detail: 0.5, microGlint: false };
  const eyeL2 = S.seatEye(kit, head, headGeo, 0.014, 0.28, 0.72, smallOpts, { sink: 0.4, front: 0.55 });
  const eyeR2 = S.seatEye(kit, head, headGeo, 0.014, -0.28, 0.72, smallOpts, { sink: 0.4, front: 0.55 });

  // --- Six slim legs with high arched knees. -----------------------------------------
  // hip on the thorax side; knee up and out; the foot tip out and down on the
  // ground. hip/knee are real pivots (the animator swings them), foot = shin.
  const H = body.position.y;
  const legs = [];
  for (const [a, i] of [[0.55, 0], [0.05, 1], [-0.5, 2]]) for (const sd of [1, -1]) {
    const dir = new THREE.Vector3(sd * Math.cos(a), 0, Math.sin(a));
    const hipAt = S.surface(bodyGeo, [dir.x, -0.1, dir.z], { inset: 0.012 });
    const hip = new THREE.Group(); hip.name = 'legHip';
    hip.position.set(...hipAt);
    body.add(hip);
    const out = 0.075 + 0.01 * (1 - i % 2), up = 0.085;
    const K = dir.clone().multiplyScalar(out).setY(up);
    const F = dir.clone().multiplyScalar(out + 0.05).setY(-(H + hipAt[1]));
    const tg = S.limb(K.length(), 0.013, 0.01, { radial: 7, capSeg: 2, shaftSeg: 2 });
    S.paint(tg, { from: LEG, to: LEG_HI, axis: 'y' });
    S.aim(tg, K.clone().negate().toArray());
    const thigh = new THREE.Mesh(tg, skin); thigh.name = 'legThigh';
    hip.add(thigh);
    const knee = new THREE.Group(); knee.name = 'legKnee';
    knee.position.copy(K);
    hip.add(knee);
    const D = F.clone().sub(K);
    const sg = S.limb(D.length(), 0.0105, 0.006, { radial: 7, capSeg: 2, shaftSeg: 3 });
    S.paint(sg, { from: TIP, to: LEG, axis: 'y', lo: -D.length(), hi: -D.length() + 0.03 });
    S.aim(sg, D.clone().negate().toArray());
    const foot = new THREE.Mesh(sg, skin); foot.name = 'legFoot';
    knee.add(foot);
    legs.push({ hip, knee, foot });
  }

  const spark = kit.heartspark(0.02, pal.eye, { seed: 61 });
  kit.at(abdomen, spark, 0, 0, 0.02);

  const grounded = kit.groundPlant(root);
  const contact = kit.shadowDisc(0.2, 0.36);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body,
      head,
      eyelids: [eyeL, eyeR, eyeL2, eyeR2].map((e) => e.getObjectByName('eyelid')),
      legs,
      accents: [abdomen],
      fx: [spark, S.variantFx(root)],
    },
    hints: {
      personality: 'skittish',
      locomotion: 'quad',
      breathAmp: 0.8,
      blinkEvery: 2.6,
    },
  };
}
