// AD review chunk B: gloamcavern, mirrorlake, skyreach storm.
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

  await go('gloamcavern', 0.5, 8000); await h.shot('gloamcavern');
  await go('mirrorlake', 0.5, 7000); await h.shot('mirrorlake-noon');
  await h.sleep(2500); await h.shot('mirrorlake-noon-b');
  await go('skyreach', 0.5, 9000); await h.shot('skyreach-storm');
  await h.sleep(3000); await h.shot('skyreach-storm-b');
}
