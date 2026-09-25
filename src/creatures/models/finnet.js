// =============================================================================
// FINNET — Tide, stage 1, common.
// "Glass-finned koi, transparent fins like stained glass. Mirror-gazer."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). A chubby little ornamental koi (Prismfin's
// fry): a round, laterally soft body in cream and gold with kohaku-red
// saddle patches, a big-eyed face, tiny barbels. The signature is its fins:
// real STAINED GLASS — each fin a luminous translucent pane split into jewel
// colored cells (sapphire, teal, amethyst, gold) by dark leading along a
// centre rib and the rim. Dorsal, pectorals, pelvics and a two-lobed tail fan.
// It hovers (float + hover hints).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const CREAM = 0xfdf2d8, GOLD_LO = 0xd8a04a, KOHAKU = 0xe8502a, LEAD = 0x1c2638;
const GLASS = [0x3f7cf0, 0x2fc8b4, 0x9a62f0, 0xffc24a, 0x4fa8ff];

// A stained-glass fin: a flat, slightly cupped pane along +Z (base at 0,
// width along Y) built from explicit quads so every cell is one crisp colour
// and the leading (rim, centre rib, two cross bars) is a hard dark strip.
const LEAD_C = new THREE.Color(LEAD), _fc = new THREE.Color();
function glassFin(len, width, { profile = null, seed = 0, cup = 0.12 } = {}) {
  const prof = profile ?? ((t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)), 0.7));
  const U = [0, 0.16, 0.3, 0.34, 0.49, 0.63, 0.67, 0.84, 1];
  const V = [-1, -0.86, -0.45, -0.06, 0.06, 0.45, 0.86, 1];
  const uCell = (a) => (a < 0.3 ? 0 : a < 0.34 ? -1 : a < 0.63 ? 1 : a < 0.67 ? -1 : 2);
  const vCell = (a) => (Math.abs(a) > 0.86 || Math.abs(a) < 0.06 ? -1 : a > 0 ? 1 : 0);
  const P = (u, v) => [cup * width * v * v, v * width * 0.5 * prof(u), u * len];
  const pos = [], col = [];
  for (let i = 0; i < U.length - 1; i++) for (let j = 0; j < V.length - 1; j++) {
    const u0 = U[i], u1 = U[i + 1], v0 = V[j], v1 = V[j + 1];
    const uc = uCell((u0 + u1) / 2), vc = vCell((v0 + v1) / 2);
    if (uc < 0 || vc < 0) _fc.copy(LEAD_C);
    else _fc.setHex(GLASS[(uc * 2 + vc + seed) % GLASS.length]);
    const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), d = P(u0, v1);
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let k = 0; k < 6; k++) col.push(_fc.r, _fc.g, _fc.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function build_finnet(kit = kitDefault) {
  const pal = kit.palette(['tide']);
  const skin = S.vcMat(kit, { rough: 0.32, metal: 0.05 });
  const glass = kit.mat(0xffffff, { unlit: true, vertexColors: true, transparent: true, opacity: 0.82, side: THREE.DoubleSide, glow: 1.25 });
  glass.depthWrite = false;
  glass.userData.softVC = true;

  const root = new THREE.Group();

  // --- Body: a chubby round koi. ------------------------------------------------
  const bodyGeo = S.spindle({
    len: 0.3, r: 0.1, sx: 0.74, sy: 1.0, pTail: 0.75, pNose: 1.05, radial: 16, rings: 12, belly: 0.06,
    profile: (t) => 0.34 + 0.66 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.68 + 0.2)), 0.8),
  });
  S.paint(bodyGeo, { from: GOLD_LO, to: CREAM, axis: 'y', noise: 0.012, seed: 80 });
  for (const [yaw, pitch, z, r] of [[0.35, 1.0, 0.03, 0.05], [-0.6, 0.8, -0.05, 0.045], [0.9, 0.5, -0.07, 0.035], [0, 1.2, 0.09, 0.035]]) {
    S.blush(bodyGeo, S.surface(bodyGeo, S.dirYP(yaw, pitch), { from: [0, 0, z] }), r, KOHAKU, 1);
    S.blush(bodyGeo, S.surface(bodyGeo, S.dirYP(yaw, pitch), { from: [0, 0, z] }), r * 0.6, KOHAKU, 1);
  }
  const mouth = S.paint(S.groove(bodyGeo, [[-0.3, -0.12], [0, -0.18], [0.3, -0.12]], { from: [0, -0.005, 0.1], radius: 0.004, lift: -0.001 }), 0x8a4a3a);
  const body = S.bake([bodyGeo, mouth], skin, 'body');
  root.add(body);
  body.position.y = 0.2;
  const eyeOpts = { irisColor: 0x123a4a, skinColor: 0xf0dcb0, glintSize: 0.012 };
  const eyeL = S.seatEye(kit, body, bodyGeo, 0.03, 0.95, 0.12, eyeOpts, { sink: 0.35, front: 0.35, from: [0, 0, 0.09] });
  const eyeR = S.seatEye(kit, body, bodyGeo, 0.03, -0.95, 0.12, eyeOpts, { sink: 0.35, front: 0.35, from: [0, 0, 0.09] });

  // --- Tiny barbels (accents). -------------------------------------------------
  const barbels = [1, -1].map((sd) => {
    const g = S.taper(0.05, 0.004, { r1: 0.0015, curve: -0.6, radial: 4, rings: 4, capSeg: 1 });
    g.rotateX(Math.PI / 2 + 0.6);
    S.paint(g, 0xf0dcc0);
    const m = new THREE.Mesh(g, skin);
    m.name = 'barbel';
    const p = S.surface(bodyGeo, [sd * 0.5, -0.4, 1], { from: [0, -0.005, 0.1], inset: 0.003 });
    kit.at(body, m, p[0], p[1], p[2], { ry: sd * 0.6 });
    return m;
  });

  // --- Stained-glass fins. -------------------------------------------------------
  const fin = (geo, name) => { const m = new THREE.Mesh(geo, glass); m.name = name; return m; };
  const dorsal = fin(glassFin(0.17, 0.1, { seed: 0, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)), 0.6) * (0.65 + 0.35 * (1 - t)) }), 'dorsalFin');
  const dp = S.surface(bodyGeo, [0, 1, 0], { from: [0, 0, 0.02], inset: 0.008 });
  kit.at(body, dorsal, dp[0], dp[1] + 0.015, dp[2], { rx: -2.0 });
  const pecs = [1, -1].map((sd, i) => {
    const m = fin(glassFin(0.11, 0.08, { seed: 1 + i }), 'pecFin');
    const p = S.surface(bodyGeo, [sd, -0.4, 0], { from: [0, 0, 0.05], inset: 0.008 });
    kit.at(body, m, p[0], p[1], p[2], { ry: Math.PI + sd * 0.8, rz: sd * 0.5 });
    return m;
  });
  const pelvics = [1, -1].map((sd, i) => {
    const m = fin(glassFin(0.07, 0.05, { seed: 3 + i }), 'pelvicFin');
    const p = S.surface(bodyGeo, [sd * 0.4, -1, 0], { from: [0, 0, -0.03], inset: 0.008 });
    kit.at(body, m, p[0], p[1], p[2], { ry: Math.PI + sd * 0.4, rx: 0.5 });
    return m;
  });

  // --- Tail stock + two-lobed glass tail fan. ------------------------------------
  const tail = S.softTail(2, skin, { segLen: 0.05, startR: 0.032, endR: 0.02, sx: 0.7, curl: 0.03, radial: 8, color: (t) => S.mixHex(CREAM, GOLD_LO, t) });
  kit.at(body, tail, 0, 0.0, -0.13);
  const tailFin = new THREE.Group(); tailFin.name = 'tailFin';
  for (const sd of [1, -1]) {
    const g = glassFin(0.16, 0.1, { seed: sd > 0 ? 2 : 4, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)), 0.6) * (0.55 + 0.45 * t) });
    g.rotateY(Math.PI); // trail backward (-Z)
    g.rotateX(sd * 0.6);
    tailFin.add(fin(g, 'tailLobe'));
  }
  kit.at(tail.tipAnchor, tailFin, 0, 0, 0);

  const spark = kit.heartspark(0.022, pal.eye, { seed: 81 });
  const sp = S.surface(bodyGeo, [0, -0.4, 1], { from: [0, 0, 0.03], inset: 0.008 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      accents: [...barbels, dorsal, ...pecs, ...pelvics, tailFin],
      fx: [spark, S.variantFx(root)],
    },
    hints: {
      personality: 'calm',
      locomotion: 'float',
      hover: true,
      hoverAmp: 0.045,
      breathAmp: 0.85,
      blinkEvery: 3.8,
    },
  };
}
