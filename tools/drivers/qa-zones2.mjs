// AD review v2: direct zone entry from title (no story), clean overworld state.
export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 30000);
  await h.sleep(6000);
  // Bypass title UI/story entirely — jump straight into the overworld.
  await page.evaluate(() => { document.querySelector('.title-root')?.remove(); });

  const go = async (zone, spawn, dayTime, waitMs = 5000) => {
    await page.evaluate(async ({ zone, spawn }) => { await window.LF.game.enterOverworld(zone, spawn); }, { zone, spawn });
    await page.evaluate((t) => { window.LF.G.calendar.dayTime = t; }, dayTime);
    await h.sleep(waitMs);
    const mode = await page.evaluate(() => window.LF.game.mode);
    console.log(`ZONE ${zone} mode=${mode}`);
  };

  await go('brighthollow', null, 0.5); await h.shot('brighthollow-noon');
  await h.hold('s', 1800); await h.sleep(700); await h.shot('brighthollow-noon-b');
  await go('dawnmeadow', null, 0.5); await h.shot('dawnmeadow-noon');
  await h.hold('w', 2500); await h.sleep(3000); await h.shot('dawnmeadow-noon-b');
  await go('whisperwood', null, 0.5); await h.shot('whisperwood-noon');
  await h.hold('w', 2500); await h.sleep(700); await h.shot('whisperwood-noon-b');
  await go('gloamcavern', null, 0.5); await h.shot('gloamcavern');
  await h.hold('w', 2500); await h.sleep(700); await h.shot('gloamcavern-b');
  await go('mirrorlake', null, 0.5); await h.shot('mirrorlake-noon');
  await h.hold('w', 2500); await h.sleep(700); await h.shot('mirrorlake-noon-b');
  await go('skyreach', null, 0.5); await h.sleep(3000); await h.shot('skyreach-storm');
  await h.hold('w', 2500); await h.sleep(700); await h.shot('skyreach-storm-b');
  await go('sunkenruins', null, 0.5); await h.shot('sunkenruins-noon');
  await go('hollowspire', null, 0.5); await h.shot('hollowspire');
  await go('starfallglade', null, 0.5); await h.shot('starfallglade-noon');

  await go('dawnmeadow', null, 0.8); await h.sleep(2000); await h.shot('dawnmeadow-dusk');
  await go('whisperwood', null, 0.02); await h.sleep(2000); await h.shot('whisperwood-night');

  // NPCs — Maren stands at [-16,-17]; approach from the plaza side.
  await go('brighthollow', [-16, -12], 0.5);
  await h.hold('w', 1000); await h.sleep(600); await h.shot('npc-maren');
  await go('brighthollow', [-8, 10.5], 0.5, 3000);
  await h.hold('w', 500); await h.sleep(500); await h.shot('npc-villager-well');
}
