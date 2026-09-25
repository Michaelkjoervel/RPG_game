// =============================================================================
// MYCLET — Bloom/Venom, stage 1 wild (Whisperwood).
// "Mushroom imp with cap-hat and spore pouch cheeks. Mischievous."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized): a round mossy-green imp wearing its
// signature mushroom cap like a jaunty hat — a smooth raspberry-plum dome
// with a rolled rim, cream gills underneath and soft cream spots — with
// puffy translucent spore-pouch cheeks, lopsided eyes and a sly smirk, two
// stubby feet and little nub arms. Spores drift from the cheeks.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const SKIN_LO = 0x3f5228, SKIN = 0x5a6e3a, SKIN_HI = 0x8aa25a, CAP_LO = 0x6a2a50, CAP_HI = 0xd0607e, GILL = 0xf2e2cc, SPOT = 0xf6ecdc;

// A mushroom cap: domed top, rolled rim, gill underside (lathe, smooth).
function capGeo(r, h) {
  const pts = [
    [0, h], [0.3 * r, 0.97 * h], [0.62 * r, 0.82 * h], [0.86 * r, 0.56 * h], [0.99 * r, 0.26 * h],
    [1.0 * r, 0.1 * h], [0.93 * r, 0.0], [0.7 * r, 0.04 * h], [0.35 * r, 0.1 * h], [0.001, 0.13 * h],
  ].reverse().map(([x, y]) => new THREE.Vector2(x, y));
  return S.smooth(new THREE.LatheGeometry(pts, 24));
}

export function build_myclet(kit = kitDefault) {
  const pal = kit.palette(['bloom', 'venom']);
  const skin = S.vcMat(kit, { rough: 0.62 });
  const pouchMat = kit.mat(pal.secondary, { rough: 0.3, transparent: true, opacity: 0.82, emissive: 0x5a2a78, emissiveIntensity: 0.35 });

  const root = new THREE.Group();

  // --- Body: a round little imp. -------------------------------------------
  const bodyGeo = S.spindle({ len: 0.25, r: 0.12, sx: 1.0, sy: 1.0, p: 1, radial: 18, rings: 12, belly: 0.15 });
  S.paint(bodyGeo, { from: SKIN_LO, to: SKIN_HI, axis: 'y', noise: 0.012, seed: 120 });
  S.overlay(bodyGeo, 0xb8c888, (x, y, z) => S.sstep(0.02, 0.1, z) * S.sstep(0.02, -0.06, y) * 0.6);
  const arms = [1, -1].map((s) => {
    const g = S.taper(0.06, 0.024, { r1: 0.018, radial: 8, rings: 5 });
    S.paint(g, SKIN);
    return S.pose(g, S.surface(bodyGeo, S.dirYP(s * 1.2, 0.0), { inset: 0.02 }), [0.3, 0, -s * 2.1]);
  });
  const body = S.bake([bodyGeo, ...arms], skin, 'body');
  root.add(body);
  body.position.y = 0.14;

  // --- Head: big and round, puffy cheeks, lopsided smirk. -------------------
  const headGeo = S.ball(0.1, { sx: 1.04, sy: 0.96, sz: 1.0, radial: 20, rings: 14 });
  S.paint(headGeo, { from: 0x4c6130, to: 0x8aa25a, axis: 'y', noise: 0.01, seed: 121 });
  const smirk = S.paint(S.groove(headGeo, [[-0.3, -0.36], [-0.05, -0.42], [0.2, -0.36], [0.34, -0.26]], { radius: 0.0055, lift: -0.001 }), 0x1e2614);
  const head = S.bake([headGeo, smirk], skin, 'head');
  kit.at(body, head, 0, 0.12, 0.02, { rz: -0.1 });

  const pouches = [1, -1].map((s) => {
    const m = new THREE.Mesh(S.ball(0.042, { sx: 1.1, sy: 0.95, radial: 14, rings: 10 }), pouchMat);
    m.name = 'sporePouch';
    const p = S.surface(headGeo, S.dirYP(s * 1.0, -0.25), { inset: 0.018 });
    kit.at(head, m, p[0], p[1], p[2]);
    return m;
  });

  // lopsided, mischievous eyes
  const eyeOpts = { irisColor: 0x2a1a2a, skinColor: 0x5a6e3a, glintSize: 0.015 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.04, 0.42, 0.12, eyeOpts, { sink: 0.4, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.034, -0.44, 0.08, eyeOpts, { sink: 0.42, front: 0.55 });
  const browGeo = S.paint(S.groove(headGeo, [[-0.2, 0.42], [-0.42, 0.5], [-0.62, 0.52]], { radius: 0.0065, lift: 0.001 }), 0x2a3418);
  head.add(new THREE.Mesh(browGeo, skin));

  // --- The cap: a jaunty mushroom hat (accent — it bobs). -------------------
  const cg = capGeo(0.14, 0.12);
  S.paint(cg, { from: CAP_LO, to: CAP_HI, axis: 'y', noise: 0.012, seed: 122 });
  S.overlay(cg, GILL, (x, y, z) => (y < 0.017 && Math.hypot(x, z) < 0.128 ? 1 : 0));
  const spotDirs = [[0.35, 0.85, 0.042], [-0.7, 0.75, 0.036], [1.7, 0.6, 0.04], [-2.1, 0.7, 0.034], [2.9, 0.55, 0.036], [0.05, 1.4, 0.038], [-1.3, 0.35, 0.03], [1.05, 0.3, 0.03]];
  for (const [yaw, pitch, r] of spotDirs) S.blush(cg, S.surface(cg, S.dirYP(yaw, pitch), { from: [0, 0.02, 0] }), r, SPOT, 1);
  const cap = new THREE.Mesh(cg, skin);
  cap.name = 'cap';
  const ct = S.surface(headGeo, S.dirYP(0.1, 1.3), { inset: 0.045 });
  kit.at(head, cap, ct[0], ct[1], ct[2], { rz: 0.2, rx: -0.12 });

  // --- Stubby feet. ----------------------------------------------------------
  const legs = [[0.055, -0.08, 0.02], [-0.055, -0.08, 0.02]].map(([x, y, z]) => {
    const l = S.softLeg(0.075, skin, { stubby: true, thighR: 0.03, kneeR: 0.025, pawR: 0.032, pawLen: 1.3, toes: 0, color: SKIN, pawColor: 0x3a4a22, radial: 8 });
    kit.at(body, l, x, y, z, { rz: Math.sign(x) * 0.12 });
    return l;
  });

  const spores = kit.mote(6, { color: pal.secondary, size: 0.012, radius: 0.1, height: 0.06, speed: 0.6, seed: 121 });
  kit.at(head, spores, 0, -0.02, 0.05);

  const spark = kit.heartspark(0.022, pal.eye, { seed: 122 });
  const sp = S.surface(bodyGeo, S.dirYP(0, -0.1), { inset: 0.008 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.17, 0.36));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [cap, ...pouches],
      fx: [spores, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'eager',
      locomotion: 'hop',
      breathAmp: 1.1,
      blinkEvery: 2.3,
    },
  };
}
