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
//
// COLORING (visual overhaul; heights untouched): painterly multi-octave
// patchwork around each biome's groundPalette — macro tone drift + meso
// patches + fine grain, sun-warmed flats, cool/darker hollows (fake AO),
// slope-darkened rocky faces, noise-perturbed path edges with a worn lighter
// center and a dark rim, wet/bleached shoreline bands at the water level, a
// noisy snowline. The painted mesh is de-indexed so every triangle gets a
// per-face tone break + facet-blended normals — the ground reads as the same
// stylized flat-shaded low-poly language as the props. Still one mesh, one
// draw call; all work happens at build time.
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
  const segs = clamp(Math.round(size / 2.0), 48, 150);
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const _c = new THREE.Color();
  const _c2 = new THREE.Color();
  const _cp = new THREE.Color();
  const EPS = Math.max(size / segs, 0.5) * 0.5;
  const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  const cGrass = new THREE.Color(palette.grass);
  const cGrass2 = new THREE.Color(palette.grass2);
  const cDirt = new THREE.Color(palette.dirt);
  const cStone = new THREE.Color(palette.stone);
  const cStoneDark = new THREE.Color(palette.stoneDark);
  const cSand = new THREE.Color(palette.sand);
  const cSnow = new THREE.Color(palette.snow);
  const cPath = new THREE.Color(palette.path);
  // Derived neighbor tones — enrich AROUND the zone palette, never repaint it.
  const cGrassSun = cGrass.clone().offsetHSL(-0.045, 0.09, 0.075);   // sun-warmed yellow-green
  const cGrassCool = cGrass2.clone().offsetHSL(0.02, 0, -0.05);     // cool hollow green
  const cPathWorn = cPath.clone().offsetHSL(0.004, -0.05, -0.075);  // trodden dust
  const cPathLight = cPath.clone().offsetHSL(-0.01, 0.04, 0.07);    // worn bright center
  const cRim = cDirt.clone().offsetHSL(0, -0.03, -0.11);            // dark rim where path meets grass
  const cSandWet = cSand.clone().offsetHSL(0.005, -0.04, -0.12);    // wet sand at the waterline
  const cSandLight = cSand.clone().offsetHSL(-0.008, 0.02, 0.09);   // bleached band above it
  const cSnowShade = cSnow.clone().lerp(new THREE.Color(0x8fa6c8), 0.55); // cool shaded snow
  const cStoneWarm = cStone.clone().offsetHSL(-0.02, 0.05, 0.05);   // sunlit rock
  const cMoss = cGrass.clone().multiplyScalar(0.6);
  const isStoneFloor = kind === 'cave' || kind === 'spire' || kind === 'ruins';

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i), z = posAttr.getZ(i);
    const h = computeHeight(x, z);
    posAttr.setY(i, h);

    const hL = computeHeight(x - EPS, z), hR = computeHeight(x + EPS, z);
    const hD = computeHeight(x, z - EPS), hU = computeHeight(x, z + EPS);
    const slope = clamp01((Math.abs(hR - hL) + Math.abs(hU - hD)) / (EPS * 2) * 0.55);

    // shared noise fields: macro tone drift / meso patches / fine grain
    const n1 = noise2D(x * 0.016 + 500, z * 0.016 - 200);
    const n2 = noise2D(x * 0.055 - 310, z * 0.055 + 140);
    const n3 = noise2D(x * 0.23 + 77, z * 0.23 + 913);
    // fake AO: hollows cooler/darker, high flats sun-warmed
    const hollowT = clamp01(-h / (2.2 * hills + 0.7));
    const highT = clamp01(h / (5.5 * hills + 1.5)) * clamp01(1 - slope * 1.8);

    if (kind === 'cave' || kind === 'spire') {
      // indoor biomes: broken stone floor, warm mineral veins, mossy patches
      _c.copy(cStoneDark).lerp(cStone, clamp01(0.4 + n1 * 0.38 + n2 * 0.3));
      _c.lerp(cDirt, clamp01((n2 * 0.5 + 0.5 - 0.62) * 2.2) * 0.4);
      const mossT = clamp01((noise2D(x * 0.05 + 41, z * 0.05 - 77) - 0.12) * 2.6) * clamp01(1 - slope * 3);
      if (mossT > 0) _c.lerp(cMoss, Math.min(1, mossT) * 0.55);
      _c.lerp(cStoneWarm, clamp01(n3 * 0.5 + 0.5) * 0.12);
      _c.multiplyScalar(1 - clamp01(slope * 1.3) * 0.2 - hollowT * 0.15);
    } else if (kind === 'ruins') {
      // weathered flagstone patchwork, moss creeping the flats, dark terrace risers
      _c.copy(cStone).lerp(cStoneDark, clamp01(0.45 + n1 * 0.4 + n3 * 0.3));
      _c.lerp(cDirt, clamp01((n2 * 0.5 + 0.5 - 0.58) * 2.0) * 0.35);
      const mossT = clamp01((n2 + 0.25) * 1.3) * clamp01(1 - slope * 2.6);
      if (mossT > 0) _c.lerp(cGrass2, Math.min(1, mossT) * 0.34);
      const riserT = clamp01((slope - 0.22) * 2.8);
      if (riserT > 0) _c.lerp(cStoneDark, Math.min(1, riserT) * 0.8);
      _c.lerp(cStoneWarm, highT * 0.3);
      _c.multiplyScalar(1 - clamp01(slope * 1.2) * 0.12 - hollowT * 0.12);
    } else {
      // --- grass patchwork: deep / mid / sun-warmed tones at three scales ---
      const gmix = clamp01(0.5 + n1 * 0.45 + n2 * 0.3);
      _c.copy(cGrass).lerp(cGrass2, gmix);
      const sunT = clamp01((n2 - 0.2) * 2.9) * clamp01(1 - slope * 2.4);
      if (sunT > 0) _c.lerp(cGrassSun, Math.min(1, sunT) * 0.58);
      _c.lerp(gmix > 0.5 ? cGrass : cGrass2, clamp01(0.5 + n3 * 0.8) * 0.16);
      // worn dirt patches — independent slow field so clearings read as trodden
      // (kept sparse: the meadow must stay green-dominant)
      const dirtN = clamp01((noise2D(x * 0.03 - 800, z * 0.03 + 300) * 0.5 + 0.5 - 0.55) * 2.6);
      if (dirtN > 0) _c.lerp(cDirt, Math.min(1, dirtN) * 0.42);
      // steeper faces rockier + darker
      const rockT = clamp01((slope - 0.28) * 2.6);
      if (rockT > 0) _c.lerp(n1 > 0 ? cStone : cStoneDark, Math.min(1, rockT));
      _c.multiplyScalar(1 - clamp01(slope * 1.5) * 0.17);
      // hollows cool + dark, high flats warm
      if (hollowT > 0) { _c.lerp(cGrassCool, hollowT * 0.5); _c.multiplyScalar(1 - hollowT * 0.13); }
      if (highT > 0) _c.lerp(cGrassSun, highT * 0.32);
      // shoreline near zone water: sand apron w/ noisy edge, wet band, bleached band
      if (water) {
        const wx = water.pos?.[0] ?? 0, wz = water.pos?.[1] ?? 0, wl = water.level ?? 0;
        const half2 = (water.size ?? 0) / 2;
        const dEdge = Math.max(Math.abs(x - wx) - half2, Math.abs(z - wz) - half2);
        if (dEdge < 9) {
          const above = h - wl;
          const shoreN = n2 * 1.7 + n3 * 0.9;
          const apron = clamp01(1 - (dEdge + shoreN) / 6.5) * clamp01(1 - Math.max(0, above) / 2.6);
          if (apron > 0) {
            _c.lerp(cSand, Math.min(1, apron * 1.7) * 0.92);
            const wetT = clamp01((0.42 - above) / 0.5);
            if (wetT > 0) _c.lerp(cSandWet, Math.min(1, wetT) * 0.8 * Math.min(1, apron * 2));
            const bleachT = clamp01(1 - Math.abs(above - 0.6) / 0.28);
            if (bleachT > 0) _c.lerp(cSandLight, bleachT * 0.65 * Math.min(1, apron * 2));
          }
        }
      }
      // mountain: scree bands below a NOISY snowline, cool-shaded steep snow
      // (band still straddles player.js's SNOWLINE_Y=12 footstep cutoff)
      if (kind === 'mountain') {
        const band = clamp01((n1 * 0.5 + 0.5 - 0.52) * 2.0);
        if (band > 0) _c.lerp(cDirt, Math.min(1, band) * 0.4);
        const snowT = clamp01((h - (SNOW_LOW + n2 * 1.8 + n3 * 0.9)) / (SNOW_HIGH - SNOW_LOW));
        if (snowT > 0) {
          _c.lerp(cSnow, snowT);
          const shadeT = (clamp01(slope * 1.7) * 0.5 + hollowT * 0.4 + clamp01(n1 * 0.5 + 0.2) * 0.2) * snowT;
          if (shadeT > 0) _c.lerp(cSnowShade, Math.min(1, shadeT));
        }
      }
    }

    // paths: noise-perturbed edges (no straight borders), mottled wear tones,
    // lighter worn center, and a dark rim where the path meets the grass
    if (pathInfo) {
      const pi = pathInfo(x, z);
      const hw = pi.w * 0.5;
      const edgeN = noise2D(x * 0.09 + 823, z * 0.09 - 411) * 1.35 + n3 * 0.6;
      const d = pi.d + edgeN;
      const core = 1 - sstep(hw - 0.45, hw + 0.95, d);
      if (core > 0) {
        if (isStoneFloor) {
          _cp.copy(cStoneDark).lerp(cStone, clamp01(0.35 + n2 * 0.4));
        } else {
          _cp.copy(cPath).lerp(cPathWorn, clamp01(0.5 + n2 * 0.7 + n1 * 0.3));
          const centerT = clamp01(1 - pi.d / Math.max(hw, 0.01));
          _cp.lerp(cPathLight, centerT * centerT * 0.45);
        }
        _c.lerp(_cp, Math.min(1, core * 1.06));
      }
      const rimT = clamp01(1 - Math.abs(d - (hw + 1.7)) / 1.5) * (1 - core);
      if (rimT > 0) _c.lerp(isStoneFloor ? cStoneDark : cRim, rimT * 0.36);
    }

    // gentle per-vertex variance (per-face tone break below carries the grain)
    const jitter = n3 * 0.02;
    _c2.copy(_c).offsetHSL(0, 0, jitter);

    colors[i * 3] = _c2.r; colors[i * 3 + 1] = _c2.g; colors[i * 3 + 2] = _c2.b;
  }
  posAttr.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals(); // smooth normals — blended with face normals below

  // -------------------------------------------------- faceted low-poly finish
  // De-index so each triangle owns its vertices: a per-face tone break + face-
  // blended normals turn the airbrushed sheet into stylized low-poly ground
  // that matches the flat-shaded props. Positions are copies of the exact same
  // heights — heightAt/collision see no difference. Still one draw call.
  const fgeo = geo.toNonIndexed();
  geo.dispose();
  const fpos = fgeo.attributes.position;
  const fnrm = fgeo.attributes.normal;
  const fcol = fgeo.attributes.color;
  const facetK = isStoneFloor || kind === 'mountain' ? 0.85 : 0.62;
  const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
  const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _fn = new THREE.Vector3(), _nv = new THREE.Vector3();
  for (let f = 0; f < fpos.count; f += 3) {
    _va.fromBufferAttribute(fpos, f);
    _vb.fromBufferAttribute(fpos, f + 1);
    _vc.fromBufferAttribute(fpos, f + 2);
    _e1.subVectors(_vb, _va); _e2.subVectors(_vc, _va);
    _fn.crossVectors(_e1, _e2).normalize();
    const cx = (_va.x + _vb.x + _vc.x) / 3, cz = (_va.z + _vb.z + _vc.z) / 3;
    const s = Math.sin(cx * 127.1 + cz * 311.7 + seed * 0.173) * 43758.5453;
    const fj = (s - Math.floor(s)) * 2 - 1;
    // cluster the facet tone-breaks: calm stretches and patchy stretches, so
    // flat ground reads painterly instead of uniform triangle confetti
    const cluster = 0.45 + 0.55 * clamp01(noise2D(cx * 0.022 + 61, cz * 0.022 - 987) * 0.9 + 0.5);
    for (let v = f; v < f + 3; v++) {
      _nv.fromBufferAttribute(fnrm, v).lerp(_fn, facetK).normalize();
      fnrm.setXYZ(v, _nv.x, _nv.y, _nv.z);
      const r = fcol.getX(v), g = fcol.getY(v), b = fcol.getZ(v);
      const lum = (r + g + b) / 3;
      const amp = 0.04 * cluster * (lum > 0.72 ? 0.35 : 1); // keep snow/sand facets clean
      fcol.setXYZ(v, clamp01(r + fj * amp), clamp01(g + fj * amp), clamp01(b + fj * amp * 0.8));
    }
  }

  const material = mat(0xffffff, { vertexColors: true, rough: kind === 'lake' || kind === 'meadow' ? 0.96 : 0.9, flat: false });
  const mesh = new THREE.Mesh(fgeo, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false; // it's the whole zone floor — always at least partly visible

  function heightAt(x, z) { return computeHeight(x, z); }

  function dispose() {
    fgeo.dispose();
    material.dispose();
  }

  return { mesh, heightAt, dispose };
}
