// Combat-presentation QA A: forest arena warden battle.
// Captures intro/vs-card, send-in, melee contact frames, projectile mid-flight,
// super-effective hit with damage number.
export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 30000);
  await h.sleep(4000);
  await page.evaluate(() => { document.querySelector('.title-root')?.remove(); });
  await page.evaluate(async () => { await window.LF.game.enterOverworld('dawnmeadow'); });
  await h.sleep(1500);
  await page.evaluate(async () => {
    const { makeCreature } = await import('/src/game/creatures.js');
    const me = makeCreature('charvane', 16, { moves: ['cindersnap', 'emberflick'], noGleamRoll: true });
    const foe = makeCreature('briarback', 14, { moves: ['thornlash'], noGleamRoll: true });
    window.LF.G.party = [me];
    window.__result = null;
    window.LF.game.startBattle({
      playerTeam: [me], enemyTeam: [foe], kind: 'warden', enemyName: 'Steward Fen',
      ai: 'basic', arena: 'forest', canFlee: false, canCatch: false,
    }).then((r) => (window.__result = r)).catch((e) => console.error('battle err', e));
  });
  await h.sleep(900); await h.shot('a-intro-vscard');
  await h.sleep(1100); await h.shot('a-sendin');
  await h.sleep(800); await h.shot('a-sendin-2');
  await h.waitFor(`!!document.querySelector('.bui-dock:not(.hidden)')`, 30000);
  await h.shot('a-idle-between-turns');
  // Turn 1: melee (cindersnap)
  await h.press('Enter'); await h.sleep(800);
  await h.shot('a-moves-panel');
  await h.press('Enter');
  await h.sleep(150);
  for (let i = 0; i < 6; i++) { await h.shot(`a-melee-${i}`); await h.sleep(280); }
  await h.waitFor(`!!document.querySelector('.bui-dock:not(.hidden)')`, 30000);
  // Turn 2: projectile (emberflick, super effective vs bloom)
  await h.press('Enter'); await h.sleep(800);
  await h.press('ArrowRight'); await h.sleep(200);
  await h.press('Enter');
  await h.sleep(120);
  for (let i = 0; i < 7; i++) { await h.shot(`a-proj-${i}`); await h.sleep(260); }
  console.log('A RESULT:', await page.evaluate(`JSON.stringify(window.__result)`));
}
