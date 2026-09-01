// Integration check B: seeded save → Continue → gloamcavern, mirrorlake dusk,
// starfallglade. Second half of the split integration pass (see integration-a).
import { goZone, loadIn } from './integration-a.mjs';

export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  await goZone(page, h, 'gloamcavern', '04-gloamcavern', 0.5);
  await goZone(page, h, 'mirrorlake', '05-mirrorlake-dusk', 0.78);
  await goZone(page, h, 'starfallglade', '06-starfallglade', 0.5);
}
