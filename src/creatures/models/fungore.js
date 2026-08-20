// =============================================================================
// FUNGORE — Bloom/Venom, stage 2 (Myclet awakens at L20).
// "Shroom-bear, shelf-fungus armor, spore breath. Sleepy juggernaut."
// (Design Bible §4)
// =============================================================================
// Myclet's mischief settles into a huge, slow-moving juggernaut: a squat
// bear body layered with overlapping shelf-fungus plates (wide, flat
// shellPlate rows rather than Myclet's single worn cap — the whole back
// became the mushroom). Half-lidded eyes and the 'sleepy' personality carry
// the "sleepy juggernaut" read; drifting spore-breath motes near the mouth
// echo Charvane's smoke-wisp trick with the family's purple-green spores.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_fungore(kit = kitDefault) {
  const pal = kit.palette(['bloom', 'venom']);
  const skin = kit.mat(0x4a5a34, { rough: 0.7 });          // deep mossy bear-brown
  const shelfMat = kit.mat(0xc9b48a, { rough: 0.6 });      // tan shelf-fungus
  const shelfEdge = kit.mat(pal.secondary, { rough: 0.5, transparent: true, opacity: 0.9 });

  const root = new THREE.Group();

  const body = kit.blob(0.32, skin, { seed: 130, noise: 0.11, squash: { x: 1.15, y: 0.9, z: 1.2 } });
  kit.paint(body, { from: 0x33421f, to: 0x6d854a, noise: 0.07, seed: 130 });
  root.add(body);
  body.position.y = 0.38;

  // Shelf-fungus armor: proper HORIZONTAL shelves jutting out of the back
  // and flanks the way bracket fungus grows off a log — not decals lying
  // flat against the hide. Each carries a venom-purple rim glow underneath.
  const plateSpots = [
    // [x, y, z, w, ry]
    [0, 0.27, -0.02, 0.3, 0],
    [0.16, 0.19, 0.1, 0.22, 0.5],
    [-0.17, 0.2, -0.04, 0.24, -0.5],
    [0.12, 0.13, -0.2, 0.2, 1.1],
    [-0.1, 0.1, 0.22, 0.18, -0.3],
  ];
  for (const [x, y, z, w, ry] of plateSpots) {
    const plate = kit.shellPlate(w, w * 0.62, 0.05, shelfMat.clone(), { bulge: 0.045 });
    kit.paint(plate, { from: 0x9a8464, to: 0xdcc9a0, axis: 'z', noise: 0.05, seed: 131 + Math.round(x * 100) });
    kit.at(body, plate, x, y, z, { rx: -Math.PI / 2 + 0.18, ry });
    kit.at(plate, kit.box(w * 0.82, w * 0.5, 0.008, shelfEdge.clone()), 0, -0.01, -0.012);
  }

  const head = kit.at(body, kit.orb(0.16, skin, { sz: 1.05, sy: 0.85 }), 0, 0.16, 0.34);
  kit.paint(head, { from: 0x415428, to: 0x74904e, noise: 0.05, seed: 132 });

  // Sleepy eyes: half-lidded via the new lidBias rest pose + a slight head
  // droop — the juggernaut is awake, just barely.
  const eyeL = kit.at(head, kit.eye(0.04, { irisColor: 0x2a1e12, skinColor: 0x4a5a34, glintSize: 0.014, lidBias: 0.34 }), 0.075, -0.01, 0.115, { ry: 0.24 });
  const eyeR = kit.at(head, kit.eye(0.04, { irisColor: 0x2a1e12, skinColor: 0x4a5a34, glintSize: 0.014, lidBias: 0.34 }), -0.075, -0.01, 0.115, { ry: -0.24 });
  head.rotation.x = 0.1;

  const earL = kit.at(head, kit.ear(0.06, skin), 0.11, 0.1, -0.02, { rz: 0.3 });
  const earR = kit.at(head, kit.ear(0.06, skin), -0.11, 0.1, -0.02, { rz: -0.3 });

  const jaw = kit.at(head, kit.blob(0.09, skin, { seed: 131, squash: { x: 1, y: 0.55, z: 0.9 } }), 0, -0.1, 0.13);

  // --- Legs: four thick, planted bear legs. ---
  const legDefs = [
    [0.19, 0.17, 0.18], [-0.19, 0.17, 0.18],
    [0.19, 0.17, -0.17], [-0.19, 0.17, -0.17],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.24, skin, { thighR: 0.08, shinR: 0.06, footLen: 0.11 }), x, y, z));

  const tail = kit.at(body, kit.tailChain(2, skin, { segLen: 0.04, startR: 0.035, endR: 0.02 }), 0, 0.1, -0.3);

  // Spore-breath: a slow purple-green mote wisp near the mouth.
  const breath = kit.mote(6, { color: pal.secondary, size: 0.02, radius: 0.05, height: 0.1, speed: 0.35, seed: 132 });
  kit.at(jaw, breath, 0, -0.03, 0.07);

  const spark = kit.heartspark(0.05, pal.eye, { seed: 133 });
  kit.at(body, spark, 0, 0.02, 0.37);

  root.add(kit.shadowDisc(0.46, 0.42));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      jaw,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR],
      fx: [breath, spark],
    },
    hints: {
      personality: 'sleepy',
      locomotion: 'quad',
      breathAmp: 1.2,
      blinkEvery: 5.5,
    },
  };
}
