// audio.js — the audio engine's front door and mixing graph.
//
// Lazy AudioContext (created on first user gesture), master limiter, music/sfx
// busses with procedurally generated convolution reverb, and ALL bus wiring so
// gameplay code never imports synth internals directly:
//
//   'ui:sfx' {name}          -> sfx.play(name)
//   'sfx:footstep' {surface} -> footstep synth per surface
//   'zone:enter' {zoneId}    -> zone theme crossfade + ambient bed per biome
//   'battle:start' / 'transition:battle' (battle mode) -> sting + battle track
//   'battle:end'             -> victory/gameover flourish, then zone theme
//   'creature:awakened' / 'sigil:gained' / 'quest:completed' /
//   'item:gained' / 'glim:changed' -> tasteful, rate-limited accents
//   'settings:changed'       -> live musicVol/sfxVol
//
// Everything is guarded against ctx === null (before the first gesture); events
// that arrive early update pending state so the right soundscape starts the
// moment audio unlocks.
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import * as music from './music.js';
import * as sfx from './sfx.js';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------
let ctx = null;
let master = null, limiter = null;
let musicVol = null, musicDuckG = null, musicSum = null, musicIn = null, musicVerbIn = null;
let sfxVol = null, sfxSum = null, sfxIn = null, sfxVerbIn = null;
let noiseBuffer = null;
const readyFns = [];
let wired = false;

// Soundscape intent — kept coherent even before the AudioContext exists.
const pending = { track: 'title', biome: null };
let zoneTrackId = null;      // the current overworld theme (return-to target)
let currentBiome = null;
let battleTrack = null;      // battle theme id while a battle is running
let lastAwakenAt = -1e9;

// Perceptual-ish volume curve: sliders feel linear, gains are squared.
const volCurve = (v) => Math.max(0, Math.min(1, v)) ** 2;

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------
export function initAudio() {
  if (wired) return;
  wired = true;
  wireBus();
  attachGestureUnlock();
}

export function getCtx() { return ctx; }
export function isAudioReady() { return !!ctx; }
export function getNoiseBuffer() { return noiseBuffer; }

/** Run fn(ctx) now if the context exists, else the moment it is created. */
export function whenReady(fn) {
  if (ctx) { try { fn(ctx); } catch (e) { console.error('[audio]', e); } }
  else readyFns.push(fn);
}

/** Music submix taps: { input (dry), verb (reverb send) }. Null before unlock. */
export function getMusicRoutes() { return ctx ? { input: musicIn, verb: musicVerbIn } : null; }
/** SFX submix taps: { input (dry), verb (reverb send) }. Null before unlock. */
export function getSfxRoutes() { return ctx ? { input: sfxIn, verb: sfxVerbIn } : null; }

/** Briefly dip the music (stings, thunder, big moments). */
export function duckMusic(depth = 0.45, sec = 1.0) {
  if (!ctx || !musicDuckG) return;
  const g = musicDuckG.gain, t = ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(Math.max(0.05, g.value), t);
  g.linearRampToValueAtTime(Math.max(0.05, 1 - depth), t + 0.07);
  g.linearRampToValueAtTime(1, t + Math.max(0.2, sec));
}

// ---------------------------------------------------------------------------
// Context creation (first gesture) + graph
// ---------------------------------------------------------------------------
function attachGestureUnlock() {
  if (typeof window === 'undefined') return;
  const kick = () => ensureCtx();
  // Kept attached permanently: after creation they double as resume-on-suspend
  // (some browsers suspend contexts on tab switches). ensureCtx is cheap.
  window.addEventListener('pointerdown', kick, { passive: true });
  window.addEventListener('keydown', kick);
  window.addEventListener('touchstart', kick, { passive: true });
}

function ensureCtx() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return;
  try { ctx = new AC(); } catch (e) { console.warn('[audio] AudioContext unavailable', e); return; }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  buildGraph();
  noiseBuffer = makeNoiseBuffer(ctx, 2.0);
  for (const fn of readyFns.splice(0)) {
    try { fn(ctx); } catch (e) { console.error('[audio]', e); }
  }
  startPendingSoundscape();
}

function buildGraph() {
  // master chain: everything -> master -> limiter -> speakers
  master = ctx.createGain();
  master.gain.value = 0.85;
  limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // ---- music submix: parts -> musicIn ─┬─────────────-> musicSum
  //                     parts -> musicVerbIn -> convolver ┘
  //                    musicSum -> duck -> user volume -> master
  musicIn = ctx.createGain();
  musicVerbIn = ctx.createGain();
  musicSum = ctx.createGain();
  const mConv = ctx.createConvolver();
  mConv.buffer = makeImpulse(ctx, 2.2, 2.6);
  const mWet = ctx.createGain();
  mWet.gain.value = 0.4;
  musicIn.connect(musicSum);
  musicVerbIn.connect(mConv);
  mConv.connect(mWet);
  mWet.connect(musicSum);
  musicDuckG = ctx.createGain();
  musicVol = ctx.createGain();
  musicVol.gain.value = volCurve(settings.musicVol);
  musicSum.connect(musicDuckG);
  musicDuckG.connect(musicVol);
  musicVol.connect(master);

  // ---- sfx submix (same shape, tighter room)
  sfxIn = ctx.createGain();
  sfxVerbIn = ctx.createGain();
  sfxSum = ctx.createGain();
  const sConv = ctx.createConvolver();
  sConv.buffer = makeImpulse(ctx, 0.9, 3.2);
  const sWet = ctx.createGain();
  sWet.gain.value = 0.3;
  sfxIn.connect(sfxSum);
  sfxVerbIn.connect(sConv);
  sConv.connect(sWet);
  sWet.connect(sfxSum);
  sfxVol = ctx.createGain();
  sfxVol.gain.value = volCurve(settings.sfxVol);
  sfxSum.connect(sfxVol);
  sfxVol.connect(master);
}

/** Shared 2s white-noise buffer — every noise-based synth reuses this. */
function makeNoiseBuffer(ac, seconds) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Procedural stereo impulse response: exponentially decaying noise. */
function makeImpulse(ac, seconds, decayPow) {
  const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decayPow);
    }
  }
  return buf;
}

function startPendingSoundscape() {
  music.crossfadeTo(pending.track, 1.4);
  if (pending.biome) sfx.startAmbient(pending.biome, 3.0);
}

// ---------------------------------------------------------------------------
// Zone resolution (music id + biome) via worldmap, with a bible-truth fallback
// ---------------------------------------------------------------------------
const FALLBACK_ZONES = {
  brighthollow: { music: 'town', biome: 'town' },
  dawnmeadow: { music: 'meadow', biome: 'meadow' },
  whisperwood: { music: 'forest', biome: 'forest' },
  gloamcavern: { music: 'cave', biome: 'cave' },
  mirrorlake: { music: 'lake', biome: 'lake' },
  skyreach: { music: 'mountain', biome: 'mountain' },
  sunkenruins: { music: 'ruins', biome: 'ruins' },
  hollowspire: { music: 'spire', biome: 'spire' },
  starfallglade: { music: 'glade', biome: 'glade' },
};
let worldmapP = null;
let warnedWorldmap = false;

async function resolveZone(zoneId) {
  try {
    worldmapP = worldmapP || import('../data/worldmap.js');
    const { ZONES } = await worldmapP;
    const z = ZONES?.[zoneId];
    if (z) {
      return {
        music: z.ambient?.music ?? FALLBACK_ZONES[zoneId]?.music ?? 'meadow',
        biome: z.biome ?? FALLBACK_ZONES[zoneId]?.biome ?? 'meadow',
      };
    }
  } catch (e) {
    worldmapP = null; // allow a later retry
    if (!warnedWorldmap) {
      warnedWorldmap = true;
      console.warn('[audio] worldmap unavailable, using fallback zone table');
    }
  }
  return FALLBACK_ZONES[zoneId] ?? { music: 'meadow', biome: 'meadow' };
}

// ---------------------------------------------------------------------------
// Battle music state machine
// ---------------------------------------------------------------------------
function battleKindOf(p) {
  const k = p?.kind ?? p?.encounter?.kind ?? p?.config?.kind;
  return (k === 'warden' || k === 'boss') ? k : 'wild';
}

function startBattleMusic(kind) {
  const trackId = kind === 'boss' ? 'battle_boss'
    : kind === 'warden' ? 'battle_warden' : 'battle_wild';
  if (battleTrack === trackId) return;
  const first = !battleTrack; // fresh battle vs a kind correction mid-intro
  battleTrack = trackId;
  pending.track = trackId;
  if (!ctx) return;
  if (first) music.playSting(kind);
  music.crossfadeTo(trackId, first ? 0.9 : 0.6);
}

function endBattleMusic(result) {
  battleTrack = null;
  const theme = zoneTrackId || 'town';
  pending.track = theme;
  if (!ctx) return;
  const outcome = result?.outcome;
  if (outcome === 'win' || outcome === 'caught') {
    music.playOnce('victory', { returnTo: theme, fadeIn: 0.05 });
  } else if (outcome === 'loss') {
    music.playOnce('gameover', { returnTo: theme, fadeIn: 0.4 });
  } else {
    music.crossfadeTo(theme, 2.0);
  }
}

// ---------------------------------------------------------------------------
// Bus wiring
// ---------------------------------------------------------------------------
function wireBus() {
  bus.on('ui:sfx', (p) => {
    const name = typeof p === 'string' ? p : p?.name;
    if (name) sfx.play(name);
  });

  bus.on('sfx:footstep', (p) => {
    sfx.playFootstep(p?.surface ?? 'grass');
  });

  bus.on('zone:enter', async (p) => {
    const zoneId = p?.zoneId;
    if (!zoneId) return;
    const info = await resolveZone(zoneId);
    zoneTrackId = info.music;
    currentBiome = info.biome;
    pending.biome = info.biome;
    if (!battleTrack) pending.track = info.music;
    if (!ctx) return;
    if (!battleTrack) music.crossfadeTo(info.music, 1.8);
    sfx.startAmbient(info.biome, 2.5);
  });

  bus.on('battle:start', (p) => startBattleMusic(battleKindOf(p)));

  // battleFlow emits 'transition:battle' as the swirl overlay comes in; the
  // world also reuses it for portal fades — so only treat it as a battle cue
  // when the game really is in battle mode and no battle theme is playing yet.
  bus.on('transition:battle', async () => {
    if (battleTrack) return;
    try {
      const { game } = await import('../game/game.js');
      if (game.mode === 'battle') startBattleMusic('wild');
    } catch (e) { /* game module not up yet — nothing to infer */ }
  });

  bus.on('battle:end', (p) => endBattleMusic(p?.result));

  // ---- tasteful accents (rate-limited; sfx.play adds per-name limits too)
  bus.on('sigil:gained', () => sfx.play('sigil'));
  bus.on('quest:completed', () => sfx.play('quest_done'));
  bus.on('item:gained', (p) => { if ((p?.qty ?? 1) > 0) sfx.play('item_get'); });
  bus.on('glim:changed', (p) => { if ((p?.amount ?? 0) > 0) sfx.play('glim'); });

  bus.on('creature:awakened', () => {
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (t - lastAwakenAt < 6000) return; // an awakening chain plays one cue
    lastAwakenAt = t;
    if (ctx && !battleTrack) {
      music.playOnce('awakening', { returnTo: zoneTrackId || 'town', fadeIn: 0.3 });
    }
  });

  bus.on('settings:changed', (p) => {
    if (!ctx || !p) return;
    const t = ctx.currentTime;
    if (p.key === 'musicVol') musicVol.gain.setTargetAtTime(volCurve(p.value), t, 0.05);
    if (p.key === 'sfxVol') sfxVol.gain.setTargetAtTime(volCurve(p.value), t, 0.05);
  });
}
