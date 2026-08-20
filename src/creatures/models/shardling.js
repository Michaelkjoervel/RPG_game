// =============================================================================
// SHARDLING — Terra/Lumen, stage 1, uncommon.
// "Crystal spiderling, translucent gem abdomen refracting light. Collector."
// (Design Bible §4)
// =============================================================================
// A small six-legged crawler built around one glowing focal point: a
// faceted gem abdomen (kit.crystal) that IS its collector's-eye centerpiece.
// Six thin `kit.leg()` limbs fan out radially from a stone-toned thorax —
// legN>=4 resolves the animator to 'quad' locomotion, which reads fine as a
// scuttling gait for a small many-legged creature. Kept low, wary, and
// glinting.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_shardling(kit = kitDefault) {
  const pal = kit.palette(['terra', 'lumen']);
  const stone = kit.mat(0x8a7a5c, { rough: 0.6 });
  const gemMat = kit.mat(0xf0dc9a, { rough: 0.1, metal: 0.06, transparent: true, opacity: 0.9, emissive: 0xd8a028, emissiveIntensity: 0.75 });

  const root = new THREE.Group();

  const thorax = kit.blob(0.07, stone, { seed: 60, noise: 0.1, squash: { x: 1, y: 0.85, z: 1.05 } });
  kit.paint(thorax, { from: 0x5e5138, to: 0xa8986e, noise: 0.05, seed: 60, rough: 0.6 });
  root.add(thorax);
  thorax.position.y = 0.09;

  // Translucent gem abdomen, trailing behind the thorax — the collector's
  // prize, refracting a faint scatter of light of its own. Bigger than the
  // body that drags it: the hoard IS the silhouette.
  const abdomen = kit.crystal(0.085, gemMat, { coreColor: pal.eye, detail: 0 });
  kit.at(thorax, abdomen, 0, 0.03, -0.1, { s: 1 });
  abdomen.rotation.x = 0.3;
  // Two smaller hoard-shards fused to its rim.
  kit.at(abdomen, kit.crystal(0.032, gemMat, { coreColor: 0xfff6dc, detail: 0 }), 0.06, 0.04, -0.02);
  kit.at(abdomen, kit.crystal(0.026, gemMat, { coreColor: 0xfff6dc, detail: 0 }), -0.055, 0.05, 0.02);

  const head = kit.at(thorax, kit.paint(kit.orb(0.036, stone, { sz: 1.1, sy: 0.85 }), { from: 0x5e5138, to: 0xa8986e, noise: 0.05, seed: 61, rough: 0.6 }), 0, 0.01, 0.075);
  const eyeL = kit.at(head, kit.eye(0.014, { irisColor: 0xffe9b0, skinColor: 0x8a7a5c, glintSize: 0.006 }), 0.024, 0.006, 0.03, { ry: 0.4 });
  const eyeR = kit.at(head, kit.eye(0.014, { irisColor: 0xffe9b0, skinColor: 0x8a7a5c, glintSize: 0.006 }), -0.024, 0.006, 0.03, { ry: -0.4 });
  const eyeL2 = kit.at(head, kit.eye(0.009, { irisColor: 0xffe9b0, skinColor: 0x8a7a5c, glintSize: 0.004 }), 0.02, 0.017, 0.028, { ry: 0.4 });
  const eyeR2 = kit.at(head, kit.eye(0.009, { irisColor: 0xffe9b0, skinColor: 0x8a7a5c, glintSize: 0.004 }), -0.02, 0.017, 0.028, { ry: -0.4 });

  // Small crystalline mandible spikes.
  kit.at(head, kit.cone(0.008, 0.024, gemMat, { segments: 4 }), 0.018, -0.015, 0.032, { rx: -0.5, rz: 0.2 });
  kit.at(head, kit.cone(0.008, 0.024, gemMat, { segments: 4 }), -0.018, -0.015, 0.032, { rx: -0.5, rz: -0.2 });

  // Six thin legs fanned radially — three pairs along the thorax.
  const legSpots = [
    { x: 0.06, z: 0.05, ry: 0.55 }, { x: -0.06, z: 0.05, ry: -0.55 },
    { x: 0.075, z: -0.01, ry: 0.95 }, { x: -0.075, z: -0.01, ry: -0.95 },
    { x: 0.06, z: -0.06, ry: 1.4 }, { x: -0.06, z: -0.06, ry: -1.4 },
  ];
  const legMat = kit.mat(0x655640, { rough: 0.6 }); // darker than the gem so the prize stays the bright thing
  const legs = legSpots.map(({ x, z, ry }) => kit.at(thorax, kit.leg(0.11, legMat, { thighR: 0.014, shinR: 0.01, footLen: 0.03 }), x, 0.09, z, { ry }));

  const legParts = legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot }));

  const spark = kit.heartspark(0.024, pal.eye, { seed: 61 });
  kit.at(abdomen, spark, 0, 0, 0);

  const grounded = kit.groundPlant(root);
  // Soft contact shadow so the creature reads planted on any ground.
  const contact = kit.shadowDisc(0.16, 0.32);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body: thorax,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid'), eyeL2.getObjectByName('eyelid'), eyeR2.getObjectByName('eyelid')],
      legs: legParts,
      accents: [abdomen],
      fx: [spark],
    },
    hints: {
      personality: 'skittish',
      locomotion: 'quad',
      breathAmp: 0.8,
      blinkEvery: 2.6,
    },
  };
}
