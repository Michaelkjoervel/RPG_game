// Lumenfall — the Battle Engine. Pure headless combat logic: ZERO DOM/three
// imports. Runs a battle as an async state machine and reports everything
// through `onEvent` (awaited, so presentation controls pacing) — see
// docs/ARCHITECTURE.md §Battle contract and docs/CONTRACTS_ADDENDUM.md.
//
//   const battle = new BattleEngine({ playerTeam, enemyTeam, kind, canFlee,
//     canCatch, enemyName?, ai, arena, weatherAura?, boss?:{twoActions}, rng? });
//   battle.onEvent = async (ev) => { ... };
//   const result = await battle.run(getPlayerAction);
//
// Additive, backward-compatible readings of the fixed event vocabulary (all
// still match their documented {field} shapes — these are just conventions
// for extra information riding along):
//   - 'heal' {side,amt}: amt may be NEGATIVE to represent self-inflicted
//     damage (recoil), so presentation can drive one bar-tween code path.
//   - 'statusApplied' {side,status}: status:null means "status was cleared"
//     (cleanse, remedy, or root's natural 3-turn expiry) rather than applied.
//   - 'miss' {side,mon}: may carry an extra `reason` ('shock') when the
//     failure was a shock-stun rather than an accuracy miss.
//   - 'recall' {side}: carries an extra `mon` for convenience.
//   - 'moveUsed'/'burstUsed': `move`/`burst` is the FULL resolved ability or
//     burst definition (id + all data fields), not just the id.
//
// ---------------------------------------------------------------------------
// TRAIT HOOK VOCABULARY. abilities.js's TRAITS entries are pure DATA:
// { hook:'<name>', ...params }. src/data/abilities.js's own header is the
// authoritative source for this (this engine implements it exactly, 1:1 —
// see that file's "TRAIT HOOK VOCABULARY" comment); reproduced here so
// engine.js is self-documenting. A trait fires only at the lifecycle point
// matching its own hook; an unrecognized hook name warns ONCE
// (console.warn) and is otherwise silently ignored — it never throws.
//
//   onSwitchIn      { effect:'statStage', stat, stages, target:'self'|'foe' }
//     Fires once when this creature enters battle (battle start or a switch).
//
//   onLowHP         { threshold:0..1, mod:'damageOut'|'damageIn',
//                      filter?:{aspect?,kind?}, mult }
//     A CONTINUOUS damage multiplier, active only while hp/maxHp <= threshold
//     (re-evaluated on every attack/defense while active — not a one-shot).
//
//   onStatusApplied { effect:'block'|'reflect', status:'any'|<id>, chance:0..100 }
//     Rolls when a status would be applied TO this creature. 'block' cancels
//     it outright; 'reflect' cancels it AND attempts to apply the same
//     status onto the attacker instead (the bounce never chains a second time).
//
//   onTurnEnd       { effect:'heal'|'statStage', percent?, stat?, stages?,
//                      target:'self', chance?:0..100 (default 100) }
//     Evaluated at the end of each turn this creature is active & unfainted.
//
//   modDamageOut    { filter?:{aspect?,kind?}, mult }
//     Multiplies damage this creature DEALS (unconditional unless filtered).
//
//   modDamageIn     { filter?:{aspect?,kind?}, mult }
//     Multiplies damage this creature TAKES (unconditional unless filtered).
//
//   immuneStatus    { status:'any'|<id> }
//     This creature can never receive that status (or, with 'any', any status).
//
//   onHit           { effect:'statStage'|'heal', stat?, stages?, percent?,
//                      chance:0..100, target?:'self' (default) }
//     Rolls whenever this creature LANDS a damaging hit with a move.
//
//   onHitTaken      { effect:'statStage'|'heal', stat?, stages?, percent?,
//                      chance:0..100, target?:'self'(default)|'foe' }
//     Rolls whenever this creature IS hit by a damaging move (only while it
//     survives the hit — a fainted creature cannot react).
// ---------------------------------------------------------------------------

import { G, markCodex, spendItem } from '../core/state.js';
import { bus } from '../core/events.js';
import { SPECIES } from '../data/creatures.js';
import { ABILITIES, TRAITS, BURSTS } from '../data/abilities.js';
import { ITEMS } from '../data/items.js';
import {
  computeDamage, accuracyOf, effectiveStat, clampStage, statusTickDamage,
  xpForFaint, glimForBattle, fleeChance, DOT_STATUSES, AURAS,
  BURST_CHARGE_MAX, BURST_CHARGE_ON_DEAL, BURST_CHARGE_ON_TAKEN,
  BURST_DREAD_CHARGE_MULT, BURST_PRIORITY_BONUS, DREAD_AEGIS_STAGE,
  STATUS_DURATION, HOLLOWED_STAT_MULTS, RESERVE_XP_SHARE,
} from './formulas.js';
import { attemptCapture } from './capture.js';
import { chooseAction, chooseSwitch } from './ai.js';
import { addXp, addResonanceXp, reviveIfFainted } from '../game/creatures.js';

// ------------------------------------------------------------ warn-once log
const _warned = new Set();
function warnOnce(key, msg) {
  if (_warned.has(key)) return;
  _warned.add(key);
  console.warn(msg);
}

// ------------------------------------------------------------ trait hooks
const KNOWN_HOOKS = new Set([
  'onSwitchIn', 'onLowHP', 'onStatusApplied', 'onTurnEnd',
  'modDamageOut', 'modDamageIn', 'immuneStatus', 'onHit', 'onHitTaken',
]);
function checkHookKnown(hookName) {
  if (KNOWN_HOOKS.has(hookName)) return true;
  warnOnce('hook:' + hookName,
    `[engine] trait hook "${hookName}" is not implemented by the combat engine — ignoring. ` +
    `Known hooks: ${[...KNOWN_HOOKS].join(', ')}`);
  return false;
}
function passesFilter(filter, move) {
  if (!filter) return true;
  if (filter.aspect && move?.aspect !== filter.aspect) return false;
  if (filter.kind && move?.kind !== filter.kind) return false;
  return true;
}
// Shared body for onHit/onHitTaken: {effect:'statStage'|'heal', stat?,
// stages?, percent?, chance, target?}. `defaultTarget` is 'self' for both
// per abilities.js's convention when `target` is omitted.
async function applyReactiveEffect(trait, self, ctx, battle, defaultTarget) {
  const chance = trait.chance ?? 100;
  if (battle.rng() * 100 >= chance) return;
  const target = trait.target === 'foe' ? ctx.foe : (trait.target === 'self' ? self : (defaultTarget === 'foe' ? ctx.foe : self));
  if (!target || target.fainted) return;
  if (trait.effect === 'statStage' && trait.stat && trait.stages) {
    await battle._applyStatStage(target, target.side, trait.stat, trait.stages);
  } else if (trait.effect === 'heal') {
    await battle._healCombatant(target, trait.percent);
  }
}
const HOOK_IMPLS = {
  async onSwitchIn(trait, self, ctx, battle) {
    if (trait.effect !== 'statStage' || !trait.stat || !trait.stages) return;
    const target = trait.target === 'foe' ? ctx.foe : self;
    if (target && !target.fainted) await battle._applyStatStage(target, target.side, trait.stat, trait.stages);
  },
  // A continuous damage multiplier active only while hp/maxHp <= threshold;
  // checked from _computeOutMult/_computeInMult (NOT a turn-end/one-shot
  // hook), with ctx.dir telling us which direction is being asked about.
  onLowHP(trait, self, ctx) {
    const dir = trait.mod === 'damageOut' ? 'damageOut' : trait.mod === 'damageIn' ? 'damageIn' : null;
    if (!dir || dir !== ctx.dir) return 1;
    const frac = self.mon.maxHp ? self.mon.hp / self.mon.maxHp : 1;
    if (frac > (trait.threshold ?? 1 / 3)) return 1;
    if (!passesFilter(trait.filter, ctx.move)) return 1;
    return trait.mult ?? 1;
  },
  async onStatusApplied(trait, self, ctx, battle) {
    if (trait.chance != null && battle.rng() * 100 >= trait.chance) return;
    if (!(trait.status === 'any' || trait.status === ctx.status)) return;
    if (trait.effect === 'block') { ctx.cancel?.(true); return; }
    if (trait.effect === 'reflect') {
      ctx.cancel?.(true);
      if (!ctx.noReflect && ctx.attacker && !ctx.attacker.fainted) {
        await battle._tryApplyStatus(ctx.attacker, ctx.attacker.side, ctx.status, { attacker: self, noReflect: true });
      }
    }
  },
  async onTurnEnd(trait, self, ctx, battle) {
    const chance = trait.chance ?? 100;
    if (battle.rng() * 100 >= chance) return;
    if (trait.effect === 'heal') await battle._healCombatant(self, trait.percent);
    else if (trait.effect === 'statStage' && trait.stat && trait.stages) await battle._applyStatStage(self, self.side, trait.stat, trait.stages);
  },
  modDamageOut(trait, self, ctx) { return passesFilter(trait.filter, ctx.move) ? (trait.mult ?? 1) : 1; },
  modDamageIn(trait, self, ctx) { return passesFilter(trait.filter, ctx.move) ? (trait.mult ?? 1) : 1; },
  immuneStatus() { return undefined; }, // handled inline in _tryApplyStatus
  async onHit(trait, self, ctx, battle) { await applyReactiveEffect(trait, self, ctx, battle, 'self'); },
  async onHitTaken(trait, self, ctx, battle) { await applyReactiveEffect(trait, self, ctx, battle, 'self'); },
};

// ------------------------------------------------------------ pinned talismans
// Talisman ids are a pinned vocabulary (docs/CONTRACTS_ADDENDUM.md). Stat/
// aspect boosts plug straight into formulas.js's talisman field; vigor_root
// (+max HP) is applied in game/creatures.js's recalcStats, and survivor_knot
// (survive a KO at 1 HP once/battle) is handled directly in the damage loop.
const TALISMAN_EFFECTS = {
  might_band: { stat: 'might', pct: 15 },
  ward_amulet: { stat: 'ward', pct: 15 },
  focus_lens: { stat: 'focus', pct: 15 },
  aegis_veil: { stat: 'aegis', pct: 15 },
  haste_feather: { stat: 'haste', pct: 15 },
  ember_sigil: { aspect: 'ember', pct: 20 },
  tide_sigil: { aspect: 'tide', pct: 20 },
  bloom_sigil: { aspect: 'bloom', pct: 20 },
  gale_sigil: { aspect: 'gale', pct: 20 },
  terra_sigil: { aspect: 'terra', pct: 20 },
  volt_sigil: { aspect: 'volt', pct: 20 },
};

// ------------------------------------------------------------ fallback move
// Guarantees the engine can always resolve an attack even if a move id is
// missing/unknown or a creature has no usable moves at all — never crash.
const STRUGGLE = {
  id: 'struggle', name: 'Struggle', aspect: 'neutral', kind: 'might',
  power: 45, accuracy: 100, priority: 0,
  effects: [{ type: 'recoil', percent: 25 }],
  desc: 'A last, desperate strike — costly, but never denied.',
  fx: { anim: 'melee', color: 0xc8c2b8, impact: 'burst', sfx: 'hit_light' },
};
function lookupMove(id) {
  if (id) {
    const def = ABILITIES?.[id];
    if (def) return { id, ...def };
    warnOnce('move:' + id, `[engine] unknown ability id "${id}" — substituting Struggle`);
  }
  return { ...STRUGGLE };
}

function applyItemEffect(itemId, mon) {
  const out = { statusCleared: false, revived: false };
  if (itemId === 'vigil_bloom') {
    if (mon.hp > 0) return out;
    reviveIfFainted(mon, 0.5); // pinned: vigil_bloom revives at exactly 50%
    out.revived = true;
    return out;
  }
  if (itemId === 'remedy') {
    if (mon.status) { mon.status = null; out.statusCleared = true; }
    return out;
  }
  const def = ITEMS?.[itemId];
  const eff = def?.effect ?? {};
  if (mon.hp > 0) {
    const healAmt = eff.heal ?? eff.healAmount ?? null;
    const healPct = eff.healPercent ?? eff.percent ?? null;
    if (healAmt || healPct) mon.hp = Math.min(mon.maxHp, mon.hp + (healAmt ?? Math.round(mon.maxHp * healPct / 100)));
    if (eff.cleanse && mon.status) { mon.status = null; out.statusCleared = true; }
  }
  if (eff.resonanceXp) addResonanceXp(mon, eff.resonanceXp);
  if (!def) warnOnce('item:' + itemId, `[engine] unknown item "${itemId}" used in battle — no recognized effect (data/items.js may not be loaded yet)`);
  return out;
}

// ------------------------------------------------------------ turn ordering
// switch/item/flee act first; bursts are priority+1 moves; regular moves use
// their own priority field; haste breaks ties within a tier.
const TIER = { control: 3, burst: 2, move: 1 };
function tierOf(action) {
  if (!action) return TIER.move;
  if (action.type === 'switch' || action.type === 'item' || action.type === 'flee') return TIER.control;
  if (action.type === 'burst') return TIER.burst;
  return TIER.move;
}

export class BattleEngine {
  constructor(config = {}) {
    this.config = config;
    this.kind = config.kind ?? 'wild';
    this.canFlee = config.canFlee ?? (this.kind === 'wild');
    this.canCatch = config.canCatch ?? (this.kind === 'wild');
    this.ai = config.ai ?? (this.kind === 'boss' ? 'boss' : this.kind === 'wild' ? 'basic' : 'tactical');
    this.arena = config.arena ?? 'meadow';
    this.rng = config.rng ?? Math.random;

    this.pTeam = this._buildTeam(config.playerTeam, 'p');
    this.eTeam = this._buildTeam(config.enemyTeam, 'e');
    this.pActiveIdx = -1;
    this.eActiveIdx = -1;

    this._baseAura = config.weatherAura ?? null;
    this._tempAura = null;
    this.turnNumber = 0;
    this._ended = false;
    this._result = null;
    this._caught = null;
    this._xpAwarded = 0;
    this._participants = new Set();
    this._recentAspects = { p: [], e: [] };
    this._burstReadyQueue = [];
    this.fleeAttempts = 0;

    this.onEvent = null;        // set by the caller
    this.getPlayerAction = null; // set by run()
  }

  // ---------------------------------------------------------------- run loop
  async run(getPlayerAction) {
    this.getPlayerAction = getPlayerAction;
    this._checkEnd();
    if (!this._ended) {
      await this._emit({ type: 'intro', kind: this.kind, enemyName: this.config.enemyName ?? null, arena: this.arena });
      if (this._baseAura && AURAS[this._baseAura]) await this._emit({ type: 'auraStart', kind: this._baseAura });

      this.pActiveIdx = this.pTeam.findIndex((c) => !c.fainted);
      this.eActiveIdx = this.eTeam.findIndex((c) => !c.fainted);
      if (this.pActiveIdx >= 0) {
        this._participants.add(this.pTeam[this.pActiveIdx].mon.uid);
        await this._emit({ type: 'send', side: 'p', mon: this.pTeam[this.pActiveIdx].mon });
      }
      if (this.eActiveIdx >= 0) await this._emit({ type: 'send', side: 'e', mon: this.eTeam[this.eActiveIdx].mon });
      this._checkEnd();

      let guard = 0;
      while (!this._ended && guard < 300) {
        guard++;
        await this._runTurn();
      }
      if (!this._ended) {
        console.error('[engine] battle exceeded the turn safety limit — forcing a result');
        this._finish('loss');
      }
    }
    await this._emit({ type: 'end', result: this._result });
    return this._result;
  }

  async _runTurn() {
    this.turnNumber++;
    await this._emit({ type: 'turnStart', n: this.turnNumber });

    const pCombatant = this._active('p');
    const eCombatant = this._active('e');
    const entries = [];

    entries.push({ side: 'p', combatant: pCombatant, action: await this._safeGetPlayerAction(false) });

    const bossTwo = this.ai === 'boss' && (this.config.boss?.twoActions || this.config.twoActions)
      && eCombatant && !eCombatant.fainted && eCombatant.mon.maxHp
      && (eCombatant.mon.hp / eCombatant.mon.maxHp) <= 0.5;
    entries.push({ side: 'e', combatant: eCombatant, action: await this._getEnemyAction(eCombatant, 0) });
    if (bossTwo) entries.push({ side: 'e', combatant: eCombatant, action: await this._getEnemyAction(eCombatant, 1) });

    const order = this._orderEntries(entries);
    for (const entry of order) {
      if (this._ended) break;
      if (entry.combatant?.fainted) continue;
      await this._executeEntry(entry);
    }
    if (this._ended) return;
    await this._endOfTurn();
  }

  // ---------------------------------------------------------------- events
  async _emit(ev) {
    if (this.onEvent) {
      try { await this.onEvent(ev); }
      catch (e) { console.error('[engine] onEvent handler threw', e); }
    }
    return ev;
  }

  // ---------------------------------------------------------------- teams
  _buildTeam(rawTeam, side) {
    return (rawTeam ?? []).map((mon) => ({
      side, mon, fainted: (mon?.hp ?? 0) <= 0,
      guardTurns: 0, statusStacks: 0, statusTurns: null,
      traitState: {}, usedSurvivorKnot: false,
    }));
  }
  _active(side) {
    const team = side === 'p' ? this.pTeam : this.eTeam;
    const idx = side === 'p' ? this.pActiveIdx : this.eActiveIdx;
    return team[idx] ?? null;
  }
  // trait/burst are SPECIES-level fields (SPECIES[id].trait / .burst), not
  // part of the creature instance schema — resolve through the species.
  _traitOf(combatant) {
    const traitId = SPECIES?.[combatant?.mon?.speciesId]?.trait;
    return TRAITS?.[traitId] ?? null;
  }
  _checkEnd() {
    if (this._ended) return;
    const pAlive = this.pTeam.some((c) => !c.fainted);
    const eAlive = this.eTeam.some((c) => !c.fainted);
    if (!pAlive) this._finish('loss');
    else if (!eAlive) this._finish('win');
  }
  _finish(outcome) {
    if (this._ended) return;
    this._ended = true;
    const glim = (outcome === 'win' || outcome === 'caught')
      ? (this.config.glimReward ?? glimForBattle(this.kind, this.eTeam.map((c) => c.mon)))
      : 0;
    if (outcome === 'win') {
      for (const uid of this._participants) {
        const c = this.pTeam.find((x) => x.mon.uid === uid);
        if (c && c.mon.hp > 0) addResonanceXp(c.mon, this.kind === 'wild' ? 3 : 6);
      }
    }
    this._result = { outcome, xp: this._xpAwarded, glim, caught: this._caught };
  }

  // ---------------------------------------------------------------- views
  _combatView(combatant) {
    const mon = combatant.mon;
    const species = SPECIES?.[mon.speciesId];
    const talisman = TALISMAN_EFFECTS[mon.talisman];
    return {
      level: mon.level, stats: mon.stats, statStages: mon.statStages, status: mon.status,
      aspects: species?.aspects ?? ['neutral'],
      talisman: talisman ? { ...talisman } : undefined,
      statMults: mon.hollowed ? HOLLOWED_STAT_MULTS : undefined,
    };
  }
  async _computeOutMult(attacker, defender, move) {
    let mult = 1;
    const a = await this._runHook('modDamageOut', attacker, { foe: defender, move });
    if (typeof a === 'number' && isFinite(a)) mult *= a;
    const b = await this._runHook('onLowHP', attacker, { foe: defender, move, dir: 'damageOut' });
    if (typeof b === 'number' && isFinite(b)) mult *= b;
    return mult;
  }
  async _computeInMult(defender, attacker, move) {
    let mult = 1;
    const a = await this._runHook('modDamageIn', defender, { foe: attacker, move });
    if (typeof a === 'number' && isFinite(a)) mult *= a;
    const b = await this._runHook('onLowHP', defender, { foe: attacker, move, dir: 'damageIn' });
    if (typeof b === 'number' && isFinite(b)) mult *= b;
    return mult;
  }
  _moveEntries(combatant) {
    return (combatant.mon.moves ?? []).map((id) => ({ id, def: ABILITIES?.[id] ? { id, ...ABILITIES[id] } : null }));
  }
  _burstEntry(combatant) {
    const id = SPECIES?.[combatant.mon.speciesId]?.burst;
    if (!id) return null;
    const raw = BURSTS?.[id];
    if (!raw) return null;
    return { id, def: { id, ...raw, kind: raw.kind ?? 'might', priority: (raw.priority ?? 0) + BURST_PRIORITY_BONUS } };
  }
  _sideSummary(side, { includeMoves = false } = {}) {
    const combatant = this._active(side);
    if (!combatant) return null;
    const cv = this._combatView(combatant);
    const out = {
      mon: combatant.mon, hp: combatant.mon.hp, maxHp: combatant.mon.maxHp,
      hpFrac: combatant.mon.maxHp ? combatant.mon.hp / combatant.mon.maxHp : 0,
      status: combatant.mon.status, aspects: cv.aspects, hollowed: !!combatant.mon.hollowed,
      statStages: combatant.mon.statStages, burstCharge: combatant.mon.burstCharge ?? 0,
      canBurst: (combatant.mon.burstCharge ?? 0) >= BURST_CHARGE_MAX,
      combatView: cv,
    };
    if (includeMoves) { out.moves = this._moveEntries(combatant); out.burstMove = this._burstEntry(combatant); }
    return out;
  }
  _teamList(side) {
    const team = side === 'p' ? this.pTeam : this.eTeam;
    return team.map((c) => ({
      mon: c.mon, hpFrac: c.mon.maxHp ? c.mon.hp / c.mon.maxHp : 0, fainted: c.fainted,
      aspects: SPECIES?.[c.mon.speciesId]?.aspects ?? ['neutral'],
    }));
  }
  _aiViewFor(side, { mustSwitch = false } = {}) {
    const foeSide = side === 'p' ? 'e' : 'p';
    const activeIdx = side === 'p' ? this.pActiveIdx : this.eActiveIdx;
    const team = side === 'p' ? this.pTeam : this.eTeam;
    return {
      self: this._sideSummary(side, { includeMoves: true }),
      foe: this._sideSummary(foeSide),
      team: this._teamList(side),
      selfIndex: activeIdx,
      canSwitch: team.some((c, i) => i !== activeIdx && !c.fainted),
      mustSwitch, turnNumber: this.turnNumber, aura: this._auraKind(),
      recentFoeAspects: this._recentAspects[foeSide] ?? [],
    };
  }
  _playerViewFor(mustSwitch) {
    const base = this._aiViewFor('p', { mustSwitch });
    return {
      self: base.self, foe: base.foe, party: this._teamList('p'),
      canFlee: this.canFlee && this.kind === 'wild',
      canCatch: this.canCatch && this.kind === 'wild',
      bag: G.bag, mustSwitch, legalActions: mustSwitch ? ['switch'] : undefined,
      turnNumber: this.turnNumber, aura: base.aura,
    };
  }

  // ---------------------------------------------------------------- actions in
  async _safeGetPlayerAction(mustSwitch) {
    const view = this._playerViewFor(mustSwitch);
    let action = null;
    if (typeof this.getPlayerAction === 'function') {
      try { action = await this.getPlayerAction(view); }
      catch (e) { console.error('[engine] getPlayerAction threw', e); }
    }
    return this._validateAction(action, mustSwitch);
  }
  _validateAction(action, mustSwitch) {
    if (mustSwitch) {
      if (action?.type === 'switch' && this.pTeam[action.index] && !this.pTeam[action.index].fainted) return action;
      warnOnce('bad-forced-switch', '[engine] getPlayerAction returned an invalid forced-switch action — auto-picking');
      return { type: 'switch', index: this.pTeam.findIndex((c) => !c.fainted) };
    }
    const t = action?.type;
    if (t === 'move' || t === 'switch' || t === 'item' || t === 'catch' || t === 'flee' || t === 'burst') return action;
    warnOnce('bad-action', '[engine] getPlayerAction returned an unrecognized action — defaulting to the first move');
    const active = this._active('p');
    return { type: 'move', moveId: active?.mon.moves?.[0] ?? null };
  }
  async _getEnemyAction(combatant, actionIndex = 0) {
    if (!combatant || combatant.fainted) return null;
    const view = this._aiViewFor('e');
    let action;
    try { action = chooseAction(this.ai, view, { rng: this.rng, actionIndex }); }
    catch (e) { console.error('[engine] ai.chooseAction threw', e); action = null; }
    if (!action) return { type: 'move', moveId: null };
    if (action.type === 'burst' && !view.self.canBurst) return { type: 'move', moveId: null };
    if (action.type === 'switch' && !(this.eTeam[action.index] && !this.eTeam[action.index].fainted)) return { type: 'move', moveId: null };
    return action;
  }

  // ---------------------------------------------------------------- ordering
  _resolveBurstOrFallback(combatant) {
    if ((combatant.mon.burstCharge ?? 0) < BURST_CHARGE_MAX) {
      warnOnce('burst-invalid:' + combatant.mon.uid, '[engine] burst action requested without full charge — using Struggle instead');
      return lookupMove(null);
    }
    const entry = this._burstEntry(combatant);
    if (!entry) {
      const burstId = SPECIES?.[combatant.mon.speciesId]?.burst;
      warnOnce('burst-missing:' + burstId, `[engine] burst id "${burstId}" not found in BURSTS — using Struggle instead`);
      return lookupMove(null);
    }
    return entry.def;
  }
  _prepareEntry(entry) {
    if (!entry.action) return entry;
    if (entry.action.type === 'move') entry.moveDef = lookupMove(entry.action.moveId);
    else if (entry.action.type === 'burst') entry.moveDef = this._resolveBurstOrFallback(entry.combatant);
    return entry;
  }
  _orderEntries(entries) {
    const withMeta = entries.map((e) => {
      this._prepareEntry(e);
      const tier = tierOf(e.action);
      const priority = (tier === TIER.move && e.action?.type === 'move') ? (e.moveDef?.priority ?? 0) : 0;
      const haste = e.combatant ? effectiveStat(this._combatView(e.combatant), 'haste') : 0;
      return { ...e, tier, priority, haste, rand: this.rng() };
    });
    withMeta.sort((a, b) => (b.tier - a.tier) || (b.priority - a.priority) || (b.haste - a.haste) || (b.rand - a.rand));
    return withMeta;
  }
  async _executeEntry(entry) {
    const { side, combatant, action } = entry;
    if (!action || !combatant || combatant.fainted) return;
    switch (action.type) {
      case 'switch': return this._doSwitch(side, action.index, { voluntary: true });
      case 'item': return this._doItem(side, combatant, action);
      case 'flee': return this._doFlee(side, combatant);
      case 'catch': return this._doCatch(combatant, action);
      case 'burst': return this._doAttack(side, combatant, entry.moveDef, true);
      case 'move':
      default: return this._doAttack(side, combatant, entry.moveDef ?? lookupMove(action.moveId), false);
    }
  }

  // ---------------------------------------------------------------- switch
  async _doSwitch(side, index, { voluntary = true } = {}) {
    const team = side === 'p' ? this.pTeam : this.eTeam;
    if (index == null || index < 0 || index >= team.length || team[index].fainted) {
      warnOnce('switch:' + side, `[engine] invalid switch target for side "${side}" — ignored`);
      return;
    }
    if (voluntary) {
      const cur = this._active(side);
      if (cur?.mon.status === 'root') return; // root: cannot switch (a forced switch after fainting still may)
    }
    const curIdx = side === 'p' ? this.pActiveIdx : this.eActiveIdx;
    if (curIdx === index) return;
    const cur = team[curIdx];
    if (cur && !cur.fainted) await this._emit({ type: 'recall', side, mon: cur.mon });
    if (side === 'p') this.pActiveIdx = index; else this.eActiveIdx = index;
    const next = team[index];
    next.guardTurns = 0;
    if (side === 'p') this._participants.add(next.mon.uid);
    await this._emit({ type: 'send', side, mon: next.mon });
    await this._runHook('onSwitchIn', next, { foe: this._active(side === 'p' ? 'e' : 'p') });
  }

  // ---------------------------------------------------------------- item
  async _doItem(side, actorCombatant, action) {
    const team = side === 'p' ? this.pTeam : this.eTeam;
    const target = action.targetUid ? (team.find((c) => c.mon.uid === action.targetUid) ?? actorCombatant) : actorCombatant;
    const itemId = action.itemId;
    if (!itemId) return;
    if (!spendItem(itemId, 1)) { warnOnce('item-spend:' + itemId, `[engine] tried to use "${itemId}" with none in the bag`); return; }
    const before = target.mon.hp;
    const result = applyItemEffect(itemId, target.mon);
    const healed = target.mon.hp - before;
    if (healed > 0) await this._emit({ type: 'heal', side, amt: healed });
    if (result.statusCleared) await this._emit({ type: 'statusApplied', side, status: null });
    if (result.revived) target.fainted = false;
  }

  // ---------------------------------------------------------------- flee
  async _doFlee(side, combatant) {
    if (side !== 'p' || !this.canFlee || this.kind !== 'wild') {
      warnOnce('flee-invalid', '[engine] flee attempted outside a fleeable wild battle — ignored');
      return;
    }
    if (combatant.mon.status === 'root') return; // root: cannot flee
    const foe = this._active('e');
    const myHaste = effectiveStat(this._combatView(combatant), 'haste');
    const foeHaste = foe ? effectiveStat(this._combatView(foe), 'haste') : myHaste;
    const chance = fleeChance(myHaste, foeHaste, this.fleeAttempts);
    this.fleeAttempts++;
    if (this.rng() < chance) this._finish('flee');
  }

  // ---------------------------------------------------------------- catch
  async _doCatch(playerCombatant, action) {
    if (!this.canCatch || this.kind !== 'wild') {
      warnOnce('catch-invalid', '[engine] catch attempted outside a catchable wild battle — ignored');
      return;
    }
    const target = this._active('e');
    if (!target || target.fainted) return;
    const charmId = action.charmId;
    if (!charmId || !spendItem(charmId, 1)) {
      warnOnce('catch-spend:' + charmId, `[engine] no "${charmId}" charm available — catch ignored`);
      return;
    }
    const species = SPECIES?.[target.mon.speciesId];
    const capTarget = {
      hp: target.mon.hp, maxHp: target.mon.maxHp, status: target.mon.status,
      hollowed: !!target.mon.hollowed, rarity: species?.rarity,
    };
    const { shakes, success } = attemptCapture(charmId, capTarget, this.rng);
    await this._emit({ type: 'catchAttempt', shakes, success });
    if (success) {
      markCodex(target.mon.speciesId, 'caught');
      if (G.party.length < 5) {
        G.party.push(target.mon);
      } else {
        G.reserve.push(target.mon);
        // Long duration so the toast survives the battle outro (HUD toasts are
        // hidden until the battle screen releases).
        bus.emit('notify', {
          text: `${species?.name ?? target.mon.speciesId} was sent to the Haven — your party is full.`,
          icon: '✦', duration: 8000,
        });
      }
      bus.emit('party:changed');
      this._caught = target.mon;
      this._finish('caught');
    }
  }

  // ---------------------------------------------------------------- attack
  _trackAspect(side, aspect) {
    if (!aspect) return;
    const arr = this._recentAspects[side];
    arr.push(aspect);
    if (arr.length > 4) arr.shift();
  }
  _gainBurstCharge(combatant, base) {
    if (combatant.fainted) return;
    const mult = combatant.mon.status === 'dread' ? BURST_DREAD_CHARGE_MULT : 1;
    const prev = combatant.mon.burstCharge ?? 0;
    const next = Math.min(BURST_CHARGE_MAX, prev + base * mult);
    combatant.mon.burstCharge = next;
    if (prev < BURST_CHARGE_MAX && next >= BURST_CHARGE_MAX) this._burstReadyQueue.push(combatant.side);
  }
  async _flushBurstReady() {
    while (this._burstReadyQueue.length) {
      const side = this._burstReadyQueue.shift();
      await this._emit({ type: 'burstReady', side });
    }
  }
  _auraKind() { return this._tempAura?.kind ?? this._baseAura ?? null; }
  async _applyAura(kind) {
    if (!kind || !AURAS[kind]) { warnOnce('aura:' + kind, `[engine] unknown aura kind "${kind}" — ignored`); return; }
    this._tempAura = { kind, turnsLeft: 5 };
    await this._emit({ type: 'auraStart', kind });
  }
  async _healCombatant(combatant, percent, flatAmt) {
    if (!combatant || combatant.fainted) return 0;
    const before = combatant.mon.hp;
    const amt = flatAmt != null ? flatAmt : Math.round(combatant.mon.maxHp * (percent ?? 0) / 100);
    combatant.mon.hp = Math.min(combatant.mon.maxHp, combatant.mon.hp + Math.max(0, amt));
    const healed = combatant.mon.hp - before;
    if (healed > 0) await this._emit({ type: 'heal', side: combatant.side, amt: healed });
    return healed;
  }
  async _applyStatStage(target, side, stat, stages) {
    if (!stat || !target || target.fainted) return 0;
    const cur = target.mon.statStages[stat] ?? 0;
    const next = clampStage(cur + stages);
    const delta = next - cur;
    target.mon.statStages[stat] = next;
    await this._emit({ type: 'statStage', side, stat, delta });
    return delta;
  }
  // opts: { attacker (combatant that caused this — enables trait 'reflect'),
  // noReflect (set internally so a reflect bounce can't chain a second time) }.
  async _tryApplyStatus(target, side, status, opts = {}) {
    if (!status || target.fainted) return false;
    if (target.mon.status) return false; // one status at a time
    const trait = this._traitOf(target);
    if (trait?.hook === 'immuneStatus' && (trait.status === 'any' || trait.status === status)) return false;
    let cancel = false;
    await this._runHook('onStatusApplied', target, {
      status, cancel: (v) => (cancel = v), attacker: opts.attacker ?? null, noReflect: !!opts.noReflect,
    });
    if (cancel) return false;
    target.mon.status = status;
    target.statusStacks = 0;
    target.statusTurns = STATUS_DURATION[status] ?? null;
    await this._emit({ type: 'statusApplied', side, status });
    if (status === 'dread') await this._applyStatStage(target, side, 'aegis', DREAD_AEGIS_STAGE);
    return true;
  }

  async _doAttack(side, attacker, moveDef, isBurst) {
    if (!attacker || attacker.fainted) return;
    const foeSide = side === 'p' ? 'e' : 'p';
    const defender = this._active(foeSide);
    if (!defender || defender.fainted) return;

    if (attacker.mon.status === 'shock' && this.rng() < 0.25) {
      await this._emit({ type: 'moveUsed', side, mon: attacker.mon, move: moveDef });
      await this._emit({ type: 'miss', side, mon: attacker.mon, reason: 'shock' });
      return;
    }

    this._trackAspect(side, moveDef.aspect);
    await this._emit({ type: 'moveUsed', side, mon: attacker.mon, move: moveDef });
    if (isBurst) {
      attacker.mon.burstCharge = 0;
      await this._emit({ type: 'burstUsed', side, mon: attacker.mon, burst: moveDef });
    }

    const attView = this._combatView(attacker);
    const defView = this._combatView(defender);
    attView.outMult = await this._computeOutMult(attacker, defender, moveDef);
    defView.inMult = await this._computeInMult(defender, attacker, moveDef);
    defView.guard = defender.guardTurns > 0;

    const acc = accuracyOf(moveDef, attView, defView);
    const hitRoll = acc >= 999 || this.rng() * 100 < acc;
    if (!hitRoll) {
      await this._emit({ type: 'miss', side, mon: attacker.mon });
      return;
    }
    if (defender.guardTurns > 0) defender.guardTurns--;

    let totalDmg = 0;
    if (moveDef.power) {
      const multi = moveDef.effects?.find((e) => e.type === 'multihit');
      const hits = multi ? multi.min + Math.floor(this.rng() * (multi.max - multi.min + 1)) : 1;
      for (let i = 0; i < Math.max(1, hits); i++) {
        if (defender.fainted) break;
        const res = computeDamage(attView, defView, moveDef, { aura: this._auraKind(), rng: this.rng });
        let dmg = res.dmg;
        if (dmg > 0) {
          if (defender.mon.talisman === 'survivor_knot' && !defender.usedSurvivorKnot
            && defender.mon.hp > 1 && defender.mon.hp - dmg <= 0) {
            dmg = defender.mon.hp - 1;
            defender.usedSurvivorKnot = true;
          }
          defender.mon.hp = Math.max(0, defender.mon.hp - dmg);
          totalDmg += dmg;
          this._gainBurstCharge(attacker, BURST_CHARGE_ON_DEAL);
          this._gainBurstCharge(defender, BURST_CHARGE_ON_TAKEN);
        }
        await this._emit({ type: 'hit', side: foeSide, dmg, eff: res.eff, crit: res.crit, hpLeft: defender.mon.hp });
        await this._flushBurstReady();
        // onHit: the attacker reacting to landing a blow — fires even on a
        // finishing hit (the attacker is still standing either way).
        if (dmg > 0) await this._runHook('onHit', attacker, { foe: defender, move: moveDef });
        if (defender.mon.hp <= 0) { await this._handleFaintCheck(defender, foeSide); break; }
        // onHitTaken: the defender reacting to being struck — only while it
        // actually survived this hit (a fainted creature cannot react).
        if (dmg > 0) await this._runHook('onHitTaken', defender, { foe: attacker, move: moveDef });
      }
    }
    if (this._ended) return;

    await this._applyMoveEffects(moveDef, attacker, defender, side, foeSide, { totalDmg });
    if (this._ended) return;
    if (!defender.fainted && defender.mon.hp <= 0) await this._handleFaintCheck(defender, foeSide);
    if (!attacker.fainted && attacker.mon.hp <= 0) await this._handleFaintCheck(attacker, side);
  }

  async _applyMoveEffects(moveDef, attacker, defender, side, foeSide, meta) {
    for (const eff of moveDef.effects ?? []) {
      if (this._ended) return;
      const roll = eff.chance == null ? true : this.rng() * 100 < eff.chance;
      if (!roll) continue;
      switch (eff.type) {
        case 'status':
          if (!defender.fainted) await this._tryApplyStatus(defender, foeSide, eff.status, { attacker });
          break;
        case 'statStage': {
          const isSelf = eff.target === 'self';
          const target = isSelf ? attacker : defender;
          const tSide = isSelf ? side : foeSide;
          if (!target.fainted) await this._applyStatStage(target, tSide, eff.stat, eff.stages ?? 1);
          break;
        }
        case 'heal':
          await this._healCombatant(attacker, eff.percent ?? 25);
          break;
        case 'drain':
          if (meta.totalDmg > 0) await this._healCombatant(attacker, null, Math.round(meta.totalDmg * (eff.percent ?? 50) / 100));
          break;
        case 'recoil':
          if (meta.totalDmg > 0) {
            const amt = Math.round(meta.totalDmg * (eff.percent ?? 25) / 100);
            const before = attacker.mon.hp;
            attacker.mon.hp = Math.max(0, attacker.mon.hp - amt);
            const lost = before - attacker.mon.hp;
            if (lost > 0) await this._emit({ type: 'heal', side, amt: -lost });
            if (attacker.mon.hp <= 0) await this._handleFaintCheck(attacker, side);
          }
          break;
        case 'cleanse':
          if (attacker.mon.status) {
            attacker.mon.status = null; attacker.statusStacks = 0; attacker.statusTurns = null;
            await this._emit({ type: 'statusApplied', side, status: null });
          }
          break;
        case 'guard':
          attacker.guardTurns = 1;
          break;
        case 'aura':
          await this._applyAura(eff.kind);
          break;
        case 'flee':
          if (side === 'p' && this.canFlee && this.kind === 'wild' && attacker.mon.status !== 'root') this._finish('flee');
          break;
        case 'priority':
          // Turn order already resolved from move.priority before effects run
          // (see _orderEntries) — accepted for data-authoring convenience only.
          break;
        case 'multihit':
          break; // handled in the damage loop above
        default:
          warnOnce('effect:' + eff.type, `[engine] unknown ability effect type "${eff.type}" — ignored`);
      }
    }
  }

  // ---------------------------------------------------------------- turn end
  async _endOfTurn() {
    for (const s of ['p', 'e']) {
      const c = this._active(s);
      if (!c || c.fainted) continue;
      const status = c.mon.status;
      if (DOT_STATUSES.includes(status)) {
        const dmg = statusTickDamage(status, c.mon.maxHp, c.statusStacks ?? 0);
        c.mon.hp = Math.max(0, c.mon.hp - dmg);
        c.statusStacks = (c.statusStacks ?? 0) + 1;
        await this._emit({ type: 'statusTick', side: s, status, dmg });
        if (c.mon.hp <= 0) { await this._handleFaintCheck(c, s); if (this._ended) return; }
      }
    }
    for (const s of ['p', 'e']) {
      const c = this._active(s);
      if (!c || c.fainted || !c.mon.status || c.statusTurns == null) continue;
      c.statusTurns--;
      if (c.statusTurns <= 0) {
        c.mon.status = null; c.statusStacks = 0; c.statusTurns = null;
        await this._emit({ type: 'statusApplied', side: s, status: null });
      }
    }
    if (this._ended) return;
    for (const s of ['p', 'e']) {
      const c = this._active(s);
      if (!c || c.fainted) continue;
      await this._runHook('onTurnEnd', c, { foe: this._active(s === 'p' ? 'e' : 'p') });
      if (c.mon.hp <= 0) { await this._handleFaintCheck(c, s); if (this._ended) return; }
    }
    if (this._tempAura) {
      this._tempAura.turnsLeft--;
      if (this._tempAura.turnsLeft <= 0) { this._tempAura = null; await this._emit({ type: 'auraEnd' }); }
    }
    this._checkEnd();
  }

  async _handleFaintCheck(combatant, side) {
    if (!combatant || combatant.fainted || combatant.mon.hp > 0) return;
    combatant.fainted = true;
    combatant.mon.hp = 0;
    await this._emit({ type: 'faint', side });

    if (side === 'e') await this._awardXpForFaint(combatant.mon);
    if (this._ended) return;

    const team = side === 'p' ? this.pTeam : this.eTeam;
    if (!team.some((c) => !c.fainted)) { this._finish(side === 'p' ? 'loss' : 'win'); return; }
    await this._forcedSwitch(side);
  }
  async _forcedSwitch(side) {
    if (side === 'p') {
      const action = await this._safeGetPlayerAction(true);
      let idx = action?.type === 'switch' ? action.index : -1;
      if (idx < 0 || idx >= this.pTeam.length || this.pTeam[idx].fainted) idx = this.pTeam.findIndex((c) => !c.fainted);
      if (idx >= 0) await this._doSwitch('p', idx, { voluntary: false });
    } else {
      const view = this._aiViewFor('e', { mustSwitch: true });
      let idx;
      try { idx = chooseSwitch(this.ai, view); } catch (e) { console.error('[engine] ai.chooseSwitch threw', e); idx = -1; }
      if (idx == null || idx < 0 || idx >= this.eTeam.length || this.eTeam[idx].fainted) idx = this.eTeam.findIndex((c) => !c.fainted);
      if (idx >= 0) await this._doSwitch('e', idx, { voluntary: false });
    }
  }
  async _awardXpForFaint(faintedMon) {
    const species = SPECIES?.[faintedMon.speciesId];
    const base = xpForFaint(species ?? {}, faintedMon.level ?? 5);
    for (const c of this.pTeam) {
      if (c.mon.hp <= 0) continue;
      const share = this._participants.has(c.mon.uid) ? base : Math.round(base * RESERVE_XP_SHARE);
      if (share <= 0) continue;
      const { levelups } = addXp(c.mon, share);
      this._xpAwarded += share;
      await this._emit({ type: 'xp', mon: c.mon, amount: share, levelups });
    }
  }

  // ---------------------------------------------------------------- traits
  async _runHook(hookName, combatant, ctx = {}) {
    const trait = this._traitOf(combatant);
    if (!trait?.hook) return undefined;
    if (!checkHookKnown(trait.hook)) return undefined;
    if (trait.hook !== hookName) return undefined;
    const impl = HOOK_IMPLS[trait.hook];
    if (!impl) return undefined;
    if (!combatant.traitState) combatant.traitState = {};
    return impl(trait, combatant, ctx, this);
  }
}
