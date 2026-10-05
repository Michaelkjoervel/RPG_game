// v3 PERFORMANCE probe: whole-frame GPU work (main + shadow pass) per zone and
// in one wild battle, measured with direct scene renders (renderer.info is
// unreliable with post-processing on — it reports the composer's last pass).
// Also breaks the props layer down by kind, with the share of each kind's
// instances that sit inside the camera frustum and the sun's shadow frustum.
//   PERF_Q=high|med (default high)  PERF_ZONES=brighthollow,dawnmeadow,...
//   PERF_BATTLE=1 (default 1)  PERF_SHOTS=1 (screenshots, default 0)
//   PERF_KINDS=1 (per-kind table, default 1)
// Usage (counts don't depend on the viewport size, only on its aspect):
//   QA_BEAUTY=1 QA_VIEWPORT=640x360 PERF_Q=high node tools/shoot.mjs tools/drivers/v3-perf-probe.mjs <out>
import { loadIn, goZone } from './integration-a.mjs';

const Q = process.env.PERF_Q ?? 'high';
const ZONES = (process.env.PERF_ZONES ?? 'brighthollow,dawnmeadow,whisperwood,mirrorlake,skyreach').split(',').filter(Boolean);
const T = { mirrorlake: 0.78, whisperwood: 0.45 };

export const BREAKDOWN = `(() => {
  const g = window.LF.game, r = g.renderer, s = g.activeScene;
  if (!s || !s.scene || !s.camera) return 'n/a';
  const w = g.overworld;
  const cats = {};
  const add = (k, o) => { (cats[k] ??= []).push(o); };
  for (const o of s.scene.children) {
    const n = o.name || '';
    if (o.userData && o.userData.outline) add('figures', o);
    else if (n === 'terrain') add('terrain', o);
    else if (n === 'grass' || n === 'stage-grass') add('grass', o);
    else if (n === 'water') add('water', o);
    else if (n === 'props') add('props', o);
    else if (/^(skydome|stars|clouds|backdrop|lightShafts)/.test(n)) add('sky', o);
    else if (/^(mistWisps|rainStreaks)/.test(n)) add('weather', o);
    else if (n.includes(':')) add('interactables', o);
    else if (o.isLight || o.isCamera) continue;
    else add('other', o);
  }
  // battle: the arena group nests its own props group
  const arenaProps = [];
  s.scene.traverse((o) => { if (o.name === 'props' && o.parent !== s.scene) arenaProps.push(o); });
  for (const o of arenaProps) add('props', o);
  const auto = r.info.autoReset, sAuto = r.shadowMap.autoUpdate;
  r.info.autoReset = false;
  const measure = (shadows = true) => {
    r.shadowMap.autoUpdate = shadows; if (shadows) r.shadowMap.needsUpdate = true;
    r.info.reset(); r.render(s.scene, s.camera);
    return [r.info.render.calls, r.info.render.triangles];
  };
  const [calls, tris] = measure(true);
  const [c0, t0] = measure(false);
  const out = { calls, tris, mainCalls: c0, mainTris: t0, shadowCalls: calls - c0, shadowTris: tris - t0, cats: {} };
  for (const [k, list] of Object.entries(cats)) {
    const vis = list.map((o) => o.visible);
    list.forEach((o) => { o.visible = false; });
    const [c, t] = measure(true);
    const [cm, tm] = measure(false);
    list.forEach((o, i) => { o.visible = vis[i]; });
    out.cats[k] = { calls: calls - c, tris: tris - t, mainTris: t0 - tm, shadowTris: (tris - t) - (t0 - tm) };
  }
  r.shadowMap.autoUpdate = sAuto;
  r.info.autoReset = auto;
  if (w?.grass?.stats && g.activeScene === w) out.grassStats = w.grass.stats();
  return JSON.stringify(out);
})()`;

// Per-kind table of the props layer: triangles drawn per pass (count x
// tris/instance), how many instances are actually inside the camera frustum /
// the shadow camera frustum, and their distance from the camera.
export const KINDS = `(async () => {
  const THREE = await import('three');
  const g = window.LF.game, s = g.activeScene;
  const cam = s.camera; cam.updateMatrixWorld();
  let light = null;
  s.scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) light = o; });
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  let sfr = null;
  if (light) {
    const sc = light.shadow.camera; light.updateMatrixWorld(); light.target.updateMatrixWorld();
    sc.position.setFromMatrixPosition(light.matrixWorld);
    sc.lookAt(new THREE.Vector3().setFromMatrixPosition(light.target.matrixWorld));
    sc.updateMatrixWorld();
    sfr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse));
  }
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc3 = new THREE.Vector3(), sph = new THREE.Sphere();
  const camP = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
  const kinds = {};
  const BAND = [0, 0, 0, 0, 0];
  const roots = [];
  s.scene.traverse((o) => { if (o.name === 'props') roots.push(o); });
  for (const root of roots) root.traverse((o) => {
    if (!o.isInstancedMesh || !o.visible) return;
    const kind = o.name.split(':')[0];
    const geo = o.geometry;
    const tpi = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const K = (kinds[kind] ??= { tris: 0, shadowTris: 0, meshes: 0, inst: 0, inView: 0, inShadow: 0, viewTris: 0, shadowInTris: 0, far50: 0, far80: 0, band: [0, 0, 0, 0, 0] });
    K.meshes++;
    const n = o.count;
    K.tris += tpi * n;
    if (o.castShadow) K.shadowTris += tpi * n;
    for (let i = 0; i < n; i++) {
      o.getMatrixAt(i, m); m.premultiply(o.matrixWorld);
      m.decompose(p, q, sc3);
      sph.center.copy(geo.boundingSphere.center).applyMatrix4(m);
      sph.radius = geo.boundingSphere.radius * Math.max(sc3.x, sc3.y, sc3.z);
      if (sph.radius === 0) continue;
      K.inst++;
      const d = sph.center.distanceTo(camP);
      if (d > 50) K.far50++;
      if (d > 80) K.far80++;
      if (fr.intersectsSphere(sph)) { K.inView++; K.viewTris += tpi; K.band[d < 30 ? 0 : d < 60 ? 1 : d < 100 ? 2 : d < 140 ? 3 : 4] += tpi; BAND[d < 30 ? 0 : d < 60 ? 1 : d < 100 ? 2 : d < 140 ? 3 : 4] += tpi; }
      if (o.castShadow && sfr && sfr.intersectsSphere(sph)) { K.inShadow++; K.shadowInTris += tpi; }
    }
  });
  const rows = Object.entries(kinds).sort((a, b) => (b[1].tris + b[1].shadowTris) - (a[1].tris + a[1].shadowTris));
  let tot = { tris: 0, shadowTris: 0, viewTris: 0, shadowInTris: 0, meshes: 0 };
  for (const [, K] of rows) for (const k of Object.keys(tot)) tot[k] += K[k];
  return JSON.stringify({ tot, viewBands_lt30_60_100_140_more: BAND.map(Math.round), fog: s.scene.fog ? s.scene.fog.density : null, rows: rows.slice(0, 40).map(([k, K]) => [k, K.meshes, K.inst, Math.round(K.tris), Math.round(K.shadowTris), Math.round(K.viewTris), Math.round(K.shadowInTris), K.inView, K.inShadow, K.far50, K.far80, K.band.map(Math.round).join('/')]) });
})()`;

export async function run(page, h) {
  await h.waitFor(`!!window.LF`, 25000);
  await page.evaluate((q) => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('lumenfall_settings') || '{}'); } catch (e) { /* ignore */ }
    s.quality = q; s.musicVol = 0; s.sfxVol = 0;
    localStorage.setItem('lumenfall_settings', JSON.stringify(s));
  }, Q);
  if (!await loadIn(page, h)) return;
  // the quality governor must never step the tier down under the harness
  await page.evaluate(`(() => { const g = window.LF.game; if (g._qg) g._qg.enabled = false; })()`);
  console.log('QUALITY:', await page.evaluate(`import('/src/core/settings.js').then((m) => m.settings.quality)`));
  const shots = process.env.PERF_SHOTS === '1';
  for (const z of ZONES) {
    await goZone(page, h, z, `${z}-${Q}`, T[z] ?? 0.5);
    await h.sleep(1500);
    if (shots) await h.shot(`${z}-${Q}-b`);
    console.log(`PERF ${z} ${Q}: ${await page.evaluate(BREAKDOWN)}`);
    if (process.env.PERF_KINDS !== '0') console.log(`KINDS ${z} ${Q}: ${await page.evaluate(KINDS)}`);
  }
  if (process.env.PERF_BATTLE !== '0') {
    await goZone(page, h, 'dawnmeadow', `battle-zone-${Q}`, 0.5);
    await page.evaluate(`(() => {
      if (window.LF.G.party[0]) window.LF.G.party[0].burstCharge = 100;
      window.LF.game.overworld.startWildBattle('pebbin', 12);
    })()`);
    const ready = await h.waitFor(`!!document.querySelector('.bui-ring-wrap:not(.hidden) .bui-card')`, 150000, 700);
    await h.sleep(1500);
    await h.shot(`battle-${Q}`);
    console.log('BATTLE READY:', !!ready);
    console.log(`PERF battle ${Q}: ${await page.evaluate(BREAKDOWN)}`);
    if (process.env.PERF_KINDS !== '0') console.log(`KINDS battle ${Q}: ${await page.evaluate(KINDS)}`);
  }
}
