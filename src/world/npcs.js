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
import { windSway, disposeGroup, applyVertexGradient, jitterGeometry, contactShadow } from '../gfx/materials.js';

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
    vertexColors: !!opts.vertexColors,
  });
  if (opts.sway) { try { windSway(m, { strength: opts.sway }); } catch (e) { warnOnce('windSway unavailable: ' + e.message); } }
  return m;
}
function mesh(g, m, shadow = true) { const me = new THREE.Mesh(g, m); me.castShadow = shadow; me.receiveShadow = false; return me; }

// Build-time color helper (never called per frame).
const _shadeC = new THREE.Color();
function shade(hex, dl, ds = 0) { _shadeC.setHex(hex).offsetHSL(0, ds, dl); return _shadeC.getHex(); }

// Neutral brightness ramp baked into CACHED geometry as vertex colors: dark
// warm hem -> white crown. It multiplies the material color, so one cached
// geometry serves every NPC palette. Pair with stdMat(color,{vertexColors:true}).
function vgrad(g, opts = {}) {
  applyVertexGradient(g, {
    from: opts.from ?? 0xb4a89c, to: opts.to ?? 0xffffff,
    noise: opts.noise ?? 0.04, seed: opts.seed ?? 5, exp: opts.exp ?? 1, axis: opts.axis ?? 'y',
  });
  return g;
}

// Trapezoid cloth panel (capes, aprons, scarf tails): topW at y=0 -> bottomW at y=-len.
function panelGeo(topW, bottomW, len, thick = 0.024, wSegs = 3, hSegs = 3) {
  const g = new THREE.BoxGeometry(1, len, thick, wSegs, hSegs, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = 0.5 - pos.getY(i) / len;
    pos.setX(i, pos.getX(i) * lerp(topW, bottomW, u));
  }
  g.translate(0, -len / 2, 0);
  g.computeVertexNormals();
  return g;
}

// Shared soft AO disc under every NPC — geometry+material live for the module
// lifetime (flagged shared so disposeGroup leaves them alone).
let _shadowTpl = null;
function shadowDisc(radius) {
  if (!_shadowTpl) {
    _shadowTpl = contactShadow(1, 0.72);
    _shadowTpl.geometry.userData.shared = true;
    _shadowTpl.material.userData.shared = true;
  }
  const s = _shadowTpl.clone();
  s.scale.setScalar(radius);
  s.position.y = 0.02;
  return s;
}

// ---------------------------------------------------------------- deterministic per-id palette
const HAIR_POOL = [0x3a2a20, 0x6b4a33, 0x2a2422, 0xb06a3c, 0x8a7050, 0xd8c8a0, 0x4a3830];
const ROBE_POOL = [0x6a5a8a, 0x4a7ac2, 0xc2865a, 0x5c8a6a, 0x8a5a6a, 0x7a7a5c, 0x5a6a8a];
const SKIN_POOL = [0xf6c9a0, 0xe0ac7c, 0xc98858, 0xf0d4b0, 0xd9a878];

function idRng(id) { return seededRandom(hashStr(id || 'npc')); }

const IRIS_POOL = [0x5a4632, 0x6a4a2a, 0x3a6a54, 0x3d5a80, 0x555a66];
const STYLE_POOL = ['crop', 'side', 'bob', 'bun', 'ponytail', 'crop', 'side'];

function basePalette(id) {
  const r = idRng(id);
  // NOTE: draw order is pinned — skin/hair/primary/secondary came first
  // historically, and every NPC's established colors must not reroll. New
  // identity fields (iris/hairStyle/stance) only ever APPEND draws.
  return {
    skin: SKIN_POOL[Math.floor(r() * SKIN_POOL.length)],
    hair: HAIR_POOL[Math.floor(r() * HAIR_POOL.length)],
    primary: ROBE_POOL[Math.floor(r() * ROBE_POOL.length)],
    secondary: ROBE_POOL[Math.floor(r() * ROBE_POOL.length)],
    accent: GOLD,
    iris: IRIS_POOL[Math.floor(r() * IRIS_POOL.length)],
    hairStyle: STYLE_POOL[Math.floor(r() * STYLE_POOL.length)],
    stance: r(),
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
  const skinM = stdMat(spec.skin, { rough: 0.62 });
  const hairM = stdMat(spec.hair, { rough: 0.74, vertexColors: true });
  const primaryM = stdMat(spec.primary, { rough: 0.88, vertexColors: true });
  const secondaryM = stdMat(spec.secondary, { rough: 0.86, vertexColors: true });
  const bootM = stdMat(spec.bootColor ?? shade(spec.secondary, -0.16, -0.12), { rough: 0.85, vertexColors: true });
  const accentM = stdMat(spec.accent ?? GOLD, { rough: 0.4, metal: 0.3, emissive: spec.accent ?? GOLD, ei: 0.25 });
  const scleraM = stdMat(0xfdf8ee, { rough: 0.35 });
  const irisM = stdMat(spec.iris ?? 0x5a4632, { rough: 0.3, emissive: spec.iris ?? 0x5a4632, ei: 0.15 });
  const pupilM = stdMat(0x221a14, { rough: 0.25 });
  const glintM = stdMat(0xffffff, { rough: 0.2, emissive: 0xffffff, ei: 0.8 });

  const group = new THREE.Group();
  const rig = new THREE.Group(); // idle bob / breath / stoop lives here
  group.add(rig);

  const legLen = h * 0.42, torsoLen = h * 0.34, headR = h * 0.125;
  const hipY = legLen;
  const TL = torsoLen;
  const K = (n) => `${n}_${h.toFixed(2)}_${wide.toFixed(2)}`; // size-keyed cache id

  group.add(shadowDisc(0.42 * (wide > 1 ? 1.15 : 1)));

  const hips = new THREE.Group();
  hips.position.y = hipY;
  rig.add(hips);

  if (spec.stoop) rig.rotation.x = spec.stoop * 0.22;

  /* legs — tapered trousers into boots with a heel + toe hint */
  function buildLeg(sx) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.095 * wide, 0, 0);
    const trouser = mesh(geo(K('npc_trouser'), () => vgrad(new THREE.CylinderGeometry(0.085 * wide, 0.06 * wide, legLen * 0.62, 7), { seed: 3 })), secondaryM);
    trouser.position.y = -legLen * 0.32;
    leg.add(trouser);
    const shaft = mesh(geo(K('npc_bootshaft'), () => vgrad(new THREE.CylinderGeometry(0.062 * wide, 0.056 * wide, legLen * 0.34, 7), { seed: 4 })), bootM);
    shaft.position.y = -legLen * 0.79;
    leg.add(shaft);
    const cuff = mesh(geo(K('npc_bootcuff'), () => vgrad(new THREE.CylinderGeometry(0.078 * wide, 0.068 * wide, 0.06, 7), { seed: 5 })), bootM);
    cuff.position.y = -legLen * 0.63;
    leg.add(cuff);
    const heel = mesh(geo(K('npc_heel'), () => vgrad(new THREE.BoxGeometry(0.105 * wide, 0.062, 0.13), { seed: 6 })), bootM);
    heel.position.set(0, -legLen + 0.031, 0.012);
    leg.add(heel);
    const toe = mesh(geo(K('npc_toe'), () => vgrad(new THREE.SphereGeometry(0.052 * wide, 7, 5), { seed: 7 })), bootM);
    toe.scale.set(1, 0.62, 1.15);
    toe.position.set(0, -legLen + 0.030, 0.088);
    leg.add(toe);
    hips.add(leg);
    return leg;
  }
  const legL = buildLeg(-1), legR = buildLeg(1);

  /* torso — one lathe from flared hem through waist pinch to rounded shoulders */
  const torso = new THREE.Group();
  hips.add(torso);
  const torsoMesh = mesh(geo(K('npc_torso'), () => {
    const pts = [
      new THREE.Vector2(0.118 * wide, 0.0), new THREE.Vector2(0.172 * wide, 0.02),
      new THREE.Vector2(0.158 * wide, TL * 0.26), new THREE.Vector2(0.132 * wide, TL * 0.45),
      new THREE.Vector2(0.15 * wide, TL * 0.70), new THREE.Vector2(0.158 * wide, TL * 0.86),
      new THREE.Vector2(0.10 * wide, TL * 0.99), new THREE.Vector2(0.028 * wide, TL * 1.03),
    ];
    return vgrad(new THREE.LatheGeometry(pts, 10), { seed: 8, from: 0xa0948a, noise: 0.05 });
  }), primaryM);
  torsoMesh.scale.set(1.06, 1, 0.88); // oval cross-section
  torso.add(torsoMesh);
  const chestY = TL * 0.70, shoulderY = TL * 0.92;
  const belt = mesh(geo(K('npc_belt'), () => new THREE.CylinderGeometry(0.148 * wide, 0.156 * wide, 0.055, 9)), accentM, false);
  belt.scale.set(1.06, 1, 0.88);
  belt.position.y = TL * 0.36;
  torso.add(belt);

  /* long robe skirt (elders, scholars): hangs from the waist over the legs */
  if (spec.robe) {
    const robe = mesh(geo(K('npc_robe'), () => {
      const pts = [
        new THREE.Vector2(0.235 * wide, -legLen * 0.92), new THREE.Vector2(0.20 * wide, -legLen * 0.5),
        new THREE.Vector2(0.155 * wide, 0.0), new THREE.Vector2(0.16 * wide, TL * 0.3),
      ];
      return vgrad(new THREE.LatheGeometry(pts, 10), { seed: 9, exp: 0.85, from: 0x9a8e84, noise: 0.05 });
    }), primaryM);
    robe.scale.set(1.04, 1, 0.9);
    torso.add(robe);
  }

  /* work apron (merchants): panel from the chest over the knees + waist tie */
  if (spec.apron) {
    const apron = mesh(geo(K('npc_apron'), () => vgrad(panelGeo(0.19 * wide, 0.26 * wide, TL * 1.05, 0.02), { seed: 10 })), secondaryM);
    apron.position.set(0, TL * 0.78, 0.135 * wide);
    apron.rotation.x = 0.07;
    torso.add(apron);
    const tie = mesh(geo(K('npc_aprontie'), () => vgrad(new THREE.BoxGeometry(0.20 * wide, 0.035, 0.02), { seed: 15 })), bootM, false);
    tie.position.set(0, TL * 0.38, 0.145 * wide);
    torso.add(tie);
  }

  /* shoulder mantle (the Order): stern collar cone over the shoulders */
  if (spec.mantle) {
    const mantleM = stdMat(spec.secondary, { rough: 0.9, side: THREE.DoubleSide, vertexColors: true });
    const mantle = mesh(geo(K('npc_mantle'), () => vgrad(new THREE.CylinderGeometry(0.14 * wide, 0.235 * wide, TL * 0.28, 9, 1, true), { seed: 11 })), mantleM);
    mantle.position.y = TL * 0.80;
    torso.add(mantle);
  }

  /* arms — shoulder cap, tapered sleeve, cuff, mitt hand with a thumb */
  function buildArm(sx) {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.205 * wide, shoulderY, 0);
    const cap = mesh(geo(K('npc_armcap'), () => vgrad(new THREE.SphereGeometry(0.058 * wide, 7, 5), { seed: 12 })), primaryM);
    cap.scale.set(1.1, 0.82, 1);
    cap.position.y = -0.005;
    arm.add(cap);
    const sleeve = mesh(geo(K('npc_sleeve'), () => vgrad(new THREE.CylinderGeometry(0.054 * wide, 0.045 * wide, 0.26, 7), { seed: 13 })), primaryM);
    sleeve.position.y = -0.15;
    arm.add(sleeve);
    const cuff = mesh(geo(K('npc_cuff'), () => vgrad(new THREE.CylinderGeometry(0.047 * wide, 0.051 * wide, 0.05, 7), { seed: 14 })), secondaryM, false);
    cuff.position.y = -0.29;
    arm.add(cuff);
    const hand = new THREE.Group();
    hand.position.y = -0.35;
    const palm = mesh(geo('npc_palm', () => new THREE.SphereGeometry(0.048, 7, 5)), skinM, false);
    palm.scale.set(0.88, 1.08, 0.96);
    const thumb = mesh(geo('npc_thumb', () => new THREE.SphereGeometry(0.021, 5, 4)), skinM, false);
    thumb.position.set(-sx * 0.034, 0.012, 0.02);
    hand.add(palm, thumb);
    arm.add(hand);
    arm.rotation.z = sx * (0.10 + (spec.stance ?? 0.5) * 0.10);
    torso.add(arm);
    return { pivot: arm, hand };
  }
  const armL = buildArm(-1), armR = buildArm(1);
  if (spec.armPose === 'hip') { armR.pivot.rotation.z = -0.62; armR.pivot.rotation.x = -0.18; }

  /* neck + head */
  const neck = mesh(geo(K('npc_neck'), () => new THREE.CylinderGeometry(0.042, 0.052, TL * 0.22, 7)), skinM, false);
  neck.position.y = TL * 1.08;
  torso.add(neck);
  const headGrp = new THREE.Group();
  headGrp.position.y = TL * 1.32;
  torso.add(headGrp);
  const head = mesh(geo(K('npc_head'), () => new THREE.SphereGeometry(headR, 11, 9)), skinM);
  head.scale.set(0.98, 1.04, 1);
  headGrp.add(head);
  for (const sx of [-1, 1]) {
    const ear = mesh(geo(K('npc_ear'), () => new THREE.SphereGeometry(headR * 0.17, 6, 4)), skinM, false);
    ear.position.set(sx * headR * 0.95, headR * 0.02, 0.01);
    headGrp.add(ear);
  }

  const masked = spec.hat === 'mask';
  if (!masked) {
    /* stylized face: flattened sclera + iris + pupil + glint, brows, nose, smile */
    const nose = mesh(geo(K('npc_nose'), () => new THREE.SphereGeometry(headR * 0.09, 5, 4)), skinM, false);
    nose.position.set(0, -headR * 0.06, headR * 0.97);
    headGrp.add(nose);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * headR * 0.36, headR * 0.10, headR * 0.92);
      const sclera = mesh(geo(K('npc_sclera'), () => new THREE.SphereGeometry(headR * 0.17, 8, 6)), scleraM, false);
      sclera.scale.set(1, 1.12, 0.5);
      const iris = mesh(geo(K('npc_iris'), () => new THREE.SphereGeometry(headR * 0.105, 7, 5)), irisM, false);
      iris.position.z = headR * 0.07;
      const pupil = mesh(geo(K('npc_pupil'), () => new THREE.SphereGeometry(headR * 0.055, 6, 4)), pupilM, false);
      pupil.position.z = headR * 0.13;
      const glint = mesh(geo(K('npc_glint'), () => new THREE.SphereGeometry(headR * 0.034, 5, 4)), glintM, false);
      glint.position.set(headR * 0.045, headR * 0.05, headR * 0.16);
      eye.add(sclera, iris, pupil, glint);
      headGrp.add(eye);
      const brow = mesh(geo(K('npc_brow'), () => vgrad(new THREE.BoxGeometry(headR * 0.36, headR * 0.085, headR * 0.08), { from: 0xf2ede8, seed: 25 })), hairM, false);
      brow.position.set(sx * headR * 0.36, headR * 0.42, headR * 0.97);
      brow.rotation.z = -sx * 0.1;
      headGrp.add(brow);
    }
    const smile = mesh(geo(K('npc_smile'), () => new THREE.TorusGeometry(headR * 0.115, headR * 0.036, 5, 8, Math.PI * 0.75)), stdMat(0xb5765a, { rough: 0.6 }), false);
    smile.position.set(0, -headR * 0.30, headR * 0.97);
    smile.rotation.z = -Math.PI * 0.875;
    headGrp.add(smile);
  }

  /* hair — per-id style with actual shaped volume (jittered lobes, not a cap).
     A hood or masked hood replaces the hair entirely — lobes would poke
     straight through the fabric shell otherwise. */
  const hairPart = (key, make, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
    const m = mesh(geo(key, () => vgrad(make(), { from: 0xa89a8c, seed: 17, noise: 0.05 })), hairM, false);
    m.position.set(x * headR, y * headR, z * headR);
    m.scale.set(sx, sy, sz);
    m.rotation.x = rx; m.rotation.z = rz;
    headGrp.add(m);
    return m;
  };
  const hooded = spec.hat === 'hood' || spec.hat === 'mask';
  const style = hooded ? 'none' : (spec.hairStyle ?? 'crop');
  if (style !== 'bald' && style !== 'none') {
    hairPart(K('npc_hairmain'), () => jitterGeometry(new THREE.SphereGeometry(headR * 1.03, 9, 7), headR * 0.05, 31), 0, 0.34, -0.10, 1.02, 0.9, 1.0);
  }
  if (style === 'crop' || style === 'side' || style === 'spiky') {
    hairPart(K('npc_hairnape'), () => jitterGeometry(new THREE.SphereGeometry(headR * 0.5, 7, 5), headR * 0.05, 32), 0, -0.12, -0.62, 1.35, 0.8, 0.7);
  }
  if (style === 'crop' || style === 'bun' || style === 'ponytail' || style === 'spiky') {
    hairPart(K('npc_hairline'), () => jitterGeometry(new THREE.SphereGeometry(headR * 0.46, 7, 5), headR * 0.04, 40), 0, 1.0, 0.42, 1.75, 0.5, 0.85);
  }
  if (style === 'side' || style === 'bob') {
    hairPart(K('npc_hairfringe'), () => jitterGeometry(new THREE.SphereGeometry(headR * 0.42, 7, 5), headR * 0.05, 33), -0.28, 1.02, 0.55, 1.5, 0.6, 0.9);
    hairPart(K('npc_hairfringe2'), () => jitterGeometry(new THREE.SphereGeometry(headR * 0.34, 7, 5), headR * 0.05, 34), 0.45, 0.98, 0.5, 1.2, 0.55, 0.9);
  }
  if (style === 'bob') {
    for (const sx of [-1, 1]) {
      hairPart(K('npc_haircurtain'), () => jitterGeometry(new THREE.SphereGeometry(headR * 0.4, 7, 5), headR * 0.04, 35), sx * 0.85, -0.1, -0.1, 0.55, 1.35, 0.85);
    }
  }
  if (style === 'bun') {
    hairPart(K('npc_hairbun'), () => jitterGeometry(new THREE.SphereGeometry(headR * 0.38, 7, 5), headR * 0.04, 36), 0, 0.78, -0.85);
  }
  if (style === 'ponytail') {
    hairPart(K('npc_hairtail'), () => jitterGeometry(new THREE.ConeGeometry(headR * 0.3, headR * 1.7, 6), headR * 0.05, 37), 0, 0.05, -1.0, 1, 1, 1, 2.65, 0);
  }
  if (style === 'spiky') {
    hairPart(K('npc_hairspike1'), () => new THREE.ConeGeometry(headR * 0.24, headR * 0.72, 5), -0.35, 1.12, 0.1, 1, 1, 1, -0.15, 0.5);
    hairPart(K('npc_hairspike2'), () => new THREE.ConeGeometry(headR * 0.22, headR * 0.62, 5), 0.15, 1.2, 0.05, 1, 1, 1, 0.1, -0.35);
    hairPart(K('npc_hairspike3'), () => new THREE.ConeGeometry(headR * 0.2, headR * 0.55, 5), 0.35, 1.05, -0.35, 1, 1, 1, -0.55, -0.7);
  }
  if (style === 'bald') {
    hairPart(K('npc_hairrim'), () => jitterGeometry(new THREE.SphereGeometry(headR * 1.0, 9, 6), headR * 0.04, 38), 0, -0.02, -0.15, 1.04, 0.42, 1.0);
  }
  if (spec.beard) {
    hairPart(K('npc_beard'), () => jitterGeometry(new THREE.ConeGeometry(headR * 0.42, headR * 1.05, 7), headR * 0.05, 39), 0, -0.78, 0.42, 1.15, 1, 0.8, Math.PI - 0.3, 0);
  }

  // ---- hat / headwear
  let hatMesh = null;
  if (spec.hat === 'hood') {
    hatMesh = mesh(geo(K('hat_hood'), () => vgrad(jitterGeometry(new THREE.ConeGeometry(headR * 1.32, headR * 2.05, 8), headR * 0.05, 41), { seed: 19 })), secondaryM, false);
    hatMesh.position.y = headR * 0.38;
  } else if (spec.hat === 'straw') {
    const strawM = stdMat(0xd9b96e, { rough: 0.9, vertexColors: true });
    hatMesh = new THREE.Group();
    const brim = mesh(geo(K('hat_brim'), () => vgrad(new THREE.CylinderGeometry(headR * 1.85, headR * 1.95, 0.025, 12), { seed: 20 })), strawM, false);
    const top = mesh(geo(K('hat_top'), () => vgrad(new THREE.ConeGeometry(headR * 1.05, headR * 1.05, 10), { seed: 21 })), strawM, false);
    top.position.y = headR * 0.52;
    const band = mesh(geo(K('hat_bandr'), () => vgrad(new THREE.CylinderGeometry(headR * 0.72, headR * 0.78, headR * 0.22, 10), { seed: 24 })), bootM, false);
    band.position.y = headR * 0.12;
    hatMesh.add(brim, top, band);
    hatMesh.position.y = headR * 0.85;
  } else if (spec.hat === 'mask') {
    hatMesh = mesh(geo(K('hat_mask'), () => new THREE.CircleGeometry(headR * 0.82, 10)), stdMat(0xdedad2, { rough: 0.5, emissive: 0xdedad2, ei: 0.06 }), false);
    hatMesh.position.set(0, -0.01, headR * 0.96);
    const hood = mesh(geo(K('hat_hood2'), () => vgrad(new THREE.SphereGeometry(headR * 1.22, 8, 6, 0, TAU, 0, Math.PI * 0.55), { seed: 22 })), secondaryM, false);
    hood.position.y = headR * 0.3;
    hatMesh.add(hood);
    /* two slit "eyes" painted on the mask so it reads at distance */
    for (const sx of [-1, 1]) {
      const slit = mesh(geo(K('mask_slit'), () => new THREE.BoxGeometry(headR * 0.16, headR * 0.05, 0.008)), stdMat(0x2a2530, { rough: 0.4 }), false);
      slit.position.set(sx * headR * 0.3, headR * 0.12, 0.006);
      slit.rotation.z = sx * 0.35;
      hatMesh.add(slit);
    }
  } else if (spec.hat === 'circlet') {
    hatMesh = mesh(geo(K('hat_circlet'), () => new THREE.TorusGeometry(headR * 0.98, 0.012, 6, 14)), accentM, false);
    hatMesh.rotation.x = Math.PI / 2;
    hatMesh.position.y = headR * 0.62;
  } else if (spec.hat === 'goggles') {
    hatMesh = new THREE.Group();
    const band = mesh(geo(K('hat_band'), () => vgrad(new THREE.TorusGeometry(headR * 1.0, 0.012, 6, 14), { from: 0xf2ede8, seed: 26 })), hairM, false);
    band.rotation.y = Math.PI / 2;
    const lensGeo = geo(K('hat_lens'), () => new THREE.CircleGeometry(headR * 0.32, 10));
    const lensM = stdMat(0xbfe4ff, { rough: 0.2, metal: 0.4, transparent: true, opacity: 0.85, emissive: 0xbfe4ff, ei: 0.2 });
    const lL = mesh(lensGeo, lensM, false); lL.position.set(-headR * 0.4, 0.02, headR * 0.9);
    const lR = mesh(lensGeo, lensM, false); lR.position.set(headR * 0.4, 0.02, headR * 0.9);
    hatMesh.add(band, lL, lR);
  }
  if (hatMesh) headGrp.add(hatMesh);

  // ---- cape: tapered panel flaring toward the hem, cloth sway
  let cape = null;
  if (spec.cape) {
    const capeM = stdMat(spec.cape === true ? spec.secondary : spec.cape, { rough: 1, side: THREE.DoubleSide, sway: 0.5, vertexColors: true });
    cape = mesh(geo(K('npc_cape'), () => vgrad(panelGeo(0.30 * wide, 0.44 * wide, TL * 1.35, 0.02, 4, 4), { seed: 23, exp: 0.9, from: 0x968a80, noise: 0.05 })), capeM, true);
    cape.position.set(0, TL * 0.98, -0.115 * wide);
    cape.rotation.x = 0.16;
    torso.add(cape);
  }

  const ctx = {
    group, rig, hips, torso, headGrp, legL, legR, armL, armR, wide, height: h,
    chestY, shoulderY, torsoLen: TL, legLen, headR,
    materials: { skinM, hairM, primaryM, secondaryM, accentM, bootM },
  };
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

  const base = {
    skin, hair, primary, secondary, accent, height: 1.6, build, hat: 'none', cape: false,
    iris: p.iris, hairStyle: p.hairStyle, stance: p.stance,
    robe: !!a.robe, apron: false, mantle: false, stoop: 0, beard: false,
  };

  switch (kind) {
    case 'seeker':
      return { ...base, primary: num(pal?.[0], 0x5c5c66), secondary: num(pal?.[1], 0x46464e), accent: 0xdedad2, hat: hatFromData ?? 'mask', cape: 0x40404a, mantle: true, hairStyle: 'crop', bootColor: 0x3a3a44 };
    case 'keeper':
      return { ...base, hat: hatFromData ?? 'none', cape: base.secondary };
    case 'rival':
      return { ...base, build: BUILD_MAP[a.build] ?? 'slim', hat: hatFromData ?? 'none' };
    case 'merchant':
      return { ...base, hat: hatFromData ?? 'straw', apron: true };
    case 'elder':
      return { ...base, hat: hatFromData ?? 'none', robe: true, stoop: 0.55, height: 1.54, hairStyle: base.hairStyle === 'spiky' ? 'bun' : base.hairStyle };
    case 'villager':
    default:
      return { ...base, hat: hatFromData ?? 'none', cape: false };
  }
}

// ---------------------------------------------------------------- bespoke silhouettes (bible-pinned)
function pauldron(ctx, side = 1) {
  const rockM = stdMat(0x8d8a84, { rough: 0.95 });
  const p = mesh(geo('pauldron', () => new THREE.IcosahedronGeometry(0.12, 0)), rockM);
  p.position.set(side * 0.215 * ctx.wide, ctx.shoulderY + 0.05, 0);
  p.scale.set(1, 0.7, 0.9);
  ctx.torso.add(p);
}
function spectacles(ctx) {
  const rimM = stdMat(0x4a4038, { rough: 0.45, metal: 0.5 });
  const r = ctx.headR;
  for (const sx of [-1, 1]) {
    const rim = mesh(geo('spec_rim', () => new THREE.TorusGeometry(0.032, 0.008, 5, 10)), rimM, false);
    rim.position.set(sx * r * 0.36, r * 0.10, r * 0.94);
    ctx.headGrp.add(rim);
  }
  const bridge = mesh(geo('spec_bridge', () => new THREE.BoxGeometry(0.026, 0.007, 0.007)), rimM, false);
  bridge.position.set(0, r * 0.12, r * 0.95);
  ctx.headGrp.add(bridge);
}
function halfCape(ctx, outer = 0x2a2f3f, lining = 0xff8a4a) {
  // one-shoulder rival cape — asymmetric silhouette, warm lining flash
  const capeM = stdMat(outer, { rough: 0.95, side: THREE.DoubleSide, sway: 0.45, vertexColors: true });
  const capeG = geo(`halfcape_${ctx.torsoLen.toFixed(2)}`, () => vgrad(panelGeo(0.20, 0.30, ctx.torsoLen * 1.1, 0.018, 3, 4), { seed: 51 }));
  const cape = mesh(capeG, capeM, true);
  cape.position.set(-0.13 * ctx.wide, ctx.shoulderY + 0.06, -0.075 * ctx.wide);
  cape.rotation.set(0.14, 0, -0.18);
  ctx.torso.add(cape);
  const liningM = stdMat(lining, { rough: 0.8, emissive: lining, ei: 0.1 });
  const trim = mesh(geo('halfcape_trim', () => new THREE.BoxGeometry(0.21, 0.03, 0.024)), liningM, false);
  trim.position.set(-0.13 * ctx.wide, ctx.shoulderY + 0.07, -0.07 * ctx.wide);
  trim.rotation.z = -0.18;
  ctx.torso.add(trim);
}
function antlerCirclet(ctx) {
  // On the HEAD (rides head turns), rising clear of the hair volume.
  const antlerM = stdMat(0xe8dcc2, { rough: 0.5, emissive: 0x6fce5c, ei: 0.08 });
  for (const side of [-1, 1]) {
    const horn = mesh(geo('antler', () => new THREE.ConeGeometry(0.026, 0.28, 5)), antlerM, false);
    horn.position.set(side * 0.085, ctx.headR * 1.05, -ctx.headR * 0.1);
    horn.rotation.z = side * -0.42;
    horn.rotation.x = -0.15;
    ctx.headGrp.add(horn);
    const tine = mesh(geo('antler_tine', () => new THREE.ConeGeometry(0.016, 0.12, 4)), antlerM, false);
    tine.position.set(side * 0.135, ctx.headR * 1.15, -ctx.headR * 0.08);
    tine.rotation.z = side * -1.0;
    ctx.headGrp.add(tine);
  }
}
function lantern(ctx, side = 1) {
  const grp = new THREE.Group();
  const cage = mesh(geo('lantern_cage', () => new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6, 1, true)), stdMat(0x3a3f4a, { rough: 0.7 }), false);
  const glow = mesh(geo('lantern_glow', () => new THREE.SphereGeometry(0.035, 6, 5)), stdMat(0xffd9a0, { emissive: 0xffd9a0, ei: 1.4 }), false);
  grp.add(cage, glow);
  const light = new THREE.PointLight(0xffd9a0, 0.9, 4, 2);
  grp.add(light);
  grp.position.set(side * 0.26 * ctx.wide, ctx.chestY - 0.16, 0.1);
  ctx.torso.add(grp);
  ctx.extra = (ctx.extra ?? []).concat([{ type: 'lantern', node: grp, glow, light }]);
}
function crackedHalo(ctx) {
  // Floats a clear hand-span above the scalp (head sits higher on the new
  // bodies — anchor off headR, not a fixed offset, or the hair swallows it).
  const haloY = ctx.headGrp.position.y + ctx.headR * 1.7;
  const haloM = stdMat(GOLD, { emissive: GOLD, ei: 1.3, rough: 0.3, transparent: true, opacity: 0.92 });
  const halo = mesh(geo('halo', () => new THREE.TorusGeometry(0.16, 0.014, 6, 20, Math.PI * 1.5)), haloM, false);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = haloY;
  ctx.torso.add(halo);
  const light = new THREE.PointLight(GOLD, 1.0, 4.5, 2);
  light.position.y = haloY;
  ctx.torso.add(light);
  ctx.extra = (ctx.extra ?? []).concat([{ type: 'halo', node: halo }]);
}
function coatTails(ctx) {
  const coatM = stdMat(0x5a6a7a, { rough: 0.95, side: THREE.DoubleSide, sway: 0.75, vertexColors: true });
  for (const side of [-1, 1]) {
    const tail = mesh(geo('coattail', () => vgrad(panelGeo(0.13, 0.17, 0.5, 0.016, 2, 3), { seed: 53 })), coatM, false);
    tail.position.set(side * 0.13 * ctx.wide, ctx.chestY - 0.05, -0.11);
    tail.rotation.x = 0.2;
    ctx.torso.add(tail);
  }
}
function fisherCoat(ctx) {
  const coatM = stdMat(0x3a5a68, { rough: 0.9, side: THREE.DoubleSide, sway: 0.35, vertexColors: true });
  const coat = mesh(geo('fisher_coat', () => vgrad(new THREE.CylinderGeometry(0.22, 0.3, 0.5, 9, 1, true), { seed: 54 })), coatM, false);
  coat.position.y = ctx.chestY - 0.20;
  ctx.torso.add(coat);
}

const ID_OVERRIDES = {
  keeper_bramwell: (kind, a) => ({ ...archetypeFor('keeper_bramwell', 'keeper', a), primary: 0x6a5a44, secondary: 0x4a7a52, build: 'broad', special: (ctx) => pauldron(ctx, 1) }),
  keeper_liora: (kind, a) => ({ ...archetypeFor('keeper_liora', 'keeper', a), primary: 0x4f9e4f, secondary: 0xffe9b0, hat: 'circlet', special: (ctx) => antlerCirclet(ctx) }),
  keeper_maro: (kind, a) => ({ ...archetypeFor('keeper_maro', 'keeper', a), primary: 0x2e6a7a, secondary: 0x1f4a56, special: (ctx) => { fisherCoat(ctx); lantern(ctx, 1); } }),
  keeper_sera: (kind, a) => ({ ...archetypeFor('keeper_sera', 'keeper', a), primary: 0x5a6478, secondary: 0xffd94f, hat: 'goggles', special: (ctx) => coatTails(ctx) }),
  archon_sol: (kind, a) => ({
    ...archetypeFor('archon_sol', 'keeper', a), primary: 0xf4efe0, secondary: GOLD, accent: GOLD,
    height: 1.78, cape: 0xffe9b0, hairStyle: 'bald', hair: 0xe8e0d0, bootColor: 0xcdc2a4,
    special: (ctx) => {
      crackedHalo(ctx);
      // radiant robe: the Archon glows faintly even at noon
      ctx.materials.primaryM.emissive.setHex(0xfff6dd);
      ctx.materials.primaryM.emissiveIntensity = 0.16;
      ctx.materials.secondaryM.emissive.setHex(0xffe9b0);
      ctx.materials.secondaryM.emissiveIntensity = 0.2;
    },
  }),
  // skin/hair are pinned rather than left to basePalette()'s id hash: the rival's look is
  // established art, and it must not silently reroll just because the id string changed.
  bryn: (kind, a) => ({
    ...archetypeFor('bryn', 'rival', a), build: 'slim', skin: 0xf0d4b0, hair: 0x4a3830,
    hairStyle: 'spiky', armPose: 'hip', iris: 0x8a5a2a,
    special: (ctx) => halfCape(ctx, 0x2a2f3f, 0xff8a4a),
  }),
  elder_maren: (kind, a) => ({
    ...archetypeFor('elder_maren', 'elder', a), primary: 0x6a5a8a, secondary: 0xead9bd,
    hat: 'none', height: 1.5, build: 'slim', hair: 0xd8d4cc, hairStyle: 'bun',
    special: (ctx) => spectacles(ctx),
  }),
  lt_vess: (kind, a) => ({ ...archetypeFor('lt_vess', 'seeker', a), primary: 0x3a4a5c, secondary: 0xa8d8ff, accent: 0xa8d8ff, hat: 'hood' }),
  lt_dorn: (kind, a) => ({ ...archetypeFor('lt_dorn', 'seeker', a), primary: 0x7a4a34, secondary: 0xc9995c, build: 'broad', hat: 'none', special: (ctx) => pauldron(ctx, -1) }),
  lanternkeeper_ode: (kind, a) => ({ ...archetypeFor('lanternkeeper_ode', 'villager', a), primary: 0x5a4a34, special: (ctx) => lantern(ctx, 1) }),
  merchant_wren: (kind, a) => ({ ...archetypeFor('merchant_wren', 'merchant', a), primary: 0x3a6a7a }),
  ferryman_juno: (kind, a) => ({ ...archetypeFor('ferryman_juno', 'villager', a), primary: 0x4a5a6a, hat: 'straw' }),
  herbalist_syl: (kind, a) => ({ ...archetypeFor('herbalist_syl', 'villager', a), primary: 0x4f8a52, secondary: 0x6fce5c }),
  climber_bo: (kind, a) => ({ ...archetypeFor('climber_bo', 'villager', a), primary: 0x8a6a48, secondary: 0x5a6478, build: 'broad' }),
  scholar_imre: (kind, a) => ({
    ...archetypeFor('scholar_imre', 'elder', a), primary: 0x6a5a8a, build: 'slim',
    hairStyle: 'bald', beard: true, hair: 0xb8b2a8, special: (ctx) => spectacles(ctx),
  }),
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
