// Lumenfall — creature INSTANCE lifecycle (a caught/party Kindred, as
// opposed to species data). Pure logic, zero DOM/three imports. Single
// source for creating, leveling, bonding and awakening creature instances —
// see docs/ARCHITECTURE.md §Creature instance and docs/DESIGN_BIBLE.md §5.

import { bus } from '../core/events.js';
import { markCodex } from '../core/state.js';
import { statFor, maxHpFor, RESONANCE_STAT_BONUS_PER_LEVEL } from '../battle/formulas.js';
import { SPECIES, XP_CURVES } from '../data/creatures.js';

const MAX_LEVEL = 50;
const MAX_RESONANCE = 5;
const MAX_MOVES = 4;
const GLEAM_ODDS = 1 / 512;

// Cumulative resonance XP needed to REACH each level (index = resonance level).
const RESONANCE_XP_THRESHOLDS = [0, 90, 220, 400, 650, 1000];

// vigor_root: +15% max HP (the one talisman effect that lives here rather
// than in the battle engine's per-attack view, since it changes the stat
// itself rather than a live combat multiplier).
const VIGOR_TALISMAN_BONUS = 0.15;

const _warned = new Set();
function warnOnce(key, msg) {
  if (_warned.has(key)) return;
  _warned.add(key);
  console.warn(msg);
}

let _uidSeq = 0;
function makeUid() {
  _uidSeq = (_uidSeq + 1) % 1e6;
  return `k${Date.now().toString(36)}${_uidSeq.toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;
}

function clampLevel(lv) { return Math.max(1, Math.min(MAX_LEVEL, Math.floor(lv) || 1)); }

function xpFloorForLevel(growth, level) {
  const curve = XP_CURVES?.[growth];
  return curve?.[level] ?? 0;
}

/** Ability ids from a learnset ([level, abilityId][]) known by `level`, last 4. */
function defaultMoves(learnset, level) {
  return (learnset ?? [])
    .filter(([lv]) => lv <= level)
    .slice(-MAX_MOVES)
    .map(([, id]) => id);
}

/**
 * Recompute mon.stats/maxHp from its (possibly just-changed) species/level/
 * resonance, preserving current HP as a fraction of the new max — call after
 * creation, leveling, awakening, or a resonance level-up.
 */
export function recalcStats(mon) {
  const species = SPECIES?.[mon.speciesId];
  if (!species?.base) {
    warnOnce('species:' + mon.speciesId, `[creatures] unknown species "${mon.speciesId}" — stats left as-is (data/creatures.js may not be loaded yet)`);
    return;
  }
  const resBonus = 1 + RESONANCE_STAT_BONUS_PER_LEVEL * (mon.resonance ?? 0);
  const vigorBonus = mon.talisman === 'vigor_root' ? (1 + VIGOR_TALISMAN_BONUS) : 1;
  const prevFrac = mon.maxHp > 0 ? mon.hp / mon.maxHp : 1;

  const newMaxHp = Math.max(1, Math.floor(maxHpFor(species.base.vigor, mon.level) * resBonus * vigorBonus));
  const stats = {};
  for (const k of ['might', 'ward', 'focus', 'aegis', 'haste']) {
    stats[k] = Math.max(1, Math.floor(statFor(species.base[k], mon.level) * resBonus));
  }
  mon.maxHp = newMaxHp;
  mon.stats = stats;
  mon.hp = Math.max(mon.hp <= 0 ? 0 : 1, Math.min(newMaxHp, Math.round(newMaxHp * prevFrac)));
}

/**
 * Create a new creature instance. opts: { nickname, resonance, talisman,
 * moves (override learnset default, <=4 ids), hollowed, metAt, forceGleaming,
 * noGleamRoll }.
 */
export function makeCreature(speciesId, level, opts = {}) {
  const species = SPECIES?.[speciesId];
  if (!species) warnOnce('species:' + speciesId, `[creatures] unknown species "${speciesId}" — creating a placeholder instance`);

  const lvl = clampLevel(level);
  const moves = (opts.moves ?? defaultMoves(species?.learnset, lvl)).slice(0, MAX_MOVES);
  const shiny = !!opts.forceGleaming || (!opts.noGleamRoll && Math.random() < GLEAM_ODDS);

  const mon = {
    uid: makeUid(),
    speciesId,
    nickname: opts.nickname ?? null,
    level: lvl,
    xp: xpFloorForLevel(species?.growth ?? 'medium', lvl),
    resonance: Math.max(0, Math.min(MAX_RESONANCE, opts.resonance ?? 0)),
    resonanceXp: RESONANCE_XP_THRESHOLDS[Math.max(0, Math.min(MAX_RESONANCE, opts.resonance ?? 0))] ?? 0,
    hp: 1, maxHp: 1,
    stats: { might: 1, ward: 1, focus: 1, aegis: 1, haste: 1 },
    moves,
    talisman: opts.talisman ?? null,
    status: null,
    statStages: { might: 0, ward: 0, focus: 0, aegis: 0, haste: 0 },
    burstCharge: 0,
    shiny,
    hollowed: !!opts.hollowed,
    metAt: opts.metAt ?? null,
  };
  recalcStats(mon);
  mon.hp = mon.maxHp; // full HP on creation
  return mon;
}

/**
 * Add XP, applying as many level-ups as it covers (each preserving HP%,
 * learning any learnset moves that unlock at the new level — auto-slotting
 * while under 4, otherwise offering a swap via 'creature:learnmove').
 * Returns { levelups: [newLevels...], learnable: [moveIds offered but not
 * auto-learned] }.
 */
export function addXp(mon, amount) {
  const species = SPECIES?.[mon.speciesId];
  const curve = XP_CURVES?.[species?.growth ?? 'medium'];
  const levelups = [];
  const learnable = [];
  if (!curve) {
    warnOnce('xpcurve', '[creatures] XP_CURVES unavailable — leveling disabled until data/creatures.js is ready');
    return { levelups, learnable };
  }
  mon.xp = Math.max(0, (mon.xp ?? 0) + Math.max(0, Math.floor(amount) || 0));
  while (mon.level < MAX_LEVEL && mon.xp >= (curve[mon.level + 1] ?? Infinity)) {
    mon.level++;
    recalcStats(mon);
    for (const [lv, abilityId] of (species?.learnset ?? [])) {
      if (lv !== mon.level) continue;
      if (mon.moves.length < MAX_MOVES) {
        mon.moves.push(abilityId);
      } else {
        learnable.push(abilityId);
        bus.emit('creature:learnmove', { mon, moveId: abilityId });
      }
    }
    levelups.push(mon.level);
    bus.emit('creature:levelup', { mon });
  }
  return { levelups, learnable };
}

/** Raise Resonance (the bond stat), 0..5. Returns { up, resonance }. */
export function addResonanceXp(mon, amount) {
  if ((mon.resonance ?? 0) >= MAX_RESONANCE) return { up: false, resonance: mon.resonance };
  mon.resonanceXp = Math.max(0, (mon.resonanceXp ?? 0) + Math.max(0, Math.floor(amount) || 0));
  let up = false;
  while (mon.resonance < MAX_RESONANCE && mon.resonanceXp >= (RESONANCE_XP_THRESHOLDS[mon.resonance + 1] ?? Infinity)) {
    mon.resonance++;
    up = true;
    recalcStats(mon);
    bus.emit('resonance:up', { mon });
  }
  return { up, resonance: mon.resonance };
}

/**
 * Would this mon awaken right now, given a trigger? Returns the target
 * speciesId, or null. trigger: { type:'level' } | { type:'stone', itemId } |
 * { type:'shrine' } | { type:'resonance' }.
 */
export function checkAwakening(mon, trigger = { type: 'level' }) {
  const species = SPECIES?.[mon.speciesId];
  const awakensTo = species?.awakensTo;
  if (!awakensTo) return null;
  switch (trigger.type) {
    case 'level':
      return (typeof awakensTo.level === 'number' && mon.level >= awakensTo.level) ? awakensTo.id : null;
    case 'stone':
      return (awakensTo.item && trigger.itemId === awakensTo.item) ? awakensTo.id : null;
    case 'shrine':
      return awakensTo.shrine ? awakensTo.id : null;
    case 'resonance':
      return (typeof awakensTo.resonance === 'number' && mon.resonance >= awakensTo.resonance) ? awakensTo.id : null;
    default:
      warnOnce('awaken-trigger:' + trigger.type, `[creatures] unknown awakening trigger type "${trigger.type}"`);
      return null;
  }
}

/** Mutate mon in place into its awakened form. Returns true on success. */
export function applyAwakening(mon) {
  const species = SPECIES?.[mon.speciesId];
  const awakensTo = species?.awakensTo;
  if (!awakensTo) return false;
  const toId = awakensTo.id;
  const toSpecies = SPECIES?.[toId];
  if (!toSpecies) {
    warnOnce('awaken-target:' + toId, `[creatures] awakening target species "${toId}" not found`);
    return false;
  }
  const fromId = mon.speciesId;
  mon.speciesId = toId;
  recalcStats(mon);
  for (const [lv, abilityId] of (toSpecies.learnset ?? [])) {
    if (lv <= mon.level && !mon.moves.includes(abilityId) && mon.moves.length < MAX_MOVES) mon.moves.push(abilityId);
  }
  markCodex(toId, 'caught');
  bus.emit('creature:awakened', { mon, fromId, toId });
  return true;
}

// ---------------------------------------------------------------- healing
export function healFull(mon) { if (mon.hp > 0) { mon.hp = mon.maxHp; mon.status = null; } }

/** Revive a fainted mon to `percent` (0..1) of max HP. Returns true if it revived. */
export function reviveIfFainted(mon, percent = 0.5) {
  if (!mon || mon.hp > 0) return false;
  mon.hp = Math.max(1, Math.round(mon.maxHp * percent));
  mon.status = null;
  return true;
}

/** Heal/cure a whole list of instances (party or reserve). opts: { full,
 * percent (0..1, used only if !full), cureStatus, reviveFainted, revivePercent }. */
export function healParty(list, { full = true, percent = null, cureStatus = true, reviveFainted = false, revivePercent = 0.5 } = {}) {
  for (const mon of list ?? []) {
    if (!mon) continue;
    if (mon.hp <= 0) {
      if (reviveFainted) reviveIfFainted(mon, revivePercent);
      continue;
    }
    if (full) mon.hp = mon.maxHp;
    else if (percent) mon.hp = Math.min(mon.maxHp, mon.hp + Math.round(mon.maxHp * percent));
    if (cureStatus) mon.status = null;
  }
}
