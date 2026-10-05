// v3 PERF debug: which prop instances inside the exact camera frustum are NOT
// drawn by the view sets, and why (distance / fog factor at their depth).
import { loadIn, goZone } from './integration-a.mjs';
const FACE = (face) => `(() => {
  const L = window.LF, w = L.game.overworld, p = w.player;
  p.teleport(p.pos.x, p.pos.z, ${face}); w.cameraRig.recenter?.();
  for (let i = 0; i < 12; i++) w.update(1 / 30);
  return true;
})()`;
const DBG = `(async () => {
  const THREE = await import('three');
  const w = window.LF.game.overworld, cam = w.camera, sc = w.scene;
  cam.updateMatrixWorld();
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const sets = w.props.group.userData.viewSets;
  const cp = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
  const v = new THREE.Vector3(), sph = new THREE.Sphere();
  const out = []; let drawnIn = 0, missing = 0;
  for (const s of sets) {
    const drawn = new Set();
    for (let j = 0; j < s.drawn; j++) drawn.add(s.order[j]);
    for (let i = 0; i < s.n; i++) {
      sph.center.set(s.sph[i*4], s.sph[i*4+1], s.sph[i*4+2]); sph.radius = s.sph[i*4+3];
      if (!fr.intersectsSphere(sph)) continue;
      if (drawn.has(i)) { drawnIn++; continue; }
      missing++;
      const d = sph.center.distanceTo(cp);
      v.copy(sph.center).applyMatrix4(cam.matrixWorldInverse);
      const depth = Math.max(0, -v.z - sph.radius);
      const fog = 1 - Math.exp(-((sc.fog.density * depth) ** 2));
      if (out.length < 40) out.push([s.kind, +d.toFixed(1), +sph.radius.toFixed(1), +depth.toFixed(1), +fog.toFixed(3)]);
    }
  }
  return JSON.stringify({ fog: sc.fog.density, drawnIn, missing, sample: out });
})()`;
export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  const zone = process.env.DBG_ZONE ?? 'whisperwood';
  await goZone(page, h, zone, `${zone}`, 0.45);
  const face0 = await page.evaluate(`window.LF.game.overworld.player.face ?? 0`);
  for (let k = 0; k < 4; k++) {
    await page.evaluate(FACE(face0 + k * Math.PI / 2));
    await h.sleep(500);
    console.log(`DBG ${zone} yaw${k}: ${await page.evaluate(DBG)}`);
  }
}
