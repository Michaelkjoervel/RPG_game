// =============================================================================
// KINDLET — Ember, stage 1 starter.
// "Round soot-black salamander pup, candle-flame tail tip that flickers with
// mood. Eager, clumsy." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized): one smooth, chubby bean of a body with a
// fire-bellied-newt underside (soot back, ember-orange throat and belly), a
// big wide salamander head with a clumsy tilt and a wide grin, four stubby
// sprawled legs with round toe-bean paws, and a fat tapering tail that curls
// up over the back into the signature candle flame (a 3D flame that reads
// from every angle). Every static piece on a node is merged into one
// vertex-coloured smooth mesh (see ./soft.js).
//   - kit.palette(aspects) is the GLOW palette (eyes, flame, heartspark), not
//     the skin: the bible is specific ("soot-black").
//   - groundPlant() last; parts/hints feed CreatureAnimator (animator.js).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const SOOT_LO = 0x151011, SOOT_HI = 0x46352e, BELLY = 0xf0782e, BELLY_HI = 0xffa65a, PAW = 0x8a5238, DARK = 0x120b09;

export function build_kindlet(kit = kitDefault) {
  const pal = kit.palette(['ember']);
  const skin = S.vcMat(kit, { rough: 0.6 });
  const emberGlow = kit.mat(pal.primary, { unlit: true, transparent: true, opacity: 0.92 });

  const root = new THREE.Group();

  // --- Body: a round, low bean, fuller at the chest. ---------------------
  const bodyGeo = S.spindle({
    len: 0.44, r: 0.19, sx: 1.1, sy: 0.88, belly: 0.32, p: 0.92, radial: 20, rings: 14,
    profile: (t) => 0.86 + 0.16 * S.bump(t, 0.64, 0.5),
    arch: (t) => 0.02 * Math.sin(Math.PI * t) + 0.03 * S.sstep(0.6, 1, t),
  });
  S.paint(bodyGeo, { from: SOOT_LO, to: SOOT_HI, axis: 'y', exp: 0.85, noise: 0.012, seed: 4 });
  // Fire-bellied newt: ember-orange throat & belly wrapping up the chest.
  S.overlay(bodyGeo, BELLY, (x, y, z) => S.sstep(-0.01, -0.09, y - 0.08 * S.clamp01((z - 0.04) / 0.18)) * (1 - 0.3 * Math.abs(x) / 0.21));
  const body = S.bake([bodyGeo], skin, 'body');
  root.add(body);
  body.position.y = 0.15;

  // Faint ember speckles along the spine — coals under the soot.
  const speckGeo = [];
  for (const [x, z, s] of [[0.035, 0.03, 0.013], [-0.045, -0.06, 0.012], [0.015, -0.14, 0.011], [-0.02, 0.1, 0.01]]) {
    const p = S.surface(bodyGeo, [0, 1, 0], { from: [x, 0, z], inset: s * 0.35 });
    speckGeo.push(S.pose(S.ball(s, { radial: 6, rings: 4 }), p));
  }
  const specks = new THREE.Mesh(S.merge(speckGeo.map((g) => S.paint(g, 0xffffff))), emberGlow);
  specks.name = 'emberSpecks';
  body.add(specks);

  // --- Head: wide, flat-topped salamander head, big and tilted. -----------
  const headGeo = S.spindle({
    len: 0.29, r: 0.155, sx: 1.22, sy: 0.82, p: 0.95, radial: 20, rings: 14, belly: 0.1,
    profile: (t) => 0.9 + 0.12 * S.bump(t, 0.42, 0.5),
  });
  S.paint(headGeo, { from: 0x2c1f19, to: 0x59402f, axis: 'y', noise: 0.01, seed: 5 });
  // warm chin wrapping under the grin
  S.overlay(headGeo, BELLY_HI, (x, y, z) => S.sstep(-0.045, -0.11, y) * S.sstep(-0.02, 0.1, z));
  // A wide salamander grin that follows the snout, and two nostril dots.
  const grin = S.groove(headGeo, [[-0.62, -0.3], [-0.36, -0.42], [0, -0.47], [0.36, -0.42], [0.62, -0.3]], { radius: 0.0058, lift: -0.001 });
  S.paint(grin, DARK);
  const nost = [0.14, -0.14].map((yw) => S.pose(S.ball(0.0075, { radial: 5, rings: 3 }), S.surface(headGeo, S.dirYP(yw, -0.12), { inset: 0.002 })));
  nost.forEach((g) => S.paint(g, DARK));
  // Soft arched brows, part of the head (they ride its tilt).
  const brows = [1, -1].map((s) => S.paint(S.groove(headGeo, [[s * 0.2, 0.62], [s * 0.4, 0.7], [s * 0.6, 0.64]], { radius: 0.0075, lift: 0.002 }), DARK));
  // Warm ember blush on the cheeks (soft, painted into the skin).
  for (const s of [1, -1]) S.blush(headGeo, S.surface(headGeo, S.dirYP(s * 0.82, -0.16)), 0.05, 0xff7a3a, 0.85);
  const head = S.bake([headGeo, grin, ...nost, ...brows], skin, 'head');
  kit.at(body, head, 0, 0.085, 0.2, { rz: 0.12, rx: -0.08 });

  const eyeOpts = { irisColor: 0x241a12, skinColor: 0x2e2019, glintSize: 0.022 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.055, 0.48, 0.33, eyeOpts, { sink: 0.5, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.055, -0.48, 0.33, eyeOpts, { sink: 0.5, front: 0.55 });


  // --- Legs: four stubby, sprawled salamander legs with toe-bean paws. ------
  const legDefs = [[0.125, -0.06, 0.1, 1], [-0.125, -0.06, 0.1, -1], [0.125, -0.06, -0.11, 1], [-0.125, -0.06, -0.11, -1]];
  const legs = legDefs.map(([x, y, z, s]) => {
    const l = S.softLeg(0.105, skin, {
      stubby: true, thighR: 0.055, kneeR: 0.042, pawR: 0.048, pawLen: 1.3, toes: 3,
      color: SOOT_HI, shinColor: 0x33241d, pawColor: PAW,
    });
    kit.at(body, l, x, y, z, { rz: s * 0.3 });
    return l;
  });

  // --- Tail: fat at the root, curling up over the back into the flame. ----
  const tail = S.softTail(5, skin, {
    segLen: 0.068, startR: 0.072, endR: 0.03, curl: 0.3,
    color: (t) => S.mixHex(SOOT_HI, 0xc0602c, Math.pow(t, 2.4)),
  });
  kit.at(body, tail, 0, 0.0, -0.19);
  const wick = new THREE.Mesh(S.ball(0.028, { radial: 8, rings: 6 }), emberGlow);
  wick.name = 'wick';
  kit.at(tail.tipAnchor, wick, 0, 0, 0);
  const tailFlame = S.flame3d(kit, 0.17, { seed: 6, width: 0.085, colors: [0xd23a0e, 0xff8a2e, 0xffe08a] });
  kit.at(tail.tipAnchor, tailFlame, 0, 0.012, -0.004, { rx: -tail.tipPitch });

  // Heartspark on the chest.
  const sparkAt = S.surface(bodyGeo, S.dirYP(0, -0.08), { inset: 0.012 });
  const spark = kit.heartspark(0.03, pal.eye, { seed: 11 });
  kit.at(body, spark, sparkAt[0], sparkAt[1], sparkAt[2]);

  root.add(kit.shadowDisc(0.26, 0.4));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [],
      fx: [tailFlame, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'eager',
      locomotion: 'quad',
      breathAmp: 1.15,
      blinkEvery: 2.6,
    },
  };
}
