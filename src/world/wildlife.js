// wildlife.js — the world's pulse: ambient critters (butterflies, birds,
// motes, fish, bats, falling leaves) plus the showpiece — roaming wild
// Kindred that wander, notice the player, and start battles on contact.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createWildlife(zone, world) -> { update(dt), dispose() }
import * as THREE from 'three';
import { G } from '../core/state.js';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { clamp, clamp01, damp, dampAngle, lerp, TAU } from '../core/math.js';
import { hashStr, seededRandom, randInt, pick } from '../core/rng.js';
import { mat, groundPalette, disposeGroup } from '../gfx/materials.js';
import { Particles } from '../gfx/particles.js';

const warned = new Set();
const warnOnce = (msg) => { if (!warned.has(msg)) { warned.add(msg); console.warn('[wildlife]', msg); } };

const _resolved = [0, 0]; // scratch — resolveRoamCollision runs per roamer per frame

// Roaming wild Kindred (see the ROAMING section below).
const ROAD_SPACING = 24;              // metres of zone size per roadside Kindred
const ROAD_MIN = 6, ROAD_MAX = 11;
const DRAW_R2 = 75 * 75;              // drawn within this distance of the Warden
const ANIM_R2 = 48 * 48;              // animated within this one
const RESPAWN_MIN = 45, RESPAWN_MAX = 75; // seconds before a beaten/caught one is replaced
const ARRIVAL_GRACE = 3;              // seconds after zone entry before anything engages
const BATTLE_GRACE = 2.5;             // ...and after any battle ends
const LOSE_INTEREST = 9;              // after you flee (or lose) it leaves you be this long
const CHASE_SPEED = 2.4;              // x wander speed: catches a walking Warden, not a running one
const SHY_SPEED = 2.0;
const OVERWORLD_MIN_H = 0.85;         // small Kindred are shown at least this tall out in the world...
const OVERWORLD_MAX_UP = 2.4;         // ...scaled up by no more than this
const TEMPERAMENT = { eager: 'bold', regal: 'bold', skittish: 'shy', calm: 'calm', heavy: 'calm', sleepy: 'calm' };

// Day factor: 0 = full night, 1 = full day (matches props.js's convention).
function daylight(t) {
  const up = clamp01((t - 0.21) / 0.08);
  const down = 1 - clamp01((t - 0.74) / 0.08);
  return Math.min(up, down);
}

const BIOME_AMBIENT = {
  meadow: { birds: true, butterflies: true, pollen: true, fireflies: 'dusk', flock: true },
  forest: { birds: true, butterflies: true, leaves: true, spore: true, fireflies: 'dusk' },
  glade: { butterflies: true, fireflies: 'always', pollen: true },
  lake: { fish: true, butterflies: true, flock: true, fireflies: 'dusk' },
  town: { birds: true, butterflies: true, flock: true, fireflies: 'dusk' },
  cave: { bats: true, dust: true },
  mountain: { birds: true, flock: true },
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

  // Ambient life concentrates around the Warden and drifts with them — the
  // old zone-wide static fields diluted everything into invisibility (a
  // handful of motes across a 240u zone reads as a dead world). Particle
  // fields emit in a tight disc around the player; mesh critters
  // (birds/butterflies/bats) relocate into a 12–25u annulus when the player
  // walks away from them. Density scales with the quality setting.
  const qMul = { low: 0.55, med: 0.8, high: 1 }[settings.quality] ?? 1;
  const anchor = { x: zone.spawn?.[0] ?? 0, y: 2, z: zone.spawn?.[1] ?? 0 };
  const AMB_R = Math.min(half * 0.9, 20);       // particle-field radius around the player
  const NEAR_MIN = 12, NEAR_MAX = 25;           // critter relocation annulus
  const followers = [];                         // fx.ambient handles whose y-band tracks ground height
  const followed = (handle, y0, y1) => { followers.push({ handle, y0, y1 }); return handle; };
  const annulusPoint = (out, rmin = NEAR_MIN, rmax = NEAR_MAX) => {
    const a = rng() * TAU, r = rmin + rng() * (rmax - rmin);
    out.x = clamp(anchor.x + Math.cos(a) * r, -half, half);
    out.z = clamp(anchor.z + Math.sin(a) * r, -half, half);
    return out;
  };
  const _pt = { x: 0, z: 0 }; // scratch for annulusPoint

  // ---- floating motes (pollen / spore / dust / ash), biome-tinted
  if (amb.pollen || amb.spore || amb.dust || amb.ash) {
    const color = amb.pollen ? 0xffe9b0 : amb.spore ? palette.grass2 : amb.ash ? 0x8a7a72 : palette.stone;
    followed(fx.ambient({
      getCenter: () => anchor, radius: AMB_R, y0: 0.3, y1: amb.ash ? 9 : 5,
      rate: (amb.ash ? 4 : 7) * qMul, life: 10, size: amb.ash ? 0.05 : 0.045, color, color2: null,
      vel: { x: 0.05, y: amb.ash ? 0.35 : 0.06, z: 0.03 }, sway: 0.35, additive: !amb.dust,
    }), 0.3, amb.ash ? 9 : 5);
  }

  // ---- fireflies (dusk/night or always, per biome)
  let fireflyHandle = null, fireflyActive = false;
  const FIREFLY_RATE = 8 * qMul;
  if (amb.fireflies) {
    fireflyHandle = followed(fx.ambient({
      getCenter: () => anchor, radius: Math.min(half * 0.85, 15), y0: 0.3, y1: 2.2,
      rate: 0, life: 3.6, size: 0.09, color: 0xdfffb0, color2: 0xffe9b0,
      vel: { x: 0, y: 0.05, z: 0 }, sway: 0.9, additive: true,
    }), 0.3, 2.2);
    fireflyHandle.opts.flicker = true;
  }

  // ---- falling leaves (forest)
  if (amb.leaves) {
    followed(fx.ambient({
      getCenter: () => anchor, radius: AMB_R, y0: 0, y1: 11,
      rate: 3 * qMul, life: 6, size: 0.09, color: palette.grass, color2: palette.dirt,
      vel: { x: 0.15, y: -0.5, z: 0.1 }, sway: 0.8, additive: false,
    }), 0, 11);
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
    const n = Math.max(2, Math.round((3 + Math.floor(rng() * 3)) * qMul));
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
      // Drift with the traveling player: a bird left >34u behind quietly
      // rehomes into the 12–25u annulus ahead (far enough to never pop on-screen).
      if (playerPos) {
        const hx = b.home.x - playerPos.x, hz = b.home.z - playerPos.z;
        if (hx * hx + hz * hz > 34 * 34 && b.state !== 'flee') {
          annulusPoint(_pt);
          b.home.x = _pt.x; b.home.z = _pt.z;
          b.x = _pt.x; b.z = _pt.z;
          b.state = 'perch'; b.t = 1 + rng() * 2; b.hopTarget = null;
          b.group.position.set(b.x, heightAt(b.x, b.z) + b.baseY, b.z);
        }
      }
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

  // ---- butterflies: drift between wander points, flap wings. All wings are
  // ONE InstancedMesh (two instances per butterfly) with per-instance colors,
  // so a bigger, multi-colored flock costs a single draw call.
  const butterflies = [];
  let wingIM = null;
  const _body = new THREE.Object3D(), _wl = new THREE.Object3D(), _wr = new THREE.Object3D();
  _body.add(_wl, _wr);
  _wl.position.x = 0.005;                           // wings lie flat either side of
  _wr.position.x = -0.005; _wr.scale.set(-1, 1, 1); // the body (local +Z = forward)
  if (amb.butterflies) {
    const wingGeo = geo('butterfly_wing2', () => {
      // forewing (big rounded lobe) + hindwing (small lobe), one flat shape
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.bezierCurveTo(0.02, 0.07, 0.085, 0.085, 0.09, 0.03);
      sh.bezierCurveTo(0.092, 0.005, 0.05, -0.005, 0.03, -0.004);
      sh.bezierCurveTo(0.06, -0.03, 0.05, -0.065, 0.02, -0.055);
      sh.bezierCurveTo(0.008, -0.05, 0.002, -0.02, 0, 0);
      const g = new THREE.ShapeGeometry(sh, 5);
      g.rotateX(Math.PI / 2); // lie flat: span +X, forewing toward +Z (forward)
      return g;
    });
    const wingM = matOwned(0xffffff, { rough: 0.6, side: THREE.DoubleSide, emissive: 0x2a2014, emissiveIntensity: 0.12, rim: 0.2 });
    const n = Math.max(3, Math.round((7 + Math.floor(rng() * 5)) * qMul));
    wingIM = new THREE.InstancedMesh(wingGeo, wingM, n * 2);
    wingIM.frustumCulled = false;
    wingIM.castShadow = false;
    const PALETTE = [0xffd94f, 0xff9fb0, 0xb0a8ff, 0xfff4f0, 0xffb85c, 0x8fd8ff];
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      col.set(PALETTE[Math.floor(rng() * PALETTE.length)]);
      wingIM.setColorAt(i * 2, col); wingIM.setColorAt(i * 2 + 1, col);
      // seed the flock near the spawn point — the player's first view has life in it
      const a = rng() * TAU, r = 3 + rng() * 11;
      const x = clamp(anchor.x + Math.cos(a) * r, -half, half), z = clamp(anchor.z + Math.sin(a) * r, -half, half);
      const y = heightAt(x, z) + 0.9 + rng() * 0.8;
      butterflies.push({ x, z, y, yaw: rng() * TAU, target: null, phase: rng() * TAU, speed: 0.55 + rng() * 0.35, beat: 9 + rng() * 5 });
    }
    wingIM.instanceColor.needsUpdate = true;
    scene.add(wingIM);
    disposeFns.push(() => { scene.remove(wingIM); wingIM.dispose(); });
  }
  function updateButterflies(dt) {
    for (let i = 0; i < butterflies.length; i++) {
      const b = butterflies[i];
      b.phase += dt * b.beat;
      const flap = Math.sin(b.phase) * 0.85 + 0.85;
      // left far behind the traveling player? rehome into the near annulus
      const pdx = b.x - anchor.x, pdz = b.z - anchor.z;
      if (pdx * pdx + pdz * pdz > 30 * 30) {
        annulusPoint(_pt);
        b.x = _pt.x; b.z = _pt.z;
        b.y = heightAt(b.x, b.z) + 0.9 + rng() * 0.8;
        b.target = null;
      }
      if (!b.target || Math.hypot(b.target.x - b.x, b.target.z - b.z) < 0.3) {
        // wander targets stay within ~15u of the player so the flutter is
        // always where the camera is
        const a = rng() * TAU, r = 2 + rng() * 13;
        const tx = clamp(anchor.x + Math.cos(a) * r, -half, half);
        const tz = clamp(anchor.z + Math.sin(a) * r, -half, half);
        b.target = { x: tx, z: tz, y: heightAt(tx, tz) + 0.7 + rng() * 1.0 };
      }
      const dx = b.target.x - b.x, dz = b.target.z - b.z;
      const d = Math.hypot(dx, dz) || 1;
      b.x += (dx / d) * b.speed * dt + Math.sin(T * 2 + b.phase * 0.1) * dt * 0.3;
      b.z += (dz / d) * b.speed * dt + Math.cos(T * 1.7 + b.phase * 0.1) * dt * 0.3;
      b.y = damp(b.y, b.target.y + Math.sin(b.phase * 0.35) * 0.08, 1.5, dt);
      b.yaw = dampAngle(b.yaw, Math.atan2(dx, dz), 3, dt);
      _body.position.set(b.x, b.y, b.z);
      _body.rotation.set(0, b.yaw, 0);
      _wl.rotation.z = flap; _wr.rotation.z = -flap; // both tips lift together
      _body.updateMatrixWorld(true);
      wingIM.setMatrixAt(i * 2, _wl.matrixWorld);
      wingIM.setMatrixAt(i * 2 + 1, _wr.matrixWorld);
    }
    if (wingIM) wingIM.instanceMatrix.needsUpdate = true;
  }

  // ---- a bird flock wheeling high over open country: V silhouettes that
  // flap in bursts and glide; one instanced draw, orbit follows the player.
  let flockIM = null;
  const flock = [];
  const _fb = new THREE.Object3D(), _fl = new THREE.Object3D(), _fr = new THREE.Object3D();
  _fb.add(_fl, _fr);
  _fr.scale.set(-1, 1, 1);
  if (amb.flock) {
    const wg = geo('flock_wing', () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0, 0, -0.1, 0.55, 0.02, -0.02, 0.55, 0.02, -0.02, 0, 0, -0.1, 0, 0, 0.12], 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0], 3));
      return g;
    });
    const fm = matOwned(0x3a3a46, { rough: 0.9, side: THREE.DoubleSide, rim: 0 });
    const n = Math.max(3, Math.round(7 * qMul));
    flockIM = new THREE.InstancedMesh(wg, fm, n * 2);
    flockIM.frustumCulled = false;
    flockIM.castShadow = false;
    const r0 = 18 + rng() * 8;
    for (let i = 0; i < n; i++) {
      flock.push({ ang: rng() * TAU, r: r0 + (rng() - 0.5) * 6, h: 18 + rng() * 7, sp: 0.16 + rng() * 0.05, ph: rng() * TAU, s: 0.8 + rng() * 0.45 });
    }
    scene.add(flockIM);
    disposeFns.push(() => { scene.remove(flockIM); flockIM.dispose(); });
  }
  const flockCenter = { x: anchor.x, z: anchor.z };
  function updateFlock(dt) {
    flockCenter.x = damp(flockCenter.x, anchor.x + 10, 0.2, dt);
    flockCenter.z = damp(flockCenter.z, anchor.z - 14, 0.2, dt);
    const gy = heightAt(flockCenter.x, flockCenter.z);
    for (let i = 0; i < flock.length; i++) {
      const f = flock[i];
      f.ang += dt * f.sp;
      const x = flockCenter.x + Math.cos(f.ang) * f.r, z = flockCenter.z + Math.sin(f.ang) * f.r;
      const y = gy + f.h + Math.sin(f.ang * 3 + f.ph) * 0.8;
      // flap in bursts, then glide with wings slightly raised
      const burst = Math.sin(T * 0.7 + f.ph) > 0.2;
      const flap = burst ? Math.sin(T * 9 + f.ph) * 0.55 : 0.12;
      _fb.position.set(x, y, z);
      _fb.rotation.set(0, Math.atan2(-Math.sin(f.ang), Math.cos(f.ang)) , -0.25);
      _fb.scale.setScalar(f.s);
      _fl.rotation.set(0, 0, flap); _fr.rotation.set(0, 0, -flap);
      _fb.updateMatrixWorld(true);
      flockIM.setMatrixAt(i * 2, _fl.matrixWorld);
      flockIM.setMatrixAt(i * 2 + 1, _fr.matrixWorld);
    }
    if (flockIM) flockIM.instanceMatrix.needsUpdate = true;
  }

  // ---- fish jumps: now and then a little fish arcs out of the water near
  // the player and drops back in with ripple rings (one reused mesh).
  let fish = null;
  if (zone.water) {
    const fg = geo('fish_body', () => {
      const body = new THREE.SphereGeometry(1, 10, 6);
      body.scale(0.05, 0.07, 0.17);
      const tail = new THREE.ConeGeometry(0.06, 0.1, 4);
      tail.rotateX(-Math.PI / 2); tail.scale(0.3, 1, 1); tail.translate(0, 0, -0.2);
      const g = mergeTwo(body, tail);
      body.dispose(); tail.dispose();
      return g;
    });
    const mesh = new THREE.Mesh(fg, matOwned(0xc8d8e0, { rough: 0.3, metal: 0.4, rim: 0.4 }));
    mesh.visible = false;
    scene.add(mesh);
    disposeFns.push(() => scene.remove(mesh));
    fish = { mesh, t: 0, wait: 2 + rng() * 3, x: 0, z: 0, dir: 0, active: false };
  }
  function updateFish(dt) {
    const w = zone.water;
    const wx = w.pos?.[0] ?? 0, wz = w.pos?.[1] ?? 0, wr = (w.size ?? 40) / 2, lvl = w.level ?? 0;
    if (!fish.active) {
      fish.wait -= dt;
      if (fish.wait > 0) return;
      // pick a deep-enough spot in the water, near the player when possible
      for (let k = 0; k < 6; k++) {
        const near = rng() < 0.75;
        const a = rng() * TAU, r = near ? 6 + rng() * 16 : Math.sqrt(rng()) * wr * 0.85;
        const x = near ? anchor.x + Math.cos(a) * r : wx + Math.cos(a) * r;
        const z = near ? anchor.z + Math.sin(a) * r : wz + Math.sin(a) * r;
        if (Math.abs(x - wx) > wr || Math.abs(z - wz) > wr) continue;
        if (heightAt(x, z) > lvl - 0.35) continue;
        fish.active = true; fish.t = 0; fish.x = x; fish.z = z; fish.dir = rng() * TAU;
        fish.mesh.visible = true;
        fx.emitRing({ at: { x, y: lvl + 0.02, z }, radius: 0.05, count: 12, speed: 0.8, life: 1.0, size: 0.05, color: 0xe8f6ff, additive: false });
        break;
      }
      fish.wait = 3 + rng() * 5;
      return;
    }
    fish.t += dt / 0.85;
    const u = Math.min(1, fish.t);
    const dx = Math.sin(fish.dir), dz = Math.cos(fish.dir);
    const px = fish.x + dx * u * 0.9, pz = fish.z + dz * u * 0.9;
    const py = lvl + Math.sin(u * Math.PI) * 0.55 - 0.05;
    fish.mesh.position.set(px, py, pz);
    fish.mesh.rotation.set(-Math.cos(u * Math.PI) * 1.0, fish.dir, 0);
    if (u >= 1) {
      fish.active = false; fish.mesh.visible = false;
      fx.emitRing({ at: { x: px, y: lvl + 0.02, z: pz }, radius: 0.06, count: 16, speed: 1.0, life: 1.2, size: 0.055, color: 0xe8f6ff, additive: false });
      fx.emitBurst?.({ at: { x: px, y: lvl + 0.05, z: pz }, count: 6, color: 0xe8f6ff, size: 0.05, life: 0.45, speed: 0.9, up: 1.2 });
    }
  }

  // ---- bats (cave): circling, erratic flight near the ceiling
  const bats = [];
  if (amb.bats) {
    const batMat = matOwned(0x2a2630, { rough: 0.9, side: THREE.DoubleSide });
    const bodyGeo = geo('bat_body', () => new THREE.SphereGeometry(0.045, 5, 4));
    const wingGeo = geo('bat_wing', () => new THREE.CircleGeometry(0.11, 6, -0.5, 2.1));
    const n = Math.max(2, Math.round((4 + Math.floor(rng() * 3)) * qMul));
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
      // circle centers drift with the traveling player (rehome when far off-screen)
      const cdx = b.center.x - anchor.x, cdz = b.center.z - anchor.z;
      if (cdx * cdx + cdz * cdz > 32 * 32) annulusPoint(b.center, 8, 18);
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
  // Two sources: the zone's authored `encounters.roaming` herds, and a
  // roadside population drawn from its encounter table, so a walk through any
  // wild zone meets Kindred you can see and fight. Bodies are built lazily
  // (one per frame, nearest first) and are only drawn and animated near the
  // Warden. Temperament follows each creature's personality: bold ones spot
  // you ('!') and give chase — faster than a walk, slower than a run — shy
  // ones bolt, calm ones only close in at arm's length. A Kindred you beat or
  // catch is gone; another turns up somewhere out of sight a minute later.
  const roamers = [];
  const pending = [];          // bodies still to build: {speciesId, level, x, z, area, road?}
  const respawns = [];         // {t, spec}
  let registry = null;
  let battleBusy = false;
  let graceT = ARRIVAL_GRACE;
  // a breather after every battle (patch, roamer or story): no back-to-back pounce
  const offBattleEnd = bus.on('battle:end', () => { graceT = Math.max(graceT, BATTLE_GRACE); });
  const ALERT_R = 6.5, ALERT_R2 = ALERT_R * ALERT_R;
  const CONTACT_R = 1.35, CONTACT_R2 = CONTACT_R * CONTACT_R;
  const CLOSE_R2 = 3.2 * 3.2;  // calm Kindred only close in this near
  const CHASE_GIVEUP = 7;

  const table = (zone.encounters?.table ?? []).filter((e) => (e.w ?? 0) > 0);
  const totalW = table.reduce((sum, e) => sum + e.w, 0);
  const roads = (zone.paths ?? []).filter((p) => p.from && p.to);
  const roadLen = roads.map((p) => Math.hypot(p.to[0] - p.from[0], p.to[1] - p.from[1]));
  const roadTotal = roadLen.reduce((sum, l) => sum + l, 0);
  const keepClear = [ // [x, z, r] — arrivals, gates and people get breathing room
    ...(zone.spawn ? [[zone.spawn[0], zone.spawn[1], 18]] : []),
    ...(zone.portals ?? []).map((p) => [p.at[0], p.at[1], 18]),
    ...(zone.npcs ?? []).filter((n) => n.at).map((n) => [n.at[0], n.at[1], 10]),
  ];

  function pickEntry() {
    let u = rng() * totalW;
    for (const e of table) { u -= e.w; if (u <= 0) return e; }
    return table[table.length - 1];
  }
  const levelIn = (entry) => (entry?.lv ? randInt(entry.lv[0], entry.lv[1], rng) : 5);

  function spotOk(x, z, awayFrom, awayR) {
    if (Math.abs(x) > half - 4 || Math.abs(z) > half - 4) return false;
    const w = zone.water;
    if (w) {
      const wh = (w.size ?? 0) / 2;
      if (Math.abs(x - (w.pos?.[0] ?? 0)) < wh && Math.abs(z - (w.pos?.[1] ?? 0)) < wh && heightAt(x, z) < (w.level ?? 0) + 0.12) return false;
    }
    // no ledges: a steep spot reads as a creature glued to a cliff
    if (Math.abs(heightAt(x + 1, z) - heightAt(x - 1, z)) + Math.abs(heightAt(x, z + 1) - heightAt(x, z - 1)) > 1.5) return false;
    for (const [cx, cz, r] of keepClear) if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
    for (const c of world.colliders ?? []) { const rr = (c.r ?? 0) + 1.1; if ((x - c.x) ** 2 + (z - c.z) ** 2 < rr * rr) return false; }
    for (const r of roamers) if (!r.dead && (x - r.home.x) ** 2 + (z - r.home.z) ** 2 < 144) return false;
    for (const q of pending) if ((x - q.x) ** 2 + (z - q.z) ** 2 < 144) return false;
    if (awayFrom && (x - awayFrom.x) ** 2 + (z - awayFrom.z) ** 2 < awayR * awayR) return false;
    return true;
  }

  // A spot a few steps off a road: a path picked by length, a point along it,
  // then a sideways step past the verge.
  function roadSpot(awayFrom, awayR) {
    if (!roadTotal) return null;
    for (let tries = 0; tries < 40; tries++) {
      let u = rng() * roadTotal, k = 0;
      while (k < roads.length - 1 && u > roadLen[k]) { u -= roadLen[k]; k++; }
      const p = roads[k], len = roadLen[k] || 1, t = rng();
      const [ax, az] = p.from, [bx, bz] = p.to;
      const off = ((p.width ?? 3) / 2 + 2.5 + rng() * 8) * (rng() < 0.5 ? -1 : 1);
      const x = ax + (bx - ax) * t - ((bz - az) / len) * off;
      const z = az + (bz - az) * t + ((bx - ax) / len) * off;
      if (spotOk(x, z, awayFrom, awayR)) return { x, z };
    }
    return null;
  }
  function areaSpot(area, awayFrom, awayR) {
    for (let tries = 0; tries < 24; tries++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * area.r;
      const x = clamp(area.x + Math.cos(a) * r, -half, half), z = clamp(area.z + Math.sin(a) * r, -half, half);
      if (spotOk(x, z, awayFrom, awayR)) return { x, z };
    }
    return null;
  }

  function populate() {
    for (const spec of zone.encounters?.roaming ?? []) {
      const [ax, az, ar] = spec.area ?? [0, 0, half * 0.6];
      const area = { x: ax, z: az, r: ar };
      const entry = table.find((e) => e.speciesId === spec.speciesId);
      for (let i = 0; i < (spec.count ?? 1); i++) {
        const at = areaSpot(area) ?? { x: ax, z: az };
        pending.push({ speciesId: spec.speciesId, level: levelIn(entry), x: at.x, z: at.z, area });
      }
    }
    if (!table.length || !roadTotal) return;
    const lively = clamp(totalW / 150, 0.4, 1); // rare-only tables stay sparse
    const n = Math.round(clamp(Math.round(size / ROAD_SPACING), ROAD_MIN, ROAD_MAX) * lively) - Math.floor(pending.length / 2);
    for (let i = 0; i < n; i++) {
      const at = roadSpot();
      if (!at) continue;
      const entry = pickEntry();
      pending.push({ speciesId: entry.speciesId, level: levelIn(entry), x: at.x, z: at.z, area: { x: at.x, z: at.z, r: 7 }, road: true });
    }
  }
  populate();
  if (pending.length) {
    import('../creatures/registry.js')
      .then((m) => { registry = m; })
      .catch((e) => warnOnce('creatures/registry.js unavailable — roaming Kindred disabled: ' + (e?.message ?? e)));
  }

  // '!' over a Kindred that has spotted you
  let alertTex = null;
  function alertSprite() {
    if (!alertTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      g.beginPath(); g.arc(32, 32, 24, 0, TAU);
      g.fillStyle = '#ffe08a'; g.fill();
      g.lineWidth = 5; g.strokeStyle = '#3a2410'; g.stroke();
      g.fillStyle = '#3a2410'; g.font = 'bold 38px Georgia, serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 32, 34);
      alertTex = new THREE.CanvasTexture(c);
      alertTex.colorSpace = THREE.SRGBColorSpace;
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: alertTex, depthTest: false, transparent: true, toneMapped: false }));
    sp.name = 'kindredAlert';
    sp.renderOrder = 20;
    sp.visible = false;
    scene.add(sp);
    return sp;
  }

  function buildOne(spec) {
    let built;
    try { built = registry.buildCreature(spec.speciesId, {}); }
    catch (e) { console.error(`[wildlife] buildCreature(${spec.speciesId}) failed`, e); return; }
    if (!built?.group) return;
    // Knee-high Kindred vanish into tall grass a few steps off the road: out
    // here the small ones stand a little larger than life so they read from
    // the path (battles still show them at true size).
    const top = new THREE.Box3().setFromObject(built.group).max.y;
    const up = Number.isFinite(top) && top > 0 ? clamp(OVERWORLD_MIN_H / top, 1, OVERWORLD_MAX_UP) : 1;
    built.group.scale.multiplyScalar(up);
    const { x, z } = spec;
    const y = heightAt(x, z);
    const face = rng() * TAU;
    built.group.position.set(x, y, z);
    built.group.rotation.y = face;
    scene.add(built.group);
    try { built.animator?.play?.('idle'); } catch (e) { /* tolerate animator drift */ }
    const personality = built.animator?.hints?.personality ?? 'calm';
    roamers.push({
      spec, speciesId: spec.speciesId, level: spec.level, group: built.group, animator: built.animator,
      x, z, y, face, h: Number.isFinite(top) ? Math.max(0.4, top * up) : 1,
      temper: TEMPERAMENT[personality] ?? 'calm', home: { x, z }, area: spec.area,
      state: 'wander', wanderTarget: null, idleT: 1 + rng() * 3, speed: 1.5 + rng() * 0.4,
      chaseT: 0, cooldown: 0, alertT: 0, alert: null, shimmerT: rng(), collider: { x, z, r: 0.4 },
    });
  }

  function retire(rec) {
    rec.dead = true;
    scene.remove(rec.group);
    disposeGroup(rec.group); // registry builds are per-call, safe to free
    if (rec.alert) { scene.remove(rec.alert); rec.alert.material.dispose(); rec.alert = null; }
    respawns.push({ t: RESPAWN_MIN + rng() * (RESPAWN_MAX - RESPAWN_MIN), spec: rec.spec });
  }

  function resolveRoamCollision(rec, x, z) {
    let px = x, pz = z;
    for (const c of world.colliders ?? []) {
      const dx = px - c.x, dz = pz - c.z;
      const rr = c.r + 0.4;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2), push = (rr - d) / d; px += dx * push; pz += dz * push; }
    }
    _resolved[0] = px; _resolved[1] = pz;
    return _resolved;
  }

  function moveRoamer(rec, tx, tz, dt, speedMul = 1) {
    const dx = tx - rec.x, dz = tz - rec.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return dist;
    const step = Math.min(dist, rec.speed * speedMul * dt);
    let nx = rec.x + (dx / dist) * step, nz = rec.z + (dz / dist) * step;
    nx = clamp(nx, -half, half); nz = clamp(nz, -half, half);
    // never wade into deep water after the Warden
    const w = zone.water;
    if (w && heightAt(nx, nz) < (w.level ?? 0) - 0.25) {
      const wh = (w.size ?? 0) / 2;
      if (Math.abs(nx - (w.pos?.[0] ?? 0)) < wh && Math.abs(nz - (w.pos?.[1] ?? 0)) < wh) return 0;
    }
    [nx, nz] = resolveRoamCollision(rec, nx, nz);
    rec.x = nx; rec.z = nz;
    rec.collider.x = nx; rec.collider.z = nz;
    rec.face = dampAngle(rec.face, Math.atan2(dx, dz), 8, dt);
    return dist;
  }

  function play(rec, name) { try { rec.animator?.play?.(name); } catch (e) { /* tolerate animator drift */ } }

  function triggerContact(rec) {
    if (battleBusy || rec.state === 'locked') return;
    battleBusy = true;
    rec.state = 'locked';
    rec.cooldown = 999; // cleared explicitly once the battle resolves
    play(rec, 'attack');
    Promise.resolve(world.startWildBattle?.(rec.speciesId, rec.level))
      .catch((e) => { console.error('[wildlife] startWildBattle failed', e); return null; })
      .then((result) => {
        battleBusy = false;
        if (rec.dead) return;
        if (result?.outcome === 'caught' || result?.outcome === 'win') { retire(rec); return; }
        // fled, lost, or no battle after all: it leaves you be for a while
        rec.state = 'wander';
        rec.cooldown = LOSE_INTEREST;
        rec.chaseT = 0;
        const p = world.player?.pos;
        const away = p ? Math.atan2(rec.x - p.x, rec.z - p.z) : rng() * TAU;
        rec.wanderTarget = { x: rec.x + Math.sin(away) * 5, z: rec.z + Math.cos(away) * 5 };
        play(rec, 'walk');
      });
  }

  function updateRoamer(rec, dt, playerPos, holdOff) {
    if (rec.dead) return;
    const dx = rec.x - playerPos.x, dz = rec.z - playerPos.z;
    const d2 = dx * dx + dz * dz;
    // far off: not drawn, not animated, not thinking
    const drawn = d2 < DRAW_R2;
    rec.group.visible = drawn;
    if (!drawn) { if (rec.alert) rec.alert.visible = false; return; }
    if (rec.cooldown > 0) rec.cooldown -= dt;
    if (rec.state === 'locked') { animate(rec, dt, d2); return; }
    const engage = !holdOff && rec.cooldown <= 0;

    if (engage && d2 < CONTACT_R2) {
      triggerContact(rec);
      animate(rec, dt, d2);
      return;
    }

    const noticed = engage && d2 < ALERT_R2 && (rec.temper !== 'calm' || d2 < CLOSE_R2);
    if (noticed) {
      if (rec.state !== 'alert') {
        rec.state = 'alert'; rec.chaseT = 0; play(rec, 'walk');
        if (rec.temper !== 'calm') rec.alertT = 1.4; // the '!' pops
      }
      rec.chaseT += dt;
      if (rec.temper === 'shy') {
        const d = Math.sqrt(d2) || 1;
        moveRoamer(rec, rec.x + (dx / d) * 4, rec.z + (dz / d) * 4, dt, SHY_SPEED);
      } else moveRoamer(rec, playerPos.x, playerPos.z, dt, rec.temper === 'bold' ? CHASE_SPEED : 1);
      if (rec.chaseT > CHASE_GIVEUP) { rec.state = 'wander'; rec.cooldown = 4; rec.wanderTarget = null; play(rec, 'idle'); }
    } else {
      if (rec.state === 'alert') { rec.state = 'wander'; rec.wanderTarget = null; play(rec, 'idle'); }
      if (rec.wanderTarget) {
        const remaining = moveRoamer(rec, rec.wanderTarget.x, rec.wanderTarget.z, dt);
        if (remaining < 0.15) { rec.wanderTarget = null; rec.idleT = 2 + rng() * 4; play(rec, 'idle'); }
      } else if (!holdOff && d2 < ALERT_R2 * 2.2) {
        // a calm one (or one that just lost interest) turns to watch you pass
        rec.face = dampAngle(rec.face, Math.atan2(-dx, -dz), 3, dt);
      } else if ((rec.idleT -= dt) <= 0) {
        const a = rng() * TAU, r = rng() * rec.area.r * 0.7;
        rec.wanderTarget = { x: clamp(rec.area.x + Math.cos(a) * r, -half, half), z: clamp(rec.area.z + Math.sin(a) * r, -half, half) };
        play(rec, 'walk');
      }
    }
    animate(rec, dt, d2);
  }

  function animate(rec, dt, d2) {
    rec.y = damp(rec.y, heightAt(rec.x, rec.z), 12, dt);
    rec.group.position.set(rec.x, rec.y, rec.z);
    rec.group.rotation.y = rec.face;
    if (d2 < ANIM_R2) {
      try { rec.animator?.update?.(dt); } catch (e) { /* tolerate */ }
      // the wild shimmer: a faint mote now and then drifts up off every wild
      // Kindred — the same tell as the encounter patches, and what catches the
      // eye in tall grass
      if ((rec.shimmerT -= dt) <= 0 && rec.state !== 'locked') {
        rec.shimmerT = 0.3 + rng() * 0.45;
        fx.emitBurst({
          at: { x: rec.x + (rng() - 0.5) * 0.5, y: rec.y + rec.h * (0.4 + rng() * 0.45), z: rec.z + (rng() - 0.5) * 0.5 },
          count: 1, speed: 0.3, up: 2.4, gravity: -0.2, drag: 0.7, life: 1.6, size: 0.08, sizeEnd: 0.02,
          color: 0xfff0c0, color2: 0xd6f2ff, flicker: true, sway: 0.35,
        });
      }
    }
    if (rec.alertT > 0) {
      rec.alertT -= dt;
      rec.alert ??= alertSprite();
      const age = 1.4 - rec.alertT, u = Math.min(1, age / 0.3) - 1;
      const pop = 1 + 2.70158 * u * u * u + 1.70158 * u * u; // ease-out-back: pops past full size, settles
      rec.alert.visible = rec.alertT > 0;
      rec.alert.scale.setScalar(0.62 * pop);
      rec.alert.material.opacity = Math.min(1, rec.alertT / 0.3);
      rec.alert.position.set(rec.x, rec.y + rec.h + 0.45 + Math.min(age, 0.16) * 0.8, rec.z);
    } else if (rec.alert?.visible) rec.alert.visible = false;
  }

  function updateRoamers(dt, ppos) {
    if (graceT > 0) graceT -= dt;
    // build one queued body a frame, nearest first — but never right on top of
    // the Warden (a load or arrival next to one shouldn't start a fight)
    if (registry && pending.length) {
      let bi = -1, bd = Infinity;
      for (let i = 0; i < pending.length; i++) {
        const d = (pending[i].x - ppos.x) ** 2 + (pending[i].z - ppos.z) ** 2;
        if (d > 14 * 14 && d < bd) { bd = d; bi = i; }
      }
      if (bi >= 0) buildOne(pending.splice(bi, 1)[0]);
    }
    // replacements for the beaten and the caught turn up out of sight
    for (let i = respawns.length - 1; i >= 0; i--) {
      const r = respawns[i];
      if ((r.t -= dt) > 0) continue;
      const at = r.spec.road ? roadSpot(ppos, 35) : areaSpot(r.spec.area, ppos, 35);
      if (!at) { r.t = 5; continue; }
      respawns.splice(i, 1);
      const entry = r.spec.road ? pickEntry() : table.find((e) => e.speciesId === r.spec.speciesId);
      pending.push({
        ...r.spec, speciesId: entry?.speciesId ?? r.spec.speciesId, level: levelIn(entry), x: at.x, z: at.z,
        area: r.spec.road ? { x: at.x, z: at.z, r: 7 } : r.spec.area,
      });
    }
    // nobody pounces mid-dialogue, mid-cutscene or mid-portal
    const holdOff = graceT > 0 || !!world.player?.isFrozen?.() || !!world._transferring;
    for (const rec of roamers) updateRoamer(rec, dt, ppos, holdOff);
    for (let i = roamers.length - 1; i >= 0; i--) if (roamers[i].dead) roamers.splice(i, 1);
  }

  // =================================================================
  // update / dispose
  // =================================================================
  function update(dt) {
    T += dt;
    fx.update(dt);
    const player = world.player;
    const ppos = player?.pos ?? null;

    // keep the ambient-life anchor glued to the Warden (particle fields emit
    // around it; the y-band follows the ground height under the player)
    if (ppos) { anchor.x = ppos.x; anchor.y = ppos.y; anchor.z = ppos.z; }
    for (let i = 0; i < followers.length; i++) {
      const f = followers[i];
      f.handle.opts.y0 = anchor.y + f.y0;
      f.handle.opts.y1 = anchor.y + f.y1;
    }

    if (fireflyHandle) {
      const want = amb.fireflies === 'always' ? true : (1 - daylight(G.calendar?.dayTime ?? 0.5)) > 0.45;
      if (want !== fireflyActive) { fireflyActive = want; fireflyHandle.rate = want ? FIREFLY_RATE : 0; }
    }

    if (amb.birds) updateBirds(dt, ppos);
    if (amb.butterflies && wingIM) updateButterflies(dt);
    if (flockIM) updateFlock(dt);
    if (fish) updateFish(dt);
    if (amb.bats) updateBats(dt);
    for (const u of updaters) u(dt, T);

    if (ppos && (roamers.length || pending.length || respawns.length)) updateRoamers(dt, ppos);
  }

  function dispose() {
    offBattleEnd();
    fx.dispose();
    for (const b of birds) scene.remove(b.group);
    for (const f of disposeFns) { try { f(); } catch (e) { /* ignore */ } }
    for (const b of bats) scene.remove(b.group);
    for (const rec of roamers) {
      if (!rec.dead) { scene.remove(rec.group); disposeGroup(rec.group); }
      if (rec.alert) { scene.remove(rec.alert); rec.alert.material.dispose(); }
    }
    alertTex?.dispose();
    for (const d of disposables) { d.geo?.dispose?.(); d.mat?.dispose?.(); }
    geoCache.clear();
    roamers.length = 0; pending.length = 0; respawns.length = 0;
  }

  // test/debug view of the wild population
  const census = () => ({
    built: roamers.filter((r) => !r.dead).length, pending: pending.length, respawning: respawns.length,
    drawn: roamers.filter((r) => !r.dead && r.group.visible).length,
    list: roamers.filter((r) => !r.dead).map((r) => ({ id: r.speciesId, lv: r.level, x: Math.round(r.x), z: Math.round(r.z), temper: r.temper, state: r.state, road: !!r.spec.road })),
  });

  return { update, dispose, census };
}

function mergeTwo(a, b) {
  const A = a.index ? a.toNonIndexed() : a, B = b.index ? b.toNonIndexed() : b;
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const aa = A.attributes[name].array, bb = B.attributes[name].array;
    const out = new Float32Array(aa.length + bb.length);
    out.set(aa, 0); out.set(bb, aa.length);
    g.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  return g;
}

function lerpHex(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return ca.lerp(cb, t).getHex();
}
