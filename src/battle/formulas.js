// Lumenfall — battle formulas. SINGLE SOURCE for all combat math.
// Pure functions, zero DOM/three imports. Consumed by engine.js, ai.js and
// game/creatures.js. See docs/ARCHITECTURE.md §Battle and docs/CONTRACTS_ADDENDUM.md.
//
// Tuning notes (verified by scratchpad sim, see combat test suite):
//  - DMG_DIV 56 puts a lv5 starter mirror match at 4-7 turns and keeps
//    end-game (lv45+) exchanges at 3-5 hits per KO — snappy but readable.
//  - Variance 0.92..1.0 keeps damage numbers stable enough to plan around.
import { effectiveness, effectivenessLabel, ATTUNE_BONUS } from '../data/aspects.js';

// ---------------------------------------------------------------- constants
export const DMG_DIV = 56;          // global damage divisor (pacing knob)
export const CRIT_CHANCE = 1 / 16;
export const CRIT_MULT = 1.5;
export const VARIANCE_MIN = 0.92;   // damage roll 0.92..1.0
export const MAX_LEVEL = 50;
export const STAGE_MIN = -3;
export const STAGE_MAX = 3;

// Status → passive stat multipliers (addendum §Status effects; single source).
export const STATUS_STAT_MULT = {
  burn: { might: 0.7 },
  frostbite: { focus: 0.7 },
  soak: { haste: 0.75 },
};
// Statuses that deal damage over time at turn end.
export const DOT_STATUSES = ['burn', 'root', 'frostbite', 'venom'];

// Aura table (addendum): kind → { boosted aspect, dampened aspect }.
export const AURAS = {
  emberhaze: { boost: 'ember', damp: 'frost' },
  tidesurge: { boost: 'tide', damp: 'ember' },
  gloom: { boost: 'umbra', damp: 'lumen' },
};
export const AURA_BOOST = 1.3;
export const AURA_DAMP = 0.7;

// ---------------------------------------------------------------- stages
export const clampStage = (s) => Math.max(STAGE_MIN, Math.min(STAGE_MAX, s | 0));

/** Stat-stage multiplier: +s → (2+s)/2, −s → 2/(2−s). Range x0.4 .. x2.5. */
export function stageMult(s) {
  s = clampStage(s);
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

// ---------------------------------------------------------------- stats
/**
 * Stat from a species base value at a level.
 *   statFor(base, level)        → battle stat (might/ward/focus/aegis/haste)
 *   statFor(base, level, true)  → vigor (max HP)
 * Callers layer resonance/hollowed/talisman multipliers on top (see
 * game/creatures.js recalcStats and engine combat views).
 */
export function statFor(base = 50, level = 1, isVigor = false) {
  base = Math.max(1, base | 0);
  level = Math.max(1, Math.min(MAX_LEVEL, level | 0));
  const core = Math.floor((2 * base * level) / 100);
  return isVigor ? core + level + 10 : core + 5;
}

export const maxHpFor = (vigorBase, level) => statFor(vigorBase, level, true);

/**
 * Effective in-battle stat for a combatant view:
 * { stats, statStages, status, talisman?:{stat,pct}, statMults?:{stat:mult} }.
 * opts.floorNegStage: treat negative stages as 0 (crit rule for the attacker).
 */
export function effectiveStat(view, stat, opts = {}) {
  let v = view?.stats?.[stat] ?? 10;
  let s = view?.statStages?.[stat] ?? 0;
  if (opts.floorNegStage && s < 0) s = 0;
  v *= stageMult(s);
  const sm = STATUS_STAT_MULT[view?.status];
  if (sm?.[stat]) v *= sm[stat];
  if (view?.talisman?.stat === stat) v *= 1 + (view.talisman.pct ?? 15) / 100;
  const traitMult = view?.statMults?.[stat];
  if (traitMult) v *= traitMult;
  return Math.max(1, Math.floor(v));
}

// ---------------------------------------------------------------- accuracy
/**
 * Resolved accuracy (0..100+) for a move. Blind → ×0.65. Supports optional
 * accuracy/evasion stat stages if data uses them. accuracy null/undefined = 100.
 */
export function accuracyOf(move, attView, defView) {
  let acc = move?.accuracy ?? 100;
  if (acc >= 999) return 999; // sure-hit marker
  if (attView?.status === 'blind') acc *= 0.65;
  const stage = clampStage((attView?.statStages?.accuracy ?? 0) - (defView?.statStages?.evasion ?? 0));
  if (stage) acc *= stageMult(stage);
  return acc;
}

// ---------------------------------------------------------------- damage
/** Aura multiplier for a move aspect under the active aura kind (or 1). */
export function auraDamageMult(moveAspect, aura) {
  const a = AURAS[aura];
  if (!a) return 1;
  if (moveAspect === a.boost) return AURA_BOOST;
  if (moveAspect === a.damp) return AURA_DAMP;
  return 1;
}

/**
 * THE damage formula. attView/defView are combatant views:
 *   { level, stats, statStages, status, aspects:[..], talisman?:{stat|aspect,pct},
 *     statMults?, outMult?, inMult?, guard? }
 * move: { power, kind:'might'|'focus', aspect } — power 0/absent → no damage.
 * ctx: { aura?, rng?, noVariance?, forceCrit? (boolean override) }
 * Returns { dmg, crit, eff:'super'|'weak'|'normal'|'immune', effMult }.
 */
export function computeDamage(attView, defView, move, ctx = {}) {
  const rng = ctx.rng ?? Math.random;
  const power = move?.power ?? 0;
  if (!power) return { dmg: 0, crit: false, eff: 'normal', effMult: 1 };

  const aspect = move.aspect ?? 'neutral';
  const effMult = effectiveness(aspect, defView?.aspects ?? ['neutral']);
  if (effMult === 0) return { dmg: 0, crit: false, eff: 'immune', effMult: 0 };

  const crit = ctx.forceCrit ?? rng() < CRIT_CHANCE;
  const offStat = move.kind === 'might' ? 'might' : 'focus';
  const defStat = move.kind === 'might' ? 'ward' : 'aegis';
  // Crits ignore the attacker's NEGATIVE stat stages (contract).
  const A = effectiveStat(attView, offStat, { floorNegStage: crit });
  const D = effectiveStat(defView, defStat);

  let dmg = ((2 * (attView?.level ?? 5)) / 5 + 2) * power * (A / D) / DMG_DIV + 2;

  let mult = effMult;
  if ((attView?.aspects ?? []).includes(aspect)) mult *= ATTUNE_BONUS; // attunement bonus
  if (crit) mult *= CRIT_MULT;
  mult *= auraDamageMult(aspect, ctx.aura);
  if (defView?.status === 'soak' && aspect === 'volt') mult *= 1.3;     // soak: +30% volt taken
  if (attView?.talisman?.aspect === aspect) mult *= 1 + (attView.talisman.pct ?? 20) / 100;
  mult *= attView?.outMult ?? 1;  // trait modDamageOut / onLowHP (engine-resolved)
  mult *= defView?.inMult ?? 1;   // trait modDamageIn (engine-resolved)
  if (defView?.guard) mult *= 0.5; // guard effect halves incoming damage

  const variance = ctx.noVariance ? 1 : VARIANCE_MIN + rng() * (1 - VARIANCE_MIN);
  dmg = Math.max(1, Math.floor(dmg * mult * variance));
  return { dmg, crit, eff: effectivenessLabel(effMult), effMult };
}

/** Expected damage (no variance, no crit), scaled by hit chance. For AI. */
export function expectedDamage(attView, defView, move, ctx = {}) {
  const { dmg, effMult } = computeDamage(attView, defView, move, { ...ctx, noVariance: true, forceCrit: false });
  if (effMult === 0) return 0;
  const acc = Math.min(100, accuracyOf(move, attView, defView));
  return dmg * (acc / 100);
}

// ---------------------------------------------------------------- status dots
/** Turn-end damage for a status. venom ramps: 4% + 2% per elapsed tick. */
export function statusTickDamage(status, maxHp, stacks = 0) {
  let pct = 0;
  switch (status) {
    case 'burn': pct = 0.06; break;
    case 'root': pct = 0.03; break;
    case 'frostbite': pct = 0.04; break;
    case 'venom': pct = 0.04 + 0.02 * Math.max(0, stacks); break;
    default: return 0;
  }
  return Math.max(1, Math.floor(maxHp * pct));
}

// ---------------------------------------------------------------- xp & glim
// XP yield for defeating (or catching) a foe: scales with level, awakening
// stage and rarity. Participants receive the full amount, benched party 35%.
const RARITY_XP = { C: 1.0, U: 1.2, R: 1.45, L: 2.2, starter: 1.15 };
export const RESERVE_XP_SHARE = 0.35;

export function xpForFaint(species = {}, level = 5) {
  const stage = species.stage ?? 1;
  const rf = RARITY_XP[species.rarity] ?? 1.0;
  const sf = 1 + 0.4 * (stage - 1);
  return Math.max(1, Math.floor(9 * level * sf * rf));
}

/**
 * Default glim payout shown in the battle result. Wild Kindred carry no
 * coin (0). Warden/boss defaults suit early-game pacing; story passes
 * config.glimReward to override with the NPC's scripted reward.
 */
export function glimForBattle(kind, enemyTeam = []) {
  if (kind === 'wild') return 0;
  const levels = enemyTeam.reduce((s, m) => s + (m?.level ?? 5), 0);
  const glim = 25 + levels * 6;
  return kind === 'boss' ? Math.floor(glim * 1.6) : glim;
}

// ---------------------------------------------------------------- flee
/** Chance (0.2..0.95) to flee a wild battle. Rises with haste ratio and attempts. */
export function fleeChance(myHaste, foeHaste, attempts = 0) {
  const ratio = (myHaste || 1) / Math.max(1, foeHaste || 1);
  const p = 0.35 + 0.35 * ratio + 0.12 * attempts;
  return Math.max(0.2, Math.min(0.95, p));
}

// ---------------------------------------------------------------- misc combat constants
// Shared knobs consumed by engine.js / ai.js / game/creatures.js so nobody
// hardcodes a second copy. See docs/CONTRACTS_ADDENDUM.md for the source.
export const BURST_CHARGE_MAX = 100;
export const BURST_CHARGE_ON_DEAL = 18;   // gained by the attacker on landing a hit
export const BURST_CHARGE_ON_TAKEN = 12;  // gained by the defender on taking a hit
export const BURST_DREAD_CHARGE_MULT = 0.5; // dread halves burst charge gain
export const BURST_PRIORITY_BONUS = 1;      // bursts act as priority+1 moves

export const DREAD_AEGIS_STAGE = -1;   // dread lowers aegis by 1 stage on apply
export const STATUS_DURATION = { root: 3 }; // turns; other statuses persist until cured

// Hollowed variant: +15% might/focus, -15% ward/aegis (bible: "no mechanic
// beyond stats"). Applied by engine.js when it builds a combat view.
export const HOLLOWED_STAT_MULTS = { might: 1.15, focus: 1.15, ward: 0.85, aegis: 0.85 };

// Resonance (bond) stat bonus: +2% per level (0..5), applied in game/creatures.js.
export const RESONANCE_STAT_BONUS_PER_LEVEL = 0.02;
