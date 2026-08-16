// =============================================================================
// NYXMARA, THE DUSKVEIL — Umbra/Gale, Firstborn legendary.
// "Panther with vast moth wings of night-sky, drinks fear, leaves calm.
// Post-game roaming." (Design Bible §4, §2)
// =============================================================================
// A CROWN JEWEL — the second Firstborn. Vantash establishes this game's
// "sleek void panther" body language; Nyxmara takes that same silhouette
// language and scales it up into something vast and majestic by fusing it
// with a moth's wings. The wings are the whole point: two huge
// `kit.wing({style:'feathered'})` panels in deep umbra-violet, each
// scattered with dozens of tiny emissive "star" points (small unlit
// spheres, not a shader — but at this density it reads as a starfield
// pattern woven into the wing membrane) plus a pair of pale moth-eye
// markings near the wing roots. Its idle is explicitly "calm menace":
// `hints.personality:'calm'` (slow, deliberate, unhurried — the opposite of
// a twitchy predator) combined with unusually slow blinking and a low,
// heavy-feeling breath.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import { seededRandom } from '../../core/rng.js';

function starfield(kit, wingBone, count, spanLen, spanW, seed) {
  const group = new THREE.Group(); group.name = 'starfield';
  wingBone.add(group);
  const rng = seededRandom(seed);
  const m = kit.mat(0xe8e0ff, { unlit: true, transparent: true, opacity: 0.85 });
  const stars = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.006 + rng() * 0.007, 5, 4), m.clone());
    s.position.set(rng() * spanLen, (rng() - 0.5) * spanW, (rng() - 0.5) * 0.01);
    group.add(s);
    stars.push({ mesh: s, ph: rng() * Math.PI * 2, sp: 0.4 + rng() * 0.6 });
  }
  let t = 0;
  function update(dt) {
    t += dt;
    for (const st of stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * st.sp + st.ph);
      st.mesh.material.opacity = 0.35 + tw * 0.55;
      st.mesh.scale.setScalar(0.7 + tw * 0.5);
    }
  }
  return { group, update };
}

export function build_nyxmara(kit = kitDefault) {
  const pal = kit.palette(['umbra', 'gale']);
  // The night legendary stays the darkest of the umbra set, but lifted to a
  // readable violet-slate with a faint self-glow — its "night-sky" identity
  // lives in the starfield wings and glow accents, not in a black mass.
  const fur = kit.mat(0x4e4472, { rough: 0.4, emissive: 0x241d42, emissiveIntensity: 0.55 });
  const furLight = kit.mat(0x5c5288, { rough: 0.42 });
  const wingMat = kit.mat(0x4c4276, { rough: 0.3, transparent: true, opacity: 0.94, side: THREE.DoubleSide, emissive: 0x2a2154, emissiveIntensity: 0.45 });
  const glowMat = kit.mat(0xb09fe0, { unlit: true, transparent: true, opacity: 0.8 });

  const root = new THREE.Group();

  // Panther barrel running nose-to-tail along Z — the capsule's axis swing is
  // baked about X (about Z would put it on the X axis, sideways to the view).
  // Torso height comes from the leg length below so the paws reach the ground.
  const body = kit.capsule(0.24, 0.62, fur, { capSeg: 5, radSeg: 10 });
  body.geometry.rotateX(Math.PI / 2);
  root.add(body);
  body.position.y = 0.72;

  // Spine glow: same nose-to-tail axis as the body, and it has to break the
  // torso's surface (radius 0.24) or it just glows away invisibly inside.
  const spineGlow = kit.capsule(0.03, 0.56, glowMat, { capSeg: 3, radSeg: 6 });
  spineGlow.geometry.rotateX(Math.PI / 2);
  kit.at(body, spineGlow, 0, 0.235, 0);

  const head = kit.at(body, kit.blob(0.2, fur, { seed: 180, squash: { x: 0.9, y: 0.85, z: 1.15 } }), 0, 0.1, 0.46);
  const eyeL = kit.at(head, kit.eye(0.055, { irisColor: 0xd8c8ff, scleraColor: 0x0c0a14, pupil: true, skinColor: 0x4e4472, glintSize: 0.02 }), 0.11, 0.02, 0.15, { ry: 0.35 });
  const eyeR = kit.at(head, kit.eye(0.055, { irisColor: 0xd8c8ff, scleraColor: 0x0c0a14, pupil: true, skinColor: 0x4e4472, glintSize: 0.02 }), -0.11, 0.02, 0.15, { ry: -0.35 });
  const earL = kit.at(head, kit.ear(0.09, fur), 0.11, 0.13, -0.02, { rz: 0.2 });
  const earR = kit.at(head, kit.ear(0.09, fur), -0.11, 0.13, -0.02, { rz: -0.2 });
  const muzzle = kit.at(head, kit.orb(0.08, furLight, { sz: 1.15, sy: 0.65 }), 0, -0.06, 0.17);

  // --- Vast moth wings: feathered, deep night-sky, starfield-speckled. ---
  const wingR = kit.wing(0.95, wingMat, { style: 'feathered', bones: 4, width: 0.6, droop: 0.08 });
  kit.at(body, wingR, 0.16, 0.28, -0.1, { rx: -0.05, ry: -0.1 });
  const wingL = kit.wing(0.95, wingMat, { style: 'feathered', bones: 4, width: 0.6, droop: 0.08 });
  kit.at(body, wingL, -0.16, 0.28, -0.1, { rx: -0.05, ry: 0.1, sx: -1 });
  const starsR = starfield(kit, wingR.bones[1], 26, 0.65, 0.5, 300);
  const starsL = starfield(kit, wingL.bones[1], 26, 0.65, 0.5, 301);

  // Pale moth-eye markings near the wing roots — a calm, watchful accent.
  const eyeSpotL = kit.at(wingR.bones[0], kit.crystal(0.05, glowMat, { coreColor: 0xffffff, detail: 0 }), 0.15, 0.02, 0);
  const eyeSpotR = kit.at(wingL.bones[0], kit.crystal(0.05, glowMat, { coreColor: 0xffffff, detail: 0 }), -0.15, 0.02, 0);

  // Hips ride just inside the belly (local Y is measured from the barrel's
  // centre); kit.leg(0.5) drops 0.537 from there, planting the paws on y=0.
  // Fore/hind pairs sit under shoulders and haunches of the 0.55 half-length.
  const legDefs = [
    [0.16, -0.183, 0.38], [-0.16, -0.183, 0.38],
    [0.16, -0.183, -0.36], [-0.16, -0.183, -0.36],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.5, fur, { thighR: 0.085, shinR: 0.06, footLen: 0.13 }), x, y, z));

  const tail = kit.at(body, kit.tailChain(7, fur, { segLen: 0.1, startR: 0.05, endR: 0.014 }), 0, 0.1, -0.5);
  const tailStar = kit.at(tail.pivots[tail.pivots.length - 1], kit.crystal(0.025, glowMat, { coreColor: 0xffffff, detail: 0 }), 0, 0, -0.05);

  // Fear-drinking wisps drawn faintly toward the mouth, calm dark motes
  // drifting outward from the body — "drinks fear, leaves calm."
  const wisps = kit.mote(10, { color: 0x9a8cc8, size: 0.02, radius: 0.5, height: 0.35, speed: 0.22, seed: 181 });
  kit.at(body, wisps, 0, 0.1, 0);

  const spark = kit.heartspark(0.05, pal.eye, { seed: 182 });
  kit.at(body, spark, 0, 0.04, 0.24);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: tail.pivots,
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      wings: [wingR.bones, wingL.bones],
      accents: [earL, earR, tailStar],
      fx: [starsR, starsL, wisps, spark],
    },
    hints: {
      personality: 'calm',
      locomotion: 'fly',
      breathAmp: 0.6,
      blinkEvery: 6.2,
    },
  };
}
