// UI/UX QA pass B (v2) — pause hub deep dive with seeded state, shop, dialogue choices.
// Works around the cancel double-fire bug by closing/reopening the hub between tabs.
export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 30000);
  await h.sleep(3000);
  await page.evaluate(() => { document.querySelector('.title-root')?.remove(); });
  await page.evaluate(async () => {
    const { makeCreature } = await import('/src/game/creatures.js');
    const st = await import('/src/core/state.js');
    const { startQuest } = await import('/src/game/quests.js');
    const G = window.LF.G;
    G.playerName = 'Rowan';
    G.party = [
      makeCreature('charvane', 18, { resonance: 3, noGleamRoll: true }),
      makeCreature('vellit', 14, { nickname: 'Bramblewhisker', noGleamRoll: true }),
      makeCreature('nixling', 12, { noGleamRoll: true }),
      makeCreature('pipwing', 11, { noGleamRoll: true }),
      makeCreature('myclet', 9, { noGleamRoll: true }),
    ];
    G.party[1].hp = Math.round(G.party[1].maxHp * 0.3);
    G.party[2].hp = 0;
    G.party[3].status = 'seared';
    G.reserve = [makeCreature('pebbin', 6, { noGleamRoll: true }), makeCreature('oozel', 5, { noGleamRoll: true })];
    for (const it of [['tonic', 5], ['super_tonic', 2], ['remedy', 3], ['honey_drop', 1], ['woven_charm', 8], ['glazed_charm', 2], ['emberstone', 1], ['bloomstone', 1], ['might_band', 1], ['survivor_knot', 1]]) st.gainItem(it[0], it[1]);
    ['kindlet', 'charvane', 'nixling', 'vellit', 'pipwing', 'myclet'].forEach((id) => st.markCodex(id, 'caught'));
    ['pebbin', 'oozel', 'duskit'].forEach((id) => st.markCodex(id, 'seen'));
    G.glim = 430;
    startQuest('q_main_1'); startQuest('sq_gleam');
    window.LF.bus.emit('party:changed');
  });
  await page.evaluate(async () => {
    await Promise.race([window.LF.game.enterOverworld('brighthollow'), new Promise((r) => setTimeout(r, 60000))]);
  });
  await h.sleep(2500);
  console.log('HUD TRACKED QUEST:', await page.evaluate(`document.querySelector('.hq-name')?.textContent`));

  const hubOpen = async () => { await h.press('Escape'); await h.sleep(700); };
  const hubClosed = () => page.evaluate(`!document.querySelector('.menu-hub.open')`);
  const hubClose = async () => { await h.press('Escape'); await h.sleep(500); if (!(await hubClosed())) { await h.press('Escape'); await h.sleep(500); } };

  // ---- Party
  await hubOpen();
  await h.shot('hub-rail-party');
  await h.press('Enter'); await h.sleep(400);
  await h.shot('party-grid-focused');
  await h.press('ArrowRight'); await h.sleep(250);
  await h.press('Enter'); await h.sleep(500);
  await h.shot('party-details');
  await page.click('.move-slot'); await h.sleep(400);
  await h.shot('move-picker');
  await h.press('q'); await h.sleep(400);
  console.log('AFTER CANCEL ON PICKER:', await page.evaluate(`JSON.stringify({picker: !!document.querySelector('.picker-overlay'), details: !!document.querySelector('.party-details')})`));
  await h.shot('move-picker-orphaned');
  await page.evaluate(() => document.querySelector('.picker-overlay')?.remove());
  await h.press('q'); await h.sleep(400);
  console.log('HUB AFTER ONE Q FROM PARTY GRID (expect open, actual):', await page.evaluate(`!!document.querySelector('.menu-hub.open')`));
  await h.shot('hub-after-one-q');
  await hubClose();

  // ---- Codex
  await hubOpen(); await h.press('ArrowDown'); await h.sleep(500);
  await h.shot('codex-grid');
  await h.press('Enter'); await h.sleep(2500); // drill-in double-fires -> detail of slot 0
  await h.shot('codex-detail-caught');
  await h.press('q'); await h.sleep(400);
  await h.press('ArrowRight', { times: 15, delay: 110 });
  await h.press('Enter'); await h.sleep(2200); // pebbin (seen)
  await h.shot('codex-detail-seen');
  await h.press('q'); await h.sleep(300);
  await hubClose();

  // ---- Bag
  await hubOpen(); await h.press('ArrowDown', { times: 2, delay: 300 }); await h.sleep(400);
  await h.shot('bag-restoratives');
  await h.press('Enter'); await h.sleep(500); // drill-in double-fire -> instantly opens use-picker
  await h.shot('bag-drillin-doublefire');
  const pickerOpen = await page.evaluate(`!!document.querySelector('.picker-overlay')`);
  console.log('PICKER OPENED BY SINGLE DRILL-IN ENTER:', pickerOpen);
  if (!pickerOpen) { await h.press('Enter'); await h.sleep(400); await h.shot('bag-use-picker'); }
  await h.press('q'); await h.sleep(300);
  console.log('PICKER AFTER Q:', await page.evaluate(`!!document.querySelector('.picker-overlay')`));
  if (await page.evaluate(`!!document.querySelector('.picker-overlay')`)) {
    await page.click('.picker-item'); await h.sleep(600);
  }
  await h.shot('bag-after-heal');
  await h.press('ArrowRight', { times: 2, delay: 250 });
  await h.shot('bag-stones');
  await h.press('ArrowRight', { times: 2, delay: 250 });
  await h.shot('bag-key-empty');
  await hubClose();

  // ---- Quests
  await hubOpen(); await h.press('ArrowDown', { times: 3, delay: 300 });
  await page.evaluate(async () => { const { completeQuest } = await import('/src/game/quests.js'); completeQuest('sq_gleam'); });
  await h.sleep(600);
  await h.shot('quests-pane');

  // ---- Save
  await h.press('ArrowDown'); await h.sleep(300);
  await h.press('Enter'); await h.sleep(800);
  await h.shot('save-slots');
  await h.press('ArrowDown'); await h.sleep(250);
  await h.press('Enter'); await h.sleep(600);
  await h.shot('save-done');
  await h.press('Enter'); await h.sleep(500);
  await h.shot('save-overwrite-confirm');
  await h.press('Enter'); await h.sleep(500);
  console.log('CONFIRM MODALS STACKED:', await page.evaluate(`document.querySelectorAll('.confirm-modal').length`));
  await h.shot('save-confirm-enter-again');
  await page.evaluate(() => { document.querySelectorAll('.modal-scrim').forEach((m) => m.remove()); });
  await h.press('q'); await h.sleep(500);
  await hubClose();

  // ---- Settings
  await hubOpen(); await h.press('ArrowDown', { times: 5, delay: 250 }); await h.sleep(300);
  await h.press('Enter'); await h.sleep(300);
  await h.press('ArrowDown'); await h.sleep(250);
  await h.shot('settings-focused-row');
  await hubClose();

  // ---- Shop
  await page.evaluate(`import('/src/ui/shopUI.js').then(m => { window.__shopP = m.showShop('shop_brighthollow'); })`);
  await h.sleep(1000);
  await h.shot('shop-buy');
  await page.click('.qs-inc'); await page.click('.qs-inc'); await h.sleep(250);
  await h.shot('shop-qty-3');
  await page.click('.shop-item-buy'); await h.sleep(700);
  await h.shot('shop-bought');
  await h.press('ArrowRight'); await h.sleep(400);
  await h.shot('shop-sell');
  await h.press('Escape'); await h.sleep(800);
  console.log('SHOP AFTER ESC:', await page.evaluate(`JSON.stringify({shop: !!document.querySelector('.shop-root'), hubOpen: !!document.querySelector('.menu-hub.open')})`));
  await h.shot('shop-after-esc');
  if (await page.evaluate(`!!document.querySelector('.menu-hub.open')`)) { await h.press('Escape'); await h.sleep(400); }
  if (await page.evaluate(`!!document.querySelector('.shop-root')`)) { await page.click('.shop-close'); await h.sleep(500); }

  // ---- Dialogue with choices
  await page.evaluate(`import('/src/ui/dialogueUI.js').then(m => { window.__dlgP = m.showDialogueById('dlg_finn_intro'); })`);
  await h.sleep(1600);
  await h.shot('dialogue-narration');
  await h.press('Enter', { times: 2, delay: 1100 }); await h.sleep(1500);
  await h.press('Enter'); await h.sleep(1500);
  await h.shot('dialogue-choices');
  await h.press('ArrowDown'); await h.sleep(300);
  await h.shot('dialogue-choice-2');
  await h.press('Enter'); await h.sleep(400);
}
