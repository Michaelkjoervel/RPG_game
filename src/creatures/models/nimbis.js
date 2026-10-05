// =============================================================================
// NIMBIS — Gale, stage 1, common (awakens into Stratovane at L26).
// "Kitten-sized cloud ray, drizzles when sad. Moody weather." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). A baby manta of rain-cloud: one plump,
// rounded hull (drizzle-grey on top, a pale cloud-white belly), two soft
// thick wing-flaps whose tips curl up, little curled cephalic lobes framing a
// big-eyed worried face (brows knitted up in the middle, a small wobbly
// frown) and a short whip tail ending in a wisp. Stratovane's cumulonimbus
// starts here as a small cumulus tuft riding its back; a quiet drizzle
// falls from its belly, because it is usually a little sad.
// Static pieces per node are merged into one vertex-coloured mesh (./soft.js).
//
// PROPORTION NOTE: registry.js rescales by HEIGHT (SPECIES.nimbis.size), so
// the cloud tuft and raised wing tips buy height and the wingspan stays a
// sane kitten-size after the rescale.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const TOP_LO = 0x3a4566, TOP = 0x56668e, TOP_HI = 0x7e8fb6, BELLY = 0xf2f5fa, CLOUD_LO = 0xb9c5d6, CLOUD_HI = 0xffffff, INK = 0x2a3044;

export function build_nimbis(kit = kitDefault) {
  const pal = kit.palette(['gale']);
  const skin = S.vcMat(kit, { rough: 0.62 });
  const cloudMat = S.vcMat(kit, { rough: 0.9 });

  const root = new THREE.Group();

  // --- Hull: a plump baby manta, drizzle-grey back, cloud-white belly. ------
  const hull = S.spindle({
    len: 0.29, r: 0.13, sx: 1.2, sy: 0.82, pTail: 0.8, pNose: 1.3, radial: 18, rings: 12, belly: 0.22,
    profile: (t) => 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 0.78 + 0.16)),
    arch: (t) => 0.012 * S.bump(t, 0.55, 0.35),
  });
  S.paint(hull, { from: TOP_LO, to: TOP_HI, axis: 'y', noise: 0.012, seed: 100 });
  S.overlayN(hull, BELLY, (nx, ny, nz) => S.sstep(-0.25, -0.65, ny) + S.sstep(0.6, 0.95, nz) * S.sstep(-0.05, -0.35, ny) * 0.9);
  S.overlayN(hull, TOP_HI, (nx, ny, nz) => S.sstep(0.5, 0.9, nz) * S.sstep(-0.1, 0.25, ny) * 0.55); // a lighter face
  // the face: soft pale blaze between the eyes, a small wobbly frown
  const F = [0, 0, 0.06];
  const mouth = S.paint(S.groove(hull, [[-0.2, -0.02], [-0.1, 0.03], [0, 0.0], [0.1, 0.03], [0.2, -0.02]], { from: F, radius: 0.0048, lift: -0.001 }), INK);
  // worried brows: inner ends raised
  const brows = [1, -1].map((s) => S.paint(S.groove(hull, [[s * 0.2, 0.74], [s * 0.38, 0.68], [s * 0.56, 0.55]], { from: F, radius: 0.006, lift: 0.001 }), INK));
  // little curled cephalic lobes either side of the face
  const lobes = [1, -1].map((s) => {
    const g = S.taper(0.06, 0.022, { r1: 0.008, curve: -0.8, radial: 7, rings: 5, sx: 0.65 });
    S.paint(g, { from: TOP, to: TOP_HI, axis: 'y' });
    g.rotateX(Math.PI / 2 - 0.5);
    g.rotateY(-s * 0.35);
    return S.pose(g, S.surface(hull, [s * 0.8, -0.05, 1], { from: [0, 0, 0.06], inset: 0.012 }));
  });
  const body = S.bake([hull, mouth, ...brows, ...lobes], skin, 'body');
  root.add(body);
  body.position.y = 0.26;

  const eyeOpts = { irisColor: 0x24304c, skinColor: TOP, glintSize: 0.016 };
  const eyeL = S.seatEye(kit, body, hull, 0.043, 0.43, 0.36, eyeOpts, { sink: 0.42, front: 0.6, from: F });
  const eyeR = S.seatEye(kit, body, hull, 0.043, -0.43, 0.36, eyeOpts, { sink: 0.42, front: 0.6, from: F });

  // --- The cumulus tuft riding its back (an accent: it billows). -----------
  const cloud = new THREE.Group(); cloud.name = 'cloudTuft';
  const c1 = S.puff(0.064, { count: 6, spread: 0.9, seed: 101, sy: 0.75, radial: 9, rings: 6 });
  const c2 = S.puff(0.046, { count: 4, spread: 0.8, seed: 102, sy: 0.88, radial: 8, rings: 6 });
  c2.translate(-0.008, 0.045, -0.02);
  const cg = S.merge([c1, c2]);
  S.paint(cg, { from: CLOUD_LO, to: CLOUD_HI, axis: 'y', noise: 0.015, seed: 103 });
  cloud.add(new THREE.Mesh(cg, cloudMat));
  const ca = S.surface(hull, [0, 1, 0], { from: [0, 0, -0.06], inset: 0.03 });
  kit.at(body, cloud, ca[0], ca[1], ca[2]);

  // --- Soft thick wing-flaps, tips curling up, pale undersides. ------------
  const wings = [1, -1].map((side) => {
    const len = 0.22, sweep = 0.5;
    const w = S.openWing(len, skin, {
      width: 0.24, thick: 0.36, sweep, lift: 0.18, radial: 14, rings: 9,
      chord: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.5 + t * 0.52)), 0.7) * (1 - 0.2 * t),
      color: { root: TOP, tip: TOP_LO },
    });
    const wm = w.group.children[0];
    S.overlayN(wm.geometry, BELLY, (nx, ny) => S.sstep(-0.1, -0.6, ny));
    const at = S.surface(hull, [side, 0.05, 0], { from: [0, 0, -0.005], inset: 0.045 });
    kit.at(body, w, at[0], at[1], at[2], { rz: side * 0.1, sx: side < 0 ? -1 : 1 });
    return w;
  });

  // --- Short whip tail with a wisp at the tip. ------------------------------
  const tail = S.softTail(3, skin, { segLen: 0.05, startR: 0.017, endR: 0.006, curl: 0.18, rootPitch: 0.05, radial: 7, color: (t) => S.mixHex(TOP, TOP_LO, t) });
  kit.at(body, tail, 0, 0.0, -0.14);
  const wisp = new THREE.Mesh(S.paint(S.puff(0.018, { count: 3, spread: 0.7, seed: 104, sy: 0.9, radial: 7, rings: 5 }), CLOUD_HI), cloudMat);
  wisp.name = 'tailWisp';
  kit.at(tail.tipAnchor, wisp, 0, 0, -0.008);

  // --- A quiet drizzle beneath its belly, one tear welling at an eye. ------
  const drizzle = kit.mote(8, { color: 0x9fc4e8, size: 0.012, radius: 0.1, height: 0.2, speed: 0.55, seed: 101 });
  kit.at(body, drizzle, 0, -0.24, 0);
  const tear = new THREE.Mesh(
    S.paint(S.spindle({ len: 0.026, r: 0.0085, radial: 8, rings: 6, pTail: 1.4, pNose: 0.8, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.05)), 0.8) * (0.5 + 0.6 * t) }).rotateX(Math.PI / 2), 0xffffff),
    kit.mat(0xcfe8ff, { unlit: true, transparent: true, opacity: 0.85 }),
  );
  tear.name = 'tear';
  const ep = eyeL.position;
  kit.at(body, tear, ep.x + 0.012, ep.y - 0.038, ep.z + 0.006);

  const spark = kit.heartspark(0.022, pal.eye, { seed: 102 });
  const sp = S.surface(hull, [0, -0.45, 1], { from: [0, 0, 0.04], inset: 0.008 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      wings: wings.map((w) => w.bones),
      accents: [cloud],
      fx: [drizzle, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'skittish',
      locomotion: 'fly',
      breathAmp: 1.0,
      blinkEvery: 2.8,
    },
  };
}
