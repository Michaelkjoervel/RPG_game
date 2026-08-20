// =============================================================================
// CHARVANE — Ember, stage 2 (Kindlet awakens at L16).
// "Lean coal-furred hound, magma cracks along spine, smoke wisps when it
// huffs. Loyal, proud." (Design Bible §4)
// =============================================================================
// Design notes for later awakening-chain consistency (species that awaken
// into/from each other should rhyme visually): keeps Kindlet's warm
// charcoal palette and rounded ember-glow accents, but the body language
// flips from round/clumsy to lean/proud — longer legs, straighter spine,
// head held high. The "magma cracks along spine" are literal thin emissive
// strips (the same trick hollowify uses for Hollowed cracks, but permanent
// and warm here rather than pale and sickly).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_charvane(kit = kitDefault) {
  const pal = kit.palette(['ember']);
  // Coal fur, but READABLE coal (Design Bible §8: colors must read, and the
  // silhouette must survive daylight): a warm charcoal at ~14% relative
  // luminance rather than the near-black it used to be, so the hound reads as
  // a dark warm shape lit by its own magma seams instead of a flat blot.
  const skinHex = 0x6f625c;
  const skin = kit.mat(skinHex, { rough: 0.65, emissive: 0x2a1c14, emissiveIntensity: 0.4 });
  // Magma seams: unlit hot core plus a standard shell with a strong emissive
  // so the cracks stay bright under any lighting (the same "glow that survives
  // daylight" treatment the umbra species got in kit.palette).
  const crackGlow = kit.mat(0xffb14a, { unlit: true, transparent: true, opacity: 0.95 });
  const crackHalo = kit.mat(pal.primary, {
    rough: 0.4, emissive: 0xff5a12, emissiveIntensity: 1.6, transparent: true, opacity: 0.8,
  });

  const root = new THREE.Group();

  // Lean torso: a stretched capsule reads leaner than a blob. capsule() is
  // Y-axis aligned by default and we want it lying along Z (nose-to-tail), so
  // the bake is a rotation ABOUT X — rotating about Z would swing the capsule
  // onto the X axis and lay the hound sideways across the view. IMPORTANT:
  // bake it into the GEOMETRY (geometry.rotateX), not `body.rotation` — `body`
  // is also the attachment anchor for every other part below, and rotating
  // its *transform* would silently rotate all of their local x/y/z offsets
  // out from under them too.
  const body = kit.capsule(0.13, 0.34, skin, { capSeg: 4, radSeg: 9 });
  body.geometry.rotateX(Math.PI / 2);
  // Belly-to-back gradient: cool charcoal underside warming toward the
  // magma-lit spine — the coat reads as fur catching its own seam-glow.
  kit.paint(body, { from: 0x4a3d38, to: 0x8a7264, noise: 0.06, seed: 21 });
  root.add(body);
  body.position.y = 0.44;

  const chest = kit.at(body, kit.orb(0.15, skin, { sx: 0.95, sy: 1.05 }), 0, -0.02, 0.15);
  kit.paint(chest, { from: 0x4a3d38, to: 0x836d60, noise: 0.05, seed: 22 });

  const head = kit.at(body, kit.orb(0.11, skin, { sz: 1.15, sy: 0.92 }), 0, 0.09, 0.28);
  kit.paint(head, { from: 0x55463f, to: 0x8a7264, noise: 0.05, seed: 23 });
  // Proper tapered muzzle instead of a capsule stub.
  const snout = kit.at(head, kit.snout(0.12, skin, { r: 0.05, taper: 0.42, up: 0.1 }), 0, -0.035, 0.06);

  const eyeL = kit.at(head, kit.eye(0.042, { irisColor: 0x2a1810, skinColor: skinHex, glintSize: 0.015 }), 0.062, 0.025, 0.082, { ry: 0.22 });
  const eyeR = kit.at(head, kit.eye(0.042, { irisColor: 0x2a1810, skinColor: skinHex, glintSize: 0.015 }), -0.062, 0.025, 0.082, { ry: -0.22 });

  // Perky, alert canine ears — pride and loyalty read through an alert
  // upright posture more than any single part.
  const earL = kit.at(head, kit.ear(0.09, skin), 0.075, 0.09, -0.01, { rz: 0.2, ry: -0.15 });
  const earR = kit.at(head, kit.ear(0.09, skin), -0.075, 0.09, -0.01, { rz: -0.2, ry: 0.15 });

  // A pair of small fangs peeking from under the new muzzle — a proud hound
  // bares them subtly.
  kit.at(head, kit.fang(0.035, kit.mat(0xe8e2d8, { rough: 0.4 })), 0.028, -0.062, 0.14, { rz: -0.1 });
  kit.at(head, kit.fang(0.035, kit.mat(0xe8e2d8, { rough: 0.4 })), -0.028, -0.062, 0.14, { rz: 0.1 });

  // --- Magma cracks along the spine: thin, permanently glowing seams. ---
  // They must sit PROUD of the fur: the torso capsule's surface directly above
  // the spine is at y = +radius (0.13), and at a sideways offset dx it drops to
  // sqrt(r^2 - dx^2) — a seam placed any lower is simply buried inside the
  // capsule, which is exactly why this hound used to render as an unbroken
  // black shape. Each seam is a bright unlit core with a slightly wider
  // emissive halo around it, so the crack still glows in full daylight.
  const crackPositions = [
    [0, 0.129, 0.16, 0.1, 0.012],
    [0, 0.129, 0.02, 0.13, 0.013],
    [0, 0.129, -0.14, 0.09, 0.011],
    [0.072, 0.105, 0.09, 0.07, 0.009],
    [-0.072, 0.105, -0.05, 0.07, 0.009],
  ];
  for (const [x, y, z, len, w] of crackPositions) {
    const jitter = (Math.random() - 0.5) * 0.15;
    kit.at(body, kit.box(w * 2.2, 0.01, len * 1.3, crackHalo.clone()), x, y - 0.003, z, { rx: jitter });
    kit.at(body, kit.box(w, 0.024, len, crackGlow.clone()), x, y, z, { rx: jitter });
  }
  // Embers lifting off the hot seams — sells "magma" at a glance and keeps the
  // back edge of the silhouette lit even against a bright sky.
  const embers = kit.mote(7, { color: 0xff9a3c, size: 0.016, radius: 0.16, height: 0.18, speed: 0.7, seed: 21 });
  kit.at(body, embers, 0, 0.12, -0.02);

  // --- Legs: four long, lean legs — a hound's confident stride. ---
  // Local Y is measured from the TORSO's centre (these hang off `body`, not
  // `root`): the hips belong just under the belly line at -radius, and
  // kit.leg(len) drops 0.92*len + 0.25*thighR + 0.925*shinR from the hip to
  // the sole, so hipY = drop - body.position.y puts the paws exactly on y=0.
  // Front/rear pairs sit under the shoulders and haunches (~2/3 of the torso
  // half-length of 0.3), not bunched together at the middle.
  const legDefs = [
    [0.1, -0.136, 0.19], [-0.1, -0.136, 0.19],
    [0.1, -0.136, -0.19], [-0.1, -0.136, -0.19],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.28, skin, { thighR: 0.05, shinR: 0.036, footLen: 0.09 }), x, y, z));

  // Tail: proud, held aloft, no flame this time (that trait stayed with the
  // pup) — instead a warm ember-glow tuft at the tip echoes the lineage.
  const tail = kit.at(body, kit.tailChain(4, skin, { segLen: 0.09, startR: 0.04, endR: 0.018 }), 0, 0.05, -0.26, { rx: 0.55 });
  kit.at(tail.pivots[tail.pivots.length - 1], kit.fluffTuft(0.045, crackGlow.clone(), { count: 5, seed: 3 }), 0, 0, -0.04);

  // Smoke wisps drifting from the snout when it huffs — cool grey motes,
  // self-driving fx.
  const smoke = kit.mote(4, { color: 0x8a8478, size: 0.014, radius: 0.035, height: 0.1, speed: 0.6, seed: 7 });
  kit.at(head, smoke, 0, -0.075, 0.2);

  // The heartspark rides ON the chest surface (the chest orb reaches z=0.30) —
  // any deeper and the unlit core is simply occluded by the fur around it.
  const spark = kit.heartspark(0.036, pal.eye, { seed: 12 });
  kit.at(body, spark, 0, -0.03, 0.29);

  // Planted on the ground — a proud hound casts a presence.
  root.add(kit.shadowDisc(0.36, 0.38));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, chest, snout],
      fx: [smoke, embers, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.9,
      blinkEvery: 3.4,
    },
  };
}
