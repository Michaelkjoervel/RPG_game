// Focused catch-flow test: healthy party, wild battle, weaken, attune.
export async function run(page, h) {
  await h.sleep(6000);
  await h.press('Enter'); await h.sleep(1200);
  await h.press('Enter'); await h.sleep(2500);
  for (let i = 0; i < 10; i++) { await h.press('Enter'); await h.sleep(600); }
  await h.press('Enter'); await h.sleep(1500);
  for (let i = 0; i < 8; i++) { await h.press('Enter'); await h.sleep(600); }
  for (let i = 0; i < 60; i++) {
    await h.press('Enter'); await h.sleep(900);
    if (await page.evaluate(() => window.LF?.game.mode) === 'overworld') break;
  }
  // let post-battle dialogue fully finish, then force-heal party for a clean test
  for (let i = 0; i < 10; i++) { await h.press('Enter'); await h.sleep(600); }
  await page.evaluate(() => { for (const m of window.LF.G.party) { m.hp = m.maxHp; m.status = null; } });
  const pre = await page.evaluate(() => ({ mode: window.LF.game.mode, hp: window.LF.G.party[0].hp, dlgOpen: !!document.querySelector('#ui-root .dlg-box, #ui-root .dlg-root .dlg-panel') }));
  console.log('PRE:', JSON.stringify(pre));
  await page.evaluate(() => { window.LF.game.overworld.startWildBattle('vellit', 3); });
  await h.sleep(5000);
  await h.shot('wild-intro');
  const seen = await page.evaluate(() => window.LF.G.codex.vellit ?? 'none');
  console.log('CODEX VELLIT:', seen);
  // attune immediately (full-hp catch attempt may fail; try up to 4 charms)
  for (let round = 0; round < 4; round++) {
    await h.press('ArrowRight'); await h.sleep(250);
    await h.press('ArrowRight'); await h.sleep(250);
    await h.press('ArrowRight'); await h.sleep(250);
    await h.press('Enter'); await h.sleep(800);
    if (round === 0) await h.shot('attune-panel');
    await h.press('Enter'); await h.sleep(6000); // throw + shakes
    if (round === 0) await h.shot('catch-attempt');
    const st = await page.evaluate(() => ({ mode: window.LF.game.mode, party: window.LF.G.party.map(m => m.speciesId) }));
    console.log(`ROUND ${round}:`, JSON.stringify(st));
    if (st.party.includes('vellit') || st.mode === 'overworld') break;
    await h.press('Enter'); await h.sleep(800);
  }
  await h.shot('final');
  for (let i = 0; i < 8; i++) { await h.press('Enter'); await h.sleep(600); }
  const fin = await page.evaluate(() => ({ mode: window.LF.game.mode, party: window.LF.G.party.map(m => m.speciesId), codex: window.LF.G.codex, charms: window.LF.G.bag.woven_charm }));
  console.log('FINAL:', JSON.stringify(fin));
}
