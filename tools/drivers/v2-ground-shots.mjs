// v2 GROUND agent: before/after ground + grass shots, with renderer stats.
//   V2G_ZONES=dawnmeadow,brighthollow   (default: all four)
//   V2G_EXTRA=0                          skip the extra vantage shots
// Uses the shared seeded-save loader and bounded zone entry from integration-a.
import { loadIn, goZone } from './integration-a.mjs';

// Extra gameplay-camera vantages per zone: [x, z, lookX, lookZ, tag]
const VANTAGES = {
  dawnmeadow: [
    [24, 14, 58, 42, 'pond-path'],     // on the east branch path, facing the pond
    [-44, 12, -6, 0, 'main-path'],     // along the main path toward the meadow heart
  ],
  brighthollow: [
    [30, 6, 0, 0, 'plaza-east'],       // east road looking back into the plaza
  ],
  whisperwood: [
    [25, 46, 40, 22, 'trail'],         // on the main trail heading into the wood
    [49, 2, 52, -32, 'glade-trail'],   // side trail toward Liora's glade
  ],
  skyreach: [
    [0, 65, 20, 50, 'switchback'],     // on the switchback path, looking up-slope
    [-44, 62, -84, 44, 'valley'],      // over the low western valley (below the snowline)
  ],
};
const DAYTIME = { dawnmeadow: 0.5, brighthollow: 0.5, whisperwood: 0.45, skyreach: 0.5 };

const STATS = `(() => {
  const g = window.LF.game, r = g.renderer, ow = g.overworld;
  const briefExpr = JSON.stringify(r.info.render);
  r.info.autoReset = false; r.info.reset();
  r.render(ow.scene, ow.camera);
  const scene = { calls: r.info.render.calls, triangles: r.info.render.triangles };
  r.info.autoReset = true;
  const tg = ow.terrain?.mesh?.geometry;
  const terrainTris = tg ? (tg.index ? tg.index.count / 3 : tg.attributes.position.count / 3) : 0;
  const gr = ow.grass?.stats?.() ?? null;
  let q = 'high';
  try { q = JSON.parse(localStorage.getItem('lumenfall_settings') || '{}').quality || 'high'; } catch (e) {}
  return JSON.stringify({ zone: ow.zoneId, quality: q, briefExpr, sceneRender: scene, terrainTris, grass: gr,
    programs: r.info.programs?.length, geometries: r.info.memory.geometries, textures: r.info.memory.textures });
})()`;

export async function run(page, h) {
  const zones = (process.env.V2G_ZONES ?? 'dawnmeadow,brighthollow,whisperwood,skyreach').split(',').filter(Boolean);
  const extra = process.env.V2G_EXTRA !== '0';
  if (!await loadIn(page, h)) return;
  for (const zone of zones) {
    await goZone(page, h, zone, `${zone}-spawn`, DAYTIME[zone] ?? 0.5);
    await h.sleep(1200);
    console.log('STATS', await page.evaluate(STATS));
    if (!extra) continue;
    for (const [x, z, lx, lz, tag] of VANTAGES[zone] ?? []) {
      const face = Math.atan2(lx - x, lz - z);
      await page.evaluate(`(() => { const ow = window.LF.game.overworld;
        ow.player.teleport(${x}, ${z}, ${face}); ow.cameraRig?.recenter?.(); })()`);
      await h.sleep(2600);
      await h.shot(`${zone}-${tag}`);
    }
    const errs = h.errors();
    if (errs.length) console.log('ERRORS so far:', errs.length);
  }
}
