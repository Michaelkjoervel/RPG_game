// =============================================================================
// JELLUNE — Tide, stage 1 (single-stage), uncommon.
// "Moon-jelly that floats above the water at night, bell glows with
// moonphase. Serene." (Design Bible §4)
// =============================================================================
// A translucent `kit.blob()` squashed flat makes a natural jellyfish-bell
// dome; a frilled skirt ring at the rim and a bundle of drooping
// `tailChain` tentacles complete it. The bell itself IS its `parts.body`,
// its trait ('moonphase') given visual form as a slow brightness pulse on a
// heartspark core nested inside the translucent dome. No legs, no walking —
// `hints.locomotion:'float'` + `hover:true` is the whole gait: a serene
// night-drifter bobbing in place.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_jellune(kit = kitDefault) {
  const pal = kit.palette(['tide']);
  const bellMat = kit.mat(0xcfe6ff, { rough: 0.15, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const fringeMat = kit.mat(0xa8c8f0, { rough: 0.2, transparent: true, opacity: 0.6 });
  const moonMat = kit.mat(0xfff4d0, { unlit: true, transparent: true, opacity: 0.9 });

  const root = new THREE.Group();

  // Dome bell — a squashed blob, wide and low, gradient-lit: deep lake-blue
  // rim rising to a pale moonlit crown.
  const bell = kit.blob(0.22, bellMat, { seed: 90, noise: 0.05, squash: { x: 1, y: 0.62, z: 1 } });
  kit.paint(bell, { from: 0x5a7cc0, to: 0xeaf6ff, noise: 0.03, seed: 90, rough: 0.15 });
  bell.material.side = THREE.DoubleSide;
  root.add(bell);
  bell.position.y = 0.34;

  // THE CRESCENT — a moon-phase marking glowing on the bell's crown, the
  // species' namesake readable from any angle above.
  const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 5, 20, Math.PI * 1.2), moonMat);
  crescent.rotation.x = -Math.PI / 2;
  crescent.rotation.z = 0.5;
  kit.at(bell, crescent, 0, 0.135, -0.01);
  crescent.scale.y = 0.35;                          // hug the dome

  // Frilled fringe skirting the bell's rim.
  const fringe = kit.orb(0.195, fringeMat, { sx: 1, sy: 0.16, sz: 1 });
  kit.at(bell, fringe, 0, -0.06, 0);

  const eyeL = kit.at(bell, kit.eye(0.028, { irisColor: 0x1c3a5a, skinColor: 0xb4d0f0, glintSize: 0.012 }), 0.07, 0.0, 0.15, { ry: 0.3 });
  const eyeR = kit.at(bell, kit.eye(0.028, { irisColor: 0x1c3a5a, skinColor: 0xb4d0f0, glintSize: 0.012 }), -0.07, 0.0, 0.15, { ry: -0.3 });

  // Trailing tentacles: varied lengths, a couple curling — drifting, not
  // hanging like straight strings.
  const tentacleDefs = [[0.07, 0.07, 6, 0.1], [-0.07, 0.07, 5, -0.16], [0.11, -0.02, 7, 0.2], [-0.11, -0.02, 6, -0.1], [0, -0.1, 5, 0.14], [0.03, 0.11, 4, -0.2]];
  const tentacles = tentacleDefs.map(([x, z, segs, drift], i) => {
    const chain = kit.tailChain(segs, fringeMat, { segLen: 0.05, startR: 0.014, endR: 0.004 });
    kit.at(bell, chain, x, -0.08, z, { rx: -Math.PI / 2 + drift });
    chain.pivots.forEach((p, j) => { if (j > 0) p.rotation.x = drift * 0.8; });
    return chain;
  });

  // Moonphase glow: the bell's core pulses through a slow phase cycle
  // rather than a fixed pulse rate, matching its trait's namesake.
  const core = kit.heartspark(0.055, 0xeaf4ff, { seed: 91 });
  kit.at(bell, core, 0, 0.02, 0);
  let moonT = 0;
  const moonPulse = {
    update(dt) {
      moonT += dt * 0.12; // very slow "moonphase" cycle
      const phase = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(moonT));
      bell.material.opacity = 0.4 + phase * 0.3;
      fringeMat.opacity = 0.4 + phase * 0.3;
      crescent.material.opacity = 0.5 + phase * 0.5;
    },
  };

  const drift = kit.mote(8, { color: 0xdfeeff, size: 0.016, radius: 0.26, height: 0.12, speed: 0.22, seed: 92 });
  kit.at(bell, drift, 0, -0.1, 0);

  return {
    group: kit.groundPlant(root),
    parts: {
      body: bell,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tentacles[0].pivots,
      accents: [fringe, ...tentacles.slice(1).map((t) => t.group)],
      fx: [core, moonPulse, drift],
    },
    hints: {
      personality: 'calm',
      locomotion: 'float',
      hover: true,
      hoverAmp: 0.06,
      breathAmp: 0.9,
      blinkEvery: 4.4,
    },
  };
}
