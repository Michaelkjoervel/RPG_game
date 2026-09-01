// Integration check A: seeded save → Continue → brighthollow, dawnmeadow, whisperwood.
// Split from tour-b so a full pass fits inside a 10-minute foreground window —
// long background runs kept dying to container restarts.
const M = (m) => `window.LF?.game.mode === '${m}'`;

const SEED = `(async () => {
  const { G, resetState, gainItem, markCodex, setFlag } = await import('/src/core/state.js');
  const { makeCreature } = await import('/src/game/creatures.js');
  const { saveGame } = await import('/src/core/save.js');
  resetState();
  G.playerName = 'Rowan'; G.starter = 'kindlet';
  G.party = [makeCreature('charvane', 18, { resonance: 3 }), makeCreature('aurelark', 16),
             makeCreature('cairnox', 15), makeCreature('glowvern', 14)];
  gainItem('woven_charm', 6); gainItem('tonic', 4);
  for (const f of ['intro_done','tutorial_done','dm_tip_shown','kb_beat','kl_beat'])
    setFlag(f);
  G.glim = 1240; G.sigils = [true, true, false, false, false];
  G.pos = { zone: 'brighthollow', x: 0, z: 6, face: 0 };
  saveGame(1);
})()`;

export async function goZone(page, h, zone, name, dayTime) {
  await page.evaluate(`(async () => {
    if (${dayTime !== undefined}) window.LF.G.calendar.dayTime = ${dayTime ?? 0.5};
    await window.LF.game.enterOverworld('${zone}');
  })()`).catch(() => {});
  await h.waitFor(M('overworld'), 45000);
  await h.sleep(900);
  for (let i = 0; i < 4; i++) { await h.press('Enter'); await h.sleep(250); }
  await h.sleep(1500);
  await h.shot(name);
}

export async function loadIn(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(1500);
  await page.evaluate(SEED);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 25000);
  await h.sleep(2000);
  await h.press('ArrowDown'); await h.sleep(350);
  await h.press('Enter'); await h.sleep(1200);      // Continue
  await h.press('ArrowDown'); await h.sleep(350);   // skip autosave slot
  await h.press('Enter');
  const ok = await h.waitFor(M('overworld'), 50000);
  if (!ok) { await h.shot('load-failed'); return false; }
  await h.sleep(1800);
  for (let i = 0; i < 4; i++) { await h.press('Enter'); await h.sleep(250); }
  return true;
}

export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  await h.shot('01-brighthollow');
  await goZone(page, h, 'dawnmeadow', '02-dawnmeadow-noon', 0.5);
  await goZone(page, h, 'whisperwood', '03-whisperwood', 0.45);
}
