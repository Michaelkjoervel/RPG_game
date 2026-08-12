// weather.js — atmospheric weather systems: rain, storm, snow, gloom.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createWeather(zone, scene) -> { update(dt), dispose() }
//
// Note on "camera-relative": the contract hands us only (zone, scene), not the
// camera or player. We track the Warden by name — player.js names its root
// group 'warden' and adds it to world.scene, which IS the `scene` we receive —
// so a one-time getObjectByName lookup (cached once found) gives us a moving,
// zero-cost anchor point for every emission volume. Falls back to the zone's
// spawn point until the player exists.
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { clamp, clamp01, damp, lerp, TAU } from '../core/math.js';
import { Particles } from '../gfx/particles.js';
import { startWeatherBed, stopWeatherBed } from '../audio/sfx.js';
import { duckMusic } from '../audio/audio.js';

const QUALITY_SCALE = { low: 0.35, med: 0.7, high: 1 };

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

  // ---------------------------------------------------------- tracked anchor
  let playerObj = null;
  const spawnX = zone?.spawn?.[0] ?? 0, spawnZ = zone?.spawn?.[1] ?? 0;
  const anchor = { x: spawnX, y: 2, z: spawnZ };
  function updateAnchor() {
    if (!playerObj) {
      playerObj = scene.getObjectByName('warden') || null;
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
  const gloomTint = new THREE.Color(0x2a2a38);

  function updateFog(dt) {
    if (!fog || baseFogDensity == null) return;
    fogMult = damp(fogMult, targetFogMult, 2.2, dt);
    fog.density = baseFogDensity * fogMult;
    if (kind === 'gloom' && baseFogColor) {
      const t = clamp01((fogMult - 1) / Math.max(0.001, targetFogMult - 1)) * 0.4;
      fog.color.copy(baseFogColor).lerp(gloomTint, t);
    }
  }
  function restoreFog() {
    if (!fog) return;
    if (baseFogDensity != null) fog.density = baseFogDensity;
    if (baseFogColor) fog.color.copy(baseFogColor);
  }

  // ---------------------------------------------------------- shared pooled dust/flake system
  // Used for snow (settle-fade flakes) and gloom (low drifting wisps) — both
  // benefit from the alpha-over-life falloff Particles already implements.
  let ambientFx = null;
  let ambientHandle = null;
  if (kind === 'snow' || kind === 'gloom') {
    ambientFx = new Particles(scene, { capacity: kind === 'snow' ? 900 : 260 });
    if (kind === 'snow') {
      ambientHandle = ambientFx.ambient({
        getCenter: () => anchor, radius: 20, y0: -1, y1: 15,
        rate: 46 * qScale, life: 7.5, size: 0.1, color: 0xffffff, color2: 0xeaf4ff,
        vel: { x: 0, y: -1.05, z: 0 }, sway: 0.7, additive: false,
      });
    } else {
      const wispColor = (zone.ambient?.fogColor ?? 0x9a9aa4);
      ambientHandle = ambientFx.ambient({
        getCenter: () => anchor, radius: 16, y0: 0.1, y1: 2.6,
        rate: 5.5 * qScale, life: 9, size: 1.3, color: wispColor, color2: 0x3a3a48,
        vel: { x: 0.12, y: 0.03, z: 0.05 }, sway: 0.35, additive: false,
      });
    }
  }
  // Rain splash rings (rain/storm) and thunder use the same pooled layer.
  let fxLayer = null;
  if (kind === 'rain' || kind === 'storm') fxLayer = new Particles(scene, { capacity: 500 });

  // ---------------------------------------------------------- rain / storm streaks
  let streaks = null;
  let splashAccum = 0;
  let gustPhase = Math.random() * TAU;
  if (kind === 'rain' || kind === 'storm') {
    const heavy = kind === 'storm';
    const count = Math.max(24, Math.round((heavy ? 620 : 340) * qScale));
    const radius = heavy ? 24 : 20;
    const topY = 12, botY = -2;
    const speed = heavy ? 17 : 12;
    const length = heavy ? 0.62 : 0.5;

    const geo = new THREE.CylinderGeometry(0.006, 0.012, length, 3, 1, true);
    geo.translate(0, -length / 2, 0); // pivot at the streak's head
    const mat = new THREE.MeshBasicMaterial({
      color: heavy ? 0xaecbe8 : 0xc7dcf2, transparent: true,
      opacity: heavy ? 0.55 : 0.42, depthWrite: false, fog: false,
    });
    disposables.push({ geo, mat });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    scene.add(mesh);
    objects.push(mesh);

    const px = new Float32Array(count), pz = new Float32Array(count), py = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * radius;
      px[i] = Math.cos(a) * r; pz[i] = Math.sin(a) * r;
      py[i] = topY - Math.random() * (topY - botY);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    const euler = new THREE.Euler();

    streaks = { mesh, count, px, py, pz, radius, topY, botY, speed, heavy, m4, q, s, euler };
  }

  // ---------------------------------------------------------- lightning (storm only)
  let bolt = null, lightning = null;
  if (kind === 'storm') {
    lightning = new THREE.PointLight(0xdfe8ff, 0, 480, 1.6);
    lightning.position.set(0, 60, 0);
    scene.add(lightning);
    objects.push(lightning);
    bolt = { t: 3 + Math.random() * 5, phase: 0, thunderAt: -1 };
  }

  const _pos = new THREE.Vector3();
  function updateRainStreaks(dt) {
    if (!streaks) return;
    const { mesh, count, px, py, pz, radius, topY, botY, speed, heavy, m4, q, s, euler } = streaks;
    gustPhase += dt * (heavy ? 0.55 : 0.3);
    const gust = heavy ? Math.sin(gustPhase) * 2.6 + Math.sin(gustPhase * 2.3) * 1.1 : Math.sin(gustPhase) * 0.6;
    const tilt = clamp(gust * (heavy ? 0.045 : 0.018), -0.4, 0.4);
    euler.set(0, 0, tilt);
    q.setFromEuler(euler);
    for (let i = 0; i < count; i++) {
      py[i] -= speed * dt;
      px[i] += gust * dt * 0.5;
      if (py[i] < botY) {
        py[i] = topY - Math.random() * 1.5;
        const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * radius;
        px[i] = Math.cos(a) * r; pz[i] = Math.sin(a) * r;
      }
      _pos.set(anchor.x + px[i], anchor.y + py[i], anchor.z + pz[i]);
      m4.compose(_pos, q, s);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // occasional ground splash rings, denser while storming
    splashAccum += dt * (heavy ? 5.5 : 2.6) * qScale;
    while (splashAccum >= 1) {
      splashAccum -= 1;
      const a = Math.random() * TAU, r = Math.random() * 9;
      fxLayer?.emitRing({
        at: { x: anchor.x + Math.cos(a) * r, y: anchor.y + 0.02, z: anchor.z + Math.sin(a) * r },
        radius: 0.04, count: 8, speed: 1.1, life: 0.35, size: 0.05,
        color: 0xcfe4ff, additive: false,
      });
    }
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
      // quick double-flicker, then thunder rolls in a beat later (light travels faster than sound)
      const doubleFlash = () => { lightning.intensity = 2.2 + Math.random(); };
      setTimeout(doubleFlash, 90);
      bolt.thunderAt = 0.35 + Math.random() * 1.4;
    }
  }

  function dispose() {
    stopWeatherBed(2.0);
    ambientHandle?.stop?.();
    ambientFx?.dispose?.();
    fxLayer?.dispose?.();
    for (const o of objects) { scene.remove(o); }
    for (const d of disposables) { d.geo?.dispose?.(); d.mat?.dispose?.(); }
    restoreFog();
  }

  return {
    update(dt) {
      updateAnchor();
      updateFog(dt);
      updateRainStreaks(dt);
      updateLightning(dt);
      ambientFx?.update(dt);
      fxLayer?.update(dt);
    },
    dispose,
  };
}
