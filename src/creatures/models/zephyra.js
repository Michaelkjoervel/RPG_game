// =============================================================================
// ZEPHYRA — Gale, stage 2 (Motling awakens at L18).
// "Moth queen, four ribbon wings, comet-trail scales. Regal drifter."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). Motling's fuzzy dust-moth grown into a
// queen: the same soft lavender fuzz and glossy dark moth eyes, now with a
// great cream royal ruff, a long banded abdomen that tapers back like a
// comet's tail, and feathery plume antennae that rise like a crown, each
// tipped with a glowing mote. FOUR wings: broad felt forewings with gold-eyed
// dusty spots, and hindwings that run out into long trailing RIBBONS (a
// comet moth's tails) whose gold tips glow — the comet trail. A slow stream
// of scale-motes drifts behind her. Hovers; every static piece per node is
// one smooth vertex-coloured mesh (./soft.js).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const FUZZ_LO = 0x4a3a78, FUZZ_HI = 0x9884c6, RUFF_LO = 0xd8cce6, RUFF_HI = 0xfffaf4, BAND = 0x3a2c60,
  WING_R = 0x553a8c, WING_T = 0xf2d6ec, EDGE = 0xfff0dc, GOLD = 0xffd27a, GLOW = 0xffe9b0;

export function build_zephyra(kit = kitDefault) {
  const pal = kit.palette(['gale']);
  const fuzz = S.vcMat(kit, { rough: 0.88 });
  const glowMat = kit.mat(GLOW, { unlit: true });

  const root = new THREE.Group();

  // --- Body: fuzzy thorax, royal ruff, long banded comet abdomen. ----------
  const thorax = S.puff(0.07, { count: 7, spread: 0.5, seed: 83, sy: 1.0, blend: 0.8 });
  S.paint(thorax, { from: FUZZ_LO, to: FUZZ_HI, axis: 'y', noise: 0.02, seed: 83 });
  const abdomen = S.spindle({
    len: 0.2, r: 0.052, sx: 0.95, sy: 1.0, p: 0.9, pTail: 1.25, radial: 14, rings: 12,
    profile: (t) => 0.35 + 0.65 * Math.pow(S.sstep(0, 0.85, t), 0.7),
  });
  S.paint(abdomen, { from: FUZZ_LO, to: FUZZ_HI, axis: 'y', noise: 0.015, seed: 84 });
  // soft dark bands down the abdomen, a pale gold tip
  S.overlay(abdomen, BAND, (x, y, z) => (y > -0.02 ? Math.pow(Math.max(0, Math.sin((z + 0.1) * 100)), 3) * 0.55 * S.sstep(0.08, -0.06, z) : 0));
  S.overlay(abdomen, GOLD, (x, y, z) => S.sstep(-0.06, -0.1, z) * 0.7);
  S.pose(abdomen, [0, -0.025, -0.12], [-0.35, 0, 0]);
  const ruff = S.puff(0.05, { count: 8, spread: 0.95, seed: 85, sy: 0.75, blend: 0.82 });
  S.pose(ruff, [0, 0.035, 0.04], [0.55, 0, 0], [1.35, 0.85, 1.05]);
  S.paint(ruff, { from: RUFF_LO, to: RUFF_HI, axis: 'y', noise: 0.02, seed: 86 });
  const body = S.bake([thorax, abdomen, ruff], fuzz, 'body');
  root.add(body);
  body.position.y = 0.2;

  // --- Head: round, big glossy moth eyes, a little gold blaze. --------------
  const headGeo = S.ball(0.052, { sx: 1.08, sy: 0.96, radial: 16, rings: 12 });
  S.paint(headGeo, { from: 0x7a6aa8, to: 0xcabfe2, axis: 'y', noise: 0.015, seed: 87 });
  S.blush(headGeo, S.surface(headGeo, S.dirYP(0, 0.6)), 0.026, 0xffe2b0, 0.85);
  const head = S.bake([headGeo], fuzz, 'head');
  kit.at(body, head, 0, 0.065, 0.075, { rx: -0.12 });
  const eyeOpts = { irisColor: 0x1c1428, pupilColor: 0x0c0a12, skinColor: 0x8a7ea8, glintSize: 0.01, irisScale: 1.3 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.026, 0.55, 0.08, eyeOpts, { sink: 0.35, front: 0.5 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.026, -0.55, 0.08, eyeOpts, { sink: 0.35, front: 0.5 });

  // --- Plume antennae: a crown of feathery fronds with glowing tips. --------
  const antennae = [1, -1].map((s) => {
    const g = new THREE.Group(); g.name = 'antenna';
    const L = 0.1;
    const stalk = S.taper(L, 0.005, { r1: 0.0028, curve: 0.5, radial: 5, rings: 5 });
    S.paint(stalk, 0x5e5480);
    // bipectinate frond: a broad soft feather along the stalk
    const vane = S.spindle({ len: L * 0.8, r: 0.016, sx: 1.0, sy: 0.22, radial: 10, rings: 8, profile: (t) => Math.pow(Math.sin(Math.PI * t), 0.6) * (0.7 + 0.3 * t) });
    vane.rotateX(-Math.PI / 2 + 0.5);
    S.pose(vane, [0, L * 0.5, L * 0.2]);
    S.paint(vane, { from: 0x5e4e8e, to: 0xc4b2e6, axis: 'y' });
    g.add(S.bake([stalk, vane], fuzz, 'antennaStalk'));
    const tipAt = [0, L * 0.98, L * 0.5 * 0.96];
    const tip = new THREE.Mesh(S.ball(0.012, { radial: 8, rings: 6 }), glowMat);
    tip.name = 'moteTip';
    tip.position.set(...tipAt);
    g.add(tip);
    const halo = S.glow(GLOW, 0.075, 0.7);
    halo.position.set(...tipAt);
    g.add(halo);
    const p = S.surface(headGeo, S.dirYP(s * 0.32, 0.95), { inset: 0.004 });
    kit.at(head, g, p[0], p[1], p[2], { rz: -s * 0.38, rx: -0.35 });
    return g;
  });

  // --- FOUR wings: broad forewings, long ribbon-tailed hindwings. ----------
  const foreSpots = [{ t: 0.58, v: 0.06, r: 0.044, ring: 0x2e1e4a, core: GOLD }];
  const hindSpots = [{ t: 0.2, v: 0.05, r: 0.026, ring: 0x3e2a5a, core: 0xffc0a0 }];
  const fore = (side) => {
    const w = S.openWing(0.3, fuzz, {
      width: 0.23, thick: 0.065, sweep: 0.22, color: { root: WING_R, tip: WING_T }, spots: foreSpots, radial: 14, rings: 12,
      chord: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.14 + t * 0.9)), 0.6) * (0.62 + 0.38 * t),
    });
    // a pale cream border band round the outer edge, gold veins of light
    const g = w.group.children[0].geometry;
    S.overlay(g, EDGE, (x, y, z) => {
      const t = x / 0.3, cz = -0.22 * 0.3 * t * t, half = 0.115 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.14 + t * 0.9)), 0.6) * (0.62 + 0.38 * t);
      const e = Math.abs(z - cz) / Math.max(1e-3, half);
      return S.sstep(0.74, 0.9, Math.max(e, S.sstep(0.84, 0.98, t))) * S.sstep(0.3, 0.5, t);
    });
    return w;
  };
  const ribbon = (t) => {
    const lobe = t < 0.5 ? Math.pow(Math.sin(Math.PI * (0.14 + t * 1.72)), 0.6) : 0;
    return Math.max(lobe, 0.36 + 0.3 * S.bump(t, 0.86, 0.1));
  };
  const hind = (side) => {
    const w = S.openWing(0.32, fuzz, {
      width: 0.16, thick: 0.075, sweep: 0.3, lift: 0.3, chord: ribbon, color: { root: 0xf2e4f4, tip: 0xd2aee6 }, spots: hindSpots, radial: 12, rings: 16,
    });
    // the ribbon's tail end warms to glowing comet-gold
    S.overlay(w.group.children[0].geometry, GOLD, (x) => S.sstep(0.22, 0.3, x));
    const tipX = 0.32 * 0.9, tipZ = -0.3 * 0.32 * 0.81;
    const halo = S.glow(GOLD, 0.07, 0.65);
    halo.position.set(tipX, 0.3 * 0.32 * 0.81, tipZ);
    w.group.add(halo);
    return w;
  };
  const wingDefs = [
    // [side, builder, y, z, raise(rz), back(ry)]
    [1, fore, 0.035, 0.0, 0.62, 0.3],
    [-1, fore, 0.035, 0.0, 0.62, 0.3],
    [1, hind, 0.0, -0.035, -0.62, 0.5],
    [-1, hind, 0.0, -0.035, -0.62, 0.5],
  ];
  const wingParts = wingDefs.map(([side, mk, y, z, up, back]) => {
    const w = mk(side);
    // tip each wing's leading edge up about its own span so its painted
    // face reads from the front/battle cameras instead of going edge-on
    w.group.children[0].rotation.x = mk === fore ? -0.55 : -0.8;
    kit.at(body, w, side * 0.04, y, z, { rz: side * up, ry: side * back });
    w.group.scale.x = side;
    return w;
  });

  // --- Comet-trail scales: a slow stream of motes drifting behind. ---------
  const trail = kit.mote(10, { color: 0xe8dcff, size: 0.011, radius: 0.09, height: 0.07, speed: 0.35, seed: 84 });
  kit.at(body, trail, 0, -0.04, -0.2);

  const spark = kit.heartspark(0.02, pal.eye, { seed: 85 });
  const sp = S.surface(ruff, [0, -0.2, 1], { from: [0, 0.03, 0.04], inset: 0.004 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      wings: wingParts.map((w) => w.bones),
      accents: antennae,
      fx: [trail, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'regal',
      locomotion: 'fly',
      hover: true,
      hoverAmp: 0.04,
      breathAmp: 0.85,
      blinkEvery: 3.6,
    },
  };
}
