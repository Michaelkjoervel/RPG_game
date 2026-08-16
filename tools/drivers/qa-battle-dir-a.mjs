// Combat-presentation QA A: forest arena warden battle (mouse-driven — no keys,
// so the title screen's still-armed confirm handlers never fire).
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
    const me = makeCreature('charvane', 16, { moves: ['cindersnap', 'emberflick'], noGleamRoll: true });
    const foe = makeCreature('thistlit', 12, { moves: ['thornlash'], noGleamRoll: true });
    window.LF.G.party = [me];
    window.__result = null;
    window.LF.game.startBattle({
      playerTeam: [me], enemyTeam: [foe], kind: 'warden', enemyName: 'Steward Fen',
      ai: 'basic', arena: 'forest', canFlee: false, canCatch: false,
    }).then((r) => (window.__result = r)).catch((e) => console.error('battle err', e));
  });
  await h.sleep(1100); await h.shot('a-intro-early');
  await h.sleep(1400); await h.shot('a-vscard');
  await h.sleep(1500); await h.shot('a-sendin');
  await h.waitFor(`!!document.querySelector('.bui-dock:not(.hidden)')`, 30000);
  await h.shot('a-idle-between-turns');
  // Turn 1: melee (cindersnap)
  await page.click('.bui-ring .bui-card:nth-child(1)'); await h.sleep(700);
  await page.click('.bui-moves-grid .bui-move-card:nth-child(1)');
  await h.sleep(120);
  for (let i = 0; i < 6; i++) {
    await h.shot(`a-melee-${i}`);
    console.log('DMG-ELS', i, await page.evaluate(`[...document.querySelectorAll('.bui-dmg')].map(e=>e.textContent+'@'+e.style.left+','+e.style.top).join('|') || 'none'`));
    await h.sleep(200);
  }
  await h.waitFor(`!!document.querySelector('.bui-dock:not(.hidden)')`, 30000);
  await h.shot('a-between-2');
  // Turn 2: projectile (emberflick, super effective vs bloom)
  await page.click('.bui-ring .bui-card:nth-child(1)'); await h.sleep(700);
  await page.click('.bui-moves-grid .bui-move-card:nth-child(2)');
  await h.sleep(100);
  for (let i = 0; i < 7; i++) {
    await h.shot(`a-proj-${i}`);
    console.log('DMG-ELS', i, await page.evaluate(`[...document.querySelectorAll('.bui-dmg')].map(e=>e.textContent+'@'+e.style.left+','+e.style.top).join('|') || 'none'`));
    await h.sleep(200);
  }
  console.log('A RESULT:', await page.evaluate(`JSON.stringify(window.__result)`));
}
