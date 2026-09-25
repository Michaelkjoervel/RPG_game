// WORLD DRESSING (visual pass v2) evidence driver: zone views, fixed-camera
// close-ups, a night shot, render stats and a held-key walk test per zone.
// Same cameras for BEFORE and AFTER. Select a subset with DRESS_SET:
//   A = brighthollow (+ night) and dawnmeadow (+ close tree/rock)
//   B = whisperwood and mirrorlake
//   or a comma list of view names (e.g. DRESS_SET=bh-plaza,dm-oak).
// Usage: QA_BEAUTY=1 node tools/shoot.mjs tools/drivers/v2-dressing-shots.mjs <outDir>
import { loadIn, goZone } from './integration-a.mjs';

// Per zone: time of day, fixed-camera views [name, camera xyz (y above ground), look-at xyz
// (y above ground)], and the main-path walk (face toward a path waypoint).
const ZONES = {
  brighthollow: {
    t: 0.5, set: 'A',
    views: [
      ['bh-plaza', [20, 13, 30], [0, 1, 0]],
      ['bh-street', [-6, 3.2, 14], [-26, 2, 2]],
      ['bh-gate', [62, 3.5, -8], [38, 1.5, 2]],
      ['bh-map', [0.1, 150, 12], [0, 0, 0]],
    ],
    walkTo: [72, 0],
    night: { t: 0.93, views: [['bh-night', [20, 13, 30], [0, 1, 0]]] },
  },
  dawnmeadow: {
    t: 0.5, set: 'A',
    views: [
      ['dm-gate', [-92, 2.6, 3], [-50, 2, 6]],
      ['dm-oak', [19, 2.2, 28], [25, 2.4, 22]],
      ['dm-rock', [-11, 1.4, 31], [-8, 0.4, 28]],
      ['dm-map', [0.1, 190, 16], [0, 0, 0]],
    ],
    walkTo: [0, -50],
  },
  whisperwood: {
    t: 0.45, set: 'B',
    views: [['ww-trail', [6, 3, 96], [22, 2, 50]], ['ww-map', [0.1, 200, 16], [0, 0, 0]]],
    walkTo: [10, 70],
  },
  mirrorlake: {
    t: 0.5, set: 'B',
    views: [['ml-driftmoor', [40, 6, 60], [66, 1.5, 76]], ['ml-map', [0.1, 220, 16], [0, 0, 0]]],
    walkTo: [-42, 50],
  },
};

const SET = process.env.DRESS_SET ?? 'A';

async function stats(page, tag) {
  const s = await page.evaluate(`(() => {
    const g = window.LF.game, w = g.overworld, r = g.renderer;
    r.info.autoReset = false; r.info.reset();
    r.render(w.scene, w.camera);
    const full = { calls: r.info.render.calls, tris: r.info.render.triangles };
    r.info.autoReset = true;
    let meshes = 0, inst = 0, tris = 0;
    w.props?.group.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const n = o.isInstancedMesh ? o.count : 1;
      inst += n;
      const gg = o.geometry;
      tris += ((gg.index ? gg.index.count : gg.attributes.position.count) / 3) * n;
    });
    const byKind = {};
    w.props?.group.traverse((o) => {
      if (!o.isMesh) return;
      const k = (o.name || '?').split(':')[0], gg = o.geometry;
      byKind[k] = (byKind[k] ?? 0) + ((gg.index ? gg.index.count : gg.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    const top = Object.entries(byKind).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, t]) => k + '=' + Math.round(t / 1000) + 'k').join(' ');
    return JSON.stringify({ full, live: { ...r.info.render }, props: { meshes, inst, tris: Math.round(tris), top }, colliders: w.colliders.length, dressing: w.props?.group.userData.dressing });
  })()`);
  console.log(`STATS ${tag} ${s}`);
}

async function camView(page, h, name, pos, look) {
  const map = name.endsWith('-map');
  await page.evaluate(`(() => {
    const w = window.LF.game.overworld, rig = w.cameraRig;
    if (${map} && w.scene.fog && !w.__fog) { const f = w.scene.fog.clone(); f.density = 0.0007; w.__fog = w.scene.fog; w.scene.fog = f; }
    if (!rig._dressUpd) rig._dressUpd = rig.update;
    rig.update = () => {};
    const c = rig.camera, H = (x, z) => w.heightAt(x, z);
    c.position.set(${pos[0]}, H(${pos[0]}, ${pos[2]}) + ${pos[1]}, ${pos[2]});
    c.lookAt(${look[0]}, H(${look[0]}, ${look[2]}) + ${look[1]}, ${look[2]});
    c.updateMatrixWorld();
  })()`);
  await h.sleep(900);
  await h.shot(name);
  await stats(page, name);
  if (map) await page.evaluate(`(() => { const w = window.LF.game.overworld; if (w.__fog) { w.scene.fog = w.__fog; delete w.__fog; } })()`);
}

async function releaseCam(page) {
  await page.evaluate(`(() => {
    const rig = window.LF.game.overworld.cameraRig;
    if (rig._dressUpd) { rig.update = rig._dressUpd; delete rig._dressUpd; }
    rig.recenter?.();
  })()`);
}

async function walk(page, h, zone, to) {
  const pos = () => page.evaluate(`JSON.stringify((() => { const p = window.LF.game.overworld.player.pos; return [+p.x.toFixed(2), +p.z.toFixed(2)]; })())`).then(JSON.parse);
  await page.evaluate(`(() => {
    const w = window.LF.game.overworld, p = w.player;
    const f = Math.atan2(${to[0]} - p.pos.x, ${to[1]} - p.pos.z);
    p.teleport(p.pos.x, p.pos.z, f);
    w.cameraRig.recenter?.();
  })()`);
  await h.sleep(300);
  const a = await pos();
  await h.hold('ArrowUp', 4000);
  await h.sleep(300);
  const b = await pos();
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  console.log(`WALK ${zone} from ${JSON.stringify(a)} to ${JSON.stringify(b)} moved ${d.toFixed(2)}m ${d > 4 ? 'OK' : 'FAIL'}`);
  await h.shot(`${zone}-walked`);
}

export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  const pick = (name, set) => SET === set || SET.split(',').includes(name);
  for (const [zone, Z] of Object.entries(ZONES)) {
    const views = Z.views.filter(([n]) => pick(n, Z.set));
    const nightViews = (Z.night?.views ?? []).filter(([n]) => pick(n, Z.set));
    const spawnShot = pick(`${zone}-spawn`, Z.set);
    const walkIt = pick(`${zone}-walk`, Z.set);
    if (!views.length && !nightViews.length && !spawnShot && !walkIt) continue;
    await goZone(page, h, zone, `${zone}-spawn`, Z.t);
    await stats(page, `${zone}-spawn`);
    for (const [n, p, l] of views) await camView(page, h, n, p, l);
    if (nightViews.length) {
      await page.evaluate(`window.LF.G.calendar.dayTime = ${Z.night.t}`);
      await h.sleep(1500);
      for (const [n, p, l] of nightViews) await camView(page, h, n, p, l);
      await page.evaluate(`window.LF.G.calendar.dayTime = ${Z.t}`);
      await h.sleep(600);
    }
    await releaseCam(page);
    if (walkIt) await walk(page, h, zone, Z.walkTo);
  }
}
