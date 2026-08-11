// =============================================================================
// MYCLET — Bloom/Venom, stage 1 wild (Whisperwood).
// "Mushroom imp with cap-hat and spore pouch cheeks. Mischievous."
// (Design Bible §4)
// =============================================================================
// The "cap-hat" is worn, not grown from the head — a flattened, spot-dotted
// dome sitting slightly askew, exactly like a hat a small imp would tug on.
// Spore-pouch cheeks (two bulging orbs) and a lopsided grin sell
// "mischievous" through body language rather than a complex face rig.

import * as THREE from 'three';
import { seededRandom } from '../../core/rng.js';
import * as kitDefault from '../kit.js';

export function build_myclet(kit = kitDefault) {
  const pal = kit.palette(['bloom', 'venom']);
  const skin = kit.mat(0x5a6e3a, { rough: 0.6 });          // mossy imp-green skin
  const capMat = kit.mat(0x6a3a5c, { rough: 0.55 });       // plum mushroom cap
  const spotMat = kit.mat(0xe8d8c8, { rough: 0.4 });       // pale cap spots
  const pouchMat = kit.mat(pal.secondary, { rough: 0.45, transparent: true, opacity: 0.9 });

  const root = new THREE.Group();

  const body = kit.blob(0.13, skin, { seed: 120, noise: 0.13, squash: { x: 1, y: 0.95, z: 1.08 } });
  root.add(body);
  body.position.y = 0.15;

  const head = kit.at(body, kit.orb(0.1, skin, { sz: 1.02 }), 0, 0.1, 0.02);

  // Spore-pouch cheeks — bulging and mischievous.
  const pouchL = kit.at(head, kit.orb(0.045, pouchMat, { sx: 1.1 }), 0.09, -0.02, 0.03);
  const pouchR = kit.at(head, kit.orb(0.045, pouchMat, { sx: 1.1 }), -0.09, -0.02, 0.03);

  const eyeL = kit.at(head, kit.eye(0.036, { irisColor: 0x2a1a2a, skinColor: 0x5a6e3a, glintSize: 0.013 }), 0.05, 0.02, 0.085, { ry: 0.3 });
  const eyeR = kit.at(head, kit.eye(0.032, { irisColor: 0x2a1a2a, skinColor: 0x5a6e3a, glintSize: 0.012 }), -0.052, 0.014, 0.08, { ry: -0.35 }); // slightly asymmetric — a lopsided, mischievous look

  // Mushroom cap-hat: a flattened, spotted dome worn slightly askew.
  const cap = kit.at(head, kit.orb(0.11, capMat, { sy: 0.5, sx: 1.25, sz: 1.2 }), 0, 0.075, -0.01, { rz: 0.12 });
  const rng = seededRandom(21);
  const spots = [];
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2, r = 0.05 + rng() * 0.05;
    const s = kit.at(cap, kit.orb(0.014 + rng() * 0.008, spotMat.clone()), Math.cos(a) * r, 0.045 + rng() * 0.01, Math.sin(a) * r * 0.9);
    spots.push(s);
  }
  // Cap rim edge for a proper mushroom silhouette.
  kit.at(head, kit.cone(0.115, 0.02, capMat, { segments: 10, flip: true }), 0, 0.045, -0.01, { rz: 0.12 });

  // Two short, stubby imp legs.
  const legDefs = [[0.06, 0.05, 0.03], [-0.06, 0.05, 0.03]];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.11, skin, { thighR: 0.03, shinR: 0.023, footLen: 0.045 }), x, y, z));

  // Stubby imp tail.
  const tail = kit.at(body, kit.tailChain(2, skin, { segLen: 0.035, startR: 0.03, endR: 0.014 }), 0, 0.02, -0.13);

  // A tiny drift of purple-green spores near the cheeks — impish mischief.
  const spores = kit.mote(6, { color: pal.secondary, size: 0.012, radius: 0.09, height: 0.06, speed: 0.6, seed: 121 });
  kit.at(head, spores, 0, -0.02, 0.06);

  const spark = kit.heartspark(0.026, pal.eye, { seed: 122 });
  kit.at(body, spark, 0, 0.02, 0.1);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [cap, pouchL, pouchR],
      fx: [spores, spark],
    },
    hints: {
      personality: 'eager',
      locomotion: 'hop',
      breathAmp: 1.1,
      blinkEvery: 2.3,
    },
  };
}
