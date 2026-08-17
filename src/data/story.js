// LUMENFALL — STORY_TRIGGERS: ordered, flag-gated story beats consumed by game/story.js's
// onZoneEnter(zoneId, world). This is a deliberately small, declarative list; all the actual
// staging (dialogue, battles, camera-adjacent nudges) lives in game/story.js's SCENES registry
// — this file only says WHEN a scene is eligible to run.
//
// Schema: { id, zone, scene, condition?(G) -> bool }
//   zone      — only checked when the player enters this zone.
//   scene     — key into game/story.js's SCENES registry.
//   condition — optional extra gate (defaults to always-true). Evaluated fresh on every entry.
// There is deliberately NO `once` flag auto-managed here: each SCENE is responsible for
// setFlag()-ing its own completion flag once it truly succeeds (usually inside `condition`,
// checking `!G.flags.xyz`). That means a trigger whose scene ends in a battle the player LOSES
// is safely offered again next visit — nothing here can ever soft-lock the game.
export const STORY_TRIGGERS = [
  // --------------------------------------------------------------------------- Early beats
  { id: 'dm_first_tip', zone: 'dawnmeadow', scene: 'dawnmeadowTip', condition: (G) => !G.flags.dm_tip_shown },
  { id: 'ww_hollowed_reveal', zone: 'whisperwood', scene: 'wwHollowedReveal', condition: (G) => !G.flags.ww_hollowed_seen },
  { id: 'shard_theft', zone: 'brighthollow', scene: 'shardTheft',
    condition: (G) => !!G.flags.ww_hollowed_seen && !!G.sigils[1] && !G.flags.shard_stolen },
  { id: 'gloam_ambush', zone: 'gloamcavern', scene: 'gloamAmbush', condition: (G) => !!G.flags.shard_stolen && !G.flags.gloam_ambush_done },
  { id: 'bryn_vess_glimpse', zone: 'gloamcavern', scene: 'brynVessGlimpse', condition: (G) => !!G.flags.gloam_ambush_done && !G.flags.bryn_vess_seen },
  { id: 'liora_dapplyn_found', zone: 'whisperwood', scene: 'lioraDapplynFound',
    condition: (G) => !!G.quests.sq_liora_dapplyn && !G.quests.sq_liora_dapplyn.done && !G.flags.liora_dapplyn_found },

  // -------------------------------------------------------------------------- Bryn (rival) — one per zone, gated by the BRYN_STAGES flags npcs.js already tracks
  { id: 'bryn_stage_1', zone: 'dawnmeadow', scene: 'brynStage1', condition: (G) => !!G.sigils[0] && !G.flags.bryn_1 },
  { id: 'bryn_stage_2', zone: 'whisperwood', scene: 'brynStage2', condition: (G) => !!G.flags.ww_hollowed_seen && !G.flags.bryn_2 },
  { id: 'bryn_stage_3', zone: 'mirrorlake', scene: 'brynStage3', condition: (G) => !!G.sigils[2] && !G.flags.bryn_3 },
  { id: 'bryn_stage_4', zone: 'skyreach', scene: 'brynStage4', condition: (G) => !!G.flags.storm_calmed && !G.flags.bryn_4 },
  { id: 'bryn_stage_5', zone: 'hollowspire', scene: 'brynStage5', condition: (G) => !!G.flags.ruins_cleared && !G.flags.bryn_5 },

  // ------------------------------------------------------------------------------- Skyreach
  { id: 'sq_climber_battle1', zone: 'skyreach', scene: 'climberBattle1',
    condition: (G) => !!G.quests.sq_climber && !G.quests.sq_climber.done && !G.flags.sq_climber_b1 },
  { id: 'sq_climber_battle2', zone: 'skyreach', scene: 'climberBattle2',
    condition: (G) => !!G.quests.sq_climber && !G.quests.sq_climber.done && !!G.flags.sq_climber_b1 && !G.flags.sq_climber_b2 },

  // --------------------------------------------------------------------------- Sunken Ruins
  { id: 'ruins_revelation', zone: 'sunkenruins', scene: 'ruinsRevelation', condition: (G) => !G.flags.ruins_revelation_seen },
  { id: 'sancturne_trial', zone: 'sunkenruins', scene: 'sancturneTrial', condition: (G) => !!G.sigils[3] && !G.flags.ruins_cleared },

  // -------------------------------------------------------------------------- Hollow Spire
  { id: 'spire_arrival', zone: 'hollowspire', scene: 'spireArrival', condition: (G) => !G.flags.spire_reached },

  // -------------------------------------------------------------------------------- Postgame
  { id: 'aurios_encounter', zone: 'starfallglade', scene: 'auriosEncounter',
    condition: (G) => !!G.flags.postgame && G.codex?.aurios !== 'caught' },
  { id: 'nyxmara_roam', zone: 'whisperwood', scene: 'nyxmaraEncounter',
    condition: (G) => !!G.flags.postgame && G.codex?.nyxmara !== 'caught' && Math.random() < 0.18 },
  { id: 'thalassyr_return', zone: 'mirrorlake', scene: 'thalassyrReturn',
    condition: (G) => !!G.flags.postgame && G.codex?.thalassyr !== 'caught' },
];
