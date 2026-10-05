// =============================================================================
// RIMEHORN — Frost, stage 1 (single-stage), uncommon.
// "Shaggy ibex, horns of clear ice, frost-breath. Sure-footed elder."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). A stocky mountain goat in a snow-white
// winter fleece: one smooth barrel of a body whose coat hangs off the flanks
// in a fringe of soft locks (frost-blue at the tips), a woolly cape over the
// shoulders, slate-grey legs on dark sure-footed hooves. The elder's face is
// slate with a pale muzzle, bushy white brows and a long white beard. The
// signature: two great ibex crescents of clear glacier ice sweeping back
// from the crown, ridged and glowing cold from within. A slow frost-breath
// mist drifts from its muzzle. Static pieces per node are merged into one
// smooth vertex-coloured mesh (./soft.js).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const WOOL_LO = 0x9aa6bc, WOOL = 0xdfe6f0, WOOL_HI = 0xfbfdff, FROST = 0xb4d6f2, SLATE_LO = 0x3c4252, SLATE = 0x5c6476, SLATE_HI = 0x7c8496,
  MUZZLE = 0xc8ccd6, HOOF = 0x2a2e38, ICE_LO = 0x3f86c8, ICE = 0x8ecaf4, ICE_HI = 0xeefaff;

// A hanging lock of wool (tip down), rooted at `at`, flared out by `out`.
function lock(len, w, at, out, lean, from, to) {
  const g = S.taper(len, w, { r1: w * 0.2, curve: 0.25, radial: 6, rings: 4, capSeg: 1, sx: 1.5, sz: 0.65 });
  S.paint(g, { from, to, axis: 'y', noise: 0.015 });
  g.rotateX(Math.PI); // hang down (curve now sweeps back)
  g.rotateZ(out);
  g.rotateX(lean);
  return S.pose(g, at);
}

export function build_rimehorn(kit = kitDefault) {
  const pal = kit.palette(['frost']);
  const wool = S.vcMat(kit, { rough: 0.86 });
  const ice = kit.mat(0xffffff, { vertexColors: true, flat: false, rough: 0.14, metal: 0.05, emissive: 0x24507a, emissiveIntensity: 0.45 });
  ice.userData.softVC = true;

  const root = new THREE.Group();

  // --- Body: a stocky barrel, fleece-white back over blue-grey under-wool. --
  const torso = S.spindle({
    len: 0.5, r: 0.165, sx: 0.96, sy: 1.04, p: 0.9, radial: 18, rings: 13,
    profile: (t) => 0.84 + 0.1 * S.bump(t, 0.22, 0.25) + 0.16 * S.bump(t, 0.7, 0.3),
    belly: 0.14, arch: (t) => 0.025 * S.sstep(0.45, 1, t),
  });
  S.paint(torso, { from: WOOL_LO, to: WOOL_HI, axis: 'y', exp: 0.7, noise: 0.015, seed: 120 });
  const neck = S.spindle({ len: 0.24, r: 0.09, sx: 0.95, sy: 1.05, radial: 14, rings: 8, profile: (t) => 1.1 - 0.25 * t });
  S.pose(neck, [0, 0.11, 0.23], [-0.85, 0, 0]);
  S.paint(neck, { from: WOOL, to: WOOL_HI, axis: 'y', noise: 0.015, seed: 121 });
  // a woolly cape over the withers and a shaggy chest bib
  const cape = S.puff(0.11, { count: 7, spread: 0.85, seed: 122, sy: 0.7, blend: 0.8, radial: 9, rings: 6 });
  S.pose(cape, [0, 0.13, 0.12], [0, 0, 0], [1.25, 0.8, 1.15]);
  S.paint(cape, { from: WOOL, to: WOOL_HI, axis: 'y', noise: 0.02, seed: 123 });
  const bib = S.puff(0.075, { count: 5, spread: 0.7, seed: 124, sy: 1.15, blend: 0.8, radial: 9, rings: 6 });
  S.pose(bib, [0, -0.02, 0.27], [0.3, 0, 0], [1.1, 1.2, 0.7]);
  S.paint(bib, { from: WOOL_LO, to: WOOL_HI, axis: 'y', noise: 0.02, seed: 125 });
  // the fleece fringe: soft locks hanging off both flanks, frost at the tips
  const locks = [];
  for (const s of [1, -1]) {
    for (let i = 0; i < 6; i++) {
      const z = 0.19 - i * 0.075;
      const at = S.surface(torso, S.dirYP(s * 1.35, -0.42), { from: [0, 0, z], inset: 0.02 });
      locks.push(lock(0.1 + 0.02 * Math.sin(i * 2.1), 0.034, at, s * 0.3, 0.12, WOOL_HI, FROST));
    }
  }
  // two belly locks at the front, between the forelegs
  for (const x of [0.03, -0.03]) locks.push(lock(0.085, 0.03, S.surface(bib, [0, -1, 0.2], { from: [x, -0.02, 0.27], inset: 0.02 }), x * 3, -0.1, WOOL_HI, FROST));
  const body = S.bake([torso, neck, cape, bib, ...locks], wool, 'body');
  root.add(body);
  body.position.y = 0.45;

  // --- Head: slate face, pale muzzle, white brows and the elder's beard. ---
  const headGeo = S.spindle({
    len: 0.26, r: 0.085, sx: 0.92, sy: 1.0, pTail: 1.0, pNose: 1.1, radial: 16, rings: 12,
    profile: (t) => (t < 0.4 ? 1.0 : S.lerp(1.0, 0.66, S.sstep(0.4, 0.9, t))),
    syAt: (t) => S.lerp(1.0, 0.82, S.sstep(0.4, 0.85, t)),
    arch: (t) => -0.012 * S.sstep(0.45, 0.95, t),
  });
  S.paint(headGeo, { from: SLATE_LO, to: SLATE_HI, axis: 'y', noise: 0.012, seed: 126 });
  S.overlay(headGeo, MUZZLE, (x, y, z) => S.sstep(0.05, 0.11, z) * 0.9);
  S.overlay(headGeo, WOOL, (x, y, z) => S.sstep(-0.02, -0.12, z) * S.sstep(0.0, 0.06, y) * 0.9); // fleecy crown/poll
  const SK = [0, 0.0, -0.03];
  const nose = S.pose(S.paint(S.ball(0.016, { sx: 1.4, sy: 0.75, radial: 7, rings: 5 }), 0x2a2e38), S.surface(headGeo, [0, 0.25, 1], { from: [0, -0.01, 0.06], inset: 0.004 }));
  const mouth = S.paint(S.groove(headGeo, [[-0.3, -0.45], [-0.12, -0.5], [0, -0.5], [0.12, -0.5], [0.3, -0.45]], { from: [0, 0, 0.06], radius: 0.0045, lift: -0.001 }), 0x2a2e38);
  // bushy white elder brows, sweeping out over the eyes
  const brows = [];
  for (const s of [1, -1]) for (let i = 0; i < 2; i++) {
    const g = S.taper(0.05 - i * 0.012, 0.016, { r1: 0.004, curve: -0.25, radial: 5, rings: 4, capSeg: 1, sx: 1.5, sz: 0.6 });
    S.paint(g, { from: WOOL, to: WOOL_HI, axis: 'y' });
    S.aim(g, [s * 1, 0.35 - i * 0.25, -0.35]);
    brows.push(S.pose(g, S.surface(headGeo, S.dirYP(s * (0.42 + i * 0.16), 0.55 - i * 0.08), { from: SK, inset: 0.01 })));
  }
  // the long white beard: locks hanging from the chin
  const beard = [];
  for (let i = 0; i < 5; i++) {
    const u = i / 4 - 0.5;
    const at = S.surface(headGeo, [u * 0.8, -1, 0.3], { from: [u * 0.03, -0.01, 0.04], inset: 0.015 });
    beard.push(lock(0.1 - Math.abs(u) * 0.06, 0.022, at, u * 0.5, -0.25, WOOL_HI, WOOL));
  }
  const head = S.bake([headGeo, nose, mouth, ...brows, ...beard], wool, 'head');
  kit.at(body, head, 0, 0.27, 0.36, { rx: 0.38 });

  const eyeOpts = { irisColor: 0xc89a3a, pupilColor: 0x1c140a, skinColor: SLATE, glintSize: 0.013 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.032, 0.66, 0.24, eyeOpts, { sink: 0.42, front: 0.58, from: SK });
  const eyeR = S.seatEye(kit, head, headGeo, 0.032, -0.66, 0.24, eyeOpts, { sink: 0.42, front: 0.58, from: SK });

  // Small slate ears held out sideways (accents — they flick).
  const mkEar = () => new THREE.Mesh(S.ear(0.075, 0.045, { color: SLATE, inner: 0xc8b8b8, tip: 1.3, cup: 0.4, depth: 0.4, radial: 8, rings: 6 }), wool);
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(1.15, 0.45), { from: SK, inset: 0.01 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.02, { rz: -1.25, ry: 0.3 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.02, { rz: 1.25, ry: -0.3 });

  // --- THE ICE HORNS: ridged ibex crescents of glacier glass. --------------
  const horns = [1, -1].map((s) => {
    const base = S.surface(headGeo, S.dirYP(s * 0.32, 1.0), { from: SK, inset: 0.018 });
    const pts = [[0, 0, 0], [s * 0.018, 0.075, -0.025], [s * 0.045, 0.14, -0.085], [s * 0.075, 0.175, -0.17], [s * 0.1, 0.16, -0.26], [s * 0.115, 0.1, -0.32], [s * 0.12, 0.03, -0.33]];
    const g = S.tubeAlong(pts, (t) => S.lerp(0.032, 0.006, Math.pow(t, 0.85)) * (1 + 0.1 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 6)), 2) * (1 - t)), { radial: 8, tubular: 22 });
    // glacier blue at the root, clear pale ice to a white tip, frost rings
    S.paint(g, { fn: (x, y, z) => S.clamp01(Math.hypot(x, y, z) / 0.36), from: ICE_LO, to: ICE_HI, exp: 0.8 });
    S.overlay(g, ICE, (x, y, z) => { const d = Math.hypot(x, y, z) / 0.36; return 0.5 * S.bump(d, 0.4, 0.25); });
    S.overlay(g, 0xffffff, (x, y, z) => { const d = Math.hypot(x, y, z) / 0.36; return Math.pow(Math.max(0, Math.sin(d * Math.PI * 6)), 8) * (1 - d) * 0.5; });
    const m = new THREE.Mesh(g, ice);
    m.name = 'iceHorn';
    kit.at(head, m, base[0], base[1], base[2]);
    return m;
  });
  const hornGlow = S.glow(0x9fd8ff, 0.3, 0.25);
  hornGlow.position.set(0, 0.17, -0.18);
  head.add(hornGlow);

  // --- Legs: sturdy, slate below the fleece, dark hooves. -----------------
  const fore = { thighR: 0.068, shinR: 0.034, kneeR: 0.044, ankleR: 0.031, pawR: 0.04, pawLen: 1.1, pawH: 0.05, toes: 0, bend: -0.1, split: 0.5, bulge: 0.12 };
  const hind = { thighR: 0.078, shinR: 0.034, kneeR: 0.045, ankleR: 0.031, pawR: 0.04, pawLen: 1.1, pawH: 0.05, toes: 0, bend: 0.32, split: 0.47, bulge: 0.14 };
  const legs = [[0.085, -0.08, 0.17, fore], [-0.085, -0.08, 0.17, fore], [0.085, -0.06, -0.17, hind], [-0.085, -0.06, -0.17, hind]].map(([x, y, z, d]) => {
    const l = S.softLeg(0.45 + y, wool, { ...d, color: WOOL_LO, shinColor: SLATE, pawColor: HOOF, radial: 7 });
    kit.at(body, l, x, y, z);
    return l;
  });

  // --- A short fluffy tail, flicked up. -------------------------------------
  const tail = S.softTail(2, wool, { segLen: 0.04, startR: 0.03, endR: 0.032, curl: 0.5, rootPitch: 0.7, radial: 8, color: WOOL_HI });
  kit.at(body, tail, 0, 0.1, -0.23);
  const tuft = new THREE.Mesh(S.paint(S.puff(0.04, { count: 4, spread: 0.55, seed: 127, sy: 1.0, radial: 8, rings: 6 }), WOOL_HI), wool);
  tuft.name = 'tailTuft';
  kit.at(tail.tipAnchor, tuft, 0, 0, -0.01);

  // Steady frost-breath mist from the muzzle.
  const breath = kit.mote(6, { color: 0xeaf6ff, size: 0.016, radius: 0.04, height: 0.08, speed: 0.6, seed: 123 });
  kit.at(head, breath, 0, -0.06, 0.18);

  const spark = kit.heartspark(0.03, pal.eye, { seed: 124 });
  const sp = S.surface(bib, [0, 0.1, 1], { from: [0, 0.0, 0.27], inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  root.add(kit.shadowDisc(0.32, 0.36));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR],
      fx: [breath, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.8,
      blinkEvery: 4.6,
    },
  };
}
