// Spot-based story beats (data/story.js `near`): with the Dapplyn side quest
// open, entering Whisperwood at its gate must NOT play the "found" scene;
// walking to the spot must — once, then the quest moves on.
//   node tools/shoot.mjs tools/drivers/near-triggers-test.mjs <outDir>
import { loadIn } from './integration-a.mjs';

const W = 'window.LF.game.overworld';
const M = (m) => `window.LF?.game.mode === '${m}'`;
const flag = (page) => page.evaluate(`!!window.LF.G.flags.liora_dapplyn_found`);

export async function run(page, h) {
  if (!await loadIn(page, h)) { console.log('NEAR RESULT: FAIL (load)'); return; }
  await page.evaluate(`(async () => {
    const { startQuest } = await import('/src/game/quests.js');
    startQuest('sq_liora_dapplyn');
  })()`);
  page.evaluate(`window.LF.game.enterOverworld('whisperwood')`).catch(() => {});
  await h.waitFor(`${M('overworld')} && ${W}.zone?.id === 'whisperwood' && !!${W}.player && window.LF.game.activeScene === ${W}`, 120000, 300);
  for (let i = 0; i < 4; i++) { await h.press('Enter'); await h.sleep(300); }
  const t0 = await page.evaluate(`${W}._time`);
  await h.waitFor(`${W}._time > ${t0 + 2.5}`, 120000, 300);
  const atGate = await flag(page);
  console.log('NEAR scene fired at the zone gate (must be false):', atGate);

  await page.evaluate(`${W}.player.teleport(-72, -64, Math.PI); ${W}.cameraRig.recenter()`);
  const fired = await h.waitFor(`!!window.LF.G.flags.liora_dapplyn_found`, 90000, 300);
  console.log('NEAR scene fired at the spot:', !!fired);
  await h.sleep(1500);
  await h.shot('dapplyn-found');
  for (let i = 0; i < 8; i++) { await h.press('Enter'); await h.sleep(500); }
  const q = await page.evaluate(`JSON.stringify(window.LF.G.quests.sq_liora_dapplyn)`);
  console.log('NEAR quest state after:', q);
  console.log('NEAR RESULT:', !atGate && fired ? 'PASS' : 'FAIL');
}
