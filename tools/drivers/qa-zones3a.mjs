// AD review chunk A: whisperwood noon/night + dawnmeadow dusk. No walking (avoid encounters).
export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 30000);
  await h.sleep(6000);
  await page.evaluate(() => { document.querySelector('.title-root')?.remove(); });

  const go = async (zone, dayTime, waitMs = 7000) => {
    await page.evaluate(async ({ zone }) => { await window.LF.game.enterOverworld(zone); }, { zone });
    await page.evaluate((t) => { window.LF.G.calendar.dayTime = t; }, dayTime);
    await h.sleep(waitMs);
    console.log(`ZONE ${zone} mode=` + await page.evaluate(() => window.LF.game.mode));
  };

  await go('whisperwood', 0.5, 9000); await h.shot('whisperwood-noon');
  await h.sleep(2500); await h.shot('whisperwood-noon-b');
  await go('whisperwood', 0.02, 5000); await h.shot('whisperwood-night');
  await go('dawnmeadow', 0.8, 6000); await h.shot('dawnmeadow-dusk');
}
