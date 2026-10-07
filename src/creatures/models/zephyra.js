// =============================================================================
// ZEPHYRA — Gale, stage 2 (Motling awakens at L18).
// "Moth queen, four ribbon wings, comet-trail scales. Regal drifter."
// (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized), v4 round: Motling's round dust-moth grown
// into a QUEEN, and she must not read as a bigger Motling. She carries
// herself UPRIGHT: a fuzzy royal-violet thorax with a long banded comet
// abdomen sweeping down and back like a gown's train, curling up to a gold
// tip. A standing fluted MEDICI COLLAR (cream, gold-edged) frames a smaller,
// heart-shaped head with a pale fuzzy face, a feathered brow crest and a
// GOLD CORONET (five points, an aqua gale-gem at its heart). Her eyes are
// serene, not wide: luminous gale-teal under heavy plum lids with a winged
// liner sweep (Motling's are big round purple-black moth eyes). Two great
// fern-comb antennae arch up and out like a crown of plumes, each tipped
// with the family's glowing mote. FOUR wings: broad violet-to-cream
// forewings held up in a V and turned toward the front so their gold
// eye-spots face the battle and gallery cameras, and hindwings that run out
// into long trailing RIBBONS (a comet moth's tails) with glowing gold tips.
// A slow stream of scale-motes drifts behind her. Hovers; every static piece
// per node is one smooth vertex-coloured mesh (./soft.js).

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const FUZZ_LO = 0x3e2f6c, FUZZ_HI = 0x8c78c0, RUFF_LO = 0xcfc2e2, RUFF_HI = 0xfffaf2, BAND = 0x2e2252,
  WING_R = 0x4a2f86, WING_M = 0x9a7ccc, WING_T = 0xf4e2ee, EDGE = 0xfff3de, GOLD = 0xffd27a, GOLD_DK = 0xd8962e,
  GLOW = 0xffe9b0, PLUM = 0x2c1a40, FACE = 0xe6dcf0, GEM = 0x5fe0cc;

// The standing MEDICI COLLAR: a thin fluted fan (a flattened disc whose
// lower half folds away), scalloped into petals round the rim, cream with a
// gold-tinted edge. Local XY is the fan's face, +Y up, +Z toward the head.
function collarGeo() {
  const R = 0.088;
  const g = S.ball(R, { sz: 0.22, radial: 28, rings: 10 });
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const rho = Math.hypot(x, y);
    if (rho < 1e-6) continue;
    const a = Math.atan2(x, y); // 0 = straight up
    const petal = 1 + 0.2 * Math.pow(Math.abs(Math.cos(a * 4.5)), 0.5) - 0.1;
    const fold = S.lerp(0.42, 1, S.sstep(-0.35, 0.25, y / R)); // lower half tucks in
    const k = petal * fold;
    x *= k * 1.22; y *= k;
    // pleats: deep front/back flutes, and the rim curls forward round the head
    z += 0.013 * Math.cos(a * 9) * Math.pow(rho / R, 0.7) + 0.026 * Math.pow(rho / R, 2);
    pos.setXYZ(i, x, y, z);
  }
  S.smooth(g);
  S.paint(g, 0xffffff);
  const col = g.attributes.color, C = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.hypot(x / 1.22, y) / R;
    C.setHex(S.mixHex(RUFF_LO, RUFF_HI, S.clamp01(r * 1.2)));
    C.lerp(new THREE.Color(GOLD_DK), S.sstep(0.86, 1.0, r) * 0.9);
    col.setXYZ(i, C.r, C.g, C.b);
  }
  // the back of the fan is lilac with a violet heart (it faces the camera
  // when she is the player's creature)
  S.overlayN(g, 0x9a86c8, (nx, ny, nz, x, y) => S.sstep(0.1, -0.4, nz) * (1 - S.sstep(0.8, 0.95, Math.hypot(x / 1.22, y) / R)) * 0.85);
  return g;
}

// A feathery fern-comb antenna (a bipectinate moth antenna): a thin flat
// sheet cut into a rachis with `barbs` pairs of slim barbs leaning toward
// the tip, longest mid-way — a crisp comb silhouette that reads as
// "feathery" at any distance. Grows along +Y from the origin, faces +Z.
// Cut edges stay crisp (crease-smoothed), dark plum rachis, pale gold barbs.
function combGeo(len, w, barbs = 9) {
  const sh = new THREE.Shape();
  const R = 0.0016;
  const side = (sd, up) => {
    for (let k = 0; k < barbs; k++) {
      const i = up ? k : barbs - 1 - k;
      const t0 = (i + 0.1) / barbs, t1 = (i + 0.9) / barbs, tm = (t0 + t1) / 2;
      const bl = w * 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + tm * 0.95)), 0.8);
      const tip = [sd * bl, (tm + 0.55 / barbs) * len + bl * 0.55];
      if (up) { sh.lineTo(sd * R, t0 * len); sh.lineTo(tip[0], tip[1]); sh.lineTo(sd * R, t1 * len); }
      else { sh.lineTo(sd * R, t1 * len); sh.lineTo(tip[0], tip[1]); sh.lineTo(sd * R, t0 * len); }
    }
  };
  sh.moveTo(R, 0);
  side(1, true);
  sh.lineTo(0, len * 1.03);
  side(-1, false);
  sh.lineTo(-R, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.003, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -0.0015);
  S.prep(g, 0xffffff, { crease: 0.6 });
  S.paint(g, { from: 0x6a4a96, to: 0xfff0c4, fn: (x) => S.sstep(0.0, w * 0.1, Math.abs(x)) });
  S.overlay(g, GOLD, (x, y) => S.sstep(len * 0.7, len, y) * 0.5);
  return g;
}

export function build_zephyra(kit = kitDefault) {
  const pal = kit.palette(['gale']);
  const fuzz = S.vcMat(kit, { rough: 0.88 });
  const glowMat = kit.mat(GLOW, { unlit: true });
  const goldMat = kit.mat(0xffffff, { unlit: true, vertexColors: true });

  const root = new THREE.Group();

  // --- Body: upright fuzzy thorax, a long banded comet "gown". -------------
  const thorax = S.puff(0.062, { count: 5, spread: 0.45, seed: 83, sy: 1.25, blend: 0.8, radial: 10, rings: 7 });
  S.paint(thorax, { from: FUZZ_LO, to: FUZZ_HI, axis: 'y', noise: 0.02, seed: 83 });
  const abdomen = S.spindle({
    len: 0.27, r: 0.05, sx: 0.92, sy: 1.0, p: 0.9, pTail: 1.35, radial: 14, rings: 14,
    profile: (t) => 0.1 + 0.9 * Math.pow(S.sstep(0, 0.88, t), 0.75),
    arch: (t) => 0.05 * Math.pow(1 - t, 2.2),
  });
  S.paint(abdomen, { from: FUZZ_LO, to: FUZZ_HI, axis: 'y', noise: 0.015, seed: 84 });
  // soft dark bands down the gown, warming to a glowing gold comet tip
  S.overlay(abdomen, BAND, (x, y, z) => Math.pow(Math.max(0, Math.sin((z + 0.135) * 92)), 3) * 0.6 * S.sstep(0.1, -0.06, z));
  S.overlay(abdomen, GOLD, (x, y, z) => S.sstep(-0.075, -0.125, z) * 0.85);
  S.pose(abdomen, [0, -0.07, -0.085], [-0.8, 0, 0]);
  // the standing Medici collar behind the head
  const collar = collarGeo();
  S.pose(collar, [0, 0.07, 0.0], [-0.3, 0, 0]);
  // a soft cream bib under the chin
  const bib = S.puff(0.036, { count: 5, spread: 0.8, seed: 85, sy: 0.75, blend: 0.82, radial: 8, rings: 6 });
  S.pose(bib, [0, 0.025, 0.05], [0.4, 0, 0], [1.3, 0.9, 0.9]);
  S.paint(bib, { from: RUFF_LO, to: RUFF_HI, axis: 'y', noise: 0.02, seed: 86 });
  const body = S.bake([thorax, abdomen, collar, bib], fuzz, 'body');
  root.add(body);
  body.position.y = 0.22;

  // --- Head: smaller, heart-shaped, pale fuzzy face, feathered brow. -------
  const headGeo = S.ball(0.046, { sx: 1.1, sy: 1.02, sz: 0.92, radial: 16, rings: 12 });
  // heart-shaped face: a soft widow's peak and a narrower chin
  {
    const p = headGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const front = S.sstep(0.0, 0.04, z);
      p.setX(i, x * (1 - 0.18 * S.sstep(0.0, -0.045, y) * front));
      p.setY(i, y + 0.006 * S.sstep(0.03, 0.045, y) * front * (1 - S.sstep(0.0, 0.02, Math.abs(x))));
    }
    S.smooth(headGeo);
  }
  S.paint(headGeo, { from: 0x6a58a0, to: 0xb8a8dc, axis: 'y', noise: 0.015, seed: 87 });
  S.overlay(headGeo, FACE, (x, y, z) => S.sstep(0.012, 0.04, z) * (1 - S.sstep(0.02, 0.045, y)) * 0.9);
  // feathered brow crest: soft plumes sweeping up and back over the crown
  const crest = [[-0.35, 0.03], [0, 0.036], [0.35, 0.03]].map(([yaw, L], i) => {
    const at = S.surface(headGeo, S.dirYP(yaw, 1.05), { inset: 0.004 });
    const g = S.taper(L, 0.011, { r1: 0.0015, curve: -0.6, radial: 6, rings: 5, capSeg: 1, sx: 1.6, sz: 0.6 });
    S.paint(g, { from: 0xb8a8dc, to: RUFF_HI, axis: 'y' });
    S.aim(g, [yaw * 0.9, 1, -0.55 - 0.1 * (i === 1)]);
    return S.pose(g, at);
  });
  const head = S.bake([headGeo, ...crest], fuzz, 'head');
  kit.at(body, head, 0, 0.085, 0.05, { rx: -0.08 });

  // --- The GOLD CORONET: a band across the brow, five points, a gale-gem. --
  const band = S.groove(headGeo, [[-1.1, 0.5], [-0.55, 0.66], [0, 0.72], [0.55, 0.66], [1.1, 0.5]], { radius: 0.0058, lift: 0.001, seg: 14, radial: 4, caps: false });
  S.paint(band, GOLD_DK);
  const points = [[-0.82, 0.022], [-0.42, 0.031], [0, 0.044], [0.42, 0.031], [0.82, 0.022]].map(([yaw, L]) => {
    const pitch = 0.72 - Math.abs(yaw) * 0.2;
    const at = S.surface(headGeo, S.dirYP(yaw, pitch), { inset: 0.001 });
    const g = S.taper(L, 0.0062, { r1: 0.0012, radial: 5, rings: 4, capSeg: 1 });
    S.paint(g, { from: GOLD_DK, to: 0xffe08a, axis: 'y' });
    const out = S.dirYP(yaw, pitch);
    S.aim(g, [out[0] * 0.35, 1, out[2] * 0.45]);
    return S.pose(g, at);
  });
  const coronet = new THREE.Mesh(S.merge([band, ...points]), goldMat);
  coronet.name = 'coronet';
  head.add(coronet);
  const gemAt = S.surface(headGeo, S.dirYP(0, 0.62), { inset: -0.005 });
  const gem = new THREE.Mesh(S.brilliant(0.011, 0.011, 0.007, [GEM, 0x9ff4e6, 0x2fb5a8, 0xe0fffa], { facets: 6 }), kit.mat(0xffffff, { flat: true, vertexColors: true, rough: 0.2, emissive: 0x2a8f84, emissiveIntensity: 0.6 }));
  gem.name = 'gem';
  gem.position.set(gemAt[0], gemAt[1], gemAt[2]);
  gem.rotation.x = Math.PI / 2 - 0.62;
  head.add(gem);
  const gemGlow = S.glow(GEM, 0.05, 0.5);
  gemGlow.position.copy(gem.position);
  head.add(gemGlow);

  // --- Eyes: serene gale-teal under heavy plum lids, a winged liner. -------
  const eyeOpts = { irisColor: 0x3ccab8, pupilColor: 0x0f3c42, skinColor: 0x6a58a0, glintSize: 0.008, irisScale: 1.08 };
  const ER = 0.021;
  const eyes = [1, -1].map((sd) => {
    const e = S.seatEye(kit, head, headGeo, ER, sd * 0.56, 0.08, eyeOpts, { sink: 0.38, front: 0.5 });
    // a static heavy upper lid (plum), tilted so the eye reads almond and calm
    const lidG = new THREE.SphereGeometry(ER * 1.1, 12, 4, 0, Math.PI * 2, 0, 0.86);
    lidG.deleteAttribute('uv');
    const lid = new THREE.Mesh(lidG, S.smoothMat(kit, 0x5a3c7c, { rough: 0.6 }));
    lid.name = 'upperLid';
    lid.rotation.set(0.6, 0, sd * 0.3);
    e.add(lid);
    return e;
  });
  // winged liner: a fine plum sweep off each outer corner, up and back
  const liner = [1, -1].map((sd) => S.paint(S.groove(headGeo, [[sd * 0.7, 0.2], [sd * 0.92, 0.28], [sd * 1.1, 0.42]], { radius: 0.0032, lift: 0.0005, seg: 6, radial: 3, caps: false }), PLUM));
  const linerMesh = new THREE.Mesh(S.merge(liner), S.vcMat(kit, { rough: 0.6 }));
  linerMesh.name = 'liner';
  head.add(linerMesh);

  // --- Fern-comb antennae: a crown of plumes with glowing mote tips. -------
  const antennae = [1, -1].map((s) => {
    const g = new THREE.Group(); g.name = 'antenna';
    const L = 0.135;
    const stalk = S.taper(L, 0.0045, { r1: 0.0024, curve: 0.45, radial: 5, rings: 5, capSeg: 1 });
    S.paint(stalk, 0x4a3474);
    const vane = combGeo(L * 0.9, 0.065, 9);
    vane.rotateX(0.32);
    S.pose(vane, [0, L * 0.06, L * 0.02]);
    g.add(S.bake([stalk, vane], fuzz, 'antennaStalk'));
    const tipAt = [0, L * 0.98, L * 0.45 * 0.96];
    const tip = new THREE.Mesh(S.ball(0.0095, { radial: 8, rings: 6 }), glowMat);
    tip.name = 'moteTip';
    tip.position.set(...tipAt);
    g.add(tip);
    const halo = S.glow(GLOW, 0.065, 0.7);
    halo.position.set(...tipAt);
    g.add(halo);
    const p = S.surface(headGeo, S.dirYP(s * 0.42, 0.85), { inset: 0.004 });
    kit.at(head, g, p[0], p[1], p[2], { rz: -s * 0.5, rx: -0.42, ry: s * 0.25 });
    return g;
  });

  // --- FOUR wings: broad forewings, long ribbon-tailed hindwings. ----------
  const FL = 0.3, FW = 0.24;
  const foreChord = (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.16 + t * 0.88)), 0.55) * (0.6 + 0.4 * t);
  const foreSpots = [{ t: 0.6, v: 0.0, r: 0.05, ring: 0x2a1a48, core: GOLD }];
  const fore = () => {
    const w = S.openWing(FL, fuzz, { width: FW, thick: 0.06, sweep: 0.16, color: { root: WING_R, tip: WING_M }, spots: foreSpots, radial: 14, rings: 12, chord: foreChord });
    const g = w.group.children[0].geometry;
    // pale cream outer third and a cream border band round the outer edge
    S.overlay(g, WING_T, (x) => S.sstep(0.55, 0.95, x / FL) * 0.75);
    S.overlay(g, EDGE, (x, y, z) => {
      const t = x / FL, cz = -0.16 * FL * t * t, half = FW * 0.5 * foreChord(t);
      const e = Math.abs(z - cz) / Math.max(1e-3, half);
      return S.sstep(0.72, 0.9, Math.max(e, S.sstep(0.86, 0.98, t))) * S.sstep(0.25, 0.45, t);
    });
    // re-stamp the eye-spot over the cream wash
    S.blush(g, [0.6 * FL, 0, -0.16 * FL * 0.36], 0.05, 0x2a1a48, 1);
    S.blush(g, [0.6 * FL, 0, -0.16 * FL * 0.36], 0.0275, GOLD, 1);
    return w;
  };
  const ribbon = (t) => {
    const lobe = t < 0.5 ? Math.pow(Math.sin(Math.PI * (0.14 + t * 1.72)), 0.6) : 0;
    return Math.max(lobe, 0.34 + 0.32 * S.bump(t, 0.87, 0.1));
  };
  const hind = () => {
    const w = S.openWing(0.34, fuzz, {
      width: 0.15, thick: 0.075, sweep: 0.32, lift: 0.25, chord: ribbon, color: { root: 0xeadcf2, tip: 0xc6a2e2 },
      spots: [{ t: 0.18, v: 0.05, r: 0.024, ring: 0x3e2a5a, core: 0xffc0a0 }], radial: 12, rings: 16,
    });
    // the ribbon's tail end warms to glowing comet-gold
    S.overlay(w.group.children[0].geometry, GOLD, (x) => S.sstep(0.24, 0.31, x));
    const tipX = 0.34 * 0.9, tipZ = -0.32 * 0.34 * 0.81;
    const halo = S.glow(GOLD, 0.07, 0.65);
    halo.position.set(tipX, 0.25 * 0.34 * 0.81, tipZ);
    w.group.add(halo);
    return w;
  };
  const wingDefs = [
    // [side, builder, y, z, raise(rz), back(ry), face(rx on the wing mesh)]
    [1, fore, 0.045, -0.02, 0.5, 0.16, -1.22],
    [-1, fore, 0.045, -0.02, 0.5, 0.16, -1.22],
    [1, hind, 0.0, -0.04, -0.3, 1.0, -0.9],
    [-1, hind, 0.0, -0.04, -0.3, 1.0, -0.9],
  ];
  const wingParts = wingDefs.map(([side, mk, y, z, up, back, face]) => {
    const w = mk();
    // turn each wing's face about its own span toward the front/battle
    // cameras (a forewing held flat goes edge-on from a low camera)
    w.group.children[0].rotation.x = face;
    kit.at(body, w, side * 0.035, y, z, { rz: side * up, ry: side * back });
    w.group.scale.x = side;
    return w;
  });

  // --- Comet-trail scales: a slow stream of motes drifting behind. ---------
  const trail = kit.mote(10, { color: 0xe8dcff, size: 0.011, radius: 0.09, height: 0.07, speed: 0.35, seed: 84 });
  kit.at(body, trail, 0, -0.1, -0.2);

  const spark = kit.heartspark(0.02, pal.eye, { seed: 85 });
  const sp = S.surface(bib, [0, -0.3, 1], { from: [0, 0.02, 0.05], inset: 0.004 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: eyes.map((e) => e.getObjectByName('eyelid')),
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
