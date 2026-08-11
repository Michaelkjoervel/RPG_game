// ============================================================================
// world/sky.js — the big gradient sky dome, sun, day/night cycle, stars and
// drifting clouds; the tuned shadow-casting sun light; cave/spire dark-dome +
// player-following fill light.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createSky(zone, scene) -> { update(dt, dayTime), sunLight, dispose() }
//
// Fog note: `scene.fog` is set ONCE here (from zone.ambient) and never
// touched again by this module. world/weather.js (a sibling area's module)
// snapshots `scene.fog.density`/`.color` at creation time as its restore
// baseline and multiplies/lerps from there each frame — if sky.js also wrote
// scene.fog every frame the two would fight over authority every tick. Time-
// of-day mood instead comes from the dome gradient + sun/hemisphere light,
// which is the dominant visual driver anyway.
//
// The dome & stars use the standard "push to the far clip plane" trick
// (gl_Position = clip.xyww) so they always render behind everything
// regardless of the camera's actual far-plane distance (owned by another
// area's cameraRig.js) — no coordination needed, and no risk of the sky
// getting frustum-far-plane-clipped if that value ever changes.
// ============================================================================
import * as THREE from 'three';
import { clamp, clamp01, lerp, TAU } from '../core/math.js';
import { seededRandom, hashStr } from '../core/rng.js';

const INDOOR_BIOMES = new Set(['cave', 'spire']);

// ---------------------------------------------------------------- day/night curve
// dayTime: 0 = midnight, 0.5 = noon (per docs/ARCHITECTURE.md G.calendar.dayTime).
function elevationFactor(t) {
  return Math.cos((t - 0.5) * TAU); // -1 at midnight .. +1 at noon
}
function dayWeight(t) {
  // 0 fully night .. 1 fully day, soft-edged around the horizon
  return clamp01((elevationFactor(t) + 0.06) / 0.22);
}
function dawnDuskWeight(t) {
  // peaks near sunrise/sunset, ~0 at noon and midnight
  const e = elevationFactor(t);
  return clamp01(1 - Math.abs(e) / 0.42);
}
function duskSide(t) { return t > 0.5 && t < 1.0; } // rough half used to bias warm-dusk vs warm-dawn hue

// ---------------------------------------------------------------- dome shader
const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = clip.xyww; // pin to the far plane — always behind everything
}`;
const DOME_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uTop, uBottom, uHorizon;
uniform vec3 uSunDir, uSunColor;
uniform float uSunAmt;
void main() {
  float h = clamp(vDir.y, -1.0, 1.0);
  vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.62, h));
  col = mix(uBottom, col, smoothstep(-0.12, 0.05, h));
  float sunDot = max(dot(vDir, uSunDir), 0.0);
  float disc = smoothstep(0.9985, 0.9997, sunDot);
  float glow = pow(sunDot, 26.0) * 0.6 + pow(sunDot, 5.0) * 0.06;
  col += uSunColor * (disc * 2.4 + glow) * uSunAmt;
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- star shader
const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
varying float vPhase;
uniform float uPixelScale;
void main() {
  vPhase = aPhase;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelScale;
  gl_Position = clip.xyww;
}`;
const STAR_FRAG = /* glsl */ `
varying float vPhase;
uniform float uTime, uAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  float twinkle = 0.55 + 0.45 * sin(uTime * 2.2 + vPhase * 20.0);
  gl_FragColor = vec4(vec3(1.0, 0.98, 0.92), a * twinkle * uAlpha);
}`;

// ---------------------------------------------------------------- cloud shader
// Camera-facing billboard quads via InstancedMesh; each instance's translation
// is its world center, its (uniform) scale its radius. `viewMatrix` /
// `instanceMatrix` are supplied for free by three's shader prefix/instancing.
const CLOUD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 center = vec3(instanceMatrix[3]);
  float scale = length(instanceMatrix[0].xyz);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = center + (right * position.x + up * position.y) * scale;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const CLOUD_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  vec2 uv = vUv - 0.5;
  float d = length(uv * vec2(1.0, 1.55));
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(uColor, a * uAlpha);
}`;

function makeColorSet(zone) {
  const top = new THREE.Color(zone.ambient?.skyTop ?? 0x8ecbff);
  const bottom = new THREE.Color(zone.ambient?.skyBottom ?? 0xdff2e0);
  const sun = new THREE.Color(zone.ambient?.sun ?? 0xfff2d0);
  const night = { top: top.clone().lerp(new THREE.Color(0x060814), 0.86), bottom: bottom.clone().lerp(new THREE.Color(0x141c30), 0.8) };
  const dawn = { top: top.clone().lerp(new THREE.Color(0x87a6d8), 0.35), bottom: bottom.clone().lerp(new THREE.Color(0xffb98a), 0.55) };
  const dusk = { top: top.clone().lerp(new THREE.Color(0x5b4a8a), 0.4), bottom: bottom.clone().lerp(new THREE.Color(0xff9a5c), 0.5) };
  return {
    day: { top, bottom },
    night,
    dawn,
    dusk,
    sunNoon: sun,
    sunDawn: sun.clone().lerp(new THREE.Color(0xff9a5c), 0.55),
    sunDusk: sun.clone().lerp(new THREE.Color(0xff7a4c), 0.6),
    sunNight: new THREE.Color(0x9fb0e8),
  };
}

export function createSky(zone, scene) {
  const biome = zone.biome ?? zone.terrain?.kind ?? 'meadow';
  const indoor = INDOOR_BIOMES.has(biome);
  const colors = makeColorSet(zone);
  const domeR = Math.max((zone.size ?? 200) * 0.9, 180);
  const disposables = [];

  // ---------------------------------------------------------- fog (set once — see file header)
  const fogColor = new THREE.Color(zone.ambient?.fogColor ?? 0xcfe0d8);
  scene.fog = new THREE.FogExp2(fogColor.getHex(), zone.ambient?.fogDensity ?? 0.008);

  // ---------------------------------------------------------- gradient dome
  const domeUniforms = {
    uTop: { value: new THREE.Color(indoor ? 0x151726 : colors.day.top) },
    uBottom: { value: new THREE.Color(indoor ? 0x0c0d16 : colors.day.bottom) },
    uHorizon: { value: new THREE.Color(indoor ? 0x1c1e2c : colors.day.bottom).lerp(new THREE.Color(0xffffff), indoor ? 0 : 0.08) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(colors.sunNoon) },
    uSunAmt: { value: indoor ? 0 : 1 },
  };
  const domeGeo = new THREE.SphereGeometry(domeR, 24, 16);
  const domeMat = new THREE.ShaderMaterial({
    uniforms: domeUniforms, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG,
    side: THREE.BackSide, depthWrite: true, depthTest: true, fog: false,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.name = 'skydome';
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.matrixAutoUpdate = false; // stays at origin forever
  scene.add(dome);
  disposables.push({ geo: domeGeo, mat: domeMat });

  // ---------------------------------------------------------- stars (outdoor only)
  let stars = null, starUniforms = null;
  if (!indoor) {
    const starRng = seededRandom(hashStr((zone.id ?? 'zone') + '_stars'));
    const COUNT = 640;
    const starGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const size = new Float32Array(COUNT);
    const phase = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const u = starRng(), v = starRng();
      const yaw = u * TAU;
      const elev = Math.pow(v, 0.55) * (Math.PI * 0.5 - 0.03) + 0.04; // biased upward, avoid horizon band
      const cy = Math.cos(elev);
      const x = Math.cos(yaw) * cy, y = Math.sin(elev), z = Math.sin(yaw) * cy;
      const r = domeR * 0.985;
      pos[i * 3] = x * r; pos[i * 3 + 1] = y * r; pos[i * 3 + 2] = z * r;
      size[i] = 1.1 + starRng() * 2.2;
      phase[i] = starRng() * 100;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const hasDOM = typeof window !== 'undefined';
    const pixelScale = hasDOM ? Math.min(window.devicePixelRatio || 1, 2) * 1.6 : 1.6;
    starUniforms = { uTime: { value: 0 }, uAlpha: { value: 0 }, uPixelScale: { value: pixelScale } };
    const starMat = new THREE.ShaderMaterial({
      uniforms: starUniforms, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
    });
    stars = new THREE.Points(starGeo, starMat);
    stars.name = 'stars';
    stars.frustumCulled = false;
    stars.renderOrder = -999;
    scene.add(stars);
    disposables.push({ geo: starGeo, mat: starMat });
  }

  // ---------------------------------------------------------- drifting clouds (outdoor only)
  let clouds = null, cloudMat = null;
  const cloudDrift = new THREE.Vector2(1, 0.35).normalize();
  if (!indoor) {
    const cloudRng = seededRandom(hashStr((zone.id ?? 'zone') + '_clouds'));
    const COUNT = 22;
    const cloudGeo = new THREE.PlaneGeometry(1, 1);
    cloudMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uAlpha: { value: 0.55 } },
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false,
    });
    clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, COUNT);
    clouds.name = 'clouds';
    clouds.frustumCulled = false;
    clouds.renderOrder = -998;
    const cloudR = domeR * 0.62;
    const cloudData = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < COUNT; i++) {
      const a = cloudRng() * TAU, r = cloudR * (0.4 + cloudRng() * 0.6);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = 26 + cloudRng() * 22;
      const scale = 10 + cloudRng() * 16;
      cloudData.push({ x, y, z, scale, speed: 0.35 + cloudRng() * 0.5 });
      m4.compose(new THREE.Vector3(x, y, z), q, s.set(scale, scale, scale));
      clouds.setMatrixAt(i, m4);
    }
    scene.add(clouds);
    disposables.push({ geo: cloudGeo, mat: cloudMat });
    clouds.userData.data = cloudData;
    clouds.userData.wrap = cloudR * 1.15;
    clouds.userData.m4 = m4; clouds.userData.q = q; clouds.userData.s = s;
  }

  // ---------------------------------------------------------- lights
  const sunLight = new THREE.DirectionalLight(colors.sunNoon.getHex(), indoor ? 0 : 2.4);
  sunLight.name = 'sunLight';
  sunLight.position.set(20, 32, 20); // sane default until world.js's shadow-follow takes over
  sunLight.target.name = 'sunLightTarget';
  sunLight.castShadow = !indoor;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -18; sunLight.shadow.camera.right = 18;
  sunLight.shadow.camera.top = 18; sunLight.shadow.camera.bottom = -18;
  sunLight.shadow.camera.near = 1; sunLight.shadow.camera.far = 70;
  sunLight.shadow.bias = -0.0015;
  sunLight.shadow.normalBias = 0.02;
  sunLight.shadow.camera.updateProjectionMatrix();
  scene.add(sunLight, sunLight.target);

  const hemi = new THREE.HemisphereLight(
    indoor ? 0x2a3040 : colors.day.top.getHex(),
    indoor ? 0x0e0f18 : colors.day.bottom.getHex(),
    indoor ? 0.35 : 0.55,
  );
  hemi.name = 'skyHemi';
  scene.add(hemi);

  // cave/spire: a soft player-following fill light (world.js repositions it each frame)
  let fillLight = null;
  if (indoor) {
    const fillColor = biome === 'cave' ? 0x8fb8ff : 0xb8b0ff;
    fillLight = new THREE.PointLight(fillColor, 1.25, 14, 2);
    fillLight.name = 'skyFill';
    scene.add(fillLight);
  }

  // ---------------------------------------------------------- scratch (no per-frame allocs)
  const _tc = new THREE.Color();
  const _tc2 = new THREE.Color();
  const azimuth = 0.9 + (hashStr(zone.id ?? 'zone') % 1000) / 1000 * 1.6;
  let time = zone.terrain?.seed != null ? (zone.terrain.seed % 17) * 0.31 : 0;

  function update(dt, dayTime) {
    time += dt;
    const t = dayTime ?? 0.5;

    if (!indoor) {
      const elev = elevationFactor(t);
      const elevRad = elev * (72 * Math.PI / 180);
      const dirX = Math.cos(elevRad) * Math.sin(azimuth);
      const dirY = Math.sin(elevRad);
      const dirZ = Math.cos(elevRad) * Math.cos(azimuth);
      domeUniforms.uSunDir.value.set(dirX, dirY, dirZ).normalize();

      const dw = dayWeight(t);
      const ddw = dawnDuskWeight(t);
      const dusk = duskSide(t);

      // sky gradient: night <-> (dawn|dusk) <-> day, driven by elevation + side
      _tc.copy(colors.night.top).lerp(dusk ? colors.dusk.top : colors.dawn.top, ddw).lerp(colors.day.top, dw);
      domeUniforms.uTop.value.copy(_tc);
      _tc2.copy(colors.night.bottom).lerp(dusk ? colors.dusk.bottom : colors.dawn.bottom, ddw).lerp(colors.day.bottom, dw);
      domeUniforms.uBottom.value.copy(_tc2);
      domeUniforms.uHorizon.value.copy(_tc2).lerp(new THREE.Color(0xffffff), 0.1 + ddw * 0.12);

      const sunCol = _tc.copy(colors.sunNight).lerp(dusk ? colors.sunDusk : colors.sunDawn, ddw).lerp(colors.sunNoon, dw);
      domeUniforms.uSunColor.value.copy(sunCol);
      domeUniforms.uSunAmt.value = clamp01(0.12 + dw * 0.88 + ddw * 0.25);

      sunLight.color.copy(sunCol);
      sunLight.intensity = Math.pow(clamp01(dw), 0.75) * 2.6;
      // Position is NOT set here — world.js's per-frame "shadow-follow" step
      // keeps the light (and its tight shadow frustum) centered on the
      // player using this same `sunDir`, so the two never fight.

      hemi.color.copy(colors.day.top).lerp(colors.night.top, 1 - dw);
      hemi.groundColor.copy(colors.day.bottom).lerp(colors.night.bottom, 1 - dw);
      hemi.intensity = lerp(0.22, 0.62, dw);

      if (stars) starUniforms.uAlpha.value = damp01(starUniforms.uAlpha.value, clamp01(1 - dw * 1.4), dt);
      if (starUniforms) starUniforms.uTime.value = time;

      if (clouds) {
        const data = clouds.userData.data, wrap = clouds.userData.wrap;
        const m4 = clouds.userData.m4, q = clouds.userData.q, s = clouds.userData.s;
        const cloudTint = _tc2.copy(colors.night.top).lerp(colors.day.top, dw).lerp(new THREE.Color(0xffffff), 0.5);
        cloudMat.uniforms.uColor.value.copy(cloudTint);
        cloudMat.uniforms.uAlpha.value = lerp(0.18, 0.55, dw);
        for (let i = 0; i < data.length; i++) {
          const c = data[i];
          c.x += cloudDrift.x * c.speed * dt;
          c.z += cloudDrift.y * c.speed * dt;
          if (c.x * c.x + c.z * c.z > wrap * wrap) { c.x = -c.x * 0.92; c.z = -c.z * 0.92; }
          m4.compose(_pos(c.x, c.y, c.z), q, s.set(c.scale, c.scale, c.scale));
          clouds.setMatrixAt(i, m4);
        }
        clouds.instanceMatrix.needsUpdate = true;
      }
    } else {
      // indoor: gentle flicker-free steady ambience; fillLight followed by world.js
      hemi.intensity = 0.34 + Math.sin(time * 0.15) * 0.02;
      if (fillLight) fillLight.intensity = 1.2 + Math.sin(time * 0.4) * 0.08;
    }
  }

  function damp01(a, b, dt) { return a + (b - a) * (1 - Math.exp(-4 * dt)); }
  const _posV = new THREE.Vector3();
  function _pos(x, y, z) { return _posV.set(x, y, z); }

  function dispose() {
    scene.remove(dome);
    if (stars) scene.remove(stars);
    if (clouds) scene.remove(clouds);
    scene.remove(sunLight, sunLight.target, hemi);
    if (fillLight) scene.remove(fillLight);
    for (const d of disposables) { d.geo?.dispose(); d.mat?.dispose(); }
    scene.fog = null;
  }

  // seed the very first frame's uniforms/lights immediately (so a render before
  // the first update() tick — e.g. a stray frame during load — still looks right)
  update(0, zone.ambient?.startDayTime ?? 0.35);

  return { update, sunLight, fillLight, sunDir: domeUniforms.uSunDir.value, dispose };
}
