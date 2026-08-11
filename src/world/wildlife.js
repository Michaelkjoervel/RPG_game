// wildlife.js — the world's pulse: ambient critters (butterflies, birds,
// motes, fish, bats, falling leaves) plus the showpiece — roaming wild
// Kindred that wander, notice the player, and start battles on contact.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createWildlife(zone, world) -> { update(dt), dispose() }
import * as THREE from 'three';
import { G } from '../core/state.js';
import { clamp, clamp01, damp, dampAngle, lerp, TAU } from '../core/math.js';
import { hashStr, seededRandom, randInt, pick } from '../core/rng.js';
import { mat, groundPalette } from '../gfx/materials.js';
import { Particles } from '../gfx/particles.js';

const warned = new Set();
const warnOnce = (msg) => { if (!warned.has(msg)) { warned.add(msg); console.warn('[wildlife]', msg); } };

// Day factor: 0 = full night, 1 = full day (matches props.js's convention).
function daylight(t) {
  const up = clamp01((t - 0.21) / 0.08);
  const down = 1 - clamp01((t - 0.74) / 0.08);
  return Math.min(up, down);
}

const BIOME_AMBIENT = {
  meadow: { birds: true, butterflies: true, pollen: true, fireflies: 'dusk' },
  forest: { birds: true, butterflies: true, leaves: true, spore: true, fireflies: 'dusk' },
  glade: { butterflies: true, fireflies: 'always', pollen: true },
  lake: { fish: true, butterflies: true },
  town: { birds: true, butterflies: true },
  cave: { bats: true, dust: true },
  mountain: { birds: true },
  ruins: { dust: true },
  spire: { ash: true },
};

export function createWildlife(zone, world) {
  const scene = world.scene;
  const biome = zone.biome ?? 'meadow';
  const size = zone.size ?? 200;
  const half = size / 2 - 3;
  const seed = (zone.terrain?.seed ?? hashStr(zone.id ?? 'zone')) * 71 + 13;
  const rng = seededRandom(seed);
  const heightAt = (x, z) => { try { return world.heightAt(x, z); } catch (e) { return 0; } };
  const palette = groundPalette(biome);

  const disposables = []; // {geo?|mat?}
  const geoCache = new Map();
  const geo = (key, make) => { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); disposables.push({ geo: g }); } return g; };
  const matOwned = (color, opts) => { const m = mat(color, opts); disposables.push({ mat: m }); return m; };

  const fx = new Particles(scene, { capacity: 700 });
  const updaters = []; // fn(dt, T)
  const disposeFns = [];
  let T = Math.random() * 100;

  // =================================================================
  // AMBIENT LIFE
  // =================================================================
  const amb = BIOME_AMBIENT[biome] ?? {};

  // ---- floating motes (pollen / spore / dust / ash), biome-tinted
  if (amb.pollen || amb.spore || amb.dust || amb.ash) {
    const color = amb.pollen ? 0xffe9b0 : amb.spore ? palette.grass2 : amb.ash ? 0x8a7a72 : palette.stone;
    fx.ambient({
      getCenter: () => ({ x: 0, y: 6, z: 0 }), radius: half * 0.9, y0: 0.3, y1: amb.ash ? 9 : 5,
      rate: amb.ash ? 3 : 5, life: 10, size: amb.ash ? 0.05 : 0.045, color, color2: null,
      vel: { x: 0.05, y: amb.ash ? 0.35 : 0.06, z: 0.03 }, sway: 0.35, additive: !amb.dust,
    });
  }

  // ---- fireflies (dusk/night or always, per biome)
  let fireflyHandle = null, fireflyActive = false;
  if (amb.fireflies) {
    fireflyHandle = fx.ambient({
      getCenter: () => ({ x: 0, y: 1.2, z: 0 }), radius: half * 0.85, y0: 0.3, y1: 2.2,
      rate: 0, life: 3.2, size: 0.045, color: 0xdfffb0, color2: 0xffe9b0,
      vel: { x: 0, y: 0.05, z: 0 }, sway: 0.9, additive: true,
    });
    fireflyHandle.opts.flicker = true;
  }

  // ---- falling leaves (forest)
  if (amb.leaves) {
    fx.ambient({
      getCenter: () => ({ x: 0, y: 10, z: 0 }), radius: half * 0.9, y0: 0, y1: 11,
      rate: 2.2, life: 6, size: 0.09, color: palette.grass, color2: palette.dirt,
      vel: { x: 0.15, y: -0.5, z: 0.1 }, sway: 0.8, additive: false,
    });
  }

  // ---- fish ripples (any zone with visible water)
  if (zone.water) {
    const w = zone.water;
    const wx = w.pos?.[0] ?? 0, wz = w.pos?.[1] ?? 0, wr = (w.size ?? 40) / 2;
    let acc = rng() * 2;
    updaters.push((dt) => {
      acc += dt;
      if (acc > 2.2 + rng() * 2.5) {
        acc = 0;
        const a = rng() * TAU, r = Math.sqrt(rng()) * wr * 0.85;
        fx.emitRing({ at: { x: wx + Math.cos(a) * r, y: (w.level ?? 0) + 0.02, z: wz + Math.sin(a) * r }, radius: 0.05, count: 14, speed: 0.7, life: 1.3, size: 0.05, color: 0xdff2ff, additive: false });
      }
    });
  }

  // ---- birds: ground-hop, flee when the player nears
  const birdMat = amb.birds ? matOwned(lerpHex(0x8a6a48, 0x4a4038, rng()), { rough: 0.85 }) : null;
  const birds = [];
  if (amb.birds) {
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) birds.push(spawnBird(i));
  }
  function buildBirdGeo() {
    return {
      body: geo('bird_body', () => new THREE.SphereGeometry(0.06, 6, 5)),
      tail: geo('bird_tail', () => new THREE.ConeGeometry(0.035, 0.09, 4)),
      beak: geo('bird_beak', () => new THREE.ConeGeometry(0.012, 0.035, 4)),
    };
  }
  function spawnBird(i) {
    const a = rng() * TAU, r = rng() * half * 0.7;
    const home = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    const g = new THREE.Group();
    const bg = buildBirdGeo();
    const body = new THREE.Mesh(bg.body, birdMat); body.scale.set(1, 0.85, 1.3); body.castShadow = false;
    const tail = new THREE.Mesh(bg.tail, birdMat); tail.position.set(0, 0.01, -0.08); tail.rotation.x = Math.PI / 2.1;
    const beak = new THREE.Mesh(bg.beak, matOwned(0xd8a05a, { rough: 0.6 })); beak.position.set(0, 0, 0.09); beak.rotation.x = Math.PI / 2;
    g.add(body, tail, beak);
    g.position.set(home.x, heightAt(home.x, home.z) + 0.06, home.z);
    scene.add(g);
    return {
      group: g, home, x: home.x, z: home.z, state: 'perch', t: 1 + rng() * 3,
      hopTarget: null, fleeVel: null, phase: rng() * TAU, baseY: 0.06,
    };
  }
  function updateBirds(dt, playerPos) {
    for (const b of birds) {
      const dx = (playerPos ? playerPos.x - b.x : 999), dz = (playerPos ? playerPos.z - b.z : 999);
      const nearPlayer = dx * dx + dz * dz < 10;
      if (b.state !== 'flee' && nearPlayer) {
        b.state = 'flee';
        const away = Math.atan2(-dx, -dz) + (rng() - 0.5) * 0.6;
        b.fleeVel = { x: Math.sin(away) * 3.2, z: Math.cos(away) * 3.2 };
        b.t = 1.1 + rng() * 0.5;
      }
      if (b.state === 'flee') {
        b.t -= dt;
        b.x += b.fleeVel.x * dt; b.z += b.fleeVel.z * dt;
        const h = heightAt(b.x, b.z);
        b.group.position.set(b.x, h + 0.5 + Math.sin(clamp01(1 - b.t) * Math.PI) * 0.6, b.z);
        b.group.rotation.y = Math.atan2(b.fleeVel.x, b.fleeVel.z);
        b.group.rotation.x = -0.35;
        if (b.t <= 0) { b.state = 'perch'; b.t = 1 + rng() * 2; b.group.position.y = h + b.baseY; b.group.rotation.x = 0; }
        continue;
      }
      b.t -= dt;
      if (b.state === 'perch' && b.t <= 0) {
        if (rng() < 0.6) {
          const a = rng() * TAU, r = 0.3 + rng() * 1.2;
          b.hopTarget = { x: b.home.x + Math.cos(a) * r, z: b.home.z + Math.sin(a) * r };
          b.state = 'hop'; b.hopT = 0; b.hopFrom = { x: b.x, z: b.z };
        }
        b.t = 1.2 + rng() * 2.6;
      } else if (b.state === 'hop') {
        b.hopT += dt * 3.2;
        const u = Math.min(1, b.hopT);
        b.x = lerp(b.hopFrom.x, b.hopTarget.x, u);
        b.z = lerp(b.hopFrom.z, b.hopTarget.z, u);
        b.group.position.set(b.x, heightAt(b.x, b.z) + b.baseY + Math.sin(u * Math.PI) * 0.09, b.z);
        if (u >= 1) { b.state = 'perch'; b.group.rotation.y = Math.atan2(b.hopTarget.x - b.hopFrom.x, b.hopTarget.z - b.hopFrom.z); }
      } else {
        b.phase += dt * 2.4;
        b.group.position.y = heightAt(b.x, b.z) + b.baseY + Math.sin(b.phase) * 0.006;
      }
    }
  }

  // ---- butterflies: drift between wander points, flap wings
  const butterflies = [];
  if (amb.butterflies) {
    const wingM = matOwned(pick([0xffd94f, 0xff9fb0, 0xb0a8ff, 0xffffff, 0xffb85c], rng), { rough: 0.6, side: THREE.DoubleSide, emissive: 0x221a10, emissiveIntensity: 0.05 });
    const wingGeo = geo('butterfly_wing', () => new THREE.CircleGeometry(0.055, 8, 0, Math.PI));
    const n = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const wL = new THREE.Mesh(wingGeo, wingM); wL.rotation.y = Math.PI / 2; wL.position.x = -0.005;
      const wR = new THREE.Mesh(wingGeo, wingM); wR.rotation.y = -Math.PI / 2; wR.position.x = 0.005;
      g.add(wL, wR);
      const a = rng() * TAU, r = rng() * half * 0.75;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      g.position.set(x, heightAt(x, z) + 0.9 + rng() * 0.8, z);
      scene.add(g);
      butterflies.push({ group: g, wL, wR, x, z, y: g.position.y, target: null, phase: rng() * TAU, speed: 0.55 + rng() * 0.35 });
    }
  }
  function updateButterflies(dt) {
    for (const b of butterflies) {
      b.phase += dt * 11;
      const flap = Math.sin(b.phase) * 0.85 + 0.85;
      b.wL.rotation.z = flap; b.wR.rotation.z = -flap;
      if (!b.target || Math.hypot(b.target.x - b.x, b.target.z - b.z) < 0.3) {
        const a = rng() * TAU, r = rng() * half * 0.75;
        b.target = { x: Math.cos(a) * r, z: Math.sin(a) * r, y: heightAt(Math.cos(a) * r, Math.sin(a) * r) + 0.7 + rng() * 1.0 };
      }
      const dx = b.target.x - b.x, dz = b.target.z - b.z, dy = b.target.y - b.y;
      const d = Math.hypot(dx, dz) || 1;
      b.x += (dx / d) * b.speed * dt + Math.sin(T * 2 + b.phase) * dt * 0.3;
      b.z += (dz / d) * b.speed * dt + Math.cos(T * 1.7 + b.phase) * dt * 0.3;
      b.y = damp(b.y, b.target.y, 1.5, dt);
      b.group.position.set(b.x, b.y, b.z);
      b.group.rotation.y = damp(b.group.rotation.y, Math.atan2(dx, dz), 3, dt);
    }
  }

  // ---- bats (cave): circling, erratic flight near the ceiling
  const bats = [];
  if (amb.bats) {
    const batMat = matOwned(0x2a2630, { rough: 0.9, side: THREE.DoubleSide });
    const bodyGeo = geo('bat_body', () => new THREE.SphereGeometry(0.045, 5, 4));
    const wingGeo = geo('bat_wing', () => new THREE.CircleGeometry(0.11, 6, -0.5, 2.1));
    const n = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, batMat); body.scale.set(1, 0.8, 1.6);
      const wL = new THREE.Mesh(wingGeo, batMat); wL.rotation.y = Math.PI / 2; wL.position.x = -0.03;
      const wR = new THREE.Mesh(wingGeo, batMat); wR.rotation.y = -Math.PI / 2; wR.position.x = 0.03;
      g.add(body, wL, wR);
      scene.add(g);
      bats.push({
        group: g, wL, wR, center: { x: (rng() - 0.5) * half, z: (rng() - 0.5) * half },
        radius: 3 + rng() * 5, height: 5 + rng() * 3.5, phase: rng() * TAU, speed: 0.5 + rng() * 0.4, flap: rng() * TAU,
        px: null, pz: null, face: 0,
      });
    }
  }
  function updateBats(dt) {
    for (const b of bats) {
      b.phase += dt * b.speed;
      b.flap += dt * 14;
      const wob = Math.sin(b.phase * 2.3) * 0.6;
      const x = b.center.x + Math.cos(b.phase) * (b.radius + wob);
      const z = b.center.z + Math.sin(b.phase * 1.3) * (b.radius + wob);
      const y = b.height + Math.sin(b.phase * 3.1) * 0.6;
      b.group.position.set(x, y, z);
      if (b.px != null) {
        const dx = x - b.px, dz = z - b.pz;
        if (dx * dx + dz * dz > 1e-7) b.face = dampAngle(b.face, Math.atan2(dx, dz), 10, dt);
      }
      b.px = x; b.pz = z;
      b.group.rotation.y = b.face;
      const flap = Math.sin(b.flap) * 0.9;
      b.wL.rotation.z = flap; b.wR.rotation.z = -flap;
    }
  }

  // =================================================================
  // ROAMING WILD KINDRED — the showpiece
  // =================================================================
  const roamers = [];
  let registryP = null;
  let battleBusy = false;
  const ALERT_R = 6.5, ALERT_R2 = ALERT_R * ALERT_R;
  const CONTACT_R = 1.35, CONTACT_R2 = CONTACT_R * CONTACT_R;
  const CHASE_GIVEUP = 7;

  function levelFor(speciesId) {
    const entry = (zone.encounters?.table ?? []).find((e) => e.speciesId === speciesId);
    if (entry?.lv) return randInt(entry.lv[0], entry.lv[1], rng);
    return 5;
  }

  async function loadRoamers() {
    const roamData = zone.encounters?.roaming ?? [];
    if (!roamData.length) return;
    registryP = registryP || import('../creatures/registry.js');
    let registry;
    try { registry = await registryP; }
    catch (e) { warnOnce('creatures/registry.js unavailable — roaming Kindred disabled: ' + (e?.message ?? e)); return; }

    for (const spec of roamData) {
      const count = spec.count ?? 1;
      const [ax, az, ar] = spec.area ?? [0, 0, half * 0.6];
      for (let i = 0; i < count; i++) {
        let built;
        try { built = registry.buildCreature(spec.speciesId, {}); }
        catch (e) { console.error(`[wildlife] buildCreature(${spec.speciesId}) failed`, e); continue; }
        if (!built?.group) continue;
        const a = rng() * TAU, r = Math.sqrt(rng()) * ar;
        const x = clamp(ax + Math.cos(a) * r, -half, half), z = clamp(az + Math.sin(a) * r, -half, half);
        const y = heightAt(x, z);
        built.group.position.set(x, y, z);
        const face = rng() * TAU;
        built.group.rotation.y = face;
        scene.add(built.group);
        try { built.animator?.play?.('idle'); } catch (e) { /* tolerate animator drift */ }
        roamers.push({
          speciesId: spec.speciesId, level: levelFor(spec.speciesId), group: built.group, animator: built.animator,
          x, z, y, face, home: { x: ax, z: az }, area: { x: ax, z: az, r: ar },
          state: 'wander', wanderTarget: null, idleT: 1 + rng() * 3, speed: 1.5 + rng() * 0.4,
          chaseT: 0, cooldown: 0, collider: { x, z, r: 0.4 },
        });
      }
    }
  }
  loadRoamers();

  function resolveRoamCollision(rec, x, z) {
    let px = x, pz = z;
    for (const c of world.colliders ?? []) {
      const dx = px - c.x, dz = pz - c.z;
      const rr = c.r + 0.4;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2), push = (rr - d) / d; px += dx * push; pz += dz * push; }
    }
    return [px, pz];
  }

  function moveRoamer(rec, tx, tz, dt, speedMul = 1) {
    const dx = tx - rec.x, dz = tz - rec.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return dist;
    const step = Math.min(dist, rec.speed * speedMul * dt);
    let nx = rec.x + (dx / dist) * step, nz = rec.z + (dz / dist) * step;
    nx = clamp(nx, -half, half); nz = clamp(nz, -half, half);
    [nx, nz] = resolveRoamCollision(rec, nx, nz);
    rec.x = nx; rec.z = nz;
    rec.collider.x = nx; rec.collider.z = nz;
    rec.face = dampAngle(rec.face, Math.atan2(dx, dz), 8, dt);
    return dist;
  }

  function triggerContact(rec) {
    if (battleBusy || rec.state === 'locked') return;
    battleBusy = true;
    rec.state = 'locked';
    rec.cooldown = 999; // cleared explicitly once the battle resolves
    try { rec.animator?.play?.('attack'); } catch (e) { /* tolerate */ }
    Promise.resolve(world.startWildBattle?.(rec.speciesId, rec.level))
      .catch((e) => { console.error('[wildlife] startWildBattle failed', e); return null; })
      .then((result) => {
        battleBusy = false;
        if (result?.outcome === 'caught') {
          scene.remove(rec.group);
          rec.dead = true;
          return;
        }
        // reset with a short grace window so it doesn't instantly re-trigger
        rec.state = 'wander';
        rec.cooldown = 2.5;
        rec.chaseT = 0;
        const a = rng() * TAU;
        rec.wanderTarget = { x: rec.x + Math.cos(a) * 3, z: rec.z + Math.sin(a) * 3 };
        try { rec.animator?.play?.('idle'); } catch (e) { /* tolerate */ }
      });
  }

  function updateRoamer(rec, dt, playerPos) {
    if (rec.dead) return;
    if (rec.cooldown > 0) rec.cooldown -= dt;
    if (rec.state === 'locked') { try { rec.animator?.update?.(dt); } catch (e) { /* tolerate */ } return; }

    const dx = rec.x - playerPos.x, dz = rec.z - playerPos.z;
    const d2 = dx * dx + dz * dz;

    if (rec.cooldown <= 0 && d2 < CONTACT_R2) {
      triggerContact(rec);
      rec.group.position.set(rec.x, rec.y, rec.z);
      rec.group.rotation.y = rec.face;
      try { rec.animator?.update?.(dt); } catch (e) { /* tolerate */ }
      return;
    }

    if (rec.cooldown <= 0 && d2 < ALERT_R2) {
      if (rec.state !== 'alert') { rec.state = 'alert'; rec.chaseT = 0; try { rec.animator?.play?.('walk'); } catch (e) { /* tolerate */ } }
      rec.chaseT += dt;
      moveRoamer(rec, playerPos.x, playerPos.z, dt, 0.82); // slower than a running player — escapable
      if (rec.chaseT > CHASE_GIVEUP) { rec.state = 'wander'; rec.wanderTarget = null; try { rec.animator?.play?.('idle'); } catch (e) { /* tolerate */ } }
    } else {
      if (rec.state === 'alert') { rec.state = 'wander'; try { rec.animator?.play?.('idle'); } catch (e) { /* tolerate */ } }
      if (rec.state === 'wander') {
        if (!rec.wanderTarget) {
          rec.idleT -= dt;
          if (rec.idleT <= 0) {
            const a = rng() * TAU, r = rng() * rec.area.r * 0.7;
            rec.wanderTarget = { x: clamp(rec.area.x + Math.cos(a) * r, -half, half), z: clamp(rec.area.z + Math.sin(a) * r, -half, half) };
            try { rec.animator?.play?.('walk'); } catch (e) { /* tolerate */ }
          }
        } else {
          const remaining = moveRoamer(rec, rec.wanderTarget.x, rec.wanderTarget.z, dt);
          if (remaining < 0.15) { rec.wanderTarget = null; rec.idleT = 2 + rng() * 4; try { rec.animator?.play?.('idle'); } catch (e) { /* tolerate */ } }
        }
      }
    }

    rec.y = damp(rec.y, heightAt(rec.x, rec.z), 12, dt);
    rec.group.position.set(rec.x, rec.y, rec.z);
    rec.group.rotation.y = rec.face;
    try { rec.animator?.update?.(dt); } catch (e) { /* tolerate */ }
  }

  // =================================================================
  // update / dispose
  // =================================================================
  function update(dt) {
    T += dt;
    fx.update(dt);
    const player = world.player;
    const ppos = player?.pos ?? null;

    if (fireflyHandle) {
      const want = amb.fireflies === 'always' ? true : (1 - daylight(G.calendar?.dayTime ?? 0.5)) > 0.45;
      if (want !== fireflyActive) { fireflyActive = want; fireflyHandle.rate = want ? 4 : 0; }
    }

    if (amb.birds) updateBirds(dt, ppos);
    if (amb.butterflies) updateButterflies(dt);
    if (amb.bats) updateBats(dt);
    for (const u of updaters) u(dt, T);

    if (ppos && roamers.length) {
      for (const rec of roamers) updateRoamer(rec, dt, ppos);
    }
  }

  function dispose() {
    fx.dispose();
    for (const b of birds) scene.remove(b.group);
    for (const b of butterflies) scene.remove(b.group);
    for (const b of bats) scene.remove(b.group);
    for (const rec of roamers) if (!rec.dead) scene.remove(rec.group);
    for (const d of disposables) { d.geo?.dispose?.(); d.mat?.dispose?.(); }
    geoCache.clear();
    roamers.length = 0;
  }

  return { update, dispose };
}

function lerpHex(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return ca.lerp(cb, t).getHex();
}
