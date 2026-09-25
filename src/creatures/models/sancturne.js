// =============================================================================
// SANCTURNE — Lumen/Umbra, stage 1 (single-stage), rare.
// "Ghost bound to a cracked reliquary urn, keeper of the Ruins' oldest
// trial." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). v1's silhouette was busy (urn + rubble +
// three tendrils + fins + halo all competing). v2 keeps THREE clean shapes:
//   1. THE URN — a smooth, elegant lathed reliquary (foot, round belly,
//      shoulder, narrow neck, flared lip) in violet-slate stone, leaning a few
//      degrees, a worn gold band at the shoulder and gold light leaking from
//      cracks laid ON its surface.
//   2. THE KEEPER — one hooded figure of pale light rising out of the neck:
//      a soft torso whose lower body pours back DOWN into the urn as a single
//      curling wisp (parts.tail — it sways), two soft sleeve-arms held over
//      the urn it guards, a deep hood with a dark void face and gold eyes.
//   3. THE BROKEN HALO — a shattered ring of shard-gold light behind the
//      hood, one arc missing, slowly counter-rotating.
// parts.body is the ghost torso (breath/hover), the urn stays planted.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const URN_LO = 0x2e2744, URN_HI = 0x8a7eaa, GOLD = 0xffe9b0, GHOST_LO = 0x6a5ca8, GHOST_HI = 0xeee8ff;

// Reliquary profile (radius, height) from the foot up to the lip.
function urnGeo() {
  const pts = [
    [0.001, 0], [0.12, 0], [0.13, 0.02], [0.1, 0.05], [0.14, 0.09], [0.22, 0.18], [0.27, 0.3], [0.265, 0.4],
    [0.22, 0.5], [0.14, 0.58], [0.085, 0.64], [0.075, 0.7], [0.1, 0.75], [0.115, 0.77], [0.1, 0.78], [0.07, 0.76], [0.001, 0.74],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return S.smooth(new THREE.LatheGeometry(pts, 26), 0.9);
}

export function build_sancturne(kit = kitDefault) {
  const pal = kit.palette(['lumen', 'umbra']);
  const stone = S.vcMat(kit, { rough: 0.48, metal: 0.05 });
  const goldMat = kit.mat(GOLD, { unlit: true, transparent: true, opacity: 0.95 });
  const goldSoft = kit.mat(0xffd98c, { unlit: true, transparent: true, opacity: 0.8 });
  // Ghost-stuff is unlit but NOT additive (additive over a lit stage blows
  // out to a white blob; straight alpha keeps the violet -> pale gradient).
  const ghost = kit.mat(0xffffff, { unlit: true, transparent: true, opacity: 0.86, vertexColors: true });
  ghost.userData.softVC = true;
  const hoodMat = S.vcMat(kit, { rough: 0.5, transparent: true, opacity: 0.94 });

  const root = new THREE.Group();

  // --- 1. The reliquary urn -------------------------------------------------
  const urnGroup = new THREE.Group(); urnGroup.name = 'urn';
  root.add(urnGroup);
  urnGroup.rotation.z = 0.07; // nothing this old stands square
  const ug = urnGeo();
  S.paint(ug, { from: URN_LO, to: URN_HI, axis: 'y', noise: 0.02, seed: 5, exp: 0.9 });
  S.overlay(ug, 0xc9a45c, (x, y, z) => S.bump(y, 0.5, 0.018));          // worn gold shoulder band
  S.overlay(ug, 0xb89452, (x, y, z) => (y > 0.73 ? 0.8 : 0));             // gilded lip
  const urn = S.bake([ug], stone, 'urnBody');
  urnGroup.add(urn);
  // gold light leaking from cracks ON the belly
  const cracks = [
    S.groove(ug, [[0.3, 0.15], [0.45, 0.05], [0.4, -0.12], [0.55, -0.25]], { from: [0, 0.3, 0], radius: 0.007, lift: 0.001 }),
    S.groove(ug, [[-0.6, 0.2], [-0.8, 0.05], [-0.7, -0.1]], { from: [0, 0.3, 0], radius: 0.006, lift: 0.001 }),
    S.groove(ug, [[2.4, 0.1], [2.6, -0.05], [2.5, -0.2]], { from: [0, 0.3, 0], radius: 0.006, lift: 0.001 }),
  ];
  const crackMesh = new THREE.Mesh(S.merge(cracks.map((g) => S.paint(g, 0xffffff))), goldMat);
  crackMesh.name = 'urnCracks';
  urnGroup.add(crackMesh);
  const mouthGlow = S.glow(GOLD, 0.34, 0.6);
  mouthGlow.position.set(0, 0.8, 0);
  urnGroup.add(mouthGlow);

  // --- 2. The keeper --------------------------------------------------------
  const torsoGeo = S.spindle({ len: 0.34, r: 0.13, sx: 1.0, sy: 0.85, p: 1, radial: 18, rings: 14, profile: (t) => 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)) });
  torsoGeo.rotateX(-Math.PI / 2); // along +Y: t=1 (shoulders) up
  S.paint(torsoGeo, { from: GHOST_LO, to: GHOST_HI, axis: 'y', noise: 0.02, exp: 0.8 });
  const coreGlow = S.glow(0xf2ecff, 0.3, 0.45);
  const body = new THREE.Mesh(torsoGeo, ghost);
  body.name = 'body';
  body.add(coreGlow);
  kit.at(root, body, 0.03, 1.02, 0.07, { rx: 0.2 });

  // lower body pouring back down into the urn: one curling wisp (the tail)
  const tail = S.softTail(5, ghost, {
    segLen: 0.075, startR: 0.1, endR: 0.03, curl: 0.2, rootPitch: -1.1, radial: 10,
    color: (t) => S.mixHex(0x9a8ad8, 0x4a3d86, t),
  });
  kit.at(body, tail, 0, -0.1, -0.02);

  // Hood: a deep soft cowl over a dark void face, gold eyes.
  const hoodGeo = S.spindle({ len: 0.24, r: 0.12, sx: 0.95, sy: 1.05, p: 1, pTail: 0.9, radial: 18, rings: 14, profile: (t) => 0.9 + 0.12 * S.bump(t, 0.4, 0.45) });
  S.paint(hoodGeo, { from: 0x3a3160, to: 0xa89cd0, axis: 'y', noise: 0.015, seed: 152 });
  const peak = S.taper(0.16, 0.06, { r1: 0.01, curve: -0.6, radial: 10, rings: 7 });
  S.pose(peak, S.surface(hoodGeo, S.dirYP(0, 1.0), { inset: 0.04 }), [-0.9, 0, 0]);
  S.paint(peak, { from: 0x4c4174, to: 0x9c90c4, axis: 'y' });
  const hood = S.bake([hoodGeo, peak], hoodMat, 'hood');
  const head = new THREE.Group(); head.name = 'head';
  head.add(hood);
  kit.at(body, head, 0, 0.23, 0.03, { rx: -0.08 });
  const face = new THREE.Mesh(S.ball(0.085, { sz: 0.55, radial: 16, rings: 10 }), kit.mat(0x120e22, { rough: 0.95 }));
  face.name = 'faceVoid';
  const fp = S.surface(hoodGeo, S.dirYP(0, -0.05), { inset: 0.03 });
  kit.at(head, face, fp[0], fp[1], fp[2]);
  const eyeOpts = { irisColor: 0xffe9b0, scleraColor: 0x241f3a, skinColor: 0x554b7a, glintSize: 0.011 };
  const eyeL = kit.at(face, S.eye(kit, 0.026, eyeOpts), 0.036, 0.004, 0.035, { ry: 0.2 });
  const eyeR = kit.at(face, S.eye(kit, 0.026, eyeOpts), -0.036, 0.004, 0.035, { ry: -0.2 });

  // Soft sleeve-arms held forward over the urn.
  const sleeves = [1, -1].map((sd) => {
    const g = S.taper(0.26, 0.06, { r1: 0.02, curve: 0.45, radial: 10, rings: 8, sx: 1.2, sz: 0.8 });
    S.paint(g, { from: 0xd8d0f8, to: 0x7a6cb8, axis: 'y', noise: 0.02 });
    const m = new THREE.Mesh(g, ghost);
    m.name = 'sleeve';
    kit.at(body, m, sd * 0.1, 0.12, 0.02, { rz: -sd * 2.25, rx: -0.5 });
    return m;
  });

  // --- 3. The broken halo -----------------------------------------------------
  const halo = new THREE.Group(); halo.name = 'halo';
  kit.at(body, halo, 0, 0.3, -0.1);
  const arc1 = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.013, 6, 24, Math.PI * 1.35), goldMat.clone());
  arc1.rotation.z = 0.5;
  halo.add(arc1);
  const arc2 = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.013, 6, 10, Math.PI * 0.4), goldMat.clone());
  arc2.rotation.z = -1.35;
  halo.add(arc2);
  const haloOuter = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.006, 5, 26, Math.PI * 1.7), goldSoft.clone());
  haloOuter.material.opacity = 0.4;
  halo.add(haloOuter);
  const haloGlow = S.glow(GOLD, 0.5, 0.35);
  halo.add(haloGlow);
  let haloT = 0;
  const haloSpin = {
    update(dt) {
      haloT += dt;
      haloOuter.rotation.z = -haloT * 0.35;
      const p = 0.75 + 0.25 * Math.sin(haloT * 1.6);
      arc1.material.opacity = 0.75 * p + 0.2;
      arc2.material.opacity = 0.75 * p + 0.2;
      goldMat.opacity = 0.7 + 0.25 * Math.sin(haloT * 1.1 + 1.7);
    },
  };

  const auraMotes = kit.mote(8, { color: 0xd8ccff, size: 0.02, radius: 0.3, height: 0.32, speed: 0.28, seed: 152 });
  kit.at(body, auraMotes, 0, 0.05, 0);
  const goldRise = kit.mote(5, { color: GOLD, size: 0.016, radius: 0.12, height: 0.4, speed: 0.4, seed: 154 });
  kit.at(urnGroup, goldRise, 0, 0.55, 0);

  const grounded = kit.groundPlant(root);
  const contact = kit.shadowDisc(0.35, 0.34);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      accents: [...sleeves, halo],
      fx: [auraMotes, goldRise, haloSpin, S.variantFx(root)],
    },
    hints: {
      personality: 'calm',
      locomotion: 'float',
      hover: true,
      hoverAmp: 0.05,
      breathAmp: 1.05,
      blinkEvery: 4.4,
    },
  };
}
