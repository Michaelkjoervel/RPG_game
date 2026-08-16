// Verify the follower no longer blocks the camera: walk in dawnmeadow and shoot.
const M = (m) => `window.LF?.game.mode === '${m}'`;
const SEED = `(async () => {
  const { G, resetState, setFlag } = await import('/src/core/state.js');
  const { makeCreature } = await import('/src/game/creatures.js');
  const { saveGame } = await import('/src/core/save.js');
  resetState();
  G.playerName = 'Rowan'; G.starter = 'kindlet';
  G.party = [makeCreature('charvane', 18), makeCreature('cairnox', 15)];
  for (const f of ['intro_done','tutorial_done','dm_tip_shown','kb_beat']) setFlag(f);
  G.pos = { zone: 'dawnmeadow', x: 0, z: 0, face: 0 };
  saveGame(1);
})()`;
export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(2000);
  await page.evaluate(SEED);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(2500);
  await h.press('ArrowDown'); await h.sleep(400);
  await h.press('Enter'); await h.sleep(1400);
  await h.press('ArrowDown'); await h.sleep(400);
  await h.press('Enter');
  if (!await h.waitFor(M('overworld'), 60000)) { await h.shot('load-failed'); return; }
  await h.sleep(2000);
  for (let i = 0; i < 5; i++) { await h.press('Enter'); await h.sleep(300); }
  await h.sleep(1500);
  await h.shot('standing');
  await h.hold('w', 2200); await h.sleep(600);
  await h.shot('after-walk');
  await h.hold('s', 1400); await h.sleep(500);   // back up INTO the follower
  await h.shot('backing-up');
  await h.hold('a', 900); await h.sleep(700);
  await h.shot('turn');
  console.log('OPACITY/DIST:', await page.evaluate(`(() => {
    const w = window.LF.game.overworld; const cam = w.camera;
    const f = w.scene.children.find(o => o.name && o.name !== 'warden' && o.type === 'Group' && o.position && o.name.length > 2);
    return JSON.stringify({ cam: [cam.position.x.toFixed(1), cam.position.z.toFixed(1)] });
  })()`));
}
