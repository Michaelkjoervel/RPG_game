// UI/UX QA pass C — hero composition shots at 1600x900 (run with QA_BEAUTY=1).
// Title, name modal, starter sanctum, then seeded pause hub party + codex detail.
export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 40000);
  await h.sleep(5000);
  await h.shot('title-hero');
  await h.press('Enter'); await h.sleep(900);
  await h.shot('name-modal-hero');
  await h.press('Enter'); await h.sleep(1600);
  // advance intro dialogue to the starter sanctum
  for (let i = 0; i < 12; i++) {
    if (await page.evaluate(`!!document.querySelector('.starter-root')`)) break;
    await h.press('Enter'); await h.sleep(1000);
  }
  await h.sleep(4000);
  await h.shot('starter-hero');
  // Abandon the flow: seed state and jump straight to the hub for DOM shots.
  await page.evaluate(async () => {
    const { makeCreature } = await import('/src/game/creatures.js');
    const st = await import('/src/core/state.js');
    const G = window.LF.G;
    G.party = [
      makeCreature('charvane', 18, { resonance: 3 }),
      makeCreature('vellit', 14, { nickname: 'Bramblewhisker' }),
      makeCreature('nixling', 12, {}),
    ];
    ['kindlet', 'charvane', 'nixling', 'vellit', 'pipwing', 'myclet'].forEach((id, i) => st.markCodex(id, i < 4 ? 'caught' : 'seen'));
    st.gainItem('tonic', 5); st.gainItem('emberstone', 1);
    window.LF.bus.emit('party:changed');
  });
  // Starter UI is a cutscene; the pause hub needs overworld mode. Force it.
  await page.evaluate(() => {
    document.querySelector('.starter-root')?.remove();
    window.LF.game.mode = 'overworld';
  });
  await h.press('Escape'); await h.sleep(900);
  await h.shot('hub-party-hero');
  await h.press('ArrowDown'); await h.sleep(600);
  await h.shot('hub-codex-hero');
  await h.press('Enter'); await h.sleep(300);
  await h.press('Enter'); await h.sleep(2600);
  await h.shot('codex-detail-hero');
}
