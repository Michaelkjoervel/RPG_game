// =============================================================================
// GLOWVERN — Lumen, stage 2 (Lanterling awakens at L19).
// "Cat-sized lantern wyvern, glass-bell tail glows. Guides lost travelers."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). A small, friendly wyvern perched upright
// on two sturdy legs: a dusk-teal body with a cream plated belly, a curving
// neck, a round dragon face with big warm eyes, swept-back horns and little
// frill ears, a row of soft dorsal spines. Its wings are real membranes
// (arm + finger spars, scalloped edges) in warm lantern-paper amber, held
// half raised. The signature is Lanterling's externalized heartspark grown
// up: the tail arcs up and over and a GLASS BELL LANTERN hangs from its tip,
// the heartspark glowing inside it.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const TEAL_LO = 0x1c4448, TEAL = 0x2e7472, TEAL_HI = 0x62ae9e, BELLY = 0xf0e0b4, BELLY_LO = 0xc8b484, SPINE = 0xe8c070, BRONZE = 0x8a6a34;

// A glass bell (opening down), top at the origin.
function bellGeo(h, r) {
  const pts = [[0.0, 0], [0.22, -0.02], [0.36, -0.1], [0.44, -0.3], [0.52, -0.6], [0.66, -0.86], [0.86, -0.98], [0.94, -1.0]];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x * r, y * h)), 16);
  g.deleteAttribute('uv');
  return g;
}

export function build_glowvern(kit = kitDefault) {
  const pal = kit.palette(['lumen']);
  const skin = S.vcMat(kit, { rough: 0.45, metal: 0.05 });
  const membrane = kit.mat(0xffffff, { vertexColors: true, rough: 0.55, side: THREE.DoubleSide, transparent: true, opacity: 0.92, emissive: 0x4a2c08, emissiveIntensity: 0.35 });
  membrane.userData.softVC = true;
  const glass = kit.mat(0xfff4d8, { rough: 0.08, metal: 0.05, transparent: true, opacity: 0.38, side: THREE.DoubleSide, emissive: 0xffc860, emissiveIntensity: 0.4 });
  glass.depthWrite = false;
  const flameMat = kit.mat(0xffe29a, { unlit: true });

  const root = new THREE.Group();

  // --- Body: upright wyvern torso (chest up), plated cream belly, spines. -------
  const torso = S.spindle({
    len: 0.32, r: 0.1, sx: 0.92, sy: 1.05, p: 0.95, radial: 16, rings: 12, belly: 0.1,
    profile: (t) => 0.8 + 0.2 * S.bump(t, 0.45, 0.4) + 0.08 * S.bump(t, 0.8, 0.25),
  });
  S.paint(torso, { from: TEAL_LO, to: TEAL_HI, axis: 'y', noise: 0.012, seed: 190 });
  S.overlay(torso, BELLY, (x, y, z) => S.sstep(-0.03, -0.075, y) * (1 - S.sstep(0.05, 0.08, Math.abs(x))));
  for (let i = 0; i < 5; i++) S.overlay(torso, BELLY_LO, (x, y, z) => (y < -0.05 ? S.bump(z, -0.1 + i * 0.05, 0.006) * 0.7 : 0));
  torso.rotateX(-0.6);
  const neck = S.tubeAlong([[0, 0.05, 0.08], [0, 0.13, 0.12], [0, 0.2, 0.13], [0, 0.25, 0.16]], (t) => S.lerp(0.07, 0.048, t), { radial: 10, tubular: 10 });
  S.paint(neck, { from: TEAL, to: TEAL_HI, axis: 'y', noise: 0.012 });
  S.overlayN(neck, BELLY, (nx, ny, nz) => S.sstep(0.35, 0.75, nz - ny * 0.2) * 0.9);
  const spines = [];
  for (let i = 0; i < 6; i++) {
    const u = i / 5;
    const g = S.taper(0.05 - u * 0.02, 0.018 - u * 0.006, { r1: 0.003, curve: -0.5, radial: 5, rings: 3, capSeg: 1, sx: 0.5 });
    S.paint(g, { from: TEAL, to: SPINE, axis: 'y' });
    S.aim(g, [0, 1, -0.5 - u * 0.3]);
    const at = i < 2
      ? S.surface(neck, [0, 0.3, -1], { from: [0, 0.2 - i * 0.07, 0.13 - i * 0.02], inset: 0.006 })
      : S.surface(torso, [0, 1, -0.4], { from: [0, 0.02 - (i - 2) * 0.03, 0.04 - (i - 2) * 0.06], inset: 0.006 });
    spines.push(S.pose(g, at));
  }
  const body = S.bake([torso, neck, ...spines], skin, 'body');
  root.add(body);
  body.position.y = 0.24;

  // --- Head: round dragon face, big warm eyes, horns; frill ears. -----------------
  const headGeo = S.spindle({
    len: 0.16, r: 0.068, sx: 1.05, sy: 0.95, pTail: 1, pNose: 1.2, radial: 16, rings: 12,
    profile: (t) => (t < 0.45 ? 1 : S.lerp(1, 0.66, S.sstep(0.45, 0.95, t))),
    syAt: (t) => S.lerp(1, 0.78, S.sstep(0.45, 0.95, t)),
  });
  S.paint(headGeo, { from: TEAL_LO, to: TEAL_HI, axis: 'y', noise: 0.01, seed: 191 });
  S.overlay(headGeo, BELLY, (x, y, z) => S.sstep(-0.02, -0.045, y) * 0.9);
  const nostrils = [1, -1].map((sd) => S.pose(S.paint(S.ball(0.006, { radial: 6, rings: 4 }), 0x10282a), S.surface(headGeo, [sd * 0.3, 0.3, 1], { from: [0, 0, 0.04], inset: 0.002 })));
  const horns = [1, -1].map((sd) => {
    const g = S.taper(0.08, 0.014, { r1: 0.003, curve: -0.45, radial: 6, rings: 4, capSeg: 1 });
    S.paint(g, { from: 0x3a5a50, to: SPINE, axis: 'y' });
    S.aim(g, [sd * 0.35, 0.55, -1]);
    return S.pose(g, S.surface(headGeo, S.dirYP(sd * 0.45, 0.8), { inset: 0.008 }));
  });
  const head = S.bake([headGeo, ...nostrils, ...horns], skin, 'head');
  kit.at(body, head, 0, 0.27, 0.2, { rx: 0.15 });
  const eyeOpts = { irisColor: 0xf0a832, pupilColor: 0x2a1604, skinColor: 0x2e7472, glintSize: 0.012 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.03, 0.55, 0.15, eyeOpts, { sink: 0.42, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.03, -0.55, 0.15, eyeOpts, { sink: 0.42, front: 0.55 });
  const mkFrill = () => {
    const g = S.ear(0.07, 0.05, { color: TEAL, inner: SPINE, tip: 1.6, cup: 0.4, depth: 0.3, radial: 8, rings: 6 });
    return new THREE.Mesh(g, skin);
  };
  const earL = mkFrill(), earR = mkFrill();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(1.3, 0.35), { inset: 0.01 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.02, { rz: -1.2, ry: 0.5 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.02, { rz: 1.2, ry: -0.5 });

  // --- Lantern-paper membrane wings, half raised. -----------------------------------
  const wings = [1, -1].map((side) => {
    const w = S.batWing(0.34, membrane, skin, {
      side, chord: 0.2, color: { root: 0xf0b860, tip: 0xffe2a8 }, edge: 0xe89a48, spar: TEAL, claw: SPINE, billow: 0.06,
    });
    const at = S.surface(torso, [side, 0.6, 0.2], { from: [0, 0.04, 0.02], inset: 0.02 });
    kit.at(body, w, at[0], at[1], at[2], { rz: side * 0.6, ry: -side * 0.45, rx: 0.25 });
    return w;
  });

  // --- Two sturdy legs (a wyvern perches on its hind legs). --------------------------
  const legs = [[0.07, -0.08, -0.02], [-0.07, -0.08, -0.02]].map(([x, y, z]) => {
    const l = S.softLeg(0.24 + y, skin, { thighR: 0.052, shinR: 0.024, kneeR: 0.03, ankleR: 0.022, pawR: 0.036, pawLen: 1.4, toes: 3, bend: 0.35, split: 0.48, bulge: 0.4, color: TEAL, shinColor: TEAL_LO, pawColor: 0x3a5048, radial: 7 });
    kit.at(body, l, x, y, z);
    return l;
  });

  // --- The tail arcs up and over; the glass bell lantern hangs from its tip. ---
  const curls = [0.25, 0.3, 0.3, 0.25, 0.1, -0.1];
  const tail = S.softTail(6, skin, {
    segLen: 0.06, startR: 0.04, endR: 0.016, curl: (i) => curls[i], rootPitch: 0.2, radial: 8,
    color: (t) => S.mixHex(TEAL, TEAL_LO, t),
  });
  kit.at(body, tail, 0, -0.08, -0.14);
  const lantern = new THREE.Group(); lantern.name = 'bellLantern';
  lantern.rotation.x = -tail.tipPitch; // hang level, whatever the tail's arc
  const hanger = S.paint(S.limb(0.03, 0.005, 0.005, { radial: 6, capSeg: 2, shaftSeg: 2 }), BRONZE);
  const cap = S.paint(S.ball(0.022, { sy: 0.6, radial: 10, rings: 6 }), BRONZE);
  cap.translate(0, -0.032, 0);
  lantern.add(new THREE.Mesh(S.merge([hanger, cap]), skin));
  const bell = new THREE.Mesh(bellGeo(0.1, 0.05), glass);
  bell.name = 'glassBell';
  bell.position.y = -0.03;
  lantern.add(bell);
  const flame = new THREE.Mesh(S.ball(0.018, { sy: 1.4, radial: 8, rings: 6 }), flameMat);
  flame.name = 'bellFlame';
  flame.position.y = -0.085;
  lantern.add(flame);
  const bellGlow = S.glow(0xffd070, 0.3, 0.5);
  bellGlow.position.y = -0.08;
  lantern.add(bellGlow);
  const heart = kit.heartspark(0.022, pal.eye, { seed: 191 });
  kit.at(lantern, heart, 0, -0.08, 0);
  kit.at(tail.tipAnchor, lantern, 0, 0, 0);

  root.add(kit.shadowDisc(0.24, 0.36));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      wings: wings.map((w) => w.bones),
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, lantern],
      fx: [heart, S.variantFx(root)],
    },
    hints: {
      personality: 'calm',
      locomotion: 'fly',
      breathAmp: 0.9,
      blinkEvery: 3.4,
    },
  };
}
