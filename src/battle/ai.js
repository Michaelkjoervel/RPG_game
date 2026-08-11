// Lumenfall — enemy battle decision-making. Pure logic, zero DOM/three
// imports. Consumed exclusively by battle/engine.js, which builds a fresh
// `view` object every time it needs a decision for the non-player side (and
// re-uses the same shape for forced-switch decisions after a faint).
//
// view shape (all fields built fresh by engine.js each call):
// {
//   self: {
//     mon,                       // raw creature instance
//     hp, maxHp, hpFrac, status, aspects, hollowed, statStages,
//     burstCharge, canBurst,
//     moves: [{ id, def }],      // def = resolved ability data, or null if missing
//     burstMove: { id, def } | null,
//     combatView,                // the exact {level,stats,statStages,...} object
//                                 // engine will pass to formulas.computeDamage
//   },
//   foe: {  // same shape as self, minus moves/burstMove/combatView is the
//           // defender-side view (still full — AI is allowed to "know" the
//           // active foe's real stats/status, matching how a trainer would
//           // read the field)
//     mon, hp, maxHp, hpFrac, status, aspects, hollowed, statStages, combatView,
//   },
//   team,          // this side's full roster: [{ mon, hpFrac, fainted, aspects }]
//   selfIndex,     // index of `self` within `team`
//   canSwitch,     // false when there is no living bench to switch to
//   mustSwitch,    // true when this call is a forced-switch-after-faint decision
//   turnNumber,
//   aura,          // active aura kind ('emberhaze'|'tidesurge'|'gloom') or null
//   recentFoeAspects, // last few aspects the foe attacked with (may be empty)
// }
//
// Actions returned by chooseAction: the same shapes the player's UI returns
// (see docs/ARCHITECTURE.md Battle contract): {type:'move',moveId} |
// {type:'switch',index} | {type:'burst'}. Enemies never flee, catch or use
// bag items today (items would require a per-NPC bag the data contracts
// don't define) — 'tactical' substitutes a self-heal MOVE when available
// instead, which is the intentional reading of "heals <35%" for this layer.
//
// chooseSwitch returns a plain team index for a forced switch.

import { expectedDamage } from './formulas.js';
import { effectiveness } from '../data/aspects.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
function pickOne(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

// ------------------------------------------------------------ move scoring
// A single heuristic used by every AI tier: expected damage for attacking
// moves, plus a hand-tuned utility value for status/buff/heal/etc. so
// non-damaging moves compete fairly against attacks in the ranking.
function moveScore(entry, view) {
  const def = entry.def;
  if (!def) return -Infinity;
  let score = 0;
  if (def.power) {
    const dmg = expectedDamage(view.self.combatView, view.foe.combatView, def, { aura: view.aura });
    score = dmg;
    if (dmg >= view.foe.hp) score += 40; // kill-secure bonus
  }
  for (const eff of def.effects ?? []) {
    const chance = clamp01((eff.chance ?? 100) / 100);
    switch (eff.type) {
      case 'statStage': {
        // Scale by how much "room" is left before the stage hits its ±3
        // cap — a maxed-out stat is worth nothing, and must never outscore
        // attacking (this was the source of a real infinite buff-loop
        // stalemate during testing: a mirror where 'basic' kept re-casting
        // an already-capped self-buff forever instead of ever attacking).
        const stages = eff.stages ?? 1;
        const targetView = eff.target === 'foe' ? view.foe : view.self;
        const cur = targetView?.statStages?.[eff.stat] ?? 0;
        const room = stages > 0 ? Math.max(0, 3 - cur) : Math.max(0, cur - -3);
        if (room > 0) {
          const mag = Math.min(Math.abs(stages), room) * 8 * chance;
          score += eff.target === 'foe' ? mag * 0.85 : mag;
        }
        break;
      }
      case 'status': score += 18 * chance; break;
      case 'heal': {
        // Scale by how much HP is actually missing — healing at full HP is
        // worth exactly nothing and must never outscore attacking (this was
        // the source of an infinite Soothe-mirror stalemate during testing).
        const missing = 1 - view.self.hpFrac;
        score += (eff.percent ?? 25) * 0.9 * chance * missing;
        break;
      }
      case 'drain': score += 6 * chance * (0.4 + (1 - view.self.hpFrac)); break;
      case 'recoil': score -= 4 * chance; break;
      case 'cleanse': score += view.self.status ? 22 : 0; break;
      case 'guard': score += view.self.hpFrac < 0.5 ? 14 : 6; break;
      case 'aura': score += view.aura ? 2 : 12; break;
      case 'multihit': score += 4; break;
      default: break; // unknown effect types simply add no utility bonus
    }
  }
  return score;
}

function usableMoves(view) {
  return (view.self.moves ?? []).filter((m) => m.def);
}

function rankMoves(view) {
  return usableMoves(view)
    .map((m) => ({ m, score: moveScore(m, view) }))
    .sort((a, b) => b.score - a.score);
}

// ------------------------------------------------------------ matchup math
function matchupScore(attackerAspects, defenderAspects) {
  const atk = attackerAspects?.length ? attackerAspects : ['neutral'];
  const def = defenderAspects?.length ? defenderAspects : ['neutral'];
  let sum = 0;
  for (const a of atk) sum += effectiveness(a, def);
  return sum / atk.length;
}
// >1 = good matchup for the attacker (relative offense vs relative defense).
function matchupRatio(attackerAspects, defenderAspects) {
  const off = matchupScore(attackerAspects, defenderAspects);
  const def = matchupScore(defenderAspects, attackerAspects);
  return off / Math.max(0.4, def);
}

function bestSwitchTarget(view, { avoidWeakOnly = false } = {}) {
  let best = null;
  view.team.forEach((t, i) => {
    if (i === view.selfIndex || t.fainted) return;
    const incoming = matchupScore(view.foe.aspects, t.aspects);
    if (avoidWeakOnly && incoming < 1.6) return; // only care about escaping a bad matchup
    const ratio = matchupRatio(t.aspects, view.foe.aspects);
    if (!best || ratio > best.ratio) best = { index: i, ratio };
  });
  return best;
}

function spamDetected(view) {
  const arr = view.recentFoeAspects ?? [];
  if (arr.length < 2) return false;
  return arr.slice(-2).every((a) => effectiveness(a, view.self.aspects ?? ['neutral']) >= 1.6);
}

// ------------------------------------------------------------------ basic
function chooseBasic(view, rng, { wobble = 0.15 } = {}) {
  const ranked = rankMoves(view);
  if (!ranked.length) return { type: 'move', moveId: null }; // engine substitutes Struggle
  if (rng() < wobble) {
    const alt = ranked[1] ?? pickOne(ranked, rng);
    return { type: 'move', moveId: alt.m.id };
  }
  return { type: 'move', moveId: ranked[0].m.id };
}

// --------------------------------------------------------------- tactical
function chooseTactical(view, rng) {
  const { self, foe } = view;

  // 1) Desperate healing below 35% HP, if a heal move is known.
  if (self.hpFrac < 0.35) {
    const healer = usableMoves(view).find((m) => m.def.effects?.some((e) => e.type === 'heal'));
    if (healer) return { type: 'move', moveId: healer.id };
  }

  // 2) Burst timing: secure a kill, or fight for survival, or just often.
  if (self.canBurst && self.burstMove?.def) {
    const dmg = expectedDamage(self.combatView, foe.combatView, self.burstMove.def, { aura: view.aura });
    const killSecure = dmg >= foe.hp;
    const survival = self.hpFrac < 0.3 && foe.hpFrac > 0.5;
    if (killSecure || survival || rng() < 0.35) return { type: 'burst' };
  }

  // 3) Switch away from a bad matchup while it still has a healthy bench.
  // Gated on the CURRENT matchup actually being a losing one (ratio < 1) —
  // with 5-member rosters, aspect matchups are non-transitive (A beats B
  // beats C beats A is entirely possible), so "is the bench merely better"
  // alone can make both sides in a mirror chase each other in an endless
  // switching circle without either ever landing a hit (a real stalemate we
  // hit during testing). Only bail out of a matchup that's actually bad.
  if (view.canSwitch && self.hpFrac < 0.6) {
    const ratio = matchupRatio(self.aspects, foe.aspects);
    if (ratio < 1.0) {
      const escape = bestSwitchTarget(view);
      if (escape && escape.ratio > ratio + 0.35) return { type: 'switch', index: escape.index };
    }
  }

  // 4) "Predicts obvious super-effective spam": if the foe just leaned on a
  //    strong-vs-self aspect twice in a row, duck out to a safer body.
  if (view.canSwitch && spamDetected(view)) {
    const safer = bestSwitchTarget(view, { avoidWeakOnly: true });
    if (safer) return { type: 'switch', index: safer.index };
  }

  return chooseBasic(view, rng, { wobble: 0.08 });
}

// ------------------------------------------------------------------- boss
function chooseBoss(view, rng, opts = {}) {
  const { self } = view;
  const actionIndex = opts.actionIndex ?? 0;

  // Opening gambit: set the field aura on the very first action, if it has one.
  if (view.turnNumber === 1 && actionIndex === 0 && !view.aura) {
    const auraMove = usableMoves(view).find((m) => m.def.effects?.some((e) => e.type === 'aura'));
    if (auraMove) return { type: 'move', moveId: auraMove.id };
  }

  // Burst phase: at/under half HP, lean hard on the signature move.
  if (self.hpFrac <= 0.5 && self.canBurst && self.burstMove) {
    return { type: 'burst' };
  }

  // Setup phase: comfortably ahead on HP and not yet buffed — commit to one
  // self-buff before returning to straight offense.
  if (self.hpFrac > 0.5 && self.hpFrac <= 0.9) {
    const alreadyBuffed = Object.values(self.statStages ?? {}).some((s) => s > 0);
    if (!alreadyBuffed) {
      const setup = usableMoves(view).find((m) => m.def.effects?.some((e) => e.type === 'statStage' && e.target !== 'foe'));
      if (setup && rng() < 0.6) return { type: 'move', moveId: setup.id };
    }
  }

  return chooseBasic(view, rng, { wobble: 0.05 });
}

/**
 * Choose this turn's action for the AI-controlled side.
 * kind: 'basic' | 'tactical' | 'boss'
 * opts.actionIndex: 0 or 1 — which of a boss's twoActions this is (see
 *   engine.js's boss.twoActions support); ignored by basic/tactical.
 */
export function chooseAction(kind, view, opts = {}) {
  const rng = opts.rng ?? Math.random;
  if (!view?.self) return { type: 'move', moveId: null };
  switch (kind) {
    case 'tactical': return chooseTactical(view, rng);
    case 'boss': return chooseBoss(view, rng, opts);
    case 'basic':
    default: return chooseBasic(view, rng);
  }
}

/** Forced switch after a faint. Returns a team index, or -1 if none available. */
export function chooseSwitch(kind, view) {
  const fallback = () => view.team.findIndex((t, i) => i !== view.selfIndex && !t.fainted);
  if (kind === 'basic') return fallback();
  const best = bestSwitchTarget(view);
  return best ? best.index : fallback();
}
