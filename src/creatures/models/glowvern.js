// =============================================================================
// GLOWVERN — Lumen, stage 2 (Lanterling awakens at L19).
// "Cat-sized lantern wyvern, glass-bell tail glows. Guides lost travelers."
// (Design Bible §4)
// =============================================================================
// Lanterling's externalized heartspark-as-lantern lineage continues here,
// fused directly into the body: rather than a carried lantern on a tether,
// the whole tail terminates in a glass-bell shape (kit.bulb(), the same
// jar/gourd lathe profile the bible earmarks for oozel/sludgemaw/jellune,
// borrowed here for its bell silhouette) with the heartspark glowing
// inside it. A small, sleek, cat-sized dragon body carries it.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_glowvern(kit = kitDefault) {
  const pal = kit.palette(['lumen']);
  const skin = kit.mat(0x3a7a78, { rough: 0.4, metal: 0.05 });      // soft teal-gold scale
  const bellyMat = kit.mat(0xe8dcb8, { rough: 0.5 });
  const wingMat = kit.mat(0xd8c898, { rough: 0.3, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  const bellMat = kit.mat(0xfff2c8, { rough: 0.1, transparent: true, opacity: 0.4, side: THREE.DoubleSide });

  const root = new THREE.Group();

  // Wyvern torso running nose-to-tail along Z — bake the capsule's axis swing
  // about X (about Z would put the long axis on X, i.e. broadside to the view).
  const body = kit.capsule(0.1, 0.22, skin, { capSeg: 4, radSeg: 9 });
  body.geometry.rotateX(Math.PI / 2);
  root.add(body);
  body.position.y = 0.24;

  const bellyStripe = kit.capsule(0.06, 0.16, bellyMat, { capSeg: 3, radSeg: 7 });
  bellyStripe.geometry.rotateX(Math.PI / 2);
  bellyStripe.scale.set(0.65, 0.55, 1);
  kit.at(body, bellyStripe, 0, -0.06, 0);

  const head = kit.at(body, kit.blob(0.075, skin, { seed: 190, squash: { x: 0.85, y: 0.85, z: 1.3 } }), 0, 0.05, 0.17);
  const eyeL = kit.at(head, kit.eye(0.028, { irisColor: 0xfff2c8, scleraColor: 0x14201f, skinColor: 0x3a7a78, glintSize: 0.011 }), 0.052, 0.012, 0.06, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.028, { irisColor: 0xfff2c8, scleraColor: 0x14201f, skinColor: 0x3a7a78, glintSize: 0.011 }), -0.052, 0.012, 0.06, { ry: -0.35 });
  const earL = kit.at(head, kit.ear(0.035, skin), 0.045, 0.045, -0.01, { rz: 0.3 });
  const earR = kit.at(head, kit.ear(0.035, skin), -0.045, 0.045, -0.01, { rz: -0.3 });

  // Small membrane wings — enough for short guiding flights, not a full
  // wyvern wingspan.
  const wingDefs = [[0.09, 0.02, -0.02, 1], [-0.09, 0.02, -0.02, -1]];
  const wingParts = wingDefs.map(([x, y, z, side]) => {
    const w = kit.wing(0.16, wingMat, { style: 'membrane', bones: 2, width: 0.13, droop: 0.1 });
    kit.at(body, w, x, y, z, { ry: 0.15 });
    w.group.scale.x = side;
    return w;
  });

  // --- Legs: four small, agile, cat-sized legs. ---
  // Hip Y is local to the torso — just under the belly, from where
  // kit.leg(0.15) drops 0.169 and the paws land on y=0.
  const legDefs = [
    [0.07, -0.071, 0.12], [-0.07, -0.071, 0.12],
    [0.07, -0.071, -0.12], [-0.07, -0.071, -0.12],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.15, skin, { thighR: 0.033, shinR: 0.025, footLen: 0.055 }), x, y, z));

  // The tail: a short chain leading to the signature glass-bell tip, glowing
  // with its own heartspark from the inside.
  const tail = kit.at(body, kit.tailChain(3, skin, { segLen: 0.06, startR: 0.045, endR: 0.03 }), 0, 0.02, -0.19);
  const bell = kit.bulb(bellMat, { height: 0.11, width: 0.06, neck: 0.3 });
  bell.rotation.x = Math.PI; // narrow neck toward the tail, wide bell hanging past the tip
  kit.at(tail.pivots[tail.pivots.length - 1], bell, 0, 0.02, -0.1);
  const bellGlow = kit.heartspark(0.03, pal.eye, { seed: 191 });
  kit.at(tail.pivots[tail.pivots.length - 1], bellGlow, 0, -0.01, -0.1);

  const spark = kit.heartspark(0.032, pal.eye, { seed: 192 });
  kit.at(body, spark, 0, 0, 0.08);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      wings: wingParts.map((w) => w.bones),
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, bell],
      fx: [bellGlow, spark],
    },
    hints: {
      personality: 'calm',
      locomotion: 'fly',
      breathAmp: 0.9,
      blinkEvery: 3.4,
    },
  };
}
