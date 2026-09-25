// =============================================================================
// REVERBANE — Gale/Umbra, stage 2 (Sonark awakens at L23).
// "Sleek sound-wraith bat, wings ripple with visible echo-rings." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). Sonark's gossip grown into a sleek wraith:
// a dart-shaped dusk-violet body with a pale lavender chest ruff, hung
// between two big raised membrane wings (real arm + finger spars, scalloped
// edges, lavender at the root fading to void at the tips). The head is sleek
// with a small nose-leaf, tiny fangs, pale glowing eyes and two tall crescent
// radar ears lit faintly from inside. The signature: ECHO-RINGS — pale rings
// ripple outward across each wing on a loop, sung out by a pulsing sonar
// bead at the throat. A short tail ends in a diamond sound-vane.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const FUR_LO = 0x2a2446, FUR = 0x4a4270, FUR_HI = 0x7d73a8, RUFF = 0xb8acd8, INNER = 0xcfc4ff, VOID = 0x1e1a36;

// Rings rippling outward across a wing panel (flat on the membrane plane).
function echoRings(kit, bone, spots, seed) {
  const group = new THREE.Group(); group.name = 'echoRings';
  bone.add(group);
  const geo = new THREE.RingGeometry(0.03, 0.038, 24);
  geo.rotateX(-Math.PI / 2);
  const rings = spots.map(([x, z]) => {
    const m = kit.mat(0xd8e4ff, { unlit: true, transparent: true, opacity: 0, side: THREE.DoubleSide });
    m.depthWrite = false;
    const ring = new THREE.Mesh(geo, m);
    ring.name = 'echoRing';
    ring.position.set(x, 0.006, z);
    group.add(ring);
    return ring;
  });
  let t = seed * 0.61;
  function update(dt) {
    t += dt;
    const period = 1.8;
    for (let i = 0; i < rings.length; i++) {
      const p = (((t - i * 0.3) % period) + period) % period / period;
      rings[i].scale.setScalar(0.5 + p * 2.4);
      rings[i].material.opacity = 0.75 * (1 - p) * (1 - p) * Math.min(1, p * 8);
    }
  }
  update(0);
  return { group, update };
}

export function build_reverbane(kit = kitDefault) {
  const pal = kit.palette(['gale', 'umbra']);
  const fur = S.vcMat(kit, { rough: 0.55, emissive: 0x1e1934, emissiveIntensity: 0.45 });
  const membrane = kit.mat(0xffffff, { vertexColors: true, rough: 0.45, side: THREE.DoubleSide, transparent: true, opacity: 0.93 });
  membrane.userData.softVC = true;
  const glowMat = kit.mat(INNER, { unlit: true });

  const root = new THREE.Group();

  // --- Body: a sleek dart, pale ruff, tiny tucked feet. ---------------------------
  const torso = S.spindle({
    len: 0.3, r: 0.075, sx: 0.95, sy: 1.0, p: 0.9, pTail: 0.8, radial: 14, rings: 10, belly: 0.06,
    profile: (t) => 0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, t * 0.8 + 0.2)),
  });
  S.paint(torso, { from: FUR_LO, to: FUR_HI, axis: 'y', noise: 0.012, seed: 53 });
  const ruff = S.puff(0.05, { count: 5, spread: 0.7, seed: 8, sy: 0.9, radial: 8, rings: 6 });
  S.paint(ruff, { from: 0x8a7eb8, to: RUFF, axis: 'y' });
  S.pose(ruff, S.surface(torso, [0, -0.2, 1], { from: [0, 0, 0.06], inset: 0.03 }));
  const feet = [1, -1].map((sd) => {
    const g = S.taper(0.04, 0.012, { r1: 0.004, curve: 0.8, radial: 5, rings: 3, capSeg: 1 });
    g.rotateX(Math.PI);
    S.paint(g, VOID);
    return S.pose(g, S.surface(torso, [sd * 0.4, -1, -0.3], { from: [0, 0, -0.08], inset: 0.004 }));
  });
  const body = S.bake([torso, ruff, ...feet], fur, 'body');
  root.add(body);
  body.position.y = 0.42;
  body.rotation.x = -0.15;

  // --- Head: sleek, nose-leaf, fangs, glowing eyes; tall crescent ears. ------------
  const headGeo = S.spindle({
    len: 0.14, r: 0.058, sx: 1.05, sy: 0.95, pTail: 1, pNose: 1.1, radial: 14, rings: 10,
    profile: (t) => (t < 0.5 ? 1 : S.lerp(1, 0.62, S.sstep(0.5, 0.95, t))),
  });
  S.paint(headGeo, { from: FUR_LO, to: FUR_HI, axis: 'y', noise: 0.01, seed: 54 });
  const noseLeaf = S.spindle({ len: 0.012, r: 0.016, sx: 0.8, sy: 1.3, radial: 8, rings: 5 });
  S.paint(noseLeaf, 0x2a2240);
  S.pose(noseLeaf, S.surface(headGeo, [0, 0.35, 1], { inset: 0.002 }), [-0.3, 0, 0]);
  const fangs = [1, -1].map((sd) => {
    const g = S.taper(0.02, 0.005, { r1: 0.0015, radial: 5, rings: 3, capSeg: 1 });
    g.rotateX(Math.PI);
    S.paint(g, 0xece6f4);
    return S.pose(g, S.surface(headGeo, [sd * 0.3, -0.5, 1], { from: [0, -0.01, 0.03], inset: 0.003 }));
  });
  const head = S.bake([headGeo, noseLeaf, ...fangs], fur, 'head');
  const hp = S.surface(torso, [0, 0.2, 1], { inset: 0.03 });
  kit.at(body, head, hp[0], hp[1] + 0.03, hp[2] + 0.02, { rx: 0.1 });
  const eyeOpts = { irisColor: 0xd8cfff, pupilColor: 0x3a2e6a, scleraColor: 0x18121e, skinColor: 0x4a4270, glintSize: 0.009, irisScale: 1.2 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.02, 0.5, 0.15, eyeOpts, { sink: 0.4, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.02, -0.5, 0.15, eyeOpts, { sink: 0.4, front: 0.55 });
  const mkEar = () => new THREE.Mesh(S.ear(0.15, 0.075, { color: FUR, inner: INNER, tip: 1.5, cup: 0.6, depth: 0.28, radial: 8, rings: 7 }), fur);
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.6, 0.75), { inset: 0.008 });
  kit.at(head, earL, ea[0], ea[1], ea[2] - 0.01, { rz: -0.4, ry: 0.35, rx: -0.15 });
  kit.at(head, earR, -ea[0], ea[1], ea[2] - 0.01, { rz: 0.4, ry: -0.35, rx: -0.15 });

  // --- Raised membrane wings + echo rings. ------------------------------------------
  const ringFx = [];
  const wings = [1, -1].map((side) => {
    const w = S.batWing(0.46, membrane, fur, {
      side, chord: 0.26, color: { root: 0x7a6eb0, tip: 0x2a2450 }, edge: VOID, spar: FUR_LO, claw: 0xe8e2f2, billow: 0.05,
    });
    const at = S.surface(torso, [side, 0.5, 0.1], { from: [0, 0, 0.02], inset: 0.015 });
    kit.at(body, w, at[0], at[1], at[2], { rz: side * 0.5, ry: -side * 0.2, rx: 0.1 });
    ringFx.push(echoRings(kit, w.bones[1], [[side * 0.06, -0.12], [side * 0.05, -0.08]], side > 0 ? 1 : 2));
    ringFx.push(echoRings(kit, w.bones[2], [[side * 0.07, -0.1]], side > 0 ? 3 : 4));
    return w;
  });

  // --- Short tail with a diamond sound-vane. ---------------------------------------
  const tail = S.softTail(3, fur, { segLen: 0.05, startR: 0.024, endR: 0.01, curl: -0.1, radial: 7, color: (t) => S.mixHex(FUR, FUR_LO, t) });
  kit.at(body, tail, 0, 0, -0.14);
  const vaneGeo = S.spindle({ len: 0.08, r: 0.03, sx: 1, sy: 0.12, p: 0.6, radial: 8, rings: 6, profile: (t) => 0.2 + 0.8 * Math.sin(Math.PI * t) });
  vaneGeo.translate(0, 0, -0.04);
  S.paint(vaneGeo, { from: INNER, to: 0x6e63a0, axis: 'z' });
  const vane = new THREE.Mesh(vaneGeo, fur);
  vane.name = 'vane';
  kit.at(tail.tipAnchor, vane, 0, 0, 0);

  // --- Sonar bead at the throat (it "sings" the rings out). ----------------------------
  const throat = new THREE.Mesh(S.ball(0.014, { radial: 8, rings: 6 }), glowMat);
  throat.name = 'sonarBead';
  const tp = S.surface(torso, [0, -0.35, 1], { from: [0, 0, 0.1], inset: 0.004 });
  throat.position.set(tp[0], tp[1], tp[2]);
  body.add(throat);
  const throatGlow = S.glow(INNER, 0.12, 0.5);
  throatGlow.position.copy(throat.position);
  body.add(throatGlow);
  let tGlow = 0;
  const throatPulse = {
    update(dt) {
      tGlow += dt;
      throatGlow.material.opacity = 0.3 + 0.3 * Math.sin(tGlow * 3.7);
    },
  };

  const spark = kit.heartspark(0.022, pal.eye, { seed: 54 });
  const sp = S.surface(torso, [0, 0, 1], { inset: 0.02 });
  kit.at(body, spark, sp[0], sp[1], sp[2] - 0.02);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      wings: wings.map((w) => w.bones),
      accents: [earL, earR, vane],
      fx: [...ringFx, throatPulse, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'calm',
      locomotion: 'fly',
      breathAmp: 0.9,
      blinkEvery: 3.4,
    },
  };
}
