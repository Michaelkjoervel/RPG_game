// =============================================================================
// LUMENFALL — src/creatures/animator.js
// Procedural creature animator. No THREE.AnimationClips anywhere: every pose
// is a spring/sine function of time, evaluated fresh each frame. This is what
// makes every Kindred feel alive even though there are 48 of them and nobody
// hand-keyframed a single one.
// =============================================================================
//
// USAGE (see any src/creatures/models/*.js for a full example):
//   const animator = new CreatureAnimator(group, { parts, hints });
//   animator.play('walk');
//   // ...every frame:
//   animator.update(dt);
//
// THE `parts` CONTRACT — everything is optional; only pass what your model
// actually has. Object references, not names/paths — grab them straight from
// the objects your build_<id>(kit) function created.
//   {
//     body:    Object3D             // breathes (idle), squashes (attack anticipation), tips over (faint)
//     head:    Object3D             // slow idle look-around, "listens" toward attacks
//     jaw:     Object3D             // opens on attack anticipation / roar-like specials
//     eyelids: Object3D[]           // each blinked by scaling .y — see kit.eye()'s 'eyelid' child
//     tail:    Object3D[]           // pivots root→tip (kit.tailChain().pivots) — waved in sequence
//     wings:   Object3D[][]         // one array per wing, each root→tip bone chain (kit.wing().bones)
//     legs:    {hip,knee,foot}[]    // kit.leg() results — walk cycle drives hip/knee rotation
//     accents: Object3D[]           // ears/horns/fins/static decoration — animator sways/twitches these
//     fx:      {update(dt):void}[]  // flame/mote/heartspark/pulsing-crystal — ticked every frame, NOT swayed
//   }
// `accents` vs `fx`: accents are ordinary static parts the animator moves FOR
// you (gentle idle sway with per-index phase offset). fx are self-driving
// helpers from kit.js that already know how to animate themselves — the
// animator just calls their `.update(dt)` and leaves their transform alone.
//
// THE `hints` CONTRACT (all optional, sane defaults given):
//   {
//     personality: 'eager'|'calm'|'heavy'|'regal'|'skittish'|'sleepy' (default 'calm')
//     locomotion:  'quad'|'biped'|'serpent'|'fly'|'float'|'hop' (default: inferred from parts)
//     hover:       boolean          // idle bob even with no legs / while grounded (default: inferred)
//     hoverAmp:    number           // hover bob amplitude in world units (default 0.05)
//     breathAmp:   number           // multiplier on idle breathing scale (default 1)
//     blinkEvery:  number           // average seconds between blinks (default ~3.2, personality-scaled)
//   }
//
// STATES — play(name): 'idle'|'walk'|'attack'|'special'|'hit'|'faint'|'happy'|'sleep'.
// idle/walk/happy/sleep LOOP continuously (their phase is the animator's
// global clock, so re-entering one never pops). attack/special/hit/faint are
// ENVELOPES timed from the moment you called play() (their phase resets to
// 0), rising through an anticipation/impact/settle arc and then holding — EXCEPT
// hit/attack/special quietly blend a faint breathing loop back in once their
// envelope settles, so a creature never looks frozen if a caller forgets to
// return it to 'idle'. faint is the one exception: it holds motionless, as a
// fainted creature should.
// =============================================================================

import { clamp01, lerp } from '../core/math.js';
import { hashStr } from '../core/rng.js';

const ONE_SHOT = new Set(['attack', 'special', 'hit', 'faint']);

const PERSONALITY = {
  eager: { freq: 1.35, amp: 1.15, blink: 0.8, settle: 1.3, lean: 1.15 },
  calm: { freq: 0.85, amp: 0.9, blink: 1.1, settle: 0.9, lean: 0.9 },
  heavy: { freq: 0.6, amp: 1.3, blink: 1.3, settle: 0.65, lean: 0.7 },
  regal: { freq: 0.75, amp: 0.85, blink: 1.0, settle: 0.85, lean: 1.0 },
  skittish: { freq: 1.6, amp: 0.8, blink: 0.6, settle: 1.6, lean: 1.3 },
  sleepy: { freq: 0.5, amp: 0.7, blink: 1.8, settle: 0.5, lean: 0.6 },
};

function resolveLocomotion(hints, parts) {
  if (hints.locomotion) return hints.locomotion;
  if (parts.wings && parts.wings.length) return 'fly';
  if (hints.hover) return 'float';
  const legN = parts.legs ? parts.legs.length : 0;
  if (legN >= 4) return 'quad';
  if (legN >= 2) return 'biped';
  if (parts.tail && parts.tail.length > 3 && !legN) return 'serpent';
  return 'float';
}

// A quick, cheap "blink envelope": mostly 0 (open), a fast 0->1->0 pulse near
// each blinkT multiple (+ a little per-instance jitter so a pack doesn't
// blink in unison).
function blinkPulse(t, interval, jitterSeed) {
  const period = interval + (Math.sin(jitterSeed * 12.9) * 0.35 + 0.35) * interval * 0.4;
  const local = t % period;
  const dur = 0.12;
  if (local > dur) return 0;
  const p = local / dur; // 0..1 across the blink
  return p < 0.5 ? p * 2 : (1 - p) * 2; // triangle pulse, peaks at 1
}

// Layered sine "idle wander" for heads/ears — reads as natural attention
// shifts without a discrete random-target state machine.
function wander(t, freq, seedA, seedB) {
  return Math.sin(t * 0.22 * freq + seedA) * 0.55 + Math.sin(t * 0.075 * freq + seedB) * 0.45;
}

/**
 * Builds the fixed, allocation-free list of animatable entries from a parts
 * object. Called once in the constructor — update() never allocates.
 */
function buildEntries(parts) {
  const entries = [];
  const push = (obj, kind, extra) => { if (obj) entries.push({ obj, kind, ...extra }); };
  push(parts.body, 'body');
  push(parts.head, 'head');
  push(parts.jaw, 'jaw');
  (parts.eyelids || []).forEach((o, i) => push(o, 'eyelid', { i, n: (parts.eyelids || []).length }));
  (parts.tail || []).forEach((o, i) => push(o, 'tail', { i, n: (parts.tail || []).length }));
  (parts.wings || []).forEach((chain, w) => (chain || []).forEach((o, i) => push(o, 'wing', { w, i, n: chain.length })));
  (parts.legs || []).forEach((leg, li) => {
    push(leg.hip, 'legHip', { li, n: (parts.legs || []).length });
    push(leg.knee, 'legKnee', { li, n: (parts.legs || []).length });
  });
  (parts.accents || []).forEach((o, i) => push(o, 'accent', { i, n: (parts.accents || []).length }));
  for (const e of entries) {
    e.px0 = e.obj.position.x; e.py0 = e.obj.position.y; e.pz0 = e.obj.position.z;
    e.rx0 = e.obj.rotation.x; e.ry0 = e.obj.rotation.y; e.rz0 = e.obj.rotation.z;
    e.sx0 = e.obj.scale.x || 1; e.sy0 = e.obj.scale.y || 1; e.sz0 = e.obj.scale.z || 1;
  }
  return entries;
}

export class CreatureAnimator {
  /**
   * @param {THREE.Object3D} group - the creature root (registry.js already
   *   has it; models don't normally construct this themselves)
   * @param {object} opts
   * @param {object} [opts.parts] - see file header
   * @param {object} [opts.hints] - see file header
   */
  constructor(group, { parts = {}, hints = {} } = {}) {
    this.group = group;
    this.parts = parts;
    this.hints = {
      personality: 'calm', locomotion: null, hover: false, hoverAmp: 0.05, breathAmp: 1, blinkEvery: 3.2,
      ...hints,
    };
    this.hollowed = !!(group && group.userData && group.userData.hollowed);
    this._loco = resolveLocomotion(this.hints, parts);
    this._seed = hashStr((group && group.name) || 'creature') / 0xffffffff;

    this.state = 'idle';
    this.t = 0;
    this.stateTime = 0;
    this._blendT = 0;
    this._blendDur = 0;

    this._entries = buildEntries(parts);
    this._blendFrom = new Float32Array(this._entries.length * 9);
    this._P = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  }

  /**
   * Switch animation state, crossfading smoothly from wherever the creature
   * currently is (captured as a literal transform snapshot, not recomputed —
   * this keeps blending correct even mid-blend).
   * @param {'idle'|'walk'|'attack'|'special'|'hit'|'faint'|'happy'|'sleep'} name
   * @param {object} [opts] {fade=0.22}
   */
  play(name, opts = {}) {
    const fn = STATE_FN[name] ? name : 'idle';
    const { fade = 0.22 } = opts;
    if (fn === this.state && !ONE_SHOT.has(fn)) return; // looping states: no-op re-entry, keep phase
    // Snapshot current literal transforms for the outgoing blend.
    for (let i = 0; i < this._entries.length; i++) {
      const e = this._entries[i], b = i * 9;
      this._blendFrom[b + 0] = e.obj.position.x; this._blendFrom[b + 1] = e.obj.position.y; this._blendFrom[b + 2] = e.obj.position.z;
      this._blendFrom[b + 3] = e.obj.rotation.x; this._blendFrom[b + 4] = e.obj.rotation.y; this._blendFrom[b + 5] = e.obj.rotation.z;
      this._blendFrom[b + 6] = e.obj.scale.x; this._blendFrom[b + 7] = e.obj.scale.y; this._blendFrom[b + 8] = e.obj.scale.z;
    }
    this._blendT = 0;
    this._blendDur = Math.max(fade, 0.001);
    this.state = fn;
    if (ONE_SHOT.has(fn)) this.stateTime = 0;
  }

  /** Advance the animation by dt seconds. Zero per-frame allocation. */
  update(dt) {
    if (dt <= 0) return;
    this.t += dt;
    this.stateTime += dt;
    if (this._blendDur > 0) {
      this._blendT += dt;
      if (this._blendT >= this._blendDur) this._blendDur = 0;
    }
    const w = this._blendDur > 0 ? clamp01(this._blendT / this._blendDur) : 1;
    const wEase = w * w * (3 - 2 * w); // smoothstep, allocation-free
    const fn = STATE_FN[this.state] || STATE_FN.idle;
    const entries = this._entries;
    const P = this._P;
    for (let idx = 0; idx < entries.length; idx++) {
      const e = entries[idx];
      P.px = 0; P.py = 0; P.pz = 0; P.rx = 0; P.ry = 0; P.rz = 0; P.sx = 1; P.sy = 1; P.sz = 1;
      fn(e, this, P);
      let px = e.px0 + P.px, py = e.py0 + P.py, pz = e.pz0 + P.pz;
      let rx = e.rx0 + P.rx, ry = e.ry0 + P.ry, rz = e.rz0 + P.rz;
      let sx = e.sx0 * P.sx, sy = e.sy0 * P.sy, sz = e.sz0 * P.sz;
      if (wEase < 1) {
        const b = idx * 9;
        px = lerp(this._blendFrom[b + 0], px, wEase); py = lerp(this._blendFrom[b + 1], py, wEase); pz = lerp(this._blendFrom[b + 2], pz, wEase);
        rx = lerp(this._blendFrom[b + 3], rx, wEase); ry = lerp(this._blendFrom[b + 4], ry, wEase); rz = lerp(this._blendFrom[b + 5], rz, wEase);
        sx = lerp(this._blendFrom[b + 6], sx, wEase); sy = lerp(this._blendFrom[b + 7], sy, wEase); sz = lerp(this._blendFrom[b + 8], sz, wEase);
      }
      e.obj.position.set(px, py, pz);
      e.obj.rotation.set(rx, ry, rz);
      e.obj.scale.set(sx, sy, sz);
    }
    const fx = this.parts.fx;
    if (fx) for (let i = 0; i < fx.length; i++) fx[i].update(dt);
  }
}

// ---------------------------------------------------------------- Per-kind pose helpers
// Every STATE_FN below is `(entry, anim, P) => void`, writing OFFSETS (pos/rot
// as radians/units relative to rest, scale as a multiplier) into the shared
// scratch object P. anim carries .t (global loop clock), .stateTime (time
// since last play() call), .hints, .hollowed, ._loco, ._seed.

function personalityOf(anim) { return PERSONALITY[anim.hints.personality] || PERSONALITY.calm; }

// Small deterministic per-index phase so packs of similar parts (legs, tail
// segments, wing bones, eyelids) don't move in lockstep.
function idxPhase(anim, e) { return anim._seed * 9.7 + (e.i || 0) * 1.7 + (e.w || 0) * 2.3 + (e.li || 0) * 2.1; }

function hollowJitter(anim, e, P, amount = 1) {
  if (!anim.hollowed) return;
  const t = anim.t, ph = idxPhase(anim, e) * 3.1;
  const j = (Math.sin(t * 23 + ph) + Math.sin(t * 31.7 + ph * 1.4) * 0.6) * 0.003 * amount;
  P.px += j; P.rz += j * 4;
}

function applyBlink(entry, anim, P) {
  const pers = personalityOf(anim);
  const interval = anim.hints.blinkEvery * pers.blink * (anim.hollowed ? 1.7 : 1);
  const b = blinkPulse(anim.t, interval, anim._seed + (entry.i || 0) * 3.3);
  P.sy = lerp(1, 6, b); // scale up from the ~0.06 rest sliver toward ~full coverage
  hollowJitter(anim, entry, P, 0.5);
}

function applyTail(entry, anim, P, baseAmp, baseFreq) {
  const pers = personalityOf(anim);
  const n = Math.max(1, entry.n);
  const along = entry.i / n;
  const phase = anim.t * baseFreq * pers.freq - along * 2.4;
  P.ry = Math.sin(phase) * baseAmp * pers.amp * (0.5 + along * 0.8);
  P.rx = Math.sin(phase * 0.6 + 1.1) * baseAmp * 0.35 * pers.amp;
  hollowJitter(anim, entry, P);
}

function applyWing(entry, anim, P, flapAmp, flapFreq, phaseOffset = 0) {
  const dir = entry.w % 2 === 0 ? 1 : -1; // alternate left/right feel even if geometry is separately mirrored
  const phase = anim.t * flapFreq - entry.i * 0.5 + phaseOffset;
  P.rz = dir * Math.sin(phase) * flapAmp * (0.6 + entry.i * 0.35);
  hollowJitter(anim, entry, P, 0.6);
}

function applyAccentIdle(entry, anim, P) {
  const pers = personalityOf(anim);
  const ph = idxPhase(anim, entry);
  P.rz = Math.sin(anim.t * 1.1 * pers.freq + ph) * 0.06 * pers.amp;
  P.ry = Math.sin(anim.t * 0.7 * pers.freq + ph * 1.3) * 0.05 * pers.amp;
  // occasional sharper "twitch" using a peaked sine power — cheap, no branching state
  const twitch = Math.pow(Math.max(0, Math.sin(anim.t * 0.9 * pers.freq + ph * 2.1)), 9);
  P.rz += twitch * 0.18 * (anim.hints.personality === 'skittish' ? 1.6 : 1);
  hollowJitter(anim, entry, P, 0.7);
}

// ---------------------------------------------------------------------- idle

function idleFn(e, anim, P) {
  const pers = personalityOf(anim);
  const breath = Math.sin(anim.t * 1.55 * pers.freq + anim._seed) * 0.028 * pers.amp * anim.hints.breathAmp;
  switch (e.kind) {
    case 'body': {
      P.sy = 1 + breath;
      P.sx = 1 - breath * 0.4;
      P.sz = 1 - breath * 0.4;
      if (anim.hints.hover || anim._loco === 'float') P.py += Math.sin(anim.t * 1.1 * pers.freq + anim._seed) * anim.hints.hoverAmp;
      else if (anim.hints.personality === 'heavy') P.ry = Math.sin(anim.t * 0.35 * pers.freq) * 0.02; // slow weight shift
      hollowJitter(anim, e, P);
      break;
    }
    case 'head': {
      P.ry = wander(anim.t, pers.freq, anim._seed, anim._seed * 1.7 + 4) * 0.22;
      P.rx = Math.sin(anim.t * 0.5 * pers.freq + anim._seed) * 0.05;
      hollowJitter(anim, e, P);
      break;
    }
    case 'jaw':
      P.rx = Math.sin(anim.t * 1.6 * pers.freq + anim._seed) * 0.015;
      break;
    case 'eyelid': applyBlink(e, anim, P); break;
    case 'tail': applyTail(e, anim, P, 0.22, 1.1); break;
    case 'wing': {
      if (anim._loco === 'fly') applyWing(e, anim, P, 0.18, 2.6);
      else { P.rz = Math.sin(anim.t * 0.9 * pers.freq + e.w * 1.3) * 0.05; hollowJitter(anim, e, P, 0.5); }
      break;
    }
    case 'legHip': {
      const li = e.li;
      P.rx = Math.sin(anim.t * 0.6 * pers.freq + li * 2) * 0.02 * (anim.hints.personality === 'heavy' ? 1.4 : 1);
      hollowJitter(anim, e, P, 0.4);
      break;
    }
    case 'legKnee': hollowJitter(anim, e, P, 0.3); break;
    case 'accent': applyAccentIdle(e, anim, P); break;
  }
}

// ---------------------------------------------------------------------- walk

function walkFn(e, anim, P) {
  const pers = personalityOf(anim);
  const speed = 6.2 * pers.freq;
  const cyc = anim.t * speed;
  switch (e.kind) {
    case 'body': {
      if (anim._loco === 'serpent') { P.pz = 0; P.ry = Math.sin(cyc * 0.5) * 0.06; }
      else if (anim._loco === 'fly') { P.py = Math.sin(cyc) * 0.05; P.rx = -0.08 - Math.sin(cyc) * 0.03; }
      else if (anim._loco === 'hop') { const h = Math.max(0, Math.sin(cyc * 0.5)); P.py = h * 0.09; P.sy = 1 - h * 0.08; P.sx = 1 + h * 0.05; }
      else { P.py = Math.abs(Math.sin(cyc)) * 0.028; P.rz = Math.sin(cyc) * 0.02; }
      P.rx = (P.rx || 0) + 0.04 * pers.lean; // forward lean while moving
      hollowJitter(anim, e, P);
      break;
    }
    case 'head':
      P.ry = Math.sin(cyc * 0.5) * 0.06;
      P.rx = -0.03 + Math.sin(cyc) * 0.015;
      break;
    case 'jaw': break;
    case 'eyelid': applyBlink(e, anim, P); break;
    case 'tail':
      if (anim._loco === 'serpent') applyTail(e, anim, P, 0.5, 1.4);
      else applyTail(e, anim, P, 0.3, 1.1);
      break;
    case 'wing':
      if (anim._loco === 'fly') applyWing(e, anim, P, 0.62, 7.5);
      else { P.rz = Math.sin(cyc * 0.5 + e.w) * 0.08; }
      break;
    case 'legHip': {
      const pairPhase = (e.li % 2 === 0 ? 0 : Math.PI) + (e.li >= 2 ? Math.PI : 0) * (anim._loco === 'quad' ? 1 : 0);
      P.rx = Math.sin(cyc + pairPhase) * 0.55;
      break;
    }
    case 'legKnee': {
      const pairPhase2 = (e.li % 2 === 0 ? 0 : Math.PI) + (e.li >= 2 ? Math.PI : 0) * (anim._loco === 'quad' ? 1 : 0);
      P.rx = Math.max(0, Math.sin(cyc + pairPhase2 + 0.6)) * 0.75;
      break;
    }
    case 'accent': applyAccentIdle(e, anim, P); break;
  }
}

// -------------------------------------------------------------------- happy

function happyFn(e, anim, P) {
  const pers = personalityOf(anim);
  const cyc = anim.t * 5.5 * pers.freq;
  const bounce = Math.max(0, Math.sin(cyc));
  switch (e.kind) {
    case 'body': P.py = bounce * 0.06; P.sy = 1 + bounce * 0.05; P.sx = 1 - bounce * 0.03; P.sz = 1 - bounce * 0.03; break;
    case 'head': P.ry = Math.sin(cyc * 0.7) * 0.15; P.rz = Math.sin(cyc * 0.5) * 0.08; break;
    case 'eyelid': { const b = blinkPulse(anim.t, anim.hints.blinkEvery * 0.5, anim._seed); P.sy = lerp(1, 3.5, b * 0.4); break; }
    case 'tail': applyTail(e, anim, P, 0.55, 2.6); break;
    case 'wing': applyWing(e, anim, P, 0.4, 6); break;
    case 'legHip': P.rx = Math.sin(cyc + e.li) * 0.3; break;
    case 'legKnee': P.rx = Math.max(0, Math.sin(cyc + e.li + 0.5)) * 0.4; break;
    case 'accent': applyAccentIdle(e, anim, P); break;
  }
}

// -------------------------------------------------------------------- sleep

function sleepFn(e, anim, P) {
  const breath = Math.sin(anim.t * 0.7) * 0.02;
  switch (e.kind) {
    case 'body': P.sy = 1 + breath; P.ry = 0.5; P.pz = 0.02; break;
    case 'head': P.rx = 0.35; P.ry = 0.2; break;
    case 'eyelid': P.sy = 6; break; // closed
    case 'tail': applyTail(e, anim, P, 0.06, 0.35); break;
    case 'wing': P.rz = -0.2; break;
    case 'legHip': P.rx = 0.4; break;
    case 'legKnee': P.rx = 0.6; break;
    case 'accent': P.rz = Math.sin(anim.t * 0.4) * 0.01; break;
  }
}

// ---------------------------------------------------------- one-shot: attack

const ATTACK_ANTICIPATE = 0.14, ATTACK_LUNGE = 0.32, ATTACK_RECOVER = 0.62;

function envAndLoopBlend(anim, holdAt) {
  // Once a one-shot's settle time has passed, quietly blend in a very soft
  // idle-breathing loop so the creature never looks frozen.
  const since = anim.stateTime - holdAt;
  if (since <= 0) return 0;
  return clamp01(since / 0.6) * 0.35;
}

function attackFn(e, anim, P) {
  const pers = personalityOf(anim);
  const st = anim.stateTime * pers.settle;
  const idleBlend = envAndLoopBlend(anim, ATTACK_RECOVER / pers.settle);
  if (idleBlend > 0) idleFn(e, anim, P), scalePose(P, idleBlend);
  switch (e.kind) {
    case 'body': {
      let s = 0, lean = 0;
      if (st < ATTACK_ANTICIPATE) { const p = st / ATTACK_ANTICIPATE; s = -0.12 * p; lean = -0.18 * p; }
      else if (st < ATTACK_LUNGE) { const p = (st - ATTACK_ANTICIPATE) / (ATTACK_LUNGE - ATTACK_ANTICIPATE); s = lerp(-0.12, 0.1, p); lean = lerp(-0.18, 0.35, p); }
      else if (st < ATTACK_RECOVER) { const p = (st - ATTACK_LUNGE) / (ATTACK_RECOVER - ATTACK_LUNGE); s = lerp(0.1, 0, p); lean = lerp(0.35, 0, p); }
      P.sy += s * 0.6; P.sx -= s * 0.3; P.sz -= s * 0.3;
      P.pz += lean * 0.14; P.rx += lean * 0.12;
      break;
    }
    case 'head': P.rx += (st < ATTACK_LUNGE ? -0.1 : 0.04); break;
    case 'jaw': P.rx += st > ATTACK_ANTICIPATE && st < ATTACK_RECOVER ? -0.35 : 0; break;
    case 'eyelid': applyBlink(e, anim, P); break;
    case 'tail': { const snap = st < ATTACK_LUNGE ? -0.4 : 0.15; applyTail(e, anim, P, 0.3, 3); P.ry += snap * (1 - e.i / Math.max(1, e.n)); break; }
    case 'wing': applyWing(e, anim, P, 0.3, 5); break;
    case 'legHip': P.rx += st < ATTACK_LUNGE ? -0.25 : 0.1; break;
    case 'legKnee': P.rx += st < ATTACK_LUNGE ? 0.35 : 0.1; break;
    case 'accent': applyAccentIdle(e, anim, P); break;
  }
}

function scalePose(P, k) {
  P.px *= k; P.py *= k; P.pz *= k; P.rx *= k; P.ry *= k; P.rz *= k;
  P.sx = lerp(1, P.sx, k); P.sy = lerp(1, P.sy, k); P.sz = lerp(1, P.sz, k);
}

// --------------------------------------------------------- one-shot: special

function specialFn(e, anim, P) {
  const pers = personalityOf(anim);
  const rise = 0.4 / pers.settle;
  const st = anim.stateTime;
  const p = clamp01(st / rise);
  const eased = p * p * (3 - 2 * p);
  const loop = Math.max(0, st - rise);
  switch (e.kind) {
    case 'body': P.rx = -eased * 0.28; P.py = eased * 0.05 + Math.sin(loop * 3 + anim._seed) * 0.02 * eased; P.sy = 1 + Math.sin(loop * 6) * 0.03 * eased; break;
    case 'head': P.rx = -eased * 0.2; break;
    case 'jaw': P.rx = -eased * 0.3; break;
    case 'eyelid': P.sy = lerp(1, 0.06, eased) + (1 - eased); break;
    case 'tail': applyTail(e, anim, P, 0.4 * eased, 4); break;
    case 'wing': applyWing(e, anim, P, 0.5 * eased, 6, e.w * 1.5); break;
    case 'legHip': P.rx = eased * 0.15; break;
    case 'legKnee': P.rx = eased * 0.2; break;
    case 'accent': { applyAccentIdle(e, anim, P); P.sx = 1 + eased * 0.1; P.sy = 1 + eased * 0.1; P.sz = 1 + eased * 0.1; break; }
  }
}

// ------------------------------------------------------------- one-shot: hit

function hitFn(e, anim, P) {
  const st = anim.stateTime;
  const snapDur = 0.08, shudderDur = 0.42;
  const idleBlend = envAndLoopBlend(anim, shudderDur);
  if (idleBlend > 0) idleFn(e, anim, P), scalePose(P, idleBlend);
  let k = 0;
  if (st < snapDur) k = -(st / snapDur);
  else if (st < shudderDur) {
    const p = (st - snapDur) / (shudderDur - snapDur);
    k = Math.sin(p * Math.PI * 4) * (1 - p);
  }
  switch (e.kind) {
    case 'body': P.pz += k * 0.12; P.rz += k * 0.08; P.sx -= Math.abs(k) * 0.05; P.sy += Math.abs(k) * 0.03; break;
    case 'head': P.rz += k * 0.15; break;
    case 'eyelid': P.sy += st < snapDur ? 5 : 0; break;
    case 'tail': applyTail(e, anim, P, 0.25, 2); break;
    case 'accent': applyAccentIdle(e, anim, P); break;
  }
}

// ----------------------------------------------------------- one-shot: faint

function faintFn(e, anim, P) {
  const st = anim.stateTime;
  const dur = 0.7;
  const p = clamp01(st / dur);
  const eased = 1 - Math.pow(1 - p, 3);
  switch (e.kind) {
    case 'body': P.rz = eased * 1.35; P.py = -eased * 0.16; P.sy = 1 - eased * 0.25; break;
    case 'head': P.rz = eased * 0.6; P.rx = eased * 0.3; break;
    case 'eyelid': P.sy = lerp(0.06, 6, eased); break;
    case 'tail': { const droop = eased; P.rx = droop * 0.4 * (e.i / Math.max(1, e.n)); break; }
    case 'legHip': P.rx = eased * 0.5; break;
    case 'legKnee': P.rx = eased * 0.7; break;
    case 'wing': P.rz = eased * 0.5; break;
    // no accent motion — fainted creatures are still
  }
}

const STATE_FN = {
  idle: idleFn, walk: walkFn, happy: happyFn, sleep: sleepFn,
  attack: attackFn, special: specialFn, hit: hitFn, faint: faintFn,
};
