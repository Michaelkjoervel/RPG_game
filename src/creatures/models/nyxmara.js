// =============================================================================
// NYXMARA, THE DUSKVEIL — Umbra/Gale, Firstborn legendary.
// "Panther with vast moth wings of night-sky, drinks fear, leaves calm.
// Post-game roaming." (Design Bible §4, §2)
// =============================================================================
// A CROWN JEWEL — the second Firstborn, and the one whose silhouette is
// almost entirely ONE idea: the wingspan. Built silhouette-first (Design
// Bible §8):
//
//   1. VAST MOTH WINGS. Two pairs per side — a huge forewing and a smaller
//      hindwing, moth-style, RAISED into a wide V rather than laid flat.
//      Flat wings were the old build's fatal flaw: seen from the game's 3/4
//      camera a horizontal membrane is a thin flap, which is exactly what it
//      read as. Raised, the span becomes the whole outline: ~3.5 units tip to
//      tip against a 1.5-unit body. Each membrane carries a starfield of
//      emissive speckles, a pale moth ocellus, a lighter inner band and a
//      solid leading-edge spar (the spar is what makes the wing read as a
//      hard shape in a black-on-white silhouette test, where the translucent
//      membrane alone would read as mush).
//   2. PANTHER, NOT DOG. Long low barrel (0.78 of midsection against a 0.19
//      radius), standing scapulae that break the back line, a deep chest,
//      heavy padded paws with toes, and a long heavy tail. The old build was
//      a short round barrel on stubby legs — a dog.
//   3. CALM MENACE. `personality:'calm'` (slow, unhurried — the opposite of
//      a twitchy predator), very slow blink, low breath. Fear-wisps drift
//      INTO the muzzle and calm motes leave the body: "drinks fear, leaves
//      calm", visible without a line of dialogue.
//
// KIT CONVENTIONS (kit.js header): faces +Z, nose-to-tail parts bake their
// axis with geometry.rotateX(Math.PI/2) — never rotateZ — and the hips come
// from the measured leg drop so the paws land on y=0.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { seededRandom } from '../../core/rng.js';
import { applyVertexGradient } from '../../gfx/materials.js';
import * as S from './soft.js';

// --- The membrane ------------------------------------------------------------
// These wings are built from a hand-written outline rather than kit.wing()'s
// membrane style, and the reason is worth recording: kit.wing() splits a span
// into per-bone cards whose trailing edges are straight cuts, so a chain of
// them reads as a stack of playing cards with notches at every seam. A moth
// wing is one broad sweep with a scalloped trailing edge, and that has to be a
// single continuous profile. Everything else here stays kit-native (materials,
// attachment, parts contract), and `bones` is still an ordered root→tip chain
// so animator.js can flap it exactly like any other wing.
//
// Panel space: +X spanwise root→tip, +Y chordwise (the membrane straddles the
// spar, mostly ABOVE it), panel lies in local XY so its normal is +Z.

/** Chord half-widths at spanwise fraction t: [above spar, below spar]. */
function chordAt(t, chord, up, down) {
  // A moth wing keeps most of its chord well out along the span and then draws
  // down to an apex — this superellipse-ish falloff holds ~60% of the chord at
  // t=0.8 and closes to a point at the tip. The leading and trailing edges
  // bulge on slightly different phases so the outline isn't symmetric, and a
  // fine ripple gives the fringed moth margin (kept SMALL: a coarse ripple on
  // a chord this deep turns the outline into scalloped lips).
  const close = Math.pow(Math.max(0, 1 - Math.pow(t, 2.2)), 0.55);
  const lead = 1 + 0.12 * Math.sin(t * Math.PI * 0.7);
  const trail = 1 + 0.16 * Math.sin(t * Math.PI * 0.6);
  const scallop = 1 + 0.035 * Math.sin(t * 26);
  return [chord * up * lead * close + chord * 0.02, chord * down * trail * close * scallop];
}

function membraneGeo(span, chord, t0, t1, up, down, steps = 12) {
  const s = new THREE.Shape();
  const X = (t) => span * (t - t0);
  s.moveTo(X(t0), chordAt(t0, chord, up, down)[0]);
  for (let i = 1; i <= steps; i++) {
    const t = t0 + (t1 - t0) * (i / steps);
    s.lineTo(X(t), chordAt(t, chord, up, down)[0]);
  }
  for (let i = steps; i >= 0; i--) {
    const t = t0 + (t1 - t0) * (i / steps);
    s.lineTo(X(t), -chordAt(t, chord, up, down)[1]);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

/**
 * Scatter tiny twinkling "stars" across one membrane panel — a night sky woven
 * into the wing. v2: all of a panel's stars are ONE merged mesh (one draw
 * call instead of ~20) that twinkles as a field; panels run on different
 * phases so the sky still shimmers unevenly. Positions in the panel's XY.
 */
function starfield(kit, panel, count, span, chord, up, t0, t1, seed) {
  const group = new THREE.Group(); group.name = 'starfield';
  group.position.z = 0.007;                       // a hair proud of the membrane
  panel.add(group);
  const rng = seededRandom(seed);
  const m = kit.mat(0xeae4ff, { unlit: true, transparent: true, opacity: 0.9 });
  const geos = [];
  for (let i = 0; i < count; i++) {
    const t = t0 + (t1 - t0) * (0.05 + rng() * 0.9);
    const [hi, lo] = chordAt(t, chord, up, 1 - up);
    const g = new THREE.OctahedronGeometry(0.011 + rng() * 0.013, 0); // 8 tris a star
    g.deleteAttribute('uv');
    g.translate(span * (t - t0), -lo * 0.8 + rng() * (hi + lo) * 0.8, 0);
    geos.push(S.paint(g, 0xffffff));
  }
  const mesh = new THREE.Mesh(S.merge(geos), m);
  mesh.name = 'stars';
  group.add(mesh);
  const ph = rng() * Math.PI * 2, sp = 0.5 + rng() * 0.5;
  let t = 0;
  function update(dt) {
    t += dt;
    const tw = 0.5 + 0.5 * Math.sin(t * sp + ph);
    m.opacity = 0.45 + tw * 0.5;
    group.scale.setScalar(0.96 + tw * 0.06);
  }
  return { group, update };
}

export function build_nyxmara(kit = kitDefault) {
  const pal = kit.palette(['umbra', 'gale']);
  // The night legendary is the darkest of the umbra set but still READS
  // (Design Bible §8): a violet-slate pelt with a faint self-glow, kept
  // deliberately LIGHTER than the wing membranes so the body separates from
  // its own wings instead of fusing into one purple mass.
  const furHex = 0x51477a;
  // Visual pass v2: the pelt is one vertex-painted soft form (see below):
  // near-black violet under-body -> dusk lavender along the spine.
  const FUR_LO = 0x342c54, FUR_HI = 0x776b9e;
  const wingMat = kit.mat(0x201f42, {
    rough: 0.45, transparent: true, opacity: 0.96, side: THREE.DoubleSide,
    emissive: 0x14132c, emissiveIntensity: 0.5,
  });
  // Membrane panels get their own vertex-gradient: dusk-lavender along the
  // spar fading to near-black at the trailing edge, with a fine mottle — the
  // dusty texture of a real moth wing, no shader needed.
  const wingV = kit.mat(0xffffff, {
    vertexColors: true, rough: 0.45, transparent: true, opacity: 0.96,
    side: THREE.DoubleSide, emissive: 0x14132c, emissiveIntensity: 0.5,
  });
  const wingInner = kit.mat(0x322f5e, { rough: 0.5, side: THREE.DoubleSide, emissive: 0x1c1940, emissiveIntensity: 0.45 });
  const sparMat = kit.mat(0x50497e, { rough: 0.45 });
  const glowMat = kit.mat(0xb6a6ea, { unlit: true, transparent: true, opacity: 0.8 });
  const paleMat = kit.mat(0xd9cff5, { rough: 0.4, emissive: 0x6f62a8, emissiveIntensity: 0.5, side: THREE.DoubleSide });

  const root = new THREE.Group();
  const pelt = S.vcMat(kit, { rough: 0.42, emissive: 0x241e46, emissiveIntensity: 0.5 });

  // --- Panther body: deep chest, narrow waist, heavy haunches, standing
  // scapulae and the furred thorax the wings grow from — one sculpted form. --
  const LEG = 0.52;
  const hipY = -0.15;
  const bodyGeo = S.spindle({
    len: 1.22, r: 0.2, sx: 0.95, sy: 1.06, p: 0.9, radial: 18, rings: 14,
    profile: (t) => 0.82 + 0.16 * S.bump(t, 0.2, 0.26) + 0.3 * S.bump(t, 0.76, 0.3),
    belly: (t) => 0.06 + 0.3 * S.bump(t, 0.45, 0.28),
    arch: (t) => 0.03 * S.sstep(0.5, 1, t),
  });
  S.paint(bodyGeo, { from: FUR_LO, to: FUR_HI, axis: 'y', exp: 0.9, noise: 0.012, seed: 71 });
  const scaps = [1, -1].map((sd) => {
    const g = S.ball(0.1, { sx: 0.8, sy: 1.2, sz: 0.75, radial: 12, rings: 9 });
    S.pose(g, S.surface(bodyGeo, S.dirYP(sd * 0.55, 0.9), { from: [0, 0, 0.27], inset: 0.045 }), [0, 0, -sd * 0.35]);
    return S.paint(g, { from: FUR_LO, to: 0x8577b0, axis: 'y' });
  });
  const thorax = S.puff(0.13, { count: 7, spread: 0.7, seed: 17, sy: 0.8, blend: 0.75 });
  S.pose(thorax, [0, 0.22, 0.1]);
  S.paint(thorax, { from: 0x4c4278, to: 0x7e72ac, axis: 'y', noise: 0.02 });
  const body = S.bake([bodyGeo, ...scaps, thorax], pelt, 'body');
  root.add(body);
  body.position.y = LEG - hipY;
  // Faint void seam down the spine, laid ON the pelt.
  const seam = S.grooveTop(bodyGeo, [[0, 0.5], [0.004, 0.3], [0, 0.08], [-0.004, -0.15], [0, -0.35], [0, -0.52]], { radius: 0.016, lift: 0.002, seg: 26 });
  const spineGlow = new THREE.Mesh(S.paint(seam, 0xffffff), glowMat);
  spineGlow.name = 'spineGlow';
  body.add(spineGlow);

  // --- Head: a broad panther wedge, dark brow, moth antennae ---------------
  const headGeo = S.spindle({
    len: 0.4, r: 0.2, sx: 1.0, sy: 1.0, pTail: 1.0, pNose: 1.1, radial: 18, rings: 13, belly: 0.1,
    profile: (t) => (t < 0.5 ? 1.0 : S.lerp(1.0, 0.62, S.sstep(0.5, 0.78, t))) - 0.1 * S.sstep(0.8, 1, t),
    syAt: (t) => S.lerp(0.86, 0.66, S.sstep(0.45, 0.8, t)),
    arch: (t) => -0.05 * S.sstep(0.45, 0.85, t),
  });
  S.paint(headGeo, { from: FUR_LO, to: FUR_HI, axis: 'y', noise: 0.01, seed: 75 });
  S.overlay(headGeo, 0x8a7fb8, (x, y, z) => S.sstep(0.08, 0.16, z) * S.sstep(-0.03, -0.09, y) * 0.8); // pale muzzle
  const SK = [0, 0.02, -0.06];
  const browGeo = S.ball(0.16, { sx: 1.1, sy: 0.4, sz: 0.62, radial: 16, rings: 8 });
  S.pose(browGeo, S.surface(headGeo, S.dirYP(0, 0.75), { from: SK, inset: 0.05 }), [0.2, 0, 0]);
  S.paint(browGeo, { from: 0x2e2850, to: 0x4a4178, axis: 'y' });
  const noseGeo = S.ball(0.034, { sx: 1.3, sy: 0.75, radial: 8, rings: 6 });
  S.pose(noseGeo, S.surface(headGeo, [0, 0.35, 1], { from: [0, -0.02, 0.1], inset: 0.012 }));
  S.paint(noseGeo, 0x201a38);
  const cheekGeos = [];
  for (const sd of [1, -1]) for (let i = 0; i < 3; i++) {
    const g = S.taper(0.1 - i * 0.012, 0.045, { r1: 0.005, curve: -0.3, radial: 6, rings: 5, sx: 1.4, sz: 0.55 });
    S.paint(g, { from: FUR_HI, to: 0xb2a6dc, axis: 'y' });
    S.aim(g, [sd * 0.85, -0.2 + i * 0.25, -0.6]);
    cheekGeos.push(S.pose(g, S.surface(headGeo, [sd, -0.2 + i * 0.2, -0.2], { from: [0, -0.02, -0.02 - i * 0.03], inset: 0.02 })));
  }
  const head = S.bake([headGeo, browGeo, noseGeo, ...cheekGeos], pelt, 'head');
  kit.at(body, head, 0, 0.12, 0.66, { rx: 0.05 });
  const eyeL = S.seatEye(kit, head, headGeo, 0.058, 0.55, 0.12, { irisColor: 0xd8c8ff, scleraColor: 0x120d1e, pupil: true, skinColor: furHex, glintSize: 0.022 }, { sink: 0.45, front: 0.6, from: SK });
  const eyeR = S.seatEye(kit, head, headGeo, 0.058, -0.55, 0.12, { irisColor: 0xd8c8ff, scleraColor: 0x120d1e, pupil: true, skinColor: furHex, glintSize: 0.022 }, { sink: 0.45, front: 0.6, from: SK });
  const mkEar = () => new THREE.Mesh(S.ear(0.12, 0.11, { color: 0x4a4176, inner: 0x7a6aa8, tip: 1.2, cup: 0.5, depth: 0.36 }), pelt);
  const earL = mkEar(), earR = mkEar();
  earL.name = earR.name = 'ear';
  const ea = S.surface(headGeo, S.dirYP(0.75, 0.75), { from: SK, inset: 0.014 });
  kit.at(head, earL, ea[0], ea[1], ea[2], { rz: -0.45, ry: 0.4, rx: -0.15 });
  kit.at(head, earR, -ea[0], ea[1], ea[2], { rz: 0.45, ry: -0.4, rx: -0.15 });
  const fangMat = S.smoothMat(kit, 0xefe8f8, { rough: 0.3 });
  for (const sd of [1, -1]) {
    const f = new THREE.Mesh(S.taper(0.05, 0.014, { r1: 0.003, radial: 6, rings: 5 }), fangMat);
    f.rotation.set(Math.PI - 0.1, 0, -sd * 0.1);
    const p = S.surface(headGeo, [sd * 0.6, -0.8, 0.3], { from: [0, -0.05, 0.1], inset: 0.004 });
    f.position.set(p[0], p[1] + 0.008, p[2]);
    head.add(f);
  }
  const cheekL = earL, cheekR = earR; // (cheek ruffs are baked into the head)

  // Plumed moth antennae sweeping back over the skull: a curved stalk with a
  // soft feathered vane — reads MOTH before the wings even register.
  const antennae = [];
  for (const sd of [1, -1]) {
    const stalk = S.taper(0.36, 0.014, { r1: 0.005, curve: -0.5, radial: 6, rings: 5 });
    S.paint(stalk, 0x3c355e);
    const vane = S.spindle({ len: 0.26, r: 0.045, sx: 1, sy: 0.14, radial: 8, rings: 8, pNose: 1.3, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.95)), 0.6) * (0.5 + 0.5 * t) });
    vane.rotateX(-Math.PI / 2);
    vane.translate(0, 0.2, 0);
    const vp = vane.attributes.position;
    for (let k = 0; k < vp.count; k++) { const y = vp.getY(k); vp.setZ(k, vp.getZ(k) - 0.5 * 0.36 * (y / 0.36) * (y / 0.36)); }
    S.smooth(vane);
    S.paint(vane, { from: 0x9a8ad0, to: 0xd9cff5, axis: 'y' });
    const m = S.bake([stalk, vane], pelt, 'antenna');
    const at = S.surface(headGeo, S.dirYP(sd * 0.25, 0.9), { from: SK, inset: 0.01 });
    kit.at(head, m, at[0], at[1], at[2], { rz: -sd * 0.45, rx: -0.55 });
    antennae.push(m);
  }
  const scapL = null, scapR = null, thoraxAcc = null;

  // --- VAST MOTH WINGS ----------------------------------------------------
  // WHAT THE CAMERA SEES is decided entirely by where the membrane's normal
  // points, and that is what the earlier passes kept getting wrong. Here the
  // panel is authored flat in its bone's XY, so its normal starts at +Z —
  // straight forward. A SOCKET then carries the shoulder angles: `lift`
  // (rotation about Z) swings the span up into a V, and crucially it spins the
  // normal about its own axis, so raising the wings costs nothing in facing;
  // `sweep` (about Y) turns the panel toward or away from the front. The wing
  // itself carries `roll` about its span, raking the membrane back like a real
  // moth's. Result: both wings present most of their area to a 3/4 camera AND
  // to a front camera, which is the whole silhouette.
  // Left side = exact mirror: socket geometry mirrored with scale.x = -1 and
  // its rotation conjugated by that mirror (negate ry/rz, keep rx).
  const wingBones = [];
  const wingFx = [];
  const wingAccents = [];

  // The chord sits mostly ABOVE the spar on purpose. It keeps the membrane's
  // lower edge clear of y=0 (a wing that dips below the paws makes
  // groundPlant() lift the whole animal off its feet) and it buys the model
  // real HEIGHT, which matters because registry.js rescales by height: a wide,
  // short creature gets multiplied into an absurd wingspan.
  function mothWing(span, chord, up, side, x, y, z, roll, sweep, lift, seed, ocellus) {
    const UP = up, DOWN = 1 - up;                  // chord split across the spar
    const socket = new THREE.Group(); socket.name = 'wingSocket';
    kit.at(body, socket, side * x, y, z, { ry: side * sweep, rz: side * lift, sx: side < 0 ? -1 : 1 });
    // Two bones so the animator can ripple the wing along its span; the
    // membrane is split at the same t, using the same profile on both sides of
    // the seam, so the halves join without a notch.
    const inner = new THREE.Group(); inner.name = 'wingBone0';
    kit.at(socket, inner, 0, 0, 0, { rx: roll });
    const outer = new THREE.Group(); outer.name = 'wingBone1';
    kit.at(inner, outer, span * 0.5, 0, 0);
    const bones = [inner, outer];

    const panels = [];
    [[inner, 0, 0.5], [outer, 0.5, 1]].forEach(([bone, t0, t1], i) => {
      const panelGeo = membraneGeo(span, chord, t0, t1, UP, DOWN);
      applyVertexGradient(panelGeo, { from: 0x171531, to: 0x2f2c5c, axis: 'y', noise: 0.035, seed: seed + i * 3 });
      const panel = new THREE.Mesh(panelGeo, wingV);
      panel.name = 'wingMembrane';
      bone.add(panel);
      panels.push(panel);
      // Lighter inner field floated a hair above the membrane: gives every
      // wing a dark outer band without needing a texture.
      const field = new THREE.Mesh(membraneGeo(span, chord * 0.62, t0, t1, UP, DOWN), wingInner);
      field.position.set(0, chord * 0.05, 0.004);
      panel.add(field);
      // Solid spar along the span — the hard edge that makes a translucent
      // wing read as a real shape in a black-on-white silhouette test. This is
      // the one place rotateZ is the RIGHT axis (kit.js's capsule note): a
      // spar is a genuine left-right crossbar, not a nose-to-tail body.
      const spar = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, span * 0.5, 2, 6), sparMat);
      spar.geometry.rotateZ(Math.PI / 2);
      kit.at(panel, spar, span * 0.25, 0, 0.012);
      wingFx.push(starfield(kit, panel, i === 0 ? 13 : 9, span, chord, UP, t0, t1, seed + i));
    });

    if (ocellus) {
      // Pale moth eye-spot: concentric flat discs lying in the membrane.
      const spot = new THREE.Group();
      spot.position.set(span * 0.3, chord * 0.12, 0.009);
      panels[0].add(spot);
      kit.at(spot, new THREE.Mesh(S.ball(chord * 0.19, { sz: 0.04, radial: 14, rings: 5 }), paleMat), 0, 0, 0);
      kit.at(spot, new THREE.Mesh(S.ball(chord * 0.12, { sz: 0.04, radial: 12, rings: 5 }), wingMat), 0, 0, 0.006);
      kit.at(spot, new THREE.Mesh(S.ball(chord * 0.05, { sz: 0.06, radial: 8, rings: 4 }), glowMat.clone()), 0, 0, 0.012);
      wingAccents.push(spot);
    }
    wingBones.push(bones);
  }

  // `up` stays near half: with the membrane stacked above the spar, the lift
  // rotation carries that mass INWARD and the pair closes into a single heart
  // shape over the animal's back instead of two wings.
  for (const side of [1, -1]) {
    // Forewing: the big one, reaching up and out, barely swept.
    mothWing(1.68, 1.02, 0.54, side, 0.12, 0.32, 0.14, -0.28, 0.14, 0.55, 300 + (side > 0 ? 0 : 40), true);
    // Hindwing: shorter, fuller, held much flatter and swept well back, so it
    // spreads the outline sideways behind the forewing instead of stacking on
    // top of it into one bouquet.
    mothWing(1.04, 0.86, 0.62, side, 0.13, 0.2, -0.3, -0.5, 1.08, 0.06, 360 + (side > 0 ? 0 : 40), false);
  }

  // --- Legs: heavy, muscled, padded paws with toes ----------------------
  const legDefs = [
    [0.155, hipY, 0.42, -0.1, 0.1], [-0.155, hipY, 0.42, -0.1, 0.1],
    [0.165, hipY, -0.4, 0.35, 0.12], [-0.165, hipY, -0.4, 0.35, 0.12],
  ];
  const legs = legDefs.map(([x, y, z, bend, thighR]) => kit.at(body, S.softLeg(LEG, pelt, {
    thighR, shinR: 0.058, kneeR: 0.066, ankleR: 0.05, pawR: 0.07, pawLen: 1.25, toes: 3,
    bend, split: 0.5, bulge: 0.3, color: 0x51477a, shinColor: 0x463d6c, pawColor: 0x3a3360, radial: 8,
  }), x, y, z));

  // --- Long heavy tail, carried in a slow rising curve ---------------------
  const tail = S.softTail(7, pelt, {
    segLen: 0.14, startR: 0.066, endR: 0.03, rootPitch: 0.42, radial: 8,
    curl: (i) => (i < 3 ? 0.05 : -0.07), yaw: 0.06,
    color: (t) => S.mixHex(0x51477a, 0x3c355e, t),
  });
  kit.at(body, tail, 0, 0.09, -0.58);
  const tailTuft = kit.at(tail.tipAnchor, new THREE.Mesh(S.paint(S.puff(0.06, { count: 5, seed: 11, sy: 1.1 }), 0x3c355e), pelt), 0, 0, -0.02);
  const tailStar = kit.at(tail.tipAnchor, kit.crystal(0.03, glowMat, { coreColor: 0xffffff, detail: 0 }), 0, 0, -0.07);
  const starGlow = S.glow(0xb6a6ea, 0.16, 0.6);
  tailStar.add(starGlow);

  // --- "Drinks fear, leaves calm" -----------------------------------------
  // Two mote fields with opposite characters: tight, quick wisps gathering at
  // the muzzle (the fear going in) and a wide, slow, cool drift leaving the
  // body (the calm coming out).
  const fearWisps = kit.mote(9, { color: 0x8f7fc4, size: 0.022, radius: 0.22, height: 0.2, speed: 0.75, seed: 181 });
  kit.at(head, fearWisps, 0, -0.04, 0.24);
  const calmDrift = kit.mote(12, { color: 0xc9bcf0, size: 0.026, radius: 0.85, height: 0.7, speed: 0.16, seed: 182 });
  kit.at(body, calmDrift, 0, 0.16, -0.1);

  // On the chest SURFACE: the chest orb (r 0.235 at z 0.34) reaches z ≈ 0.57.
  const spark = kit.heartspark(0.055, pal.eye, { seed: 183 });
  const spk = S.surface(bodyGeo, S.dirYP(0, -0.2), { from: [0, 0, 0.35], inset: 0.012 });
  kit.at(body, spark, spk[0], spk[1], spk[2] + 0.05);

  const grounded = kit.groundPlant(root);
  // Soft contact shadow so the creature reads planted on any ground.
  const contact = kit.shadowDisc(0.55, 0.32);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      wings: wingBones,
      accents: [earL, earR, ...antennae, tailTuft, tailStar, ...wingAccents],
      fx: [...wingFx, fearWisps, calmDrift, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'calm',
      locomotion: 'quad',
      breathAmp: 0.6,
      blinkEvery: 6.2,
    },
  };
}
