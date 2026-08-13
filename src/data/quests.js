// LUMENFALL — quest definitions. See docs/ARCHITECTURE.md §NPCs/dialogue/quests:
//   Quest: { id, name, steps: [{text, isDone(G)}], onComplete(G), rewards {glim,items,xp} }
// `rewards` is advertised to the tracker/UI as flavor metadata; the actual granting happens
// in onComplete(G) (single source of truth — no double-granting between the two).
// game/quests.js evaluates isDone reactively and drives {step,done} in G.quests.
//
// Side-quest design note (deviation from the literal brief wording — see the story-quests
// integration report): rather than depending on exact interactable `flag` strings owned by
// the zone-content area (not pinned anywhere), every side quest here is completed through
// mechanisms story-quests fully owns: NPC dialogue turn-ins/choices, item possession, battle
// onWin flags on story-quests' own NPCs, or scripted STORY_TRIGGERS scenes. The one exception
// is sq_ferry, which happily lines up with a chest zone-content already placed
// (`gc_chest_ferrygear` in src/data/zones/gloamcavern.js) — confirmed by inspection.
import { gainGlim, gainItem, spendItem, setFlag } from '../core/state.js';
import { bus } from '../core/events.js';

const notify = (text, icon) => bus.emit('notify', { text, icon });

export const QUESTS = {
  // ============================================================================= Main chain
  q_main_1: {
    id: 'q_main_1', main: true, name: "The Warden's Oath",
    steps: [{ text: 'Find Keeper Bramwell in Dawnmeadow and earn the first Sigil.', isDone: (G) => !!G.sigils[0] }],
    rewards: { glim: 100 },
    onComplete: (G) => { gainGlim(100); notify('The Warden\'s Oath complete.', '✦'); },
  },
  q_main_2: {
    id: 'q_main_2', main: true, name: 'The Quiet Rot',
    steps: [
      { text: 'Journey north into Whisperwood.', isDone: (G) => G.pos.zone === 'whisperwood' || !!G.flags.ww_hollowed_seen },
      { text: 'Earn the second Sigil from Keeper Liora.', isDone: (G) => !!G.sigils[1] && !!G.flags.ww_hollowed_seen },
    ],
    rewards: { glim: 140 },
    onComplete: (G) => { gainGlim(140); notify('The Quiet Rot complete.', '✦'); },
  },
  q_main_3: {
    id: 'q_main_3', main: true, name: 'What the Order Took',
    steps: [{ text: 'Follow the trail into Gloamcavern and recover the shrine-shard.', isDone: (G) => !!G.flags.gloam_ambush_done }],
    rewards: { glim: 160, items: [{ id: 'remedy', qty: 2 }] },
    onComplete: (G) => { gainGlim(160); gainItem('remedy', 2); notify('What the Order Took complete.', '✦'); },
  },
  q_main_4: {
    id: 'q_main_4', main: true, name: 'Currents of Sigil',
    steps: [{ text: 'Earn the third Sigil from Keeper Maro at Mirrorlake.', isDone: (G) => !!G.sigils[2] }],
    rewards: { glim: 200 },
    onComplete: (G) => { gainGlim(200); notify('Currents of Sigil complete.', '✦'); },
  },
  q_main_5: {
    id: 'q_main_5', main: true, name: 'Into the Storm',
    steps: [{ text: 'Earn the fourth Sigil from Keeper Sera atop Skyreach.', isDone: (G) => !!G.sigils[3] && !!G.flags.storm_calmed }],
    rewards: { glim: 260 },
    onComplete: (G) => { gainGlim(260); notify('Into the Storm complete.', '✦'); },
  },
  q_main_6: {
    id: 'q_main_6', main: true, name: 'What the Ruins Remember',
    steps: [{ text: "Face Sancturne's trial in the Sunken Ruins and earn the fifth Sigil.", isDone: (G) => !!G.sigils[4] && !!G.flags.ruins_cleared }],
    rewards: { glim: 320, items: [{ id: 'grand_tonic', qty: 2 }] },
    onComplete: (G) => { gainGlim(320); gainItem('grand_tonic', 2); notify('What the Ruins Remember complete.', '✦'); },
  },
  q_main_7: {
    id: 'q_main_7', main: true, name: 'The Hollow Spire',
    steps: [
      { text: 'Defeat Lieutenant Vess.', isDone: (G) => !!G.flags.vess_beat },
      { text: 'Defeat Lieutenant Dorn.', isDone: (G) => !!G.flags.dorn_beat },
    ],
    rewards: { glim: 400 },
    onComplete: (G) => { gainGlim(400); notify('The Hollow Spire complete.', '✦'); },
  },
  q_main_final: {
    id: 'q_main_final', main: true, name: 'Where Shardlight Pools',
    steps: [{ text: 'Confront Archon Sol and liberate Thalassyr.', isDone: (G) => !!G.flags.postgame }],
    rewards: { glim: 1000, items: [{ id: 'starwoven_charm', qty: 2 }] },
    onComplete: (G) => { gainGlim(1000); gainItem('starwoven_charm', 2); notify('The Duskmere Reach breathes easier.', '✦'); },
  },

  // ============================================================================== Side quests
  sq_herbalist: {
    id: 'sq_herbalist', name: "Herbalist Syl's Remedy",
    steps: [{ text: 'Bring Herbalist Syl 3 Tonics for her patients.', isDone: (G) => (G.bag.tonic ?? 0) >= 3 }],
    rewards: { glim: 60, items: [{ id: 'honey_drop', qty: 2 }] },
    onComplete: (G) => {
      spendItem('tonic', 3);
      gainGlim(60); gainItem('honey_drop', 2); notify('Syl thanks you for the tonics.', '✦');
    },
  },
  sq_deserter_finn: {
    id: 'sq_deserter_finn', name: 'The Deserter',
    steps: [{ text: 'Decide what to do about Finn, hiding in Gloamcavern.', isDone: (G) => !!(G.flags.finn_helped || G.flags.finn_reported) }],
    rewards: { glim: 80 },
    onComplete: (G) => {
      gainGlim(80);
      notify(G.flags.finn_helped ? 'Finn slips away, unbothered.' : 'Word of Finn reaches the Order.', '✦');
    },
  },
  sq_lantern: {
    id: 'sq_lantern', name: "Lanternkeeper's Oil",
    steps: [{ text: 'Buy Lantern Oil from Pip and bring it to Lanternkeeper Ode.', isDone: (G) => !!G.flags.lantern_lit || (G.bag.lantern_oil ?? 0) >= 1 }],
    rewards: { glim: 70, items: [{ id: 'super_tonic', qty: 1 }] },
    onComplete: (G) => {
      if ((G.bag.lantern_oil ?? 0) >= 1) spendItem('lantern_oil', 1);
      setFlag('lantern_lit');
      gainGlim(70); gainItem('super_tonic', 1); notify('Ode\'s lantern burns steady again.', '✦');
    },
  },
  sq_ferry: {
    id: 'sq_ferry', name: "Juno's Ferry",
    steps: [{ text: 'Find the lost Ferry Gear in Gloamcavern and bring it to Ferryman Juno.', isDone: (G) => !!(G.flags.gc_chest_ferrygear || (G.bag.ferry_gear ?? 0) >= 1) }],
    rewards: { glim: 90, items: [{ id: 'tidestone', qty: 1 }] },
    onComplete: (G) => {
      if ((G.bag.ferry_gear ?? 0) >= 1) spendItem('ferry_gear', 1);
      gainGlim(90); gainItem('tidestone', 1); notify("Juno's ferry sails again.", '✦');
    },
  },
  sq_liora_dapplyn: {
    id: 'sq_liora_dapplyn', name: "Liora's Lost Companion",
    steps: [{ text: 'Search the falls in Whisperwood for her missing dapplyn.', isDone: (G) => !!G.flags.liora_dapplyn_found }],
    rewards: { glim: 50, items: [{ id: 'lumenstone', qty: 1 }] },
    onComplete: (G) => { gainGlim(50); gainItem('lumenstone', 1); notify('Reunited at last.', '✦'); },
  },
  sq_climber: {
    id: 'sq_climber', name: "Bo's Ledge Rescue",
    steps: [{ text: 'Drive the panicked stratovane pair from the high ledge — twice.', isDone: (G) => !!G.flags.sq_climber_b1 && !!G.flags.sq_climber_b2 }],
    rewards: { glim: 110, items: [{ id: 'haste_feather', qty: 1 }] },
    onComplete: (G) => { gainGlim(110); gainItem('haste_feather', 1); notify('The stratovane settle, safe.', '✦'); },
  },
  sq_scholar: {
    id: 'sq_scholar', name: "Imre's Murals",
    steps: [{ text: 'Discuss the ruin murals with Scholar Imre three times.', isDone: (G) => (G.flags.sq_scholar_step ?? 0) >= 3 }],
    rewards: { glim: 100, items: [{ id: 'umbrastone', qty: 1 }] },
    onComplete: (G) => { gainGlim(100); gainItem('umbrastone', 1); notify('Imre\'s theory is complete — for now.', '✦'); },
  },
  sq_gleam: {
    id: 'sq_gleam', name: "Wren's Gleaming Offer",
    steps: [{ text: 'Show a gleaming Kindred to Wren in Driftmoor.', isDone: (G) => !!G.flags.sq_gleam_sold || [...G.party, ...G.reserve].some((m) => m?.shiny) }],
    rewards: { glim: 1500 },
    onComplete: (G) => { gainGlim(1500); notify('Wren pays out, thrilled.', '✦'); },
  },
};
