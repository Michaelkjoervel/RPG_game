// v2 LOOK-DEV perf driver: Brighthollow + one wild battle, renderer.info for a
// full scene render (main + shadow pass) broken down by subsystem, at the
// quality tier given by LOOK_Q (high | med; default high). The composer's own
// fullscreen passes (grade, output, bloom mips on High) are NOT included —
// they cost a fixed ~3 (Med) / ~16 (High) quad draws per frame.
//   QA_BEAUTY=1 LOOK_Q=med node tools/shoot.mjs tools/drivers/v2-lookdev-perf.mjs <out>
import { loadIn } from './integration-a.mjs';

const Q = process.env.LOOK_Q ?? 'high';

// Per-category cost = full render minus the render with that category hidden.
// shadow = full render minus a render that skips the shadow-map update.
export const BREAKDOWN = `(() => {
  const g = window.LF.game, r = g.renderer, s = g.activeScene;
  if (!s || !s.scene || !s.camera) return 'n/a';
  const w = g.overworld;
  const cats = {};
  const add = (k, o) => { (cats[k] ??= []).push(o); };
  for (const o of s.scene.children) {
    const n = o.name || '';
    if (o.userData && o.userData.outline) add('figures', o);
    else if (n === 'terrain') add('terrain', o);
    else if (n === 'grass') add('grass', o);
    else if (n === 'water') add('water', o);
    else if (w && w.props && o === w.props.group) add('props', o);
    else if (/^(skydome|stars|clouds|backdrop|lightShafts)/.test(n)) add('sky', o);
    else if (/^(mistWisps|rainStreaks)/.test(n)) add('weather', o);
    else if (n.includes(':')) add('interactables', o);
    else if (o.isLight || o.isCamera) continue;
    else add('other', o);
  }
  const auto = r.info.autoReset, sAuto = r.shadowMap.autoUpdate;
  r.info.autoReset = false;
  const measure = (shadows = true) => {
    r.shadowMap.autoUpdate = shadows; if (shadows) r.shadowMap.needsUpdate = true;
    r.info.reset(); r.render(s.scene, s.camera);
    return [r.info.render.calls, r.info.render.triangles];
  };
  const [calls, tris] = measure(true);
  const [c0, t0] = measure(false);
  const out = { calls, tris, shadowCalls: calls - c0, shadowTris: tris - t0, cats: {} };
  for (const [k, list] of Object.entries(cats)) {
    const vis = list.map((o) => o.visible);
    list.forEach((o) => { o.visible = false; });
    const [c, t] = measure(true);
    list.forEach((o, i) => { o.visible = vis[i]; });
    out.cats[k] = { n: list.length, calls: calls - c, tris: tris - t };
  }
  r.shadowMap.autoUpdate = sAuto;
  r.info.autoReset = auto;
  return JSON.stringify(out);
})()`;

export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 25000);
  await page.evaluate((q) => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('lumenfall_settings') || '{}'); } catch (e) { /* ignore */ }
    s.quality = q; s.musicVol = 0; s.sfxVol = 0;
    localStorage.setItem('lumenfall_settings', JSON.stringify(s));
  }, Q);
  if (!await loadIn(page, h)) return;
  await h.sleep(2500);
  console.log('QUALITY:', await page.evaluate(`import('/src/core/settings.js').then((m) => m.settings.quality)`));
  await h.shot(`bh-${Q}`);
  console.log(`PERF brighthollow ${Q}:`, await page.evaluate(BREAKDOWN));
  await page.evaluate(`(() => {
    if (window.LF.G.party[0]) window.LF.G.party[0].burstCharge = 100;
    window.LF.game.overworld.startWildBattle('pebbin', 12);
  })()`);
  const ready = await h.waitFor(`!!document.querySelector('.bui-ring-wrap:not(.hidden) .bui-card')`, 150000, 700);
  await h.sleep(1200);
  await h.shot(`battle-${Q}`);
  console.log('BATTLE READY:', !!ready);
  console.log(`PERF battle ${Q}:`, await page.evaluate(BREAKDOWN));
}
