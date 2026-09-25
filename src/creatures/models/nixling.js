// =============================================================================
// NIXLING — Tide, stage 1 starter.
// "Teal axolotl-sprite, droplet-shaped crest, big glassy eyes. Curious,
// easily distracted." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized): a glossy, chubby axolotl-sprite — a round
// teal body with a pale aqua belly, a wide round head with a big happy
// axolotl smile and big glassy eyes, three feathery gill fronds fanning from
// each cheek (they sway), stubby four-toed legs, and a tall paddle tail with
// a translucent fin fringe. The signature: a glassy water-droplet crest
// perched on the crown, catching the light.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const TEAL_LO = 0x1d6a78, TEAL = 0x2f9aa6, TEAL_HI = 0x7fd6cc, BELLY = 0xd2f2ea, GILL = 0xff8fae, GILL_HI = 0xffd0dc, FIN = 0x9fe6e0;

export function build_nixling(kit = kitDefault) {
  const pal = kit.palette(['tide']);
  const skin = S.vcMat(kit, { rough: 0.32 });
  const finMat = kit.mat(FIN, { rough: 0.25, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const dropMat = kit.mat(0xc8f2ff, { rough: 0.05, metal: 0.1, transparent: true, opacity: 0.72, emissive: 0x3aa8d8, emissiveIntensity: 0.35 });

  const root = new THREE.Group();

  // --- Body: a chubby, glossy axolotl bean. --------------------------------
  const bodyGeo = S.spindle({ len: 0.34, r: 0.13, sx: 1.08, sy: 0.86, p: 0.92, radial: 20, rings: 14, belly: 0.25, profile: (t) => 0.86 + 0.14 * S.bump(t, 0.58, 0.45) });
  S.paint(bodyGeo, { from: TEAL_LO, to: TEAL_HI, axis: 'y', exp: 0.9, noise: 0.01, seed: 15 });
  S.overlay(bodyGeo, BELLY, (x, y, z) => S.sstep(-0.02, -0.09, y));
  // a few pale freckles along the back
  for (const [yaw, pitch, z] of [[0.4, 0.9, 0.05], [-0.5, 0.85, -0.04], [0.2, 1.1, -0.1], [-0.2, 1.0, 0.1]]) S.blush(bodyGeo, S.surface(bodyGeo, S.dirYP(yaw, pitch), { from: [0, 0, z] }), 0.018, 0xbfeaf4, 0.8);
  const body = S.bake([bodyGeo], skin, 'body');
  root.add(body);
  body.position.y = 0.13;

  // --- Head: wide and round, the big axolotl smile. ------------------------
  const headGeo = S.spindle({ len: 0.24, r: 0.13, sx: 1.25, sy: 0.8, p: 0.98, radial: 22, rings: 14, belly: 0.1, profile: (t) => 0.92 + 0.1 * S.bump(t, 0.42, 0.45) });
  S.paint(headGeo, { from: 0x23808c, to: TEAL_HI, axis: 'y', noise: 0.01, seed: 16 });
  S.overlay(headGeo, BELLY, (x, y, z) => S.sstep(-0.03, -0.085, y) * 0.9);
  for (const s of [1, -1]) S.blush(headGeo, S.surface(headGeo, S.dirYP(s * 0.85, -0.15)), 0.04, 0xf6a6c0, 0.55);
  const smile = S.paint(S.groove(headGeo, [[-0.72, -0.2], [-0.4, -0.36], [0, -0.42], [0.4, -0.36], [0.72, -0.2]], { radius: 0.0055, lift: -0.001 }), 0x163a50);
  const head = S.bake([headGeo, smile], skin, 'head');
  kit.at(body, head, 0, 0.055, 0.16, { rz: 0.1, rx: -0.05 });

  const eyeOpts = { irisColor: 0x0f2a33, skinColor: 0x3f93bf, glintSize: 0.026 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.056, 0.52, 0.3, eyeOpts, { sink: 0.45, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.056, -0.52, 0.3, eyeOpts, { sink: 0.45, front: 0.55 });

  // --- Feathery gill fronds, three per cheek (accents — they sway). --------
  const gills = [];
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const len = 0.085 - i * 0.012;
      // a soft feathery frond: curved stalk inside a plump fringed vane
      const stalk = S.taper(len, 0.011, { r1: 0.005, curve: -0.35, radial: 6, rings: 5 });
      S.paint(stalk, GILL);
      const vane = S.spindle({ len, r: 0.02, sx: 1.0, sy: 0.3, radial: 10, rings: 8, pNose: 1.3, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.95)), 0.6) * (0.7 + 0.3 * t) });
      vane.rotateX(-Math.PI / 2); // along +Y
      vane.translate(0, len * 0.5, 0);
      const vp = vane.attributes.position;
      for (let k = 0; k < vp.count; k++) { const y = vp.getY(k); vp.setZ(k, vp.getZ(k) - 0.35 * len * (y / len) * (y / len)); vp.setX(k, vp.getX(k) * (1 + 0.18 * Math.sin(y * 260))); }
      S.smooth(vane);
      S.paint(vane, { from: GILL, to: GILL_HI, axis: 'y' });
      const m = S.bake([stalk, vane], skin, 'gill');
      const p = S.surface(headGeo, S.dirYP(s * (1.35 + i * 0.12), 0.35 - i * 0.28), { inset: 0.008 });
      kit.at(head, m, p[0], p[1], p[2], { rz: -s * (0.9 + i * 0.35), ry: s * 0.35, rx: -0.2 });
      gills.push(m);
    }
  }

  // --- The glassy droplet crest (signature). -------------------------------
  const dropGeo = S.spindle({ len: 0.1, r: 0.042, radial: 18, rings: 14, pTail: 1, pNose: 1.9, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.02 + t * 0.9)), 0.55) * (1.1 - 0.6 * t) });
  dropGeo.rotateX(-Math.PI / 2); // nose (+Z) -> tip up
  dropGeo.translate(0, 0.05, 0);
  const crest = new THREE.Mesh(dropGeo, dropMat);
  crest.name = 'dropletCrest';
  const cp = S.surface(headGeo, S.dirYP(0, 1.3), { inset: 0.012 });
  kit.at(head, crest, cp[0], cp[1], cp[2] - 0.01, { rx: -0.12 });
  const shine = S.glow(0xdff8ff, 0.07, 0.55);
  shine.position.set(0.012, 0.075, 0.012);
  crest.add(shine);

  // --- Stubby four-toed legs. -----------------------------------------------
  const legs = [[0.09, -0.04, 0.08], [-0.09, -0.04, 0.08], [0.09, -0.04, -0.08], [-0.09, -0.04, -0.08]].map(([x, y, z]) => {
    const l = S.softLeg(0.095, skin, { stubby: true, thighR: 0.032, kneeR: 0.025, pawR: 0.03, pawLen: 1.25, toes: 4, color: TEAL, pawColor: 0x6cc2dc, radial: 8 });
    kit.at(body, l, x, y, z, { rz: Math.sign(x) * 0.35 });
    return l;
  });

  // --- Tall paddle tail with a translucent fin fringe. -----------------------
  const tail = S.softTail(4, skin, {
    segLen: 0.07, startR: 0.06, endR: 0.02, curl: 0.08, rootPitch: 0.1, sx: 0.55, sy: 1.25,
    color: (t) => S.mixHex(TEAL, 0x5ab4d4, t),
  });
  kit.at(body, tail, 0, 0.02, -0.15);
  tail.pivots.forEach((p, i) => {
    const h = 0.05 - i * 0.008;
    const fin = S.spindle({ len: 0.085, r: h * 0.5, sx: 0.12, sy: 1, radial: 8, rings: 6 });
    fin.translate(0, 0, -0.035);
    const m = new THREE.Mesh(fin, finMat);
    m.name = 'tailFin';
    p.add(m);
  });

  const bubbles = kit.mote(5, { color: 0xdff2ff, size: 0.012, radius: 0.08, height: 0.14, speed: 0.35, seed: 21 });
  kit.at(head, bubbles, 0, 0.12, 0.04);

  const spark = kit.heartspark(0.022, pal.eye, { seed: 5 });
  const sp = S.surface(bodyGeo, S.dirYP(0, -0.05), { inset: 0.008 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.2, 0.34));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [crest, ...gills],
      fx: [bubbles, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'skittish',
      locomotion: 'quad',
      hover: false,
      breathAmp: 1.1,
      blinkEvery: 2.2,
    },
  };
}
