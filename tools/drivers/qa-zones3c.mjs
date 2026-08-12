// AD review chunk C: sunkenruins, hollowspire, starfallglade + brighthollow NPC close-ups.
export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 30000);
  await h.sleep(6000);
  await page.evaluate(() => { document.querySelector('.title-root')?.remove(); });

  const go = async (zone, dayTime, spawn = null, waitMs = 7000) => {
    await page.evaluate(async ({ zone, spawn }) => { await window.LF.game.enterOverworld(zone, spawn); }, { zone, spawn });
    await page.evaluate((t) => { window.LF.G.calendar.dayTime = t; }, dayTime);
    await h.sleep(waitMs);
    console.log(`ZONE ${zone} mode=` + await page.evaluate(() => window.LF.game.mode));
  };

  await go('sunkenruins', 0.5); await h.shot('sunkenruins-noon');
  await go('hollowspire', 0.5); await h.shot('hollowspire');
  await go('starfallglade', 0.5); await h.shot('starfallglade-noon');

  // NPCs: Maren plaza + villager by the well; approach slowly (town = no encounters).
  await go('brighthollow', 0.5, [-16, -12], 6000);
  await h.hold('w', 1100); await h.sleep(800); await h.shot('npc-maren');
  await go('brighthollow', 0.5, [-8, 10.5], 5000);
  await h.hold('w', 600); await h.sleep(700); await h.shot('npc-villager-well');
}
