// ============================================================================
// world/sky.js — the big gradient sky dome, sun/moon, day/night cycle, stars
// and drifting clouds; the tuned shadow-casting key light; cave/spire dark-
// dome + player-following fill light; per-zone light MOODS.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createSky(zone, scene) -> { update(dt, dayTime), sunLight, dispose() }
//
// Light design (docs/DESIGN_BIBLE.md §8): one clearly dominant warm key
// (sun by day, cool moon by night), a dropped cool fill so forms model,
// warm-light/cool-shadow contrast, and a nameable per-zone mood (MOODS
// table below) — brighthollow's warm afternoon amber, whisperwood's
// green-gold, gloamcavern's teal dark, mirrorlake's rose dusk, etc.
//
// Fog note: `scene.fog` is set ONCE here (from zone.ambient, harmonized with
// the sky palette at the *current* time of day and the zone mood) and never
// touched again by this module. world/weather.js (a sibling area's module)
// snapshots `scene.fog.density`/`.color` at creation time as its restore
// baseline and multiplies/lerps from there each frame — if sky.js also wrote
// scene.fog every frame the two would fight over authority every tick. The
// one-time write happens inside createSky (before weather.js is created —
// world.js builds sky first), so weather's snapshot sees the harmonized
// values. Crossing day/night INSIDE one zone therefore keeps the entry-time
// fog color; the dome + lights carry the time-of-day mood, which dominates.
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
import { G } from '../core/state.js';

const INDOOR_BIOMES = new Set(['cave', 'spire']);
const WHITE = new THREE.Color(0xffffff); // lerp target only — never mutated
const CLOUD_DAY = new THREE.Color(0xf2e9d8); // warm off-white daylight cloud body

// ---------------------------------------------------------------- zone light moods
// Every zone gets a NAMEABLE light identity. Values are authored against the
// game's ACESFilmic/1.05-exposure pipeline (game.js). Fields:
//   key      key-light tint the zone sun leans toward (warm identity)
//   keyI     key intensity multiplier    fillI  hemisphere multiplier
//   shadow   cool daylight shadow tint (hemisphere sky side)
//   bounce   warm ground-bounce tint (hemisphere ground side)
//   warmth   how hard the day horizon leans toward the key color
//   duskBias optional hue the dusk palette leans toward (mirrorlake rose)
//   starFloor optional minimum star visibility (starfall's identity)
//   fogTint / fogTintAmt / fogMul — one-time fog harmonization at zone entry
//   indoor   cave/spire palette override (dome, hemi, fill, slanted key)
const MOODS = {
  brighthollow:  { name: 'warm afternoon amber', key: 0xffc37a, keyI: 1.12, fillI: 0.85, shadow: 0x8090d8, bounce: 0xd8b48c, warmth: 0.5,  fogTint: 0xd6dcca, fogTintAmt: 0.3,  fogMul: 1.05 },
  dawnmeadow:    { name: 'fresh spring gold',    key: 0xffd79a, keyI: 1.05, fillI: 1.0,  shadow: 0x84a0d4, bounce: 0xbcc88c, warmth: 0.35, fogTint: 0xd2e8c4, fogTintAmt: 0.35, fogMul: 0.95 },
  whisperwood:   { name: 'green-gold shafts',    key: 0xf0d878, keyI: 1.15, fillI: 0.72, shadow: 0x4a6a58, bounce: 0x84a068, warmth: 0.6,  fogTint: 0x8aa46a, fogTintAmt: 0.6,  fogMul: 1.2 },
  mirrorlake:    { name: 'dusk rose',            key: 0xffd8b4, keyI: 1.0,  fillI: 0.95, shadow: 0x8a8cc8, bounce: 0xc4aca4, warmth: 0.3,  duskBias: 0xe8907e, fogTint: 0xdcc0c0, fogTintAmt: 0.4, fogMul: 1.0 },
  skyreach:      { name: 'cold thin blue',       key: 0xd4e4ff, keyI: 0.92, fillI: 0.85, shadow: 0x46536e, bounce: 0x66718a, warmth: 0.05, fogTint: 0x59688a, fogTintAmt: 0.45, fogMul: 1.0 },
  sunkenruins:   { name: 'murky cyan',           key: 0xe8eecc, keyI: 0.95, fillI: 0.85, shadow: 0x5a8a86, bounce: 0x8ca894, warmth: 0.2,  fogTint: 0x76a49c, fogTintAmt: 0.5,  fogMul: 1.1 },
  starfallglade: { name: 'violet night sparkle', key: 0xffcf9c, keyI: 1.0,  fillI: 0.95, shadow: 0x6c58a8, bounce: 0x8868a0, warmth: 0.3,  starFloor: 0.75, fogTint: 0x5c4884, fogTintAmt: 0.45, fogMul: 1.0 },
  gloamcavern:   { name: 'teal dark, glow accents', fogTint: 0x102b28, fogTintAmt: 0.55, fogMul: 1.0,
    // Raking teal-white key (low elevation, real intensity) sculpts the cave
    // floor; hemi pulled down in trade so the net luminance holds but forms
    // shade instead of reading as one flat teal wash.
    // Tight bright fill pool (small radius, fast decay): brightness falls off
    // INSIDE the visible frame, so the flat cave floor grades from a lit pool
    // around the Warden into teal-dark distance instead of one even wash.
    indoor: { domeTop: 0x0e1a1c, domeBottom: 0x091012, domeHorizon: 0x143230, hemiSky: 0x58a8a0, hemiGround: 0x1e3c3a, fill: 0x5ee0cc, key: 0x9fd8d0, keyI: 2.2, keyDir: [0.6, 0.5, 0.38], hemiScale: 0.78, fillRadius: 19, fillDecay: 1.55, fillScale: 1.3 } },
  hollowspire:   { name: 'oppressive violet',    fogTint: 0x1c1428, fogTintAmt: 0.55, fogMul: 1.0,
    indoor: { domeTop: 0x141020, domeBottom: 0x0c0a14, domeHorizon: 0x241a34, hemiSky: 0x9282ba, hemiGround: 0x352c4a, fill: 0xb8a2ff, key: 0xa88fd8, keyI: 1.0, keyDir: [-0.4, 0.85, 0.25] } },
};
const MOOD_DEFAULT = { name: 'default', key: 0xffd9a0, keyI: 1.0, fillI: 1.0, shadow: 0x8098d0, bounce: 0xb8ac90, warmth: 0.3, fogTintAmt: 0, fogMul: 1.0 };
const INDOOR_DEFAULT = { domeTop: 0x151726, domeBottom: 0x0c0d16, domeHorizon: 0x1c1e2c, hemiSky: 0x8a96ad, hemiGround: 0x4a4f62, fill: 0x8fb8ff, key: 0x9aa8d0, keyI: 0.8, keyDir: [0.45, 0.8, 0.3] };

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
function nightWeight(t) {
  // 0 by day, 1 deep night; leaks into the dusk band so the moon rises early
  return clamp01(1 - dayWeight(t) * 1.4 - dawnDuskWeight(t) * 0.75);
}

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
uniform vec3 uTop, uMid, uBottom, uHorizon;
uniform vec3 uSunDir, uSunColor, uGlowColor;
uniform vec3 uMoonDir, uMoonDir2, uMoonColor;
uniform float uSunAmt, uMoonAmt, uGlowAmt;
void main() {
  float h = clamp(vDir.y, -1.0, 1.0);
  // Three-stop gradient: thin horizon band -> mid (fades out by ~9 deg) ->
  // zenith (fully by ~30 deg — gameplay cameras see real sky color, not haze).
  // The mid stop is what keeps dawn/dusk skies from being a flat lerp —
  // pink-gold or coral lives there while the zenith stays deep.
  vec3 col = mix(uMid, uTop, smoothstep(0.1, 0.38, h));
  col = mix(uHorizon, col, smoothstep(0.0, 0.12, h));
  col = mix(uBottom, col, smoothstep(-0.12, 0.04, h));
  // Azimuthal horizon glow — sunrise/sunset fire concentrated around the
  // sun's compass bearing, fading with elevation. This is what gives dusk a
  // direction instead of a uniform orange wash.
  vec2 fwd = normalize(vDir.xz + vec2(1e-5, 0.0));
  vec2 sunFwd = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  float az = max(dot(fwd, sunFwd), 0.0);
  float band = exp(-abs(h - 0.02) * 7.0);
  col += uGlowColor * (pow(az, 5.0) * band * uGlowAmt);
  // sun disc + bloom
  float sunDot = max(dot(vDir, uSunDir), 0.0);
  float disc = smoothstep(0.9985, 0.9997, sunDot);
  float glow = pow(sunDot, 26.0) * 0.6 + pow(sunDot, 5.0) * 0.06;
  col += uSunColor * (disc * 2.4 + glow) * uSunAmt;
  // moon: crescent disc (a second, offset disc bites the shadow side) + halo
  float moonDot = max(dot(vDir, uMoonDir), 0.0);
  float mdisc = smoothstep(0.99935, 0.9998, moonDot);
  float bite = smoothstep(0.99915, 0.9997, max(dot(vDir, uMoonDir2), 0.0));
  float crescent = clamp(mdisc - bite * 0.85, 0.0, 1.0);
  float mhalo = pow(moonDot, 90.0) * 0.3 + pow(moonDot, 14.0) * 0.05;
  col += uMoonColor * (crescent * 1.7 + mhalo) * uMoonAmt;
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
  // Gentle top-lit form: lit crown, softly shaded warm-gray underside, so
  // clouds keep tonal separation from the sky even at bright noon.
  float shade = mix(0.7, 1.05, smoothstep(0.12, 0.78, vUv.y));
  gl_FragColor = vec4(uColor * shade, a * uAlpha);
}`;

function makeColorSet(zone, mood) {
  const top = new THREE.Color(zone.ambient?.skyTop ?? 0x8ecbff);
  // Deepen the daylight zenith: zone skyTop values are authored bright, and
  // an un-deepened top washes out entirely at noon. A saturation push plus a
  // lightness cut keeps a real blue overhead (haze stays at the horizon)
  // while preserving each zone's hue identity.
  const topHSL = { h: 0, s: 0, l: 0 };
  top.getHSL(topHSL);
  top.setHSL(topHSL.h, Math.min(1, topHSL.s * 1.18 + 0.06), topHSL.l * 0.78);
  const bottom = new THREE.Color(zone.ambient?.skyBottom ?? 0xdff2e0);
  const keyC = new THREE.Color(mood.key);
  // The zone key light leans hard toward the mood color — this is the single
  // strongest per-zone identity lever.
  const sun = new THREE.Color(zone.ambient?.sun ?? 0xfff2d0).lerp(keyC, 0.55);
  const duskBias = mood.duskBias != null ? new THREE.Color(mood.duskBias) : null;

  const day = {
    top,
    mid: top.clone().lerp(bottom, 0.3), // mostly zenith hue — a hint of haze
    bottom: bottom.clone().lerp(top, 0.22),
    // Noon horizon is warm-WHITE haze, not orange — authored skyBottom values
    // are warm enough that un-desaturated they read as permanent sunset.
    // Permanent-twilight zones (starFloor) skip the haze: their horizon must
    // stay saturated violet, not wash to gray.
    horizon: mood.starFloor
      ? bottom.clone().lerp(keyC, (mood.warmth ?? 0.3) * 0.2)
      : bottom.clone().lerp(WHITE, 0.35).lerp(keyC, (mood.warmth ?? 0.3) * 0.18),
  };
  const night = {
    top: top.clone().lerp(new THREE.Color(0x05070f), 0.9),
    mid: top.clone().lerp(new THREE.Color(0x0d1226), 0.85),
    bottom: bottom.clone().lerp(new THREE.Color(0x162038), 0.85),
    horizon: bottom.clone().lerp(new THREE.Color(0x1f2c50), 0.82),
    glow: new THREE.Color(0x2c3c6e),
  };
  const dawn = {
    top: top.clone().lerp(new THREE.Color(0x7186c8), 0.45),
    mid: top.clone().lerp(new THREE.Color(0xe09aa8), 0.55), // the pink-gold band
    bottom: bottom.clone().lerp(new THREE.Color(0xffc188), 0.62),
    horizon: bottom.clone().lerp(new THREE.Color(0xffcf96), 0.7),
    glow: new THREE.Color(0xffb26e),
  };
  const dusk = {
    top: top.clone().lerp(new THREE.Color(0x453a78), 0.55), // deep violet zenith
    mid: top.clone().lerp(new THREE.Color(0xc86a70), 0.5),  // coral band
    bottom: bottom.clone().lerp(new THREE.Color(0xff9448), 0.58),
    horizon: bottom.clone().lerp(new THREE.Color(0xff8e56), 0.66),
    glow: new THREE.Color(0xff7a38),
  };
  if (duskBias) { // e.g. mirrorlake's rose dusk
    dusk.mid.lerp(duskBias, 0.32);
    dusk.bottom.lerp(duskBias, 0.25);
    dusk.horizon.lerp(duskBias, 0.3);
    dusk.glow.lerp(duskBias, 0.4);
  }
  return {
    day, night, dawn, dusk,
    sunNoon: sun,
    sunDawn: sun.clone().lerp(new THREE.Color(0xff9a5c), 0.6),
    sunDusk: (duskBias ? sun.clone().lerp(duskBias, 0.3) : sun.clone()).lerp(new THREE.Color(0xff6e3c), 0.6),
    moon: new THREE.Color(0x93ace0), // dim steel-blue — moonlight, not daylight

    shadow: new THREE.Color(mood.shadow ?? MOOD_DEFAULT.shadow),
    bounce: new THREE.Color(mood.bounce ?? MOOD_DEFAULT.bounce),
    duskGround: new THREE.Color(0x5b4a8a), // design-bible dusk purple (shadow side)
  };
}

export function createSky(zone, scene) {
  const biome = zone.biome ?? zone.terrain?.kind ?? 'meadow';
  const indoor = INDOOR_BIOMES.has(biome);
  const mood = MOODS[zone.id] ?? MOOD_DEFAULT;
  const ind = indoor ? { ...INDOOR_DEFAULT, ...(mood.indoor ?? {}) } : null;
  const colors = makeColorSet(zone, mood);
  const keyI = mood.keyI ?? 1.0;
  const fillI = mood.fillI ?? 1.0;
  const domeR = Math.max((zone.size ?? 200) * 0.9, 180);
  const disposables = [];

  // The actual time of day right now — used ONLY for the one-time fog
  // harmonization and the first-frame seed. Falls back safely when state
  // isn't initialized (unit tests construct sky without a running game).
  const tNow = (G?.calendar?.dayTime ?? zone.ambient?.startDayTime ?? 0.35);

  // ---------------------------------------------------------- fog (set once — see file header)
  // Harmonized: authored zone fog -> leaned toward the sky horizon color at
  // the CURRENT time of day -> tinted toward the mood. Entering mirrorlake at
  // dusk gets rose fog, whisperwood gets mossy green — never neutral gray.
  const fogColor = new THREE.Color(zone.ambient?.fogColor ?? 0xcfe0d8);
  if (!indoor) {
    const dw0 = dayWeight(tNow), ddw0 = dawnDuskWeight(tNow);
    const band0 = duskSide(tNow) ? colors.dusk : colors.dawn;
    const horizon0 = colors.night.horizon.clone().lerp(band0.horizon, ddw0).lerp(colors.day.horizon, dw0);
    fogColor.lerp(horizon0, 0.55);
    // Aerial perspective: at midday the distance cools toward the zenith blue
    // instead of staying a warm wall (warm fog is a dusk/dawn effect).
    fogColor.lerp(colors.day.top, dw0 * 0.24);
  }
  if (mood.fogTint != null) fogColor.lerp(new THREE.Color(mood.fogTint), mood.fogTintAmt ?? 0.4);
  scene.fog = new THREE.FogExp2(fogColor.getHex(), (zone.ambient?.fogDensity ?? 0.008) * (mood.fogMul ?? 1));

  // ---------------------------------------------------------- gradient dome
  const domeUniforms = {
    uTop: { value: new THREE.Color(indoor ? ind.domeTop : colors.day.top) },
    uMid: { value: new THREE.Color(indoor ? ind.domeHorizon : colors.day.mid) },
    uBottom: { value: new THREE.Color(indoor ? ind.domeBottom : colors.day.bottom) },
    uHorizon: { value: new THREE.Color(indoor ? ind.domeHorizon : colors.day.horizon) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(colors.sunNoon) },
    uSunAmt: { value: indoor ? 0 : 1 },
    uGlowColor: { value: new THREE.Color(colors.dusk.glow) },
    uGlowAmt: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uMoonDir2: { value: new THREE.Vector3(0, -1, 0) },
    uMoonColor: { value: new THREE.Color(colors.moon) },
    uMoonAmt: { value: 0 },
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
      size[i] = 1.35 + starRng() * 2.4;
      phase[i] = starRng() * 100;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const hasDOM = typeof window !== 'undefined';
    const pixelScale = hasDOM ? Math.min(window.devicePixelRatio || 1, 2) * 1.85 : 1.85;
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
      // Kept low enough that a good share of the layer drifts through the
      // near-horizon band gameplay cameras actually frame.
      const y = 16 + cloudRng() * 26;
      const scale = 13 + cloudRng() * 19;
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
  // One dominant key: the warm sun by day, the cool moon by night (same
  // DirectionalLight — color/intensity/direction cross-fade through dusk).
  // Indoors it becomes a dim slanted mood key (no shadow) so forms still model.
  const sunLight = new THREE.DirectionalLight(indoor ? ind.key : colors.sunNoon.getHex(), indoor ? ind.keyI : 3.0 * keyI);
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

  // Indoor ambience: the cave/spire floor palettes are dark *linear* albedos
  // behind ACES tonemapping — a timid hemisphere reads as a black screen.
  // These values are tuned empirically against a median-luminance target of
  // ~12% for caves (readable silhouettes) while the near-black dome keeps the
  // mood. The spire's fortress-black walls swallow far more light, so it gets
  // a stronger fill just to hold silhouette readability. Hue now comes from
  // the zone mood (gloamcavern teal, hollowspire violet).
  const indoorHemiI = (biome === 'spire' ? 7.0 : 4.0) * (ind?.hemiScale ?? 1);
  const indoorFillI = biome === 'spire' ? 9.0 : 7.5;
  const hemi = new THREE.HemisphereLight(
    indoor ? ind.hemiSky : colors.day.top.getHex(),
    indoor ? ind.hemiGround : colors.day.bottom.getHex(),
    indoor ? indoorHemiI : 0.44 * fillI,
  );
  hemi.name = 'skyHemi';
  scene.add(hemi);

  // Player-following fill light (world.js repositions it each frame).
  // cave/spire: the main readability light — bright enough that silhouettes
  // and crystal emissives read against the dark, wide + soft falloff.
  // outdoor: a faint warm "lantern" glow that only wakes at deep night so the
  // Warden never dissolves into the dark (see update()).
  let fillLight = null;
  if (indoor) {
    fillLight = new THREE.PointLight(ind.fill, indoorFillI * (ind.fillScale ?? 1), ind.fillRadius ?? 30, ind.fillDecay ?? 1.2);
    fillLight.name = 'skyFill';
    scene.add(fillLight);
  } else {
    fillLight = new THREE.PointLight(0xffc27a, 0, 11, 1.8);
    fillLight.name = 'skyLantern';
    scene.add(fillLight);
  }

  // The light direction world.js's shadow-follow reads (returned as `sunDir`).
  // Outdoors it cross-fades sun -> moon through dusk; indoors it's the fixed
  // slanted mood key.
  const lightDir = new THREE.Vector3(0, 1, 0);
  if (indoor) {
    lightDir.set(ind.keyDir[0], ind.keyDir[1], ind.keyDir[2]).normalize();
    domeUniforms.uSunDir.value.copy(lightDir);
  }

  // ---------------------------------------------------------- scratch (no per-frame allocs)
  const _tc = new THREE.Color();
  const _tc2 = new THREE.Color();
  const _tc3 = new THREE.Color();
  const _tc4 = new THREE.Color();
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
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
      // Moon opposes the sun — as the sun sinks the moon climbs the far side.
      const moonDir = domeUniforms.uMoonDir.value.set(-dirX, -dirY, -dirZ).normalize();
      // Crescent bite direction: nudge sideways (perp to up) for the shadow disc.
      _v.crossVectors(moonDir, _v2.set(0, 1, 0));
      if (_v.lengthSq() < 1e-4) _v.set(1, 0, 0);
      _v.normalize();
      domeUniforms.uMoonDir2.value.copy(moonDir).addScaledVector(_v, 0.011).normalize();

      const dw = dayWeight(t);
      const ddw = dawnDuskWeight(t);
      const nw = nightWeight(t);
      const dusk = duskSide(t);
      const band = dusk ? colors.dusk : colors.dawn;

      // sky gradient: night <-> (dawn|dusk) <-> day, three stops + horizon
      domeUniforms.uTop.value.copy(colors.night.top).lerp(band.top, ddw).lerp(colors.day.top, dw);
      domeUniforms.uMid.value.copy(colors.night.mid).lerp(band.mid, ddw).lerp(colors.day.mid, dw);
      domeUniforms.uBottom.value.copy(colors.night.bottom).lerp(band.bottom, ddw).lerp(colors.day.bottom, dw);
      domeUniforms.uHorizon.value.copy(colors.night.horizon).lerp(band.horizon, ddw).lerp(colors.day.horizon, dw);
      // horizon fire around the sun's bearing — strongest mid-band, gone at noon
      domeUniforms.uGlowColor.value.copy(colors.night.glow).lerp(band.glow, clamp01(ddw * 1.6));
      let glowAmt = Math.pow(ddw, 1.15) * 0.95 * (1 - dw * 0.8) + nw * 0.12;
      if (zone.ambient?.weather === 'storm') glowAmt *= 0.2;
      domeUniforms.uGlowAmt.value = glowAmt;

      // Warm-weighted color: any presence in the dawn/dusk band commits the key
      // light to amber (ddw peaks at only ~0.26 by 0.8 dayTime — unweighted it
      // stayed a cold blue while the ground went black).
      const sunCol = _tc.copy(colors.moon).lerp(dusk ? colors.sunDusk : colors.sunDawn, clamp01(ddw * 2.2)).lerp(colors.sunNoon, dw);
      domeUniforms.uSunColor.value.copy(sunCol);
      let sunAmt = clamp01(0.12 + dw * 0.88 + ddw * 0.25);
      // Storm zones (Skyreach): no cheerful sun-glow bleeding through the
      // storm dome — keep the mood cold.
      if (zone.ambient?.weather === 'storm') sunAmt = Math.min(sunAmt, 0.25);
      domeUniforms.uSunAmt.value = sunAmt;
      domeUniforms.uMoonAmt.value = nw * (zone.ambient?.weather === 'storm' ? 0.3 : 1);

      // ---- the ONE dominant key light: sun by day, moon by night ----------
      // moonMix crossfades color/intensity/direction through the dusk band.
      const moonMix = clamp01((nw - 0.45) / 0.45);
      sunLight.color.copy(sunCol).lerp(colors.moon, moonMix);
      const dayI = Math.pow(dw, 0.8) * 3.0 + ddw * 1.9;
      sunLight.intensity = (dayI * (1 - moonMix) + 0.62 * moonMix) * keyI;
      // Direction hand-off sun -> moon. The two are exact opposites, so the
      // blend passes through zero-length at the midpoint — the y-lift keeps it
      // finite (the key sweeps overhead during deep twilight, when it is at
      // its dimmest, so the sweep never reads on screen).
      lightDir.set(dirX, dirY, dirZ).multiplyScalar(1 - moonMix)
        .addScaledVector(_v2.set(-dirX, -dirY, -dirZ), moonMix);
      lightDir.y += moonMix * (1 - moonMix); // peak +0.25 at the midpoint
      if (lightDir.lengthSq() < 1e-4) lightDir.set(0, 1, 0);
      lightDir.normalize();
      // Position is NOT set here — world.js's per-frame "shadow-follow" step
      // keeps the light (and its tight shadow frustum) centered on the
      // player using this same exported `sunDir` vector, so the two never fight.

      // ---- dropped cool fill: warm-light/cool-shadow modelling ------------
      // Day: hemisphere sky side leans hard into the mood's cool shadow tint
      // (that is the color shadows take), ground side into the warm bounce.
      // Dusk: warm horizon light from the sky side, design-bible purple from
      // the ground. Night: deep blue, barely there — the moon key dominates.
      const warmW = clamp01(ddw * 1.9);
      _tc3.copy(colors.day.top).lerp(colors.shadow, 0.6);
      hemi.color.copy(colors.night.mid).lerp(band.horizon, warmW).lerp(_tc3, dw);
      _tc4.copy(colors.day.bottom).lerp(colors.bounce, 0.5);
      hemi.groundColor.copy(colors.night.bottom).lerp(colors.duskGround, warmW).lerp(_tc4, dw);
      // Fill stays LOW relative to the key (~1:7 at noon) so forms model;
      // floored through dusk so the band never collapses to black.
      hemi.intensity = Math.max(lerp(0.13, 0.44, dw), 0.4 * clamp01(ddw * 5)) * fillI;

      if (stars) {
        // zone.ambient.stars / mood.starFloor: permanent-twilight zones
        // (Starfall Glade) keep their stars — it's their identity.
        const starFloor = mood.starFloor ?? (zone.ambient?.stars ? 0.6 : 0);
        starUniforms.uAlpha.value = damp01(starUniforms.uAlpha.value, Math.max(clamp01(1 - dw * 1.4), starFloor), dt);
      }
      if (starUniforms) starUniforms.uTime.value = time;

      // Warden lantern glow — wakes through dusk into night so the player
      // always carries a warm pool of light against the cool moonlight.
      if (fillLight) fillLight.intensity = clamp01((0.3 - dw) / 0.3) * 2.2;

      if (clouds) {
        const data = clouds.userData.data, wrap = clouds.userData.wrap;
        const m4 = clouds.userData.m4, q = clouds.userData.q, s = clouds.userData.s;
        // Warm off-white by day (never pure white — clouds must separate from
        // the sky tonally at noon), catching the dawn/dusk fire in the band,
        // dim slate at night. Storm zones keep their clouds dark — a bright
        // warm puff over Skyreach broke the cold mood.
        const cloudTint = _tc2.copy(colors.night.top).lerp(WHITE, 0.3).lerp(CLOUD_DAY, dw).lerp(band.glow, ddw * 0.55);
        if (zone.ambient?.weather === 'storm') cloudTint.multiplyScalar(0.38);
        // Permanent-twilight zones: clouds stay dim wisps, never bright puffs
        // glaring against the dark violet sky.
        if (mood.starFloor) cloudTint.multiplyScalar(0.45);
        cloudMat.uniforms.uColor.value.copy(cloudTint);
        cloudMat.uniforms.uAlpha.value = lerp(0.18, zone.ambient?.weather === 'storm' ? 0.6 : 0.78, dw) * (mood.starFloor ? 0.55 : 1);
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
      // indoor: gentle flicker-free steady ambience; fillLight followed by world.js.
      // Tuned bright enough that cave/spire floors and silhouettes actually read
      // (median luminance target ≥12% in caves) while the dark dome keeps the mood.
      // The slanted mood key breathes very slightly with the fill.
      hemi.intensity = indoorHemiI * (1 + Math.sin(time * 0.15) * 0.025);
      if (fillLight) fillLight.intensity = indoorFillI * (ind.fillScale ?? 1) * (1 + Math.sin(time * 0.4) * 0.05);
      sunLight.intensity = ind.keyI * (1 + Math.sin(time * 0.23) * 0.03);
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
    sunLight.dispose(); // frees the 2048 shadow render target
    for (const d of disposables) { d.geo?.dispose(); d.mat?.dispose(); }
    scene.fog = null;
  }

  // seed the very first frame's uniforms/lights immediately (so a render before
  // the first update() tick — e.g. a stray frame during load — still looks right)
  update(0, tNow);

  return { update, sunLight, fillLight, sunDir: lightDir, dispose };
}
