// =============================================================================
// CERVALUME — Lumen/Bloom, stage 2 (Dapplyn awakens at a Shrine).
// "Radiant deer, antlers of hard light, hooves leave glowing blossoms.
// Awakens only where shardlight pools." (Design Bible §4)
// =============================================================================
// Dapplyn grown into full radiance: the same graceful fawn proportions and
// gentle temperament, but adult-sized with pale gold-cream fur and the
// bible's signature "antlers of hard light" — a branching antler structure
// built the same way sylvathorn.js branches its bark antlers, but in an
// unlit, translucent, glowing material instead of solid bark. "Hooves leave
// glowing blossoms" becomes small emissive petal blooms resting at each
// footfall.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_cervalume(kit = kitDefault) {
  const pal = kit.palette(['lumen', 'bloom']);
  const skin = kit.mat(0xe8dcc0, { rough: 0.45 });                                  // radiant pale cream-gold
  const hoofMat = kit.mat(0x6a5a3a, { rough: 0.5 });
  const lightMat = kit.mat(0xfff2c8, { unlit: true, additive: true, opacity: 0.7 }); // hard-light antlers
  const bloomMat = kit.mat(pal.secondary, { unlit: true, transparent: true, opacity: 0.85 });

  const root = new THREE.Group();

  const body = kit.capsule(0.17, 0.4, skin, { capSeg: 5, radSeg: 9 });
  body.geometry.rotateZ(Math.PI / 2);
  root.add(body);
  body.position.y = 0.78;

  const head = kit.at(body, kit.blob(0.13, skin, { seed: 150, squash: { x: 0.85, y: 0.9, z: 1.3 } }), 0, 0.2, 0.3);
  const eyeL = kit.at(head, kit.eye(0.042, { irisColor: 0x3a2c14, skinColor: 0xe8dcc0, glintSize: 0.016 }), 0.078, 0.01, 0.1, { ry: 0.3 });
  const eyeR = kit.at(head, kit.eye(0.042, { irisColor: 0x3a2c14, skinColor: 0xe8dcc0, glintSize: 0.016 }), -0.078, 0.01, 0.1, { ry: -0.3 });
  const earL = kit.at(head, kit.ear(0.075, skin, { floppy: true }), 0.085, 0.09, -0.02, { rz: 0.35 });
  const earR = kit.at(head, kit.ear(0.075, skin, { floppy: true }), -0.085, 0.09, -0.02, { rz: -0.35 });

  // Branching hard-light antlers — the same "main horn + grafted branches"
  // technique sylvathorn.js uses, but glowing translucent gold instead of
  // solid bark.
  const antlerAccents = [];
  for (const side of [1, -1]) {
    const main = kit.horn(0.24, lightMat, { bend: 0.6, baseR: 0.02, tipR: 0.004 });
    const mainAt = kit.at(head, main, side * 0.06, 0.13, -0.01, { rz: side * 0.15, ry: side * 0.1 });
    antlerAccents.push(mainAt);
    for (const [t, s] of [[0.42, 0.5], [0.68, 0.35]]) {
      const branch = kit.horn(0.11 * s / 0.5, lightMat, { bend: 0.5, baseR: 0.011, tipR: 0.003 });
      kit.at(mainAt, branch, 0, 0.24 * t, 0, { rz: side * -0.9, ry: side * 0.4 });
    }
  }

  // --- Legs: four long, elegant legs — grown from Dapplyn's fawn stance. ---
  const legDefs = [
    [0.13, 0.5, 0.15], [-0.13, 0.5, 0.15],
    [0.13, 0.5, -0.14], [-0.13, 0.5, -0.14],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.5, skin, { thighR: 0.055, shinR: 0.038, footLen: 0.09, footMat: hoofMat }), x, y, z));

  // Glowing blossoms resting at each footfall — hooves that leave light
  // behind them.
  const blossoms = legs.map((l) => {
    const p = kit.at(l.foot, kit.petal(0.05, bloomMat.clone(), { width: 0.045 }), 0, -0.02, 0.03, { rx: -Math.PI / 2 });
    return p;
  });

  const tail = kit.at(body, kit.tailChain(2, skin, { segLen: 0.05, startR: 0.03, endR: 0.014 }), 0, 0.12, -0.2);

  // A slow, calm drift of gold-green light motes about the shoulders.
  const glow = kit.mote(10, { color: 0xfff2c8, size: 0.02, radius: 0.3, height: 0.3, speed: 0.3, seed: 151 });
  kit.at(body, glow, 0, 0.15, 0.1);

  const spark = kit.heartspark(0.05, 0xfff2c8, { seed: 152 });
  kit.at(body, spark, 0, 0.05, 0.22);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, ...antlerAccents],
      fx: [glow, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.7,
      blinkEvery: 4.6,
    },
  };
}
