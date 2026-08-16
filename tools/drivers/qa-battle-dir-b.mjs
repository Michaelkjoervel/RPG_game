// Combat-presentation QA B: cave arena — Resonant Burst cinematic, faint, victory panel.
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
    const me = makeCreature('kindlet', 18, { moves: ['emberflick', 'cindersnap'], resonance: 3, noGleamRoll: true });
    me.burstCharge = 100;
    const foe = makeCreature('vellit', 3, { noGleamRoll: true });
    window.LF.G.party = [me];
    window.__result = null;
    window.LF.game.startBattle({
      playerTeam: [me], enemyTeam: [foe], kind: 'warden', enemyName: 'Seeker Vess',
      ai: 'basic', arena: 'cave', canFlee: false, canCatch: false,
    }).then((r) => (window.__result = r)).catch((e) => console.error('battle err', e));
  });
  await h.sleep(2000); await h.shot('b-cave-sendin');
  await h.waitFor(`!!document.querySelector('.bui-dock:not(.hidden)')`, 30000);
  await h.shot('b-dock-burst-ready');
  await page.click('.bui-ring .bui-card:nth-child(1)'); await h.sleep(700);
  await h.shot('b-moves-with-burst');
  const hasBurst = await page.evaluate(`!!document.querySelector('.bui-burst-card')`);
  console.log('BURST CARD:', hasBurst);
  if (hasBurst) await page.click('.bui-burst-card');
  else await page.click('.bui-moves-grid .bui-move-card:nth-child(1)');
  await h.sleep(100);
  for (let i = 0; i < 10; i++) {
    await h.shot(`b-burst-${i}`);
    console.log('DMG-ELS', i, await page.evaluate(`[...document.querySelectorAll('.bui-dmg')].map(e=>e.textContent).join('|') || 'none'`));
    await h.sleep(250);
  }
  const v = await h.waitFor(`!!document.querySelector('.bui-end.show')`, 30000);
  await h.sleep(800);
  await h.shot('b-victory-panel');
  console.log('VICTORY PANEL:', !!v, 'B RESULT:', await page.evaluate(`JSON.stringify(window.__result)`));
}
