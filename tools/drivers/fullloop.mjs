// Robust full-loop: new game → rival battle → wild catch → save → reload → load.
const M = (m) => `window.LF?.game.mode === '${m}'`;
export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 20000);
  await h.sleep(2500);
  await h.press('Enter'); await h.sleep(1200);      // New Journey
  await h.press('Enter');                            // accept name
  // starter choice appears after intro dialogue — advance until party exists
  for (let i = 0; i < 30; i++) {
    await h.press('Enter'); await h.sleep(700);
    if (await page.evaluate(`(window.LF?.G.party?.length ?? 0) > 0`)) break;
  }
  console.log('STARTER:', await page.evaluate(`window.LF.G.starter`));
  // rival battle: mash Enter until overworld (win or loss both fine)
  for (let i = 0; i < 120; i++) {
    await h.press('Enter'); await h.sleep(700);
    if (await page.evaluate(M('overworld'))) break;
  }
  const afterRival = await page.evaluate(`({mode: window.LF.game.mode, hp: window.LF.G.party[0].hp})`);
  console.log('AFTER RIVAL:', JSON.stringify(afterRival));
  if (afterRival.mode !== 'overworld') { console.log('FAILED to reach overworld'); await h.shot('stuck'); return; }
  // settle dialogues, heal, then wild catch test
  for (let i = 0; i < 8; i++) { await h.press('Enter'); await h.sleep(400); }
  await page.evaluate(`for (const m of window.LF.G.party) { m.hp = m.maxHp; m.status = null; }`);
  for (let round = 0; round < 4; round++) {
    if (!(await page.evaluate(M('overworld')))) break;
    await page.evaluate(`window.LF.game.overworld.startWildBattle('vellit', 3)`);
    await h.waitFor(`document.querySelector('.bui-actions, .bui-action-ring, [class*=bui-action]')`, 25000);
    await h.sleep(1500);
    if (round === 0) await h.shot('wild-battle');
    // attune: ring right ×3 → charms → throw
    await h.press('ArrowRight', { times: 3, delay: 300 });
    await h.press('Enter'); await h.sleep(900);
    await h.press('Enter');                          // throw first charm
    await h.waitFor(M('overworld'), 60000);          // catch or battle end
    for (let i = 0; i < 6; i++) { await h.press('Enter'); await h.sleep(400); }
    const party = await page.evaluate(`window.LF.G.party.map(m => m.speciesId)`);
    console.log(`CATCH ROUND ${round}:`, JSON.stringify(party));
    if (party.includes('vellit')) break;
    await page.evaluate(`for (const m of window.LF.G.party) { m.hp = m.maxHp; m.status = null; }`);
  }
  await h.shot('after-catch');
  // save to slot 1 via pause menu
  await h.press('Escape'); await h.sleep(900);
  await h.shot('pause');
  await h.press('ArrowDown', { times: 4, delay: 250 });
  await h.press('Enter'); await h.sleep(900);        // Save tab
  await h.shot('save-ui');
  await h.press('ArrowDown'); await h.sleep(300);
  await h.press('Enter'); await h.sleep(500);
  await h.press('Enter'); await h.sleep(900);        // confirm overwrite if asked
  console.log('SAVES:', await page.evaluate(`Object.keys(localStorage).filter(k => k.startsWith('lumenfall_save')).join(',')`));
  // reload → continue
  await page.reload({ waitUntil: 'domcontentloaded' });
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 20000);
  await h.sleep(2500);
  await h.press('ArrowDown'); await h.sleep(300);
  await h.press('Enter'); await h.sleep(1200);       // Continue
  await h.shot('load-menu');
  await h.press('Enter');                            // first populated slot
  await h.waitFor(M('overworld'), 30000);
  await h.sleep(1500);
  await h.shot('loaded');
  console.log('LOADED:', await page.evaluate(`JSON.stringify({zone: window.LF.G.pos.zone, party: window.LF.G.party.map(m => m.speciesId + ':' + m.level), pos: [Math.round(window.LF.G.pos.x), Math.round(window.LF.G.pos.z)]})`));
}
