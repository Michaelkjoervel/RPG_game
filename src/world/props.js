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
//
// Visual pass v2 (soft stylized): every material is smooth-shaded; facets
// survive only where a piece's own normals say so (crystals, cut stone,
// planks — see piece()'s `sh` shading modes). Foliage lobes share one
// spherical normal field per canopy so a tree shades like one soft ball, and
// an albedo-proportional "lift" keeps shaded undersides from ever going black.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as MATS from '../gfx/materials.js';
import { mat, windSway, jitterGeometry, smoothGeometry, sphericalNormals } from '../gfx/materials.js';
import { G } from '../core/state.js';
import { ZONES } from '../data/worldmap.js';
import { settings } from '../core/settings.js';
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
  const liftSets = [];   // {u, base} albedo lift uniforms, scaled by daylight
  let lightBudget = 10;   // dynamic point lights per zone, spent by set-pieces

  // Quality tier (read at build; a zone reload picks up a changed setting).
  const QUALITY = settings.quality ?? 'high';
  const HI = QUALITY === 'high';
  const LOD = HI ? 2 : 1;                                  // canopy/rock icosphere detail
  const SMALL_MUL = QUALITY === 'low' ? 0.55 : QUALITY === 'med' ? 0.8 : 1; // tiny-scatter density
  const INDOOR = biome === 'cave' || biome === 'spire';

  const geo = (key, make) => {
    let g = geoCache.get(key);
    if (!g) { g = make(); geoCache.set(key, g); disposables.push({ geo: g }); }
    return g;
  };

  // ------------------------------------------------------------- geometry lib
  const sphereG = (r, w = 7, h = 5) => geo(`sp${r}_${w}_${h}`, () => new THREE.SphereGeometry(r, w, h));
  const coneG = (r, h, s = 7) => geo(`co${r}_${h}_${s}`, () => new THREE.ConeGeometry(r, h, s));
  const cylG = (rt, rb, h, s = 7, hs = 1) => geo(`cy${rt}_${rb}_${h}_${s}_${hs}`, () => new THREE.CylinderGeometry(rt, rb, h, s, hs));
  const boxG = (w, h, d) => geo(`bx${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
  const icoG = (r, d = 0) => geo(`ic${r}_${d}`, () => new THREE.IcosahedronGeometry(r, d));
  const planeG = (w, h, sw = 1, sh = 1) => geo(`pl${w}_${h}_${sw}_${sh}`, () => new THREE.PlaneGeometry(w, h, sw, sh));
  const octaG = (r) => geo(`oc${r}`, () => new THREE.OctahedronGeometry(r, 0));
  // Rounded box: crisp silhouettes with soft bevelled edges — cut stone,
  // furniture, roof slabs (v2 "crisp but friendly" architecture).
  const rboxG = (w, h, d, r = 0.05, seg = 1) => geo(`rb${w}_${h}_${d}_${r}_${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999));
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
  // Albedo-proportional ambient lift: adds `albedo * uLift` as emissive, so a
  // canopy underside or a shaded wall keeps its own hue at a readable floor
  // instead of sinking to black under the single dominant key. The master
  // updater scales it with daylight (night stays night). Chains any earlier
  // onBeforeCompile (wind sway, mat() hooks) and keys the program cache on
  // that earlier hook's identity so different shader variants never share.
  function addLift(m, base) {
    const u = { value: base };
    const hook = (shader) => {
      shader.uniforms.uLift = u;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uLift;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * uLift;');
    };
    if (typeof MATS.chainShaderHook === 'function') MATS.chainShaderHook(m, 'dress-lift', hook);
    else { // fallback: manual chain with a key that folds in the previous hook's identity
      const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey();
      m.onBeforeCompile = function (shader, r) { prev.call(this, shader, r); hook(shader); };
      m.customProgramCacheKey = () => `lf-lift|${prevKey}`;
      m.needsUpdate = true;
    }
    liftSets.push({ u, base });
  }

  // Smooth-shaded by default (v2): pieces carry their own normals, so crisp
  // edges survive exactly where a piece was built with flat/creased normals.
  function std(key, opts = {}) {
    let m = matCache.get(key);
    if (m) return m;
    m = mat(0xffffff, { // instances carry the tint
      flat: opts.flat === true,
      rough: opts.rough ?? 0.92,
      metal: opts.metal ?? 0.0,
      vertexColors: !!opts.vcolor,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      depthWrite: opts.depthWrite ?? true,
      rim: opts.rim ?? 0.4, wrap: opts.wrap ?? 1,
    });
    if (opts.sway) {
      try { disposables.push({ fn: windSway(m, { strength: opts.sway }) }); } // fn = sway unregister
      catch (e) { warnOnce('windSway unavailable: ' + e.message); }
    }
    if (opts.lift) addLift(m, opts.lift * (INDOOR ? 0.6 : 1));
    if (opts.pulse) pulseMats.push({ m, base: opts.emissiveIntensity ?? 1, amp: opts.pulse.amp ?? 0.4, speed: opts.pulse.speed ?? 1.2, phase: opts.pulse.phase ?? 0 });
    if (opts.night) nightMats.push({ m, base: opts.emissiveIntensity ?? 1, day: opts.night.day ?? 0.06 });
    matCache.set(key, m);
    disposables.push({ mat: m });
    return m;
  }

  const FOLIAGE  = std('foliage', { sway: 0.55, rough: 0.95, lift: 0.14 });
  const FOLIAGE2 = std('foliage2', { sway: 0.3, rough: 0.95, lift: 0.14 });         // subtle sway
  const SOLID    = std('solid', { lift: 0.06 });                                   // rock/wood/stone
  const SOLID_S  = std('solid_smooth', { rough: 0.8, lift: 0.06 });
  const CLOTH    = std('cloth', { sway: 0.65, side: THREE.DoubleSide, rough: 1, lift: 0.1 });
  const FROND    = std('frond', { sway: 0.8, side: THREE.DoubleSide, rough: 0.95, lift: 0.14 });
  const ICE      = std('ice', { rough: 0.35, transparent: true, opacity: 0.85, emissive: 0x9fd4ff, emissiveIntensity: 0.12 });
  const GLOW_CRYSTAL = std('glow_crystal', { emissive: 0x9fe8ff, emissiveIntensity: 0.9, rough: 0.4, pulse: { amp: 0.45, speed: 1.1 } });
  const GLOW_FRUIT  = std('glow_fruit', { emissive: 0xffe9b0, emissiveIntensity: 1.1, rough: 0.5, pulse: { amp: 0.35, speed: 0.8, phase: 1.7 } });
  const GLOW_FERN   = std('glow_fern', { sway: 0.6, side: THREE.DoubleSide, emissive: 0x59e8c2, emissiveIntensity: 0.85, pulse: { amp: 0.4, speed: 1.4 } });
  const GLOW_RUNE   = std('glow_rune', { emissive: 0xffe9b0, emissiveIntensity: 0.8, rough: 0.6, pulse: { amp: 0.25, speed: 0.55 } });
  const GLOW_LAVA   = std('glow_lava', { emissive: 0xff5a1f, emissiveIntensity: 1.3, rough: 0.7, pulse: { amp: 0.5, speed: 0.9 } });
  // Windows: a warm pane by day (so glass never reads as a black hole), a
  // bright hearth-lit glow after dusk (blooms on High).
  const WINDOW      = std('window', { emissive: 0xffb45c, emissiveIntensity: 1.9, rough: 0.35, night: { day: 0.1 } });
  const LAMP_GLASS  = std('lamp_glass', { emissive: 0xffd9a0, emissiveIntensity: 1.6, rough: 0.3, night: { day: 0.12 } });
  const BERRY       = std('berry', { emissive: 0xd83a4a, emissiveIntensity: 0.25, rough: 0.5 });
  const SPIRE_SEAM  = std('spire_seam', { emissive: 0xcfd4e8, emissiveIntensity: 0.55, rough: 0.6, pulse: { amp: 0.2, speed: 0.4 } });

  // Vertex-colored variants — merged prop geometries bake their palette +
  // gradients into geometry colors; instance color then only carries a subtle
  // per-instance brightness / warm-cool jitter (part.vjit).
  const FOLIAGE_V  = std('foliage_v', { sway: 0.55, rough: 0.95, vcolor: true, lift: 0.15, rim: 0.28 });
  const FOLIAGE2_V = std('foliage2_v', { sway: 0.28, rough: 0.95, vcolor: true, lift: 0.15, rim: 0.28 });
  const SOLID_V    = std('solid_v', { vcolor: true, lift: 0.07 });
  const FROND_V    = std('frond_v', { sway: 0.8, side: THREE.DoubleSide, rough: 0.95, vcolor: true, lift: 0.16 });
  const CLOTH_V    = std('cloth_v', { sway: 0.25, side: THREE.DoubleSide, rough: 0.95, vcolor: true, lift: 0.12 });
  const FLAG_V     = std('flag_v', { sway: 0.12, side: THREE.DoubleSide, rough: 0.9, vcolor: true, lift: 0.14 });
  const WINDOW_V   = std('window_v', { vcolor: true, emissive: 0xffb45c, emissiveIntensity: 1.9, rough: 0.35, night: { day: 0.1 } });

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
  //   o: { t:[x,y,z], r:[x,y,z], s:number|[x,y,z], jit, jseed, sh }
  // Shading (`sh`, v2): the materials are smooth, so each piece's normals
  // decide how it reads —
  //   'smooth' fully rounded (foliage, caps, moss, snow, cloth)
  //   'soft'   rounded with a few crease edges kept (boulders, trunks' feet)
  //   'crease' hard edges at ~50°+ kept, curved faces smooth (cut stone, planks,
  //            furniture, architecture) — the default for jittered pieces
  //   'flat'   one normal per face (crystals, ice, gems)
  //   (unset, not jittered: the primitive's own normals — boxes stay crisp,
  //    spheres/cylinders stay round)
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
    shade(g, o.sh ?? (o.jit ? 'crease' : null));
    return g;
  }
  function shade(g, sh) {
    if (!sh) return g;
    if (sh === 'smooth') smoothGeometry(g);
    else if (sh === 'soft') smoothGeometry(g, { creaseAngle: 0.72 });
    else if (sh === 'crease') smoothGeometry(g, { creaseAngle: 0.9 });
    else if (sh === 'flat') g.computeVertexNormals(); // non-indexed -> per-face normals
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
    shade(g, 'flat');                          // planar gable/slope faces stay crisp
    paintFaces(g, (cx, cy, cz, nx) => {
      if (Math.abs(nx) > 0.85) return wall;    // gable triangles
      const t = clamp((cy - y) / roofH, 0, 1);
      return lerpColorHex(dark, light, clamp(t * 0.9 + hashN(cx, cy, cz, seed) * 0.1, 0, 1));
    });
    return g;
  }

  // Smooth low-frequency 3D wobble in ~[-1,1] (lumps, not per-vertex noise:
  // white-noise jitter reads as crumpled paper under smooth shading).
  function wob(x, y, z, s) {
    return (Math.sin(x * 1.9 + s * 3.1) * Math.sin(y * 2.3 + s * 1.3 + x * 0.7)
      + Math.sin(z * 2.1 + s * 2.2 + y * 0.9) * Math.sin(x * 1.3 - z * 1.6 + s)) * 0.5;
  }
  // Unit lobe: icosphere pushed radially by the wobble. Position-deterministic,
  // so duplicated corners move together (no cracks). Cached per shape seed.
  const lobeG = (detail, ls, amp = 0.16) => geo(`lobe${detail}_${ls}_${amp}`, () => {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const f = 1 + amp * wob(x, y, z, ls);
      p.setXYZ(i, x * f, y * f, z * f);
    }
    return g;
  });

  // Unit petal disc: P rounded petals (4 ring points each), cupped upward,
  // top + underside faces (non-indexed, uv-compatible with the primitives).
  const petalDiscG = (P) => geo(`petal${P}`, () => {
    const M = P * 3, prof = [0.34, 0.92, 0.92];
    const ring = [];
    for (let i = 0; i < M; i++) {
      const a = ((i + 0.5) / M) * TAU, r = prof[i % 3];
      ring.push([Math.cos(a) * r, 0.28 * r * r, Math.sin(a) * r]);
    }
    const pos = [];
    for (let i = 0; i < M; i++) {
      const a = ring[i], b = ring[(i + 1) % M];
      pos.push(0, 0.02, 0, ...b, ...a);                                         // top (+Y)
      pos.push(0, -0.04, 0, a[0], a[1] - 0.05, a[2], b[0], b[1] - 0.05, b[2]); // underside
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    g.computeVertexNormals();
    return g;
  });
  // Unit fern frond: tapered, serrated blade arched along its length.
  const frondG = () => geo('frond', () => {
    const g = new THREE.PlaneGeometry(0.2, 1, 2, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = p.getY(i) + 0.5;                  // 0 base .. 1 tip
      const x = p.getX(i);
      const w = Math.sin(Math.min(1, v * 1.15) * Math.PI) * (0.75 + 0.25 * Math.cos(v * 38)); // serrated taper
      p.setX(i, x * Math.max(0.05, w));
      p.setZ(i, -0.18 * v * v + (x === 0 ? 0.012 : 0)); // arch + midrib ridge
    }
    return g;
  });
  // Unit tulip bud: closed lathe cup with a scalloped shoulder.
  const tulipG = () => geo('tulip', () => {
    const pts = [[0.001, 0], [0.55, 0.12], [0.82, 0.42], [0.8, 0.8], [0.52, 1.0], [0.001, 0.9]].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < 0.7) continue;
      const a = Math.atan2(p.getZ(i), p.getX(i));
      p.setY(i, y + 0.12 * Math.max(0, Math.cos(a * 3)) * (y - 0.7) / 0.3);
    }
    return g;
  });

  // Multi-lobed canopy: k lumpy lobes clustered around (0, cy, 0), smooth
  // shaded, then one shared spherical normal field (center dropped below the
  // mass) so the crown shades as one soft ball with just a hint of its lumps.
  // Returns pieces[] (uncolored) + the [lo,hi] y-range for a shared ramp.
  function canopyPieces(rng, { k = 5, cy = 2.6, R = 1.25, spread = 0.75, squash = 0.8, seed = 1, detail = LOD, amp = 0.16, blend = 0.62, drop = 0.45 }) {
    const pieces = [];
    let lo = Infinity, hi = -Infinity, sx = 0, sz = 0;
    for (let i = 0; i < k; i++) {
      const top = i === 0;
      const a = (i / Math.max(1, k - 1)) * TAU + rng() * 0.9;
      const rad = top ? 0 : spread * R * (0.55 + rng() * 0.55);
      const r = R * (top ? 0.85 : 0.5 + rng() * 0.42);
      const px = Math.cos(a) * rad, pz = Math.sin(a) * rad;
      const py = cy + (top ? R * 0.42 : (rng() - 0.35) * R * 0.55);
      const g = piece(lobeG(detail, (seed * 13 + i) % 97, amp), {
        t: [px, py, pz], s: [r, r * squash, r], r: [0, rng() * TAU, 0], sh: 'smooth',
      });
      pieces.push(g);
      sx += px; sz += pz;
      lo = Math.min(lo, py - r * squash); hi = Math.max(hi, py + r * squash);
    }
    const center = new THREE.Vector3(sx / k, lerp(lo, hi, 0.5) - R * drop, sz / k);
    for (const g of pieces) sphericalNormals(g, { center, blend });
    return { pieces, lo, hi, center };
  }

  // Canopy color: vertical ramp + a sun-kissed crown (up-facing normals warm
  // toward `sun`) + per-lobe tone shifts so the mass reads painterly.
  const CANOPY_TONE = { forest: [0x1c4a36, 0.3, 0x4f8a50, 0.3], glade: [0x1f4a52, 0.2, 0x5a9a8a, 0.2], mountain: [0x24483a, 0.2, 0x5a8a60, 0.2] }[biome] ?? null;
  function paintCanopy(cn, from, to, { seed = 1, sun = null, lobeVar = 0.07, exp = 1.1 } = {}) {
    if (CANOPY_TONE) {
      from = lerpColorHex(from, CANOPY_TONE[0], CANOPY_TONE[1]);
      to = lerpColorHex(to, CANOPY_TONE[2], CANOPY_TONE[3]);
      if (sun != null) sun = lerpColorHex(sun, 0xb8d890, 0.4);
    }
    const sunC = sun != null ? new THREE.Color(sun) : null;
    cn.pieces.forEach((g, li) => {
      ramp(g, from, to, cn.lo, cn.hi, { noise: 0.03, seed, exp, lift: 0.12 });
      const col = g.attributes.color, nrm = g.attributes.normal;
      const lv = 1 + hashN(li, seed, 3, 7) * lobeVar;
      for (let i = 0; i < col.count; i++) {
        let r = col.getX(i) * lv, gg = col.getY(i) * lv, b = col.getZ(i) * lv;
        if (sunC) {
          const up = clamp(nrm.getY(i), 0, 1);
          const k = up * up * 0.35;
          r += (sunC.r - r) * k; gg += (sunC.g - gg) * k; b += (sunC.b - b) * k;
        }
        col.setXYZ(i, r, gg, b);
      }
    });
  }

  // Unit boulder: lumpy icosphere + 2-4 planar cuts (the few crisp edges a
  // weathered stone keeps) + a flattened seat. Cached per shape seed.
  const rockG = (detail, rs) => geo(`rock${detail}_${rs}`, () => {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.attributes.position;
    const rr = seededRandom(rs * 7 + 3);
    const cuts = [];
    const nc = 1 + Math.floor(rr() * 3);
    for (let c = 0; c < nc; c++) {
      const th = rr() * TAU, ph = Math.acos(clamp(rr() * 1.3 - 0.3, -1, 1)); // mostly top/sides
      cuts.push([Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th), 0.7 + rr() * 0.22]);
    }
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const f = 1 + 0.14 * wob(x * 1.3, y * 1.3, z * 1.3, rs);
      x *= f; y *= f; z *= f;
      for (const [nx, ny, nz, d] of cuts) {
        const k = x * nx + y * ny + z * nz - d;
        if (k > 0) { x -= nx * k; y -= ny * k; z -= nz * k; }
      }
      if (y < -0.3) y = -0.3 + (y + 0.3) * 0.22; // flattened seat
      p.setXYZ(i, x, y, z);
    }
    return g;
  });

  // Top-lit stone paint: vertical ramp + dusty sunlit tops (up-facing normals
  // lighten) so boulders read round and warm, never navy-bottomed.
  function paintStone(g, dark, light, lo, hi, seed, topHex = null) {
    ramp(g, dark, light, lo, hi, { noise: 0.035, seed, exp: 1.1, lift: 0.2 });
    const col = g.attributes.color, nrm = g.attributes.normal;
    _c1.set(topHex ?? lerpColorHex(light, 0xfff4e0, 0.25));
    for (let i = 0; i < col.count; i++) {
      const up = clamp(nrm.getY(i), 0, 1), k = up * up * 0.3;
      col.setXYZ(i, col.getX(i) + (_c1.r - col.getX(i)) * k, col.getY(i) + (_c1.g - col.getY(i)) * k, col.getZ(i) + (_c1.b - col.getZ(i)) * k);
    }
    return g;
  }

  // Moss that grows ON the surface: up-facing vertices tint toward moss
  // greens through a soft noisy threshold (replaces floating moss lenses).
  const _mossA = new THREE.Color(0x4f7f3a), _mossB = new THREE.Color(0x86b85a);
  function mossify(g, { amount = 0.5, seed = 1, minY = -Infinity } = {}) {
    const col = g.attributes.color, nrm = g.attributes.normal, pos = g.attributes.position;
    for (let i = 0; i < col.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (y < minY) continue;
      const n = wob(x * 2.2, y * 2.2, z * 2.2, seed) * 0.5 + hashN(x, y, z, seed) * 0.12;
      const t = clamp((nrm.getY(i) - (1 - amount)) * 3.2 + n, 0, 1);
      if (t <= 0) continue;
      const m = _mossA.clone().lerp(_mossB, clamp(nrm.getY(i), 0, 1));
      col.setXYZ(i, lerp(col.getX(i), m.r, t), lerp(col.getY(i), m.g, t), lerp(col.getZ(i), m.b, t));
    }
    return g;
  }

  // Clustered rounded stones (shared by rock kinds); colors baked top-lit.
  function stonePieces(rng, { k = 3, R = 0.55, seed = 1, dark = 0x6e6b64, light = 0xa4a198, detail = LOD }) {
    const pieces = [];
    for (let i = 0; i < k; i++) {
      const main = i === 0;
      const a = rng() * TAU;
      const rad = main ? 0 : R * (0.85 + rng() * 0.6);
      const r = R * (main ? 1 : 0.3 + rng() * 0.4);
      const sy = 0.66 + rng() * 0.3;
      const g = piece(rockG(main ? detail : 1, (seed * 7 + i) % 61), {
        t: [Math.cos(a) * rad, r * sy * 0.3, Math.sin(a) * rad],
        s: [r * (0.95 + rng() * 0.35), r * sy, r * (0.95 + rng() * 0.35)],
        r: [(rng() - 0.5) * 0.2, rng() * TAU, (rng() - 0.5) * 0.2], sh: 'soft',
      });
      paintStone(g, dark, light, -R * 0.1, r * sy * 1.35, seed + i);
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
        r: [(rng() - 0.5) * 0.5, rng() * TAU, (rng() - 0.5) * 0.5], sh: 'smooth',
      });
      ramp(g, lerpColorHex(c1, c2, rng()), c2, 0, bh, { noise: 0.03, seed: seed + i });
      pieces.push(g);
    }
    return pieces;
  }

  // ---------------------------------------------------- v2 cottage architecture
  // Crisp silhouettes, friendly details: rounded stone footings, pastel
  // plaster, thick rounded roof slabs with shingle courses and a ridge cap,
  // windows with mullions / shutters / flower boxes, a hooded door with a
  // lantern, and a smoking chimney. Everything lit or glowing (panes,
  // lanterns) goes into a separate `glow` list drawn with the WINDOW material.
  const ROOFS = [
    { dark: 0x8e3d2f, light: 0xcf6c52, ridge: 0x5e2a22 },   // terracotta
    { dark: 0x3d5470, light: 0x7390ad, ridge: 0x2b3a50 },   // slate blue
    { dark: 0x4c6b3a, light: 0x86ab60, ridge: 0x364d2b },   // moss shingle
    { dark: 0x94642f, light: 0xd9a75c, ridge: 0x6a4524 },   // thatch gold
  ];
  const WALLS = [
    { lo: 0xdcc9a2, hi: 0xfbf1dc },  // cream
    { lo: 0xe2b99c, hi: 0xfce4d0 },  // peach
    { lo: 0xc4d0d4, hi: 0xf0f6f4 },  // pale blue-grey
    { lo: 0xcbd3b0, hi: 0xf2f4de },  // sage
  ];
  const SHUTTERS = [0x4f7fa8, 0x6a9a58, 0xb85a4a, 0x7a6aa8, 0x3f7a78, 0xd0a040];
  const BLOOMS = [0xff8aa0, 0xffd24a, 0xfff4f8, 0xe8604e, 0xc8a0ff, 0xff9f5a];
  const WOOD = 0x6f5138, WOOD_L = 0x8f6c48, WOOD_D = 0x4f3a27;

  // Local (lx along the wall, ly up, lz outward) -> placement on a wall whose
  // outward normal is yaw `ry` (0 = +Z), anchored at (x, y, z).
  function onWall(src, x, y, z, ry, lx, ly, lz, o = {}) {
    const c = Math.cos(ry), sn = Math.sin(ry);
    return piece(src, { ...o, t: [x + lx * c + lz * sn, y + ly, z - lx * sn + lz * c], r: [o.rx ?? 0, ry, o.rz ?? 0] });
  }

  // A window: frame, pane (-> glow), mullion cross, open shutters, flower box.
  function windowPieces(out, glow, { x, y, z, ry = 0, w = 0.62, h = 0.62, shutter = null, box = true, bloom = [0xff8aa0, 0xfff4f8], seed = 1 }) {
    const fr = onWall(rboxG(w + 0.14, h + 0.14, 0.08, 0.03, 1), x, y, z, ry, 0, 0, 0.01);
    tintG(fr, WOOD_L, 0.03, seed, 0.2);
    out.push(fr);
    glow.push(onWall(boxG(w, h, 0.04), x, y, z, ry, 0, 0, 0.035));
    const mv = onWall(boxG(0.045, h, 0.04), x, y, z, ry, 0, 0, 0.065);
    const mh = onWall(boxG(w, 0.045, 0.04), x, y, z, ry, 0, 0.02, 0.065);
    tintG(mv, WOOD, 0.02, seed + 1, 0.2); tintG(mh, WOOD, 0.02, seed + 2, 0.2);
    out.push(mv, mh);
    if (shutter != null) {
      for (const sd of [-1, 1]) {
        const sh = onWall(rboxG(w * 0.52, h + 0.1, 0.045, 0.018, 1), x, y, z, ry, sd * (w / 2 + 0.07 + w * 0.26), 0, 0.03);
        ramp(sh, lerpColorHex(shutter, 0x1a1a24, 0.25), shutter, y - h / 2, y + h / 2, { noise: 0.02, seed: seed + sd, lift: 0.2 });
        out.push(sh);
        const slat = onWall(boxG(w * 0.4, 0.035, 0.02), x, y, z, ry, sd * (w / 2 + 0.07 + w * 0.26), 0.02, 0.058);
        tintG(slat, lerpColorHex(shutter, 0xffffff, 0.25), 0.02, seed + sd * 3, 0.2);
        out.push(slat);
      }
    }
    if (box) {
      const by = -h / 2 - 0.16;
      const bx = onWall(rboxG(w + 0.24, 0.2, 0.24, 0.035, 1), x, y, z, ry, 0, by, 0.13);
      ramp(bx, WOOD_D, WOOD, y + by - 0.1, y + by + 0.1, { noise: 0.03, seed: seed + 5, lift: 0.3 });
      out.push(bx);
      const r3 = seededRandom(seed * 7 + 11);
      const n = 6;
      for (let i = 0; i < n; i++) { // leafy cushion + blooms spilling over the box
        const lx = (i / (n - 1) - 0.5) * (w + 0.1);
        const leaf = onWall(sphereG(1, 6, 4), x, y, z, ry, lx, by + 0.12, 0.14 + (r3() - 0.5) * 0.06, { s: [0.09, 0.07, 0.08] });
        tintG(leaf, lerpColorHex(0x4c8c40, 0x6aa850, r3()), 0.02, seed + i, 0.15);
        out.push(leaf);
        const bl = onWall(sphereG(1, 5, 4), x, y, z, ry, lx + (r3() - 0.5) * 0.06, by + 0.17 + r3() * 0.04, 0.16 + (r3() - 0.5) * 0.08, { s: 0.052 });
        tintG(bl, bloom[i % bloom.length], 0.02, seed + i + 9, 0.1);
        out.push(bl);
      }
    }
  }

  // Door: dark recess, plank leaf, frame, stone step, little hooded canopy on
  // brackets, and a lantern beside it (-> glow).
  function doorPieces(out, glow, { x, y0, z, ry = 0, w = 0.8, h = 1.45, seed = 1, lantern = 1, hood = true }) {
    const rec = onWall(boxG(w + 0.12, h + 0.08, 0.06), x, y0 + h / 2, z, ry, 0, 0, 0.0);
    tintG(rec, 0x3a2c1e, 0.02, seed, 0);
    out.push(rec);
    const leaf = onWall(rboxG(w, h, 0.07, 0.03, 1), x, y0 + h / 2 - 0.02, z, ry, 0, 0, 0.03);
    ramp(leaf, 0x6a4a2e, 0x96704a, y0, y0 + h, { noise: 0.04, seed: seed + 1, lift: 0.2 });
    out.push(leaf);
    for (const px of [-0.2, 0.2]) { // plank seams
      const sm = onWall(boxG(0.025, h - 0.1, 0.02), x, y0 + h / 2, z, ry, px * w, 0, 0.07);
      tintG(sm, 0x4a3522, 0.02, seed + px * 9, 0);
      out.push(sm);
    }
    const knob = onWall(sphereG(1, 6, 4), x, y0 + h * 0.48, z, ry, w * 0.34, 0, 0.09, { s: 0.045 });
    tintG(knob, 0xd8b460, 0.02, seed, 0.1);
    out.push(knob);
    for (const sd of [-1, 1]) {
      const jamb = onWall(boxG(0.1, h + 0.08, 0.1), x, y0 + h / 2, z, ry, sd * (w / 2 + 0.05), 0, 0.03);
      tintG(jamb, WOOD, 0.03, seed + sd, 0.2);
      out.push(jamb);
    }
    const lin = onWall(rboxG(w + 0.34, 0.12, 0.12, 0.03, 1), x, y0 + h + 0.06, z, ry, 0, 0, 0.04);
    tintG(lin, WOOD, 0.03, seed + 4, 0.2);
    out.push(lin);
    const step = onWall(rboxG(w + 0.4, 0.16, 0.5, 0.05, 1), x, y0 - 0.02, z, ry, 0, -0.06, 0.26);
    ramp(step, 0x8a867c, 0xb0ada2, y0 - 0.2, y0 + 0.1, { noise: 0.03, seed: seed + 5, lift: 0.3 });
    out.push(step);
    if (hood) { // tiny sloped canopy over the door
      const hd = onWall(rboxG(w + 0.5, 0.08, 0.62, 0.035, 1), x, y0 + h + 0.3, z, ry, 0, 0, 0.3, { rx: 0.42 });
      ramp(hd, 0x7e3a2e, 0xb65a44, y0 + h + 0.1, y0 + h + 0.5, { noise: 0.03, seed: seed + 6, lift: 0.2 });
      out.push(hd);
      for (const sd of [-1, 1]) {
        const br = onWall(boxG(0.06, 0.06, 0.5), x, y0 + h + 0.12, z, ry, sd * (w / 2 + 0.16), 0, 0.22, { rx: -0.55 });
        tintG(br, WOOD_D, 0.02, seed + sd * 2, 0.2);
        out.push(br);
      }
    }
    for (const side of (Array.isArray(lantern) ? lantern : lantern ? [lantern] : [])) {
      const lx = (w / 2 + 0.34) * side;
      const arm = onWall(boxG(0.05, 0.05, 0.28), x, y0 + h + 0.02, z, ry, lx, 0, 0.14);
      tintG(arm, 0x2e2a28, 0.02, seed, 0);
      out.push(arm);
      const cap = onWall(coneG(0.12, 0.1, 4), x, y0 + h - 0.04, z, ry, lx, 0, 0.28, { rz: 0 });
      tintG(cap, 0x2e2a28, 0.02, seed + 1, 0.1);
      out.push(cap);
      glow.push(onWall(rboxG(0.13, 0.18, 0.13, 0.03, 1), x, y0 + h - 0.18, z, ry, lx, 0, 0.28));
    }
  }

  // Roof: gable-end wall triangles, two thick rounded slabs carrying shingle
  // courses (each course's lower edge kicks up — a stepped, handmade eave
  // line), and a rounded ridge cap. Ridge along local X; wall half-depth hd;
  // slab undersides meet the wall tops at yTop.
  function roofPieces(out, { L, hd, yTop, pitch = 0.72, over = 0.34, gover = 0.28, t = 0.16, courses = 5, pal, wallHex, seed = 1 }) {
    const tan = Math.tan(pitch), cos = Math.cos(pitch);
    const rise = hd * tan;
    out.push(gableG({ L: L - 0.02, halfW: hd + 0.02, roofH: rise, y: yTop, dark: wallHex, light: wallHex, wall: wallHex, seed }));
    const S = (hd + over) / cos;
    const mid = yTop + rise + (t / 2) / cos;
    const lo = yTop - over * tan - 0.25, hi = mid + t;
    for (const side of [1, -1]) {
      const slab = piece(rboxG(L + gover * 2, t, S, Math.min(0.06, t * 0.45), 1), {});
      slab.translate(0, 0, side * S / 2);
      slab.rotateX(side * pitch);
      slab.translate(0, mid, 0);
      ramp(slab, lerpColorHex(pal.dark, 0x000000, 0.2), pal.dark, lo, hi, { noise: 0.02, seed: seed + side, lift: 0.1 });
      out.push(slab);
      const cw = S / courses;
      for (let i = 0; i < courses; i++) {
        const c = piece(rboxG(L + gover * 2 + 0.03, t * 0.4, cw + 0.08, 0.028, 1), {});
        c.rotateX(-side * 0.075);
        c.translate(0, t * 0.5 + t * 0.2 + 0.012, side * (i + 0.5) * cw);
        c.rotateX(side * pitch);
        c.translate(0, mid, 0);
        const k = (i % 2 ? 0.93 : 1.04) * (1 + hashN(i, side, seed, 3) * 0.03);
        ramp(c, lerpColorHex(pal.dark, 0x000000, 0.06), pal.light, lo, hi, { noise: 0.025, seed: seed + i * 3 + side, exp: 0.9, lift: 0.12 });
        const col = c.attributes.color;
        for (let j = 0; j < col.count; j++) col.setXYZ(j, col.getX(j) * k, col.getY(j) * k, col.getZ(j) * k);
        out.push(c);
      }
    }
    const rc = piece(cylG(t * 0.62, t * 0.62, L + gover * 2 + 0.06, 12), { t: [0, mid + t * 0.62 / cos, 0], r: [0, 0, Math.PI / 2], sh: 'smooth' });
    tintG(rc, pal.ridge, 0.02, seed + 9, 0.15);
    out.push(rc);
    return { mid, rise, S, top: mid + t / 2 / cos };
  }

  // Stone chimney with a cap (poke it through a roof slab); returns top y.
  function chimneyPieces(out, { x, z, y0, h, w = 0.46, seed = 1 }) {
    const ch = piece(rboxG(w, h, w, 0.04, 1), { t: [x, y0 + h / 2, z] });
    ramp(ch, 0x857a70, 0xb3a69a, y0, y0 + h, { noise: 0.04, seed, lift: 0.3 });
    out.push(ch);
    for (let i = 0; i < 3; i++) { // stone courses
      const b = piece(boxG(w + 0.02, 0.04, w + 0.02), { t: [x, y0 + h * (0.35 + i * 0.22), z] });
      tintG(b, 0x76695f, 0.03, seed + i, 0.25);
      out.push(b);
    }
    const cap = piece(rboxG(w + 0.14, 0.12, w + 0.14, 0.035, 1), { t: [x, y0 + h + 0.04, z] });
    tintG(cap, 0x5e544c, 0.03, seed + 5, 0.2);
    out.push(cap);
    const pot = piece(cylG(0.09, 0.11, 0.2, 8), { t: [x + 0.06, y0 + h + 0.2, z - 0.04], sh: 'smooth' });
    tintG(pot, 0xb0643e, 0.03, seed + 6, 0.2);
    out.push(pot);
    return y0 + h + 0.3;
  }

  // The small cottage (house_small / house_stilt): returns merged body + glow
  // geometries. `lift` raises it onto a plank deck; `stilts` adds the posts,
  // deck, ladder and mooring post for a house standing in the shallows.
  function cottageGeo(vs, vi, lift = 0, stilts = false) {
    const pal = ROOFS[[0, 1, 3, 2][vi]], wall = WALLS[vi];
    const shutter = SHUTTERS[(vi * 2 + 1) % SHUTTERS.length];
    const bloom = [BLOOMS[vi % BLOOMS.length], BLOOMS[(vi + 2) % BLOOMS.length], 0xfff4f8];
    const glowL = [];
    const g = merged(`cot${vs}_${lift}`, () => {
      const r2 = seededRandom(vs + 1);
      const out = [];
      const fo = piece(rboxG(3.62, 0.5, 3.12, 0.08, 1), { t: [0, 0.2, 0] });
      if (stilts) ramp(fo, 0x6a4c33, 0x8f6c48, -0.05, 0.46, { noise: 0.03, seed: vs, lift: 0.3 });
      else { ramp(fo, 0x77736a, 0xa29e93, -0.05, 0.46, { noise: 0.04, seed: vs, lift: 0.3 }); mossify(fo, { amount: 0.3, seed: vs % 89 }); }
      out.push(fo);
      const w = piece(boxG(3.4, 2.0, 2.9), { t: [0, 1.38, 0] });
      ramp(w, wall.lo, wall.hi, 0.38, 2.4, { noise: 0.02, seed: vs + 1, lift: 0.35 });
      out.push(w);
      for (const [px, pz] of [[-1.69, 1.44], [1.69, 1.44], [-1.69, -1.44], [1.69, -1.44]]) {
        const post = piece(boxG(0.14, 2.02, 0.14), { t: [px, 1.37, pz] });
        ramp(post, WOOD, WOOD_L, 0.4, 2.4, { noise: 0.03, seed: vs + px + pz, lift: 0.25 });
        out.push(post);
      }
      const lintel = piece(boxG(3.44, 0.13, 0.13), { t: [0, 2.3, 1.44] });
      tintG(lintel, WOOD, 0.03, vs + 3, 0.25);
      out.push(lintel);
      roofPieces(out, { L: 3.42, hd: 1.46, yTop: 2.37, pitch: 0.72, pal, wallHex: lerpColorHex(wall.hi, wall.lo, 0.3), seed: vs });
      doorPieces(out, glowL, { x: 0.6, y0: 0.42, z: 1.45, seed: vs + 20, lantern: -1 });
      windowPieces(out, glowL, { x: -0.72, y: 1.45, z: 1.45, shutter, bloom, seed: vs + 30 });
      windowPieces(out, glowL, { x: 1.7, y: 1.45, z: -0.45, ry: Math.PI / 2, shutter, bloom, seed: vs + 40 });
      windowPieces(out, glowL, { x: -1.7, y: 1.5, z: 0.3, ry: -Math.PI / 2, w: 0.5, h: 0.5, shutter: null, box: false, seed: vs + 50 });
      chimneyPieces(out, { x: -1.0, z: -0.5, y0: 2.3, h: 1.85, seed: vs + 60 });
      if (!stilts) out.push(...tuftPieces(r2, { n: 6, R: 1.95, seed: vs + 10 }));
      if (lift) { for (const pc of out) pc.translate(0, lift, 0); for (const pc of glowL) pc.translate(0, lift, 0); }
      if (stilts) {
        const deck = piece(rboxG(4.6, 0.16, 4.4, 0.04, 1), { t: [0, lift - 0.02, 0.45] });
        ramp(deck, 0x7a5a3a, 0xa8845c, lift - 0.1, lift + 0.08, { noise: 0.03, seed: vs + 70, lift: 0.2 });
        out.push(deck);
        for (let i = 0; i < 7; i++) { // plank seams on the porch
          const sm = piece(boxG(4.62, 0.02, 0.03), { t: [0, lift + 0.07, 1.75 + i * 0.12 - 0.36] });
          tintG(sm, 0x5a4029, 0.02, vs + i, 0);
          if (i % 3 === 0) out.push(sm);
        }
        for (const [px, pz] of [[-2.15, -1.7], [2.15, -1.7], [-2.15, 2.5], [2.15, 2.5], [0, -1.7], [0, 2.5], [-2.15, 0.4], [2.15, 0.4]]) {
          const st = piece(cylG(0.11, 0.13, lift + 3.2, 8), { t: [px, (lift - 3.2) / 2, pz], sh: 'smooth' });
          ramp(st, 0x2e2620, 0x6b4a33, -1.5, lift, { noise: 0.03, seed: vs + px * 3 + pz, lift: 0.2 });
          out.push(st);
        }
        for (const sd of [-1, 1]) { // porch rail
          const rl = piece(rboxG(0.06, 0.06, 1.9, 0.02, 1), { t: [sd * 2.25, lift + 0.8, 1.6] });
          tintG(rl, WOOD, 0.02, vs + sd, 0.2);
          out.push(rl);
          const rp = piece(rboxG(0.08, 0.85, 0.08, 0.02, 1), { t: [sd * 2.25, lift + 0.4, 2.55] });
          tintG(rp, WOOD, 0.02, vs + sd * 2, 0.2);
          out.push(rp);
        }
        for (let k = 0; k < 5; k++) { // ladder down to the water
          const rung = piece(boxG(0.5, 0.05, 0.06), { t: [1.2, lift - 0.25 - k * 0.3, 2.66] });
          tintG(rung, WOOD, 0.02, vs + k, 0.2);
          out.push(rung);
        }
        for (const sd of [-1, 1]) {
          const lr = piece(boxG(0.06, 1.7, 0.06), { t: [1.2 + sd * 0.25, lift - 0.8, 2.66] });
          tintG(lr, WOOD_D, 0.02, vs + sd, 0.2);
          out.push(lr);
        }
      }
      return out;
    });
    const gl = merged(`cotG${vs}_${lift}`, () => glowL);
    return { g, gl };
  }

  // ------------------------------------------------ chimney smoke (one draw)
  // Soft grey puffs rising, swelling and fading from every chimney in the
  // zone — a single Points object, positions updated in place per frame.
  let smoke = null;
  function addChimneySmoke(x, y, z, s) {
    if (!smoke) smoke = makeSmoke();
    smoke.add(x, y, z, s);
  }
  function makeSmoke() {
    const CAP = 32, PER = 7, N = CAP * PER;
    const posA = new Float32Array(N * 3), lifeA = new Float32Array(N), seedA = new Float32Array(N);
    const src = []; // chimney tops
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(posA, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(lifeA, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seedA, 1));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uColor: { value: new THREE.Color(0xeeeae4) }, uAlpha: { value: 0.34 }, uSize: { value: 780 },
      }]),
      vertexShader: `
        attribute float aLife; attribute float aSeed;
        varying float vLife; varying float vSeed;
        uniform float uSize;
        #include <fog_pars_vertex>
        void main(){
          vLife = aLife; vSeed = aSeed;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (0.55 + aLife * 1.25) * (0.8 + 0.4 * fract(aSeed * 7.13)) / max(1.0, -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uAlpha;
        varying float vLife; varying float vSeed;
        #include <fog_pars_fragment>
        void main(){
          vec2 q = gl_PointCoord - 0.5;
          float d = length(q + 0.08 * vec2(sin(vSeed * 9.0), cos(vSeed * 7.0)) * (1.0 - length(q) * 2.0));
          float a = smoothstep(0.5, 0.12, d) * uAlpha * smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
          vec3 col = uColor * (0.9 + 0.1 * (1.0 - vLife));
          gl_FragColor = vec4(col, a);
          #include <fog_fragment>
        }`,
    });
    disposables.push({ mat: m }, { geo: g });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = 2;
    group.add(pts);
    const r = seededRandom(seed * 3 + 17);
    let t = 0;
    updaters.push((dt) => {
      t += dt;
      const day = daylight(G.calendar?.dayTime ?? 0.5);
      m.uniforms.uColor.value.setRGB(0.36 + 0.57 * day, 0.37 + 0.55 * day, 0.42 + 0.47 * day);
      m.uniforms.uAlpha.value = 0.18 + 0.12 * day;
      for (let c = 0; c < src.length; c++) {
        const s0 = src[c];
        for (let k = 0; k < PER; k++) {
          const i = c * PER + k;
          let l = lifeA[i] + dt * 0.16 * (0.85 + 0.3 * seedA[i]);
          if (l > 1) l -= 1;
          lifeA[i] = l;
          const sway = Math.sin(t * 0.7 + seedA[i] * 6.0) * 0.25;
          posA[i * 3] = s0.x + (0.9 * l * l + sway * l) * s0.s;
          posA[i * 3 + 1] = s0.y + l * 2.6 * s0.s;
          posA[i * 3 + 2] = s0.z + (0.35 * l + Math.cos(t * 0.5 + seedA[i] * 4.0) * 0.12 * l) * s0.s;
        }
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.aLife.needsUpdate = true;
    });
    return {
      add(x, y, z, s) {
        if (src.length >= CAP) return;
        const c = src.length;
        src.push({ x, y, z, s });
        for (let k = 0; k < PER; k++) {
          const i = c * PER + k;
          lifeA[i] = k / PER + r() * 0.08;
          seedA[i] = r();
          posA[i * 3] = x; posA[i * 3 + 1] = y; posA[i * 3 + 2] = z;
        }
        g.setDrawRange(0, src.length * PER);
        g.attributes.aSeed.needsUpdate = true;
      },
    };
  }
  // world position of a local offset on a placed prop (yaw about +Y, uniform s)
  const localToWorld = (x, y, z, s, yaw, lx, ly, lz) => {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    return [x + (lx * c + lz * sn) * s, y + ly * s, z + (-lx * sn + lz * c) * s];
  };

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
  // Water covers only its own square (pos ± size/2); low ground elsewhere is dry.
  const inWater = (x, z) => {
    if (!water) return false;
    const hw = (water.size ?? 0) / 2 + 0.5, wp = water.pos ?? [0, 0];
    if (Math.abs(x - wp[0]) > hw || Math.abs(z - wp[1]) > hw) return false;
    return terrainY(x, z) < (water.level ?? 0) + 0.12;
  };

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
      make: (rng, v, singles) => {
        const vs = Math.floor(rng() * 1e6);
        const lean = (rng() - 0.5) * 0.18;
        const det = singles ? LOD : 1; // hero placements get the rounder lobes
        const g = merged(`oakM${vs}_${det}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const tr = trunkG({ h: 2.0, r0: 0.3, r1: 0.13, lean, flare: 0.7, seed: vs, segs: 8 });
          ramp(tr, 0x684a2f, 0x9a7852, 0, 2.0, { noise: 0.04, seed: vs });
          pieces.push(tr);
          for (let i = 0; i < 3; i++) { // root nubs
            const a = (i / 3) * TAU + r2() * 1.2;
            const rn = piece(coneG(0.12, 0.4, 6), {
              t: [Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3],
              r: [Math.sin(a) * 1.15, r2() * TAU, -Math.cos(a) * 1.15], sh: 'smooth',
            });
            ramp(rn, 0x5c432b, 0x77583b, 0, 0.4, { seed: vs + i });
            pieces.push(rn);
          }
          for (let i = 0; i < 2; i++) { // limbs reaching into the crown
            const s = i ? -1 : 1;
            const br = piece(cylG(0.05, 0.1, 1.05, 6), {
              t: [lean * 2 + s * 0.34, 2.2, (i ? -0.12 : 0.1)], r: [0.2 * s, 0, -0.85 * s], sh: 'smooth',
            });
            ramp(br, 0x6f5236, 0x8c6a47, 1.8, 2.8, { seed: vs + i });
            pieces.push(br);
          }
          const cn = canopyPieces(r2, { k: 6, cy: 2.8, R: 1.32, spread: 0.8, squash: 0.8, seed: vs, detail: det });
          for (const c of cn.pieces) c.translate(lean * 1.7, 0, 0);
          paintCanopy(cn, 0x3f7c38, 0xaadd66, { seed: vs, sun: 0xe2f48e });
          pieces.push(...cn.pieces);
          return pieces;
        });
        return [V(g, FOLIAGE_V, [0.09, 0.09]), shadowP(1.8)];
      },
    },
    tree_pine: {
      variants: 3, collider: 0.5, cluster: true,
      make: (rng, v, singles) => {
        const vs = Math.floor(rng() * 1e6);
        const det = singles ? LOD : 1;
        const g = merged(`pineM${vs}_${det}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const tr = trunkG({ h: 1.7, r0: 0.22, r1: 0.09, lean: (r2() - 0.5) * 0.08, flare: 0.55, seed: vs });
          ramp(tr, 0x5a3f24, 0x85613f, 0, 1.7, { noise: 0.04, seed: vs });
          pieces.push(tr);
          // Soft tiers: each is a drooping skirt (lathe profile) — rounded
          // shoulder, scalloped hem, smooth shading; the hem edge stays crisp
          // so the tiers still read.
          let y = 1.2, r = 1.36;
          const tiers = [];
          const segs = det > 1 ? 14 : 9;
          for (let i = 0; i < 4; i++) {
            const h = 1.5 - i * 0.17;
            const pts = [];
            for (let j = 0; j <= 6; j++) {
              const t = j / 6;
              // radius: wide soft hem -> tip; slight belly for fullness
              const rr = r * Math.pow(1 - t, 0.85) * (1 + 0.1 * Math.sin(t * Math.PI));
              pts.push(new THREE.Vector2(Math.max(0.001, rr), -h * 0.12 * Math.sin((1 - t) * Math.PI * 0.5) * (j === 0 ? 1 : 0.4) + t * h));
            }
            pts.unshift(new THREE.Vector2(0.001, 0)); // close the underside
            const lg = new THREE.LatheGeometry(pts, segs);
            const pp = lg.attributes.position;
            const tw = r2() * TAU;
            for (let k2 = 0; k2 < pp.count; k2++) { // scallop the hem, gentle twist
              const px = pp.getX(k2), py = pp.getY(k2), pz = pp.getZ(k2);
              const ang = Math.atan2(pz, px);
              const hem = clamp(1 - py / (h * 0.45), 0, 1);
              const f = 1 + 0.09 * Math.sin(ang * 7 + tw) * hem;
              pp.setXYZ(k2, px * f, py - 0.06 * hem * (0.5 + 0.5 * Math.sin(ang * 7 + tw)), pz * f);
            }
            const tier = piece(lg, {
              t: [(r2() - 0.5) * 0.12, y, (r2() - 0.5) * 0.12],
              r: [(r2() - 0.5) * 0.06, r2() * TAU, (r2() - 0.5) * 0.06], sh: 'soft',
            });
            lg.dispose();
            tiers.push(tier);
            y += h * 0.6;
            r *= 0.72;
          }
          const hi = y + 0.9;
          for (const c of tiers) ramp(c, 0x2f6a45, 0x79c276, 1.0, hi, { noise: 0.03, seed: vs, exp: 1.15, lift: 0.18 });
          pieces.push(...tiers);
          return pieces;
        });
        return [V(g, FOLIAGE2_V, [0.08, 0.05]), shadowP(1.45)];
      },
    },
    tree_birch: {
      variants: 3, collider: 0.32, cluster: true,
      make: (rng, v, singles) => {
        const vs = Math.floor(rng() * 1e6);
        const lean = (rng() - 0.5) * 0.2;
        const det = singles ? LOD : 1;
        const g = merged(`birchM${vs}_${det}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const h = 2.6;
          const tr = trunkG({ h, r0: 0.13, r1: 0.06, lean, flare: 0.5, seed: vs, segs: 7 });
          ramp(tr, 0xc4bdad, 0xf0ebdc, 0, h, { noise: 0.03, seed: vs });
          pieces.push(tr);
          for (let i = 0; i < 4; i++) { // bark scars hug the leaning trunk
            const t = 0.18 + i * 0.2 + r2() * 0.06;
            const ry = t * h;
            const rr = lerp(0.125, 0.062, t) * 1.1;
            const band = piece(cylG(rr, rr * 1.06, 0.06 + r2() * 0.04, 7), {
              t: [lean * t * t * h, ry, 0], r: [0, r2() * TAU, (r2() - 0.5) * 0.2], s: [1, 1, 0.8],
            });
            tintG(band, i % 2 ? 0x4a463f : 0x5e5850, 0.04, vs + i);
            pieces.push(band);
          }
          const cn = canopyPieces(r2, { k: 5, cy: 2.95, R: 0.88, spread: 0.72, squash: 0.9, seed: vs + 5, detail: det });
          for (const c of cn.pieces) c.translate(lean * 2.1, 0, 0);
          paintCanopy(cn, 0x659e44, 0xc8e886, { seed: vs, sun: 0xf0f8a4 });
          pieces.push(...cn.pieces);
          return pieces;
        });
        return [V(g, FOLIAGE_V, [0.08, 0.06]), shadowP(1.1)];
      },
    },
    tree_willow: {
      variants: 2, collider: 0.6,
      make: (rng, v, singles) => {
        const vs = Math.floor(rng() * 1e6);
        const det = singles ? LOD : 1;
        const g = merged(`willowM${vs}_${det}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const tr = trunkG({ h: 1.8, r0: 0.32, r1: 0.16, lean: 0.16, flare: 0.75, seed: vs, segs: 8 });
          ramp(tr, 0x684e32, 0x94744f, 0, 1.8, { noise: 0.04, seed: vs });
          pieces.push(tr);
          const cn = canopyPieces(r2, { k: 5, cy: 2.5, R: 1.45, spread: 0.62, squash: 0.62, seed: vs, detail: det });
          for (const c of cn.pieces) c.translate(0.28, 0, 0);
          paintCanopy(cn, 0x467e40, 0xa2d474, { seed: vs, sun: 0xd8f094 });
          pieces.push(...cn.pieces);
          return pieces;
        });
        // Hanging frond curtain — narrow tapered strands (a soft vertical
        // fold in each), one merged double-sided swaying set.
        const gf = merged(`willowF${vs}_${det}`, () => {
          const r2 = seededRandom(vs + 3);
          const pieces = [];
          const n = det > 1 ? 22 : 15;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + r2() * 0.3;
            const len = 1.4 + r2() * 1.0;
            const rad = 1.35 + r2() * 0.4;
            const strand = new THREE.PlaneGeometry(0.16, 1, 1, 3);
            const sp = strand.attributes.position;
            for (let k2 = 0; k2 < sp.count; k2++) { // taper toward the tip + curl outward
              const v = sp.getY(k2) + 0.5; // 0 tip .. 1 root
              sp.setX(k2, sp.getX(k2) * (0.35 + 0.65 * v));
              sp.setZ(k2, (1 - v) * (1 - v) * 0.22);
            }
            const p = piece(strand, {
              t: [Math.cos(a) * rad + 0.28, 2.2 - len / 2, Math.sin(a) * rad],
              s: [1, len, 1], r: [0.1 * (r2() - 0.2), -a + Math.PI / 2, 0], sh: 'smooth',
            });
            strand.dispose();
            ramp(p, 0x6fb258, 0x4c8a48, 2.3 - len, 2.3, { noise: 0.03, seed: vs + i, exp: 0.8, lift: 0.1 });
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
            const b = piece(cylG(0.02, 0.07, len, 5), {
              t: [Math.cos(a) * 0.32, y0, Math.sin(a) * 0.32],
              r: [Math.sin(a) * (0.8 + r2() * 0.5), 0, -Math.cos(a) * (0.8 + r2() * 0.5)],
              jit: 0.02, jseed: vs + i, sh: 'smooth',
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
      make: (rng, v, singles) => {
        const vs = Math.floor(rng() * 1e6);
        const det = singles ? LOD : 1;
        const g = merged(`glowM${vs}_${det}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const tr = trunkG({ h: 2.0, r0: 0.26, r1: 0.12, lean: (r2() - 0.5) * 0.14, flare: 0.65, seed: vs, segs: 8 });
          ramp(tr, 0x414a68, 0x6a769c, 0, 2.0, { noise: 0.04, seed: vs });
          pieces.push(tr);
          const cn = canopyPieces(r2, { k: 5, cy: 2.65, R: 1.18, spread: 0.75, squash: 0.8, seed: vs, detail: det });
          paintCanopy(cn, 0x2d6660, 0x62a896, { seed: vs, sun: 0x9fe0c4 });
          pieces.push(...cn.pieces);
          return pieces;
        });
        const parts = [V(g, FOLIAGE2_V, [0.07, 0.04]), shadowP(1.5)];
        // glowing fruit hang just under the crown's rim (merged: one draw)
        const gfr = merged(`glowFr${vs}`, () => {
          const r3 = seededRandom(vs + 7);
          const out = [];
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * TAU + r3() * 0.6, r = 0.7 + r3() * 0.55;
            const y = 2.1 + r3() * 0.7;
            out.push(piece(sphereG(1, 8, 6), { t: [Math.cos(a) * r, y, Math.sin(a) * r], s: [0.1, 0.12, 0.1] }));
          }
          return out;
        });
        const fp = P(gfr, GLOW_FRUIT, 0xffe9b0, [0, 0, 0], 1, [0, 0, 0], 0, false);
        parts.push(fp);
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
          const stem = trunkG({ h: 1.7, r0: 0.44, r1: 0.3, lean: 0.09, flare: 0.5, seed: vs, segs: 10 });
          ramp(stem, 0xd2c4a8, 0xf4ecda, 0, 1.7, { noise: 0.03, seed: vs });
          pieces.push(stem);
          // umbrella underside: a shallow bowl from the rim down to the stem,
          // gill lines painted radially
          const gills = piece(geo(`gillbowl${HI}`, () => new THREE.CylinderGeometry(1.5, 0.38, 0.2, HI ? 40 : 24, 1, true)),
            { t: [0.14, 1.46, 0], sh: 'smooth' });
          ramp(gills, 0xcdbd9c, 0xf2e8d2, 1.36, 1.56, { noise: 0.02, seed: vs + 2 });
          {
            const gp = gills.attributes.position, gc = gills.attributes.color;
            for (let i = 0; i < gp.count; i++) {
              const ang = Math.atan2(gp.getZ(i), gp.getX(i) - 0.14);
              const k = 0.9 + 0.1 * Math.cos(ang * (HI ? 20 : 12));
              gc.setXYZ(i, gc.getX(i) * k, gc.getY(i) * k, gc.getZ(i) * k);
            }
          }
          pieces.push(gills);
          // domed cap with a lip that curls just past the equator
          const cap = piece(geo(`mcap${HI}`, () => new THREE.SphereGeometry(1, HI ? 22 : 14, HI ? 10 : 7, 0, TAU, 0, Math.PI * 0.55)),
            { t: [0.14, 1.68, 0], s: [1.55, 0.85, 1.55], jit: 0.025, jseed: vs, sh: 'smooth' });
          ramp(cap, lerpColorHex(capHex, 0x40202c, 0.08), lerpColorHex(capHex, 0xffe0d0, 0.3), 1.5, 2.55,
            { noise: 0.03, seed: vs, exp: 0.85 });
          pieces.push(cap);
          for (let i = 0; i < 7; i++) { // pale spots hugging the dome
            const a = r2() * TAU, rr = 0.35 + r2() * 0.85;
            const sp = piece(sphereG(0.12, 8, 5), {
              t: [0.14 + Math.cos(a) * rr, 1.69 + 0.85 * Math.sqrt(Math.max(0, 1 - (rr / 1.55) ** 2)), Math.sin(a) * rr],
              s: [1 + r2() * 0.5, 0.45, 1 + r2() * 0.5],
            });
            tintG(sp, 0xfaf4e8, 0.02, vs + i);
            pieces.push(sp);
          }
          return pieces;
        });
        return [V(g, SOLID_V, [0.06, 0.04]), shadowP(1.5)];
      },
    },
    mushroom_cluster: {
      variants: 3, noShadow: true, collider: 0, noPathAvoid: true,
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
            const stem = piece(cylG(0.05 * s, 0.085 * s, 0.3 * s, 7), { t: [x, 0.14 * s, z], r: [0, 0, lean] });
            ramp(stem, 0xd2c4a8, 0xf4ecda, 0, 0.3 * s, { seed: vs + i });
            pieces.push(stem);
            const cap = piece(geo('mcapS', () => new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI * 0.62)), {
              t: [x - lean * 0.3 * s, 0.29 * s, z], s: [0.16 * s, 0.13 * s, 0.16 * s], sh: 'smooth',
            });
            ramp(cap, lerpColorHex(capHex, 0x3c2030, 0.18), lerpColorHex(capHex, 0xffe8d8, 0.3),
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
        const blossom = rng() > 0.6; // some bushes carry tiny blossoms
        const g = merged(`bushM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const cn = canopyPieces(r2, { k: 5, cy: 0.46, R: 0.62, spread: 0.85, squash: 0.74, seed: vs, detail: 1, amp: 0.14, drop: 0.55 });
          paintCanopy(cn, 0x4a8840, 0x9ad664, { seed: vs, sun: 0xd8f08c });
          const out = [...cn.pieces];
          if (blossom) {
            const pet = [0xfff4f8, 0xffc4d4, 0xfff0a8][Math.floor(r2() * 3)];
            for (let i = 0; i < 9; i++) { // dots sitting on the upper surface
              const a = r2() * TAU, b = r2() * 1.0;
              const d = piece(sphereG(1, 6, 4), {
                t: [Math.sin(b) * Math.cos(a) * 0.7, 0.62 + Math.cos(b) * 0.36, Math.sin(b) * Math.sin(a) * 0.7], s: 0.055,
              });
              tintG(d, pet, 0.02, vs + i, 0);
              out.push(d);
            }
          }
          return out;
        });
        return [V(g, FOLIAGE_V, [0.09, 0.07]), shadowP(0.75, 0.04)];
      },
    },
    berry_bush: {
      variants: 2, collider: 0.4,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`berryM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const cn = canopyPieces(r2, { k: 5, cy: 0.44, R: 0.58, spread: 0.8, squash: 0.78, seed: vs, detail: 1, amp: 0.14, drop: 0.55 });
          paintCanopy(cn, 0x3b7539, 0x7dbb58, { seed: vs, sun: 0xc8e886 });
          return cn.pieces;
        });
        // berries: one merged cluster geometry (was 8 separate draws)
        const gb = merged(`berryB${vs}`, () => {
          const r3 = seededRandom(vs + 5);
          const out = [];
          for (let i = 0; i < 14; i++) {
            const a = r3() * TAU, b = 0.25 + r3() * 0.45 * Math.PI;
            out.push(piece(sphereG(1, 7, 5), {
              t: [Math.sin(b) * Math.cos(a) * 0.64, 0.44 + Math.cos(b) * 0.44, Math.sin(b) * Math.sin(a) * 0.64], s: 0.055,
            }));
          }
          return out;
        });
        return [V(g, FOLIAGE_V, [0.08, 0.05]), P(gb, BERRY, 0xd83a4a, [0, 0, 0], 1, [0, 0, 0], 0, false), shadowP(0.72, 0.04)];
      },
    },
    flower_patch: {
      variants: 4, noShadow: true, collider: 0, noPathAvoid: true, pathRing: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`flowM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          // each patch leans on a 2-3 color harmony instead of confetti
          const HARM = [
            [0xfff6fa, 0xffd94f, 0xffc4d6], [0xff9fb0, 0xfff0f4, 0xffb85c], [0xb8b0ff, 0xfff6fa, 0xe6c8ff],
            [0xffd24a, 0xffa94f, 0xfff4d0], [0xff8aa0, 0xd8a8ff, 0xfff6fa],
          ];
          const petals = HARM[Math.floor(r2() * HARM.length)];
          const pieces = [];
          const n = 5 + Math.floor(r2() * 3);
          for (let i = 0; i < n; i++) {
            const a = r2() * TAU, r = 0.12 + r2() * 0.55, s = 0.85 + r2() * 0.6;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const cHex = petals[Math.floor(r2() * petals.length)];
            const tilt = (r2() - 0.5) * 0.35;
            const h = (0.24 + r2() * 0.14) * s;
            const hx = x + tilt * 0.5 * h, hz = z + tilt * 0.5 * h;
            const stem = piece(cylG(0.011, 0.016, 1, 4), { t: [x + tilt * 0.25 * h, h / 2, z + tilt * 0.25 * h], s: [1, h, 1], r: [tilt, 0, tilt], sh: 'smooth' });
            ramp(stem, 0x3f7a38, 0x74b85c, 0, h, { seed: vs + i, lift: 0.1 });
            pieces.push(stem);
            for (let l = 0; l < 1; l++) { // a soft leaf at the foot
              const la = r2() * TAU;
              const leaf = piece(sphereG(1, 5, 3), {
                t: [x + Math.cos(la) * 0.05, 0.035, z + Math.sin(la) * 0.05],
                s: [0.075 * s, 0.014, 0.028 * s], r: [0, -la, 0.35], sh: 'smooth',
              });
              tintG(leaf, l ? 0x4f9a46 : 0x5ea650, 0.03, vs + i + l, 0.1);
              pieces.push(leaf);
            }
            const kind = r2();
            if (kind < 0.62) {
              // daisy: cupped 5-6 petal star disc, both faces, with a domed eye
              const P5 = r2() > 0.5 ? 5 : 6;
              const disc = petalDiscG(P5);
              const head = piece(disc, { t: [hx, h, hz], s: [0.085 * s, 0.085 * s, 0.085 * s], r: [tilt * 1.4, r2() * TAU, tilt * 1.4], sh: 'smooth' });
              ramp(head, lerpColorHex(cHex, 0x8a5a60, 0.22), cHex, h - 0.01, h + 0.02, { noise: 0.02, seed: vs + i, lift: 0 });
              pieces.push(head);
              const eye = piece(sphereG(1, 5, 3), { t: [hx, h + 0.012 * s, hz], s: [0.026 * s, 0.018 * s, 0.026 * s], sh: 'smooth' });
              tintG(eye, r2() > 0.5 ? 0xffc83a : 0xf29a3a, 0.02, vs + i, 0);
              pieces.push(eye);
            } else if (kind < 0.85) {
              // tulip cup: a scalloped little bowl
              const cup = piece(tulipG(), { t: [hx, h - 0.01, hz], s: [0.05 * s, 0.07 * s, 0.05 * s], r: [tilt, r2() * TAU, tilt], sh: 'smooth' });
              ramp(cup, lerpColorHex(cHex, 0x803040, 0.25), cHex, h - 0.01, h + 0.06 * s, { noise: 0.02, seed: vs + i, lift: 0 });
              pieces.push(cup);
            } else {
              // lavender-ish spike: three stacked soft beads
              for (let b = 0; b < 3; b++) {
                const bead = piece(sphereG(1, 5, 3), {
                  t: [hx, h + b * 0.035 * s, hz], s: [(0.03 - b * 0.006) * s, 0.026 * s, (0.03 - b * 0.006) * s], sh: 'smooth',
                });
                tintG(bead, lerpColorHex(cHex, 0x9a78e0, 0.5), 0.03, vs + i + b, 0);
                pieces.push(bead);
              }
            }
          }
          return pieces;
        });
        return [V(g, FOLIAGE_V, [0.08, 0.05])];
      },
    },
    fern: {
      variants: 3, noShadow: true, collider: 0, noPathAvoid: true, cluster: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`fernM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const n = 6 + Math.floor(r2() * 3);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + r2() * 0.5;
            const len = 0.55 + r2() * 0.4;
            const p = piece(frondG(), {
              t: [Math.cos(a) * 0.14, len * 0.4, Math.sin(a) * 0.14],
              s: [1, len, 1], r: [-0.62 - r2() * 0.35, -a + Math.PI / 2, 0], sh: 'smooth',
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
      variants: 2, noShadow: true, collider: 0, noPathAvoid: true, cluster: true,
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
      variants: 4, noShadow: true, collider: 0, noPathAvoid: true, pathRing: true,
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
              r: [(r2() - 0.5) * 0.55, r2() * TAU, (r2() - 0.5) * 0.55], sh: 'smooth',
            });
            ramp(b, lerpColorHex(0x4c8a42, 0x639a4a, r2()), lerpColorHex(0x9ad463, 0xc2df7a, r2()),
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
      variants: 3, noShadow: true, collider: 0, noPathAvoid: true,
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
            const st = piece(cylG(0.015, 0.028, h, 5), { t: [x, h / 2, z], r: [tilt, 0, tilt], sh: 'smooth' });
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
      variants: 3, noShadow: true, collider: 0, ground: 'water', noPathAvoid: true,
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
          // moss grows over the crown and spills down the flanks
          for (const pc of pieces) mossify(pc, { amount: 0.62, seed: vs % 89 });
          pieces.push(...tuftPieces(r2, { n: 4, R: 0.68, seed: vs + 6 }));
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
          const body = trunkG({ h: 0.48, r0: 0.34, r1: 0.29, lean: 0.04, flare: 0.9, seed: vs, segs: 10 });
          ramp(body, 0x654a30, 0x94724f, 0, 0.5, { noise: 0.04, seed: vs });
          mossify(body, { amount: 0.42, seed: vs % 89 });
          pieces.push(body);
          const top = piece(cylG(0.27, 0.27, 0.035, 12), { t: [0.02, 0.49, 0] });
          tintG(top, 0xd6b07e, 0.03, vs);
          pieces.push(top);
          const ring = piece(cylG(0.17, 0.17, 0.042, 12), { t: [0.02, 0.49, 0] });
          tintG(ring, 0xb08a56, 0.03, vs + 1);
          pieces.push(ring);
          const heart = piece(cylG(0.06, 0.06, 0.048, 8), { t: [0.02, 0.49, 0] });
          tintG(heart, 0x7d5b38, 0.03, vs + 2);
          pieces.push(heart);
          for (let i = 0; i < 3; i++) { // root spurs
            const a = (i / 3) * TAU + r2();
            const rn = piece(coneG(0.11, 0.34, 7), {
              t: [Math.cos(a) * 0.32, 0.08, Math.sin(a) * 0.32],
              r: [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25], sh: 'smooth',
            });
            ramp(rn, 0x4f3a25, 0x6a4d33, 0, 0.3, { seed: vs + i });
            pieces.push(rn);
          }
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
          const body = piece(cylG(0.23, 0.27, 1.9, 12, 3), { t: [0, 0.27, 0], r: [0, 0, Math.PI / 2], jit: 0.02, jseed: vs, sh: 'crease' });
          ramp(body, 0x6f5138, 0xa8845c, 0.02, 0.52, { noise: 0.04, seed: vs });
          mossify(body, { amount: 0.5, seed: vs % 89 });
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
          const stub = piece(cylG(0.05, 0.07, 0.32, 7), { t: [0.35, 0.5, 0.06], r: [0.9, 0, 0.5], sh: 'smooth' });
          ramp(stub, 0x5a4029, 0x735237, 0.35, 0.65, { seed: vs + 2 });
          pieces.push(stub);
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
          for (const px of [-0.72, 0.72]) {
            const lean = (r2() - 0.5) * 0.07;
            const post = piece(rboxG(0.12, 0.82, 0.12, 0.03, 1), { t: [px, 0.38, 0], r: [(r2() - 0.5) * 0.04, 0, lean] });
            ramp(post, 0x8a6642, 0xb89262, 0, 0.8, { noise: 0.03, seed: vs + px * 3, lift: 0.25 });
            pieces.push(post);
            const cap = piece(sphereG(1, 7, 5), { t: [px - lean * 0.4, 0.8, 0], s: [0.075, 0.055, 0.075], sh: 'smooth' });
            tintG(cap, 0xa88458, 0.03, vs + px, 0.15);
            pieces.push(cap);
          }
          for (const [ry, sag] of [[0.58, 0.02], [0.3, 0.03]]) {
            const rail = piece(rboxG(1.62, 0.085, 0.06, 0.025, 1), { t: [0, ry, 0.03], r: [0, 0, (r2() - 0.5) * sag * 2] });
            ramp(rail, 0xa07a4c, 0xcca878, ry - 0.05, ry + 0.05, { noise: 0.03, seed: vs + ry * 7, lift: 0.25 });
            pieces.push(rail);
          }
          pieces.push(...tuftPieces(r2, { n: 3, R: 0.6, seed: vs + 9 }));
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
          const IRON = 0x34423f, IRON_L = 0x566a64;
          const base = piece(cylG(0.16, 0.22, 0.16, 10), { t: [0, 0.08, 0], sh: 'crease' });
          ramp(base, IRON, IRON_L, 0, 0.16, { seed: vs, lift: 0.3 });
          pieces.push(base);
          const pole = piece(cylG(0.045, 0.07, 2.3, 8), { t: [0, 1.15, 0], sh: 'smooth' });
          ramp(pole, IRON, IRON_L, 0, 2.3, { noise: 0.02, seed: vs + 1, lift: 0.3 });
          pieces.push(pole);
          for (const y of [0.5, 1.9]) {
            const collar = piece(sphereG(1, 8, 5), { t: [0, y, 0], s: [0.075, 0.05, 0.075], sh: 'smooth' });
            tintG(collar, IRON_L, 0.02, vs + y, 0.2);
            pieces.push(collar);
          }
          // curled arm (three short segments bending out and down)
          const arm = piece(cylG(0.028, 0.028, 0.5, 6), { t: [0.2, 2.3, 0], r: [0, 0, Math.PI / 2], sh: 'smooth' });
          tintG(arm, IRON, 0.02, vs + 2, 0.2);
          pieces.push(arm);
          const curl = piece(geo('lampCurl', () => new THREE.TorusGeometry(0.1, 0.022, 5, 10, Math.PI)), { t: [0.06, 2.2, 0], r: [0, 0, Math.PI / 2], sh: 'smooth' });
          tintG(curl, IRON, 0.02, vs + 3, 0.2);
          pieces.push(curl);
          const cap = piece(coneG(0.19, 0.17, 8), { t: [0.42, 2.37, 0], sh: 'crease' });
          ramp(cap, IRON, IRON_L, 2.28, 2.46, { seed: vs + 4, lift: 0.3 });
          pieces.push(cap);
          const tip = piece(sphereG(0.035, 6, 4), { t: [0.42, 2.47, 0] });
          tintG(tip, IRON_L, 0.02, vs, 0.2);
          pieces.push(tip);
          const hook = piece(cylG(0.012, 0.012, 0.1, 4), { t: [0.42, 2.3, 0] });
          tintG(hook, IRON, 0.02, vs, 0);
          pieces.push(hook);
          const cage = piece(rboxG(0.2, 0.04, 0.2, 0.015, 1), { t: [0.42, 1.98, 0] });
          tintG(cage, IRON, 0.02, vs + 5, 0.2);
          pieces.push(cage);
          // hanging flower basket on the pole
          const bk = piece(sphereG(1, 8, 5), { t: [-0.14, 1.62, 0], s: [0.16, 0.1, 0.16], sh: 'smooth' });
          tintG(bk, 0x7a5a36, 0.03, vs + 6, 0.2);
          pieces.push(bk);
          const r3 = seededRandom(vs + 9);
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * TAU;
            const f = piece(sphereG(1, 6, 4), { t: [-0.14 + Math.cos(a) * 0.12, 1.7 + r3() * 0.04, Math.sin(a) * 0.12], s: 0.055 });
            tintG(f, i % 2 ? 0x5a9a48 : [0xff8aa0, 0xfff4f8, 0xffd24a][i % 3], 0.02, vs + i, 0.1);
            pieces.push(f);
          }
          return pieces;
        });
        const gl = merged(`lampG${vs}`, () => [piece(rboxG(0.17, 0.24, 0.17, 0.04, 1), { t: [0.42, 2.14, 0] })]);
        return [
          V(g, SOLID_V, [0.05, 0.02]), shadowP(0.5),
          P(gl, LAMP_GLASS, 0xffe2b0, [0, 0, 0], 1, [0, 0, 0], 0, false),
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
          const foot = piece(rboxG(0.92, 0.32, 0.92, 0.07, 2), { t: [0, 0.15, 0], r: [0, r2() * 0.3, 0] });
          ramp(foot, 0x8f8c83, 0xb2afa4, 0, 0.34, { noise: 0.03, seed: vs, lift: 0.4 });
          mossify(foot, { amount: 0.55, seed: vs % 89 });
          pieces.push(foot);
          const lip = piece(rboxG(0.99, 0.09, 0.99, 0.035, 1), { t: [0, 0.32, 0], r: [0, r2() * 0.3, 0] });
          tintG(lip, 0xbcb9af, 0.03, vs + 1);
          mossify(lip, { amount: 0.35, seed: (vs + 3) % 89 });
          pieces.push(lip);
          const mono = piece(rboxG(0.52, 1.5, 0.36, 0.07, 2), {
            t: [0, 1.02, 0], r: [(r2() - 0.5) * 0.03, 0, (r2() - 0.5) * 0.07],
          });
          ramp(mono, 0xc2bcaa, 0xe4e0ce, 0.3, 1.85, { noise: 0.03, seed: vs + 2, lift: 0.45 });
          mossify(mono, { amount: 0.3, seed: (vs + 5) % 89 });
          pieces.push(mono);
          const cap = piece(rboxG(0.6, 0.15, 0.44, 0.05, 1), { t: [0, 1.82, 0], r: [0, 0, (r2() - 0.5) * 0.08] });
          ramp(cap, 0xc9c6bb, 0xe2dfd3, 1.74, 1.9, { seed: vs + 3, lift: 0.45 });
          mossify(cap, { amount: 0.3, seed: (vs + 7) % 89 });
          pieces.push(cap);
          pieces.push(...tuftPieces(r2, { n: 5, R: 0.62, seed: vs + 6 }));
          return pieces;
        });
        // carved rune channel down the face: warm glow, a notch-framed stripe
        const gr = merged(`shrineR${vs}`, () => {
          const out = [piece(rboxG(0.22, 0.96, 0.03, 0.012, 1), { t: [0, 1.07, 0.18] })];
          for (const y of [0.72, 1.07, 1.42]) out.push(piece(octaG(1), { t: [0, y, 0.19], s: [0.075, 0.075, 0.02] }));
          return out;
        });
        return [
          V(g, SOLID_V, [0.06, 0.03]), shadowP(0.85),
          P(gr, GLOW_RUNE, 0xffe9b0, [0, 0, 0], 1, [0, 0, 0], 0, false),
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
          const n = 10;
          for (let row = 0; row < 2; row++) { // two courses of rounded rim stones, staggered
            for (let i = 0; i < n; i++) {
              const a = ((i + row * 0.5) / n) * TAU;
              const st = piece(rboxG(0.5, 0.3, 0.32, 0.07, 1), {
                t: [Math.cos(a) * 0.74, 0.15 + row * 0.3, Math.sin(a) * 0.74],
                r: [0, -a + Math.PI / 2, (r2() - 0.5) * 0.05],
              });
              ramp(st, (i + row) % 2 ? 0x8c887d : 0x9a968b, (i + row) % 2 ? 0xb8b4a8 : 0xc6c2b6, row * 0.3 - 0.05, row * 0.3 + 0.35, { noise: 0.03, seed: vs + i + row * 20, lift: 0.3 });
              if (row === 1) mossify(st, { amount: 0.35, seed: (vs + i) % 89 });
              pieces.push(st);
            }
          }
          const water = piece(cylG(0.6, 0.6, 0.04, 14), { t: [0, 0.4, 0] });
          tintG(water, 0x2c4a5c, 0.02, vs, 0);
          pieces.push(water);
          for (const px of [-0.74, 0.74]) { // posts
            const post = piece(rboxG(0.13, 1.55, 0.13, 0.035, 1), { t: [px, 1.0, 0] });
            ramp(post, 0x6a5236, 0x94744f, 0.4, 1.8, { noise: 0.03, seed: vs + px * 5, lift: 0.25 });
            pieces.push(post);
          }
          const pal = { dark: 0x8e3d2f, light: 0xcf6c52, ridge: 0x5e2a22 };
          const roof = [];
          roofPieces(roof, { L: 1.66, hd: 0.52, yTop: 1.74, pitch: 0.78, over: 0.4, gover: 0.14, t: 0.1, courses: 3, pal, wallHex: 0x6b4f36, seed: vs });
          pieces.push(...roof);
          const axle = piece(cylG(0.045, 0.045, 1.5, 7), { t: [0, 1.42, 0], r: [0, 0, Math.PI / 2], sh: 'smooth' });
          tintG(axle, 0x4a3a2a, 0.03, vs, 0.2);
          pieces.push(axle);
          const crank = piece(rboxG(0.05, 0.28, 0.05, 0.015, 1), { t: [0.84, 1.32, 0], r: [0, 0, 0.3] });
          tintG(crank, 0x3f332a, 0.03, vs, 0.2);
          pieces.push(crank);
          const rope = piece(cylG(0.016, 0.016, 0.55, 5), { t: [0, 1.15, 0], sh: 'smooth' });
          tintG(rope, 0xc0a476, 0.04, vs, 0.2);
          pieces.push(rope);
          const bucket = piece(cylG(0.16, 0.13, 0.2, 10), { t: [0, 0.98, 0], sh: 'crease' });
          ramp(bucket, 0x6f5138, 0x9a7a55, 0.88, 1.08, { seed: vs + 8, lift: 0.3 });
          pieces.push(bucket);
          const hoop = piece(cylG(0.165, 0.165, 0.03, 10), { t: [0, 1.04, 0] });
          tintG(hoop, 0x54504a, 0.02, vs, 0.2);
          pieces.push(hoop);
          pieces.push(...tuftPieces(r2, { n: 6, R: 1.0, seed: vs + 9 }));
          return pieces;
        });
        return [V(g, SOLID_V, [0.05, 0.03]), shadowP(1.25)];
      },
    },
    house_small: {
      variants: 4, collider: 2.5, faceCenter: true, sinkY: 0.25,
      surface: 'wood', surfaceRect: [1.8, 1.55], // plank floor: footprint + doorstep
      make: (rng, v) => {
        const vs = Math.floor(rng() * 1e6);
        const { g, gl } = cottageGeo(vs, (v ?? 0) % 4, 0);
        return [V(g, SOLID_V, [0.04, 0.03]), shadowP(2.6), P(gl, WINDOW, 0xffd9a8, [0, 0, 0], 1, [0, 0, 0], 0, false)];
      },
      effect: (x, y, z, s, rng, ctx) => {
        const [cx, cy, cz] = localToWorld(x, y, z, s, ctx.yaw, -1.0 + 0.06, 4.45, -0.5 - 0.04);
        addChimneySmoke(cx, cy, cz, s);
        return null;
      },
    },
    house_stilt: {
      // Driftmoor's lake cottages: the same cottage raised on a plank deck
      // over stilts, standing in the shallows (placed at water level)
      variants: 3, collider: 2.6, ground: 'water',
      make: (rng, v) => {
        const vs = Math.floor(rng() * 1e6);
        const { g, gl } = cottageGeo(vs, ((v ?? 0) + 1) % 4, 0.62, true);
        return [V(g, SOLID_V, [0.04, 0.03]), P(gl, WINDOW, 0xffd9a8, [0, 0, 0], 1, [0, 0, 0], 0, false)];
      },
      effect: (x, y, z, s, rng, ctx) => {
        const [cx, cy, cz] = localToWorld(x, y, z, s, ctx.yaw, -1.0 + 0.06, 4.45 + 0.62, -0.5 - 0.04);
        addChimneySmoke(cx, cy, cz, s);
        return null;
      },
    },
    house_large: {
      variants: 2, collider: 3.6, faceCenter: true, sinkY: 0.3,
      surface: 'wood', surfaceRect: [2.7, 2.0],
      make: (rng, v) => {
        const vs = Math.floor(rng() * 1e6);
        const vi = (v ?? 0) % 2;
        const pal = ROOFS[vi ? 1 : 0], wall = WALLS[vi ? 2 : 0];
        const shutter = vi ? 0x3f7a78 : 0x4f7fa8;
        const bloom = vi ? [0xffd24a, 0xfff4f8, 0xff9f5a] : [0xff8aa0, 0xfff4f8, 0xc8a0ff];
        const glowL = [];
        const g = merged(`hlM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const out = [];
          const fo = piece(rboxG(5.44, 0.56, 4.04, 0.09, 1), { t: [0, 0.23, 0] });
          ramp(fo, 0x77736a, 0xa29e93, -0.05, 0.52, { noise: 0.04, seed: vs, lift: 0.3 });
          mossify(fo, { amount: 0.3, seed: vs % 89 });
          out.push(fo);
          const w = piece(boxG(5.2, 2.3, 3.8), { t: [0, 1.6, 0] });
          ramp(w, wall.lo, wall.hi, 0.45, 2.75, { noise: 0.02, seed: vs + 1, lift: 0.35 });
          out.push(w);
          for (const px of [-2.6, 2.6]) for (const pz of [-1.9, 1.9]) {
            const post = piece(boxG(0.16, 2.32, 0.16), { t: [px, 1.6, pz] });
            ramp(post, WOOD, WOOD_L, 0.45, 2.75, { noise: 0.03, seed: vs + px + pz, lift: 0.25 });
            out.push(post);
          }
          const rail = piece(boxG(5.24, 0.13, 0.13), { t: [0, 2.7, 1.91] });
          tintG(rail, WOOD, 0.03, vs + 27, 0.25);
          out.push(rail);
          const wallHex = lerpColorHex(wall.hi, wall.lo, 0.3);
          const rf = roofPieces(out, { L: 5.22, hd: 1.92, yTop: 2.76, pitch: 0.68, courses: 6, pal, wallHex, seed: vs });
          // dormer: little gabled box on the front slope with its own window
          const dFront = 1.55, dBack = 0.35, dTop = 4.02, dBot = 3.0;
          const dz = (dFront + dBack) / 2;
          const dw = piece(boxG(1.3, dTop - dBot, dFront - dBack), { t: [0, (dTop + dBot) / 2, dz] });
          ramp(dw, wall.lo, wall.hi, dBot, dTop, { noise: 0.02, seed: vs + 2, lift: 0.35 });
          out.push(dw);
          const dRoof = [];
          roofPieces(dRoof, { L: dFront - dBack + 0.06, hd: 0.66, yTop: dTop, pitch: 0.62, over: 0.16, gover: 0.12, t: 0.11, courses: 3, pal, wallHex, seed: vs + 3 });
          for (const pc of dRoof) { pc.rotateY(Math.PI / 2); pc.translate(0, 0, dz); out.push(pc); }
          windowPieces(out, glowL, { x: 0, y: 3.58, z: dFront, w: 0.46, h: 0.46, shutter: null, box: true, bloom, seed: vs + 70 });
          doorPieces(out, glowL, { x: 0, y0: 0.47, z: 1.9, w: 0.92, h: 1.6, seed: vs + 20, lantern: [1, -1] });
          windowPieces(out, glowL, { x: -1.55, y: 1.62, z: 1.9, w: 0.66, h: 0.66, shutter, bloom, seed: vs + 30 });
          windowPieces(out, glowL, { x: 1.55, y: 1.62, z: 1.9, w: 0.66, h: 0.66, shutter, bloom, seed: vs + 35 });
          windowPieces(out, glowL, { x: 2.6, y: 1.62, z: 0, ry: Math.PI / 2, w: 0.62, h: 0.62, shutter, bloom, seed: vs + 40 });
          windowPieces(out, glowL, { x: -2.6, y: 1.62, z: 0, ry: -Math.PI / 2, w: 0.62, h: 0.62, shutter, bloom, seed: vs + 45 });
          chimneyPieces(out, { x: -1.9, z: -1.0, y0: 2.6, h: 2.35, w: 0.52, seed: vs + 60 });
          out.push(...tuftPieces(r2, { n: 7, R: 2.8, seed: vs + 10 }));
          void rf;
          return out;
        });
        const gl = merged(`hlG${vs}`, () => glowL);
        return [V(g, SOLID_V, [0.04, 0.025]), shadowP(3.4), P(gl, WINDOW, 0xffd9a8, [0, 0, 0], 1, [0, 0, 0], 0, false)];
      },
      effect: (x, y, z, s, rng, ctx) => {
        const [cx, cy, cz] = localToWorld(x, y, z, s, ctx.yaw, -1.9 + 0.06, 5.25, -1.0 - 0.04);
        addChimneySmoke(cx, cy, cz, s);
        return null;
      },
    },
    townhouse: {
      // tall, narrow two-storey house for lining streets
      variants: 3, collider: 2.1, faceCenter: true, sinkY: 0.25,
      surface: 'wood', surfaceRect: [1.45, 1.35],
      make: (rng, v) => {
        const vs = Math.floor(rng() * 1e6);
        const vi = (v ?? 0) % 3;
        const pal = ROOFS[[1, 0, 2][vi]], wall = WALLS[[1, 3, 0][vi]];
        const shutter = SHUTTERS[(vi * 3 + 2) % SHUTTERS.length];
        const bloom = [BLOOMS[(vi + 3) % BLOOMS.length], 0xfff4f8, BLOOMS[(vi + 1) % BLOOMS.length]];
        const glowL = [];
        const g = merged(`thM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const out = [];
          const fo = piece(rboxG(2.96, 0.5, 2.76, 0.08, 1), { t: [0, 0.2, 0] });
          ramp(fo, 0x77736a, 0xa29e93, -0.05, 0.46, { noise: 0.04, seed: vs, lift: 0.3 });
          mossify(fo, { amount: 0.3, seed: vs % 89 });
          out.push(fo);
          const w = piece(boxG(2.8, 3.7, 2.6), { t: [0, 2.23, 0] });
          ramp(w, wall.lo, wall.hi, 0.38, 4.1, { noise: 0.02, seed: vs + 1, lift: 0.35 });
          out.push(w);
          // jettied upper floor band + corner posts
          const band = piece(boxG(2.9, 0.16, 2.7), { t: [0, 2.2, 0] });
          tintG(band, WOOD, 0.03, vs + 2, 0.25);
          out.push(band);
          for (const [px, pz] of [[-1.39, 1.29], [1.39, 1.29], [-1.39, -1.29], [1.39, -1.29]]) {
            const post = piece(boxG(0.13, 3.72, 0.13), { t: [px, 2.22, pz] });
            ramp(post, WOOD, WOOD_L, 0.4, 4.1, { noise: 0.03, seed: vs + px + pz, lift: 0.25 });
            out.push(post);
          }
          roofPieces(out, { L: 2.82, hd: 1.31, yTop: 4.07, pitch: 0.92, courses: 5, pal, wallHex: lerpColorHex(wall.hi, wall.lo, 0.3), seed: vs });
          doorPieces(out, glowL, { x: -0.55, y0: 0.42, z: 1.3, w: 0.76, h: 1.42, seed: vs + 20, lantern: 1 });
          windowPieces(out, glowL, { x: 0.62, y: 1.4, z: 1.3, w: 0.56, h: 0.6, shutter: null, bloom, seed: vs + 30 });
          windowPieces(out, glowL, { x: -0.6, y: 3.05, z: 1.3, w: 0.52, h: 0.6, shutter, bloom, seed: vs + 35 });
          windowPieces(out, glowL, { x: 0.6, y: 3.05, z: 1.3, w: 0.52, h: 0.6, shutter, bloom, seed: vs + 38 });
          windowPieces(out, glowL, { x: 1.4, y: 3.05, z: -0.3, ry: Math.PI / 2, w: 0.5, h: 0.56, shutter: null, box: false, seed: vs + 40 });
          windowPieces(out, glowL, { x: -1.4, y: 1.45, z: -0.3, ry: -Math.PI / 2, w: 0.5, h: 0.56, shutter: null, box: false, seed: vs + 45 });
          chimneyPieces(out, { x: 0.7, z: -0.62, y0: 4.0, h: 1.9, w: 0.42, seed: vs + 60 });
          out.push(...tuftPieces(r2, { n: 5, R: 1.7, seed: vs + 10 }));
          return out;
        });
        const gl = merged(`thG${vs}`, () => glowL);
        return [V(g, SOLID_V, [0.04, 0.03]), shadowP(2.2), P(gl, WINDOW, 0xffd9a8, [0, 0, 0], 1, [0, 0, 0], 0, false)];
      },
      effect: (x, y, z, s, rng, ctx) => {
        const [cx, cy, cz] = localToWorld(x, y, z, s, ctx.yaw, 0.7 + 0.06, 6.15, -0.62 - 0.04);
        addChimneySmoke(cx, cy, cz, s);
        return null;
      },
    },
    shop_stall: {
      variants: 3, collider: 1.4, faceCenter: true,
      make: (rng, v) => {
        const vi = (v ?? 0) % 3;
        const stripe = [0xc8503e, 0x3f78b8, 0x5a9a4a][vi];
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`stallM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const pieces = [];
          const base = piece(rboxG(2.4, 0.9, 1.1, 0.05, 1), { t: [0, 0.45, 0] });
          ramp(base, 0x8a6a46, 0xb89466, 0, 0.95, { noise: 0.03, seed: vs, lift: 0.3 });
          pieces.push(base);
          for (let i = 0; i < 5; i++) { // front plank lines
            const pl = piece(boxG(0.44, 0.8, 0.03), { t: [-0.96 + i * 0.48, 0.46, 0.555] });
            ramp(pl, lerpColorHex(0x7d5f3f, 0x5c4630, r2() * 0.6), 0x9e7e56, 0, 0.9, { noise: 0.04, seed: vs + i, lift: 0.3 });
            pieces.push(pl);
          }
          const top = piece(rboxG(2.56, 0.1, 1.24, 0.035, 1), { t: [0, 0.95, 0] });
          ramp(top, 0xa8885c, 0xcfae80, 0.9, 1.0, { noise: 0.03, seed: vs + 6, lift: 0.3 });
          pieces.push(top);
          for (const [px, pz, h] of [[-1.2, -0.5, 2.15], [1.2, -0.5, 2.15], [-1.2, 0.62, 2.45], [1.2, 0.62, 2.45]]) {
            const post = piece(rboxG(0.1, h, 0.1, 0.03, 1), { t: [px, h / 2, pz] });
            ramp(post, 0x7d5c3d, 0xa38460, 0, h, { noise: 0.03, seed: vs + px * 3 + pz, lift: 0.25 });
            pieces.push(post);
          }
          const rail = piece(rboxG(2.62, 0.07, 0.07, 0.02, 1), { t: [0, 1.62, 0.5] });
          tintG(rail, 0x6b4a33, 0.03, vs, 0.25);
          pieces.push(rail);
          // wares: crates of fruit / veg, a basket of loaves, jars
          const wares = [[0xe8603c, 0xf0a030], [0x8cc050, 0xd8d060], [0xc03a48, 0x8a4ac0]][vi];
          for (let c = 0; c < 3; c++) {
            const cx = -0.8 + c * 0.8;
            const cr = piece(rboxG(0.56, 0.2, 0.4, 0.03, 1), { t: [cx, 1.1, 0.12] });
            ramp(cr, 0x7a5a38, 0xa88458, 1.0, 1.2, { noise: 0.03, seed: vs + c, lift: 0.3 });
            pieces.push(cr);
            for (let k = 0; k < 7; k++) {
              const f = piece(sphereG(1, 7, 5), {
                t: [cx - 0.2 + (k % 4) * 0.13 + (k > 3 ? 0.06 : 0), 1.24 + (k > 3 ? 0.06 : 0), 0.04 + (k > 3 ? 0.08 : (k % 2) * 0.12)],
                s: 0.075 + r2() * 0.015, sh: 'smooth',
              });
              tintG(f, wares[(c + k) % 2], 0.03, vs + c * 9 + k, 0.1);
              pieces.push(f);
            }
          }
          // hanging sign board on the front rail
          const sign = piece(rboxG(0.7, 0.3, 0.05, 0.03, 1), { t: [0, 1.42, 0.52] });
          tintG(sign, 0xd9c49a, 0.03, vs + 40, 0.2);
          pieces.push(sign);
          const glyph = piece(sphereG(1, 7, 5), { t: [0, 1.42, 0.555], s: [0.09, 0.09, 0.02] });
          tintG(glyph, stripe, 0.02, vs + 41, 0);
          pieces.push(glyph);
          pieces.push(...tuftPieces(r2, { n: 4, R: 1.35, seed: vs + 7 }));
          return pieces;
        });
        // striped awning (one merged, vertex-colored, gently swaying sheet)
        const aw = merged(`stallA${vs}`, () => {
          const out = [];
          for (let i = 0; i < 6; i++) {
            const c = i % 2 ? 0xf6eee0 : stripe;
            const w = 2.64 / 6;
            const top = piece(rboxG(w + 0.005, 0.03, 1.5, 0.012, 1), { t: [-1.32 + w / 2 + i * w, 2.26, 0.14], r: [-0.42, 0, 0] });
            ramp(top, lerpColorHex(c, 0x201810, 0.18), c, 1.9, 2.6, { noise: 0.015, seed: vs + i, lift: 0 });
            out.push(top);
            const val = piece(boxG(w + 0.005, 0.24, 0.02), { t: [-1.32 + w / 2 + i * w, 1.86, 0.84] });
            tintG(val, lerpColorHex(c, 0x201810, 0.1), 0.015, vs + i, 0);
            // scalloped hem: nudge the bottom edge of each valance tab
            const vp = val.attributes.position;
            for (let k = 0; k < vp.count; k++) if (vp.getY(k) < 1.8) vp.setY(k, vp.getY(k) - 0.05);
            out.push(val);
          }
          return out;
        });
        return [V(g, SOLID_V, [0.05, 0.03]), V(aw, CLOTH_V, [0.03, 0.02]), shadowP(1.7)];
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
          const bed = piece(rboxG(1.7, 0.46, 1.0, 0.05, 1), { t: [0, 0.66, 0] });
          ramp(bed, 0x77573c, 0xa68658, 0.42, 0.9, { noise: 0.03, seed: vs, lift: 0.3 });
          pieces.push(bed);
          for (const s of [-1, 1]) { // top rails + side planks
            const rail = piece(rboxG(1.78, 0.08, 0.09, 0.025, 1), { t: [0, 0.93, s * 0.5] });
            tintG(rail, 0x6a4c33, 0.03, vs + s, 0.25);
            pieces.push(rail);
          }
          for (const s of [-1, 1]) { // wheels: rim, spokes, hub
            const rim = piece(geo('cartRim', () => new THREE.TorusGeometry(0.4, 0.05, 6, 16)), { t: [0.55, 0.42, s * 0.58], sh: 'smooth' });
            ramp(rim, 0x4f3a26, 0x6f5236, 0.02, 0.85, { seed: vs + s, lift: 0.3 });
            pieces.push(rim);
            for (let k = 0; k < 6; k++) {
              const sp = piece(cylG(0.022, 0.022, 0.78, 5), { t: [0.55, 0.42, s * 0.58], r: [0, 0, (k / 6) * Math.PI], sh: 'smooth' });
              tintG(sp, 0x6a4c33, 0.03, vs + k, 0.2);
              pieces.push(sp);
            }
            const hub = piece(cylG(0.1, 0.1, 0.14, 10), { t: [0.55, 0.42, s * 0.6], r: [Math.PI / 2, 0, 0], sh: 'crease' });
            tintG(hub, 0x8f6f4c, 0.03, vs + s * 5, 0.2);
            pieces.push(hub);
          }
          const axle = piece(cylG(0.045, 0.045, 1.24, 6), { t: [0.55, 0.42, 0], r: [Math.PI / 2, 0, 0] });
          tintG(axle, 0x3f2f20, 0.03, vs, 0.2);
          pieces.push(axle);
          for (const s of [-1, 1]) { // handles
            const h = piece(cylG(0.04, 0.05, 1.3, 6), { t: [-1.2, 0.5, s * 0.3], r: [0, 0, 1.1], sh: 'smooth' });
            ramp(h, 0x6a4c33, 0x8a6a48, 0.1, 0.95, { seed: vs + s * 7, lift: 0.25 });
            pieces.push(h);
          }
          const hay = piece(lobeG(1, (vs + 9) % 97, 0.3), { t: [0.12, 1.0, 0], s: [0.74, 0.34, 0.44], sh: 'smooth' });
          ramp(hay, 0xb89048, 0xecd08a, 0.75, 1.35, { noise: 0.04, seed: vs + 9, lift: 0.15 });
          pieces.push(hay);
          for (let k = 0; k < 3; k++) { // a few sacks/pumpkins on the hay
            const pk = piece(sphereG(1, 9, 6), { t: [-0.35 + k * 0.32, 1.22, (r2() - 0.5) * 0.4], s: [0.15, 0.12, 0.15], sh: 'smooth' });
            tintG(pk, k === 1 ? 0xe8883a : 0xd8c49a, 0.03, vs + k, 0.15);
            pieces.push(pk);
          }
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
          const body = piece(rboxG(0.72, 0.72, 0.72, 0.04, 1), { t: [0, 0.36, 0], r: [0, yaw, 0] });
          ramp(body, 0x92714c, 0xc4a274, 0, 0.78, { noise: 0.03, seed: vs, lift: 0.3 });
          pieces.push(body);
          for (const ey of [0.07, 0.66]) { // edge battens
            for (const [sx, sz] of [[0.78, 0.1], [0.1, 0.78]]) {
              const b1 = piece(rboxG(sx, 0.1, sz, 0.025, 1), { t: [0, ey, 0], r: [0, yaw, 0] });
              tintG(b1, 0x6f5138, 0.03, vs + ey * 9 + sx, 0.25);
              pieces.push(b1);
            }
          }
          const diag = piece(boxG(0.86, 0.09, 0.04), { t: [Math.sin(yaw) * 0.37, 0.37, Math.cos(yaw) * 0.37], r: [0, yaw, 0.75] });
          tintG(diag, 0x6b4f36, 0.03, vs + 3, 0.25);
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
          ramp(plinth, 0x8a867a, 0xa6a39a, 0, 0.36, { noise: 0.05, seed: vs });
          pieces.push(plinth);
          const col = piece(cylG(0.32, 0.4, h, 8, 3), {
            t: [tiltZ * h * 0.5, 0.3 + h / 2, 0], r: [(r2() - 0.5) * 0.06, 0, tiltZ], jit: 0.05, jseed: vs + 1,
          });
          ramp(col, 0x969288, 0xc6c2b6, 0.3, 0.3 + h, { noise: 0.06, seed: vs + 1 });
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
          const moss = piece(lobeG(1, Math.abs(Math.round(vs + 4)) % 97, 0.22), { t: [0.2, 0.36, 0.28], s: [0.24, 0.09, 0.2], sh: 'smooth' });
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
              ramp(b, 0x929086, 0xc2beb2, y - 0.1, y + bh + 0.4, { noise: 0.06, seed: vs + s + i });
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
          const moss = piece(lobeG(1, Math.abs(Math.round(vs + 5)) % 97, 0.22), { t: [-1.5, 3.58, 0.15], s: [0.38, 0.13, 0.28], sh: 'smooth' });
          ramp(moss, 0x3f6b34, 0x74a854, 3.45, 3.75, { seed: vs + 5 });
          pieces.push(moss);
          for (const s of [-1, 1]) { // rubble at the feet
            const rub = piece(rockG(1, Math.abs(Math.round(vs + s + 20)) % 61), {
              t: [s * 1.85, 0.06, 0.35 * s], s: [0.28, 0.2, 0.24], r: [0, r2() * TAU, 0], sh: 'soft',
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
          ramp(base, 0x8d8a80, 0xb8b5a9, 0, 1.7, { noise: 0.06, seed: vs });
          pieces.push(base);
          let x = -1.4;
          let i = 0;
          while (x < 1.4) {
            const w = 0.4 + r2() * 0.5, h = 0.3 + r2() * 1.1;
            const b = piece(boxG(w, h, 0.56), {
              t: [x, 1.2 + h / 2, (r2() - 0.5) * 0.05], r: [0, 0, (r2() - 0.5) * 0.1], jit: 0.035, jseed: vs + i,
            });
            ramp(b, 0x9a978c, 0xc6c2b6, 1.1, 1.3 + h, { noise: 0.06, seed: vs + i });
            pieces.push(b);
            x += w + 0.15 + r2() * 0.35;
            i++;
          }
          const moss = piece(lobeG(1, Math.abs(Math.round(vs + 9)) % 97, 0.22), { t: [0.6, 1.3, 0.2], s: [0.42, 0.15, 0.28], sh: 'smooth' });
          ramp(moss, 0x3f6b34, 0x74a854, 1.18, 1.48, { seed: vs + 9 });
          pieces.push(moss);
          for (const s of [-1, 1]) { // tumbled blocks at the wall feet
            const rub = piece(rockG(1, Math.abs(Math.round(vs + s + 30)) % 61), {
              t: [s * (1.5 + r2() * 0.5), 0.05, 0.5 + r2() * 0.3], s: [0.26, 0.18, 0.22], r: [0, r2() * TAU, 0], sh: 'soft',
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
          for (const b of [hem, body, chest]) ramp(b, 0xc4c0b4, 0xe8e5d8, 0.8, 3.0, { noise: 0.05, seed: vs + 2, exp: 1.1, lift: 0.5 });
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
          const moss = piece(lobeG(1, Math.abs(Math.round(vs + 9)) % 97, 0.22), { t: [-0.55, 0.36, 0.5], s: [0.3, 0.11, 0.24], sh: 'smooth' });
          ramp(moss, 0x3f6b34, 0x74a854, 0.28, 0.48, { seed: vs + 9 });
          pieces.push(moss);
          const moss2 = piece(lobeG(1, Math.abs(Math.round(vs + 10)) % 97, 0.22), { t: [0.5, 0.68, -0.4], s: [0.2, 0.08, 0.18], sh: 'smooth' });
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
            const b = piece(lobeG(1, Math.abs(Math.round(vs + i)) % 97, 0.22), {
              t: [main ? 0 : Math.cos(a) * 0.7, s * 0.28, main ? 0 : Math.sin(a) * 0.7],
              s: [s, s * 0.34, s * (0.85 + r2() * 0.3)], r: [0, r2() * TAU, 0], sh: 'smooth',
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
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`dockM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const out = [];
          for (let i = 0; i < 7; i++) {
            const pl = piece(rboxG(1.72, 0.1, 0.62, 0.025, 1), { t: [(r2() - 0.5) * 0.06, 0.35, 0.35 + i * 0.68], r: [0, (r2() - 0.5) * 0.04, (r2() - 0.5) * 0.02] });
            ramp(pl, i % 2 ? 0x8a6a48 : 0x967658, i % 2 ? 0xb08a60 : 0xbc9868, 0.3, 0.4, { noise: 0.03, seed: vs + i, lift: 0.2 });
            out.push(pl);
          }
          for (let i = 0; i < 3; i++) {
            for (const sd of [-1, 1]) {
              const post = piece(cylG(0.08, 0.1, 1.4, 8), { t: [sd * 0.8, 0.0, 0.5 + i * 1.8], sh: 'smooth' });
              ramp(post, 0x3f3226, 0x6b4a33, -0.7, 0.7, { seed: vs + i + sd, lift: 0.2 });
              out.push(post);
            }
          }
          const bollard = piece(cylG(0.09, 0.1, 0.5, 8), { t: [0.72, 0.62, 4.5], sh: 'smooth' });
          tintG(bollard, 0x5e4630, 0.03, vs, 0.2);
          out.push(bollard);
          const coil = piece(geo('ropeCoil', () => new THREE.TorusGeometry(0.16, 0.05, 6, 12)), { t: [-0.5, 0.45, 3.9], r: [Math.PI / 2, 0, 0], sh: 'smooth' });
          tintG(coil, 0xc8a878, 0.03, vs, 0.2);
          out.push(coil);
          return out;
        });
        const gl = merged(`dockL${vs}`, () => [piece(rboxG(0.16, 0.22, 0.16, 0.04, 1), { t: [0.72, 1.02, 4.5] })]);
        return [V(g, SOLID_V, [0.06, 0.03]), P(gl, LAMP_GLASS, 0xffe2b0, [0, 0, 0], 1, [0, 0, 0], 0, false)];
      },
    },
    // ------------------------------------------------ v2 composition kinds
    tree_cluster: {
      // a merged grove of 3-5 trees: edge framing / dense tree lines
      variants: 4, collider: 2.0, noCluster: true, noShadow: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`tclM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const out = [];
          const n = 3 + Math.floor(r2() * 2);
          for (let t = 0; t < n; t++) {
            const a = (t / n) * TAU + r2() * 0.8, rad = t === 0 ? 0 : 2.0 + r2() * 1.4;
            const tx = Math.cos(a) * rad, tz = Math.sin(a) * rad;
            const sc = 0.85 + r2() * 0.55;
            const birch = r2() > 0.72;
            const tr = trunkG({ h: 2.1 * sc, r0: (birch ? 0.15 : 0.28) * sc, r1: 0.1 * sc, lean: (r2() - 0.5) * 0.15, flare: 0.6, seed: vs + t, segs: 7 });
            tr.translate(tx, 0, tz);
            ramp(tr, birch ? 0xc4bdad : 0x684a2f, birch ? 0xf0ebdc : 0x9a7852, 0, 2.1 * sc, { noise: 0.03, seed: vs + t });
            out.push(tr);
            const cn = canopyPieces(r2, { k: 4, cy: 2.7 * sc, R: 1.4 * sc, spread: 0.78, squash: 0.84, seed: vs + t * 7, detail: 1, amp: 0.18 });
            for (const c of cn.pieces) c.translate(tx, 0, tz);
            const hue = r2();
            if (birch) paintCanopy(cn, 0x659e44, 0xc8e886, { seed: vs + t, sun: 0xf0f8a4 });
            else if (hue > 0.8) paintCanopy(cn, 0x5a7e30, 0xc2d45e, { seed: vs + t, sun: 0xf2eea0 }); // olive-gold crown
            else paintCanopy(cn, 0x3f7c38, lerpColorHex(0x9ed262, 0xb2e070, hue), { seed: vs + t, sun: 0xe2f48e });
            out.push(...cn.pieces);
          }
          return out;
        });
        return [V(g, FOLIAGE2_V, [0.08, 0.07]), shadowP(4.2)];
      },
    },
    pine_cluster: {
      variants: 3, collider: 1.9, noCluster: true, noShadow: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`pclM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const out = [];
          const n = 3 + Math.floor(r2() * 3);
          for (let t = 0; t < n; t++) {
            const a = (t / n) * TAU + r2() * 0.8, rad = t === 0 ? 0 : 1.7 + r2() * 1.3;
            const tx = Math.cos(a) * rad, tz = Math.sin(a) * rad, sc = 0.9 + r2() * 0.7;
            const tr = trunkG({ h: 1.5 * sc, r0: 0.22 * sc, r1: 0.09 * sc, lean: 0, flare: 0.5, seed: vs + t });
            tr.translate(tx, 0, tz);
            ramp(tr, 0x5a3f24, 0x85613f, 0, 1.5 * sc, { noise: 0.03, seed: vs + t });
            out.push(tr);
            let y = 1.1 * sc, r = 1.3 * sc;
            for (let i = 0; i < 4; i++) {
              const h = (1.45 - i * 0.16) * sc;
              const tier = piece(coneG(1, 1, 10), { t: [tx, y + h / 2, tz], s: [r, h, r], r: [0, r2() * TAU, 0], sh: 'soft' });
              ramp(tier, 0x2f6a45, 0x79c276, y, y + h, { noise: 0.03, seed: vs + t + i, lift: 0.18 });
              out.push(tier);
              y += h * 0.6; r *= 0.72;
            }
          }
          return out;
        });
        return [V(g, FOLIAGE2_V, [0.08, 0.05]), shadowP(3.6)];
      },
    },
    hedge: {
      // clipped garden hedge, 2.4 m long, soft lumpy top
      variants: 2, collider: 0.75,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`hedgeM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const out = [];
          for (let i = 0; i < 4; i++) {
            const lg = piece(lobeG(1, (vs + i) % 97, 0.1), { t: [-0.9 + i * 0.6, 0.52, (r2() - 0.5) * 0.06], s: [0.52, 0.56, 0.46], sh: 'smooth' });
            out.push(lg);
          }
          const cn = { pieces: out, lo: 0, hi: 1.1 };
          const c = new THREE.Vector3(0, 0.1, 0);
          for (const pc of out) sphericalNormals(pc, { center: c, blend: 0.45 });
          paintCanopy(cn, 0x3c7434, 0x86c254, { seed: vs, sun: 0xcfe888, lobeVar: 0.04 });
          return out;
        });
        return [V(g, FOLIAGE2_V, [0.06, 0.04]), shadowP(1.4, 0.04)];
      },
    },
    planter: {
      // clay pot or wooden tub bursting with flowers
      variants: 3, collider: 0.35,
      make: (rng, v) => {
        const vs = Math.floor(rng() * 1e6);
        const vi = (v ?? 0) % 3;
        const g = merged(`plantM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const out = [];
          if (vi === 1) {
            const tub = piece(cylG(0.36, 0.3, 0.46, 12), { t: [0, 0.23, 0], sh: 'crease' });
            ramp(tub, 0x6f5138, 0x9a7a55, 0, 0.46, { noise: 0.03, seed: vs, lift: 0.3 });
            out.push(tub);
            for (const y of [0.1, 0.36]) {
              const hoop = piece(cylG(0.37, 0.37, 0.04, 12), { t: [0, y, 0] });
              tintG(hoop, 0x4e4a44, 0.02, vs + y, 0.2);
              out.push(hoop);
            }
          } else {
            const pot = piece(cylG(0.3, 0.2, 0.44, 12), { t: [0, 0.22, 0], sh: 'smooth' });
            ramp(pot, 0xa2502e, 0xd4784a, 0, 0.44, { noise: 0.03, seed: vs, lift: 0.3 });
            out.push(pot);
            const lip = piece(geo('potLip', () => new THREE.TorusGeometry(0.3, 0.045, 6, 14)), { t: [0, 0.44, 0], r: [Math.PI / 2, 0, 0], sh: 'smooth' });
            tintG(lip, 0xc86a40, 0.02, vs, 0.2);
            out.push(lip);
          }
          const bush = piece(lobeG(1, vs % 97, 0.16), { t: [0, 0.6, 0], s: [0.34, 0.26, 0.34], sh: 'smooth' });
          tintG(bush, 0x4f8c42, 0.03, vs, 0.1);
          out.push(bush);
          const cols = [[0xff8aa0, 0xfff4f8], [0xffd24a, 0xff9f5a], [0xc8a0ff, 0xfff4f8]][vi];
          for (let i = 0; i < 11; i++) {
            const a = r2() * TAU, b = r2() * 1.2;
            const f = piece(sphereG(1, 6, 4), { t: [Math.sin(b) * Math.cos(a) * 0.3, 0.64 + Math.cos(b) * 0.2, Math.sin(b) * Math.sin(a) * 0.3], s: 0.06, sh: 'smooth' });
            tintG(f, cols[i % 2], 0.02, vs + i, 0.05);
            out.push(f);
          }
          return out;
        });
        return [V(g, SOLID_V, [0.05, 0.04]), shadowP(0.5, 0.04)];
      },
    },
    flower_bed: {
      // tended garden bed: low stone border, dark soil, rows of blooms
      variants: 3, collider: 0, noPathAvoid: false, noShadow: true,
      make: (rng, v) => {
        const vs = Math.floor(rng() * 1e6);
        const vi = (v ?? 0) % 3;
        const g = merged(`fbedM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const out = [];
          const soil = piece(rboxG(2.4, 0.16, 1.2, 0.06, 1), { t: [0, 0.04, 0] });
          tintG(soil, 0x5e4630, 0.04, vs, 0.1);
          out.push(soil);
          for (let i = 0; i < 12; i++) { // border stones
            const u = i / 12;
            const px = u < 0.5 ? -1.25 + u * 2 * 2.5 : 1.25 - (u - 0.5) * 2 * 2.5;
            const pz = u < 0.5 ? 0.66 : -0.66;
            const st = piece(rockG(1, (vs + i) % 61), { t: [px, 0.06, pz], s: [0.16, 0.12, 0.13], r: [0, r2() * TAU, 0], sh: 'soft' });
            paintStone(st, 0x8a867c, 0xbcb8ac, -0.05, 0.2, vs + i);
            out.push(st);
          }
          const rows = [[0xff8aa0, 0xfff4f8, 0xffd24a], [0xc8a0ff, 0xff9fb0, 0xfff4f8], [0xffd24a, 0xff9f5a, 0xe8604e]][vi];
          for (let rI = 0; rI < 2; rI++) for (let i = 0; i < 7; i++) {
            const x = -0.95 + i * 0.32 + (r2() - 0.5) * 0.08, z = rI ? 0.25 : -0.25;
            const leaf = piece(lobeG(1, (vs + i * 3 + rI) % 97, 0.18), { t: [x, 0.2, z], s: [0.17, 0.13, 0.17], sh: 'smooth' });
            tintG(leaf, 0x4f8c42, 0.03, vs + i, 0.1);
            out.push(leaf);
            for (let k = 0; k < 3; k++) {
              const f = piece(sphereG(1, 6, 4), { t: [x + (r2() - 0.5) * 0.2, 0.3 + r2() * 0.06, z + (r2() - 0.5) * 0.2], s: 0.055, sh: 'smooth' });
              tintG(f, rows[(i + k + rI) % 3], 0.02, vs + i * 5 + k, 0.05);
              out.push(f);
            }
          }
          return out;
        });
        return [V(g, FOLIAGE2_V, [0.05, 0.04])];
      },
    },
    signpost: {
      variants: 1, collider: 0.2,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`signM${vs}`, () => {
          const out = [];
          const post = piece(rboxG(0.12, 2.0, 0.12, 0.03, 1), { t: [0, 1.0, 0] });
          ramp(post, 0x6a4c33, 0x94704a, 0, 2.0, { noise: 0.03, seed: vs, lift: 0.25 });
          out.push(post);
          const cap = piece(coneG(0.1, 0.12, 4), { t: [0, 2.06, 0], r: [0, Math.PI / 4, 0], sh: 'flat' });
          tintG(cap, 0x5a4029, 0.02, vs, 0.2);
          out.push(cap);
          for (const [y, ry, len] of [[1.72, 0.35, 0.9], [1.42, -0.5, 0.8], [1.12, 2.4, 0.7]]) {
            const board = piece(rboxG(len, 0.22, 0.05, 0.03, 1), {});
            board.translate(len / 2 - 0.05, 0, 0);
            const tipG = piece(coneG(0.13, 0.16, 3), { r: [0, 0, -Math.PI / 2], s: [1, 1, 0.3] });
            tipG.translate(len + 0.02, 0, 0);
            for (const b of [board, tipG]) { b.rotateY(ry); b.translate(0, y, 0); }
            ramp(board, 0xc8a878, 0xe0c898, y - 0.1, y + 0.1, { noise: 0.03, seed: vs + y * 9, lift: 0.2 });
            tintG(tipG, 0xc8a878, 0.02, vs, 0.2);
            out.push(board, tipG);
          }
          return out;
        });
        return [V(g, SOLID_V, [0.05, 0.03]), shadowP(0.4, 0.04)];
      },
    },
    bunting: {
      // a sagging string of pennants between two slim poles, 9 m span
      variants: 2, collider: 0, noPathAvoid: true,
      make: (rng, v) => {
        const vs = Math.floor(rng() * 1e6);
        const span = 9, H = 4.2;
        const poles = merged(`bunP${vs}`, () => {
          const out = [];
          for (const sd of [-1, 1]) {
            const p = piece(cylG(0.05, 0.07, H + 0.2, 7), { t: [sd * span / 2, (H + 0.2) / 2, 0], sh: 'smooth' });
            ramp(p, 0x6a4c33, 0x94704a, 0, H, { seed: vs + sd, lift: 0.25 });
            out.push(p);
            const knob = piece(sphereG(1, 7, 5), { t: [sd * span / 2, H + 0.24, 0], s: 0.08 });
            tintG(knob, 0xd8b460, 0.02, vs, 0.1);
            out.push(knob);
          }
          return out;
        });
        const flags = merged(`bunF${vs}`, () => {
          const out = [];
          const cols = (v ?? 0) % 2 ? [0xe8604e, 0xffd24a, 0x4f8fd0, 0xfff4f8, 0x6aba58] : [0xff8aa0, 0xfff0a8, 0x8ac8f0, 0xc8a0ff, 0xfff4f8];
          const n = 14;
          const sag = (u) => H - 0.1 - Math.sin(u * Math.PI) * 0.7;
          for (let i = 0; i <= n * 3; i++) { // the string (short smooth segments)
            const u0 = i / (n * 3), u1 = (i + 1) / (n * 3);
            if (u1 > 1) break;
            const x0 = (u0 - 0.5) * span, x1 = (u1 - 0.5) * span, y0 = sag(u0), y1 = sag(u1);
            const seg = piece(cylG(0.012, 0.012, 1, 4), {
              t: [(x0 + x1) / 2, (y0 + y1) / 2, 0], s: [1, Math.hypot(x1 - x0, y1 - y0), 1], r: [0, 0, Math.atan2(x1 - x0, y1 - y0) * -1 + 0],
            });
            tintG(seg, 0xe8e0d0, 0.01, vs, 0);
            out.push(seg);
          }
          for (let i = 0; i < n; i++) {
            const u = (i + 0.5) / n;
            const x = (u - 0.5) * span, y = sag(u);
            const f = piece(geo('pennant', () => {
              const gg = new THREE.BufferGeometry();
              const pos = [-0.17, 0, 0, 0, -0.42, 0, 0.17, 0, 0, 0.17, 0, 0, 0, -0.42, 0, -0.17, 0, 0];
              gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
              gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2));
              gg.computeVertexNormals();
              return gg;
            }), { t: [x, y, 0], r: [0, 0, 0] });
            tintG(f, cols[i % cols.length], 0.02, vs + i, 0);
            out.push(f);
          }
          return out;
        });
        return [V(poles, SOLID_V, [0.04, 0.02]), { ...V(flags, FLAG_V, [0.05, 0.03]), shadow: false }];
      },
    },
    path_lantern: {
      // a short stake with a paper lantern — warm dots along lanes at night
      variants: 1, collider: 0, noPathAvoid: true,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`plM${vs}`, () => {
          const out = [];
          const stake = piece(cylG(0.035, 0.045, 1.2, 6), { t: [0, 0.6, 0], sh: 'smooth' });
          ramp(stake, 0x5a4029, 0x7d5c3d, 0, 1.2, { seed: vs, lift: 0.25 });
          out.push(stake);
          const hook = piece(rboxG(0.3, 0.04, 0.04, 0.015, 1), { t: [0.12, 1.2, 0] });
          tintG(hook, 0x4a3522, 0.02, vs, 0.2);
          out.push(hook);
          const cap = piece(coneG(0.13, 0.08, 10), { t: [0.24, 1.12, 0], sh: 'smooth' });
          tintG(cap, 0x3a2e28, 0.02, vs, 0.1);
          out.push(cap);
          return out;
        });
        const gl = merged(`plG${vs}`, () => [piece(sphereG(1, 10, 7), { t: [0.24, 0.98, 0], s: [0.12, 0.15, 0.12] })]);
        return [V(g, SOLID_V, [0.04, 0.02]), P(gl, LAMP_GLASS, 0xffc890, [0, 0, 0], 1, [0, 0, 0], 0, false)];
      },
    },
    bench: {
      variants: 1, collider: 0.6,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`benchM${vs}`, () => {
          const out = [];
          for (const z of [-0.12, 0.12]) {
            const slat = piece(rboxG(1.6, 0.06, 0.2, 0.025, 1), { t: [0, 0.46, z] });
            ramp(slat, 0x96704a, 0xbc946a, 0.4, 0.5, { noise: 0.03, seed: vs + z * 9, lift: 0.2 });
            out.push(slat);
          }
          const back = piece(rboxG(1.6, 0.2, 0.05, 0.025, 1), { t: [0, 0.84, -0.26], r: [-0.18, 0, 0] });
          ramp(back, 0x96704a, 0xbc946a, 0.74, 0.94, { noise: 0.03, seed: vs + 5, lift: 0.2 });
          out.push(back);
          for (const sd of [-1, 1]) {
            const leg = piece(rboxG(0.08, 0.46, 0.46, 0.025, 1), { t: [sd * 0.68, 0.23, 0] });
            tintG(leg, 0x3a3634, 0.02, vs + sd, 0.25);
            out.push(leg);
            const up = piece(rboxG(0.07, 0.5, 0.07, 0.02, 1), { t: [sd * 0.68, 0.7, -0.24], r: [-0.18, 0, 0] });
            tintG(up, 0x3a3634, 0.02, vs + sd * 3, 0.25);
            out.push(up);
          }
          return out;
        });
        return [V(g, SOLID_V, [0.05, 0.03]), shadowP(0.9, 0.04)];
      },
    },
    woodpile: {
      variants: 2, collider: 0.7,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`wpM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const out = [];
          const rows = [5, 4, 3];
          rows.forEach((n, ry) => {
            for (let i = 0; i < n; i++) {
              const x = (i - (n - 1) / 2) * 0.26, y = 0.12 + ry * 0.21;
              const lg = piece(cylG(0.11, 0.11, 1.1, 8), { t: [x, y, (r2() - 0.5) * 0.08], r: [Math.PI / 2, 0, 0], sh: 'crease' });
              ramp(lg, 0x6a4a2e, 0x9a7650, y - 0.1, y + 0.1, { noise: 0.03, seed: vs + i + ry * 9, lift: 0.2 });
              // pale cut ends: color by |z|
              const col = lg.attributes.color, pos = lg.attributes.position, nrm = lg.attributes.normal;
              for (let k = 0; k < col.count; k++) if (Math.abs(nrm.getZ(k)) > 0.9) col.setXYZ(k, 0.86, 0.72, 0.5);
              out.push(lg);
            }
          });
          return out;
        });
        return [V(g, SOLID_V, [0.06, 0.04]), shadowP(0.8, 0.04)];
      },
    },
    cliff_wall: {
      // a big weathered rock outcrop (edge framing for rocky zones)
      variants: 3, collider: 2.6, noCluster: true, sinkY: 0.3,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`cliffM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const out = [];
          const n = 3 + Math.floor(r2() * 2);
          for (let i = 0; i < n; i++) {
            const x = (i - (n - 1) / 2) * 1.9 + (r2() - 0.5) * 0.6;
            const h = 2.6 + r2() * 2.4, w = 1.4 + r2() * 0.8;
            const st = piece(rockG(LOD, (vs + i * 5) % 61), {
              t: [x, h * 0.28, (r2() - 0.5) * 0.9], s: [w, h, w * (0.8 + r2() * 0.4)], r: [0, r2() * TAU, (r2() - 0.5) * 0.12], sh: 'soft',
            });
            paintStone(st, 0x6e6a62, 0xa8a398, -0.2, h * 1.1, vs + i);
            mossify(st, { amount: 0.4, seed: (vs + i) % 89 });
            out.push(st);
          }
          out.push(...tuftPieces(r2, { n: 7, R: 2.8, seed: vs + 9 }));
          return out;
        });
        return [V(g, SOLID_V, [0.06, 0.03]), shadowP(3.6, 0.04)];
      },
    },
    boardwalk: {
      // straight plank walkway on posts over water/shallows, 6 m along local Z
      variants: 1, collider: 0, ground: 'water', noPathAvoid: true,
      surface: 'wood', surfaceRect: [0.9, 3.0],
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`bwM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const out = [];
          for (let i = 0; i < 9; i++) {
            const pl = piece(rboxG(1.8, 0.09, 0.62, 0.02, 1), { t: [(r2() - 0.5) * 0.05, 0.55, -2.7 + i * 0.67], r: [0, (r2() - 0.5) * 0.04, 0] });
            ramp(pl, i % 2 ? 0x8a6a48 : 0x967658, i % 2 ? 0xb08a60 : 0xbc9868, 0.5, 0.6, { noise: 0.03, seed: vs + i, lift: 0.2 });
            out.push(pl);
          }
          for (const pz of [-2.6, 0, 2.6]) for (const sd of [-1, 1]) {
            const post = piece(cylG(0.08, 0.1, 3.4, 7), { t: [sd * 0.85, -1.1, pz], sh: 'smooth' });
            ramp(post, 0x2e2620, 0x6b4a33, -2, 0.7, { seed: vs + pz + sd, lift: 0.2 });
            out.push(post);
          }
          return out;
        });
        return [V(g, SOLID_V, [0.06, 0.03])];
      },
    },
    deck: {
      // square plank platform on stilts with a low rail (market / mooring)
      variants: 1, collider: 0, ground: 'water', noPathAvoid: true,
      surface: 'wood', surfaceRect: [3.0, 3.0],
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const g = merged(`dkM${vs}`, () => {
          const out = [];
          const top = piece(rboxG(6.2, 0.16, 6.2, 0.04, 1), { t: [0, 0.52, 0] });
          ramp(top, 0x7a5a3a, 0xa8845c, 0.44, 0.6, { noise: 0.03, seed: vs, lift: 0.2 });
          out.push(top);
          for (let i = 0; i < 9; i++) {
            const sm = piece(boxG(6.22, 0.02, 0.03), { t: [0, 0.605, -2.8 + i * 0.7] });
            tintG(sm, 0x5a4029, 0.02, vs + i, 0);
            out.push(sm);
          }
          for (const px of [-2.9, 0, 2.9]) for (const pz of [-2.9, 0, 2.9]) {
            const post = piece(cylG(0.1, 0.12, 3.4, 7), { t: [px, -1.1, pz], sh: 'smooth' });
            ramp(post, 0x2e2620, 0x6b4a33, -2, 0.7, { seed: vs + px + pz * 3, lift: 0.2 });
            out.push(post);
          }
          for (const [ax, az, len, ry] of [[-3, 0, 6, 0], [0, -3, 6, Math.PI / 2]]) {
            const rail = piece(rboxG(0.07, 0.07, len, 0.02, 1), { t: [ax, 1.35, az], r: [0, ry, 0] });
            tintG(rail, WOOD, 0.02, vs + ax, 0.2);
            out.push(rail);
          }
          for (const [px, pz] of [[-3, -3], [-3, 3], [3, -3], [-3, 0], [0, -3]]) {
            const rp = piece(rboxG(0.1, 0.85, 0.1, 0.03, 1), { t: [px, 0.95, pz] });
            tintG(rp, WOOD, 0.02, vs + px * 2 + pz, 0.2);
            out.push(rp);
          }
          return out;
        });
        return [V(g, SOLID_V, [0.05, 0.03])];
      },
    },
    beacon: {
      // stilted wooden lantern tower standing in the lake — a landmark by day,
      // a warm light across the water by night
      variants: 1, collider: 1.6, ground: 'water',
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const glowL = [];
        const g = merged(`bcM${vs}`, () => {
          const out = [];
          const H = 6.2;
          for (const [px, pz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
            const leg = piece(cylG(0.1, 0.16, H + 2.5, 8), { t: [px * 0.8, (H - 2.5) / 2, pz * 0.8], r: [pz * 0.06, 0, -px * 0.06], sh: 'smooth' });
            ramp(leg, 0x2e2620, 0x7a5a3a, -2, H, { noise: 0.03, seed: vs + px + pz * 3, lift: 0.2 });
            out.push(leg);
          }
          for (const y of [1.2, 3.4]) for (const [ax, az, ry] of [[0, -1.0, 0], [0, 1.0, 0], [-1.0, 0, Math.PI / 2], [1.0, 0, Math.PI / 2]]) {
            const br = piece(rboxG(2.1 - y * 0.08, 0.1, 0.08, 0.02, 1), { t: [ax, y, az], r: [0, ry, 0] });
            tintG(br, WOOD, 0.02, vs + y + ax + az, 0.2);
            out.push(br);
          }
          const plat = piece(rboxG(2.9, 0.18, 2.9, 0.05, 1), { t: [0, H, 0] });
          ramp(plat, 0x7a5a3a, 0xa8845c, H - 0.1, H + 0.1, { seed: vs, lift: 0.2 });
          out.push(plat);
          for (let i = 0; i < 12; i++) { // gallery rail posts
            const a = (i / 12) * TAU;
            const rp = piece(cylG(0.035, 0.035, 0.7, 5), { t: [Math.cos(a) * 1.35, H + 0.44, Math.sin(a) * 1.35] });
            tintG(rp, WOOD_D, 0.02, vs + i, 0.2);
            out.push(rp);
          }
          const rail = piece(geo('bcRail', () => new THREE.TorusGeometry(1.35, 0.04, 5, 24)), { t: [0, H + 0.8, 0], r: [Math.PI / 2, 0, 0], sh: 'smooth' });
          tintG(rail, WOOD, 0.02, vs, 0.2);
          out.push(rail);
          for (const [px, pz] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) {
            const mul = piece(rboxG(0.12, 1.3, 0.12, 0.03, 1), { t: [px, H + 0.75, pz] });
            tintG(mul, 0x3a3634, 0.02, vs + px + pz, 0.2);
            out.push(mul);
          }
          glowL.push(piece(rboxG(1.1, 1.1, 1.1, 0.12, 1), { t: [0, H + 0.72, 0] }));
          const cap = piece(coneG(1.15, 0.95, 8), { t: [0, H + 1.85, 0], r: [0, Math.PI / 8, 0], sh: 'crease' });
          ramp(cap, 0x7e3a2e, 0xc2604a, H + 1.4, H + 2.3, { seed: vs + 2, lift: 0.15 });
          out.push(cap);
          const pole = piece(cylG(0.03, 0.03, 1.2, 5), { t: [0, H + 2.8, 0] });
          tintG(pole, WOOD_D, 0.02, vs, 0);
          out.push(pole);
          const flag = piece(boxG(0.6, 0.34, 0.02), { t: [0.32, H + 3.18, 0] });
          tintG(flag, 0x4f8fd0, 0.02, vs, 0);
          out.push(flag);
          return out;
        });
        const gl = merged(`bcG${vs}`, () => glowL);
        return [V(g, SOLID_V, [0.04, 0.02]), P(gl, LAMP_GLASS, 0xffe2b0, [0, 0, 0], 1, [0, 0, 0], 0, false)];
      },
      effect: (x, y, z, s) => {
        if (lightBudget <= 0) return null;
        lightBudget--;
        const l = new THREE.PointLight(0xffd9a0, 0, 16 * s, 1.6);
        l.position.set(x, y + 6.9 * s, z);
        group.add(l);
        nightLights.push({ light: l, base: 2.2, phase: 0 });
        return null;
      },
    },
    windmill: {
      // pastoral landmark: tapered plaster tower on a stone plinth, shingled
      // cap, and four canvas sails that turn slowly (animated set-piece)
      variants: 1, collider: 2.5, sinkY: 0.2,
      make: (rng) => {
        const vs = Math.floor(rng() * 1e6);
        const glowL = [];
        const g = merged(`wmM${vs}`, () => {
          const r2 = seededRandom(vs + 1);
          const out = [];
          const plinth = piece(cylG(2.55, 2.75, 0.8, 16), { t: [0, 0.3, 0], sh: 'crease' });
          ramp(plinth, 0x7a766c, 0xa4a094, -0.1, 0.7, { noise: 0.03, seed: vs, lift: 0.3 });
          mossify(plinth, { amount: 0.4, seed: vs % 89 });
          out.push(plinth);
          const pts = [];
          for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(2.25 - 0.62 * t + 0.08 * Math.sin(t * Math.PI), 0.6 + t * 6.6)); }
          const tw = new THREE.LatheGeometry(pts, HI ? 20 : 14);
          const tower = piece(tw, { sh: 'smooth' });
          tw.dispose();
          ramp(tower, 0xdac8a4, 0xfbf1dc, 0.6, 7.2, { noise: 0.015, seed: vs + 1, lift: 0.25 });
          out.push(tower);
          for (const y of [2.9, 5.2]) { // timber bands
            const bd = piece(cylG(2.25 - 0.62 * ((y - 0.6) / 6.6) + 0.07, 2.25 - 0.62 * ((y - 0.6) / 6.6) + 0.07, 0.14, HI ? 20 : 14), { t: [0, y, 0], sh: 'crease' });
            tintG(bd, WOOD, 0.03, vs + y, 0.25);
            out.push(bd);
          }
          const cap = piece(coneG(1, 1, HI ? 20 : 14), { t: [0, 7.2 + 1.2, 0], s: [2.05, 2.4, 2.05], sh: 'soft' });
          ramp(cap, 0x7e3a2e, 0xc2604a, 7.2, 9.6, { noise: 0.02, seed: vs + 2, lift: 0.15 });
          // shingle rings painted into the cap
          const cc = cap.attributes.color, cp = cap.attributes.position;
          for (let i = 0; i < cc.count; i++) { const k = 0.92 + 0.08 * Math.sign(Math.sin(cp.getY(i) * 9)); cc.setXYZ(i, cc.getX(i) * k, cc.getY(i) * k, cc.getZ(i) * k); }
          out.push(cap);
          const knob = piece(sphereG(1, 8, 6), { t: [0, 9.75, 0], s: 0.16 });
          tintG(knob, 0xd8b460, 0.02, vs, 0.1);
          out.push(knob);
          const hub = piece(cylG(0.28, 0.34, 0.9, 10), { t: [0, 6.7, 1.95], r: [Math.PI / 2, 0, 0], sh: 'crease' });
          tintG(hub, WOOD_D, 0.02, vs + 3, 0.2);
          out.push(hub);
          doorPieces(out, glowL, { x: 0, y0: 0.7, z: 2.2, w: 0.9, h: 1.6, seed: vs + 20, lantern: 1 });
          windowPieces(out, glowL, { x: 0.97, y: 3.9, z: 1.78, ry: 0.5, w: 0.44, h: 0.5, shutter: 0x6a9a58, box: true, seed: vs + 30 });
          windowPieces(out, glowL, { x: -1.81, y: 2.3, z: 1.16, ry: -1.0, w: 0.44, h: 0.5, shutter: 0x6a9a58, box: false, seed: vs + 31 });
          out.push(...tuftPieces(r2, { n: 8, R: 2.9, seed: vs + 10 }));
          return out;
        });
        const gl = merged(`wmG${vs}`, () => glowL);
        return [V(g, SOLID_V, [0.03, 0.02]), shadowP(3.2), P(gl, WINDOW, 0xffd9a8, [0, 0, 0], 1, [0, 0, 0], 0, false)];
      },
      effect: (x, y, z, s, rng, ctx) => makeWindmillFX(x, y, z, s, ctx.yaw),
    },
    boat: {
      variants: 1, collider: 0.9, ground: 'water', faceWater: true,
      make: () => [],
      effect: (x, y, z, s, rng, ctx) => makeBoatFX(x, y, z, s, rng, ctx.yaw),
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

  function makeWindmillFX(x, y, z, s, yaw) {
    const gs = geo('wmSails', () => {
      const out = [];
      for (let b = 0; b < 4; b++) {
        const blade = [];
        const spar = piece(rboxG(0.14, 4.3, 0.12, 0.03, 1), { t: [0, 2.35, 0] });
        tintG(spar, 0x5a4029, 0.02, b, 0.2);
        blade.push(spar);
        const sail = piece(rboxG(0.95, 3.3, 0.04, 0.015, 1), { t: [0.55, 2.7, -0.04] });
        ramp(sail, 0xd8ccb0, 0xf6eedc, 1.0, 4.4, { noise: 0.015, seed: b, lift: 0.15 });
        blade.push(sail);
        for (let k = 0; k < 5; k++) {
          const slat = piece(boxG(1.02, 0.05, 0.06), { t: [0.52, 1.2 + k * 0.78, 0.02] });
          tintG(slat, 0x6f5138, 0.02, b + k, 0.2);
          blade.push(slat);
        }
        for (const pc of blade) { pc.rotateZ((b / 4) * TAU); out.push(pc); }
      }
      const g = mergeGeometries(out, false);
      for (const pc of out) pc.dispose();
      return g;
    });
    const fx = new THREE.Group();
    fx.position.set(x, y, z);
    fx.rotation.y = yaw;
    fx.scale.setScalar(s);
    const sails = new THREE.Mesh(gs, SOLID_V);
    sails.position.set(0, 6.7, 2.45);
    sails.castShadow = true;
    fx.add(sails);
    group.add(fx);
    let t = Math.random() * 10;
    return (dt) => { t += dt; sails.rotation.z = -t * 0.35; };
  }

  function makeBoatFX(x, y, z, s, rng, yaw = 0) {
    const hue = [0x3f78b8, 0xc8503e, 0x4f8a50, 0xd8a040][Math.floor(rng() * 4)];
    const gb = geo(`boatG${hue}`, () => {
      const out = [];
      // hull: lower half-ellipsoid, bow pinched to a point, painted with a stripe
      const hull = piece(geo('boatHullSrc', () => new THREE.SphereGeometry(1, 18, 8, 0, TAU, Math.PI / 2, Math.PI / 2)), { s: [0.72, 0.46, 1.55], sh: 'smooth' });
      const hp = hull.attributes.position;
      for (let i = 0; i < hp.count; i++) {
        const zz = hp.getZ(i), k = zz > 0 ? 1 - 0.55 * Math.pow(zz / 1.55, 2) : 1 - 0.18 * Math.pow(zz / 1.55, 2);
        hp.setX(i, hp.getX(i) * k);
        hp.setY(i, hp.getY(i) + 0.12 * Math.pow(Math.max(0, zz) / 1.55, 2) * 0);
      }
      hull.translate(0, 0.42, 0);
      smoothGeometry(hull);
      ramp(hull, lerpColorHex(hue, 0x101418, 0.45), hue, -0.05, 0.42, { noise: 0.02, seed: 3, lift: 0.2 });
      const hc = hull.attributes.color;
      for (let i = 0; i < hc.count; i++) if (hp.getY(i) > 0.3) hc.setXYZ(i, 0.93, 0.9, 0.84); // pale gunwale stripe
      out.push(hull);
      const floor = piece(rboxG(0.9, 0.05, 2.3, 0.02, 1), { t: [0, 0.16, -0.1] });
      tintG(floor, 0x8a6a48, 0.03, 4, 0.1);
      out.push(floor);
      const rim = piece(geo('boatRim', () => new THREE.TorusGeometry(1, 0.05, 5, 28)), { t: [0, 0.43, 0], r: [Math.PI / 2, 0, 0], s: [0.7, 1.5, 1], sh: 'smooth' });
      const rp = rim.attributes.position;
      for (let i = 0; i < rp.count; i++) { const zz = rp.getZ(i); if (zz > 0) rp.setX(i, rp.getX(i) * (1 - 0.55 * Math.pow(zz / 1.5, 2))); }
      tintG(rim, 0x6a4c33, 0.02, 5, 0.2);
      out.push(rim);
      for (const bz of [-0.55, 0.35]) {
        const bench = piece(rboxG(1.2, 0.06, 0.3, 0.02, 1), { t: [0, 0.34, bz] });
        tintG(bench, 0xa8845c, 0.03, 6 + bz, 0.2);
        out.push(bench);
      }
      for (const sd of [-1, 1]) {
        const oar = piece(cylG(0.025, 0.03, 1.9, 5), { t: [sd * 0.62, 0.42, -0.25], r: [1.35, 0, sd * 0.25], sh: 'smooth' });
        tintG(oar, 0x8a6a48, 0.02, 7, 0.2);
        out.push(oar);
        const blade = piece(rboxG(0.14, 0.02, 0.4, 0.01, 1), { t: [sd * 0.78, 0.42, 0.62], r: [0.2, 0, sd * 0.25] });
        tintG(blade, 0x8a6a48, 0.02, 8, 0.2);
        out.push(blade);
      }
      const g = mergeGeometries(out, false);
      for (const pc of out) pc.dispose();
      return g;
    });
    const fx = new THREE.Group();
    fx.position.set(x, y, z);
    fx.scale.setScalar(s);
    const me = new THREE.Mesh(gb, SOLID_V);
    me.castShadow = true;
    me.position.y = -0.18;
    fx.add(me);
    fx.rotation.y = yaw;
    group.add(fx);
    const phase = rng() * TAU;
    const yaw0 = fx.rotation.y;
    let t = 0;
    return (dt) => {
      t += dt;
      fx.position.y = y + Math.sin(t * 0.9 + phase) * 0.045;
      fx.rotation.z = Math.sin(t * 0.7 + phase) * 0.03;
      fx.rotation.x = Math.sin(t * 0.55 + phase + 1) * 0.02;
      fx.rotation.y = yaw0 + Math.sin(t * 0.13 + phase) * 0.06;
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
      if (def.collider && !clearFor(def, x, z, (entry.scale ?? 1) * 1.1)) continue; // keep-outs (see clearFor)
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
      const parts = def.make(brng, v, singles);
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
        im.name = `${kind}:${v}:${pi}`;
        im.castShadow = part.shadow !== false && !def.noShadow;
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

  // ------------------------------------------------------------- keep-outs
  // Generated colliding props (scatter / border / line / ring) must never
  // crowd the walkable skeleton: they keep >= CLEAR m from every path edge,
  // portal ring, NPC, interactable, the zone spawn and every portal arrival
  // point other zones drop the player at. Hand-placed `at:` props are
  // authored compositions and are audited separately.
  const CLEAR = 3;
  const keepOut = [];
  for (const p of zone.portals ?? []) keepOut.push([p.at[0], p.at[1], (p.radius ?? 3) + CLEAR]);
  for (const n of zone.npcs ?? []) keepOut.push([n.at[0], n.at[1], CLEAR]);
  for (const it of zone.interactables ?? []) keepOut.push([it.at[0], it.at[1], CLEAR]);
  if (zone.spawn) keepOut.push([zone.spawn[0], zone.spawn[1], CLEAR + 4]);
  try {
    for (const oz of Object.values(ZONES)) for (const p of oz.portals ?? []) {
      if (p.to === zone.id && p.spawn) keepOut.push([p.spawn[0], p.spawn[1], CLEAR + 5]);
    }
  } catch (e) { /* gallery / partial worlds */ }
  const portalSet = (zone.portals ?? []).map((p) => [p.at[0], p.at[1]]);
  function clearFor(def, x, z, s) {
    const r = (def.collider ?? 0) * s;
    if (!r) return true;
    for (const [kx, kz, kr] of keepOut) {
      const d = kr + r;
      if ((x - kx) ** 2 + (z - kz) ** 2 < d * d) return false;
    }
    if (paths.length) {
      const pi = pathInfo(x, z);
      if (pi.d < pi.w * 0.5 + Math.max(CLEAR - 0.5, r + 1.5)) return false;
    }
    return true;
  }

  // Edge framing: rings of instances walking the square zone border, inset
  // from the terrain edge, with wide gaps where portals open the border.
  //   border: { inset=6, step=8, rows=1, rowGap=step*0.85, jitter=step*0.3, gap=14 }
  function borderPositions(entry, def, rngS) {
    const b = entry.border;
    const inset = b.inset ?? 6, step = b.step ?? 8, rows = b.rows ?? 1;
    const rowGap = b.rowGap ?? step * 0.85, jit = b.jitter ?? step * 0.3, gap = b.gap ?? 14;
    const out = [];
    for (let r = 0; r < rows; r++) {
      const d = half - inset - r * rowGap;
      if (d < 10) break;
      const side = 2 * d, n = Math.max(4, Math.floor((4 * side) / step));
      for (let i = 0; i < n; i++) {
        const u = ((i + (r % 2) * 0.5 + rngS() * 0.2) / n) * 4 * side;
        const edge = Math.floor(u / side), t = u - edge * side - d;
        let x = edge === 0 ? t : edge === 1 ? d : edge === 2 ? -t : -d;
        let z = edge === 0 ? -d : edge === 1 ? t : edge === 2 ? d : -t;
        x += (rngS() - 0.5) * jit; z += (rngS() - 0.5) * jit;
        if (Math.abs(x) > half - 1 || Math.abs(z) > half - 1) continue;
        if (portalSet.some(([px, pz]) => Math.hypot(x - px, z - pz) < gap)) continue;
        if (inWater(x, z)) continue;
        out.push([x, z]);
      }
    }
    return out;
  }
  // Evenly spaced along a segment: line: [[x0,z0],[x1,z1]], step, jitter;
  // align:true yaws each instance along the line (fences, hedges).
  function linePositions(entry) {
    const [[x0, z0], [x1, z1]] = entry.line;
    const L = Math.hypot(x1 - x0, z1 - z0), step = entry.step ?? 3;
    const n = Math.max(1, Math.floor(L / step) + 1);
    const out = [];
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      out.push([x0 + (x1 - x0) * u, z0 + (z1 - z0) * u]);
    }
    return { pts: out, yaw: Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2 };
  }
  // Around a circle: ring: [cx, cz, r], count; align 'center' faces inward.
  function ringPositions(entry) {
    const [cx, cz, r] = entry.ring;
    const n = entry.count ?? 8, a0 = entry.startAngle ?? 0;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, a]);
    }
    return out;
  }

  // ------------------------------------------------------------- run placement
  const byKindScatter = new Map(); // kind -> [{x,z,y,yaw,s,...}]
  const byKindSingle = new Map();
  let dropped = 0;

  for (const entry of (zone.props ?? [])) {
    const def = KINDS[entry.kind];
    if (!def) { warnOnce(`unknown prop kind "${entry.kind}" — skipped`); continue; }
    const eRng = seededRandom(seed * 13 + hashStr(entry.kind) + Math.round((entry.at?.[0] ?? entry.area?.[0] ?? entry.line?.[0]?.[0] ?? entry.ring?.[0] ?? 0) * 7)
      + Math.round((entry.at?.[1] ?? entry.area?.[1] ?? entry.line?.[0]?.[1] ?? entry.ring?.[1] ?? 0) * 3) + (entry.border ? 911 : 0));
    if (entry.at) {
      const [x, z] = entry.at;
      const s = (entry.scale ?? 1);
      const y0 = entry.ground === 'water' && water ? (water.level ?? 0) + 0.05 : placementY(entry.kind, def, x, z, eRng);
      const pl = {
        x, z, y: y0 + (entry.lift ?? 0),
        yaw: yawFor(entry, def, x, z, eRng), s,
        sy: s * (1 + (eRng() - 0.5) * 0.06),
        hueJ: (eRng() - 0.5) * 2, lumJ: (eRng() - 0.5) * 2,
      };
      if (!byKindSingle.has(entry.kind)) byKindSingle.set(entry.kind, []);
      byKindSingle.get(entry.kind).push(pl);
      continue;
    }
    // generated placements: [x, z, yawOverride?]
    let pts;
    let lineYaw = null;
    if (entry.border) pts = borderPositions(entry, def, eRng);
    else if (entry.line) { const L = linePositions(entry); pts = L.pts; lineYaw = L.yaw; }
    else if (entry.ring) pts = ringPositions(entry);
    else {
      pts = scatterPositions(entry, def, eRng);
      // tiny ground dressing thins on lower quality tiers
      if (SMALL_MUL < 1 && !def.collider) pts = pts.filter(() => eRng() < SMALL_MUL);
    }
    const list = byKindScatter.get(entry.kind) ?? [];
    const sVar = entry.scaleVar ?? (entry.line || entry.ring ? 0.12 : 0.5);
    for (const p of pts) {
      let [x, z] = p;
      if (entry.line || entry.ring) { x += (eRng() - 0.5) * (entry.jitter ?? 0); z += (eRng() - 0.5) * (entry.jitter ?? 0); }
      const s = (entry.scale ?? 1) * (1 - sVar * 0.4 + eRng() * sVar);
      if (!clearFor(def, x, z, s)) { dropped++; continue; }
      let yaw;
      if (entry.align && lineYaw != null) yaw = lineYaw + (entry.rot ?? 0) + (eRng() - 0.5) * 0.08;
      else if (entry.align === 'center' && entry.ring) yaw = Math.atan2(entry.ring[0] - x, entry.ring[1] - z) + (entry.rot ?? 0);
      else yaw = yawFor(entry, def, x, z, eRng);
      list.push({
        x, z, y: placementY(entry.kind, def, x, z, eRng), yaw, s,
        sy: s * (1 + (eRng() - 0.5) * 0.14),
        hueJ: (eRng() - 0.5) * 2, lumJ: (eRng() - 0.5) * 2,
      });
    }
    byKindScatter.set(entry.kind, list);
  }
  for (const [kind, list] of byKindScatter) realize(kind, list, null, null, false);
  for (const [kind, list] of byKindSingle) realize(kind, list, null, null, true);
  group.userData.dressing = { dropped, keepOut: keepOut.length };

  // ------------------------------------------------------------- master updater
  let T = Math.random() * 100;
  updaters.push((dt) => {
    T += dt;
    for (let i = 0; i < pulseMats.length; i++) {
      const p = pulseMats[i];
      p.m.emissiveIntensity = p.base + Math.sin(T * p.speed + p.phase) * p.amp * p.base;
    }
    const day = daylight(G.calendar?.dayTime ?? 0.5);
    const night = 1 - day;
    const nightSoft = night * night * (3 - 2 * night);
    for (let i = 0; i < nightMats.length; i++) {
      const nm = nightMats[i];
      nm.m.emissiveIntensity = nm.base * (nm.day + (1 - nm.day) * nightSoft);
    }
    const liftK = 0.3 + 0.7 * day;
    for (let i = 0; i < liftSets.length; i++) liftSets[i].u.value = liftSets[i].base * liftK;
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
    pulseMats.length = nightMats.length = nightLights.length = pulseLights.length = liftSets.length = 0;
    updaters.length = 0;
    surfacePatches.length = 0;
    group.clear();
  }

  return { group, colliders, updaters, surfacePatches, dispose };
}
