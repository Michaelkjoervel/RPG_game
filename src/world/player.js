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
import { disposeGroup } from '../gfx/materials.js';

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
const FOLLOW_TELEPORT = 12;    // snap to player if further than this
const TRAIL_SPACING = 0.22;    // breadcrumb spacing
const TRAIL_CAP = 64;          // ring buffer size (≥ 14u of path)
const RESONANCE_WALK_METERS = 140; // walked together -> +resonanceWalks tick

const BIOME_SURFACE = {
  meadow: 'grass', forest: 'grass', glade: 'grass', lake: 'grass',
  town: 'stone', cave: 'stone', mountain: 'stone', ruins: 'stone', spire: 'stone',
};

/* ============================ Warden model =============================== */

function M(color, { rough = 0.82, metal = 0, emissive = 0x000000, ei = 0.0, flat = true } = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal, flatShading: flat,
    emissive, emissiveIntensity: ei,
  });
}

/**
 * Builds the stylized Warden (~1.6u tall, feet at y=0, faces +Z).
 * Returns { group, refs } — refs are the animation handles.
 */
function buildWarden() {
  const P = { // palette — bible anchors: dusk purple cloak, shard-gold trim, warm skin
    skin: 0xf6c9a0, hair: 0xb06a3c, eye: 0x2e2622, tunic: 0xead9bd,
    pants: 0x4c4560, boots: 0x5d4030, bootCuff: 0x6f4d3a, belt: 0x3b3347,
    cloak: 0x5b4a8a, cloakLine: 0x6f5da3, gold: 0xffe9b0, satchel: 0x8a6b42,
  };
  const mats = {
    skin: M(P.skin, { rough: 0.62 }), hair: M(P.hair, { rough: 0.75 }),
    eye: M(P.eye, { rough: 0.35 }), glint: M(0xffffff, { rough: 0.2, emissive: 0xffffff, ei: 0.55 }),
    tunic: M(P.tunic), pants: M(P.pants), boots: M(P.boots), bootCuff: M(P.bootCuff),
    belt: M(P.belt), cloak: M(P.cloak), cloakLine: M(P.cloakLine),
    gold: M(P.gold, { rough: 0.4, metal: 0.35, emissive: 0xffe9b0, ei: 0.12 }),
    satchel: M(P.satchel),
  };
  const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; };

  const group = new THREE.Group();
  group.name = 'warden';
  const rig = new THREE.Group();     // animation offsets (bob, dip, bank)
  group.add(rig);
  const hips = new THREE.Group();    // hip joint — legs + torso hang off this
  hips.position.y = 0.78;
  rig.add(hips);

  /* legs (two-piece, boots) */
  function buildLeg(sideX) {
    const thigh = new THREE.Group();
    thigh.position.set(sideX, 0, 0);
    const thighMesh = mesh(new THREE.CapsuleGeometry(0.058, 0.27, 4, 8), mats.pants);
    thighMesh.position.y = -0.19;
    thigh.add(thighMesh);
    const shin = new THREE.Group();
    shin.position.y = -0.38;
    const shinMesh = mesh(new THREE.CapsuleGeometry(0.05, 0.22, 4, 8), mats.boots);
    shinMesh.position.y = -0.16;
    shin.add(shinMesh);
    const cuff = mesh(new THREE.CylinderGeometry(0.068, 0.062, 0.1, 8), mats.bootCuff);
    cuff.position.y = -0.1;
    shin.add(cuff);
    const foot = mesh(new THREE.BoxGeometry(0.11, 0.06, 0.2), mats.boots);
    foot.position.set(0, -0.37, 0.05);
    shin.add(foot);
    thigh.add(shin);
    hips.add(thigh);
    return { thigh, shin };
  }
  const legL = buildLeg(-0.095);
  const legR = buildLeg(0.095);

  /* torso — pivots at the hips so lean reads from the waist */
  const torso = new THREE.Group();
  hips.add(torso);
  const skirt = mesh(new THREE.CylinderGeometry(0.155, 0.185, 0.16, 9), mats.tunic);
  skirt.position.y = 0.05;
  torso.add(skirt);
  const chest = mesh(new THREE.CapsuleGeometry(0.145, 0.17, 4, 9), mats.tunic);
  chest.position.y = 0.28;
  chest.scale.set(1.15, 1, 0.92);
  torso.add(chest);
  const belt = mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.05, 9), mats.belt);
  belt.position.y = 0.15;
  torso.add(belt);
  const buckle = mesh(new THREE.BoxGeometry(0.055, 0.04, 0.02), mats.gold);
  buckle.position.set(0, 0.15, 0.16);
  torso.add(buckle);
  /* satchel on the right hip + strap across the chest — signature silhouette bit */
  const satchel = new THREE.Group();
  satchel.position.set(0.19, 0.08, -0.03);
  satchel.rotation.z = -0.12;
  const satchelBody = mesh(new THREE.BoxGeometry(0.15, 0.13, 0.08), mats.satchel);
  const satchelFlap = mesh(new THREE.BoxGeometry(0.155, 0.06, 0.09), M(0x76582f));
  satchelFlap.position.y = 0.055;
  satchel.add(satchelBody, satchelFlap);
  torso.add(satchel);
  const strap = mesh(new THREE.BoxGeometry(0.045, 0.5, 0.02), mats.satchel);
  strap.position.set(0.02, 0.3, 0.135);
  strap.rotation.z = 0.55;
  torso.add(strap);

  /* arms */
  function buildArm(sideX) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideX, 0.4, 0);
    const arm = mesh(new THREE.CapsuleGeometry(0.05, 0.24, 4, 8), mats.tunic);
    arm.position.y = -0.17;
    shoulder.add(arm);
    const hand = mesh(new THREE.SphereGeometry(0.052, 8, 6), mats.skin);
    hand.position.y = -0.35;
    shoulder.add(hand);
    shoulder.rotation.z = sideX < 0 ? -0.16 : 0.16;
    torso.add(shoulder);
    return shoulder;
  }
  const armL = buildArm(-0.2);
  const armR = buildArm(0.2);

  /* head + warm simple face */
  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.07, 8), mats.skin);
  neck.position.y = 0.49;
  torso.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.52;
  torso.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.155, 12, 10), mats.skin);
  skull.position.y = 0.1;
  head.add(skull);
  /* hair: cap + fringe + the springy tuft */
  const hairCap = mesh(new THREE.SphereGeometry(0.163, 10, 8), mats.hair);
  hairCap.position.set(0, 0.135, -0.03);
  hairCap.scale.set(1.02, 0.82, 1.02);
  head.add(hairCap);
  const fringe = mesh(new THREE.SphereGeometry(0.07, 8, 6), mats.hair);
  fringe.position.set(0.07, 0.19, 0.1);
  fringe.scale.set(1.15, 0.6, 0.9);
  head.add(fringe);
  const hairTuft = new THREE.Group();
  hairTuft.position.set(-0.02, 0.27, -0.01);
  const tuftMesh = mesh(new THREE.ConeGeometry(0.045, 0.14, 6), mats.hair);
  tuftMesh.position.y = 0.05;
  tuftMesh.rotation.z = 0.35;
  hairTuft.add(tuftMesh);
  head.add(hairTuft);
  /* eyes with glints (blinkable groups), brows, small smile */
  function buildEye(sideX) {
    const g = new THREE.Group();
    g.position.set(sideX, 0.105, 0.132);
    const ball = mesh(new THREE.SphereGeometry(0.023, 8, 6), mats.eye);
    ball.castShadow = false;
    const glint = mesh(new THREE.SphereGeometry(0.008, 6, 5), mats.glint);
    glint.castShadow = false;
    glint.position.set(0.008, 0.009, 0.017);
    g.add(ball, glint);
    head.add(g);
    return g;
  }
  const eyeL = buildEye(-0.056);
  const eyeR = buildEye(0.056);
  for (const [sx, tilt] of [[-0.056, 0.12], [0.056, -0.12]]) {
    const brow = mesh(new THREE.BoxGeometry(0.052, 0.013, 0.012), mats.hair);
    brow.castShadow = false;
    brow.position.set(sx, 0.152, 0.138);
    brow.rotation.z = tilt;
    head.add(brow);
  }
  const smile = mesh(new THREE.BoxGeometry(0.04, 0.009, 0.01), M(0xb5765a, { rough: 0.6 }));
  smile.castShadow = false;
  smile.position.set(0, 0.038, 0.146);
  head.add(smile);

  /* travel cloak: hood roll + 3 chained segments with a gold-trimmed hem */
  const hood = mesh(new THREE.TorusGeometry(0.12, 0.05, 6, 10), mats.cloak);
  hood.position.set(0, 0.47, -0.1);
  hood.rotation.x = 1.35;
  torso.add(hood);
  const cloakSegs = [];
  let cloakParent = torso;
  let anchorY = 0.42, anchorZ = -0.15;
  const segLens = [0.3, 0.3, 0.26];
  const segWidths = [0.46, 0.5, 0.46];
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    if (i === 0) pivot.position.set(0, anchorY, anchorZ);
    else pivot.position.set(0, -segLens[i - 1], 0);
    const panel = mesh(new THREE.BoxGeometry(segWidths[i], segLens[i], 0.028), i === 1 ? mats.cloakLine : mats.cloak);
    panel.position.y = -segLens[i] / 2;
    pivot.add(panel);
    if (i === 2) {
      const trim = mesh(new THREE.BoxGeometry(segWidths[i] + 0.01, 0.035, 0.034), mats.gold);
      trim.position.y = -segLens[i] + 0.017;
      pivot.add(trim);
    }
    pivot.rotation.x = 0.14; // drapes slightly away from the back at rest
    cloakParent.add(pivot);
    cloakParent = pivot;
    cloakSegs.push(pivot);
  }
  /* gold clasp where the cloak meets the collar */
  const clasp = mesh(new THREE.SphereGeometry(0.03, 8, 6), mats.gold);
  clasp.position.set(0, 0.45, 0.13);
  torso.add(clasp);

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
      follower = {
        group: built.group, animator: built.animator, speciesId: lead.speciesId,
        hollowed: !!lead.hollowed, state: 'idle',
        x: _trailOut.x, z: _trailOut.z, y: group.position.y, face,
        happyCd: 6 + Math.random() * 6,
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
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        const dx = group.position.x - c.x, dz = group.position.z - c.z;
        const rr = c.r + PLAYER_RADIUS;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) / d;
        group.position.x += dx * push;
        group.position.z += dz * push;
      }
    }
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
