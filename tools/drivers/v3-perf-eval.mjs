// v3 PERF: load a zone and print the result of an in-page expression
//   EVAL_ZONE=whisperwood EVAL_JS='(() => ...)()' node tools/shoot.mjs tools/drivers/v3-perf-eval.mjs <out>
import { loadIn, goZone } from './integration-a.mjs';
export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  const zone = process.env.EVAL_ZONE ?? 'whisperwood';
  await goZone(page, h, zone, `${zone}`, 0.5);
  console.log('EVAL', await page.evaluate(process.env.EVAL_JS ?? '1'));
}
