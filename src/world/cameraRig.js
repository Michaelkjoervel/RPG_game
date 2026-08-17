// ============================================================================
// cameraRig.js — the exploration camera: smooth third-person orbit-follow.
//
// Contract (docs/CONTRACTS_ADDENDUM.md):
//   createCameraRig(world) -> { camera, update(dt), impulse(str) } (listens 'cam:shake')
//
// Design goal: moving around must feel as good as a polished console
// action-adventure. Every constant below is a feel decision — tune with care.
// ============================================================================
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { clamp, clamp01, damp, dampAngle, TAU } from '../core/math.js';

/* ------------------------------- orbit tuning ------------------------------ */
const DEFAULT_PITCH = 18 * (Math.PI / 180); // contract value: ~18deg elevation at rest
const MIN_PITCH = 4 * (Math.PI / 180);      // near-horizon — cinematic low shots
const MAX_PITCH = 78 * (Math.PI / 180);     // near top-down — scouting a clearing
const DEFAULT_DIST = 7.5;                   // contract value
const MIN_DIST = 5;                         // contract value: wheel zoom range 5..11
const MAX_DIST = 11;                        // contract value
const MIN_DIST_HARD = 1.6;                  // obstacle pull-in may go tighter than the zoom floor
const EYE_HEIGHT = 1.42;                    // orbit/look pivot — roughly the Warden's chest/chin

/* ------------------------------ response tuning ----------------------------- */
const YAW_RECENTER_LAMBDA = 1.55;   // how softly yaw drifts back behind the player while moving
const PITCH_SETTLE_LAMBDA = 1.4;    // slow drift of pitch back to default after a long, settled idle
const DIST_LAMBDA_IN = 15.0;        // fast pull-in when an obstacle appears (avoid clipping)
const DIST_LAMBDA_OUT = 4.2;        // slow ease back out once clear — no jarring snap (also smooths wheel zoom)
const LOOKAHEAD_MAX = 1.7;          // meters the focus point leads the player at a dead sprint
const LOOKAHEAD_SPEED_REF = 6.0;    // speed (u/s) at which look-ahead reaches LOOKAHEAD_MAX
const LOOKAHEAD_LAMBDA = 3.4;
const GROUND_CLEARANCE = 0.4;       // contract value: camera y >= heightAt(x,z) + this

/* -------------------------------- fov tuning -------------------------------- */
const BASE_FOV = 55;
const RUN_FOV_KICK = 6;             // contract value
const FOV_LAMBDA = 6.5;

/* ------------------------------ manual orbit input --------------------------- */
const DRAG_YAW_SPEED = 0.0062;      // rad per pixel of pointer drag
const DRAG_PITCH_SPEED = 0.0052;
const PAD_YAW_SPEED = 2.5;          // rad/sec at full right-stick deflection
const PAD_PITCH_SPEED = 1.9;
const PAD_DEADZONE = 0.18;
const WHEEL_ZOOM_SPEED = 0.0016;    // distance units per wheel-delta unit
const MANUAL_COOLDOWN = 0.5;        // seconds after manual input stops before auto-recenter resumes

/* -------------------------------- idle drift --------------------------------- */
const IDLE_DRIFT_DELAY = 5.0;       // contract value: seconds of stillness before it kicks in
const IDLE_DRIFT_AMP = 0.045;
const IDLE_DRIFT_SPEED = 0.34;

/* ------------------------------ obstacle avoidance ---------------------------- */
const COLLIDER_CLEARANCE = 0.55;    // how far outside a collider's edge the camera must stay
const MAX_SHAKES = 6;               // stacking cap — never grows unbounded

/**
 * Closest-hit distance of the ray (ax,az)+(dx,dz)*t, t in [0,testLen], against a set of
 * {x,z,r} collider circles (each padded by `clearance`). Pure function, no allocations,
 * used for the camera's obstacle-avoidance raycast (props are treated as vertical
 * cylinders in the XZ plane — a cheap, good-enough stand-in for full mesh raycasting).
 * Returns Infinity when nothing blocks the ray within testLen.
 */
export function segmentHitDistance(ax, az, dx, dz, testLen, colliders, clearance) {
  let best = Infinity;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const r = c.r + clearance;
    const fx = ax - c.x, fz = az - c.z;
    const reach = testLen + r;
    if (fx * fx + fz * fz > reach * reach) continue; // cheap bounding reject
    const a = dx * dx + dz * dz;
    if (a < 1e-8) continue;
    const b = 2 * (fx * dx + fz * dz);
    const cc = fx * fx + fz * fz - r * r;
    const disc = b * b - 4 * a * cc;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    let t = (-b - sq) / (2 * a);
    if (t < 0) {
      if (cc < 0) t = 0; // origin already inside the collider — block immediately
      else continue;
    }
    if (t <= testLen && t < best) best = t;
  }
  return best;
}

let _current = null; // auto-dispose the previous rig on zone reload (mirrors player.js)

export function createCameraRig(world) {
  if (_current) { try { _current.dispose(); } catch (e) { /* ignore */ } _current = null; }

  const hasDOM = typeof window !== 'undefined' && typeof document !== 'undefined';
  const aspect = hasDOM ? window.innerWidth / window.innerHeight : 16 / 9;
  const camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.1, 500);
  camera.up.set(0, 1, 0);

  /* -------- orbit state -------- */
  let yaw = 0;                 // azimuth of the camera relative to the focus point (radians)
  let pitch = DEFAULT_PITCH;
  let curDist = DEFAULT_DIST;  // damped, obstacle-aware distance actually rendered
  let zoomTarget = DEFAULT_DIST; // user-requested distance via wheel, clamped [MIN_DIST, MAX_DIST]
  let fov = BASE_FOV;
  let lookAheadX = 0, lookAheadZ = 0;
  let manualCooldown = 0;
  let idleTimer = 0;
  let time = 0;
  let yawInitialized = false;

  const shakes = []; // { t, dur, mag, fx,fy,fz, px,py,pz }

  /* -------- reusable scratch (no per-frame allocations) -------- */
  const _lookScratch = new THREE.Vector3();

  /* -------- manual orbit input: pointer drag + gamepad right stick -------- */
  const canvasEl = hasDOM ? document.getElementById('game-canvas') : null;
  const dragTarget = canvasEl || (hasDOM ? window : null);
  let dragging = false;
  let lastPX = 0, lastPY = 0, dragDX = 0, dragDY = 0;
  let pendingWheel = 0;

  function onPointerDown(e) {
    // Right-mouse-button drag orbits; a bare pointer-drag (touch, or any button on
    // devices with no button semantics) also orbits so the camera is touch-friendly.
    if (e.pointerType === 'mouse' && e.button !== 2) return;
    dragging = true;
    lastPX = e.clientX; lastPY = e.clientY;
    try { dragTarget.setPointerCapture?.(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onPointerMove(e) {
    if (!dragging) return;
    dragDX += e.clientX - lastPX;
    dragDY += e.clientY - lastPY;
    lastPX = e.clientX; lastPY = e.clientY;
  }
  function onPointerUp() { dragging = false; }
  function onContextMenu(e) { e.preventDefault(); } // right-drag shouldn't pop a context menu
  function onWheel(e) { pendingWheel += e.deltaY; e.preventDefault?.(); }

  if (hasDOM && dragTarget) {
    dragTarget.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    dragTarget.addEventListener('contextmenu', onContextMenu);
    dragTarget.addEventListener('wheel', onWheel, { passive: false });
  }

  /* -------- shake -------- */
  function addShake(intensity, dur) {
    if (intensity <= 0) return;
    shakes.push({
      t: 0, dur: Math.max(0.05, dur ?? 0.3), mag: intensity,
      fx: 16 + Math.random() * 12, fy: 12 + Math.random() * 9, fz: 15 + Math.random() * 11,
      px: Math.random() * TAU, py: Math.random() * TAU, pz: Math.random() * TAU,
    });
    if (shakes.length > MAX_SHAKES) shakes.shift();
  }
  // 'cam:shake' payloads already pass through core/tween.js's shake(), which itself
  // reduces intensity when settings.camShake is off — trust that single source and
  // don't re-scale here (re-scaling both places would double-attenuate).
  const offShake = bus.on('cam:shake', ({ intensity, dur } = {}) => addShake(intensity ?? 0.4, dur ?? 0.3));

  /** Direct, code-driven camera kick (bypasses the bus) — e.g. a heavy landing or a
   * world event that isn't routed through tween.shake(). Honors settings.camShake itself
   * since it doesn't pass through that gate. */
  function impulse(str) {
    const scaled = settings.camShake ? str : str * 0.25;
    addShake(scaled, 0.22);
  }

  /* ================================ update =================================== */
  function update(dt) {
    time += dt;
    const player = world.player;
    const px = player ? player.pos.x : 0;
    const pz = player ? player.pos.z : 0;
    const pface = player ? player.face : 0;
    const speed = player ? (player.speed ?? 0) : 0;
    const pvx = player?.vel?.x ?? 0, pvz = player?.vel?.z ?? 0;

    if (!yawInitialized) { yaw = pface + Math.PI; yawInitialized = true; } // start neatly behind

    /* --- manual orbit: pointer drag --- */
    let manualActive = false;
    if (dragDX !== 0 || dragDY !== 0) {
      const invert = settings.invertY ? -1 : 1;
      yaw -= dragDX * DRAG_YAW_SPEED;
      pitch = clamp(pitch - dragDY * DRAG_PITCH_SPEED * invert, MIN_PITCH, MAX_PITCH);
      dragDX = 0; dragDY = 0;
    }
    if (dragging) manualActive = true;

    /* --- manual orbit: gamepad right stick (input.js only tracks the left stick) --- */
    const gpList = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : null;
    const gp = gpList ? gpList[0] : null;
    if (gp && gp.axes && gp.axes.length >= 4) {
      const rawX = gp.axes[2], rawY = gp.axes[3];
      const gx = Math.abs(rawX) > PAD_DEADZONE ? rawX : 0;
      const gy = Math.abs(rawY) > PAD_DEADZONE ? rawY : 0;
      if (gx !== 0 || gy !== 0) {
        const invert = settings.invertY ? -1 : 1;
        yaw -= gx * PAD_YAW_SPEED * dt;
        pitch = clamp(pitch - gy * PAD_PITCH_SPEED * dt * invert, MIN_PITCH, MAX_PITCH);
        manualActive = true;
      }
    }
    manualCooldown = manualActive ? MANUAL_COOLDOWN : Math.max(0, manualCooldown - dt);

    // keep yaw bounded (cosmetic hygiene; dampAngle already handles wraparound regardless)
    yaw = ((yaw % TAU) + TAU) % TAU;
    if (yaw > Math.PI) yaw -= TAU;

    /* --- auto yaw recenter behind the movement direction while moving & unmanaged --- */
    const moving = speed > 0.35;
    if (moving && manualCooldown <= 0) {
      yaw = dampAngle(yaw, pface + Math.PI, YAW_RECENTER_LAMBDA, dt);
    }
    // pitch relaxes toward its resting value only when nobody's driving it and we're
    // otherwise settled — keeps deliberate manual framing from drifting away underfoot,
    // while still returning to a comfortable default after the player wanders off.
    if (!moving && manualCooldown <= 0 && idleTimer > IDLE_DRIFT_DELAY) {
      pitch = damp(pitch, DEFAULT_PITCH, PITCH_SETTLE_LAMBDA, dt);
    }

    /* --- zoom --- */
    if (pendingWheel !== 0) {
      zoomTarget = clamp(zoomTarget + pendingWheel * WHEEL_ZOOM_SPEED, MIN_DIST, MAX_DIST);
      pendingWheel = 0;
    }

    /* --- look-ahead focus point --- */
    const lookScale = LOOKAHEAD_MAX / LOOKAHEAD_SPEED_REF;
    lookAheadX = damp(lookAheadX, pvx * lookScale, LOOKAHEAD_LAMBDA, dt);
    lookAheadZ = damp(lookAheadZ, pvz * lookScale, LOOKAHEAD_LAMBDA, dt);
    const groundY = world.heightAt ? world.heightAt(px, pz) : 0;
    const targetX = px + lookAheadX;
    const targetY = groundY + EYE_HEIGHT;
    const targetZ = pz + lookAheadZ;

    /* --- orbit direction from yaw/pitch --- */
    const cp = Math.cos(pitch);
    const dirX = Math.sin(yaw) * cp;
    const dirZ = Math.cos(yaw) * cp;
    const dirY = Math.sin(pitch);

    /* --- obstacle avoidance: pull in fast on hit, ease back out slowly --- */
    let obstacleDist = Infinity;
    if (world.colliders && world.colliders.length) {
      obstacleDist = segmentHitDistance(targetX, targetZ, dirX, dirZ, MAX_DIST, world.colliders, COLLIDER_CLEARANCE);
    }
    const desiredDist = clamp(Math.min(zoomTarget, obstacleDist), MIN_DIST_HARD, MAX_DIST);
    curDist = damp(curDist, desiredDist, desiredDist < curDist ? DIST_LAMBDA_IN : DIST_LAMBDA_OUT, dt);

    let camX = targetX + dirX * curDist;
    let camY = targetY + dirY * curDist;
    let camZ = targetZ + dirZ * curDist;

    /* --- idle breathing drift (subtle handheld-feel life, never while manually orbiting) --- */
    const idle = !moving && !manualActive && manualCooldown <= 0;
    idleTimer = idle ? idleTimer + dt : 0;
    if (idleTimer > IDLE_DRIFT_DELAY) {
      const t = idleTimer - IDLE_DRIFT_DELAY;
      camX += Math.sin(t * IDLE_DRIFT_SPEED) * IDLE_DRIFT_AMP;
      camY += Math.sin(t * IDLE_DRIFT_SPEED * 1.3 + 1.1) * IDLE_DRIFT_AMP * 0.5;
      camZ += Math.cos(t * IDLE_DRIFT_SPEED * 0.8 + 0.6) * IDLE_DRIFT_AMP;
    }

    /* --- decaying perlin-ish shake (layered, dephased sines; ease-out envelope) --- */
    if (shakes.length) {
      let sx = 0, sy = 0, sz = 0;
      for (let i = shakes.length - 1; i >= 0; i--) {
        const s = shakes[i];
        s.t += dt;
        if (s.t >= s.dur) { shakes.splice(i, 1); continue; }
        const k = 1 - s.t / s.dur;
        const amp = s.mag * k * k;
        sx += Math.sin(time * s.fx + s.px) * amp;
        sy += Math.sin(time * s.fy + s.py) * amp * 0.6;
        sz += Math.sin(time * s.fz + s.pz) * amp;
      }
      camX += sx; camY += sy; camZ += sz;
    }

    /* --- never end up inside a prop ---
       The segment test above stops the camera crossing a collider, but shake,
       idle drift and a target that is itself against a wall can still leave the
       eye inside one. Push it straight out to the surface; if it is somehow
       inside several, the last one wins and the next frame settles the rest. */
    if (world.colliders) {
      for (let i = 0; i < world.colliders.length; i++) {
        const c = world.colliders[i];
        const dx = camX - c.x, dz = camZ - c.z;
        const rr = c.r + COLLIDER_CLEARANCE;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        if (d2 < 1e-8) { camX = c.x + rr; continue; }
        const d = Math.sqrt(d2), push = (rr - d) / d;
        camX += dx * push; camZ += dz * push;
      }
    }

    /* --- never clip underground (contract requirement) --- */
    if (world.heightAt) {
      const floor = world.heightAt(camX, camZ) + GROUND_CLEARANCE;
      if (camY < floor) camY = floor;
    }

    camera.position.set(camX, camY, camZ);
    _lookScratch.set(targetX, targetY, targetZ);
    camera.lookAt(_lookScratch);

    /* --- run fov kick --- */
    const runKick = moving ? RUN_FOV_KICK * clamp01(speed / LOOKAHEAD_SPEED_REF) : 0;
    const targetFov = BASE_FOV + runKick;
    const newFov = damp(fov, targetFov, FOV_LAMBDA, dt);
    if (Math.abs(newFov - fov) > 0.01) { fov = newFov; camera.fov = fov; camera.updateProjectionMatrix(); }
    else fov = newFov;
  }

  function dispose() {
    offShake?.();
    if (hasDOM && dragTarget) {
      dragTarget.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      dragTarget.removeEventListener('contextmenu', onContextMenu);
      dragTarget.removeEventListener('wheel', onWheel);
    }
    if (_current === api) _current = null;
  }

  const api = { camera, update, impulse, dispose };
  _current = api;
  return api;
}
