// PRESENTATION v2 — title hero shot (two moments) → New Journey → starter
// choice (all three focus states) → confirm flash. Also prints per-frame
// renderer.info for the title and starter scenes.
//   QA_BEAUTY=1 node tools/shoot.mjs tools/drivers/v2-presentation-title.mjs <outDir>

// Per-frame draw stats, accumulated over several frames so composer-based
// renders (several passes per frame) are counted in full.
export async function renderInfo(page, frames = 8) {
  return page.evaluate(async (n) => {
    const r = window.LF?.game?.renderer;
    if (!r) return 'no renderer';
    const raf = () => new Promise((res) => requestAnimationFrame(res));
    await raf();
    r.info.autoReset = false; r.info.reset();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) await raf();
    const out = {
      calls: Math.round(r.info.render.calls / n),
      triangles: Math.round(r.info.render.triangles / n),
      points: Math.round(r.info.render.points / n),
      msPerFrame: Math.round((performance.now() - t0) / n),
      geometries: r.info.memory.geometries, textures: r.info.memory.textures,
      programs: r.info.programs?.length ?? null,
    };
    r.info.autoReset = true;
    return JSON.stringify(out);
  }, frames);
}

export async function run(page, h) {
  await h.waitFor(`!!window.LF && window.LF.game.mode === 'title'`, 30000);
  await h.sleep(6500);
  await h.shot('title');
  console.log('TITLE RENDER', await renderInfo(page));
  await h.sleep(5000);
  await h.shot('title-later');

  await h.press('Enter'); await h.sleep(1400);   // New Journey
  await h.press('Enter'); await h.sleep(2500);   // accept default name
  // Advance the intro, stopping the moment the starter UI appears so a
  // starter is never confirmed by accident.
  for (let i = 0; i < 14; i++) {
    if (await page.evaluate(() => !!document.querySelector('.starter-root'))) break;
    await h.press('Enter'); await h.sleep(700);
  }
  await h.sleep(3200);                            // scene build + camera settle
  await h.shot('starter-nixling');
  console.log('STARTER RENDER', await renderInfo(page));
  await h.press('ArrowLeft'); await h.sleep(1500);
  await h.shot('starter-kindlet');
  await h.press('ArrowLeft'); await h.sleep(1500);
  await h.shot('starter-thistlit');
  await h.press('Enter'); await h.sleep(420);
  await h.shot('starter-confirm-flash');
  await h.sleep(1400);
  await h.shot('starter-after');
  console.log('MODE AFTER:', await page.evaluate(() => window.LF.game.mode));
}
