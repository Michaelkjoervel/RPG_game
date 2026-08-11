// =============================================================================
// CHARVANE — Ember, stage 2 (Kindlet awakens at L16).
// "Lean coal-furred hound, magma cracks along spine, smoke wisps when it
// huffs. Loyal, proud." (Design Bible §4)
// =============================================================================
// Design notes for later awakening-chain consistency (species that awaken
// into/from each other should rhyme visually): keeps Kindlet's warm
// charcoal palette and rounded ember-glow accents, but the body language
// flips from round/clumsy to lean/proud — longer legs, straighter spine,
// head held high. The "magma cracks along spine" are literal thin emissive
// strips (the same trick hollowify uses for Hollowed cracks, but permanent
// and warm here rather than pale and sickly).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_charvane(kit = kitDefault) {
  const pal = kit.palette(['ember']);
  const skin = kit.mat(0x241d1a, { rough: 0.65 });
  const crackGlow = kit.mat(pal.primary, { unlit: true, transparent: true, opacity: 0.95 });

  const root = new THREE.Group();

  // Lean torso: a stretched capsule reads leaner than a blob. capsule() is
  // Y-axis aligned by default; we want it lying along Z. IMPORTANT: bake
  // that into the GEOMETRY (geometry.rotateZ), not `body.rotation` — `body`
  // is also the attachment anchor for every other part below, and rotating
  // its *transform* would silently rotate all of their local x/y/z offsets
  // out from under them too.
  const body = kit.capsule(0.13, 0.34, skin, { capSeg: 4, radSeg: 9 });
  body.geometry.rotateZ(Math.PI / 2);
  root.add(body);
  body.position.y = 0.44;

  const chest = kit.at(body, kit.orb(0.15, skin, { sx: 0.95, sy: 1.05 }), 0, -0.02, 0.15);

  const head = kit.at(body, kit.orb(0.11, skin, { sz: 1.15, sy: 0.92 }), 0, 0.09, 0.28);
  const snout = kit.at(head, kit.capsule(0.045, 0.07, skin), 0, -0.03, 0.09, { rx: Math.PI / 2 });

  const eyeL = kit.at(head, kit.eye(0.038, { irisColor: 0x2a1810, skinColor: 0x241d1a, glintSize: 0.014 }), 0.06, 0.02, 0.08, { ry: 0.3 });
  const eyeR = kit.at(head, kit.eye(0.038, { irisColor: 0x2a1810, skinColor: 0x241d1a, glintSize: 0.014 }), -0.06, 0.02, 0.08, { ry: -0.3 });

  // Perky, alert canine ears — pride and loyalty read through an alert
  // upright posture more than any single part.
  const earL = kit.at(head, kit.ear(0.09, skin), 0.075, 0.09, -0.01, { rz: 0.2, ry: -0.15 });
  const earR = kit.at(head, kit.ear(0.09, skin), -0.075, 0.09, -0.01, { rz: -0.2, ry: 0.15 });

  // A pair of small fangs, just visible — a proud hound bares them subtly.
  kit.at(head, kit.fang(0.035, kit.mat(0xe8e2d8, { rough: 0.4 })), 0.03, -0.05, 0.115, { rz: -0.1 });
  kit.at(head, kit.fang(0.035, kit.mat(0xe8e2d8, { rough: 0.4 })), -0.03, -0.05, 0.115, { rz: 0.1 });

  // --- Magma cracks along the spine: thin, permanently glowing seams. ---
  const crackPositions = [
    [0, 0.09, 0.12, 0.05], [0, 0.1, -0.02, 0.06], [0, 0.09, -0.14, 0.045],
  ];
  for (const [x, y, z, len] of crackPositions) {
    kit.at(body, kit.box(0.012, 0.01, len, crackGlow.clone()), x, y, z, { rx: (Math.random() - 0.5) * 0.15 });
  }

  // --- Legs: four long, lean legs — a hound's confident stride. ---
  const legDefs = [
    [0.1, 0.24, 0.14], [-0.1, 0.24, 0.14],
    [0.1, 0.24, -0.13], [-0.1, 0.24, -0.13],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.28, skin, { thighR: 0.05, shinR: 0.036, footLen: 0.09 }), x, y, z));

  // Tail: proud, held aloft, no flame this time (that trait stayed with the
  // pup) — instead a warm ember-glow tuft at the tip echoes the lineage.
  const tail = kit.at(body, kit.tailChain(4, skin, { segLen: 0.09, startR: 0.04, endR: 0.018 }), 0, 0.03, -0.17, { rx: 0.55 });
  kit.at(tail.pivots[tail.pivots.length - 1], kit.fluffTuft(0.045, crackGlow.clone(), { count: 5, seed: 3 }), 0, 0, -0.04);

  // Smoke wisps drifting from the snout when it huffs — cool grey motes,
  // self-driving fx.
  const smoke = kit.mote(6, { color: 0x8a8478, size: 0.02, radius: 0.05, height: 0.14, speed: 0.6, seed: 7 });
  kit.at(head, smoke, 0, -0.03, 0.14);

  const spark = kit.heartspark(0.036, pal.eye, { seed: 12 });
  kit.at(body, spark, 0, 0, 0.16);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, chest, snout],
      fx: [smoke, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.9,
      blinkEvery: 3.4,
    },
  };
}
