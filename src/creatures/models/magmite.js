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

export function build_magmite(kit = kitDefault) {
  const pal = kit.palette(['ember', 'terra']);
  const crust = kit.mat(0x3a2e26, { rough: 0.55 });
  const magma = kit.mat(pal.primary, { unlit: true, transparent: true, opacity: 0.95 });
  const seamMat = kit.mat(0xff8a3c, { unlit: true, transparent: true, opacity: 0.85 });

  const root = new THREE.Group();

  // Glowing ember underbody, mostly hidden beneath the crust dome.
  const body = kit.blob(0.13, magma, { seed: 130, noise: 0.08, squash: { x: 1, y: 0.7, z: 1.2 } });
  root.add(body);
  body.position.y = 0.1;

  // The cooling-crust shell — a heavy domed plate over the whole back.
  const shell = kit.shellPlate(0.26, 0.16, 0.3, crust, { bulge: 0.22, segments: 4 });
  kit.at(body, shell, 0, 0.06, 0, { rx: -Math.PI / 2 });

  // Lava-seam cracks across the shell, deterministic per-instance.
  const rng = seededRandom(131);
  const seams = [];
  for (let i = 0; i < 5; i++) {
    const len = 0.06 + rng() * 0.06;
    const strip = kit.box(0.01, len, 0.006, seamMat);
    kit.at(body, strip, (rng() - 0.5) * 0.18, 0.11, (rng() - 0.5) * 0.22, { rx: Math.PI / 2, ry: rng() * Math.PI || 0.001 });
    seams.push(strip);
  }

  const head = kit.at(body, kit.blob(0.07, crust, { seed: 132, squash: { x: 0.95, y: 0.85, z: 1 } }), 0, 0.02, 0.15);
  const eyeL = kit.at(head, kit.eye(0.024, { irisColor: 0xff9a3c, scleraColor: 0x1c1410, skinColor: 0x3a2e26, glintSize: 0.009 }), 0.045, 0.01, 0.055, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.024, { irisColor: 0xff9a3c, scleraColor: 0x1c1410, skinColor: 0x3a2e26, glintSize: 0.009 }), -0.045, 0.01, 0.055, { ry: -0.35 });

  // Small heat-sensing antennae.
  const antL = kit.at(head, kit.horn(0.05, crust, { baseR: 0.008, tipR: 0.003, bend: 0.4 }), 0.025, 0.04, 0.02, { rz: -0.3 });
  const antR = kit.at(head, kit.horn(0.05, crust, { baseR: 0.008, tipR: 0.003, bend: 0.4 }), -0.025, 0.04, 0.02, { rz: 0.3 });

  // Six short beetle legs.
  const legSpots = [
    { x: 0.13, z: 0.08, ry: 0.5 }, { x: -0.13, z: 0.08, ry: -0.5 },
    { x: 0.15, z: -0.01, ry: 1.0 }, { x: -0.15, z: -0.01, ry: -1.0 },
    { x: 0.13, z: -0.09, ry: 1.5 }, { x: -0.13, z: -0.09, ry: -1.5 },
  ];
  const legs = legSpots.map(({ x, z, ry }) => kit.at(body, kit.leg(0.11, crust, { thighR: 0.018, shinR: 0.013, footLen: 0.03 }), x, 0.02, z, { ry }));

  const embers = kit.mote(5, { color: 0xff9a3c, size: 0.014, radius: 0.15, height: 0.1, speed: 0.4, seed: 133 });
  kit.at(body, embers, 0, 0.02, 0);

  const spark = kit.heartspark(0.026, pal.eye, { seed: 134 });
  kit.at(body, spark, 0, 0.03, 0.08);

  return {
    group: kit.groundPlant(root),
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
