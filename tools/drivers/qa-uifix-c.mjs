// UI-fix verification pass C — hub Quests pane: "Main Quest" / "Side Quests" /
// "Completed" sections (finding 4).
export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 30000);
  await h.sleep(3500);
  await page.evaluate(async () => {
    const { makeCreature } = await import('/src/game/creatures.js');
    const { startQuest, completeQuest } = await import('/src/game/quests.js');
    const { saveGame } = await import('/src/core/save.js');
    const G = window.LF.G;
    G.playerName = 'Rowan';
    G.starter = 'nixling';
    G.party = [makeCreature('charvane', 18, { noGleamRoll: true })];
    startQuest('q_main_2');       // main, active
    startQuest('sq_herbalist');   // side, active
    startQuest('sq_lantern');     // side, active
    startQuest('sq_gleam');
    completeQuest('sq_gleam');    // -> Completed section
    saveGame(1);
  });
  await h.press('ArrowDown'); await h.sleep(300);
  await h.press('Enter'); await h.sleep(900);
  await h.press('ArrowDown'); await h.sleep(300);
  await h.press('Enter'); await h.sleep(1000);
  await h.waitFor(`window.LF.game.mode === 'overworld' && !document.querySelector('.title-root')`, 60000, 500);
  await h.sleep(2000);

  await h.press('Escape'); await h.sleep(700);
  await h.press('ArrowDown', { times: 3, delay: 300 }); await h.sleep(500); // rail -> Quests
  console.log('QUEST SECTIONS:', await page.evaluate(`JSON.stringify([...document.querySelectorAll('.quest-section-label')].map((e) => e.textContent))`));
  console.log('TRACKER CHIP (want MAIN):', await page.evaluate(`document.querySelector('.hq-chip')?.textContent`));
  await h.shot('quests-pane-split');
}
