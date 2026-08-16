// Central tween/timer ticker. Game loop calls tick(dt) once per frame.
import { clamp01, lerp, easeOutCubic } from './math.js';
import { bus } from './events.js';
import { settings } from './settings.js';

const active = new Set();

// Global time scale for the tween/timer clock — drives real hitstop: battle
// presentation dips this toward ~0.05 on impact frames so every tween/delay
// (choreography, UI bars, knockback) freezes together, then ramps back to 1.
// The game loop keeps passing REAL dt into tick(); scaling happens inside.
// battle/battleFlow.js guarantees restoration to 1 when a battle ends.
let timeScale = 1;
export function setTimeScale(s) { timeScale = Number.isFinite(s) ? Math.max(0, s) : 1; }
export function getTimeScale() { return timeScale; }

export function tween({ from = 0, to = 1, dur = 0.3, ease = easeOutCubic, onUpdate, onDone, delay = 0 }) {
  return new Promise((resolve) => {
    const tw = { t: -delay, dur, from, to, ease, onUpdate, onDone, resolve, cancelled: false };
    active.add(tw);
  });
}

export function delay(sec) {
  return new Promise((resolve) => active.add({ t: 0, dur: sec, from: 0, to: 1, ease: (x) => x, onUpdate: null, onDone: null, resolve }));
}

export function cancelAllTweens() { active.clear(); }

export function tick(dt) {
  const sdt = dt * timeScale;
  for (const tw of [...active]) {
    tw.t += sdt;
    if (tw.t < 0) continue;
    const p = clamp01(tw.dur <= 0 ? 1 : tw.t / tw.dur);
    const v = lerp(tw.from, tw.to, tw.ease(p));
    try { tw.onUpdate?.(v, p); } catch (e) { console.error(e); }
    if (p >= 1) {
      active.delete(tw);
      try { tw.onDone?.(); } catch (e) { console.error(e); }
      tw.resolve?.();
    }
  }
}

// Screen shake helper — presentation layers listen for cam:shake.
export function shake(intensity = 0.5, dur = 0.3) {
  if (!settings.camShake) intensity *= 0.25;
  bus.emit('cam:shake', { intensity, dur });
}
