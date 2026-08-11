// =============================================================================
// GLYPHANT — Terra/Lumen, stage 1 (single-stage), rare.
// "Small ruin-guardian elephant, glyphs carved in stone hide glow when it
// remembers." (Design Bible §4)
// =============================================================================
// A stone-hided elephant in miniature: big fan-like petal ears, and — since
// kit.js has no dedicated trunk helper — a forward-hanging `kit.tailChain()`
// repurposed as a trunk (the chain's natural "extends toward -Z" convention
// paired with a downward rx rotation on its root pivot points it exactly
// where a trunk should hang, and the animator's tail-wave state gives it a
// gentle exploratory sway for free). Glowing glyph planes (thin emissive
// rune-shaped strips, same technique as magmite's lava seams) are scattered
// across its hide and pulse together on a slow "remembering" rhythm.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { seededRandom } from '../../core/rng.js';
import { clamp01 } from '../../core/math.js';

export function build_glyphant(kit = kitDefault) {
  const pal = kit.palette(['terra', 'lumen']);
  const stone = kit.mat(0x8c8268, { rough: 0.68 });
  const stoneLight = kit.mat(0xa8a084, { rough: 0.62 });
  const glyphMat = kit.mat(0xffe9b0, { unlit: true, transparent: true, opacity: 0 });

  const root = new THREE.Group();

  const body = kit.blob(0.24, stone, { seed: 140, noise: 0.1, squash: { x: 1.15, y: 1, z: 1.3 } });
  root.add(body);
  body.position.y = 0.36;

  const head = kit.at(body, kit.blob(0.15, stone, { seed: 141, squash: { x: 0.95, y: 0.95, z: 1.05 } }), 0, 0.06, 0.28);
  const eyeL = kit.at(head, kit.eye(0.042, { irisColor: 0xffe9b0, scleraColor: 0x2a2620, skinColor: 0x8c8268, glintSize: 0.016 }), 0.1, 0.01, 0.11, { ry: 0.3 });
  const eyeR = kit.at(head, kit.eye(0.042, { irisColor: 0xffe9b0, scleraColor: 0x2a2620, skinColor: 0x8c8268, glintSize: 0.016 }), -0.1, 0.01, 0.11, { ry: -0.3 });

  // Big fan ears.
  const earL = kit.at(head, kit.petal(0.16, stoneLight, { width: 0.15 }), 0.13, 0.03, -0.02, { rx: -0.1, ry: -0.7, rz: 0.2 });
  const earR = kit.at(head, kit.petal(0.16, stoneLight, { width: 0.15 }), -0.13, 0.03, -0.02, { rx: -0.1, ry: 0.7, rz: -0.2 });

  // Small stone tusks.
  const tuskMat = kit.mat(0xe8e0c8, { rough: 0.3 });
  kit.at(head, kit.fang(0.07, tuskMat, { r: 0.018 }), 0.06, -0.08, 0.13, { rx: Math.PI * 0.78, rz: -0.15 });
  kit.at(head, kit.fang(0.07, tuskMat, { r: 0.018 }), -0.06, -0.08, 0.13, { rx: Math.PI * 0.78, rz: 0.15 });

  // Trunk — a tailChain hung from the front of the head, pointing down/forward.
  const trunk = kit.at(head, kit.tailChain(5, stone, { segLen: 0.045, startR: 0.032, endR: 0.012 }), 0, -0.06, 0.13, { rx: -2.5 });

  const legDefs = [
    [0.16, 0.24, 0.16], [-0.16, 0.24, 0.16],
    [0.17, 0.24, -0.15], [-0.17, 0.24, -0.15],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.34, stone, { thighR: 0.09, shinR: 0.065, footLen: 0.11 }), x, y, z));

  const tail = kit.at(body, kit.tailChain(3, stone, { segLen: 0.05, startR: 0.03, endR: 0.012 }), 0, 0.14, -0.3);

  // Glowing glyph planes across the hide, scattered deterministically.
  const rng = seededRandom(142);
  const glyphs = [];
  for (let i = 0; i < 6; i++) {
    const g = kit.box(0.05, 0.05, 0.004, glyphMat);
    const side = i % 2 === 0 ? 1 : -1;
    kit.at(body, g, side * (0.16 + rng() * 0.04), (rng() - 0.3) * 0.2, (rng() - 0.5) * 0.3, { ry: side * (Math.PI / 2 - 0.3), rz: rng() * 0.6 - 0.3 });
    glyphs.push(g);
  }
  let rememberT = rng() * 5;
  const remembering = {
    update(dt) {
      rememberT += dt;
      const period = 3.4;
      const local = rememberT % period;
      const p = clamp01(local / 0.8);
      const glow = local < 0.8 ? Math.sin(p * Math.PI) : 0;
      for (const g of glyphs) g.material.opacity = 0.15 + glow * 0.7;
    },
  };

  const spark = kit.heartspark(0.045, pal.eye, { seed: 143 });
  kit.at(body, spark, 0, 0.08, 0.2);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: trunk.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, tail.group],
      fx: [remembering, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.75,
      blinkEvery: 4.8,
    },
  };
}
