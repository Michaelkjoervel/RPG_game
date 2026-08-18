// =============================================================================
// AURELARK — Gale, stage 2 (Pipwing awakens at L15).
// "Elegant lark with dawn-gradient plumage, trailing pennant feathers. Vain
// soloist." (Design Bible §4)
// =============================================================================
// Pipwing's plump roundness stretches into an elegant, streamlined form.
// "Dawn-gradient plumage" is played literally across distinct body zones
// (warm gold crown -> peach chest -> dusk-purple back/tail) since the kit
// has no per-vertex gradient shader — a clean zone-based palette reads just
// as well at this scale. The "trailing pennant feathers" are long thin
// leafBlade streamers off the tail, each its own accent so they ripple
// independently — the vain soloist's showpiece.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_aurelark(kit = kitDefault) {
  const pal = kit.palette(['gale']);
  const gold = kit.mat(0xffcf7a, { rough: 0.4 });     // dawn-gold crown/head
  const peach = kit.mat(0xffb0a0, { rough: 0.45 });   // peach chest
  const dusk = kit.mat(0x7a5a8a, { rough: 0.45 });    // dusk-purple back/tail
  const pennantMat = kit.mat(0xd8a4d8, { rough: 0.3, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const beakMat = kit.mat(0xff9a3c, { rough: 0.3 });

  const root = new THREE.Group();

  // Streamlined torso — a stretched capsule, not a round blob. A bird's body
  // runs beak-to-tail along Z, so the capsule's axis swing is baked about X;
  // about Z would put the long axis on X, i.e. wingtip-to-wingtip.
  const body = kit.capsule(0.085, 0.26, dusk, { capSeg: 4, radSeg: 9 });
  body.geometry.rotateX(Math.PI / 2);
  // THE dawn gradient, literal: dusk-purple tail sweeping through rose into
  // warm gold at the head — one continuous ramp along the body axis instead
  // of the old hard color zones.
  kit.paint(body, { from: 0x5d4680, to: 0xffc98a, axis: 'z', noise: 0.04, seed: 72, exp: 1.25 });
  root.add(body);
  body.position.y = 0.28;

  // Peach chest patch — the gradient's midtone, along the same axis.
  const chest = kit.capsule(0.055, 0.16, peach, { capSeg: 3, radSeg: 7 });
  chest.geometry.rotateX(Math.PI / 2);
  chest.scale.set(0.7, 0.65, 1);
  kit.paint(chest, { from: 0xc98aa8, to: 0xffc4a4, axis: 'z', noise: 0.04, seed: 73 });
  kit.at(body, chest, 0, -0.05, 0.05); // flush with the belly, not buried in it

  const head = kit.at(body, kit.orb(0.06, gold, { sz: 1.15 }), 0, 0.06, 0.23);
  kit.paint(head, { from: 0xffb87a, to: 0xffe2a8, noise: 0.03, seed: 74 });
  const eyeL = kit.at(head, kit.eye(0.029, { irisColor: 0x241810, skinColor: 0xffcf7a, glintSize: 0.011 }), 0.045, 0.01, 0.052, { ry: 0.28 });
  const eyeR = kit.at(head, kit.eye(0.029, { irisColor: 0x241810, skinColor: 0xffcf7a, glintSize: 0.011 }), -0.045, 0.01, 0.052, { ry: -0.28 });
  const beak = kit.at(head, kit.cone(0.018, 0.04, beakMat, { segments: 6 }), 0, -0.008, 0.065, { rx: Math.PI / 2 });

  // The crest: a swept-back golden three-plume fan — vanity given shape.
  const crest = kit.at(head, kit.furFan(3, 0.075, kit.mat(0xffcf7a, { rough: 0.4, side: THREE.DoubleSide }), { width: 0.018, spread: 0.55, curl: 0.5, seed: 75 }), 0, 0.052, -0.015, { rx: -0.55 });

  // Elegant feathered wings, larger and more refined than Pipwing's stubs.
  const wingDefs = [[0.075, 0.05, -0.01, 1], [-0.075, 0.05, -0.01, -1]];
  const wingParts = wingDefs.map(([x, y, z, side]) => {
    const w = kit.wing(0.16, dusk, { style: 'feathered', bones: 3, width: 0.12 });
    kit.at(body, w, x, y, z, { ry: 0.1 });
    w.group.scale.x = side;
    return w;
  });

  // Tiny elegant legs, hung just under the belly (local Y is measured from the
  // torso's centre) so they show below the plumage instead of inside it.
  const legDefs = [[0.03, -0.075, 0.02], [-0.03, -0.075, 0.02]];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.06, beakMat, { thighR: 0.012, shinR: 0.009, footLen: 0.024 }), x, y, z));

  // Trailing pennant feathers — three long thin streamers off the tail,
  // each its own accent for independent ripple. The showpiece.
  const pennantDefs = [[0, 0, -0.22, 0], [0.025, 0.01, -0.22, 0.18], [-0.025, 0.01, -0.22, -0.18]];
  const pennants = pennantDefs.map(([x, y, z, rz]) => kit.at(body, kit.leafBlade(0.24, pennantMat, { width: 0.012 }), x, y, z, { ry: Math.PI, rz }));

  // Comet-scatter of warm dawn motes trailing behind — a vain soloist
  // always seems lit from behind.
  const motes = kit.mote(6, { color: 0xffcf7a, size: 0.016, radius: 0.06, height: 0.05, speed: 0.5, seed: 72 });
  kit.at(body, motes, 0, 0.02, -0.3);

  const spark = kit.heartspark(0.025, pal.eye, { seed: 73 });
  kit.at(body, spark, 0, -0.03, 0.19);

  root.add(kit.shadowDisc(0.18, 0.32));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      wings: wingParts.map((w) => w.bones),
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [crest, beak, ...pennants],
      fx: [motes, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'fly',
      breathAmp: 0.85,
      blinkEvery: 3.2,
    },
  };
}
