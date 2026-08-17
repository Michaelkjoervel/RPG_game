// npcs.js — visible, stylized human NPCs: villagers, Keepers, the Order, and
// the named cast. Idle life (breath, head turns), gentle wander, face-the-
// player courtesy, "!" battle-ready markers, and story hand-off on interact.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createNpcs(zone, world) ->
//     { update(dt), tryInteract(playerPos, faceDir) -> bool,
//       nearestPrompt(playerPos) -> {text}|null, colliders, dispose() }
//
// Data flow: zone.npcs = [{ id, at:[x,z], face }] places instances; the actual
// character definitions ({ id, name, kind, appearance?, wanderRadius, battle? })
// live in src/data/npcs.js (story area) and are resolved via a dynamic
// `import('../data/npcs.js')` — per the brief, that module is fetched
// asynchronously. Because this factory must return synchronously, NPC bodies
// are built the instant that import resolves (a same-tick microtask in
// practice) rather than before. `colliders` is the SAME array reference for
// the module's whole lifetime, populated in place as bodies come online, so
// any caller holding a live reference (not a one-time spread copy) sees NPCs
// become solid automatically. We also expose a non-contract `ready` promise
// (resolves once bodies exist) for an integrator that prefers to await it.
//
// Silhouettes: the bible pins exact looks for the five Keepers, Archon Sol,
// and the Order Seekers — those are hand-built by npc id (ID_OVERRIDES).
// Everyone else is generated from a kind-driven archetype + a deterministic
// per-id palette, so every NPC reads as intentional even without bespoke art.
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { G, hasFlag } from '../core/state.js';
import { clamp, damp, dampAngle, lerp, TAU } from '../core/math.js';
import { hashStr, seededRandom } from '../core/rng.js';
import { windSway, disposeGroup } from '../gfx/materials.js';

const INTERACT_RADIUS = 2.3;
const INTERACT_CONE = Math.cos((50 * Math.PI) / 180); // half-angle cutoff -> ~100deg total talk cone
const FACE_PLAYER_RADIUS = 4.5;
const GOLD = 0xffe9b0;

const warned = new Set();
const warnOnce = (msg) => { if (!warned.has(msg)) { warned.add(msg); console.warn('[npcs]', msg); } };

// ---------------------------------------------------------------- shared caches
const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
function stdMat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color, flatShading: opts.flat !== false, roughness: opts.rough ?? 0.8, metalness: opts.metal ?? 0,
    emissive: new THREE.Color(opts.emissive ?? 0x000000), emissiveIntensity: opts.ei ?? 1,
    transparent: !!opts.transparent, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide,
  });
  if (opts.sway) { try { windSway(m, { strength: opts.sway }); } catch (e) { warnOnce('windSway unavailable: ' + e.message); } }
  return m;
}
function mesh(g, m, shadow = true) { const me = new THREE.Mesh(g, m); me.castShadow = shadow; me.receiveShadow = false; return me; }

// ---------------------------------------------------------------- deterministic per-id palette
const HAIR_POOL = [0x3a2a20, 0x6b4a33, 0x2a2422, 0xb06a3c, 0x8a7050, 0xd8c8a0, 0x4a3830];
const ROBE_POOL = [0x6a5a8a, 0x4a7ac2, 0xc2865a, 0x5c8a6a, 0x8a5a6a, 0x7a7a5c, 0x5a6a8a];
const SKIN_POOL = [0xf6c9a0, 0xe0ac7c, 0xc98858, 0xf0d4b0, 0xd9a878];

function idRng(id) { return seededRandom(hashStr(id || 'npc')); }

function basePalette(id) {
  const r = idRng(id);
  return {
    skin: SKIN_POOL[Math.floor(r() * SKIN_POOL.length)],
    hair: HAIR_POOL[Math.floor(r() * HAIR_POOL.length)],
    primary: ROBE_POOL[Math.floor(r() * ROBE_POOL.length)],
    secondary: ROBE_POOL[Math.floor(r() * ROBE_POOL.length)],
    accent: GOLD,
  };
}

// ---------------------------------------------------------------- humanoid builder
/**
 * spec: { height, build:'slim'|'avg'|'broad', skin, hair, primary, secondary,
 *         accent, hat:'none'|'hood'|'straw'|'mask'|'circlet'|'goggles',
 *         cape:false|color, stoop:0..1, special(ctx) }
 * Returns { group, refs } — refs are the animation handles this module drives.
 */
function buildHuman(spec) {
  const h = spec.height ?? 1.6;
  const wide = spec.build === 'broad' ? 1.22 : spec.build === 'slim' ? 0.86 : 1;
  const skinM = stdMat(spec.skin, { rough: 0.65 });
  const hairM = stdMat(spec.hair, { rough: 0.8 });
  const eyeM = stdMat(0x2a2420, { rough: 0.3 });
  const primaryM = stdMat(spec.primary, { rough: 0.9 });
  const secondaryM = stdMat(spec.secondary, { rough: 0.85 });
  const accentM = stdMat(spec.accent ?? GOLD, { rough: 0.4, metal: 0.3, emissive: spec.accent ?? GOLD, ei: 0.25 });

  const group = new THREE.Group();
  const rig = new THREE.Group(); // idle bob / breath / stoop lives here
  group.add(rig);

  const legLen = h * 0.42, torsoLen = h * 0.34, headR = h * 0.115;
  const hipY = legLen;

  const hips = new THREE.Group();
  hips.position.y = hipY;
  rig.add(hips);

  function buildLeg(sx) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.09 * wide, 0, 0);
    const m1 = mesh(geo(`leg_${legLen.toFixed(2)}_${wide.toFixed(2)}`, () => new THREE.CapsuleGeometry(0.075 * wide, legLen * 0.72, 3, 6)), secondaryM);
    m1.position.y = -legLen * 0.42;
    leg.add(m1);
    const boot = mesh(geo('npc_boot', () => new THREE.BoxGeometry(0.1, 0.08, 0.2)), hairM, true);
    boot.position.set(0, -legLen + 0.04, 0.04);
    leg.add(boot);
    hips.add(leg);
    return leg;
  }
  const legL = buildLeg(-1), legR = buildLeg(1);

  const torso = new THREE.Group();
  hips.add(torso);
  const torsoMesh = mesh(geo(`torso_${torsoLen.toFixed(2)}_${wide.toFixed(2)}`, () => new THREE.CapsuleGeometry(0.155 * wide, torsoLen * 0.62, 4, 8)), primaryM);
  torsoMesh.position.y = torsoLen * 0.55;
  torso.add(torsoMesh);
  const belt = mesh(geo(`npc_belt_${wide.toFixed(2)}`, () => new THREE.CylinderGeometry(0.165 * wide, 0.165 * wide, 0.06, 9)), accentM, false);
  belt.position.y = torsoLen * 0.16;
  torso.add(belt);

  function buildArm(sx) {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.2 * wide, torsoLen * 0.82, 0);
    const m1 = mesh(geo(`arm_${wide.toFixed(2)}`, () => new THREE.CapsuleGeometry(0.055 * wide, 0.42, 3, 6)), primaryM);
    m1.position.y = -0.24;
    arm.add(m1);
    const hand = mesh(geo('npc_hand', () => new THREE.SphereGeometry(0.05, 6, 5)), skinM, false);
    hand.position.y = -0.46;
    arm.add(hand);
    torso.add(arm);
    return { pivot: arm, hand };
  }
  const armL = buildArm(-1), armR = buildArm(1);

  const headGrp = new THREE.Group();
  headGrp.position.y = torsoLen * 1.05;
  torso.add(headGrp);
  const head = mesh(geo(`head_${headR.toFixed(3)}`, () => new THREE.SphereGeometry(headR, 10, 8)), skinM);
  headGrp.add(head);
  const browL = mesh(geo('npc_brow', () => new THREE.BoxGeometry(0.045, 0.012, 0.012)), hairM, false);
  browL.position.set(-0.032, 0.02, headR * 0.92);
  const browR = browL.clone(); browR.position.x = 0.032;
  headGrp.add(browL, browR);
  const eyeGeo = geo('npc_eye', () => new THREE.SphereGeometry(0.014, 6, 5));
  const eyeL = mesh(eyeGeo, eyeM, false); eyeL.position.set(-0.032, -0.005, headR * 0.94);
  const eyeR = mesh(eyeGeo, eyeM, false); eyeR.position.set(0.032, -0.005, headR * 0.94);
  headGrp.add(eyeL, eyeR);

  const hairMesh = mesh(geo(`hair_${headR.toFixed(3)}`, () => new THREE.SphereGeometry(headR * 1.08, 8, 6, 0, TAU, 0, Math.PI * 0.62)), hairM, false);
  hairMesh.position.y = headR * 0.28;
  headGrp.add(hairMesh);

  // ---- hat / headwear
  let hatMesh = null;
  if (spec.hat === 'hood') {
    hatMesh = mesh(geo('hat_hood', () => new THREE.ConeGeometry(headR * 1.35, headR * 2.1, 8)), secondaryM, false);
    hatMesh.position.y = headR * 0.35;
  } else if (spec.hat === 'straw') {
    hatMesh = new THREE.Group();
    const brim = mesh(geo('hat_brim', () => new THREE.CylinderGeometry(headR * 1.9, headR * 1.9, 0.02, 12)), accentM, false);
    const top = mesh(geo('hat_top', () => new THREE.ConeGeometry(headR * 1.1, headR * 1.1, 10)), accentM, false);
    top.position.y = headR * 0.55;
    hatMesh.add(brim, top);
    hatMesh.position.y = headR * 0.85;
  } else if (spec.hat === 'mask') {
    hatMesh = mesh(geo('hat_mask', () => new THREE.CircleGeometry(headR * 0.82, 10)), stdMat(0xdedad2, { rough: 0.5, emissive: 0xdedad2, ei: 0.06 }), false);
    hatMesh.position.set(0, -0.01, headR * 0.96);
    const hood = mesh(geo('hat_hood2', () => new THREE.SphereGeometry(headR * 1.22, 8, 6, 0, TAU, 0, Math.PI * 0.55)), secondaryM, false);
    hood.position.y = headR * 0.3;
    hatMesh.add(hood);
  } else if (spec.hat === 'circlet') {
    hatMesh = mesh(geo('hat_circlet', () => new THREE.TorusGeometry(headR * 0.98, 0.012, 6, 14)), accentM, false);
    hatMesh.rotation.x = Math.PI / 2;
    hatMesh.position.y = headR * 0.62;
  } else if (spec.hat === 'goggles') {
    hatMesh = new THREE.Group();
    const band = mesh(geo('hat_band', () => new THREE.TorusGeometry(headR * 1.0, 0.012, 6, 14)), hairM, false);
    band.rotation.y = Math.PI / 2;
    const lensGeo = geo('hat_lens', () => new THREE.CircleGeometry(headR * 0.32, 10));
    const lensM = stdMat(0xbfe4ff, { rough: 0.2, metal: 0.4, transparent: true, opacity: 0.85, emissive: 0xbfe4ff, ei: 0.2 });
    const lL = mesh(lensGeo, lensM, false); lL.position.set(-headR * 0.4, 0.02, headR * 0.9);
    const lR = mesh(lensGeo, lensM, false); lR.position.set(headR * 0.4, 0.02, headR * 0.9);
    hatMesh.add(band, lL, lR);
  }
  if (hatMesh) headGrp.add(hatMesh);

  // ---- cape
  let cape = null;
  if (spec.cape) {
    const capeM = stdMat(spec.cape === true ? spec.secondary : spec.cape, { rough: 1, side: THREE.DoubleSide, sway: 0.5 });
    cape = mesh(geo(`cape_${torsoLen.toFixed(2)}_${wide.toFixed(2)}`, () => new THREE.PlaneGeometry(0.3 * wide, torsoLen * 1.05, 1, 4)), capeM, true);
    cape.position.set(0, torsoLen * 0.62, -0.1 * wide);
    cape.rotation.x = 0.15;
    torso.add(cape);
  }

  const ctx = { group, rig, hips, torso, headGrp, legL, legR, armL, armR, wide, height: h, materials: { skinM, hairM, primaryM, secondaryM, accentM } };
  if (typeof spec.special === 'function') spec.special(ctx);

  group.name = 'npc';
  return {
    group,
    refs: { rig, hips, torso, headGrp, legL, legR, armL, armR },
    special: ctx.extra ?? [],
  };
}

// ---------------------------------------------------------------- kind archetypes
// Real appearance shape (docs/ARCHITECTURE.md + observed data/npcs.js):
//   { palette:[primaryHex, secondaryHex], hat?, hood?:bool, mask?:string,
//     robe?:bool|string, build?:'slight'|'lean'|'avg'|'stocky'|'broad'|'heavy',
//     accessory?:string (free text), accent?:string (free text), hair?:string (style, not a color) }
// Only numeric fields are ever treated as colors — free-text descriptors are
// read for the id-keyed bespoke overrides below, never guessed at generically.
const BUILD_MAP = { slight: 'slim', lean: 'slim', avg: 'avg', average: 'avg', stocky: 'broad', broad: 'broad', heavy: 'broad' };

function archetypeFor(id, kind, appearance) {
  const p = basePalette(id);
  const a = appearance || {};
  const pal = Array.isArray(a.palette) ? a.palette : null;
  const num = (v, fb) => (typeof v === 'number' ? v : fb);
  const skin = num(a.skin, p.skin);
  const hair = p.hair; // appearance.hair is a style descriptor ("silver","tousled"), not a color
  const primary = num(pal?.[0], num(a.primary, p.primary));
  const secondary = num(pal?.[1], num(a.secondary, p.secondary));
  const accent = num(pal?.[2], num(a.accentColor, GOLD));
  let hatFromData = a.hat ?? (a.hood ? 'hood' : a.mask ? 'mask' : undefined);
  const build = BUILD_MAP[a.build] ?? 'avg';

  const base = { skin, hair, primary, secondary, accent, height: 1.6, build, hat: 'none', cape: false };

  switch (kind) {
    case 'seeker':
      return { ...base, primary: num(pal?.[0], 0x5c5c66), secondary: num(pal?.[1], 0x46464e), accent: 0xdedad2, hat: hatFromData ?? 'mask', cape: 0x40404a };
    case 'keeper':
      return { ...base, hat: hatFromData ?? 'none', cape: base.secondary };
    case 'rival':
      return { ...base, build: BUILD_MAP[a.build] ?? 'slim', hat: hatFromData ?? 'none' };
    case 'merchant':
      return { ...base, hat: hatFromData ?? 'straw' };
    case 'villager':
    default:
      return { ...base, hat: hatFromData ?? 'none', cape: false };
  }
}

// ---------------------------------------------------------------- bespoke silhouettes (bible-pinned)
function pauldron(ctx, side = 1) {
  const rockM = stdMat(0x8d8a84, { rough: 0.95 });
  const p = mesh(geo('pauldron', () => new THREE.IcosahedronGeometry(0.12, 0)), rockM);
  p.position.set(side * 0.21 * ctx.wide, ctx.torso.children[0].position.y + 0.14, 0);
  p.scale.set(1, 0.7, 0.9);
  ctx.torso.add(p);
}
function antlerCirclet(ctx) {
  const antlerM = stdMat(0xe8dcc2, { rough: 0.5, emissive: 0x6fce5c, ei: 0.08 });
  for (const side of [-1, 1]) {
    const horn = mesh(geo('antler', () => new THREE.ConeGeometry(0.02, 0.22, 5)), antlerM, false);
    horn.position.set(side * 0.06, ctx.headGrp.position.y + 0.1, -0.01);
    horn.rotation.z = side * -0.35;
    horn.rotation.x = -0.2;
    ctx.torso.add(horn);
  }
}
function lantern(ctx, side = 1) {
  const grp = new THREE.Group();
  const cage = mesh(geo('lantern_cage', () => new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6, 1, true)), stdMat(0x3a3f4a, { rough: 0.7 }), false);
  const glow = mesh(geo('lantern_glow', () => new THREE.SphereGeometry(0.035, 6, 5)), stdMat(0xffd9a0, { emissive: 0xffd9a0, ei: 1.4 }), false);
  grp.add(cage, glow);
  const light = new THREE.PointLight(0xffd9a0, 0.9, 4, 2);
  grp.add(light);
  grp.position.set(side * 0.24 * ctx.wide, ctx.torso.children[0].position.y - 0.15, 0.1);
  ctx.torso.add(grp);
  ctx.extra = (ctx.extra ?? []).concat([{ type: 'lantern', node: grp, glow, light }]);
}
function crackedHalo(ctx) {
  const haloM = stdMat(GOLD, { emissive: GOLD, ei: 1.3, rough: 0.3, transparent: true, opacity: 0.92 });
  const halo = mesh(geo('halo', () => new THREE.TorusGeometry(0.16, 0.014, 6, 20, Math.PI * 1.5)), haloM, false);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = ctx.headGrp.position.y + 0.24;
  ctx.torso.add(halo);
  const light = new THREE.PointLight(GOLD, 1.0, 4.5, 2);
  light.position.y = ctx.headGrp.position.y + 0.24;
  ctx.torso.add(light);
  ctx.extra = (ctx.extra ?? []).concat([{ type: 'halo', node: halo }]);
}
function coatTails(ctx) {
  const coatM = stdMat(0x5a6a7a, { rough: 0.95, side: THREE.DoubleSide, sway: 0.75 });
  for (const side of [-1, 1]) {
    const tail = mesh(geo('coattail', () => new THREE.PlaneGeometry(0.14, 0.5, 1, 3)), coatM, false);
    tail.position.set(side * 0.13 * ctx.wide, ctx.torso.children[0].position.y - 0.08, -0.11);
    tail.rotation.x = 0.2;
    ctx.torso.add(tail);
  }
}
function fisherCoat(ctx) {
  const coatM = stdMat(0x3a5a68, { rough: 0.9, side: THREE.DoubleSide, sway: 0.35 });
  const coat = mesh(geo('fisher_coat', () => new THREE.CylinderGeometry(0.22, 0.3, 0.5, 9, 1, true)), coatM, false);
  coat.position.y = ctx.torso.children[0].position.y - 0.18;
  ctx.torso.add(coat);
}

const ID_OVERRIDES = {
  keeper_bramwell: (kind, a) => ({ ...archetypeFor('keeper_bramwell', 'keeper', a), primary: 0x6a5a44, secondary: 0x4a7a52, build: 'broad', special: (ctx) => pauldron(ctx, 1) }),
  keeper_liora: (kind, a) => ({ ...archetypeFor('keeper_liora', 'keeper', a), primary: 0x4f9e4f, secondary: 0xffe9b0, hat: 'circlet', special: (ctx) => antlerCirclet(ctx) }),
  keeper_maro: (kind, a) => ({ ...archetypeFor('keeper_maro', 'keeper', a), primary: 0x2e6a7a, secondary: 0x1f4a56, special: (ctx) => { fisherCoat(ctx); lantern(ctx, 1); } }),
  keeper_sera: (kind, a) => ({ ...archetypeFor('keeper_sera', 'keeper', a), primary: 0x5a6478, secondary: 0xffd94f, hat: 'goggles', special: (ctx) => coatTails(ctx) }),
  archon_sol: (kind, a) => ({ ...archetypeFor('archon_sol', 'keeper', a), primary: 0xf4efe0, secondary: GOLD, accent: GOLD, height: 1.78, cape: 0xffe9b0, special: (ctx) => crackedHalo(ctx) }),
  // skin/hair are pinned rather than left to basePalette()'s id hash: the rival's look is
  // established art, and it must not silently reroll just because the id string changed.
  bryn: (kind, a) => ({ ...archetypeFor('bryn', 'rival', a), build: 'slim', skin: 0xf0d4b0, hair: 0x4a3830 }),
  elder_maren: (kind, a) => ({ ...archetypeFor('elder_maren', 'villager', a), primary: 0x6a5a8a, secondary: 0xead9bd, hat: 'none', height: 1.5, build: 'slim' }),
  lt_vess: (kind, a) => ({ ...archetypeFor('lt_vess', 'seeker', a), primary: 0x3a4a5c, secondary: 0xa8d8ff, accent: 0xa8d8ff, hat: 'hood' }),
  lt_dorn: (kind, a) => ({ ...archetypeFor('lt_dorn', 'seeker', a), primary: 0x7a4a34, secondary: 0xc9995c, build: 'broad', hat: 'none', special: (ctx) => pauldron(ctx, -1) }),
  lanternkeeper_ode: (kind, a) => ({ ...archetypeFor('lanternkeeper_ode', 'villager', a), primary: 0x5a4a34, special: (ctx) => lantern(ctx, 1) }),
  merchant_wren: (kind, a) => ({ ...archetypeFor('merchant_wren', 'merchant', a), primary: 0x3a6a7a }),
  ferryman_juno: (kind, a) => ({ ...archetypeFor('ferryman_juno', 'villager', a), primary: 0x4a5a6a, hat: 'straw' }),
  herbalist_syl: (kind, a) => ({ ...archetypeFor('herbalist_syl', 'villager', a), primary: 0x4f8a52, secondary: 0x6fce5c }),
  climber_bo: (kind, a) => ({ ...archetypeFor('climber_bo', 'villager', a), primary: 0x8a6a48, secondary: 0x5a6478, build: 'broad' }),
  scholar_imre: (kind, a) => ({ ...archetypeFor('scholar_imre', 'villager', a), primary: 0x6a5a8a, build: 'slim' }),
  deserter_finn: (kind, a) => ({ ...archetypeFor('deserter_finn', 'seeker', a), hat: 'hood', primary: 0x66646c, secondary: 0x3a3a42 }),
};

function specFor(id, kind, appearance) {
  const override = ID_OVERRIDES[id];
  const spec = override ? override(kind, appearance) : archetypeFor(id, kind, appearance);
  return spec;
}

// ---------------------------------------------------------------- "!" battle marker
function buildMarker() {
  const g = new THREE.Group();
  const m = stdMat(GOLD, { emissive: GOLD, ei: 1.4, rough: 0.3 });
  const stroke = mesh(geo('bang_stroke', () => new THREE.CapsuleGeometry(0.028, 0.1, 3, 6)), m, false);
  stroke.position.y = 0.09;
  const dot = mesh(geo('bang_dot', () => new THREE.SphereGeometry(0.03, 6, 5)), m, false);
  g.add(stroke, dot);
  const light = new THREE.PointLight(GOLD, 0.5, 2.2, 2);
  g.add(light);
  g.visible = false;
  return g;
}

// ---------------------------------------------------------------- module entry
export function createNpcs(zone, world) {
  const scene = world.scene;
  const heightAt = (x, z) => { try { return world.heightAt(x, z); } catch (e) { return 0; } };
  const colliders = [];
  const records = [];
  let ready = false;
  let resolveReady;
  const readyPromise = new Promise((res) => { resolveReady = res; });

  const _toNpc = new THREE.Vector3();
  const _faceVec = new THREE.Vector3();

  function spawnRecord(placement, def) {
    const [x, z] = placement.at ?? [0, 0];
    const y = heightAt(x, z);
    const spec = specFor(def.id, def.kind, def.appearance);
    const built = buildHuman(spec);
    built.group.position.set(x, y, z);
    const face0 = placement.face ?? 0;
    built.group.rotation.y = face0;
    scene.add(built.group);

    const marker = buildMarker();
    marker.position.set(0, spec.height + 0.32, 0);
    built.group.add(marker);

    const wanderRadius = def.wanderRadius ?? 2.5;
    const collider = { x, z, r: 0.34 * (spec.build === 'broad' ? 1.15 : 1) };
    colliders.push(collider);

    const rec = {
      def, group: built.group, refs: built.refs, marker, collider,
      home: { x, z }, face: face0, defaultFace: face0, wanderRadius,
      state: 'idle', wanderTarget: null, idleT: 1 + Math.random() * 3,
      turnPhase: 0, turnTarget: 0, walkPhase: Math.random() * TAU,
      breathPhase: Math.random() * TAU, speed: 1.05 + Math.random() * 0.25,
      talkCooldown: 0, hasBattleReady: false,
      specialExtras: built.special, markerBaseY: spec.height + 0.32,
    };
    records.push(rec);
  }

  async function load() {
    const placements = zone.npcs ?? [];
    if (!placements.length) { ready = true; resolveReady(); return; }
    let NPCS = {};
    try {
      const mod = await import('../data/npcs.js');
      NPCS = mod.NPCS ?? {};
    } catch (e) {
      warnOnce('data/npcs.js unavailable — NPCs will not appear: ' + (e?.message ?? e));
    }
    for (const placement of placements) {
      const def = NPCS[placement.id];
      if (!def) { warnOnce(`no NPCS definition for id "${placement.id}"`); continue; }
      try { spawnRecord(placement, def); }
      catch (e) { console.error(`[npcs] failed to build "${placement.id}"`, e); }
    }
    ready = true;
    resolveReady();
  }
  load();

  // ---------------------------------------------------------------- steering
  function pickWanderTarget(rec) {
    const a = Math.random() * TAU, r = Math.random() * rec.wanderRadius;
    rec.wanderTarget = { x: rec.home.x + Math.cos(a) * r, z: rec.home.z + Math.sin(a) * r };
  }

  function resolveCollision(rec, x, z) {
    let px = x, pz = z;
    for (const c of world.colliders ?? []) {
      if (c === rec.collider) continue;
      const dx = px - c.x, dz = pz - c.z;
      const rr = c.r + 0.32;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) {
        const d = Math.sqrt(d2), push = (rr - d) / d;
        px += dx * push; pz += dz * push;
      }
    }
    return [px, pz];
  }

  function stepWander(rec, dt, playerNear) {
    if (playerNear) { rec.state = 'idle'; rec.wanderTarget = null; return; }
    if (rec.wanderRadius <= 0) { rec.state = 'idle'; return; }
    if (rec.state === 'idle') {
      rec.idleT -= dt;
      if (rec.idleT <= 0) {
        pickWanderTarget(rec);
        rec.state = 'walk';
      }
      return;
    }
    // walk toward target
    const t = rec.wanderTarget;
    const dx = t.x - rec.group.position.x, dz = t.z - rec.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.18) {
      rec.state = 'idle';
      rec.idleT = 2.5 + Math.random() * 4.5;
      return;
    }
    const step = Math.min(dist, rec.speed * dt);
    let nx = rec.group.position.x + (dx / dist) * step;
    let nz = rec.group.position.z + (dz / dist) * step;
    [nx, nz] = resolveCollision(rec, nx, nz);
    rec.group.position.x = nx; rec.group.position.z = nz;
    rec.collider.x = nx; rec.collider.z = nz;
    rec.group.position.y = damp(rec.group.position.y, heightAt(nx, nz), 14, dt);
    rec.face = dampAngle(rec.face, Math.atan2(dx, dz), 8, dt);
    rec.walkPhase += dt * 6.5;
  }

  function updateOne(rec, dt, playerPos) {
    const g = rec.group;
    _toNpc.set(g.position.x - playerPos.x, 0, g.position.z - playerPos.z);
    const distToPlayer = _toNpc.length();
    const playerNear = distToPlayer < FACE_PLAYER_RADIUS;

    stepWander(rec, dt, playerNear);

    if (playerNear && rec.state === 'idle') {
      rec.face = dampAngle(rec.face, Math.atan2(-_toNpc.x, -_toNpc.z), 5, dt);
    } else if (rec.state === 'idle' && rec.wanderRadius > 0) {
      rec.face = dampAngle(rec.face, rec.defaultFace, 1.2, dt);
    }
    g.rotation.y = rec.face;

    // idle life: breathing + occasional head turn
    rec.breathPhase += dt * 1.1;
    const breath = 1 + Math.sin(rec.breathPhase) * 0.015;
    rec.refs.torso.scale.set(1, breath, 1);

    rec.turnPhase -= dt;
    if (rec.turnPhase <= 0 && rec.state === 'idle') {
      rec.turnPhase = 3.5 + Math.random() * 4.5;
      rec.turnTarget = (Math.random() - 0.5) * 0.9;
    }
    const wantTurn = rec.state === 'walk' ? 0 : rec.turnTarget;
    rec.refs.headGrp.rotation.y = damp(rec.refs.headGrp.rotation.y, wantTurn, 4, dt);

    // walk cycle
    if (rec.state === 'walk') {
      const swing = Math.sin(rec.walkPhase) * 0.5;
      rec.refs.legL.rotation.x = swing;
      rec.refs.legR.rotation.x = -swing;
      rec.refs.armL.pivot.rotation.x = -swing * 0.7;
      rec.refs.armR.pivot.rotation.x = swing * 0.7;
      rec.refs.rig.position.y = Math.abs(Math.sin(rec.walkPhase)) * 0.02;
    } else {
      rec.refs.legL.rotation.x = damp(rec.refs.legL.rotation.x, 0, 8, dt);
      rec.refs.legR.rotation.x = damp(rec.refs.legR.rotation.x, 0, 8, dt);
      rec.refs.armL.pivot.rotation.x = damp(rec.refs.armL.pivot.rotation.x, 0, 8, dt);
      rec.refs.armR.pivot.rotation.x = damp(rec.refs.armR.pivot.rotation.x, 0, 8, dt);
      rec.refs.rig.position.y = damp(rec.refs.rig.position.y, 0, 8, dt);
    }

    // lantern flicker / other special extras
    for (const ex of rec.specialExtras ?? []) {
      if (ex.type === 'lantern' && ex.light) ex.light.intensity = 0.75 + Math.sin(performance.now() * 0.006 + ex.node.id) * 0.2;
    }

    // battle-ready marker
    const battleFlag = rec.def.battle?.once;
    const unfought = !!rec.def.battle && (!battleFlag || !hasFlag(battleFlag));
    if (unfought !== rec.hasBattleReady) { rec.hasBattleReady = unfought; rec.marker.visible = unfought; }
    if (unfought) {
      const cam = world.camera;
      const mp = rec.marker;
      mp.position.y = rec.markerBaseY + Math.sin(performance.now() * 0.003 + g.position.x) * 0.08;
      if (cam) {
        _faceVec.set(cam.position.x - (g.position.x + mp.position.x), 0, cam.position.z - (g.position.z + mp.position.z));
        if (_faceVec.lengthSq() > 1e-6) mp.rotation.y = Math.atan2(_faceVec.x, _faceVec.z) - rec.face;
      }
    }

    if (rec.talkCooldown > 0) rec.talkCooldown -= dt;
  }

  // ---------------------------------------------------------------- public API
  function update(dt) {
    if (!records.length) return;
    const player = world.player;
    if (!player?.pos) return;
    for (const rec of records) updateOne(rec, dt, player.pos);
  }

  function findNearest(playerPos, faceDir) {
    let best = null, bestD2 = INTERACT_RADIUS * INTERACT_RADIUS;
    for (const rec of records) {
      const dx = rec.group.position.x - playerPos.x, dz = rec.group.position.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= bestD2) continue;
      if (faceDir != null && d2 > 0.15) {
        const dist = Math.sqrt(d2);
        const dot = (Math.sin(faceDir) * dx + Math.cos(faceDir) * dz) / dist;
        if (dot < INTERACT_CONE) continue;
      }
      bestD2 = d2; best = rec;
    }
    return best;
  }

  function tryInteract(playerPos, faceDir) {
    const rec = findNearest(playerPos, faceDir);
    if (!rec || rec.talkCooldown > 0) return false;
    rec.talkCooldown = 0.6;
    // face the player immediately for the conversation
    const dx = playerPos.x - rec.group.position.x, dz = playerPos.z - rec.group.position.z;
    rec.face = Math.atan2(dx, dz);
    rec.state = 'idle';
    import('../game/story.js')
      .then((m) => m.runNpcInteraction?.(rec.def, world))
      .catch((e) => console.error('[npcs] runNpcInteraction failed', e));
    return true;
  }

  function nearestPrompt(playerPos) {
    const rec = findNearest(playerPos, null);
    if (!rec) return null;
    return { text: `Talk to ${rec.def.name ?? 'them'}` };
  }

  function dispose() {
    for (const rec of records) {
      scene.remove(rec.group);
      // Materials only — every geometry lives in the module-level geoCache on
      // purpose (reused across zones). Also unregisters sway (capes/coats).
      disposeGroup(rec.group, { skipCachedGeometries: true });
    }
    records.length = 0;
    colliders.length = 0;
  }

  return { update, tryInteract, nearestPrompt, colliders, dispose, ready: readyPromise };
}
