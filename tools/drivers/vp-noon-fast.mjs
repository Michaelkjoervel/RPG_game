// Fast noon-sky probe: enter dawnmeadow straight from the title screen,
// pin dayTime to noon, dump sky uniforms, screenshot.
export async function run(page, h) {
  await h.waitFor('!!window.LF?.game', 20000);
  await h.sleep(4000);
  await page.evaluate(async () => {
    document.querySelector('.title-root')?.remove();
    await window.LF.game.enterOverworld('dawnmeadow');
  });
  await page.evaluate(() => { window.LF.G.calendar.dayTime = 0.5; });
  await h.sleep(3500);
  await page.evaluate(() => { window.LF.G.calendar.dayTime = 0.5; });
  const skyInfo = await page.evaluate(() => {
    const s = window.LF.game.overworld?.scene;
    const dome = s?.getObjectByName('skydome');
    const u = dome?.material?.uniforms;
    return u ? {
      top: '#' + u.uTop.value.getHexString(),
      bottom: '#' + u.uBottom.value.getHexString(),
      horizon: '#' + u.uHorizon.value.getHexString(),
      sunAmt: +u.uSunAmt.value.toFixed(3),
      dayTime: +window.LF.G.calendar.dayTime.toFixed(3),
      fog: s?.fog ? { c: '#' + s.fog.color.getHexString(), d: +s.fog.density.toFixed(5) } : null,
    } : 'NO DOME';
  });
  console.log('SKY:', JSON.stringify(skyInfo));
  await h.shot('dawnmeadow-noon-fast');
}
