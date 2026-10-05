// =============================================================================
// JELLUNE — Tide, stage 1 (single-stage), uncommon.
// "Moon-jelly that floats above the water at night, bell glows with
// moonphase. Serene." (Design Bible §4)
// =============================================================================
// Visual pass v2 (soft stylized). A moon jelly: one smooth, softly glowing
// bell (moon-white crown to periwinkle rim, gently scalloped) wrapped in a
// translucent flared velum, with the moon jelly's four horseshoe marks on
// its crown drawn in pale moonlight — they wax and wane with a slow
// "moonphase" pulse along with the bell's inner glow. A serene face (big
// calm eyes, a small smile, rosy cheeks) sits low on the bell front. Four
// frilly oral-arm ribbons drift from the centre and fine tentacles hang from
// the rim in four swaying clusters. No legs: `float` + hover is the gait.

import * as THREE from 'three';
import * as kitDefault from '../kit.js';
import * as S from './soft.js';

const CROWN = 0xf4f7ff, RIM = 0x9cb2ee, UNDER = 0x6e84c6, ARM_LO = 0xb79ae0, ARM_HI = 0xf6d2ec, MOON = 0xfff0c4, INK = 0x2a3058;

// The bell: a scalloped lathe dome, bottom-centre -> rim -> crown (outward normals).
function bellGeo() {
  const pts = [[0.001, 0.05], [0.1, 0.036], [0.175, 0.014], [0.214, 0.0], [0.232, 0.016], [0.229, 0.05], [0.212, 0.1], [0.172, 0.15], [0.11, 0.186], [0.04, 0.2], [0.001, 0.202]];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 32);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const a = Math.atan2(x, z);
    const k = 1 + 0.03 * Math.cos(a * 8) * S.sstep(0.07, 0.0, y);
    pos.setXYZ(i, x * k, y - 0.008 * Math.max(0, Math.cos(a * 8)) * S.sstep(0.03, 0.0, y), z * k);
  }
  S.smooth(g);
  return g;
}

// A thin hanging strand (tapers to a closed tip), along pts.
function strand(pts, r0) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const tub = 12, rad = 4;
  const g = new THREE.TubeGeometry(curve, tub, 1, rad, false);
  g.deleteAttribute('uv');
  const pos = g.attributes.position, P = new THREE.Vector3();
  for (let i = 0; i <= tub; i++) {
    curve.getPointAt(i / tub, P);
    const r = r0 * (1 - Math.pow(i / tub, 1.3) * 0.92);
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j;
      pos.setXYZ(k, P.x + (pos.getX(k) - P.x) * r, P.y + (pos.getY(k) - P.y) * r, P.z + (pos.getZ(k) - P.z) * r);
    }
  }
  return S.smooth(g);
}

export function build_jellune(kit = kitDefault) {
  const pal = kit.palette(['tide']);
  const jelly = kit.mat(0xffffff, { vertexColors: true, flat: false, rough: 0.3, emissive: 0x24366a, emissiveIntensity: 0.55 });
  jelly.userData.softVC = true;
  const veilMat = kit.mat(0xb8ccff, { rough: 0.25, transparent: true, opacity: 0.42, side: THREE.DoubleSide });
  veilMat.depthWrite = false;
  const moonMat = kit.mat(MOON, { unlit: true });
  const moonBase = moonMat.color.clone();

  const root = new THREE.Group();

  // --- The bell. --------------------------------------------------------------
  const bell = bellGeo();
  S.paint(bell, { fn: (x, y) => S.clamp01((y - 0.02) / 0.18), from: RIM, to: CROWN, exp: 0.8 });
  S.overlayN(bell, UNDER, (nx, ny) => S.sstep(-0.1, -0.6, ny) * 0.85);
  // serene face, low on the bell front
  const F = [0, 0.075, 0];
  const smile = S.paint(S.groove(bell, [[-0.16, -0.02], [-0.08, -0.07], [0, -0.085], [0.08, -0.07], [0.16, -0.02]], { from: F, radius: 0.0045, lift: -0.001 }), INK);
  for (const s of [1, -1]) S.blush(bell, S.surface(bell, S.dirYP(s * 0.6, -0.04), { from: F }), 0.035, 0xf2a6c8, 0.75);
  const body = S.bake([bell, smile], jelly, 'body');
  root.add(body);
  body.position.y = 0.36;

  const eyeOpts = { irisColor: 0x1e2c5a, skinColor: RIM, glintSize: 0.014 };
  const eyeL = S.seatEye(kit, body, bell, 0.034, 0.36, 0.1, eyeOpts, { sink: 0.38, front: 0.6, from: F });
  const eyeR = S.seatEye(kit, body, bell, 0.034, -0.36, 0.1, eyeOpts, { sink: 0.38, front: 0.6, from: F });

  // --- The translucent velum flaring from the rim. -----------------------------
  const veil = new THREE.LatheGeometry([[0.226, 0.03], [0.244, 0.006], [0.262, -0.022], [0.268, -0.038]].map(([x, y]) => new THREE.Vector2(x, y)), 32);
  veil.deleteAttribute('uv');
  const veilMesh = new THREE.Mesh(S.smooth(veil), veilMat);
  veilMesh.name = 'velum';
  veilMesh.renderOrder = 1;
  body.add(veilMesh);

  // --- THE MOON MARKS: four horseshoes of moonlight on the crown. -------------
  const marks = [];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const x = Math.sin(a) * 0.072, z = Math.cos(a) * 0.072;
    const p = S.surface(bell, [0, -1, 0], { from: [x, 1, z], nearest: true, inset: -0.002 });
    const g = new THREE.TorusGeometry(0.03, 0.0075, 5, 16, Math.PI * 1.3);
    g.deleteAttribute('uv');
    g.rotateZ(-Math.PI * 0.15 - Math.PI / 2 + Math.PI / 2); // gap toward -Y
    g.rotateX(-Math.PI / 2); // gap toward +Z, ring lying flat
    g.rotateY(Math.atan2(x, z)); // gap faces outward
    S.aim(g, [x * 1.6, 1, z * 1.6]); // tangent to the dome
    marks.push(S.pose(g, p));
  }
  const moon = new THREE.Mesh(S.merge(marks.map((g) => S.paint(g, 0xffffff))), moonMat);
  moon.name = 'moonMarks';
  body.add(moon);
  const innerGlow = S.glow(0xcfe0ff, 0.42, 0.4);
  innerGlow.position.set(0, 0.09, 0);
  body.add(innerGlow);

  // --- Oral arms: four frilly ribbons from the centre (the first is the tail). --
  const arms = [0, 1, 2, 3].map((k) => {
    const a = k * Math.PI / 2;
    const t = S.softTail(5, jelly, {
      segLen: 0.055, startR: 0.017, endR: 0.006, sx: 2.3, radial: 7, capSeg: 2,
      curl: (i) => (i % 2 ? -0.22 : 0.22), rootPitch: 0.1,
      color: (u) => S.mixHex(ARM_HI, ARM_LO, u),
    });
    const g = t.group;
    const holder = new THREE.Group(); holder.name = 'oralArm';
    holder.position.set(Math.sin(a) * 0.03, 0.04, Math.cos(a) * 0.03);
    holder.rotation.y = a;
    holder.add(g);
    g.rotation.x = -Math.PI / 2 + 0.12; // hang down, a little outward
    body.add(holder);
    return t;
  });

  // --- Fine rim tentacles in four swaying clusters (accents). ----------------
  const clusters = [0, 1, 2, 3].map((q) => {
    const piv = new THREE.Group(); piv.name = 'tentacles';
    const qa = q * Math.PI / 2 + Math.PI / 4;
    piv.position.set(Math.sin(qa) * 0.2, 0.01, Math.cos(qa) * 0.2);
    const geos = [];
    for (let j = 0; j < 3; j++) {
      const a = qa + (j - 1) * 0.42;
      const ox = Math.sin(a) * 0.2 - piv.position.x, oz = Math.cos(a) * 0.2 - piv.position.z;
      const L = 0.2 + 0.05 * Math.sin(q * 2.3 + j * 1.7);
      const w = 0.025 * Math.sin(q + j * 2.1);
      const pts = [[ox, 0, oz], [ox * 1.05 + w, -L * 0.35, oz * 1.05], [ox * 0.95 - w, -L * 0.7, oz * 0.95 + w], [ox * 0.9 + w * 0.5, -L, oz * 0.9]];
      geos.push(S.paint(strand(pts, 0.0065), RIM));
    }
    piv.add(new THREE.Mesh(S.merge(geos), jelly));
    body.add(piv);
    return piv;
  });

  // --- Moonphase: a slow wax-and-wane of the marks and the inner glow. ----------
  let moonT = 0;
  const moonPulse = {
    update(dt) {
      moonT += dt * 0.35;
      const phase = 0.5 + 0.5 * Math.sin(moonT);
      moonMat.color.copy(moonBase).multiplyScalar(0.55 + 0.75 * phase);
      jelly.emissiveIntensity = 0.4 + 0.35 * phase;
      innerGlow.material.opacity = 0.2 + 0.35 * phase;
    },
  };

  const drift = kit.mote(7, { color: 0xdfeeff, size: 0.013, radius: 0.28, height: 0.14, speed: 0.22, seed: 92 });
  kit.at(body, drift, 0, -0.08, 0);
  const spark = kit.heartspark(0.026, pal.eye, { seed: 91 });
  const sp = S.surface(bell, S.dirYP(0, -0.55), { from: F, inset: 0.004 });
  kit.at(body, spark, sp[0], sp[1], sp[2]);

  return {
    group: kit.groundPlant(root),
    parts: {
      body,
      eyelids: [eyeL.getObjectByName('eyelid'), eyeR.getObjectByName('eyelid')],
      tail: arms[0].pivots,
      accents: [...arms.slice(1).map((t) => t.group), ...clusters],
      fx: [moonPulse, drift, spark, S.variantFx(root)],
    },
    hints: {
      personality: 'calm',
      locomotion: 'float',
      hover: true,
      hoverAmp: 0.05,
      breathAmp: 0.9,
      blinkEvery: 4.4,
    },
  };
}
