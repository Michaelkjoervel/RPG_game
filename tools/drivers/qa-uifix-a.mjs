// UI-fix verification pass A — seeds a save, enters via the REAL title
// Continue path (so the title screen tears down properly), then verifies:
// quest tracker (MAIN tag + earliest-main preference), toasts below tracker,
// hub drill-in / one-layer-back behavior, party stat bars + Haven reserve
// section + swap picker, codex composition (mini portraits, opaque detail,
// lit preview, stat bars), bag tabs-row nav + shared picker, save focus/copy/
// non-stacking modal, shop reached through the merchant dialogue branch,
// Esc routing, KeyC, and a stubbed-gamepad d-pad/stick smoke test.
export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 30000);
  await h.sleep(3500);

  // ---- Seed a full mid-game state and write it to save slot 1
  await page.evaluate(async () => {
    const { makeCreature } = await import('/src/game/creatures.js');
    const st = await import('/src/core/state.js');
    const { startQuest } = await import('/src/game/quests.js');
    const { saveGame } = await import('/src/core/save.js');
    const G = window.LF.G;
    G.playerName = 'Rowan';
    G.starter = 'nixling';
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
    console.log('SEED charvane maxHp =', G.party[0].maxHp, 'might =', G.party[0].stats?.might);
    saveGame(1);
  });

  // ---- Enter through the real title Continue path
  await h.press('ArrowDown'); await h.sleep(300);   // New Journey -> Continue (re-enabled by the fresh save)
  await h.press('Enter'); await h.sleep(900);       // load menu
  await h.press('ArrowDown'); await h.sleep(300);   // autosave -> slot 1
  await h.press('Enter'); await h.sleep(1000);      // load + teardown title + enter overworld
  await h.waitFor(`window.LF.game.mode === 'overworld' && !document.querySelector('.title-root')`, 60000, 500);
  await h.sleep(2500);
  console.log('MODE:', await page.evaluate(`window.LF.game.mode`), 'PARTY:', await page.evaluate(`window.LF.G.party.length`), 'RESERVE:', await page.evaluate(`window.LF.G.reserve.length`));

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
  await h.press('Enter'); await h.sleep(600); // open details of focused card
  console.log('STAT BAR FILLS (want w>0, varied scaleX):', await page.evaluate(() => {
    const fills = [...document.querySelectorAll('.party-details .stat-bar-fill')];
    if (!fills.length) return 'NO FILLS';
    return JSON.stringify(fills.slice(0, 3).map((f) => {
      const r = f.getBoundingClientRect();
      return { w: Math.round(r.width), t: getComputedStyle(f).transform };
    }));
  }));
  await h.shot('party-details-statbars');
  await h.press('q'); await h.sleep(350); // close details, stay in pane
  console.log('AFTER Q: details closed, hub open:', await page.evaluate(`JSON.stringify({details: !!document.querySelector('.party-details'), hub: !!document.querySelector('.menu-hub.open')})`));
  await page.click('.party-reserve-grid .party-card'); await h.sleep(500);
  console.log('HAVEN PICKER OPEN (want true):', await page.evaluate(`!!document.querySelector('.picker-overlay')`));
  await h.shot('haven-swap-picker');
  await h.press('q'); await h.sleep(350);
  console.log('AFTER Q: picker closed, pane intact:', await page.evaluate(`JSON.stringify({picker: !!document.querySelector('.picker-overlay'), hub: !!document.querySelector('.menu-hub.open')})`));
  await h.press('q'); await h.sleep(300); // back to rail
  await h.press('Escape'); await h.sleep(400); // close hub

  // ---- 4. KeyC -> codex; grid portraits; detail composition + lighting
  await h.press('c'); await h.sleep(1000);
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
  console.log('SAVE FOCUSED CARD (want Slot 1):', await page.evaluate(`document.querySelector('.save-card.focused .save-card-tag')?.textContent ?? document.querySelector('.save-card.focused')?.textContent?.slice(0, 40)`));
  await h.shot('save-initial-focus');
  await h.press('ArrowDown'); await h.sleep(250); // slot 2 (empty, "Save here")
  await h.press('Enter'); await h.sleep(600);     // save to empty slot 2, no modal
  console.log('MODALS AFTER EMPTY-SLOT SAVE (want 0):', await page.evaluate(`document.querySelectorAll('.confirm-modal').length`));
  await h.press('Enter'); await h.sleep(500);     // now occupied -> overwrite confirm
  console.log('CONFIRM MODALS (want 1):', await page.evaluate(`document.querySelectorAll('.confirm-modal').length`));
  await h.shot('save-overwrite-modal');
  await h.press('Enter'); await h.sleep(500);     // focused=Cancel (danger) -> closes, no stack
  console.log('MODALS AFTER ENTER (want 0, no stacking):', await page.evaluate(`document.querySelectorAll('.confirm-modal').length`));
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
  for (let i = 0; i < 8; i++) { // advance greeting until the shop appears
    if (await page.evaluate(`!!document.querySelector('.shop-root')`)) break;
    await h.press('Enter');
    await h.sleep(900);
  }
  const shopUp = await h.waitFor(`!!document.querySelector('.shop-root')`, 10000, 500);
  console.log('SHOP OPENED FROM MERCHANT TALK (want true):', !!shopUp);
  await h.sleep(600);
  await h.shot('shop-from-merchant');
  await h.press('ArrowRight', { times: 2, delay: 200 }); // qty 1 -> 3 on focused row
  console.log('QTY AFTER 2x RIGHT (want 3):', await page.evaluate(`document.querySelector('.shop-item.focused .qs-val')?.textContent`));
  await h.shot('shop-qty-keyboard');
  await h.press('Escape'); await h.sleep(800);
  console.log('AFTER ESC: shop closed, hub NOT toggled:', await page.evaluate(`JSON.stringify({shop: !!document.querySelector('.shop-root'), hub: !!document.querySelector('.menu-hub.open')})`));

  // ---- 8. Gamepad smoke test (stubbed pad drives the hub rail)
  // Frame-based stub: pressed for N polls — wall-clock timing misses frames
  // entirely under the software renderer.
  await page.evaluate(() => {
    const mkPad = (pressedIdx) => ({
      axes: [0, 0], connected: true, mapping: 'standard',
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === pressedIdx, value: i === pressedIdx ? 1 : 0 })),
    });
    window.__padFrames = 0;
    window.__setPad = (idx, frames) => { window.__padState = idx; window.__padFrames = frames; };
    window.__padState = -1;
    navigator.getGamepads = () => {
      const idx = window.__padFrames-- > 0 ? window.__padState : -1;
      return [mkPad(idx)];
    };
  });
  await h.press('Escape'); await h.sleep(600); // open hub
  const railBefore = await page.evaluate(`document.querySelector('.menu-rail-item.focused')?.textContent`);
  await page.evaluate(`window.__setPad(13, 6)`); // d-pad down, held 6 polled frames
  await h.sleep(700);
  const railAfter = await page.evaluate(`document.querySelector('.menu-rail-item.focused')?.textContent`);
  console.log('DPAD DOWN MOVED RAIL (want moved:true):', JSON.stringify({ railBefore, railAfter, moved: railBefore !== railAfter }));
  // left-stick pulse: push axis 1 hard down for ~20 frames
  await page.evaluate(() => {
    const mk = (y) => ({
      axes: [0, y], connected: true, mapping: 'standard',
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    });
    let t = 0;
    navigator.getGamepads = () => [mk(t++ < 15 ? 0.9 : 0)];
  });
  await h.sleep(600);
  const railAfterStick = await page.evaluate(`document.querySelector('.menu-rail-item.focused')?.textContent`);
  console.log('STICK PULSE MOVED RAIL (want different from railAfter):', JSON.stringify({ railAfter, railAfterStick }));
  await page.evaluate(() => { navigator.getGamepads = () => []; });
  await h.press('Escape'); await h.sleep(300);
}
