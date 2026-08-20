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
// `side` is +1 (right flank) / -1 (left flank): the disc is placed ON the
// torso's surface and turned to face outward along X, so the spots actually
// read against the silhouette instead of being swallowed by the capsule they
// decorate. They drift ALONG the flank (y/z), never through it (x).
function driftingDapples(parent, spots, m) {
  const items = spots.map(([x, y, z, s, seed, side]) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(s, 8), m.clone());
    mesh.position.set(x + side * 0.002, y, z);
    mesh.rotation.y = side * Math.PI / 2; // face outward from the flank
    parent.add(mesh);
    return { mesh, x, y, z, phase: (seed * 4001) % (Math.PI * 2), sp: 0.3 + (seed % 5) * 0.08 };
  });
  let t = 0;
  function update(dt) {
    t += dt;
    for (const it of items) {
      const w = Math.sin(t * it.sp + it.phase);
      it.mesh.position.y = it.y + w * 0.012;
      it.mesh.position.z = it.z + Math.cos(t * it.sp * 0.7 + it.phase) * 0.01;
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
  const dappleMat = kit.mat(0xffedb8, { unlit: true, transparent: true, opacity: 0.85, side: THREE.DoubleSide });

  const root = new THREE.Group();

  // Fawn torso running nose-to-tail along Z (bake about X — about Z would put
  // the long axis on X and lay the fawn sideways). Torso height follows the
  // leg length so the slim legs actually reach the ground.
  const body = kit.capsule(0.125, 0.34, skin, { capSeg: 4, radSeg: 9 });
  body.geometry.rotateX(Math.PI / 2);
  // Honey-brown belly deepening to a russet back — dappled-light fawn fur.
  kit.paint(body, { from: 0x7a5432 , to: 0xc79a68, noise: 0.06, seed: 140 });
  root.add(body);
  body.position.y = 0.42;

  const bellyPatch = kit.capsule(0.08, 0.26, cream, { capSeg: 3, radSeg: 7 });
  bellyPatch.geometry.rotateX(Math.PI / 2);
  bellyPatch.scale.set(0.6, 0.55, 1);
  kit.at(body, bellyPatch, 0, -0.08, 0);

  const head = kit.at(body, kit.orb(0.095, skin, { sz: 1.05, sy: 0.92 }), 0, 0.12, 0.19, { rx: 0.06 });
  kit.paint(head, { from: 0x8a6038, to: 0xc79a68, noise: 0.05, seed: 141 });
  // A soft fawn muzzle with a dark nose-dot.
  kit.at(head, kit.snout(0.085, cream.clone(), { r: 0.04, taper: 0.4, up: 0.12 }), 0, -0.035, 0.055);
  kit.at(head, kit.orb(0.014, kit.mat(0x3a2a1c, { rough: 0.4 })), 0, -0.012, 0.135);
  const eyeL = kit.at(head, kit.eye(0.045, { irisColor: 0x2a1a10, skinColor: 0x9a6f45, glintSize: 0.017 }), 0.068, 0.02, 0.072, { ry: 0.25 });
  const eyeR = kit.at(head, kit.eye(0.045, { irisColor: 0x2a1a10, skinColor: 0x9a6f45, glintSize: 0.017 }), -0.068, 0.02, 0.072, { ry: -0.25 });
  const earL = kit.at(head, kit.ear(0.09, skin, { floppy: true }), 0.08, 0.06, -0.02, { rz: 0.5 });
  const earR = kit.at(head, kit.ear(0.09, skin, { floppy: true }), -0.08, 0.055, -0.02, { rz: -0.62 });

  // --- Legs: four slim but REAL legs (the old 0.36 stilts read as a wooden
  // toy). Hips hang just under the belly; kit.leg(0.3) drops ~0.319 from
  // there, planting the hooves on y=0 with the body at 0.42. ---
  const legDefs = [
    [0.085, -0.101, 0.19], [-0.085, -0.101, 0.19],
    [0.085, -0.101, -0.19], [-0.085, -0.101, -0.19],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.3, skin, { thighR: 0.048, shinR: 0.032, footLen: 0.07 }), x, y, z));

  const tail = kit.at(body, kit.tailChain(2, skin, { segLen: 0.04, startR: 0.028, endR: 0.014 }), 0, 0.07, -0.27);

  // Living light-spots scattered across the flank and back — the model's
  // signature detail, drifting and breathing on their own.
  const rng = seededRandom(140);
  const spotDefs = [];
  for (let i = 0; i < 10; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const y = -0.03 + rng() * 0.1;
    // Sit exactly on the torso's surface for this height: the capsule's
    // half-width at height y is sqrt(r^2 - y^2) (r = 0.125).
    const x = side * Math.sqrt(Math.max(0.0156 - y * y, 0.0016));
    spotDefs.push([x, y, -0.15 + rng() * 0.3, 0.02 + rng() * 0.013, i + 1, side]);
  }
  const dapples = driftingDapples(body, spotDefs, dappleMat);

  const spark = kit.heartspark(0.036, pal.eye, { seed: 141 });
  kit.at(body, spark, 0, 0.02, 0.1);

  root.add(kit.shadowDisc(0.3, 0.36));

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
