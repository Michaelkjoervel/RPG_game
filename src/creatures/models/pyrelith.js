// =============================================================================
// PYRELITH — Ember/Terra, stage 3 (Charvane awakens at L34).
// "Heavy obsidian-plated saurian, molten mane, crown of embers. Slow fuse,
// unstoppable." (Design Bible §4)
// =============================================================================
// The final form of the Kindlet line: everything gets heavier, slower and
// more monumental. Where Kindlet was round-and-clumsy and Charvane was
// lean-and-proud, Pyrelith is squat, planted, immovable — a low center of
// gravity, thick obsidian shellPlate armor, and a mane/crown built from
// several `flame()` instances (continuous fx, so they live in parts.fx, not
// parts.accents) plus a wide halo of ember-drift motes (explicitly called
// out in the design bible for this species).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_pyrelith(kit = kitDefault) {
  const pal = kit.palette(['ember', 'terra']);
  // Glassy volcanic rock, lifted out of near-black: warm charcoal with a
  // faint ember underglow so the heavy silhouette reads, while the magma
  // cracks/mane carry the real fire (Bible §8: colors must READ).
  const obsidian = kit.mat(0x453c42, { rough: 0.35, metal: 0.15, emissive: 0x38160a, emissiveIntensity: 0.5 });
  const plate = kit.mat(0x554a44, { rough: 0.5, emissive: 0x2a1208, emissiveIntensity: 0.35 });
  const magma = kit.mat(pal.primary, { unlit: true, transparent: true, opacity: 0.95 });

  const root = new THREE.Group();

  // Squat, heavy body — wide and low rather than tall.
  const body = kit.blob(0.42, obsidian, { seed: 9, noise: 0.1, squash: { x: 1.15, y: 0.85, z: 1.3 } });
  root.add(body);
  body.position.y = 0.5;

  // Magma crack-seams across the flanks — thin emissive strips of molten
  // light breaking through the cooled shell, so the obsidian mass glows from
  // within and the silhouette reads even backlit.
  const crackDefs = [
    [0.4, 0.06, 0.2, 0.2, 0.5, 0.3], [-0.42, 0.02, 0.1, 0.24, -0.4, -0.25],
    [0.38, -0.1, -0.15, 0.18, 0.9, 0.4], [-0.36, -0.06, -0.25, 0.2, -0.8, -0.35],
    [0.3, 0.14, -0.35, 0.16, 0.3, 0.6], [-0.28, 0.18, 0.34, 0.15, -0.3, -0.5],
  ];
  for (const [x, y, z, len, ry, rz] of crackDefs) {
    kit.at(body, kit.box(0.02, len, 0.014, magma.clone()), x, y, z, { ry, rz });
  }

  // Obsidian back plates — overlapping armor scutes down the spine.
  const plateSpots = [[0, 0.28, 0.2, 0.22], [0, 0.3, -0.02, 0.24], [0, 0.28, -0.25, 0.2], [0, 0.22, -0.42, 0.15]];
  for (const [x, y, z, sz] of plateSpots) {
    kit.at(body, kit.shellPlate(sz, sz * 0.7, sz * 0.55, plate, { bulge: 0.09 }), x, y, z, { rx: -0.15 });
  }

  const head = kit.at(body, kit.blob(0.22, obsidian, { seed: 10, squash: { x: 1, y: 0.85, z: 1.25 } }), 0, 0.24, 0.44);

  const eyeL = kit.at(head, kit.eye(0.05, { irisColor: 0xff9a3c, scleraColor: 0x2a1c14, skinColor: 0x453c42, glintSize: 0.018 }), 0.11, 0.03, 0.13, { ry: 0.3 });
  const eyeR = kit.at(head, kit.eye(0.05, { irisColor: 0xff9a3c, scleraColor: 0x2a1c14, skinColor: 0x453c42, glintSize: 0.018 }), -0.11, 0.03, 0.13, { ry: -0.3 });

  // Crown of embers: a ring of curved horns, each tipped with a small
  // steady ember glow.
  const crownCount = 5;
  const crownAccents = [];
  for (let i = 0; i < crownCount; i++) {
    const a = (i / (crownCount - 1) - 0.5) * 1.7;
    const hornMesh = kit.horn(0.12 - Math.abs(a) * 0.035, obsidian, { bend: 0.35, baseR: 0.03, tipR: 0.006 });
    const h = kit.at(head, hornMesh, Math.sin(a) * 0.14, 0.2, 0.02 - Math.abs(a) * 0.05, { rz: -a * 0.5 });
    crownAccents.push(h);
    kit.at(h, kit.orb(0.018, magma.clone()), 0, 0.115, 0.02);
  }

  // Heavy, low jaw with a permanent ember-lit underglow.
  const jaw = kit.at(head, kit.blob(0.14, obsidian, { seed: 11, squash: { x: 0.9, y: 0.55, z: 1 } }), 0, -0.12, 0.14);
  kit.at(jaw, kit.orb(0.05, magma.clone(), { sy: 0.4 }), 0, -0.02, 0.1);

  // --- Legs: four thick, planted legs. ---
  const legDefs = [
    [0.24, 0.32, 0.24], [-0.24, 0.32, 0.24],
    [0.24, 0.32, -0.24], [-0.24, 0.32, -0.24],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.36, obsidian, { thighR: 0.11, shinR: 0.08, footLen: 0.16 }), x, y, z));

  // Short, thick tail, more counterweight than flourish.
  const tail = kit.at(body, kit.tailChain(3, obsidian, { segLen: 0.16, startR: 0.14, endR: 0.06 }), 0, 0.18, -0.42);

  // Molten mane: a run of flames along the back of the neck and spine —
  // each is a self-driving fx object (flicker), so all go into parts.fx.
  const maneSpots = [[0, 0.34, 0.32], [0, 0.4, 0.14], [0, 0.42, -0.06], [0, 0.38, -0.24]];
  const manes = maneSpots.map(([x, y, z], i) => {
    const f = kit.flame(0.22 - i * 0.02, { seed: 20 + i, colors: [0xa83a0e, 0xf06a20, 0xffcf70] });
    kit.at(body, f, x, y, z);
    return f;
  });

  // Wide halo of ember-drift motes — called out explicitly in the bible for
  // this species' idle presence.
  const embers = kit.mote(14, { color: 0xff9a3c, size: 0.028, radius: 0.55, height: 0.5, speed: 0.4, seed: 33 });
  kit.at(body, embers, 0, 0.1, 0);

  const spark = kit.heartspark(0.06, pal.eye, { seed: 44 });
  kit.at(body, spark, 0, 0.18, 0.38);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      jaw,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: crownAccents,
      fx: [...manes, embers, spark],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'quad',
      breathAmp: 1.3,
      blinkEvery: 4.2,
    },
  };
}
