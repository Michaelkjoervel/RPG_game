// ============================================================================
// world/terrain.js — seeded heightfield terrain per biome kind, vertex-colored
// ground (grass/dirt/stone/sand/snow blended by height+slope+biome), paths
// flattened & dirt-colored.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   buildTerrain(zone) -> { mesh, heightAt(x,z) -> y, dispose() }
//
// `heightAt` and the mesh are guaranteed to match exactly because both are
// driven by the *same* analytic height function (evaluated directly per
// query rather than sampled from a baked grid, so there is no discretization
// error at all — strictly better than a bilinear heightmap lookup).
// ============================================================================
import * as THREE from 'three';
import { seededRandom, hashStr } from '../core/rng.js';
import { clamp, clamp01, lerp } from '../core/math.js';
import { mat, groundPalette } from '../gfx/materials.js';

const SNOW_LOW = 10, SNOW_HIGH = 15; // straddles player.js's SNOWLINE_Y=12 footstep cutoff

// ---------------------------------------------------------------- seeded gradient noise
// Hand-rolled 2D Perlin-style gradient noise (no external deps). Deterministic
// per seed via a Fisher-Yates shuffle of the permutation table.
function makeNoise2D(seed) {
  const rng = seededRandom(seed >>> 0);
  const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const gradAt = (ix, iz) => GRAD[perm[(ix & 255) + perm[iz & 255]] & 7];

  return function noise2D(x, z) {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const sx = x - x0, sz = z - z0;
    const x1 = x0 + 1, z1 = z0 + 1;
    const g00 = gradAt(x0, z0), g10 = gradAt(x1, z0), g01 = gradAt(x0, z1), g11 = gradAt(x1, z1);
    const d00 = g00[0] * sx + g00[1] * sz;
    const d10 = g10[0] * (sx - 1) + g10[1] * sz;
    const d01 = g01[0] * sx + g01[1] * (sz - 1);
    const d11 = g11[0] * (sx - 1) + g11[1] * (sz - 1);
    const u = fade(sx), v = fade(sz);
    return lerp(lerp(d00, d10, u), lerp(d01, d11, u), v) * 1.4; // ~ -1..1
  };
}

function fbm(noise2D, x, z, octaves, freq, amp) {
  let sum = 0, f = freq, a = amp;
  for (let i = 0; i < octaves; i++) {
    sum += noise2D(x * f, z * f) * a;
    f *= 2.02; a *= 0.5;
  }
  return sum;
}

// Quantizes `h` into flat bands `step` tall, connected by a short cosine ramp
// (walkable "steps", not sheer cliffs) — used for the ruins' broken terraces.
// `ramp` is the fraction of each band's width spent easing into the next level.
function smoothTerrace(h, step, ramp) {
  const t = h / step;
  const i = Math.floor(t);
  const f = t - i;
  let level;
  if (f < ramp) {
    const u = 0.5 - 0.5 * Math.cos(Math.PI * (f / ramp));
    level = (i - 1) + u;
  } else if (f > 1 - ramp) {
    const u = 0.5 - 0.5 * Math.cos(Math.PI * ((f - (1 - ramp)) / ramp));
    level = i + u;
  } else {
    level = i;
  }
  return level * step;
}

// ---------------------------------------------------------------- path helpers
function distToSeg(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const L2 = dx * dx + dz * dz || 1e-6;
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1);
  const px = a[0] + dx * t, pz = a[1] + dz * t;
  return Math.hypot(x - px, z - pz);
}
function makePathInfo(paths) {
  if (!paths || !paths.length) return null;
  return function pathInfo(x, z) {
    let best = Infinity, bw = 0;
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      const d = distToSeg(x, z, p.from, p.to);
      if (d < best) { best = d; bw = p.width ?? 3; }
    }
    return { d: best, w: bw };
  };
}

// ---------------------------------------------------------------- per-kind height shape
function shapeHeight(kind, noise2D, x, z, hills, half, zone) {
  switch (kind) {
    case 'meadow':
      return fbm(noise2D, x, z, 4, 0.011, 2.1) * hills + fbm(noise2D, x * 2 + 91, z * 2 + 47, 2, 0.05, 0.3) * hills;
    case 'forest':
      return fbm(noise2D, x, z, 5, 0.015, 2.8) * hills + fbm(noise2D, x + 250, z - 140, 3, 0.06, 0.55) * hills;
    case 'glade': {
      const d2 = x * x + z * z;
      const bowl = -Math.exp(-d2 / (Math.max(half, 20) * Math.max(half, 20) * 0.5)) * 2.2 * hills;
      return fbm(noise2D, x, z, 4, 0.014, 1.3) * hills + bowl;
    }
    case 'lake': {
      const w = zone.water;
      let dToWater = 999;
      if (w) {
        const wx = w.pos?.[0] ?? 0, wz = w.pos?.[1] ?? 0;
        dToWater = Math.hypot(x - wx, z - wz) - (w.size ?? 60) / 2;
      }
      const basin = -clamp01((6 - dToWater) / 10) * 2.0;
      const rise = Math.max(0, (dToWater - 6) * 0.02);
      return fbm(noise2D, x, z, 4, 0.013, 1.5) * hills + basin + rise;
    }
    case 'town':
      return fbm(noise2D, x, z, 3, 0.013, 0.8) * hills;
    case 'cave': {
      const d = Math.hypot(x, z) / Math.max(half, 20);
      const wallRise = Math.pow(clamp01((d - 0.72) / 0.28), 2) * 9 * hills;
      return fbm(noise2D, x, z, 3, 0.02, 0.45) * hills + wallRise;
    }
    case 'mountain': {
      const ridge = 1 - Math.abs(noise2D(x * 0.01, z * 0.01));
      return ridge * ridge * 14 * hills + fbm(noise2D, x, z, 4, 0.028, 2.2) * hills;
    }
    case 'ruins': {
      const base = fbm(noise2D, x, z, 3, 0.014, 1.3) * hills;
      const terraced = smoothTerrace(base, 0.85, 0.24); // flat plateaus + short walkable ramps
      return terraced + fbm(noise2D, x * 4, z * 4, 2, 0.08, 0.1) * hills;
    }
    case 'spire':
      return fbm(noise2D, x, z, 2, 0.02, 0.22) * hills;
    default:
      return fbm(noise2D, x, z, 4, 0.014, 1.7) * hills;
  }
}

// ---------------------------------------------------------------- entry point
export function buildTerrain(zone) {
  const size = zone.size ?? 200;
  const half = size / 2;
  const kind = zone.terrain?.kind ?? zone.biome ?? 'meadow';
  const hills = zone.terrain?.hills ?? 1;
  const seed = zone.terrain?.seed ?? hashStr(zone.id ?? 'zone');
  const biome = zone.biome ?? kind;
  const palette = groundPalette(biome);
  const noise2D = makeNoise2D(seed);
  const pathInfo = makePathInfo(zone.paths);
  const water = zone.water ?? null;

  function computeHeight(x, z) {
    let h = shapeHeight(kind, noise2D, x, z, hills, half, zone);
    if (pathInfo) {
      const pi = pathInfo(x, z);
      const t = clamp01(1 - (pi.d - pi.w * 0.5) / 3.2);
      if (t > 0) {
        const smooth = fbm(noise2D, x, z, 2, 0.01, hills * 0.55);
        h = lerp(h, smooth, t * t);
      }
    }
    return h;
  }

  // ---------------------------------------------------------- geometry + colors
  const segs = clamp(Math.round(size / 2.2), 48, 140);
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const _c = new THREE.Color();
  const _c2 = new THREE.Color();
  const _c3 = new THREE.Color();
  const EPS = Math.max(size / segs, 0.5) * 0.5;

  const cGrass = new THREE.Color(palette.grass);
  const cGrass2 = new THREE.Color(palette.grass2);
  const cDirt = new THREE.Color(palette.dirt);
  const cStone = new THREE.Color(palette.stone);
  const cStoneDark = new THREE.Color(palette.stoneDark);
  const cSand = new THREE.Color(palette.sand);
  const cSnow = new THREE.Color(palette.snow);
  const cPath = new THREE.Color(palette.path);

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i), z = posAttr.getZ(i);
    const h = computeHeight(x, z);
    posAttr.setY(i, h);

    const hL = computeHeight(x - EPS, z), hR = computeHeight(x + EPS, z);
    const hD = computeHeight(x, z - EPS), hU = computeHeight(x, z + EPS);
    const slope = clamp01((Math.abs(hR - hL) + Math.abs(hU - hD)) / (EPS * 2) * 0.55);

    // base: blend the two grass tones by a slow noise field (painterly variance)
    const gmix = clamp01(noise2D(x * 0.045 + 500, z * 0.045 - 200) * 0.5 + 0.5);
    _c.copy(cGrass).lerp(cGrass2, gmix);

    if (kind === 'cave' || kind === 'spire') {
      // indoor biomes: mostly stone floor, grass tones read as mossy patches
      _c.copy(cStoneDark).lerp(cStone, clamp01(0.4 + gmix * 0.4));
      _c3.copy(cGrass).multiplyScalar(0.5);
      _c.lerp(_c3, clamp01(1 - slope * 3) * 0.18);
    } else if (kind === 'ruins') {
      _c.copy(cStone).lerp(cStoneDark, gmix * 0.5);
      _c.lerp(cGrass2, clamp01(1 - slope * 3) * 0.22); // moss creeping the flagstones
    } else {
      // worn dirt patches — a slower, independent noise field so trails/clearings
      // read as trodden ground rather than pure grass, even on flat terrain
      const dirtN = clamp01(noise2D(x * 0.028 - 800, z * 0.028 + 300) * 0.5 + 0.5 - 0.35) * 1.5;
      if (dirtN > 0) _c.lerp(cDirt, clamp01(dirtN) * 0.65);
      // slope -> stone/dirt scree
      _c.lerp(cStone, clamp01((slope - 0.32) * 2.2));
      // shoreline sand near any zone water
      if (water) {
        const wx = water.pos?.[0] ?? 0, wz = water.pos?.[1] ?? 0, half2 = (water.size ?? 0) / 2;
        const nearShore = Math.abs(x - wx) < half2 + 4 && Math.abs(z - wz) < half2 + 4;
        if (nearShore) {
          const d = Math.max(Math.abs(x - wx) - half2, Math.abs(z - wz) - half2, h - (water.level ?? 0));
          _c.lerp(cSand, clamp01(1 - Math.abs(d) / 3.2));
        }
      }
      // mountain snowline (straddles player.js's SNOWLINE_Y=12 footstep cutoff)
      if (kind === 'mountain') {
        _c.lerp(cSnow, clamp01((h - SNOW_LOW) / (SNOW_HIGH - SNOW_LOW)));
      }
    }

    // paths: dirt-colored, flattened corridor
    if (pathInfo) {
      const pi = pathInfo(x, z);
      const pt = clamp01(1 - (pi.d - pi.w * 0.5) / 1.6);
      if (pt > 0) _c.lerp(kind === 'cave' || kind === 'spire' || kind === 'ruins' ? cStoneDark : cPath, pt);
    }

    // gentle per-vertex hash variance so flat color fields don't look flat
    const jitter = (noise2D(x * 0.6 + 30, z * 0.6 - 30)) * 0.035;
    _c2.copy(_c).offsetHSL(0, 0, jitter);

    colors[i * 3] = _c2.r; colors[i * 3 + 1] = _c2.g; colors[i * 3 + 2] = _c2.b;
  }
  posAttr.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const material = mat(0xffffff, { vertexColors: true, rough: kind === 'lake' || kind === 'meadow' ? 0.96 : 0.9, flat: false });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false; // it's the whole zone floor — always at least partly visible

  function heightAt(x, z) { return computeHeight(x, z); }

  function dispose() {
    geo.dispose();
    material.dispose();
  }

  return { mesh, heightAt, dispose };
}
