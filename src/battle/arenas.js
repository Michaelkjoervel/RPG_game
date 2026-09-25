// Battle arenas (visual pass v2, soft-stylized) + the shared STAGE KIT.
//
// Every arena is a small dressed world built around two stand marks:
//   · the REAL zone sky — world/sky.js createSky() for the zone the battle
//     happens in (same mood table, same time of day, same clouds/stars), built
//     into a rotatable group so the sun always lights the fight from a
//     flattering angle;
//   · a per-pixel shaded ground (multi-octave noise over the zone palette,
//     worn earth under both combatants, flagstones for ruins/spire) that rolls
//     up into hills — no facets, one draw call;
//   · swaying instanced grass + flower sprinkle, the WORLD's own props
//     (world/props.js buildProps — trees, bushes, rocks, ferns... exactly what
//     the overworld uses) framing the fight, and layered background
//     silhouettes (tree line, two haze ridges) so no view ends on a bare line;
//   · a back/rim light in the zone's mood color and ambient particles.
// Both external builders are imported dynamically and wrapped: if either is
// broken mid-edit the arena falls back to its own sky / soft-tree dressing.
//
// API:
//   ARENA_FOR_BIOME: { biomeId -> arenaKind }
//   async buildArena(kindOrBiome, particles, { zone, dayTime }) -> {
//     kind, group, marks: { p:{x,y,z,face}, e:{...} },
//     lights: { key, fill, rim }, fog, background,
//     sky: { top, bottom }, fogColor, fogDensity, heightAt(x,z),
//     setLightMult(v), update(dt, time, camera), dispose(),
//   }
// The STAGE KIT exports (stageGroundMaterial, buildStageGround, buildGrass,
// buildFlowers, buildRidges, buildBlobField, softTreeGeometry, softBlobGeometry,
// stageSkyDome, glowTexture, fbm2, stageQuality, hookShader) are shared with
// ui/titleUI.js and ui/starterUI.js so the whole presentation speaks one look.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { settings } from '../core/settings.js';
import { G } from '../core/state.js';
import { seededRandom, hashStr } from '../core/rng.js';
import * as MAT from '../gfx/materials.js';

const TAU = Math.PI * 2;
const MARK_X = 4.5;

export const ARENA_FOR_BIOME = {
  meadow: 'meadow', forest: 'forest', cave: 'cave', lake: 'lake',
  mountain: 'mountain', ruins: 'ruins', spire: 'spire', glade: 'glade',
  town: 'meadow',
};

// Canonical zone per arena kind — used when the battle's own zone is unknown
// or does not match the arena (a scripted duel called from elsewhere).
const CANON_ZONE = {
  meadow: 'dawnmeadow', forest: 'whisperwood', cave: 'gloamcavern', lake: 'mirrorlake',
  mountain: 'skyreach', ruins: 'sunkenruins', spire: 'hollowspire', glade: 'starfallglade',
};

/** 0 = low, 1 = med, 2 = high. */
export function stageQuality() {
  const q = settings.quality;
  return q === 'low' ? 0 : q === 'med' ? 1 : 2;
}

// ============================================================== small maths
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function h2(ix, iz, s) {
  let n = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul((s | 0) + 1013, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}
/** Smooth value noise in [0,1]. */
export function vnoise2(x, z, s = 0) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = h2(ix, iz, s), b = h2(ix + 1, iz, s), c = h2(ix, iz + 1, s), d = h2(ix + 1, iz + 1, s);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
/** Fractal value noise in [0,1]. */
export function fbm2(x, z, s = 0, oct = 4) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { sum += amp * vnoise2(x * f, z * f, s + i * 17); norm += amp; amp *= 0.5; f *= 2.03; }
  return sum / norm;
}

// ============================================================== shader hook
/** Compose an onBeforeCompile hook with a stable program key (materials.js
 *  chainShaderHook when present, a keyed wrapper otherwise). */
export function hookShader(material, tag, fn) {
  if (typeof MAT.chainShaderHook === 'function') { MAT.chainShaderHook(material, tag, fn); return material; }
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) { prev?.call(this, shader, renderer); fn(shader, renderer, this); };
  material.customProgramCacheKey = () => `stage:${tag}`;
  material.needsUpdate = true;
  return material;
}
/** v2 soft look (wrapped terminator + rim) when LOOK-DEV's helper exists. */
function softLook(material, opts) {
  try { if (typeof MAT.applyLook === 'function') MAT.applyLook(material, opts); } catch (e) { /* look is optional */ }
  return material;
}
function sway(material, opts) {
  try { MAT.windSway(material, opts); } catch (e) { /* static is fine */ }
  return material;
}

// ============================================================== textures
let _glowTex = null;
/** Shared soft radial white glow (alpha falloff) — never disposed. */
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.72)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

// ============================================================== GLSL
const GLSL_NOISE = /* glsl */ `
float stgHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float stgNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(stgHash(i), stgHash(i + vec2(1.0, 0.0)), u.x), mix(stgHash(i + vec2(0.0, 1.0)), stgHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float stgFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * stgNoise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.875; }
`;

// ============================================================== ground
/**
 * Per-pixel stylized ground: noise-mottled palette, worn earth patches under
 * the stand marks, optional concentric flagstones, hill tint, far fade.
 *   o: { a, b, c, dirt, far, hill, marks:[px,pz,ex,ez], worn:[rp,re,amt,rim],
 *        farR:[r0,r1,amt], hillR:[r0,r1,amt], pave:{ r, w, amt, moss, c1, c2 },
 *        scale, rough }
 */
export function stageGroundMaterial(o = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: o.rough ?? 0.97, metalness: 0 });
  const col = (v, d) => new THREE.Color(v ?? d);
  const pave = o.pave ?? null;
  const U = {
    uStgA: { value: col(o.a, 0x6fa84a) }, uStgB: { value: col(o.b, 0x8cc255) }, uStgC: { value: col(o.c, 0xb8c46a) },
    uStgDirt: { value: col(o.dirt, 0x9c8058) }, uStgFar: { value: col(o.far, 0xa8c79a) }, uStgHillCol: { value: col(o.hill, 0x7fae55) },
    uStgPave: { value: col(pave?.c1, 0x8a8f94) }, uStgPave2: { value: col(pave?.c2, 0x6f757c) },
    uStgMarks: { value: new THREE.Vector4(...(o.marks ?? [-MARK_X, 0, MARK_X, 0])) },
    uStgWorn: { value: new THREE.Vector4(...(o.worn ?? [1.6, 1.6, 0.75, 0.08])) },
    uStgFarR: { value: new THREE.Vector4(...(o.farR ?? [30, 90, 0.55]), 0) },
    uStgHill: { value: new THREE.Vector4(...(o.hillR ?? [16, 40, 0.5]), 0) },
    uStgPaveR: { value: new THREE.Vector4(pave?.r ?? 0, pave?.w ?? 1.1, pave?.amt ?? 0, pave?.moss ?? 0) },
    uStgScale: { value: o.scale ?? 1 },
  };
  m.userData.stageUniforms = U;
  hookShader(m, 'stage-ground-v1', (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStgW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vStgW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vStgW;
uniform vec3 uStgA, uStgB, uStgC, uStgDirt, uStgFar, uStgHillCol, uStgPave, uStgPave2;
uniform vec4 uStgMarks, uStgWorn, uStgFarR, uStgHill, uStgPaveR;
uniform float uStgScale;
${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vStgW.xz;
  float r = length(p);
  float n1 = stgFbm(p * 0.085 * uStgScale + vec2(3.1, 7.4));
  float n2 = stgFbm(p * 0.37 * uStgScale + vec2(11.3, 2.9));
  float n3 = stgNoise(p * 3.1);
  float n4 = stgNoise(p * 11.7);
  vec3 col = mix(uStgA, uStgB, smoothstep(0.3, 0.7, n1));
  col = mix(col, uStgC, smoothstep(0.5, 0.82, n2) * 0.65);
  col *= 0.9 + 0.13 * n3 + 0.06 * n4;
  col = mix(col, uStgHillCol, smoothstep(uStgHill.x, uStgHill.y, r) * uStgHill.z);
  float dp = length(p - uStgMarks.xy) / uStgWorn.x;
  float de = length(p - uStgMarks.zw) / uStgWorn.y;
  float d = min(dp, de) + (n2 - 0.5) * 0.4 + (n3 - 0.5) * 0.14;
  float worn = 1.0 - smoothstep(0.7, 1.0, d);
  vec3 dirt = uStgDirt * (0.84 + 0.24 * n3 + 0.1 * n4);
  col = mix(col, dirt, worn * uStgWorn.z);
  col *= 1.0 + uStgWorn.w * (smoothstep(0.78, 1.0, d) - smoothstep(1.0, 1.4, d));
  if (uStgPaveR.z > 0.0) {
    float w = uStgPaveR.y;
    float ri = floor(r / w);
    float segs = max(6.0, floor(6.2831 * (ri + 0.5) / 1.3));
    float a01 = fract(atan(p.y, p.x) / 6.2831 + stgHash(vec2(ri, 3.3)));
    float si = floor(a01 * segs);
    float fr = fract(r / w);
    float fa = fract(a01 * segs);
    float edge = min(min(fr, 1.0 - fr) * w, min(fa, 1.0 - fa) * 6.2831 * max(r, 0.4) / segs);
    float grout = smoothstep(0.025, 0.1, edge + (n4 - 0.5) * 0.04);
    float cellH = stgHash(vec2(ri, si) + 0.37);
    vec3 stone = mix(uStgPave, uStgPave2, cellH) * (0.9 + 0.16 * n3 + 0.08 * n4);
    stone = mix(stone * 0.5, stone, grout);
    stone = mix(stone, uStgC * 0.8, (1.0 - grout) * uStgPaveR.w + smoothstep(0.62, 0.9, n2) * uStgPaveR.w * 0.6);
    float inside = 1.0 - smoothstep(uStgPaveR.x - 0.5, uStgPaveR.x + 0.3 + n2 * 1.2, r);
    col = mix(col, stone, inside * uStgPaveR.z);
  }
  col = mix(col, uStgFar, smoothstep(uStgFarR.x, uStgFarR.y, r) * uStgFarR.z);
  diffuseColor.rgb *= col;
}`);
  });
  softLook(m, { rim: 0, wrap: 1 });
  return m;
}

/** Polar-grid ground disc driven by heightAt; smooth normals, one draw call. */
export function buildStageGround(heightAt, { radius = 110, inner = 18, step = 0.7, segs = 128 } = {}) {
  const radii = [0];
  for (let r = step; r < inner; r += step) radii.push(r);
  let r = inner, dr = step * 1.6;
  while (r < radius) { radii.push(r); r += dr; dr *= 1.12; }
  radii.push(radius);
  const pos = [];
  pos.push(0, heightAt(0, 0), 0);
  for (let i = 1; i < radii.length; i++) {
    const rr = radii[i];
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * TAU;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      pos.push(x, heightAt(x, z), z);
    }
  }
  const idx = [];
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let i = 1; i < radii.length - 1; i++) {
    const b0 = 1 + (i - 1) * segs, b1 = 1 + i * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(b0 + s, b0 + s1, b1 + s);
      idx.push(b0 + s1, b1 + s1, b1 + s);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// ============================================================== grass
function bladeTuftGeometry({ blades = 6, h = 0.42, w = 0.05, spread = 0.13, seed = 7 } = {}) {
  const rng = seededRandom(seed);
  const pos = [], nrm = [], col = [], idx = [];
  let v = 0;
  for (let b = 0; b < blades; b++) {
    const a = rng() * TAU, rr = Math.sqrt(rng()) * spread;
    const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
    const hh = h * (0.6 + rng() * 0.55);
    const lean = 0.18 + rng() * 0.32;
    const dir = rng() * TAU;
    const dx = Math.cos(dir), dz = Math.sin(dir);
    const sx = -dz, sz = dx; // blade width axis
    const ww = w * (0.8 + rng() * 0.5);
    const rows = [0, 0.45, 0.8, 1];
    for (let k = 0; k < rows.length; k++) {
      const t = rows[k];
      const bend = lean * t * t * hh;
      const cx = bx + dx * bend, cz = bz + dz * bend, cy = hh * t;
      const half = ww * (1 - t * 0.92) * 0.5;
      if (k < rows.length - 1) {
        pos.push(cx - sx * half, cy, cz - sz * half, cx + sx * half, cy, cz + sz * half);
        nrm.push(0, 1, 0, 0, 1, 0);
        col.push(t, 0, 0, t, 0, 0);
      } else {
        pos.push(cx, cy, cz);
        nrm.push(0, 1, 0);
        col.push(1, 0, 0);
      }
    }
    // rows 0..2 have 2 verts, row 3 (tip) 1 vert -> 7 verts per blade
    for (let k = 0; k < 2; k++) {
      const a0 = v + k * 2, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3;
      idx.push(a0, a1, b0, a1, b1, b0);
    }
    idx.push(v + 4, v + 5, v + 6);
    v += 7;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); // r = height 0..1 (recolored below)
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * Instanced swaying grass tufts over a disc/annulus. `accept(x, z)` may veto
 * or thin placements (returns 0..1 keep-probability).
 *   o: { count, r0, r1, heightAt, accept, base, tipA, tipB, h, seed, center }
 */
export function buildGrass(o) {
  const q = stageQuality();
  const count = Math.max(0, Math.round((o.count ?? 3000) * [0.3, 0.6, 1][q]));
  const geo = bladeTuftGeometry({ blades: o.blades ?? 7, h: o.h ?? 0.4, w: o.w ?? 0.075, spread: o.spread ?? 0.16, seed: o.seed ?? 7 });
  // paint base -> tip ramp into vertex colors (height fraction lives in r)
  const base = new THREE.Color(o.base ?? 0x3b6a2c), tip = new THREE.Color(0xffffff);
  const c = geo.attributes.color;
  for (let i = 0; i < c.count; i++) {
    const t = c.getX(i);
    const k = Math.pow(t, 0.65);
    c.setXYZ(i, base.r + (tip.r - base.r) * k, base.g + (tip.g - base.g) * k, base.b + (tip.b - base.b) * k);
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  sway(mat, { strength: o.sway ?? 0.2, speed: 1.6, heightScale: (o.h ?? 0.42) * 1.1 });
  softLook(mat, { rim: 0.35, wrap: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const rng = seededRandom(o.seed ?? 99);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), e = new THREE.Euler();
  const tipA = new THREE.Color(o.tipA ?? 0xa8d86a), tipB = new THREE.Color(o.tipB ?? 0xd6df86), tc = new THREE.Color();
  const r0 = o.r0 ?? 0, r1 = o.r1 ?? 20;
  const cx = o.center?.[0] ?? 0, cz = o.center?.[1] ?? 0;
  let n = 0, tries = 0;
  while (n < count && tries < count * 8) {
    tries++;
    const a = rng() * TAU, rr = Math.sqrt(r0 * r0 + rng() * (r1 * r1 - r0 * r0));
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    const keep = o.accept ? o.accept(x, z) : 1;
    if (keep <= 0 || rng() > keep) continue;
    const clump = fbm2(x * 0.35, z * 0.35, 5, 2);
    const s = (0.65 + rng() * 0.6) * (0.75 + clump * 0.6) * (o.scaleAt ? o.scaleAt(x, z) : 1);
    e.set((rng() - 0.5) * 0.25, rng() * TAU, (rng() - 0.5) * 0.25);
    m4.compose(p3.set(x, (o.heightAt ? o.heightAt(x, z) : 0) - 0.02, z), q4.setFromEuler(e), s3.set(s, s * (0.8 + rng() * 0.45), s));
    mesh.setMatrixAt(n, m4);
    tc.copy(tipA).lerp(tipB, fbm2(x * 0.12 + 3, z * 0.12, 9, 2) * 1.2 - 0.1 + (rng() - 0.5) * 0.2);
    mesh.setColorAt(n, tc);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false; // instances span the whole stage
  return mesh;
}

// ============================================================== flowers
function flowerHeadGeometry() {
  // a slightly cupped five-petal star: 1 center + 10 rim verts, 10 tris
  const pos = [0, 0.004, 0], nrm = [0, 1, 0], idx = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU, tip = i % 2 === 0;
    const r = tip ? 0.075 : 0.03;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = tip ? 0.018 : 0.006;
    pos.push(x, y, z);
    const n = new THREE.Vector3(x * 2.5, 1, z * 2.5).normalize();
    nrm.push(n.x, n.y, n.z);
    idx.push(0, 1 + ((i + 1) % 10), 1 + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Instanced flower heads (+ matching stems) sprinkled through the grass.
 *  Stem, head and center share one local frame (head at local y = STEM) and a
 *  uniform instance scale, so the height-driven wind sway moves them as one. */
export function buildFlowers(o) {
  const q = stageQuality();
  const count = Math.max(1, Math.round((o.count ?? 160) * [0.4, 0.7, 1][q]));
  const STEM = 0.3;
  const headGeo = flowerHeadGeometry();
  headGeo.translate(0, STEM, 0);
  const centerGeo = new THREE.SphereGeometry(0.024, 5, 3);
  centerGeo.scale(1, 0.6, 1);
  centerGeo.translate(0, STEM + 0.012, 0);
  const stemGeo = new THREE.CylinderGeometry(0.008, 0.012, STEM, 4, 1, true);
  stemGeo.translate(0, STEM / 2, 0);
  const headMat = softLook(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, emissive: 0x222222, emissiveIntensity: 0.25, side: THREE.DoubleSide }), { rim: 0.5 });
  const centerMat = new THREE.MeshStandardMaterial({ color: o.center ?? 0xffc94f, roughness: 0.7, emissive: 0x3a2a00, emissiveIntensity: 0.4 });
  const stemMat = new THREE.MeshStandardMaterial({ color: o.stem ?? 0x4f8a3a, roughness: 0.9 });
  for (const m of [headMat, stemMat, centerMat]) sway(m, { strength: 0.12, speed: 1.6, heightScale: STEM });
  const heads = new THREE.InstancedMesh(headGeo, headMat, count);
  const centers = new THREE.InstancedMesh(centerGeo, centerMat, count);
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, count);
  const rng = seededRandom(o.seed ?? 31);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), e = new THREE.Euler();
  const palette = (o.colors ?? [0xfff4f8, 0xffd94f, 0xff9fb0, 0xb0a8ff]).map((c) => new THREE.Color(c));
  const r0 = o.r0 ?? 2, r1 = o.r1 ?? 16;
  let n = 0, tries = 0;
  while (n < count && tries < count * 10) {
    tries++;
    const a = rng() * TAU, rr = Math.sqrt(r0 * r0 + rng() * (r1 * r1 - r0 * r0));
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const keep = o.accept ? o.accept(x, z) : 1;
    if (keep <= 0 || rng() > keep) continue;
    // flowers grow in drifts
    if (fbm2(x * 0.22 + 17, z * 0.22, 21, 2) < 0.45 && rng() > 0.25) continue;
    const y = o.heightAt ? o.heightAt(x, z) : 0;
    const s = 0.7 + rng() * 0.75;
    e.set((rng() - 0.5) * 0.25, rng() * TAU, (rng() - 0.5) * 0.25);
    q4.setFromEuler(e);
    m4.compose(p3.set(x, y - 0.01, z), q4, s3.set(s, s, s));
    stems.setMatrixAt(n, m4);
    heads.setMatrixAt(n, m4);
    centers.setMatrixAt(n, m4);
    heads.setColorAt(n, palette[Math.floor(rng() * palette.length)]);
    n++;
  }
  for (const im of [heads, centers, stems]) {
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    im.receiveShadow = true;
  }
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  const group = new THREE.Group();
  group.add(stems, heads, centers);
  return group;
}

// ============================================================== soft shapes
/** A lumpy, softly-shaded ball (canopies, bushes, clouds, tree lines). */
export function softBlobGeometry({ detail = 2, jitter = 0.14, seed = 3, blend = 0.8 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  MAT.jitterGeometry(g, jitter, seed);
  MAT.sphericalNormals?.(g, { center: { x: 0, y: 0, z: 0 }, blend });
  g.computeBoundingSphere();
  return g;
}

function paintByHeight(geo, lo, hi, cLo, cHi, { noise = 0.05, seed = 1, exp = 1 } = {}) {
  const p = geo.attributes.position;
  const a = new THREE.Color(cLo), b = new THREE.Color(cHi);
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let t = Math.min(1, Math.max(0, (y - lo) / Math.max(1e-5, hi - lo)));
    t = Math.pow(t, exp);
    const n = (vnoise2(x * 3.1 + y * 1.7, z * 3.1, seed) - 0.5) * 2 * noise;
    out[i * 3] = a.r + (b.r - a.r) * t + n;
    out[i * 3 + 1] = a.g + (b.g - a.g) * t + n;
    out[i * 3 + 2] = a.b + (b.b - a.b) * t + n * 0.7;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}

/**
 * Soft stylized tree: tapered, root-flared trunk + a fluffy canopy of merged
 * jittered lobes with spherical "one ball" normals, painted dark-under /
 * sunlit-crown. One vertex-colored geometry (one draw call per tree kind).
 */
export function softTreeGeometry({
  seed = 1, h = 3.4, crown = 1.5, lobes = 6, squash = 0.85,
  trunk = 0x5f452c, trunkTop = 0x8a6a48, leafLo = 0x2f5e2e, leafHi = 0x9fd46a, pine = false,
} = {}) {
  const rng = seededRandom(seed);
  const trunkH = pine ? h * 0.35 : h * 0.55;
  const tg = new THREE.CylinderGeometry(crown * 0.08, crown * 0.14, trunkH, 9, 5, false).toNonIndexed();
  tg.translate(0, trunkH / 2, 0);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) { // root flare + gentle lean
    const y = tp.getY(i), f = 1 + Math.max(0, 0.25 - y) * 2.2;
    tp.setXYZ(i, tp.getX(i) * f + y * y * 0.03, y, tp.getZ(i) * f);
  }
  tg.deleteAttribute('uv');
  MAT.smoothGeometry(tg);
  paintByHeight(tg, 0, trunkH, trunk, trunkTop, { noise: 0.03, seed });
  const parts = [tg];
  const cy = trunkH + crown * (pine ? 0.2 : 0.55);
  const canopy = [];
  if (pine) {
    for (let k = 0; k < 4; k++) {
      const rr = crown * (1.05 - k * 0.22);
      const cone = new THREE.ConeGeometry(rr, crown * 1.1, 10, 3).toNonIndexed();
      cone.deleteAttribute('uv');
      MAT.jitterGeometry(cone, rr * 0.07, seed + k);
      cone.translate(0, cy + k * crown * 0.55, 0);
      canopy.push(cone);
    }
  } else {
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * TAU + rng() * 0.9;
      const rr = crown * (0.52 + rng() * 0.3) * (i === 0 ? 1.25 : 1);
      const g = new THREE.IcosahedronGeometry(rr, 2);
      g.deleteAttribute('uv');
      MAT.jitterGeometry(g, rr * 0.12, seed * 13 + i);
      const off = i === 0 ? 0 : crown * 0.62;
      g.translate(Math.cos(a) * off, cy + (i === 0 ? crown * 0.25 : (rng() - 0.35) * crown * 0.55), Math.sin(a) * off);
      canopy.push(g);
    }
  }
  let cg = mergeGeometries(canopy);
  cg.scale(1, squash, 1);
  cg.translate(0, cy * (1 - squash), 0);
  cg.computeBoundingBox();
  const bb = cg.boundingBox;
  MAT.sphericalNormals?.(cg, { center: { x: 0, y: (bb.min.y + bb.max.y) / 2, z: 0 }, blend: pine ? 0.45 : 0.78 });
  paintByHeight(cg, bb.min.y, bb.max.y, leafLo, leafHi, { noise: 0.05, seed: seed + 3, exp: 0.9 });
  parts.push(cg);
  const out = mergeGeometries(parts);
  out.computeBoundingSphere();
  return out;
}

/** Instanced placements of one geometry. items: [{x,y,z,s,sy,ry,color}] */
function instanceField(geo, mat, items, { shadow = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
  items.forEach((it, i) => {
    e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
    m4.compose(p3.set(it.x, it.y ?? 0, it.z), q4.setFromEuler(e), s3.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1));
    im.setMatrixAt(i, m4);
    if (it.color != null) im.setColorAt(i, c.set(it.color));
  });
  im.count = items.length;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = shadow;
  im.receiveShadow = true;
  im.frustumCulled = false;
  return im;
}

/** Field of soft blobs (tree lines, cloud seas, canopy rings). */
export function buildBlobField(items, { color = 0x4f7d45, emissive = 0x000000, emissiveIntensity = 0, rough = 0.95, shadow = false, seed = 5, detail = 1, fog = true, lo = null, hi = null } = {}) {
  const geo = softBlobGeometry({ detail, jitter: 0.16, seed });
  if (lo != null) paintByHeight(geo, -1, 1, lo, hi ?? color, { noise: 0.04, seed });
  const mat = new THREE.MeshStandardMaterial({
    color: lo != null ? 0xffffff : color, vertexColors: lo != null, roughness: rough, metalness: 0,
    emissive, emissiveIntensity, fog,
  });
  softLook(mat, { rim: 0.4, wrap: 1 });
  return instanceField(geo, mat, items, { shadow });
}

/**
 * Distant silhouette ridge: a ring band with a noisy crest, unlit and graded
 * from base to crest so it reads as atmospheric distance (fogged on top).
 */
export function buildRidges({ r = 110, hMin = 6, hMax = 20, base = -6, seed = 3, cLo = 0x7c9a88, cHi = 0xaec4c0, segs = 180, freq = 5, sharp = 0.25, fog = true, snow = null } = {}) {
  const pos = [], col = [], idx = [];
  const a = new THREE.Color(cLo), b = new THREE.Color(cHi), s = snow != null ? new THREE.Color(snow) : null, tmp = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, ang = t * TAU;
    const n = fbm2(Math.cos(ang) * freq + seed, Math.sin(ang) * freq, seed, 4);
    const peak = Math.pow(Math.abs(vnoise2(t * freq * 3.1, seed * 1.3, seed + 5) * 2 - 1), 1.5) * sharp;
    const h = hMin + (hMax - hMin) * Math.min(1, n * 1.25 + peak - 0.12);
    const rr = r * (0.92 + vnoise2(t * 9, seed, seed + 2) * 0.16);
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    pos.push(x, base, z, x, h, z);
    col.push(a.r, a.g, a.b);
    tmp.copy(b);
    if (s && h > hMin + (hMax - hMin) * 0.55) tmp.lerp(s, 0.75);
    col.push(tmp.r, tmp.g, tmp.b);
    if (i < segs) { const v = i * 2; idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -500;
  mesh.frustumCulled = false;
  return mesh;
}

// ============================================================== sky fallback
const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = clip.xyww;
}`;
const DOME_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uTop, uMid, uHorizon, uBottom, uSunColor, uSunDir;
uniform float uSunAmt, uGlowAmt;
void main() {
  float h = clamp(vDir.y, -1.0, 1.0);
  vec3 col = mix(uMid, uTop, smoothstep(0.08, 0.5, h));
  col = mix(uHorizon, col, smoothstep(-0.02, 0.16, h));
  col = mix(uBottom, col, smoothstep(-0.2, 0.0, h));
  float sd = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sd, 900.0) * 3.0 + pow(sd, 24.0) * 0.45 + pow(sd, 4.0) * 0.12) * uSunAmt;
  vec2 fw = normalize(vDir.xz + vec2(1e-5)), sw = normalize(uSunDir.xz + vec2(1e-5));
  col += uSunColor * pow(max(dot(fw, sw), 0.0), 3.0) * exp(-abs(h) * 6.0) * uGlowAmt;
  gl_FragColor = vec4(col, 1.0);
}`;
/** Self-contained gradient sky dome (title/starter scenes + arena fallback). */
export function stageSkyDome({ top = 0x6fa8e8, mid = 0xa8d0f0, horizon = 0xf2e2c4, bottom = 0x8a9a88, sun = 0xfff0c8, sunDir = [0.3, 0.25, -1], sunAmt = 1, glow = 0.35, radius = 400 } = {}) {
  const u = {
    uTop: { value: new THREE.Color(top) }, uMid: { value: new THREE.Color(mid) },
    uHorizon: { value: new THREE.Color(horizon) }, uBottom: { value: new THREE.Color(bottom) },
    uSunColor: { value: new THREE.Color(sun) }, uSunDir: { value: new THREE.Vector3(...sunDir).normalize() },
    uSunAmt: { value: sunAmt }, uGlowAmt: { value: glow },
  };
  const geo = new THREE.SphereGeometry(radius, 32, 18);
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.userData.uniforms = u;
  return mesh;
}

// ============================================================== light shafts
function buildShafts({ count = 4, color = 0xfff2c0, seed = 4, r = 7, h = 16, width = 2.2, opacity = 0.22, tilt = 0.28 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  geo.translate(0, -0.5, 0); // pivot at the top
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
      void main(){
        float side = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
        float len = smoothstep(0.0, 0.55, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
        float flick = 0.82 + 0.18 * sin(uTime * 0.7 + vUv.x * 6.0);
        gl_FragColor = vec4(uColor, side * side * len * uOpacity * flick);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const group = new THREE.Group();
  const rng = seededRandom(seed);
  const shafts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng() * 0.8;
    const rr = r * (0.55 + rng() * 0.6);
    const holder = new THREE.Object3D();
    holder.position.set(Math.cos(a) * rr, h, Math.sin(a) * rr);
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(width * (0.7 + rng() * 0.7), h * 1.15, 1);
    m.rotation.z = tilt;
    holder.add(m);
    group.add(holder);
    shafts.push(holder);
  }
  return {
    group, geo, mat,
    update(t, camera) {
      mat.uniforms.uTime.value = t;
      if (camera) for (const s of shafts) s.rotation.y = Math.atan2(camera.position.x - s.position.x, camera.position.z - s.position.z);
    },
  };
}

// ============================================================== water ring
function buildWaterRing({ r0 = 11, r1 = 140, y = -0.35, deep = 0x2f6f8f, shallow = 0x6fc2c8, sky = 0xcfe6f0, seed = 2 } = {}) {
  const geo = new THREE.RingGeometry(r0, r1, 96, 8);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.9, depthWrite: false });
  const U = {
    uWDeep: { value: new THREE.Color(deep) }, uWShallow: { value: new THREE.Color(shallow) }, uWSky: { value: new THREE.Color(sky) },
    uWTime: { value: 0 }, uWR0: { value: r0 },
  };
  hookShader(mat, 'stage-water-v1', (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStgW;\nuniform float uWTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vec3 stgWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  transformed.y += sin(stgWp.x * 0.35 + uWTime * 1.1) * 0.04 + cos(stgWp.z * 0.28 + uWTime * 0.8) * 0.04;
  vStgW = stgWp;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vStgW;
uniform vec3 uWDeep, uWShallow, uWSky; uniform float uWTime, uWR0;
${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vStgW.xz;
  float r = length(p);
  float shore = 1.0 - smoothstep(uWR0, uWR0 + 3.5, r);
  float rip = stgFbm(p * 0.45 + vec2(uWTime * 0.12, -uWTime * 0.09));
  vec3 c = mix(uWDeep, uWShallow, shore * 0.85 + rip * 0.12);
  float foam = smoothstep(0.55, 0.9, stgNoise(p * 2.2 + uWTime * 0.3)) * (1.0 - smoothstep(uWR0, uWR0 + 0.9, r));
  c = mix(c, vec3(1.0), foam * 0.55);
  vec3 vdir = normalize(cameraPosition - vStgW);
  float fres = pow(1.0 - clamp(vdir.y, 0.0, 1.0), 3.0);
  c = mix(c, uWSky, fres * 0.7);
  diffuseColor.rgb *= c;
}`);
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  return { mesh, geo, mat, update(t) { U.uWTime.value = t; } };
}

// ============================================================== stage configs
// Positions are arena-local: the player's mark at (-4.5,0,0) facing +x, the
// foe's at (+4.5,0,0). The resting camera sits behind the player's shoulder on
// the +z side looking toward +x, so +x / -z carry the richest backdrop.
const RING_TREES = (kind = 'tree_oak', alt = 'tree_birch') => [
  // behind the foe — the backdrop of the resting shot
  { kind, at: [14.5, -3.5], scale: 1.2 }, { kind, at: [17, 4.5], scale: 1.05 }, { kind: alt, at: [12.2, -10.5], scale: 1.0 },
  { kind, at: [19.5, -9], scale: 1.25 }, { kind: alt, at: [13.5, 10.5], scale: 0.95 },
  // far side (-z) — backdrop of the wide/side shots
  { kind, at: [3, -16], scale: 1.15 }, { kind: alt, at: [-4, -14.5], scale: 1.0 }, { kind, at: [-11.5, -12.5], scale: 1.1 },
  // behind the player (-x) and near side (+z) — seen in victory / reverse shots
  { kind, at: [-16, -2], scale: 1.15 }, { kind: alt, at: [-14, 8.5], scale: 1.0 }, { kind, at: [-6, 16.5], scale: 1.1 },
  { kind, at: [5.5, 17], scale: 1.0 },
];

const STAGES = {
  meadow: {
    ground: { a: 0x5a8c3a, b: 0x79a846, c: 0xaab45e, dirt: 0x947a52, far: 0x9ab494, hill: 0x6f9a4e, worn: [1.55, 1.55, 0.62, 0.07] },
    height: 'rolling',
    grass: { count: 3600, base: 0x4f7f34, tipA: 0xa6cc5e, tipB: 0xd2d886, h: 0.36 },
    flowers: { count: 170, colors: [0xfff4f8, 0xffd94f, 0xff9fb0, 0xb9a8ff, 0xffffff] },
    props: [
      ...RING_TREES('tree_oak', 'tree_birch'),
      { kind: 'bush', at: [9.5, -5.5] }, { kind: 'bush', at: [10.5, 6] }, { kind: 'bush', at: [-9, -7] },
      { kind: 'bush', at: [1.5, -9.5] }, { kind: 'bush', at: [-2.5, 10.5] }, { kind: 'berry_bush', at: [8, 10] },
      { kind: 'rock_mossy', at: [11, 0.8], scale: 1.1 }, { kind: 'rock', at: [-10.5, 3.5], scale: 0.9 }, { kind: 'rock', at: [4, -11], scale: 0.8 },
      { kind: 'log', at: [7, -12], rot: 0.5 }, { kind: 'stump', at: [-8, -11] },
      { kind: 'flower_patch', density: 0.35, area: [0, -10, 7] }, { kind: 'flower_patch', density: 0.35, area: [11, 2, 5] },
      { kind: 'flower_patch', density: 0.3, area: [-10, 6, 6] }, { kind: 'flower_patch', density: 0.25, area: [3, 11, 6] },
      { kind: 'tree_oak', density: 0.05, area: [0, 0, 32] },
      { kind: 'bush', density: 0.07, area: [0, 0, 30] },
    ],
    treeline: { r0: 58, r1: 92, count: 170, lo: 0x3a6040, hi: 0x6f9460, s: [1.8, 3.2] },
    ridges: [{ r: 125, hMin: 4, hMax: 15, cLo: 0x8aa894, cHi: 0x9cb8a8, seed: 3 }, { r: 205, hMin: 14, hMax: 42, cLo: 0xa4bccb, cHi: 0xb4c8d6, seed: 9, freq: 7, sharp: 0.5 }],
    ambient: { kind: 'pollen', color: 0xfff6c8, color2: 0xffe9b0 },
    rim: 0xfff0d0,
  },
  forest: {
    ground: { a: 0x44703a, b: 0x5f8f45, c: 0x8a7a48, dirt: 0x6e5438, far: 0x3c5a3c, hill: 0x3f6a38, worn: [1.5, 1.5, 0.75, 0.06], farR: [22, 60, 0.6] },
    height: 'forest',
    grass: { count: 3000, base: 0x2c4a24, tipA: 0x6f9e48, tipB: 0xa9c060, h: 0.38 },
    flowers: { count: 70, colors: [0xfff4f8, 0xd8c8ff, 0xffe9b0] },
    props: [
      ...RING_TREES('tree_oak', 'tree_pine'),
      { kind: 'tree_pine', at: [11, -1], scale: 1.3 }, { kind: 'tree_oak', at: [9.5, -8], scale: 1.05 },
      { kind: 'tree_pine', at: [-11, -6], scale: 1.2 }, { kind: 'tree_oak', at: [-1, -12], scale: 1.1 },
      { kind: 'fern', density: 0.5, area: [9, -3, 5] }, { kind: 'fern', density: 0.5, area: [-9, -5, 5] },
      { kind: 'fern', density: 0.4, area: [0, -10, 6] }, { kind: 'fern', density: 0.35, area: [-2, 10, 5] },
      { kind: 'mushroom_cluster', at: [8.5, 3.5] }, { kind: 'mushroom_cluster', at: [-7.5, -8] }, { kind: 'mushroom_cluster', at: [5, -9] },
      { kind: 'log', at: [7.5, -11], rot: 0.9 }, { kind: 'stump', at: [-9.5, 5] }, { kind: 'rock_mossy', at: [10, 7], scale: 1.1 },
      { kind: 'bush', at: [-6, -11] }, { kind: 'bush', at: [12, 9] },
      { kind: 'tree_oak', density: 0.12, area: [0, 0, 30] }, { kind: 'tree_pine', density: 0.1, area: [0, 0, 30] },
    ],
    canopy: { r0: 12, r1: 30, y: [10.5, 15], count: 70, lo: 0x1f3a22, hi: 0x4f7a3a },
    treeline: { r0: 30, r1: 48, count: 140, lo: 0x1e3822, hi: 0x44683a },
    shafts: { count: 5, color: 0xfff0b8, opacity: 0.2, r: 8 },
    ambient: { kind: 'motes', color: 0xfff0b0, color2: 0xa9e07a },
    rim: 0xf0e0a0,
  },
  glade: {
    ground: { a: 0x3e6a64, b: 0x578a70, c: 0x6a5c8a, dirt: 0x5c4a6a, far: 0x3a3456, hill: 0x3f5a60, worn: [1.55, 1.55, 0.6, 0.1] },
    height: 'rolling',
    grass: { count: 3600, base: 0x223a3a, tipA: 0x5f9a86, tipB: 0x9ac0b0, h: 0.42 },
    flowers: { count: 150, colors: [0xffe9b0, 0xd8c8ff, 0xbfe8ff, 0xffd0f0], glow: true },
    props: [
      { kind: 'tree_glow', at: [14, -4], scale: 1.2 }, { kind: 'tree_glow', at: [15.5, 6], scale: 1.0 }, { kind: 'tree_oak', at: [12, -11] },
      { kind: 'tree_glow', at: [2.5, -15.5], scale: 1.1 }, { kind: 'tree_oak', at: [-6, -14] }, { kind: 'tree_glow', at: [-15, -3] },
      { kind: 'tree_oak', at: [-13, 9] }, { kind: 'tree_glow', at: [-4, 16] }, { kind: 'tree_oak', at: [8, 15] },
      { kind: 'glowfern', density: 0.5, area: [9, -6, 5] }, { kind: 'glowfern', density: 0.45, area: [-9, -7, 5] }, { kind: 'glowfern', density: 0.4, area: [1, 10, 5] },
      { kind: 'shrine_stone', at: [10.5, 1], scale: 0.9 }, { kind: 'shrine_stone', at: [-10, 3], scale: 0.8 },
      { kind: 'mushroom_cluster', at: [7, -9] }, { kind: 'mushroom_cluster', at: [-6, 9] },
      { kind: 'flower_patch', density: 0.3, area: [0, -9, 6] },
      { kind: 'tree_oak', density: 0.06, area: [0, 0, 32] },
    ],
    treeline: { r0: 32, r1: 56, count: 100, lo: 0x1c2a3a, hi: 0x3a5060 },
    ridges: [{ r: 110, hMin: 6, hMax: 18, cLo: 0x2c2a48, cHi: 0x3c3860, seed: 5 }],
    ambient: { kind: 'fireflies', color: 0xffe9b0, color2: 0xbfe8ff },
    rim: 0xc8b8ff,
  },
  lake: {
    ground: { a: 0x77a85a, b: 0x9cc26a, c: 0xd8c9a0, dirt: 0xcdb892, far: 0xb8b0a0, hill: 0xd8c9a0, worn: [1.6, 1.6, 0.55, 0.06], hillR: [9, 12.5, 0.9] },
    height: 'island',
    water: { r0: 10.5, y: -0.32, deep: 0x356f8a, shallow: 0x72b8b8 },
    grass: { count: 2600, base: 0x3f6a30, tipA: 0x9dcc66, tipB: 0xd4dc8e, h: 0.4, rMax: 10.2 },
    flowers: { count: 90, colors: [0xfff4f8, 0xffc0d0, 0xffe9b0], rMax: 9.5 },
    props: [
      { kind: 'tree_willow', at: [9.2, -4.5], scale: 1.05 }, { kind: 'tree_willow', at: [-8.5, -6.5], scale: 0.95 },
      { kind: 'tree_birch', at: [2.5, -9.2] }, { kind: 'tree_birch', at: [-3, 8.8], scale: 0.9 },
      { kind: 'reeds', density: 0.6, area: [0, 0, 14] },
      { kind: 'lilypad', density: 0.25, area: [0, 0, 22] },
      { kind: 'rock', at: [8.5, 4.5], scale: 0.8 }, { kind: 'rock_mossy', at: [-9, 2], scale: 0.8 },
      { kind: 'bush', at: [6.5, -8] }, { kind: 'bush', at: [-6, 7.5] },
    ],
    treeline: { r0: 70, r1: 95, count: 120, lo: 0x3a5a44, hi: 0x6a8a62 },
    ridges: [{ r: 120, hMin: 6, hMax: 20, cLo: 0x8a8ca8, cHi: 0xa8a8c0, seed: 7 }, { r: 190, hMin: 20, hMax: 55, cLo: 0xb0acc4, cHi: 0xc4c0d4, seed: 13, snow: 0xeeeaf4 }],
    ambient: { kind: 'motes', color: 0xffffff, color2: 0xffd0e0 },
    rim: 0xffd8c0,
  },
  mountain: {
    ground: { a: 0x7a8f74, b: 0x98a592, c: 0xeef2f6, dirt: 0x8a8378, far: 0xcfd8e0, hill: 0x8d8a86, worn: [1.6, 1.6, 0.5, 0.05], scale: 1.2 },
    height: 'plateau',
    grass: { count: 1800, base: 0x4a5a44, tipA: 0x9aa886, tipB: 0xc8ccb0, h: 0.34, rMax: 12.5 },
    props: [
      { kind: 'rock', at: [11.5, -3], scale: 1.6 }, { kind: 'rock', at: [10, 6], scale: 1.2 }, { kind: 'rock', at: [3, -11.5], scale: 1.4 },
      { kind: 'rock', at: [-8, -9.5], scale: 1.3 }, { kind: 'rock', at: [-11.5, 4], scale: 1.1 },
      { kind: 'ice_spike', at: [12.2, 2] }, { kind: 'ice_spike', at: [-3, -12] }, { kind: 'snow_pile', at: [8, -9] }, { kind: 'snow_pile', at: [-10, -3] },
      { kind: 'tree_pine', at: [9.5, -10], scale: 0.9 }, { kind: 'tree_dead', at: [-9.5, 9] }, { kind: 'tree_pine', at: [-12, -8], scale: 0.85 },
    ],
    cloudSea: { y: -9, r0: 20, r1: 150, count: 90 },
    ridges: [{ r: 95, hMin: -4, hMax: 26, base: -20, cLo: 0x7f95b0, cHi: 0xa9bbd0, seed: 11, snow: 0xf4f8ff, freq: 7, sharp: 0.6 },
      { r: 175, hMin: 10, hMax: 60, base: -20, cLo: 0xa4b4c8, cHi: 0xbccadb, seed: 17, snow: 0xf6f9ff, freq: 9, sharp: 0.8 }],
    ambient: { kind: 'snow', color: 0xffffff, color2: 0xdcecff },
    rim: 0xdce8ff,
  },
  ruins: {
    ground: { a: 0x5a8a5a, b: 0x74a064, c: 0x4f7a4c, dirt: 0x8a8070, far: 0x7aa49c, hill: 0x6a8a60, worn: [1.5, 1.5, 0.25, 0.05],
      pave: { r: 9.2, w: 1.15, amt: 1, moss: 0.35, c1: 0xa6a397, c2: 0x7f7c72 } },
    height: 'sunken',
    water: { r0: 13, y: -0.4, deep: 0x2f6a6a, shallow: 0x6aa89a },
    grass: { count: 2200, base: 0x2f4f2c, tipA: 0x7aa860, tipB: 0xb0c88a, h: 0.4, rMin: 9.6, rMax: 13 },
    props: [
      { kind: 'ruin_pillar', at: [11.5, -3.5] }, { kind: 'ruin_pillar', at: [11.8, 4] }, { kind: 'ruin_arch', at: [14, 0], rot: Math.PI / 2 },
      { kind: 'ruin_pillar', at: [3, -11.5] }, { kind: 'ruin_pillar', at: [-5, -11] }, { kind: 'ruin_wall', at: [-11.5, -6], rot: 0.9 },
      { kind: 'ruin_pillar', at: [-11.5, 4.5] }, { kind: 'ruin_wall', at: [2, 12.5], rot: 0.1 }, { kind: 'statue_warden', at: [8, -10.5], rot: -2.4 },
      { kind: 'fern', density: 0.4, area: [10, -8, 4] }, { kind: 'fern', density: 0.35, area: [-10, 8, 4] },
      { kind: 'rock_mossy', at: [9.8, 8.5] }, { kind: 'tree_willow', at: [16, -9], scale: 1.1 }, { kind: 'tree_oak', at: [-15, -10] },
      { kind: 'reeds', density: 0.5, area: [0, 0, 16] }, { kind: 'lilypad', density: 0.2, area: [0, 0, 24] },
    ],
    treeline: { r0: 40, r1: 64, count: 90, lo: 0x2f4a40, hi: 0x5a7a60 },
    ridges: [{ r: 115, hMin: 6, hMax: 16, cLo: 0x5f8a86, cHi: 0x7fa49e, seed: 21 }],
    shafts: { count: 3, color: 0xe8fff0, opacity: 0.16, r: 6 },
    ambient: { kind: 'motes', color: 0xe8fff0, color2: 0x9fe0d0 },
    rim: 0xd8f0e8,
  },
  cave: {
    ground: { a: 0x3a4648, b: 0x2c3638, c: 0x3f5f56, dirt: 0x4a4640, far: 0x0e1a1a, hill: 0x2a3434, worn: [1.55, 1.55, 0.45, 0.08], farR: [14, 30, 0.8], hillR: [11, 18, 0.7] },
    height: 'cavern',
    props: [
      { kind: 'stalagmite', at: [11, -4], scale: 1.3 }, { kind: 'stalagmite', at: [12, 5], scale: 1.1 }, { kind: 'stalagmite', at: [-10.5, -6] },
      { kind: 'stalagmite', at: [-11.5, 5.5], scale: 1.2 }, { kind: 'stalagmite', at: [2, -12] }, { kind: 'stalagmite', at: [4, 12], scale: 0.9 },
      { kind: 'crystal_cluster', at: [9.5, 1] }, { kind: 'crystal_cluster', at: [-9, -2.5] }, { kind: 'crystal_cluster', at: [5.5, -10] },
      { kind: 'rock_crystal', at: [-5, 10.5] }, { kind: 'rock_crystal', at: [10.5, 9] },
      { kind: 'glowfern', density: 0.45, area: [8, -7, 4] }, { kind: 'glowfern', density: 0.4, area: [-8, 8, 4] },
      { kind: 'mushroom_cluster', at: [-7, -9] }, { kind: 'mushroom_cluster', at: [7.5, 7] },
      { kind: 'stalactite', density: 0.15, area: [0, 0, 18] },
    ],
    ambient: { kind: 'glints', color: 0x9ff0e8, color2: 0xe8fff8 },
    rim: 0x6fe8d8,
    indoor: true,
  },
  spire: {
    ground: { a: 0x2c2a38, b: 0x34303f, c: 0x3a3450, dirt: 0x3a3444, far: 0x120f1a, hill: 0x1e1c28, worn: [1.5, 1.5, 0.2, 0.05], farR: [14, 34, 0.8],
      pave: { r: 11, w: 1.25, amt: 1, moss: 0.05, c1: 0x4a4658, c2: 0x353244 } },
    height: 'hall',
    props: [
      { kind: 'spire_wall', at: [15, -5], rot: -Math.PI / 2 }, { kind: 'spire_wall', at: [15, 5], rot: -Math.PI / 2 },
      { kind: 'spire_wall', at: [5, -15], rot: 0 }, { kind: 'spire_wall', at: [-5, -15], rot: 0 },
      { kind: 'spire_wall', at: [-15, -5], rot: Math.PI / 2 }, { kind: 'spire_wall', at: [-15, 5], rot: Math.PI / 2 },
      { kind: 'spire_wall', at: [-5, 15], rot: Math.PI }, { kind: 'spire_wall', at: [5, 15], rot: Math.PI },
      { kind: 'banner', at: [12.5, -8] }, { kind: 'banner', at: [12.5, 8] }, { kind: 'banner', at: [-12.5, -8] },
      { kind: 'ruin_pillar', at: [10, -10] }, { kind: 'ruin_pillar', at: [-10, -10] }, { kind: 'ruin_pillar', at: [10, 10] }, { kind: 'ruin_pillar', at: [-10, 10] },
    ],
    braziers: [[7.2, -6.2], [7.2, 6.2], [-7.2, -6.2], [-7.2, 6.2]],
    ambient: { kind: 'ash', color: 0x9a90b4, color2: 0xd8d0f0 },
    rim: 0xb8a2ff,
    indoor: true,
  },
};
// Brighthollow battles: the meadow stage plus a glimpse of the town.
STAGES.town = {
  ...STAGES.meadow,
  props: [
    ...RING_TREES('tree_oak', 'tree_oak').filter((_, i) => i % 3 !== 1),
    { kind: 'house_small', at: [22, -6], rot: -Math.PI / 2 }, { kind: 'house_large', at: [19, 12], rot: -2.2 },
    { kind: 'house_small', at: [6, -22], rot: 0.1 }, { kind: 'well', at: [12, -9] },
    { kind: 'fence', at: [10.5, 3.5], rot: 1.4 }, { kind: 'fence', at: [10, 7.5], rot: 1.1 }, { kind: 'fence', at: [-9.5, -8.5], rot: 0.6 },
    { kind: 'barrel', at: [11.5, -3.2] }, { kind: 'crate', at: [12.3, -2.2] }, { kind: 'cart', at: [-11, 6], rot: 0.8 },
    { kind: 'bush', at: [9, -6.5] }, { kind: 'bush', at: [-2, -10.5] }, { kind: 'bush', at: [2, 10.5] },
    { kind: 'flower_patch', density: 0.4, area: [0, -10, 7] }, { kind: 'flower_patch', density: 0.35, area: [10, 1, 4] },
  ],
};

// ------------------------------------------------------------ height fields
const HEIGHTS = {
  rolling: (x, z) => {
    const r = Math.hypot(x, z);
    const bowl = smooth(11, 30, r) * (0.5 + 1.3 * fbm2(x * 0.05, z * 0.05, 11));
    const hills = smooth(40, 110, r) * (1 + 6 * fbm2(x * 0.016 + 5, z * 0.016, 3));
    return bowl + hills;
  },
  forest: (x, z) => {
    const r = Math.hypot(x, z);
    return smooth(10, 26, r) * (0.4 + 1.4 * fbm2(x * 0.07, z * 0.07, 12)) + smooth(26, 60, r) * 3 * fbm2(x * 0.03, z * 0.03, 4);
  },
  island: (x, z) => {
    const r = Math.hypot(x, z);
    const edge = 10.2 + (fbm2(x * 0.2, z * 0.2, 6) - 0.5) * 1.6;
    const shore = -1.4 * smooth(edge - 1.4, edge + 1.8, r);
    const far = smooth(70, 110, r) * (3 + 6 * fbm2(x * 0.02, z * 0.02, 8));
    return shore + far + smooth(3, edge - 1, r) * 0.25 * fbm2(x * 0.3, z * 0.3, 2);
  },
  plateau: (x, z) => {
    const r = Math.hypot(x, z);
    const lip = 13.5 + (fbm2(x * 0.15, z * 0.15, 3) - 0.5) * 3;
    const top = smooth(8, lip, r) * 0.9 * fbm2(x * 0.2, z * 0.2, 5);
    return top - smooth(lip, lip + 7, r) * 26;
  },
  sunken: (x, z) => {
    const r = Math.hypot(x, z);
    const edge = 12.8 + (fbm2(x * 0.18, z * 0.18, 7) - 0.5) * 2;
    return smooth(9.4, 11, r) * 0.22 - smooth(edge - 0.5, edge + 2.5, r) * 1.3 + smooth(60, 100, r) * 5 * fbm2(x * 0.03, z * 0.03, 9);
  },
  cavern: (x, z) => {
    const r = Math.hypot(x, z);
    const n = fbm2(x * 0.12, z * 0.12, 14);
    return smooth(10, 16, r) * (1.2 + 2 * n) + smooth(15, 26, r) * (9 + 10 * fbm2(x * 0.08, z * 0.08, 15));
  },
  hall: (x, z) => {
    const r = Math.hypot(x, z);
    return smooth(16.5, 19, r) * 12;
  },
};

// ============================================================== zone + sky
async function resolveZone(kind, hint) {
  const want = (biome) => (ARENA_FOR_BIOME[biome] ?? biome) === kind;
  if (hint && want(hint.biome)) return hint;
  try {
    const { ZONES } = await import('../data/worldmap.js');
    const byPos = ZONES?.[G.pos?.zone];
    if (byPos && want(byPos.biome)) return byPos;
    return ZONES?.[CANON_ZONE[kind]] ?? null;
  } catch (e) { return null; }
}

// Where the key light should come from, in arena space (x toward the foe):
// behind the camera's right shoulder so both creatures read lit, and shadows
// fall back-left into the stage.
const KEY_BEARING = Math.atan2(-0.62, 0.78); // atan2(x, z) of the horizontal key direction

async function buildSkyRig(zone, stage) {
  try {
    const { createSky } = await import('../world/sky.js');
    const holder = new THREE.Group();
    holder.name = 'arena-sky';
    const sky = createSky(zone, holder);
    const hemi = holder.children.find((o) => o.isHemisphereLight) ?? null;
    const d = sky.sunDir;
    // Rotate the whole sky so its sun / moon (and the glow on the dome that
    // marks it) sits where the key light should come from.
    const bearing = Math.atan2(d.x, d.z);
    if (!stage.indoor && Math.hypot(d.x, d.z) > 0.05) holder.rotation.y = KEY_BEARING - bearing;
    holder.updateMatrixWorld(true);
    return { sky, holder, hemi, fog: holder.fog ?? null };
  } catch (e) {
    console.warn('[arenas] zone sky unavailable — using the stage sky', e?.message ?? e);
    return null;
  }
}

// ============================================================== ambient motes
function ambientFor(P, a, indoor) {
  if (!P || !a) return null;
  const q = stageQuality();
  const rate = [0.45, 0.75, 1][q];
  switch (a.kind) {
    case 'pollen': return P.ambient({ radius: 12, y0: 0.2, y1: 3.6, rate: 5 * rate, color: a.color, color2: a.color2, size: 0.06, life: 5, vel: { x: 0.18, y: 0.1, z: 0.05 }, sway: 0.7, flicker: true });
    case 'motes': return P.ambient({ radius: 11, y0: 0.3, y1: 4.5, rate: 5 * rate, color: a.color, color2: a.color2, size: 0.07, life: 5, vel: { x: 0.05, y: -0.12, z: 0.03 }, sway: 0.9, flicker: true });
    case 'fireflies': return P.ambient({ radius: 12, y0: 0.2, y1: 2.8, rate: 7 * rate, color: a.color, color2: a.color2, size: 0.09, life: 4.2, vel: { x: 0.1, y: 0.08, z: 0.1 }, sway: 1.2, flicker: true });
    case 'snow': return P.ambient({ radius: 13, y0: 0.2, y1: 6, rate: 16 * rate, color: a.color, color2: a.color2, size: 0.06, life: 2.4, vel: { x: 1.6, y: -0.5, z: 0.4 }, sway: 0.4, flicker: false, additive: true });
    case 'glints': return P.ambient({ radius: 10, y0: 0.2, y1: 3.4, rate: 5 * rate, color: a.color, color2: a.color2, size: 0.06, life: 4.5, vel: { x: 0.03, y: 0.06, z: 0 }, sway: 0.35, flicker: true });
    case 'ash': return P.ambient({ radius: 10, y0: 0.2, y1: 4, rate: 5 * rate, color: a.color, color2: a.color2, size: 0.06, life: 4.5, vel: { x: 0.05, y: 0.12, z: 0 }, sway: 0.6, flicker: !indoor, additive: true });
    default: return null;
  }
}

// ============================================================== fallback trees
function fallbackDressing(stage, heightAt, bag) {
  const group = new THREE.Group();
  const trees = (stage.props ?? []).filter((p) => p.at && /^tree_/.test(p.kind));
  const pine = trees.filter((t) => t.kind === 'tree_pine'), broad = trees.filter((t) => t.kind !== 'tree_pine');
  const mk = (list, opts) => {
    if (!list.length) return;
    const geo = softTreeGeometry(opts);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    sway(mat, { strength: 0.25, speed: 1.1, heightScale: 6 });
    softLook(mat, { rim: 0.6 });
    bag.geos.push(geo); bag.mats.push(mat);
    group.add(instanceField(geo, mat, list.map((t, i) => ({ x: t.at[0], y: heightAt(t.at[0], t.at[1]), z: t.at[1], s: (t.scale ?? 1) * 1.3, ry: i * 1.7 }))));
  };
  mk(broad, { seed: 5, h: 3.6, crown: 1.7 });
  mk(pine, { seed: 9, h: 5, crown: 1.4, pine: true, leafLo: 0x1f3f2a, leafHi: 0x5f8a4a });
  return group;
}

// ============================================================== braziers
function buildBraziers(list, bag) {
  const group = new THREE.Group();
  const bowl = new THREE.CylinderGeometry(0.34, 0.18, 0.28, 12, 1);
  const post = new THREE.CylinderGeometry(0.07, 0.11, 1.3, 8);
  const metal = softLook(new THREE.MeshStandardMaterial({ color: 0x3a3648, roughness: 0.55, metalness: 0.5 }), { rim: 0.6 });
  const flameMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xc8b0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  bag.geos.push(bowl, post); bag.mats.push(metal, flameMat);
  const items = [];
  for (const [x, z] of list) {
    const p = new THREE.Mesh(post, metal); p.position.set(x, 0.65, z); p.castShadow = true;
    const b = new THREE.Mesh(bowl, metal); b.position.set(x, 1.38, z); b.castShadow = true;
    const f = new THREE.Sprite(flameMat); f.position.set(x, 1.75, z); f.scale.set(0.9, 1.3, 1);
    const l = new THREE.PointLight(0xb89cff, 2.2, 10, 2); l.position.set(x, 1.9, z);
    bag.lights.push(l);
    group.add(p, b, f, l);
    items.push({ f, l, ph: x * 1.7 + z });
  }
  return {
    group,
    update(t) {
      for (const it of items) {
        const k = 0.82 + Math.sin(t * 8 + it.ph) * 0.1 + Math.sin(t * 19 + it.ph * 2) * 0.08;
        it.f.scale.set(0.8 + k * 0.2, 1.1 * k + 0.2, 1);
        it.l.intensity = 2.2 * k;
      }
    },
  };
}

// ============================================================== arena build
function marks() {
  return {
    p: { x: -MARK_X, y: 0, z: 0, face: Math.PI / 2 },
    e: { x: MARK_X, y: 0, z: 0, face: -Math.PI / 2 },
  };
}

export async function buildArena(biomeOrKind, particles, opts = {}) {
  const kind = ARENA_FOR_BIOME[biomeOrKind] ?? (STAGES[biomeOrKind] ? biomeOrKind : 'meadow');
  const zone = await resolveZone(kind, opts.zone ?? null);
  const stageKey = kind === 'meadow' && zone?.biome === 'town' ? 'town' : kind;
  const stage = STAGES[stageKey] ?? STAGES.meadow;
  const q = stageQuality();
  const group = new THREE.Group();
  group.name = `arena-${stageKey}`;
  const bag = { geos: [], mats: [], lights: [], handles: [], disposers: [] };
  const baseHeight = HEIGHTS[stage.height] ?? HEIGHTS.rolling;
  const heightAt = (x, z) => baseHeight(x, z);
  const mk = marks();

  // ---- sky + key/fill lights: the zone's own sky, rotated to the key bearing
  let rig = zone ? await buildSkyRig(zone, stage) : null;
  let fog, key, fill, fallbackSky = null;
  if (rig) {
    group.add(rig.holder);
    key = rig.sky.sunLight;
    fill = rig.hemi ?? new THREE.HemisphereLight(0xbfd8ff, 0x6a6048, 0.5);
    if (!rig.hemi) { group.add(fill); bag.lights.push(fill); }
    fog = rig.fog ?? new THREE.FogExp2(0xcfe0d8, 0.008);
    if (!stage.indoor && fog.isFogExp2) fog.density *= stage.fogMul ?? 1.45; // a small stage needs a thicker haze to read deep
    rig.sky.sunLight.target.position.set(0, 0, 0);
    rig.sky.sunLight.shadow.camera.left = -16; rig.sky.sunLight.shadow.camera.right = 16;
    rig.sky.sunLight.shadow.camera.top = 16; rig.sky.sunLight.shadow.camera.bottom = -16;
    rig.sky.sunLight.shadow.camera.updateProjectionMatrix();
    if (rig.sky.fillLight) rig.sky.fillLight.position.set(0, stage.indoor ? 8 : 3, 0);
  } else {
    const warm = !stage.indoor;
    fallbackSky = stageSkyDome(warm
      ? { top: 0x5f9ee0, mid: 0x9cc8ec, horizon: 0xe8e4cc, bottom: 0x8a9a80, sunDir: [-0.62, 0.55, 0.78] }
      : { top: 0x0c0f16, mid: 0x121620, horizon: 0x1a2028, bottom: 0x0a0c10, sunAmt: 0, glow: 0 });
    bag.geos.push(fallbackSky.geometry); bag.mats.push(fallbackSky.material);
    group.add(fallbackSky);
    key = new THREE.DirectionalLight(warm ? 0xfff0d0 : 0x9fd8d0, warm ? 2.6 : 1.4);
    key.position.set(-0.62 * 30, 32, 0.78 * 30);
    key.castShadow = true;
    key.shadow.mapSize.set(q === 0 ? 1024 : 2048, q === 0 ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias = -0.0015; key.shadow.normalBias = 0.02;
    fill = new THREE.HemisphereLight(warm ? 0xbfd8ff : 0x4a8a88, warm ? 0x6a6048 : 0x1a2a2a, warm ? 0.6 : 2.5);
    group.add(key, key.target, fill);
    bag.lights.push(key, fill);
    fog = new THREE.FogExp2(warm ? 0xd8e4d8 : 0x10201f, warm ? 0.008 : 0.03);
  }

  // Back light in the mood color: rims both combatants against the backdrop
  // (from behind the foe, toward the resting camera).
  const rim = new THREE.DirectionalLight(stage.rim ?? 0xfff0d0, stage.indoor ? 1.6 : 1.1);
  rim.position.set(24, 14, -16);
  rim.target.position.set(0, 1, 0);
  group.add(rim, rim.target);
  bag.lights.push(rim);

  // ---- ground
  const gcfg = stage.ground;
  const groundMat = stageGroundMaterial({
    ...gcfg, marks: [mk.p.x, mk.p.z, mk.e.x, mk.e.z],
    farR: gcfg.farR ?? [34, 100, 0.5], hillR: gcfg.hillR ?? [14, 40, 0.55],
  });
  const groundGeo = buildStageGround(heightAt, { radius: stage.indoor ? 60 : 140, inner: 17, step: q === 0 ? 1 : 0.7, segs: q === 0 ? 96 : 128 });
  bag.geos.push(groundGeo); bag.mats.push(groundMat);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  ground.name = 'arena-ground';
  group.add(ground);

  // keep-out around the fight: creatures stand anywhere along the axis lane
  // (their spot scales with their size — see presentation.standFor), so the
  // lane carries short, sparse grass and no flowers.
  const clearAt = (x, z, pad = 0) => {
    const dp = Math.hypot(x - mk.p.x, z - mk.p.z), de = Math.hypot(x - mk.e.x, z - mk.e.z);
    return Math.min(dp, de) - pad;
  };
  const laneAt = (x, z) => {
    const ax = Math.abs(x), az = Math.abs(z);
    const along = 1 - smooth(5.2, 6.4, ax);
    const across = 1 - smooth(1.4, 2.4, az);
    return along * across; // 1 inside the lane, 0 outside
  };

  // ---- water
  let water = null;
  if (stage.water) {
    water = buildWaterRing({ r0: stage.water.r0 - 1.2, y: stage.water.y, deep: stage.water.deep, shallow: stage.water.shallow, sky: fog.color.getHex() });
    bag.geos.push(water.geo); bag.mats.push(water.mat);
    group.add(water.mesh);
  }

  // ---- grass + flowers
  if (stage.grass) {
    const gs = stage.grass;
    const grass = buildGrass({
      count: gs.count, base: gs.base, tipA: gs.tipA, tipB: gs.tipB, h: gs.h, seed: hashStr(stageKey) % 997,
      r0: gs.rMin ?? 0.6, r1: gs.rMax ?? 24, heightAt,
      accept: (x, z) => {
        if (stage.water && heightAt(x, z) < stage.water.y + 0.05) return 0;
        const l = laneAt(x, z);
        return 1 - l * (Math.abs(x) < 1.3 ? 0.5 : 0.84);
      },
      scaleAt: (x, z) => 1 - laneAt(x, z) * 0.4,
    });
    bag.geos.push(grass.geometry); bag.mats.push(grass.material);
    group.add(grass);
  }
  if (stage.flowers) {
    const fl = stage.flowers;
    const flowers = buildFlowers({
      count: fl.count, colors: fl.colors, seed: hashStr(stageKey + 'f') % 991, r0: 2.4, r1: fl.rMax ?? 16, heightAt,
      accept: (x, z) => (laneAt(x, z) > 0.05 ? 0 : 1),
    });
    flowers.traverse((o) => { if (o.isMesh) { bag.geos.push(o.geometry); bag.mats.push(o.material); } });
    if (fl.glow) { const hm = flowers.children[1].material; hm.emissive.set(0x6a5a8a); hm.emissiveIntensity = 0.8; }
    group.add(flowers);
  }

  // ---- props (the world's own prop kinds)
  let props = null;
  try {
    const { buildProps } = await import('../world/props.js');
    const pz = {
      id: `arena_${stageKey}`, biome: zone?.biome ?? kind, size: 90,
      terrain: { seed: 7 + (hashStr(stageKey) % 1000) },
      water: stage.water ? { level: stage.water.y, pos: [0, 0] } : null,
      paths: [],
      props: q === 0 ? stage.props.filter((p) => p.at) : stage.props,
    };
    props = buildProps(pz, heightAt);
    // keep the fighting floor clear of scattered props
    props.group.traverse((o) => {
      if (!o.isInstancedMesh) return;
      const m4 = new THREE.Matrix4(), p = new THREE.Vector3();
      let moved = false;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m4);
        p.setFromMatrixPosition(m4);
        if (Math.hypot(p.x, p.z) < 8.2 && clearAt(p.x, p.z) < 3.4) { m4.makeScale(0, 0, 0); o.setMatrixAt(i, m4); moved = true; }
      }
      if (moved) o.instanceMatrix.needsUpdate = true;
    });
    group.add(props.group);
  } catch (e) {
    console.warn('[arenas] world props unavailable — using stage trees', e?.message ?? e);
    group.add(fallbackDressing(stage, heightAt, bag));
  }

  // ---- background layers
  if (stage.treeline) {
    const t = stage.treeline, rng = seededRandom(hashStr(stageKey + 'tl'));
    const items = [];
    for (let i = 0; i < t.count; i++) {
      const a = rng() * TAU, rr = t.r0 + rng() * (t.r1 - t.r0);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (stage.water && heightAt(x, z) < stage.water.y) continue;
      const [s0, s1] = t.s ?? [2.4, 5];
      const s = s0 + rng() * (s1 - s0);
      items.push({ x, y: heightAt(x, z) + s * 0.85, z, sx: s, sy: s * (1.1 + rng() * 0.5), sz: s, ry: rng() * TAU });
    }
    const tl = buildBlobField(items, { lo: t.lo, hi: t.hi, detail: 1, seed: 8 });
    bag.geos.push(tl.geometry); bag.mats.push(tl.material);
    group.add(tl);
  }
  if (stage.canopy && q > 0) {
    const c = stage.canopy, rng = seededRandom(hashStr(stageKey + 'cn'));
    const items = [];
    for (let i = 0; i < c.count; i++) {
      const a = rng() * TAU, rr = c.r0 + rng() * (c.r1 - c.r0);
      const s = 3 + rng() * 3.5;
      items.push({ x: Math.cos(a) * rr, y: c.y[0] + rng() * (c.y[1] - c.y[0]), z: Math.sin(a) * rr, sx: s * 1.3, sy: s * 0.8, sz: s * 1.3, ry: rng() * TAU });
    }
    const cn = buildBlobField(items, { lo: c.lo, hi: c.hi, detail: 1, seed: 12, shadow: false });
    bag.geos.push(cn.geometry); bag.mats.push(cn.material);
    group.add(cn);
  }
  if (stage.cloudSea) {
    const c = stage.cloudSea, rng = seededRandom(31);
    const items = [];
    for (let i = 0; i < c.count; i++) {
      const a = rng() * TAU, rr = c.r0 + Math.sqrt(rng()) * (c.r1 - c.r0);
      const s = 5 + rng() * 9;
      items.push({ x: Math.cos(a) * rr, y: c.y + rng() * 2.5, z: Math.sin(a) * rr, sx: s * 1.6, sy: s * 0.55, sz: s * 1.6, ry: rng() * TAU });
    }
    const cs = buildBlobField(items, { lo: 0xc8d4e8, hi: 0xffffff, emissive: 0x9fb0c8, emissiveIntensity: 0.35, detail: 2, seed: 4 });
    bag.geos.push(cs.geometry); bag.mats.push(cs.material);
    group.add(cs);
  }
  for (const r of stage.ridges ?? []) {
    const ridge = buildRidges(r);
    bag.geos.push(ridge.geometry); bag.mats.push(ridge.material);
    group.add(ridge);
  }
  let shafts = null;
  if (stage.shafts && q > 0) {
    shafts = buildShafts(stage.shafts);
    bag.geos.push(shafts.geo); bag.mats.push(shafts.mat);
    group.add(shafts.group);
  }
  let braziers = null;
  if (stage.braziers) { braziers = buildBraziers(stage.braziers, bag); group.add(braziers.group); }

  // ---- ambient particles
  const amb = ambientFor(particles, stage.ambient, stage.indoor);
  if (amb) bag.handles.push(amb);

  // ---- per-frame
  const dayTime = opts.dayTime ?? G.calendar?.dayTime ?? 0.45;
  let lightMult = 1;
  const baseRim = rim.intensity;
  const _v = new THREE.Vector3();
  function update(dt, t, camera) {
    if (rig) {
      try { rig.sky.update(dt, dayTime); } catch (e) { /* sky mid-edit: keep last frame */ }
      if (!stage.indoor) {
        _v.copy(rig.sky.sunDir);
        key.position.copy(_v.multiplyScalar(40));
      }
      key.intensity *= lightMult;
      if (fill) fill.intensity *= lightMult;
    }
    rim.intensity = baseRim * lightMult;
    if (props) for (const u of props.updaters) { try { u(dt, t); } catch (e) { /* prop updater */ } }
    water?.update(t);
    shafts?.update(t, camera);
    braziers?.update(t);
  }
  // seed one frame so a render before the first tick is already lit correctly
  update(0, 0, null);

  const fogColor = fog.color.getHex();
  const fbKey = key.intensity, fbFill = fill.intensity; // fallback-rig bases
  return {
    kind: stageKey, group, marks: mk, heightAt,
    lights: { key, fill, rim },
    fog, background: new THREE.Color(fogColor),
    sky: { top: fogColor, bottom: fogColor }, fogColor, fogDensity: fog.density,
    /** A creature took its stand: move that side's worn earth patch under it. */
    setStand(side, x, z, radius = 0.6) {
      const U = groundMat.userData.stageUniforms;
      if (!U) return;
      const r = Math.max(1.05, radius * 1.75);
      if (side === 'p') { U.uStgMarks.value.x = x; U.uStgMarks.value.y = z; U.uStgWorn.value.x = r; }
      else { U.uStgMarks.value.z = x; U.uStgMarks.value.w = z; U.uStgWorn.value.y = r; }
    },
    setLightMult(v) {
      lightMult = v;
      if (!rig) { key.intensity = fbKey * v; fill.intensity = fbFill * v; }
    },
    update,
    dispose() {
      for (const h of bag.handles) h.stop?.();
      try { rig?.sky.dispose(); } catch (e) { /* ignore */ }
      try { props?.dispose(); } catch (e) { /* ignore */ }
      for (const g of bag.geos) g.dispose?.();
      for (const m of bag.mats) { m.userData?.unregisterSway?.(); m.dispose?.(); }
      for (const l of bag.lights) l.dispose?.();
      group.traverse((o) => { if (o.isInstancedMesh) o.dispose?.(); });
      group.clear();
    },
  };
}
