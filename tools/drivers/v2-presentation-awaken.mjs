// PRESENTATION v2 — the Awakening cinematic, triggered straight from the page
// (over the title screen): build-up → silhouette flash → reveal → caption.
//   QA_BEAUTY=1 node tools/shoot.mjs tools/drivers/v2-presentation-awaken.mjs <outDir>
export async function run(page, h) {
  await h.waitFor(`!!window.LF && window.LF.game.mode === 'title'`, 30000);
  await h.sleep(2500);
  const pairs = (process.env.LF_AWAKEN ?? 'kindlet>charvane').split(',').map((p) => p.split('>'));
  for (const [fromId, toId] of pairs) {
    page.evaluate(async ([a, b]) => {
      window.__awkDone = false;
      const { showAwakening } = await import('/src/ui/awakeningUI.js');
      await showAwakening({ mon: null, fromId: a, toId: b });
      window.__awkDone = true;
    }, [fromId, toId]).catch((e) => console.log('awaken evaluate failed', e.message));
    const marks = [700, 1500, 2300, 3100, 3900, 5000, 6500];
    let t = 0;
    for (const m of marks) { await h.sleep(m - t); t = m; await h.shot(`awaken-${toId}-${m}ms`); }
    await h.sleep(1200);
    // Click to dismiss — a confirm keypress would also reach the title menu below.
    await page.evaluate(() => document.querySelector('.awk-root')?.click());
    const done = await h.waitFor(`window.__awkDone === true`, 20000);
    console.log(`AWAKEN ${fromId}>${toId} closed:`, !!done);
    await h.sleep(800);
  }
}
