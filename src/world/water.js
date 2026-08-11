// ============================================================================
// world/water.js — a single stylized, painterly water plane per zone.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createWater(zone) -> { mesh, update(dt), dispose() } | null
//
// The addendum's signature takes `zone` alone (no `heightAt`), so the shore
// approximation here is purely geometric — foam hugs the water patch's own
// edges (its uv border) and depth deepens toward its center — rather than
// sampling real terrain contours. That reads as a clean, stylized shoreline
// ("painterly, not photoreal" per the design bible) and keeps this module
// fully self-contained against the pinned contract.
// ============================================================================
import * as THREE from 'three';

const WATER_PALETTES = {
  lake: { shallow: 0x8fe0d8, deep: 0x1c5a78 },
  mirrorlake: { shallow: 0x9fe8ea, deep: 0x1f5f82 },
  meadow: { shallow: 0x9fe0c8, deep: 0x2f7a72 },
  forest: { shallow: 0x7ec8a8, deep: 0x1f4a4a },
  glade: { shallow: 0xa8e8d8, deep: 0x2c6a72 },
  cave: { shallow: 0x5a7aa0, deep: 0x0e2438 },
  ruins: { shallow: 0x6ea89a, deep: 0x1c3a3e },
  mountain: { shallow: 0x9fd8f0, deep: 0x2a5a80 },
  spire: { shallow: 0x4a5aa0, deep: 0x0e1230 },
  town: { shallow: 0x9fe0c8, deep: 0x2f7a72 },
};

const VERT = /* glsl */ `
varying vec2 vUv;
varying float vFoam;
uniform float uTime;
void main() {
  vUv = uv;
  vec3 p = position;
  float w1 = sin(p.x * 0.35 + uTime * 1.1) * 0.045;
  float w2 = sin(p.z * 0.5 - uTime * 0.8 + p.x * 0.15) * 0.032;
  p.y += w1 + w2;
  float ex = min(uv.x, 1.0 - uv.x);
  float ez = min(uv.y, 1.0 - uv.y);
  vFoam = 1.0 - smoothstep(0.0, 0.075, min(ex, ez));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying float vFoam;
uniform vec3 uShallow, uDeep;
uniform float uTime, uOpacity;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.7, 289.3))) * 43758.5453); }
void main() {
  float d = distance(vUv, vec2(0.5)) * 2.0;
  float depthT = clamp(1.0 - d * 0.82, 0.0, 1.0);
  vec3 col = mix(uShallow, uDeep, depthT);
  vec2 sp = vUv * 42.0 + vec2(uTime * 0.55, -uTime * 0.35);
  float sparkle = step(0.983, hash(floor(sp))) * (0.5 + 0.5 * sin(uTime * 6.2 + hash(floor(sp)) * 30.0));
  col += vec3(sparkle * 0.55);
  float foamNoise = hash(floor(vUv * 90.0 + uTime * 0.5));
  float foam = vFoam * (0.6 + 0.4 * foamNoise);
  col = mix(col, vec3(1.0), foam * 0.85);
  float alpha = mix(uOpacity * 0.72, uOpacity, depthT) + foam * 0.22;
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
}`;

export function createWater(zone) {
  const w = zone.water;
  if (!w) return null;

  const size = w.size ?? 60;
  const level = w.level ?? 0;
  const pos = w.pos ?? [0, 0];
  const biome = zone.biome ?? 'lake';
  const palette = WATER_PALETTES[zone.id] ?? WATER_PALETTES[biome] ?? WATER_PALETTES.lake;

  const segs = Math.max(8, Math.min(48, Math.round(size / 2.5)));
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color(palette.shallow) },
    uDeep: { value: new THREE.Color(palette.deep) },
    uOpacity: { value: 0.86 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'water';
  mesh.position.set(pos[0], level, pos[1]);
  mesh.renderOrder = 2; // after opaque terrain/props, before UI-space effects
  mesh.receiveShadow = false;
  mesh.castShadow = false;

  let time = Math.random() * 10;
  function update(dt) {
    time += dt;
    uniforms.uTime.value = time;
  }

  function dispose() {
    geo.dispose();
    material.dispose();
  }

  return { mesh, update, dispose };
}
