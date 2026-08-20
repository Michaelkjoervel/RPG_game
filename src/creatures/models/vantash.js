// =============================================================================
// VANTASH — Umbra, stage 1 (single-stage), rare.
// "Lithe void-panther, used by Order elites; its tail ends in a hook of
// dark." (Design Bible §4)
// =============================================================================
// A sleek predator quadruped: long low body, small alert ears, faint
// umbra-violet glow along the spine and eyes. The signature feature is the
// tail's tip — a `kit.horn()` bent into a hooked claw shape, fused
// backward onto the last tailChain pivot so the whole hook still rides the
// animator's tail-wave motion. `hints.personality:'regal'` (an elite's
// mount, not a feral beast) gives it a composed, unhurried idle rather than
// a twitchy predator stance.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

export function build_vantash(kit = kitDefault) {
  const pal = kit.palette(['umbra']);
  // Void-panther fur lifted to a readable dark violet-slate — vertex-gradient
  // painted (near-void under, dusk-lit spine) so the cat is a shaded volume,
  // never a black blob.
  const fur = kit.mat(0xffffff, { vertexColors: true, rough: 0.4, emissive: 0x262042, emissiveIntensity: 0.45 });
  const FUR_LO = 0x3a3158, FUR_HI = 0x8478ac;
  const paint = (mesh, seed, jit = 0) => {
    if (jit) jitterGeometry(mesh.geometry, jit, seed);
    applyVertexGradient(mesh.geometry, { from: FUR_LO, to: FUR_HI, noise: 0.035, seed });
    return mesh;
  };
  const furPlain = kit.mat(0x5e5484, { rough: 0.4, emissive: 0x262042, emissiveIntensity: 0.5 });
  const furLight = kit.mat(0x776b9e, { rough: 0.42 });
  const glowMat = kit.mat(0x9a7fd8, { unlit: true, transparent: true, opacity: 0.75 });

  const root = new THREE.Group();

  // Lithe torso lying nose-to-tail along Z — the capsule's axis swing is baked
  // about X. (About Z would put the long axis on X and lay the panther
  // broadside to the view.) Torso height follows the leg length below so the
  // paws reach the ground rather than dangling inside the barrel.
  const body = kit.capsule(0.125, 0.42, fur, { capSeg: 5, radSeg: 10 });
  body.geometry.rotateX(Math.PI / 2);
  paint(body, 160);
  root.add(body);
  body.position.y = 0.46;

  // A stalking cat's mass: deep chest, round haunches, standing scapulae.
  kit.at(body, paint(kit.orb(0.145, fur, { sy: 1.02, sz: 0.9 }), 165, 0.006), 0, -0.015, 0.2);
  kit.at(body, paint(kit.orb(0.115, fur, { sy: 1.15 }), 166, 0.005), 0.06, 0.01, -0.19);
  kit.at(body, paint(kit.orb(0.115, fur, { sy: 1.15 }), 167, 0.005), -0.06, 0.01, -0.19);
  kit.at(body, paint(kit.orb(0.065, fur, { sy: 1.3, sz: 0.75 }), 168), 0.07, 0.1, 0.16, { rz: -0.3 });
  kit.at(body, paint(kit.orb(0.065, fur, { sy: 1.3, sz: 0.75 }), 169), -0.07, 0.1, 0.16, { rz: 0.3 });

  // Faint void-glow stripe down the spine, plus a subtle glow seam along
  // each flank so the silhouette edge reads even in deep shadow. All three run
  // nose-to-tail with the body, and all three sit ON its surface (spine at
  // y=+r; flank seams where the capsule is widest) or they never show at all.
  const spineGlow = kit.capsule(0.02, 0.32, glowMat, { capSeg: 3, radSeg: 6 });
  spineGlow.geometry.rotateX(Math.PI / 2);
  kit.at(body, spineGlow, 0, 0.125, 0);
  const seamMat = kit.mat(0x9a7fd8, { unlit: true, transparent: true, opacity: 0.35 });
  for (const sx of [1, -1]) {
    const seam = kit.capsule(0.008, 0.26, seamMat, { capSeg: 3, radSeg: 5 });
    seam.geometry.rotateX(Math.PI / 2);
    kit.at(body, seam, sx * 0.122, 0.04, 0);
  }

  const head = kit.at(body, paint(kit.blob(0.115, fur, { seed: 160, squash: { x: 0.9, y: 0.85, z: 1.15 } }), 161), 0, 0.08, 0.32);
  const eyeL = kit.at(head, kit.eye(0.034, { irisColor: 0xc8b0ff, scleraColor: 0x120e1c, skinColor: 0x5e5484, glintSize: 0.014 }), 0.07, 0.02, 0.09, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.034, { irisColor: 0xc8b0ff, scleraColor: 0x120e1c, skinColor: 0x5e5484, glintSize: 0.014 }), -0.07, 0.02, 0.09, { ry: -0.35 });
  const earL = kit.at(head, paint(kit.ear(0.055, fur), 162), 0.07, 0.08, -0.01, { rz: 0.2 });
  const earR = kit.at(head, paint(kit.ear(0.055, fur), 163), -0.07, 0.08, -0.01, { rz: -0.2 });

  const muzzle = kit.at(head, kit.orb(0.05, furLight, { sz: 1.15, sy: 0.7 }), 0, -0.04, 0.1);
  kit.at(muzzle, kit.fang(0.03, kit.mat(0xece6f0, { rough: 0.3 })), 0.02, -0.015, 0.02, { rz: 0.1 });
  kit.at(muzzle, kit.fang(0.03, kit.mat(0xece6f0, { rough: 0.3 })), -0.02, -0.015, 0.02, { rz: -0.1 });

  // Hips sit just under the belly (local Y is measured from the torso centre);
  // kit.leg(0.3) drops 0.327 from there, planting the paws on y=0. Fore/hind
  // pairs stand under the shoulders and haunches of the 0.31 half-length.
  const legDefs = [
    [0.11, -0.133, 0.22], [-0.11, -0.133, 0.22],
    [0.11, -0.133, -0.22], [-0.11, -0.133, -0.22],
  ];
  const legs = legDefs.map(([x, y, z], i) => {
    const l = kit.at(body, kit.leg(0.3, fur, { thighR: 0.055, shinR: 0.04, footLen: 0.09, footMat: furPlain }), x, y, z);
    for (const c of l.hip.children) if (c.isMesh && c.geometry) paint(c, 170 + i);
    for (const c of l.knee.children) if (c.isMesh && c.geometry && c !== l.foot) paint(c, 174 + i);
    return l;
  });

  // Long tail carried in a rising curve, ending in the HOOK OF DARK — a
  // solid void-black crescent with a glowing edge seam, big enough to be the
  // second thing the eye finds after the eyes.
  const tail = kit.at(body, kit.tailChain(7, fur, { segLen: 0.09, startR: 0.042, endR: 0.013 }), 0, 0.07, -0.32);
  tail.pivots.forEach((p, i) => {
    p.rotation.x = i === 0 ? 0.5 : (i < 4 ? 0.1 : -0.05);
    for (const c of p.children) if (c.isMesh && c.geometry && c.geometry.attributes) paint(c, 178 + i);
  });
  const hookTip = tail.pivots[tail.pivots.length - 1];
  const hook = kit.at(hookTip, kit.horn(0.16, kit.mat(0x1c1730, { rough: 0.3 }), { baseR: 0.03, tipR: 0.006, bend: 1.3 }), 0, 0, -0.07, { rx: -Math.PI / 2 - 0.3 });
  kit.at(hook, kit.horn(0.15, glowMat, { baseR: 0.012, tipR: 0.003, bend: 1.3 }), 0.014, 0.005, 0);

  const spark = kit.heartspark(0.036, pal.eye, { seed: 161 });
  kit.at(body, spark, 0, 0.02, 0.12);

  const grounded = kit.groundPlant(root);
  // Soft contact shadow so the creature reads planted on any ground.
  const contact = kit.shadowDisc(0.32, 0.32);
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
      accents: [earL, earR, hook],
      fx: [spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.85,
      blinkEvery: 3.6,
    },
  };
}
