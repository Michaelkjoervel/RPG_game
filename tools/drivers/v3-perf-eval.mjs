// v3 PERF: load zone(s) and print the result of an in-page expression in each
//   EVAL_ZONES=whisperwood,skyreach EVAL_JS='(() => ...)()' node tools/shoot.mjs tools/drivers/v3-perf-eval.mjs <out>
import { loadIn, goZone } from './integration-a.mjs';
export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  const zones = (process.env.EVAL_ZONES ?? process.env.EVAL_ZONE ?? 'whisperwood').split(',');
  for (const zone of zones) {
    await goZone(page, h, zone, `${zone}`, 0.5);
    console.log(`EVAL ${zone}`, await page.evaluate(process.env.EVAL_JS ?? '1'));
  }
}
