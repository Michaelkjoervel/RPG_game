// props.js — every prop kind in the world: vegetation, rocks, buildings, ruins,
// cave growth, town dressing. Density-scattered kinds use InstancedMesh (seeded by
// zone seed, stable layouts); single placements use the same instanced path (N=1)
// except animated set-pieces (waterfall, campfire, boat...) which build live groups.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   buildProps(zone, heightAt) -> { group, colliders, updaters:[fn(dt,time)], dispose() }
// Additionally exposes `surfacePatches`: oriented rectangles registered by
// walkable wooden props (bridge planks, dock boards, house floors) so
// player.js footsteps can resolve step_wood on them —
//   [{x, z, hx, hz, cos, sin, r2, surface:'wood'}] (cos/sin of the prop yaw,
//   r2 = squared broad-phase radius).
import * as THREE from 'three';
import { windSway } from '../gfx/materials.js';
import { G } from '../core/state.js';
import { seededRandom, hashStr } from '../core/rng.js';
import { clamp, lerp, TAU } from '../core/math.js';

// ---------------------------------------------------------------- shared temps
const _m4 = new THREE.Matrix4();
const _m4b = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _eul = new THREE.Euler();
const _col = new THREE.Color();

const warned = new Set();
const warnOnce = (msg) => { if (!warned.has(msg)) { warned.add(msg); console.warn('[props]', msg); } };

// Day factor: 0 = full night, 1 = full day (dayTime 0 = midnight, 0.5 = noon).
function daylight(t) {
  const up = clamp((t - 0.21) / 0.08, 0, 1);
  const down = 1 - clamp((t - 0.74) / 0.08, 0, 1);
  return Math.min(up, down);
}

// ---------------------------------------------------------------- entry point
export function buildProps(zone, heightAt) {
  const size = zone.size ?? 200;
  const half = size / 2;
  const seed = (zone.terrain && zone.terrain.seed) ?? hashStr(zone.id ?? 'zone');
  const water = zone.water ?? null;
  const paths = zone.paths ?? [];
  const biome = zone.biome ?? 'meadow';

  const group = new THREE.Group();
  group.name = 'props';
  const colliders = [];
  const updaters = [];
  const surfacePatches = []; // wood-footstep rectangles (see header)
  const disposables = []; // {geo?|mat?|fn?}

  // Per-build caches so dispose() is airtight and zones never leak into each other.
  const geoCache = new Map();
  const matCache = new Map();
  const pulseMats = [];  // {m, base, amp, speed, phase}
  const nightMats = [];  // {m, base}  emissive that wakes at dusk
  const nightLights = []; // {light, base}
  let lightBudget = 10;   // dynamic point lights per zone, spent by set-pieces

  const geo = (key, make) => {
    let g = geoCache.get(key);
    if (!g) { g = make(); geoCache.set(key, g); disposables.push({ geo: g }); }
    return g;
  };

  // ------------------------------------------------------------- geometry lib
  const sphereG = (r, w = 7, h = 5) => geo(`sp${r}_${w}_${h}`, () => new THREE.SphereGeometry(r, w, h));
  const coneG = (r, h, s = 7) => geo(`co${r}_${h}_${s}`, () => new THREE.ConeGeometry(r, h, s));
  const cylG = (rt, rb, h, s = 7) => geo(`cy${rt}_${rb}_${h}_${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
  const boxG = (w, h, d) => geo(`bx${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
  const icoG = (r, d = 0) => geo(`ic${r}_${d}`, () => new THREE.IcosahedronGeometry(r, d));
  const planeG = (w, h, sw = 1, sh = 1) => geo(`pl${w}_${h}_${sw}_${sh}`, () => new THREE.PlaneGeometry(w, h, sw, sh));
  const octaG = (r) => geo(`oc${r}`, () => new THREE.OctahedronGeometry(r, 0));
  // Organic blob — icosahedron displaced by a deterministic per-vertex hash.
  const blobG = (r, bseed, amp = 0.28) => geo(`bl${r}_${bseed}_${amp}`, () => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position;
    const rr = seededRandom(bseed);
    // Displace unique vertices consistently: hash by rounded position.
    const seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)}|${p.getY(i).toFixed(3)}|${p.getZ(i).toFixed(3)}`;
      let f = seen.get(k);
      if (f === undefined) { f = 1 + (rr() * 2 - 1) * amp; seen.set(k, f); }
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.92, p.getZ(i) * f);
    }
    g.computeVertexNormals();
    return g;
  });

  // ------------------------------------------------------------- material lib
  function std(key, opts = {}) {
    let m = matCache.get(key);
    if (m) return m;
    m = new THREE.MeshStandardMaterial({
      color: 0xffffff, // instances carry the tint
      flatShading: opts.flat !== false,
      roughness: opts.rough ?? 0.92,
      metalness: opts.metal ?? 0.0,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      emissive: new THREE.Color(opts.emissive ?? 0x000000),
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      depthWrite: opts.depthWrite ?? true,
    });
    if (opts.sway) {
      try { disposables.push({ fn: windSway(m, { strength: opts.sway }) }); } // fn = sway unregister
      catch (e) { warnOnce('windSway unavailable: ' + e.message); }
    }
    if (opts.pulse) pulseMats.push({ m, base: opts.emissiveIntensity ?? 1, amp: opts.pulse.amp ?? 0.4, speed: opts.pulse.speed ?? 1.2, phase: opts.pulse.phase ?? 0 });
    if (opts.night) nightMats.push({ m, base: opts.emissiveIntensity ?? 1 });
    matCache.set(key, m);
    disposables.push({ mat: m });
    return m;
  }

  const FOLIAGE  = std('foliage', { sway: 0.55, rough: 0.95 });
  const FOLIAGE2 = std('foliage2', { sway: 0.3, rough: 0.95 });         // subtle sway
  const SOLID    = std('solid', {});                                     // rock/wood/stone
  const SOLID_S  = std('solid_smooth', { flat: true, rough: 0.85 });
  const CLOTH    = std('cloth', { sway: 0.65, side: THREE.DoubleSide, rough: 1 });
  const FROND    = std('frond', { sway: 0.8, side: THREE.DoubleSide, rough: 0.95 });
  const ICE      = std('ice', { rough: 0.35, transparent: true, opacity: 0.85, emissive: 0x9fd4ff, emissiveIntensity: 0.12 });
  const GLOW_CRYSTAL = std('glow_crystal', { emissive: 0x9fe8ff, emissiveIntensity: 0.9, rough: 0.4, pulse: { amp: 0.45, speed: 1.1 } });
  const GLOW_FRUIT  = std('glow_fruit', { emissive: 0xffe9b0, emissiveIntensity: 1.1, rough: 0.5, pulse: { amp: 0.35, speed: 0.8, phase: 1.7 } });
  const GLOW_FERN   = std('glow_fern', { sway: 0.6, side: THREE.DoubleSide, emissive: 0x59e8c2, emissiveIntensity: 0.85, pulse: { amp: 0.4, speed: 1.4 } });
  const GLOW_RUNE   = std('glow_rune', { emissive: 0xffe9b0, emissiveIntensity: 0.8, rough: 0.6, pulse: { amp: 0.25, speed: 0.55 } });
  const GLOW_LAVA   = std('glow_lava', { emissive: 0xff5a1f, emissiveIntensity: 1.3, rough: 0.7, pulse: { amp: 0.5, speed: 0.9 } });
  const WINDOW      = std('window', { emissive: 0xffc97a, emissiveIntensity: 0.9, rough: 0.4, night: true });
  const LAMP_GLASS  = std('lamp_glass', { emissive: 0xffd9a0, emissiveIntensity: 1.2, rough: 0.3, night: true });
  const BERRY       = std('berry', { emissive: 0xd83a4a, emissiveIntensity: 0.25, rough: 0.6 });
  const SPIRE_SEAM  = std('spire_seam', { emissive: 0xcfd4e8, emissiveIntensity: 0.55, rough: 0.6, pulse: { amp: 0.2, speed: 0.4 } });

  // ------------------------------------------------------------- placement utils
  const terrainY = (x, z) => { try { return heightAt(x, z); } catch (e) { return 0; } };

  function distToSeg(x, z, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L2 = dx * dx + dz * dz || 1e-6;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1);
    const px = a[0] + dx * t, pz = a[1] + dz * t;
    return Math.hypot(x - px, z - pz);
  }
  function pathInfo(x, z) {
    let best = Infinity, bw = 0;
    for (const p of paths) {
      const d = distToSeg(x, z, p.from, p.to);
      if (d < best) { best = d; bw = p.width ?? 3; }
    }
    return { d: best, w: bw };
  }
  const inWater = (x, z) => water ? terrainY(x, z) < water.level + 0.12 : false;

  // ---------------------------------------------------------------- kind defs
  // Part: { g, m, off:[x,y,z], rot:[x,y,z], scl:[x,y,z]|n, tint, jit, shadow }
  // Def:  { make(rng)->parts[], collider, variants, ground:'terrain'|'water'|'hang',
  //         faceCenter, faceWater, hangH:[lo,hi], effect(x,y,z,s,rng), noPathAvoid }
  const P = (g, m, tint, off = [0, 0, 0], scl = 1, rot = [0, 0, 0], jit = 0.06, shadow = true) =>
    ({ g, m, tint, off, scl, rot, jit, shadow });

  function canopyStack(rng, mat, tints, n, r0, y0, spread) {
    const parts = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const r = r0 * lerp(1, 0.55, t) * (0.85 + rng() * 0.3);
      const a = rng() * TAU, rad = spread * (1 - t) * rng();
      parts.push(P(blobG(1, 100 + i * 17, 0.3), mat, tints[i % tints.length],
        [Math.cos(a) * rad, y0 + t * r0 * 1.6 + r * 0.4, Math.sin(a) * rad], [r, r * 0.85, r], [0, rng() * TAU, 0], 0.08));
    }
    return parts;
  }

  const KINDS = {
    // ------------------------------------------------------------- trees
    tree_oak: {
      variants: 3, collider: 0.55, cluster: true,
      make: (rng) => [
        P(cylG(0.14, 0.26, 1.7, 6), SOLID, 0x6b4a33, [0, 0.85, 0], 1, [0, 0, (rng() - 0.5) * 0.12]),
        P(cylG(0.07, 0.11, 0.9, 5), SOLID, 0x6b4a33, [0.25, 1.55, 0.1], 1, [0, 0, -0.7]),
        ...canopyStack(rng, FOLIAGE, [0x4f9e4f, 0x63b356, 0x7ec850], 4, 1.15, 1.9, 0.7),
      ],
    },
    tree_pine: {
      variants: 2, collider: 0.5, cluster: true,
      make: (rng) => [
        P(cylG(0.1, 0.2, 1.4, 6), SOLID, 0x5d4130, [0, 0.7, 0]),
        P(coneG(1.25, 1.7, 8), FOLIAGE, 0x2f6b46, [0, 1.9, 0], [1, 1, 1], [0, rng() * TAU, 0]),
        P(coneG(0.95, 1.5, 8), FOLIAGE, 0x37784e, [0, 2.85, 0], 1, [0, rng(), 0]),
        P(coneG(0.62, 1.3, 8), FOLIAGE, 0x418a58, [0, 3.7, 0], 1, [0, rng() * 2, 0]),
      ],
    },
    tree_birch: {
      variants: 2, collider: 0.32, cluster: true,
      make: (rng) => [
        P(cylG(0.08, 0.13, 2.3, 6), SOLID, 0xe8e2d4, [0, 1.15, 0], 1, [0, 0, (rng() - 0.5) * 0.1]),
        P(boxG(0.16, 0.08, 0.05), SOLID, 0x3a3a38, [0.02, 0.8, 0.09]),
        P(boxG(0.14, 0.07, 0.05), SOLID, 0x3a3a38, [-0.04, 1.6, 0.08], 1, [0, 0.5, 0]),
        ...canopyStack(rng, FOLIAGE, [0x8fce62, 0xa5d86e, 0x79bd58], 3, 0.85, 2.3, 0.45),
      ],
    },
    tree_willow: {
      variants: 2, collider: 0.6,
      make: (rng) => {
        const parts = [
          P(cylG(0.16, 0.3, 1.6, 6), SOLID, 0x6a5540, [0, 0.8, 0], 1, [0, 0, 0.12]),
          P(blobG(1, 300, 0.22), FOLIAGE2, 0x5f9e57, [0, 2.3, 0], [1.5, 0.9, 1.5]),
        ];
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU + rng() * 0.4;
          parts.push(P(planeG(0.22, 1.5), FROND, 0x6fb35f,
            [Math.cos(a) * 1.35, 1.65, Math.sin(a) * 1.35], [1, 0.8 + rng() * 0.5, 1], [0, -a + Math.PI / 2, 0], 0.1, false));
        }
        return parts;
      },
    },
    tree_dead: {
      variants: 2, collider: 0.38,
      make: (rng) => [
        P(cylG(0.09, 0.22, 2.1, 5), SOLID, 0x77706a, [0, 1.05, 0], 1, [0, 0, (rng() - 0.5) * 0.2]),
        P(cylG(0.04, 0.08, 1.1, 4), SOLID, 0x77706a, [0.3, 1.9, 0], 1, [0, 0, -0.9]),
        P(cylG(0.03, 0.07, 0.9, 4), SOLID, 0x6d6660, [-0.25, 1.6, 0.1], 1, [0.3, 0, 0.8]),
        P(cylG(0.02, 0.05, 0.6, 4), SOLID, 0x6d6660, [0.05, 2.3, -0.15], 1, [-0.6, 0, 0.2]),
      ],
    },
    tree_glow: {
      variants: 2, collider: 0.55,
      make: (rng) => {
        const parts = [
          P(cylG(0.13, 0.24, 1.8, 6), SOLID, 0x3c4257, [0, 0.9, 0], 1, [0, 0, (rng() - 0.5) * 0.14]),
          ...canopyStack(rng, FOLIAGE, [0x2e5f56, 0x387068, 0x2a4f52], 3, 1.05, 2.0, 0.55),
        ];
        for (let i = 0; i < 5; i++) {
          const a = rng() * TAU, r = 0.55 + rng() * 0.6;
          parts.push(P(sphereG(0.09, 6, 5), GLOW_FRUIT, 0xffe9b0,
            [Math.cos(a) * r, 2.1 + rng() * 1.2, Math.sin(a) * r], 1, [0, 0, 0], 0, false));
        }
        return parts;
      },
      effect: (x, y, z, s, rng, ctx) => {
        if (ctx.singles && lightBudget > 0) {
          lightBudget--;
          const l = new THREE.PointLight(0xffe9b0, 1.6, 9 * s, 2);
          l.position.set(x, y + 2.6 * s, z);
          group.add(l);
          pulseLights.push({ light: l, base: 1.6, amp: 0.5, speed: 0.8, phase: rng() * TAU });
        }
        return null;
      },
    },
    // ------------------------------------------------------------- fungus & undergrowth
    mushroom_giant: {
      variants: 2, collider: 0.7,
      make: (rng) => {
        const cap = rng() > 0.5 ? 0xc25a6e : 0x8a6ec2;
        const parts = [
          P(cylG(0.3, 0.45, 1.7, 7), SOLID_S, 0xe8ddc8, [0, 0.85, 0], 1, [0, 0, (rng() - 0.5) * 0.1]),
          P(sphereG(1, 9, 5), FOLIAGE2, cap, [0, 1.85, 0], [1.5, 0.75, 1.5]),
          P(cylG(1.2, 1.35, 0.12, 9), SOLID_S, 0xf0e8d8, [0, 1.55, 0]),
        ];
        for (let i = 0; i < 5; i++) {
          const a = rng() * TAU, r = rng() * 1.1;
          parts.push(P(sphereG(0.11, 5, 4), SOLID_S, 0xf5efe2, [Math.cos(a) * r, 2.2 + rng() * 0.25, Math.sin(a) * r], [1, 0.5, 1], [0, 0, 0], 0, false));
        }
        return parts;
      },
    },
    mushroom_cluster: {
      variants: 3, collider: 0, noPathAvoid: true,
      make: (rng) => {
        const parts = [];
        const n = 3 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const a = rng() * TAU, r = rng() * 0.4, s = 0.5 + rng() * 0.7;
          const cap = [0xc25a6e, 0x8a6ec2, 0xd8a05a][Math.floor(rng() * 3)];
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          parts.push(P(cylG(0.05 * s, 0.08 * s, 0.28 * s, 5), SOLID_S, 0xe8ddc8, [x, 0.14 * s, z]));
          parts.push(P(sphereG(0.14 * s, 7, 4), SOLID_S, cap, [x, 0.3 * s, z], [1, 0.7, 1]));
        }
        return parts;
      },
    },
    bush: {
      variants: 3, collider: 0.4, cluster: true,
      make: (rng) => [
        P(blobG(1, 410, 0.3), FOLIAGE, 0x4f9e4f, [0, 0.45, 0], [0.65, 0.55, 0.65], [0, rng() * TAU, 0], 0.1),
        P(blobG(1, 411, 0.3), FOLIAGE, 0x63b356, [0.3, 0.35, 0.15], [0.4, 0.35, 0.4], [0, rng() * TAU, 0], 0.1),
      ],
    },
    berry_bush: {
      variants: 2, collider: 0.4,
      make: (rng) => {
        const parts = [
          P(blobG(1, 420, 0.3), FOLIAGE, 0x3f8a45, [0, 0.45, 0], [0.6, 0.5, 0.6], [0, rng() * TAU, 0], 0.08),
        ];
        for (let i = 0; i < 7; i++) {
          const a = rng() * TAU, b = rng() * Math.PI;
          parts.push(P(sphereG(0.05, 5, 4), BERRY, 0xd83a4a,
            [Math.sin(b) * Math.cos(a) * 0.55, 0.45 + Math.cos(b) * 0.42, Math.sin(b) * Math.sin(a) * 0.55], 1, [0, 0, 0], 0, false));
        }
        return parts;
      },
    },
    flower_patch: {
      variants: 4, collider: 0, noPathAvoid: true, pathRing: true,
      make: (rng) => {
        const parts = [];
        const petals = [0xffffff, 0xffd94f, 0xff9fb0, 0xb0a8ff, 0xffb85c];
        const n = 5 + Math.floor(rng() * 4);
        for (let i = 0; i < n; i++) {
          const a = rng() * TAU, r = rng() * 0.65, s = 0.7 + rng() * 0.6;
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          const c = petals[Math.floor(rng() * petals.length)];
          parts.push(P(cylG(0.012, 0.016, 0.24 * s, 4), FOLIAGE, 0x4f9e4f, [x, 0.12 * s, z], 1, [0, 0, 0], 0.05, false));
          parts.push(P(octaG(0.05 * s), FOLIAGE, c, [x, 0.26 * s, z], [1, 0.5, 1], [0, rng() * TAU, 0], 0.12, false));
        }
        return parts;
      },
    },
    fern: {
      variants: 3, collider: 0, noPathAvoid: true, cluster: true,
      make: (rng) => {
        const parts = [];
        const n = 5 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + rng() * 0.5;
          parts.push(P(planeG(0.16, 0.7), FROND, 0x3f8a45,
            [Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12], [1, 0.8 + rng() * 0.5, 1], [-0.6 - rng() * 0.3, -a + Math.PI / 2, 0], 0.1, false));
        }
        return parts;
      },
    },
    glowfern: {
      variants: 2, collider: 0, noPathAvoid: true, cluster: true,
      make: (rng) => {
        const parts = [];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + rng() * 0.5;
          parts.push(P(planeG(0.14, 0.6), GLOW_FERN, 0x59e8c2,
            [Math.cos(a) * 0.1, 0.26, Math.sin(a) * 0.1], [1, 0.8 + rng() * 0.4, 1], [-0.55 - rng() * 0.3, -a + Math.PI / 2, 0], 0.1, false));
        }
        return parts;
      },
    },
    grass_tuft: {
      variants: 4, collider: 0, noPathAvoid: true, pathRing: true,
      make: (rng) => {
        const parts = [];
        const n = 4 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const a = rng() * TAU, r = rng() * 0.14;
          parts.push(P(coneG(0.035, 0.45, 4), FOLIAGE, lerpColorHex(0x7ec850, 0x4f9e4f, rng()),
            [Math.cos(a) * r, 0.2, Math.sin(a) * r], [1, 0.7 + rng() * 0.7, 1], [(rng() - 0.5) * 0.4, rng() * TAU, (rng() - 0.5) * 0.4], 0.1, false));
        }
        return parts;
      },
    },
    reeds: {
      variants: 3, collider: 0, noPathAvoid: true,
      make: (rng) => {
        const parts = [];
        const n = 5 + Math.floor(rng() * 4);
        for (let i = 0; i < n; i++) {
          const a = rng() * TAU, r = rng() * 0.35, h = 0.9 + rng() * 0.7;
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          parts.push(P(cylG(0.015, 0.025, h, 4), FOLIAGE, 0x6f9e57, [x, h / 2, z], 1, [(rng() - 0.5) * 0.15, 0, (rng() - 0.5) * 0.15], 0.06, false));
          if (rng() > 0.4) parts.push(P(cylG(0.035, 0.035, 0.18, 5), FOLIAGE, 0x8a6a44, [x, h + 0.06, z], 1, [0, 0, 0], 0.06, false));
        }
        return parts;
      },
    },
    lilypad: {
      variants: 3, collider: 0, ground: 'water', noPathAvoid: true,
      make: (rng) => {
        const parts = [
          P(cylG(0.42, 0.42, 0.02, 9), FOLIAGE2, 0x4f9e57, [0, 0, 0], [1, 1, 1], [0, rng() * TAU, 0], 0.08, false),
          P(boxG(0.18, 0.021, 0.12), FOLIAGE2, 0x4f9e57, [0.36, 0.0, 0.1], 1, [0, 0.4, 0], 0.08, false),
        ];
        if (rng() > 0.6) parts.push(P(octaG(0.08), FOLIAGE2, 0xffc9d8, [0.1, 0.07, -0.08], [1, 0.6, 1], [0, 0, 0], 0.05, false));
        return parts;
      },
    },
    // ------------------------------------------------------------- rocks & crystal
    rock: {
      variants: 3, collider: 0.55, cluster: true,
      make: (rng) => [
        P(icoG(0.6, 0), SOLID, 0x8d8a84, [0, 0.32, 0], [1, 0.7 + rng() * 0.3, 1], [rng() * 0.4, rng() * TAU, rng() * 0.4], 0.05),
        P(icoG(0.3, 0), SOLID, 0x807d78, [0.5, 0.16, 0.2], [1, 0.7, 1], [0, rng() * TAU, 0], 0.05),
      ],
    },
    rock_mossy: {
      variants: 3, collider: 0.55,
      make: (rng) => [
        P(icoG(0.6, 0), SOLID, 0x86837d, [0, 0.32, 0], [1, 0.72, 1], [rng() * 0.3, rng() * TAU, rng() * 0.3], 0.05),
        P(blobG(1, 520, 0.22), FOLIAGE2, 0x5c8a4a, [0, 0.55, 0], [0.55, 0.28, 0.55], [0, rng() * TAU, 0], 0.1, false),
      ],
    },
    rock_crystal: {
      variants: 2, collider: 0.55,
      make: (rng) => [
        P(icoG(0.55, 0), SOLID, 0x6d6a72, [0, 0.3, 0], [1, 0.7, 1], [0, rng() * TAU, 0.2], 0.05),
        P(octaG(0.22), GLOW_CRYSTAL, 0x9fe8ff, [0.1, 0.65, 0.05], [1, 2.2, 1], [0.15, rng() * TAU, -0.1], 0.08),
        P(octaG(0.14), GLOW_CRYSTAL, 0xc2f0ff, [-0.28, 0.45, 0.14], [1, 1.9, 1], [-0.3, rng() * TAU, 0.25], 0.08),
      ],
    },
    crystal_cluster: {
      variants: 3, collider: 0.6,
      make: (rng) => {
        const parts = [P(icoG(0.5, 0), SOLID, 0x5c5a64, [0, 0.22, 0], [1.2, 0.5, 1.2], [0, rng() * TAU, 0], 0.05)];
        const n = 4 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const a = rng() * TAU, r = rng() * 0.4, h = 1.2 + rng() * 1.5;
          parts.push(P(octaG(0.2), GLOW_CRYSTAL, rng() > 0.5 ? 0x9fe8ff : 0xb8a8ff,
            [Math.cos(a) * r, h * 0.35, Math.sin(a) * r], [0.8 + rng() * 0.4, h * 2.2, 0.8 + rng() * 0.4],
            [(rng() - 0.5) * 0.55, rng() * TAU, (rng() - 0.5) * 0.55], 0.08));
        }
        return parts;
      },
      effect: (x, y, z, s, rng, ctx) => {
        if (ctx.singles && lightBudget > 0) {
          lightBudget--;
          const l = new THREE.PointLight(0xa8dcff, 1.4, 8 * s, 2);
          l.position.set(x, y + 1.2 * s, z);
          group.add(l);
          pulseLights.push({ light: l, base: 1.4, amp: 0.45, speed: 1.1, phase: rng() * TAU });
        }
        return null;
      },
    },
    stump: {
      variants: 2, collider: 0.35,
      make: (rng) => [
        P(cylG(0.3, 0.4, 0.45, 8), SOLID, 0x6b4a33, [0, 0.22, 0]),
        P(cylG(0.28, 0.28, 0.03, 8), SOLID_S, 0xc9a878, [0, 0.46, 0]),
        P(coneG(0.12, 0.2, 5), SOLID, 0x6b4a33, [0.34, 0.1, 0.1], 1, [0, 0, -1.2]),
        P(coneG(0.1, 0.18, 5), SOLID, 0x6b4a33, [-0.3, 0.09, -0.14], 1, [0, 0, 1.2]),
      ],
    },
    log: {
      variants: 2, collider: 0.35,
      make: (rng) => [
        P(cylG(0.22, 0.26, 1.9, 7), SOLID, 0x715039, [0, 0.24, 0], 1, [0, 0, Math.PI / 2]),
        P(cylG(0.21, 0.21, 0.03, 7), SOLID_S, 0xc9a878, [0.97, 0.24, 0], 1, [0, 0, Math.PI / 2]),
        P(blobG(1, 530, 0.2), FOLIAGE2, 0x5c8a4a, [-0.3, 0.42, 0], [0.35, 0.14, 0.28], [0, 0, 0], 0.1, false),
      ],
    },
    // ------------------------------------------------------------- town & structures
    fence: {
      variants: 1, collider: 0.45,
      make: () => [
        P(boxG(0.09, 0.75, 0.09), SOLID, 0x8a6a48, [-0.65, 0.37, 0]),
        P(boxG(0.09, 0.75, 0.09), SOLID, 0x8a6a48, [0.65, 0.37, 0]),
        P(boxG(1.55, 0.07, 0.05), SOLID, 0x9a7a55, [0, 0.55, 0]),
        P(boxG(1.55, 0.07, 0.05), SOLID, 0x9a7a55, [0, 0.28, 0]),
      ],
    },
    lamp_post: {
      variants: 1, collider: 0.28,
      make: () => [
        P(cylG(0.05, 0.08, 2.3, 6), SOLID, 0x3a3f4a, [0, 1.15, 0]),
        P(cylG(0.16, 0.2, 0.08, 6), SOLID, 0x3a3f4a, [0, 0.04, 0]),
        P(boxG(0.5, 0.05, 0.05), SOLID, 0x3a3f4a, [0.2, 2.28, 0]),
        P(boxG(0.16, 0.22, 0.16), LAMP_GLASS, 0xffd9a0, [0.42, 2.14, 0], 1, [0, 0, 0], 0, false),
        P(coneG(0.16, 0.14, 4), SOLID, 0x3a3f4a, [0.42, 2.32, 0]),
      ],
      effect: (x, y, z, s, rng) => {
        if (lightBudget <= 0) return null;
        lightBudget--;
        const l = new THREE.PointLight(0xffd9a0, 0, 8 * s, 2);
        l.position.set(x, y + 2.1 * s, z);
        group.add(l);
        nightLights.push({ light: l, base: 1.5, phase: rng() * TAU });
        return null;
      },
    },
    shrine_stone: {
      variants: 2, collider: 0.5,
      make: (rng) => [
        P(boxG(0.9, 0.3, 0.9), SOLID, 0x7d7a74, [0, 0.15, 0], 1, [0, rng() * 0.3, 0]),
        P(boxG(0.5, 1.5, 0.34), SOLID, 0x8d8a84, [0, 1.0, 0], 1, [0, 0, (rng() - 0.5) * 0.06]),
        P(boxG(0.3, 1.0, 0.02), GLOW_RUNE, 0xffe9b0, [0, 1.05, 0.18], 1, [0, 0, 0], 0, false),
        P(blobG(1, 540, 0.2), FOLIAGE2, 0x5c8a4a, [0.3, 0.32, 0.25], [0.28, 0.12, 0.22], [0, rng() * TAU, 0], 0.1, false),
      ],
    },
    well: {
      variants: 1, collider: 0.85,
      make: () => [
        P(cylG(0.75, 0.85, 0.6, 9), SOLID, 0x8d8a84, [0, 0.3, 0]),
        P(cylG(0.62, 0.62, 0.62, 9), SOLID, 0x2a3038, [0, 0.31, 0], 1, [0, 0, 0], 0, false),
        P(boxG(0.1, 1.4, 0.1), SOLID, 0x6b4a33, [-0.7, 0.9, 0]),
        P(boxG(0.1, 1.4, 0.1), SOLID, 0x6b4a33, [0.7, 0.9, 0]),
        P(coneG(1.05, 0.55, 4), SOLID, 0x9a4a3a, [0, 1.85, 0], 1, [0, Math.PI / 4, 0]),
        P(cylG(0.04, 0.04, 1.3, 5), SOLID, 0x5a4a3a, [0, 1.5, 0], 1, [0, 0, Math.PI / 2]),
        P(cylG(0.16, 0.14, 0.2, 6), SOLID, 0x7a5a3a, [0, 1.1, 0]),
      ],
    },
    house_small: {
      variants: 2, collider: 2.5, faceCenter: true, sinkY: 0.25,
      surface: 'wood', surfaceRect: [1.8, 1.55], // plank floor: footprint + doorstep


      make: (rng) => {
        const wall = rng() > 0.5 ? 0xe8dcc2 : 0xdcd2c0;
        return [
          P(boxG(3.4, 2.2, 2.9), SOLID_S, wall, [0, 1.1, 0]),
          // timber frame
          P(boxG(0.12, 2.2, 0.12), SOLID, 0x6b4a33, [-1.66, 1.1, 1.42]),
          P(boxG(0.12, 2.2, 0.12), SOLID, 0x6b4a33, [1.66, 1.1, 1.42]),
          P(boxG(3.4, 0.12, 0.12), SOLID, 0x6b4a33, [0, 2.18, 1.42]),
          P(boxG(0.12, 1.3, 0.1), SOLID, 0x6b4a33, [-0.9, 1.4, 1.44], 1, [0, 0, 0.5]),
          // roof
          P(coneG(2.9, 1.7, 4), SOLID, 0x9a4a3a, [0, 3.05, 0], [1.05, 1, 0.85], [0, Math.PI / 4, 0]),
          // door + step
          P(boxG(0.8, 1.4, 0.1), SOLID, 0x6b4a33, [0.6, 0.7, 1.48]),
          P(sphereG(0.05, 5, 4), SOLID_S, 0xc9b878, [0.85, 0.72, 1.55], 1, [0, 0, 0], 0, false),
          P(boxG(1.0, 0.14, 0.5), SOLID, 0x8d8a84, [0.6, 0.07, 1.68]),
          // windows (night glow)
          P(boxG(0.55, 0.55, 0.08), WINDOW, 0xffc97a, [-0.85, 1.35, 1.47], 1, [0, 0, 0], 0, false),
          P(boxG(0.55, 0.55, 0.08), WINDOW, 0xffc97a, [1.72, 1.35, -0.5], 1, [0, Math.PI / 2, 0], 0, false),
          // chimney
          P(boxG(0.42, 1.2, 0.42), SOLID, 0x8d8a84, [-1.0, 3.2, -0.5]),
        ];
      },
    },
    house_large: {
      variants: 1, collider: 3.6, faceCenter: true, sinkY: 0.3,
      surface: 'wood', surfaceRect: [2.7, 2.0],

      make: () => [
        P(boxG(5.2, 2.6, 3.8), SOLID_S, 0xe8dcc2, [0, 1.3, 0]),
        P(boxG(3.0, 2.0, 3.0), SOLID_S, 0xdcd2c0, [1.8, 3.4, 0]),
        P(coneG(2.6, 1.5, 4), SOLID, 0x9a4a3a, [1.8, 5.1, 0], [1.05, 1, 0.9], [0, Math.PI / 4, 0]),
        P(coneG(3.4, 1.6, 4), SOLID, 0x8a4234, [-0.8, 3.35, 0], [1.1, 1, 0.85], [0, Math.PI / 4, 0]),
        P(boxG(0.14, 2.6, 0.14), SOLID, 0x6b4a33, [-2.55, 1.3, 1.86]),
        P(boxG(0.14, 2.6, 0.14), SOLID, 0x6b4a33, [2.55, 1.3, 1.86]),
        P(boxG(5.2, 0.14, 0.14), SOLID, 0x6b4a33, [0, 2.56, 1.86]),
        P(boxG(0.95, 1.6, 0.12), SOLID, 0x6b4a33, [0, 0.8, 1.92]),
        P(boxG(1.3, 0.16, 0.6), SOLID, 0x8d8a84, [0, 0.08, 2.2]),
        P(boxG(0.6, 0.6, 0.1), WINDOW, 0xffc97a, [-1.5, 1.5, 1.92], 1, [0, 0, 0], 0, false),
        P(boxG(0.6, 0.6, 0.1), WINDOW, 0xffc97a, [1.5, 1.5, 1.92], 1, [0, 0, 0], 0, false),
        P(boxG(0.55, 0.55, 0.1), WINDOW, 0xffc97a, [1.8, 3.6, 1.52], 1, [0, 0, 0], 0, false),
        P(boxG(0.5, 1.5, 0.5), SOLID, 0x8d8a84, [-1.9, 3.4, -1.0]),
      ],
    },
    shop_stall: {
      variants: 2, collider: 1.4, faceCenter: true,
      make: (rng) => {
        const stripe = rng() > 0.5 ? 0xc25a4a : 0x4a7ac2;
        const parts = [
          P(boxG(2.4, 0.9, 1.1), SOLID, 0x8a6a48, [0, 0.45, 0]),
          P(boxG(2.5, 0.08, 1.2), SOLID_S, 0xa88a5c, [0, 0.94, 0]),
          P(boxG(0.08, 2.1, 0.08), SOLID, 0x6b4a33, [-1.2, 1.05, -0.5]),
          P(boxG(0.08, 2.1, 0.08), SOLID, 0x6b4a33, [1.2, 1.05, -0.5]),
          P(boxG(0.08, 2.4, 0.08), SOLID, 0x6b4a33, [-1.2, 1.2, 0.62]),
          P(boxG(0.08, 2.4, 0.08), SOLID, 0x6b4a33, [1.2, 1.2, 0.62]),
        ];
        for (let i = 0; i < 5; i++) {
          parts.push(P(planeG(0.52, 1.5), CLOTH, i % 2 ? 0xf0e8d8 : stripe,
            [-1.04 + i * 0.52, 2.25, 0.15], 1, [-0.42, 0, 0], 0.03, false));
        }
        // wares
        parts.push(P(sphereG(0.14, 6, 5), SOLID_S, 0xd8a05a, [-0.6, 1.06, 0.2], 1, [0, 0, 0], 0.15, false));
        parts.push(P(sphereG(0.12, 6, 5), SOLID_S, 0xc25a6e, [-0.28, 1.05, 0.05], 1, [0, 0, 0], 0.15, false));
        parts.push(P(boxG(0.4, 0.24, 0.3), SOLID, 0x9a7a55, [0.55, 1.06, 0.1], 1, [0, 0.4, 0], 0.1, false));
        return parts;
      },
    },
    bridge: {
      variants: 1, collider: 0,
      surface: 'wood', surfaceRect: [2.5, 1.1], // plank span (local x) × width (local z)

      make: (rng) => {
        const parts = [];
        const n = 9;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1) - 0.5;
          const y = 0.25 + Math.cos(t * Math.PI) * 0.35;
          parts.push(P(boxG(0.55, 0.09, 1.9), SOLID, i % 2 ? 0x8a6a48 : 0x94765a, [t * 4.4, y, 0], 1, [0, 0, -t * 0.5]));
        }
        for (const s of [-1, 1]) {
          parts.push(P(boxG(4.6, 0.07, 0.07), SOLID, 0x6b4a33, [0, 1.05, s * 0.9]));
          for (let i = 0; i < 4; i++) {
            const t = i / 3 - 0.5;
            parts.push(P(boxG(0.08, 0.7, 0.08), SOLID, 0x6b4a33, [t * 4.2, 0.7 + Math.cos(t * Math.PI) * 0.32, s * 0.9]));
          }
        }
        return parts;
      },
    },
    cart: {
      variants: 2, collider: 1.0,
      make: (rng) => [
        P(boxG(1.7, 0.5, 1.0), SOLID, 0x8a6a48, [0, 0.65, 0]),
        P(cylG(0.42, 0.42, 0.09, 9), SOLID, 0x6b4a33, [0.55, 0.42, 0.55], 1, [Math.PI / 2, 0, 0]),
        P(cylG(0.42, 0.42, 0.09, 9), SOLID, 0x6b4a33, [0.55, 0.42, -0.55], 1, [Math.PI / 2, 0, 0]),
        P(cylG(0.04, 0.05, 1.3, 5), SOLID, 0x6b4a33, [-1.2, 0.5, 0.3], 1, [0, 0, 1.1]),
        P(cylG(0.04, 0.05, 1.3, 5), SOLID, 0x6b4a33, [-1.2, 0.5, -0.3], 1, [0, 0, 1.1]),
        P(sphereG(0.28, 6, 5), CLOTH, 0xd8c8a8, [0.2, 1.05, 0], [1.4, 0.55, 0.9], [0, 0.3, 0], 0.08, false),
      ],
    },
    crate: {
      variants: 2, collider: 0.5, cluster: true,
      make: (rng) => [
        P(boxG(0.75, 0.75, 0.75), SOLID, 0x9a7a55, [0, 0.37, 0], 1, [0, rng() * 0.5, 0]),
        P(boxG(0.79, 0.1, 0.1), SOLID, 0x7a5c3d, [0, 0.7, 0], 1, [0, rng() * 0.5, 0], 0.03, false),
      ],
    },
    barrel: {
      variants: 2, collider: 0.42, cluster: true,
      make: (rng) => [
        P(cylG(0.32, 0.28, 0.8, 9), SOLID, 0x8a6a48, [0, 0.4, 0]),
        P(cylG(0.345, 0.345, 0.07, 9), SOLID_S, 0x4a4038, [0, 0.62, 0]),
        P(cylG(0.345, 0.345, 0.07, 9), SOLID_S, 0x4a4038, [0, 0.2, 0]),
      ],
    },
    campfire: {
      variants: 1, collider: 0.6,
      make: (rng) => {
        const parts = [];
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          parts.push(P(icoG(0.14, 0), SOLID, 0x7d7a74, [Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.6], [1, 0.75, 1], [0, rng() * TAU, 0], 0.05, false));
        }
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + 0.4;
          parts.push(P(cylG(0.06, 0.08, 0.85, 5), SOLID, 0x4a382a, [Math.cos(a) * 0.14, 0.28, Math.sin(a) * 0.14], 1, [Math.PI / 3.2, a, 0], 0.05, false));
        }
        return parts;
      },
      effect: (x, y, z, s) => makeCampfireFX(x, y, z, s),
    },
    tent: {
      variants: 2, collider: 1.2, faceCenter: true,
      make: (rng) => {
        const c = rng() > 0.5 ? 0xc2a878 : 0x8a9ab0;
        return [
          P(planeG(2.4, 2.0), CLOTH, c, [-0.75, 0.75, 0], 1, [0, 0, 0.86], 0.04),
          P(planeG(2.4, 2.0), CLOTH, c, [0.75, 0.75, 0], 1, [0, 0, -0.86], 0.04),
          P(planeG(1.6, 1.5), CLOTH, lerpColorHex(c, 0x000000, 0.25), [0, 0.72, -1.0], 1, [0, 0, 0], 0.04),
          P(cylG(0.035, 0.045, 1.6, 5), SOLID, 0x6b4a33, [0, 0.8, 1.0], 1, [0.12, 0, 0]),
          P(cylG(0.035, 0.045, 1.6, 5), SOLID, 0x6b4a33, [0, 0.8, -1.0], 1, [-0.12, 0, 0]),
        ];
      },
    },
    // ------------------------------------------------------------- ruins
    ruin_pillar: {
      variants: 3, collider: 0.55,
      make: (rng) => {
        const h = 1.6 + rng() * 1.6;
        const parts = [
          P(boxG(0.95, 0.3, 0.95), SOLID, 0x9a978e, [0, 0.15, 0], 1, [0, rng() * 0.4, 0]),
          P(cylG(0.34, 0.4, h, 8), SOLID, 0xa8a49a, [0, 0.3 + h / 2, 0], 1, [(rng() - 0.5) * 0.1, 0, (rng() - 0.5) * 0.1]),
          P(cylG(0.42, 0.36, 0.22, 8), SOLID, 0x9a978e, [0, 0.3 + h + 0.1, 0], 1, [(rng() - 0.5) * 0.14, 0, (rng() - 0.5) * 0.14]),
        ];
        if (rng() > 0.5) parts.push(P(icoG(0.24, 0), SOLID, 0x9a978e, [0.7, 0.14, 0.4], [1, 0.6, 1], [0, rng() * TAU, 0], 0.05, false));
        return parts;
      },
    },
    ruin_arch: {
      variants: 2, collider: 0, sinkY: 0.15,
      make: (rng) => [
        P(boxG(0.7, 3.0, 0.7), SOLID, 0xa8a49a, [-1.5, 1.5, 0], 1, [0, 0, (rng() - 0.5) * 0.05]),
        P(boxG(0.7, 3.0, 0.7), SOLID, 0xa8a49a, [1.5, 1.5, 0], 1, [0, 0, (rng() - 0.5) * 0.05]),
        P(boxG(2.2, 0.6, 0.75), SOLID, 0x9a978e, [-0.5, 3.25, 0], 1, [0, 0, 0.04]),
        P(boxG(1.1, 0.55, 0.72), SOLID, 0x9a978e, [1.25, 3.2, 0], 1, [0, 0, -0.09]),
        P(blobG(1, 560, 0.2), FOLIAGE2, 0x5c8a4a, [-1.5, 3.05, 0.2], [0.4, 0.15, 0.3], [0, rng() * TAU, 0], 0.1, false),
      ],
    },
    ruin_wall: {
      variants: 3, collider: 1.6,
      make: (rng) => {
        const parts = [P(boxG(3.2, 1.2, 0.55), SOLID, 0xa8a49a, [0, 0.6, 0], 1, [0, 0, (rng() - 0.5) * 0.04])];
        let x = -1.4;
        while (x < 1.4) {
          const w = 0.4 + rng() * 0.5, h = 0.3 + rng() * 1.1;
          parts.push(P(boxG(w, h, 0.55), SOLID, 0x9e9a90, [x, 1.2 + h / 2, 0], 1, [0, 0, (rng() - 0.5) * 0.08]));
          x += w + 0.15 + rng() * 0.35;
        }
        parts.push(P(blobG(1, 570, 0.2), FOLIAGE2, 0x5c8a4a, [0.6, 1.28, 0.2], [0.45, 0.16, 0.3], [0, rng() * TAU, 0], 0.1, false));
        return parts;
      },
    },
    statue_warden: {
      variants: 1, collider: 0.8,
      make: () => [
        P(boxG(1.5, 0.5, 1.5), SOLID, 0x8d8a84, [0, 0.25, 0]),
        P(boxG(1.1, 0.35, 1.1), SOLID, 0x9a978e, [0, 0.67, 0]),
        P(coneG(0.55, 1.9, 7), SOLID_S, 0x9a978e, [0, 1.8, 0]),        // robed body
        P(sphereG(0.3, 7, 6), SOLID_S, 0xa8a49a, [0, 2.95, 0]),        // head
        P(coneG(0.34, 0.5, 6), SOLID_S, 0x9a978e, [0, 3.15, -0.08], 1, [0.4, 0, 0]), // hood
        P(cylG(0.1, 0.12, 1.0, 6), SOLID_S, 0x9a978e, [0.55, 2.2, 0.25], 1, [0.5, 0, -0.5]), // offering arm
        P(sphereG(0.2, 7, 6), GLOW_RUNE, 0xffe9b0, [0.8, 2.7, 0.55], 1, [0, 0, 0], 0, false), // held shard
      ],
    },
    // ------------------------------------------------------------- mountain / cold / fire
    ice_spike: {
      variants: 3, collider: 0.45, cluster: true,
      make: (rng) => [
        P(octaG(0.4), ICE, 0xcfe8ff, [0, 0.75, 0], [0.8, 2.6 + rng() * 1.6, 0.8], [(rng() - 0.5) * 0.2, rng() * TAU, (rng() - 0.5) * 0.2], 0.04),
        P(octaG(0.22), ICE, 0xdff2ff, [0.4, 0.35, 0.2], [0.8, 1.4, 0.8], [(rng() - 0.5) * 0.4, rng() * TAU, (rng() - 0.5) * 0.4], 0.04),
      ],
    },
    snow_pile: {
      variants: 3, collider: 0, noPathAvoid: true,
      make: (rng) => [
        P(blobG(1, 580, 0.18), SOLID_S, 0xf2f6fa, [0, 0.18, 0], [0.9, 0.32, 0.9], [0, rng() * TAU, 0], 0.02, false),
        P(blobG(1, 581, 0.18), SOLID_S, 0xe8eef6, [0.5, 0.12, 0.3], [0.5, 0.2, 0.5], [0, rng() * TAU, 0], 0.02, false),
      ],
    },
    lava_rock: {
      variants: 2, collider: 0.6,
      make: (rng) => [
        P(icoG(0.62, 0), SOLID, 0x3a3236, [0, 0.34, 0], [1, 0.75, 1], [rng() * 0.4, rng() * TAU, rng() * 0.4], 0.04),
        P(boxG(0.7, 0.05, 0.06), GLOW_LAVA, 0xff8a3c, [0, 0.5, 0.2], 1, [0.3, rng() * TAU, 0.5], 0, false),
        P(boxG(0.5, 0.05, 0.05), GLOW_LAVA, 0xffb85c, [0.1, 0.35, -0.2], 1, [-0.4, rng() * TAU, 0.3], 0, false),
      ],
    },
    ember_vent: {
      variants: 2, collider: 0.55,
      make: (rng) => [
        P(cylG(0.5, 0.75, 0.55, 8), SOLID, 0x4a4046, [0, 0.27, 0], 1, [0, rng() * TAU, 0]),
        P(cylG(0.3, 0.3, 0.1, 8), GLOW_LAVA, 0xff6a2c, [0, 0.56, 0], 1, [0, 0, 0], 0, false),
        P(icoG(0.2, 0), SOLID, 0x3a3236, [0.5, 0.12, 0.3], [1, 0.7, 1], [0, rng() * TAU, 0], 0.05, false),
      ],
      effect: (x, y, z, s, rng, ctx) => makeEmberVentFX(x, y, z, s, ctx),
    },
    // ------------------------------------------------------------- spire
    spire_wall: {
      variants: 2, collider: 2.2, sinkY: 0.2,
      make: (rng) => [
        P(boxG(4.2, 5.5, 0.8), SOLID_S, 0x2b2e3c, [0, 2.75, 0]),
        P(boxG(0.5, 6.4, 0.9), SOLID_S, 0x333748, [-2.1, 3.2, 0]),
        P(boxG(0.5, 6.4, 0.9), SOLID_S, 0x333748, [2.1, 3.2, 0]),
        P(coneG(0.36, 0.9, 4), SOLID_S, 0x3a3f52, [-2.1, 6.85, 0]),
        P(coneG(0.36, 0.9, 4), SOLID_S, 0x3a3f52, [2.1, 6.85, 0]),
        P(boxG(0.06, 4.6, 0.06), SPIRE_SEAM, 0xcfd4e8, [-1.0, 2.8, 0.42], 1, [0, 0, 0], 0, false),
        P(boxG(0.06, 3.8, 0.06), SPIRE_SEAM, 0xcfd4e8, [1.2, 2.5, 0.42], 1, [0, 0, 0.1], 0, false),
      ],
    },
    banner: {
      variants: 1, collider: 0.25,
      make: () => [
        P(cylG(0.05, 0.07, 3.2, 6), SOLID, 0x3a3f4a, [0, 1.6, 0]),
        P(boxG(0.9, 0.06, 0.06), SOLID, 0x3a3f4a, [0.42, 3.1, 0]),
        P(planeG(0.8, 1.9), CLOTH, 0x3f4458, [0.45, 2.1, 0], 1, [0, 0, 0], 0.03, false),
        P(cylG(0.22, 0.22, 0.015, 12), SPIRE_SEAM, 0xcfd4e8, [0.45, 2.3, 0.02], 1, [Math.PI / 2, 0, 0], 0, false),
        P(coneG(0.06, 0.2, 4), SOLID_S, 0xb8bccf, [0, 3.35, 0]),
      ],
    },
    // ------------------------------------------------------------- cave growth
    stalagmite: {
      variants: 3, collider: 0.45, cluster: true,
      make: (rng) => [
        P(coneG(0.42, 1.6 + rng() * 1.4, 6), SOLID, 0x6d6a72, [0, 0.8 + rng() * 0.6, 0], 1, [(rng() - 0.5) * 0.12, rng() * TAU, (rng() - 0.5) * 0.12], 0.05),
        P(coneG(0.24, 0.9, 5), SOLID, 0x767380, [0.42, 0.42, 0.2], 1, [(rng() - 0.5) * 0.3, rng() * TAU, (rng() - 0.5) * 0.3], 0.05),
      ],
    },
    stalactite: {
      variants: 3, collider: 0, ground: 'hang', hangH: [5, 8.5],
      make: (rng) => [
        P(coneG(0.36, 1.8 + rng() * 1.4, 6), SOLID, 0x64616c, [0, -0.9, 0], 1, [Math.PI, 0, rng() * 0.1], 0.05, false),
        P(coneG(0.18, 0.9, 5), SOLID, 0x6d6a72, [0.35, -0.45, 0.15], 1, [Math.PI, 0, 0.15], 0.05, false),
      ],
    },
    hangmoss: {
      variants: 3, collider: 0, ground: 'hang', hangH: [4.5, 7], noPathAvoid: true,
      make: (rng) => {
        const parts = [];
        const n = 4 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const a = rng() * TAU, r = rng() * 0.5;
          parts.push(P(planeG(0.16, 1.0 + rng() * 0.9), FROND, lerpColorHex(0x5c8a4a, 0x3f6b52, rng()),
            [Math.cos(a) * r, -0.6 - rng() * 0.4, Math.sin(a) * r], 1, [0, rng() * TAU, 0], 0.1, false));
        }
        return parts;
      },
    },
    // ------------------------------------------------------------- water structures
    dock: {
      variants: 1, collider: 0, ground: 'water', faceWater: true,
      surface: 'wood', surfaceRect: [1.0, 2.4], surfaceOff: [0, 2.3], // boards run +z from the shore

      make: (rng) => {
        const parts = [];
        for (let i = 0; i < 6; i++) {
          parts.push(P(boxG(1.7, 0.1, 0.72), SOLID, i % 2 ? 0x8a6a48 : 0x94765a, [0, 0.35, 0.4 + i * 0.75]));
        }
        for (let i = 0; i < 3; i++) {
          for (const s of [-1, 1]) {
            parts.push(P(cylG(0.08, 0.1, 1.1, 6), SOLID, 0x6b4a33, [s * 0.78, -0.1, 0.55 + i * 1.75]));
          }
        }
        parts.push(P(boxG(0.09, 0.5, 0.09), SOLID, 0x6b4a33, [0.7, 0.62, 4.1]));
        return parts;
      },
    },
    boat: {
      variants: 1, collider: 0.9, ground: 'water', faceWater: true,
      make: () => [],
      effect: (x, y, z, s, rng) => makeBoatFX(x, y, z, s, rng),
    },
    waterfall: {
      variants: 1, collider: 0, faceCenter: true,
      make: () => [],
      effect: (x, y, z, s, rng, ctx) => makeWaterfallFX(x, y, z, s, rng, ctx),
    },
  };

  // ---------------------------------------------------------- animated set-pieces
  const pulseLights = []; // {light, base, amp, speed, phase}

  function softDiscMaterial(colorHex, opts = {}) {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(colorHex) },
        uAlpha: { value: opts.alpha ?? 0.8 },
        uSize: { value: opts.size ?? 24 },
      },
      vertexShader: `
        attribute float aSeed;
        varying float vSeed;
        uniform float uSize;
        void main(){
          vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (0.6 + 0.4 * fract(aSeed * 7.13)) * (140.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uAlpha;
        varying float vSeed;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.08, d) * uAlpha;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    disposables.push({ mat: m });
    return m;
  }

  function makePoints(count, mat) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) seeds[i] = Math.random() * 100;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    disposables.push({ geo: g });
    return pts;
  }

  function makeCampfireFX(x, y, z, s) {
    const fx = new THREE.Group();
    fx.position.set(x, y, z);
    const flameMat = std('flame_core', { emissive: 0xff8a3c, emissiveIntensity: 2.2, rough: 1 });
    const flameMat2 = std('flame_tip', { emissive: 0xffd94f, emissiveIntensity: 2.6, rough: 1 });
    const f1 = new THREE.Mesh(coneG(0.28, 0.8, 6), flameMat); f1.position.y = 0.55;
    const f2 = new THREE.Mesh(coneG(0.16, 0.55, 5), flameMat2); f2.position.set(0.06, 0.75, 0.03);
    f1.castShadow = f2.castShadow = false;
    // instance colors are not used on plain meshes; tint via material is shared, fine
    fx.add(f1, f2);
    let light = null;
    if (lightBudget > 0) {
      lightBudget--;
      light = new THREE.PointLight(0xffa04a, 2.2, 11 * s, 2);
      light.position.y = 0.9;
      fx.add(light);
    }
    const embers = makePoints(14, softDiscMaterial(0xffb85c, { size: 10, alpha: 0.9 }));
    fx.add(embers);
    const epos = embers.geometry.attributes.position.array;
    const elife = new Float32Array(14);
    for (let i = 0; i < 14; i++) elife[i] = Math.random();
    fx.scale.setScalar(s);
    group.add(fx);
    let t = Math.random() * 10;
    return (dt) => {
      t += dt;
      const flick = 0.9 + Math.sin(t * 11) * 0.08 + Math.sin(t * 23.7) * 0.06;
      f1.scale.set(flick, 1.05 - (flick - 0.9), flick);
      f2.scale.setScalar(0.85 + Math.sin(t * 17 + 1) * 0.12);
      f1.rotation.y = t * 1.7; f2.rotation.y = -t * 2.3;
      if (light) light.intensity = 2.2 * flick;
      for (let i = 0; i < 14; i++) {
        elife[i] += dt * (0.5 + (i % 5) * 0.1);
        if (elife[i] > 1) elife[i] -= 1;
        const l = elife[i];
        const a = i * 2.4 + t * 0.4;
        epos[i * 3] = Math.cos(a) * 0.16 * (1 - l);
        epos[i * 3 + 1] = 0.45 + l * 1.5;
        epos[i * 3 + 2] = Math.sin(a) * 0.16 * (1 - l);
      }
      embers.geometry.attributes.position.needsUpdate = true;
      embers.material.uniforms.uAlpha.value = 0.85;
    };
  }

  function makeEmberVentFX(x, y, z, s, ctx) {
    if (ctx.count > 6) return null; // cap heavy vents when densely scattered
    const fx = new THREE.Group();
    fx.position.set(x, y, z);
    fx.scale.setScalar(s);
    const embers = makePoints(10, softDiscMaterial(0xff8a3c, { size: 9, alpha: 0.7 }));
    fx.add(embers);
    if (ctx.singles && lightBudget > 0) {
      lightBudget--;
      const l = new THREE.PointLight(0xff6a2c, 1.1, 6 * s, 2);
      l.position.y = 0.7;
      fx.add(l);
      pulseLights.push({ light: l, base: 1.1, amp: 0.35, speed: 0.9, phase: x });
    }
    group.add(fx);
    const epos = embers.geometry.attributes.position.array;
    const elife = new Float32Array(10);
    for (let i = 0; i < 10; i++) elife[i] = Math.random();
    let t = 0;
    return (dt) => {
      t += dt;
      for (let i = 0; i < 10; i++) {
        elife[i] += dt * 0.4;
        if (elife[i] > 1) elife[i] -= 1;
        const l = elife[i];
        epos[i * 3] = Math.sin(i * 3.1 + t) * 0.12 * l;
        epos[i * 3 + 1] = 0.55 + l * 2.0;
        epos[i * 3 + 2] = Math.cos(i * 2.3 + t * 0.8) * 0.12 * l;
      }
      embers.geometry.attributes.position.needsUpdate = true;
    };
  }

  function makeBoatFX(x, y, z, s, rng) {
    const fx = new THREE.Group();
    fx.position.set(x, y, z);
    fx.scale.setScalar(s);
    const hullM = std('boat_hull', { rough: 0.85 });
    const mk = (g, tint, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      const me = new THREE.Mesh(g, hullM);
      me.position.set(px, py, pz); me.rotation.set(rx, ry, rz); me.scale.set(sx, sy, sz);
      me.castShadow = true;
      // per-mesh tint via material clone would defeat caching; use vertex-less color trick:
      fx.add(me);
      return me;
    };
    // simple lapstrake hull from curved boxes
    mk(boxG(0.9, 0.3, 2.6), 0, 0, 0.2, 0);
    mk(boxG(1.1, 0.14, 2.9), 0, 0, 0.36, 0);
    mk(boxG(0.6, 0.22, 0.5), 0, 0, 0.34, 1.45, 0.5);
    mk(boxG(0.6, 0.22, 0.5), 0, 0, 0.34, -1.45, -0.5);
    mk(boxG(0.85, 0.08, 0.3), 0, 0, 0.46, 0.4);       // bench
    mk(cylG(0.03, 0.04, 1.4, 5), 0, 0.35, 0.5, -0.6, 0.4, 0, 0.9); // oar
    group.add(fx);
    const phase = rng() * TAU;
    let t = 0;
    return (dt) => {
      t += dt;
      fx.position.y = y + Math.sin(t * 0.9 + phase) * 0.045;
      fx.rotation.z = Math.sin(t * 0.7 + phase) * 0.03;
      fx.rotation.x = Math.sin(t * 0.55 + phase + 1) * 0.02;
    };
  }

  function makeWaterfallFX(x, y, z, s, rng, ctx) {
    const fx = new THREE.Group();
    fx.position.set(x, y, z);
    fx.rotation.y = ctx.yaw ?? 0;
    fx.scale.setScalar(s);
    const W = 3.2, H = 6.5;
    const sheetMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uTop: { value: new THREE.Color(0xcfe8ff) },
        uBot: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float uTime;
        void main(){
          vUv = uv;
          vec3 p = position;
          p.x += sin(uv.y * 9.0 + uTime * 2.0) * 0.06 * (1.0 - uv.y);
          p.z += sin(uv.y * 7.0 - uTime * 1.6) * 0.05;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime; uniform vec3 uTop; uniform vec3 uBot;
        float band(float v, float n, float sp){ return smoothstep(0.35, 0.9, fract(v * n - uTime * sp)); }
        void main(){
          float streaks = 0.45 + 0.3 * band(vUv.y + sin(vUv.x * 21.0) * 0.03, 6.0, 0.9)
                               + 0.25 * band(vUv.y + sin(vUv.x * 13.0 + 2.0) * 0.05, 11.0, 1.4);
          float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          float foamTop = smoothstep(0.93, 1.0, vUv.y) * 0.5;
          float foamBot = smoothstep(0.14, 0.0, vUv.y) * 0.8;
          vec3 col = mix(uBot, uTop, vUv.y) * streaks + vec3(foamTop + foamBot);
          float a = edge * (0.55 + 0.35 * streaks + foamBot);
          gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
        }`,
    });
    disposables.push({ mat: sheetMat });
    const sheet = new THREE.Mesh(planeG(W, H, 1, 8), sheetMat);
    sheet.position.set(0, H / 2, 0);
    sheet.rotation.x = 0.06;
    fx.add(sheet);
    // rocky lip + base stones
    const lip = new THREE.Mesh(boxG(W + 0.8, 0.6, 0.8), SOLID);
    lip.position.set(0, H + 0.2, -0.35);
    lip.castShadow = true;
    fx.add(lip);
    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(icoG(0.4, 0), SOLID);
      st.position.set((rng() - 0.5) * W, 0.15, 0.5 + rng() * 0.5);
      st.scale.y = 0.6;
      st.rotation.y = rng() * TAU;
      fx.add(st);
    }
    // foam pool
    const foamMat = std('wf_foam', { transparent: true, opacity: 0.55, emissive: 0xdff2ff, emissiveIntensity: 0.25, rough: 0.4 });
    const foam = new THREE.Mesh(cylG(W * 0.55, W * 0.62, 0.12, 12), foamMat);
    foam.position.set(0, 0.1, 0.35);
    fx.add(foam);
    // mist
    const mist = makePoints(26, softDiscMaterial(0xe8f4ff, { size: 30, alpha: 0.22 }));
    fx.add(mist);
    const mpos = mist.geometry.attributes.position.array;
    const mlife = new Float32Array(26);
    for (let i = 0; i < 26; i++) mlife[i] = Math.random();
    group.add(fx);
    let t = rng() * 10;
    return (dt) => {
      t += dt;
      sheetMat.uniforms.uTime.value = t;
      foam.rotation.y = t * 0.35;
      for (let i = 0; i < 26; i++) {
        mlife[i] += dt * 0.35;
        if (mlife[i] > 1) mlife[i] -= 1;
        const l = mlife[i];
        const a = i * 1.7;
        mpos[i * 3] = Math.cos(a + t * 0.2) * (0.5 + l * W * 0.5);
        mpos[i * 3 + 1] = 0.2 + l * 1.6;
        mpos[i * 3 + 2] = 0.3 + Math.sin(a - t * 0.15) * 0.8 * l;
      }
      mist.geometry.attributes.position.needsUpdate = true;
    };
  }

  // ------------------------------------------------------------- scatter engine
  function lerpColorHex(a, b, t) {
    _col.set(a);
    const c2 = new THREE.Color(b);
    _col.lerp(c2, t);
    return _col.getHex();
  }

  function scatterPositions(entry, def, rngS) {
    const [ax, az, ar] = entry.area ?? [0, 0, half * 0.8];
    const density = entry.density ?? 0.3;
    const target = clamp(Math.round(density * Math.PI * ar * ar / 22), 1, 380);
    const out = [];
    // cluster centers for grove-like kinds
    const centers = [];
    if (def.cluster) {
      const k = Math.max(1, Math.round(target / 6));
      for (let i = 0; i < k; i++) {
        const a = rngS() * TAU, r = Math.sqrt(rngS()) * ar * 0.85;
        centers.push([ax + Math.cos(a) * r, az + Math.sin(a) * r]);
      }
    }
    let attempts = 0;
    while (out.length < target && attempts < target * 6) {
      attempts++;
      let x, z;
      if (centers.length) {
        const c = centers[Math.floor(rngS() * centers.length)];
        const a = rngS() * TAU, r = Math.pow(rngS(), 0.7) * ar * 0.28;
        x = c[0] + Math.cos(a) * r; z = c[1] + Math.sin(a) * r;
      } else {
        const a = rngS() * TAU, r = Math.sqrt(rngS()) * ar;
        x = ax + Math.cos(a) * r; z = az + Math.sin(a) * r;
      }
      if (Math.abs(x) > half - 2 || Math.abs(z) > half - 2) continue;
      const pi = pathInfo(x, z);
      if (!def.noPathAvoid && pi.d < pi.w * 0.5 + 0.6) continue;
      if (def.pathRing && paths.length) {
        // flowers & grass love path edges: probabilistic pull toward the verge
        const verge = pi.d > pi.w * 0.5 + 0.2 && pi.d < pi.w * 0.5 + 2.8;
        if (!verge && rngS() < 0.45) continue;
      }
      if (def.ground === 'water') {
        if (!water || !inWater(x, z)) continue;
      } else if (def.ground !== 'hang') {
        if (inWater(x, z) && entry.kind !== 'reeds') continue;
        if (entry.kind === 'reeds' && water) {
          const yv = terrainY(x, z);
          if (Math.abs(yv - water.level) > 0.5) continue; // shoreline only
        }
      }
      out.push([x, z]);
    }
    return out;
  }

  function placementY(kind, def, x, z, rngS) {
    if (def.ground === 'water') return (water?.level ?? 0) + (kind === 'lilypad' ? 0.03 : 0.05);
    if (def.ground === 'hang') {
      const [lo, hi] = def.hangH ?? [5, 8];
      return terrainY(x, z) + lo + rngS() * (hi - lo);
    }
    return terrainY(x, z) - (def.sinkY ?? 0.04);
  }

  function yawFor(entry, def, x, z, rngS) {
    if (entry.rot !== undefined) return entry.rot;
    if (def.faceWater && water) return Math.atan2(water.pos[0] - x, water.pos[1] - z) === 0 ? 0 : Math.atan2(water.pos[0] - x, water.pos[1] - z);
    if (def.faceCenter) return Math.atan2(-x, -z) + (rngS() - 0.5) * 0.35;
    return rngS() * TAU;
  }

  function realize(kind, placements, entry, rngS, singles) {
    const def = KINDS[kind];
    if (!def) { warnOnce(`unknown prop kind "${kind}" — skipped`); return; }
    if (!placements.length) return;
    const variants = def.variants ?? 1;
    const buckets = Array.from({ length: variants }, () => []);
    placements.forEach((pl, i) => buckets[i % variants].push(pl));
    const ctx = { count: 0, singles, yaw: 0 };

    for (let v = 0; v < buckets.length; v++) {
      const bucket = buckets[v];
      if (!bucket.length) continue;
      const brng = seededRandom(seed * 31 + hashStr(kind) + v * 977);
      const parts = def.make(brng);
      // Pre-bake local matrices once per part.
      const locals = parts.map((p) => {
        const sc = typeof p.scl === 'number' ? [p.scl, p.scl, p.scl] : p.scl;
        _eul.set(p.rot[0], p.rot[1], p.rot[2]);
        return new THREE.Matrix4().compose(
          _pos.set(p.off[0], p.off[1], p.off[2]),
          _quat.setFromEuler(_eul),
          _scl.set(sc[0], sc[1], sc[2]),
        );
      });
      for (let pi = 0; pi < parts.length; pi++) {
        const part = parts[pi];
        const im = new THREE.InstancedMesh(part.g, part.m, bucket.length);
        im.castShadow = part.shadow !== false;
        im.receiveShadow = true;
        for (let i = 0; i < bucket.length; i++) {
          const pl = bucket[i]; // {x, z, y, yaw, s, rng}
          _eul.set(0, pl.yaw, 0);
          _m4.compose(_pos.set(pl.x, pl.y, pl.z), _quat.setFromEuler(_eul), _scl.set(pl.s, pl.sy ?? pl.s, pl.s));
          _m4b.multiplyMatrices(_m4, locals[pi]);
          im.setMatrixAt(i, _m4b);
          // Per-instance hue/light jitter around the part tint.
          _col.set(part.tint);
          if (part.jit > 0) _col.offsetHSL((pl.hueJ) * part.jit, 0, (pl.lumJ) * part.jit);
          im.setColorAt(i, _col);
        }
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        group.add(im);
      }
      // Colliders + effects per placement.
      for (const pl of bucket) {
        if (def.collider) colliders.push({ x: pl.x, z: pl.z, r: def.collider * pl.s });
        if (def.surface) {
          // oriented footstep-surface rectangle (see file header)
          const [shx, shz] = def.surfaceRect ?? [1, 1];
          const [ox, oz] = def.surfaceOff ?? [0, 0];
          const cos = Math.cos(pl.yaw), sin = Math.sin(pl.yaw);
          const hx = shx * pl.s, hz = shz * pl.s;
          surfacePatches.push({
            x: pl.x + (ox * cos + oz * sin) * pl.s,
            z: pl.z + (-ox * sin + oz * cos) * pl.s,
            hx, hz, cos, sin, r2: hx * hx + hz * hz, surface: def.surface,
          });
        }
        if (def.effect) {
          ctx.count++;
          ctx.yaw = pl.yaw;
          const up = def.effect(pl.x, pl.y, pl.z, pl.s, seededRandom(hashStr(kind) + Math.round(pl.x * 10) * 31 + Math.round(pl.z * 10)), ctx);
          if (up) updaters.push(up);
        }
      }
    }
  }

  // ------------------------------------------------------------- run placement
  const byKindScatter = new Map(); // kind -> [{x,z,y,yaw,s,...}]
  const byKindSingle = new Map();

  for (const entry of (zone.props ?? [])) {
    const def = KINDS[entry.kind];
    if (!def) { warnOnce(`unknown prop kind "${entry.kind}" — skipped`); continue; }
    const eRng = seededRandom(seed * 13 + hashStr(entry.kind) + Math.round((entry.at?.[0] ?? entry.area?.[0] ?? 0) * 7));
    if (entry.at) {
      const [x, z] = entry.at;
      const s = (entry.scale ?? 1);
      const pl = {
        x, z, y: placementY(entry.kind, def, x, z, eRng),
        yaw: yawFor(entry, def, x, z, eRng), s,
        sy: s * (1 + (eRng() - 0.5) * 0.06),
        hueJ: (eRng() - 0.5) * 2, lumJ: (eRng() - 0.5) * 2,
      };
      if (!byKindSingle.has(entry.kind)) byKindSingle.set(entry.kind, []);
      byKindSingle.get(entry.kind).push(pl);
    } else {
      const pts = scatterPositions(entry, def, eRng);
      const list = byKindScatter.get(entry.kind) ?? [];
      for (const [x, z] of pts) {
        const s = (entry.scale ?? 1) * (0.8 + eRng() * 0.5);
        list.push({
          x, z, y: placementY(entry.kind, def, x, z, eRng),
          yaw: yawFor(entry, def, x, z, eRng), s,
          sy: s * (1 + (eRng() - 0.5) * 0.14),
          hueJ: (eRng() - 0.5) * 2, lumJ: (eRng() - 0.5) * 2,
        });
      }
      byKindScatter.set(entry.kind, list);
    }
  }
  for (const [kind, list] of byKindScatter) realize(kind, list, null, null, false);
  for (const [kind, list] of byKindSingle) realize(kind, list, null, null, true);

  // ------------------------------------------------------------- master updater
  let T = Math.random() * 100;
  updaters.push((dt) => {
    T += dt;
    for (let i = 0; i < pulseMats.length; i++) {
      const p = pulseMats[i];
      p.m.emissiveIntensity = p.base + Math.sin(T * p.speed + p.phase) * p.amp * p.base;
    }
    const night = 1 - daylight(G.calendar?.dayTime ?? 0.5);
    const nightSoft = night * night * (3 - 2 * night);
    for (let i = 0; i < nightMats.length; i++) {
      const nm = nightMats[i];
      nm.m.emissiveIntensity = nm.base * (0.06 + 0.94 * nightSoft);
    }
    for (let i = 0; i < nightLights.length; i++) {
      const nl = nightLights[i];
      nl.light.intensity = nl.base * nightSoft * (0.92 + Math.sin(T * 6 + nl.phase) * 0.08);
    }
    for (let i = 0; i < pulseLights.length; i++) {
      const p = pulseLights[i];
      p.light.intensity = p.base + Math.sin(T * p.speed + p.phase) * p.amp;
    }
  });

  function dispose() {
    group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); // frees instance attribute buffers
    for (const d of disposables) {
      if (d.geo) d.geo.dispose();
      if (d.mat) d.mat.dispose();
      if (d.fn) d.fn();
    }
    geoCache.clear();
    matCache.clear();
    pulseMats.length = nightMats.length = nightLights.length = pulseLights.length = 0;
    updaters.length = 0;
    surfacePatches.length = 0;
    group.clear();
  }

  return { group, colliders, updaters, surfacePatches, dispose };
}
