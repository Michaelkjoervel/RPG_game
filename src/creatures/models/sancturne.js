// =============================================================================
// SANCTURNE — Lumen/Umbra, stage 1 (single-stage), rare.
// "Ghost bound to a cracked reliquary urn, keeper of the Ruins' oldest
// trial." (Design Bible §4)
// =============================================================================
// Two-part design: a solid, grounded `kit.bulb()` urn (its natural
// base-at-y=0, bulge-then-narrow-neck shape is a genuine reliquary vase
// with zero extra work) with a hairline crack of emissive light down one
// side, and above it a translucent, additive-blended ghost-wisp body —
// `parts.body` for animation purposes — trailing wispy tendrils
// (repurposed tailChain) instead of legs. The urn never moves; the wisp
// breathes, blinks and drifts, visually tethered to it forever.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_sancturne(kit = kitDefault) {
  const pal = kit.palette(['lumen', 'umbra']);
  const urnMat = kit.mat(0x5c5468, { rough: 0.55 });
  const crackMat = kit.mat(0xffe9b0, { unlit: true, transparent: true, opacity: 0.8 });
  const wispMat = kit.mat(0xcfc0ff, { unlit: true, additive: true, opacity: 0.45, side: THREE.DoubleSide });
  const wispCore = kit.mat(0xe8e0ff, { unlit: true, transparent: true, opacity: 0.6 });

  const root = new THREE.Group();

  // The reliquary urn — grounded, static, unmoving.
  const urn = kit.bulb(urnMat, { height: 0.32, width: 0.2, neck: 0.3, segments: 12 });
  root.add(urn);
  const crack = kit.box(0.012, 0.26, 0.006, crackMat);
  kit.at(urn, crack, 0.13, 0.16, 0.05, { ry: 0.5, rz: 0.06 });
  const urnRimGlow = kit.heartspark(0.03, pal.eye, { seed: 150 });
  kit.at(urn, urnRimGlow, 0, 0.31, 0);

  // The ghost-wisp — floats loosely above the urn's neck.
  const body = kit.blob(0.15, wispMat, { seed: 151, noise: 0.24, squash: { x: 0.85, y: 1.15, z: 0.85 } });
  kit.at(urn, body, 0, 0.5, 0);
  const coreGlow = kit.orb(0.06, wispCore);
  kit.at(body, coreGlow, 0, 0, 0.03);

  const eyeL = kit.at(body, kit.eye(0.03, { irisColor: 0xffe9b0, scleraColor: 0x2a2440, skinColor: 0x5c5468, pupil: true, glintSize: 0.013 }), 0.06, 0.02, 0.11, { ry: 0.25 });
  const eyeR = kit.at(body, kit.eye(0.03, { irisColor: 0xffe9b0, scleraColor: 0x2a2440, skinColor: 0x5c5468, pupil: true, glintSize: 0.013 }), -0.06, 0.02, 0.11, { ry: -0.25 });

  // Wispy trailing tendrils in place of legs — three thin chains hanging loose.
  const tendrilDefs = [[0.05, -0.02], [-0.05, -0.02], [0, -0.07]];
  const tendrils = tendrilDefs.map(([x, z], i) => {
    const chain = kit.tailChain(5, wispMat, { segLen: 0.05, startR: 0.03, endR: 0.004 });
    kit.at(body, chain, x, -0.05, z, { rx: -Math.PI / 2 + 0.2 * (i - 1) });
    return chain;
  });

  const auraMotes = kit.mote(9, { color: 0xd8ccff, size: 0.018, radius: 0.24, height: 0.2, speed: 0.28, seed: 152 });
  kit.at(body, auraMotes, 0, 0.02, 0);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tendrils[0].pivots,
      accents: [urn, tendrils[1].group, tendrils[2].group],
      fx: [auraMotes, urnRimGlow],
    },
    hints: {
      personality: 'calm',
      locomotion: 'float',
      hover: true,
      hoverAmp: 0.07,
      breathAmp: 1.1,
      blinkEvery: 3.9,
    },
  };
}
