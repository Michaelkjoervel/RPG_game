// AD review fast pass 2 (low quality): skyreach storm, sunkenruins, hollowspire,
// starfallglade, whisperwood (dismissing its auto story scene), brighthollow NPCs.
export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 30000);
  await h.sleep(6000);
  await page.evaluate(() => { document.querySelector('.title-root')?.remove(); });
  console.log('BOOT OK');

  const go = async (zone, dayTime, spawn = null, waitMs = 5000) => {
    const res = await page.evaluate(async ({ zone, spawn }) => {
      const p = window.LF.game.enterOverworld(zone, spawn).then(() => 'OK', (e) => 'ERR:' + (e?.message ?? e));
      return await Promise.race([p, new Promise((r) => setTimeout(() => r('SCENE-BLOCKED'), 20000))]);
    }, { zone, spawn });
    // dismiss any auto-played story dialogue
    for (let i = 0; i < 12; i++) { await h.press('Enter'); await h.sleep(350); }
    await page.evaluate((t) => { window.LF.G.calendar.dayTime = t; }, dayTime);
    console.log(`ZONE ${zone} load=${res}`);
    await h.sleep(waitMs);
  };

  await go('skyreach', 0.5, null, 8000); await h.shot('skyreach-storm');
  await go('sunkenruins', 0.5); await h.shot('sunkenruins-noon');
  await go('hollowspire', 0.5); await h.shot('hollowspire');
  await go('starfallglade', 0.5); await h.shot('starfallglade-noon');

  await go('whisperwood', 0.5, null, 7000); await h.shot('whisperwood-noon');
  await page.evaluate((t) => { window.LF.G.calendar.dayTime = t; }, 0.02);
  await h.sleep(4000); await h.shot('whisperwood-night');

  await go('brighthollow', 0.5, [-16, -12], 4000);
  await h.hold('w', 1100); await h.sleep(800); await h.shot('npc-maren');
  await go('brighthollow', 0.5, [-8, 10.5], 4000);
  await h.hold('w', 600); await h.sleep(700); await h.shot('npc-villager-well');
}
