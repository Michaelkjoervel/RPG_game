// Combat-presentation QA B: cave arena — Resonant Burst cinematic, faint, victory panel.
export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 30000);
  await h.sleep(4000);
  await page.evaluate(() => { document.querySelector('.title-root')?.remove(); });
  await page.evaluate(async () => { await window.LF.game.enterOverworld('dawnmeadow'); });
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
  await h.sleep(1800); await h.shot('b-cave-sendin');
  await h.waitFor(`!!document.querySelector('.bui-dock:not(.hidden)')`, 30000);
  await h.shot('b-dock-burst-ready');
  // Fight -> navigate to burst card (3rd: 2 moves + burst)
  await h.press('Enter'); await h.sleep(800);
  await h.shot('b-moves-with-burst');
  await h.press('ArrowRight', { times: 2, delay: 200 });
  await h.press('Enter');
  await h.sleep(120);
  for (let i = 0; i < 10; i++) { await h.shot(`b-burst-${i}`); await h.sleep(300); }
  // victory panel
  const v = await h.waitFor(`!!document.querySelector('.bui-end.show')`, 30000);
  await h.sleep(800);
  await h.shot('b-victory-panel');
  console.log('VICTORY PANEL:', !!v);
  await h.press('Enter'); await h.sleep(500);
  console.log('B RESULT:', await page.evaluate(`JSON.stringify(window.__result)`));
}
