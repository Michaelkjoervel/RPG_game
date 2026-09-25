// =============================================================================
// MAGMITE — Ember/Terra, stage 1 uncommon (Skyreach Pass).
// "Magma beetle, cooling-crust shell with lava seams. Carries warmth to
// cold places." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). v1's weak spot was a flat underside; here
// the beetle is round all over: a plump warm-orange belly carried on six
// stubby legs, under a high domed shell of cooled basalt crust split into two
// elytra. Glowing lava seams run between the crust plates and along the
// elytra split (and the belly glows faintly from within). A big round head
// with big eyes, little mandibles and two antennae tipped with embers keeps
// it a cute stage-1. Embers drift up from its back.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const CRUST_LO = 0x1e1614, CRUST_HI = 0x5a4238, BELLY = 0xc8622a, BELLY_HI = 0xf0a050, LAVA = 0xffa33c, LEG = 0x2a1e1a;

export function build_magmite(kit = kitDefault) {
  const pal = kit.palette(['ember', 'terra']);
  const skin = S.vcMat(kit, { rough: 0.55 });
  const lava = kit.mat(LAVA, { unlit: true });

  const root = new THREE.Group();

  // --- Body: a plump, ROUND beetle belly (warm, faintly glowing). ----------
  const bodyGeo = S.spindle({ len: 0.36, r: 0.15, sx: 1.12, sy: 0.82, p: 0.95, radial: 18, rings: 12, profile: (t) => 0.9 + 0.12 * S.bump(t, 0.45, 0.45) });
  S.paint(bodyGeo, { from: BELLY, to: BELLY_HI, axis: 'y', noise: 0.015, seed: 90 });
  // belly segment lines
  for (let i = 0; i < 3; i++) S.overlay(bodyGeo, 0x8a3a18, (x, y, z) => (y < 0 ? S.bump(z, -0.08 + i * 0.07, 0.008) * 0.7 : 0));
  const body = S.bake([bodyGeo], skin, 'body');
  root.add(body);
  body.position.y = 0.14;
  const underGlow = S.glow(0xff7a2a, 0.36, 0.35);
  underGlow.position.set(0, -0.06, 0);
  body.add(underGlow);

  // --- The domed crust shell (two elytra), lava seams (an accent). --------
  const shellGeo = S.spindle({ len: 0.4, r: 0.175, sx: 1.12, sy: 1.0, p: 0.95, radial: 20, rings: 14, profile: (t) => 0.92 + 0.1 * S.bump(t, 0.45, 0.45) });
  const sp = shellGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) { const y = sp.getY(i); if (y < 0.01) sp.setY(i, 0.01 + (y - 0.01) * 0.15); }
  S.smooth(shellGeo);
  S.paint(shellGeo, { from: CRUST_LO, to: CRUST_HI, axis: 'y', noise: 0.03, seed: 91 });
  // crust plates: lighter lumps between the seams
  for (const [yaw, pitch, z, r] of [[0.5, 0.9, 0.08, 0.05], [-0.5, 0.9, 0.06, 0.05], [0.6, 0.6, -0.08, 0.05], [-0.6, 0.6, -0.1, 0.05], [0.35, 1.1, -0.05, 0.04], [-0.35, 1.1, -0.02, 0.04]]) {
    S.blush(shellGeo, S.surface(shellGeo, S.dirYP(yaw, pitch), { from: [0, 0, z] }), r, 0x6a5044, 0.6);
  }
  const shell = S.bake([shellGeo], skin, 'shell');
  kit.at(body, shell, 0, 0.02, -0.01);
  const seams = [
    S.grooveTop(shellGeo, [[0, 0.19], [0.004, 0.08], [-0.004, -0.04], [0, -0.17]], { radius: 0.012, lift: 0.001 }),
    S.groove(shellGeo, [[0.4, 1.0], [0.8, 0.8], [1.1, 0.5]], { from: [0, 0, 0.02], radius: 0.008, lift: 0.001 }),
    S.groove(shellGeo, [[-0.4, 0.95], [-0.8, 0.75], [-1.15, 0.45]], { from: [0, 0, -0.03], radius: 0.008, lift: 0.001 }),
    S.groove(shellGeo, [[0.35, 0.7], [0.7, 0.55], [0.95, 0.35]], { from: [0, 0, -0.12], radius: 0.007, lift: 0.001 }),
    S.groove(shellGeo, [[-0.3, 0.75], [-0.65, 0.6], [-0.9, 0.4]], { from: [0, 0, 0.11], radius: 0.007, lift: 0.001 }),
  ];
  const seamMesh = new THREE.Mesh(S.merge(seams.map((g) => S.paint(g, 0xffffff))), lava);
  seamMesh.name = 'lavaSeams';
  shell.add(seamMesh);

  // --- Head: big and round, mandibles, ember antennae. ----------------------
  const headGeo = S.ball(0.1, { sx: 1.1, sy: 0.92, sz: 0.95, radial: 18, rings: 12 });
  S.paint(headGeo, { from: CRUST_LO, to: 0x6a4e40, axis: 'y', noise: 0.012, seed: 92 });
  S.overlay(headGeo, BELLY, (x, y, z) => S.sstep(-0.02, -0.06, y) * S.sstep(0.0, 0.06, z) * 0.8);
  const mand = [1, -1].map((sd) => {
    const g = S.taper(0.05, 0.016, { r1: 0.004, curve: 0.6, radial: 6, rings: 5 });
    g.rotateX(Math.PI / 2);
    g.rotateY(-sd * 0.5);
    S.paint(g, 0x2a1e1a);
    return S.pose(g, S.surface(headGeo, S.dirYP(sd * 0.35, -0.5), { inset: 0.012 }));
  });
  const head = S.bake([headGeo, ...mand], skin, 'head');
  kit.at(body, head, 0, 0.02, 0.2, { rx: -0.08 });
  const eyeOpts = { irisColor: 0xffb25c, pupilColor: 0x2a1406, scleraColor: 0xfff4e6, skinColor: 0x3a2a24, glintSize: 0.014 };
  const eyeL = S.seatEye(kit, head, headGeo, 0.04, 0.5, 0.15, eyeOpts, { sink: 0.42, front: 0.55 });
  const eyeR = S.seatEye(kit, head, headGeo, 0.04, -0.5, 0.15, eyeOpts, { sink: 0.42, front: 0.55 });
  const antennae = [1, -1].map((sd) => {
    const g = new THREE.Group(); g.name = 'antenna';
    const stalk = S.taper(0.11, 0.008, { r1: 0.004, curve: 0.45, radial: 5, rings: 6 });
    S.paint(stalk, 0x2a1e1a);
    g.add(new THREE.Mesh(stalk, skin));
    const tip = new THREE.Mesh(S.ball(0.016, { radial: 8, rings: 6 }), lava);
    tip.position.set(0, 0.105, 0.11 * 0.45 * 0.9);
    g.add(tip);
    const tg = S.glow(0xffa33c, 0.08, 0.6);
    tg.position.copy(tip.position);
    g.add(tg);
    const at = S.surface(headGeo, S.dirYP(sd * 0.3, 0.85), { inset: 0.004 });
    kit.at(head, g, at[0], at[1], at[2], { rz: -sd * 0.4, rx: -0.2 });
    return g;
  });

  // --- Six stubby legs. ---------------------------------------------------------
  const legs = [];
  for (const [z, i] of [[0.1, 0], [-0.01, 1], [-0.12, 2]]) for (const sd of [1, -1]) {
    const l = S.softLeg(0.1, skin, { stubby: true, thighR: 0.026, kneeR: 0.02, pawR: 0.024, pawLen: 1.3, toes: 0, color: LEG, pawColor: 0x1a1210, radial: 7 });
    kit.at(body, l, sd * 0.13, -0.05, z, { rz: sd * (0.55 + i * 0.05), ry: sd * (0.3 - i * 0.3) });
    legs.push(l);
  }

  const embers = kit.mote(6, { color: 0xff9a3c, size: 0.014, radius: 0.12, height: 0.18, speed: 0.5, seed: 93 });
  kit.at(body, embers, 0, 0.18, 0);
  const spark = kit.heartspark(0.022, pal.eye, { seed: 94 });
  kit.at(head, spark, 0, -0.07, 0.07);

  const grounded = kit.groundPlant(root);
  const contact = kit.shadowDisc(0.26, 0.38);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [...antennae, shell],
      fx: [embers, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'heavy',
      locomotion: 'quad',
      breathAmp: 0.7,
      blinkEvery: 3.4,
    },
  };
}
