// AD review fast pass 3 (low quality): NPC close-ups in brighthollow, then clean
// whisperwood noon+night with the auto story scene pre-flagged off.
export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 30000);
  await h.sleep(6000);
  await page.evaluate(() => { document.querySelector('.title-root')?.remove(); });
  // pre-set flags so whisperwood's auto scenes never fire
  await page.evaluate(() => {
    const G = window.LF.G;
    G.flags.ww_hollowed_seen = true;
    G.flags.ashe_2 = true;
    G.flags.liora_dapplyn_done = true;
  });
  console.log('BOOT OK');

  const go = async (zone, dayTime, spawn = null, waitMs = 5000) => {
    const res = await page.evaluate(async ({ zone, spawn }) => {
      const p = window.LF.game.enterOverworld(zone, spawn).then(() => 'OK', (e) => 'ERR:' + (e?.message ?? e));
      return await Promise.race([p, new Promise((r) => setTimeout(() => r('SCENE-BLOCKED'), 15000))]);
    }, { zone, spawn });
    for (let i = 0; i < 8; i++) { await h.press('Enter'); await h.sleep(300); }
    await page.evaluate((t) => { window.LF.G.calendar.dayTime = t; }, dayTime);
    console.log(`ZONE ${zone} load=${res}`);
    await h.sleep(waitMs);
  };

  // Maren stands at [-16,-17] by the sanctum door; spawn just south, walk up.
  await go('brighthollow', 0.5, [-16, -13], 5000);
  await h.hold('w', 900); await h.sleep(900); await h.shot('npc-maren');
  await go('brighthollow', 0.5, [-8, 8], 4000);
  await h.hold('w', 700); await h.sleep(800); await h.shot('npc-villagers');

  await go('whisperwood', 0.5, null, 8000); await h.shot('whisperwood-noon');
  await page.evaluate((t) => { window.LF.G.calendar.dayTime = t; }, 0.02);
  await h.sleep(4000); await h.shot('whisperwood-night');
  console.log('DONE mode=' + await page.evaluate(() => window.LF.game.mode));
}
