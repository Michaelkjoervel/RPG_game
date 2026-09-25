// ============================================================================
// world/water.js — one stylized water surface per zone.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createWater(zone, heightAt?) -> { mesh, update(dt), dispose() } | null
//
// v2 look: depth-tinted body (clear turquoise shallows -> deep teal), fresnel
// reflection of the LIVE sky (the same gradient + sunset glow the dome shows,
// via sky.js's skyShared) including the distant backdrop ridges, animated
// ripple normals, sun glints + glitter, a soft broken foam band that hugs
// every real waterline, and a feathered edge.
//
// Shoreline data is baked ONCE into a small RG texture over the water rect:
//   R = water depth (0..4 m) for the body tint,
//   G = signed distance to the waterline (-2..8 m) for foam and the feather.
// The waterline is where the terrain rises above the water level, OR a
// noisy, round-cornered inset of the zone's water rect where the terrain is
// still below water there (starfall's crater, the drowned terraces) — so the
// pool never ends on a ruler-straight edge.
//
// Heights: `heightAt` (world.js's terrain.heightAt) when passed — the
// addendum's original signature took `zone` alone, so without it the first
// update() reads the rendered terrain mesh from the scene graph instead
// (world.js adds both before the first frame). Until then the surface
// renders as open water with the organic rect edge.
// ============================================================================
import * as THREE from 'three';
import { skyShared } from './sky.js';

const DEPTH_MAX = 4.0;          // m, R channel range
const SD_MIN = -2.0, SD_SPAN = 10.0; // m, G channel: signed distance range

// shallow/deep: body tint by depth; clarity: 1/m (how fast depth saturates);
// reflect: fresnel mirror strength; foam: foam amount; ripple: normal strength;
// murk/murkAmt: suspended-silt haze mixed into the body (murky zones).
const WATER_PALETTES = {
  lake:        { shallow: 0x7fd4c4, deep: 0x16456a, clarity: 0.85, reflect: 1.0,  foam: 0.9,  ripple: 0.85 },
  mirrorlake:  { shallow: 0x84d4c8, deep: 0x143f66, clarity: 0.8,  reflect: 1.15, foam: 0.8,  ripple: 0.6 },
  meadow:      { shallow: 0x8ad8bc, deep: 0x1f5a66, clarity: 1.0,  reflect: 1.0,  foam: 0.9,  ripple: 0.8 },
  town:        { shallow: 0x8ad8bc, deep: 0x1f5a66, clarity: 1.0,  reflect: 1.0,  foam: 0.9,  ripple: 0.8 },
  forest:      { shallow: 0x72bfa0, deep: 0x1a4440, clarity: 1.2,  reflect: 0.9,  foam: 0.8,  ripple: 0.8 },
  glade:       { shallow: 0x88d6dc, deep: 0x243a76, clarity: 0.9,  reflect: 1.05, foam: 0.7,  ripple: 0.6 },
  mountain:    { shallow: 0x9ad6ee, deep: 0x245478, clarity: 1.0,  reflect: 1.0,  foam: 0.8,  ripple: 1.0 },
  ruins:       { shallow: 0x74b8a6, deep: 0x1c4644, clarity: 1.5,  reflect: 0.75, foam: 0.7,  ripple: 0.8, murk: 0x4f8a80, murkAmt: 0.38 },
  sunkenruins: { shallow: 0x74bcaa, deep: 0x1a4646, clarity: 1.6,  reflect: 0.72, foam: 0.7,  ripple: 0.8, murk: 0x4c8a80, murkAmt: 0.42 },
  cave:        { shallow: 0x3a6a70, deep: 0x05121a, clarity: 1.4,  reflect: 0.85, foam: 0.25, ripple: 0.45 },
  spire:       { shallow: 0x4a5aa0, deep: 0x0e1230, clarity: 1.4,  reflect: 0.85, foam: 0.25, ripple: 0.45 },
};

const VERT = /* glsl */ `
uniform float uTime, uWave;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  // a faint swell — reads only where the surface meets the shore
  p.y += (sin(p.x * 0.35 + uTime * 1.1) * 0.03 + sin(p.z * 0.5 - uTime * 0.8 + p.x * 0.15) * 0.022) * uWave;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

function fragShader() {
  return /* glsl */ `
varying vec3 vWorld;
uniform sampler2D uMap;
uniform vec2 uRectMin;
uniform float uRectSize;
uniform vec3 uShallow, uDeep, uMurk, uLitCol, uAmbCol;
uniform float uMurkAmt, uTime, uReflect, uClarity, uFoamAmt, uRipple, uGlint;
uniform sampler2D uBackTex;
uniform vec3 uBackR, uBackC0, uBackC1, uBackC2;
uniform float uBackEyeY, uBackOn;
${skyShared.glsl}
#include <fog_pars_fragment>

float wHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x),
             mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// ripple height field: three drifting octaves, crossing directions
float wHeight(vec2 p, float t) {
  float h = wNoise(p * 0.45 + vec2(t * 0.20, t * 0.11)) * 0.62;
  h += wNoise(p * 1.15 - vec2(t * 0.29, -t * 0.17)) * 0.28;
  h += wNoise(p * 2.9 + vec2(-t * 0.43, t * 0.35)) * 0.1;
  return h;
}
// reflected ray vs one backdrop ring: does it hit the ridge below its crest?
vec3 backHit(vec3 P, vec3 R, vec3 col, float Rl, vec4 sel, vec3 lc) {
  vec2 d = R.xz;
  float a = dot(d, d);
  if (a < 1e-6) return col;
  vec2 o = P.xz;
  float b = dot(o, d);
  float c = dot(o, o) - Rl * Rl;
  float disc = b * b - a * c;
  if (disc < 0.0) return col;
  float t = (-b + sqrt(disc)) / a;
  vec2 hit = o + d * t;
  float y = P.y + R.y * t;
  float u = fract(atan(hit.y, hit.x) / 6.2831853 + 1.0);
  float crest = uBackEyeY + Rl * (dot(texture2D(uBackTex, vec2(u, 0.5)), sel) * 0.4 - 0.05);
  float soft = Rl * 0.006;
  float k = 1.0 - smoothstep(crest - soft, crest + soft, y);
  float mist = 1.0 - smoothstep(uBackEyeY - Rl * 0.03, uBackEyeY + Rl * 0.02, y);
  return mix(col, mix(lc, col, mist * 0.55), k);
}

void main() {
  vec2 muv = (vWorld.xz - uRectMin) / uRectSize;
  vec4 m = texture2D(uMap, muv);
  float depth = m.r * ${DEPTH_MAX.toFixed(1)};
  float sd = m.g * ${SD_SPAN.toFixed(1)} + (${SD_MIN.toFixed(1)});
  if (sd < -0.05) discard;

  vec3 toCam = cameraPosition - vWorld;
  float vd = length(toCam);
  vec3 V = toCam / vd;
  float t = uTime;
  vec2 p = vWorld.xz;

  // ripple normal: finite differences of the height field, calmer with distance
  float e = 0.14;
  float h0 = wHeight(p, t);
  float hx = wHeight(p + vec2(e, 0.0), t);
  float hz = wHeight(p + vec2(0.0, e), t);
  float amp = uRipple * 0.2 * (1.0 - smoothstep(10.0, 80.0, vd) * 0.7);
  vec3 N = normalize(vec3(-(hx - h0) / e * amp, 1.0, -(hz - h0) / e * amp));

  // fresnel reflection of the live sky + the backdrop ridges
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float F = clamp((0.03 + 0.97 * pow(1.0 - ndv, 5.0)) * uReflect, 0.0, 1.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + 0.004;
  R = normalize(R);
  vec3 refl = lfSkyGradient(R);
  if (uBackOn > 0.5) {
    refl = backHit(vWorld, R, refl, uBackR.z, vec4(0.0, 0.0, 1.0, 0.0), uBackC2);
    refl = backHit(vWorld, R, refl, uBackR.y, vec4(0.0, 1.0, 0.0, 0.0), uBackC1);
    refl = backHit(vWorld, R, refl, uBackR.x, vec4(1.0, 0.0, 0.0, 0.0), uBackC0);
  }

  // body: depth-tinted, lit by the frame's key + fill (unlit shader, lit look)
  float dT = 1.0 - exp(-depth * uClarity);
  vec3 body = mix(uShallow, uDeep, dT);
  body = mix(body, uMurk, uMurkAmt * (0.35 + 0.65 * dT));
  body *= uAmbCol + uLitCol;
  vec3 col = mix(body, refl, F);

  // sun: a hot glint, a soft sheen and wind-scattered glitter
  float sdot = max(dot(R, uSkySunDir), 0.0);
  float glint = pow(sdot, 900.0) * 7.0 + pow(sdot, 70.0) * 0.35;
  float glitter = step(0.9, wNoise(p * 6.5 + vec2(t * 0.9, -t * 0.7))) * pow(sdot, 10.0) * 1.6;
  col += uSkySunColor * (glint + glitter) * uSkySunAmt * uGlint;

  // shore foam: a soft, broken band that laps along every waterline
  float fn = wNoise(p * 0.7 + vec2(t * 0.12, -t * 0.09)) * 0.62 + wNoise(p * 2.3 - vec2(t * 0.21, t * 0.16)) * 0.38;
  float band = 1.0 - smoothstep(0.05, 0.75 + fn * 0.9, sd);
  float lap = 0.5 + 0.5 * sin(sd * 5.0 - t * 1.4 + fn * 5.0);
  float edgeLine = 1.0 - smoothstep(0.0, 0.22, abs(sd - 0.12));
  float foam = clamp(band * (0.45 + 0.55 * lap) * smoothstep(0.3, 0.62, fn + band * 0.25) + edgeLine * 0.55, 0.0, 1.0) * uFoamAmt;
  vec3 foamCol = (uAmbCol + uLitCol) * 0.95 + vec3(0.015);
  col = mix(col, foamCol, foam * 0.8);

  // alpha: clear shallows (the bed reads through), feathered waterline
  float alpha = mix(0.38, 0.94, smoothstep(0.05, 1.9, depth));
  alpha = max(alpha, F * 0.92);
  alpha = max(alpha, foam * 0.85);
  alpha *= smoothstep(-0.05, 0.28, sd);

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
}

// ---------------------------------------------------------------- bake helpers
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const u = x - xi, v = z - zi;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return (a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv;
}

/** Height sampler over the water rect from the rendered terrain mesh (fallback path). */
function meshHeightSampler(terrainMesh, x0, z0, size, N) {
  const pos = terrainMesh?.geometry?.attributes?.position;
  if (!pos) return null;
  const texel = size / N;
  const sum = new Float32Array(N * N), cnt = new Uint16Array(N * N);
  terrainMesh.updateWorldMatrix(true, false);
  const e = terrainMesh.matrixWorld.elements;
  for (let k = 0; k < pos.count; k++) {
    const lx = pos.getX(k), ly = pos.getY(k), lz = pos.getZ(k);
    const x = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
    const y = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
    const z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
    const i = Math.floor((x - x0) / texel), j = Math.floor((z - z0) / texel);
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    sum[j * N + i] += y; cnt[j * N + i]++;
  }
  const h = new Float32Array(N * N);
  const known = new Uint8Array(N * N);
  let any = false;
  for (let k = 0; k < N * N; k++) if (cnt[k]) { h[k] = sum[k] / cnt[k]; known[k] = 1; any = true; }
  if (!any) return null;
  // fill texels no vertex landed in (coarser terrain than the map) from neighbours
  for (let pass = 0; pass < 12; pass++) {
    let missing = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (known[k]) continue;
      let s = 0, c = 0;
      if (i > 0 && known[k - 1] === 1) { s += h[k - 1]; c++; }
      if (i < N - 1 && known[k + 1] === 1) { s += h[k + 1]; c++; }
      if (j > 0 && known[k - N] === 1) { s += h[k - N]; c++; }
      if (j < N - 1 && known[k + N] === 1) { s += h[k + N]; c++; }
      if (c) { h[k] = s / c; known[k] = 2; } else missing++;
    }
    for (let k = 0; k < N * N; k++) if (known[k] === 2) known[k] = 1;
    if (!missing) break;
  }
  return (x, z) => {
    const i = Math.min(N - 1, Math.max(0, Math.floor((x - x0) / texel)));
    const j = Math.min(N - 1, Math.max(0, Math.floor((z - z0) / texel)));
    return h[j * N + i];
  };
}

export function createWater(zone, heightAt) {
  const w = zone.water;
  if (!w) return null;

  const size = w.size ?? 60;
  const level = w.level ?? 0;
  const pos = w.pos ?? [0, 0];
  const biome = zone.biome ?? 'lake';
  const pal = { ...WATER_PALETTES.lake, ...(WATER_PALETTES[biome] ?? {}), ...(WATER_PALETTES[zone.id] ?? {}) };

  const segs = Math.max(8, Math.min(48, Math.round(size / 2.5)));
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  // ---------------------------------------------------------- shoreline map
  const N = Math.max(48, Math.min(200, Math.round(size / 0.75)));
  const texel = size / N;
  const x0 = pos[0] - size / 2, z0 = pos[1] - size / 2;
  const mapData = new Uint8Array(N * N * 4);
  const mapTex = new THREE.DataTexture(mapData, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  mapTex.flipY = false;
  mapTex.magFilter = THREE.LinearFilter;
  mapTex.minFilter = THREE.LinearFilter;
  mapTex.wrapS = mapTex.wrapT = THREE.ClampToEdgeWrapping;

  function bake(heightFn) {
    const half = size / 2, rc = Math.min(half * 0.3, 8);
    const D = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      const z = z0 + (j + 0.5) * texel;
      for (let i = 0; i < N; i++) {
        const x = x0 + (i + 0.5) * texel;
        const d = heightFn ? level - heightFn(x, z) : 2.5;
        // organic inset of the rect: rounded corners + a wandering margin
        const qx = Math.abs(x - pos[0]) - (half - rc), qz = Math.abs(z - pos[1]) - (half - rc);
        const sdf = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - rc;
        const wob = 0.7 + 1.9 * vnoise(x * 0.075 + 13.1, z * 0.075 - 7.7) + 0.6 * vnoise(x * 0.23, z * 0.23);
        D[j * N + i] = Math.min(d, (-sdf - wob) * 0.6);
      }
    }
    // signed distance to the waterline (D = 0): sub-texel seeds on every
    // wet/dry crossing, then a two-pass 8-neighbour chamfer on each side
    const INF = 1e9;
    const dist = new Float32Array(N * N).fill(INF);
    const seed = (k, v) => { if (v < dist[k]) dist[k] = v; };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, a = D[k];
      if (i < N - 1) {
        const b = D[k + 1];
        if ((a > 0) !== (b > 0)) { const f = a / (a - b); seed(k, Math.abs(f) * texel); seed(k + 1, Math.abs(1 - f) * texel); }
      }
      if (j < N - 1) {
        const b = D[k + N];
        if ((a > 0) !== (b > 0)) { const f = a / (a - b); seed(k, Math.abs(f) * texel); seed(k + N, Math.abs(1 - f) * texel); }
      }
    }
    const d1 = texel, d2 = texel * Math.SQRT2;
    const relax = (k, n, c) => { const v = dist[n] + c; if (v < dist[k] && (D[n] > 0) === (D[k] > 0)) dist[k] = v; };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (i > 0) relax(k, k - 1, d1);
      if (j > 0) { relax(k, k - N, d1); if (i > 0) relax(k, k - N - 1, d2); if (i < N - 1) relax(k, k - N + 1, d2); }
    }
    for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
      const k = j * N + i;
      if (i < N - 1) relax(k, k + 1, d1);
      if (j < N - 1) { relax(k, k + N, d1); if (i < N - 1) relax(k, k + N + 1, d2); if (i > 0) relax(k, k + N - 1, d2); }
    }
    for (let k = 0; k < N * N; k++) {
      const wet = D[k] > 0;
      const s = dist[k] >= INF ? (wet ? 8 : -2) : (wet ? dist[k] : -dist[k]);
      mapData[k * 4] = Math.round(Math.min(1, Math.max(0, D[k] / DEPTH_MAX)) * 255);
      mapData[k * 4 + 1] = Math.round(Math.min(1, Math.max(0, (s - SD_MIN) / SD_SPAN)) * 255);
      mapData[k * 4 + 2] = 0;
      mapData[k * 4 + 3] = 255;
    }
    mapTex.needsUpdate = true;
  }
  let baked = false;
  if (typeof heightAt === 'function') { bake(heightAt); baked = true; }
  else bake(null); // open water with the organic rect edge until the terrain is found

  // ---------------------------------------------------------- material
  const sky = skyShared.uniforms;
  const bd = skyShared.backdrop;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  Object.assign(uniforms, sky, {
    uTime: { value: 0 },
    uWave: { value: 1 },
    uMap: { value: mapTex },
    uRectMin: { value: new THREE.Vector2(x0, z0) },
    uRectSize: { value: size },
    uShallow: { value: new THREE.Color(pal.shallow) },
    uDeep: { value: new THREE.Color(pal.deep) },
    uMurk: { value: new THREE.Color(pal.murk ?? pal.deep) },
    uMurkAmt: { value: pal.murkAmt ?? 0 },
    uClarity: { value: pal.clarity },
    uReflect: { value: pal.reflect },
    uFoamAmt: { value: pal.foam },
    uRipple: { value: pal.ripple },
    uGlint: { value: skyShared.indoor ? 0 : 1 },
    uLitCol: { value: new THREE.Color(0.5, 0.5, 0.5) },
    uAmbCol: { value: new THREE.Color(0.2, 0.2, 0.25) },
    uBackTex: { value: bd?.tex ?? null },
    uBackR: { value: bd ? bd.radii : new THREE.Vector3(1e5, 1e5, 1e5) },
    uBackEyeY: { value: bd?.eyeY ?? 0 },
    uBackOn: { value: bd?.tex ? 1 : 0 },
    uBackC0: { value: bd?.colors?.[0] ?? new THREE.Color() },
    uBackC1: { value: bd?.colors?.[1] ?? new THREE.Color() },
    uBackC2: { value: bd?.colors?.[2] ?? new THREE.Color() },
  });
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: fragShader(),
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'water';
  mesh.position.set(pos[0], level, pos[1]);
  mesh.renderOrder = 2; // after opaque terrain/props, before UI-space effects
  mesh.receiveShadow = false;
  mesh.castShadow = false;

  const L = skyShared.light;
  let time = Math.random() * 10;
  let lookedForTerrain = false;
  function update(dt) {
    time += dt;
    uniforms.uTime.value = time;
    if (!baked && !lookedForTerrain && mesh.parent) {
      // fallback: bake from the rendered terrain world.js added to the scene
      lookedForTerrain = true;
      let root = mesh.parent;
      while (root.parent) root = root.parent;
      const terrain = root.getObjectByName('terrain');
      const fn = terrain ? meshHeightSampler(terrain, x0, z0, size, N) : null;
      if (fn) { bake(fn); baked = true; }
    }
    // the frame's light, as a flat upward-facing surface receives it
    const keyUp = Math.max(L.dir.y, 0.08);
    uniforms.uLitCol.value.copy(L.sunColor).multiplyScalar(L.sunIntensity * keyUp / Math.PI);
    uniforms.uAmbCol.value.copy(L.hemiSky).multiplyScalar(L.hemiIntensity * 1.1 / Math.PI);
    // stylized balance: by day the water shows its own turquoise body; toward
    // dusk and night it turns into a mirror of the glowing sky
    uniforms.uReflect.value = pal.reflect * (skyShared.indoor ? 1 : 0.74 + 0.36 * Math.min(1, L.dusk * 1.6) + 0.14 * L.night);
  }

  function dispose() {
    geo.dispose();
    material.dispose();
    mapTex.dispose();
  }

  return { mesh, update, dispose };
}
