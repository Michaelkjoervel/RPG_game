// Sprint check: on Dawnmeadow's north road, hold W alone, W+Shift and
// W+Space and read the Warden's top speed (walk ≈ 3.2, run ≈ 6, sprint ≈ 11);
// screenshot mid-sprint (lean, dust, wider view); then sprint straight at a
// prop and make sure the Warden stops against it instead of passing through.
//   node tools/shoot.mjs tools/drivers/sprint-test.mjs <outDir>
import { loadIn } from './integration-a.mjs';

const W = 'window.LF.game.overworld';
const M = (m) => `window.LF?.game.mode === '${m}'`;

async function gameWait(page, h, secs) {
  const t0 = await page.evaluate(`${W}._time`);
  await h.waitFor(`${W}._time > ${t0 + secs}`, 120000, 250);
}
async function stand(page, h, x, z, face) {
  await page.evaluate(`${W}.player.teleport(${x}, ${z}, ${face}); ${W}.cameraRig.recenter()`);
  await gameWait(page, h, 0.6);
}
// hold keys for `secs` of game time; returns the top speed seen
async function holdFor(page, h, keys, secs, shot) {
  for (const k of keys) await page.keyboard.down(k);
  const t0 = await page.evaluate(`${W}._time`);
  let top = 0, shotDone = !shot;
  for (;;) {
    const [t, v] = await page.evaluate(`[${W}._time, ${W}.player.speed]`);
    top = Math.max(top, v);
    if (!shotDone && t > t0 + secs * 0.7) { await h.shot(shot); shotDone = true; }
    if (t > t0 + secs) break;
    await h.sleep(150);
  }
  for (const k of keys) await page.keyboard.up(k);
  await gameWait(page, h, 0.8); // coast to a stop
  return top;
}

export async function run(page, h) {
  if (!await loadIn(page, h)) { console.log('SPRINT RESULT: FAIL (load)'); return; }
  page.evaluate(`window.LF.game.enterOverworld('dawnmeadow')`).catch(() => {});
  await h.waitFor(`${M('overworld')} && ${W}.zone?.id === 'dawnmeadow' && !!${W}.player && window.LF.game.activeScene === ${W}`, 120000, 300);
  for (let i = 0; i < 4; i++) { await h.press('Enter'); await h.sleep(250); }
  // keep the road clear of charging Kindred for a clean measurement
  await page.evaluate(`${W}.wildlife.update = () => {}`);

  const NORTH = Math.PI; // facing -Z, up the road toward Whisperwood
  await stand(page, h, 0, -45, NORTH);
  const walk = await holdFor(page, h, ['KeyW'], 2.2);
  await stand(page, h, 0, -45, NORTH);
  const run = await holdFor(page, h, ['ShiftLeft', 'KeyW'], 2.2);
  await stand(page, h, 0, -40, NORTH);
  const sprint = await holdFor(page, h, ['Space', 'KeyW'], 2.4, 'sprinting');
  console.log(`SPRINT top speeds: walk ${walk.toFixed(2)}, run ${run.toFixed(2)}, sprint ${sprint.toFixed(2)} u/s`);
  const mode = await page.evaluate(`window.LF.game.mode`);
  console.log('SPRINT mode after holding Space (must stay overworld):', mode);

  // sprint into a prop: pick a collider with open ground in front of it
  const c = await page.evaluate(`(() => {
    const cols = ${W}.colliders.filter((c) => c.r >= 0.25 && c.r <= 1.2 && Math.abs(c.x) < 80 && Math.abs(c.z) < 80);
    for (const c of cols) {
      const sx = c.x, sz = c.z + 9; // approach from the south
      const clear = ${W}.colliders.every((o) => o === c || Math.hypot(o.x - sx, o.z - (sz - 4.5)) > o.r + 2.5);
      if (clear) return { x: c.x, z: c.z, r: c.r };
    }
    return null;
  })()`);
  let ok = walk > 2.6 && walk < 3.8 && run > 5 && run < 7 && sprint > 9.5 && mode === 'overworld';
  if (c) {
    await stand(page, h, c.x, c.z + 9, NORTH);
    await holdFor(page, h, ['Space', 'KeyW'], 2.0);
    const p = await page.evaluate(`({ x: ${W}.player.pos.x, z: ${W}.player.pos.z })`);
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    const passed = p.z < c.z - 0.2 && Math.abs(p.x - c.x) < c.r;
    console.log(`SPRINT into a prop (r ${c.r.toFixed(2)}): ended ${d.toFixed(2)} m from its centre, on the ${p.z > c.z ? 'near' : 'far'} side${passed ? ' — PASSED THROUGH' : ''}`);
    if (d < c.r + 0.3 || passed) ok = false;
    await h.shot('against-prop');
  } else console.log('SPRINT (no suitable prop found for the collision check)');
  console.log('SPRINT RESULT:', ok ? 'PASS' : 'FAIL');
}
