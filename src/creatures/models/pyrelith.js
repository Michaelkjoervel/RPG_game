// =============================================================================
// PYRELITH — Ember/Terra, stage 3 (Charvane awakens at L34).
// "Heavy obsidian-plated saurian, molten mane, crown of embers. Slow fuse,
// unstoppable." (Design Bible §4)
// =============================================================================
// The final form of the Kindlet line, rebuilt for the visual overhaul. What
// carries it now:
//   1. VALUE STRUCTURE, not one muddy brown: the whole hide is painted with
//      applyVertexGradient (charcoal under-body -> warm ash top, mottled) so
//      the mass reads as lit volcanic rock instead of a burnt cake.
//   2. MOLTEN CORE. The signature detail is light coming from INSIDE: wide
//      emissive magma cracks across flanks/shoulders, a glowing underbelly
//      seam between the legs, mouth-glow under a heavy brow — the animal is
//      a cooled crust barely containing a furnace.
//   3. MONUMENTAL STANCE. Head low and forward off a deep chest, thick
//      planted legs with toes, a ridge of obsidian scutes rising over the
//      spine into a crown of ember-tipped horns and a flame mane.
// Conventions per kit.js: faces +Z, nose-to-tail capsules bake rotateX, legs
// hip Y authored in the BODY's local space, groundPlant() last.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_pyrelith(kit = kitDefault) {
  const pal = kit.palette(['ember', 'terra']);
  // Vertex-colored rock: the gradient does the coloring, the material stays white.
  const rock = kit.mat(0xffffff, { vertexColors: true, rough: 0.55, metal: 0.08 });
  const ROCK_LO = 0x261e1d, ROCK_HI = 0x7a6152;      // charcoal under -> warm ash top
  const PLATE_LO = 0x322624, PLATE_HI = 0x8d7360;    // scutes a notch warmer/lighter
  const magma = kit.mat(0xff7a26, { unlit: true, transparent: true, opacity: 0.95 });
  const magmaHot = kit.mat(0xffc75e, { unlit: true, transparent: true, opacity: 0.95 });
  const skinHex = 0x4a3e38;                          // eyelid tone ≈ mid-gradient

  const paintRock = (mesh, seed, lo = ROCK_LO, hi = ROCK_HI, jitter = 0) => {
    if (jitter) jitterGeometry(mesh.geometry, jitter, seed);
    applyVertexGradient(mesh.geometry, { from: lo, to: hi, noise: 0.045, seed });
    return mesh;
  };

  const root = new THREE.Group();

  // --- Body: wide, low, monumental --------------------------------------
  const body = kit.blob(0.46, rock, { seed: 9, noise: 0.09, squash: { x: 1.12, y: 0.8, z: 1.32 } });
  paintRock(body, 9);
  root.add(body);
  body.position.y = 0.62;

  // Deep chest shoulder mass, slightly higher than the haunches — the whole
  // animal leans INTO its next step.
  const chest = paintRock(kit.blob(0.34, rock, { seed: 12, noise: 0.07, squash: { x: 1.08, y: 0.92, z: 0.95 } }), 12);
  kit.at(body, chest, 0, 0.05, 0.36);
  const haunch = paintRock(kit.blob(0.3, rock, { seed: 13, noise: 0.07, squash: { x: 1.1, y: 0.85, z: 0.95 } }), 13);
  kit.at(body, haunch, 0, -0.0, -0.36);

  // Molten underbelly seam — the furnace showing through between the legs.
  const bellyGlow = kit.capsule(0.14, 0.62, magma.clone(), { capSeg: 4, radSeg: 8 });
  bellyGlow.geometry.rotateX(Math.PI / 2);
  bellyGlow.scale.set(0.85, 0.4, 1);
  kit.at(body, bellyGlow, 0, -0.34, 0);

  // Magma crack-seams: WIDE, layered two-tone (deep orange strip + a thinner
  // hot core riding on it) so the cracks read at battle distance.
  const crackDefs = [
    [0.44, 0.1, 0.24, 0.3, 0.5, 0.35], [-0.46, 0.04, 0.12, 0.34, -0.4, -0.3],
    [0.42, -0.12, -0.18, 0.26, 0.9, 0.45], [-0.4, -0.08, -0.3, 0.28, -0.8, -0.4],
    [0.34, 0.16, -0.4, 0.22, 0.3, 0.7], [-0.32, 0.2, 0.4, 0.2, -0.3, -0.55],
    [0.2, -0.2, 0.48, 0.2, 0.15, 0.9], [-0.18, -0.24, 0.46, 0.18, -0.1, -0.95],
  ];
  for (const [x, y, z, len, ry, rz] of crackDefs) {
    const seam = kit.at(body, kit.box(0.055, len, 0.03, magma.clone()), x, y, z, { ry, rz });
    kit.at(seam, kit.box(0.022, len * 0.82, 0.034, magmaHot.clone()), 0.005, 0, 0.001);
    // A molten node where the seam is widest — reads as the crack's source.
    kit.at(seam, kit.orb(0.035, magma.clone(), { sy: 0.6 }), 0, len * 0.15, 0.01);
  }

  // Obsidian scute ridge over the spine — bigger toward the shoulders, so the
  // back line rises toward the crown.
  const plateSpots = [[0, 0.34, 0.3, 0.3], [0, 0.4, 0.06, 0.34], [0, 0.36, -0.2, 0.28], [0, 0.28, -0.42, 0.2]];
  for (const [x, y, z, sz] of plateSpots) {
    const p = kit.shellPlate(sz, sz * 0.72, sz * 0.6, rock, { bulge: 0.12, segments: 3 });
    applyVertexGradient(p.geometry, { from: PLATE_LO, to: PLATE_HI, noise: 0.05, seed: sz * 100 });
    kit.at(body, p, x, y, z, { rx: -Math.PI / 2 + 0.28 });
  }
  // A pair of shoulder pauldron plates breaking the silhouette sideways.
  for (const side of [1, -1]) {
    const p = kit.shellPlate(0.24, 0.2, 0.14, rock, { bulge: 0.1 });
    applyVertexGradient(p.geometry, { from: PLATE_LO, to: PLATE_HI, noise: 0.05, seed: 77 });
    kit.at(body, p, side * 0.36, 0.22, 0.3, { ry: side * (Math.PI / 2 - 0.35), rz: -side * 0.35 });
  }

  // --- Head: heavy, low, furnace-lit -------------------------------------
  const head = kit.blob(0.26, rock, { seed: 10, noise: 0.06, squash: { x: 1, y: 0.82, z: 1.3 } });
  paintRock(head, 10);
  kit.at(body, head, 0, 0.3, 0.62, { rx: 0.08 });
  // Heavy brow shelf over both eyes — the slow, unstoppable scowl.
  const brow = paintRock(kit.orb(0.2, rock, { sy: 0.42, sz: 0.8 }), 21, PLATE_LO, PLATE_HI);
  kit.at(head, brow, 0, 0.15, 0.08);

  const eyeL = kit.at(head, kit.eye(0.055, { irisColor: 0xffa33c, scleraColor: 0x241812, skinColor: skinHex, glintSize: 0.02 }), 0.13, 0.03, 0.15, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.055, { irisColor: 0xffa33c, scleraColor: 0x241812, skinColor: skinHex, glintSize: 0.02 }), -0.13, 0.03, 0.15, { ry: -0.35 });

  // Blunt muzzle + heavy jaw, with a magma mouth-seam glowing in the gap.
  const muzzle = paintRock(kit.blob(0.14, rock, { seed: 11, noise: 0.05, squash: { x: 1.05, y: 0.7, z: 1.15 } }), 11);
  kit.at(head, muzzle, 0, -0.06, 0.22);
  const jaw = paintRock(kit.blob(0.12, rock, { seed: 14, squash: { x: 1.0, y: 0.5, z: 1.1 } }), 14, ROCK_LO, 0x554842);
  kit.at(head, jaw, 0, -0.17, 0.2);
  kit.at(jaw, kit.orb(0.085, magma.clone(), { sy: 0.28, sz: 1.05 }), 0, 0.05, 0.02);

  // Crown of embers: a rack of obsidian horns arcing back, each tipped with a
  // bead of live ember, plus one central flame.
  const crownAccents = [];
  const crownN = 5;
  for (let i = 0; i < crownN; i++) {
    const a = (i / (crownN - 1) - 0.5) * 1.9;
    const len = 0.32 - Math.abs(a) * 0.07;
    const hornMesh = kit.horn(len, rock, { bend: 0.4, baseR: 0.055, tipR: 0.012 });
    applyVertexGradient(hornMesh.geometry, { from: PLATE_LO, to: 0x9c8168, noise: 0.04, seed: 30 + i });
    const h = kit.at(head, hornMesh, Math.sin(a) * 0.17, 0.19, -0.02 - Math.abs(a) * 0.06,
      { rz: -a * 0.55, rx: -0.75 });
    crownAccents.push(h);
    kit.at(h, kit.orb(0.034, magmaHot.clone()), 0.4 * len, len, 0);
  }

  // --- Legs: four thick pillars with toes --------------------------------
  const LEG = 0.52, hipY = -0.24;
  const legDefs = [
    [0.3, hipY, 0.34], [-0.3, hipY, 0.34],
    [0.3, hipY, -0.32], [-0.3, hipY, -0.32],
  ];
  const legs = legDefs.map(([x, y, z], i) => {
    const l = kit.at(body, kit.leg(LEG, rock, { thighR: 0.14, shinR: 0.1, footLen: 0.2, footMat: rock }), x, y, z);
    paintRock(l.group.children[0], 40 + i);                       // thigh
    // Shoulder boulder at the hip, hock bulge at the knee — mass, not dowels.
    kit.at(l.hip, paintRock(kit.orb(0.15, rock, { sy: 1.2, sz: 1.05 }), 50 + i), 0, -0.05, 0);
    for (const child of l.knee.children) if (child.geometry) paintRock(child, 60 + i);
    // Three blunt obsidian toes per foot.
    for (const tx of [-1, 0, 1]) {
      kit.at(l.foot, paintRock(kit.orb(0.05, rock, { sz: 1.35 }), 70 + i + tx), tx * 0.055, -0.01, 0.1);
    }
    return l;
  });
  // Stance: forelegs planted a hair wider, hind pair coiled — mid-stride weight.
  legs[0].hip.rotation.z = -0.06; legs[1].hip.rotation.z = 0.06;
  legs[2].hip.rotation.x = 0.1; legs[3].hip.rotation.x = 0.1;

  // --- Tail: thick counterweight with its own scutes and an ember tip ----
  const tail = kit.at(body, kit.tailChain(4, rock, { segLen: 0.19, startR: 0.17, endR: 0.05 }), 0, 0.1, -0.52);
  tail.pivots.forEach((p, i) => {
    for (const child of p.children) if (child.geometry && child.geometry.attributes) paintRock(child, 80 + i);
    p.rotation.x = i === 0 ? 0.12 : -0.04;
    const sz = 0.14 - i * 0.03;
    const plate = kit.shellPlate(sz, sz * 0.7, sz * 0.5, rock, { bulge: 0.08 });
    applyVertexGradient(plate.geometry, { from: PLATE_LO, to: PLATE_HI, noise: 0.05, seed: 90 + i });
    kit.at(p, plate, 0, 0.13 - i * 0.025, -0.1, { rx: -Math.PI / 2 + 0.3 });
  });
  const tailEmber = kit.at(tail.pivots[tail.pivots.length - 1], kit.orb(0.035, magmaHot.clone()), 0, 0.02, -0.2);

  // --- Molten mane + ember halo -------------------------------------------
  const maneSpots = [[0, 0.44, 0.52], [0, 0.54, 0.28], [0, 0.58, 0.04], [0, 0.54, -0.18], [0, 0.44, -0.38]];
  const manes = maneSpots.map(([x, y, z], i) => {
    const h = 0.46 - Math.abs(i - 1.6) * 0.07;
    const f = kit.flame(h, { seed: 20 + i, width: h * 0.85, colors: [0xb23a0c, 0xf5701e, 0xffd377] });
    kit.at(body, f, x, y, z);
    return f;
  });
  const headFlame = kit.flame(0.3, { seed: 27, width: 0.24, colors: [0xb23a0c, 0xf5701e, 0xffd377] });
  kit.at(head, headFlame, 0, 0.26, -0.06);

  const embers = kit.mote(15, { color: 0xff9a3c, size: 0.03, radius: 0.62, height: 0.55, speed: 0.4, seed: 33 });
  kit.at(body, embers, 0, 0.15, 0);

  const spark = kit.heartspark(0.06, pal.eye, { seed: 44 });
  kit.at(body, spark, 0, -0.02, 0.66);

  const grounded = kit.groundPlant(root);
  // Soft contact shadow so the creature reads planted on any ground.
  const contact = kit.shadowDisc(0.75, 0.32);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body,
      head,
      jaw,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [...crownAccents, tailEmber],
      fx: [...manes, headFlame, embers, spark],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'quad',
      breathAmp: 1.3,
      blinkEvery: 4.2,
    },
  };
}
