// =============================================================================
// REVERBANE — Gale/Umbra, stage 2 (Sonark awakens at L23).
// "Sleek sound-wraith bat, wings ripple with visible echo-rings." (Design Bible §4)
// =============================================================================
// Sonark grown lean and predatory: smaller ears (it doesn't need to gossip
// anymore, it hunts by sound alone), a longer sleeker body, and its
// signature feature — concentric echo-ring bands rippling out across each
// wing membrane. Rather than a shader, the rings are a handful of thin
// torus strips per wing, faded and pulsed outward on a loop via a small
// self-driving fx object (same `{ group, update(dt) }` shape as kit.js's
// own flame/mote helpers, just bespoke to this species).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

function echoRings(kit, wingBone, count, seed) {
  const group = new THREE.Group(); group.name = 'echoRings';
  wingBone.add(group);
  const rings = [];
  const rngPhase = (seed * 0.618) % 1;
  for (let i = 0; i < count; i++) {
    const m = kit.mat(0xcfe0ff, { unlit: true, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.02, 16), m);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0.03 + i * 0.025, 0, 0);
    group.add(ring);
    rings.push(ring);
  }
  let t = rngPhase * 3;
  function update(dt) {
    t += dt;
    const period = 1.6;
    for (let i = 0; i < rings.length; i++) {
      const local = ((t - i * 0.18) % period + period) % period;
      const p = local / period;
      const s = 0.3 + p * 2.4;
      rings[i].scale.setScalar(s);
      rings[i].material.opacity = Math.max(0, 0.55 * (1 - p) * (1 - p));
    }
  }
  return { group, update };
}

export function build_reverbane(kit = kitDefault) {
  const pal = kit.palette(['gale', 'umbra']);
  // Umbra-family fur, lifted out of near-black to the same readable dark
  // violet-slate the rest of the shadow set uses (kit.palette's umbra note,
  // Design Bible §8): ~10% relative luminance plus a faint self-glow, so the
  // wraith still reads as a shape in daylight instead of a hole in the frame.
  const furHex = 0x5a5278;
  const fur = kit.mat(furHex, { rough: 0.4, metal: 0.08, emissive: 0x282242, emissiveIntensity: 0.45 });
  const membrane = kit.mat(0x7a6fa8, { rough: 0.22, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
  const earInner = kit.mat(0x9a8fc4, { rough: 0.35, transparent: true, opacity: 0.85 });

  const root = new THREE.Group();

  // Sleek torso lying nose-to-tail along Z: bake the capsule's axis swing about
  // X (about Z would put the long axis on X — broadside to the view).
  const body = kit.capsule(0.075, 0.16, fur, { capSeg: 4, radSeg: 8 });
  body.geometry.rotateX(Math.PI / 2);
  root.add(body);
  body.position.y = 0.16;

  const head = kit.at(body, kit.blob(0.062, fur, { seed: 53, squash: { x: 0.95, y: 0.9, z: 1.15 } }), 0, 0.05, 0.16);
  const eyeL = kit.at(head, kit.eye(0.02, { irisColor: 0xd8cfff, scleraColor: 0x18121e, skinColor: furHex, glintSize: 0.009 }), 0.038, 0.005, 0.05, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.02, { irisColor: 0xd8cfff, scleraColor: 0x18121e, skinColor: furHex, glintSize: 0.009 }), -0.038, 0.005, 0.05, { ry: -0.35 });

  const earL = kit.at(head, kit.petal(0.1, fur, { width: 0.06 }), 0.04, 0.06, -0.02, { rx: -0.25, ry: -0.3, rz: 0.4 });
  kit.at(earL, kit.petal(0.07, earInner, { width: 0.042 }), 0, 0.008, 0.01);
  const earR = kit.at(head, kit.petal(0.1, fur, { width: 0.06 }), -0.04, 0.06, -0.02, { rx: -0.25, ry: 0.3, rz: -0.4 });
  kit.at(earR, kit.petal(0.07, earInner, { width: 0.042 }), 0, 0.008, 0.01);

  const wingR = kit.wing(0.2, membrane, { style: 'membrane', bones: 3, width: 0.14, droop: 0.14 });
  kit.at(body, wingR, 0.07, 0.03, 0, { rx: -0.1, ry: -0.16 });
  const wingL = kit.wing(0.2, membrane, { style: 'membrane', bones: 3, width: 0.14, droop: 0.14 });
  kit.at(body, wingL, -0.07, 0.03, 0, { rx: -0.1, ry: 0.16, sx: -1 });

  // Echo-rings, anchored to each wing's mid-bone, rippling outward toward the tip.
  const ringsR = echoRings(kit, wingR.bones[1], 3, 1);
  const ringsL = echoRings(kit, wingL.bones[1], 3, 2);

  const tail = kit.at(body, kit.tailChain(3, fur, { segLen: 0.045, startR: 0.026, endR: 0.01 }), 0, 0, -0.14);

  const spark = kit.heartspark(0.028, pal.eye, { seed: 54 });
  kit.at(body, spark, 0, -0.01, 0.04);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      wings: [wingR.bones, wingL.bones],
      accents: [earL, earR],
      fx: [ringsR, ringsL, spark],
    },
    hints: {
      personality: 'calm',
      locomotion: 'fly',
      breathAmp: 0.9,
      blinkEvery: 3.4,
    },
  };
}
