// =============================================================================
// DUSKIT — Umbra, stage 1 wild (Whisperwood).
// "Small twilight owl, mask-like face disc, silent. Judgmental stare."
// (Design Bible §4)
// =============================================================================
// A compact, still little owl. The "mask-like face disc" is a flattened
// pale disc set into the dark plumage — the single highest-contrast shape
// on the model, so the eyes (and their stare) read instantly even at a
// distance. 'calm' personality (slow, still, minimal fidget) plays the
// "silent, judgmental" read better than any extra geometry could.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_duskit(kit = kitDefault) {
  const pal = kit.palette(['umbra']);
  // Twilight-plum plumage lifted to a readable dark violet-slate (~10% albedo
  // + a faint violet self-glow) so the silhouette reads in any light — the
  // moody identity comes from hue and the pale disc's contrast, not darkness.
  const skin = kit.mat(0x5b5180, { rough: 0.6, emissive: 0x2a2348, emissiveIntensity: 0.55 });
  const discMat = kit.mat(0xb8b0c4, { rough: 0.5 });       // pale mask-disc
  const beakMat = kit.mat(0x453a56, { rough: 0.35 });

  const root = new THREE.Group();

  const body = kit.blob(0.1, skin, { seed: 160, noise: 0.08, squash: { x: 1.05, y: 1.1, z: 1 } });
  kit.paint(body, { from: 0x453c66, to: 0x746796, noise: 0.05, seed: 160 });
  root.add(body);
  body.position.y = 0.14;

  const head = kit.at(body, kit.orb(0.09, skin, { sy: 1.02 }), 0, 0.09, 0.01);
  kit.paint(head, { from: 0x4f4573, to: 0x7d70a2, noise: 0.05, seed: 161 });

  // The mask-like face disc — flattened and pale, the model's one loud
  // contrast against the otherwise dark plumage. Gradient warms it faintly
  // toward the brow like moonlight caught top-down.
  const disc = kit.at(head, kit.orb(0.08, discMat, { sy: 1.05, sz: 0.35 }), 0, 0, 0.04);
  kit.paint(disc, { from: 0x968aa8, to: 0xcfc8da, noise: 0.03, seed: 162 });

  const eyeL = kit.at(disc, kit.eye(0.032, { irisColor: pal.primary, scleraColor: 0x18141c, skinColor: 0xb8b0c4, glintSize: 0.012 }), 0.035, 0.005, 0.11, { ry: 0.15 });
  const eyeR = kit.at(disc, kit.eye(0.032, { irisColor: pal.primary, scleraColor: 0x18141c, skinColor: 0xb8b0c4, glintSize: 0.012 }), -0.035, 0.005, 0.11, { ry: -0.15 });
  const beak = kit.at(disc, kit.cone(0.016, 0.03, beakMat, { segments: 6 }), 0, -0.03, 0.11, { rx: Math.PI / 2 });

  // Small ear-tufts — a subtle owl silhouette detail.
  const tuftL = kit.at(head, kit.leafBlade(0.03, skin, { width: 0.012 }), 0.045, 0.075, -0.01, { rx: -1.2, rz: 0.15 });
  const tuftR = kit.at(head, kit.leafBlade(0.03, skin, { width: 0.012 }), -0.045, 0.075, -0.01, { rx: -1.2, rz: -0.15 });

  // Small rounded wings, folded still.
  const wingDefs = [[0.08, 0, -0.02, 1], [-0.08, 0, -0.02, -1]];
  const wingParts = wingDefs.map(([x, y, z, side]) => {
    const w = kit.wing(0.1, skin, { style: 'feathered', bones: 2, width: 0.09 });
    kit.at(body, w, x, y, z, { ry: 0.1 });
    w.group.scale.x = side;
    return w;
  });

  // Small talon feet.
  const legDefs = [[0.035, 0.02, 0.01], [-0.035, 0.02, 0.01]];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.07, beakMat, { thighR: 0.017, shinR: 0.013, footLen: 0.03 }), x, y, z));

  const spark = kit.heartspark(0.024, pal.eye, { seed: 161 });
  kit.at(body, spark, 0, 0, 0.06);

  root.add(kit.shadowDisc(0.13, 0.34));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      wings: wingParts.map((w) => w.bones),
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [disc, tuftL, tuftR, beak],
      fx: [spark],
    },
    hints: {
      personality: 'calm',
      locomotion: 'fly',
      breathAmp: 0.7,
      blinkEvery: 5.0,
    },
  };
}
