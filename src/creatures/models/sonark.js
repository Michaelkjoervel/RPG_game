// =============================================================================
// SONARK — Gale/Umbra, stage 1, common.
// "Echo-bat with radar-dish ears bigger than its body. Gossip." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). A chubby little egg of a bat in dusky
// violet fur with a pale fluffy chest, big shiny eyes, a tiny snub nose and
// two little fangs — carried by small soft membrane wings (real arm and
// finger spars, scalloped edges; the same wing Reverbane grows into). The
// signature is the one explicit exaggeration in the bible: two RADAR-DISH
// EARS bigger than its whole body, deep cupped dishes lined in pale mint,
// always swivelling (they are accents) — the gossip listening in.
// No legs: it never lands to walk (locomotion 'fly').

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const FUR_LO = 0x302a44, FUR = 0x4a4462, FUR_HI = 0x756c94, CHEST = 0xc8bedc, DISH = 0xcfe8dc;

export function build_sonark(kit = kitDefault) {
  const pal = kit.palette(['gale', 'umbra']);
  const fur = S.vcMat(kit, { rough: 0.62, emissive: 0x1a1628, emissiveIntensity: 0.35 });
  const membrane = kit.mat(0xffffff, { vertexColors: true, rough: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.94 });
  membrane.userData.softVC = true;

  const root = new THREE.Group();

  // --- Body: a chubby egg with a fluffy pale chest. --------------------------------
  const bodyGeo = S.ball(0.085, { sx: 1.0, sy: 1.08, sz: 0.95, radial: 16, rings: 12 });
  S.paint(bodyGeo, { from: FUR_LO, to: FUR_HI, axis: 'y', noise: 0.015, seed: 51 });
  const chest = S.puff(0.045, { count: 4, spread: 0.6, seed: 52, sy: 1.1, radial: 8, rings: 6 });
  S.paint(chest, { from: 0x9a90b8, to: CHEST, axis: 'y' });
  S.pose(chest, S.surface(bodyGeo, [0, -0.2, 1], { inset: 0.03 }));
  const feet = [1, -1].map((sd) => {
    const g = S.taper(0.03, 0.01, { r1: 0.004, curve: 0.8, radial: 5, rings: 3, capSeg: 1 });
    g.rotateX(Math.PI);
    S.paint(g, 0x221e30);
    return S.pose(g, S.surface(bodyGeo, [sd * 0.35, -1, -0.1], { inset: 0.004 }));
  });
  const body = S.bake([bodyGeo, chest, ...feet], fur, 'body');
  root.add(body);
  body.position.y = 0.2;

  // --- Head: round, big shiny eyes, snub nose, tiny fangs. ------------------------
  const headGeo = S.ball(0.07, { sx: 1.05, sy: 0.95, sz: 1.0, radial: 16, rings: 12 });
  S.paint(headGeo, { from: FUR_LO, to: FUR_HI, axis: 'y', noise: 0.012, seed: 52 });
  const muzzle = S.ball(0.028, { sx: 1.25, sy: 0.8, radial: 10, rings: 7 });
  S.paint(muzzle, 0x8a80a8);
  const mz = S.surface(headGeo, S.dirYP(0, -0.35), { inset: 0.016 });
  muzzle.translate(mz[0], mz[1], mz[2]);
  const nose = S.pose(S.paint(S.ball(0.009, { sx: 1.4, sy: 0.8, radial: 6, rings: 4 }), 0x221e30), S.surface(muzzle, [0, 0.5, 1], { from: mz, inset: 0.002 }));
  const fangs = [1, -1].map((sd) => {
    const g = S.taper(0.016, 0.0045, { r1: 0.0012, radial: 5, rings: 3, capSeg: 1 });
    g.rotateX(Math.PI);
    S.paint(g, 0xf4f0ea);
    return S.pose(g, S.surface(muzzle, [sd * 0.35, -0.6, 1], { from: mz, inset: 0.002 }));
  });
  const head = S.bake([headGeo, muzzle, nose, ...fangs], fur, 'head');
  const hp = S.surface(bodyGeo, [0, 1, 0.35], { inset: 0.035 });
  kit.at(body, head, hp[0], hp[1] + 0.03, hp[2] + 0.01);
  const eyeOpts = { irisColor: 0x1c1c26, skinColor: 0x4a4462, glintSize: 0.011 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.025, 0.42, 0.12, eyeOpts, { sink: 0.4, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.025, -0.42, 0.12, eyeOpts, { sink: 0.4, front: 0.55 });

  // THE RADAR-DISH EARS: bigger than the whole body, deep mint-lined dishes.
  const mkEar = () => new THREE.Mesh(S.ear(0.2, 0.17, { color: FUR, inner: DISH, tip: 0.55, cup: 0.75, depth: 0.26, radial: 10, rings: 8 }), fur);
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.75, 0.7), { inset: 0.01 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.01, { rz: -0.55, ry: 0.3, rx: -0.2 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.01, { rz: 0.55, ry: -0.3, rx: -0.2 });

  // --- Small soft membrane wings. ------------------------------------------------------
  const wings = [1, -1].map((side) => {
    const w = S.batWing(0.24, membrane, fur, {
      side, chord: 0.15, color: { root: 0x8a7fae, tip: 0x5a5080 }, edge: 0x3a3456, spar: FUR_LO, claw: 0xece6da, billow: 0.06,
      sparR: 0.24 * 0.03,
    });
    const at = S.surface(bodyGeo, [side, 0.4, -0.1], { inset: 0.012 });
    kit.at(body, w, at[0], at[1], at[2], { rz: side * 0.35, ry: -side * 0.3, rx: 0.1 });
    return w;
  });

  const tail = S.softTail(2, fur, { segLen: 0.035, startR: 0.018, endR: 0.008, curl: 0.2, radial: 7, color: FUR });
  const tp = S.surface(bodyGeo, [0, -0.2, -1], { inset: 0.01 });
  kit.at(body, tail, tp[0], tp[1], tp[2]);

  const spark = kit.heartspark(0.02, pal.eye, { seed: 52 });
  const sp = S.surface(bodyGeo, [0, 0.1, 1], { inset: 0.02 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.12, 0.3));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      wings: wings.map((w) => w.bones),
      accents: [earL, earR],
      fx: [spark, S.variantFx(root)],
    },
    hints: {
      personality: 'eager',
      locomotion: 'fly',
      breathAmp: 1.2,
      blinkEvery: 2.3,
    },
  };
}
