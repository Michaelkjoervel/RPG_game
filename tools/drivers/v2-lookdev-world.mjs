// v2 LOOK-DEV world driver: seeded save -> Brighthollow (default view, Warden
// back + front close-ups, nearest-NPC close-up) -> Dawnmeadow (default view,
// a live-scene creature line-up with close-ups). Prints renderer stats for
// both zones (one direct scene render with info.autoReset off, so shadow +
// scene draw calls are counted — the composer's last pass would read 1 call).
//   QA_BEAUTY=1 QA_VIEWPORT=1120x630 node tools/shoot.mjs tools/drivers/v2-lookdev-world.mjs <out>
// LOOK_PART=a -> Brighthollow only, LOOK_PART=b -> Dawnmeadow only (both by default).
import { loadIn, goZone } from './integration-a.mjs';

const PART = process.env.LOOK_PART ?? 'ab';

export const STATS = `(() => {
  const g = window.LF.game, r = g.renderer, s = g.activeScene;
  if (!s || !s.scene || !s.camera) return 'n/a';
  const auto = r.info.autoReset;
  r.info.autoReset = false; r.info.reset();
  r.render(s.scene, s.camera);
  const o = { calls: r.info.render.calls, triangles: r.info.render.triangles,
    programs: (r.info.programs || []).length, geometries: r.info.memory.geometries, textures: r.info.memory.textures };
  r.info.autoReset = auto;
  return JSON.stringify(o);
})()`;

// Linear-HDR luminance stats of the live frame (FloatType target, no tone
// mapping) — where to put the bloom threshold so only glow content blooms.
export const LUMA = `(async () => {
  const THREE = await import('/vendor/three.module.js');
  const g = window.LF.game, r = g.renderer, s = g.activeScene;
  if (!s || !s.scene || !s.camera) return 'n/a';
  const W = 320, H = 180;
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType });
  const prev = r.getRenderTarget();
  r.setRenderTarget(rt); r.render(s.scene, s.camera); r.setRenderTarget(prev);
  const buf = new Float32Array(W * H * 4);
  r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  rt.dispose();
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = 0.2126 * buf[i * 4] + 0.7152 * buf[i * 4 + 1] + 0.0722 * buf[i * 4 + 2];
  const sorted = Array.from(L).sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(3);
  let over = 0; for (const v of L) if (v > 1.08) over++;
  return JSON.stringify({ p50: q(0.5), p90: q(0.9), p99: q(0.99), p999: q(0.999), max: sorted[sorted.length - 1].toFixed(3), over108: (over / L.length * 100).toFixed(2) + '%' });
})()`;

const HUD = (on) => `(() => { const u = document.getElementById('ui-root'); if (u) u.style.visibility = ${on ? "''" : "'hidden'"}; return true; })()`;
const PAUSE = (on) => `(() => { window.LF.game._paused = ${on}; return true; })()`;

// Camera offset in the Warden's local frame: dx right, dy up, dz forward.
const WARDEN_VIEW = (dx, dy, dz, ty) => `(() => {
  const w = window.LF.game.overworld, p = w.player.object3D.position, f = w.player.face;
  const c = w.camera, cs = Math.cos(f), sn = Math.sin(f);
  c.position.set(p.x + (${dx}) * cs + (${dz}) * sn, p.y + (${dy}), p.z - (${dx}) * sn + (${dz}) * cs);
  c.lookAt(p.x, p.y + ${ty}, p.z);
  return true;
})()`;

const NPC_VIEW = (rank, dist, side) => `(() => {
  const w = window.LF.game.overworld, pp = w.player.object3D.position;
  const list = [];
  w.scene.traverse((o) => { if (o.name === 'npc') list.push(o); });
  list.sort((a, b) => a.position.distanceTo(pp) - b.position.distanceTo(pp));
  const n = list[${rank}];
  if (!n) return 'no npc';
  const f = n.rotation.y, p = n.position, fx = Math.sin(f), fz = Math.cos(f);
  const c = w.camera;
  c.position.set(p.x + fx * ${dist} + fz * ${side}, p.y + 1.45, p.z + fz * ${dist} - fx * ${side});
  c.lookAt(p.x, p.y + 1.0, p.z);
  return 'npc#${rank} at ' + n.position.distanceTo(pp).toFixed(1) + 'm';
})()`;

const LINEUP = (ids) => `(async () => {
  const w = window.LF.game.overworld;
  const THREE = await import('/vendor/three.module.js');
  const { buildCreature } = await import('/src/creatures/registry.js');
  const p = w.player.object3D.position, f = w.player.face;
  const fx = Math.sin(f), fz = Math.cos(f);
  const c = w.camera;
  c.position.set(p.x + fx * 0.6, p.y + 1.6, p.z + fz * 0.6);
  const cx = p.x + fx * 5.6, cz = p.z + fz * 5.6;
  c.lookAt(cx, p.y + 0.45, cz);
  c.updateMatrixWorld(true);
  const right = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 0).setY(0).normalize();
  const ids = ${JSON.stringify(ids)};
  window.__lineup = [];
  ids.forEach((id, i) => {
    const { group, animator } = buildCreature(id);
    const off = (i - (ids.length - 1) / 2) * 1.35;
    const x = cx + right.x * off, z = cz + right.z * off;
    const y = w.heightAt(x, z);
    group.position.set(x, y, z);
    group.lookAt(c.position.x, y, c.position.z); // +Z (the face) toward the lens
    w.scene.add(group);
    try { animator.update(0.016); } catch (e) {}
    window.__lineup.push(group);
  });
  w.player.object3D.visible = false;
  return ids.length + ' f=' + f.toFixed(2);
})()`;

const LINEUP_CLOSE = (i, dist, h) => `(async () => {
  const w = window.LF.game.overworld, g = window.__lineup[${i}];
  if (!g) return false;
  const THREE = await import('/vendor/three.module.js');
  const d = g.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  const side = new THREE.Vector3(d.z, 0, -d.x);
  const p = g.position, c = w.camera;
  c.position.set(p.x + d.x * ${dist} + side.x * 0.7, p.y + ${h}, p.z + d.z * ${dist} + side.z * 0.7);
  c.lookAt(p.x, p.y + ${h} * 0.45, p.z);
  return true;
})()`;

export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  if (PART.includes('a')) {
    await h.sleep(1500);
    await h.shot('bh-default');
    console.log('STATS brighthollow:', await page.evaluate(STATS));
    console.log('LUMA brighthollow:', await page.evaluate(LUMA));
    await page.evaluate(HUD(false));
    await page.evaluate(PAUSE(true));
    await page.evaluate(WARDEN_VIEW(0.35, 1.45, -2.6, 0.95)); await h.sleep(700);
    await h.shot('bh-warden-back');
    await page.evaluate(WARDEN_VIEW(-1.3, 1.25, 2.1, 1.0)); await h.sleep(700);
    await h.shot('bh-warden-front');
    console.log('NPC0:', await page.evaluate(NPC_VIEW(0, 2.6, 0.9))); await h.sleep(700);
    await h.shot('bh-npc-a');
    console.log('NPC1:', await page.evaluate(NPC_VIEW(1, -2.4, 0.8))); await h.sleep(700);
    await h.shot('bh-npc-b-back');
    await page.evaluate(PAUSE(false));
    await page.evaluate(HUD(true));
  }
  if (PART.includes('b')) {
    await goZone(page, h, 'dawnmeadow', 'dm-default', 0.5);
    console.log('STATS dawnmeadow:', await page.evaluate(STATS));
    console.log('LUMA dawnmeadow:', await page.evaluate(LUMA));
    await page.evaluate(HUD(false));
    await page.evaluate(PAUSE(true));
    console.log('LINEUP:', await page.evaluate(LINEUP(['kindlet', 'nixling', 'thistlit', 'pebbin', 'vellit', 'aurelark'])));
    await h.sleep(900);
    await h.shot('dm-lineup');
    await page.evaluate(LINEUP_CLOSE(0, 1.5, 0.75)); await h.sleep(600);
    await h.shot('dm-kindlet-close');
    await page.evaluate(LINEUP_CLOSE(3, 1.6, 0.8)); await h.sleep(600);
    await h.shot('dm-pebbin-close');
    console.log('STATS dawnmeadow+lineup:', await page.evaluate(STATS));
    await page.evaluate(PAUSE(false));
  }
}
