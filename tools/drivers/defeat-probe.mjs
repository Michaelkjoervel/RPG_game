// Probe why the defeat panel doesn't dismiss on confirm.
export async function run(page, h) {
  await h.sleep(6000);
  await h.press('Enter'); await h.sleep(1200);
  await h.press('Enter'); await h.sleep(2500);
  for (let i = 0; i < 10; i++) { await h.press('Enter'); await h.sleep(600); }
  await h.press('Enter'); await h.sleep(1500);
  for (let i = 0; i < 8; i++) { await h.press('Enter'); await h.sleep(600); }
  // mash until the defeat panel is visible or 70 tries
  for (let i = 0; i < 70; i++) {
    await h.press('Enter'); await h.sleep(800);
    const s = await page.evaluate(() => ({
      mode: window.LF?.game.mode,
      defeatShown: !!document.querySelector('.bui-end-card-defeat'),
    }));
    if (s.defeatShown || s.mode === 'overworld') { console.log(`iter ${i}:`, JSON.stringify(s)); break; }
  }
  const probe1 = await page.evaluate(() => {
    const L = window.LF.input._listeners;
    return {
      mode: window.LF.game.mode,
      defeatShown: !!document.querySelector('.bui-end-card-defeat'),
      confirmListeners: L.get('confirm')?.size ?? 0,
      dlgVisible: !!document.querySelector('#ui-root [class*="dlg"]:not(.hidden)'),
      paused: window.LF.game._paused,
    };
  });
  console.log('PROBE1:', JSON.stringify(probe1));
  if (!probe1.defeatShown) return;
  // manually fire the confirm action from inside the page
  await page.evaluate(() => window.LF.input._fire('confirm'));
  await h.sleep(1500);
  const probe2 = await page.evaluate(() => ({
    defeatShown: !!document.querySelector('.bui-end-card-defeat'),
    mode: window.LF.game.mode,
  }));
  console.log('PROBE2 (after manual _fire):', JSON.stringify(probe2));
  // then try a real key press
  await h.press('Enter'); await h.sleep(1500);
  const probe3 = await page.evaluate(() => ({
    defeatShown: !!document.querySelector('.bui-end-card-defeat'),
    mode: window.LF.game.mode,
  }));
  console.log('PROBE3 (after real Enter):', JSON.stringify(probe3));
  await h.shot('probe-final');
}
