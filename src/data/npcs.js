// LUMENFALL — NPC definitions. See docs/ARCHITECTURE.md §NPCs/dialogue/quests and
// docs/CONTRACTS_ADDENDUM.md §NPC ids for the pinned id list + base schema.
//
// Schema (addendum): { id, name, kind, appearance:{palette,...}, dialogue, wanderRadius, battle? }
//   dialogue: dialogueId | fn(G) -> dialogueId              — shown BEFORE any battle prompt
//   battle:   battleObj  | fn(G) -> battleObj|null           — EXTENSION: a function lets
//             story-staged fighters (Ashe) compute a team from live state; game/story.js's
//             resolveBattle() accepts either shape. `null` from a fn means "not fightable now".
//   battleObj: { team:[{speciesId,level,hollowed?,talisman?}...], ai:'basic'|'tactical'|'boss',
//                twoActions?:true, reward:{glim,items?:[{id,qty}]}, onWin?:{sigil?,flag?}, once:flagName }
//   postWinDialogue?, postLossDialogue?: dialogueId | fn(G) -> dialogueId — EXTENSION: shown by
//             game/story.js#runNpcInteraction right after a battle resolves (generic defeat/heal
//             flow still runs independently via the bus — see game/story.js).
//
// appearance is read by world/npcs.js (silhouette + palette); keys are descriptive, not code —
// { palette:[primary,secondary,accent?] (hex numbers), hat, robe, mask, build, accessory, hair }.
//
// All selectors below are pure functions of the `G` argument they're given (they never read
// the core/state.js singleton directly) — callers (game/story.js) always pass the live G, so
// this is functionally identical in-game, but keeps this module import-free and unit-testable.

// Coarse story-progress bracket, used to age ambient villager chatter. 0 start .. 4 postgame.
export function storyStage(G) {
  if (G.flags.postgame) return 4;
  if (G.flags.ruins_cleared) return 3;
  if (G.flags.shard_stolen) return 2;
  if (G.sigils[0]) return 1;
  return 0;
}

// Two-era ambient rotation: a small pool of flavor lines that visibly changes once the
// shrine-shard is stolen (the town's mood turns from cozy to worried/resolute).
function ambientVillager(prefix) {
  return (G) => {
    const era = storyStage(G) >= 2 ? 'b' : 'a';
    const n = 1 + Math.floor(Math.random() * 2);
    return `${prefix}_${era}${n}`;
  };
}

// ---------------------------------------------------------------------------------- Ashe (rival)
// Starter-advantage matchup: Ashe always picks the line that's strong against the player's.
export const ASHE_COUNTER_LINE = {
  kindlet: ['nixling', 'maelfin', 'tidelorn'],
  nixling: ['thistlit', 'briarback', 'sylvathorn'],
  thistlit: ['kindlet', 'charvane', 'pyrelith'],
};
export const ASHE_STAGES = [
  { level: 7, flag: 'ashe_1', team: (l) => [{ speciesId: l[0], level: 7 }] },
  { level: 12, flag: 'ashe_2', team: (l) => [
    { speciesId: l[0], level: 12 }, { speciesId: 'pebbin', level: 10 },
  ] },
  { level: 17, flag: 'ashe_3', team: (l) => [
    { speciesId: l[1], level: 17, talisman: 'haste_feather' }, { speciesId: 'pipwing', level: 15 },
  ] },
  { level: 25, flag: 'ashe_4', team: (l) => [
    { speciesId: l[1], level: 25 }, { speciesId: 'shardling', level: 22 }, { speciesId: 'oozel', level: 21 },
  ] },
  { level: 38, flag: 'ashe_5', team: (l) => [
    { speciesId: l[2], level: 38, talisman: 'might_band' }, { speciesId: 'stratovane', level: 34 },
    { speciesId: 'rimehorn', level: 33 }, { speciesId: 'noctyra', level: 32 },
  ] },
];
export function asheStageIndex(G) {
  return ASHE_STAGES.findIndex((s) => !G.flags[s.flag]);
}
function ashelLine(G) {
  return ASHE_COUNTER_LINE[G.starter] ?? ASHE_COUNTER_LINE.kindlet;
}
function ashelBattle(G) {
  const idx = asheStageIndex(G);
  if (idx === -1) return null;
  const stage = ASHE_STAGES[idx];
  const rewardGlim = [60, 110, 180, 280, 420][idx];
  return {
    team: stage.team(ashelLine(G)),
    ai: 'tactical',
    reward: { glim: rewardGlim },
    onWin: { flag: stage.flag },
    once: stage.flag,
  };
}

// -------------------------------------------------------------------------------- Sunkenruins
export const SQ_SCHOLAR_MURALS = 3;

export const NPCS = {
  // ------------------------------------------------------------------------------- Brighthollow
  elder_maren: {
    id: 'elder_maren', name: 'Elder Maren', kind: 'elder',
    appearance: { palette: [0x8a6a4a, 0xe8dcc0], robe: true, hat: 'none', accessory: 'spectacles', hair: 'silver', build: 'slight' },
    wanderRadius: 2,
    dialogue: (G) => {
      if (G.flags.postgame) return 'dlg_maren_postgame';
      if (G.flags.shard_stolen && !G.flags.gloam_ambush_done) return 'dlg_maren_injured';
      if (G.sigils.some(Boolean)) return 'dlg_maren_progress';
      return 'dlg_maren_ambient';
    },
  },
  ashe: {
    id: 'ashe', name: 'Ashe', kind: 'rival',
    appearance: { palette: [0xff8a4a, 0x2a2f3f], hair: 'tousled', accessory: 'satchel', build: 'lean' },
    wanderRadius: 3,
    dialogue: (G) => {
      const idx = asheStageIndex(G);
      return idx === -1 ? 'dlg_ashe_epilogue' : `dlg_ashe_pre_${idx + 1}`;
    },
    battle: ashelBattle,
    // Called AFTER the battle resolves (onWin flag already applied on a win, never applied
    // on a loss) — so a win's index has already advanced past the just-finished stage while
    // a loss's has not. See ASHE_STAGES above.
    postWinDialogue: (G) => { const i = asheStageIndex(G); return `dlg_ashe_win_${i === -1 ? 5 : Math.max(1, i)}`; },
    postLossDialogue: (G) => { const i = asheStageIndex(G); return `dlg_ashe_loss_${i === -1 ? 5 : i + 1}`; },
  },
  merchant_pip: {
    id: 'merchant_pip', name: 'Pip', kind: 'merchant',
    appearance: { palette: [0xd88a3c, 0xf2e6c8], hat: 'straw', accessory: 'apron' },
    wanderRadius: 1,
    dialogue: ambientVillager('dlg_pip'),
  },
  v_bh_1: {
    id: 'v_bh_1', name: 'Old Wick', kind: 'villager',
    appearance: { palette: [0x7a8a6a, 0xd8d4c4], hat: 'none' },
    wanderRadius: 4, dialogue: ambientVillager('dlg_vbh1'),
  },
  v_bh_2: {
    id: 'v_bh_2', name: 'Bea Thorne', kind: 'villager',
    appearance: { palette: [0xc98a5c, 0xe8dcc0], hat: 'straw' },
    wanderRadius: 5, dialogue: ambientVillager('dlg_vbh2'),
  },
  v_bh_3: {
    id: 'v_bh_3', name: 'Corran Vale', kind: 'villager',
    appearance: { palette: [0x5c7a9e, 0xd8d4c4], hat: 'none' },
    wanderRadius: 4, dialogue: ambientVillager('dlg_vbh3'),
  },
  v_bh_4: {
    id: 'v_bh_4', name: 'Nettie Fenn', kind: 'villager',
    appearance: { palette: [0x9e6a8a, 0xe8dcc0], hat: 'none' },
    wanderRadius: 5, dialogue: ambientVillager('dlg_vbh4'),
  },

  // -------------------------------------------------------------------------------- Dawnmeadow
  keeper_bramwell: {
    id: 'keeper_bramwell', name: 'Keeper Bramwell', kind: 'keeper',
    appearance: { palette: [0x6b5636, 0x8fae6a], build: 'broad', accessory: 'stone pauldron', hat: 'none' },
    wanderRadius: 2,
    dialogue: (G) => G.flags.kb_beat ? 'dlg_bramwell_after' : 'dlg_bramwell_greet',
    battle: {
      team: [{ speciesId: 'pebbin', level: 8 }, { speciesId: 'cairnox', level: 9, talisman: 'ward_amulet' }],
      ai: 'tactical', reward: { glim: 90, items: [{ id: 'terrastone', qty: 1 }] },
      onWin: { sigil: 0 }, once: 'kb_beat',
    },
    postWinDialogue: 'dlg_bramwell_win', postLossDialogue: 'dlg_bramwell_loss',
  },

  // -------------------------------------------------------------------------------- Whisperwood
  keeper_liora: {
    id: 'keeper_liora', name: 'Keeper Liora', kind: 'keeper',
    appearance: { palette: [0x5b8a5b, 0xffe9b0], accessory: 'antler circlet', robe: true },
    wanderRadius: 2,
    dialogue: (G) => {
      if (!G.flags.kl_beat) return 'dlg_liora_greet';
      if (G.quests.sq_liora_dapplyn && !G.quests.sq_liora_dapplyn.done) return 'dlg_liora_dapplyn_active';
      return 'dlg_liora_after';
    },
    battle: {
      team: [{ speciesId: 'dapplyn', level: 12 }, { speciesId: 'lanterling', level: 13, talisman: 'focus_lens' }],
      ai: 'tactical', reward: { glim: 140, items: [{ id: 'lumenstone', qty: 1 }] },
      onWin: { sigil: 1 }, once: 'kl_beat',
    },
    postWinDialogue: 'dlg_liora_win', postLossDialogue: 'dlg_liora_loss',
  },
  herbalist_syl: {
    id: 'herbalist_syl', name: 'Herbalist Syl', kind: 'villager', questId: 'sq_herbalist',
    appearance: { palette: [0x6a9e5a, 0xd8c9a3], hat: 'hood', accessory: 'herb satchel' },
    wanderRadius: 2,
    dialogue: (G) => {
      const q = G.quests.sq_herbalist;
      if (!q) return 'dlg_syl_intro';
      if (q.done) return 'dlg_syl_done';
      return (G.bag.tonic ?? 0) >= 3 ? 'dlg_syl_turnin' : 'dlg_syl_active';
    },
  },

  // ------------------------------------------------------------------------------ Gloamcavern
  lanternkeeper_ode: {
    id: 'lanternkeeper_ode', name: 'Lanternkeeper Ode', kind: 'villager', questId: 'sq_lantern',
    appearance: { palette: [0xffb85c, 0x2a2f3f], accessory: 'carried lantern' },
    wanderRadius: 2,
    dialogue: (G) => {
      const q = G.quests.sq_lantern;
      if (!q) return 'dlg_ode_intro';
      if (q.done) return 'dlg_ode_done';
      return (G.bag.lantern_oil ?? 0) >= 1 ? 'dlg_ode_turnin' : 'dlg_ode_active';
    },
  },
  deserter_finn: {
    id: 'deserter_finn', name: 'Finn', kind: 'seeker', questId: 'sq_deserter_finn',
    appearance: { palette: [0x8a8a92, 0xd8d4c4], robe: true, hood: true, mask: 'removed' },
    wanderRadius: 1,
    dialogue: (G) => {
      if (G.flags.finn_helped) return 'dlg_finn_after_help';
      if (G.flags.finn_reported) return 'dlg_finn_after_report';
      return 'dlg_finn_intro';
    },
  },
  seeker_a: {
    id: 'seeker_a', name: 'Seeker', kind: 'seeker',
    appearance: { palette: [0x8a8a92, 0xd8d4c4], robe: true, mask: 'pale', hood: true },
    wanderRadius: 1,
    dialogue: (G) => G.flags.sk_a_beat ? 'dlg_seeker_a_after' : 'dlg_seeker_a_taunt',
    battle: {
      team: [{ speciesId: 'oozel', level: 16 }, { speciesId: 'sludgemaw', level: 16 }],
      ai: 'basic', reward: { glim: 70 }, once: 'sk_a_beat',
    },
    postWinDialogue: 'dlg_seeker_a_lose',
  },
  seeker_b: {
    id: 'seeker_b', name: 'Seeker', kind: 'seeker',
    appearance: { palette: [0x8a8a92, 0xd8d4c4], robe: true, mask: 'pale', hood: true },
    wanderRadius: 1,
    dialogue: (G) => G.flags.sk_b_beat ? 'dlg_seeker_b_after' : 'dlg_seeker_b_taunt',
    battle: {
      team: [{ speciesId: 'sonark', level: 17 }, { speciesId: 'shardling', level: 17, talisman: 'ward_amulet' }],
      ai: 'basic', reward: { glim: 80, items: [{ id: 'shrine_shard', qty: 1 }] },
      onWin: { flag: 'gloam_ambush_done' }, once: 'sk_b_beat',
    },
    postWinDialogue: 'dlg_seeker_b_lose',
  },

  // -------------------------------------------------------------------------------- Mirrorlake
  keeper_maro: {
    id: 'keeper_maro', name: 'Keeper Maro', kind: 'keeper',
    appearance: { palette: [0x2f6a8a, 0xffcf7a], accessory: 'carried lantern', build: 'stocky' },
    wanderRadius: 2,
    dialogue: (G) => G.flags.km_beat ? 'dlg_maro_after' : 'dlg_maro_greet',
    battle: {
      team: [
        { speciesId: 'finnet', level: 17 }, { speciesId: 'bogret', level: 18 },
        { speciesId: 'jellune', level: 18, talisman: 'ward_amulet' },
      ],
      ai: 'tactical', reward: { glim: 190, items: [{ id: 'tidestone', qty: 1 }] },
      onWin: { sigil: 2 }, once: 'km_beat',
    },
    postWinDialogue: 'dlg_maro_win', postLossDialogue: 'dlg_maro_loss',
  },
  ferryman_juno: {
    id: 'ferryman_juno', name: 'Ferryman Juno', kind: 'villager', questId: 'sq_ferry',
    appearance: { palette: [0x4a6a8a, 0xd8d4c4], accessory: 'oilskin coat' },
    wanderRadius: 1,
    dialogue: (G) => {
      const q = G.quests.sq_ferry;
      if (!q) return 'dlg_juno_intro';
      if (q.done) return 'dlg_juno_done';
      return G.flags.gc_chest_ferrygear || (G.bag.ferry_gear ?? 0) >= 1 ? 'dlg_juno_turnin' : 'dlg_juno_active';
    },
  },
  merchant_wren: {
    id: 'merchant_wren', name: 'Wren', kind: 'merchant', questId: 'sq_gleam',
    appearance: { palette: [0x3c7a8a, 0xf2e6c8], hat: 'straw', accessory: 'apron' },
    wanderRadius: 1,
    dialogue: (G) => {
      const q = G.quests.sq_gleam;
      const hasGleam = [...G.party, ...G.reserve].some((m) => m?.shiny);
      if (q?.done) return 'dlg_wren_after';
      if (hasGleam) return 'dlg_wren_gleam_found';
      return ambientVillager('dlg_wren')(G);
    },
  },
  v_dm_1: {
    id: 'v_dm_1', name: 'Tam Kell', kind: 'villager',
    appearance: { palette: [0x5c8a7a, 0xd8d4c4], hat: 'none' },
    wanderRadius: 4, dialogue: ambientVillager('dlg_vdm1'),
  },
  v_dm_2: {
    id: 'v_dm_2', name: 'Ressa Quill', kind: 'villager',
    appearance: { palette: [0x8a6a9e, 0xe8dcc0], hat: 'none' },
    wanderRadius: 4, dialogue: ambientVillager('dlg_vdm2'),
  },

  // --------------------------------------------------------------------------------- Skyreach
  keeper_sera: {
    id: 'keeper_sera', name: 'Keeper Sera', kind: 'keeper',
    appearance: { palette: [0x7a8aa8, 0x2a2f3f], accessory: 'storm goggles', accent: 'coat tails' },
    wanderRadius: 2,
    dialogue: (G) => G.flags.ks_beat ? 'dlg_sera_after' : 'dlg_sera_greet',
    battle: {
      team: [
        { speciesId: 'nimbis', level: 23 }, { speciesId: 'aurelark', level: 23 },
        { speciesId: 'stratovane', level: 24, talisman: 'haste_feather' },
      ],
      ai: 'tactical', reward: { glim: 260, items: [{ id: 'voltstone', qty: 1 }] },
      onWin: { sigil: 3, flag: 'storm_calmed' }, once: 'ks_beat',
    },
    postWinDialogue: 'dlg_sera_win', postLossDialogue: 'dlg_sera_loss',
  },
  climber_bo: {
    id: 'climber_bo', name: 'Climber Bo', kind: 'villager', questId: 'sq_climber',
    appearance: { palette: [0x9e6a3c, 0x7a8aa8], accessory: 'rope & pack' },
    wanderRadius: 2,
    dialogue: (G) => {
      const q = G.quests.sq_climber;
      if (!q) return 'dlg_bo_intro';
      if (q.done) return 'dlg_bo_done';
      return G.flags.sq_climber_b1 ? 'dlg_bo_wait2' : 'dlg_bo_wait1';
    },
  },

  // ---------------------------------------------------------------------------- Sunken Ruins
  scholar_imre: {
    id: 'scholar_imre', name: 'Scholar Imre', kind: 'elder', questId: 'sq_scholar',
    appearance: { palette: [0x8a7a9e, 0xe8dcc0], robe: true, accessory: 'spectacles' },
    wanderRadius: 2,
    dialogue: (G) => {
      const step = G.flags.sq_scholar_step ?? 0;
      if (!G.quests.sq_scholar) return 'dlg_imre_intro';
      if (G.quests.sq_scholar.done) return 'dlg_imre_after';
      return `dlg_imre_mural_${Math.min(step + 1, SQ_SCHOLAR_MURALS)}`;
    },
  },
  seeker_c: {
    id: 'seeker_c', name: 'Seeker', kind: 'seeker',
    appearance: { palette: [0x8a8a92, 0xd8d4c4], robe: true, mask: 'pale', hood: true },
    wanderRadius: 1,
    dialogue: (G) => G.flags.sk_c_beat ? 'dlg_seeker_c_after' : 'dlg_seeker_c_taunt',
    battle: {
      team: [{ speciesId: 'chandelisk', level: 29 }, { speciesId: 'gloomel', level: 28, talisman: 'aegis_veil' }],
      ai: 'tactical', reward: { glim: 220 }, once: 'sk_c_beat',
    },
    postWinDialogue: 'dlg_seeker_c_lose',
  },

  // -------------------------------------------------------------------------------- Hollow Spire
  lt_vess: {
    id: 'lt_vess', name: 'Lieutenant Vess', kind: 'order',
    appearance: { palette: [0xa8d8ff, 0x2a2f3f], accessory: 'pale mask', accent: 'ice-blue coat' },
    wanderRadius: 2,
    dialogue: (G) => G.flags.vess_beat ? 'dlg_vess_after' : 'dlg_vess_greet',
    battle: {
      team: [
        { speciesId: 'rimehorn', level: 27 }, { speciesId: 'noctyra', level: 28 },
        { speciesId: 'vantash', level: 29, talisman: 'ward_amulet' },
      ],
      ai: 'tactical', reward: { glim: 340 }, onWin: { flag: 'vess_beat' }, once: 'vess_beat',
    },
    postWinDialogue: 'dlg_vess_win', postLossDialogue: 'dlg_vess_loss',
  },
  lt_dorn: {
    id: 'lt_dorn', name: 'Lieutenant Dorn', kind: 'order',
    appearance: { palette: [0xc9995c, 0x2a2f3f], build: 'heavy', accessory: 'terra armor' },
    wanderRadius: 2,
    dialogue: (G) => G.flags.dorn_beat ? 'dlg_dorn_after' : 'dlg_dorn_greet',
    battle: {
      team: [
        { speciesId: 'cairnox', level: 31 }, { speciesId: 'sludgemaw', level: 32 },
        { speciesId: 'magmite', level: 33, talisman: 'might_band' },
      ],
      ai: 'tactical', reward: { glim: 380 }, onWin: { flag: 'dorn_beat' }, once: 'dorn_beat',
    },
    postWinDialogue: 'dlg_dorn_win', postLossDialogue: 'dlg_dorn_loss',
  },
  seeker_d: {
    id: 'seeker_d', name: 'Seeker', kind: 'seeker',
    appearance: { palette: [0x8a8a92, 0xd8d4c4], robe: true, mask: 'pale', hood: true },
    wanderRadius: 1,
    dialogue: (G) => G.flags.sk_d_beat ? 'dlg_seeker_d_after' : 'dlg_seeker_d_taunt',
    battle: {
      team: [
        { speciesId: 'reverbane', level: 36, hollowed: true },
        { speciesId: 'sludgemaw', level: 36, hollowed: true },
      ],
      ai: 'tactical', reward: { glim: 300 }, once: 'sk_d_beat',
    },
    postWinDialogue: 'dlg_seeker_d_lose',
  },
  archon_sol: {
    id: 'archon_sol', name: 'Archon Sol', kind: 'archon',
    appearance: { palette: [0xffe9b0, 0xffffff], robe: 'radiant', accessory: 'cracked halo' },
    wanderRadius: 0,
    dialogue: (G) => {
      if (G.flags.postgame) return 'dlg_sol_postgame';
      if (!G.flags.vess_beat || !G.flags.dorn_beat) return 'dlg_sol_not_ready';
      return G.flags.sol_p1_beat ? 'dlg_sol_interlude' : 'dlg_sol_greet';
    },
    // Phase-1 team only. Phase 2 (Sol + the Hollowed Thalassyr, ai:'boss', twoActions,
    // uncatchable) is scripted directly in game/story.js#runSolFinale — see that file.
    battle: {
      team: [
        { speciesId: 'noctyra', level: 40, hollowed: true },
        { speciesId: 'chandelisk', level: 41, hollowed: true },
        { speciesId: 'vantash', level: 41 },
        { speciesId: 'glyphant', level: 42, hollowed: true, talisman: 'aegis_veil' },
      ],
      ai: 'boss', twoActions: true, reward: { glim: 0 }, onWin: { flag: 'sol_p1_beat' }, once: 'sol_p1_beat',
    },
  },
};
