// Showcase tour A: title → starter choice → town → menus → battle.
const M = (m) => `window.LF?.game.mode === '${m}'`;

export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(3500);
  await h.shot('title');

  // New Journey → name → intro → starter sanctum
  await h.press('Enter'); await h.sleep(1500);
  await h.shot('name-entry');
  await h.press('Enter');
  await h.waitFor(`document.querySelector('.starter-root')`, 60000);
  await h.sleep(2500);
  await h.shot('starter-1');
  await h.press('ArrowRight'); await h.sleep(2000);
  await h.shot('starter-2');
  await h.press('ArrowRight'); await h.sleep(2000);
  await h.shot('starter-3');

  // Seed straight into the overworld with a small team (skips the scripted intro spar)
  await page.evaluate(async () => {
    const { G, gainItem, markCodex, setFlag } = await import('/src/core/state.js');
    const { makeCreature } = await import('/src/game/creatures.js');
    G.playerName = 'Rowan'; G.starter = 'kindlet';
    G.party = [makeCreature('kindlet', 12, { resonance: 2 }), makeCreature('pipwing', 10), makeCreature('pebbin', 9)];
    G.reserve = [makeCreature('duskit', 8)];
    gainItem('woven_charm', 6); gainItem('tonic', 4); gainItem('super_tonic', 2);
    gainItem('emberstone', 1); gainItem('might_band', 1); gainItem('kindred_codex', 1);
    for (const id of ['kindlet', 'charvane', 'pipwing', 'pebbin', 'vellit', 'duskit', 'motling']) markCodex(id, 'caught');
    for (const id of ['aurelark', 'cairnox', 'myclet', 'thistlit', 'nixling', 'fulmin']) markCodex(id, 'seen');
    setFlag('intro_done'); setFlag('tutorial_done'); setFlag('dm_tip_shown');
    G.quests = { q_main_1: { step: 0, done: false } };
    G.glim = 940;
  });
  await page.evaluate(`window.LF.game.enterOverworld('brighthollow')`);
  await h.waitFor(M('overworld'), 60000);
  await h.sleep(2500);
  for (let i = 0; i < 6; i++) { await h.press('Enter'); await h.sleep(400); }
  await h.sleep(1500);
  await h.shot('town-brighthollow');
  await h.hold('w', 1200); await h.sleep(1200);
  await h.shot('town-walk');

  // Pause hub: party → codex
  await h.press('Escape'); await h.sleep(1600);
  await h.shot('menu-party');
  await h.press('ArrowDown'); await h.sleep(500);
  await h.press('Enter'); await h.sleep(2500);
  await h.shot('menu-codex');
  await h.press('Enter'); await h.sleep(2500);
  await h.shot('menu-codex-detail');
  await h.press('KeyQ'); await h.sleep(600);
  await h.press('Escape'); await h.sleep(600);
  await h.press('Escape'); await h.sleep(1200);

  // Battle
  await page.evaluate(`window.LF.game.overworld.startWildBattle('vellit', 9)`);
  const ready = await h.waitFor(`document.querySelector('[class*=bui-action]')`, 60000);
  await h.sleep(1800);
  await h.shot('battle-start');
  if (ready) {
    await h.press('Enter'); await h.sleep(900);
    await h.shot('battle-moves');
    await h.press('Enter');
    for (const ms of [500, 500, 600, 700]) { await h.sleep(ms); await h.shot('battle-action'); }
    await h.sleep(2500);
    await h.shot('battle-after');
  }
  console.log('MODE:', await page.evaluate(`window.LF.game.mode`));
}
