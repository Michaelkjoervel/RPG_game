// AD review fast pass 1 (low quality): gloamcavern, mirrorlake, dawnmeadow dusk first
// (known-good), then whisperwood noon+night guarded by a 90s race so a load hang
// cannot eat the whole run.
export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 30000);
  await h.sleep(6000);
  await page.evaluate(() => { document.querySelector('.title-root')?.remove(); });
  console.log('BOOT OK');

  const go = async (zone, dayTime, waitMs = 5000) => {
    const t0 = Date.now();
    const res = await page.evaluate(async ({ zone }) => {
      const p = window.LF.game.enterOverworld(zone).then(() => 'OK', (e) => 'ERR:' + (e?.message ?? e));
      return await Promise.race([p, new Promise((r) => setTimeout(() => r('TIMEOUT'), 90000))]);
    }, { zone });
    await page.evaluate((t) => { window.LF.G.calendar.dayTime = t; }, dayTime);
    console.log(`ZONE ${zone} load=${res} ${Date.now() - t0}ms mode=` + await page.evaluate(() => window.LF.game.mode));
    await h.sleep(waitMs);
    return res;
  };

  await go('gloamcavern', 0.5, 6000); await h.shot('gloamcavern');
  await go('mirrorlake', 0.5, 6000); await h.shot('mirrorlake-noon');
  await go('dawnmeadow', 0.8, 5000); await h.shot('dawnmeadow-dusk');
  const w = await go('whisperwood', 0.5, 7000); await h.shot('whisperwood-noon');
  if (w === 'OK') {
    await page.evaluate((t) => { window.LF.G.calendar.dayTime = t; }, 0.02);
    await h.sleep(4000); await h.shot('whisperwood-night');
  }
}
