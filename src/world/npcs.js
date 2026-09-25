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
import {
  windSway, disposeGroup, applyVertexGradient, contactShadow, applyLook, addOutline, smoothGeometry,
  taperCapsule, lumpify, drapeShell, bakeParts, solidColor, hairShell, bentLimb,
} from '../gfx/materials.js';

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
// v2 soft look: smooth by default (flat: true opt-in) + the shared soft-light hook.
function stdMat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color, flatShading: opts.flat === true, roughness: opts.rough ?? 0.8, metalness: opts.metal ?? 0,
    emissive: new THREE.Color(opts.emissive ?? 0x000000), emissiveIntensity: opts.ei ?? 1,
    transparent: !!opts.transparent, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide,
    vertexColors: !!opts.vertexColors,
  });
  applyLook(m, { rim: opts.rim ?? 1 });
  if (opts.sway) { try { windSway(m, { strength: opts.sway }); } catch (e) { warnOnce('windSway unavailable: ' + e.message); } }
  return m;
}
function mesh(g, m, shadow = true) { const me = new THREE.Mesh(g, m); me.castShadow = shadow; me.receiveShadow = false; return me; }

// Build-time color helper (never called per frame).
const _shadeC = new THREE.Color();
function shade(hex, dl, ds = 0) { _shadeC.setHex(hex).offsetHSL(0, ds, dl); return _shadeC.getHex(); }

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
// v3 clothing variety (appended draws, see basePalette)
const OUTFIT_POOL = ['tunic', 'vest', 'tunic', 'shawl', 'smock', 'vest'];
const SLEEVE_POOL = ['long', 'long', 'rolled'];
const NECK_POOL = ['collar', 'kerchief', 'none', 'collar'];
const SHIRT_POOL = [0xf2e6c8, 0xe8dcc0, 0xd8c9a3, 0xc9b28a, 0xefe3d0];
const SCARF_POOL = [0xe0704a, 0xd9a23c, 0x5c8ab8, 0x8a5aa8, 0x4f9e6a, 0xc85a6a];

function basePalette(id) {
  const r = idRng(id);
  // NOTE: draw order is pinned — skin/hair/primary/secondary came first
  // historically, and every NPC's established colors must not reroll. New
  // identity fields (iris/hairStyle/stance, then the v3 outfit fields) only
  // ever APPEND draws.
  return {
    skin: SKIN_POOL[Math.floor(r() * SKIN_POOL.length)],
    hair: HAIR_POOL[Math.floor(r() * HAIR_POOL.length)],
    primary: ROBE_POOL[Math.floor(r() * ROBE_POOL.length)],
    secondary: ROBE_POOL[Math.floor(r() * ROBE_POOL.length)],
    accent: GOLD,
    iris: IRIS_POOL[Math.floor(r() * IRIS_POOL.length)],
    hairStyle: STYLE_POOL[Math.floor(r() * STYLE_POOL.length)],
    stance: r(),
    outfit: OUTFIT_POOL[Math.floor(r() * OUTFIT_POOL.length)],
    sleeves: SLEEVE_POOL[Math.floor(r() * SLEEVE_POOL.length)],
    neckwear: NECK_POOL[Math.floor(r() * NECK_POOL.length)],
    shirt: SHIRT_POOL[Math.floor(r() * SHIRT_POOL.length)],
    scarf: SCARF_POOL[Math.floor(r() * SCARF_POOL.length)],
    hairVar: r(),
  };
}

// ---------------------------------------------------------------- humanoid builder
// v3 PEOPLE — appeal AND budget:
//   proportion  a V-tapered torso (pinched waist, a defined shoulder line and
//               round shoulder caps), arms with a real elbow bend and a thumb
//               that reads, a tunic hem / smock / robe flaring over the legs,
//               boots with a rolled cuff;
//   variety     outfit cut (belted tunic / vest over a shirt / shawl / long
//               smock), sleeves (long, or rolled to the elbow over bare
//               forearms) and neckwear come from APPENDED per-id draws, so
//               nobody's established colors reroll;
//   faces       big eyes with a lash line and a catchlight, soft arched brows,
//               rosy cheeks, a small smile, fuller cheeks;
//   hair        ONE sculpted shell per style (gfx/materials.js hairShell) with
//               buns / tails / spikes / beards baked in;
//   cost        every animated part (each leg, the torso, each arm, the head)
//               is ONE vertex-coloured mesh with one ink shell; the face is one
//               ink-free mesh. ~6k triangles incl. ink for a villager (v2 ~20k)
//               in ~14 draws (v2 ~45).
// Colors are baked into per-NPC geometry (flagged lfOwned, so disposeGroup
// frees it although the module skips its shared caches).

const _mixA = new THREE.Color(), _mixB = new THREE.Color();
function mixHex(a, b, t) { return _mixA.setHex(a).lerp(_mixB.setHex(b), t).getHex(); }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Vertical two-tone ramp of `hex` baked into vertex colors (darker below). */
function paint(g, hex, { down = 0.1, up = 0.05, noise = 0.035, seed = 3, exp = 1 } = {}) {
  g.computeBoundingBox();
  return applyVertexGradient(g, { from: shade(hex, -down), to: shade(hex, up), noise, seed, exp });
}
/** Bake colored parts into ONE per-NPC geometry (one draw, one ink shell). */
function bake(parts) {
  for (const [g] of parts) {
    if (g.attributes.lfOutlineNormal) g.deleteAttribute('lfOutlineNormal');
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.color) solidColor(g, 0xffffff);
  }
  const g = bakeParts(parts);
  g.userData.lfOwned = true;
  return g;
}
/** Rounded boot: a squashed capsule along Z with a flattened, softly rolled sole. */
function bootFootGeo(r) {
  const g = new THREE.CapsuleGeometry(r, r * 1.8, 2, 9);
  g.rotateX(Math.PI / 2);
  g.scale(1.0, 0.7, 1.0);
  const pos = g.attributes.position;
  const sole = -r * 0.32;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < sole) pos.setY(i, sole + (y - sole) * 0.28);
    const z = pos.getZ(i);
    if (z > r * 0.35) pos.setY(i, pos.getY(i) - (z - r * 0.35) * 0.08);
  }
  smoothGeometry(g);
  return g;
}
/** Boot shaft hanging from y=0 to -len with a rolled cuff lip at the top. */
function bootShaftGeo(r, len) {
  return new THREE.LatheGeometry([ // bottom -> top (outward faces)
    [0.001, -len], [r * 0.92, -len * 0.97], [r * 0.95, -len * 0.5], [r, -len * 0.1],
    [r * 1.16, -len * 0.06], [r * 1.24, len * 0.05], [r * 1.12, len * 0.14], [r * 0.9, len * 0.13],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 9);
}
/** Smooth tapered, gently curved spike (antlers, spiky locks, horns). */
function softSpikeGeo(len, r0, bend = 0.3, seg = 7, rows = 4) {
  const g = new THREE.CylinderGeometry(r0 * 0.14, r0, len, seg, rows, false);
  g.translate(0, len / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / len));
    pos.setX(i, pos.getX(i) + bend * t * t * len);
  }
  smoothGeometry(g, { creaseAngle: 1.2 });
  return g;
}
/** Horizontal ring (torus in the XZ plane), optionally an arc centred on the back. */
function ringGeo(r, tube, radial, tubular, arc = Math.PI * 2) {
  const g = new THREE.TorusGeometry(r, tube, radial, tubular, arc);
  if (arc < Math.PI * 2) g.rotateZ(-Math.PI / 2 - arc / 2); // arc centred on -Y ...
  g.rotateX(Math.PI / 2);                                     // ... which becomes the back (-Z)
  return g;
}

// Hair styles as hairShell parameters (head-local, radius in head radii).
// tufts: springy crown curls that break the dome outline (short styles).
const HAIR_STYLES = {
  crop: { hairline: { back: -0.74, side: 0.0, temple: 0.26, front: 0.52 }, locks: { count: 9, depth: 0.14, flare: 0.05, sharp: 3, clump: 0.08 }, fringe: { count: 3, depth: 0.1 }, volume: { crown: 0.08, back: 0.04, sides: 0.03 }, tufts: 2 },
  side: { hairline: { back: -0.72, side: -0.08, temple: 0.2, front: 0.46 }, locks: { count: 8, depth: 0.2, flare: 0.08, sharp: 3, clump: 0.09 }, fringe: { count: 2, depth: 0.12, side: 0.7 }, volume: { crown: 0.09, back: 0.05, sides: 0.05, sweep: 0.7 }, tufts: 1 },
  bob: { hairline: { back: -1.0, side: -0.8, temple: 0.3, front: 0.42 }, locks: { count: 12, depth: 0.1, flare: 0.12, sharp: 3, clump: 0.06 }, fringe: { count: 4, depth: 0.14 }, volume: { crown: 0.06, back: 0.09, sides: 0.1 } },
  bun: { hairline: { back: -0.6, side: -0.12, temple: 0.22, front: 0.5 }, locks: { count: 6, depth: 0.06, flare: 0.02, clump: 0.04 }, fringe: { count: 2, depth: 0.06 }, volume: { crown: 0.05, back: 0.04, sides: 0.04 } },
  ponytail: { hairline: { back: -0.64, side: -0.08, temple: 0.22, front: 0.48 }, locks: { count: 7, depth: 0.08, flare: 0.03, clump: 0.04 }, fringe: { count: 3, depth: 0.1, side: -0.4 }, volume: { crown: 0.07, back: 0.04, sides: 0.04 } },
  spiky: { hairline: { back: -0.62, side: -0.04, temple: 0.24, front: 0.4 }, locks: { count: 7, depth: 0.32, flare: 0.16, sharp: 3, clump: 0.1 }, fringe: { count: 3, depth: 0.22, side: 0.5 }, volume: { crown: 0.13, back: 0.07, sides: 0.05 } },
  bald: { bald: 0.3, hairline: { back: -0.58, side: -0.14, temple: 0.06, front: 0.7 }, locks: { count: 9, depth: 0.08, flare: 0.04, sharp: 3, clump: 0.03 }, fringe: { count: 1, depth: 0 }, volume: { crown: 0, back: 0.05, sides: 0.05 } },
};

/**
 * spec: { height, build:'slim'|'avg'|'broad', skin, hair, primary, secondary,
 *         accent, hat:'none'|'hood'|'straw'|'mask'|'circlet'|'goggles',
 *         cape:false|color, stoop:0..1, outfit, sleeves, neckwear, shirt,
 *         scarf, special(ctx) }
 * Returns { group, refs } — refs are the animation handles this module drives.
 */
function buildHuman(spec) {
  const h = spec.height ?? 1.6;
  const wide = spec.build === 'broad' ? 1.22 : spec.build === 'slim' ? 0.86 : 1;
  // colors
  const skin = spec.skin, hair = spec.hair;
  const primary = spec.primary, secondary = spec.secondary;
  const boot = spec.bootColor ?? mixHex(shade(secondary, -0.2), 0x5a3e2c, 0.68); // leather, tinted by the palette
  const outfit = spec.robe ? 'robe' : (spec.outfit ?? 'tunic');
  const shirt = spec.shirt ?? 0xe8dcc0;
  const scarf = spec.scarf ?? 0xd9a23c;
  const rolled = spec.sleeves === 'rolled' && !spec.robe;
  const sleeveHex = outfit === 'vest' ? shirt : primary;
  // materials: one vertex-colored body material carries cloth, skin, hair
  // and hats; the face is one glossier ink-free mesh
  const bodyM = stdMat(0xffffff, { rough: 0.8, vertexColors: true });
  const faceM = stdMat(0xffffff, { rough: 0.42, vertexColors: true, rim: 0.3 });
  const accentM = stdMat(spec.accent ?? GOLD, { rough: 0.4, metal: 0.3, emissive: spec.accent ?? GOLD, ei: 0.25 });
  let capeM = null;

  const group = new THREE.Group();
  const rig = new THREE.Group(); // idle bob / breath / stoop lives here
  group.add(rig);

  const legLen = h * 0.42, torsoLen = h * 0.34, headR = h * 0.116;
  const hipY = legLen;
  const TL = torsoLen;
  const noInk = (o) => { o.userData.noOutline = true; return o; };

  group.add(shadowDisc(0.42 * (wide > 1 ? 1.15 : 1)));

  const hips = new THREE.Group();
  hips.position.y = hipY;
  rig.add(hips);

  if (spec.stoop) rig.rotation.x = spec.stoop * 0.22;

  /* legs — tapered trousers into boots with a rolled cuff and a rounded foot */
  function buildLeg(sx) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.09 * wide, 0, 0);
    const parts = [];
    if (outfit !== 'robe') parts.push([paint(taperCapsule(0.074 * wide, 0.058 * wide, legLen * 0.5, 9, 2), secondary, { seed: 3 }), { p: [0, -legLen * 0.3, 0] }]);
    parts.push([paint(bootShaftGeo(0.058 * wide, legLen * 0.3), boot, { down: 0.05, up: 0.1, seed: 4 }), { p: [0, -legLen * 0.6, 0] }]);
    parts.push([paint(bootFootGeo(0.05 * wide), boot, { down: 0.08, up: 0.04, seed: 6 }), { p: [0, -legLen + 0.033, 0.036] }]);
    leg.add(mesh(bake(parts), bodyM));
    hips.add(leg);
    return leg;
  }
  const legL = buildLeg(-1), legR = buildLeg(1);

  /* torso — V-tapered body lathe + outfit, all in one vertex-colored mesh */
  const torso = new THREE.Group();
  hips.add(torso);
  const chestY = TL * 0.70, shoulderY = TL * 0.9;
  // torso-space V taper: wider across chest and shoulders, flatter front-to-back
  const taperX = (y) => 1.04 + 0.26 * sstep(TL * 0.35, TL * 0.86, y) * (1 - 0.6 * sstep(TL * 0.9, TL * 1.02, y));
  const taperZ = (y) => 0.9 - 0.1 * sstep(TL * 0.35, TL * 0.86, y);
  const vtaper = (g) => {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setX(i, pos.getX(i) * taperX(y));
      pos.setZ(i, pos.getZ(i) * taperZ(y));
    }
    smoothGeometry(g);
    return g;
  };
  const tparts = [];
  {
    const g = new THREE.LatheGeometry([
      [0.001, -0.03], [0.128, -0.028], [0.14, 0.02], [0.136, TL * 0.2], [0.121, TL * 0.4],
      [0.13, TL * 0.58], [0.14, TL * 0.74], [0.134, TL * 0.86], [0.104, TL * 0.95], [0.058, TL * 1.01], [0.001, TL * 1.03],
    ].map(([x, y]) => new THREE.Vector2(x * wide, y)), 14);
    tparts.push([paint(vtaper(g), outfit === 'vest' ? shirt : primary, { down: 0.12, up: 0.05, seed: 8 })]);
  }
  // hem / skirt flaring over the legs (tunic, shirt tail, knee smock, robe)
  const skirt = (len, flare, folds, hex, seed) => {
    const g = new THREE.LatheGeometry([
      [0.12, -len + 0.014], [0.16 + flare, -len - 0.006], [0.17 + flare, -len + 0.012], [0.165 + flare * 0.7, -len * 0.55],
      [0.158 + flare * 0.2, -len * 0.12], [0.14, TL * 0.16], [0.124, TL * 0.37],
    ].map(([x, y]) => new THREE.Vector2(x * wide, y)), outfit === 'robe' ? 16 : 14);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { // soft folds deepening toward the hem
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const f = 1 + 0.05 * sstep(0.02, -len, y) * Math.sin(Math.atan2(z, x) * folds + seed);
      pos.setXYZ(i, x * f, y, z * f);
    }
    tparts.push([paint(vtaper(g), hex, { down: 0.14, up: 0.04, seed })]);
  };
  if (outfit === 'robe') skirt(legLen * 0.92, 0.085, 9, primary, 9);
  else if (outfit === 'smock') skirt(legLen * 0.5, 0.06, 7, primary, 9);
  else if (outfit === 'vest') skirt(legLen * 0.12, 0.012, 5, shirt, 9);
  else skirt(legLen * 0.2, 0.03, 6, primary, 9);
  // belt (leather) — the buckle is a small gold accent below
  {
    const g = ringGeo(0.126 * wide, 0.017, 3, 16);
    g.scale(1, 1.4, 1);
    g.translate(0, TL * 0.37, 0);
    tparts.push([paint(vtaper(g), mixHex(boot, 0x3a2a20, 0.45), { down: 0.04, up: 0.05, seed: 10 })]);
  }
  // neck
  tparts.push([paint(taperCapsule(0.042, 0.05, TL * 0.12, 8, 2), skin, { down: 0.06, up: 0.0, noise: 0.01, seed: 11 }), { p: [0, TL * 1.07, 0] }]);
  // outfit layers
  if (outfit === 'vest') {
    const g = drapeShell({
      profile: [
        { y: TL * 0.97, rx: 0.1 * wide, rz: 0.1 * wide, cz: 0, span: 2.45 },
        { y: TL * 0.84, rx: 0.15 * wide, rz: 0.15 * wide, cz: 0, span: 2.5 },
        { y: TL * 0.55, rx: 0.146 * wide, rz: 0.146 * wide, cz: 0, span: 2.55 },
        { y: TL * 0.08, rx: 0.152 * wide, rz: 0.152 * wide, cz: 0, span: 2.6 },
      ],
      nu: 14, nv: 4, folds: 3, foldAmp: [0.001, 0.006], hemWave: 0.01, hemSideLift: -0.06, thick: 0.012,
      outerTop: shade(primary, 0.04), outerBot: shade(primary, -0.08), liningTop: shade(primary, -0.22), liningBot: shade(primary, -0.26), seed: 12,
    });
    tparts.push([vtaper(g)]);
  } else if (outfit === 'shawl') {
    const g = drapeShell({
      profile: [
        { y: TL * 1.0, rx: 0.08 * wide, rz: 0.08 * wide, cz: 0, span: 2.95 },
        { y: TL * 0.93, rx: 0.15 * wide, rz: 0.14 * wide, cz: -0.004, span: 2.9 },
        { y: TL * 0.82, rx: 0.165 * wide, rz: 0.15 * wide, cz: -0.008, span: 2.8 },
        { y: TL * 0.64, rx: 0.16 * wide, rz: 0.15 * wide, cz: -0.01, span: 2.7 },
      ],
      nu: 16, nv: 4, folds: 6, foldAmp: [0.002, 0.01], hemWave: 0.03, hemSideLift: 0.02, thick: 0.013,
      outerTop: shade(scarf, 0.04), outerBot: shade(scarf, -0.06), liningTop: shade(scarf, -0.2), liningBot: shade(scarf, -0.24),
      trim: shade(scarf, 0.12), trimWidth: 0.18, seed: 13,
    });
    tparts.push([vtaper(g)]);
  }
  if (spec.apron) {
    const g = drapeShell({ // waist apron over the tunic front
      profile: [
        { y: TL * 0.38, rx: 0.14 * wide, rz: 0.125 * wide, cz: 0, span: 0.78 },
        { y: TL * 0.05, rx: 0.17 * wide, rz: 0.165 * wide, cz: 0, span: 0.8 },
        { y: -TL * 0.42, rx: 0.2 * wide, rz: 0.215 * wide, cz: -0.01, span: 0.74 },
      ],
      nu: 10, nv: 5, folds: 3, foldAmp: [0.002, 0.012], hemWave: 0.02, hemSideLift: 0.05, thick: 0.012,
      outerTop: shirt, outerBot: shade(shirt, -0.1), liningTop: shade(shirt, -0.2), liningBot: shade(shirt, -0.26), seed: 10,
    });
    g.rotateY(Math.PI); // drapeShell's θ = 0 is the back; turn it to the front
    tparts.push([g]);
  }
  if (spec.mantle) { // the Order: stern collar-cape over the shoulders
    tparts.push([drapeShell({
      profile: [
        { y: TL * 1.0, rx: 0.11 * wide, rz: 0.1 * wide, cz: 0, span: 2.75 },
        { y: TL * 0.95, rx: 0.25 * wide, rz: 0.21 * wide, cz: -0.008, span: 2.72 },
        { y: TL * 0.84, rx: 0.3 * wide, rz: 0.245 * wide, cz: -0.012, span: 2.68 },
        { y: TL * 0.62, rx: 0.315 * wide, rz: 0.255 * wide, cz: -0.02, span: 2.62 },
      ],
      nu: 18, nv: 4, folds: 8, foldAmp: [0.003, 0.014], hemWave: 0.03, hemSideLift: 0.05, thick: 0.013,
      outerTop: shade(secondary, 0.05), outerBot: shade(secondary, -0.08), liningTop: shade(secondary, -0.2), liningBot: shade(secondary, -0.25), seed: 11,
    })]);
  }
  // neckwear (a hood, mantle or cape collar already frames the neck)
  const neckwear = spec.hat === 'hood' || spec.hat === 'mask' || spec.mantle || spec.cape || outfit === 'shawl' ? 'none' : (spec.neckwear ?? 'collar');
  if (neckwear === 'collar') {
    const g = ringGeo(0.072 * wide, 0.021, 3, 10, Math.PI * 1.45);
    g.scale(1, 1.2, 0.92);
    tparts.push([paint(g, shade(sleeveHex, 0.06), { down: 0.05, up: 0.05, seed: 14 }), { p: [0, TL * 1.0, -0.004], r: [0.18, 0, 0] }]);
  } else if (neckwear === 'kerchief') {
    const roll = ringGeo(0.068 * wide, 0.024, 3, 12);
    tparts.push([paint(roll, scarf, { down: 0.05, up: 0.05, seed: 15 }), { p: [0, TL * 1.0, 0], r: [0.2, 0, 0] }]);
    const tip = new THREE.ConeGeometry(0.04 * wide, 0.075, 5);
    tip.rotateX(Math.PI); // point down
    tparts.push([paint(tip, scarf, { down: 0.1, up: 0.02, seed: 16 }), { p: [0, TL * 0.92, 0.1 * wide], r: [-0.3, 0, 0], s: [1, 1, 0.45] }]);
  }
  // cape yoke: a soft rolled collar so the cape reads as worn, not glued
  const capeHex = spec.cape ? (spec.cape === true ? secondary : spec.cape) : null;
  if (capeHex != null) {
    tparts.push([paint(ringGeo(0.13 * wide, 0.03, 3, 12, Math.PI * 1.3), capeHex, { down: 0.04, up: 0.06, seed: 27 }), { p: [0, TL * 0.94, -0.015] }]);
  }
  torso.add(mesh(bake(tparts), bodyM));
  const buckle = noInk(mesh(new THREE.BoxGeometry(0.05 * wide, 0.042, 0.014), accentM, false));
  buckle.geometry.userData.lfOwned = true;
  buckle.position.set(0, TL * 0.37, 0.126 * wide * taperZ(TL * 0.37) + 0.012);
  torso.add(buckle);

  /* arms — shoulder cap, sleeve with an elbow (or rolled to the elbow over a
     bare forearm), cuff, rounded mitt hand + a thumb that reads */
  const _dir = new THREE.Vector3(), _off = new THREE.Vector3(), _xAxis = new THREE.Vector3(1, 0, 0);
  function buildArm(sx) {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.2 * wide, shoulderY, 0);
    const onHip = spec.armPose === 'hip' && sx > 0;
    // the elbow bends toward the frame's +Z: forward, or inward for a hand on the hip
    const frame = new THREE.Group();
    if (onHip) frame.rotation.y = -sx * Math.PI / 2;
    arm.add(frame);
    const parts = [];
    const ra = 0.05 * wide, rb = 0.042 * wide, armK = h / 1.6;
    const bend = onHip ? 1.05 : 0.22 + (spec.stance ?? 0.5) * 0.14;
    const wrist = new THREE.Vector3();
    if (rolled) {
      const up = 0.14 * armK, fl = 0.15 * armK;
      parts.push([paint(taperCapsule(ra, ra * 0.94, up, 8, 2), sleeveHex, { seed: 13 }), { p: [0, -up / 2, 0] }]);
      const fore = taperCapsule(ra * 0.78, rb * 0.8, fl, 8, 2);
      fore.translate(0, -fl / 2, 0);   // top cap centre at the elbow
      fore.rotateX(-bend);             // forearm swings forward
      parts.push([solidColor(fore, skin), { p: [0, -up, 0] }]);
      const cuff = ringGeo(ra * 1.02, 0.017, 3, 10);
      cuff.scale(1, 1.5, 1);
      parts.push([paint(cuff, shade(sleeveHex, 0.07), { down: 0.03, up: 0.03, seed: 17 }), { p: [0, -up + 0.012, 0] }]);
      _dir.set(0, -Math.cos(bend), Math.sin(bend));
      wrist.set(0, -up, 0).addScaledVector(_dir, fl + rb * 0.3);
    } else {
      const limb = bentLimb(ra, rb, 0.3 * armK, { bend, seg: 8, rows: 2, elbow: 0.5, bulge: 0.05 });
      parts.push([paint(limb.geometry, sleeveHex, { down: 0.1, seed: 13 })]);
      _dir.set(0, -Math.cos(bend), Math.sin(bend));
      wrist.copy(limb.end);
      const cuff = ringGeo(rb * 1.02, 0.015, 3, 10);
      cuff.scale(1, 1.4, 1);
      parts.push([paint(cuff, outfit === 'vest' ? shade(shirt, -0.08) : secondary, { down: 0.03, up: 0.03, seed: 14 }),
        { p: [0, wrist.y - _dir.y * 0.014, wrist.z - _dir.z * 0.014], r: [-bend, 0, 0] }]);
    }
    const hc = wrist.clone().addScaledVector(_dir, 0.038);
    parts.push([solidColor(new THREE.SphereGeometry(0.046, 8, 6), skin), { p: [hc.x, hc.y, hc.z], r: [-bend, 0, 0], s: [0.9, 1.08, 0.96] }]);
    _off.set(-sx * 0.032, 0.008, 0.024).applyAxisAngle(_xAxis, -bend);
    parts.push([solidColor(new THREE.CapsuleGeometry(0.016, 0.02, 1, 5), skin), { p: [hc.x + _off.x, hc.y + _off.y, hc.z + _off.z], r: [0.35 - bend, 0, -sx * 0.58] }]);
    frame.add(mesh(bake(parts), bodyM));
    const hand = new THREE.Group();
    hand.position.copy(hc);
    frame.add(hand);
    arm.rotation.z = onHip ? sx * 0.5 : sx * (0.1 + (spec.stance ?? 0.5) * 0.1);
    torso.add(arm);
    return { pivot: arm, hand };
  }
  const armL = buildArm(-1), armR = buildArm(1);

  /* head — skull, ears, hair (or hood) and hat in one mesh; the face in another */
  const headGrp = new THREE.Group();
  headGrp.position.y = TL * 1.36;
  torso.add(headGrp);
  const R = headR;
  const hparts = [];
  {
    const g = new THREE.SphereGeometry(R, 14, 10);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { // fuller cheeks, softer jaw
      const y = pos.getY(i) / R, z = pos.getZ(i) / R;
      const cheek = sstep(0.3, -0.35, y) * (1 - sstep(-0.55, -0.95, y)) * Math.max(0, z);
      pos.setXYZ(i, pos.getX(i) * (0.98 + 0.07 * cheek), pos.getY(i), pos.getZ(i) * (0.97 + 0.03 * cheek));
    }
    smoothGeometry(g);
    hparts.push([paint(g, skin, { down: 0.04, up: 0.02, noise: 0.012, seed: 21 })]);
    for (const s of [-1, 1]) hparts.push([solidColor(new THREE.SphereGeometry(R * 0.17, 6, 4), shade(skin, -0.02)), { p: [s * R * 0.95, -R * 0.04, 0.01], s: [0.62, 1, 0.82] }]);
  }
  const hooded = spec.hat === 'hood' || spec.hat === 'mask';
  const style = hooded ? 'none' : (spec.hairStyle ?? 'crop');
  const hv = spec.hairVar ?? 0.5;
  if (style !== 'none' && HAIR_STYLES[style]) {
    const st = HAIR_STYLES[style];
    const hs = hairShell({
      radius: R * (1.05 + hv * 0.03), center: [0, R * 0.07, -R * 0.04], scale: [1.0, 1.0, 1.02], seg: [18, 12],
      hairline: st.hairline, locks: st.locks, fringe: st.fringe,
      volume: { ...st.volume, crown: st.volume.crown + hv * 0.03 }, groove: 0.012, tuck: 0.62, bald: st.bald ?? 0, seed: 1 + hv * 5,
      color: { hex: hair, down: 0.1, up: 0.12, grooveShade: 0.36 },
    });
    hparts.push([hs]);
    for (let k = 0; k < (st.tufts ?? 0); k++) { // springy crown curls, swept sideways so they read in silhouette
      const side = (k === 0 ? 1 : -1) * (hv < 0.5 ? 1 : -1);
      const t = softSpikeGeo(R * (0.52 + 0.12 * hv - k * 0.16), R * (0.21 - k * 0.05), 0.95, 6, 3);
      if (side < 0) t.rotateY(Math.PI);          // curl toward the lean
      t.rotateZ(-side * (0.8 + 0.2 * hv - k * 0.12));
      t.rotateX(-0.3);                           // lean back a touch
      hparts.push([paint(t, hair, { down: 0.02, up: 0.14, seed: 43 + k }), { p: [side * R * 0.1, R * 0.96, -R * (0.1 + k * 0.1)] }]);
    }
    if (style === 'bun') {
      hparts.push([paint(smoothGeometry(lumpify(new THREE.SphereGeometry(R * 0.36, 8, 6), 0.05, 36)), hair, { down: 0.08, up: 0.1, seed: 36 }), { p: [0, R * 0.78, -R * 0.78] }]);
    } else if (style === 'ponytail') {
      const tail = new THREE.LatheGeometry([ // bottom -> top
        [0.0005, -R * 1.25], [R * 0.1, -R * 1.18], [R * 0.24, -R * 0.8], [R * 0.26, -R * 0.42], [R * 0.2, -R * 0.12], [R * 0.12, 0], [0.0005, R * 0.05],
      ].map(([x, y]) => new THREE.Vector2(x, y)), 8);
      lumpify(tail, 0.05, 37);
      tail.scale(1, 1, 0.8);
      smoothGeometry(tail);
      hparts.push([paint(tail, hair, { down: 0.12, up: 0.08, seed: 37 }), { p: [0, R * 0.12, -R * 1.0], r: [0.3, 0, 0] }]);
      hparts.push([solidColor(ringGeo(R * 0.14, R * 0.045, 3, 8), shade(scarf, -0.05)), { p: [0, R * 0.1, -R * 1.02], r: [0.3, 0, 0] }]);
    } else if (style === 'spiky') {
      // chunky spikes swept BACK and out from the crown (rooted in the hair volume)
      const spikes = [[-0.42, 0.9, 0.12, 0.62, 0.3, -1.05, 0.65], [-0.1, 1.02, 0.18, 0.7, 0.32, -1.3, 0.2],
        [0.22, 0.98, 0.1, 0.66, 0.3, -1.25, -0.3], [0.5, 0.84, -0.05, 0.56, 0.28, -1.0, -0.75]];
      for (const [x, y, z, len, r, rx, rz] of spikes) hparts.push([paint(softSpikeGeo(R * len, R * r, 0.25, 6, 3), hair, { down: 0.02, up: 0.14, seed: 41 }), { p: [x * R, y * R, z * R], r: [rx, 0, rz] }]);
    }
  }
  if (spec.beard) {
    const g = smoothGeometry(lumpify(new THREE.SphereGeometry(R * 0.5, 8, 6), 0.08, 39));
    hparts.push([paint(g, hair, { down: 0.12, up: 0.04, seed: 39 }), { p: [0, -R * 0.58, R * 0.5], s: [1.1, 1.0, 0.68] }]);
  }
  // headwear
  let maskMesh = null, lensMesh = null, circlet = null;
  if (hooded) {
    // a real hood: draped shell over the head, open at the face, soft point at the back
    hparts.push([drapeShell({
      profile: [
        { y: R * 1.28, rx: R * 0.06, rz: R * 0.07, cz: -R * 0.36, span: 2.3 },
        { y: R * 1.0, rx: R * 0.94, rz: R * 1.0, cz: -R * 0.14, span: 2.34 },
        { y: R * 0.2, rx: R * 1.14, rz: R * 1.14, cz: -R * 0.06, span: 2.36 },
        { y: -R * 0.75, rx: R * 1.24, rz: R * 1.14, cz: -R * 0.1, span: 2.5 },
      ],
      nu: 18, nv: 6, folds: 5, foldAmp: [0.002, 0.012], hemWave: 0.02, hemSideLift: 0.04, thick: 0.014,
      outerTop: shade(secondary, 0.05), outerBot: shade(secondary, -0.08), liningTop: shade(secondary, -0.25), liningBot: shade(secondary, -0.3), seed: 19,
    })]);
    if (spec.hat === 'mask') {
      const cap = new THREE.SphereGeometry(R * 1.02, 12, 6, 0, Math.PI * 2, 0, 0.95);
      cap.rotateX(Math.PI / 2); // cap facing +Z
      const parts = [[solidColor(cap, 0xdedad2), { p: [0, -0.01, R * 0.02] }]];
      for (const s of [-1, 1]) { // two slit "eyes" so the mask reads at distance
        parts.push([solidColor(new THREE.CapsuleGeometry(R * 0.045, R * 0.2, 1, 4), 0x2a2530), { p: [s * R * 0.31, R * 0.08, R * 0.985], r: [0, s * 0.3, Math.PI / 2 + s * 0.35], s: [1, 1, 0.6] }]);
      }
      maskMesh = noInk(mesh(bake(parts), stdMat(0xffffff, { rough: 0.45, vertexColors: true, emissive: 0xdedad2, ei: 0.06 }), false));
    }
  } else if (spec.hat === 'straw') {
    const H = R;
    // profile walks crown -> brim edge -> brim underside; reversed so the
    // lathe's faces point outward (three expects bottom -> top order)
    const hat = new THREE.LatheGeometry([
      [0.001, 0.98 * H], [0.22 * H, 0.94 * H], [0.62 * H, 0.6 * H], [0.98 * H, 0.16 * H], [1.08 * H, 0.08 * H],
      [1.6 * H, 0.01 * H], [1.95 * H, -0.1 * H], [1.97 * H, -0.13 * H], [1.9 * H, -0.12 * H], [1.55 * H, -0.03 * H],
      [1.02 * H, 0.0], [0.92 * H, 0.03 * H],
    ].reverse().map(([x, y]) => new THREE.Vector2(x, y)), 16);
    hparts.push([paint(hat, 0xd9b96e, { down: 0.12, up: 0.06, seed: 20 }), { p: [0, H * 0.8, 0] }]);
    const band = ringGeo(H * 1.0, H * 0.07, 3, 16);
    band.scale(1, 1.6, 1);
    hparts.push([paint(band, boot, { down: 0.04, up: 0.04, seed: 24 }), { p: [0, H * 0.94, 0] }]);
  } else if (spec.hat === 'goggles') {
    const band = ringGeo(R * 1.1, 0.013, 3, 20);
    hparts.push([solidColor(band, 0x5a4e44), { p: [0, R * 0.42, 0], r: [-0.22, 0, 0] }]);
    const lensParts = [];
    for (const s of [-1, 1]) {
      const rim = new THREE.TorusGeometry(R * 0.33, 0.01, 3, 12);
      hparts.push([solidColor(rim, 0x5a4e44), { p: [s * R * 0.37, R * 0.54, R * 0.92], r: [-0.5, s * 0.35, 0] }]);
      lensParts.push([solidColor(new THREE.CircleGeometry(R * 0.32, 12), 0xbfe4ff), { p: [s * R * 0.37, R * 0.54, R * 0.925], r: [-0.5, s * 0.35, 0] }]);
    }
    lensMesh = noInk(mesh(bake(lensParts), stdMat(0xffffff, { rough: 0.2, metal: 0.4, transparent: true, opacity: 0.85, emissive: 0xbfe4ff, ei: 0.2, vertexColors: true }), false));
  } else if (spec.hat === 'circlet') {
    circlet = noInk(mesh(ringGeo(R * 1.07, 0.012, 3, 24), accentM, false));
    circlet.geometry.userData.lfOwned = true;
    circlet.position.y = R * 0.62;
  }
  headGrp.add(mesh(bake(hparts), bodyM));
  if (maskMesh) headGrp.add(maskMesh);
  if (lensMesh) headGrp.add(lensMesh);
  if (circlet) headGrp.add(circlet);

  if (spec.hat !== 'mask') {
    /* friendly face: big eyes (sclera, iris, pupil, catchlight, lash line),
       soft arched brows, a small nose, rosy cheeks and a smile — one mesh */
    const irisHex = spec.iris ?? 0x5a4632;
    const lashHex = mixHex(shade(hair, -0.2), 0x2a1a14, 0.6);
    const fparts = [];
    const ez = R * 0.9;
    for (const s of [-1, 1]) {
      const ex = s * R * 0.34, ey = -R * 0.02;
      fparts.push([solidColor(new THREE.SphereGeometry(R * 0.19, 8, 5), 0xfdf8ee), { p: [ex, ey, ez], s: [0.95, 1.18, 0.5] }]);
      fparts.push([solidColor(new THREE.SphereGeometry(R * 0.14, 6, 4), irisHex), { p: [ex, ey - R * 0.015, ez + R * 0.058], s: [1, 1.12, 0.55] }]);
      fparts.push([solidColor(new THREE.SphereGeometry(R * 0.075, 5, 3), 0x1e1612), { p: [ex, ey - R * 0.015, ez + R * 0.112], s: [1, 1.12, 0.4] }]);
      fparts.push([solidColor(new THREE.SphereGeometry(R * 0.042, 4, 3), 0xffffff), { p: [ex - R * 0.05, ey + R * 0.06, ez + R * 0.112] }]);
      const lash = new THREE.TorusGeometry(R * 0.19, R * 0.03, 3, 6, Math.PI * 0.78);
      lash.rotateZ(Math.PI / 2 - Math.PI * 0.39);  // arc across the top of the eye
      lash.scale(1, 1.18, 1);
      fparts.push([solidColor(lash, lashHex), { p: [ex, ey + R * 0.005, ez + R * 0.035], r: [0, s * 0.28, 0] }]);
      const brow = new THREE.TorusGeometry(R * 0.2, R * 0.03, 3, 5, Math.PI * 0.46);
      brow.rotateZ(Math.PI / 2 - Math.PI * 0.23);  // gentle arch
      fparts.push([solidColor(brow, shade(hair, -0.12)), { p: [ex, R * 0.17, R * 0.88], r: [-0.12, s * 0.36, 0] }]);
      const blush = mixHex(skin, 0xf07a68, 0.5);
      fparts.push([solidColor(new THREE.SphereGeometry(R * 0.12, 6, 3), blush), { p: [s * R * 0.52, -R * 0.24, R * 0.815], r: [0, s * 0.58, 0], s: [1.1, 0.62, 0.25] }]);
    }
    fparts.push([solidColor(new THREE.SphereGeometry(R * 0.075, 6, 4), shade(skin, -0.05, 0.05)), { p: [0, -R * 0.2, R * 0.97], s: [1, 0.85, 0.8] }]);
    const smile = new THREE.TorusGeometry(R * 0.12, R * 0.027, 3, 6, Math.PI * 0.7);
    smile.rotateZ(-Math.PI / 2 - Math.PI * 0.35); // arc centred on the bottom
    fparts.push([solidColor(smile, 0x9c5a44), { p: [0, -R * 0.24, R * 0.95], r: [0.12, 0, 0] }]);
    headGrp.add(noInk(mesh(bake(fparts), faceM, false)));
  }

  // ---- cape: a draped, folded shell over the shoulders that hang-sways in the wind
  if (capeHex != null) {
    const capeLen = TL * 1.0 + legLen * 0.55;
    capeM = stdMat(0xffffff, { rough: 0.95, vertexColors: true });
    windSway(capeM, { strength: 0.35, speed: 1.1, heightScale: capeLen, hang: true });
    const top = TL * 1.0;
    const g = drapeShell({ // rolls over the shoulders from the collar, then falls behind the arms
      profile: [
        { y: top, rx: 0.11 * wide, rz: 0.1 * wide, cz: 0, span: 2.2 },
        { y: TL * 0.94, rx: 0.25 * wide, rz: 0.18 * wide, cz: -0.02, span: 2.0 },
        { y: TL * 0.8, rx: 0.3 * wide, rz: 0.2 * wide, cz: -0.04, span: 1.85 },
        { y: TL * 0.2, rx: 0.31 * wide, rz: 0.21 * wide, cz: -0.07, span: 1.72 },
        { y: -legLen * 0.55, rx: 0.34 * wide, rz: 0.24 * wide, cz: -0.11, span: 1.6 },
      ],
      nu: 18, nv: 8, folds: 6, foldAmp: [0.006, 0.05], foldDrift: 1.1, hemWave: 0.018, hemSideLift: 0.12, thick: 0.016,
      outerTop: shade(capeHex, 0.05), outerBot: shade(capeHex, -0.1), liningTop: shade(capeHex, -0.2), liningBot: shade(capeHex, -0.26),
      trim: spec.capeTrim ?? null, trimWidth: 0.05, seed: 23,
    });
    g.translate(0, -top, 0); // hang from the origin (hang-sway reads -y as the drop)
    g.userData.lfOwned = true;
    const cape = mesh(g, capeM, true);
    cape.position.y = top;
    torso.add(cape);
  }

  const ctx = {
    group, rig, hips, torso, headGrp, legL, legR, armL, armR, wide, height: h,
    chestY, shoulderY, torsoLen: TL, legLen, headR,
    // v3: one body material carries every vertex-colored part; the old role
    // names alias it so bespoke specials keep working
    materials: { bodyM, faceM, capeM, accentM, skinM: bodyM, hairM: bodyM, primaryM: bodyM, secondaryM: bodyM, bootM: bodyM },
  };
  if (typeof spec.special === 'function') spec.special(ctx);

  // Soft ink outline (people + creatures only). One material per NPC so
  // nothing leaks between figures; eyes/glows/transparent bits are skipped.
  // Rigid meshes sharing a parent share one merged shell.
  addOutline(group, { color: 0x2a1d2b, thickness: 1.9, merge: true, minSize: 0.03 });

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
const CAPE_TRIM = 0xe2bd6a; // Keepers' capes carry a shard-gold hem

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
  // hood + a (worn) mask = the masked hood; mask 'removed' = just the hood
  const masked = !!a.mask && a.mask !== 'removed';
  let hatFromData = a.hat ?? (masked ? 'mask' : a.hood ? 'hood' : undefined);
  const build = BUILD_MAP[a.build] ?? 'avg';

  const base = {
    skin, hair, primary, secondary, accent, height: 1.6, build, hat: 'none', cape: false,
    iris: p.iris, hairStyle: p.hairStyle, stance: p.stance,
    outfit: p.outfit, sleeves: p.sleeves, neckwear: p.neckwear, shirt: p.shirt, scarf: p.scarf, hairVar: p.hairVar,
    robe: !!a.robe, apron: false, mantle: false, stoop: 0, beard: false,
  };

  switch (kind) {
    case 'seeker':
      return { ...base, primary: num(pal?.[0], 0x5c5c66), secondary: num(pal?.[1], 0x46464e), accent: 0xdedad2, hat: hatFromData ?? 'mask', cape: 0x40404a, mantle: true, hairStyle: 'crop', bootColor: 0x3a3a44, outfit: 'tunic', sleeves: 'long' };
    case 'keeper':
      return { ...base, hat: hatFromData ?? 'none', cape: base.secondary, capeTrim: CAPE_TRIM };
    case 'rival':
      return { ...base, build: BUILD_MAP[a.build] ?? 'slim', hat: hatFromData ?? 'none' };
    case 'merchant':
      return { ...base, hat: hatFromData ?? 'straw', apron: true, outfit: 'tunic', sleeves: 'rolled' };
    case 'elder':
      return { ...base, hat: hatFromData ?? 'none', robe: true, stoop: 0.55, height: 1.54, hairStyle: base.hairStyle === 'spiky' ? 'bun' : base.hairStyle };
    case 'villager':
    default:
      return { ...base, hat: hatFromData ?? 'none', cape: false };
  }
}

// ---------------------------------------------------------------- bespoke silhouettes (bible-pinned)
// Neutral drape colors for cached, material-tinted cloth.
const DRAPE_NEUTRAL = { outerTop: 0xffffff, outerBot: 0xa99f97, liningTop: 0x8c8279, liningBot: 0x6f6660 };

function pauldron(ctx, side = 1) {
  const rockM = stdMat(0x8d8a84, { rough: 0.95 });
  const p = mesh(geo('v3_pauldron', () => {
    const g = lumpify(new THREE.IcosahedronGeometry(0.12, 2), 0.16, 12);
    smoothGeometry(g);
    return g;
  }), rockM);
  p.position.set(side * 0.215 * ctx.wide, ctx.shoulderY + 0.05, 0);
  p.scale.set(1, 0.7, 0.9);
  ctx.torso.add(p);
}
function spectacles(ctx) {
  // rims ring the v3 eyes (x ±0.34 r, y -0.02 r, on the face at z ~0.97 r)
  const rimM = stdMat(0x4a4038, { rough: 0.45, metal: 0.5 });
  const r = ctx.headR;
  const g = geo(`v3_spectacles_${r.toFixed(3)}`, () => bakeParts([
    ...[-1, 1].map((sx) => [new THREE.TorusGeometry(r * 0.22, 0.0065, 3, 14), { p: [sx * r * 0.34, -r * 0.02, r * 0.99], r: [0, sx * 0.3, 0] }]),
    [new THREE.CapsuleGeometry(0.004, r * 0.16, 1, 4), { p: [0, r * 0.02, r * 1.02], r: [0, 0, Math.PI / 2] }],
  ]));
  const spec = mesh(g, rimM, false);
  spec.userData.noOutline = true;
  ctx.headGrp.add(spec);
}
function halfCape(ctx, outer = 0x2a2f3f, lining = 0xff8a4a) {
  // one-shoulder rival cape — asymmetric silhouette, warm lining flash. A real
  // draped shell hanging off the right shoulder (bespoke colors, not tinted).
  const len = ctx.torsoLen * 0.95 + ctx.legLen * 0.2;
  const capeM = stdMat(0xffffff, { rough: 0.92, vertexColors: true });
  windSway(capeM, { strength: 0.4, speed: 1.2, heightScale: len, hang: true });
  const top = ctx.shoulderY + 0.06;
  const capeG = geo(`v3_halfcape_${ctx.torsoLen.toFixed(2)}_${ctx.wide.toFixed(2)}`, () => {
    const w = ctx.wide;
    const g = drapeShell({
      profile: [
        { y: 0, rx: 0.14 * w, rz: 0.11 * w, cz: 0, span: 1.5 },
        { y: -0.1, rx: 0.27 * w, rz: 0.18 * w, cz: -0.02, span: 1.45 },
        { y: -len, rx: 0.31 * w, rz: 0.21 * w, cz: -0.06, span: 1.3 },
      ],
      nu: 18, nv: 8, folds: 5, foldAmp: [0.004, 0.04], hemWave: 0.03, hemSideLift: 0.16, thick: 0.014,
      outerTop: shade(outer, 0.08), outerBot: shade(outer, -0.04), liningTop: lining, liningBot: shade(lining, -0.12),
      trim: shade(lining, 0.05), trimWidth: 0.06, seed: 51,
    });
    g.rotateY(0.55); // swing the drape round onto the right shoulder (-X) and back
    return g;
  });
  const cape = mesh(capeG, capeM, true);
  cape.position.set(0, top, -0.01);
  ctx.torso.add(cape);
}
function antlerCirclet(ctx) {
  // On the HEAD (rides head turns), rising clear of the hair volume.
  const antlerM = stdMat(0xe8dcc2, { rough: 0.5, emissive: 0x6fce5c, ei: 0.08 });
  const g = geo(`v3_antlers_${ctx.headR.toFixed(3)}`, () => {
    const parts = [];
    for (const side of [-1, 1]) {
      const horn = softSpikeGeo(0.28, 0.026, 0.28, 7, 4);
      horn.scale(side, 1, 1);
      if (side < 0) horn.index.array.reverse(); // mirrored: keep the faces outward
      parts.push([horn, { p: [side * 0.085, ctx.headR * 1.0, -ctx.headR * 0.1], r: [-0.15, 0, side * -0.42] }]);
      const tine = softSpikeGeo(0.12, 0.016, 0.3, 6, 3);
      tine.scale(side, 1, 1);
      if (side < 0) tine.index.array.reverse();
      parts.push([tine, { p: [side * 0.13, ctx.headR * 1.12, -ctx.headR * 0.08], r: [0, 0, side * -1.0] }]);
    }
    return bakeParts(parts);
  });
  ctx.headGrp.add(mesh(g, antlerM, false));
}
function lantern(ctx, side = 1) {
  const grp = new THREE.Group();
  const cage = mesh(geo('v2_lantern_cage', () => {
    const g = new THREE.LatheGeometry([
      [0.001, 0.07], [0.022, 0.066], [0.05, 0.045], [0.052, -0.04], [0.04, -0.056], [0.001, -0.058],
    ].reverse().map(([x, y]) => new THREE.Vector2(x, y)), 8);
    return g;
  }), stdMat(0x3a3f4a, { rough: 0.7, transparent: true, opacity: 0.55 }), false);
  const glow = mesh(geo('v3_lantern_glow', () => new THREE.SphereGeometry(0.034, 8, 6)), stdMat(0xffd9a0, { emissive: 0xffd9a0, ei: 1.6 }), false);
  const cap = mesh(geo('v2_lantern_cap', () => new THREE.ConeGeometry(0.05, 0.035, 8).translate(0, 0.085, 0)), stdMat(0x3a3f4a, { rough: 0.6, flat: true }), false);
  cap.userData.noOutline = true;
  grp.add(cage, glow, cap);
  // held out from the body (a point light a hand-span from the cloth blows it out)
  const light = new THREE.PointLight(0xffd9a0, 0.45, 4, 2);
  light.position.set(side * 0.05, 0, 0.06);
  grp.add(light);
  grp.position.set(side * 0.3 * ctx.wide, ctx.chestY - 0.2, 0.14);
  ctx.torso.add(grp);
  ctx.extra = (ctx.extra ?? []).concat([{ type: 'lantern', node: grp, glow, light }]);
}
function crackedHalo(ctx) {
  // Floats a clear hand-span above the scalp (head sits higher on the new
  // bodies — anchor off headR, not a fixed offset, or the hair swallows it).
  const haloY = ctx.headGrp.position.y + ctx.headR * 1.7;
  const haloM = stdMat(GOLD, { emissive: GOLD, ei: 1.3, rough: 0.3, transparent: true, opacity: 0.92 });
  const halo = mesh(geo('v3_halo', () => new THREE.TorusGeometry(0.16, 0.014, 6, 32, Math.PI * 1.5)), haloM, false);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = haloY;
  ctx.torso.add(halo);
  const light = new THREE.PointLight(GOLD, 1.0, 4.5, 2);
  light.position.y = haloY;
  ctx.torso.add(light);
  ctx.extra = (ctx.extra ?? []).concat([{ type: 'halo', node: halo }]);
}
function coatTails(ctx) {
  // two narrow draped tails hanging from the back of the waist, hang-swaying
  const coatM = stdMat(0x5a6a7a, { rough: 0.95, vertexColors: true });
  windSway(coatM, { strength: 0.55, speed: 1.3, heightScale: 0.5, hang: true });
  for (const side of [-1, 1]) {
    const tail = mesh(geo(`v3_coattail_${ctx.wide.toFixed(2)}`, () => drapeShell({
      profile: [
        { y: 0, rx: 0.15 * ctx.wide, rz: 0.125 * ctx.wide, cz: 0, span: 0.34 },
        { y: -0.5, rx: 0.19 * ctx.wide, rz: 0.16 * ctx.wide, cz: -0.03, span: 0.36 },
      ],
      nu: 8, nv: 6, folds: 1, foldAmp: [0.002, 0.012], hemWave: 0.01, hemSideLift: 0.2, thick: 0.013,
      ...DRAPE_NEUTRAL, seed: 53,
    })), coatM, false);
    tail.position.set(0, ctx.chestY - 0.05, 0);
    tail.rotation.y = side * 0.36;
    ctx.torso.add(tail);
  }
}
function fisherCoat(ctx) {
  // long oilskin coat: a draped shell wrapping the lower body, open at the front
  const coatM = stdMat(0xffffff, { rough: 0.8, vertexColors: true });
  const g = geo(`v3_fisher_coat_${ctx.wide.toFixed(2)}`, () => drapeShell({
    profile: [
      { y: ctx.chestY - 0.02, rx: 0.2 * ctx.wide, rz: 0.165 * ctx.wide, cz: -0.005, span: 2.7 },
      { y: ctx.torsoLen * 0.36, rx: 0.2 * ctx.wide, rz: 0.17 * ctx.wide, cz: -0.01, span: 2.72 },
      { y: -ctx.legLen * 0.45, rx: 0.29 * ctx.wide, rz: 0.24 * ctx.wide, cz: -0.02, span: 2.75 },
    ],
    nu: 24, nv: 7, folds: 7, foldAmp: [0.003, 0.03], hemWave: 0.02, hemSideLift: 0.03, thick: 0.015,
    outerTop: 0x4a7482, outerBot: 0x2f4b57, liningTop: 0x9a7a52, liningBot: 0x7a5e40, trim: 0x2a3a42, trimWidth: 0.06, seed: 54,
  }));
  const coat = mesh(g, coatM, true);
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
      // radiant: the Archon glows faintly even at noon (robe, cape and all)
      ctx.materials.bodyM.emissive.setHex(0xfff2d8);
      ctx.materials.bodyM.emissiveIntensity = 0.12;
      if (ctx.materials.capeM) {
        ctx.materials.capeM.emissive.setHex(0xffe9b0);
        ctx.materials.capeM.emissiveIntensity = 0.18;
      }
    },
  }),
  // skin/hair are pinned rather than left to basePalette()'s id hash: the rival's look is
  // established art, and it must not silently reroll just because the id string changed.
  bryn: (kind, a) => ({
    ...archetypeFor('bryn', 'rival', a), build: 'slim', skin: 0xf0d4b0, hair: 0x4a3830,
    hairStyle: 'spiky', armPose: 'hip', iris: 0x8a5a2a, outfit: 'tunic', sleeves: 'rolled', neckwear: 'collar',
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
  climber_bo: (kind, a) => ({ ...archetypeFor('climber_bo', 'villager', a), primary: 0x8a6a48, secondary: 0x5a6478, build: 'broad', sleeves: 'rolled' }),
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
