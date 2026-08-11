// =============================================================================
// KINDLET — Ember, stage 1 starter.
// "Round soot-black salamander pup, candle-flame tail tip that flickers with
// mood. Eager, clumsy." (Design Bible §4)
// =============================================================================
//
// This is the simplest of the 9 starters and a good first read if you're
// building one of the other 39 species — every pattern used here recurs
// throughout the roster:
//   - kit.palette(aspects) gives you the SPECIES' GLOW colors (eyes, emissive
//     accents, heartspark) — it is NOT automatically your skin color. Bible
//     art direction is specific ("soot-black") so the base skin here is a
//     bespoke warm charcoal, and the ember palette is reserved for the parts
//     that should visually read as "lit from within" (eyes, tail flame,
//     heartspark). Species whose bible text IS basically the aspect color
//     (e.g. Nixling's "teal") can use palette.primary as skin directly —
//     see nixling.js.
//   - Build everything hanging off a `root` Group, THEN call
//     `kit.groundPlant(root)` as the very last step — it measures the real
//     assembled bounding box and shifts everything up so feet sit exactly at
//     y=0. Don't hand-compute vertical offsets across body/legs/tail; let
//     groundPlant do it. It's the difference between a model that floats or
//     clips depending on leg length vs. one that's always planted correctly.
//   - Every model returns { group, parts, hints }. `group` is what gets
//     attached to the scene; `parts`/`hints` feed CreatureAnimator (see
//     animator.js's header for the full contract).
//   - Small sub-parts that should move WITH their parent for free (the belly
//     patch, snout nubs below) don't need their own parts.accents entry —
//     only parts that want INDEPENDENT sway need tracking. Kindlet keeps
//     this simple: only the brow ridges get their own accent entry.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_kindlet(kit = kitDefault) {
  const pal = kit.palette(['ember']);
  const skin = kit.mat(0x2b211d, { rough: 0.7 });        // soot-black, warm undertone
  const belly = kit.mat(0x3d2c22, { rough: 0.75 });       // slightly lighter underbelly
  const emberGlow = kit.mat(pal.primary, { unlit: true, transparent: true, opacity: 0.9 });

  const root = new THREE.Group();

  // --- Body: a plump, roly-poly pup. Squashed slightly so it reads "round
  // and clumsy" rather than lean. ---
  const body = kit.blob(0.19, skin, { seed: 4, noise: 0.12, squash: { x: 1.05, y: 0.92, z: 1.15 } });
  root.add(body);
  body.position.y = 0.24;

  // Pale soot-warm belly patch, tucked slightly into the body so it doesn't
  // z-fight.
  kit.at(body, kit.orb(0.1, belly, { sy: 0.7, sx: 0.85 }), 0, -0.11, 0.09);

  // --- Head: wide flat salamander head, overlapping the body for a
  // seamless silhouette. ---
  const head = kit.at(body, kit.orb(0.13, skin, { sy: 0.82, sz: 1.05 }), 0, 0.1, 0.14);

  // Big, readable eyes (art direction: "always big readable eyes"). Kindlet
  // is eager and clumsy, so the eyes sit wide and a touch high, giving an
  // open, excitable expression.
  const eyeL = kit.at(head, kit.eye(0.052, { irisColor: 0x241a12, skinColor: 0x2b211d, glintSize: 0.02 }), 0.088, 0.03, 0.095, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.052, { irisColor: 0x241a12, skinColor: 0x2b211d, glintSize: 0.02 }), -0.088, 0.03, 0.095, { ry: -0.35 });

  // Small brow ridges for expression (salamanders have no external ears).
  const browL = kit.at(head, kit.brow(0.07, skin), 0.08, 0.09, 0.11, { rz: 0.15 });
  const browR = kit.at(head, kit.brow(0.07, skin), -0.08, 0.09, 0.11, { rz: -0.15 });

  // Tiny ember nub freckles either side of the snout — reads as a cheerful,
  // clumsy smile silhouette without needing a jaw part.
  kit.at(head, kit.orb(0.02, emberGlow.clone()), 0.05, -0.06, 0.155);
  kit.at(head, kit.orb(0.02, emberGlow.clone()), -0.05, -0.06, 0.155);

  // --- Legs: four short, stubby legs — deliberately a little too short for
  // the body, which is exactly what "clumsy" should look like. ---
  const legDefs = [
    [0.1, 0.05, 0.1], [-0.1, 0.05, 0.1],
    [0.1, 0.05, -0.09], [-0.1, 0.05, -0.09],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.16, skin, { thighR: 0.045, shinR: 0.032, footLen: 0.06 }), x, y, z));

  // --- Tail: tapers back from the body, ending in the signature flickering
  // candle-flame. The flame is a self-driving fx object (see kit.flame) —
  // it goes in parts.fx, NOT parts.accents, because it animates itself. ---
  const tail = kit.at(body, kit.tailChain(4, skin, { segLen: 0.09, startR: 0.045, endR: 0.02 }), 0, 0.02, -0.15);
  const tailFlame = kit.flame(0.11, { seed: 6, colors: [0xb8300a, 0xff7a2e, 0xffce6e] });
  kit.at(tail.pivots[tail.pivots.length - 1], tailFlame, 0, 0, -0.05);

  // The heartspark: a small glow at the chest, the mote of starlight every
  // Kindred carries (Design Bible §1). Self-driving fx, pulses on its own.
  const spark = kit.heartspark(0.032, pal.eye, { seed: 11 });
  kit.at(body, spark, 0, 0.02, 0.16);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [browL, browR],
      fx: [tailFlame, spark],
    },
    hints: {
      personality: 'eager',
      locomotion: 'quad',
      breathAmp: 1.15,
      blinkEvery: 2.6,
    },
  };
}
