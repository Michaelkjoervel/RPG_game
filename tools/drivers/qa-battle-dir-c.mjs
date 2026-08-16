// Combat-presentation QA C: lake arena wild battle — catch sequence shake beats.
export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 30000);
  await h.sleep(4000);
  await page.evaluate(() => {
    document.querySelector('.title-root')?.remove();
  });
  await page.evaluate(async () => { await window.LF.game.enterOverworld('mirrorlake'); });
  await h.sleep(1500);
  await page.evaluate(async () => {
    const { makeCreature } = await import('/src/game/creatures.js');
    const me = makeCreature('kindlet', 10, { noGleamRoll: true });
    window.LF.G.party = [me];
    window.LF.G.bag = { woven_charm: 10 };
    window.__result = null;
    window.LF.game.startBattle({
      playerTeam: [me], enemyTeam: [makeCreature('pebbin', 4, { noGleamRoll: true })],
      kind: 'wild', ai: 'basic', arena: 'lake', canFlee: true, canCatch: true,
    }).then((r) => (window.__result = r)).catch((e) => console.error('battle err', e));
  });
  await h.sleep(1200); await h.shot('c-wild-intro');
  await h.sleep(1500); await h.shot('c-wild-sendin');
  for (let attempt = 0; attempt < 3; attempt++) {
    const dock = await h.waitFor(`!!document.querySelector('.bui-dock:not(.hidden)')`, 30000);
    if (!dock) break;
    const done = await page.evaluate(`window.__result !== null`);
    if (done) break;
    await page.click('.bui-ring .bui-card:nth-child(4)'); // Attune -> charms
    await h.sleep(900);
    if (attempt === 0) await h.shot('c-charm-panel');
    const hasCharm = await page.evaluate(`!!document.querySelector('.bui-bag-list .bui-item-card')`);
    if (!hasCharm) { console.log('NO CHARM CARD'); break; }
    await page.click('.bui-bag-list .bui-item-card');
    await h.sleep(150);
    for (let i = 0; i < 9; i++) { await h.shot(`c-catch${attempt}-${i}`); await h.sleep(280); }
  }
  await h.sleep(800);
  await h.shot('c-after');
  console.log('C RESULT:', await page.evaluate(`JSON.stringify(window.__result)`), 'PARTY:', await page.evaluate(`JSON.stringify(window.LF.G.party.map(m=>m.speciesId))`));
}
