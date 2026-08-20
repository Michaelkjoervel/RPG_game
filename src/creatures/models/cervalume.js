// =============================================================================
// CERVALUME — Lumen/Bloom, stage 2 (Dapplyn awakens at a Shrine).
// "Radiant deer, antlers of hard light, hooves leave glowing blossoms.
// Awakens only where shardlight pools." (Design Bible §4)
// =============================================================================
// Dapplyn grown into full radiance: the same graceful fawn proportions and
// gentle temperament, but adult-sized with pale gold-cream fur and the
// bible's signature "antlers of hard light" — a branching antler structure
// built the same way sylvathorn.js branches its bark antlers, but in an
// unlit, translucent, glowing material instead of solid bark. "Hooves leave
// glowing blossoms" becomes small emissive petal blooms resting at each
// footfall.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_cervalume(kit = kitDefault) {
  const pal = kit.palette(['lumen', 'bloom']);
  // Radiant coat: vertex gradient from warm fawn-gold under-body to near-
  // ivory along the spine, so the deer shades as morning light, not plastic.
  const skin = kit.mat(0xffffff, { vertexColors: true, rough: 0.45 });
  const COAT_LO = 0xc2a26c, COAT_HI = 0xfdf6e0;
  const paint = (mesh, seed, jit = 0) => {
    if (jit) jitterGeometry(mesh.geometry, jit, seed);
    applyVertexGradient(mesh.geometry, { from: COAT_LO, to: COAT_HI, noise: 0.035, seed });
    return mesh;
  };
  const hoofMat = kit.mat(0xd8b46a, { rough: 0.4, emissive: 0xa87c28, emissiveIntensity: 0.6 });
  const lightMat = kit.mat(0xffda80, { unlit: true, transparent: true, opacity: 0.85 }); // hard-light glow tips
  // Solid saturated gold core — pale-cream antlers vanished against a pale
  // coat and a bright sky; this reads as METAL LIGHT at any distance.
  const lightCore = kit.mat(0xf0a83a, { rough: 0.3, metal: 0.1, emissive: 0xc87818, emissiveIntensity: 0.85 });
  const bloomMat = kit.mat(pal.secondary, { unlit: true, transparent: true, opacity: 0.85 });

  const root = new THREE.Group();

  // Deer torso lying nose-to-tail along Z — the capsule's axis swing is baked
  // about X (about Z would lay the doe sideways across the view). Torso height
  // is tied to the leg length below so the hooves reach the ground.
  const body = kit.capsule(0.17, 0.4, skin, { capSeg: 5, radSeg: 9 });
  body.geometry.rotateX(Math.PI / 2);
  paint(body, 150, 0.005);
  root.add(body);
  body.position.y = 0.66;

  // Deer chest + haunch mass so the barrel isn't a pipe.
  kit.at(body, paint(kit.orb(0.175, skin, { sy: 1.05, sz: 0.9 }), 154, 0.007), 0, -0.02, 0.2);
  kit.at(body, paint(kit.orb(0.16, skin, { sy: 1.08, sz: 0.95 }), 155, 0.007), 0, -0.01, -0.22);

  const head = kit.at(body, paint(kit.blob(0.13, skin, { seed: 150, squash: { x: 0.85, y: 0.9, z: 1.3 } }), 156), 0, 0.2, 0.3);
  const eyeL = kit.at(head, kit.eye(0.042, { irisColor: 0x3a2c14, skinColor: 0xe8dcc0, glintSize: 0.016 }), 0.078, 0.01, 0.1, { ry: 0.3 });
  const eyeR = kit.at(head, kit.eye(0.042, { irisColor: 0x3a2c14, skinColor: 0xe8dcc0, glintSize: 0.016 }), -0.078, 0.01, 0.1, { ry: -0.3 });
  const earL = kit.at(head, paint(kit.ear(0.075, skin, { floppy: true }), 157), 0.085, 0.09, -0.02, { rz: 0.35 });
  const earR = kit.at(head, paint(kit.ear(0.075, skin, { floppy: true }), 158), -0.085, 0.09, -0.02, { rz: -0.35 });

  // Branching hard-light antlers: a SOLID emissive-gold core horn (survives
  // a silhouette test) wearing a translucent additive glow shell, branches
  // grafted the same way sylvathorn.js does its bark rack.
  const antlerAccents = [];
  const A_LEN = 0.42, A_BEND = 0.4;
  for (const side of [1, -1]) {
    const main = kit.horn(A_LEN, lightCore, { bend: side * A_BEND, baseR: 0.048, tipR: 0.012 });
    const mainAt = kit.at(head, main, side * 0.07, 0.11, -0.01, { rz: -side * 0.55, ry: side * 0.1, rx: -0.15 });
    antlerAccents.push(mainAt);
    for (const [t, s] of [[0.34, 0.78], [0.62, 0.55]]) {
      const bLen = 0.26 * s;
      const branch = kit.horn(bLen, lightCore, { bend: side * 0.5, baseR: 0.024, tipR: 0.007 });
      const bAt = kit.at(mainAt, branch, side * A_BEND * t * t * A_LEN, A_LEN * t, 0, { rz: side * -0.8, ry: side * 0.4 });
      kit.at(bAt, kit.orb(0.02, lightMat.clone()), side * 0.5 * bLen * 0.4, bLen, 0);
    }
    kit.at(mainAt, kit.orb(0.026, lightMat.clone()), side * A_BEND * A_LEN, A_LEN, 0);
  }

  // --- Legs: four long, elegant legs — grown from Dapplyn's fawn stance. ---
  // Hip Y is local to the torso: just under the belly (-0.151 ≈ -radius), from
  // where kit.leg(0.5) drops 0.509 to the hoof — hooves land on y=0. Fore and
  // hind pairs sit under the shoulders/haunches of the 0.37 torso half-length.
  const legDefs = [
    [0.13, -0.151, 0.25], [-0.13, -0.151, 0.25],
    [0.13, -0.151, -0.24], [-0.13, -0.151, -0.24],
  ];
  const legs = legDefs.map(([x, y, z], i) => {
    const l = kit.at(body, kit.leg(0.5, skin, { thighR: 0.055, shinR: 0.038, footLen: 0.09, footMat: hoofMat }), x, y, z);
    for (const c of l.hip.children) if (c.isMesh && c.geometry) paint(c, 160 + i);
    for (const c of l.knee.children) if (c.isMesh && c.geometry && c !== l.foot) paint(c, 164 + i);
    return l;
  });

  // Glowing blossoms resting at each footfall — hooves that leave light
  // behind them.
  const blossoms = legs.map((l, i) => {
    const p = kit.at(l.foot, kit.petal(0.08, bloomMat.clone(), { width: 0.07 }), 0, -0.018, 0.02, { rx: -Math.PI / 2, ry: i * 1.7 });
    kit.at(l.foot, kit.orb(0.05, kit.mat(0xfff2c8, { unlit: true, additive: true, opacity: 0.4 }), { sy: 0.12 }), 0, -0.02, 0.01);
    return p;
  });

  const tail = kit.at(body, kit.tailChain(2, skin, { segLen: 0.05, startR: 0.03, endR: 0.014 }), 0, 0.12, -0.34);
  tail.pivots.forEach((p, i) => {
    for (const c of p.children) if (c.isMesh && c.geometry && c.geometry.attributes) paint(c, 168 + i);
  });

  // A slow, calm drift of gold-green light motes about the shoulders.
  const glow = kit.mote(10, { color: 0xfff2c8, size: 0.02, radius: 0.3, height: 0.3, speed: 0.3, seed: 151 });
  kit.at(body, glow, 0, 0.15, 0.1);

  const spark = kit.heartspark(0.05, 0xfff2c8, { seed: 152 });
  kit.at(body, spark, 0, 0.05, 0.22);

  const grounded = kit.groundPlant(root);
  // Soft contact shadow so the creature reads planted on any ground.
  const contact = kit.shadowDisc(0.4, 0.32);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, ...antlerAccents],
      fx: [glow, spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.7,
      blinkEvery: 4.6,
    },
  };
}
