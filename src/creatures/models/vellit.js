// =============================================================================
// VELLIT — Neutral, stage 1 wild (Dawnmeadow & Brighthollow outskirts).
// "Tuft-tailed meadow hopper (rabbit-deer mix), oversized ears. Skittish."
// (Design Bible §4)
// =============================================================================
// A rabbit-deer hybrid silhouette: a slender deer-like face carries two tiny
// fawn nub-horns, but the READ is rabbit — comically oversized upright ears
// (the bible's one explicit callout) dominate, and the hind legs are built
// longer and heavier than the front pair for a springy hop gait rather than
// a quad trot. hints.locomotion is forced to 'hop' so the animator plays its
// bouncy hop cycle instead of inferring 'quad' from the leg count.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_vellit(kit = kitDefault) {
  const pal = kit.palette(['neutral']);
  const skin = kit.mat(0xcdb28a, { rough: 0.75 });   // warm sandy-tan fur
  const cream = kit.mat(0xf1e6d2, { rough: 0.7 });   // cream belly/muzzle
  const darkTip = kit.mat(0x4a3f34, { rough: 0.6 }); // dark ear/tail tips

  const root = new THREE.Group();

  const body = kit.blob(0.14, skin, { seed: 60, noise: 0.1, squash: { x: 0.95, y: 0.92, z: 1.2 } });
  kit.paint(body, { from: 0xa2865e, to: 0xe2d0aa, noise: 0.05, seed: 60 });
  root.add(body);
  body.position.y = 0.22;

  // Cream belly patch.
  kit.at(body, kit.orb(0.075, cream, { sy: 0.65, sx: 0.8 }), 0, -0.05, 0.09);

  const head = kit.at(body, kit.orb(0.09, skin, { sz: 1.08, sy: 0.92 }), 0, 0.09, 0.16);
  kit.paint(head, { from: 0xb89a70, to: 0xe0cda6, noise: 0.04, seed: 61 });
  const eyeL = kit.at(head, kit.eye(0.043, { irisColor: 0x2a2016, skinColor: 0xcdb28a, glintSize: 0.016 }), 0.065, 0.017, 0.076, { ry: 0.25 });
  const eyeR = kit.at(head, kit.eye(0.043, { irisColor: 0x2a2016, skinColor: 0xcdb28a, glintSize: 0.016 }), -0.065, 0.017, 0.076, { ry: -0.25 });
  // Tiny cream muzzle-dot nose, tucked low so it can't be mistaken for a
  // third eye at distance.
  kit.at(head, kit.orb(0.022, cream.clone(), { sz: 0.75, sy: 0.8 }), 0, -0.042, 0.086);
  kit.at(head, kit.orb(0.01, darkTip.clone()), 0, -0.028, 0.1);

  // Tiny fawn-nub horns — the "-deer" half of the mix, kept small so the
  // ears stay the dominant silhouette read.
  const hornL = kit.at(head, kit.horn(0.035, skin, { bend: 0.2, baseR: 0.009 }), 0.035, 0.09, 0, { rz: 0.15 });
  const hornR = kit.at(head, kit.horn(0.035, skin, { bend: 0.2, baseR: 0.009 }), -0.035, 0.09, 0, { rz: -0.15 });

  // Oversized ears — the bible's explicit callout: tall, upright, dark-
  // tipped, roughly twice the head's own diameter. One ear pricked bolt
  // upright, the other kinked half-out: a skittish hopper mid-listen.
  const earInner = kit.mat(0xe9c9b8, { rough: 0.6 });
  const earL = kit.at(head, kit.ear(0.16, skin), 0.045, 0.08, -0.02, { rz: 0.1 });
  const earR = kit.at(head, kit.ear(0.17, skin), -0.045, 0.075, -0.02, { rz: -0.42, rx: -0.12 });
  kit.at(earL, kit.ear(0.115, earInner), 0, 0.02, 0.012, { sx: 0.55 });
  kit.at(earR, kit.ear(0.12, earInner.clone()), 0, 0.02, 0.012, { sx: 0.55 });
  kit.at(earL, kit.orb(0.028, darkTip, { sy: 0.5 }), 0, 0.15, 0.006);
  kit.at(earR, kit.orb(0.028, darkTip, { sy: 0.5 }), 0, 0.16, 0.006);

  // Hind legs longer and heavier than the front pair — the silhouette of a
  // hopper, not a runner.
  const frontDefs = [[0.08, 0.09, 0.11], [-0.08, 0.09, 0.11]];
  const hindDefs = [[0.09, 0.11, -0.09], [-0.09, 0.11, -0.09]];
  const frontLegs = frontDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.14, skin, { thighR: 0.032, shinR: 0.024, footLen: 0.05 }), x, y, z));
  const hindLegs = hindDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.19, skin, { thighR: 0.045, shinR: 0.03, footLen: 0.07 }), x, y, z, { rx: 0.15 }));

  // Tuft tail — a single soft dark-tipped puff.
  const tail = kit.at(body, kit.fluffTuft(0.055, skin, { count: 5, seed: 61 }), 0, 0.06, -0.16);
  kit.at(tail, kit.orb(0.02, darkTip), 0, 0, -0.03);

  const spark = kit.heartspark(0.03, pal.eye, { seed: 62 });
  kit.at(body, spark, 0, 0.03, 0.13);

  root.add(kit.shadowDisc(0.2, 0.36));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      legs: [...frontLegs, ...hindLegs].map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, hornL, hornR, tail],
      fx: [spark],
    },
    hints: {
      personality: 'skittish',
      locomotion: 'hop',
      breathAmp: 1.1,
      blinkEvery: 2.0,
    },
  };
}
