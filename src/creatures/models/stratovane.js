// =============================================================================
// STRATOVANE — Gale/Volt, stage 2 (Nimbis awakens at L26), rare.
// "Manta of storm-cloud, lightning veins, thunder on wingbeat." (Design
// Bible §4)
// =============================================================================
// Nimbis grown into a genuine storm-front: the body is layered dark blobs
// (several overlapping kit.blob() puffs, not one smooth shape) so it reads
// as cloud-stuff rather than skin, with true kit.wing() manta wings sweeping
// wide. Lightning veins are thin jagged emissive strips — a zigzag chain of
// short boxes, same "crack seam" trick kit.hollowify() uses for its
// shardlight cracks, borrowed here as an intentional signature feature
// rather than a damage state — that flash bright on a burst-driven pulse
// timed to a slow inner thunder rhythm.
//
// PROPORTION NOTE: registry.js rescales the whole model uniformly by
// (SPECIES.stratovane.size / measured bbox HEIGHT). A manta silhouette is
// naturally wide, so both the body squash and wing span are kept
// deliberately modest (raw width:height held under ~3:1) — an early,
// wider-flying draft of this model measured over 11:1 and rescaled into an
// absurd ~23m wingspan at this species' size, which is exactly the trap
// this note exists to flag for the other four long/horizontal species too.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { seededRandom } from '../../core/rng.js';

function lightningVein(kit, len, segCount, seed) {
  const group = new THREE.Group(); group.name = 'lightningVein';
  const rng = seededRandom(seed);
  const m = kit.mat(0xffe94f, { unlit: true, transparent: true, opacity: 0 });
  const segs = [];
  let x = 0, y = 0;
  for (let i = 0; i < segCount; i++) {
    const segLen = len / segCount;
    const dx = (rng() - 0.5) * segLen * 1.4;
    const s = kit.box(0.006, segLen, 0.004, m);
    s.position.set(x + dx * 0.5, y - segLen * 0.5, 0.002);
    s.rotation.z = Math.atan2(dx, -segLen) * 0.6;
    group.add(s);
    segs.push(s);
    x += dx; y -= segLen;
  }
  return { group, mat: m, segs };
}

export function build_stratovane(kit = kitDefault) {
  const pal = kit.palette(['gale', 'volt']);
  const cloud = kit.mat(0x4a4e5c, { rough: 0.55 });
  const cloudLight = kit.mat(0x6a6e7c, { rough: 0.5 });
  const wingMat = kit.mat(0x3a3e4c, { rough: 0.5, side: THREE.DoubleSide });

  const root = new THREE.Group();

  // Layered storm-cloud body: several overlapping puffs, not one smooth blob.
  const body = kit.blob(0.22, cloud, { seed: 110, noise: 0.2, squash: { x: 1.2, y: 0.62, z: 1.2 } });
  root.add(body);
  body.position.y = 0.42;
  const puffSpots = [[0.1, 0.04, 0.05, 0.1], [-0.1, 0.04, 0.05, 0.1], [0, 0.08, -0.08, 0.12], [0.14, -0.02, -0.01, 0.07], [-0.14, -0.02, -0.01, 0.07]];
  const puffs = puffSpots.map(([x, y, z, r]) => kit.at(body, kit.blob(r, cloudLight, { seed: 111 + x * 10, noise: 0.25, squash: { x: 1.1, y: 0.6, z: 1 } }), x, y, z));

  const eyeL = kit.at(body, kit.eye(0.04, { irisColor: 0xffe94f, scleraColor: 0x1c1e26, skinColor: 0x4a4e5c, glintSize: 0.015 }), 0.06, 0.02, 0.16, { ry: 0.3 });
  const eyeR = kit.at(body, kit.eye(0.04, { irisColor: 0xffe94f, scleraColor: 0x1c1e26, skinColor: 0x4a4e5c, glintSize: 0.015 }), -0.06, 0.02, 0.16, { ry: -0.3 });

  // Manta wings — swept wide but kept in proportion (see PROPORTION NOTE above).
  const wingR = kit.wing(0.19, wingMat, { style: 'membrane', bones: 3, width: 0.14, droop: 0.1 });
  kit.at(body, wingR, 0.11, 0.02, -0.02, { rx: -0.08, ry: -0.12 });
  const wingL = kit.wing(0.19, wingMat, { style: 'membrane', bones: 3, width: 0.14, droop: 0.1 });
  kit.at(body, wingL, -0.11, 0.02, -0.02, { rx: -0.08, ry: 0.12, sx: -1 });

  // Lightning veins across each wing — jagged emissive strips.
  const veinR1 = lightningVein(kit, 0.15, 5, 200);
  kit.at(wingR.bones[1], veinR1, 0.015, 0.04, 0.01, { ry: 1.2 });
  const veinR2 = lightningVein(kit, 0.11, 4, 201);
  kit.at(wingR.bones[2], veinR2, 0.01, 0.025, 0.01, { ry: 1.2 });
  const veinL1 = lightningVein(kit, 0.15, 5, 202);
  kit.at(wingL.bones[1], veinL1, -0.015, 0.04, 0.01, { ry: -1.2, sx: -1 });
  const veinL2 = lightningVein(kit, 0.11, 4, 203);
  kit.at(wingL.bones[2], veinL2, -0.01, 0.025, 0.01, { ry: -1.2, sx: -1 });
  const veins = [veinR1, veinR2, veinL1, veinL2];

  const tail = kit.at(body, kit.tailChain(4, cloud, { segLen: 0.06, startR: 0.045, endR: 0.012 }), 0, -0.02, -0.16);

  // Thunder-on-wingbeat: a slow pulse that flashes every vein bright, timed
  // roughly to a heavy wingbeat, then fades — visible thunder.
  let thunderT = 0;
  const thunder = {
    update(dt) {
      thunderT += dt;
      const period = 2.4;
      const local = thunderT % period;
      const flash = local < 0.12 ? 1 - local / 0.12 : 0;
      for (const v of veins) v.mat.opacity = 0.15 + flash * 0.85;
    },
  };

  const embers = kit.mote(10, { color: 0xffe94f, size: 0.02, radius: 0.5, height: 0.2, speed: 0.3, seed: 112 });
  kit.at(body, embers, 0, 0.06, -0.1);

  const spark = kit.heartspark(0.045, pal.eye, { seed: 113 });
  kit.at(body, spark, 0, 0.02, 0.1);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      wings: [wingR.bones, wingL.bones],
      accents: puffs,
      fx: [thunder, embers, spark],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'fly',
      breathAmp: 0.9,
      blinkEvery: 4.0,
    },
  };
}
