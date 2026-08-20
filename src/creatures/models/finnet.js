// =============================================================================
// FINNET — Tide, stage 1, common.
// "Glass-finned koi, transparent fins like stained glass. Mirror-gazer."
// (Design Bible §4)
// =============================================================================
// A small ornamental koi. `hints.locomotion:'float'` + `hover:true` gives it
// a gentle hover-bob whether it's technically "standing" on a lake bed or
// glimpsed drifting mid-water by wildlife.js — no legs needed. Its fins are
// the whole point: several kit.fin() panels in jewel-tone, glassy,
// transparent materials (a different hue per fin, echoing "stained glass"
// rather than one flat color) fanned from a simple lozenge body.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_finnet(kit = kitDefault) {
  const pal = kit.palette(['tide']);
  // Ornamental koi gold: warm amber belly rising to pale cream along the
  // spine, mottled — a jewel-fish, not a flat yellow lozenge.
  const skin = kit.mat(0xffffff, { vertexColors: true, rough: 0.35, metal: 0.05 });
  const skinDark = kit.mat(0xd8814a, { rough: 0.35 });
  const finBlue = kit.mat(0x6fc4e8, { rough: 0.12, transparent: true, opacity: 0.72, side: THREE.DoubleSide, emissive: 0x2a7aa0, emissiveIntensity: 0.4 });
  const finTeal = kit.mat(0x7ae8c8, { rough: 0.12, transparent: true, opacity: 0.68, side: THREE.DoubleSide, emissive: 0x2f9678, emissiveIntensity: 0.4 });

  const root = new THREE.Group();

  const body = kit.blob(0.11, skin, { seed: 80, noise: 0.06, squash: { x: 0.66, y: 0.85, z: 1.25 } });
  jitterGeometry(body.geometry, 0.004, 80);
  applyVertexGradient(body.geometry, { from: 0xc9963e, to: 0xfaf0d0, noise: 0.045, seed: 80 });
  root.add(body);
  body.position.y = 0.13;

  // Koi mottling — bold saddle patches.
  kit.at(body, kit.orb(0.05, skinDark), 0.035, 0.04, 0.06, { sy: 0.45 });
  kit.at(body, kit.orb(0.04, skinDark), -0.025, 0.02, -0.06, { sy: 0.45 });
  kit.at(body, kit.orb(0.03, kit.mat(0xf2f0e4, { rough: 0.35 })), 0.01, 0.05, -0.01, { sy: 0.4 });

  const eyeL = kit.at(body, kit.eye(0.026, { irisColor: 0x123a4a, skinColor: 0xe0b45e, glintSize: 0.011 }), 0.058, 0.03, 0.12, { ry: 0.45 });
  const eyeR = kit.at(body, kit.eye(0.026, { irisColor: 0x123a4a, skinColor: 0xe0b45e, glintSize: 0.011 }), -0.058, 0.03, 0.12, { ry: -0.45 });

  // Barbel whiskers, koi-appropriate.
  const whiskerMat = kit.mat(0xf2e6c4, { unlit: true, transparent: true, opacity: 0.7 });
  const whiskL = kit.at(body, kit.leafBlade(0.045, whiskerMat, { width: 0.004 }), 0.045, -0.01, 0.14, { ry: -0.3, rz: 0.1 });
  const whiskR = kit.at(body, kit.leafBlade(0.045, whiskerMat, { width: 0.004 }), -0.045, -0.01, 0.14, { ry: Math.PI + 0.3, rz: -0.1 });

  // Stained-glass fins: dorsal, two pectoral, one ventral — alternating hue,
  // each big enough to catch light like a window pane.
  const dorsal = kit.at(body, kit.fin(0.15, finBlue, { width: 0.11 }), 0, 0.08, 0.02, { rx: -1.15, ry: Math.PI });
  const pecL = kit.at(body, kit.fin(0.1, finTeal, { width: 0.07 }), 0.06, -0.01, 0.05, { rx: -0.15, ry: 0.9 });
  const pecR = kit.at(body, kit.fin(0.1, finTeal, { width: 0.07 }), -0.06, -0.01, 0.05, { rx: -0.15, ry: -0.9 });
  const ventral = kit.at(body, kit.fin(0.08, finBlue, { width: 0.055 }), 0, -0.075, -0.02, { rx: 1.3, ry: Math.PI });

  // Flowing tail fin — the koi's signature flourish, kept modest so the
  // model's length:height ratio doesn't balloon once registry.js rescales
  // the whole body uniformly to match SPECIES.finnet.size against measured
  // bbox HEIGHT (a small ornamental koi should stay small end-to-end).
  const tail = kit.at(body, kit.tailChain(3, skin, { segLen: 0.028, startR: 0.045, endR: 0.014 }), 0, 0, -0.1);
  tail.pivots.forEach((p, i) => {
    for (const c of p.children) if (c.isMesh && c.geometry && c.geometry.attributes) {
      applyVertexGradient(c.geometry, { from: 0xc9963e, to: 0xf5e8c4, noise: 0.045, seed: 86 + i });
    }
  });
  const tailFin = kit.at(tail.pivots[tail.pivots.length - 1], kit.fin(0.11, finBlue, { width: 0.08 }), 0, 0, -0.02, { ry: Math.PI / 2 });
  const tailFin2 = kit.at(tail.pivots[tail.pivots.length - 1], kit.fin(0.11, finTeal, { width: 0.08 }), 0, 0, -0.02, { ry: -Math.PI / 2 });

  const spark = kit.heartspark(0.028, pal.eye, { seed: 81 });
  kit.at(body, spark, 0, 0, 0.08);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      accents: [whiskL, whiskR, dorsal, pecL, pecR, ventral, tailFin, tailFin2],
      fx: [spark],
    },
    hints: {
      personality: 'calm',
      locomotion: 'float',
      hover: true,
      hoverAmp: 0.045,
      breathAmp: 0.85,
      blinkEvery: 3.8,
    },
  };
}
