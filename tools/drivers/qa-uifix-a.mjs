// UI-fix verification pass A — seeded overworld state, then: quest tracker
// (MAIN tag + earliest-main preference), toasts below tracker, hub drill-in /
// one-layer-back behavior, party stat bars + Haven reserve section + swap
// picker, codex composition (mini portraits, opaque detail, lit preview,
// stat bars), bag tabs-row nav + shared picker, save focus/copy/modal,
// shop reached through the merchant dialogue branch, Esc routing, KeyC,
// and a stubbed-gamepad d-pad smoke test.
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
      makeCreature('vellit', 14, { nickname: 'Bramblewhisker the Long-Named', noGleamRoll: true }),
      makeCreature('nixling', 12, { noGleamRoll: true }),
      makeCreature('pipwing', 11, { noGleamRoll: true }),
      makeCreature('myclet', 9, { noGleamRoll: true }),
    ];
    G.party[1].hp = Math.round(G.party[1].maxHp * 0.3);
    G.reserve = [makeCreature('pebbin', 6, { noGleamRoll: true }), makeCreature('oozel', 5, { noGleamRoll: true })];
    for (const it of [['tonic', 5], ['super_tonic', 2], ['remedy', 3], ['woven_charm', 8], ['emberstone', 1], ['might_band', 1]]) st.gainItem(it[0], it[1]);
    ['kindlet', 'charvane', 'nixling', 'vellit', 'pipwing', 'myclet'].forEach((id) => st.markCodex(id, 'caught'));
    ['pebbin', 'oozel', 'duskit', 'cervalume'].forEach((id) => st.markCodex(id, 'seen'));
    G.glim = 430;
    startQuest('q_main_1');   // main, started FIRST
    startQuest('sq_gleam');   // side, started LAST — old tracker hijacked onto this
    window.LF.bus.emit('party:changed');
  });
  await page.evaluate(async () => {
    await Promise.race([window.LF.game.enterOverworld('brighthollow'), new Promise((r) => setTimeout(r, 60000))]);
  });
  await h.sleep(2500);

  // ---- 1. Tracker preference + tag chip + toasts below the tracker
  console.log('TRACKED NAME (want main "The Warden\'s Oath"):', await page.evaluate(`document.querySelector('.hq-name')?.textContent`));
  console.log('TRACKED CHIP (want MAIN):', await page.evaluate(`document.querySelector('.hq-chip')?.textContent`));
  await page.evaluate(() => {
    window.LF.bus.emit('notify', { text: 'A toast that must sit below the tracker.', icon: '✦', duration: 9000 });
    window.LF.bus.emit('notify', { text: 'And a second one below the first.', duration: 9000 });
  });
  await h.sleep(500);
  console.log('TOAST TOP vs TRACKER BOTTOM:', await page.evaluate(() => {
    const q = document.querySelector('.hud-quest').getBoundingClientRect();
    const t = document.querySelector('.hud-toasts').getBoundingClientRect();
    return JSON.stringify({ trackerBottom: Math.round(q.bottom), toastsTop: Math.round(t.top), below: t.top >= q.bottom });
  }));
  await h.shot('tracker-main-tag-toasts');

  // ---- 2. Hub: drill-in must NOT activate first pane item; Q backs one layer
  await h.press('Escape'); await h.sleep(700);
  await h.shot('hub-rail-hint-footer');
  await h.press('Enter'); await h.sleep(400);
  console.log('DETAILS OPEN AFTER DRILL-IN (want false):', await page.evaluate(`!!document.querySelector('.party-details')`));
  await h.shot('party-pane-haven');
  await h.press('q'); await h.sleep(350);
  console.log('HUB STILL OPEN AFTER ONE Q (want true):', await page.evaluate(`!!document.querySelector('.menu-hub.open')`));
  await h.press('Escape'); await h.sleep(400);
  console.log('HUB CLOSED FROM RAIL VIA ESC (want false):', await page.evaluate(`!!document.querySelector('.menu-hub.open')`));

  // ---- 3. Party: stat bars, details, Haven swap picker
  await h.press('Escape'); await h.sleep(600);
  await h.press('Enter'); await h.sleep(350); // drill into party
  await h.press('Enter'); await h.sleep(500); // open details of focused card
  console.log('STAT BAR FILL RECT (want w>0):', await page.evaluate(() => {
    const f = document.querySelector('.party-details .stat-bar-fill');
    if (!f) return 'NO FILL';
    const r = f.getBoundingClientRect();
    return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height), transform: getComputedStyle(f).transform });
  }));
  await h.shot('party-details-statbars');
  await h.press('q'); await h.sleep(350); // close details, stay in pane
  await page.click('.party-reserve-grid .party-card'); await h.sleep(400);
  await h.shot('haven-swap-picker');
  console.log('PICKER OPEN (want true):', await page.evaluate(`!!document.querySelector('.picker-overlay')`));
  await h.press('q'); await h.sleep(350);
  console.log('AFTER Q: picker closed, pane intact:', await page.evaluate(`JSON.stringify({picker: !!document.querySelector('.picker-overlay'), hub: !!document.querySelector('.menu-hub.open')})`));
  await h.press('q'); await h.sleep(300); // back to rail
  await h.press('Escape'); await h.sleep(400); // close hub

  // ---- 4. KeyC -> codex; grid portraits; detail composition + lighting
  await h.press('c'); await h.sleep(900);
  console.log('KEYC OPENED CODEX (want true):', await page.evaluate(`!!document.querySelector('.menu-hub.open') && !!document.querySelector('.codex-grid')`));
  await h.shot('codex-grid-portraits');
  await h.press('Enter'); await h.sleep(2500); // detail of slot 0 (kindlet, caught)
  console.log('CODEX DETAIL STAT BAR (want w>0):', await page.evaluate(() => {
    const f = document.querySelector('.codex-detail .stat-bar-fill');
    if (!f) return 'NO FILL';
    const r = f.getBoundingClientRect();
    return JSON.stringify({ w: Math.round(r.width), transform: getComputedStyle(f).transform });
  }));
  console.log('CODEX DETAIL BG (want opaque rgb):', await page.evaluate(`getComputedStyle(document.querySelector('.codex-detail')).backgroundColor`));
  await h.shot('codex-detail-composition');
  await h.press('q'); await h.sleep(350);
  await h.press('q'); await h.sleep(300);
  await h.press('Escape'); await h.sleep(400);

  // ---- 5. Bag: tabs row nav + shared picker
  await h.press('Escape'); await h.sleep(600);
  await h.press('ArrowDown', { times: 2, delay: 300 }); await h.sleep(300); // rail -> bag
  await h.press('Enter'); await h.sleep(400); // drill in
  console.log('BAG PICKER AFTER DRILL-IN (want false):', await page.evaluate(`!!document.querySelector('.picker-overlay')`));
  await h.shot('bag-focused-item');
  await h.press('ArrowUp'); await h.sleep(250); // to tabs row
  console.log('TABS ROW FOCUSED (want true):', await page.evaluate(`!!document.querySelector('.bag-tab.focused')`));
  await h.press('ArrowRight'); await h.sleep(250); // charms tab
  console.log('TAB AFTER RIGHT (want Charms active):', await page.evaluate(`document.querySelector('.bag-tab.active')?.textContent`));
  await h.press('ArrowLeft'); await h.sleep(250); // back to restoratives
  await h.press('ArrowDown'); await h.sleep(250); // into list
  await h.press('Enter'); await h.sleep(400); // use tonic -> target picker
  await h.shot('bag-target-picker');
  await h.press('ArrowDown'); await h.sleep(200);
  await h.press('Enter'); await h.sleep(500); // heal Bramblewhisker
  console.log('PICKER GONE AFTER PICK (want false):', await page.evaluate(`!!document.querySelector('.picker-overlay')`));
  await h.press('q'); await h.sleep(300);
  await h.press('Escape'); await h.sleep(400);

  // ---- 6. Save: initial focus slot 1, neutral copy, non-stacking modal
  await h.press('Escape'); await h.sleep(600);
  await h.press('ArrowDown', { times: 4, delay: 250 }); await h.sleep(200); // rail -> save
  await h.press('Enter'); await h.sleep(800);
  console.log('SAVE FOCUS (want Slot 1 focused):', await page.evaluate(`document.querySelector('.save-card.focused')?.textContent?.slice(0, 40)`));
  await h.shot('save-initial-focus');
  await h.press('Enter'); await h.sleep(600); // save to empty slot 1
  await h.press('Enter'); await h.sleep(500); // overwrite confirm appears
  console.log('CONFIRM MODALS (want 1):', await page.evaluate(`document.querySelectorAll('.confirm-modal').length`));
  await h.press('Enter'); await h.sleep(500); // focused=Cancel (danger) -> closes
  console.log('MODALS AFTER ENTER (want 0, no stacking):', await page.evaluate(`document.querySelectorAll('.confirm-modal').length`));
  await h.shot('save-after-modal');
  await h.press('Escape'); await h.sleep(500);
  console.log('AFTER ESC: save closed, hub open:', await page.evaluate(`JSON.stringify({save: !!document.querySelector('.save-root'), hub: !!document.querySelector('.menu-hub.open')})`));
  await h.press('Escape'); await h.sleep(400);
  console.log('HUB AFTER 2ND ESC (want false):', await page.evaluate(`!!document.querySelector('.menu-hub.open')`));

  // ---- 7. Shop through the merchant dialogue branch
  await page.evaluate(() => {
    Promise.all([import('/src/game/story.js'), import('/src/data/npcs.js')])
      .then(([story, npcs]) => story.runNpcInteraction(npcs.NPCS.merchant_pip, null))
      .catch((e) => console.error('merchant interaction failed', e));
  });
  await h.sleep(1200);
  await h.press('Enter', { times: 5, delay: 900 }); // advance greeting dialogue
  const shopUp = await h.waitFor(`!!document.querySelector('.shop-root')`, 15000, 500);
  console.log('SHOP OPENED FROM MERCHANT TALK (want true):', !!shopUp);
  await h.sleep(600);
  await h.shot('shop-from-merchant');
  await h.press('ArrowRight', { times: 2, delay: 200 }); // qty 1 -> 3 on focused row
  console.log('QTY AFTER 2x RIGHT (want 3):', await page.evaluate(`document.querySelector('.shop-item.focused .qs-val')?.textContent`));
  await h.shot('shop-qty-keyboard');
  await h.press('Escape'); await h.sleep(700);
  console.log('AFTER ESC: shop closed, hub NOT toggled:', await page.evaluate(`JSON.stringify({shop: !!document.querySelector('.shop-root'), hub: !!document.querySelector('.menu-hub.open')})`));

  // ---- 8. Gamepad d-pad smoke test (stubbed pad drives the hub rail)
  await page.evaluate(() => {
    const mkPad = (pressedIdx) => ({
      axes: [0, 0], connected: true, mapping: 'standard',
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === pressedIdx, value: i === pressedIdx ? 1 : 0 })),
    });
    window.__setPad = (idx) => { window.__padState = idx; };
    window.__padState = -1;
    navigator.getGamepads = () => [mkPad(window.__padState)];
  });
  await h.press('Escape'); await h.sleep(600); // open hub
  const railBefore = await page.evaluate(`document.querySelector('.menu-rail-item.focused')?.textContent`);
  await page.evaluate(`window.__setPad(13)`); // d-pad down
  await h.sleep(150);
  await page.evaluate(`window.__setPad(-1)`);
  await h.sleep(250);
  const railAfter = await page.evaluate(`document.querySelector('.menu-rail-item.focused')?.textContent`);
  console.log('DPAD DOWN MOVED RAIL (want different):', JSON.stringify({ railBefore, railAfter, moved: railBefore !== railAfter }));
  // left-stick pulse: push axis 1 hard down briefly
  await page.evaluate(() => {
    const mk = (y) => ({
      axes: [0, y], connected: true, mapping: 'standard',
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    });
    let t = 0;
    navigator.getGamepads = () => [mk(t++ < 20 ? 0.9 : 0)];
  });
  await h.sleep(500);
  const railAfterStick = await page.evaluate(`document.querySelector('.menu-rail-item.focused')?.textContent`);
  console.log('STICK PULSE MOVED RAIL (want different from railAfter):', JSON.stringify({ railAfter, railAfterStick }));
  await page.evaluate(() => { navigator.getGamepads = () => []; });
  await h.press('Escape'); await h.sleep(300);
}
