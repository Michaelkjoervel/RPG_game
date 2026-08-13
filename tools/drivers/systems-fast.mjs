// Fast systems check: seeds a post-intro SAVE, loads it via the real Continue path,
// then tests: wild battle UI → attune/catch → save → reload → continue again.
const M = (m) => `window.LF?.game.mode === '${m}'`;

async function seedSave(page) {
  await page.evaluate(async () => {
    const { G, resetState, gainItem, markCodex, setFlag } = await import('/src/core/state.js');
    const { makeCreature } = await import('/src/game/creatures.js');
    const { saveGame } = await import('/src/core/save.js');
    resetState();
    G.playerName = 'Rowan';
    G.starter = 'nixling';
    G.party = [makeCreature('nixling', 8, { resonance: 1 })];
    gainItem('woven_charm', 8); gainItem('tonic', 3); gainItem('kindred_codex', 1);
    markCodex('nixling', 'caught');
    setFlag('intro_done'); setFlag('tutorial_done'); setFlag('dm_tip_shown');
    G.quests = { q_main_1: { step: 0, done: false } };
    G.pos = { zone: 'brighthollow', x: 0, z: 6, face: 0 };
    saveGame(1);
  });
}

export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 20000);
  await h.sleep(2000);
  await seedSave(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 20000);
  await h.sleep(2200);
  await h.press('ArrowDown'); await h.sleep(300);
  await h.press('Enter'); await h.sleep(1200);       // Continue → load menu
  await h.press('ArrowDown'); await h.sleep(300);    // skip empty autosave slot
  await h.press('Enter');                            // slot 1
  const inWorld = await h.waitFor(M('overworld'), 40000);
  if (!inWorld) { console.log('LOAD FAILED'); await h.shot('load-failed'); return; }
  await h.sleep(1500);
  console.log('LOADED SEED:', await page.evaluate(`JSON.stringify({zone: window.LF.G.pos.zone, party: window.LF.G.party.length})`));
  // Wild battle + catch (up to 3 charms)
  for (let round = 0; round < 3; round++) {
    await page.evaluate(`for (const m of window.LF.G.party) { m.hp = m.maxHp; m.status = null; }`);
    await page.evaluate(`window.LF.game.overworld.startWildBattle('vellit', 4)`);
    const ready = await h.waitFor(`document.querySelector('[class*=bui-action]')`, 40000);
    if (!ready) { console.log('BATTLE UI NEVER APPEARED'); await h.shot('no-battle-ui'); return; }
    await h.sleep(1200);
    if (round === 0) await h.shot('wild-battle');
    console.log('SEEN:', await page.evaluate(`window.LF.G.codex.vellit ?? 'none'`));
    await h.press('ArrowRight', { times: 3, delay: 300 });
    await h.press('Enter'); await h.sleep(800);
    if (round === 0) await h.shot('attune-drawer');
    await h.press('Enter');                          // throw charm
    const done = await h.waitFor(M('overworld'), 120000);
    if (!done) { console.log('BATTLE DID NOT END'); await h.shot('battle-stuck'); return; }
    for (let i = 0; i < 5; i++) { await h.press('Enter'); await h.sleep(350); }
    const party = await page.evaluate(`window.LF.G.party.map(m => m.speciesId)`);
    console.log(`ROUND ${round}:`, JSON.stringify(party), 'charms left:', await page.evaluate(`window.LF.G.bag.woven_charm ?? 0`));
    if (party.includes('vellit')) break;
  }
  await h.shot('after-catch');
  const gotIt = await page.evaluate(`window.LF.G.party.some(m => m.speciesId === 'vellit')`);
  // Save again (slot 2), reload, continue, verify caught creature persisted
  await page.evaluate(async () => (await import('/src/core/save.js')).saveGame(2));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 20000);
  await h.sleep(2200);
  await h.press('ArrowDown'); await h.sleep(300);
  await h.press('Enter'); await h.sleep(1200);
  await h.shot('load-menu');
  await h.press('ArrowDown'); await h.sleep(300);    // slot 2
  await h.press('Enter');
  const loaded = await h.waitFor(M('overworld'), 40000);
  await h.sleep(1000);
  await h.shot('loaded');
  console.log('CATCH OK:', gotIt, '| RELOAD:', loaded ? await page.evaluate(`JSON.stringify({zone: window.LF.G.pos.zone, party: window.LF.G.party.map(m => m.speciesId + ':' + m.level)})`) : 'FAILED');
}
