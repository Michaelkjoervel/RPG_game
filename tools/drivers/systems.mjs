// Systems check: wild battle via API, catch flow, save, reload, continue.
export async function run(page, h) {
  await h.sleep(6000);
  await h.press('Enter'); await h.sleep(1200);   // New Journey
  await h.press('Enter'); await h.sleep(2500);   // name
  for (let i = 0; i < 10; i++) { await h.press('Enter'); await h.sleep(600); }
  await h.press('Enter'); await h.sleep(1500);   // starter
  for (let i = 0; i < 8; i++) { await h.press('Enter'); await h.sleep(600); }
  // finish rival battle by mashing until overworld
  for (let i = 0; i < 60; i++) {
    await h.press('Enter'); await h.sleep(900);
    const mode = await page.evaluate(() => window.LF?.game.mode);
    if (mode === 'overworld') break;
  }
  for (let i = 0; i < 6; i++) { await h.press('Enter'); await h.sleep(500); }
  const pre = await page.evaluate(() => ({ mode: window.LF.game.mode, party: window.LF.G.party.length, bag: window.LF.G.bag }));
  console.log('PRE-WILD:', JSON.stringify(pre));
  // start a wild battle directly
  await page.evaluate(() => { window.LF.game.overworld.startWildBattle('vellit', 2); });
  await h.sleep(4500);
  await h.shot('wild-intro');
  // one attack: Enter (Fight) -> Enter (first move)
  await h.press('Enter'); await h.sleep(500); await h.press('Enter'); await h.sleep(3500);
  await h.shot('wild-after-attack');
  // attune: navigate ring to Attune (Fight/Kindred/Bag/Attune/Flee)
  await h.press('ArrowRight'); await h.sleep(250);
  await h.press('ArrowRight'); await h.sleep(250);
  await h.press('ArrowRight'); await h.sleep(250);
  await h.press('Enter'); await h.sleep(700);
  await h.shot('attune-panel');
  await h.press('Enter'); await h.sleep(5000);   // throw first charm
  await h.shot('catch-result');
  for (let i = 0; i < 8; i++) { await h.press('Enter'); await h.sleep(700); }
  const post = await page.evaluate(() => ({ mode: window.LF.game.mode, party: window.LF.G.party.map(m => m.speciesId), codex: window.LF.G.codex }));
  console.log('POST-CATCH:', JSON.stringify(post));
  // save via menu: Esc -> find Save tab (rail: Party/Codex/Bag/Quests/Save/Settings/Resume)
  await h.press('Escape'); await h.sleep(800);
  await h.press('ArrowDown'); await h.sleep(250);
  await h.press('ArrowDown'); await h.sleep(250);
  await h.press('ArrowDown'); await h.sleep(250);
  await h.press('ArrowDown'); await h.sleep(250);
  await h.press('Enter'); await h.sleep(800);
  await h.shot('save-menu');
  await h.press('ArrowDown'); await h.sleep(300); // slot 1 (slot 0 = autosave)
  await h.press('Enter'); await h.sleep(600);
  await h.press('Enter'); await h.sleep(800);     // confirm if asked
  const saved = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('lumenfall_save')));
  console.log('SAVE KEYS:', JSON.stringify(saved));
  // reload and continue
  await page.reload({ waitUntil: 'domcontentloaded' });
  await h.sleep(6500);
  await h.shot('title-after-reload');
  await h.press('ArrowDown'); await h.sleep(300);
  await h.press('Enter'); await h.sleep(1000);    // Continue
  await h.shot('load-menu');
  await h.press('Enter'); await h.sleep(4000);    // pick first populated slot
  await h.shot('loaded');
  const fin = await page.evaluate(() => ({ mode: window.LF?.game.mode, zone: window.LF?.G.pos?.zone, party: window.LF?.G.party?.map(m => `${m.speciesId}:${m.level}`) }));
  console.log('LOADED:', JSON.stringify(fin));
}
