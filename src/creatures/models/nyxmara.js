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
import { applyVertexGradient, jitterGeometry } from '../../gfx/materials.js';

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
 * into the wing. Positions are in the panel's own XY.
 */
function starfield(kit, panel, count, span, chord, up, t0, t1, seed) {
  const group = new THREE.Group(); group.name = 'starfield';
  group.position.z = 0.007;                       // a hair proud of the membrane
  panel.add(group);
  const rng = seededRandom(seed);
  const m = kit.mat(0xeae4ff, { unlit: true, transparent: true, opacity: 0.9 });
  const stars = [];
  for (let i = 0; i < count; i++) {
    const t = t0 + (t1 - t0) * (0.05 + rng() * 0.9);
    const [hi, lo] = chordAt(t, chord, up, 1 - up);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.009 + rng() * 0.012, 5, 4), m.clone());
    s.position.set(span * (t - t0), -lo * 0.8 + rng() * (hi + lo) * 0.8, 0);
    group.add(s);
    stars.push({ mesh: s, ph: rng() * Math.PI * 2, sp: 0.4 + rng() * 0.7 });
  }
  let t = 0;
  function update(dt) {
    t += dt;
    for (const st of stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * st.sp + st.ph);
      st.mesh.material.opacity = 0.3 + tw * 0.62;
      st.mesh.scale.setScalar(0.65 + tw * 0.6);
    }
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
  const fur = kit.mat(furHex, { rough: 0.4, emissive: 0x241e46, emissiveIntensity: 0.5 });
  const furLight = kit.mat(0x655a92, { rough: 0.45 });
  const furDark = kit.mat(0x3c355e, { rough: 0.5 });
  // Visual-overhaul pass: the big pelt masses are vertex-gradient painted
  // (near-black violet under-body -> dusk lavender along the spine, faint
  // mottle) so the cat shades as a lit volume instead of one flat purple.
  const furV = kit.mat(0xffffff, { vertexColors: true, rough: 0.4, emissive: 0x241e46, emissiveIntensity: 0.5 });
  const FUR_LO = 0x342c54, FUR_HI = 0x776b9e;
  const paintFur = (mesh, seed, jit = 0) => {
    if (jit) jitterGeometry(mesh.geometry, jit, seed);
    applyVertexGradient(mesh.geometry, { from: FUR_LO, to: FUR_HI, noise: 0.03, seed });
    return mesh;
  };
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

  // --- Panther barrel: long, low, muscular --------------------------------
  const body = kit.capsule(0.19, 0.78, furV, { capSeg: 5, radSeg: 11 });
  body.geometry.rotateX(Math.PI / 2);
  paintFur(body, 71, 0.005);
  root.add(body);

  const LEG = 0.5, THIGH_R = 0.088, SHIN_R = 0.062;
  const legDrop = 0.92 * LEG + 0.25 * THIGH_R + 0.925 * SHIN_R;   // ≈ 0.539
  const hipY = -0.15;
  body.position.y = legDrop - hipY;                               // paws exactly on y=0

  // Chest and haunches: a cat's mass is at the ends, the waist is narrow.
  const chest = kit.at(body, paintFur(kit.orb(0.235, furV, { sy: 1.0, sz: 0.95 }), 72, 0.007), 0, -0.01, 0.34);
  const haunchL = kit.at(body, paintFur(kit.orb(0.17, furV, { sy: 1.15, sz: 1.0 }), 73, 0.006), 0.11, 0.02, -0.32);
  const haunchR = kit.at(body, paintFur(kit.orb(0.17, furV, { sy: 1.15, sz: 1.0 }), 74, 0.006), -0.11, 0.02, -0.32);
  // Standing scapulae — the shoulder blades of a stalking cat break the back
  // line. Small, but they are the difference between "cat" and "barrel".
  const scapL = kit.at(body, kit.orb(0.1, furLight, { sy: 1.25, sz: 0.75 }), 0.115, 0.15, 0.27, { rz: -0.35 });
  const scapR = kit.at(body, kit.orb(0.1, furLight, { sy: 1.25, sz: 0.75 }), -0.115, 0.15, 0.27, { rz: 0.35 });
  // Faint void seam down the spine — proud of the surface (radius 0.19) or it
  // glows away invisibly inside the barrel.
  const spineGlow = kit.capsule(0.022, 0.66, glowMat, { capSeg: 3, radSeg: 6 });
  spineGlow.geometry.rotateX(Math.PI / 2);
  kit.at(body, spineGlow, 0, 0.188, -0.02);
  // Furred thorax mound the wings actually grow out of — without it the wing
  // roots hover above the back with a visible gap under them.
  const thorax = kit.at(body, kit.orb(0.21, furLight, { sy: 0.95, sz: 1.15 }), 0, 0.12, 0.08);
  kit.at(body, kit.fluffTuft(0.13, furLight, { count: 6, seed: 17 }), 0, 0.24, 0.1);
  kit.at(body, kit.fluffTuft(0.1, furLight, { count: 5, seed: 18 }), 0, 0.2, -0.2);

  // --- Head: broad panther skull, moth antennae ---------------------------
  const head = kit.at(body, paintFur(kit.blob(0.2, furV, { seed: 180, squash: { x: 1.0, y: 0.88, z: 1.05 } }), 75), 0, 0.1, 0.55);
  const brow = kit.at(head, kit.orb(0.17, furDark, { sy: 0.55, sz: 0.7 }), 0, 0.1, 0.04);
  const eyeL = kit.at(head, kit.eye(0.062, { irisColor: 0xd8c8ff, scleraColor: 0x120d1e, pupil: true, skinColor: furHex, glintSize: 0.023 }), 0.1, 0.025, 0.155, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.062, { irisColor: 0xd8c8ff, scleraColor: 0x120d1e, pupil: true, skinColor: furHex, glintSize: 0.023 }), -0.1, 0.025, 0.155, { ry: -0.35 });
  const earL = kit.at(head, kit.ear(0.095, fur, { width: 0.1 }), 0.125, 0.12, -0.02, { rz: 0.3 });
  const earR = kit.at(head, kit.ear(0.095, fur, { width: 0.1 }), -0.125, 0.12, -0.02, { rz: -0.3 });
  const muzzle = kit.at(head, kit.orb(0.095, furLight, { sz: 1.2, sy: 0.72 }), 0, -0.07, 0.15);
  kit.at(muzzle, kit.orb(0.03, furDark, { sy: 0.7 }), 0, 0.03, 0.09);
  const fangMat = kit.mat(0xefe8f8, { rough: 0.3 });
  kit.at(muzzle, kit.fang(0.045, fangMat), 0.034, -0.02, 0.05, { rz: 0.12 });
  kit.at(muzzle, kit.fang(0.045, fangMat), -0.034, -0.02, 0.05, { rz: -0.12 });
  // Cheek ruffs — moth-fur, and they widen the head so it reads at distance.
  const cheekL = kit.at(head, kit.fluffTuft(0.08, furLight, { count: 4, seed: 5 }), 0.175, -0.04, 0.02);
  const cheekR = kit.at(head, kit.fluffTuft(0.08, furLight, { count: 4, seed: 6 }), -0.175, -0.04, 0.02);

  // Plumed moth antennae sweeping back over the skull: the single cheapest
  // way to make a cat's head read MOTH before the wings even register.
  const antennae = [];
  for (const side of [1, -1]) {
    const stalk = kit.horn(0.34, furDark, { baseR: 0.016, tipR: 0.004, bend: side * 0.55, segments: 6 });
    const stalkAt = kit.at(head, stalk, side * 0.06, 0.12, 0.03, { rz: -side * 0.5, rx: -0.75 });
    antennae.push(stalkAt);
    for (let i = 1; i <= 5; i++) {
      const t = i / 6;
      const barbLen = 0.075 * (1 - t * 0.5);
      for (const s2 of [1, -1]) {
        kit.at(stalkAt, kit.leafBlade(barbLen, paleMat, { width: barbLen * 0.42 }),
          side * 0.55 * t * t * 0.34, t * 0.34, 0, { rz: s2 * 1.15, ry: s2 * 0.3 });
      }
    }
  }

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
      const spar = kit.capsule(0.017, span * 0.5, sparMat, { capSeg: 3, radSeg: 6 });
      spar.geometry.rotateZ(Math.PI / 2);
      kit.at(panel, spar, span * 0.25, 0, 0.012);
      wingFx.push(starfield(kit, panel, i === 0 ? 20 : 13, span, chord, UP, t0, t1, seed + i));
    });

    if (ocellus) {
      // Pale moth eye-spot: concentric flat discs lying in the membrane.
      const spot = new THREE.Group();
      spot.position.set(span * 0.3, chord * 0.12, 0.009);
      panels[0].add(spot);
      kit.at(spot, kit.orb(chord * 0.19, paleMat, { sz: 0.04 }), 0, 0, 0);
      kit.at(spot, kit.orb(chord * 0.12, wingMat, { sz: 0.04 }), 0, 0, 0.006);
      kit.at(spot, kit.orb(chord * 0.05, glowMat.clone(), { sz: 0.06 }), 0, 0, 0.012);
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

  // --- Legs: heavy padded paws -------------------------------------------
  const legDefs = [
    [0.155, hipY, 0.42], [-0.155, hipY, 0.42],
    [0.165, hipY, -0.4], [-0.165, hipY, -0.4],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(LEG, fur, {
    thighR: THIGH_R, shinR: SHIN_R, footLen: 0.17, footMat: furDark,
  }), x, y, z));
  for (const l of legs) {
    // Shoulder/haunch mass and an elbow bulge — a cat's leg is muscle, and a
    // bare kit.leg() reads as a dowel.
    kit.at(l.hip, kit.orb(0.105, fur, { sy: 1.2, sz: 1.05 }), 0, -0.04, 0);
    kit.at(l.knee, kit.orb(0.068, fur, { sy: 1.15, sz: 1.1 }), 0, 0.01, 0);
    // Toes: three knuckle orbs across the front of each paw, so the feet have
    // weight instead of ending in a bare box.
    for (const tx of [-1, 0, 1]) {
      kit.at(l.foot, kit.orb(0.04, furDark, { sz: 1.2 }), tx * 0.038, -0.005, 0.075);
    }
  }

  // --- Long heavy tail, carried in a slow rising curve ---------------------
  const tail = kit.at(body, kit.tailChain(9, fur, { segLen: 0.115, startR: 0.058, endR: 0.018 }), 0, 0.09, -0.5);
  // Rest pose = whatever the pivots hold when we return, and the animator
  // waves OFFSETS from it: a chain extending -Z lifts when a pivot rotates
  // +X, so this reads as a tail carried up and lazily curled.
  // Rotations COMPOUND down a chain, so per-joint values stay small: the
  // first pass used 0.16/joint and the tail curled into a vertical periscope.
  tail.pivots.forEach((p, i) => {
    p.rotation.x = i === 0 ? 0.42 : (i < 5 ? 0.05 : -0.06);
    p.rotation.y = Math.sin(i * 0.8) * 0.09;
  });
  const tailTuft = kit.at(tail.pivots[tail.pivots.length - 1], kit.fluffTuft(0.055, furDark, { count: 5, seed: 11 }), 0, 0, -0.06);
  const tailStar = kit.at(tail.pivots[tail.pivots.length - 1], kit.crystal(0.03, glowMat, { coreColor: 0xffffff, detail: 0 }), 0, 0, -0.11);

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
  kit.at(body, spark, 0, -0.09, 0.54);

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
      accents: [earL, earR, ...antennae, cheekL, cheekR, tailTuft, tailStar, scapL, scapR, thorax, ...wingAccents],
      fx: [...wingFx, fearWisps, calmDrift, spark],
    },
    hints: {
      personality: 'calm',
      locomotion: 'quad',
      breathAmp: 0.6,
      blinkEvery: 6.2,
    },
  };
}
