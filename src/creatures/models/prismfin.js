// =============================================================================
// PRISMFIN — Tide/Lumen, stage 2 (Finnet awakens at L22).
// "Grand koi whose fins split light into slow-turning auroras. Lake
// spirit's herald." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). v1's weak spot was a balloon body; here it
// is a real koi: a streamlined, laterally compressed body — full at the
// shoulders, tapering to a slim tail stock — in pearl white with koi patches
// of flame orange and gold and an opal sheen. Every fin is AURORA light: one
// translucent, luminous mesh per fin painted violet -> blue -> teal -> gold
// (a tall dorsal sail, pectorals, pelvics), a long split tail that flows
// from the tail chain, and two trailing ribbon fins. Barbels at the mouth.
// It floats (hover).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const PEARL_LO = 0xa898d0, PEARL = 0xf8f2fa, ORANGE = 0xf0501e, GOLD = 0xffb02a;
const AURORA = [0x9a6cff, 0x4f8cff, 0x3fd8b8, 0xffd060];
const aurora = (t) => { const k = S.clamp01(t) * 3, i = Math.min(2, Math.floor(k)); return S.mixHex(AURORA[i], AURORA[i + 1], k - i); };

// A soft luminous fin: a thin spindle along +Z (base at 0), painted along
// its length with the aurora ramp.
function finGeo(len, width, { profile = null, thick = 0.1, flip = false } = {}) {
  const g = S.spindle({
    len, r: width * 0.5, sx: thick, sy: 1, radial: 12, rings: 10, pTail: 0.9,
    profile: profile ?? ((t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)), 0.7)),
  });
  g.translate(0, 0, len / 2);
  S.paint(g, { from: flip ? AURORA[3] : AURORA[0], to: flip ? AURORA[0] : AURORA[3], axis: 'z', fn: (x, y, z) => z / len });
  const col = g.attributes.color, pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const c = new THREE.Color(aurora(pos.getZ(i) / len + Math.abs(pos.getY(i)) / width * 0.4));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return g;
}

export function build_prismfin(kit = kitDefault) {
  const pal = kit.palette(['tide', 'lumen']);
  const skin = S.vcMat(kit, { rough: 0.3, metal: 0.06 });
  const finMat = kit.mat(0xffffff, { unlit: true, vertexColors: true, transparent: true, opacity: 0.78, side: THREE.DoubleSide });
  finMat.depthWrite = false;
  finMat.userData.softVC = true;

  const root = new THREE.Group();

  // --- Body: a streamlined koi (not a balloon). -----------------------------
  const L = 0.56;
  const bodyGeo = S.spindle({
    len: L, r: 0.12, sx: 0.62, sy: 1.0, pTail: 0.7, pNose: 1.0, radial: 18, rings: 16,
    profile: (t) => 0.28 + 0.72 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.72 + 0.14)), 0.9),
    belly: 0.05,
  });
  S.paint(bodyGeo, { from: PEARL_LO, to: PEARL, axis: 'y', noise: 0.012, seed: 82 });
  // koi patches: flame orange saddles + a gold crown
  for (const [yaw, pitch, z, r, c] of [[0.3, 0.9, 0.1, 0.1, ORANGE], [-0.5, 0.7, -0.06, 0.09, ORANGE], [0.8, 0.4, -0.14, 0.07, ORANGE], [0, 1.2, 0.22, 0.07, GOLD], [-0.9, 0.3, 0.14, 0.06, ORANGE], [0.2, 1.0, -0.2, 0.06, GOLD]]) {
    S.blush(bodyGeo, S.surface(bodyGeo, S.dirYP(yaw, pitch), { from: [0, 0, z] }), r, c, 1);
    S.blush(bodyGeo, S.surface(bodyGeo, S.dirYP(yaw, pitch), { from: [0, 0, z] }), r * 0.6, c, 1);
  }
  const mouth = S.paint(S.groove(bodyGeo, [[-0.35, -0.1], [0, -0.16], [0.35, -0.1]], { from: [0, -0.01, 0.2], radius: 0.005, lift: -0.001 }), 0x6a4a60);
  const body = S.bake([bodyGeo, mouth], skin, 'body');
  root.add(body);
  body.position.y = 0.28;
  const eyeOpts = { irisColor: 0x2a2440, skinColor: 0xe6def0, glintSize: 0.012 };
  const eyeL = S.seatEye(kit, body, bodyGeo, 0.028, 1.0, 0.1, eyeOpts, { sink: 0.35, front: 0.35, from: [0, 0, 0.19] });
  const eyeR = S.seatEye(kit, body, bodyGeo, 0.028, -1.0, 0.1, eyeOpts, { sink: 0.35, front: 0.35, from: [0, 0, 0.19] });

  // --- Barbels (accents). -------------------------------------------------------
  const barbels = [1, -1].map((sd) => {
    const g = S.taper(0.1, 0.006, { r1: 0.002, curve: -0.6, radial: 5, rings: 6 });
    g.rotateX(Math.PI / 2 + 0.6);
    S.paint(g, 0xf0e0d0);
    const m = new THREE.Mesh(g, skin);
    m.name = 'barbel';
    const p = S.surface(bodyGeo, [sd * 0.5, -0.4, 1], { from: [0, -0.01, 0.2], inset: 0.004 });
    kit.at(body, m, p[0], p[1], p[2], { ry: sd * 0.6 });
    return m;
  });

  // --- Aurora fins. --------------------------------------------------------------
  const fin = (geo, name) => { const m = new THREE.Mesh(geo, finMat); m.name = name; return m; };
  const dorsal = fin(finGeo(0.34, 0.16, { profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)), 0.6) * (0.6 + 0.4 * (1 - t)) }), 'dorsalFin');
  const dp = S.surface(bodyGeo, [0, 1, 0], { from: [0, 0, 0.06], inset: 0.01 });
  kit.at(body, dorsal, dp[0], dp[1] + 0.03, dp[2], { rx: -1.9 });
  const pecs = [1, -1].map((sd) => {
    const m = fin(finGeo(0.17, 0.1), 'pecFin');
    const p = S.surface(bodyGeo, [sd, -0.4, 0], { from: [0, 0, 0.12], inset: 0.01 });
    kit.at(body, m, p[0], p[1], p[2], { ry: Math.PI + sd * 0.7, rz: sd * 0.5 });
    return m;
  });
  const pelvics = [1, -1].map((sd) => {
    const m = fin(finGeo(0.11, 0.07), 'pelvicFin');
    const p = S.surface(bodyGeo, [sd * 0.4, -1, 0], { from: [0, 0, -0.05], inset: 0.01 });
    kit.at(body, m, p[0], p[1], p[2], { ry: Math.PI + sd * 0.4, rx: 0.5 });
    return m;
  });

  // --- Tail stock + long split aurora tail. --------------------------------------
  const tail = S.softTail(3, skin, { segLen: 0.07, startR: 0.04, endR: 0.022, sx: 0.62, curl: 0.03, radial: 9, color: (t) => S.mixHex(PEARL, PEARL_LO, t) });
  kit.at(body, tail, 0, 0.0, -L / 2 + 0.03);
  const tailFin = new THREE.Group(); tailFin.name = 'tailFin';
  for (const sd of [1, -1]) {
    const g = finGeo(0.36, 0.14, { profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)), 0.6) * (0.5 + 0.5 * t), flip: true });
    g.rotateY(Math.PI); // trail backward (-Z)
    g.rotateX(sd * 0.55);
    tailFin.add(fin(g, 'tailLobe'));
  }
  kit.at(tail.tipAnchor, tailFin, 0, 0, 0);
  const ribbons = [1, -1].map((sd) => {
    const g = finGeo(0.44, 0.035, { thick: 0.2, flip: true });
    g.rotateY(Math.PI);
    S.bendArc(g, 0.44, -0.4);
    const m = fin(g, 'ribbonFin');
    const p = S.surface(bodyGeo, [sd, -0.6, 0], { from: [0, 0, -0.1], inset: 0.01 });
    kit.at(body, m, p[0], p[1], p[2], { ry: -sd * 0.25 });
    return m;
  });

  // --- Aurora glow + heartspark. -----------------------------------------------
  const auroraGlow = kit.mote(8, { color: 0xc8b8ff, size: 0.02, radius: 0.3, height: 0.25, speed: 0.3, seed: 83 });
  kit.at(body, auroraGlow, 0, 0.1, -0.1);
  const spark = kit.heartspark(0.024, pal.eye, { seed: 84 });
  const sp = S.surface(bodyGeo, [0, -0.4, 1], { from: [0, 0, 0.1], inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      accents: [...barbels, dorsal, ...pecs, ...pelvics, tailFin, ...ribbons],
      fx: [auroraGlow, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'float',
      hover: true,
      hoverAmp: 0.05,
      breathAmp: 0.8,
      blinkEvery: 4.2,
    },
  };
}
