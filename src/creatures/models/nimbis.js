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
import { applyVertexGradient, jitterGeometry, lobedMass } from '../../gfx/materials.js';

export function build_nimbis(kit = kitDefault) {
  const pal = kit.palette(['gale']);
  // A kitten-sized cumulus: rain-gray flat bottom rising to sunlit white
  // crowns, with extra cloud lobes piled on so it reads as WEATHER.
  const skin = kit.mat(0xffffff, { vertexColors: true, rough: 0.5 });
  const skinDark = kit.mat(0x9fb2bc, { rough: 0.45 });

  const root = new THREE.Group();

  const body = kit.blob(0.13, skin, { seed: 100, noise: 0.12, squash: { x: 1.2, y: 0.62, z: 1.2 } });
  jitterGeometry(body.geometry, 0.008, 100);
  applyVertexGradient(body.geometry, { from: 0x93a6b4, to: 0xf6fafc, noise: 0.04, seed: 100 });
  root.add(body);
  body.position.y = 0.17;

  // Cloud lobes piled on the back — a pocket cumulus stack.
  const puffs = lobedMass({ lobes: 4, radius: 0.075, spread: 0.8, squash: 0.85, from: 0xa2b2c0, to: 0xfbfdff, seed: 101, jitter: 0.16 });
  kit.at(body, puffs, -0.01, 0.07, -0.04);

  const eyeL = kit.at(body, kit.eye(0.032, { irisColor: 0x4a5a6a, skinColor: 0xd2dee2, glintSize: 0.015 }), 0.05, 0.02, 0.15, { ry: 0.35 });
  const eyeR = kit.at(body, kit.eye(0.032, { irisColor: 0x4a5a6a, skinColor: 0xd2dee2, glintSize: 0.015 }), -0.05, 0.02, 0.15, { ry: -0.35 });

  // The moody face: worried angled brows + a tiny wobble-frown.
  kit.at(body, kit.brow(0.035, skinDark), 0.05, 0.055, 0.145, { rz: 0.4 });
  kit.at(body, kit.brow(0.035, skinDark), -0.05, 0.055, 0.145, { rz: -0.4 });
  kit.at(body, kit.orb(0.015, skinDark, { sy: 0.5 }), 0, -0.03, 0.18);

  // Wing-tip flaps at the trailing edges of the flattened body-wing.
  const paintWing = (w) => w.group.traverse((n) => {
    if (n.isMesh && n.geometry) applyVertexGradient(n.geometry, { from: 0xaebeca, to: 0xf0f6f8, axis: 'x', noise: 0.03, seed: 103 });
  });
  const wingR = kit.wing(0.1, skin, { style: 'membrane', bones: 2, width: 0.08, droop: 0.2 });
  paintWing(wingR);
  kit.at(body, wingR, 0.1, 0.02, -0.02, { rx: -0.1, ry: -0.3, rz: 0.2 });
  const wingL = kit.wing(0.1, skin, { style: 'membrane', bones: 2, width: 0.08, droop: 0.2 });
  paintWing(wingL);
  kit.at(body, wingL, -0.1, 0.02, -0.02, { rx: -0.1, ry: 0.3, rz: -0.2, sx: -1 });

  const tail = kit.at(body, kit.tailChain(3, skin, { segLen: 0.045, startR: 0.016, endR: 0.006 }), 0, -0.01, -0.14);
  tail.pivots.forEach((p, i) => {
    for (const c of p.children) if (c.isMesh && c.geometry && c.geometry.attributes) {
      applyVertexGradient(c.geometry, { from: 0xa2b2c0, to: 0xeef4f6, noise: 0.03, seed: 104 + i });
    }
  });

  // A quiet drizzle beneath its belly — falls when sad, which is often —
  // and one fat teardrop welling at the eye.
  const drizzle = kit.mote(8, { color: 0x9fc4e8, size: 0.014, radius: 0.11, height: 0.24, speed: 0.55, seed: 101 });
  kit.at(body, drizzle, 0, -0.15, 0);
  const tearDrop = kit.teardrop(kit.mat(0xbfe0f8, { unlit: true, transparent: true, opacity: 0.85 }), { height: 0.028, width: 0.011, segments: 6 });
  kit.at(body, tearDrop, 0.062, -0.02, 0.15, { rx: Math.PI });

  const spark = kit.heartspark(0.024, pal.eye, { seed: 102 });
  kit.at(body, spark, 0, -0.045, 0.13);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      wings: [wingR.bones, wingL.bones],
      accents: [puffs],
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
