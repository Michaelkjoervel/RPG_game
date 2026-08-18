// =============================================================================
// MOTLING — Gale, stage 1 wild (Dawnmeadow & Brighthollow outskirts).
// "Palm-sized dust-moth sprite with mote-glow antennae. Drawn to light."
// (Design Bible §4)
// =============================================================================
// A tiny, legless flight sprite — it never touches the ground, so no leg
// parts at all (groundPlant still finds the wingtips/body as the lowest
// point and plants correctly). Dusty, muted colors sell "dust-moth"; the
// one warm touch is the glowing antenna tips, each carrying a literal tiny
// mote, echoing the "drawn to light" personality.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_motling(kit = kitDefault) {
  const pal = kit.palette(['gale']);
  const fuzz = kit.mat(0x8a8a94, { rough: 0.85 });                       // dusty grey-lavender
  const wingMat = kit.mat(0x9a94a8, { rough: 0.5, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const glowMat = kit.mat(0xffe9b0, { unlit: true, transparent: true, opacity: 0.9 });

  const root = new THREE.Group();

  // Two-tone dust-fuzz: a warm-lavender under-tuft beneath the grey puffs so
  // the mothy fluff has depth instead of one flat grey.
  const body = kit.fluffTuft(0.06, fuzz, { count: 6, seed: 80 });
  const underFuzz = kit.fluffTuft(0.045, kit.mat(0xa89ab0, { rough: 0.85 }), { count: 4, seed: 81 });
  underFuzz.position.y = -0.02;
  body.add(underFuzz);
  root.add(body);
  body.position.y = 0.09;

  const head = kit.at(body, kit.orb(0.034, fuzz, { sy: 0.9 }), 0, 0.035, 0.04);
  kit.paint(head, { from: 0x7a7684, to: 0xb0aab8, noise: 0.05, seed: 82 });
  const eyeL = kit.at(head, kit.eye(0.016, { irisColor: 0x14100c, skinColor: 0x8a8a94, glintSize: 0.007 }), 0.022, 0.005, 0.026, { ry: 0.25 });
  const eyeR = kit.at(head, kit.eye(0.016, { irisColor: 0x14100c, skinColor: 0x8a8a94, glintSize: 0.007 }), -0.022, 0.005, 0.026, { ry: -0.25 });

  // Mote-glow antennae: thin curved horns, each tipped with a tiny warm
  // light — "drawn to light" made literal.
  const antL = kit.at(head, kit.horn(0.05, fuzz, { bend: 0.6, baseR: 0.004, tipR: 0.002 }), 0.014, 0.035, -0.005, { rz: 0.25 });
  const antR = kit.at(head, kit.horn(0.05, fuzz, { bend: 0.6, baseR: 0.004, tipR: 0.002 }), -0.014, 0.035, -0.005, { rz: -0.25 });
  kit.at(antL, kit.orb(0.008, glowMat.clone()), 0.018, 0.048, 0);
  kit.at(antR, kit.orb(0.008, glowMat.clone()), -0.018, 0.048, 0);

  // Two soft, dusty moth wings — no legs, this sprite never lands.
  const wingDefs = [[0.03, 0.02, 0, 1], [-0.03, 0.02, 0, -1]];
  const wingParts = wingDefs.map(([x, y, z, side]) => {
    const w = kit.wing(0.12, wingMat, { style: 'membrane', bones: 2, width: 0.13, droop: 0.05 });
    kit.at(body, w, x, y, z, { ry: 0.2 });
    w.group.scale.x = side;
    return w;
  });

  // A wisp of drifting dust and a soft halo of light it's drawn toward.
  const dust = kit.mote(5, { color: 0xb8b0c0, size: 0.008, radius: 0.05, height: 0.03, speed: 0.5, seed: 81 });
  kit.at(body, dust, 0, 0, -0.02);

  const spark = kit.heartspark(0.016, pal.eye, { seed: 82 });
  kit.at(body, spark, 0, 0, 0.03);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      wings: wingParts.map((w) => w.bones),
      accents: [antL, antR],
      fx: [dust, spark],
    },
    hints: {
      personality: 'eager',
      locomotion: 'fly',
      hover: true,
      hoverAmp: 0.03,
      breathAmp: 1.0,
      blinkEvery: 2.4,
    },
  };
}
