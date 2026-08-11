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

export function build_oozel(kit = kitDefault) {
  const pal = kit.palette(['venom']);
  const goo = kit.mat(pal.primary, { rough: 0.28, transparent: true, opacity: 0.92 });
  const crust = kit.mat(0x7a6f52, { rough: 0.7 });
  const sheen = kit.mat(0xffffff, { unlit: true, transparent: true, opacity: 0.22 });

  const root = new THREE.Group();

  const body = kit.bulb(goo, { height: 0.24, width: 0.29, neck: 0.32, segments: 12 });
  root.add(body);

  // Wet highlight sheen — a thin unlit cap draped over the shoulder of the
  // bulb, catching "light" regardless of the actual scene lighting angle.
  const sheenCap = kit.orb(0.14, sheen, { sx: 0.85, sy: 0.5, sz: 0.7 });
  kit.at(body, sheenCap, 0.06, 0.15, 0.1, { rz: -0.3 });

  // Mineral crust hat, fused at the pinched neck.
  const hat = kit.blob(0.1, crust, { seed: 63, noise: 0.22, squash: { x: 1.05, y: 0.6, z: 1 } });
  kit.at(body, hat, 0, 0.2, 0, { rz: 0.08 });
  kit.at(hat, kit.cone(0.02, 0.04, crust, { segments: 5 }), 0.03, 0.03, 0.02, { rx: -0.3 });
  kit.at(hat, kit.cone(0.016, 0.03, crust, { segments: 5 }), -0.04, 0.025, -0.02, { rx: -0.2, ry: 1 });

  const eyeL = kit.at(body, kit.eye(0.032, { irisColor: pal.eye, scleraColor: 0xf4f2e6, skinColor: pal.primary, glintSize: 0.012 }), 0.08, 0.03, 0.2, { ry: 0.3 });
  const eyeR = kit.at(body, kit.eye(0.032, { irisColor: pal.eye, scleraColor: 0xf4f2e6, skinColor: pal.primary, glintSize: 0.012 }), -0.08, 0.03, 0.2, { ry: -0.3 });

  // A trio of small absorbed-puddle droplets suspended within the goo,
  // slowly rising and popping — the "absorbs puddles" habit made visible.
  const droplets = kit.mote(5, { color: 0xdcefe0, size: 0.02, radius: 0.12, height: 0.14, speed: 0.35, seed: 64 });
  kit.at(body, droplets, 0, 0.1, 0);

  const spark = kit.heartspark(0.03, pal.eye, { seed: 65 });
  kit.at(body, spark, 0, 0.05, 0.15);

  return {
    group: kit.groundPlant(root),
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
