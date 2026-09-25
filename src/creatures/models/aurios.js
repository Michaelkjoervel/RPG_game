// =============================================================================
// AURIOS, THE DAWNHART — Lumen, Firstborn legendary.
// "Great stag of morning light, antlers a rising sunburst, walks above the
// ground on light itself, dawn motes." (Design Bible §4, §2)
// =============================================================================
// A CROWN JEWEL — the first of three legendary Firstborn. The bar here is
// "a player who hunted this for forty hours gasps when it steps out of the
// trees", so the build is SILHOUETTE-FIRST (Design Bible §8: distinct
// silhouette at 64px). Three shapes carry it, in this order of importance:
//
//   1. THE SUNBURST CROWN. Not a spiky tuft — a real heraldic rising sun.
//      Two thick, curved, solid-gold antler BEAMS sweep up and outward from
//      the brow, each carrying a fan of tines that lengthen toward the
//      centre, and behind them a radial fan of emissive dawn rays springs
//      from a single crown point. Mass (beams, reads black-on-white in a
//      silhouette test) + radiance (rays) — one without the other is either
//      a dull rack or a smear of light.
//   2. STAG PROPORTIONS. Long legs (a full 0.84 hip-to-hoof, ~45% of the
//      whole body height), a deep chest orb, tucked flanks, and a raised
//      neck carrying the head well above the shoulder line. Everything the
//      earlier pass got wrong — short legs + a head level with the barrel —
//      is what made it read "sheep" instead of "stag".
//   3. WALKS ON LIGHT. The hooves genuinely never touch the dirt: they rest
//      HOVER (0.13) above y=0 and the only thing at y=0 is a pool of light,
//      so groundPlant() plants the *light*, not the animal. Each hoof also
//      carries its own small disc, and dawn motes rise out of the pool.
//
// KIT CONVENTIONS (kit.js header): faces +Z, nose-to-tail parts bake their
// axis swing with geometry.rotateX(Math.PI/2) — NEVER rotateZ, which lays
// the whole animal broadside — and the hips are placed from the measured leg
// drop so the hooves land exactly where we want them.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

import * as S from './soft.js';

export function build_aurios(kit = kitDefault) {
  // Visual pass v2 (soft stylized): the barrel, chest, haunch, neck and dawn
  // saddle are ONE sculpted, vertex-painted stag form (warm tan under-body ->
  // ivory top, a warm gold saddle along the spine, a radiant pale belly); the
  // head is a single wedge (skull flowing into a long muzzle); the legs are
  // slender tapered deer legs with real joints and glowing gold hooves. The
  // crown, rays, dawn mane and light pools keep the Firstborn design below.
  const coatHex = 0xefe0bd;
  const coat = S.vcMat(kit, { rough: 0.45, metal: 0.04 });
  const COAT_LO = 0xcfae7e, COAT_HI = 0xfff6e2, PALE = 0xfffaf0, SADDLE = 0xdcae63, LEGC = 0xdcc396, HOOF = 0xf0b860;
  const coatPale = kit.mat(PALE, { rough: 0.32 });
  const antlerMat = kit.mat(0xffc978, { rough: 0.3, metal: 0.12, emissive: 0xff9c34, emissiveIntensity: 0.8 });
  const antlerTip = kit.mat(0xffe9bb, { rough: 0.25, metal: 0.1, emissive: 0xffbe58, emissiveIntensity: 1.1 });
  // Rays are authored a stop or two down: ACES tone mapping washes bright
  // saturated unlit colours toward cream, and the sunburst must stay gold.
  const rayMat = kit.mat(0xf09520, { unlit: true, transparent: true, opacity: 0.92 });
  const rayCore = kit.mat(0xffcf6a, { unlit: true, transparent: true, opacity: 0.95 });
  const maneMat = kit.mat(0xf5a832, { unlit: true, transparent: true, opacity: 0.8, side: THREE.DoubleSide });

  const root = new THREE.Group();

  // --- Stag body: barrel + deep chest + round haunch + raised neck ---------
  const HOVER = 0.13;
  const bodyGeo = S.spindle({
    len: 1.12, r: 0.23, sx: 0.86, sy: 1.08, p: 0.9, radial: 22, rings: 18,
    profile: (t) => 0.7 + 0.22 * S.bump(t, 0.2, 0.26) + 0.42 * S.bump(t, 0.76, 0.28),
    belly: (t) => 0.08 + 0.3 * S.bump(t, 0.42, 0.3),
    arch: (t) => 0.05 * S.sstep(0.45, 1, t) - 0.015 * S.bump(t, 0.4, 0.3),
  });
  S.paint(bodyGeo, { from: COAT_LO, to: COAT_HI, axis: 'y', exp: 0.9, noise: 0.012, seed: 61 });
  S.overlay(bodyGeo, SADDLE, (x, y, z) => S.sstep(0.1, 0.22, y) * (1 - S.sstep(0.06, 0.16, Math.abs(x))) * 0.9);
  S.overlay(bodyGeo, PALE, (x, y, z) => S.sstep(-0.1, -0.2, y) * 0.9);
  const NECK_TILT = 0.58;
  const neckGeo = S.spindle({ len: 0.62, r: 0.135, sx: 0.88, sy: 1.12, p: 0.9, radial: 16, rings: 12, profile: (t) => 1.25 - 0.45 * t });
  const nDir = [0, Math.cos(NECK_TILT), Math.sin(NECK_TILT)];
  const neckBase = [0, 0.14, 0.4];
  S.pose(neckGeo, [0, neckBase[1] + nDir[1] * 0.26, neckBase[2] + nDir[2] * 0.26], [-(Math.PI / 2 - NECK_TILT), 0, 0]);
  S.paint(neckGeo, { from: COAT_LO, to: COAT_HI, axis: 'y', noise: 0.012, seed: 65 });
  S.overlay(neckGeo, SADDLE, (x, y, z) => S.sstep(0.02, 0.1, y - (z - 0.5) * 0.9) * (1 - S.sstep(0.03, 0.1, Math.abs(x))) * 0.6);
  // pale ruff where neck meets chest
  const ruffGeo = S.puff(0.11, { count: 6, spread: 0.7, seed: 66, sy: 1.1, blend: 0.72 });
  S.pose(ruffGeo, [0, 0.06, 0.5], [0.4, 0, 0], [1.2, 1.1, 0.7]);
  S.paint(ruffGeo, { from: 0xf2e6cc, to: PALE, axis: 'y', noise: 0.015 });
  const body = S.bake([bodyGeo, neckGeo, ruffGeo], coat, 'body');
  root.add(body);
  const LEG = 0.84;
  const hipY = -0.16;
  body.position.y = HOVER + LEG - hipY;

  // A mane of dawn light along the crest of the neck (flat light blades,
  // face turned sideways so they read against the sky).
  const maneAccents = [];
  for (let i = 0; i < 7; i++) {
    const t = 0.06 + i * 0.13;
    const len = 0.28 - Math.abs(i - 2.5) * 0.03;
    const strand = kit.leafBlade(len, maneMat, { width: len * 0.3 });
    const c = [0, neckBase[1] + nDir[1] * 0.56 * t * 1.1 + 0.1, neckBase[2] + nDir[2] * 0.56 * t * 1.1 - 0.06];
    maneAccents.push(kit.at(body, strand, (i % 2 ? 0.022 : -0.022), c[1], c[2], { ry: Math.PI / 2, rx: 0.95 + i * 0.05 }));
  }
  const ruffAccents = [];

  // --- Head: one noble wedge — skull flowing into a long stag muzzle -------
  const headY = neckBase[1] + nDir[1] * 0.56 + 0.02;
  const headZ = neckBase[2] + nDir[2] * 0.56 + 0.06;
  const headGeo = S.spindle({
    len: 0.46, r: 0.145, sx: 0.84, sy: 1.0, pTail: 1.0, pNose: 1.1, radial: 20, rings: 16, belly: 0.08,
    profile: (t) => (t < 0.38 ? 1.0 : S.lerp(1.0, 0.56, S.sstep(0.38, 0.72, t))) - 0.1 * S.sstep(0.75, 1, t),
    syAt: (t) => S.lerp(0.92, 0.74, S.sstep(0.4, 0.75, t)),
    arch: (t) => -0.05 * S.sstep(0.35, 0.8, t),
  });
  S.paint(headGeo, { from: COAT_LO, to: COAT_HI, axis: 'y', noise: 0.01, seed: 64 });
  S.overlay(headGeo, PALE, (x, y, z) => S.sstep(0.13, 0.2, z) * 0.85);
  const noseGeo = S.ball(0.04, { sx: 1.25, sy: 0.8, radial: 10, rings: 7 });
  S.pose(noseGeo, S.surface(headGeo, [0, 0.2, 1], { from: [0, -0.05, 0.1], inset: 0.02 }));
  S.paint(noseGeo, 0xe8d2b0);
  const head = S.bake([headGeo, noseGeo], coat, 'head');
  kit.at(body, head, 0, headY, headZ, { rx: 0.05 });
  const SK = [0, 0.0, -0.1];
  const eyeOpts = { irisColor: 0xffe9a8, scleraColor: 0x33270f, pupil: true, skinColor: coatHex, glintSize: 0.02 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.048, 0.72, 0.2, eyeOpts, { sink: 0.45, front: 0.45, from: SK });
  const eyeR = S.seatEye(kit, head, headGeo, 0.048, -0.72, 0.2, eyeOpts, { sink: 0.45, front: 0.45, from: SK });
  const mkEar = () => new THREE.Mesh(S.ear(0.17, 0.095, { color: 0xe8d4ac, inner: 0xf4c8a8, tip: 1.2, cup: 0.5, depth: 0.32 }), coat);
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.8, 0.6), { from: SK, inset: 0.012 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.02, { rz: -1.0, ry: 0.4, rx: -0.2 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.02, { rz: 1.0, ry: -0.4, rx: -0.2 });

  // --- THE SUNBURST CROWN -------------------------------------------------
  // Everything hangs off one crown point just behind the brow, so the whole
  // structure genuinely radiates from a single origin the way a rising sun
  // does. `crownAccents` all go into parts.accents for the animator's idle
  // sway, which makes the crown shimmer rather than sit dead.
  const crownAccents = [];
  const crown = new THREE.Group(); crown.name = 'sunburstCrown';
  kit.at(head, crown, 0, 0.12, -0.12);
  // The sun core the rays spring from.
  kit.at(crown, new THREE.Mesh(S.ball(0.075, { sz: 0.55, radial: 14, rings: 8 }), rayCore.clone()), 0, 0.02, -0.01);
  kit.at(crown, S.glow(0xffd070, 0.42, 0.7), 0, 0.02, -0.05);

  // 1a. Two solid antler beams, each with three tines. FEW AND THICK: the
  //     first pass used thin beams plus eleven thin rays and the whole crown
  //     collapsed into a scribble of hair at silhouette size. A tine grafted
  //     at parameter t must be offset by the beam's own bend (horn() displaces
  //     x by bend*t^2*len as it rises) or it floats off the beam.
  // horn()'s bend accelerates as t^2, so a strong bend spends the beam's top
  // third travelling SIDEWAYS and the tip finishes below the beam's own
  // shoulder — a ram's horn, not a rising crown. Keep the bend gentle and get
  // the spread from the mounting angle instead, so every tip still rises.
  const BEAM_LEN = 0.78, BEAM_BEND = 0.42;
  for (const side of [1, -1]) {
    const beam = kit.horn(BEAM_LEN, antlerMat, { baseR: 0.072, tipR: 0.016, bend: side * BEAM_BEND, segments: 8 });
    const beamAt = kit.at(crown, beam, side * 0.085, -0.01, 0.03, { rz: -side * 0.62, rx: -0.14 });
    crownAccents.push(beamAt);
    // Tines: the low one splays near-horizontal and long (it sets the rack's
    // WIDTH, and width is what makes a crown read at 64px), the high ones
    // stand nearly parallel to the beam — the classic sunburst rhythm.
    const tines = [[0.24, 0.42, 1.05], [0.5, 0.36, 0.66], [0.76, 0.3, 0.34], [0.94, 0.2, 0.16]];
    for (const [t, len, splay] of tines) {
      const tine = kit.horn(len, antlerMat, { baseR: 0.032, tipR: 0.008, bend: side * 0.55, segments: 6 });
      kit.at(beamAt, tine, BEAM_BEND * t * t * BEAM_LEN * side, t * BEAM_LEN, 0, { rz: -side * splay, ry: side * 0.14 });
    }
    // A small bright bead at the beam tip, so the crown terminates in light
    // (kept modest — a fat bead on a curved beam reads as a claw).
    kit.at(beamAt, new THREE.Mesh(S.ball(0.024, { radial: 10, rings: 7 }), antlerTip), BEAM_BEND * BEAM_LEN * side, BEAM_LEN, 0);
  }

  // 1b. The rising-sun ray fan, sitting BEHIND the beams (z −0.12) so the two
  //     layers read as depth instead of clutter. Seven wide, flattened rays —
  //     solid triangles of light, not hairs — with one dead centre and the
  //     rest interleaved into the gaps the antlers leave.
  const RAY_ANGLES = [0, 0.34, -0.34, 0.82, -0.82, 1.18, -1.18, 1.52, -1.52];
  const RAY_LENS = [0.74, 0.4, 0.4, 0.52, 0.52, 0.46, 0.46, 0.34, 0.34];
  for (let i = 0; i < RAY_ANGLES.length; i++) {
    const ang = RAY_ANGLES[i];
    const ray = kit.cone(0.075, RAY_LENS[i], i % 2 === 0 ? rayMat.clone() : rayCore.clone(), { segments: 4 });
    const rayAt = kit.at(crown, ray, Math.sin(ang) * 0.02, 0.0, -0.15, { rz: -ang, rx: -0.16, sz: 0.28 });
    crownAccents.push(rayAt);
  }

  // --- Legs: long, slender, real deer joints; glowing gold hooves --------
  const legDefs = [
    [0.13, hipY, 0.3, -0.1, 0.11], [-0.13, hipY, 0.3, -0.1, 0.11],
    [0.13, hipY + 0.02, -0.33, 0.45, 0.14], [-0.13, hipY + 0.02, -0.33, 0.45, 0.14],
  ];
  const legs = legDefs.map(([x, y, z, bend, thighR]) => kit.at(body, S.softLeg(LEG + (y - hipY), coat, {
    thighR, shinR: 0.044, kneeR: 0.054, ankleR: 0.034, pawR: 0.048, pawLen: 1.15, pawH: 0.055, toes: 0,
    bend, split: 0.48, bulge: 0.34, color: 0xe6d0a8, shinColor: LEGC, pawColor: HOOF, radial: 10,
  }), x, y, z));
  // Each hoof stands on its own small disc of light...
  for (const l of legs) {
    l.foot.geometry.computeBoundingBox();
    const bb = l.foot.geometry.boundingBox;
    kit.at(l.knee, S.lightPool(0xffe2a0, 0.13, 0.75), 0, bb.min.y - 0.035, (bb.min.z + bb.max.z) / 2);
    const hg = S.glow(0xffc870, 0.2, 0.55);
    hg.position.set(0, bb.min.y + 0.03, bb.max.z - 0.03);
    l.knee.add(hg);
  }
  // ...and the whole animal stands over one wide pool — the ONLY part that
  // reaches y=0, so groundPlant() plants the light, not the hooves.
  const poolY = -(HOVER + LEG - hipY) + 0.02;
  kit.at(body, S.lightPool(0xffe9b0, 0.62, 0.8, 1.35), 0, poolY, -0.02);
  kit.at(body, S.lightPool(0xffca7a, 1.0, 0.45, 1.3), 0, poolY - 0.002, -0.02);

  // Short upright deer tail with a bright pale flash.
  const tail = S.softTail(3, coat, { segLen: 0.085, startR: 0.055, endR: 0.035, curl: 0.25, rootPitch: 0.55, color: (t) => S.mixHex(0xe6cfa2, PALE, t) });
  kit.at(body, tail, 0, 0.14, -0.53);
  kit.at(tail.tipAnchor, new THREE.Mesh(S.paint(S.puff(0.045, { count: 5, seed: 9, sy: 1.1 }), PALE), coat), 0, 0.0, 0.0);

  // --- Dawn light ---------------------------------------------------------
  // Two mote layers at different hues give a real dawn-sky gradient rather
  // than one flat colour; a third rises out of the ground pool so the light
  // reads as coming UP off the ground it never touches.
  const dawnGold = kit.mote(14, { color: 0xffd98c, size: 0.028, radius: 0.62, height: 0.75, speed: 0.3, seed: 171 });
  kit.at(body, dawnGold, 0, 0.16, 0);
  const dawnRose = kit.mote(9, { color: 0xffb0a0, size: 0.022, radius: 0.45, height: 0.55, speed: 0.24, seed: 172 });
  kit.at(body, dawnRose, 0, 0.3, -0.08);
  const dawnRise = kit.mote(10, { color: 0xffe9b0, size: 0.024, radius: 0.42, height: 0.9, speed: 0.35, seed: 174 });
  kit.at(body, dawnRise, 0, poolY + 0.05, 0);

  // The heartspark rides ON the chest surface — the chest orb (r 0.235 at
  // z 0.28) reaches z ≈ 0.52, and anything set deeper is simply swallowed.
  const spark = kit.heartspark(0.06, 0xfff2c8, { seed: 173 });
  const spk = S.surface(bodyGeo, S.dirYP(0, -0.1), { from: [0, 0, 0.3], inset: 0.01 });
  kit.at(body, spark, spk[0], spk[1], spk[2] + 0.04);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, ...crownAccents, ...maneAccents, ...ruffAccents],
      fx: [dawnGold, dawnRose, dawnRise, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      hover: true,
      hoverAmp: 0.03,
      breathAmp: 0.7,
      blinkEvery: 5.4,
    },
  };
}
