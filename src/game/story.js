// LUMENFALL — story glue. See docs/ARCHITECTURE.md §Story glue and docs/CONTRACTS_ADDENDUM.md.
// Exports: startNewGame(game), runNpcInteraction(npcData, world), onZoneEnter(zoneId, world).
// Everything else here (SCENES, small helpers) is internal wiring.
//
// Cross-area imports go through the documented contract surfaces only. src/game/creatures.js
// (makeCreature, and optionally healParty) is combat-engine's file and may not exist yet while
// this module is authored in parallel — it is ALWAYS reached via dynamic import, and every
// call site tolerates it being missing or partially implemented (HARD RULES: code defensively).
import { bus } from '../core/events.js';
import { G, resetState, setFlag, gainItem, gainGlim, markCodex } from '../core/state.js';
import { game } from './game.js';
import { STORY_TRIGGERS } from '../data/story.js';
import { NPCS, ASHE_COUNTER_LINE, SQ_SCHOLAR_MURALS } from '../data/npcs.js';
import { QUESTS } from '../data/quests.js';
import { startQuest, completeQuest, updateQuests } from './quests.js';

// --------------------------------------------------------------------------------- utilities
const creaturesMod = () => import('./creatures.js'); // combat-engine's module (see header note)
const dlgUI = () => import('../ui/dialogueUI.js');

async function say(id) {
  const { showDialogueById } = await dlgUI();
  return showDialogueById(id);
}
async function sayLines(lines) {
  const { showDialogue } = await dlgUI();
  return showDialogue({ lines });
}
const notify = (text, icon, duration) => bus.emit('notify', { text, icon, duration });

const ARENA_BY_BIOME = {
  meadow: 'meadow', forest: 'forest', cave: 'cave', lake: 'lake', mountain: 'mountain',
  ruins: 'ruins', spire: 'spire', glade: 'glade', town: 'meadow',
};
function resolveGame(ctx) { return ctx?.game ?? ctx ?? game; }
function resolveBiome(ctx) { return ctx?.zone?.biome; }

/** Builds enemy instances via game/creatures.js#makeCreature and hands the whole thing to
 * Game#startBattle. `ctx` may be a World (has .game/.zone) or the Game singleton itself
 * (used before the overworld exists, e.g. the tutorial spar). */
async function runBattle(ctx, { team, kind = 'wild', ai = 'basic', twoActions, canFlee = false, canCatch = false, enemyName, weatherAura, fallbackLevel = 5 } = {}) {
  let enemyTeam = [];
  try {
    const { makeCreature } = await creaturesMod();
    enemyTeam = (team ?? []).map((s) => makeCreature(s.speciesId, s.level ?? fallbackLevel, {
      hollowed: !!s.hollowed, talisman: s.talisman ?? null,
    })).filter(Boolean);
  } catch (e) {
    console.error('[story] could not build enemy team (game/creatures.js not ready?)', e);
  }
  const config = {
    playerTeam: G.party, enemyTeam, kind, canFlee, canCatch, ai,
    arena: ARENA_BY_BIOME[resolveBiome(ctx)] ?? 'meadow', enemyName, weatherAura, twoActions,
  };
  const g = resolveGame(ctx);
  try {
    return await g.startBattle(config);
  } catch (e) {
    console.error('[story] battle failed to run', e);
    return null;
  }
}

/** A yes/no prompt built from the dialogue system's own choice list (no separate UI needed):
 * sets a scratch flag from the "accept" choice, reads it back, then cleans up after itself. */
async function confirmViaDialogue(speaker, text, acceptText = 'Accept.', declineText = 'Not yet.') {
  const FLAG = '_confirm_tmp';
  delete G.flags[FLAG];
  await sayLines([{ speaker, text, choices: [{ text: acceptText, flag: FLAG }, { text: declineText }] }]);
  const accepted = !!G.flags[FLAG];
  delete G.flags[FLAG];
  return accepted;
}

async function healPartyNow() {
  try {
    const mod = await creaturesMod();
    if (typeof mod.healParty === 'function') {
      mod.healParty(G.party, { full: true, cureStatus: true, reviveFainted: true, revivePercent: 0.5 });
      return;
    }
  } catch (e) { console.error('[story] healParty (game/creatures.js) failed, using manual fallback', e); }
  // Manual fallback: also revive anyone fainted at 50%, matching the shrine/defeat mercy above.
  for (const m of G.party) {
    if (!m) continue;
    if (m.hp <= 0) m.hp = Math.max(1, Math.round((m.maxHp ?? 1) * 0.5));
    else m.hp = m.maxHp ?? m.hp;
    m.status = null;
  }
}

function resolveBattleConfig(npcData) {
  const b = npcData?.battle;
  if (!b) return null;
  const cfg = typeof b === 'function' ? b(G) : b;
  if (!cfg) return null;
  if (cfg.once && G.flags[cfg.once]) return null;
  return cfg;
}

function applyOnWin(cfg) {
  if (cfg.reward?.glim) gainGlim(cfg.reward.glim);
  for (const it of cfg.reward?.items ?? []) gainItem(it.id, it.qty ?? 1);
  if (cfg.onWin?.sigil != null) {
    G.sigils[cfg.onWin.sigil] = true;
    bus.emit('sigil:gained', { n: cfg.onWin.sigil + 1 });
  }
  if (cfg.onWin?.flag) setFlag(cfg.onWin.flag);
  if (cfg.once) setFlag(cfg.once);
}

async function resolveSide(npcData) {
  const qid = npcData.questId;
  const alreadyActive = !!(qid && G.quests[qid]); // snapshot BEFORE auto-starting below
  if (qid && !alreadyActive) startQuest(qid);

  // Imre's mural counter only advances on visits AFTER the introductory one, so "discuss
  // the murals three times" genuinely means three distinct mural conversations, not two.
  if (npcData.id === 'scholar_imre' && alreadyActive) {
    const q = G.quests.sq_scholar;
    if (q && !q.done) {
      const step = G.flags.sq_scholar_step ?? 0;
      if (step < SQ_SCHOLAR_MURALS) setFlag('sq_scholar_step', step + 1);
    }
  }

  if (qid && G.quests[qid] && !G.quests[qid].done && QUESTS[qid]?.steps[0]?.isDone(G)) completeQuest(qid);
}

// --------------------------------------------------------------------- generic defeat handling
// "on battle loss anywhere": a single bus listener covers EVERY battle in the game (wild
// encounters world-living triggers directly via world.startWildBattle included), since
// game.js unconditionally emits 'battle:end' after every Game#startBattle call.
const SHRINE_ZONES = ['brighthollow', 'dawnmeadow', 'whisperwood', 'mirrorlake', 'skyreach'];
let _suppressDefeatFlow = false;

bus.on('zone:enter', ({ zoneId } = {}) => { if (SHRINE_ZONES.includes(zoneId)) setFlag('last_shrine', zoneId); });

bus.on('battle:end', ({ result } = {}) => {
  if (result?.outcome !== 'loss') return;
  if (_suppressDefeatFlow) return; // the tutorial spar owns its own outcome handling
  handleDefeat().catch((e) => console.error('[story] defeat flow failed', e));
});

async function handleDefeat() {
  await healPartyNow();
  const loss = Math.min(G.glim, Math.round(10 + G.glim * 0.1));
  if (loss > 0) gainGlim(-loss);
  bus.emit('letterbox', { on: true });
  await sayLines([{ speaker: '', text: 'The world dims... but a Warden\'s bond endures.' }]);
  bus.emit('letterbox', { on: false });
  const zoneId = G.flags.last_shrine || 'brighthollow';
  if (game.overworld) {
    try { await game.overworld.loadZone(zoneId); } catch (e) { console.error('[story] respawn zone load failed', e); }
  }
}

// -------------------------------------------------------------------------- Optional puzzles
// Both zone-content areas below placed interactable kinds outside world-living's documented
// chest/shard/shrine/sparkle vocabulary (kind:'pedestal', kind:'valve') and explicitly flagged
// in their own file's integrator note that story.js should own the resulting logic.
const GC_PEDESTALS = ['gc_pedestal_1', 'gc_pedestal_2', 'gc_pedestal_3', 'gc_pedestal_4'];
const RU_VALVES = ['ru_valve_1', 'ru_valve_2', 'ru_valve_3'];
bus.on('flag:set', ({ key } = {}) => {
  if (GC_PEDESTALS.includes(key) && !G.flags.puzzle_gloam_solved && GC_PEDESTALS.every((f) => G.flags[f])) {
    setFlag('puzzle_gloam_solved');
    gainItem('glazed_charm', 1);
    gainGlim(60);
    bus.emit('ui:sfx', { name: 'chest' });
    notify('The crystal pedestals align — a hidden cache clicks open.', '✦');
  }
  if (RU_VALVES.includes(key) && !G.flags.puzzle_ruins_solved && RU_VALVES.every((f) => G.flags[f])) {
    setFlag('puzzle_ruins_solved');
    gainItem('vigil_bloom', 1);
    gainGlim(80);
    bus.emit('ui:sfx', { name: 'door' });
    notify('The water-stair grinds open, level by level, revealing a sealed alcove.', '✦');
  }
});

// =============================================================================== NPC interaction
export async function runNpcInteraction(npcData, world) {
  const player = world?.player;
  player?.setFrozen(true);
  try {
    const dlgId = typeof npcData.dialogue === 'function' ? npcData.dialogue(G) : npcData.dialogue;
    if (dlgId) await say(dlgId);
    await resolveSide(npcData);

    // Merchants: greeting first, then straight into their shop.
    if (npcData.shopId) {
      try { await (await import('../ui/shopUI.js')).showShop(npcData.shopId); }
      catch (e) { console.error('[story] shop failed to open', e); }
      return;
    }

    if (npcData.id === 'archon_sol') { await runSolFinale(world); return; }

    const cfg = resolveBattleConfig(npcData);
    if (!cfg) return;

    if (npcData.kind === 'keeper') {
      const proceed = await confirmViaDialogue(npcData.name, 'Accept the trial?', 'Accept the trial.', 'Not yet.');
      if (!proceed) return;
    }

    const result = await runBattle(world, {
      team: cfg.team, kind: 'warden', ai: cfg.ai, twoActions: cfg.twoActions,
      canFlee: false, canCatch: false, enemyName: npcData.name,
    });

    if (result?.outcome === 'win') {
      applyOnWin(cfg);
      if (npcData.id === 'keeper_liora') startQuest('sq_liora_dapplyn');
      if (cfg.onWin?.sigil != null) world?.game?.autosave?.();
      const pw = typeof npcData.postWinDialogue === 'function' ? npcData.postWinDialogue(G) : npcData.postWinDialogue;
      if (pw) await say(pw);
    } else if (result?.outcome === 'loss') {
      const pl = typeof npcData.postLossDialogue === 'function' ? npcData.postLossDialogue(G) : npcData.postLossDialogue;
      if (pl) await say(pl); // heal/teleport/glim-loss already runs independently via 'battle:end'
    }
  } finally {
    player?.setFrozen(false);
  }
}

// ================================================================================ Sol's finale
async function runSolFinale(world) {
  if (G.flags.postgame) return;
  if (!G.flags.vess_beat || !G.flags.dorn_beat) return; // dialogue already explained why

  if (!G.flags.sol_p1_beat) {
    const result1 = await runBattle(world, {
      team: NPCS.archon_sol.battle.team, kind: 'boss', ai: 'boss', twoActions: true,
      canFlee: false, canCatch: false, enemyName: 'Archon Sol',
    });
    if (result1?.outcome !== 'win') return; // generic defeat flow already ran; try again later
    applyOnWin(NPCS.archon_sol.battle);
    await say('dlg_sol_phase1_win');
  }

  await say('dlg_sol_phase2_pre');
  const result2 = await runBattle(world, {
    team: [{ speciesId: 'thalassyr', level: 45, hollowed: true }], kind: 'boss', ai: 'boss', twoActions: true,
    canFlee: false, canCatch: false, enemyName: 'Archon Sol · Hollowed Thalassyr',
  });
  if (result2?.outcome !== 'win') return;

  bus.emit('letterbox', { on: true });
  await say('dlg_sol_liberation');
  bus.emit('letterbox', { on: false });

  setFlag('postgame');
  setFlag('glade_open');
  gainItem('glade_key', 1);
  markCodex('thalassyr', 'seen');
  completeQuest('q_main_final');
  world?.game?.autosave?.();
  await say(G.flags.sol_epilogue_silent ? 'dlg_sol_epilogue_silent' : 'dlg_sol_epilogue');
  await say('dlg_credits');
}

// ===================================================================================== Scenes
// SCENES: { id: async (world) => {...} }, invoked by onZoneEnter per src/data/story.js.
const SCENES = {};

SCENES.dawnmeadowTip = async () => {
  setFlag('dm_tip_shown');
  notify('Shimmering patches hide wild Kindred — walk into one to meet them.', '✦');
};

SCENES.wwHollowedReveal = async (world) => {
  world?.player?.setFrozen(true);
  bus.emit('letterbox', { on: true });
  await say('dlg_ww_hollowed_reveal');
  bus.emit('letterbox', { on: false });
  // A Hollowed cervalume, specifically — its gentle, Shrine-awakened kin (a dapplyn) makes the
  // corruption land harder, and quietly sets up Keeper Liora's own lost dapplyn later on.
  await runBattle(world, {
    team: [{ speciesId: 'cervalume', level: 14, hollowed: true }], kind: 'wild', ai: 'basic',
    canFlee: false, canCatch: false, enemyName: 'Hollowed Cervalume',
  });
  world?.player?.setFrozen(false);
  setFlag('ww_hollowed_seen');
};

SCENES.shardTheft = async (world) => {
  world?.player?.setFrozen(true);
  bus.emit('letterbox', { on: true });
  await say('dlg_shard_theft');
  bus.emit('letterbox', { on: false });
  world?.player?.setFrozen(false);
  setFlag('shard_stolen');
};

SCENES.gloamAmbush = async (world) => {
  world?.player?.setFrozen(true);
  bus.emit('letterbox', { on: true });
  await say('dlg_gloam_ambush_intro');
  bus.emit('letterbox', { on: false });
  const r1 = await runBattle(world, {
    team: NPCS.seeker_a.battle.team, kind: 'warden', ai: NPCS.seeker_a.battle.ai,
    canFlee: false, canCatch: false, enemyName: 'Seeker',
  });
  if (r1?.outcome !== 'win') { world?.player?.setFrozen(false); return; }
  applyOnWin(NPCS.seeker_a.battle);
  await say('dlg_seeker_a_lose');

  bus.emit('letterbox', { on: true });
  await say('dlg_gloam_ambush_between');
  bus.emit('letterbox', { on: false });
  const r2 = await runBattle(world, {
    team: NPCS.seeker_b.battle.team, kind: 'warden', ai: NPCS.seeker_b.battle.ai,
    canFlee: false, canCatch: false, enemyName: 'Seeker',
  });
  world?.player?.setFrozen(false);
  if (r2?.outcome !== 'win') return;
  applyOnWin(NPCS.seeker_b.battle); // grants the shrine_shard + sets the gloam_ambush_done flag
  await say('dlg_seeker_b_lose');
  await say('dlg_gloam_ambush_after');
  world?.game?.autosave?.();
};

SCENES.asheVessGlimpse = async () => {
  setFlag('ashe_vess_seen');
  await say('dlg_ashe_vess_glimpse');
};

// All five Ashe stages reuse the exact same NPC-interaction flow — ASHE_STAGES + asheStageIndex
// (src/data/npcs.js) always resolve to whichever stage is next, and STORY_TRIGGERS' condition
// already ensures we only fire the one that matches the current zone/story beat.
SCENES.asheStage1 = SCENES.asheStage2 = SCENES.asheStage3 = SCENES.asheStage4 = SCENES.asheStage5 =
  (world) => runNpcInteraction(NPCS.ashe, world);

SCENES.climberBattle1 = async (world) => {
  await say('dlg_bo_pass1');
  const result = await runBattle(world, {
    team: [{ speciesId: 'stratovane', level: 24 }], kind: 'wild', ai: 'basic',
    canFlee: false, canCatch: true, enemyName: 'Panicked Stratovane',
  });
  if (result?.outcome === 'win' || result?.outcome === 'caught') setFlag('sq_climber_b1');
};
SCENES.climberBattle2 = async (world) => {
  await say('dlg_bo_pass2');
  const result = await runBattle(world, {
    team: [{ speciesId: 'stratovane', level: 25 }], kind: 'wild', ai: 'basic',
    canFlee: false, canCatch: true, enemyName: 'Panicked Stratovane',
  });
  if (result?.outcome === 'win' || result?.outcome === 'caught') setFlag('sq_climber_b2');
};

SCENES.lioraDapplynFound = async () => {
  setFlag('liora_dapplyn_found');
  await say('dlg_liora_dapplyn_found');
};

SCENES.ruinsRevelation = async () => {
  setFlag('ruins_revelation_seen');
  bus.emit('letterbox', { on: true });
  await say('dlg_ruins_revelation');
  bus.emit('letterbox', { on: false });
};

SCENES.sancturneTrial = async (world) => {
  world?.player?.setFrozen(true);
  bus.emit('letterbox', { on: true });
  await say('dlg_sancturne_pre');
  bus.emit('letterbox', { on: false });
  const result = await runBattle(world, {
    team: [{ speciesId: 'sancturne', level: 32 }], kind: 'boss', ai: 'boss',
    canFlee: false, canCatch: false, enemyName: 'Sancturne',
  });
  world?.player?.setFrozen(false);
  if (result?.outcome !== 'win') return;

  setFlag('ruins_cleared');
  G.sigils[4] = true;
  bus.emit('sigil:gained', { n: 5 });
  try {
    const { makeCreature } = await creaturesMod();
    const joined = makeCreature('sancturne', 30);
    if (joined) {
      if (G.party.length < 5) G.party.push(joined); else G.reserve.push(joined);
      bus.emit('party:changed');
    }
  } catch (e) { console.error('[story] could not create the joining Sancturne', e); }
  markCodex('sancturne', 'caught');
  await say('dlg_sancturne_join');
  world?.game?.autosave?.();
};

SCENES.spireArrival = async () => {
  setFlag('spire_reached');
  bus.emit('letterbox', { on: true });
  await say('dlg_spire_arrival');
  bus.emit('letterbox', { on: false });
};

SCENES.auriosEncounter = async (world) => {
  await say('dlg_aurios_encounter');
  await runBattle(world, {
    team: [{ speciesId: 'aurios', level: 44 }], kind: 'wild', ai: 'boss', twoActions: true,
    canFlee: true, canCatch: true, enemyName: 'Aurios, the Dawnhart',
  });
};
SCENES.nyxmaraEncounter = async (world) => {
  await say('dlg_nyxmara_encounter');
  await runBattle(world, {
    team: [{ speciesId: 'nyxmara', level: 46 }], kind: 'wild', ai: 'boss', twoActions: true,
    canFlee: true, canCatch: true, enemyName: 'Nyxmara, the Duskveil',
  });
};
SCENES.thalassyrReturn = async (world) => {
  await say('dlg_thalassyr_return');
  await runBattle(world, {
    team: [{ speciesId: 'thalassyr', level: 48 }], kind: 'wild', ai: 'boss', twoActions: true,
    canFlee: true, canCatch: true, enemyName: 'Thalassyr, the Deepdream',
  });
};

// ============================================================================= Zone entry glue
export async function onZoneEnter(zoneId, world) {
  for (const t of STORY_TRIGGERS) {
    if (t.zone !== zoneId) continue;
    if (t.condition && !t.condition(G)) continue;
    const scene = SCENES[t.scene];
    if (!scene) { console.warn(`[story] STORY_TRIGGERS references missing scene "${t.scene}"`); continue; }
    try { await scene(world); } catch (e) { console.error(`[story] scene "${t.id}" threw`, e); }
  }
  updateQuests(G);
}

// =================================================================================== New game
export async function startNewGame(gameRef) {
  const g = gameRef ?? game;
  const keptName = G.playerName;
  resetState();
  G.playerName = keptName || 'Rowan';

  bus.emit('letterbox', { on: true });
  await say('dlg_intro_1');

  const { chooseStarter } = await import('../ui/starterUI.js');
  const speciesId = await chooseStarter(g);
  G.starter = speciesId;

  try {
    const { makeCreature } = await creaturesMod();
    const starter = makeCreature(speciesId, 5, { resonance: 1 });
    if (starter) { starter.resonance = 1; G.party = [starter]; }
  } catch (e) { console.error('[story] could not create the starter (game/creatures.js not ready?)', e); }
  markCodex(speciesId, 'caught');

  // resetState() already seeds the starting bag with 5 woven_charm + 3 tonic (core/state.js) —
  // that IS the "gift items" beat; only the Codex itself (a key item, not part of that default) is ours to grant.
  gainItem('kindred_codex', 1);

  await say('dlg_intro_2');
  await say('dlg_ashe_tutorial_pre');

  _suppressDefeatFlow = true;
  const opponentId = ASHE_COUNTER_LINE[speciesId]?.[0] ?? 'nixling';
  await runBattle(g, {
    team: [{ speciesId: opponentId, level: 5 }], kind: 'warden', ai: 'basic',
    canFlee: false, canCatch: false, enemyName: 'Ashe',
  });
  _suppressDefeatFlow = false;
  await say('dlg_ashe_tutorial_post');

  startQuest('q_main_1');
  startQuest('sq_gleam');

  await say('dlg_intro_3');
  bus.emit('letterbox', { on: false });

  g.autosave();
  await g.enterOverworld('brighthollow');

  // Control hints: queued sequentially AFTER zone entry (the zone-title card and
  // load hitch would otherwise eat them), each lingering long enough to read.
  const hints = [
    'Move with WASD, or the left stick.',
    'Hold Shift, or the run button, to sprint.',
    'Press E near people or things of interest to interact.',
    'Press Esc or Tab any time to open your menu.',
  ];
  hints.forEach((text, i) => setTimeout(() => notify(text, '✦', 6500), 900 + i * 6800));
}
