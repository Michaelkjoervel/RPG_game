// =============================================================================
// STRATOVANE — Gale/Volt, stage 2 (Nimbis awakens at L26), rare.
// "Manta of storm-cloud, lightning veins, thunder on wingbeat." (Design
// Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). A real manta: a broad, flat, rounded hull
// (anvil-dark slate on top, a pale storm-grey belly) whose two great soft
// wings sweep back to pointed, up-curled tips; curled cephalic horn-fins
// frame a wide mouth and volt-yellow eyes; a long whip tail. Nimbis's cloud
// still rides it: a soft cumulonimbus of puffs boils up over its back. The
// signature: LIGHTNING VEINS running across both wings that flash with a
// rolling thunder pulse (and flicker between beats); a drizzle of rain falls
// from its underside. Proportions: the cloud stack and the raised wing tips
// buy height, so registry's height rescale doesn't blow up the wingspan.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const SLATE_LO = 0x262a3a, SLATE = 0x3e4458, SLATE_HI = 0x6a7290, BELLY = 0xb4bccf, CLOUD_LO = 0x464c64, CLOUD_HI = 0xc4cadc, VOLT = 0xffe94f;

// Zigzag bolts laid on a wing's top surface (one merged mesh per wing).
function veinGeo(wingGeo, len, sweep, seed) {
  const geos = [];
  for (const [z0, n] of [[-0.05, 7], [-0.14, 6]]) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = 0.08 + (i / n) * 0.8;
      const x = t * len;
      const z = -sweep * len * t * t + z0 * (1 - t * 0.6) + (i % 2 ? 1 : -1) * 0.014 * Math.sin(seed + i * 1.7);
      pts.push(new THREE.Vector3(...S.surface(wingGeo, [0, 1, 0], { from: [x, 0, z], inset: -0.002 })));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05), n * 3, 0.006, 3, false);
    g.deleteAttribute('uv');
    geos.push(S.paint(g, 0xffffff));
  }
  return S.merge(geos);
}

export function build_stratovane(kit = kitDefault) {
  const pal = kit.palette(['gale', 'volt']);
  const skin = S.vcMat(kit, { rough: 0.55 });
  const cloudMat = S.vcMat(kit, { rough: 0.8 });
  const veinMat = kit.mat(VOLT, { unlit: true, transparent: true, opacity: 0.4 });
  veinMat.depthWrite = false;
  const veinBase = veinMat.color.clone();

  const root = new THREE.Group();

  // --- Manta hull: broad, flat, rounded; pale belly; wide mouth. ------------------
  const hull = S.spindle({
    len: 0.62, r: 0.23, sx: 1.25, sy: 0.55, pTail: 0.8, pNose: 1.25, radial: 18, rings: 12, belly: 0.25,
    profile: (t) => 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 0.8 + 0.12)),
    arch: (t) => 0.03 * S.bump(t, 0.55, 0.35),
  });
  S.paint(hull, { from: SLATE_LO, to: SLATE_HI, axis: 'y', noise: 0.015, seed: 110 });
  S.overlayN(hull, BELLY, (nx, ny, nz) => S.sstep(-0.1, -0.6, ny));
  const mouth = S.paint(S.groove(hull, [[-0.55, -0.35], [-0.2, -0.45], [0.2, -0.45], [0.55, -0.35]], { from: [0, 0, 0.18], radius: 0.01, lift: -0.002 }), 0x14161e);
  const body = S.bake([hull, mouth], skin, 'body');
  root.add(body);
  body.position.y = 0.5;

  const eyeOpts = { irisColor: VOLT, pupilColor: 0x2a2408, scleraColor: 0x181a24, skinColor: 0x3e4458, glintSize: 0.018 };
  const eyeL = S.seatEye(kit, body, hull, 0.048, 0.62, 0.35, eyeOpts, { sink: 0.4, front: 0.6, from: [0, 0, 0.14] });
  const eyeR = S.seatEye(kit, body, hull, 0.048, -0.62, 0.35, eyeOpts, { sink: 0.4, front: 0.6, from: [0, 0, 0.14] });

  // Curled cephalic horn-fins (accents).
  const horns = [1, -1].map((sd) => {
    const g = S.taper(0.2, 0.04, { r1: 0.01, curve: -0.7, radial: 7, rings: 6, sx: 0.55 });
    S.paint(g, { from: SLATE, to: SLATE_HI, axis: 'y' });
    g.rotateX(Math.PI / 2 - 0.35); // grow forward, curling up
    g.rotateY(-sd * 0.25);
    const m = new THREE.Mesh(g, skin);
    m.name = 'cephalicFin';
    const at = S.surface(hull, [sd * 0.75, -0.1, 1], { from: [0, 0, 0.12], inset: 0.02 });
    kit.at(body, m, at[0], at[1], at[2]);
    return m;
  });

  // --- The cumulonimbus riding its back (an accent: it billows). --------------------
  const cloud = new THREE.Group(); cloud.name = 'cloudStack';
  const c1 = S.puff(0.19, { count: 7, spread: 0.9, seed: 111, sy: 0.75, radial: 9, rings: 6 });
  const c2 = S.puff(0.13, { count: 5, spread: 0.75, seed: 112, sy: 0.85, radial: 8, rings: 6 });
  c2.translate(0.04, 0.15, -0.06);
  const cg = S.merge([c1, c2]);
  S.paint(cg, { from: CLOUD_LO, to: CLOUD_HI, axis: 'y', noise: 0.02, seed: 113 });
  cloud.add(new THREE.Mesh(cg, cloudMat));
  const ca = S.surface(hull, [0, 1, 0], { from: [0, 0, -0.04], inset: 0.04 });
  kit.at(body, cloud, ca[0], ca[1], ca[2]);

  // --- The great soft manta wings with lightning veins. ----------------------------
  const veinMeshes = [];
  const wings = [1, -1].map((side) => {
    const len = 0.56, sweep = 0.55;
    const w = S.openWing(len, skin, {
      width: 0.48, thick: 0.2, sweep, lift: 0.1, radial: 14, rings: 10,
      chord: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.5 + t * 0.52)), 0.75) * (1 - 0.25 * t),
      color: { root: SLATE, tip: SLATE_LO },
    });
    const wm = w.group.children[0];
    S.overlayN(wm.geometry, BELLY, (nx, ny, nz) => S.sstep(-0.15, -0.7, ny) * 0.9);
    S.overlay(wm.geometry, SLATE_HI, (x, y, z) => (y > 0 ? S.bump(x / len, 0.25, 0.2) * 0.35 : 0));
    const vm = new THREE.Mesh(veinGeo(wm.geometry, len, sweep, side > 0 ? 1 : 4), veinMat);
    vm.name = 'lightningVeins';
    w.group.add(vm);
    veinMeshes.push(vm);
    const at = S.surface(hull, [side, 0.1, 0], { from: [0, 0, 0.0], inset: 0.06 });
    kit.at(body, w, at[0], at[1], at[2], { rz: side * 0.15, ry: 0, sx: side < 0 ? -1 : 1 });
    return w;
  });

  // --- Long whip tail. ------------------------------------------------------------------
  const tail = S.softTail(5, skin, { segLen: 0.085, startR: 0.03, endR: 0.007, curl: 0.06, radial: 7, color: (t) => S.mixHex(SLATE, SLATE_LO, t) });
  kit.at(body, tail, 0, 0.0, -0.28);
  const vaneGeo = S.spindle({ len: 0.08, r: 0.026, sx: 1, sy: 0.14, p: 0.6, radial: 8, rings: 6, profile: (t) => 0.2 + 0.8 * Math.sin(Math.PI * t) });
  vaneGeo.translate(0, 0, -0.04);
  S.paint(vaneGeo, { from: SLATE_HI, to: VOLT, axis: 'z' });
  const tailVane = new THREE.Mesh(vaneGeo, skin);
  tailVane.name = 'tailVane';
  kit.at(tail.tipAnchor, tailVane, 0, 0, 0);

  // --- Thunder: the veins flash on a rolling beat and flicker between. -----------
  let thunderT = 0;
  const thunder = {
    update(dt) {
      thunderT += dt;
      const local = thunderT % 2.6;
      const flash = local < 0.14 ? 1 - local / 0.14 : (local < 0.3 ? 0.5 * (1 - (local - 0.14) / 0.16) : 0);
      const flicker = Math.max(0, Math.sin(thunderT * 23.1) * Math.sin(thunderT * 7.3)) * 0.25;
      veinMat.opacity = 0.35 + Math.min(0.65, flash * 0.65 + flicker);
      veinMat.color.copy(veinBase).multiplyScalar(1 + flash * 0.8);
    },
  };
  const rain = kit.mote(9, { color: 0xaec6e0, size: 0.014, radius: 0.28, height: 0.4, speed: 0.7, seed: 119 });
  kit.at(body, rain, 0, -0.35, 0);
  const spark = kit.heartspark(0.035, pal.eye, { seed: 113 });
  const sp = S.surface(hull, [0, -0.3, 1], { from: [0, 0, 0.08], inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      wings: wings.map((w) => w.bones),
      accents: [...horns, cloud, tailVane],
      fx: [thunder, rain, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'fly',
      breathAmp: 0.9,
      blinkEvery: 4.0,
    },
  };
}
