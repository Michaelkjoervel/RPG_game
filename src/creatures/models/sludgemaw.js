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

  // The tar heap — wide, sagging, asymmetric.
  const body = kit.bulb(tarV, { height: 0.42, width: 0.5, neck: 0.44, segments: 14 });
  jitterGeometry(body.geometry, 0.02, 66);
  applyVertexGradient(body.geometry, { from: TAR_LO, to: TAR_HI, noise: 0.06, seed: 66 });
  root.add(body);
  body.rotation.y = 0.15;                            // heap slumps off-axis

  // --- THE MAW -------------------------------------------------------------
  // A dark recess splitting the front, upper lip overhanging.
  // The bulb's front surface at maw height sits near z≈0.42 — everything
  // here is pushed PROUD of that, or the mouth reads as a closed lump.
  const mawGroup = new THREE.Group(); mawGroup.name = 'maw';
  kit.at(body, mawGroup, 0, 0.16, 0.34, { ry: -0.15 }); // counter the slump: maw faces +Z
  const cave = kit.orb(0.2, kit.mat(0x0b0804, { rough: 0.95 }), { sx: 1.4, sy: 0.7, sz: 0.9 });
  kit.at(mawGroup, cave, 0, -0.03, 0.08);
  const glow = kit.orb(0.13, throatGlow, { sx: 1.25, sy: 0.45, sz: 0.7 });
  kit.at(mawGroup, glow, 0, -0.06, 0.08);
  // Upper lip overhang.
  const lip = paint(kit.orb(0.24, tarV, { sx: 1.4, sy: 0.4, sz: 0.85 }), 67, TAR_LO, TAR_HI, 0.012);
  kit.at(mawGroup, lip, 0, 0.16, 0.12);
  // Lower jaw — its own part so the animator can drop it on attack.
  const jaw = paint(kit.orb(0.22, tarV, { sx: 1.35, sy: 0.32, sz: 0.9 }), 68, TAR_LO, 0x4a4226, 0.012);
  kit.at(mawGroup, jaw, 0, -0.2, 0.14);
  // Stalactite teeth hanging from the lip, stalagmites rising from the jaw.
  const toothN = 6;
  for (let i = 0; i < toothN; i++) {
    const t = i / (toothN - 1);
    const x = (t - 0.5) * 0.46;
    const len = 0.085 + Math.sin(t * Math.PI) * 0.05;
    kit.at(mawGroup, kit.fang(len, toothMat, { r: 0.024 }), x, 0.12, 0.26 - Math.abs(t - 0.5) * 0.12, { rz: (t - 0.5) * 0.2 });
    if (i % 2 === 0) {
      kit.at(jaw, kit.cone(0.02, 0.07 + Math.sin(t * Math.PI) * 0.03, toothMat, { segments: 5 }), x * 0.85, 0.0, 0.14 - Math.abs(t - 0.5) * 0.1);
    }
  }

  // Venom-bright eyes riding proud of the crown slope, above the maw.
  const eyeL = kit.at(body, kit.eye(0.05, { irisColor: 0xd0e86a, scleraColor: 0x141008, skinColor: 0x2a2414, glintSize: 0.018 }), 0.13, 0.32, 0.19, { ry: 0.25, rx: -0.1 });
  const eyeR = kit.at(body, kit.eye(0.05, { irisColor: 0xd0e86a, scleraColor: 0x141008, skinColor: 0x2a2414, glintSize: 0.018 }), -0.13, 0.32, 0.17, { ry: -0.35, rx: -0.1 });
  // Heavy tar brows half-swallowing the eyes.
  kit.at(body, paint(kit.orb(0.085, tarV, { sy: 0.5, sz: 0.85 }), 72, TAR_LO, 0x453e20), 0.13, 0.38, 0.19, { rz: -0.3 });
  kit.at(body, paint(kit.orb(0.085, tarV, { sy: 0.5, sz: 0.85 }), 73, TAR_LO, 0x453e20), -0.13, 0.38, 0.17, { rz: 0.3 });

  // --- Crust islands -------------------------------------------------------
  const crustPlates = [];
  const crustSpots = [[0.02, 0.48, -0.06, 0.16, 0.2], [-0.15, 0.42, 0.08, 0.1, -0.4], [0.14, 0.4, -0.16, 0.09, 0.7]];
  for (const [x, y, z, sz, rz] of crustSpots) {
    const c = kit.blob(sz, tarV, { seed: 66 + sz * 100, noise: 0.22, squash: { x: 1.15, y: 0.5, z: 1 } });
    paint(c, 74 + sz * 10, CRUST_LO, CRUST_HI);
    crustPlates.push(kit.at(body, c, x, y, z, { rz, ry: sz * 8 }));
  }
  // Stalagmite spikes growing out of the big crust hat.
  kit.at(crustPlates[0], kit.cone(0.03, 0.09, kit.mat(0x6e6244, { rough: 0.6 }), { segments: 5 }), 0.04, 0.05, 0.02, { rx: -0.25 });
  kit.at(crustPlates[0], kit.cone(0.022, 0.06, kit.mat(0x6e6244, { rough: 0.6 }), { segments: 5 }), -0.05, 0.04, -0.03, { rx: 0.2, rz: 0.3 });

  // Tar drips sliding down the flanks — teardrops hanging tip-up.
  for (const [x, y, z, s, seed] of [[0.24, 0.14, 0.1, 1, 75], [-0.22, 0.1, -0.12, 0.8, 76], [0.06, 0.08, -0.26, 0.7, 77]]) {
    const drip = kit.teardrop(tarV, { height: 0.14 * s, width: 0.05 * s, segments: 7 });
    paint(drip, seed, TAR_LO, 0x4a4226);
    kit.at(body, drip, x, y, z, { rx: Math.PI });     // point the tip DOWN
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
