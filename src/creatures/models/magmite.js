// =============================================================================
// MAGMITE — Ember/Terra, stage 1 (single-stage), uncommon.
// "Magma beetle, cooling-crust shell with lava seams. Carries warmth to
// cold places." (Design Bible §4)
// =============================================================================
// A compact armored beetle: a domed `kit.shellPlate()` crust over a
// glowing ember-lit underbody, with thin emissive lava-seam strips
// crackling across the shell — the same "thin box strip" technique
// kit.hollowify() uses for its crack-seams, borrowed here as a deliberate,
// permanent design feature (matching what stratovane.js does with
// lightning veins) rather than a damage state. Six short legs give it a
// proper beetle-scuttle.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { seededRandom } from '../../core/rng.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_magmite(kit = kitDefault) {
  const pal = kit.palette(['ember', 'terra']);
  // Cooling crust: near-black basalt at the rim warming toward the ash-brown
  // crown, mottled like real slag.
  const crust = kit.mat(0xffffff, { vertexColors: true, rough: 0.58 });
  const CRUST_LO = 0x241a16, CRUST_HI = 0x5e4a3a;
  const paint = (mesh, seed, lo = CRUST_LO, hi = CRUST_HI, jit = 0) => {
    if (jit) jitterGeometry(mesh.geometry, jit, seed);
    applyVertexGradient(mesh.geometry, { from: lo, to: hi, noise: 0.05, seed });
    return mesh;
  };
  const crustPlain = kit.mat(0x3a2e26, { rough: 0.55 });
  const magma = kit.mat(0xff7a26, { unlit: true, transparent: true, opacity: 0.95 });
  const seamMat = kit.mat(0xff9a3c, { unlit: true, transparent: true, opacity: 0.9 });

  const root = new THREE.Group();

  // Glowing ember underbody — the furnace the shell barely contains. Kept
  // small and squat so it leaks at the rim instead of ballooning below.
  const body = kit.blob(0.12, magma, { seed: 130, noise: 0.08, squash: { x: 1, y: 0.55, z: 1.2 } });
  root.add(body);
  body.position.y = 0.085;

  // The cooling-crust shell — a low rocky dome fused over the whole back,
  // jittered basalt with a lit crown, its rim floating just above the ember
  // underbody so the glow leaks out all the way round.
  const shell = kit.blob(0.17, crust, { seed: 131, noise: 0.14, squash: { x: 1.05, y: 0.62, z: 1.25 } });
  jitterGeometry(shell.geometry, 0.01, 131);
  applyVertexGradient(shell.geometry, { from: CRUST_LO, to: CRUST_HI, noise: 0.06, seed: 131 });
  kit.at(body, shell, 0, 0.06, -0.01);

  // Lava-seam cracks across the shell — wider, two-tone, plus glow beads at
  // the joints so the shell reads as barely holding.
  const rng = seededRandom(131);
  const seams = [];
  for (let i = 0; i < 6; i++) {
    const len = 0.08 + rng() * 0.07;
    const px = (rng() - 0.5) * 0.18, pz = (rng() - 0.5) * 0.22;
    // Ride the dome: height falls off toward the rim.
    const py = 0.175 - (px * px + pz * pz * 0.6) * 0.55;
    const strip = kit.box(0.016, len, 0.01, seamMat);
    kit.at(body, strip, px, py, pz, { rx: Math.PI / 2, ry: rng() * Math.PI || 0.001 });
    seams.push(strip);
    if (i % 2 === 0) kit.at(body, kit.orb(0.016, magma.clone()), px + 0.02, py + 0.004, pz - 0.01);
  }

  const head = kit.at(body, paint(kit.blob(0.075, crust, { seed: 132, squash: { x: 0.95, y: 0.85, z: 1 } }), 132), 0, 0.02, 0.16);
  // A stubby crest horn — the little furnace-knight look.
  kit.at(head, paint(kit.horn(0.06, crust, { baseR: 0.016, tipR: 0.004, bend: 0.4 }), 133), 0, 0.05, 0.01, { rx: -0.5 });
  const eyeL = kit.at(head, kit.eye(0.024, { irisColor: 0xff9a3c, scleraColor: 0x1c1410, skinColor: 0x3a2e26, glintSize: 0.009 }), 0.045, 0.01, 0.055, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.024, { irisColor: 0xff9a3c, scleraColor: 0x1c1410, skinColor: 0x3a2e26, glintSize: 0.009 }), -0.045, 0.01, 0.055, { ry: -0.35 });

  // Small heat-sensing antennae.
  const antL = kit.at(head, kit.horn(0.05, crustPlain, { baseR: 0.008, tipR: 0.003, bend: 0.4 }), 0.025, 0.04, 0.02, { rz: -0.3 });
  const antR = kit.at(head, kit.horn(0.05, crustPlain, { baseR: 0.008, tipR: 0.003, bend: 0.4 }), -0.025, 0.04, 0.02, { rz: 0.3 });

  // Six short beetle legs.
  const legSpots = [
    { x: 0.13, z: 0.08, ry: 0.5 }, { x: -0.13, z: 0.08, ry: -0.5 },
    { x: 0.15, z: -0.01, ry: 1.0 }, { x: -0.15, z: -0.01, ry: -1.0 },
    { x: 0.13, z: -0.09, ry: 1.5 }, { x: -0.13, z: -0.09, ry: -1.5 },
  ];
  const legs = legSpots.map(({ x, z, ry }) => kit.at(body, kit.leg(0.11, crustPlain, { thighR: 0.018, shinR: 0.013, footLen: 0.03 }), x, 0.02, z, { ry }));

  const embers = kit.mote(5, { color: 0xff9a3c, size: 0.014, radius: 0.15, height: 0.1, speed: 0.4, seed: 133 });
  kit.at(body, embers, 0, 0.02, 0);

  const spark = kit.heartspark(0.026, pal.eye, { seed: 134 });
  kit.at(body, spark, 0, 0.03, 0.08);

  const grounded = kit.groundPlant(root);
  // Soft contact shadow so the creature reads planted on any ground.
  const contact = kit.shadowDisc(0.28, 0.32);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [antL, antR, shell],
      fx: [embers, spark],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'quad',
      breathAmp: 0.7,
      blinkEvery: 3.4,
    },
  };
}
