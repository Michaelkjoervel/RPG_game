// =============================================================================
// NIXLING — Tide, stage 1 starter.
// "Teal axolotl-sprite, droplet-shaped crest, big glassy eyes. Curious,
// easily distracted." (Design Bible §4)
// =============================================================================
// Unlike Kindlet (whose skin is deliberately NOT its aspect color), Nixling's
// bible description ("teal") basically IS the tide palette — so here
// palette.primary goes straight onto the skin. A slightly translucent
// material on the body sells the "glassy" feel from the big-eyes callout.
// External feathery gills (a real axolotl signature) are built from petal(),
// and the "droplet-shaped crest" is a literal use of kit.teardrop().

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_nixling(kit = kitDefault) {
  const pal = kit.palette(['tide']);
  const skin = kit.mat(pal.primary, { rough: 0.4, transparent: true, opacity: 0.94 });
  const gillMat = kit.mat(pal.accent, { rough: 0.35, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const crestMat = kit.mat(pal.accent, { unlit: true, transparent: true, opacity: 0.8 });

  const root = new THREE.Group();

  // Small, round, buoyant body — deep-water teal shading up to a pale aqua
  // back, so the "glassy" read comes from the color ramp, not just opacity.
  const body = kit.blob(0.15, skin, { seed: 15, noise: 0.1, squash: { x: 1, y: 0.92, z: 1.1 } });
  kit.paint(body, { from: 0x2a6e94, to: 0x86d4e4, noise: 0.05, seed: 15 });
  root.add(body);
  body.position.y = 0.16;

  // Wide, flat axolotl head merged into the body.
  const head = kit.at(body, kit.orb(0.13, skin, { sy: 0.78, sz: 1.1 }), 0, 0.06, 0.1);
  kit.paint(head, { from: 0x3a80a8, to: 0x8fd8e8, noise: 0.04, seed: 16 });

  // The droplet-shaped crest — a direct, literal use of teardrop().
  const crest = kit.at(head, kit.teardrop(crestMat, { height: 0.09, width: 0.045 }), 0, 0.1, -0.01, { rx: 0.15 });

  // BIG glassy eyes — the bible calls this out explicitly, so they're
  // oversized relative to the head; seated INTO the head's front corners
  // (not perched on top) and facing forward so the glassiness reads.
  const eyeL = kit.at(head, kit.eye(0.058, { irisColor: 0x0f2a33, skinColor: pal.primary, glintSize: 0.024 }), 0.088, 0.022, 0.092, { ry: 0.26 });
  const eyeR = kit.at(head, kit.eye(0.058, { irisColor: 0x0f2a33, skinColor: pal.primary, glintSize: 0.024 }), -0.088, 0.022, 0.092, { ry: -0.26 });
  // A tiny contented smile-dimple line under the eyes.
  kit.at(head, kit.orb(0.012, kit.mat(0x1e4a5c, { rough: 0.5 }), { sy: 0.4, sx: 1.6 }), 0, -0.035, 0.135);

  // Feathery external gills — three fronds per side, using petal() for a
  // soft, translucent look; each gets its own accent entry so they sway
  // independently underwater.
  const gillAccents = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const p = kit.petal(0.06 - i * 0.008, gillMat, { width: 0.03 });
      const g = kit.at(head, p, side * 0.12, 0.02 - i * 0.025, -0.02, { ry: side > 0 ? 0.5 : Math.PI - 0.5, rz: side * (0.3 + i * 0.15) });
      gillAccents.push(g);
    }
  }

  // Tiny stubby legs — an axolotl barely needs them.
  const legDefs = [
    [0.08, 0.06, 0.07], [-0.08, 0.06, 0.07],
    [0.08, 0.06, -0.07], [-0.08, 0.06, -0.07],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.1, skin, { thighR: 0.032, shinR: 0.024, footLen: 0.045 }), x, y, z));

  // Flat aquatic tail ending in a small fin flourish rather than a tuft.
  const tail = kit.at(body, kit.tailChain(4, skin, { segLen: 0.06, startR: 0.035, endR: 0.012 }), 0, 0, -0.13);
  const tailFin = kit.at(tail.pivots[tail.pivots.length - 1], kit.fin(0.07, gillMat), 0, 0, -0.02, { ry: Math.PI / 2 });

  // A few slow, drifting water-bubble motes near the crest — curious
  // Nixling is easily distracted by them.
  const bubbles = kit.mote(5, { color: 0xdff2ff, size: 0.014, radius: 0.08, height: 0.16, speed: 0.35, seed: 21 });
  kit.at(head, bubbles, 0, 0.12, 0.05);

  const spark = kit.heartspark(0.026, pal.eye, { seed: 5 });
  kit.at(body, spark, 0, 0.02, 0.12);

  root.add(kit.shadowDisc(0.19, 0.34));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [crest, tailFin, ...gillAccents],
      fx: [bubbles, spark],
    },
    hints: {
      personality: 'skittish',
      locomotion: 'quad',
      hover: false,
      breathAmp: 1.1,
      blinkEvery: 2.2,
    },
  };
}
