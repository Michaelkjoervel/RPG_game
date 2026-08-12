// AD review: every zone at noon, dusk/night variants, weather, NPCs, roaming Kindred.
export async function run(page, h) {
  await h.sleep(6500);
  await h.press('Enter'); await h.sleep(1400);   // New Journey
  await h.press('Enter'); await h.sleep(2500);   // name
  for (let i = 0; i < 10; i++) { await h.press('Enter'); await h.sleep(600); }
  await h.press('Enter'); await h.sleep(1600);   // starter
  for (let i = 0; i < 8; i++) { await h.press('Enter'); await h.sleep(600); }
  for (let i = 0; i < 60; i++) {                 // mash through rival battle
    await h.press('Enter'); await h.sleep(900);
    const mode = await page.evaluate(() => window.LF?.game.mode);
    if (mode === 'overworld') break;
  }
  for (let i = 0; i < 6; i++) { await h.press('Enter'); await h.sleep(450); }

  const go = async (zone, spawn, dayTime, waitMs = 4500) => {
    await page.evaluate(async ({ zone, spawn }) => { await window.LF.game.enterOverworld(zone, spawn); }, { zone, spawn });
    await page.evaluate((t) => { window.LF.G.calendar.dayTime = t; }, dayTime);
    await h.sleep(waitMs);
  };

  // --- noon tour ---
  await go('brighthollow', null, 0.5); await h.shot('brighthollow-noon');
  await h.hold('w', 1600); await h.sleep(600); await h.shot('brighthollow-noon-b');
  await go('dawnmeadow', null, 0.5); await h.shot('dawnmeadow-noon');
  await h.hold('w', 2000); await h.sleep(600); await h.shot('dawnmeadow-noon-b');
  await go('whisperwood', null, 0.5); await h.shot('whisperwood-noon');
  await h.hold('w', 2000); await h.sleep(600); await h.shot('whisperwood-noon-b');
  await go('gloamcavern', null, 0.5); await h.shot('gloamcavern');
  await h.hold('w', 2000); await h.sleep(600); await h.shot('gloamcavern-b');
  await go('mirrorlake', null, 0.5); await h.shot('mirrorlake-noon');
  await h.hold('w', 2000); await h.sleep(600); await h.shot('mirrorlake-noon-b');
  await go('skyreach', null, 0.5); await h.shot('skyreach-storm-noon');
  await h.hold('w', 2000); await h.sleep(600); await h.shot('skyreach-storm-b');
  await go('sunkenruins', null, 0.5); await h.shot('sunkenruins-noon');
  await go('hollowspire', null, 0.5); await h.shot('hollowspire');
  await go('starfallglade', null, 0.5); await h.shot('starfallglade-noon');

  // --- dusk / night ---
  await go('dawnmeadow', null, 0.8); await h.sleep(1500); await h.shot('dawnmeadow-dusk');
  await go('whisperwood', null, 0.02); await h.sleep(1500); await h.shot('whisperwood-night');

  // --- NPCs: walk up to Maren in brighthollow ---
  await go('brighthollow', [-16, -11], 0.5);
  await h.hold('w', 900); await h.sleep(500); await h.shot('npc-maren');
  await page.evaluate(async () => { await window.LF.game.enterOverworld('brighthollow', [-8, 10]); });
  await h.sleep(2500); await h.hold('w', 700); await h.sleep(400); await h.shot('npc-villager-well');

  const zoneInfo = await page.evaluate(() => {
    const s = window.LF.game.scene?.scene ?? null;
    const lights = [];
    s?.traverse?.(o => { if (o.isLight) lights.push({ t: o.type, name: o.name, i: +o.intensity.toFixed(2), c: '#' + o.color.getHexString() }); });
    return { fog: s?.fog ? { c: '#' + s.fog.color.getHexString(), d: s.fog.density } : null, lights };
  });
  console.log('BH LIGHTS:', JSON.stringify(zoneInfo));
}
