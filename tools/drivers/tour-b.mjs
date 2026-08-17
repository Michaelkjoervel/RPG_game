// Showcase tour B: seeded save → Continue → zones, menus, battle.
const M = (m) => `window.LF?.game.mode === '${m}'`;

const SEED = `(async () => {
  const { G, resetState, gainItem, markCodex, setFlag } = await import('/src/core/state.js');
  const { makeCreature } = await import('/src/game/creatures.js');
  const { saveGame } = await import('/src/core/save.js');
  resetState();
  G.playerName = 'Rowan'; G.starter = 'kindlet';
  G.party = [makeCreature('charvane', 18, { resonance: 3 }), makeCreature('aurelark', 16),
             makeCreature('cairnox', 15), makeCreature('glowvern', 14)];
  G.reserve = [makeCreature('duskit', 11), makeCreature('myclet', 12)];
  gainItem('woven_charm', 6); gainItem('glazed_charm', 3); gainItem('tonic', 4);
  gainItem('super_tonic', 2); gainItem('emberstone', 1); gainItem('might_band', 1);
  gainItem('haste_feather', 1); gainItem('kindred_codex', 1);
  for (const id of ['kindlet','charvane','pipwing','aurelark','pebbin','cairnox','vellit','duskit','motling','glowvern','myclet','fulmin'])
    markCodex(id, 'caught');
  for (const id of ['veldrun','zephyra','stormane','fungore','dapplyn','noctyra','lanterling','thistlit','nixling','sonark'])
    markCodex(id, 'seen');
  G.glim = 1240; G.sigils = [true, true, false, false, false];
  G.quests = { q_main_3: { step: 0, done: false } };
  for (const f of ['intro_done','tutorial_done','dm_tip_shown','kb_beat','kl_beat',
                   'ww_hollowed_seen','shard_stolen','gloam_ambush_done','bryn_1','bryn_2'])
    setFlag(f);
  G.pos = { zone: 'brighthollow', x: 0, z: 6, face: 0 };
  saveGame(1);
})()`;

async function goZone(page, h, zone, name, dayTime) {
  await page.evaluate(`(async () => {
    if (${dayTime !== undefined}) window.LF.G.calendar.dayTime = ${dayTime ?? 0.5};
    await window.LF.game.enterOverworld('${zone}');
  })()`).catch(() => {});
  await h.waitFor(M('overworld'), 45000);
  await h.sleep(1200);
  for (let i = 0; i < 5; i++) { await h.press('Enter'); await h.sleep(350); }
  await h.sleep(2600);
  await h.shot(name);
}

export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(2000);
  await page.evaluate(SEED);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(2500);
  await h.press('ArrowDown'); await h.sleep(400);
  await h.press('Enter'); await h.sleep(1400);      // Continue
  await h.press('ArrowDown'); await h.sleep(400);   // skip autosave slot
  await h.press('Enter');
  if (!await h.waitFor(M('overworld'), 50000)) { await h.shot('load-failed'); return; }
  await h.sleep(2500);
  for (let i = 0; i < 5; i++) { await h.press('Enter'); await h.sleep(350); }
  await h.shot('town');

  // Menus
  await h.press('Escape'); await h.sleep(1800);
  await h.shot('menu-party');
  await h.press('ArrowDown'); await h.sleep(600);
  await h.press('Enter'); await h.sleep(2600);
  await h.shot('menu-codex');
  await h.press('Escape'); await h.sleep(700);
  await h.press('ArrowDown'); await h.sleep(400);
  await h.press('Enter'); await h.sleep(1800);
  await h.shot('menu-bag');
  await h.press('Escape'); await h.sleep(700);
  await h.press('Escape'); await h.sleep(1400);

  // Zones
  await goZone(page, h, 'dawnmeadow', 'zone-dawnmeadow-noon', 0.5);
  await goZone(page, h, 'whisperwood', 'zone-whisperwood', 0.45);
  await goZone(page, h, 'gloamcavern', 'zone-gloamcavern', 0.5);
  await goZone(page, h, 'skyreach', 'zone-skyreach-storm', 0.5);
  await goZone(page, h, 'mirrorlake', 'zone-mirrorlake-dusk', 0.78);
  await goZone(page, h, 'starfallglade', 'zone-starfallglade', 0.5);
  console.log('MODE BEFORE BATTLE:', await page.evaluate(`window.LF.game.mode`));
}
