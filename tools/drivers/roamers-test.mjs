// Wild Kindred along the roads: seeded save → Dawnmeadow (and ROAM_ZONES) →
// the population builds (census), roadside screenshots; then the mix in the
// last zone: a fierce one spots you ('!') and attacks by itself; a peaceful
// one lets you brush past, steps aside, and fights only when you press E; a
// sleeper shows z's, ignores you beside it and wakes into a fight if bumped.
// Each beaten one is gone with a replacement queued out of sight.
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
    for (const r of c.list) console.log(`   ${r.id} lv${r.lv} @${Math.round(r.x)},${Math.round(r.z)} ${r.temper}${r.state === 'sleep' ? ' asleep' : ''}${r.road ? ' road' : ''}`);
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

  // The mix, in the last zone: fierce ones start fights themselves; the
  // peaceful and the sleeping only when challenged with E.
  const c = await census(page);
  const asleep = c.list.filter((r) => r.state === 'sleep');
  console.log(`ROAM temperaments: ${['bold', 'shy', 'calm'].map((t) => `${t} ${c.list.filter((r) => r.temper === t).length}`).join(', ')}; asleep ${asleep.length}`);
  const heal = () => page.evaluate(`for (const m of window.LF.G.party) { m.hp = m.maxHp; m.status = null; }`);
  const promptText = () => page.evaluate(`document.querySelector('.hud-prompt.show .txt')?.textContent ?? null`);
  const respawning = async () => (await census(page)).respawning;
  async function winBattle(tag) {
    await h.sleep(3000);
    await h.shot(`${tag}-battle`);
    for (let i = 0; i < 160; i++) {
      await h.press('Enter'); await h.sleep(700);
      if (await page.evaluate(M('overworld'))) break;
    }
    for (let i = 0; i < 6; i++) { await h.press('Enter'); await h.sleep(300); }
    await h.waitFor(`window.LF.game.activeScene === ${W}`, 60000, 300);
    await gameWait(page, h, 3); // past the post-battle grace
  }

  // 1) a fierce, awake one: spots you, charges, battles on contact
  const fierce = c.list.find((r) => r.temper === 'bold' && r.state !== 'sleep');
  if (fierce) {
    await heal();
    const before = await respawning();
    await stand(page, h, fierce.x + 4.6, fierce.z, fierce.x, fierce.z + 2.8, 0.05);
    const spotted = await h.waitFor(`${W}.scene.children.some((o) => o.name === 'kindredAlert' && o.visible)`, 60000, 200);
    if (spotted) await h.shot('fierce-alert');
    const fought = await h.waitFor(M('battle'), 90000, 300);
    console.log(`ROAM fierce ${fierce.id}: spotted us ${!!spotted}, attacked by itself ${!!fought}`);
    if (!spotted || !fought) ok = false;
    if (fought) {
      await winBattle('fierce');
      const after = await respawning();
      console.log(`ROAM after beating it: respawning ${before} -> ${after}`);
      if (after <= before) ok = false;
    }
  } else console.log('ROAM (no awake fierce Kindred in this zone)');

  // 2) a peaceful one: brush right past it — no fight, it makes way; then E
  const calm = (await census(page)).list.find((r) => r.temper === 'calm' && r.state !== 'locked');
  if (calm) {
    await heal();
    await stand(page, h, calm.x + 1.0, calm.z, calm.x, calm.z + 1.5, 2.5);
    const st = await page.evaluate(`JSON.stringify({ mode: window.LF.game.mode, d: (() => { const r = ${W}.wildlife.census().list.find((q) => q.id === '${calm.id}' && Math.hypot(q.x - ${calm.x}, q.z - ${calm.z}) < 6); const p = ${W}.player.pos; return r ? Math.hypot(r.x - p.x, r.z - p.z) : null; })() })`).then(JSON.parse);
    const prompt = await promptText();
    console.log(`ROAM peaceful ${calm.id}: after 2.5 s at 1.0 m mode=${st.mode}, it stepped aside to ${st.d?.toFixed?.(2)} m, prompt "${prompt}"`);
    if (st.mode !== 'overworld' || !(st.d > 1.2) || !/^Battle /.test(prompt ?? '')) ok = false;
    await h.shot('peaceful-prompt');
    const before = await respawning();
    await h.press('KeyE');
    const fought = await h.waitFor(M('battle'), 60000, 300);
    console.log(`ROAM pressing E challenged it: ${!!fought}`);
    if (!fought) ok = false;
    else {
      await winBattle('chosen');
      const after = await respawning();
      if (after <= before) ok = false;
    }
  } else console.log('ROAM (no peaceful Kindred in this zone)');

  // 3) a sleeper: z's, no reaction beside it; bumping it wakes it into a fight
  const sleeper = (await census(page)).list.find((r) => r.state === 'sleep');
  if (sleeper) {
    await heal();
    await stand(page, h, sleeper.x + 1.9, sleeper.z, sleeper.x, sleeper.z + 1.2, 2.5);
    const st = await page.evaluate(`JSON.stringify({ mode: window.LF.game.mode, zzz: ${W}.scene.children.some((o) => o.name === 'kindredZzz' && o.visible) })`).then(JSON.parse);
    const prompt = await promptText();
    console.log(`ROAM sleeper ${sleeper.id}: beside it mode=${st.mode}, z's shown ${st.zzz}, prompt "${prompt}"`);
    if (st.mode !== 'overworld' || !st.zzz) ok = false;
    await h.shot('sleeper');
    await page.evaluate(`${W}.player.teleport(${sleeper.x + 0.6}, ${sleeper.z}, 0)`);
    const fought = await h.waitFor(M('battle'), 60000, 300);
    console.log(`ROAM bumping the sleeper woke it into a battle: ${!!fought}`);
    if (!fought) ok = false;
    else await winBattle('sleeper');
  } else console.log('ROAM (no sleeper in this zone)');

  console.log('ROAM RESULT:', ok ? 'PASS' : 'FAIL');
}
