// v2 GROUND agent: proves walking still works on the reshaded terrain.
// Holds a direction key in dawnmeadow and logs player position vs heightAt
// (the analytic gameplay height) and the rendered grid surface, then grabs
// fast-mode (quality low) shots. Run WITHOUT QA_BEAUTY for the low tier.
import { loadIn, goZone } from './integration-a.mjs';

const PROBE = `(() => {
  const ow = window.LF.game.overworld, p = ow.player.pos;
  return JSON.stringify({
    x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3),
    heightAt: +ow.heightAt(p.x, p.z).toFixed(3),
    renderedSurface: +(ow.terrain.ground?.surfaceY?.(p.x, p.z) ?? NaN).toFixed(3),
    dy: +(p.y - ow.heightAt(p.x, p.z)).toFixed(4),
    frozen: ow.player.frozen, mode: window.LF.game.mode,
    grass: ow.grass?.stats?.() ?? null,
  });
})()`;

export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  await goZone(page, h, 'dawnmeadow', 'fast-dawnmeadow-spawn', 0.5);
  await h.sleep(1500);
  const start = JSON.parse(await page.evaluate(PROBE));
  console.log('WALK start', JSON.stringify(start));
  for (const [key, ms] of [['KeyW', 6000], ['KeyD', 3000]]) {
    await page.keyboard.down(key);
    for (let t = 0; t < ms; t += 1000) {
      await h.sleep(1000);
      console.log(`WALK ${key} +${t + 1000}ms`, await page.evaluate(PROBE));
    }
    await page.keyboard.up(key);
  }
  await h.sleep(1500);
  const end = JSON.parse(await page.evaluate(PROBE));
  console.log('WALK end', JSON.stringify(end));
  const moved = Math.hypot(end.x - start.x, end.z - start.z);
  console.log(`WALK RESULT moved=${moved.toFixed(2)}m  settled |y-heightAt|=${Math.abs(end.dy).toFixed(4)}  ${moved > 1 && Math.abs(end.dy) < 0.06 ? 'PASS' : 'FAIL'}`);
  await h.shot('fast-dawnmeadow-after-walk');
  await goZone(page, h, 'whisperwood', 'fast-whisperwood-spawn', 0.45);
  console.log('FAST whisperwood', await page.evaluate(PROBE));
  // live quality switch: grass must rebuild at the new tier budget (then restore low)
  for (const q of ['med', 'high', 'low']) {
    await page.evaluate(`import('/src/core/settings.js').then((m) => m.updateSetting('quality', '${q}'))`);
    await h.sleep(2500);
    console.log(`QUALITY ${q}`, JSON.stringify(JSON.parse(await page.evaluate(PROBE)).grass));
  }
}
