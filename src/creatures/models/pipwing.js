// =============================================================================
// PIPWING — Gale, stage 1 wild (Dawnmeadow & Brighthollow outskirts).
// "Plump round songbird, feather-cowlick. Chirps constantly."
// (Design Bible §4)
// =============================================================================
// A small, cheerful, ball-shaped songbird. The whole silhouette is built
// from soft round volumes (a very squashed blob for the body) to read
// "plump" at a glance, and the single upright "feather-cowlick" plume gives
// it a chatty, alert personality without any extra geometry complexity.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_pipwing(kit = kitDefault) {
  const pal = kit.palette(['gale']);
  const skin = kit.mat(0xdce9c8, { rough: 0.6 });          // pale meadow-cream plumage
  const wingMat = kit.mat(0xa8c48a, { rough: 0.55, side: THREE.DoubleSide });
  const beakMat = kit.mat(0xffa94d, { rough: 0.35 });
  const cowlickMat = kit.mat(pal.accent, { rough: 0.4 });

  const root = new THREE.Group();

  // Plump, round body — a barely-squashed sphere is exactly "round songbird".
  const body = kit.blob(0.13, skin, { seed: 70, noise: 0.06, squash: { x: 1.05, y: 1, z: 1.05 } });
  root.add(body);
  body.position.y = 0.15;

  const head = kit.at(body, kit.orb(0.088, skin, { sy: 1.02 }), 0, 0.1, 0.05);
  const eyeL = kit.at(head, kit.eye(0.033, { irisColor: 0x2a2016, skinColor: 0xdce9c8, glintSize: 0.013 }), 0.055, 0.01, 0.065, { ry: 0.4 });
  const eyeR = kit.at(head, kit.eye(0.033, { irisColor: 0x2a2016, skinColor: 0xdce9c8, glintSize: 0.013 }), -0.055, 0.01, 0.065, { ry: -0.4 });

  const beak = kit.at(head, kit.cone(0.024, 0.045, beakMat, { segments: 6 }), 0, -0.01, 0.08, { rx: Math.PI / 2 });

  // The feather-cowlick — a single upright plume on the crown, the bible's
  // one explicit character detail.
  const cowlick = kit.at(head, kit.leafBlade(0.06, cowlickMat, { width: 0.018 }), 0, 0.075, -0.01, { rx: -1.15, rz: 0.35 });

  // Small stub wings, feathered. Wing() spans local +X by default (away
  // from the body on the right shoulder); the left wing mirrors via
  // `scale.x = -1` per kit.wing()'s documented convention.
  const wingDefs = [[0.1, 0.02, -0.02, 1], [-0.1, 0.02, -0.02, -1]];
  const wingParts = wingDefs.map(([x, y, z, side]) => {
    const w = kit.wing(0.1, wingMat, { style: 'feathered', bones: 2, width: 0.08 });
    kit.at(body, w, x, y, z, { ry: 0.15 });
    w.group.scale.x = side;
    return w;
  });

  // Tiny perching legs.
  const legDefs = [[0.045, 0.02, 0], [-0.045, 0.02, 0]];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.075, beakMat, { thighR: 0.016, shinR: 0.012, footLen: 0.032 }), x, y, z));

  // Stub tail — a small feathered fan.
  const tail = kit.at(body, kit.fin(0.08, wingMat), 0, 0.03, -0.13, { ry: Math.PI / 2, rx: 0.3 });

  const spark = kit.heartspark(0.03, pal.eye, { seed: 71 });
  kit.at(body, spark, 0, 0.02, 0.1);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      wings: wingParts.map((w) => w.bones),
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [cowlick, beak, tail],
      fx: [spark],
    },
    hints: {
      personality: 'eager',
      locomotion: 'fly',
      breathAmp: 1.2,
      blinkEvery: 1.8,
    },
  };
}
