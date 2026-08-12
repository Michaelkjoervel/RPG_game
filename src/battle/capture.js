// Lumenfall — Attunement (capture) math. Wild battles only, zero DOM/three
// imports. See docs/CONTRACTS_ADDENDUM.md §Catching for the pinned formula
// and the pinned charm ids. Single source for capture math (engine.js calls
// attemptCapture; nothing else should reimplement this).

// Charm ids are a pinned vocabulary (data/items.js defines the Item records;
// the base rates themselves are pinned here in the addendum).
export const CHARM_BASE = {
  woven_charm: 0.50,
  glazed_charm: 0.62,
  gilded_charm: 0.60,
  starwoven_charm: 0.85,
};

// Rarity letters from the roster (C/U/R/L). 'starter' and anything unlisted
// fall back to the common factor — starters are never wild-caught in
// practice, but we never want an unknown rarity to make capture impossible.
export const RARITY_FACTOR = { C: 1.0, U: 0.7, R: 0.35, L: 0.12 };
const RARITY_FALLBACK = 1.0;

// "Hard" statuses lock the target down and help attunement more than the
// purely damaging ones (addendum: root/frostbite/shock 1.35, others 1.15).
const HARD_STATUSES = new Set(['root', 'frostbite', 'shock']);
export const STATUS_BONUS_HARD = 1.35;
export const STATUS_BONUS_SOFT = 1.15;

export const RATE_MIN = 0.02;
export const RATE_MAX = 0.95;

/**
 * Final capture rate (0.02..0.95), or exactly 0 for a Hollowed target (never
 * catchable, per the design bible & addendum).
 * target: { hp, maxHp, status, hollowed, rarity }
 *   - rarity is the target species' rarity letter (C/U/R/L); anything else
 *     (e.g. undefined, 'starter') is treated as common.
 */
export function captureRate(charmId, target = {}) {
  if (target.hollowed) return 0;
  const base = CHARM_BASE[charmId] ?? CHARM_BASE.woven_charm;
  const maxHp = target.maxHp > 0 ? target.maxHp : 1;
  const hpFrac = Math.max(0, Math.min(1, (target.hp ?? maxHp) / maxHp));
  const hpTerm = 1 - 0.7 * hpFrac;
  const statusBonus = target.status
    ? (HARD_STATUSES.has(target.status) ? STATUS_BONUS_HARD : STATUS_BONUS_SOFT)
    : 1;
  const rarityFactor = RARITY_FACTOR[target.rarity] ?? RARITY_FALLBACK;
  const rate = base * hpTerm * statusBonus * rarityFactor;
  return Math.max(RATE_MIN, Math.min(RATE_MAX, rate));
}

/**
 * Classic 4-check "shake" resolution. Each of up to 4 independent checks
 * must pass (per-check probability = rate^0.25, so surviving all 4 has
 * probability ≈ rate) for the Kindred to be attuned.
 *   shakes: number of checks that succeeded before the first failure (0-3)
 *   success: true only once all 4 checks pass (shown as the 3rd shake + seal)
 * Returns { shakes, success, rate } — engine.js emits catchAttempt with the
 * first two fields verbatim so presentation can stage the tension beat by
 * beat (shake, shake, shake... click / break-free).
 */
export function attemptCapture(charmId, target = {}, rng = Math.random) {
  if (target.hollowed) return { shakes: 0, success: false, rate: 0 };
  const rate = captureRate(charmId, target);
  const perCheck = Math.pow(rate, 0.25);
  let shakes = 0;
  for (let i = 0; i < 4; i++) {
    if (rng() < perCheck) {
      if (i < 3) shakes++;
    } else {
      return { shakes, success: false, rate };
    }
  }
  return { shakes: 3, success: true, rate };
}
