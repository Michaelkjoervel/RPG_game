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
// TRAIT HOOK VOCABULARY (the contract this engine implements from data).
// abilities.js's TRAITS entries are pure DATA: { hook: '<name>', ...params }.
// If src/data/abilities.js exists when another agent reads this, its own
// header is the source of truth; this engine implements the following <=10
// hooks and is defensive about anything else: an unrecognized hook name
// warns ONCE (console.warn) and is otherwise silently ignored — it never
// throws. A trait fires only at the lifecycle point matching its own hook;
// most params below are read permissively (several optional key names) so
// data authored slightly differently still mostly works.
//
//   onSwitchIn    { stat, stages, target:'self'|'foe' }
//     Fires when the Kindred is sent into battle (battle start or a switch).
//     Applies a one-off stat-stage change (e.g. an intimidate-style -1 to
//     the foe's might on entry).
//
//   onTurnEnd     { healPercent, chance? }
//     Fires at the end of every turn this Kindred is active and unfainted.
//     Heals healPercent% of max HP (optionally gated by chance, 0-100).
//
//   onLowHP       { threshold?(0-1, default 1/3), stat, stages }
//     Fires once, the moment HP first drops below `threshold` (re-arms if
//     healed back above it). Applies a one-off stat-stage change to self —
//     a "second wind" archetype. For a continuous damage-boost-while-low
//     effect (e.g. "kindleheart"), use modDamageOut/modDamageIn's own
//     hpBelow/hpAbove gate instead — it re-evaluates every hit.
//
//   onStatusApplied { cancel?:true, blockStatuses?:string[] }
//     Fires right before a status would be applied to self; setting cancel
//     blocks it outright. For a *permanent* immunity, prefer immuneStatus.
//
//   onStatusCleared { healPercent }
//     Fires after a status leaves self (cleanse/remedy/root's expiry).
//
//   modDamageOut  { aspect?, moveKind?, hpBelow?, hpAbove?, once?, mult }
//     Multiplies damage self DEALS. Gates: aspect (only that move aspect),
//     moveKind ('might'|'focus'), hpBelow/hpAbove (self's hp fraction),
//     once (fires only the first time it would apply, per battle).
//
//   modDamageIn   { aspect?, moveKind?, hpBelow?, hpAbove?, once?, mult }
//     Same gates/shape as modDamageOut, but multiplies damage self TAKES.
//
//   immuneStatus  { statuses?:string[], status?:string, all?:true }
//     Self can never be afflicted by any status in the list (or all of
//     them). Checked before a status application is attempted.
//
//   onFaint       { stat, stages }
//     Fires when self faints. Applies a stat-stage change to the FOE (a
//     "parting gift" archetype) — self is gone, so there is no self target.
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
  'onSwitchIn', 'onTurnEnd', 'onLowHP', 'onStatusApplied', 'onStatusCleared',
  'modDamageOut', 'modDamageIn', 'immuneStatus', 'onFaint',
]);
function checkHookKnown(hookName) {
  if (KNOWN_HOOKS.has(hookName)) return true;
  warnOnce('hook:' + hookName,
    `[engine] trait hook "${hookName}" is not implemented by the combat engine — ignoring. ` +
    `Known hooks: ${[...KNOWN_HOOKS].join(', ')}`);
  return false;
}
function damageModValue(trait, self, move) {
  if (!move) return 1;
  if (trait.aspect && move.aspect !== trait.aspect) return 1;
  if (trait.moveKind && move.kind !== trait.moveKind) return 1;
  const frac = self.mon.maxHp ? self.mon.hp / self.mon.maxHp : 1;
  if (trait.hpBelow != null && frac >= trait.hpBelow) return 1;
  if (trait.hpAbove != null && frac <= trait.hpAbove) return 1;
  if (trait.once) {
    if (self.traitState.onceFired) return 1;
    self.traitState.onceFired = true;
  }
  return trait.mult ?? trait.multiplier ?? 1;
}
const HOOK_IMPLS = {
  async onSwitchIn(trait, self, ctx, battle) {
    if (trait.stat && trait.stages) {
      const target = trait.target === 'self' ? self : ctx.foe;
      if (target && !target.fainted) await battle._applyStatStage(target, target.side, trait.stat, trait.stages);
    }
  },
  async onTurnEnd(trait, self, ctx, battle) {
    if (trait.chance != null && battle.rng() * 100 >= trait.chance) return;
    if (trait.healPercent) await battle._healCombatant(self, trait.healPercent);
  },
  async onLowHP(trait, self, ctx, battle) {
    const threshold = trait.threshold ?? (1 / 3);
    const frac = self.mon.maxHp ? self.mon.hp / self.mon.maxHp : 1;
    if (frac < threshold) {
      if (!self.traitState.lowHpTriggered) {
        self.traitState.lowHpTriggered = true;
        if (trait.stat && trait.stages) await battle._applyStatStage(self, self.side, trait.stat, trait.stages);
      }
    } else {
      self.traitState.lowHpTriggered = false;
    }
  },
  onStatusApplied(trait, self, ctx) {
    if (trait.cancel === true) { ctx.cancel?.(true); return; }
    if (Array.isArray(trait.blockStatuses) && trait.blockStatuses.includes(ctx.status)) ctx.cancel?.(true);
  },
  async onStatusCleared(trait, self, ctx, battle) {
    if (trait.healPercent) await battle._healCombatant(self, trait.healPercent);
  },
  modDamageOut(trait, self, ctx) { return damageModValue(trait, self, ctx.move); },
  modDamageIn(trait, self, ctx) { return damageModValue(trait, self, ctx.move); },
  immuneStatus() { return undefined; }, // handled inline in _tryApplyStatus
  async onFaint(trait, self, ctx, battle) {
    if (trait.stat && trait.stages && ctx.foe && !ctx.foe.fainted) {
      await battle._applyStatStage(ctx.foe, ctx.foe.side, trait.stat, trait.stages);
    }
  },
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

    const bossTwo = this.ai === 'boss' && this.config.boss?.twoActions
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
  _traitOf(combatant) { return TRAITS?.[combatant?.mon?.trait] ?? null; }
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
    const v = await this._runHook('modDamageOut', attacker, { foe: defender, move });
    return (typeof v === 'number' && isFinite(v)) ? v : 1;
  }
  async _computeInMult(defender, attacker, move) {
    const v = await this._runHook('modDamageIn', defender, { foe: attacker, move });
    return (typeof v === 'number' && isFinite(v)) ? v : 1;
  }
  _moveEntries(combatant) {
    return (combatant.mon.moves ?? []).map((id) => ({ id, def: ABILITIES?.[id] ? { id, ...ABILITIES[id] } : null }));
  }
  _burstEntry(combatant) {
    const id = combatant.mon.burst;
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
      warnOnce('burst-missing:' + combatant.mon.burst, `[engine] burst id "${combatant.mon.burst}" not found in BURSTS — using Struggle instead`);
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
}
