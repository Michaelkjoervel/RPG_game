// WORLD DRESSING: walk probe — game-time progress idle vs. key held, per zone.
import { loadIn, goZone } from './integration-a.mjs';
const Z = (process.env.PROBE_ZONES ?? 'brighthollow').split(',');
const TO = { brighthollow: [72, 0], dawnmeadow: [0, -50], whisperwood: [10, 70], mirrorlake: [-42, 50], gloamcavern: [0, 0], skyreach: [-30, 80], sunkenruins: [0, 60], hollowspire: [0, 50], starfallglade: [0, 20] };
export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  for (const zone of Z) {
    await goZone(page, h, zone, `${zone}-probe`, 0.5);
    const snap = () => page.evaluate(`JSON.stringify((() => { const w = window.LF.game.overworld, p = w.player; return { x: p.pos.x, z: p.pos.z, t: w._time, f: window.LF.game.renderer.info.render.frame, mode: window.LF.game.mode, frozen: p.isFrozen?.() }; })())`).then(JSON.parse);
    await page.evaluate(`(() => { const w = window.LF.game.overworld, p = w.player; const to = ${JSON.stringify(TO[zone] ?? [0, 0])}; p.teleport(p.pos.x, p.pos.z, Math.atan2(to[0] - p.pos.x, to[1] - p.pos.z)); w.cameraRig.recenter?.(); })()`);
    const a = await snap(); const w0 = Date.now();
    await h.sleep(3000);
    const b = await snap(); const w1 = Date.now();
    await page.keyboard.down('ArrowUp');
    await h.sleep(6000);
    const c = await snap(); const w2 = Date.now();
    await page.keyboard.up('ArrowUp');
    const fps = (s, e, ms) => ((e.f - s.f) / (ms / 1000)).toFixed(1);
    const d = Math.hypot(c.x - b.x, c.z - b.z), gt = c.t - b.t;
    console.log(`PROBE ${zone} idle ${fps(a, b, w1 - w0)}fps game+${(b.t - a.t).toFixed(2)}s | held ${fps(b, c, w2 - w1)}fps game+${gt.toFixed(2)}s moved ${d.toFixed(2)}m (${gt > 0 ? (d / gt).toFixed(2) : '-'} u/game-s) mode=${c.mode} frozen=${c.frozen} from [${b.x.toFixed(1)},${b.z.toFixed(1)}] to [${c.x.toFixed(1)},${c.z.toFixed(1)}]`);
    await h.shot(`${zone}-probe-walked`);
  }
}
