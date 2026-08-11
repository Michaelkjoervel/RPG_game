// =============================================================================
// SLUDGEMAW — Venom/Terra, stage 2 (Oozel awakens at L24).
// "Bulky tar-slime with stalactite teeth. Slow, inexorable." (Design Bible §4)
// =============================================================================
// Oozel grown vast and grim: a darker, heavier bulb body (still authored
// wider than tall, same proportion discipline as oozel.js), a wide
// downturned maw ringed with hanging stalactite-teeth (kit.fang, tips
// already point -Y so no extra rotation needed), and a slower, weightier
// idle via `hints.personality:'heavy'`.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_sludgemaw(kit = kitDefault) {
  const pal = kit.palette(['venom', 'terra']);
  const tar = kit.mat(0x2a2418, { rough: 0.32, transparent: true, opacity: 0.95 });
  const crust = kit.mat(0x4a4030, { rough: 0.7 });
  const sheen = kit.mat(0xd8ffb0, { unlit: true, transparent: true, opacity: 0.15 });
  const toothMat = kit.mat(0xcfc4a0, { rough: 0.35 });

  const root = new THREE.Group();

  const body = kit.bulb(tar, { height: 0.32, width: 0.4, neck: 0.4, segments: 12 });
  root.add(body);

  const sheenCap = kit.orb(0.2, sheen, { sx: 0.9, sy: 0.5, sz: 0.75 });
  kit.at(body, sheenCap, 0.08, 0.2, 0.14, { rz: -0.25 });

  // Mineral crust plating, heavier and more armored than Oozel's single hat.
  const crustSpots = [[0, 0.27, 0, 0.13], [0.13, 0.2, -0.1, 0.09], [-0.14, 0.19, -0.08, 0.08]];
  const crustPlates = crustSpots.map(([x, y, z, sz]) => kit.at(body, kit.blob(sz, crust, { seed: 66 + x * 10, noise: 0.2, squash: { x: 1, y: 0.55, z: 1 } }), x, y, z));

  const eyeL = kit.at(body, kit.eye(0.04, { irisColor: 0xcfe08c, scleraColor: 0x1a1610, skinColor: 0x2a2418, glintSize: 0.014 }), 0.1, 0.05, 0.27, { ry: 0.25 });
  const eyeR = kit.at(body, kit.eye(0.04, { irisColor: 0xcfe08c, scleraColor: 0x1a1610, skinColor: 0x2a2418, glintSize: 0.014 }), -0.1, 0.05, 0.27, { ry: -0.25 });

  // Wide downturned maw ringed with stalactite teeth.
  const jaw = kit.at(body, kit.blob(0.12, tar, { seed: 67, squash: { x: 1.3, y: 0.5, z: 0.7 } }), 0, -0.05, 0.3);
  const toothCount = 7;
  for (let i = 0; i < toothCount; i++) {
    const t = i / (toothCount - 1);
    const x = (t - 0.5) * 0.2;
    kit.at(jaw, kit.fang(0.05 + Math.sin(t * Math.PI) * 0.03, toothMat, { r: 0.012 }), x, -0.01, 0.03);
  }

  const gooDrip = kit.mote(6, { color: 0x8a9a4a, size: 0.022, radius: 0.16, height: 0.1, speed: 0.22, seed: 68 });
  kit.at(body, gooDrip, 0, 0.08, 0.05);

  const spark = kit.heartspark(0.038, pal.eye, { seed: 69 });
  kit.at(body, spark, 0, 0.06, 0.18);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      jaw,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      accents: crustPlates,
      fx: [gooDrip, spark],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'hop',
      breathAmp: 1.4,
      blinkEvery: 4.6,
    },
  };
}
