// props.js — every prop kind in the world: vegetation, rocks, buildings, ruins,
// cave growth, town dressing. Density-scattered kinds use InstancedMesh (seeded by
// zone seed, stable layouts); single placements use the same instanced path (N=1)
// except animated set-pieces (waterfall, campfire, boat...) which build live groups.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   buildProps(zone, heightAt) -> { group, colliders, updaters:[fn(dt,time)], dispose() }
// Additionally exposes `surfacePatches`: oriented rectangles registered by
// walkable wooden props (bridge planks, dock boards, house floors) so
// player.js footsteps can resolve step_wood on them —
//   [{x, z, hx, hz, cos, sin, r2, surface:'wood'}] (cos/sin of the prop yaw,
//   r2 = squared broad-phase radius).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { windSway, jitterGeometry } from '../gfx/materials.js';
import { G } from '../core/state.js';
import { seededRandom, hashStr } from '../core/rng.js';
import { clamp, lerp, TAU } from '../core/math.js';

// ---------------------------------------------------------------- shared temps
const _m4 = new THREE.Matrix4();
const _m4b = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _eul = new THREE.Euler();
const _col = new THREE.Color();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

const warned = new Set();
const warnOnce = (msg) => { if (!warned.has(msg)) { warned.add(msg); console.warn('[props]', msg); } };

// Seeded hash noise in [-1,1] — mirrors materials.js so baked mottling matches.
function hashN(x, y, z, seed = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.13) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

// Shared soft radial disc texture (contact shadows / glow pools) — module-level,
// generated once, never disposed (materials referencing it are per-build).
let _discTex = null;
function discTex() {
  if (_discTex) return _discTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _discTex = new THREE.CanvasTexture(c);
  return _discTex;
}

// Day factor: 0 = full night, 1 = full day (dayTime 0 = midnight, 0.5 = noon).
function daylight(t) {
  const up = clamp((t - 0.21) / 0.08, 0, 1);
  const down = 1 - clamp((t - 0.74) / 0.08, 0, 1);
  return Math.min(up, down);
}

// ---------------------------------------------------------------- entry point
export function buildProps(zone, heightAt) {
  const size = zone.size ?? 200;
  const half = size / 2;
  const seed = (zone.terrain && zone.terrain.seed) ?? hashStr(zone.id ?? 'zone');
  const water = zone.water ?? null;
  const paths = zone.paths ?? [];
  const biome = zone.biome ?? 'meadow';

  const group = new THREE.Group();
  group.name = 'props';
  const colliders = [];
  const updaters = [];
  const surfacePatches = []; // wood-footstep rectangles (see header)
  const disposables = []; // {geo?|mat?|fn?}

  // Per-build caches so dispose() is airtight and zones never leak into each other.
  const geoCache = new Map();
  const matCache = new Map();
  const pulseMats = [];  // {m, base, amp, speed, phase}
  const nightMats = [];  // {m, base}  emissive that wakes at dusk
  const nightLights = []; // {light, base}
  let lightBudget = 10;   // dynamic point lights per zone, spent by set-pieces

  const geo = (key, make) => {
    let g = geoCache.get(key);
    if (!g) { g = make(); geoCache.set(key, g); disposables.push({ geo: g }); }
    return g;
  };

  // ------------------------------------------------------------- geometry lib
  const sphereG = (r, w = 7, h = 5) => geo(`sp${r}_${w}_${h}`, () => new THREE.SphereGeometry(r, w, h));
  const coneG = (r, h, s = 7) => geo(`co${r}_${h}_${s}`, () => new THREE.ConeGeometry(r, h, s));
  const cylG = (rt, rb, h, s = 7) => geo(`cy${rt}_${rb}_${h}_${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
  const boxG = (w, h, d) => geo(`bx${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
  const icoG = (r, d = 0) => geo(`ic${r}_${d}`, () => new THREE.IcosahedronGeometry(r, d));
  const planeG = (w, h, sw = 1, sh = 1) => geo(`pl${w}_${h}_${sw}_${sh}`, () => new THREE.PlaneGeometry(w, h, sw, sh));
  const octaG = (r) => geo(`oc${r}`, () => new THREE.OctahedronGeometry(r, 0));
  // Organic blob — icosahedron displaced by a deterministic per-vertex hash.
  const blobG = (r, bseed, amp = 0.28) => geo(`bl${r}_${bseed}_${amp}`, () => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position;
    const rr = seededRandom(bseed);
    // Displace unique vertices consistently: hash by rounded position.
    const seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)}|${p.getY(i).toFixed(3)}|${p.getZ(i).toFixed(3)}`;
      let f = seen.get(k);
      if (f === undefined) { f = 1 + (rr() * 2 - 1) * amp; seen.set(k, f); }
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.92, p.getZ(i) * f);
    }
    g.computeVertexNormals();
    return g;
  });

  // ------------------------------------------------------------- material lib
  function std(key, opts = {}) {
    let m = matCache.get(key);
    if (m) return m;
    m = new THREE.MeshStandardMaterial({
      color: 0xffffff, // instances carry the tint
      flatShading: opts.flat !== false,
      roughness: opts.rough ?? 0.92,
      metalness: opts.metal ?? 0.0,
      vertexColors: !!opts.vcolor,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      emissive: new THREE.Color(opts.emissive ?? 0x000000),
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      depthWrite: opts.depthWrite ?? true,
    });
    if (opts.sway) {
      try { disposables.push({ fn: windSway(m, { strength: opts.sway }) }); } // fn = sway unregister
      catch (e) { warnOnce('windSway unavailable: ' + e.message); }
    }
    if (opts.pulse) pulseMats.push({ m, base: opts.emissiveIntensity ?? 1, amp: opts.pulse.amp ?? 0.4, speed: opts.pulse.speed ?? 1.2, phase: opts.pulse.phase ?? 0 });
    if (opts.night) nightMats.push({ m, base: opts.emissiveIntensity ?? 1 });
    matCache.set(key, m);
    disposables.push({ mat: m });
    return m;
  }

  const FOLIAGE  = std('foliage', { sway: 0.55, rough: 0.95 });
  const FOLIAGE2 = std('foliage2', { sway: 0.3, rough: 0.95 });         // subtle sway
  const SOLID    = std('solid', {});                                     // rock/wood/stone
  const SOLID_S  = std('solid_smooth', { flat: true, rough: 0.85 });
  const CLOTH    = std('cloth', { sway: 0.65, side: THREE.DoubleSide, rough: 1 });
  const FROND    = std('frond', { sway: 0.8, side: THREE.DoubleSide, rough: 0.95 });
  const ICE      = std('ice', { rough: 0.35, transparent: true, opacity: 0.85, emissive: 0x9fd4ff, emissiveIntensity: 0.12 });
  const GLOW_CRYSTAL = std('glow_crystal', { emissive: 0x9fe8ff, emissiveIntensity: 0.9, rough: 0.4, pulse: { amp: 0.45, speed: 1.1 } });
  const GLOW_FRUIT  = std('glow_fruit', { emissive: 0xffe9b0, emissiveIntensity: 1.1, rough: 0.5, pulse: { amp: 0.35, speed: 0.8, phase: 1.7 } });
  const GLOW_FERN   = std('glow_fern', { sway: 0.6, side: THREE.DoubleSide, emissive: 0x59e8c2, emissiveIntensity: 0.85, pulse: { amp: 0.4, speed: 1.4 } });
  const GLOW_RUNE   = std('glow_rune', { emissive: 0xffe9b0, emissiveIntensity: 0.8, rough: 0.6, pulse: { amp: 0.25, speed: 0.55 } });
  const GLOW_LAVA   = std('glow_lava', { emissive: 0xff5a1f, emissiveIntensity: 1.3, rough: 0.7, pulse: { amp: 0.5, speed: 0.9 } });
  const WINDOW      = std('window', { emissive: 0xffc97a, emissiveIntensity: 0.9, rough: 0.4, night: true });
  const LAMP_GLASS  = std('lamp_glass', { emissive: 0xffd9a0, emissiveIntensity: 1.2, rough: 0.3, night: true });
  const BERRY       = std('berry', { emissive: 0xd83a4a, emissiveIntensity: 0.25, rough: 0.6 });
  const SPIRE_SEAM  = std('spire_seam', { emissive: 0xcfd4e8, emissiveIntensity: 0.55, rough: 0.6, pulse: { amp: 0.2, speed: 0.4 } });

  // Vertex-colored variants — merged prop geometries bake their palette +
  // gradients into geometry colors; instance color then only carries a subtle
  // per-instance brightness / warm-cool jitter (part.vjit).
  const FOLIAGE_V  = std('foliage_v', { sway: 0.55, rough: 0.95, vcolor: true });
  const FOLIAGE2_V = std('foliage2_v', { sway: 0.28, rough: 0.95, vcolor: true });
  const SOLID_V    = std('solid_v', { vcolor: true });
  const FROND_V    = std('frond_v', { sway: 0.8, side: THREE.DoubleSide, rough: 0.95, vcolor: true });

  // Soft contact-shadow disc (instanced under large props) + warm glow pool.
  const SHADOW = (() => {
    const m = new THREE.MeshBasicMaterial({
      color: 0x000000, map: discTex(), transparent: true, opacity: 0.34,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    matCache.set('shadow_disc', m);
    disposables.push({ mat: m });
    return m;
  })();

  // ------------------------------------------------------- merged-geo assembly
  // piece(src, o): clone a primitive, optionally jitter, transform, and return a
  // non-indexed geometry ready for color baking + merging. Never mutates `src`.
  //   o: { t:[x,y,z], r:[x,y,z], s:number|[x,y,z], jit, jseed }
  const _tmpE = new THREE.Euler();
  function piece(src, o = {}) {
    const g = src.index ? src.toNonIndexed() : src.clone();
    const s = o.s ?? 1;
    const sv = typeof s === 'number' ? [s, s, s] : s;
    _tmpE.set(...(o.r ?? [0, 0, 0]));
    _m4.compose(
      _pos.set(...(o.t ?? [0, 0, 0])),
      _quat.setFromEuler(_tmpE),
      _scl.set(sv[0], sv[1], sv[2]),
    );
    g.applyMatrix4(_m4);
    if (o.jit) jitterGeometry(g, o.jit, o.jseed ?? 1);
    return g;
  }

  // Bake an absolute vertical color ramp (post-transform coords) into a piece.
  // The current sky rig is a single dominant overhead key with a weak fill, so
  // vertical faces get starved — `lift` bakes a fake side-fill by brightening
  // vertices in proportion to how vertical their face is (1 - |ny|).
  //   ramp(g, from, to, lo, hi, {noise, seed, exp, axis:0|1|2, lift})
  function ramp(g, from, to, lo, hi, o = {}) {
    const p = g.attributes.position;
    if (!g.attributes.normal) g.computeVertexNormals();
    const nrm = g.attributes.normal;
    const noise = o.noise ?? 0.045, seed = o.seed ?? 1, exp = o.exp ?? 1, ax = o.axis ?? 1;
    const lift = o.lift ?? 0.38;
    _c1.set(from); _c2.set(to);
    const span = Math.max(1e-5, hi - lo);
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const v = ax === 0 ? x : ax === 2 ? z : y;
      let t = clamp((v - lo) / span, 0, 1);
      t = Math.pow(t, exp);
      const n = noise ? hashN(x, y, z, seed) * noise : 0;
      const sl = 1 + lift * (1 - Math.abs(nrm.getY(i)));
      colors[i * 3 + 0] = (_c1.r + (_c2.r - _c1.r) * t + n) * sl;
      colors[i * 3 + 1] = (_c1.g + (_c2.g - _c1.g) * t + n) * sl;
      colors[i * 3 + 2] = (_c1.b + (_c2.b - _c1.b) * t + n * 0.7) * sl;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }

  // Flat single-color bake with mottling (same baked side-fill as ramp()).
  function tintG(g, hex, noise = 0.04, seed = 1, lift = 0.38) {
    const p = g.attributes.position;
    if (!g.attributes.normal) g.computeVertexNormals();
    const nrm = g.attributes.normal;
    _c1.set(hex);
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const n = noise ? hashN(p.getX(i), p.getY(i), p.getZ(i), seed) * noise : 0;
      const sl = 1 + lift * (1 - Math.abs(nrm.getY(i)));
      colors[i * 3 + 0] = (_c1.r + n) * sl;
      colors[i * 3 + 1] = (_c1.g + n) * sl;
      colors[i * 3 + 2] = (_c1.b + n * 0.7) * sl;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }

  // Per-face painter (non-indexed geometry): fn(cx,cy,cz,nx,ny,nz) -> hex.
  const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fc = new THREE.Vector3();
  function paintFaces(g, fn) {
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    for (let f = 0; f < p.count; f += 3) {
      _fa.fromBufferAttribute(p, f);
      _fb.fromBufferAttribute(p, f + 1);
      _fc.fromBufferAttribute(p, f + 2);
      const cx = (_fa.x + _fb.x + _fc.x) / 3, cy = (_fa.y + _fb.y + _fc.y) / 3, cz = (_fa.z + _fb.z + _fc.z) / 3;
      _fb.sub(_fa); _fc.sub(_fa);
      _fb.cross(_fc).normalize();
      _c1.set(fn(cx, cy, cz, _fb.x, _fb.y, _fb.z));
      const sl = 1 + 0.38 * (1 - Math.abs(_fb.y)); // baked side-fill (see ramp)
      for (let k = 0; k < 3; k++) {
        colors[(f + k) * 3 + 0] = _c1.r * sl;
        colors[(f + k) * 3 + 1] = _c1.g * sl;
        colors[(f + k) * 3 + 2] = _c1.b * sl;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }

  // Merge colored pieces into one cached geometry (key must be variant-unique).
  function merged(key, build) {
    return geo(key, () => {
      const pieces = build().filter(Boolean);
      const g = mergeGeometries(pieces, false) ?? pieces[0];
      for (const p of pieces) { if (p !== g) p.dispose(); }
      return g;
    });
  }

  // Shadow-disc part (instanced with the prop; sits just above local ground).
  const shadowP = (r, y = 0.05) => {
    const p = P(planeG(2, 2), SHADOW, 0xffffff, [0, y, 0], [r, r, r], [-Math.PI / 2, 0, 0], 0, false);
    p.ro = 1; // render after opaque ground
    return p;
  };

  // ---------------------------------------------------- organic form builders
  // Tapered, leaning trunk with root flare (rings bend progressively).
  function trunkG({ h = 2, r0 = 0.26, r1 = 0.13, lean = 0, flare = 0.55, seed = 1, segs = 7 }) {
    const g = new THREE.CylinderGeometry(r1, r0, h, segs, 4).toNonIndexed();
    g.translate(0, h / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = clamp(y / h, 0, 1);
      const fl = 1 + flare * Math.pow(Math.max(0, 1 - t * 3.2), 2.2); // root flare
      const dx = lean * t * t * h;                                     // progressive lean
      p.setXYZ(i, p.getX(i) * fl + dx, y, p.getZ(i) * fl);
    }
    jitterGeometry(g, r0 * 0.14, seed);
    return g;
  }

  // Gable roof: triangular prism, ridge along local X, slopes ramped dark
  // eave -> light ridge, gable end triangles painted in the wall tone.
  function gableG({ L = 3.8, halfW = 1.85, roofH = 1.4, y = 2.2, dark = 0x7e3a30, light = 0xb85c4a, wall = 0xe8dcc2, seed = 1 }) {
    const g = new THREE.CylinderGeometry(1, 1, L, 3, 1, false, Math.PI / 2).toNonIndexed();
    g.rotateZ(Math.PI / 2);                    // ridge along X, apex up
    g.scale(1, roofH / 1.5, halfW / 0.8660254);
    g.translate(0, y + roofH / 3, 0);          // base plane sits at `y`
    jitterGeometry(g, 0.02, seed);
    paintFaces(g, (cx, cy, cz, nx) => {
      if (Math.abs(nx) > 0.85) return wall;    // gable triangles
      const t = clamp((cy - y) / roofH, 0, 1);
      return lerpColorHex(dark, light, clamp(t * 0.9 + hashN(cx, cy, cz, seed) * 0.1, 0, 1));
    });
    return g;
  }

  // Multi-lobed canopy: k jittered icosphere lobes clustered around (0, cy, 0).
  // Returns pieces[] (uncolored) + the [lo,hi] y-range for a shared ramp.
  function canopyPieces(rng, { k = 5, cy = 2.6, R = 1.25, spread = 0.75, squash = 0.8, seed = 1, detail = 1, jit = 0.16 }) {
    const pieces = [];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < k; i++) {
      const top = i === 0;
      const a = (i / Math.max(1, k - 1)) * TAU + rng() * 0.9;
      const rad = top ? 0 : spread * R * (0.55 + rng() * 0.55);
      const r = R * (top ? 0.85 : 0.5 + rng() * 0.42);
      const px = Math.cos(a) * rad, pz = Math.sin(a) * rad;
      const py = cy + (top ? R * 0.42 : (rng() - 0.35) * R * 0.55);
      const g = piece(icoG(1, detail), {
        t: [px, py, pz], s: [r, r * squash, r],
        r: [0, rng() * TAU, 0], jit, jseed: seed * 13 + i,
      });
      pieces.push(g);
      lo = Math.min(lo, py - r * squash); hi = Math.max(hi, py + r * squash);
    }
    return { pieces, lo, hi };
  }

  // Clustered jittered stones (shared by rock kinds); colors baked top-lit.
  function stonePieces(rng, { k = 3, R = 0.55, seed = 1, dark = 0x6e6b64, light = 0xa4a198 }) {
    const pieces = [];
    for (let i = 0; i < k; i++) {
      const main = i === 0;
      const a = rng() * TAU;
      const rad = main ? 0 : R * (0.85 + rng() * 0.6);
      const r = R * (main ? 1 : 0.3 + rng() * 0.4);
      const sy = 0.62 + rng() * 0.3;
      const g = piece(icoG(1, 1), {
        t: [Math.cos(a) * rad, r * sy * 0.72, Math.sin(a) * rad],
        s: [r * (0.9 + rng() * 0.35), r * sy, r * (0.9 + rng() * 0.35)],
        r: [(rng() - 0.5) * 0.3, rng() * TAU, (rng() - 0.5) * 0.3],
        jit: r * 0.24, jseed: seed * 7 + i,
      });
      ramp(g, dark, light, -R * 0.2, r * sy * 1.55, { noise: 0.05, seed: seed + i, exp: 1.25 });
      pieces.push(g);
    }
    return pieces;
  }

  // A few baked grass blades (tiny cones) for prop feet.
  function tuftPieces(rng, { n = 4, R = 0.5, h = 0.34, c1 = 0x4f9e4f, c2 = 0x7ec850, seed = 1 }) {
    const pieces = [];
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, rad = R * (0.7 + rng() * 0.5);
      const bh = h * (0.7 + rng() * 0.7);
      const g = piece(coneG(0.035, 1, 4), {
        t: [Math.cos(a) * rad, bh * 0.5, Math.sin(a) * rad],
        s: [1, bh, 1],
        r: [(rng() - 0.5) * 0.5, rng() * TAU, (rng() - 0.5) * 0.5],
      });
      ramp(g, lerpColorHex(c1, c2, rng()), c2, 0, bh, { noise: 0.03, seed: seed + i });
      pieces.push(g);
    }
    return pieces;
  }

  // ------------------------------------------------------------- placement utils
  const terrainY = (x, z) => { try { return heightAt(x, z); } catch (e) { return 0; } };

  function distToSeg(x, z, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L2 = dx * dx + dz * dz || 1e-6;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1);
    const px = a[0] + dx * t, pz = a[1] + dz * t;
    return Math.hypot(x - px, z - pz);
  }
  function pathInfo(x, z) {
    let best = Infinity, bw = 0;
    for (const p of paths) {
      const d = distToSeg(x, z, p.from, p.to);
      if (d < best) { best = d; bw = p.width ?? 3; }
    }
    return { d: best, w: bw };
  }
  const inWater = (x, z) => water ? terrainY(x, z) < water.level + 0.12 : false;

  // ---------------------------------------------------------------- kind defs
  // Part: { g, m, off:[x,y,z], rot:[x,y,z], scl:[x,y,z]|n, tint, jit, shadow }
  // Def:  { make(rng)->parts[], collider, variants, ground:'terrain'|'water'|'hang',
  //         faceCenter, faceWater, hangH:[lo,hi], effect(x,y,z,s,rng), noPathAvoid }
  const P = (g, m, tint, off = [0, 0, 0], scl = 1, rot = [0, 0, 0], jit = 0.06, shadow = true) =>
    ({ g, m, tint, off, scl, rot, jit, shadow });

  // Vertex-colored merged part: white tint, per-instance brightness/warmth jitter.
  const V = (g, m, vjit = [0.07, 0.05]) => {
    const p = P(g, m, 0xffffff, [0, 0, 0], 1, [0, 0, 0], 0);
    p.vjit = vjit;
    return p;
  };

  const KINDS = {
    // ------------------------------------------------------------- trees
    tree_oak: {
      variants: 4, collider: 0.55, cluster: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const lean = (rng() - 0.5) * 0.18;
        const g = merged(`oakM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const tr = trunkG({ h: 2.0, r0: 0.3, r1: 0.13, lean, flare: 0.7, seed: vs });
          ramp(tr, 0x5f452c, 0x8f6f4e, 0, 2.0, { noise: 0.05, seed: vs });
          pieces.push(tr);
          for (let i = 0; i < 3; i++) { // root nubs
            const a = (i / 3) * TAU + r2() * 1.2;
            const rn = piece(coneG(0.12, 0.4, 5), {
              t: [Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3],
              r: [Math.sin(a) * 1.15, r2() * TAU, -Math.cos(a) * 1.15], jit: 0.03, jseed: vs + i,
            });
            ramp(rn, 0x554029, 0x6f5138, 0, 0.4, { seed: vs + i });
            pieces.push(rn);
          }
          const br = piece(cylG(0.05, 0.1, 1.0, 5), { // branch into canopy
            t: [lean * 2 + 0.35, 2.25, 0.1], r: [0.2, 0, -0.85], jit: 0.02, jseed: vs + 9,
          });
          ramp(br, 0x6a4c33, 0x82603f, 1.8, 2.8, { seed: vs });
          pieces.push(br);
          const cn = canopyPieces(r2, { k: 6, cy: 2.75, R: 1.3, spread: 0.8, squash: 0.78, seed: vs });
          for (const c of cn.pieces) {
            c.translate(lean * 1.7, 0, 0);
            ramp(c, 0x35652c, 0x93ce5a, cn.lo, cn.hi, { noise: 0.05, seed: vs, exp: 1.15 });
          }
          pieces.push(...cn.pieces);
          return pieces;
        });
        return [V(g, FOLIAGE_V, [0.08, 0.06]), shadowP(1.7)];
      },
    },
    tree_pine: {
      variants: 3, collider: 0.5, cluster: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`pineM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const tr = trunkG({ h: 1.7, r0: 0.22, r1: 0.09, lean: (r2() - 0.5) * 0.08, flare: 0.55, seed: vs });
          ramp(tr, 0x52381f, 0x7a5738, 0, 1.7, { noise: 0.05, seed: vs });
          pieces.push(tr);
          let y = 1.25, r = 1.32;
          const cones = [];
          for (let i = 0; i < 4; i++) {
            const h = 1.55 - i * 0.18;
            const cone = piece(coneG(1, 1, 8), {
              t: [(r2() - 0.5) * 0.14, y + h / 2, (r2() - 0.5) * 0.14],
              s: [r * (0.94 + r2() * 0.12), h, r * (0.94 + r2() * 0.12)],
              r: [(r2() - 0.5) * 0.07, r2() * TAU, (r2() - 0.5) * 0.07],
              jit: 0.09, jseed: vs * 3 + i,
            });
            cones.push(cone);
            y += h * 0.58;
            r *= 0.7;
          }
          const hi = y + 1.0;
          for (const c of cones) ramp(c, 0x1d4a33, 0x5fa963, 1.0, hi, { noise: 0.05, seed: vs, exp: 1.2 });
          pieces.push(...cones);
          return pieces;
        });
        return [V(g, FOLIAGE2_V, [0.08, 0.05]), shadowP(1.45)];
      },
    },
    tree_birch: {
      variants: 3, collider: 0.32, cluster: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const lean = (rng() - 0.5) * 0.2;
        const g = merged(`birchM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const h = 2.6;
          const tr = trunkG({ h, r0: 0.13, r1: 0.06, lean, flare: 0.5, seed: vs, segs: 6 });
          ramp(tr, 0xb9b2a2, 0xe8e2d2, 0, h, { noise: 0.04, seed: vs });
          pieces.push(tr);
          for (let i = 0; i < 4; i++) { // bark scars hug the leaning trunk
            const t = 0.18 + i * 0.2 + r2() * 0.06;
            const ry = t * h;
            const rr = lerp(0.125, 0.062, t) * 1.12;
            const band = piece(cylG(rr, rr * 1.06, 0.07 + r2() * 0.05, 6), {
              t: [lean * t * t * h, ry, 0], r: [0, r2() * TAU, (r2() - 0.5) * 0.2],
            });
            tintG(band, i % 2 ? 0x3f3c36 : 0x55504a, 0.05, vs + i);
            pieces.push(band);
          }
          const cn = canopyPieces(r2, { k: 4, cy: 2.95, R: 0.85, spread: 0.72, squash: 0.85, seed: vs + 5 });
          for (const c of cn.pieces) {
            c.translate(lean * 2.1, 0, 0);
            ramp(c, 0x6da648, 0xbce07c, cn.lo, cn.hi, { noise: 0.06, seed: vs, exp: 1.1 });
          }
          pieces.push(...cn.pieces);
          return pieces;
        });
        return [V(g, FOLIAGE_V, [0.08, 0.06]), shadowP(1.1)];
      },
    },
    tree_willow: {
      variants: 2, collider: 0.6,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`willowM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const tr = trunkG({ h: 1.8, r0: 0.32, r1: 0.16, lean: 0.16, flare: 0.75, seed: vs });
          ramp(tr, 0x60482e, 0x8a6a4c, 0, 1.8, { noise: 0.05, seed: vs });
          pieces.push(tr);
          const cn = canopyPieces(r2, { k: 5, cy: 2.45, R: 1.45, spread: 0.62, squash: 0.6, seed: vs });
          for (const c of cn.pieces) {
            c.translate(0.28, 0, 0);
            ramp(c, 0x3d6e38, 0x84c261, cn.lo, cn.hi, { noise: 0.05, seed: vs, exp: 1.1 });
          }
          pieces.push(...cn.pieces);
          return pieces;
        });
        // Hanging frond curtain — one merged double-sided swaying sheet set.
        const gf = merged(`willowF${vs}`, () => {
          const r2 = seededRandom(vs + 3);
          const pieces = [];
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * TAU + r2() * 0.4;
            const len = 1.5 + r2() * 0.9;
            const rad = 1.45 + r2() * 0.35;
            const p = piece(planeG(0.2, 1), {
              t: [Math.cos(a) * rad + 0.28, 2.15 - len / 2, Math.sin(a) * rad],
              s: [1, len, 1], r: [0.13 * (r2() - 0.2), -a + Math.PI / 2, 0],
            });
            ramp(p, 0x71b358, 0x3f7a40, 2.3 - len, 2.3, { noise: 0.05, seed: vs + i, exp: 0.8 });
            pieces.push(p);
          }
          return pieces;
        });
        const fr = V(gf, FROND_V, [0.07, 0.05]);
        fr.shadow = false;
        return [V(g, FOLIAGE2_V, [0.07, 0.05]), fr, shadowP(1.9)];
      },
    },
    tree_dead: {
      variants: 3, collider: 0.38,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`deadM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const tr = trunkG({ h: 2.3, r0: 0.22, r1: 0.05, lean: (r2() - 0.5) * 0.3, flare: 0.85, seed: vs, segs: 6 });
          ramp(tr, 0x67605a, 0x9a938c, 0, 2.3, { noise: 0.05, seed: vs });
          pieces.push(tr);
          for (let i = 0; i < 4; i++) { // gnarled reaching branches
            const a = r2() * TAU;
            const y0 = 1.2 + i * 0.32;
            const len = 0.7 + r2() * 0.7;
            const b = piece(cylG(0.02, 0.07, len, 4), {
              t: [Math.cos(a) * 0.32, y0, Math.sin(a) * 0.32],
              r: [Math.sin(a) * (0.8 + r2() * 0.5), 0, -Math.cos(a) * (0.8 + r2() * 0.5)],
              jit: 0.03, jseed: vs + i,
            });
            ramp(b, 0x514a42, 0x7d766e, y0 - len / 2, y0 + len / 2, { seed: vs + i });
            pieces.push(b);
          }
          return pieces;
        });
        return [V(g, SOLID_V, [0.07, 0.03]), shadowP(1.0)];
      },
    },
    tree_glow: {
      variants: 2, collider: 0.55,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`glowM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const tr = trunkG({ h: 2.0, r0: 0.26, r1: 0.12, lean: (r2() - 0.5) * 0.14, flare: 0.65, seed: vs });
          ramp(tr, 0x39405c, 0x5f6a8f, 0, 2.0, { noise: 0.04, seed: vs });
          pieces.push(tr);
          const cn = canopyPieces(r2, { k: 5, cy: 2.6, R: 1.15, spread: 0.75, squash: 0.78, seed: vs });
          for (const c of cn.pieces) ramp(c, 0x1c4640, 0x468579, cn.lo, cn.hi, { noise: 0.05, seed: vs, exp: 1.1 });
          pieces.push(...cn.pieces);
          return pieces;
        });
        const parts = [V(g, FOLIAGE2_V, [0.07, 0.04]), shadowP(1.5)];
        for (let i = 0; i < 5; i++) {
          const a = rng() * TAU, r = 0.55 + rng() * 0.6;
          parts.push(P(sphereG(0.09, 6, 5), GLOW_FRUIT, 0xffe9b0,
            [Math.cos(a) * r, 2.3 + rng() * 1.1, Math.sin(a) * r], 1, [0, 0, 0], 0, false));
        }
        return parts;
      },
      effect: (x, y, z, s, rng, ctx) => {
        if (ctx.singles && lightBudget > 0) {
          lightBudget--;
          const l = new THREE.PointLight(0xffe9b0, 1.6, 9 * s, 2);
          l.position.set(x, y + 2.6 * s, z);
          group.add(l);
          pulseLights.push({ light: l, base: 1.6, amp: 0.5, speed: 0.8, phase: rng() * TAU });
        }
        return null;
      },
    },
    // ------------------------------------------------------------- fungus & undergrowth
    mushroom_giant: {
      variants: 2, collider: 0.7,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const capHex = rng() > 0.5 ? 0xc25a6e : 0x8a6ec2;
        const g = merged(`mushGM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const stem = trunkG({ h: 1.7, r0: 0.44, r1: 0.3, lean: 0.09, flare: 0.5, seed: vs });
          ramp(stem, 0xcabb9e, 0xf0e6d2, 0, 1.7, { noise: 0.035, seed: vs });
          pieces.push(stem);
          const gills = piece(cylG(1.18, 1.32, 0.14, 10), { t: [0.14, 1.62, 0] });
          ramp(gills, 0xd8c9ae, 0xf4ecda, 1.5, 1.75, { noise: 0.05, seed: vs + 2 });
          pieces.push(gills);
          const cap = piece(sphereG(1, 10, 6), { t: [0.14, 1.9, 0], s: [1.55, 0.8, 1.55], jit: 0.07, jseed: vs });
          ramp(cap, lerpColorHex(capHex, 0x40202c, 0.42), lerpColorHex(capHex, 0xffe0d0, 0.28), 1.55, 2.7,
            { noise: 0.05, seed: vs, exp: 0.85 });
          pieces.push(cap);
          for (let i = 0; i < 6; i++) { // pale spots hugging the dome
            const a = r2() * TAU, rr = 0.35 + r2() * 0.85;
            const sp = piece(sphereG(0.12, 6, 4), {
              t: [0.14 + Math.cos(a) * rr, 1.92 + 0.72 * Math.sqrt(Math.max(0, 1 - (rr / 1.55) ** 2)), Math.sin(a) * rr],
              s: [1 + r2() * 0.5, 0.45, 1 + r2() * 0.5],
            });
            tintG(sp, 0xf5efe2, 0.03, vs + i);
            pieces.push(sp);
          }
          return pieces;
        });
        return [V(g, SOLID_V, [0.06, 0.04]), shadowP(1.5)];
      },
    },
    mushroom_cluster: {
      variants: 3, collider: 0, noPathAvoid: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`mushCM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const n = 3 + Math.floor(r2() * 3);
          for (let i = 0; i < n; i++) {
            const a = r2() * TAU, r = r2() * 0.4, s = 0.5 + r2() * 0.75;
            const capHex = [0xc25a6e, 0x8a6ec2, 0xd8a05a][Math.floor(r2() * 3)];
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const lean = (r2() - 0.5) * 0.35;
            const stem = piece(cylG(0.05 * s, 0.085 * s, 0.3 * s, 5), { t: [x, 0.14 * s, z], r: [0, 0, lean] });
            ramp(stem, 0xc9ba9e, 0xf0e6d2, 0, 0.3 * s, { seed: vs + i });
            pieces.push(stem);
            const cap = piece(sphereG(1, 8, 5), {
              t: [x - lean * 0.3 * s, 0.32 * s, z], s: [0.16 * s, 0.115 * s, 0.16 * s], jit: 0.05, jseed: vs + i,
            });
            ramp(cap, lerpColorHex(capHex, 0x2c1420, 0.4), lerpColorHex(capHex, 0xffe8d8, 0.3),
              0.2 * s, 0.45 * s, { noise: 0.05, seed: vs + i });
            pieces.push(cap);
          }
          return pieces;
        });
        return [V(g, SOLID_V, [0.07, 0.05])];
      },
    },
    bush: {
      variants: 3, collider: 0.4, cluster: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`bushM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const cn = canopyPieces(r2, { k: 4, cy: 0.42, R: 0.62, spread: 0.85, squash: 0.72, seed: vs, jit: 0.1 });
          for (const c of cn.pieces) ramp(c, 0x3d7538, 0x8fce5c, cn.lo, cn.hi, { noise: 0.06, seed: vs, exp: 1.1 });
          const tw = piece(cylG(0.025, 0.045, 0.5, 4), { t: [0.1, 0.35, 0.05], r: [0.3, 0, -0.4] });
          tintG(tw, 0x5c422c, 0.04, vs);
          return [...cn.pieces, tw];
        });
        return [V(g, FOLIAGE_V, [0.09, 0.07])];
      },
    },
    berry_bush: {
      variants: 2, collider: 0.4,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`berryM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const cn = canopyPieces(r2, { k: 4, cy: 0.4, R: 0.58, spread: 0.8, squash: 0.75, seed: vs });
          for (const c of cn.pieces) ramp(c, 0x27552c, 0x63a648, cn.lo, cn.hi, { noise: 0.05, seed: vs, exp: 1.1 });
          return cn.pieces;
        });
        const parts = [V(g, FOLIAGE_V, [0.08, 0.05])];
        for (let i = 0; i < 8; i++) {
          const a = rng() * TAU, b = 0.25 + rng() * 0.5 * Math.PI;
          parts.push(P(sphereG(0.05, 5, 4), BERRY, 0xd83a4a,
            [Math.sin(b) * Math.cos(a) * 0.62, 0.42 + Math.cos(b) * 0.42, Math.sin(b) * Math.sin(a) * 0.62], 1, [0, 0, 0], 0, false));
        }
        return parts;
      },
    },
    flower_patch: {
      variants: 4, collider: 0, noPathAvoid: true, pathRing: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`flowM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const petals = [0xfff4f8, 0xffd94f, 0xff9fb0, 0xb0a8ff, 0xffb85c];
          const n = 6 + Math.floor(r2() * 4);
          for (let i = 0; i < n; i++) {
            const a = r2() * TAU, r = 0.15 + r2() * 0.6, s = 0.8 + r2() * 0.7;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const cHex = petals[Math.floor(r2() * petals.length)];
            const tilt = (r2() - 0.5) * 0.4;
            const stem = piece(cylG(0.013, 0.018, 0.3 * s, 4), { t: [x, 0.15 * s, z], r: [tilt, 0, tilt] });
            ramp(stem, 0x3f7a38, 0x6fb35a, 0, 0.3 * s, { seed: vs + i });
            pieces.push(stem);
            const leaf = piece(coneG(0.045, 0.16 * s, 4), {
              t: [x + 0.06, 0.06 * s, z], r: [1.35, r2() * TAU, 0], s: [1, 1, 0.4],
            });
            tintG(leaf, 0x559444, 0.04, vs + i);
            pieces.push(leaf);
            const head = piece(icoG(1, 0), {
              t: [x + tilt * 0.09 * s, 0.32 * s, z + tilt * 0.09 * s],
              s: [0.075 * s, 0.042 * s, 0.075 * s], r: [tilt, r2() * TAU, tilt], jit: 0.012, jseed: vs + i,
            });
            ramp(head, lerpColorHex(cHex, 0x664433, 0.25), lerpColorHex(cHex, 0xffffff, 0.2),
              0.28 * s, 0.37 * s, { noise: 0.04, seed: vs + i });
            pieces.push(head);
            const core = piece(sphereG(0.026 * s, 5, 4), { t: [x + tilt * 0.09 * s, 0.345 * s, z + tilt * 0.09 * s] });
            tintG(core, 0xffe07a, 0.02, vs + i);
            pieces.push(core);
          }
          return pieces;
        });
        return [V(g, FOLIAGE_V, [0.08, 0.05])];
      },
    },
    fern: {
      variants: 3, collider: 0, noPathAvoid: true, cluster: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`fernM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const n = 6 + Math.floor(r2() * 3);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + r2() * 0.5;
            const len = 0.55 + r2() * 0.4;
            const p = piece(planeG(0.17, 1), {
              t: [Math.cos(a) * 0.14, len * 0.4, Math.sin(a) * 0.14],
              s: [1, len, 1], r: [-0.62 - r2() * 0.35, -a + Math.PI / 2, 0],
            });
            ramp(p, 0x2d6b34, 0x74b356, 0, len * 0.8, { noise: 0.05, seed: vs + i });
            pieces.push(p);
          }
          return pieces;
        });
        const p = V(g, FROND_V, [0.09, 0.06]);
        p.shadow = false;
        return [p];
      },
    },
    glowfern: {
      variants: 2, collider: 0, noPathAvoid: true, cluster: true,
      make: (rng) => {
        const parts = [];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + rng() * 0.5;
          parts.push(P(planeG(0.14, 0.6), GLOW_FERN, 0x59e8c2,
            [Math.cos(a) * 0.1, 0.26, Math.sin(a) * 0.1], [1, 0.8 + rng() * 0.4, 1], [-0.55 - rng() * 0.3, -a + Math.PI / 2, 0], 0.1, false));
        }
        return parts;
      },
    },
    grass_tuft: {
      variants: 4, collider: 0, noPathAvoid: true, pathRing: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`grassM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const n = 6 + Math.floor(r2() * 3);
          for (let i = 0; i < n; i++) {
            const a = r2() * TAU, r = r2() * 0.16;
            const h = 0.34 + r2() * 0.32;
            const b = piece(coneG(0.035, 1, 4), {
              t: [Math.cos(a) * r, h * 0.48, Math.sin(a) * r], s: [1, h, 1],
              r: [(r2() - 0.5) * 0.55, r2() * TAU, (r2() - 0.5) * 0.55],
            });
            ramp(b, lerpColorHex(0x3f7a38, 0x568c40, r2()), lerpColorHex(0x8fce5c, 0xb8d970, r2()),
              0, h, { noise: 0.04, seed: vs + i });
            pieces.push(b);
          }
          if (r2() > 0.55) { // occasional seed head
            const h = 0.55 + r2() * 0.2;
            const st = piece(cylG(0.012, 0.018, h, 4), { t: [0.05, h / 2, 0.03], r: [0.12, 0, -0.1] });
            ramp(st, 0x6f9e57, 0xc9c078, 0, h, { seed: vs });
            pieces.push(st);
            const hd = piece(icoG(1, 0), { t: [0.05 + 0.07, h + 0.03, 0.03], s: [0.035, 0.075, 0.035] });
            tintG(hd, 0xd9cb84, 0.04, vs);
            pieces.push(hd);
          }
          return pieces;
        });
        return [V(g, FOLIAGE_V, [0.1, 0.07])];
      },
    },
    reeds: {
      variants: 3, collider: 0, noPathAvoid: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`reedM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const n = 6 + Math.floor(r2() * 4);
          for (let i = 0; i < n; i++) {
            const a = r2() * TAU, r = r2() * 0.38, h = 0.9 + r2() * 0.75;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const tilt = (r2() - 0.5) * 0.18;
            const st = piece(cylG(0.015, 0.028, h, 4), { t: [x, h / 2, z], r: [tilt, 0, tilt] });
            ramp(st, 0x4e7a3c, 0x9ec26a, 0, h, { noise: 0.04, seed: vs + i });
            pieces.push(st);
            if (r2() > 0.35) {
              const hd = piece(cylG(0.037, 0.041, 0.2, 5), { t: [x + tilt * h * 0.5, h + 0.08, z + tilt * h * 0.5], r: [tilt, 0, tilt] });
              ramp(hd, 0x6b4c30, 0x9a744c, h, h + 0.2, { seed: vs + i });
              pieces.push(hd);
            }
          }
          return pieces;
        });
        return [V(g, FOLIAGE_V, [0.08, 0.05])];
      },
    },
    lilypad: {
      variants: 3, collider: 0, ground: 'water', noPathAvoid: true,
      make: (rng) => {
        const parts = [
          P(cylG(0.42, 0.42, 0.02, 9), FOLIAGE2, 0x4f9e57, [0, 0, 0], [1, 1, 1], [0, rng() * TAU, 0], 0.08, false),
          P(boxG(0.18, 0.021, 0.12), FOLIAGE2, 0x4f9e57, [0.36, 0.0, 0.1], 1, [0, 0.4, 0], 0.08, false),
        ];
        if (rng() > 0.6) parts.push(P(octaG(0.08), FOLIAGE2, 0xffc9d8, [0.1, 0.07, -0.08], [1, 0.6, 1], [0, 0, 0], 0.05, false));
        return parts;
      },
    },
    // ------------------------------------------------------------- rocks & crystal
    rock: {
      variants: 3, collider: 0.55, cluster: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`rockM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          return [
            ...stonePieces(r2, { k: 3, R: 0.58, seed: vs, dark: 0x7d7a72, light: 0xbcb8ad }),
            ...tuftPieces(r2, { n: 3, R: 0.62, seed: vs + 5 }),
          ];
        });
        return [V(g, SOLID_V, [0.07, 0.04]), shadowP(0.95)];
      },
    },
    rock_mossy: {
      variants: 3, collider: 0.55,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`rockMoM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = stonePieces(r2, { k: 2, R: 0.6, seed: vs, dark: 0x757a6c, light: 0xb0ac9e });
          // moss saddle hugging the crown, thin — not a green pillow
          const moss = piece(icoG(1, 1), {
            t: [0.08, 0.68, -0.05], s: [0.52, 0.17, 0.48], r: [0.1, r2() * TAU, -0.08], jit: 0.14, jseed: vs + 3,
          });
          ramp(moss, 0x3f6b34, 0x74a854, 0.5, 0.9, { noise: 0.06, seed: vs + 3 });
          pieces.push(moss);
          const drip = piece(icoG(1, 1), { // moss run-off down one flank
            t: [0.4, 0.4, 0.22], s: [0.2, 0.28, 0.16], r: [0, r2() * TAU, 0], jit: 0.12, jseed: vs + 4,
          });
          ramp(drip, 0x35592c, 0x5c8a4a, 0.15, 0.7, { seed: vs + 4 });
          pieces.push(drip);
          pieces.push(...tuftPieces(r2, { n: 3, R: 0.68, seed: vs + 6 }));
          return pieces;
        });
        return [V(g, SOLID_V, [0.07, 0.04]), shadowP(1.0)];
      },
    },
    rock_crystal: {
      variants: 2, collider: 0.55,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`rockCrM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          return stonePieces(r2, { k: 3, R: 0.52, seed: vs, dark: 0x6e6c78, light: 0xa4a1b0 });
        });
        return [
          V(g, SOLID_V, [0.07, 0.04]), shadowP(0.9),
          P(octaG(0.22), GLOW_CRYSTAL, 0x9fe8ff, [0.1, 0.65, 0.05], [1, 2.2, 1], [0.15, rng() * TAU, -0.1], 0.08),
          P(octaG(0.14), GLOW_CRYSTAL, 0xc2f0ff, [-0.28, 0.45, 0.14], [1, 1.9, 1], [-0.3, rng() * TAU, 0.25], 0.08),
          P(octaG(0.1), GLOW_CRYSTAL, 0xb8e0ff, [0.38, 0.42, -0.22], [1, 1.6, 1], [0.3, rng() * TAU, 0.2], 0.08),
        ];
      },
    },
    crystal_cluster: {
      variants: 3, collider: 0.6,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`cryBM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          return stonePieces(r2, { k: 4, R: 0.5, seed: vs, dark: 0x5c5a66, light: 0x8f8c9a });
        });
        const parts = [V(g, SOLID_V, [0.06, 0.03]), shadowP(1.05)];
        const n = 5 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const a = rng() * TAU, r = rng() * 0.42, h = 1.1 + rng() * 1.6;
          parts.push(P(octaG(0.2), GLOW_CRYSTAL, rng() > 0.5 ? 0x9fe8ff : 0xb8a8ff,
            [Math.cos(a) * r, h * 0.35, Math.sin(a) * r], [0.8 + rng() * 0.4, h * 2.2, 0.8 + rng() * 0.4],
            [(rng() - 0.5) * 0.55, rng() * TAU, (rng() - 0.5) * 0.55], 0.08));
        }
        return parts;
      },
      effect: (x, y, z, s, rng, ctx) => {
        if (ctx.singles && lightBudget > 0) {
          lightBudget--;
          const l = new THREE.PointLight(0xa8dcff, 1.4, 8 * s, 2);
          l.position.set(x, y + 1.2 * s, z);
          group.add(l);
          pulseLights.push({ light: l, base: 1.4, amp: 0.45, speed: 1.1, phase: rng() * TAU });
        }
        return null;
      },
    },
    stump: {
      variants: 2, collider: 0.35,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`stumpM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const body = trunkG({ h: 0.48, r0: 0.34, r1: 0.29, lean: 0.04, flare: 0.9, seed: vs });
          ramp(body, 0x5f452c, 0x8a6a4c, 0, 0.5, { noise: 0.05, seed: vs });
          pieces.push(body);
          const top = piece(cylG(0.27, 0.27, 0.035, 8), { t: [0.02, 0.49, 0] });
          tintG(top, 0xcfa87a, 0.04, vs);
          pieces.push(top);
          const ring = piece(cylG(0.17, 0.17, 0.042, 8), { t: [0.02, 0.49, 0] });
          tintG(ring, 0xa8804e, 0.04, vs + 1);
          pieces.push(ring);
          const heart = piece(cylG(0.06, 0.06, 0.048, 6), { t: [0.02, 0.49, 0] });
          tintG(heart, 0x7d5b38, 0.03, vs + 2);
          pieces.push(heart);
          for (let i = 0; i < 3; i++) { // root spurs
            const a = (i / 3) * TAU + r2();
            const rn = piece(coneG(0.11, 0.34, 5), {
              t: [Math.cos(a) * 0.32, 0.08, Math.sin(a) * 0.32],
              r: [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25], jit: 0.03, jseed: vs + i,
            });
            ramp(rn, 0x412d1c, 0x5c422c, 0, 0.3, { seed: vs + i });
            pieces.push(rn);
          }
          const moss = piece(icoG(1, 1), { t: [-0.16, 0.47, 0.12], s: [0.18, 0.06, 0.15], jit: 0.14, jseed: vs + 8 });
          ramp(moss, 0x3f6b34, 0x74a854, 0.42, 0.55, { seed: vs + 8 });
          pieces.push(moss);
          pieces.push(...tuftPieces(r2, { n: 3, R: 0.45, seed: vs + 9 }));
          return pieces;
        });
        return [V(g, SOLID_V, [0.06, 0.04]), shadowP(0.7)];
      },
    },
    log: {
      variants: 2, collider: 0.35,
      // Fallen trunk: jittered bark body lit top-down, sawn end rings, snapped
      // branch stub, moss saddle and grass at the contact line.
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`logM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const body = piece(cylG(0.23, 0.27, 1.9, 9), { t: [0, 0.27, 0], r: [0, 0, Math.PI / 2], jit: 0.03, jseed: vs });
          ramp(body, 0x6f5138, 0xa8845c, 0.02, 0.52, { noise: 0.05, seed: vs });
          pieces.push(body);
          const ends = [
            [0.96, 0.24, 0xcfa87a], [0.96, 0.155, 0xa8804e], [0.96, 0.06, 0x7d5b38],
            [-0.96, 0.245, 0xc9a06f], [-0.96, 0.15, 0x9e7644],
          ];
          let off = 0.025;
          for (const [ex, er, ec] of ends) {
            const d = piece(cylG(er, er, off, 9), { t: [ex + Math.sign(ex) * 0.004, 0.27, 0], r: [0, 0, Math.PI / 2] });
            tintG(d, ec, 0.03, vs);
            pieces.push(d);
            off += 0.006;
          }
          const stub = piece(cylG(0.05, 0.07, 0.32, 5), { t: [0.35, 0.5, 0.06], r: [0.9, 0, 0.5], jit: 0.02, jseed: vs + 2 });
          ramp(stub, 0x543c26, 0x6b4a33, 0.35, 0.65, { seed: vs + 2 });
          pieces.push(stub);
          const moss = piece(icoG(1, 1), { t: [-0.42, 0.5, 0], s: [0.26, 0.08, 0.19], jit: 0.14, jseed: vs + 3 });
          ramp(moss, 0x3f6b34, 0x74a854, 0.4, 0.62, { seed: vs + 3 });
          pieces.push(moss);
          pieces.push(...tuftPieces(r2, { n: 4, R: 0.75, seed: vs + 4 }));
          return pieces;
        });
        return [V(g, SOLID_V, [0.06, 0.04]), shadowP(1.0)];
      },
    },
    // ------------------------------------------------------------- town & structures
    fence: {
      variants: 3, collider: 0.45,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`fenceM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          for (const px of [-0.65, 0.65]) {
            const lean = (r2() - 0.5) * 0.09;
            const post = piece(boxG(0.1, 0.78, 0.1), { t: [px, 0.37, 0], r: [(r2() - 0.5) * 0.05, 0, lean], jit: 0.012, jseed: vs + px });
            ramp(post, 0x8f6b44, 0xb08a58, 0, 0.8, { noise: 0.05, seed: vs + px * 3 });
            pieces.push(post);
            const cap = piece(coneG(0.085, 0.1, 4), { t: [px - lean * 0.5, 0.79, 0], r: [0, r2(), lean] });
            tintG(cap, 0xa08054, 0.05, vs + px);
            pieces.push(cap);
          }
          for (const [ry, sag] of [[0.56, 0.02], [0.29, 0.035]]) {
            const rail = piece(boxG(1.58, 0.075, 0.055), { t: [0, ry, 0.02], r: [0, 0, (r2() - 0.5) * sag * 2], jit: 0.012, jseed: vs + ry });
            ramp(rail, 0xa07a4c, 0xcaa476, ry - 0.05, ry + 0.05, { noise: 0.06, seed: vs + ry * 7 });
            pieces.push(rail);
          }
          return pieces;
        });
        return [V(g, SOLID_V, [0.07, 0.04])];
      },
    },
    lamp_post: {
      variants: 1, collider: 0.28,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`lampM${vs}`, () => {
          const pieces = [];
          const base = piece(cylG(0.15, 0.21, 0.14, 7), { t: [0, 0.07, 0], jit: 0.008, jseed: vs });
          ramp(base, 0x3a4050, 0x555d72, 0, 0.16, { seed: vs });
          pieces.push(base);
          const pole = piece(cylG(0.042, 0.075, 2.3, 6), { t: [0, 1.15, 0], jit: 0.006, jseed: vs + 1 });
          ramp(pole, 0x3d4454, 0x616a80, 0, 2.3, { noise: 0.03, seed: vs + 1 });
          pieces.push(pole);
          const collar = piece(cylG(0.065, 0.052, 0.07, 6), { t: [0, 1.9, 0] });
          tintG(collar, 0x4c5364, 0.03, vs);
          pieces.push(collar);
          const arm = piece(boxG(0.5, 0.05, 0.05), { t: [0.2, 2.28, 0] });
          ramp(arm, 0x424a5c, 0x5c6579, 2.25, 2.31, { seed: vs + 2 });
          pieces.push(arm);
          const brace = piece(boxG(0.32, 0.04, 0.04), { t: [0.15, 2.13, 0], r: [0, 0, 0.75] });
          tintG(brace, 0x424a5c, 0.03, vs + 3);
          pieces.push(brace);
          const cap = piece(coneG(0.17, 0.15, 4), { t: [0.42, 2.33, 0], r: [0, Math.PI / 4, 0] });
          ramp(cap, 0x424a5c, 0x646d84, 2.26, 2.4, { seed: vs + 4 });
          pieces.push(cap);
          const tip = piece(sphereG(0.03, 5, 4), { t: [0.42, 2.43, 0] });
          tintG(tip, 0x707a90, 0.02, vs);
          pieces.push(tip);
          return pieces;
        });
        return [
          V(g, SOLID_V, [0.05, 0.02]), shadowP(0.5),
          P(boxG(0.16, 0.22, 0.16), LAMP_GLASS, 0xffd9a0, [0.42, 2.14, 0], 1, [0, 0, 0], 0, false),
        ];
      },
      effect: (x, y, z, s, rng) => {
        if (lightBudget <= 0) return null;
        lightBudget--;
        const l = new THREE.PointLight(0xffd9a0, 0, 8 * s, 2);
        l.position.set(x, y + 2.1 * s, z);
        group.add(l);
        nightLights.push({ light: l, base: 1.5, phase: rng() * TAU });
        return null;
      },
    },
    shrine_stone: {
      variants: 2, collider: 0.5,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`shrineM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const foot = piece(boxG(0.92, 0.32, 0.92), { t: [0, 0.15, 0], r: [0, r2() * 0.3, 0], jit: 0.02, jseed: vs });
          ramp(foot, 0x8f8c83, 0xaeaba0, 0, 0.34, { noise: 0.05, seed: vs });
          pieces.push(foot);
          const lip = piece(boxG(0.99, 0.09, 0.99), { t: [0, 0.32, 0], r: [0, r2() * 0.3, 0], jit: 0.015, jseed: vs + 1 });
          tintG(lip, 0xb8b5ab, 0.04, vs + 1);
          pieces.push(lip);
          const mono = piece(boxG(0.52, 1.5, 0.36), {
            t: [0, 1.02, 0], r: [(r2() - 0.5) * 0.03, 0, (r2() - 0.5) * 0.07], jit: 0.028, jseed: vs + 2,
          });
          ramp(mono, 0xb6b2a5, 0xdad7c9, 0.3, 1.85, { noise: 0.05, seed: vs + 2 });
          pieces.push(mono);
          const cap = piece(boxG(0.58, 0.14, 0.42), { t: [0, 1.82, 0], r: [0, 0, (r2() - 0.5) * 0.08], jit: 0.02, jseed: vs + 3 });
          ramp(cap, 0xc6c3b8, 0xdcd9cd, 1.74, 1.9, { seed: vs + 3 });
          pieces.push(cap);
          const moss = piece(icoG(1, 1), { t: [0.28, 0.36, 0.24], s: [0.26, 0.1, 0.2], jit: 0.14, jseed: vs + 4 });
          ramp(moss, 0x3f6b34, 0x74a854, 0.28, 0.46, { seed: vs + 4 });
          pieces.push(moss);
          const moss2 = piece(icoG(1, 1), { t: [-0.2, 1.72, 0.1], s: [0.14, 0.05, 0.12], jit: 0.14, jseed: vs + 5 });
          ramp(moss2, 0x466e38, 0x78a856, 1.68, 1.78, { seed: vs + 5 });
          pieces.push(moss2);
          pieces.push(...tuftPieces(r2, { n: 4, R: 0.62, seed: vs + 6 }));
          return pieces;
        });
        return [
          V(g, SOLID_V, [0.06, 0.03]), shadowP(0.85),
          P(boxG(0.3, 1.0, 0.02), GLOW_RUNE, 0xffe9b0, [0, 1.07, 0.19], 1, [0, 0, 0], 0, false),
        ];
      },
    },
    well: {
      variants: 1, collider: 0.85,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`wellM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const n = 9;
          for (let i = 0; i < n; i++) { // individual rim stones
            const a = (i / n) * TAU;
            const st = piece(boxG(0.52, 0.5 + r2() * 0.14, 0.34), {
              t: [Math.cos(a) * 0.72, 0.26, Math.sin(a) * 0.72],
              r: [0, -a + Math.PI / 2, (r2() - 0.5) * 0.06], jit: 0.03, jseed: vs + i,
            });
            ramp(st, i % 2 ? 0x8a877c : 0x96938a, i % 2 ? 0xb4b1a4 : 0xc0bdb2, 0, 0.6, { noise: 0.05, seed: vs + i });
            pieces.push(st);
          }
          const water = piece(cylG(0.6, 0.6, 0.04, 9), { t: [0, 0.34, 0] });
          tintG(water, 0x1c2a38, 0.02, vs);
          pieces.push(water);
          for (const px of [-0.72, 0.72]) { // posts
            const post = piece(boxG(0.11, 1.5, 0.11), { t: [px, 0.95, 0], jit: 0.012, jseed: vs + px });
            ramp(post, 0x6a5236, 0x8f6f4e, 0.4, 1.7, { noise: 0.05, seed: vs + px * 5 });
            pieces.push(post);
          }
          pieces.push(gableG({ L: 2.0, halfW: 1.08, roofH: 0.62, y: 1.68, dark: 0x7e3a30, light: 0xb0564a, wall: 0x6b4f36, seed: vs }));
          const ridge = piece(boxG(2.06, 0.07, 0.09), { t: [0, 2.32, 0] });
          tintG(ridge, 0x5c3a2c, 0.04, vs);
          pieces.push(ridge);
          const axle = piece(cylG(0.045, 0.045, 1.4, 5), { t: [0, 1.42, 0], r: [0, 0, Math.PI / 2] });
          tintG(axle, 0x4a3a2a, 0.04, vs);
          pieces.push(axle);
          const crank = piece(boxG(0.05, 0.26, 0.05), { t: [0.78, 1.32, 0], r: [0, 0, 0.3] });
          tintG(crank, 0x3f332a, 0.03, vs);
          pieces.push(crank);
          const rope = piece(cylG(0.018, 0.018, 0.55, 4), { t: [0, 1.15, 0] });
          tintG(rope, 0xb0946a, 0.05, vs);
          pieces.push(rope);
          const bucket = piece(cylG(0.16, 0.13, 0.2, 6), { t: [0, 0.98, 0], jit: 0.01, jseed: vs + 8 });
          ramp(bucket, 0x6f5138, 0x9a7a55, 0.88, 1.08, { seed: vs + 8 });
          pieces.push(bucket);
          pieces.push(...tuftPieces(r2, { n: 4, R: 1.0, seed: vs + 9 }));
          return pieces;
        });
        return [V(g, SOLID_V, [0.05, 0.03]), shadowP(1.25)];
      },
    },
    house_small: {
      variants: 2, collider: 2.5, faceCenter: true, sinkY: 0.25,
      surface: 'wood', surfaceRect: [1.8, 1.55], // plank floor: footprint + doorstep


      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const warm = rng() > 0.5;
        const g = merged(`hsM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const wallLo = warm ? 0xcbbb9a : 0xbdb4a2, wallHi = warm ? 0xf4ead4 : 0xece6d8;
          const roofD = warm ? 0x793830 : 0x5f463c, roofL = warm ? 0xba5c4a : 0x9a7458;
          const wood = 0x6f5138, woodL = 0x8a6a48;
          const pieces = [];
          // stone footing skirt
          const fo = piece(boxG(3.56, 0.44, 3.06), { t: [0, 0.21, 0], jit: 0.025, jseed: vs });
          ramp(fo, 0x7a776e, 0xa19e93, 0, 0.46, { noise: 0.05, seed: vs });
          pieces.push(fo);
          // plaster walls (footing -> pale top)
          const w = piece(boxG(3.4, 1.92, 2.9), { t: [0, 1.36, 0] });
          ramp(w, wallLo, wallHi, 0.38, 2.35, { noise: 0.03, seed: vs + 1 });
          pieces.push(w);
          // eave shadow band under the roof line
          const eave = piece(boxG(3.44, 0.15, 2.94), { t: [0, 2.26, 0] });
          tintG(eave, lerpColorHex(wallLo, 0x241a12, 0.3), 0.02, vs);
          pieces.push(eave);
          // gable roof, ridge along x, with beam + overhang
          pieces.push(gableG({ L: 3.95, halfW: 1.9, roofH: 1.5, y: 2.3, dark: roofD, light: roofL, wall: lerpColorHex(wallHi, wallLo, 0.35), seed: vs }));
          const ridge = piece(boxG(4.02, 0.1, 0.13), { t: [0, 3.82, 0] });
          tintG(ridge, lerpColorHex(roofD, 0x201410, 0.35), 0.03, vs);
          pieces.push(ridge);
          for (const s of [-1, 1]) { // fascia boards under both eaves
            const fa = piece(boxG(3.98, 0.1, 0.09), { t: [0, 2.3, s * 1.86] });
            tintG(fa, wood, 0.04, vs + s);
            pieces.push(fa);
          }
          // timber frame (corners + front cross-brace + mid rail)
          for (const px of [-1.68, 1.68]) {
            const post = piece(boxG(0.13, 1.98, 0.13), { t: [px, 1.34, 1.42] });
            ramp(post, wood, woodL, 0.4, 2.3, { noise: 0.04, seed: vs + px });
            pieces.push(post);
          }
          const lintel = piece(boxG(3.42, 0.12, 0.12), { t: [0, 2.16, 1.43] });
          tintG(lintel, wood, 0.04, vs + 3);
          pieces.push(lintel);
          const brace = piece(boxG(0.11, 1.15, 0.1), { t: [-1.62, 1.33, 1.44], r: [0, 0, 0.62] });
          tintG(brace, wood, 0.04, vs + 4);
          pieces.push(brace);
          // door: recess, plank leaf, frame, lintel, step
          const rec = piece(boxG(0.86, 1.46, 0.06), { t: [0.6, 1.08, 1.44] });
          tintG(rec, 0x3a2c1e, 0.02, vs);
          pieces.push(rec);
          const door = piece(boxG(0.74, 1.36, 0.07), { t: [0.6, 1.06, 1.46] });
          ramp(door, 0x66492f, 0x8f6f4e, 0.4, 1.8, { noise: 0.06, seed: vs + 5 });
          pieces.push(door);
          for (const px of [0.19, 1.01]) {
            const jamb = piece(boxG(0.09, 1.5, 0.1), { t: [px, 1.1, 1.45] });
            tintG(jamb, wood, 0.04, vs + px);
            pieces.push(jamb);
          }
          const dlin = piece(boxG(0.95, 0.1, 0.11), { t: [0.6, 1.88, 1.45] });
          tintG(dlin, wood, 0.04, vs + 6);
          pieces.push(dlin);
          const step = piece(boxG(1.0, 0.15, 0.5), { t: [0.6, 0.08, 1.68], jit: 0.02, jseed: vs + 7 });
          ramp(step, 0x84817a, 0xa5a29a, 0, 0.17, { seed: vs + 7 });
          pieces.push(step);
          // window frames + sills (glow panes are separate parts)
          for (const [wx, wy, wz, ry] of [[-0.85, 1.4, 1.45, 0], [1.71, 1.4, -0.5, Math.PI / 2]]) {
            const fr = piece(boxG(0.68, 0.68, 0.07), { t: [wx, wy, wz], r: [0, ry, 0] });
            tintG(fr, wood, 0.04, vs + wx);
            pieces.push(fr);
            const sill = piece(boxG(0.76, 0.08, 0.13), { t: [wx + Math.sin(ry) * 0.04, wy - 0.38, wz + Math.cos(ry) * 0.04], r: [0, ry, 0] });
            tintG(sill, woodL, 0.04, vs + wx * 3);
            pieces.push(sill);
          }
          // chimney with cap lip
          const ch = piece(boxG(0.44, 1.6, 0.44), { t: [-1.0, 3.3, -0.5], jit: 0.015, jseed: vs + 8 });
          ramp(ch, 0x84766c, 0xa89a8e, 2.4, 4.1, { noise: 0.05, seed: vs + 8 });
          pieces.push(ch);
          const chCap = piece(boxG(0.54, 0.12, 0.54), { t: [-1.0, 4.12, -0.5] });
          tintG(chCap, 0x5c534c, 0.04, vs + 9);
          pieces.push(chCap);
          pieces.push(...tuftPieces(r2, { n: 5, R: 1.95, seed: vs + 10 }));
          return pieces;
        });
        return [
          V(g, SOLID_V, [0.045, 0.03]), shadowP(2.6),
          P(boxG(0.55, 0.55, 0.06), WINDOW, 0xffc97a, [-0.85, 1.4, 1.46], 1, [0, 0, 0], 0, false),
          P(boxG(0.55, 0.55, 0.06), WINDOW, 0xffc97a, [1.73, 1.4, -0.5], 1, [0, Math.PI / 2, 0], 0, false),
          P(sphereG(0.05, 5, 4), SOLID_S, 0xc9b878, [0.85, 1.06, 1.52], 1, [0, 0, 0], 0, false),
        ];
      },
    },
    house_large: {
      variants: 1, collider: 3.6, faceCenter: true, sinkY: 0.3,
      surface: 'wood', surfaceRect: [2.7, 2.0],

      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`hlM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const wallLo = 0xcbbb9a, wallHi = 0xf4ead4;
          const roofD = 0x74352c, roofL = 0xb2564a;
          const wood = 0x6f5138, woodL = 0x8a6a48;
          const pieces = [];
          const fo = piece(boxG(5.36, 0.5, 3.96), { t: [0, 0.24, 0], jit: 0.03, jseed: vs });
          ramp(fo, 0x7a776e, 0xa19e93, 0, 0.52, { noise: 0.05, seed: vs });
          pieces.push(fo);
          const w = piece(boxG(5.2, 2.2, 3.8), { t: [0, 1.5, 0] });
          ramp(w, wallLo, wallHi, 0.45, 2.65, { noise: 0.03, seed: vs + 1 });
          pieces.push(w);
          const eave = piece(boxG(5.24, 0.16, 3.84), { t: [0, 2.54, 0] });
          tintG(eave, lerpColorHex(wallLo, 0x241a12, 0.3), 0.02, vs);
          pieces.push(eave);
          // main gable roof, ridge along x
          pieces.push(gableG({ L: 5.8, halfW: 2.42, roofH: 1.75, y: 2.6, dark: roofD, light: roofL, wall: lerpColorHex(wallHi, wallLo, 0.35), seed: vs }));
          const ridge = piece(boxG(5.88, 0.11, 0.14), { t: [0, 4.37, 0] });
          tintG(ridge, lerpColorHex(roofD, 0x201410, 0.35), 0.03, vs);
          pieces.push(ridge);
          // dormer gable over the entrance
          const dw = piece(boxG(1.5, 1.15, 1.15), { t: [0, 3.1, 1.35] });
          ramp(dw, wallLo, wallHi, 2.6, 3.7, { noise: 0.03, seed: vs + 2 });
          pieces.push(dw);
          const dr = gableG({ L: 1.66, halfW: 0.72, roofH: 0.62, y: 3.66, dark: roofD, light: roofL, wall: lerpColorHex(wallHi, wallLo, 0.35), seed: vs + 2 });
          dr.rotateY(Math.PI / 2);
          dr.translate(0, 0, 1.35);
          pieces.push(dr);
          // timber frame across the front
          for (const px of [-2.56, 2.56]) {
            const post = piece(boxG(0.14, 2.3, 0.14), { t: [px, 1.5, 1.86] });
            ramp(post, wood, woodL, 0.4, 2.6, { noise: 0.04, seed: vs + px });
            pieces.push(post);
          }
          const rail = piece(boxG(5.2, 0.13, 0.13), { t: [0, 2.44, 1.87] });
          tintG(rail, wood, 0.04, vs + 3);
          pieces.push(rail);
          for (const px of [-1.9, 1.9]) {
            const brace = piece(boxG(0.11, 1.2, 0.1), { t: [px, 1.5, 1.88], r: [0, 0, px > 0 ? -0.55 : 0.55] });
            tintG(brace, wood, 0.04, vs + px * 7);
            pieces.push(brace);
          }
          // door + frame + step
          const rec = piece(boxG(1.0, 1.66, 0.06), { t: [0, 1.18, 1.9] });
          tintG(rec, 0x3a2c1e, 0.02, vs);
          pieces.push(rec);
          const door = piece(boxG(0.88, 1.56, 0.07), { t: [0, 1.16, 1.92] });
          ramp(door, 0x66492f, 0x8f6f4e, 0.4, 2.0, { noise: 0.06, seed: vs + 5 });
          pieces.push(door);
          for (const px of [-0.5, 0.5]) {
            const jamb = piece(boxG(0.1, 1.7, 0.1), { t: [px, 1.2, 1.91] });
            tintG(jamb, wood, 0.04, vs + px);
            pieces.push(jamb);
          }
          const dlin = piece(boxG(1.14, 0.11, 0.12), { t: [0, 2.1, 1.91] });
          tintG(dlin, wood, 0.04, vs + 6);
          pieces.push(dlin);
          const step = piece(boxG(1.3, 0.17, 0.6), { t: [0, 0.09, 2.2], jit: 0.02, jseed: vs + 7 });
          ramp(step, 0x84817a, 0xa5a29a, 0, 0.19, { seed: vs + 7 });
          pieces.push(step);
          // window frames + sills
          for (const [wx, wy] of [[-1.5, 1.55], [1.5, 1.55]]) {
            const fr = piece(boxG(0.74, 0.74, 0.07), { t: [wx, wy, 1.9] });
            tintG(fr, wood, 0.04, vs + wx);
            pieces.push(fr);
            const sill = piece(boxG(0.82, 0.09, 0.14), { t: [wx, wy - 0.42, 1.94] });
            tintG(sill, woodL, 0.04, vs + wx * 3);
            pieces.push(sill);
          }
          const dfr = piece(boxG(0.66, 0.66, 0.07), { t: [0, 3.2, 1.93] });
          tintG(dfr, wood, 0.04, vs + 11);
          pieces.push(dfr);
          // chimney
          const ch = piece(boxG(0.52, 2.4, 0.52), { t: [-1.9, 3.4, -1.0], jit: 0.02, jseed: vs + 8 });
          ramp(ch, 0x84766c, 0xa89a8e, 2.2, 4.6, { noise: 0.05, seed: vs + 8 });
          pieces.push(ch);
          const chCap = piece(boxG(0.64, 0.13, 0.64), { t: [-1.9, 4.62, -1.0] });
          tintG(chCap, 0x5c534c, 0.04, vs + 9);
          pieces.push(chCap);
          pieces.push(...tuftPieces(r2, { n: 6, R: 2.7, seed: vs + 10 }));
          return pieces;
        });
        return [
          V(g, SOLID_V, [0.04, 0.025]), shadowP(3.4),
          P(boxG(0.6, 0.6, 0.06), WINDOW, 0xffc97a, [-1.5, 1.55, 1.91], 1, [0, 0, 0], 0, false),
          P(boxG(0.6, 0.6, 0.06), WINDOW, 0xffc97a, [1.5, 1.55, 1.91], 1, [0, 0, 0], 0, false),
          P(boxG(0.52, 0.52, 0.06), WINDOW, 0xffc97a, [0, 3.2, 1.94], 1, [0, 0, 0], 0, false),
          P(sphereG(0.055, 5, 4), SOLID_S, 0xc9b878, [0.32, 1.16, 1.98], 1, [0, 0, 0], 0, false),
        ];
      },
    },
    shop_stall: {
      variants: 2, collider: 1.4, faceCenter: true,
      make: (rng) => {
        const stripe = rng() > 0.5 ? 0xc25a4a : 0x4a7ac2;
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`stallM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const base = piece(boxG(2.4, 0.9, 1.1), { t: [0, 0.45, 0], jit: 0.015, jseed: vs });
          ramp(base, 0x92714c, 0xbc9a6c, 0, 0.95, { noise: 0.05, seed: vs });
          pieces.push(base);
          for (let i = 0; i < 5; i++) { // front plank lines
            const pl = piece(boxG(0.44, 0.86, 0.03), { t: [-0.96 + i * 0.48, 0.45, 0.55] });
            ramp(pl, lerpColorHex(0x7d5f3f, 0x5c4630, r2() * 0.6), 0x9e7e56, 0, 0.9, { noise: 0.07, seed: vs + i });
            pieces.push(pl);
          }
          const top = piece(boxG(2.52, 0.09, 1.22), { t: [0, 0.95, 0] });
          ramp(top, 0xa8885c, 0xc9a878, 0.9, 1.0, { noise: 0.05, seed: vs + 6 });
          pieces.push(top);
          for (const [px, pz, h] of [[-1.2, -0.5, 2.1], [1.2, -0.5, 2.1], [-1.2, 0.62, 2.4], [1.2, 0.62, 2.4]]) {
            const post = piece(boxG(0.09, h, 0.09), { t: [px, h / 2, pz], jit: 0.01, jseed: vs + px + pz });
            ramp(post, 0x7d5c3d, 0x9e7e56, 0, h, { noise: 0.04, seed: vs + px * 3 + pz });
            pieces.push(post);
          }
          pieces.push(...tuftPieces(r2, { n: 3, R: 1.35, seed: vs + 7 }));
          return pieces;
        });
        const parts = [V(g, SOLID_V, [0.05, 0.03]), shadowP(1.7)];
        for (let i = 0; i < 5; i++) {
          const c = i % 2 ? 0xf0e8d8 : stripe;
          // lit top face…
          parts.push(P(planeG(0.52, 1.5), CLOTH, c,
            [-1.04 + i * 0.52, 2.25, 0.15], 1, [-0.42, 0, 0], 0.03, false));
          // …with a shaded underside (offset down the awning normal) so the
          // canopy is never a single unshaded quad when seen from below.
          parts.push(P(planeG(0.52, 1.5), CLOTH, lerpColorHex(c, 0x2a2018, 0.5),
            [-1.04 + i * 0.52, 2.235, 0.117], 1, [-0.42, 0, 0], 0.02, false));
          // hanging valance skirt along the awning's front edge
          parts.push(P(planeG(0.52, 0.24), CLOTH, lerpColorHex(c, 0x2a2018, 0.2),
            [-1.04 + i * 0.52, 1.46, 0.46], 1, [0, 0, 0], 0.02, false));
        }
        // front rail + diagonal struts carrying the awning
        parts.push(P(boxG(2.62, 0.07, 0.07), SOLID, 0x6b4a33, [0, 1.58, 0.47], 1, [0, 0, 0], 0.02, false));
        parts.push(P(boxG(0.06, 0.06, 0.85), SOLID, 0x6b4a33, [-1.18, 1.95, 0.12], 1, [-0.55, 0, 0], 0.02, false));
        parts.push(P(boxG(0.06, 0.06, 0.85), SOLID, 0x6b4a33, [1.18, 1.95, 0.12], 1, [-0.55, 0, 0], 0.02, false));
        // wares
        parts.push(P(sphereG(0.14, 6, 5), SOLID_S, 0xd8a05a, [-0.6, 1.06, 0.2], 1, [0, 0, 0], 0.15, false));
        parts.push(P(sphereG(0.12, 6, 5), SOLID_S, 0xc25a6e, [-0.28, 1.05, 0.05], 1, [0, 0, 0], 0.15, false));
        parts.push(P(boxG(0.4, 0.24, 0.3), SOLID, 0x9a7a55, [0.55, 1.06, 0.1], 1, [0, 0.4, 0], 0.1, false));
        return parts;
      },
    },
    bridge: {
      variants: 1, collider: 0,
      surface: 'wood', surfaceRect: [2.5, 1.1], // plank span (local x) × width (local z)

      make: (rng) => {
        const parts = [];
        const n = 9;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1) - 0.5;
          const y = 0.25 + Math.cos(t * Math.PI) * 0.35;
          parts.push(P(boxG(0.55, 0.09, 1.9), SOLID, i % 2 ? 0x8a6a48 : 0x94765a, [t * 4.4, y, 0], 1, [0, 0, -t * 0.5]));
        }
        for (const s of [-1, 1]) {
          parts.push(P(boxG(4.6, 0.07, 0.07), SOLID, 0x6b4a33, [0, 1.05, s * 0.9]));
          for (let i = 0; i < 4; i++) {
            const t = i / 3 - 0.5;
            parts.push(P(boxG(0.08, 0.7, 0.08), SOLID, 0x6b4a33, [t * 4.2, 0.7 + Math.cos(t * Math.PI) * 0.32, s * 0.9]));
          }
        }
        return parts;
      },
    },
    cart: {
      variants: 2, collider: 1.0,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`cartM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const bed = piece(boxG(1.7, 0.48, 1.0), { t: [0, 0.64, 0], jit: 0.015, jseed: vs });
          ramp(bed, 0x77573c, 0xa08054, 0.4, 0.9, { noise: 0.06, seed: vs });
          pieces.push(bed);
          for (const s of [-1, 1]) { // top rails
            const rail = piece(boxG(1.76, 0.08, 0.09), { t: [0, 0.92, s * 0.5] });
            tintG(rail, 0x6a4c33, 0.06, vs + s);
            pieces.push(rail);
          }
          for (const s of [-1, 1]) { // wheels: rim + pale hub
            const wheel = piece(cylG(0.42, 0.42, 0.1, 9), { t: [0.55, 0.42, s * 0.56], r: [Math.PI / 2, 0, 0], jit: 0.012, jseed: vs + s * 3 });
            ramp(wheel, 0x5c452c, 0x7d5c3d, 0.02, 0.85, { noise: 0.05, seed: vs + s });
            pieces.push(wheel);
            const hub = piece(cylG(0.13, 0.13, 0.13, 7), { t: [0.55, 0.42, s * 0.58], r: [Math.PI / 2, 0, 0] });
            tintG(hub, 0x8f6f4c, 0.04, vs + s * 5);
            pieces.push(hub);
          }
          const axle = piece(cylG(0.05, 0.05, 1.24, 5), { t: [0.55, 0.42, 0], r: [Math.PI / 2, 0, 0] });
          tintG(axle, 0x3f2f20, 0.03, vs);
          pieces.push(axle);
          for (const s of [-1, 1]) { // handles
            const h = piece(cylG(0.04, 0.05, 1.3, 5), { t: [-1.2, 0.5, s * 0.3], r: [0, 0, 1.1] });
            ramp(h, 0x6a4c33, 0x8a6a48, 0.1, 0.95, { seed: vs + s * 7 });
            pieces.push(h);
          }
          const hay = piece(icoG(1, 1), { t: [0.15, 1.0, 0], s: [0.72, 0.34, 0.46], jit: 0.16, jseed: vs + 9 });
          ramp(hay, 0xb08d4c, 0xe0c078, 0.75, 1.35, { noise: 0.08, seed: vs + 9 });
          pieces.push(hay);
          return pieces;
        });
        return [V(g, SOLID_V, [0.06, 0.04]), shadowP(1.25)];
      },
    },
    crate: {
      variants: 2, collider: 0.5, cluster: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const yaw = rng() * 0.5;
        const g = merged(`crateM${vs}`, () => {
          const pieces = [];
          const body = piece(boxG(0.75, 0.75, 0.75), { t: [0, 0.37, 0], r: [0, yaw, 0], jit: 0.012, jseed: vs });
          ramp(body, 0x92714c, 0xbc9a6c, 0, 0.78, { noise: 0.06, seed: vs });
          pieces.push(body);
          for (const ey of [0.08, 0.7]) { // edge battens
            const b1 = piece(boxG(0.8, 0.1, 0.1), { t: [0, ey, 0], r: [0, yaw, 0] });
            tintG(b1, 0x6f5138, 0.05, vs + ey * 9);
            pieces.push(b1);
            const b2 = piece(boxG(0.1, 0.1, 0.8), { t: [0, ey, 0], r: [0, yaw, 0] });
            tintG(b2, 0x6f5138, 0.05, vs + ey * 11);
            pieces.push(b2);
          }
          const diag = piece(boxG(0.9, 0.09, 0.04), { t: [0, 0.39, Math.cos(yaw) * 0.385], r: [0, yaw, 0.75] });
          tintG(diag, 0x6b4f36, 0.05, vs + 3);
          pieces.push(diag);
          return pieces;
        });
        return [V(g, SOLID_V, [0.07, 0.04]), shadowP(0.62)];
      },
    },
    barrel: {
      variants: 2, collider: 0.42, cluster: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`barrelM${vs}`, () => {
          const pieces = [];
          const body = piece(cylG(0.3, 0.26, 0.82, 10), { t: [0, 0.41, 0] });
          // belly bulge
          const bp = body.attributes.position;
          for (let i = 0; i < bp.count; i++) {
            const y = bp.getY(i);
            const f = 1 + 0.18 * Math.sin(clamp(y / 0.82, 0, 1) * Math.PI);
            bp.setXYZ(i, bp.getX(i) * f, y, bp.getZ(i) * f);
          }
          paintFaces(body, (cx, cy, cz) => { // stave tones around the hoop
            const sector = Math.floor(((Math.atan2(cz, cx) + Math.PI) / TAU) * 10);
            const base = sector % 2 ? 0x9a7a55 : 0x8a6a48;
            return lerpColorHex(base, 0xbc9a6c, clamp(cy / 0.85, 0, 1) * 0.55);
          });
          pieces.push(body);
          for (const hy of [0.2, 0.62]) {
            const f = 1 + 0.18 * Math.sin((hy / 0.82) * Math.PI);
            const hoop = piece(cylG(0.315 * f, 0.315 * f, 0.07, 10), { t: [0, hy, 0] });
            tintG(hoop, 0x554e46, 0.03, vs + hy * 7);
            pieces.push(hoop);
          }
          const lid = piece(cylG(0.27, 0.27, 0.03, 10), { t: [0, 0.83, 0] });
          tintG(lid, 0x997550, 0.05, vs + 5);
          pieces.push(lid);
          return pieces;
        });
        return [V(g, SOLID_V, [0.07, 0.04]), shadowP(0.55)];
      },
    },
    campfire: {
      variants: 1, collider: 0.6,
      make: (rng) => {
        const parts = [];
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          parts.push(P(icoG(0.14, 0), SOLID, 0x7d7a74, [Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.6], [1, 0.75, 1], [0, rng() * TAU, 0], 0.05, false));
        }
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + 0.4;
          parts.push(P(cylG(0.06, 0.08, 0.85, 5), SOLID, 0x4a382a, [Math.cos(a) * 0.14, 0.28, Math.sin(a) * 0.14], 1, [Math.PI / 3.2, a, 0], 0.05, false));
        }
        return parts;
      },
      effect: (x, y, z, s) => makeCampfireFX(x, y, z, s),
    },
    tent: {
      variants: 2, collider: 1.2, faceCenter: true,
      make: (rng) => {
        const c = rng() > 0.5 ? 0xc2a878 : 0x8a9ab0;
        return [
          P(planeG(2.4, 2.0), CLOTH, c, [-0.75, 0.75, 0], 1, [0, 0, 0.86], 0.04),
          P(planeG(2.4, 2.0), CLOTH, c, [0.75, 0.75, 0], 1, [0, 0, -0.86], 0.04),
          P(planeG(1.6, 1.5), CLOTH, lerpColorHex(c, 0x000000, 0.25), [0, 0.72, -1.0], 1, [0, 0, 0], 0.04),
          P(cylG(0.035, 0.045, 1.6, 5), SOLID, 0x6b4a33, [0, 0.8, 1.0], 1, [0.12, 0, 0]),
          P(cylG(0.035, 0.045, 1.6, 5), SOLID, 0x6b4a33, [0, 0.8, -1.0], 1, [-0.12, 0, 0]),
        ];
      },
    },
    // ------------------------------------------------------------- ruins
    ruin_pillar: {
      variants: 3, collider: 0.55,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`rpilM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const h = 1.5 + r2() * 1.7;
          const tiltZ = (r2() - 0.5) * 0.12;
          const pieces = [];
          const plinth = piece(boxG(0.98, 0.34, 0.98), { t: [0, 0.16, 0], r: [0, r2() * 0.4, 0], jit: 0.03, jseed: vs });
          ramp(plinth, 0x767268, 0x94918a, 0, 0.36, { noise: 0.05, seed: vs });
          pieces.push(plinth);
          const col = piece(cylG(0.32, 0.4, h, 8, 3), {
            t: [tiltZ * h * 0.5, 0.3 + h / 2, 0], r: [(r2() - 0.5) * 0.06, 0, tiltZ], jit: 0.05, jseed: vs + 1,
          });
          ramp(col, 0x878378, 0xbab6aa, 0.3, 0.3 + h, { noise: 0.06, seed: vs + 1 });
          pieces.push(col);
          // broken crown — jagged chunk instead of a clean cap
          const crown = piece(icoG(1, 0), {
            t: [tiltZ * h, 0.3 + h + 0.08, 0], s: [0.4, 0.24, 0.4], r: [0.2, r2() * TAU, tiltZ], jit: 0.1, jseed: vs + 2,
          });
          ramp(crown, 0x8d8a80, 0xb4b0a4, 0.2 + h, 0.6 + h, { seed: vs + 2 });
          pieces.push(crown);
          if (r2() > 0.4) { // fallen drum
            const drum = piece(cylG(0.3, 0.3, 0.5, 8), {
              t: [0.85, 0.28, 0.45], r: [Math.PI / 2 - 0.15, 0, r2()], jit: 0.04, jseed: vs + 3,
            });
            ramp(drum, 0x7d7a70, 0xa19e93, 0, 0.55, { seed: vs + 3 });
            pieces.push(drum);
          }
          const moss = piece(icoG(1, 1), { t: [0.2, 0.36, 0.28], s: [0.24, 0.09, 0.2], jit: 0.14, jseed: vs + 4 });
          ramp(moss, 0x3f6b34, 0x74a854, 0.28, 0.46, { seed: vs + 4 });
          pieces.push(moss);
          pieces.push(...tuftPieces(r2, { n: 4, R: 0.7, seed: vs + 5 }));
          return pieces;
        });
        return [V(g, SOLID_V, [0.06, 0.03]), shadowP(0.95)];
      },
    },
    ruin_arch: {
      variants: 2, collider: 0, sinkY: 0.15,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`rarchM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          for (const s of [-1, 1]) { // stacked-block legs
            let y = 0;
            const blocks = 3 + Math.floor(r2() * 2);
            for (let i = 0; i < blocks; i++) {
              const bh = 0.7 + r2() * 0.4;
              const b = piece(boxG(0.72 - i * 0.03, bh, 0.72 - i * 0.03), {
                t: [s * 1.5 + (r2() - 0.5) * 0.08, y + bh / 2, (r2() - 0.5) * 0.08],
                r: [0, (r2() - 0.5) * 0.14, (r2() - 0.5) * 0.04], jit: 0.03, jseed: vs + s * 3 + i,
              });
              ramp(b, 0x827e74, 0xb4b0a4, y - 0.1, y + bh + 0.4, { noise: 0.06, seed: vs + s + i });
              pieces.push(b);
              y += bh;
            }
          }
          const lintel = piece(boxG(2.3, 0.62, 0.78), { t: [-0.5, 3.28, 0], r: [0, 0, 0.04], jit: 0.035, jseed: vs + 8 });
          ramp(lintel, 0x8d8a80, 0xb8b4a8, 2.9, 3.6, { noise: 0.05, seed: vs + 8 });
          pieces.push(lintel);
          const lintel2 = piece(boxG(1.15, 0.56, 0.74), { t: [1.22, 3.22, 0], r: [0, 0, -0.09], jit: 0.035, jseed: vs + 9 });
          ramp(lintel2, 0x8d8a80, 0xb0aca0, 2.9, 3.5, { noise: 0.05, seed: vs + 9 });
          pieces.push(lintel2);
          const moss = piece(icoG(1, 1), { t: [-1.5, 3.58, 0.15], s: [0.38, 0.13, 0.28], jit: 0.14, jseed: vs + 5 });
          ramp(moss, 0x3f6b34, 0x74a854, 3.45, 3.75, { seed: vs + 5 });
          pieces.push(moss);
          for (const s of [-1, 1]) { // rubble at the feet
            const rub = piece(icoG(1, 1), {
              t: [s * 1.85, 0.14, 0.35 * s], s: [0.26, 0.16, 0.22], r: [0, r2() * TAU, 0], jit: 0.16, jseed: vs + s + 20,
            });
            ramp(rub, 0x7d7a70, 0xa19e93, 0, 0.32, { seed: vs + s });
            pieces.push(rub);
          }
          pieces.push(...tuftPieces(r2, { n: 5, R: 1.7, seed: vs + 6 }));
          return pieces;
        });
        return [V(g, SOLID_V, [0.06, 0.03]), shadowP(2.3)];
      },
    },
    ruin_wall: {
      variants: 3, collider: 1.6,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`rwallM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const base = piece(boxG(3.25, 1.2, 0.58), { t: [0, 0.6, 0], r: [0, 0, (r2() - 0.5) * 0.04], jit: 0.04, jseed: vs });
          ramp(base, 0x7d7a70, 0xaaa79b, 0, 1.7, { noise: 0.06, seed: vs });
          pieces.push(base);
          let x = -1.4;
          let i = 0;
          while (x < 1.4) {
            const w = 0.4 + r2() * 0.5, h = 0.3 + r2() * 1.1;
            const b = piece(boxG(w, h, 0.56), {
              t: [x, 1.2 + h / 2, (r2() - 0.5) * 0.05], r: [0, 0, (r2() - 0.5) * 0.1], jit: 0.035, jseed: vs + i,
            });
            ramp(b, 0x8a877c, 0xb8b4a8, 1.1, 1.3 + h, { noise: 0.06, seed: vs + i });
            pieces.push(b);
            x += w + 0.15 + r2() * 0.35;
            i++;
          }
          const moss = piece(icoG(1, 1), { t: [0.6, 1.3, 0.2], s: [0.42, 0.15, 0.28], jit: 0.14, jseed: vs + 9 });
          ramp(moss, 0x3f6b34, 0x74a854, 1.18, 1.48, { seed: vs + 9 });
          pieces.push(moss);
          for (const s of [-1, 1]) { // tumbled blocks at the wall feet
            const rub = piece(icoG(1, 0), {
              t: [s * (1.5 + r2() * 0.5), 0.13, 0.5 + r2() * 0.3], s: [0.24, 0.15, 0.2], r: [0, r2() * TAU, 0], jit: 0.1, jseed: vs + s + 30,
            });
            ramp(rub, 0x7d7a70, 0x9e9a8e, 0, 0.3, { seed: vs + s + 3 });
            pieces.push(rub);
          }
          pieces.push(...tuftPieces(r2, { n: 5, R: 1.5, seed: vs + 11 }));
          return pieces;
        });
        const p = shadowP(1.4);
        p.scl = [2.0, 1.4, 1.4];
        return [V(g, SOLID_V, [0.06, 0.03]), p];
      },
    },
    statue_warden: {
      variants: 1, collider: 0.8,
      // Carved-stone warden: weathered (jittered) robes with a dark hem ->
      // pale shoulder gradient, stepped plinth, moss, and the held shard glow.
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`stwM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const steps = [
            [1.56, 0.34, 0xb4b0a6, 0xcac6bb, 0],
            [1.24, 0.32, 0xbebab0, 0xd6d3c9, 0.32],
            [0.96, 0.28, 0xc6c2b8, 0xe0ddd3, 0.6],
          ];
          for (const [sw, sh, cLo, cHi, sy] of steps) {
            const st = piece(boxG(sw, sh, sw), { t: [0, sy + sh / 2, 0], r: [0, (r2() - 0.5) * 0.06, 0], jit: 0.02, jseed: vs + sy * 9 });
            ramp(st, cLo, cHi, sy, sy + sh, { noise: 0.05, seed: vs + sy * 7 });
            pieces.push(st);
          }
          const hem = piece(coneG(0.62, 0.8, 7), { t: [0, 1.2, 0], jit: 0.035, jseed: vs + 1 });
          const body = piece(coneG(0.54, 1.9, 7), { t: [0, 1.82, 0], jit: 0.03, jseed: vs + 2 });
          const chest = piece(coneG(0.4, 1.05, 7), { t: [0, 2.4, 0], jit: 0.025, jseed: vs + 3 });
          for (const b of [hem, body, chest]) ramp(b, 0xc4c0b4, 0xe8e5d8, 0.8, 3.0, { noise: 0.05, seed: vs + 2, exp: 1.1 });
          pieces.push(hem, body, chest);
          const sash = piece(boxG(0.12, 1.45, 0.46), { t: [0, 1.86, 0.17], r: [0.06, 0, 0] });
          ramp(sash, 0xaba89e, 0xc9c6ba, 1.1, 2.6, { seed: vs + 4 });
          pieces.push(sash);
          const head = piece(sphereG(0.3, 8, 6), { t: [0, 2.97, 0], jit: 0.02, jseed: vs + 5 });
          ramp(head, 0xd0cdc0, 0xeae7da, 2.7, 3.25, { seed: vs + 5 });
          pieces.push(head);
          const hood = piece(coneG(0.35, 0.55, 6), { t: [0, 3.17, -0.08], r: [0.4, 0, 0], jit: 0.025, jseed: vs + 6 });
          ramp(hood, 0xb6b3aa, 0xd2cfc4, 2.95, 3.45, { seed: vs + 6 });
          pieces.push(hood);
          const arm = piece(cylG(0.1, 0.13, 1.0, 6), { t: [0.55, 2.22, 0.25], r: [0.5, 0, -0.5], jit: 0.02, jseed: vs + 7 });
          ramp(arm, 0xc0bdb2, 0xdedbce, 1.8, 2.7, { seed: vs + 7 });
          pieces.push(arm);
          const cuff = piece(cylG(0.145, 0.13, 0.2, 6), { t: [0.72, 2.52, 0.44], r: [0.5, 0, -0.5] });
          tintG(cuff, 0xc2bfb4, 0.04, vs + 8);
          pieces.push(cuff);
          const moss = piece(icoG(1, 1), { t: [-0.55, 0.36, 0.5], s: [0.3, 0.11, 0.24], jit: 0.14, jseed: vs + 9 });
          ramp(moss, 0x3f6b34, 0x74a854, 0.28, 0.48, { seed: vs + 9 });
          pieces.push(moss);
          const moss2 = piece(icoG(1, 1), { t: [0.5, 0.68, -0.4], s: [0.2, 0.08, 0.18], jit: 0.14, jseed: vs + 10 });
          ramp(moss2, 0x466e38, 0x78a856, 0.62, 0.78, { seed: vs + 10 });
          pieces.push(moss2);
          pieces.push(...tuftPieces(r2, { n: 5, R: 1.05, seed: vs + 11 }));
          return pieces;
        });
        return [
          V(g, SOLID_V, [0.04, 0.02]), shadowP(1.35),
          P(sphereG(0.2, 7, 6), GLOW_RUNE, 0xffe9b0, [0.8, 2.72, 0.55], 1, [0, 0, 0], 0, false),
        ];
      },
    },
    // ------------------------------------------------------------- mountain / cold / fire
    ice_spike: {
      variants: 3, collider: 0.45, cluster: true,
      make: (rng) => [
        P(octaG(0.4), ICE, 0xcfe8ff, [0, 0.75, 0], [0.8, 2.6 + rng() * 1.6, 0.8], [(rng() - 0.5) * 0.2, rng() * TAU, (rng() - 0.5) * 0.2], 0.04),
        P(octaG(0.22), ICE, 0xdff2ff, [0.4, 0.35, 0.2], [0.8, 1.4, 0.8], [(rng() - 0.5) * 0.4, rng() * TAU, (rng() - 0.5) * 0.4], 0.04),
      ],
    },
    snow_pile: {
      variants: 3, collider: 0, noPathAvoid: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`snowM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          for (let i = 0; i < 3; i++) {
            const main = i === 0;
            const a = r2() * TAU;
            const s = main ? 0.9 : 0.35 + r2() * 0.3;
            const b = piece(icoG(1, 1), {
              t: [main ? 0 : Math.cos(a) * 0.7, s * 0.28, main ? 0 : Math.sin(a) * 0.7],
              s: [s, s * 0.34, s * (0.85 + r2() * 0.3)], r: [0, r2() * TAU, 0], jit: 0.1, jseed: vs + i,
            });
            ramp(b, 0xcdd8e6, 0xfafdff, 0, s * 0.55, { noise: 0.02, seed: vs + i });
            pieces.push(b);
          }
          return pieces;
        });
        return [V(g, SOLID_V, [0.03, 0.015])];
      },
    },
    lava_rock: {
      variants: 2, collider: 0.6,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`lavaM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          return stonePieces(r2, { k: 3, R: 0.6, seed: vs, dark: 0x241c20, light: 0x4c3e42 });
        });
        return [
          V(g, SOLID_V, [0.06, 0.03]), shadowP(0.95),
          P(boxG(0.7, 0.05, 0.06), GLOW_LAVA, 0xff8a3c, [0, 0.5, 0.2], 1, [0.3, rng() * TAU, 0.5], 0, false),
          P(boxG(0.5, 0.05, 0.05), GLOW_LAVA, 0xffb85c, [0.1, 0.35, -0.2], 1, [-0.4, rng() * TAU, 0.3], 0, false),
          P(boxG(0.4, 0.04, 0.05), GLOW_LAVA, 0xff6a2c, [-0.3, 0.28, 0.15], 1, [0.5, rng() * TAU, -0.3], 0, false),
        ];
      },
    },
    ember_vent: {
      variants: 2, collider: 0.55,
      make: (rng) => [
        P(cylG(0.5, 0.75, 0.55, 8), SOLID, 0x4a4046, [0, 0.27, 0], 1, [0, rng() * TAU, 0]),
        P(cylG(0.3, 0.3, 0.1, 8), GLOW_LAVA, 0xff6a2c, [0, 0.56, 0], 1, [0, 0, 0], 0, false),
        P(icoG(0.2, 0), SOLID, 0x3a3236, [0.5, 0.12, 0.3], [1, 0.7, 1], [0, rng() * TAU, 0], 0.05, false),
      ],
      effect: (x, y, z, s, rng, ctx) => makeEmberVentFX(x, y, z, s, ctx),
    },
    // ------------------------------------------------------------- spire
    spire_wall: {
      variants: 2, collider: 2.2, sinkY: 0.2,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`spwM${vs}`, () => {
          const pieces = [];
          const wall = piece(boxG(4.2, 5.5, 0.8), { t: [0, 2.75, 0], jit: 0.04, jseed: vs });
          ramp(wall, 0x20232f, 0x3d4256, 0, 5.6, { noise: 0.04, seed: vs });
          pieces.push(wall);
          for (const s of [-1, 1]) {
            const pil = piece(boxG(0.52, 6.4, 0.92), { t: [s * 2.1, 3.2, 0], jit: 0.03, jseed: vs + s });
            ramp(pil, 0x262a38, 0x454b62, 0, 6.5, { noise: 0.04, seed: vs + s });
            pieces.push(pil);
            const cap = piece(coneG(0.38, 0.95, 4), { t: [s * 2.1, 6.9, 0], jit: 0.02, jseed: vs + s * 3 });
            ramp(cap, 0x333748, 0x4e5570, 6.4, 7.4, { seed: vs + s * 3 });
            pieces.push(cap);
          }
          return pieces;
        });
        return [
          V(g, SOLID_V, [0.04, 0.02]),
          P(boxG(0.06, 4.6, 0.06), SPIRE_SEAM, 0xcfd4e8, [-1.0, 2.8, 0.42], 1, [0, 0, 0], 0, false),
          P(boxG(0.06, 3.8, 0.06), SPIRE_SEAM, 0xcfd4e8, [1.2, 2.5, 0.42], 1, [0, 0, 0.1], 0, false),
        ];
      },
    },
    banner: {
      variants: 1, collider: 0.25,
      make: () => [
        P(cylG(0.05, 0.07, 3.2, 6), SOLID, 0x3a3f4a, [0, 1.6, 0]),
        P(boxG(0.9, 0.06, 0.06), SOLID, 0x3a3f4a, [0.42, 3.1, 0]),
        P(planeG(0.8, 1.9), CLOTH, 0x3f4458, [0.45, 2.1, 0], 1, [0, 0, 0], 0.03, false),
        P(cylG(0.22, 0.22, 0.015, 12), SPIRE_SEAM, 0xcfd4e8, [0.45, 2.3, 0.02], 1, [Math.PI / 2, 0, 0], 0, false),
        P(coneG(0.06, 0.2, 4), SOLID_S, 0xb8bccf, [0, 3.35, 0]),
      ],
    },
    // ------------------------------------------------------------- cave growth
    stalagmite: {
      variants: 3, collider: 0.45, cluster: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`stalgM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const n = 3;
          for (let i = 0; i < n; i++) {
            const main = i === 0;
            const a = r2() * TAU;
            const h = main ? 1.7 + r2() * 1.4 : 0.6 + r2() * 0.7;
            const rr = main ? 0.42 : 0.2 + r2() * 0.1;
            const px = main ? 0 : Math.cos(a) * (0.4 + r2() * 0.25);
            const pz = main ? 0 : Math.sin(a) * (0.4 + r2() * 0.25);
            const c = piece(coneG(rr, h, 6), {
              t: [px, h * 0.42, pz],
              r: [(r2() - 0.5) * 0.16, r2() * TAU, (r2() - 0.5) * 0.16], jit: rr * 0.22, jseed: vs + i,
            });
            ramp(c, 0x4c4954, 0x8a8794, 0, h, { noise: 0.05, seed: vs + i, exp: 0.8 });
            pieces.push(c);
          }
          return pieces;
        });
        return [V(g, SOLID_V, [0.06, 0.03]), shadowP(0.85)];
      },
    },
    stalactite: {
      variants: 3, collider: 0, ground: 'hang', hangH: [5, 8.5],
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`stalcM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          for (let i = 0; i < 3; i++) {
            const main = i === 0;
            const h = main ? 1.9 + r2() * 1.3 : 0.7 + r2() * 0.6;
            const rr = main ? 0.36 : 0.15 + r2() * 0.08;
            const a = r2() * TAU;
            const px = main ? 0 : Math.cos(a) * 0.4, pz = main ? 0 : Math.sin(a) * 0.4;
            const c = piece(coneG(rr, h, 6), {
              t: [px, -h * 0.45, pz], r: [Math.PI, 0, (r2() - 0.5) * 0.14], jit: rr * 0.22, jseed: vs + i,
            });
            ramp(c, 0x74717c, 0x4a4750, -h, 0, { noise: 0.05, seed: vs + i });
            pieces.push(c);
          }
          return pieces;
        });
        const p = V(g, SOLID_V, [0.06, 0.03]);
        p.shadow = false;
        return [p];
      },
    },
    hangmoss: {
      variants: 3, collider: 0, ground: 'hang', hangH: [4.5, 7], noPathAvoid: true,
      make: (rng) => {
        const parts = [];
        const n = 4 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const a = rng() * TAU, r = rng() * 0.5;
          parts.push(P(planeG(0.16, 1.0 + rng() * 0.9), FROND, lerpColorHex(0x5c8a4a, 0x3f6b52, rng()),
            [Math.cos(a) * r, -0.6 - rng() * 0.4, Math.sin(a) * r], 1, [0, rng() * TAU, 0], 0.1, false));
        }
        return parts;
      },
    },
    // ------------------------------------------------------------- water structures
    dock: {
      variants: 1, collider: 0, ground: 'water', faceWater: true,
      surface: 'wood', surfaceRect: [1.0, 2.4], surfaceOff: [0, 2.3], // boards run +z from the shore

      make: (rng) => {
        const parts = [];
        for (let i = 0; i < 6; i++) {
          parts.push(P(boxG(1.7, 0.1, 0.72), SOLID, i % 2 ? 0x8a6a48 : 0x94765a, [0, 0.35, 0.4 + i * 0.75]));
        }
        for (let i = 0; i < 3; i++) {
          for (const s of [-1, 1]) {
            parts.push(P(cylG(0.08, 0.1, 1.1, 6), SOLID, 0x6b4a33, [s * 0.78, -0.1, 0.55 + i * 1.75]));
          }
        }
        parts.push(P(boxG(0.09, 0.5, 0.09), SOLID, 0x6b4a33, [0.7, 0.62, 4.1]));
        return parts;
      },
    },
    boat: {
      variants: 1, collider: 0.9, ground: 'water', faceWater: true,
      make: () => [],
      effect: (x, y, z, s, rng) => makeBoatFX(x, y, z, s, rng),
    },
    waterfall: {
      variants: 1, collider: 0, faceCenter: true,
      make: () => [],
      effect: (x, y, z, s, rng, ctx) => makeWaterfallFX(x, y, z, s, rng, ctx),
    },
  };

  // ---------------------------------------------------------- animated set-pieces
  const pulseLights = []; // {light, base, amp, speed, phase}

  function softDiscMaterial(colorHex, opts = {}) {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(colorHex) },
        uAlpha: { value: opts.alpha ?? 0.8 },
        uSize: { value: opts.size ?? 24 },
      },
      vertexShader: `
        attribute float aSeed;
        varying float vSeed;
        uniform float uSize;
        void main(){
          vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (0.6 + 0.4 * fract(aSeed * 7.13)) * (140.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uAlpha;
        varying float vSeed;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.08, d) * uAlpha;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    disposables.push({ mat: m });
    return m;
  }

  function makePoints(count, mat) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) seeds[i] = Math.random() * 100;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    disposables.push({ geo: g });
    return pts;
  }

  function makeCampfireFX(x, y, z, s) {
    const fx = new THREE.Group();
    fx.position.set(x, y, z);
    const flameMat = std('flame_core', { emissive: 0xff8a3c, emissiveIntensity: 2.2, rough: 1 });
    const flameMat2 = std('flame_tip', { emissive: 0xffd94f, emissiveIntensity: 2.6, rough: 1 });
    const f1 = new THREE.Mesh(coneG(0.28, 0.8, 6), flameMat); f1.position.y = 0.55;
    const f2 = new THREE.Mesh(coneG(0.16, 0.55, 5), flameMat2); f2.position.set(0.06, 0.75, 0.03);
    f1.castShadow = f2.castShadow = false;
    // instance colors are not used on plain meshes; tint via material is shared, fine
    fx.add(f1, f2);
    let light = null;
    if (lightBudget > 0) {
      lightBudget--;
      light = new THREE.PointLight(0xffa04a, 2.2, 11 * s, 2);
      light.position.y = 0.9;
      fx.add(light);
    }
    const embers = makePoints(14, softDiscMaterial(0xffb85c, { size: 10, alpha: 0.9 }));
    fx.add(embers);
    const epos = embers.geometry.attributes.position.array;
    const elife = new Float32Array(14);
    for (let i = 0; i < 14; i++) elife[i] = Math.random();
    fx.scale.setScalar(s);
    group.add(fx);
    let t = Math.random() * 10;
    return (dt) => {
      t += dt;
      const flick = 0.9 + Math.sin(t * 11) * 0.08 + Math.sin(t * 23.7) * 0.06;
      f1.scale.set(flick, 1.05 - (flick - 0.9), flick);
      f2.scale.setScalar(0.85 + Math.sin(t * 17 + 1) * 0.12);
      f1.rotation.y = t * 1.7; f2.rotation.y = -t * 2.3;
      if (light) light.intensity = 2.2 * flick;
      for (let i = 0; i < 14; i++) {
        elife[i] += dt * (0.5 + (i % 5) * 0.1);
        if (elife[i] > 1) elife[i] -= 1;
        const l = elife[i];
        const a = i * 2.4 + t * 0.4;
        epos[i * 3] = Math.cos(a) * 0.16 * (1 - l);
        epos[i * 3 + 1] = 0.45 + l * 1.5;
        epos[i * 3 + 2] = Math.sin(a) * 0.16 * (1 - l);
      }
      embers.geometry.attributes.position.needsUpdate = true;
      embers.material.uniforms.uAlpha.value = 0.85;
    };
  }

  function makeEmberVentFX(x, y, z, s, ctx) {
    if (ctx.count > 6) return null; // cap heavy vents when densely scattered
    const fx = new THREE.Group();
    fx.position.set(x, y, z);
    fx.scale.setScalar(s);
    const embers = makePoints(10, softDiscMaterial(0xff8a3c, { size: 9, alpha: 0.7 }));
    fx.add(embers);
    if (ctx.singles && lightBudget > 0) {
      lightBudget--;
      const l = new THREE.PointLight(0xff6a2c, 1.1, 6 * s, 2);
      l.position.y = 0.7;
      fx.add(l);
      pulseLights.push({ light: l, base: 1.1, amp: 0.35, speed: 0.9, phase: x });
    }
    group.add(fx);
    const epos = embers.geometry.attributes.position.array;
    const elife = new Float32Array(10);
    for (let i = 0; i < 10; i++) elife[i] = Math.random();
    let t = 0;
    return (dt) => {
      t += dt;
      for (let i = 0; i < 10; i++) {
        elife[i] += dt * 0.4;
        if (elife[i] > 1) elife[i] -= 1;
        const l = elife[i];
        epos[i * 3] = Math.sin(i * 3.1 + t) * 0.12 * l;
        epos[i * 3 + 1] = 0.55 + l * 2.0;
        epos[i * 3 + 2] = Math.cos(i * 2.3 + t * 0.8) * 0.12 * l;
      }
      embers.geometry.attributes.position.needsUpdate = true;
    };
  }

  function makeBoatFX(x, y, z, s, rng) {
    const fx = new THREE.Group();
    fx.position.set(x, y, z);
    fx.scale.setScalar(s);
    const hullM = std('boat_hull', { rough: 0.85 });
    const mk = (g, tint, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      const me = new THREE.Mesh(g, hullM);
      me.position.set(px, py, pz); me.rotation.set(rx, ry, rz); me.scale.set(sx, sy, sz);
      me.castShadow = true;
      // per-mesh tint via material clone would defeat caching; use vertex-less color trick:
      fx.add(me);
      return me;
    };
    // simple lapstrake hull from curved boxes
    mk(boxG(0.9, 0.3, 2.6), 0, 0, 0.2, 0);
    mk(boxG(1.1, 0.14, 2.9), 0, 0, 0.36, 0);
    mk(boxG(0.6, 0.22, 0.5), 0, 0, 0.34, 1.45, 0.5);
    mk(boxG(0.6, 0.22, 0.5), 0, 0, 0.34, -1.45, -0.5);
    mk(boxG(0.85, 0.08, 0.3), 0, 0, 0.46, 0.4);       // bench
    mk(cylG(0.03, 0.04, 1.4, 5), 0, 0.35, 0.5, -0.6, 0.4, 0, 0.9); // oar
    group.add(fx);
    const phase = rng() * TAU;
    let t = 0;
    return (dt) => {
      t += dt;
      fx.position.y = y + Math.sin(t * 0.9 + phase) * 0.045;
      fx.rotation.z = Math.sin(t * 0.7 + phase) * 0.03;
      fx.rotation.x = Math.sin(t * 0.55 + phase + 1) * 0.02;
    };
  }

  function makeWaterfallFX(x, y, z, s, rng, ctx) {
    const fx = new THREE.Group();
    fx.position.set(x, y, z);
    fx.rotation.y = ctx.yaw ?? 0;
    fx.scale.setScalar(s);
    const W = 3.2, H = 6.5;
    const sheetMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uTop: { value: new THREE.Color(0xcfe8ff) },
        uBot: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float uTime;
        void main(){
          vUv = uv;
          vec3 p = position;
          p.x += sin(uv.y * 9.0 + uTime * 2.0) * 0.06 * (1.0 - uv.y);
          p.z += sin(uv.y * 7.0 - uTime * 1.6) * 0.05;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime; uniform vec3 uTop; uniform vec3 uBot;
        float band(float v, float n, float sp){ return smoothstep(0.35, 0.9, fract(v * n - uTime * sp)); }
        void main(){
          float streaks = 0.45 + 0.3 * band(vUv.y + sin(vUv.x * 21.0) * 0.03, 6.0, 0.9)
                               + 0.25 * band(vUv.y + sin(vUv.x * 13.0 + 2.0) * 0.05, 11.0, 1.4);
          float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          float foamTop = smoothstep(0.93, 1.0, vUv.y) * 0.5;
          float foamBot = smoothstep(0.14, 0.0, vUv.y) * 0.8;
          vec3 col = mix(uBot, uTop, vUv.y) * streaks + vec3(foamTop + foamBot);
          float a = edge * (0.55 + 0.35 * streaks + foamBot);
          gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
        }`,
    });
    disposables.push({ mat: sheetMat });
    const sheet = new THREE.Mesh(planeG(W, H, 1, 8), sheetMat);
    sheet.position.set(0, H / 2, 0);
    sheet.rotation.x = 0.06;
    fx.add(sheet);
    // rocky lip + base stones
    const lip = new THREE.Mesh(boxG(W + 0.8, 0.6, 0.8), SOLID);
    lip.position.set(0, H + 0.2, -0.35);
    lip.castShadow = true;
    fx.add(lip);
    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(icoG(0.4, 0), SOLID);
      st.position.set((rng() - 0.5) * W, 0.15, 0.5 + rng() * 0.5);
      st.scale.y = 0.6;
      st.rotation.y = rng() * TAU;
      fx.add(st);
    }
    // foam pool
    const foamMat = std('wf_foam', { transparent: true, opacity: 0.55, emissive: 0xdff2ff, emissiveIntensity: 0.25, rough: 0.4 });
    const foam = new THREE.Mesh(cylG(W * 0.55, W * 0.62, 0.12, 12), foamMat);
    foam.position.set(0, 0.1, 0.35);
    fx.add(foam);
    // mist
    const mist = makePoints(26, softDiscMaterial(0xe8f4ff, { size: 30, alpha: 0.22 }));
    fx.add(mist);
    const mpos = mist.geometry.attributes.position.array;
    const mlife = new Float32Array(26);
    for (let i = 0; i < 26; i++) mlife[i] = Math.random();
    group.add(fx);
    let t = rng() * 10;
    return (dt) => {
      t += dt;
      sheetMat.uniforms.uTime.value = t;
      foam.rotation.y = t * 0.35;
      for (let i = 0; i < 26; i++) {
        mlife[i] += dt * 0.35;
        if (mlife[i] > 1) mlife[i] -= 1;
        const l = mlife[i];
        const a = i * 1.7;
        mpos[i * 3] = Math.cos(a + t * 0.2) * (0.5 + l * W * 0.5);
        mpos[i * 3 + 1] = 0.2 + l * 1.6;
        mpos[i * 3 + 2] = 0.3 + Math.sin(a - t * 0.15) * 0.8 * l;
      }
      mist.geometry.attributes.position.needsUpdate = true;
    };
  }

  // ------------------------------------------------------------- scatter engine
  function lerpColorHex(a, b, t) {
    _col.set(a);
    const c2 = new THREE.Color(b);
    _col.lerp(c2, t);
    return _col.getHex();
  }

  function scatterPositions(entry, def, rngS) {
    const [ax, az, ar] = entry.area ?? [0, 0, half * 0.8];
    const density = entry.density ?? 0.3;
    const target = clamp(Math.round(density * Math.PI * ar * ar / 22), 1, 380);
    const out = [];
    // cluster centers for grove-like kinds
    const centers = [];
    if (def.cluster) {
      const k = Math.max(1, Math.round(target / 6));
      for (let i = 0; i < k; i++) {
        const a = rngS() * TAU, r = Math.sqrt(rngS()) * ar * 0.85;
        centers.push([ax + Math.cos(a) * r, az + Math.sin(a) * r]);
      }
    }
    let attempts = 0;
    while (out.length < target && attempts < target * 6) {
      attempts++;
      let x, z;
      if (centers.length) {
        const c = centers[Math.floor(rngS() * centers.length)];
        const a = rngS() * TAU, r = Math.pow(rngS(), 0.7) * ar * 0.28;
        x = c[0] + Math.cos(a) * r; z = c[1] + Math.sin(a) * r;
      } else {
        const a = rngS() * TAU, r = Math.sqrt(rngS()) * ar;
        x = ax + Math.cos(a) * r; z = az + Math.sin(a) * r;
      }
      if (Math.abs(x) > half - 2 || Math.abs(z) > half - 2) continue;
      const pi = pathInfo(x, z);
      if (!def.noPathAvoid && pi.d < pi.w * 0.5 + 0.6) continue;
      if (def.pathRing && paths.length) {
        // flowers & grass love path edges: probabilistic pull toward the verge
        const verge = pi.d > pi.w * 0.5 + 0.2 && pi.d < pi.w * 0.5 + 2.8;
        if (!verge && rngS() < 0.45) continue;
      }
      if (def.ground === 'water') {
        if (!water || !inWater(x, z)) continue;
      } else if (def.ground !== 'hang') {
        if (inWater(x, z) && entry.kind !== 'reeds') continue;
        if (entry.kind === 'reeds' && water) {
          const yv = terrainY(x, z);
          if (Math.abs(yv - water.level) > 0.5) continue; // shoreline only
        }
      }
      out.push([x, z]);
    }
    return out;
  }

  function placementY(kind, def, x, z, rngS) {
    if (def.ground === 'water') return (water?.level ?? 0) + (kind === 'lilypad' ? 0.03 : 0.05);
    if (def.ground === 'hang') {
      const [lo, hi] = def.hangH ?? [5, 8];
      return terrainY(x, z) + lo + rngS() * (hi - lo);
    }
    return terrainY(x, z) - (def.sinkY ?? 0.04);
  }

  function yawFor(entry, def, x, z, rngS) {
    if (entry.rot !== undefined) return entry.rot;
    if (def.faceWater && water) return Math.atan2(water.pos[0] - x, water.pos[1] - z) === 0 ? 0 : Math.atan2(water.pos[0] - x, water.pos[1] - z);
    if (def.faceCenter) return Math.atan2(-x, -z) + (rngS() - 0.5) * 0.35;
    return rngS() * TAU;
  }

  function realize(kind, placements, entry, rngS, singles) {
    const def = KINDS[kind];
    if (!def) { warnOnce(`unknown prop kind "${kind}" — skipped`); return; }
    if (!placements.length) return;
    const variants = def.variants ?? 1;
    const buckets = Array.from({ length: variants }, () => []);
    placements.forEach((pl, i) => buckets[i % variants].push(pl));
    const ctx = { count: 0, singles, yaw: 0 };

    for (let v = 0; v < buckets.length; v++) {
      const bucket = buckets[v];
      if (!bucket.length) continue;
      const brng = seededRandom(seed * 31 + hashStr(kind) + v * 977);
      const parts = def.make(brng);
      // Pre-bake local matrices once per part.
      const locals = parts.map((p) => {
        const sc = typeof p.scl === 'number' ? [p.scl, p.scl, p.scl] : p.scl;
        _eul.set(p.rot[0], p.rot[1], p.rot[2]);
        return new THREE.Matrix4().compose(
          _pos.set(p.off[0], p.off[1], p.off[2]),
          _quat.setFromEuler(_eul),
          _scl.set(sc[0], sc[1], sc[2]),
        );
      });
      for (let pi = 0; pi < parts.length; pi++) {
        const part = parts[pi];
        const im = new THREE.InstancedMesh(part.g, part.m, bucket.length);
        im.castShadow = part.shadow !== false;
        im.receiveShadow = !part.ro;
        if (part.ro) im.renderOrder = part.ro;
        for (let i = 0; i < bucket.length; i++) {
          const pl = bucket[i]; // {x, z, y, yaw, s, rng}
          _eul.set(0, pl.yaw, 0);
          _m4.compose(_pos.set(pl.x, pl.y, pl.z), _quat.setFromEuler(_eul), _scl.set(pl.s, pl.sy ?? pl.s, pl.s));
          _m4b.multiplyMatrices(_m4, locals[pi]);
          im.setMatrixAt(i, _m4b);
          if (part.vjit) {
            // Vertex-colored part: instance color is a multiplier — brightness
            // band + warm/cool RGB tilt (hue jitter that survives white tints).
            const lum = 1 + pl.lumJ * part.vjit[0];
            const w = pl.hueJ * (part.vjit[1] ?? 0);
            _col.setRGB(lum * (1 + w), lum, lum * (1 - w));
            im.setColorAt(i, _col);
            continue;
          }
          // Per-instance hue/light jitter around the part tint (jitH, when
          // present, decouples the hue band from the lightness band).
          _col.set(part.tint);
          const jH = part.jitH ?? part.jit;
          if (jH > 0 || part.jit > 0) _col.offsetHSL((pl.hueJ) * jH, 0, (pl.lumJ) * part.jit);
          im.setColorAt(i, _col);
        }
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        group.add(im);
      }
      // Colliders + effects per placement.
      for (const pl of bucket) {
        if (def.collider) colliders.push({ x: pl.x, z: pl.z, r: def.collider * pl.s });
        if (def.surface) {
          // oriented footstep-surface rectangle (see file header)
          const [shx, shz] = def.surfaceRect ?? [1, 1];
          const [ox, oz] = def.surfaceOff ?? [0, 0];
          const cos = Math.cos(pl.yaw), sin = Math.sin(pl.yaw);
          const hx = shx * pl.s, hz = shz * pl.s;
          surfacePatches.push({
            x: pl.x + (ox * cos + oz * sin) * pl.s,
            z: pl.z + (-ox * sin + oz * cos) * pl.s,
            hx, hz, cos, sin, r2: hx * hx + hz * hz, surface: def.surface,
          });
        }
        if (def.effect) {
          ctx.count++;
          ctx.yaw = pl.yaw;
          const up = def.effect(pl.x, pl.y, pl.z, pl.s, seededRandom(hashStr(kind) + Math.round(pl.x * 10) * 31 + Math.round(pl.z * 10)), ctx);
          if (up) updaters.push(up);
        }
      }
    }
  }

  // ------------------------------------------------------------- run placement
  const byKindScatter = new Map(); // kind -> [{x,z,y,yaw,s,...}]
  const byKindSingle = new Map();

  for (const entry of (zone.props ?? [])) {
    const def = KINDS[entry.kind];
    if (!def) { warnOnce(`unknown prop kind "${entry.kind}" — skipped`); continue; }
    const eRng = seededRandom(seed * 13 + hashStr(entry.kind) + Math.round((entry.at?.[0] ?? entry.area?.[0] ?? 0) * 7));
    if (entry.at) {
      const [x, z] = entry.at;
      const s = (entry.scale ?? 1);
      const pl = {
        x, z, y: placementY(entry.kind, def, x, z, eRng),
        yaw: yawFor(entry, def, x, z, eRng), s,
        sy: s * (1 + (eRng() - 0.5) * 0.06),
        hueJ: (eRng() - 0.5) * 2, lumJ: (eRng() - 0.5) * 2,
      };
      if (!byKindSingle.has(entry.kind)) byKindSingle.set(entry.kind, []);
      byKindSingle.get(entry.kind).push(pl);
    } else {
      const pts = scatterPositions(entry, def, eRng);
      const list = byKindScatter.get(entry.kind) ?? [];
      for (const [x, z] of pts) {
        const s = (entry.scale ?? 1) * (0.8 + eRng() * 0.5);
        list.push({
          x, z, y: placementY(entry.kind, def, x, z, eRng),
          yaw: yawFor(entry, def, x, z, eRng), s,
          sy: s * (1 + (eRng() - 0.5) * 0.14),
          hueJ: (eRng() - 0.5) * 2, lumJ: (eRng() - 0.5) * 2,
        });
      }
      byKindScatter.set(entry.kind, list);
    }
  }
  for (const [kind, list] of byKindScatter) realize(kind, list, null, null, false);
  for (const [kind, list] of byKindSingle) realize(kind, list, null, null, true);

  // ------------------------------------------------------------- master updater
  let T = Math.random() * 100;
  updaters.push((dt) => {
    T += dt;
    for (let i = 0; i < pulseMats.length; i++) {
      const p = pulseMats[i];
      p.m.emissiveIntensity = p.base + Math.sin(T * p.speed + p.phase) * p.amp * p.base;
    }
    const night = 1 - daylight(G.calendar?.dayTime ?? 0.5);
    const nightSoft = night * night * (3 - 2 * night);
    for (let i = 0; i < nightMats.length; i++) {
      const nm = nightMats[i];
      nm.m.emissiveIntensity = nm.base * (0.06 + 0.94 * nightSoft);
    }
    for (let i = 0; i < nightLights.length; i++) {
      const nl = nightLights[i];
      nl.light.intensity = nl.base * nightSoft * (0.92 + Math.sin(T * 6 + nl.phase) * 0.08);
    }
    for (let i = 0; i < pulseLights.length; i++) {
      const p = pulseLights[i];
      p.light.intensity = p.base + Math.sin(T * p.speed + p.phase) * p.amp;
    }
  });

  function dispose() {
    group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); // frees instance attribute buffers
    for (const d of disposables) {
      if (d.geo) d.geo.dispose();
      if (d.mat) d.mat.dispose();
      if (d.fn) d.fn();
    }
    geoCache.clear();
    matCache.clear();
    pulseMats.length = nightMats.length = nightLights.length = pulseLights.length = 0;
    updaters.length = 0;
    surfacePatches.length = 0;
    group.clear();
  }

  return { group, colliders, updaters, surfacePatches, dispose };
}
