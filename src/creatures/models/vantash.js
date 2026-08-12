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

export function build_vantash(kit = kitDefault) {
  const pal = kit.palette(['umbra']);
  // Void-panther fur lifted to a readable dark violet-slate (~10% albedo +
  // faint violet self-glow) — sleek and shadowy, but never a black blob.
  const fur = kit.mat(0x5e5484, { rough: 0.4, emissive: 0x262042, emissiveIntensity: 0.5 });
  const furLight = kit.mat(0x776b9e, { rough: 0.42 });
  const glowMat = kit.mat(0x9a7fd8, { unlit: true, transparent: true, opacity: 0.75 });

  const root = new THREE.Group();

  const body = kit.capsule(0.13, 0.36, fur, { capSeg: 5, radSeg: 9 });
  body.geometry.rotateZ(Math.PI / 2);
  root.add(body);
  body.position.y = 0.3;

  // Faint void-glow stripe down the spine, plus a subtle glow seam along
  // each flank so the silhouette edge reads even in deep shadow.
  const spineGlow = kit.capsule(0.02, 0.32, glowMat, { capSeg: 3, radSeg: 6 });
  spineGlow.geometry.rotateZ(Math.PI / 2);
  kit.at(body, spineGlow, 0, 0.11, 0);
  const seamMat = kit.mat(0x9a7fd8, { unlit: true, transparent: true, opacity: 0.35 });
  for (const sx of [1, -1]) {
    const seam = kit.capsule(0.008, 0.26, seamMat, { capSeg: 3, radSeg: 5 });
    seam.geometry.rotateZ(Math.PI / 2);
    kit.at(body, seam, sx * 0.115, 0.045, 0);
  }

  const head = kit.at(body, kit.blob(0.115, fur, { seed: 160, squash: { x: 0.9, y: 0.85, z: 1.15 } }), 0, 0.06, 0.28);
  const eyeL = kit.at(head, kit.eye(0.034, { irisColor: 0xc8b0ff, scleraColor: 0x120e1c, skinColor: 0x5e5484, glintSize: 0.014 }), 0.07, 0.02, 0.09, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.034, { irisColor: 0xc8b0ff, scleraColor: 0x120e1c, skinColor: 0x5e5484, glintSize: 0.014 }), -0.07, 0.02, 0.09, { ry: -0.35 });
  const earL = kit.at(head, kit.ear(0.055, fur), 0.07, 0.08, -0.01, { rz: 0.2 });
  const earR = kit.at(head, kit.ear(0.055, fur), -0.07, 0.08, -0.01, { rz: -0.2 });

  const muzzle = kit.at(head, kit.orb(0.05, furLight, { sz: 1.15, sy: 0.7 }), 0, -0.04, 0.1);
  kit.at(muzzle, kit.fang(0.03, kit.mat(0xece6f0, { rough: 0.3 })), 0.02, -0.015, 0.02, { rz: 0.1 });
  kit.at(muzzle, kit.fang(0.03, kit.mat(0xece6f0, { rough: 0.3 })), -0.02, -0.015, 0.02, { rz: -0.1 });

  const legDefs = [
    [0.11, 0.24, 0.18], [-0.11, 0.24, 0.18],
    [0.11, 0.24, -0.16], [-0.11, 0.24, -0.16],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.3, fur, { thighR: 0.055, shinR: 0.04, footLen: 0.09 }), x, y, z));

  // Long tail ending in a hooked, claw-like tip of solidified dark.
  const tail = kit.at(body, kit.tailChain(6, fur, { segLen: 0.09, startR: 0.045, endR: 0.014 }), 0, 0.06, -0.19);
  const hookTip = tail.pivots[tail.pivots.length - 1];
  const hook = kit.at(hookTip, kit.horn(0.09, glowMat, { baseR: 0.018, tipR: 0.004, bend: 1.1 }), 0, 0, -0.09, { rx: -Math.PI / 2 });

  const spark = kit.heartspark(0.036, pal.eye, { seed: 161 });
  kit.at(body, spark, 0, 0.02, 0.12);

  return {
    group: kit.groundPlant(root),
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
