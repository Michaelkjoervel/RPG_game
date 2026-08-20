// =============================================================================
// OOZEL — Venom, stage 1, common.
// "Dripstone slime with mineral crust hat. Absorbs puddles." (Design Bible §4)
// =============================================================================
// Built around `kit.bulb()` — a lathe shape kit.js calls out by name as the
// right tool for oozes: a rounded belly pinched to a narrower neck, base
// flush at y=0. A crusty mineral "hat" (a squashed rock blob) sits fused to
// the pinch point, and a thin unlit highlight cap fakes the wet surface
// sheen a slime needs to read as liquid rather than solid rubber.
//
// PROPORTION NOTE for whoever's eyeballing bounding boxes later: registry.js
// scales the WHOLE model uniformly by (SPECIES.oozel.size / measured bbox
// HEIGHT). This body is authored wider than it is tall (a "puddle wearing a
// hat", not a beach ball) — width:height sits under 1.4:1 here on purpose,
// so scaling to match height never balloons it into something absurdly wide.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_oozel(kit = kitDefault) {
  const pal = kit.palette(['venom']);
  // Goo with a real value ramp: deep murky violet at the puddle-base rising
  // to a lit lilac shoulder — wet slime, not purple rubber.
  const goo = kit.mat(0xffffff, { vertexColors: true, rough: 0.28, transparent: true, opacity: 0.94 });
  const GOO_LO = 0x4c2866, GOO_HI = 0xcf9ae8;
  const crust = kit.mat(0xffffff, { vertexColors: true, rough: 0.7 });
  const sheen = kit.mat(0xffffff, { unlit: true, transparent: true, opacity: 0.22 });

  const root = new THREE.Group();

  const body = kit.bulb(goo, { height: 0.24, width: 0.29, neck: 0.32, segments: 12 });
  jitterGeometry(body.geometry, 0.012, 63);
  applyVertexGradient(body.geometry, { from: GOO_LO, to: GOO_HI, noise: 0.05, seed: 63 });
  root.add(body);

  // Wet highlight sheen — a thin unlit cap draped over the shoulder of the
  // bulb, catching "light" regardless of the actual scene lighting angle.
  const sheenCap = kit.orb(0.14, sheen, { sx: 0.85, sy: 0.5, sz: 0.7 });
  kit.at(body, sheenCap, 0.06, 0.15, 0.1, { rz: -0.3 });

  // Goo drips mid-slide down the flanks — teardrops hanging tip-down.
  for (const [x, y, z, s, seed] of [[0.14, 0.1, 0.06, 1, 21], [-0.12, 0.08, -0.08, 0.75, 22]]) {
    const drip = kit.teardrop(goo, { height: 0.09 * s, width: 0.032 * s, segments: 7 });
    applyVertexGradient(drip.geometry, { from: GOO_LO, to: 0xa878cc, noise: 0.05, seed });
    kit.at(body, drip, x, y, z, { rx: Math.PI });
  }

  // Mineral crust hat, fused at the pinched neck — bigger, tipped rakishly.
  const hat = kit.blob(0.115, crust, { seed: 63, noise: 0.24, squash: { x: 1.1, y: 0.62, z: 1 } });
  applyVertexGradient(hat.geometry, { from: 0x4c4432, to: 0x94875e, noise: 0.06, seed: 64 });
  kit.at(body, hat, 0.025, 0.21, -0.01, { rz: 0.18, ry: 0.5 });
  const crustCone = kit.mat(0x8a7d54, { rough: 0.65 });
  kit.at(hat, kit.cone(0.024, 0.05, crustCone, { segments: 5 }), 0.03, 0.035, 0.02, { rx: -0.3 });
  kit.at(hat, kit.cone(0.018, 0.036, crustCone, { segments: 5 }), -0.045, 0.028, -0.02, { rx: -0.2, ry: 1 });

  const eyeL = kit.at(body, kit.eye(0.034, { irisColor: 0x3a1c4e, scleraColor: 0xf4f2e6, skinColor: 0x8a5cac, glintSize: 0.014 }), 0.08, 0.05, 0.2, { ry: 0.3 });
  const eyeR = kit.at(body, kit.eye(0.034, { irisColor: 0x3a1c4e, scleraColor: 0xf4f2e6, skinColor: 0x8a5cac, glintSize: 0.014 }), -0.08, 0.05, 0.2, { ry: -0.3 });

  // A trio of small absorbed-puddle droplets suspended within the goo,
  // slowly rising and popping — the "absorbs puddles" habit made visible.
  const droplets = kit.mote(5, { color: 0xdcefe0, size: 0.02, radius: 0.12, height: 0.14, speed: 0.35, seed: 64 });
  kit.at(body, droplets, 0, 0.1, 0);

  const spark = kit.heartspark(0.03, pal.eye, { seed: 65 });
  kit.at(body, spark, 0, 0.05, 0.15);

  const grounded = kit.groundPlant(root);
  // Soft contact shadow so the creature reads planted on any ground.
  const contact = kit.shadowDisc(0.3, 0.32);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      accents: [hat],
      fx: [droplets, spark],
    },
    hints: {
      personality: 'sleepy',
      locomotion: 'hop',
      hover: false,
      breathAmp: 1.3,
      blinkEvery: 4.0,
    },
  };
}
