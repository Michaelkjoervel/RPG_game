// =============================================================================
// REVERBANE — Gale/Umbra, stage 2 (Sonark awakens at L23).
// "Sleek sound-wraith bat, wings ripple with visible echo-rings." (Design Bible §4)
// =============================================================================
// Visual-overhaul rebuild. What carries it:
//   1. RAISED WING V: two 3-boned membranes swept up and out — the whole
//      silhouette is wingspan, the body just a sleek dart hung between them.
//      Membranes are vertex-gradient painted (lavender root -> void-dark tip)
//      with a solid leading-edge spar and one claw at each wrist.
//   2. ECHO-RINGS — signature: concentric rings rippling outward across each
//      wing on a loop, scaled up so they actually read in battle.
//   3. Crescent radar ears + tail vane: the sound-hunter kit, readable at 64px.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

function echoRings(kit, wingBone, count, seed) {
  const group = new THREE.Group(); group.name = 'echoRings';
  wingBone.add(group);
  const rings = [];
  const rngPhase = (seed * 0.618) % 1;
  for (let i = 0; i < count; i++) {
    const m = kit.mat(0xcfe0ff, { unlit: true, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.036, 0.05, 18), m);
    ring.position.set(0.05 + i * 0.04, 0.02, 0.012);
    group.add(ring);
    rings.push(ring);
  }
  let t = rngPhase * 3;
  function update(dt) {
    t += dt;
    const period = 1.7;
    for (let i = 0; i < rings.length; i++) {
      const local = ((t - i * 0.2) % period + period) % period;
      const p = local / period;
      rings[i].scale.setScalar(0.4 + p * 2.6);
      rings[i].material.opacity = Math.max(0, 0.6 * (1 - p) * (1 - p));
    }
  }
  return { group, update };
}

export function build_reverbane(kit = kitDefault) {
  const pal = kit.palette(['gale', 'umbra']);
  const furHex = 0x5a5278;
  const furV = kit.mat(0xffffff, { vertexColors: true, rough: 0.42, metal: 0.05, emissive: 0x282242, emissiveIntensity: 0.4 });
  const FUR_LO = 0x37305a, FUR_HI = 0x7d73a8;
  const wingV = kit.mat(0xffffff, { vertexColors: true, rough: 0.3, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const earInner = kit.mat(0xb0a4d8, { rough: 0.35, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const glowMat = kit.mat(0xcfe0ff, { unlit: true, transparent: true, opacity: 0.85 });

  const paint = (mesh, seed, lo = FUR_LO, hi = FUR_HI, jit = 0) => {
    if (jit) jitterGeometry(mesh.geometry, jit, seed);
    applyVertexGradient(mesh.geometry, { from: lo, to: hi, noise: 0.04, seed });
    return mesh;
  };

  const root = new THREE.Group();

  // Sleek dart body, hung nose-up between the wings.
  const body = kit.capsule(0.08, 0.2, furV, { capSeg: 4, radSeg: 9 });
  body.geometry.rotateX(Math.PI / 2);
  paint(body, 53);
  root.add(body);
  body.position.y = 0.42;
  body.rotation.x = -0.15;

  // Pale chest ruff — the one bright patch on a dark wraith.
  const ruff = kit.at(body, kit.fluffTuft(0.055, kit.mat(0x9d92c4, { rough: 0.5 }), { count: 4, seed: 8 }), 0, -0.03, 0.12);

  const head = paint(kit.blob(0.07, furV, { seed: 53, squash: { x: 0.95, y: 0.9, z: 1.1 } }), 54);
  kit.at(body, head, 0, 0.05, 0.18);
  const eyeL = kit.at(head, kit.eye(0.021, { irisColor: 0xd8cfff, scleraColor: 0x18121e, skinColor: furHex, glintSize: 0.009, irisScale: 1.2 }), 0.038, 0.008, 0.056, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.021, { irisColor: 0xd8cfff, scleraColor: 0x18121e, skinColor: furHex, glintSize: 0.009, irisScale: 1.2 }), -0.038, 0.008, 0.056, { ry: -0.35 });
  // Tiny fangs under a dark nose.
  kit.at(head, kit.orb(0.016, kit.mat(0x241e38, { rough: 0.5 }), { sy: 0.7 }), 0, -0.02, 0.075);
  const fangMat = kit.mat(0xe8e2f2, { rough: 0.3 });
  kit.at(head, kit.fang(0.02, fangMat), 0.014, -0.032, 0.06);
  kit.at(head, kit.fang(0.02, fangMat), -0.014, -0.032, 0.06);

  // Crescent radar ears — tall paired petals, inner membrane glowing faintly.
  const earL = kit.at(head, paint(kit.petal(0.13, furV, { width: 0.075 }), 55), 0.045, 0.055, -0.01, { rx: -0.3, ry: -0.35, rz: 0.35 });
  kit.at(earL, kit.petal(0.09, earInner, { width: 0.05 }), 0.005, 0.01, 0.008);
  const earR = kit.at(head, paint(kit.petal(0.13, furV, { width: 0.075 }), 56), -0.045, 0.055, -0.01, { rx: -0.3, ry: 0.35, rz: -0.35 });
  kit.at(earR, kit.petal(0.09, earInner, { width: 0.05 }), -0.005, 0.01, 0.008);

  // --- Raised wing V ---------------------------------------------------------
  const wings = [];
  const ringFx = [];
  for (const side of [1, -1]) {
    const w = kit.wing(0.42, wingV, { style: 'membrane', bones: 3, width: 0.26, droop: 0.1 });
    w.group.traverse((n) => {
      if (n.isMesh && n.geometry) {
        applyVertexGradient(n.geometry, { from: 0x6e63a0, to: 0x241f42, axis: 'x', noise: 0.035, seed: 57 });
      }
    });
    kit.at(body, w, side * 0.06, 0.05, 0.02, { rx: -0.08, ry: side * -0.12, rz: side * 0.4, sx: side < 0 ? -1 : 1 });
    wings.push(w);
    // Leading-edge spar + wrist claw.
    const spar = paint(kit.capsule(0.012, 0.36, furV, { capSeg: 3, radSeg: 6 }), 58, 0x2c2648, 0x6e63a0);
    spar.geometry.rotateZ(Math.PI / 2);               // genuine crossbar
    kit.at(w.bones[0], spar, 0.19, 0.02, 0.012);
    kit.at(w.bones[1], kit.horn(0.05, fangMat, { baseR: 0.012, tipR: 0.003, bend: 0.6 }), 0.01, 0.035, 0.012, { rz: -2.4 });
    // Echo rings on the mid bone, rippling toward the tip.
    ringFx.push(echoRings(kit, w.bones[1], 3, side > 0 ? 1 : 2));
  }

  // Tail: short chain ending in a sound-vane diamond.
  const tail = kit.at(body, kit.tailChain(3, furV, { segLen: 0.05, startR: 0.028, endR: 0.01 }), 0, 0, -0.16);
  tail.pivots.forEach((p, i) => {
    for (const c of p.children) if (c.isMesh && c.geometry && c.geometry.attributes) paint(c, 59 + i);
  });
  const vane = kit.at(tail.pivots[tail.pivots.length - 1], kit.fin(0.07, earInner, { width: 0.05 }), 0, 0, -0.03, { rz: Math.PI / 2 });

  // A faint sonar pulse bead at the throat (what "sings" the rings out).
  const throat = kit.at(body, kit.orb(0.02, glowMat.clone()), 0, -0.045, 0.16);
  let tGlow = 0;
  const throatPulse = {
    update(dt) {
      tGlow += dt;
      throat.material.opacity = 0.45 + 0.4 * Math.sin(tGlow * 3.7);
    },
  };

  const spark = kit.heartspark(0.026, pal.eye, { seed: 54 });
  kit.at(body, spark, 0, -0.06, 0.1);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      wings: wings.map((w) => w.bones),
      accents: [earL, earR, ruff, vane],
      fx: [...ringFx, throatPulse, spark],
    },
    hints: {
      personality: 'calm',
      locomotion: 'fly',
      breathAmp: 0.9,
      blinkEvery: 3.4,
    },
  };
}
