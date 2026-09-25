// v2 SKY & WATER agent: fixed-camera sky / horizon / water views + render stats.
// Same cameras for BEFORE and AFTER. Pick a subset with SKY_SET:
//   A = brighthollow dawn, dawnmeadow noon + night, mirrorlake dusk
//   B = whisperwood, skyreach, starfallglade, sunkenruins
//   or a comma list of stop ids (e.g. SKY_SET=ml,dmn).
// Usage: QA_BEAUTY=1 node tools/shoot.mjs tools/drivers/v2-sky-shots.mjs <outDir>
import { loadIn, goZone } from './integration-a.mjs';

// Each stop: zone entered at dayTime t (the default gameplay camera is shot on
// entry), then fixed-camera views [name, camera (x, y-above-ground, z),
// look-at (x, y-above-ground, z)]. dayTime is re-pinned before every view —
// the 15-minute day cycle keeps running while the harness works.
const STOPS = [
  { id: 'bh', set: 'A', zone: 'brighthollow', t: 0.27, views: [
    ['bh-dawn-east', [-12, 3.4, 10], [60, 6, -8]],
    ['bh-dawn-north', [4, 3.2, 20], [-10, 5, -60]],
  ] },
  { id: 'dm', set: 'A', zone: 'dawnmeadow', t: 0.5, views: [
    ['dm-noon-north', [-6, 3.6, 14], [0, 4, -70]],
    ['dm-noon-pond', [20, 3.5, 12], [62, 1, 44]],
  ] },
  { id: 'dmn', set: 'A', zone: 'dawnmeadow', t: 0.93, tag: 'night', views: [
    ['dm-night-north', [-6, 3.6, 14], [0, 4, -70]],
  ] },
  { id: 'ml', set: 'A', zone: 'mirrorlake', t: 0.78, views: [
    ['ml-dusk-lake', [-50, 3.4, 22], [40, 2, 30]],
    ['ml-dusk-low', [-30, 1.6, 36], [80, 4, 36]],
    ['ml-dusk-shore', [10, 2.6, -40], [40, 0, 20]],
  ] },
  { id: 'ww', set: 'B', zone: 'whisperwood', t: 0.45, views: [
    ['ww-trail', [6, 3, 96], [22, 2, 50]],
    ['ww-sky', [10, 2.2, 72], [40, 14, 30]],
  ] },
  { id: 'sr', set: 'B', zone: 'skyreach', t: 0.5, views: [
    ['sr-pass', [0, 4, 104], [0, 10, 30]],
    ['sr-east', [0, 4, 60], [80, 8, 40]],
  ] },
  { id: 'sg', set: 'B', zone: 'starfallglade', t: 0.5, views: [
    ['sg-pool', [34, 4, 34], [0, 1, 0]],
  ] },
  { id: 'su', set: 'B', zone: 'sunkenruins', t: 0.5, views: [
    ['su-terraces', [10, 5, 92], [0, 0.5, 40]],
  ] },
];

const STATS = `(() => {
  const g = window.LF.game, w = g.overworld, r = g.renderer;
  r.info.autoReset = false; r.info.reset();
  r.render(w.scene, w.camera);
  const scene = { calls: r.info.render.calls, triangles: r.info.render.triangles };
  r.info.autoReset = true;
  let q = 'high';
  try { q = JSON.parse(localStorage.getItem('lumenfall_settings') || '{}').quality || 'high'; } catch (e) {}
  // SKY & WATER's own objects (sky dome/stars/clouds/backdrop/shafts, water, weather)
  const MINE = /^(skydome|stars|clouds|backdrop\\d|lightShafts|water|rainStreaks|mistWisps)$/;
  const mine = { calls: 0, triangles: 0, objects: [] };
  w.scene.traverse((o) => {
    if (!MINE.test(o.name) || !o.visible) return;
    const g = o.geometry;
    const n = g.index ? g.index.count : g.attributes.position.count;
    const inst = o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1;
    const tris = o.isPoints ? 0 : Math.round(n / 3 * inst);
    mine.calls++; mine.triangles += tris; mine.objects.push(o.name + ':' + tris);
  });
  return JSON.stringify({ zone: w.zoneId, quality: q, scene, mine, programs: r.info.programs?.length,
    geometries: r.info.memory.geometries, textures: r.info.memory.textures });
})()`;

async function camView(page, h, name, pos, look, t) {
  await page.evaluate(`(() => {
    window.LF.G.calendar.dayTime = ${t};
    const w = window.LF.game.overworld, rig = w.cameraRig;
    if (!rig._skyUpd) rig._skyUpd = rig.update;
    rig.update = () => {};
    // floor at the water line so lake views never start under the surface
    const c = rig.camera, H = (x, z) => Math.max(w.heightAt(x, z), 0.35);
    c.position.set(${pos[0]}, H(${pos[0]}, ${pos[2]}) + ${pos[1]}, ${pos[2]});
    c.lookAt(${look[0]}, H(${look[0]}, ${look[2]}) + ${look[1]}, ${look[2]});
    c.updateMatrixWorld();
  })()`);
  await h.sleep(1100);
  await h.shot(name);
}

export async function run(page, h) {
  const sel = (process.env.SKY_SET ?? 'A').split(',').filter(Boolean);
  const stops = STOPS.filter((s) => sel.includes(s.set) || sel.includes(s.id));
  if (!await loadIn(page, h)) return;
  for (const s of stops) {
    const t0 = Date.now();
    await goZone(page, h, s.zone, `${s.zone}${s.tag ? '-' + s.tag : ''}-default`, s.t);
    let first = true;
    for (const [name, pos, look] of s.views) {
      await camView(page, h, name, pos, look, s.t);
      if (first) { console.log(`STATS ${name} ${await page.evaluate(STATS)}`); first = false; }
    }
    // restore the rig for the next zone (it is rebuilt on zone load anyway)
    await page.evaluate(`(() => { const rig = window.LF.game.overworld.cameraRig; if (rig?._skyUpd) rig.update = rig._skyUpd; })()`);
    console.log(`STOP ${s.id} took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}
