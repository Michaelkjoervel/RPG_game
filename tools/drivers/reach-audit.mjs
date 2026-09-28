// Reachability audit: for every zone, flood-fill the walkable grid from the
// spawn using the game's own rules (world.heightAt incl. decks over water,
// MAX_WADE_DEPTH 0.5, circle colliders, zone bounds) and report every NPC,
// interactable and portal the player cannot get within interaction range of.
// Catches "merchant stands in deep water" / "chest behind a fence" bugs that
// screenshots never show.
import { loadIn } from './integration-a.mjs';

const ZONES = ['brighthollow', 'dawnmeadow', 'whisperwood', 'gloamcavern', 'mirrorlake',
  'skyreach', 'sunkenruins', 'hollowspire', 'starfallglade'];

const AUDIT = (zone) => `(() => {
  const w = window.LF.game.overworld, z = w.zone;
  const STEP = 0.5, PR = 0.32, WADE = 0.5;
  const half = (z.size ?? 200) / 2 - 1;
  const n = Math.ceil((half * 2) / STEP) + 1;
  const toI = (v) => Math.round((v + half) / STEP);
  const toW = (i) => i * STEP - half;
  const wat = z.water;
  const depth = (x, zz) => {
    if (!wat) return 0;
    const wx = wat.pos?.[0] ?? 0, wz = wat.pos?.[1] ?? 0, h = (wat.size ?? 0) / 2;
    if (Math.abs(x - wx) > h || Math.abs(zz - wz) > h) return 0;
    return Math.max(0, (wat.level ?? 0) - w.heightAt(x, zz));
  };
  const cols = w.colliders ?? [];
  const free = (x, zz) => {
    if (depth(x, zz) > WADE) return false;
    for (const c of cols) { const dx = x - c.x, dz = zz - c.z, r = (c.r ?? 0) + PR; if (dx * dx + dz * dz < r * r) return false; }
    return true;
  };
  const seen = new Uint8Array(n * n);
  const sp = w.player?.pos ?? { x: z.spawn[0], z: z.spawn[1] };
  let q = [[toI(sp.x), toI(sp.z)]], head = 0;
  seen[q[0][1] * n + q[0][0]] = 1;
  while (head < q.length) {
    const [i, j] = q[head++];
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const k = b * n + a; if (seen[k]) continue;
      seen[k] = 1;
      if (free(toW(a), toW(b))) q.push([a, b]); else seen[k] = 2;
    }
  }
  const reach = (x, zz, R) => {
    const r = Math.ceil(R / STEP), ci = toI(x), cj = toI(zz);
    for (let a = ci - r; a <= ci + r; a++) for (let b = cj - r; b <= cj + r; b++) {
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      if ((toW(a) - x) ** 2 + (toW(b) - zz) ** 2 > R * R) continue;
      if (seen[b * n + a] === 1) return true;
    }
    return false;
  };
  const bad = [];
  for (const p of z.npcs ?? []) if (!reach(p.at[0], p.at[1], 2.2)) bad.push('npc ' + p.id + ' @' + p.at);
  for (const it of z.interactables ?? []) if (!reach(it.at[0], it.at[1], 1.8)) bad.push(it.kind + ' ' + (it.flag ?? '') + ' @' + it.at);
  for (const pt of z.portals ?? []) if (!reach(pt.at[0], pt.at[1], (pt.radius ?? 3))) bad.push('portal->' + pt.to + ' @' + pt.at);
  // Optional ASCII map of a window (REACH_MAP="zone:x0,z0,x1,z1"), 1 m/char:
  // '.' reachable, '#' blocked/unreached, '~' deep water.
  let map = null;
  const MW = ${JSON.stringify(process.env.REACH_MAP ?? '')};
  if (MW.startsWith('${zone}:')) {
    const [x0, z0, x1, z1] = MW.split(':')[1].split(',').map(Number);
    map = [];
    for (let zz = z0; zz <= z1; zz++) {
      let row = String(zz).padStart(4) + ' ';
      for (let x = x0; x <= x1; x++) {
        const k = toI(zz) * n + toI(x);
        row += seen[k] === 1 ? '.' : depth(x, zz) > WADE ? '~' : '#';
      }
      map.push(row);
    }
  }
  return JSON.stringify({ zone: '${zone}', reachedCells: q.length, bad, map });
})()`;

export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  const only = process.env.REACH_ZONES ? process.env.REACH_ZONES.split(',') : ZONES;
  for (const zone of only) {
    // Zone entry can run a story scene that waits for dialogue to be clicked
    // through (the load promise settles only after it) — keep advancing it.
    page.evaluate(`window.__zoneDone = null; window.LF.game.enterOverworld('${zone}').then(() => { window.__zoneDone = '${zone}'; })`).catch(() => {});
    let ok = false;
    for (let t = 0; t < 80 && !ok; t++) {
      ok = await page.evaluate(`window.__zoneDone === '${zone}'`).catch(() => false);
      if (!ok) { await h.press('Enter'); await h.sleep(1500); }
    }
    if (!ok) { console.log('REACH', zone, 'LOAD TIMEOUT'); continue; }
    await h.sleep(600);
    const res = await page.evaluate(AUDIT(zone)).catch((e) => JSON.stringify({ zone, error: e.message }));
    const parsed = (() => { try { return JSON.parse(res); } catch { return null; } })();
    if (parsed?.map) { console.log('MAP', zone); for (const r of parsed.map) console.log('MAP', r); delete parsed.map; }
    console.log('REACH', parsed ? JSON.stringify(parsed) : res);
  }
}
