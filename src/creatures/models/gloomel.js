// =============================================================================
// GLOOMEL — Umbra/Tide, stage 1 (single-stage), rare.
// "Blind pale cave eel, lure of faint shadowlight. Sings in the dark."
// (Design Bible §4)
// =============================================================================
// A genuinely long serpent (see tidelorn.js for the pattern this follows):
// `parts.body` is a short torso segment just behind the head, `parts.tail`
// is a long tailChain the animator undulates for `locomotion:'serpent'`.
// Its signature feature is an anglerfish-style lure — a curved stalk rising
// from the crown, tipped with a slow-pulsing shadowlight glow — which
// deliberately adds HEIGHT rather than length, keeping this model's
// length:height ratio close to tidelorn's own (~2.2:1 here) so registry.js's
// uniform height-based rescale never balloons its body length. Eyes are
// present (every Kindred needs a readable face) but small, filmed-over and
// barely used — it hunts and "sings" by shadowlight, not sight.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_gloomel(kit = kitDefault) {
  const pal = kit.palette(['umbra', 'tide']);
  // Cave-pale eel: cool violet-gray shadow under, bone-pale top — a thing
  // that has never seen the sun but still shades as a volume.
  const skin = kit.mat(0xffffff, { vertexColors: true, rough: 0.38 });
  const SKIN_LO = 0x8b8aa0, SKIN_HI = 0xf0f2f4;
  const paint = (mesh, seed) => {
    applyVertexGradient(mesh.geometry, { from: SKIN_LO, to: SKIN_HI, noise: 0.035, seed });
    return mesh;
  };
  const belly = kit.mat(0xf4f6f6, { rough: 0.55 });
  const lureMat = kit.mat(0x9fb0e0, { unlit: true, transparent: true, opacity: 0.85 });
  const finMat = kit.mat(0x8fa0d0, { rough: 0.3, transparent: true, opacity: 0.6, side: THREE.DoubleSide, emissive: 0x4a5a94, emissiveIntensity: 0.5 });

  const root = new THREE.Group();

  // Eel torso running nose-to-tail along Z — bake the capsule's axis swing
  // about X. (About Z would swing it onto the X axis and lay the eel sideways
  // across the view, with its tail sprouting from one flank.)
  const body = kit.capsule(0.075, 0.22, skin, { capSeg: 4, radSeg: 9 });
  body.geometry.rotateX(Math.PI / 2);
  paint(body, 72);
  root.add(body);
  body.position.y = 0.15;

  // Pale underbelly stripe — same axis as the torso it hugs.
  const bellyStripe = kit.capsule(0.045, 0.2, belly, { capSeg: 4, radSeg: 6 });
  bellyStripe.geometry.rotateX(Math.PI / 2);
  bellyStripe.scale.set(0.66, 0.44, 1);
  kit.at(body, bellyStripe, 0, -0.055, 0);

  const head = kit.at(body, paint(kit.blob(0.088, skin, { seed: 72, squash: { x: 0.85, y: 0.8, z: 1.2 } }), 73), 0, 0.04, 0.18);

  // Small, filmed-over, nearly vestigial eyes — present for readability, not function.
  const eyeL = kit.at(head, kit.eye(0.024, { irisColor: 0xdfe6ee, pupil: false, scleraColor: 0xc9ccd4, skinColor: 0xc4c8d0, glintSize: 0.008 }), 0.055, 0.01, 0.075, { ry: 0.4 });
  const eyeR = kit.at(head, kit.eye(0.024, { irisColor: 0xdfe6ee, pupil: false, scleraColor: 0xc9ccd4, skinColor: 0xc4c8d0, glintSize: 0.008 }), -0.055, 0.01, 0.075, { ry: -0.4 });

  // Anglerfish-style lure: a curved stalk rising from the crown, tipped
  // with a slow-pulsing shadowlight glow.
  const lureStalk = paint(kit.horn(0.26, skin, { baseR: 0.016, tipR: 0.006, bend: -0.15, segments: 6 }), 74);
  const lure = kit.at(head, lureStalk, 0, 0.06, 0.05, { rx: -0.25 });
  const lureGlow = kit.heartspark(0.042, 0x8fb8ff, { seed: 73 });
  kit.at(lure, lureGlow, 0, 0.255, 0);

  // Small barbel fins at the jaw, and a continuous dorsal fin-ribbon that
  // runs the whole spine — the eel's one flourish, catching every undulation.
  const finL = kit.at(head, kit.fin(0.06, finMat, { width: 0.035 }), 0.07, -0.02, 0.06, { rx: -0.2, ry: 0.7 });
  const finR = kit.at(head, kit.fin(0.06, finMat, { width: 0.035 }), -0.07, -0.02, 0.06, { rx: -0.2, ry: -0.7 });
  const dorsal = kit.at(body, kit.fin(0.1, finMat, { width: 0.2, curve: 0.3 }), 0, 0.06, 0.02, { rz: Math.PI / 2, rx: -0.3 });

  // Long tapering tail — most of the visible body length, POSED in a lazy
  // horizontal S so the length shows itself to a 3/4 camera.
  const tail = kit.at(body, kit.tailChain(7, skin, { segLen: 0.1, startR: 0.07, endR: 0.012 }), 0, -0.01, -0.11);
  const YAW = [0, -0.22, -0.3, -0.16, 0.1, 0.28, 0.3];
  tail.pivots.forEach((p, i) => {
    p.rotation.y = YAW[i] ?? 0;
    for (const c of p.children) if (c.isMesh && c.geometry && c.geometry.attributes) paint(c, 80 + i);
    if (i > 0 && i < 6) {
      const f = kit.fin(0.07 * (1 - i / 8), finMat, { width: 0.14, curve: 0.3 });
      kit.at(p, f, 0, 0.05 * (1 - i / 8) + 0.015, -0.05, { rz: Math.PI / 2, rx: -0.3 });
    }
  });
  const tailFin = kit.at(tail.pivots[tail.pivots.length - 1], kit.fin(0.09, finMat, { width: 0.06 }), 0, 0, -0.03, { ry: Math.PI / 2 });

  // Faint shadowlight motes drifting along the flank — its wordless "song" made visible.
  const song = kit.mote(9, { color: 0x8fa8e0, size: 0.018, radius: 0.55, height: 0.14, speed: 0.28, seed: 74 });
  kit.at(body, song, 0, -0.02, -0.2);

  const spark = kit.heartspark(0.036, pal.eye, { seed: 75 });
  kit.at(body, spark, 0, 0.02, 0.05);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      accents: [finL, finR, dorsal, tailFin, lure],
      fx: [song, spark, lureGlow],
    },
    hints: {
      personality: 'calm',
      locomotion: 'serpent',
      breathAmp: 0.6,
      blinkEvery: 5.2,
    },
  };
}
