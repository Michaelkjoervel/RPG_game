// CREATURES v2 battle check (tour-c pattern): seeded save -> Continue ->
// wild battle, to judge creatures at real battle distance under the game's
// lighting, post-fx and outlines. One battle per run.
//   QA_LEAD=charvane QA_FOE=pebbin node tools/shoot.mjs tools/drivers/v2-creatures-battle.mjs <out>
//   QA_ZONE=dawnmeadow (default)   QA_LVL=12 (foe level)
const LEAD = process.env.QA_LEAD ?? 'charvane';
const FOE = process.env.QA_FOE ?? 'pebbin';
const ZONE = process.env.QA_ZONE ?? 'dawnmeadow';
const LVL = +(process.env.QA_LVL ?? 12);
const M = (m) => `window.LF?.game.mode === '${m}'`;

const SEED = `(async () => {
  const { G, resetState, gainItem, setFlag } = await import('/src/core/state.js');
  const { makeCreature } = await import('/src/game/creatures.js');
  const { saveGame } = await import('/src/core/save.js');
  resetState();
  G.playerName = 'Rowan'; G.starter = 'kindlet';
  G.party = [makeCreature('${LEAD}', 18, { resonance: 3 }), makeCreature('aurelark', 16)];
  gainItem('woven_charm', 6); gainItem('tonic', 3);
  G.sigils = [true, true, false, false, false];
  for (const f of ['intro_done','tutorial_done','dm_tip_shown','kb_beat','kl_beat',
                   'ww_hollowed_seen','shard_stolen','gloam_ambush_done','bryn_1','bryn_2'])
    setFlag(f);
  G.quests = { q_main_3: { step: 0, done: false } };
  G.pos = { zone: '${ZONE}', x: 0, z: 0, face: 0 };
  saveGame(1);
})()`;

export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(1500);
  await page.evaluate(SEED);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(2000);
  await h.press('ArrowDown'); await h.sleep(350);
  await h.press('Enter'); await h.sleep(1200);      // Continue
  await h.press('ArrowDown'); await h.sleep(350);   // skip empty autosave
  await h.press('Enter');
  if (!await h.waitFor(M('overworld'), 60000)) { await h.shot('load-failed'); return; }
  await h.sleep(1800);
  for (let i = 0; i < 4; i++) { await h.press('Enter'); await h.sleep(250); }
  await h.sleep(800);
  await h.shot('overworld');
  // void IIFE: startWildBattle's promise resolves only when the battle ENDS
  await page.evaluate(`(() => { window.LF.game.overworld.startWildBattle('${FOE}', ${LVL}); })()`);
  // the intro (banner + camera sweep) is over once the command cards exist
  const ready = await h.waitFor(`document.querySelectorAll('.bui-card').length > 0`, 150000, 700);
  await h.sleep(1200);
  await h.shot(`battle-${LEAD}-vs-${FOE}`);
  console.log('READY:', !!ready, 'RENDER:', await page.evaluate('JSON.stringify(window.LF.game.renderer.info.render)'));
  if (!ready) return;
  await h.press('Enter'); await h.sleep(900);
  await h.press('Enter');
  for (let i = 0; i < 3; i++) { await h.sleep(500); await h.shot('beat'); }
}
