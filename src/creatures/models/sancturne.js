// =============================================================================
// SANCTURNE — Lumen/Umbra, stage 1 (single-stage), rare.
// "Ghost bound to a cracked reliquary urn, keeper of the Ruins' oldest
// trial." (Design Bible §4)
// =============================================================================
// Rebuilt for the visual overhaul around the lumen/umbra duality: a heavy,
// leaning stone reliquary urn (violet-slate, vertex-gradient painted, gold
// crack-seams leaking light) with the keeper itself pouring out of the mouth
// as a hooded figure of pale light. Three shapes carry the silhouette:
//   1. THE URN — big, tilted a few degrees (nothing this old stands square),
//      carved gold band at the shoulder, cracks glowing from inside.
//   2. THE KEEPER — a hooded wisp torso arcing up-forward out of the neck,
//      trailing sleeve-fins and tendrils that pour BACK INTO the urn, so the
//      binding is visible at a glance.
//   3. THE BROKEN HALO — its signature: a shattered ring of shard-gold light
//      floating behind the hood, one arc missing (the Ruins' oldest trial is
//      not finished). Slowly counter-rotates via a tiny fx entry.
// parts.body is the ghost torso (breath/hover), the urn stays planted.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_sancturne(kit = kitDefault) {
  const pal = kit.palette(['lumen', 'umbra']);
  const stoneV = kit.mat(0xffffff, { vertexColors: true, rough: 0.62 });
  const URN_LO = 0x322b48, URN_HI = 0x8d81a8;
  const goldMat = kit.mat(0xffe9b0, { unlit: true, transparent: true, opacity: 0.95 });
  const goldSoft = kit.mat(0xffd98c, { unlit: true, transparent: true, opacity: 0.8 });
  // Ghost-stuff is UNLIT but NOT additive: additive over a lit stage blows
  // out to a white blob; straight alpha keeps the violet->pale gradient.
  const wispMat = kit.mat(0xbcaee8, { unlit: true, transparent: true, opacity: 0.68, side: THREE.DoubleSide });
  const wispVert = kit.mat(0xffffff, { unlit: true, transparent: true, opacity: 0.88, vertexColors: true, side: THREE.DoubleSide });
  const hoodMat = kit.mat(0xffffff, { vertexColors: true, rough: 0.5, transparent: true, opacity: 0.92 });

  const root = new THREE.Group();

  // --- The reliquary urn: heavy, old, leaning ----------------------------
  const urnGroup = new THREE.Group(); urnGroup.name = 'urn';
  root.add(urnGroup);
  urnGroup.rotation.z = 0.07;                                     // ancient lean
  const urn = kit.bulb(stoneV, { height: 0.62, width: 0.36, neck: 0.34, segments: 14 });
  jitterGeometry(urn.geometry, 0.014, 5);
  applyVertexGradient(urn.geometry, { from: URN_LO, to: URN_HI, noise: 0.05, seed: 5 });
  urnGroup.add(urn);
  // Carved shoulder band + lip ring in worn gold.
  const band = kit.orb(0.3, goldSoft.clone(), { sy: 0.06 });
  kit.at(urn, band, 0, 0.4, 0);
  const lip = kit.orb(0.15, goldSoft.clone(), { sy: 0.05 });
  kit.at(urn, lip, 0, 0.62, 0);
  // Glowing cracks — light escaping the reliquary.
  const crackDefs = [
    [0.24, 0.24, 0.17, 0.03, 0.36, 0.5, 0.12],
    [-0.23, 0.17, -0.17, 0.024, 0.28, -0.7, -0.14],
    [0.07, 0.12, 0.29, 0.026, 0.32, 0.1, 0.3],
  ];
  const cracks = [];
  for (const [x, y, z, w, len, ry, rz] of crackDefs) {
    const c = kit.box(w, len, 0.008, goldMat.clone());
    kit.at(urn, c, x, y, z, { ry, rz });
    cracks.push(c);
  }
  // A little rubble of the same stone at the base plants it.
  for (const [x, z, r, seed] of [[0.26, 0.1, 0.05, 21], [-0.22, -0.14, 0.04, 22], [0.1, -0.26, 0.035, 23]]) {
    const peb = kit.blob(r, stoneV, { seed, noise: 0.25 });
    applyVertexGradient(peb.geometry, { from: URN_LO, to: 0x6e6390, noise: 0.06, seed });
    kit.at(root, peb, x, r * 0.7, z);
  }

  // --- The keeper: hooded figure of light pouring from the mouth ----------
  // body leans forward out of the urn's neck: the ghost ARCS, it doesn't
  // stack. Authored as a child of root (not the urn) so the urn's lean stays
  // its own; the hover bob acts on this torso alone.
  const body = kit.blob(0.17, wispVert, { seed: 151, noise: 0.2, squash: { x: 0.88, y: 1.3, z: 0.82 } });
  applyVertexGradient(body.geometry, { from: 0x554687, to: 0xd9cfff, noise: 0.05, seed: 151, exp: 0.85 });
  kit.at(root, body, 0.02, 0.86, 0.08, { rx: 0.22 });
  // Inner core glow so the torso has a bright heart.
  kit.at(body, kit.orb(0.06, kit.mat(0xf2ecff, { unlit: true, transparent: true, opacity: 0.55 })), 0, 0.02, 0.05);

  // Hooded head: a solid-enough cowl (readable at distance) over a dark void
  // face with bright gold eyes.
  const head = kit.blob(0.105, hoodMat, { seed: 152, noise: 0.08, squash: { x: 0.95, y: 1.1, z: 1.0 } });
  applyVertexGradient(head.geometry, { from: 0x2f2850, to: 0x9c90c4, noise: 0.04, seed: 152 });
  kit.at(body, head, 0, 0.2, 0.05, { rx: -0.1 });
  const faceVoid = kit.orb(0.075, kit.mat(0x17122a, { rough: 0.9 }), { sz: 0.6 });
  kit.at(head, faceVoid, 0, -0.005, 0.055);
  // Hood peak drooping back.
  const peak = kit.cone(0.05, 0.14, hoodMat, { segments: 7 });
  applyVertexGradient(peak.geometry, { from: 0x4c4174, to: 0x9c90c4, noise: 0.04, seed: 153 });
  kit.at(head, peak, 0, 0.06, -0.045, { rx: 0.85 });

  const eyeL = kit.at(head, kit.eye(0.026, { irisColor: 0xffe9b0, scleraColor: 0x241f3a, skinColor: 0x554b7a, glintSize: 0.011 }), 0.045, 0.0, 0.085, { ry: 0.2 });
  const eyeR = kit.at(head, kit.eye(0.026, { irisColor: 0xffe9b0, scleraColor: 0x241f3a, skinColor: 0x554b7a, glintSize: 0.011 }), -0.045, 0.0, 0.085, { ry: -0.2 });

  // Sleeve-arms: two long fin blades drooping forward like robed arms held
  // over the urn it guards.
  const sleeveL = kit.at(body, kit.fin(0.28, wispMat, { width: 0.16, curve: 0.3 }), 0.13, 0.04, 0.08, { rz: -1.75, ry: 0.4 });
  const sleeveR = kit.at(body, kit.fin(0.28, wispMat, { width: 0.16, curve: 0.3 }), -0.13, 0.04, 0.08, { rz: Math.PI + 1.75, ry: -0.4 });

  // --- THE BROKEN HALO ----------------------------------------------------
  // Two arcs of a ring behind the hood with a bite missing; a faint second
  // ring turns slowly the other way. Torus arcs lie in the XY plane already —
  // exactly the "behind the head" plane a halo wants.
  const halo = new THREE.Group(); halo.name = 'halo';
  kit.at(body, halo, 0, 0.26, -0.08);
  const arc1 = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 22, Math.PI * 1.35), goldMat.clone());
  arc1.rotation.z = 0.5;
  halo.add(arc1);
  const arc2 = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 10, Math.PI * 0.4), goldMat.clone());
  arc2.rotation.z = -1.35;
  halo.add(arc2);
  const haloOuter = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.006, 5, 26, Math.PI * 1.7), goldSoft.clone());
  haloOuter.material.opacity = 0.4;
  halo.add(haloOuter);
  let haloT = 0;
  const haloSpin = {
    update(dt) {
      haloT += dt;
      haloOuter.rotation.z = -haloT * 0.35;
      const p = 0.75 + 0.25 * Math.sin(haloT * 1.6);
      arc1.material.opacity = 0.75 * p + 0.2;
      arc2.material.opacity = 0.75 * p + 0.2;
      for (const c of cracks) c.material.opacity = 0.55 + 0.4 * Math.sin(haloT * 1.1 + 1.7) * 0.5 + 0.2;
    },
  };

  // --- Tendrils pouring back into the urn ---------------------------------
  // Three wisp chains from the torso's skirt, posed to drape DOWN toward the
  // urn mouth — the visible binding.
  const tendrilDefs = [[0.07, 0.02, -0.3], [-0.07, 0.0, -0.5], [0, -0.05, -0.7]];
  const tendrils = tendrilDefs.map(([x, z, bend], i) => {
    const chain = kit.tailChain(5, wispMat, { segLen: 0.06, startR: 0.036, endR: 0.005 });
    kit.at(body, chain, x, -0.16, z, { rx: -Math.PI / 2 + bend });
    chain.pivots.forEach((p, j) => { if (j > 0) p.rotation.x = 0.22; });
    return chain;
  });

  const auraMotes = kit.mote(10, { color: 0xd8ccff, size: 0.02, radius: 0.3, height: 0.32, speed: 0.28, seed: 152 });
  kit.at(body, auraMotes, 0, 0.05, 0);
  const goldRise = kit.mote(6, { color: 0xffe9b0, size: 0.016, radius: 0.14, height: 0.4, speed: 0.4, seed: 154 });
  kit.at(urnGroup, goldRise, 0, 0.5, 0);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tendrils[0].pivots,
      accents: [sleeveL, sleeveR, tendrils[1].group, tendrils[2].group, halo],
      fx: [auraMotes, goldRise, haloSpin],
    },
    hints: {
      personality: 'calm',
      locomotion: 'float',
      hover: true,
      hoverAmp: 0.06,
      breathAmp: 1.05,
      blinkEvery: 4.4,
    },
  };
}
