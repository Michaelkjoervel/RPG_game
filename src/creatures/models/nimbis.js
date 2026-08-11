// =============================================================================
// NIMBIS — Gale, stage 1, common.
// "Kitten-sized cloud ray, drizzles when sad. Moody weather." (Design Bible §4)
// =============================================================================
// A flattened, soft-edged manta silhouette — a wide squashed blob for the
// body-as-wings (rather than kit.wing() panels, since a cloud ray's "wings"
// are one continuous soft form, not jointed membrane) with two small
// kit.wing() flap-tips at the trailing edges so the animator still has
// something to flap. A little drizzle of falling droplet motes under its
// belly is a constant, gentle reminder of its "moody weather" trait.
//
// PROPORTION NOTE: registry.js rescales the whole model uniformly by
// (SPECIES.nimbis.size / measured bbox HEIGHT) — a manta-ray silhouette is
// naturally much wider than it is tall, so body squash and wing span are
// both kept modest here (raw width:height well under 3:1) rather than
// authored at "realistic ray" proportions, which would balloon a
// kitten-sized creature into something absurdly wide once rescaled.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_nimbis(kit = kitDefault) {
  const pal = kit.palette(['gale']);
  const skin = kit.mat(0xdce8ea, { rough: 0.4, transparent: true, opacity: 0.92 });
  const skinDark = kit.mat(0xb8c8ce, { rough: 0.45 });

  const root = new THREE.Group();

  const body = kit.blob(0.13, skin, { seed: 100, noise: 0.12, squash: { x: 1.2, y: 0.62, z: 1.2 } });
  root.add(body);
  body.position.y = 0.16;

  kit.at(body, kit.orb(0.03, skinDark), 0, 0.03, -0.08, { sy: 0.4 });

  const eyeL = kit.at(body, kit.eye(0.03, { irisColor: 0x4a5a6a, skinColor: 0xdce8ea, glintSize: 0.012 }), 0.05, 0.02, 0.15, { ry: 0.35 });
  const eyeR = kit.at(body, kit.eye(0.03, { irisColor: 0x4a5a6a, skinColor: 0xdce8ea, glintSize: 0.012 }), -0.05, 0.02, 0.15, { ry: -0.35 });

  // A small mouth-frown-cheek pucker for the "moody" personality.
  kit.at(body, kit.orb(0.014, skinDark, { sy: 0.5 }), 0, -0.03, 0.18);

  // Wing-tip flaps at the trailing edges of the flattened body-wing.
  const wingR = kit.wing(0.08, skin, { style: 'membrane', bones: 2, width: 0.07, droop: 0.2 });
  kit.at(body, wingR, 0.1, 0.01, -0.02, { rx: -0.1, ry: -0.3 });
  const wingL = kit.wing(0.08, skin, { style: 'membrane', bones: 2, width: 0.07, droop: 0.2 });
  kit.at(body, wingL, -0.1, 0.01, -0.02, { rx: -0.1, ry: 0.3, sx: -1 });

  const tail = kit.at(body, kit.tailChain(3, skin, { segLen: 0.045, startR: 0.016, endR: 0.006 }), 0, -0.01, -0.14);

  // A quiet drizzle beneath its belly — falls when sad, which is often.
  const drizzle = kit.mote(6, { color: 0xbcd6ea, size: 0.012, radius: 0.1, height: 0.22, speed: 0.5, seed: 101 });
  kit.at(body, drizzle, 0, -0.14, 0);

  const spark = kit.heartspark(0.026, pal.eye, { seed: 102 });
  kit.at(body, spark, 0, 0.01, 0.05);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      wings: [wingR.bones, wingL.bones],
      fx: [drizzle, spark],
    },
    hints: {
      personality: 'skittish',
      locomotion: 'fly',
      breathAmp: 1.0,
      blinkEvery: 2.8,
    },
  };
}
