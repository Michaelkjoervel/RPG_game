// ============================================================================
// gfx/materials.js — shared material + shading helpers for the whole world.
//
// Exports (pinned — other areas import these; do not rename):
//   mat(color, opts) -> MeshStandardMaterial   stylized/toonish factory
//   windSway(material, opts) -> unregister()    cheap time-based vertex sway
//   tickWind(dt)                                advances the shared sway clock
//   groundPalette(biome) -> {grass,grass2,dirt,stone,stoneDark,sand,snow,path}
//   disposeGroup(group, opts)                   traverse + dispose geos/materials
//
// `windSway` is consumed directly by src/world/props.js (foliage/cloth/fronds)
// and by this module's own `mat({sway})` sugar. It self-registers into a
// module-level clock so callers never need to know about ticking — world.js
// advances it once per frame via `tickWind(dt)`.
// ============================================================================
import * as THREE from 'three';

// ---------------------------------------------------------------- wind sway
const _swayUniformSets = []; // every sway material's own uniform object
let _windClock = 0;

/**
 * Injects a cheap, allocation-free vertex sway into any material via
 * onBeforeCompile — no geometry edits required. Sway amplitude grows with a
 * vertex's local height (so trunks/bases stay planted, canopies/tips move),
 * and is desynchronized per-instance (for InstancedMesh) or per-object (for
 * plain Meshes) using its own world position as a phase seed, so a whole
 * forest/field never sways in lockstep.
 *   opts: { strength=0.3 (~0..1), speed=1.3, heightScale=3.2 }
 * Returns an unregister function that removes this material's uniforms from
 * the shared sway clock — call it when the material is disposed (disposeGroup
 * does this automatically via `userData.unregisterSway`).
 */
export function windSway(material, opts = {}) {
  const strength = opts.strength ?? 0.3;
  const speed = opts.speed ?? 1.3;
  const heightScale = opts.heightScale ?? 3.2;
  const uniforms = {
    uWindTime: { value: 0 },
    uSwayStrength: { value: strength },
    uSwaySpeed: { value: speed },
    uSwayHeight: { value: Math.max(heightScale, 0.001) },
  };
  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prevCompile?.(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWindTime;
uniform float uSwayStrength;
uniform float uSwaySpeed;
uniform float uSwayHeight;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float swayPhase = (instanceMatrix[3].x + instanceMatrix[3].z) * 0.7;
#else
  float swayPhase = (modelMatrix[3].x + modelMatrix[3].z) * 0.7;
#endif
  float swayFactor = clamp(transformed.y, 0.0, uSwayHeight) / uSwayHeight;
  swayFactor *= swayFactor;
  float swayT = uWindTime * uSwaySpeed + swayPhase;
  transformed.x += sin(swayT) * uSwayStrength * swayFactor * 0.34;
  transformed.z += cos(swayT * 0.82 + swayPhase * 0.5) * uSwayStrength * swayFactor * 0.26;`,
      );
  };
  material.needsUpdate = true;
  material.userData.isSway = true;
  _swayUniformSets.push(uniforms);
  const unregister = () => {
    const i = _swayUniformSets.indexOf(uniforms);
    if (i !== -1) _swayUniformSets.splice(i, 1);
  };
  material.userData.unregisterSway = unregister;
  return unregister;
}

/** Advance the shared wind clock — world.js calls this once per frame. */
export function tickWind(dt) {
  _windClock += dt;
  for (let i = 0; i < _swayUniformSets.length; i++) _swayUniformSets[i].uWindTime.value = _windClock;
}

// ---------------------------------------------------------------- dispose helper
/**
 * Traverse a group and dispose every geometry + material found, each exactly
 * once. Shared/cached resources are guarded: anything flagged with
 * `userData.shared = true` or present in the `exclude` set is skipped, and
 * `skipCachedGeometries: true` skips geometry disposal entirely (for builders
 * whose geometries live in an intentional module-level cache). Sway materials
 * are unregistered from the wind clock automatically.
 *   opts: { skipCachedGeometries=false, exclude: Set|null }
 */
export function disposeGroup(group, opts = {}) {
  if (!group) return;
  const { skipCachedGeometries = false, exclude = null } = opts;
  const seen = new Set();
  group.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return;
    const g = o.geometry;
    if (g && !skipCachedGeometries && !seen.has(g) && !g.userData?.shared && !exclude?.has(g)) {
      seen.add(g);
      g.dispose();
    }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (!m || seen.has(m) || m.userData?.shared || exclude?.has(m)) continue;
      seen.add(m);
      m.userData?.unregisterSway?.();
      m.dispose();
    }
  });
}

// ---------------------------------------------------------------- material factory
/**
 * Stylized, flat-shaded-by-default material factory used across the world &
 * gfx code (and terrain.js). Painterly low-poly look: no textures, just
 * color + gentle roughness variance + optional emissive/vertex-color/sway.
 *   opts: { rough, metal, flat, emissive, emissiveIntensity, transparent,
 *           opacity, side, vertexColors, depthWrite, fog, sway: number|{strength,speed,heightScale} }
 */
export function mat(color = 0xffffff, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    flatShading: opts.flat !== false,
    roughness: opts.rough ?? 0.85,
    metalness: opts.metal ?? 0,
    vertexColors: !!opts.vertexColors,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    depthWrite: opts.depthWrite ?? true,
    fog: opts.fog !== false,
  });
  if (opts.sway) windSway(m, typeof opts.sway === 'object' ? opts.sway : { strength: opts.sway });
  return m;
}

// ---------------------------------------------------------------- ground palettes
// Bible anchors: meadow greens #7ec850/#4f9e4f, dusk purple #5b4a8a, amber
// #ffb85c, deep slate #232633, shard-gold #ffe9b0, hollow-gray #9a9aa4.
// One palette per zone `biome` id (the 9 canonical biomes) — terrain.js
// blends these by height/slope/water-proximity/path-proximity.
const PALETTES = {
  meadow: { grass: 0x7ec850, grass2: 0x4f9e4f, dirt: 0x9a7a4c, stone: 0x9a978e, stoneDark: 0x7d7a72, sand: 0xe8d8ac, snow: 0xf2f6fa, path: 0xb08e5c },
  forest: { grass: 0x5c9e52, grass2: 0x3c6b46, dirt: 0x6b4a33, stone: 0x86837d, stoneDark: 0x64615c, sand: 0xcdb98c, snow: 0xe8eef2, path: 0x7a5a3a },
  glade: { grass: 0x6fb87e, grass2: 0x4a8a6a, dirt: 0x7a6250, stone: 0x8d8a94, stoneDark: 0x6a6774, sand: 0xd8ceac, snow: 0xecf0f6, path: 0x8a6f56 },
  lake: { grass: 0x74c25e, grass2: 0x4f9e4f, dirt: 0x8a7048, stone: 0x9a978e, stoneDark: 0x767368, sand: 0xe8dcb0, snow: 0xf0f4f8, path: 0xa89250 },
  town: { grass: 0x7ec850, grass2: 0x5c9e4a, dirt: 0x9a7a4c, stone: 0xa8a49a, stoneDark: 0x847f74, sand: 0xe0d0a4, snow: 0xf0f2f6, path: 0xb08e5c },
  cave: { grass: 0x4a5652, grass2: 0x3a4440, dirt: 0x544e5a, stone: 0x6d6a72, stoneDark: 0x46424c, sand: 0x5c5860, snow: 0x9fa0ac, path: 0x5a5560 },
  mountain: { grass: 0x6a9a5c, grass2: 0x4a7a4c, dirt: 0x7d6a58, stone: 0x8d8a86, stoneDark: 0x686560, sand: 0xc9c0a8, snow: 0xfafcff, path: 0x8a8378 },
  ruins: { grass: 0x6a9a5e, grass2: 0x4a7a4c, dirt: 0x8a7a5c, stone: 0xa8a49a, stoneDark: 0x847f74, sand: 0xd8ceac, snow: 0xeef0f4, path: 0x9a9080 },
  spire: { grass: 0x3a3f52, grass2: 0x2b2e3c, dirt: 0x33364a, stone: 0x3f4458, stoneDark: 0x282b38, sand: 0x4a4e60, snow: 0xc9cfe0, path: 0x3a3f52 },
};

/** Per-biome ground blend palette for terrain.js vertex coloring. Falls back to meadow. */
export function groundPalette(biome) {
  return PALETTES[biome] ?? PALETTES.meadow;
}

/* ============================================================================
   Stylized-art foundation — the difference between "programmer shapes" and
   art-directed low-poly is mostly three things, shared here so every builder
   (props, creatures, characters, terrain) speaks the same visual language:
     1. vertex-color GRADIENTS inside a single mesh (dark base -> lit crown),
     2. organic IRREGULARITY (seeded vertex jitter — no perfect primitives),
     3. grounding (soft contact-shadow discs under everything that stands).
   ========================================================================== */

const _c1 = new THREE.Color(), _c2 = new THREE.Color();

/** Seeded hash noise in [-1,1] from a vertex position — stable across reloads. */
function hashNoise(x, y, z, seed = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.13) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/**
 * Paints a vertical color ramp into geometry vertex colors, with optional hue
 * mottling so large surfaces never read as one flat swatch.
 * Pair with a material created via mat(0xffffff, {vertexColors:true}).
 */
export function applyVertexGradient(geometry, {
  from = 0x4f7a3a, to = 0x8fce5c, axis = 'y', noise = 0.06, seed = 1, exp = 1,
} = {}) {
  const pos = geometry.attributes.position;
  const bb = geometry.boundingBox ?? (geometry.computeBoundingBox(), geometry.boundingBox);
  const ai = axis === 'x' ? 0 : axis === 'z' ? 2 : 1;
  const lo = bb.min.getComponent(ai), hi = bb.max.getComponent(ai);
  const span = Math.max(1e-5, hi - lo);
  _c1.setHex(from); _c2.setHex(to);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let t = ((ai === 0 ? x : ai === 2 ? z : y) - lo) / span;
    t = Math.pow(Math.min(1, Math.max(0, t)), exp);
    const n = noise ? hashNoise(x, y, z, seed) * noise : 0;
    colors[i * 3 + 0] = _c1.r + (_c2.r - _c1.r) * t + n;
    colors[i * 3 + 1] = _c1.g + (_c2.g - _c1.g) * t + n;
    colors[i * 3 + 2] = _c1.b + (_c2.b - _c1.b) * t + n * 0.7;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Seeded organic jitter: displaces vertices along their normals (plus a little
 * tangentially) so spheres stop being spheres. amp is in local units.
 * Recomputes normals. Safe on indexed and non-indexed geometry.
 */
export function jitterGeometry(geometry, amp = 0.06, seed = 1) {
  const pos = geometry.attributes.position;
  geometry.computeVertexNormals();
  const nrm = geometry.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = hashNoise(x, y, z, seed);
    const n2 = hashNoise(z, x, y, seed + 7);
    pos.setXYZ(i,
      x + nrm.getX(i) * n * amp + n2 * amp * 0.35,
      y + nrm.getY(i) * n * amp,
      z + nrm.getZ(i) * n * amp - n2 * amp * 0.35,
    );
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

let _aoTex = null;
/** Soft radial contact-shadow texture (shared, generated once). */
function aoTexture() {
  if (_aoTex) return _aoTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.42)');
  grad.addColorStop(0.65, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _aoTex = new THREE.CanvasTexture(c);
  return _aoTex;
}

/**
 * A soft dark disc that visually plants an object on the ground — the cheapest
 * convincing ambient-occlusion stand-in there is. Place at the object's base
 * (y ≈ 0.02 above terrain). radius in world units.
 */
export function contactShadow(radius = 0.8, opacity = 1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: aoTexture(), transparent: true, opacity, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

/**
 * Multi-lobed organic canopy/bush/cloud mass: several jittered, gradient-
 * painted icosphere lobes merged around a center. THE workhorse for trees and
 * bushes — one lobe reads as a placeholder, four read as art.
 */
export function lobedMass({
  lobes = 4, radius = 1, spread = 0.75, squash = 0.82,
  from = 0x3e6b34, to = 0x8fce5c, seed = 1, jitter = 0.14, detail = 1,
} = {}) {
  const group = new THREE.Group();
  const material = mat(0xffffff, { vertexColors: true, flat: true });
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + hashNoise(i, seed, 0, seed) * 0.8;
    const r = radius * (0.55 + 0.45 * Math.abs(hashNoise(seed, i, 1, i)));
    const geo = new THREE.IcosahedronGeometry(r, detail);
    jitterGeometry(geo, r * jitter, seed * 13 + i);
    geo.translate(
      Math.cos(a) * spread * radius * (i === 0 ? 0 : 1),
      (hashNoise(i, i, seed, 3) * 0.3 + (i === 0 ? 0.15 : 0)) * radius,
      Math.sin(a) * spread * radius * (i === 0 ? 0 : 1),
    );
    geo.scale(1, squash, 1);
    const mesh = new THREE.Mesh(geo, material);
    group.add(mesh);
  }
  // Paint the gradient across the whole assembled mass so lobes shade as one.
  const box = new THREE.Box3().setFromObject(group);
  for (const child of group.children) {
    child.geometry.computeBoundingBox();
    const bb = child.geometry.boundingBox;
    const pos = child.geometry.attributes.position;
    _c1.setHex(from); _c2.setHex(to);
    const colors = new Float32Array(pos.count * 3);
    const span = Math.max(1e-5, box.max.y - box.min.y);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, (pos.getY(i) - box.min.y) / span));
      const n = hashNoise(pos.getX(i), pos.getY(i), pos.getZ(i), seed) * 0.05;
      colors[i * 3 + 0] = _c1.r + (_c2.r - _c1.r) * t + n;
      colors[i * 3 + 1] = _c1.g + (_c2.g - _c1.g) * t + n;
      colors[i * 3 + 2] = _c1.b + (_c2.b - _c1.b) * t + n * 0.7;
    }
    child.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    child.castShadow = true;
  }
  return group;
}
