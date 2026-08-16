// =============================================================================
// THALASSYR, THE DEEPDREAM — Tide/Umbra, Firstborn legendary.
// "Abyssal leviathan sleeping beneath Mirrorlake; the world's dreams pool in
// its slow wake. Story-critical. Post-game encounter." (Design Bible §4, §2)
// =============================================================================
// A CROWN JEWEL and the largest of all 48 Kindred (SPECIES.thalassyr.size =
// 3.2, biggest in the roster). Follows tidelorn.js's serpent pattern (long
// tailChain body, `locomotion:'serpent'`) at a grander, darker, deep-sea
// scale — a fittingly vast successor since Tidelorn is this same design
// family's stage-3 starter. Two signature additions carry the "abyssal
// leviathan" and "dreams pool in its wake" text:
//   1. BIOLUMINESCENT SPOTS — a string of small glowing points down each
//      flank and along the tail (deep-sea creature signaling), each an
//      independent slow-pulsing light rather than one flat glow.
//   2. DREAM MOTES — soft, slow, iridescent pastel motes (three
//      layered hues: dusty rose, lavender, sea-teal) drifting in its wake
//      rather than one flat particle color, reading as literal dreams
//      pooling behind it as it moves.
//
// PROPORTION NOTE (see also tidelorn.js's and gloomel.js's versions of this
// note): registry.js rescales the whole model uniformly to match
// SPECIES.thalassyr.size against measured bbox HEIGHT. Authored
// length:height ratio here is ~2.9:1 — deliberately in the same family as
// tidelorn's own ~3:1, so scaling this (much taller) legendary up to
// size 3.2 makes it enormous, as the bible's "vast abyssal leviathan"
// calls for, without the ratio itself ballooning out of control.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { seededRandom } from '../../core/rng.js';

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
  const pal = kit.palette(['tide', 'umbra']);
  // Abyssal blue-slate lifted out of near-black (~8% albedo + faint deep-sea
  // self-glow) — vast and moody, but the silhouette and coils always read.
  const skin = kit.mat(0x3d5378, { rough: 0.35, metal: 0.06, emissive: 0x14243c, emissiveIntensity: 0.55 });
  const belly = kit.mat(0x60789a, { rough: 0.5 });
  const finMat = kit.mat(0x5c7a9e, { unlit: true, additive: true, opacity: 0.55, side: THREE.DoubleSide });
  const glowCyan = 0x7ae0e0;

  const root = new THREE.Group();

  // Core torso, just behind the head — the anchor for breathing/hit poses.
  // It lies nose-to-tail along Z, so the capsule's axis swing is baked about X
  // (about Z would put the long axis on X: a barrel lying across the view with
  // the tail growing out of its flank). Length is deliberately modest — the
  // TAIL carries this leviathan's length; an over-long torso just swallows the
  // head and the first third of the tail.
  const body = kit.capsule(0.34, 0.56, skin, { capSeg: 5, radSeg: 11 });
  body.geometry.rotateX(Math.PI / 2);
  root.add(body);
  body.position.y = 0.62;

  const bellyStripe = kit.capsule(0.18, 0.5, belly, { capSeg: 4, radSeg: 8 });
  bellyStripe.geometry.rotateX(Math.PI / 2);
  bellyStripe.scale.set(0.7, 0.5, 1);
  kit.at(body, bellyStripe, 0, -0.18, 0);

  const head = kit.at(body, kit.blob(0.28, skin, { seed: 190, squash: { x: 0.85, y: 0.8, z: 1.3 } }), 0, 0.24, 0.6);
  const eyeL = kit.at(head, kit.eye(0.075, { irisColor: 0xcfeeff, pupil: true, scleraColor: 0x081018, skinColor: 0x3d5378, glintSize: 0.026 }), 0.16, 0.03, 0.22, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.075, { irisColor: 0xcfeeff, pupil: true, scleraColor: 0x081018, skinColor: 0x3d5378, glintSize: 0.026 }), -0.16, 0.03, 0.22, { ry: -0.35 });

  // Deep-sea barbels near the jaw.
  const finL = kit.at(head, kit.fin(0.1, finMat), 0.17, -0.06, 0.12, { rx: -0.2, ry: 0.7 });
  const finR = kit.at(head, kit.fin(0.1, finMat), -0.17, -0.06, 0.12, { rx: -0.2, ry: -0.7 });

  // Dorsal crest of translucent fins running the length of the neck — the
  // main source of standing HEIGHT for this otherwise low, long serpent
  // (same technique tidelorn.js uses for its "mane of living water").
  const crest = kit.wing(0.85, finMat, { style: 'energy', bones: 5, width: 0.26, droop: 0.5 });
  kit.at(body, crest, 0, 0.34, 0.46, { rx: -Math.PI / 2 + 0.3, ry: Math.PI / 2 });

  // No legs — a vast serpent glides. The tail IS most of the visible body
  // length, tapering gently over many segments for a smooth undulation.
  const tail = kit.at(body, kit.tailChain(10, skin, { segLen: 0.2, startR: 0.32, endR: 0.035, tipTuft: false }), 0, -0.02, -0.5);
  const tailFin = kit.at(tail.pivots[tail.pivots.length - 1], kit.fin(0.34, finMat), 0, 0, -0.1, { ry: Math.PI / 2, s: 1.2 });
  const finLower = kit.at(tail.pivots[tail.pivots.length - 1], kit.fin(0.24, finMat), 0, 0, -0.1, { ry: Math.PI / 2, rx: Math.PI, s: 0.8 });

  // Bioluminescent spots strung along each flank and down the tail.
  // They sit ON the flank (torso radius 0.34) and are strung along the torso's
  // own Z length — a spot placed inside the capsule simply never shows.
  const flankSpots = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const z = 0.4 - t * 0.85;
    flankSpots.push([0.34, 0.0, z, 0.02 + (1 - t) * 0.01]);
    flankSpots.push([-0.34, 0.0, z, 0.02 + (1 - t) * 0.01]);
  }
  const spotsBody = bioluminescentSpots(kit, body, flankSpots, glowCyan, 400);
  const spotSets = tail.pivots.map((piv, i) => bioluminescentSpots(kit, piv, [[0, i < tail.pivots.length - 1 ? 0.14 : 0.08, 0, 0.016]], glowCyan, 401 + i));

  // Dream-like drifting motes in three layered pastel hues — literal dreams
  // pooling in its wake.
  const dreamRose = kit.mote(10, { color: 0xe0b8c8, size: 0.035, radius: 1.0, height: 0.4, speed: 0.22, seed: 191 });
  kit.at(body, dreamRose, 0, 0.1, -0.5);
  const dreamLavender = kit.mote(8, { color: 0xc8b8e0, size: 0.03, radius: 0.8, height: 0.5, speed: 0.18, seed: 192 });
  kit.at(body, dreamLavender, 0, 0.2, -0.9);
  const dreamTeal = kit.mote(8, { color: 0xa0d8d8, size: 0.028, radius: 0.9, height: 0.3, speed: 0.26, seed: 193 });
  kit.at(body, dreamTeal, 0, 0.0, -0.3);

  const spark = kit.heartspark(0.08, glowCyan, { seed: 194 });
  kit.at(body, spark, 0, 0.05, 0.3);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      accents: [finL, finR, crest.group, tailFin, finLower],
      fx: [spotsBody, ...spotSets, dreamRose, dreamLavender, dreamTeal, spark],
    },
    hints: {
      personality: 'sleepy',
      locomotion: 'serpent',
      breathAmp: 0.55,
      blinkEvery: 6.8,
    },
  };
}
