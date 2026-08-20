// =============================================================================
// SLUDGEMAW — Venom/Terra, stage 2 (Oozel awakens at L24).
// "Bulky tar-slime with stalactite teeth. Slow, inexorable." (Design Bible §4)
// =============================================================================
// Visual-overhaul rebuild. What carries it:
//   1. THE MAW — signature: a wide, dark cave of a mouth splitting the whole
//      front of the body, stalactite teeth hanging from the upper lip and
//      stalagmite teeth rising to meet them, with a faint venom glow deep
//      inside. The creature IS a mouth wearing a swamp.
//   2. TAR VALUE RAMP: vertex gradient from wet pitch-black base to an olive
//      oil-sheen top, heavy mottle — reads as viscous liquid, not rubber.
//   3. COOLED CRUST ISLANDS: jittered mineral plates riding the crown like
//      drifting pack-ice, one big enough to be a hat tilted off-centre.
// Tar drips (teardrop lathes) hang mid-slide down the flanks.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_sludgemaw(kit = kitDefault) {
  const pal = kit.palette(['venom', 'terra']);
  const tarV = kit.mat(0xffffff, { vertexColors: true, rough: 0.3 });
  const TAR_LO = 0x1a1408, TAR_HI = 0x6e6238;
  const CRUST_LO = 0x3a3222, CRUST_HI = 0x7d6f4e;
  const toothMat = kit.mat(0xd8cca4, { rough: 0.35 });
  const throatGlow = kit.mat(0x9ac838, { unlit: true, transparent: true, opacity: 0.55 });

  const paint = (mesh, seed, lo = TAR_LO, hi = TAR_HI, jit = 0) => {
    if (jit) jitterGeometry(mesh.geometry, jit, seed);
    applyVertexGradient(mesh.geometry, { from: lo, to: hi, noise: 0.06, seed });
    return mesh;
  };

  const root = new THREE.Group();

  // The tar heap — a taller, rounder slump so the maw has a real face-wall
  // to split (the old wide skirt read as a UFO, not a mouth).
  const body = kit.bulb(tarV, { height: 0.5, width: 0.42, neck: 0.5, segments: 14 });
  jitterGeometry(body.geometry, 0.018, 66);
  applyVertexGradient(body.geometry, { from: TAR_LO, to: TAR_HI, noise: 0.06, seed: 66 });
  root.add(body);
  body.rotation.y = 0.12;                            // heap slumps off-axis

  // --- THE MAW -------------------------------------------------------------
  // A dark recess splitting the front, upper lip overhanging.
  // THE MAW: a dark cave splitting the entire lower front — lip shelf above,
  // dropped jaw below, all of it proud of the body surface so it reads as an
  // opening, not a stripe.
  const mawGroup = new THREE.Group(); mawGroup.name = 'maw';
  kit.at(body, mawGroup, 0, 0.14, 0.3, { ry: -0.12 }); // counter the slump: maw faces +Z
  const cave = kit.orb(0.21, kit.mat(0x0b0804, { rough: 0.95 }), { sx: 1.3, sy: 0.85, sz: 0.9 });
  kit.at(mawGroup, cave, 0, -0.02, 0.1);
  const glow = kit.orb(0.14, throatGlow, { sx: 1.1, sy: 0.55, sz: 0.7 });
  kit.at(mawGroup, glow, 0, -0.08, 0.14);
  // Upper lip overhang.
  const lip = paint(kit.orb(0.23, tarV, { sx: 1.3, sy: 0.42, sz: 0.9 }), 67, TAR_LO, TAR_HI, 0.012);
  kit.at(mawGroup, lip, 0, 0.2, 0.1);
  // Lower jaw — its own part so the animator can drop it on attack. It hangs
  // OPEN a crack at rest: an inexorable mouth never fully closes.
  const jaw = paint(kit.orb(0.21, tarV, { sx: 1.25, sy: 0.3, sz: 1.0 }), 68, TAR_LO, 0x4a4226, 0.012);
  kit.at(mawGroup, jaw, 0, -0.24, 0.12, { rx: 0.12 });
  // Stalactite teeth hanging from the lip, stalagmites rising from the jaw.
  const toothN = 7;
  for (let i = 0; i < toothN; i++) {
    const t = i / (toothN - 1);
    const x = (t - 0.5) * 0.44;
    const len = 0.1 + Math.sin(t * Math.PI) * 0.055;
    kit.at(mawGroup, kit.fang(len, toothMat, { r: 0.026 }), x, 0.14, 0.3 - Math.abs(t - 0.5) * 0.16, { rz: (t - 0.5) * 0.2 });
    if (i % 2 === 0) {
      kit.at(jaw, kit.cone(0.022, 0.08 + Math.sin(t * Math.PI) * 0.03, toothMat, { segments: 5 }), x * 0.85, 0.02, 0.2 - Math.abs(t - 0.5) * 0.14);
    }
  }

  // Venom-bright eyes riding proud of the crown slope, above the maw.
  const eyeL = kit.at(body, kit.eye(0.052, { irisColor: 0xd0e86a, scleraColor: 0x141008, skinColor: 0x2a2414, glintSize: 0.019 }), 0.12, 0.42, 0.16, { ry: 0.22, rx: -0.1 });
  const eyeR = kit.at(body, kit.eye(0.052, { irisColor: 0xd0e86a, scleraColor: 0x141008, skinColor: 0x2a2414, glintSize: 0.019 }), -0.12, 0.42, 0.14, { ry: -0.32, rx: -0.1 });
  // Heavy tar brows half-swallowing the eyes.
  kit.at(body, paint(kit.orb(0.085, tarV, { sy: 0.5, sz: 0.85 }), 72, TAR_LO, 0x453e20), 0.12, 0.48, 0.16, { rz: -0.3 });
  kit.at(body, paint(kit.orb(0.085, tarV, { sy: 0.5, sz: 0.85 }), 73, TAR_LO, 0x453e20), -0.12, 0.48, 0.14, { rz: 0.3 });

  // --- Crust islands: ONE tilted cap + one small floe --------------------
  const crustPlates = [];
  for (const [x, y, z, sz, rz, seed] of [[0.03, 0.56, -0.04, 0.15, 0.22, 74], [-0.14, 0.48, -0.12, 0.085, -0.4, 75]]) {
    const c = kit.blob(sz, tarV, { seed, noise: 0.22, squash: { x: 1.2, y: 0.45, z: 1.05 } });
    paint(c, seed, CRUST_LO, CRUST_HI);
    crustPlates.push(kit.at(body, c, x, y, z, { rz, ry: seed }));
  }
  // Stalagmite spikes growing out of the big crust cap.
  kit.at(crustPlates[0], kit.cone(0.03, 0.1, kit.mat(0x6e6244, { rough: 0.6 }), { segments: 5 }), 0.04, 0.04, 0.02, { rx: -0.25 });
  kit.at(crustPlates[0], kit.cone(0.022, 0.065, kit.mat(0x6e6244, { rough: 0.6 }), { segments: 5 }), -0.05, 0.035, -0.03, { rx: 0.2, rz: 0.3 });

  // Tar drips sliding down the flanks — teardrops hanging tip-down.
  for (const [x, y, z, s, seed] of [[0.2, 0.2, 0.12, 1, 75], [-0.19, 0.16, -0.12, 0.8, 76], [0.05, 0.12, -0.24, 0.7, 77]]) {
    const drip = kit.teardrop(tarV, { height: 0.14 * s, width: 0.05 * s, segments: 7 });
    paint(drip, seed, TAR_LO, 0x4a4226);
    kit.at(body, drip, x, y, z, { rx: Math.PI });
  }

  const gooDrip = kit.mote(7, { color: 0x9ac838, size: 0.024, radius: 0.2, height: 0.14, speed: 0.22, seed: 68 });
  kit.at(body, gooDrip, 0, 0.3, 0.1);

  const spark = kit.heartspark(0.04, pal.eye, { seed: 69 });
  kit.at(body, spark, 0, 0.26, 0.3);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      jaw,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      accents: crustPlates,
      fx: [gooDrip, spark],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'hop',
      breathAmp: 1.4,
      blinkEvery: 4.6,
    },
  };
}
