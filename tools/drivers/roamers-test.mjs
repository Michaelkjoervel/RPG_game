// Wild Kindred along the roads: seeded save → Dawnmeadow (and ROAM_ZONES) →
// the population builds (census), roadside screenshots, then step near a bold
// one: it spots you ('!'), closes in, a battle starts; win it → that Kindred
// is gone and a replacement is queued out of sight.
//   ROAM_ZONES=dawnmeadow,whisperwood node tools/shoot.mjs tools/drivers/roamers-test.mjs <outDir>
import { loadIn } from './integration-a.mjs';

const W = 'window.LF.game.overworld';
const M = (m) => `window.LF?.game.mode === '${m}'`;
const ZONES = (process.env.ROAM_ZONES ?? 'dawnmeadow').split(',');

async function gameWait(page, h, secs) {
  const t0 = await page.evaluate(`${W}._time`);
  await h.waitFor(`${W}._time > ${t0 + secs}`, 120000, 300);
}
async function stand(page, h, x, z, tx, tz, secs = 1.4) {
  await page.evaluate(`${W}.player.teleport(${x}, ${z}, Math.atan2(${tx - x}, ${tz - z})); ${W}.cameraRig.recenter()`);
  await gameWait(page, h, secs);
}
const census = (page) => page.evaluate(`JSON.stringify(${W}.wildlife?.census?.() ?? null)`).then(JSON.parse);

// nearest point on any road to (x, z)
const nearestRoad = (page, x, z) => page.evaluate(`(() => {
  let best = null, bd = Infinity;
  for (const p of ${W}.zone.paths ?? []) {
    const [ax, az] = p.from, [bx, bz] = p.to, vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((${x} - ax) * vx + (${z} - az) * vz) / l2));
    const px = ax + vx * t, pz = az + vz * t, d = (px - ${x}) ** 2 + (pz - ${z}) ** 2;
    if (d < bd) { bd = d; best = [px, pz]; }
  }
  return best;
})()`);

async function enter(page, h, zone) {
  page.evaluate(`window.LF.game.enterOverworld('${zone}')`).catch(() => {});
  await h.waitFor(`${M('overworld')} && ${W}.zone?.id === '${zone}' && !!${W}.player && window.LF.game.activeScene === ${W}`, 120000, 300);
  for (let i = 0; i < 4; i++) { await h.press('Enter'); await h.sleep(250); }
  await h.waitFor(`(${W}.wildlife?.census?.().pending ?? 1) === 0`, 120000, 400);
  await gameWait(page, h, 1);
}

export async function run(page, h) {
  if (!await loadIn(page, h)) { console.log('ROAM RESULT: FAIL (load)'); return; }
  let ok = true;
  for (const zone of ZONES) {
    await enter(page, h, zone);
    const c = await census(page);
    const info = await page.evaluate(`(() => { const i = window.LF.game.renderer.info.render; return i.triangles + ' tris, ' + i.calls + ' calls'; })()`);
    console.log(`ROAM ${zone} census: built ${c.built}, drawn ${c.drawn}, pending ${c.pending} | frame: ${info}`);
    for (const r of c.list) console.log(`   ${r.id} lv${r.lv} @${r.x},${r.z} ${r.temper}${r.road ? ' road' : ''}`);
    // towns and scripted zones have no wild table, and so no roamers
    const wild = await page.evaluate(`(${W}.zone.encounters?.table ?? []).length > 0`);
    if (wild ? c.built < 4 : c.built !== 0) { ok = false; console.log(`ROAM ${zone}: unexpected population`); }

    // two roadside views: stand on the road ~11 m short of a roadside Kindred
    const road = c.list.filter((r) => r.road);
    for (const [i, r] of road.slice(0, 2).entries()) {
      const [rx, rz] = await nearestRoad(page, r.x, r.z);
      const dx = rx - r.x, dz = rz - r.z, d = Math.hypot(dx, dz) || 1;
      // back off along the road-to-creature line so it sits ahead of the camera
      const sx = r.x + (dx / d) * 10, sz = r.z + (dz / d) * 10;
      // look a little past it so the Warden's back doesn't cover it
      await stand(page, h, sx, sz, r.x - (dz / d) * 3.5, r.z + (dx / d) * 3.5, 1.2);
      await h.shot(`${zone}-roadside-${i + 1}-${r.id}`);
    }
  }

  // contact: step near a bold one in the last zone
  const c = await census(page);
  // a bold one spots you from afar; a calm one only notices at arm's length
  const bold = c.list.find((r) => r.temper === 'bold') ?? c.list.find((r) => r.temper === 'calm');
  if (!bold) { console.log('ROAM RESULT: FAIL (no roamer)'); return; }
  await page.evaluate(`for (const m of window.LF.G.party) { m.hp = m.maxHp; m.status = null; }`);
  const gap = bold.temper === 'bold' ? 4.6 : 2.2;
  await stand(page, h, bold.x + gap, bold.z, bold.x, bold.z + gap * 0.6, 0.05);
  if (bold.temper === 'bold') {
    const spotted = await h.waitFor(`${W}.scene.children.some((o) => o.name === 'kindredAlert' && o.visible)`, 60000, 200);
    console.log('ROAM bold one spotted us (! shown):', !!spotted, `(${bold.id})`);
    if (spotted) await h.shot('alert'); else ok = false;
  } else console.log('ROAM no bold Kindred here — walking up to a calm one:', bold.id);
  const fought = await h.waitFor(M('battle'), 90000, 300);
  console.log('ROAM contact started a battle:', !!fought);
  if (!fought) { ok = false; await h.shot('no-battle'); }
  else {
    await h.sleep(4000);
    await h.shot('battle');
    for (let i = 0; i < 160; i++) {
      await h.press('Enter'); await h.sleep(700);
      if (await page.evaluate(M('overworld'))) break;
    }
    for (let i = 0; i < 6; i++) { await h.press('Enter'); await h.sleep(300); }
    await h.waitFor(`window.LF.game.activeScene === ${W}`, 60000, 300);
    await gameWait(page, h, 1);
    const after = await census(page);
    const still = after.list.some((r) => r.id === bold.id && Math.hypot(r.x - bold.x, r.z - bold.z) < 6);
    console.log(`ROAM after battle: built ${after.built}, respawning ${after.respawning}, beaten one still there: ${still}`);
    if (after.respawning < 1) ok = false;
    await h.shot('after-battle');
  }
  console.log('ROAM RESULT:', ok ? 'PASS' : 'FAIL');
}
