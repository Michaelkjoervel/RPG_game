// weather.js — atmospheric weather systems: rain, storm, snow, gloom.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createWeather(zone, scene) -> { update(dt), dispose() }
//
// Note on "camera-relative": the contract hands us only (zone, scene), not the
// camera or player. We track the Warden by name — player.js names its root
// group 'warden' and adds it to world.scene, which IS the `scene` we receive —
// so a throttled getObjectByName lookup (cached once found) gives us a moving,
// zero-cost anchor point for every emission volume. Falls back to the zone's
// spawn point until the player exists.
//
// v2: rain/storm streaks and gloom mist wisps are GPU-animated instanced
// quads (one draw call each, a couple of uniforms per frame, no per-drop CPU
// work). Streaks are soft camera-facing tapers that fade out right in front
// of the lens (no more screen-crossing white lines); wisps are pale, lit,
// stretched mist sprites instead of round dark point blobs. Lightning also
// flashes the sky (sky.js's skyShared.flash). Fog handling is unchanged: the
// fog-authority agreement documented at the top of sky.js still holds —
// sky.js writes scene.fog once, this module snapshots and modulates it.
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { clamp01, damp, TAU } from '../core/math.js';
import { Particles } from '../gfx/particles.js';
import { startWeatherBed, stopWeatherBed } from '../audio/sfx.js';
import { duckMusic } from '../audio/audio.js';
import { skyShared } from './sky.js';

const QUALITY_SCALE = { low: 0.35, med: 0.7, high: 1 };

// ---------------------------------------------------------------- rain streak shader
// Each drop loops from uTop down to uBottom (relative to the anchor) on its
// own phase/speed; the quad is a taper from a bright head to a clear tail,
// billboarded around its own fall direction.
const RAIN_VERT = /* glsl */ `
attribute vec4 aDrop;   // x, z offset around the anchor, phase 0..1, speed factor
uniform vec3 uAnchor;
uniform vec3 uFall;     // normalized fall direction (wind-tilted)
uniform float uTime, uTop, uBottom, uLen, uWidth, uSpeed;
varying float vAlong;
varying float vAcross;
varying float vFade;
void main() {
  float span = uTop - uBottom;
  float f = fract(aDrop.z + uTime * uSpeed * aDrop.w / span);
  // along the fall line: start above the anchor, slide down + downwind
  vec3 head = uAnchor + vec3(aDrop.x, uTop, aDrop.y) + uFall * (f * span / max(-uFall.y, 0.3));
  vec3 toCam = cameraPosition - head;
  float dist = length(toCam);
  vec3 side = normalize(cross(uFall, toCam / max(dist, 1e-3)) + vec3(1e-5, 0.0, 0.0));
  float len = uLen * aDrop.w;
  vec3 p = head - uFall * (position.y * len) + side * (position.x * uWidth);
  vAlong = position.y;
  vAcross = position.x * 2.0;
  // never a screen-crossing line: drops right at the lens dissolve, far ones thin out
  vFade = smoothstep(2.5, 6.5, dist) * (1.0 - smoothstep(16.0, 26.0, dist))
        * smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.9, 1.0, f));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const RAIN_FRAG = /* glsl */ `
varying float vAlong;
varying float vAcross;
varying float vFade;
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  float head = pow(1.0 - vAlong, 1.6);
  float core = 1.0 - smoothstep(0.1, 1.0, abs(vAcross));
  float a = head * core * vFade * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- mist wisp shader
// Stretched soft sprites tiled around the camera (wrapped — they drift with
// the wind and re-enter on the far side), hovering low over the ground.
const WISP_VERT = /* glsl */ `
attribute vec4 aW1;   // tile x, tile z, height above ground, size (m)
attribute vec4 aW2;   // phase, drift speed, stretch, alpha
uniform float uTile, uTime, uGroundY;
uniform vec2 uWind;
varying vec2 vUv;
varying float vA;
varying float vSeed;
void main() {
  vec2 base = aW1.xy + uWind * uTime * aW2.y;
  vec2 rel = mod(base - cameraPosition.xz + 0.5 * uTile, uTile) - 0.5 * uTile;
  float bob = sin(uTime * 0.27 + aW2.x * 6.2831) * 0.22;
  vec3 c = vec3(cameraPosition.x + rel.x, uGroundY + aW1.z + bob, cameraPosition.z + rel.y);
  vec4 mv = viewMatrix * vec4(c, 1.0);
  mv.xy += position.xy * vec2(aW1.w * aW2.z, aW1.w);
  float d = length(rel);
  vA = aW2.w * smoothstep(2.5, 7.5, -mv.z) * (1.0 - smoothstep(uTile * 0.3, uTile * 0.5, d))
     * (0.75 + 0.25 * sin(uTime * 0.19 + aW2.x * 11.0));
  vUv = uv;
  vSeed = aW2.x;
  gl_Position = projectionMatrix * mv;
}`;
const WISP_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vA;
varying float vSeed;
uniform vec3 uColor;
uniform float uAlpha, uTime;
float wh(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float wn(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wh(i), wh(i + vec2(1.0, 0.0)), u.x), mix(wh(i + vec2(0.0, 1.0)), wh(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec2 q = (vUv - 0.5) * 2.0;
  float e = dot(q, q);
  float body = 1.0 - smoothstep(0.05, 1.0, e);
  float n = wn(vUv * vec2(4.0, 2.2) + vec2(vSeed * 17.0 + uTime * 0.05, vSeed * 5.0))
          * 0.65 + wn(vUv * vec2(9.0, 5.0) - vec2(uTime * 0.08, 0.0)) * 0.35;
  float a = body * smoothstep(0.25, 0.75, n + body * 0.3) * vA * uAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createWeather(zone, scene) {
  const kind = zone?.ambient?.weather ?? 'clear';
  if (kind !== 'rain' && kind !== 'storm' && kind !== 'snow' && kind !== 'gloom') {
    return { update() {}, dispose() {} };
  }

  // ---------------------------------------------------------- weather audio
  // Looping ambient layer (rain patter / storm roar / snow hush / gloom
  // murmur) lives in sfx.js; started here, faded out on zone change.
  startWeatherBed(kind, 3.0);

  const qScale = QUALITY_SCALE[settings.quality] ?? 1;
  const disposables = []; // {geo?|mat?}
  const objects = [];     // scene children to remove on dispose
  let time = Math.random() * 100;

  // ---------------------------------------------------------- tracked anchor
  let playerObj = null;
  let lookupT = 0;
  const spawnX = zone?.spawn?.[0] ?? 0, spawnZ = zone?.spawn?.[1] ?? 0;
  const anchor = { x: spawnX, y: 2, z: spawnZ };
  function updateAnchor(dt) {
    if (!playerObj && (lookupT -= dt) <= 0) {
      playerObj = scene.getObjectByName('warden') || null;
      lookupT = 0.5; // a full-scene search — never every frame
    }
    if (playerObj) {
      anchor.x = playerObj.position.x;
      anchor.y = playerObj.position.y;
      anchor.z = playerObj.position.z;
    }
  }

  // ---------------------------------------------------------- fog modulation
  const fog = scene.fog ?? null;
  const baseFogDensity = fog?.density ?? null;
  const baseFogColor = fog?.color ? fog.color.clone() : null;
  let fogMult = 1;
  const targetFogMult = kind === 'storm' ? 1.6 : kind === 'rain' ? 1.32 : kind === 'gloom' ? 1.45 : kind === 'snow' ? 1.14 : 1;
  // Gloom deepens the fog: indoors toward a dark gray-violet murk; outdoors
  // (Whisperwood) it keeps the zone's own hue and only darkens it — a gray
  // tint there washed the green-gold forest air to dishwater.
  const gloomIndoor = zone.biome === 'cave' || zone.biome === 'spire';
  const gloomTint = gloomIndoor ? new THREE.Color(0x2a2a38) : (baseFogColor ? baseFogColor.clone().multiplyScalar(0.8) : new THREE.Color(0x6a7a6a));
  const gloomAmt = gloomIndoor ? 0.4 : 0.5;

  function updateFog(dt) {
    if (!fog || baseFogDensity == null) return;
    fogMult = damp(fogMult, targetFogMult, 2.2, dt);
    fog.density = baseFogDensity * fogMult;
    if (kind === 'gloom' && baseFogColor) {
      const t = clamp01((fogMult - 1) / Math.max(0.001, targetFogMult - 1)) * gloomAmt;
      fog.color.copy(baseFogColor).lerp(gloomTint, t);
    }
  }
  function restoreFog() {
    if (!fog) return;
    if (baseFogDensity != null) fog.density = baseFogDensity;
    if (baseFogColor) fog.color.copy(baseFogColor);
  }

  // ---------------------------------------------------------- snow (pooled flakes)
  let ambientFx = null;
  let ambientHandle = null;
  if (kind === 'snow') {
    ambientFx = new Particles(scene, { capacity: 900 });
    ambientHandle = ambientFx.ambient({
      getCenter: () => anchor, radius: 20, y0: -1, y1: 15,
      rate: 46 * qScale, life: 7.5, size: 0.1, color: 0xffffff, color2: 0xeaf4ff,
      vel: { x: 0, y: -1.05, z: 0 }, sway: 0.7, additive: false,
    });
  }

  // ---------------------------------------------------------- gloom mist wisps
  let wisps = null, wispU = null;
  if (kind === 'gloom') {
    const indoor = zone.biome === 'cave' || zone.biome === 'spire';
    const COUNT = Math.max(6, Math.round(26 * qScale));
    const TILE = 46;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    const a1 = new Float32Array(COUNT * 4), a2 = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) {
      const size = 1.2 + Math.random() * 1.6;
      a1.set([Math.random() * TILE, Math.random() * TILE, 0.9 + Math.random() * 1.8, size], i * 4);
      a2.set([Math.random(), 0.25 + Math.random() * 0.5, 2.2 + Math.random() * 1.8, 0.55 + Math.random() * 0.45], i * 4);
    }
    geo.setAttribute('aW1', new THREE.InstancedBufferAttribute(a1, 4));
    geo.setAttribute('aW2', new THREE.InstancedBufferAttribute(a2, 4));
    geo.instanceCount = COUNT;
    const ang = Math.random() * TAU;
    wispU = {
      uTile: { value: TILE }, uTime: { value: 0 }, uGroundY: { value: 0 },
      uWind: { value: new THREE.Vector2(Math.cos(ang), Math.sin(ang)) },
      uColor: { value: new THREE.Color(0xd8e4d0) },
      uAlpha: { value: indoor ? 0.16 : 0.2 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: wispU, vertexShader: WISP_VERT, fragmentShader: WISP_FRAG,
      transparent: true, depthWrite: false, depthTest: true, fog: false,
    });
    wisps = new THREE.Mesh(geo, mat);
    wisps.name = 'mistWisps';
    wisps.frustumCulled = false;
    wisps.renderOrder = 6;
    scene.add(wisps);
    objects.push(wisps);
    disposables.push({ geo, mat });
    quad.dispose();
    wisps.userData.indoor = indoor;
  }

  // Rain splash rings (rain/storm) use the pooled particle layer.
  let fxLayer = null;
  if (kind === 'rain' || kind === 'storm') fxLayer = new Particles(scene, { capacity: 500 });

  // ---------------------------------------------------------- rain / storm streaks
  let rain = null, rainU = null;
  let splashAccum = 0;
  let gustPhase = Math.random() * TAU;
  const heavy = kind === 'storm';
  if (kind === 'rain' || kind === 'storm') {
    const count = Math.max(40, Math.round((heavy ? 900 : 520) * qScale));
    const radius = heavy ? 22 : 18;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0); // y 0 (head) .. 1 (tail)
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    const a = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * TAU, r = Math.sqrt(Math.random()) * radius;
      a.set([Math.cos(ang) * r, Math.sin(ang) * r, Math.random(), 0.85 + Math.random() * 0.3], i * 4);
    }
    geo.setAttribute('aDrop', new THREE.InstancedBufferAttribute(a, 4));
    geo.instanceCount = count;
    rainU = {
      uAnchor: { value: new THREE.Vector3() },
      uFall: { value: new THREE.Vector3(0, -1, 0) },
      uTime: { value: 0 }, uTop: { value: 13 }, uBottom: { value: -3 },
      uLen: { value: heavy ? 0.95 : 0.75 }, uWidth: { value: heavy ? 0.02 : 0.016 },
      uSpeed: { value: heavy ? 19 : 13 },
      uColor: { value: new THREE.Color(0xc7dcf2) },
      uAlpha: { value: heavy ? 0.5 : 0.42 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: rainU, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG,
      transparent: true, depthWrite: false, depthTest: true, fog: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'rainStreaks';
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    scene.add(mesh);
    objects.push(mesh);
    disposables.push({ geo, mat });
    quad.dispose();
    rain = { mesh, heavy };
  }

  // ---------------------------------------------------------- lightning (storm only)
  let bolt = null, lightning = null;
  let flashTimer = null;
  if (kind === 'storm') {
    lightning = new THREE.PointLight(0xdfe8ff, 0, 480, 1.6);
    lightning.position.set(0, 60, 0);
    scene.add(lightning);
    objects.push(lightning);
    bolt = { t: 3 + Math.random() * 5, phase: 0, thunderAt: -1 };
  }

  const _c = new THREE.Color(), _c2 = new THREE.Color();
  const RAIN_PALE = new THREE.Color(0.75, 0.82, 0.95);
  function updateRain(dt) {
    if (!rain) return;
    gustPhase += dt * (heavy ? 0.55 : 0.3);
    const gust = heavy ? Math.sin(gustPhase) * 2.6 + Math.sin(gustPhase * 2.3) * 1.1 : Math.sin(gustPhase) * 0.6;
    rainU.uFall.value.set(gust * (heavy ? 0.05 : 0.03), -1, gust * 0.012).normalize();
    rainU.uAnchor.value.set(anchor.x, anchor.y, anchor.z);
    rainU.uTime.value = time;
    // lit like the air around it: sky fill + a touch of key, brighter in a flash
    const L = skyShared.light;
    _c2.copy(L.sunColor).multiplyScalar(L.sunIntensity * 0.12 / Math.PI);
    _c.copy(L.hemiSky).multiplyScalar(L.hemiIntensity * 1.6 / Math.PI).add(_c2);
    rainU.uColor.value.copy(_c).lerp(RAIN_PALE, 0.35 + (skyShared.flash ?? 0) * 0.5);

    // occasional ground splash rings, denser while storming
    splashAccum += dt * (heavy ? 5.5 : 2.6) * qScale;
    while (splashAccum >= 1) {
      splashAccum -= 1;
      const ang = Math.random() * TAU, r = Math.random() * 9;
      fxLayer?.emitRing({
        at: { x: anchor.x + Math.cos(ang) * r, y: anchor.y + 0.02, z: anchor.z + Math.sin(ang) * r },
        radius: 0.04, count: 8, speed: 1.1, life: 0.35, size: 0.05,
        color: 0xcfe4ff, additive: false,
      });
    }
  }

  function updateWisps(dt) {
    if (!wisps) return;
    wispU.uTime.value = time;
    wispU.uGroundY.value = anchor.y;
    // pale, lit mist: the zone's fog color lifted toward the frame's light
    const L = skyShared.light;
    const indoor = wisps.userData.indoor;
    if (fog?.color) wispU.uColor.value.copy(fog.color); else wispU.uColor.value.setHex(0x9aa4a0);
    _c.copy(L.hemiSky).lerp(L.sunColor, 0.35);
    wispU.uColor.value.lerp(_c, indoor ? 0.25 : 0.4).multiplyScalar(indoor ? 1.25 : 1.12);
  }

  function updateLightning(dt) {
    if (!bolt) return;
    bolt.t -= dt;
    if (lightning.intensity > 0) lightning.intensity = Math.max(0, lightning.intensity - dt * 9);
    if (bolt.thunderAt >= 0) {
      bolt.thunderAt -= dt;
      if (bolt.thunderAt <= 0) {
        bolt.thunderAt = -1;
        duckMusic(0.5, 1.7); // let the thunder own the moment
        bus.emit('ui:sfx', { name: 'thunder' });
      }
    }
    if (bolt.t <= 0) {
      bolt.t = 5 + Math.random() * 9;
      lightning.position.set(anchor.x + (Math.random() - 0.5) * 60, 55, anchor.z + (Math.random() - 0.5) * 60);
      lightning.intensity = 3.4 + Math.random() * 1.8;
      skyShared.flash = 1; // the whole sky blinks white-blue (sky.js decays it)
      // quick double-flicker, then thunder rolls in a beat later (light travels faster than sound)
      const doubleFlash = () => { flashTimer = null; lightning.intensity = 2.2 + Math.random(); skyShared.flash = Math.max(skyShared.flash, 0.7); };
      flashTimer = setTimeout(doubleFlash, 90);
      bolt.thunderAt = 0.35 + Math.random() * 1.4;
    }
  }

  function dispose() {
    stopWeatherBed(2.0);
    if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
    skyShared.flash = 0;
    ambientHandle?.stop?.();
    ambientFx?.dispose?.();
    fxLayer?.dispose?.();
    for (const o of objects) { scene.remove(o); }
    for (const d of disposables) { d.geo?.dispose?.(); d.mat?.dispose?.(); }
    restoreFog();
  }

  return {
    update(dt) {
      time += dt;
      updateAnchor(dt);
      updateFog(dt);
      updateRain(dt);
      updateWisps(dt);
      updateLightning(dt);
      ambientFx?.update(dt);
      fxLayer?.update(dt);
    },
    dispose,
  };
}
