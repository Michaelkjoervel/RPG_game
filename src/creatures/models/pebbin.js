// =============================================================================
// PEBBIN — Terra, stage 1 wild (Dawnmeadow & Brighthollow outskirts).
// "Toddler pebble-golem, moss cap, one loose stone orbiting it. Stoic, tips
// over." (Design Bible §4)
// =============================================================================
// A stack of three rounded stones (wide base -> narrower middle -> small
// mossy-capped head) reads instantly as "golem" without needing separate
// limbs beyond two stubby stone feet. The "one loose stone orbiting it" is
// a bespoke fx object built right here in the model file (kit.js has no
// dedicated "orbiting solid" helper, only the glowing `mote()`) — a small
// non-emissive pebble on a slow, gently bobbing orbit, the model's one
// characterful flourish. hints.locomotion is forced to 'hop' for the
// "tips over" waddle rather than a proper quad walk.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

// A single loose stone drifting in a slow, low orbit around the body — not
// a glow effect (kit.mote is glow-only), so it's a small bespoke fx object
// following the same { group, update(dt) } shape every other kit fx uses.
function orbitingStone(m, opts = {}) {
  const { radius = 0.16, height = 0.05, speed = 0.7, seed = 1, size = 0.035 } = opts;
  const group = new THREE.Group(); group.name = 'orbitStone';
  const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), m);
  group.add(stone);
  const phase = (seed * 12.9898) % (Math.PI * 2);
  let t = 0;
  function update(dt) {
    t += dt;
    const ang = phase + t * speed;
    stone.position.set(Math.cos(ang) * radius, height * 0.5 + Math.sin(t * speed * 1.7) * height * 0.5, Math.sin(ang) * radius);
    stone.rotation.set(t * 0.6, t * 0.9, t * 0.4);
  }
  return { group, update };
}

export function build_pebbin(kit = kitDefault) {
  const pal = kit.palette(['terra']);
  const stone = kit.mat(0x8a8378, { rough: 0.85 });
  const stoneDark = kit.mat(0x6a6459, { rough: 0.85 });
  const moss = kit.mat(0x5c8a4a, { rough: 0.65 });

  const root = new THREE.Group();

  // Wide base stone — gradient-painted like real weathered rock: dark damp
  // base shading up to sun-bleached top.
  const body = kit.blob(0.15, stone, { seed: 90, noise: 0.16, squash: { x: 1.15, y: 0.85, z: 1.1 } });
  kit.paint(body, { from: 0x5c554a, to: 0xa39a8a, noise: 0.07, seed: 90 });
  root.add(body);
  body.position.y = 0.16;

  // Narrower middle stone, slightly offset — the precarious "balanced
  // stack" read, even at just two stones tall.
  const mid = kit.at(body, kit.blob(0.1, stoneDark, { seed: 91, noise: 0.14, squash: { x: 1, y: 0.9, z: 1 } }), 0.01, 0.16, -0.005, { rz: -0.06 });
  kit.paint(mid, { from: 0x4e483e, to: 0x827a6c, noise: 0.07, seed: 91 });

  // Small head stone with the moss cap, cocked a touch the other way — the
  // toddler wobble written into the stack itself.
  const head = kit.at(mid, kit.blob(0.075, stone, { seed: 92, noise: 0.12 }), -0.005, 0.1, 0.01, { rz: 0.09 });
  kit.paint(head, { from: 0x6e6659, to: 0xa8a08f, noise: 0.06, seed: 92 });
  const cap = kit.at(head, kit.orb(0.05, moss, { sy: 0.55, sx: 1.15, sz: 1.1 }), 0, 0.05, -0.005);
  kit.paint(cap, { from: 0x3d6132, to: 0x74a558, noise: 0.08, seed: 93 });
  kit.at(cap, kit.orb(0.014, moss.clone(), { sy: 0.7 }), 0.03, 0.02, 0.02);
  kit.at(cap, kit.orb(0.011, moss.clone(), { sy: 0.7 }), -0.025, 0.018, -0.015);
  // One tiny sprout on the cap — new growth on old stone.
  kit.at(cap, kit.leafBlade(0.035, kit.mat(0x86c05c, { rough: 0.5, side: THREE.DoubleSide }), { width: 0.012 }), 0.012, 0.028, 0, { rz: Math.PI / 2 - 0.35 });

  const eyeL = kit.at(head, kit.eye(0.029, { irisColor: 0x4a3a28, skinColor: 0x8a8378, glintSize: 0.011 }), 0.04, -0.002, 0.062, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.029, { irisColor: 0x4a3a28, skinColor: 0x8a8378, glintSize: 0.011 }), -0.04, -0.002, 0.062, { ry: -0.35 });

  // Two short, stubby stone feet — a toddler's unsteady stance.
  const legDefs = [[0.07, 0.05, 0.02], [-0.07, 0.05, 0.02]];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.1, stone, { thighR: 0.045, shinR: 0.036, footLen: 0.06 }), x, y, z));

  const stoneOrbit = orbitingStone(stoneDark.clone(), { radius: 0.17, height: 0.06, speed: 0.6, seed: 7, size: 0.032 });
  kit.at(body, stoneOrbit, 0, 0.14, 0);

  const spark = kit.heartspark(0.03, pal.eye, { seed: 93 });
  kit.at(body, spark, 0, 0.05, 0.13);

  root.add(kit.shadowDisc(0.22, 0.4));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [mid, cap],
      fx: [stoneOrbit, spark],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'hop',
      breathAmp: 0.75,
      blinkEvery: 4.4,
    },
  };
}
