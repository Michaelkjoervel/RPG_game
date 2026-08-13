// UI/UX QA pass C2 — pause hub hero shots at 1600x900 (run with QA_BEAUTY=1).
export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 40000);
  await h.sleep(4000);
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
    ];
    G.party[1].hp = Math.round(G.party[1].maxHp * 0.3);
    ['kindlet', 'charvane', 'nixling', 'vellit'].forEach((id) => st.markCodex(id, 'caught'));
    ['pebbin', 'oozel'].forEach((id) => st.markCodex(id, 'seen'));
    st.gainItem('tonic', 5);
    startQuest('q_main_1');
    window.LF.bus.emit('party:changed');
    window.LF.bus.emit('letterbox', { on: false });
  });
  await page.evaluate(async () => {
    await Promise.race([window.LF.game.enterOverworld('brighthollow'), new Promise((r) => setTimeout(r, 90000))]);
  });
  await h.sleep(3000);
  await h.press('Escape'); await h.sleep(900);
  await h.shot('hub-party-hero');
  await h.press('Enter'); await h.sleep(400);
  await h.press('Enter'); await h.sleep(600);        // details of Charvane (focus 0)
  await h.shot('party-details-hero');
  await h.press('Escape'); await h.sleep(500);
  await h.press('Escape'); await h.sleep(700);
  await h.press('ArrowDown'); await h.sleep(600);    // codex tab
  await h.press('Enter'); await h.sleep(3000);       // drill-in (double-fire opens kindlet detail)
  await h.shot('codex-detail-hero');
}
