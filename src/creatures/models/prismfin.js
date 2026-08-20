// =============================================================================
// PRISMFIN — Tide/Lumen, stage 2 (Finnet awakens at L22).
// "Grand koi whose fins split light into slow-turning auroras. Lake
// spirit's herald." (Design Bible §4)
// =============================================================================
// Finnet grown grand and radiant: the same lozenge-koi body plan, but every
// fin is now a LAYERED stack of translucent, additive-blended panels in a
// violet→blue→teal→gold gradient — the "aurora" effect — rather than one
// flat color. Those layered fins (especially the tall dorsal sail and the
// long trailing tail fin) are also doing structural work: they add real
// HEIGHT to the silhouette without adding body length, which matters here
// because this is one of the five long/horizontal-bodied species flagged
// for extra proportion care — registry.js rescales the whole model
// uniformly to match SPECIES.prismfin.size against measured bbox HEIGHT, so
// a tall fin fan (and a deliberately short tail) keeps the final body
// length from ballooning.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

const AURORA = [0xb08cff, 0x6fa8ff, 0x6fe0c8, 0xffe08c];

function auroraFin(kit, len, opts = {}) {
  const group = new THREE.Group(); group.name = 'auroraFin';
  const layers = [];
  for (let i = 0; i < AURORA.length; i++) {
    const m = kit.mat(AURORA[i], { unlit: true, additive: true, opacity: 0.48, side: THREE.DoubleSide });
    const f = kit.fin(len * (1 - i * 0.16), m, { width: opts.width, curve: 0.15 + i * 0.05 });
    f.position.y = i * len * 0.05;
    group.add(f);
    layers.push(f);
  }
  return { group, layers };
}

export function build_prismfin(kit = kitDefault) {
  const pal = kit.palette(['tide', 'lumen']);
  // Pearl body: vertex gradient from a cool violet-pearl belly up to warm
  // ivory along the spine — an opal, not a flat white fish.
  const skin = kit.mat(0xffffff, { vertexColors: true, rough: 0.3, metal: 0.06 });
  const skinAccent = kit.mat(0xb08cff, { rough: 0.3 });
  const paint = (mesh, seed) => {
    applyVertexGradient(mesh.geometry, { from: 0xb2a4d4, to: 0xfdf8ea, noise: 0.035, seed });
    return mesh;
  };

  const root = new THREE.Group();

  const body = kit.blob(0.16, skin, { seed: 82, noise: 0.06, squash: { x: 0.66, y: 0.8, z: 1.2 } });
  jitterGeometry(body.geometry, 0.005, 82);
  paint(body, 82);
  root.add(body);
  body.position.y = 0.2;

  // Koi mottling: violet saddle patches + a gold crown blaze.
  kit.at(body, kit.orb(0.06, skinAccent), 0.045, 0.05, 0.1, { sy: 0.5 });
  kit.at(body, kit.orb(0.045, skinAccent), -0.03, -0.03, -0.06, { sy: 0.5 });
  kit.at(body, kit.orb(0.05, kit.mat(0xffd98c, { rough: 0.3 })), -0.02, 0.08, 0.06, { sy: 0.45 });

  const eyeL = kit.at(body, kit.eye(0.036, { irisColor: 0x2a1c4a, skinColor: 0xf2f0e0, glintSize: 0.015 }), 0.085, 0.03, 0.19, { ry: 0.4 });
  const eyeR = kit.at(body, kit.eye(0.036, { irisColor: 0x2a1c4a, skinColor: 0xf2f0e0, glintSize: 0.015 }), -0.085, 0.03, 0.19, { ry: -0.4 });

  const whiskerMat = kit.mat(0xffe9b0, { unlit: true, transparent: true, opacity: 0.75 });
  const whiskL = kit.at(body, kit.leafBlade(0.07, whiskerMat, { width: 0.005 }), 0.06, -0.02, 0.2, { ry: -0.3, rz: 0.1 });
  const whiskR = kit.at(body, kit.leafBlade(0.07, whiskerMat, { width: 0.005 }), -0.06, -0.02, 0.2, { ry: Math.PI + 0.3, rz: -0.1 });

  // Tall dorsal aurora sail — adds height, not length.
  const dorsal = auroraFin(kit, 0.3, { width: 0.2 });
  kit.at(body, dorsal, 0, 0.1, 0.03, { rx: -1.15, ry: Math.PI });

  const pecL = auroraFin(kit, 0.16, { width: 0.1 });
  kit.at(body, pecL, 0.09, -0.01, 0.08, { rx: -0.15, ry: 0.9 });
  const pecR = auroraFin(kit, 0.16, { width: 0.1 });
  kit.at(body, pecR, -0.09, -0.01, 0.08, { rx: -0.15, ry: -0.9 });

  const tail = kit.at(body, kit.tailChain(3, skin, { segLen: 0.032, startR: 0.065, endR: 0.017 }), 0, 0, -0.13);
  tail.pivots.forEach((p, i) => {
    for (const c of p.children) if (c.isMesh && c.geometry && c.geometry.attributes) paint(c, 85 + i);
  });
  const tailFin = auroraFin(kit, 0.2, { width: 0.15 });
  kit.at(tail.pivots[tail.pivots.length - 1], tailFin, 0, 0, -0.025, { ry: Math.PI / 2 });
  // Two long trailing ribbon-fins off the tail — the grand koi's train.
  const ribbonMat = kit.mat(0x9fc8ff, { unlit: true, additive: true, opacity: 0.5, side: THREE.DoubleSide });
  const ribbonL = kit.at(tail.pivots[tail.pivots.length - 1], kit.leafBlade(0.22, ribbonMat, { width: 0.045 }), 0.02, 0.01, -0.03, { ry: Math.PI / 2 + 0.3, rz: 0.25 });
  const ribbonR = kit.at(tail.pivots[tail.pivots.length - 1], kit.leafBlade(0.22, ribbonMat, { width: 0.045 }), -0.02, 0.01, -0.03, { ry: Math.PI / 2 - 0.3, rz: 0.25 });

  // Trailing aurora shimmer — a loose ribbon of drifting color motes.
  const auroraGlow = kit.mote(12, { color: 0x9fc8ff, size: 0.02, radius: 0.3, height: 0.22, speed: 0.3, seed: 83 });
  kit.at(body, auroraGlow, 0, 0.08, -0.15);

  const spark = kit.heartspark(0.04, pal.eye, { seed: 84 });
  kit.at(body, spark, 0, 0.01, 0.11);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      accents: [whiskL, whiskR, dorsal.group, pecL.group, pecR.group, tailFin.group, ribbonL, ribbonR],
      fx: [auroraGlow, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'float',
      hover: true,
      hoverAmp: 0.05,
      breathAmp: 0.8,
      blinkEvery: 4.2,
    },
  };
}
