// =============================================================================
// SONARK — Gale/Umbra, stage 1, common.
// "Echo-bat with radar-dish ears bigger than its body. Gossip." (Design Bible §4)
// =============================================================================
// A tiny flyer built almost entirely around one exaggerated feature: paired
// dish-shaped ears bigger than the whole head. No legs (a bat this small
// never lands to walk) — just body, wings and a stub tail, so
// `hints.locomotion:'fly'` is set explicitly and the animator's flap cycle
// does all the work. The huge ears live in `accents` so they get the
// animator's idle sway/twitch treatment — constantly swiveling, tracking
// sound, never still, which sells the "gossip" personality at a glance.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_sonark(kit = kitDefault) {
  const pal = kit.palette(['gale', 'umbra']);
  const fur = kit.mat(0x4a4459, { rough: 0.62 });
  const membrane = kit.mat(0x8a7fae, { rough: 0.3, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
  const earInner = kit.mat(0xcfe0da, { rough: 0.4, transparent: true, opacity: 0.85 });

  const root = new THREE.Group();

  const body = kit.blob(0.085, fur, { seed: 51, noise: 0.14, squash: { x: 1, y: 1.05, z: 0.92 } });
  kit.paint(body, { from: 0x38334a, to: 0x6a6284, noise: 0.06, seed: 51 });
  root.add(body);
  body.position.y = 0.1;

  const head = kit.at(body, kit.orb(0.068, fur, { sz: 1.05, sy: 0.95 }), 0, 0.1, 0.05);
  kit.paint(head, { from: 0x423c56, to: 0x6f6789, noise: 0.05, seed: 52 });
  const eyeL = kit.at(head, kit.eye(0.023, { irisColor: 0x1c1c22, skinColor: 0x4a4459, glintSize: 0.01 }), 0.038, 0.008, 0.058, { ry: 0.24 });
  const eyeR = kit.at(head, kit.eye(0.023, { irisColor: 0x1c1c22, skinColor: 0x4a4459, glintSize: 0.01 }), -0.038, 0.008, 0.058, { ry: -0.24 });

  // Small snub muzzle with two tiny fangs — the only "face" detail besides
  // the enormous ears that dominate the silhouette.
  const muzzle = kit.at(head, kit.orb(0.03, fur, { sz: 1.2, sy: 0.75 }), 0, -0.03, 0.06);
  kit.at(muzzle, kit.fang(0.018, kit.mat(0xece6da, { rough: 0.3 })), 0.014, -0.01, 0.02, { rz: 0.15 });
  kit.at(muzzle, kit.fang(0.018, kit.mat(0xece6da, { rough: 0.3 })), -0.014, -0.01, 0.02, { rz: -0.15 });

  // Radar-dish ears: BIGGER THAN THE BODY, cupped forward — the bible's one
  // explicit exaggeration. Two layered petals (fur rim + pale inner dish).
  const earL = kit.at(head, kit.petal(0.2, fur, { width: 0.14 }), 0.05, 0.07, -0.01, { rx: -0.3, ry: -0.35, rz: 0.55 });
  kit.at(earL, kit.petal(0.15, earInner, { width: 0.1 }), 0.005, 0.01, 0.012, { s: 1 });
  const earR = kit.at(head, kit.petal(0.2, fur, { width: 0.14 }), -0.05, 0.07, -0.01, { rx: -0.3, ry: 0.35, rz: -0.55 });
  kit.at(earR, kit.petal(0.15, earInner.clone(), { width: 0.1 }), 0.005, 0.01, 0.012, { s: 1 });

  // Wings: membrane style, spanwise +X by default — mirror the left one.
  const wingR = kit.wing(0.24, membrane, { style: 'membrane', bones: 3, width: 0.17, droop: 0.16 });
  kit.at(body, wingR, 0.08, 0.1, -0.02, { rx: -0.12, ry: -0.18 });
  const wingL = kit.wing(0.24, membrane, { style: 'membrane', bones: 3, width: 0.17, droop: 0.16 });
  kit.at(body, wingL, -0.08, 0.1, -0.02, { rx: -0.12, ry: 0.18, sx: -1 });

  const tail = kit.at(body, kit.tailChain(2, fur, { segLen: 0.035, startR: 0.02, endR: 0.008 }), 0, 0.02, -0.09);

  const spark = kit.heartspark(0.024, pal.eye, { seed: 52 });
  kit.at(body, spark, 0, 0.03, 0.02);

  root.add(kit.shadowDisc(0.12, 0.3));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      wings: [wingR.bones, wingL.bones],
      accents: [earL, earR],
      fx: [spark],
    },
    hints: {
      personality: 'eager',
      locomotion: 'fly',
      breathAmp: 1.2,
      blinkEvery: 2.3,
    },
  };
}
