// sfx.js — one-shot sound effects (every id in the CONTRACTS_ADDENDUM SFX
// list) and the looping per-biome ambient beds. Everything here is a small,
// purpose-built synthesis recipe: noise bursts, tone/FM hits and filter
// sweeps composed to *mean* the thing they represent (a fire crackle is not
// the same recipe as a water splash). audio.js owns the AudioContext and the
// sfx mix bus; this module only asks for them lazily.
import { getCtx, getSfxRoutes, getNoiseBuffer, whenReady } from './audio.js';

// ---------------------------------------------------------------------------
// Small synthesis primitives
// ---------------------------------------------------------------------------
function env(ctx, t0, { a = 0.005, d = 0.08, s = 0, r = 0.08, dur = 0.08, peak = 1 } = {}) {
  const g = ctx.createGain();
  const att = Math.max(0.002, a);
  const sustEnd = Math.max(t0 + att + d, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + att);
  g.gain.linearRampToValueAtTime(Math.max(0.0001, peak * s), t0 + att + d);
  g.gain.setValueAtTime(Math.max(0.0001, peak * s), sustEnd);
  g.gain.linearRampToValueAtTime(0.0001, sustEnd + r);
  return { node: g, endTime: sustEnd + r };
}

/** Dry+verb send bus for a single one-shot. */
function mix(ctx, routes, dry = 0.9, wet = 0.25) {
  const g = ctx.createGain();
  const dg = ctx.createGain(); dg.gain.value = dry;
  g.connect(dg); dg.connect(routes.input);
  if (wet > 0) { const wg = ctx.createGain(); wg.gain.value = wet; g.connect(wg); wg.connect(routes.verb); }
  return g;
}

function tone(ctx, dest, { type = 'sine', freq = 440, freqEnd = null, t = 0, dur = 0.15, a = 0.004, d = 0.08, s = 0, r = 0.08, peak = 0.5, detune = 0 } = {}) {
  const osc = ctx.createOscillator(); osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, freq), t);
  if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
  if (detune) osc.detune.value = detune;
  const { node, endTime } = env(ctx, t, { a, d, s, r, dur, peak });
  osc.connect(node); node.connect(dest);
  osc.start(t); osc.stop(endTime + 0.05);
  return endTime;
}

function noiseBurst(ctx, dest, noiseBuf, { t = 0, dur = 0.15, filter = 'bandpass', freq = 1200, freqEnd = null, Q = 1, a = 0.002, d = 0.1, s = 0, r = 0.1, peak = 0.5 } = {}) {
  if (!noiseBuf) return t + dur;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const off = Math.random() * Math.max(0.05, noiseBuf.duration - dur - 0.2);
  const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(Math.max(20, freq), t); f.Q.value = Q;
  if (freqEnd != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t + dur);
  const { node, endTime } = env(ctx, t, { a, d, s, r, dur, peak });
  src.connect(f); f.connect(node); node.connect(dest);
  src.start(t, off, dur + r + 0.2);
  src.stop(endTime + 0.05);
  return endTime;
}

function fmTink(ctx, dest, { t = 0, freq = 1200, ratio = 3.2, index = 600, dur = 0.25, peak = 0.4 } = {}) {
  const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.setValueAtTime(freq, t);
  const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.setValueAtTime(freq * ratio, t);
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(index, t);
  mg.gain.exponentialRampToValueAtTime(2, t + dur * 0.8 + 0.05);
  mod.connect(mg); mg.connect(car.frequency);
  const { node, endTime } = env(ctx, t, { a: 0.002, d: dur * 0.7, s: 0.0001, r: dur * 0.3 + 0.05, dur: Math.min(dur, 0.03), peak });
  car.connect(node); node.connect(dest);
  car.start(t); car.stop(endTime + 0.05);
  mod.start(t); mod.stop(endTime + 0.05);
  return endTime;
}

/** A tone whose amplitude rises through its whole duration then cuts hard — Umbra's "inverse swell". */
function reverseSwell(ctx, dest, { t = 0, dur = 0.55, freq = 90, peak = 0.5 } = {}) {
  const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq, t);
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = 1.2;
  filt.frequency.setValueAtTime(90, t);
  filt.frequency.exponentialRampToValueAtTime(Math.max(220, freq * 7), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0002, t);
  g.gain.exponentialRampToValueAtTime(peak, t + dur);
  g.gain.setValueAtTime(peak, t + dur);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.045);
  osc.connect(filt); filt.connect(g); g.connect(dest);
  osc.start(t); osc.stop(t + dur + 0.07);
  return t + dur + 0.07;
}

function pitchJit(base, pct = 0.03) { return base * (1 + (Math.random() * 2 - 1) * pct); }

// ---------------------------------------------------------------------------
// Motif-derived frequencies for fanfares (Lumen motif: G4 A4 C5 E5 D5 G5)
// ---------------------------------------------------------------------------
const MOTIF = [392.0, 440.0, 523.25, 659.25, 587.33, 783.99]; // G4 A4 C5 E5 D5 G5

// ---------------------------------------------------------------------------
// Footsteps — surfaces: grass, stone, wood, sand, snow, water
// ---------------------------------------------------------------------------
function synthFootstep(ctx, dest, surface, t, noiseBuf) {
  const p = pitchJit(1, 0.07);
  switch (surface) {
    case 'stone':
      noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.045, filter: 'highpass', freq: 1900 * p, Q: 0.9, a: 0.001, d: 0.03, r: 0.03, peak: 0.34 });
      break;
    case 'wood':
      noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.05, filter: 'bandpass', freq: 900 * p, Q: 2.2, a: 0.001, d: 0.04, r: 0.04, peak: 0.28 });
      tone(ctx, dest, { type: 'triangle', freq: 180 * p, t, dur: 0.06, a: 0.001, d: 0.05, r: 0.04, peak: 0.2 });
      break;
    case 'sand':
      noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.15, filter: 'lowpass', freq: 1300 * p, Q: 0.5, a: 0.012, d: 0.09, r: 0.09, peak: 0.24 });
      break;
    case 'snow':
      noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.09, filter: 'bandpass', freq: 2600 * p, freqEnd: 1100 * p, Q: 1.4, a: 0.002, d: 0.05, r: 0.06, peak: 0.28 });
      break;
    case 'water':
      fmTink(ctx, dest, { t, freq: 1400 * p, ratio: 2.4, index: 280, dur: 0.12, peak: 0.22 });
      noiseBurst(ctx, dest, noiseBuf, { t: t + 0.02, dur: 0.12, filter: 'bandpass', freq: 950 * p, Q: 0.9, a: 0.004, d: 0.08, r: 0.08, peak: 0.22 });
      break;
    case 'grass':
    default:
      noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.1, filter: 'lowpass', freq: 850 * p, Q: 0.6, a: 0.004, d: 0.07, r: 0.06, peak: 0.26 });
      noiseBurst(ctx, dest, noiseBuf, { t: t + 0.012, dur: 0.06, filter: 'highpass', freq: 2100 * p, Q: 0.7, a: 0.002, d: 0.04, r: 0.03, peak: 0.07 });
      break;
  }
}

// ---------------------------------------------------------------------------
// Recipes — one entry per pinned SFX id. fn(ctx, routes, t, noiseBuf).
// ---------------------------------------------------------------------------
function uiTick({ f0, f1 = null, dur = 0.06, peak = 0.3, type = 'triangle' } = {}) {
  return (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.9, 0.08);
    tone(ctx, dest, { type, freq: pitchJit(f0, 0.02), freqEnd: f1 != null ? pitchJit(f1, 0.02) : null, t, dur, a: 0.002, d: dur * 0.6, r: dur * 0.5, peak });
  };
}

function hitRecipe({ light = true } = {}) {
  return (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.9, light ? 0.16 : 0.28);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: light ? 0.06 : 0.1, filter: 'bandpass', freq: light ? 2200 : 1100, Q: 0.9, a: 0.001, d: 0.05, r: 0.05, peak: light ? 0.4 : 0.55 });
    tone(ctx, dest, { type: 'sine', freq: light ? 260 : 130, freqEnd: light ? 90 : 45, t, dur: light ? 0.1 : 0.22, a: 0.001, d: 0.06, r: light ? 0.08 : 0.16, peak: light ? 0.35 : 0.6 });
  };
}

const RECIPES = {
  // ---- UI ticks: soft filtered blips, pitch differentiates intent
  ui_move: uiTick({ f0: 660, dur: 0.045, peak: 0.22 }),
  ui_confirm: uiTick({ f0: 700, f1: 1040, dur: 0.09, peak: 0.32 }),
  ui_cancel: uiTick({ f0: 700, f1: 480, dur: 0.08, peak: 0.28 }),
  ui_open: uiTick({ f0: 520, f1: 900, dur: 0.14, peak: 0.3 }),
  ui_close: uiTick({ f0: 620, f1: 380, dur: 0.09, peak: 0.22 }),

  // ---- impacts
  hit_light: hitRecipe({ light: true }),
  hit_heavy: hitRecipe({ light: false }),
  slash: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.9, 0.2);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.1, filter: 'bandpass', freq: 3200, freqEnd: 900, Q: 2.4, a: 0.001, d: 0.06, r: 0.05, peak: 0.4 });
  },
  // organic whip-crack + leaf-flutter — the dedicated bloom-aspect hit
  bloom: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.9, 0.2);
    // vine whip: fast band sweep down, softer/rounder than the metallic slash
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.07, filter: 'bandpass', freq: 2600, freqEnd: 700, Q: 1.8, a: 0.001, d: 0.05, r: 0.04, peak: 0.38 });
    // two quick leaf-cut flutters trailing the crack
    noiseBurst(ctx, dest, noiseBuf, { t: t + 0.05, dur: 0.09, filter: 'bandpass', freq: 1500, Q: 1.1, a: 0.004, d: 0.06, r: 0.06, peak: 0.16 });
    noiseBurst(ctx, dest, noiseBuf, { t: t + 0.11, dur: 0.08, filter: 'bandpass', freq: 1100, Q: 1.2, a: 0.004, d: 0.05, r: 0.06, peak: 0.12 });
    // green sap body underneath
    tone(ctx, dest, { type: 'triangle', freq: 320, freqEnd: 180, t: t + 0.01, dur: 0.14, a: 0.004, d: 0.09, r: 0.08, peak: 0.2 });
  },

  // ---- aspect-flavored hits
  fire_small: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.9, 0.2);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.09, filter: 'highpass', freq: 2600, Q: 0.9, a: 0.001, d: 0.06, r: 0.05, peak: 0.3 });
    tone(ctx, dest, { type: 'sawtooth', freq: 190, freqEnd: 110, t, dur: 0.16, a: 0.003, d: 0.1, r: 0.08, peak: 0.28 });
  },
  fire_big: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.9, 0.28);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.16, filter: 'highpass', freq: 2200, Q: 0.8, a: 0.002, d: 0.1, r: 0.1, peak: 0.42 });
    noiseBurst(ctx, dest, noiseBuf, { t: t + 0.05, dur: 0.14, filter: 'highpass', freq: 3000, Q: 0.9, a: 0.002, d: 0.08, r: 0.1, peak: 0.28 });
    tone(ctx, dest, { type: 'sawtooth', freq: 130, freqEnd: 60, t, dur: 0.3, a: 0.004, d: 0.18, r: 0.16, peak: 0.42 });
  },
  water: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.9, 0.22);
    fmTink(ctx, dest, { t, freq: 1900, ratio: 2.1, index: 400, dur: 0.14, peak: 0.28 });
    noiseBurst(ctx, dest, noiseBuf, { t: t + 0.03, dur: 0.18, filter: 'bandpass', freq: 850, Q: 0.8, a: 0.006, d: 0.1, r: 0.12, peak: 0.3 });
  },
  thunder: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.85, 0.42);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.06, filter: 'highpass', freq: 3500, Q: 0.7, a: 0.0005, d: 0.02, r: 0.05, peak: 0.55 });
    noiseBurst(ctx, dest, noiseBuf, { t: t + 0.05, dur: 1.1, filter: 'lowpass', freq: 260, freqEnd: 70, Q: 0.7, a: 0.02, d: 0.5, r: 0.6, peak: 0.5 });
    tone(ctx, dest, { type: 'sine', freq: 55, t: t + 0.05, dur: 0.9, a: 0.03, d: 0.4, r: 0.5, peak: 0.4 });
  },
  wind: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.85, 0.3);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.6, filter: 'bandpass', freq: 500, freqEnd: 1200, Q: 0.9, a: 0.08, d: 0.25, r: 0.3, peak: 0.3 });
  },
  earth: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.9, 0.2);
    tone(ctx, dest, { type: 'sine', freq: 100, freqEnd: 45, t, dur: 0.24, a: 0.002, d: 0.14, r: 0.14, peak: 0.55 });
    noiseBurst(ctx, dest, noiseBuf, { t: t + 0.02, dur: 0.14, filter: 'lowpass', freq: 700, Q: 0.6, a: 0.005, d: 0.1, r: 0.08, peak: 0.3 });
    noiseBurst(ctx, dest, noiseBuf, { t: t + 0.09, dur: 0.08, filter: 'highpass', freq: 2200, Q: 0.8, a: 0.001, d: 0.05, r: 0.04, peak: 0.12 });
  },
  ice: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.9, 0.3);
    [1, 1.5, 2.3].forEach((m, i) => fmTink(ctx, dest, { t: t + i * 0.045, freq: 2000 * m, ratio: 4.2, index: 800, dur: 0.2, peak: 0.26 }));
  },
  venom: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.9, 0.24);
    tone(ctx, dest, { type: 'triangle', freq: 220, freqEnd: 340, t, dur: 0.14, a: 0.01, d: 0.08, r: 0.1, peak: 0.24 });
    tone(ctx, dest, { type: 'triangle', freq: 300, freqEnd: 180, t: t + 0.14, dur: 0.16, a: 0.01, d: 0.08, r: 0.12, peak: 0.2 });
  },
  light: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.85, 0.34);
    [0, 1, 2, 3].forEach((i) => fmTink(ctx, dest, { t: t + i * 0.055, freq: 900 * Math.pow(1.26, i), ratio: 3, index: 500, dur: 0.22, peak: 0.3 }));
  },
  dark: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.85, 0.4);
    reverseSwell(ctx, dest, { t, dur: 0.5, freq: 70, peak: 0.42 });
  },

  // ---- status / support
  heal: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.88, 0.3);
    [523.25, 659.25, 783.99].forEach((f, i) => tone(ctx, dest, { type: 'sine', freq: f, t: t + i * 0.07, dur: 0.28, a: 0.02, d: 0.14, r: 0.18, peak: 0.3 }));
  },
  buff: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.88, 0.26);
    [1, 1.26, 1.5, 2].forEach((m, i) => fmTink(ctx, dest, { t: t + i * 0.04, freq: 700 * m, ratio: 2.6, index: 350, dur: 0.16, peak: 0.24 }));
  },
  debuff: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.88, 0.22);
    tone(ctx, dest, { type: 'square', freq: 320, freqEnd: 140, t, dur: 0.24, a: 0.004, d: 0.12, r: 0.12, peak: 0.16 });
  },
  song: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.86, 0.3);
    [659.25, 783.99, 880].forEach((f, i) => tone(ctx, dest, { type: 'sine', freq: f, t: t + i * 0.16, dur: 0.3, a: 0.04, d: 0.14, r: 0.2, peak: 0.26 }));
  },
  faint: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.88, 0.32);
    tone(ctx, dest, { type: 'triangle', freq: 300, freqEnd: 70, t, dur: 0.7, a: 0.01, d: 0.4, r: 0.35, peak: 0.32 });
  },

  // ---- catch sequence
  catch_throw: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.9, 0.18);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.3, filter: 'bandpass', freq: 700, freqEnd: 2200, Q: 1, a: 0.02, d: 0.15, r: 0.14, peak: 0.32 });
  },
  catch_shake: (ctx, routes, t, noiseBuf) => {
    // deliberately dry and tiny — the tension lives in the silence around it.
    const dest = mix(ctx, routes, 0.95, 0.02);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.02, filter: 'highpass', freq: 2600, Q: 1.2, a: 0.0005, d: 0.012, r: 0.012, peak: 0.22 });
  },
  catch_success: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.85, 0.36);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, dest, { type: 'sine', freq: f, t: t + i * 0.09, dur: 0.35, a: 0.015, d: 0.16, r: 0.22, peak: 0.32 }));
    [0, 1, 2].forEach((i) => fmTink(ctx, dest, { t: t + 0.28 + i * 0.05, freq: 1600 * Math.pow(1.2, i), ratio: 3.4, index: 500, dur: 0.18, peak: 0.2 }));
  },
  catch_fail: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.9, 0.2);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.16, filter: 'bandpass', freq: 1400, freqEnd: 500, Q: 1, a: 0.002, d: 0.1, r: 0.1, peak: 0.32 });
    tone(ctx, dest, { type: 'square', freq: 260, freqEnd: 130, t: t + 0.03, dur: 0.2, a: 0.004, d: 0.1, r: 0.12, peak: 0.18 });
  },

  // ---- fanfares built from the Lumen motif's intervals
  levelup: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.85, 0.28);
    [0, 1, 2].forEach((i) => tone(ctx, dest, { type: 'triangle', freq: MOTIF[i], t: t + i * 0.075, dur: 0.2, a: 0.004, d: 0.1, r: 0.12, peak: 0.32 }));
  },
  awaken: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.82, 0.36);
    MOTIF.forEach((f, i) => fmTink(ctx, dest, { t: t + i * 0.09, freq: f * 2, ratio: 2.8, index: 500, dur: 0.28, peak: 0.32 }));
  },
  sigil: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.8, 0.4);
    [MOTIF[5], MOTIF[4], MOTIF[0]].forEach((f, i) => tone(ctx, dest, { type: 'sine', freq: f, t: t + i * 0.22, dur: 0.5, a: 0.02, d: 0.24, r: 0.32, peak: 0.3 }));
  },
  chest: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.9, 0.22);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.22, filter: 'bandpass', freq: 350, freqEnd: 550, Q: 3, a: 0.02, d: 0.14, r: 0.1, peak: 0.24 });
    tone(ctx, dest, { type: 'sine', freq: 880, t: t + 0.18, dur: 0.25, a: 0.01, d: 0.14, r: 0.16, peak: 0.26 });
  },
  item_get: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.88, 0.24);
    tone(ctx, dest, { type: 'triangle', freq: 700, freqEnd: 1200, t, dur: 0.1, a: 0.002, d: 0.06, r: 0.06, peak: 0.32 });
    fmTink(ctx, dest, { t: t + 0.06, freq: 1600, ratio: 3.1, index: 400, dur: 0.16, peak: 0.2 });
  },
  glim: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.88, 0.22);
    fmTink(ctx, dest, { t, freq: 2400, ratio: 4, index: 500, dur: 0.12, peak: 0.22 });
    fmTink(ctx, dest, { t: t + 0.06, freq: 2600, ratio: 4, index: 500, dur: 0.12, peak: 0.18 });
  },
  quest_done: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.85, 0.28);
    [523.25, 659.25, 783.99].forEach((f, i) => tone(ctx, dest, { type: 'triangle', freq: f, t: t + i * 0.1, dur: 0.22, a: 0.005, d: 0.1, r: 0.14, peak: 0.3 }));
  },
  flee: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.9, 0.16);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.18, filter: 'bandpass', freq: 1800, freqEnd: 300, Q: 1, a: 0.001, d: 0.1, r: 0.08, peak: 0.3 });
  },
  // wild-encounter alert: a grass rustle under a short tension riser
  encounter: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.9, 0.18);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.12, filter: 'bandpass', freq: 1900, freqEnd: 2600, Q: 0.8, a: 0.006, d: 0.08, r: 0.06, peak: 0.22 });
    tone(ctx, dest, { type: 'triangle', freq: 340, freqEnd: 680, t: t + 0.03, dur: 0.22, a: 0.02, d: 0.12, r: 0.1, peak: 0.26 });
    fmTink(ctx, dest, { t: t + 0.16, freq: 1500, ratio: 2.8, index: 420, dur: 0.14, peak: 0.2 });
  },
  burst_ready: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.85, 0.3);
    [0, 1, 2].forEach((i) => fmTink(ctx, dest, { t: t + i * 0.05, freq: 1200 * Math.pow(1.33, i), ratio: 2.2, index: 700, dur: 0.2, peak: 0.28 }));
  },
  burst_fire: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.85, 0.34);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.2, filter: 'bandpass', freq: 1000, Q: 0.7, a: 0.001, d: 0.1, r: 0.12, peak: 0.55 });
    tone(ctx, dest, { type: 'sawtooth', freq: 160, freqEnd: 50, t, dur: 0.36, a: 0.002, d: 0.2, r: 0.2, peak: 0.5 });
    fmTink(ctx, dest, { t: t + 0.05, freq: 1800, ratio: 3, index: 900, dur: 0.3, peak: 0.3 });
  },

  // ---- footsteps (also reachable directly via play('step_...'))
  step_grass: (ctx, routes, t, noiseBuf) => synthFootstep(ctx, mix(ctx, routes, 0.92, 0.1), 'grass', t, noiseBuf),
  step_stone: (ctx, routes, t, noiseBuf) => synthFootstep(ctx, mix(ctx, routes, 0.92, 0.14), 'stone', t, noiseBuf),
  step_wood: (ctx, routes, t, noiseBuf) => synthFootstep(ctx, mix(ctx, routes, 0.92, 0.12), 'wood', t, noiseBuf),
  step_sand: (ctx, routes, t, noiseBuf) => synthFootstep(ctx, mix(ctx, routes, 0.92, 0.08), 'sand', t, noiseBuf),
  step_snow: (ctx, routes, t, noiseBuf) => synthFootstep(ctx, mix(ctx, routes, 0.92, 0.1), 'snow', t, noiseBuf),
  step_water: (ctx, routes, t, noiseBuf) => synthFootstep(ctx, mix(ctx, routes, 0.9, 0.16), 'water', t, noiseBuf),

  splash: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.88, 0.24);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.28, filter: 'bandpass', freq: 700, freqEnd: 250, Q: 0.8, a: 0.004, d: 0.16, r: 0.16, peak: 0.4 });
    fmTink(ctx, dest, { t: t + 0.02, freq: 1700, ratio: 2.2, index: 350, dur: 0.16, peak: 0.2 });
  },
  door: (ctx, routes, t, noiseBuf) => {
    const dest = mix(ctx, routes, 0.9, 0.2);
    noiseBurst(ctx, dest, noiseBuf, { t, dur: 0.3, filter: 'bandpass', freq: 250, freqEnd: 400, Q: 2.6, a: 0.03, d: 0.18, r: 0.12, peak: 0.24 });
    tone(ctx, dest, { type: 'sine', freq: 90, t: t + 0.24, dur: 0.16, a: 0.004, d: 0.08, r: 0.1, peak: 0.28 });
  },
  shrine_heal: (ctx, routes, t) => {
    const dest = mix(ctx, routes, 0.82, 0.42);
    tone(ctx, dest, { type: 'sine', freq: 392, freqEnd: 523.25, t, dur: 1.1, a: 0.15, d: 0.4, r: 0.5, peak: 0.3 });
    [MOTIF[0], MOTIF[2], MOTIF[3]].forEach((f, i) => fmTink(ctx, dest, { t: t + 0.15 + i * 0.16, freq: f * 1.5, ratio: 3, index: 450, dur: 0.4, peak: 0.24 }));
  },
};

// ---------------------------------------------------------------------------
// Burst aspect layering — audio.js's battle:event listener primes the burst's
// aspect on 'burstUsed'; the next burst-base one-shot ('burst_fire', or 'song'
// for song-anim bursts) then layers that aspect's own hit recipe underneath,
// so every ultimate carries its element instead of one shared whump.
// ---------------------------------------------------------------------------
const ASPECT_SFX = {
  ember: 'fire_big', tide: 'water', bloom: 'bloom', gale: 'wind', terra: 'earth',
  volt: 'thunder', frost: 'ice', venom: 'venom', lumen: 'light', umbra: 'dark',
  neutral: 'slash',
};
const BURST_ASPECT_TTL_MS = 4000;
let primedAspect = null;
let primedAt = -1e9;

/** Called (by audio.js) when a burstUsed battle event arrives. */
export function primeBurstAspect(aspect) {
  if (!ASPECT_SFX[aspect]) return;
  primedAspect = aspect;
  primedAt = Date.now();
}

function takePrimedAspect() {
  if (!primedAspect || Date.now() - primedAt > BURST_ASPECT_TTL_MS) { primedAspect = null; return null; }
  const a = primedAspect;
  primedAspect = null;
  return a;
}

/** Wrap a base recipe so it also plays the primed aspect's recipe, attenuated. */
function withAspectLayer(base, layerGain = 0.7) {
  return (ctx, routes, t, noiseBuf) => {
    base(ctx, routes, t, noiseBuf);
    const aspect = takePrimedAspect();
    const fn = aspect && RECIPES[ASPECT_SFX[aspect]];
    if (!fn) return;
    // attenuated sub-routes keep the summed peak inside mix-safety territory
    const dry = ctx.createGain(); dry.gain.value = layerGain; dry.connect(routes.input);
    const wet = ctx.createGain(); wet.gain.value = layerGain; wet.connect(routes.verb);
    fn(ctx, { input: dry, verb: wet }, t + 0.03, noiseBuf);
  };
}
RECIPES.burst_fire = withAspectLayer(RECIPES.burst_fire, 0.7);
RECIPES.song = withAspectLayer(RECIPES.song, 0.55);

// per-name minimum gap so a lag spike or double bus-emit can't stack a dozen
// copies of the same one-shot in a single frame.
const MIN_GAP = { catch_shake: 0.05 };
const DEFAULT_GAP = 0.02;
const lastPlayed = new Map();
const warnedMissing = new Set();

export function play(name) {
  const ctx = getCtx();
  if (!ctx) return;
  const routes = getSfxRoutes();
  if (!routes) return;
  const now = ctx.currentTime;
  const gap = MIN_GAP[name] ?? DEFAULT_GAP;
  if (now - (lastPlayed.get(name) ?? -1) < gap) return;
  const fn = RECIPES[name];
  if (!fn) {
    if (!warnedMissing.has(name)) { warnedMissing.add(name); console.warn(`[sfx] unknown sfx "${name}"`); }
    return;
  }
  lastPlayed.set(name, now);
  try { fn(ctx, routes, now + 0.004, getNoiseBuffer()); }
  catch (e) { console.error(`[sfx] "${name}" failed`, e); }
}

const SURFACES = new Set(['grass', 'stone', 'wood', 'sand', 'snow', 'water']);
export function playFootstep(surface = 'grass') {
  play(`step_${SURFACES.has(surface) ? surface : 'grass'}`);
}

// ---------------------------------------------------------------------------
// Ambient beds — one continuous soundscape per biome, crossfaded on change.
// ---------------------------------------------------------------------------
function noiseBed(ctx, dest, noiseBuf, { type = 'lowpass', freq = 800, Q = 0.7, gain = 0.16, lfoRate = 0.07, lfoDepth = 200 } = {}) {
  if (!noiseBuf) return null;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q;
  const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = lfoRate;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = lfoDepth;
  lfo.connect(lfoGain); lfoGain.connect(f.frequency);
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(0, Math.random() * Math.max(0.1, noiseBuf.duration - 0.5));
  lfo.start();
  return { src, lfo, f, g };
}

function droneBed(ctx, dest, { freq = 60, gain = 0.12, lfoRate = 0.1, lfoDepth = 0.02 } = {}) {
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
  const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = freq * 0.5;
  const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = lfoRate;
  const g = ctx.createGain(); g.gain.value = gain;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = gain * lfoDepth;
  lfo.connect(lfoGain); lfoGain.connect(g.gain);
  osc.connect(g); sub.connect(g); g.connect(dest);
  osc.start(); sub.start(); lfo.start();
  return { src: osc, lfo, extra: sub, f: null, g };
}

let ambientState = null;

function teardownAmbient(state) {
  for (const s of state.sources) {
    if (!s) continue;
    try { s.src.stop(); } catch (e) { /* already stopped */ }
    try { s.lfo?.stop(); } catch (e) { /* already stopped */ }
    try { s.extra?.stop(); } catch (e) { /* already stopped */ }
  }
  for (const id of state.timers) clearTimeout(id);
}

function scheduleFlourish(state, fn, minSec, maxSec, isLive = () => ambientState === state) {
  const go = () => {
    if (!isLive()) return;
    const ctx = getCtx();
    if (ctx) { try { fn(ctx); } catch (e) { console.error('[sfx ambient]', e); } }
    state.timers.push(setTimeout(go, (minSec + Math.random() * (maxSec - minSec)) * 1000));
  };
  state.timers.push(setTimeout(go, (minSec + Math.random() * (maxSec - minSec)) * 1000));
}

const AMBIENT_BUILDERS = {
  town: (ctx, dest, noiseBuf, state) => {
    state.sources.push(noiseBed(ctx, dest, noiseBuf, { type: 'lowpass', freq: 700, Q: 0.5, gain: 0.05, lfoRate: 0.05, lfoDepth: 120 }));
    scheduleFlourish(state, (c) => fmTink(c, dest, { t: c.currentTime + 0.02, freq: 1500, ratio: 2.4, index: 260, dur: 0.4, peak: 0.05 }), 6, 14);
  },
  meadow: (ctx, dest, noiseBuf, state) => {
    state.sources.push(noiseBed(ctx, dest, noiseBuf, { type: 'bandpass', freq: 600, Q: 0.6, gain: 0.06, lfoRate: 0.09, lfoDepth: 250 }));
    scheduleFlourish(state, (c) => { const f = 1800 + Math.random() * 900; tone(c, dest, { type: 'sine', freq: f, freqEnd: f * 1.3, t: c.currentTime + 0.02, dur: 0.12, a: 0.01, d: 0.06, r: 0.08, peak: 0.06 }); }, 2, 5);
  },
  forest: (ctx, dest, noiseBuf, state) => {
    state.sources.push(noiseBed(ctx, dest, noiseBuf, { type: 'highpass', freq: 1600, Q: 0.4, gain: 0.05, lfoRate: 0.06, lfoDepth: 400 }));
    scheduleFlourish(state, (c) => { const f = 900 + Math.random() * 500; tone(c, dest, { type: 'sine', freq: f, freqEnd: f * 0.8, t: c.currentTime + 0.02, dur: 0.3, a: 0.03, d: 0.14, r: 0.16, peak: 0.05 }); }, 4, 9);
  },
  cave: (ctx, dest, noiseBuf, state) => {
    state.sources.push(droneBed(ctx, dest, { freq: 58, gain: 0.1, lfoRate: 0.08, lfoDepth: 0.3 }));
    scheduleFlourish(state, (c) => fmTink(c, dest, { t: c.currentTime + 0.02, freq: 2400 + Math.random() * 900, ratio: 3.6, index: 600, dur: 0.5, peak: 0.09 }), 3, 8);
  },
  lake: (ctx, dest, noiseBuf, state) => {
    state.sources.push(noiseBed(ctx, dest, noiseBuf, { type: 'bandpass', freq: 500, Q: 1.1, gain: 0.07, lfoRate: 0.22, lfoDepth: 220 }));
    scheduleFlourish(state, (c) => noiseBurst(c, dest, noiseBuf, { t: c.currentTime + 0.02, dur: 0.14, filter: 'bandpass', freq: 900, Q: 1, a: 0.01, d: 0.08, r: 0.1, peak: 0.06 }), 3, 7);
  },
  mountain: (ctx, dest, noiseBuf, state) => {
    state.sources.push(noiseBed(ctx, dest, noiseBuf, { type: 'bandpass', freq: 450, Q: 0.7, gain: 0.11, lfoRate: 0.05, lfoDepth: 350 }));
    scheduleFlourish(state, (c) => noiseBurst(c, dest, noiseBuf, { t: c.currentTime + 0.02, dur: 1.0, filter: 'bandpass', freq: 500, freqEnd: 900, Q: 0.6, a: 0.3, d: 0.4, r: 0.4, peak: 0.1 }), 8, 16);
  },
  ruins: (ctx, dest, noiseBuf, state) => {
    state.sources.push(droneBed(ctx, dest, { freq: 130, gain: 0.05, lfoRate: 0.04, lfoDepth: 0.4 }));
    scheduleFlourish(state, (c) => fmTink(c, dest, { t: c.currentTime + 0.02, freq: 1000 + Math.random() * 500, ratio: 2.2, index: 350, dur: 0.7, peak: 0.06 }), 5, 11);
  },
  spire: (ctx, dest, noiseBuf, state) => {
    state.sources.push(droneBed(ctx, dest, { freq: 42, gain: 0.13, lfoRate: 0.03, lfoDepth: 0.25 }));
    scheduleFlourish(state, (c) => fmTink(c, dest, { t: c.currentTime + 0.02, freq: 300, ratio: 1.5, index: 200, dur: 1.4, peak: 0.05 }), 10, 20);
  },
  glade: (ctx, dest, noiseBuf, state) => {
    state.sources.push(noiseBed(ctx, dest, noiseBuf, { type: 'lowpass', freq: 500, Q: 0.4, gain: 0.04, lfoRate: 0.04, lfoDepth: 100 }));
    const cricket = (c) => {
      if (ambientState !== state) return;
      for (let i = 0; i < 3; i++) fmTink(c, dest, { t: c.currentTime + 0.02 + i * 0.09, freq: 4200, ratio: 1.2, index: 60, dur: 0.05, peak: 0.045 });
    };
    scheduleFlourish(state, cricket, 0.6, 1.6);
    scheduleFlourish(state, (c) => fmTink(c, dest, { t: c.currentTime + 0.02, freq: 2600 + Math.random() * 600, ratio: 2.6, index: 300, dur: 0.4, peak: 0.06 }), 4, 9);
  },
};

export function startAmbient(biome, fadeSec = 2.5) {
  const ctx = getCtx();
  if (!ctx) return;
  const routes = getSfxRoutes();
  if (!routes) return;
  if (ambientState && ambientState.biome === biome) return;
  const now = ctx.currentTime;
  const old = ambientState;
  if (old) {
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
    setTimeout(() => teardownAmbient(old), (fadeSec + 0.4) * 1000);
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(1, now + fadeSec);
  const dry = ctx.createGain(); dry.gain.value = 0.85; gain.connect(dry); dry.connect(routes.input);
  const wet = ctx.createGain(); wet.gain.value = 0.32; gain.connect(wet); wet.connect(routes.verb);
  const state = { biome, gain, timers: [], sources: [] };
  const builder = AMBIENT_BUILDERS[biome] || AMBIENT_BUILDERS.meadow;
  try { builder(ctx, gain, getNoiseBuffer(), state); } catch (e) { console.error('[sfx] ambient build failed', e); }
  ambientState = state;
}

// ---------------------------------------------------------------------------
// Weather beds — a second looping layer that rides on top of the biome
// ambient (rain patter, storm roar, snow hush, gloom murmur). Owned by
// world/weather.js via startWeatherBed/stopWeatherBed; kept separate from
// ambientState so zone ambience and weather crossfade independently.
// ---------------------------------------------------------------------------
let weatherState = null;      // {kind, gain, timers, sources}
let desiredWeather = null;    // survives until the AudioContext unlocks
let weatherResumeHooked = false;

const WEATHER_BUILDERS = {
  rain: (ctx, dest, noiseBuf, state) => {
    // broadband patter + a high sheen band, both slowly breathing
    state.sources.push(noiseBed(ctx, dest, noiseBuf, { type: 'lowpass', freq: 2400, Q: 0.5, gain: 0.085, lfoRate: 0.13, lfoDepth: 420 }));
    state.sources.push(noiseBed(ctx, dest, noiseBuf, { type: 'highpass', freq: 5000, Q: 0.6, gain: 0.03, lfoRate: 0.21, lfoDepth: 800 }));
    scheduleFlourish(state, (c) => fmTink(c, dest, { t: c.currentTime + 0.02, freq: 2300 + Math.random() * 1300, ratio: 2.1, index: 220, dur: 0.1, peak: 0.035 }), 0.7, 2.0, () => weatherState === state);
  },
  storm: (ctx, dest, noiseBuf, state) => {
    // heavier rain + a low pressure drone; thunder itself stays event-driven
    state.sources.push(noiseBed(ctx, dest, noiseBuf, { type: 'lowpass', freq: 2000, Q: 0.5, gain: 0.12, lfoRate: 0.17, lfoDepth: 520 }));
    state.sources.push(noiseBed(ctx, dest, noiseBuf, { type: 'highpass', freq: 4600, Q: 0.6, gain: 0.045, lfoRate: 0.31, lfoDepth: 900 }));
    state.sources.push(droneBed(ctx, dest, { freq: 52, gain: 0.06, lfoRate: 0.06, lfoDepth: 0.5 }));
    scheduleFlourish(state, (c) => noiseBurst(c, dest, getNoiseBuffer(), { t: c.currentTime + 0.02, dur: 1.6, filter: 'bandpass', freq: 380, freqEnd: 900, Q: 0.7, a: 0.5, d: 0.6, r: 0.5, peak: 0.09 }), 5, 12, () => weatherState === state);
  },
  snow: (ctx, dest, noiseBuf, state) => {
    // a hushed, airy wind — snow is mostly the absence of sound
    state.sources.push(noiseBed(ctx, dest, noiseBuf, { type: 'bandpass', freq: 900, Q: 0.5, gain: 0.05, lfoRate: 0.07, lfoDepth: 300 }));
    state.sources.push(noiseBed(ctx, dest, noiseBuf, { type: 'highpass', freq: 6000, Q: 0.5, gain: 0.014, lfoRate: 0.16, lfoDepth: 1000 }));
    scheduleFlourish(state, (c) => fmTink(c, dest, { t: c.currentTime + 0.02, freq: 3400 + Math.random() * 800, ratio: 4.4, index: 500, dur: 0.3, peak: 0.03 }), 6, 14, () => weatherState === state);
  },
  gloom: (ctx, dest, noiseBuf, state) => {
    // uneasy low murmur + whispery mid band, sparse dark swells
    state.sources.push(droneBed(ctx, dest, { freq: 47, gain: 0.055, lfoRate: 0.05, lfoDepth: 0.4 }));
    state.sources.push(noiseBed(ctx, dest, noiseBuf, { type: 'bandpass', freq: 620, Q: 1.4, gain: 0.035, lfoRate: 0.09, lfoDepth: 160 }));
    scheduleFlourish(state, (c) => reverseSwell(c, dest, { t: c.currentTime + 0.02, dur: 0.9, freq: 55, peak: 0.05 }), 9, 20, () => weatherState === state);
  },
};

/**
 * Start (or crossfade to) the looping weather bed for `kind`
 * ('rain'|'storm'|'snow'|'gloom'). Safe before audio unlock: the request is
 * remembered and starts the moment the context exists.
 */
export function startWeatherBed(kind, fadeSec = 3.0) {
  if (!WEATHER_BUILDERS[kind]) { stopWeatherBed(fadeSec); return; }
  desiredWeather = kind;
  const ctx = getCtx();
  if (!ctx) { hookWeatherResume(); return; }
  const routes = getSfxRoutes();
  if (!routes) return;
  if (weatherState && weatherState.kind === kind) return;
  const now = ctx.currentTime;
  const old = weatherState;
  if (old) {
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
    setTimeout(() => teardownAmbient(old), (fadeSec + 0.4) * 1000);
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(1, now + fadeSec);
  const dry = ctx.createGain(); dry.gain.value = 0.85; gain.connect(dry); dry.connect(routes.input);
  const wet = ctx.createGain(); wet.gain.value = 0.3; gain.connect(wet); wet.connect(routes.verb);
  const state = { kind, gain, timers: [], sources: [] };
  try { WEATHER_BUILDERS[kind](ctx, gain, getNoiseBuffer(), state); } catch (e) { console.error('[sfx] weather bed build failed', e); }
  weatherState = state;
}

/** Fade out and dispose the current weather bed (zone change / clear skies). */
export function stopWeatherBed(fadeSec = 2.0) {
  desiredWeather = null;
  const old = weatherState;
  weatherState = null;
  if (!old) return;
  const ctx = getCtx();
  if (!ctx) { teardownAmbient(old); return; }
  const now = ctx.currentTime;
  old.gain.gain.cancelScheduledValues(now);
  old.gain.gain.setValueAtTime(old.gain.gain.value, now);
  old.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
  setTimeout(() => teardownAmbient(old), (fadeSec + 0.4) * 1000);
}

function hookWeatherResume() {
  if (weatherResumeHooked) return;
  weatherResumeHooked = true;
  whenReady(() => { if (desiredWeather) startWeatherBed(desiredWeather, 3.5); });
}
