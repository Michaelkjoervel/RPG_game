// WORLD DRESSING: walk proof for every zone. Holds a real key and steps the
// game's own per-frame sequence (input.update(); world.update(dt)) for N game
// seconds without rendering — the software-GL harness renders ~1 fps, far too
// slow to walk anywhere in wall-clock time. Movement, collision against every
// prop collider, water limits and the stuck watchdog all run exactly as in
// play. Reports distance covered along the main path vs. an unobstructed walk.
import { loadIn, goZone } from './integration-a.mjs';
const ROUTES = {
  brighthollow: [[0, 6], [72, 0]], dawnmeadow: [[-94, 0], [-52, 8]], whisperwood: [[0, 106], [10, 70]],
  mirrorlake: [[-116, 0], [-70, 0]], gloamcavern: [[-86, 0], [-40, -10]], skyreach: [[0, 106], [-30, 80]],
  sunkenruins: [[0, 96], [0, 60]], hollowspire: [[0, 76], [0, 50]], starfallglade: [[52, 52], [30, 30]],
};
export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  const zones = (process.env.WALK_ZONES ?? Object.keys(ROUTES).join(',')).split(',');
  const secs = +(process.env.WALK_SECS ?? 5);
  for (const zone of zones) {
    const [from, to] = ROUTES[zone];
    await goZone(page, h, zone, `${zone}-walk-start`, 0.5);
    await page.evaluate(`(() => { const w = window.LF.game.overworld, p = w.player;
      p.teleport(${from[0]}, ${from[1]}, Math.atan2(${to[0] - from[0]}, ${to[1] - from[1]})); w.cameraRig.recenter?.(); })()`);
    await h.sleep(300);
    await page.keyboard.down('ArrowUp');
    const r = JSON.parse(await page.evaluate(`(() => {
      const L = window.LF, w = L.game.overworld, p = w.player, dt = 1 / 30;
      const a = [p.pos.x, p.pos.z], track = [];
      for (let i = 0; i < ${Math.round(secs * 30)}; i++) {
        L.input.update(); w.update(dt);
        if (i % 30 === 29) track.push([+p.pos.x.toFixed(1), +p.pos.z.toFixed(1)]);
      }
      return JSON.stringify({ a, b: [p.pos.x, p.pos.z], track, axes: L.input.axes, frozen: p.isFrozen?.() });
    })()`));
    await page.keyboard.up('ArrowUp');
    const d = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]);
    const ideal = 3.2 * (secs - 0.3);
    // per-second progress: any second with < 1 m covered is a stall
    let prev = r.a, stalls = 0;
    for (const q of r.track) { if (Math.hypot(q[0] - prev[0], q[1] - prev[1]) < 1) stalls++; prev = q; }
    const ok = d > ideal * 0.7 && stalls === 0;
    console.log(`WALK ${zone} ${secs}s from [${r.a.map((v) => v.toFixed(1))}] to [${r.b.map((v) => v.toFixed(1))}] moved ${d.toFixed(1)}m (${(d / ideal * 100).toFixed(0)}% of unobstructed) stalls=${stalls} axes=${JSON.stringify(r.axes)} track=${JSON.stringify(r.track)} ${ok ? 'OK' : 'CHECK'}`);
    await h.shot(`${zone}-walk-end`);
  }
}
