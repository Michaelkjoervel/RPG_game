// WORLD DRESSING: cost probe — fps with scene layers hidden one at a time.
import { loadIn, goZone } from './integration-a.mjs';
export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  const zone = process.env.PROBE_ZONE ?? 'brighthollow';
  await goZone(page, h, zone, `${zone}-cost`, 0.5);
  const list = await page.evaluate(`JSON.stringify(window.LF.game.overworld.scene.children.map((o, i) => [i, o.name || o.type, o.type]))`);
  console.log('CHILDREN ' + list);
  const measure = async (label, hideSrc) => {
    await page.evaluate(`(() => { const sc = window.LF.game.overworld.scene; window.__hidden = []; for (const o of sc.children) { if ((${hideSrc})(o)) { window.__hidden.push(o); o.visible = false; } } })()`);
    await h.sleep(600);
    const f0 = await page.evaluate('window.LF.game.renderer.info.render.frame'); const t0 = Date.now();
    await h.sleep(4000);
    const f1 = await page.evaluate('window.LF.game.renderer.info.render.frame'); const t1 = Date.now();
    const n = await page.evaluate(`window.__hidden.length`);
    console.log(`COST ${label}: ${((f1 - f0) / ((t1 - t0) / 1000)).toFixed(2)} fps (hid ${n})`);
    await page.evaluate(`(() => { for (const o of window.__hidden) o.visible = true; })()`);
  };
  await measure('all', '() => false');
  await measure('no-props', `(o) => o.name === 'props'`);
  await measure('no-grass', `(o) => /grass/i.test(o.name)`);
  await measure('no-terrain', `(o) => o.name === 'terrain'`);
  await measure('only-terrain+player', `(o) => o.name !== 'terrain' && !/warden|player/i.test(o.name) && o.type !== 'DirectionalLight' && o.type !== 'HemisphereLight' && o.type !== 'AmbientLight'`);
  await measure('nothing', `(o) => o.type !== 'DirectionalLight' && o.type !== 'HemisphereLight'`);
}
