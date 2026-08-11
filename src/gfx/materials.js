// ============================================================================
// gfx/materials.js — shared material + shading helpers for the whole world.
//
// Exports (pinned — other areas import these; do not rename):
//   mat(color, opts) -> MeshStandardMaterial   stylized/toonish factory
//   windSway(material, opts) -> material        cheap time-based vertex sway
//   tickWind(dt)                                advances the shared sway clock
//   groundPalette(biome) -> {grass,grass2,dirt,stone,stoneDark,sand,snow,path}
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
  return material;
}

/** Advance the shared wind clock — world.js calls this once per frame. */
export function tickWind(dt) {
  _windClock += dt;
  for (let i = 0; i < _swayUniformSets.length; i++) _swayUniformSets[i].uWindTime.value = _windClock;
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
  lake: { grass: 0x74c25e, grass2: 0x4f9e4f, dirt: 0x8a7048, stone: 0x9a978e, stoneDark: 0x767368, sand: 0xe8dcb0, snow: 0xf0f4f8, path: 0xa88a5c },
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
