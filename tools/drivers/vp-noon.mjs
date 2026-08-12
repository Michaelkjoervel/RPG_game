// Visual polish check: dawnmeadow at exact noon (sky washout / cloud check).
export async function run(page, h) {
  await h.sleep(6500);
  await h.press('Enter'); await h.sleep(1400);   // New Journey
  await h.press('Enter'); await h.sleep(2500);   // name
  for (let i = 0; i < 10; i++) { await h.press('Enter'); await h.sleep(600); }
  await h.press('Enter'); await h.sleep(1600);   // starter confirm
  for (let i = 0; i < 8; i++) { await h.press('Enter'); await h.sleep(600); }
  for (let i = 0; i < 160; i++) {                // mash through rival battle
    await h.press('Enter'); await h.sleep(900);
    const mode = await page.evaluate(() => window.LF?.game.mode);
    if (mode === 'overworld') break;
  }
  for (let i = 0; i < 6; i++) { await h.press('Enter'); await h.sleep(450); }

  await page.evaluate(async () => { await window.LF.game.enterOverworld('dawnmeadow'); });
  await page.evaluate(() => { window.LF.G.calendar.dayTime = 0.5; });
  await h.sleep(3500);
  await page.evaluate(() => { window.LF.G.calendar.dayTime = 0.5; });
  await h.shot('dawnmeadow-noon');
  await h.sleep(2500);
  await page.evaluate(() => { window.LF.G.calendar.dayTime = 0.5; });
  await h.shot('dawnmeadow-noon-b');
}
