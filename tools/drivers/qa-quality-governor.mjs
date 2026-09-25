// Verifies the adaptive quality governor (game.js): off under automation by
// default; when forced on, a slow machine (software GL at High) steps High → Med
// with a toast, and a manual quality choice turns it off for the session.
import { loadIn } from './integration-a.mjs';

export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  const state = () => page.evaluate(`(async () => {
    const { settings } = await import('/src/core/settings.js');
    const q = window.LF.game._qg;
    const g = window.LF.game;
    return JSON.stringify({ quality: settings.quality, enabled: q.enabled, webdriver: navigator.webdriver,
      mode: g.mode, paused: g._paused, stalled: !!g._stalled, hidden: document.hidden,
      q: { clock: +q.clock.toFixed(2), warm: +q.warm.toFixed(2), t: +q.t.toFixed(2), frames: q.frames },
      toast: [...document.querySelectorAll('.toast-text')].map(t => t.textContent).join(' | ') });
  })()`);
  console.log('INITIAL:', await state());
  await page.evaluate(`(() => { const q = window.LF.game._qg; q.enabled = true; q.warm = 0; q.t = 0; q.frames = 0; })()`);
  await h.sleep(8000);
  console.log('AFTER 8s:', await state());
  const dropped = await h.waitFor(`(async () => (await import('/src/core/settings.js')).settings.quality !== 'high')()`, 60000);
  console.log('DROPPED FROM HIGH:', dropped, await state());
  await h.shot('governor-toast');
  await page.evaluate(`(async () => (await import('/src/core/settings.js')).updateSetting('quality', 'high'))()`);
  console.log('AFTER MANUAL CHOICE:', await state());
}
