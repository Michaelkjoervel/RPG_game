// =============================================================================
// THALASSYR, THE DEEPDREAM — Tide/Umbra, Firstborn legendary.
// "Abyssal leviathan sleeping beneath Mirrorlake; the world's dreams pool in
// its slow wake. Story-critical. Post-game encounter." (Design Bible §4, §2)
// =============================================================================
// A CROWN JEWEL and the largest of all 48 Kindred (SPECIES.thalassyr.size =
// 3.2). Built silhouette-first (Design Bible §8), around three shapes:
//
//   1. COILING LENGTH. Thirteen tail segments, but the point is that they are
//      POSED: each pivot carries a rest rotation, so the body leaves the
//      shoulders in a long horizontal S and rides over two vertical humps
//      before the tail flourishes upward. A straight tail behind a fat head
//      is a tadpole from every angle except dead side-on — which is exactly
//      what the old build read as. A curved one shows its own length back to
//      the camera no matter where the camera is.
//   2. A CREST THAT RUNS THE WHOLE ANIMAL. Translucent deep-water fins stand
//      along the neck, back and tail, tallest over the shoulders, tapering to
//      the tip. It gives an otherwise smooth serpent a readable topline, and
//      it makes every undulation visible because the crest exaggerates it.
//   3. REARED HEAD ON AN S-NECK. Four neck segments arc up and level out, so
//      the head is carried high and forward, looking down at the player —
//      the pose of something enormous that has just noticed you. It also
//      keeps the authored length:height ratio near 2:1, which matters because
//      registry.js rescales by measured HEIGHT: a flat serpent authored at
//      6:1 balloons to absurd length when scaled to size 3.2.
//
// Deep-sea signalling detail: bioluminescent blue-green spots in rows along
// both flanks and down every tail segment, each pulsing on its own phase, and
// a dream-lure on a stalk above the brow. Dream motes in three pastel hues
// pool in the wake behind it.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { seededRandom } from '../../core/rng.js';

/**
 * A row of independently pulsing bioluminescent points on `parent`.
 * @param {[number,number,number,number][]} spots [x, y, z, radius]
 */
function bioluminescentSpots(kit, parent, spots, color, seed) {
  const rng = seededRandom(seed);
  const m = kit.mat(color, { unlit: true, transparent: true, opacity: 0.9 });
  const items = [];
  for (const [x, y, z, r] of spots) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), m.clone());
    kit.at(parent, s, x, y, z);
    items.push({ mesh: s, ph: rng() * Math.PI * 2, sp: 0.3 + rng() * 0.4 });
  }
  let t = 0;
  function update(dt) {
    t += dt;
    for (const it of items) {
      const p = 0.55 + 0.45 * Math.sin(t * it.sp + it.ph);
      it.mesh.material.opacity = 0.35 + p * 0.6;
      it.mesh.scale.setScalar(0.7 + p * 0.45);
    }
  }
  return { update };
}

export function build_thalassyr(kit = kitDefault) {
  // Abyssal blue-slate lifted well out of near-black (Design Bible §8: colors
  // must READ) with a faint deep-water self-glow, and a much paler belly so
  // the coils separate from each other where they overlap.
  const skinHex = 0x35527d;
  const skin = kit.mat(skinHex, { rough: 0.35, metal: 0.06, emissive: 0x152947, emissiveIntensity: 0.6 });
  const skinDeep = kit.mat(0x2a4166, { rough: 0.4, emissive: 0x101f38, emissiveIntensity: 0.5 });
  const belly = kit.mat(0x7b96b8, { rough: 0.5 });
  // The crest is a SOLID translucent sail, not a glow: additive blending over
  // a bright sky washed it into pale detached leaves. Straight alpha over a
  // deeper teal keeps it a continuous readable shape in any lighting.
  const crestMat = kit.mat(0x2f8fb4, { rough: 0.3, transparent: true, opacity: 0.78, side: THREE.DoubleSide, emissive: 0x1d5f7d, emissiveIntensity: 0.8 });
  const finMat = kit.mat(0x3f9cc0, { rough: 0.3, transparent: true, opacity: 0.7, side: THREE.DoubleSide, emissive: 0x24688a, emissiveIntensity: 0.8 });
  const glowSpot = 0x66e8c8;                    // deep-sea blue-green
  const glowMat = kit.mat(glowSpot, { unlit: true, transparent: true, opacity: 0.85 });

  const root = new THREE.Group();

  // --- Core torso ---------------------------------------------------------
  // Nose-to-tail along Z: the capsule's axis swing is baked about X (about Z
  // would lay the leviathan broadside with its head and tail growing out of
  // the flanks of a barrel). Deliberately short — the NECK and TAIL carry the
  // length; an over-long torso swallows both.
  const body = kit.capsule(0.34, 0.5, skin, { capSeg: 5, radSeg: 12 });
  body.geometry.rotateX(Math.PI / 2);
  root.add(body);
  body.position.y = 0.62;

  const bellyStripe = kit.capsule(0.2, 0.46, belly, { capSeg: 4, radSeg: 9 });
  bellyStripe.geometry.rotateX(Math.PI / 2);
  bellyStripe.scale.set(0.72, 0.5, 1);
  kit.at(body, bellyStripe, 0, -0.2, 0);

  // Pectoral flippers: broad, swept back, low on the flank. They widen the
  // silhouette at the shoulders — the widest point of a real leviathan.
  const flippers = [];
  for (const side of [1, -1]) {
    const f = kit.fin(0.62, finMat, { width: 0.42, curve: 0.25 });
    flippers.push(kit.at(body, f, side * 0.3, -0.12, 0.12, { ry: side * -2.35, rz: side * -0.35, rx: -0.2 }));
  }

  // --- Reared S-neck ------------------------------------------------------
  // A chain of pivots each pitching a little: for a chain running +Z, a
  // NEGATIVE rotation about X raises it. The last link levels out, so the
  // head is carried high and looks forward rather than at the sky.
  const NECK = [
    // [radius, length, pitch] — pitches COMPOUND, so these read as cumulative
    // -0.55, -1.05, -1.25, -0.75 rad: up steeply to near-vertical, then
    // levelling so the head looks forward at whatever is standing in front of
    // it. The head must be the highest point of the whole animal; when the
    // tail tip out-climbed it, the composition read as a caterpillar.
    [0.3, 0.36, -0.55],
    [0.27, 0.34, -0.5],
    [0.25, 0.32, -0.2],
    [0.23, 0.3, 0.5],
  ];
  const neckPivots = [];
  let neckParent = body;
  let attach = [0, 0.14, 0.26];
  for (let i = 0; i < NECK.length; i++) {
    const [r, len, pitch] = NECK[i];
    const pivot = new THREE.Group(); pivot.name = `neck${i}`;
    kit.at(neckParent, pivot, attach[0], attach[1], attach[2], { rx: pitch });
    const seg = kit.capsule(r, len, skin, { capSeg: 4, radSeg: 10 });
    seg.geometry.rotateX(Math.PI / 2);            // nose-to-tail, never rotateZ
    kit.at(pivot, seg, 0, 0, len * 0.5);
    // Pale throat line under each neck segment.
    const throat = kit.capsule(r * 0.5, len * 0.9, belly, { capSeg: 3, radSeg: 7 });
    throat.geometry.rotateX(Math.PI / 2);
    throat.scale.set(0.75, 0.42, 1);
    kit.at(pivot, throat, 0, -r * 0.78, len * 0.5);
    neckPivots.push(pivot);
    neckParent = pivot;
    attach = [0, 0, len + r * 0.35];
  }
  const headAnchor = neckPivots[neckPivots.length - 1];
  const headZ = NECK[NECK.length - 1][1] + NECK[NECK.length - 1][0] * 0.55;

  // --- Head: broad abyssal skull -----------------------------------------
  // The head is attached with a pitch that cancels most of the neck's final
  // rise, so a neck reared near-vertical still ends in a face that looks
  // FORWARD at the player rather than at the sky.
  const head = kit.at(headAnchor, kit.blob(0.36, skin, { seed: 190, squash: { x: 0.92, y: 0.8, z: 1.3 } }), 0, 0.02, headZ, { rx: 0.5 });
  const brow = kit.at(head, kit.orb(0.32, skinDeep, { sy: 0.52, sz: 0.82 }), 0, 0.17, 0.02, { rx: -0.15 });
  const snout = kit.at(head, kit.orb(0.24, skin, { sy: 0.8, sz: 1.35 }), 0, -0.03, 0.33);
  // The mouth is a real GAP: a dark line between an upper jaw and a lower one
  // that hangs below it, with the fangs standing in the gap. Fangs tucked up
  // inside a closed muzzle are invisible, which is how the first pass wasted
  // them entirely.
  const mouthLine = kit.at(head, kit.box(0.28, 0.05, 0.42, kit.mat(0x0a1622, { rough: 0.9 })), 0, -0.16, 0.24, { rx: -0.05 });
  // Lower jaw — its own part, so the animator can drop it on a roar. It rests
  // nearly closed: a jaw parked wide open reads as a permanent gormless gape.
  const jaw = kit.at(head, kit.orb(0.22, skinDeep, { sy: 0.42, sz: 1.32 }), 0, -0.2, 0.28);
  const jawGlow = kit.capsule(0.032, 0.26, glowMat, { capSeg: 3, radSeg: 6 });
  jawGlow.geometry.rotateX(Math.PI / 2);
  kit.at(jaw, jawGlow, 0, 0.05, 0.04);
  const fangMat = kit.mat(0xdcecf4, { rough: 0.3 });
  for (const side of [1, -1]) {
    for (const [z, len] of [[0.4, 0.09], [0.28, 0.075], [0.15, 0.06]]) {
      kit.at(head, kit.fang(len, fangMat), side * 0.135, -0.15, z);
    }
  }
  // Gill-fins swept back off the skull, tying the head into the neck crest.
  const headFins = [];
  for (const side of [1, -1]) {
    headFins.push(kit.at(head, kit.fin(0.3, crestMat, { width: 0.28, curve: 0.2 }), side * 0.2, 0.05, -0.16, { rz: side * 1.15, ry: side * 0.5 }));
  }

  // Set on the SIDES of the skull and proud of it: the head blob's surface is
  // out at ~0.33 in x, and an eye placed inside that only shows as a pale
  // patch leaking through the scalp.
  const eyeL = kit.at(head, kit.eye(0.085, { irisColor: 0xcaf6ee, pupil: true, scleraColor: 0x07131c, skinColor: skinHex, glintSize: 0.03 }), 0.27, 0.05, 0.2, { ry: 0.75 });
  const eyeR = kit.at(head, kit.eye(0.085, { irisColor: 0xcaf6ee, pupil: true, scleraColor: 0x07131c, skinColor: skinHex, glintSize: 0.03 }), -0.27, 0.05, 0.2, { ry: -0.75 });
  // Heavy ridge over each eye — an abyssal predator's scowl.
  for (const side of [1, -1]) {
    kit.at(head, kit.orb(0.13, skinDeep, { sy: 0.4, sz: 0.85 }), side * 0.24, 0.14, 0.18, { rz: -side * 0.35 });
  }

  // Jaw barbels and a swept horn pair behind the skull.
  const barbels = [];
  for (const side of [1, -1]) {
    barbels.push(kit.at(head, kit.fin(0.2, finMat, { width: 0.1 }), side * 0.19, -0.11, 0.12, { rx: -0.35, ry: side * 0.9, rz: side * 0.4 }));
    barbels.push(kit.at(head, kit.horn(0.34, skinDeep, { baseR: 0.045, tipR: 0.008, bend: side * 0.7 }), side * 0.16, 0.14, -0.12, { rz: -side * 0.75, rx: -0.5 }));
  }

  // The dream-lure: an abyssal angler's stalk carrying a soft light the
  // world's dreams gather around.
  // It arcs FORWARD over the snout rather than straight up: the lure should
  // hang in front of the face like a deep-sea angler's, and a vertical stalk
  // would only inflate the model's measured height (which registry.js
  // rescales by) without adding anything to the silhouette that matters.
  const LURE_LEN = 0.44, LURE_BEND = 0.95;
  // horn() rises +Y and bends +X, so a -90° turn about Y aims the bend at +Z
  // (forward) while it still rises.
  const lureStalk = kit.at(head, kit.horn(LURE_LEN, skinDeep, { baseR: 0.03, tipR: 0.009, bend: LURE_BEND }), 0, 0.22, 0.04, { ry: -Math.PI / 2, rx: -0.12 });
  const lure = kit.at(lureStalk, kit.crystal(0.08, glowMat.clone(), { coreColor: 0xffffff, detail: 0 }), LURE_BEND * LURE_LEN, LURE_LEN, 0);
  const lureMotes = kit.mote(7, { color: 0xa9f2e2, size: 0.028, radius: 0.18, height: 0.22, speed: 0.5, seed: 195 });
  kit.at(lureStalk, lureMotes, LURE_BEND * LURE_LEN, LURE_LEN, 0);

  // --- The coiling body ---------------------------------------------------
  // No legs: a leviathan glides. The chain extends -Z; a pivot's +X rotation
  // lifts the run that follows it, +Y swings it sideways. Rest pose = the
  // pose held at return, and the animator's serpent undulation is applied as
  // OFFSETS on top, so a posed coil still swims.
  // Taper is gentle (0.34 → 0.085): a leviathan keeps its bulk most of the
  // way back, and a chain that thins to a whisker by mid-body reads as a
  // tadpole tail rather than a body.
  const SEGMENTS = 15, SEG_LEN = 0.3, START_R = 0.34, END_R = 0.055;
  const tail = kit.at(body, kit.tailChain(SEGMENTS, skin, { segLen: SEG_LEN, startR: START_R, endR: END_R }), 0, -0.02, -0.38);
  // THE COIL. Per-joint rotations compound, so these are increments, and the
  // running totals are what matter. Yaw sweeps the body out to one side by
  // ~65° and brings it back (a long lazy S laid across the ground, which is
  // what makes the length visible from a 3/4 camera instead of vanishing
  // straight away from it); pitch rides it over two humps and lifts the last
  // few segments into a flourish.
  const YAW = [0, -0.14, -0.19, -0.22, -0.22, -0.16, -0.06, 0.06, 0.14, 0.19, 0.19, 0.16, 0.12, 0.08, 0.05];
  const PITCH = [-0.06, -0.18, -0.05, 0.16, 0.2, 0.1, -0.1, -0.2, -0.16, -0.02, 0.12, 0.16, 0.12, 0.06, 0.02];
  tail.pivots.forEach((p, i) => {
    p.rotation.y = YAW[i] ?? 0;
    p.rotation.x = PITCH[i] ?? 0;
  });
  // Segment ridges: a slightly proud ring where each segment meets the next,
  // so the undulation is legible as SEGMENTS and not one smooth hose.
  tail.pivots.forEach((p, i) => {
    const r = START_R + (END_R - START_R) * (i / SEGMENTS);
    kit.at(p, kit.orb(r * 1.06, skinDeep, { sz: 0.3, wSeg: 12 }), 0, 0, -SEG_LEN * 0.95);
  });

  // Crest: a translucent fin standing on every neck link, on the back, and on
  // every tail segment. kit.fin()'s blade spans +X with its width running
  // -Z, so rz = +PI/2 stands it upright with the width trailing backward.
  const crestAccents = [];
  const crestUp = Math.PI / 2;
  // Fin bases sit slightly INSIDE the body (0.72r, not at the surface): a fin
  // planted exactly on the skin leaves a visible gap where its blade curve
  // starts, and the crest floats instead of growing out of the animal.
  NECK.forEach(([r, len], i) => {
    const h = 0.34 + i * 0.09;
    crestAccents.push(kit.at(neckPivots[i], kit.fin(h, crestMat, { width: len * 1.9, curve: 0.25 }), 0, r * 0.72, len * 0.5, { rz: crestUp }));
  });
  crestAccents.push(kit.at(body, kit.fin(0.82, crestMat, { width: 0.7, curve: 0.3 }), 0, 0.26, 0.1, { rz: crestUp }));
  crestAccents.push(kit.at(body, kit.fin(0.7, crestMat, { width: 0.62, curve: 0.3 }), 0, 0.26, -0.26, { rz: crestUp }));
  // Fin width is deliberately wider than a segment is long, so consecutive
  // fins overlap into ONE continuous sail instead of a row of loose leaves.
  tail.pivots.forEach((p, i) => {
    const t = i / (SEGMENTS - 1);
    const r = START_R + (END_R - START_R) * (i / SEGMENTS);
    const h = 0.78 * (1 - t * 0.88) + 0.08;
    crestAccents.push(kit.at(p, kit.fin(h, crestMat, { width: SEG_LEN * 2.1, curve: 0.3 }), 0, r * 0.7, -SEG_LEN * 0.5, { rz: crestUp }));
  });
  // Tail fluke: a broad horizontal fan (a whale's, not a fish's — it reads as
  // "deep-sea giant" at a glance) with a small vertical lobe behind it.
  const tipPivot = tail.pivots[tail.pivots.length - 1];
  const tailFin = kit.at(tipPivot, kit.fin(0.46, finMat, { width: 0.62, curve: 0.15 }), 0, 0.0, -SEG_LEN * 0.9, { ry: Math.PI / 2, rz: 0.12 });
  const tailFin2 = kit.at(tipPivot, kit.fin(0.46, finMat, { width: 0.62, curve: 0.15 }), 0, 0.0, -SEG_LEN * 0.9, { ry: -Math.PI / 2, rz: -0.12 });
  const tailFin3 = kit.at(tipPivot, kit.fin(0.26, crestMat, { width: 0.3, curve: 0.2 }), 0, 0.04, -SEG_LEN * 0.75, { rz: crestUp });

  // --- Bioluminescence ----------------------------------------------------
  // Rows on both flanks of the torso (a spot placed inside the capsule simply
  // never shows: the torso radius is 0.34, so they sit AT 0.34) and a pair on
  // every tail segment, each at that segment's own radius.
  const flankSpots = [];
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const z = 0.28 - t * 0.62;
    for (const side of [1, -1]) flankSpots.push([side * 0.335, -0.02, z, 0.028 + (1 - t) * 0.012]);
  }
  const spotFx = [bioluminescentSpots(kit, body, flankSpots, glowSpot, 400)];
  neckPivots.forEach((p, i) => {
    const [r, len] = NECK[i];
    spotFx.push(bioluminescentSpots(kit, p, [
      [r * 0.96, -0.04, len * 0.45, 0.026], [-r * 0.96, -0.04, len * 0.45, 0.026],
    ], glowSpot, 410 + i));
  });
  tail.pivots.forEach((p, i) => {
    const r = START_R + (END_R - START_R) * (i / SEGMENTS);
    const rad = Math.max(0.012, 0.026 * (1 - i / SEGMENTS));
    spotFx.push(bioluminescentSpots(kit, p, [
      [r * 0.94, -0.02, -SEG_LEN * 0.5, rad], [-r * 0.94, -0.02, -SEG_LEN * 0.5, rad],
      [0, r * 0.5, -SEG_LEN * 0.85, rad * 0.7],
    ], glowSpot, 420 + i));
  });

  // --- Dreams pooling in its wake ----------------------------------------
  const dreamRose = kit.mote(12, { color: 0xe0b8c8, size: 0.04, radius: 1.2, height: 0.55, speed: 0.2, seed: 191 });
  kit.at(body, dreamRose, 0, 0.2, -0.9);
  const dreamLavender = kit.mote(10, { color: 0xc8b8e0, size: 0.034, radius: 1.0, height: 0.7, speed: 0.16, seed: 192 });
  kit.at(body, dreamLavender, 0, 0.35, -1.5);
  const dreamTeal = kit.mote(10, { color: 0xa0d8d8, size: 0.03, radius: 0.9, height: 0.45, speed: 0.24, seed: 193 });
  kit.at(body, dreamTeal, 0, 0.05, -0.3);

  const spark = kit.heartspark(0.09, glowSpot, { seed: 194 });
  kit.at(body, spark, 0, -0.12, 0.24);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      jaw,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      accents: [...crestAccents, ...barbels, ...headFins, ...flippers, brow, snout, mouthLine, lureStalk, lure, tailFin, tailFin2, tailFin3],
      fx: [...spotFx, lureMotes, dreamRose, dreamLavender, dreamTeal, spark],
    },
    hints: {
      personality: 'calm',
      locomotion: 'serpent',
      breathAmp: 0.55,
      blinkEvery: 6.8,
    },
  };
}
