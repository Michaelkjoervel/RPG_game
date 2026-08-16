// Battle camera director — named cinematic shots with damped transitions,
// handheld drift and shake-stacking. Pure THREE + core singletons; no DOM.
//
// createCameraDirector({ getFocus }) -> {
//   camera,                          // THREE.PerspectiveCamera
//   update(dt),                      // call every frame
//   async shot(name, opts) -> Promise,   // cuts/eases to a named framing
//   impulse(strength),               // one-off shake without waiting for bus
//   dispose(),
// }
// getFocus(side) -> {x,y,z} world-space chest-height point for 'p'|'e', or
// null if that side has no creature on stage right now (director falls back
// to the arena mark position).
import * as THREE from 'three';
import { damp, clamp01 } from '../core/math.js';
import { bus } from '../core/events.js';
import { delay } from '../core/tween.js';

const UP = new THREE.Vector3(0, 1, 0);

function hashNoise(x) { const s = Math.sin(x * 12.9898) * 43758.5453123; return s - Math.floor(s); }

const DEFAULT_MS = {
  wide: 900, overShoulderP: 420, overShoulderE: 420, rest: 420,
  closeUp: 260, lowBeam: 320, burstCharge: 500, sendIn: 380,
  catchFocus: 340, victory: 700, defeat: 700,
};

export function createCameraDirector({ getFocus } = {}) {
  const aspect = (typeof window !== 'undefined' && window.innerHeight) ? window.innerWidth / window.innerHeight : 16 / 9;
  const camera = new THREE.PerspectiveCamera(34, aspect, 0.1, 300);
  camera.position.set(0, 6.4, -13);
  camera.lookAt(0, 1.3, 0);

  const state = { pos: camera.position.clone(), look: new THREE.Vector3(0, 1.3, 0), fov: 34, lambdaPos: 5, lambdaLook: 6, lambdaFov: 6 };
  const desired = { pos: state.pos.clone(), look: state.look.clone(), fov: 34 };
  let orbit = null; // { center, radius, height, speed, angle0 }
  let driftT = Math.random() * 1000;
  let shakeMag = 0, shakeDur = 0, shakeT = 0;
  let restCounter = 0; // alternates idle rest framings between turns

  const offShake = bus.on('cam:shake', ({ intensity = 0.5, dur = 0.3 } = {}) => {
    if (intensity >= shakeMag * (1 - clamp01(shakeT / Math.max(0.001, shakeDur)))) {
      shakeMag = intensity; shakeDur = dur; shakeT = 0;
    }
  });

  function focus(side) {
    const f = getFocus?.(side);
    if (f) return new THREE.Vector3(f.x, f.y, f.z);
    return new THREE.Vector3(side === 'e' ? 4.5 : -4.5, 1.2, 0);
  }
  function dirBetween(from, to) { return to.clone().sub(from).setY(0).normalize(); }
  function sideAxis(dir) { return new THREE.Vector3(-dir.z, 0, dir.x); }
  function midpoint(a, b, t = 0.5) { return new THREE.Vector3().lerpVectors(a, b, t); }

  function setDesired(pos, look, fov = 34, { lambdaPos = 5, lambdaLook = 6 } = {}) {
    desired.pos.copy(pos); desired.look.copy(look); desired.fov = fov;
    state.lambdaPos = lambdaPos; state.lambdaLook = lambdaLook;
    orbit = null;
  }

  function shoulder(self, other) {
    const f = focus(self), o = focus(other);
    const dir = dirBetween(f, o);
    const side = sideAxis(dir);
    const sgn = self === 'p' ? 1 : -1;
    const pos = f.clone().addScaledVector(dir, -3.1).addScaledVector(side, 1.7 * sgn).add(new THREE.Vector3(0, 2.05, 0));
    const look = o.clone().add(new THREE.Vector3(0, 0.25, 0));
    setDesired(pos, look, 32, { lambdaPos: 4.2, lambdaLook: 5 });
  }

  const SHOTS = {
    wide() {
      const p = focus('p'), e = focus('e');
      const m = midpoint(p, e);
      setDesired(new THREE.Vector3(m.x * 0.2, 7.4, -14.5), new THREE.Vector3(m.x, m.y + 0.4, m.z), 37, { lambdaPos: 2.2, lambdaLook: 2.4 });
    },
    overShoulderP() { shoulder('p', 'e'); },
    overShoulderE() { shoulder('e', 'p'); },
    // Idle/rest framing alternates 3 variants by turn index (opts.variant, or
    // an internal counter) so long battles don't sit on one static shot.
    rest(opts = {}) {
      const variant = Math.abs((opts.variant ?? restCounter++) | 0) % 3;
      if (variant === 0) { shoulder('p', 'e'); return; }
      const p = focus('p'), e = focus('e');
      if (variant === 1) {
        // low lateral profile — both silhouettes fully in frame, camera-side
        const m = midpoint(p, e);
        const dir = dirBetween(p, e);
        const side = sideAxis(dir);
        const pos = m.clone().addScaledVector(side, -10.4).add(new THREE.Vector3(0, 1.6, 0));
        setDesired(pos, m.clone().add(new THREE.Vector3(0, 0.55, 0)), 34, { lambdaPos: 3, lambdaLook: 3.4 });
      } else {
        // elevated 3/4 from the player's corner, looking across at the foe
        const dir = dirBetween(p, e);
        const side = sideAxis(dir);
        const pos = p.clone().addScaledVector(dir, -2.6).addScaledVector(side, -3.4).add(new THREE.Vector3(0, 3.1, 0));
        setDesired(pos, midpoint(p, e, 0.6).add(new THREE.Vector3(0, 0.25, 0)), 33, { lambdaPos: 3.2, lambdaLook: 3.6 });
      }
    },
    // Scale-aware close-up: distance grows with the subject's chest height so
    // tall Kindred aren't clipped and small ones still fill frame; the aim
    // point sits above the chest so the subject reads in the lower third.
    closeUp(opts = {}) {
      const side = opts.side ?? 'p';
      const other = side === 'p' ? 'e' : 'p';
      const f = focus(side), o = focus(other);
      const dir = dirBetween(f, o);
      const side3 = sideAxis(dir);
      const sgn = side === 'p' ? 1 : -1;
      const d = Math.max(2.2, f.y * 3.2);
      const pos = f.clone().addScaledVector(dir, -d).addScaledVector(side3, 0.85 * sgn).add(new THREE.Vector3(0, 0.3 + d * 0.12, 0));
      const look = f.clone().add(new THREE.Vector3(0, d * 0.14, 0));
      setDesired(pos, look, 28, { lambdaPos: 9.5, lambdaLook: 9.5 });
    },
    lowBeam() {
      const p = focus('p'), e = focus('e');
      const near = midpoint(p, e, 0.3);
      const pos = new THREE.Vector3(near.x, 0.35, near.z - 1.6);
      const look = midpoint(p, e, 0.72).add(new THREE.Vector3(0, 0.7, 0));
      setDesired(pos, look, 42, { lambdaPos: 8, lambdaLook: 8 });
    },
    orbitKO(opts = {}) {
      const side = opts.side ?? 'e';
      const center = focus(side);
      orbit = { center, radius: opts.radius ?? 3.3, height: opts.height ?? 1.7, speed: opts.speed ?? 0.45, angle0: opts.startAngle ?? 0.6, t: 0 };
      state.lambdaPos = 5; state.lambdaLook = 6.5; state.fov = state.fov; desired.fov = opts.fov ?? 30;
    },
    burstCharge(opts = {}) {
      const side = opts.side ?? 'p';
      const other = side === 'p' ? 'e' : 'p';
      const f = focus(side), o = focus(other);
      const dir = dirBetween(f, o);
      const pos = f.clone().addScaledVector(dir, -3.3).add(new THREE.Vector3(0, 1.55, 0));
      setDesired(pos, f.clone().add(new THREE.Vector3(0, 0.35, 0)), 29, { lambdaPos: 6.5, lambdaLook: 6.5 });
    },
    sendIn(opts = {}) {
      const side = opts.side ?? 'p';
      const f = focus(side);
      const pos = f.clone().add(new THREE.Vector3(side === 'p' ? -2.7 : 2.7, 1.25, -3.5));
      setDesired(pos, f, 31, { lambdaPos: 5, lambdaLook: 5 });
    },
    catchFocus(opts = {}) {
      // opts.push: world units to creep toward the charm (escalating tension
      // during catch shakes — presentation passes 0.25u per shake).
      const e = focus('e');
      const base = new THREE.Vector3(1.6, 0.9, -2.4);
      const len = base.length();
      const push = Math.min(opts.push ?? 0, len - 1.0); // never through the charm
      const off = base.multiplyScalar((len - push) / len);
      setDesired(e.clone().add(off), e.clone(), 27, { lambdaPos: 3.4, lambdaLook: 4 });
    },
    victory(opts = {}) {
      const side = opts.side ?? 'p';
      const f = focus(side);
      setDesired(f.clone().add(new THREE.Vector3(side === 'p' ? -2.2 : 2.2, 1.6, -4.4)), f.clone().add(new THREE.Vector3(0, 0.3, 0)), 33, { lambdaPos: 2.6, lambdaLook: 3 });
    },
    defeat() {
      const p = focus('p');
      setDesired(p.clone().add(new THREE.Vector3(-1.2, 2.4, -4.8)), p.clone(), 36, { lambdaPos: 2, lambdaLook: 2.4 });
    },
  };

  async function shot(name, opts = {}) {
    const fn = SHOTS[name] ?? SHOTS.rest;
    fn(opts);
    if (opts.cut) { // hard cut: snap to the new framing, no damped glide
      state.pos.copy(desired.pos);
      state.look.copy(desired.look);
      state.fov = desired.fov;
    }
    const ms = opts.ms ?? DEFAULT_MS[name] ?? 300;
    if (ms > 0) await delay(ms / 1000);
  }

  function impulse(strength = 0.5) { shakeMag = Math.max(shakeMag, strength); shakeDur = 0.35; shakeT = 0; }

  function update(dt) {
    driftT += dt;
    if (orbit) {
      orbit.t += dt;
      const a = orbit.angle0 + orbit.t * orbit.speed;
      desired.pos.set(orbit.center.x + Math.sin(a) * orbit.radius, orbit.center.y + orbit.height, orbit.center.z + Math.cos(a) * orbit.radius);
      desired.look.copy(orbit.center);
    }
    state.pos.x = damp(state.pos.x, desired.pos.x, state.lambdaPos, dt);
    state.pos.y = damp(state.pos.y, desired.pos.y, state.lambdaPos, dt);
    state.pos.z = damp(state.pos.z, desired.pos.z, state.lambdaPos, dt);
    state.look.x = damp(state.look.x, desired.look.x, state.lambdaLook, dt);
    state.look.y = damp(state.look.y, desired.look.y, state.lambdaLook, dt);
    state.look.z = damp(state.look.z, desired.look.z, state.lambdaLook, dt);
    state.fov = damp(state.fov, desired.fov, state.lambdaFov, dt);

    const driftX = Math.sin(driftT * 0.31) * 0.045 + Math.sin(driftT * 0.71 + 1.3) * 0.02;
    const driftY = Math.sin(driftT * 0.23 + 2.1) * 0.028;

    let sx = 0, sy = 0, sz = 0, roll = 0;
    if (shakeT < shakeDur) {
      shakeT += dt;
      const decay = 1 - clamp01(shakeT / shakeDur);
      const m = shakeMag * decay * decay;
      sx = (hashNoise(driftT * 37.1) - 0.5) * m;
      sy = (hashNoise(driftT * 53.7 + 11) - 0.5) * m * 0.7;
      sz = (hashNoise(driftT * 29.3 + 23) - 0.5) * m;
      // ±0.5° roll jitter — sells the impact without disorienting
      roll = (hashNoise(driftT * 47.3 + 5) - 0.5) * (Math.PI / 180) * Math.min(1, m * 2.5);
    } else if (shakeMag > 0) shakeMag = 0;

    camera.position.set(state.pos.x + driftX + sx, state.pos.y + driftY + sy, state.pos.z + sz);
    camera.up.copy(UP);
    camera.lookAt(state.look.x, state.look.y, state.look.z);
    if (roll) camera.rotateZ(roll);
    if (Math.abs(camera.fov - state.fov) > 0.01) { camera.fov = state.fov; camera.updateProjectionMatrix(); }
  }

  function dispose() { offShake(); }

  return { camera, update, shot, impulse, dispose };
}
