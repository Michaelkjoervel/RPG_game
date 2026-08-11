// =============================================================================
// CHANDELISK — Terra/Lumen, stage 2 (Shardling awakens at L25).
// "Chandelier-spider, hanging crystal limbs, prisms scatter rainbow shards."
// (Design Bible §4)
// =============================================================================
// Shardling's grand, chandelier-like final form: a suspended gem-cluster
// body over six long, faceted crystal limbs that hang and taper like icicles
// rather than reading as ordinary insect legs (still built from kit.leg()
// so the walk cycle animates them, just re-skinned in translucent crystal
// with a small kit.crystal ornament fused to each knee). The bible's
// "prisms scatter rainbow shards" becomes a ring of small tinted mote
// clusters — one per spectrum color — orbiting slowly beneath the body,
// exactly the kind of jewel-box showpiece a Rare deserves.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_chandelisk(kit = kitDefault) {
  const pal = kit.palette(['terra', 'lumen']);
  const stone = kit.mat(0x746346, { rough: 0.55 });
  const crystalMat = kit.mat(0xe6dcc0, { rough: 0.1, metal: 0.12, transparent: true, opacity: 0.78 });
  const crystalMat2 = kit.mat(0xd8ecff, { rough: 0.1, transparent: true, opacity: 0.7 });

  const root = new THREE.Group();

  const thorax = kit.blob(0.13, stone, { seed: 62, noise: 0.08, squash: { x: 1, y: 0.75, z: 1.1 } });
  root.add(thorax);
  thorax.position.y = 0.34;

  // The grand central gem cluster, hanging chandelier-style below the thorax.
  const chandelier = kit.crystal(0.11, crystalMat, { coreColor: pal.eye, detail: 1 });
  kit.at(thorax, chandelier, 0, -0.1, -0.05, { s: 1 });
  const chandelier2 = kit.crystal(0.055, crystalMat2, { coreColor: 0xffffff, detail: 0 });
  kit.at(chandelier, chandelier2, 0, -0.12, 0, { s: 1 });

  const head = kit.at(thorax, kit.orb(0.06, stone, { sz: 1.05, sy: 0.8 }), 0, 0.02, 0.13);
  const eyeL = kit.at(head, kit.eye(0.022, { irisColor: 0xffe9b0, skinColor: 0x746346, glintSize: 0.009 }), 0.038, 0.008, 0.05, { ry: 0.4 });
  const eyeR = kit.at(head, kit.eye(0.022, { irisColor: 0xffe9b0, skinColor: 0x746346, glintSize: 0.009 }), -0.038, 0.008, 0.05, { ry: -0.4 });
  const eyeL2 = kit.at(head, kit.eye(0.013, { irisColor: 0xffe9b0, skinColor: 0x746346, glintSize: 0.005 }), 0.032, 0.026, 0.045, { ry: 0.4 });
  const eyeR2 = kit.at(head, kit.eye(0.013, { irisColor: 0xffe9b0, skinColor: 0x746346, glintSize: 0.005 }), -0.032, 0.026, 0.045, { ry: -0.4 });

  // Six hanging crystal limbs — long, tapering, icicle-like. Each has a
  // small crystal knee ornament (the "hanging limbs" of the bible text).
  const legSpots = [
    { x: 0.11, z: 0.08, ry: 0.5 }, { x: -0.11, z: 0.08, ry: -0.5 },
    { x: 0.14, z: -0.02, ry: 0.95 }, { x: -0.14, z: -0.02, ry: -0.95 },
    { x: 0.11, z: -0.12, ry: 1.4 }, { x: -0.11, z: -0.12, ry: -1.4 },
  ];
  const legs = legSpots.map(({ x, z, ry }, i) => {
    const l = kit.at(thorax, kit.leg(0.26, crystalMat, { thighR: 0.02, shinR: 0.013, footLen: 0.04 }), x, 0.03, z, { ry });
    kit.at(l.knee, kit.crystal(0.026, crystalMat2, { coreColor: 0xffffff, detail: 0 }), 0, -0.02, 0);
    return l;
  });
  const legParts = legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot }));

  // Rainbow prism scatter: six small mote clusters in a wide slow orbit,
  // one per spectrum hue, tucked under the chandelier body.
  const spectrum = [0xff6a5c, 0xffb85c, 0xfff08c, 0x8ce08c, 0x7ac6ff, 0xb08cff];
  const scatterFx = spectrum.map((c, i) => {
    const m = kit.mote(2, { color: c, size: 0.014, radius: 0.02, height: 0.02, speed: 0.5 + i * 0.05, seed: 70 + i });
    m.group.position.set(Math.cos((i / spectrum.length) * Math.PI * 2) * 0.16, -0.12, Math.sin((i / spectrum.length) * Math.PI * 2) * 0.16 - 0.05);
    kit.at(thorax, m, m.group.position.x, m.group.position.y, m.group.position.z);
    return m;
  });

  const spark = kit.heartspark(0.032, pal.eye, { seed: 71 });
  kit.at(chandelier, spark, 0, 0.02, 0.02);

  return {
    group: kit.groundPlant(root),
    parts: {
      body: thorax,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid'), eyeL2.getObjectByName('eyelid'), eyeR2.getObjectByName('eyelid')],
      legs: legParts,
      accents: [chandelier],
      fx: [...scatterFx, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.75,
      blinkEvery: 3.6,
    },
  };
}
