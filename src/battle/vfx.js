// Battle VFX compositions — maps abilities/aspects to particle recipes so ANY
// ability that only carries fx hints ({anim, color, impact, sfx}) still looks
// great, with oversized variants for Resonant Bursts.
//
// Every function takes the shared `Particles` instance (P) plus plain-object
// positions ({x,y,z} or Vector3) and fires autonomous particle work, returning
// a suggested duration (seconds) the caller can await for pacing. No three.js
// imports here — this module is pure composition logic and node-testable with
// a stubbed P.
import { ASPECTS, aspectColor } from '../data/aspects.js';

// Per-aspect "linger" identity: what hangs in the air after an impact.
// kind: ember sparks | droplets | leaves | gust streaks | debris | arcs |
//       glints | bubbles | shimmer | wisps | sparks
const FAMILY = {
  ember:  { linger: 'embers',  c2: 0xffd27a, up: 1.4,  grav: -0.6, flicker: true },
  tide:   { linger: 'drops',   c2: 0xbfe8ff, up: 0.4,  grav: 5.5,  flicker: false },
  bloom:  { linger: 'leaves',  c2: 0xa9e07a, up: 0.3,  grav: 0.9,  flicker: false },
  gale:   { linger: 'gust',    c2: 0xe8fff6, up: 0.8,  grav: 0,    flicker: false },
  terra:  { linger: 'debris',  c2: 0x8a6a42, up: 0.9,  grav: 7,    flicker: false },
  volt:   { linger: 'arcs',    c2: 0xfff6b0, up: 0.6,  grav: 0,    flicker: true },
  frost:  { linger: 'glints',  c2: 0xe8f6ff, up: 0.2,  grav: 1.4,  flicker: true },
  venom:  { linger: 'bubbles', c2: 0xd8a9f0, up: 1.1,  grav: -0.4, flicker: false },
  lumen:  { linger: 'shimmer', c2: 0xfff8dc, up: 0.5,  grav: -0.2, flicker: true },
  umbra:  { linger: 'wisps',   c2: 0x4a4066, up: 0.7,  grav: -0.5, flicker: false },
  neutral:{ linger: 'sparks',  c2: 0xe8e2d4, up: 0.7,  grav: 2.5,  flicker: false },
};

export function familyOf(aspect) { return FAMILY[aspect] ?? FAMILY.neutral; }

/** Resolve a display color for a move-ish object or aspect id. */
export function colorOf(moveOrAspect) {
  if (typeof moveOrAspect === 'string') return aspectColor(moveOrAspect);
  return moveOrAspect?.fx?.color ?? aspectColor(moveOrAspect?.aspect ?? 'neutral');
}

// ------------------------------------------------------------------- impacts

/** Aspect-flavored lingering particles after a hit. scale ~1 normal, ~2 burst. */
export function linger(P, { at, aspect = 'neutral', color, scale = 1 }) {
  const f = familyOf(aspect);
  const c = color ?? aspectColor(aspect);
  const n = Math.round(10 * scale);
  switch (f.linger) {
    case 'embers':
      P.emitFountain({ at, count: n + 4, color: c, color2: f.c2, size: 0.1 * scale, life: 0.9, speed: 1.6 * scale, spread: 0.5 * scale, gravity: f.grav, sway: 0.8, flicker: true });
      break;
    case 'drops':
      P.emitBurst({ at, count: n + 6, color: c, color2: f.c2, size: 0.09 * scale, speed: 2.4 * scale, life: 0.6, gravity: f.grav, drag: 0.4, up: 1.2, additive: true });
      break;
    case 'leaves':
      P.emitBurst({ at, count: n, color: c, color2: f.c2, size: 0.12 * scale, speed: 1.7 * scale, life: 1.1, gravity: f.grav, drag: 1.8, up: 1.0, additive: false, sway: 2.2 });
      break;
    case 'gust':
      P.emitRing({ at, radius: 0.25, count: n + 8, color: c, color2: f.c2, size: 0.1 * scale, speed: 4.5 * scale, life: 0.45, rise: 0.9 });
      break;
    case 'debris':
      P.emitBurst({ at, count: n, color: 0x9a7a52, color2: f.c2, size: 0.11 * scale, speed: 3 * scale, life: 0.7, gravity: f.grav, drag: 0.6, up: 1.4, additive: false });
      P.emitBurst({ at, count: 6, color: c, size: 0.16 * scale, speed: 1.2, life: 0.6, gravity: 0.5, drag: 2, additive: true });
      break;
    case 'arcs':
      P.emitSparks({ at, count: n + 4, color: c, color2: f.c2, size: 0.08 * scale, speed: 6 * scale, life: 0.3, gravity: 0, drag: 4 });
      break;
    case 'glints':
      P.emitBurst({ at, count: n, color: c, color2: f.c2, size: 0.09 * scale, speed: 1.6 * scale, life: 0.85, gravity: f.grav, drag: 1.4, flicker: true });
      break;
    case 'bubbles':
      P.emitFountain({ at, count: n, color: c, color2: f.c2, size: 0.12 * scale, life: 0.9, speed: 1.2 * scale, spread: 0.5, gravity: f.grav, sway: 1.6 });
      break;
    case 'shimmer':
      P.emitFountain({ at, count: n + 6, color: c, color2: f.c2, size: 0.08 * scale, life: 1.1, speed: 0.9, spread: 0.8 * scale, gravity: f.grav, sway: 0.5, flicker: true });
      break;
    case 'wisps':
      P.emitFountain({ at, count: n, color: 0x2c2440, color2: c, size: 0.16 * scale, life: 0.9, speed: 0.9, spread: 0.6 * scale, gravity: f.grav, sway: 1.2, additive: false });
      P.emitFountain({ at, count: 6, color: c, size: 0.08 * scale, life: 0.8, speed: 1.1, spread: 0.5, gravity: -0.4, additive: true });
      break;
    default:
      P.emitBurst({ at, count: n, color: c, color2: f.c2, size: 0.1 * scale, speed: 2.6 * scale, life: 0.5, gravity: f.grav, drag: 1.5 });
  }
  return 0.5;
}

/** Main impact: colored core burst + shockwave ring + sparks + aspect linger. */
export function impact(P, { at, aspect = 'neutral', color, eff = 'normal', crit = false, big = false }) {
  const c = color ?? aspectColor(aspect);
  const power = (big ? 2.1 : 1) * (eff === 'super' ? 1.5 : eff === 'weak' ? 0.65 : 1) * (crit ? 1.3 : 1);
  if (eff === 'immune') {
    P.emitBurst({ at, count: 10, color: 0x9a9aa4, size: 0.12, speed: 1.4, life: 0.4, gravity: 0.5, drag: 3, additive: false });
    return 0.3;
  }
  // hot core
  P.emitBurst({ at, count: Math.round(16 * power), color: 0xffffff, color2: c, size: 0.2 * power, sizeEnd: 0.03, speed: 4.2 * power, life: 0.34, gravity: 1.5, drag: 3.5 });
  // sparks
  P.emitBurst({ at, count: Math.round(10 * power), color: c, size: 0.08, speed: 7 * power, life: 0.42, gravity: 5, drag: 1.2 });
  // ground shockwave
  P.emitRing({ at: { x: at.x, y: 0.05, z: at.z }, radius: 0.3, count: Math.round(30 * Math.min(power, 1.6)), color: c, color2: 0xffffff, size: 0.11, speed: (big ? 9 : 5.5) * Math.min(power, 1.5), life: 0.4 });
  linger(P, { at, aspect, color: c, scale: power });
  if (crit) P.emitBurst({ at, count: 12, color: 0xffe9b0, size: 0.14, speed: 8, life: 0.3, gravity: 0, drag: 2, flicker: true });
  return big ? 0.65 : 0.45;
}

// ------------------------------------------------------------ move signatures

/** Conjure glow: motes converge inward toward a charge point. */
export function conjure(P, { at, color = 0xffe9b0, dur = 0.25 }) {
  // converge = spawn on a shell, gravity pulls each mote back to the center
  for (let i = 0; i < 16; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = (Math.random() - 0.5) * Math.PI;
    const r = 0.9 + Math.random() * 0.5;
    const sx = at.x + Math.cos(th) * Math.cos(ph) * r;
    const sy = at.y + Math.sin(ph) * r;
    const sz = at.z + Math.sin(th) * Math.cos(ph) * r;
    P.emitBurst({ at: { x: sx, y: sy, z: sz }, count: 1, color, size: 0.11, speed: 0.01, life: dur + 0.1, gravity: -((sy - at.y) / (dur + 0.1)), drag: 0, up: 0 });
  }
  // simpler readable core: swelling glow at the point
  P.emitFountain({ at, count: 10, color, color2: 0xffffff, size: 0.14, life: dur + 0.15, speed: 0.3, spread: 0.25, gravity: 0, sway: 0.4, flicker: true });
  return dur;
}

/** Ground-up eruption at a target (fx.anim 'burst'). */
export function eruption(P, { at, aspect = 'terra', color, big = false }) {
  const c = color ?? aspectColor(aspect);
  const s = big ? 1.8 : 1;
  P.emitFountain({ at: { x: at.x, y: 0.05, z: at.z }, count: Math.round(30 * s), color: c, color2: 0xffffff, size: 0.17 * s, life: 0.8, speed: 5.5 * s, spread: 0.6 * s, gravity: 7 });
  P.emitRing({ at: { x: at.x, y: 0.06, z: at.z }, radius: 0.4, count: 40, color: c, size: 0.13 * s, speed: 6.5 * s, life: 0.5 });
  linger(P, { at, aspect, color: c, scale: s });
  return 0.55;
}

/** Rising (buff) or sinking (debuff) aura spiral around a creature. */
export function auraSpiral(P, { at, color = 0xffe9b0, up = true, height = 1.2, dur = 0.65 }) {
  const turns = 26;
  for (let i = 0; i < turns; i++) {
    const t = i / turns;
    const th = t * Math.PI * 4 + Math.random() * 0.2;
    const r = 0.55 + 0.15 * Math.sin(t * 9);
    const y = up ? at.y - height * 0.45 + t * 0.2 : at.y + height * 0.55 - t * 0.2;
    P.emitBurst({
      at: { x: at.x + Math.cos(th) * r, y, z: at.z + Math.sin(th) * r },
      count: 1, color, color2: 0xffffff, size: 0.12, speed: 0.05,
      life: dur * (0.5 + t * 0.7), gravity: up ? -2.2 : 2.2, drag: 0.3, up: 0, flicker: true,
    });
  }
  return dur;
}

/** Arena-wide wash for 'field' moves — an expanding tinted wave. */
export function fieldWash(P, { at = { x: 0, y: 0.2, z: 0 }, color = 0xffe9b0, radius = 11 }) {
  P.emitRing({ at, radius: 0.5, count: 64, color, color2: 0xffffff, size: 0.16, speed: radius * 1.15, life: 0.85, rise: 0.5 });
  P.emitRing({ at, radius: 0.5, count: 40, color, size: 0.1, speed: radius * 0.8, life: 1.0, rise: 1.3 });
  return 0.9;
}

/** Song: glowing note-motes streaming from singer toward the foe in a lilt. */
export function songNotes(P, { from, to, color = 0xffd9f0, dur = 0.85 }) {
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    const y = from.y + 0.4 + Math.sin(t * Math.PI) * 1.1 + Math.sin(t * 9) * 0.18;
    P.emitBurst({ at: { x, y, z }, count: 2, color, color2: 0xffffff, size: 0.13, speed: 0.25, life: 0.55 + t * 0.4, gravity: -0.5, drag: 0.5, sway: 1.8, flicker: true });
  }
  return dur;
}

// ------------------------------------------------------------------ statuses
const STATUS_FX = {
  burn:      { color: 0xff7a3c, style: 'embers' },
  soak:      { color: 0x4fa8ff, style: 'drops' },
  root:      { color: 0x6fce5c, style: 'roots' },
  shock:     { color: 0xffd94f, style: 'arcs' },
  frostbite: { color: 0xa8d8ff, style: 'glints' },
  venom:     { color: 0xb06fd8, style: 'bubbles' },
  blind:     { color: 0x4a4258, style: 'puff' },
  dread:     { color: 0x7a6f9e, style: 'sink' },
};

/** Status application / tick flourish at a creature. mini=true for ticks. */
export function statusBurst(P, status, at, mini = false) {
  const fx = STATUS_FX[status] ?? { color: 0xc8c2b8, style: 'puff' };
  const s = mini ? 0.55 : 1;
  switch (fx.style) {
    case 'embers':
      P.emitFountain({ at, count: Math.round(12 * s), color: fx.color, color2: 0xffd27a, size: 0.1 * s, life: 0.8, speed: 1.5, spread: 0.5, gravity: -0.7, flicker: true });
      break;
    case 'drops':
      P.emitBurst({ at: { x: at.x, y: at.y + 0.8, z: at.z }, count: Math.round(14 * s), color: fx.color, size: 0.09, speed: 1.2, life: 0.7, gravity: 5, drag: 0.3, up: 0.4 });
      break;
    case 'roots':
      P.emitRing({ at: { x: at.x, y: 0.06, z: at.z }, radius: 0.5, count: Math.round(24 * s), color: fx.color, color2: 0x2f6b2f, size: 0.12, speed: 0.7, life: 0.8, rise: 1.6 });
      break;
    case 'arcs':
      P.emitBurst({ at, count: Math.round(14 * s), color: fx.color, color2: 0xffffff, size: 0.07, speed: 5, life: 0.3, drag: 3, flicker: true });
      break;
    case 'glints':
      P.emitBurst({ at, count: Math.round(12 * s), color: fx.color, color2: 0xffffff, size: 0.09, speed: 1.1, life: 0.9, gravity: 0.9, drag: 1.5, flicker: true });
      break;
    case 'bubbles':
      P.emitFountain({ at, count: Math.round(10 * s), color: fx.color, color2: 0xd8a9f0, size: 0.12, life: 0.9, speed: 1.1, spread: 0.5, gravity: -0.4, sway: 1.8 });
      break;
    case 'sink':
      P.emitFountain({ at: { x: at.x, y: at.y + 1.0, z: at.z }, count: Math.round(12 * s), color: 0x2c2440, color2: fx.color, size: 0.15, life: 0.8, speed: -1.4, spread: 0.6, gravity: -1.6, additive: false });
      break;
    default: // puff
      P.emitBurst({ at, count: Math.round(10 * s), color: fx.color, size: 0.14, speed: 1.2, life: 0.5, gravity: 0.2, drag: 2.5, additive: false });
  }
  return mini ? 0.3 : 0.45;
}

export function statusColor(status) { return (STATUS_FX[status] ?? { color: 0xc8c2b8 }).color; }

// -------------------------------------------------------------- stat / heals

/** Rising gold chevrons (delta>0) or sinking indigo (delta<0). */
export function statStageFx(P, { at, delta = 1, height = 1.2 }) {
  const up = delta > 0;
  const color = up ? 0xffd94f : 0x6f7ae0;
  const n = 10 + Math.abs(delta) * 5;
  for (let i = 0; i < n; i++) {
    const th = Math.random() * Math.PI * 2;
    const r = 0.4 + Math.random() * 0.35;
    P.emitBurst({
      at: { x: at.x + Math.cos(th) * r, y: up ? at.y - height * 0.4 : at.y + height * 0.5, z: at.z + Math.sin(th) * r },
      count: 1, color, color2: 0xffffff, size: 0.13, speed: 0.05,
      life: 0.55 + Math.random() * 0.3, gravity: up ? -3.2 : 3.2, drag: 0.2,
    });
  }
  return 0.45;
}

export function healFx(P, { at, height = 1 }) {
  P.emitFountain({ at, count: 20, color: 0x9dffb0, color2: 0xfff8dc, size: 0.12, life: 0.9, speed: 1.8, spread: 0.6, gravity: -0.6, sway: 0.8, flicker: true });
  P.emitRing({ at: { x: at.x, y: 0.06, z: at.z }, radius: 0.4, count: 22, color: 0x9dffb0, size: 0.1, speed: 1.6, life: 0.6, rise: 1.2 });
  return 0.5;
}

// -------------------------------------------------------- send / faint / catch

/** Charm-light materialize column on send-in. */
export function materialize(P, { at, color = 0xffe9b0, height = 1 }) {
  P.emitFountain({ at, count: 26, color, color2: 0xffffff, size: 0.13, life: 0.7, speed: 2.4 + height, spread: 0.35, gravity: 0.5, flicker: true });
  P.emitRing({ at: { x: at.x, y: 0.05, z: at.z }, radius: 0.25, count: 30, color, size: 0.11, speed: 3.2, life: 0.45 });
  return 0.55;
}

/** Dissolve-to-motes on faint / recall. */
export function dissolve(P, { at, color = 0x9a9aa4, height = 1, count = 34 }) {
  for (let i = 0; i < count; i++) {
    const th = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.5;
    P.emitBurst({
      at: { x: at.x + Math.cos(th) * r, y: at.y + Math.random() * height, z: at.z + Math.sin(th) * r },
      count: 1, color, color2: 0xffe9b0, size: 0.12, speed: 0.15,
      life: 0.8 + Math.random() * 0.6, gravity: -1.1, drag: 0.4, sway: 0.7, flicker: true,
    });
  }
  return 0.8;
}

/** Catch: seal burst on success. */
export function sealBurst(P, { at }) {
  P.emitRing({ at, radius: 0.15, count: 40, color: 0xffe9b0, color2: 0xffffff, size: 0.12, speed: 3.4, life: 0.55 });
  P.emitBurst({ at, count: 18, color: 0xfff8dc, size: 0.12, speed: 2.2, life: 0.7, gravity: 0.8, drag: 1.5, flicker: true });
  return 0.6;
}

/** Catch: burst-out on failure. */
export function breakOut(P, { at, color = 0xffffff }) {
  P.emitBurst({ at, count: 26, color: 0xffffff, color2: color, size: 0.18, sizeEnd: 0.03, speed: 5, life: 0.4, gravity: 1.5, drag: 2.5 });
  return 0.35;
}

// -------------------------------------------------------------------- bursts

// Which of the 5 signature burst compositions each of the 10 aspects uses —
// mapped to the nearest family identity.
const BURST_FAMILY = {
  ember: 'ember', terra: 'ember',
  tide: 'tide', frost: 'tide',
  volt: 'volt', gale: 'volt',
  lumen: 'lumen', bloom: 'lumen', neutral: 'lumen',
  umbra: 'umbra', venom: 'umbra',
};

/**
 * Resonant Burst signature: multi-stage oversized sequence with a DISTINCT
 * composition per aspect family (ember pillar, tide rings, volt strike,
 * lumen rays, umbra implosion). Stage timings are the caller's await budget:
 * total ≈ 1.3s of emission.
 */
export function burstSignature(P, { at, target, aspect = 'neutral', color }) {
  const c = color ?? aspectColor(aspect);
  const fam = BURST_FAMILY[aspect] ?? 'lumen';
  // shared charge-up: gathering vortex around the user
  auraSpiral(P, { at, color: c, up: true, height: 1.6, dur: 0.6 });
  P.emitFountain({ at, count: 22, color: c, color2: 0xffffff, size: 0.15, life: 0.6, speed: 1.2, spread: 0.9, gravity: -1.5, flicker: true });

  switch (fam) {
    case 'ember': { // roaring pillar + drifting embers + scorch ring
      P.emitFountain({ at: { x: at.x, y: 0.05, z: at.z }, count: 44, color: 0xffffff, color2: c, size: 0.22, life: 0.9, speed: 8.5, spread: 0.35, gravity: 2.2, flicker: true });
      P.emitFountain({ at, count: 26, color: c, color2: 0xffd27a, size: 0.11, life: 1.3, speed: 2.4, spread: 0.9, gravity: -0.8, sway: 1.1, flicker: true });
      P.emitRing({ at: { x: at.x, y: 0.08, z: at.z }, radius: 0.4, count: 50, color: c, color2: 0xffffff, size: 0.15, speed: 8, life: 0.6 });
      break;
    }
    case 'tide': { // stacked rising rings + crown spray
      for (let k = 0; k < 3; k++) {
        P.emitRing({ at: { x: at.x, y: 0.08 + k * 0.55, z: at.z }, radius: 0.35 + k * 0.2, count: 40 - k * 8, color: c, color2: 0xbfe8ff, size: 0.14, speed: 4.5 - k, life: 0.55 + k * 0.18, rise: 1.6 });
      }
      P.emitBurst({ at: { x: at.x, y: at.y + 1.4, z: at.z }, count: 30, color: 0xffffff, color2: c, size: 0.1, speed: 3.2, life: 0.8, gravity: 6, drag: 0.4, up: 1.6 });
      break;
    }
    case 'volt': { // sky-strike column + crackling stretched arcs
      for (let i = 0; i < 12; i++) {
        const t = i / 11;
        P.emitBurst({ at: { x: at.x + (Math.random() - 0.5) * 0.22, y: 3.8 - t * 3.6, z: at.z + (Math.random() - 0.5) * 0.22 }, count: 3, color: 0xffffff, color2: c, size: 0.16, speed: 0.4, life: 0.28 + t * 0.12, gravity: 0, drag: 2, flicker: true });
      }
      P.emitSparks({ at: { x: at.x, y: at.y + 0.4, z: at.z }, count: 22, color: c, color2: 0xfff6b0, size: 0.1, speed: 8, life: 0.35, drag: 2.5 });
      P.emitRing({ at: { x: at.x, y: 0.08, z: at.z }, radius: 0.3, count: 44, color: c, color2: 0xffffff, size: 0.13, speed: 9, life: 0.5 });
      break;
    }
    case 'umbra': { // implosion (inward-collapsing ring) + expanding void ring
      P.emitRing({ at: { x: at.x, y: at.y + 0.6, z: at.z }, radius: 2.1, count: 52, color: c, color2: 0x2c2440, size: 0.15, speed: -4.2, life: 0.5, rise: 0.1 });
      P.emitRing({ at: { x: at.x, y: 0.08, z: at.z }, radius: 0.4, count: 48, color: 0x2c2440, color2: c, size: 0.2, speed: 7, life: 0.65, additive: false });
      P.emitFountain({ at, count: 18, color: 0x2c2440, color2: c, size: 0.17, life: 1.0, speed: 1.4, spread: 0.7, gravity: -1.2, sway: 1.4, additive: false });
      break;
    }
    default: { // lumen: radiant rays fanning out at chest height + glitter
      const rays = 9;
      for (let r = 0; r < rays; r++) {
        const th = (r / rays) * Math.PI * 2;
        for (let j = 1; j <= 4; j++) {
          P.emitBurst({ at: { x: at.x + Math.cos(th) * j * 0.4, y: at.y + 0.5 + j * 0.08, z: at.z + Math.sin(th) * j * 0.4 }, count: 1, color: 0xffffff, color2: c, size: 0.15 - j * 0.015, speed: 0.1, life: 0.4 + j * 0.1, gravity: -0.2, drag: 1, flicker: true });
        }
      }
      P.emitFountain({ at, count: 26, color: c, color2: 0xfff8dc, size: 0.09, life: 1.2, speed: 1.1, spread: 1.1, gravity: -0.4, sway: 0.6, flicker: true });
      P.emitRing({ at: { x: at.x, y: 0.08, z: at.z }, radius: 0.4, count: 48, color: c, color2: 0xffffff, size: 0.14, speed: 8.5, life: 0.6 });
      break;
    }
  }

  // lance of motes toward the target
  if (target) {
    const steps = 18;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      P.emitBurst({
        at: { x: at.x + (target.x - at.x) * t, y: at.y + 0.6 + Math.sin(t * Math.PI) * 0.9, z: at.z + (target.z - at.z) * t },
        count: 2, color: c, color2: 0xffffff, size: 0.16, speed: 0.6, life: 0.4 + t * 0.35, gravity: 0, drag: 1, flicker: true,
      });
    }
  }
  linger(P, { at: target ?? at, aspect, color: c, scale: 2 });
  return 1.25;
}

// -------------------------------------------------------------- aura ambients

/** Looping battlefield aura ambience. Returns handle { stop() }. */
export function auraAmbient(P, kind, radius = 10) {
  switch (kind) {
    case 'emberhaze':
      return P.ambient({ center: { x: 0, y: 0, z: 0 }, radius, y0: 0.1, y1: 2.6, rate: 9, color: 0xff7a3c, color2: 0xffd27a, size: 0.09, life: 2.6, vel: { x: 0.2, y: 0.55, z: 0 }, sway: 0.8, flicker: true });
    case 'tidesurge':
      return P.ambient({ center: { x: 0, y: 0, z: 0 }, radius, y0: 0.05, y1: 1.4, rate: 8, color: 0x4fa8ff, color2: 0xbfe8ff, size: 0.2, life: 3.2, vel: { x: 0.35, y: 0.08, z: 0.1 }, sway: 0.5, additive: true });
    case 'gloom':
      return P.ambient({ center: { x: 0, y: 0, z: 0 }, radius, y0: 0.2, y1: 2.2, rate: 6, color: 0x2c2440, color2: 0x7a6f9e, size: 0.26, life: 3.6, vel: { x: 0.12, y: 0.12, z: 0 }, sway: 0.9, additive: false });
    default:
      return P.ambient({ center: { x: 0, y: 0, z: 0 }, radius, rate: 3, color: 0xfff6c8, size: 0.08, life: 3 });
  }
}

/** Weak gray wisp loop that clings to a Hollowed creature. */
export function hollowedAura(P, getPos) {
  return P.ambient({ getCenter: getPos, radius: 0.55, y0: 0.1, y1: 1.2, rate: 3.2, color: 0x9a9aa4, color2: 0xd8d8e2, size: 0.11, life: 1.6, vel: { x: 0, y: 0.35, z: 0 }, sway: 0.9, flicker: true });
}
