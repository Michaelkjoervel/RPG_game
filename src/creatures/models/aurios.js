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

export function build_aurios(kit = kitDefault) {
  // Three coat tones, not one: warm ivory body, pale belly/ruff, tan legs.
  // A single near-white value over the whole animal is what made the earlier
  // passes read as moulded plastic rather than a creature of morning light.
  const coatHex = 0xefe0bd;
  const coat = kit.mat(coatHex, { rough: 0.45, metal: 0.04 });
  const coatWarm = kit.mat(0xdcc396, { rough: 0.55 });        // legs / shaded tone
  const coatPale = kit.mat(0xfffaf0, { rough: 0.32 });        // ruff, belly, tail flash
  // Antler beams are SOLID (they must read as a black shape in a silhouette
  // test), warm gold, self-lit enough to feel like dawn without going unlit.
  // Metalness stays low: there is no env map in this game, and a high-metal
  // standard material simply renders black.
  const antlerMat = kit.mat(0xffc978, { rough: 0.3, metal: 0.12, emissive: 0xff9c34, emissiveIntensity: 0.8 });
  const antlerTip = kit.mat(0xffe9bb, { rough: 0.25, metal: 0.1, emissive: 0xffbe58, emissiveIntensity: 1.1 });
  // Rays are a warmer, deeper gold than the antler beams and much warmer than
  // the coat: against a near-white animal a pale ray simply disappears, and
  // the sunburst has to still be gold at 64px.
  // Deeper than they look on paper: the renderer's ACES tone mapping washes
  // bright saturated unlit colours toward cream, so a "gold" ray authored at
  // 0xffd782 comes out white. Author them a stop or two down and they land on
  // warm dawn-gold on screen.
  const rayMat = kit.mat(0xf09520, { unlit: true, transparent: true, opacity: 0.92 });
  const rayCore = kit.mat(0xffcf6a, { unlit: true, transparent: true, opacity: 0.95 });
  const maneMat = kit.mat(0xf5a832, { unlit: true, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const hoofMat = kit.mat(0xf0c377, { rough: 0.35, metal: 0.1, emissive: 0xd9832a, emissiveIntensity: 0.6 });
  const poolMat = kit.mat(0xffe9b0, { unlit: true, additive: true, opacity: 0.34 });
  const poolSoft = kit.mat(0xffca7a, { unlit: true, additive: true, opacity: 0.18 });

  const root = new THREE.Group();

  // --- Stag barrel -------------------------------------------------------
  // Nose-to-tail along Z: the capsule's axis swing is baked about X (about Z
  // would swing it onto the X axis and lay the Dawnhart sideways across the
  // view). Bake it into the GEOMETRY, not body.rotation — `body` is the
  // attachment frame for every part below.
  const body = kit.capsule(0.21, 0.58, coat, { capSeg: 5, radSeg: 11 });
  body.geometry.rotateX(Math.PI / 2);
  root.add(body);

  // Hooves float; the light pool underneath is what touches the ground.
  const HOVER = 0.13;
  const LEG = 0.84, THIGH_R = 0.075, SHIN_R = 0.048;
  // kit.leg(len) drops 0.92*len + 0.25*thighR + 0.925*shinR from hip to sole.
  const legDrop = 0.92 * LEG + 0.25 * THIGH_R + 0.925 * SHIN_R;   // ≈ 0.836
  const hipY = -0.185;                                            // just inside the belly line
  body.position.y = HOVER + legDrop - hipY;                       // ≈ 1.151

  // Deep chest and tucked flanks: a stag is not a sausage. The chest orb is
  // wider than the barrel and sits under the shoulder; the haunch orb behind
  // it is high and round, and the waist between them stays narrow.
  const chest = kit.at(body, kit.orb(0.235, coat, { sy: 1.06, sz: 0.9 }), 0, -0.04, 0.28);
  const haunch = kit.at(body, kit.orb(0.215, coat, { sy: 1.08, sz: 0.95 }), 0, -0.02, -0.3);
  // Radiant underside — lit from within, brightest along the belly.
  const bellyGlow = kit.capsule(0.12, 0.52, coatPale, { capSeg: 4, radSeg: 8 });
  bellyGlow.geometry.rotateX(Math.PI / 2);
  bellyGlow.scale.set(0.78, 0.5, 1);
  kit.at(body, bellyGlow, 0, -0.14, 0.02);
  // A warm "dawn saddle" along the spine. An all-over near-white animal has no
  // value structure at all and reads as plastic; this puts a warm mid-tone on
  // top, pale below, so the barrel has a light direction of its own.
  const saddle = kit.capsule(0.11, 0.5, kit.mat(0xdcae63, { rough: 0.5, emissive: 0x8a5c18, emissiveIntensity: 0.4 }), { capSeg: 4, radSeg: 8 });
  saddle.geometry.rotateX(Math.PI / 2);
  saddle.scale.set(1.3, 0.8, 1);
  kit.at(body, saddle, 0, 0.135, -0.02);

  // --- Raised neck + noble head ------------------------------------------
  // The neck leans FORWARD-up: for a +Y capsule, a positive rotation about X
  // tips its top toward +Z. It carries no children, so rotating the mesh
  // transform (rather than the geometry) is safe here.
  const NECK_TILT = 0.58;
  const NECK_R = 0.115, NECK_LEN = 0.34;
  const neckHalf = NECK_LEN * 0.5 + NECK_R;                       // 0.285
  const nDirY = Math.cos(NECK_TILT), nDirZ = Math.sin(NECK_TILT);
  const neckBaseY = 0.12, neckBaseZ = 0.4;
  const neck = kit.capsule(NECK_R, NECK_LEN, coat, { capSeg: 4, radSeg: 9 });
  kit.at(body, neck, 0, neckBaseY + neckHalf * nDirY, neckBaseZ + neckHalf * nDirZ, { rx: NECK_TILT });
  // A mane of dawn light along the crest of the neck: thin emissive strands
  // rising and sweeping back. It breaks the neck's tube, and it carries a
  // second stroke of warm gold down from the crown into the body so the
  // colour design doesn't live entirely in the antlers.
  const maneAccents = [];
  for (let i = 0; i < 7; i++) {
    const t = 0.06 + i * 0.145;
    const len = 0.28 - Math.abs(i - 2.5) * 0.03;
    const strand = kit.leafBlade(len, maneMat, { width: len * 0.3 });
    // The strand is a flat blade, so it only reads if its FACE points at the
    // camera: turn it about Y so the face looks sideways (out along ±X), then
    // pitch it about X to sweep the blade up and back along the neck.
    maneAccents.push(kit.at(body, strand,
      (i % 2 ? 0.022 : -0.022),
      neckBaseY + t * 2 * neckHalf * nDirY + NECK_R * 0.7,
      neckBaseZ + t * 2 * neckHalf * nDirZ - NECK_R * 0.45,
      { ry: Math.PI / 2, rx: 0.95 + i * 0.05 }));
  }
  // A pale ruff where neck meets chest — mass at the junction, and it catches
  // the key light like a mane.
  const ruffAccents = [];
  for (const [x, y, z, r] of [[0.1, 0.14, 0.43, 0.055], [-0.1, 0.14, 0.43, 0.055], [0, 0.04, 0.47, 0.06]]) {
    ruffAccents.push(kit.at(body, kit.fluffTuft(r, coatPale, { count: 4, seed: Math.round(x * 100 + z * 10 + 7) }), x, y, z));
  }

  const headY = neckBaseY + 2 * neckHalf * nDirY - 0.02;
  const headZ = neckBaseZ + 2 * neckHalf * nDirZ + 0.02;
  const head = kit.at(body, kit.blob(0.155, coat, { seed: 170, squash: { x: 0.82, y: 0.88, z: 1.42 } }), 0, headY, headZ, { rx: -0.18 });
  // Long stag muzzle, tapering to a soft pale nose.
  const muzzle = kit.at(head, kit.capsule(0.062, 0.1, coat, { capSeg: 3, radSeg: 8 }), 0, -0.05, 0.17, { rx: Math.PI / 2 });
  const nose = kit.at(head, kit.orb(0.055, coatPale, { sy: 0.8, sz: 0.9 }), 0, -0.06, 0.25);

  // Side-set stag eyes, warm gold iris on a dark sclera so the shardlight in
  // them reads at any distance (Design Bible §8: big readable eyes).
  const eyeL = kit.at(head, kit.eye(0.05, { irisColor: 0xffe9a8, scleraColor: 0x33270f, pupil: true, skinColor: coatHex, glintSize: 0.02 }), 0.105, 0.035, 0.1, { ry: 0.55 });
  const eyeR = kit.at(head, kit.eye(0.05, { irisColor: 0xffe9a8, scleraColor: 0x33270f, pupil: true, skinColor: coatHex, glintSize: 0.02 }), -0.105, 0.035, 0.1, { ry: -0.55 });
  const earL = kit.at(head, kit.ear(0.16, coat, { width: 0.09 }), 0.11, 0.07, -0.07, { rz: 0.62, rx: -0.3 });
  const earR = kit.at(head, kit.ear(0.16, coat, { width: 0.09 }), -0.11, 0.07, -0.07, { rz: -0.62, rx: -0.3 });

  // --- THE SUNBURST CROWN -------------------------------------------------
  // Everything hangs off one crown point just behind the brow, so the whole
  // structure genuinely radiates from a single origin the way a rising sun
  // does. `crownAccents` all go into parts.accents for the animator's idle
  // sway, which makes the crown shimmer rather than sit dead.
  const crownAccents = [];
  const crown = new THREE.Group(); crown.name = 'sunburstCrown';
  kit.at(head, crown, 0, 0.14, -0.04);
  // The sun core the rays spring from.
  kit.at(crown, kit.orb(0.075, rayCore.clone(), { sz: 0.55 }), 0, 0.02, -0.01);
  kit.at(crown, kit.orb(0.13, poolMat.clone(), { sz: 0.35 }), 0, 0.02, -0.02);

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
    kit.at(beamAt, kit.orb(0.022, antlerTip), BEAM_BEND * BEAM_LEN * side, BEAM_LEN, 0);
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

  // --- Legs: long, fine-boned, a legendary's stride ----------------------
  // Hip Y is local to the barrel; fore/hind pairs stand under the shoulders
  // and haunches of the 0.5 half-length, not bunched at the middle.
  const legDefs = [
    [0.155, hipY, 0.3], [-0.155, hipY, 0.3],
    [0.16, hipY, -0.31], [-0.16, hipY, -0.31],
  ];
  // Legs in the warmer, slightly darker coat tone: an all-over near-white
  // animal has no value structure at all, and the legs are where a deer's
  // darker stockings naturally live.
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(LEG, coatWarm, {
    thighR: THIGH_R, shinR: SHIN_R, footLen: 0.12, footMat: hoofMat,
  }), x, y, z));
  // A stag stands square but never stiff: the hind pair carries a shade more
  // angle at hip and hock than the fore pair (the rest pose IS the idle
  // baseline the animator offsets from).
  legs[0].hip.rotation.x = -0.05;
  legs[1].hip.rotation.x = -0.05;
  for (const l of [legs[2], legs[3]]) { l.hip.rotation.x = 0.13; l.knee.rotation.x = 0.14; }
  // Shoulder/haunch mass at the hip and a hock bulge at the knee: without
  // them a kit.leg() reads as a dowel, which is what makes a long-legged
  // animal look like a toy.
  for (const l of legs) {
    kit.at(l.hip, kit.orb(0.088, coat, { sy: 1.25, sz: 1.05 }), 0, -0.04, 0);
    kit.at(l.knee, kit.orb(0.048, coatWarm, { sy: 1.2, sz: 1.1 }), 0, 0.01, -0.005);
    // Warm dawn cuff just above each hoof — a small gold accent that ties the
    // legs to the crown and stops them reading as bare dowels.
    kit.at(l.knee, kit.orb(0.052, hoofMat, { sy: 0.45 }), 0, -LEG * 0.42 - SHIN_R * 0.5 + 0.045, 0);
  }

  // Each hoof stands on its own small disc of light...
  for (const l of legs) {
    const d1 = kit.at(l.foot, kit.orb(0.1, poolMat.clone(), { sy: 0.1, wSeg: 16 }), 0, -0.035, 0.0);
    const d2 = kit.at(l.foot, kit.orb(0.16, poolSoft.clone(), { sy: 0.06, wSeg: 16 }), 0, -0.05, 0.0);
    d1.name = 'lightPool'; d2.name = 'lightPool';
  }
  // ...and the whole animal stands over one wide pool. This is the ONLY part
  // of the model that reaches y=0, so groundPlant() plants the pool and the
  // hooves keep their HOVER gap — "walks above the ground on light."
  const poolY = -(HOVER + legDrop - hipY) + 0.02;                 // world y ≈ 0.02
  const groundPool = kit.at(body, kit.orb(0.52, poolMat.clone(), { sy: 0.03, sz: 1.35, wSeg: 24, hSeg: 10 }), 0, poolY, -0.02);
  const groundHalo = kit.at(body, kit.orb(0.85, poolSoft.clone(), { sy: 0.014, sz: 1.3, wSeg: 24, hSeg: 10 }), 0, poolY - 0.006, -0.02);
  groundPool.name = 'lightPool'; groundHalo.name = 'lightPool';

  // Short upright deer tail with a bright pale flash underneath.
  const tail = kit.at(body, kit.tailChain(3, coat, { segLen: 0.085, startR: 0.05, endR: 0.018 }), 0, 0.14, -0.44, { rx: 0.6 });
  kit.at(tail.pivots[tail.pivots.length - 1], kit.fluffTuft(0.038, coatPale, { count: 5, seed: 9 }), 0, -0.02, -0.05);

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
  kit.at(body, spark, 0, -0.06, 0.5);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, ...crownAccents, ...maneAccents, ...ruffAccents],
      fx: [dawnGold, dawnRose, dawnRise, spark],
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
