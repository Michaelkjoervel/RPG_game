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
  const bellMat = kit.mat(0xcfe6ff, { rough: 0.15, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const fringeMat = kit.mat(0xa8c8f0, { rough: 0.2, transparent: true, opacity: 0.6 });

  const root = new THREE.Group();

  // Dome bell — a squashed blob, wide and low, rim near y=0 of its own frame.
  const bell = kit.blob(0.22, bellMat, { seed: 90, noise: 0.05, squash: { x: 1, y: 0.62, z: 1 } });
  root.add(bell);
  bell.position.y = 0.32;

  // Frilled fringe skirting the bell's rim.
  const fringe = kit.orb(0.19, fringeMat, { sx: 1, sy: 0.16, sz: 1 });
  kit.at(bell, fringe, 0, -0.06, 0);

  const eyeL = kit.at(bell, kit.eye(0.026, { irisColor: 0x1c3a5a, skinColor: 0xcfe6ff, glintSize: 0.011 }), 0.07, 0.02, 0.14, { ry: 0.3 });
  const eyeR = kit.at(bell, kit.eye(0.026, { irisColor: 0x1c3a5a, skinColor: 0xcfe6ff, glintSize: 0.011 }), -0.07, 0.02, 0.14, { ry: -0.3 });

  // Long trailing tentacles, drooping straight down from the bell's underside.
  const tentacleDefs = [[0.06, 0.07], [-0.06, 0.07], [0.1, -0.02], [-0.1, -0.02], [0, -0.09]];
  const tentacles = tentacleDefs.map(([x, z], i) => {
    const chain = kit.tailChain(6, fringeMat, { segLen: 0.05, startR: 0.014, endR: 0.004 });
    kit.at(bell, chain, x, -0.08, z, { rx: -Math.PI / 2 + 0.12 * (i % 2 === 0 ? 1 : -1) });
    return chain;
  });

  // Moonphase glow: the bell's core pulses through a slow phase cycle
  // rather than a fixed pulse rate, matching its trait's namesake.
  const core = kit.heartspark(0.05, 0xeaf4ff, { seed: 91 });
  kit.at(bell, core, 0, 0.02, 0);
  let moonT = 0;
  const moonPulse = {
    update(dt) {
      moonT += dt * 0.12; // very slow "moonphase" cycle
      const phase = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(moonT));
      bellMat.opacity = 0.35 + phase * 0.3;
      fringeMat.opacity = 0.4 + phase * 0.3;
    },
  };

  const drift = kit.mote(7, { color: 0xdfeeff, size: 0.016, radius: 0.26, height: 0.1, speed: 0.22, seed: 92 });
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
