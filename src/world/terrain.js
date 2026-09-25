// ============================================================================
// world/terrain.js — seeded heightfield terrain per biome kind, shaded per
// pixel (soft-stylized v2 look).
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   buildTerrain(zone) -> { mesh, heightAt(x,z) -> y, dispose(), ground }
//
// `heightAt` and the mesh are guaranteed to match exactly because both are
// driven by the *same* analytic height function (evaluated directly per
// query rather than sampled from a baked grid, so there is no discretization
// error at all). HEIGHTS ARE GAMEPLAY: collision, walking, props and NPC
// placement all read heightAt — the shape functions below must not change.
//
// SHADING (visual pass v2): the mesh is an indexed ~1 m grid with smooth
// analytic normals — no facets, no vertex colors. All color lives in the
// fragment shader (`lfGround`, shared GLSL): multi-octave world-space noise
// over the biome palette, slope rock with strata, hollow/height tints, a
// per-pixel shoreline banded against the water level, a noisy snowline, and
// crisp paths (worn center, soil lip, trampled rim, pebbles; cobbles on the
// town's wide streets, flagstones in the ruins). Paths, bare patches and the
// shore apron come from one baked RGBA "ground mask" texture over the zone,
// which the CPU samples too — grass.js uses it (and the same GLSL function
// in its vertex shader) so blades avoid paths/sand and their roots melt into
// the ground. Still one mesh, one draw call.
// ============================================================================
import * as THREE from 'three';
import { seededRandom, hashStr } from '../core/rng.js';
import { clamp, clamp01, lerp } from '../core/math.js';
import { groundPalette } from '../gfx/materials.js';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';

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

// ---------------------------------------------------------------- palette (v2 tones)
// groundPalette() (materials.js) stays the source of each zone's identity; the
// terrain derives its working tones from it: greens pulled a little warmer and
// softer (painterly, never acid), plus the shade/sun/wet/worn neighbours the
// shader blends between. Per-biome tweaks keep every zone's own character.
const _hsl = { h: 0, s: 0, l: 0 };
function tone(hex, { hue = null, pull = 0, sat = 1, lit = 0, hueAdd = 0 } = {}) {
  const c = new THREE.Color(hex);
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  let h = _hsl.h + hueAdd;
  if (hue != null && pull) {
    let dh = hue - h;
    if (dh > 0.5) dh -= 1; if (dh < -0.5) dh += 1;
    h += dh * pull;
  }
  c.setHSL(((h % 1) + 1) % 1, clamp01(_hsl.s * sat), clamp01(_hsl.l + lit), THREE.SRGBColorSpace);
  return c;
}
const BIOME_TONE = {
  //            grass pull toward warm hue, saturation, lightness; deep-green tweaks
  meadow:   { hue: 0.235, pull: 0.45, sat: 0.74, lit: -0.035, deepSat: 0.8, deepLit: -0.05, sunLit: 0.075 },
  town:     { hue: 0.235, pull: 0.45, sat: 0.72, lit: -0.04, deepSat: 0.8, deepLit: -0.05, sunLit: 0.07 },
  lake:     { hue: 0.235, pull: 0.4, sat: 0.74, lit: -0.035, deepSat: 0.8, deepLit: -0.05, sunLit: 0.07 },
  forest:   { hue: 0.26, pull: 0.3, sat: 0.78, lit: -0.05, deepSat: 0.82, deepLit: -0.04, sunLit: 0.06 },
  glade:    { hue: 0.36, pull: 0.15, sat: 0.8, lit: -0.04, deepSat: 0.85, deepLit: -0.04, sunLit: 0.06 },
  mountain: { hue: 0.2, pull: 0.3, sat: 0.62, lit: -0.02, deepSat: 0.7, deepLit: -0.03, sunLit: 0.06 },
  ruins:    { hue: 0.24, pull: 0.3, sat: 0.7, lit: -0.03, deepSat: 0.75, deepLit: -0.03, sunLit: 0.05 },
  cave:     { hue: 0.3, pull: 0, sat: 1, lit: 0, deepSat: 1, deepLit: 0, sunLit: 0.04 },
  spire:    { hue: 0.3, pull: 0, sat: 1, lit: 0, deepSat: 1, deepLit: 0, sunLit: 0.04 },
};
function groundTones(biome) {
  const P = groundPalette(biome);
  const T = BIOME_TONE[biome] ?? BIOME_TONE.meadow;
  const grassA = tone(P.grass, { hue: T.hue, pull: T.pull, sat: T.sat, lit: T.lit });
  const grassB = tone(P.grass2, { hue: T.hue + 0.05, pull: T.pull * 0.6, sat: T.deepSat, lit: T.deepLit });
  const grassSun = tone(P.grass, { hue: 0.16, pull: 0.5, sat: T.sat * 0.95, lit: T.lit + T.sunLit });
  const grassCool = tone(P.grass2, { hueAdd: 0.035, sat: T.deepSat * 0.9, lit: T.deepLit - 0.06 });
  const dirt = new THREE.Color(P.dirt);
  const path = tone(P.path, { sat: 0.72, lit: -0.03 });
  return {
    grassA, grassB, grassSun, grassCool,
    dirt,
    stone: new THREE.Color(P.stone),
    stoneDark: new THREE.Color(P.stoneDark),
    sand: tone(P.sand, { sat: 0.62, lit: -0.04 }),
    sandWet: tone(P.sand, { sat: 0.5, lit: -0.22, hueAdd: 0.01 }),
    sandLight: tone(P.sand, { sat: 0.55, lit: 0.05 }),
    snow: new THREE.Color(P.snow),
    snowShade: new THREE.Color(P.snow).lerp(new THREE.Color(0x8fa6c8), 0.5),
    path,
    pathWorn: tone(P.path, { sat: 0.62, lit: -0.09 }),
    pathLight: tone(P.path, { sat: 0.55, lit: 0.07 }),
    rim: tone(P.dirt, { sat: 0.8, lit: -0.14 }),
    moss: tone(P.grass2, { sat: 0.7, lit: -0.08 }),
  };
}

// ---------------------------------------------------------------- shared ground GLSL
// Evaluated per pixel by the terrain and per blade-vertex by grass.js (root
// colors), so both always agree. Requires #define LF_GROUND_STYLE
// (0 = grassland, 1 = stone floor [cave/spire], 2 = ruins).
export const GROUND_GLSL = /* glsl */ `
uniform sampler2D uGMask;
uniform vec4 uGMaskXf;
uniform vec3 uGGrassA, uGGrassB, uGGrassSun, uGGrassCool, uGDirt, uGStone, uGStoneDark;
uniform vec3 uGSand, uGSandWet, uGSandLight, uGSnow, uGSnowShade;
uniform vec3 uGPath, uGPathWorn, uGPathLight, uGRim, uGMoss;
uniform vec4 uGP;    // hills, waterLevel, hasWater, hasSnow
uniform vec4 uGP2;   // snowLine, rockSlope, grainAmp, cobbleScale
uniform vec4 uGWater; // water rect: cx, cz, halfSize, unused
uniform vec4 uGField; // grass field (grass.js): centerX, centerZ, fadeStart, fadeEnd
uniform vec4 uGFieldK; // x: soft AO under the blades (0 = no grass field)
uniform vec4 uGStroke; // painterly stroke direction (x,z), amplitude

float lfHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float lfNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = lfHash(i);
  float b = lfHash(i + vec2(1.0, 0.0));
  float c = lfHash(i + vec2(0.0, 1.0));
  float d = lfHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// returns x: distance to nearest site, y: distance-to-edge estimate (F2-F1),
// z: cell id; toSite: vector from p to the nearest site (cell units)
vec3 lfVoronoi(vec2 p, out vec2 toSite) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  toSite = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(lfHash(n + g), lfHash(n + g + 17.31)) * 0.76 + 0.12;
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = lfHash(n + g + 3.71); toSite = r; }
      else if (d < d2) { d2 = d; }
    }
  }
  d1 = sqrt(d1); d2 = sqrt(d2);
  return vec3(d1, d2 - d1, id);
}
vec4 lfMask(vec2 xz) { return texture2D(uGMask, (xz - uGMaskXf.xy) * uGMaskXf.zw); }

// wp: world position, nrm: surface normal (world), fw: pixel footprint (m),
// m: lfMask(wp.xz). Outputs grassAmt (0..1, how much grass may grow here) and
// bump (world-space normal offset for stones/pebbles; xz only).
vec3 lfGround(vec3 wp, vec3 nrm, float fw, vec4 m, out float grassAmt, out vec3 bump) {
  vec2 xz = wp.xz;
  float h = wp.y;
  float hills = uGP.x;
  float slope = clamp(1.0 - nrm.y, 0.0, 1.0);
  float flatK = 1.0 - smoothstep(0.03, 0.14, slope);
  float fineK = 1.0 - smoothstep(0.16, 0.6, fw);
  float midK = 1.0 - smoothstep(0.7, 2.6, fw);
  float n1 = lfNoise(xz * 0.017 + vec2(13.1, 7.7));
  float n2 = lfNoise(xz * 0.058 + vec2(-3.3, 21.9));
  float n3 = mix(0.5, lfNoise(xz * 0.23 + vec2(5.5, -8.2)), midK);
  float n4 = mix(0.5, lfNoise(xz * 1.07 + vec2(-1.7, 4.4)), fineK);
  float hollowT = clamp(-h / (2.2 * hills + 0.7), 0.0, 1.0);
  float highT = clamp(h / (5.5 * hills + 1.5), 0.0, 1.0) * flatK;
  float aa = max(fw * 0.6, 0.01);
  vec2 ts;
  vec3 col;
  grassAmt = 0.0;
  bump = vec3(0.0);

#if LF_GROUND_STYLE == 1
  // ---- stone floor (cave / spire): slabs of tone, mineral warmth, moss
  col = mix(uGStoneDark, uGStone, clamp(0.4 + (n1 - 0.5) * 0.76 + (n2 - 0.5) * 0.6, 0.0, 1.0));
  col = mix(col, uGDirt, smoothstep(0.6, 0.9, n2) * 0.35);
  float mossT = smoothstep(0.58, 0.82, lfNoise(xz * 0.05 + vec2(41.0, -77.0))) * flatK;
  col = mix(col, uGMoss, mossT * 0.5);
  if (midK > 0.0) {
    vec3 vc = lfVoronoi(xz * 0.42 + vec2(n2, n1) * 0.6, ts);
    float crack = 1.0 - smoothstep(0.02, 0.02 + aa * 0.42 * 2.5, vc.y);
    crack *= smoothstep(0.25, 0.6, lfNoise(xz * 0.35 + vec2(vc.z * 3.0, 1.7)));  // some joints fade out
    col *= 1.0 - crack * 0.3 * midK;
    col *= 0.93 + (vc.z - 0.5) * 0.2 * midK;
  }
  col *= 0.94 + (n3 - 0.5) * 0.12 + (n4 - 0.5) * 0.08;
  col *= 1.0 - smoothstep(0.1, 0.5, slope) * 0.22 - hollowT * 0.14;
#elif LF_GROUND_STYLE == 2
  // ---- ruins: broken flagstones, moss and grass in the joints, dark risers
  vec3 vr = lfVoronoi(xz * 0.58 + vec2(n2, n1) * 0.35, ts);
  vec3 slab = mix(uGStone, uGStoneDark, clamp(vr.z * 0.75 + (n1 - 0.5) * 0.5, 0.0, 1.0));
  slab *= 0.95 + (n4 - 0.5) * 0.12;
  float joint = (1.0 - smoothstep(0.035, 0.035 + aa * 0.58 * 2.5, vr.y)) * midK;
  float mossT = clamp((n2 - 0.42) * 2.2 + (n3 - 0.5) * 0.6, 0.0, 1.0) * flatK;
  float lost = smoothstep(0.62, 0.8, n1 + (n3 - 0.5) * 0.3);   // slabs gone -> turf
  col = mix(slab, uGGrassB, max(joint * 0.85, mossT * 0.5));
  vec3 turf = mix(uGGrassB, uGGrassA, n3) * (0.95 + (n4 - 0.5) * 0.1);
  col = mix(col, turf, lost * flatK);
  col = mix(col, uGDirt, smoothstep(0.6, 0.85, n2) * 0.25 * (1.0 - lost));
  float riserT = smoothstep(0.07, 0.16, slope);
  col = mix(col, uGStoneDark * 0.8, riserT * 0.8);
  col = mix(col, uGStone * 1.08, highT * 0.2);
  col *= 1.0 - hollowT * 0.12;
  bump.xz = -ts * 0.25 * (1.0 - joint) * (1.0 - lost) * (1.0 - riserT) * midK;
  grassAmt = max(lost, mossT * 0.6) * (1.0 - riserT);
#else
  // ---- grassland: macro / meso patchwork, sun-warmed flats, cool hollows
  float tone = clamp(0.5 + (n1 - 0.5) * 1.15 + (n2 - 0.5) * 0.75, 0.0, 1.0);
  col = mix(uGGrassB, uGGrassA, smoothstep(0.1, 0.9, tone));
  float sunT = smoothstep(0.56, 0.84, n2 + (n3 - 0.5) * 0.4) * flatK;
  col = mix(col, uGGrassSun, clamp(sunT * 0.42 + highT * 0.22, 0.0, 1.0));
  col = mix(col, uGGrassCool, hollowT * 0.45);
  col *= (1.0 - hollowT * 0.1) * (0.955 + (n3 - 0.5) * 0.12 + (n4 - 0.5) * uGP2.z);
#ifndef LF_GROUND_LQ
  {
    vec2 sq = vec2(dot(xz, uGStroke.xy), dot(xz, vec2(-uGStroke.y, uGStroke.x)));
    float stroke = lfNoise(sq * vec2(0.45, 2.2) + vec2(17.0, 3.0)) * 0.65 + lfNoise(sq * vec2(0.9, 4.4) + 5.0) * 0.35;
    col *= 1.0 + (stroke - 0.5) * uGStroke.z * midK;
  }
#endif
  grassAmt = 1.0;
  // trodden / bare patches (baked)
  float bare = m.b;
  col = mix(col, mix(uGDirt, col, 0.5) * (0.96 + (n4 - 0.5) * 0.1), bare * 0.5);
  grassAmt *= 1.0 - 0.6 * smoothstep(0.25, 0.7, bare);
  // moderate slopes (hill flanks, path cuts): earth banks with moss; rock
  // only where it is really steep — pseudo-triplanar noise (no streaks on
  // walls), strata ledges that catch the light, dark crevices
  float bankT = smoothstep(uGP2.y - 0.04, uGP2.y + 0.02, slope + (n3 - 0.5) * 0.08 + (n4 - 0.5) * 0.03);
  vec3 bank = mix(uGDirt * 0.78, uGGrassB * 0.72, 0.4 + (n3 - 0.5) * 0.6) * (0.92 + (n4 - 0.5) * 0.14);
#ifndef LF_GROUND_LQ
  if (bankT > 0.0) bank *= 0.88 + 0.24 * lfNoise(vec2(wp.x + wp.z, h * 2.2) * 1.3); // faint erosion streaks
#endif
  col = mix(col, bank, bankT * 0.8);
  grassAmt *= 1.0 - bankT * 0.6;
  float rockT = smoothstep(uGP2.y + 0.1, uGP2.y + 0.16, slope + (n3 - 0.5) * 0.1 + (n4 - 0.5) * 0.04);
  if (rockT > 0.0) {
#ifdef LF_GROUND_LQ
    float rn = lfNoise(vec2(wp.x + wp.z, h) * 0.9);
    float rn2 = lfNoise(vec2(wp.x - wp.z, h) * 2.7 + 5.0);
#else
    float wx = smoothstep(0.3, 0.7, abs(nrm.x) / (abs(nrm.x) + abs(nrm.z) + 1e-4));
    float rn = mix(lfNoise(vec2(wp.x, h) * 0.9), lfNoise(vec2(wp.z, h) * 0.9 + 7.1), wx);
    float rn2 = mix(lfNoise(vec2(wp.x, h) * 2.7 + 5.0), lfNoise(vec2(wp.z, h) * 2.7 + 2.3), wx);
#endif
    float sphase = h * 2.3 + n2 * 5.0 + rn * 1.6;
    float strata = 0.5 + 0.5 * sin(sphase);
    vec3 rock = mix(uGStoneDark * 0.85, uGStone, clamp(0.12 + strata * 0.5 + (rn2 - 0.5) * 0.5, 0.0, 1.0));
    rock *= (0.9 + (rn - 0.5) * 0.25) * (1.0 - smoothstep(0.64, 0.82, rn2) * 0.28);
    col = mix(col, rock, rockT);
    bump.y += cos(sphase) * 0.4 * rockT;
    grassAmt *= 1.0 - rockT;
  }
  // mountain snow above a noisy line, cool on steep/hollow parts
  if (uGP.w > 0.5) {
    float scree = smoothstep(0.55, 0.8, n1 + (n3 - 0.5) * 0.3) * (1.0 - rockT);
    col = mix(col, mix(uGDirt, uGStone, n4), scree * 0.45);
    grassAmt *= 1.0 - scree * 0.8;
    float line = uGP2.x + (n2 - 0.5) * 3.8 + (n3 - 0.5) * 1.6;
    float snowT = smoothstep(line - 0.35, line + 0.35, h + (n4 - 0.5) * 0.25);
    snowT *= 1.0 - smoothstep(0.3, 0.5, slope + (n3 - 0.5) * 0.1); // snow never clings to walls: strata rock shows
    vec3 snow = mix(uGSnow, uGSnowShade, clamp(slope * 2.2 + hollowT * 0.4 + (n2 - 0.5) * 0.3, 0.0, 1.0));
    col = mix(col, snow, snowT);
    grassAmt *= 1.0 - snowT;
  }
#endif

  // ---- shoreline: sand apron (baked, noisy), wet band + bleached band banded
  //      per pixel against the water level, darker bed under the water
  if (uGP.z > 0.5) {
    float above = h - uGP.y;
    float apron = m.a * (1.0 - smoothstep(0.4, 2.6, above));
    float sandT = smoothstep(0.3 - aa, 0.3 + aa, apron + (n4 - 0.5) * 0.08);
    vec3 sand = uGSand * (0.95 + (n4 - 0.5) * 0.12 + (n3 - 0.5) * 0.06);
    float wetT = 1.0 - smoothstep(0.1 - aa, 0.22 + aa, above + (n4 - 0.5) * 0.06);
    sand = mix(sand, uGSandLight, (1.0 - smoothstep(0.0, 0.12 + aa, abs(above - 0.52))) * 0.55);
    sand = mix(sand, uGSandWet, wetT);
    col = mix(col, sand, sandT);
    grassAmt *= 1.0 - sandT;
    // under the water plane: the bed darkens with depth (reads as depth through the water)
    vec2 dq = abs(xz - uGWater.xy) - uGWater.zz;
    float inside = 1.0 - smoothstep(-0.5, 0.5, max(dq.x, dq.y));
    float bedT = clamp(-above * 0.9, 0.0, 1.0) * inside;
    col = mix(col, uGSandWet * vec3(0.55, 0.62, 0.62), bedT * 0.8);
    grassAmt *= 1.0 - smoothstep(-0.05, 0.12, -above) * inside;
  }

  // ---- paths: crisp noisy edge, trampled rim outside, soil lip inside,
  //      worn light center, sparse pebbles; cobbles/flagstones where the mask says
  float e = m.r * 16.0 - 4.0;
  e += (n4 - 0.5) * 0.14;
#ifndef LF_GROUND_LQ
  e += (lfNoise(xz * 3.3 + vec2(7.0, 1.3)) - 0.5) * 0.07 * fineK;
#endif
  float pathT = 1.0 - smoothstep(-aa, aa, e);
  float rimT = (1.0 - smoothstep(0.0, 0.55 + n3 * 0.5, e)) * (1.0 - pathT);
#if LF_GROUND_STYLE == 0
  col = mix(col, mix(col, uGRim, 0.3) * 0.84, rimT * 0.6);
#else
  col *= 1.0 - rimT * 0.12;
#endif
  grassAmt *= smoothstep(0.02, 0.5, e);
  if (pathT > 0.001) {
    float depth = max(-e, 0.0);
    float wear = smoothstep(0.25, 2.2, depth);
    vec3 pbump = vec3(0.0);
#if LF_GROUND_STYLE == 0
    vec3 pc = mix(uGPath, uGPathWorn, clamp(0.5 + (n2 - 0.5) * 1.2 + (n3 - 0.5) * 0.7, 0.0, 1.0));
    pc = mix(pc, uGPathLight, wear * (0.3 + n3 * 0.2));
#else
    vec3 pc = mix(uGStoneDark, uGStone, clamp(0.35 + (n2 - 0.5) * 0.8, 0.0, 1.0));
    pc = mix(pc, uGStone * 1.06, wear * 0.3);
#endif
    pc *= 0.95 + (n4 - 0.5) * 0.12;
    // sparse pebbles of mixed size, each with a soft contact shade (fade with distance)
#ifndef LF_GROUND_LQ
    if (fineK > 0.0) {
      vec3 vp = lfVoronoi(xz * 3.2 + vec2(3.1, 9.7), ts);
      float has = step(0.86, vp.z) * smoothstep(0.1, 0.5, depth);
      float r = 0.12 + fract(vp.z * 7.31) * 0.18;
      float peb = has * (1.0 - smoothstep(r - aa * 3.2, r + aa * 3.2, vp.x)) * fineK;
      float ring = has * (1.0 - smoothstep(r, r + 0.18, vp.x)) * (1.0 - peb) * fineK;
      vec3 pebC = mix(uGStone, pc * 1.1, 0.7) * (0.9 + fract(vp.z * 17.3) * 0.2);
      pc *= 1.0 - ring * 0.16;
      pc = mix(pc, pebC, peb * 0.6);
      pbump.xz += -ts / max(r, 0.05) * 0.55 * peb;
    }
#endif
    // cobbles (town streets) / flagstones (ruins): mask green channel
    if (m.g > 0.02) {
      float cs = uGP2.w;
      vec3 vc = lfVoronoi(xz * cs + vec2(n1, n2) * 0.3, ts);
      float mortar = 1.0 - smoothstep(0.04, 0.04 + aa * cs * 2.2, vc.y);
      float hueSel = fract(vc.z * 13.7);
      vec3 stoneC = mix(uGStone, uGStoneDark, vc.z * 0.7);
      stoneC = mix(stoneC, stoneC * vec3(1.06, 1.0, 0.9), step(0.6, hueSel));   // a few warm stones
      stoneC = mix(stoneC, stoneC * vec3(0.94, 0.98, 1.05), step(hueSel, 0.25)); // a few cool ones
      stoneC *= 0.94 + (n4 - 0.5) * 0.12;
      vec3 mortarC = mix(uGRim, uGStoneDark, 0.65) * 0.5;
      vec3 cob = mix(stoneC, mortarC, mortar * midK);
      float keep = m.g * smoothstep(0.1, 0.8, depth + (n3 - 0.5) * 0.7)
                 * smoothstep(0.16, 0.36, n2 * 0.55 + vc.z * 0.45 + 0.08);
      keep = clamp(keep, 0.0, 1.0);
      pc = mix(pc, cob, keep);
      float bevel = (1.0 - smoothstep(0.0, 0.2, vc.y)) * (1.0 - mortar);
      // pillowed stones: smooth dome (tilt grows from the stone's center) + rounded rim
      pbump.xz = mix(pbump.xz, -ts * 0.55 * (1.0 - mortar) - normalize(ts + 1e-4) * 0.6 * bevel, keep * midK);
    }
    // soil lip just inside the edge
    pc *= 1.0 - (1.0 - smoothstep(0.0, 0.32, depth)) * 0.2;
    col = mix(col, pc, pathT);
    bump = mix(bump, pbump, pathT);
  }
  // soft AO where the grass field stands (roots get the same, so they still melt in)
  if (uGFieldK.x > 0.0) {
    float fieldK = 1.0 - smoothstep(uGField.z, uGField.w, distance(xz, uGField.xy));
    col *= 1.0 - uGFieldK.x * fieldK * smoothstep(0.1, 0.6, grassAmt);
  }
  return col;
}
`;

// ---------------------------------------------------------------- entry point
export function buildTerrain(zone) {
  const size = zone.size ?? 200;
  const half = size / 2;
  const kind = zone.terrain?.kind ?? zone.biome ?? 'meadow';
  const hills = zone.terrain?.hills ?? 1;
  const seed = zone.terrain?.seed ?? hashStr(zone.id ?? 'zone');
  const biome = zone.biome ?? kind;
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

  const style = (kind === 'cave' || kind === 'spire') ? 1 : kind === 'ruins' ? 2 : 0;

  // ---------------------------------------------------------- smooth indexed grid
  // ~1 m cells (smooth shading needs resolution where facets hid it). Heights
  // come straight from computeHeight — the rendered surface only gets closer
  // to heightAt than the old 2 m mesh was.
  const segs = clamp(Math.round(size / 1.0), 64, 256);
  const step = size / segs;
  const nv = segs + 1;
  const nb = segs + 3; // +1 ring for central-difference normals at the border
  const hb = new Float32Array(nb * nb);
  for (let j = 0; j < nb; j++) {
    const z = -half + (j - 1) * step;
    for (let i = 0; i < nb; i++) hb[j * nb + i] = computeHeight(-half + (i - 1) * step, z);
  }
  const positions = new Float32Array(nv * nv * 3);
  const normals = new Float32Array(nv * nv * 3);
  const heights = new Float32Array(nv * nv);   // rendered surface, for grass roots
  const normY = new Float32Array(nv * nv);
  const inv2 = 1 / (2 * step);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nv; i++) {
      const k = j * nv + i;
      const b = (j + 1) * nb + (i + 1);
      const h = hb[b];
      positions[k * 3] = -half + i * step;
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = -half + j * step;
      const gx = (hb[b + 1] - hb[b - 1]) * inv2;
      const gz = (hb[b + nb] - hb[b - nb]) * inv2;
      const il = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      normals[k * 3] = -gx * il; normals[k * 3 + 1] = il; normals[k * 3 + 2] = -gz * il;
      heights[k] = h;
      normY[k] = il;
    }
  }
  const IndexArray = nv * nv > 65535 ? Uint32Array : Uint16Array;
  const index = new IndexArray(segs * segs * 6);
  let ii = 0;
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * nv + i, b = (j + 1) * nv + i, c = (j + 1) * nv + i + 1, d = j * nv + i + 1;
      index[ii++] = a; index[ii++] = b; index[ii++] = d;
      index[ii++] = b; index[ii++] = c; index[ii++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();

  /** Height of the RENDERED surface (same triangulation as the index above). */
  function surfaceY(x, z) {
    const fx = clamp((x + half) / step, 0, segs - 1e-4), fz = clamp((z + half) / step, 0, segs - 1e-4);
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const k = j * nv + i;
    const h00 = heights[k], h10 = heights[k + 1], h01 = heights[k + nv], h11 = heights[k + nv + 1];
    if (u + v < 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }
  /** Interpolated vertex-normal Y (what the terrain shader sees) at x,z. */
  function surfaceNy(x, z) {
    const fx = clamp((x + half) / step, 0, segs - 1e-4), fz = clamp((z + half) / step, 0, segs - 1e-4);
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const k = j * nv + i;
    const a = normY[k], b = normY[k + 1], c = normY[k + nv], d = normY[k + nv + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  // ---------------------------------------------------------- ground mask
  // RGBA8 over the zone at 0.5 m: R = signed distance to the nearest path edge
  // (+ baked organic wobble; meters, [-4,12] -> 0..255), G = cobble/flagstone
  // weight, B = bare/trodden patch field, A = shore sand apron.
  const TEX = 0.5;
  const MW = Math.ceil(size / TEX) + 2;
  const maskMin = -half - TEX; // texel i center at maskMin + (i + 0.5) * TEX
  const span = MW * TEX;
  const mask = new Uint8Array(MW * MW * 4);
  const mnoise = makeNoise2D((seed * 7 + 3) >>> 0);
  const paths = zone.paths ?? [];
  const cobbleOf = (p) => (style === 2 ? 1 : (kind === 'town' && (p.width ?? 3) >= 5) ? 1 : 0);
  const bareCut = { forest: 0.5, mountain: 0.52, town: 0.6, glade: 0.6 }[kind] ?? 0.62;
  const wx = water?.pos?.[0] ?? 0, wz = water?.pos?.[1] ?? 0, wHalf = (water?.size ?? 0) / 2;
  for (let j = 0; j < MW; j++) {
    const z = maskMin + (j + 0.5) * TEX;
    for (let i = 0; i < MW; i++) {
      const x = maskMin + (i + 0.5) * TEX;
      const o = (j * MW + i) * 4;
      // paths
      let e = 12, cob = 0;
      for (let p = 0; p < paths.length; p++) {
        const P = paths[p];
        const d = distToSeg(x, z, P.from, P.to) - (P.width ?? 3) * 0.5;
        if (d < e) e = d;
        if (d < 1.2 && cobbleOf(P)) cob = Math.max(cob, clamp01((1.2 - d) / 1.2));
      }
      if (e < 11) e += mnoise(x * 0.11 + 31.7, z * 0.11 - 8.3) * 0.42 + mnoise(x * 0.37 - 5.1, z * 0.37 + 12.9) * 0.16;
      mask[o] = Math.round(clamp01((e + 4) / 16) * 255);
      mask[o + 1] = Math.round(cob * 255);
      // bare / trodden patches
      const bn = mnoise(x * 0.03 - 80.3, z * 0.03 + 30.1) * 0.5 + 0.5 + mnoise(x * 0.11 + 7.7, z * 0.11 - 3.3) * 0.08;
      mask[o + 2] = Math.round(clamp01((bn - bareCut) * 3.2) * 255);
      // shore apron
      let ap = 0;
      if (water) {
        const dEdge = Math.max(Math.abs(x - wx) - wHalf, Math.abs(z - wz) - wHalf);
        if (dEdge < 12) {
          const shoreN = mnoise(x * 0.055 + 3.3, z * 0.055 - 9.9) * 1.7 + mnoise(x * 0.23 - 1.1, z * 0.23 + 4.4) * 0.8;
          ap = clamp01(1 - (dEdge + shoreN) / 6.5);
        }
      }
      mask[o + 3] = Math.round(ap * 255);
    }
  }
  const maskTex = new THREE.DataTexture(mask, MW, MW, THREE.RGBAFormat, THREE.UnsignedByteType);
  maskTex.magFilter = THREE.LinearFilter;
  maskTex.minFilter = THREE.LinearMipmapLinearFilter;
  maskTex.generateMipmaps = true;
  maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping;
  maskTex.anisotropy = 4;
  maskTex.needsUpdate = true;

  /** CPU bilinear sample of the mask (same data the GPU filters). Writes into `out`. */
  function sampleMask(x, z, out) {
    const fx = clamp((x - maskMin) / TEX - 0.5, 0, MW - 1.001), fz = clamp((z - maskMin) / TEX - 0.5, 0, MW - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const o00 = (j * MW + i) * 4, o10 = o00 + 4, o01 = o00 + MW * 4, o11 = o01 + 4;
    const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
    const r = (mask[o00] * w00 + mask[o10] * w10 + mask[o01] * w01 + mask[o11] * w11) / 255;
    out.edge = r * 16 - 4;
    out.cobble = (mask[o00 + 1] * w00 + mask[o10 + 1] * w10 + mask[o01 + 1] * w01 + mask[o11 + 1] * w11) / 255;
    out.bare = (mask[o00 + 2] * w00 + mask[o10 + 2] * w10 + mask[o01 + 2] * w01 + mask[o11 + 2] * w11) / 255;
    out.apron = (mask[o00 + 3] * w00 + mask[o10 + 3] * w10 + mask[o01 + 3] * w01 + mask[o11 + 3] * w11) / 255;
    return out;
  }

  // ---------------------------------------------------------- material
  const C = groundTones(biome);
  const U = (v) => ({ value: v });
  const uniforms = {
    uGMask: U(maskTex),
    uGMaskXf: U(new THREE.Vector4(maskMin, maskMin, 1 / span, 1 / span)),
    uGGrassA: U(C.grassA), uGGrassB: U(C.grassB), uGGrassSun: U(C.grassSun), uGGrassCool: U(C.grassCool),
    uGDirt: U(C.dirt), uGStone: U(C.stone), uGStoneDark: U(C.stoneDark),
    uGSand: U(C.sand), uGSandWet: U(C.sandWet), uGSandLight: U(C.sandLight),
    uGSnow: U(C.snow), uGSnowShade: U(C.snowShade),
    uGPath: U(C.path), uGPathWorn: U(C.pathWorn), uGPathLight: U(C.pathLight), uGRim: U(C.rim), uGMoss: U(C.moss),
    uGP: U(new THREE.Vector4(hills, water?.level ?? 0, water ? 1 : 0, kind === 'mountain' ? 1 : 0)),
    uGP2: U(new THREE.Vector4(SNOW_LOW + 1.2, kind === 'mountain' ? 0.07 : 0.13, 0.07, style === 2 ? 0.62 : 2.3)),
    uGWater: U(new THREE.Vector4(wx, wz, wHalf, 0)),
    uGField: U(new THREE.Vector4(0, 0, 10, 20)), // driven by grass.js each frame
    uGFieldK: U(new THREE.Vector4(0, 0, 0, 0)),
    uGStroke: U(new THREE.Vector4(Math.cos((Math.abs(seed | 0) % 628) / 100), Math.sin((Math.abs(seed | 0) % 628) / 100), 0.1, 0)), // along grass.js's wind
  };
  // LF_GROUND_LQ (quality 'low'): drops the sub-meter extras (brush strokes,
  // pebbles, bank streaks, edge micro-noise, triplanar rock) — the ground
  // shader is the priciest pixel work on software/low-end GL. grass.js copies
  // these defines, so blade roots keep matching the ground in either variant.
  const defines = { LF_GROUND_STYLE: style };
  if (settings.quality === 'low') defines.LF_GROUND_LQ = 1;

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: style === 0 ? 0.95 : 0.88, metalness: 0,
  });
  material.defines = { ...defines };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWorldPos;\nvarying vec3 vGWorldNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vGWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vGWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGWorldPos;\nvarying vec3 vGWorldNormal;\n${GROUND_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 gBump;
  {
    float gFw = length(fwidth(vGWorldPos.xz));
    float gGrass;
    vec3 gCol = lfGround(vGWorldPos, normalize(vGWorldNormal), gFw, lfMask(vGWorldPos.xz), gGrass, gBump);
    diffuseColor.rgb *= gCol;
  }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = normalize(normal + (viewMatrix * vec4(gBump, 0.0)).xyz);`);
  };
  material.customProgramCacheKey = () => `lf-terrain-v2-${style}`;

  const offSettings = bus.on('settings:changed', ({ key } = {}) => {
    if (key !== 'quality') return;
    if (settings.quality === 'low') defines.LF_GROUND_LQ = 1; else delete defines.LF_GROUND_LQ;
    material.defines = { ...defines };
    material.needsUpdate = true;
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false; // it's the whole zone floor — always at least partly visible

  function heightAt(x, z) { return computeHeight(x, z); }

  function dispose() {
    offSettings?.();
    geo.dispose();
    material.dispose();
    maskTex.dispose();
  }

  // Everything grass.js needs to grow blades that agree with this ground.
  const ground = {
    style, kind, biome, size, half, hills, seed,
    uniforms, defines, glsl: GROUND_GLSL,
    water: water ? { level: water.level ?? 0, cx: wx, cz: wz, half: wHalf } : null,
    snowLine: kind === 'mountain' ? SNOW_LOW + 1.2 : Infinity,
    rockSlope: uniforms.uGP2.value.y,
    surfaceY, surfaceNy, sampleMask,
  };

  return { mesh, heightAt, dispose, ground };
}
