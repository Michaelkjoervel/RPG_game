// =============================================================================
// TIDELORN — Tide/Gale, stage 3 (Maelfin awakens at L34).
// "Long serpentine leviathan with a mane of living water, moon-pale
// underbelly. Serene, vast." (Design Bible §4)
// =============================================================================
// Rebuilt for the visual overhaul — the old build read as a fat tadpole with
// a worm tail. The new one is built on three shapes (same discipline as the
// Firstborn leviathan in thalassyr.js, but leaner, brighter, SERENE):
//   1. REARED S-NECK: four pitched pivots arc the neck up and level out, so
//      the head is carried high, calm, looking forward. Head = highest point.
//   2. THE MANE OF LIVING WATER — the signature. A cascade of layered
//      translucent aqua fins pours off the crown and down the whole neck in
//      two tones (deep aqua + pale foam), overlapping into one flowing sheet
//      the animator sways. It reads as slow-moving water at any distance.
//   3. A LOW, LAZY COILED TAIL: eleven posed segments sweep a horizontal S
//      behind the shoulders and end in a whale fluke — length that shows
//      itself to a 3/4 camera instead of vanishing straight back.
// Hide is vertex-gradient painted (deep ocean under -> lit teal top) with a
// moon-pale belly line the whole way down. Conventions per kit.js: faces +Z,
// nose-to-tail capsules bake rotateX, groundPlant() last.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_tidelorn(kit = kitDefault) {
  const pal = kit.palette(['tide', 'gale']);
  const skinV = kit.mat(0xffffff, { vertexColors: true, rough: 0.38, metal: 0.05 });
  const SKIN_LO = 0x14384f, SKIN_HI = 0x4f96b4;      // deep ocean -> lit teal
  const belly = kit.mat(0xeef6f4, { rough: 0.5 });
  // The mane: solid-alpha translucency (additive washed out over bright sky).
  const maneDeep = kit.mat(0x3fa8c8, { rough: 0.25, transparent: true, opacity: 0.72, side: THREE.DoubleSide, emissive: 0x1d6480, emissiveIntensity: 0.7 });
  const maneFoam = kit.mat(0xbfeef2, { rough: 0.2, transparent: true, opacity: 0.65, side: THREE.DoubleSide, emissive: 0x5da8b8, emissiveIntensity: 0.5 });
  const skinHex = 0x2f6a84;

  const paint = (mesh, seed, lo = SKIN_LO, hi = SKIN_HI) => {
    applyVertexGradient(mesh.geometry, { from: lo, to: hi, noise: 0.04, seed });
    return mesh;
  };

  const root = new THREE.Group();

  // --- Torso ---------------------------------------------------------------
  const body = kit.capsule(0.23, 0.46, skinV, { capSeg: 5, radSeg: 11 });
  body.geometry.rotateX(Math.PI / 2);
  paint(body, 24);
  root.add(body);
  body.position.y = 0.5;

  const bellyStripe = kit.capsule(0.13, 0.44, belly, { capSeg: 4, radSeg: 8 });
  bellyStripe.geometry.rotateX(Math.PI / 2);
  bellyStripe.scale.set(0.72, 0.5, 1);
  kit.at(body, bellyStripe, 0, -0.13, 0);

  // Long, swept pectoral fins low on the flanks.
  const flippers = [];
  for (const side of [1, -1]) {
    const f = kit.fin(0.5, maneDeep, { width: 0.28, curve: 0.25 });
    flippers.push(kit.at(body, f, side * 0.2, -0.06, 0.14, { ry: side * -2.0, rz: side * -0.5, rx: -0.2 }));
  }

  // --- Reared S-neck -------------------------------------------------------
  const NECK = [
    [0.2, 0.3, -0.62],
    [0.18, 0.28, -0.55],
    [0.165, 0.27, -0.22],
    [0.15, 0.26, 0.5],
  ];
  const neckPivots = [];
  let neckParent = body;
  let attach = [0, 0.08, 0.22];
  for (let i = 0; i < NECK.length; i++) {
    const [r, len, pitch] = NECK[i];
    const pivot = new THREE.Group(); pivot.name = `neck${i}`;
    kit.at(neckParent, pivot, attach[0], attach[1], attach[2], { rx: pitch });
    const seg = kit.capsule(r, len, skinV, { capSeg: 4, radSeg: 10 });
    seg.geometry.rotateX(Math.PI / 2);
    paint(seg, 30 + i);
    kit.at(pivot, seg, 0, 0, len * 0.5);
    const throat = kit.capsule(r * 0.46, len * 0.82, belly, { capSeg: 3, radSeg: 7 });
    throat.geometry.rotateX(Math.PI / 2);
    throat.scale.set(0.6, 0.34, 1);
    kit.at(pivot, throat, 0, -r * 0.84, len * 0.5);
    neckPivots.push(pivot);
    neckParent = pivot;
    attach = [0, 0, len + r * 0.35];
  }
  const headAnchor = neckPivots[neckPivots.length - 1];
  const headZ = NECK[3][1] + NECK[3][0] * 0.55;

  // --- Head: graceful, serene ---------------------------------------------
  const head = kit.blob(0.19, skinV, { seed: 24, noise: 0.05, squash: { x: 0.82, y: 0.8, z: 1.5 } });
  jitterGeometry(head.geometry, 0.006, 24);
  paint(head, 25);
  kit.at(headAnchor, head, 0, 0.02, headZ, { rx: 0.42 });
  // Smooth pale muzzle; small closed mouth line, no fangs — serene, not fierce.
  const snout = paint(kit.orb(0.115, skinV, { sy: 0.72, sz: 1.35 }), 26, 0x235a74, 0x67aec8);
  kit.at(head, snout, 0, -0.045, 0.18);
  kit.at(head, kit.orb(0.05, belly, { sy: 0.4, sz: 1.1 }), 0, -0.12, 0.14);

  // Big calm moon-pale eyes.
  const eyeL = kit.at(head, kit.eye(0.058, { irisColor: 0xd8f2ff, pupil: true, scleraColor: 0x0b2430, skinColor: skinHex, glintSize: 0.023 }), 0.125, 0.04, 0.1, { ry: 0.5 });
  const eyeR = kit.at(head, kit.eye(0.058, { irisColor: 0xd8f2ff, pupil: true, scleraColor: 0x0b2430, skinColor: skinHex, glintSize: 0.023 }), -0.125, 0.04, 0.1, { ry: -0.5 });

  // Backswept crest horns framing the crown, and jaw barbels.
  const headAccents = [];
  for (const side of [1, -1]) {
    const crest = kit.horn(0.24, skinV, { baseR: 0.032, tipR: 0.006, bend: side * 0.5 });
    paint(crest, 27, 0x1d4a64, 0x5aa2be);
    headAccents.push(kit.at(head, crest, side * 0.1, 0.1, -0.06, { rz: -side * 0.9, rx: -0.7 }));
    headAccents.push(kit.at(head, kit.fin(0.13, maneFoam, { width: 0.06 }), side * 0.1, -0.06, 0.1, { rx: -0.3, ry: side * 0.9, rz: side * 0.35 }));
  }

  // --- THE MANE OF LIVING WATER -------------------------------------------
  // Overlapping fins pour off the crown and down the BACK of every neck
  // link: two layers per station (deep aqua under, pale foam over, slightly
  // smaller), each swept back and down like falling water. Widths exceed the
  // spacing so they read as ONE continuous cascade.
  const maneAccents = [];
  const maneStation = (parent, y, z, h, sweep) => {
    const deep = kit.fin(h, maneDeep, { width: h * 1.15, curve: 0.35 });
    maneAccents.push(kit.at(parent, deep, 0, y, z, { rz: Math.PI / 2, rx: sweep }));
    const foam = kit.fin(h * 0.7, maneFoam, { width: h * 0.8, curve: 0.4 });
    maneAccents.push(kit.at(parent, foam, 0, y + 0.01, z - 0.02, { rz: Math.PI / 2, rx: sweep - 0.12 }));
  };
  maneStation(head, 0.12, -0.12, 0.3, -0.85);
  NECK.forEach(([r, len], i) => {
    maneStation(neckPivots[i], r * 0.72, len * 0.55, 0.34 + i * 0.05, -0.6 - i * 0.06);
  });
  maneStation(body, 0.2, 0.1, 0.42, -0.5);
  maneStation(body, 0.2, -0.16, 0.36, -0.45);

  // --- The coiling tail ----------------------------------------------------
  const SEGMENTS = 11, SEG_LEN = 0.24, START_R = 0.21, END_R = 0.04;
  const tail = kit.at(body, kit.tailChain(SEGMENTS, skinV, { segLen: SEG_LEN, startR: START_R, endR: END_R }), 0, -0.04, -0.3);
  const YAW = [0, -0.16, -0.22, -0.22, -0.15, -0.02, 0.12, 0.2, 0.2, 0.15, 0.1];
  const PITCH = [-0.1, -0.1, 0.02, 0.1, 0.12, 0.04, -0.06, -0.1, 0.08, 0.18, 0.2];
  tail.pivots.forEach((p, i) => {
    p.rotation.y = YAW[i] ?? 0;
    p.rotation.x = PITCH[i] ?? 0;
    for (const child of p.children) if (child.geometry && child.geometry.attributes) paint(child, 40 + i);
    // Pale belly plate under each segment + a water-fin on top so the mane's
    // rhythm continues down the whole animal (all deep aqua — the pale foam
    // layer lives on the neck; alternating pale fins here read as bones).
    const r = START_R + (END_R - START_R) * (i / SEGMENTS);
    kit.at(p, kit.orb(r * 0.82, belly, { sy: 0.4, sz: 1.15 }), 0, -r * 0.55, -SEG_LEN * 0.5);
    if (i < SEGMENTS - 2) {
      const h = 0.32 * (1 - i / SEGMENTS) + 0.06;
      const f = kit.fin(h, maneDeep, { width: SEG_LEN * 1.9, curve: 0.3 });
      maneAccents.push(kit.at(p, f, 0, r * 0.68, -SEG_LEN * 0.5, { rz: Math.PI / 2, rx: -0.35 }));
    }
  });
  // Whale fluke: two horizontal lobes + a small foam lobe above.
  const tip = tail.pivots[tail.pivots.length - 1];
  const flukeL = kit.at(tip, kit.fin(0.44, maneDeep, { width: 0.5, curve: 0.15 }), 0, 0, -SEG_LEN * 0.8, { ry: Math.PI / 2, rz: 0.2 });
  const flukeR = kit.at(tip, kit.fin(0.44, maneDeep, { width: 0.5, curve: 0.15 }), 0, 0, -SEG_LEN * 0.8, { ry: -Math.PI / 2, rz: -0.2 });
  const flukeUp = kit.at(tip, kit.fin(0.22, maneFoam, { width: 0.24, curve: 0.25 }), 0, 0.02, -SEG_LEN * 0.65, { rz: Math.PI / 2 });

  // --- Serene spray --------------------------------------------------------
  const mist = kit.mote(12, { color: 0xdff6ff, size: 0.024, radius: 0.8, height: 0.5, speed: 0.22, seed: 25 });
  kit.at(body, mist, 0, 0.2, -0.5);
  const crownDrift = kit.mote(7, { color: 0xbfeef2, size: 0.02, radius: 0.26, height: 0.3, speed: 0.3, seed: 29 });
  kit.at(headAnchor, crownDrift, 0, 0.15, headZ - 0.05);

  const spark = kit.heartspark(0.055, pal.eye, { seed: 26 });
  kit.at(body, spark, 0, 0.05, 0.42);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      accents: [...headAccents, ...maneAccents, ...flippers, flukeL, flukeR, flukeUp],
      fx: [mist, crownDrift, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'serpent',
      breathAmp: 0.7,
      blinkEvery: 4.8,
    },
  };
}
