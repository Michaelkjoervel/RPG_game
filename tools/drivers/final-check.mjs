// Lean end-to-end check: load a save → wild battle → attune → catch persists → save/reload.
const M = (m) => `window.LF?.game.mode === '${m}'`;
const SEED = `(async () => {
  const { G, resetState, gainItem, setFlag } = await import('/src/core/state.js');
  const { makeCreature } = await import('/src/game/creatures.js');
  const { saveGame } = await import('/src/core/save.js');
  resetState();
  G.playerName = 'Rowan'; G.starter = 'kindlet';
  G.party = [makeCreature('charvane', 22)];
  gainItem('woven_charm', 9); gainItem('tonic', 3);
  for (const f of ['intro_done','tutorial_done','dm_tip_shown','kb_beat']) setFlag(f);
  G.pos = { zone: 'dawnmeadow', x: 0, z: 0, face: 0 };
  saveGame(1);
})()`;

export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(1800);
  await page.evaluate(SEED);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(2200);
  await h.press('ArrowDown'); await h.sleep(350);
  await h.press('Enter'); await h.sleep(1200);
  await h.press('ArrowDown'); await h.sleep(350);
  await h.press('Enter');
  if (!await h.waitFor(M('overworld'), 45000)) { console.log('LOAD FAILED'); await h.shot('load-failed'); return; }
  console.log('LOADED OK');
  await h.sleep(1500);
  for (let i = 0; i < 4; i++) { await h.press('Enter'); await h.sleep(300); }

  // Wild battle: weaken the foe from the outside so the catch is quick and certain.
  await page.evaluate(`window.LF.game.overworld.startWildBattle('vellit', 3)`);
  if (!await h.waitFor(`!!document.querySelector('.bui-ring')`, 45000)) { console.log('NO BATTLE UI'); await h.shot('no-ui'); return; }
  await h.sleep(1500);
  await h.shot('battle');
  console.log('CODEX SEEN:', await page.evaluate(`window.LF.G.codex.vellit ?? 'none'`));
  await h.press('ArrowRight', { times: 3, delay: 260 });
  await h.press('Enter'); await h.sleep(800);
  await h.shot('attune');
  await h.press('Enter');                                  // throw charm
  const back = await h.waitFor(M('overworld'), 90000);
  for (let i = 0; i < 5; i++) { await h.press('Enter'); await h.sleep(300); }
  const after = await page.evaluate(`JSON.stringify({
    back: ${!!back}, party: window.LF.G.party.map(m => m.speciesId),
    codex: window.LF.G.codex.vellit ?? 'none', charms: window.LF.G.bag.woven_charm ?? 0
  })`);
  console.log('AFTER ATTUNE:', after);
  await h.shot('after');

  // Persistence: save, reload, continue, confirm the roster survived.
  await page.evaluate(`(async () => (await import('/src/core/save.js')).saveGame(2))()`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(2200);
  await h.press('ArrowDown'); await h.sleep(350);
  await h.press('Enter'); await h.sleep(1200);
  await h.press('ArrowDown', { times: 2, delay: 300 });
  await h.press('Enter');
  const ok = await h.waitFor(M('overworld'), 45000);
  await h.sleep(1200);
  await h.shot('reloaded');
  console.log('RELOADED:', ok ? await page.evaluate(`JSON.stringify({zone: window.LF.G.pos.zone, party: window.LF.G.party.map(m => m.speciesId + ':' + m.level)})`) : 'FAILED');
}
