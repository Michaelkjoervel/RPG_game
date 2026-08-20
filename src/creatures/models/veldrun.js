// =============================================================================
// VELDRUN — Neutral, stage 2 (Vellit awakens at L14).
// "Swift antelope-hare, ribbon tail streams when sprinting. Aloof racer."
// (Design Bible §4)
// =============================================================================
// Keeps Vellit's sandy palette and big ears (now swept back for speed
// instead of standing bolt upright) but the whole silhouette stretches:
// longer neck, longer slim legs, small backswept nub-horns grown into real
// antelope horns. The "ribbon tail" repurposes kit.wing() as a flowing
// energy streamer trailing behind — the same trick tidelorn.js uses for its
// water-mane, applied here to a tail instead of a neck crest.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';

export function build_veldrun(kit = kitDefault) {
  const pal = kit.palette(['neutral']);
  const skin = kit.mat(0xb8a586, { rough: 0.55 });    // cooler, sleeker sandy-tan
  const cream = kit.mat(0xefe4d0, { rough: 0.55 });
  const darkTip = kit.mat(0x453a30, { rough: 0.55 });
  const ribbonMat = kit.mat(0xf2e8c8, { unlit: true, additive: true, opacity: 0.6 });

  const root = new THREE.Group();

  // Long lean torso — a stretched capsule reads faster than a blob. It runs
  // nose-to-tail along Z, so the capsule's axis swing is baked about X; about Z
  // would put the long axis on X and lay the racer sideways across the view.
  const body = kit.capsule(0.115, 0.34, skin, { capSeg: 4, radSeg: 9 });
  body.geometry.rotateX(Math.PI / 2);
  // Sleek racer two-tone: dust-shadow underside up to a sun-bleached back.
  kit.paint(body, { from: 0x8a744f, to: 0xd8c8a2, noise: 0.05, seed: 63 });
  root.add(body);
  body.position.y = 0.5;

  // Pale cream underbelly stripe — same nose-to-tail axis as the torso.
  const bellyStripe = kit.capsule(0.075, 0.24, cream, { capSeg: 3, radSeg: 7 });
  bellyStripe.geometry.rotateX(Math.PI / 2);
  bellyStripe.scale.set(0.6, 0.55, 1);
  kit.at(body, bellyStripe, 0, -0.08, 0.02);

  // Long neck + slender head, held high — an aloof, racer's poise.
  const neck = kit.at(body, kit.capsule(0.058, 0.16, skin, { capSeg: 3, radSeg: 7 }), 0, 0.12, 0.2, { rx: -0.55 });
  kit.paint(neck, { from: 0x9a835c, to: 0xd8c8a2, noise: 0.04, seed: 64 });
  const head = kit.at(neck, kit.orb(0.082, skin, { sz: 1.15, sy: 0.88 }), 0, 0.12, 0.055);
  kit.paint(head, { from: 0xa08a62, to: 0xdccda8, noise: 0.04, seed: 65 });
  // Slim cream muzzle with a dark nose.
  kit.at(head, kit.snout(0.075, cream.clone(), { r: 0.034, taper: 0.42, up: 0.1 }), 0, -0.03, 0.055);
  kit.at(head, kit.orb(0.011, darkTip.clone()), 0, -0.012, 0.125);
  const eyeL = kit.at(head, kit.eye(0.034, { irisColor: 0x241d14, skinColor: 0xb8a586, glintSize: 0.013 }), 0.052, 0.014, 0.065, { ry: 0.26 });
  const eyeR = kit.at(head, kit.eye(0.034, { irisColor: 0x241d14, skinColor: 0xb8a586, glintSize: 0.013 }), -0.052, 0.014, 0.065, { ry: -0.26 });

  // Backswept antelope horns — grown up from Vellit's fawn nubs, long enough
  // now to co-own the silhouette with the swept ears.
  const hornL = kit.at(head, kit.horn(0.17, darkTip, { bend: -0.38, baseR: 0.017, tipR: 0.004 }), 0.032, 0.075, -0.01, { rz: 0.12, rx: -0.35 });
  const hornR = kit.at(head, kit.horn(0.17, darkTip, { bend: -0.38, baseR: 0.017, tipR: 0.004 }), -0.032, 0.075, -0.01, { rz: -0.12, rx: -0.35 });

  // Ears, swept back for speed rather than upright.
  const earL = kit.at(head, kit.ear(0.1, skin), 0.05, 0.06, -0.03, { rz: 0.3, rx: -0.5 });
  const earR = kit.at(head, kit.ear(0.1, skin), -0.05, 0.06, -0.03, { rz: -0.3, rx: -0.5 });

  // --- Legs: four long, slender legs built for a full sprint. ---
  // Hip Y is local to the torso — just under the belly line, from where
  // kit.leg(0.38) drops 0.393 and the hooves land on y=0. Fore/hind pairs sit
  // under the shoulders and haunches of the 0.285 torso half-length.
  const legDefs = [
    [0.09, -0.107, 0.2], [-0.09, -0.107, 0.2],
    [0.09, -0.107, -0.2], [-0.09, -0.107, -0.2],
  ];
  const legs = legDefs.map(([x, y, z]) => kit.at(body, kit.leg(0.38, skin, { thighR: 0.058, shinR: 0.037, footLen: 0.08 }), x, y, z));

  // Ribbon tail: an energy-style wing() re-purposed as a flowing streamer
  // rather than a membrane, angled back and drooping like a banner caught
  // in the creature's own slipstream.
  const ribbon = kit.wing(0.42, ribbonMat, { style: 'energy', bones: 4, width: 0.1, droop: 0.5 });
  kit.at(body, ribbon, 0, 0.07, -0.27, { rx: 0.25, ry: Math.PI / 2 });

  const spark = kit.heartspark(0.035, pal.eye, { seed: 63 });
  kit.at(body, spark, 0, 0.03, 0.14);

  root.add(kit.shadowDisc(0.3, 0.36));

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      head,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      legs: legs.map((l) => ({ hip: l.hip, knee: l.knee, foot: l.foot })),
      accents: [earL, earR, hornL, hornR, neck, ribbon.group],
      fx: [spark],
    },
    hints: {
      personality: 'regal',
      locomotion: 'quad',
      breathAmp: 0.75,
      blinkEvery: 4.0,
    },
  };
}
