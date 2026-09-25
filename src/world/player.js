// ============================================================================
// player.js — the Warden: character model, movement, procedural animation,
// interaction prompts, and the party-lead follower.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createPlayer(world) -> { object3D, update(dt), pos /*Vector3*/, face /*rad*/,
//                            teleport(x,z,face?), setFrozen(bool) }
//
// Design goal: moving around must feel like a polished console action-adventure.
// Every constant below is a feel decision — tune with care.
// ============================================================================
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { G } from '../core/state.js';
import { input } from '../core/input.js';
import { clamp, clamp01, lerp, damp, dampAngle, shortAngle, TAU } from '../core/math.js';
import {
  disposeGroup, applyVertexGradient, contactShadow, applyLook, addOutline, smoothGeometry, sphericalNormals,
  taperCapsule, lumpify, ribbonGeo, drapeShell, bakeParts, solidColor,
} from '../gfx/materials.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ----------------------------- movement tuning ----------------------------- */
const WALK_SPEED = 3.2;        // u/s — contract value
const RUN_SPEED = 6.0;         // u/s — contract value
const ACCEL_LAMBDA = 11.0;     // gaining speed: snappy start
const DECEL_LAMBDA = 5.2;      // losing speed: soft, weighty stop
const TURN_LAMBDA_WALK = 9.0;  // model turn damping at walk
const TURN_LAMBDA_RUN = 12.5;  // sharper tracking at run
const PLAYER_RADIUS = 0.35;    // collision circle
const BOUNDS_MARGIN = 1.6;     // keep this far inside the zone edge
const SLOPE_SAMPLE = 0.6;      // how far ahead we sample terrain for slope damp
const SLOPE_UP_DRAG = 0.62;    // speed factor lost per unit of uphill slope
const MAX_WADE_DEPTH = 0.5;    // deeper water blocks movement (no swim system)
const GROUND_LAMBDA = 16.0;    // vertical stick-to-terrain damping
const SKID_ANGLE = 2.0;        // rad — direction reversal that triggers a skid
const SKID_TIME = 0.18;
const LAND_DIP_VY = -5.0;      // downward speed that earns a landing dip
/* ----------------------------- animation tuning ---------------------------- */
const STRIDE_WALK = 0.95;      // meters per half-step at walk
const STRIDE_RUN = 1.55;       // meters per half-step at run
const BOB_WALK = 0.030;
const BOB_RUN = 0.062;
const LEAN_RUN = 0.17;         // forward pitch at full sprint
const IDLE_LOOK_MIN = 4.0;     // seconds between idle look-arounds
const IDLE_LOOK_MAX = 8.5;
const SNOWLINE_Y = 12;         // mountain terrain above this = snow footsteps
/* ----------------------------- follower tuning ----------------------------- */
const FOLLOW_DIST = 2.2;       // trail distance behind the player — contract value
// The camera sits directly behind the player, so a follower centred on the trail
// fills the frame. Offset it to the player's right and fade it out if it still
// ends up in the lens (sharp turns, backing up into it).
const FOLLOW_SIDE = 0.95;      // lateral offset from the trail line
const FOLLOW_FADE_NEAR = 1.7;  // fully invisible at/below this distance to camera
const FOLLOW_FADE_FAR = 3.1;   // fully opaque at/above this distance
const FOLLOW_TELEPORT = 12;    // snap to player if further than this
const TRAIL_SPACING = 0.22;    // breadcrumb spacing
const TRAIL_CAP = 64;          // ring buffer size (≥ 14u of path)
const RESONANCE_WALK_METERS = 140; // walked together -> +resonanceWalks tick

const BIOME_SURFACE = {
  meadow: 'grass', forest: 'grass', glade: 'grass', lake: 'grass',
  town: 'stone', cave: 'stone', mountain: 'stone', ruins: 'stone', spire: 'stone',
};

/* ============================ Warden model =============================== */
/* v2 SOFT-STYLIZED WARDEN. The default camera looks at the Warden's BACK, so
   the back is the hero view: a layered, draped cloak — hood cowl -> scalloped
   shoulder capelet -> long folded cloak with a gold-trimmed, undulating hem.
   The long cloak is ONE skinned shell whose three bones ARE the cloakSegs
   pivots animate() already swings (same refs contract as before), so it bends
   continuously instead of hinging like stacked boards. Everything else is
   smooth and rounded (tapered-capsule limbs, rounded boots and hands, soft
   merged hair volume), carries the shared soft look, and the figure gets the
   soft ink outline. Build-time only — nothing here allocates per frame. */

// v2 soft look: smooth by default + the shared wrapped-terminator/rim hook.
function M(color, { rough = 0.82, metal = 0, emissive = 0x000000, ei = 0.0, flat = false, vc = false, side = THREE.FrontSide, rim = 1 } = {}) {
  return applyLook(new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal, flatShading: flat,
    emissive, emissiveIntensity: ei, vertexColors: vc, side,
  }), { rim });
}

/* Build-time color helpers (never called per frame). */
const _shadeCol = new THREE.Color();
function shade(hex, dl, ds = 0) {
  _shadeCol.setHex(hex).offsetHSL(0, ds, dl);
  return _shadeCol.getHex();
}
/** Vertical two-tone ramp baked into vertex colors: darker hem, lighter crown. */
function grad(geom, base, { down = 0.10, up = 0.07, noise = 0.045, seed = 3, exp = 1 } = {}) {
  applyVertexGradient(geom, { from: shade(base, -down), to: shade(base, up), noise, seed, exp });
  return geom;
}

/**
 * Builds the stylized Warden (~1.6u tall, feet at y=0, faces +Z).
 * Returns { group, refs } — refs are the animation handles.
 */
function buildWarden() {
  const P = { // palette — bible anchors: dusk purple cloak, shard-gold trim, warm skin
    skin: 0xf6c9a0, hair: 0xb2683a, tunic: 0xead9bd,
    pants: 0x4c4560, boots: 0x6a4632, bootCuff: 0x7d573f, belt: 0x3b3347,
    cloak: 0x5b4a8a, gold: 0xffe9b0, satchel: 0x8a6b42, scarf: 0xe08a48,
    iris: 0x6a4527,
  };
  // Shared vertex-color materials: every clothing/hair mesh bakes its own
  // two-tone ramp (grad()) so nothing reads as one flat swatch.
  const mats = {
    skin: M(P.skin, { rough: 0.62 }),
    cloth: M(0xffffff, { rough: 0.86, vc: true }),
    hair: M(0xffffff, { rough: 0.66, vc: true }),
    eye: M(0xffffff, { rough: 0.3, vc: true, emissive: 0xffffff, ei: 0.08, rim: 0.4 }),
    belt: M(P.belt, { rough: 0.7 }),
    gold: M(P.gold, { rough: 0.38, metal: 0.35, emissive: 0xffe9b0, ei: 0.14 }),
    scarf: M(P.scarf, { rough: 0.8, emissive: 0xe08a48, ei: 0.08 }),
  };
  const mesh = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; return m; };
  const gmesh = (geo, base, opts, useHair = false) => mesh(grad(geo, base, opts), useHair ? mats.hair : mats.cloth);
  const noInk = (o) => { o.userData.noOutline = true; return o; };

  const group = new THREE.Group();
  group.name = 'warden';
  const rig = new THREE.Group();     // animation offsets (bob, dip, bank)
  group.add(rig);
  const hips = new THREE.Group();    // hip joint — legs + torso hang off this
  hips.position.y = 0.78;
  rig.add(hips);

  /* soft AO disc plants the Warden on the ground */
  const shadow = contactShadow(0.52, 0.8);
  shadow.position.y = 0.02;
  group.add(shadow);

  /* legs — tapered trouser capsules, soft folded boot cuffs, rounded boots */
  function bootGeo() {
    const g = new THREE.CapsuleGeometry(0.056, 0.1, 6, 18);
    g.rotateX(Math.PI / 2);          // length onto Z (toe forward)
    g.scale(1.0, 0.7, 1.0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {  // flatten the sole, keep a soft rolled edge
      const y = pos.getY(i);
      if (y < -0.018) pos.setY(i, -0.018 + (y + 0.018) * 0.28);
      const z = pos.getZ(i);            // toe a touch lower and rounder than the heel
      if (z > 0.02) pos.setY(i, pos.getY(i) - (z - 0.02) * 0.08);
    }
    smoothGeometry(g);
    return g;
  }
  function buildLeg(sideX) {
    const thigh = new THREE.Group();
    thigh.position.set(sideX, 0, 0);
    // thigh + a knee ball centred on the knee pivot: the joint stays closed at
    // any bend (no gap between trouser and boot top when the shin swings)
    const thighMesh = mesh(grad(bakeParts([
      [taperCapsule(0.079, 0.061, 0.25)],
      [new THREE.SphereGeometry(0.06, 18, 14), { p: [0, -0.21, 0] }],
    ]), P.pants, { seed: 4 }), mats.cloth);
    thighMesh.position.y = -0.17;
    thigh.add(thighMesh);
    const shin = new THREE.Group();
    shin.position.y = -0.38;
    // folded boot top: a short flared ring, soft-rolled at the lip
    const cuffG = new THREE.LatheGeometry([
      new THREE.Vector2(0.055, -0.028), new THREE.Vector2(0.062, -0.025), new THREE.Vector2(0.067, -0.006),
      new THREE.Vector2(0.069, 0.012), new THREE.Vector2(0.064, 0.022), new THREE.Vector2(0.056, 0.02),
    ], 26);
    shin.add(mesh(bakeParts([   // boot shaft + rolled cuff + rounded boot: one mesh
      [grad(taperCapsule(0.058, 0.05, 0.23), P.boots, { down: 0.08, up: 0.06, seed: 6 }), { p: [0, -0.19, 0] }],
      [grad(cuffG, P.bootCuff, { seed: 7 }), { p: [0, -0.05, 0] }],
      [grad(bootGeo(), P.boots, { down: 0.07, up: 0.05, seed: 8 }), { p: [0, -0.378, 0.04] }],
    ]), mats.cloth));
    thigh.add(shin);
    hips.add(thigh);
    return { thigh, shin };
  }
  const legL = buildLeg(-0.095);
  const legR = buildLeg(0.095);

  /* torso — pivots at the hips so lean reads from the waist. A-line tunic
     skirt with a soft wavy hem + lathe chest (waist pinch -> shoulders). */
  const torso = new THREE.Group();
  hips.add(torso);
  // Every static, torso-rigid cloth piece (skirt, strap, scarf tail, capelet,
  // hood) is baked into ONE mesh at the end — see torsoCloth below.
  const torsoCloth = [];
  const skirtG = new THREE.LatheGeometry([
    new THREE.Vector2(0.118, 0.085), new THREE.Vector2(0.176, -0.04), new THREE.Vector2(0.206, -0.115),
    new THREE.Vector2(0.186, -0.125), new THREE.Vector2(0.15, -0.09), new THREE.Vector2(0.14, 0.02),
    new THREE.Vector2(0.148, 0.12), new THREE.Vector2(0.152, 0.215),
  ].reverse(), 28);
  {
    const pos = skirtG.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const w = Math.max(0, Math.min(1, (0.03 - y) / 0.14));   // only the lower skirt ripples
      const f = 1 + 0.045 * w * Math.sin(Math.atan2(z, x) * 7 + 0.6);
      pos.setXYZ(i, x * f, y, z * f);
    }
    smoothGeometry(skirtG);
  }
  torsoCloth.push([grad(skirtG, P.tunic, { down: 0.13, up: 0.05, seed: 11 }), { p: [0, 0.09, 0] }]);
  // chest lathe is designed for its animated base scale (1.15, 1, 0.92) — the
  // breath code in animate() overwrites scale every frame with exactly that.
  const chestPts = [
    new THREE.Vector2(0.128, 0.18), new THREE.Vector2(0.121, 0.235), new THREE.Vector2(0.127, 0.29),
    new THREE.Vector2(0.139, 0.35), new THREE.Vector2(0.146, 0.41), new THREE.Vector2(0.138, 0.465),
    new THREE.Vector2(0.112, 0.505), new THREE.Vector2(0.07, 0.535), new THREE.Vector2(0.002, 0.548),
  ];
  const chest = gmesh(new THREE.LatheGeometry(chestPts, 28), P.tunic, { down: 0.09, up: 0.06, seed: 12 });
  chest.scale.set(1.15, 1, 0.92);
  torso.add(chest);
  const beltG = new THREE.TorusGeometry(0.146, 0.021, 10, 32);
  beltG.rotateX(Math.PI / 2);
  beltG.scale(1.05, 1.45, 0.86);
  const belt = mesh(beltG, mats.belt);
  belt.position.y = 0.205;
  torso.add(belt);
  const buckle = mesh(new RoundedBoxGeometry(0.058, 0.048, 0.022, 2, 0.009), mats.gold);
  buckle.position.set(0, 0.205, 0.143);
  torso.add(buckle);
  /* charm pouch on the left hip — where the Charms live */
  const pouch = new THREE.Group();
  pouch.position.set(-0.15, 0.135, 0.085);
  pouch.rotation.y = 0.35;
  const pouchBody = mesh(bakeParts([
    [grad(new THREE.SphereGeometry(0.056, 18, 14), P.satchel, { seed: 13 }), { s: [1.0, 1.08, 0.74] }],
    [grad(new RoundedBoxGeometry(0.086, 0.042, 0.058, 2, 0.014), shade(P.satchel, -0.08), { seed: 14 }), { p: [0, 0.052, 0] }],
  ]), mats.cloth);
  const pouchBead = noInk(mesh(new THREE.SphereGeometry(0.014, 10, 8), mats.gold, false));
  pouchBead.position.set(0, 0.02, 0.044);
  pouch.add(pouchBody, pouchBead);
  torso.add(pouch);
  /* satchel on the right hip + strap across the chest — signature silhouette bit */
  const satchel = new THREE.Group();
  satchel.position.set(0.19, 0.10, -0.03);
  satchel.rotation.z = -0.12;
  const satchelBody = mesh(bakeParts([
    [grad(new RoundedBoxGeometry(0.16, 0.14, 0.085, 3, 0.026), P.satchel, { down: 0.12, seed: 15 })],
    [grad(new RoundedBoxGeometry(0.166, 0.068, 0.095, 3, 0.022), 0x76582f, { seed: 16 }), { p: [0, 0.052, 0] }],
  ]), mats.cloth);
  const satchelClasp = noInk(mesh(new THREE.SphereGeometry(0.014, 10, 8), mats.gold, false));
  satchelClasp.position.set(0, 0.018, 0.05);
  satchel.add(satchelBody, satchelClasp);
  torso.add(satchel);
  const strapAxis = (p, o) => o.set(p.x, 0, p.z); // thickness points away from the body axis
  torsoCloth.push([grad(ribbonGeo([
    new THREE.Vector3(0.2, 0.14, 0.02), new THREE.Vector3(0.15, 0.22, 0.118), new THREE.Vector3(0.04, 0.32, 0.142),
    new THREE.Vector3(-0.07, 0.41, 0.132), new THREE.Vector3(-0.14, 0.49, 0.06), new THREE.Vector3(-0.13, 0.515, -0.05),
  ], 0.042, 0.014, strapAxis), P.satchel, { seed: 17 })]);

  /* arms — shoulder cap, tapered sleeve, soft cuff, rounded mitt hand + thumb */
  function buildArm(sideX) {
    const sgn = Math.sign(sideX);
    const shoulder = new THREE.Group();
    shoulder.position.set(sideX, 0.45, 0);
    shoulder.add(mesh(bakeParts([   // shoulder cap + tapered sleeve
      [grad(new THREE.SphereGeometry(0.068, 20, 14), P.tunic, { seed: 18 }), { s: [1.08, 0.9, 1.0] }],
      [grad(taperCapsule(0.056, 0.047, 0.16), P.tunic, { down: 0.11, seed: 19 }), { p: [0, -0.14, 0] }],
    ]), mats.cloth));
    const cuffG = new THREE.TorusGeometry(0.047, 0.015, 8, 22);
    cuffG.rotateX(Math.PI / 2);
    cuffG.scale(1, 1.5, 1);
    const cuff = mesh(cuffG, mats.belt);
    cuff.position.y = -0.262;
    shoulder.add(cuff);
    const hand = new THREE.Group();
    hand.position.y = -0.33;
    hand.add(mesh(bakeParts([      // rounded mitt + thumb
      [new THREE.SphereGeometry(0.05, 18, 14), { s: [0.9, 1.08, 0.96] }],
      [new THREE.CapsuleGeometry(0.019, 0.024, 4, 12), { p: [-sgn * 0.036, 0.008, 0.024], r: [0.35, 0, sgn * 0.55] }],
    ]), mats.skin));
    shoulder.add(hand);
    shoulder.rotation.z = sgn * 0.16;
    torso.add(shoulder);
    return shoulder;
  }
  const armL = buildArm(-0.205);
  const armR = buildArm(0.205);

  /* head + stylized face (sclera/iris/pupil/glint eyes, nose, blush, smile) */
  const neck = mesh(taperCapsule(0.047, 0.054, 0.04, 16), mats.skin);
  neck.position.y = 0.53;
  torso.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.56;
  torso.add(head);
  head.add(mesh(bakeParts([        // skull + ears
    [new THREE.SphereGeometry(0.16, 28, 20), { p: [0, 0.10, 0], s: [0.98, 1.04, 1.0] }],
    [new THREE.SphereGeometry(0.03, 14, 10), { p: [-0.153, 0.088, 0.004], s: [0.62, 1, 0.82] }],
    [new THREE.SphereGeometry(0.03, 14, 10), { p: [0.153, 0.088, 0.004], s: [0.62, 1, 0.82] }],
  ]), mats.skin));
  const nose = noInk(mesh(new THREE.SphereGeometry(0.016, 12, 10), mats.skin, false));
  nose.scale.set(1, 0.9, 0.85);
  nose.position.set(0, 0.062, 0.157);
  head.add(nose);

  /* hair: ONE merged, softly lumped volume (cap, fuller back, swept fringe,
     side locks, nape) shaded toward the skull center so it reads as a soft
     mass with gentle clumps — the back of the head is what the camera sees */
  {
    const lobes = [
      // [radius, x, y, z, sx, sy, sz, lump]
      [0.176, 0, 0.168, -0.046, 1.0, 0.93, 1.06, 0.05],   // cap
      [0.122, 0, 0.128, -0.118, 1.12, 1.0, 0.82, 0.07],   // fuller back
      [0.068, -0.02, 0.214, 0.108, 1.3, 0.6, 0.86, 0.08], // fringe (swept)
      [0.056, 0.074, 0.198, 0.098, 1.1, 0.62, 0.9, 0.08],
      [0.05, -0.1, 0.186, 0.084, 1.05, 0.68, 0.9, 0.08],
      [0.056, -0.151, 0.104, 0.006, 0.72, 1.15, 0.92, 0.06], // side locks
      [0.056, 0.151, 0.104, 0.006, 0.72, 1.15, 0.92, 0.06],
      [0.092, 0, 0.03, -0.112, 1.3, 0.95, 0.74, 0.06],       // nape
    ];
    const geos = lobes.map(([r, x, y, z, sx, sy, sz, lump], i) => {
      const g = new THREE.SphereGeometry(r, i < 2 ? 22 : 16, i < 2 ? 16 : 12);
      lumpify(g, lump, 21 + i * 3.7);
      g.scale(sx, sy, sz);
      g.translate(x, y, z);
      return g;
    });
    // Soft locks: rounded, overlapping teardrops hanging from under the cap
    // around the back and sides — hair structure for the camera's view of
    // the back of the head, without spiky "teeth".
    const locks = [
      // [angle from back (rad), drop, r, len]
      [-1.55, 0.0, 0.05, 0.1], [-1.0, -0.01, 0.058, 0.118], [-0.45, -0.015, 0.062, 0.128],
      [0.1, -0.02, 0.064, 0.13], [0.62, -0.015, 0.06, 0.124], [1.12, -0.01, 0.056, 0.112], [1.62, 0.0, 0.05, 0.098],
    ];
    locks.forEach(([a, drop, r, len], i) => {
      // (lathe profiles run bottom -> top so the faces point OUTWARD)
      const prof = [[0.0005, -len], [r * 0.24, -len * 0.97], [r * 0.64, -len * 0.76], [r * 0.93, -len * 0.42], [r, -len * 0.08], [r * 0.8, r * 0.36], [0.0005, r * 0.5]]
        .map(([px, py]) => new THREE.Vector2(px, py));
      const g = new THREE.LatheGeometry(prof, 14);
      lumpify(g, 0.05, 90 + i * 2.3);
      g.scale(1, 1, 0.7);
      g.rotateX(0.2);                    // tips tuck out slightly (-Z = away from the skull)...
      g.rotateY(a);                      // ...swung around the head (a = 0: straight back)
      g.translate(-Math.sin(a) * 0.15, 0.135 + drop, -0.02 - Math.cos(a) * 0.178);
      geos.push(g);
    });
    const hairG = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    smoothGeometry(hairG);
    // Ink outline pushes the hair out RADIALLY from the head (not per lobe),
    // so the silhouette gets a line but overlapping locks don't draw a web of
    // inner lines across the back of the head.
    const hc = new THREE.Vector3(0, 0.12, -0.03);
    {
      const pos = hairG.attributes.position, on = new Float32Array(pos.count * 3), v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).sub(hc).normalize();
        on[i * 3] = v.x; on[i * 3 + 1] = v.y; on[i * 3 + 2] = v.z;
      }
      hairG.setAttribute('lfOutlineNormal', new THREE.BufferAttribute(on, 3));
    }
    sphericalNormals(hairG, { center: hc, blend: 0.45 });
    grad(hairG, P.hair, { down: 0.09, up: 0.12, noise: 0.03, seed: 31 });
    const hairMass = mesh(hairG, mats.hair);
    head.add(hairMass);
  }
  /* springy cowlick (animated): two soft curled locks */
  const hairTuft = new THREE.Group();
  hairTuft.position.set(-0.02, 0.29, -0.015);
  function curlGeo(len, r0, bend) {
    const g = new THREE.CylinderGeometry(r0 * 0.12, r0, len, 14, 8, false);
    g.translate(0, len / 2, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, Math.min(1, pos.getY(i) / len));
      pos.setX(i, pos.getX(i) + bend * t * t * len);
    }
    smoothGeometry(g, { creaseAngle: 1.2 });
    return g;
  }
  const tuftMesh = gmesh(curlGeo(0.11, 0.042, 1.05), P.hair, { down: 0.08, up: 0.14, seed: 41 }, true);
  tuftMesh.rotation.set(-0.45, Math.PI / 2, 0.1);    // bend (+X) turned to curl backward (-Z)
  hairTuft.add(tuftMesh);
  const tuftMesh2 = gmesh(curlGeo(0.085, 0.026, 0.6), P.hair, { down: 0.12, up: 0.14, seed: 42 }, true);
  tuftMesh2.position.set(0.038, -0.01, 0.03);
  tuftMesh2.rotation.set(0.35, -Math.PI / 2 + 0.5, -0.2); // small flick curling forward-right
  hairTuft.add(tuftMesh2);
  head.add(hairTuft);

  /* eyes: flattened sclera + iris + pupil + specular glint (blinkable groups) */
  function buildEye(sideX) {
    const g = new THREE.Group();
    g.position.set(sideX, 0.10, 0.152);
    // sclera + iris + pupil + glint baked into one vertex-colored mesh
    g.add(mesh(bakeParts([
      [solidColor(new THREE.SphereGeometry(0.027, 18, 14), 0xfffaf2), { s: [1, 1.15, 0.55] }],
      [solidColor(new THREE.SphereGeometry(0.0175, 14, 10), P.iris), { p: [0, 0, 0.0105], s: [1, 1.08, 0.7] }],
      [solidColor(new THREE.SphereGeometry(0.0092, 12, 8), 0x221a14), { p: [0, 0, 0.0205], s: [1, 1.08, 0.7] }],
      [solidColor(new THREE.SphereGeometry(0.0058, 10, 8), 0xffffff), { p: [0.007, 0.0085, 0.025] }],
    ]), mats.eye, false));
    g.userData.noOutline = true;
    head.add(g);
    return g;
  }
  const eyeL = buildEye(-0.06);
  const eyeR = buildEye(0.06);
  const browM = M(shade(P.hair, -0.14), { rough: 0.7 });
  head.add(noInk(mesh(bakeParts([[-0.06, 0.12], [0.06, -0.12]].map(([sx, tilt]) =>
    [new THREE.CapsuleGeometry(0.0075, 0.036, 4, 10), { p: [sx, 0.153, 0.149], r: [0, 0, Math.PI / 2 + tilt] }])), browM, false)));
  const blushM = M(0xf0a688, { rough: 0.85 });
  head.add(noInk(mesh(bakeParts([-1, 1].map((sx) =>
    [new THREE.SphereGeometry(0.018, 14, 10), { p: [sx * 0.098, 0.048, 0.119], r: [0, sx * 0.55, 0], s: [1.1, 0.68, 0.3] }])), blushM, false)));
  const smile = noInk(mesh(new THREE.TorusGeometry(0.02, 0.0055, 8, 16, Math.PI * 0.8), M(0xb5765a, { rough: 0.6 }), false));
  smile.position.set(0, 0.042, 0.153);
  smile.rotation.z = -Math.PI * 0.9;
  head.add(smile);

  /* amber scarf — warm pop against the dusk-purple cloak */
  const scarfRollG = new THREE.TorusGeometry(0.1, 0.037, 14, 32);
  const scarfRoll = mesh(scarfRollG, mats.scarf);
  scarfRoll.position.set(0, 0.492, 0.012);
  scarfRoll.rotation.x = Math.PI / 2 - 0.14;
  torso.add(scarfRoll);
  torsoCloth.push([grad(ribbonGeo([
    new THREE.Vector3(0.07, 0.49, 0.112), new THREE.Vector3(0.088, 0.44, 0.146), new THREE.Vector3(0.1, 0.38, 0.158),
    new THREE.Vector3(0.108, 0.33, 0.16),
  ], 0.058, 0.02, (p, o) => o.set(0, 0, 1)), P.scarf, { down: 0.12, seed: 45 })]);
  /* gold clasp where the capelet meets the scarf */
  const clasp = noInk(mesh(new THREE.SphereGeometry(0.026, 14, 10), mats.gold));
  clasp.position.set(0, 0.47, 0.13);
  torso.add(clasp);

  /* ---------------------------------------------------------------- cloak
     Layered from the neck down: hood cowl -> scalloped capelet -> long cloak. */
  const cloakTop = 0x6d5ba8, cloakBot = 0x3c2f6b;
  const liningTop = 0x7c3c5e, liningBot = 0x5a2747;
  const trimGold = 0xe2bd6a;

  // Capelet: rigid with the torso, drapes over the shoulders (profile rolls
  // outward from the collar, then falls), open at the chest behind the scarf.
  const capeletG = drapeShell({
    profile: [
      { y: 0.528, rx: 0.1, rz: 0.098, cz: -0.004, span: 2.62 },
      { y: 0.495, rx: 0.225, rz: 0.19, cz: -0.012, span: 2.6 },
      { y: 0.43, rx: 0.3, rz: 0.228, cz: -0.02, span: 2.55 },
      { y: 0.315, rx: 0.312, rz: 0.24, cz: -0.024, span: 2.5 },
    ],
    nu: 64, nv: 9, folds: 9, foldAmp: [0.004, 0.02], foldDrift: 0.5,
    hemWave: 0.035, hemSideLift: 0.08, thick: 0.014,
    outerTop: 0x7866b4, outerBot: 0x5c4b92, liningTop, liningBot,
    trim: trimGold, trimWidth: 0.1, seed: 3,
  });
  torsoCloth.push([capeletG]);

  // Hood cowl: soft rolled collar around the back of the neck + the gathered
  // hood resting on the upper back.
  const hoodRollG = new THREE.TorusGeometry(0.112, 0.043, 10, 26, Math.PI * 1.25);
  hoodRollG.rotateZ(-Math.PI * 1.125); // arc centered on -Y ...
  hoodRollG.rotateX(Math.PI / 2);       // ... which becomes the back (-Z): open at the front
  torsoCloth.push([grad(hoodRollG, P.cloak, { down: 0.05, up: 0.1, seed: 46 }), { p: [0, 0.522, -0.012], r: [-0.12, 0, 0] }]);
  const hoodG = new THREE.SphereGeometry(0.1, 18, 12);
  lumpify(hoodG, 0.08, 5.5);
  hoodG.scale(1.18, 0.78, 0.66);
  smoothGeometry(hoodG);
  torsoCloth.push([grad(hoodG, P.cloak, { down: 0.12, up: 0.1, seed: 47 }), { p: [0, 0.458, -0.19], r: [0.25, 0, 0] }]);
  torso.add(mesh(bakeParts(torsoCloth), mats.cloth)); // skirt + strap + scarf tail + capelet + hood: one draw

  // Long cloak: ONE skinned shell. Bones: a static root at the collar, then
  // the three swinging pivots animate() drives as cloakSegs (rest rotation.x
  // 0.14 each — the skeleton is bound AT that rest pose, so the authored
  // drape is exactly what shows when the Warden stands still).
  const PIVOT_Y = 0.46, PIVOT_Z = -0.15, SEG = 0.3, REST = 0.14;
  const cloakG = drapeShell({
    profile: [
      { y: 0.44, rx: 0.2, rz: 0.14, cz: -0.02, span: 1.9 },     // tucked under the capelet
      { y: 0.3, rx: 0.285, rz: 0.19, cz: -0.045, span: 1.82 },  // falls OVER the arms
      { y: 0.1, rx: 0.3, rz: 0.2, cz: -0.065, span: 1.74 },
      { y: -0.08, rx: 0.315, rz: 0.215, cz: -0.085, span: 1.68 },
      { y: -0.42, rx: 0.335, rz: 0.24, cz: -0.11, span: 1.6 },
    ],
    nu: 80, nv: 18, folds: 8, foldAmp: [0.008, 0.066], foldDrift: 1.1,
    hemWave: 0.018, hemSideLift: 0.12, thick: 0.018,
    outerTop: cloakTop, outerBot: cloakBot, liningTop, liningBot,
    trim: trimGold, trimWidth: 0.045, seed: 7,
  });
  {
    // skin weights by vertical drop below the collar pivot
    const pos = cloakG.attributes.position, n = pos.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let i = 0; i < n; i++) {
      const d = PIVOT_Y - pos.getY(i);
      let a = 0, b = 1, w = 0;                       // bones: 0 root, 1..3 pivots
      if (d < 0.2) { a = 0; b = 1; w = ss(0.05, 0.17, d); }
      else if (d < SEG + 0.12) { a = 1; b = 2; w = ss(SEG - 0.07, SEG + 0.07, d); }
      else { a = 2; b = 3; w = ss(2 * SEG - 0.08, 2 * SEG + 0.08, d); }
      si[i * 4] = a; si[i * 4 + 1] = b;
      sw[i * 4] = 1 - w; sw[i * 4 + 1] = w;
    }
    cloakG.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    cloakG.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  }
  const cloakRoot = new THREE.Bone();
  cloakRoot.name = 'cloakRoot';
  cloakRoot.position.set(0, PIVOT_Y, PIVOT_Z);
  torso.add(cloakRoot);
  const cloakSegs = [];
  let parentBone = cloakRoot;
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Bone();
    b.name = `cloakSeg${i}`;
    if (i > 0) b.position.set(0, -SEG, 0);
    b.rotation.x = REST;
    parentBone.add(b);
    parentBone = b;
    cloakSegs.push(b);
  }
  const cloak = new THREE.SkinnedMesh(cloakG, mats.cloth);
  cloak.name = 'wardenCloak';
  cloak.castShadow = true;
  cloak.frustumCulled = false; // bounds move with the bones; it is always near the lens anyway
  torso.add(cloak);
  group.updateMatrixWorld(true);
  cloak.bind(new THREE.Skeleton([cloakRoot, ...cloakSegs]));

  addOutline(group, { color: 0x2a1d2b, thickness: 2.0 });

  return {
    group,
    refs: { rig, hips, torso, head, chest, legL, legR, armL, armR, cloakSegs, hairTuft, satchel, eyes: [eyeL, eyeR] },
  };
}

/* =============================== createPlayer ============================= */

let _current = null; // auto-dispose the previous instance on zone reload

export function createPlayer(world) {
  if (_current) { try { _current.dispose(); } catch (e) { /* ignore */ } _current = null; }

  const { group, refs } = buildWarden();
  const zone = world.zone ?? null;
  const spawn = zone?.spawn ?? [G.pos.x ?? 0, G.pos.z ?? 0];
  group.position.set(spawn[0], 0, spawn[1]);
  if (world.heightAt) group.position.y = world.heightAt(spawn[0], spawn[1]);
  // zone.spawnFace: authored first-view framing for the zone's default spawn
  // (an explicit portal/teleport spawn overrides this via teleport() right after).
  let face = zone?.spawnFace ?? G.pos.face ?? 0;
  group.rotation.y = face;
  world.scene?.add(group);

  /* -------- state -------- */
  let frozen = false;
  let vx = 0, vz = 0;            // horizontal velocity
  let speed = 0, prevSpeed = 0;
  let phase = 0, prevPhaseStep = 0; // stride phase; step index for footsteps
  let time = 0;
  let idleTime = 0;
  let angVel = 0;                // yaw rate, drives cloak/bank secondary motion
  let bankSm = 0, leanAccelSm = 0;
  let skidT = 0, skidCooldown = 0;
  let dipT = 0, prevY = group.position.y, vy = 0, wasFalling = false;
  let promptTimer = 0, promptText = null;
  let walkAcc = 0;               // meters walked with a partner (resonance)
  /* idle life timers */
  let blinkT = 0, nextBlink = 2 + Math.random() * 3;
  let lookT = 0, nextLook = IDLE_LOOK_MIN, lookTargetYaw = 0, lookHold = 0;
  /* cloak spring state (rotation x/z per segment) */
  const cloakX = [0.14, 0.14, 0.14];
  const cloakZ = [0, 0, 0];
  let tuftX = 0, tuftZ = 0;
  /* scratch */
  const _camDir = new THREE.Vector3();

  /* -------- follower (party lead walks behind) -------- */
  const trail = new Array(TRAIL_CAP);
  for (let i = 0; i < TRAIL_CAP; i++) trail[i] = { x: spawn[0], z: spawn[1], d: 0 };
  let trailHead = 0, trailCount = 0, trailDist = 0;
  let follower = null;          // { group, animator, state, x, z, y, face, happyT, happyCd }
  let followerToken = 0;
  let registryMissing = false;

  function pushTrailPoint(x, z) {
    const last = trail[trailHead];
    const dx = x - last.x, dz = z - last.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (trailCount > 0 && d < TRAIL_SPACING) return;
    trailHead = (trailHead + 1) % TRAIL_CAP;
    trailDist += trailCount > 0 ? d : 0;
    const p = trail[trailHead];
    p.x = x; p.z = z; p.d = trailDist;
    if (trailCount < TRAIL_CAP) trailCount++;
  }
  function resetTrail(x, z) {
    trailHead = 0; trailCount = 1; trailDist = 0;
    trail[0].x = x; trail[0].z = z; trail[0].d = 0;
  }
  /** Position on the breadcrumb path `dist` meters behind the newest point. */
  function trailPointBehind(dist, out) {
    const want = trailDist - dist;
    let iNew = trailHead;
    for (let n = 1; n < trailCount; n++) {
      const iOld = (iNew - 1 + TRAIL_CAP) % TRAIL_CAP;
      const a = trail[iOld], b = trail[iNew];
      if (a.d <= want) {
        const span = b.d - a.d;
        const t = span > 1e-5 ? clamp01((want - a.d) / span) : 1;
        out.x = lerp(a.x, b.x, t); out.z = lerp(a.z, b.z, t);
        return out;
      }
      iNew = iOld;
    }
    const oldest = trail[(trailHead - trailCount + 1 + TRAIL_CAP) % TRAIL_CAP];
    out.x = oldest.x; out.z = oldest.z;
    return out;
  }
  const _trailOut = { x: 0, z: 0 };

  function detachFollower() {
    if (!follower) return;
    world.scene?.remove(follower.group);
    disposeGroup(follower.group); // registry builds are per-call, safe to free
    follower = null;
  }
  async function buildFollower() {
    const token = ++followerToken;
    const lead = G.party[0];
    if (!lead) { detachFollower(); return; }
    if (follower?.speciesId === lead.speciesId && follower?.hollowed === !!lead.hollowed) return;
    try {
      const registry = await import('../creatures/registry.js');
      if (token !== followerToken) return; // superseded while loading
      const built = registry.buildCreature(lead.speciesId, { hollowed: !!lead.hollowed, gleaming: !!lead.shiny });
      if (!built?.group) return;
      detachFollower();
      trailPointBehind(FOLLOW_DIST, _trailOut);
      // Collect materials once so the camera-proximity fade costs nothing per frame.
      const fadeMats = [];
      built.group.traverse((o) => {
        const m = o.material;
        if (!m) return;
        for (const mat of Array.isArray(m) ? m : [m]) {
          if (!fadeMats.includes(mat)) { mat.transparent = true; fadeMats.push(mat); }
        }
      });
      follower = {
        group: built.group, animator: built.animator, speciesId: lead.speciesId,
        hollowed: !!lead.hollowed, state: 'idle',
        x: _trailOut.x, z: _trailOut.z, y: group.position.y, face,
        happyCd: 6 + Math.random() * 6,
        fadeMats, opacity: 1,
      };
      follower.group.position.set(follower.x, follower.y, follower.z);
      world.scene?.add(follower.group);
      try { follower.animator?.play?.('idle'); } catch (e) { /* animator contract drift */ }
    } catch (e) {
      if (!registryMissing) {
        registryMissing = true;
        console.warn('[player] creature registry unavailable — follower disabled', e?.message ?? e);
      }
    }
  }
  const offParty = bus.on('party:changed', () => { registryMissing = false; buildFollower(); });
  buildFollower();

  function followerPlay(name) {
    if (!follower || follower.state === name) return;
    follower.state = name;
    try { follower.animator?.play?.(name); } catch (e) { /* tolerate */ }
  }
  function updateFollower(dt) {
    if (!follower) return;
    const f = follower;
    trailPointBehind(FOLLOW_DIST, _trailOut);
    // Step off the trail line to the player's right so the creature walks
    // alongside the path rather than in the camera's line of sight.
    _trailOut.x += Math.cos(face) * FOLLOW_SIDE;
    _trailOut.z += -Math.sin(face) * FOLLOW_SIDE;
    const dxP = group.position.x - f.x, dzP = group.position.z - f.z;
    if (dxP * dxP + dzP * dzP > FOLLOW_TELEPORT * FOLLOW_TELEPORT) {
      f.x = _trailOut.x; f.z = _trailOut.z;
      if (world.heightAt) f.y = world.heightAt(f.x, f.z);
    } else {
      const px = f.x, pz = f.z;
      f.x = damp(f.x, _trailOut.x, 7.5, dt);
      f.z = damp(f.z, _trailOut.z, 7.5, dt);
      const mvx = (f.x - px) / Math.max(dt, 1e-5), mvz = (f.z - pz) / Math.max(dt, 1e-5);
      const fSpeed = Math.sqrt(mvx * mvx + mvz * mvz);
      if (fSpeed > 0.45) {
        f.face = dampAngle(f.face, Math.atan2(mvx, mvz), 10, dt);
        if (f.happyT == null || f.happyT <= 0) followerPlay('walk');
      } else {
        // settle: face the player slowly, drop to idle
        f.face = dampAngle(f.face, Math.atan2(dxP, dzP), 2.2, dt);
        if (f.happyT == null || f.happyT <= 0) followerPlay('idle');
      }
      if (world.heightAt) f.y = damp(f.y, world.heightAt(f.x, f.z), 14, dt);
    }
    /* an occasional happy wiggle when the player lingers — small bond moment */
    if (f.happyT != null && f.happyT > 0) {
      f.happyT -= dt;
      if (f.happyT <= 0) followerPlay('idle');
    } else if (idleTime > 6) {
      f.happyCd -= dt;
      if (f.happyCd <= 0) {
        f.happyCd = 9 + Math.random() * 8;
        f.happyT = 1.3;
        followerPlay('happy');
      }
    }
    f.group.position.set(f.x, f.y, f.z);
    f.group.rotation.y = f.face;
    /* never let the follower block the shot: fade it out near the lens */
    const cam = world.camera;
    if (cam && f.fadeMats?.length) {
      const cdx = cam.position.x - f.x, cdy = cam.position.y - (f.y + 0.5), cdz = cam.position.z - f.z;
      const cd = Math.sqrt(cdx * cdx + cdy * cdy + cdz * cdz);
      const want = clamp01((cd - FOLLOW_FADE_NEAR) / (FOLLOW_FADE_FAR - FOLLOW_FADE_NEAR));
      const next = damp(f.opacity, want, 12, dt);
      if (Math.abs(next - f.opacity) > 0.01) {
        f.opacity = next;
        for (const mat of f.fadeMats) mat.opacity = next;
        f.group.visible = next > 0.02;
      }
    }
    try { f.animator?.update?.(dt); } catch (e) { /* tolerate */ }
  }

  /* -------- terrain / surface helpers -------- */
  const heightAt = (x, z) => (world.heightAt ? world.heightAt(x, z) : 0);
  function waterDepthAt(x, z) {
    const w = world.zone?.water;
    if (!w) return 0;
    const wx = w.pos?.[0] ?? 0, wz = w.pos?.[1] ?? 0, half = (w.size ?? 0) / 2;
    if (Math.abs(x - wx) > half || Math.abs(z - wz) > half) return 0;
    return Math.max(0, (w.level ?? 0) - heightAt(x, z));
  }
  /**
   * Walkable wooden props (bridges, docks, house floors) register oriented
   * rectangles in props.js's `surfacePatches`; standing inside one overrides
   * the biome surface (checked before water so a bridge OVER water still
   * sounds like planks).
   */
  function surfacePatchAt(x, z) {
    const patches = world.props?.surfacePatches;
    if (!patches || !patches.length) return null;
    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz > p.r2) continue; // cheap broad-phase
      const lx = dx * p.cos - dz * p.sin;     // world -> prop-local
      const lz = dx * p.sin + dz * p.cos;
      if (Math.abs(lx) <= p.hx && Math.abs(lz) <= p.hz) return p.surface;
    }
    return null;
  }
  function surfaceAt(x, z, y) {
    const patch = surfacePatchAt(x, z);
    if (patch) return patch;
    const depth = waterDepthAt(x, z);
    if (depth > 0.05) return 'water';
    const biome = world.zone?.biome ?? 'meadow';
    if (biome === 'lake' && depth === 0 && world.zone?.water) {
      const w = world.zone.water;
      const wx = w.pos?.[0] ?? 0, wz = w.pos?.[1] ?? 0, half = (w.size ?? 0) / 2;
      const nearShore = Math.abs(x - wx) < half + 2.5 && Math.abs(z - wz) < half + 2.5 && y < (w.level ?? 0) + 0.6;
      if (nearShore) return 'sand';
    }
    if (biome === 'mountain' && y > SNOWLINE_Y) return 'snow';
    return BIOME_SURFACE[biome] ?? 'grass';
  }

  /* -------- collision -------- */
  function resolveColliders() {
    const cols = world.colliders;
    if (!cols) return;
    // Four passes so a wedge between several props still resolves; a body dead
    // centre in a collider has no escape direction of its own, so it gets a
    // deterministic one (its facing) instead of being skipped and left trapped.
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        let dx = group.position.x - c.x, dz = group.position.z - c.z;
        const rr = c.r + PLAYER_RADIUS;
        let d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        if (d2 < 1e-8) { dx = Math.sin(face); dz = Math.cos(face); d2 = 1; }
        const d = Math.sqrt(d2);
        const push = (rr - d) / d;
        group.position.x += dx * push;
        group.position.z += dz * push;
        moved = true;
      }
      if (!moved) break;
    }
  }

  /* -------- stuck watchdog -----------------------------------------------
     Whatever wedges the player — overlapping props, a bad spawn, a scene that
     teleported them into a wall — holding a direction must always get them
     out. If we want to move but have covered almost no ground for a while,
     search outward for open floor and step there. */
  const STUCK_WINDOW = 1.2;      // seconds of trying before we call it stuck
  const STUCK_DIST = 0.2;        // ground covered in that window to count as moving
  let stuckT = 0, stuckX = 0, stuckZ = 0;
  function isFree(x, z) {
    const cols = world.colliders;
    if (!cols) return true;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const dx = x - c.x, dz = z - c.z;
      const rr = c.r + PLAYER_RADIUS;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    return true;
  }
  /* Freeze is set by cutscenes and released when they end. If a scene throws,
     or a battle-loss teleport swaps the player out from under it, the release
     can be lost and the Warden is locked forever while menus still work. No
     dialogue, no menu, no battle => nothing owns the freeze; take it off. */
  // Keyed off the player's own intent rather than the UI's bookkeeping: if you
  // are holding a direction, no one is talking to you, and you still haven't
  // moved, then whatever set the freeze is gone and the lock is ours to break.
  let orphanFreezeT = 0;
  function updateFreezeWatchdog(dt) {
    if (!frozen) { orphanFreezeT = 0; return; }
    const ix = input.axes.x, iy = input.axes.y;
    const pressing = Math.sqrt(ix * ix + iy * iy) > 0.1;
    if (!pressing || dialogueVisible() || world.game?.mode !== 'overworld') { orphanFreezeT = 0; return; }
    orphanFreezeT += dt;
    if (orphanFreezeT > 1.5) {
      orphanFreezeT = 0;
      frozen = false;
      console.warn('[player] released an orphaned cutscene freeze');
    }
  }
  function dialogueVisible() {
    const el = document.querySelector('#ui-root .dlg-root');
    return !!el && el.classList.contains('open');
  }

  function updateStuckWatchdog(dt, wantsToMove) {
    if (!wantsToMove || frozen) { stuckT = 0; stuckX = group.position.x; stuckZ = group.position.z; return; }
    stuckT += dt;
    if (stuckT < STUCK_WINDOW) return;
    const dx = group.position.x - stuckX, dz = group.position.z - stuckZ;
    const covered = Math.sqrt(dx * dx + dz * dz);
    stuckT = 0; stuckX = group.position.x; stuckZ = group.position.z;
    if (covered >= STUCK_DIST) return;
    // Spiral outward for the nearest open spot and place the Warden there.
    for (let ring = 1; ring <= 6; ring++) {
      const r = ring * 1.1;
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2 + ring * 0.4;
        const x = group.position.x + Math.cos(ang) * r;
        const z = group.position.z + Math.sin(ang) * r;
        if (!isFree(x, z)) continue;
        group.position.x = x; group.position.z = z;
        group.position.y = heightAt(x, z);
        vx = 0; vz = 0; speed = 0;
        console.warn('[player] freed from geometry');
        return;
      }
    }
    const sp = world.zone?.spawn;   // last resort: back to the zone entrance
    if (sp) { group.position.x = sp[0]; group.position.z = sp[1]; group.position.y = heightAt(sp[0], sp[1]); }
  }
  function clampToBounds() {
    const size = world.zone?.size;
    if (!size) return;
    const half = size / 2 - BOUNDS_MARGIN;
    group.position.x = clamp(group.position.x, -half, half);
    group.position.z = clamp(group.position.z, -half, half);
  }

  /* -------- interaction + prompts -------- */
  function tryInteract() {
    if (frozen) return;
    if (world.game && world.game.mode !== 'overworld') return;
    world.interact?.();
  }
  const offInteract = input.onAction('interact', tryInteract);

  function nearestPortalPrompt() {
    const portals = world.zone?.portals;
    if (!portals) return null;
    for (let i = 0; i < portals.length; i++) {
      const p = portals[i];
      const dx = group.position.x - p.at[0], dz = group.position.z - p.at[1];
      const r = (p.radius ?? 3) + 0.5;
      if (dx * dx + dz * dz < r * r) return p.label ?? `To ${p.to}`;
    }
    return null;
  }
  function pollPrompt(dt) {
    promptTimer -= dt;
    if (promptTimer > 0) return;
    promptTimer = 0.12;
    let text = null;
    if (!frozen) {
      // Priority mirrors world.interact(): npcs -> interactables -> portals.
      // Defensive lookups — the World may expose an aggregate or per-module surfaces.
      let hit = null;
      if (typeof world.nearestPrompt === 'function') hit = world.nearestPrompt(group.position);
      else {
        hit = world.npcs?.nearestPrompt?.(group.position)
          ?? world.interactables?.nearestPrompt?.(group.position)
          ?? null;
      }
      text = hit?.text ?? nearestPortalPrompt();
    }
    if (text !== promptText) {
      promptText = text;
      if (text) bus.emit('prompt:show', { text });
      else bus.emit('prompt:hide');
    }
  }

  /* -------- footsteps -------- */
  function emitStep() {
    const surface = surfaceAt(group.position.x, group.position.z, group.position.y);
    bus.emit('sfx:footstep', { surface });
  }

  /* -------- wading: one splash when entering/leaving water level -------- */
  const WADE_DEPTH = 0.06;
  let wading = waterDepthAt(group.position.x, group.position.z) > WADE_DEPTH;
  let splashCd = 0;
  function pollWading(dt) {
    splashCd -= dt;
    // ignore while a wooden patch (bridge/dock) carries us over the water
    const nowWading = !surfacePatchAt(group.position.x, group.position.z)
      && waterDepthAt(group.position.x, group.position.z) > WADE_DEPTH;
    if (nowWading !== wading) {
      wading = nowWading;
      if (splashCd <= 0) {
        splashCd = 0.35;
        bus.emit('ui:sfx', { name: 'splash' });
      }
    }
  }

  /* -------- procedural animation -------- */
  function animate(dt) {
    const r = refs;
    const speedNorm = clamp01(speed / RUN_SPEED);
    const runBlend = clamp01((speed - WALK_SPEED * 0.9) / (RUN_SPEED - WALK_SPEED * 0.9));
    const moveBlend = clamp01(speed / 1.1);
    const idleBlend = 1 - moveBlend;

    /* stride phase drives legs, arms, bob, and footstep timing */
    const strideLen = lerp(STRIDE_WALK, STRIDE_RUN, runBlend);
    phase += dt * (speed / strideLen);
    const stepIndex = Math.floor(phase * 2);
    if (stepIndex !== prevPhaseStep) {
      prevPhaseStep = stepIndex;
      if (speed > 0.7) emitStep();
    }
    const swing = Math.sin(phase * TAU);
    const swingB = Math.sin(phase * TAU + Math.PI);
    const amp = lerp(0.52, 0.95, runBlend) * moveBlend * (skidT > 0 ? 0.35 : 1);

    r.legL.thigh.rotation.x = swing * amp;
    r.legR.thigh.rotation.x = swingB * amp;
    r.legL.shin.rotation.x = (0.08 + Math.max(0, -Math.sin(phase * TAU + 0.7)) * lerp(0.55, 1.15, runBlend)) * moveBlend;
    r.legR.shin.rotation.x = (0.08 + Math.max(0, -Math.sin(phase * TAU + Math.PI + 0.7)) * lerp(0.55, 1.15, runBlend)) * moveBlend;

    const armAmp = amp * 0.6;
    const runRaise = runBlend * 0.42; // arms pump bent when sprinting
    r.armL.rotation.x = swingB * armAmp - runRaise + Math.sin(time * 1.15) * 0.03 * idleBlend;
    r.armR.rotation.x = swing * armAmp - runRaise + Math.sin(time * 1.15 + 1.4) * 0.03 * idleBlend;

    /* bob + landing dip */
    let dip = 0;
    if (dipT > 0) { dipT -= dt; dip = -Math.sin(Math.PI * clamp01(1 - dipT / 0.22)) * 0.07; }
    r.rig.position.y = Math.abs(swing) * lerp(BOB_WALK, BOB_RUN, runBlend) * moveBlend + dip;

    /* lean into speed & acceleration; bank + skid on sharp turns */
    leanAccelSm = damp(leanAccelSm, clamp((speed - prevSpeed) / Math.max(dt, 1e-4), -8, 8) * 0.016, 6, dt);
    r.torso.rotation.x = speedNorm * LEAN_RUN + leanAccelSm + (skidT > 0 ? -0.08 : 0) + (dip !== 0 ? dip * 0.9 : 0);
    bankSm = damp(bankSm, -angVel * 0.055 * moveBlend, 8, dt);
    r.rig.rotation.z = bankSm + (skidT > 0 ? bankSm * 1.6 : 0);
    r.hips.rotation.z = Math.sin(phase * TAU) * 0.045 * moveBlend + Math.sin(time * 0.45) * 0.02 * idleBlend;

    /* idle life: breathing, blinks, look-arounds */
    const breath = 1 + Math.sin(time * 2.1) * 0.02 * lerp(1, 0.4, moveBlend);
    r.chest.scale.set(1.15 * breath, 1, 0.92 * breath);
    r.torso.position.y = Math.sin(time * 2.1) * 0.006 * idleBlend;

    blinkT -= dt;
    if (blinkT <= -nextBlink) { blinkT = 0.09; nextBlink = 2.2 + Math.random() * 3.4; }
    const eyeScaleY = blinkT > 0 ? 0.12 : 1;
    r.eyes[0].scale.y = eyeScaleY;
    r.eyes[1].scale.y = eyeScaleY;

    if (idleTime > 3) {
      lookT += dt;
      if (lookHold > 0) {
        lookHold -= dt;
        if (lookHold <= 0) { lookTargetYaw = 0; }
      } else if (lookT >= nextLook) {
        lookT = 0;
        nextLook = IDLE_LOOK_MIN + Math.random() * (IDLE_LOOK_MAX - IDLE_LOOK_MIN);
        lookTargetYaw = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.28);
        lookHold = 0.9 + Math.random() * 0.7;
      }
    } else { lookTargetYaw = 0; lookT = 0; lookHold = 0; }
    r.head.rotation.y = damp(r.head.rotation.y, lookTargetYaw * idleBlend, 4.5, dt);
    r.head.rotation.x = Math.sin(time * 1.7 + 0.5) * 0.015 * idleBlend + speedNorm * -0.06;

    /* cloak: springy lagged chain — lifts with speed, sways with time & turning */
    const lift = speedNorm * 0.55;
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(time * 2.0 + i * 0.9) * (0.045 + speedNorm * 0.05);
      const targetX = 0.14 + lift * (0.55 + i * 0.22) + sway;
      const targetZ = clamp(-angVel * (0.05 + i * 0.045), -0.5, 0.5) + Math.sin(time * 1.3 + i * 1.7) * 0.025 * idleBlend;
      cloakX[i] = damp(cloakX[i], targetX, 13 - i * 3.2, dt);
      cloakZ[i] = damp(cloakZ[i], targetZ, 11 - i * 2.6, dt);
      refs.cloakSegs[i].rotation.x = cloakX[i];
      refs.cloakSegs[i].rotation.z = cloakZ[i];
    }
    /* hair tuft: little spring opposing motion */
    tuftX = damp(tuftX, speedNorm * 0.5 + Math.sin(time * 2.6) * 0.06, 7, dt);
    tuftZ = damp(tuftZ, clamp(-angVel * 0.1, -0.5, 0.5), 7, dt);
    r.hairTuft.rotation.x = tuftX;
    r.hairTuft.rotation.z = 0.0 + tuftZ;
    /* satchel bounce */
    r.satchel.rotation.x = Math.sin(phase * TAU * 2) * 0.07 * moveBlend;
  }

  /* -------- main update -------- */
  function update(dt) {
    time += dt;
    prevSpeed = speed;
    updateFreezeWatchdog(dt);

    /* --- read input, camera-relative --- */
    let ax = 0, az = 0, mag = 0;
    if (!frozen) {
      const ix = input.axes.x, iy = input.axes.y;
      mag = Math.min(1, Math.sqrt(ix * ix + iy * iy));
      if (mag > 0.01) {
        // camera forward projected to XZ; right = forward x up = (-fz, 0, fx)
        let fx = Math.sin(face), fz = Math.cos(face); // fallback: current facing
        if (world.camera) {
          world.camera.getWorldDirection(_camDir);
          const len = Math.hypot(_camDir.x, _camDir.z);
          if (len > 1e-4) { fx = _camDir.x / len; fz = _camDir.z / len; }
        }
        const rx = -fz, rz = fx;
        ax = fx * -iy + rx * ix;
        az = fz * -iy + rz * ix;
        const l = Math.hypot(ax, az);
        if (l > 1e-5) { ax /= l; az /= l; }
      }
    }

    /* --- skid detection: hard direction reversal at speed --- */
    skidCooldown -= dt;
    if (mag > 0.3 && speed > 4.0 && skidCooldown <= 0) {
      const want = Math.atan2(ax, az);
      if (Math.abs(shortAngle(face, want)) > SKID_ANGLE) { skidT = SKID_TIME; skidCooldown = 0.6; }
    }
    if (skidT > 0) skidT -= dt;

    /* --- slope-based speed damping --- */
    let slopeFactor = 1;
    if (mag > 0.01 && world.heightAt) {
      const h0 = heightAt(group.position.x, group.position.z);
      const h1 = heightAt(group.position.x + ax * SLOPE_SAMPLE, group.position.z + az * SLOPE_SAMPLE);
      const slope = (h1 - h0) / SLOPE_SAMPLE;
      slopeFactor = clamp(1 - Math.max(0, slope) * SLOPE_UP_DRAG - Math.max(0, -slope) * -0.08, 0.5, 1.12);
    }

    /* --- velocity with snappy-in / soft-out damping --- */
    const running = input.pressed('run');
    const targetSpeed = mag * (running ? RUN_SPEED : WALK_SPEED) * slopeFactor * (skidT > 0 ? 0.35 : 1);
    const tvx = ax * targetSpeed, tvz = az * targetSpeed;
    const speeding = (tvx * tvx + tvz * tvz) > (vx * vx + vz * vz);
    const lambda = speeding ? ACCEL_LAMBDA : DECEL_LAMBDA;
    vx = damp(vx, tvx, lambda, dt);
    vz = damp(vz, tvz, lambda, dt);
    speed = Math.hypot(vx, vz);
    if (speed < 0.02 && targetSpeed === 0) { vx = 0; vz = 0; speed = 0; }

    /* --- integrate + resolve --- */
    const oldX = group.position.x, oldZ = group.position.z;
    group.position.x += vx * dt;
    group.position.z += vz * dt;
    resolveColliders();
    clampToBounds();
    updateStuckWatchdog(dt, targetSpeed > 0);
    /* deep water blocks (slide along the shore if one axis is passable) */
    if (waterDepthAt(group.position.x, group.position.z) > MAX_WADE_DEPTH) {
      const nx = group.position.x, nz = group.position.z;
      if (waterDepthAt(nx, oldZ) <= MAX_WADE_DEPTH) group.position.z = oldZ;
      else if (waterDepthAt(oldX, nz) <= MAX_WADE_DEPTH) group.position.x = oldX;
      else { group.position.x = oldX; group.position.z = oldZ; }
    }

    /* --- facing --- */
    if (speed > 0.25) {
      const want = Math.atan2(vx, vz);
      const before = face;
      face = dampAngle(face, want, lerp(TURN_LAMBDA_WALK, TURN_LAMBDA_RUN, clamp01(speed / RUN_SPEED)), dt);
      angVel = damp(angVel, shortAngle(before, face) / Math.max(dt, 1e-4), 10, dt);
    } else {
      angVel = damp(angVel, 0, 8, dt);
    }
    group.rotation.y = face;

    /* --- terrain following + landing detection --- */
    const groundY = heightAt(group.position.x, group.position.z);
    group.position.y = damp(group.position.y, groundY, GROUND_LAMBDA, dt);
    vy = (group.position.y - prevY) / Math.max(dt, 1e-4);
    const grounded = Math.abs(group.position.y - groundY) < 0.06;
    if (wasFalling && grounded) dipT = 0.22;
    wasFalling = vy < LAND_DIP_VY;
    prevY = group.position.y;

    /* --- idle clock --- */
    if (speed > 0.4 || mag > 0.05) idleTime = 0;
    else idleTime += dt;

    /* --- bond-by-walking: shared miles gently feed the lead's resonance --- */
    if (speed > 0.5 && G.party.length > 0) {
      walkAcc += speed * dt;
      if (walkAcc >= RESONANCE_WALK_METERS) {
        walkAcc -= RESONANCE_WALK_METERS;
        G.resonanceWalks = (G.resonanceWalks ?? 0) + 1;
        import('../game/creatures.js')
          .then((m) => m.addResonanceXp?.(G.party[0], 2))
          .catch(() => { /* helpers not present yet */ });
      }
    }

    /* --- animation, prompts, wading splash, follower, save-state mirror --- */
    animate(dt);
    pollPrompt(dt);
    pollWading(dt);
    pushTrailPoint(group.position.x, group.position.z);
    updateFollower(dt);
    G.pos.x = group.position.x;
    G.pos.z = group.position.z;
    G.pos.face = face;
  }

  /* -------- api -------- */
  const api = {
    object3D: group,
    pos: group.position,
    get face() { return face; },
    set face(v) { face = v; group.rotation.y = v; },
    vel: { x: 0, z: 0 }, // updated for the camera rig's look-ahead
    get speed() { return speed; },
    update(dt) {
      update(dt);
      api.vel.x = vx; api.vel.z = vz;
    },
    teleport(x, z, newFace) {
      group.position.set(x, heightAt(x, z), z);
      prevY = group.position.y;
      vx = 0; vz = 0; speed = 0; vy = 0; wasFalling = false;
      wading = waterDepthAt(x, z) > WADE_DEPTH; // no splash on teleports
      if (newFace !== undefined) { face = newFace; group.rotation.y = newFace; }
      resetTrail(x, z);
      if (follower) {
        follower.x = x - Math.sin(face) * FOLLOW_DIST;
        follower.z = z - Math.cos(face) * FOLLOW_DIST;
        follower.y = heightAt(follower.x, follower.z);
        follower.face = face;
        follower.group.position.set(follower.x, follower.y, follower.z);
        followerPlay('idle');
      }
      if (promptText) { promptText = null; bus.emit('prompt:hide'); }
      promptTimer = 0;
      G.pos.x = x; G.pos.z = z; G.pos.face = face;
    },
    isFrozen() { return frozen; },
    /** Player-triggered rescue: drop any stranded freeze, step to open ground. */
    recover() {
      frozen = false;
      vx = 0; vz = 0; speed = 0;
      const sp = world.zone?.spawn;
      let x = group.position.x, z = group.position.z;
      if (!isFree(x, z)) {
        let found = false;
        for (let ring = 1; ring <= 8 && !found; ring++) {
          for (let a = 0; a < 12 && !found; a++) {
            const ang = (a / 12) * Math.PI * 2 + ring * 0.4;
            const cx = x + Math.cos(ang) * ring * 1.1, cz = z + Math.sin(ang) * ring * 1.1;
            if (isFree(cx, cz)) { x = cx; z = cz; found = true; }
          }
        }
        if (!found && sp) { x = sp[0]; z = sp[1]; }
      }
      api.teleport(x, z, face);
      bus.emit('notify', { text: 'You shake yourself loose.', icon: '✦' });
    },
    setFrozen(v) {
      frozen = !!v;
      if (frozen) {
        vx = 0; vz = 0; speed = 0;
        if (promptText) { promptText = null; bus.emit('prompt:hide'); }
      }
    },
    get frozen() { return frozen; },
    dispose() {
      offInteract?.();
      offParty?.();
      followerToken++; // cancel any in-flight follower build
      detachFollower();
      world.scene?.remove(group);
      disposeGroup(group); // warden geometries/materials are built per-instance
      if (promptText) bus.emit('prompt:hide');
      if (_current === api) _current = null;
    },
  };
  _current = api;
  return api;
}
