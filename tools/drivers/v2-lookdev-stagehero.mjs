// v2 LOOK-DEV combo: character stage (Warden + NPCs) then the creature hero
// row, in ONE browser session — one shoot-lock slot instead of two.
//   QA_BEAUTY=1 node tools/shoot.mjs tools/drivers/v2-lookdev-stagehero.mjs <out>
import { run as stage } from './v2-lookdev-stage.mjs';
import { run as gallery } from './v2-lookdev-gallery.mjs';

export async function run(page, h) {
  await stage(page, h);
  process.env.LOOK_BATCHES = process.env.LOOK_BATCHES ?? '';
  await gallery(page, h);
}
