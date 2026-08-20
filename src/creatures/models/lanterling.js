// =============================================================================
// LANTERLING — Lumen, stage 1 wild (Whisperwood).
// "Firefly-wisp carrying its own tiny lantern (its heartspark, externalized).
// Helpful." (Design Bible §4)
// =============================================================================
// Every other Kindred keeps its heartspark tucked in its chest (see
// kit.js's header note + every starter's `spark` attached near the torso).
// Lanterling is the one deliberate exception the bible calls for: its
// heartspark hangs OUTSIDE its body, on a thin tether, as a literal carried
// lantern — so this model has no chest glow at all, only the lantern. A
// tiny drifting wisp body with no legs (it never lands) drives the model;
// hints.locomotion is forced to 'float' for a magical drift rather than an
// active wing-beat.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_lanterling(kit = kitDefault) {
  const pal = kit.palette(['lumen']);
  const skin = kit.mat(0xffcf7a, { rough: 0.4, emissive: 0x2a1c08, emissiveIntensity: 0.3 }); // warm glow-tinted body
  const wingMat = kit.mat(0xfff2d0, { unlit: true, additive: true, opacity: 0.4 });
  const tetherMat = kit.mat(0xd8b878, { rough: 0.4, transparent: true, opacity: 0.7 });

  const root = new THREE.Group();

  const body = kit.blob(0.045, skin, { seed: 180, noise: 0.1 });
  kit.paint(body, { from: 0xd89a4c, to: 0xffe8b0, noise: 0.04, seed: 180 });
  root.add(body);
  body.position.y = 0.12;

  const eyeL = kit.at(body, kit.eye(0.013, { irisColor: 0x241608, skinColor: 0xffcf7a, glintSize: 0.005 }), 0.02, 0.006, 0.032, { ry: 0.35 });
  const eyeR = kit.at(body, kit.eye(0.013, { irisColor: 0x241608, skinColor: 0xffcf7a, glintSize: 0.005 }), -0.02, 0.006, 0.032, { ry: -0.35 });

  // Thin thread antennae.
  const antL = kit.at(body, kit.horn(0.03, skin, { bend: 0.4, baseR: 0.003, tipR: 0.001 }), 0.012, 0.03, -0.005, { rz: 0.2 });
  const antR = kit.at(body, kit.horn(0.03, skin, { bend: 0.4, baseR: 0.003, tipR: 0.001 }), -0.012, 0.03, -0.005, { rz: -0.2 });

  // Small gauzy wings, kept as an accent (subtle idle flutter) rather than
  // a real flap-cycle — the drift is what carries this wisp, not wingbeats.
  const wingDefs = [[0.025, 0.01, 0, 1], [-0.025, 0.01, 0, -1]];
  const wingAccents = wingDefs.map(([x, y, z, side]) => {
    const w = kit.wing(0.06, wingMat, { style: 'energy', bones: 2, width: 0.05 });
    kit.at(body, w, x, y, z, { ry: 0.3 });
    w.group.scale.x = side;
    return w.group;
  });

  // The carried lantern: a thin tether hanging below/in front of the body,
  // ending in a tiny four-strut cage frame around a glowing core. The
  // heartspark glow lives INSIDE this cage instead of on the chest — the
  // bible's "heartspark, externalized" made literal.
  const tether = kit.at(body, kit.capsule(0.004, 0.05, tetherMat, { capSeg: 2, radSeg: 4 }), 0, -0.05, 0.01, { rx: 0.35 });
  const cage = new THREE.Group(); cage.name = 'lanternCage';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const strut = kit.box(0.003, 0.036, 0.003, tetherMat.clone());
    strut.position.set(Math.cos(a) * 0.018, 0, Math.sin(a) * 0.018);
    cage.add(strut);
  }
  kit.at(tether, cage, 0, -0.06, 0.02);
  const lantern = kit.heartspark(0.017, pal.eye, { seed: 181 });
  kit.at(cage, lantern, 0, 0, 0);

  // A faint halo of drifting motes around the lantern — moths to its own flame.
  const halo = kit.mote(4, { color: 0xfff2d0, size: 0.008, radius: 0.03, height: 0.02, speed: 0.6, seed: 182 });
  kit.at(cage, halo, 0, 0, 0);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      accents: [antL, antR, ...wingAccents, tether],
      fx: [lantern, halo],
    },
    hints: {
      personality: 'eager',
      locomotion: 'float',
      hover: true,
      hoverAmp: 0.045,
      breathAmp: 1.1,
      blinkEvery: 2.6,
    },
  };
}
