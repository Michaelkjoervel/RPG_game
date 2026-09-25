// PRESENTATION v2 — arena gallery: builds each battle stage straight through
// createPresentation (no battle flow), sends two Kindred in and shoots the
// resting two-shot (+ optional wide/impact variants). Fast visual check of all
// eight arenas and the camera solver across creature sizes.
//   QA_BEAUTY=1 QA_VIEWPORT=1120x630 LF_ARENAS=meadow,forest,cave \
//     node tools/shoot.mjs tools/drivers/v2-presentation-arenas.mjs <outDir>
// Env: LF_ARENAS (kinds), LF_PAIRS ("p:e,p:e" species per arena, cycled),
//      LF_DAY (dayTime, default 0.42), LF_EXTRA=1 (also wide + impact shots)
export async function run(page, h) {
  await h.waitFor(`!!window.LF && window.LF.game.mode === 'title'`, 30000);
  await h.sleep(1500);
  await page.evaluate(() => { document.getElementById('ui-root').style.visibility = 'hidden'; });
  const kinds = (process.env.LF_ARENAS ?? 'meadow,forest,glade,lake,mountain,ruins,cave,spire').split(',');
  const pairs = (process.env.LF_PAIRS ?? 'charvane:pebbin').split(',').map((p) => p.split(':'));
  const day = Number(process.env.LF_DAY ?? 0.42);
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    const [pId, eId] = pairs[i % pairs.length];
    const t0 = Date.now();
    const info = await page.evaluate(async ({ kind, pId, eId, day }) => {
      const game = window.LF.game;
      window.LF.G.calendar.dayTime = day;
      window.__arenaPres?.dispose();
      const { createPresentation } = await import('/src/battle/presentation.js');
      const pres = await createPresentation(game, { arena: kind });
      window.__arenaPres = pres;
      game.mode = 'battle';
      game.setScene(pres);
      await pres.handle({ type: 'send', side: 'e', mon: { speciesId: eId } });
      await pres.handle({ type: 'send', side: 'p', mon: { speciesId: pId } });
      pres.handle({ type: 'turnStart', n: 0 });
      return 'ok';
    }, { kind, pId, eId, day }).catch((e) => `ERR ${e.message}`);
    await h.sleep(2600);
    await h.shot(`arena-${kind}-${pId}-${eId}`);
    console.log(`ARENA ${kind} ${info} built+sent in ${Date.now() - t0}ms`);
    if (process.env.LF_EXTRA === '1') {
      await page.evaluate(() => window.__arenaPres.handle({ type: 'turnStart', n: 2 }));
      await h.sleep(2200);
      await h.shot(`arena-${kind}-rest2`);
      await page.evaluate(() => window.__arenaPres.handle({ type: 'hit', side: 'e', dmg: 12, eff: 'super', crit: false }));
      await h.sleep(260);
      await h.shot(`arena-${kind}-impact`);
      await h.sleep(1400);
    }
  }
  await page.evaluate(() => { window.__arenaPres?.dispose(); window.__arenaPres = null; });
}
