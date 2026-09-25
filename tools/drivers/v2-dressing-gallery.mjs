// WORLD DRESSING (visual pass v2): prop gallery. Builds every prop kind in
// rows on Brighthollow's flat ground (zone props hidden) and shoots each row
// from a fixed camera. Select rows with GALLERY=trees,rocks,... (default all).
// Usage: QA_BEAUTY=1 QA_VIEWPORT=1120x630 node tools/shoot.mjs tools/drivers/v2-dressing-gallery.mjs <outDir>
import { loadIn } from './integration-a.mjs';

const ROWS = {
  trees: ['tree_oak', 'tree_birch', 'tree_pine', 'tree_willow', 'tree_glow', 'tree_dead'],
  under: ['bush', 'berry_bush', 'flower_patch', 'fern', 'grass_tuft', 'mushroom_cluster', 'mushroom_giant', 'reeds'],
  rocks: ['rock', 'rock_mossy', 'rock_crystal', 'crystal_cluster', 'stump', 'log', 'snow_pile', 'lava_rock', 'ice_spike', 'stalagmite'],
  town: ['house_small', 'house_large', 'shop_stall', 'well', 'fence', 'lamp_post', 'cart'],
  bits: ['crate', 'barrel', 'shrine_stone', 'campfire', 'tent', 'banner', 'statue_warden'],
  ruins: ['ruin_pillar', 'ruin_arch', 'ruin_wall', 'spire_wall', 'ember_vent'],
  extra: (process.env.GALLERY_EXTRA ?? '').split(',').filter(Boolean),
};
const SPACING = { trees: 6, under: 3.2, rocks: 3.2, town: 7.5, bits: 3.6, ruins: 6.5, extra: 7 };

export async function run(page, h) {
  if (!await loadIn(page, h)) return;
  const want = (process.env.GALLERY ?? 'trees,under,rocks,town,bits,ruins').split(',');
  const dayTime = +(process.env.GALLERY_T ?? 0.5);
  await page.evaluate(`window.LF.G.calendar.dayTime = ${dayTime}`);
  for (const row of want) {
    const kinds = ROWS[row];
    if (!kinds?.length) continue;
    const sp = SPACING[row];
    const z0 = 44; // open lawn south of the plaza
    const x0 = -((kinds.length - 1) * sp) / 2;
    const props = kinds.map((k, i) => ({ kind: k, at: [x0 + i * sp, z0], rot: Math.PI * 0.08 }));
    const res = await page.evaluate(`(async () => {
      const w = window.LF.game.overworld;
      const { buildProps } = await import('/src/world/props.js');
      if (w.props) w.props.group.visible = false;
      if (window.__gal) { w.scene.remove(window.__gal.group); window.__gal.dispose(); }
      const zone = { id: 'gallery', size: 160, biome: 'town', terrain: { seed: 5 }, paths: [], water: null,
        props: ${JSON.stringify(props)} };
      const g = buildProps(zone, (x, z) => w.heightAt(x, z));
      window.__gal = g;
      w.scene.add(g.group);
      // run its updaters with the world clock
      const u = w.update.bind(w);
      if (!w.__galHooked) { w.__galHooked = true; w.update = (dt) => { u(dt); for (const f of (window.__gal?.updaters ?? [])) f(dt, w._time); }; }
      // park the player + follower out of frame
      w.player?.teleport(-60, 70, 0);
      const rig = w.cameraRig;
      if (!rig._dressUpd) rig._dressUpd = rig.update;
      rig.update = () => {};
      let tris = 0, meshes = 0;
      g.group.traverse((o) => { if (!o.isMesh) return; meshes++; const gg = o.geometry; tris += ((gg.index ? gg.index.count : gg.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1); });
      return JSON.stringify({ meshes, tris: Math.round(tris) });
    })()`);
    console.log(`GALLERY ${row} ${res}`);
    const span = (kinds.length - 1) * sp;
    const back = Math.max(8, span * 0.5 + 3);
    const camY = row === 'trees' || row === 'town' || row === 'ruins' ? 4.2 : 2.4;
    const lookY = row === 'trees' || row === 'town' || row === 'ruins' ? 2.4 : 0.6;
    await page.evaluate(`(() => {
      const w = window.LF.game.overworld, c = w.cameraRig.camera;
      c.position.set(0, w.heightAt(0, ${z0 + back}) + ${camY}, ${z0 + back});
      c.lookAt(0, w.heightAt(0, ${z0}) + ${lookY}, ${z0});
      c.updateMatrixWorld();
    })()`);
    await h.sleep(1200);
    await h.shot(`gal-${row}`);
    if (process.env.GALLERY_NIGHT && (row === 'town' || row === 'bits')) {
      await page.evaluate(`window.LF.G.calendar.dayTime = 0.93`);
      await h.sleep(1500);
      await h.shot(`gal-${row}-night`);
      await page.evaluate(`window.LF.G.calendar.dayTime = ${dayTime}`);
    }
    if (process.env.GALLERY_CLOSE) {
      // close-up of the first two kinds of the row
      const cx = x0 + sp * 0.5;
      await page.evaluate(`(() => {
        const w = window.LF.game.overworld, c = w.cameraRig.camera;
        c.position.set(${cx}, w.heightAt(${cx}, ${z0 + sp * 1.3}) + ${camY * 0.8}, ${z0 + sp * 1.3});
        c.lookAt(${cx}, w.heightAt(${cx}, ${z0}) + ${lookY}, ${z0});
        c.updateMatrixWorld();
      })()`);
      await h.sleep(900);
      await h.shot(`gal-${row}-close`);
    }
  }
}
