// =============================================================================
// OOZEL — Venom, stage 1, common.
// "Dripstone slime with mineral crust hat. Absorbs puddles." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). A chubby, glossy little dollop of violet
// slime: one smooth soft mound with a flared puddle skirt and a couple of
// drips sliding down its sides, deep murky violet at the base rising to a
// bright lilac shoulder, slightly translucent. Big friendly eyes and a small
// smile. The signature: a MINERAL CRUST HAT — a lumpy sandstone cap with two
// tiny dripstone spikes, worn at a rakish tilt (an accent: it wobbles).
// Absorbed puddle droplets rise and pop inside it. (Width:height stays
// under ~1.4:1 so registry's height rescale never balloons it.)

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const GOO_LO = 0x3e1e5a, GOO = 0x8a4cb4, GOO_HI = 0xd8a4f0, CRUST_LO = 0x4c4432, CRUST_HI = 0x9a8c62;

// A soft dollop: lathe bottom -> top (outward normals) with two drips.
function dollop() {
  const pts = [[0.001, 0], [0.2, 0], [0.225, 0.014], [0.215, 0.04], [0.19, 0.1], [0.155, 0.16], [0.1, 0.205], [0.001, 0.225]];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 22);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (Math.hypot(x, z) < 1e-4) continue;
    const a = Math.atan2(x, z);
    let k = 1 + 0.02 * Math.sin(a * 3 + y * 12);
    for (const [da, s] of [[1.3, 1], [3.9, 0.8]]) {
      const d = Math.atan2(Math.sin(a - da), Math.cos(a - da));
      k += 0.08 * s * Math.exp(-d * d * 50) * S.sstep(0.17, 0.05, y) * S.sstep(0.0, 0.03, y);
    }
    pos.setXYZ(i, x * k, y, z * k * 0.92);
  }
  S.smooth(g);
  return g;
}

export function build_oozel(kit = kitDefault) {
  const pal = kit.palette(['venom']);
  const goo = S.vcMat(kit, { rough: 0.22, metal: 0.05 });
  const crust = S.vcMat(kit, { rough: 0.8 });

  const root = new THREE.Group();

  // --- Body: the dollop, with a smile. -----------------------------------------------
  const bodyGeo = dollop();
  S.paint(bodyGeo, { from: GOO_LO, to: GOO_HI, axis: 'y', exp: 0.85, noise: 0.015, seed: 63 });
  S.overlayN(bodyGeo, 0xf2dcff, (nx, ny, nz) => S.sstep(0.55, 0.9, ny * 0.7 + nz * 0.5 + nx * 0.3) * 0.5);
  const smile = S.paint(S.groove(bodyGeo, [[-0.35, 0.05], [-0.15, -0.02], [0, -0.03], [0.15, -0.02], [0.35, 0.05]], { from: [0, 0.07, 0], radius: 0.005, lift: -0.001 }), 0x2a1238);
  const body = S.bake([bodyGeo, smile], goo, 'body');
  root.add(body);
  const eyeOpts = { irisColor: 0x3a1c4e, scleraColor: 0xf4f2e6, skinColor: 0x8a4cb4, glintSize: 0.014 };
  const eyeL = S.seatEye(kit, body, bodyGeo, 0.036, 0.36, 0.28, eyeOpts, { sink: 0.45, front: 0.55, from: [0, 0.07, 0] });
  const eyeR = S.seatEye(kit, body, bodyGeo, 0.036, -0.36, 0.28, eyeOpts, { sink: 0.45, front: 0.55, from: [0, 0.07, 0] });

  // --- The crust hat (accent), worn at a tilt. ---------------------------------------
  const hatGeo = S.pebble(0.11, { sx: 1.1, sy: 0.55, sz: 1.0, seed: 63, noise: 0.16, radial: 14, rings: 9 });
  S.paint(hatGeo, { from: CRUST_LO, to: CRUST_HI, axis: 'y', noise: 0.03, seed: 64 });
  const spikes = [[0.03, 0.05, 0.02, 0.05, -0.3], [-0.045, 0.04, -0.02, 0.036, 0.25]].map(([x, y, z, h, tilt]) => {
    const g = S.taper(h, 0.018, { r1: 0.003, radial: 5, rings: 3, capSeg: 1 });
    S.paint(g, { from: CRUST_LO, to: 0xc8bc98, axis: 'y' });
    return S.pose(g, [x, y - 0.015, z], [tilt, 0, tilt * 0.5]);
  });
  const hat = new THREE.Mesh(S.merge([hatGeo, ...spikes]), crust);
  hat.name = 'crustHat';
  const ha = S.surface(bodyGeo, [0.05, 1, 0.03], { from: [0, 0.1, 0], inset: 0.02 }); // off-axis: the lathe pole has a pinhole
  kit.at(body, hat, ha[0] + 0.02, ha[1], ha[2] - 0.01, { rz: 0.2, ry: 0.5 });

  // Absorbed puddle droplets rising inside.
  const droplets = kit.mote(5, { color: 0xdcefe0, size: 0.016, radius: 0.1, height: 0.12, speed: 0.35, seed: 64 });
  kit.at(body, droplets, 0, 0.08, 0);
  const spark = kit.heartspark(0.024, pal.eye, { seed: 65 });
  const sp = S.surface(bodyGeo, [0, -0.1, 1], { from: [0, 0.06, 0], inset: 0.01 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  const grounded = kit.groundPlant(root);
  const contact = kit.shadowDisc(0.3, 0.32);
  contact.position.y = 0.02 - grounded.position.y;
  grounded.add(contact);

  return {
    group: grounded,
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      accents: [hat],
      fx: [droplets, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'sleepy',
      locomotion: 'hop',
      hover: false,
      breathAmp: 1.3,
      blinkEvery: 4.0,
    },
  };
}
