// =============================================================================
// CAIRNOX — Terra, stage 2 (Pebbin awakens at L20).
// "Walking cairn of balanced stones, moss shoulders, glowing keystone heart.
// Patient." (Design Bible §4)
// =============================================================================
// Pebbin's two-stone stack grows into a proper cairn: four irregular,
// increasingly offset stones climbing to a small head, now standing on four
// sturdy legs for real stability. The "glowing keystone heart" IS this
// model's heartspark — sized up and made the visual centerpiece rather than
// a small chest detail — with a pair of slow orbiting glow-motes echoing
// Pebbin's single loose stone, now made luminous.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_cairnox(kit = kitDefault) {
  const pal = kit.palette(['terra']);
  const stoneA = kit.mat(0x847a6c, { rough: 0.85 });
  const stoneB = kit.mat(0x6e6558, { rough: 0.85 });
  const stoneC = kit.mat(0x59503f, { rough: 0.85 });
  const moss = kit.mat(0x5c8a4a, { rough: 0.6 });

  const root = new THREE.Group();

  // Base stone — wide, planted, patient. Every stone is gradient-painted
  // dark-under/bleached-top so the stack reads as weathered rock, not clay.
  const body = kit.blob(0.24, stoneA, { seed: 100, noise: 0.15, squash: { x: 1.2, y: 0.85, z: 1.15 } });
  kit.paint(body, { from: 0x544c40, to: 0x9c9282, noise: 0.08, seed: 100 });
  root.add(body);
  body.position.y = 0.32;

  // Second stone, offset + tilted for the "precariously balanced" cairn read.
  const stone2 = kit.at(body, kit.blob(0.17, stoneB, { seed: 101, noise: 0.13, squash: { x: 1.05, y: 0.9, z: 1 } }), 0.03, 0.26, -0.01, { rz: -0.07 });
  kit.paint(stone2, { from: 0x4a4337, to: 0x847a68, noise: 0.08, seed: 101 });
  // Third stone, counter-tilted.
  const stone3 = kit.at(stone2, kit.blob(0.12, stoneC, { seed: 102, noise: 0.12 }), -0.03, 0.18, 0.015, { rz: 0.1 });
  kit.paint(stone3, { from: 0x3e372a, to: 0x6e6350, noise: 0.08, seed: 102 });

  // Moss shoulder tufts on the base stone, plus trailing grass sprigs so the
  // shoulder-line silhouette is irregular, not lumpen.
  kit.at(body, kit.fluffTuft(0.07, moss, { count: 5, seed: 103 }), 0.19, 0.13, 0.04);
  kit.at(body, kit.fluffTuft(0.06, moss, { count: 5, seed: 104 }), -0.19, 0.11, 0.02);
  const sprigMat = kit.mat(0x7ab558, { rough: 0.5, side: THREE.DoubleSide });
  kit.at(body, kit.furFan(3, 0.07, sprigMat, { width: 0.014, spread: 0.9, curl: -0.2, seed: 105 }), 0.21, 0.15, 0.05);
  kit.at(body, kit.furFan(2, 0.055, sprigMat, { width: 0.012, spread: 0.7, curl: -0.25, seed: 106 }), -0.2, 0.13, -0.03);

  // Small head stone with a mossy brow-cap, carrying the family
  // resemblance to Pebbin's cap.
  const head = kit.at(stone3, kit.blob(0.09, stoneA, { seed: 105, noise: 0.1 }), 0, 0.15, 0.02);
  kit.paint(head, { from: 0x5e564a, to: 0x9c9282, noise: 0.06, seed: 107 });
  const brow = kit.at(head, kit.orb(0.06, moss.clone(), { sy: 0.5, sx: 1.1 }), 0, 0.055, -0.01);
  kit.paint(brow, { from: 0x3d6132, to: 0x6d9e54, noise: 0.08, seed: 108 });
  const eyeL = kit.at(head, kit.eye(0.034, { irisColor: 0xffb85c, scleraColor: 0x2a241c, skinColor: 0x847a6c, glintSize: 0.012, irisScale: 1.08 }), 0.045, -0.002, 0.075, { ry: 0.3 });
  const eyeR = kit.at(head, kit.eye(0.034, { irisColor: 0xffb85c, scleraColor: 0x2a241c, skinColor: 0x847a6c, glintSize: 0.012, irisScale: 1.08 }), -0.045, -0.002, 0.075, { ry: -0.3 });

  // --- Legs: four thick, planted stone legs — real stability at this size. ---
  const legDefs = [
    [0.18, 0.2, 0.16], [-0.18, 0.2, 0.16],
    [0.18, 0.2, -0.15], [-0.18, 0.2, -0.15],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.24, stoneA, { thighR: 0.075, shinR: 0.055, footLen: 0.1 }), x, y, z));

  // The glowing keystone heart — sized up into the model's centerpiece,
  // set into the second stone's chest face.
  // The bible's palette anchor for warm amber (#ffb85c) makes a striking,
  // literal "keystone" glow; pal.eye (the terra palette's harmonized glow
  // tone) tints the orbiting motes so they read as kin to it rather than a
  // clashing second color.
  const spark = kit.heartspark(0.07, 0xffb85c, { seed: 106 });
  kit.at(stone2, spark, 0, -0.02, 0.15);

  // A pair of slow orbiting glow-motes — Pebbin's loose stone, made
  // luminous now that it orbits the keystone rather than the body.
  const glowOrbit = kit.mote(2, { color: pal.eye, size: 0.02, radius: 0.14, height: 0.06, speed: 0.4, seed: 107 });
  kit.at(stone2, glowOrbit, 0, -0.02, 0.15);

  root.add(kit.shadowDisc(0.42, 0.42));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [stone2, stone3],
      fx: [spark, glowOrbit],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'quad',
      breathAmp: 0.65,
      blinkEvery: 5.0,
    },
  };
}
