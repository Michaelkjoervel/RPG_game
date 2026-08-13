// Combat-presentation QA C: meadow arena wild battle — catch sequence shakes.
export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 30000);
  await h.sleep(4000);
  await page.evaluate(() => { document.querySelector('.title-root')?.remove(); });
  await page.evaluate(async () => { await window.LF.game.enterOverworld('dawnmeadow'); });
  await h.sleep(1500);
  await page.evaluate(async () => {
    const { makeCreature } = await import('/src/game/creatures.js');
    const me = makeCreature('kindlet', 10, { noGleamRoll: true });
    window.LF.G.party = [me];
    window.LF.G.bag = { woven_charm: 10 };
    window.LF.game.overworld.startWildBattle('pebbin', 4);
  });
  await h.sleep(1000); await h.shot('c-wild-intro');
  await h.sleep(1400); await h.shot('c-wild-sendin');
  for (let attempt = 0; attempt < 3; attempt++) {
    const dock = await h.waitFor(`!!document.querySelector('.bui-dock:not(.hidden)')`, 30000);
    if (!dock) break;
    // ring: fight, switch, bag, catch(attune), flee -> Right x3
    await h.press('ArrowRight', { times: 3, delay: 250 });
    await h.press('Enter'); await h.sleep(900);
    if (attempt === 0) await h.shot('c-charm-panel');
    await h.press('Enter'); // throw first charm
    await h.sleep(150);
    for (let i = 0; i < 9; i++) { await h.shot(`c-catch${attempt}-${i}`); await h.sleep(320); }
    const caught = await page.evaluate(`window.LF.G.party.some(m => m.speciesId === 'pebbin') || window.LF.game.mode === 'overworld'`);
    if (caught) break;
  }
  await h.sleep(1000);
  await h.shot('c-after');
  console.log('MODE:', await page.evaluate(`window.LF.game.mode`), 'PARTY:', await page.evaluate(`JSON.stringify(window.LF.G.party.map(m=>m.speciesId))`));
}
