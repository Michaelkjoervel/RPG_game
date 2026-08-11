// music.js — the pattern sequencer: a lookahead scheduler that plays composed
// tracks (data lives in tracks.js) through a small palette of synthesized
// voices. audio.js owns the AudioContext and the music mix bus; this module
// only ever asks for it lazily (getCtx / getMusicRoutes) so it is inert until
// the player has interacted with the page.
//
// Track data format (see tracks.js header for the full note-pattern grammar):
//   TRACKS[id] = {
//     tempo, swing, meter: [beatsPerBar, unit], wet (reverb send 0..1),
//     parts: { name: { voice: 'pluck'|'warmPad'|'bell'|'bass'|'flute'|'choir'|'arp',
//                       step: '16n'|'8n'|'4n'|'2n'|'1n', pattern: '...', gain: 0..1 } }
//   }
// Each part's pattern loops on its OWN natural length (however many beats its
// tokens add up to) — melody/pad/bass are composed to share a common loop
// length so the harmony stays locked; decorative bell/arp layers are allowed
// to drift out of phase on purpose for a less mechanical, "never loops
// obviously" feel.
//
// Public API (called by audio.js only — gameplay code never touches this
// module directly): crossfadeTo(trackId, sec), playOnce(trackId, {returnTo,
// fadeIn}), playSting(kind), duck(sec).
import { getCtx, getMusicRoutes, getNoiseBuffer, duckMusic } from './audio.js';
import { TRACKS } from './tracks.js';

// ---------------------------------------------------------------------------
// Note names & the pattern mini-language
// ---------------------------------------------------------------------------
const NOTE_RE = /^([A-Ga-g])(#|b)?(-?\d+)$/;
const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToMidi(name) {
  const m = NOTE_RE.exec(name);
  if (!m) return null;
  let s = SEMITONES[m[1].toUpperCase()];
  if (m[2] === '#') s += 1;
  else if (m[2] === 'b') s -= 1;
  const oct = parseInt(m[3], 10);
  return (oct + 1) * 12 + s;
}

export function noteToFreq(name) {
  const midi = noteToMidi(name);
  return midi == null ? null : 440 * Math.pow(2, (midi - 69) / 12);
}

const STEP_BEATS = { '32n': 0.125, '16n': 0.25, '8n': 0.5, '4n': 1, '2n': 2, '1n': 4 };

const warnedNotes = new Set();

/**
 * Parse a pattern string into a flat list of {beat, dur, notes:[name,...]}.
 * Tokens (whitespace separated):
 *   .            rest, one step
 *   .*N  -*N     rest, N steps (compact intro/gap notation)
 *   _            tie — extend the previous note by one more step
 *   NAME         a note ("G4", "F#3", "Bb2") — one step long
 *   NAME*N       hold NAME for N steps
 *   A+B+C        a chord (any of the note forms above, joined by "+")
 */
export function parsePattern(str, stepName = '8n') {
  const stepBeats = STEP_BEATS[stepName] ?? 0.5;
  const tokens = (str || '').trim().split(/\s+/).filter(Boolean);
  const events = [];
  let beat = 0;
  for (const raw of tokens) {
    const restMulti = raw.match(/^[.\-]\*(\d+)$/);
    if (restMulti) { beat += stepBeats * parseInt(restMulti[1], 10); continue; }
    if (raw === '.' || raw === '-') { beat += stepBeats; continue; }
    if (raw === '_') {
      if (events.length) events[events.length - 1].dur += stepBeats;
      beat += stepBeats;
      continue;
    }
    let tok = raw, holdSteps = 1;
    const starIdx = raw.indexOf('*');
    if (starIdx > -1) {
      tok = raw.slice(0, starIdx);
      holdSteps = Math.max(1, parseInt(raw.slice(starIdx + 1), 10) || 1);
    }
    const notes = tok.split('+').map((n) => n.trim()).filter((n) => {
      const ok = NOTE_RE.test(n);
      if (!ok && !warnedNotes.has(n)) { warnedNotes.add(n); console.warn(`[music] bad note token "${n}" in pattern`); }
      return ok;
    });
    events.push({ beat, dur: stepBeats * holdSteps, notes });
    beat += stepBeats * holdSteps;
  }
  return { events, totalBeats: beat };
}

function applySwing(beat, amt) {
  if (!amt) return beat;
  const half = 0.5; // swing only nudges the "and" of the beat (8th-note grid)
  const idx = beat / half;
  const nearestOdd = Math.round(idx);
  if (Math.abs(idx - nearestOdd) < 1e-6 && nearestOdd % 2 === 1) return beat + amt * half * 0.5;
  return beat;
}

// ---------------------------------------------------------------------------
// Small synthesis helpers shared by every voice
// ---------------------------------------------------------------------------
function envGain(ctx, t0, { a = 0.01, d = 0.1, s = 0.7, r = 0.15, dur = 0.3, peak = 1 } = {}) {
  const g = ctx.createGain();
  const att = Math.max(0.002, a);
  const sustainEnd = Math.max(t0 + att + d, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + att);
  g.gain.linearRampToValueAtTime(Math.max(0.0001, peak * s), t0 + att + d);
  g.gain.setValueAtTime(Math.max(0.0001, peak * s), sustainEnd);
  g.gain.linearRampToValueAtTime(0.0001, sustainEnd + r);
  return { node: g, endTime: sustainEnd + r };
}

// ---------------------------------------------------------------------------
// Voices — each schedules its own nodes into `dest` and self-disposes
// (osc.stop() lets the GC reclaim them; nothing is pooled because WebAudio
// source nodes are one-shot by spec — the shared noise buffer they draw from
// is the actual reusable resource, and that lives in audio.js).
// ---------------------------------------------------------------------------
function voicePluck(ctx, dest, freq, t, dur, vel = 1) {
  const osc = ctx.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, t);
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = 0.7;
  filt.frequency.setValueAtTime(Math.min(7000, freq * 9 + 900), t);
  filt.frequency.exponentialRampToValueAtTime(Math.max(180, freq * 1.4), t + Math.min(0.22, dur + 0.1));
  const { node: env, endTime } = envGain(ctx, t, { a: 0.004, d: 0.16, s: 0.0001, r: 0.06, dur: Math.min(dur, 0.06), peak: 0.55 * vel });
  osc.connect(filt); filt.connect(env); env.connect(dest);
  osc.start(t); osc.stop(endTime + 0.05);
}

function voiceWarmPad(ctx, dest, freq, t, dur, vel = 1) {
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = 0.35;
  filt.frequency.setValueAtTime(Math.min(3400, freq * 3.6 + 420), t);
  const { node: env, endTime } = envGain(ctx, t, { a: 0.55, d: 0.5, s: 0.72, r: 1.0, dur, peak: 0.3 * vel });
  const detunes = [-6, 0, 6];
  const oscs = detunes.map((cents) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, t); o.detune.setValueAtTime(cents, t);
    o.connect(filt);
    return o;
  });
  filt.connect(env); env.connect(dest);
  oscs.forEach((o) => { o.start(t); o.stop(endTime + 0.15); });
}

function voiceBell(ctx, dest, freq, t, dur, vel = 1) {
  const carrier = ctx.createOscillator(); carrier.type = 'sine'; carrier.frequency.setValueAtTime(freq, t);
  const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.setValueAtTime(freq * 3.01, t);
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(freq * 1.5, t);
  modGain.gain.exponentialRampToValueAtTime(Math.max(1, freq * 0.04), t + 0.9);
  mod.connect(modGain); modGain.connect(carrier.frequency);
  const { node: env, endTime } = envGain(ctx, t, { a: 0.002, d: 1.0, s: 0.0001, r: 0.4, dur: Math.min(dur, 0.05), peak: 0.46 * vel });
  carrier.connect(env); env.connect(dest);
  carrier.start(t); carrier.stop(endTime + 0.05);
  mod.start(t); mod.stop(endTime + 0.05);
}

function voiceBass(ctx, dest, freq, t, dur, vel = 1) {
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
  const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.setValueAtTime(freq / 2, t);
  const saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.setValueAtTime(freq, t);
  const sawGain = ctx.createGain(); sawGain.gain.value = 0.14;
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 950; filt.Q.value = 0.6;
  const { node: env, endTime } = envGain(ctx, t, { a: 0.012, d: 0.09, s: 0.82, r: 0.14, dur, peak: 0.48 * vel });
  osc.connect(filt); sub.connect(filt); saw.connect(sawGain); sawGain.connect(filt);
  filt.connect(env); env.connect(dest);
  [osc, sub, saw].forEach((o) => { o.start(t); o.stop(endTime + 0.06); });
}

function voiceFlute(ctx, dest, freq, t, dur, vel = 1, noiseBuf) {
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
  const vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = 5.1;
  const vibGain = ctx.createGain(); vibGain.gain.value = freq * 0.007;
  vib.connect(vibGain); vibGain.connect(osc.frequency);
  const { node: env, endTime } = envGain(ctx, t, { a: 0.07, d: 0.12, s: 0.74, r: 0.2, dur, peak: 0.4 * vel });
  osc.connect(env); env.connect(dest);
  let noiseSrc = null;
  if (noiseBuf) {
    noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = noiseBuf; noiseSrc.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = freq * 2.1; nf.Q.value = 0.7;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.028 * vel, t);
    noiseSrc.connect(nf); nf.connect(ng); ng.connect(env);
    noiseSrc.start(t, Math.random() * Math.max(0.1, noiseBuf.duration - 1));
  }
  osc.start(t); osc.stop(endTime + 0.05);
  vib.start(t); vib.stop(endTime + 0.05);
  if (noiseSrc) noiseSrc.stop(endTime + 0.05);
}

function voiceChoir(ctx, dest, freq, t, dur, vel = 1) {
  const detunes = [-9, -3, 3, 9];
  const { node: env, endTime } = envGain(ctx, t, { a: 0.4, d: 0.5, s: 0.7, r: 0.85, dur, peak: 0.26 * vel });
  const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = Math.max(400, freq * 2.2); f1.Q.value = 3;
  const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = Math.max(700, freq * 4.1); f2.Q.value = 4;
  const oscs = detunes.map((cents) => {
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t); o.detune.setValueAtTime(cents, t);
    o.connect(f1); o.connect(f2);
    return o;
  });
  f1.connect(env); f2.connect(env); env.connect(dest);
  oscs.forEach((o) => { o.start(t); o.stop(endTime + 0.15); });
}

function voiceArp(ctx, dest, freq, t, dur, vel = 1) {
  const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t);
  const { node: env, endTime } = envGain(ctx, t, { a: 0.002, d: 0.09, s: 0.0001, r: 0.05, dur: Math.min(dur, 0.05), peak: 0.32 * vel });
  osc.connect(env); env.connect(dest);
  osc.start(t); osc.stop(endTime + 0.03);
}

const VOICES = { pluck: voicePluck, warmPad: voiceWarmPad, bell: voiceBell, bass: voiceBass, flute: voiceFlute, choir: voiceChoir, arp: voiceArp };
const warnedVoices = new Set();
function voiceFor(name) {
  if (VOICES[name]) return VOICES[name];
  if (!warnedVoices.has(name)) { warnedVoices.add(name); console.warn(`[music] unknown voice "${name}", falling back to pluck`); }
  return voicePluck;
}

// ---------------------------------------------------------------------------
// Layers — one per currently-playing (or fading-out) track
// ---------------------------------------------------------------------------
let layers = [];
let currentTrackId = null;
let schedulerHandle = null;
const LOOKAHEAD = 0.12;
const TICK_MS = 25;

function buildCursors(track, startTime) {
  const cursors = [];
  for (const [name, part] of Object.entries(track.parts || {})) {
    const { events, totalBeats } = parsePattern(part.pattern, part.step || '8n');
    if (!events.length || totalBeats <= 0) continue;
    cursors.push({ name, part, events, loopBeats: totalBeats, idx: 0, cycleStart: startTime });
  }
  return cursors;
}

function makeLayer(ctx, trackId, routes) {
  const track = TRACKS[trackId];
  const layerGain = ctx.createGain(); layerGain.gain.value = 0.0001;
  const dryTap = ctx.createGain(); dryTap.gain.value = 0.85;
  const verbTap = ctx.createGain(); verbTap.gain.value = track.wet ?? 0.32;
  layerGain.connect(dryTap); dryTap.connect(routes.input);
  layerGain.connect(verbTap); verbTap.connect(routes.verb);
  const startTime = ctx.currentTime + 0.05;
  const cursors = buildCursors(track, startTime).map((c) => {
    const partGain = ctx.createGain(); partGain.gain.value = c.part.gain ?? 0.8;
    partGain.connect(layerGain);
    c.dest = partGain;
    return c;
  });
  return { trackId, track, layerGain, cursors, active: true };
}

function stepPart(ctx, track, cursor, nowPlus, noiseBuf) {
  const secPerBeat = 60 / track.tempo;
  const voiceFn = voiceFor(cursor.part.voice);
  let guard = 0;
  while (guard++ < 64) {
    const ev = cursor.events[cursor.idx];
    const evBeat = applySwing(ev.beat, track.swing || 0);
    const t = cursor.cycleStart + evBeat * secPerBeat;
    if (t >= nowPlus) break;
    if (ev.notes.length) {
      const durSec = Math.max(0.05, ev.dur * secPerBeat * 0.94);
      const vel = 1;
      for (const n of ev.notes) {
        const freq = noteToFreq(n);
        if (freq) {
          const jitter = 1 + (Math.random() - 0.5) * 0.005; // whisper of humanization
          voiceFn(ctx, cursor.dest, freq * jitter, t, durSec, vel, noiseBuf);
        }
      }
    }
    cursor.idx++;
    if (cursor.idx >= cursor.events.length) {
      cursor.idx = 0;
      cursor.cycleStart += cursor.loopBeats * secPerBeat;
    }
  }
}

function schedulerTick() {
  const ctx = getCtx();
  if (!ctx) return;
  const noiseBuf = getNoiseBuffer();
  const nowPlus = ctx.currentTime + LOOKAHEAD;
  for (const layer of layers) {
    if (!layer.active) continue;
    for (const cursor of layer.cursors) stepPart(ctx, layer.track, cursor, nowPlus, noiseBuf);
  }
}

function ensureScheduler() {
  if (schedulerHandle) return;
  schedulerHandle = setInterval(schedulerTick, TICK_MS);
}

function fadeOutAllLayers(ctx, sec) {
  const now = ctx.currentTime;
  const dying = [];
  for (const l of layers) {
    if (!l.active) continue;
    l.active = false;
    dying.push(l);
    l.layerGain.gain.cancelScheduledValues(now);
    l.layerGain.gain.setValueAtTime(l.layerGain.gain.value, now);
    l.layerGain.gain.linearRampToValueAtTime(0.0001, now + sec);
  }
  if (dying.length) setTimeout(() => { layers = layers.filter((l) => !dying.includes(l)); }, (sec + 0.3) * 1000);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/** Crossfade the looping soundscape to `trackId` over `sec` seconds. */
export function crossfadeTo(trackId, sec = 1.5) {
  if (!TRACKS[trackId]) { console.warn(`[music] unknown track "${trackId}"`); return; }
  const alreadyPlaying = trackId === currentTrackId && layers.some((l) => l.trackId === trackId && l.active);
  currentTrackId = trackId;
  if (alreadyPlaying) return;
  const ctx = getCtx();
  if (!ctx) return; // audio.js re-issues this once the context unlocks
  const routes = getMusicRoutes();
  if (!routes) return;
  ensureScheduler();
  fadeOutAllLayers(ctx, sec);
  const layer = makeLayer(ctx, trackId, routes);
  const now = ctx.currentTime;
  layer.layerGain.gain.setValueAtTime(0.0001, now);
  layer.layerGain.gain.linearRampToValueAtTime(1, now + sec);
  layers.push(layer);
}

/**
 * Play a short, non-looping piece once (victory / awakening / gameover
 * flourishes), then crossfade to `returnTo` (typically the zone theme).
 */
export function playOnce(trackId, { returnTo, fadeIn = 1.2 } = {}) {
  if (!TRACKS[trackId]) { console.warn(`[music] unknown once-track "${trackId}"`); return; }
  const ctx = getCtx();
  if (!ctx) return;
  const routes = getMusicRoutes();
  if (!routes) return;
  ensureScheduler();
  fadeOutAllLayers(ctx, 0.35);
  const layer = makeLayer(ctx, trackId, routes);
  const now = ctx.currentTime;
  const inTime = Math.max(0.05, Math.min(0.5, fadeIn));
  layer.layerGain.gain.setValueAtTime(0.0001, now);
  layer.layerGain.gain.linearRampToValueAtTime(1, now + inTime);
  layers.push(layer);
  currentTrackId = trackId;
  const secPerBeat = 60 / layer.track.tempo;
  const longestBeats = layer.cursors.reduce((m, c) => Math.max(m, c.loopBeats), 4);
  const durMs = Math.max(600, longestBeats * secPerBeat * 1000);
  setTimeout(() => {
    layer.active = false;
    if (returnTo) crossfadeTo(returnTo, 1.6);
  }, durMs);
}

/** Quick musical stab for a battle transition; also dips the music bed. */
export function playSting(kind = 'wild') {
  const ctx = getCtx();
  if (!ctx) return;
  const routes = getMusicRoutes();
  if (!routes) return;
  const depth = kind === 'boss' ? 0.55 : kind === 'warden' ? 0.42 : 0.3;
  const holdSec = kind === 'boss' ? 1.1 : 0.7;
  duckMusic(depth, holdSec);
  const dest = ctx.createGain(); dest.gain.value = 1;
  const dry = ctx.createGain(); dry.gain.value = 0.9; dest.connect(dry); dry.connect(routes.input);
  const wet = ctx.createGain(); wet.gain.value = 0.32; dest.connect(wet); wet.connect(routes.verb);
  const notes = kind === 'boss' ? ['G3', 'D4', 'G3', 'A#3', 'D4']
    : kind === 'warden' ? ['G4', 'C5', 'E5']
      : ['A4', 'C5', 'E5'];
  const step = kind === 'boss' ? 0.17 : 0.095;
  let t = ctx.currentTime + 0.02;
  for (const n of notes) {
    const freq = noteToFreq(n);
    if (freq) (kind === 'boss' ? voiceBell : voicePluck)(ctx, dest, freq, t, 0.22, 0.95);
    t += step;
  }
}

/** Convenience wrapper around audio.js's music duck, for a manual sting-style dip. */
export function duck(sec = 0.6) { duckMusic(0.4, sec); }

export function currentTrack() { return currentTrackId; }
