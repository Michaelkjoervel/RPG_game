// =============================================================================
// RIMEHORN — Frost, stage 1 (single-stage), uncommon.
// "Shaggy ibex, horns of clear ice, frost-breath. Sure-footed elder."
// (Design Bible §4)
// =============================================================================
// A sturdy mountain quadruped: a shaggy coat built from clustered
// `kit.fluffTuft()` puffs over a normal blob torso, a pair of curved
// `kit.horn()` icicles in a translucent frost material, and a slow, steady
// breath-mist of pale motes drifting from its muzzle. `hints.personality:
// 'regal'` with a slowed breath gives it the composed, unhurried bearing of
// a mountain elder rather than a skittish prey animal.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { seededRandom } from '../../core/rng.js';

export function build_rimehorn(kit = kitDefault) {
  const pal = kit.palette(['frost']);
  const coat = kit.mat(0xd8dce4, { rough: 0.75 });
  const coatDark = kit.mat(0xaab0bc, { rough: 0.75 });
  const iceMat = kit.mat(0xcdeeff, { rough: 0.1, metal: 0.05, transparent: true, opacity: 0.75 });

  const root = new THREE.Group();

  const body = kit.blob(0.19, coat, { seed: 120, noise: 0.1, squash: { x: 1.05, y: 0.95, z: 1.5 } });
  root.add(body);
  body.position.y = 0.34;

  // Shaggy coat: clustered fluff tufts along the back and flanks.
  const tuftSpots = [[0, 0.16, 0.15], [0, 0.18, -0.02], [0, 0.16, -0.18], [0.12, 0.02, -0.1], [-0.12, 0.02, -0.1]];
  const tufts = tuftSpots.map(([x, y, z]) => kit.at(body, kit.fluffTuft(0.1, coat, { count: 6, seed: 121 + x * 10 }), x, y, z));

  const head = kit.at(body, kit.blob(0.13, coat, { seed: 122, squash: { x: 0.9, y: 0.85, z: 1.1 } }), 0, 0.14, 0.26);
  const eyeL = kit.at(head, kit.eye(0.038, { irisColor: 0x3a2c1c, skinColor: 0xd8dce4, glintSize: 0.014 }), 0.08, 0.02, 0.09, { ry: 0.3 });
  const eyeR = kit.at(head, kit.eye(0.038, { irisColor: 0x3a2c1c, skinColor: 0xd8dce4, glintSize: 0.014 }), -0.08, 0.02, 0.09, { ry: -0.3 });
  const earL = kit.at(head, kit.ear(0.07, coatDark, { floppy: true }), 0.1, 0.07, -0.03, { rz: 0.4, ry: -0.2 });
  const earR = kit.at(head, kit.ear(0.07, coatDark, { floppy: true }), -0.1, 0.07, -0.03, { rz: -0.4, ry: 0.2 });

  // A pair of curved clear-ice horns, sweeping back.
  const hornL = kit.at(head, kit.horn(0.24, iceMat, { baseR: 0.03, tipR: 0.006, bend: 0.75 }), 0.06, 0.1, 0.02, { rz: -Math.PI / 2 + 0.3, ry: -0.15 });
  const hornR = kit.at(head, kit.horn(0.24, iceMat, { baseR: 0.03, tipR: 0.006, bend: 0.75 }), -0.06, 0.1, 0.02, { rz: Math.PI / 2 - 0.3, ry: 0.15 });

  const muzzle = kit.at(head, kit.orb(0.05, coatDark, { sz: 1.2, sy: 0.7 }), 0, -0.06, 0.11);

  const legDefs = [
    [0.11, 0.19, 0.16], [-0.11, 0.19, 0.16],
    [0.11, 0.19, -0.14], [-0.11, 0.19, -0.14],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.28, coat, { thighR: 0.07, shinR: 0.05, footLen: 0.1 }), x, y, z));

  const tail = kit.at(body, kit.tailChain(2, coat, { segLen: 0.045, startR: 0.035, endR: 0.018 }), 0, 0.12, -0.24);

  // Steady frost-breath mist from the muzzle.
  const breath = kit.mote(6, { color: 0xeaf6ff, size: 0.018, radius: 0.05, height: 0.08, speed: 0.6, seed: 123 });
  kit.at(muzzle, breath, 0, -0.02, 0.06);

  const spark = kit.heartspark(0.04, pal.eye, { seed: 124 });
  kit.at(body, spark, 0, 0.06, 0.2);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, hornL, hornR, ...tufts],
      fx: [breath, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.8,
      blinkEvery: 4.6,
    },
  };
}
