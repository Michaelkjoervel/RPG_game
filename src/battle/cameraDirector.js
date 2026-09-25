// Battle camera director — named cinematic framings with damped transitions,
// handheld drift and shake-stacking. Pure THREE + core singletons; no DOM.
// (Framing only: WHEN a shot is called is presentation.js's business.)
//
// createCameraDirector({ getFocus }) -> {
//   camera,                          // THREE.PerspectiveCamera
//   update(dt),                      // call every frame
//   async shot(name, opts) -> Promise,   // cuts/eases to a named framing
//   impulse(strength),               // one-off shake without waiting for bus
//   dispose(),
// }
// getFocus(side) -> { x, y, z, radius, height } — chest-height point, bounding
// radius and standing height of the creature on 'p' | 'e' (or of its empty
// stand mark).
//
// v2 framing: every shot is built in the fight's own axis frame (u = player →
// foe, w = the camera's side of that line) and keeps one side of the line
// (the 180° rule: the player's Kindred always reads screen-left of the foe).
// The resting two-shots are SOLVED, not guessed: a tiny Levenberg–Marquardt
// fit places the camera so the player's creature sits low-left over its
// shoulder and the foe stands heroic right-of-center, clear of both HUD
// plates, at an apparent size that suits each creature's real size — from a
// 0.3 m motling to a 3 m legend.
import * as THREE from 'three';
import { damp, clamp01 } from '../core/math.js';
import { bus } from '../core/events.js';
import { delay } from '../core/tween.js';

const UP = new THREE.Vector3(0, 1, 0);

function hashNoise(x) { const s = Math.sin(x * 12.9898) * 43758.5453123; return s - Math.floor(s); }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const DEFAULT_MS = {
  wide: 900, overShoulderP: 420, overShoulderE: 420, rest: 420,
  closeUp: 260, lowBeam: 320, burstCharge: 500, sendIn: 380,
  catchFocus: 340, victory: 700, defeat: 700,
};

// ---------------------------------------------------------------- solver
const _r = new THREE.Vector3(), _u2 = new THREE.Vector3(), _d = new THREE.Vector3();
function projectFrac(X, C, f, tanHalf, aspect, out) {
  _r.crossVectors(f, UP).normalize();
  _u2.crossVectors(_r, f);
  _d.subVectors(X, C);
  const z = Math.max(1e-3, _d.dot(f));
  out.x = 0.5 + 0.5 * _d.dot(_r) / (z * tanHalf * aspect);
  out.y = 0.5 - 0.5 * _d.dot(_u2) / (z * tanHalf);
  out.z = z;
  return out;
}
function gauss(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
    if (Math.abs(M[p][i]) < 1e-14) return null;
    [M[i], M[p]] = [M[p], M[i]];
    for (let k = i + 1; k < n; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
  return x;
}

/**
 * Two-shot framing: camera behind `a` (at `back` along -u, `lat` along w,
 * height `hgt`), heading `yaw` off the axis and `pitch` up/down. Fits
 * (back, lat, yaw, pitch) so a's chest lands on tA, b's chest on tB and a's
 * apparent height is sizeA (fractions of the frame), by weight.
 */
function solveTwoShot(a, b, { tA, tB, sizeA, hA, hgt, fov, aspect, wts = [1, 0.6, 1, 1, 0.9], init = [3, 1.8, -0.3, -0.1] }) {
  const u = new THREE.Vector3().subVectors(b, a).setY(0);
  if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
  u.normalize();
  const w = new THREE.Vector3(-u.z, 0, u.x);
  const tanHalf = Math.tan((fov * Math.PI) / 360);
  const C = new THREE.Vector3(), f = new THREE.Vector3(), pa = {}, pb = {};
  const cam = (t) => {
    C.set(a.x, 0, a.z).addScaledVector(u, -t[0]).addScaledVector(w, t[1]);
    C.y = hgt;
    const cy = Math.cos(t[2]), sy = Math.sin(t[2]), cp = Math.cos(t[3]);
    f.set((u.x * cy + w.x * sy) * cp, Math.sin(t[3]), (u.z * cy + w.z * sy) * cp).normalize();
  };
  const res = (t) => {
    cam(t);
    projectFrac(a, C, f, tanHalf, aspect, pa);
    projectFrac(b, C, f, tanHalf, aspect, pb);
    const app = hA / (pa.z * 2 * tanHalf);
    return [
      (pa.x - tA[0]) * wts[0], (pa.y - tA[1]) * wts[1], (pb.x - tB[0]) * wts[2], (pb.y - tB[1]) * wts[3],
      (app - sizeA) * wts[4], Math.max(0, 1.1 - t[0]) * 2, Math.max(0, pa.z < 0.5 ? 1 : 0),
    ];
  };
  const cost = (F) => F.reduce((s, v) => s + v * v, 0);
  let th = init.slice(), F = res(th), c = cost(F), lam = 1e-3;
  for (let it = 0; it < 50 && c > 1e-10; it++) {
    const J = [];
    for (let j = 0; j < 4; j++) { const t2 = th.slice(); t2[j] += 1e-4; const F2 = res(t2); J.push(F2.map((v, i) => (v - F[i]) / 1e-4)); }
    const m = F.length;
    const A = [0, 1, 2, 3].map((p) => [0, 1, 2, 3].map((q) => { let s = 0; for (let i = 0; i < m; i++) s += J[p][i] * J[q][i]; return s + (p === q ? lam * (1 + s) : 0); }));
    const g = [0, 1, 2, 3].map((p) => { let s = 0; for (let i = 0; i < m; i++) s -= J[p][i] * F[i]; return s; });
    const dx = gauss(A, g);
    if (!dx) break;
    const t2 = th.map((v, j) => v + dx[j]);
    t2[0] = clamp(t2[0], 0.6, 30); t2[1] = clamp(t2[1], -4, 18); t2[2] = clamp(t2[2], -1.2, 1.2); t2[3] = clamp(t2[3], -0.8, 0.5);
    const F2 = res(t2), c2 = cost(F2);
    if (c2 < c) { th = t2; F = F2; c = c2; lam *= 0.3; } else lam *= 4;
  }
  cam(th);
  return { pos: C.clone(), look: C.clone().addScaledVector(f, 10), cost: c, th };
}

export function createCameraDirector({ getFocus } = {}) {
  const aspect0 = (typeof window !== 'undefined' && window.innerHeight) ? window.innerWidth / window.innerHeight : 16 / 9;
  const camera = new THREE.PerspectiveCamera(32, aspect0, 0.1, 400);
  camera.position.set(-2, 3, 12);
  camera.lookAt(0, 1, 0);

  const state = { pos: camera.position.clone(), look: new THREE.Vector3(0, 1, 0), fov: 32, lambdaPos: 5, lambdaLook: 6, lambdaFov: 6 };
  const desired = { pos: state.pos.clone(), look: state.look.clone(), fov: 32 };
  let orbit = null; // { center, radius, height, speed, angle0, t }
  let dolly = null; // { from, to, t, dur } slow push applied to desired.pos
  let driftT = Math.random() * 1000;
  let shakeMag = 0, shakeDur = 0, shakeT = 0;
  let restCounter = 0;
  let restCache = null; // solved rest framings, keyed by the combatants' layout

  const offShake = bus.on('cam:shake', ({ intensity = 0.5, dur = 0.3 } = {}) => {
    if (intensity >= shakeMag * (1 - clamp01(shakeT / Math.max(0.001, shakeDur)))) {
      shakeMag = intensity; shakeDur = dur; shakeT = 0;
    }
  });

  // ---- focus helpers --------------------------------------------------
  function info(side) {
    const f = getFocus?.(side);
    const p = f ? new THREE.Vector3(f.x, f.y, f.z) : new THREE.Vector3(side === 'e' ? 4.5 : -4.5, 0.55, 0);
    const r = Number.isFinite(f?.radius) && f.radius > 0.05 ? f.radius : 0.6;
    const h = Number.isFinite(f?.height) && f.height > 0.05 ? f.height : Math.max(0.4, p.y / 0.55);
    return { p, r, h, foot: new THREE.Vector3(p.x, 0, p.z) };
  }
  function frame() {
    const P = info('p'), E = info('e');
    const u = new THREE.Vector3().subVectors(E.foot, P.foot);
    const D = Math.max(1, u.length());
    u.divideScalar(D);
    const w = new THREE.Vector3(-u.z, 0, u.x); // screen-right when looking along u
    return { P, E, u, w, D, mid: new THREE.Vector3().lerpVectors(P.foot, E.foot, 0.5) };
  }

  function setDesired(pos, look, fov = 32, { lambdaPos = 5, lambdaLook = 6 } = {}) {
    desired.pos.copy(pos); desired.look.copy(look); desired.fov = fov;
    state.lambdaPos = lambdaPos; state.lambdaLook = lambdaLook;
    orbit = null; dolly = null;
  }

  /** Single-subject 3/4 framing on `side`, from the camera's side of the line. */
  function threeQuarter(side, { dist = 1, heightK = 0.72, front = 0.78, lateral = 0.62, upAim = 0.12, fov = 30, lambda = 8, aim = 0 } = {}) {
    const { P, E, u, w } = frame();
    const S = side === 'p' ? P : E;
    const toward = side === 'p' ? u : u.clone().negate(); // the direction the subject faces
    const d = Math.max(2.9, S.h * 3.2, S.r * 3.5) * dist;
    const pos = S.foot.clone()
      .addScaledVector(toward, front * d)
      .addScaledVector(w, lateral * d);
    pos.y = Math.max(0.45, S.h * heightK);
    const look = S.p.clone().add(new THREE.Vector3(0, S.h * upAim, 0));
    if (aim) { // shift the subject off-center: aim > 0 puts it left of frame
      const right = new THREE.Vector3().subVectors(look, pos).cross(UP).normalize();
      look.addScaledVector(right, aim * d);
    }
    setDesired(pos, look, fov, { lambdaPos: lambda, lambdaLook: lambda });
  }

  // ---- resting two-shots (solved) -----------------------------------------
  function restFraming(variant) {
    const { P, E } = frame();
    const key = `${variant}|${P.p.x.toFixed(2)},${P.p.z.toFixed(2)},${P.h.toFixed(2)}|${E.p.x.toFixed(2)},${E.p.z.toFixed(2)},${E.h.toFixed(2)}|${camera.aspect.toFixed(3)}`;
    if (restCache?.key === key) return restCache.value;
    const sizeA = clamp(0.3 * Math.pow(P.h / 0.5, 0.35), 0.24, 0.56);
    const big = clamp01((E.h - 1.1) / 1.8); // big foes step left/up, clear of the player plate
    const V = [
      { tA: [0.3, 0.6 + (sizeA - 0.3) * 0.4], tB: [0.645 - 0.05 * big, 0.43 - 0.05 * big], sizeA, hgt: 0.5 + P.h * 0.85, fov: 30 },
      { tA: [0.27, 0.64 + (sizeA - 0.3) * 0.4], tB: [0.62 - 0.04 * big, 0.4 - 0.05 * big], sizeA: sizeA * 1.12, hgt: 0.32 + P.h * 0.62, fov: 33 },
      { tA: [0.33, 0.57], tB: [0.66 - 0.05 * big, 0.47 - 0.05 * big], sizeA: sizeA * 0.72, hgt: 1.1 + Math.max(P.h, E.h) * 0.9, fov: 31 },
    ][variant];
    const sol = solveTwoShot(P.p, E.p, { ...V, hA: P.h, aspect: camera.aspect || 16 / 9 });
    const value = { pos: sol.pos, look: sol.look, fov: V.fov };
    restCache = { key, value };
    return value;
  }

  const SHOTS = {
    // Establishing: a slow side-on push across the whole stage.
    wide() {
      const { u, w, D, mid } = frame();
      const dist = D * 1.35 + 9;
      const from = mid.clone().addScaledVector(w, dist).addScaledVector(u, -dist * 0.18);
      from.y = 3.4 + D * 0.12;
      const to = mid.clone().addScaledVector(w, dist * 0.82).addScaledVector(u, -dist * 0.1);
      to.y = 2.6 + D * 0.1;
      setDesired(from, mid.clone().add(new THREE.Vector3(0, 0.9, 0)), 36, { lambdaPos: 2.4, lambdaLook: 2.6 });
      dolly = { from, to, t: 0, dur: 3.2 };
    },
    overShoulderP() { const v = restFraming(0); setDesired(v.pos, v.look, v.fov, { lambdaPos: 4.2, lambdaLook: 5 }); },
    overShoulderE() { threeQuarter('p', { dist: 1.25, heightK: 0.8, lateral: 0.5, fov: 30, lambda: 4.5 }); },
    // Idle/rest framing cycles three solved two-shots by turn index.
    // While the player chooses, the view breathes: a slow push-in (~4%).
    rest(opts = {}) {
      const variant = Math.abs((opts.variant ?? restCounter++) | 0) % 3;
      const v = restFraming(variant);
      setDesired(v.pos, v.look, v.fov, { lambdaPos: 3.3, lambdaLook: 3.6 });
      dolly = { from: v.pos.clone(), to: v.pos.clone().lerp(v.look, 0.04), t: 0, dur: 8 };
    },
    // Impact framing on `side` (the one being hit): 3/4 front from the
    // camera's side of the line, so the reaction reads on its face.
    // opts.melee: the attacker is in contact, so swing wide to a near-profile
    // angle that shows both heads instead of the attacker's back.
    closeUp(opts = {}) {
      if (opts.melee) threeQuarter(opts.side ?? 'e', { dist: 1.05, heightK: 0.72, front: 0.3, lateral: 0.95, upAim: 0.08, fov: 32, lambda: 9.5 });
      else threeQuarter(opts.side ?? 'e', { dist: 1.0, heightK: 0.74, front: 0.8, lateral: 0.62, upAim: 0.08, fov: 30, lambda: 9.5 });
    },
    lowBeam() {
      const { P, u, w, D } = frame();
      const pos = P.foot.clone().addScaledVector(u, -Math.max(1.6, P.r * 2.2)).addScaledVector(w, 1.4 + P.r);
      pos.y = Math.max(0.35, P.h * 0.45);
      const look = P.foot.clone().addScaledVector(u, D * 0.8).add(new THREE.Vector3(0, 0.8, 0));
      setDesired(pos, look, 40, { lambdaPos: 8, lambdaLook: 8 });
    },
    orbitKO(opts = {}) {
      const S = info(opts.side ?? 'e');
      orbit = { center: S.p.clone(), radius: opts.radius ?? Math.max(3.1, S.r * 3.4), height: opts.height ?? Math.max(1.2, S.h * 0.9), speed: opts.speed ?? 0.42, angle0: opts.startAngle ?? 0.9, t: 0 };
      state.lambdaPos = 5; state.lambdaLook = 6.5; desired.fov = opts.fov ?? 30;
      dolly = null;
    },
    // Charge-up: low heroic 3/4 on the user, looking up at it.
    burstCharge(opts = {}) {
      threeQuarter(opts.side ?? 'p', { dist: 0.95, heightK: 0.38, front: 0.85, lateral: 0.5, upAim: 0.3, fov: 32, lambda: 6.5 });
    },
    sendIn(opts = {}) {
      threeQuarter(opts.side ?? 'p', { dist: 1.2, heightK: 0.62, front: 0.82, lateral: 0.58, upAim: 0.05, fov: 31, lambda: 5 });
    },
    catchFocus(opts = {}) {
      // opts.push: world units to creep in (escalating tension per shake)
      const { E, u, w } = frame();
      const base = Math.max(3.4, E.r * 3.2);
      const d = Math.max(1.4, base - (opts.push ?? 0));
      const pos = E.foot.clone().addScaledVector(u, -d * 0.62).addScaledVector(w, d * 0.78);
      pos.y = 1.05;
      setDesired(pos, E.foot.clone().add(new THREE.Vector3(0, 0.45, 0)), 28, { lambdaPos: 3.4, lambdaLook: 4 });
    },
    // The winner, low and heroic against the sky.
    // The winner, low and heroic against the sky — standing in the left
    // third so the centered victory panel never covers it.
    victory(opts = {}) {
      threeQuarter(opts.side ?? 'p', { dist: 1.25, heightK: 0.45, front: 0.85, lateral: 0.55, upAim: 0.2, fov: 32, lambda: 2.6, aim: 0.32 });
    },
    defeat() {
      const { P, u, w } = frame();
      const pos = P.foot.clone().addScaledVector(u, -2.2 - P.r).addScaledVector(w, 1.6);
      pos.y = 2.8 + P.h;
      setDesired(pos, P.p.clone(), 36, { lambdaPos: 2, lambdaLook: 2.4 });
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
    } else if (dolly) {
      dolly.t = Math.min(dolly.dur, dolly.t + dt);
      const k = dolly.t / dolly.dur;
      desired.pos.lerpVectors(dolly.from, dolly.to, k * k * (3 - 2 * k));
    }
    state.pos.x = damp(state.pos.x, desired.pos.x, state.lambdaPos, dt);
    state.pos.y = damp(state.pos.y, desired.pos.y, state.lambdaPos, dt);
    state.pos.z = damp(state.pos.z, desired.pos.z, state.lambdaPos, dt);
    state.look.x = damp(state.look.x, desired.look.x, state.lambdaLook, dt);
    state.look.y = damp(state.look.y, desired.look.y, state.lambdaLook, dt);
    state.look.z = damp(state.look.z, desired.look.z, state.lambdaLook, dt);
    state.fov = damp(state.fov, desired.fov, state.lambdaFov, dt);

    const driftX = Math.sin(driftT * 0.31) * 0.04 + Math.sin(driftT * 0.71 + 1.3) * 0.018;
    const driftY = Math.sin(driftT * 0.23 + 2.1) * 0.025;

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

    camera.position.set(state.pos.x + driftX + sx, Math.max(0.2, state.pos.y + driftY + sy), state.pos.z + sz);
    camera.up.copy(UP);
    camera.lookAt(state.look.x, state.look.y, state.look.z);
    if (roll) camera.rotateZ(roll);
    if (Math.abs(camera.fov - state.fov) > 0.01) { camera.fov = state.fov; camera.updateProjectionMatrix(); }
  }

  function dispose() { offShake(); }

  return { camera, update, shot, impulse, dispose };
}
