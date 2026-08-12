// AD review: title screen + starter choice scene.
export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 30000);
  await h.sleep(7000);
  await h.shot('title');
  await h.sleep(4000);
  await h.shot('title-later'); // catch animation state / glow pulse
  await h.press('Enter'); // New Journey
  await h.sleep(1500);
  await h.shot('name-entry');
  await h.press('Enter');
  await h.sleep(2600);
  await h.shot('intro-1');
  for (let i = 0; i < 10; i++) { await h.press('Enter'); await h.sleep(650); }
  await h.sleep(1200);
  await h.shot('starter-choice-1');
  await h.press('ArrowRight');
  await h.sleep(1100);
  await h.shot('starter-choice-2');
  await h.press('ArrowRight');
  await h.sleep(1100);
  await h.shot('starter-choice-3');
  const probe = await page.evaluate(() => {
    const sc = window.LF.game.scene ?? window.LF.game.currentScene ?? null;
    const out = { mode: window.LF.game.mode, lights: [] };
    const s = sc?.scene;
    if (s?.traverse) s.traverse(o => { if (o.isLight) out.lights.push({ type: o.type, name: o.name, color: '#' + o.color?.getHexString?.(), intensity: o.intensity }); });
    return out;
  });
  console.log('STARTER SCENE PROBE:', JSON.stringify(probe));
  await h.press('Enter'); // choose it
  await h.sleep(1600);
  await h.shot('starter-confirmed');
}
