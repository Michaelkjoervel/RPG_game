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
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_glyphant(kit = kitDefault) {
  const pal = kit.palette(['terra', 'lumen']);
  // Carved sandstone: shadowed ochre under-body up to sun-bleached crown.
  const stone = kit.mat(0xffffff, { vertexColors: true, rough: 0.68 });
  const STONE_LO = 0x5e5138, STONE_HI = 0xb0a67e;
  const paint = (mesh, seed, lo = STONE_LO, hi = STONE_HI, jit = 0) => {
    if (jit) jitterGeometry(mesh.geometry, jit, seed);
    applyVertexGradient(mesh.geometry, { from: lo, to: hi, noise: 0.05, seed });
    return mesh;
  };
  const stoneLight = kit.mat(0xa8a084, { rough: 0.62 });
  const glyphMat = kit.mat(0xffe9b0, { unlit: true, transparent: true, opacity: 0 });
  const bandMat = kit.mat(0x776640, { rough: 0.7 });

  const root = new THREE.Group();

  const body = paint(kit.blob(0.24, stone, { seed: 140, noise: 0.1, squash: { x: 1.1, y: 1, z: 1.18 } }), 140);
  root.add(body);
  body.position.y = 0.46;

  // A carved masonry band around the barrel — this guardian was BUILT.
  const band = kit.orb(0.245, bandMat, { sx: 1.12, sy: 0.16, sz: 1.19 });
  kit.at(body, band, 0, 0.05, 0);

  const head = kit.at(body, paint(kit.blob(0.16, stone, { seed: 141, squash: { x: 0.95, y: 0.95, z: 1.05 } }), 141), 0, 0.16, 0.28);
  const eyeL = kit.at(head, kit.eye(0.045, { irisColor: 0xffe9b0, scleraColor: 0x2a2620, skinColor: 0x8c8268, glintSize: 0.017 }), 0.1, 0.01, 0.12, { ry: 0.3 });
  const eyeR = kit.at(head, kit.eye(0.045, { irisColor: 0xffe9b0, scleraColor: 0x2a2620, skinColor: 0x8c8268, glintSize: 0.017 }), -0.1, 0.01, 0.12, { ry: -0.3 });

  // Big fan ears — carved slabs standing UP-AND-OUT from the skull sides
  // (petal length runs +X, so rz≈75° swings the blade upward; ry flares it).
  const earL = kit.at(head, paint(kit.petal(0.19, stone, { width: 0.16 }), 143), 0.11, 0.06, -0.01, { rz: 0.95, ry: -0.5 });
  kit.at(earL, kit.petal(0.13, stoneLight, { width: 0.11 }), 0.015, 0, 0.006);
  const earR = kit.at(head, paint(kit.petal(0.19, stone, { width: 0.16 }), 144), -0.11, 0.06, -0.01, { rz: Math.PI - 0.95, ry: 0.5 });
  kit.at(earR, kit.petal(0.13, stoneLight, { width: 0.11 }), 0.015, 0, -0.006);
  // Flat blades must survive being seen from either side.
  for (const e of [earL, earR]) {
    e.material = e.material.clone();
    e.material.side = THREE.DoubleSide;
    for (const c of e.children) { c.material = c.material.clone(); c.material.side = THREE.DoubleSide; }
  }

  // Proper guardian tusks, gold-capped.
  const tuskMat = kit.mat(0xeee4c8, { rough: 0.3 });
  for (const side of [1, -1]) {
    const tusk = kit.at(head, kit.horn(0.13, tuskMat, { baseR: 0.024, tipR: 0.006, bend: side * -0.4 }), side * 0.07, -0.1, 0.12, { rx: 0.85, rz: side * -0.1 });
    kit.at(tusk, kit.orb(0.018, kit.mat(0xd8b46a, { rough: 0.4, emissive: 0x8a6420, emissiveIntensity: 0.4 }), { sy: 0.6 }), side * -0.4 * 0.13 * 0.3, 0.05, 0);
  }

  // Trunk — a tailChain hung from the front of the head, pointing down/forward.
  const trunk = kit.at(head, kit.tailChain(5, stone, { segLen: 0.05, startR: 0.036, endR: 0.014 }), 0, -0.06, 0.14, { rx: -2.5 });
  trunk.pivots.forEach((p, i) => {
    for (const c of p.children) if (c.isMesh && c.geometry && c.geometry.attributes) paint(c, 145 + i);
  });

  const legDefs = [
    [0.16, 0.1, 0.16], [-0.16, 0.1, 0.16],
    [0.17, 0.1, -0.15], [-0.17, 0.1, -0.15],
  ];
  const legs = legDefs.map(([x, y, z], i) => {
    const l = kit.at(body, kit.leg(0.5, stone, { thighR: 0.1, shinR: 0.075, footLen: 0.12, footMat: kit.mat(0x6e6244, { rough: 0.7 }) }), x, y, z);
    for (const c of l.hip.children) if (c.isMesh && c.geometry) paint(c, 150 + i);
    for (const c of l.knee.children) if (c.isMesh && c.geometry && c !== l.foot) paint(c, 154 + i);
    return l;
  });

  const tail = kit.at(body, kit.tailChain(3, stone, { segLen: 0.05, startR: 0.03, endR: 0.012 }), 0, 0.14, -0.3);
  tail.pivots.forEach((p, i) => {
    for (const c of p.children) if (c.isMesh && c.geometry && c.geometry.attributes) paint(c, 158 + i);
  });

  // Glowing glyph planes across the hide, scattered deterministically —
  // bigger, so the "remembering" pulse reads at battle distance.
  const rng = seededRandom(142);
  const glyphs = [];
  for (let i = 0; i < 7; i++) {
    const g = kit.box(0.07, 0.07, 0.005, glyphMat);
    const side = i % 2 === 0 ? 1 : -1;
    kit.at(body, g, side * (0.2 + rng() * 0.05), (rng() - 0.3) * 0.24, (rng() - 0.5) * 0.34, { ry: side * (Math.PI / 2 - 0.3), rz: rng() * 0.6 - 0.3 });
    glyphs.push(g);
  }
  // One glyph on the forehead — the keeper's seal.
  const seal = kit.box(0.06, 0.06, 0.005, glyphMat);
  kit.at(head, seal, 0, 0.09, 0.14, { rx: -0.5, rz: Math.PI / 4 });
  glyphs.push(seal);
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

  const grounded = kit.groundPlant(root);
  // Soft contact shadow so the creature reads planted on any ground.
  const contact = kit.shadowDisc(0.42, 0.32);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
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
