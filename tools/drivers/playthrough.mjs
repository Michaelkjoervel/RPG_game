// Full loop: new game → starter → rival battle → overworld → walk → pause menu.
export async function run(page, h) {
  await h.sleep(6000);
  await h.press('Enter');                    // New Journey
  await h.sleep(1200);
  await h.press('Enter');                    // accept name
  await h.sleep(2500);
  for (let i = 0; i < 10; i++) { await h.press('Enter'); await h.sleep(600); }
  await h.press('Enter');                    // choose starter (first)
  await h.sleep(1500);
  for (let i = 0; i < 8; i++) { await h.press('Enter'); await h.sleep(600); }
  // battle: mash confirm to pick Fight -> first move, advance messages
  for (let i = 0; i < 30; i++) {
    await h.press('Enter');
    await h.sleep(1100);
    if (i === 6) await h.shot('battle-mid');
    const mode = await page.evaluate(() => window.LF?.game.mode);
    if (mode === 'overworld') break;
  }
  await h.shot('battle-or-after');
  for (let i = 0; i < 10; i++) { await h.press('Enter'); await h.sleep(700); }
  await h.shot('after-battle');
  const st1 = await page.evaluate(() => ({ mode: window.LF?.game.mode, zone: window.LF?.G.pos?.zone, hp: window.LF?.G.party?.[0]?.hp }));
  console.log('AFTER BATTLE:', JSON.stringify(st1));
  // walk around
  await h.hold('w', 2500);
  await h.shot('walk-1');
  await h.hold('d', 1500);
  await h.hold('w', 2000);
  await h.shot('walk-2');
  // pause menu
  await h.press('Escape');
  await h.sleep(900);
  await h.shot('pause-menu');
  await h.press('ArrowDown');
  await h.sleep(400);
  await h.press('Enter');                    // open second tab (likely Codex)
  await h.sleep(1200);
  await h.shot('menu-tab');
  await h.press('Escape');
  await h.sleep(500);
  await h.press('Escape');
  await h.sleep(500);
  const st2 = await page.evaluate(() => ({ mode: window.LF?.game.mode, pos: [Math.round(window.LF?.G.pos?.x), Math.round(window.LF?.G.pos?.z)], quests: Object.keys(window.LF?.G.quests ?? {}) }));
  console.log('FINAL:', JSON.stringify(st2));
}
