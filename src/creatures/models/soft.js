// =============================================================================
// LUMENFALL — src/creatures/models/soft.js
// Soft-stylized sculpting helpers shared by the Kindred model files (visual
// pass v2, "soft stylized" — see docs/VISUAL_V2_BRIEF.md). NOT a species
// builder: registry.js never imports this file; model files do.
// =============================================================================
//
// WHY: kit.js primitives are uniform capsules/cylinders/low-segment spheres.
// Creatures need rounded, tapered, smooth-shaded forms: chubby bean bodies,
// tapered limbs with rounded paws, soft tails, cupped ears, fluffy tufts that
// shade as one ball. Everything here returns plain BufferGeometry with smooth
// (crack-free) normals and a vertex `color` attribute, so a model can merge
// every static piece hanging off one animated node into ONE mesh with one
// vertex-colour material — rounder, cheaper (draw calls), and outline-friendly.
//
// CONVENTIONS (same as kit.js): creatures face +Z, +Y is up, units ≈ metres.
//   spindle()  — the core primitive: a superellipsoid of revolution along Z
//                (t = 0 at the tail end -Z, t = 1 at the nose end +Z) whose
//                radius follows profile(t). Bodies, heads, snouts, bellies.
//   limb()     — ball-jointed tapered capsule hanging from the origin down -Y.
//   softLeg()  — drop-in for kit.leg(): same { group, hip, knee, foot }
//                contract, tapered thigh/shin and a rounded paw.
//   softTail() — drop-in for kit.tailChain(): same { group, pivots }.
//   ear(), puff(), horn-ish cone via taper()
//   paint(geo, …) / pose(geo, …) / bake(geos, mat) — colour, place, merge.
//   variantFx(root) — makes hollowed/gleaming variants recolour vertex
//                colours too (kit.hollowify/gleamify only touch
//                material.color, which is white on vertex-colour meshes).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { smoothGeometry, sphericalNormals } from '../../gfx/materials.js';

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** Smooth bump centred at c with half-width w (1 at c, ~0 beyond ±w). */
export const bump = (t, c, w) => { const d = (t - c) / w; return Math.exp(-d * d * 2.2); };
/** Smoothstep. */
export const sstep = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };

// ------------------------------------------------------------------ Material

/**
 * The one material most soft parts share: smooth shading, vertex colours.
 * Tagged so variantFx() knows its geometry colours are the real albedo.
 */
export function vcMat(kit, opts = {}) {
  const m = kit.mat(0xffffff, { rough: 0.72, ...opts, vertexColors: true, flat: false });
  m.userData.softVC = true;
  return m;
}

/** Smooth-shaded solid colour material (sugar for kit.mat(..., {flat:false})). */
export function smoothMat(kit, color, opts = {}) {
  return kit.mat(color, { rough: 0.7, ...opts, flat: false });
}

// ---------------------------------------------------------------- Primitives

/**
 * Superellipsoid of revolution along +Z, radius shaped by `profile(t)`.
 * t runs 0 (tail pole, -Z) -> 1 (nose pole, +Z). `p` < 1 blunts the pole
 * caps (1 = ellipsoid, 0.6 ≈ capsule-ish); pTail/pNose override per end.
 * sx/sy scale the cross-section (width / height); `arch(t)` bends the spine
 * (y offset, absolute units); `belly`/`back` flatten the under/upper side
 * (0..1); `shift(t)` offsets x (asymmetry, rarely needed).
 * @returns {THREE.BufferGeometry} indexed, smooth normals, no uv
 */
export function spindle({
  len = 1, r = 0.25, radial = 18, rings = 14, p = 0.85, pTail = null, pNose = null,
  profile = null, sx = 1, sy = 1, arch = null, belly = 0, back = 0, shift = null,
} = {}) {
  const geo = new THREE.SphereGeometry(1, radial, rings);
  geo.deleteAttribute('uv');
  const pos = geo.attributes.position;
  const p0 = pTail ?? p, p1 = pNose ?? p;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = y < -1 ? -1 : y > 1 ? 1 : y; // axial: +1 = nose
    const t = (a + 1) * 0.5;
    const rho0 = Math.sqrt(x * x + z * z);
    let k = 0;
    if (rho0 > 1e-7) k = Math.pow(rho0, lerp(p0, p1, t)) / rho0;
    const prof = profile ? profile(t) : 1;
    // (x, y, z) -> (x, -z, y) is a proper rotation: +Y pole becomes +Z nose.
    const X = x * k * r * prof * sx + (shift ? shift(t) : 0);
    let Y = -z * k * r * prof * sy;
    if (Y < 0 && belly) Y *= 1 - (typeof belly === 'function' ? belly(t) : belly);
    if (Y > 0 && back) Y *= 1 - back;
    if (arch) Y += arch(t);
    pos.setXYZ(i, X, Y, a * len * 0.5);
  }
  smoothGeometry(geo);
  return geo;
}

/** Plain smooth ellipsoid (sphere with per-axis radii). */
export function ball(r, { sx = 1, sy = 1, sz = 1, radial = 16, rings = 12 } = {}) {
  return spindle({ len: 2 * r * sz, r, sx, sy, radial, rings, p: 1 });
}

/**
 * A tapered capsule ("cone-sphere") hanging from the origin straight down -Y:
 * a sphere of radius r0 centred on the top joint (origin), a sphere of radius
 * r1 centred on the bottom joint (0,-len,0), joined by their common tangent
 * cone. Because the caps are TRUE spheres centred on the joints, a chain of
 * these bends like ball joints: no gap and no pinch at any angle.
 * `bulge` swells the shaft (muscle) around `bulgeAt` (0 top .. 1 bottom);
 * `sx`/`sz` flatten the cross-section (width / depth). `capSeg` = profile
 * steps per quarter-circle cap.
 */
export function limb(len, r0, r1, {
  radial = 10, capSeg = 3, shaftSeg = 4, bulge = 0, bulgeAt = 0.35, bulgeW = 0.4, sx = 1, sz = 1,
} = {}) {
  const d = Math.max(len, 1e-5);
  const alpha = Math.asin(Math.max(-0.95, Math.min(0.95, (r0 - r1) / d)));
  const pts = [];
  // bottom cap: from the bottom pole (-90deg) up to the tangent angle alpha
  for (let i = 0; i <= capSeg; i++) {
    const th = -Math.PI / 2 + (alpha + Math.PI / 2) * (i / capSeg);
    pts.push([r1 * Math.cos(th), -d + r1 * Math.sin(th), 1]);
  }
  // shaft: tangent points of the two spheres, with an optional swell
  const b0 = [r1 * Math.cos(alpha), -d + r1 * Math.sin(alpha)];
  const b1 = [r0 * Math.cos(alpha), r0 * Math.sin(alpha)];
  for (let i = 1; i < shaftSeg; i++) {
    const u = i / shaftSeg; // 0 bottom .. 1 top
    const x = lerp(b0[0], b1[0], u), y = lerp(b0[1], b1[1], u);
    const sw = bulge ? bulge * r0 * bump(1 - u, bulgeAt, bulgeW) : 0;
    pts.push([x + sw, y, 0]);
  }
  // top cap: from alpha up to the top pole (+90deg)
  for (let i = 0; i <= capSeg; i++) {
    const th = alpha + (Math.PI / 2 - alpha) * (i / capSeg);
    pts.push([r0 * Math.cos(th), r0 * Math.sin(th), 1]);
  }
  const v2 = pts.map(([x, y]) => new THREE.Vector2(Math.max(x, 0), y));
  const geo = new THREE.LatheGeometry(v2, radial);
  geo.deleteAttribute('uv');
  if (sx !== 1 || sz !== 1) geo.scale(sx, 1, sz);
  smoothGeometry(geo);
  return geo;
}

/**
 * A thin tube laid ON a sculpted surface — mouths, brows, stripes, seams.
 * `dirs` are [yaw, pitch] pairs (see dirYP) sampled from `from` onto the
 * skin of `geo`; the tube rides `lift` above it.
 */
export function groove(geo, dirs, { from = [0, 0, 0], radius = 0.006, lift = 0.0, radial = 4, seg = null } = {}) {
  const pts = dirs.map(([yaw, pitch]) => new THREE.Vector3(...surface(geo, dirYP(yaw, pitch), { from, inset: -lift })));
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, seg ?? Math.max(6, dirs.length * 3), radius, radial, false);
  g.deleteAttribute('uv');
  // round the two open ends with tiny caps
  const caps = [pts[0], pts[pts.length - 1]].map((p) => ball(radius, { radial: 5, rings: 3 }).translate(p.x, p.y, p.z));
  const out = mergeGeometries([smoothGeometry(g), ...caps.map((c) => { c.deleteAttribute('color'); return c; })], false);
  return out;
}

/**
 * A thin tube laid along the TOP of a surface: `pts` are [x, z] (or
 * [x, z, yLift]) positions projected straight down onto `geo` from above
 * (nearest hit) — spine seams, stripes, cracks along a back.
 */
export function grooveTop(geo, pts, { radius = 0.008, lift = 0, radial = 4, seg = null, dir = [0, -1, 0], height = 5 } = {}) {
  const v = pts.map(([x, z, dy = 0]) => {
    const p = surface(geo, dir, { from: [x - dir[0] * height, -dir[1] * height, z - dir[2] * height], nearest: true, inset: -lift });
    return new THREE.Vector3(p[0], p[1] + dy, p[2]);
  });
  const curve = new THREE.CatmullRomCurve3(v);
  const g = new THREE.TubeGeometry(curve, seg ?? Math.max(6, pts.length * 3), radius, radial, false);
  g.deleteAttribute('uv');
  const caps = [v[0], v[v.length - 1]].map((p) => ball(radius, { radial: 5, rings: 3 }).translate(p.x, p.y, p.z));
  return mergeGeometries([smoothGeometry(g), ...caps], false);
}

/**
 * A layered 3D candle flame (nested smooth teardrops, unlit) that reads from
 * every angle — unlike a flat blade it never goes edge-on. Same contract as
 * kit.flame(): { group, update(dt, intensity) }; push it into parts.fx.
 */
export function flame3d(kit, height = 0.2, { colors = [0xd8380f, 0xff8a2e, 0xffe38f], width = height * 0.42, seed = 1, lean = 0, halo = 0.55 } = {}) {
  const group = new THREE.Group(); group.name = 'flame';
  const layers = [];
  let haloMesh = null;
  if (halo > 0) {
    // soft additive light around the flame body (a falloff sprite, not a ball)
    haloMesh = glow(colors[1], height * 0.95, halo);
    haloMesh.name = 'flameHalo';
    haloMesh.position.y = height * 0.36;
    group.add(haloMesh);
  }
  const n = colors.length;
  for (let i = 0; i < n; i++) {
    const k = i / Math.max(1, n - 1);
    const h = height * (1 - k * 0.42), w = width * (1 - k * 0.45);
    const g = spindle({
      len: h, r: w * 0.5, radial: 10, rings: 8, pTail: 0.9, pNose: 1.6,
      profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.82 + 0.02)), 0.7) * (1.05 - 0.55 * t),
    });
    g.rotateX(-Math.PI / 2); // nose (+Z) -> up (+Y)
    g.translate(0, h * 0.5 - height * 0.08 + k * height * 0.02, 0);
    const m = kit.mat(colors[i], { unlit: true, transparent: true, opacity: i === 0 ? 0.88 : 0.95 });
    m.depthWrite = i === n - 1;
    const mesh = new THREE.Mesh(g, m);
    mesh.name = 'flameLayer';
    mesh.renderOrder = 2 + i;
    group.add(mesh);
    layers.push(mesh);
  }
  let t = (seed * 7.31) % 6.28;
  const ph = (seed * 2.17) % 6.28;
  function update(dt, intensity = 1) {
    t += dt;
    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      const sy = 1 + Math.sin(t * 7.3 + ph + i * 1.9) * 0.09 * intensity + Math.sin(t * 13.1 + i) * 0.04 * intensity;
      const sxz = 1 - (sy - 1) * 0.6;
      L.scale.set(sxz, sy, sxz);
      L.rotation.z = Math.sin(t * 3.1 + i * 0.7 + ph) * 0.07 * intensity;
      L.rotation.x = Math.sin(t * 2.3 + i * 1.3) * 0.05 * intensity;
    }
    group.rotation.z = lean + Math.sin(t * 1.7 + ph) * 0.05 * intensity;
    if (haloMesh) { const k = height * 0.95 * (1 + Math.sin(t * 5.1 + ph) * 0.06 * intensity); haloMesh.scale.set(k, k, 1); }
  }
  return { group, update };
}

/**
 * Tapered horn/spike/claw: straight or curved cone with a rounded tip.
 * Base at origin, grows +Y, curves toward +Z by `curve` (fraction of len).
 */
export function taper(len, r0, { r1 = r0 * 0.12, curve = 0, radial = 8, rings = 7, sx = 1, sz = 1, p = 0.7 } = {}) {
  const geo = limb(len, r0, r1, { radial, capSeg: 3, shaftSeg: Math.max(3, rings - 4), sx, sz });
  geo.rotateX(Math.PI); // hang down -> grow up
  if (curve) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = clamp01(y / len);
      pos.setZ(i, pos.getZ(i) + curve * len * t * t);
    }
    smoothGeometry(geo);
  }
  return geo;
}

/**
 * A rounded paw: a soft bean with a flattened sole and (optionally) toe
 * bumps across the front. Origin = the ankle: the paw hangs below it with
 * its sole at y = -h and its heel under the ankle, toes toward +Z.
 * @returns {THREE.BufferGeometry}
 */
export function paw(r, { len = 1.35, h = null, toes = 3, toeR = 0.36, radial = 12, rings = 8, splay = 1 } = {}) {
  const H = h ?? r * 1.05;
  const parts = [];
  const body = spindle({
    len: 2 * r * len, r, sx: 1, sy: 0.62, radial, rings, p: 0.8, belly: 0.55,
    profile: (t) => 0.86 + 0.2 * t,
  });
  parts.push(body);
  if (toes > 0) {
    for (let i = 0; i < toes; i++) {
      const u = toes === 1 ? 0 : (i / (toes - 1) - 0.5);
      const tg = ball(r * toeR, { sy: 0.8, radial: 5, rings: 3 });
      tg.translate(u * r * 1.15 * splay, -r * 0.18, r * len * 0.78 - Math.abs(u) * r * 0.25);
      parts.push(tg);
    }
  }
  const geo = parts.length > 1 ? mergeGeometries(parts, false) : body;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  // sole to y = -H, heel ~ under the ankle
  geo.translate(0, -H - bb.min.y, -bb.min.z - r * 0.55);
  return geo;
}

/**
 * A soft, cupped ear. Base at the origin, grows +Y; flattened front-to-back
 * and cupped (the front face dished in). `inner` (a hex colour) adds a
 * lighter inner-ear panel as part of the same geometry.
 * @returns {THREE.BufferGeometry}
 */
export function ear(len, width, { color = 0x888888, inner = null, depth = 0.34, cup = 0.4, tip = 0.8, radial = 10, rings = 8, droop = 0 } = {}) {
  const shape = (t) => Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * t)), tip) * (1 - 0.25 * t) + 0.12 * (1 - t);
  const mk = (w, d) => {
    const g = spindle({ len, r: w * 0.5, sx: 1, sy: d, radial, rings, p: 0.9, profile: shape });
    g.rotateX(-Math.PI / 2); // +Z -> +Y
    g.translate(0, len / 2, 0);
    return g;
  };
  const outer = mk(width, depth);
  cupGeo(outer, width, len, cup);
  paint(outer, color);
  const pieces = [outer];
  if (inner != null) {
    const g = mk(width * 0.62, depth * 0.5);
    g.scale(1, 0.84, 1);
    g.translate(0, len * 0.06, width * depth * 0.2);
    cupGeo(g, width * 0.62, len, cup * 0.8);
    paint(g, inner);
    pieces.push(g);
  }
  const geo = pieces.length > 1 ? mergeGeometries(pieces, false) : outer;
  if (droop) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), t = clamp01(y / len);
      pos.setZ(i, pos.getZ(i) - droop * len * t * t);
    }
    smoothGeometry(geo);
  }
  return geo;
}
function cupGeo(geo, width, len, cup) {
  if (!cup) return;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (width * 0.5), y = pos.getY(i);
    const t = clamp01(y / len);
    // dish the front (+Z) face: centre pushed back, rim stays
    pos.setZ(i, pos.getZ(i) - cup * width * 0.3 * (1 - x * x) * Math.sin(Math.PI * t));
  }
  smoothGeometry(geo);
}

/**
 * A fluffy cluster: `count` overlapping soft balls merged and shaded as ONE
 * ball (sphericalNormals) — fur tufts, cheek fluff, moss, cloud puffs.
 * @returns {THREE.BufferGeometry}
 */
export function puff(r, { count = 6, spread = 0.8, seed = 1, sy = 0.85, blend = 0.75, radial = 9, rings = 6, flat = 0 } = {}) {
  let s = (seed * 9301 + 49297) % 233280;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.8;
    const d = i === 0 ? 0 : r * spread * (0.55 + rnd() * 0.45);
    const rr = r * (i === 0 ? 0.95 : 0.55 + rnd() * 0.35);
    const g = ball(rr, { sy, radial, rings });
    g.translate(Math.cos(a) * d, (rnd() - 0.4) * r * 0.35 * (1 - flat), Math.sin(a) * d);
    pieces.push(g);
  }
  const geo = mergeGeometries(pieces, false);
  sphericalNormals(geo, { blend });
  return geo;
}

/**
 * A smooth river-pebble / boulder: an ellipsoid with gentle low-frequency
 * lumps (never faceted). `flat` flattens the underside (0..1) so it sits.
 * @returns {THREE.BufferGeometry}
 */
export function pebble(r, { sx = 1, sy = 1, sz = 1, seed = 1, noise = 0.1, radial = 16, rings = 12, flat = 0 } = {}) {
  const geo = new THREE.SphereGeometry(1, radial, rings);
  geo.deleteAttribute('uv');
  const pos = geo.attributes.position;
  const k = seed * 1.618;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = Math.sin(x * 2.1 + k) * Math.cos(y * 1.7 - k * 0.7) * 0.6
      + Math.sin(z * 2.6 + y * 1.3 + k * 1.9) * 0.4
      + Math.sin((x + z) * 3.3 - k * 2.3) * 0.2;
    const d = 1 + n * noise;
    let Y = y * d * r * sy;
    if (Y < 0 && flat) Y *= 1 - flat;
    pos.setXYZ(i, x * d * r * sx, Y, z * d * r * sz);
  }
  smoothGeometry(geo);
  return geo;
}

/**
 * A soft folded bird wing (feather paddle) with a 2-bone chain — contract
 * like kit.wing(): { group, bones } (group === bones[0], the shoulder).
 * The geometry is baked hanging back-and-down from the shoulder against the
 * body side (+X side; build the right wing with side = -1, which mirrors the
 * geometry — never a negative scale), so the animator's flap (rotation about
 * each bone's local Z) swings it OUT from the body like a real flutter.
 *   len   : shoulder -> tip;  width: chord;  down: how steeply it hangs
 *   color : hex or {from,to} along the span;  tips: colour of the feather
 *           fingers at the end (count = feathers)
 */
export function softWing(len, material, {
  side = 1, width = len * 0.45, thick = 0.22, down = 0.5, spread = 0.35, color = 0x888888, tips = null,
  feathers = 3, radial = 10, rings = 8,
} = {}) {
  const root = new THREE.Group(); root.name = 'wingRoot';
  const bone = new THREE.Group(); bone.name = 'wingBone1';
  root.add(bone);
  // span direction: back (-Z) and down (-Y), a little out (+X)
  const dir = new THREE.Vector3(spread * 0.25, -Math.sin(down), -Math.cos(down)).normalize();
  const half = len * 0.52;
  bone.position.set(dir.x * half * side, dir.y * half, dir.z * half);
  const col = (g, a, b) => (typeof color === 'number' ? paint(g, color) : paint(g, { from: color.from, to: color.to, axis: 'z', lo: a, hi: b, noise: 0.01 }));
  const mk = (L, w, prof) => {
    // paddle along -Z (tail->nose = tip->root), chord along Y, thin along X
    const g = spindle({ len: L, r: w * 0.5, sx: thick, sy: 1, radial, rings, p: 0.9, profile: prof });
    g.translate(0, 0, -L * 0.5);
    return g;
  };
  // align local -Z with `dir` (rotation about X by the droop, then a slight yaw out)
  const orient = (g) => { g.rotateX(down); g.rotateY(-spread * 0.25); return g; };
  const inner = orient(mk(len * 0.62, width, (t) => 0.75 + 0.3 * S_bumpish(t)));
  col(inner, -len * 0.62, 0);
  const pieces = [];
  const outer = orient(mk(len * 0.56, width * 0.9, (t) => 0.55 + 0.45 * t));
  col(outer, -len * 0.56, 0);
  pieces.push(outer);
  for (let i = 0; i < feathers; i++) {
    const u = feathers === 1 ? 0 : i / (feathers - 1) - 0.5;
    const f = mk(len * (0.34 - Math.abs(u) * 0.12), width * 0.26, (t) => 0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.1)));
    f.rotateX(u * 0.5);
    f.translate(0, u * width * 0.55, -len * 0.38);
    orient(f);
    paint(f, tips ?? (typeof color === 'number' ? color : color.from));
    pieces.push(f);
  }
  const innerMesh = new THREE.Mesh(side < 0 ? mirrorX(inner) : inner, material);
  innerMesh.name = 'wingInner';
  root.add(innerMesh);
  const og = merge(pieces);
  const outerMesh = new THREE.Mesh(side < 0 ? mirrorX(og) : og, material);
  outerMesh.name = 'wingOuter';
  bone.add(outerMesh);
  return { group: root, bones: [root, bone] };
}
function S_bumpish(t) { return Math.sin(Math.PI * Math.min(1, t * 1.05)); }

/**
 * A tapered tail as a chain of pivots — same contract as kit.tailChain():
 * `group` is the root pivot (attach to the body), the chain extends toward
 * local -Z, `pivots` is root->tip. Each segment is a ball-jointed tapered
 * capsule PRE-BENT along a circular arc of `curl` radians, and the next
 * pivot sits on that arc's end (rotated by `curl`), so at rest the whole
 * tail is one smooth continuous curve — no knuckles — and the animator's
 * per-joint sway still bends it naturally.
 *   curl     : bend per segment, + curls UP (number, or (i)=>radians)
 *   rootPitch: initial lift of the root pivot (default curl(0) * 0.5)
 *   yaw      : sideways swing per joint
 *   color    : hex or (t)=>hex along the tail (t: 0 root .. 1 tip)
 * Returns { group, pivots, tipAnchor, tipPitch } — tipAnchor is an empty
 * group at the very tip, tangent to the tail; tipPitch is the total rest
 * pitch there (rotate a flame by -tipPitch to stand it upright).
 */
export function softTail(n, material, {
  segLen = 0.12, startR = 0.05, endR = 0.015, curl = 0, rootPitch = null, yaw = 0, color = 0x888888,
  radial = 8, capSeg = 3, sx = 1, sy = 1, taperExp = 1,
} = {}) {
  const root = new THREE.Group(); root.name = 'tailRoot';
  const pivots = [root];
  let parent = root;
  const colAt = typeof color === 'function' ? color : () => color;
  const curlAt = typeof curl === 'function' ? curl : () => curl;
  const rAt = (t) => lerp(startR, endR, Math.pow(t, taperExp));
  let pitch = rootPitch ?? curlAt(0) * 0.5;
  root.rotation.x = pitch;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const r0 = rAt(t0), r1 = rAt(t1) * (i < n - 1 ? 0.97 : 1);
    const phi = curlAt(i);
    const g = limb(segLen, r0, r1, { radial, capSeg, shaftSeg: 2, sx, sz: sy });
    g.rotateX(Math.PI / 2); // hang -Y -> trail -Z  ((0,-1,0) -> (0,0,-1))
    paint(g, { from: colAt(t1), to: colAt(t0), axis: 'z', lo: -segLen, hi: 0, noise: 0.012, seed: i + 3 });
    const end = bendArc(g, segLen, phi);
    const seg = new THREE.Mesh(g, material);
    seg.name = 'tailSeg';
    parent.add(seg);
    const next = new THREE.Group();
    next.position.set(0, end[0], end[1]);
    next.rotation.x = phi;
    next.rotation.y = i < n - 1 ? yaw : 0;
    parent.add(next);
    if (i < n - 1) { next.name = `tailPivot${i + 1}`; pivots.push(next); parent = next; }
    else next.name = 'tailTip';
    pitch += phi;
    if (i === n - 1) return { group: root, pivots, tipAnchor: next, tipPitch: pitch };
  }
  return { group: root, pivots, tipAnchor: root, tipPitch: pitch };
}

/**
 * Bend a geometry that runs from z=0 back to z=-L (plus cap overshoot) along
 * a circular arc of angle `phi` (radians, + bends toward +Y) with arc length
 * L. Beyond either end it continues along the end tangents. Returns the
 * arc's end point [y, z] (where the next joint belongs).
 */
export function bendArc(geo, L, phi) {
  if (Math.abs(phi) < 1e-4) return [0, -L];
  const R = L / phi;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const sArc = -z;
    let ny, nz;
    if (sArc <= 0) { ny = y; nz = z; } else {
      const s = Math.min(sArc, L), th = s / R;
      const cy = R * (1 - Math.cos(th)), cz = -R * Math.sin(th);
      // tangent (0, sin, -cos), up-normal (0, cos, sin)
      const st = Math.sin(th), ct = Math.cos(th);
      const extra = sArc - s;
      ny = cy + y * ct + extra * st;
      nz = cz + y * st - extra * ct;
    }
    pos.setXYZ(i, x, ny, nz);
  }
  pos.needsUpdate = true;
  smoothGeometry(geo);
  return [R * (1 - Math.cos(phi)), -R * Math.sin(phi)];
}

/**
 * Drop-in soft replacement for kit.leg(): returns { group, hip, knee, foot }
 * with group === hip. A ball-jointed tapered thigh with a muscle swell, a
 * tapered shin and a rounded paw, all vertex-coloured (one material). Two
 * draw calls per leg: the thigh (hip space) and shin+paw merged (knee space).
 *   bend  : zig-zag at rest (radians) — knee forward, ankle back under the
 *           hip (hind legs of hounds/deer); negative = elbow back (forelegs).
 *   split : share of the leg's height taken by the thigh.
 *   stubby: toddler legs — one fat tapered segment, knee right above the paw.
 * The sole lands `len` below the hip.
 */
export function softLeg(len, material, {
  thighR = len * 0.2, shinR = len * 0.12, kneeR = null, ankleR = null,
  pawR = null, pawLen = 1.3, toes = 3, pawH = null,
  bend = 0, split = 0.5, bulge = 0.22, stubby = false, sx = 1, sz = 1,
  color = 0x888888, shinColor = null, pawColor = null, radial = 8,
} = {}) {
  const hip = new THREE.Group(); hip.name = 'legHip';
  const knee = new THREE.Group(); knee.name = 'legKnee';
  hip.add(knee);
  const pr = pawR ?? (stubby ? thighR * 0.95 : shinR * 1.35);
  const ph = pawH ?? pr * 0.78;
  const sh = shinColor ?? color, pc = pawColor ?? sh;
  if (stubby) {
    // One fat, tapered segment; the knee is a tiny joint just above the paw.
    const kr = kneeR ?? thighR * 0.72;
    const Lt = Math.max(len - ph - kr * 0.3, len * 0.25);
    const tg = limb(Lt, thighR, kr, { radial, capSeg: 3, shaftSeg: 3, bulge: bulge * 0.5, bulgeAt: 0.3, sx, sz });
    paint(tg, { from: sh, to: color, axis: 'y', noise: 0.012, seed: 11 });
    const thigh = new THREE.Mesh(tg, material); thigh.name = 'legThigh';
    hip.add(thigh);
    knee.position.set(0, -Lt, 0);
    const pg = paw(pr, { len: pawLen, h: len - Lt, toes, radial: 9, rings: 5 });
    paint(pg, pc);
    const foot = new THREE.Mesh(pg, material); foot.name = 'legFoot';
    knee.add(foot);
    return { group: hip, hip, knee, foot };
  }
  const H = Math.max(len - ph, len * 0.3);
  const Dt = H * split, Ds = H * (1 - split);
  const F = Dt * Math.tan(bend);
  const a = Math.atan2(F, Dt), b = Math.atan2(F, Ds);
  const Lt = Math.hypot(Dt, F), Ls = Math.hypot(Ds, F);
  const kr = kneeR ?? lerp(thighR, shinR, 0.6);
  const ar = ankleR ?? shinR * 0.82;
  const tg = limb(Lt, thighR, kr * 0.96, { radial, capSeg: 3, shaftSeg: 4, bulge, bulgeAt: 0.3, sx, sz });
  tg.rotateX(-a); // point toward the knee: (0,-Dt, F)
  paint(tg, { from: lerp01hex(color, sh, 0.35), to: color, axis: 'y', noise: 0.012, seed: 12 });
  const thigh = new THREE.Mesh(tg, material); thigh.name = 'legThigh';
  hip.add(thigh);
  knee.position.set(0, -Dt, F);
  const sg = limb(Ls, kr, ar, { radial, capSeg: 3, shaftSeg: 3, bulge: bulge * 0.35, bulgeAt: 0.25, sx, sz });
  sg.rotateX(b); // toward the ankle: (0,-Ds,-F)
  paint(sg, { from: sh, to: lerp01hex(color, sh, 0.35), axis: 'y', noise: 0.012, seed: 13 });
  const pg = paw(pr, { len: pawLen, h: ph, toes, radial: 9, rings: 5 });
  pg.translate(0, -Ds, -F);
  paint(pg, pc);
  const foot = new THREE.Mesh(mergeGeometries([sg, pg], false), material); foot.name = 'legFoot';
  knee.add(foot);
  return { group: hip, hip, knee, foot };
}

// ---------------------------------------------------------------- Colouring

function lerp01hex(a, b, t) {
  _c.setHex(a); _c2.setHex(b); _c.lerp(_c2, t);
  return _c.getHex();
}
export const mixHex = lerp01hex;

/**
 * Write a vertex `color` attribute into `geo` by POSITION (so duplicated
 * seam vertices always match). `spec` is a hex (solid) or
 * { from, to, axis='y', exp=1, noise=0.02, seed=1, lo, hi } where lo/hi pin
 * the ramp range in the geometry's CURRENT coordinates (default: its bbox).
 * `spec.fn(x,y,z) -> t` overrides the ramp parameter entirely.
 * @returns geo
 */
export function paint(geo, spec) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  if (typeof spec === 'number') {
    _c.setHex(spec);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  } else {
    const { from, to, axis = 'y', exp = 1, noise = 0.02, seed = 1, fn = null } = spec;
    const ai = axis === 'x' ? 0 : axis === 'z' ? 2 : 1;
    geo.computeBoundingBox();
    const lo = spec.lo ?? geo.boundingBox.min.getComponent(ai);
    const hi = spec.hi ?? geo.boundingBox.max.getComponent(ai);
    const span = Math.max(1e-6, hi - lo);
    _c.setHex(from); _c2.setHex(to);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let t = fn ? fn(x, y, z) : ((ai === 0 ? x : ai === 2 ? z : y) - lo) / span;
      t = Math.pow(clamp01(t), exp);
      const nz = noise ? hash3(x, y, z, seed) * noise : 0;
      col[i * 3] = lerp(_c.r, _c2.r, t) + nz;
      col[i * 3 + 1] = lerp(_c.g, _c2.g, t) + nz;
      col[i * 3 + 2] = lerp(_c.b, _c2.b, t) + nz * 0.7;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/**
 * Overlay a colour onto an already-painted geometry where `mask(x,y,z)`
 * returns 0..1 (e.g. a pale belly, socks, a blaze, spots).
 */
export function overlay(geo, color, mask) {
  const pos = geo.attributes.position, col = geo.attributes.color;
  _c.setHex(color);
  for (let i = 0; i < pos.count; i++) {
    const k = clamp01(mask(pos.getX(i), pos.getY(i), pos.getZ(i)));
    if (k <= 0) continue;
    col.setXYZ(i, lerp(col.getX(i), _c.r, k), lerp(col.getY(i), _c.g, k), lerp(col.getZ(i), _c.b, k));
  }
  col.needsUpdate = true;
  return geo;
}

/** Soft round blush/spot: blend `color` in around point c (radius, strength 0..1). */
export function blush(geo, c, radius, color, strength = 0.8) {
  return overlay(geo, color, (x, y, z) => {
    const d = Math.hypot(x - c[0], y - c[1], z - c[2]) / radius;
    return d >= 1 ? 0 : strength * (1 - d * d) * (1 - d * d);
  });
}

/** Multiply colours by a soft vertical occlusion ramp (darker underside). */
export function shade(geo, { lo = 0.72, hi = 1.04, axis = 'y', exp = 0.8 } = {}) {
  const pos = geo.attributes.position, col = geo.attributes.color;
  if (!col) return geo;
  const ai = axis === 'x' ? 0 : axis === 'z' ? 2 : 1;
  geo.computeBoundingBox();
  const a = geo.boundingBox.min.getComponent(ai), b = geo.boundingBox.max.getComponent(ai);
  for (let i = 0; i < pos.count; i++) {
    const v = ai === 0 ? pos.getX(i) : ai === 2 ? pos.getZ(i) : pos.getY(i);
    const k = lerp(lo, hi, Math.pow(clamp01((v - a) / Math.max(1e-6, b - a)), exp));
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
  return geo;
}

function hash3(x, y, z, seed) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.13) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

// ---------------------------------------------------------------- Placement

/**
 * Bake a transform into a geometry (scale -> rotate XYZ -> translate), like
 * an Object3D would apply it. Normals are transformed correctly.
 * @param {THREE.BufferGeometry} geo
 * @param {number[]} [at=[0,0,0]]
 * @param {number[]} [rot=[0,0,0]] Euler XYZ radians
 * @param {number[]|number} [scl=1]
 */
export function pose(geo, at = null, rot = null, scl = null) {
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
  _q.setFromEuler(_e);
  if (scl == null) _s.set(1, 1, 1);
  else if (typeof scl === 'number') _s.set(scl, scl, scl);
  else _s.set(scl[0], scl[1], scl[2]);
  _v.set(at ? at[0] : 0, at ? at[1] : 0, at ? at[2] : 0);
  _m4.compose(_v, _q, _s);
  geo.applyMatrix4(_m4);
  return geo;
}

/** Mirror a geometry across X (for left/right pairs), fixing winding. */
export function mirrorX(geo) {
  const g = geo.clone();
  g.scale(-1, 1, 1);
  // flip triangle winding so faces stay outward
  const idx = g.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
    idx.needsUpdate = true;
  }
  return g;
}

/**
 * Merge coloured geometries into ONE mesh with `material` (usually vcMat).
 * Every input must carry position + normal + color (paint() it first);
 * uv attributes are dropped; non-indexed inputs get a trivial index.
 */
export function bake(geos, material, name = 'soft') {
  const mesh = new THREE.Mesh(merge(geos), material);
  mesh.name = name;
  return mesh;
}

/** bake() without the mesh: normalise attributes and merge into one geometry. */
export function merge(geos) {
  const list = [];
  for (const g of geos) {
    if (!g) continue;
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (g.attributes.uv1) g.deleteAttribute('uv1');
    if (!g.attributes.normal) smoothGeometry(g);
    if (!g.attributes.color) paint(g, 0xff00ff);
    if (!g.index) {
      const n = g.attributes.position.count;
      const ix = new (n > 65535 ? Uint32Array : Uint16Array)(n);
      for (let i = 0; i < n; i++) ix[i] = i;
      g.setIndex(new THREE.BufferAttribute(ix, 1));
    }
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    list.push(g);
  }
  return list.length === 1 ? list[0] : mergeGeometries(list, false);
}

/** Convert any kit/THREE geometry (non-indexed ok) for bake(): smooth + colour. */
export function prep(geo, color, { crease = 0 } = {}) {
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  smoothGeometry(geo, { creaseAngle: crease });
  paint(geo, color);
  return geo;
}

// ------------------------------------------------------------ Surface finding

const _ray = new THREE.Ray();
const _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _tc = new THREE.Vector3(), _hit = new THREE.Vector3();

/**
 * Where does a ray from `from` along `dir` leave the geometry's surface?
 * (build-time only). Returns [x, y, z] pushed back along the ray by `inset`
 * (positive = sink into the skin), or `from` if nothing is hit. Use it to
 * seat eyes, ears, horns and fur exactly on a sculpted head/body instead of
 * guessing offsets.
 */
export function surface(geo, dir, { from = [0, 0, 0], inset = 0, nearest = false } = {}) {
  _ray.origin.set(from[0], from[1], from[2]);
  _ray.direction.set(dir[0], dir[1], dir[2]).normalize();
  const pos = geo.attributes.position, idx = geo.index;
  const n = idx ? idx.count : pos.count;
  let best = -1;
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
    _ta.fromBufferAttribute(pos, i0); _tb.fromBufferAttribute(pos, i1); _tc.fromBufferAttribute(pos, i2);
    if (_ray.intersectTriangle(_ta, _tb, _tc, false, _hit)) {
      const d = _hit.distanceTo(_ray.origin);
      if (nearest ? (best < 0 || d < best) : d > best) best = d;
    }
  }
  if (best < 0) return [from[0], from[1], from[2]];
  const d = best - inset;
  return [from[0] + _ray.direction.x * d, from[1] + _ray.direction.y * d, from[2] + _ray.direction.z * d];
}

/** Direction helper: yaw (around Y, + toward +X) and pitch (+ up) in radians -> unit [x,y,z] facing +Z at 0,0. */
export function dirYP(yaw, pitch) {
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}

/**
 * Seat a kit.eye() group on a head geometry: finds the skin along
 * (yaw, pitch), sinks the eyeball by `sink`×r so it bulges softly out of
 * the head, and turns it to look along its outward direction blended toward
 * straight ahead by `front` (0 = along the surface normal-ish ray, 1 = +Z).
 */
export function seatEye(kit, head, headGeo, r, yaw, pitch, eyeOpts = {}, { sink = 0.42, front = 0.55, from = [0, 0, 0] } = {}) {
  const p = surface(headGeo, dirYP(yaw, pitch), { from, inset: r * sink });
  const e = kit.eye(r, eyeOpts);
  e.position.set(p[0], p[1], p[2]);
  e.rotation.y = yaw * (1 - front);
  e.rotation.x = -pitch * (1 - front) * 0.8;
  head.add(e);
  return e;
}

// ------------------------------------------------------------------- Glow

let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

/**
 * A soft camera-facing glow (additive sprite with a radial falloff) — halos
 * around flames, gems, lanterns, heartsparks. `size` is its diameter; keep
 * it inside the creature's silhouette bounds (registry measures height with
 * it). Not a mesh, so it gets no outline and casts no shadow.
 */
export function glow(color, size = 0.2, opacity = 0.5) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const sp = new THREE.Sprite(m);
  sp.name = 'glow';
  sp.scale.set(size, size, 1);
  sp.renderOrder = 3;
  return sp;
}

// ------------------------------------------------------------ Variant repair

/**
 * kit.hollowify()/gleamify() recolour `material.color`, which is WHITE on a
 * vertex-colour mesh — so merged soft parts would stay fully saturated in a
 * Hollowed (grey) or Gleaming (hue-shifted) variant. Push the returned fx
 * into parts.fx: on its first tick (after registry applied any variant) it
 * applies the same HSL transform to every vertex-colour mesh's colours and
 * resets that material to white. One-shot; zero per-frame work afterwards.
 */
export function variantFx(root) {
  let done = false;
  return {
    update() {
      if (done) return;
      done = true;
      const hol = !!root.userData.hollowed, gle = !!root.userData.gleaming;
      if (!hol && !gle) return;
      const hsl = { h: 0, s: 0, l: 0 };
      const seen = new Set();
      root.traverse((n) => {
        if (n.isSprite && n.material && n.material.color) {
          n.material.color.getHSL(hsl);
          if (hol) { n.material.color.setHSL(hsl.h, hsl.s * 0.12, Math.min(0.7, hsl.l)); n.material.opacity *= 0.45; }
          if (gle) n.material.color.setHSL((hsl.h + 0.52) % 1, hsl.s, hsl.l);
          return;
        }
        if (!n.isMesh || !n.material || !n.material.vertexColors) return;
        const col = n.geometry.attributes.color;
        if (col && !seen.has(col)) {
          seen.add(col);
          for (let i = 0; i < col.count; i++) {
            _c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
            _c.getHSL(hsl);
            if (hol) _c.setHSL(hsl.h, hsl.s * 0.12, Math.min(0.55, Math.max(0.18, hsl.l * 0.7 + 0.12)));
            if (gle) { _c.getHSL(hsl); _c.setHSL((hsl.h + 0.52) % 1, clamp01(hsl.s * 1.1 + 0.08), clamp01(hsl.l * 1.04 + 0.02)); }
            col.setXYZ(i, _c.r, _c.g, _c.b);
          }
          col.needsUpdate = true;
        }
        // the kit transform already ran on the (white) material colour
        n.material.color.setRGB(1, 1, 1);
      });
    },
  };
}
