// v2 SKY & WATER perf probe: per-object render cost of the sky/water/weather
// objects, measured by timing forced-sync renders with each group hidden.
// Software GL exaggerates fill cost, so read the numbers as RELATIVE shares.
//   SKY_PERF_ZONES=skyreach,mirrorlake  (default: skyreach,mirrorlake,whisperwood)
// Usage: QA_BEAUTY=1 QA_VIEWPORT=1120x630 node tools/shoot.mjs tools/drivers/v2-sky-perf.mjs <outDir>
import { loadIn, goZone } from './integration-a.mjs';

const T = { skyreach: 0.5, mirrorlake: 0.78, whisperwood: 0.45, dawnmeadow: 0.5 };

const PROBE = `(() => {
  const g = window.LF.game, w = g.overworld, r = g.renderer, gl = r.getContext();
  const px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const time = () => {
    const ms = [];
    for (let i = 0; i < 3; i++) { const t0 = performance.now(); r.render(w.scene, w.camera); sync(); ms.push(performance.now() - t0); }
    ms.sort((a, b) => a - b); return ms[1];
  };
  const groups = {
    clouds: /^clouds$/, backdrop: /^backdrop\\d$/, water: /^water$/, rain: /^rainStreaks$/,
    wisps: /^mistWisps$/, shafts: /^lightShafts$/, dome: /^(skydome|stars)$/,
  };
  const find = (re) => { const out = []; w.scene.traverse((o) => { if (re.test(o.name)) out.push(o); }); return out; };
  sync();
  const base = time();
  const res = { zone: w.zoneId, allMs: +base.toFixed(1) };
  for (const [k, re] of Object.entries(groups)) {
    const objs = find(re).filter((o) => o.visible);
    if (!objs.length) continue;
    objs.forEach((o) => { o.visible = false; });
    const t = time();
    objs.forEach((o) => { o.visible = true; });
    res[k] = +(base - t).toFixed(1);
  }
  return JSON.stringify(res);
})()`;

export async function run(page, h) {
  const zones = (process.env.SKY_PERF_ZONES ?? 'skyreach,mirrorlake,whisperwood').split(',').filter(Boolean);
  if (!await loadIn(page, h)) return;
  for (const z of zones) {
    await goZone(page, h, z, `${z}-perf`, T[z] ?? 0.5);
    await h.sleep(800);
    console.log(`PERF ${await page.evaluate(PROBE)}`);
  }
}
