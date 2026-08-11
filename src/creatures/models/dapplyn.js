// =============================================================================
// DAPPLYN — Bloom, stage 1 wild (Whisperwood).
// "Fawn dappled with living light-spots that drift like sun through leaves.
// Gentle." (Design Bible §4)
// =============================================================================
// A graceful, quad-legged fawn (per the addendum's explicit note: dapplyn is
// "quad graceful", not the stubby-legged read of most stage-1 wilds). The
// signature "living light-spots that drift" is a bespoke fx object: a
// handful of small flat glow-dapples scattered over the flank, each
// independently drifting a few millimeters and breathing in opacity like
// dappled sunlight moving through a leaf canopy — kit.js has no "drifting
// surface decal" primitive, so this is a small custom helper.

import * as THREE from 'three';
import { seededRandom } from '../../core/rng.js';
import * as kitDefault from '../kit.js';

// Living light-spots: several small glow discs on the body's surface, each
// independently bobbing/fading — "sun through leaves" made literal and
// self-driving. Not a kit.js primitive; a bespoke per-model fx object.
function driftingDapples(parent, spots, m) {
  const items = spots.map(([x, y, z, s, seed]) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(s, 8), m.clone());
    mesh.position.set(x, y, z + 0.001);
    mesh.rotation.y = Math.PI; // face outward from the flank
    parent.add(mesh);
    return { mesh, x, y, z, phase: (seed * 4001) % (Math.PI * 2), sp: 0.3 + (seed % 5) * 0.08 };
  });
  let t = 0;
  function update(dt) {
    t += dt;
    for (const it of items) {
      const w = Math.sin(t * it.sp + it.phase);
      it.mesh.position.y = it.y + w * 0.012;
      it.mesh.position.x = it.x + Math.cos(t * it.sp * 0.7 + it.phase) * 0.008;
      it.mesh.material.opacity = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * it.sp * 1.6 + it.phase));
    }
  }
  // parts.fx entries only need `.update(dt)` (animator.js never touches a
  // group on fx items, unlike accents/wings) — the dapple meshes are
  // already parented directly to `parent` above, so no group to return.
  return { update };
}

export function build_dapplyn(kit = kitDefault) {
  const pal = kit.palette(['bloom']);
  const skin = kit.mat(0x9a6f45, { rough: 0.65 });   // honey-brown fawn fur
  const cream = kit.mat(0xf1e3c8, { rough: 0.6 });
  const dappleMat = kit.mat(pal.eye, { unlit: true, transparent: true, opacity: 0.7, side: THREE.DoubleSide });

  const root = new THREE.Group();

  const body = kit.capsule(0.13, 0.28, skin, { capSeg: 4, radSeg: 9 });
  body.geometry.rotateZ(Math.PI / 2);
  root.add(body);
  body.position.y = 0.42;

  const bellyPatch = kit.capsule(0.08, 0.2, cream, { capSeg: 3, radSeg: 7 });
  bellyPatch.geometry.rotateZ(Math.PI / 2);
  bellyPatch.scale.set(0.6, 0.55, 1);
  kit.at(body, bellyPatch, 0, -0.08, 0);

  const head = kit.at(body, kit.orb(0.1, skin, { sz: 1.1, sy: 0.88 }), 0, 0.1, 0.2);
  const eyeL = kit.at(head, kit.eye(0.042, { irisColor: 0x2a1a10, skinColor: 0x9a6f45, glintSize: 0.016 }), 0.075, 0.01, 0.08, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.042, { irisColor: 0x2a1a10, skinColor: 0x9a6f45, glintSize: 0.016 }), -0.075, 0.01, 0.08, { ry: -0.35 });
  const earL = kit.at(head, kit.ear(0.08, skin, { floppy: true }), 0.08, 0.06, -0.02, { rz: 0.4 });
  const earR = kit.at(head, kit.ear(0.08, skin, { floppy: true }), -0.08, 0.06, -0.02, { rz: -0.4 });

  // --- Legs: four long, slim, graceful legs. ---
  const legDefs = [
    [0.09, 0.32, 0.12], [-0.09, 0.32, 0.12],
    [0.09, 0.32, -0.11], [-0.09, 0.32, -0.11],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.36, skin, { thighR: 0.04, shinR: 0.028, footLen: 0.075 }), x, y, z));

  const tail = kit.at(body, kit.tailChain(2, skin, { segLen: 0.04, startR: 0.028, endR: 0.014 }), 0, 0.06, -0.15);

  // Living light-spots scattered across the flank and back — the model's
  // signature detail, drifting and breathing on their own.
  const rng = seededRandom(140);
  const spotDefs = [];
  for (let i = 0; i < 9; i++) {
    const along = rng();
    spotDefs.push([
      (rng() - 0.5) * 0.18,
      -0.02 + rng() * 0.1,
      -0.13 + along * 0.24,
      0.012 + rng() * 0.01,
      i + 1,
    ]);
  }
  const dapples = driftingDapples(body, spotDefs, dappleMat);

  const spark = kit.heartspark(0.036, pal.eye, { seed: 141 });
  kit.at(body, spark, 0, 0.02, 0.1);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR],
      fx: [dapples, spark],
    },
    hints: {
      personality: 'calm',
      locomotion: 'quad',
      breathAmp: 0.85,
      blinkEvery: 3.6,
    },
  };
}
