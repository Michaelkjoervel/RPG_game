// =============================================================================
// TIDELORN — Tide/Gale, stage 3 (Maelfin awakens at L34).
// "Long serpentine leviathan with a mane of living water, moon-pale
// underbelly. Serene, vast." (Design Bible §4)
// =============================================================================
// A genuinely long, low, serpentine body — no legs (hints.locomotion:
// 'serpent'). `parts.body` is a distinct torso segment near the head (so
// breathing/hit-squash have something to act on); `parts.tail` is a long
// tailChain trailing behind it that the animator undulates for the
// serpentine swim cycle. The "mane of living water" repurposes wing() a
// second time (see maelfin.js) — here as a translucent, energy-style
// flowing crest along the neck rather than a solid sail.
//
// A NOTE ON SCALE for whoever tunes SPECIES.tidelorn.size in creatures.js:
// registry.js scales the WHOLE model uniformly by (size / measured bbox
// HEIGHT). A low, horizontal serpent's height is much smaller than its
// length, so picking `size` as if it meant "total length" will make this
// model balloon far too large. Pick `size` as the creature's actual
// standing/rearing HEIGHT (bible flavor text's "2.6 long" describes body
// length, not this field) — something in the 1.1–1.5m range reads right
// for a leviathan that mostly glides low but can rear its head up.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_tidelorn(kit = kitDefault) {
  const pal = kit.palette(['tide', 'gale']);
  const skin = kit.mat(0x1c4258, { rough: 0.35, metal: 0.05 });
  const belly = kit.mat(0xe8f2f2, { rough: 0.5 });
  const maneMat = kit.mat(0xbfe6ff, { unlit: true, additive: true, opacity: 0.5 });

  const root = new THREE.Group();

  // Core torso, just behind the head — the anchor for breathing/hit poses.
  const body = kit.capsule(0.16, 0.5, skin, { capSeg: 5, radSeg: 10 });
  body.geometry.rotateZ(Math.PI / 2);
  root.add(body);
  body.position.y = 0.42;

  // Moon-pale underbelly stripe.
  const bellyStripe = kit.capsule(0.09, 0.46, belly, { capSeg: 4, radSeg: 7 });
  bellyStripe.geometry.rotateZ(Math.PI / 2);
  bellyStripe.scale.set(0.7, 0.55, 1);
  kit.at(body, bellyStripe, 0, -0.1, 0);

  const head = kit.at(body, kit.blob(0.15, skin, { seed: 24, squash: { x: 0.85, y: 0.8, z: 1.3 } }), 0, 0.05, 0.32);
  const eyeL = kit.at(head, kit.eye(0.045, { irisColor: 0xe8f6ff, pupil: true, scleraColor: 0x0b2430, skinColor: 0x1c4258, glintSize: 0.017 }), 0.09, 0.02, 0.13, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.045, { irisColor: 0xe8f6ff, pupil: true, scleraColor: 0x0b2430, skinColor: 0x1c4258, glintSize: 0.017 }), -0.09, 0.02, 0.13, { ry: -0.35 });

  // A pair of small barbel fins near the jaw.
  const finL = kit.at(head, kit.fin(0.06, maneMat), 0.1, -0.03, 0.08, { rx: -0.2, ry: 0.7 });
  const finR = kit.at(head, kit.fin(0.06, maneMat), -0.1, -0.03, 0.08, { rx: -0.2, ry: -0.7 });

  // Mane of living water: an energy-style "wing" run along the top of the
  // neck, drooping down like flowing hair/kelp. Its bones give the animator
  // something to ripple even though it's not a wing at all.
  const mane = kit.wing(0.5, maneMat, { style: 'energy', bones: 4, width: 0.16, droop: 0.55 });
  kit.at(body, mane, 0, 0.13, 0.28, { rx: -Math.PI / 2 + 0.35, ry: Math.PI / 2 });

  // No legs — a vast serpent glides. The tail IS most of the visible body
  // length, tapering gently over many segments for a smooth undulation.
  const tail = kit.at(body, kit.tailChain(9, skin, { segLen: 0.17, startR: 0.15, endR: 0.02, tipTuft: false }), 0, -0.01, -0.22);
  // A thin fin fan at the very tip.
  const tailFin = kit.at(tail.pivots[tail.pivots.length - 1], kit.fin(0.16, maneMat), 0, 0, -0.05, { ry: Math.PI / 2 });

  // Dream-like drifting motes along the body — a serene, vast presence.
  const motes = kit.mote(10, { color: 0xdff2ff, size: 0.02, radius: 0.7, height: 0.3, speed: 0.3, seed: 25 });
  kit.at(body, motes, 0, 0.05, -0.3);

  const spark = kit.heartspark(0.05, pal.eye, { seed: 26 });
  kit.at(body, spark, 0, 0.02, 0.2);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      accents: [finL, finR, mane.group, tailFin],
      fx: [motes, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'serpent',
      breathAmp: 0.7,
      blinkEvery: 4.5,
    },
  };
}
