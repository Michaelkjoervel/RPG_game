// UI-fix verification pass B — the real new-game path: name modal ([A] Accept
// hint, Enter accepts default), intro dialogue, starter screen STAT BARS
// (title.css .starter-stat-fill fix).
export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 30000);
  await h.sleep(4000);

  await h.press('Enter'); await h.sleep(700); // New Journey -> name modal
  console.log('NAME MODAL UP:', await page.evaluate(`!!document.querySelector('.name-modal')`));
  console.log('NAME HINT:', await page.evaluate(`document.querySelector('.name-hint')?.textContent`));
  await h.shot('name-modal-hint');
  await h.press('Enter'); await h.sleep(800); // accept default name

  // Skip through the intro dialogue until the starter screen appears.
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(`!!document.querySelector('.starter-root')`)) break;
    await h.press('Enter');
    await h.sleep(650);
  }
  const starterUp = await h.waitFor(`!!document.querySelector('.starter-root')`, 20000, 500);
  console.log('STARTER SCREEN UP:', !!starterUp);
  await h.sleep(2500); // let models/stat bars settle
  console.log('STARTER STAT FILL (want w>0 & scaleX):', await page.evaluate(() => {
    const f = document.querySelector('.starter-stat-fill');
    if (!f) return 'NO FILL';
    const r = f.getBoundingClientRect();
    return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height), transform: getComputedStyle(f).transform });
  }));
  await h.shot('starter-statbars');
  await h.press('ArrowRight'); await h.sleep(900); // second starter -> bars change
  await h.shot('starter-statbars-2');
}
