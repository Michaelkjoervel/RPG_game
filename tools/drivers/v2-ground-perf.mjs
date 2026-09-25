// v2 GROUND agent: frame-rate share of the ground layer under the harness.
// In one zone, measures rAF frames/sec with: everything on; grass hidden;
// terrain shader swapped for a plain MeshStandardMaterial; both. Software GL
// numbers are not GPU numbers, but the RATIOS show what the ground costs.
//   V2G_ZONE=dawnmeadow (default)
import { loadIn, goZone } from './integration-a.mjs';

const FPS = `(async () => {
  const t0 = performance.now(); let n = 0;
  await Promise.race([
    new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }),
    new Promise((res) => setTimeout(res, 12000)),
  ]);
  return +(n / ((performance.now() - t0) / 1000)).toFixed(2);
})()`;

const SET = (grass, plainTerrain) => `(async () => {
  const THREE = await import('three');
  const ow = window.LF.game.overworld, t = ow.terrain.mesh;
  if (ow.grass?.mesh) ow.grass.mesh.visible = ${grass};
  t.userData.v2Mat ??= t.material;
  if (${plainTerrain}) { t.userData.v2Plain ??= new THREE.MeshStandardMaterial({ color: 0x6f9a4a, roughness: 0.95 }); t.material = t.userData.v2Plain; }
  else t.material = t.userData.v2Mat;
  return true;
})()`;

export async function run(page, h) {
  const zone = process.env.V2G_ZONE ?? 'dawnmeadow';
  if (!await loadIn(page, h)) return;
  await goZone(page, h, zone, `perf-${zone}`, 0.5);
  await h.sleep(1500);
  const out = {};
  for (const [tag, grass, plain] of [['full', true, false], ['noGrass', false, false], ['plainTerrain', true, true], ['neither', false, true], ['full-again', true, false]]) {
    await page.evaluate(SET(grass, plain));
    await h.sleep(1200);
    out[tag] = await page.evaluate(FPS);
    console.log(`PERF ${zone} ${tag} fps=${out[tag]}`);
  }
  console.log('PERF SUMMARY', JSON.stringify(out));
}
