// =============================================================================
// STORMANE — Volt, stage 2 (Fulmin awakens at L22).
// "Thunder-maned wolf, mane arcs with lightning when it howls. Storm-herald."
// (Design Bible §4)
// =============================================================================
// Fulmin's fox-kit energy grows into a proud storm-wolf: long lean legs,
// a straighter spine, head held high (the same "grown up" body-language
// shift charvane.js uses on kindlet). The signature "mane arcs with
// lightning" is a row of jagged, vertical lightning-bolt planes standing up
// along the neck and shoulders in place of fur — a bespoke geometry helper
// (kit.js has no bolt primitive) with a slow, irregular per-bolt flicker fx
// so the mane reads as a smolder that occasionally catches, not a constant
// blaze.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

// A single jagged lightning-bolt-shaped flat plane, base at the origin,
// pointing +Y — used as a "fur strand" substitute for the thunder mane.
function boltBlade(height, m, opts = {}) {
  const { width = height * 0.4, seed = 1 } = opts;
  const shape = new THREE.Shape();
  const zig = [0, 0.3, -0.18, 0.62, 0.12, 1];
  shape.moveTo(0, 0);
  for (let i = 0; i < zig.length; i += 2) shape.lineTo(zig[i] * width, zig[i + 1] * height);
  shape.lineTo(width * 0.22, height);
  for (let i = zig.length - 2; i >= 0; i -= 2) shape.lineTo(zig[i] * width - width * 0.18, zig[i + 1] * height);
  shape.lineTo(-width * 0.1, 0);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), m);
  mesh.name = 'boltBlade';
  const phase = (seed * 5741) % 100;
  return { mesh, phase };
}

export function build_stormane(kit = kitDefault) {
  const pal = kit.palette(['volt']);
  const skin = kit.mat(0x3a3f4a, { rough: 0.55 });      // storm-cloud grey-blue fur
  const boltMat = kit.mat(0xffe97a, { unlit: true, transparent: true, opacity: 0.85, side: THREE.DoubleSide });

  const root = new THREE.Group();

  // Lean torso, straighter/prouder than Fulmin's coiled crouch.
  const body = kit.capsule(0.14, 0.36, skin, { capSeg: 4, radSeg: 9 });
  body.geometry.rotateZ(Math.PI / 2);
  root.add(body);
  body.position.y = 0.48;

  const chest = kit.at(body, kit.orb(0.16, skin, { sx: 0.95, sy: 1.05 }), 0, -0.02, 0.16);

  const head = kit.at(body, kit.orb(0.12, skin, { sz: 1.15, sy: 0.9 }), 0, 0.1, 0.3);
  const snout = kit.at(head, kit.capsule(0.048, 0.08, skin), 0, -0.03, 0.09, { rx: Math.PI / 2 });
  const eyeL = kit.at(head, kit.eye(0.04, { irisColor: 0xffe97a, scleraColor: 0x18181c, skinColor: 0x3a3f4a, glintSize: 0.015 }), 0.065, 0.02, 0.085, { ry: 0.3 });
  const eyeR = kit.at(head, kit.eye(0.04, { irisColor: 0xffe97a, scleraColor: 0x18181c, skinColor: 0x3a3f4a, glintSize: 0.015 }), -0.065, 0.02, 0.085, { ry: -0.3 });
  const earL = kit.at(head, kit.ear(0.08, skin), 0.07, 0.09, -0.01, { rz: 0.18, ry: -0.1 });
  const earR = kit.at(head, kit.ear(0.08, skin), -0.07, 0.09, -0.01, { rz: -0.18, ry: 0.1 });

  // The thunder mane: jagged lightning-bolt blades standing along the neck
  // and shoulders, each independently flickering.
  const manePositions = [
    [0, 0.13, 0.18, 0.06], [0.055, 0.12, 0.11, 0.055], [-0.055, 0.12, 0.11, 0.055],
    [0, 0.14, 0.02, 0.07], [0.06, 0.12, -0.06, 0.05], [-0.06, 0.12, -0.06, 0.05],
    [0, 0.13, -0.15, 0.055],
  ];
  const boltMeshes = manePositions.map(([x, y, z, h], i) => {
    const b = boltBlade(h, boltMat.clone(), { seed: i + 1 });
    kit.at(body, b.mesh, x, y, z, { rx: -0.15, ry: (Math.random() - 0.5) * 0.6, rz: (x !== 0 ? Math.sign(x) : 0) * 0.15 });
    return b;
  });
  let maneT = 0;
  const maneFlicker = {
    update(dt) {
      maneT += dt;
      for (const b of boltMeshes) {
        const flick = Math.sin(maneT * 3 + b.phase) > 0.55 || Math.random() < 0.01;
        b.mesh.material.opacity = flick ? 0.85 + Math.random() * 0.15 : 0.15 + Math.random() * 0.15;
        b.mesh.scale.y = flick ? 1 : 0.7;
      }
    },
  };

  // --- Legs: four long, powerful legs — a proud storm-herald's stride. ---
  const legDefs = [
    [0.1, 0.24, 0.16], [-0.1, 0.24, 0.16],
    [0.1, 0.24, -0.15], [-0.1, 0.24, -0.15],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.3, skin, { thighR: 0.055, shinR: 0.04, footLen: 0.1 }), x, y, z));

  // Tail held aloft, ending in a small static-charged tuft.
  const tail = kit.at(body, kit.tailChain(4, skin, { segLen: 0.1, startR: 0.045, endR: 0.018 }), 0, 0.04, -0.19, { rx: 0.5 });
  kit.at(tail.pivots[tail.pivots.length - 1], kit.fluffTuft(0.045, boltMat.clone(), { count: 4, seed: 8 }), 0, 0, -0.04);

  const spark = kit.heartspark(0.04, pal.eye, { seed: 112 });
  kit.at(body, spark, 0, 0, 0.18);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, chest, snout],
      fx: [maneFlicker, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.9,
      blinkEvery: 3.6,
    },
  };
}
