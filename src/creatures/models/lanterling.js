// =============================================================================
// LANTERLING — Lumen, stage 1 wild (Whisperwood).
// "Firefly-wisp carrying its own tiny lantern (its heartspark, externalized).
// Helpful." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). A round, fuzzy little firefly-wisp: a
// honey-gold puff of a body with a cream face, big dark eyes, two thread
// antennae with glowing bead tips and two gauzy wings that shimmer. Every
// other Kindred keeps its heartspark in its chest; Lanterling carries it
// OUTSIDE, as the signature: a tiny GLASS BELL LANTERN on a thin tether
// swinging below and in front of it, the heartspark glowing inside — the
// same bell its evolution Glowvern will one day hang from its tail. It never
// lands (float + hover).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const GOLD_LO = 0xb87a34, GOLD = 0xe8a850, GOLD_HI = 0xffd890, CREAM = 0xfff0cc, BRONZE = 0x8a6a34;

function bellGeo(h, r) {
  const pts = [[0.0, 0], [0.22, -0.02], [0.36, -0.1], [0.44, -0.3], [0.52, -0.6], [0.66, -0.86], [0.86, -0.98], [0.94, -1.0]];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x * r, y * h)), 14);
  g.deleteAttribute('uv');
  return g;
}

export function build_lanterling(kit = kitDefault) {
  const pal = kit.palette(['lumen']);
  const fuzz = S.vcMat(kit, { rough: 0.7, emissive: 0x2a1c08, emissiveIntensity: 0.3 });
  const wingMat = kit.mat(0xffffff, { unlit: true, vertexColors: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide, glow: 1.2 });
  wingMat.depthWrite = false;
  wingMat.userData.softVC = true;
  const glass = kit.mat(0xfff4d8, { rough: 0.08, transparent: true, opacity: 0.4, side: THREE.DoubleSide, emissive: 0xffc860, emissiveIntensity: 0.45 });
  glass.depthWrite = false;
  const lightMat = kit.mat(0xffe29a, { unlit: true });

  const root = new THREE.Group();

  // --- Body: a fuzzy golden puff with a cream face. ------------------------------
  const core = S.ball(0.07, { sx: 1.0, sy: 0.95, sz: 0.95, radial: 16, rings: 12 });
  const fluff = S.puff(0.045, { count: 6, spread: 0.9, seed: 180, sy: 0.9, radial: 8, rings: 6 });
  fluff.translate(0, 0.01, -0.015);
  const bodyGeo = S.merge([S.paint(core.clone(), GOLD), S.paint(fluff, GOLD)]);
  S.paint(bodyGeo, { from: GOLD_LO, to: GOLD_HI, axis: 'y', noise: 0.02, seed: 180 });
  S.overlay(bodyGeo, CREAM, (x, y, z) => S.sstep(0.03, 0.065, z) * S.sstep(0.05, -0.01, y));
  const smile = S.paint(S.groove(core, [[-0.25, -0.2], [0, -0.26], [0.25, -0.2]], { radius: 0.0035, lift: -0.001 }), 0x6a3a18);
  const body = S.bake([bodyGeo, smile], fuzz, 'body');
  root.add(body);
  body.position.y = 0.22;
  const eyeOpts = { irisColor: 0x241608, skinColor: 0xe8a850, glintSize: 0.009 };
  const eyeL = S.seatEye(kit, body, core, 0.024, 0.38, 0.14, eyeOpts, { sink: 0.4, front: 0.55 });
  const eyeR = S.seatEye(kit, body, core, 0.024, -0.38, 0.14, eyeOpts, { sink: 0.4, front: 0.55 });

  // --- Thread antennae with glowing bead tips (accents). ---------------------------
  const antennae = [1, -1].map((sd) => {
    const g = new THREE.Group(); g.name = 'antenna';
    const stalk = S.taper(0.07, 0.004, { r1: 0.0025, curve: 0.5, radial: 5, rings: 5, capSeg: 1 });
    S.paint(stalk, 0x6a4a24);
    g.add(new THREE.Mesh(stalk, fuzz));
    const bead = new THREE.Mesh(S.ball(0.009, { radial: 8, rings: 5 }), lightMat);
    bead.position.set(0, 0.07, 0.07 * 0.5 * 0.9);
    g.add(bead);
    const at = S.surface(core, S.dirYP(sd * 0.35, 0.95), { inset: 0.004 });
    kit.at(body, g, at[0], at[1], at[2], { rz: -sd * 0.35, rx: -0.15 });
    return g;
  });

  // --- Gauzy wings (accents: they shimmer). ------------------------------------------
  const wings = [1, -1].map((sd) => {
    const w = S.openWing(0.09, wingMat, { width: 0.065, thick: 0.05, sweep: 0.25, lift: 0.2, radial: 10, rings: 8, color: { root: 0xfff4d0, tip: 0xffe0a0 } });
    const at = S.surface(core, [sd * 0.6, 0.6, -0.5], { inset: 0.01 });
    kit.at(body, w, at[0], at[1], at[2], { rz: sd * 0.55, ry: sd * 0.5, sx: sd < 0 ? -1 : 1 });
    return w.group;
  });

  // --- THE LANTERN: a tiny glass bell on a tether (accent: it swings). ------------
  const tether = new THREE.Group(); tether.name = 'lanternTether';
  const thread = S.paint(S.limb(0.075, 0.0025, 0.0025, { radial: 5, capSeg: 1, shaftSeg: 2 }), 0xd8b878);
  const cap = S.paint(S.ball(0.016, { sy: 0.6, radial: 8, rings: 5 }), BRONZE);
  cap.translate(0, -0.078, 0);
  tether.add(new THREE.Mesh(S.merge([thread, cap]), fuzz));
  const bell = new THREE.Mesh(bellGeo(0.06, 0.036), glass);
  bell.name = 'glassBell';
  bell.position.y = -0.078;
  tether.add(bell);
  const flame = new THREE.Mesh(S.ball(0.014, { sy: 1.4, radial: 8, rings: 5 }), lightMat);
  flame.name = 'lanternFlame';
  flame.position.y = -0.11;
  tether.add(flame);
  const lanternGlow = S.glow(0xffd070, 0.2, 0.55);
  lanternGlow.position.y = -0.108;
  tether.add(lanternGlow);
  const lantern = kit.heartspark(0.014, pal.eye, { seed: 181 });
  kit.at(tether, lantern, 0, -0.108, 0);
  const tp = S.surface(core, [0, -1, 0.6], { inset: 0.01 });
  kit.at(body, tether, tp[0], tp[1], tp[2], { rx: 0.3 });

  // A faint halo of motes around the lantern — moths to its own flame.
  const halo = kit.mote(4, { color: 0xfff2d0, size: 0.008, radius: 0.05, height: 0.03, speed: 0.6, seed: 182 });
  kit.at(tether, halo, 0, -0.1, 0);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      accents: [...antennae, ...wings, tether],
      fx: [lantern, halo, S.variantFx(root)],
    },
    hints: {
      personality: 'eager',
      locomotion: 'float',
      hover: true,
      hoverAmp: 0.045,
      breathAmp: 1.1,
      blinkEvery: 2.6,
    },
  };
}
