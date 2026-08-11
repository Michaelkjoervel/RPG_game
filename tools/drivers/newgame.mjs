// Drives: title → New Journey → name → intro dialogue → starter choice → overworld.
export async function run(page, h) {
  await h.sleep(6000);                       // boot + title
  await h.shot('title');
  await h.press('Enter');                    // New Journey
  await h.sleep(1200);
  await h.shot('name-entry');
  await h.press('Enter');                    // accept default name
  await h.sleep(2500);
  await h.shot('intro-1');
  // Advance intro dialogue generously
  for (let i = 0; i < 10; i++) { await h.press('Enter'); await h.sleep(700); }
  await h.shot('starter-choice');
  await h.press('ArrowRight');               // look at second starter
  await h.sleep(900);
  await h.shot('starter-second');
  await h.press('Enter');                    // choose it
  await h.sleep(1500);
  await h.shot('starter-confirmed');
  for (let i = 0; i < 12; i++) { await h.press('Enter'); await h.sleep(700); }
  await h.shot('post-intro');
  await h.sleep(3000);
  await h.shot('overworld');
  const state = await page.evaluate(() => {
    const G = window.LF?.G;
    return G ? { mode: window.LF.game.mode, zone: G.pos?.zone, party: G.party?.map(m => `${m.speciesId} lv${m.level}`), starter: G.starter, uiChildren: [...document.getElementById('ui-root').children].map(e => e.className || e.id).slice(0, 12) } : 'NO LF HANDLE';
  });
  console.log('STATE:', JSON.stringify(state));
}
