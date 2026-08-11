// cries.js — playCry(speciesId): synthesizes a short vocalization from
// SPECIES[id].cry {pitch, timbre}. Imported directly by other modules
// (battle presentation, the Codex, the awakening cinematic) rather than
// through the bus, per the audio contract.
//
// Same species always sounds the same: micro-variation (segment count,
// exact intervals, timing) is derived from a seeded RNG keyed off the
// species id (hashStr + seededRandom from core/rng), never Math.random.
import { getCtx, getSfxRoutes, getNoiseBuffer } from './audio.js';
import { hashStr, seededRandom } from '../core/rng.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let speciesPromise = null;
let warnedSpecies = false;
function loadSpecies() {
  if (!speciesPromise) {
    speciesPromise = import('../data/creatures.js')
      .then((m) => m.SPECIES ?? null)
      .catch((e) => {
        if (!warnedSpecies) { warnedSpecies = true; console.warn('[cries] creature data not available yet', e); }
        return null;
      });
  }
  return speciesPromise;
}

const DEFAULT_CRY = { pitch: 1, timbre: 'chirp' };

// ---------------------------------------------------------------------------
// Small synthesis primitives (self-contained — cries have their own gentle,
// vocal-shaped envelopes rather than the percussive ones sfx.js uses).
// ---------------------------------------------------------------------------
function mix(ctx, routes, dry = 0.85, wet = 0.3) {
  const g = ctx.createGain();
  const dg = ctx.createGain(); dg.gain.value = dry; g.connect(dg); dg.connect(routes.input);
  const wg = ctx.createGain(); wg.gain.value = wet; g.connect(wg); wg.connect(routes.verb);
  return g;
}

function envSeg(ctx, dest, { t, dur, a = 0.02, r = 0.08, peak = 0.5 }) {
  const g = ctx.createGain();
  const holdEnd = Math.max(t + a + 0.005, t + dur - r);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, holdEnd);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  g.connect(dest);
  return g;
}

function glideTone(ctx, dest, { type = 'sine', t, dur, f0, f1, peak = 0.5, a, r, vibRate = 0, vibDepth = 0 }) {
  const osc = ctx.createOscillator(); osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, f0), t);
  osc.frequency.linearRampToValueAtTime(Math.max(20, f1), t + dur);
  let vib = null, vibGain = null;
  if (vibRate > 0) {
    vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = vibRate;
    vibGain = ctx.createGain(); vibGain.gain.value = vibDepth;
    vib.connect(vibGain); vibGain.connect(osc.frequency);
  }
  const env = envSeg(ctx, dest, { t, dur, a: a ?? Math.min(0.03, dur * 0.25), r: r ?? Math.min(0.09, dur * 0.35), peak });
  osc.connect(env);
  osc.start(t); osc.stop(t + dur + 0.05);
  if (vib) { vib.start(t); vib.stop(t + dur + 0.05); }
}

function noiseLayer(ctx, dest, noiseBuf, { t, dur, freq = 500, Q = 1, peak = 0.2, type = 'bandpass' }) {
  if (!noiseBuf) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const off = Math.random() * Math.max(0.05, noiseBuf.duration - dur - 0.1);
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q;
  const env = envSeg(ctx, dest, { t, dur, a: Math.min(0.05, dur * 0.2), r: Math.min(0.15, dur * 0.4), peak });
  src.connect(f); f.connect(env);
  src.start(t, off, dur + 0.15); src.stop(t + dur + 0.1);
}

// ---------------------------------------------------------------------------
// Timbres — each schedules 2-3 segments summing to ~0.4-0.9s.
// ---------------------------------------------------------------------------
function chirp(ctx, dest, { pitch, rng, t0 }) {
  const base = 1500 * pitch;
  const segs = rng() < 0.5 ? 2 : 3;
  let t = t0;
  for (let i = 0; i < segs; i++) {
    const dur = 0.09 + rng() * 0.06;
    const rise = base * (0.85 + rng() * 0.3);
    const peakF = rise * (1.3 + rng() * 0.25);
    glideTone(ctx, dest, { type: 'sine', t, dur: dur * 0.5, f0: rise, f1: peakF, peak: 0.46, a: 0.006, r: 0.01 });
    glideTone(ctx, dest, { type: 'sine', t: t + dur * 0.5, dur: dur * 0.5, f0: peakF, f1: rise * 0.9, peak: 0.4, a: 0.006, r: dur * 0.25 });
    t += dur + 0.03 + rng() * 0.04;
  }
}

function growl(ctx, dest, { pitch, rng, t0, noiseBuf }) {
  const base = 220 * pitch;
  const dur = 0.48 + rng() * 0.3;
  const osc = ctx.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(base * 1.05, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, base * 0.85), t0 + dur);
  const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 13 + rng() * 6;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.35;
  const trem = ctx.createGain(); trem.gain.value = 0.65;
  lfo.connect(lfoGain); lfoGain.connect(trem.gain);
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = base * 4 + 300; filt.Q.value = 1.4;
  const env = envSeg(ctx, dest, { t: t0, dur, a: 0.04, r: 0.14, peak: 0.48 });
  osc.connect(filt); filt.connect(trem); trem.connect(env);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
  lfo.start(t0); lfo.stop(t0 + dur + 0.05);
  noiseLayer(ctx, dest, noiseBuf, { t: t0, dur: dur * 0.6, freq: base * 3, Q: 0.8, peak: 0.08, type: 'bandpass' });
}

function hum(ctx, dest, { pitch, rng, t0 }) {
  const base = 480 * pitch;
  const dur = 0.5 + rng() * 0.25;
  glideTone(ctx, dest, {
    type: 'triangle', t: t0, dur, f0: base, f1: base * (0.97 + rng() * 0.06), peak: 0.42,
    a: dur * 0.35, r: dur * 0.35, vibRate: 4.5 + rng() * 1.5, vibDepth: base * 0.015,
  });
}

function trill(ctx, dest, { pitch, rng, t0 }) {
  const baseA = 900 * pitch;
  const baseB = baseA * (1.12 + rng() * 0.06);
  const reps = 5 + Math.floor(rng() * 3);
  const stepDur = 0.045 + rng() * 0.015;
  let t = t0;
  for (let i = 0; i < reps; i++) {
    const f = i % 2 === 0 ? baseA : baseB;
    glideTone(ctx, dest, { type: 'sine', t, dur: stepDur, f0: f, f1: f, peak: 0.38, a: 0.004, r: stepDur * 0.4 });
    t += stepDur;
  }
}

function rumble(ctx, dest, { pitch, rng, t0, noiseBuf }) {
  const base = 68 * pitch;
  const dur = 0.55 + rng() * 0.3;
  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(base, t0);
  osc.frequency.linearRampToValueAtTime(base * 0.9, t0 + dur);
  const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5 + rng() * 2;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.25;
  const trem = ctx.createGain(); trem.gain.value = 0.7;
  lfo.connect(lfoGain); lfoGain.connect(trem.gain);
  const env = envSeg(ctx, dest, { t: t0, dur, a: 0.05, r: 0.2, peak: 0.55 });
  osc.connect(trem); trem.connect(env);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
  lfo.start(t0); lfo.stop(t0 + dur + 0.05);
  noiseLayer(ctx, dest, noiseBuf, { t: t0, dur, freq: base * 2.5, Q: 0.6, peak: 0.1, type: 'lowpass' });
}

function bell(ctx, dest, { pitch, rng, t0 }) {
  const base = 700 * pitch;
  const dur = 0.6 + rng() * 0.25;
  const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.setValueAtTime(base, t0);
  const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.setValueAtTime(base * 2.4, t0);
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(base * 1.2, t0);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, base * 0.03), t0 + dur);
  mod.connect(mg); mg.connect(car.frequency);
  const env = envSeg(ctx, dest, { t: t0, dur, a: 0.008, r: dur * 0.65, peak: 0.5 });
  car.connect(env);
  car.start(t0); car.stop(t0 + dur + 0.05);
  mod.start(t0); mod.stop(t0 + dur + 0.05);
}

const TIMBRES = { chirp, growl, hum, trill, rumble, bell };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/** playCry(speciesId, {hollowed}?) — fire-and-forget; safe before audio unlock. */
export async function playCry(speciesId, opts = {}) {
  const ctx = getCtx();
  if (!ctx) return;
  const routes = getSfxRoutes();
  if (!routes) return;
  const SPECIES = await loadSpecies();
  const def = SPECIES?.[speciesId]?.cry ?? DEFAULT_CRY;
  const pitch = clamp(def.pitch ?? 1, 0.5, 2);
  const timbre = TIMBRES[def.timbre] ? def.timbre : 'chirp';
  const rng = seededRandom((hashStr(speciesId || 'unknown') ^ 0x9e3779b9) >>> 0);
  const t0 = ctx.currentTime + 0.01;
  const dest = mix(ctx, routes, 0.85, opts.hollowed ? 0.5 : 0.28);
  try { TIMBRES[timbre](ctx, dest, { pitch, rng, t0, noiseBuf: getNoiseBuffer() }); }
  catch (e) { console.error(`[cries] "${speciesId}" (${timbre}) failed`, e); }
}
