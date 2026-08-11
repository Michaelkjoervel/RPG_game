// =============================================================================
// FULMIN — Volt, stage 1 wild (Dawnmeadow & Brighthollow outskirts).
// "Static-furred fox kit, sparks between ear tips. Zoomies incarnate."
// (Design Bible §4)
// =============================================================================
// A small, wiry fox built for the 'eager' personality's fastest settings —
// short legs but a tightly-coiled, ready-to-bolt posture. "Sparks between
// ear tips" is a bespoke fx object (kit.js has no arc/lightning primitive):
// a thin jagged strip stretched between the ear tips that flickers opacity
// on a fast, irregular clock, wired into parts.fx alongside the usual
// heartspark.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

// A short, jagged static-arc strip stretched between two world points,
// flickering rapidly and irregularly — the bespoke "spark" kit.js doesn't
// provide a primitive for.
function sparkArc(m, opts = {}) {
  const { points = 5, width = 0.006, seed = 1 } = opts;
  const group = new THREE.Group(); group.name = 'sparkArc';
  // Built centered on local x in [-0.5, 0.5] so attaching it at the
  // midpoint between two anchor points and scaling x by their separation
  // lines the ends up naturally, no per-use offset math needed.
  const shape = new THREE.Shape();
  const jag = (i) => (i % 2 === 0 ? 1 : -1) * width * 1.4;
  shape.moveTo(-0.5, 0);
  for (let i = 1; i <= points; i++) {
    const t = -0.5 + i / points;
    shape.lineTo(t, jag(i));
  }
  for (let i = points; i >= 0; i--) {
    const t = -0.5 + i / points;
    shape.lineTo(t, jag(i) - width);
  }
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), m);
  mesh.name = 'sparkMesh';
  group.add(mesh);
  const phase = (seed * 7919) % 100;
  let t = 0;
  function update(dt) {
    t += dt;
    const flicker = Math.random() < 0.12 ? 1 : 0.35 + 0.4 * Math.abs(Math.sin(t * 23 + phase));
    mesh.material.opacity = flicker;
    mesh.scale.y = 0.7 + Math.random() * 0.6;
  }
  return { group, update };
}

export function build_fulmin(kit = kitDefault) {
  const pal = kit.palette(['volt']);
  const skin = kit.mat(0xd8672c, { rough: 0.6 });       // fox-orange fur
  const cream = kit.mat(0xf3e6c8, { rough: 0.6 });      // cream chest/muzzle
  const sparkMat = kit.mat(pal.primary, { unlit: true, additive: true, opacity: 0.9, transparent: true });

  const root = new THREE.Group();

  const body = kit.blob(0.14, skin, { seed: 110, noise: 0.1, squash: { x: 0.95, y: 0.92, z: 1.2 } });
  root.add(body);
  body.position.y = 0.19;

  kit.at(body, kit.orb(0.075, cream, { sy: 0.65, sx: 0.8 }), 0, -0.05, 0.09);

  const head = kit.at(body, kit.orb(0.095, skin, { sz: 1.1, sy: 0.9 }), 0, 0.08, 0.14);
  const eyeL = kit.at(head, kit.eye(0.04, { irisColor: 0x2a1c08, skinColor: 0xd8672c, glintSize: 0.015 }), 0.07, 0.015, 0.075, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.04, { irisColor: 0x2a1c08, skinColor: 0xd8672c, glintSize: 0.015 }), -0.07, 0.015, 0.075, { ry: -0.35 });

  // Static-charged fur streaks — thin volt-yellow strips along the back,
  // echoing charvane's magma-crack technique with a livelier color.
  for (const [x, y, z, len] of [[0, 0.11, 0.06, 0.045], [0.02, 0.115, -0.02, 0.04], [-0.02, 0.11, -0.06, 0.045]]) {
    kit.at(body, kit.box(0.008, 0.006, len, sparkMat.clone()), x, y, z, { rx: (Math.random() - 0.5) * 0.2 });
  }

  // Big alert ears — the spark's two anchor points.
  const earL = kit.at(head, kit.ear(0.09, skin), 0.075, 0.09, -0.01, { rz: 0.22 });
  const earR = kit.at(head, kit.ear(0.09, skin), -0.075, 0.09, -0.01, { rz: -0.22 });

  // Sparks arcing between the ear tips — the bible's signature detail.
  // Attached at the head's midline, scaled to the ear-tip separation.
  const spark1 = sparkArc(sparkMat.clone(), { points: 5, width: 0.008, seed: 5 });
  spark1.group.scale.x = 0.19;
  kit.at(head, spark1, 0, 0.185, -0.01);

  // --- Legs: four short, quick legs — a kit coiled to bolt. ---
  const legDefs = [
    [0.09, 0.09, 0.09], [-0.09, 0.09, 0.09],
    [0.09, 0.09, -0.08], [-0.09, 0.09, -0.08],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.15, skin, { thighR: 0.04, shinR: 0.03, footLen: 0.055 }), x, y, z));

  // Bushy tail, straight out behind (never still).
  const tail = kit.at(body, kit.tailChain(4, skin, { segLen: 0.075, startR: 0.05, endR: 0.02, tipTuft: true, tipMat: cream }), 0, 0.04, -0.15, { rx: 0.15 });

  const zap = kit.heartspark(0.033, pal.eye, { seed: 111 });
  kit.at(body, zap, 0, 0, 0.15);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR],
      fx: [spark1, zap],
    },
    hints: {
      personality: 'eager',
      locomotion: 'quad',
      breathAmp: 1.3,
      blinkEvery: 1.7,
    },
  };
}
