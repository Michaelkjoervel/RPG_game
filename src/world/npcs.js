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
  taperCapsule, lumpify, drapeShell, bakeParts, solidColor,
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
// v2 SOFT-STYLIZED PEOPLE: every part is smooth and rounded (tapered-capsule
// limbs, rolled boot cuffs, rounded boots and mitt hands, lathed torsos with
// soft hems), hair is softly lumped volume instead of crumpled facets, and all
// cloth — capes, mantles, aprons, coats, hoods — is a real draped shell
// (gfx/materials.js drapeShell: folds, soft hem, thickness, lining) instead of
// flat box panels. Capes hang-sway from the shoulders in the wind. Cached
// geometry bakes a NEUTRAL brightness ramp (vgrad / neutral drape colors) so
// one geometry serves every palette; the per-NPC material color tints it.
// The figure gets the shared soft ink outline (eyes/glows excluded).

// Neutral drape colors for cached, material-tinted cloth.
const DRAPE_NEUTRAL = { outerTop: 0xffffff, outerBot: 0xa99f97, liningTop: 0x8c8279, liningBot: 0x6f6660 };

/** Rounded boot: a squashed capsule along Z with a flattened, softly rolled sole. */
function roundedBootGeo(r) {
  const g = new THREE.CapsuleGeometry(r, r * 1.8, 4, 14);
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
/** Folded boot top / sleeve cuff: a short flared ring with a soft rolled lip. */
function cuffRingGeo(r, h) {
  return new THREE.LatheGeometry([
    new THREE.Vector2(r * 0.9, -h * 0.55), new THREE.Vector2(r * 1.05, -h * 0.5), new THREE.Vector2(r * 1.14, -h * 0.1),
    new THREE.Vector2(r * 1.17, h * 0.25), new THREE.Vector2(r * 1.07, h * 0.46), new THREE.Vector2(r * 0.92, h * 0.42),
  ], 18);
}
/** Smooth tapered, gently curved spike (antlers, spiky locks, horns). */
function softSpikeGeo(len, r0, bend = 0.3, seg = 12) {
  const g = new THREE.CylinderGeometry(r0 * 0.14, r0, len, seg, 6, false);
  g.translate(0, len / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / len));
    pos.setX(i, pos.getX(i) + bend * t * t * len);
  }
  smoothGeometry(g, { creaseAngle: 1.2 });
  return g;
}
/** A soft lock of hair: a rounded teardrop hanging from its root (origin). */
function hairLockGeo(r, len) {
  const g = new THREE.LatheGeometry([ // bottom -> top so faces point outward
    [0.0005, -len], [r * 0.2, -len * 0.97], [r * 0.6, -len * 0.75], [r * 0.92, -len * 0.42], [r, -len * 0.1], [r * 0.75, r * 0.3], [0.0005, r * 0.4],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 12);
  g.scale(1, 1, 0.72);
  return g;
}

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
  const hairM = stdMat(spec.hair, { rough: 0.68, vertexColors: true });
  const primaryM = stdMat(spec.primary, { rough: 0.88, vertexColors: true });
  const secondaryM = stdMat(spec.secondary, { rough: 0.86, vertexColors: true });
  const bootM = stdMat(spec.bootColor ?? shade(spec.secondary, -0.16, -0.12), { rough: 0.8, vertexColors: true });
  const accentM = stdMat(spec.accent ?? GOLD, { rough: 0.4, metal: 0.3, emissive: spec.accent ?? GOLD, ei: 0.25 });
  // eyes: sclera/iris/pupil/glint baked into one vertex-colored mesh per eye
  const eyeM = stdMat(0xffffff, { rough: 0.3, vertexColors: true, emissive: 0xffffff, ei: 0.08, rim: 0.4 });

  const group = new THREE.Group();
  const rig = new THREE.Group(); // idle bob / breath / stoop lives here
  group.add(rig);

  const legLen = h * 0.42, torsoLen = h * 0.34, headR = h * 0.125;
  const hipY = legLen;
  const TL = torsoLen;
  const K = (n) => `${n}_${h.toFixed(2)}_${wide.toFixed(2)}`; // size-keyed cache id
  const noInk = (o) => { o.userData.noOutline = true; return o; };

  group.add(shadowDisc(0.42 * (wide > 1 ? 1.15 : 1)));

  const hips = new THREE.Group();
  hips.position.y = hipY;
  rig.add(hips);

  if (spec.stoop) rig.rotation.x = spec.stoop * 0.22;

  /* legs — tapered trouser capsules into boots with a rolled cuff and a rounded foot */
  function buildLeg(sx) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.095 * wide, 0, 0);
    const trouser = mesh(geo(K('v2_trouser'), () => vgrad(taperCapsule(0.084 * wide, 0.06 * wide, legLen * 0.5, 14), { seed: 3 })), secondaryM);
    trouser.position.y = -legLen * 0.32;
    leg.add(trouser);
    // boot shaft + rolled cuff + rounded boot: one cached mesh
    leg.add(mesh(geo(K('v2_bootset'), () => bakeParts([
      [vgrad(taperCapsule(0.062 * wide, 0.056 * wide, legLen * 0.26, 14), { seed: 4 }), { p: [0, -legLen * 0.78, 0] }],
      [vgrad(cuffRingGeo(0.064 * wide, 0.06), { seed: 5 }), { p: [0, -legLen * 0.6, 0] }],
      [vgrad(roundedBootGeo(0.052 * wide), { seed: 6 }), { p: [0, -legLen + 0.033, 0.036] }],
    ])), bootM));
    hips.add(leg);
    return leg;
  }
  const legL = buildLeg(-1), legR = buildLeg(1);

  /* torso — one lathe from flared hem through waist pinch to rounded shoulders */
  const torso = new THREE.Group();
  hips.add(torso);
  const torsoMesh = mesh(geo(K('v2_torso'), () => {
    const pts = [
      new THREE.Vector2(0.118 * wide, -0.004), new THREE.Vector2(0.168 * wide, 0.012), new THREE.Vector2(0.172 * wide, 0.03),
      new THREE.Vector2(0.158 * wide, TL * 0.26), new THREE.Vector2(0.133 * wide, TL * 0.45),
      new THREE.Vector2(0.148 * wide, TL * 0.68), new THREE.Vector2(0.157 * wide, TL * 0.84),
      new THREE.Vector2(0.126 * wide, TL * 0.96), new THREE.Vector2(0.07 * wide, TL * 1.02), new THREE.Vector2(0.002, TL * 1.04),
    ];
    return vgrad(new THREE.LatheGeometry(pts, 24), { seed: 8, from: 0xa0948a, noise: 0.05 });
  }), primaryM);
  torsoMesh.scale.set(1.06, 1, 0.88); // oval cross-section
  torso.add(torsoMesh);
  const chestY = TL * 0.70, shoulderY = TL * 0.92;
  const belt = mesh(geo(K('v2_belt'), () => {
    const g = new THREE.TorusGeometry(0.148 * wide, 0.019, 8, 28);
    g.rotateX(Math.PI / 2);
    g.scale(1, 1.45, 1);
    return g;
  }), accentM, false);
  belt.scale.set(1.06, 1, 0.88);
  belt.position.y = TL * 0.36;
  torso.add(belt);

  /* long robe skirt (elders, scholars): hangs from the waist over the legs */
  if (spec.robe) {
    const robe = mesh(geo(K('v2_robe'), () => {
      // full enough at the hips to swallow the trouser tops and the tunic hem
      const pts = [
        new THREE.Vector2(0.162 * wide, TL * 0.3), new THREE.Vector2(0.186 * wide, 0.0), new THREE.Vector2(0.212 * wide, -legLen * 0.5),
        new THREE.Vector2(0.238 * wide, -legLen * 0.9), new THREE.Vector2(0.235 * wide, -legLen * 0.935), new THREE.Vector2(0.2 * wide, -legLen * 0.93),
      ].reverse();
      const g = new THREE.LatheGeometry(pts, 26);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { // soft folds deepening toward the hem
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const w = Math.max(0, Math.min(1, -y / (legLen * 0.9)));
        const f = 1 + 0.05 * w * Math.sin(Math.atan2(z, x) * 9 + 0.4);
        pos.setXYZ(i, x * f, y, z * f);
      }
      smoothGeometry(g);
      return vgrad(g, { seed: 9, exp: 0.85, from: 0x9a8e84, noise: 0.05 });
    }), primaryM);
    robe.scale.set(1.04, 1, 0.9);
    torso.add(robe);
  }

  /* work apron (merchants): a gently curved drape over the front + waist tie */
  if (spec.apron) {
    const apron = mesh(geo(K('v2_apron'), () => {
      // waist apron in the torso's own (1.06, 1, 0.88)-scaled space: clears
      // the flared tunic hem and hangs over the knees
      const g = drapeShell({
        profile: [
          { y: TL * 0.38, rx: 0.172 * wide, rz: 0.158 * wide, cz: 0, span: 0.78 },
          { y: TL * 0.05, rx: 0.2 * wide, rz: 0.172 * wide, cz: 0, span: 0.8 },
          { y: -TL * 0.42, rx: 0.215 * wide, rz: 0.19 * wide, cz: -0.01, span: 0.74 },
        ],
        nu: 20, nv: 12, folds: 3, foldAmp: [0.002, 0.012], hemWave: 0.02, hemSideLift: 0.05, thick: 0.012,
        ...DRAPE_NEUTRAL, seed: 10,
      });
      g.rotateY(Math.PI); // drapeShell's θ = 0 is the back; turn it to the front
      return g;
    }), secondaryM);
    torso.add(apron);
    const tie = mesh(geo(K('v2_aprontie'), () => {
      const g = new THREE.TorusGeometry(0.152 * wide, 0.011, 8, 30);
      g.rotateX(Math.PI / 2);
      return g;
    }), bootM, false);
    tie.scale.set(1.12, 1, 1.04);
    tie.position.y = TL * 0.38;
    torso.add(tie);
  }

  /* shoulder mantle (the Order): stern collar-cape over the shoulders */
  if (spec.mantle) {
    const mantleM = stdMat(spec.secondary, { rough: 0.9, vertexColors: true });
    const mantle = mesh(geo(K('v2_mantle'), () => drapeShell({
      profile: [
        { y: TL * 1.0, rx: 0.11 * wide, rz: 0.1 * wide, cz: 0, span: 2.75 },
        { y: TL * 0.95, rx: 0.24 * wide, rz: 0.19 * wide, cz: -0.005, span: 2.72 },
        { y: TL * 0.84, rx: 0.29 * wide, rz: 0.215 * wide, cz: -0.01, span: 2.68 },
        { y: TL * 0.62, rx: 0.3 * wide, rz: 0.222 * wide, cz: -0.012, span: 2.62 },
      ],
      nu: 40, nv: 7, folds: 8, foldAmp: [0.003, 0.014], hemWave: 0.03, hemSideLift: 0.05, thick: 0.013,
      ...DRAPE_NEUTRAL, seed: 11,
    })), mantleM);
    torso.add(mantle);
  }

  /* arms — shoulder cap, tapered sleeve, rolled cuff, rounded mitt hand + thumb */
  function buildArm(sx) {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.205 * wide, shoulderY, 0);
    arm.add(mesh(geo(K('v2_armupper'), () => bakeParts([   // shoulder cap + tapered sleeve
      [vgrad(new THREE.SphereGeometry(0.058 * wide, 16, 12), { seed: 12 }), { p: [0, -0.005, 0], s: [1.08, 0.86, 1] }],
      [vgrad(taperCapsule(0.054 * wide, 0.045 * wide, 0.18, 14), { seed: 13 }), { p: [0, -0.15, 0] }],
    ])), primaryM));
    const cuff = mesh(geo(K('v2_cuff'), () => vgrad(cuffRingGeo(0.045 * wide, 0.045), { seed: 14 })), secondaryM, false);
    cuff.position.y = -0.285;
    arm.add(cuff);
    const hand = new THREE.Group();
    hand.position.y = -0.345;
    hand.add(mesh(geo(`v2_hand_${sx}`, () => bakeParts([   // rounded mitt + thumb
      [new THREE.SphereGeometry(0.047, 14, 10), { s: [0.9, 1.08, 0.96] }],
      [new THREE.CapsuleGeometry(0.017, 0.022, 3, 10), { p: [-sx * 0.033, 0.008, 0.022], r: [0.35, 0, -sx * 0.55] }],
    ])), skinM, false));
    arm.add(hand);
    arm.rotation.z = sx * (0.10 + (spec.stance ?? 0.5) * 0.10);
    torso.add(arm);
    return { pivot: arm, hand };
  }
  const armL = buildArm(-1), armR = buildArm(1);
  if (spec.armPose === 'hip') { armR.pivot.rotation.z = -0.62; armR.pivot.rotation.x = -0.18; }

  /* neck + head */
  const neck = mesh(geo(K('v2_neck'), () => taperCapsule(0.042, 0.05, TL * 0.12, 16)), skinM, false);
  neck.position.y = TL * 1.08;
  torso.add(neck);
  const headGrp = new THREE.Group();
  headGrp.position.y = TL * 1.32;
  torso.add(headGrp);
  headGrp.add(mesh(geo(K('v2_headears'), () => bakeParts([   // head + ears
    [new THREE.SphereGeometry(headR, 26, 18), { s: [0.98, 1.04, 1] }],
    [new THREE.SphereGeometry(headR * 0.17, 10, 8), { p: [-headR * 0.95, headR * 0.02, 0.01], s: [0.62, 1, 0.82] }],
    [new THREE.SphereGeometry(headR * 0.17, 10, 8), { p: [headR * 0.95, headR * 0.02, 0.01], s: [0.62, 1, 0.82] }],
  ])), skinM));

  const masked = spec.hat === 'mask';
  if (!masked) {
    /* stylized face: flattened sclera + iris + pupil + glint, brows, nose, smile */
    const nose = noInk(mesh(geo(K('v2_nose'), () => new THREE.SphereGeometry(headR * 0.09, 12, 10)), skinM, false));
    nose.scale.set(1, 0.9, 0.85);
    nose.position.set(0, -headR * 0.06, headR * 0.97);
    headGrp.add(nose);
    const irisHex = spec.iris ?? 0x5a4632;
    const eyeG = geo(`${K('v2_eye')}_${irisHex}`, () => bakeParts([
      [solidColor(new THREE.SphereGeometry(headR * 0.17, 14, 10), 0xfdf8ee), { s: [1, 1.12, 0.5] }],
      [solidColor(new THREE.SphereGeometry(headR * 0.105, 12, 8), irisHex), { p: [0, 0, headR * 0.07], s: [1, 1.06, 0.7] }],
      [solidColor(new THREE.SphereGeometry(headR * 0.055, 10, 6), 0x221a14), { p: [0, 0, headR * 0.125], s: [1, 1.06, 0.7] }],
      [solidColor(new THREE.SphereGeometry(headR * 0.034, 8, 6), 0xffffff), { p: [headR * 0.045, headR * 0.05, headR * 0.155] }],
    ]));
    for (const sx of [-1, 1]) {
      const eye = noInk(mesh(eyeG, eyeM, false));
      eye.position.set(sx * headR * 0.36, headR * 0.10, headR * 0.92);
      headGrp.add(eye);
    }
    headGrp.add(noInk(mesh(geo(K('v2_brows'), () => bakeParts([-1, 1].map((sx) => [
      vgrad(new THREE.CapsuleGeometry(headR * 0.045, headR * 0.26, 4, 10), { from: 0xf2ede8, seed: 25 }),
      { p: [sx * headR * 0.36, headR * 0.42, headR * 0.95], r: [0, 0, Math.PI / 2 - sx * 0.1] },
    ]))), hairM, false)));
    const smile = noInk(mesh(geo(K('v2_smile'), () => new THREE.TorusGeometry(headR * 0.115, headR * 0.034, 8, 16, Math.PI * 0.75)), stdMat(0xb5765a, { rough: 0.6 }), false));
    smile.position.set(0, -headR * 0.30, headR * 0.96);
    smile.rotation.z = -Math.PI * 0.875;
    headGrp.add(smile);
  }

  /* hair — per-id style with soft, smoothly lumped volume (never crumpled
     facets). A hood or masked hood replaces the hair entirely — lobes would
     poke straight through the fabric shell otherwise. */
  // All of a style's pieces are baked into ONE cached geometry per style/size:
  // one draw call, one continuous gradient (nape -> crown), and an ink outline
  // pushed radially from the head so overlapping locks don't web the back of
  // the head with inner lines.
  const lobe = (r, lump, seed, ws = 16, hs = 12) => lumpify(new THREE.SphereGeometry(r, ws, hs), lump, seed);
  const hooded = spec.hat === 'hood' || spec.hat === 'mask';
  const style = hooded ? 'none' : (spec.hairStyle ?? 'crop');
  const hairKey = `${K('v2_hair')}_${style}_${spec.beard ? 1 : 0}`;
  const hairG = style === 'none' && !spec.beard ? null : geo(hairKey, () => {
    const parts = [];
    const add = (g, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) =>
      parts.push([g, { p: [x * headR, y * headR, z * headR], r: [rx, 0, rz], s: [sx, sy, sz] }]);
    if (style !== 'bald' && style !== 'none') {
      add(lobe(headR * 1.04, 0.05, 31, 22, 16), 0, 0.34, -0.10, 1.02, 0.9, 1.0);
      // soft locks hanging around the back of the head — structure for the camera's view
      // (7 overlapping locks = one continuous scalloped hem, not a ring of beads)
      if (style !== 'bob') {
        for (let i = 0; i < 7; i++) {
          const a = (i / 6 - 0.5) * 2.9;
          const g = lumpify(hairLockGeo(headR * 0.44, headR * 0.66), 0.04, 44 + i);
          g.rotateX(0.2); g.rotateY(a);           // tip tucks out, then swung around the head
          add(g, -Math.sin(a) * 0.8, 0.14, -0.1 - Math.cos(a) * 0.8);
        }
      }
    }
    if (style === 'crop' || style === 'side' || style === 'spiky') add(lobe(headR * 0.5, 0.05, 32), 0, -0.12, -0.62, 1.35, 0.8, 0.7);
    if (style === 'crop' || style === 'bun' || style === 'ponytail' || style === 'spiky') add(lobe(headR * 0.46, 0.04, 40), 0, 1.0, 0.42, 1.75, 0.5, 0.85);
    if (style === 'side' || style === 'bob') {
      add(lobe(headR * 0.42, 0.05, 33), -0.28, 1.02, 0.55, 1.5, 0.6, 0.9);
      add(lobe(headR * 0.34, 0.05, 34), 0.45, 0.98, 0.5, 1.2, 0.55, 0.9);
    }
    if (style === 'bob') {
      for (const sx of [-1, 1]) add(lobe(headR * 0.42, 0.04, 35), sx * 0.85, -0.1, -0.12, 0.58, 1.38, 0.88);
      add(lobe(headR * 0.62, 0.04, 36), 0, -0.05, -0.62, 1.5, 1.2, 0.72);
    }
    if (style === 'bun') add(lobe(headR * 0.38, 0.04, 36), 0, 0.78, -0.85);
    if (style === 'ponytail') add(lumpify(hairLockGeo(headR * 0.3, headR * 1.7), 0.05, 37), 0, 0.3, -1.0, 1, 1, 1, 0.35, 0);
    if (style === 'spiky') {
      // five chunky spikes swept BACK and out from the crown (rooted inside
      // the hair volume) — reads as windswept spiky hair, not horns
      const spikes = [[-0.42, 0.95, 0.2, 0.62, 0.3, -1.0, 0.65], [-0.12, 1.08, 0.3, 0.7, 0.32, -1.25, 0.2],
        [0.2, 1.05, 0.22, 0.66, 0.3, -1.2, -0.3], [0.48, 0.9, 0.05, 0.56, 0.28, -0.95, -0.75], [0.05, 0.9, -0.3, 0.6, 0.3, -1.7, 0.05]];
      for (const [x, y, z, len, r, rx, rz] of spikes) add(softSpikeGeo(headR * len, headR * r, 0.25), x, y, z, 1, 1, 1, rx, rz);
    }
    if (style === 'bald') add(lobe(headR * 1.0, 0.04, 38, 24, 16), 0, -0.02, -0.15, 1.04, 0.42, 1.0);
    if (spec.beard) {
      const g = lumpify(hairLockGeo(headR * 0.46, headR * 1.0), 0.06, 39);
      g.scale(1.15, 1, 0.8);
      add(g, 0, -0.42, 0.55, 1, 1, 1, 0.15, 0);
    }
    if (!parts.length) return null;
    for (const [g] of parts) { if (g.attributes.normal == null) g.computeVertexNormals(); }
    const merged = bakeParts(parts);
    smoothGeometry(merged);
    const hc = new THREE.Vector3(0, headR * 0.1, -headR * 0.1);
    const pos = merged.attributes.position, on = new Float32Array(pos.count * 3), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).sub(hc).normalize();
      on[i * 3] = v.x; on[i * 3 + 1] = v.y; on[i * 3 + 2] = v.z;
    }
    merged.setAttribute('lfOutlineNormal', new THREE.BufferAttribute(on, 3));
    return vgrad(merged, { from: 0xa89a8c, seed: 17, noise: 0.05 });
  });
  if (hairG) headGrp.add(mesh(hairG, hairM, false));

  // ---- hat / headwear
  let hatMesh = null;
  if (spec.hat === 'hood' || spec.hat === 'mask') {
    // a real hood: draped shell over the head, open at the face, soft point at the back
    hatMesh = mesh(geo(K('v2_hood'), () => drapeShell({
      profile: [
        { y: headR * 1.28, rx: headR * 0.06, rz: headR * 0.07, cz: -headR * 0.36, span: 2.3 },
        { y: headR * 1.0, rx: headR * 0.94, rz: headR * 1.0, cz: -headR * 0.14, span: 2.34 },
        { y: headR * 0.2, rx: headR * 1.14, rz: headR * 1.14, cz: -headR * 0.06, span: 2.36 },
        { y: -headR * 0.75, rx: headR * 1.24, rz: headR * 1.14, cz: -headR * 0.1, span: 2.5 },
      ],
      nu: 34, nv: 10, folds: 5, foldAmp: [0.002, 0.012], hemWave: 0.02, hemSideLift: 0.04, thick: 0.014,
      ...DRAPE_NEUTRAL, seed: 19,
    })), secondaryM);
    headGrp.add(hatMesh);
    if (spec.hat === 'mask') {
      const maskM = stdMat(0xdedad2, { rough: 0.45, emissive: 0xdedad2, ei: 0.06 });
      const maskG = geo(K('v2_mask'), () => {
        const g = new THREE.SphereGeometry(headR * 1.02, 28, 14, 0, Math.PI * 2, 0, 0.95);
        g.rotateX(Math.PI / 2); // cap facing +Z
        return g;
      });
      const face = mesh(maskG, maskM, false);
      face.position.set(0, -0.01, headR * 0.02);
      hatMesh.add(face);
      /* two slit "eyes" painted on the mask so it reads at distance */
      for (const sx of [-1, 1]) {
        const slit = noInk(mesh(geo(K('v2_mask_slit'), () => new THREE.CapsuleGeometry(headR * 0.028, headR * 0.12, 4, 8)), stdMat(0x2a2530, { rough: 0.4 }), false));
        slit.rotation.z = Math.PI / 2 + sx * 0.35;
        slit.position.set(sx * headR * 0.3, headR * 0.12, headR * 1.0);
        hatMesh.add(slit);
      }
    }
  } else if (spec.hat === 'straw') {
    const strawM = stdMat(0xd9b96e, { rough: 0.9, vertexColors: true });
    hatMesh = new THREE.Group();
    const hat = mesh(geo(K('v2_strawhat'), () => {
      const H = headR;
      // profile walks crown -> brim edge -> brim underside; reversed below so
      // the lathe's faces point outward (three expects bottom -> top order)
      const g = new THREE.LatheGeometry([
        [0.001, 0.98 * H], [0.22 * H, 0.94 * H], [0.62 * H, 0.6 * H], [0.98 * H, 0.16 * H], [1.08 * H, 0.08 * H],
        [1.6 * H, 0.01 * H], [1.95 * H, -0.1 * H], [1.97 * H, -0.13 * H], [1.9 * H, -0.12 * H], [1.55 * H, -0.03 * H],
        [1.02 * H, 0.0], [0.92 * H, 0.03 * H],
      ].reverse().map(([x, y]) => new THREE.Vector2(x, y)), 40);
      return vgrad(g, { seed: 20 });
    }), strawM, false);
    const band = mesh(geo(K('v2_hat_band'), () => {
      const g = new THREE.TorusGeometry(headR * 1.0, headR * 0.07, 8, 34);
      g.rotateX(Math.PI / 2);
      g.scale(1, 1.6, 1);
      return vgrad(g, { seed: 24 });
    }), bootM, false);
    band.position.y = headR * 0.14;
    hatMesh.add(hat, band);
    hatMesh.position.y = headR * 0.8;
  } else if (spec.hat === 'circlet') {
    hatMesh = mesh(geo(K('v2_circlet'), () => new THREE.TorusGeometry(headR * 0.98, 0.012, 8, 40)), accentM, false);
    hatMesh.rotation.x = Math.PI / 2;
    hatMesh.position.y = headR * 0.62;
  } else if (spec.hat === 'goggles') {
    hatMesh = new THREE.Group();
    const band = mesh(geo(K('v2_gog_band'), () => vgrad(new THREE.TorusGeometry(headR * 1.0, 0.012, 8, 40), { from: 0xf2ede8, seed: 26 })), hairM, false);
    band.rotation.y = Math.PI / 2;
    const lensGeo = geo(K('v2_gog_lens'), () => new THREE.CircleGeometry(headR * 0.32, 24));
    const rimGeo = geo(K('v2_gog_rim'), () => new THREE.TorusGeometry(headR * 0.33, 0.01, 8, 24));
    const lensM = stdMat(0xbfe4ff, { rough: 0.2, metal: 0.4, transparent: true, opacity: 0.85, emissive: 0xbfe4ff, ei: 0.2 });
    const rimM = stdMat(0x5a4e44, { rough: 0.5, metal: 0.4 });
    for (const sx of [-1, 1]) {
      const l = mesh(lensGeo, lensM, false); l.position.set(sx * headR * 0.4, 0.02, headR * 0.9);
      const r = mesh(rimGeo, rimM, false); r.position.set(sx * headR * 0.4, 0.02, headR * 0.9);
      hatMesh.add(l, r);
    }
    hatMesh.add(band);
  }
  if (hatMesh) headGrp.add(hatMesh);

  // ---- cape: a draped, folded shell over the shoulders that hang-sways in the wind
  if (spec.cape) {
    const capeLen = TL * 1.0 + legLen * 0.55;
    const capeM = stdMat(spec.cape === true ? spec.secondary : spec.cape, { rough: 0.95, vertexColors: true });
    windSway(capeM, { strength: 0.35, speed: 1.1, heightScale: capeLen, hang: true });
    const cape = mesh(geo(K('v2_cape'), () => {
      const top = TL * 1.0;
      const g = drapeShell({ // rolls over the shoulders from the collar, then falls behind the arms
        profile: [
          { y: top, rx: 0.11 * wide, rz: 0.1 * wide, cz: 0, span: 2.2 },
          { y: TL * 0.94, rx: 0.25 * wide, rz: 0.18 * wide, cz: -0.02, span: 2.0 },
          { y: TL * 0.8, rx: 0.3 * wide, rz: 0.2 * wide, cz: -0.04, span: 1.85 },
          { y: TL * 0.2, rx: 0.31 * wide, rz: 0.21 * wide, cz: -0.07, span: 1.72 },
          { y: -legLen * 0.55, rx: 0.34 * wide, rz: 0.24 * wide, cz: -0.11, span: 1.6 },
        ],
        nu: 52, nv: 14, folds: 7, foldAmp: [0.006, 0.055], foldDrift: 1.1, hemWave: 0.018, hemSideLift: 0.12, thick: 0.016,
        ...DRAPE_NEUTRAL, seed: 23,
      });
      g.translate(0, -top, 0); // hang from the origin (hang-sway reads -y as the drop)
      return g;
    }), capeM, true);
    cape.position.y = TL * 1.0;
    torso.add(cape);
    // shoulder yoke so the cape reads as worn, not glued: a soft rolled collar
    const yoke = mesh(geo(K('v2_capeyoke'), () => {
      const g = new THREE.TorusGeometry(0.13 * wide, 0.03, 8, 24, Math.PI * 1.3);
      g.rotateZ(-Math.PI * 1.15);
      g.rotateX(Math.PI / 2);
      return vgrad(g, { seed: 27 });
    }), capeM, false);
    yoke.position.set(0, TL * 0.94, -0.015);
    torso.add(yoke);
  }

  const ctx = {
    group, rig, hips, torso, headGrp, legL, legR, armL, armR, wide, height: h,
    chestY, shoulderY, torsoLen: TL, legLen, headR,
    materials: { skinM, hairM, primaryM, secondaryM, accentM, bootM },
  };
  if (typeof spec.special === 'function') spec.special(ctx);

  // Soft ink outline (people + creatures only). One material per NPC so
  // nothing leaks between figures; eyes/glows/transparent bits are skipped.
  addOutline(group, { color: 0x2a1d2b, thickness: 1.9 });

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
  const p = mesh(geo('v2_pauldron', () => {
    const g = lumpify(new THREE.IcosahedronGeometry(0.12, 3), 0.16, 12);
    smoothGeometry(g);
    return g;
  }), rockM);
  p.position.set(side * 0.215 * ctx.wide, ctx.shoulderY + 0.05, 0);
  p.scale.set(1, 0.7, 0.9);
  ctx.torso.add(p);
}
function spectacles(ctx) {
  const rimM = stdMat(0x4a4038, { rough: 0.45, metal: 0.5 });
  const r = ctx.headR;
  for (const sx of [-1, 1]) {
    const rim = mesh(geo('v2_spec_rim', () => new THREE.TorusGeometry(0.032, 0.007, 8, 24)), rimM, false);
    rim.userData.noOutline = true;
    rim.position.set(sx * r * 0.36, r * 0.10, r * 0.95);
    ctx.headGrp.add(rim);
  }
  const bridge = mesh(geo('v2_spec_bridge', () => new THREE.CapsuleGeometry(0.004, 0.02, 3, 8).rotateZ(Math.PI / 2)), rimM, false);
  bridge.userData.noOutline = true;
  bridge.position.set(0, r * 0.12, r * 0.96);
  ctx.headGrp.add(bridge);
}
function halfCape(ctx, outer = 0x2a2f3f, lining = 0xff8a4a) {
  // one-shoulder rival cape — asymmetric silhouette, warm lining flash. A real
  // draped shell hanging off the right shoulder (bespoke colors, not tinted).
  const len = ctx.torsoLen * 0.95 + ctx.legLen * 0.2;
  const capeM = stdMat(0xffffff, { rough: 0.92, vertexColors: true });
  windSway(capeM, { strength: 0.4, speed: 1.2, heightScale: len, hang: true });
  const top = ctx.shoulderY + 0.06;
  const capeG = geo(`v2_halfcape_${ctx.torsoLen.toFixed(2)}_${ctx.wide.toFixed(2)}`, () => {
    const w = ctx.wide;
    const g = drapeShell({
      profile: [
        { y: 0, rx: 0.14 * w, rz: 0.11 * w, cz: 0, span: 1.5 },
        { y: -0.1, rx: 0.26 * w, rz: 0.18 * w, cz: -0.02, span: 1.45 },
        { y: -len, rx: 0.3 * w, rz: 0.21 * w, cz: -0.06, span: 1.3 },
      ],
      nu: 40, nv: 14, folds: 5, foldAmp: [0.004, 0.04], hemWave: 0.03, hemSideLift: 0.16, thick: 0.014,
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
  for (const side of [-1, 1]) {
    const horn = mesh(geo('v2_antler', () => softSpikeGeo(0.28, 0.026, 0.28, 12)), antlerM, false);
    horn.position.set(side * 0.085, ctx.headR * 1.0, -ctx.headR * 0.1);
    horn.rotation.z = side * -0.42;
    horn.rotation.x = -0.15;
    horn.scale.x = side;
    ctx.headGrp.add(horn);
    const tine = mesh(geo('v2_antler_tine', () => softSpikeGeo(0.12, 0.016, 0.3, 10)), antlerM, false);
    tine.position.set(side * 0.13, ctx.headR * 1.12, -ctx.headR * 0.08);
    tine.rotation.z = side * -1.0;
    tine.scale.x = side;
    ctx.headGrp.add(tine);
  }
}
function lantern(ctx, side = 1) {
  const grp = new THREE.Group();
  const cage = mesh(geo('v2_lantern_cage', () => {
    const g = new THREE.LatheGeometry([
      [0.001, 0.07], [0.022, 0.066], [0.05, 0.045], [0.052, -0.04], [0.04, -0.056], [0.001, -0.058],
    ].reverse().map(([x, y]) => new THREE.Vector2(x, y)), 8);
    return g;
  }), stdMat(0x3a3f4a, { rough: 0.7, transparent: true, opacity: 0.55 }), false);
  const glow = mesh(geo('v2_lantern_glow', () => new THREE.SphereGeometry(0.034, 14, 10)), stdMat(0xffd9a0, { emissive: 0xffd9a0, ei: 1.6 }), false);
  const cap = mesh(geo('v2_lantern_cap', () => new THREE.ConeGeometry(0.05, 0.035, 8).translate(0, 0.085, 0)), stdMat(0x3a3f4a, { rough: 0.6, flat: true }), false);
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
  const halo = mesh(geo('v2_halo', () => new THREE.TorusGeometry(0.16, 0.014, 10, 48, Math.PI * 1.5)), haloM, false);
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
    const tail = mesh(geo(`v2_coattail_${ctx.wide.toFixed(2)}`, () => drapeShell({
      profile: [
        { y: 0, rx: 0.15 * ctx.wide, rz: 0.125 * ctx.wide, cz: 0, span: 0.34 },
        { y: -0.5, rx: 0.19 * ctx.wide, rz: 0.16 * ctx.wide, cz: -0.03, span: 0.36 },
      ],
      nu: 12, nv: 10, folds: 1, foldAmp: [0.002, 0.012], hemWave: 0.01, hemSideLift: 0.2, thick: 0.013,
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
  const g = geo(`v2_fisher_coat_${ctx.wide.toFixed(2)}`, () => drapeShell({
    profile: [
      { y: ctx.chestY - 0.02, rx: 0.19 * ctx.wide, rz: 0.165 * ctx.wide, cz: -0.005, span: 2.7 },
      { y: ctx.torsoLen * 0.36, rx: 0.2 * ctx.wide, rz: 0.17 * ctx.wide, cz: -0.01, span: 2.72 },
      { y: -ctx.legLen * 0.45, rx: 0.29 * ctx.wide, rz: 0.24 * ctx.wide, cz: -0.02, span: 2.75 },
    ],
    nu: 44, nv: 12, folds: 7, foldAmp: [0.003, 0.03], hemWave: 0.02, hemSideLift: 0.03, thick: 0.015,
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
