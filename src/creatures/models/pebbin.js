// =============================================================================
// PEBBIN — Terra, stage 1 wild (Dawnmeadow & Brighthollow outskirts).
// "Toddler pebble-golem, moss cap, one loose stone orbiting it. Stoic, tips
// over." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized): river-smooth pebbles, not facets. A plump
// base pebble for a body, a big round head-pebble perched a little crooked
// on top (the toddler wobble), a soft cushion of moss with a sprout and a
// tiny flower for a cap, a stoic flat mouth under heavy brows, two little
// pebble hands and stubby pebble feet. Its one loose stone orbits it (fx).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const STONE_LO = 0x5f5d58, STONE_HI = 0xbab5a8, MOSS_LO = 0x3f6a34, MOSS_HI = 0x86b85e, DARK = 0x2e2a24;

// The one loose stone drifting in a slow, low orbit — { group, update } fx.
function orbitingStone(material, { radius = 0.17, height = 0.06, speed = 0.6, seed = 7, size = 0.034 } = {}) {
  const group = new THREE.Group(); group.name = 'orbitStone';
  const g = S.pebble(size, { sx: 1.2, sy: 0.85, seed: 5, noise: 0.14, radial: 10, rings: 7 });
  S.paint(g, { from: 0x5e574b, to: 0x9a917f, axis: 'y', noise: 0.02 });
  const stone = new THREE.Mesh(g, material);
  stone.name = 'looseStone';
  group.add(stone);
  const phase = (seed * 12.9898) % (Math.PI * 2);
  let t = 0;
  function update(dt) {
    t += dt;
    const ang = phase + t * speed;
    stone.position.set(Math.cos(ang) * radius, height * 0.5 + Math.sin(t * speed * 1.7) * height * 0.5, Math.sin(ang) * radius);
    stone.rotation.set(t * 0.6, t * 0.9, t * 0.4);
  }
  update(0);
  return { group, update };
}

export function build_pebbin(kit = kitDefault) {
  const pal = kit.palette(['terra']);
  const stoneMat = S.vcMat(kit, { rough: 0.82 });

  const root = new THREE.Group();

  // --- Body: a plump base pebble, sitting heavy. --------------------------
  const bodyGeo = S.pebble(0.15, { sx: 1.12, sy: 0.9, sz: 1.04, seed: 9, noise: 0.07, flat: 0.25, radial: 18, rings: 13 });
  S.paint(bodyGeo, { from: STONE_LO, to: STONE_HI, axis: 'y', exp: 0.9, noise: 0.045, seed: 90 });
  // warm banding + lichen freckles: a river pebble, not clay
  S.overlay(bodyGeo, 0xa89a82, (x, y, z) => S.bump(y + x * 0.25, -0.02, 0.03) * 0.5);
  for (const [x, y, z, r] of [[0.1, 0.05, 0.08, 0.035], [-0.12, -0.02, 0.02, 0.03], [0.02, 0.09, -0.1, 0.04], [0.13, -0.04, -0.06, 0.028]]) S.blush(bodyGeo, [x, y, z], r, 0xc7c47c, 0.6);
  const body = S.bake([bodyGeo], stoneMat, 'body');
  root.add(body);
  body.position.y = 0.15;

  // --- Head: a big round pebble, cocked a little crooked. ------------------
  const headGeo = S.pebble(0.108, { sx: 1.12, sy: 0.92, sz: 1.0, seed: 92, noise: 0.06, radial: 18, rings: 13 });
  S.paint(headGeo, { from: 0x74716a, to: 0xc6c0b2, axis: 'y', noise: 0.035, seed: 92 });
  // stoic face: flat little mouth, heavy level brows
  const mouth = S.paint(S.groove(headGeo, [[-0.22, -0.3], [0, -0.33], [0.22, -0.3]], { radius: 0.0055, lift: -0.001 }), DARK);
  const brows = [1, -1].map((s) => S.paint(S.groove(headGeo, [[s * 0.2, 0.44], [s * 0.42, 0.46], [s * 0.62, 0.4]], { radius: 0.0085, lift: 0.002 }), 0x5a5246));
  // soft moss cushion cap + a sprout and a tiny flower
  const moss = S.puff(0.062, { count: 6, spread: 0.75, seed: 93, sy: 0.55, blend: 0.8, flat: 0.5 });
  S.paint(moss, { from: MOSS_LO, to: MOSS_HI, axis: 'y', noise: 0.03, seed: 93 });
  const capAt = S.surface(headGeo, S.dirYP(0.1, 1.2), { inset: 0.018 });
  S.pose(moss, capAt, [0.12, 0, -0.1], [1.25, 1, 1.15]);
  const sprout = S.taper(0.05, 0.005, { r1: 0.002, curve: 0.3, radial: 5, rings: 4 });
  S.paint(sprout, 0x5f9a3e);
  S.pose(sprout, [capAt[0] + 0.01, capAt[1] + 0.025, capAt[2]], [0, 0, -0.35]);
  const leaves = [1, -1].map((s) => {
    const g = S.spindle({ len: 0.03, r: 0.008, sx: 1.6, sy: 0.35, radial: 7, rings: 5 });
    S.paint(g, 0x8fcb5c);
    return S.pose(g, [capAt[0] + 0.012 + s * 0.012, capAt[1] + 0.05, capAt[2]], [0, s * 1.2, s * 0.5]);
  });
  const flower = S.ball(0.011, { sy: 0.7, radial: 7, rings: 5 });
  S.paint(flower, 0xffe07a);
  S.pose(flower, [capAt[0] - 0.035, capAt[1] + 0.02, capAt[2] + 0.02]);
  const head = S.bake([headGeo, mouth, ...brows, moss, sprout, ...leaves, flower], stoneMat, 'head');
  kit.at(body, head, 0.012, 0.16, 0.012, { rz: 0.1, rx: 0.04 });

  const eyeOpts = { irisColor: 0x4a3a28, skinColor: 0x8a8378, glintSize: 0.012 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.03, 0.4, 0.08, eyeOpts, { sink: 0.4, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.03, -0.4, 0.08, eyeOpts, { sink: 0.4, front: 0.55 });

  // Two little pebble hands (accents — they sway).
  const hands = [1, -1].map((s) => {
    const g = S.pebble(0.045, { sx: 0.8, sy: 1.15, sz: 0.9, seed: 20 + s, noise: 0.08, radial: 12, rings: 9 });
    S.paint(g, { from: STONE_LO, to: 0xa89e8b, axis: 'y', noise: 0.03 });
    const m = new THREE.Mesh(g, stoneMat);
    m.name = 'hand';
    const p = S.surface(bodyGeo, S.dirYP(s * 1.45, 0.05), { inset: 0.012 });
    kit.at(body, m, p[0], p[1] - 0.01, p[2] + 0.01, { rz: s * 0.3 });
    return m;
  });

  // Stubby pebble feet.
  const legs = [[0.072, -0.07, 0.03], [-0.072, -0.07, 0.03]].map(([x, y, z]) => {
    const l = S.softLeg(0.08, stoneMat, { stubby: true, thighR: 0.045, kneeR: 0.04, pawR: 0.05, pawLen: 1.2, toes: 0, color: 0x8a8272, pawColor: 0x7a7264, radial: 10 });
    kit.at(body, l, x, y, z, { rz: Math.sign(x) * 0.12 });
    return l;
  });

  const stoneOrbit = orbitingStone(stoneMat, { radius: 0.2, height: 0.06, speed: 0.6, seed: 7, size: 0.034 });
  kit.at(body, stoneOrbit, 0, 0.1, 0);

  const spark = kit.heartspark(0.02, pal.eye, { seed: 93 });
  const sp = S.surface(bodyGeo, S.dirYP(0, 0.18), { inset: 0.012 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.22, 0.4));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: hands,
      fx: [stoneOrbit, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'hop',
      breathAmp: 0.75,
      blinkEvery: 4.4,
    },
  };
}
