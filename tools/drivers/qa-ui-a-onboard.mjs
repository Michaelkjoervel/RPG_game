// UI/UX QA pass A — onboarding: title, name modal, starter, intro dialogue,
// rival battle, and the post-intro HUD (toasts + quest tracker evidence).
export async function run(page, h) {
  await h.waitFor(`!!window.LF && !document.querySelector('#boot-screen:not(.hidden)')`, 30000);
  await h.sleep(3000);
  await h.shot('title');
  await h.press('ArrowDown'); await h.sleep(300);
  await h.shot('title-focus-settings'); // Continue disabled -> lands on Settings
  await h.press('ArrowUp'); await h.sleep(300);
  await h.press('Enter'); await h.sleep(900);
  await h.shot('name-modal');
  await h.press('Enter'); await h.sleep(1500);
  await h.shot('intro-dialogue-typewriter');
  // advance until starter UI (party appears after starter confirm)
  for (let i = 0; i < 12; i++) {
    const st = await page.evaluate(`!!document.querySelector('.starter-root')`);
    if (st) break;
    await h.press('Enter'); await h.sleep(900);
  }
  await h.sleep(2500);
  await h.shot('starter-default');
  await h.press('ArrowLeft'); await h.sleep(1400);
  await h.shot('starter-left');
  await h.press('Enter'); await h.sleep(2500); // confirm bond
  // through dialogue into rival battle, mash to overworld
  for (let i = 0; i < 120; i++) {
    await h.press('Enter'); await h.sleep(650);
    if (await page.evaluate(`window.LF?.game.mode === 'overworld'`)) break;
    if (i === 12) await h.shot('rival-battle');
  }
  await h.sleep(400);
  await h.shot('post-intro-toasts');
  const hudq = await page.evaluate(`({name: document.querySelector('.hq-name')?.textContent, step: document.querySelector('.hq-step')?.textContent, toasts: document.querySelectorAll('.toast').length})`);
  console.log('TRACKER AT START:', JSON.stringify(hudq));
  await h.sleep(4000);
  await h.shot('hud-after-toasts-gone');
  // interact prompt + long toast
  await page.evaluate(`window.LF.bus.emit('prompt:show', { text: 'Talk to Elder Maren' })`);
  await page.evaluate(`window.LF.bus.emit('notify', { text: 'Bramblewhisker the Thornbound recovered 999 HP and looks very pleased about it.', icon: '✦' })`);
  await h.sleep(500);
  await h.shot('hud-prompt-toast');
  // quests pane as the player would first see it
  await h.press('Escape'); await h.sleep(700);
  await h.press('ArrowDown', { times: 3, delay: 200 });
  await h.sleep(500);
  await h.shot('pause-quests-at-start');
}
