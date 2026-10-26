// Quest-guide check: a fresh journey (q_main_1 open) → Brighthollow, press H
// → a trail toward the Dawnmeadow road; enter Dawnmeadow → the trail retargets
// to Keeper Bramwell; standing by him → arrival toast; the HUD button toggles
// the guide; finishing q_main_1 opens q_main_2 (main chain) and the guide then
// points at Whisperwood's gate; a save with a broken chain is repaired on load.
//   node tools/shoot.mjs tools/drivers/guide-test.mjs <outDir>
const M = (m) => `window.LF?.game.mode === '${m}'`;
const BOOTED = `!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`;
const SEED = `(async () => {
  const { G, resetState, setFlag } = await import('/src/core/state.js');
  const { makeCreature } = await import('/src/game/creatures.js');
  const { saveGame } = await import('/src/core/save.js');
  resetState();
  G.playerName = 'Rowan'; G.starter = 'kindlet';
  G.party = [makeCreature('kindlet', 7, { resonance: 1 })];
  for (const f of ['intro_done', 'tutorial_done']) setFlag(f);
  G.quests = { q_main_1: { step: 0, done: false }, sq_gleam: { step: 0, done: false } };
  G.pos = { zone: 'brighthollow', x: 0, z: 6, face: 0 };
  saveGame(1);
})()`;

const W = 'window.LF.game.overworld';
const state = (page) => page.evaluate(`JSON.stringify({
  zone: ${W}.zone?.id,
  active: !!${W}.guide?.active,
  orbs: ${W}.guide?.lit ?? -1,
  beacon: (() => { const b = ${W}.scene.getObjectByName('guideBeacon'); return b ? [Math.round(b.position.x), Math.round(b.position.z), b.visible] : null; })(),
  button: document.querySelector('.hq-guide')?.textContent.trim(),
  buttonOn: !!document.querySelector('.hq-guide.on'),
  tracked: document.querySelector('.hq-name')?.textContent,
  step: document.querySelector('.hq-step')?.textContent,
  toasts: (window.__toasts ?? []).splice(0),
  player: (() => { const p = ${W}.player?.pos; return p ? [Math.round(p.x), Math.round(p.z)] : null; })(),
})`);

// Software GL in CI draws ~1 frame a second: wait on GAME time, not wall time.
async function gameWait(page, h, secs) {
  const t0 = await page.evaluate(`${W}._time`);
  await h.waitFor(`${W}._time > ${t0 + secs}`, 90000, 300);
}
// Put the Warden at (x, z) facing (tx, tz) so the camera looks down the trail.
async function stand(page, h, x, z, tx, tz) {
  await page.evaluate(`${W}.player.teleport(${x}, ${z}, Math.atan2(${tx - x}, ${tz - z})); ${W}.cameraRig.recenter()`);
  await gameWait(page, h, 1.6);
}

export async function run(page, h) {
  await h.waitFor(BOOTED, 25000);
  await h.sleep(1200);
  await page.evaluate(SEED);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await h.waitFor(BOOTED, 25000);
  await h.sleep(1800);
  await h.press('ArrowDown'); await h.sleep(350);
  await h.press('Enter'); await h.sleep(1200);      // Continue
  await h.press('ArrowDown'); await h.sleep(350);   // slot 1
  await h.press('Enter');
  if (!await h.waitFor(M('overworld'), 50000)) { await h.shot('load-failed'); console.log('GUIDE RESULT: FAIL (load)'); return; }
  await h.waitFor(`!!${W}?.player && window.LF.game.activeScene === ${W}`, 60000, 300);
  await gameWait(page, h, 1);
  for (let i = 0; i < 3; i++) { await h.press('Enter'); await h.sleep(250); }
  // toasts expire on wall-clock timers, which outrun ~1 fps software GL: record them
  await page.evaluate(`(window.__toasts = [], window.LF.bus.on('notify', (p) => window.__toasts.push(p?.text)))`);

  // 1) Brighthollow: H shows the way out toward Dawnmeadow.
  await h.press('KeyH');
  await h.waitFor(`(${W}.guide?.lit ?? 0) > 5`, 60000, 300);
  const s1 = JSON.parse(await state(page));
  console.log('GUIDE brighthollow after H:', JSON.stringify(s1));
  const port = s1.beacon;
  if (port) await stand(page, h, s1.player[0], s1.player[1], port[0], port[1]);
  await h.shot('guide-brighthollow');

  // 2) Dawnmeadow: same guide, now pointing at Keeper Bramwell.
  page.evaluate(`window.LF.game.enterOverworld('dawnmeadow')`).catch(() => {});
  await h.waitFor(`${M('overworld')} && ${W}.zone?.id === 'dawnmeadow' && !!${W}.player && window.LF.game.activeScene === ${W}`, 90000, 300);
  await h.sleep(1500);
  for (let i = 0; i < 5; i++) { await h.press('Enter'); await h.sleep(300); } // the meadow tip
  await gameWait(page, h, 1);
  const s2 = JSON.parse(await state(page));
  console.log('GUIDE dawnmeadow:', JSON.stringify(s2));
  await stand(page, h, -6, 4, -28, 14);
  await h.shot('guide-dawnmeadow-to-bramwell');
  await stand(page, h, -27, 12, -38, 41);
  await h.shot('guide-dawnmeadow-shrine-path');

  // 3) Arrive beside him.
  await stand(page, h, -36, 37.5, -38, 41);
  await h.waitFor(`(window.__toasts ?? []).some((t) => /right here/.test(t))`, 60000, 300);
  const s3 = JSON.parse(await state(page));
  console.log('GUIDE at Bramwell:', JSON.stringify(s3));
  await h.shot('guide-arrived');

  // 4) The HUD button hides it again.
  await page.click('.hq-guide');
  await h.sleep(600);
  const s4 = JSON.parse(await state(page));
  console.log('GUIDE after button click:', JSON.stringify({ active: s4.active, button: s4.button, buttonOn: s4.buttonOn }));

  // 5) First Sigil earned → q_main_2 starts by itself; the guide points north.
  await page.evaluate(`(async () => {
    const { G } = await import('/src/core/state.js');
    const { completeQuest } = await import('/src/game/quests.js');
    G.sigils[0] = true; completeQuest('q_main_1');
  })()`);
  await h.waitFor(`/Quiet Rot/.test(document.querySelector('.hq-name')?.textContent ?? '')`, 30000, 300);
  await page.click('.hq-guide');
  await gameWait(page, h, 0.8);
  const s5 = JSON.parse(await state(page));
  console.log('GUIDE after q_main_1:', JSON.stringify(s5));
  await stand(page, h, -6, -10, 0, -60);
  await h.shot('guide-to-whisperwood');

  // 6) A save whose chain broke (q_main_1 done, nothing after) heals on load.
  const healed = await page.evaluate(`(async () => {
    const { G } = await import('/src/core/state.js');
    G.quests = { q_main_1: { step: 1, done: true } };
    window.LF.bus.emit('game:loaded');
    return JSON.stringify(Object.keys(G.quests));
  })()`);
  console.log('GUIDE chain after repair:', healed);

  const ok = s1.active && s1.orbs > 5 && s2.active && s2.beacon && Math.abs(s2.beacon[0] + 38) < 3 && Math.abs(s2.beacon[1] - 41) < 3
    && s3.toasts.some((t) => /Bramwell is right here/.test(t)) && !s4.active && !s4.buttonOn
    && /Quiet Rot/.test(s5.tracked ?? '') && s5.active && s5.beacon && Math.abs(s5.beacon[1] + 100) < 3
    && JSON.parse(healed).includes('q_main_2');
  console.log('GUIDE RESULT:', ok ? 'PASS' : 'FAIL', '| errors:', h.errors?.().length ?? '?');
}
