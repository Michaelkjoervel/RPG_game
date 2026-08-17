// Showcase tour C: seeded save → Continue → wild battle, capturing action beats.
const M = (m) => `window.LF?.game.mode === '${m}'`;

const SEED = `(async () => {
  const { G, resetState, gainItem, setFlag } = await import('/src/core/state.js');
  const { makeCreature } = await import('/src/game/creatures.js');
  const { saveGame } = await import('/src/core/save.js');
  resetState();
  G.playerName = 'Rowan'; G.starter = 'kindlet';
  G.party = [makeCreature('charvane', 18, { resonance: 3 }), makeCreature('aurelark', 16)];
  gainItem('woven_charm', 6); gainItem('tonic', 3);
  G.sigils = [true, true, false, false, false];
  for (const f of ['intro_done','tutorial_done','dm_tip_shown','kb_beat','kl_beat',
                   'ww_hollowed_seen','shard_stolen','gloam_ambush_done','bryn_1','bryn_2'])
    setFlag(f);
  G.quests = { q_main_3: { step: 0, done: false } };
  G.pos = { zone: 'dawnmeadow', x: 0, z: 0, face: 0 };
  saveGame(1);
})()`;

export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(2000);
  await page.evaluate(SEED);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(2500);
  await h.press('ArrowDown'); await h.sleep(400);
  await h.press('Enter'); await h.sleep(1400);      // Continue
  await h.press('ArrowDown'); await h.sleep(400);   // skip empty autosave
  await h.press('Enter');
  if (!await h.waitFor(M('overworld'), 60000)) { await h.shot('load-failed'); return; }
  await h.sleep(2000);
  for (let i = 0; i < 5; i++) { await h.press('Enter'); await h.sleep(320); }
  await h.sleep(1200);
  await h.shot('overworld-meadow');
  await page.evaluate(`(() => {
    if (window.LF.G.party[0]) window.LF.G.party[0].burstCharge = 100;
    window.LF.game.overworld.startWildBattle('pebbin', 12);
  })()`);
  const ready = await h.waitFor(`!!document.querySelector('.bui-ring')`, 60000);
  await h.sleep(2000);
  await h.shot('battle-open');
  console.log('READY:', !!ready, 'MODE:', await page.evaluate(`window.LF.game.mode`));
  if (!ready) return;
  await h.press('Enter'); await h.sleep(1100);
  await h.shot('battle-moves');
  await h.press('Enter');
  for (let i = 0; i < 6; i++) { await h.sleep(420); await h.shot('beat'); }
  await h.sleep(2200);
  await h.shot('battle-settled');
  console.log('MODE AFTER:', await page.evaluate(`window.LF.game.mode`));
}
