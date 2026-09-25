// =============================================================================
// MOTLING — Gale, stage 1 wild (Dawnmeadow & Brighthollow outskirts).
// "Palm-sized dust-moth sprite with mote-glow antennae. Drawn to light."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized): a fuzzy dust-moth ball — one soft lavender
// puff of a body with a paler fluffy collar, a round head with big glossy
// dark moth eyes, two pairs of felt-soft open wings with dusty eye-spots,
// and the signature: two feathery antennae curling up to glowing motes of
// light (with soft halos) — readable at any distance. Hovers.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const FUZZ_LO = 0x8a7ea2, FUZZ_HI = 0xc6bcd8, COLLAR = 0xf2ecf4, WING_R = 0xe0bcd0, WING_T = 0x8a6aa6, GLOW = 0xffe9b0;

export function build_motling(kit = kitDefault) {
  const pal = kit.palette(['gale']);
  const fuzz = S.vcMat(kit, { rough: 0.9 });
  const glowMat = kit.mat(GLOW, { unlit: true });

  const root = new THREE.Group();

  // --- Body: a fuzzy ball with a fluffy pale collar. -----------------------
  const bodyGeo = S.puff(0.062, { count: 7, spread: 0.55, seed: 80, sy: 1.0, blend: 0.8 });
  S.paint(bodyGeo, { from: FUZZ_LO, to: FUZZ_HI, axis: 'y', noise: 0.02, seed: 80 });
  const collar = S.puff(0.04, { count: 6, spread: 0.9, seed: 81, sy: 0.7, blend: 0.8 });
  S.pose(collar, [0, 0.03, 0.035], [0.5, 0, 0], [1.2, 0.8, 1]);
  S.paint(collar, { from: 0xcfc8da, to: COLLAR, axis: 'y', noise: 0.02 });
  const body = S.bake([bodyGeo, collar], fuzz, 'body');
  root.add(body);
  body.position.y = 0.1;

  // --- Head: round, big glossy moth eyes. -----------------------------------
  const headGeo = S.ball(0.04, { sx: 1.08, sy: 0.95, radial: 16, rings: 12 });
  S.paint(headGeo, { from: 0x8a8498, to: 0xc4bed2, axis: 'y', noise: 0.015, seed: 82 });
  const head = S.bake([headGeo], fuzz, 'head');
  kit.at(body, head, 0, 0.045, 0.052, { rx: -0.1 });
  const eyeOpts = { irisColor: 0x1c1826, pupilColor: 0x0c0a10, skinColor: 0x8a8a94, glintSize: 0.008, irisScale: 1.3 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.019, 0.55, 0.1, eyeOpts, { sink: 0.35, front: 0.5 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.019, -0.55, 0.1, eyeOpts, { sink: 0.35, front: 0.5 });

  // --- Feathery antennae with glowing mote tips (the signature). ------------
  const antennae = [1, -1].map((s) => {
    const g = new THREE.Group(); g.name = 'antenna';
    const stalk = S.taper(0.075, 0.0045, { r1: 0.0025, curve: 0.55, radial: 5, rings: 5 });
    S.paint(stalk, 0x6e6880);
    // feathery comb: a soft leaf-shaped vane along the upper stalk
    const vane = S.spindle({ len: 0.045, r: 0.0065, sx: 1.0, sy: 0.3, radial: 8, rings: 7, profile: (t) => Math.pow(Math.sin(Math.PI * t), 0.7) });
    vane.rotateX(-Math.PI / 2 + 0.45);
    S.pose(vane, [0, 0.045, 0.018]);
    S.paint(vane, { from: 0x9a8ab4, to: 0xd8cce8, axis: 'y' });
    const mesh = S.bake([stalk, vane], fuzz, 'antennaStalk');
    g.add(mesh);
    const tipAt = [0, 0.075 * 0.98, 0.075 * 0.55 * 0.96];
    const tip = new THREE.Mesh(S.ball(0.011, { radial: 8, rings: 6 }), glowMat);
    tip.name = 'moteTip';
    tip.position.set(...tipAt);
    g.add(tip);
    const halo = S.glow(GLOW, 0.06, 0.7);
    halo.position.set(...tipAt);
    g.add(halo);
    const p = S.surface(headGeo, S.dirYP(s * 0.35, 0.9), { inset: 0.004 });
    kit.at(head, g, p[0], p[1], p[2], { rz: -s * 0.35, rx: -0.3 });
    return g;
  });

  // --- Two pairs of felt-soft open wings with dusty eye-spots. -------------
  const mk = (len, width, spots, sweep) => S.openWing(len, fuzz, {
    width, thick: 0.08, sweep, color: { root: WING_R, tip: WING_T }, spots, radial: 14, rings: 10,
  });
  const foreSpots = [{ t: 0.62, v: 0.05, r: 0.032, ring: 0x3e2a50, core: 0xffe6a8 }];
  const hindSpots = [{ t: 0.56, v: 0.0, r: 0.024, ring: 0x3e2a50, core: 0xffd8a0 }];
  const wingDefs = [
    // [side, len, width, y, z, pitch(up), yaw(back), spots, sweep]
    [1, 0.15, 0.1, 0.03, -0.01, 0.42, 0.55, foreSpots, 0.22],
    [-1, 0.15, 0.1, 0.03, -0.01, 0.42, 0.55, foreSpots, 0.22],
    [1, 0.11, 0.085, 0.0, -0.035, 0.18, 1.05, hindSpots, 0.12],
    [-1, 0.11, 0.085, 0.0, -0.035, 0.18, 1.05, hindSpots, 0.12],
  ];
  const wingParts = wingDefs.map(([side, len, width, y, z, up, back, spots, sweep]) => {
    const w = mk(len, width, spots, sweep);
    kit.at(body, w, side * 0.035, y, z, { rz: side * up, ry: side * back });
    w.group.scale.x = side;
    return w;
  });

  const dust = kit.mote(5, { color: 0xc8c0d4, size: 0.008, radius: 0.06, height: 0.04, speed: 0.5, seed: 81 });
  kit.at(body, dust, 0, 0, -0.02);

  const spark = kit.heartspark(0.014, pal.eye, { seed: 82 });
  kit.at(body, spark, 0, 0.0, 0.06);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      wings: wingParts.map((w) => w.bones),
      accents: antennae,
      fx: [dust, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'eager',
      locomotion: 'fly',
      hover: true,
      hoverAmp: 0.03,
      breathAmp: 1.0,
      blinkEvery: 2.4,
    },
  };
}
